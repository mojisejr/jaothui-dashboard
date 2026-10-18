import { randomUUID } from "crypto";
import {
  keccak256,
  parseTransaction,
  recoverTransactionAddress,
  type Hex,
  type TransactionSerialized,
} from "viem";
import { IntegrityError, payloadHash, asJson } from "./hash";
import {
  type Repository,
  type ChainPorts,
  type Operation,
  type Claim,
  type Step,
  type Domain,
  type OperationIntent,
  type Signed,
  type Plan,
} from "./types";

function assertPlan(plan: Plan, operation: Operation) {
  if (
    payloadHash({
      ...plan.domain,
      nft: plan.domain.nft.toLowerCase(),
      manager: plan.domain.manager.toLowerCase(),
    }) !== payloadHash(operation.domain) ||
    !/^0x[0-9a-fA-F]{40}$/.test(plan.sender) ||
    plan.confirmations < 3 ||
    !Number.isInteger(plan.confirmations) ||
    !/^\d+$/.test(plan.maxFeeWei) ||
    BigInt(plan.maxFeeWei) <= 0n
  )
    throw new IntegrityError("INVALID_SERVER_PLAN");
}
export async function verifySignedEnvelope(
  step: Step,
  signed: Signed,
  nonce: number,
  plan: Plan,
): Promise<void> {
  const parsed = parseTransaction(signed.bytes as Hex);
  const sender = await recoverTransactionAddress({
    serializedTransaction: signed.bytes as TransactionSerialized,
  });
  const envelope = signed.envelope;
  if (
    keccak256(signed.bytes as Hex).toLowerCase() !==
      signed.hash.toLowerCase() ||
    sender.toLowerCase() !== step.sender.toLowerCase() ||
    envelope.from.toLowerCase() !== step.sender.toLowerCase() ||
    parsed.chainId !== step.chainId ||
    envelope.chainId !== step.chainId ||
    (parsed.nonce ?? 0) !== nonce ||
    envelope.nonce !== nonce ||
    parsed.to?.toLowerCase() !== step.expected.to.toLowerCase() ||
    envelope.to.toLowerCase() !== step.expected.to.toLowerCase() ||
    (parsed.data ?? "0x").toLowerCase() !== step.expected.data.toLowerCase() ||
    envelope.data.toLowerCase() !== step.expected.data.toLowerCase() ||
    (parsed.value ?? 0n) !== BigInt(step.expected.value) ||
    envelope.value !== step.expected.value ||
    parsed.gas !== BigInt(envelope.gas) ||
    parsed.gasPrice !== BigInt(envelope.gasPrice) ||
    BigInt(envelope.gas) <= 0n ||
    BigInt(envelope.gasPrice) <= 0n ||
    BigInt(envelope.value) !== 0n ||
    BigInt(envelope.gas) * BigInt(envelope.gasPrice) > BigInt(plan.maxFeeWei)
  ) {
    throw new IntegrityError("SIGNED_ENVELOPE_MISMATCH");
  }
}

