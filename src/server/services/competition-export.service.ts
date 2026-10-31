import { utils, write, type CellObject } from "xlsx";
import archiver from "archiver";
import { z } from "zod";
import { createHash } from "node:crypto";
import type { ExportData } from "~/lib/competition-applications";
import {
  registrationLabel,
  assertRegistrationPolicyPayload,
  exportDataSchema,
} from "~/lib/competition-applications";
import {
  EXPORT_INFORMATION_SHEET,
  EXPORT_UPGRADE_MESSAGE,
  EXPORT_AGE_SOURCE_LABELS,
  EXPORT_AGE_WARNING_LABELS,
  type ExportDiagnostic,
} from "~/lib/competition-export-layout";
import { generateBuffaloRegistrationDoc } from "./docx-export.service";

export class CompetitionExportError extends Error {
  constructor(
    message: string,
    public readonly diagnostics: ExportDiagnostic[] = [],
  ) {
    super(message);
    this.name = "CompetitionExportError";
  }
}
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
const ownValue = (values: Record<string, string>, key: string) =>
  Object.prototype.hasOwnProperty.call(values, key) ? values[key] : undefined;
export const ageWarningLabel = (warning?: string | null) => {
  if (!warning) return "";
  const label = ownValue(EXPORT_AGE_WARNING_LABELS, warning);
  if (!label)
    throw new CompetitionExportError(
      "ไม่รองรับหมายเหตุอายุจากต้นทาง กรุณาตรวจข้อมูลก่อนดาวน์โหลด",
    );
  return label;
};
const thaiLabel = (value: string) =>
  /[ก-๙]/.test(value) && !/[a-z]/i.test(value);
export function validateExportData(eventId: string, data: ExportData) {
  assertRegistrationPolicyPayload(data);
  if (data.exportPresentationVersion !== 1)
    throw new CompetitionExportError(EXPORT_UPGRADE_MESSAGE);
  const parsed = exportDataSchema.safeParse(data);
  if (!parsed.success)
    throw new CompetitionExportError(
      "ข้อมูลหรือรูปแบบไฟล์จากต้นทางไม่ครบ กรุณาตรวจและโหลดข้อมูลใหม่",
    );
  data = parsed.data;
  if (data.event._id !== eventId)
    throw new CompetitionExportError("งานในข้อมูลส่งออกไม่ตรงกับงานที่เลือก");
  const plan = data.exportPlan;
  if (plan.state !== "ready" || plan.diagnostics.length)
    throw new CompetitionExportError(
      plan.diagnostics.map((diagnostic) => diagnostic.message).join(" • ") ||
        "กรุณาแก้รายการที่ขาดและบันทึกรูปแบบไฟล์ก่อนดาวน์โหลด",
      plan.diagnostics,
    );
  if (plan.eventId !== eventId || plan.eventRevision !== data.event._rev)
    throw new CompetitionExportError(
      "รุ่นข้อมูลในรูปแบบไฟล์ไม่ตรงกับงานล่าสุด กรุณาโหลดข้อมูลใหม่",
    );
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        national: data.event.catalogs.national,
        province: data.event.catalogs.province,
      }),
    )
    .digest("hex");
  if (
    plan.catalogFingerprint !== fingerprint ||
    !plan.layoutFingerprint ||
    !/^[a-f0-9]{64}$/.test(plan.layoutFingerprint)
  )
    throw new CompetitionExportError(
      "ชุดรุ่นหรือรูปแบบไฟล์เปลี่ยนไป กรุณาตรวจและโหลดข้อมูลใหม่",
    );
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
    if (!row._id || !row.rawType.trim())
      throw new CompetitionExportError(
        "รหัสหรือข้อมูลรุ่นเดิมของใบสมัครไม่ครบ กรุณาตรวจต้นทาง",
      );
    if (
      row.exportAge !== null &&
      row.exportAge !== undefined &&
      (!Number.isFinite(row.exportAge) || row.exportAge < 0)
    )
      throw new CompetitionExportError("อายุส่งออกไม่ถูกต้อง");
    if (row.ageSource === "stored" && row.exportAge !== row.buffaloAge)
      throw new CompetitionExportError("อายุส่งออกไม่ตรงกับอายุที่บันทึกไว้");
    if (
      (row.ageSource === "missing") !==
      (row.exportAge === null || row.exportAge === undefined)
    )
      throw new CompetitionExportError(
        "แหล่งอายุและข้อมูลอายุจากต้นทางไม่สอดคล้องกัน กรุณาตรวจข้อมูลก่อนดาวน์โหลด",
      );
    ageWarningLabel(row.ageWarning);
  }
  const covered = new Set<string>();
  const groupKeys = new Set<string>();
  const names = new Set([
    EXPORT_INFORMATION_SHEET.toLocaleLowerCase(),
    "history",
  ]);
  for (const [index, group] of plan.groups.entries()) {
    if (
      !group.key ||
      !group.categoryId ||
      groupKeys.has(group.key) ||
      group.ordinal !== index + 1 ||
      !group.registrationIds.length
    )
      throw new CompetitionExportError(
        "กลุ่มข้อมูลส่งออกซ้ำ ว่าง หรือเรียงลำดับไม่ถูกต้อง กรุณาตรวจรูปแบบไฟล์",
      );
    groupKeys.add(group.key);
    const name = group.sheetName;
    if (
      !name.trim() ||
      name !== name.trim() ||
      name.length > 31 ||
      /[\x00-\x1f\x7f\[\]:*?/\\]|^'|'$/.test(name) ||
      names.has(name.toLocaleLowerCase())
    )
      throw new CompetitionExportError(
        "ชื่อชีตส่งออกไม่ถูกต้องหรือซ้ำ กรุณาตรวจชื่อย่อของรุ่น",
      );
    names.add(name.toLocaleLowerCase());
    if (!/^[ก-๙0-9 ._()\-]+$/.test(group.posterNumber))
      throw new CompetitionExportError(
        "เลขรุ่นบนป้ายยังไม่ถูกต้อง กรุณาตรวจรูปแบบไฟล์",
      );
    if (
      ![
        group.fullClassLabel,
        group.levelLabel,
        group.colorLabel,
        group.sexLabel,
      ].every(thaiLabel)
    )
      throw new CompetitionExportError(
        "คำแสดงผลของรุ่น ระดับ สี หรือเพศยังไม่เป็นภาษาไทย กรุณาตรวจรูปแบบไฟล์",
      );
    for (const id of group.registrationIds) {
      if (!ids.has(id) || covered.has(id))
        throw new CompetitionExportError(
          "รายการใบสมัครในกลุ่มส่งออกขาด เกิน หรือซ้ำ กรุณาโหลดข้อมูลล่าสุด",
        );
      covered.add(id);
    }
  }
  if (covered.size !== ids.size)
    throw new CompetitionExportError(
      "ยังมีใบสมัครที่ไม่ได้กำหนดกลุ่มส่งออก กรุณาแก้ให้ครบก่อนดาวน์โหลด",
    );
  return data;
}
const birthdayLabel = (value: string) =>
  /^\d{4}-\d{2}-\d{2}/.test(value)
    ? `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}`
    : value;
