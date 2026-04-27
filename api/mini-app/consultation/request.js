import { MiniAppDiagnosticsService } from "../../../src/application/mini-app-diagnostics-service.js";
import { handleMiniAppRoute, jsonResponse } from "../../../src/application/mini-app-api-context.js";

export default {
  async fetch(request) {
    return handleMiniAppRoute(request, ["POST"], async ({ config, syncClient, bootstrap }) => {
      const service = new MiniAppDiagnosticsService({ syncClient });
      const result = await service.markConsultationRequest({
        bootstrap,
        bookingUrl: config.alexanderBookingUrl
      });

      return jsonResponse({ ok: true, ...result });
    });
  }
};
