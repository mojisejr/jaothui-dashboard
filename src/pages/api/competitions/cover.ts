import type { NextApiRequest, NextApiResponse } from "next";
import { isAuth } from "~/server/services/auth.service";
import {
  competitionAdminApiClient,
  CompetitionApiError,
} from "~/server/services/competition-admin-api-client";
export const config = { api: { bodyParser: false } };
const MAX = 4 * 1024 * 1024;
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "Method not allowed" });
  }
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith("Bearer ") || !isAuth(authorization.slice(7)))
    return res.status(401).json({ message: "กรุณาเข้าสู่ระบบ" });
  const type = req.headers["content-type"] ?? "";
  if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(type))
    return res.status(400).json({ message: "รองรับ JPG, PNG, WebP และ GIF" });
  if (Number(req.headers["content-length"]) > MAX)
    return res.status(413).json({ message: "รูปต้องไม่เกิน 4 MB" });
  try {
    const parts: Buffer[] = [];
    let size = 0;
    for await (const part of req) {
      const b = Buffer.isBuffer(part) ? part : Buffer.from(part as Uint8Array);
      size += b.length;
      if (size > MAX)
        return res.status(413).json({ message: "รูปต้องไม่เกิน 4 MB" });
      parts.push(b);
    }
    if (!size) return res.status(400).json({ message: "ไฟล์ว่าง" });
    const filename = decodeURIComponent(
      String(req.headers["x-file-name"] ?? "cover"),
    );
    if (filename.length > 180)
      return res.status(400).json({ message: "ชื่อไฟล์ยาวเกินไป" });
    const data = await competitionAdminApiClient.upload(
      Buffer.concat(parts),
      type,
      filename,
    );
    return res.status(200).json({ data });
  } catch (e) {
    return res
      .status(e instanceof CompetitionApiError ? e.status : 502)
      .json({
        message:
          e instanceof CompetitionApiError ? e.message : "อัปโหลดรูปไม่สำเร็จ",
      });
  }
}
