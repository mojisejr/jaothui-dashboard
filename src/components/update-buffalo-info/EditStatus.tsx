import { useEffect, useState } from "react";
import type { RouterOutputs } from "~/utils/api";
import type { Feedback } from "../buffalo-feedback/feedback";
import { IdentityDiagnosisLink } from "../buffalo-repair/IdentityDiagnosisLink";

type Job = RouterOutputs["buffaloEdit"]["view"];
type Props = {
  job: Job;
  busy: boolean;
  feedback?: Feedback | null;
  autoContinuing?: boolean;
  stalled?: boolean;
  onResume: () => void;
  onCancel?: () => void;
  onDone?: () => void;
  onRefresh?: () => void;
  onRetryRead?: () => void;
  onLogin?: () => void;
};
type Action =
  | "resume"
  | "cancel"
  | "done"
  | "refresh"
  | "read"
  | "login"
  | "support";
type Display = {
  title: string;
  message: string;
  phase: number;
  working?: boolean;
  action?: Action;
  button?: string;
};
const phases = ["ตรวจคำขอ", "ยืนยันบนบล็อกเชน", "เผยแพร่และตรวจทะเบียน"];
const labels: Record<string, string> = {
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
};
const steps: Record<string, string> = {
  batch: "แก้ข้อมูลควาย",
  setter: "แก้ช่องที่เลือก",
  parents: "แก้ข้อมูลพ่อแม่",
  dna_restore: "คืนข้อมูล DNA",
  uri: "ปรับลิงก์ไฟล์ทะเบียน",
};
const proofState: Record<string, string> = {
  RESERVED: "จองขั้นตอนแล้ว",
  SIGNED: "ลงนามแล้ว",
  PENDING: "รอยืนยัน",
  UNKNOWN: "ยังยืนยันผลไม่ได้",
  CONFIRMED: "ยืนยันแล้ว",
  REVERTED: "เชนปฏิเสธ",
  REVIEW: "รอตรวจสอบ",
};

