import { z } from "zod";

import { createTRPCRouter, protectProcedure } from "~/server/api/trpc";
import { addNewReward } from "~/server/services/buffalo.service";

export const rewardRouter = createTRPCRouter({
  addNewReward: protectProcedure
    .input(
      z.object({
        microchip: z.string(),
        rewardImage: z.string(),
        eventName: z.string(),
        eventDate: z.date(),
        rewardName: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      return await addNewReward(input);
    }),
});
