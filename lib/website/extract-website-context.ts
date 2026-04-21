export async function extractWebsiteContextFromText(text: string) {
  const match = text.match(/https?:\/\/\S+/i);
  if (!match) {
    return null;
  }

  return {
    url: match[0],
    title: null as string | null,
    description: null as string | null,
    headings: [] as string[],
  };
}
