import { OperationEngine } from "../operations/engine";
import { loopbackChainPorts } from "../operations/loopback";
import { getCreateRuntime } from "../create/runtime";
import { BuffaloEditWorkflow } from "./workflow";
import { readFileSync } from "fs";
import { type Hex } from "viem";
import { type Domain } from "../operations/types";
export interface EditRuntime {
  workflow: BuffaloEditWorkflow;
  engine: OperationEngine;
}
const cached = globalThis as typeof globalThis & {
  __buffaloEditRuntime?: { path: string; value: EditRuntime };
};
/** getCreateRuntime enforces task-owned config, loopback DB/RPC and hard-off in production first. */
export function getEditRuntime(): EditRuntime {
  const runtime = getCreateRuntime(),
    path = process.env.BUFFALO_INTEGRITY_ISOLATED_CONFIG!;
  if (cached.__buffaloEditRuntime?.path === path)
    return cached.__buffaloEditRuntime.value;
  const config = JSON.parse(readFileSync(path, "utf8")) as {
    rpcUrl: string;
    privateKey: Hex;
    domain: Domain;
    instanceId: string;
    codeHashes: Record<string, string>;
    editProjectionFailures?: number;
    editPauseAfterBatch?: boolean;
  };
  const workflow = new BuffaloEditWorkflow(
    runtime.db,
    runtime.drafts,
    runtime.storage,
    runtime.workflow.chain,
    {
      projectionFailures: config.editProjectionFailures ?? 0,
      pauseAfterBatch: config.editPauseAfterBatch ?? false,
    },
  );
  const ports = loopbackChainPorts({
    expectedInstanceId: config.instanceId,
    rpcUrl: config.rpcUrl,
    privateKey: config.privateKey,
    domain: config.domain,
    codeHashes: config.codeHashes,
    maxFeeWei: "50000000000000000",
    prepare: (op) => workflow.prepare(op),
    nextStep: (op, steps) => workflow.nextStep(op, steps),
    beforeSign: async (op) =>
      workflow.guard(
        op,
        (await runtime.drafts.operations.steps(op.id)).filter(
          (s) => s.state === "CONFIRMED",
        ),
      ),
    project: (op, steps) => workflow.project(op, steps),
    verifyPublication: (op, steps, proof) =>
      workflow.verifyPublication(op, steps, proof),
  });
  const value = {
    workflow,
    engine: new OperationEngine(runtime.drafts.operations, ports),
  };
  cached.__buffaloEditRuntime = { path, value };
  return value;
}
