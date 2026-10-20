import { type Pedigree } from "@prisma/client";
import { type RawMetadata } from "~/interfaces/i-metadata";
import { viemPublic } from "~/server/blockchain/viem";
import { abi, address } from "~/server/blockchain/metadata-maneger/abi";
import {
  abi as nftAbi,
  address as nftAddress,
} from "~/server/blockchain/nft/abi";
import { type ChainIdentity } from "./identity";

export const metadataDomain = {
  chainId: 96,
  nft: nftAddress,
  manager: address,
};

/** All state calls use one observed block. No signer, simulation or write is invoked. */
export async function readChainIdentity(
  record: Pedigree,
): Promise<ChainIdentity> {
  const [blockNumber, chainId] = await Promise.all([
    viemPublic.getBlockNumber(),
    viemPublic.getChainId(),
  ]);
  const [metadata, mappedTokenId, initialized, nftExists] = await Promise.all([
    viemPublic.readContract({
      address,
      abi,
      functionName: "getMetadata",
      args: [record.tokenId],
      blockNumber,
    }),
    viemPublic.readContract({
      address,
      abi,
      functionName: "microchipToTokenId",
      args: [record.microchip],
      blockNumber,
    }),
    viemPublic.readContract({
      address,
      abi,
      functionName: "initialized",
      args: [record.tokenId],
      blockNumber,
    }),
    viemPublic.readContract({
      address: nftAddress,
      abi: nftAbi,
      functionName: "exists",
      args: [record.tokenId],
      blockNumber,
    }),
  ]);
  return {
    domain: { ...metadataDomain, chainId },
    tokenId: record.tokenId,
    metadata: metadata as RawMetadata,
    mappedTokenId: mappedTokenId as bigint,
    initialized: initialized as boolean,
    nftExists: nftExists as boolean,
  };
}
