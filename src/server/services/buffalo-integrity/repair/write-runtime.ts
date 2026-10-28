import { repairRevisionGuard } from "./chainadapter";
import { repairPublicStorage } from "./public-storage";
import {
  runtimeConfig,
  readRuntimeConfig,
  assertNewOperationAllowed,
} from "../release/config";
import { randomUUID } from "crypto";
import { createPublicClient, http, type Abi, type Address } from "viem";
import { db } from "~/server/db";
import { bindOperationId, diagnosticFor } from "~/server/diagnostics/reporter";
import { DiagnosticError } from "~/server/diagnostics/errors";
import { address as nft } from "~/server/blockchain/nft/abi";
import { address as manager } from "~/server/blockchain/metadata-maneger/abi";
import { getCreateRuntime } from "../create/runtime";
import { type CreateChain } from "../create/workflow";
import { OperationEngine } from "../operations/engine";
import { PostgresOperationRepository } from "../operations/postgres";
import { IntegrityError, payloadHash } from "../operations/hash";
import { type Operation, type Claim } from "../operations/types";
import { writeMode } from "../release/config";
import { getRepairDiagnosis, repairRpcUrl } from "./runtime";
import { buildRepairIntent, verifyApproval } from "./approval";
import { RepairWorkflow, repairIntent } from "./workflow";
import { projectedRepairRow } from "./db-projection";
import {
  repairPrepareSchema,
  repairApproveSchema,
  repairAdvanceSchema,
  repairIdSchema,
  repairKeySchema,
  type RepairWriteRuntime,
  type RepairExecutionView,
} from "./execution-contract";