/** One bounded step per request; SQL leases never enclose a network call. */
export class OperationEngine {
  constructor(
    private readonly repository: Repository,
    private readonly chain: ChainPorts,
    private readonly budget = { milliseconds: 25000, now: () => Date.now() },
  ) {}
  private async io<T>(
    deadline: number,
    callback: () => Promise<T>,
  ): Promise<T> {
    if (this.budget.now() >= deadline)
      throw new IntegrityError("REQUEST_BUDGET_EXCEEDED");
    const result = await callback();
    if (this.budget.now() >= deadline)
      throw new IntegrityError("REQUEST_BUDGET_EXCEEDED");
    return result;
  }
  async create(
    owner: string,
    key: string,
    intent: OperationIntent,
    domain: Domain,
  ) {
    return this.repository.create(owner, key, intent, domain);
  }
  async status(id: string, owner: string) {
    const operation = await this.repository.get(id, owner);
    const steps = await this.repository.steps(id);
    // Whitelist DTO. Signed bytes, calldata, plan, complete intent and private RPC errors stay server-only.
    return {
      id: operation.id,
      state: operation.state,
      version: operation.version,
      microchip:
        operation.intent.kind === "create"
          ? operation.intent.buffalo.microchip
          : operation.intent.microchip,
      actualToken: operation.actualToken,
      reason: operation.reason,
      steps: steps.map((step) => ({
        kind: step.kind,
        state: step.state,
        hash: step.hash,
        receipt: step.receipt,
      })),
      canResume: !["DRAFT", "COMPLETED", "CANCELLED", "NEEDS_REVIEW"].includes(
        operation.state,
      ),
    };
  }
  private async withClaim<T>(
    id: string,
    owner: string,
    callback: (claim: Claim, operation: Operation) => Promise<T>,
  ): Promise<T | null> {
    await this.repository.get(id, owner);
    const claim = await this.repository.claim(id, owner, randomUUID());
    if (!claim) return null;
    try {
      return await callback(claim, await this.repository.get(id, owner));
    } finally {
      await this.repository.release(claim);
    }
  }
  async prepare(id: string, owner: string, expectedVersion: number) {
    await this.withClaim(id, owner, async (claim, operation) => {
      if (operation.state !== "DRAFT" || operation.version !== expectedVersion)
        throw new IntegrityError("STALE_DRAFT_REVISION");
      const plan = await this.io(
        this.budget.now() + this.budget.milliseconds,
        () => this.chain.prepare(operation),
      );
      assertPlan(plan, operation);
      await this.repository.ready(claim, plan);
    });
    return this.status(id, owner);
  }
  async cancel(id: string, owner: string) {
    await this.withClaim(id, owner, async (claim) =>
      this.repository.cancel(claim),
    );
    return this.status(id, owner);
  }
  async advance(
    id: string,
    owner: string,
    action: "mint" | "metadata" | "resume",
    expectedVersion?: number,
  ) {
    await this.withClaim(id, owner, async (claim, initial) => {
      if (expectedVersion !== undefined && initial.version !== expectedVersion)
        throw new IntegrityError("STALE_OPERATION_REVISION");
      if (["DRAFT", "CANCELLED"].includes(initial.state))
        throw new IntegrityError("INVALID_OPERATION_STAGE");
      if (["COMPLETED", "NEEDS_REVIEW"].includes(initial.state)) return;
      if (!initial.plan) throw new IntegrityError("NO_APPROVED_PLAN");
      try {
        await this.advanceClaim(
          claim,
          initial,
          action,
          this.budget.now() + this.budget.milliseconds,
        );
      } catch (error) {
        if (error instanceof IntegrityError) {
          // Stale workers never change state or broadcast; the current owner reconciles its journal.
          if (error.code.startsWith("STALE_")) return;
          if (error.code === "EXPLICIT_MINT_ACTION_REQUIRED") throw error;
          if (error.code === "REQUEST_BUDGET_EXCEEDED") {
            const steps = await this.repository.steps(id);
            await this.repository.setState(
              claim,
              steps.some((step) => step.hash)
                ? "RECOVERY_REQUIRED"
                : "RETRYABLE",
              error.code,
            );
            return;
          }
          await this.repository.setState(claim, "NEEDS_REVIEW", error.code);
        } else {
          const steps = await this.repository.steps(id);
          await this.repository.setState(
            claim,
            steps.some((step) => step.hash) ? "RECOVERY_REQUIRED" : "RETRYABLE",
            "ADAPTER_UNAVAILABLE",
          );
        }
      }
    });
    return this.status(id, owner);
  }
  private async advanceClaim(
    claim: Claim,
    initial: Operation,
    action: "mint" | "metadata" | "resume",
    deadline: number,
  ) {
    let operation = initial;
    const plan = operation.plan!;
    let steps = await this.repository.steps(operation.id);
    if (
      steps.length > 8 ||
      steps.some((step) => step.expected.effects.length > 16)
    )
      throw new IntegrityError("OPERATION_BOUND_EXCEEDED");
    // Re-check canonicality/effects for every confirmed prerequisite before another irreversible action or publication.
    for (const previous of steps.filter((step) => step.state === "CONFIRMED")) {
      if (!(await this.reconcile(claim, operation, previous, deadline))) return;
    }
    let current = steps.find((step) => step.state !== "CONFIRMED");
    if (!current) {
      operation = await this.repository.get(claim.id, claim.owner);
      const spec = await this.io(deadline, () =>
        this.chain.nextStep(operation, steps),
      );
      if (!spec) {
        if (!steps.length) throw new IntegrityError("NO_CHAIN_PROOF");
        await this.repository.setState(claim, "PROJECTING");
        const proof = await this.io(deadline, () =>
          this.chain.project(operation, steps),
        );
        await this.repository.setState(
          claim,
          "VERIFYING",
          undefined,
          asJson(proof),
        );
        if (
          !(await this.io(deadline, () =>
            this.chain.verifyPublication(operation, steps, proof),
          ))
        )
          throw new IntegrityError("PUBLICATION_PROOF_MISMATCH");
        await this.repository.complete(claim, proof);
        return;
      }
      if (spec.kind === "mint") {
        if (steps.some((step) => step.kind === "mint"))
          throw new IntegrityError("REMINT_FORBIDDEN");
        if (action !== "mint")
          throw new IntegrityError("EXPLICIT_MINT_ACTION_REQUIRED");
      } else if (
        steps.some((step) => step.kind === "mint") &&
        !steps.some((step) => step.kind !== "mint") &&
        action !== "metadata"
      ) {
        await this.repository.setState(claim, "AWAITING_METADATA_ACTION");
        return;
      }
      if (!spec.call.effects.length || BigInt(spec.call.value) !== 0n)
        throw new IntegrityError("MISSING_EFFECT_CONTRACT");
      if (steps.length >= 8 || spec.call.effects.length > 16)
        throw new IntegrityError("OPERATION_BOUND_EXCEEDED");
      current = await this.repository.reserveStep(
        claim,
        spec,
        steps.length,
        plan,
      );
      steps = [...steps, current];
    }
    if (current.state === "REVERTED" || current.state === "REVIEW") {
      await this.repository.setState(
        claim,
        "NEEDS_REVIEW",
        "STEP_REQUIRES_REVIEW",
      );
      return;
    }
    if (current.signedBytes) {
      if (await this.reconcile(claim, operation, current, deadline)) {
        const nextState =
          current.kind === "mint" ? "AWAITING_METADATA_ACTION" : "CHAIN_STEPS";
        await this.repository.setState(claim, nextState);
      }
      return;
    }
    const wallet = await this.repository.wallet(claim, current);
    if (!wallet) {
      await this.repository.setState(claim, "READY", "WALLET_QUEUE_BUSY");
      return;
    }
    const sender = current.sender;
    const nonce = await this.io(deadline, () => this.chain.nonce(sender));
    if (nonce.pending !== nonce.latest) {
      await this.repository.setState(
        claim,
        "RECOVERY_REQUIRED",
        "UNMANAGED_PENDING_NONCE",
      );
      return;
    }
    if (
      !Number.isSafeInteger(nonce.latest) ||
      nonce.latest < 0 ||
      !Number.isSafeInteger(nonce.pending)
    )
      throw new IntegrityError("INVALID_NONCE");
    const signingStep = current;
    const signed = await this.io(deadline, () =>
      this.chain.sign(operation, signingStep, nonce.latest),
    );
    await verifySignedEnvelope(current, signed, nonce.latest, plan);
    await this.repository.journal(claim, wallet, current, signed); // durable BEFORE any network broadcast
    const journaled = (await this.repository.steps(operation.id)).find(
      (entry) => entry.id === current.id,
    )!;
    // This is also the recovery path after a crash immediately before broadcast.
    await this.broadcast(claim, journaled, deadline);
  }
  private async broadcast(claim: Claim, step: Step, deadline: number) {
    try {
      await this.repository.assertBroadcast(claim, step);
      const hash = await this.io(deadline, () =>
        this.chain.broadcast(step.signedBytes!),
      );
      if (hash.toLowerCase() !== step.hash!.toLowerCase())
        throw new IntegrityError("BROADCAST_HASH_MISMATCH");
      await this.repository.markStep(claim, step, "PENDING");
      await this.repository.setState(claim, "CHAIN_PENDING");
    } catch (error) {
      if (error instanceof IntegrityError) throw error;
      await this.repository.markStep(claim, step, "UNKNOWN");
      await this.repository.setState(
        claim,
        "BROADCAST_UNKNOWN",
        "BROADCAST_RESULT_UNKNOWN",
      );
    }
  }
  private async reconcile(
    claim: Claim,
    operation: Operation,
    current: Step,
    deadline: number,
  ): Promise<boolean> {
    const observation = await this.io(deadline, () =>
      this.chain.observe(current),
    );
    if (observation.state === "pending") {
      await this.repository.setState(claim, "CHAIN_PENDING");
      return false;
    }
    if (observation.state === "missing") {
      if (current.nonce === null)
        throw new IntegrityError("MISSING_DURABLE_NONCE");
      if (observation.latestNonce > Number(current.nonce)) {
        await this.repository.markStep(claim, current, "REVIEW");
        throw new IntegrityError("NONCE_CONSUMED_BY_UNKNOWN_TRANSACTION");
      }
      if (current.state === "CONFIRMED") {
        await this.repository.markStep(claim, current, "UNKNOWN");
        await this.repository.setState(
          claim,
          "RECOVERY_REQUIRED",
          "CONFIRMED_RECEIPT_DISAPPEARED",
        );
        return false;
      }
      const wallet = await this.repository.wallet(claim, current);
      if (!wallet) {
        await this.repository.setState(
          claim,
          "RECOVERY_REQUIRED",
          "WALLET_RESERVATION_CONFLICT",
        );
        return false;
      }
      await this.broadcast(claim, current, deadline); // identical bytes/hash/nonce only, never re-sign
      return false;
    }
    const receipt = observation.receipt;
    if (receipt.transactionHash.toLowerCase() !== current.hash?.toLowerCase())
      throw new IntegrityError("RECEIPT_HASH_MISMATCH");
    if (
      !observation.canonical ||
      (current.receipt && receipt.blockHash !== current.receipt.blockHash)
    ) {
      await this.repository.markStep(claim, current, "UNKNOWN", receipt);
      await this.repository.setState(
        claim,
        "RECOVERY_REQUIRED",
        "REORG_UNCERTAINTY",
      );
      return false;
    }
    if (observation.confirmations < operation.plan!.confirmations) {
      await this.repository.setState(claim, "CHAIN_PENDING");
      return false;
    }
    if (receipt.status === "reverted") {
      await this.repository.markStep(claim, current, "REVERTED", receipt);
      await this.repository.releaseWallet(claim, current);
      throw new IntegrityError("TRANSACTION_REVERTED");
    }
    const proof = await this.io(deadline, () =>
      this.chain.verifyEffects(operation, current, receipt),
    );
    await this.repository.markStep(claim, current, "CONFIRMED", receipt, proof);
    await this.repository.releaseWallet(claim, current);
    return true;
  }
}
