/** @jest-environment node */
const mockFind = jest.fn();
jest.mock("@prisma/client", () => ({
  PrismaClient: jest.fn(() => ({ pedigree: { findUnique: mockFind } })),
}));
import { diagnosticFor } from "~/server/diagnostics/reporter";
import { IntegrityError } from "../../operations/hash";
import { type Pedigree } from "@prisma/client";
import jwt from "jsonwebtoken";
import { address as nft } from "~/server/blockchain/nft/abi";
import { address as manager } from "~/server/blockchain/metadata-maneger/abi";
import { account, testKey } from "../../operations/testing-fixtures";
import {
  createReadDetails,
  getEditReadDetails,
  writerAvailability,
} from "../read-runtime";
import { readRuntimeConfig, runtimeConfig } from "../../release/config";
const original = { ...process.env };
const log = jest.spyOn(console, "error").mockImplementation(() => undefined);
const row = {
  microchip: "001",
  tokenId: 1n,
  name: "Cow",
  birthday: new Date("2024-01-01"),
  sex: "Male",
  origin: "Thai",
  color: "Black",
  height: 145,
  detail: "",
  certNo: "C",
  dna: "",
  fatherId: null,
  motherId: null,
  image: "https://example.test/cow.jpg",
  rarity: "Normal",
  createdAt: "1",
  updatedAt: "1",
} as Pedigree;
const hash = `0x${"11".repeat(32)}`;
const domain = { chainId: 96, nft, manager };
function environment() {
  Object.assign(process.env, {
    NODE_ENV: "production",
    VERCEL_ENV: "production",
    DATABASE_URL: "postgresql://test:test@127.0.0.1:1/integrity_readonly",
    BUFFALO_INTEGRITY_MODE: "enabled",
    BUFFALO_INTEGRITY_RELEASE_ID: "read-release-1",
    BUFFALO_INTEGRITY_SIGNER_KEY: testKey,
    BUFFALO_INTEGRITY_STORAGE_JWT: jwt.sign(
      { role: "buffalo_integrity_writer" },
      "synthetic",
      { expiresIn: 600 },
    ),
    NEXT_PUBLIC_supabase_url: "https://storage.example.test",
    NEXT_PUBLIC_supabase_key: "synthetic",
    BUFFALO_INTEGRITY_SERVER_CONFIG: JSON.stringify({
      kind: "production",
      releaseId: "read-release-1",
      rpcUrl: "https://rpc.example.test",
      sender: account.address,
      receiver: account.address,
      domain,
      codeHashes: { [nft.toLowerCase()]: hash, [manager.toLowerCase()]: hash },
      checkpoint: { number: "10", hash },
      storageUrl: "https://storage.example.test",
      storageBucket: "slipstorage",
    }),
  });
  delete process.env.BUFFALO_INTEGRITY_ISOLATED_CONFIG;
}
beforeEach(() => {
  environment();
  mockFind.mockReset().mockResolvedValue(row);
});
afterEach(() => {
  process.env = { ...original };
});
afterAll(() => log.mockRestore());
test.each(["off", "missing-key", "missing-jwt", "expired-jwt"])(
  "%s writer state never blocks sameDB detail read",
  async (reason) => {
    if (reason === "off") process.env.BUFFALO_INTEGRITY_MODE = "off";
    if (reason === "missing-key")
      delete process.env.BUFFALO_INTEGRITY_SIGNER_KEY;
    if (reason === "missing-jwt")
      delete process.env.BUFFALO_INTEGRITY_STORAGE_JWT;
    if (reason === "expired-jwt")
      process.env.BUFFALO_INTEGRITY_STORAGE_JWT = jwt.sign(
        { role: "buffalo_integrity_writer" },
        "synthetic",
        { expiresIn: -10 },
      );
    expect(readRuntimeConfig().databaseUrl).toBe(process.env.DATABASE_URL);
    expect(() => runtimeConfig()).toThrow();
    const read = createReadDetails(domain, {
      findCow: mockFind,
      readChain: async () => {
        throw Error("offline");
      },
    });
    expect(await read(row.microchip)).toMatchObject({
      name: "Cow",
      sync: { status: "unavailable" },
      writeAvailability: { available: false },
    });
  },
);
test("missing/malformed domain enrichment config returns configured DB row without fallback chain", async () => {
  for (const value of [
    undefined,
    "broken",
    JSON.stringify({ domain: { chainId: 97 } }),
  ]) {
    if (value === undefined) delete process.env.BUFFALO_INTEGRITY_SERVER_CONFIG;
    else process.env.BUFFALO_INTEGRITY_SERVER_CONFIG = value;
    const result = await getEditReadDetails()(row.microchip);
    expect(result).toMatchObject({
      name: "Cow",
      sync: { status: "unavailable" },
      writeAvailability: { available: false },
    });
  }
});
test("DB failure is not notfound and invalid isolated target never falls back to application DB", async () => {
  delete process.env.BUFFALO_INTEGRITY_SERVER_CONFIG;
  mockFind.mockRejectedValueOnce(Error("privateSQL"));
  await expect(getEditReadDetails()(row.microchip)).rejects.toMatchObject({
    code: "DATABASE_READ_FAILED",
  });
  mockFind.mockResolvedValueOnce(null);
  expect(await getEditReadDetails()(row.microchip)).toBeNull();
  mockFind.mockClear();
  process.env.BUFFALO_INTEGRITY_ISOLATED_CONFIG = "/outside/config.json";
  expect(() => getEditReadDetails()).toThrow("ISOLATED_CONFIG_OUTSIDE_TASK");
  expect(mockFind).not.toHaveBeenCalled();
});
test("drain reports new writes paused while identity conflicts retain displayed DB fields", async () => {
  process.env.BUFFALO_INTEGRITY_MODE = "drain";
  expect(writerAvailability()).toMatchObject({
    available: false,
    diagnostic: { code: "INTEGRITY_WRITES_PAUSED" },
  });
  const read = createReadDetails(domain, {
    findCow: mockFind,
    readChain: async () => ({
      domain,
      tokenId: 1n,
      mappedTokenId: 2n,
      nftExists: true,
      initialized: true,
      metadata: {} as never,
    }),
  });
  expect(await read(row.microchip)).toMatchObject({
    name: "Cow",
    sync: { status: "identity_conflict", reason: "TOKEN_MAPPING_CONFLICT" },
  });
});

test("actual read error envelope and attestation failure preserve exact safe reason", async () => {
  delete process.env.BUFFALO_INTEGRITY_SERVER_CONFIG;
  mockFind.mockRejectedValueOnce(Error("privateSQL"));
  try {
    await getEditReadDetails()(row.microchip);
    throw Error("expected failure");
  } catch (error) {
    expect(diagnosticFor(error)).toMatchObject({
      code: "DATABASE_READ_FAILED",
      stage: "database_read",
    });
  }
  for (const code of ["CHECKPOINT_MISMATCH", "CODE_HASH_MISMATCH"]) {
    const read = createReadDetails(domain, {
      findCow: mockFind,
      readChain: async () => {
        throw new IntegrityError(code);
      },
    });
    expect(await read(row.microchip)).toMatchObject({
      name: "Cow",
      sync: {
        status: "unavailable",
        reason: code,
        diagnostic: { code, stage: "configuration" },
      },
    });
  }
});
