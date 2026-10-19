import { z } from "zod";
import { calendarDay } from "../calendar";
import { newMicrochipSchema } from "../intent";
import { payloadHash } from "../operations/hash";
import { type Pedigree } from "@prisma/client";
export const editPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(500).optional(),
    height: z
      .string()
      .regex(/^\d+$/)
      .refine((v) => Number.isSafeInteger(Number(v)) && Number(v) <= 2147483647)
      .optional(),
    certNo: z.string().max(2000).optional(),
    detail: z.string().max(10000).optional(),
    dna: z
      .string()
      .max(4000)
      .refine(
        (v) => !v || v === "N/A" || /^https?:\/\//.test(v),
        "INVALID_DNA_URL",
      )
      .optional(),
    rarity: z
      .enum(["Normal", "Rare", "Super Rare", "Super Special Rare"])
      .optional(),
    origin: z.string().min(1).max(2000).optional(),
    color: z.string().min(1).max(500).optional(),
    sex: z.enum(["Male", "Female"]).optional(),
    birthday: z
      .string()
      .refine((v) => {
        try {
          calendarDay(v);
          return true;
        } catch {
          return false;
        }
      })
      .optional(),
    image: z.string().url().optional(),
    microchip: newMicrochipSchema.optional(),
    fatherId: z.string().max(100).optional(),
    motherId: z.string().max(100).optional(),
  })
  .strict()
  .refine((p) => {
    const keys = Object.keys(p);
    return (
      keys.length === 1 ||
      (keys.length === 2 &&
        keys.every((k) => ["fatherId", "motherId"].includes(k)))
    );
  }, "ONE_FIELD_OR_PARENT_PAIR_REQUIRED");
export type EditPatch = z.infer<typeof editPatchSchema>;
export const databaseManifest = (row: Pedigree) => ({
  ...row,
  tokenId: row.tokenId.toString(),
  birthday: row.birthday.toISOString(),
});
export type DatabaseManifest = ReturnType<typeof databaseManifest>;
export const revisionOf = (row: Pedigree) => payloadHash(databaseManifest(row));
export const editInputSchema = z
  .object({
    key: z.string().uuid(),
    microchip: z.string().min(1),
    tokenId: z.string().regex(/^[1-9][0-9]*$/),
    expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
    patch: editPatchSchema,
    upload: z.enum(["image", "dna"]).optional(),
  })
  .strict();
export type EditInput = z.infer<typeof editInputSchema>;
