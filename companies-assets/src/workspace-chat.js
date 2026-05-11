function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const CHAT_STORAGE_VERSION = 1;
const DEFAULT_INITIAL_MESSAGE = "Я рядом. Можешь спросить про текущую компанию, слой, инструмент, доступы или следующий шаг.";

function storageKeyFor({ endpoint, title, storageKey }) {
  if (storageKey) {
    return storageKey;
  }

  return `aiboss.workspace-chat.${endpoint || "default"}.${title || "chat"}.v${CHAT_STORAGE_VERSION}`;
}

function normalizeMessage(message) {
  const role = message?.role === "user" ? "user" : "assistant";
  const text = String(message?.text || "").trim();
  if (!text) {
    return null;
  }

  return {
    role,
    text,
    createdAt: message?.createdAt || new Date().toISOString()
  };
}

function readStoredMessages(storageKey) {
  try {
    const raw = window.localStorage?.getItem(storageKey);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    const messages = Array.isArray(parsed) ? parsed : parsed?.messages;
    if (!Array.isArray(messages)) {
      return [];
    }

    return messages.map(normalizeMessage).filter(Boolean);
  } catch {
    return [];
  }
}

function writeStoredMessages(storageKey, messages, maxMessages) {
  try {
    const compact = messages
      .map(normalizeMessage)
      .filter(Boolean)
      .slice(-maxMessages);

    window.localStorage?.setItem(
      storageKey,
      JSON.stringify({
        version: CHAT_STORAGE_VERSION,
        updatedAt: new Date().toISOString(),
        messages: compact
      })
    );
  } catch {
    // История чата не должна ломать сам чат, если браузер запретил localStorage.
  }
}

function messageHtml(message) {
  return `
    <article class="workspace-chat-message ${message.role === "assistant" ? "assistant" : "user"}">
      <div>${escapeHtml(message.text)}</div>
    </article>
  `;
}

export function initWorkspaceChat({
  endpoint,
  tokenProvider,
  contextProvider = () => ({}),
  title = "AI-BOSS",
  storageKey = "",
  maxStoredMessages = 60,
  historyLimitForRequest = 12,
  initialMessage = DEFAULT_INITIAL_MESSAGE
} = {}) {
  if (!endpoint || document.querySelector("[data-workspace-chat]")) {
    return null;
  }

  const chatStorageKey = storageKeyFor({ endpoint, title, storageKey });
  let history = readStoredMessages(chatStorageKey);
  if (!history.length) {
    history = [normalizeMessage({ role: "assistant", text: initialMessage })];
    writeStoredMessages(chatStorageKey, history, maxStoredMessages);
  }

  const root = document.createElement("aside");
  root.className = "workspace-chat";
  root.dataset.workspaceChat = "true";
  root.innerHTML = `
    <button class="workspace-chat-fab" type="button" aria-expanded="false">${escapeHtml(title)}</button>
    <section class="workspace-chat-panel" hidden>
      <header>
        <div>
          <strong>${escapeHtml(title)}</strong>
          <span>Задай вопрос по текущей странице</span>
        </div>
        <button class="workspace-chat-close" type="button" aria-label="Закрыть чат">×</button>
      </header>
      <div class="workspace-chat-messages" aria-live="polite">
        ${history.map(messageHtml).join("")}
      </div>
      <form class="workspace-chat-form">
        <textarea name="text" rows="2" placeholder="Напиши вопрос..."></textarea>
        <button type="submit">Отправить</button>
      </form>
    </section>
  `;

  document.body.append(root);

  const fab = root.querySelector(".workspace-chat-fab");
  const panel = root.querySelector(".workspace-chat-panel");
  const close = root.querySelector(".workspace-chat-close");
  const form = root.querySelector(".workspace-chat-form");
  const textarea = root.querySelector("textarea");
  const messages = root.querySelector(".workspace-chat-messages");

  function persistHistory() {
    writeStoredMessages(chatStorageKey, history, maxStoredMessages);
  }

  function renderHistory() {
    messages.innerHTML = history.map(messageHtml).join("");
    messages.scrollTop = messages.scrollHeight;
  }

  function setOpen(open) {
    panel.hidden = !open;
    fab.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      messages.scrollTop = messages.scrollHeight;
      textarea.focus();
    }
  }

  function addMessage(role, text) {
    const message = normalizeMessage({ role, text });
    if (!message) {
      return null;
    }
    history = [...history, message].slice(-maxStoredMessages);
    persistHistory();
    messages.insertAdjacentHTML("beforeend", messageHtml({ role, text }));
    messages.scrollTop = messages.scrollHeight;
    return message;
  }

  function requestHistory() {
    return history
      .filter((message) => message.text !== initialMessage)
      .slice(-historyLimitForRequest)
      .map((message) => ({
        role: message.role,
        text: message.text
      }));
  }

  fab.addEventListener("click", () => setOpen(panel.hidden));
  close.addEventListener("click", () => setOpen(false));

  window.addEventListener("storage", (event) => {
    if (event.key !== chatStorageKey) {
      return;
    }
    history = readStoredMessages(chatStorageKey);
    if (!history.length) {
      history = [normalizeMessage({ role: "assistant", text: initialMessage })];
    }
    renderHistory();
  });

  textarea.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      form.requestSubmit();
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = textarea.value.trim();
    if (!text) {
      textarea.focus();
      return;
    }

    const token = tokenProvider?.() || "";
    if (!token) {
      addMessage("assistant", "Сначала открой страницу через admin token, потом я смогу отвечать из этого окна.");
      return;
    }

    const recentHistory = requestHistory();
    textarea.value = "";
    addMessage("user", text);
    const pending = { role: "assistant", text: "Думаю..." };
    messages.insertAdjacentHTML("beforeend", messageHtml(pending));
    const pendingNode = messages.lastElementChild;
    messages.scrollTop = messages.scrollHeight;

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          text,
          context: contextProvider?.() || {},
          history: recentHistory
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) {
        throw new Error(payload.error || `Chat API error: ${response.status}`);
      }
      const reply = payload.reply || "Ответ пустой.";
      pendingNode.outerHTML = messageHtml({ role: "assistant", text: reply });
      history = [...history, normalizeMessage({ role: "assistant", text: reply })].filter(Boolean).slice(-maxStoredMessages);
      persistHistory();
    } catch (error) {
      const errorText = `Не смог ответить из этого окна: ${error.message || error}`;
      pendingNode.outerHTML = messageHtml({ role: "assistant", text: errorText });
      history = [...history, normalizeMessage({ role: "assistant", text: errorText })].filter(Boolean).slice(-maxStoredMessages);
      persistHistory();
    }
    messages.scrollTop = messages.scrollHeight;
  });

  return { root, setOpen, addMessage };
}
