import { getEditReadDetails } from "~/server/services/buffalo-integrity/edit/read-runtime";
import { z } from "zod";
import { createTRPCRouter, protectProcedure } from "~/server/api/trpc";
import { sharedAccount } from "./r-buffalo-create";
import {
  getEditRuntime,
  type EditRuntime,
} from "~/server/services/buffalo-integrity/edit/runtime";
import { editInputSchema } from "~/server/services/buffalo-integrity/edit/contract";
import { diagnosticTRPCError } from "~/server/diagnostics/transport";
const id = z.object({ id: z.string().uuid() }).strict();
async function safe<T>(fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (e) {
    throw diagnosticTRPCError(e);
  }
}
export function createBuffaloEditRouter(
  factory: () => EditRuntime = getEditRuntime,
  readDetails = (chip: string) => getEditReadDetails()(chip),
) {
  return createTRPCRouter({
    details: protectProcedure
      .input(z.string().min(1))
      .query(({ input }) => safe(() => readDetails(input))),
    list: protectProcedure
      .input(z.string().regex(/^[1-9][0-9]*$/))
      .query(({ input }) =>
        safe(async () => {
          const r = factory();
          return Promise.all(
            (await r.workflow.list(sharedAccount(), input)).map((op) =>
              r.workflow.view(op.id, sharedAccount(), r.engine),
            ),
          );
        }),
      ),
    view: protectProcedure.input(id).query(({ input }) =>
      safe(() => {
        const r = factory();
        return r.workflow.view(input.id, sharedAccount(), r.engine);
      }),
    ),
    create: protectProcedure.input(editInputSchema).mutation(({ input }) =>
      safe(async () => {
        const r = factory();
        r.assertCanStart?.();
        const op = await r.workflow.create(sharedAccount(), input);
        return r.workflow.view(op.id, sharedAccount(), r.engine);
      }),
    ),
    prepare: protectProcedure
      .input(id.extend({ version: z.number().int().nonnegative() }).strict())
      .mutation(({ input }) =>
        safe(async () => {
          const r = factory();
          await r.engine.prepare(input.id, sharedAccount(), input.version);
          return r.workflow.view(input.id, sharedAccount(), r.engine);
        }),
      ),
    advance: protectProcedure
      .input(id.extend({ version: z.number().int().nonnegative() }).strict())
      .mutation(({ input }) =>
        safe(async () => {
          const r = factory();
          await r.engine.advance(
            input.id,
            sharedAccount(),
            "resume",
            input.version,
          );
          return r.workflow.view(input.id, sharedAccount(), r.engine);
        }),
      ),
    cancel: protectProcedure
      .input(id)
      .mutation(({ input }) =>
        safe(() => factory().engine.cancel(input.id, sharedAccount())),
      ),
  });
}
export const buffaloEditRouter = createBuffaloEditRouter();
