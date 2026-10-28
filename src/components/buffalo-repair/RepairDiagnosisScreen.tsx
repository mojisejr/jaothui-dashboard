import Link from "next/link";
import { FeedbackPanel } from "~/components/buffalo-feedback/FeedbackPanel";
import { RepairPreviewPanel } from "./RepairPreviewPanel";
import { RepairOperationProgress } from "./RepairOperationProgress";
import { useRepairExecution } from "./useRepairExecution";
import { feedbackFor } from "~/components/buffalo-feedback/feedback";
import {
  emptyTarget,
  proposalFor,
  useRepairPreview,
  type TargetDraft,
} from "./useRepairPreview";
const inputClass =
  "input input-bordered input-primary mt-1 min-h-12 w-full text-base";
export default function RepairDiagnosisScreen() {
  const controller = useRepairPreview();
  const execution = useRepairExecution();
  const {
    targets,
    setTargets,
    aliases,
    setAliases,
    scan,
    loaded,
    complete,
    expired,
    busy,
    paused,
    error,
    errorTask,
    preview,
    stale,
    step,
    setStep,
    readPages,
    pause,
    inspect,
  } = controller;
  const ready =
    !!preview &&
    preview.status === "ready_for_operator_review" &&
    !preview.blockers.length &&
    !stale;
  const needsFresh =
    !!error &&
    [
      "REPAIR_SCAN_EXPIRED",
      "REPAIR_SCAN_INVALID",
      "REPAIR_BASELINE_CHANGED",
    ].includes(error.code);
  function change(index: number, key: keyof TargetDraft, value: string) {
    setTargets((current) =>
      current.map((target, i) =>
        i === index ? { ...target, [key]: value } : target,
      ),
    );
  }
  return (
    <main
      className="mx-auto w-full min-w-0 max-w-3xl space-y-6 p-4 text-base sm:p-6"
      data-buffalo-repair
    >
      <header className="space-y-3">
        <h1 className="text-2xl font-semibold">ตรวจสอบตัวตนก่อนซ่อมทะเบียน</h1>
        <p>
          เปรียบเทียบทะเบียนกับ blockchain และหลักฐานควายจริง สำหรับครั้งละ 1
          หรือ 2 ตัว โดยไม่สมมติว่าต้องสลับเลขกัน
        </p>
        <p className="rounded-lg border border-primary p-3 font-medium">
          ขั้นตอนตรวจขอบเขตและข้อเสนอเป็นการอ่านเท่านั้น
          การซ่อมต้องเตรียมแผนจริงและยืนยันแผนก่อนเริ่ม
          {execution.capability.data && !execution.capability.data.singleOnly
            ? " การซ่อมคู่ใช้แผนและเลขรายการเดียวกันสำหรับทั้งสองตัว"
            : " ส่วนการซ่อมคู่ยังเปิดให้ตรวจอ่านเท่านั้น"}
        </p>
      </header>
      <RepairOperationProgress
        controller={execution}
        onFinished={() => {
          setStep(1);
          void readPages(true);
        }}
      />
      {execution.capability.error && (
        <FeedbackPanel
          feedback={feedbackFor(execution.capability.error, {
            outcome: "not_started",
          })}
          onRetry={() => void execution.capability.refetch()}
          retryLabel="ตรวจความพร้อมการซ่อมอีกครั้ง"
          busy={execution.capability.isFetching}
        />
      )}
      {!execution.capability.error && execution.capability.data?.diagnostic && (
        <FeedbackPanel feedback={execution.capability.data.diagnostic} />
      )}
      {!execution.capability.error &&
        execution.capability.data &&
        !execution.capability.data.canPrepare && (
          <p role="status" className="rounded-lg border border-warning p-3">
            ยังไม่เปิดรับรายการซ่อมใหม่ สามารถตรวจตัวตน ดูข้อเสนอ
            และติดตามรายการเดิมได้
          </p>
        )}
      <ol
        aria-label="ขั้นตอนตรวจสอบ"
        className="grid grid-cols-2 gap-2 sm:grid-cols-4"
      >
        {["ตรวจขอบเขต", "ยืนยันตัวตน", "ดูก่อน–หลัง", "สรุปตรวจทาน"].map(
          (label, index) => (
            <li key={label}>
              <button
                type="button"
                aria-current={step === index + 1 ? "step" : undefined}
                className={`min-h-12 w-full rounded-lg border p-3 text-sm ${step === index + 1 ? "border-primary text-primary" : "border-base-300"}`}
                disabled={
                  busy ||
                  (index === 1 && !complete) ||
                  (index === 2 && !preview) ||
                  (index === 3 && !ready)
                }
                onClick={() => setStep(index + 1)}
              >
                {index + 1}. {label}
              </button>
            </li>
          ),
        )}
      </ol>
      <p role="status" aria-live="polite" className="text-sm">
        ขั้นตอน {step} จาก 4
      </p>
      {expired && (
        <p role="alert" className="rounded-lg border border-warning p-4">
          หลักฐานชุดนี้หมดอายุแล้ว กรุณาเริ่มหลักฐานชุดใหม่
          ข้อมูลตัวตนที่กรอกยังอยู่
        </p>
      )}
      {error && (
        <FeedbackPanel
          feedback={error}
          onRetry={
            error.nextAction === "reauthenticate"
              ? undefined
              : () => {
                  if (needsFresh || errorTask === "start") void readPages(true);
                  else if (errorTask === "preview") void inspect();
                  else void readPages(false);
                }
          }
          retryLabel={
            needsFresh || errorTask === "start"
              ? "เริ่มอ่านหลักฐานชุดใหม่"
              : errorTask === "preview"
                ? "ตรวจข้อเสนอเดิมอีกครั้ง"
                : "อ่านหน้าที่ค้างอีกครั้ง"
          }
          busy={busy}
        />
      )}
      {error?.nextAction === "reauthenticate" && (
        <Link href="/" className="btn btn-primary min-h-12">
          เข้าสู่ระบบอีกครั้ง
        </Link>
      )}
      {stale && (
        <p role="alert" className="rounded-lg border border-warning p-4">
          ข้อเสนอที่แสดงเป็นฉบับเก่า
          เพราะข้อมูลหรือหลักฐานเปลี่ยนหรือยังตรวจซ้ำไม่สำเร็จ
          ต้องตรวจข้อเสนออีกครั้งก่อนเปิดสรุปตรวจทาน ข้อมูลที่กรอกยังอยู่
        </p>
      )}
      {step === 1 && (
        <section className="space-y-4 rounded-lg border border-primary p-4">
          <h2 className="text-xl font-semibold">1. อ่านขอบเขตที่ต้องตรวจซ้ำ</h2>
          <p>
            ระบบจะอ่านช่วง NFT ที่พิสูจน์ของสัญญาปัจจุบันเป็นหน้าสั้น ๆ
            แล้วใช้หลักฐานชุดเดียวกันเทียบฐานข้อมูลและชื่อไมโครชิปเดิมที่ทราบ
          </p>
          <p className="text-sm">
            ขอบเขตนี้ไม่ครอบคลุมสัญญาทะเบียนในอดีตที่ไม่ทราบ
            และไม่รับรองว่าค้นพบชื่อไมโครชิปเก่าทุกชื่อ
          </p>
          {scan && (
            <div className="space-y-2">
              <p className="break-all text-sm">เลขชุดตรวจ: {scan.pin.scanId}</p>
              <p>
                Block {scan.pin.blockNumber} · อ่านแล้ว {loaded} /{" "}
                {scan.pin.scanCount} รายการ
              </p>
              <progress
                aria-label="ความคืบหน้าการอ่านตัวตน"
                className="progress progress-primary w-full"
                max={scan.pin.scanCount || 1}
                value={scan.pin.scanCount ? loaded : complete ? 1 : 0}
              />
              <p className="text-sm">
                หลักฐานหมดอายุ:{" "}
                {new Date(scan.pin.expiresAt).toLocaleString("th-TH")}
              </p>
              <details>
                <summary className="min-h-12 cursor-pointer py-3">
                  ขอบเขตสัญญาและ block
                </summary>
                <p className="break-all text-sm">
                  Chain {scan.pin.chainId}
                  <br />
                  NFT {scan.pin.nft}
                  <br />
                  Manager {scan.pin.manager}
                  <br />
                  Block hash {scan.pin.blockHash}
                </p>
              </details>
            </div>
          )}
          <p role="status" aria-live="polite">
            {busy
              ? paused
                ? "กำลังหยุดหลังรับคำตอบของหน้าปัจจุบัน จะเก็บหลักฐานหน้าที่อ่านแล้วไว้"
                : "กำลังอ่านหลักฐานทีละหน้า…"
              : complete
                ? "อ่านหลักฐานในช่วงนี้ครบแล้ว พร้อมระบุตัวตนที่ถูกต้อง"
                : paused
                  ? "พักการอ่านแล้ว กลับมาอ่านต่อจากหน้าที่ค้างได้"
                  : scan
                    ? "ยังอ่านไม่ครบ กรุณาอ่านต่อด้วยชุดเดิม"
                    : "ยังไม่ได้เริ่มอ่านหลักฐาน"}
          </p>
          <div className="flex flex-wrap gap-3">
            {!scan && (
              <button
                className="btn btn-primary min-h-12"
                disabled={busy}
                onClick={() => void readPages(true)}
              >
                เริ่มตรวจขอบเขต
              </button>
            )}
            {busy && (
              <button
                className="btn btn-outline min-h-12"
                disabled={paused}
                onClick={pause}
              >
                พักการอ่าน
              </button>
            )}
            {scan && !complete && !busy && (
              <button
                className="btn btn-primary min-h-12"
                onClick={() => void readPages(false)}
              >
                อ่านต่อจากหน้าที่ค้าง
              </button>
            )}
            {scan && !busy && (
              <button
                className="btn btn-outline min-h-12"
                onClick={() => void readPages(true)}
              >
                เริ่มหลักฐานชุดใหม่
              </button>
            )}
            {complete && (
              <button
                className="btn btn-primary min-h-12"
                disabled={busy}
                onClick={() => setStep(2)}
              >
                ไปยืนยันตัวตน
              </button>
            )}
          </div>
        </section>
      )}
      {step === 2 && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">
            2. ระบุตัวตนที่หลักฐานยืนยัน
          </h2>
          <p>
            ระบุทะเบียนที่ต้องแก้ และ microchip ↔ NFT ที่ควรเป็นจริงจากหลักฐาน
            ห้ามเลือกตาม DB หรือ blockchain เพียงฝ่ายเดียว
          </p>
          <fieldset disabled={busy} className="flex flex-wrap gap-3">
            <legend className="mb-2 text-sm">
              จำนวนควายที่ต้องตรวจในข้อเสนอเดียว
            </legend>
            {[1, 2].map((count) => (
              <label
                key={count}
                className="flex min-h-12 items-center gap-2 rounded-lg border border-base-300 px-3"
              >
                <input
                  className="radio-primary radio"
                  type="radio"
                  name="repair-count"
                  value={count}
                  checked={targets.length === count}
                  onChange={() =>
                    setTargets((current) =>
                      count === 1
                        ? current.slice(0, 1)
                        : [...current, emptyTarget()].slice(0, 2),
                    )
                  }
                />
                {count} ตัว
              </label>
            ))}
          </fieldset>
          <form onSubmit={(event) => void inspect(event)} className="space-y-5">
            {targets.map((target, index) => (
              <fieldset
                key={index}
                disabled={busy}
                className="grid gap-4 rounded-lg border border-primary p-4 sm:grid-cols-2"
              >
                <legend className="px-2 text-lg font-semibold">
                  ควายตัวที่ {index + 1}
                </legend>
                <label htmlFor={`repair-source-${index}`}>
                  microchip ในทะเบียนที่จะตรวจ
                  <input
                    id={`repair-source-${index}`}
                    className={inputClass}
                    value={target.sourceMicrochip}
                    onChange={(event) =>
                      change(index, "sourceMicrochip", event.target.value)
                    }
                    maxLength={128}
                    required
                  />
                  <span className="mt-1 block text-sm">
                    คัดลอกค่าเดิมตรงตามทะเบียน สูงสุด 128 ตัวอักษร
                    อาจเป็นเลขที่พิมพ์ผิดหรือมีช่องว่าง ระบบไม่ตัดช่องว่างออก
                  </span>
                </label>
                <label htmlFor={`repair-chip-${index}`}>
                  microchip ที่ถูกต้องจากหลักฐาน
                  <input
                    id={`repair-chip-${index}`}
                    className={inputClass}
                    value={target.desiredMicrochip}
                    onChange={(event) =>
                      change(index, "desiredMicrochip", event.target.value)
                    }
                    inputMode="numeric"
                    pattern="[0-9]{15}"
                    maxLength={15}
                    required
                  />
                </label>
                <label htmlFor={`repair-token-${index}`}>
                  NFT ที่เป็นของควายตัวนี้
                  <input
                    id={`repair-token-${index}`}
                    className={inputClass}
                    value={target.desiredTokenId}
                    onChange={(event) =>
                      change(index, "desiredTokenId", event.target.value)
                    }
                    inputMode="numeric"
                    pattern="[1-9][0-9]*"
                    maxLength={78}
                    required
                  />
                </label>
                <label htmlFor={`repair-evidence-kind-${index}`}>
                  ชนิดหลักฐาน
                  <select
                    id={`repair-evidence-kind-${index}`}
                    className="select select-bordered select-primary mt-1 min-h-12 w-full text-base"
                    value={target.evidenceKind}
                    onChange={(event) =>
                      change(index, "evidenceKind", event.target.value)
                    }
                  >
                    <option value="physical_scan">
                      อ่านจากเครื่องอ่านไมโครชิป
                    </option>
                    <option value="registration_document">
                      เอกสารทะเบียนที่ยืนยันตัวตน
                    </option>
                  </select>
                </label>
                <label
                  htmlFor={`repair-evidence-${index}`}
                  className="sm:col-span-2"
                >
                  เลขอ้างอิงและรายละเอียดหลักฐาน
                  <input
                    id={`repair-evidence-${index}`}
                    className={inputClass}
                    value={target.evidenceReference}
                    onChange={(event) =>
                      change(index, "evidenceReference", event.target.value)
                    }
                    maxLength={300}
                    required
                  />
                  <span className="mt-1 block text-sm">
                    เช่น เลขเอกสาร หรือบันทึกการอ่านชิปและวันที่
                    ไม่ใส่รหัสผ่านหรือข้อมูลลับ
                  </span>
                </label>
                <label
                  htmlFor={`repair-previous-${index}`}
                  className="sm:col-span-2"
                >
                  microchip เดิมบน blockchain ที่หลักฐานยืนยัน (เมื่อระบบร้องขอ)
                  <input
                    id={`repair-previous-${index}`}
                    className={inputClass}
                    value={target.previousCanonical}
                    onChange={(event) =>
                      change(index, "previousCanonical", event.target.value)
                    }
                    maxLength={128}
                  />
                  <span className="mt-1 block text-sm">
                    กรอกค่าที่พบให้ตรงทุกตัวอักษรเฉพาะเมื่อยืนยันว่าเป็นตัวเดียวกัน
                    อาจเป็นค่าที่พิมพ์ผิดเดิม จึงไม่บังคับ 15 หลัก
                  </span>
                </label>
              </fieldset>
            ))}
            <label htmlFor="repair-aliases" className="block">
              ชื่อไมโครชิปเดิมที่ทราบ (ถ้ามี)
              <textarea
                id="repair-aliases"
                className="textarea textarea-bordered textarea-primary mt-1 min-h-24 w-full text-base"
                value={aliases}
                onChange={(event) => setAliases(event.target.value)}
                disabled={busy}
                maxLength={2579}
              />
              <span className="mt-1 block text-sm">
                หนึ่งค่าต่อบรรทัด สูงสุด 20 ค่า ค่าละไม่เกิน 128 ตัวอักษร
                คัดลอกให้ตรงทุกตัวอักษร รวมช่องว่างหรือเครื่องหมายจุลภาค
                บรรทัดว่างจะถูกข้าม ระบบจะตรวจเพิ่มเติมกับชื่อเดิมที่พบเองด้วย
              </span>
            </label>
            <button
              type="submit"
              className="btn btn-primary min-h-12"
              disabled={busy || !complete || expired}
            >
              {busy ? "กำลังตรวจตัวตนและข้อเสนอ…" : "ตรวจข้อเสนอและดูก่อน–หลัง"}
            </button>
          </form>
        </section>
      )}
      {step === 3 && preview && (
        <section className="space-y-5">
          <RepairPreviewPanel preview={preview} />
          <div className="flex flex-wrap gap-3">
            <button
              className="btn btn-outline min-h-12"
              disabled={busy}
              onClick={() => setStep(2)}
            >
              กลับไปตรวจข้อมูลและหลักฐาน
            </button>
            <button
              className="btn btn-primary min-h-12"
              disabled={busy || !ready}
              onClick={() => setStep(4)}
            >
              เปิดสรุปสำหรับตรวจทาน
            </button>
          </div>
          {!ready && (
            <p className="text-sm">
              เปิดสรุปไม่ได้จนกว่าจะตรวจข้อขัดข้องและได้ข้อเสนอฉบับปัจจุบัน
              ไม่สามารถข้ามการตรวจหรือเพิ่มตัวที่สามอัตโนมัติ
            </p>
          )}
        </section>
      )}
      {step === 4 && preview && (
        <section
          className="space-y-4 rounded-lg border border-primary p-4"
          data-repair-review
        >
          <h2 className="text-xl font-semibold">4. สรุปข้อเสนอสำหรับผู้ดูแล</h2>
          <p>
            ขอบเขต {preview.manifest.changes.length} ตัว · แก้ฐานข้อมูล{" "}
            {
              preview.manifest.changes.filter((change) => change.databaseChange)
                .length
            }{" "}
            ตัว · แก้บน blockchain{" "}
            {
              preview.manifest.changes.filter((change) => change.chainChange)
                .length
            }{" "}
            ตัว
          </p>
          <p className="break-all text-sm">
            รหัสข้อเสนอที่ตรวจทาน: {preview.digest}
          </p>
          <p>
            นี่เป็นข้อเสนอจากการตรวจอ่าน ยังไม่ใช่คำสั่งซ่อม
            ต้องเตรียมแผนที่ผูกเลขรายการและไฟล์จริง พร้อมค่าธรรมเนียมสูงสุด
            แล้วตรวจทานก่อนยืนยันการซ่อม
          </p>
          <p>
            บัญชีเข้าสู่ระบบนี้เป็นบัญชีร่วม
            การตรวจทานหน้านี้ไม่ได้พิสูจน์สิทธิ์แยกรายบุคคล
          </p>
          {!execution.pending && (
            <p className="font-medium">
              ยังไม่มีการแก้ข้อมูลหรือส่งธุรกรรมจากข้อเสนอนี้
            </p>
          )}
          {targets.length === 2 &&
            (execution.capability.data?.singleOnly ?? true) && (
              <p className="rounded-lg border border-warning p-3">
                การซ่อมสองตัวยังอยู่ในโหมดตรวจอ่าน
                สามารถตรวจหลักฐานและก่อน–หลังได้ แต่ยังเริ่มซ่อมไม่ได้
              </p>
            )}
          {execution.pending && (
            <p>
              กำลังติดตามเลขรายการเดิมด้านบน หากยังไม่พบแผน
              สามารถตรวจหลักฐานชุดใหม่แล้วเตรียมต่อด้วยเลขเดิม
              ระบบจะอ่านสถานะเดิมก่อน และไม่เปลี่ยนแผนที่บันทึกไว้แล้ว
            </p>
          )}
          {(targets.length === 1 || !execution.capability.data?.singleOnly) &&
            !execution.view && (
              <button
                className="btn btn-primary min-h-12"
                disabled={
                  !ready ||
                  busy ||
                  execution.busy ||
                  execution.storageBlocked ||
                  !execution.capability.data?.canPrepare
                }
                onClick={() => {
                  if (scan && ready)
                    void (
                      execution.pending
                        ? execution.refreshPreparation
                        : execution.prepare
                    )({
                      scan: scan.scan,
                      pages: controller.pages.map((page) => page.receipt),
                      proposal: proposalFor(targets, aliases),
                    });
                }}
              >
                {execution.pending
                  ? "ตรวจสถานะเดิมแล้วเตรียมจากหลักฐานชุดนี้"
                  : "เตรียมแผนจริงสำหรับตรวจทาน"}
              </button>
            )}
          {execution.capability.isLoading && (
            <p role="status">
              กำลังตรวจความพร้อมของการซ่อม การตรวจอ่านยังใช้งานได้
            </p>
          )}
          <button
            className="btn btn-outline min-h-12"
            onClick={() => setStep(3)}
          >
            กลับไปดูก่อน–หลัง
          </button>
        </section>
      )}
    </main>
  );
}
