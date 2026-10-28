/** @jest-environment node */
jest.mock("superjson", () => ({
  __esModule: true,
  default: {
    serialize: (json: unknown) => ({ json }),
    deserialize: (v: { json: unknown }) => v.json,
  },
}));
jest.mock("~/server/db", () => ({ db: {} }));
jest.mock("~/server/services/auth.service", () => ({
  isAuth: (token: string) => token === "valid",
}));
jest.mock("~/server/services/reward.service", () => ({
  rewardService: { save: jest.fn(), getById: jest.fn() },
}));
import { type PrismaClient } from "@prisma/client";
import { rewardRouter } from "~/server/api/routers/r-reward";
import { rewardService } from "../reward.service";
import { diagnosticFor } from "~/server/diagnostics/reporter";
const log = jest.spyOn(console, "error").mockImplementation(() => undefined);
afterAll(() => log.mockRestore());
test("already-open legacy clients are told to refresh without assigning a new UUID", async () => {
  const caller = rewardRouter.createCaller({
    token: "valid",
    db: {} as PrismaClient,
  });
  try {
    await caller.addNewReward({
      microchip: "001",
      rewardName: "award",
      eventName: "event",
      eventDate: null,
      rewardImage: "https://example.test/image.jpg",
    } as never);
    throw Error("expected rejection");
  } catch (error) {
    expect(diagnosticFor(error)).toMatchObject({
      code: "LEGACY_REWARD_REQUIRES_REQUEST_ID",
      nextAction: "refresh_client",
    });
  }
  // eslint-disable-next-line @typescript-eslint/unbound-method
  expect(rewardService.save).not.toHaveBeenCalled();
});
test("reconcile also requires authentication", async () => {
  const caller = rewardRouter.createCaller({
    token: "expired",
    db: {} as PrismaClient,
  });
  await expect(
    caller.getById({ id: "44444444-4444-4444-8444-444444444444" }),
  ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  expect(rewardService.getById).not.toHaveBeenCalled();
});
