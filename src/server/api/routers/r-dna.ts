import { z } from "zod";

import { createTRPCRouter, protectProcedure } from "~/server/api/trpc";
import { updateDNA } from "~/server/services/buffalo.service";

export const dnaRouter = createTRPCRouter({
  updateDNA: protectProcedure
    .input(
      z.object({
        microchip: z.string(),
        tokenId: z.string(),
        dnaURL: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      return await updateDNA(input.tokenId, input.microchip, input.dnaURL);
    }),
});
