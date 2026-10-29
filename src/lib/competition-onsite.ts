import { z } from "zod";
import type { Competition } from "./competitions";
import type { CompetitionMetadata } from "./competition-applications";
import { previewCompetitionAge } from "./competition-age-preview";
import {
  getEligibleCompetitionClasses,
  normalizeClassName,
  parseCompetitionClass,
} from "./competition-classes";

export const onsiteFormSchema = z.object({
  name: z.string().trim().min(1, "กรุณาระบุชื่อควาย").max(300),
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "กรุณาระบุวันเกิด"),
  microchip: z.string().trim().min(1, "กรุณาระบุไมโครชิพ").max(100),
  ownerName: z.string().trim().min(1, "กรุณาระบุชื่อเจ้าของ").max(300),
  ownerTel: z.string().trim().min(1, "กรุณาระบุเบอร์โทรศัพท์").max(50),
  type: z.string().min(1, "กรุณาเลือกรุ่นแข่งขัน"),
  level: z.enum(["national", "province"]),
  sex: z.enum(["male", "female"]),
  color: z.enum(["black", "albino", "white"]),
  farmName: z.string().trim().max(300),
  province: z.string().trim().max(300),
  fatherName: z.string().trim().max(300),
  motherName: z.string().trim().max(300),
  duplicateOverrideReason: z.string().trim().max(1000).optional(),
});
export type OnsiteForm = z.infer<typeof onsiteFormSchema>;
export function blankOnsiteForm(): OnsiteForm {
  return {
    name: "",
    birthday: "",
    microchip: "",
    ownerName: "",
    ownerTel: "",
    type: "",
    level: "national",
    sex: "male",
    color: "black",
    farmName: "",
    province: "",
    fatherName: "",
    motherName: "",
  };
}
export function onsiteAge(event: Competition, form: OnsiteForm) {
  return previewCompetitionAge(
    form.birthday,
    event.buffaloAgeDeadline,
    event.eventType === "royal" && form.color !== "black",
  );
}
export function onsiteClasses(event: Competition, form: OnsiteForm) {
  const age = onsiteAge(event, form);
  return age === null
    ? []
    : getEligibleCompetitionClasses(age, event.catalogs[form.level]);
}
export function onsiteCriteria(event: Competition, form: OnsiteForm) {
  return (
    event.catalogs[form.level]
      .map(parseCompetitionClass)
      .find(
        (rule) =>
          rule &&
          normalizeClassName(rule.name) === normalizeClassName(form.type),
      )?.criteria ?? ""
  );
}
/** Normal events skip only entries known to be at the other level; Royal and unknown levels still count. */
export function blockingDuplicateCount(
  event: Pick<Competition, "eventType">,
  level: OnsiteForm["level"],
  metadata: Pick<
    CompetitionMetadata,
    "duplicateCount" | "duplicateRegistrations"
  >,
) {
  if (event.eventType !== "normal") return metadata.duplicateCount;
  const unlisted = Math.max(
    0,
    metadata.duplicateCount - metadata.duplicateRegistrations.length,
  );
  return (
    unlisted +
    metadata.duplicateRegistrations.filter(
      (entry) => !entry.level || entry.level === level,
    ).length
  );
}
export function validateOnsite(
  event: Competition,
  form: OnsiteForm,
  duplicateCount: number,
) {
  const result = onsiteFormSchema.safeParse(form);
  if (!result.success)
    return result.error.issues[0]?.message ?? "กรุณาตรวจสอบข้อมูล";
  if (!event.policy.onsiteAllowed) return "งานนี้ไม่เปิดลงทะเบียนหน้างานแล้ว";
  if (onsiteAge(event, form) === null)
    return "วันเกิดต้องถูกต้องและไม่หลังวันตัดอายุ";
  if (!onsiteClasses(event, form).includes(form.type))
    return "กรุณาเลือกรุ่นที่ตรงกับอายุล่าสุด";
  if (
    duplicateCount > 0 &&
    (form.duplicateOverrideReason?.trim().length ?? 0) < 10
  )
    return "พบไมโครชิพซ้ำ กรุณาระบุเหตุผลอย่างน้อย 10 ตัวอักษร";
  return null;
}
