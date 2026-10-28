import { parseTransaction, type Hex } from "viem";
import { verifySignedEnvelope } from "./engine";
import { IntegrityError } from "./hash";
import { isDatabaseRepairPlan, type StoredPlan, type Step } from "./types";

type ObservedTransaction = {
  hash: string;
  from: string;
  to: string | null;
  nonce: number;
  input: string;
  value: bigint;
  type: string;
  chainId?: number | null;
};

/** Some legacy RPC responses omit chainId. Prove it from the journaled,
 * EIP155-protected signature bound to this exact mined transaction instead. */
export async function assertReceiptTransaction(
  transaction: ObservedTransaction,
  step: Step,
  receiptHash: string,
  plan: StoredPlan | null,
): Promise<void> {
  try {
    const envelope = step.envelope;
    if (
      !envelope ||
      !step.hash ||
      transaction.hash.toLowerCase() !== receiptHash.toLowerCase() ||
      step.hash.toLowerCase() !== receiptHash.toLowerCase() ||
      transaction.from.toLowerCase() !== envelope.from.toLowerCase() ||
      transaction.to?.toLowerCase() !== envelope.to.toLowerCase() ||
      transaction.nonce !== envelope.nonce ||
      transaction.input.toLowerCase() !== envelope.data.toLowerCase() ||
      transaction.value !== BigInt(envelope.value)
    )
      throw new Error("mismatch");
    let chainId = transaction.chainId;
    if (chainId === undefined || chainId === null) {
      if (
        transaction.type !== "legacy" ||
        !step.signedBytes ||
        !plan ||
        isDatabaseRepairPlan(plan)
      )
        throw new Error("missing chain evidence");
      await verifySignedEnvelope(
        step,
        { bytes: step.signedBytes, hash: step.hash, envelope },
        envelope.nonce,
        plan,
      );
      const parsed = parseTransaction(step.signedBytes as Hex);
      if (parsed.type !== "legacy") throw new Error("not legacy");
      chainId = parsed.chainId;
    }
    if (chainId !== envelope.chainId) throw new Error("chain mismatch");
  } catch {
    throw new IntegrityError("RECEIPT_TRANSACTION_MISMATCH");
  }
}
