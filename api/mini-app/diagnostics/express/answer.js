import { MiniAppDiagnosticsService } from "../../../../src/application/mini-app-diagnostics-service.js";
import { handleMiniAppRoute, jsonResponse, readJsonBody } from "../../../../src/application/mini-app-api-context.js";

export default {
  async fetch(request) {
    return handleMiniAppRoute(request, ["POST"], async ({ syncClient, bootstrap }) => {
      const service = new MiniAppDiagnosticsService({ syncClient });
      const payload = await readJsonBody(request);
      const result = await service.saveExpressAnswer({ bootstrap, payload });

      return jsonResponse({
        ok: true,
        ...result
      });
    });
  }
};
