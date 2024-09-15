import { z } from "zod";
import { createTRPCRouter, protectProcedure } from "~/server/api/trpc";
import {
  addMetadata,
  addMetadataBatch,
  createMetadataForManager,
  getAllMintedBuffalos,
  getCurrentTokenId,
  getMetadataByMicrochipId,
  mintNFT,
  updateBuffaloBirthday,
  updateBuffaloCertNo,
  updateBuffaloColor,
  updateBuffaloDetail,
  updateBuffaloDna,
  updateBuffaloHeight,
  updateBuffaloMicrochip,
  updateBuffaloName,
  updateBuffaloOrigin,
  updateBuffaloRarity,
  updateBuffaloSex,
  updateParentId,
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
        motherId: z.string().optional(),
        fatherId: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      return await uploadBuffaloJson(
        input.tokenId,
        input.metadata,
        input.motherId,
        input.fatherId,
      );
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
      return await addMetadata(input.tokenId);
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
  getMetadataByMicrochip: protectProcedure
    .input(z.string())
    .query(async ({ input }) => {
      return await getMetadataByMicrochipId(input);
    }),
  updateBuffaloImage: protectProcedure
    .input(z.number())
    .mutation(async ({ input }) => {
      return await addMetadataBatch(input);
    }),
  updateBuffaloMicrochip: protectProcedure
    .input(
      z.object({
        tokenId: z.number(),
        oldMicrochip: z.string(),
        microchip: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      return await updateBuffaloMicrochip(
        input.tokenId,
        input.oldMicrochip,
        input.microchip,
      );
    }),
  updateBuffaloBirthday: protectProcedure
    .input(
      z.object({
        tokenId: z.number(),
        microchip: z.string(),
        birthday: z.date(),
      }),
    )
    .mutation(async ({ input }) => {
      return await updateBuffaloBirthday(
        input.tokenId,
        input.microchip,
        input.birthday,
      );
    }),
  updateBuffaloCertNo: protectProcedure
    .input(
      z.object({
        tokenId: z.number(),
        microchip: z.string(),
        certNo: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      return await updateBuffaloCertNo(
        input.tokenId,
        input.microchip,
        input.certNo,
      );
    }),
  updateBuffaloColor: protectProcedure
    .input(
      z.object({
        tokenId: z.number(),
        microchip: z.string(),
        color: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      return await updateBuffaloColor(
        input.tokenId,
        input.microchip,
        input.color,
      );
    }),
  updateBuffaloDetail: protectProcedure
    .input(
      z.object({
        tokenId: z.number(),
        microchip: z.string(),
        detail: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      return await updateBuffaloDetail(
        input.tokenId,
        input.microchip,
        input.detail,
      );
    }),
  updateBuffaloDna: protectProcedure
    .input(
      z.object({
        tokenId: z.number(),
        microchip: z.string(),
        dna: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      return await updateBuffaloDna(input.tokenId, input.microchip, input.dna);
    }),
  updateBuffaloHeight: protectProcedure
    .input(
      z.object({
        tokenId: z.number(),
        microchip: z.string(),
        height: z.number(),
      }),
    )
    .mutation(async ({ input }) => {
      return await updateBuffaloHeight(
        input.tokenId,
        input.microchip,
        input.height,
      );
    }),
  updateBuffaloName: protectProcedure
    .input(
      z.object({
        tokenId: z.number(),
        microchip: z.string(),
        name: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      return await updateBuffaloName(
        input.tokenId,
        input.microchip,
        input.name,
      );
    }),
  updateBuffaloOrigin: protectProcedure
    .input(
      z.object({
        tokenId: z.number(),
        microchip: z.string(),
        origin: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      return await updateBuffaloOrigin(
        input.tokenId,
        input.microchip,
        input.origin,
      );
    }),

  updateBuffaloRarity: protectProcedure
    .input(
      z.object({
        tokenId: z.number(),
        microchip: z.string(),
        rarity: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      return await updateBuffaloRarity(
        input.tokenId,
        input.microchip,
        input.rarity,
      );
    }),

  updateBuffaloSex: protectProcedure
    .input(
      z.object({
        tokenId: z.number(),
        microchip: z.string(),
        sex: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      return await updateBuffaloSex(input.tokenId, input.microchip, input.sex);
    }),

  updateParentId: protectProcedure
    .input(
      z.object({
        microchip: z.string(),
        fatherMicrochip: z.string().optional(),
        motherMicrochip: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      return await updateParentId(
        input.microchip,
        input.motherMicrochip!,
        input.fatherMicrochip!,
      );
    }),
});
