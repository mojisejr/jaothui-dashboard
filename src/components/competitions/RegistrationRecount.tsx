import { useRef, useState } from "react";
import { api } from "~/utils/api";
import { type RecountResult } from "~/lib/competition-applications";
import { type Competition } from "~/lib/competitions";
import { Alert, button } from "./Workspace";

function recountMessage(result: RecountResult) {
  if (!result.changed)
    return `จำนวนผู้สมัครถูกต้องแล้ว (${result.registrationCount} รายการ)`;
  const unlocked =
    result.registrationCount === 0 ? " ตอนนี้แก้รุ่นและกติกาได้ตามปกติ" : "";
  return `ปรับจำนวนผู้สมัครจาก ${result.previousCount ?? "ไม่ทราบ"} เป็น ${result.registrationCount} รายการแล้ว${unlocked}`;
}

export function RegistrationRecount({ event }: { event: Competition }) {
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState("");
  const operation = useRef<{ fingerprint: string; id: string }>();
  const recount = api.competitions.recountRegistrations.useMutation();
  const utils = api.useUtils();
  const op = (fingerprint: string) => {
    if (operation.current?.fingerprint !== fingerprint)
      operation.current = { fingerprint, id: crypto.randomUUID() };
    return operation.current.id;
  };
  async function run() {
    if (recount.isPending) return;
    setMessage("");
    setFailure("");
    try {
      const result = await recount.mutateAsync({
        id: event._id,
        expectedRevision: event._rev,
        operationId: op(`recount:${event._id}:${event._rev}`),
      });
      setMessage(recountMessage(result));
      await utils.competitions.get.invalidate({ id: event._id });
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "ตรวจนับไม่สำเร็จ");
      if ((e as { data?: { code?: string } })?.data?.code === "CONFLICT")
        await utils.competitions.get.invalidate({ id: event._id });
    }
  }
  return (
    <div className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={`${button} w-full sm:w-auto`}
          disabled={recount.isPending}
          onClick={() => void run()}
        >
          {recount.isPending ? "กำลังตรวจนับ…" : "ตรวจนับผู้สมัครใหม่"}
        </button>
        <p className="min-w-0 break-words text-sm text-text-muted">
          ใช้เมื่อจำนวนผู้สมัครที่แสดงไม่ตรงกับใบสมัครจริง
        </p>
      </div>
      <p aria-live="polite" className="break-words text-sm">
        {message}
      </p>
      {failure ? <Alert error>{failure}</Alert> : null}
    </div>
  );
}
