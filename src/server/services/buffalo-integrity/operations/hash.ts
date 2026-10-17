import { createHash } from "crypto";
import { type Json } from "./types";
export function stableJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value))
    return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${value.map((entry: unknown) => stableJson(entry)).join(",")}]`;
  if (
    typeof value === "object" &&
    Object.prototype.toString.call(value) === "[object Object]"
  ) {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
      .join(",")}}`;
  }
  throw new Error("NON_CANONICAL_JSON");
}
export function payloadHash(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}
export function asJson(value: unknown): Json {
  return JSON.parse(stableJson(value)) as Json;
}
export class IntegrityError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "IntegrityError";
  }
}
