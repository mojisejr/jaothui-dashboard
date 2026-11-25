import { parseLegacyReconstruction } from "~/lib/legacy-reconstruction";

const labels = {
  name: "ชื่อ",
  microchip: "ไมโครชิป",
  certNo: "เลขใบรับรอง",
  origin: "แหล่งกำเนิด",
  color: "สี",
  sex: "เพศ",
  birthday: "วันเกิด",
  height: "ความสูง",
  detail: "รายละเอียด",
  rarity: "ระดับความหายาก",
  dna: "หลักฐาน DNA",
  image: "รูปควาย",
  fatherId: "ไมโครชิปพ่อ",
  motherId: "ไมโครชิปแม่",
  issuedOn: "วันออกใบรับรอง",
};
const reasons = {
  business_mismatch: "ข้อมูลทะเบียนกับบนเชนไม่ตรงกัน",
  invalid_legacy_field: "ข้อมูลเดิมยังไม่รองรับการสร้างไฟล์ใหม่",
  normalization_change: "การสร้างไฟล์ใหม่จะเปลี่ยนค่าข้อมูลเดิม",
};
/** Generate operator text only from validated categories, never raw provider values. */
export function legacyReconstructionLines(
  code: string | undefined,
  value: unknown,
): string[] {
  if (code !== "LEGACY_METADATA_RECONSTRUCTION_CONFLICT") return [];
  const detail = parseLegacyReconstruction(value);
  return (
    detail?.issues.map(
      ({ field, kind }) => `${labels[field]}: ${reasons[kind]}`,
    ) ?? []
  );
}
