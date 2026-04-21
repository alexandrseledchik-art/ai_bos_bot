export default function HomePage() {
  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1>Business Diagnosis Mini App</h1>
      <p>Mini App serves as storage and continuation for saved Telegram analyses.</p>
      <p>
        Основной интерфейс — Telegram. Здесь хранятся сохранённые результаты и артефакты.
      </p>
      <p>
        <a href="/mini-app/results">Открыть сохранённые результаты</a>
      </p>
    </main>
  );
}
