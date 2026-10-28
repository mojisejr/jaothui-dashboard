import { type Reward as SavedReward } from "@prisma/client";
import { db } from "~/server/db";
import { rewardInputSchema, type RewardInput } from "~/lib/reward-contract";
import { DiagnosticError } from "~/server/diagnostics/errors";
export interface RewardStore {
  find: (id: string) => Promise<SavedReward | null>;
  create: (data: RewardInput) => Promise<SavedReward>;
}
/** Immutable UUID/content-addressed object; retries must never overwrite another attempt's file. */
function validateImage(input: RewardInput, publicOrigin: string | undefined) {
  let source: URL;
  let trusted: URL;
  try {
    source = new URL(input.rewardImage);
    trusted = new URL(publicOrigin ?? "");
  } catch {
    throw new DiagnosticError("REWARD_ASSET_INVALID");
  }
  if (
    source.origin !== trusted.origin ||
    source.username ||
    source.password ||
    source.search ||
    source.hash ||
    !new RegExp(
      `^/storage/v1/object/public/slipstorage/reward/${input.id}/[a-f0-9]{64}\\.(jpg|png)$`,
    ).test(source.pathname)
  ) {
    throw new DiagnosticError("REWARD_ASSET_INVALID");
  }
}
function same(record: SavedReward, input: RewardInput) {
  return (
    record.id === input.id &&
    record.microchip === input.microchip &&
    record.rewardName === input.rewardName &&
    record.eventName === input.eventName &&
    (record.eventDate?.getTime() ?? null) ===
      (input.eventDate?.getTime() ?? null) &&
    record.rewardImage === input.rewardImage
  );
}
export function createRewardService(
  store: RewardStore,
  publicOrigin: () => string | undefined,
) {
  async function getById(id: string) {
    try {
      return await store.find(id);
    } catch (cause) {
      throw new DiagnosticError("DATABASE_READ_FAILED", { cause });
    }
  }
  function verified(record: SavedReward, input: RewardInput) {
    if (!same(record, input))
      throw new DiagnosticError("REWARD_IDEMPOTENCY_CONFLICT");
    return record;
  }
  return {
    getById,
    async save(value: RewardInput): Promise<SavedReward> {
      const input = rewardInputSchema.parse(value);
      if (input.eventDate)
        input.eventDate = new Date(
          Date.UTC(
            input.eventDate.getUTCFullYear(),
            input.eventDate.getUTCMonth(),
            input.eventDate.getUTCDate(),
          ),
        );
      validateImage(input, publicOrigin());
      const existing = await getById(input.id);
      if (existing) return verified(existing, input);
      try {
        return verified(await store.create(input), input);
      } catch (cause) {
        // P2002 races and a response lost after commit resolve to the persisted winner.
        // A failed reconciliation does not permit a new UUID or a blind duplicate write.
        let saved: SavedReward | null;
        try {
          saved = await getById(input.id);
        } catch (readCause) {
          throw new DiagnosticError("REWARD_RECONCILIATION_UNAVAILABLE", {
            cause: readCause,
          });
        }
        if (saved) return verified(saved, input);
        if (cause instanceof DiagnosticError) throw cause;
        throw new DiagnosticError("DATABASE_WRITE_FAILED", { cause });
      }
    },
  };
}
export const rewardService = createRewardService(
  {
    find: (id) => db.reward.findUnique({ where: { id } }),
    create: (data) => db.reward.create({ data }),
  },
  () => process.env.NEXT_PUBLIC_supabase_url,
);
