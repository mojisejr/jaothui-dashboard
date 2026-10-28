/** @jest-environment node */
import { type Observation } from "../types";
import { OperationEngine } from "../engine";
import { IntegrityError } from "../hash";
import { assertLoopbackUrl } from "../loopback";
import { productOperationRuntime } from "../runtime";
import {
  memoryRepository,
  fakeChain,
  intent,
  domain,
} from "../testing-fixtures";

async function setup() {
  const memory = memoryRepository(),
    chain = fakeChain();
  const engine = new OperationEngine(memory.repo, chain);
  const operation = await engine.create(
    "shared:operator",
    "request-1",
    intent,
    domain,
  );
  await engine.prepare(operation.id, operation.owner, 0);
  return { ...memory, chain, engine, id: operation.id, owner: operation.owner };
}
async function mintConfirmed(context: Awaited<ReturnType<typeof setup>>) {
  await context.engine.advance(context.id, context.owner, "mint");
  await context.engine.advance(context.id, context.owner, "resume");
}
async function reviewableReceipt() {
  const c = await setup();
  await c.engine.advance(c.id, c.owner, "mint");
  c.allSteps.get(c.id)![0]!.kind = "batch";
  const row = c.rows.get(c.id)!;
  row.state = "NEEDS_REVIEW";
  row.reason = "RECEIPT_TRANSACTION_MISMATCH";
  c.chain.sign.mockClear();
  c.chain.broadcast.mockClear();
  c.chain.nextStep.mockClear();
  return c;
}
test("receipt review verifies the existing canonical transaction without signing, broadcast or projection", async () => {
  const c = await reviewableReceipt();
  const version = c.rows.get(c.id)!.version;
  expect((await c.engine.reviewReceipt(c.id, c.owner, version)).state).toBe(
    "CHAIN_STEPS",
  );
  expect((await c.repo.steps(c.id))[0]!.state).toBe("CONFIRMED");
  expect(c.chain.verifyEffects).toHaveBeenCalledTimes(1);
  expect(c.chain.sign).not.toHaveBeenCalled();
  expect(c.chain.broadcast).not.toHaveBeenCalled();
  expect(c.chain.nextStep).not.toHaveBeenCalled();
  expect(c.chain.project).not.toHaveBeenCalled();
});
test.each(["missing", "pending", "reverted", "noncanonical", "unconfirmed"])(
  "receipt review keeps the stop for %s evidence",
  async (variant) => {
    const c = await reviewableReceipt();
    const s = (await c.repo.steps(c.id))[0]!;
    c.chain.observe.mockResolvedValue(
      variant === "missing"
        ? { state: "missing", latestNonce: 0, pendingNonce: 0 }
        : variant === "pending"
          ? { state: "pending" }
          : {
              state: "receipt",
              canonical: variant !== "noncanonical",
              confirmations: variant === "unconfirmed" ? 1 : 3,
              receipt: {
                transactionHash: s.hash!,
                blockHash: `0x${"aa".repeat(32)}`,
                blockNumber: "100",
                status: variant === "reverted" ? "reverted" : "success",
              },
            },
    );
    expect(
      (await c.engine.reviewReceipt(c.id, c.owner, c.rows.get(c.id)!.version))
        .state,
    ).toBe("NEEDS_REVIEW");
    expect(c.chain.verifyEffects).not.toHaveBeenCalled();
    expect(c.chain.sign).not.toHaveBeenCalled();
    expect(c.chain.broadcast).not.toHaveBeenCalled();
  },
);
test("receipt review rejects stale versions, unrelated review reasons and failed effect proofs", async () => {
  const c = await reviewableReceipt();
  const row = c.rows.get(c.id)!;
  await expect(
    c.engine.reviewReceipt(c.id, c.owner, row.version + 1),
  ).rejects.toThrow("STALE_OPERATION_REVISION");
  row.reason = "OTHER_REASON";
  await expect(
    c.engine.reviewReceipt(c.id, c.owner, row.version),
  ).rejects.toThrow("INVALID_OPERATION_STAGE");
  row.reason = "RECEIPT_TRANSACTION_MISMATCH";
  c.chain.verifyEffects.mockRejectedValue(
    new IntegrityError("RECEIPT_TRANSACTION_MISMATCH"),
  );
  await expect(
    c.engine.reviewReceipt(c.id, c.owner, row.version),
  ).rejects.toThrow("RECEIPT_TRANSACTION_MISMATCH");
  expect(row.state).toBe("NEEDS_REVIEW");
  expect(c.chain.broadcast).not.toHaveBeenCalled();
});

