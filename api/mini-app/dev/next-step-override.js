import { handleMiniAppRoute, jsonResponse, readJsonBody } from "../../../src/application/mini-app-api-context.js";
import { MiniAppDiagnosticsService } from "../../../src/application/mini-app-diagnostics-service.js";

export default {
  async fetch(request) {
    return handleMiniAppRoute(request, ["POST"], async ({ bootstrap, config, syncClient }) => {
      if (!config.miniAppAlphaMode) {
        return jsonResponse(
          {
            ok: false,
            error: "Manual next step override is available only in alpha mode."
          },
          { status: 403 }
        );
      }

      const payload = await readJsonBody(request);
      const service = new MiniAppDiagnosticsService({ syncClient });
      const result = await service.overrideNextStep({ bootstrap, payload });

      return jsonResponse({
        ok: true,
        ...result
      });
    });
  }
};
