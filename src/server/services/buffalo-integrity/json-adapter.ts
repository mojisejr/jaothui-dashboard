import { type JsonMetadata } from "~/interfaces/i-metadata-json";
import { buffaloIntentSchema, type BuffaloIntent } from "./intent";
import { legacyCalendar } from "./calendar";

const traitMap = {
  sex: "Sex",
  microchip: "Microchip",
  birthday: "Birthday",
  color: "Color",
  origin: "Origin",
  height: "Height",
  rarity: "Rarity",
  issuedOn: "IssuedAt",
  certNo: "CertNo",
  detail: "Detail",
  fatherId: "FatherId",
  motherId: "MotherId",
  dna: "DNA",
} as const;

export function jsonToIntent(
  json: JsonMetadata,
  expectedEdition: number,
): BuffaloIntent {
  if (
    !Number.isSafeInteger(expectedEdition) ||
    expectedEdition <= 0 ||
    json.edition !== expectedEdition
  ) {
    throw new Error("TOKEN_EDITION_MISMATCH");
  }
  const traits = new Map<string, string>();
  for (const trait of json.attributes) {
    if (traits.has(trait.trait_type)) throw new Error("DUPLICATE_TRAIT");
    traits.set(trait.trait_type, trait.value);
  }
  const required = (name: string): string => {
    const value = traits.get(name);
    if (value === undefined) throw new Error(`MISSING_TRAIT:${name}`);
    return value;
  };
  const values = Object.fromEntries(
    Object.entries(traitMap).map(([field, trait]) => [field, required(trait)]),
  );
  const heightText = required("Height");
  if (!/^\d+$/.test(heightText)) throw new Error("INVALID_HEIGHT");
  const chip = required("Microchip");
  const suffix = ` #${chip}`;
  if (!json.name.endsWith(suffix))
    throw new Error("NAME_CHIP_BINDING_MISMATCH");
  return buffaloIntentSchema.parse({
    ...values,
    version: 1,
    name: json.name.slice(0, -suffix.length),
    image: json.image,
    birthday: legacyCalendar(required("Birthday"), "MDY"),
    issuedOn: legacyCalendar(required("IssuedAt"), "DMY"),
    height: Number(heightText),
  });
}

/** Same legacy envelope/order; added named fields prevent losing business input. */
export function intentToJson(
  intent: BuffaloIntent,
  actualTokenId: number,
): JsonMetadata {
  const validated = buffaloIntentSchema.parse(intent);
  if (!Number.isSafeInteger(actualTokenId) || actualTokenId <= 0)
    throw new Error("INVALID_TOKEN_ID");
  const birthday = validated.birthday.split("-");
  const issued = validated.issuedOn.split("-");
  return {
    name: `${validated.name} #${validated.microchip}`,
    edition: actualTokenId,
    image: validated.image,
    description:
      "ยกระดับควายไทย ยกระดับการอนุรักษ์ ส่งควายไทย ให้โด่งดังไปสู่ Global กับโปรเจกต์ ‘JAOTHUI NFT’",
    attributes: Object.entries(traitMap).map(([field, trait_type]) => ({
      trait_type,
      value:
        field === "birthday"
          ? `${birthday[1]}/${birthday[2]}/${birthday[0]}`
          : field === "issuedOn"
            ? `${issued[2]}/${issued[1]}/${issued[0]}`
            : String(validated[field as keyof typeof traitMap]),
    })),
    hashtag: ["buffalo", "nft", "jaothui", "pedigree"],
  };
}

/** Inspect old partial JSON without inventing missing values or authorizing a rewrite. */
export function inspectLegacyTraits(json: JsonMetadata): {
  values: Record<string, string>;
  missing: string[];
} {
  const values: Record<string, string> = {};
  for (const { trait_type, value } of json.attributes) {
    if (Object.prototype.hasOwnProperty.call(values, trait_type))
      throw new Error("DUPLICATE_TRAIT");
    values[trait_type] = value;
  }
  return {
    values,
    missing: Object.values(traitMap).filter(
      (trait) => values[trait] === undefined,
    ),
  };
}
