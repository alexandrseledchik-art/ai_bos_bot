export class PlatformApiClient {
  async request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    headers.set("accept", "application/json");
    if (options.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }

    const response = await fetch(path, {
      ...options,
      credentials: "same-origin",
      headers
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || `Ошибка запроса: ${response.status}`);
      error.status = response.status;
      error.accessStatus = payload.accessStatus || "";
      throw error;
    }
    return payload;
  }

  bootstrap() {
    return this.request("/api/platform/bootstrap");
  }

  workspace() {
    return this.request("/api/platform/workspace");
  }

  saveProfile(payload) {
    return this.request("/api/platform/profile", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  markToolOpened(toolId) {
    return this.request(`/api/platform/tools/${encodeURIComponent(toolId)}/opened`, {
      method: "POST"
    });
  }

  getTool(toolId) {
    return this.request(`/api/platform/tools/${encodeURIComponent(toolId)}`);
  }

  startTool(toolId, mode = "chat") {
    return this.request(`/api/platform/tools/${encodeURIComponent(toolId)}/start`, {
      method: "POST",
      body: JSON.stringify({ mode })
    });
  }

  createToolDocument(instanceId) {
    return this.request(`/api/platform/tool-instances/${encodeURIComponent(instanceId)}/document-copy`, {
      method: "POST"
    });
  }

  attachToolDocument(instanceId, url) {
    return this.request(`/api/platform/tool-instances/${encodeURIComponent(instanceId)}/document-link`, {
      method: "POST",
      body: JSON.stringify({ url })
    });
  }

  logout() {
    return this.request("/api/platform/auth/logout", { method: "POST" });
  }
}
