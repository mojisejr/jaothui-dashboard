import { type Operation } from "../operations/types";
import { type operationStatus } from "../operations/status";
import {
  executionEnvironment,
  transactionLink,
} from "../operations/environment";
import { IntegrityError } from "../operations/hash";
import { type BuffaloCreateWorkflow } from "./workflow";
export function createView(
  op: Operation,
  status: ReturnType<typeof operationStatus>,
  publicUrl: (key: string) => string,
  executionInstance: string | undefined,
  progress: Awaited<ReturnType<BuffaloCreateWorkflow["readProgress"]>> | null,
) {
  if (op.intent.kind !== "create")
    throw new IntegrityError("CREATE_OPERATION_REQUIRED");
  const object = (value: Operation["result"]) =>
    value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const intent = op.intent.buffalo;
  const evidence = op.state === "DRAFT" ? op.result : null;
  return {
    ...status,
    progress,
    steps: status.steps.map((step) => ({
      ...step,
      explorerUrl: transactionLink(executionInstance, step.hash),
    })),
    input: { ...intent },
    imageReady: !!(evidence && object(evidence).imageHash) || !!op.plan,
    prepared: !!op.plan,
    updatedAt: op.updatedAt,
    revision: op.version,
    canEdit: ["DRAFT", "READY"].includes(op.state) && status.steps.length === 0,
    imageUrl: intent.image,
    publishedImageUrl: op.actualToken
      ? publicUrl(`buffalo/${op.actualToken}.jpg`)
      : null,
    environment: executionEnvironment(executionInstance),
  };
}