function enabled() {
  return (
    process.env.BUFFALO_REPAIR_MODE === "enabled" &&
    process.env.BUFFALO_REPAIR_EXTERNAL_ADMIN_COORDINATION === "confirmed" &&
    writeMode() === "enabled"
  );
}
function canRecover() {
  return (
    writeMode() !== "off" &&
    process.env.BUFFALO_REPAIR_EXTERNAL_ADMIN_COORDINATION === "confirmed"
  );
}
function assertNew() {
  if (!enabled()) throw new IntegrityError("REPAIR_EXECUTION_DISABLED");
  assertNewOperationAllowed();
  assertReadTarget();
}
function assertReadTarget() {
  const config = readRuntimeConfig();
  if (config.databaseUrl !== process.env.DATABASE_URL)
    throw new IntegrityError("CHAIN_DOMAIN_CONFLICT");
}
function secret() {
  return process.env.BUFFALO_REPAIR_RECEIPT_SECRET ?? process.env.secret ?? "";
}
/** Capability and read recovery do not initialize a signer or storage writer. */
export function getRepairWriteRuntime(): RepairWriteRuntime {
  const repository = new PostgresOperationRepository(db);
  const readChain = (): CreateChain => {
    const client = createPublicClient({
      transport: http(repairRpcUrl(), { timeout: 12000, retryCount: 0 }),
    });
    const read = client.readContract as (args: {
      address: Address;
      abi: Abi;
      functionName: string;
      args: unknown[];
      blockNumber?: bigint;
    }) => Promise<unknown>;
    return {
      domain: { chainId: 96, nft, manager },
      sender: "",
      receiver: "",
      maxFeeWei: "50000000000000000",
      read: (contract, abi, functionName, args = [], blockNumber) =>
        read({
          address: contract as Address,
          abi,
          functionName,
          args,
          blockNumber,
        }),
      block: async (number) => {
        const value = await client.getBlock(
          number === undefined ? {} : { blockNumber: number },
        );
        if (!value.hash || value.number === null)
          throw new IntegrityError("CANONICAL_BLOCK_REQUIRED");
        return { number: value.number, hash: value.hash };
      },
    };
  };
  const publicStorage = () =>
    repairPublicStorage(process.env.NEXT_PUBLIC_supabase_url ?? "");
  const readWorkflow = () =>
    new RepairWorkflow(
      db,
      repository,
      readChain(),
      publicStorage(),
      secret(),
      repairRevisionGuard(repairRpcUrl()),
      publicStorage(),
    );
  const writer = () => {
    const base = getCreateRuntime();
    if (!base.portsFactory)
      throw new IntegrityError("INTEGRITY_PORT_CONFIGURATION_REQUIRED");
    const workflow = new RepairWorkflow(
      base.db,
      base.drafts.operations,
      base.workflow.chain,
      base.storage,
      secret(),
      repairRevisionGuard(runtimeConfig().value.rpcUrl),
      publicStorage(),
    );
    const confirmed = async (id: string) =>
      (await base.drafts.operations.steps(id)).filter(
        (s) => s.state === "CONFIRMED",
      );
    const ports = base.portsFactory({
      prepare: (op) => workflow.prepare(op),
      nextStep: (op, steps) => workflow.nextStep(op, steps),
      beforeSign: async (op) => workflow.guard(op, await confirmed(op.id)),
      beforeBroadcast: async (op) => workflow.guard(op, await confirmed(op.id)),
      reconcileCurrent: async (op, step) =>
        workflow.guard(
          op,
          [
            ...(await confirmed(op.id)).filter((s) => s.id !== step.id),
            step,
          ].sort((a, b) => a.ordinal - b.ordinal),
        ),
      project: (op, steps, claim) => workflow.project(op, steps, claim),
      verifyPublication: (op, steps, proof) =>
        workflow.verifyPublication(op, steps, proof),
    });
    return {
      engine: new OperationEngine(base.drafts.operations, ports),
      workflow,
      assertCanStart: base.assertCanStart,
    };
  };
  async function view(owner: string, id: string): Promise<RepairExecutionView> {
    repairIdSchema.parse({ id });
    bindOperationId(id);
    const op = await repository.get(id, owner),
      intent = repairIntent(op),
      m = intent.manifest;
    verifyApproval(owner, intent, secret());
    const steps = await repository.steps(id);
    const canResume =
      canRecover() &&
      !["DRAFT", "COMPLETED", "CANCELLED", "NEEDS_REVIEW"].includes(op.state);
    return {
      id,
      key: id,
      state: op.state,
      version: op.version,
      mode: intent.mode,
      manifestHash: intent.manifestHash,
      approvalFingerprint: intent.approvalFingerprint,
      review: {
        targets: m.targets,
        beforeAfter: m.targets.map((target) => {
          const d = m.database.targets.find(
            (t) => t.sourceMicrochip === target.sourceMicrochip,
          )!;
          const c = m.chain.tokens.find(
            (t) => t.tokenId === target.desiredTokenId,
          )!;
          return {
            sourceMicrochip: target.sourceMicrochip,
            desiredMicrochip: target.desiredMicrochip,
            desiredTokenId: target.desiredTokenId,
            before: {
              database: d.baseline,
              chain: {
                ...c,
                metadata: c.before,
                dna: (c.before.certify as Record<string, string>).dna ?? "",
                microchip: (c.before.certify as Record<string, string>)
                  .microchip!,
              },
            },
            after: {
              database: projectedRepairRow(d),
              chain: {
                ...c,
                metadata: c.desired,
                dna: (c.desired.certify as Record<string, string>).dna ?? "",
                tokenUri: m.assets.find(
                  (a) => a.tokenId === target.desiredTokenId,
                )!.json.url,
                microchip: target.desiredMicrochip,
              },
            },
          };
        }),
        effects: m.effects,
        assets: m.assets.map((a) => ({
          tokenId: a.tokenId,
          imageUrl: a.image.url,
          jsonUrl: a.json.url,
          imageHash: a.image.hash,
          jsonHash: a.json.hash,
          publish: a.publish,
          uriChange: a.uriChange,
          aliases: a.aliases.map(({ key, url, beforeHash, afterHash }) => ({
            key,
            url,
            beforeHash,
            afterHash,
          })),
        })),
        fees: m.fees,
      },
      steps: steps.map((s) => ({
        kind: s.kind,
        ...(m.chain.steps[s.ordinal]?.tokenId
          ? { tokenId: m.chain.steps[s.ordinal]!.tokenId }
          : {}),
        state: s.state,
        hash: s.hash,
        receipt: s.receipt,
      })),
      ...(op.reason
        ? {
            diagnostic: diagnosticFor(new DiagnosticError(op.reason), {
              operationId: id,
              outcome: steps.some((s) => s.hash) ? "unknown" : "not_started",
              nextAction: canResume ? "resume_existing" : "contact_support",
            }),
          }
        : {}),
      canApprove: op.state === "DRAFT" && enabled(),
      canResume,
      canReviewReceipt:
        canRecover() &&
        op.state === "NEEDS_REVIEW" &&
        op.reason === "RECEIPT_TRANSACTION_MISMATCH" &&
        intent.mode === "chain" &&
        steps.some((s) => !!s.hash && !!s.signedBytes && s.kind !== "mint"),
      canCancel:
        !["COMPLETED", "CANCELLED"].includes(op.state) &&
        !steps.some((s) => s.signedBytes),
    };
  }
  async function claimed(
    owner: string,
    id: string,
    fn: (claim: Claim, op: Operation) => Promise<void>,
  ) {
    await repository.get(id, owner);
    bindOperationId(id);
    const claim = await repository.claim(id, owner, randomUUID());
    if (!claim) throw new IntegrityError("STALE_OPERATION_LEASE");
    try {
      await fn(claim, await repository.get(id, owner));
    } finally {
      await repository.release(claim);
    }
  }
  return {
    async capability() {
      const active = enabled();
      return {
        canPrepare: active,
        canApprove: active,
        canResume: canRecover(),
        singleOnly: process.env.BUFFALO_REPAIR_PAIR_ENABLED !== "true",
        ...(!active
          ? {
              diagnostic: diagnosticFor(
                new DiagnosticError("REPAIR_EXECUTION_DISABLED"),
              ),
            }
          : {}),
      };
    },
    async prepare(owner, raw) {
      const input = repairPrepareSchema.parse(raw);
      bindOperationId(input.key);
      const existing = await repository.getByKey(owner, input.key);
      if (existing) {
        if (
          repairIntent(existing).manifest.coverage.requestHash !==
          payloadHash(input)
        )
          throw new IntegrityError("IDEMPOTENCY_PAYLOAD_CONFLICT");
        return view(owner, existing.id);
      }
      assertNew();
      const intent = await buildRepairIntent(
        owner,
        input,
        getRepairDiagnosis(),
        readChain(),
        secret(),
        Date.now(),
        process.env.BUFFALO_REPAIR_PAIR_ENABLED === "true",
      );
      await repository.create(owner, input.key, intent, intent.manifest.domain);
      return view(owner, input.key);
    },
    async getByKey(owner, key) {
      repairKeySchema.parse({ key });
      bindOperationId(key);
      const op = await repository.getByKey(owner, key);
      return op ? view(owner, op.id) : null;
    },
    view,
    async approve(owner, raw) {
      const input = repairApproveSchema.parse(raw);
      assertNew();
      const op = await repository.get(input.id, owner),
        intent = repairIntent(op);
      verifyApproval(owner, intent, secret());
      if (
        intent.manifest.targets.length === 2 &&
        process.env.BUFFALO_REPAIR_PAIR_ENABLED !== "true"
      )
        throw new IntegrityError("REPAIR_PAIR_EXECUTION_DISABLED");
      if (intent.manifestHash !== input.manifestHash)
        throw new IntegrityError("REPAIR_MANIFEST_INVALID");
      if (Date.now() > intent.manifest.expiresAt)
        throw new IntegrityError("REPAIR_BASELINE_CHANGED");
      if (intent.mode === "database_only")
        await claimed(owner, input.id, async (claim, fresh) => {
          if (
            fresh.version !== input.expectedVersion ||
            fresh.state !== "DRAFT"
          )
            throw new IntegrityError("STALE_DRAFT_REVISION");
          await readWorkflow().guard(fresh, []);
          await repository.readyDatabaseRepair(
            claim,
            {
              kind: "database_repair",
              domain: fresh.domain,
              approvalFingerprint: intent.approvalFingerprint,
              context: { manifestHash: intent.manifestHash },
            },
            input.expectedVersion,
          );
        });
      else {
        const runtime = writer();
        runtime.assertCanStart?.();
        await runtime.engine.prepare(input.id, owner, input.expectedVersion);
      }
      return view(owner, input.id);
    },
    async advance(owner, raw) {
      if (!canRecover()) throw new IntegrityError("REPAIR_EXECUTION_DISABLED");
      const input = repairAdvanceSchema.parse(raw),
        op = await repository.get(input.id, owner),
        intent = repairIntent(op);
      if (input.reviewReceipt && intent.mode !== "chain")
        throw new IntegrityError("INVALID_OPERATION_STAGE");
      if (op.state === "COMPLETED") return view(owner, input.id);
      if (intent.mode === "database_only")
        await claimed(owner, input.id, async (claim, fresh) => {
          if (
            fresh.version !== input.expectedVersion ||
            fresh.state !== "READY"
          )
            throw new IntegrityError("STALE_OPERATION_REVISION");
          await readWorkflow().guard(fresh, []);
          await repository.completeDatabaseRepair(claim, input.expectedVersion);
        });
      else if (input.reviewReceipt)
        await writer().engine.reviewReceipt(
          input.id,
          owner,
          input.expectedVersion,
        );
      else
        await writer().engine.advance(
          input.id,
          owner,
          "resume",
          input.expectedVersion,
        );
      return view(owner, input.id);
    },
    async cancel(owner, id) {
      repairIdSchema.parse({ id });
      await claimed(owner, id, async (claim) => repository.cancel(claim));
      return view(owner, id);
    },
  };
}
