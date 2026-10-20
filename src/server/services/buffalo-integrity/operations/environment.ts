/** Execution identity survives deployment; it must not turn real receipts into fork-only links. */
export function executionEnvironment(instance?: string): "mainnet" | "local-fork" {
  return !instance || instance.startsWith("production:") ? "mainnet" : "local-fork";
}

export function transactionLink(instance: string | undefined, hash: string | null) {
  return executionEnvironment(instance) === "mainnet" && hash && /^0x[0-9a-fA-F]{64}$/.test(hash)
    ? `https://www.kubscan.com/tx/${hash}`
    : null;
}
