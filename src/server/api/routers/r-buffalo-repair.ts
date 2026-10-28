import { createTRPCRouter, protectProcedure } from "~/server/api/trpc";
import { diagnosticTRPCError } from "~/server/diagnostics/transport";
import { getRepairDiagnosis } from "~/server/services/buffalo-integrity/repair/runtime";
import {
  scanRequestSchema,
  previewRequestSchema,
} from "~/server/services/buffalo-integrity/repair/contract";
import { type RepairDiagnosis } from "~/server/services/buffalo-integrity/repair/diagnosis";
import { getRepairWriteRuntime } from "~/server/services/buffalo-integrity/repair/write-runtime";
import { sharedAccount } from "./r-buffalo-create";
import {
  repairPrepareSchema,
  repairApproveSchema,
  repairAdvanceSchema,
  repairIdSchema,
  repairKeySchema,
  type RepairWriteRuntime,
} from "~/server/services/buffalo-integrity/repair/execution-contract";
async function safe<T>(fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (error) {
    throw diagnosticTRPCError(error);
  }
}
export function createBuffaloRepairRouter(
  factory: () => RepairDiagnosis = getRepairDiagnosis,
  writeFactory: () => RepairWriteRuntime = getRepairWriteRuntime,
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
    capability: protectProcedure.query(() =>
      safe(() => writeFactory().capability()),
    ),
    getByKey: protectProcedure
      .input(repairKeySchema)
      .query(({ input }) =>
        safe(() => writeFactory().getByKey(sharedAccount(), input.key)),
      ),
    view: protectProcedure
      .input(repairIdSchema)
      .query(({ input }) =>
        safe(() => writeFactory().view(sharedAccount(), input.id)),
      ),
    prepare: protectProcedure
      .input(repairPrepareSchema)
      .mutation(({ input }) =>
        safe(() => writeFactory().prepare(sharedAccount(), input)),
      ),
    approve: protectProcedure
      .input(repairApproveSchema)
      .mutation(({ input }) =>
        safe(() => writeFactory().approve(sharedAccount(), input)),
      ),
    advance: protectProcedure
      .input(repairAdvanceSchema)
      .mutation(({ input }) =>
        safe(() => writeFactory().advance(sharedAccount(), input)),
      ),
    cancel: protectProcedure
      .input(repairIdSchema)
      .mutation(({ input }) =>
        safe(() => writeFactory().cancel(sharedAccount(), input.id)),
      ),
  });
}
export const buffaloRepairRouter = createBuffaloRepairRouter();
