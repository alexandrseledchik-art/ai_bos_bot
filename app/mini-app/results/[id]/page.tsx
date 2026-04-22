import Link from "next/link";
import { notFound } from "next/navigation";

import {
  getCaseById,
  getCaseSnapshotById,
  getConversationArtifacts,
} from "@/lib/persistence/repository";

export const dynamic = "force-dynamic";

export default async function ResultDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const snapshot = await getCaseSnapshotById(id);

  if (!snapshot) {
    notFound();
  }

  const caseRecord = await getCaseById(snapshot.caseId);
  const artifacts = caseRecord ? await getConversationArtifacts(caseRecord.conversationId) : [];
  const telegramBotUsername = process.env.TELEGRAM_BOT_USERNAME;
  const continueHref = telegramBotUsername
    ? `https://t.me/${telegramBotUsername}?start=case_${snapshot.caseId}`
    : null;

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <p><Link href="/mini-app/results">← Назад к списку</Link></p>
      <h1>Результат разбора</h1>
      <p><strong>Действие:</strong> {snapshot.action}</p>
      <p><strong>Уверенность:</strong> {snapshot.confidence}</p>
      <p><strong>Почему выбран этот шаг:</strong> {snapshot.routerReason}</p>
      <h2>Текст ответа</h2>
      <p style={{ whiteSpace: "pre-wrap" }}>{snapshot.replyText}</p>
      <h2>Структурированный результат</h2>
      <pre style={{ whiteSpace: "pre-wrap", background: "#f6f6f6", padding: 16, borderRadius: 12 }}>
        {JSON.stringify(snapshot.structuredOutputJson, null, 2)}
      </pre>
      <h2>Артефакты</h2>
      {artifacts.length === 0 ? (
        <p>Для этого кейса пока нет отдельных артефактов.</p>
      ) : (
        <ul style={{ display: "grid", gap: 12, padding: 0, listStyle: "none" }}>
          {artifacts.map((artifact) => (
            <li key={artifact.id} style={{ background: "#f6f6f6", padding: 16, borderRadius: 12 }}>
              <p><strong>{artifact.artifactType}</strong></p>
              <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>
                {JSON.stringify(artifact.contentJson, null, 2)}
              </pre>
            </li>
          ))}
        </ul>
      )}
      {continueHref ? (
        <p>
          <a href={continueHref} target="_blank" rel="noreferrer">
            Продолжить кейс в Telegram
          </a>
        </p>
      ) : (
        <p>Продолжение кейса происходит обратно в Telegram-чате.</p>
      )}
    </main>
  );
}
