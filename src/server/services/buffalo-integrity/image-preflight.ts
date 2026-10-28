import sharp from "sharp";
import { DiagnosticError } from "~/server/diagnostics/errors";
import { RAW_IMAGE_LIMIT } from "./create/contract";
/** Shared create/image/DNA boundary; invalid decoding is actionable input failure. */
export async function normalizeBuffaloImage(raw: Buffer, mime: string) {
  if (
    !raw.length ||
    raw.length >= RAW_IMAGE_LIMIT ||
    !["image/jpeg", "image/jpg", "image/png"].includes(mime)
  )
    throw new DiagnosticError("INVALID_IMAGE_SIZE_OR_TYPE");
  try {
    const image = sharp(raw, { limitInputPixels: 25_000_000 });
    const info = await image.metadata();
    if (!["jpeg", "png"].includes(info.format ?? ""))
      throw new DiagnosticError("INVALID_IMAGE_CONTENT");
    const bytes = await image
      .rotate()
      .flatten({ background: "#fff" })
      .jpeg({ quality: 90 })
      .toBuffer();
    if (bytes.length >= RAW_IMAGE_LIMIT)
      throw new DiagnosticError("IMAGE_OUTPUT_TOO_LARGE");
    return bytes;
  } catch (cause) {
    if (cause instanceof DiagnosticError) throw cause;
    throw new DiagnosticError("INVALID_IMAGE_CONTENT", { cause });
  }
}
