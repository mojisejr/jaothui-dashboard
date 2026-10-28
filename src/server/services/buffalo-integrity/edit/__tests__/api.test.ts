/** @jest-environment node */
jest.mock("superjson", () => ({
  __esModule: true,
  default: {
    serialize: (v: unknown) => ({ json: v }),
    deserialize: (v: { json: unknown }) => v.json,
  },
}));
jest.mock("~/server/db", () => ({ db: {} }));
import jwt from "jsonwebtoken";
import { type PrismaClient } from "@prisma/client";
import { createBuffaloEditRouter } from "~/server/api/routers/r-buffalo-edit";
import { type EditRuntime } from "../runtime";
import { editPatchSchema } from "../contract";
import { buffaloIntentSchema } from "../../intent";
import { intent } from "../../operations/testing-fixtures";
const saved = { username: process.env.username, secret: process.env.secret };
beforeAll(() => {
  process.env.username = "phase4-shared";
  process.env.secret = "synthetic-test-secret";
});
afterAll(() => {
  for (const k of ["username", "secret"] as const) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});
const context = (
  token = jwt.sign({ username: process.env.username }, process.env.secret!),
) => ({ token, db: {} as PrismaClient });
const input = {
  key: "00000000-0000-4000-8000-000000000041",
  microchip: "999000000004001",
  tokenId: "901",
  expectedRevision: "ab".repeat(32),
  patch: { name: "new" },
};
test("all edit endpoints reject expired/shared invalid auth before constructing runtime/signers", async () => {
  const factory = jest.fn(),
    caller = createBuffaloEditRouter(factory).createCaller(context("expired"));
  for (const fn of [
    () => caller.details(input.microchip),
    () => caller.create(input),
    () => caller.prepare({ id: input.key, version: 0 }),
    () => caller.advance({ id: input.key, version: 0 }),
    () => caller.list("901"),
    () => caller.cancel({ id: input.key }),
  ])
    await expect(fn()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  expect(factory).not.toHaveBeenCalled();
});
test("signed authority, ownership and stale version come from server; no client plan/hash accepted", async () => {
  const factory = jest.fn(),
    caller = createBuffaloEditRouter(factory).createCaller(context());
  for (const extra of [
    { owner: "other" },
    { plan: {} },
    { hash: "0x00" },
    { actualToken: "2" },
  ])
    await expect(caller.create({ ...input, ...extra })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  expect(factory).not.toHaveBeenCalled();
});
test("shared account and exact expectedVersion reach the same durable engine", async () => {
  const advance = jest.fn(),
    view = jest.fn().mockResolvedValue({ state: "CHAIN_PENDING" }),
    factory = () =>
      ({ engine: { advance }, workflow: { view } }) as unknown as EditRuntime,
    caller = createBuffaloEditRouter(factory).createCaller(context());
  await caller.advance({ id: input.key, version: 7 });
  expect(advance).toHaveBeenCalledWith(
    input.key,
    "shared:phase4-shared",
    "resume",
    7,
  );
});
test("edit runtime remains hard-off in product with no live signer construction", async () => {
  const caller = createBuffaloEditRouter().createCaller(context());
  await expect(caller.create(input)).rejects.toMatchObject({
    message: "INTEGRITY_FEATURE_DISABLED",
  });
});
test("every invalid patch/known unprojectable value rejects before plan or signature", () => {
  for (const patch of [
    { height: "2147483648" },
    { height: "9007199254740992" },
    { microchip: "99900000000400a" },
    { sex: "invalid" },
    { birthday: "2023-02-29" },
    { name: "" },
    { dna: "javascript:bad" },
    { name: "a", certNo: "b" },
    {},
  ])
    expect(editPatchSchema.safeParse(patch).success).toBe(false);
  expect(editPatchSchema.parse({ height: "2147483647" }).height).toBe(
    "2147483647",
  );
  expect(
    buffaloIntentSchema.safeParse({ ...intent.buffalo, height: 2147483648 })
      .success,
  ).toBe(false);
});
test("authenticated details use dedicated reader without constructing writer runtime", async () => {
  const writer = jest.fn(() => {
    throw Error("signer must not be loaded for detail lookup");
  });
  const reader = jest.fn(async () => null);
  const caller = createBuffaloEditRouter(writer, reader).createCaller(
    context(),
  );
  expect(await caller.details(input.microchip)).toBeNull();
  expect(reader).toHaveBeenCalledWith(input.microchip);
  expect(writer).not.toHaveBeenCalled();
});
