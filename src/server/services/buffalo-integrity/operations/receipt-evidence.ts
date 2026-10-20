import { z } from "zod";
import { IntegrityError, asJson, payloadHash } from "./hash";
import type { EffectProof, Json, Operation, ReceiptProof, Step } from "./types";
const hex = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const evidenceSchema = z.object({
  version: z.literal(1),
  binding: z.object({
    operationId: z.string(),
    stepId: z.string(),
    domainHash: z.string(),
    expectedHash: z.string(),
    transactionHash: hex,
    blockHash: hex,
    blockNumber: z.string().regex(/^\d+$/),
    status: z.literal("success"),
    blockTimestamp: z.string().regex(/^\d+$/),
    effectsHash: z.string(),
  }),
  origin: z.enum(["receipt-state", "current-full-state"]),
  observedHead: z
    .object({ number: z.string().regex(/^\d+$/), hash: hex })
    .optional(),
  effects: z.array(z.record(z.unknown())).superRefine((effects, ctx) => {
    for (const [i, effect] of effects.entries())
      for (const name of ["nativeCreatedAt", "nativeUpdatedAt"])
        if (
          effect[name] !== undefined &&
          (typeof effect[name] !== "string" || !/^\d+$/.test(effect[name]))
        )
          ctx.addIssue({
            code: "custom",
            path: [i, name],
            message: "Numeric native timestamp required",
          });
  }),
});
export function bindReceiptEvidence(
  operation: Operation,
  step: Step,
  receipt: ReceiptProof,
  timestamp: bigint,
  effects: Json[],
  qualification: {
    origin: "receipt-state" | "current-full-state";
    observedHead?: { number: string; hash: string };
  } = { origin: "receipt-state" },
): EffectProof {
  return {
    details: asJson({
      version: 1,
      ...qualification,
      binding: {
        operationId: operation.id,
        stepId: step.id,
        domainHash: payloadHash(operation.domain),
        expectedHash: payloadHash(step.expected),
        ...receipt,
        blockTimestamp: timestamp.toString(),
        effectsHash: payloadHash(effects),
      },
      effects,
    }),
  };
}
/** Private journal evidence only. Canonical receipt/transaction checks still run on every reconciliation. */
export function receiptEvidence(
  operation: Operation,
  step: Step,
  receipt: ReceiptProof,
) {
  const candidate = step.proof as { version?: unknown } | null;
  if (candidate?.version !== 1) return null; // Legacy steps still require historical readback.
  const parsed = evidenceSchema.safeParse(candidate);
  if (!parsed.success) throw new IntegrityError("INVALID_RECEIPT_EVIDENCE");
  if (
    parsed.data.origin === "current-full-state" &&
    (!parsed.data.observedHead ||
      BigInt(parsed.data.observedHead.number) < BigInt(receipt.blockNumber))
  )
    throw new IntegrityError("INVALID_RECEIPT_EVIDENCE");
  const result = parsed.data,
    b = result.binding;
  if (
    b.operationId !== operation.id ||
    b.stepId !== step.id ||
    b.domainHash !== payloadHash(operation.domain) ||
    b.expectedHash !== payloadHash(step.expected) ||
    b.transactionHash.toLowerCase() !== receipt.transactionHash.toLowerCase() ||
    b.blockHash.toLowerCase() !== receipt.blockHash.toLowerCase() ||
    b.blockNumber !== receipt.blockNumber ||
    receipt.status !== "success" ||
    b.effectsHash !== payloadHash(result.effects)
  )
    throw new IntegrityError("RECEIPT_EVIDENCE_BINDING_CHANGED");
  if (result.effects.length !== step.expected.effects.length)
    throw new IntegrityError("RECEIPT_EVIDENCE_EFFECTS_CHANGED");
  step.expected.effects.forEach((effect, i) => {
    const detail = result.effects[i]!;
    if (effect.kind === "read") {
      if (
        detail.kind !== "read" ||
        detail.field !== effect.functionName ||
        payloadHash(detail.value) !== payloadHash(effect.expected)
      )
        throw new IntegrityError("RECEIPT_EVIDENCE_EFFECTS_CHANGED");
    } else if (
      detail.kind !== "mint" ||
      detail.receiver !== effect.receiver ||
      detail.tokenUri !== effect.tokenUri ||
      typeof detail.actualToken !== "string" ||
      !/^[1-9][0-9]*$/.test(detail.actualToken)
    )
      throw new IntegrityError("RECEIPT_EVIDENCE_EFFECTS_CHANGED");
  });
  return result;
}
export function nativeReceiptEvidence(
  operation: Operation,
  step: Step | undefined,
  field: string,
) {
  if (!step?.receipt) return null;
  const evidence = receiptEvidence(operation, step, step.receipt);
  if (!evidence) return null;
  const detail = evidence.effects.find(
    (e) => e.kind === "read" && e.field === field,
  );
  if (
    !detail ||
    typeof detail.nativeCreatedAt !== "string" ||
    typeof detail.nativeUpdatedAt !== "string"
  )
    throw new IntegrityError("MISSING_NATIVE_RECEIPT_EVIDENCE");
  return {
    createdAt: detail.nativeCreatedAt,
    updatedAt: detail.nativeUpdatedAt,
    timestamp: evidence.binding.blockTimestamp,
  };
}
