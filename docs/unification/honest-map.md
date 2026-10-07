# Honest-карта страниц viewer (волна U0, ME-93)

> Status: **v1.0, 2026-10-06**. Источник истины — компоненты, не планы:
> `viewer/src/app/routes.tsx` @ feat/u0-foundation (origin/main 8742248) + grep
> по `HonestLine` / `honest` / `EmptyState` / `Skeleton` / retry-веткам в
> `viewer/src/features/*`. Карта — вход волн U1–U7: страница без honest-карты
> (строки loading/empty/error) к приёмке не принимается (спека унификации
> SPEC-2026-10-07, «Глубокая проработка v12 до прода» п.1).
>
> Легенда: ✓ = есть, ✗ = нет, ◐ = частично (см. примечание).
> «HonestLine» — компонент честной строки (`components/HonestLine`);
> «honest-слоты» — честные заглушки/причины/пояснения словарём
> (WordsUnported/NotCustomizable/`*Unsupported`/честные пустоты).

## 1. Матрица страниц

| # | Маршрут | Страница | HonestLine | honest-слоты | loading | empty | error | Примечания |
|---|---|---|---|---|---|---|---|---|
| 1 | `/` | OverviewPage | ✓ (CockpitBusy/CockpitWaiting + `overview.honestyLater`) | ✓ | ✓ Cockpit-скелетоны | ✓ честные слоты «позже» | ✓ HonestLine + retry (cockpit) | Герой WellHero; U2 одевает, HonestLine main приоритетна |
| 2 | `/auth` | AuthRoutePage | ✗ | ◐ вердикты форм словарём | ✓ pending отправки | — (форма) | ✓ вердикт-строки с текстом сервера (`role=alert` в диалоге) | Боевые error-состояния — доработка U1 (спека: «заново — боевые error-состояния») |
| 3 | `/pair` | PairPage | ✗ | ◐ фазы словарём | ✓ фаза awaiting | — | ✓ фаза error + detail сервера | Вне Shell; QR-поток U1 |
| 4 | `/memory` | MemoriesPage | ✗ | ◐ EmptyState-тексты | ✓ MemoryCardSkeleton | ✓ EmptyState | ✓ EmptyState error + «Повторить» | Список/деталь master-detail |
| 5 | `/memory/search` | SearchPage | ✗ | ◐ EmptyState-тексты | ✓ SearchResultList `isLoading` | ✓ EmptyState (пустой запрос/результат) | ✓ EmptyState error + retry | |
| 6 | `/memory/pulse` | PulsePage | ✗ | ✓ (PulseFeed честные причины) | ✓ скелетоны ленты | ✓ EmptyState | ✓ retry-ветка | |
| 7 | `/memory/tags` | TagsPage (+ drill) | ✗ | ✓ (TagDrillView честная пустота) | ✓ скелетоны (TagsPage, TagDrillView) | ✓ EmptyState («под тегом ничего нет») | ✓ retry (TagDrillView, TagsPage) | |
| 8 | `/memory/:id` | MemoryDetailPage | ✗ | ◐ EmptyState-тексты | ✓ MemoryScrollSkeleton | ✓ EmptyState (запись исчезла) | ✓ retry-ветка | «stale»-состояние из 05 §2.3 — на карточке/строке, см. §3 |
| 9 | `/tasks` (канбан) | TaskBoardPage | ✗ | ✓ честные карточки/причины | ✓ TableRowSkeleton | ✓ EmptyState | ✓ EmptyState error + retry | SSE-мост в TasksLayout; task.done-хореография U3 |
| 10 | `/tasks/list` | TaskListPage | ✗ | ✓ | ✓ скелетон строк | ✓ EmptyState | ✓ retry-ветка | |
| 11 | `/tasks/activity` | TaskActivityPage | ✗ | ✓ | ✓ скелетон строк | ✓ EmptyState | ✓ `role=alert` + retry | Живой буфер SSE |
| 12 | `/tasks/inbox` | TaskInboxPage | ✗ | ✓ | ✓ скелетон строк | ✓ EmptyState | ✓ `role=alert` + retry | |
| 13 | `/tasks/archive` | TaskArchivePage | ✗ | ✗ | ✓ скелетон строк | ✓ EmptyState | ✓ retry-ветка | Единственная страница задач без honest-словаря — терминальное хранилище; U3 решает, нужен ли слот |
| 14 | `/tasks/:id` | TaskDetailPage | ✗ | ✓ | ✓ скелетон | ✓ EmptyState | ✓ retry-ветка | |
| 15 | `/agents/hosts` | HostsRosterPage | ✗ | ✓ (roster честные пустоты) | ✓ скелетоны | ✓ EmptyState | ✓ retry-ветка | |
| 16 | `/agents/execution` | ExecutionPage | ✗ | ✓ | ✓ скелетоны | ✓ EmptyState | ✓ retry-ветка | |
| 17 | `/agents/harnesses` | ExecutorRegistryPage | ✗ | ✓ | ✓ скелетоны | ✓ EmptyState | ✓ retry-ветка | |
| 18 | `/kora` | KoraPage | ✓ (KoraPult/SessionList/Workzone) | ✓ | ✓ скелетоны Workspace | ✓ EmptyState | ✓ EmptyState error + retry; **401-CTA** (KoraSignInCta) | Единственный домен с настоящим 401-гейтом; v7-каркас U5 |
| 19 | `/kora/:sessionId` | KoraSessionPage | ✓ (KoraWorkzone) | ✓ | ✓ скелетон транскрипта | ✓ EmptyState | ✓ retry + `role=alert` | |
| 20 | `/docs/:project` | DocsHubPage | ✗ | ◐ честные описания хабов | ✓ HubSkeleton | ✗ явной ветки нет | ✗ явной ветки нет | Находка: ошибка манифеста не имеет явного error-слота на хабе — U6 |
| 21 | `/docs/:project/c/:category` | DocsCategoryPage | ✗ | ◐ | ✓ RowsSkeleton | ✗ явной ветки нет | ✗ явной ветки нет | Находка: та же дыра, что у хаба — U6 |
| 22 | `/docs/:project/*` | DocsPage (статья) | ✗ | ✓ честный 404 статьи | ✓ скелетон статьи | ✓ EmptyState not-found | ✓ retry-ветка | |
| 23 | `/system/status` | StatusPage | ✓ | ✓ | ✓ StatGridSkeleton | ✓ EmptyState | ✓ retry-ветка | StatusPanel — честный свод; опрос 30s |
| 24 | `/system/settings` | SettingsHubPage | ✗ | ✓ (NotCustomizable — честная заглушка) | — (статичный хаб, данных нет) | — | — | Шесть секций-якорей; «Зеркало» настроек U6 |
| 25 | `/system/automation` | AutomationPage | ✗ | ✓ | ✓ pending-ветки (status+query) | ✓ EmptyState | ✓ EmptyState error + retry | Движок честно off (S1) |
| 26 | `/system/devices` | DevicesPage | ✗ | ✓ | ✓ скелетоны | ✓ EmptyState | ✓ retry-ветка | QR-поток U1 |
| 27 | `/system/sessions` | SessionsPage | ✓ | ✓ | ✓ TableRowSkeleton | ✓ EmptyState | ✓ retry-ветка | |
| 28 | `/system/sessions/:id` | SessionDetailPage | ✗ | ◐ | ✓ pending-блок `role=status` | ✓ EmptyState | ✓ EmptyState error + retry | |
| 29 | `/system/traces` | TracesPage | ✓ | ✓ | ✓ TableRowSkeleton | ✓ EmptyState | ✓ retry-ветка | |
| 30 | `*` (404) | NotFound | ✗ | ✓ EmptyState not-found | — | ✓ | — | |

