import {
  exportReadinessSchema,
  exportLayoutDetailSchema,
  exportLayoutPreviewSchema,
  exportFailureDetailsSchema,
  type SaveExportLayoutInput,
} from "~/lib/competition-export-protocol";
import {
  EXPORT_UPGRADE_MESSAGE,
  exportPlanSchema,
  type ExportDiagnostic,
  type ExportLayout,
} from "~/lib/competition-export-layout";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { env } from "~/env";
import {
  assertCheckInPayload,
  CHECK_IN_UPGRADE_MESSAGE,
  checkInResolutionSchema,
} from "~/lib/competition-check-in";
import {
  competitionSchema,
  listResponseSchema,
  impactSchema,
  type CompetitionInput,
  type CompetitionFilters,
} from "~/lib/competitions";
import {
  applicationSchema,
  applicationsResponseSchema,
  metadataSchema,
  exportDataSchema,
  deleteApplicationResultSchema,
  recountResultSchema,
  assertRegistrationPolicyPayload,
  SOURCE_POLICY_UPGRADE_MESSAGE,
  type ApplicationFilters,
  type OnsiteRegistration,
} from "~/lib/competition-applications";
export class CompetitionApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public exportDiagnostics: ExportDiagnostic[] = [],
  ) {
    super(message);
  }
}
export function toCompetitionTRPCError(error: unknown): TRPCError {
  if (error instanceof TRPCError) return error;
  const e = error as { status?: number; code?: string; message?: string };
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
    cause: error,
    message:
      code === "CONFLICT" && (!e.code || e.code === "REVISION_CONFLICT")
        ? "ข้อมูลถูกแก้ไขแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนลองใหม่"
        : code === "BAD_GATEWAY" &&
            e.code !== "NOTIFICATION_DISABLED" &&
            e.code !== "SOURCE_UPGRADE_REQUIRED"
          ? "ติดต่อระบบการแข่งขันไม่สำเร็จ กรุณาลองอีกครั้ง"
          : (e.message ?? "ดำเนินการไม่สำเร็จ"),
  });
}
async function request<T>(
  path: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  init: RequestInit = {},
  query?: Record<string, string | number | undefined>,
  requiresRegistrationPolicy = false,
  requiresCheckIn: false | "application" | "list" = false,
  requiresExportPresentation: boolean | "packet" = false,
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
      .object({
        error: z.object({
          code: z.string(),
          message: z.string(),
          details: exportFailureDetailsSchema.optional(),
        }),
      })
      .safeParse(body);
    throw new CompetitionApiError(
      response.status,
      e.success ? e.data.error.code : "UPSTREAM_ERROR",
      e.success ? e.data.error.message : "ติดต่อระบบการแข่งขันไม่สำเร็จ",
      e.success ? (e.data.error.details?.diagnostics ?? []) : [],
    );
  }
  const data = z.object({ data: z.unknown() }).parse(body).data;
  if (requiresRegistrationPolicy) {
    try {
      assertRegistrationPolicyPayload(data);
    } catch {
      throw new CompetitionApiError(
        503,
        "SOURCE_UPGRADE_REQUIRED",
        SOURCE_POLICY_UPGRADE_MESSAGE,
      );
    }
  }
  if (requiresCheckIn) {
    try {
      assertCheckInPayload(data, requiresCheckIn === "list");
    } catch {
      throw new CompetitionApiError(
        503,
        "SOURCE_UPGRADE_REQUIRED",
        CHECK_IN_UPGRADE_MESSAGE,
      );
    }
  }
  if (
    requiresExportPresentation &&
    (!z.object({ exportPresentationVersion: z.literal(1) }).safeParse(data)
      .success ||
      (requiresExportPresentation === "packet" &&
        !z
          .object({
            exportPlan: exportPlanSchema,
            registrations: z.array(z.object({ rawType: z.string() })),
          })
          .safeParse(data).success))
  )
    throw new CompetitionApiError(
      503,
      "SOURCE_UPGRADE_REQUIRED",
      EXPORT_UPGRADE_MESSAGE,
    );
  return schema.parse(data);
}
const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
export const competitionAdminApiClient = {
  exportReadiness: (query: { page: number; pageSize: number }) =>
    request(
      "/export-readiness",
      exportReadinessSchema,
      {},
      query,
      false,
      false,
      true,
    ),
  exportLayout: (id: string) =>
    request(
      `/${encodeURIComponent(id)}/export-layout`,
      exportLayoutDetailSchema,
      {},
      undefined,
      false,
      false,
      true,
    ),
  previewExportLayout: (id: string, body: { layout: ExportLayout }) =>
    request(
      `/${encodeURIComponent(id)}/export-layout/preview`,
      exportLayoutPreviewSchema,
      json("POST", body),
      undefined,
      false,
      false,
      true,
    ),
  saveExportLayout: (id: string, body: SaveExportLayoutInput) =>
    request(
      `/${encodeURIComponent(id)}/export-layout`,
      exportLayoutDetailSchema,
      json("PATCH", body),
      undefined,
      false,
      false,
      true,
    ),
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
  applications: (id: string, query: ApplicationFilters) =>
    request(
      `/${encodeURIComponent(id)}/applications`,
      applicationsResponseSchema,
      {},
      query,
      true,
      query.checkInStatus ? "list" : false,
    ),
  application: (id: string, registrationId: string) =>
    request(
      `/${encodeURIComponent(id)}/applications/${encodeURIComponent(registrationId)}`,
      applicationSchema,
      {},
      undefined,
      true,
    ),
  checkIn: (
    id: string,
    registrationId: string,
    body: { operationId: string; expectedRevision: string },
  ) =>
    request(
      `/${encodeURIComponent(id)}/applications/${encodeURIComponent(registrationId)}/check-in`,
      applicationSchema,
      json("POST", body),
      undefined,
      true,
      "application",
    ),
  undoCheckIn: (
    id: string,
    registrationId: string,
    body: { operationId: string; expectedRevision: string; reason: string },
  ) =>
    request(
      `/${encodeURIComponent(id)}/applications/${encodeURIComponent(registrationId)}/undo-check-in`,
      applicationSchema,
      json("POST", body),
      undefined,
      true,
      "application",
    ),
  resolveCheckIn: (token: string) =>
    request(
      "/check-in/resolve",
      checkInResolutionSchema,
      json("POST", { token }),
    ),
  approval: (
    id: string,
    registrationId: string,
    body: {
      operationId: string;
      expectedRevision: string;
      result: boolean;
      comment: string;
    },
  ) =>
    request(
      `/${encodeURIComponent(id)}/applications/${encodeURIComponent(registrationId)}/approval`,
      applicationSchema,
      json("POST", body),
      undefined,
      true,
    ),
  retryNotification: (
    id: string,
    registrationId: string,
    body: { operationId: string; expectedRevision: string },
  ) =>
    request(
      `/${encodeURIComponent(id)}/applications/${encodeURIComponent(registrationId)}/retry-notification`,
      applicationSchema,
      json("POST", body),
      undefined,
      true,
    ),
  metadata: (id: string, microchip: string) =>
    request(
      `/${encodeURIComponent(id)}/metadata`,
      metadataSchema,
      {},
      { microchip },
    ),
  onsite: (
    id: string,
    body: {
      operationId: string;
      expectedRevision: string;
      registration: OnsiteRegistration;
    },
  ) =>
    request(
      `/${encodeURIComponent(id)}/onsite`,
      applicationSchema,
      json("POST", body),
      undefined,
      true,
    ),
  deleteApplication: (
    id: string,
    registrationId: string,
    body: {
      operationId: string;
      expectedRevision: string;
      registrationRevision: string;
      reason: string;
    },
  ) =>
    request(
      `/${encodeURIComponent(id)}/applications/${encodeURIComponent(registrationId)}/delete`,
      deleteApplicationResultSchema,
      json("POST", body),
    ),
  recountRegistrations: (
    id: string,
    body: { operationId: string; expectedRevision: string },
  ) =>
    request(
      `/${encodeURIComponent(id)}/recount`,
      recountResultSchema,
      json("POST", body),
    ),
  exportData: (id: string) =>
    request(
      `/${encodeURIComponent(id)}/export`,
      exportDataSchema,
      { headers: { "x-export-presentation-version": "1" } },
      undefined,
      true,
      false,
      "packet",
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
