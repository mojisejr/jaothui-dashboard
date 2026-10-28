import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { isAuth } from "~/server/services/auth.service";
import { getCreateRuntime } from "~/server/services/buffalo-integrity/create/runtime";
import { getEditRuntime } from "~/server/services/buffalo-integrity/edit/runtime";
import { RAW_IMAGE_LIMIT } from "~/server/services/buffalo-integrity/create/contract";
import { DiagnosticError } from "~/server/diagnostics/errors";
import {
  bindOperationId,
  newRequestId,
  reportDiagnostic,
  runDiagnosticContext,
} from "~/server/diagnostics/reporter";
import { diagnosticHttpStatus } from "~/server/diagnostics/transport";
import { IntegrityError } from "~/server/services/buffalo-integrity/operations/hash";
export const config = { api: { bodyParser: false } };
/** Raw bytes avoid base64/JSON expansion and Next's default 1MB body parser. */
export default function image(req: NextApiRequest, res: NextApiResponse) {
  const requestId = newRequestId();
  res.setHeader("X-Request-Id", requestId);
  return runDiagnosticContext(
    { requestId, route: "api/buffalo-create/image", type: "mutation" },
    () => handleImage(req, res),
  );
}
async function handleImage(req: NextApiRequest, res: NextApiResponse) {
  const fail = (status: number, error: unknown) => {
    const diagnostic = reportDiagnostic(error);
    return res.status(status).json({ error: diagnostic.code, diagnostic });
  };
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return fail(405, new DiagnosticError("METHOD_NOT_ALLOWED"));
  }
  if (!isAuth(req.headers.authorization?.split(" ")[1] ?? ""))
    return fail(401, new DiagnosticError("UNAUTHORIZED"));
  try {
    const input = z
      .object({
        id: z.string().uuid(),
        kind: z.enum(["create", "edit"]).optional(),
        version: z.coerce.number().int().nonnegative(),
      })
      .strict()
      .parse(req.query);
    bindOperationId(input.id);
    const runtime = getCreateRuntime();
    const length = Number(req.headers["content-length"]);
    if (!Number.isInteger(length) || length <= 0 || length >= RAW_IMAGE_LIMIT)
      return fail(413, new DiagnosticError("INVALID_IMAGE_SIZE"));
    const parts: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      const part = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk as Uint8Array);
      size += part.length;
      if (size >= RAW_IMAGE_LIMIT)
        return fail(413, new DiagnosticError("INVALID_IMAGE_SIZE"));
      parts.push(part);
    }
    if (size !== length)
      return fail(400, new DiagnosticError("INVALID_IMAGE_LENGTH"));
    await (input.kind === "edit" ? getEditRuntime() : runtime).workflow.upload(
      input.id,
      `shared:${process.env.username!}`,
      input.version,
      Buffer.concat(parts),
      req.headers["content-type"] ?? "",
    );
    return res.status(200).json({ ok: true });
  } catch (error) {
    const fault =
      error instanceof IntegrityError ||
      error instanceof DiagnosticError ||
      error instanceof z.ZodError
        ? error
        : new DiagnosticError("IMAGE_UPLOAD_REJECTED", { cause: error });
    return fail(diagnosticHttpStatus(fault), fault);
  }
}
