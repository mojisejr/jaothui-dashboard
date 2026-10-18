import { readFileSync } from "fs";
import { resolve, sep } from "path";
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
import { loopbackChainPorts, assertLoopbackUrl } from "../operations/loopback";
import { IntegrityError } from "../operations/hash";
import { type Domain } from "../operations/types";
import { DraftStore } from "./drafts";
import { localAssetStorage, type AssetStorage } from "./storage";
import { BuffaloCreateWorkflow, type CreateChain } from "./workflow";

export interface CreateRuntime {
  engine: OperationEngine;
  workflow: BuffaloCreateWorkflow;
  drafts: DraftStore;
  db: PrismaClient;
  storage: AssetStorage;
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
interface IsolatedConfig {
  databaseUrl: string;
  rpcUrl: string;
  privateKey: Hex;
  sender: string;
  receiver: string;
  domain: Domain;
  instanceId: string;
  codeHashes: Record<string, string>;
  storageDirectory: string;
  storageOrigin: string;
  projectionFailures?: number;
}
const cache = globalThis as typeof globalThis & {
  __buffaloCreateRuntime?: { path: string; value: CreateRuntime };
};
export function isolatedCreateEnabled() {
  return (
    process.env.NODE_ENV !== "production" &&
    !!process.env.BUFFALO_INTEGRITY_ISOLATED_CONFIG
  );
}
/** Live activation remains closed until Phase5. The compose factory above accepts real storage/chain ports. */
export function getCreateRuntime(): CreateRuntime {
  if (!isolatedCreateEnabled())
    throw new IntegrityError("INTEGRITY_FEATURE_DISABLED");
  const root = resolve(process.cwd(), ".tmp");
  const path = resolve(process.env.BUFFALO_INTEGRITY_ISOLATED_CONFIG!);
  if (!path.startsWith(root + sep))
    throw new IntegrityError("ISOLATED_CONFIG_OUTSIDE_TASK");
  if (cache.__buffaloCreateRuntime?.path === path)
    return cache.__buffaloCreateRuntime.value;
  const config = JSON.parse(readFileSync(path, "utf8")) as IsolatedConfig;
  const database = new URL(config.databaseUrl);
  if (
    database.hostname !== "127.0.0.1" ||
    !database.pathname.includes("integrity")
  )
    throw new IntegrityError("LOOPBACK_DATABASE_ONLY");
  assertLoopbackUrl(config.rpcUrl);
  const storage = localAssetStorage(
    config.storageDirectory,
    config.storageOrigin,
  );
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
    executionInstance: config.instanceId,
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
  const value = composeCreateRuntime(
    db,
    storage,
    chain,
    (workflow) =>
      loopbackChainPorts({
        expectedInstanceId: config.instanceId,
        rpcUrl: config.rpcUrl,
        privateKey: config.privateKey,
        domain: config.domain,
        codeHashes: config.codeHashes,
        maxFeeWei: "50000000000000000",
        prepare: (op) => workflow.prepare(op),
        nextStep: (op, steps) => workflow.nextStep(op, steps),
        project: (op) => workflow.project(op),
        verifyPublication: (op, steps, proof) =>
          workflow.verifyPublication(op, steps, proof),
      }),
    { projectionFailures: config.projectionFailures ?? 0 },
  );
  cache.__buffaloCreateRuntime = { path, value };
  return value;
}
