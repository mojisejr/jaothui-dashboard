import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { login } from "~/server/services/auth.service";

export const authRouter = createTRPCRouter({
  login: publicProcedure
    .input(
      z.object({
        username: z.string(),
        password: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      return await login(input.username, input.password);
    }),
});
