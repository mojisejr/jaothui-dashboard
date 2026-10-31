/** @jest-environment node */
import { CFB, read, utils, type CellObject, type WorkSheet } from "xlsx";
import contract from "~/test-fixtures/competition-export-contract.json";
import { exportDataSchema } from "~/lib/competition-applications";
import {
  createCompetitionWorkbook,
  createCompetitionDocxZip,
} from "../competition-export.service";

const cell = (sheet: WorkSheet, address: string) =>
  sheet[address] as CellObject | undefined;
const zip = (buffer: Buffer) =>
  (
    CFB as {
      read: (
        input: Buffer,
        options: { type: string },
      ) => {
        FullPaths: string[];
        FileIndex: Array<{ name: string; content: Uint8Array }>;
      };
    }
  ).read(buffer, { type: "buffer" });
function zipText(buffer: Buffer, path: string) {
  const archive = zip(buffer);
  const index = archive.FullPaths.findIndex((name) => name.endsWith(path));
  if (index < 0) throw new Error(`Missing ZIP entry ${path}`);
  return Buffer.from(archive.FileIndex[index]!.content).toString("utf8");
}
const statuses: Record<string, string> = {
  registered: "สมัครสำเร็จ",
  pending: "รอตรวจสอบ",
  accepted: "อนุมัติแล้ว",
  rejected: "ไม่อนุมัติ",
  needs_type_review: "ต้องตรวจประเภทงาน",
};
const ageSources = {
  stored: "อายุที่บันทึกไว้",
  cutoff: "คำนวณจากวันตัดอายุ",
  missing: "ข้อมูลอายุไม่ครบ",
};

it("carries all effective statuses, age cases and different per-event ordering in the checked-in source packet", () => {
  expect(contract.fixtureVersion).toBe(1);
  const packets = contract.scenarios.map((scenario) =>
    exportDataSchema.parse(scenario.packet),
  );
  expect(
    new Set(
      packets.flatMap((packet) =>
        packet.registrations.map((row) => row.registrationStatus),
      ),
    ),
  ).toEqual(new Set(Object.keys(statuses)));
  expect(
    new Set(
      packets.flatMap((packet) =>
        packet.registrations.map((row) => row.ageSource),
      ),
    ),
  ).toEqual(new Set(["stored", "cutoff", "missing"]));
  expect(packets[0]!.exportPlan.groups[0]!.fullClassLabel).not.toBe(
    packets[1]!.exportPlan.groups[0]!.fullClassLabel,
  );
});

it.each(contract.scenarios)(
  "consumes actual source compiler fixture $name through XLSX and DOCX without another grouping engine",
  async (scenario) => {
    const packet = exportDataSchema.parse(scenario.packet);
    const expected = packet.exportPlan.groups;
    const bytes = createCompetitionWorkbook(packet.event._id, packet);
    const workbook = read(bytes, { type: "buffer" });
    expect(workbook.SheetNames).toEqual([
      "ข้อมูลงาน",
      ...expected.map((group) => group.sheetName),
    ]);
    const contents = workbook.Sheets["ข้อมูลงาน"]!;
    expect(cell(contents, "A1")?.v).toBe("สารบัญและข้อมูลงาน");
    const rowsById = new Map(packet.registrations.map((row) => [row._id, row]));
    const exportedIds: string[] = [];
    for (const [index, group] of expected.entries()) {
      expect(group.sheetName.length).toBeLessThanOrEqual(31);
      const sheet = workbook.Sheets[group.sheetName]!;
      expect(cell(sheet, "A3")?.v).toBe(`รุ่น: ${group.fullClassLabel}`);
      expect(cell(sheet, "B3")?.v).toBe(`สี: ${group.colorLabel}`);
      expect(cell(sheet, "C3")?.v).toBe(`เพศ: ${group.sexLabel}`);
      expect(cell(sheet, "D3")?.v).toBe(`ชุดรุ่น: ${group.levelLabel}`);
      const contentsAddress = Object.keys(contents).find(
        (address) =>
          /^B\d+$/.test(address) &&
          cell(contents, address)?.v === group.sheetName,
      );
      expect(contentsAddress).toBeDefined();
      const contentsRow = contentsAddress!.slice(1);
      expect(cell(contents, `H${contentsRow}`)?.l?.Target).toBe(
        `#'${group.sheetName.replace(/'/g, "''")}'!A1`,
      );
      expect(cell(sheet, "A1")?.l?.Target).toBe(`#'ข้อมูลงาน'!A${contentsRow}`);
      const rows = utils
        .sheet_to_json<unknown[]>(sheet, { header: 1 })
        .slice(4);
      expect(rows.map((row) => row[12])).toEqual(group.registrationIds);
      for (const values of rows) {
        const id = values[12] as string;
        const original = rowsById.get(id)!;
        exportedIds.push(id);
        expect(values[1]).toBe(original.microchip);
        expect(values[2]).toBe(original.name);
        expect(values[4]).toBe(original.exportAge ?? "ต้องตรวจสอบ");
        expect(values[8]).toBe(original.ownerName);
        expect(values[9]).toBe(original.ownerTel);
        expect(values[10]).toBe(ageSources[original.ageSource]);
        expect(values[13]).toBe(statuses[original.registrationStatus!]);
      }
      expect(cell(sheet, "B5")?.t).toBe("s");
      expect(cell(sheet, "J5")?.t).toBe("s");
      expect(zipText(bytes, `xl/worksheets/sheet${index + 2}.xml`)).toContain(
        "hyperlink",
      );
    }
    expect(exportedIds).toEqual(
      expected.flatMap((group) => group.registrationIds),
    );
    expect([...exportedIds].sort()).toEqual(
      packet.registrations.map((row) => row._id).sort(),
    );
    expect(new Set(exportedIds).size).toBe(packet.rowCount);
    for (const sheet of Object.values(workbook.Sheets)) {
      for (const [address, value] of Object.entries(sheet)) {
        if (address.startsWith("!")) continue;
        const entry = value as CellObject;
        expect(entry.f).toBeUndefined();
        if (typeof entry.v === "string")
          expect(entry.v).not.toContain("@jaothui/class:");
        if (entry.l) expect(entry.l.Target.startsWith("#")).toBe(true);
      }
    }
    const bundle = zip(
      await createCompetitionDocxZip(packet.event._id, packet),
    );
    const documents = bundle.FileIndex.filter((entry) =>
      entry.name.endsWith(".docx"),
    );
    expect(documents).toHaveLength(packet.rowCount);
    const xmls = documents.map((entry) =>
      zipText(Buffer.from(entry.content), "word/document.xml"),
    );
    for (const group of expected) {
      for (const id of group.registrationIds) {
        const original = rowsById.get(id)!;
        const xml = xmls.find((value) =>
          value.includes(`อ้างอิงใบสมัคร: ${id}`),
        );
        expect(xml).toBeDefined();
        for (const label of [
          group.fullClassLabel,
          group.colorLabel,
          group.sexLabel,
          group.levelLabel,
          `สถานะใบสมัคร: ${statuses[original.registrationStatus!]}`,
        ])
          expect(xml).toContain(label);
        expect(xml).not.toContain("@jaothui/class:");
        expect(xml).not.toContain("อัลไบโน");
        expect(xml).toContain(original.ownerTel);
        if (original.exportAge === null)
          expect(xml).toContain("ไม่ทราบอายุ — ต้องตรวจสอบ");
        else expect(xml).toContain(`>${original.exportAge}</w:t>`);
      }
    }
  },
);
