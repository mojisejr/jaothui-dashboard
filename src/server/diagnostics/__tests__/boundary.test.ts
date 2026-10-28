/** @jest-environment node */
jest.mock("superjson", () => ({
  __esModule: true,
  default: {
    serialize: (json: unknown) => ({ json }),
    deserialize: (v: { json: unknown }) => v.json,
  },
}));
jest.mock("~/server/db", () => ({ db: {} }));
jest.mock("~/server/services/auth.service", () => ({
  isAuth: (t: string) => t === "valid",
}));
import { z } from "zod";
import { type PrismaClient } from "@prisma/client";
import { createTRPCRouter, protectProcedure } from "~/server/api/trpc";
import {
  diagnosticFor,
  reportDiagnostic,
  runDiagnosticContext,
} from "../reporter";
import { DiagnosticError } from "../errors";
const sentinel = "secret=s3ntinel postgresql://private signed_bytes=0xabcdef";
const router = createTRPCRouter({
  input: protectProcedure
    .input(z.object({ value: z.string().min(1) }))
    .query(() => true),
  read: protectProcedure.query(() => {
    throw new DiagnosticError("DATABASE_READ_FAILED", {
      cause: new Error(sentinel),
    });
  }),
  write: protectProcedure
    .input(z.object({ value: z.string() }))
    .mutation(() => true),
  unexpected: protectProcedure.mutation(() => {
    throw new Error(sentinel);
  }),
});
const caller = (token = "valid") =>
  router.createCaller({ token, db: {} as PrismaClient });
const log = jest.spyOn(console, "error").mockImplementation(() => undefined);
afterEach(() => log.mockClear());
afterAll(() => log.mockRestore());
async function failure(call: () => Promise<unknown>) {
  try {
    await call();
    throw Error("expected rejection");
  } catch (error) {
    return diagnosticFor(error);
  }
}
test("auth and Zod failures have independent references before operation creation", async () => {
  const a = await failure(() => caller("invalid").input({ value: "ok" }));
  const b = await failure(() => caller().input({ value: "" }));
  expect(a).toMatchObject({
    code: "UNAUTHORIZED",
    stage: "authentication",
    outcome: "not_started",
    nextAction: "reauthenticate",
  });
  expect(b).toMatchObject({
    code: "INPUT_INVALID",
    stage: "validation",
    outcome: "not_started",
  });
  expect(a.requestId).not.toBe(b.requestId);
  expect(log.mock.calls.flat().join(" ")).toContain(a.requestId);
  expect(log.mock.calls.flat().join(" ")).toContain(b.requestId);
});
test("read fault is not not-found; unexpected mutation outcome is unknown and sanitized", async () => {
  const a = await failure(() => caller().read());
  const b = await failure(() => caller().unexpected());
  expect(a).toMatchObject({
    code: "DATABASE_READ_FAILED",
    stage: "database_read",
    nextAction: "retry_read",
  });
  expect(b).toMatchObject({
    code: "INTERNAL_ERROR",
    outcome: "unknown",
    nextAction: "contact_support",
  });
  expect(JSON.stringify([a, b, log.mock.calls])).not.toContain(sentinel);
  expect(JSON.stringify([a, b, log.mock.calls])).not.toContain("postgresql");
});
test("a transport batch keeps distinct subrequest references and does not trust caller IDs", async () => {
  const [a, b] = await runDiagnosticContext(
    { requestId: "11111111-1111-4111-8111-111111111111", route: "transport" },
    () =>
      Promise.all([
        failure(() => caller("bad").input({ value: "x" })),
        failure(() => caller().input({ value: "" })),
      ]),
  );
  expect(a.requestId).not.toBe(b.requestId);
  expect(a.transportId).toBe(b.transportId);
});
test("reporting twice at the same boundary logs once and never serializes the cause", () => {
  const e = new Error(sentinel);
  const a = reportDiagnostic(e);
  const b = reportDiagnostic(e);
  expect(a).toEqual(b);
  expect(log).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(log.mock.calls)).not.toContain(sentinel);
});

