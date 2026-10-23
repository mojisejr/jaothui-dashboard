import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    DATABASE_URL: z.string().url(),
    BUFFALO_INTEGRITY_MODE: z.enum(["off", "drain", "enabled"]).optional(),
    BUFFALO_INTEGRITY_SERVER_CONFIG: z.string().optional(),
    BUFFALO_INTEGRITY_SIGNER_KEY: z
      .string()
      .regex(/^0x[0-9a-fA-F]{64}$/)
      .optional(),
    BUFFALO_INTEGRITY_STORAGE_JWT: z.string().optional(),
    BUFFALO_INTEGRITY_RELEASE_ID: z.string().optional(),
    BUFFALO_INTEGRITY_ISOLATED_CONFIG: z.string().optional(),
    BUFFALO_INTEGRITY_REHEARSAL_ID: z.string().optional(),

    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    SANITY_PROJECT_ID: z.string().optional(),
    SANITY_DATASET: z.string().default("production"),
    SANITY_API_TOKEN: z.string().optional(),
    JAOTHUI_COMPETITION_ADMIN_API_BASE_URL: z.string().url().optional(),
    JAOTHUI_COMPETITION_ADMIN_API_KEY: z.string().optional(),
    JAOTHUI_NEWS_ADMIN_API_BASE_URL: z.string().url().optional(),
    JAOTHUI_NEWS_ADMIN_API_KEY: z.string().optional(),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    // NEXT_PUBLIC_CLIENTVAR: z.string(),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    JAOTHUI_COMPETITION_ADMIN_API_BASE_URL: process.env.JAOTHUI_COMPETITION_ADMIN_API_BASE_URL,
    JAOTHUI_COMPETITION_ADMIN_API_KEY: process.env.JAOTHUI_COMPETITION_ADMIN_API_KEY,
    DATABASE_URL: process.env.DATABASE_URL,
    BUFFALO_INTEGRITY_MODE: process.env.BUFFALO_INTEGRITY_MODE,
    BUFFALO_INTEGRITY_SERVER_CONFIG:
      process.env.BUFFALO_INTEGRITY_SERVER_CONFIG,
    BUFFALO_INTEGRITY_SIGNER_KEY: process.env.BUFFALO_INTEGRITY_SIGNER_KEY,
    BUFFALO_INTEGRITY_STORAGE_JWT: process.env.BUFFALO_INTEGRITY_STORAGE_JWT,
    BUFFALO_INTEGRITY_RELEASE_ID: process.env.BUFFALO_INTEGRITY_RELEASE_ID,
    BUFFALO_INTEGRITY_ISOLATED_CONFIG:
      process.env.BUFFALO_INTEGRITY_ISOLATED_CONFIG,
    BUFFALO_INTEGRITY_REHEARSAL_ID: process.env.BUFFALO_INTEGRITY_REHEARSAL_ID,

    NODE_ENV: process.env.NODE_ENV,
    SANITY_PROJECT_ID: process.env.SANITY_PROJECT_ID,
    SANITY_DATASET: process.env.SANITY_DATASET,
    SANITY_API_TOKEN: process.env.SANITY_API_TOKEN,
    JAOTHUI_NEWS_ADMIN_API_BASE_URL:
      process.env.JAOTHUI_NEWS_ADMIN_API_BASE_URL,
    JAOTHUI_NEWS_ADMIN_API_KEY: process.env.JAOTHUI_NEWS_ADMIN_API_KEY,
    // NEXT_PUBLIC_CLIENTVAR: process.env.NEXT_PUBLIC_CLIENTVAR,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
});
