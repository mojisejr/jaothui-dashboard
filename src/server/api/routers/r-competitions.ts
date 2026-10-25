import { z } from "zod";
import { createTRPCRouter, protectProcedure } from "~/server/api/trpc";
import {
  competitionInputSchema,
  competitionCreateInputSchema,
  listSchema,
  mutationSchema,
  reviewSchema,
} from "~/lib/competitions";
import {
  competitionAdminApiClient as client,
  toCompetitionTRPCError,
} from "~/server/services/competition-admin-api-client";
import {
  applicationFiltersSchema,
  approvalInputSchema,
  onsiteRegistrationSchema,
} from "~/lib/competition-applications";
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
  applications: protectProcedure
    .input(applicationFiltersSchema.extend({ id }))
    .query(({ input: { id, ...query } }) =>
      safe(() => client.applications(id, query)),
    ),
  application: protectProcedure
    .input(z.object({ id, registrationId: id }))
    .query(({ input }) =>
      safe(() => client.application(input.id, input.registrationId)),
    ),
  approval: protectProcedure
    .input(z.object({ id, registrationId: id }).and(approvalInputSchema))
    .mutation(({ input: { id, registrationId, ...body } }) =>
      safe(() => client.approval(id, registrationId, body)),
    ),
  retryNotification: protectProcedure
    .input(mutationSchema.extend({ id, registrationId: id }))
    .mutation(({ input: { id, registrationId, ...body } }) =>
      safe(() => client.retryNotification(id, registrationId, body)),
    ),
  metadata: protectProcedure
    .input(z.object({ id, microchip: z.string().trim().min(1).max(100) }))
    .query(({ input }) =>
      safe(() => client.metadata(input.id, input.microchip)),
    ),
  onsite: protectProcedure
    .input(
      mutationSchema.extend({ id, registration: onsiteRegistrationSchema }),
    )
    .mutation(({ input: { id, ...body } }) =>
      safe(() => client.onsite(id, body)),
    ),
  exportData: protectProcedure
    .input(z.object({ id }))
    .query(({ input }) => safe(() => client.exportData(input.id))),
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
        input: competitionCreateInputSchema,
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
