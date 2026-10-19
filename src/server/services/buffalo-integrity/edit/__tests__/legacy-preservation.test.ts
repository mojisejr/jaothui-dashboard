/** @jest-environment node */
/* eslint-disable @typescript-eslint/unbound-method -- assertions inspect Jest mock calls only */
jest.mock("~/server/db", () => ({ db: { pedigree: { update: jest.fn() } } }));
jest.mock("~/server/blockchain/metadata.service", () => ({
  updateDNAOnChain: jest.fn(),
}));
jest.mock("~/server/services/supabase/upload-imagefile", () => ({
  uploadImage: jest.fn(),
}));
jest.mock("~/server/services/supabase/upload-jsonfile", () => ({
  uploadJson: jest.fn(),
}));
jest.mock("~/server/services/supabase/supabase", () => ({
  getImageUrl: jest.fn(),
  getJsonUrl: jest.fn(),
}));
import { db } from "~/server/db";
import { updateDNAOnChain } from "~/server/blockchain/metadata.service";
import { updateDNA } from "~/server/services/buffalo.service";
test("unverified legacy DNA write never changes the published DB record", async () => {
  (db.pedigree.update as jest.Mock).mockResolvedValue({ dna: "unverified" });
  (updateDNAOnChain as jest.Mock).mockResolvedValue(null);
  await expect(
    updateDNA("99999", "999000000004001", "https://dna.example.test/new"),
  ).rejects.toThrow("LEGACY_WRITE_REQUIRES_DURABLE_OPERATION");
  expect(db.pedigree.update as jest.Mock).not.toHaveBeenCalled();
});
