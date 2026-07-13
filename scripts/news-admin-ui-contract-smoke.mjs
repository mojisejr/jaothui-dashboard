import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const dashboardSource = fs.readFileSync(
  path.join(root, "src/pages/dashboard/index..tsx"),
  "utf8"
);
const pagePath = path.join(root, "src/pages/dashboard/news-events/index.tsx");
const pageSource = fs.readFileSync(pagePath, "utf8");
const trpcRouteSource = fs.readFileSync(
  path.join(root, "src/pages/api/trpc/[trpc].ts"),
  "utf8"
);

assert.match(
  dashboardSource,
  /href="\/dashboard\/news-events"/,
  "dashboard must link to the news/events admin route"
);
assert.match(
  dashboardSource,
  /จัดการข่าวสาร/,
  "dashboard card title must be present"
);

for (const procedure of [
  "list",
  "create",
  "update",
  "publish",
  "archive",
  "uploadCover",
]) {
  assert.match(
    pageSource,
    new RegExp(`api\\.newsEvents\\.${procedure}\\.use`),
    `news/events page must use newsEvents.${procedure}`
  );
}

for (const control of [
  "type=\"datetime-local\"",
  "type=\"file\"",
  "type=\"checkbox\"",
  "aspect-video",
  "Featured",
  "Publish",
  "Archive",
]) {
  assert.match(pageSource, new RegExp(control), `missing UI control: ${control}`);
}

assert.match(
  pageSource,
  /MAX_COVER_UPLOAD_BYTES\s*=\s*4\s*\*\s*1024\s*\*\s*1024/,
  "news/events page must guard cover uploads at 4MB before base64 conversion"
);
assert.match(
  trpcRouteSource,
  /sizeLimit:\s*"8mb"/,
  "tRPC route must allow base64 cover uploads above Next.js default 1MB body limit"
);

assert.doesNotMatch(
  pageSource,
  /JAOTHUI_NEWS_ADMIN_API_KEY|NEXT_PUBLIC_JAOTHUI_NEWS_ADMIN_API_KEY/,
  "news/events page must not reference bridge secrets"
);
assert.doesNotMatch(
  pageSource,
  /@sanity\/client|next-sanity|SANITY_PROJECT_ID/,
  "news/events page must not connect to Sanity directly"
);

console.log("news admin dashboard UI contract smoke passed");
