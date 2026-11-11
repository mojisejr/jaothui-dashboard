import type { JournalEvent } from "../operations/retry";

// Intervals start with durable work, so time spent at either confirmation button
// is excluded. Reconciliation re-emits confirmations for earlier steps.
export function createTiming(rows: JournalEvent[], now: number) {
  const phases: [number | null, number | null, number | null] = [
    null,
    null,
    null,
  ];
  let currentPhase: 0 | 1 | 2 | null = null;
  let previous = now;
  let lastProgressAt: string | null = null;
  const seen = new Set<string>();
  const accrue = (at: number) => {
    if (currentPhase !== null)
      phases[currentPhase] =
        (phases[currentPhase] ?? 0) + Math.max(0, at - previous);
    previous = at;
  };
  for (const row of rows) {
    const at = +row.created_at;
    accrue(at);
    const key = [row.kind, row.step_id, row.reason].join("/");
    const first = !seen.has(key);
    if (first) lastProgressAt = row.created_at.toISOString();
    seen.add(key);
    if (row.kind === "STEP_RESERVED") {
      currentPhase = row.step_kind === "mint" ? 0 : 1;
    } else if (
      first &&
      row.kind === "STEP_CONFIRMED" &&
      row.step_kind === "mint" &&
      currentPhase === 0
    ) {
      currentPhase = null;
    } else if (
      ["PROJECTING", "VERIFYING", "CREATE_PUBLICATION_ATTEMPT"].includes(
        row.kind,
      )
    ) {
      currentPhase = 2;
    } else if (
      [
        "AWAITING_METADATA_ACTION",
        "COMPLETED",
        "CANCELLED",
        "NEEDS_REVIEW",
        "RETRYABLE",
        "RECOVERY_REQUIRED",
      ].includes(row.kind) ||
      row.reason === "INTEGRITY_WRITES_PAUSED"
    ) {
      currentPhase = null;
    } else if (row.kind === "SIGNED_BEFORE_BROADCAST") {
      currentPhase = row.step_kind === "mint" ? 0 : 1;
    }
  }
  accrue(now);
  return {
    phases,
    currentPhase,
    lastProgressAt,
    checkedAt: new Date(now).toISOString(),
  };
}
