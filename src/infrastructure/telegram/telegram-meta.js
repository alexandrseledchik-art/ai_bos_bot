function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

export function isVoiceCapabilityQuestion(text) {
  const normalized = normalizeText(text);
  return /голосов|голосом|voice|аудио/.test(normalized) &&
    /принима|поддерж|умеешь|можно|работаешь|разбираешь/.test(normalized);
}

export function buildVoiceCapabilityReply({ voiceEnabled }) {
  if (voiceEnabled) {
    return "Да, принимаю. Можешь прислать голосом — я разберу и продолжу по делу. Если удобно, просто надиктуй, что сейчас происходит и где именно буксует результат.";
  }

  return "Пока нет: в этом окружении транскрибация голосовых не настроена. Если хочешь, напиши ту же мысль текстом в одной-двух фразах, и я сразу продолжу.";
}
