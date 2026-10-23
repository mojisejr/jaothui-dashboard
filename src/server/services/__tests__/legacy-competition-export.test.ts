/** @jest-environment node */
jest.mock("superjson", () => ({
  __esModule: true,
  default: {
    serialize: (value: unknown) => ({ json: value }),
    deserialize: (value: { json: unknown }) => value.json,
  },
}));
jest.mock("~/server/db", () => ({ db: {} }));
jest.mock("~/server/services/auth.service", () => ({
  isAuth: (token?: string) => token === "valid-session",
}));
const mockSanityFetch = jest.fn();
jest.mock("~/server/sanity", () => ({
  sanityClient: {
    fetch: (...args: unknown[]) => mockSanityFetch(...args) as unknown,
  },
}));
jest.mock("~/env", () => ({
  env: {
    JAOTHUI_COMPETITION_ADMIN_API_BASE_URL: "https://source.example",
    JAOTHUI_COMPETITION_ADMIN_API_KEY: "server-only-export-test",
    JAOTHUI_COMPETITION_ADMIN_WRITE_ENABLED: false,
  },
}));
import { CFB, read, utils } from "xlsx";
import { sanityRouter } from "~/server/api/routers/r-sanity";
import { compressLegacyWorkbook } from "../legacy-competition-export.service";
import { encodeCompetitionClass } from "~/lib/competition-classes";

const fetchMock = jest.fn();
const originalFetch = global.fetch;
const caller = (token = "valid-session") =>
  sanityRouter.createCaller({ token, db: {} } as Parameters<
    typeof sanityRouter.createCaller
  >[0]);
const eventId = "event.legacy-106";
function fixture() {
  const row = {
    _id: "r1",
    _rev: "r1rev",
    event: { _ref: eventId },
    name: "ควายทดสอบ",
    birthday: "2020-01-01",
    microchip: "000001",
    ownerName: "เจ้าของทดสอบ",
    ownerTel: "0000000000",
    farmName: "ฟาร์มทดสอบ",
    type: "ไม่เกิน 12 เดือน",
    level: "national",
    sex: "male",
    color: "black",
    fatherName: "พ่อ",
    motherName: "แม่",
    buffaloAge: 0,
    exportAge: 0,
    ageSource: "stored",
    ageWarning: null,
  };
  return {
    event: {
      _id: eventId,
      _rev: "rev",
      title: "../งานชื่อซ้ำ/ทดสอบ",
      buffaloAgeDeadline: "2026-10-16",
      startAt: "2099-01-01",
      registrationCount: 3,
      catalogs: { national: [], province: [] },
      policy: {
        today: "2026-10-16",
        lifecycle: "ended",
        publicRegistration: "closed-date",
        publicVisible: true,
        onsiteAllowed: false,
        warnings: [],
      },
    },
    registrations: [
      row,
      {
        ...row,
        _id: "r2",
        buffaloAge: null,
        exportAge: 13,
        ageSource: "cutoff",
        ageWarning: "calculated-from-cutoff",
        type: encodeCompetitionClass({
          name: "รุ่นพิเศษ",
          kind: "special",
          minMonths: null,
          maxMonths: null,
          minInclusive: true,
          group: "",
          criteria: "ตรวจฟัน",
        }),
      },
      {
        ...row,
        _id: "r3",
        birthday: "invalid",
        buffaloAge: null,
        exportAge: null,
        ageSource: "missing",
        ageWarning: "missing-or-invalid-age",
      },
    ],
    rowCount: 3,
  };
}
const zipEntries = (buffer: Buffer) =>
  (
    CFB as {
      read: (
        value: Buffer,
        options: { type: string },
      ) => {
        FileIndex: Array<{ name: string; content: Uint8Array }>;
        FullPaths: string[];
      };
    }
  ).read(buffer, { type: "buffer" });
function zipText(buffer: Buffer, suffix: string) {
  const zip = zipEntries(buffer);
  const index = zip.FullPaths.findIndex((path) => path.endsWith(suffix));
  if (index < 0) throw new Error(`Missing ZIP entry ${suffix}`);
  return Buffer.from(zip.FileIndex[index]!.content).toString("utf8");
}
beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = fetchMock as unknown as typeof fetch;
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ data: fixture() }),
  });
});
afterAll(() => {
  global.fetch = originalFetch;
});

