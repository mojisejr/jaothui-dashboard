/** @jest-environment node */
import type * as Viem from "viem";
jest.mock("~/server/db", () => ({ db: {} }));
jest.mock("viem", () => ({
  ...jest.requireActual<typeof Viem>("viem"),
  createPublicClient: jest.fn(),
}));
import { createPublicClient, keccak256 } from "viem";
import { createReadOnlyPorts, repairRpcUrl } from "../runtime";
import { address as nft } from "~/server/blockchain/nft/abi";
import { address as manager } from "~/server/blockchain/metadata-maneger/abi";
import { type Pin } from "../contract";
const hash = (n: number): `0x${string}` =>
  `0x${n.toString(16).padStart(64, "0")}`;
function setup() {
  const codes = { nft: "0x6000" as const, manager: "0x6001" as const };
  const pin: Pin = {
    version: 1,
    scanId: "id",
    chainId: 96,
    nft: nft.toLowerCase(),
    manager: manager.toLowerCase(),
    blockNumber: "100",
    blockHash: hash(100),
    nftCodeHash: keccak256(codes.nft),
    managerCodeHash: keccak256(codes.manager),
    nftStorageHash: hash(1),
    managerStorageHash: hash(2),
    totalSupply: 2,
    scanCount: 2,
    nextTokenId: "3",
    pageSize: 20,
    createdAt: 0,
    expiresAt: 1800000,
  };
  const client = {
    getChainId: jest.fn(async () => 96),
    getBlockNumber: jest.fn(async () => 103n),
    getBlock: jest.fn(async ({ blockNumber }: { blockNumber: bigint }) => ({
      hash: hash(Number(blockNumber)),
    })),
    getBytecode: jest.fn(async ({ address }: { address: string }) =>
      address === nft ? codes.nft : codes.manager,
    ),
    readContract: jest.fn(async () => nft),
    getProof: jest.fn(
      async ({ address }: { address: string; blockNumber: bigint }) => ({
        codeHash: keccak256(address === nft ? codes.nft : codes.manager),
        storageHash: address === nft ? hash(1) : hash(2),
      }),
    ),
  };
  jest.mocked(createPublicClient).mockReturnValue(client as never);
  return { client, pin, ports: createReadOnlyPorts() };
}
describe("repair pinned storage-root freshness", () => {
  test("unchanged roots and matching rechecked block hashes pass", async () => {
    const f = setup();
    await expect(f.ports.assertCurrent(f.pin)).resolves.toBeUndefined();
    expect(f.client.getProof).toHaveBeenCalledTimes(4);
    expect(f.client.getBlock).toHaveBeenCalledTimes(4);
  });
  test.each([nft, manager])(
    "changed contract storage fails even within three blocks: %s",
    async (address) => {
      const f = setup();
      const read = f.client.getProof.getMockImplementation()!;
      f.client.getProof.mockImplementation(async (input) => ({
        ...(await read(input)),
        storageHash:
          input.address === address && input.blockNumber === 103n
            ? hash(9)
            : (await read(input)).storageHash,
      }));
      await expect(f.ports.assertCurrent(f.pin)).rejects.toThrow(
        "REPAIR_BASELINE_CHANGED",
      );
    },
  );
  test("missing proof support fails closed", async () => {
    const f = setup();
    f.client.getProof.mockRejectedValue(Error("not supported"));
    await expect(f.ports.assertCurrent(f.pin)).rejects.toThrow(
      "REPAIR_SOURCE_UNAVAILABLE",
    );
  });
  test("mixed block during a proof batch fails closed", async () => {
    const f = setup();
    f.client.getBlock
      .mockResolvedValueOnce({ hash: hash(100) })
      .mockResolvedValueOnce({ hash: hash(999) });
    await expect(f.ports.assertCurrent(f.pin)).rejects.toThrow(
      "REPAIR_BASELINE_CHANGED",
    );
  });
  test("proof codeHash must match actual bytecode", async () => {
    const f = setup();
    f.client.getProof.mockResolvedValue({
      codeHash: hash(9),
      storageHash: hash(1),
    });
    await expect(f.ports.assertCurrent(f.pin)).rejects.toThrow(
      "REPAIR_BASELINE_CHANGED",
    );
  });
  test("unchanged roots do not remove age limit", async () => {
    const f = setup();
    f.client.getBlockNumber.mockResolvedValue(201n);
    await expect(f.ports.assertCurrent(f.pin)).rejects.toThrow(
      "REPAIR_BASELINE_CHANGED",
    );
  });
});
test("server-only explicit reader URL fails closed and does not affect writer configuration", () => {
  const before = process.env.BUFFALO_REPAIR_RPC_URL;
  try {
    delete process.env.BUFFALO_REPAIR_RPC_URL;
    expect(repairRpcUrl()).toBe("https://rpc.bitkubchain.io");
    for (const bad of [
      "",
      "http://127.0.0.1",
      "https://user:password@example.test",
      "https://example.test/#secret",
    ]) {
      process.env.BUFFALO_REPAIR_RPC_URL = bad;
      expect(() => repairRpcUrl()).toThrow("REPAIR_DIAGNOSIS_DISABLED");
    }
    process.env.BUFFALO_REPAIR_RPC_URL =
      "https://reader.example.test/rpc?key=server-secret";
    expect(repairRpcUrl()).toBe(process.env.BUFFALO_REPAIR_RPC_URL);
  } finally {
    if (before === undefined) delete process.env.BUFFALO_REPAIR_RPC_URL;
    else process.env.BUFFALO_REPAIR_RPC_URL = before;
  }
});
