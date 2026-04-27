export class MiniAppApiClient {
  constructor({ initData, fetchImpl = fetch } = {}) {
    this.initData = initData || "";
    this.fetchImpl = fetchImpl;
  }

  async request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    headers.set("accept", "application/json");

    if (options.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }

    if (this.initData) {
      headers.set("x-telegram-init-data", this.initData);
    }

    const response = await this.fetchImpl(path, {
      ...options,
      headers
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.error || `Request failed: ${response.status}`);
    }

    return payload;
  }

  bootstrap() {
    return this.request("/api/mini-app/bootstrap");
  }

  getOnboarding() {
    return this.request("/api/mini-app/onboarding");
  }

  saveOnboarding(payload) {
    return this.request("/api/mini-app/onboarding", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  getExpressDiagnostics() {
    return this.request("/api/mini-app/diagnostics/express");
  }

  saveExpressAnswer(payload) {
    return this.request("/api/mini-app/diagnostics/express/answer", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  getDiagnosticPrefill() {
    return this.request("/api/mini-app/diagnostics/prefill");
  }

  applyDiagnosticPrefillAction(payload) {
    return this.request("/api/mini-app/diagnostics/prefill", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  getMaturity() {
    return this.request("/api/mini-app/maturity");
  }

  reasonConstraint() {
    return this.request("/api/mini-app/constraint/reason");
  }

  applyConstraintAction(payload) {
    return this.request("/api/mini-app/constraint/reason", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  getNextStep() {
    return this.request("/api/mini-app/next-step");
  }

  updateNextStep(payload) {
    return this.request("/api/mini-app/next-step", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  getTools() {
    return this.request("/api/mini-app/tools");
  }

  getRecommendedTools() {
    return this.request("/api/mini-app/tools/recommended");
  }

  recalculateRecommendedTools() {
    return this.request("/api/mini-app/tools/recalculate", {
      method: "POST"
    });
  }

  markToolOpened(toolId) {
    return this.request(`/api/mini-app/tools/${encodeURIComponent(toolId)}/opened`, {
      method: "POST"
    });
  }

  getDocuments() {
    return this.request("/api/mini-app/documents");
  }

  saveDocument(payload) {
    return this.request("/api/mini-app/documents", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  analyzeDocument(documentId, payload) {
    return this.request(`/api/mini-app/documents/${encodeURIComponent(documentId)}/analyze`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  getConsultationBrief() {
    return this.request("/api/mini-app/consultation/brief");
  }

  generateConsultationBrief() {
    return this.request("/api/mini-app/consultation/brief", {
      method: "POST"
    });
  }

  requestConsultation() {
    return this.request("/api/mini-app/consultation/request", {
      method: "POST"
    });
  }

  overrideConstraint(payload) {
    return this.request("/api/mini-app/dev/constraint-override", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  overrideNextStep(payload) {
    return this.request("/api/mini-app/dev/next-step-override", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }
}
