import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, type RouterOutputs } from "~/utils/api";
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
const pending = (job: Job) =>
  ![
    "DRAFT",
    "READY",
    "AWAITING_METADATA_ACTION",
    "COMPLETED",
    "CANCELLED",
    "NEEDS_REVIEW",
    "RECOVERY_REQUIRED",
    "RETRYABLE",
  ].includes(job.state);
export function useCreateController() {
  const [id, setId] = useState("");
  const [form, setForm] = useState<DraftInput>(empty);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<Feedback | null>(null);
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
      refetchInterval: authLost ? false : 3000,
      retry: false,
    },
  );
  const create = api.buffaloCreate.create.useMutation();
  const revise = api.buffaloCreate.revise.useMutation();
  const prepare = api.buffaloCreate.prepare.useMutation();
  const advance = api.buffaloCreate.advance.useMutation();
  const job =
    observed?.id === id && (!view.data || observed.version >= view.data.version)
      ? observed
      : view.data;
  useEffect(() => {
    if (
      list.error?.data?.code === "UNAUTHORIZED" ||
      view.error?.data?.code === "UNAUTHORIZED"
    )
      setAuthLost(true);
  }, [list.error, view.error]);
  const step =
    !job || editing ? 0 : !job.imageReady ? 1 : !job.prepared ? 2 : 3;
  useEffect(() => {
    const saved = localStorage.getItem("buffalo-create-operation");
    if (saved) setId(saved);
  }, []);
  useEffect(() => {
    if (!id && list.data) {
      const active = list.data.find(
        (item) => !["COMPLETED", "CANCELLED"].includes(item.state),
      );
      if (active) choose(active.id);
    }
  }, [id, list.data]);
  function choose(next: string) {
    setId(next);
    setEditing(false);
    localStorage.setItem("buffalo-create-operation", next);
  }
  async function run(callback: () => Promise<unknown>) {
    if (lock.current || authLost) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await callback();
      if (
        result &&
        typeof result === "object" &&
        "state" in result &&
        "id" in result
      )
        setObserved(result as Job);
      await Promise.all([
        id ? view.refetch() : Promise.resolve(),
        list.refetch(),
      ]);
    } catch (e) {
      if (isUnauthorized(e)) setAuthLost(true);
      setError(feedbackFor(e, { operationId: id || undefined }));
      if (id) await view.refetch();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function action(action: "mint" | "metadata" | "resume") {
    if (!job) return;
    await run(() =>
      advance.mutateAsync({ id: job.id, version: job.version, action }),
    );
  }
  const actionRef = useRef(action);
  actionRef.current = action;
  // Poll only reconciles a durable transaction/progress after the operator has chosen each explicit button.
  useEffect(() => {
    if (
      !job ||
      !pending(job) ||
      busy ||
      authLost ||
      !!view.error ||
      !!list.error
    )
      return;
    const timer = setTimeout(() => {
      void actionRef.current("resume");
    }, 2000);
    return () => clearTimeout(timer);
  }, [job, busy, authLost, view.error, list.error]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
    if (!file || !job) return;
    const invalid = validateImage(file);
    if (invalid) {
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
  };
}
