import { z } from "zod";

import { createTRPCRouter, protectProcedure } from "~/server/api/trpc";
import { getByMicrochip } from "~/server/services/buffalo.service";

export const pedigreeRouter = createTRPCRouter({
  getAll: protectProcedure.query(async ({ ctx }) => {
    try {
      const pedigrees = await ctx.db.pedigree.findMany();
      return pedigrees;
    } catch (error) {
      console.log(error);
      return [];
    }
  }),
  searchByMicrochip: protectProcedure
    .input(z.string())
    .query(async ({ input }) => {
      return await getByMicrochip(input);
    }),
  // create: protectProcedure
  //   .input(
  //     z.object({
  //       tokenId: z.string(),
  //       name: z.string(),
  //       microchip: z.string(),
  //       certNo: z.string().nullable(),
  //       origin: z.string(),
  //       color: z.string(),
  //       imageUrl: z.string(),
  //       detail: z.string().nullable(),
  //       sex: z.string(),
  //       rarity: z.string(),
  //       birthday: z.date(),
  //       height: z.number(),
  //       motherId: z.string().nullable(),
  //       fatherId: z.string().nullable(),
  //     }),
  //   )
  //   .query(async ({ ctx, input }) => {
  //     try {
  //       const created = await ctx.db.pedigree.create({
  //         data: { ...input, isMinted: false },
  //       });
  //       return created;
  //     } catch (error) {
  //       console.log(error);
  //       return null;
  //     }
  //   }),
});
