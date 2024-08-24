import { z } from "zod";

import { createTRPCRouter, protectProcedure } from "~/server/api/trpc";
import {
  getMemberId,
  updateWallet,
} from "~/server/services/kwaithai-member.service";

export const kwaithaiRouter = createTRPCRouter({
  getMemberId: protectProcedure.input(z.string()).query(async ({ input }) => {
    return await getMemberId(input);
  }),

  updateWallet: protectProcedure
    .input(
      z.object({
        memberId: z.number(),
        walletToUpdate: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      return await updateWallet(input.memberId, input.walletToUpdate);
    }),
});
