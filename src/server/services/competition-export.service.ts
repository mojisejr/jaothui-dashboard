import { utils, write } from "xlsx";
import archiver from "archiver";
import { z } from "zod";
import type { ExportData } from "~/lib/competition-applications";
import {
  applicationStatus,
  approvalLabels,
} from "~/lib/competition-applications";
import { classDisplayName } from "~/lib/competition-classes";
import { generateBuffaloRegistrationDoc } from "./docx-export.service";

export class CompetitionExportError extends Error {}
export const safeExportName = (value: string) => {
  const clean = value
    .normalize("NFC")
    .replace(/[\x00-\x1f\x7f/\\:*?"<>|]/g, "_")
    .replace(/\.{2,}/g, "_")
    .replace(/^\.+|\.+$/g, "")
    .trim();
  let result = "";
  for (const character of clean) {
    if (Buffer.byteLength(result + character, "utf8") > 180) break;
    result += character;
  }
  return result || "competition";
};
const humanClass = (value: string) => classDisplayName(value) || value;
export const ageWarningLabel = (warning?: string | null) =>
  warning === "calculated-from-cutoff"
    ? "ไม่มีอายุที่บันทึกไว้ คำนวณจากวันตัดอายุของงาน"
    : warning === "missing-or-invalid-age"
      ? "อายุหรือวันเกิด/วันตัดอายุไม่ครบหรือไม่ถูกต้อง ต้องตรวจสอบ"
      : (warning ?? "");
export function validateExportData(eventId: string, data: ExportData) {
  if (data.event._id !== eventId)
    throw new CompetitionExportError("งานในข้อมูลส่งออกไม่ตรงกับงานที่เลือก");
  if (data.rowCount !== data.registrations.length)
    throw new CompetitionExportError("จำนวนรายการส่งออกไม่ตรงกับข้อมูลต้นทาง");
  const ids = new Set<string>();
  for (const row of data.registrations) {
    const reference = z.object({ _ref: z.string() }).safeParse(row.event);
    if (!reference.success || reference.data._ref !== eventId)
      throw new CompetitionExportError("พบใบสมัครต่างงานในข้อมูลส่งออก");
    if (ids.has(row._id))
      throw new CompetitionExportError("พบรหัสใบสมัครซ้ำในข้อมูลส่งออก");
    ids.add(row._id);
    if (
      row.exportAge !== null &&
      row.exportAge !== undefined &&
      (!Number.isFinite(row.exportAge) || row.exportAge < 0)
    )
      throw new CompetitionExportError("อายุส่งออกไม่ถูกต้อง");
    if (row.ageSource === "stored" && row.exportAge !== row.buffaloAge)
      throw new CompetitionExportError("อายุส่งออกไม่ตรงกับอายุที่บันทึกไว้");
  }
}
const birthdayLabel = (value: string) =>
  /^\d{4}-\d{2}-\d{2}/.test(value)
    ? `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}`
    : value;
export function createCompetitionWorkbook(
  eventId: string,
  data: ExportData,
): Buffer {
  validateExportData(eventId, data);
  const workbook = utils.book_new();
  const summary = utils.aoa_to_sheet([
    ["งานแข่งขัน", data.event.title],
    ["รหัสงาน", eventId],
    ["จำนวนใบสมัคร", data.rowCount],
    ["ขอบเขต", "รวมทุกสถานะใบสมัคร: รอตรวจสอบ อนุมัติแล้ว และไม่อนุมัติ"],
    ["วันตัดอายุ", data.event.buffaloAgeDeadline ?? "ไม่ระบุ"],
    [
      "หลักการอายุ",
      "ใช้อายุที่บันทึกไว้ก่อน รวม 0 เดือน; ถ้าไม่มีใช้วันเกิดกับวันตัดอายุของงาน ไม่ใช้วันปัจจุบัน",
    ],
    [
      "ข้อควรตรวจสอบ",
      data.registrations.filter((row) => !!row.ageWarning).length,
    ],
    ...(data.rowCount ? [] : [["สถานะข้อมูล", "ไม่มีใบสมัครในงานนี้"]]),
  ]);
  summary["!cols"] = [{ wch: 24 }, { wch: 90 }];
  utils.book_append_sheet(workbook, summary, "ข้อมูลงาน");
  const groups = new Map<string, ExportData["registrations"]>();
  for (const row of data.registrations) {
    const key = JSON.stringify([
      humanClass(row.type),
      row.level,
      row.color,
      row.sex,
    ]);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  let index = 0;
  for (const rows of groups.values()) {
    index++;
    const first = rows[0]!;
    const sheet = utils.aoa_to_sheet([
      [`งาน: ${data.event.title}`, "รหัสงาน", eventId],
      [
        `รุ่น: ${humanClass(first.type)}`,
        `สี: ${first.color}`,
        `เพศ: ${first.sex}`,
        `ชุดรุ่น: ${first.level}`,
      ],
      [
        "ลำดับ",
        "เลขไมโครชิพ",
        "ชื่อควาย",
        "วัน/เดือน/ปีเกิด",
        "อายุ (เดือน)",
        "พ่อ",
        "แม่",
        "ชื่อฟาร์ม",
        "ชื่อเจ้าของ",
        "เบอร์โทรศัพท์",
        "แหล่งอายุ",
        "หมายเหตุอายุ",
        "รหัสใบสมัคร",
        "สถานะใบสมัคร",
      ],
      ...rows.map((row, i) => [
        i + 1,
        row.microchip,
        row.name,
        birthdayLabel(row.birthday),
        row.exportAge ?? "ต้องตรวจสอบ",
        row.fatherName,
        row.motherName,
        row.farmName,
        row.ownerName,
        row.ownerTel,
        row.ageSource,
        ageWarningLabel(row.ageWarning),
        row._id,
        approvalLabels[applicationStatus(row)],
      ]),
    ]);
    sheet["!cols"] = [8, 22, 24, 18, 16, 24, 24, 24, 24, 20, 16, 60, 45].map(
      (wch) => ({ wch }),
    );
    // A numeric prefix guarantees unique, valid Excel sheet names, even for duplicate/truncated Thai labels.
    const name = `${index}-${humanClass(first.type)}`
      .replace(/[\[\]:*?/\\]/g, "_")
      .replace(/^'+|'+$/g, "")
      .slice(0, 31);
    utils.book_append_sheet(workbook, sheet, name);
  }
  return write(workbook, {
    type: "buffer",
    bookType: "xlsx",
    compression: true,
  }) as Buffer;
}
export async function createCompetitionDocxZip(
  eventId: string,
  data: ExportData,
): Promise<Buffer> {
  validateExportData(eventId, data);
  const archive = archiver("zip", { zlib: { level: 6 } });
  const chunks: Buffer[] = [];
  const completed = new Promise<Buffer>((resolve, reject) => {
    archive.on("data", (chunk: Buffer) => chunks.push(chunk));
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    archive.on("error", reject);
  });
  archive.append(
    `งาน: ${data.event.title}\nรหัสงาน: ${eventId}\nจำนวนใบสมัคร: ${data.rowCount}\nวันตัดอายุ: ${data.event.buffaloAgeDeadline ?? "ไม่ระบุ"}\n${data.rowCount ? "" : "ไม่มีใบสมัครในงานนี้\n"}ใช้อายุที่บันทึกไว้ รวม 0 เดือน; ถ้าไม่มี ใช้วันเกิดกับวันตัดอายุของงานเท่านั้น\n`,
    { name: "event-info.txt" },
  );
  try {
    for (let i = 0; i < data.registrations.length; i++) {
      const row = data.registrations[i]!;
      const buffer = await generateBuffaloRegistrationDoc(
        {
          ...row,
          type: humanClass(row.type),
          buffaloAge: row.exportAge ?? 0,
          exportAge: row.exportAge ?? null,
          ageWarning: ageWarningLabel(row.ageWarning),
          registrationId: row._id,
          approvalStatusLabel: approvalLabels[applicationStatus(row)],
          father: row.fatherName,
          mother: row.motherName,
          event: { title: data.event.title },
        },
        i,
      );
      archive.append(buffer, {
        name: `${i + 1}_${safeExportName(row.name || row.microchip)}.docx`,
      });
    }
    await archive.finalize();
    return await completed;
  } catch (error) {
    archive.abort();
    throw error;
  }
}
