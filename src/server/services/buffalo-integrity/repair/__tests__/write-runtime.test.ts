/** @jest-environment node */
jest.mock("~/server/db", () => ({ db: {} }));
jest.mock("../../create/runtime", () => ({
  getCreateRuntime: jest.fn(() => {
    throw Error("SIGNER_MUST_NOT_LOAD");
  }),
}));
import { randomUUID } from "crypto";
import { getRepairWriteRuntime } from "../write-runtime";
import { getCreateRuntime } from "../../create/runtime";
import { PostgresOperationRepository } from "../../operations/postgres";
import { payloadHash } from "../../operations/hash";
import { fingerprint } from "../approval";
import { type Operation } from "../../operations/types";
import { type RepairIntent } from "../execution-contract";
const secret = "read-only-runtime-fixture-secret";
function operation(): Operation {
  const id = randomUUID(),
    address = "0x0000000000000000000000000000000000000001",
    chip = "991000000000001";
  const manifest = {
    version: 1,
    operationId: id,
    mode: "database_only",
    createdAt: Date.now(),
    expiresAt: Date.now() + 100000,
    domain: { chainId: 96, nft: address, manager: address },
    targets: [
      {
        sourceMicrochip: chip,
        desiredMicrochip: chip,
        desiredTokenId: "1",
        evidence: [],
      },
    ],
    reservationChips: [chip],
    reservationTokens: ["1"],
    database: {
      targets: [
        {
          sourceMicrochip: chip,
          desiredMicrochip: chip,
          desiredTokenId: "1",
          baseline: { microchip: chip, tokenId: "2" },
        },
      ],
      references: [],
      catalogDigest: "a".repeat(64),
      closureChips: [chip],
      closureTokens: ["1", "2"],
    },
    chain: {
      pin: {},
      metadataCounter: "0",
      tokens: [
        {
          tokenId: "1",
          before: {
            certify: { microchip: chip, dna: "https://example.invalid/dna" },
          },
          desired: {
            certify: { microchip: chip, dna: "https://example.invalid/dna" },
          },
          native: { createdAt: "1", updatedAt: "2" },
          owner: address,
          nftApproved: address,
          managerApprovals: [],
          tokenUri: "https://example.invalid/1.json",
          nftRecord: [],
        },
      ],
      aliases: [],
      steps: [],
    },
    assets: [
      {
        tokenId: "1",
        image: {
          key: "buffalo/1.jpg",
          url: "https://example.invalid/1.jpg",
          hash: "b".repeat(64),
        },
        json: {
          key: "json/1.json",
          url: "https://example.invalid/1.json",
          hash: "c".repeat(64),
          body: {},
        },
        aliases: [],
        publish: false,
        uriChange: false,
      },
    ],
    fees: { perStep: [], totalMaxFeeWei: "0" },
    effects: {},
    coverage: {},
  };
  const manifestHash = payloadHash(manifest);
  const intent = {
    kind: "identity_repair",
    mode: "database_only",
    operationId: id,
    manifestHash,
    approvalFingerprint: fingerprint("owner", manifestHash, secret),
    manifest,
  } as unknown as RepairIntent;
  return {
    id,
    owner: "owner",
    intent,
    intentHash: payloadHash(intent),
    domain: manifest.domain,
    plan: null,
    state: "READY",
    version: 1,
    fence: "0",
    actualToken: null,
    result: null,
    reason: null,
  };
}
beforeEach(() => {
  process.env.BUFFALO_REPAIR_RECEIPT_SECRET = secret;
  process.env.BUFFALO_INTEGRITY_MODE = "off";
  process.env.BUFFALO_REPAIR_MODE = "off";
  delete process.env.BUFFALO_REPAIR_EXTERNAL_ADMIN_COORDINATION;
});
afterEach(() => jest.restoreAllMocks());
test("actual runtime review exposes preserved DNA and DB-only status without loading signer", async () => {
  const op = operation();
  jest
    .spyOn(PostgresOperationRepository.prototype, "get")
    .mockResolvedValue(op);
  jest
    .spyOn(PostgresOperationRepository.prototype, "steps")
    .mockResolvedValue([]);
  const result = await getRepairWriteRuntime().view("owner", op.id);
  expect(result.review.beforeAfter[0]!.before).toMatchObject({
    chain: { dna: "https://example.invalid/dna" },
  });
  expect(result.review.beforeAfter[0]!.after).toMatchObject({
    chain: { dna: "https://example.invalid/dna" },
  });
  expect(result.canResume).toBe(false);
  expect(result.review.fees.totalMaxFeeWei).toBe("0");
  expect(getCreateRuntime).not.toHaveBeenCalled();
});
test("off blocks DB-only advance before loading any writer", async () => {
  await expect(
    getRepairWriteRuntime().advance("owner", {
      id: randomUUID(),
      expectedVersion: 1,
    }),
  ).rejects.toThrow("REPAIR_EXECUTION_DISABLED");
  expect(getCreateRuntime).not.toHaveBeenCalled();
});
test("capability defaults off and remains available without writer config", async () => {
  expect(await getRepairWriteRuntime().capability()).toMatchObject({
    canPrepare: false,
    canApprove: false,
    canResume: false,
  });
  expect(getCreateRuntime).not.toHaveBeenCalled();
});
