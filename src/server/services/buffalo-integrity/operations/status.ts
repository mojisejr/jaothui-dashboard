import { type Operation, type Step } from "./types";
import { DiagnosticError } from "~/server/diagnostics/errors";
import { diagnosticFor } from "~/server/diagnostics/reporter";
export type StatusStep = Pick<Step, "kind" | "state" | "hash" | "receipt"> & {
  hasSignedBytes: boolean;
};
/** Shared whitelist for a detail read and a single-statement inventory snapshot. */
export function operationStatus(operation: Operation, steps: StatusStep[]) {
  const canResume = ![
    "DRAFT",
    "COMPLETED",
    "CANCELLED",
    "NEEDS_REVIEW",
  ].includes(operation.state);
  const diagnostic = operation.reason
    ? diagnosticFor(new DiagnosticError(operation.reason), {
        operationId: operation.id,
        outcome:
          operation.reason === "PUBLIC_ASSET_READBACK_PENDING"
            ? "pending"
            : operation.state === "COMPLETED"
              ? "completed"
              : operation.state === "CANCELLED"
                ? "failed"
                : steps.some((step) => !!step.hash)
                  ? "unknown"
                  : "not_started",
        nextAction: canResume ? "resume_existing" : "contact_support",
      })
    : undefined;
  // Whitelist DTO. Signed bytes, calldata, plan, complete intent and private RPC errors stay server-only.
  return {
    id: operation.id,
    state: operation.state,
    version: operation.version,
    microchip:
      operation.intent.kind === "create"
        ? operation.intent.buffalo.microchip
        : operation.intent.kind === "edit"
          ? operation.intent.microchip
          : operation.intent.manifest.database.targets[0]!.desiredMicrochip,
    actualToken: operation.actualToken,
    reason: diagnostic?.code ?? null,
    ...(diagnostic ? { diagnostic } : {}),
    steps: steps.map((step) => ({
      kind: step.kind,
      state: step.state,
      hash: step.hash,
      receipt: step.receipt,
    })),
    canCancel:
      !steps.some((step) => step.hasSignedBytes) &&
      !["COMPLETED", "CANCELLED"].includes(operation.state),
    canResume: !["DRAFT", "COMPLETED", "CANCELLED", "NEEDS_REVIEW"].includes(
      operation.state,
    ),
  };
}
