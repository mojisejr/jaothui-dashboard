import { abi as managerAbi } from "~/server/blockchain/metadata-maneger/abi";
import { createPublicClient, http, keccak256, type Address } from "viem";
import { IntegrityError } from "../operations/hash";
import { type Operation, type Step } from "../operations/types";
import { repairIntent } from "./workflow";
/** Trusted-RPC consistency guard. The deployment attestation coordinates external administrators; this is not a global chain lock. */
export function repairRevisionGuard(rpc: string) {
  const client = createPublicClient({
    transport: http(rpc, { timeout: 12000, retryCount: 0 }),
  });
  return async (op: Operation, steps: Step[]) => {
    const m = repairIntent(op).manifest,
      latest = await client.getBlockNumber({ cacheTime: 0 });
    if (
      (await client.getChainId()) !== m.domain.chainId ||
      String(
        await client.readContract({
          address: m.domain.manager as Address,
          abi: managerAbi,
          functionName: "jaothui",
          blockNumber: latest,
        }),
      ).toLowerCase() !== m.domain.nft.toLowerCase()
    )
      throw new IntegrityError("REPAIR_BASELINE_CHANGED");
    const latestBlock = await client.getBlock({ blockNumber: latest });
    const last = [...steps].sort((a, b) => a.ordinal - b.ordinal).at(-1);
    const reference = last?.receipt
      ? BigInt(last.receipt.blockNumber)
      : BigInt(String(m.chain.pin.blockNumber));
    const referenceHash = last?.receipt?.blockHash ?? m.chain.pin.blockHash;
    const at = await client.getBlock({ blockNumber: reference });
    if (at.hash !== referenceHash || latest < reference)
      throw new IntegrityError("REPAIR_BASELINE_CHANGED");
    for (const [key, address] of [
      ["nft", m.domain.nft],
      ["manager", m.domain.manager],
    ] as const) {
      const [proof, code] = await Promise.all([
        client.getProof({
          address: address as Address,
          storageKeys: [],
          blockNumber: latest,
        }),
        client.getBytecode({
          address: address as Address,
          blockNumber: latest,
        }),
      ]);
      const baseline = last
        ? (
            await client.getProof({
              address: address as Address,
              storageKeys: [],
              blockNumber: reference,
            })
          ).storageHash
        : m.chain.pin[`${key}StorageHash`];
      if (
        !code ||
        keccak256(code) !== m.chain.pin[`${key}CodeHash`] ||
        proof.codeHash !== keccak256(code) ||
        proof.storageHash !== baseline
      )
        throw new IntegrityError("REPAIR_BASELINE_CHANGED");
    }
    if (
      (await client.getBlock({ blockNumber: reference })).hash !== at.hash ||
      (await client.getBlock({ blockNumber: latest })).hash !== latestBlock.hash
    )
      throw new IntegrityError("REPAIR_BASELINE_CHANGED");
  };
}