Редиректы (не страницы, в матрицу не входят): `/docs` → `/docs/vesma-eyes`,
`/docs/c/:category` (legacy-карта), `/system` → `/system/status`,
`/agents` → `/agents/hosts`, LEGACY_ROUTES (replace-редиректы Ф1).

## 2. Сводка по колонкам

- **HonestLine (компонент)**: 5 страниц — Обзор, Кора (обе), Статус, Сессии, Трассы.
- **honest-слоты (словарь причин/заглушек)**: 23 из 30; частично — 7; полностью нет — 1 (архив задач).
- **loading**: 27 из 28 асинхронных страниц (SettingsHub статичен — не применимо).
- **empty**: 26 из 30 (у auth/pair понятия пустоты нет; у settings/404 не применимо; DocsHub/DocsCategory — находка ниже).
- **error + retry**: 24 из 28 асинхронных; без явной ветки — DocsHub, DocsCategory (находка).

## 3. Находки для волн U1–U7 (не блокеры U0)

1. **Gate-слой не подключён.** `GateScreen`/`GatedOutlet` (features/ui-token) существуют, но не используются ни одной доменной страницей — замки разделов v12 (U1) подключаются поверх этой карты.
2. **Docs-хаб и категория без error/empty-веток** (строки 20–21) — явная честная ошибка манифеста нужна в U6.
3. **Карточка памяти: состояния строки из 05 §2.3** (hover строки, selected-край, stale, live-update) живут не на MemoryCard, а на уровне списков/детали — закрываются в U4 при свиток-одевании.
4. **Архив задач** — единственная страница без honest-словаря; решение за U3 (допустимо: терминальное хранилище).
5. **`/memory/*` без HonestLine** — домен держит честность через EmptyState-словарь; при свиток-эстетике U4 решает, появляется ли HonestLine (например, в поиске/пульсе).
