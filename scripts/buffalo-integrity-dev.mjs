/** Isolated only. Reads synthetic fixtures without printing credentials. No production activation path. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import http from "node:http";
const root = resolve(".tmp/phase3");
const env = Object.fromEntries(
  readFileSync(resolve(root, "disposable.env"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).replace(/^['"]|['"]$/g, "")];
    }),
);
const signer = JSON.parse(
  readFileSync(resolve(root, "local-signer.json"), "utf8"),
);
const identity = JSON.parse(
  readFileSync(resolve(root, "fork-identity.json"), "utf8"),
);
const databaseUrl = env.BUFFALO_INTEGRITY_TEST_DATABASE_URL;
if (
  new URL(databaseUrl).hostname !== "127.0.0.1" ||
  new URL(signer.rpcUrl).hostname !== "127.0.0.1"
)
  throw Error("LOOPBACK_ONLY");
const authPath = resolve(root, "browser-auth.json");
let auth;
try {
  auth = JSON.parse(readFileSync(authPath, "utf8"));
} catch {
  auth = {
    username: "integrity-qa",
    password: randomBytes(16).toString("hex"),
    secret: randomBytes(32).toString("hex"),
  };
  writeFileSync(authPath, JSON.stringify(auth, null, 2), { mode: 0o600 });
}
const directory = resolve(root, "assets");
mkdirSync(directory, { recursive: true });
const configPath = resolve(root, "runtime.json");
const configuration = {
  databaseUrl,
  rpcUrl: signer.rpcUrl,
  privateKey: signer.privateKey,
  sender: signer.address,
  receiver: signer.address,
  domain: {
    chainId: identity.chainId,
    nft: identity.nft,
    manager: identity.manager,
  },
  instanceId: identity.instanceId,
  codeHashes: identity.codeHashes,
  storageDirectory: directory,
  storageOrigin: "http://127.0.0.1:18551",
  projectionFailures: Number(process.env.BF_ISOLATED_PROJECTION_FAILURES ?? 1),
};
writeFileSync(configPath, JSON.stringify(configuration, null, 2), {
  mode: 0o600,
});
const origin = http.createServer(async (req, res) => {
  try {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405).end();
      return;
    }
    const key = decodeURIComponent(
      new URL(req.url, "http://127.0.0.1").pathname,
    ).slice(1);
    if (
      !/^(operations\/[0-9a-f]{64}\/[0-9a-f-]{36}\/[a-zA-Z0-9._-]+|buffalo\/[1-9][0-9]*\.jpg|json\/[1-9][0-9]*\.json)$/.test(
        key,
      )
    ) {
      res.writeHead(404).end();
      return;
    }
    const bytes = readFileSync(resolve(directory, key));
    res.writeHead(200, {
      "Content-Type": key.endsWith(".jpg") ? "image/jpeg" : "application/json",
      "Content-Length": bytes.length,
      "Cache-Control": "no-store",
    });
    res.end(req.method === "HEAD" ? undefined : bytes);
  } catch {
    res.writeHead(404).end();
  }
});
origin.listen(18551, "127.0.0.1", () =>
  console.log("Isolated asset origin http://127.0.0.1:18551"),
);
const child = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "dev", "-H", "127.0.0.1", "-p", "3153"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: "development",
      DATABASE_URL: databaseUrl,
      minter: signer.privateKey.slice(2),
      ...auth,
      NEXT_PUBLIC_supabase_url: "http://127.0.0.1:18551",
      NEXT_PUBLIC_supabase_key: "synthetic-anon-not-production",
      BUFFALO_INTEGRITY_ISOLATED_CONFIG: configPath,
      SANITY_PROJECT_ID: "",
      SANITY_API_TOKEN: "",
      JAOTHUI_NEWS_ADMIN_API_KEY: "",
      JAOTHUI_NEWS_ADMIN_API_BASE_URL: "",
    },
  },
);
const close = () => {
  child.kill("SIGTERM");
  origin.close();
};
process.on("SIGINT", close);
process.on("SIGTERM", close);
child.on("exit", (code) => {
  origin.close();
  process.exitCode = code ?? 0;
});
