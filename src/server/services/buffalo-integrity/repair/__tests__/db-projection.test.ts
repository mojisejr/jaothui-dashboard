/** @jest-environment node */
import { validateRepairProjection, projectedRepairRow } from "../db-projection";
import { type RepairDatabaseProjection } from "../db-projection";
const chip = "999000000000101";
const projection: RepairDatabaseProjection = {
  targets: [
    {
      sourceMicrochip: chip,
      desiredMicrochip: chip,
      desiredTokenId: "2",
      baseline: {
        microchip: chip,
        tokenId: "1",
        dna: "keep",
        name: "cow",
        image: "old",
      },
    },
  ],
  references: [],
  catalogDigest: "a".repeat(64),
  closureChips: [chip],
  closureTokens: ["1", "2"],
};
test("single projection permits only reviewed identity and image fields", () => {
  validateRepairProjection(projection);
  expect(projectedRepairRow(projection.targets[0]!)).toEqual({
    microchip: chip,
    tokenId: "2",
    dna: "keep",
    name: "cow",
    image: "old",
  });
  expect(
    projectedRepairRow({ ...projection.targets[0]!, desiredImage: "reviewed" })
      .image,
  ).toBe("reviewed");
});
test("duplicate pair identities are rejected", () => {
  expect(() =>
    validateRepairProjection({
      ...projection,
      targets: [...projection.targets, ...projection.targets],
    }),
  ).toThrow("REPAIR_MANIFEST_INVALID");
});
test.each(["chips", "tokens"])(
  "incomplete reservation closure rejects %s",
  (kind) => {
    expect(() =>
      validateRepairProjection({
        ...projection,
        ...(kind === "chips" ? { closureChips: [] } : { closureTokens: ["1"] }),
      }),
    ).toThrow("REPAIR_MANIFEST_INVALID");
  },
);
test("baseline must be the actual source identity", () => {
  expect(() =>
    validateRepairProjection({
      ...projection,
      targets: [
        {
          ...projection.targets[0]!,
          baseline: { microchip: "wrong", tokenId: "1" },
        },
      ],
    }),
  ).toThrow("REPAIR_MANIFEST_INVALID");
});
