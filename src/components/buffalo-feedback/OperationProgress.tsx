import { useEffect, useState } from "react";

type Progress = {
  id: string;
  state: string;
  steps: { kind: string; state: string; hash: string | null }[];
};
/** Waiting guidance shared by every edit field, DNA and buffalo creation. */
export function OperationProgress({
  job,
  busy,
  kind,
}: {
  job?: Progress | null;
  busy: boolean;
  kind: "create" | "edit";
}) {
  const [elapsed, setElapsed] = useState(0);
  const [copied, setCopied] = useState("");
  const finished = job?.state === "COMPLETED" || job?.state === "CANCELLED";
  const waiting =
    busy ||
    (!!job &&
      !finished &&
      ![
        "DRAFT",
        "AWAITING_METADATA_ACTION",
        "NEEDS_REVIEW",
        "RECOVERY_REQUIRED",
        "RETRYABLE",
        ...(kind === "create" ? ["READY"] : []),
      ].includes(job.state));
  useEffect(() => {
    setElapsed(0);
    setCopied("");
  }, [job?.id]);
  useEffect(() => {
    if (!waiting) return;
    const start = Date.now();
    const timer = setInterval(
      () => setElapsed(Math.floor((Date.now() - start) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [job?.id, waiting]);
  if (!job && !busy) return null;
  const checkpoint =
    kind === "create"
      ? "เสร็จสมบูรณ์"
      : "แก้ไขช่องที่ร้องขอและตรวจสอบสำเร็จแล้ว";
  const report = job
    ? [
        `เวลา: ${new Date().toISOString()}`,
        `หน้า: ${kind === "create" ? "เพิ่มควาย" : "แก้ไขควาย"}`,
        `operationId: ${job.id}`,
        `state: ${job.state}`,
        ...job.steps.map(
          (step) =>
            `${step.kind}: ${step.state}${step.hash ? ` ${step.hash}` : ""}`,
        ),
      ].join("\n")
    : "";
  return (
    <section
      className="my-4 min-w-0 space-y-2 rounded-lg border border-primary p-4 text-base"
      aria-label="คำแนะนำระหว่างบันทึก"
    >
      {job?.state === "COMPLETED" ? (
        <p>
          บันทึกและตรวจสอบสำเร็จแล้ว ออกจากหน้านี้ได้
          หากข้อมูลบนหน้าจอยังไม่เปลี่ยน ให้โหลดรายละเอียดล่าสุดโดยไม่บันทึกซ้ำ
        </p>
      ) : job?.state === "CANCELLED" ? (
        <p>ยกเลิกคำขอแล้ว</p>
      ) : (
        <>
          <p>
            กรุณาอยู่หน้านี้จนขึ้น “{checkpoint}” การรับรูปหรือมีเลขธุรกรรมแล้ว
            ยังไม่ถือว่าบันทึกครบ
          </p>
          {job?.state === "AWAITING_METADATA_ACTION" ? (
            <p className="font-semibold text-primary">
              Mint NFT สำเร็จแล้ว แต่ยังไม่เสร็จ กรุณากด Mint Metadata
              แล้วรอจนเสร็จสมบูรณ์
            </p>
          ) : kind === "create" && job?.state === "READY" && !busy ? (
            <p>พร้อมแล้ว กรุณากด Mint NFT เพื่อเริ่มบันทึก</p>
          ) : waiting ? (
            <>
              <p aria-live="off" className="tabular-nums">
                รอในช่วงนี้ {Math.floor(elapsed / 60)} นาที {elapsed % 60}{" "}
                วินาที
              </p>
              <p className="text-sm">
                เผื่อเวลาประมาณ 1–3 นาทีต่อช่วง เป็นเวลาแนะนำ
                ไม่ใช่เวลารับประกัน ระหว่างรออย่ากดบันทึกซ้ำ
              </p>
            </>
          ) : (
            <p>
              หากมีข้อผิดพลาด ให้ทำตามข้อความด้านบนและดำเนินการต่อรายการเดิม
              อย่าสร้างรายการใหม่เพื่อข้ามปัญหา
            </p>
          )}
          {elapsed >= 180 && waiting && (
            <p className="text-warning">
              รอนานกว่าช่วงแนะนำแล้ว ยังสรุปไม่ได้ว่าล้มเหลว หากครบ 5
              นาทีแล้วยังไม่เสร็จ ให้คัดลอกข้อมูลรายการและแจ้งผู้ดูแล
            </p>
          )}
          <p className="text-sm">
            ถ้าเน็ตหลุดหรือปิดหน้า ให้กลับเข้าหน้าเดิม
            {kind === "edit"
              ? "และค้นหาไมโครชิปเดิม"
              : "แล้วเลือกรายการเดิม"}{" "}
            ตรวจสถานะก่อน และกด “ดำเนินการต่อรายการเดิม” เมื่อระบบเปิดให้กด
          </p>
        </>
      )}
      {job && (
        <>
          <p className="break-all text-sm">เลขรายการ: {job.id}</p>
          <button
            type="button"
            className="btn btn-outline min-h-12"
            onClick={() => {
              if (!navigator.clipboard) {
                setCopied("คัดลอกไม่สำเร็จ กรุณาถ่ายภาพหน้าจอพร้อมเลขรายการ");
                return;
              }
              void navigator.clipboard.writeText(report).then(
                () =>
                  setCopied(
                    "คัดลอกข้อมูลรายการแล้ว กรุณาแนบภาพหน้าจอและบอกช่องที่แก้ไขด้วย",
                  ),
                () =>
                  setCopied("คัดลอกไม่สำเร็จ กรุณาถ่ายภาพหน้าจอพร้อมเลขรายการ"),
              );
            }}
          >
            คัดลอกข้อมูลรายการเพื่อแจ้งผู้ดูแล
          </button>
          {copied && (
            <p role="status" className="text-sm">
              {copied}
            </p>
          )}
        </>
      )}
    </section>
  );
}
