import { type Pedigree } from "@prisma/client";
import { type RawMetadata } from "~/interfaces/i-metadata";
import {
  businessDifferences,
  chainSnapshot,
  databaseSnapshot,
  type BusinessField,
} from "./field-policy";
import { assertChipAvailable, type ChipAvailability } from "./intent";

export interface ChainDomain {
  chainId: number;
  nft: string;
  manager: string;
}
export interface ChainIdentity {
  domain: ChainDomain;
  tokenId: bigint;
  mappedTokenId: bigint;
  nftExists: boolean;
  initialized: boolean;
  metadata: RawMetadata;
}
export function sameDomain(left: ChainDomain, right: ChainDomain): boolean {
  return (
    left.chainId === right.chainId &&
    left.nft.toLowerCase() === right.nft.toLowerCase() &&
    left.manager.toLowerCase() === right.manager.toLowerCase()
  );
}

export function identityConflict(
  record: Pedigree,
  chain: ChainIdentity,
): string | null {
  if (
    chain.tokenId !== record.tokenId ||
    chain.mappedTokenId !== record.tokenId
  )
    return "TOKEN_MAPPING_CONFLICT";
  if (!chain.nftExists || !chain.initialized) return "TOKEN_NOT_INITIALIZED";
  if (chain.metadata.certify.microchip !== record.microchip)
    return "CANONICAL_CHIP_CONFLICT";
  return null;
}

export interface MutationIdentityRequest {
  microchip: string;
  tokenId: bigint;
  edition?: bigint;
  changedFields: BusinessField[];
  newMicrochip?: string;
}
export interface IdentityPorts {
  findCow: (chip: string) => Promise<Pedigree | null>;
  findTokenBindings: (token: bigint) => Promise<Pedigree[]>;
  readChain: (record: Pedigree) => Promise<ChainIdentity>;
  chipAvailability: ChipAvailability;
}

/** Read-only preflight, not authorization to submit. Future engine must recheck under a reservation. */
export async function preflightMutationIdentity(
  request: MutationIdentityRequest,
  expected: ChainDomain,
  ports: IdentityPorts,
) {
  if (
    request.tokenId <= 0n ||
    (request.edition !== undefined && request.edition !== request.tokenId)
  ) {
    throw new Error("TOKEN_EDITION_MISMATCH");
  }
  const cow = await ports.findCow(request.microchip);
  if (
    !cow ||
    cow.microchip !== request.microchip ||
    cow.tokenId !== request.tokenId
  )
    throw new Error("COW_BINDING_CONFLICT");
  const bindings = await ports.findTokenBindings(request.tokenId);
  if (bindings.length !== 1 || bindings[0]?.microchip !== cow.microchip)
    throw new Error("AMBIGUOUS_DB_TOKEN");
  const chain = await ports.readChain(cow); // RPC failure rejects writes, while reads remain available.
  if (!sameDomain(expected, chain.domain))
    throw new Error("CHAIN_DOMAIN_CONFLICT");
  const conflict = identityConflict(cow, chain);
  if (conflict) throw new Error(conflict);
  if (request.changedFields.includes("microchip")) {
    if (request.newMicrochip === undefined)
      throw new Error("MISSING_NEW_MICROCHIP");
    if (request.newMicrochip !== cow.microchip)
      await assertChipAvailable(request.newMicrochip, ports.chipAvailability);
  } else if (
    request.newMicrochip !== undefined &&
    request.newMicrochip !== cow.microchip
  ) {
    throw new Error("UNDECLARED_MICROCHIP_CHANGE");
  }
  return {
    cow,
    chain,
    baselineDifferences: businessDifferences(
      databaseSnapshot(cow),
      chainSnapshot(chain.metadata),
    ),
    imageVerification: "unchecked" as const,
  };
}
