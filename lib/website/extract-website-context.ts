function extractTagContent(html: string, pattern: RegExp) {
  const match = html.match(pattern);
  return match?.[1]?.trim() ?? null;
}

export async function extractWebsiteContext(params: { url: string }) {
  const response = await fetch(params.url, {
    headers: {
      "User-Agent": "BusinessDiagnosisBot/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Website fetch failed with status ${response.status}.`);
  }

  const html = await response.text();

  const title = extractTagContent(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const description = extractTagContent(
    html,
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
  );
  const headings = Array.from(html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi))
    .map((match) => match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 5);

  return {
    url: params.url,
    title,
    description,
    headings,
  };
}
