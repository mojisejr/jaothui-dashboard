import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  decodeEventLog,
  decodeFunctionData,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bitkub_mainnet } from "~/server/blockchain/chain";
import { abi as managerAbi } from "~/server/blockchain/metadata-maneger/abi";
import { abi as nftAbi } from "~/server/blockchain/nft/abi";
import { type RawMetadata } from "~/interfaces/i-metadata";
import { chainSnapshot, managerManifest } from "../field-policy";
import { IntegrityError, payloadHash, asJson } from "./hash";
import {
  type ChainPorts,
  type Plan,
  type Operation,
  type Step,
  type StepSpec,
  type Signed,
  type EffectProof,
  type PublicationProof,
  type Json,
  type Domain,
} from "./types";

export function assertLoopbackUrl(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new IntegrityError("LOOPBACK_ONLY");
  return url.href;
}
export function serializedValue(value: unknown): Json {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value))
    return value.toLowerCase();
  if (Array.isArray(value))
    return value.map((entry: unknown) => serializedValue(entry));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        serializedValue(entry),
      ]),
    );
  return asJson(value);
}
export interface LoopbackConfig {
  expectedInstanceId: string;
  rpcUrl: string;
  privateKey: Hex;
  domain: Domain;
  codeHashes: Record<string, string>;
  maxFeeWei: string;
  prepare: (operation: Operation) => Promise<Plan>;
  beforeSign?: (operation: Operation) => Promise<void>;
  nextStep: (operation: Operation, steps: Step[]) => Promise<StepSpec | null>;
  project: (operation: Operation, steps: Step[]) => Promise<PublicationProof>;
  verifyPublication: (
    operation: Operation,
    steps: Step[],
    proof: PublicationProof,
  ) => Promise<boolean>;
}
/** Explicit test-only factory. No env/default RPC or production signer import exists. */
export function loopbackChainPorts(config: LoopbackConfig): ChainPorts {
  const rpc = assertLoopbackUrl(config.rpcUrl);
  const account = privateKeyToAccount(config.privateKey);
  const transport = http(rpc, { timeout: 8000, retryCount: 0 });
  const publicClient = createPublicClient({
    chain: { ...bitkub_mainnet, id: config.domain.chainId },
    transport,
  });
  const dynamicRead = publicClient.readContract as (parameters: {
    address: Address;
    abi: Abi;
    functionName: string;
    args: readonly unknown[];
    blockNumber: bigint;
  }) => Promise<unknown>;
  const wallet = createWalletClient({
    account,
    chain: { ...bitkub_mainnet, id: config.domain.chainId },
    transport,
  });
  const allowed = [
    config.domain.nft.toLowerCase(),
    config.domain.manager.toLowerCase(),
  ];
  async function isolated() {
    const response = await fetch(rpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "anvil_metadata",
        params: [],
      }),
      signal: AbortSignal.timeout(2000),
    });
    const result = (await response.json()) as {
      result?: { clientVersion?: string; instanceId?: string };
    };
    if (
      !result.result?.clientVersion?.toLowerCase().includes("anvil") ||
      result.result.instanceId !== config.expectedInstanceId ||
      (await publicClient.getChainId()) !== config.domain.chainId
    )
      throw new IntegrityError("NOT_ISOLATED_ANVIL");
    for (const contract of allowed) {
      const code = await publicClient.getCode({ address: contract as Address });
      if (!code || keccak256(code) !== config.codeHashes[contract])
        throw new IntegrityError("DEPLOYED_CODE_CHANGED");
    }
  }
  return {
    async prepare(operation) {
      await isolated();
      const plan = await config.prepare(operation);
      if (plan.executionInstance !== config.expectedInstanceId)
        throw new IntegrityError("ISOLATED_INSTANCE_MISMATCH");
      if (
        plan.sender.toLowerCase() !== account.address.toLowerCase() ||
        BigInt(plan.maxFeeWei) > BigInt(config.maxFeeWei)
      )
        throw new IntegrityError("PLAN_SENDER_OR_GAS_BOUND");
      return plan;
    },
    nextStep: config.nextStep,
    async nonce(sender) {
      const [latest, pending] = await Promise.all([
        publicClient.getTransactionCount({
          address: sender as Address,
          blockTag: "latest",
        }),
        publicClient.getTransactionCount({
          address: sender as Address,
          blockTag: "pending",
        }),
      ]);
      return { latest, pending };
    },
    async sign(operation, step, nonce): Promise<Signed> {
      if (operation.plan?.executionInstance !== config.expectedInstanceId)
        throw new IntegrityError("ISOLATED_INSTANCE_MISMATCH");
      await isolated();
      await config.beforeSign?.(operation);
      if (!allowed.includes(step.expected.to.toLowerCase()))
        throw new IntegrityError("UNAPPROVED_CONTRACT");
      const nftCall =
        step.expected.to.toLowerCase() === config.domain.nft.toLowerCase();
      const decoded = decodeFunctionData({
        abi: (nftCall ? nftAbi : managerAbi) as Abi,
        data: step.expected.data as Hex,
      });
      const allowedFunctions: Record<string, string[]> = {
        mint: ["mintWithMetadata"],
        uri: ["setTokenURI"],
        metadata: ["addMetadata"],
        batch: ["addMetadataBatch"],
        dna_restore: ["setDNA"],
        parents: ["setParent"],
        setter: [
          "setName",
          "setHeight",
          "setCertId",
          "setDetail",
          "setRarity",
          "setDNA",
        ],
      };
      if (!allowedFunctions[step.kind]?.includes(decoded.functionName))
        throw new IntegrityError("UNAPPROVED_CONTRACT_ACTION");
      if (
        operation.plan?.sender.toLowerCase() !== account.address.toLowerCase()
      )
        throw new IntegrityError("UNAPPROVED_SIGNER");
      const call = {
        account,
        to: step.expected.to as Address,
        data: step.expected.data as Hex,
        value: BigInt(step.expected.value),
      };
      const estimate = await publicClient.estimateGas(call);
      const gas = (estimate * 125n) / 100n;
      const gasPrice = await publicClient.getGasPrice();
      if (gas * gasPrice > BigInt(config.maxFeeWei))
        throw new IntegrityError("GAS_BUDGET_EXCEEDED");
      const bytes = await wallet.signTransaction({
        ...call,
        nonce,
        gas,
        gasPrice,
        type: "legacy",
      });
      return {
        bytes,
        hash: keccak256(bytes),
        envelope: {
          chainId: config.domain.chainId,
          from: account.address,
          to: call.to,
          data: call.data,
          value: call.value.toString(),
          nonce,
          gas: gas.toString(),
          gasPrice: gasPrice.toString(),
        },
      };
    },
    async broadcast(bytes) {
      await isolated();
      return publicClient.sendRawTransaction({
        serializedTransaction: bytes as Hex,
      });
    },
    async observe(step) {
      await isolated();
      if (!step.hash) throw new IntegrityError("MISSING_SIGNED_HASH");
      let receipt;
      try {
        receipt = await publicClient.getTransactionReceipt({
          hash: step.hash as Hex,
        });
      } catch (error) {
        if (
          !(error instanceof Error) ||
          error.name !== "TransactionReceiptNotFoundError"
        )
          throw error;
        try {
          await publicClient.getTransaction({ hash: step.hash as Hex });
          return { state: "pending" };
        } catch (transactionError) {
          if (
            !(transactionError instanceof Error) ||
            transactionError.name !== "TransactionNotFoundError"
          )
            throw transactionError;
        }
        const [latestNonce, pendingNonce] = await Promise.all([
          publicClient.getTransactionCount({
            address: step.sender as Address,
            blockTag: "latest",
          }),
          publicClient.getTransactionCount({
            address: step.sender as Address,
            blockTag: "pending",
          }),
        ]);
        return { state: "missing", latestNonce, pendingNonce };
      }
      const [block, latest] = await Promise.all([
        publicClient.getBlock({ blockNumber: receipt.blockNumber }),
        publicClient.getBlockNumber({ cacheTime: 0 }),
      ]);
      return {
        state: "receipt",
        receipt: {
          transactionHash: receipt.transactionHash,
          blockHash: receipt.blockHash,
          blockNumber: receipt.blockNumber.toString(),
          status: receipt.status,
        },
        canonical: block.hash === receipt.blockHash,
        confirmations: Number(latest - receipt.blockNumber + 1n),
      };
    },
    async verifyEffects(_operation, step, receipt): Promise<EffectProof> {
      await isolated();
      const transaction = await publicClient.getTransaction({
        hash: receipt.transactionHash as Hex,
      });
      const envelope = step.envelope;
      if (
        !envelope ||
        transaction.from.toLowerCase() !== envelope.from.toLowerCase() ||
        transaction.to?.toLowerCase() !== envelope.to.toLowerCase() ||
        transaction.nonce !== envelope.nonce ||
        transaction.input.toLowerCase() !== envelope.data.toLowerCase() ||
        transaction.value !== BigInt(envelope.value) ||
        transaction.chainId !== envelope.chainId
      )
        throw new IntegrityError("RECEIPT_TRANSACTION_MISMATCH");
      const rawReceipt = await publicClient.getTransactionReceipt({
        hash: receipt.transactionHash as Hex,
      });
      let actualToken: string | undefined;
      const details: Json[] = [];
      for (const effect of step.expected.effects) {
        if (
          !allowed.includes(
            (effect.kind === "mint"
              ? effect.nft
              : effect.contract
            ).toLowerCase(),
          )
        )
          throw new IntegrityError("UNAPPROVED_EFFECT_CONTRACT");
        if (effect.kind === "read") {
          const value = await dynamicRead({
            address: effect.contract as Address,
            abi: effect.abi as unknown as Abi,
            functionName: effect.functionName,
            args: effect.args,
            blockNumber: BigInt(receipt.blockNumber),
          });
          const projected =
            effect.projection === "manager-manifest"
              ? managerManifest(value as RawMetadata)
              : effect.projection === "manager-business"
                ? {
                    ...chainSnapshot(value as RawMetadata),
                    issuedAt: (
                      value as RawMetadata
                    ).certify.issuedAt.toString(),
                  }
                : effect.projection === "nft-uri" && Array.isArray(value)
                  ? value.slice(0, 2)
                  : value;
          if (
            payloadHash(serializedValue(projected)) !==
            payloadHash(serializedValue(effect.expected))
          )
            throw new IntegrityError("FIELD_READBACK_MISMATCH");
          details.push({
            kind: "read",
            field: effect.functionName,
            value: serializedValue(projected),
            ...(effect.projection === "manager-manifest"
              ? {
                  nativeCreatedAt: serializedValue(
                    (value as RawMetadata).createdAt,
                  ),
                  nativeUpdatedAt: serializedValue(
                    (value as RawMetadata).updatedAt,
                  ),
                }
              : {}),
            ...(effect.projection === "nft-uri" && Array.isArray(value)
              ? {
                  nativeCreatedAt: serializedValue(value[2]),
                  nativeUpdatedAt: serializedValue(value[3]),
                }
              : {}),
          });
        } else {
          const minted = rawReceipt.logs
            .filter(
              (log) => log.address.toLowerCase() === effect.nft.toLowerCase(),
            )
            .flatMap((log) => {
              try {
                const decoded = decodeEventLog({
                  abi: nftAbi as Abi,
                  data: log.data,
                  topics: log.topics,
                });
                return decoded.eventName === "MintWithMetadata"
                  ? [decoded.args as unknown as Record<string, unknown>]
                  : [];
              } catch {
                return [];
              }
            });
          if (minted.length !== 1)
            throw new IntegrityError("MINT_EVENT_NOT_UNIQUE");
          const event = minted[0]!;
          const token = event._tokenId;
          if (
            typeof token !== "bigint" ||
            event._tokenURI !== effect.tokenUri ||
            String(event.operator).toLowerCase() !== step.sender.toLowerCase()
          )
            throw new IntegrityError("MINT_EVENT_BINDING_MISMATCH");
          const transfers = rawReceipt.logs
            .filter(
              (log) => log.address.toLowerCase() === effect.nft.toLowerCase(),
            )
            .flatMap((log) => {
              try {
                const decoded = decodeEventLog({
                  abi: nftAbi as Abi,
                  data: log.data,
                  topics: log.topics,
                });
                return decoded.eventName === "Transfer"
                  ? [decoded.args as unknown as Record<string, unknown>]
                  : [];
              } catch {
                return [];
              }
            })
            .filter(
              (event) =>
                event.from === "0x0000000000000000000000000000000000000000" &&
                event.tokenId === token &&
                String(event.to).toLowerCase() ===
                  effect.receiver.toLowerCase(),
            );
          if (transfers.length !== 1)
            throw new IntegrityError("MINT_RECEIVER_MISMATCH");
          actualToken = token.toString();
          const [owner, uri, nftRecord] = await Promise.all([
            publicClient.readContract({
              address: effect.nft as Address,
              abi: nftAbi,
              functionName: "ownerOf",
              args: [token],
              blockNumber: BigInt(receipt.blockNumber),
            }),
            publicClient.readContract({
              address: effect.nft as Address,
              abi: nftAbi,
              functionName: "tokenURI",
              args: [token],
              blockNumber: BigInt(receipt.blockNumber),
            }),
            publicClient.readContract({
              address: effect.nft as Address,
              abi: nftAbi,
              functionName: "tokenIdToUri",
              args: [token],
              blockNumber: BigInt(receipt.blockNumber),
            }),
          ]);
          if (
            String(owner).toLowerCase() !== effect.receiver.toLowerCase() ||
            uri !== effect.tokenUri ||
            !Array.isArray(nftRecord) ||
            nftRecord[0] !== effect.imageUri
          )
            throw new IntegrityError("MINT_BINDING_READBACK_MISMATCH");
          details.push({
            kind: "mint",
            actualToken,
            receiver: effect.receiver,
            tokenUri: effect.tokenUri,
            nativeCreatedAt: serializedValue(nftRecord[2]),
          });
        }
      }
      return { ...(actualToken ? { actualToken } : {}), details };
    },
    project: config.project,
    verifyPublication: config.verifyPublication,
  };
}
