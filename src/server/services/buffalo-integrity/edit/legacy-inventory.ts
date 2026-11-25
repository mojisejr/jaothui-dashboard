import { z } from "zod";
import {
  inspectLegacyReconstruction,
  supportsLegacyReconstruction,
} from "./legacy-image-metadata";
import { type LegacyReconstructionIssue } from "~/lib/legacy-reconstruction";
const integer = z
  .string()
  .regex(/^-?\d+$/)
  .transform((value) => BigInt(value));
const rowSchema = z.object({
  tokenId: integer,
  microchip: z.string(),
  name: z.string(),
  certNo: z.string().nullable(),
  birthday: z.string().transform((value) => new Date(value)),
  sex: z.string(),
  motherId: z.string().nullable(),
  fatherId: z.string().nullable(),
  origin: z.string().nullable(),
  height: z.number().nullable(),
  color: z.string(),
  createdAt: z.string(),
  detail: z.string(),
  dna: z.string(),
  image: z.string().nullable(),
  rarity: z.string(),
  updatedAt: z.string(),
});
const nativeSchema = z.object({
  name: z.string(),
  origin: z.string(),
  color: z.string(),
  imageUri: z.string(),
  detail: z.string(),
  sex: z.string(),
  birthdate: integer,
  height: integer,
  createdAt: integer,
  updatedAt: integer,
  certify: z.object({
    microchip: z.string(),
    certNo: z.string(),
    rarity: z.string(),
    dna: z.string(),
    issuedAt: integer,
  }),
  relation: z.object({ motherTokenId: z.string(), fatherTokenId: z.string() }),
});
const entrySchema = z.object({
  tokenId: integer,
  row: rowSchema,
  native: nativeSchema,
  nftRecord: z.tuple([z.string(), z.string()]).rest(z.unknown()),
  identityMatches: z.boolean().optional(),
});
const inventorySchema = z.object({
  registryRows: z.number().int().nonnegative().optional(),
  blockNumber: z.string().optional(),
  blockHash: z.string().optional(),
  blockHashReverified: z.boolean().optional(),
  results: z.array(z.unknown()),
});
export type LegacyInventoryStatus =
  | "unminted"
  | "duplicate_token"
  | "read_unavailable"
  | "invalid_snapshot"
  | "identity_conflict"
  | "not_legacy"
  | "blocked"
  | "eligible_reconstruction";
interface InventoryResult {
  index: number;
  tokenId: string | null;
  status: LegacyInventoryStatus;
  issues?: LegacyReconstructionIssue[];
}
function tokenOf(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const token = (value as Record<string, unknown>).tokenId;
  return typeof token === "string" && /^\d+$/.test(token)
    ? BigInt(token).toString()
    : null;
}
/** Offline evidence classification only. No signer, network, storage or database ports. */
export function classifyLegacyInventory(
  input: unknown,
  options: { trustedStorageBase?: string } = {},
) {
  let trustedBase: string | undefined;
  if (options.trustedStorageBase) {
    const url = new URL(options.trustedStorageBase);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !url.pathname.endsWith("/storage/v1/object/public/slipstorage/")
    )
      throw new Error("INVALID_TRUSTED_STORAGE_BASE");
    trustedBase = url.href;
  }
  const inventory = inventorySchema.parse(input);
  if (
    inventory.registryRows !== undefined &&
    inventory.registryRows !== inventory.results.length
  )
    throw new Error("INVENTORY_ROW_COUNT_MISMATCH");
  const tokens = new Map<string, number>();
  for (const entry of inventory.results) {
    const token = tokenOf(entry);
    if (token && token !== "0") tokens.set(token, (tokens.get(token) ?? 0) + 1);
  }
  const results: InventoryResult[] = inventory.results.map((value, index) => {
    const tokenId = tokenOf(value);
    const result = (
      status: LegacyInventoryStatus,
      issues?: LegacyReconstructionIssue[],
    ): InventoryResult => ({
      index,
      tokenId,
      status,
      ...(issues ? { issues } : {}),
    });
    if (tokenId === "0") return result("unminted");
    if (tokenId && (tokens.get(tokenId) ?? 0) > 1)
      return result("duplicate_token");
    if (
      value &&
      typeof value === "object" &&
      "errorCode" in value &&
      !("native" in value)
    )
      return result("read_unavailable");
    const parsed = entrySchema.safeParse(value);
    if (!parsed.success || !tokenId) return result("invalid_snapshot");
    const entry = parsed.data;
    if (
      entry.tokenId !== entry.row.tokenId ||
      entry.native.certify.microchip !== entry.row.microchip
    )
      return result("identity_conflict");
    if (
      !supportsLegacyReconstruction(
        entry.nftRecord[0],
        entry.nftRecord[1],
        entry.native.imageUri,
        trustedBase ? `${trustedBase}buffalo/${tokenId}.jpg` : undefined,
      )
    )
      return result("not_legacy");
    const issues = inspectLegacyReconstruction(entry.row, entry.native);
    return issues.length
      ? result("blocked", issues)
      : result("eligible_reconstruction");
  });
  const counts: Partial<Record<LegacyInventoryStatus, number>> = {};
  const issueCounts: Record<string, number> = {};
  for (const result of results) {
    counts[result.status] = (counts[result.status] ?? 0) + 1;
    for (const issue of result.issues ?? []) {
      const key = `${issue.field}:${issue.kind}`;
      issueCounts[key] = (issueCounts[key] ?? 0) + 1;
    }
  }
  return {
    version: 1,
    scope: "offline reconstruction preflight only; not whole-edit readiness",
    blockNumber: inventory.blockNumber ?? null,
    blockHash: inventory.blockHash ?? null,
    blockHashReverified: inventory.blockHashReverified ?? false,
    total: results.length,
    uniqueTokens: tokens.size,
    duplicateTokens: [...tokens].filter(([, count]) => count > 1),
    counts,
    issueCounts,
    results,
  };
}
