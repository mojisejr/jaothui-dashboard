/** @jest-environment node */
import type { PrismaClient } from "@prisma/client";
import { sanityRouter } from "~/server/api/routers/r-sanity";
import { detailFixture } from "~/test-fixtures/export-layout";
const mockList = jest.fn();
const mockSanityFetch = jest.fn();
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
jest.mock("~/server/sanity", () => ({
  sanityClient: {
    fetch: (...args: unknown[]) => mockSanityFetch(...args) as unknown,
  },
}));
jest.mock("~/server/services/competition-admin-api-client", () => ({
  competitionAdminApiClient: {
    list: (...args: unknown[]) => mockList(...args) as unknown,
  },
  CompetitionApiError: class extends Error {},
}));
const caller = (token = "staff") =>
  sanityRouter.createCaller({ token, db: {} as PrismaClient });
const event = (id: string, title = "งานชื่อซ้ำ", lifecycle = "draft") => ({
  ...detailFixture().event,
  _id: id,
  title,
  policy: { ...detailFixture().event.policy, lifecycle },
});
const page = (
  items: ReturnType<typeof event>[],
  number: number,
  total: number,
) => ({ items, page: number, pageSize: 100, total, counts: { total } });
beforeEach(() => jest.clearAllMocks());
it("authenticates before source or Dashboard Sanity reads", async () => {
  await expect(caller("invalid").getEventsForExport()).rejects.toMatchObject({
    code: "UNAUTHORIZED",
  });
  expect(mockList).not.toHaveBeenCalled();
  expect(mockSanityFetch).not.toHaveBeenCalled();
});
it("loads every page including draft and closed events and preserves duplicate titles with deterministic ID ties", async () => {
  const first = Array.from({ length: 100 }, (_, index) =>
    event(`event-${String(index).padStart(3, "0")}`, `งาน ${index}`, "ongoing"),
  );
  const extra = [
    event("closed-z", "งานชื่อซ้ำ", "closed"),
    event("draft-a", "งานชื่อซ้ำ", "draft"),
  ];
  mockList
    .mockResolvedValueOnce(page(first, 1, 102))
    .mockResolvedValueOnce(page(extra, 2, 102));
  const result = await caller().getEventsForExport();
  expect(result.success).toBe(true);
  expect(result.data).toHaveLength(102);
  expect(
    result.data
      .filter((item) => item.title === "งานชื่อซ้ำ")
      .map((item) => item._id),
  ).toEqual(["closed-z", "draft-a"]);
  expect(result.data.map((item) => item._id)).toContain("draft-a");
  expect(result.data.map((item) => item._id)).toContain("closed-z");
  expect(mockList).toHaveBeenNthCalledWith(1, {
    search: "",
    page: 1,
    pageSize: 100,
  });
  expect(mockList).toHaveBeenNthCalledWith(2, {
    search: "",
    page: 2,
    pageSize: 100,
  });
  expect(result.data.every((item) => item._type === "event")).toBe(true);
  expect(mockSanityFetch).not.toHaveBeenCalled();
});
it.each(["incomplete", "duplicate", "total-change", "upstream-error"])(
  "rejects %s pages without returning a partial picker",
  async (kind) => {
    const first = Array.from({ length: 100 }, (_, index) =>
      event(`event-${index}`),
    );
    mockList.mockResolvedValueOnce(page(first, 1, 101));
    if (kind === "upstream-error")
      mockList.mockRejectedValueOnce(new Error("private source details"));
    else
      mockList.mockResolvedValueOnce(
        page(
          kind === "incomplete"
            ? []
            : [event(kind === "duplicate" ? "event-0" : "last")],
          2,
          kind === "total-change" ? 102 : 101,
        ),
      );
    const result = await caller().getEventsForExport();
    expect(result).toMatchObject({ success: false, data: [] });
    expect("error" in result && result.error).toMatch(/กรุณาลองใหม่/);
    expect(mockSanityFetch).not.toHaveBeenCalled();
    expect("error" in result && result.error).not.toContain("private");
  },
);
it("rejects inconsistent page metadata and returns a valid empty list truthfully", async () => {
  mockList.mockResolvedValueOnce({ ...page([], 2, 0) });
  expect(await caller().getEventsForExport()).toMatchObject({
    success: false,
    data: [],
  });
  mockList.mockResolvedValueOnce(page([], 1, 0));
  expect(await caller().getEventsForExport()).toEqual({
    success: true,
    data: [],
  });
  expect(mockList).toHaveBeenCalledTimes(2);
});
