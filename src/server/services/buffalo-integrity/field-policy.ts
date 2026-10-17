import { type Pedigree } from "@prisma/client";
import { type RawMetadata } from "~/interfaces/i-metadata";
import {
  calendarToDate,
  dateToCalendar,
  secondsToCalendar,
  calendarToSeconds,
} from "./calendar";
import { type BuffaloIntent } from "./intent";

export const fieldCapabilities = {
  name: "setName",
  height: "setHeight",
  certNo: "setCertId",
  detail: "setDetail",
  rarity: "setRarity",
  dna: "setDNA",
  fatherId: "setParent",
  motherId: "setParent",
  birthday: "addMetadataBatch",
  origin: "addMetadataBatch",
  color: "addMetadataBatch",
  sex: "addMetadataBatch",
  image: "addMetadataBatch",
  microchip: "addMetadataBatch",
} as const;
export type BusinessField = keyof typeof fieldCapabilities;
export type BusinessSnapshot = Record<BusinessField, string>;
export interface FieldDifference {
  field: BusinessField;
  database: string;
  chain: string;
}

/** Only documented absence sentinels are equal. Nonempty URIs/text remain exact. */
export function absent(value: string | null | undefined): string {
  return value === null || value === undefined || value === "N/A" ? "" : value;
}

export function databaseSnapshot(record: Pedigree): BusinessSnapshot {
  return {
    name: record.name,
    microchip: record.microchip,
    certNo: absent(record.certNo),
    birthday: dateToCalendar(record.birthday),
    sex: record.sex,
    origin: absent(record.origin),
    color: record.color,
    height: String(record.height ?? 0),
    detail: absent(record.detail),
    dna: absent(record.dna),
    image: record.image ?? "",
    rarity: record.rarity,
    fatherId: absent(record.fatherId),
    motherId: absent(record.motherId),
  };
}

export function chainSnapshot(record: RawMetadata): BusinessSnapshot {
  return {
    name: record.name,
    microchip: record.certify.microchip,
    certNo: absent(record.certify.certNo),
    birthday: secondsToCalendar(record.birthdate),
    sex: record.sex,
    origin: absent(record.origin),
    color: record.color,
    height: record.height.toString(),
    detail: absent(record.detail),
    dna: absent(record.certify.dna),
    image: record.imageUri,
    rarity: record.certify.rarity,
    fatherId: absent(record.relation.fatherTokenId),
    motherId: absent(record.relation.motherTokenId),
  };
}

/** Image aliases require separate origin-hash proof; URL inequality is not content inequality. */
export function businessDifferences(
  database: BusinessSnapshot,
  chain: BusinessSnapshot,
): FieldDifference[] {
  return (Object.keys(fieldCapabilities) as BusinessField[])
    .filter((field) => field !== "image" && database[field] !== chain[field])
    .map((field) => ({
      field,
      database: database[field],
      chain: chain[field],
    }));
}

/** Explicit patches only. Never replace unrelated legacy conflicts using DB values. */
export function patchChainBaseline(
  baseline: RawMetadata,
  patch: Partial<BusinessSnapshot>,
): RawMetadata {
  const result: RawMetadata = {
    ...baseline,
    certify: { ...baseline.certify },
    relation: { ...baseline.relation },
  };
  for (const field of Object.keys(patch) as BusinessField[]) {
    const value = patch[field];
    if (value === undefined) continue;
    switch (field) {
      case "microchip":
      case "certNo":
      case "rarity":
      case "dna":
        result.certify[field] = value;
        break;
      case "birthday":
        result.birthdate = calendarToSeconds(value);
        break;
      case "height":
        if (!/^\d+$/.test(value)) throw new Error("INVALID_HEIGHT");
        result.height = BigInt(value);
        break;
      case "fatherId":
        result.relation.fatherTokenId = value;
        break;
      case "motherId":
        result.relation.motherTokenId = value;
        break;
      case "image":
        result.imageUri = value;
        break;
      default:
        result[field] = value;
    }
  }
  return result;
}

/** Pure projections for future engine; no implicit timestamps and no I/O. */
export function intentToDatabase(
  intent: BuffaloIntent,
  tokenId: bigint,
  timestampMilliseconds: string,
): Pedigree {
  if (tokenId <= 0n) throw new Error("INVALID_TOKEN_ID");
  return {
    tokenId,
    microchip: intent.microchip,
    name: intent.name,
    certNo: intent.certNo,
    birthday: calendarToDate(intent.birthday),
    sex: intent.sex,
    fatherId: intent.fatherId,
    motherId: intent.motherId,
    origin: intent.origin,
    height: intent.height,
    color: intent.color,
    detail: intent.detail,
    dna: intent.dna,
    image: intent.image,
    rarity: intent.rarity,
    createdAt: timestampMilliseconds,
    updatedAt: timestampMilliseconds,
  };
}

export function intentToManagerInput(intent: BuffaloIntent) {
  return {
    name: intent.name,
    microchip: intent.microchip,
    certNo: intent.certNo,
    origin: intent.origin,
    color: intent.color,
    imageUri: intent.image,
    detail: intent.detail,
    sex: intent.sex,
    rarity: intent.rarity,
    birthdate: calendarToSeconds(intent.birthday),
    height: BigInt(intent.height),
    issuedAt: calendarToSeconds(intent.issuedOn),
  };
}
