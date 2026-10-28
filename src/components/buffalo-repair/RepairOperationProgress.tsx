import Link from "next/link";
import { FeedbackPanel } from "~/components/buffalo-feedback/FeedbackPanel";
import { PreparedRepairReview } from "./PreparedRepairReview";
import { repairTerminal, type useRepairExecution } from "./useRepairExecution";
type Controller = ReturnType<typeof useRepairExecution>;
const states: Record<string, string> = {
  DRAFT: "เตรียมแผนแล้ว ยังไม่ได้รับการยืนยันให้ซ่อม",
  READY: "ยืนยันแผนแล้ว พร้อมดำเนินการรายการเดิม",
  SIGNING: "กำลังเตรียมธุรกรรมของรายการเดิม",
  CHAIN_PENDING: "กำลังรอหลักฐานยืนยันธุรกรรม",
  BROADCAST_UNKNOWN: "ยังไม่ทราบผลส่งธุรกรรม ต้องตรวจรายการเดิมก่อน",
  AWAITING_METADATA_ACTION: "รอดำเนินการข้อมูลตามแผนเดิม",
  CHAIN_STEPS: "ดำเนินการบน blockchain แล้วบางส่วน ยังไม่เสร็จครบ",
  PROJECTING: "กำลังบันทึกทะเบียนหลังตรวจหลักฐาน",
  VERIFYING: "กำลังตรวจผลสุดท้ายทั้งทะเบียนและ blockchain",
  COMPLETED: "ซ่อมสำเร็จและตรวจหลักฐานครบแล้ว",
  RETRYABLE: "ยังทำไม่ครบ สามารถดำเนินการต่อรายการเดิมตามคำแนะนำ",
  RECOVERY_REQUIRED: "มีส่วนที่ต้องกู้คืน เก็บเลขรายการเดิมไว้และตรวจคำแนะนำ",
  NEEDS_REVIEW: "ข้อมูลหรือหลักฐานต้องให้ผู้ดูแลตรวจเพิ่มเติม ยังทำต่อไม่ได้",
  CANCELLED: "ยกเลิกรายการแล้ว ไม่มีการเริ่มซ่อมจากแผนนี้",
};
const steps: Record<string, string> = {
  RESERVED: "เตรียมไว้",
  SIGNED: "เตรียมธุรกรรมแล้ว",
  PENDING: "รอยืนยัน",
  UNKNOWN: "ยังไม่ทราบผล",
  CONFIRMED: "ยืนยันแล้ว",
  REVERTED: "ธุรกรรมไม่สำเร็จ",
  REVIEW: "ต้องตรวจเพิ่มเติม",
};
export function RepairOperationProgress({
  controller,
  onFinished,
}: {
  controller: Controller;
  onFinished?: () => void;
}) {
  const { pending, view, busy, uncertain, error, capability } = controller;
  if (!pending && !error) return null;
  return (
    <section
      className="min-w-0 space-y-4 rounded-lg border border-primary p-4"
      aria-label="สถานะรายการซ่อมเดิม"
    >
      <h2 className="text-xl font-semibold">รายการซ่อมที่กำลังติดตาม</h2>
      {pending && <p className="break-all text-sm">เลขรายการ: {pending.key}</p>}
      <p role="status" aria-live="polite">
        {view
          ? Object.hasOwn(states, view.state)
            ? states[view.state]
            : "ได้รับสถานะที่ต้องให้ผู้ดูแลตรวจเพิ่มเติม"
          : "กำลังตรวจผลของเลขรายการเดิม ยังไม่เริ่มรายการใหม่"}
        {busy ? " · กำลังติดต่อระบบ…" : ""}
      </p>
      {uncertain && (
        <p className="rounded-lg border border-warning p-3">
          {view?.state === "COMPLETED"
            ? "ยืนยันว่าซ่อมสำเร็จแล้ว แต่ยังอ่านสถานะล่าสุดไม่สำเร็จ"
            : "ยังยืนยันผลคำขอล่าสุดไม่ได้ หยุดการส่งซ้ำไว้ก่อน แล้วอ่านสถานะรายการเดิม"}
        </p>
      )}
      {error && (
        <FeedbackPanel
          feedback={error}
          onRetry={pending ? () => void controller.refresh() : undefined}
          retryLabel="ตรวจสถานะรายการเดิม"
          busy={busy}
        />
      )}
      {view?.diagnostic && !error && (
        <FeedbackPanel feedback={view.diagnostic} />
      )}
      {(error?.nextAction === "reauthenticate" ||
        view?.diagnostic?.nextAction === "reauthenticate") && (
        <Link href="/" className="btn btn-primary min-h-12">
          เข้าสู่ระบบอีกครั้ง แล้วกลับมาตรวจรายการเดิม
        </Link>
      )}
      {controller.canRetryPrepare && (
        <button
          className="btn btn-outline min-h-12"
          disabled={busy || !capability.data?.canPrepare}
          onClick={() => void controller.retryPrepare()}
        >
          ตรวจรายการเดิมก่อนเตรียมคำขอเดิมอีกครั้ง
        </button>
      )}
      {view && (
        <>
          {view.canReviewReceipt && (
            <div className="space-y-2 rounded-lg border border-warning p-3">
              <p>
                ตรวจธุรกรรมที่บันทึกไว้ด้วยหลักฐานปัจจุบันอีกครั้ง
                ขั้นตอนนี้ไม่ส่งธุรกรรมใหม่หรือบันทึกทะเบียน
              </p>
              <button
                className="btn btn-outline min-h-12"
                disabled={busy || uncertain || !capability.data?.canResume}
                onClick={() => void controller.action("reviewReceipt")}
              >
                ตรวจหลักฐานธุรกรรมเดิมอีกครั้ง
              </button>
            </div>
          )}
          <PreparedRepairReview view={view} />
          {view.steps.length > 0 && (
            <ol aria-label="ความคืบหน้าธุรกรรม" className="space-y-3">
              {view.steps.map((step, index) => (
                <li
                  key={index}
                  className="min-w-0 rounded-lg border border-base-300 p-3 text-sm"
                >
                  <p>
                    ธุรกรรม {index + 1}
                    {step.tokenId ? ` · NFT ${step.tokenId}` : ""} ·{" "}
                    {step.kind === "dna_restore"
                      ? "ใส่ DNA กลับ"
                      : step.kind === "uri"
                        ? "ตั้งที่อยู่ไฟล์ NFT"
                        : "แก้ข้อมูลตัวตน"}
                    :{" "}
                    {Object.hasOwn(steps, step.state)
                      ? steps[step.state]
                      : "ต้องตรวจสถานะ"}
                  </p>
                  {step.hash && (
                    <p className="break-all">รหัสธุรกรรม: {step.hash}</p>
                  )}
                  {step.receipt && (
                    <p className="break-all">
                      Block {step.receipt.blockNumber} ·{" "}
                      {step.receipt.status === "success"
                        ? "ธุรกรรมสำเร็จ"
                        : "ธุรกรรมไม่สำเร็จ"}{" "}
                      · {step.receipt.blockHash}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
          {!repairTerminal(view) && view.state !== "DRAFT" && (
            <p className="text-sm">
              ยังไม่ถือว่าซ่อมครบจนระบบตรวจผลสุดท้ายสำเร็จ หากทำไปบางส่วนแล้ว
              ระบบจะกู้ต่อด้วยรายการเดิม ไม่ย้อนธุรกรรมอัตโนมัติ
            </p>
          )}
          {view.canApprove && (
            <p>
              การยืนยันครั้งนี้ครอบคลุมแผน ตัวตน ไฟล์
              และเพดานค่าธรรมเนียมที่แสดงทั้งหมด
              บัญชีร่วมนี้ไม่ได้พิสูจน์สิทธิ์แยกรายบุคคล
            </p>
          )}
          {view.canApprove && !capability.data?.canApprove && (
            <p className="text-warning">
              ขณะนี้ยังไม่เปิดรับการยืนยันซ่อมใหม่ สามารถอ่านและตรวจแผนนี้ได้
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            {view.canApprove && (
              <button
                className="btn btn-primary min-h-12"
                disabled={busy || uncertain || !capability.data?.canApprove}
                onClick={() => void controller.action("approve")}
              >
                ยืนยันแผนนี้และเริ่มซ่อม
              </button>
            )}
            {view.canResume && (
              <button
                className="btn btn-primary min-h-12"
                disabled={busy || uncertain}
                onClick={() => void controller.action("advance")}
              >
                ดำเนินการต่อรายการเดิม
              </button>
            )}
            {view.canCancel && (
              <button
                className="btn btn-outline min-h-12"
                disabled={busy || uncertain}
                onClick={() => void controller.action("cancel")}
              >
                ยกเลิกแผนที่ยังไม่เริ่มซ่อม
              </button>
            )}
            <button
              className="btn btn-outline min-h-12"
              disabled={busy}
              onClick={() => void controller.refresh()}
            >
              อ่านสถานะล่าสุด
            </button>
            {repairTerminal(view) && (
              <button
                className="btn btn-outline min-h-12"
                disabled={busy || uncertain}
                onClick={() => {
                  controller.finish();
                  onFinished?.();
                }}
              >
                ปิดการติดตามรายการนี้
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
