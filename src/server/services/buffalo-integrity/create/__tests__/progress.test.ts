/** @jest-environment node */
import { createTiming } from "../progress";
import { journalRetry, type JournalEvent } from "../../operations/retry";
import {
  domain,
  fakeChain,
  intent,
  memoryRepository,
} from "../../operations/testing-fixtures";
import { OperationEngine } from "../../operations/engine";

function row(
  kind: string,
  ms: number,
  step?: string,
  reason: string | null = null,
): JournalEvent {
  return {
    kind,
    created_at: new Date(ms),
    step_id: step ?? null,
    step_kind: step,
    reason,
  };
}
test("durations exclude both manual waits and freeze earlier clocks across duplicate prerequisite confirmations", () => {
  const history = [
    row("DRAFT_CREATED", 0),
    row("READY", 500),
    row("STEP_RESERVED", 1000, "mint"),
    row("STEP_CONFIRMED", 3000, "mint"),
    row("AWAITING_METADATA_ACTION", 5000),
    row("STEP_CONFIRMED", 90000, "mint"),
    row("STEP_RESERVED", 100000, "uri"),
    row("STEP_CONFIRMED", 110000, "mint"),
    row("STEP_CONFIRMED", 120000, "uri"),
    row("STEP_RESERVED", 125000, "metadata"),
    row("PROJECTING", 130000),
    row("VERIFYING", 131000),
    row("COMPLETED", 135000),
  ];
  expect(createTiming(history, 1000000)).toMatchObject({
    phases: [2000, 30000, 5000],
    currentPhase: null,
  });
  expect(createTiming(history.slice(0, 2), 1000000).phases).toEqual([
    null,
    null,
    null,
  ]);
});

test("the fourth file observation remains active while it owns the lease, even beyond its deadline", () => {
  const rows = [
    row("RECOVERY_REQUIRED", 1000, undefined, "PUBLIC_ASSET_READBACK_PENDING"),
    ...[6000, 21000, 51000, 111000].map((ms) =>
      row("CREATE_PUBLICATION_ATTEMPT", ms),
    ),
  ];
  Object.assign(rows.at(-1)!, {
    live_attempt: true,
    lease_until: new Date(306000),
  });
  expect(journalRetry(rows, "autoPublication", 302000, "CREATE")).toMatchObject(
    { attempts: 4, exhausted: false },
  );
  expect(journalRetry(rows, "autoPublication", 306000, "CREATE")).toMatchObject(
    { attempts: 4, exhausted: true, nextAt: null },
  );
});

test("a reserved mint resumes once after the wallet becomes available, and an unknown broadcast cannot skip metadata approval", async () => {
  const mem = memoryRepository(),
    chain = fakeChain(),
    engine = new OperationEngine(mem.repo, chain);
  const op = await engine.create("owner", "one", intent, domain);
  await engine.prepare(op.id, op.owner, op.version);
  jest.spyOn(mem.repo, "wallet").mockResolvedValueOnce(null);
  const advance = (action: "mint" | "metadata" | "resume") =>
    engine.advance(op.id, op.owner, action);
  expect(await advance("mint")).toMatchObject({
    state: "READY",
    reason: "WALLET_QUEUE_BUSY",
    steps: [{ kind: "mint", state: "RESERVED" }],
  });
  chain.broadcast.mockRejectedValueOnce(new Error("lost response"));
  await Promise.all([advance("resume"), advance("resume")]);
  expect(chain.sign).toHaveBeenCalledTimes(1);
  expect(
    await engine.advance(
      op.id,
      op.owner,
      "resume",
      undefined,
      async () => "autoReconcile",
    ),
  ).toMatchObject({ actualToken: "2000", state: "AWAITING_METADATA_ACTION" });
  await advance("resume");
  expect(chain.sign).toHaveBeenCalledTimes(1);
  expect(chain.broadcast).toHaveBeenCalledTimes(1);
  await advance("metadata");
  expect(chain.sign).toHaveBeenCalledTimes(2);
});
