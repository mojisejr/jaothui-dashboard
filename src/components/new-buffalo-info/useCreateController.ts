import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { api, type RouterOutputs } from "~/utils/api";
import { useOperationContinuation } from "../buffalo-feedback/useOperationContinuation";
import {
  draftFields,
  type DraftInput,
} from "~/server/services/buffalo-integrity/create/contract";
import {
  feedbackFor,
  isUnauthorized,
  validateImage,
  uploadResponse,
  type Feedback,
} from "../buffalo-feedback/feedback";
type Job = RouterOutputs["buffaloCreate"]["view"];
const empty: DraftInput = {
  name: "",
  microchip: "",
  certNo: "",
  origin: "",
  height: 0,
  color: "Black",
  sex: "Male",
  rarity: "Normal",
  birthday: "",
  fatherId: "",
  motherId: "",
  detail: "",
};
function continuation(job: Job | undefined) {
  if (!job || job.reason === "INTEGRITY_WRITES_PAUSED") return;
  if (
    job.state === "RECOVERY_REQUIRED" &&
    job.reason === "PUBLIC_ASSET_READBACK_PENDING"
  )
    return { mode: "autoPublication" as const, retry: job.progress?.fileRetry };
  if (
    job.state === "BROADCAST_UNKNOWN" ||
    (job.state === "CHAIN_PENDING" && job.progress?.unknownRetry)
  )
    return {
      mode: "autoReconcile" as const,
      retry: job.progress?.unknownRetry,
    };
  if (
    (job.state === "READY" && job.steps.some((s) => s.state === "RESERVED")) ||
    [
      "SIGNING",
      "CHAIN_PENDING",
      "CHAIN_STEPS",
      "PROJECTING",
      "VERIFYING",
    ].includes(job.state)
  )
    return { mode: undefined, retry: undefined };
}
// A transport failure may occur before a server attempt is journaled. Limit
// client retries separately; new durable progress starts a new observation.
function evidenceKey(job: Job | undefined) {
  const retry = continuation(job)?.retry;
  return job && [job.id, job.version, retry?.attempts ?? 0].join("/");
}
const transportLimit = 3;

