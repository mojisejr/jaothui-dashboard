import Link from "next/link";
import { useEffect, useState } from "react";
import type { RouterOutputs } from "~/utils/api";
import type { Feedback } from "../buffalo-feedback/feedback";
import { createStatus, stepLabel, stepStatus } from "./status";

type Job = RouterOutputs["buffaloCreate"]["view"];
type Action = "mint" | "metadata" | "resume";
type Props = {
  job: Job;
  problems: (Feedback | null | undefined)[];
  busy: boolean;
  authLost: boolean;
  readError: Feedback | null;
  retryRead: () => void;
  retryLabel: string;
  autoContinuing: boolean;
  automationStopped: boolean;
  automaticMode?: "autoPublication" | "autoReconcile";
  action: (action: Action) => Promise<void>;
  fresh: () => void;
  edit: () => void;
};
type Display = {
  title: string;
  text: string;
  working?: boolean;
  action?: Action | "copy" | "read" | "login" | "fresh" | "edit";
};
const phases = ["สร้าง NFT", "บันทึกทะเบียน", "ตรวจไฟล์และทะเบียน"];
const reasonTexts: Record<string, string> = {
  MINT_EVENT_BINDING_MISMATCH:
    "หลักฐานการสร้าง NFT ไม่ตรงกับรายการนี้ ผู้ดูแลต้องตรวจธุรกรรมและผู้รับก่อนบันทึกทะเบียน",
  MINT_RECEIVER_MISMATCH:
    "กระเป๋าที่รับ NFT ไม่ตรงกับผู้รับในคำขอ ให้ผู้ดูแลตรวจสอบธุรกรรมเดิม",
  MINT_EVENT_NOT_UNIQUE:
    "พบหลักฐานการสร้าง NFT ที่ระบุโทเคนเดียวไม่ได้ ผู้ดูแลต้องตรวจใบยืนยันธุรกรรม",
  DATABASE_PROJECTION_CONFLICT:
    "ทะเบียนมีข้อมูลที่ขัดกับรายการนี้ ผู้ดูแลต้องเทียบข้อมูลก่อนเผยแพร่",
  PUBLICATION_PROOF_MISMATCH:
    "ข้อมูลที่อ่านกลับมายังไม่ตรงกับหลักฐานการเผยแพร่ ผู้ดูแลต้องตรวจทะเบียนและไฟล์ของรายการนี้",
};
function describe(p: Props): Display {
  const { job } = p;
  const mint = job.steps.find((s) => s.kind === "mint");
  const feedback = p.problems.find((f): f is Feedback => !!f);
  if (p.authLost)
    return {
      title: "เซสชันหมดอายุ",
      text: "เข้าสู่ระบบแล้วกลับมาเปิดรายการเดิมเพื่อทำต่อ",
      action: "login",
    };
  if (p.readError)
    return {
      title:
        job.state === "COMPLETED"
          ? "เพิ่ม" + job.input.name + "สำเร็จแล้ว"
          : "ยังโหลดสถานะล่าสุดไม่ได้",
      text: "โหลดข้อมูลรายการเดิมอีกครั้งเพื่อดูผลล่าสุด",
      action: "read",
    };
  if (job.state === "COMPLETED")
    return {
      title: "เพิ่ม" + job.input.name + "สำเร็จ",
      text: "บันทึกทะเบียนและตรวจไฟล์ที่เผยแพร่ครบแล้ว",
      action: "fresh",
    };
  if (job.state === "CANCELLED")
    return {
      title: "ยกเลิกร่างนี้แล้ว",
      text: "เปิดรายการที่บันทึกไว้ หรือเริ่มเพิ่มควายตัวถัดไป",
      action: "fresh",
    };
  if (job.state === "READY" && job.reason === "INTEGRITY_WRITES_PAUSED")
    return {
      title: "ระบบพักการบันทึก",
      text: job.steps.length
        ? "ระบบเก็บคำขอแล้ว เมื่อผู้ดูแลเปิดระบบให้กดดำเนินการต่อจากรายการนี้"
        : "ร่างพร้อมแล้ว เมื่อผู้ดูแลเปิดระบบให้กดสร้าง NFT",
      action: job.steps.length ? "resume" : "mint",
    };
  if (
    feedback?.code === "INTEGRITY_WRITES_PAUSED" ||
    job.reason === "INTEGRITY_WRITES_PAUSED"
  )
    return {
      title: "ระบบพักการบันทึก",
      text: "คำขอเดิมยังอยู่ ให้ผู้ดูแลตรวจความพร้อมของระบบก่อนทำต่อ",
      action: "copy",
    };
  if (p.automationStopped)
    return {
      title: "ระบบหยุดตรวจอัตโนมัติแล้ว",
      text:
        (feedback?.reason ?? "ยังยืนยันผลของขั้นนี้ไม่ได้") +
        " ให้ผู้ดูแลตรวจรายการเดิมก่อนทำต่อ",
      action: "copy",
    };
  const files =
    p.automaticMode === "autoPublication" ||
    (job.state === "RECOVERY_REQUIRED" &&
      job.reason === "PUBLIC_ASSET_READBACK_PENDING");
  const unknown =
    p.automaticMode === "autoReconcile" || job.state === "BROADCAST_UNKNOWN";
  if (files || unknown) {
    const retry = files ? job.progress?.fileRetry : job.progress?.unknownRetry;
    const evidence = job.progress?.readback;
    const asset = evidence?.asset === "image" ? "รูปควาย" : "ไฟล์ข้อมูลทะเบียน";
    const location =
      evidence?.source === "origin" ? "จากที่เก็บต้นฉบับ" : "จากหน้าสาธารณะ";
    const reason = evidence
      ? evidence.problem === "unavailable"
        ? "ยังอ่าน" + asset + location + "ไม่ได้"
        : asset + location + "ยังไม่ตรงกับฉบับที่บันทึก"
      : "ยังยืนยันไฟล์ที่เผยแพร่ไม่ได้";
    if (!retry && !job.progress)
      return {
        title: "กำลังโหลดสถานะรายการ",
        text: "รอรายละเอียดของรายการเดิมก่อนตรวจต่อ",
        working: true,
      };
    if (!retry)
      return {
        title: "ไม่มีข้อมูลรอบตรวจของรายการเดิม",
        text: "ให้ผู้ดูแลตรวจหลักฐานของรายการนี้ก่อนทำต่อ",
        action: "copy",
      };
    if (retry.exhausted && !p.busy)
      return {
        title: files
          ? "ตรวจไฟล์ครบตามรอบแล้ว ยังยืนยันทะเบียนไม่ได้"
          : "ยังยืนยันธุรกรรมเดิมไม่ได้",
        text: files
          ? reason + " ให้ผู้ดูแลตรวจไฟล์ของรายการเดิม"
          : "ระบบหยุดตรวจอัตโนมัติแล้ว ให้ผู้ดูแลตรวจผลธุรกรรมก่อนทำต่อ",
        action: "copy",
      };
    return {
      title: files ? "กำลังตรวจไฟล์และทะเบียน" : "กำลังตรวจผลธุรกรรมเดิม",
      text: files
        ? "เปิดหน้านี้ไว้ ระบบจะอ่านไฟล์ที่เผยแพร่และเทียบกับทะเบียนให้อัตโนมัติ"
        : "เปิดหน้านี้ไว้ ระบบกำลังรอหลักฐานยืนยันจากบล็อกเชน",
      working: true,
    };
  }
  if (
    job.state === "NEEDS_REVIEW" ||
    (feedback && !p.autoContinuing && !p.busy)
  ) {
    if (feedback?.nextAction === "correct_input" && job.canEdit && !mint)
      return {
        title: "ต้องแก้ข้อมูลก่อนสร้าง NFT",
        text: feedback.reason,
        action: "edit",
      };
    if (
      job.state !== "NEEDS_REVIEW" &&
      feedback?.nextAction === "resume_existing" &&
      job.canResume &&
      ["RETRYABLE", "RECOVERY_REQUIRED"].includes(job.state)
    )
      return {
        title: "รายการหยุดรอดำเนินการต่อ",
        text: feedback.reason,
        action: "resume",
      };
    return {
      title: "หยุดรอตรวจสอบรายการ",
      text:
        reasonTexts[feedback?.code ?? job.reason ?? ""] ??
        feedback?.reason ??
        "ระบบยืนยันหลักฐานของรายการนี้ไม่ได้ ให้ผู้ดูแลตรวจรายการเดิมก่อนดำเนินการต่อ",
      action: "copy",
    };
  }
  if (p.busy)
    return {
      title: "กำลังดำเนินการ",
      text: "กำลังบันทึกผลในรายการเดิม กรุณารอ",
      working: true,
    };
  if (job.state === "READY" && !mint)
    return {
      title: "พร้อมสร้าง NFT",
      text: "ข้อมูลและรูปผ่านการตรวจแล้ว กดสร้าง NFT เพื่อรับเลขประจำตัวของควายตัวนี้",
      action: "mint",
    };
  if (
    job.state === "AWAITING_METADATA_ACTION" &&
    mint?.state === "CONFIRMED" &&
    job.actualToken
  )
    return {
      title: "สร้าง NFT #" + job.actualToken + " แล้ว",
      text: "กดบันทึกทะเบียนเพื่อผูกข้อมูลควายกับ NFT ระบบจะตรวจไฟล์ต่อให้",
      action: "metadata",
    };
  if (job.state === "READY" && mint?.state === "RESERVED")
    return {
      title: "รอส่งธุรกรรมสร้าง NFT",
      text: "ระบบเก็บคำขอแล้วและจะทำรายการเดิมต่อเมื่อกระเป๋าพร้อม",
      working: true,
    };
  if (job.state === "PROJECTING" || job.state === "VERIFYING")
    return {
      title: "กำลังตรวจไฟล์และทะเบียน",
      text: "ระบบกำลังเผยแพร่และตรวจรูปควายกับข้อมูลทะเบียน",
      working: true,
    };
  if (
    p.autoContinuing &&
    ["SIGNING", "CHAIN_PENDING", "CHAIN_STEPS", "READY"].includes(job.state)
  )
    return {
      title: job.actualToken ? "กำลังบันทึกทะเบียน" : "กำลังสร้าง NFT",
      text: "ระบบกำลังตรวจธุรกรรมตามลำดับ เปิดหน้านี้ไว้เพื่อรอผล",
      working: true,
    };
  if (job.canResume && ["RECOVERY_REQUIRED", "RETRYABLE"].includes(job.state))
    return {
      title: "รายการหยุดรอดำเนินการต่อ",
      text: "ทำต่อจากขั้นที่บันทึกไว้ในรายการเดิม",
      action: "resume",
    };
  return {
    title: "ยังยืนยันขั้นต่อไปไม่ได้",
    text: "ส่งข้อมูลให้ผู้ดูแลตรวจสถานะและหลักฐานของรายการเดิม",
    action: "copy",
  };
}
const buttonLabels = {
  mint: "สร้าง NFT",
  metadata: "บันทึกทะเบียน",
  resume: "ดำเนินการต่อรายการเดิม",
  copy: "คัดลอกข้อมูลส่งผู้ดูแล",
  fresh: "เพิ่มควายตัวถัดไป",
  edit: "แก้ไขข้อมูลควาย",
};
function clock(iso: string) {
  return new Date(iso).toLocaleTimeString("th-TH", {
    timeZone: "Asia/Bangkok",
    hour12: false,
  });
}
function duration(ms: number) {
  const sec = Math.max(0, Math.floor(ms / 1000));
  return sec >= 60
    ? Math.floor(sec / 60) + " นาที " + (sec % 60) + " วิ."
    : sec + " วิ.";
}
export function CreateSupportCopy({
  job,
  identity,
  problems,
  description,
}: {
  job?: Job;
  identity: { name: string; microchip: string };
  problems: Props["problems"];
  description: string;
}) {
  const [copy, setCopy] = useState("");
  const [manual, setManual] = useState("");
  const progress = job?.progress;
  const retry = progress?.unknownRetry ?? progress?.fileRetry;
  async function copyReport() {
    const report = [
      "หน้า: เพิ่มควาย",
      "เวลา: " + new Date().toISOString(),
      "ชื่อ: " + identity.name,
      "ไมโครชิป: " + identity.microchip,
      job && "operationId: " + job.id,
      job && "state: " + job.state,
      job && "revision: " + job.version,
      job?.updatedAt && "อัปเดต: " + job.updatedAt,
      job?.actualToken && "Token #" + job.actualToken,
      description,
      job?.reason,
      ...problems
        .filter((f): f is Feedback => !!f)
        .map((f) =>
          [
            f.code,
            f.reason,
            f.stage,
            f.outcome,
            f.requestId && "requestId: " + f.requestId,
            f.operationId && "operationId: " + f.operationId,
          ]
            .filter(Boolean)
            .join(" · "),
        ),
      progress?.readback &&
        [
          "readback",
          progress.readback.asset,
          progress.readback.source,
          progress.readback.problem,
        ].join(" · "),
      retry && "จำนวนรอบที่ตรวจ: " + retry.attempts,
      ...(job?.steps ?? []).map((s) =>
        [s.kind, s.state, s.hash].filter(Boolean).join(" · "),
      ),
    ]
      .filter(Boolean)
      .join("\n");
    try {
      await navigator.clipboard.writeText(report);
      setManual("");
      setCopy("คัดลอกแล้ว ส่งข้อความนี้ให้ผู้ดูแลได้เลย");
    } catch {
      setManual(report);
      setCopy("เลือกข้อความด้านล่างเพื่อคัดลอก");
    }
  }
  return (
    <div>
      <button
        type="button"
        className="btn btn-primary min-h-12 w-full sm:w-auto"
        onClick={() => void copyReport()}
      >
        คัดลอกข้อมูลส่งผู้ดูแล
      </button>
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
    </div>
  );
}
export function CreateProgress(p: Props) {
  const { job } = p;
  const display = describe(p);
  const progress = job.progress;
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!display.working || progress?.currentPhase == null) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [display.working, progress?.currentPhase]);
  const complete = job.state === "COMPLETED";
  const mintDone =
    !!job.actualToken &&
    job.steps.some((s) => s.kind === "mint" && s.state === "CONFIRMED");
  const filesStarted =
    progress?.phases[2] != null ||
    ["PROJECTING", "VERIFYING"].includes(job.state) ||
    job.reason === "PUBLIC_ASSET_READBACK_PENDING";
  const at = complete ? 3 : filesStarted ? 2 : mintDone ? 1 : 0;
  const retry =
    p.automaticMode === "autoReconcile" || job.state === "BROADCAST_UNKNOWN"
      ? progress?.unknownRetry
      : progress?.fileRetry;
  const cta = "btn btn-primary min-h-12 w-full whitespace-normal sm:w-auto";
  function press() {
    switch (display.action) {
      case "fresh":
        return p.fresh();
      case "edit":
        return p.edit();
      case "read":
        return p.retryRead();
      case "mint":
      case "metadata":
      case "resume":
        return void p.action(display.action);
    }
  }
  return (
    <section
      aria-label="ความคืบหน้าการเพิ่มควาย"
      className="min-w-0 space-y-4 rounded-xl border border-base-content/25 bg-base-100 p-4 sm:p-6"
    >
      <header>
        <p className="break-words text-sm text-base-content/75">
          {job.input.name} · ไมโครชิป {job.microchip}
          {mintDone && (
            <>
              {" "}
              · NFT #<span data-actual-token>{job.actualToken}</span>
            </>
          )}
        </p>
        <div role="status" aria-live="polite" aria-atomic="true">
          <h2
            data-create-state
            className="mt-2 flex items-center gap-2 text-xl font-semibold"
          >
            {display.working && (
              <span
                aria-hidden="true"
                className="loading loading-spinner loading-sm text-primary motion-reduce:animate-none"
              />
            )}
            {display.title}
          </h2>
          <p className="mt-1 text-base-content/80">{display.text}</p>
        </div>
      </header>
      <div aria-hidden="true" className="flex gap-1">
        {phases.map((label, i) => (
          <span
            key={label}
            className={
              "h-1 flex-1 rounded-full " +
              (i < at
                ? "bg-success"
                : i === at
                  ? "bg-primary"
                  : "bg-base-content/25")
            }
          />
        ))}
      </div>
      <ol
        aria-label="ความคืบหน้าการขึ้นทะเบียน"
        className="grid gap-3 sm:grid-cols-3"
      >
        {phases.map((label, i) => {
          const elapsed = progress?.phases[i];
          const delta =
            display.working && at === i && progress?.currentPhase === i
              ? Math.max(0, now - Date.parse(progress.checkedAt))
              : 0;
          return (
            <li
              key={label}
              aria-current={i === at ? "step" : undefined}
              className="flex items-start gap-2"
            >
              <span
                aria-hidden="true"
                className={
                  "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-sm " +
                  (i < at
                    ? "border-success text-success"
                    : i === at
                      ? "border-primary bg-primary text-black"
                      : "border-base-content/40")
                }
              >
                {i < at ? "✓" : i + 1}
              </span>
              <div>
                {label}
                <p className="text-sm text-base-content/70">
                  {i < at
                    ? "ผ่านแล้ว"
                    : i > at
                      ? "รอขั้นก่อนหน้า"
                      : display.working
                        ? "กำลังดำเนินการ"
                        : display.action === "mint" ||
                            display.action === "metadata"
                          ? "รอคุณยืนยัน"
                          : "หยุดรอ"}
                  {elapsed != null && (
                    <span className="tabular-nums">
                      {" "}
                      · {duration(elapsed + delta)}
                    </span>
                  )}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      {display.working && progress?.checkedAt && (
        <p className="text-sm text-base-content/70">
          ตรวจสถานะล่าสุด {clock(progress.checkedAt)} น.
          {retry?.nextAt && <> · ตรวจรอบถัดไป {clock(retry.nextAt)} น.</>}
        </p>
      )}
      {display.action === "copy" ? (
        <CreateSupportCopy
          job={job}
          identity={job.input}
          problems={p.problems}
          description={display.title + " · " + display.text}
        />
      ) : display.action === "login" ? (
        <Link href="/" className={cta}>
          เข้าสู่ระบบอีกครั้ง
        </Link>
      ) : (
        display.action && (
          <button
            className={cta}
            onClick={press}
            disabled={p.busy}
            data-mint-nft={display.action === "mint" || undefined}
            data-mint-metadata={display.action === "metadata" || undefined}
          >
            {display.action === "read"
              ? p.retryLabel
              : buttonLabels[display.action]}
          </button>
        )
      )}
      {display.action === "mint" && job.canEdit && (
        <button
          className="btn btn-ghost min-h-12 w-full sm:w-auto"
          onClick={p.edit}
        >
          ย้อนกลับแก้ไขข้อมูล
        </button>
      )}
      <details className="border-t border-base-content/15 pt-2 text-sm text-base-content/75">
        <summary className="cursor-pointer py-2">รายละเอียดรายการ</summary>
        <p className="break-all">
          เลขรายการ {job.id} · {createStatus(job.state)}
        </p>
        {job.environment === "local-fork" && <p>สภาพแวดล้อมทดสอบ local fork</p>}
        <ul>
          {job.steps.map((s, i) => (
            <li key={i} className="mt-2 break-all">
              {stepLabel(s.kind)} · {stepStatus(s.state)}{" "}
              {s.hash &&
                (s.explorerUrl && job.environment !== "local-fork" ? (
                  <a
                    className="link"
                    target="_blank"
                    rel="noreferrer"
                    href={s.explorerUrl}
                  >
                    {s.hash}
                  </a>
                ) : (
                  <code>{s.hash}</code>
                ))}
            </li>
          ))}
        </ul>
        {complete && job.publishedImageUrl && (
          <a
            href={job.publishedImageUrl}
            target="_blank"
            rel="noreferrer"
            className="link"
          >
            ดูรูปที่เผยแพร่
          </a>
        )}
      </details>
    </section>
  );
}
