import { CFB, read, utils } from "xlsx";
import {
  exportDataSchema,
  type ExportData,
} from "~/lib/competition-applications";
import {
  createCompetitionWorkbook,
  createCompetitionDocxZip,
  validateExportData,
  safeExportName,
} from "../competition-export.service";
import { encodeCompetitionClass } from "~/lib/competition-classes";

function fixture(): ExportData {
  const event = {
    _id: "event-106",
    _rev: "rev",
    title: "../งานทดสอบ/\r\nชื่อ",
    buffaloAgeDeadline: "2026-10-16",
    registrationCount: 3,
    catalogs: { national: [], province: [] },
    policy: {
      today: "2026-10-16",
      lifecycle: "ongoing",
      publicRegistration: "closed-manual",
      publicVisible: true,
      onsiteAllowed: true,
      warnings: [],
    },
  };
  const base = {
    registrationPolicyVersion: 1,
    approvalRequirement: "not_required",
    registrationStatus: "registered",
    _id: "r1",
    _rev: "r1rev",
    event: { _ref: event._id },
    name: "../../ควายทดสอบ",
    birthday: "2026-10-16",
    microchip: "000001",
    ownerName: '=HYPERLINK("https://invalid")',
    ownerTel: "0800000000",
    type: "ไม่เกิน 12 เดือน",
    level: "ประเทศ",
    sex: "male",
    color: "black",
    fatherName: "พ่อ",
    motherName: "แม่",
    farmName: "ฟาร์ม",
    buffaloAge: 0,
    exportAge: 0,
    ageSource: "stored",
    ageWarning: null,
  };
  return exportDataSchema.parse({
    registrationPolicyVersion: 1,
    event,
    rowCount: 3,
    registrations: [
      base,
      {
        ...base,
        _id: "r2",
        name: "สอง",
        type: encodeCompetitionClass({
          name: "รุ่นพิเศษ",
          kind: "special",
          minMonths: null,
          maxMonths: null,
          minInclusive: true,
          group: "",
          criteria: "ตรวจฟัน",
        }),
        buffaloAge: null,
        exportAge: 13,
        ageSource: "cutoff",
        ageWarning: "calculated-from-cutoff",
      },
      {
        ...base,
        _id: "r3",
        name: "สาม",
        birthday: "invalid",
        buffaloAge: null,
        exportAge: null,
        ageSource: "missing",
        ageWarning: "missing-or-invalid-age",
      },
    ],
  });
}
const readZip = (buffer: Buffer) =>
  (
    CFB as {
      read: (
        value: Buffer,
        options: { type: string },
      ) => {
        FullPaths: string[];
        FileIndex: Array<{ name: string; content: Uint8Array }>;
      };
    }
  ).read(buffer, { type: "buffer" });
