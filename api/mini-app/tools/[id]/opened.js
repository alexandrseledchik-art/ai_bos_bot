import { MiniAppDiagnosticsService } from "../../../../src/application/mini-app-diagnostics-service.js";
import { handleMiniAppRoute, jsonResponse } from "../../../../src/application/mini-app-api-context.js";

function readToolId(request) {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const openedIndex = parts.lastIndexOf("opened");
  return openedIndex > 0 ? parts[openedIndex - 1] : "";
}

export default {
  async fetch(request) {
    return handleMiniAppRoute(request, ["POST"], async ({ syncClient, bootstrap }) => {
      const service = new MiniAppDiagnosticsService({ syncClient });
      const result = await service.markToolOpened({
        bootstrap,
        toolId: readToolId(request)
      });

      return jsonResponse({ ok: true, ...result });
    });
  }
};
