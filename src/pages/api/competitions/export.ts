import type { NextApiRequest, NextApiResponse } from "next";
import { isAuth } from "~/server/services/auth.service";
import {
  competitionAdminApiClient,
  CompetitionApiError,
} from "~/server/services/competition-admin-api-client";
import {
  CompetitionExportError,
  createCompetitionDocxZip,
  createCompetitionWorkbook,
  safeExportName,
} from "~/server/services/competition-export.service";
export const config = { api: { responseLimit: false } };
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ message: "Method not allowed" });
  }
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith("Bearer ") || !isAuth(authorization.slice(7)))
    return res.status(401).json({ message: "กรุณาเข้าสู่ระบบ" });
  const id = req.query.id,
    format = req.query.format;
  if (
    typeof id !== "string" ||
    !/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]{0,199}$/.test(id) ||
    (format !== "xlsx" && format !== "docx")
  )
    return res
      .status(400)
      .json({ message: "กรุณาระบุงานและรูปแบบไฟล์ที่ถูกต้อง" });
  try {
    const data = await competitionAdminApiClient.exportData(id);
    const buffer =
      format === "xlsx"
        ? createCompetitionWorkbook(id, data)
        : await createCompetitionDocxZip(id, data);
    const filename = `${safeExportName(`${data.event.title}_${id}`)}.${format === "xlsx" ? "xlsx" : "zip"}`;
    res.setHeader(
      "Content-Type",
      format === "xlsx"
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : "application/zip",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="competition.${format === "xlsx" ? "xlsx" : "zip"}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    res.setHeader("X-Competition-Id", id);
    res.setHeader("X-Record-Count", String(data.rowCount));
    return res.status(200).send(buffer);
  } catch (error) {
    return res
      .status(
        error instanceof CompetitionApiError
          ? error.status
          : error instanceof CompetitionExportError
            ? 422
            : 502,
      )
      .json({
        message:
          error instanceof CompetitionApiError ||
          error instanceof CompetitionExportError
            ? error.message
            : "สร้างไฟล์ไม่สำเร็จ กรุณาลองอีกครั้ง",
      });
  }
}
