import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { api } from "~/utils/api";
import {
  feedbackFor,
  completedRefreshFeedback,
  type Feedback,
} from "~/components/buffalo-feedback/feedback";
import type {
  RepairExecutionView,
  RepairPrepareInput,
} from "~/server/services/buffalo-integrity/repair/execution-contract";

export const REPAIR_PENDING_KEY = "jaothui:repair-pending:v1";
const pendingSchema = z
  .object({
    version: z.literal(1),
    key: z.string().uuid(),
    id: z.string().uuid().optional(),
  })
  .strict()
  .refine((value) => !value.id || value.id === value.key);
type Pending = z.infer<typeof pendingSchema>;
type Prepare = Omit<RepairPrepareInput, "key">;
export const repairTerminal = (view: RepairExecutionView | null) =>
  !!view && ["COMPLETED", "CANCELLED"].includes(view.state);
function localProblem(
  code: string,
  reason: string,
  operationId?: string,
): Feedback {
  return {
    code,
    reason,
    operationId,
    stage: "operation",
    outcome: "unknown",
    nextAction: "contact_support",
  };
}

/** Persist only the operation reference. The server remains the authority for approval and progress. */
export function useRepairExecution() {
  const utils = api.useUtils();
  const initialUtils = useRef(utils);
  const capability = api.buffaloRepair.capability.useQuery(undefined, {
    retry: false,
  });
  const prepareMutation = api.buffaloRepair.prepare.useMutation();
  const approveMutation = api.buffaloRepair.approve.useMutation();
  const advanceMutation = api.buffaloRepair.advance.useMutation();
  const cancelMutation = api.buffaloRepair.cancel.useMutation();
  const [pending, setPending] = useState<Pending | null>(null);
  const [view, setView] = useState<RepairExecutionView | null>(null);
  const [busy, setBusy] = useState(true);
  const [uncertain, setUncertain] = useState(false);
  const [storageBlocked, setStorageBlocked] = useState(false);
  const [error, setError] = useState<Feedback | null>(null);
  const active = useRef<Pending | null>(null),
    current = useRef<RepairExecutionView | null>(null);
  const lock = useRef(true),
    original = useRef<RepairPrepareInput | null>(null);
  const accepted = (result: RepairExecutionView) => {
    if (
      !active.current ||
      result.key !== active.current.key ||
      result.id !== active.current.key
    )
      throw localProblem(
        "REPAIR_RESPONSE_MISMATCH",
        "คำตอบไม่ตรงกับเลขรายการที่กำลังตรวจ กรุณาแจ้งผู้ดูแล",
        active.current?.key,
      );
    // A persisted key is already sufficient for reload even if a later storage write fails.
    const next: Pending = { ...active.current, id: result.id };
    active.current = next;
    setPending(next);
    try {
      localStorage.setItem(REPAIR_PENDING_KEY, JSON.stringify(next));
    } catch {
      /* Initial key remains authoritative. */
    }
    current.current = result;
    setView(result);
    setUncertain(false);
    setError(null);
    return result;
  };
  const failed = (cause: unknown) => {
    setUncertain(true);
    setError(
      current.current?.state === "COMPLETED"
        ? completedRefreshFeedback(cause, current.current.id)
        : feedbackFor(cause, {
            stage: "operation",
            outcome: "unknown",
            operationId: active.current?.key,
          }),
    );
  };
  async function lookup() {
    const item = active.current;
    if (!item) return null;
    const result = item.id
      ? await utils.buffaloRepair.view.fetch({ id: item.id })
      : await utils.buffaloRepair.getByKey.fetch({ key: item.key });
    if (result) return accepted(result);
    setUncertain(true);
    setError(
      localProblem(
        "REPAIR_PREPARE_UNCONFIRMED",
        "ยังไม่พบรายการที่ยืนยันได้ กรุณาตรวจเลขรายการเดิมอีกครั้งก่อนเตรียมซ้ำ ข้อมูลอาจยังอยู่ระหว่างรับคำขอ",
        item.key,
      ),
    );
    return null;
  }
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const raw = localStorage.getItem(REPAIR_PENDING_KEY);
        if (!raw) return;
        const item = pendingSchema.parse(JSON.parse(raw));
        active.current = item;
        if (mounted) {
          setPending(item);
          setUncertain(true);
        }
        const result = await initialUtils.current.buffaloRepair.getByKey.fetch({
          key: item.key,
        });
        if (!mounted) return;
        if (result) accepted(result);
        else
          setError(
            localProblem(
              "REPAIR_PREPARE_UNCONFIRMED",
              "ยังไม่พบรายการเดิมที่ยืนยันได้ กรุณาตรวจเลขรายการเดิมอีกครั้ง หากยังไม่พบ ให้ส่งเลขรายการนี้ให้ผู้ดูแลตรวจ ห้ามเริ่มเลขรายการใหม่จนทราบผล",
              item.key,
            ),
          );
      } catch (cause) {
        if (!mounted) return;
        if (!active.current) {
          setStorageBlocked(true);
          setError(
            localProblem(
              "REPAIR_RECOVERY_DATA_INVALID",
              "อ่านข้อมูลกู้คืนในเครื่องไม่ได้ กรุณาแจ้งผู้ดูแลเพื่อตรวจรายการเดิมก่อนเริ่มใหม่",
            ),
          );
        } else failed(cause);
      } finally {
        if (mounted) {
          lock.current = false;
          setBusy(false);
        }
      }
    })();
    return () => {
      mounted = false;
    };
    // Restore once per mount; subsequent reads are explicit and never create an operation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function refresh() {
    if (lock.current || !active.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await lookup();
    } catch (cause) {
      failed(cause);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function prepare(input: Prepare) {
    if (
      lock.current ||
      storageBlocked ||
      !capability.data?.canPrepare ||
      (capability.data.singleOnly && input.proposal.targets.length !== 1)
    )
      return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      if (active.current) {
        if (await lookup()) return;
        // The first request is immutable in this tab. A changed form never replaces it.
        if (!original.current) return;
      } else {
        const item: Pending = { version: 1, key: crypto.randomUUID() };
        localStorage.setItem(REPAIR_PENDING_KEY, JSON.stringify(item)); // Must succeed before any write request.
        active.current = item;
        setPending(item);
        original.current = { ...input, key: item.key };
      }
      setUncertain(true);
      accepted(await prepareMutation.mutateAsync(original.current));
    } catch (cause) {
      failed(cause);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function action(kind: "approve" | "advance" | "cancel") {
    const item = current.current;
    if (lock.current || uncertain || !item) return;
    if (
      (kind === "approve" &&
        (!item.canApprove || !capability.data?.canApprove)) ||
      (kind === "advance" && !item.canResume) ||
      (kind === "cancel" && !item.canCancel)
    )
      return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const result =
        kind === "approve"
          ? await approveMutation.mutateAsync({
              id: item.id,
              manifestHash: item.manifestHash,
              expectedVersion: item.version,
            })
          : kind === "advance"
            ? await advanceMutation.mutateAsync({
                id: item.id,
                expectedVersion: item.version,
              })
            : await cancelMutation.mutateAsync({ id: item.id });
      accepted(result);
      // The single case approval also starts work. A lost response never triggers another write.
      if (kind === "approve" && result.canResume)
        accepted(
          await advanceMutation.mutateAsync({
            id: result.id,
            expectedVersion: result.version,
          }),
        );
    } catch (cause) {
      failed(cause);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function finish() {
    if (lock.current || uncertain || !repairTerminal(current.current)) return;
    try {
      localStorage.removeItem(REPAIR_PENDING_KEY);
      active.current = null;
      current.current = null;
      original.current = null;
      setPending(null);
      setView(null);
      setError(null);
    } catch (cause) {
      failed(cause);
    }
  }
  return {
    capability,
    pending,
    view,
    busy,
    uncertain,
    storageBlocked,
    error,
    refresh,
    prepare,
    action,
    finish,
    retryPrepare: () =>
      original.current ? prepare(original.current) : Promise.resolve(),
    canRetryPrepare: !!original.current && !view && !!pending,
  };
}
