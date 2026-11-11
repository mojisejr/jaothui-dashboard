import Image from "next/image";
import { useOperationContinuation } from "../buffalo-feedback/useOperationContinuation";
import { EditProof } from "./EditStatus";
export { EditProof } from "./EditStatus";
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
const EDIT_SESSION_KEY = "buffalo-edit-active-operation";
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
type RetryMode = "autoPublication" | "autoReconcile";

function retryMode(job: Job): RetryMode | undefined {
  if (
    job.state === "BROADCAST_UNKNOWN" ||
    (job.state === "CHAIN_PENDING" && job.progress?.unknownRetry)
  )
    return "autoReconcile";
  if (
    job.state === "RECOVERY_REQUIRED" &&
    job.reason === "PUBLIC_ASSET_READBACK_PENDING"
  )
    return "autoPublication";
}

function preparingElsewhere(job: Job | null) {
  return (
    job?.state === "DRAFT" &&
    job.progress != null &&
    "preparing" in job.progress &&
    job.progress.preparing === true
  );
}
function pollStatus(job: Job | null) {
  if (!job) return false;
  const mode = retryMode(job);
  if (mode) {
    const retry =
      mode === "autoPublication"
        ? job.progress?.fileRetry
        : job.progress?.unknownRetry;
    // A list response omits progress. Poll the detailed view until it
    // supplies the schedule, including across a transient read failure.
    return (
      (mode === "autoPublication" && !job.progress) ||
      (!!retry && !retry.exhausted)
    );
  }
  return running(job) || preparingElsewhere(job);
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
    [restoreId, setRestoreId] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<Feedback | null>(null),
    [replacement, setReplacement] = useState<{
      id: string;
      field: EditField;
    } | null>(null),
    [authLost, setAuthLost] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null),
    progress = useRef<HTMLDivElement>(null),
    replaceDialog = useRef<HTMLDialogElement>(null),
    editorSection = useRef<HTMLElement>(null),
    pendingInput = useRef<{
      field: EditField;
      value: string;
      father: string;
      mother: string;
      file: File | null;
      id: string;
    } | null>(null),
    lock = useRef(false),
    key = useRef(""),
    frozen = useRef<Detail | null>(null),
    completed = useRef(""),
    dismissed = useRef(new Set<string>()),
    navigation = useRef(0);
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
    { id: job?.id ?? restoreId },
    {
      enabled: !!(job ?? restoreId) && !authLost,
      retry: false,
      refetchOnWindowFocus: true,
      refetchInterval: (pollStatus(job) || busy) && !authLost ? 3000 : false,
    },
  );
  const create = api.buffaloEdit.create.useMutation(),
    prepare = api.buffaloEdit.prepare.useMutation(),
    advance = api.buffaloEdit.advance.useMutation(),
    cancel = api.buffaloEdit.cancel.useMutation();
  const mode = job && retryMode(job);
  const retry =
    mode === "autoReconcile"
      ? job?.progress?.unknownRetry
      : mode === "autoPublication"
        ? job?.progress?.fileRetry
        : undefined;
  const retryDue = retry?.nextAt ?? null;
  // Re-rendering a poll snapshot must not restart a backoff interval.
  const autoDelay = React.useMemo(
    () => (retryDue ? Math.max(250, Date.parse(retryDue) - Date.now()) : 1500),
    [retryDue],
  );
  const preparing = preparingElsewhere(job);
  const autoContinuing =
    !!job &&
    !field &&
    !replacement &&
    !authLost &&
    !view.error &&
    !list.error &&
    !details.error &&
    !error &&
    (mode ? !!retry && !retry.exhausted : running(job));
  const searchDisabled = busy || authLost || autoContinuing || preparing;
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
      const [source, id] = (
        sessionStorage.getItem(EDIT_SESSION_KEY) ?? ""
      ).split("/");
      if (source === saved && id && /^[0-9a-f-]{36}$/i.test(id))
        setRestoreId(id);
    }
  }, []);
  useEffect(() => {
    if (!job || dismissed.current.has(job.id)) return;
    if (["COMPLETED", "CANCELLED"].includes(job.state)) {
      sessionStorage.removeItem(EDIT_SESSION_KEY);
      setRestoreId("");
    } else {
      sessionStorage.setItem(EDIT_SESSION_KEY, job.microchip + "/" + job.id);
    }
  }, [job]);
  useEffect(() => {
    if (view.data)
      setJob((previous) => {
        // A stale query for a different cow/operation must never take over.
        if (
          previous &&
          (previous.id !== view.data.id || previous.version > view.data.version)
        )
          return previous;
        if (dismissed.current.has(view.data.id)) return previous;
        const matchesSaved =
          restoreId === view.data.id && view.data.microchip === chip;
        return previous !== null ||
          matchesSaved ||
          view.data.actualToken === token
          ? view.data
          : null;
      });
  }, [view.data, token, restoreId, chip]);
  useEffect(() => {
    if (replacement) replaceDialog.current?.showModal();
    else replaceDialog.current?.close();
  }, [replacement]);
  useEffect(() => {
    if (list.data && !job) {
      const pending = list.data.find(
        (j) =>
          j.actualToken === token &&
          !dismissed.current.has(j.id) &&
          !["COMPLETED", "CANCELLED"].includes(j.state),
      );
      if (pending) setJob((previous) => previous ?? pending);
    }
  }, [list.data, job, token]);
  useEffect(() => {
    if (
      details.error?.data?.code === "UNAUTHORIZED" ||
      view.error?.data?.code === "UNAUTHORIZED" ||
      list.error?.data?.code === "UNAUTHORIZED"
    )
      setAuthLost(true);
  }, [details.error, view.error, list.error]);
  async function refreshPublished(current: Job) {
    const visit = navigation.current;
    const result = await utils.buffaloEdit.details.fetch(
      current.publishedMicrochip,
    );
    if (
      !result ||
      String(result.tokenId) !== current.actualToken ||
      result.microchip !== current.publishedMicrochip
    )
      throw Error("DETAIL_REFETCH_FAILED");
    if (visit !== navigation.current) return;
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
    const visit = navigation.current;
    try {
      await refreshPublished(job);
    } catch (cause) {
      if (visit !== navigation.current) return;
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
          const durable = job
            ? operations.find((j) => j.id === job.id)
            : operations.find(
                (j) => !["COMPLETED", "CANCELLED"].includes(j.state),
              );

          if (durable) {
            setJob((prev) =>
              prev?.id === durable.id && prev.version >= durable.version
                ? prev
                : durable,
            );
            if (
              field &&
              feedbackFor(e).code === "COW_ALREADY_RESERVED" &&
              durable.actualToken === token
            ) {
              pendingInput.current = {
                field,
                value,
                father,
                mother,
                file,
                id: durable.id,
              };
              dialog.current?.close();
              setField(null);
              // Show the actual saved request and its safe next action.
              setError(null);
            }
          }
        } catch {
          /* Saved request key and input remain available after re-auth. */
        }
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function resume(automatic = false) {
    if (
      !job ||
      preparing ||
      (mode && (!automatic || !retry || retry.exhausted))
    )
      return;
    await run(async () => {
      const latest =
        job.state === "DRAFT"
          ? await prepare.mutateAsync({ id: job.id, version: job.version })
          : job;
      if (
        latest.state === "DRAFT" ||
        latest.state === "CANCELLED" ||
        latest.state === "COMPLETED"
      ) {
        setJob(latest);
        return;
      }
      setJob(
        await advance.mutateAsync({
          id: latest.id,
          version: latest.version,
          ...(mode ? { mode } : {}),
        }),
      );
    });
  }
  useOperationContinuation({
    id: job?.id,
    state: job?.state,
    version: job?.version,
    enabled: autoContinuing && !busy,
    delay: autoDelay,
    resume: () => resume(true),
  });
  function open(next: EditField) {
    if (
      !details.data ||
      (!!active && !job?.canCancel) ||
      authLost ||
      !!details.error ||
      !!list.error ||
      details.data.writeAvailability?.available === false ||
      details.data.sync.status === "identity_conflict" ||
      details.data.sync.status === "unavailable"
    )
      return;
    if (active && job) {
      setReplacement({ id: job.id, field: next });
      return;
    }
    if (job) setJob(null);
    beginEditing(next, details.data);
  }
  function beginEditing(next: EditField, baseline: Detail) {
    frozen.current = baseline;
    key.current = crypto.randomUUID();
    setField(next);
    setValue(initial(baseline, next));
    setFather(baseline.fatherId === "N/A" ? "" : baseline.fatherId);
    setMother(baseline.motherId === "N/A" ? "" : baseline.motherId);
    setFile(null);
    setError(null);
    dialog.current?.showModal();
  }
  async function replaceDraft() {
    const request = replacement;
    if (
      !request ||
      !job ||
      !job.canCancel ||
      preparing ||
      authLost ||
      !!view.error ||
      !!list.error ||
      request.id !== job.id
    )
      return;
    setReplacement(null);
    await run(async () => {
      const cancelled = await cancel.mutateAsync({ id: job.id });
      if (cancelled.id !== job.id || cancelled.state !== "CANCELLED") {
        setJob(await apiView(job.id));
        return;
      }
      dismissed.current.add(job.id);
      setJob({
        ...job,
        state: "CANCELLED",
        version: cancelled.version,
        canCancel: false,
        canResume: false,
      });
      const baseline = await utils.buffaloEdit.details.fetch(job.microchip);
      if (
        !baseline ||
        String(baseline.tokenId) !== job.actualToken ||
        ["identity_conflict", "unavailable"].includes(baseline.sync.status) ||
        baseline.writeAvailability?.available === false
      )
        throw localFeedback("STALE_EDIT_RECORD", job.id);
      const refreshed = await list.refetch();
      if (refreshed?.error) throw refreshed.error;
      const pending = refreshed?.data?.find(
        (op) => !["CANCELLED", "COMPLETED"].includes(op.state),
      );
      if (pending) {
        setJob(pending);
        return;
      }
      setJob(null);
      utils.buffaloEdit.details.setData(baseline.microchip, baseline);
      beginEditing(request.field, baseline);
      const saved = pendingInput.current;
      if (saved?.id === job.id && saved.field === request.field) {
        setValue(saved.value);
        setFather(saved.father);
        setMother(saved.mother);
        setFile(saved.file);
        pendingInput.current = null;
        return;
      }
      if (
        job.fields.includes(request.field) &&
        !["image", "dna"].includes(request.field)
      ) {
        const previous = job.patch[request.field as keyof EditPatch];
        if (typeof previous === "string") setValue(previous);
      }
      if (request.field === "parents") {
        if (job.patch.fatherId !== undefined) setFather(job.patch.fatherId);
        if (job.patch.motherId !== undefined) setMother(job.patch.motherId);
      }
    });
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
      if (next.state === "READY")
        setJob(
          await advance.mutateAsync({ id: next.id, version: next.version }),
        );
    });
  }
  const utils = api.useUtils();
  async function apiView(id: string) {
    return utils.buffaloEdit.view.fetch({ id });
  }
  const queryError = view.error ?? list.error ?? details.error;
  const readError = authLost
    ? localFeedback("UNAUTHORIZED", job?.id)
    : queryError && job
      ? job.state === "COMPLETED"
        ? completedRefreshFeedback(queryError, job.id)
        : feedbackFor(queryError, {
            operationId: job.id,
            outcome: "not_started",
          })
      : null;
  function readStatus() {
    void run(async () => {
      if (view.error) {
        await view.refetch();
        return;
      }
      if (list.error) {
        await list.refetch();
        return;
      }
      if (details.error) {
        await details.refetch();
        return;
      }
      if (job) setJob(await apiView(job.id));
    });
  }
  const blocked =
    busy ||
    list.isPending ||
    !!list.error ||
    !!view.error ||
    !!details.error ||
    details.isFetching ||
    details.data?.writeAvailability?.available === false ||
    (!!active && (!job?.canCancel || autoContinuing || preparing)) ||
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
          if (searchDisabled) return;
          if (chip !== searchValue.trim()) {
            navigation.current++;
            sessionStorage.removeItem(EDIT_SESSION_KEY);
            setRestoreId("");
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
          disabled={searchDisabled}
          id="edit-search"
          className="input input-bordered input-primary min-h-12 w-full text-base"
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          required
        />
        <button className="btn btn-primary min-h-12" disabled={searchDisabled}>
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
      {chip &&
        !job &&
        !restoreId &&
        details.isSuccess &&
        details.data === null && (
          <p role="status" className="my-4">
            ไม่พบควายสำหรับ microchip {chip} กรุณาตรวจเลขแล้วค้นหาอีกครั้ง
          </p>
        )}
      {error && !field && !job && <FeedbackPanel feedback={error} />}
      {error && !field && !job && details.data && !details.error && (
        <IdentityDiagnosisLink
          microchip={details.data.microchip}
          code={error.code}
        />
      )}
      {queryError && !job && (
        <FeedbackPanel
          title={
            view.error
              ? "โหลดสถานะรายการไม่สำเร็จ"
              : list.error
                ? "โหลดรายการแก้ไขเดิมไม่สำเร็จ"
                : "โหลดรายละเอียดไม่สำเร็จ"
          }
          feedback={feedbackFor(queryError, { outcome: "not_started" })}
          onRetry={readStatus}
          retryLabel={
            view.error
              ? "โหลดสถานะรายการอีกครั้ง"
              : list.error
                ? "โหลดรายการแก้ไขเดิมอีกครั้ง"
                : "โหลดรายละเอียดอีกครั้ง"
          }
          busy={
            busy ||
            authLost ||
            view.isFetching ||
            list.isFetching ||
            details.isFetching
          }
        />
      )}
      {details.data && details.error && (
        <p role="status">
          กำลังแสดงข้อมูลที่เคยโหลดไว้ ยังยืนยันรายละเอียดล่าสุดไม่ได้
          จึงพักการแก้ไข
        </p>
      )}
      {token && list.isPending && (
        <p role="status">กำลังตรวจรายการแก้ไขเดิม ก่อนเปิดการแก้ไข…</p>
      )}
      {authLost && !job && (
        <Link href="/" className="btn btn-primary min-h-12">
          เข้าสู่ระบบอีกครั้ง
        </Link>
      )}
      {!field && (!!job || busy) && (
        <div
          ref={progress}
          tabIndex={-1}
          data-edit-progress
          aria-label="ความคืบหน้าการแก้ไข"
          className="outline-none"
        >
          {job ? (
            <EditProof
              job={job}
              busy={busy}
              autoContinuing={autoContinuing || preparing}
              stalled={
                !!mode &&
                !retry &&
                !view.isFetching &&
                (mode !== "autoPublication" || !!job.progress)
              }
              feedback={
                job.state === "COMPLETED"
                  ? (readError ??
                    (error?.code === "COMPLETED_REFRESH_FAILED" ? error : null))
                  : (readError ?? error)
              }
              onRetryRead={readStatus}
              onLogin={() => {
                window.location.assign("/");
              }}
              onResume={() => void resume()}
              onRefresh={() => void run(() => refreshPublished(job))}
              onDone={() => {
                navigation.current++;
                dismissed.current.add(job.id);
                setJob(null);
                setError(null);
                editorSection.current?.focus();
              }}
              onCancel={
                job.canCancel &&
                !preparing &&
                !authLost &&
                !view.error &&
                !list.error
                  ? () => {
                      const first =
                        pendingInput.current?.id === job.id
                          ? pendingInput.current.field
                          : (job.fields[0] as EditField | undefined);
                      if (!first) return;
                      setReplacement({
                        id: job.id,
                        field:
                          first === "fatherId" || first === "motherId"
                            ? "parents"
                            : first,
                      });
                    }
                  : undefined
              }
            />
          ) : (
            <p role="status">กำลังบันทึกคำขอ…</p>
          )}
        </div>
      )}
      <dialog
        ref={replaceDialog}
        className="modal"
        aria-labelledby="replace-edit-title"
        onCancel={() => setReplacement(null)}
      >
        <div className="modal-box max-w-md">
          <h2 id="replace-edit-title" className="text-lg font-semibold">
            ยกเลิกคำขอเดิมแล้วแก้ใหม่?
          </h2>
          {replacement && job && (
            <p className="my-3 break-words">
              คำขอเดิมของ {details.data?.name} #{job.actualToken} แก้
              {job.fields.map((f) => labels[f as EditField]).join(" และ ")}
              {job.fields
                .filter((f) => f !== "image" && f !== "dna")
                .map((f) => job.patch[f as keyof EditPatch])
                .filter(Boolean)
                .map((v, i) => (
                  <span key={i}> เป็น {v}</span>
                ))}{" "}
              เมื่อยกเลิกแล้วจะเปิดให้แก้{labels[replacement.field]}{" "}
              และตรวจค่าก่อนบันทึกอีกครั้ง
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              className="btn btn-outline"
              autoFocus
              type="button"
              onClick={() => setReplacement(null)}
            >
              เก็บคำขอเดิมไว้
            </button>
            <button
              className="btn btn-primary"
              type="button"
              disabled={
                busy || !replacement || !job?.canCancel || preparing || authLost
              }
              onClick={() => void replaceDraft()}
            >
              ยืนยันยกเลิกแล้วแก้ใหม่
            </button>
          </div>
        </div>
      </dialog>
      {details.data && (
        <section
          data-edit-details
          ref={editorSection}
          tabIndex={-1}
          className="mt-6 min-w-0"
        >
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
            {field && busy && <p role="status">กำลังบันทึกคำขอแก้ไข…</p>}
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
