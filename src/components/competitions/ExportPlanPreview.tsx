import type { ExportPlan } from "~/lib/competition-export-layout";
import { Alert } from "./Workspace";
export function ExportDiagnostics({ plan }: { plan: ExportPlan }) {
  return plan.diagnostics.length ? (
    <div
      role="alert"
      className="space-y-3 rounded-xl border border-orange-300/30 bg-orange-400/10 p-4"
    >
      <p className="font-medium">กรุณาแก้รายการต่อไปนี้ก่อนดาวน์โหลด</p>
      <ul className="list-inside list-disc space-y-2 break-words">
        {plan.diagnostics.map((item, index) => (
          <li key={`${item.code}-${index}`}>
            {item.message}
            {item.value ? <span> — ค่าที่พบ: {item.value}</span> : null}
            {item.registrationIds?.length ? (
              <span> ({item.registrationIds.length} ใบสมัคร)</span>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="text-sm">
        แก้ชื่อ ลำดับ กลุ่มสี/เพศ หรือคำแปลด้านล่าง แล้วดูตัวอย่างอีกครั้ง
        ระบบจะไม่ข้ามใบสมัครที่ยังตรวจไม่ครบ
      </p>
    </div>
  ) : null;
}
export function ExportPlanPreview({
  plan,
  draft = false,
}: {
  plan: ExportPlan;
  draft?: boolean;
}) {
  return (
    <section
      className="min-w-0 space-y-4"
      aria-label={
        draft
          ? "ตัวอย่างจากร่างที่ยังไม่บันทึก"
          : "ลำดับชีตจากการตั้งค่าที่บันทึก"
      }
    >
      <h3 className="text-lg font-semibold">
        {draft
          ? "ตัวอย่างจากร่างที่ยังไม่บันทึก"
          : "ลำดับชีตจากการตั้งค่าที่บันทึก"}
      </h3>
      <ExportDiagnostics plan={plan} />
      {plan.state === "ready" ? (
        <Alert>
          {draft
            ? "ตรวจครบแล้ว บันทึกรูปแบบนี้ก่อนดาวน์โหลด"
            : "รูปแบบที่บันทึกพร้อมดาวน์โหลด ระบบจะตรวจข้อมูลล่าสุดอีกครั้งเมื่อดาวน์โหลด"}
        </Alert>
      ) : null}
      <div
        role="region"
        aria-label="ตารางลำดับชีต"
        tabIndex={0}
        className="min-w-0 overflow-x-auto rounded-xl border border-white/20"
      >
        <table className="w-full text-left text-base">
          <caption className="sr-only">
            ชื่อชีตจริงตามลำดับที่กำหนด แยกสีและเพศ พร้อมจำนวนใบสมัคร
          </caption>
          <thead className="bg-white/10">
            <tr>
              {[
                "ลำดับรุ่น",
                "ชื่อชีต",
                "ชื่อรุ่นเต็ม",
                "ระดับ",
                "สี",
                "เพศ",
                "ใบสมัคร",
              ].map((label) => (
                <th key={label} scope="col" className="px-4 py-3 font-medium">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {plan.groups.map((group) => (
              <tr key={group.key} className="border-t border-white/10">
                <td className="px-4 py-3 tabular-nums">{group.posterNumber}</td>
                <td className="break-words px-4 py-3">{group.sheetName}</td>
                <td className="min-w-48 break-words px-4 py-3">
                  {group.fullClassLabel}
                </td>
                <td className="px-4 py-3">{group.levelLabel}</td>
                <td className="px-4 py-3">{group.colorLabel}</td>
                <td className="px-4 py-3">{group.sexLabel}</td>
                <td className="px-4 py-3 tabular-nums">
                  {group.registrationIds.length}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!plan.groups.length ? (
        <p className="text-text-muted">
          ยังไม่มีชีตข้อมูลในตัวอย่าง รุ่นที่ไม่มีใบสมัครจะไม่สร้างชีตเปล่า
        </p>
      ) : null}
    </section>
  );
}
