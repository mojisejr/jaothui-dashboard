import { createPublicClient, http, createWalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bitkub_mainnet } from "./chain";

export const viemPublic = createPublicClient({
  chain: bitkub_mainnet,
  transport: http(),
});

export const account = privateKeyToAccount(`0x${process.env.minter!}`);

export const viemWallet = createWalletClient({
  account: account,
  chain: bitkub_mainnet,
  transport: http(),
});
