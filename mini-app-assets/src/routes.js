export const ROUTES = [
  {
    path: "/mini-app",
    title: "Кабинет компании",
    eyebrow: "Главный экран",
    description: "Стартовая панель: статус компании, диагностика, гипотеза ограничения, следующий шаг и инструменты."
  },
  {
    path: "/mini-app/onboarding",
    title: "Входной профиль",
    eyebrow: "Профиль компании",
    description: "Короткий вход: компания, отрасль, размер, выручка, текущий запрос и роль пользователя."
  },
  {
    path: "/mini-app/diagnostics/express",
    title: "Экспресс-диагностика",
    eyebrow: "11 слоёв",
    description: "Быстрая диагностика по слоям. Выберите описание зрелости, которое ближе всего к реальности компании."
  },
  {
    path: "/mini-app/maturity",
    title: "Матрица зрелости",
    eyebrow: "Состояние компании",
    description: "Карта зрелости по 11 слоям на основе подтверждённых ответов экспресс-диагностики."
  },
  {
    path: "/mini-app/constraint",
    title: "Гипотеза ограничения",
    eyebrow: "Состояние кейса",
    description: "Здесь будет текущая гипотеза главного ограничения, доказательства и альтернативы."
  },
  {
    path: "/mini-app/next-step",
    title: "Следующий шаг",
    eyebrow: "Первое действие",
    description: "Здесь появится один рекомендуемый следующий шаг и объяснение, почему он первый."
  },
  {
    path: "/mini-app/tools",
    title: "Инструменты",
    eyebrow: "Каталог",
    description: "Здесь будет каталог и 3–5 рекомендованных инструментов для текущего кейса."
  },
  {
    path: "/mini-app/documents",
    title: "Документы",
    eyebrow: "Источники",
    description: "Здесь пользователь сможет добавить ссылку на документ и увидеть статус анализа."
  },
  {
    path: "/mini-app/consultation",
    title: "Разбор с Александром Селедчиком",
    eyebrow: "Разбор с Александром",
    description: "Короткое резюме текущего кейса и переход к консультации без агрессивной продажи."
  }
];

export function matchRoute(pathname) {
  const normalized = normalizePath(pathname);
  const exact = ROUTES.find((route) => route.path === normalized);
  if (exact) {
    return exact;
  }

  if (normalized.startsWith("/mini-app/tools/")) {
    const slug = normalized.split("/").filter(Boolean).at(-1) || "";
    return {
      path: normalized,
      title: "Карточка инструмента",
      eyebrow: "Инструмент",
      description: `Каркас карточки инструмента: ${slug}. Данные каталога появятся в следующих фазах.`,
      params: {
        slug
      }
    };
  }

  return ROUTES[0];
}

export function normalizePath(pathname) {
  const clean = String(pathname || "/mini-app").replace(/\/+$/, "");
  return clean || "/mini-app";
}
