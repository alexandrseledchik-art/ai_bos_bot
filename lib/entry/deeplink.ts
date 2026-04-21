export function buildToolDeepLink(slug: string) {
  return `/tools/${slug}?source=telegram_entry`;
}

export function buildDiagnosisDeepLink() {
  return "/cases?source=telegram_entry";
}