export function useCreateController() {
  const [id, setId] = useState("");
  const [form, setForm] = useState<DraftInput>(empty);
  const [imagePreviewId, setImagePreviewId] = useState("");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<Feedback | null>(null);
  const errorEvidence = useRef<string>();
  const [failures, setFailures] = useState<{
    key: string;
    count: number;
  } | null>(null);
  const [observed, setObserved] = useState<Job | null>(null);
  const [authLost, setAuthLost] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const key = useRef<string>("");
  const list = api.buffaloCreate.list.useQuery(undefined, {
    enabled: !authLost,
    refetchOnWindowFocus: true,
    retry: false,
  });
  const view = api.buffaloCreate.view.useQuery(
    { id },
    {
      enabled: !!id && !authLost,
      refetchInterval: (query) =>
        !authLost &&
        !["COMPLETED", "CANCELLED", "NEEDS_REVIEW"].includes(
          query.state.data?.state ?? "",
        )
          ? 3000
          : false,
      retry: false,
    },
  );
  const create = api.buffaloCreate.create.useMutation();
  const revise = api.buffaloCreate.revise.useMutation();
  const prepare = api.buffaloCreate.prepare.useMutation();
  const advance = api.buffaloCreate.advance.useMutation();
  const job =
    observed?.id === id && (!view.data || observed.version > view.data.version)
      ? observed
      : view.data;
  useEffect(() => {
    if (
      list.error?.data?.code === "UNAUTHORIZED" ||
      view.error?.data?.code === "UNAUTHORIZED"
    )
      setAuthLost(true);
  }, [list.error, view.error]);
  const evidence = evidenceKey(job);
  const currentError =
    errorEvidence.current && errorEvidence.current !== evidence ? null : error;
  const step =
    !job || (editing && job.canEdit)
      ? 0
      : job.state === "DRAFT" && (!job.imageReady || job.id === imagePreviewId)
        ? 1
        : job.state === "DRAFT"
          ? 2
          : 3;
  useEffect(() => {
    const saved = localStorage.getItem("buffalo-create-operation");
    if (saved) setId(saved);
  }, []);
  useEffect(() => {
    if (!id && list.data && !localStorage.getItem("buffalo-create-operation")) {
      const active = list.data.find(
        (item) => !["COMPLETED", "CANCELLED"].includes(item.state),
      );
      if (active) choose(active.id);
    }
  }, [id, list.data]);
  function choose(next: string) {
    setError(null);
    errorEvidence.current = undefined;
    setFailures(null);
    setId(next);
    setImagePreviewId("");
    setEditing(false);
    localStorage.setItem("buffalo-create-operation", next);
  }
  async function run(callback: () => Promise<unknown>, automatic = false) {
    if (lock.current || authLost) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await callback();
      setFailures(null);
      if (
        result &&
        typeof result === "object" &&
        "state" in result &&
        "id" in result
      )
        setObserved(result as Job);
      const reachedGate =
        result &&
        typeof result === "object" &&
        "state" in result &&
        [
          "COMPLETED",
          "AWAITING_METADATA_ACTION",
          "NEEDS_REVIEW",
          "CANCELLED",
        ].includes(String(result.state));
      await Promise.all([
        id ? view.refetch() : Promise.resolve(),
        !automatic || reachedGate ? list.refetch() : Promise.resolve(),
      ]);
    } catch (e) {
      const problem = feedbackFor(e, { operationId: id || undefined });
      errorEvidence.current = evidence;
      setError(problem);
      if (isUnauthorized(e)) {
        setAuthLost(true);
      } else if (!id) {
        // Creation can commit even if its response is lost or another tab wins.
        // Restore the server's active row before allowing another draft.
        await list.refetch().catch(() => undefined);
      } else {
        const latest = await view.refetch().catch(() => undefined);
        if (latest?.data && evidence && evidenceKey(latest.data) !== evidence) {
          setError(null);
          setFailures(null);
        } else if (automatic && evidence) {
          const transient = [
            "CLIENT_RESPONSE_UNAVAILABLE",
            "STALE_OPERATION_REVISION",
            "ACCOUNT_OPERATION_BUSY",
            "WALLET_QUEUE_BUSY",
          ].includes(problem.code);
          setFailures((old) => ({
            key: evidence,
            count: transient
              ? 1 + (old?.key === evidence ? old.count : 0)
              : transportLimit,
          }));
        }
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const next = continuation(job);
  const automaticMode = next?.mode;
  const retry = next?.retry;
  const due = retry?.nextAt;
  const failureCount = failures?.key === evidence ? (failures?.count ?? 0) : 0;
  const automationStopped = failureCount >= transportLimit;
  const delay = useMemo(() => {
    const scheduled = due ? Math.max(250, Date.parse(due) - Date.now()) : 2000;
    return failureCount ? Math.max(scheduled, 5000 * failureCount) : scheduled;
  }, [due, failureCount]);
  const autoContinuing =
    !!next &&
    !authLost &&
    !view.error &&
    !list.error &&
    (!automaticMode || (!!retry && !retry.exhausted)) &&
    !automationStopped;
  async function action(action: "mint" | "metadata" | "resume") {
    if (!job || !!view.error || !!list.error || authLost) return;
    // Explicit gestures can only advance the corresponding unclaimed gate.
    if (action === "mint" && (job.state !== "READY" || job.steps.length))
      return;
    if (
      action === "metadata" &&
      (job.state !== "AWAITING_METADATA_ACTION" ||
        !job.actualToken ||
        !job.steps.some((s) => s.kind === "mint" && s.state === "CONFIRMED"))
    )
      return;
    if (
      action === "resume" &&
      (!!next ||
        !job.canResume ||
        job.state === "AWAITING_METADATA_ACTION" ||
        (job.state === "READY" &&
          !(job.reason === "INTEGRITY_WRITES_PAUSED" && job.steps.length > 0)))
    )
      return;
    await run(() =>
      advance.mutateAsync({ id: job.id, version: job.version, action }),
    );
  }
  useOperationContinuation({
    id: job?.id,
    state: job?.state,
    version: job?.version,
    enabled: autoContinuing && !busy,
    delay,
    resume: async () => {
      if (!job || !autoContinuing) return;
      await run(
        () =>
          advance.mutateAsync({
            id: job.id,
            version: job.version,
            action: "resume",
            ...(automaticMode ? { mode: automaticMode } : {}),
          }),
        true,
      );
    },
  });
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      list.isPending ||
      !!list.error ||
      !!view.error ||
      (id && (!editing || !job?.canEdit)) ||
      (!editing && active)
    )
      return;
    await run(async () => {
      const result =
        editing && job
          ? await revise.mutateAsync({
              id: job.id,
              version: job.version,
              input: form,
            })
          : await create.mutateAsync({
              key: key.current || (key.current = crypto.randomUUID()),
              input: form,
            });
      choose(result.id);
      setEditing(false);
      return result;
    });
  }
  async function upload(file: File | undefined) {
    if (!file || !job?.canEdit || job.prepared || view.error) return;
    const invalid = validateImage(file);
    if (invalid) {
      errorEvidence.current = evidence;
      setError(invalid);
      return;
    }
    await run(async () => {
      const response = await fetch(
        `/api/buffalo-create/image?id=${job.id}&version=${job.version}`,
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
      setImagePreviewId(job.id);
    });
  }
  function edit() {
    if (!job?.canEdit) return;
    const input = draftFields(job.input);
    setForm(input);
    setEditing(true);
  }
  async function replaceImage() {
    if (!job?.canEdit) return;
    const input = draftFields(job.input);
    await run(async () => {
      const next = await revise.mutateAsync({
        id: job.id,
        version: job.version,
        input,
        keepImage: false,
      });
      choose(next.id);
      return next;
    });
  }
  function fresh() {
    setId("");
    setObserved(null);
    setError(null);
    localStorage.removeItem("buffalo-create-operation");
    key.current = "";
    setForm(empty);
    setEditing(false);
  }
  const active = list.data?.find(
    (item) => !["COMPLETED", "CANCELLED"].includes(item.state),
  );
  return {
    id,
    form,
    setForm,
    editing,
    setEditing,
    error: currentError,
    automationStopped,
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
    autoContinuing,
    automaticMode,
    retry,
    reviewImage: () => setImagePreviewId(""),
  };
}
