import { competitionAdminApiClient } from "../competition-admin-api-client";
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
afterEach(() => {
  global.fetch = originalFetch;
});
afterAll(() => {
  AbortSignal.timeout = timeout;
});
const application = {
  _id: "entry1",
  _rev: "r2",
  registrationPolicyVersion: 1,
  approvalRequirement: "not_required",
  registrationStatus: "registered",
  checkInVersion: 1,
  checkInStatus: "checked_in",
  checkedInAt: "2026-10-30T08:00:00Z",
  checkedInBy: "dashboard-shared",
  checkInEligibility: { eligible: true, reason: null },
  checkInHistory: [],
};
function source(data: unknown) {
  const mock = jest
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ data }) });
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}
it.each(["checkIn", "undoCheckIn"] as const)(
  "forwards %s through the authenticated source route with immutable operation identity",
  async (action) => {
    const mock = source(application);
    const input = {
      operationId: "00000000-0000-4000-8000-000000000001",
      expectedRevision: "r1",
      reason: "ตรวจใบสมัครผิดรุ่นทดสอบ",
    };
    await competitionAdminApiClient[action]("event1", "entry1", input);
    const [url, init] = mock.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe(
      `/api/admin/competitions/event1/applications/entry1/${action === "checkIn" ? "check-in" : "undo-check-in"}`,
    );
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual(input);
    expect(new Headers(init.headers).get("Authorization")).toBe(
      "Bearer server-only",
    );
    expect(init.cache).toBe("no-store");
  },
);
it("does not treat an old-source success response as a completed check-in", async () => {
  const old = { ...application } as Partial<typeof application>;
  delete old.checkInVersion;
  source(old);
  await expect(
    competitionAdminApiClient.checkIn("event1", "entry1", {
      operationId: "00000000-0000-4000-8000-000000000001",
      expectedRevision: "r1",
    }),
  ).rejects.toMatchObject({ code: "SOURCE_UPGRADE_REQUIRED" });
});
it("keeps the opaque QR token in a POST body, not the source query string", async () => {
  const mock = source({
    checkInVersion: 1,
    eventId: "event1",
    registrationId: "entry1",
  });
  await competitionAdminApiClient.resolveCheckIn(
    "v1.opaque-example-token-0123456789",
  );
  const [url, init] = mock.mock.calls[0] as [URL, RequestInit];
  expect(url.pathname).toBe("/api/admin/competitions/check-in/resolve");
  expect(url.search).toBe("");
  expect(init.method).toBe("POST");
  expect(JSON.parse(init.body as string)).toEqual({
    token: "v1.opaque-example-token-0123456789",
  });
});
