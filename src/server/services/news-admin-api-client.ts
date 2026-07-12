import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { env } from "~/env";

export const newsEventAdminTypeSchema = z.enum([
  "news",
  "event",
  "announcement",
]);

export const newsEventAdminStatusSchema = z.enum([
  "draft",
  "published",
  "archived",
]);

export const newsEventAdminItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  slug: z.string(),
  type: newsEventAdminTypeSchema,
  status: newsEventAdminStatusSchema,
  featured: z.boolean(),
  priority: z.number(),
  publishedAt: z.string().nullable(),
  eventStartAt: z.string().nullable(),
  eventEndAt: z.string().nullable(),
  location: z.string().nullable(),
  excerpt: z.string(),
  coverImageUrl: z.string().nullable(),
  coverImageAssetRef: z.string().nullable(),
  ctaLabel: z.string().nullable(),
  ctaUrl: z.string().nullable(),
});

export const newsEventAdminUpsertInputSchema = z.object({
  title: z.string().min(1).max(120),
  slug: z.string().min(1).max(140),
  type: newsEventAdminTypeSchema.default("news"),
  status: newsEventAdminStatusSchema.default("draft"),
  featured: z.boolean().default(false),
  priority: z.number().int().min(0).max(999).default(100),
  publishedAt: z.string().datetime().nullable().optional(),
  eventStartAt: z.string().datetime().nullable().optional(),
  eventEndAt: z.string().datetime().nullable().optional(),
  location: z.string().max(160).nullable().optional(),
  excerpt: z.string().min(1).max(240),
  coverImageAssetRef: z.string().nullable().optional(),
  ctaLabel: z.string().max(40).nullable().optional(),
  ctaUrl: z
    .string()
    .refine(
      (value) => value.startsWith("/") || /^https?:\/\//.test(value),
      "CTA URL must be relative or HTTP(S)",
    )
    .nullable()
    .optional(),
  body: z.string().max(6000).nullable().optional(),
});

const newsEventAdminListResponseSchema = z.object({
  items: z.array(newsEventAdminItemSchema),
});

const newsEventAdminMutationResponseSchema = z.object({
  item: newsEventAdminItemSchema,
});

const newsEventAdminUploadCoverResponseSchema = z.object({
  asset: z.object({
    assetRef: z.string().min(1),
    url: z.string().nullable(),
  }),
});

export const uploadNewsEventCoverInputSchema = z.object({
  filename: z.string().min(1).max(180),
  contentType: z.string().startsWith("image/"),
  base64: z.string().min(1),
});

export type NewsEventAdminItem = z.infer<typeof newsEventAdminItemSchema>;
export type NewsEventAdminUpsertInput = z.infer<
  typeof newsEventAdminUpsertInputSchema
>;
export type UploadNewsEventCoverInput = z.infer<
  typeof uploadNewsEventCoverInputSchema
>;

interface NewsAdminApiConfig {
  baseUrl: string;
  apiKey: string;
}

export class NewsAdminApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code = "NEWS_ADMIN_API_ERROR") {
    super(message);
    this.name = "NewsAdminApiError";
    this.status = status;
    this.code = code;
  }
}

function getNewsAdminApiConfig(): NewsAdminApiConfig {
  if (!env.JAOTHUI_NEWS_ADMIN_API_BASE_URL || !env.JAOTHUI_NEWS_ADMIN_API_KEY) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "News admin API bridge is not configured",
    });
  }

  return {
    baseUrl: env.JAOTHUI_NEWS_ADMIN_API_BASE_URL,
    apiKey: env.JAOTHUI_NEWS_ADMIN_API_KEY,
  };
}

