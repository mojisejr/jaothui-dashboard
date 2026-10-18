import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { isAuth } from "~/server/services/auth.service";
import { getCreateRuntime } from "~/server/services/buffalo-integrity/create/runtime";
import { RAW_IMAGE_LIMIT } from "~/server/services/buffalo-integrity/create/contract";
import { IntegrityError } from "~/server/services/buffalo-integrity/operations/hash";
export const config = { api: { bodyParser: false } };
/** Raw bytes avoid base64/JSON expansion and Next's default 1MB body parser. */
export default async function image(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  }
  if (!isAuth(req.headers.authorization?.split(" ")[1] ?? ""))
    return res.status(401).json({ error: "UNAUTHORIZED" });
  try {
    const runtime = getCreateRuntime();
    const input = z
      .object({
        id: z.string().uuid(),
        version: z.coerce.number().int().nonnegative(),
      })
      .strict()
      .parse(req.query);
    const length = Number(req.headers["content-length"]);
    if (!Number.isInteger(length) || length <= 0 || length >= RAW_IMAGE_LIMIT)
      return res.status(413).json({ error: "INVALID_IMAGE_SIZE" });
    const parts: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      const part = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk as Uint8Array);
      size += part.length;
      if (size >= RAW_IMAGE_LIMIT)
        return res.status(413).json({ error: "INVALID_IMAGE_SIZE" });
      parts.push(part);
    }
    if (size !== length)
      return res.status(400).json({ error: "INVALID_IMAGE_LENGTH" });
    await runtime.workflow.upload(
      input.id,
      `shared:${process.env.username!}`,
      input.version,
      Buffer.concat(parts),
      req.headers["content-type"] ?? "",
    );
    return res.status(200).json({ ok: true });
  } catch (error) {
    return res
      .status(400)
      .json({
        error:
          error instanceof IntegrityError
            ? error.code
            : "IMAGE_UPLOAD_REJECTED",
      });
  }
}