function zipText(buffer: Buffer, suffix: string): string {
  const zip = readZip(buffer);
  const i = zip.FullPaths.findIndex((path) => path.endsWith(suffix));
  if (i < 0) throw new Error(`Missing ZIP entry ${suffix}`);
  return Buffer.from(zip.FileIndex[i]!.content).toString("utf8");
}
it("writes event-context XLSX with actual multiple sheets, stored zero, source fallback, missing-age warnings and no formulas", () => {
  const data = fixture();
  const buffer = createCompetitionWorkbook("event-106", data);
  const book = read(buffer, { type: "buffer" });
  expect(book.SheetNames).toHaveLength(3);
  const summary = utils.sheet_to_json(book.Sheets[book.SheetNames[0]!]!, {
    header: 1,
  });
  expect(summary).toContainEqual(["รหัสงาน", "event-106"]);
  expect(summary).toContainEqual(["จำนวนใบสมัคร", 3]);
  const rows = book.SheetNames.slice(1).flatMap((name) =>
    utils.sheet_to_json<unknown[]>(book.Sheets[name]!, { header: 1 }),
  );
  expect(rows.some((row) => row[4] === 0 && row[12] === "r1")).toBe(true);
  expect(rows.some((row) => row[4] === 13 && row[10] === "cutoff")).toBe(true);
  expect(rows.some((row) => row[4] === "ต้องตรวจสอบ" && row[12] === "r3")).toBe(
    true,
  );
  for (const sheet of Object.values(book.Sheets)) {
    for (const [key, cell] of Object.entries(sheet))
      if (!key.startsWith("!"))
        expect((cell as { f?: unknown }).f).toBeUndefined();
  }
  expect(
    rows.some((row) => row.includes('=HYPERLINK("https://invalid")')),
  ).toBe(true);
  expect(buffer.includes(Buffer.from("@jaothui/class:v1:"))).toBe(false);
});
it("generates actual DOCX ZIP contents with 3 safe named forms, authoritative zero and no fallback-to-today for missing age", async () => {
  const data = fixture();
  const buffer = await createCompetitionDocxZip("event-106", data);
  const zip = readZip(buffer);
  const docFiles = zip.FileIndex.filter((entry) =>
    entry.name.endsWith(".docx"),
  );
  expect(docFiles).toHaveLength(3);
  expect(
    docFiles.every(
      (entry) => !/[\\/]/.test(entry.name) && !entry.name.includes(".."),
    ),
  ).toBe(true);
  const firstXml = zipText(
    Buffer.from(docFiles[0]!.content),
    "word/document.xml",
  );
  expect(firstXml).toContain("อ้างอิงใบสมัคร: r1");
  expect(firstXml).toContain(">0</w:t>");
  expect(firstXml).toContain("งานทดสอบ");
  const secondXml = zipText(
    Buffer.from(docFiles[1]!.content),
    "word/document.xml",
  );
  expect(secondXml).toContain("รุ่นพิเศษ");
  expect(secondXml).toContain("วันตัดอายุของงาน");
  expect(secondXml).not.toContain("@jaothui/class:v1:");
  const thirdXml = zipText(
    Buffer.from(docFiles[2]!.content),
    "word/document.xml",
  );
  expect(thirdXml).toContain("ไม่ทราบอายุ — ต้องตรวจสอบ");
  expect(zipText(buffer, "event-info.txt")).toContain("รหัสงาน: event-106");
});
it("rejects event mismatch, foreign registrations, repeated IDs and age mutation before generation", () => {
  const data = fixture();
  expect(() => validateExportData("other", data)).toThrow(/ไม่ตรง/);
  data.registrations[0]!.event = { _ref: "other" };
  expect(() => createCompetitionWorkbook("event-106", data)).toThrow(/ต่างงาน/);
  data.registrations[0]!.event = { _ref: "event-106" };
  data.registrations[1]!._id = "r1";
  expect(() => validateExportData("event-106", data)).toThrow(/ซ้ำ/);
  data.registrations[1]!._id = "r2";
  data.registrations[0]!.exportAge = 1;
  expect(() => validateExportData("event-106", data)).toThrow(/อายุที่บันทึก/);
});
it("exports an empty event as an explicit summary workbook and ZIP manifest", async () => {
  const data = { ...fixture(), rowCount: 0, registrations: [] };
  const book = read(createCompetitionWorkbook("event-106", data), {
    type: "buffer",
  });
  expect(book.SheetNames).toEqual(["ข้อมูลงาน"]);
  expect(
    utils.sheet_to_json(book.Sheets["ข้อมูลงาน"]!, { header: 1 }),
  ).toContainEqual(["สถานะข้อมูล", "ไม่มีใบสมัครในงานนี้"]);
  expect(
    zipText(
      await createCompetitionDocxZip("event-106", data),
      "event-info.txt",
    ),
  ).toContain("ไม่มีใบสมัครในงานนี้");
  expect(safeExportName("../a\r\n/evil.zip")).not.toMatch(/[\r\n/\\]|\.\./);
  expect(
    Buffer.byteLength(safeExportName("งานยาว".repeat(100)), "utf8"),
  ).toBeLessThanOrEqual(180);
});
it("keeps the same microchip entered at national and province levels as two grouped rows", () => {
  const data = fixture();
  const national = data.registrations[0]!;
  const twoLevels = exportDataSchema.parse({
    ...data,
    rowCount: 2,
    registrations: [
      national,
      { ...national, _id: "r1-province", level: "จังหวัด" },
    ],
  });
  const book = read(createCompetitionWorkbook("event-106", twoLevels), {
    type: "buffer",
  });
  expect(book.SheetNames).toHaveLength(3);
  const ids = book.SheetNames.slice(1).flatMap((name) =>
    utils
      .sheet_to_json<unknown[]>(book.Sheets[name]!, { header: 1 })
      .filter((row) => row.includes("000001"))
      .map((row) => row[12]),
  );
  expect(ids.sort()).toEqual(["r1", "r1-province"]);
});

it.each([
  ["not_required", "registered", false, "สมัครสำเร็จ"],
  ["required", "pending", null, "รอตรวจสอบ"],
  ["required", "accepted", true, "อนุมัติแล้ว"],
  ["required", "rejected", false, "ไม่อนุมัติ"],
  ["unknown", "needs_type_review", true, "ต้องตรวจประเภทงาน"],
] as const)(
  "exports source effective %s/%s labels in XLSX and DOCX without rewriting raw history",
  async (approvalRequirement, registrationStatus, result, label) => {
    const data = fixture();
    const row = data.registrations[0]!;
    Object.assign(row, {
      approvalRequirement,
      registrationStatus,
      approval: {
        _id: "a1",
        _rev: "a1rev",
        approvementResult: result,
        comment: "historical",
        notificationState: "sent",
        approvementDate: null,
        notificationUpdatedAt: null,
      },
    });
    data.registrations = [row];
    data.rowCount = 1;
    const book = read(createCompetitionWorkbook("event-106", data), {
      type: "buffer",
    });
    const rows = utils.sheet_to_json<unknown[]>(
      book.Sheets[book.SheetNames[1]!]!,
      { header: 1 },
    );
    expect(rows.find((cells) => cells[12] === "r1")?.[13]).toBe(label);
    const zip = readZip(await createCompetitionDocxZip("event-106", data));
    const doc = zip.FileIndex.find((file) => file.name.endsWith(".docx"))!;
    expect(zipText(Buffer.from(doc.content), "word/document.xml")).toContain(
      `สถานะใบสมัคร: ${label}`,
    );
    expect(row.approval?.approvementResult).toBe(result);
  },
);
