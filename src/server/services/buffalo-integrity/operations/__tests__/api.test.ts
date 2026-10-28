/** @jest-environment node */
// Transport serialization is independent of authorization; superjson is ESM-only in this Jest runtime.
jest.mock("superjson", () => ({
  __esModule: true,
  default: {
    serialize: (value: unknown) => ({ json: value }),
    deserialize: (value: { json: unknown }) => value.json,
  },
}));
jest.mock("~/server/db", () => ({ db: {} }));
import jwt from "jsonwebtoken";
import { type PrismaClient } from "@prisma/client";
import { createBuffaloOperationsRouter } from "~/server/api/routers/r-buffalo-operations";
import { OperationEngine } from "../engine";
import {
  memoryRepository,
  fakeChain,
  intent,
  domain,
} from "../testing-fixtures";

const env = { username: process.env.username, secret: process.env.secret };
beforeAll(() => {
  process.env.username = "phase2-test-shared";
  process.env.secret = "phase2-local-test-secret";
});
afterAll(() => {
  for (const key of ["username", "secret"] as const) {
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  }
});
function context(
  token = jwt.sign({ username: process.env.username }, process.env.secret!),
) {
  return { token, db: {} as PrismaClient };
}
function setup() {
  const memory = memoryRepository();
  const chain = fakeChain();
  const engine = new OperationEngine(memory.repo, chain);
  const runtime = jest.fn(() => engine);
  const router = createBuffaloOperationsRouter(runtime);
  return {
    memory,
    chain,
    engine,
    runtime,
    caller: router.createCaller(context()),
  };
}

test("unauthenticated callers cannot reach runtime or inspect a job", async () => {
  const c = setup();
  const caller = createBuffaloOperationsRouter(c.runtime).createCaller(
    context("invalid"),
  );
  await expect(
    caller.status({ id: "00000000-0000-4000-8000-000000000001" }),
  ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  expect(c.runtime).not.toHaveBeenCalled();
});
test("shared account scope comes from verified server auth; arbitrary operation IDs stay private", async () => {
  const c = setup();
  const own = await c.caller.create({ key: "api-1", intent });
  expect(c.memory.rows.get(own.id)!.owner).toBe("shared:phase2-test-shared");
  const foreign = await c.engine.create(
    "shared:another",
    "foreign",
    intent,
    domain,
  );
  await expect(c.caller.status({ id: foreign.id })).rejects.toMatchObject({
    code: "NOT_FOUND",
    message: "OPERATION_NOT_FOUND",
  });
});
test("strict inputs reject client owner, raw bytes, arbitrary calldata, plan and spoofed receipts", async () => {
  const c = setup();
  for (const extra of [
    { owner: "another" },
    { signedBytes: "not-accepted" },
    { calldata: "not-accepted" },
    { plan: {} },
    { receipt: { status: "success" } },
  ]) {
    await expect(
      c.caller.create({
        ...{ key: "api-invalid", intent },
        ...extra,
      } as Parameters<typeof c.caller.create>[0]),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  }
  expect(c.runtime).not.toHaveBeenCalled();
});
test("status DTO whitelists public stage/proof and excludes journal authorization", async () => {
  const c = setup();
  const operation = await c.caller.create({ key: "api-2", intent });
  const result = await c.caller.status({ id: operation.id });
  expect(Object.keys(result).sort()).toEqual([
    "actualToken",
    "canCancel",
    "canResume",
    "id",
    "microchip",
    "reason",
    "state",
    "steps",
    "version",
  ]);
  expect(JSON.stringify(result)).not.toContain("owner");
  expect(JSON.stringify(result)).not.toContain("intent");
});
test("disabled production runtime never constructs a signer or accepts a live write", async () => {
  const caller = createBuffaloOperationsRouter().createCaller(context());
  await expect(
    caller.create({ key: "disabled", intent }),
  ).rejects.toMatchObject({
    code: "SERVICE_UNAVAILABLE",
    message: "INTEGRITY_FEATURE_DISABLED",
  });
});
test("adapter/database exceptions cannot leak signed bytes or credentials through API errors", async () => {
  const c = setup();
  jest
    .spyOn(c.engine, "status")
    .mockRejectedValueOnce(
      new Error("sensitive signed_bytes deliberately hidden"),
    );
  await expect(
    c.caller.status({ id: "00000000-0000-4000-8000-000000000001" }),
  ).rejects.toMatchObject({
    code: "INTERNAL_SERVER_ERROR",
    message: "INTERNAL_ERROR",
  });
});
