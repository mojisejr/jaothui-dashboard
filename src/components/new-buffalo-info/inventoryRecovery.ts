/** Three total attempts per inventory read; never used for a mutation or advance. */
export function retryInventory(failureCount: number, error: unknown) {
  if (failureCount >= 2) return false;
  const value = error as {
    data?: { diagnostic?: { code?: string }; code?: string };
    message?: string;
  } | null;
  const code = value?.data?.diagnostic?.code ?? value?.message;
  return [
    "INVENTORY_ACQUISITION_TIMEOUT",
    "INVENTORY_TRANSACTION_EXPIRED",
    "INVENTORY_READ_UNAVAILABLE",
  ].includes(code ?? "");
}
export const inventoryRetryDelay = (attempt: number) =>
  Math.min(1000 * 2 ** attempt, 2000);
