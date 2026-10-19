import { readFileSync } from "fs";
import { resolve, sep } from "path";
import { createPublicClient, http } from "viem";
import { bitkub_mainnet } from "./chain";

function legacyTransport() {
  if (!process.env.BUFFALO_INTEGRITY_ISOLATED_CONFIG) return http();
  if (process.env.NODE_ENV === "production")
    throw Error("ISOLATION_FORBIDDEN_IN_PRODUCTION");
  const path = resolve(process.env.BUFFALO_INTEGRITY_ISOLATED_CONFIG);
  if (!path.startsWith(resolve(process.cwd(), ".tmp") + sep))
    throw Error("ISOLATED_CONFIG_OUTSIDE_TASK");
  const { rpcUrl } = JSON.parse(readFileSync(path, "utf8")) as {
    rpcUrl: string;
  };
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
