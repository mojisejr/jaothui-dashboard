import { z } from "zod";
import { competitionSchema } from "./competitions";
import {
  exportLayoutSchema,
  exportPlanSchema,
  exportDiagnosticSchema,
} from "./competition-export-layout";
export const exportLayoutDetailSchema = z.object({
  exportPresentationVersion: z.literal(1),
  event: competitionSchema,
  layout: exportLayoutSchema.nullable(),
  proposedLayout: exportLayoutSchema,
  plan: exportPlanSchema,
  rowCount: z.number().int().nonnegative(),
  ageWarningCount: z.number().int().nonnegative(),
  bindings: z.array(
    z.object({
      rawType: z.string(),
      level: z.string(),
      color: z.string(),
      sex: z.string(),
      count: z.number().int().nonnegative(),
      catalogValue: z.string().optional(),
    }),
  ),
});
export const exportLayoutPreviewSchema = z.object({
  exportPresentationVersion: z.literal(1),
  plan: exportPlanSchema,
  rowCount: z.number().int().nonnegative(),
  ageWarningCount: z.number().int().nonnegative(),
  persisted: z.literal(false),
});
export const saveExportLayoutInputSchema = z.object({
  operationId: z.string().uuid(),
  expectedRevision: z.string().min(1),
  expectedCatalogFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  layout: exportLayoutSchema,
});
export const previewExportLayoutInputSchema = z.object({
  layout: exportLayoutSchema,
});
export const exportFailureDetailsSchema = z
  .object({ diagnostics: z.array(exportDiagnosticSchema).optional() })
  .passthrough();
export type ExportLayoutDetail = z.infer<typeof exportLayoutDetailSchema>;
export type ExportLayoutPreview = z.infer<typeof exportLayoutPreviewSchema>;
export type SaveExportLayoutInput = z.infer<typeof saveExportLayoutInputSchema>;

export const exportErrorDiagnosticsSchema = z.object({
  exportDiagnostics: z.array(exportDiagnosticSchema),
});
export function readExportDiagnostics(error: unknown) {
  const parsed = z
    .object({ data: exportErrorDiagnosticsSchema })
    .safeParse(error);
  return parsed.success ? parsed.data.data.exportDiagnostics : [];
}

export const exportReadinessSchema = z.object({
  exportPresentationVersion: z.literal(1),
  items: z.array(
    z.object({
      eventId: z.string(),
      title: z.string(),
      state: z.enum(["ready", "missing-layout", "needs-review"]),
      rowCount: z.number().int().nonnegative().nullable(),
      diagnostics: z.array(exportDiagnosticSchema),
      eventRevision: z.string(),
      catalogFingerprint: z.string().nullable(),
      layoutFingerprint: z.string().nullable(),
    }),
  ),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  hasMore: z.boolean(),
});
export const exportReadinessInputSchema = z.object({
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

export function readSourceExportDiagnostics(error: unknown) {
  const direct = exportErrorDiagnosticsSchema.safeParse(error);
  if (direct.success) return direct.data.exportDiagnostics;
  const rendered = z
    .object({ diagnostics: z.array(exportDiagnosticSchema) })
    .safeParse(error);
  return rendered.success ? rendered.data.diagnostics : [];
}
