import { type LegacyReconstructionIssue } from "~/lib/legacy-reconstruction";
import { LegacyMetadataReconstructionError } from "../operations/hash";
import { type Pedigree } from "@prisma/client";
import { type RawMetadata } from "~/interfaces/i-metadata";
import { secondsToCalendar } from "../calendar";
import {
  businessDifferences,
  chainSnapshot,
  databaseSnapshot,
} from "../field-policy";
import { buffaloIntentSchema } from "../intent";
import { intentToJson } from "../json-adapter";

/** Classification only, never a fetch allowlist or proof of the old bytes. */
export function isLegacyIpfsReference(value: string): boolean {
  const cid = "(?:Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,120})";
  return new RegExp(
    `^(?:ipfs://|https://(?:nftstorage\\.link|ipfs\\.io)/ipfs/)${cid}$`,
  ).test(value);
}

/** Mixed-origin support is explicit: the caller supplies its configured same-token alias. */
export function supportsLegacyReconstruction(
  nftImage: string,
  nftUri: string,
  nativeImage: string,
  expectedOwnedImage?: string,
): boolean {
  if (!isLegacyIpfsReference(nftUri)) return false;
  if (isLegacyIpfsReference(nftImage)) return true;
  return (
    !!expectedOwnedImage &&
    nftImage === expectedOwnedImage &&
    nativeImage === nftImage
  );
}

/** Legacy absence only for image reconstruction; never rewrite native relations. */
function unspecifiedLegacyParent(value: string): boolean {
  return value === '""' || value === "0";
}

/** Pure audit and runtime classifier; no writes and no raw values in evidence. */
export function inspectLegacyReconstruction(
  row: Pedigree,
  raw: RawMetadata,
): LegacyReconstructionIssue[] {
  let baseline: ReturnType<typeof chainSnapshot>;
  let database: ReturnType<typeof databaseSnapshot>;
  try {
    baseline = chainSnapshot(raw);
    database = databaseSnapshot(row);
  } catch {
    return [{ field: "birthday", kind: "invalid_legacy_field" }];
  }
  const conflicts = businessDifferences(database, baseline).filter(
    ({ field, database, chain }) =>
      !(
        (field === "fatherId" || field === "motherId") &&
        database === "" &&
        (/^[0-9]{15}$/.test(chain) || unspecifiedLegacyParent(chain))
      ),
  );
  const issues: LegacyReconstructionIssue[] = conflicts.map(({ field }) => ({
    field,
    kind: "business_mismatch",
  }));
  let issuedOn: string;
  try {
    issuedOn = secondsToCalendar(raw.certify.issuedAt);
  } catch {
    issues.push({ field: "issuedOn", kind: "invalid_legacy_field" });
    issuedOn = "1970-01-01";
  }
  const result = buffaloIntentSchema.safeParse({
    ...baseline,
    version: 1,
    height: Number(baseline.height),
    issuedOn,
    image: "https://legacy-preflight.invalid/image.jpg",
    // Display-only legacy absence. Neither native relations nor DB are rewritten.
    fatherId: unspecifiedLegacyParent(baseline.fatherId)
      ? ""
      : baseline.fatherId,
    motherId: unspecifiedLegacyParent(baseline.motherId)
      ? ""
      : baseline.motherId,
  });
  if (!result.success) {
    for (const issue of result.error.issues) {
      const field = issue.path[0];
      if (typeof field === "string" && field in baseline)
        issues.push({
          field: field as keyof typeof baseline,
          kind: "invalid_legacy_field",
        });
    }
  }
  if (baseline.name.trim() !== baseline.name)
    issues.push({ field: "name", kind: "normalization_change" });
  if (baseline.microchip.replace(/^ +| +$/g, "") !== baseline.microchip)
    issues.push({ field: "microchip", kind: "normalization_change" });
  return issues;
}

/** Explicit replacement uses the unchanged native baseline after classified preflight. */
export function replacementMetadata(
  row: Pedigree,
  raw: RawMetadata,
  image: string,
): Buffer {
  const issues = inspectLegacyReconstruction(row, raw);
  if (issues.length)
    throw new LegacyMetadataReconstructionError({ version: 1, issues });
  try {
    const baseline = chainSnapshot(raw);
    const intent = buffaloIntentSchema.parse({
      ...baseline,
      version: 1,
      height: Number(baseline.height),
      issuedOn: secondsToCalendar(raw.certify.issuedAt),
      image,
      fatherId: unspecifiedLegacyParent(baseline.fatherId)
        ? ""
        : baseline.fatherId,
      motherId: unspecifiedLegacyParent(baseline.motherId)
        ? ""
        : baseline.motherId,
    });
    const json = intentToJson(intent, Number(row.tokenId));
    // Zero is an unknown legacy issue date, not a certificate issued in 1970.
    if (raw.certify.issuedAt === 0n)
      json.attributes = json.attributes.filter(
        (trait) => trait.trait_type !== "IssuedAt",
      );
    // Calendar display must not discard the exact existing chain issue timestamp.
    json.attributes.push({
      trait_type: "IssuedAtSeconds",
      value: raw.certify.issuedAt.toString(),
    });
    return Buffer.from(JSON.stringify(json));
  } catch {
    throw new LegacyMetadataReconstructionError(undefined);
  }
}
