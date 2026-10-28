/** @jest-environment node */
jest.mock("~/server/db", () => ({ db: undefined }));
import { PrismaClient } from "@prisma/client";
import { createReadOnlyPorts } from "../runtime";
import { publicRepairAssets } from "../assets";
import { type Json } from "../../operations/types";
(process.env.REPAIR_DIAGNOSIS_INFRA === "1" ? describe : describe.skip)(
  "actual public asset evidence",
  () => {
    test("hashes current NFT JSON/image and derives a no-write identity projection", async () => {
      const url = process.env.REPAIR_DIAGNOSIS_DATABASE_URL ?? "",
        rpc = process.env.REPAIR_DIAGNOSIS_RPC_URL ?? "";
      if (
        new URL(url).hostname !== "127.0.0.1" ||
        new URL(rpc).hostname !== "127.0.0.1"
      )
        throw Error("LOOPBACK_ONLY");
      const db = new PrismaClient({ datasourceUrl: url });
      try {
        const ports = createReadOnlyPorts(db, rpc),
          observed = await ports.pin();
        const pin = {
          ...observed,
          version: 1 as const,
          scanId: "asset-read-proof",
          pageSize: 20,
          createdAt: Date.now(),
          expiresAt: Date.now() + 60000,
        };
        const [token] = await ports.tokens(pin, ["1360"]);
        if (!token) throw Error("MISSING_TOKEN");
        const raw = token.metadata as Record<string, Json>;
        // Origin is derived for this read-only evidence test only; production uses its configured project origin.
        const read = publicRepairAssets(new URL(token.tokenUri).origin);
        const result = await read(
          [token],
          [
            {
              microchip: token.microchip,
              tokenId: token.tokenId,
              baseline: { image: raw.imageUri ?? null },
            },
          ],
          {
            targets: [
              {
                sourceMicrochip: token.microchip,
                desiredMicrochip: token.microchip,
                desiredTokenId: token.tokenId,
                evidence: [
                  {
                    kind: "operator_attestation",
                    reference:
                      "read-only technical asset fixture; not physical identity authorization",
                  },
                ],
              },
            ],
            knownAliases: [],
          },
        );
        expect(result.verification).toBe("complete");
        expect(result.tokens[0]?.after?.expectedUriSetterCount).toBe(0);
        console.info(
          JSON.stringify({
            event: "repair_public_asset_proof",
            mode: "READ_ONLY_MAINNET_PUBLIC_STORAGE",
            block: pin.blockNumber,
            tokenId: token.tokenId,
            verification: result.verification,
            blockers: result.blockers,
            assets: result.tokens.map((entry) => ({
              tokenId: entry.tokenId,
              before: entry.before.map(({ role, key, hash, bytes }) => ({
                role,
                key,
                hash,
                bytes,
              })),
              after: entry.after
                ? {
                    imageHash: entry.after.imageHash,
                    jsonHash: entry.after.jsonHash,
                    uriStrategy: entry.after.uriStrategy,
                  }
                : null,
            })),
          }),
        );
      } finally {
        await db.$disconnect();
      }
    }, 60000);
  },
);
