/** @jest-environment node */
import { randomUUID } from "crypto";
import { asJson } from "../hash";
import {
  bindReceiptEvidence,
  receiptEvidence,
  nativeReceiptEvidence,
} from "../receipt-evidence";
import { intent, domain } from "../testing-fixtures";
import type { Operation, Step, ReceiptProof } from "../types";
const hash = `0x${"11".repeat(32)}`,
  block = `0x${"22".repeat(32)}`;
function setup() {
  const op: Operation = {
    id: randomUUID(),
    owner: "shared:test",
    intentHash: "test",
    intent,
    domain,
    plan: null,
    state: "CHAIN_PENDING",
    version: 1,
    fence: "1",
    actualToken: null,
    result: null,
    reason: null,
  };
  const receipt: ReceiptProof = {
    transactionHash: hash,
    blockHash: block,
    blockNumber: "100",
    status: "success",
  };
  const step: Step = {
    id: randomUUID(),
    operationId: op.id,
    ordinal: 0,
    kind: "metadata",
    expected: {
      to: domain.manager,
      data: "0x1234",
      value: "0",
      effects: [
        {
          kind: "read",
          contract: domain.manager,
          functionName: "getMetadata",
          args: ["1371"],
          expected: { name: "unchanged" },
          abi: [],
        },
      ],
    },
    state: "CONFIRMED",
    chainId: 96,
    sender: "test",
    nonce: "1",
    calldataHash: null,
    hash,
    signedBytes: null,
    envelope: null,
    receipt,
    proof: null,
  };
  const effect = {
    kind: "read",
    field: "getMetadata",
    value: { name: "unchanged" },
    nativeCreatedAt: "2000",
    nativeUpdatedAt: "2000",
  };
  step.proof = bindReceiptEvidence(op, step, receipt, 2000n, [effect]).details;
  return { op, step, receipt, effect };
}
test("uses the actual Postgres details-only JSON shape and preserves exact native evidence", () => {
  const { op, step, receipt } = setup();
  expect(receiptEvidence(op, step, receipt)?.binding.blockTimestamp).toBe(
    "2000",
  );
  expect(nativeReceiptEvidence(op, step, "getMetadata")).toEqual({
    createdAt: "2000",
    updatedAt: "2000",
    timestamp: "2000",
  });
  step.proof = { details: step.proof };
  expect(receiptEvidence(op, step, receipt)).toBeNull();
});
test("missing legacy proof cannot manufacture receipt readback", () => {
  const { op, step, receipt } = setup();
  step.proof = [];
  expect(receiptEvidence(op, step, receipt)).toBeNull();
  step.proof = null;
  expect(receiptEvidence(op, step, receipt)).toBeNull();
});
test.each([
  "operationId",
  "stepId",
  "domainHash",
  "expectedHash",
  "effectsHash",
  "transactionHash",
  "blockHash",
  "blockNumber",
])("tampered %s is rejected", (field) => {
  const { op, step, receipt } = setup();
  const p = step.proof as { binding: Record<string, string> };
  p.binding[field] =
    field.endsWith("Hash") || field === "transactionHash"
      ? `0x${"33".repeat(32)}`
      : field === "blockNumber"
        ? "101"
        : "changed";
  expect(() => receiptEvidence(op, step, receipt)).toThrow();
});
test("mandatory hash and numeric native timestamps cannot be omitted or corrupted", () => {
  const { op, step, receipt } = setup();
  const p = step.proof as {
    binding: Record<string, string>;
    effects: Array<Record<string, unknown>>;
  };
  delete p.binding.effectsHash;
  expect(() => receiptEvidence(op, step, receipt)).toThrow(
    "INVALID_RECEIPT_EVIDENCE",
  );
  const c = setup();
  (
    c.step.proof as { effects: Array<Record<string, unknown>> }
  ).effects[0]!.nativeUpdatedAt = "NaN";
  expect(() => receiptEvidence(c.op, c.step, c.receipt)).toThrow(
    "INVALID_RECEIPT_EVIDENCE",
  );
});
test("receipt hash changes and expected calldata changes invalidate otherwise valid private evidence", () => {
  const { op, step, receipt } = setup();
  expect(() =>
    receiptEvidence(op, step, {
      ...receipt,
      blockHash: `0x${"44".repeat(32)}`,
    }),
  ).toThrow("RECEIPT_EVIDENCE_BINDING_CHANGED");
  step.expected.data = "0xabcd";
  expect(() => receiptEvidence(op, step, receipt)).toThrow(
    "RECEIPT_EVIDENCE_BINDING_CHANGED",
  );
});
test("current-state qualification retains a separate canonical head anchor", () => {
  const { op, step, receipt, effect } = setup();
  step.proof = bindReceiptEvidence(op, step, receipt, 2000n, [effect], {
    origin: "current-full-state",
    observedHead: { number: "120", hash: block },
  }).details;
  expect(receiptEvidence(op, step, receipt)).toMatchObject({
    origin: "current-full-state",
    observedHead: { number: "120", hash: block },
  });
  delete (step.proof as Record<string, unknown>).observedHead;
  expect(() => receiptEvidence(op, step, receipt)).toThrow(
    "INVALID_RECEIPT_EVIDENCE",
  );
});
test("the proof body is bound even when the expected manifest is still intact", () => {
  const { op, step, receipt } = setup();
  (
    step.proof as { effects: Array<Record<string, unknown>> }
  ).effects[0]!.value = asJson({ name: "tampered" });
  expect(() => receiptEvidence(op, step, receipt)).toThrow(
    "RECEIPT_EVIDENCE_BINDING_CHANGED",
  );
});
