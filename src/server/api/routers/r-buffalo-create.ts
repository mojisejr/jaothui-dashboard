import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectProcedure } from "~/server/api/trpc";
import {
  getCreateRuntime,
  type CreateRuntime,
} from "~/server/services/buffalo-integrity/create/runtime";
import { draftInputSchema } from "~/server/services/buffalo-integrity/create/contract";
import { IntegrityError } from "~/server/services/buffalo-integrity/operations/hash";
export const sharedAccount = () => `shared:${process.env.username!}`;
async function safe<T>(callback: () => Promise<T>) {
  try {
    return await callback();
  } catch (error) {
    throw new TRPCError({
      code:
        error instanceof IntegrityError && error.code === "OPERATION_NOT_FOUND"
          ? "NOT_FOUND"
          : "PRECONDITION_FAILED",
      message:
        error instanceof IntegrityError
          ? error.code
          : "CREATE_SERVICE_UNAVAILABLE",
    });
  }
}
const id = z.object({ id: z.string().uuid() }).strict();
const version = id.extend({ version: z.number().int().nonnegative() }).strict();
export function createBuffaloCreateRouter(
  runtimeFactory: () => CreateRuntime = getCreateRuntime,
) {
  return createTRPCRouter({
    list: protectProcedure.query(() =>
      safe(async () => {
        const runtime = runtimeFactory();
        return Promise.all(
          (await runtime.drafts.list(sharedAccount())).map((op) =>
            runtime.workflow.view(op.id, sharedAccount(), runtime.engine),
          ),
        );
      }),
    ),
    view: protectProcedure.input(id).query(({ input }) =>
      safe(() => {
        const runtime = runtimeFactory();
        return runtime.workflow.view(input.id, sharedAccount(), runtime.engine);
      }),
    ),
    create: protectProcedure
      .input(
        z.object({ key: z.string().uuid(), input: draftInputSchema }).strict(),
      )
      .mutation(({ input }) =>
        safe(async () => {
          const runtime = runtimeFactory();
          const op = await runtime.workflow.create(
            sharedAccount(),
            input.key,
            input.input,
          );
          return runtime.workflow.view(op.id, sharedAccount(), runtime.engine);
        }),
      ),
    revise: protectProcedure
      .input(
        version
          .extend({
            input: draftInputSchema,
            keepImage: z.boolean().optional(),
          })
          .strict(),
      )
      .mutation(({ input }) =>
        safe(async () => {
          const runtime = runtimeFactory();
          const op = await runtime.workflow.revise(
            input.id,
            sharedAccount(),
            input.version,
            input.input,
            input.keepImage,
          );
          return runtime.workflow.view(op.id, sharedAccount(), runtime.engine);
        }),
      ),
    prepare: protectProcedure.input(version).mutation(({ input }) =>
      safe(async () => {
        const runtime = runtimeFactory();
        await runtime.engine.prepare(input.id, sharedAccount(), input.version);
        return runtime.workflow.view(input.id, sharedAccount(), runtime.engine);
      }),
    ),
    advance: protectProcedure
      .input(
        version
          .extend({ action: z.enum(["mint", "metadata", "resume"]) })
          .strict(),
      )
      .mutation(({ input }) =>
        safe(async () => {
          const runtime = runtimeFactory();
          await runtime.engine.advance(
            input.id,
            sharedAccount(),
            input.action,
            input.version,
          );
          return runtime.workflow.view(
            input.id,
            sharedAccount(),
            runtime.engine,
          );
        }),
      ),
  });
}
export const buffaloCreateRouter = createBuffaloCreateRouter();
