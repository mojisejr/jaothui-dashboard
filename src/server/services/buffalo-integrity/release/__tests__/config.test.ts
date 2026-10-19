/** @jest-environment node */
import jwt from "jsonwebtoken";
import { writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { randomUUID } from "crypto";
import { address as nft } from "~/server/blockchain/nft/abi";
import { address as manager } from "~/server/blockchain/metadata-maneger/abi";
import { account, testKey } from "../../operations/testing-fixtures";
import { runtimeConfig, writeMode, isolatedConfig } from "../config";
const hash = `0x${"11".repeat(32)}`;
const token = (role = "buffalo_integrity_writer", expired = false) =>
  jwt.sign({ role }, "synthetic-config-only", {
    expiresIn: expired ? -10 : 600,
  });
function environment(overrides: Record<string, unknown> = {}) {
  const config = {
    kind: "production",
    releaseId: "release-unit-1",
    rpcUrl: "https://rpc.example.test",
    sender: account.address,
    receiver: account.address,
    domain: { chainId: 96, nft, manager },
    codeHashes: { [nft.toLowerCase()]: hash, [manager.toLowerCase()]: hash },
    checkpoint: { number: "36250689", hash },
    storageUrl: "https://core.example.test",
    storageBucket: "slipstorage",
    ...overrides,
  };
  return {
    NODE_ENV: "production",
    VERCEL_ENV: "production",
    DATABASE_URL: "postgresql://server:synthetic@db.example.test/jaothui",
    BUFFALO_INTEGRITY_MODE: "enabled",
    BUFFALO_INTEGRITY_RELEASE_ID: "release-unit-1",
    BUFFALO_INTEGRITY_SERVER_CONFIG: JSON.stringify(config),
    BUFFALO_INTEGRITY_SIGNER_KEY: testKey,
    BUFFALO_INTEGRITY_STORAGE_JWT: token(),
    NEXT_PUBLIC_supabase_url: "https://core.example.test",
    NEXT_PUBLIC_supabase_key: "public-api-key",
  } as NodeJS.ProcessEnv;
}
test("default off never loads inherited minter or anonymous browser key as a server authority", () => {
  expect(writeMode({})).toBe("off");
  expect(() =>
    runtimeConfig({ minter: testKey, NODE_ENV: "production" }),
  ).toThrow("INTEGRITY_FEATURE_DISABLED");
});
test("qualified explicit production config is stable across drain and enabled", () => {
  const env = environment(),
    first = runtimeConfig(env);
  expect(first.kind).toBe("production");
  env.BUFFALO_INTEGRITY_MODE = "drain";
  expect(runtimeConfig(env).key).toBe(first.key);
});
test.each(["preview", "development"])(
  "inherited Vercel %s environment cannot activate the production signer",
  (v) => {
    expect(() => runtimeConfig({ ...environment(), VERCEL_ENV: v })).toThrow(
      "PRODUCTION_ACTIVATION_FORBIDDEN",
    );
  },
);
test("development cannot construct production ports", () =>
  expect(() =>
    runtimeConfig({ ...environment(), NODE_ENV: "development" }),
  ).toThrow("PRODUCTION_ACTIVATION_FORBIDDEN"));
test.each([
  [{ confirmations: 2 }, "INVALID_INTEGRITY_SERVER_CONFIG"],
  [
    { domain: { chainId: 97, nft, manager } },
    "INVALID_INTEGRITY_SERVER_CONFIG",
  ],
  [{ rpcUrl: "http://rpc.example.test" }, "PRODUCTION_HTTPS_REQUIRED"],
  [
    { storageUrl: "https://wrong.example.test" },
    "STORAGE_PUBLIC_HOST_MISMATCH",
  ],
  [{ codeHashes: {} }, "PINNED_CODE_HASH_REQUIRED"],
  [{ maxFeeWei: "50000000000000001" }, "GAS_BUDGET_EXCEEDED"],
  [{ sender: `0x${"22".repeat(20)}` }, "UNAPPROVED_SIGNER"],
] as const)("unsafe configuration is rejected: %j", (patch, reason) =>
  expect(() => runtimeConfig(environment(patch))).toThrow(reason),
);
test.each([
  token("service_role"),
  token("anon"),
  token("buffalo_integrity_writer", true),
])("broad or expired storage credential cannot activate", (credential) =>
  expect(() =>
    runtimeConfig({
      ...environment(),
      BUFFALO_INTEGRITY_STORAGE_JWT: credential,
    }),
  ).toThrow("SCOPED_STORAGE_TOKEN_REQUIRED"),
);
test("release attestation and public API key are mandatory", () => {
  expect(() =>
    runtimeConfig({
      ...environment(),
      BUFFALO_INTEGRITY_RELEASE_ID: "other-release",
    }),
  ).toThrow("RELEASE_ATTESTATION_REQUIRED");
  expect(() =>
    runtimeConfig({ ...environment(), NEXT_PUBLIC_supabase_key: undefined }),
  ).toThrow("STORAGE_PUBLIC_API_KEY_REQUIRED");
});
test("isolated config defaults enabled only locally; an explicit off or drain is never bypassed", () => {
  expect(
    writeMode({ BUFFALO_INTEGRITY_ISOLATED_CONFIG: "private-task-file" }),
  ).toBe("enabled");
  expect(
    writeMode({
      BUFFALO_INTEGRITY_ISOLATED_CONFIG: "private-task-file",
      BUFFALO_INTEGRITY_MODE: "drain",
    }),
  ).toBe("drain");
  expect(() =>
    runtimeConfig({
      BUFFALO_INTEGRITY_ISOLATED_CONFIG: "private-task-file",
      BUFFALO_INTEGRITY_MODE: "off",
    }),
  ).toThrow("INTEGRITY_FEATURE_DISABLED");
});

test.each([
  null,
  {},
  { role: "buffalo_integrity_writer" },
  { role: "buffalo_integrity_writer", exp: "never" },
  { role: "buffalo_integrity_writer", exp: Number.POSITIVE_INFINITY },
  { role: "buffalo_integrity_writer", exp: -1 },
])(
  "malformed decoded JWT claims are a clean configuration rejection: %j",
  (payload) => {
    const credential =
      "header." +
      Buffer.from(JSON.stringify(payload)).toString("base64url") +
      ".synthetic-signature";
    expect(() =>
      runtimeConfig({
        ...environment(),
        BUFFALO_INTEGRITY_STORAGE_JWT: credential,
      }),
    ).toThrow("SCOPED_STORAGE_TOKEN_REQUIRED");
  },
);

test("read-only rehearsal attestation remains valid with writes off/drain, but never allows a Vercel or unapproved target", () => {
  const path = resolve(".tmp/phase5", `config-read-${randomUUID()}.json`);
  mkdirSync(resolve(".tmp/phase5"), { recursive: true });
  const config = {
    releaseId: "read-rehearsal-1",
    databaseUrl: "postgresql://synthetic@127.0.0.1:15445/integrity_read",
    rpcUrl: "http://127.0.0.1:18559",
    storageDirectory: "unused",
    storageOrigin: "http://127.0.0.1:18561",
  };
  writeFileSync(path, JSON.stringify(config));
  const env = {
    NODE_ENV: "production",
    BUFFALO_INTEGRITY_ISOLATED_CONFIG: path,
    BUFFALO_INTEGRITY_REHEARSAL_ID: config.releaseId,
  } as NodeJS.ProcessEnv;
  for (const mode of ["off", "drain"])
    expect(
      isolatedConfig({ ...env, BUFFALO_INTEGRITY_MODE: mode }).value.rpcUrl,
    ).toBe(config.rpcUrl);
  expect(() => isolatedConfig({ ...env, VERCEL_ENV: "preview" })).toThrow(
    "ISOLATED_PRODUCTION_REHEARSAL_REQUIRED",
  );
  expect(() =>
    isolatedConfig({ ...env, BUFFALO_INTEGRITY_REHEARSAL_ID: "wrong" }),
  ).toThrow("ISOLATED_PRODUCTION_REHEARSAL_REQUIRED");
  writeFileSync(
    path,
    JSON.stringify({ ...config, rpcUrl: "https://rpc.bitkubchain.io" }),
  );
  expect(() => isolatedConfig(env)).toThrow("LOOPBACK");
});
