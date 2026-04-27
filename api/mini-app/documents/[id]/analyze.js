import { MiniAppDiagnosticsService } from "../../../../src/application/mini-app-diagnostics-service.js";
import { handleMiniAppRoute, jsonResponse, readJsonBody } from "../../../../src/application/mini-app-api-context.js";

function readDocumentId(request) {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const analyzeIndex = parts.lastIndexOf("analyze");
  return analyzeIndex > 0 ? parts[analyzeIndex - 1] : "";
}

export default {
  async fetch(request) {
    return handleMiniAppRoute(request, ["POST"], async ({ syncClient, bootstrap }) => {
      const payload = await readJsonBody(request);
      const service = new MiniAppDiagnosticsService({ syncClient });
      const result = await service.analyzeDocument({
        bootstrap,
        documentId: readDocumentId(request),
        payload
      });

      return jsonResponse({ ok: true, ...result });
    });
  }
};
