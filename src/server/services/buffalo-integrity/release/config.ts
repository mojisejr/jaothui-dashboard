import { z } from "zod";
import { resolve, sep } from "path";
import { readFileSync } from "fs";
import { createHash } from "crypto";
import { privateKeyToAccount } from "viem/accounts";
import { type Hex } from "viem";
import { address as nft } from "~/server/blockchain/nft/abi";
import { address as manager } from "~/server/blockchain/metadata-maneger/abi";
import { IntegrityError } from "../operations/hash";
import { assertLoopbackUrl } from "../operations/loopback";
const hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const network = z
  .object({
    chainId: z.literal(96),
    nft: z.literal(nft),
    manager: z.literal(manager),
  })
  .strict();
const common = z.object({
  releaseId: z.string().min(8),
  databaseUrl: z.string().url(),
  rpcUrl: z.string().url(),
  privateKey: hash,
  sender: address,
  receiver: address,
  domain: network,
  codeHashes: z.record(hash),
  maxFeeWei: z.string().regex(/^\d+$/).default("50000000000000000"),
  confirmations: z.number().int().min(3).max(64).default(3),
});
const live = common
  .extend({
    kind: z.literal("production"),
    checkpoint: z.object({ number: z.string().regex(/^\d+$/), hash }),
    storageUrl: z.string().url(),
    storageBucket: z.literal("slipstorage"),
    storageJwt: z.string().min(20),
  })
  .strict();
export type ProductionConfig = z.infer<typeof live>;
export interface IsolatedConfig {
  databaseUrl: string;
  rpcUrl: string;
  privateKey: Hex;
  sender: string;
  receiver: string;
  domain: { chainId: number; nft: string; manager: string };
  instanceId: string;
  codeHashes: Record<string, string>;
  storageDirectory: string;
  storageOrigin: string;
  storageUrl?: string;
  storageJwt?: string;
  storageBucket?: string;
  releaseId?: string;
  projectionFailures?: number;
  editProjectionFailures?: number;
  editPauseAfterBatch?: boolean;
}
export type RuntimeConfig =
  | { kind: "isolated"; key: string; value: IsolatedConfig }
  | { kind: "production"; key: string; value: ProductionConfig };
