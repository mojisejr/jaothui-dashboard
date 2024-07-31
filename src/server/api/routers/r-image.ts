import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { login } from "~/server/services/auth.service";
import { uploadBuffaloImage } from "~/server/services/buffalo.service";

export const imageRouter = createTRPCRouter({
  upload: publicProcedure
    .input(
      z.object({
        tokenId: z.number(),
        image: z.array(z.number()),
      }),
    )
    .mutation(async ({ input }) => {
      if (input.tokenId == -1) return;
      return await uploadBuffaloImage(input.tokenId, Buffer.from(input.image));
    }),
});