function humanValue(field: string, value: unknown): string {
  if (value === null || value === undefined) return "ไม่มีข้อมูลยืนยัน";
  if (value === "" || value === "N/A") return "ไม่ได้ระบุ";
  if (field === "image" || field === "dna") {
    const last = String(value).split(/[?#]/)[0]?.split("/").pop();
    return last && /^[\w.\-]{1,64}$/.test(last)
      ? last
      : field === "dna"
        ? "มีหลักฐาน DNA"
        : "มีรูปควาย";
  }
  if (field === "sex")
    return { Male: "ผู้", Female: "เมีย" }[String(value)] ?? String(value);
  if (field === "color")
    return { Black: "ดำ", White: "เผือก" }[String(value)] ?? String(value);
  return String(value);
}

function diagnosis(
  job: Job,
  problem: Feedback | null | undefined,
  phase: number,
): Display {
  const code = problem?.code ?? job.reason;
  const reason = problem?.reason;
  const contact = (title: string, message: string): Display => ({
    title,
    message,
    phase,
    action: "support",
    button: "คัดลอกข้อมูลส่งผู้ดูแล",
  });
  const read = (title: string, message: string): Display => ({
    title,
    message,
    phase,
    action: "read",
    button: "โหลดสถานะรายการอีกครั้ง",
  });
  const correct = (title: string, message: string): Display =>
    job.canCancel
      ? {
          title,
          message,
          phase,
          action: "cancel",
          button: "กลับไปแก้ค่าที่กรอก",
        }
      : contact(title, message);
  const reverted = job.steps.find((s) => s.state === "REVERTED");
  if (reverted !== undefined || code === "TRANSACTION_REVERTED")
    return contact(
      reverted
        ? `เชนปฏิเสธขั้น “${steps[reverted.kind] ?? "บันทึกข้อมูล"}”`
        : "เชนปฏิเสธธุรกรรม",
      "ผู้ดูแลต้องตรวจผลของธุรกรรมเดิมก่อนดำเนินการต่อ",
    );
  if (code === "MICROCHIP_ALREADY_BOUND") {
    return correct(
      "เลขไมโครชิปที่ขอใช้มีรายการผูกอยู่",
      reason ??
        "ระบบพบว่าเลขนี้ยังมีรายการผูกอยู่ ตรวจเลขจากเครื่องอ่านชิปก่อนแก้ใหม่",
    );
  }
  if (code === "SELF_PARENT_FORBIDDEN" || code === "PARENT_NOT_FOUND")
    return correct(
      "ต้องแก้เลขไมโครชิปพ่อหรือแม่",
      code === "SELF_PARENT_FORBIDDEN"
        ? "เลขที่กรอกเป็นเลขของควายตัวที่กำลังแก้ ให้ใช้เลขของพ่อหรือแม่"
        : "ไม่พบพ่อหรือแม่ตามเลขที่ระบุ ตรวจเลขจากทะเบียนแล้วแก้ใหม่",
    );
  if (code === "MICROCHIP_HAS_CHILD_REFERENCES_REVIEW_REQUIRED")
    return contact(
      "ทะเบียนลูกยังอ้างเลขไมโครชิปนี้",
      "ผู้ดูแลต้องตรวจความสัมพันธ์พ่อแม่และลูกก่อนเปลี่ยนเลข",
    );
  if (code === "COW_ALREADY_RESERVED" || code === "CONTINUE_EXISTING_OPERATION")
    return read(
      "มีคำขอค้างสำหรับทะเบียนหรือชิปนี้",
      "โหลดรายการเดิมเพื่อตรวจว่าขั้นไหนเสร็จแล้วและยังทำอะไรต่อได้",
    );
  if (code === "STALE_EDIT_RECORD" || problem?.nextAction === "refresh_record")
    return correct(
      "ข้อมูลเปลี่ยนหลังเปิดคำขอ",
      reason ?? "ตรวจทะเบียนล่าสุดก่อนยืนยันค่าใหม่",
    );
  if (
    code === "FORBIDDEN" ||
    code === "MANAGER_ADMIN_PERMISSION_REQUIRED" ||
    code === "NFT_OWNER_PERMISSION_REQUIRED"
  )
    return contact(
      "สิทธิ์ไม่เพียงพอสำหรับขั้นตอนนี้",
      "แจ้งผู้ดูแลเพื่อตรวจสิทธิ์ของบัญชีหรือกระเป๋าที่ใช้บันทึกรายการนี้",
    );
  if (problem?.nextAction === "reauthenticate" || code === "UNAUTHORIZED")
    return {
      title: "กรุณาเข้าสู่ระบบอีกครั้ง",
      message: "กลับมาเปิดรายการเดิมหลังเข้าสู่ระบบ เพื่ออ่านสถานะล่าสุด",
      action: "login",
      button: "เข้าสู่ระบบอีกครั้ง",
      phase,
    };
  if (
    problem?.nextAction === "choose_file" ||
    problem?.nextAction === "correct_input"
  )
    return correct(
      "ต้องแก้ข้อมูลก่อนบันทึก",
      reason ?? "ตรวจค่าของช่องที่เลือกแล้วแก้ใหม่",
    );
  if (problem?.stage === "identity")
    return contact(
      "ยืนยันตัวตนของทะเบียนไม่ได้",
      reason ?? "ผู้ดูแลต้องตรวจว่าไมโครชิปและ NFT ผูกกับควายตัวเดียวกัน",
    );
  if (
    problem?.stage === "publication" ||
    code === "PUBLICATION_PROOF_MISMATCH" ||
    code === "DATABASE_PROJECTION_CONFLICT"
  )
    return contact(
      "ผลที่เผยแพร่ยังไม่ตรงกับคำขอ",
      reason ?? "ผู้ดูแลต้องตรวจไฟล์และทะเบียนก่อนยืนยันว่าบันทึกครบ",
    );
  if (
    problem?.nextAction === "retry_read" ||
    code === "CLIENT_RESPONSE_UNAVAILABLE"
  )
    return read(
      "ยังโหลดสถานะล่าสุดไม่ได้",
      "ตรวจรายการเดิมอีกครั้งเพื่อดูว่าระบบบันทึกถึงขั้นไหนแล้ว",
    );
  if (problem?.stage === "configuration")
    return contact(
      "ระบบบันทึกยังไม่พร้อม",
      reason ?? "ผู้ดูแลต้องตรวจการตั้งค่าก่อนทำรายการต่อ",
    );
  if (
    (!code &&
      (job.state === "RETRYABLE" || job.state === "RECOVERY_REQUIRED")) ||
    (problem?.nextAction === "resume_existing" &&
      job.canResume &&
      job.state !== "NEEDS_REVIEW")
  )
    return {
      title: "รายการหยุดรอดำเนินการต่อ",
      message: reason ?? "ทำต่อจากขั้นที่บันทึกไว้ในรายการเดิม",
      phase,
      action: "resume",
      button: "ดำเนินการต่อรายการเดิม",
    };
  return contact(
    "รายการหยุดรอตรวจสอบ",
    reason ??
      "ยังระบุสาเหตุไม่ได้ ผู้ดูแลต้องตรวจหลักฐานของรายการนี้ก่อนดำเนินการต่อ",
  );
}

function describe({
  job,
  busy,
  feedback,
  stalled,
  autoContinuing,
}: Props): Display {
  const p = job.progress;
  const allConfirmed =
    job.steps.some((s) => s.kind === "uri") &&
    job.steps.every((s) => s.state === "CONFIRMED");
  const phase =
    p?.currentPhase ?? (allConfirmed ? 2 : job.steps.length ? 1 : 0);
  const last = job.steps.filter((s) => s.state === "CONFIRMED").at(-1);
  const lastProof = last
    ? `ยืนยันขั้น “${steps[last.kind] ?? "บันทึกข้อมูล"}” แล้ว`
    : "ยังไม่มีขั้นที่ยืนยันบนบล็อกเชน";
  if (job.state === "COMPLETED")
    return {
      title: `แก้ไข${job.fields.map((f) => labels[f] ?? f).join("และ")}สำเร็จ`,
      message:
        feedback?.code === "COMPLETED_REFRESH_FAILED"
          ? feedback.reason
          : "ทะเบียนและไฟล์แสดงค่าที่ตรวจสอบแล้ว",
      phase: 3,
      action:
        feedback?.code === "COMPLETED_REFRESH_FAILED" ? "refresh" : "done",
      button:
        feedback?.code === "COMPLETED_REFRESH_FAILED"
          ? "โหลดรายละเอียดอีกครั้ง"
          : "แก้ไขข้อมูลอื่น",
    };
  if (job.state === "CANCELLED")
    return {
      title: "ยกเลิกคำขอแล้ว",
      message: "เลือกข้อมูลที่ต้องการแก้ไขใหม่ได้",
      phase: 0,
      action: "done",
      button: "แก้ไขข้อมูลอื่น",
    };
  if (
    feedback &&
    feedback.code !== "PUBLIC_ASSET_READBACK_PENDING" &&
    feedback.code !== "BROADCAST_RESULT_UNKNOWN"
  )
    return diagnosis(job, feedback, phase);
  if (stalled)
    return {
      title: "ยังยืนยันความคืบหน้าล่าสุดไม่ได้",
      message: `${lastProof} ตรวจสถานะรายการเดิมอีกครั้ง`,
      phase,
      action: "read",
      button: "โหลดสถานะรายการอีกครั้ง",
    };
  const unknown =
    job.state === "BROADCAST_UNKNOWN" ||
    (job.state === "CHAIN_PENDING" && !!p?.unknownRetry);
  const files =
    job.state === "RECOVERY_REQUIRED" &&
    job.reason === "PUBLIC_ASSET_READBACK_PENDING" &&
    allConfirmed;
  if (unknown || files) {
    const retry = files ? p?.fileRetry : p?.unknownRetry;
    const evidence = p?.readback;
    const asset =
      evidence?.asset === "image"
        ? "รูปควาย"
        : evidence?.asset === "metadata"
          ? "ไฟล์ข้อมูลทะเบียน"
          : "ไฟล์";
    const location =
      evidence?.source === "origin" ? "ที่เก็บต้นฉบับ" : "หน้าสาธารณะ";
    const fileIssue = evidence
      ? evidence.problem === "unavailable"
        ? `ยังอ่าน${asset}จาก${location}ไม่ได้`
        : `${asset}ที่อ่านจาก${location}ยังไม่ตรงกับข้อมูลใหม่`
      : "ยังยืนยันไม่ได้ว่าไฟล์ที่เผยแพร่ตรงกับข้อมูลใหม่";
    if (retry?.exhausted)
      return {
        phase: files ? 2 : 1,
        title: files
          ? "เชนยืนยันแล้ว แต่ยังยืนยันไฟล์เผยแพร่ไม่ได้"
          : "ยังยืนยันผลการส่งธุรกรรมไม่ได้",
        message: files
          ? fileIssue + " ระบบหยุดตรวจซ้ำแล้ว ให้ผู้ดูแลเทียบไฟล์กับข้อมูลใหม่"
          : "พ้นช่วงตรวจอัตโนมัติแล้ว " +
            lastProof +
            " ให้ผู้ดูแลตรวจหลักฐานก่อนทำต่อ",
        action: "support",
        button: "คัดลอกข้อมูลส่งผู้ดูแล",
      };
    return {
      title: files
        ? "บล็อกเชนยืนยันแล้ว กำลังตรวจไฟล์และทะเบียน"
        : "กำลังตรวจผลธุรกรรมเดิม",
      message: files
        ? fileIssue + " เปิดหน้านี้ไว้เพื่อตรวจซ้ำอัตโนมัติ"
        : lastProof + " เปิดหน้านี้ไว้เพื่อตรวจผลจากเชน",
      phase: files ? 2 : 1,
      working: true,
    };
  }
  if (
    job.state === "NEEDS_REVIEW" ||
    job.state === "RETRYABLE" ||
    job.state === "RECOVERY_REQUIRED" ||
    (job.state === "DRAFT" && job.reason)
  )
    return diagnosis(job, job.diagnostic, phase);
  switch (job.state) {
    case "DRAFT":
      return busy || autoContinuing
        ? {
            title: "กำลังตรวจคำขอแก้ไข",
            message: "ระบบกำลังตรวจข้อมูลที่ขอเปลี่ยน",
            phase: 0,
            working: true,
          }
        : {
            title: "มีคำขอแก้ไขเดิมค้างอยู่",
            message: "ยังไม่ได้ส่งธุรกรรม ทำรายการเดิมต่อได้",
            phase: 0,
            action: "resume",
            button: "ดำเนินการต่อรายการเดิม",
          };
    case "READY":
      return {
        title:
          job.reason === "WALLET_QUEUE_BUSY"
            ? "กำลังรอคิวลงนาม"
            : "ตรวจคำขอแล้ว พร้อมบันทึกบนเชน",
        message: "เปิดหน้านี้ไว้ ระบบจะทำขั้นถัดไปอัตโนมัติ",
        phase: 1,
        working: true,
      };
    case "SIGNING":
      return {
        title: "กำลังลงนามธุรกรรม",
        message: "ระบบกำลังเตรียมส่งข้อมูลไปบล็อกเชน",
        phase: 1,
        working: true,
      };
    case "CHAIN_PENDING":
      return {
        title: "กำลังรอบล็อกเชนยืนยัน",
        message: "เมื่อยืนยันแล้ว ระบบจะตรวจขั้นถัดไปให้อัตโนมัติ",
        phase: 1,
        working: true,
      };
    case "CHAIN_STEPS":
      return allConfirmed
        ? {
            title: "บล็อกเชนยืนยันแล้ว กำลังตรวจไฟล์และทะเบียน",
            message: "ระบบจะเผยแพร่ข้อมูลแล้วอ่านกลับมาตรวจอีกครั้ง",
            phase: 2,
            working: true,
          }
        : {
            title: "กำลังตรวจขั้นตอนบนบล็อกเชน",
            message: lastProof + " ระบบจะตรวจขั้นถัดไป",
            phase: 1,
            working: true,
          };
    case "PROJECTING":
      return {
        title: "กำลังเผยแพร่ไฟล์และปรับทะเบียน",
        message: "บล็อกเชนยืนยันแล้ว ระบบกำลังนำค่าใหม่ไปเผยแพร่",
        phase: 2,
        working: true,
      };
    case "VERIFYING":
      return {
        title: "กำลังตรวจข้อมูลที่เผยแพร่",
        message: "ระบบกำลังเทียบไฟล์และทะเบียนกับค่าที่ขอแก้",
        phase: 2,
        working: true,
      };
    default:
      return diagnosis(job, job.diagnostic, phase);
  }
}

function duration(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return seconds < 60
    ? `${seconds} วิ.`
    : `${Math.floor(seconds / 60)} นาที ${seconds % 60} วิ.`;
}
function localTime(iso: string) {
  return new Date(iso).toLocaleTimeString("th-TH", {
    timeZone: "Asia/Bangkok",
    hour12: false,
  });
}
export function EditProof(props: Props) {
  const {
    job,
    busy,
    onResume,
    onCancel,
    onDone,
    onRefresh,
    onRetryRead,
    onLogin,
  } = props;
  const p = job.progress;
  const display = describe(props);
  const complete = job.state === "COMPLETED";
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState<"" | "copied" | "manual">("");
  const working = !!display.working;
  const diagnostic = props.feedback ?? job.diagnostic;
  const code = diagnostic?.code ?? job.reason;
  const showCancel =
    job.canCancel &&
    onCancel &&
    !working &&
    display.action === "resume" &&
    !["CANCELLED", "COMPLETED"].includes(job.state);
  useEffect(() => {
    setCopied("");
  }, [job.id, code]);
  useEffect(() => {
    if (!working) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [working]);
  const report = () =>
    [
      `เวลา: ${new Date().toISOString()}`,
      "หน้า: แก้ไขควาย",
      `operationId: ${job.id}`,
      `NFT: #${job.actualToken}`,
      `state: ${job.state}`,
      `version: ${job.version}`,
      `phase: ${Math.min(display.phase + 1, 3)}/3`,
      `lastConfirmed: ${job.steps.filter((step) => step.state === "CONFIRMED").at(-1)?.kind ?? "none"}`,
      `outcome: ${job.steps.some((step) => step.state === "REVERTED") ? "failed" : (diagnostic?.outcome ?? "unknown")}`,
      code && `code: ${code}`,
      diagnostic?.requestId && `requestId: ${diagnostic.requestId}`,
      diagnostic?.stage && `stage: ${diagnostic.stage}`,
      `ช่องที่แก้ไข: ${job.fields.join(", ")}`,
      ...job.steps.map(
        (s) => `${s.kind}: ${s.state}${s.hash ? " " + s.hash : ""}`,
      ),
      p?.readback &&
        `readback: ${p.readback.asset} ${p.readback.problem} ${p.readback.source}`,
      p?.fileRetry && `ตรวจไฟล์: ${p.fileRetry.attempts} รอบ`,
      p?.unknownRetry && `ตรวจธุรกรรม: ${p.unknownRetry.attempts} รอบ`,
    ]
      .filter(Boolean)
      .join("\n");
  async function copyReport() {
    try {
      await navigator.clipboard.writeText(report());
      setCopied("copied");
    } catch {
      setCopied("manual");
    }
  }
  const actions = {
    resume: onResume,
    cancel: onCancel,
    done: onDone,
    refresh: onRefresh,
    read: onRetryRead,
    login: onLogin,
    support: copyReport,
  };
  const primary = display.action && actions[display.action];
  const times = phases.map((_, i) => {
    const elapsed = p?.phases[i];
    if (elapsed === null || elapsed === undefined) return null;
    const delta =
      working && p?.currentPhase === i && p.checkedAt
        ? Math.max(0, now - Date.parse(p.checkedAt))
        : 0;
    return elapsed + delta;
  });
  const hasTime = times.some((t) => t !== null);
  const nextCheck = p?.fileRetry?.nextAt ?? p?.unknownRetry?.nextAt;

  const statusText = complete
    ? "เสร็จแล้ว"
    : working
      ? "กำลังทำงาน"
      : display.action === "support"
        ? "ต้องให้ผู้ดูแลตรวจ"
        : job.state === "CANCELLED"
          ? "ปิดรายการ"
          : "รอให้คุณดำเนินการ";
  const statusColor = complete
    ? "text-success"
    : working
      ? "text-primary"
      : "text-warning";
  const timeline = (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">ความคืบหน้า</h3>
        {hasTime && (
          <span className="text-sm tabular-nums">
            เวลาทำงานที่วัดได้{" "}
            {duration(times.reduce<number>((a, b) => a + (b ?? 0), 0))}
          </span>
        )}
      </div>
      <div aria-hidden="true" className="grid grid-cols-3 gap-1">
        {phases.map((name, i) => (
          <span
            key={name}
            className={`h-1 rounded-full ${i < display.phase || complete ? "bg-success" : i === display.phase ? "bg-primary" : "bg-base-content/25"}`}
          />
        ))}
      </div>
      <ol className="grid gap-2 sm:grid-cols-3">
        {phases.map((title, i) => {
          const passed = complete || i < display.phase;
          const current = !complete && i === display.phase;
          const text = passed
            ? "ผ่านแล้ว"
            : current
              ? working
                ? "กำลังดำเนินการ"
                : job.state === "CANCELLED"
                  ? "ยกเลิกแล้ว"
                  : "หยุดรอ"
              : "รอดำเนินการ";
          return (
            <li
              key={title}
              aria-current={current ? "step" : undefined}
              className="flex min-w-0 items-start gap-2"
            >
              <span
                aria-hidden="true"
                className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-sm ${passed ? "border-success text-success" : current ? "border-primary bg-primary text-black" : "border-base-content/40"}`}
              >
                {passed ? "✓" : i + 1}
              </span>
              <div>
                <span>{title}</span>
                <p className="text-sm text-base-content/75">
                  {text}
                  {times[i] != null && (
                    <span className="tabular-nums">
                      {" "}
                      · {duration(times[i])}
                    </span>
                  )}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      {p?.checkedAt && (
        <p className="text-sm text-base-content/70">
          ตรวจสถานะล่าสุด {localTime(p.checkedAt)} น.
          {p.lastProgressAt && (
            <> · คืบหน้าล่าสุด {localTime(p.lastProgressAt)} น.</>
          )}
        </p>
      )}
    </div>
  );
  const ctaClass = "btn btn-primary min-h-12 whitespace-normal";
  return (
    <section
      data-edit-operation={job.id}
      aria-label="สถานะการแก้ไขข้อมูลควาย"
      className="my-4 min-w-0 space-y-4 rounded-lg border border-base-content/25 bg-base-100 p-4 text-base sm:p-6"
    >
      <header className="space-y-1">
        <p className="text-sm text-base-content/75">
          รายการแก้ไข · {p?.name ?? "ทะเบียนควาย"} #{job.actualToken}
        </p>
        <div role="status" aria-atomic="true">
          <p className={`flex items-center gap-2 font-medium ${statusColor}`}>
            {working && (
              <span
                aria-hidden="true"
                className="inline-block h-4 w-4 rounded-full border-2 border-primary border-r-transparent motion-safe:animate-spin"
              />
            )}
            {complete && <span aria-hidden="true">✓</span>}
            {statusText}
          </p>
          <h2 className="break-words text-xl font-semibold">{display.title}</h2>
        </div>
        <p>{display.message}</p>
        {working && nextCheck && (
          <p className="text-sm text-base-content/75">
            กำหนดตรวจครั้งถัดไป {localTime(nextCheck)} น.
          </p>
        )}
        {job.state === "DRAFT" && p?.createdAt && (
          <p className="text-sm text-base-content/75">
            เก็บคำขอเมื่อ{" "}
            {new Date(p.createdAt).toLocaleString("th-TH", {
              timeZone: "Asia/Bangkok",
            })}
          </p>
        )}

        {job.restorationPending && !complete && (
          <p className="text-sm">
            กำลังกู้คืน DNA เดิมหลังแก้ไข ข้อมูลสาธารณะยังเป็นฉบับก่อนหน้า
          </p>
        )}
      </header>
      <div className="space-y-3 border-y border-base-content/20 py-3">
        {job.fields.map((f) => {
          const before =
            p?.before[f] ?? (f === "microchip" ? job.microchip : undefined);
          const after = Object.hasOwn(job.patch, f)
            ? job.patch[f as keyof typeof job.patch]
            : undefined;
          return (
            <div key={f}>
              <h3 className="font-medium text-primary">{labels[f] ?? f}</h3>
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4">
                <dt className="text-sm text-base-content/75">จาก</dt>
                <dd className="break-words [overflow-wrap:anywhere]">
                  {humanValue(f, before)}
                </dd>
                <dt className="text-sm text-base-content/75">
                  {complete ? "ยืนยันแล้ว" : "ขอเปลี่ยนเป็น"}
                </dt>
                <dd className="break-words font-medium [overflow-wrap:anywhere]">
                  {humanValue(f, after)}
                </dd>
              </dl>
            </div>
          );
        })}
      </div>
      {complete ? (
        <details>
          <summary className="min-h-12 cursor-pointer py-3">
            ตรวจครบทั้ง 3 ขั้น · ดูเวลาแต่ละขั้น
          </summary>
          {timeline}
        </details>
      ) : (
        timeline
      )}
      {((!!primary && !!display.button) || !!showCancel) && (
        <div className="flex flex-wrap gap-2">
          {primary && display.button && (
            <button
              type="button"
              className={ctaClass}
              disabled={
                display.action !== "support" &&
                display.action !== "login" &&
                busy
              }
              onClick={() => void primary()}
            >
              {display.button}
            </button>
          )}
          {showCancel && (
            <button
              type="button"
              className="btn btn-outline min-h-12 whitespace-normal"
              disabled={busy}
              onClick={onCancel}
            >
              ยกเลิกรายการเดิม แล้วแก้ใหม่
            </button>
          )}
        </div>
      )}
      {copied === "copied" && (
        <p role="status">คัดลอกแล้ว นำไปวางในแชตทีมผู้ดูแล</p>
      )}
      {copied === "manual" && (
        <label className="block text-sm">
          คัดลอกอัตโนมัติไม่ได้ เลือกข้อความแล้วนำไปวางในแชตทีมผู้ดูแล
          <textarea
            aria-label="ข้อมูลส่งผู้ดูแล"
            className="textarea textarea-bordered mt-1 block w-full"
            readOnly
            onFocus={(e) => e.target.select()}
            value={report()}
          />
        </label>
      )}
      {display.action === "support" && (
        <IdentityDiagnosisLink
          microchip={job.microchip}
          code={code ?? undefined}
        />
      )}
      {(job.steps.length > 0 || !!code) && (
        <details className="text-sm text-base-content/75">
          <summary className="min-h-12 cursor-pointer py-3">
            รายละเอียดรายการและหลักฐาน
          </summary>
          <div className="space-y-1 break-words [overflow-wrap:anywhere]">
            <p>รายการ {job.id}</p>
            {code && <p>รหัส {code}</p>}
            {job.environment === "local-fork" && <p>หลักฐานจาก local/fork</p>}
            {job.steps.map((s, i) => (
              <p key={i}>
                {steps[s.kind] ?? s.kind} · {proofState[s.state] ?? s.state}{" "}
                {s.hash &&
                  (s.explorerUrl ? (
                    <a
                      className="link"
                      href={s.explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {s.hash}
                    </a>
                  ) : (
                    s.hash
                  ))}
              </p>
            ))}
            {Array.isArray(job.legacyDifferences) &&
              job.legacyDifferences.length > 0 && (
                <p>
                  มีความต่างเดิมในช่องอื่น การยืนยันนี้ครอบคลุมเฉพาะช่องที่แก้ไข
                </p>
              )}
          </div>
        </details>
      )}
    </section>
  );
}
