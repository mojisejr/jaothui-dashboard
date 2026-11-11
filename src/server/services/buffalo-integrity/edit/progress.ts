import type { JournalEvent } from "../operations/retry";
export {
  journalRetry as editRetry,
  retryEvent,
  type JournalEvent,
  type RetryMode,
} from "../operations/retry";
const pauseEvents = [
  "EDIT_PREPARE_STOPPED",
  "RETRYABLE",
  "RECOVERY_REQUIRED",
  "NEEDS_REVIEW",
  "CANCELLED",
  "COMPLETED",
];
const iso = (ms: number) => new Date(ms).toISOString();

export function editTiming(rows: JournalEvent[], now: number) {
  const phases: [number | null, number | null, number | null] = [
    null,
    null,
    null,
  ];
  let phase: 0 | 1 | 2 | null = null;
  let chainFinished = false;
  let previous = now;
  let lastProgressAt: string | null = null;
  const seen = new Set<string>();
  let startedAt: string | null = null;
  let createdAt: string | null = null;
  const accrue = (at: number) => {
    if (phase !== null)
      phases[phase] = (phases[phase] ?? 0) + Math.max(0, at - previous);
    previous = at;
  };
  for (const event of rows) {
    const at = event.created_at.getTime();
    accrue(at);
    const key = [event.kind, event.step_id, event.reason].join("/");
    if (!seen.has(key)) lastProgressAt = iso(at);
    seen.add(key);
    if (event.kind === "DRAFT_CREATED") createdAt ??= iso(at);
    else if (
      pauseEvents.includes(event.kind) ||
      event.reason === "INTEGRITY_WRITES_PAUSED"
    )
      phase = null;
    else if (event.kind === "STEP_CONFIRMED" && event.step_kind === "uri") {
      // URI is the edit's final chain step. Subsequent CHAIN_STEPS events
      // acknowledge the same confirmation while publication is pending.
      if (!chainFinished) phase = 2;
      chainFinished = true;
    } else if (event.kind === "EDIT_PREPARING") phase = 0;
    else if (
      [
        "READY",
        "STEP_RESERVED",
        "SIGNED_BEFORE_BROADCAST",
        "CHAIN_PENDING",
        "BROADCAST_UNKNOWN",
        "CHAIN_STEPS",
        "EDIT_RECONCILE_ATTEMPT",
      ].includes(event.kind)
    )
      phase = chainFinished ? 2 : 1;
    else if (
      ["PROJECTING", "VERIFYING", "EDIT_PUBLICATION_ATTEMPT"].includes(
        event.kind,
      )
    )
      phase = 2;
    if (phase !== null) startedAt ??= iso(at);
  }
  accrue(now);
  return {
    lastProgressAt,
    createdAt,
    startedAt,
    phases,
    currentPhase: phase,
    checkedAt: iso(now),
  };
}
