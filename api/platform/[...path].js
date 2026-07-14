import { AccessControlService } from "../../src/application/access-control-service.js";
import { handlePlatformRoute, platformJson } from "../../src/application/platform-api-context.js";
import { MiniAppBootstrapService } from "../../src/application/mini-app-bootstrap-service.js";
import { MiniAppDiagnosticsService } from "../../src/application/mini-app-diagnostics-service.js";
import { ToolWorkflowService } from "../../src/application/tool-workflow-service.js";
import { loadConfig } from "../../src/config.js";
import { GoogleDriveClient } from "../../src/infrastructure/google/google-drive-client.js";
import {
  clearWebSessionCookie,
  createWebSessionToken,
  serializeWebSessionCookie,
  verifyWebLoginToken
} from "../../src/infrastructure/auth/web-session.js";
import { MiniAppCompatSyncClient } from "../../src/infrastructure/storage/mini-app-compat-sync.js";

function platformPath(request) {
  const url = new URL(request.url);
  const directPath = url.pathname.replace(/^\/api\/platform\/?/, "").replace(/\/$/, "");
  return directPath === "rpc"
    ? (url.searchParams.get("path") || "").replace(/^\/+|\/+$/g, "")
    : directPath;
}

function redirect(location, headers = {}) {
  return new Response(null, {
    status: 302,
    headers: { location, ...headers }
  });
}

async function readJsonBody(request) {
  const text = await request.text();
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    const error = new Error("Некорректный JSON в запросе.");
    error.status = 400;
    throw error;
  }
}

function createWorkspaceService(syncClient) {
  return new MiniAppDiagnosticsService({ syncClient });
}

function createToolWorkflowService(syncClient, config) {
  return new ToolWorkflowService({
    syncClient,
    googleDrive: new GoogleDriveClient({
      serviceAccountEmail: config.googleDriveServiceAccountEmail,
      privateKey: config.googleDrivePrivateKey,
      rootFolderId: config.googleDriveFolderId,
      maxTextChars: config.googleDriveMaxTextChars
    })
  });
}

async function exchangeLoginToken(request) {
  const config = loadConfig();
  if (!config.webSessionSecret) {
    return redirect("/app?auth=unavailable");
  }

  try {
    const token = new URL(request.url).searchParams.get("token") || "";
    const login = verifyWebLoginToken(token, { secret: config.webSessionSecret });
    const syncClient = new MiniAppCompatSyncClient({
      url: config.supabaseUrl,
      serviceRoleKey: config.supabaseServiceRoleKey
    });
    const accessControl = new AccessControlService({
      syncClient: config.accessControlEnabled ? syncClient : null,
      mode: config.accessControlMode,
      adminTelegramUserIds: config.adminTelegramUserIds
    });
    const accessDecision = await accessControl.checkTelegramAccess({ telegramUser: login.user });
    if (!accessDecision.allowed) {
      return redirect(`/app?auth=${accessDecision.status || "denied"}`);
    }

    await new MiniAppBootstrapService({ syncClient }).bootstrap({ telegramUser: login.user });
    const sessionToken = createWebSessionToken({
      telegramUser: login.user,
      secret: config.webSessionSecret,
      ttlSeconds: config.webSessionTtlSeconds
    });

    return redirect("/app", {
      "set-cookie": serializeWebSessionCookie(sessionToken, {
        maxAgeSeconds: config.webSessionTtlSeconds
      }),
      "cache-control": "no-store"
    });
  } catch {
    return redirect("/app?auth=invalid");
  }
}

