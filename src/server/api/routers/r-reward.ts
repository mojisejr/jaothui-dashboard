import { DiagnosticError } from "~/server/diagnostics/errors";
import { z } from "zod";
import { createTRPCRouter, protectProcedure } from "~/server/api/trpc";
import { rewardInputSchema } from "~/lib/reward-contract";
import { rewardService } from "~/server/services/reward.service";
export const rewardRouter = createTRPCRouter({
  addNewReward: protectProcedure
    .use(async ({ getRawInput, next }) => {
      const raw: unknown = await getRawInput();
      if (raw && typeof raw === "object" && !("id" in raw))
        throw new DiagnosticError("LEGACY_REWARD_REQUIRES_REQUEST_ID");
      return next();
    })
    .input(rewardInputSchema)
    .mutation(({ input }) => rewardService.save(input)),
  getById: protectProcedure
    .input(z.object({ id: z.string().uuid() }).strict())
    .query(({ input }) => rewardService.getById(input.id)),
});
