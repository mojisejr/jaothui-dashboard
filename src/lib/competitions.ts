import { z } from "zod";
import { validateCompetitionCatalog } from "./competition-classes";
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "วันที่ไม่ถูกต้อง");
const catalog = z.array(z.string().min(1).max(2000)).max(200);
export const competitionInputSchema = z
  .object({
    title: z.string().trim().min(1, "กรุณาระบุชื่องาน").max(300),
    description: z.string().max(20000).default(""),
    location: z.string().max(1000).default(""),
    startAt: day.optional(),
    endAt: day.optional(),
    registrationStartAt: day.optional(),
    registrationDeadline: day.optional(),
    buffaloAgeDeadline: day.optional(),
    eventType: z.enum(["normal", "royal"]).optional(),
    imageAssetId: z
      .string()
      .regex(/^image-[a-zA-Z0-9_-]+$/)
      .optional(),
    catalogs: z.object({ national: catalog, province: catalog }),
  })
  .strict()
  .superRefine((v, c) => {
    if (v.startAt && v.endAt && v.startAt > v.endAt)
      c.addIssue({
        code: "custom",
        path: ["endAt"],
        message: "วันจบงานต้องไม่ก่อนวันเริ่มงาน",
      });
    if (
      v.registrationStartAt &&
      v.registrationDeadline &&
      v.registrationStartAt > v.registrationDeadline
    )
      c.addIssue({
        code: "custom",
        path: ["registrationDeadline"],
        message: "วันปิดรับสมัครต้องไม่ก่อนวันเปิด",
      });
    if (v.registrationDeadline && v.endAt && v.registrationDeadline > v.endAt)
      c.addIssue({
        code: "custom",
        path: ["registrationDeadline"],
        message: "วันปิดรับสมัครต้องไม่หลังวันจบงาน",
      });
  });
// Updates preserve untouched legacy strings; source authority validates changed arrays.
export const competitionCreateInputSchema = competitionInputSchema.superRefine(
  (input, context) => {
    for (const level of ["national", "province"] as const) {
      for (const message of validateCompetitionCatalog(input.catalogs[level])) {
        context.addIssue({
          code: "custom",
          path: ["catalogs", level],
          message,
        });
      }
    }
  },
);
export const listSchema = z.object({
  search: z.string().max(300).default(""),
  startFrom: day.optional(),
  startTo: day.optional(),
  lifecycle: z
    .enum(["draft", "upcoming", "ongoing", "ended", "closed"])
    .optional(),
  registrationStatus: z
    .enum([
      "not-yet",
      "open",
      "closed-manual",
      "closed-date",
      "unavailable",
      "invalid",
    ])
    .optional(),
  eventType: z.enum(["normal", "royal"]).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});
export const mutationSchema = z.object({
  operationId: z.string().uuid(),
  expectedRevision: z.string().min(1),
});
export const reviewSchema = z.object({
  reportId: z.string().min(1),
  reviewReference: z.string().trim().min(10),
  reason: z.string().trim().min(10),
});
export const competitionSchema = z.object({
  _id: z.string(),
  _rev: z.string(),
  title: z.string(),
  description: z.string().default(""),
  location: z.string().default(""),
  startAt: z.string().optional(),
  endAt: z.string().optional(),
  registrationStartAt: z.string().optional(),
  registrationDeadline: z.string().optional(),
  buffaloAgeDeadline: z.string().optional(),
  eventType: z.enum(["normal", "royal"]).optional(),
  imageAssetId: z.string().optional(),
  imageUrl: z.string().optional(),
  competitionState: z.string().optional(),
  registrationActive: z.boolean().optional(),
  isActive: z.boolean().optional(),
  catalogs: z.object({
    national: z.array(z.string()),
    province: z.array(z.string()),
  }),
  registrationCount: z.number(),
  policy: z.object({
    today: z.string(),
    lifecycle: z.string(),
    publicRegistration: z.string(),
    publicVisible: z.boolean(),
    onsiteAllowed: z.boolean(),
    warnings: z.array(z.string()),
  }),
});
export const listResponseSchema = z.object({
  items: z.array(competitionSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
  counts: z.record(z.number()),
});
export const impactSchema = z.object({
  reportId: z.string(),
  eventRevision: z.string(),
  total: z.number(),
  affected: z.number(),
  rows: z.array(
    z.object({
      registrationId: z.string(),
      birthday: z.string().nullish(),
      storedAge: z.unknown().optional(),
      oldAge: z.number().nullish(),
      oldExactAge: z.object({ months: z.number(), days: z.number() }).nullish(),
      newExactAge: z.object({ months: z.number(), days: z.number() }).nullish(),
      oldPossibleClasses: z.array(z.string()).optional(),
      newPossibleClasses: z.array(z.string()).optional(),
      oldEligible: z.boolean().optional(),
      newEligible: z.boolean().optional(),
      newAge: z.number().nullish(),
      type: z.string().nullish(),
      level: z.string().nullish(),
      special: z.boolean().optional(),
      affected: z.boolean(),
      invalidAge: z.boolean().optional(),
    }),
  ),
});
export type Competition = z.infer<typeof competitionSchema>;
export type CompetitionInput = z.infer<typeof competitionInputSchema>;
export type CompetitionFilters = z.infer<typeof listSchema>;
export type Impact = z.infer<typeof impactSchema>;
export const lifecycleLabels: Record<string, string> = {
  draft: "ร่าง",
  upcoming: "ยังไม่เริ่มงาน",
  ongoing: "กำลังจัดงาน",
  ended: "จบตามกำหนด",
  closed: "ปิดงานด้วยมือ",
};
export const registrationLabels: Record<string, string> = {
  "not-yet": "ยังไม่ถึงวันเปิด",
  open: "เปิดรับสมัคร",
  "closed-manual": "ปิดรับด้วยมือ",
  "closed-date": "หมดเขตรับสมัคร",
  unavailable: "ไม่เปิดรับสมัคร",
  invalid: "ต้องตรวจข้อมูลวันที่",
};
export const blankInput = (): CompetitionInput => ({
  title: "",
  description: "",
  location: "",
  catalogs: { national: [], province: [] },
});
export function inputFromCompetition(v: Competition): CompetitionInput {
  return {
    title: v.title,
    description: v.description,
    location: v.location,
    startAt: v.startAt,
    endAt: v.endAt,
    registrationStartAt: v.registrationStartAt,
    registrationDeadline: v.registrationDeadline,
    buffaloAgeDeadline: v.buffaloAgeDeadline,
    eventType: v.eventType,
    imageAssetId: v.imageAssetId,
    catalogs: {
      national: [...v.catalogs.national],
      province: [...v.catalogs.province],
    },
  };
}
export function formatDay(v?: string) {
  if (!v) return "ยังไม่ระบุ";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const [y, m, d] = v.split("-");
  return `${d}/${m}/${Number(y) + 543}`;
}
