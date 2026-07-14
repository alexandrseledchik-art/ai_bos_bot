import crypto from "node:crypto";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_API_BASE_URL = "https://www.googleapis.com/drive/v3";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const GOOGLE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

const GOOGLE_EXPORT_MIME_TYPES = {
  "application/vnd.google-apps.document": "text/plain",
  "application/vnd.google-apps.spreadsheet": "text/csv",
  "application/vnd.google-apps.presentation": "text/plain"
};

const DOWNLOADABLE_TEXT_MIME_TYPES = new Set([
  "text/plain",
  "text/csv",
  "text/markdown",
  "application/json"
]);

function base64Url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function normalizePrivateKey(value) {
  return String(value || "").replace(/\\n/g, "\n").trim();
}

function escapeDriveQueryValue(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function normalizeName(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function namesMatch(left, right) {
  const normalizedLeft = normalizeName(left);
  const normalizedRight = normalizeName(right);

  return Boolean(
    normalizedLeft &&
    normalizedRight &&
    (
      normalizedLeft === normalizedRight ||
      normalizedLeft.includes(normalizedRight) ||
      normalizedRight.includes(normalizedLeft)
    )
  );
}

function compactText(value, maxChars) {
  const text = String(value || "").trim();
  if (!maxChars || text.length <= maxChars) {
    return text;
  }

  return `${text.slice(0, maxChars - 1).trim()}…`;
}

function isFolder(file) {
  return file?.mimeType === GOOGLE_FOLDER_MIME_TYPE;
}

function canReadContent(file) {
  return Boolean(GOOGLE_EXPORT_MIME_TYPES[file?.mimeType] || DOWNLOADABLE_TEXT_MIME_TYPES.has(file?.mimeType));
}

export class GoogleDriveClient {
  constructor({
    serviceAccountEmail = "",
    privateKey = "",
    rootFolderId = "",
    tokenUrl = TOKEN_URL,
    driveApiBaseUrl = DRIVE_API_BASE_URL,
    maxTextChars = 120000
  } = {}) {
    this.serviceAccountEmail = serviceAccountEmail;
    this.privateKey = normalizePrivateKey(privateKey);
    this.rootFolderId = rootFolderId;
    this.tokenUrl = tokenUrl;
    this.driveApiBaseUrl = driveApiBaseUrl.replace(/\/$/, "");
    this.maxTextChars = maxTextChars;
    this.cachedToken = null;
  }

  get enabled() {
    return Boolean(this.serviceAccountEmail && this.privateKey && this.rootFolderId);
  }

  assertEnabled() {
    if (!this.enabled) {
      throw new Error(
        "Google Drive connector is not configured. Set GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL, GOOGLE_DRIVE_PRIVATE_KEY and GOOGLE_DRIVE_FOLDER_ID."
      );
    }
  }

  buildJwt() {
    const now = Math.floor(Date.now() / 1000);
    const header = {
      alg: "RS256",
      typ: "JWT"
    };
    const payload = {
      iss: this.serviceAccountEmail,
      scope: DRIVE_SCOPE,
      aud: this.tokenUrl,
      exp: now + 3600,
      iat: now
    };
    const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
    const signature = crypto
      .createSign("RSA-SHA256")
      .update(unsigned)
      .sign(this.privateKey);

    return `${unsigned}.${base64Url(signature)}`;
  }

  async getAccessToken() {
    this.assertEnabled();

    if (this.cachedToken && Date.now() < this.cachedToken.expiresAt - 60000) {
      return this.cachedToken.accessToken;
    }

    const response = await fetch(this.tokenUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: this.buildJwt()
      })
    });

    if (!response.ok) {
      throw new Error(`Google OAuth token request failed: ${response.status} ${await response.text()}`);
    }

    const payload = await response.json();
    this.cachedToken = {
      accessToken: payload.access_token,
      expiresAt: Date.now() + Number(payload.expires_in || 3600) * 1000
    };

    return this.cachedToken.accessToken;
  }

  async request(pathname, { method = "GET", query = {}, headers = {}, body } = {}) {
    const accessToken = await this.getAccessToken();
    const url = new URL(`${this.driveApiBaseUrl}${pathname}`);

    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }

    const response = await fetch(url, {
      method,
      headers: {
        authorization: `Bearer ${accessToken}`,
        ...(body ? { "content-type": "application/json" } : {}),
        ...headers
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });

    if (!response.ok) {
      throw new Error(`Google Drive request failed: ${response.status} ${await response.text()}`);
    }

    return response;
  }

  async findOrCreateFolder({ name, parentId = this.rootFolderId }) {
    this.assertEnabled();
    const files = await this.listFilesInFolder(parentId);
    const existing = files.find((file) => isFolder(file) && normalizeName(file.name) === normalizeName(name));
    if (existing) return existing;

    const response = await this.request("/files", {
      method: "POST",
      query: { fields: "id,name,mimeType,webViewLink,modifiedTime" },
      body: {
        name,
        mimeType: GOOGLE_FOLDER_MIME_TYPE,
        parents: [parentId]
      }
    });
    return response.json();
  }

  async copyFile({ fileId, name, parentId }) {
    this.assertEnabled();
    const response = await this.request(`/files/${encodeURIComponent(fileId)}/copy`, {
      method: "POST",
      query: { fields: "id,name,mimeType,webViewLink,modifiedTime,parents" },
      body: {
        ...(name ? { name } : {}),
        ...(parentId ? { parents: [parentId] } : {})
      }
    });
    return response.json();
  }

  async listFilesInFolder(folderId = this.rootFolderId) {
    this.assertEnabled();
    const files = [];
    let pageToken = "";

    do {
      const response = await this.request("/files", {
        query: {
          q: `'${escapeDriveQueryValue(folderId)}' in parents and trashed=false`,
          fields: "nextPageToken,files(id,name,mimeType,webViewLink,modifiedTime,size)",
          orderBy: "folder,name",
          pageSize: 100,
          ...(pageToken ? { pageToken } : {})
        }
      });
      const payload = await response.json();
      files.push(...(payload.files || []));
      pageToken = payload.nextPageToken || "";
    } while (pageToken);

    return files;
  }

  async getFileMetadata(fileId = this.rootFolderId) {
    this.assertEnabled();
    const response = await this.request(`/files/${encodeURIComponent(fileId)}`, {
      query: {
        fields: "id,name,mimeType,webViewLink,modifiedTime"
      }
    });

    return response.json();
  }

  async findCompanyFolder(companyName) {
    const files = await this.listFilesInFolder(this.rootFolderId);
    const folders = files.filter(isFolder);

    return folders.find((folder) => namesMatch(folder.name, companyName)) ||
      null;
  }

  async listCompanyFiles(companyName) {
    const companyFolder = await this.findCompanyFolder(companyName);
    if (!companyFolder) {
      const rootFolder = await this.getFileMetadata(this.rootFolderId);
      if (isFolder(rootFolder) && namesMatch(rootFolder.name, companyName)) {
        const files = (await this.listFilesInFolder(rootFolder.id)).filter((file) => !isFolder(file));
        return {
          companyFolder: rootFolder,
          files,
          usedRootFolder: true
        };
      }

      return {
        companyFolder: null,
        files: [],
        usedRootFolder: false
      };
    }

    const files = (await this.listFilesInFolder(companyFolder.id)).filter((file) => !isFolder(file));

    return {
      companyFolder,
      files,
      usedRootFolder: false
    };
  }

  async readFileText(file) {
    if (!canReadContent(file)) {
      return {
        readable: false,
        text: "",
        reason: `Формат ${file.mimeType || "unknown"} пока не читается напрямую. Файл сохранён как источник-ссылка.`
      };
    }

    const exportMimeType = GOOGLE_EXPORT_MIME_TYPES[file.mimeType];
    const response = exportMimeType
      ? await this.request(`/files/${encodeURIComponent(file.id)}/export`, {
          query: {
            mimeType: exportMimeType
          }
        })
      : await this.request(`/files/${encodeURIComponent(file.id)}`, {
          query: {
            alt: "media"
          }
        });

    const text = await response.text();
    return {
      readable: true,
      text: compactText(text, this.maxTextChars),
      reason: ""
    };
  }
}

export function isGoogleDriveClientConfigured(config) {
  return Boolean(config.googleDriveServiceAccountEmail && config.googleDrivePrivateKey && config.googleDriveFolderId);
}
