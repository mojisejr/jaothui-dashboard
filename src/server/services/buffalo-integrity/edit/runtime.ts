import { receiptEvidence } from "../operations/receipt-evidence";
import { OperationEngine } from "../operations/engine";
import { getCreateRuntime, type CreateRuntime } from "../create/runtime";
import { BuffaloEditWorkflow } from "./workflow";
import { IntegrityError } from "../operations/hash";
export interface EditRuntime {
  workflow: BuffaloEditWorkflow;
  engine: OperationEngine;
  assertCanStart?: () => void;
}
const cached = globalThis as typeof globalThis & {
  __buffaloEditRuntime?: { base: CreateRuntime; value: EditRuntime };
};
export function getEditRuntime(): EditRuntime {
  const runtime = getCreateRuntime();
  if (cached.__buffaloEditRuntime?.base === runtime)
    return cached.__buffaloEditRuntime.value;
  if (!runtime.portsFactory)
    throw new IntegrityError("INTEGRITY_PORT_CONFIGURATION_REQUIRED");
  const workflow = new BuffaloEditWorkflow(
    runtime.db,
    runtime.drafts,
    runtime.storage,
    runtime.workflow.chain,
    runtime.editFaults,
  );
  const ports = runtime.portsFactory({
    prepare: (op) => workflow.prepare(op),
    nextStep: (op, steps) => workflow.nextStep(op, steps),
    beforeSign: async (op) =>
      workflow.guard(
        op,
        (await runtime.drafts.operations.steps(op.id)).filter(
          (s) => s.state === "CONFIRMED",
        ),
      ),
    beforeBroadcast: async (op) =>
      workflow.guard(
        op,
        (await runtime.drafts.operations.steps(op.id)).filter(
          (s) => s.state === "CONFIRMED",
        ),
      ),
    reconcileCurrent: async (op, step) =>
      workflow.guard(
        op,
        [
          ...(await runtime.drafts.operations.steps(op.id)).filter(
            (s) => s.state === "CONFIRMED" && s.id !== step.id,
          ),
          step,
        ].sort((a, b) => a.ordinal - b.ordinal),
        step.receipt && receiptEvidence(op, step, step.receipt)?.observedHead
          ? BigInt(
              receiptEvidence(op, step, step.receipt)!.observedHead!.number,
            )
          : undefined,
      ),
    project: (op, steps) => workflow.project(op, steps),
    verifyPublication: (op, steps, proof) =>
      workflow.verifyPublication(op, steps, proof),
  });
  const value = {
    workflow,
    engine: new OperationEngine(runtime.drafts.operations, ports),
    assertCanStart: runtime.assertCanStart,
  };
  cached.__buffaloEditRuntime = { base: runtime, value };
  return value;
}
