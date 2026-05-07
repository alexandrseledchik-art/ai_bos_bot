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

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

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

function stripTags(value) {
  return decodeHtmlEntities(String(value || "").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeGoogleLink(value) {
  const raw = decodeHtmlEntities(String(value || ""))
    .replace(/\\u003d/g, "=")
    .replace(/\\u0026/g, "&")
    .replace(/\\\//g, "/")
    .trim();

  if (raw.startsWith("/document/") || raw.startsWith("/spreadsheets/") || raw.startsWith("/presentation/")) {
    return `https://${GOOGLE_DOCS_HOST}${raw}`;
  }

  if (raw.startsWith("/file/") || raw.startsWith("/drive/") || raw.startsWith("/open")) {
    return `https://${GOOGLE_DRIVE_HOST}${raw}`;
  }

  return raw;
}

function isGoogleFileLink(value) {
  const link = normalizeGoogleLink(value);
  return /^https:\/\/docs\.google\.com\/(document|spreadsheets|presentation)\/d\//.test(link) ||
    /^https:\/\/drive\.google\.com\/file\/d\//.test(link) ||
    /^https:\/\/drive\.google\.com\/open\?id=/.test(link);
}

function extractPublicFolderLinks(html, maxFiles) {
  const normalizedHtml = String(html || "")
    .replace(/\\u003d/g, "=")
    .replace(/\\u0026/g, "&")
    .replace(/\\\//g, "/");
  const candidates = [];
  const seen = new Set();
  const add = (url, title = "") => {
    const normalizedUrl = normalizeGoogleLink(url).split("#")[0];
    if (!isGoogleFileLink(normalizedUrl) || seen.has(normalizedUrl)) {
      return;
    }

    seen.add(normalizedUrl);
    candidates.push({
      url: normalizedUrl,
      title: cleanText(title)
    });
  };

  const anchorRegex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let anchorMatch;
  while ((anchorMatch = anchorRegex.exec(normalizedHtml))) {
    add(anchorMatch[1], stripTags(anchorMatch[2]));
  }

  const absoluteRegex = /https:\/\/(?:docs|drive)\.google\.com\/[^\s"'<>\\)]+/g;
  let absoluteMatch;
  while ((absoluteMatch = absoluteRegex.exec(normalizedHtml))) {
    add(absoluteMatch[0]);
  }

  const relativeRegex = /\/(?:document|spreadsheets|presentation|file)\/d\/[-\w]+[^\s"'<>\\)]*/g;
  let relativeMatch;
  while ((relativeMatch = relativeRegex.exec(normalizedHtml))) {
    const prefix = relativeMatch[0].startsWith("/file/") ? `https://${GOOGLE_DRIVE_HOST}` : `https://${GOOGLE_DOCS_HOST}`;
    add(`${prefix}${relativeMatch[0]}`);
  }

  return candidates.slice(0, maxFiles);
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
    const folderId = parts[0] === "drive" && parts[1] === "folders"
      ? cleanText(parts[2])
      : cleanText(url.searchParams.get("id"));
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
  constructor({ maxTextChars = 120000, timeoutMs = 8000, maxFolderFiles = 40, fetchImpl = fetch } = {}) {
    this.maxTextChars = maxTextChars;
    this.timeoutMs = timeoutMs;
    this.maxFolderFiles = maxFolderFiles;
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

  async readFolder(inputUrl) {
    const parsed = parsePublicGoogleLink(inputUrl);
    if (!parsed.supported || parsed.kind !== "folder" || !parsed.id) {
      return {
        ...parsed,
        reason: parsed.reason || "Ссылка не похожа на публичную папку Google Drive."
      };
    }

    const folderViewUrl = `https://${GOOGLE_DRIVE_HOST}/embeddedfolderview?id=${encodeURIComponent(parsed.id)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(folderViewUrl, {
        signal: controller.signal,
        redirect: "follow"
      });

      if (!response.ok) {
        return {
          ...parsed,
          folderViewUrl,
          files: [],
          filesFound: 0,
          reason: "Не удалось открыть публичную папку. Проверь доступ: «Все, у кого есть ссылка, могут просматривать»."
        };
      }

      const html = await response.text();
      const links = extractPublicFolderLinks(html, this.maxFolderFiles);
      const files = [];

      for (const link of links) {
        const file = await this.read(link.url);
        files.push({
          ...file,
          url: link.url,
          title: link.title || file.title || "Google Drive файл"
        });
      }

      return {
        ...parsed,
        readable: files.some((file) => file.readable),
        folderViewUrl,
        files,
        filesFound: links.length,
        reason: links.length
          ? ""
          : "Папка открылась, но в публичном HTML не нашлось Google Docs / Sheets / Slides. Возможно, внутри только PDF/изображения или Google не отдал список без входа."
      };
    } catch (error) {
      return {
        ...parsed,
        folderViewUrl,
        files: [],
        filesFound: 0,
        reason: error?.name === "AbortError"
          ? "Google не ответил за отведённое время. Попробуй ещё раз или добавь важные файлы отдельными ссылками."
          : `Не удалось прочитать папку Google Drive: ${error?.message || "ошибка сети"}.`
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
