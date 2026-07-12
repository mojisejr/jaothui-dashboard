import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const envSource = fs.readFileSync(path.join(root, "src/env.js"), "utf8");
const envExample = fs.readFileSync(path.join(root, ".env.example"), "utf8");
const routerRootSource = fs.readFileSync(
  path.join(root, "src/server/api/root.ts"),
  "utf8"
);
const newsEventsRouterSource = fs.existsSync(
  path.join(root, "src/server/api/routers/r-news-events.ts")
)
  ? fs.readFileSync(
      path.join(root, "src/server/api/routers/r-news-events.ts"),
      "utf8"
    )
  : "";
const newsAdminClientSource = fs.existsSync(
  path.join(root, "src/server/services/news-admin-api-client.ts")
)
  ? fs.readFileSync(
      path.join(root, "src/server/services/news-admin-api-client.ts"),
      "utf8"
    )
  : "";

for (const key of [
  "JAOTHUI_NEWS_ADMIN_API_BASE_URL",
  "JAOTHUI_NEWS_ADMIN_API_KEY",
]) {
  assert.match(envSource, new RegExp(`${key}: z\\.string\\(\\)`), `${key} must be in server schema`);
  assert.match(envSource, new RegExp(`process\\.env\\.${key}`), `${key} must be in runtimeEnv`);
  assert.match(envExample, new RegExp(`^${key}=`, "m"), `${key} must be documented in .env.example`);
}

assert.doesNotMatch(
  envSource,
  /NEXT_PUBLIC_JAOTHUI_NEWS_ADMIN_API_KEY/,
  "news admin API key must not be public"
);

if (newsEventsRouterSource) {
  assert.match(
    routerRootSource,
    /newsEvents:\s*newsEventsRouter/,
    "newsEvents router must be registered in appRouter"
  );
  assert.doesNotMatch(
    newsEventsRouterSource,
    /publicProcedure/,
    "newsEvents router must not expose public procedures"
  );
  assert.match(
    newsEventsRouterSource,
    /protectProcedure/,
    "newsEvents router must use protected procedures"
  );
}

if (newsAdminClientSource) {
  assert.match(
    newsAdminClientSource,
    /Authorization/,
    "news admin client must attach Authorization header server-side"
  );
  assert.match(
    newsAdminClientSource,
    /JAOTHUI_NEWS_ADMIN_API_KEY/,
    "news admin client must read the server bridge key"
  );
  assert.doesNotMatch(
    newsAdminClientSource,
    /NEXT_PUBLIC_JAOTHUI_NEWS_ADMIN_API_KEY/,
    "news admin client must not use a public bridge key"
  );
}

console.log("news admin dashboard env contract smoke passed");
