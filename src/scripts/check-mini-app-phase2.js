import assert from "node:assert/strict";
import fs from "node:fs";

import { MiniAppApiClient } from "../../mini-app-assets/src/api-client.js";
import { ROUTES, matchRoute } from "../../mini-app-assets/src/routes.js";

const requiredFiles = [
  "mini-app/index.html",
  "mini-app-assets/styles.css",
  "mini-app-assets/src/api-client.js",
  "mini-app-assets/src/main.js",
  "mini-app-assets/src/routes.js",
  "mini-app-assets/src/telegram.js",
  "api/mini-app/[...path].js"
];

const requiredRoutes = [
  "/mini-app",
  "/mini-app/onboarding",
  "/mini-app/diagnostics/express",
  "/mini-app/maturity",
  "/mini-app/constraint",
  "/mini-app/next-step",
  "/mini-app/tools",
  "/mini-app/documents",
  "/mini-app/consultation"
];

for (const filePath of requiredFiles) {
  assert.equal(fs.existsSync(filePath), true, `${filePath} should exist`);
}

for (const routePath of requiredRoutes) {
  assert.equal(
    ROUTES.some((route) => route.path === routePath),
    true,
    `${routePath} should be registered`
  );
}

assert.equal(matchRoute("/mini-app/tools/sample").params.slug, "sample");

const vercelConfig = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
assert.deepEqual(
  vercelConfig.rewrites?.map((rewrite) => rewrite.source),
  ["/mini-app", "/mini-app/:path*"]
);

const indexHtml = fs.readFileSync("mini-app/index.html", "utf8");
assert.match(indexHtml, /telegram-web-app\.js/);
assert.match(indexHtml, /mini-app-assets\/src\/main\.js/);

const mainJs = fs.readFileSync("mini-app-assets/src/main.js", "utf8");
assert.match(mainJs, /Спросить AI-BOSS/);
assert.match(mainJs, /openAiBossChat/);
assert.match(mainJs, /WebApp/);
assert.match(mainJs, /\.close\(\)/);
assert.match(mainJs, /isRootRoute/);
assert.match(mainJs, /nav-placeholder/);
assert.match(mainJs, /data-back/);
assert.match(mainJs, /data-navigate="\/mini-app"/);
assert.match(mainJs, /api\.bootstrap/);

let capturedInitData = "";
const client = new MiniAppApiClient({
  initData: "signed-init-data",
  fetchImpl: async (_path, options) => {
    capturedInitData = options.headers.get("x-telegram-init-data");
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        "content-type": "application/json"
      }
    });
  }
});

await client.bootstrap();
assert.equal(capturedInitData, "signed-init-data");

const originalFetch = globalThis.fetch;
let defaultFetchThis = null;
globalThis.fetch = function (_path, options) {
  defaultFetchThis = this;
  capturedInitData = options.headers.get("x-telegram-init-data");
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "content-type": "application/json"
    }
  });
};

try {
  const defaultFetchClient = new MiniAppApiClient({ initData: "default-fetch-init-data" });
  await defaultFetchClient.bootstrap();
  assert.equal(defaultFetchThis, globalThis);
  assert.equal(capturedInitData, "default-fetch-init-data");
} finally {
  globalThis.fetch = originalFetch;
}

const objectErrorClient = new MiniAppApiClient({
  fetchImpl: async () => new Response(JSON.stringify({ error: { code: "PGRST205", message: "Could not find table." } }), {
    status: 500,
    headers: {
      "content-type": "application/json"
    }
  })
});

await assert.rejects(
  () => objectErrorClient.bootstrap(),
  /Could not find table/
);

console.log("Mini App Phase 2 shell checks passed.");
