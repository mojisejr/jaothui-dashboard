/** @jest-environment node */
import { competitionAdminApiClient } from "../competition-admin-api-client";
import { layoutFixture, detailFixture } from "~/test-fixtures/export-layout";
jest.mock("~/env", () => ({
  env: {
    JAOTHUI_COMPETITION_ADMIN_API_BASE_URL: "https://source.example",
    JAOTHUI_COMPETITION_ADMIN_API_KEY: "server-only",
  },
}));
const original = global.fetch;
afterEach(() => {
  global.fetch = original;
});
it("loads event-local configuration with server authentication and no cache", async () => {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data: detailFixture() }),
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  await expect(
    competitionAdminApiClient.exportLayout("event.one"),
  ).resolves.toMatchObject({ exportPresentationVersion: 1 });
  const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
  expect(url.pathname).toBe("/api/admin/competitions/event.one/export-layout");
  expect(new Headers(init.headers).get("Authorization")).toBe(
    "Bearer server-only",
  );
  expect(init.cache).toBe("no-store");
});
it("previews without operation metadata and saves with revision/catalog guards", async () => {
  const detail = detailFixture();
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          exportPresentationVersion: 1,
          plan: detail.plan,
          rowCount: 1,
          ageWarningCount: 0,
          persisted: false,
        },
      }),
    })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ data: detail }) });
  global.fetch = fetchMock as unknown as typeof fetch;
  await competitionAdminApiClient.previewExportLayout("event.one", {
    layout: layoutFixture(),
  });
  await competitionAdminApiClient.saveExportLayout("event.one", {
    layout: layoutFixture(),
    operationId: "00000000-0000-4000-8000-000000000001",
    expectedRevision: "rev1",
    expectedCatalogFingerprint: "a".repeat(64),
  });
  const calls = fetchMock.mock.calls as [URL, RequestInit][];
  expect(calls[0]![0].pathname).toBe(
    "/api/admin/competitions/event.one/export-layout/preview",
  );
  expect(JSON.parse(calls[0]![1].body as string)).toEqual({
    layout: layoutFixture(),
  });
  expect(calls[1]![1].method).toBe("PATCH");
  expect(JSON.parse(calls[1]![1].body as string)).toMatchObject({
    expectedRevision: "rev1",
    expectedCatalogFingerprint: "a".repeat(64),
  });
});
it("rejects unsupported source presentation before exposing an editable layout", async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      data: { ...detailFixture(), exportPresentationVersion: undefined },
    }),
  }) as unknown as typeof fetch;
  await expect(
    competitionAdminApiClient.exportLayout("event.one"),
  ).rejects.toMatchObject({ code: "SOURCE_UPGRADE_REQUIRED" });
});
it("retains structured preflight diagnostics from source errors and the tRPC cause", async () => {
  const diagnostics = [
    {
      code: "UNMAPPED",
      message: "กรุณาผูกรุ่นเดิม",
      value: "รุ่นเดิม",
      registrationIds: ["r1"],
    },
  ];
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    status: 422,
    json: async () => ({
      error: {
        code: "EXPORT_LAYOUT_NOT_READY",
        message: "ตรวจรายการที่ขาด",
        details: { diagnostics },
      },
    }),
  }) as unknown as typeof fetch;
  await expect(
    competitionAdminApiClient.saveExportLayout("event.one", {
      layout: layoutFixture(),
      operationId: "00000000-0000-4000-8000-000000000001",
      expectedRevision: "rev",
      expectedCatalogFingerprint: "a".repeat(64),
    }),
  ).rejects.toMatchObject({
    code: "EXPORT_LAYOUT_NOT_READY",
    exportDiagnostics: diagnostics,
  });
});
it("reads every inventory page without adding registration personal fields", async () => {
  const response = {
    exportPresentationVersion: 1,
    items: [
      {
        eventId: "event.one",
        title: "งาน",
        state: "missing-layout",
        rowCount: 1,
        diagnostics: [{ code: "LAYOUT_MISSING", message: "ยังไม่ตั้งค่า" }],
        eventRevision: "rev",
        catalogFingerprint: "a".repeat(64),
        layoutFingerprint: null,
      },
    ],
    total: 2,
    page: 1,
    pageSize: 1,
    hasMore: true,
  };
  const fetchMock = jest
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ data: response }) });
  global.fetch = fetchMock as unknown as typeof fetch;
  expect(
    await competitionAdminApiClient.exportReadiness({ page: 1, pageSize: 1 }),
  ).toEqual(response);
  const [url] = fetchMock.mock.calls[0] as [URL];
  expect(url.pathname).toBe("/api/admin/competitions/export-readiness");
  expect(url.searchParams.get("pageSize")).toBe("1");
});

it("preserves unknown inventory counts and catalog fingerprints as null", async () => {
  global.fetch = jest
    .fn()
    .mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          exportPresentationVersion: 1,
          items: [
            {
              eventId: "pending",
              title: "งาน",
              state: "needs-review",
              rowCount: null,
              catalogFingerprint: null,
              eventRevision: "rev",
              layoutFingerprint: null,
              diagnostics: [
                { code: "SOURCE_INDEX_PENDING", message: "รอข้อมูลต้นทาง" },
              ],
            },
          ],
          page: 1,
          pageSize: 20,
          total: 1,
          hasMore: false,
        },
      }),
    }) as unknown as typeof fetch;
  const result = await competitionAdminApiClient.exportReadiness({
    page: 1,
    pageSize: 20,
  });
  expect(result.items[0]).toMatchObject({
    rowCount: null,
    catalogFingerprint: null,
  });
});
