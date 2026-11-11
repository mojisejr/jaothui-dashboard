/** @jest-environment node */
import { editRetry, editTiming, type JournalEvent } from "../progress";
import { OperationEngine } from "../../operations/engine";
import {
  domain,
  fakeChain,
  memoryRepository,
  plan,
} from "../../operations/testing-fixtures";
import { PublicationReadbackError } from "../../operations/hash";
import { type Operation, type Step } from "../../operations/types";
const row = (
  kind: string,
  ms: number,
  extra: Partial<JournalEvent> = {},
): JournalEvent => ({
  kind,
  reason: null,
  created_at: new Date(ms),
  step_id: null,
  ...extra,
});
const pending = (ms: number) =>
  row("RECOVERY_REQUIRED", ms, { reason: "PUBLIC_ASSET_READBACK_PENDING" });
test("elapsed excludes draft idle time and the interval awaiting recovery; duplicate confirmations add no phase", () => {
  const events = [
    row("DRAFT_CREATED", 0),
    row("EDIT_PREPARING", 10000),
    row("READY", 13000),
    row("STEP_CONFIRMED", 14000, { step_id: "a" }),
    row("STEP_CONFIRMED", 15000, { step_id: "a" }),
    row("PROJECTING", 16000),
    pending(17000),
    row("EDIT_PUBLICATION_ATTEMPT", 23000),
    row("COMPLETED", 24000),
  ];
  expect(editTiming(events, 30000)).toMatchObject({
    phases: [3000, 3000, 2000],
    currentPhase: null,
    lastProgressAt: new Date(24000).toISOString(),
  });
  expect(
    editTiming([row("DRAFT_CREATED", 0), row("READY", 5000)], 9000).phases,
  ).toEqual([null, 4000, null]);
});
test("retry count and deadline survive refresh; unrelated recovery is not eligible", () => {
  const history = [
    pending(1000),
    row("EDIT_PUBLICATION_ATTEMPT", 6000),
    pending(9000),
  ];
  expect(editRetry(history, "autoPublication", 10000)).toMatchObject({
    attempts: 1,
    nextAt: new Date(21000).toISOString(),
    exhausted: false,
  });
  expect(editRetry(history, "autoPublication", 301000)?.exhausted).toBe(true);
  const exhausted = [
    ...history,
    ...[21000, 51000, 111000].map((ms) => row("EDIT_PUBLICATION_ATTEMPT", ms)),
  ];
  expect(editRetry(exhausted, "autoPublication", 112000)).toMatchObject({
    exhausted: true,
    nextAt: null,
  });
  expect(
    editRetry(
      [row("RECOVERY_REQUIRED", 1000, { reason: "REORG_UNCERTAINTY" })],
      "autoPublication",
      2000,
    ),
  ).toBeNull();
});
test("the last attempt still owning its lease remains in progress until success, release or expiry", () => {
  const attempts = [
    pending(0),
    ...[5000, 20000, 50000, 110000].map((ms) =>
      row("EDIT_PUBLICATION_ATTEMPT", ms),
    ),
  ];
  const last = attempts.at(-1)!;
  last.live_attempt = true;
  last.lease_until = new Date(185000);
  expect(editRetry(attempts, "autoPublication", 111000)).toMatchObject({
    attempts: 4,
    exhausted: false,
    nextAt: last.lease_until.toISOString(),
  });
  expect(editRetry(attempts, "autoPublication", 185000)?.exhausted).toBe(true);
  last.live_attempt = false;
  expect(editRetry(attempts, "autoPublication", 111000)?.exhausted).toBe(true);
});
test("pending hash ages into bounded observation; signing the next transaction gets its own window", () => {
  const history = [
    row("SIGNED_BEFORE_BROADCAST", 1000),
    row("CHAIN_PENDING", 2000),
  ];
  expect(editRetry(history, "autoReconcile", 20000)).toBeNull();
  expect(editRetry(history, "autoReconcile", 181000)?.nextAt).toBe(
    new Date(186000).toISOString(),
  );
  const next = [
    ...history,
    row("BROADCAST_UNKNOWN", 182000),
    row("EDIT_RECONCILE_ATTEMPT", 190000),
    row("SIGNED_BEFORE_BROADCAST", 200000),
  ];
  expect(editRetry(next, "autoReconcile", 201000)).toBeNull();
});
async function recoveryFixture() {
  const mem = memoryRepository(),
    chain = fakeChain();
  const engine = new OperationEngine(mem.repo, chain);
  const op = await engine.create(
    "shared:owner",
    "edit-one",
    { kind: "edit", microchip: "111", tokenId: "19", patch: { name: "New" } },
    domain,
  );
  const rec = mem.rows.get(op.id)!;
  Object.assign(rec, {
    state: "RECOVERY_REQUIRED",
    reason: "PUBLIC_ASSET_READBACK_PENDING",
    plan,
  });
  const hash = "0x" + "11".repeat(32);
  const receipt = {
    transactionHash: hash,
    blockHash: "0xabc",
    blockNumber: "123",
    status: "success" as const,
  };
  const step = {
    id: "uri-1",
    kind: "uri",
    state: "CONFIRMED",
    hash,
    signedBytes: "0x1234",
    nonce: "1",
    receipt,
    expected: { effects: [] },
  } as unknown as Step;
  mem.allSteps.set(op.id, [step]);
  chain.observe.mockResolvedValue({
    state: "receipt",
    receipt,
    canonical: true,
    confirmations: 3,
  });
  chain.nextStep.mockResolvedValue(null);
  const publication = async (_op: Operation) => "autoPublication" as const;
  return { mem, chain, engine, op, rec, step, publication };
}
test("two tabs retry the confirmed operation once, temporary file failure later succeeds without signing", async () => {
  const c = await recoveryFixture();
  c.chain.project.mockRejectedValueOnce(
    new PublicationReadbackError("json/19.json", "content_differs", "public"),
  );
  const run = () =>
    c.engine.advance(c.op.id, c.op.owner, "resume", undefined, c.publication);
  await Promise.all([run(), run()]);
  expect(c.chain.project).toHaveBeenCalledTimes(1);
  expect(c.rec).toMatchObject({
    state: "RECOVERY_REQUIRED",
    reason: "PUBLIC_ASSET_READBACK_PENDING",
  });
  await run();
  expect(c.rec.state).toBe("COMPLETED");
  expect(c.chain.sign).not.toHaveBeenCalled();
  expect(c.chain.broadcast).not.toHaveBeenCalled();
});
test("an uncertain signed hash stays in observation without rebroadcast or nextStep", async () => {
  const c = await recoveryFixture();
  Object.assign(c.rec, {
    state: "BROADCAST_UNKNOWN",
    reason: "BROADCAST_RESULT_UNKNOWN",
  });
  Object.assign(c.step, { state: "UNKNOWN", receipt: null });
  c.chain.observe.mockResolvedValue({
    state: "missing",
    latestNonce: 0,
    pendingNonce: 0,
  });
  await c.engine.advance(
    c.op.id,
    c.op.owner,
    "resume",
    undefined,
    async () => "autoReconcile",
  );
  expect(c.rec.state).toBe("BROADCAST_UNKNOWN");
  expect(c.chain.nextStep).not.toHaveBeenCalled();
  expect(c.chain.broadcast).not.toHaveBeenCalled();
  expect(c.chain.sign).not.toHaveBeenCalled();
});