function buildNewsAdminUrl(
  config: NewsAdminApiConfig,
  path: string,
  searchParams?: Record<string, string>,
): URL {
  const url = new URL(
    path,
    config.baseUrl.endsWith("/") ? config.baseUrl : `${config.baseUrl}/`,
  );

  for (const [key, value] of Object.entries(searchParams ?? {})) {
    url.searchParams.set(key, value);
  }

  return url;
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function mapApiError(status: number, body: unknown): NewsAdminApiError {
  const parsed = z
    .object({
      error: z.string().optional(),
      message: z.string().optional(),
    })
    .safeParse(body);

  const code = parsed.success
    ? parsed.data.error ?? "NEWS_ADMIN_API_ERROR"
    : "NEWS_ADMIN_API_ERROR";
  const message =
    parsed.success && parsed.data.message
      ? parsed.data.message
      : "News admin API request failed";

  return new NewsAdminApiError(message, status, code);
}

async function requestNewsAdminApi<T>(
  path: string,
  responseSchema: z.ZodType<T>,
  init: RequestInit = {},
  searchParams?: Record<string, string>,
  config = getNewsAdminApiConfig(),
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${config.apiKey}`);
  headers.set("Accept", "application/json");

  const response = await fetch(buildNewsAdminUrl(config, path, searchParams), {
    ...init,
    headers,
  });

  const body = await readResponseBody(response);
  if (!response.ok) {
    throw mapApiError(response.status, body);
  }

  return responseSchema.parse(body);
}

function jsonRequestInit(method: "POST" | "PATCH", body?: unknown): RequestInit {
  return {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

export function toNewsAdminTRPCError(error: unknown): TRPCError {
  if (error instanceof TRPCError) return error;

  if (error instanceof NewsAdminApiError) {
    if (error.status === 401 || error.status === 403) {
      return new TRPCError({
        code: "UNAUTHORIZED",
        message: "News admin API rejected the dashboard bridge key",
        cause: error,
      });
    }

    if (error.status === 400 || error.status === 404) {
      return new TRPCError({
        code: "BAD_REQUEST",
        message: error.message,
        cause: error,
      });
    }

    return new TRPCError({
      code: "BAD_GATEWAY",
      message: "News admin API request failed",
      cause: error,
    });
  }

  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Unexpected news admin proxy error",
    cause: error,
  });
}

export const newsAdminApiClient = {
  async list() {
    return requestNewsAdminApi(
      "/api/admin/news-events",
      newsEventAdminListResponseSchema,
    );
  },

  async getById(id: string) {
    return requestNewsAdminApi(
      `/api/admin/news-events/${encodeURIComponent(id)}`,
      newsEventAdminMutationResponseSchema,
    );
  },

  async create(input: NewsEventAdminUpsertInput) {
    return requestNewsAdminApi(
      "/api/admin/news-events",
      newsEventAdminMutationResponseSchema,
      jsonRequestInit("POST", input),
    );
  },

  async update(id: string, input: NewsEventAdminUpsertInput) {
    return requestNewsAdminApi(
      `/api/admin/news-events/${encodeURIComponent(id)}`,
      newsEventAdminMutationResponseSchema,
      jsonRequestInit("PATCH", input),
    );
  },

  async publish(id: string) {
    return requestNewsAdminApi(
      `/api/admin/news-events/${encodeURIComponent(id)}/publish`,
      newsEventAdminMutationResponseSchema,
      jsonRequestInit("POST"),
    );
  },

  async archive(id: string) {
    return requestNewsAdminApi(
      `/api/admin/news-events/${encodeURIComponent(id)}/archive`,
      newsEventAdminMutationResponseSchema,
      jsonRequestInit("POST"),
    );
  },

  async uploadCover(input: UploadNewsEventCoverInput) {
    const bytes = Buffer.from(input.base64, "base64");

    return requestNewsAdminApi(
      "/api/admin/news-events/upload-cover",
      newsEventAdminUploadCoverResponseSchema,
      {
        method: "POST",
        headers: {
          "Content-Type": input.contentType,
        },
        body: bytes as unknown as BodyInit,
      },
      { filename: input.filename },
    );
  },
};
