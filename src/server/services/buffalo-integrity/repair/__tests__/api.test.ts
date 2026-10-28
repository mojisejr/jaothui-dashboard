/** @jest-environment node */
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
import { createBuffaloRepairRouter } from "~/server/api/routers/r-buffalo-repair";
import { type RepairDiagnosis } from "../diagnosis";
import { type RepairExecutionView } from "../execution-contract";
const original = {
  username: process.env.username,
  secret: process.env.secret,
  flag: process.env.BUFFALO_REPAIR_DIAGNOSIS_ENABLED,
};
beforeAll(() => {
  process.env.username = "repair-test";
  process.env.secret = "repair-test-auth-secret";
  delete process.env.BUFFALO_REPAIR_DIAGNOSIS_ENABLED;
});
afterAll(() => {
  for (const [key, value] of Object.entries({
    username: original.username,
    secret: original.secret,
    BUFFALO_REPAIR_DIAGNOSIS_ENABLED: original.flag,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
function context(
  token = jwt.sign({ username: process.env.username }, process.env.secret!),
) {
  return { token, db: {} as PrismaClient };
}
test("authentication precedes diagnosis factory", async () => {
  const factory = jest.fn<RepairDiagnosis, []>(() => {
    throw Error("unreachable");
  });
  await expect(
    createBuffaloRepairRouter(factory)
      .createCaller(context("invalid"))
      .startScan(),
  ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  expect(factory).not.toHaveBeenCalled();
});
test("diagnosis defaults off without needing writer secrets", async () => {
  await expect(
    createBuffaloRepairRouter().createCaller(context()).startScan(),
  ).rejects.toMatchObject({ message: "REPAIR_DIAGNOSIS_DISABLED" });
});
test("router exposes separated diagnosis and execution procedures and rejects client complete assertions", async () => {
  const factory = jest.fn<RepairDiagnosis, []>(() => {
    throw Error("unreachable");
  });
  const router = createBuffaloRepairRouter(factory);
  expect(Object.keys(router._def.procedures).sort()).toEqual([
    "advance",
    "approve",
    "cancel",
    "capability",
    "getByKey",
    "prepare",
    "preview",
    "scanPage",
    "startScan",
    "view",
  ]);
  await expect(
    router
      .createCaller(context())
      .scanPage(
        Object.assign({ scan: "receipt", offset: 0 }, { complete: true }),
      ),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(factory).not.toHaveBeenCalled();
});

const id = "10000000-0000-4000-8000-000000000001";
const manifestHash = "a".repeat(64);
const preparation = {
  key: id,
  scan: "server-signed-scan",
  pages: ["server-signed-page"],
  proposal: {
    targets: [
      {
        sourceMicrochip: "legacy chip",
        desiredMicrochip: "999000000008001",
        desiredTokenId: "1",
        evidence: [
          { kind: "physical_scan" as const, reference: "scanner record" },
        ],
      },
    ],
    knownAliases: [],
  },
};
function execution() {
  const value = {
    id,
    version: 0,
  } as RepairExecutionView;
  const runtime = {
    capability: jest.fn(async () => ({
      canPrepare: false,
      canApprove: false,
      canResume: false,
      singleOnly: true as const,
    })),
    prepare: jest.fn(async () => value),
    getByKey: jest.fn(async () => value),
    view: jest.fn(async () => value),
    approve: jest.fn(async () => value),
    advance: jest.fn(async () => value),
    cancel: jest.fn(async () => value),
  };
  const factory = jest.fn(() => runtime);
  return {
    runtime,
    factory,
    caller: createBuffaloRepairRouter(undefined, factory).createCaller(
      context(),
    ),
  };
}
test("diagnosis never constructs the execution runtime", async () => {
  const writer = jest.fn(() => {
    throw Error("writer must not load");
  });
  await expect(
    createBuffaloRepairRouter(undefined, writer)
      .createCaller(context())
      .startScan(),
  ).rejects.toMatchObject({ message: "REPAIR_DIAGNOSIS_DISABLED" });
  expect(writer).not.toHaveBeenCalled();
});
test("all execution procedures authenticate before constructing runtime", async () => {
  const { factory } = execution();
  const caller = createBuffaloRepairRouter(undefined, factory).createCaller(
    context("invalid"),
  );
  const calls = [
    () => caller.capability(),
    () => caller.getByKey({ key: id }),
    () => caller.view({ id }),
    () => caller.prepare(preparation),
    () => caller.approve({ id, manifestHash, expectedVersion: 0 }),
    () => caller.advance({ id, expectedVersion: 0 }),
    () => caller.cancel({ id }),
  ];
  for (const call of calls)
    await expect(call()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  expect(factory).not.toHaveBeenCalled();
});
test("execution rejects client owner, manifest authority and invalid versions before runtime", async () => {
  const { caller, factory } = execution();
  await expect(
    caller.prepare(Object.assign({}, preparation, { owner: "attacker" })),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  await expect(
    caller.prepare(
      Object.assign({}, preparation, { manifest: { approved: true } }),
    ),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  await expect(
    caller.approve({ id, manifestHash: "invalid", expectedVersion: 0 }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  await expect(
    caller.advance({ id, expectedVersion: -1 }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  await expect(caller.getByKey({ key: "not-a-uuid" })).rejects.toMatchObject({
    code: "BAD_REQUEST",
  });
  await expect(
    caller.cancel(Object.assign({ id }, { owner: "attacker" })),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(factory).not.toHaveBeenCalled();
});
test("execution derives owner on server and forwards only validated operation identity", async () => {
  const { caller, runtime } = execution();
  await caller.capability();
  await caller.prepare(preparation);
  await caller.getByKey({ key: id });
  await caller.view({ id });
  await caller.approve({ id, manifestHash, expectedVersion: 2 });
  await caller.advance({ id, expectedVersion: 3 });
  await caller.cancel({ id });
  const owner = "shared:repair-test";
  expect(runtime.capability).toHaveBeenCalledWith();
  expect(runtime.prepare).toHaveBeenCalledWith(owner, preparation);
  expect(runtime.getByKey).toHaveBeenCalledWith(owner, id);
  expect(runtime.view).toHaveBeenCalledWith(owner, id);
  expect(runtime.approve).toHaveBeenCalledWith(owner, {
    id,
    manifestHash,
    expectedVersion: 2,
  });
  expect(runtime.advance).toHaveBeenCalledWith(owner, {
    id,
    expectedVersion: 3,
  });
  expect(runtime.cancel).toHaveBeenCalledWith(owner, id);
});
test("execution provider errors expose registered code without provider body", async () => {
  const { caller, runtime } = execution();
  runtime.view.mockRejectedValueOnce(
    new Error("postgres://private/secret provider body"),
  );
  await expect(caller.view({ id })).rejects.toMatchObject({
    code: "INTERNAL_SERVER_ERROR",
    message: "INTERNAL_ERROR",
  });
});
test("disabled capability stays readable with unavailable writer configuration", async () => {
  const previous = process.env.BUFFALO_REPAIR_MODE;
  const previousConfig = process.env.BUFFALO_INTEGRITY_SERVER_CONFIG;
  delete process.env.BUFFALO_REPAIR_MODE;
  process.env.BUFFALO_INTEGRITY_SERVER_CONFIG = "invalid-writer-config";
  try {
    await expect(
      createBuffaloRepairRouter().createCaller(context()).capability(),
    ).resolves.toMatchObject({ canPrepare: false, canApprove: false });
  } finally {
    if (previous === undefined) delete process.env.BUFFALO_REPAIR_MODE;
    else process.env.BUFFALO_REPAIR_MODE = previous;
    if (previousConfig === undefined)
      delete process.env.BUFFALO_INTEGRITY_SERVER_CONFIG;
    else process.env.BUFFALO_INTEGRITY_SERVER_CONFIG = previousConfig;
  }
});
