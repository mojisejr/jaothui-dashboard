import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import {
  type DiagnosticEnvelope,
  type DiagnosticOutcome,
} from "~/lib/buffalo-diagnostics";
import { DiagnosticError, errorPolicy } from "./errors";
interface DiagnosticContext {
  requestId: string;
  transportId?: string;
  route: string;
  type?: "query" | "mutation" | "subscription";
  operationId?: string;
}
const storage = new AsyncLocalStorage<DiagnosticContext>();
const envelopes = new WeakMap<object, DiagnosticEnvelope>();
const reported = new WeakSet<object>();
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const diagnosticContext = () => storage.getStore();
export const newRequestId = () => randomUUID();
export function runDiagnosticContext<T>(
  context: DiagnosticContext,
  callback: () => T,
): T {
  return storage.run(context, callback);
}
export function bindOperationId(value: unknown) {
  const context = storage.getStore();
  if (context && typeof value === "string" && uuid.test(value))
    context.operationId = value;
}
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
function safeCode(error: unknown): string {
  if (object(error) && error.code === "PAYLOAD_TOO_LARGE")
    return "INPUT_TOO_LARGE";
  if (error instanceof ZodError) return "INPUT_INVALID";
  if (
    object(error) &&
    ["PARSE_ERROR", "BAD_REQUEST"].includes(String(error.code))
  )
    return "INPUT_INVALID";
  if (object(error) && error.cause instanceof ZodError) return "INPUT_INVALID";
  if (
    object(error) &&
    ["UNAUTHORIZED", "FORBIDDEN"].includes(String(error.code))
  )
    return String(error.code);
  if (error instanceof DiagnosticError && errorPolicy(error.code))
    return error.code;
  if (object(error) && error.cause instanceof DiagnosticError)
    return safeCode(error.cause);
  if (error instanceof Error && errorPolicy(error.message))
    return error.message;
  return "INTERNAL_ERROR";
}
export function diagnosticFor(
  error: unknown,
  overrides: Partial<
    Pick<DiagnosticEnvelope, "code" | "outcome" | "nextAction" | "operationId">
  > = {},
): DiagnosticEnvelope {
  if (object(error) && envelopes.has(error) && !Object.keys(overrides).length)
    return envelopes.get(error)!;
  const ctx = storage.getStore();
  const candidate = overrides.code ?? safeCode(error);
  const code = errorPolicy(candidate) ? candidate : "INTERNAL_ERROR";
  const policy = errorPolicy(code)!;
  const fallback: DiagnosticOutcome =
    ctx?.type === "query" ? "not_started" : "unknown";
  const envelope: DiagnosticEnvelope = {
    code,
    ...policy,
    requestId: ctx?.requestId ?? randomUUID(),
    outcome:
      overrides.outcome ??
      (ctx?.operationId !== undefined ||
      /\.(view|status|advance|prepare|cancel)$/.test(ctx?.route ?? "")
        ? "unknown"
        : (policy.outcome ?? fallback)),
    nextAction: overrides.nextAction ?? policy.nextAction,
  };
  if (ctx?.transportId) envelope.transportId = ctx.transportId;
  const operationId = overrides.operationId ?? ctx?.operationId;
  if (operationId && uuid.test(operationId)) envelope.operationId = operationId;
  const validation =
    error instanceof ZodError
      ? error
      : object(error) && error.cause instanceof ZodError
        ? error.cause
        : null;
  if (validation) {
    const allowedFields = new Set([
      "name",
      "microchip",
      "tokenId",
      "birthday",
      "birthdate",
      "height",
      "sex",
      "color",
      "rarity",
      "origin",
      "certNo",
      "detail",
      "dna",
      "image",
      "fatherId",
      "motherId",
      "id",
      "key",
      "version",
      "eventDate",
      "eventName",
      "rewardName",
      "rewardImage",
    ]);
    const fields: Record<string, string[]> = {};
    for (const issue of validation.issues) {
      const field = issue.path.find(
        (part) => typeof part === "string" && allowedFields.has(part),
      );
      if (typeof field === "string")
        fields[field] = ["กรุณาตรวจสอบข้อมูลช่องนี้"];
    }
    if (Object.keys(fields).length) envelope.fieldErrors = fields;
  }
  if (object(error) && !Object.keys(overrides).length)
    envelopes.set(error, envelope);
  return envelope;
}
const allowedClasses = new Set([
  "DiagnosticError",
  "IntegrityError",
  "TRPCError",
  "ZodError",
  "TypeError",
  "RangeError",
  "SyntaxError",
  "PrismaClientKnownRequestError",
  "PrismaClientUnknownRequestError",
  "PrismaClientInitializationError",
  "PrismaClientValidationError",
  "ContractFunctionExecutionError",
  "ContractFunctionRevertedError",
  "HttpRequestError",
  "RpcRequestError",
  "TimeoutError",
  "TransactionReceiptNotFoundError",
  "TransactionNotFoundError",
  "TransactionExecutionError",
  "StorageApiError",
  "StorageUnknownError",
]);
function safeCause(error: unknown) {
  const classes: string[] = [];
  const providerCodes: string[] = [];
  for (
    let current = error, depth = 0;
    object(current) && depth < 5;
    current = current.cause, depth++
  ) {
    const name = current instanceof Error ? current.name : undefined;
    if (
      typeof name === "string" &&
      allowedClasses.has(name) &&
      !classes.includes(name)
    )
      classes.push(name);
    if (typeof current.code === "string" && /^P[0-9]{4}$/.test(current.code))
      providerCodes.push(current.code);
  }
  return {
    causeClasses: classes.length ? classes : ["UnclassifiedError"],
    providerCodes,
  };
}
/** Allowlisted structured fields only. Error.message/stack/cause and request input are deliberately absent. */
export function reportDiagnostic(
  error: unknown,
  overrides: Parameters<typeof diagnosticFor>[1] = {},
): DiagnosticEnvelope {
  const diagnostic = diagnosticFor(error, overrides);
  if (object(error) && reported.has(error) && !Object.keys(overrides).length)
    return diagnostic;
  if (object(error) && !Object.keys(overrides).length) reported.add(error);
  const ctx = storage.getStore();
  const route = ctx?.route;
  const event = {
    event: "buffalo_diagnostic",
    at: new Date().toISOString(),
    release: /^[a-f0-9]{7,40}$/i.test(process.env.VERCEL_GIT_COMMIT_SHA ?? "")
      ? process.env.VERCEL_GIT_COMMIT_SHA
      : "unversioned",
    route: route && /^[a-zA-Z0-9_.\/-]{1,160}$/.test(route) ? route : "request",
    ...safeCause(error),
    ...diagnostic,
  };
  try {
    console.error(JSON.stringify(event));
  } catch {
    /* Observability must never alter a transaction outcome. */
  }
  return diagnostic;
}
