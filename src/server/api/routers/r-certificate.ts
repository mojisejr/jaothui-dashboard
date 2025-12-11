import { z } from "zod";

import { createTRPCRouter, protectProcedure } from "~/server/api/trpc";
import {
  byPassApprovment,
  createCertificateBypass,
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
  createCertBypass: protectProcedure
    .input(
      z.object({
        microchip: z.string(),
        slipUrl: z.string().default("N/A"),
        bornAt: z.string().optional(),
        wallet: z.string().optional(),
        ownerName: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      return await createCertificateBypass(input);
    }),
});

