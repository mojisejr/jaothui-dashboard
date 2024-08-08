import { z } from "zod";
import {
  createTRPCRouter,
  protectProcedure,
  publicProcedure,
} from "~/server/api/trpc";
import {
  addMetadata,
  createMetadataForManager,
  getAllMintedBuffalos,
  getCurrentTokenId,
  mintNFT,
} from "~/server/blockchain/metadata.service";
import {
  checkCanMint,
  uploadBuffaloJson,
} from "~/server/services/buffalo.service";

export const metadataRouter = createTRPCRouter({
  getAllMetadata: protectProcedure.query(async () => {
    return await getAllMintedBuffalos();
  }),
  upload: protectProcedure
    .input(
      z.object({
        tokenId: z.number(),
        metadata: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      return await uploadBuffaloJson(input.tokenId, input.metadata);
    }),
  checkCanMint: protectProcedure
    .input(
      z.object({
        tokenId: z.number(),
      }),
    )
    .mutation(({ input }) => {
      return checkCanMint(input.tokenId);
    }),
  mint: protectProcedure
    .input(
      z.object({
        tokenId: z.number(),
        newBuffalo: z.object({
          tokenId: z.number().optional(),
          name: z.string(),
          microchip: z.string(),
          certNo: z.string().optional(),
          origin: z.string(),
          color: z.string(),
          detail: z.string().optional().nullable(),
          sex: z.string(),
          rarity: z.string(),
          birthday: z.date(),
          height: z.number(),
          motherId: z.string().optional().nullable(),
          fatherId: z.string().optional().nullable(),
        }),
      }),
    )
    .mutation(async ({ input }) => {
      if (input.tokenId == -1) return;
      return await mintNFT(input.tokenId);
    }),
  addMetadata: protectProcedure
    .input(
      z.object({
        tokenId: z.number(),
        newBuffalo: z.object({
          tokenId: z.number().optional(),
          name: z.string(),
          microchip: z.string(),
          certNo: z.string().optional(),
          origin: z.string(),
          color: z.string(),
          detail: z.string().optional().nullable(),
          sex: z.string(),
          rarity: z.string(),
          birthday: z.date(),
          height: z.number(),
          motherId: z.string().optional().nullable(),
          fatherId: z.string().optional().nullable(),
        }),
      }),
    )
    .mutation(async ({ input }) => {
      if (input.tokenId == -1) return;
      return await addMetadata(input.tokenId, input.newBuffalo);
    }),

  getCurrentTokenId: protectProcedure.query(async ({ ctx }) => {
    return await getCurrentTokenId();
  }),

  getMetaForManager: protectProcedure
    .input(
      z.object({
        tokenId: z.number(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return await createMetadataForManager(input.tokenId);
    }),
});
