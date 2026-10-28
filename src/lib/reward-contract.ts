import { z } from "zod";
export const rewardInputSchema = z
  .object({
    id: z.string().uuid(),
    microchip: z.string().trim().min(1).max(128),
    rewardImage: z.string().url().max(2048),
    eventName: z.string().trim().min(1).max(300),
    eventDate: z
      .date()
      .refine(
        (date) =>
          date.getUTCFullYear() >= 1900 && date.getUTCFullYear() <= 9999,
        "กรุณาระบุวันที่ที่ถูกต้อง",
      )
      .nullable()
      .optional()
      .transform((date) => date ?? null),
    rewardName: z.string().trim().min(1).max(300),
  })
  .strict();
export type RewardInput = z.infer<typeof rewardInputSchema>;
export function rewardAssetKey(
  id: string,
  digest: string,
  extension: "jpg" | "png",
) {
  z.string().uuid().parse(id);
  z.string()
    .regex(/^[a-f0-9]{64}$/)
    .parse(digest);
  z.enum(["jpg", "png"]).parse(extension);
  return `reward/${id}/${digest}.${extension}`;
}
