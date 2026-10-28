import { createTRPCRouter, protectProcedure } from "~/server/api/trpc";
import { diagnosticTRPCError } from "~/server/diagnostics/transport";
import { getRepairDiagnosis } from "~/server/services/buffalo-integrity/repair/runtime";
import {
  scanRequestSchema,
  previewRequestSchema,
} from "~/server/services/buffalo-integrity/repair/contract";
import { type RepairDiagnosis } from "~/server/services/buffalo-integrity/repair/diagnosis";
async function safe<T>(fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (error) {
    throw diagnosticTRPCError(error);
  }
}
export function createBuffaloRepairRouter(
  factory: () => RepairDiagnosis = getRepairDiagnosis,
) {
  return createTRPCRouter({
    startScan: protectProcedure.query(() => safe(() => factory().start())),
    scanPage: protectProcedure
      .input(scanRequestSchema)
      .query(({ input }) =>
        safe(() => factory().page(input.scan, input.offset)),
      ),
    // POST transport bounds payload size; this procedure still has no write capability.
    preview: protectProcedure
      .input(previewRequestSchema)
      .mutation(({ input }) =>
        safe(() => factory().preview(input.scan, input.pages, input.proposal)),
      ),
  });
}
export const buffaloRepairRouter = createBuffaloRepairRouter();
