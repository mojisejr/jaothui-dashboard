import type { PublicationReadbackError } from "./hash";

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
// Four progressively spaced checks fit a five-minute observation window,
// including the existing 55s per-request execution budget. Journaled attempts
// count even if the browser disconnects before receiving a response.
const delays = [5000, 15000, 30000, 60000];
const iso = (ms: number) => new Date(ms).toISOString();
export const retryEvent = (
  mode: RetryMode,
  scope: "EDIT" | "CREATE" = "EDIT",
) =>
  mode === "autoPublication"
    ? `${scope}_PUBLICATION_ATTEMPT`
    : `${scope}_RECONCILE_ATTEMPT`;

export function journalRetry(
  rows: JournalEvent[],
  mode: RetryMode,
  now: number,
  scope: "EDIT" | "CREATE" = "EDIT",
) {
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
  const attempts = segment.filter(
    (row) => row.kind === retryEvent(mode, scope),
  );
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
