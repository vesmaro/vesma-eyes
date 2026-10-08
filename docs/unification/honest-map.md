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
| 1 | `/` | OverviewPage | ✓ (CockpitBusy/CockpitWaiting + `overview.honestyLater`) | ✓ | ✓ Cockpit-скелетоны | ✓ честные слоты «позже» | ✓ HonestLine + retry (cockpit) | **U2 (2026-10-08):** колодец full-bleed (зеркало воды, паутина V1 cap 42 ≤ 300), HUD-низ — чип «Ждут всего» + ридраут + витальный кластер + тикер РЕАЛЬНОЙ шины (role=log; тихая шина = пустая строка — данные, не декор, §13.3), «Поделиться» (копия адреса), пробуждение ждёт первый кадр /api/events (раз за сессию, ввод отменяет); дыхание жил/колодца/Весмы — только внутри окна `--duration-breath`, открытого реальным событием (duty ≤25%, замирание на вводе, reduced = статичные тинты); 5-секундный тест честности — постоянный гейт `npm run honesty` (viewer/scripts/honesty-gate.mjs). HonestLine main приоритетна |
| 2 | `/auth` | AuthRoutePage | ✗ | ◐ вердикты форм словарём | ✓ pending отправки | — (форма) | ✓ вердикт-строки с текстом сервера (`role=alert` в диалоге) | U1 одел: табы-сегмент, кнопка «На борт» (07h §12), футер «версия · аноним»; ринг → `--color-focus` |
| 3 | `/pair` | PairPage | ✗ | ◐ фазы словарём | ✓ фаза awaiting | — | ✓ фаза error + detail сервера | Вне Shell; U1 одел: «На борт» во всех фазах (07h §12), футер «версия · аноним»; QR+TTL-дуга уже в main (PairingDialog) |
| 4 | `/memory` | MemoriesPage | ✗ | ◐ EmptyState-тексты | ✓ MemoryCardSkeleton | ✓ EmptyState | ✓ EmptyState error + «Повторить» | Список/деталь master-detail. **U4 (2026-10-08):** записи одеты в свиток-канон — Lora-типографика (заголовки карточек serif, display-ступень на детали), честные фильтры-статусы main без изменений; recall-импульсы домена = бусины движка на жилах Shell (реальные события, ≤2, ампла 0.08 ≤0.18) — вторых реализаций нет; 5-сек тест честности расширен на /memory (тихая шина → кадры идентичны; реальный recall-класс события двигает домен) — `npm run honesty` 7/7 |
| 5 | `/memory/search` | SearchPage | ✗ | ◐ EmptyState-тексты | ✓ SearchResultList `isLoading` | ✓ EmptyState (пустой запрос/результат) | ✓ EmptyState error + retry | **U4 (2026-10-08):** recall-вспышка «попадание в память» (15-WOW §3) — ирис-кромка 240/600ms на левом крае строк при НОВОМ запросе (список ключуется запросом; рефетч того же запроса не переигрывает), reduced = статичный тинт 1500ms; **находка аудита U4 устранена:** дыхание ириса героя было последним всегда-циклом (не гейтено шиной) — теперь только внутри окна `html[data-breath]` (контракт-тест в tokens.test) |
| 6 | `/memory/pulse` | PulsePage | ✗ | ✓ (PulseFeed честные причины) | ✓ скелетоны ленты | ✓ EmptyState | ✓ retry-ветка | **U4 (2026-10-08):** дозировка подтверждена — новых движущихся элементов не заводилось (доза домена = recall+тона; тон приходит через Shell-канву, данные ленты = main) |
| 7 | `/memory/tags` | TagsPage (+ drill) | ✗ | ✓ (TagDrillView честная пустота) | ✓ скелетоны (TagsPage, TagDrillView) | ✓ EmptyState («под тегом ничего нет») | ✓ retry (TagDrillView, TagsPage) | **U4 (2026-10-08):** дозировка подтверждена — облако/дрилл статичны вне пользовательских действий (§8.10-подход), живой слой только тональный |
| 8 | `/memory/:id` | MemoryDetailPage | ✗ | ◐ EmptyState-тексты | ✓ MemoryScrollSkeleton | ✓ EmptyState (запись исчезла) | ✓ retry-ветка | **U4 (2026-10-08):** свиток-канон — display-заголовок `--text-display` (36–44px) в Lora против 11px капс-провенанса (значения JBMono), мера чтения `--measure-scroll`; **тональный слой:** орган `scrollTone` (lazy web-tones, паттерн wellOrgan — step-движок, ноль таймеров в нейтрали) красит кромку свитка реальным тоном шины/здоровья (`--scroll-tone` + `data-tone`, кроссфейд `--duration-tone-fade` 1200ms; сирень «пришло обновление» = `--web-tone-update`, светлый столбец `#6E5A94`; muted/off — строго нейтраль). «stale» из 05 §2.3 покрыт статусами main (raw/archived бейджи) — отдельный слот не потребовался |
| 9 | `/tasks` (канбан) | TaskBoardPage | ✗ | ✓ честные карточки/причины | ✓ TableRowSkeleton | ✓ EmptyState | ✓ EmptyState error + retry | SSE-мост в TasksLayout. **U3 (2026-10-08):** живой пульт v12 одет на конструктиве W3 — темп «·N/ч» в шапке resolved-колонки (doneTransitStore, только от живой шины, без фейковых нулей), task.done-спектакль 240/600→400ms→курьер→▸N (W3, верифицирован), фасад «Ждут владельца» с золотой кромкой (confidence-класс); **новое U3** — blocked-кромка с ВИДИМОЙ человеческой причиной (⟂ + строка из данных задачи: fail/expired-назначение → его note, unrouted-очередь, пустые агенты, словарь-фолбэк; `blockedReason.ts`), дозировка движения = только task.done+курьеры (animate-pulse бейджа снят); 5-сек тест честности расширен на /tasks (тихая шина → кадры идентичны; реальный task.done → страница двигается) — `npm run honesty` 5/5 |
| 10 | `/tasks/list` | TaskListPage | ✗ | ✓ | ✓ скелетон строк | ✓ EmptyState | ✓ retry-ветка | **U3 (2026-10-08):** темп «·N/ч» в шапке раздела (тот же doneTransitStore — одна реализация, без второго счётчика; инертен до первого события шины); blocked-строки несут ту же видимую причину (статус-ячейка таблицы + мобильные card-строки — один компонент с канбаном) |
| 11 | `/tasks/activity` | TaskActivityPage | ✗ | ✓ | ✓ скелетон строк | ✓ EmptyState | ✓ `role=alert` + retry | Живой буфер SSE; U3: дозировка подтверждена — без фонового движения, диаграмма пульса анимирует только переходы по данным (§8.10) |
| 12 | `/tasks/inbox` | TaskInboxPage | ✗ | ✓ | ✓ скелетон строк | ✓ EmptyState | ✓ `role=alert` + retry | U3: дозировка подтверждена — без фонового движения |
| 13 | `/tasks/archive` | TaskArchivePage | ✗ | ✓ | ✓ скелетон строк | ✓ EmptyState | ✓ retry-ветка | **Решение U3:** слот ЕСТЬ и достаточен — EmptyState с честной подсказкой `tasks.archiveEmpty(Hint)` («в архиве пока ничего нет / задачи попадают сюда из…»); терминальному хранилищу словарь причин не нужен — карта U0 здесь устарела |
| 14 | `/tasks/:id` | TaskDetailPage | ✗ | ✓ | ✓ скелетон | ✓ EmptyState | ✓ retry-ветка | **U3:** у blocked-задачи та же видимая причина под бейджами статуса (один компонент с канбаном/списком) |
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

