/** @jest-environment node */
jest.mock("~/server/db", () => ({ db: {} }));
import { type Reward as SavedReward } from "@prisma/client";
import { createRewardService, type RewardStore } from "../reward.service";
import { rewardAssetKey, type RewardInput } from "~/lib/reward-contract";
const id = "44444444-4444-4444-8444-444444444444";
const source = "https://storage.example.test";
const payload: RewardInput = {
  id,
  microchip: "001",
  rewardName: "Winner",
  eventName: "Show",
  eventDate: new Date("2026-10-28"),
  rewardImage: `${source}/storage/v1/object/public/slipstorage/${rewardAssetKey(id, "a".repeat(64), "jpg")}`,
};
function setup() {
  const rows = new Map<string, SavedReward>();
  const store: RewardStore = {
    find: jest.fn(async (id) => rows.get(id) ?? null),
    create: jest.fn(async (data) => {
      if (rows.has(data.id))
        throw Object.assign(Error("unique constraint secretSQL"), {
          code: "P2002",
        });
      const row = { ...data };
      rows.set(data.id, row);
      return row;
    }),
  };
  return { rows, store, service: createRewardService(store, () => source) };
}
test("same UUID and normalized payload return one saved record, changed payload conflicts", async () => {
  const { service, rows } = setup();
  const saved = await service.save({
    ...payload,
    eventName: " Show ",
    rewardName: " Winner ",
  });
  expect(await service.save(payload)).toEqual(saved);
  expect(rows.size).toBe(1);
  await expect(
    service.save({ ...payload, rewardName: "Other" }),
  ).rejects.toMatchObject({ code: "REWARD_IDEMPOTENCY_CONFLICT" });
});
test("concurrent P2002 losers read back the unique winner", async () => {
  const { service, rows, store } = setup();
  const results = await Promise.all([
    service.save(payload),
    service.save(payload),
  ]);
  expect(results[0]).toEqual(results[1]);
  expect(rows.size).toBe(1);
  expect(store.create).toHaveBeenCalledTimes(2);
});
test("lost response after commit reconciles persisted record; ordinary failure cannot claim success", async () => {
  const { service, rows, store } = setup();
  store.create = async (data) => {
    rows.set(data.id, data);
    throw Error("connection lost after commit");
  };
  expect(await service.save(payload)).toEqual(payload);
  expect(await service.getById(id)).toEqual(payload);
  const second = setup();
  second.store.create = async () => {
    throw Error("SQL unavailable");
  };
  await expect(second.service.save(payload)).rejects.toMatchObject({
    code: "DATABASE_WRITE_FAILED",
  });
  expect(await second.service.getById(id)).toBeNull();
});
test("failed reconciliation stays unknown and never silently retries or changes UUID", async () => {
  const { service, store } = setup();
  let reads = 0;
  store.find = async () => {
    if (reads++ > 0) throw Error("DB unavailable");
    return null;
  };
  store.create = jest.fn(async () => {
    throw Error("ambiguous commit");
  });
  await expect(service.save(payload)).rejects.toMatchObject({
    code: "REWARD_RECONCILIATION_UNAVAILABLE",
  });
  expect(store.create).toHaveBeenCalledTimes(1);
});
test("invalid date, wrong origin/key and changed content under same UUID are rejected", async () => {
  const { service } = setup();
  await expect(
    service.save({ ...payload, eventDate: new Date("invalid") }),
  ).rejects.toThrow();
  await expect(
    service.save({
      ...payload,
      rewardImage: payload.rewardImage.replace(
        source,
        "https://untrusted.test",
      ),
    }),
  ).rejects.toMatchObject({ code: "REWARD_ASSET_INVALID" });
  await service.save(payload);
  await expect(
    service.save({
      ...payload,
      rewardImage: payload.rewardImage.replace("a".repeat(64), "b".repeat(64)),
    }),
  ).rejects.toMatchObject({ code: "REWARD_IDEMPOTENCY_CONFLICT" });
});
test("optional date remains null and a second reward uses its own UUID", async () => {
  const { service, rows } = setup();
  expect(
    (await service.save({ ...payload, eventDate: null })).eventDate,
  ).toBeNull();
  const nextId = "55555555-5555-4555-8555-555555555555";
  await service.save({
    ...payload,
    id: nextId,
    rewardImage: payload.rewardImage.replace(id, nextId),
  });
  expect(rows.size).toBe(2);
});
