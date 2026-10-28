/** @jest-environment node */
import { createPublicClient, http, type Abi } from "viem";
import {
  abi as managerAbi,
  address as manager,
} from "~/server/blockchain/metadata-maneger/abi";
import { abi as nftAbi, address as nft } from "~/server/blockchain/nft/abi";
import { type RawMetadata } from "~/interfaces/i-metadata";
import { managerManifest } from "../../field-policy";
import { asJson } from "../../operations/hash";
import { publicRepairAssets } from "../assets";
(process.env.REPAIR_LEGACY_PUBLIC_PROOF === "1" ? describe : describe.skip)(
  "legacy public asset proof (read-only)",
  () => {
    test("resolves the real extensionless NFT1347 DB reference without changing chain or storage", async () => {
      const client = createPublicClient({
        transport: http("https://rpc.bitkubchain.io", {
          timeout: 12000,
          retryCount: 0,
        }),
      });
      const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
      const [raw, uri] = await Promise.all([
        client.readContract({
          address: manager,
          abi: managerAbi as Abi,
          functionName: "getMetadata",
          args: [1347n],
          blockNumber,
        }),
        client.readContract({
          address: nft,
          abi: nftAbi as Abi,
          functionName: "tokenURI",
          args: [1347n],
          blockNumber,
        }),
      ]);
      const metadata = raw as RawMetadata;
      const origin = "https://wtnqjxerhmdnqszkhbvs.supabase.co";
      const legacy =
        origin + "/storage/v1/object/public/slipstorage/buffalo/1347";
      const result = await publicRepairAssets(origin)(
        [
          {
            tokenId: "1347",
            microchip: metadata.certify.microchip,
            dna: metadata.certify.dna,
            metadata: asJson(managerManifest(metadata)),
            owner: "read-only-proof",
            tokenUri: String(uri),
            approvals: [],
            native: {
              createdAt: String(metadata.createdAt),
              updatedAt: String(metadata.updatedAt),
            },
          },
        ],
        [
          {
            microchip: "ฟ้าราชสีห์",
            tokenId: "1347",
            baseline: { image: legacy },
          },
        ],
        {
          targets: [
            {
              sourceMicrochip: "ฟ้าราชสีห์",
              desiredMicrochip: "764040226601866",
              desiredTokenId: "1347",
              evidence: [
                {
                  kind: "registration_document",
                  reference:
                    "owner-provided certificate and identity confirmation; read-only proof",
                },
              ],
            },
          ],
          knownAliases: [],
        },
      );
      expect(result.blockers).toEqual([]);
      expect(result.verification).toBe("complete");
      expect(result.tokens[0]?.after?.legacyDatabaseImage).toEqual({
        from: legacy,
        to: legacy + ".jpg",
        originalHash: null,
      });
      expect(result.tokens[0]?.after?.imageHash).toBe(
        "b42dcc3c0662b6cf49af7d9dbd03cae86d053821173820dbc8860a6f60ea68ae",
      );
      console.info(
        JSON.stringify({
          proof: "NFT1347_LEGACY_ASSET_READ_ONLY",
          block: String(blockNumber),
          verification: result.verification,
          hash: result.tokens[0]?.after?.imageHash,
          productionWrites: 0,
        }),
      );
    }, 60000);
  },
);
