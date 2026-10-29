import Image from "next/image";
import { useOperationContinuation } from "../buffalo-feedback/useOperationContinuation";
import { OperationProgress } from "../buffalo-feedback/OperationProgress";
import Link from "next/link";
import { IdentityDiagnosisLink } from "../buffalo-repair/IdentityDiagnosisLink";
import React, { useEffect, useRef, useState } from "react";
import { api, type RouterOutputs } from "~/utils/api";
import { type BusinessField } from "~/server/services/buffalo-integrity/field-policy";
import { type EditPatch } from "~/server/services/buffalo-integrity/edit/contract";
import { type IMetadata } from "~/interfaces/i-metadata";
import { FeedbackPanel } from "../buffalo-feedback/FeedbackPanel";
import {
  feedbackFor,
  localFeedback,
  completedRefreshFeedback,
  isUnauthorized,
  validateImage,
  uploadResponse,
  type Feedback,
} from "../buffalo-feedback/feedback";
type Detail = NonNullable<RouterOutputs["buffaloEdit"]["details"]>;
type Job = RouterOutputs["buffaloEdit"]["view"];
export type EditField = BusinessField | "parents";
const labels: Record<EditField, string> = {
  name: "ชื่อ",
  microchip: "microchip",
  certNo: "เลขใบรับรอง",
  origin: "แหล่งกำเนิด",
  color: "สี",
  sex: "เพศ",
  birthday: "วันเกิด",
  height: "ความสูง",
  detail: "รายละเอียด",
  rarity: "ระดับความหายาก",
  dna: "DNA",
  image: "รูปควาย",
  fatherId: "microchip พ่อ",
  motherId: "microchip แม่",
  parents: "ข้อมูลพ่อแม่",
};
const options: Partial<Record<EditField, string[]>> = {
  sex: ["Male", "Female"],
  rarity: ["Normal", "Rare", "Super Rare", "Super Special Rare"],
};
const fields: EditField[] = [
  "microchip",
  "name",
  "origin",
  "color",
  "detail",
  "sex",
  "birthday",
  "height",
  "certNo",
  "dna",
  "rarity",
  "parents",
];
const running = (job: Job) =>
  ![
    "DRAFT",
    "COMPLETED",
    "CANCELLED",
    "NEEDS_REVIEW",
    "RECOVERY_REQUIRED",
    "RETRYABLE",
  ].includes(job.state);
