/** @jest-environment node */
import { classifyLegacyInventory } from "../legacy-inventory";
import { intent } from "../../operations/testing-fixtures";
import { intentToDatabase, intentToManagerInput } from "../../field-policy";
function record(tokenId = "102") {
  const buffalo = intent.buffalo;
  return JSON.parse(
    JSON.stringify(
      {
        tokenId,
        row: intentToDatabase(buffalo, BigInt(tokenId), "1000"),
        native: {
          ...intentToManagerInput(buffalo),
          certify: {
            microchip: buffalo.microchip,
            certNo: buffalo.certNo,
            dna: buffalo.dna,
            rarity: buffalo.rarity,
            issuedAt: 0n,
          },
          relation: {
            fatherTokenId: buffalo.fatherId,
            motherTokenId: buffalo.motherId,
          },
          createdAt: 0n,
          updatedAt: 0n,
        },
        nftRecord: [
          "ipfs://bafybeic6jenggtx7l3dndnpfnahjmq7qlgjsuf5ce6krnh2mi3gwfhpheq",
          "ipfs://bafkreic6nhvjqzym6zpkyetn5qfxd3f3fjqwyar7rmgnvlwgwz5vh5fube",
        ],
      },
      (_k, v: unknown) => (typeof v === "bigint" ? v.toString() : v),
    ),
  ) as Record<string, unknown>;
}
test("offline inventory accounts duplicates, unavailable and nonlegacy separately from reconstruction readiness", () => {
  const eligible = record();
  const other = record("103");
  other.nftRecord = [
    "https://example.test/image.jpg",
    "https://example.test/json.json",
  ];
  const result = classifyLegacyInventory({
    registryRows: 6,
    results: [
      eligible,
      other,
      record("104"),
      record("104"),
      { tokenId: "105", errorCode: "secret" },
      { tokenId: "106", row: {} },
    ],
  });
  expect(result.counts).toEqual({
    eligible_reconstruction: 1,
    not_legacy: 1,
    duplicate_token: 2,
    read_unavailable: 1,
    invalid_snapshot: 1,
  });
  expect(result.total).toBe(6);
  expect(JSON.stringify(result)).not.toContain("secret");
});
test("inventory recomputes identity rather than trusting captured eligibility", () => {
  const entry = record();
  (entry.native as { certify: { microchip: string } }).certify.microchip =
    "999000000009999";
  expect(classifyLegacyInventory({ results: [entry] }).counts).toEqual({
    identity_conflict: 1,
  });
});
test("inventory fails closed for missing rows", () => {
  expect(() =>
    classifyLegacyInventory({ registryRows: 2, results: [record()] }),
  ).toThrow("INVENTORY_ROW_COUNT_MISMATCH");
});

test("mixed IPFS references are outside the runtime reconstruction path", () => {
  const entry = record();
  entry.nftRecord = [
    "https://example.test/image.jpg",
    "ipfs://bafkreic6nhvjqzym6zpkyetn5qfxd3f3fjqwyar7rmgnvlwgwz5vh5fube",
  ];
  expect(classifyLegacyInventory({ results: [entry] }).counts).toEqual({
    not_legacy: 1,
  });
});
test("captured name mismatch flag does not become an identity conflict", () => {
  const entry = record();
  entry.identityMatches = false;
  (entry.row as { name: string }).name = "Different";
  const report = classifyLegacyInventory({ results: [entry] });
  expect(report.counts).toEqual({ blocked: 1 });
  expect(report.results[0]?.issues).toContainEqual({
    field: "name",
    kind: "business_mismatch",
  });
});

import captured334 from "./fixtures/legacy334.json";
const trustedStorageBase =
  "https://wtnqjxerhmdnqszkhbvs.supabase.co/storage/v1/object/public/slipstorage/";
test("captured334 requires explicitly configured trusted storage and preserves input", () => {
  const before = JSON.stringify(captured334);
  expect(classifyLegacyInventory({ results: [captured334] }).counts).toEqual({
    not_legacy: 1,
  });
  expect(
    classifyLegacyInventory({ results: [captured334] }, { trustedStorageBase })
      .counts,
  ).toEqual({ eligible_reconstruction: 1 });
  expect(JSON.stringify(captured334)).toBe(before);
});
test.each([
  "foreign",
  "wrong-token",
  "native-mismatch",
  "malformed",
  "reverse-mixed",
])("mixed classifier rejects %s", (kind) => {
  const entry = structuredClone(captured334);
  if (kind === "foreign")
    entry.nftRecord[0] = "https://evil.example/buffalo/334.jpg";
  if (kind === "wrong-token")
    entry.nftRecord[0] = trustedStorageBase + "buffalo/335.jpg";
  if (kind === "native-mismatch")
    entry.native.imageUri = trustedStorageBase + "buffalo/335.jpg";
  if (kind === "malformed") entry.nftRecord[0] += "'";
  if (kind === "reverse-mixed") {
    entry.nftRecord[0] = entry.nftRecord[1]!;
    entry.nftRecord[1] = trustedStorageBase + "json/334.json";
  }
  expect(
    classifyLegacyInventory({ results: [entry] }, { trustedStorageBase })
      .counts,
  ).toEqual({ not_legacy: 1 });
});
