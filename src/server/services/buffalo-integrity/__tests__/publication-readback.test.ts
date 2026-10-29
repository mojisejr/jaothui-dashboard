/** @jest-environment node */
import { displayedImageUrl, verifyPublicAsset } from "../publication-readback";
import { contentHash, type AssetStorage } from "../create/storage";
const bytes = Buffer.from("confirmed bytes"),
  hash = contentHash(bytes);
const storage = {
  publicUrl: (key: string) => `https://owned.example/${key}`,
} as AssetStorage;
afterEach(() => jest.restoreAllMocks());
test("stale alias falls back to an exact content version without weakening byte verification", async () => {
  const fetch = jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response("old"))
    .mockResolvedValueOnce(new Response(bytes));
  await verifyPublicAsset(storage, "buffalo/1.jpg", hash);
  expect(fetch).toHaveBeenLastCalledWith(
    `https://owned.example/buffalo/1.jpg?cacheNonce=${hash}`,
    expect.objectContaining({ cache: "no-store", redirect: "error" }),
  );
});
test.each(["wrong", "missing", "network"])(
  "%s content never passes publication and logs no provider secrets",
  async (variant) => {
    const warn = jest
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const fetch = jest.spyOn(globalThis, "fetch");
    if (variant === "network")
      fetch.mockRejectedValue(Error("secret-provider-token"));
    else
      fetch.mockImplementation(
        async () =>
          new Response("wrong", { status: variant === "missing" ? 404 : 200 }),
      );
    await expect(
      verifyPublicAsset(storage, "json/1.json", hash),
    ).rejects.toMatchObject({ code: "PUBLIC_ASSET_READBACK_PENDING" });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(warn.mock.calls)).not.toContain(
      "secret-provider-token",
    );
    expect(JSON.stringify(warn.mock.calls)).toContain("json/1.json");
  },
);
test("displayed image version changes only with published row image/version, not every read", () => {
  const url = "https://owned.example/buffalo/1.jpg",
    row = { image: "immutable/old.jpg", updatedAt: "1" };
  expect(displayedImageUrl(url, row)).toBe(displayedImageUrl(url, { ...row }));
  expect(displayedImageUrl(url, row)).not.toBe(
    displayedImageUrl(url, { image: "immutable/new.jpg", updatedAt: "2" }),
  );
});
