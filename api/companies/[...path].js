import { assertAdminRequest, readAdminJsonBody } from "../../src/application/admin-api-context.js";
import { ConsultantWebService } from "../../src/application/consultant-web-service.js";
import { loadConfig } from "../../src/config.js";
import { getServices } from "../../src/create-services.js";

function json(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store"
    },
    ...init
  });
}

function normalizeError(error) {
  if (error?.message) {
    return error.message;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error || "Companies API request failed.");
  }
}

function companiesPath(request) {
  const url = new URL(request.url);
  const directPath = url.pathname
    .replace(/^\/api\/companies\/?/, "")
    .replace(/\/$/, "");

  if (directPath === "rpc") {
    return (url.searchParams.get("path") || "").replace(/^\/+/, "").replace(/\/+$/, "");
  }

  return directPath;
}

function createService() {
  const { conversationService } = getServices();
  return new ConsultantWebService({ store: conversationService.store });
}

async function dispatch(request) {
  const config = loadConfig();
  assertAdminRequest(request, config);

  const path = companiesPath(request);
  const service = createService();

  if (!path || path === "index") {
    if (request.method === "GET") {
      return json({ ok: true, ...(await service.listCompanies()) });
    }

    if (request.method === "POST") {
      const payload = await readAdminJsonBody(request);
      return json({ ok: true, ...(await service.createCompany(payload)) });
    }
  }

  const companyMatch = path.match(/^([^/]+)$/);
  if (companyMatch) {
    const companyId = decodeURIComponent(companyMatch[1]);

    if (request.method === "GET") {
      return json({ ok: true, ...(await service.getCompany(companyId)) });
    }

    if (request.method === "PATCH") {
      const payload = await readAdminJsonBody(request);
      return json({ ok: true, ...(await service.updateCompany(companyId, payload)) });
    }
  }

  const sourceMatch = path.match(/^([^/]+)\/sources$/);
  if (sourceMatch && request.method === "POST") {
    const payload = await readAdminJsonBody(request);
    return json({ ok: true, ...(await service.addSource(decodeURIComponent(sourceMatch[1]), payload)) });
  }

  const analyzeMatch = path.match(/^([^/]+)\/analyze$/);
  if (analyzeMatch && request.method === "POST") {
    return json({ ok: true, ...(await service.analyzeCompany(decodeURIComponent(analyzeMatch[1]))) });
  }

  return json({ ok: false, error: `Companies API route not found: ${path || "/"}` }, { status: 404 });
}

export default {
  async fetch(request) {
    try {
      return await dispatch(request);
    } catch (error) {
      return json(
        {
          ok: false,
          error: normalizeError(error)
        },
        { status: error.status || 500 }
      );
    }
  }
};
