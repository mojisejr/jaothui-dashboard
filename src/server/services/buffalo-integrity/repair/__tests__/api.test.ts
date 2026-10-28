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
test("router exposes only read capabilities and rejects client complete assertions", async () => {
  const factory = jest.fn<RepairDiagnosis, []>(() => {
    throw Error("unreachable");
  });
  const router = createBuffaloRepairRouter(factory);
  expect(Object.keys(router._def.procedures).sort()).toEqual([
    "preview",
    "scanPage",
    "startScan",
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
