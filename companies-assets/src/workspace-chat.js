function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
  title = "AI-BOSS"
} = {}) {
  if (!endpoint || document.querySelector("[data-workspace-chat]")) {
    return null;
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
        ${messageHtml({
          role: "assistant",
          text: "Я рядом. Можешь спросить про текущую компанию, слой, инструмент, доступы или следующий шаг."
        })}
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

  function setOpen(open) {
    panel.hidden = !open;
    fab.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      textarea.focus();
    }
  }

  function addMessage(role, text) {
    messages.insertAdjacentHTML("beforeend", messageHtml({ role, text }));
    messages.scrollTop = messages.scrollHeight;
  }

  fab.addEventListener("click", () => setOpen(panel.hidden));
  close.addEventListener("click", () => setOpen(false));

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
          context: contextProvider?.() || {}
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) {
        throw new Error(payload.error || `Chat API error: ${response.status}`);
      }
      pendingNode.outerHTML = messageHtml({ role: "assistant", text: payload.reply || "Ответ пустой." });
    } catch (error) {
      pendingNode.outerHTML = messageHtml({
        role: "assistant",
        text: `Не смог ответить из этого окна: ${error.message || error}`
      });
    }
    messages.scrollTop = messages.scrollHeight;
  });

  return { root, setOpen, addMessage };
}
