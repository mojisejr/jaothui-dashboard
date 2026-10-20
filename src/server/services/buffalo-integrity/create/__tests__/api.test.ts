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
import { createBuffaloCreateRouter } from "~/server/api/routers/r-buffalo-create";
import { type CreateRuntime } from "../runtime";
import { type DraftInput } from "../contract";
import { IntegrityError } from "../../operations/hash";
const previous = { username: process.env.username, secret: process.env.secret };
beforeAll(() => {
  process.env.username = "phase3-shared";
  process.env.secret = "synthetic-test-secret";
});
afterAll(() => {
  for (const key of ["username", "secret"] as const) {
    if (previous[key] === undefined) delete process.env[key];
    else process.env[key] = previous[key];
  }
});
function context(
  token = jwt.sign({ username: process.env.username }, process.env.secret!),
) {
  return { token, db: {} as PrismaClient };
}
const id = "00000000-0000-4000-8000-000000000031";
const input: DraftInput = {
  name: "Synthetic",
  microchip: "999000000000031",
  certNo: "C",
  origin: "Thailand",
  height: 145,
  color: "Black",
  sex: "Male",
  rarity: "Normal",
  birthday: "2024-06-30",
  fatherId: "",
  motherId: "",
  detail: "",
};
test("create API requires verified shared auth before constructing any signer or database runtime", async () => {
  const factory = jest.fn();
  const caller = createBuffaloCreateRouter(factory).createCaller(
    context("invalid"),
  );
  await expect(caller.create({ key: id, input })).rejects.toMatchObject({
    code: "UNAUTHORIZED",
  });
  await expect(caller.view({ id })).rejects.toMatchObject({
    code: "UNAUTHORIZED",
  });
  expect(factory).not.toHaveBeenCalled();
});
test("ownership and all mutation authority come from server; errors redact internal bytes", async () => {
  const view = jest
    .fn()
    .mockRejectedValueOnce(new IntegrityError("OPERATION_NOT_FOUND"))
    .mockRejectedValueOnce(new Error("sensitive signed_bytes/privateKey"));
  const factory = () =>
      ({ workflow: { view }, engine: {} }) as unknown as CreateRuntime,
    caller = createBuffaloCreateRouter(factory).createCaller(context());
  await expect(caller.view({ id })).rejects.toMatchObject({
    code: "NOT_FOUND",
    message: "OPERATION_NOT_FOUND",
  });
  expect(view).toHaveBeenCalledWith(id, "shared:phase3-shared", {});
  await expect(caller.view({ id })).rejects.toMatchObject({
    message: "CREATE_SERVICE_UNAVAILABLE",
  });
});
test("client cannot supply owner, timestamps, calldata, signer or an execution plan", async () => {
  const factory = jest.fn(),
    caller = createBuffaloCreateRouter(factory).createCaller(context());
  for (const extra of [
    { owner: "other" },
    { createdAt: "today" },
    { calldata: "0x" },
    { signer: "0x" },
    { plan: {} },
  ])
    await expect(
      caller.create({ key: id, input, ...extra } as Parameters<
        typeof caller.create
      >[0]),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(factory).not.toHaveBeenCalled();
});
test("production activation stays closed for create API", async () => {
  const caller = createBuffaloCreateRouter().createCaller(context());
  await expect(caller.create({ key: id, input })).rejects.toMatchObject({
    code: "PRECONDITION_FAILED",
    message: "INTEGRITY_FEATURE_DISABLED",
  });
});