const stateText: Record<string, string> = {
  DRAFT: "เก็บคำขอแก้ไขแล้ว — ยังไม่ได้ส่งธุรกรรม",
  READY: "พร้อมดำเนินการแก้ไข",
  CHAIN_PENDING: "รอยืนยันธุรกรรมบน blockchain",
  BROADCAST_UNKNOWN: "กำลังตรวจสอบธุรกรรมเดิม",
  CHAIN_STEPS: "กำลังตรวจสอบขั้นตอนที่ยืนยันแล้ว",
  PROJECTING: "กำลังเผยแพร่ข้อมูลที่ตรวจสอบแล้ว",
  VERIFYING: "กำลังตรวจสอบข้อมูลหลังเผยแพร่",
  RECOVERY_REQUIRED: "ยังไม่สำเร็จ — ดำเนินการต่อรายการเดิม",
  RETRYABLE: "ยังไม่สำเร็จ — ดำเนินการต่อรายการเดิม",
  NEEDS_REVIEW: "รายการนี้ต้องตรวจสอบก่อนดำเนินการต่อ",
  COMPLETED: "แก้ไขช่องที่ร้องขอและตรวจสอบสำเร็จแล้ว",
  CANCELLED: "ยกเลิกคำขอที่ยังไม่ได้ส่งแล้ว",
};
export function EditProof({
  job,
  busy,
  onResume,
  onCancel,
}: {
  job: Job;
  busy: boolean;
  onResume: () => void;
  onCancel?: () => void;
}) {
  return (
    <section
      data-edit-operation={job.id}
      className="my-4 min-w-0 rounded-lg border border-primary p-4 text-base"
      aria-live="polite"
    >
      <p role="status">{stateText[job.state] ?? job.state}</p>
      <p className="break-all text-sm">
        รายการ {job.id} · NFT #{job.actualToken} · {job.microchip}
      </p>
      <p>
        ช่องที่แก้ไข:{" "}
        {job.fields.map((f) => labels[f as EditField] ?? f).join(", ")}
      </p>
      {job.environment === "local-fork" && (
        <p className="text-sm">หลักฐานจาก local/fork</p>
      )}
      {job.restorationPending && (
        <p>กำลังกู้คืน DNA เดิมหลังแก้ไข — ข้อมูลสาธารณะยังเป็นฉบับก่อนหน้า</p>
      )}
      {!!job.legacyDifferences &&
        Array.isArray(job.legacyDifferences) &&
        job.legacyDifferences.length > 0 && (
          <p className="text-sm">
            มีความต่างเดิมระหว่าง DB กับ blockchain ในช่องอื่น
            ระบบเก็บค่าเดิมไว้ การสำเร็จครอบคลุมช่องที่ร้องขอเท่านั้น
          </p>
        )}
      {job.diagnostic && <FeedbackPanel feedback={job.diagnostic} />}
      {job.reason && !job.diagnostic && (
        <FeedbackPanel
          feedback={feedbackFor(new Error(job.reason), { operationId: job.id })}
        />
      )}
      <IdentityDiagnosisLink
        microchip={job.microchip}
        code={job.diagnostic?.code ?? job.reason ?? undefined}
      />
      <details>
        <summary className="min-h-12 cursor-pointer py-3">
          หลักฐานธุรกรรม ({job.steps.length})
        </summary>
        {job.steps.map((s, i) => (
          <div key={i} className="mb-2 break-all text-sm">
            <span>
              {s.kind} · {s.state}
            </span>
            {s.hash &&
              (s.explorerUrl ? (
                <a
                  className="link block"
                  href={s.explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {s.hash}
                </a>
              ) : (
                <code className="block">{s.hash}</code>
              ))}
          </div>
        ))}
      </details>
      {(job.canResume || job.state === "DRAFT") && (
        <button
          type="button"
          className="btn btn-primary min-h-12"
          disabled={busy}
          onClick={onResume}
        >
          ดำเนินการต่อรายการเดิม
        </button>
      )}
      {job.canCancel && onCancel && (
        <button
          type="button"
          className="btn btn-outline min-h-12"
          disabled={busy}
          onClick={onCancel}
        >
          ยกเลิกคำขอที่ยังไม่ส่ง
        </button>
      )}
    </section>
  );
}
function initial(detail: IMetadata, field: EditField) {
  return field === "parents"
    ? ""
    : field === "birthday"
      ? detail.birthday.replaceAll("/", "-")
      : String(detail[field] ?? "");
}
export default function DurableEdit({
  dnaOnly = false,
}: {
  dnaOnly?: boolean;
}) {
  const [chip, setChip] = useState(""),
    [searchValue, setSearchValue] = useState("");
  const [field, setField] = useState<EditField | null>(null),
    [value, setValue] = useState(""),
    [father, setFather] = useState(""),
    [mother, setMother] = useState("");
  const [file, setFile] = useState<File | null>(null),
    [job, setJob] = useState<Job | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<Feedback | null>(null),
    [authLost, setAuthLost] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null),
    progress = useRef<HTMLDivElement>(null),
    lock = useRef(false),
    key = useRef(""),
    frozen = useRef<Detail | null>(null),
    completed = useRef("");
  const details = api.buffaloEdit.details.useQuery(chip, {
    enabled: !!chip && !authLost,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const token = details.data?.tokenId?.toString() ?? "";
  const list = api.buffaloEdit.list.useQuery(token, {
    enabled: !!token && !authLost,
    retry: false,
    refetchOnWindowFocus: true,
  });
  const view = api.buffaloEdit.view.useQuery(
    { id: job?.id ?? "" },
    {
      enabled: !!job && !authLost,
      retry: false,
      refetchInterval: job && job.state !== "COMPLETED" ? 3000 : false,
    },
  );
  const create = api.buffaloEdit.create.useMutation(),
    prepare = api.buffaloEdit.prepare.useMutation(),
    advance = api.buffaloEdit.advance.useMutation(),
    cancel = api.buffaloEdit.cancel.useMutation();
  const active = job && !["COMPLETED", "CANCELLED"].includes(job.state);
  useEffect(() => {
    if (!field && job?.id) progress.current?.focus();
  }, [field, job?.id]);
  useEffect(() => {
    const saved =
      new URLSearchParams(window.location.search).get("microchip") ??
      localStorage.getItem("buffalo-edit-search");
    if (saved) {
      setChip(saved);
      setSearchValue(saved);
    }
  }, []);
  useEffect(() => {
    if (view.data)
      setJob((previous) =>
        previous?.id === view.data.id && previous.version > view.data.version
          ? previous
          : view.data,
      );
  }, [view.data]);
  useEffect(() => {
    if (list.data && !job) {
      const pending = list.data.find(
        (j) => !["COMPLETED", "CANCELLED"].includes(j.state),
      );
      if (pending) setJob(pending);
    }
  }, [list.data, job]);
  useEffect(() => {
    if (
      details.error?.data?.code === "UNAUTHORIZED" ||
      view.error?.data?.code === "UNAUTHORIZED" ||
      list.error?.data?.code === "UNAUTHORIZED"
    )
      setAuthLost(true);
  }, [details.error, view.error, list.error]);
  async function refreshPublished(current: Job) {
    const result = await utils.buffaloEdit.details.fetch(
      current.publishedMicrochip,
    );
    if (!result) throw Error("DETAIL_REFETCH_FAILED");
    utils.buffaloEdit.details.setData(current.publishedMicrochip, result);
    setChip(current.publishedMicrochip);
    setSearchValue(current.publishedMicrochip);
    localStorage.setItem("buffalo-edit-search", current.publishedMicrochip);
    const refreshedList = await list.refetch();
    if (refreshedList?.error) throw refreshedList.error;
    completed.current = current.id;
  }
  const completedRef = useRef<() => Promise<void>>();
  completedRef.current = async () => {
    if (job?.state !== "COMPLETED" || completed.current === job.id) return;
    try {
      await refreshPublished(job);
    } catch (cause) {
      setError(completedRefreshFeedback(cause, job.id));
    }
  };
  useEffect(() => {
    void completedRef.current?.();
  }, [job?.state, job?.id]);
  async function run(fn: () => Promise<void>) {
    if (lock.current || authLost) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      if (isUnauthorized(e)) setAuthLost(true);
      setError(
        job?.state === "COMPLETED"
          ? completedRefreshFeedback(e, job.id)
          : feedbackFor(e, { operationId: job?.id }),
      );
      if (token) {
        try {
          const operations = await utils.buffaloEdit.list.fetch(token);
          const durable = operations.find(
            (j) => !["COMPLETED", "CANCELLED"].includes(j.state),
          );
          if (durable) setJob(durable);
        } catch {
          /* Saved request key and input remain available after re-auth. */
        }
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function resume() {
    if (!job) return;
    await run(async () => {
      const latest =
        job.state === "DRAFT"
          ? await prepare.mutateAsync({ id: job.id, version: job.version })
          : job;
      setJob(
        await advance.mutateAsync({ id: latest.id, version: latest.version }),
      );
    });
  }
  useOperationContinuation({
    id: job?.id,
    state: job?.state,
    version: job?.version,
    enabled:
      !!job && running(job) && !busy && !authLost && !view.error && !list.error,
    delay: 1500,
    resume,
  });
  function open(next: EditField) {
    if (
      !details.data ||
      !!active ||
      authLost ||
      !!details.error ||
      !!list.error ||
      details.data.writeAvailability?.available === false ||
      details.data.sync.status === "identity_conflict" ||
      details.data.sync.status === "unavailable"
    )
      return;
    frozen.current = details.data;
    key.current = crypto.randomUUID();
    setField(next);
    setValue(initial(details.data, next));
    setFather(details.data.fatherId === "N/A" ? "" : details.data.fatherId);
    setMother(details.data.motherId === "N/A" ? "" : details.data.motherId);
    setFile(null);
    setError(null);
    dialog.current?.showModal();
  }
  async function refreshBaseline() {
    if (!frozen.current) return;
    const previous = frozen.current;
    await run(async () => {
      const latest = await utils.buffaloEdit.details.fetch(previous.microchip);
      if (
        !latest ||
        latest.tokenId?.toString() !== previous.tokenId?.toString() ||
        ["identity_conflict", "unavailable"].includes(latest.sync.status) ||
        latest.writeAvailability?.available === false
      )
        throw localFeedback("STALE_EDIT_RECORD");
      if (field === "parents") {
        if (father === (previous.fatherId === "N/A" ? "" : previous.fatherId))
          setFather(latest.fatherId === "N/A" ? "" : latest.fatherId);
        if (mother === (previous.motherId === "N/A" ? "" : previous.motherId))
          setMother(latest.motherId === "N/A" ? "" : latest.motherId);
      }
      frozen.current = latest;
      utils.buffaloEdit.details.setData(previous.microchip, latest);
    });
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!field || !frozen.current) return;
    const selected = field,
      baseline = frozen.current;
    await run(async () => {
      if (file) {
        const invalid = validateImage(file);
        if (invalid) throw invalid;
      }
      const patch: EditPatch =
        selected === "parents"
          ? {
              ...(father !==
              (baseline.fatherId === "N/A" ? "" : baseline.fatherId)
                ? { fatherId: father }
                : {}),
              ...(mother !==
              (baseline.motherId === "N/A" ? "" : baseline.motherId)
                ? { motherId: mother }
                : {}),
            }
          : { [selected]: file ? "https://upload.invalid/pending" : value };
      if (!Object.keys(patch).length) throw localFeedback("NO_CHANGED_FIELDS");
      let next = await create.mutateAsync({
        key: key.current,
        microchip: baseline.microchip,
        tokenId: baseline.tokenId!.toString(),
        expectedRevision: baseline.revision,
        patch,
        ...(file !== null && ["image", "dna"].includes(selected)
          ? { upload: selected as "image" | "dna" }
          : {}),
      });
      setJob(next);
      if (file) {
        try {
          const response = await fetch(
            `/api/buffalo-create/image?kind=edit&id=${next.id}&version=${next.version}`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${localStorage.getItem("jaothui-jwt") ?? ""}`,
                "Content-Type": file.type,
              },
              body: file,
            },
          );
          await uploadResponse(response);
        } catch (cause) {
          throw feedbackFor(cause, {
            stage: "asset_upload",
            operationId: next.id,
          });
        }

        // Upload advances the durable revision; fetch this exact operation rather than a stale dialog query.
        next = await apiView(next.id);
      }
      setJob(next);
      // The request and any upload are saved. Show progress before slow chain
      // preparation, so an interrupted response cannot strand recovery behind a dialog.
      dialog.current?.close();
      setField(null);
      next = await prepare.mutateAsync({ id: next.id, version: next.version });
      setJob(next);
      setJob(await advance.mutateAsync({ id: next.id, version: next.version }));
    });
  }
  const utils = api.useUtils();
  async function apiView(id: string) {
    return utils.buffaloEdit.view.fetch({ id });
  }
  const blocked =
    busy ||
    list.isPending ||
    !!list.error ||
    !!details.error ||
    details.isFetching ||
    details.data?.writeAvailability?.available === false ||
    !!active ||
    authLost ||
    !details.data ||
    ["identity_conflict", "unavailable"].includes(details.data.sync.status);
  return (
    <main
      data-buffalo-edit
      className="mx-auto w-full min-w-0 max-w-3xl px-4 pb-12 pt-6 text-base sm:px-6"
    >
      <form
        className="grid gap-3 rounded-lg border border-primary p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (chip !== searchValue.trim()) {
            setJob(null);
            setError(null);
          }
          setChip(searchValue.trim());
          localStorage.setItem("buffalo-edit-search", searchValue.trim());
          if (chip === searchValue.trim()) void details.refetch();
        }}
      >
        <label htmlFor="edit-search">ค้นหาควายด้วย microchip</label>
        <input
          id="edit-search"
          className="input input-bordered input-primary min-h-12 w-full text-base"
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          required
        />
        <button
          className="btn btn-primary min-h-12"
          disabled={busy || authLost}
        >
          ค้นหา
        </button>
      </form>
      {!chip && !details.data && (
        <p role="status" className="my-4">
          กรอก microchip เพื่อค้นหาทะเบียน
        </p>
      )}
      {chip && details.isFetching && (
        <p role="status" className="my-4">
          กำลังค้นหาข้อมูลทะเบียน…
        </p>
      )}
      {chip && details.isSuccess && details.data === null && (
        <p role="status" className="my-4">
          ไม่พบควายสำหรับ microchip {chip} กรุณาตรวจเลขแล้วค้นหาอีกครั้ง
        </p>
      )}
      {error && !field && <FeedbackPanel feedback={error} />}
      {error && !field && details.data && !details.error && (
        <IdentityDiagnosisLink
          microchip={details.data.microchip}
          code={error.code}
        />
      )}
      {details.error && (
        <FeedbackPanel
          title="โหลดรายละเอียดไม่สำเร็จ"
          feedback={
            job?.state === "COMPLETED"
              ? completedRefreshFeedback(details.error, job.id)
              : feedbackFor(details.error, { outcome: "not_started" })
          }
          onRetry={() => {
            void details.refetch();
          }}
          retryLabel="โหลดรายละเอียดอีกครั้ง"
          busy={busy || authLost || details.isFetching}
        />
      )}
      {list.error && (
        <FeedbackPanel
          title="โหลดรายการแก้ไขเดิมไม่สำเร็จ"
          feedback={
            job?.state === "COMPLETED"
              ? completedRefreshFeedback(list.error, job.id)
              : feedbackFor(list.error, { outcome: "not_started" })
          }
          onRetry={() => {
            void list.refetch();
          }}
          retryLabel="โหลดรายการแก้ไขเดิมอีกครั้ง"
          busy={busy || authLost || list.isFetching}
        />
      )}
      {view.error && (
        <FeedbackPanel
          title="โหลดสถานะรายการไม่สำเร็จ"
          feedback={
            job?.state === "COMPLETED"
              ? completedRefreshFeedback(view.error, job.id)
              : feedbackFor(view.error, { operationId: job?.id })
          }
          onRetry={() => {
            void view.refetch();
          }}
          retryLabel="โหลดสถานะรายการอีกครั้ง"
          busy={busy || authLost || view.isFetching}
        />
      )}
      {details.data && details.error && (
        <p role="status">
          กำลังแสดงข้อมูลที่เคยโหลดไว้ ยังยืนยันรายละเอียดล่าสุดไม่ได้
          จึงพักการแก้ไข
        </p>
      )}
      {job && view.error && (
        <p role="status">
          สถานะด้านล่างเป็นข้อมูลที่เคยโหลดได้ กรุณาตรวจสถานะก่อนดำเนินการต่อ
        </p>
      )}
      {token && list.isPending && (
        <p role="status">กำลังตรวจรายการแก้ไขเดิม ก่อนเปิดการแก้ไข…</p>
      )}
      {authLost && (
        <Link href="/" className="btn btn-primary min-h-12">
          เข้าสู่ระบบอีกครั้ง
        </Link>
      )}
      {job?.state === "COMPLETED" && (
        <button
          type="button"
          className="btn btn-outline my-3 min-h-12"
          disabled={busy || authLost}
          onClick={() => void run(() => refreshPublished(job))}
        >
          โหลดรายละเอียดอีกครั้ง
        </button>
      )}
      {!field && (!!job || busy) && (
        <div
          ref={progress}
          tabIndex={-1}
          data-edit-progress
          aria-label="ความคืบหน้าการแก้ไข"
          className="outline-none"
        >
          <OperationProgress job={job} busy={busy} kind="edit" />
          {job && (
            <EditProof
              job={job}
              busy={busy || authLost || !!view.error || !!list.error}
              onResume={() => void resume()}
              onCancel={() =>
                void run(async () => {
                  await cancel.mutateAsync({ id: job.id });
                  setJob(null);
                  await list.refetch();
                })
              }
            />
          )}
        </div>
      )}
      {details.data && (
        <section data-edit-details className="mt-6 min-w-0">
          <p>
            NFT #{details.data.tokenId} ·{" "}
            <span className="break-all">{details.data.microchip}</span>
          </p>
          {details.data.writeAvailability?.diagnostic && (
            <FeedbackPanel
              title="อ่านทะเบียนได้ แต่ระบบบันทึกยังไม่พร้อม"
              feedback={details.data.writeAvailability.diagnostic}
              onRetry={() => {
                void details.refetch();
              }}
              retryLabel="ตรวจความพร้อมอีกครั้ง"
              busy={busy || authLost || details.isFetching}
            />
          )}
          {details.data.sync.diagnostic && (
            <FeedbackPanel
              feedback={details.data.sync.diagnostic}
              onRetry={
                details.data.sync.status === "unavailable"
                  ? () => {
                      void details.refetch();
                    }
                  : undefined
              }
              retryLabel="ตรวจ blockchain อีกครั้ง"
              busy={busy || authLost || details.isFetching}
            />
          )}
          {details.data.sync.status === "identity_conflict" &&
            !details.error && (
              <IdentityDiagnosisLink
                microchip={details.data.microchip}
                code={
                  details.data.sync.diagnostic?.code ?? details.data.sync.reason
                }
              />
            )}
          {["identity_conflict", "unavailable"].includes(
            details.data.sync.status,
          ) &&
            !details.data.sync.diagnostic && (
              <p role="alert" className="my-4">
                อ่านข้อมูลทะเบียนได้ แต่ยังยืนยันตัวตนบน blockchain ไม่ได้
                จึงพักการแก้ไข
              </p>
            )}
          {details.data.sync.status === "differences" && (
            <p className="my-3 text-sm">
              มีความต่างเดิมระหว่าง DB กับ blockchain
              การแก้ไขจะเปลี่ยนเฉพาะช่องที่เลือก
            </p>
          )}
          {details.data.image && (
            <div className="my-4">
              <Image
                width={840}
                height={600}
                unoptimized
                data-edit-image
                src={details.data.image}
                alt={`ควาย ${details.data.name}`}
                className="max-h-96 w-full object-contain"
              />
              <button
                type="button"
                className="btn btn-primary mt-2 min-h-12"
                disabled={blocked}
                onClick={() => open("image")}
              >
                แก้ไขรูปควาย
              </button>
            </div>
          )}
          {(dnaOnly ? (["dna"] as EditField[]) : fields).map((f) => (
            <div
              key={f}
              className="my-3 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-2"
            >
              <div className="min-w-0">
                <label htmlFor={`detail-${f}`} className="mb-1 block text-sm">
                  {labels[f]}
                </label>
                <input
                  id={`detail-${f}`}
                  className="input input-bordered input-primary min-h-12 w-full text-base"
                  value={
                    f === "parents"
                      ? `พ่อ ${details.data!.fatherId} / แม่ ${details.data!.motherId}`
                      : initial(details.data!, f)
                  }
                  readOnly
                />
              </div>
              <button
                data-edit-field={f}
                aria-label={`แก้ไข${labels[f]}`}
                type="button"
                disabled={blocked}
                className="btn btn-primary min-h-12"
                onClick={() => open(f)}
              >
                แก้ไข
              </button>
            </div>
          ))}
          <p className="text-sm">วันที่สร้างเดิม: {details.data.createdAt}</p>
        </section>
      )}
      <dialog ref={dialog} data-edit-dialog className="modal">
        <div className="modal-box w-[calc(100%-2rem)] max-w-lg rounded-lg p-4 text-base sm:p-6">
          <h2 className="mb-4 text-xl font-semibold">
            แก้ไข{field && labels[field]}
          </h2>
          <p className="mb-3 break-all text-sm">
            NFT #{frozen.current?.tokenId} · {frozen.current?.microchip}
          </p>
          <form onSubmit={submit}>
            {field && busy && (
              <OperationProgress job={job} busy={busy} kind="edit" />
            )}
            <fieldset disabled={busy || authLost} className="grid gap-3">
              {field === "parents" ? (
                <>
                  {(
                    [
                      ["father", father, setFather, "microchip พ่อ"],
                      ["mother", mother, setMother, "microchip แม่"],
                    ] as const
                  ).map(([id, v, set, label]) => (
                    <label key={id} htmlFor={`edit-${id}`}>
                      {label}
                      <input
                        id={`edit-${id}`}
                        className="input input-bordered input-primary mt-1 min-h-12 w-full text-base"
                        value={v}
                        onChange={(e) => set(e.target.value)}
                      />
                    </label>
                  ))}
                </>
              ) : (
                field && (
                  <>
                    {field !== "image" && (
                      <label htmlFor="edit-value">
                        {labels[field]}
                        {options[field] ? (
                          <select
                            id="edit-value"
                            className="select select-bordered select-primary mt-1 min-h-12 w-full text-base"
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                          >
                            {options[field].map((v) => (
                              <option key={v}>{v}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            id="edit-value"
                            type={
                              field === "birthday"
                                ? "date"
                                : field === "height"
                                  ? "number"
                                  : "text"
                            }
                            className="input input-bordered input-primary mt-1 min-h-12 w-full text-base"
                            value={value}
                            disabled={!!file}
                            onChange={(e) => setValue(e.target.value)}
                            required={
                              !["dna", "detail", "certNo"].includes(field)
                            }
                          />
                        )}
                      </label>
                    )}
                    {["image", "dna"].includes(field) && (
                      <label htmlFor="edit-file">
                        {field === "dna"
                          ? "อัปโหลดภาพ DNA หรือใส่ URL ด้านบน"
                          : "เลือกภาพควาย"}
                        <span className="mt-1 block text-sm">
                          JPEG / PNG ขนาดต่ำกว่า 2,000,000 ไบต์ (2 MB)
                        </span>
                        <input
                          id="edit-file"
                          className="file-input file-input-bordered file-input-primary mt-1 min-h-12 w-full text-base"
                          type="file"
                          accept="image/png,image/jpeg"
                          required={field === "image"}
                          onChange={(e) => {
                            const selected = e.target.files?.[0] ?? null;
                            setFile(selected);
                            setError(selected ? validateImage(selected) : null);
                          }}
                        />
                      </label>
                    )}
                  </>
                )
              )}
              {error && field && (
                <FeedbackPanel
                  feedback={error}
                  onRetry={
                    error.nextAction === "refresh_record"
                      ? () => {
                          void refreshBaseline();
                        }
                      : undefined
                  }
                  retryLabel="โหลดรายละเอียดล่าสุด"
                  busy={busy || authLost || details.isFetching}
                />
              )}
              {error && field && frozen.current && (
                <IdentityDiagnosisLink
                  microchip={frozen.current.microchip}
                  code={error.code}
                />
              )}
              <button
                className="btn btn-primary min-h-12"
                disabled={
                  busy ||
                  authLost ||
                  (!!file && !!validateImage(file)) ||
                  (!!active && job?.state !== "DRAFT")
                }
              >
                {busy ? "กำลังตรวจสอบและบันทึก..." : "ยืนยันการแก้ไข"}
              </button>
            </fieldset>
          </form>
          <button
            className="btn btn-outline mt-3 min-h-12"
            type="button"
            onClick={() => {
              dialog.current?.close();
              setField(null);
            }}
          >
            ปิด
          </button>
        </div>
      </dialog>
    </main>
  );
}
/** Compatibility export for earlier dialog imports; all edits now enter the same durable screen. */
export function DurableFieldDialog({
  metadata,
  field,
}: {
  metadata: IMetadata;
  field: EditField;
}) {
  return (
    <a
      className="btn btn-primary min-h-12"
      href={`/dashboard/update-buffalo-info?microchip=${encodeURIComponent(metadata?.microchip ?? "")}&field=${field}`}
    >
      แก้ไข{labels[field]}
    </a>
  );
}
