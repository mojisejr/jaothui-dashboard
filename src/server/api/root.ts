import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";
import { pedigreeRouter } from "./routers/r-pedigree";
import { authRouter } from "./routers/r-auth";
import { metadataRouter } from "./routers/r-metadata";
import { imageRouter } from "./routers/r-image";
import { kwaithaiRouter } from "./routers/r-kwaithai";
import { rewardRouter } from "./routers/r-reward";
import { dnaRouter } from "./routers/r-dna";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  ped: pedigreeRouter,
  auth: authRouter,
  metadata: metadataRouter,
  image: imageRouter,
  kwaithai: kwaithaiRouter,
  reward: rewardRouter,
  dna: dnaRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.post.all();
 *       ^? Post[]
 */
export const createCaller = createCallerFactory(appRouter);
