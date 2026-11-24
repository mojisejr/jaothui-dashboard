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
import { IntegrityError } from "../operations/hash";

/** Classification only, never a fetch allowlist or proof of the old bytes. */
export function isLegacyIpfsReference(value: string): boolean {
  const cid = "(?:Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,120})";
  return new RegExp(
    `^(?:ipfs://|https://(?:nftstorage\\.link|ipfs\\.io)/ipfs/)${cid}$`,
  ).test(value);
}

/** Legacy absence only for image reconstruction; never rewrite native relations. */
function unspecifiedLegacyParent(value: string): boolean {
  return value === '""' || value === "0";
}

/** Explicit replacement: use authoritative business data, not old IPFS/alias JSON. */
export function replacementMetadata(
  row: Pedigree,
  raw: RawMetadata,
  image: string,
): Buffer {
  const baseline = chainSnapshot(raw);
  const conflicts = businessDifferences(databaseSnapshot(row), baseline).filter(
    ({ field, database, chain }) =>
      !(
        (field === "fatherId" || field === "motherId") &&
        database === "" &&
        (/^[0-9]{15}$/.test(chain) || unspecifiedLegacyParent(chain))
      ),
  );
  if (conflicts.length)
    throw new IntegrityError("LEGACY_METADATA_RECONSTRUCTION_CONFLICT");
  try {
    const intent = buffaloIntentSchema.parse({
      ...baseline,
      version: 1,
      height: Number(baseline.height),
      issuedOn: secondsToCalendar(raw.certify.issuedAt),
      image,
      // Display-only legacy absence. Neither native relations nor DB are rewritten.
      fatherId: unspecifiedLegacyParent(baseline.fatherId)
        ? ""
        : baseline.fatherId,
      motherId: unspecifiedLegacyParent(baseline.motherId)
        ? ""
        : baseline.motherId,
    });
    if (
      intent.name !== baseline.name ||
      intent.microchip !== baseline.microchip
    )
      throw new IntegrityError("LEGACY_METADATA_RECONSTRUCTION_CONFLICT");
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
    throw new IntegrityError("LEGACY_METADATA_RECONSTRUCTION_CONFLICT");
  }
}
