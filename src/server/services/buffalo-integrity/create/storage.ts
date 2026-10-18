import { createHash } from "crypto";
import { type SupabaseClient } from "@supabase/supabase-js";
import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname, resolve, sep } from "path";
import { IntegrityError } from "../operations/hash";

export const contentHash = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
export interface AssetStorage {
  publicUrl: (key: string) => string;
  get: (key: string) => Promise<Buffer | null>;
  putImmutable: (key: string, bytes: Buffer, mime: string) => Promise<void>;
}
function safeKey(key: string): string {
  if (
    !/^(operations\/[0-9a-f]{64}\/[0-9a-f-]{36}\/[a-zA-Z0-9._-]+|buffalo\/[1-9][0-9]*\.jpg|json\/[1-9][0-9]*\.json)$/.test(
      key,
    )
  )
    throw new IntegrityError("UNOWNED_ASSET_KEY");
  return key;
}
export function operationPrefix(owner: string, key: string) {
  if (!/^[0-9a-f-]{36}$/.test(key))
    throw new IntegrityError("INVALID_DRAFT_KEY");
  return `operations/${createHash("sha256").update(owner).digest("hex")}/${key}`;
}
export function localAssetStorage(
  directory: string,
  origin: string,
): AssetStorage {
  const url = new URL(origin);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1")
    throw new IntegrityError("LOOPBACK_STORAGE_ONLY");
  const root = resolve(directory);
  const file = (key: string) => {
    const path = resolve(root, safeKey(key));
    if (!path.startsWith(root + sep))
      throw new IntegrityError("UNOWNED_ASSET_KEY");
    return path;
  };
  const get = async (key: string) => {
    try {
      return await readFile(file(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  };
  return {
    publicUrl: (key) => `${url.origin}/${safeKey(key)}`,
    get,
    async putImmutable(key, bytes) {
      const path = file(key);
      await mkdir(dirname(path), { recursive: true });
      try {
        await writeFile(path, bytes, { flag: "wx" });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        const existing = await get(key);
        if (!existing || contentHash(existing) !== contentHash(bytes))
          throw new IntegrityError("ASSET_ALREADY_BOUND");
      }
    },
  };
}
/** Server credentials are injected; this adapter never imports NEXT_PUBLIC browser credentials. */
export function supabaseAssetStorage(
  client: SupabaseClient,
  bucket: string,
): AssetStorage {
  const get = async (key: string) => {
    const result = await client.storage.from(bucket).download(safeKey(key));
    if (result.error) {
      const error = result.error as {
        statusCode?: string | number;
        status?: number;
        code?: string;
        message: string;
      };
      const status = Number(error.statusCode ?? error.status);
      if (
        status === 404 ||
        (status === 400 &&
          ["object not found", "not found"].includes(
            error.message.toLowerCase(),
          ))
      )
        return null;
      throw new IntegrityError("STORAGE_ORIGIN_UNAVAILABLE");
    }
    return Buffer.from(await result.data.arrayBuffer());
  };
  return {
    publicUrl: (key) =>
      client.storage.from(bucket).getPublicUrl(safeKey(key)).data.publicUrl,
    get,
    async putImmutable(key, bytes, mime) {
      const result = await client.storage
        .from(bucket)
        .upload(safeKey(key), bytes, {
          contentType: mime,
          upsert: false,
          cacheControl: key.startsWith("operations/") ? "31536000" : "0",
        });
      if (result.error) {
        const before = await get(key);
        if (!before || contentHash(before) !== contentHash(bytes))
          throw new IntegrityError("ASSET_ALREADY_BOUND");
      }
    },
  };
}