test("hash is pending, signed journal exists before broadcast, metadata needs explicit action", async () => {
  const c = await setup();
  c.chain.broadcast.mockImplementation(async (bytes) => {
    const step = (await c.repo.steps(c.id))[0]!;
    expect(step.signedBytes === bytes).toBe(true);
    expect(step.hash).not.toBeNull();
    expect(step.nonce).toBe("0");
    return step.hash!;
  });
  expect((await c.engine.advance(c.id, c.owner, "mint")).state).toBe(
    "CHAIN_PENDING",
  );
  expect(c.chain.project).not.toHaveBeenCalled();
  expect((await c.engine.advance(c.id, c.owner, "resume")).state).toBe(
    "AWAITING_METADATA_ACTION",
  );
  expect((await c.engine.advance(c.id, c.owner, "resume")).state).toBe(
    "AWAITING_METADATA_ACTION",
  );
  expect(c.chain.sign).toHaveBeenCalledTimes(1);
});
test("double submit/two engine instances create one step and one mint", async () => {
  const c = await setup();
  const other = new OperationEngine(c.repo, c.chain);
  await Promise.all([
    c.engine.advance(c.id, c.owner, "mint"),
    other.advance(c.id, c.owner, "mint"),
  ]);
  expect(c.chain.sign).toHaveBeenCalledTimes(1);
  expect(c.chain.broadcast).toHaveBeenCalledTimes(1);
  expect(await c.repo.steps(c.id)).toHaveLength(1);
});
test("same key resumes, changed payload conflicts; owner cannot inspect arbitrary operation", async () => {
  const c = await setup();
  expect((await c.engine.create(c.owner, "request-1", intent, domain)).id).toBe(
    c.id,
  );
  await expect(
    c.engine.create(
      c.owner,
      "request-1",
      { ...intent, buffalo: { ...intent.buffalo, name: "changed" } },
      domain,
    ),
  ).rejects.toThrow("IDEMPOTENCY_PAYLOAD_CONFLICT");
  await expect(c.engine.status(c.id, "other")).rejects.toThrow(
    "OPERATION_NOT_FOUND",
  );
});
test("out-of-order API stage rejects without consuming a nonce or signing", async () => {
  const c = await setup();
  const draft = await c.engine.create(
    c.owner,
    "draft-2",
    { ...intent, buffalo: { ...intent.buffalo, microchip: "999000000000002" } },
    domain,
  );
  await expect(c.engine.advance(draft.id, c.owner, "metadata")).rejects.toThrow(
    "INVALID_OPERATION_STAGE",
  );
  await expect(c.engine.advance(c.id, c.owner, "metadata")).rejects.toThrow(
    "EXPLICIT_MINT_ACTION_REQUIRED",
  );
  expect(c.chain.sign).not.toHaveBeenCalled();
  expect(c.chain.nonce).not.toHaveBeenCalled();
});
test("crash before send rebroadcasts exact recorded bytes without signing again", async () => {
  const c = await setup();
  c.chain.broadcast.mockRejectedValueOnce(new Error("network lost"));
  expect((await c.engine.advance(c.id, c.owner, "mint")).state).toBe(
    "BROADCAST_UNKNOWN",
  );
  c.chain.observe.mockResolvedValueOnce({
    state: "missing",
    latestNonce: 0,
    pendingNonce: 0,
  });
  const restarted = new OperationEngine(c.repo, c.chain);
  expect((await restarted.advance(c.id, c.owner, "resume")).state).toBe(
    "CHAIN_PENDING",
  );
  expect(c.chain.sign).toHaveBeenCalledTimes(1);
  expect(
    c.chain.broadcast.mock.calls[0]![0] === c.chain.broadcast.mock.calls[1]![0],
  ).toBe(true);
});
test("crash after send/response lost reconciles known receipt without remint", async () => {
  const c = await setup();
  c.chain.broadcast.mockRejectedValueOnce(
    new Error("response lost after submission"),
  );
  await c.engine.advance(c.id, c.owner, "mint");
  await c.engine.advance(c.id, c.owner, "resume");
  expect(c.chain.sign).toHaveBeenCalledTimes(1);
  expect(c.chain.broadcast).toHaveBeenCalledTimes(1);
  expect((await c.engine.status(c.id, c.owner)).actualToken).toBe("2000");
});
test("journal failure prevents broadcast; stale worker cannot act", async () => {
  const c = await setup();
  c.repo.journal = jest.fn(async () => {
    throw new IntegrityError("STALE_OPERATION_LEASE");
  });
  await c.engine.advance(c.id, c.owner, "mint");
  expect(c.chain.broadcast).not.toHaveBeenCalled();
});
test.each([
  ["pending", { state: "pending" as const }, "CHAIN_PENDING"],
  [
    "replaced",
    { state: "missing" as const, latestNonce: 1, pendingNonce: 1 },
    "NEEDS_REVIEW",
  ],
  [
    "reverted",
    {
      state: "receipt" as const,
      receipt: {
        transactionHash: "replace",
        blockHash: "0xaa",
        blockNumber: "100",
        status: "reverted" as const,
      },
      canonical: true,
      confirmations: 3,
    },
    "NEEDS_REVIEW",
  ],
  [
    "reorg",
    {
      state: "receipt" as const,
      receipt: {
        transactionHash: "replace",
        blockHash: "0xaa",
        blockNumber: "100",
        status: "success" as const,
      },
      canonical: false,
      confirmations: 3,
    },
    "RECOVERY_REQUIRED",
  ],
  [
    "insufficient confirmations",
    {
      state: "receipt" as const,
      receipt: {
        transactionHash: "replace",
        blockHash: "0xaa",
        blockNumber: "100",
        status: "success" as const,
      },
      canonical: true,
      confirmations: 2,
    },
    "CHAIN_PENDING",
  ],
])(
  "%s stays non-complete, no second mint",
  async (_name, observation, state) => {
    const c = await setup();
    await c.engine.advance(c.id, c.owner, "mint");
    const step = (await c.repo.steps(c.id))[0]!;
    const observed: Observation =
      observation.state === "receipt"
        ? {
            ...observation,
            receipt: { ...observation.receipt, transactionHash: step.hash! },
          }
        : observation;
    c.chain.observe.mockResolvedValueOnce(observed);
    expect((await c.engine.advance(c.id, c.owner, "resume")).state).toBe(state);
    expect(c.chain.sign).toHaveBeenCalledTimes(1);
    expect(c.chain.project).not.toHaveBeenCalled();
  },
);
test("wrong receiver/URI/field effect proof prevents confirmation", async () => {
  const c = await setup();
  await c.engine.advance(c.id, c.owner, "mint");
  c.chain.verifyEffects.mockRejectedValueOnce(
    new IntegrityError("MINT_RECEIVER_MISMATCH"),
  );
  expect((await c.engine.advance(c.id, c.owner, "resume")).state).toBe(
    "NEEDS_REVIEW",
  );
  expect(c.chain.project).not.toHaveBeenCalled();
});
test("unmanaged pending nonce blocks signing; expiry never licenses another wallet step", async () => {
  const c = await setup();
  c.chain.nonce.mockResolvedValueOnce({ latest: 0, pending: 1 });
  expect((await c.engine.advance(c.id, c.owner, "mint")).state).toBe(
    "RECOVERY_REQUIRED",
  );
  expect(c.chain.sign).not.toHaveBeenCalled();
  const second = await c.engine.create(
    c.owner,
    "request-2",
    { ...intent, buffalo: { ...intent.buffalo, microchip: "999000000000002" } },
    domain,
  );
  await c.engine.prepare(second.id, c.owner, 0);
  expect((await c.engine.advance(second.id, c.owner, "mint")).reason).toBe(
    "WALLET_QUEUE_BUSY",
  );
});
test("projection outage recovers forward and prior confirmed receipt reorg blocks completion", async () => {
  const c = await setup();
  await mintConfirmed(c);
  await c.engine.advance(c.id, c.owner, "metadata");
  await c.engine.advance(c.id, c.owner, "resume");
  c.chain.project.mockRejectedValueOnce(new Error("DB outage"));
  expect((await c.engine.advance(c.id, c.owner, "resume")).state).toBe(
    "RECOVERY_REQUIRED",
  );
  expect(c.chain.sign).toHaveBeenCalledTimes(2);
  c.chain.observe.mockImplementationOnce(async (step) => ({
    state: "receipt",
    receipt: {
      transactionHash: step.hash!,
      blockHash: "0xbb",
      blockNumber: "101",
      status: "success",
    },
    canonical: false,
    confirmations: 3,
  }));
  expect((await c.engine.advance(c.id, c.owner, "resume")).state).toBe(
    "RECOVERY_REQUIRED",
  );
  expect(c.chain.project).toHaveBeenCalledTimes(1);
});
test("verified completion requires all chain effects and publication proof; DTO contains no signed bytes", async () => {
  const c = await setup();
  await mintConfirmed(c);
  await c.engine.advance(c.id, c.owner, "metadata");
  await c.engine.advance(c.id, c.owner, "resume");
  c.chain.verifyPublication.mockResolvedValueOnce(false);
  expect((await c.engine.advance(c.id, c.owner, "resume")).state).toBe(
    "NEEDS_REVIEW",
  );
  const status = await c.engine.status(c.id, c.owner);
  const data = JSON.stringify(status);
  expect(data).not.toContain("signedBytes");
  expect(data).not.toContain("calldata");
  expect(data).not.toContain("envelope");
});
test("fully verified path completes without a repeated mint", async () => {
  const c = await setup();
  await mintConfirmed(c);
  await c.engine.advance(c.id, c.owner, "metadata");
  await c.engine.advance(c.id, c.owner, "resume");
  expect((await c.engine.advance(c.id, c.owner, "resume")).state).toBe(
    "COMPLETED",
  );
  expect(c.chain.sign).toHaveBeenCalledTimes(2);
  expect(c.chain.broadcast).toHaveBeenCalledTimes(2);
  expect((await c.engine.advance(c.id, c.owner, "mint")).state).toBe(
    "COMPLETED",
  );
  expect(c.chain.sign).toHaveBeenCalledTimes(2);
  await expect(c.engine.cancel(c.id, c.owner)).rejects.toThrow(
    "CANNOT_CANCEL_SIGNED_OPERATION",
  );
});
test("live feature cannot be enabled with an env toggle and non-loopback transports reject", () => {
  expect(() => productOperationRuntime()).toThrow("INTEGRITY_FEATURE_DISABLED");
  expect(() => assertLoopbackUrl("https://rpc.bitkubchain.io")).toThrow(
    "LOOPBACK_ONLY",
  );
  expect(() => assertLoopbackUrl("http://localhost:18549")).toThrow(
    "LOOPBACK_ONLY",
  );
  expect(assertLoopbackUrl("http://127.0.0.1:18549")).toBe(
    "http://127.0.0.1:18549/",
  );
});

