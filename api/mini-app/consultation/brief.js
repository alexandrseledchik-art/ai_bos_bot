import { MiniAppDiagnosticsService } from "../../../src/application/mini-app-diagnostics-service.js";
import { handleMiniAppRoute, jsonResponse } from "../../../src/application/mini-app-api-context.js";

export default {
  async fetch(request) {
    return handleMiniAppRoute(request, ["GET", "POST"], async ({ config, syncClient, bootstrap }) => {
      const service = new MiniAppDiagnosticsService({ syncClient });
      const result = request.method === "GET"
        ? await service.getOrBuildConsultationBrief({ bootstrap })
        : await service.buildConsultationBrief({ bootstrap, persist: true });

      return jsonResponse({
        ok: true,
        bookingUrlConfigured: Boolean(config.alexanderBookingUrl),
        ...result
      });
    });
  }
};
