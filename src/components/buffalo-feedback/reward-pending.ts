import { z } from "zod";
import {
  rewardAssetKey,
  rewardInputSchema,
  type RewardInput,
} from "~/lib/reward-contract";
export type PendingReward = {
  input: Omit<RewardInput, "eventDate"> & { eventDate: string | null };
  path: string;
  digest: string;
  uploaded: boolean;
};
const stored = z
  .object({
    input: rewardInputSchema
      .omit({ eventDate: true })
      .extend({ eventDate: z.string().datetime().nullable() })
      .strict(),
    path: z.string(),
    digest: z.string().regex(/^[a-f0-9]{64}$/),
    uploaded: z.boolean(),
  })
  .strict();
/** Treat browser persistence as untrusted data; recover only this exact immutable asset. */
export function parsePendingReward(
  raw: string,
  publicUrl: (path: string) => string,
): PendingReward {
  const value = stored.parse(JSON.parse(raw));
  const extension = value.path.endsWith(".png") ? "png" : "jpg";
  const path = rewardAssetKey(value.input.id, value.digest, extension);
  const input = rewardInputSchema.parse({
    ...value.input,
    eventDate: value.input.eventDate ? new Date(value.input.eventDate) : null,
  });
  if (
    path !== value.path ||
    input.rewardImage !== publicUrl(path) ||
    (input.eventDate && input.eventDate.toISOString() !== value.input.eventDate)
  )
    throw Error("PENDING_REWARD_INVALID");
  return {
    ...value,
    input: { ...input, eventDate: input.eventDate?.toISOString() ?? null },
  };
}
