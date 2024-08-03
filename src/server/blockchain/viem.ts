import { createPublicClient, http, createWalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bitkub_mainnet, bitkub_testnet } from "./chain";

export const viemPublic = createPublicClient({
  chain: bitkub_mainnet,
  // chain: bitkub_testnet,
  transport: http(),
});

export const account = privateKeyToAccount(`0x${process.env.minter!}`);

export const viemWallet = createWalletClient({
  account: account,
  chain: bitkub_mainnet,
  // chain: bitkub_testnet,
  transport: http(),
});
