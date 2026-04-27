import { MiniAppDiagnosticsService } from "../../src/application/mini-app-diagnostics-service.js";
import { handleMiniAppRoute, jsonResponse, readJsonBody } from "../../src/application/mini-app-api-context.js";

export default {
  async fetch(request) {
    return handleMiniAppRoute(request, ["GET", "POST"], async ({ syncClient, bootstrap }) => {
      const service = new MiniAppDiagnosticsService({ syncClient });

      if (request.method === "GET") {
        const onboarding = await service.getOnboarding({ bootstrap });
        return jsonResponse({ ok: true, ...onboarding });
      }

      const payload = await readJsonBody(request);
      const onboarding = await service.saveOnboarding({ bootstrap, payload });
      return jsonResponse({ ok: true, ...onboarding });
    });
  }
};
