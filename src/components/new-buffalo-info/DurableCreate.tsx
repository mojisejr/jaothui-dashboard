import Link from "next/link";
import Image from "next/image";
import { useCreateController } from "./useCreateController";
import { createStatus, stepLabel, stepStatus } from "./status";
import { FeedbackPanel } from "../buffalo-feedback/FeedbackPanel";
import {
  feedbackFor,
  completedRefreshFeedback,
} from "../buffalo-feedback/feedback";
const fields = [
  ["name", "Buffalo Name", "text"],
  ["microchip", "Buffalo Microchip (15 digits)", "text"],
  ["certNo", "Cert No.", "text"],
  ["origin", "Origin", "text"],
  ["height", "Height (cm)", "number"],
  ["birthday", "Birthdate", "date"],
  ["fatherId", "Father microchip (optional)", "text"],
  ["motherId", "Mother microchip (optional)", "text"],
  ["detail", "Detail", "text"],
] as const;
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
    active,
    authLost,
  } = useCreateController();
  return (
    <main
      data-buffalo-create
      className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-6"
    >
      <p role="status" aria-live="polite" className="text-base">
        {authLost
          ? "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่ รายการเดิมยังอยู่"
          : job
            ? createStatus(job.state)
            : "เตรียมเพิ่มข้อมูลควาย"}
      </p>
      {authLost && (
        <Link className="btn btn-primary" href="/">
          เข้าสู่ระบบอีกครั้ง
        </Link>
      )}
      <h1 className="text-2xl font-semibold">เพิ่มข้อมูลควาย</h1>
      <p className="text-base">
        บันทึกข้อมูล → รูปภาพ → ตรวจสอบ → Mint NFT และ Mint Metadata
      </p>
      <ol
        aria-label="ขั้นตอน"
        className="grid grid-cols-2 gap-2 sm:grid-cols-4"
      >
        {["ข้อมูลควาย", "รูปภาพ", "ตรวจสอบข้อมูล", "บันทึกบล็อกเชน"].map(
          (label, i) => (
            <li
              key={label}
              aria-current={step === i ? "step" : undefined}
              className={`rounded-lg border p-3 text-sm ${step === i ? "border-primary text-primary" : "border-base-300"}`}
            >
              {i + 1}. {label}
            </li>
          ),
        )}
      </ol>
      {error && <FeedbackPanel feedback={error} />}
      {list.isPending && (
        <p role="status">กำลังโหลดรายการเดิม ก่อนเริ่มรายการใหม่…</p>
      )}
      {id && view.isFetching && <p role="status">กำลังโหลดสถานะรายการเดิม…</p>}
      {list.error && (
        <FeedbackPanel
          title="โหลดรายการที่บันทึกไว้ไม่สำเร็จ"
          feedback={
            job?.state === "COMPLETED"
              ? completedRefreshFeedback(list.error, job.id)
              : feedbackFor(list.error, { outcome: "not_started" })
          }
          onRetry={() => {
            void list.refetch();
          }}
          retryLabel="โหลดรายการที่บันทึกไว้อีกครั้ง"
          busy={busy || authLost || list.isFetching}
        />
      )}
      {view.error && (
        <FeedbackPanel
          title="โหลดสถานะรายการไม่สำเร็จ"
          feedback={
            job?.state === "COMPLETED"
              ? completedRefreshFeedback(view.error, job.id)
              : feedbackFor(view.error, { operationId: id })
          }
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
      {!!list.data?.length && (
        <section>
          <label className="label" htmlFor="create-job">
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
                {item.microchip} · {createStatus(item.state)}
              </option>
            ))}
          </select>
        </section>
      )}
      {step === 0 && (
        <form
          onSubmit={(event) => void save(event)}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
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
                disabled={busy || authLost || !!view.error}
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
                {name}
              </label>
              <select
                id={`create-${name}`}
                className="select select-bordered w-full"
                value={form[name]}
                disabled={busy || authLost || !!view.error}
                onChange={(e) => setForm({ ...form, [name]: e.target.value })}
              >
                {(name === "color"
                  ? ["Black", "Albino"]
                  : name === "sex"
                    ? ["Male", "Female"]
                    : ["Normal", "Rare", "Super Rare", "Super Special Rare"]
                ).map((value) => (
                  <option key={value}>{value}</option>
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
              บันทึกข้อมูลและไปต่อ
            </button>
            {editing && (
              <button
                type="button"
                className="btn btn-outline"
                disabled={busy || authLost || !!view.error}
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
      {job && step > 0 && (
        <section className="space-y-4 rounded-xl border border-primary/50 p-4">
          <p className="break-all font-medium">
            {job.input.name} · {job.microchip}
          </p>
          <p className="text-sm">
            สถานะ: <strong data-create-state>{createStatus(job.state)}</strong>{" "}
            · Revision {job.version}
            {job.actualToken && (
              <>
                {" "}
                · Token <strong data-actual-token>{job.actualToken}</strong>
              </>
            )}
          </p>
          {job.environment === "local-fork" && (
            <p className="text-sm text-warning">
              สภาพแวดล้อมทดสอบ local fork · ธุรกรรมไม่ขึ้น mainnet
            </p>
          )}
          {job.diagnostic && <FeedbackPanel feedback={job.diagnostic} />}
          {job.reason && !job.diagnostic && (
            <FeedbackPanel
              feedback={feedbackFor(new Error(job.reason), {
                operationId: job.id,
              })}
            />
          )}
          {step === 1 && (
            <>
              <label htmlFor="create-image" className="label">
                รูปควาย JPEG / PNG ขนาดน้อยกว่า 2 MB
              </label>
              <input
                id="create-image"
                type="file"
                accept="image/jpeg,image/png"
                className="file-input file-input-bordered w-full"
                disabled={busy || authLost || !!view.error}
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
          {step === 2 && (
            <>
              <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {Object.entries(job.input)
                  .filter(([key]) => !["version", "image", "dna"].includes(key))
                  .map(([key, value]) => (
                    <div key={key} className="break-words">
                      <dt className="text-sm text-base-content/70">{key}</dt>
                      <dd>{String(value) || "—"}</dd>
                    </div>
                  ))}
              </dl>
              <p>ยังไม่มีข้อมูลในทะเบียนสาธารณะ ตรวจสอบก่อนเตรียม Mint</p>
              <button
                className="btn btn-primary"
                disabled={busy || authLost || !!view.error}
                onClick={() =>
                  void run(() =>
                    prepare.mutateAsync({ id: job.id, version: job.version }),
                  )
                }
              >
                ยืนยันข้อมูลและเตรียม Mint
              </button>
            </>
          )}
          {step === 3 && (
            <>
              <p>
                1. Mint NFT เพื่อรับ Token จริง แล้วรอยืนยันธุรกรรม
                <br />
                2. กด Mint Metadata เพื่อบันทึกข้อมูลและตรวจความตรงกัน
                ก่อนเผยแพร่ทะเบียน
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  data-mint-nft
                  className="btn btn-primary"
                  disabled={
                    busy ||
                    authLost ||
                    !!view.error ||
                    job.steps.some((step) => step.kind === "mint") ||
                    job.state !== "READY"
                  }
                  onClick={() => void action("mint")}
                >
                  Mint NFT
                </button>
                <button
                  data-mint-metadata
                  className="btn btn-primary"
                  disabled={
                    busy ||
                    authLost ||
                    !!view.error ||
                    job.state !== "AWAITING_METADATA_ACTION"
                  }
                  onClick={() => void action("metadata")}
                >
                  Mint Metadata
                </button>
              </div>
              <ul className="space-y-3">
                {job.steps.map((step, index) => (
                  <li key={index} className="break-all text-sm">
                    <span>
                      {stepLabel(step.kind)} · {stepStatus(step.state)}
                    </span>
                    {step.hash && (
                      <>
                        <br />
                        {job.environment === "local-fork" ? (
                          <code>{step.hash} (local fork)</code>
                        ) : (
                          <a
                            className="link link-primary"
                            href={step.explorerUrl ?? undefined}
                            target="_blank"
                            rel="noreferrer"
                          >
                            ดูธุรกรรม {step.hash}
                          </a>
                        )}
                      </>
                    )}
                  </li>
                ))}
              </ul>
              {["RECOVERY_REQUIRED", "RETRYABLE", "BROADCAST_UNKNOWN"].includes(
                job.state,
              ) && (
                <button
                  className="btn btn-outline"
                  disabled={busy || authLost || !!view.error}
                  onClick={() => void action("resume")}
                >
                  ดำเนินการต่อรายการเดิม
                </button>
              )}
              {job.state === "COMPLETED" && (
                <div role="status" className="space-y-3">
                  <p className="text-success">
                    เสร็จสมบูรณ์ ตรวจข้อมูลบล็อกเชน ฐานข้อมูล และไฟล์แล้ว
                  </p>
                  <a
                    className="link link-primary"
                    href={job.publishedImageUrl ?? undefined}
                    target="_blank"
                    rel="noreferrer"
                  >
                    ดูรูปที่เผยแพร่
                  </a>
                  <br />
                  <button
                    className="btn btn-primary"
                    disabled={busy || authLost || !!view.error}
                    onClick={fresh}
                  >
                    เพิ่มควายตัวถัดไป
                  </button>
                </div>
              )}
            </>
          )}
          {job.canEdit && (
            <div className="flex flex-wrap gap-3">
              <button
                className="btn btn-outline"
                disabled={busy || authLost || !!view.error}
                onClick={edit}
              >
                ย้อนกลับแก้ไขข้อมูล
              </button>
              {job.imageReady && (
                <button
                  className="btn btn-outline"
                  disabled={busy || authLost || !!view.error}
                  onClick={() => void replaceImage()}
                >
                  เปลี่ยนรูปภาพก่อน Mint
                </button>
              )}
            </div>
          )}
          <p className="break-all text-sm text-base-content/70">
            เลขรายการ {job.id} · ปิดหน้าแล้วกลับมาดำเนินการต่อได้
          </p>
        </section>
      )}
      {busy && (
        <p role="status" className="text-primary">
          กำลังดำเนินการ กรุณารอ…
        </p>
      )}
    </main>
  );
}
