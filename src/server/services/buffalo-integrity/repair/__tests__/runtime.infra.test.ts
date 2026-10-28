/** @jest-environment node */
jest.mock("~/server/db", () => ({ db: undefined })); // Only disable global singleton; real injected PostgreSQL client below.
import { PrismaClient } from "@prisma/client";
import { createReadOnlyPorts } from "../runtime";
import { payloadHash } from "../../operations/hash";
import { RepairDiagnosis } from "../diagnosis";
const enabled = process.env.REPAIR_DIAGNOSIS_INFRA === "1";
(enabled ? describe : describe.skip)(
  "actual PostgreSQL + pinned chain read-only diagnosis",
  () => {
    test("catalog, complete canonical enumeration and no database/chain writes", async () => {
      const url = process.env.REPAIR_DIAGNOSIS_DATABASE_URL ?? "";
      const rpc = process.env.REPAIR_DIAGNOSIS_RPC_URL ?? "";
      if (
        new URL(url).hostname !== "127.0.0.1" ||
        new URL(rpc).hostname !== "127.0.0.1"
      )
        throw Error("LOOPBACK_ONLY");
      const db = new PrismaClient({ datasourceUrl: url });
      try {
        const ports = createReadOnlyPorts(db, rpc),
          before = await ports.database();
        expect(before.catalogDigest).toMatch(/^[a-f0-9]{64}$/);
        const service = new RepairDiagnosis(
          ports,
          "local-diagnosis-receipt-test-secret",
        );
        const started = await service.start(),
          receipts: string[] = [];
        for (
          let offset = 0;
          offset < started.pin.scanCount;
          offset += started.pin.pageSize
        ) {
          const page = await service.page(started.scan, offset);
          receipts.push(page.receipt);
          if (offset % 200 === 0)
            console.info(
              JSON.stringify({
                event: "repair_scan_progress",
                completed: offset + page.count,
                total: started.pin.scanCount,
              }),
            );
        }
        const result = await service.preview(started.scan, receipts, {
          targets: [
            {
              sourceMicrochip: "991000000000099",
              desiredMicrochip: "991000000000099",
              desiredTokenId: "1360",
              evidence: [
                { kind: "physical_scan", reference: "synthetic-fixture" },
              ],
            },
          ],
          knownAliases: [],
        });
        expect(result.manifest.coverage.count).toBe(started.pin.scanCount);
        expect(result.manifest.authority).toBe("preview_only");
        const after = await ports.database();
        expect(payloadHash({ ...after, readAt: "" })).toBe(
          payloadHash({ ...before, readAt: "" }),
        );
        console.info(
          JSON.stringify({
            event: "repair_diagnosis_infra",
            result: "PASS",
            source: process.env.REPAIR_DIAGNOSIS_RPC_URL?.endsWith(":18579")
              ? "READ_ONLY_MAINNET_VIA_ALLOWLIST_PROXY"
              : "LOCAL_FORK",
            totalSupply: started.pin.totalSupply,
            scanCount: started.pin.scanCount,
            pages: receipts.length,
            block: started.pin.blockNumber,
            catalogDigest: before.catalogDigest,
            previewDigest: result.digest,
            blockers: result.blockers,
          }),
        );
      } finally {
        await db.$disconnect();
      }
    }, 1800000);
  },
);
