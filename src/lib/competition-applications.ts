import { z } from "zod";
import { competitionSchema, mutationSchema } from "./competitions";

export const applicationFiltersSchema = z.object({
  search: z.string().max(300).default(""),
  status: z.enum(["pending", "accepted", "rejected"]).optional(),
  type: z.string().max(2000).optional(),
  level: z.enum(["national", "province"]).optional(),
  sex: z.string().max(100).optional(),
  color: z.string().max(100).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});
const text = z
  .string()
  .nullish()
  .transform((v) => v ?? "");
export const approvalSchema = z.object({
  _id: z.string(),
  _rev: z.string(),
  approvementResult: z.boolean().nullish(),
  comment: text,
  approvementDate: z.string().nullish(),
  notificationState: text,
  notificationUpdatedAt: z.string().nullish(),
});
export const applicationSchema = z
  .object({
    _id: z.string(),
    _rev: z.string(),
    name: text,
    birthday: text,
    microchip: text,
    ownerName: text,
    ownerTel: text,
    type: text,
    level: text,
    sex: text,
    color: text,
    farmName: text,
    province: text,
    fatherName: text,
    motherName: text,
    buffaloAge: z.number().nullish(),
    approval: approvalSchema.nullish(),
    deliveryEnabled: z.boolean().default(false),
    hasLineRecipient: z.boolean().default(false),
    approvalStatus: z.enum(["pending", "accepted", "rejected"]).optional(),
    applicant: z
      .object({ _id: z.string(), lineId: z.string().nullish() })
      .nullish(),
    images: z
      .array(
        z.object({
          _id: z.string(),
          images: z
            .array(z.object({ imageTitle: text, url: z.string().nullish() }))
            .nullish()
            .transform((v) => v ?? []),
        }),
      )
      .nullish()
      .transform((v) => v ?? []),
    address: z
      .object({
        _id: z.string(),
        address: text,
        district: text,
        amphoe: text,
        province: text,
        zipcode: text,
      })
      .nullish(),
    isAdminRegistration: z.boolean().nullish(),
    registeredAt: z.string().nullish(),
  })
  .passthrough();
export const applicationsResponseSchema = z.object({
  items: z.array(applicationSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
  counts: z.object({
    total: z.number(),
    pending: z.number(),
    accepted: z.number(),
    rejected: z.number(),
  }),
  facets: z.object({
    types: z.array(z.string()),
    levels: z.array(z.string()),
    sexes: z.array(z.string()),
    colors: z.array(z.string()),
  }),
});
export const metadataSchema = z.object({
  lookupUnavailable: z.boolean().optional(),
  lookupWarning: z.string().nullish(),
  found: z.boolean(),
  microchip: z.string(),
  metadata: z
    .object({
      name: text,
      birthday: text,
      sex: text,
      color: text,
      imageUrl: z.string().nullish(),
      fatherName: text,
      motherName: text,
    })
    .nullish(),
  duplicateCount: z.number(),
  duplicateRegistrations: z.array(
    z.object({
      _id: z.string(),
      name: text,
      type: text,
      ownerName: text,
      // Additive source field; older sources omit it and stay conservative.
      level: z.enum(["national", "province"]).nullish(),
    }),
  ),
});
export const deleteApplicationResultSchema = z.object({
  registrationId: z.string(),
  previousCount: z.number().nullable(),
  registrationCount: z.number(),
});
export const recountResultSchema = z.object({
  previousCount: z.number().nullable(),
  registrationCount: z.number(),
  changed: z.boolean(),
});
/** Short reasons cannot explain a deletion later; the source enforces the same bound. */
export const deleteApplicationInputSchema = z.object({
  operationId: z.string().uuid(),
  expectedRevision: z.string().min(1),
  registrationRevision: z.string().min(1),
  reason: z.string().trim().min(10).max(3000),
});
export const onsiteRegistrationSchema = z
  .object({
    name: z.string().trim().min(1),
    birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    microchip: z.string().trim().min(1),
    ownerName: z.string().trim().min(1),
    ownerTel: z.string().trim().min(1),
    type: z.string().min(1),
    level: z.enum(["national", "province"]),
    sex: z.string().min(1),
    color: z.string().min(1),
    farmName: z.string().default(""),
    province: z.string().default(""),
    fatherName: z.string().default(""),
    motherName: z.string().default(""),
    duplicateOverrideReason: z.string().trim().min(10).optional(),
  })
  .strict();
export const approvalInputSchema = mutationSchema
  .extend({
    result: z.boolean(),
    comment: z.string().trim().max(3000).default(""),
  })
  .refine((v) => v.result || !!v.comment, {
    message: "กรุณาระบุเหตุผลที่ไม่อนุมัติ",
    path: ["comment"],
  });
export const exportDataSchema = z.object({
  event: competitionSchema,
  registrations: z.array(
    applicationSchema.extend({
      exportAge: z.number().nullish(),
      ageSource: z.enum(["stored", "cutoff", "missing"]),
      ageWarning: z.string().nullish(),
    }),
  ),
  rowCount: z.number(),
});
export type Application = z.infer<typeof applicationSchema>;
export type ApplicationFilters = z.infer<typeof applicationFiltersSchema>;
export type CompetitionMetadata = z.infer<typeof metadataSchema>;
export type ExportData = z.infer<typeof exportDataSchema>;
export type OnsiteRegistration = z.infer<typeof onsiteRegistrationSchema>;
export type RecountResult = z.infer<typeof recountResultSchema>;
export function applicationStatus(entry: Pick<Application, "approval">) {
  return entry.approval?.approvementResult === true
    ? "accepted"
    : entry.approval?.approvementResult === false
      ? "rejected"
      : "pending";
}
export const approvalLabels = {
  pending: "รอตรวจสอบ",
  accepted: "อนุมัติแล้ว",
  rejected: "ไม่อนุมัติ",
};
export const notificationLabels: Record<string, string> = {
  unknown: "ไม่มีประวัติการส่งที่ยืนยันได้",
  pending: "บันทึกผลแล้ว • ยังไม่ได้ส่ง LINE",
  sent: "LINE รับคำขอส่งแล้ว",
  failed: "ส่ง LINE ไม่สำเร็จ",
  uncertain: "ยังยืนยันผลส่ง LINE ไม่ได้",
  disabled: "ปิดการส่ง LINE อยู่",
  "not-applicable": "ไม่มีผู้รับ LINE สำหรับใบสมัครนี้",
  "review-required": "ต้องตรวจผลการส่งก่อนลองใหม่",
  sending: "กำลังส่ง LINE",
};
