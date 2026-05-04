import { MiniAppAnalyticsService } from "../../src/application/mini-app-analytics-service.js";
import { handleMiniAppRoute, jsonResponse, readJsonBody } from "../../src/application/mini-app-api-context.js";
import { MiniAppDiagnosticsService } from "../../src/application/mini-app-diagnostics-service.js";
import { TelegramApiClient } from "../../src/infrastructure/telegram/telegram-api.js";

function miniAppPath(request) {
  const url = new URL(request.url);
  const directPath = url.pathname
    .replace(/^\/api\/mini-app\/?/, "")
    .replace(/\/$/, "");

  if (directPath === "rpc") {
    return (url.searchParams.get("path") || "").replace(/^\/+/, "").replace(/\/+$/, "");
  }

  return directPath;
}

function readPathParam(value) {
  try {
    return decodeURIComponent(value || "");
  } catch {
    return value || "";
  }
}

function createService(syncClient) {
  return new MiniAppDiagnosticsService({ syncClient });
}

function routeNotFound(path) {
  return jsonResponse(
    {
      ok: false,
      error: `Mini App API route not found: ${path || "/"}`
    },
    { status: 404 }
  );
}

function requireAlphaMode(config, message) {
  if (config.miniAppAlphaMode) {
    return null;
  }

  return jsonResponse(
    {
      ok: false,
      error: message
    },
    { status: 403 }
  );
}

