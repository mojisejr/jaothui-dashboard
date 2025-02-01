import { z } from "zod";

import { createTRPCRouter, protectProcedure } from "~/server/api/trpc";
import {
  byPassApprovment,
  searchAndCheckApprovment,
} from "~/server/services/certificate.service";

export const certRouter = createTRPCRouter({
  searchCert: protectProcedure.input(z.string()).query(async ({ input }) => {
    return await searchAndCheckApprovment(input);
  }),
  byPassApprove: protectProcedure
    .input(z.string())
    .mutation(async ({ input }) => {
      return await byPassApprovment(input);
    }),
});
