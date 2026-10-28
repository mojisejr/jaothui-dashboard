import { encodeSourceMicrochip } from "./source-microchip";
import { useEffect, useRef, useState } from "react";
import { api, type RouterOutputs } from "~/utils/api";
import {
  repairProposalSchema,
  type RepairProposal,
} from "~/server/services/buffalo-integrity/repair/contract";
import {
  feedbackFor,
  type Feedback,
} from "~/components/buffalo-feedback/feedback";
export type RepairPreview = RouterOutputs["buffaloRepair"]["preview"];
export type ScanSession = RouterOutputs["buffaloRepair"]["startScan"];
type Page = RouterOutputs["buffaloRepair"]["scanPage"];
export type TargetDraft = {
  sourceMicrochip: string;
  desiredMicrochip: string;
  desiredTokenId: string;
  evidenceKind: "physical_scan" | "registration_document";
  evidenceReference: string;
  previousCanonical: string;
};
export const emptyTarget = (): TargetDraft => ({
  sourceMicrochip: "",
  desiredMicrochip: "",
  desiredTokenId: "",
  evidenceKind: "physical_scan",
  evidenceReference: "",
  previousCanonical: "",
});
export function proposalFor(
  targets: TargetDraft[],
  aliases: string,
): RepairProposal {
  return repairProposalSchema.parse({
    targets: targets.map((target) => ({
      sourceMicrochip: target.sourceMicrochip,
      desiredMicrochip: target.desiredMicrochip,
      desiredTokenId: target.desiredTokenId.trim(),
      evidence: [
        {
          kind: target.evidenceKind,
          reference: target.evidenceReference.trim(),
        },
      ],
      ...(target.previousCanonical !== ""
        ? { confirmedPreviousCanonicalMicrochip: target.previousCanonical }
        : {}),
    })),
    knownAliases: aliases.split(/\r?\n/).filter((alias) => alias.length > 0),
  });
}
function localError(code: string, reason: string): Feedback {
  return {
    code,
    reason,
    stage: "validation",
    outcome: "not_started",
    nextAction: "correct_input",
  };
}
export function useRepairPreview() {
  const utils = api.useUtils(),
    request = api.buffaloRepair.preview.useMutation();
  const [targets, setTargets] = useState<TargetDraft[]>([emptyTarget()]),
    [aliases, setAliases] = useState("");
  const [scan, setScan] = useState<ScanSession | null>(null),
    [pages, setPages] = useState<Page[]>([]),
    [nextOffset, setNextOffset] = useState<number | null>(0);
  const [busy, setBusy] = useState(false),
    [paused, setPaused] = useState(false),
    [error, setError] = useState<Feedback | null>(null);
  const [invalidated, setInvalidated] = useState(false),
    [errorTask, setErrorTask] = useState<"start" | "scan" | "preview">("scan");
  const [preview, setPreview] = useState<RepairPreview | null>(null),
    [previewSignature, setPreviewSignature] = useState("");
  const [step, setStep] = useState(1),
    [clock, setClock] = useState(Date.now);
  const lock = useRef(false),
    stop = useRef(false),
    mounted = useRef(true),
    liveScan = useRef<ScanSession | null>(null),
    livePages = useRef<Page[]>([]),
    liveOffset = useRef<number | null>(0);
  const signature = JSON.stringify({
    targets,
    aliases,
    scanId: scan?.pin.scanId,
  });
  const expired = !!scan && clock > scan.pin.expiresAt;
  const stale =
    !!preview && (expired || invalidated || signature !== previewSignature);
  const complete = !!scan && nextOffset === null;
  useEffect(() => {
    mounted.current = true;
    const timer = setInterval(() => setClock(Date.now()), 10000);
    const source = new URLSearchParams(window.location.search).get("microchip");
    if (source !== null && encodeSourceMicrochip(source) !== null)
      setTargets([{ ...emptyTarget(), sourceMicrochip: source }]);
    return () => {
      clearInterval(timer);
      mounted.current = false;
      stop.current = true;
    };
  }, []);
  async function readPages(fresh: boolean) {
    if (lock.current) return;
    lock.current = true;
    setErrorTask(fresh || !liveScan.current ? "start" : "scan");
    if (fresh) setInvalidated(true);
    stop.current = false;
    setBusy(true);
    setPaused(false);
    setError(null);
    try {
      if (fresh || !liveScan.current) {
        const session = await utils.buffaloRepair.startScan.fetch();
        if (!mounted.current) return;
        liveScan.current = session;
        livePages.current = [];
        liveOffset.current = session.pin.scanCount ? 0 : null;
        setScan(session);
        setPages([]);
        setNextOffset(liveOffset.current);
        setStep(1);
      }
      setErrorTask("scan");
      while (liveOffset.current !== null && !stop.current) {
        const session = liveScan.current;
        const offset = liveOffset.current;
        const page = await utils.buffaloRepair.scanPage.fetch({
          scan: session.scan,
          offset,
        });
        if (!mounted.current) return;
        // Keep exact receipts from the server, once per offset; a failed page never advances the cursor.
        if (
          page.offset !== offset ||
          page.count <= 0 ||
          page.count > session.pin.pageSize ||
          offset + page.count > session.pin.scanCount ||
          page.nextOffset !==
            (offset + page.count < session.pin.scanCount
              ? offset + page.count
              : null)
        )
          throw Error("INVALID_SCAN_PROGRESS");
        livePages.current = [
          ...livePages.current.filter((item) => item.offset !== page.offset),
          page,
        ];
        liveOffset.current = page.nextOffset;
        setPages(livePages.current);
        setNextOffset(page.nextOffset);
      }
      if (mounted.current) {
        setPaused(stop.current && liveOffset.current !== null);
        if (liveOffset.current === null) setStep(2);
      }
    } catch (cause) {
      if (mounted.current)
        setError(
          feedbackFor(cause, { outcome: "not_started", stage: "chain_read" }),
        );
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function pause() {
    stop.current = true;
    setPaused(true);
  }
  async function inspect(event?: React.FormEvent) {
    event?.preventDefault();
    if (lock.current || !liveScan.current || liveOffset.current !== null)
      return;
    setErrorTask("preview");
    let proposal: RepairProposal;
    try {
      proposal = proposalFor(targets, aliases);
    } catch {
      setError(
        localError(
          "INPUT_INVALID",
          "กรุณาระบุค่าทะเบียนเดิมตรงตามที่พบ (1–128 ตัวอักษร), microchip ปลายทาง 15 หลัก, NFT และหลักฐานให้ครบ ชื่อเดิมได้ไม่เกิน 20 ค่า ค่าไม่เกิน 128 ตัวอักษร",
        ),
      );
      return;
    }
    lock.current = true;
    setErrorTask("preview");
    setInvalidated(true);
    setBusy(true);
    setError(null);
    const submittedSignature = signature;
    try {
      const result = await request.mutateAsync({
        scan: liveScan.current.scan,
        pages: livePages.current.map((page) => page.receipt),
        proposal,
      });
      if (mounted.current) {
        setPreview(result);
        setInvalidated(false);
        setPreviewSignature(submittedSignature);
        setStep(3);
      }
    } catch (cause) {
      if (mounted.current)
        setError(
          feedbackFor(cause, { outcome: "not_started", stage: "identity" }),
        );
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return {
    targets,
    setTargets,
    aliases,
    setAliases,
    scan,
    pages,
    loaded: pages.reduce((sum, page) => sum + page.count, 0),
    nextOffset,
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
  };
}
