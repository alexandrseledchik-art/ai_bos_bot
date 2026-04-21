import Link from "next/link";

import { listCaseSnapshots } from "@/lib/persistence/repository";

export default async function ResultsPage() {
  const snapshots = await listCaseSnapshots();

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1>Сохранённые разборы</h1>
      {snapshots.length === 0 ? (
        <p>Пока нет сохранённых результатов.</p>
      ) : (
        <ul style={{ display: "grid", gap: 16, padding: 0, listStyle: "none" }}>
          {snapshots.map((snapshot) => (
            <li key={snapshot.id} style={{ border: "1px solid #ddd", padding: 16, borderRadius: 12 }}>
              <p><strong>{snapshot.action}</strong> · {snapshot.createdAt}</p>
              <p>{snapshot.replyText}</p>
              <Link href={`/mini-app/results/${snapshot.id}`}>Открыть результат</Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
