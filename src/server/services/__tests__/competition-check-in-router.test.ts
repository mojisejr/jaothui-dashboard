/** @jest-environment node */
import type { PrismaClient } from "@prisma/client";
import { competitionsRouter } from "~/server/api/routers/r-competitions";
const mockConfirm = jest.fn();
const mockUndo = jest.fn();
const mockResolve = jest.fn();
jest.mock("superjson", () => ({
  __esModule: true,
  default: {
    serialize: (json: unknown) => ({ json }),
    deserialize: (value: { json: unknown }) => value.json,
  },
}));
jest.mock("~/server/db", () => ({ db: {} }));
jest.mock("~/server/services/auth.service", () => ({
  isAuth: (token: string) => token === "staff",
}));
jest.mock("~/server/services/competition-admin-api-client", () => ({
  competitionAdminApiClient: {
    checkIn: (...args: unknown[]) => mockConfirm(...args) as unknown,
    undoCheckIn: (...args: unknown[]) => mockUndo(...args) as unknown,
    resolveCheckIn: (...args: unknown[]) => mockResolve(...args) as unknown,
  },
  toCompetitionTRPCError: (error: unknown) => error,
}));
const caller = (token = "staff") =>
  competitionsRouter.createCaller({ token, db: {} as PrismaClient });
const input = {
  id: "event1",
  registrationId: "entry1",
  operationId: "00000000-0000-4000-8000-000000000001",
  expectedRevision: "r1",
};
beforeEach(() => jest.clearAllMocks());
it("does not resolve or mutate check-in without the shared staff authentication", async () => {
  await expect(caller("invalid").checkIn(input)).rejects.toMatchObject({
    code: "UNAUTHORIZED",
  });
  await expect(
    caller("invalid").undoCheckIn({
      ...input,
      reason: "แก้ไขการรายงานตัวผิดรุ่น",
    }),
  ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  await expect(
    caller("invalid").resolveCheckIn({
      token: "v1.opaque-token-for-testing-0123456789",
    }),
  ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  expect(mockConfirm).not.toHaveBeenCalled();
  expect(mockUndo).not.toHaveBeenCalled();
  expect(mockResolve).not.toHaveBeenCalled();
});
it("requires a real correction reason before sending an undo to the source", async () => {
  await expect(
    caller().undoCheckIn({ ...input, reason: "ผิด" }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(mockUndo).not.toHaveBeenCalled();
});
it("forwards only event/registration identifiers and explicit operation input to source", async () => {
  mockConfirm.mockResolvedValue({ checkInStatus: "checked_in" });
  await expect(caller().checkIn(input)).resolves.toEqual({
    checkInStatus: "checked_in",
  });
  expect(mockConfirm).toHaveBeenCalledWith("event1", "entry1", {
    operationId: input.operationId,
    expectedRevision: "r1",
  });
});
