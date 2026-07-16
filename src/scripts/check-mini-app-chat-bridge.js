import assert from "node:assert/strict";

import {
  buildMiniAppInvite,
  createMiniAppInviteSnapshot,
  MINI_APP_CABINET_SCREENS
} from "../application/mini-app-invite-policy.js";
import { buildMiniAppMenuButton, buildMiniAppReplyMarkup, buildMiniAppUrl } from "../infrastructure/telegram/mini-app-webapp.js";
import { TelegramApiClient } from "../infrastructure/telegram/telegram-api.js";
import fs from "node:fs";

function assertInvitePolicy() {
  assert.equal(MINI_APP_CABINET_SCREENS.dashboard.route, "/mini-app");
  assert.equal(MINI_APP_CABINET_SCREENS.diagnostics.route, "/mini-app/diagnostics/express");
  assert.equal(MINI_APP_CABINET_SCREENS.ceo.route, "/mini-app/ceo");

  const toolInvite = buildMiniAppInvite({
    forceMiniAppInvite: true,
    classification: {
      entryMode: "specific_tool_request",
      hasSpecificToolIntent: true
    },
    decision: {
      decision: {
        action: "clarify",
        signalSufficiency: "weak"
      },
      entryState: {}
    },
    runtime: {},
    entryState: {}
  });
  assert.equal(toolInvite.route, "/mini-app/tools");
  assert.equal(toolInvite.label, "Открыть инструменты");

  const chatFirstInvite = buildMiniAppInvite({
    classification: {
      entryMode: "specific_tool_request",
      hasSpecificToolIntent: true
    },
    decision: {
      decision: {
        action: "clarify",
        signalSufficiency: "weak"
      },
      entryState: {}
    },
    runtime: {},
    entryState: {}
  });
  assert.equal(chatFirstInvite, null);

  const ceoInvite = buildMiniAppInvite({
    forceMiniAppInvite: true,
    classification: {
      entryMode: "meta_role",
      cleanText: "Как ты понимаешь роль AI-BOSS как CEO-слоя в упаковке консалтинга Александра?"
    },
    decision: {
      decision: {
        action: "answer",
        signalSufficiency: "weak"
      },
      entryState: {}
    },
    runtime: {},
    entryState: {}
  });
  assert.equal(ceoInvite.route, "/mini-app/ceo");
  assert.equal(ceoInvite.label, "Открыть управленческую повестку");

  const assemblyInvite = buildMiniAppInvite({
    forceMiniAppInvite: true,
    classification: {
      entryMode: "meta_role",
      cleanText: "Нужно собрать бизнес по 11 слоям, инструментам и документам"
    },
    decision: {
      decision: {
        action: "answer",
        signalSufficiency: "weak"
      },
      entryState: {}
    },
    runtime: {},
    entryState: {}
  });
  assert.equal(assemblyInvite.route, "/mini-app/assembly");
  assert.equal(assemblyInvite.label, "Открыть архитектуру бизнеса");

  const diagnosticsInvite = buildMiniAppInvite({
    forceMiniAppInvite: true,
    classification: {
      entryMode: "problem_first",
      urls: []
    },
    decision: {
      decision: {
        action: "clarify",
        signalSufficiency: "partial"
      },
      entryState: {}
    },
    runtime: {
      activeCaseKind: "diagnostic_case"
    },
    entryState: {}
  });
  assert.equal(diagnosticsInvite.route, "/mini-app/diagnostics/express");

  const suppressed = buildMiniAppInvite({
    forceMiniAppInvite: true,
    classification: {
      entryMode: "problem_first",
      urls: []
    },
    decision: {
      decision: {
        action: "clarify",
        signalSufficiency: "partial"
      },
      entryState: {}
    },
    runtime: {
      activeCaseKind: "diagnostic_case"
    },
    entryState: {
      lastMiniAppInvite: createMiniAppInviteSnapshot(diagnosticsInvite, "2026-04-28T10:00:00.000Z")
    },
    now: new Date("2026-04-28T10:05:00.000Z")
  });
  assert.equal(suppressed, null);

  const documentInvite = buildMiniAppInvite({
    forceMiniAppInvite: true,
    classification: {
      entryMode: "url_only",
      urls: ["https://docs.google.com/spreadsheets/d/example"]
    },
    decision: {
      decision: {
        action: "screen",
        signalSufficiency: "partial"
      },
      entryState: {}
    },
    runtime: {},
    entryState: {}
  });
  assert.equal(documentInvite.route, "/mini-app/documents");
}

async function assertTelegramMarkup() {
  const url = buildMiniAppUrl("https://aibosbot.vercel.app/", "/mini-app/constraint");
  assert.equal(url, "https://aibosbot.vercel.app/mini-app/constraint");

  const replyMarkup = buildMiniAppReplyMarkup(
    {
      route: "/mini-app/constraint",
      label: "Посмотреть гипотезу"
    },
    {
      appBaseUrl: "https://aibosbot.vercel.app"
    }
  );
  assert.equal(replyMarkup.inline_keyboard[0][0].text, "Посмотреть гипотезу");
  assert.equal(replyMarkup.inline_keyboard[0][0].web_app.url, "https://aibosbot.vercel.app/mini-app/constraint");

  const menuButton = buildMiniAppMenuButton("https://aibosbot.vercel.app", {
    route: "/mini-app",
    text: "Кабинет"
  });
  assert.equal(menuButton.type, "web_app");
  assert.equal(menuButton.text, "Кабинет");
  assert.equal(menuButton.web_app.url, "https://aibosbot.vercel.app/mini-app");

  const client = new TelegramApiClient({
    token: "test-token",
    apiBaseUrl: "https://api.telegram.test"
  });
  let captured;
  client.api = async (method, payload) => {
    captured = { method, payload };
    return { message_id: 1 };
  };

  await client.sendMessage(42, "Проверим это в Кабинете.", { replyMarkup });
  assert.equal(captured.method, "sendMessage");
  assert.equal(captured.payload.chat_id, 42);
  assert.equal(captured.payload.reply_markup.inline_keyboard[0][0].web_app.url, "https://aibosbot.vercel.app/mini-app/constraint");

  await client.setChatMenuButton({ menuButton });
  assert.equal(captured.method, "setChatMenuButton");
  assert.equal(captured.payload.menu_button.web_app.url, "https://aibosbot.vercel.app/mini-app");
}

async function main() {
  assertInvitePolicy();
  await assertTelegramMarkup();
  const conversationService = fs.readFileSync("src/application/conversation-service.js", "utf8");
  const adminApi = fs.readFileSync("api/admin/[...path].js", "utf8");
  assert.match(conversationService, /buildStartCabinetInvite/);
  assert.match(conversationService, /buildPlatformWelcomeMessage/);
  assert.match(conversationService, /webOnly: true/);
  assert.match(conversationService, /looksStartCommand\(text\)/);
  assert.match(adminApi, /telegram\/miniapp-menu/);
  assert.match(adminApi, /setChatMenuButton/);

  console.log("Mini App chat bridge checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
