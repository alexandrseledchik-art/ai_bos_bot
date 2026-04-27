import { handleMiniAppRoute, jsonResponse } from "../../src/application/mini-app-api-context.js";
import { MiniAppAnalyticsService } from "../../src/application/mini-app-analytics-service.js";

export default {
  async fetch(request) {
    return handleMiniAppRoute(request, ["GET"], async ({ bootstrap, config, syncClient }) => {
      const analytics = new MiniAppAnalyticsService({ syncClient });
      await analytics.logEvent({
        bootstrap,
        eventName: "mini_app_opened",
        metadata: {
          alphaMode: config.miniAppAlphaMode
        }
      });

      return jsonResponse({
        ok: true,
        alphaMode: config.miniAppAlphaMode,
        ...bootstrap
      });
    });
  }
};
