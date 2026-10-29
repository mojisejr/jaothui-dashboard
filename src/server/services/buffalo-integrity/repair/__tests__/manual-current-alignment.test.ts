/** @jest-environment node */
import type { PrismaClient } from "@prisma/client";
import type { Operation, Step } from "../../operations/types";
import {
  alignCurrentCase,
  canAlignCurrentCase,
  operatorAligned,
  MANUAL_ALIGNMENT_REASON,
} from "../manual-current-alignment";
import { repairAdvanceSchema } from "../execution-contract";
const id = "22ff9f83-3dc2-4ba4-aa7b-f291e642714f";
function eligible() {
  return {
    op: {
      id,
      state: "NEEDS_REVIEW",
      reason: "RECEIPT_TRANSACTION_MISMATCH",
      intent: {
        kind: "identity_repair",
        manifest: {
          targets: [
            {
              sourceMicrochip: "ฟ้าราชสีห์",
              desiredMicrochip: "764040226601866",
              desiredTokenId: "1347",
            },
          ],
          chain: { steps: [{ kind: "batch" }, { kind: "uri" }] },
        },
      },
    } as unknown as Operation,
    steps: [{ kind: "batch", signedBytes: "0x1234", hash: "0xabc" }] as Step[],
  };
}
test("operator action is restricted to this exact approved partial incident", () => {
  const { op, steps } = eligible();
  expect(canAlignCurrentCase(op, steps)).toBe(true);
  expect(canAlignCurrentCase({ ...op, id: "other" }, steps)).toBe(false);
  expect(canAlignCurrentCase({ ...op, reason: "OTHER" }, steps)).toBe(false);
  expect(canAlignCurrentCase(op, [...steps, ...steps])).toBe(false);
  expect(canAlignCurrentCase(op, [{ ...steps[0]!, signedBytes: null }])).toBe(
    false,
  );
});
test("manual resolution is distinct from automated completion and cannot reopen the old plan", () => {
  const { op, steps } = eligible();
  const resolved = {
    ...op,
    reason: MANUAL_ALIGNMENT_REASON,
    result: {
      manualResolution: { kind: "operator_current_state_database_alignment" },
    },
  };
  expect(operatorAligned(resolved)).toBe(true);
  expect(canAlignCurrentCase(resolved, steps)).toBe(false);
  expect(operatorAligned({ ...resolved, result: null })).toBe(false);
  expect(operatorAligned({ ...resolved, state: "COMPLETED" })).toBe(false);
});
test("explicit alignment input requires the manifest and cannot combine receipt review", () => {
  const base = { id, expectedVersion: 1, alignCurrentDatabase: true };
  expect(repairAdvanceSchema.safeParse(base).success).toBe(false);
  expect(
    repairAdvanceSchema.safeParse({ ...base, manifestHash: "a".repeat(64) })
      .success,
  ).toBe(true);
  expect(
    repairAdvanceSchema.safeParse({
      ...base,
      manifestHash: "a".repeat(64),
      reviewReceipt: true,
    }).success,
  ).toBe(false);
});
test("unknown owner is rejected before storage writes or RPC activity", async () => {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
  const db = {
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  } as unknown as PrismaClient;
  const storage = {
    publicUrl: jest.fn(),
    get: jest.fn(),
    putImmutable: jest.fn(),
    replaceAlias: jest.fn(),
  };
  await expect(
    alignCurrentCase(db, storage, "http://127.0.0.1:1", "secret", "other", {
      id,
      expectedVersion: 1,
      manifestHash: "a".repeat(64),
    }),
  ).rejects.toThrow("OPERATION_NOT_FOUND");
  expect(storage.get).not.toHaveBeenCalled();
  expect(storage.putImmutable).not.toHaveBeenCalled();
});
