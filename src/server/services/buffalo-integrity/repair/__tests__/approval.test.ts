/** @jest-environment node */
import { randomUUID } from "crypto";
import { buildRepairIntent, verifyApproval } from "../approval";
import { type RepairDiagnosis } from "../diagnosis";
import { type CreateChain } from "../../create/workflow";
import { payloadHash } from "../../operations/hash";
import { address as nft } from "~/server/blockchain/nft/abi";
import { address as manager } from "~/server/blockchain/metadata-maneger/abi";
const secret = "unit-repair-approval-secret";
function fixture() {
  const key = randomUUID(),
    old = "991000000000001",
    desired = "991000000000002",
    owner = "0x0000000000000000000000000000000000000001",
    prefix =
      "https://example.supabase.co/storage/v1/object/public/slipstorage/";
  const target = {
    sourceMicrochip: desired,
    desiredMicrochip: desired,
    desiredTokenId: "100",
    evidence: [
      { kind: "physical_scan" as const, reference: "physical evidence" },
    ],
  };
  const metadata = {
    name: "Cow",
    origin: "",
    color: "Black",
    imageUri: prefix + "buffalo/100.jpg",
    detail: "",
    sex: "Male",
    birthdate: "1",
    height: "2",
    certify: {
      microchip: old,
      certNo: "",
      rarity: "",
      issuedAt: "3",
      dna: "DNA-preserved",
    },
    relation: { fatherTokenId: "N/A", motherTokenId: "N/A" },
  };
  const row = {
    microchip: desired,
    tokenId: "100",
    baseline: { microchip: desired, tokenId: "100", name: "Cow" },
  };
  const preview = {
    status: "ready_for_operator_review",
    manifest: {
      pin: {
        chainId: 96,
        nft,
        manager,
        blockNumber: "1",
        createdAt: 100,
        expiresAt: Date.now() + 1000000,
      },
      changes: [
        {
          ...target,
          database: row,
          chain: {
            metadata,
            native: { createdAt: "1", updatedAt: "2" },
            owner,
            approvals: [],
            tokenUri: prefix + "json/100.json",
          },
          chainChange: true,
        },
      ],
      closure: {
        aliases: [
          { microchip: old, tokenId: "100" },
          { microchip: desired, tokenId: "0" },
        ],
        canonical: [],
      },
      observedTokens: ["100"],
      references: [],
      catalogDigest: "a".repeat(64),
      databaseDigest: "b".repeat(64),
      assets: {
        tokens: [
          {
            tokenId: "100",
            before: [
              {
                role: "nft_json",
                url: prefix + "json/100.json",
                key: "json/100.json",
                hash: "c".repeat(64),
              },
              {
                role: "nft_image",
                url: prefix + "buffalo/100.jpg",
                key: "buffalo/100.jpg",
                hash: "d".repeat(64),
              },
              { role: "image_alias", hash: "d".repeat(64) },
              { role: "json_alias", hash: "c".repeat(64) },
            ],
            after: {
              jsonHash: "e".repeat(64),
              json: {
                name: `Cow #${desired}`,
                image: prefix + "buffalo/100.jpg",
                attributes: [{ trait_type: "Microchip", value: desired }],
              },
              aliasImageKey: "buffalo/100.jpg",
              aliasJsonKey: "json/100.json",
            },
          },
        ],
      },
      effects: { nftNativeTimestampsReset: [] },
      coverage: {},
    },
  };
  const diagnosis = {
    preview: jest.fn().mockResolvedValue(preview),
  } as unknown as RepairDiagnosis;
  const chain: CreateChain = {
    domain: { chainId: 96, nft, manager },
    sender: owner,
    receiver: owner,
    maxFeeWei: "100",
    read: async (_c, _a, name) =>
      name === "totalMetadata"
        ? 10n
        : name === "getApproved"
          ? owner
          : [metadata.imageUri, prefix + "json/100.json", 1n, 2n],
  };
  return {
    key,
    target,
    diagnosis,
    chain,
    input: {
      key,
      scan: "receipt",
      pages: [],
      proposal: { targets: [target], knownAliases: [] },
    },
    owner,
  };
}
test("actual nft_image role binds immutable paths, URI timestamp effects and exact total fee before approval", async () => {
  const f = fixture(),
    intent = await buildRepairIntent(
      f.owner,
      f.input,
      f.diagnosis,
      f.chain,
      secret,
    );
  expect(intent.manifest.chain.steps.map((s) => s.kind)).toEqual([
    "batch",
    "dna_restore",
    "uri",
  ]);
  expect(intent.manifest.assets[0]!.json.key).toContain(f.key);
  expect(intent.manifest.assets[0]!.aliases).toHaveLength(2);
  expect(intent.manifest.effects.nftNativeTimestampsReset).toEqual(["100"]);
  expect(intent.manifest.fees.totalMaxFeeWei).toBe("300");
  expect(intent.manifestHash).toBe(payloadHash(intent.manifest));
  expect(() => verifyApproval(f.owner, intent, secret)).not.toThrow();
});
test("owner substitution or modified manifest cannot approve", async () => {
  const f = fixture(),
    intent = await buildRepairIntent(
      f.owner,
      f.input,
      f.diagnosis,
      f.chain,
      secret,
    );
  expect(() => verifyApproval("another", intent, secret)).toThrow(
    "REPAIR_MANIFEST_INVALID",
  );
  intent.manifest.targets[0]!.desiredMicrochip = "991000000000099";
  expect(() => verifyApproval(f.owner, intent, secret)).toThrow(
    "REPAIR_MANIFEST_INVALID",
  );
});
test("pair is blocked before diagnosis while single rollout is selected", async () => {
  const f = fixture();
  f.input.proposal.targets.push({ ...f.target, desiredTokenId: "101" });
  await expect(
    buildRepairIntent(f.owner, f.input, f.diagnosis, f.chain, secret),
  ).rejects.toThrow("REPAIR_PAIR_EXECUTION_DISABLED");
});
