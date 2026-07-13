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

  logout() {
    return this.request("/api/platform/auth/logout", { method: "POST" });
  }
}
