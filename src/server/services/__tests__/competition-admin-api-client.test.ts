import {
  competitionAdminApiClient,
  toCompetitionTRPCError,
} from "../competition-admin-api-client";
jest.mock("~/env", () => ({
  env: {
    JAOTHUI_COMPETITION_ADMIN_API_BASE_URL: "https://source.example",
    JAOTHUI_COMPETITION_ADMIN_API_KEY: "server-only",
  },
}));
const originalFetch = global.fetch;
const timeout = AbortSignal.timeout.bind(AbortSignal);
beforeEach(() => {
  AbortSignal.timeout = () => new AbortController().signal;
});
afterAll(() => {
  AbortSignal.timeout = timeout;
});
afterEach(() => {
  global.fetch = originalFetch;
});
it("composes list filters and authenticates only with the server key", async () => {
  const mock = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      data: { items: [], total: 0, page: 2, pageSize: 20, counts: {} },
    }),
  });
  global.fetch = mock as unknown as typeof fetch;
  await competitionAdminApiClient.list({
    search: "งาน",
    lifecycle: "ended",
    registrationStatus: "closed-date",
    eventType: "royal",
    page: 2,
    pageSize: 20,
  });
  const [url, init] = mock.mock.calls[0] as [URL, RequestInit];
  expect(url.searchParams.get("search")).toBe("งาน");
  expect(url.searchParams.get("lifecycle")).toBe("ended");
  expect(new Headers(init.headers).get("Authorization")).toBe(
    "Bearer server-only",
  );
});
it("preserves operation ID and expected revision when retrying a write", async () => {
  const mock = jest.fn().mockResolvedValue({
    ok: false,
    status: 409,
    json: async () => ({
      error: { code: "REVISION_CONFLICT", message: "ข้อมูลเปลี่ยนแล้ว" },
    }),
  });
  global.fetch = mock as unknown as typeof fetch;
  await expect(
    competitionAdminApiClient.action("event.one", "publish", {
      operationId: "09e811fa-e610-43a1-bfca-43294bfd33d7",
      expectedRevision: "rev1",
    }),
  ).rejects.toMatchObject({ status: 409 });
  const [, init] = mock.mock.calls[0] as [URL, RequestInit];
  expect(JSON.parse(init.body as string)).toEqual({
    operationId: "09e811fa-e610-43a1-bfca-43294bfd33d7",
    expectedRevision: "rev1",
  });
});
it("maps conflicts to actionable safe errors", () => {
  expect(toCompetitionTRPCError({ status: 409, message: "ใหม่" }).code).toBe(
    "CONFLICT",
  );
});
it("composes event-scoped application filters without dropping status or level", async () => {
  const mock = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      data: {
        items: [],
        total: 0,
        page: 2,
        pageSize: 20,
        counts: { total: 4, pending: 2, accepted: 1, rejected: 1 },
        facets: { types: [], levels: [], sexes: [], colors: [] },
      },
    }),
  });
  global.fetch = mock as unknown as typeof fetch;
  await competitionAdminApiClient.applications("event.one", {
    search: "เจ้าทุย",
    status: "pending",
    type: "รุ่นพิเศษ",
    level: "province",
    sex: "ผู้",
    color: "ดำ",
    page: 2,
    pageSize: 20,
  });
  const [url, init] = mock.mock.calls[0] as [URL, RequestInit];
  expect(url.pathname).toBe("/api/admin/competitions/event.one/applications");
  expect(Object.fromEntries(url.searchParams)).toEqual({
    search: "เจ้าทุย",
    status: "pending",
    type: "รุ่นพิเศษ",
    level: "province",
    sex: "ผู้",
    color: "ดำ",
    page: "2",
    pageSize: "20",
  });
  expect(new Headers(init.headers).get("Authorization")).toBe(
    "Bearer server-only",
  );
});
it("forwards notification retry with approval revision and does not call approval endpoint", async () => {
  const mock = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data: { _id: "entry1", _rev: "entry-rev" } }),
  });
  global.fetch = mock as unknown as typeof fetch;
  const body = {
    operationId: "09e811fa-e610-43a1-bfca-43294bfd33d7",
    expectedRevision: "approval-rev",
  };
  await competitionAdminApiClient.retryNotification(
    "event.one",
    "entry1",
    body,
  );
  const [url, init] = mock.mock.calls[0] as [URL, RequestInit];
  expect(url.pathname).toBe(
    "/api/admin/competitions/event.one/applications/entry1/retry-notification",
  );
  expect(JSON.parse(init.body as string)).toEqual(body);
  expect(mock).toHaveBeenCalledTimes(1);
});
it("retains a useful duplicate warning rather than reporting every conflict as a stale revision", () => {
  expect(
    toCompetitionTRPCError({
      status: 409,
      code: "DUPLICATE_MICROCHIP",
      message: "มีเลขไมโครชิพนี้แล้ว ต้องระบุเหตุผลการลงทะเบียนซ้ำ",
    }).message,
  ).toContain("ไมโครชิพ");
});
it("posts deletion with both revisions and reason to the event-scoped source route", async () => {
  const mock = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      data: {
        registrationId: "entry1",
        previousCount: 2,
        registrationCount: 1,
      },
    }),
  });
  global.fetch = mock as unknown as typeof fetch;
  const body = {
    operationId: "09e811fa-e610-43a1-bfca-43294bfd33d7",
    expectedRevision: "event-rev",
    registrationRevision: "entry-rev",
    reason: "สมัครทดสอบระบบ ไม่ใช่ผู้สมัครจริง",
  };
  await expect(
    competitionAdminApiClient.deleteApplication("event.one", "entry1", body),
  ).resolves.toEqual({
    registrationId: "entry1",
    previousCount: 2,
    registrationCount: 1,
  });
  const [url, init] = mock.mock.calls[0] as [URL, RequestInit];
  expect(url.pathname).toBe(
    "/api/admin/competitions/event.one/applications/entry1/delete",
  );
  expect(init.method).toBe("POST");
  expect(JSON.parse(init.body as string)).toEqual(body);
});
it("posts recount with the viewed event revision", async () => {
  const mock = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      data: { previousCount: null, registrationCount: 0, changed: true },
    }),
  });
  global.fetch = mock as unknown as typeof fetch;
  const body = {
    operationId: "09e811fa-e610-43a1-bfca-43294bfd33d7",
    expectedRevision: "event-rev",
  };
  await competitionAdminApiClient.recountRegistrations("event.one", body);
  const [url, init] = mock.mock.calls[0] as [URL, RequestInit];
  expect(url.pathname).toBe("/api/admin/competitions/event.one/recount");
  expect(JSON.parse(init.body as string)).toEqual(body);
});
it.each(["REFERENCED_DOCUMENTS", "REGISTRATION_INDEX_PENDING"])(
  "keeps the source explanation for %s conflicts",
  (code) => {
    expect(
      toCompetitionTRPCError({ status: 409, code, message: "คำอธิบายจากระบบ" })
        .message,
    ).toBe("คำอธิบายจากระบบ");
  },
);
