# Step-by-Step Plan

Ниже не просто roadmap, а порядок, в котором этот MVP превращается в продукт.

## Step 1. Поведение бота

Цель: добиться, чтобы бот действительно вёл к ограничению, а не звучал как форма.

Что уже сделано:

- decision engine с действиями `clarify | screen | diagnose | answer`
- routing входа
- `clarification_mode`
- `diagnostic_mode`
- `website_screening_mode`
- guardrails на слабый сигнал и URL-only

Что проверять:

- бот не задаёт пустой вопрос
- бот добавляет смысл после каждого сообщения
- бот не делает внутренний диагноз бизнеса по одному сайту
- бот честно разделяет факты, наблюдения и гипотезы

## Step 2. Evals

Цель: сделать качество поведения проверяемым, а не субъективным.

Что нужно:

- golden cases для всех типов входа
- ожидаемые `route`, `mode`, `action`
- текстовые guardrails:
  - что ответ должен содержать
  - чего ответ не должен утверждать
- отдельный прогон до каждого изменения prompt/logic

Готовый старт:

- [evals/golden-cases.json](</Users/aleksandrseledcik/Library/Mobile Documents/com~apple~CloudDocs/Проект ТГ Бота/evals/golden-cases.json>)
- [src/scripts/run-evals.js](</Users/aleksandrseledcik/Library/Mobile Documents/com~apple~CloudDocs/Проект ТГ Бота/src/scripts/run-evals.js>)

## Step 3. Structured memory in DB

Цель: перейти от "чат помнит кое-что" к "есть история компании и кейсов".

Что нужно:

- `Company`
- `Case`
- `Goal`
- `Symptom`
- `Hypothesis`
- `Constraint`
- `Situation`
- `ActionWave`
- `ToolRecommendation`
- `Artifact`
- `Snapshot`
- `Thread`
- `Message`

Почему это следующий критичный шаг:

- без БД продукт не держит длинную историю компании
- нельзя строить нормальные повторные разборы
- нельзя делать операторский обзор кейсов

Готовый старт:

- [supabase/migrations/20260421_init_business_diagnostic.sql](</Users/aleksandrseledcik/Library/Mobile Documents/com~apple~CloudDocs/Проект ТГ Бота/supabase/migrations/20260421_init_business_diagnostic.sql>)

## Step 4. Live pilot

Цель: проверить не код сам по себе, а реальную полезность.

Сценарий:

- 10-15 реальных кейсов в Telegram
- минимум:
  - 3 vague cases
  - 3 URL-only cases
  - 3 конкретные диагностические кейсы
  - 3 смешанные кейсы URL + проблема
- после каждого кейса сохраняется artifact

Что смотреть:

- дошёл ли бот до ограничения
- дал ли он первый шаг
- не перегрузил ли пользователя
- хотелось ли продолжать диалог

## Step 5. Tool layer

Цель: чтобы рекомендации инструментов были не декоративными.

Что нужно:

- каталог инструментов по типам ограничений
- правила подбора по контексту
- указание:
  - зачем инструмент
  - когда его использовать
  - что не делать сейчас

## Step 6. Production layer

Цель: сделать систему надёжной.

Что нужно:

- webhook или стабильный polling runner
- логирование
- trace по кейсам
- retry и обработка ошибок
- наблюдаемость по ответам
- ручной review сложных кейсов

## Step 7. Operator layer

Цель: чтобы продукт был не только ботом, но и контуром управления.

Что нужно:

- список компаний и кейсов
- последние snapshots
- открытые ограничения
- артефакты по компаниям
- история action waves

## Порядок без лишних прыжков

Идти лучше так:

1. стабилизировать поведение через evals
2. вынести память в БД
3. прогнать live pilot
4. усилить tool layer
5. добавить операторский слой

Если перепрыгнуть через `evals` и `DB`, получится снова "чат", а не продукт.