async function dispatch(request) {
  const path = platformPath(request);

  if (path === "auth/exchange" && request.method === "GET") {
    return exchangeLoginToken(request);
  }

  if (path === "auth/logout" && request.method === "POST") {
    return platformJson({ ok: true }, {
      headers: { "set-cookie": clearWebSessionCookie() }
    });
  }

  if (path === "bootstrap") {
    return handlePlatformRoute(request, ["GET"], async ({ bootstrap, config }) => platformJson({
      ok: true,
      alphaMode: config.miniAppAlphaMode,
      ...bootstrap
    }));
  }

  if (path === "workspace") {
    return handlePlatformRoute(request, ["GET"], async ({ bootstrap, syncClient, config }) => {
      const service = createWorkspaceService(syncClient);
      const toolWorkflow = createToolWorkflowService(syncClient, config);
      // Resolve the diagnostic run once before assembly reads the same run.
      const diagnostics = await service.getExpressDiagnostics({ bootstrap });
      const [assemblyResult, toolsResult, documentsResult, constraintRow, nextStep] = await Promise.all([
        service.getBusinessAssemblyPlan({ bootstrap }),
        service.getTools({ bootstrap }),
        service.getDocuments({ bootstrap }),
        service.findLatestConstraintHypothesis({ bootstrap, statuses: ["confirmed", "suggested"] }),
        service.findLatestNextStepAny({ bootstrap })
      ]);
      const constraintHypothesis = constraintRow
        ? service.decorateConstraintHypothesis(constraintRow)
        : null;

      const toolInstances = await toolWorkflow.listInstances({ bootstrap });
      return platformJson({
        ok: true,
        assembly: assemblyResult.assembly,
        diagnostics,
        tools: toolsResult.tools || [],
        documents: documentsResult.documents || [],
        artifacts: documentsResult.artifacts || [],
        toolInstances,
        constraintHypothesis,
        nextStep
      });
    });
  }

  if (path === "profile") {
    return handlePlatformRoute(request, ["POST"], async ({ bootstrap, syncClient }) => {
      const service = createWorkspaceService(syncClient);
      const payload = await readJsonBody(request);
      const onboarding = await service.saveOnboarding({ bootstrap, payload });
      return platformJson({ ok: true, ...onboarding });
    });
  }

  const toolOpenedMatch = path.match(/^tools\/([^/]+)\/opened$/);
  if (toolOpenedMatch) {
    return handlePlatformRoute(request, ["POST"], async ({ bootstrap, syncClient }) => {
      const service = createWorkspaceService(syncClient);
      const result = await service.markToolOpened({
        bootstrap,
        toolId: decodeURIComponent(toolOpenedMatch[1])
      });
      return platformJson({ ok: true, ...result });
    });
  }

  const toolDetailMatch = path.match(/^tools\/([^/]+)$/);
  if (toolDetailMatch && request.method === "GET") {
    return handlePlatformRoute(request, ["GET"], async ({ bootstrap, syncClient, config }) => {
      const workflow = createToolWorkflowService(syncClient, config);
      const tool = await workflow.getTool(decodeURIComponent(toolDetailMatch[1]));
      if (!tool) return platformJson({ ok: false, error: "Инструмент не найден." }, { status: 404 });
      const instances = await workflow.listInstances({ bootstrap });
      const instance = instances.find((item) => item.instance.tool_id === tool.id) || null;
      return platformJson({ ok: true, tool, instance });
    });
  }

  const toolStartMatch = path.match(/^tools\/([^/]+)\/start$/);
  if (toolStartMatch) {
    return handlePlatformRoute(request, ["POST"], async ({ bootstrap, syncClient, config }) => {
      const payload = await readJsonBody(request);
      const context = await createToolWorkflowService(syncClient, config).startTool({
        bootstrap,
        toolId: decodeURIComponent(toolStartMatch[1]),
        mode: payload.mode === "document" ? "document" : "chat"
      });
      return platformJson({ ok: true, ...context });
    });
  }

  const toolCopyMatch = path.match(/^tool-instances\/([^/]+)\/document-copy$/);
  if (toolCopyMatch) {
    return handlePlatformRoute(request, ["POST"], async ({ bootstrap, syncClient, config }) => {
      const context = await createToolWorkflowService(syncClient, config).createPersonalCopy({
        bootstrap,
        instanceId: decodeURIComponent(toolCopyMatch[1])
      });
      return platformJson({ ok: true, ...context });
    });
  }

  const toolLinkMatch = path.match(/^tool-instances\/([^/]+)\/document-link$/);
  if (toolLinkMatch) {
    return handlePlatformRoute(request, ["POST"], async ({ bootstrap, syncClient, config }) => {
      const payload = await readJsonBody(request);
      const context = await createToolWorkflowService(syncClient, config).attachDocumentLink({
        bootstrap,
        instanceId: decodeURIComponent(toolLinkMatch[1]),
        url: payload.url
      });
      return platformJson({ ok: true, ...context });
    });
  }

  return platformJson({ ok: false, error: `Platform API route not found: ${path || "/"}` }, { status: 404 });
}

export default {
  fetch(request) {
    return dispatch(request);
  }
};
