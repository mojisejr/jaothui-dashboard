import { useRef, useState } from "react";
import type { Application } from "~/lib/competition-applications";
import {
  checkInTime,
  CHECK_IN_UPGRADE_MESSAGE,
  hasCheckInCapability,
} from "~/lib/competition-check-in";
import { api } from "~/utils/api";
import { Alert, button, control, primary } from "./Workspace";
import { useUnsavedCompetitionChanges } from "./useUnsavedCompetitionChanges";

type Props = {
  id: string;
  entry: Application;
  busy: boolean;
  onBusy: (busy: boolean) => void;
  onUpdated: (entry: Application) => void;
  reload: () => Promise<Application | undefined>;
};
export function ApplicationCheckIn(props: Props) {
  if (!hasCheckInCapability(props.entry))
    return <Alert>{CHECK_IN_UPGRADE_MESSAGE}</Alert>;
  return <CheckInActions key={props.entry._id} {...props} />;
}
function CheckInActions({ id, entry, busy, onBusy, onUpdated, reload }: Props) {
  const [undoOpen, setUndoOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [failure, setFailure] = useState("");
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState(false);
  const [working, setWorking] = useState(false);
  const pending = useRef(false);
  const operation = useRef<{ fingerprint: string; id: string }>();
  const confirm = api.competitions.checkIn.useMutation();
  const undo = api.competitions.undoCheckIn.useMutation();
  const utils = api.useUtils();
  useUnsavedCompetitionChanges(undoOpen && !!reason.trim());
  const checkedIn = entry.checkInStatus === "checked_in";
  const disabled = busy || working;
  async function update(action: "confirm" | "undo") {
    if (pending.current || busy || conflict) return;
    if (action === "undo" && reason.trim().length < 10) {
      setFailure("กรุณาระบุเหตุผลยกเลิกอย่างน้อย 10 ตัวอักษร");
      return;
    }
    if (action === "confirm" && !entry.checkInEligibility?.eligible) return;
    const body = {
      id,
      registrationId: entry._id,
      expectedRevision: entry._rev,
    };
    const fingerprint = JSON.stringify({
      action,
      ...body,
      ...(action === "undo" ? { reason: reason.trim() } : {}),
    });
    if (operation.current?.fingerprint !== fingerprint)
      operation.current = { fingerprint, id: crypto.randomUUID() };
    pending.current = true;
    setWorking(true);
    onBusy(true);
    setFailure("");
    setMessage("");
    try {
      const input = { ...body, operationId: operation.current.id };
      const next =
        action === "confirm"
          ? await confirm.mutateAsync(input)
          : await undo.mutateAsync({ ...input, reason: reason.trim() });
      onUpdated(next);
      operation.current = undefined;
      setUndoOpen(false);
      setReason("");
      setConflict(false);
      const returnedCheckedIn = next.checkInStatus === "checked_in";
      const matchesRequest = returnedCheckedIn === (action === "confirm");
      setMessage(
        !matchesRequest
          ? `สถานะล่าสุด: ${returnedCheckedIn ? "รายงานตัวแล้ว" : "ยังไม่รายงานตัว"} กรุณาตรวจประวัติก่อนดำเนินการอีกครั้ง`
          : returnedCheckedIn
            ? "บันทึกการรายงานตัวแล้ว"
            : "ยกเลิกการรายงานตัวแล้ว โดยเก็บประวัติเดิมไว้",
      );
      void utils.competitions.applications.invalidate({ id });
      void utils.competitions.application.invalidate({
        id,
        registrationId: entry._id,
      });
    } catch (error) {
      setFailure(
        error instanceof Error
          ? error.message
          : "ติดต่อระบบไม่สำเร็จ กรุณาโหลดข้อมูลล่าสุดเพื่อตรวจผลก่อนลองอีกครั้ง",
      );
      if ((error as { data?: { code?: string } })?.data?.code === "CONFLICT")
        setConflict(true);
    } finally {
      pending.current = false;
      setWorking(false);
      onBusy(false);
    }
  }
  async function refresh() {
    if (pending.current || busy) return;
    pending.current = true;
    setWorking(true);
    onBusy(true);
    setFailure("");
    try {
      const next = await reload();
      if (next) {
        onUpdated(next);
        operation.current = undefined;
        setConflict(false);
        setMessage("โหลดสถานะล่าสุดแล้ว กรุณาตรวจข้อมูลก่อนยืนยัน");
      }
    } catch (error) {
      setFailure(
        error instanceof Error ? error.message : "โหลดสถานะล่าสุดไม่สำเร็จ",
      );
    } finally {
      pending.current = false;
      setWorking(false);
      onBusy(false);
    }
  }
  return (
    <section
      aria-label="รายงานตัวหน้างาน"
      className="min-w-0 space-y-4 rounded-2xl border border-white/20 bg-black/20 p-4"
    >
      <h3 className="text-lg font-semibold">รายงานตัวหน้างาน</h3>
      <p className="break-words">
        รุ่น {entry.type || "ไม่ระบุรุ่น"} • ไมโครชิพ{" "}
        {entry.microchip || "ไม่ระบุ"}
      </p>
      <p
        role="status"
        className={checkedIn ? "text-emerald-200" : "text-text-muted"}
      >
        {checkedIn ? "รายงานตัวแล้ว" : "ยังไม่รายงานตัว"}
        {checkedIn && entry.checkedInAt
          ? ` • ${checkInTime(entry.checkedInAt)} (เวลาไทย)`
          : ""}
      </p>
      {message ? <Alert>{message}</Alert> : null}
      {failure ? (
        <Alert error>
          {failure} กรุณาตรวจสถานะล่าสุด หากการเชื่อมต่อขัดข้อง
        </Alert>
      ) : null}
      {conflict ? (
        <Alert error>
          ข้อมูลมีการเปลี่ยนแปลง กรุณาโหลดสถานะรายงานตัวล่าสุดก่อนบันทึก
        </Alert>
      ) : null}
      {!entry.checkInEligibility?.eligible &&
      entry.checkInEligibility?.reason ? (
        <p className="text-sm text-orange-200">
          {entry.checkInEligibility.reason}
        </p>
      ) : null}
      {checkedIn ? (
        <>
          <button
            className={button}
            disabled={disabled || conflict}
            onClick={() => setUndoOpen(!undoOpen)}
          >
            {undoOpen ? "ปิดการยกเลิก" : "ยกเลิกการรายงานตัว"}
          </button>
          {undoOpen ? (
            <div className="space-y-3">
              <label className="block space-y-2 text-sm">
                เหตุผลยกเลิกการรายงานตัว
                <textarea
                  className={control}
                  rows={3}
                  minLength={10}
                  maxLength={3000}
                  value={reason}
                  disabled={disabled}
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>
              <p className="text-sm text-text-muted">
                ต้องระบุอย่างน้อย 10 ตัวอักษร
                ระบบเก็บประวัติเดิมและเหตุผลทุกครั้ง
              </p>
              <button
                className={button}
                disabled={disabled || conflict}
                onClick={() => void update("undo")}
              >
                {working ? "กำลังบันทึก…" : "ยืนยันยกเลิกการรายงานตัว"}
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <button
          className={`${primary} w-full sm:w-auto`}
          disabled={disabled || conflict || !entry.checkInEligibility?.eligible}
          onClick={() => void update("confirm")}
        >
          {working ? "กำลังบันทึก…" : "ยืนยันรายงานตัว"}
        </button>
      )}
      <button
        className={button}
        disabled={disabled}
        onClick={() => void refresh()}
      >
        โหลดสถานะรายงานตัวล่าสุด
      </button>
      <p className="text-sm text-text-muted">
        กรุณาตรวจชื่อควาย ไมโครชิพ และรุ่นก่อนยืนยัน •
        ดำเนินการด้วยบัญชีทีมงานร่วม
      </p>
      {entry.checkInHistory?.length ? (
        <details className="space-y-3">
          <summary className="cursor-pointer py-3 text-sm">
            ประวัติรายงานตัว ({entry.checkInHistory.length})
          </summary>
          <ol className="space-y-3 text-sm">
            {entry.checkInHistory.map((item, index) => (
              <li key={`${item.at}:${index}`} className="break-words">
                {item.action === "confirm"
                  ? "ยืนยันรายงานตัว"
                  : "ยกเลิกการรายงานตัว"}{" "}
                • {checkInTime(item.at)} (เวลาไทย) • บัญชีทีมงานร่วม
                {item.reason ? ` • เหตุผล: ${item.reason}` : ""}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </section>
  );
}
