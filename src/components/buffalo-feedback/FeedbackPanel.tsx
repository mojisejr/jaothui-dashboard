import { useState } from "react";
import { type Feedback } from "./feedback";
const stages = {
  authentication: "เข้าสู่ระบบ",
  validation: "ตรวจข้อมูล",
  lookup: "ค้นหารายการ",
  configuration: "ความพร้อมระบบ",
  database_read: "อ่านทะเบียน",
  database_write: "บันทึกทะเบียน",
  asset_upload: "รับไฟล์",
  chain_read: "ตรวจ blockchain",
  chain_transaction: "ธุรกรรม blockchain",
  identity: "ตรวจตัวตน",
  operation: "รายการเดิม",
  publication: "เผยแพร่ข้อมูล",
  request: "ติดต่อระบบ",
};
const outcomes = {
  not_started: "ขั้นตอนนี้ยังไม่เริ่มบันทึก",
  pending: "ยังดำเนินการไม่ครบ",
  completed: "บันทึกสำเร็จแล้ว",
  failed: "ขั้นตอนนี้ไม่สำเร็จ",
  unknown: "ยังยืนยันผลไม่ได้",
};
const actions = {
  retry_read: "โหลดข้อมูลอีกครั้ง",
  reauthenticate: "เข้าสู่ระบบอีกครั้ง แล้วเปิดรายการเดิม",
  refresh_client: "โหลดหน้าเว็บใหม่ก่อนทำรายการ",
  choose_file: "เลือกไฟล์ตามเงื่อนไขแล้วลองอีกครั้ง",
  correct_input: "ตรวจและแก้ข้อมูลที่ระบุ",
  refresh_record: "โหลดรายละเอียดล่าสุดก่อนดำเนินการ",
  resume_existing: "ดำเนินการต่อด้วยเลขรายการเดิม",
  contact_support:
    "แจ้งผู้ดูแลพร้อมรหัสอ้างอิง ห้ามเริ่มรายการใหม่เพื่อข้ามปัญหา",
};
export function FeedbackPanel({
  feedback,
  title,
  onRetry,
  retryLabel = "โหลดข้อมูลอีกครั้ง",
  busy = false,
}: {
  feedback: Feedback;
  title?: string;
  onRetry?: () => void;
  retryLabel?: string;
  busy?: boolean;
}) {
  const [copyState, setCopyState] = useState("");
  const reference = [
    feedback.requestId && `requestId: ${feedback.requestId}`,
    feedback.operationId && `operationId: ${feedback.operationId}`,
    `code: ${feedback.code}`,
  ]
    .filter(Boolean)
    .join("\n");
  return (
    <section
      role="alert"
      className="my-4 min-w-0 space-y-2 rounded-lg border border-warning p-4 text-base"
      data-buffalo-feedback
    >
      {title && <h2 className="font-semibold">{title}</h2>}
      <p>{feedback.reason}</p>
      <p className="text-sm">
        ขั้นตอน: {stages[feedback.stage]} · {outcomes[feedback.outcome]}
      </p>
      <p className="text-sm">สิ่งที่ทำต่อได้: {actions[feedback.nextAction]}</p>
      {feedback.fieldErrors && (
        <ul className="list-inside list-disc text-sm">
          {Object.keys(feedback.fieldErrors).map((field) => (
            <li key={field}>ตรวจข้อมูลช่อง {field}</li>
          ))}
        </ul>
      )}
      <p className="break-all text-sm">รหัส: {feedback.code}</p>
      {feedback.requestId ? (
        <p className="break-all text-sm">อ้างอิงคำขอ: {feedback.requestId}</p>
      ) : (
        <p className="text-sm">ยังไม่ได้รับรหัสอ้างอิงจากเซิร์ฟเวอร์</p>
      )}
      {feedback.operationId && (
        <p className="break-all text-sm">เลขรายการ: {feedback.operationId}</p>
      )}
      <div className="flex flex-wrap gap-2">
        {onRetry && (
          <button
            type="button"
            className="btn btn-outline min-h-12"
            disabled={busy}
            onClick={onRetry}
          >
            {retryLabel}
          </button>
        )}
        {(!!feedback.requestId || !!feedback.operationId) && (
          <button
            type="button"
            className="btn btn-outline min-h-12"
            onClick={() => {
              if (!navigator.clipboard) {
                setCopyState("คัดลอกไม่สำเร็จ กรุณาเลือกรหัสอ้างอิงด้านบน");
                return;
              }
              void navigator.clipboard.writeText(reference).then(
                () => setCopyState("คัดลอกรหัสอ้างอิงแล้ว"),
                () =>
                  setCopyState("คัดลอกไม่สำเร็จ กรุณาเลือกรหัสอ้างอิงด้านบน"),
              );
            }}
          >
            คัดลอกรหัสอ้างอิง
          </button>
        )}
      </div>
      {copyState && (
        <p role="status" className="text-sm">
          {copyState}
        </p>
      )}
    </section>
  );
}