async function dispatchMiniAppRoute(request) {
  const path = miniAppPath(request);

  if (path === "bootstrap") {
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

  if (path === "onboarding") {
    return handleMiniAppRoute(request, ["GET", "POST"], async ({ syncClient, bootstrap }) => {
      const service = createService(syncClient);

      if (request.method === "GET") {
        const onboarding = await service.getOnboarding({ bootstrap });
        return jsonResponse({ ok: true, ...onboarding });
      }

      const payload = await readJsonBody(request);
      const onboarding = await service.saveOnboarding({ bootstrap, payload });
      return jsonResponse({ ok: true, ...onboarding });
    });
  }

  if (path === "diagnostics/express") {
    return handleMiniAppRoute(request, ["GET"], async ({ syncClient, bootstrap }) => {
      const service = createService(syncClient);
      const diagnostics = await service.getExpressDiagnostics({ bootstrap });
      return jsonResponse({ ok: true, ...diagnostics });
    });
  }

  if (path === "diagnostics/express/answer") {
    return handleMiniAppRoute(request, ["POST"], async ({ syncClient, bootstrap }) => {
      const service = createService(syncClient);
      const payload = await readJsonBody(request);
      const result = await service.saveExpressAnswer({ bootstrap, payload });
      return jsonResponse({ ok: true, ...result });
    });
  }

  if (path === "diagnostics/prefill") {
    return handleMiniAppRoute(request, ["GET", "POST"], async ({ syncClient, bootstrap }) => {
      const service = createService(syncClient);

      if (request.method === "GET") {
        const prefill = await service.getDiagnosticPrefill({ bootstrap });
        return jsonResponse({ ok: true, ...prefill });
      }

      const payload = await readJsonBody(request);
      const result = await service.applyPrefillAction({ bootstrap, payload });
      return jsonResponse({ ok: true, ...result });
    });
  }

  if (path === "maturity") {
    return handleMiniAppRoute(request, ["GET"], async ({ syncClient, bootstrap }) => {
      const service = createService(syncClient);
      const maturity = await service.getMaturity({ bootstrap });
      return jsonResponse({ ok: true, ...maturity });
    });
  }

  if (path === "constraint/reason") {
    return handleMiniAppRoute(request, ["GET", "POST"], async ({ syncClient, bootstrap }) => {
      const service = createService(syncClient);

      if (request.method === "GET") {
        const result = await service.reasonConstraint({ bootstrap });
        return jsonResponse({ ok: true, ...result });
      }

      const payload = await readJsonBody(request);
      const result = await service.applyConstraintAction({ bootstrap, payload });
      return jsonResponse({ ok: true, ...result });
    });
  }

  if (path === "constraint/rejection-chat") {
    return handleMiniAppRoute(request, ["POST"], async ({ config, syncClient, bootstrap, telegramUser }) => {
      const service = createService(syncClient);
      const payload = await readJsonBody(request);
      const result = await service.requestConstraintRejectionChat({ bootstrap, payload });

      if (config.telegramToken && telegramUser?.id) {
        const telegramApi = new TelegramApiClient({
          token: config.telegramToken,
          apiBaseUrl: config.telegramApiBaseUrl
        });
        await telegramApi.sendMessage(telegramUser.id, result.chatHandoff.chatMessage);
      }

      return jsonResponse({ ok: true, ...result });
    });
  }

  if (path === "next-step") {
    return handleMiniAppRoute(request, ["GET", "POST"], async ({ syncClient, bootstrap }) => {
      const service = createService(syncClient);

      if (request.method === "GET") {
        const result = await service.getOrCreateNextStep({ bootstrap });
        return jsonResponse({ ok: true, ...result });
      }

      const payload = await readJsonBody(request);
      const result = await service.updateNextStepStatus({ bootstrap, payload });
      return jsonResponse({ ok: true, ...result });
    });
  }

  if (path === "ceo") {
    return handleMiniAppRoute(request, ["GET"], async ({ syncClient, bootstrap }) => {
      const service = createService(syncClient);
      const result = await service.getCeoOperatingBrief({ bootstrap });
      return jsonResponse({ ok: true, ...result });
    });
  }

  if (path === "assembly") {
    return handleMiniAppRoute(request, ["GET"], async ({ syncClient, bootstrap }) => {
      const service = createService(syncClient);
      const result = await service.getBusinessAssemblyPlan({ bootstrap });
      return jsonResponse({ ok: true, ...result });
    });
  }

  if (path === "assembly/draft") {
    return handleMiniAppRoute(request, ["POST"], async ({ syncClient, bootstrap }) => {
      const service = createService(syncClient);
      const payload = await readJsonBody(request);
      const result = await service.createBusinessAssemblyDraft({ bootstrap, payload });
      return jsonResponse({ ok: true, ...result });
    });
  }

  if (path === "tools") {
    return handleMiniAppRoute(request, ["GET"], async ({ syncClient, bootstrap }) => {
      const service = createService(syncClient);
      const result = await service.getTools({ bootstrap });
      return jsonResponse({ ok: true, ...result });
    });
  }

  if (path === "tools/recommended") {
    return handleMiniAppRoute(request, ["GET"], async ({ syncClient, bootstrap }) => {
      const service = createService(syncClient);
      const result = await service.getRecommendedTools({ bootstrap });
      return jsonResponse({ ok: true, ...result });
    });
  }

  if (path === "tools/recalculate") {
    return handleMiniAppRoute(request, ["POST"], async ({ syncClient, bootstrap }) => {
      const service = createService(syncClient);
      const result = await service.getRecommendedTools({ bootstrap, recalculate: true });
      return jsonResponse({ ok: true, ...result });
    });
  }

  const toolOpenedMatch = path.match(/^tools\/([^/]+)\/opened$/);
  if (toolOpenedMatch) {
    return handleMiniAppRoute(request, ["POST"], async ({ syncClient, bootstrap }) => {
      const service = createService(syncClient);
      const result = await service.markToolOpened({
        bootstrap,
        toolId: readPathParam(toolOpenedMatch[1])
      });

      return jsonResponse({ ok: true, ...result });
    });
  }

  if (path === "documents") {
    return handleMiniAppRoute(request, ["GET", "POST"], async ({ syncClient, bootstrap }) => {
      const service = createService(syncClient);

      if (request.method === "GET") {
        const result = await service.getDocuments({ bootstrap });
        return jsonResponse({ ok: true, ...result });
      }

      const payload = await readJsonBody(request);
      const result = await service.saveDocumentLink({ bootstrap, payload });
      return jsonResponse({ ok: true, ...result });
    });
  }

  const documentAnalyzeMatch = path.match(/^documents\/([^/]+)\/analyze$/);
  if (documentAnalyzeMatch) {
    return handleMiniAppRoute(request, ["POST"], async ({ syncClient, bootstrap }) => {
      const payload = await readJsonBody(request);
      const service = createService(syncClient);
      const result = await service.analyzeDocument({
        bootstrap,
        documentId: readPathParam(documentAnalyzeMatch[1]),
        payload
      });

      return jsonResponse({ ok: true, ...result });
    });
  }

  if (path === "consultation/brief") {
    return handleMiniAppRoute(request, ["GET", "POST"], async ({ config, syncClient, bootstrap }) => {
      const service = createService(syncClient);
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

  if (path === "consultation/request") {
    return handleMiniAppRoute(request, ["POST"], async ({ config, syncClient, bootstrap }) => {
      const service = createService(syncClient);
      const result = await service.markConsultationRequest({
        bootstrap,
        bookingUrl: config.alexanderBookingUrl
      });

      return jsonResponse({ ok: true, ...result });
    });
  }

  if (path === "dev/constraint-override") {
    return handleMiniAppRoute(request, ["POST"], async ({ bootstrap, config, syncClient }) => {
      const alphaError = requireAlphaMode(
        config,
        "Manual constraint override is available only in alpha mode."
      );
      if (alphaError) {
        return alphaError;
      }

      const payload = await readJsonBody(request);
      const service = createService(syncClient);
      const result = await service.overrideConstraint({ bootstrap, payload });
      return jsonResponse({ ok: true, ...result });
    });
  }

  if (path === "dev/next-step-override") {
    return handleMiniAppRoute(request, ["POST"], async ({ bootstrap, config, syncClient }) => {
      const alphaError = requireAlphaMode(
        config,
        "Manual next step override is available only in alpha mode."
      );
      if (alphaError) {
        return alphaError;
      }

      const payload = await readJsonBody(request);
      const service = createService(syncClient);
      const result = await service.overrideNextStep({ bootstrap, payload });
      return jsonResponse({ ok: true, ...result });
    });
  }

  return routeNotFound(path);
}

export default {
  async fetch(request) {
    return dispatchMiniAppRoute(request);
  }
};
