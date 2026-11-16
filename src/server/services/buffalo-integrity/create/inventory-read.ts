import { type Prisma, type PrismaClient } from "@prisma/client";
import { DiagnosticError } from "~/server/diagnostics/errors";
import { diagnosticContext, newRequestId } from "~/server/diagnostics/reporter";

/** Read route only. Never infer a write outcome from these provider codes. */
export function inventoryFailure(error: unknown, entered: boolean) {
  const value = error as {
    code?: string;
    meta?: { error?: string; code?: string };
  } | null;
  if (value?.code === "P2028") {
    if (
      !entered &&
      /unable to start a transaction in the given time/i.test(
        value.meta?.error ?? "",
      )
    )
      return "INVENTORY_ACQUISITION_TIMEOUT";
    if (entered && /expired transaction/i.test(value.meta?.error ?? ""))
      return "INVENTORY_TRANSACTION_EXPIRED";
    return "INVENTORY_READ_UNAVAILABLE";
  }
  if (
    ["P1001", "P1002", "P1008", "P1017", "P2024", "P2034"].includes(
      value?.code ?? "",
    ) ||
    (value?.code === "P2010" &&
      ["57014", "55P03", "40001", "40P01"].includes(value.meta?.code ?? ""))
  )
    return "INVENTORY_READ_UNAVAILABLE";
  return "INVENTORY_READ_FAILED";
}
export async function inventoryRead<T>(
  db: PrismaClient,
  read: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  const started = Date.now();
  let entered = false;
  let stage: "acquisition" | "statement" | "commit" = "acquisition";
  try {
    return await db.$transaction(
      async (tx) => {
        entered = true;
        stage = "statement";
        await tx.$executeRaw`SET LOCAL lock_timeout='500ms'`;
        await tx.$executeRaw`SET LOCAL statement_timeout='2500ms'`;
        const result = await read(tx);
        stage = "commit";
        return result;
      },
      { maxWait: 1000, timeout: 3000 },
    );
  } catch (cause) {
    const code = inventoryFailure(cause, entered);
    // No input, SQL, provider message, connection URL, stack or payload is logged.
    try {
      console.error(
        JSON.stringify({
          event: "buffalo_inventory_read",
          requestId: diagnosticContext()?.requestId ?? newRequestId(),
          stage,
          elapsedMs: Date.now() - started,
          code,
        }),
      );
    } catch {
      /* Diagnostics must not alter read failure semantics. */
    }

    throw new DiagnosticError(code, { cause });
  }
}
