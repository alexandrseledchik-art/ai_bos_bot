import Link from "next/link";

export default function MiniAppPage() {
  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1>Mini App</h1>
      <p>Здесь хранятся сохранённые разборы и артефакты из Telegram-чата.</p>
      <p>
        <Link href="/mini-app/results">Открыть сохранённые результаты</Link>
      </p>
    </main>
  );
}
