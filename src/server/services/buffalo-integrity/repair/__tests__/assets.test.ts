/** @jest-environment node */
import { publicRepairAssets, type AssetFetch } from "../assets";
import {
  type RepairProposal,
  type TokenBaseline,
  type DatabaseRow,
} from "../contract";
import { contentHash } from "../../create/storage";
const origin = "https://fixtureproject.supabase.co",
  base = `${origin}/storage/v1/object/public/slipstorage/`,
  chip = "991000000000001",
  desired = "991000000000002";
const image = Buffer.from("synthetic-image-bytes");
const metadata = {
  edition: 1,
  name: `Cow #${chip}`,
  image: `${base}buffalo/1.jpg`,
  attributes: [
    { trait_type: "Microchip", value: chip },
    { trait_type: "DNA", value: "preserve-me" },
  ],
  extra: "unchanged",
};
const token: TokenBaseline = {
  tokenId: "1",
  microchip: chip,
  dna: "dna",
  metadata: { imageUri: metadata.image },
  owner: "owner",
  tokenUri: `${base}json/1.json`,
  approvals: [],
  native: { createdAt: "1", updatedAt: "1" },
};
const rows: DatabaseRow[] = [
  { microchip: chip, tokenId: "1", baseline: { image: metadata.image } },
];
const proposal: RepairProposal = {
  targets: [
    {
      sourceMicrochip: chip,
      desiredMicrochip: desired,
      desiredTokenId: "1",
      evidence: [{ kind: "physical_scan", reference: "fixture" }],
    },
  ],
  knownAliases: [],
};
function fakeFetch(): jest.MockedFunction<AssetFetch> {
  return jest.fn(
    async (input) =>
      new Response(
        String(input).endsWith(".json") ? JSON.stringify(metadata) : image,
      ),
  ) as jest.MockedFunction<AssetFetch>;
}
describe("repair public asset evidence", () => {
  test("binds before bytes and projects only identity JSON fields", async () => {
    const fetcher = fakeFetch();
    const result = await publicRepairAssets(origin, fetcher)(
      [token],
      rows,
      proposal,
    );
    expect(result.verification).toBe("complete");
    const entry = result.tokens[0]!;
    expect(entry.before).toHaveLength(6);
    expect(entry.after?.imageHash).toBe(contentHash(image));
    expect(entry.after?.json).toEqual({
      ...metadata,
      name: `Cow #${desired}`,
      attributes: [
        { trait_type: "Microchip", value: desired },
        { trait_type: "DNA", value: "preserve-me" },
      ],
    });
    expect(entry.after?.jsonHash).toBe(
      contentHash(Buffer.from(JSON.stringify(entry.after?.json))),
    );
    expect(
      fetcher.mock.calls.every(([, init]) => init?.redirect === "error"),
    ).toBe(true);
  });
  test("rejects arbitrary metadata URLs before network", async () => {
    const fetcher = fakeFetch();
    const result = await publicRepairAssets(origin, fetcher)(
      [{ ...token, tokenUri: "http://127.0.0.1/private" }],
      rows,
      proposal,
    );
    expect(result.verification).toBe("needs_review");
    expect(fetcher).not.toHaveBeenCalled();
  });
  test("rejects query/encoded traversal before network", async () => {
    for (const path of ["json/1.json?secret=x", "json/%2e%2e/private.json"]) {
      const fetcher = fakeFetch();
      const result = await publicRepairAssets(origin, fetcher)(
        [{ ...token, tokenUri: base + path }],
        rows,
        proposal,
      );
      expect(result.verification).toBe("needs_review");
      expect(fetcher).not.toHaveBeenCalled();
    }
  });
  test("rejects untrusted origin configuration", async () => {
    const fetcher = fakeFetch();
    const result = await publicRepairAssets(
      "https://supabase.co.evil.test",
      fetcher,
    )([token], rows, proposal);
    expect(result.blockers).toContain("ASSET_ORIGIN_REVIEW_REQUIRED");
    expect(fetcher).not.toHaveBeenCalled();
  });
  test("enforces byte limit before buffering", async () => {
    const fetcher = jest.fn(
      async (_input: string) =>
        new Response("x", { headers: { "content-length": "99999999" } }),
    ) as jest.MockedFunction<AssetFetch>;
    expect(
      (await publicRepairAssets(origin, fetcher)([token], rows, proposal))
        .blockers,
    ).toContain("ASSET_SIZE_LIMIT");
  });
  test("missing or forbidden public asset remains explicit incomplete evidence", async () => {
    const fetcher = jest.fn(
      async (_input: string) => new Response("forbidden", { status: 403 }),
    ) as jest.MockedFunction<AssetFetch>;
    const result = await publicRepairAssets(origin, fetcher)(
      [token],
      rows,
      proposal,
    );
    expect(result.blockers).toContain("ASSET_READ_UNAVAILABLE");
    expect(result.tokens[0]?.after).toBeNull();
  });
  test("unexplained NFT JSON identity cannot be overwritten", async () => {
    const fetcher = jest.fn(
      async (_input: string) =>
        new Response(
          JSON.stringify({
            ...metadata,
            name: "Other #999",
            attributes: [{ trait_type: "Microchip", value: "999" }],
          }),
        ),
    ) as jest.MockedFunction<AssetFetch>;
    expect(
      (await publicRepairAssets(origin, fetcher)([token], rows, proposal))
        .blockers,
    ).toContain("NFT_JSON_IDENTITY_REVIEW_REQUIRED");
  });
  test("different DB image bytes requires identity review", async () => {
    const fetcher = fakeFetch();
    fetcher.mockImplementation(
      async (input) =>
        new Response(
          String(input).endsWith(".json")
            ? JSON.stringify(metadata)
            : String(input).endsWith("2.jpg")
              ? "other-image"
              : image,
        ),
    );
    expect(
      (
        await publicRepairAssets(origin, fetcher)(
          [token],
          [{ ...rows[0]!, baseline: { image: base + "buffalo/2.jpg" } }],
          proposal,
        )
      ).blockers,
    ).toContain("IMAGE_IDENTITY_REVIEW_REQUIRED");
  });
  test("normalizes only the same NFT's legacy extensionless database image reference after verified missing-key response", async () => {
    const fetcher = fakeFetch();
    fetcher.mockImplementation(
      async (input) =>
        new Response(
          input === base + "buffalo/1"
            ? JSON.stringify({
                statusCode: "404",
                error: "not_found",
                code: "NoSuchKey",
              })
            : input.endsWith(".json")
              ? JSON.stringify(metadata)
              : image,
          { status: input === base + "buffalo/1" ? 400 : 200 },
        ),
    );
    const result = await publicRepairAssets(origin, fetcher)(
      [token],
      [{ ...rows[0]!, baseline: { image: base + "buffalo/1" } }],
      proposal,
    );
    expect(result.verification).toBe("complete");
    expect(result.tokens[0]?.before).toContainEqual(
      expect.objectContaining({
        role: "database_image",
        url: base + "buffalo/1.jpg",
        hash: contentHash(image),
      }),
    );
    expect(result.tokens[0]?.after?.legacyDatabaseImage).toEqual({
      from: base + "buffalo/1",
      to: base + "buffalo/1.jpg",
      originalHash: null,
    });
  });
  test.each([403, 500])(
    "does not turn a legacy image HTTP %s failure into missing-file evidence",
    async (status) => {
      const fetcher = fakeFetch();
      fetcher.mockImplementation(
        async (input) =>
          new Response(
            input.endsWith(".json") ? JSON.stringify(metadata) : image,
            { status: input === base + "buffalo/1" ? status : 200 },
          ),
      );
      const result = await publicRepairAssets(origin, fetcher)(
        [token],
        [{ ...rows[0]!, baseline: { image: base + "buffalo/1" } }],
        proposal,
      );
      expect(result.blockers).toContain("ASSET_READ_UNAVAILABLE");
      expect(result.tokens[0]?.after).toBeNull();
    },
  );
  test("a different existing legacy object still blocks repair", async () => {
    const fetcher = fakeFetch();
    fetcher.mockImplementation(
      async (input) =>
        new Response(
          input.endsWith(".json")
            ? JSON.stringify(metadata)
            : input === base + "buffalo/1"
              ? "different-cow-image"
              : image,
        ),
    );
    const result = await publicRepairAssets(origin, fetcher)(
      [token],
      [{ ...rows[0]!, baseline: { image: base + "buffalo/1" } }],
      proposal,
    );
    expect(result.blockers).toContain("IMAGE_IDENTITY_REVIEW_REQUIRED");
  });
  test.each(["buffalo/2", "buffalo/1?x=1", "buffalo/1.png"])(
    "legacy normalization does not widen ownership to %s",
    async (key) => {
      const result = await publicRepairAssets(origin, fakeFetch())(
        [token],
        [{ ...rows[0]!, baseline: { image: base + key } }],
        proposal,
      );
      expect(result.verification).toBe("needs_review");
    },
  );
});
