export type EntryToolCatalogItem = {
  slug: string;
  title: string;
  summary: string;
};

const DEFAULT_TOOLS: EntryToolCatalogItem[] = [
  {
    slug: "raci",
    title: "RACI",
    summary: "Матрица ролей и ответственности, когда в команде хаос по зонам ответственности.",
  },
  {
    slug: "unit-economics",
    title: "Unit Economics",
    summary: "Разбор экономики, маржи и влияния каналов продаж на устойчивость бизнеса.",
  },
  {
    slug: "owner-bottleneck-map",
    title: "Owner Bottleneck Map",
    summary: "Карта зависимостей от собственника и главных точек ручного управления.",
  },
];

export async function getToolsCatalogForEntry() {
  return DEFAULT_TOOLS;
}
