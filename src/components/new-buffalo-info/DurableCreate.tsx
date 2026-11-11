import Link from "next/link";
import Image from "next/image";
import { useCreateController } from "./useCreateController";
import { createStatus } from "./status";
import { FeedbackPanel } from "../buffalo-feedback/FeedbackPanel";
import { CreateProgress, CreateSupportCopy } from "./CreateProgress";
import {
  feedbackFor,
  completedRefreshFeedback,
} from "../buffalo-feedback/feedback";
const fields = [
  ["name", "ชื่อควาย", "text"],
  ["microchip", "ไมโครชิป (15 หลัก)", "text"],
  ["certNo", "เลขใบรับรอง", "text"],
  ["origin", "แหล่งกำเนิด", "text"],
  ["height", "ส่วนสูง (ซม.)", "number"],
  ["birthday", "วันเกิด", "date"],
  ["fatherId", "ไมโครชิปพ่อ (ถ้ามี)", "text"],
  ["motherId", "ไมโครชิปแม่ (ถ้ามี)", "text"],
  ["detail", "รายละเอียด", "text"],
] as const;
const labels: Record<string, string> = {
  ...Object.fromEntries(fields.map(([key, label]) => [key, label])),
  color: "สี",
  sex: "เพศ",
  rarity: "ระดับความหายาก",
  issuedOn: "วันที่ออกทะเบียน",
};
const choices: Record<string, string> = {
  Black: "ดำ",
  Albino: "เผือก",
  Male: "ผู้",
  Female: "เมีย",
  Normal: "ปกติ",
  Rare: "หายาก",
  "Super Rare": "หายากมาก",
  "Super Special Rare": "หายากพิเศษ",
};
export default function DurableCreate() {
  const {
    id,
    form,
    setForm,
    editing,
    setEditing,
    error,
    busy,
    list,
    view,
    prepare,
    job,
    step,
    choose,
    run,
    action,
    save,
    upload,
    edit,
    fresh,
    replaceImage,
    reviewImage,
    autoContinuing,
    automationStopped,
    automaticMode,
    active,
    authLost,
  } = useCreateController();
  const listProblem =
    list.error &&
    (job?.state === "COMPLETED"
      ? completedRefreshFeedback(list.error, job.id)
      : feedbackFor(list.error, { outcome: "not_started" }));
  const viewProblem =
    view.error &&
    (job?.state === "COMPLETED"
      ? completedRefreshFeedback(view.error, job.id)
      : feedbackFor(view.error, { operationId: id }));
  const beforeProblem = error ?? job?.diagnostic;
  const supportBeforeMint = beforeProblem?.nextAction === "contact_support";
  const cannotChangeDraft = busy || authLost || !!list.error || !!view.error;
  return (
    <main
      data-buffalo-create
      className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-6"
    >
      <h1 className="text-2xl font-semibold">เพิ่มควายตัวใหม่</h1>
      <ol aria-label="ขั้นตอน" className="grid grid-cols-4 gap-1 sm:gap-2">
        {["ข้อมูลควาย", "รูปภาพ", "ตรวจทาน", "ขึ้นทะเบียน"].map((label, i) => (
          <li
            key={label}
            aria-current={step === i ? "step" : undefined}
            className={`border-t-4 py-2 text-sm ${step === i ? "border-primary text-primary" : i < step ? "border-success" : "border-base-300"}`}
          >
            {i + 1}. {label}
          </li>
        ))}
      </ol>
      {step !== 3 && (
        <>
          {authLost && (
            <div aria-live="polite">
              <p>เซสชันหมดอายุ เข้าสู่ระบบแล้วเปิดรายการเดิม</p>
              <Link className="btn btn-primary" href="/">
                เข้าสู่ระบบอีกครั้ง
              </Link>
            </div>
          )}
          {beforeProblem && !authLost && (
            <section
              aria-label="ปัญหาในการเตรียมทะเบียน"
              role="alert"
              className="space-y-3 rounded-xl border border-warning/50 p-4"
            >
              <p>{beforeProblem.reason}</p>
              {supportBeforeMint && (
                <CreateSupportCopy
                  key={beforeProblem.requestId ?? beforeProblem.code}
                  job={job}
                  identity={job?.input ?? form}
                  problems={[beforeProblem]}
                  description="เตรียมข้อมูลก่อนสร้าง NFT"
                />
              )}
            </section>
          )}
          {list.isPending && (
            <p role="status">กำลังโหลดรายการเดิม ก่อนเริ่มรายการใหม่…</p>
          )}
          {id && !job && view.isFetching && (
            <p role="status">กำลังโหลดสถานะรายการเดิม…</p>
          )}
          {list.error && (
            <FeedbackPanel
              showCopy={false}
              title="โหลดรายการที่บันทึกไว้ไม่สำเร็จ"
              feedback={listProblem!}
              onRetry={() => {
                void list.refetch();
              }}
              retryLabel="โหลดรายการที่บันทึกไว้อีกครั้ง"
              busy={busy || authLost || list.isFetching}
            />
          )}
          {view.error && (
            <FeedbackPanel
              showCopy={false}
              title="โหลดสถานะรายการไม่สำเร็จ"
              feedback={viewProblem!}
              onRetry={() => {
                void view.refetch();
              }}
              retryLabel="โหลดสถานะรายการเดิมอีกครั้ง"
              busy={busy || authLost || view.isFetching}
            />
          )}
          {job && view.error && (
            <p role="status">
              ข้อมูลรายการด้านล่างเป็นข้อมูลล่าสุดที่เคยโหลดได้
              ยังยืนยันสถานะปัจจุบันไม่ได้
            </p>
          )}
        </>
      )}
      {step === 0 && (!id || !!job) && (
        <form
          onSubmit={(event) => void save(event)}
          className="grid grid-cols-1 gap-4 rounded-xl border border-base-content/25 bg-base-100 p-4 sm:grid-cols-2 sm:p-6"
        >
          {fields.map(([name, label, type]) => (
            <div
              key={name}
              className={name === "detail" ? "sm:col-span-2" : ""}
            >
              <label className="label text-sm" htmlFor={`create-${name}`}>
                {label}
              </label>
              <input
                id={`create-${name}`}
                type={type}
                className="input input-bordered w-full"
                value={form[name]}
                required={[
                  "name",
                  "microchip",
                  "origin",
                  "birthday",
                  "height",
                ].includes(name)}
                min={type === "number" ? 0 : undefined}
                step={type === "number" ? 1 : undefined}
                pattern={name === "microchip" ? "[0-9]{15}" : undefined}
                disabled={cannotChangeDraft}
                onChange={(e) =>
                  setForm({
                    ...form,
                    [name]:
                      type === "number"
                        ? Number(e.target.value)
                        : e.target.value,
                  })
                }
              />
            </div>
          ))}
          {(["color", "sex", "rarity"] as const).map((name) => (
            <div key={name}>
              <label className="label text-sm" htmlFor={`create-${name}`}>
                {labels[name]}
              </label>
              <select
                id={`create-${name}`}
                className="select select-bordered w-full"
                value={form[name]}
                disabled={cannotChangeDraft}
                onChange={(e) => setForm({ ...form, [name]: e.target.value })}
              >
                {(name === "color"
                  ? ["Black", "Albino"]
                  : name === "sex"
                    ? ["Male", "Female"]
                    : ["Normal", "Rare", "Super Rare", "Super Special Rare"]
                ).map((value) => (
                  <option key={value} value={value}>
                    {choices[value]}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <div className="flex flex-wrap gap-3 sm:col-span-2">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={
                busy ||
                authLost ||
                !!view.error ||
                list.isPending ||
                !!list.error ||
                (!editing && !!active)
              }
            >
              บันทึกร่างและเพิ่มรูป
            </button>
            {editing && (
              <button
                type="button"
                className="btn btn-outline"
                disabled={cannotChangeDraft}
                onClick={() => setEditing(false)}
              >
                ยกเลิกการแก้ไข
              </button>
            )}
          </div>
          {!!active && !editing && (
            <p className="text-warning sm:col-span-2">
              มีรายการที่ยังไม่เสร็จ กรุณาดำเนินการรายการเดิมก่อน
            </p>
          )}
        </form>
      )}
      {job && (step === 1 || step === 2) && (
        <section className="space-y-4 rounded-xl border border-primary/50 p-4">
          <p className="break-all font-medium">
            {job.input.name} · {job.microchip}
          </p>
          {step === 1 && !job.imageReady && (
            <>
              <label htmlFor="create-image" className="label">
                รูปควาย JPEG / PNG ขนาดน้อยกว่า 2 MB
              </label>
              <input
                id="create-image"
                type="file"
                accept="image/jpeg,image/png"
                className="file-input file-input-bordered w-full"
                disabled={cannotChangeDraft}
                onChange={(e) => void upload(e.target.files?.[0])}
              />
            </>
          )}
          {job.imageReady && (
            <Image
              unoptimized
              width={768}
              height={512}
              data-create-image
              src={job.imageUrl}
              alt={`รูปควาย ${job.input.name}`}
              className="mx-auto h-auto max-h-80 w-full rounded-lg object-contain"
            />
          )}
          {step === 1 && job.imageReady && (
            <button
              className="btn btn-primary min-h-12"
              disabled={cannotChangeDraft}
              onClick={reviewImage}
            >
              ใช้รูปนี้และตรวจทาน
            </button>
          )}
          {step === 2 && (
            <>
              <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {Object.entries(job.input)
                  .filter(([key]) => Object.hasOwn(labels, key))
                  .map(([key, value]) => (
                    <div key={key} className="break-words">
                      <dt className="text-sm text-base-content/70">
                        {labels[key]}
                      </dt>
                      <dd>
                        {(["sex", "color", "rarity"].includes(key)
                          ? choices[String(value)]
                          : undefined) ??
                          (String(value) || "—")}
                      </dd>
                    </div>
                  ))}
              </dl>
              <p>
                ตรวจชื่อ ไมโครชิป และรูปก่อนยืนยัน ขั้นถัดไปคุณจะได้กดสร้าง NFT
              </p>
              <button
                className="btn btn-primary"
                disabled={cannotChangeDraft}
                onClick={() =>
                  void run(() =>
                    prepare.mutateAsync({ id: job.id, version: job.version }),
                  )
                }
              >
                ยืนยันข้อมูลและตรวจความพร้อม
              </button>
            </>
          )}
          {job.canEdit && (
            <div className="flex flex-wrap gap-3">
              <button
                className="btn btn-outline"
                disabled={cannotChangeDraft}
                onClick={edit}
              >
                ย้อนกลับแก้ไขข้อมูล
              </button>
              {job.imageReady && (
                <button
                  className="btn btn-outline"
                  disabled={cannotChangeDraft}
                  onClick={() => void replaceImage()}
                >
                  เปลี่ยนรูปภาพ
                </button>
              )}
            </div>
          )}
        </section>
      )}
      {step === 3 && job && (
        <CreateProgress
          automationStopped={automationStopped}
          key={job.id}
          job={job}
          busy={busy}
          authLost={authLost}
          readError={viewProblem ?? listProblem ?? null}
          problems={[error, viewProblem, listProblem, job.diagnostic]}
          retryRead={() => void (viewProblem ? view.refetch() : list.refetch())}
          retryLabel={
            viewProblem
              ? "โหลดสถานะรายการเดิมอีกครั้ง"
              : "โหลดรายการที่บันทึกไว้อีกครั้ง"
          }
          autoContinuing={autoContinuing}
          automaticMode={automaticMode}
          action={action}
          fresh={fresh}
          edit={edit}
        />
      )}
      {!!list.data?.length && (
        <details className="pt-2">
          <summary className="cursor-pointer text-sm">
            รายการที่บันทึกไว้
          </summary>
          <label className="sr-only" htmlFor="create-job">
            รายการที่บันทึกไว้
          </label>
          <select
            id="create-job"
            className="select select-bordered w-full"
            value={id}
            disabled={busy || authLost}
            onChange={(e) => choose(e.target.value)}
          >
            <option value="">เลือกรายการ</option>
            {list.data.map((item) => (
              <option key={item.id} value={item.id}>
                {item.input.name} · {item.microchip} ·{" "}
                {createStatus(item.state)}
              </option>
            ))}
          </select>
        </details>
      )}
      {step !== 3 && busy && (
        <p role="status" className="text-primary">
          กำลังดำเนินการ กรุณารอ…
        </p>
      )}
    </main>
  );
}
