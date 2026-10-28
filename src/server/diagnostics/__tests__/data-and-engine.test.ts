/** @jest-environment node */
jest.mock("~/server/db", () => ({
  db: { pedigree: { findFirst: jest.fn() }, reward: { create: jest.fn() } },
}));
jest.mock("~/server/services/supabase/supabase", () => ({
  getImageUrl: jest.fn(),
  getJsonUrl: jest.fn(),
}));
import { db } from "~/server/db";
import {
  getByMicrochip,
  addNewReward,
} from "~/server/services/buffalo.service";
import { OperationEngine } from "~/server/services/buffalo-integrity/operations/engine";
import {
  memoryRepository,
  fakeChain,
  intent,
  domain,
} from "~/server/services/buffalo-integrity/operations/testing-fixtures";
import { runDiagnosticContext } from "../reporter";
import { diagnosticCodes, errorPolicy } from "../errors";
const log = jest.spyOn(console, "error").mockImplementation(() => undefined);
afterAll(() => log.mockRestore());
test("not found is null, failed DB reads reject, and failed DB writes cannot resolve success", async () => {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const read = db.pedigree.findFirst as jest.Mock;
  read.mockResolvedValueOnce(null).mockRejectedValueOnce(Error("privateSQL"));
  expect(await getByMicrochip("absent")).toBeNull();
  await expect(getByMicrochip("known")).rejects.toMatchObject({
    code: "DATABASE_READ_FAILED",
  });
  (db.reward.create as jest.Mock).mockRejectedValueOnce(Error("password"));
  await expect(
    addNewReward({
      microchip: "synthetic",
      rewardName: "award",
      eventName: "event",
      eventDate: new Date(),
      rewardImage: "https://example.invalid/image",
    }),
  ).rejects.toMatchObject({ code: "DATABASE_WRITE_FAILED" });
});
test("caught broadcast error reports unknown outcome and same operation reference without bytes", async () => {
  const { repo } = memoryRepository(),
    chain = fakeChain(),
    engine = new OperationEngine(repo, chain);
  const operation = await engine.create(
    "shared:operator",
    "diagnostic-test",
    intent,
    domain,
  );
  await engine.prepare(operation.id, operation.owner, 0);
  chain.broadcast.mockRejectedValue(Error("private signed_bytes=0x123"));
  const status = await runDiagnosticContext(
    {
      requestId: "33333333-3333-4333-8333-333333333333",
      route: "buffaloCreate.advance",
      type: "mutation",
    },
    () => engine.advance(operation.id, operation.owner, "mint"),
  );
  expect(status).toMatchObject({
    state: "BROADCAST_UNKNOWN",
    diagnostic: {
      code: "BROADCAST_RESULT_UNKNOWN",
      outcome: "unknown",
      nextAction: "resume_existing",
      operationId: operation.id,
      requestId: "33333333-3333-4333-8333-333333333333",
    },
  });
  expect(JSON.stringify(log.mock.calls)).not.toContain("private signed_bytes");
  expect(JSON.stringify(status)).not.toContain("signedBytes");
});
test("taxonomy inventory covers exact known categories with conservative unknowns", () => {
  expect(diagnosticCodes.length).toBeGreaterThan(100);
  for (const code of diagnosticCodes) {
    expect(errorPolicy(code)?.stage).toBeTruthy();
    expect(errorPolicy(code)?.reason).toBeTruthy();
    expect(errorPolicy(code)?.nextAction).toBeTruthy();
  }
  for (const code of [
    "DATABASE_READ_FAILED password=secret",
    "constructor",
    "toString",
    "__proto__",
  ]) {
    expect(errorPolicy(code)).toBeUndefined();
  }
});

test("persisted queue and review reasons remain exact in status DTOs", async () => {
  const { repo, rows } = memoryRepository();
  const engine = new OperationEngine(repo, fakeChain());
  const operation = await engine.create(
    "shared:operator",
    "queue-status",
    intent,
    domain,
  );
  for (const reason of [
    "STEP_REQUIRES_REVIEW",
    "WALLET_QUEUE_BUSY",
    "UNMANAGED_PENDING_NONCE",
    "WALLET_RESERVATION_CONFLICT",
  ]) {
    rows.set(operation.id, { ...operation, state: "NEEDS_REVIEW", reason });
    const status = await engine.status(operation.id, operation.owner);
    expect(status.reason).toBe(reason);
    expect(status.diagnostic?.code).toBe(reason);
    expect(status.diagnostic?.nextAction).toBe("contact_support");
  }
});
