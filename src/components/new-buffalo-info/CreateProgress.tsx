import { useState } from "react";
import type { RouterOutputs } from "~/utils/api";
import type { Feedback } from "../buffalo-feedback/feedback";
import { createStatus, stepLabel } from "./status";

type Job = RouterOutputs["buffaloCreate"]["view"];
type Action = "mint" | "metadata" | "resume";
type Props = {
  job?: Job;
  id: string;
  form: { name: string; microchip: string };
  problems: (Feedback | null | undefined)[];
  editing: boolean;
  busy: boolean;
  loading: boolean;
  authLost: boolean;
  readFailed: boolean;
  action: (action: Action) => Promise<void>;
  fresh: () => void;
};

function guidance(p: Props): [string, Action?] {
  const { job } = p;
  if (p.authLost)
    return ["เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้งเพื่อเปิดรายการเดิม"];
  if (p.readFailed)
    return ["โหลดข้อมูลล่าสุดไม่สำเร็จ กรุณากดโหลดอีกครั้งด้านล่าง"];
  if (p.busy) return ["ระบบกำลังดำเนินการ กรุณารอผลของรายการนี้"];
  if (p.loading) return ["กำลังโหลดรายการที่บันทึกไว้"];
  if (!job || p.editing)
    return ["กรอกข้อมูลแล้วกดบันทึกร่าง · ข้อมูลที่กำลังกรอกยังไม่ได้บันทึก"];
  switch (job.state) {
    case "DRAFT":
      return [
        job.imageReady
          ? "ตรวจทานข้อมูลแล้วกดยืนยันเพื่อเตรียมสร้าง NFT"
          : "ร่างบันทึกแล้ว กรุณาเลือกรูปควาย",
      ];
    case "READY":
      return job.steps.some((s) => s.kind === "mint")
        ? ["กำลังตรวจสถานะธุรกรรมเดิม"]
        : ["ตรวจข้อมูลแล้ว กรุณากดสร้าง NFT", "mint"];
    case "AWAITING_METADATA_ACTION":
      return ["สร้าง NFT แล้ว กรุณากดบันทึกข้อมูลทะเบียน", "metadata"];
    case "NEEDS_REVIEW":
      return ["รายการหยุดรอผู้ดูแล กรุณาคัดลอกรายงานส่งให้ทีม"];
    case "BROADCAST_UNKNOWN":
      return ["กำลังตรวจผลธุรกรรมเดิม หากต้องกลับมาทำต่อให้ใช้รายการนี้", "resume"];
    case "RECOVERY_REQUIRED":
    case "RETRYABLE":
      return [
        job.reason === "PUBLIC_ASSET_READBACK_PENDING"
          ? "ยังตรวจไฟล์ที่เผยแพร่ไม่สำเร็จ กรุณาดำเนินการต่อรายการเดิม"
          : "กรุณากดดำเนินการต่อจากขั้นที่บันทึกไว้",
        "resume",
      ];
    case "COMPLETED":
      return ["เพิ่มควายเสร็จสมบูรณ์ ตรวจทะเบียน บล็อกเชน และไฟล์แล้ว"];
    case "CANCELLED":
      return ["ยกเลิกรายการแล้ว"];
    default:
      return [createStatus(job.state) + " · ระบบกำลังตรวจรายการเดิม กรุณารอ"];
  }
}

export function CreateProgress(p: Props) {
  const { job } = p;
  const [copy, setCopy] = useState("");
  const [manual, setManual] = useState("");
  const [message, next] = guidance(p);
  const identity = job?.input ?? p.form;
  const confirmed = job?.steps.filter((s) => s.state === "CONFIRMED") ?? [];
  const problems = p.problems.filter((item): item is Feedback => !!item);
  async function copyReport() {
    const report = [
      "หน้า: เพิ่มควาย",
      "เวลาคัดลอก: " + new Date().toISOString(),
      "ชื่อ: " + (identity.name || "—"),
      "ไมโครชิป: " + (identity.microchip || "—"),
      "operationId: " + (job?.id ?? (p.id || "ยังไม่ได้รับเลขรายการ")),
      "state: " + (job?.state ?? "ยังไม่มีสถานะที่ยืนยันได้"),
      message,
      job && "Revision: " + job.version,
      job?.updatedAt && "อัปเดตรายการ: " + job.updatedAt,
      job?.actualToken && "Token #" + job.actualToken,
      job?.reason && "reason: " + job.reason,
      ...problems.map((f) =>
        [
          f.code,
          f.stage,
          f.outcome,
          f.reason,
          f.requestId && "requestId: " + f.requestId,
          f.operationId && "operationId: " + f.operationId,
        ]
          .filter(Boolean)
          .join(" · "),
      ),
      ...(job?.steps ?? []).map((s) =>
        [s.kind, s.state, s.hash].filter(Boolean).join(" · "),
      ),
    ]
      .filter(Boolean)
      .join("\n");
    try {
      await navigator.clipboard.writeText(report);
      setManual("");
      setCopy("คัดลอกรายงานแล้ว ส่งให้ผู้ดูแลได้เลย");
    } catch {
      setManual(report);
      setCopy("เลือกข้อความรายงานด้านล่างเพื่อคัดลอก");
    }
  }
  return (
    <section
      aria-label="ความคืบหน้าการเพิ่มควาย"
      className="my-4 space-y-3 rounded-xl border border-primary p-4"
    >
      {job && (
        <p>
          {identity.name} · {identity.microchip}
          {job.actualToken && <strong> · Token #{job.actualToken}</strong>}
        </p>
      )}
      <p aria-live="polite" className="font-semibold">
        {message}
      </p>
      {job && (
        <p className="text-sm">
          {p.readFailed ? "สถานะล่าสุดที่ทราบ" : "บันทึกแล้ว"} · ร่างข้อมูล
          {job.imageReady && " · รูปควาย"}
          {confirmed
            .map((s) => " · " + stepLabel(s.kind) + " ยืนยันแล้ว")
            .join("")}
        </p>
      )}
      {job?.updatedAt && (
        <p className="text-sm">
          อัปเดตรายการล่าสุด{" "}
          {new Date(job.updatedAt).toLocaleString("th-TH", {
            timeZone: "Asia/Bangkok",
          })}{" "}
          น.
        </p>
      )}
      {next && (
        <button
          data-mint-nft={next === "mint" || undefined}
          data-mint-metadata={next === "metadata" || undefined}
          className="btn btn-primary"
          onClick={() => void p.action(next)}
        >
          {next === "mint"
            ? "สร้าง NFT (Mint NFT)"
            : next === "metadata"
              ? "บันทึกข้อมูลทะเบียน (Mint Metadata)"
              : "ดำเนินการต่อรายการเดิม"}
        </button>
      )}
      {job?.state === "COMPLETED" &&
        !p.readFailed &&
        !p.authLost &&
        !p.busy && (
          <button className="btn btn-primary" onClick={p.fresh}>
            เพิ่มควายตัวถัดไป
          </button>
        )}
      {(!!job || problems.length > 0) && (
        <div>
          <button className="btn btn-outline" onClick={() => void copyReport()}>
            คัดลอกรายงานให้ผู้ดูแล
          </button>
        </div>
      )}
      {copy && <p role="status">{copy}</p>}
      {manual && (
        <textarea
          aria-label="รายงานสำหรับผู้ดูแล"
          className="textarea w-full"
          readOnly
          value={manual}
          onFocus={(e) => e.target.select()}
        />
      )}
    </section>
  );
}
