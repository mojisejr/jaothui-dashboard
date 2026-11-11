import type { PublicationReadbackError } from "../operations/hash";

export type RetryMode = "autoPublication" | "autoReconcile";
export type JournalEvent = {
  kind: string;
  reason: string | null;
  created_at: Date;
  step_id: string | null;
  step_kind?: string | null;
  live_attempt?: boolean | null;
  lease_until?: Date | null;
  blocked_code?: string | null;
  request_id?: string | null;
  conflict_chip?: string | null;
  conflict_token?: string | null;
  readback?: PublicationReadbackError["evidence"] | null;
};
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

// Four progressively spaced checks fit a five-minute observation window,
// including the existing 55s per-request execution budget. Journaled attempts
// count even if the browser disconnects before receiving a response.
const delays = [5000, 15000, 30000, 60000];
export const retryEvent = (mode: RetryMode) =>
  mode === "autoPublication"
    ? "EDIT_PUBLICATION_ATTEMPT"
    : "EDIT_RECONCILE_ATTEMPT";

export function editRetry(rows: JournalEvent[], mode: RetryMode, now: number) {
  // Each different signed transaction has its own observation window.
  const start =
    mode === "autoReconcile"
      ? rows.map((row) => row.kind).lastIndexOf("SIGNED_BEFORE_BROADCAST")
      : 0;
  const segment = rows.slice(Math.max(0, start));
  const first = segment.find((row) =>
    mode === "autoPublication"
      ? row.kind === "RECOVERY_REQUIRED" &&
        row.reason === "PUBLIC_ASSET_READBACK_PENDING"
      : row.kind === "BROADCAST_UNKNOWN",
  );
  const signedAt =
    segment[0]?.kind === "SIGNED_BEFORE_BROADCAST"
      ? segment[0].created_at.getTime()
      : null;
  const anchor = first
    ? +first.created_at
    : mode === "autoReconcile" && signedAt !== null && now >= signedAt + 180000
      ? signedAt + 180000
      : null;
  if (anchor === null) return null;
  const attempts = segment.filter((row) => row.kind === retryEvent(mode));
  const deadline = anchor + 300000;
  const latestAttempt = attempts.at(-1);
  // Another tab can observe the charged final attempt before its result is
  // recorded. Keep showing work while that exact attempt owns the live lease.
  if (
    latestAttempt?.live_attempt &&
    latestAttempt.lease_until &&
    +latestAttempt.lease_until > now
  ) {
    return {
      attempts: attempts.length,
      exhausted: false,
      nextAt: latestAttempt.lease_until.toISOString(),
      deadlineAt: iso(deadline),
    };
  }
  const last = latestAttempt?.created_at.getTime() ?? anchor;
  const next = last + (delays[attempts.length] ?? 0);
  const exhausted =
    attempts.length >= delays.length || next >= deadline || now >= deadline;
  return {
    attempts: attempts.length,
    exhausted,
    nextAt: exhausted ? null : iso(next),
    deadlineAt: iso(deadline),
  };
}
