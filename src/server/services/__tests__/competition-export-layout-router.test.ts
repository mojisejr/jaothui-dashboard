/** @jest-environment node */
import { TRPCError } from "@trpc/server";
import type { PrismaClient } from "@prisma/client";
import { competitionsRouter } from "~/server/api/routers/r-competitions";
import { layoutFixture } from "~/test-fixtures/export-layout";
const mockGet = jest.fn();
const mockPreview = jest.fn();
const mockSave = jest.fn();
const mockInventory = jest.fn();
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
    exportLayout: (...args: unknown[]) => mockGet(...args) as unknown,
    previewExportLayout: (...args: unknown[]) =>
      mockPreview(...args) as unknown,
    saveExportLayout: (...args: unknown[]) => mockSave(...args) as unknown,
    exportReadiness: (...args: unknown[]) => mockInventory(...args) as unknown,
  },
  toCompetitionTRPCError: (error: unknown) => error,
}));
const caller = (token = "staff") =>
  competitionsRouter.createCaller({ token, db: {} as PrismaClient });
beforeEach(() => jest.clearAllMocks());
it("protects layout read, read-only preview, save and inventory", async () => {
  const no = caller("invalid");
  for (const work of [
    () => no.exportLayout({ id: "event.one" }),
    () => no.previewExportLayout({ id: "event.one", layout: layoutFixture() }),
    () =>
      no.saveExportLayout({
        id: "event.one",
        layout: layoutFixture(),
        operationId: "00000000-0000-4000-8000-000000000001",
        expectedRevision: "rev",
        expectedCatalogFingerprint: "a".repeat(64),
      }),
    () => no.exportReadiness({ page: 1, pageSize: 20 }),
  ])
    await expect(work()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  expect(mockGet).not.toHaveBeenCalled();
  expect(mockPreview).not.toHaveBeenCalled();
  expect(mockSave).not.toHaveBeenCalled();
  expect(mockInventory).not.toHaveBeenCalled();
});
it("preserves exact event bindings and narrow revision-checked save input", async () => {
  const c = caller();
  await c.exportLayout({ id: "event.one" });
  await c.previewExportLayout({ id: "event.one", layout: layoutFixture() });
  const body = {
    layout: layoutFixture(),
    operationId: "00000000-0000-4000-8000-000000000001",
    expectedRevision: "rev",
    expectedCatalogFingerprint: "a".repeat(64),
  };
  await c.saveExportLayout({ id: "event.one", ...body });
  await c.exportReadiness({ page: 2, pageSize: 50 });
  expect(mockGet).toHaveBeenCalledWith("event.one");
  expect(mockPreview).toHaveBeenCalledWith("event.one", {
    layout: layoutFixture(),
  });
  expect(mockSave).toHaveBeenCalledWith("event.one", body);
  expect(mockInventory).toHaveBeenCalledWith({ page: 2, pageSize: 50 });
});
it("rejects invalid Thai labels and malformed catalog guards before source write", async () => {
  const layout = layoutFixture();
  layout.categories[0]!.fullLabelTh = "รุ่น Calf";
  await expect(
    caller().previewExportLayout({ id: "event.one", layout }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  await expect(
    caller().saveExportLayout({
      id: "event.one",
      layout: layoutFixture(),
      operationId: "00000000-0000-4000-8000-000000000001",
      expectedRevision: "rev",
      expectedCatalogFingerprint: "old",
    }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(mockPreview).not.toHaveBeenCalled();
  expect(mockSave).not.toHaveBeenCalled();
});
it("serializes source export diagnostics for actionable browser failures", () => {
  const cause = Object.assign(new Error("ตรวจรุ่นก่อนดาวน์โหลด"), {
    exportDiagnostics: [
      {
        code: "UNMAPPED",
        message: "ยังไม่ผูกรุ่น",
        value: "รุ่นเดิม",
        registrationIds: ["r1"],
      },
    ],
  });
  const error = new TRPCError({
    code: "BAD_REQUEST",
    message: cause.message,
    cause,
  });
  const shape = {
    message: error.message,
    code: -32600 as const,
    data: {
      code: "BAD_REQUEST" as const,
      httpStatus: 400,
      path: "competitions.saveExportLayout",
    },
  };
  const formatted = competitionsRouter._def._config.errorFormatter({
    shape,
    error,
    type: "mutation",
    path: "competitions.saveExportLayout",
    input: undefined,
    ctx: { token: "staff", db: {} as PrismaClient },
  });
  expect(formatted.data.exportDiagnostics).toEqual(cause.exportDiagnostics);
  expect(formatted.data.stack).toBeUndefined();
});
