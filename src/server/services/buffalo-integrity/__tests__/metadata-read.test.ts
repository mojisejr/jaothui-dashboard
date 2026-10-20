jest.mock("~/server/blockchain/viem", () => ({
  viemPublic: {
    readContract: jest.fn(),
    getBlockNumber: jest.fn(async () => 100n),
    getChainId: jest.fn(async () => 96),
  },
  viemWallet: {},
  account: {},
}));
jest.mock("~/server/services/buffalo.service", () => ({
  getByMicrochip: jest.fn(),
}));
jest.mock("~/server/db", () => ({ db: {} }));
jest.mock("~/server/services/supabase/supabase", () => ({
  getJsonUrl: jest.fn(),
  getImageUrl: () => "https://example.test/1360.jpg",
}));
import { getMetadataByMicrochipId } from "~/server/blockchain/metadata.service";
import { getByMicrochip } from "~/server/services/buffalo.service";
import { viemPublic } from "~/server/blockchain/viem";

const record = {
  microchip: "764040226601229",
  tokenId: 1360n,
  name: "กำไรสยาม",
  birthday: new Date("2024-06-30T00:00:00.000Z"),
  sex: "Male",
  origin: "thai",
  color: "Black",
  height: 145,
  detail: "รายละเอียด",
  certNo: "C123",
  dna: "N/A",
  fatherId: "IDB1277",
  motherId: null,
  image: "https://example.test/image",
  rarity: "Normal",
  createdAt: "1700000000000",
  updatedAt: "1700000000000",
  Reward: [],
};
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getByMicrochip).mockResolvedValue(record);
});
test("DB cow remains readable when RPC is unavailable", async () => {
  jest
    .mocked(viemPublic.readContract)
    .mockRejectedValue(new Error("RPC unavailable"));
  expect(await getMetadataByMicrochipId(record.microchip)).toMatchObject({
    name: record.name,
    tokenId: 1360,
    microchip: record.microchip,
    height: "145",
    sync: { status: "unavailable" },
  });
});
test("wrong chain cow is never combined with the requested DB token", async () => {
  jest
    .mocked(viemPublic.readContract)
    .mockResolvedValue({
      name: "another cow",
      certify: { microchip: "other" },
    });
  expect(await getMetadataByMicrochipId(record.microchip)).toMatchObject({
    name: record.name,
    tokenId: 1360,
  });
});
