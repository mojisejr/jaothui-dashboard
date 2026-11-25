import { legacyReconstructionLines } from "../legacy-reconstruction";

test.each([
  { version: 2, issues: [{ field: "rarity", kind: "business_mismatch" }] },
  {
    version: 1,
    issues: [{ field: "https://secret.invalid", kind: "business_mismatch" }],
  },
  { version: 1, issues: [{ field: "rarity", kind: "password=secret" }] },
  { version: 1, issues: [{ field: "__proto__", kind: "business_mismatch" }] },
])(
  "malformed reconstruction details never become display or copied text",
  (detail) => {
    expect(
      legacyReconstructionLines(
        "LEGACY_METADATA_RECONSTRUCTION_CONFLICT",
        detail,
      ),
    ).toEqual([]);
  },
);
test("unrelated diagnostics cannot render legacy causes", () => {
  expect(
    legacyReconstructionLines("UNKNOWN", {
      version: 1,
      issues: [{ field: "rarity", kind: "business_mismatch" }],
    }),
  ).toEqual([]);
});
