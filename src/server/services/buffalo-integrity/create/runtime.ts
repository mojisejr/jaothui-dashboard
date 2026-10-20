import { receiptEvidence } from "../operations/receipt-evidence";
import { PrismaClient } from "@prisma/client";
import {
  createPublicClient,
  http,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { OperationEngine } from "../operations/engine";
import { PostgresOperationRepository } from "../operations/postgres";
import {
  loopbackChainPorts,
  productionChainPorts,
  type LoopbackConfig,
} from "../operations/loopback";
import { IntegrityError } from "../operations/hash";
import { type ChainPorts, type Operation } from "../operations/types";
import { payloadHash } from "../operations/hash";
import { createClient } from "@supabase/supabase-js";
import {
  runtimeConfig,
  integrityEnabled,
  assertNewOperationAllowed,
  writeMode,
} from "../release/config";
import { DraftStore } from "./drafts";
import {
  localAssetStorage,
  supabaseAssetStorage,
  type AssetStorage,
} from "./storage";
import { BuffaloCreateWorkflow, type CreateChain } from "./workflow";

export interface CreateRuntime {
  engine: OperationEngine;
  workflow: BuffaloCreateWorkflow;
  drafts: DraftStore;
  db: PrismaClient;
  storage: AssetStorage;
  portsFactory?: (callbacks: WorkflowPorts) => ChainPorts;
  assertCanStart?: () => void;
  editFaults?: { projectionFailures?: number; pauseAfterBatch?: boolean };
}
export function composeCreateRuntime(
  db: PrismaClient,
  storage: AssetStorage,
  chain: CreateChain,
  makePorts: (
    workflow: BuffaloCreateWorkflow,
  ) => ReturnType<typeof loopbackChainPorts>,
  faults: { projectionFailures?: number } = {},
): CreateRuntime {
  const drafts = new DraftStore(db, new PostgresOperationRepository(db));
  const workflow = new BuffaloCreateWorkflow(
    db,
    drafts,
    storage,
    chain,
    faults,
  );
  const ports = makePorts(workflow);
  return {
    db,
    drafts,
    storage,
    workflow,
    engine: new OperationEngine(drafts.operations, ports),
  };
}
export type WorkflowPorts = Pick<
  LoopbackConfig,
  | "prepare"
  | "beforeSign"
  | "beforeBroadcast"
  | "reconcileCurrent"
  | "nextStep"
  | "project"
  | "verifyPublication"
>;
const cache = globalThis as typeof globalThis & {
  __buffaloCreateRuntime?: { key: string; value: CreateRuntime };
};
export const isolatedCreateEnabled = integrityEnabled;
/** Explicit activation; production never loads the inherited legacy minter or browser storage key. */
export function getCreateRuntime(): CreateRuntime {
  const selection = runtimeConfig(),
    config = selection.value;
  if (cache.__buffaloCreateRuntime?.key === selection.key)
    return cache.__buffaloCreateRuntime.value;
  const production = selection.kind === "production";
  const isolated = !production ? selection.value : null;
  const instance = production
    ? `production:${payloadHash({ domain: selection.value.domain, checkpoint: selection.value.checkpoint })}`
    : selection.value.instanceId;
  const storage =
    production || isolated?.storageUrl
      ? supabaseAssetStorage(
          createClient(
            production ? selection.value.storageUrl : isolated!.storageUrl!,
            process.env.NEXT_PUBLIC_supabase_key!,
            {
              global: {
                headers: {
                  Authorization: `Bearer ${production ? selection.value.storageJwt : isolated!.storageJwt!}`,
                },
              },
              auth: {
                persistSession: false,
                autoRefreshToken: false,
                detectSessionInUrl: false,
              },
            },
          ),
          "slipstorage",
        )
      : localAssetStorage(isolated!.storageDirectory, isolated!.storageOrigin);
  const db = new PrismaClient({
    datasources: { db: { url: config.databaseUrl } },
  });
  const client = createPublicClient({
    transport: http(config.rpcUrl, { timeout: 8000, retryCount: 0 }),
  });
  const read = client.readContract as (args: {
    address: Address;
    abi: Abi;
    functionName: string;
    args: readonly unknown[];
    blockNumber?: bigint;
  }) => Promise<unknown>;
  const chain: CreateChain = {
    domain: config.domain,
    sender: config.sender,
    receiver: config.receiver,
    executionInstance: instance,
    confirmations: production ? selection.value.confirmations : 3,
    maxFeeWei: production ? selection.value.maxFeeWei : "50000000000000000",
    block: async (number) => {
      const block = await client.getBlock(
        number === undefined ? {} : { blockNumber: number },
      );
      if (block.number === null || !block.hash)
        throw new IntegrityError("CANONICAL_BLOCK_REQUIRED");
      return { number: block.number, hash: block.hash };
    },
    read: (contract, abi, functionName, args = [], blockNumber) =>
      read({
        address: contract as Address,
        abi,
        functionName,
        args,
        blockNumber,
      }),
  };
  const drafts = new DraftStore(db, new PostgresOperationRepository(db));
  const makePorts = (callbacks: WorkflowPorts): ChainPorts => {
    const options = {
      ...callbacks,
      expectedInstanceId: instance,
      rpcUrl: config.rpcUrl,
      privateKey: config.privateKey as Hex,
      domain: config.domain,
      codeHashes: config.codeHashes,
      maxFeeWei: chain.maxFeeWei!,
      beforeSign: async (op: Operation) => {
        if (
          writeMode() !== "enabled" &&
          !(await drafts.operations.steps(op.id)).some((s) => s.signedBytes)
        )
          throw new IntegrityError("INTEGRITY_WRITES_PAUSED");
        await callbacks.beforeSign?.(op);
      },
    };
    return production
      ? productionChainPorts({
          ...options,
          checkpoint: selection.value.checkpoint,
        })
      : loopbackChainPorts(options);
  };
  const value = composeCreateRuntime(
    db,
    storage,
    chain,
    (workflow) =>
      makePorts({
        prepare: (op) => workflow.prepare(op),
        nextStep: (op, steps) => workflow.nextStep(op, steps),
        beforeSign: async (op) =>
          workflow.guard(
            op,
            (await drafts.operations.steps(op.id)).filter(
              (s) => s.state === "CONFIRMED",
            ),
          ),
        beforeBroadcast: async (op) =>
          workflow.guard(
            op,
            (await drafts.operations.steps(op.id)).filter(
              (s) => s.state === "CONFIRMED",
            ),
          ),
        reconcileCurrent: async (op, step) =>
          workflow.guard(
            op,
            [
              ...(await drafts.operations.steps(op.id)).filter(
                (s) => s.state === "CONFIRMED" && s.id !== step.id,
              ),
              step,
            ].sort((a, b) => a.ordinal - b.ordinal),
            step.receipt &&
              receiptEvidence(op, step, step.receipt)?.observedHead
              ? BigInt(
                  receiptEvidence(op, step, step.receipt)!.observedHead!.number,
                )
              : undefined,
          ),
        project: async (op, steps) => {
          await workflow.guard(op, steps);
          return workflow.project(op);
        },
        verifyPublication: async (op, steps, proof) => {
          await workflow.guard(op, steps);
          return workflow.verifyPublication(op, steps, proof);
        },
      }),
    { projectionFailures: isolated?.projectionFailures ?? 0 },
  );
  value.portsFactory = makePorts;
  value.assertCanStart = assertNewOperationAllowed;
  value.editFaults = {
    projectionFailures: isolated?.editProjectionFailures ?? 0,
    pauseAfterBatch: isolated?.editPauseAfterBatch ?? false,
  };
  cache.__buffaloCreateRuntime = { key: selection.key, value };
  return value;
}
