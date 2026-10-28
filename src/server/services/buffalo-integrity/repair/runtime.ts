import { publicRepairAssets } from "./assets";
import { createPublicClient, http, keccak256 } from "viem";
import { type PrismaClient, Prisma } from "@prisma/client";
import { db } from "~/server/db";
import { bitkub_mainnet } from "~/server/blockchain/chain";
import { abi, address } from "~/server/blockchain/metadata-maneger/abi";
import {
  abi as nftAbi,
  address as nftAddress,
} from "~/server/blockchain/nft/abi";
import { type RawMetadata } from "~/interfaces/i-metadata";
import { DiagnosticError } from "~/server/diagnostics/errors";
import { managerManifest } from "~/server/services/buffalo-integrity/field-policy";
import {
  asJson,
  payloadHash,
} from "~/server/services/buffalo-integrity/operations/hash";
import { RepairDiagnosis, VERIFIED_NFT_CODE_HASH } from "./diagnosis";
import {
  type DiagnosisPorts,
  type DatabaseSnapshot,
  type Pin,
} from "./contract";
function json(value: unknown) {
  return asJson(
    JSON.parse(
      JSON.stringify(value, (_key, item: unknown) =>
        typeof item === "bigint" ? item.toString() : item,
      ),
    ) as unknown,
  );
}
async function bounded<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const output: R[] = [];
  for (let i = 0; i < items.length; i += 8)
    output.push(...(await Promise.all(items.slice(i, i + 8).map(fn))));
  return output;
}
/** No wallet, writer configuration, storage JWT or mutation service is imported. */
export function createReadOnlyPorts(
  database: PrismaClient = db,
  rpcUrl = "https://rpc.bitkubchain.io",
): DiagnosisPorts {
  const client = createPublicClient({
    chain: bitkub_mainnet,
    transport: http(rpcUrl, {
      retryCount: 1,
      retryDelay: 10000,
      batch: { batchSize: 20, wait: 150 },
      timeout: 12000,
    }),
  });
  async function safe<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (cause) {
      if (cause instanceof DiagnosticError) throw cause;
      throw new DiagnosticError("REPAIR_SOURCE_UNAVAILABLE", { cause });
    }
  }
  async function domain(blockNumber: bigint) {
    const [
      chainId,
      block,
      nftCode,
      managerCode,
      managerNft,
      nftProof,
      managerProof,
    ] = await Promise.all([
      client.getChainId(),
      client.getBlock({ blockNumber }),
      client.getBytecode({ address: nftAddress, blockNumber }),
      client.getBytecode({ address, blockNumber }),
      client.readContract({
        address,
        abi,
        functionName: "jaothui",
        blockNumber,
      }),
      client.getProof({ address: nftAddress, storageKeys: [], blockNumber }),
      client.getProof({ address, storageKeys: [], blockNumber }),
    ]);
    const confirmedBlock = await client.getBlock({ blockNumber });
    if (
      confirmedBlock.hash !== block.hash ||
      chainId !== 96 ||
      !block.hash ||
      !nftCode ||
      !managerCode ||
      String(managerNft).toLowerCase() !== nftAddress.toLowerCase() ||
      nftProof.codeHash !== keccak256(nftCode) ||
      managerProof.codeHash !== keccak256(managerCode) ||
      !/^0x[0-9a-f]{64}$/i.test(nftProof.storageHash) ||
      !/^0x[0-9a-f]{64}$/i.test(managerProof.storageHash)
    )
      throw new DiagnosticError("REPAIR_BASELINE_CHANGED");
    return {
      chainId,
      nft: nftAddress.toLowerCase(),
      manager: address.toLowerCase(),
      blockNumber: blockNumber.toString(),
      blockHash: block.hash,
      nftCodeHash: keccak256(nftCode),
      managerCodeHash: keccak256(managerCode),
      nftStorageHash: nftProof.storageHash,
      managerStorageHash: managerProof.storageHash,
    };
  }
  return {
    assets: publicRepairAssets(process.env.NEXT_PUBLIC_supabase_url ?? ""),
    pin: () =>
      safe(async () => {
        const head = await client.getBlockNumber({ cacheTime: 0 });
        const block = head > 3n ? head - 3n : head;
        const result = await domain(block);
        const supply = await client.readContract({
          address: nftAddress,
          abi: nftAbi,
          functionName: "totalSupply",
          blockNumber: block,
        });
        if (result.nftCodeHash !== VERIFIED_NFT_CODE_HASH)
          throw new DiagnosticError("REPAIR_BASELINE_CHANGED");
        const next = (await client.readContract({
          address: nftAddress,
          abi: nftAbi,
          functionName: "getCurrentTokenId",
          blockNumber: block,
        })) as bigint;
        if (next < 1n || next > 10001n)
          throw new DiagnosticError("REPAIR_SCAN_INCOMPLETE");
        return {
          ...result,
          totalSupply: Number(supply),
          scanCount: Number(next - 1n),
          nextTokenId: next.toString(),
        };
      }),
    assertCurrent: (pin: Pin) =>
      safe(async () => {
        const head = await client.getBlockNumber({ cacheTime: 0 });
        const observed = await domain(BigInt(pin.blockNumber));
        const current = await domain(head);
        if (
          head < BigInt(pin.blockNumber) ||
          head - BigInt(pin.blockNumber) > 100n ||
          Object.entries(observed).some(
            ([key, value]) => pin[key as keyof Pin] !== value,
          ) ||
          current.nftCodeHash !== pin.nftCodeHash ||
          current.managerCodeHash !== pin.managerCodeHash ||
          current.nftStorageHash !== pin.nftStorageHash ||
          current.managerStorageHash !== pin.managerStorageHash
        )
          throw new DiagnosticError("REPAIR_BASELINE_CHANGED");
      }),
    enumerate: (pin, offset, count) =>
      safe(() =>
        bounded(
          Array.from({ length: count }, (_, index) => offset + index),
          async (index) => {
            const blockNumber = BigInt(pin.blockNumber);
            const tokenId = BigInt(index + 1); // Proven only for VERIFIED_NFT_CODE_HASH. Includes burned IDs.
            const initialized = await client.readContract({
              address,
              abi,
              functionName: "initialized",
              args: [tokenId],
              blockNumber,
            });
            const metadata = initialized
              ? ((await client.readContract({
                  address,
                  abi,
                  functionName: "getMetadata",
                  args: [tokenId],
                  blockNumber,
                })) as RawMetadata)
              : null;
            return {
              tokenId: tokenId.toString(),
              initialized: initialized as boolean,
              microchip: metadata?.certify.microchip ?? null,
              parentReferences: metadata
                ? [
                    metadata.relation.motherTokenId,
                    metadata.relation.fatherTokenId,
                  ].filter((value) => !!value && value !== "N/A")
                : [],
            };
          },
        ),
      ),
    tokens: (pin, ids) =>
      safe(() =>
        bounded(ids, async (id) => {
          const blockNumber = BigInt(pin.blockNumber),
            tokenId = BigInt(id);
          const metadata = (await client.readContract({
            address,
            abi,
            functionName: "getMetadata",
            args: [tokenId],
            blockNumber,
          })) as RawMetadata;
          const [owner, tokenUri, approvals] = await Promise.all([
            client.readContract({
              address: nftAddress,
              abi: nftAbi,
              functionName: "ownerOf",
              args: [tokenId],
              blockNumber,
            }),
            client.readContract({
              address: nftAddress,
              abi: nftAbi,
              functionName: "tokenURI",
              args: [tokenId],
              blockNumber,
            }),
            client.readContract({
              address,
              abi,
              functionName: "getApprovedByTokenId",
              args: [tokenId, false],
              blockNumber,
            }),
          ]);
          return {
            tokenId: id,
            microchip: metadata.certify.microchip,
            dna: metadata.certify.dna,
            metadata: asJson(managerManifest(metadata)),
            owner: owner as string,
            tokenUri: tokenUri as string,
            approvals: json(approvals),
            native: {
              createdAt: metadata.createdAt.toString(),
              updatedAt: metadata.updatedAt.toString(),
            },
          };
        }),
      ),
    aliases: (pin, chips) =>
      safe(() =>
        bounded(chips, async (microchip) => ({
          microchip,
          tokenId: (
            (await client.readContract({
              address,
              abi,
              functionName: "microchipToTokenId",
              args: [microchip],
              blockNumber: BigInt(pin.blockNumber),
            })) as bigint
          ).toString(),
        })),
      ),
    database: async () => {
      try {
        return await database.$transaction(
          async (tx) => {
            await tx.$executeRaw`SET TRANSACTION READ ONLY`;
            const rows = await tx.pedigree.findMany({
              orderBy: { microchip: "asc" },
            });
            const rewards = await tx.reward.findMany({
              orderBy: { id: "asc" },
            });
            const certificates = await tx.certificate.findMany({
              include: { approvers: { select: { wallet: true } } },
              orderBy: { microchip: "asc" },
            });
            const inventory = await tx.microchip.findMany({
              include: { MicrochipOrder: true },
              orderBy: { microchip: "asc" },
            });
            const reservations = await tx.$queryRaw<
              { key: string; operationId: string }[]
            >`SELECT key, operation_id::text AS "operationId" FROM buffalo_integrity.reservation ORDER BY key`;
            const catalog = await tx.$queryRaw<
              Record<string, unknown>[]
            >`SELECT c.conname, c.conrelid::regclass::text AS relation, c.confrelid::regclass::text AS target, c.condeferrable, pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND c.conrelid IN ('public."Pedigree"'::regclass,'public."Reward"'::regclass,'public."Certificate"'::regclass,'public."Microchip"'::regclass,'public."MicrochipOrder"'::regclass,'public."_CertificateToCertificateApprover"'::regclass) ORDER BY c.conname`;
            const references: DatabaseSnapshot["references"] = [
              ...rewards.map((row) => ({
                kind: "Reward",
                key: row.id,
                chips: [row.microchip],
                digest: payloadHash(json(row)),
              })),
              ...certificates.map((row) => ({
                kind: "Certificate",
                key: row.microchip,
                chips: [
                  row.microchip,
                  row.dadId,
                  row.momId,
                  row.fGranDadId,
                  row.fGrandMomId,
                  row.mGrandDadId,
                  row.mGrandMomId,
                ].filter((chip): chip is string => !!chip),
                digest: payloadHash(json(row)),
              })),
              ...inventory.map((row) => ({
                kind: "Microchip",
                key: String(row.id),
                chips: [row.microchip],
                digest: payloadHash(json(row)),
              })),
              ...rows
                .filter((row) => !!row.fatherId || !!row.motherId)
                .map((row) => ({
                  kind: "PedigreeGenealogy",
                  key: row.microchip,
                  chips: [row.fatherId, row.motherId].filter(
                    (chip): chip is string => !!chip,
                  ),
                  digest: payloadHash(json(row)),
                })),
            ];
            return {
              readAt: new Date().toISOString(),
              rows: rows.map((row) => ({
                microchip: row.microchip,
                tokenId: row.tokenId.toString(),
                baseline: json(row),
              })),
              references,
              reservations,
              catalogDigest: payloadHash(json(catalog)),
            };
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
            timeout: 20000,
          },
        );
      } catch (cause) {
        throw new DiagnosticError("REPAIR_DATABASE_UNAVAILABLE", { cause });
      }
    },
  };
}
export function getRepairDiagnosis() {
  if (process.env.BUFFALO_REPAIR_DIAGNOSIS_ENABLED !== "true")
    throw new DiagnosticError("REPAIR_DIAGNOSIS_DISABLED");
  return new RepairDiagnosis(
    createReadOnlyPorts(db, repairRpcUrl()),
    process.env.BUFFALO_REPAIR_RECEIPT_SECRET ?? process.env.secret ?? "",
  );
}

/** Server config only; explicit invalid URLs fail closed and never fall back. */
export function repairRpcUrl(): string {
  const value =
    process.env.BUFFALO_REPAIR_RPC_URL ?? "https://rpc.bitkubchain.io";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.hash)
      throw Error("invalid");
    return value;
  } catch (cause) {
    throw new DiagnosticError("REPAIR_DIAGNOSIS_DISABLED", { cause });
  }
}
