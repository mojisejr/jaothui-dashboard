import { createNextApiHandler } from "@trpc/server/adapters/next";

import { type NextApiRequest, type NextApiResponse } from "next";
import {
  newRequestId,
  reportDiagnostic,
  runDiagnosticContext,
} from "~/server/diagnostics/reporter";
import { appRouter } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";

// Let the tRPC node adapter parse inside correlation context, including invalid JSON.
// Retain the existing 8 MB limit for competition/news base64 cover uploads.
export const config = { api: { bodyParser: false } };

// export API handler
const handler = createNextApiHandler({
  router: appRouter,
  maxBodySize: 8 * 1024 * 1024,
  createContext: createTRPCContext,
  onError: ({ error }) => {
    reportDiagnostic(error);
  },
});
export default function correlatedHandler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const requestId = newRequestId();
  res.setHeader("X-Request-Id", requestId);
  // Covers parser errors too: these can happen before createTRPCContext.
  return runDiagnosticContext({ requestId, route: "api/trpc" }, () =>
    handler(req, res),
  );
}
