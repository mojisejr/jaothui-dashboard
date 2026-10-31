import { z } from "zod";

export const EXPORT_PRESENTATION_VERSION = 1;
export const EXPORT_INFORMATION_SHEET = "ข้อมูลงาน";
export const EXPORT_UPGRADE_MESSAGE =
  "ระบบต้นทางยังไม่รองรับรูปแบบไฟล์ส่งออก กรุณาอัปเดตระบบต้นทางก่อนดาวน์โหลด";
const id = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);
const thaiLabel = z
  .string()
  .trim()
  .min(1)
  .max(1000)
  .refine(
    (value) => /[ก-๙]/.test(value) && !/[a-z]/i.test(value),
    "กรุณาระบุคำแสดงผลภาษาไทย",
  );
const controlledKey = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);
export const controlledExportAliasSchema = z
  .object({
    field: z.enum(["sex", "color", "level"]),
    rawValue: z.string().max(2000),
    canonicalValue: controlledKey,
    labelTh: thaiLabel,
  })
  .strict();
export const exportCategorySchema = z
  .object({
    id,
    level: controlledKey,
    catalogValue: z.string().min(1).max(2000).optional(),
    registrationTypeValues: z
      .array(z.string().min(1).max(2000))
      .min(1)
      .max(200),
    posterNumber: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .regex(
        /^[ก-๙0-9 ._()\-]+$/,
        "เลขรุ่นใช้ตัวเลข อักษรไทย และเครื่องหมายทั่วไปเท่านั้น",
      ),
    fullLabelTh: thaiLabel,
    shortLabelTh: thaiLabel.refine(
      (value) => value.length <= 100,
      "ชื่อย่อต้องไม่เกิน 100 ตัวอักษร",
    ),
    historical: z.boolean().optional(),
    groups: z
      .array(z.object({ color: controlledKey, sex: controlledKey }).strict())
      .min(1)
      .max(100),
  })
  .strict();
export const exportLayoutSchema = z
  .object({
    version: z.literal(EXPORT_PRESENTATION_VERSION),
    reviewedCatalogFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    categories: z.array(exportCategorySchema).max(400),
    aliases: z.array(controlledExportAliasSchema).max(1000).default([]),
  })
  .strict()
  .superRefine((layout, context) => {
    if (
      layout.categories.reduce(
        (sum, category) => sum + category.groups.length,
        0,
      ) > 5000
    )
      context.addIssue({
        code: "custom",
        path: ["categories"],
        message: "กำหนดกลุ่มส่งออกได้ไม่เกิน 5000 กลุ่ม",
      });
  });
export type ExportLayout = z.infer<typeof exportLayoutSchema>;
export type ExportCategory = z.infer<typeof exportCategorySchema>;
export type ControlledExportAlias = z.infer<typeof controlledExportAliasSchema>;
export type ExportControlledField = ControlledExportAlias["field"];

export const exportDiagnosticSchema = z.object({
  code: z.string(),
  message: z.string(),
  path: z.string().optional(),
  registrationIds: z.array(z.string()).optional(),
  categoryId: z.string().optional(),
  value: z.string().optional(),
});
export const exportGroupSchema = z.object({
  key: z.string(),
  categoryId: z.string(),
  ordinal: z.number().int().positive(),
  posterNumber: z.string(),
  sheetName: z.string().min(1).max(31),
  fullClassLabel: z.string(),
  levelLabel: z.string(),
  colorLabel: z.string(),
  sexLabel: z.string(),
  registrationIds: z.array(z.string()),
});
export const exportPlanSchema = z.object({
  version: z.literal(EXPORT_PRESENTATION_VERSION),
  state: z.enum(["ready", "missing-layout", "needs-review"]),
  eventId: z.string(),
  eventRevision: z.string(),
  catalogFingerprint: z.string(),
  layoutFingerprint: z.string().nullable(),
  diagnostics: z.array(exportDiagnosticSchema),
  groups: z.array(exportGroupSchema),
});
export type ExportDiagnostic = z.infer<typeof exportDiagnosticSchema>;
export type ExportGroup = z.infer<typeof exportGroupSchema>;
export type ExportPlan = z.infer<typeof exportPlanSchema>;
export type ExportRegistrationIdentity = {
  _id: string;
  rawType: string;
  level: string;
  color: string;
  sex: string;
  event?: unknown;
};
export type ExportCompilationEvent = {
  _id: string;
  _rev: string;
  catalogs: { national: string[]; province: string[] };
};

/** Controlled labels only. Personal/free-text fields are never translated. */
export const EXPORT_CONTROLLED_LABELS: Record<
  ExportControlledField,
  Record<string, string>
> = {
  sex: { male: "ผู้", female: "เมีย" },
  color: {
    black: "ดำ",
    albino: "เผือก",
    white: "ขาว",
    gray: "เทา",
    brown: "น้ำตาล",
  },
  level: { national: "ระดับประเทศ", province: "ระดับจังหวัด / ท้องถิ่น" },
};
export const EXPORT_AGE_SOURCE_LABELS = {
  stored: "อายุที่บันทึกไว้",
  cutoff: "คำนวณจากวันตัดอายุ",
  missing: "ข้อมูลอายุไม่ครบ",
};
export const EXPORT_AGE_WARNING_LABELS = {
  "calculated-from-cutoff": "ไม่มีอายุที่บันทึกไว้ คำนวณจากวันตัดอายุของงาน",
  "missing-or-invalid-age":
    "อายุหรือวันเกิด/วันตัดอายุไม่ครบหรือไม่ถูกต้อง ต้องตรวจสอบ",
};
