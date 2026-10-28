import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectProcedure } from "~/server/api/trpc";
import { operationIntentSchema } from "~/server/services/buffalo-integrity/operations/types";
import { productOperationRuntime } from "~/server/services/buffalo-integrity/operations/runtime";
import { diagnosticTRPCError } from "~/server/diagnostics/transport";
import { type OperationEngine } from "~/server/services/buffalo-integrity/operations/engine";
import { address as manager } from "~/server/blockchain/metadata-maneger/abi";
import { address as nft } from "~/server/blockchain/nft/abi";
const metadataDomain = { chainId: 96, nft, manager };

const operationId = z.object({ id: z.string().uuid() }).strict();
/** Ownership is the verified shared application account; never a user-supplied operation owner. */
function accountScope(): string {
  if (!process.env.username) throw new TRPCError({ code: "UNAUTHORIZED" });
  return `shared:${process.env.username}`;
}
async function safe<T>(callback: () => Promise<T>): Promise<T> {
  try {
    return await callback();
  } catch (error) {
    throw diagnosticTRPCError(error);
  }
}
export function createBuffaloOperationsRouter(
  runtime: () => OperationEngine = productOperationRuntime,
) {
  return createTRPCRouter({
    create: protectProcedure
      .input(
        z
          .object({
            key: z.string().min(1).max(128),
            intent: operationIntentSchema,
          })
          .strict(),
      )
      .mutation(({ input }) =>
        safe(async () => {
          const engine = runtime();
          const operation = await engine.create(
            accountScope(),
            input.key,
            input.intent,
            metadataDomain,
          );
          return engine.status(operation.id, accountScope());
        }),
      ),
    prepare: protectProcedure
      .input(
        operationId
          .extend({ version: z.number().int().nonnegative() })
          .strict(),
      )
      .mutation(({ input }) =>
        safe(() => runtime().prepare(input.id, accountScope(), input.version)),
      ),
    status: protectProcedure
      .input(operationId)
      .query(({ input }) =>
        safe(() => runtime().status(input.id, accountScope())),
      ),
    advance: protectProcedure
      .input(
        operationId
          .extend({ action: z.enum(["mint", "metadata", "resume"]) })
          .strict(),
      )
      .mutation(({ input }) =>
        safe(() => runtime().advance(input.id, accountScope(), input.action)),
      ),
    cancel: protectProcedure
      .input(operationId)
      .mutation(({ input }) =>
        safe(() => runtime().cancel(input.id, accountScope())),
      ),
  });
}
export const buffaloOperationsRouter = createBuffaloOperationsRouter();
