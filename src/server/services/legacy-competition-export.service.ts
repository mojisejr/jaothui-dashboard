import archiver from "archiver";
import dayjs from "dayjs";
import { classDisplayName } from "~/lib/competition-classes";
import type { ExportData } from "~/lib/competition-applications";
import {
  competitionAdminApiClient,
  CompetitionApiError,
} from "./competition-admin-api-client";
import {
  ageWarningLabel,
  CompetitionExportError,
  createCompetitionDocxZip,
  createCompetitionWorkbook,
  safeExportName,
  validateExportData,
} from "./competition-export.service";

export async function compressLegacyWorkbook(buffer: Buffer, filename: string) {
  if (buffer.length <= 10 * 1024 * 1024)
    return { buffer, filename, isCompressed: false };
  const archive = archiver("zip", { zlib: { level: 9 } });
  const chunks: Buffer[] = [];
  const completed = new Promise<Buffer>((resolve, reject) => {
    archive.on("data", (chunk: Buffer) => chunks.push(chunk));
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    archive.on("error", reject);
  });
  archive.append(buffer, { name: filename });
  await archive.finalize();
  return {
    buffer: await completed,
    filename: filename.replace(/\.xlsx$/, ".zip"),
    isCompressed: true,
  };
}

function exportWarnings(data: ExportData) {
  const warnings: string[] = [];
  if (!data.rowCount)
    warnings.push("ไม่มีใบสมัครในงานนี้ ไฟล์มีเฉพาะข้อมูลงาน");
  const counts = new Map<string, number>();
  for (const row of data.registrations) {
    const label = ageWarningLabel(row.ageWarning);
    if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  for (const [label, count] of counts)
    warnings.push(`${label} (${count} รายการ)`);
  return warnings;
}

export async function createLegacyCompetitionExport(
  eventId: string,
  format: "xlsx" | "docx",
) {
  const data = await competitionAdminApiClient.exportData(eventId);
  validateExportData(eventId, data);
  const stem = safeExportName(`${data.event.title}_${eventId}`);
  const timestamp = dayjs().format("YYYY-MM-DD_HH-mm-ss");
  const original =
    format === "xlsx"
      ? createCompetitionWorkbook(eventId, data)
      : await createCompetitionDocxZip(eventId, data);
  const result =
    format === "xlsx"
      ? await compressLegacyWorkbook(original, `${stem}_${timestamp}.xlsx`)
      : {
          buffer: original,
          filename: `${stem}_registrations_${timestamp}.zip`,
          isCompressed: false,
        };
  // Summary + the same class/level/color/sex grouping used by the shared XLSX engine.
  const sheetCount =
    1 +
    new Set(
      data.registrations.map((row) =>
        JSON.stringify([
          classDisplayName(row.type) || row.type,
          row.level,
          row.color,
          row.sex,
        ]),
      ),
    ).size;
  return {
    buffer: result.buffer.toString("base64"),
    filename: result.filename,
    recordCount: data.rowCount,
    sheetCount,
    fileCount: data.rowCount,
    isCompressed: result.isCompressed,
    originalSize: original.length,
    compressedSize: result.buffer.length,
    warnings: exportWarnings(data),
  };
}

export function legacyExportError(error: unknown) {
  if (error instanceof CompetitionExportError) return error.message;
  if (error instanceof CompetitionApiError && error.status === 404)
    return "ไม่พบงานที่เลือก กรุณาโหลดรายการงานใหม่";
  return "ส่งออกข้อมูลไม่สำเร็จ กรุณาลองอีกครั้ง หากยังมีปัญหาให้ตรวจการเชื่อมต่อระบบการแข่งขัน";
}
