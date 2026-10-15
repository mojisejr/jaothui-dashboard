import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { env } from "~/env";
import {
  competitionSchema,
  listResponseSchema,
  impactSchema,
  type CompetitionInput,
  type CompetitionFilters,
} from "~/lib/competitions";
export class CompetitionApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function toCompetitionTRPCError(error: unknown): TRPCError {
  if (error instanceof TRPCError) return error;
  const e = error as { status?: number; message?: string };
  const code =
    e.status === 409
      ? "CONFLICT"
      : e.status === 404
        ? "NOT_FOUND"
        : e.status === 400 || e.status === 422
          ? "BAD_REQUEST"
          : e.status === 401 || e.status === 403
            ? "UNAUTHORIZED"
            : "BAD_GATEWAY";
  return new TRPCError({
    code,
    message:
      code === "CONFLICT"
        ? "ข้อมูลถูกแก้ไขแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนลองใหม่"
        : code === "BAD_GATEWAY"
          ? "ติดต่อระบบการแข่งขันไม่สำเร็จ กรุณาลองอีกครั้ง"
          : (e.message ?? "ดำเนินการไม่สำเร็จ"),
  });
}
async function request<T>(
  path: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  init: RequestInit = {},
  query?: CompetitionFilters,
): Promise<T> {
  if (
    !env.JAOTHUI_COMPETITION_ADMIN_API_BASE_URL ||
    !env.JAOTHUI_COMPETITION_ADMIN_API_KEY
  )
    throw new Error("Competition bridge is not configured");
  const url = new URL(
    `/api/admin/competitions${path}`,
    env.JAOTHUI_COMPETITION_ADMIN_API_BASE_URL,
  );
  if (query)
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }
  const headers = new Headers(init.headers);
  headers.set(
    "Authorization",
    `Bearer ${env.JAOTHUI_COMPETITION_ADMIN_API_KEY}`,
  );
  headers.set("Accept", "application/json");
  const response = await fetch(url, {
    ...init,
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(30000),
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    const e = z
      .object({ error: z.object({ code: z.string(), message: z.string() }) })
      .safeParse(body);
    throw new CompetitionApiError(
      response.status,
      e.success ? e.data.error.code : "UPSTREAM_ERROR",
      e.success ? e.data.error.message : "ติดต่อระบบการแข่งขันไม่สำเร็จ",
    );
  }
  return schema.parse(z.object({ data: z.unknown() }).parse(body).data);
}
const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
export const competitionAdminApiClient = {
  list: (q: CompetitionFilters) => request("", listResponseSchema, {}, q),
  get: (id: string) => request(`/${encodeURIComponent(id)}`, competitionSchema),
  create: (body: { operationId: string; input: CompetitionInput }) =>
    request("", competitionSchema, json("POST", body)),
  update: (
    id: string,
    body: {
      operationId: string;
      expectedRevision: string;
      input: CompetitionInput;
    },
  ) =>
    request(
      `/${encodeURIComponent(id)}`,
      competitionSchema,
      json("PATCH", body),
    ),
  action: (
    id: string,
    action: string,
    body: { operationId: string; expectedRevision: string },
  ) =>
    request(
      `/${encodeURIComponent(id)}/${action}`,
      competitionSchema,
      json("POST", body),
    ),
  impact: (
    id: string,
    body: {
      operationId: string;
      expectedRevision: string;
      input: CompetitionInput;
    },
  ) =>
    request(
      `/${encodeURIComponent(id)}/impact-report`,
      impactSchema,
      json("POST", body),
    ),
  review: (id: string, body: unknown) =>
    request(
      `/${encodeURIComponent(id)}/apply-reviewed-rules`,
      competitionSchema,
      json("POST", body),
    ),
  upload: (bytes: Buffer, type: string, name: string) =>
    request("/cover", z.object({ assetId: z.string(), url: z.string() }), {
      method: "POST",
      headers: {
        "Content-Type": type,
        "x-file-name": encodeURIComponent(name),
      },
      body: bytes as unknown as BodyInit,
    }),
};