it("rejects unauthenticated actual legacy callers before any source or Sanity read", async () => {
  for (const method of ["exportEventData", "exportEventDataToDocx"] as const)
    await expect(caller("expired")[method]({ eventId })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  expect(fetchMock).not.toHaveBeenCalled();
  expect(mockSanityFetch).not.toHaveBeenCalled();
});
it("rejects malformed IDs and preserves canonical dotted IDs regardless of duplicate titles and write kill switch", async () => {
  await expect(
    caller().exportEventData({ eventId: '" || true' }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  mockSanityFetch.mockResolvedValue([
    { _id: eventId, title: "งานชื่อซ้ำ", _type: "event" },
    { _id: "other", title: "งานชื่อซ้ำ", _type: "event" },
  ]);
  const events = await caller().getEventsForExport();
  expect(events.data).toHaveLength(2);
  mockSanityFetch.mockClear();
  const result = await caller().exportEventData({ eventId });
  expect(result.success).toBe(true);
  const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
  expect(url.pathname).toBe(`/api/admin/competitions/${eventId}/export`);
  expect(new Headers(init.headers).get("Authorization")).toBe(
    "Bearer server-only-export-test",
  );
  expect(mockSanityFetch).not.toHaveBeenCalled();
});
it("returns real base64 XLSX, truthful counts and age warnings using authoritative ages including stored zero", async () => {
  const result = await caller().exportEventData({ eventId });
  expect(result.success).toBe(true);
  const data = result.data!;
  const bytes = Buffer.from(data.buffer, "base64");
  const book = read(bytes, { type: "buffer" });
  expect(data).toMatchObject({
    recordCount: 3,
    sheetCount: book.SheetNames.length,
    isCompressed: false,
    originalSize: bytes.length,
    compressedSize: bytes.length,
  });
  expect(data.filename).toMatch(/event\.legacy-106_.*\.xlsx$/);
  expect(data.filename).not.toMatch(/[\\/]|\.\./);
  const rows = book.SheetNames.slice(1).flatMap((name) =>
    utils.sheet_to_json<unknown[]>(book.Sheets[name]!, { header: 1 }),
  );
  expect(rows.some((row) => row[4] === 0 && row[12] === "r1")).toBe(true);
  expect(rows.some((row) => row[4] === 13 && row[12] === "r2")).toBe(true);
  expect(rows.some((row) => row[4] === "ต้องตรวจสอบ" && row[12] === "r3")).toBe(
    true,
  );
  expect(
    rows.some((row) => row.some((cell) => String(cell).includes("รุ่นพิเศษ"))),
  ).toBe(true);
  expect(data.warnings).toEqual([
    expect.stringContaining("วันตัดอายุของงาน"),
    expect.stringContaining("ต้องตรวจสอบ"),
  ]);
});
it("returns actual DOCX bundle with authoritative ages, human class and age warnings", async () => {
  const result = await caller().exportEventDataToDocx({ eventId });
  expect(result.success).toBe(true);
  const data = result.data!;
  expect(data).toMatchObject({ recordCount: 3, fileCount: 3 });
  expect(data.filename).toMatch(/_registrations_.*\.zip$/);
  const bytes = Buffer.from(data.buffer, "base64");
  const docs = zipEntries(bytes).FileIndex.filter((entry) =>
    entry.name.endsWith(".docx"),
  );
  expect(docs).toHaveLength(3);
  const xmls = docs.map((entry) =>
    zipText(Buffer.from(entry.content), "word/document.xml"),
  );
  expect(xmls[0]).toContain(">0</w:t>");
  expect(xmls[1]).toContain("รุ่นพิเศษ");
  expect(xmls[1]).toContain("วันตัดอายุของงาน");
  expect(xmls[2]).toContain("ไม่ทราบอายุ — ต้องตรวจสอบ");
  expect(xmls.join("")).not.toContain("@jaothui/class:v1:");
  expect(zipText(bytes, "event-info.txt")).toContain(eventId);
});
it.each(["exportEventData", "exportEventDataToDocx"] as const)(
  "fails %s safely for unavailable source, event mismatch and foreign registrations without Sanity fallback",
  async (method) => {
    fetchMock.mockRejectedValueOnce(new Error("private upstream details"));
    const failure = await caller()[method]({ eventId });
    expect(failure).toMatchObject({ success: false, data: null });
    expect("error" in failure && failure.error).not.toContain(
      "private upstream",
    );
    for (const mismatch of ["event", "row"]) {
      const data = fixture();
      if (mismatch === "event") data.event._id = "other";
      else data.registrations[0]!.event._ref = "other";
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data }),
      });
      expect(await caller()[method]({ eventId })).toMatchObject({
        success: false,
        data: null,
        error: expect.stringMatching(/ไม่ตรง|ต่างงาน/) as unknown,
      });
    }
    expect(mockSanityFetch).not.toHaveBeenCalled();
  },
);
it("distinguishes a valid empty event from source errors", async () => {
  const data = { ...fixture(), registrations: [], rowCount: 0 };
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ data }) });
  const result = await caller().exportEventData({ eventId });
  expect(result.data).toMatchObject({
    recordCount: 0,
    sheetCount: 1,
    warnings: [expect.stringContaining("ไม่มีใบสมัคร")],
  });
  fetchMock.mockResolvedValueOnce({
    ok: false,
    status: 403,
    json: async () => ({ error: { code: "FORBIDDEN", message: "private" } }),
  });
  expect(await caller().exportEventData({ eventId })).toMatchObject({
    success: false,
    data: null,
  });
});
it("retains the >10MB ZIP envelope and exact workbook entry without compressing small workbooks", async () => {
  const small = Buffer.from("small workbook");
  expect(await compressLegacyWorkbook(small, "event.xlsx")).toEqual({
    buffer: small,
    filename: "event.xlsx",
    isCompressed: false,
  });
  const large = Buffer.alloc(10 * 1024 * 1024 + 1, 65);
  const result = await compressLegacyWorkbook(large, "event.xlsx");
  expect(result).toMatchObject({ filename: "event.zip", isCompressed: true });
  const entry = zipEntries(result.buffer).FileIndex.find(
    (item) => item.name === "event.xlsx",
  );
  expect(Buffer.from(entry!.content).equals(large)).toBe(true);
});
