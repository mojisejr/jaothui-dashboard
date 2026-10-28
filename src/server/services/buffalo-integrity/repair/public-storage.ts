import {
  contentHash,
  ownedAssetKey,
  type AssetStorage,
} from "../create/storage";
import { IntegrityError } from "../operations/hash";
/** Bounded public verification uses only the configured origin and owned paths; no redirects or arbitrary URL fetches. */
export function repairPublicStorage(origin: string): AssetStorage {
  const url = new URL(origin);
  if (
    url.protocol !== "https:" ||
    !/^[a-z0-9]+\.supabase\.co$/.test(url.hostname) ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new IntegrityError("ASSET_ORIGIN_REVIEW_REQUIRED");
  const prefix = `${url.origin}/storage/v1/object/public/slipstorage/`;
  const store: AssetStorage = {
    publicUrl: (key) => {
      const value = prefix + key;
      ownedAssetKey({ publicUrl: (k) => prefix + k } as AssetStorage, value);
      return value;
    },
    async get(key) {
      const response = await fetch(store.publicUrl(key), {
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(12000),
      });
      if (response.status === 404) return null;
      if (!response.ok || !response.body)
        throw new IntegrityError("STORAGE_ORIGIN_UNAVAILABLE");
      const max = key.endsWith(".json") ? 2097152 : 10485760;
      if (Number(response.headers.get("content-length") ?? 0) > max)
        throw new IntegrityError("ASSET_BASELINE_CHANGED");
      const reader = response.body.getReader(),
        chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > max) throw new IntegrityError("ASSET_BASELINE_CHANGED");
          chunks.push(part.value);
        }
      } finally {
        await reader.cancel().catch(() => undefined);
      }
      return Buffer.concat(chunks);
    },
    async putImmutable() {
      throw new IntegrityError("REPAIR_CHAIN_ACTION_FORBIDDEN");
    },
  };
  return store;
}
export async function assertAssetHash(
  storage: AssetStorage,
  key: string,
  hash: string | null,
) {
  const bytes = await storage.get(key);
  if ((bytes ? contentHash(bytes) : null) !== hash)
    throw new IntegrityError("ASSET_BASELINE_CHANGED");
}
