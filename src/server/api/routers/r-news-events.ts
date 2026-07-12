import { z } from "zod";

import { createTRPCRouter, protectProcedure } from "~/server/api/trpc";
import {
  newsAdminApiClient,
  newsEventAdminUpsertInputSchema,
  toNewsAdminTRPCError,
  uploadNewsEventCoverInputSchema,
} from "~/server/services/news-admin-api-client";

const idInputSchema = z.object({
  id: z.string().min(1),
});

export const newsEventsRouter = createTRPCRouter({
  list: protectProcedure.query(async () => {
    try {
      return await newsAdminApiClient.list();
    } catch (error) {
      throw toNewsAdminTRPCError(error);
    }
  }),

  getById: protectProcedure.input(idInputSchema).query(async ({ input }) => {
    try {
      return await newsAdminApiClient.getById(input.id);
    } catch (error) {
      throw toNewsAdminTRPCError(error);
    }
  }),

  create: protectProcedure
    .input(newsEventAdminUpsertInputSchema)
    .mutation(async ({ input }) => {
      try {
        return await newsAdminApiClient.create(input);
      } catch (error) {
        throw toNewsAdminTRPCError(error);
      }
    }),

  update: protectProcedure
    .input(
      z.object({
        id: z.string().min(1),
        data: newsEventAdminUpsertInputSchema,
      }),
    )
    .mutation(async ({ input }) => {
      try {
        return await newsAdminApiClient.update(input.id, input.data);
      } catch (error) {
        throw toNewsAdminTRPCError(error);
      }
    }),

  publish: protectProcedure.input(idInputSchema).mutation(async ({ input }) => {
    try {
      return await newsAdminApiClient.publish(input.id);
    } catch (error) {
      throw toNewsAdminTRPCError(error);
    }
  }),

  archive: protectProcedure.input(idInputSchema).mutation(async ({ input }) => {
    try {
      return await newsAdminApiClient.archive(input.id);
    } catch (error) {
      throw toNewsAdminTRPCError(error);
    }
  }),

  uploadCover: protectProcedure
    .input(uploadNewsEventCoverInputSchema)
    .mutation(async ({ input }) => {
      try {
        return await newsAdminApiClient.uploadCover(input);
      } catch (error) {
        throw toNewsAdminTRPCError(error);
      }
    }),
});
