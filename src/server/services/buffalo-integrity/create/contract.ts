import { buffaloIntentSchema } from "../intent";
export const draftInputSchema = buffaloIntentSchema.omit({
  version: true,
  image: true,
  issuedOn: true,
  dna: true,
});
export type DraftInput = ReturnType<typeof draftInputSchema.parse>;
export const RAW_IMAGE_LIMIT = 2_000_000;

export const draftFields = (value: unknown): DraftInput =>
  draftInputSchema.strip().parse(value);
