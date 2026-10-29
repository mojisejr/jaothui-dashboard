import { useRouter } from "next/router";
import { useRef, useState } from "react";
import { api } from "~/utils/api";
import { type Application } from "~/lib/competition-applications";
import { type Competition } from "~/lib/competitions";
import { Alert, button, control } from "./Workspace";

const MIN_REASON = 10;
const danger = `${button} w-full !border-red-300/40 !text-red-200 sm:w-auto`;

export function ApplicationDeletePanel({
  event,
  entry,
  reload,
}: {
  event: Competition;
  entry: Application;
  reload: () => Promise<void>;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [failure, setFailure] = useState("");
  const [conflict, setConflict] = useState(false);
  const operation = useRef<{ fingerprint: string; id: string }>();
  const pending = useRef(false);
  const remove = api.competitions.deleteApplication.useMutation();
  const utils = api.useUtils();
  const ready = reason.trim().length >= MIN_REASON;
  const busy = remove.isPending;
  const op = (fingerprint: string) => {
    if (operation.current?.fingerprint !== fingerprint)
      operation.current = { fingerprint, id: crypto.randomUUID() };
    return operation.current.id;
  };
  async function submit() {
    if (pending.current || !ready) return;
    const name = entry.name || "ไม่ระบุชื่อควาย";
    if (
      !window.confirm(
        `ลบใบสมัครของ "${name}" (ไมโครชิพ ${entry.microchip || "ไม่ระบุ"}) ออกจากงานนี้?\nระบบเก็บสำเนาไว้ในประวัติการดำเนินการ และจะไม่ส่งแจ้งผู้สมัคร`,
      )
    )
      return;
    pending.current = true;
    setFailure("");
    const body = {
      id: event._id,
      registrationId: entry._id,
      expectedRevision: event._rev,
      registrationRevision: entry._rev,
      reason: reason.trim(),
    };
    try {
      await remove.mutateAsync({
        ...body,
        operationId: op(JSON.stringify(body)),
      });
      await Promise.all([
        utils.competitions.applications.invalidate({ id: event._id }),
        utils.competitions.get.invalidate({ id: event._id }),
      ]);
      void router.replace(
        `/dashboard/competitions/${encodeURIComponent(event._id)}/applications?deleted=1`,
      );
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "ลบใบสมัครไม่สำเร็จ");
      if ((e as { data?: { code?: string } })?.data?.code === "CONFLICT")
        setConflict(true);
    } finally {
      pending.current = false;
    }
  }
  return (
    <section
      className="glass-card min-w-0 space-y-4 rounded-3xl p-5"
      aria-label="ลบใบสมัคร"
    >
      <h2 className="text-lg font-semibold">ลบใบสมัคร</h2>
      <p className="break-words text-sm text-text-muted">
        ใช้เมื่อใบสมัครนี้สร้างผิดหรือเป็นการทดลอง ระบบจะลบใบสมัคร ผลการตรวจ
        รูปและที่อยู่ของใบสมัครนี้ ลดจำนวนผู้สมัครของงาน
        และเก็บสำเนาไว้ในประวัติ ผู้สมัครจะไม่ได้รับแจ้ง
      </p>
      <label className="block min-w-0 space-y-2 text-sm">
        เหตุผลที่ลบ (อย่างน้อย {MIN_REASON} ตัวอักษร)
        <textarea
          className={control}
          rows={3}
          maxLength={3000}
          value={reason}
          disabled={busy}
          onChange={(e) => {
            setReason(e.target.value);
            setFailure("");
          }}
        />
      </label>
      {failure ? <Alert error>{failure}</Alert> : null}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className={danger}
          disabled={busy || !ready || conflict}
          onClick={() => void submit()}
        >
          {busy ? "กำลังลบ…" : "ลบใบสมัครนี้"}
        </button>
        {conflict ? (
          <button
            type="button"
            className={`${button} w-full sm:w-auto`}
            onClick={() => {
              setConflict(false);
              setFailure("");
              operation.current = undefined;
              void reload();
            }}
          >
            โหลดข้อมูลล่าสุด
          </button>
        ) : null}
      </div>
    </section>
  );
}
