import http from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

import adminApi from "../api/admin/[...path].js";
import bookStartApi from "../api/book/start.js";
import companiesApi from "../api/companies/[...path].js";
import miniAppApi from "../api/mini-app/[...path].js";
import platformApi from "../api/platform/[...path].js";
import siteNavigatorApi from "../api/site-navigator.js";
import telegramApi from "../api/telegram.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || 3000);

const apiHandlers = [
  { prefix: "/api/companies", handler: companiesApi },
  { prefix: "/api/mini-app", handler: miniAppApi },
  { prefix: "/api/platform", handler: platformApi },
  { prefix: "/api/admin", handler: adminApi }
];

const spaRoots = new Set(["/companies", "/book", "/admin", "/mini-app", "/app"]);

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
};

function json(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function redirect(res, location, status = 302) {
  res.writeHead(status, { location });
  res.end();
}

function createFetchRequest(req, targetUrl) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      value.forEach((item) => headers.append(key, item));
    } else if (value !== undefined) {
      headers.set(key, value);
    }
  }

  const init = {
    method: req.method,
    headers
  };

  if (!["GET", "HEAD"].includes(req.method || "GET")) {
    init.body = Readable.toWeb(req);
    init.duplex = "half";
  }

  return new Request(targetUrl, init);
}

async function sendFetchResponse(res, response, method = "GET") {
  res.statusCode = response.status;

  const setCookie = response.headers.getSetCookie?.();
  if (setCookie?.length) {
    res.setHeader("set-cookie", setCookie);
  }

  response.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "set-cookie") {
      res.setHeader(key, value);
    }
  });

  if (method === "HEAD" || !response.body) {
    res.end();
    return;
  }

  Readable.fromWeb(response.body).pipe(res);
}

function rewriteCatchAllUrl(url, prefix) {
  const rewritten = new URL(url.toString());
  const restPath = rewritten.pathname.slice(prefix.length).replace(/^\/+/, "");
  rewritten.pathname = `${prefix}/rpc`;
  if (restPath && !rewritten.searchParams.has("path")) {
    rewritten.searchParams.set("path", restPath);
  }
  return rewritten;
}

async function handleApi(req, res, url) {
  if (url.pathname === "/api/telegram") {
    const response = await telegramApi.fetch(createFetchRequest(req, url.toString()));
    await sendFetchResponse(res, response, req.method);
    return true;
  }

  if (url.pathname === "/api/book/start") {
    const response = await bookStartApi.fetch(createFetchRequest(req, url.toString()));
    await sendFetchResponse(res, response, req.method);
    return true;
  }

  if (url.pathname === "/api/site-navigator") {
    const response = await siteNavigatorApi.fetch(createFetchRequest(req, url.toString()));
    await sendFetchResponse(res, response, req.method);
    return true;
  }

  const route = apiHandlers.find(({ prefix }) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`));
  if (!route) {
    return false;
  }

  const targetUrl = rewriteCatchAllUrl(url, route.prefix);
  const response = await route.handler.fetch(createFetchRequest(req, targetUrl.toString()));
  await sendFetchResponse(res, response, req.method);
  return true;
}

function safePathname(pathname) {
  try {
    const decoded = decodeURIComponent(pathname);
    const cleaned = path.normalize(decoded).replace(/^(\.\.[/\\])+/, "").replace(/^[/\\]+/, "");
    const filePath = path.join(rootDir, cleaned);
    if (!filePath.startsWith(`${rootDir}${path.sep}`) && filePath !== rootDir) {
      return null;
    }
    return filePath;
  } catch {
    return null;
  }
}

async function existingFile(filePath) {
  if (!filePath) {
    return null;
  }

  try {
    const fileStat = await stat(filePath);
    return fileStat.isFile() ? filePath : null;
  } catch {
    return null;
  }
}

async function staticFileFor(pathname) {
  const direct = await existingFile(safePathname(pathname));
  if (direct) {
    return direct;
  }

  const firstSegment = `/${pathname.split("/").filter(Boolean)[0] || ""}`;
  if (spaRoots.has(firstSegment)) {
    return existingFile(path.join(rootDir, firstSegment.slice(1), "index.html"));
  }

  return null;
}

async function handleStatic(req, res, url) {
  if (url.pathname === "/") {
    redirect(res, "/app");
    return true;
  }

  const filePath = await staticFileFor(url.pathname);
  if (!filePath) {
    return false;
  }

  const extension = path.extname(filePath).toLowerCase();
  res.writeHead(200, { "content-type": mimeTypes[extension] || "application/octet-stream" });
  if (req.method === "HEAD") {
    res.end();
    return true;
  }
  createReadStream(filePath).pipe(res);
  return true;
}

const server = http.createServer(async (req, res) => {
  try {
    const host = req.headers.host || `localhost:${port}`;
    const url = new URL(req.url || "/", `http://${host}`);

    if (url.pathname === "/healthz") {
      json(res, 200, { ok: true, service: "ai-boss", mode: "self-hosted" });
      return;
    }

    if (url.pathname.startsWith("/api/") && (await handleApi(req, res, url))) {
      return;
    }

    if (await handleStatic(req, res, url)) {
      return;
    }

    json(res, 404, { ok: false, error: "Not found" });
  } catch (error) {
    console.error("Self-hosted server error", error);
    json(res, 500, { ok: false, error: "Internal server error" });
  }
});

server.listen(port, () => {
  console.log(`AI-BOSS self-hosted server listening on http://0.0.0.0:${port}`);
});