1. **Gate-слой не подключён.** ~~Устарело к U1: ME-043 (gates v6) уже подключил `GatedOutlet`/`GateScreen`/замки сайдбара поверх этой карты.~~ U1 добавил недостающее: мини-превью раздела в gate-странице (GatePreview — статичный набросок, без контента/блюра) и скрытие глобального поиска у анонима (07k §2.3).
2. **Docs-хаб и категория без error/empty-веток** (строки 20–21) — явная честная ошибка манифеста нужна в U6.
3. ~~**Карточка памяти: состояния строки из 05 §2.3** … закрываются в U4 при свиток-одевании.~~ Решено в U4 (2026-10-08): состояния строки несёт словарь статусов main (raw/processing/processed/published/archived бейджем на карточке и в провенансе свитка); hover/selected — конструктив списков main без регрессии; отдельный stale-слот не потребовался.
4. ~~**Архив задач** — единственная страница без honest-словаря; решение за U3 (допустимо: терминальное хранилище).~~ Решено в U3 (2026-10-08): EmptyState с честной подсказкой уже является слотом терминального хранилища, отдельный словарь не нужен (строка 13).
5. **`/memory/*` без HonestLine** — решение U4 (2026-10-08): HonestLine не вводится — все пять поверхностей уже несут полный честный матрикс (loading/empty/error +retry), дублирующий компонент не добавляет честности; строка честности остаётся у Обзора/Коры/Системы, где она объясняет СОСТОЯНИЕ ИСТОЧНИКОВ.
