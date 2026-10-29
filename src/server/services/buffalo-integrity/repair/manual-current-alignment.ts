import { randomUUID } from "crypto";
import { type Prisma, type PrismaClient } from "@prisma/client";
import { createPublicClient, http, keccak256, type Hex, type Abi } from "viem";
import { abi as managerAbi } from "~/server/blockchain/metadata-maneger/abi";
import { abi as nftAbi } from "~/server/blockchain/nft/abi";
import { managerManifest } from "../field-policy";
import { type AssetStorage, contentHash } from "../create/storage";
import { type Operation, type Step } from "../operations/types";
import { PostgresOperationRepository } from "../operations/postgres";
import { IntegrityError, payloadHash, stableJson } from "../operations/hash";
import { assertReceiptTransaction } from "../operations/receipt-transaction";
import { verifyApproval } from "./approval";
import { repairIntent } from "./workflow";
import {
  applyRepairDatabaseProjection,
  readRepairDatabaseSnapshot,
  repairJson,
} from "./db-projection";

// Deliberate operator adjudication for the explicitly authorized incident only.
// It never asserts historical effect proof or completes the old automatic plan.
const CASE = "22ff9f83-3dc2-4ba4-aa7b-f291e642714f";
export const MANUAL_ALIGNMENT_REASON = "OPERATOR_CURRENT_STATE_RECONCILED";
export function operatorAligned(op: Operation): boolean {
  const result = op.result as { manualResolution?: { kind?: string } } | null;
  return (
    op.id === CASE &&
    op.state === "NEEDS_REVIEW" &&
    op.reason === MANUAL_ALIGNMENT_REASON &&
    result?.manualResolution?.kind ===
      "operator_current_state_database_alignment"
  );
}
export function canAlignCurrentCase(op: Operation, steps: Step[]): boolean {
  if (
    op.id !== CASE ||
    op.state !== "NEEDS_REVIEW" ||
    op.reason !== "RECEIPT_TRANSACTION_MISMATCH" ||
    op.intent.kind !== "identity_repair"
  )
    return false;
  const m = op.intent.manifest;
  return (
    m.targets.length === 1 &&
    m.targets[0]?.sourceMicrochip === "ฟ้าราชสีห์" &&
    m.targets[0]?.desiredMicrochip === "764040226601866" &&
    m.targets[0]?.desiredTokenId === "1347" &&
    m.chain.steps.length === 2 &&
    m.chain.steps[0]?.kind === "batch" &&
    m.chain.steps[1]?.kind === "uri" &&
    steps.length === 1 &&
    steps[0]?.kind === "batch" &&
    !!steps[0]?.signedBytes &&
    !!steps[0]?.hash
  );
}
const assert = (ok: unknown, code: string): void => {
  if (!ok) throw new IntegrityError(code);
};

