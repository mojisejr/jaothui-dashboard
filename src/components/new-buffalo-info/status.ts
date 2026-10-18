const statuses: Record<string, string> = {
  DRAFT: "ร่างข้อมูล ยังไม่ Mint",
  READY: "ตรวจสอบแล้ว พร้อม Mint NFT",
  SIGNING: "กำลังบันทึกธุรกรรม",
  CHAIN_PENDING: "รอการยืนยันบนบล็อกเชน",
  BROADCAST_UNKNOWN: "กำลังตรวจสอบธุรกรรมเดิม",
  AWAITING_METADATA_ACTION: "Mint NFT ยืนยันแล้ว กรุณากด Mint Metadata",
  CHAIN_STEPS: "กำลังบันทึกข้อมูลบนบล็อกเชน",
  PROJECTING: "กำลังเผยแพร่ข้อมูลทะเบียน",
  VERIFYING: "กำลังตรวจสอบข้อมูลทุกส่วน",
  COMPLETED: "เสร็จสมบูรณ์",
  RECOVERY_REQUIRED: "ต้องดำเนินการต่อรายการเดิม",
  RETRYABLE: "ลองดำเนินการต่อรายการเดิม",
  NEEDS_REVIEW: "พบข้อมูลขัดแย้ง ต้องให้ผู้ดูแลตรวจสอบ",
  CANCELLED: "ยกเลิกร่างเดิมแล้ว",
};
export const createStatus = (state: string) =>
  statuses[state] ?? "กำลังตรวจสอบสถานะ";
export function createError(code: string) {
  if (code.includes("UNAUTHORIZED"))
    return "เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง รายการเดิมยังถูกบันทึกไว้";
  if (code.includes("INVALID_CALENDAR_DAY"))
    return "กรุณาระบุวันเกิดเป็นวันที่ที่ถูกต้อง";
  if (code.includes("STALE_"))
    return "ข้อมูลหน้านี้เก่าแล้ว กรุณาโหลดรายการเดิมก่อนดำเนินการต่อ";
  if (code.includes("MICROCHIP") || code.includes("COW_ALREADY"))
    return "ไมโครชิปนี้ถูกใช้งานแล้วหรือรูปแบบไม่ถูกต้อง กรุณาตรวจสอบเลข 15 หลัก";
  if (code.includes("IMAGE") || code.includes("ASSET"))
    return "รูปภาพไม่พร้อมหรือถูกผูกกับรายการแล้ว กรุณาใช้ JPEG/PNG น้อยกว่า 2 MB และย้อนกลับแก้ไขร่างหากเปลี่ยนรูป";
  if (
    code.includes("CONTINUE_EXISTING") ||
    code.includes("ACCOUNT_OPERATION_BUSY")
  )
    return "กรุณาดำเนินการรายการเดิมให้เสร็จก่อนเพิ่มควายตัวถัดไป";
  if (code.includes("ADAPTER") || code.includes("SERVICE_UNAVAILABLE"))
    return "ระบบติดต่อข้อมูลไม่สำเร็จ กรุณาดำเนินการต่อรายการเดิม ไม่ต้อง Mint ใหม่";
  if (code.includes("PARENT"))
    return "ข้อมูลพ่อแม่ไม่ตรงกับทะเบียน กรุณาตรวจสอบไมโครชิปพ่อแม่อีกครั้ง";
  if (code.includes("PERMISSION"))
    return "สิทธิ์บันทึกบล็อกเชนยังไม่พร้อม กรุณาแจ้งผู้ดูแล";
  if (code.includes("EXPLICIT_MINT"))
    return "กรุณากด Mint NFT และรอยืนยันก่อน Mint Metadata";
  if (code.includes("INITIALIZED") || code.includes("CONFLICT"))
    return "ข้อมูลรายการนี้ขัดแย้งกับข้อมูลที่บันทึกแล้ว กรุณาให้ผู้ดูแลตรวจสอบ";
  return "ไม่สามารถดำเนินการได้ กรุณาตรวจสอบข้อมูลและโหลดรายการเดิม หรือแจ้งผู้ดูแล";
}
export const stepLabel = (kind: string) =>
  ({
    mint: "Mint NFT",
    uri: "ยืนยันไฟล์ NFT",
    metadata: "Mint Metadata",
    parents: "บันทึกพ่อแม่",
  })[kind as "mint"] ?? "ตรวจสอบธุรกรรม";
export const stepStatus = (state: string) =>
  ({
    CONFIRMED: "ยืนยันแล้ว",
    PENDING: "รอยืนยัน",
    RESERVED: "เตรียมธุรกรรม",
    SIGNED: "บันทึกธุรกรรมแล้ว",
    UNKNOWN: "กำลังตรวจสอบผล",
    REVERTED: "ธุรกรรมไม่สำเร็จ",
    REVIEW: "รอผู้ดูแลตรวจสอบ",
  })[state as "CONFIRMED"] ?? "กำลังดำเนินการ";
