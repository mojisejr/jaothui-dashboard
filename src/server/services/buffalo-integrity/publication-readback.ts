import { diagnosticContext } from "~/server/diagnostics/reporter";
import { IntegrityError, payloadHash } from "./operations/hash";
import { contentHash, type AssetStorage } from "./create/storage";

export function versionedAssetUrl(url: string, version: string): string {
  const target = new URL(url);
  target.searchParams.set("cacheNonce", version);
  return target.href;
}

export function displayedImageUrl(
  url: string,
  row: { image: string | null; updatedAt: string },
): string {
  return versionedAssetUrl(
    url,
    payloadHash({ image: row.image, updatedAt: row.updatedAt }),
  );
}

/** A stale alias is not a failed blockchain transaction. Retry once using a
 * deterministic content version; neither response is accepted without SHA256 proof.
 * Two bounded reads fit within the existing request budget. No signing or writes. */
export async function verifyPublicAsset(
  storage: AssetStorage,
  key: string,
  expectedHash: string,
): Promise<void> {
  let status: number | null = null;
  let actualHash: string | null = null;
  const canonical = storage.publicUrl(key);
  for (const versioned of [false, true]) {
    try {
      const response = await fetch(
        versioned ? versionedAssetUrl(canonical, expectedHash) : canonical,
        {
          cache: "no-store",
          signal: AbortSignal.timeout(2500),
          redirect: "error",
        },
      );
      status = response.status;
      actualHash = response.ok
        ? contentHash(Buffer.from(await response.arrayBuffer()))
        : null;
      if (actualHash === expectedHash) return;
    } catch {
      status = null;
      actualHash = null;
    }
  }
  // Only owned keys, hashes and correlation IDs: no URL, credentials or provider body.
  const context = diagnosticContext();
  try {
    console.warn(
      JSON.stringify({
        event: "buffalo_publication_readback",
        at: new Date().toISOString(),
        requestId: context?.requestId,
        operationId: context?.operationId,
        key,
        expectedHash,
        actualHash,
        status,
      }),
    );
  } catch {
    /* Observability cannot change the durable outcome. */
  }
  throw new IntegrityError("PUBLIC_ASSET_READBACK_PENDING");
}
