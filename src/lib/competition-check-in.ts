import { z } from "zod";

export const checkInStatusSchema = z.enum(["not_checked_in", "checked_in"]);
export const checkInCountsSchema = z.object({
  total: z.number().int().nonnegative(),
  not_checked_in: z.number().int().nonnegative(),
  checked_in: z.number().int().nonnegative(),
});
export const checkInFields = {
  checkInVersion: z.literal(1).optional(),
  checkInStatus: checkInStatusSchema.optional(),
  checkedInAt: z.string().nullish(),
  checkedInBy: z.literal("dashboard-shared").nullish(),
  checkInEligibility: z
    .object({ eligible: z.boolean(), reason: z.string().nullable() })
    .optional(),
  checkInHistory: z
    .array(
      z.object({
        action: z.enum(["confirm", "undo"]),
        at: z.string(),
        actor: z.literal("dashboard-shared"),
        reason: z.string().nullable(),
      }),
    )
    .optional(),
};
export const checkInInputSchema = z.object({
  operationId: z.string().uuid(),
  expectedRevision: z.string().min(1),
});
export const undoCheckInInputSchema = checkInInputSchema.extend({
  reason: z.string().trim().min(10).max(3000),
});
export const checkInTokenSchema = z
  .string()
  .min(20)
  .max(300)
  .regex(/^[A-Za-z0-9._-]+$/);
export const checkInResolutionSchema = z.object({
  checkInVersion: z.literal(1),
  eventId: z.string().min(1),
  registrationId: z.string().min(1),
});
const capabilitySchema = z.object({
  checkInVersion: z.literal(1),
  checkInStatus: checkInStatusSchema,
  checkedInAt: z.string().nullable(),
  checkedInBy: z.literal("dashboard-shared").nullable(),
  checkInEligibility: z.object({
    eligible: z.boolean(),
    reason: z.string().nullable(),
  }),
  checkInHistory: checkInFields.checkInHistory.unwrap(),
});
export const CHECK_IN_UPGRADE_MESSAGE =
  "ระบบต้นทางยังไม่รองรับการรายงานตัว กรุณาอัปเดตระบบต้นทางก่อนใช้งาน";
export function hasCheckInCapability(value: unknown) {
  return capabilitySchema.safeParse(value).success;
}
export function assertCheckInPayload(value: unknown, list = false) {
  if (list) {
    const result = z
      .object({
        checkInVersion: z.literal(1),
        checkInCounts: checkInCountsSchema,
        items: z.array(capabilitySchema),
      })
      .safeParse(value);
    if (!result.success) throw new Error(CHECK_IN_UPGRADE_MESSAGE);
  } else if (!hasCheckInCapability(value))
    throw new Error(CHECK_IN_UPGRADE_MESSAGE);
}
export const checkInLabels = {
  not_checked_in: "ยังไม่รายงานตัว",
  checked_in: "รายงานตัวแล้ว",
};
export function checkInTime(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("th-TH", {
        timeZone: "Asia/Bangkok",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date)
    : "ไม่พบเวลาที่บันทึก";
}
