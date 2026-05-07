const GOOGLE_DOCS_HOST = "docs.google.com";
const GOOGLE_DRIVE_HOST = "drive.google.com";

const SUPPORTED_DOCS_TYPES = {
  document: {
    sourceType: "document",
    title: "Google Docs",
    exportPath: "document",
    formatParam: "txt"
  },
  spreadsheets: {
    sourceType: "table",
    title: "Google Sheets",
    exportPath: "spreadsheets",
    formatParam: "csv"
  },
  presentation: {
    sourceType: "document",
    title: "Google Slides",
    exportPath: "presentation",
    directExportSuffix: "txt"
  }
};

function compactText(value, maxChars) {
  const text = String(value || "").trim();
  if (!maxChars || text.length <= maxChars) {
    return text;
  }

  return `${text.slice(0, maxChars - 1).trim()}…`;
}

function cleanText(value) {
  return String(value || "").trim();
}

function readHashParam(hash, key) {
  const params = new URLSearchParams(String(hash || "").replace(/^#/, ""));
  return params.get(key) || "";
}

function looksLikeHtml(value) {
  const head = String(value || "").trim().slice(0, 300).toLowerCase();
  return head.startsWith("<!doctype html") || head.startsWith("<html") || head.includes("<html");
}

function publicLinkResult(input) {
  return {
    inputUrl: input,
    supported: false,
    readable: false,
    id: "",
    kind: "",
    sourceType: "link",
    title: "",
    exportUrl: "",
    text: "",
    reason: ""
  };
}

export function parsePublicGoogleLink(inputUrl) {
  const result = publicLinkResult(cleanText(inputUrl));
  if (!result.inputUrl) {
    return result;
  }

  let url;
  try {
    url = new URL(result.inputUrl);
  } catch {
    return {
      ...result,
      reason: "Ссылка не похожа на корректный URL."
    };
  }

  const hostname = url.hostname.replace(/^www\./, "");
  const parts = url.pathname.split("/").filter(Boolean);

  if (hostname === GOOGLE_DOCS_HOST) {
    const docsType = parts[0];
    const idIndex = parts.findIndex((part) => part === "d") + 1;
    const id = idIndex > 0 ? cleanText(parts[idIndex]) : "";
    const config = SUPPORTED_DOCS_TYPES[docsType];

    if (!config || !id) {
      return {
        ...result,
        reason: "Пока читаю только публичные ссылки Google Docs, Sheets и Slides."
      };
    }

    const exportUrl = new URL(`https://${GOOGLE_DOCS_HOST}/${config.exportPath}/d/${encodeURIComponent(id)}/export`);
    if (config.directExportSuffix) {
      exportUrl.pathname = `/${config.exportPath}/d/${encodeURIComponent(id)}/export/${config.directExportSuffix}`;
    } else {
      exportUrl.searchParams.set("format", config.formatParam);
    }

    const gid = url.searchParams.get("gid") || readHashParam(url.hash, "gid");
    if (docsType === "spreadsheets" && gid) {
      exportUrl.searchParams.set("gid", gid);
    }

    return {
      ...result,
      supported: true,
      id,
      kind: docsType,
      sourceType: config.sourceType,
      title: config.title,
      exportUrl: exportUrl.toString()
    };
  }

  if (hostname === GOOGLE_DRIVE_HOST) {
    const folderId = parts[0] === "drive" && parts[1] === "folders" ? cleanText(parts[2]) : "";
    const fileId = parts[0] === "file" && parts[1] === "d" ? cleanText(parts[2]) : "";

    if (folderId) {
      return {
        ...result,
        supported: true,
        id: folderId,
        kind: "folder",
        reason: "Папку по публичной ссылке пока не обхожу. Для папки лучше полная Drive-интеграция, а для быстрого режима вставь ссылку на конкретный Google Doc или Sheet."
      };
    }

    if (fileId) {
      return {
        ...result,
        supported: true,
        id: fileId,
        kind: "drive_file",
        reason: "Обычный файл Drive по ссылке сохраню как источник, но текст надёжно читаю через Google Docs/Sheets или полную Drive-интеграцию."
      };
    }
  }

  return result;
}

export class PublicGoogleLinkReader {
  constructor({ maxTextChars = 120000, timeoutMs = 8000, fetchImpl = fetch } = {}) {
    this.maxTextChars = maxTextChars;
    this.timeoutMs = timeoutMs;
    this.fetchImpl = fetchImpl;
  }

  canRead(inputUrl) {
    const parsed = parsePublicGoogleLink(inputUrl);
    return Boolean(parsed.supported && parsed.exportUrl);
  }

  async read(inputUrl) {
    const parsed = parsePublicGoogleLink(inputUrl);
    if (!parsed.supported || !parsed.exportUrl) {
      return parsed;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(parsed.exportUrl, {
        signal: controller.signal,
        redirect: "follow"
      });

      if (!response.ok) {
        return {
          ...parsed,
          reason: "Не удалось прочитать текст. Проверь, что у файла включён доступ по ссылке: «Все, у кого есть ссылка, могут просматривать»."
        };
      }

      const text = await response.text();
      if (!cleanText(text) || looksLikeHtml(text)) {
        return {
          ...parsed,
          reason: "Ссылка открылась не как текст. Обычно это значит, что доступ по ссылке закрыт или Google показывает страницу входа."
        };
      }

      return {
        ...parsed,
        readable: true,
        text: compactText(text, this.maxTextChars),
        reason: ""
      };
    } catch (error) {
      return {
        ...parsed,
        reason: error?.name === "AbortError"
          ? "Google не ответил за отведённое время. Ссылка сохранена, текст можно попробовать подтянуть позже."
          : `Не удалось прочитать Google-ссылку: ${error?.message || "ошибка сети"}.`
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
