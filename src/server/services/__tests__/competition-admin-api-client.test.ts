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
  const mock = jest
    .fn()
    .mockResolvedValue({
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
  const mock = jest
    .fn()
    .mockResolvedValue({
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
