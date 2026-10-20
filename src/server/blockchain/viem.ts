import { isolatedConfig } from "../services/buffalo-integrity/release/config";
import { createPublicClient, http } from "viem";
import { bitkub_mainnet } from "./chain";

function legacyTransport() {
  if (!process.env.BUFFALO_INTEGRITY_ISOLATED_CONFIG) return http();
  const {
    value: { rpcUrl },
  } = isolatedConfig();
  const parsed = new URL(rpcUrl);
  if (parsed.protocol !== "http:" || parsed.hostname !== "127.0.0.1")
    throw Error("LOOPBACK_RPC_ONLY");
  return http(rpcUrl, { timeout: 8000, retryCount: 0 });
}
export const viemPublic = createPublicClient({
  chain: bitkub_mainnet,
  // chain: bitkub_testnet,
  transport: legacyTransport(),
});

// Signing is available only through the durable operation ports.