const digest = (v: string) => createHash("sha256").update(v).digest("hex");
export function writeMode(env: Partial<NodeJS.ProcessEnv> = process.env) {
  const v =
    env.BUFFALO_INTEGRITY_MODE ??
    (env.BUFFALO_INTEGRITY_ISOLATED_CONFIG ? "enabled" : "off");
  if (!["off", "drain", "enabled"].includes(v))
    throw new IntegrityError("INVALID_INTEGRITY_MODE");
  return v as "off" | "drain" | "enabled";
}
function storageRole(token: string) {
  try {
    return z
      .object({
        role: z.literal("buffalo_integrity_writer"),
        exp: z.number().finite().int().positive(),
      })
      .parse(
        JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString()),
      );
  } catch {
    throw new IntegrityError("SCOPED_STORAGE_TOKEN_REQUIRED");
  }
}
/** Read-only legacy clients share target attestation, independently of write activation. */
export function isolatedConfig(env: Partial<NodeJS.ProcessEnv> = process.env) {
  if (!env.BUFFALO_INTEGRITY_ISOLATED_CONFIG)
    throw new IntegrityError("ISOLATED_CONFIG_REQUIRED");
  const root = resolve(process.cwd(), ".tmp"),
    path = resolve(env.BUFFALO_INTEGRITY_ISOLATED_CONFIG);
  if (!path.startsWith(root + sep))
    throw new IntegrityError("ISOLATED_CONFIG_OUTSIDE_TASK");
  const value = JSON.parse(readFileSync(path, "utf8")) as IsolatedConfig;
  if (
    env.NODE_ENV === "production" &&
    (!value.releaseId ||
      env.BUFFALO_INTEGRITY_REHEARSAL_ID !== value.releaseId ||
      env.VERCEL_ENV)
  )
    throw new IntegrityError("ISOLATED_PRODUCTION_REHEARSAL_REQUIRED");
  if (
    new URL(value.databaseUrl).hostname !== "127.0.0.1" ||
    !new URL(value.databaseUrl).pathname.includes("integrity")
  )
    throw new IntegrityError("LOOPBACK_DATABASE_ONLY");
  assertLoopbackUrl(value.rpcUrl);
  if (
    value.storageUrl &&
    (new URL(value.storageUrl).hostname !== "127.0.0.1" ||
      !value.storageJwt ||
      value.storageBucket !== "slipstorage")
  )
    throw new IntegrityError("LOOPBACK_STORAGE_ONLY");
  return { path, value };
}
export function runtimeConfig(
  env: Partial<NodeJS.ProcessEnv> = process.env,
): RuntimeConfig {
  if (writeMode(env) === "off")
    throw new IntegrityError("INTEGRITY_FEATURE_DISABLED");
  if (env.BUFFALO_INTEGRITY_ISOLATED_CONFIG) {
    const { path, value } = isolatedConfig(env);
    return {
      kind: "isolated",
      key: path + ":" + digest(JSON.stringify(value)),
      value,
    };
  }
  if (writeMode(env) === "off")
    throw new IntegrityError("INTEGRITY_FEATURE_DISABLED");
  if (
    env.NODE_ENV !== "production" ||
    (env.VERCEL_ENV !== undefined && env.VERCEL_ENV !== "production")
  )
    throw new IntegrityError("PRODUCTION_ACTIVATION_FORBIDDEN");
  let decoded: unknown;
  try {
    decoded = JSON.parse(env.BUFFALO_INTEGRITY_SERVER_CONFIG ?? "");
  } catch {
    throw new IntegrityError("INTEGRITY_SERVER_CONFIG_REQUIRED");
  }
  const p = live.safeParse({
    ...(decoded as object),
    databaseUrl: env.DATABASE_URL,
    privateKey: env.BUFFALO_INTEGRITY_SIGNER_KEY,
    storageJwt: env.BUFFALO_INTEGRITY_STORAGE_JWT,
  });
  if (!p.success) throw new IntegrityError("INVALID_INTEGRITY_SERVER_CONFIG");
  const value = p.data;
  if (env.BUFFALO_INTEGRITY_RELEASE_ID !== value.releaseId)
    throw new IntegrityError("RELEASE_ATTESTATION_REQUIRED");
  if (
    BigInt(value.maxFeeWei) <= 0n ||
    BigInt(value.maxFeeWei) > 50000000000000000n
  )
    throw new IntegrityError("GAS_BUDGET_EXCEEDED");
  for (const url of [value.rpcUrl, value.storageUrl])
    if (
      new URL(url).protocol !== "https:" ||
      new URL(url).username ||
      new URL(url).password
    )
      throw new IntegrityError("PRODUCTION_HTTPS_REQUIRED");
  if (
    !["postgres:", "postgresql:"].includes(new URL(value.databaseUrl).protocol)
  )
    throw new IntegrityError("POSTGRES_REQUIRED");
  if (
    privateKeyToAccount(value.privateKey as Hex).address.toLowerCase() !==
    value.sender.toLowerCase()
  )
    throw new IntegrityError("UNAPPROVED_SIGNER");
  const role = storageRole(value.storageJwt);
  if (
    role.role !== "buffalo_integrity_writer" ||
    !role.exp ||
    role.exp * 1000 <= Date.now()
  )
    throw new IntegrityError("SCOPED_STORAGE_TOKEN_REQUIRED");
  if (
    new URL(value.storageUrl).href.replace(/\/$/, "") !==
    new URL(env.NEXT_PUBLIC_supabase_url ?? "invalid:").href.replace(/\/$/, "")
  )
    throw new IntegrityError("STORAGE_PUBLIC_HOST_MISMATCH");
  if (!env.NEXT_PUBLIC_supabase_key)
    throw new IntegrityError("STORAGE_PUBLIC_API_KEY_REQUIRED");
  for (const contract of [nft, manager])
    if (!value.codeHashes[contract.toLowerCase()])
      throw new IntegrityError("PINNED_CODE_HASH_REQUIRED");
  return { kind: "production", key: digest(JSON.stringify(value)), value };
}
export function integrityEnabled() {
  return writeMode() !== "off";
}
export function assertNewOperationAllowed() {
  if (writeMode() !== "enabled")
    throw new IntegrityError("INTEGRITY_WRITES_PAUSED");
}