export async function alignCurrentCase(
  db: PrismaClient,
  storage: AssetStorage,
  rpcUrl: string,
  secret: string,
  owner: string,
  input: { id: string; expectedVersion: number; manifestHash: string },
) {
  const repository = new PostgresOperationRepository(db);
  const op = await repository.get(input.id, owner);
  if (operatorAligned(op)) return;
  const intent = repairIntent(op),
    m = intent.manifest;
  const steps = await repository.steps(op.id);
  verifyApproval(owner, intent, secret);
  assert(
    canAlignCurrentCase(op, steps) &&
      op.version === input.expectedVersion &&
      intent.manifestHash === input.manifestHash,
    "INVALID_OPERATION_STAGE",
  );
  const step = steps[0]!,
    asset = m.assets[0]!,
    token = m.chain.tokens[0]!;
  const rpc = createPublicClient({
    transport: http(rpcUrl, { timeout: 12000, retryCount: 0 }),
  });
  const [transaction, receipt, head, chainId] = await Promise.all([
    rpc.getTransaction({ hash: step.hash as Hex }),
    rpc.getTransactionReceipt({ hash: step.hash as Hex }),
    rpc.getBlockNumber({ cacheTime: 0 }),
    rpc.getChainId(),
  ]);
  const receiptBlock = await rpc.getBlock({ blockNumber: receipt.blockNumber });
  assert(
    chainId === 96 &&
      receipt.status === "success" &&
      receiptBlock.hash === receipt.blockHash &&
      head - receipt.blockNumber + 1n >= 3n,
    "CANONICAL_RECEIPT_REQUIRED",
  );
  await assertReceiptTransaction(
    transaction,
    step,
    receipt.transactionHash,
    op.plan,
  );
  const receiptProof = {
    transactionHash: receipt.transactionHash,
    blockHash: receipt.blockHash,
    blockNumber: receipt.blockNumber.toString(),
    status: receipt.status,
  };
  const snapshot = async () => {
    const number = await rpc.getBlockNumber({ cacheTime: 0 });
    const block = await rpc.getBlock({ blockNumber: number });
    const read = (
      nft: boolean,
      functionName: string,
      args: readonly unknown[] = [],
    ) =>
      rpc.readContract({
        address: (nft ? m.domain.nft : m.domain.manager) as Hex,
        abi: (nft ? nftAbi : managerAbi) as Abi,
        functionName,
        args,
        blockNumber: number,
      });
    const [
      raw,
      nftOwner,
      approved,
      approvals,
      record,
      oldMap,
      newMap,
      counter,
      next,
      managerCode,
      nftCode,
    ] = await Promise.all([
      read(false, "getMetadata", [1347n]),
      read(true, "ownerOf", [1347n]),
      read(true, "getApproved", [1347n]),
      read(false, "getApprovedByTokenId", [1347n, false]),
      read(true, "tokenIdToUri", [1347n]),
      read(false, "microchipToTokenId", ["ฟ้าราชสีห์"]),
      read(false, "microchipToTokenId", ["764040226601866"]),
      read(false, "totalMetadata"),
      read(true, "getCurrentTokenId"),
      rpc.getBytecode({
        address: m.domain.manager as Hex,
        blockNumber: number,
      }),
      rpc.getBytecode({ address: m.domain.nft as Hex, blockNumber: number }),
    ]);
    const metadata = raw as Parameters<typeof managerManifest>[0];
    assert(
      payloadHash(managerManifest(metadata)) === payloadHash(token.desired),
      "CURRENT_STATE_CHANGED",
    );
    assert(
      metadata.createdAt === receiptBlock.timestamp &&
        metadata.updatedAt === receiptBlock.timestamp,
      "CURRENT_STATE_CHANGED",
    );
    assert(
      String(nftOwner).toLowerCase() === token.owner.toLowerCase() &&
        String(approved).toLowerCase() === token.nftApproved.toLowerCase() &&
        payloadHash(repairJson(approvals)) ===
          payloadHash(token.managerApprovals),
      "CURRENT_STATE_CHANGED",
    );
    assert(
      payloadHash(repairJson(record)) === payloadHash(token.nftRecord) &&
        oldMap === 1347n &&
        newMap === 1347n &&
        counter === BigInt(m.chain.metadataCounter) + 1n &&
        String(next) === String(m.chain.pin.nextTokenId),
      "CURRENT_STATE_CHANGED",
    );
    assert(
      managerCode &&
        nftCode &&
        keccak256(managerCode) === m.chain.pin.managerCodeHash &&
        keccak256(nftCode) === m.chain.pin.nftCodeHash,
      "UNSUPPORTED_CONTRACT_CODE",
    );
    assert(
      (await rpc.getBlock({ blockNumber: number })).hash === block.hash,
      "BASELINE_READ_REORG",
    );
    const state = repairJson({
      metadata: managerManifest(metadata),
      native: { createdAt: metadata.createdAt, updatedAt: metadata.updatedAt },
      nftOwner,
      approved,
      approvals,
      record,
      oldMap,
      newMap,
      counter,
      next,
    });
    return {
      block: { number: number.toString(), hash: block.hash },
      state,
      hash: payloadHash(state),
    };
  };
  const current = await snapshot();
  const before = await db.$transaction((tx) => readRepairDatabaseSnapshot(tx));
  const row = before.rows.find((r) => r.microchip === "ฟ้าราชสีห์");
  assert(
    row &&
      payloadHash(row.baseline) ===
        payloadHash(m.database.targets[0]!.baseline) &&
      !before.rows.some(
        (r) =>
          r.microchip === "764040226601866" ||
          (r.tokenId === "1347" && r.microchip !== "ฟ้าราชสีห์"),
      ),
    "REPAIR_BASELINE_CHANGED",
  );
  const [image, currentJson, backup] = await Promise.all([
    storage.get(asset.sourceImage.key),
    storage.get(asset.sourceJson.key),
    storage.get(
      `${asset.json.key.slice(0, asset.json.key.lastIndexOf("/"))}/manual-previous-nft.json`,
    ),
  ]);
  const originalJson =
    currentJson && contentHash(currentJson) === asset.sourceJson.hash
      ? currentJson
      : backup;
  assert(
    image &&
      contentHash(image) === asset.sourceImage.hash &&
      originalJson &&
      contentHash(originalJson) === asset.sourceJson.hash,
    "ASSET_BASELINE_CHANGED",
  );
  assert(
    currentJson &&
      [asset.sourceJson.hash, asset.json.hash].includes(
        contentHash(currentJson),
      ),
    "ASSET_BASELINE_CHANGED",
  );
  const jsonBytes = Buffer.from(stableJson(asset.json.body));
  assert(contentHash(jsonBytes) === asset.json.hash, "ASSET_BASELINE_CHANGED");
  const claim = await repository.claim(op.id, owner, randomUUID());
  if (!claim) throw new IntegrityError("STALE_OPERATION_LEASE");
  const fenced = async (tx: Prisma.TransactionClient) => {
    const rows = await tx.$queryRaw<
      { version: number; state: string; reason: string }[]
    >`SELECT version,state,reason FROM buffalo_integrity.operation WHERE id=${op.id}::uuid AND owner=${owner} AND fence=${BigInt(claim.fence)} AND lease_owner=${claim.holder} AND lease_until>clock_timestamp() FOR UPDATE`;
    assert(
      rows[0]?.version === input.expectedVersion &&
        rows[0]?.state === "NEEDS_REVIEW" &&
        rows[0]?.reason === "RECEIPT_TRANSACTION_MISMATCH",
      "STALE_OPERATION_REVISION",
    );
  };
  try {
    await db.$transaction(async (tx) => {
      await fenced(tx);
      await tx.$executeRaw`INSERT INTO buffalo_integrity.event(operation_id,kind,detail) VALUES (${op.id}::uuid,'OPERATOR_CURRENT_STATE_ALIGNMENT_STARTED',${JSON.stringify({ manifestHash: intent.manifestHash, checkpoint: current.block, transaction: step.hash, historicalEffectsVerified: false })}::jsonb)`;
    });
    const backupKey = `${asset.json.key.slice(0, asset.json.key.lastIndexOf("/"))}/manual-previous-nft.json`;
    await storage.putImmutable(backupKey, originalJson!, "application/json");
    await storage.putImmutable(asset.image.key, image!, "image/jpeg");
    await storage.putImmutable(asset.json.key, jsonBytes, "application/json");
    assert((await snapshot()).hash === current.hash, "CURRENT_STATE_CHANGED");
    if (!storage.replaceAlias)
      throw new IntegrityError("STORAGE_ORIGIN_UNAVAILABLE");
    const alias = asset.aliases.find((a) => a.mime === "application/json")!;
    await storage.replaceAlias(
      alias.key,
      jsonBytes,
      "application/json",
      asset.sourceJson.hash,
    );
    assert(
      contentHash((await storage.get(alias.key))!) === asset.json.hash,
      "ASSET_BASELINE_CHANGED",
    );
    await db.$transaction(
      async (tx) => {
        await fenced(tx);
        const reservations = await tx.$queryRaw<
          { key: string }[]
        >`SELECT key FROM buffalo_integrity.reservation WHERE operation_id=${op.id}::uuid ORDER BY key`;
        const prefix = `${m.domain.chainId}:${m.domain.nft.toLowerCase()}:`;
        const keys = [
          ...m.reservationChips.map((c) => `${prefix}chip:${c}`),
          ...m.reservationTokens.map((t) => `${prefix}token:${t}`),
        ].sort();
        assert(
          payloadHash(reservations.map((r) => r.key)) === payloadHash(keys),
          "REPAIR_RESERVATION_LOST",
        );
        const proof = await applyRepairDatabaseProjection(
          tx,
          m.database,
          intent.manifestHash,
        );
        const resolution = repairJson({
          kind: "operator_current_state_database_alignment",
          at: new Date().toISOString(),
          manifestHash: intent.manifestHash,
          databaseProof: proof,
          checkpoint: current,
          transaction: receiptProof,
          sourceJsonBackup: storage.publicUrl(backupKey),
          historicalEffectsVerified: false,
          originalAutomaticPlanCompleted: false,
          remainingUriStep: "not executed; original plan held for audit",
          releasedReservations: keys,
        });
        const updatedStep =
          await tx.$executeRaw`UPDATE buffalo_integrity.step SET state='REVIEW',receipt=${JSON.stringify(receiptProof)}::jsonb,proof=${JSON.stringify({ kind: "operator_current_state", transactionSuccess: true, historicalEffectsVerified: false })}::jsonb,updated_at=clock_timestamp() WHERE id=${step.id}::uuid AND operation_id=${op.id}::uuid AND transaction_hash=${step.hash} AND signed_bytes=${step.signedBytes}`;
        assert(updatedStep === 1, "STALE_OPERATION_REVISION");
        await tx.$executeRaw`UPDATE buffalo_integrity.operation SET reason=${MANUAL_ALIGNMENT_REASON},result=COALESCE(result,'{}'::jsonb)||${JSON.stringify({ manualResolution: resolution })}::jsonb,version=version+1,updated_at=clock_timestamp() WHERE id=${op.id}::uuid`;
        await tx.$executeRaw`UPDATE buffalo_integrity.wallet_lease SET active_step=NULL,lease_until=NULL,fence=fence+1 WHERE active_step=${step.id}::uuid AND chain_id=96 AND sender=${step.sender}`;
        await tx.$executeRaw`DELETE FROM buffalo_integrity.reservation WHERE operation_id=${op.id}::uuid`;
        await tx.$executeRaw`INSERT INTO buffalo_integrity.event(operation_id,step_id,kind,detail) VALUES (${op.id}::uuid,${step.id}::uuid,'OPERATOR_CURRENT_STATE_DATABASE_ALIGNED',${JSON.stringify(resolution)}::jsonb)`;
      },
      { maxWait: 2000, timeout: 15000 },
    );
  } finally {
    await repository.release(claim);
  }
}
