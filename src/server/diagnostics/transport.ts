import { TRPCError } from "@trpc/server";
import { diagnosticFor } from "./reporter";

/** HTTP semantics follow the exact registered reason, never arbitrary error text. */
export function diagnosticTRPCError(error: unknown): TRPCError {
  if (
    error instanceof TRPCError &&
    !["INTERNAL_SERVER_ERROR", "PRECONDITION_FAILED"].includes(error.code)
  )
    return error;
  const diagnostic = diagnosticFor(error);
  const code =
    diagnostic.code === "INPUT_TOO_LARGE"
      ? "PAYLOAD_TOO_LARGE"
      : diagnostic.code === "LEGACY_WRITE_REQUIRES_DURABLE_OPERATION"
        ? "PRECONDITION_FAILED"
        : diagnostic.code === "UNAUTHORIZED"
          ? "UNAUTHORIZED"
          : diagnostic.code === "FORBIDDEN"
            ? "FORBIDDEN"
            : diagnostic.stage === "lookup"
              ? "NOT_FOUND"
              : diagnostic.stage === "validation" ||
                  diagnostic.nextAction === "choose_file"
                ? "BAD_REQUEST"
                : diagnostic.stage === "identity" ||
                    diagnostic.nextAction === "refresh_record"
                  ? "CONFLICT"
                  : diagnostic.stage === "database_read" ||
                      diagnostic.stage === "chain_read" ||
                      diagnostic.stage === "configuration" ||
                      diagnostic.stage === "asset_upload"
                    ? "SERVICE_UNAVAILABLE"
                    : diagnostic.code === "INTERNAL_ERROR" ||
                        diagnostic.stage === "database_write" ||
                        diagnostic.stage === "request"
                      ? "INTERNAL_SERVER_ERROR"
                      : "PRECONDITION_FAILED";
  return new TRPCError({ code, message: diagnostic.code, cause: error });
}
export function diagnosticHttpStatus(error: unknown): number {
  const code = diagnosticTRPCError(error).code;
  switch (code) {
    case "PAYLOAD_TOO_LARGE":
      return 413;
    case "UNAUTHORIZED":
      return 401;
    case "FORBIDDEN":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "BAD_REQUEST":
      return 400;
    case "CONFLICT":
      return 409;
    case "SERVICE_UNAVAILABLE":
      return 503;
    case "PRECONDITION_FAILED":
      return 412;
    default:
      return 500;
  }
}