test("deadline expires after signing computation: checkpoint prevents journal and broadcast", async () => {
  const c = await setup();
  let now = 0;
  const sign = c.chain.sign;
  c.chain.sign = jest.fn(async (...args) => {
    const result = await sign(...args);
    now = 11;
    return result;
  });
  const bounded = new OperationEngine(c.repo, c.chain, {
    milliseconds: 10,
    now: () => now,
  });
  expect((await bounded.advance(c.id, c.owner, "mint")).state).toBe(
    "RETRYABLE",
  );
  expect((await c.repo.steps(c.id))[0]!.hash).toBeNull();
  expect(c.chain.broadcast).not.toHaveBeenCalled();
});

test("before our first broadcast and rebroadcast a changed baseline stops the signed journal without resigning", async () => {
  const c = await setup();
  const guard = jest.fn(async () => undefined);
  c.chain.beforeBroadcast = guard;
  c.chain.broadcast.mockRejectedValueOnce(
    new Error("unsent network interruption"),
  );
  await c.engine.advance(c.id, c.owner, "mint");
  const signed = (await c.repo.steps(c.id))[0]!;
  guard.mockRejectedValueOnce(
    new IntegrityError("EXTERNAL_CHAIN_BASELINE_CHANGED"),
  );
  c.chain.observe.mockResolvedValueOnce({
    state: "missing",
    latestNonce: 0,
    pendingNonce: 0,
  });
  expect(
    (
      await new OperationEngine(c.repo, c.chain).advance(
        c.id,
        c.owner,
        "resume",
      )
    ).state,
  ).toBe("NEEDS_REVIEW");
  expect(c.chain.broadcast).toHaveBeenCalledTimes(1);
  expect(c.chain.sign).toHaveBeenCalledTimes(1);
  const retained = (await c.repo.steps(c.id))[0]!;
  expect(retained.hash).toBe(signed.hash);
  expect(retained.signedBytes).toBe(signed.signedBytes);
});
test("unchanged protected baseline permits only identical bytes on our rebroadcast", async () => {
  const c = await setup();
  c.chain.beforeBroadcast = jest.fn(async () => undefined);
  c.chain.broadcast.mockRejectedValueOnce(new Error("unsent"));
  await c.engine.advance(c.id, c.owner, "mint");
  c.chain.observe.mockResolvedValueOnce({
    state: "missing",
    latestNonce: 0,
    pendingNonce: 0,
  });
  await new OperationEngine(c.repo, c.chain).advance(c.id, c.owner, "resume");
  expect(c.chain.beforeBroadcast).toHaveBeenCalledTimes(2);
  expect(c.chain.sign).toHaveBeenCalledTimes(1);
  expect(c.chain.broadcast.mock.calls[1]![0]).toBe(
    c.chain.broadcast.mock.calls[0]![0],
  );
});
test("planned drain before signing releases unsigned reservation and unpauses the same operation", async () => {
  const c = await setup();
  c.chain.sign.mockRejectedValueOnce(
    new IntegrityError("INTEGRITY_WRITES_PAUSED"),
  );
  const paused = await c.engine.advance(c.id, c.owner, "mint");
  expect(paused.state).toBe("READY");
  expect(paused.reason).toBe("INTEGRITY_WRITES_PAUSED");
  expect(c.chain.broadcast).not.toHaveBeenCalled();
  expect((await c.repo.steps(c.id))[0]!.signedBytes).toBeNull();
  expect((await c.engine.advance(c.id, c.owner, "mint")).id).toBe(c.id);
  expect(c.chain.broadcast).toHaveBeenCalledTimes(1);
});
