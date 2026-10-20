/** @jest-environment node */
import { mkdtemp, readFile, mkdir, rm } from "fs/promises";
import { join, resolve } from "path";
import { randomUUID } from "crypto";
import {
  localAssetStorage,
  operationPrefix,
  contentHash,
  supabaseAssetStorage,
} from "../storage";
import { type SupabaseClient } from "@supabase/supabase-js";
const roots: string[] = [];
beforeAll(async () => {
  await mkdir(resolve(".tmp/tests"), { recursive: true });
});
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});
async function temporary(prefix: string) {
  const directory = await mkdtemp(resolve(".tmp/tests", prefix));
  roots.push(directory);
  return directory;
}
test("owned immutable objects and aliases reject replacement and traversal; same content retries are idempotent", async () => {
  const directory = await temporary("buffalo-assets-");
  const storage = localAssetStorage(directory, "http://127.0.0.1:18551");
  const key = `${operationPrefix("shared:qa", randomUUID())}/source.jpg`;
  await storage.putImmutable(key, Buffer.from("original"), "image/jpeg");
  await storage.putImmutable(key, Buffer.from("original"), "image/jpeg");
  await expect(
    storage.putImmutable(key, Buffer.from("other"), "image/jpeg"),
  ).rejects.toThrow("ASSET_ALREADY_BOUND");
  await storage.putImmutable(
    "buffalo/999.jpg",
    Buffer.from("legacy"),
    "image/jpeg",
  );
  await expect(
    storage.putImmutable("buffalo/999.jpg", Buffer.from("new"), "image/jpeg"),
  ).rejects.toThrow("ASSET_ALREADY_BOUND");
  expect((await storage.get("buffalo/999.jpg"))?.toString()).toBe("legacy");
  expect(() => storage.publicUrl("../../secret")).toThrow("UNOWNED_ASSET_KEY");
  expect(contentHash(await readFile(join(directory, key)))).toBe(
    contentHash(Buffer.from("original")),
  );
});
test("concurrent different aliases cannot silently overwrite one another", async () => {
  const directory = await temporary("buffalo-alias-");
  const storage = localAssetStorage(directory, "http://127.0.0.1:18551");
  const outcomes = await Promise.allSettled([
    storage.putImmutable(
      "json/1000.json",
      Buffer.from("A"),
      "application/json",
    ),
    storage.putImmutable(
      "json/1000.json",
      Buffer.from("B"),
      "application/json",
    ),
  ]);
  expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
  expect(["A", "B"]).toContain(
    (await storage.get("json/1000.json"))?.toString(),
  );
});
test("production-compatible Supabase port uses no-overwrite and preserves permission errors", async () => {
  const upload = jest.fn().mockResolvedValue({ error: null });
  const download = jest.fn().mockResolvedValue({
    data: null,
    error: { statusCode: "403", message: "permission denied" },
  });
  const from = jest.fn(() => ({
    upload,
    download,
    getPublicUrl: () => ({
      data: {
        publicUrl: "https://assets.example.test/slipstorage/buffalo/1.jpg",
      },
    }),
  }));
  const storage = supabaseAssetStorage(
    { storage: { from } } as unknown as SupabaseClient,
    "slipstorage",
  );
  await storage.putImmutable(
    "buffalo/1.jpg",
    Buffer.from("jpeg"),
    "image/jpeg",
  );
  expect(from).toHaveBeenCalledWith("slipstorage");
  expect(upload).toHaveBeenCalledWith(
    "buffalo/1.jpg",
    expect.any(Buffer),
    expect.objectContaining({ upsert: false, contentType: "image/jpeg" }),
  );
  await expect(storage.get("buffalo/1.jpg")).rejects.toThrow(
    "STORAGE_ORIGIN_UNAVAILABLE",
  );
  download.mockResolvedValueOnce({
    error: { statusCode: "404", message: "Object missing" },
  });
  expect(await storage.get("buffalo/2.jpg")).toBeNull();
});
