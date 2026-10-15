import { z } from "zod";
import { createTRPCRouter, protectProcedure } from "~/server/api/trpc";
import {
  competitionInputSchema,
  listSchema,
  mutationSchema,
  reviewSchema,
} from "~/lib/competitions";
import {
  competitionAdminApiClient as client,
  toCompetitionTRPCError,
} from "~/server/services/competition-admin-api-client";
const id = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/);
async function safe<T>(fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (e) {
    throw toCompetitionTRPCError(e);
  }
}
export const competitionsRouter = createTRPCRouter({
  list: protectProcedure
    .input(listSchema)
    .query(({ input }) => safe(() => client.list(input))),
  get: protectProcedure
    .input(z.object({ id }))
    .query(({ input }) => safe(() => client.get(input.id))),
  create: protectProcedure
    .input(
      z.object({
        operationId: z.string().uuid(),
        input: competitionInputSchema,
      }),
    )
    .mutation(({ input }) => safe(() => client.create(input))),
  update: protectProcedure
    .input(mutationSchema.extend({ id, input: competitionInputSchema }))
    .mutation(({ input: { id, ...body } }) =>
      safe(() => client.update(id, body)),
    ),
  action: protectProcedure
    .input(
      mutationSchema.extend({
        id,
        action: z.enum([
          "publish",
          "close-registration",
          "open-registration",
          "close-event",
          "clone",
        ]),
      }),
    )
    .mutation(({ input: { id, action, ...body } }) =>
      safe(() => client.action(id, action, body)),
    ),
  impact: protectProcedure
    .input(mutationSchema.extend({ id, input: competitionInputSchema }))
    .mutation(({ input: { id, ...body } }) =>
      safe(() => client.impact(id, body)),
    ),
  review: protectProcedure
    .input(
      mutationSchema.extend({
        id,
        input: competitionInputSchema,
        review: reviewSchema,
      }),
    )
    .mutation(({ input: { id, ...body } }) =>
      safe(() => client.review(id, body)),
    ),
});