import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
const httpRouter = createTRPCRouter({ buffaloEdit: router });
async function http(url: string, init?: RequestInit, token = "valid") {
  const req = new Request("http://127.0.0.1/api/trpc/" + url, init);
  return runDiagnosticContext(
    { requestId: "22222222-2222-4222-8222-222222222222", route: "api/trpc" },
    () =>
      fetchRequestHandler({
        endpoint: "/api/trpc",
        req,
        router: httpRouter,
        createContext: () => ({ token, db: {} as PrismaClient }),
        onError: ({ error }) => {
          reportDiagnostic(error);
        },
      }),
  );
}
test("actual HTTP batch serializes unique refs and strips secret message/stack", async () => {
  const result = await http(
    "buffaloEdit.read,buffaloEdit.input?batch=1&input=" +
      encodeURIComponent(
        JSON.stringify({ "0": { json: null }, "1": { json: { value: "" } } }),
      ),
  );
  const body = (await result.json()) as Array<{
    error: {
      json: {
        message: string;
        data: {
          stack?: string;
          diagnostic: { requestId: string; code: string };
        };
      };
    };
  }>;
  expect(body).toHaveLength(2);
  expect(body[0]?.error.json.data.diagnostic.code).toBe("DATABASE_READ_FAILED");
  expect(body[1]?.error.json.data.diagnostic.code).toBe("INPUT_INVALID");
  expect(body[0]?.error.json.data.diagnostic.requestId).not.toBe(
    body[1]?.error.json.data.diagnostic.requestId,
  );
  expect(JSON.stringify(body)).not.toContain(sentinel);
  expect(body[0]?.error.json.data.stack).toBeUndefined();
  const unexpected = await http("buffaloEdit.unexpected", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: '{"json":null}',
  });
  const text = await unexpected.text();
  expect(text).toContain("INTERNAL_ERROR");
  expect(text).not.toContain(sentinel);
});
test("malformed JSON before middleware still correlates parser failure", async () => {
  const res = await http("buffaloEdit.write", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: '{"broken"',
  });
  const text = await res.text();
  expect(text).toContain("INPUT_INVALID");
  expect(text).toContain("22222222-2222-4222-8222-222222222222");
});
test("allowlisted cause classes and ORM code survive, while raw provider detail does not", () => {
  const cause = Object.assign(new Error(sentinel), {
    name: "PrismaClientKnownRequestError",
    code: "P1001",
  });
  reportDiagnostic(new DiagnosticError("DATABASE_READ_FAILED", { cause }));
  const text = JSON.stringify(log.mock.calls);
  expect(text).toContain("PrismaClientKnownRequestError");
  expect(text).toContain("P1001");
  expect(text).not.toContain(sentinel);
});

test("HTTP semantics distinguish unauthorized, input, lookup, conflict, unavailable and unexpected", async () => {
  const auth = await http("buffaloEdit.read", undefined, "bad");
  expect(auth.status).toBe(401);
  expect((await http("buffaloEdit.read")).status).toBe(503);
  const cases = [
    ["COW_NOT_FOUND", "NOT_FOUND"],
    ["TOKEN_MAPPING_CONFLICT", "CONFLICT"],
    ["INTEGRITY_FEATURE_DISABLED", "SERVICE_UNAVAILABLE"],
    ["DATABASE_WRITE_FAILED", "INTERNAL_SERVER_ERROR"],
    ["INPUT_INVALID", "BAD_REQUEST"],
    ["constructor", "INTERNAL_SERVER_ERROR"],
  ];
  for (const [code, expected] of cases) {
    expect(diagnosticTRPCError(new DiagnosticError(code!)).code).toBe(expected);
  }
});
import { diagnosticTRPCError } from "../transport";
