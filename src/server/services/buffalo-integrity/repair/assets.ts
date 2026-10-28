import {
  ownedAssetKey,
  contentHash,
  type AssetStorage,
} from "~/server/services/buffalo-integrity/create/storage";
import { type Json } from "~/server/services/buffalo-integrity/operations/types";
import {
  type RepairProposal,
  type DatabaseRow,
  type TokenBaseline,
} from "./contract";
export type AssetFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;
export interface AssetEvidence {
  verification: "complete" | "needs_review";
  blockers: string[];
  tokens: {
    tokenId: string;
    before: {
      role: string;
      url: string;
      key: string;
      hash: string | null;
      bytes: number;
    }[];
    after: {
      imageHash: string;
      jsonHash: string;
      json: Json;
      aliasImageKey: string;
      aliasJsonKey: string;
      uriStrategy: "preserve" | "publish_immutable_then_set_token_uri";
      expectedUriSetterCount: 0 | 1;
      immutablePathBinding: "bind_operation_key_before_approval" | null;
    } | null;
  }[];
}
/** Same owned-key policy as existing publication, with public HTTPS reads only and bounded streaming. */
export function publicRepairAssets(
  origin: string,
  fetcher: AssetFetch = fetch,
) {
  let base: URL;
  try {
    base = new URL(origin);
  } catch {
    return async (): Promise<AssetEvidence> => ({
      verification: "needs_review",
      blockers: ["ASSET_ORIGIN_REVIEW_REQUIRED"],
      tokens: [],
    });
  }
  if (
    base.protocol !== "https:" ||
    !/^[a-z0-9]+\.supabase\.co$/.test(base.hostname) ||
    base.port ||
    base.username ||
    base.password ||
    base.pathname !== "/" ||
    base.search ||
    base.hash
  )
    return async (): Promise<AssetEvidence> => ({
      verification: "needs_review",
      blockers: ["ASSET_ORIGIN_REVIEW_REQUIRED"],
      tokens: [],
    });
  const prefix = `${base.origin}/storage/v1/object/public/slipstorage/`;
  const storage = { publicUrl: (key: string) => prefix + key } as AssetStorage;
  async function read(url: string, optional = false) {
    const key = ownedAssetKey(storage, url);
    const limit = key.endsWith(".json") ? 2 * 1024 * 1024 : 10 * 1024 * 1024;
    const response = await fetcher(url, {
      redirect: "error",
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
    if (optional && response.status === 404) return { key, bytes: null };
    if (!response.ok || !response.body) throw Error("ASSET_READ_UNAVAILABLE");
    if (Number(response.headers.get("content-length") ?? 0) > limit)
      throw Error("ASSET_SIZE_LIMIT");
    const reader = response.body.getReader(),
      chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > limit) throw Error("ASSET_SIZE_LIMIT");
        chunks.push(next.value);
      }
    } finally {
      await reader.cancel();
    }
    return { key, bytes: Buffer.concat(chunks) };
  }
  return async (
    tokens: TokenBaseline[],
    rows: DatabaseRow[],
    proposal: RepairProposal,
  ): Promise<AssetEvidence> => {
    const result: AssetEvidence = {
      verification: "complete",
      blockers: [],
      tokens: [],
    };
    for (const token of tokens) {
      const entry: AssetEvidence["tokens"][number] = {
        tokenId: token.tokenId,
        before: [],
        after: null,
      };
      result.tokens.push(entry);
      try {
        const target = proposal.targets.find(
          (t) => t.desiredTokenId === token.tokenId,
        )!;
        const jsonAsset = await read(token.tokenUri);
        if (!jsonAsset.bytes) throw Error("NFT_JSON_REVIEW_REQUIRED");
        const value = JSON.parse(jsonAsset.bytes.toString()) as Record<
          string,
          Json
        >;
        if (
          !value ||
          Array.isArray(value) ||
          value.edition !== Number(token.tokenId) ||
          typeof value.name !== "string" ||
          typeof value.image !== "string" ||
          !Array.isArray(value.attributes)
        )
          throw Error("NFT_JSON_REVIEW_REQUIRED");
        const traits = new Map<string, Record<string, Json>>();
        for (const trait of value.attributes) {
          if (
            !trait ||
            typeof trait !== "object" ||
            Array.isArray(trait) ||
            typeof trait.trait_type !== "string" ||
            traits.has(trait.trait_type)
          )
            throw Error("NFT_JSON_REVIEW_REQUIRED");
          traits.set(trait.trait_type, trait);
        }
        const previous = traits.get("Microchip")?.value;
        if (
          typeof previous !== "string" ||
          ![
            token.microchip,
            target.sourceMicrochip,
            target.desiredMicrochip,
          ].includes(previous) ||
          !value.name.endsWith(` #${previous}`)
        )
          throw Error("NFT_JSON_IDENTITY_REVIEW_REQUIRED");
        const image = await read(value.image);
        if (!image.bytes) throw Error("ASSET_READ_UNAVAILABLE");
        entry.before.push(
          {
            role: "nft_json",
            url: token.tokenUri,
            key: jsonAsset.key,
            hash: contentHash(jsonAsset.bytes),
            bytes: jsonAsset.bytes.length,
          },
          {
            role: "nft_image",
            url: value.image,
            key: image.key,
            hash: contentHash(image.bytes),
            bytes: image.bytes.length,
          },
        );
        const metadata = token.metadata as Record<string, Json>,
          row = rows.find((r) => r.microchip === target.sourceMicrochip)
            ?.baseline as Record<string, Json> | undefined;
        const candidates = [
          { role: "chain_image", url: metadata.imageUri },
          { role: "database_image", url: row?.image },
          {
            role: "image_alias",
            url: storage.publicUrl(`buffalo/${token.tokenId}.jpg`),
          },
          {
            role: "json_alias",
            url: storage.publicUrl(`json/${token.tokenId}.json`),
          },
        ];
        for (const candidate of candidates) {
          if (typeof candidate.url !== "string" || !candidate.url)
            throw Error("ASSET_ORIGIN_REVIEW_REQUIRED");
          const asset = await read(
            candidate.url,
            candidate.role.endsWith("_alias"),
          );
          entry.before.push({
            role: candidate.role,
            url: candidate.url,
            key: asset.key,
            hash: asset.bytes ? contentHash(asset.bytes) : null,
            bytes: asset.bytes?.length ?? 0,
          });
          if (
            candidate.role.endsWith("_image") &&
            (!asset.bytes ||
              contentHash(asset.bytes) !== contentHash(image.bytes))
          )
            throw Error("IMAGE_IDENTITY_REVIEW_REQUIRED");
        }
        value.name = `${value.name.slice(0, -` #${previous}`.length)} #${target.desiredMicrochip}`;
        traits.get("Microchip")!.value = target.desiredMicrochip;
        const after =
          previous === target.desiredMicrochip
            ? jsonAsset.bytes
            : Buffer.from(JSON.stringify(value));
        entry.after = {
          imageHash: contentHash(image.bytes),
          jsonHash: contentHash(after),
          json: value,
          aliasImageKey: `buffalo/${token.tokenId}.jpg`,
          aliasJsonKey: `json/${token.tokenId}.json`,
          uriStrategy:
            previous !== target.desiredMicrochip &&
            jsonAsset.key !== `json/${token.tokenId}.json`
              ? "publish_immutable_then_set_token_uri"
              : "preserve",
          expectedUriSetterCount:
            previous !== target.desiredMicrochip &&
            jsonAsset.key !== `json/${token.tokenId}.json`
              ? 1
              : 0,
          immutablePathBinding:
            previous !== target.desiredMicrochip &&
            jsonAsset.key !== `json/${token.tokenId}.json`
              ? "bind_operation_key_before_approval"
              : null,
        };
      } catch (error) {
        const allowed = [
          "ASSET_READ_UNAVAILABLE",
          "ASSET_SIZE_LIMIT",
          "NFT_JSON_REVIEW_REQUIRED",
          "NFT_JSON_IMMUTABLE_TARGET_REVIEW_REQUIRED",
          "NFT_JSON_IDENTITY_REVIEW_REQUIRED",
          "IMAGE_IDENTITY_REVIEW_REQUIRED",
          "ASSET_ORIGIN_REVIEW_REQUIRED",
          "UNOWNED_ASSET_KEY",
        ];
        const code =
          error instanceof Error && allowed.includes(error.message)
            ? error.message
            : "ASSET_READ_UNAVAILABLE";
        result.blockers.push(code);
        result.verification = "needs_review";
      }
    }
    result.blockers = [...new Set(result.blockers)].sort();
    return result;
  };
}
