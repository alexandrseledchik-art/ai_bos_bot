import { MiniAppDiagnosticsService } from "../../../src/application/mini-app-diagnostics-service.js";
import { handleMiniAppRoute, jsonResponse } from "../../../src/application/mini-app-api-context.js";

export default {
  async fetch(request) {
    return handleMiniAppRoute(request, ["GET"], async ({ syncClient, bootstrap }) => {
      const service = new MiniAppDiagnosticsService({ syncClient });
      const result = await service.getRecommendedTools({ bootstrap });

      return jsonResponse({ ok: true, ...result });
    });
  }
};
