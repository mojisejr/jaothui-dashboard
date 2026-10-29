import { PrismaClient, type Pedigree } from "@prisma/client";
import { displayedImageUrl } from "../publication-readback";
import {
  createPublicClient,
  http,
  keccak256,
  type Abi,
  type Address,
} from "viem";
import { address as nftAddress } from "~/server/blockchain/nft/abi";
import { address as managerAddress } from "~/server/blockchain/metadata-maneger/abi";
import { abi as nftAbi } from "~/server/blockchain/nft/abi";
import { abi as managerAbi } from "~/server/blockchain/metadata-maneger/abi";
import { type RawMetadata } from "~/interfaces/i-metadata";
import { type DiagnosticEnvelope } from "~/lib/buffalo-diagnostics";
import { reportDiagnostic } from "~/server/diagnostics/reporter";
import { readRuntimeConfig, runtimeConfig, writeMode } from "../release/config";
import { IntegrityError, payloadHash } from "../operations/hash";
import { type ChainDomain } from "../identity";
import { readBuffaloMetadata, type MetadataReadPorts } from "../read";
import { revisionOf } from "./contract";
export interface WriteAvailability {
  available: boolean;
  diagnostic?: DiagnosticEnvelope;
}
export function writerAvailability(): WriteAvailability {
  try {
    runtimeConfig();
    if (writeMode() !== "enabled")
      throw new IntegrityError("INTEGRITY_WRITES_PAUSED");
    return { available: true };
  } catch (cause) {
    return {
      available: false,
      diagnostic: reportDiagnostic(cause, { outcome: "not_started" }),
    };
  }
}
export function createReadDetails(
  domain: ChainDomain,
  ports: MetadataReadPorts,
  availability = writerAvailability,
) {
  return async (chip: string) => {
    let displayed: Pedigree | null = null;
    const result = await readBuffaloMetadata(chip, domain, {
      ...ports,
      findCow: async (chip) => {
        displayed = await ports.findCow(chip);
        return displayed;
      },
    });
    if (!result) return null;
    return {
      ...result,
      revision: revisionOf(displayed!),
      writeAvailability: availability(),
    };
  };
}
const cache = globalThis as typeof globalThis & {
  __buffaloReadDatabases?: Map<string, PrismaClient>;
  __buffaloReadRuntime?: {
    key: string;
    details: ReturnType<typeof createReadDetails>;
  };
};
function readDatabase(url: string) {
  cache.__buffaloReadDatabases ??= new Map();
  const key = payloadHash({ url });
  let db = cache.__buffaloReadDatabases.get(key);
  if (!db) {
    db = new PrismaClient({ datasources: { db: { url } }, log: [] });
    cache.__buffaloReadDatabases.set(key, db);
  }
  return db;
}
export function getEditReadDetails() {
  let config: ReturnType<typeof readRuntimeConfig>;
  try {
    config = readRuntimeConfig();
  } catch (cause) {
    // An explicit isolated target must never fall back to the application DB.
    if (process.env.BUFFALO_INTEGRITY_ISOLATED_CONFIG) throw cause;
    let target: URL;
    try {
      target = new URL(process.env.DATABASE_URL ?? "");
    } catch {
      throw new IntegrityError("POSTGRES_REQUIRED");
    }
    if (!["postgres:", "postgresql:"].includes(target.protocol))
      throw new IntegrityError("POSTGRES_REQUIRED");
    const db = readDatabase(target.href);
    const details = createReadDetails(
      { chainId: 96, nft: nftAddress, manager: managerAddress },
      {
        findCow: (microchip) =>
          db.pedigree.findUnique({ where: { microchip } }),
        readChain: async () => {
          throw cause;
        },
      },
    );
    return async (chip: string) => {
      const result = await details(chip);
      if (!result) return null;
      const diagnostic = reportDiagnostic(cause, { outcome: "not_started" });
      return {
        ...result,
        sync: {
          ...result.sync,
          status: "unavailable" as const,
          reason: diagnostic.code,
          diagnostic,
        },
        writeAvailability: { available: false, diagnostic },
      };
    };
  }
  const key = payloadHash({ ...config, checkpoint: config.checkpoint ?? null });
  if (cache.__buffaloReadRuntime?.key === key)
    return cache.__buffaloReadRuntime.details;
  const db = readDatabase(config.databaseUrl);
  const client = createPublicClient({
    transport: http(config.rpcUrl, { timeout: 3000, retryCount: 0 }),
  });
  const read = (
    address: string,
    abi: Abi,
    functionName: string,
    args: readonly unknown[],
    blockNumber: bigint,
  ) =>
    client.readContract({
      address: address as Address,
      abi,
      functionName,
      args,
      blockNumber,
    });
  const details = createReadDetails(config.domain, {
    findCow: (microchip) => db.pedigree.findUnique({ where: { microchip } }),
    imageForCow: (row) =>
      displayedImageUrl(
        `${config.storageOrigin}/buffalo/${row.tokenId.toString()}.jpg`,
        row,
      ),
    readChain: async (row) => {
      if ((await client.getChainId()) !== config.domain.chainId)
        throw new IntegrityError("CHAIN_DOMAIN_CONFLICT");
      if (config.checkpoint) {
        const block = await client.getBlock({
          blockNumber: BigInt(config.checkpoint.number),
        });
        if (block.hash?.toLowerCase() !== config.checkpoint.hash.toLowerCase())
          throw new IntegrityError("CHECKPOINT_MISMATCH");
      }
      const blockNumber = await client.getBlockNumber();
      for (const address of [config.domain.nft, config.domain.manager]) {
        const code = await client.getBytecode({
          address: address as Address,
          blockNumber,
        });
        if (
          !code ||
          keccak256(code).toLowerCase() !==
            config.codeHashes[address.toLowerCase()]?.toLowerCase()
        )
          throw new IntegrityError("CODE_HASH_MISMATCH");
      }
      const [mappedTokenId, nftExists, initialized, metadata] =
        await Promise.all([
          read(
            config.domain.manager,
            managerAbi as Abi,
            "microchipToTokenId",
            [row.microchip],
            blockNumber,
          ),
          read(
            config.domain.nft,
            nftAbi as Abi,
            "exists",
            [row.tokenId],
            blockNumber,
          ),
          read(
            config.domain.manager,
            managerAbi as Abi,
            "initialized",
            [row.tokenId],
            blockNumber,
          ),
          read(
            config.domain.manager,
            managerAbi as Abi,
            "getMetadata",
            [row.tokenId],
            blockNumber,
          ),
        ]);
      return {
        domain: config.domain,
        tokenId: row.tokenId,
        mappedTokenId: mappedTokenId as bigint,
        nftExists: nftExists as boolean,
        initialized: initialized as boolean,
        metadata: metadata as RawMetadata,
      };
    },
  });
  cache.__buffaloReadRuntime = { key, details };
  return details;
}
