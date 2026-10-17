import { z } from "zod";
import { calendarDay } from "./calendar";

// ASCII spaces only: do not erase hidden Unicode characters with String.trim().
export function standardMicrochip(value: string): string {
  const trimmed = value.replace(/^ +| +$/g, "");
  if (!/^[0-9]{15}$/.test(trimmed))
    throw new Error("INVALID_STANDARD_MICROCHIP");
  return trimmed;
}

export const newMicrochipSchema = z.string().transform((value, ctx) => {
  try {
    return standardMicrochip(value);
  } catch {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "INVALID_STANDARD_MICROCHIP",
    });
    return z.NEVER;
  }
});
const daySchema = z.string().refine((value) => {
  try {
    calendarDay(value);
    return true;
  } catch {
    return false;
  }
}, "INVALID_CALENDAR_DAY");

/** This future write contract is NOT yet used by the legacy product mutations. */
export const buffaloIntentSchema = z
  .object({
    version: z.literal(1),
    name: z.string().trim().min(1),
    microchip: newMicrochipSchema,
    certNo: z.string(),
    origin: z.string().min(1),
    color: z.string().min(1),
    image: z.string().url(),
    detail: z.string(),
    sex: z.enum(["Male", "Female"]),
    rarity: z.enum(["Normal", "Rare", "Super Rare", "Super Special Rare"]),
    birthday: daySchema,
    issuedOn: daySchema,
    height: z.number().int().nonnegative().safe(),
    fatherId: z.string(),
    motherId: z.string(),
    dna: z.string(),
  })
  .strict();
export type BuffaloIntent = z.infer<typeof buffaloIntentSchema>;

export interface ChipAvailability {
  inDatabase: (chip: string) => Promise<boolean>;
  chainToken: (chip: string) => Promise<bigint>;
  inActiveOperation: (chip: string) => Promise<boolean>;
}

/** Reservation/serialization remains Phase 2; a read-only check cannot prevent races. */
export async function assertChipAvailable(
  value: string,
  checks: ChipAvailability,
): Promise<string> {
  const chip = standardMicrochip(value);
  const [database, token, active] = await Promise.all([
    checks.inDatabase(chip),
    checks.chainToken(chip),
    checks.inActiveOperation(chip),
  ]);
  if (database || token !== 0n || active)
    throw new Error("MICROCHIP_ALREADY_BOUND");
  return chip;
}