export function createCompetitionWorkbook(
  eventId: string,
  data: ExportData,
): Buffer {
  data = validateExportData(eventId, data);
  const workbook = utils.book_new();
  const summaryRows: (string | number)[][] = [
    ["สารบัญและข้อมูลงาน"],
    ["งานแข่งขัน", data.event.title],
    ["รหัสงาน", eventId],
    ["จำนวนใบสมัคร", data.rowCount],
    [
      "ขอบเขต",
      "รวมทุกสถานะตามประเภทงาน: สมัครสำเร็จ รอตรวจสอบ อนุมัติแล้ว ไม่อนุมัติ และต้องตรวจประเภทงาน",
    ],
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
    [],
    [
      "วิธีใช้",
      "คลิก เปิดชีต เพื่อไปยังข้อมูลรุ่น และใช้ กลับสารบัญ เพื่อกลับมายังแถวเดิม",
    ],
    [
      "รุ่นบนป้าย",
      "ชื่อแท็บ",
      "รุ่นแข่งขัน",
      "ระดับ",
      "สี",
      "เพศ",
      "จำนวนใบสมัคร",
      "ไปยังข้อมูล",
    ],
  ];
  const firstContentsRow = summaryRows.length + 1;
  for (const group of data.exportPlan.groups)
    summaryRows.push([
      group.posterNumber,
      group.sheetName,
      group.fullClassLabel,
      group.levelLabel,
      group.colorLabel,
      group.sexLabel,
      group.registrationIds.length,
      "เปิดชีต →",
    ]);
  const summary = utils.aoa_to_sheet(summaryRows);
  summary["!cols"] = [24, 40, 70, 30, 14, 14, 18, 20].map((wch) => ({ wch }));
  utils.book_append_sheet(workbook, summary, EXPORT_INFORMATION_SHEET);
  const rowsById = new Map(data.registrations.map((row) => [row._id, row]));
  const internalTarget = (sheetName: string, cell: string) =>
    `#'${sheetName.replace(/'/g, "''")}'!${cell}`;
  for (const [index, group] of data.exportPlan.groups.entries()) {
    const rows = group.registrationIds.map((id) => rowsById.get(id)!);
    const sheet = utils.aoa_to_sheet([
      ["← กลับสารบัญ"],
      [`งาน: ${data.event.title}`, "รหัสงาน", eventId],
      [
        `รุ่น: ${group.fullClassLabel}`,
        `สี: ${group.colorLabel}`,
        `เพศ: ${group.sexLabel}`,
        `ชุดรุ่น: ${group.levelLabel}`,
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
        EXPORT_AGE_SOURCE_LABELS[row.ageSource],
        ageWarningLabel(row.ageWarning),
        row._id,
        registrationLabel(row),
      ]),
    ]);
    sheet["!cols"] = [
      8, 22, 24, 18, 16, 24, 24, 24, 24, 20, 28, 60, 45, 24,
    ].map((wch) => ({ wch }));
    const contentsRow = firstContentsRow + index;
    (summary[`H${contentsRow}`] as CellObject).l = {
      Target: internalTarget(group.sheetName, "A1"),
      Tooltip: "เปิดข้อมูลรุ่นนี้",
    };
    (sheet.A1 as CellObject).l = {
      Target: internalTarget(EXPORT_INFORMATION_SHEET, `A${contentsRow}`),
      Tooltip: "กลับสารบัญของรุ่นนี้",
    };
    utils.book_append_sheet(workbook, sheet, group.sheetName);
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
  data = validateExportData(eventId, data);
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
    const rowsById = new Map(data.registrations.map((row) => [row._id, row]));
    const ordered = data.exportPlan.groups.flatMap((group) =>
      group.registrationIds.map((id) => ({ row: rowsById.get(id)!, group })),
    );
    for (const [i, { row, group }] of ordered.entries()) {
      const buffer = await generateBuffaloRegistrationDoc(
        {
          ...row,
          type: group.fullClassLabel,
          colorLabelTh: group.colorLabel,
          sexLabelTh: group.sexLabel,
          levelLabelTh: group.levelLabel,
          buffaloAge: row.exportAge ?? 0,
          exportAge: row.exportAge ?? null,
          ageWarning: ageWarningLabel(row.ageWarning),
          registrationId: row._id,
          approvalStatusLabel: registrationLabel(row),
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
