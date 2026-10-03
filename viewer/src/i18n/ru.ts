/**
 * Russian dictionary — the DEFAULT language and the single source of truth
 * for translation keys (ARCHCOM-3: hand-rolled i18n, no i18next). `as const`
 * makes every key a literal type; en.ts must implement the same key set
 * (enforced by Record<TranslationKey, string>).
 *
 * Placeholders use the {{name}} form and are filled by interpolate() in
 * index.ts. Copy avoids plural forms on purpose — the layer stays tiny.
 */
export const ru = {
  // --- navigation / layout ---------------------------------------------------
  // Domain sidebar (redesign concept §2.1 — Обзор + 5 доменов).
  "nav.overview": "Обзор",
  "nav.memory": "Память",
  "nav.records": "Записи",
  "nav.record": "Запись",
  "nav.pulse": "Пульс",
  "nav.tasks": "Задачи",
  "nav.agents": "Агенты",
  "nav.kora": "Кора",
  "nav.stores": "Хранилища",
  "nav.system": "Система",
  "nav.soon": "скоро",
  // ME-072 A: честный бейдж заблокированного, но СУЩЕСТВУЮЩЕГО раздела
  // (Сессии/Трассировки отвечают роутами) — «позже», не «скоро».
  "nav.later": "позже",
  "nav.soonAgents": "домен «Агенты» появится в Фазе 4",
  "nav.soonStores": "домен «Хранилища» появится в Фазе 4",
  // UX-overhaul §6/§8: Сессии/Трассировки сняты с навигации в disabled-слоты —
  // тултип слота обещает ровно «появятся позже», ничего больше.
  "nav.soonSessions": "Сессии появятся позже",
  "nav.soonTraces": "Трассировки появятся позже",
  // Section labels (level 2 pages).
  "nav.search": "Поиск",
  "nav.memories": "Записи",
  "nav.tags": "Теги",
  // Task-domain sections (Ф2).
  "nav.task": "Задача",
  "nav.taskList": "Список",
  "nav.taskBoard": "Канбан",
  "nav.taskInbox": "Входящие",
  "nav.taskArchive": "Архив",
  "nav.status": "Статус",
  "nav.sessions": "Сессии",
  "nav.traces": "Трассировки",
  "nav.primary": "Основная навигация",
  "nav.session": "Сессия",
  "nav.collapse": "Свернуть панель",
  "nav.expand": "Развернуть панель",
  // Session-aware mode line (fix/login-feedback): the sidebar footer and the
  // overview badge state the app's CURRENT contract — read-only without a
  // ui token, control with one — instead of the static «L1 · только чтение»
  // that kept lying after login.
  "nav.modeReadOnly": "только чтение",
  "nav.modeActive": "сессия активна",
  // UI-22: paired device without an owner session — идентификация есть.
  // Scope v1 (ADR 0012 Amendment): control-устройство управляет бортом
  // (закрытые семьи — pairing/devices/auth/automation/agent-loop — остаются
  // спрятаны и серверно закрыты), read-устройство — только чтение.
  "nav.modeDevice": "устройство подключено",
  "nav.modeDeviceControl": "устройство подключено · полный доступ",
  // Sidebar version label (owner feedback: «какая версия перед глазами»).
  // {{version}} is the live server version from /api/health.
  "nav.versionAria": "Версия приложения {{version}}",
  // UI-30: the domain-row aggregate badge («Задачи») — live tooltip/SR name.
  // Deliberately noun-free (works for any future counter joined to the sum).
  "nav.newCount": "новых: {{count}}",
  // Union И1 (stand 03 §2–§3): the shell landmark label and the sidebar
  // footer affordances («Палитра» / «Шпаргалка» ride below the nav).
  "nav.sections": "Разделы",
  "nav.palette": "Палитра",
  "nav.cheatsheet": "Шпаргалка",
  "shell.skipToContent": "Перейти к содержимому",
  "shell.viewFell": "Этот вид упал в колодец",
  // Update banner (owner feedback: остывшие вкладки должны «чиниться сами»
  // — баннер появляется при выходе нового деплоя, перезагрузка по клику).
  "shell.updateAvailable": "Вышло обновление приложения",
  "shell.updateReload": "Обновить",
  "shell.tryAgain": "Попробовать снова",

  // --- breadcrumbs (concept §2.2) ----------------------------------------------
  "breadcrumbs.label": "Хлебные крошки",
  // Back control of the sticky crumb row (UI-18 spec §3.4): the visible label
  // is the bare place name; the accessible name carries the destination.
  "nav.backTo": "Назад: {{place}}",
  "nav.backFallback": "Назад",

  // --- top bar ----------------------------------------------------------------
  "topbar.themeToLight": "Переключить на светлую тему",
  "topbar.themeToDark": "Переключить на тёмную тему",
  "topbar.themeLight": "Светлая тема",
  "topbar.themeDark": "Тёмная тема",
  // В1 live-layer indicator (blueprint §6.6, canon v11 §4).
  "topbar.liveLayerAria": "Живой слой: {{state}}. Нажмите, чтобы сменить режим.",
  "topbar.liveLayerTitle": "Живой слой: live → пауза → выкл",
  "topbar.liveLive": "live",
  "topbar.liveCalm": "пауза",
  "topbar.liveOff": "выкл",
  "topbar.langLabel": "Язык интерфейса",
  // Union И1 (stand 03 §4): the topbar global search — a REAL input now;
  // Enter carries the query to /memory/search, `/` focuses the field.
  "topbar.searchPlaceholder": "Поиск по памяти и задачам…",
  "topbar.searchLabel": "Глобальный поиск по памяти и задачам",
  "topbar.openSidebar": "Открыть разделы",
  "topbar.densityToCompact": "Переключить плотность на компактную",
  "topbar.densityToComfortable": "Переключить плотность на комфортную",
  "topbar.densityCompact": "Компактная плотность",
  "topbar.densityComfortable": "Комфортная плотность",

  // --- hotkeys (Ф1 `/`+`?`; Ф2 adds the palette's ⌘K/Ctrl+K) ---------------------
  "hotkeys.title": "Горячие клавиши",
  "hotkeys.subtitle":
    "Клавиатурный слой оболочки. ⌘K работает и в полях ввода — остальные хоткеи там отключены.",
  "hotkeys.openPalette": "Открыть палитру",
  "hotkeys.openPaletteAnywhere": "Палитра — откуда угодно, даже из поля ввода",
  // Union И1 (stand 03 §7): `/` focuses the global search, `[` flips the
  // sidebar rail — both with the inInput guard (see hotkeyActions.ts).
  "hotkeys.focusSearch": "Фокус глобального поиска",
  "hotkeys.toggleSidebar": "Свернуть или развернуть сайдбар",
  "hotkeys.cheatsheet": "Эта шпаргалка",
  "hotkeys.closeDialog": "Закрыть диалог",
  "hotkeys.escKey": "Esc",
  "hotkeys.openAria": "Шпаргалка горячих клавиш",

  // --- command palette (UX-overhaul §7.3, Ф2) ------------------------------------
  "cmdk.title": "Поиск",
  "cmdk.placeholder": "Память, задачи, агенты, переход — начните вводить",
  "cmdk.openAria": "Открыть поиск",
  "cmdk.groupMemory": "Память",
  "cmdk.groupTasks": "Задачи",
  "cmdk.groupAgents": "Агенты",
  "cmdk.groupNav": "Переход",
  "cmdk.resultsLabel": "Результаты",
  "cmdk.noResults": "Ничего не нашлось по «{{query}}».",
  "cmdk.searching": "Ищем…",
  "cmdk.searchFailed": "Поиск памяти недоступен",
  "cmdk.extendedSearch": "Расширенный поиск",
  "cmdk.hintNavigate": "↑↓ — выбор",
  "cmdk.hintOpen": "Enter — открыть",
  "cmdk.hintClose": "Esc — закрыть",

  // --- overview cockpit (UX-overhaul §3, Ф2 — live blocks) ------------------------
  "cockpit.busyTitle": "Кто занят",
  "cockpit.busyAll": "Все агенты",
  "cockpit.busyOnline": "исполнителей на связи: {{online}} из {{total}}",
  "cockpit.busyWorking": "задач в работе: {{count}}",
  "cockpit.busyQueued": "в очереди: {{count}}",
  "cockpit.agentsNone": "Агентов пока нет — подключите первого",
  "cockpit.agentsNoneAction": "Подключить агента",
  "cockpit.busyError": "Не удалось получить занятость",
  "cockpit.waitingTitle": "Что ждёт меня",
  // ME-072 C: the chip renders the number and this LABEL side by side —
  // the count lives only in the numeral (no «3 … ждут вас: 3» double).
  "cockpit.waitingSummaryLabel": "ждут вас",
  "cockpit.waitingSummaryTitle": "Открыть самое срочное",
  "cockpit.waitingInbox": "Входящие: {{count}}",
  "cockpit.waitingReview": "На проверке: {{count}}",
  "cockpit.waitingQueued": "В очереди: {{count}}",
  "cockpit.waitingError": "Не удалось посчитать, что ждёт",
  "cockpit.memoryTitle": "Что в памяти",
  "cockpit.retry": "Повторить",

  // --- overview (concept §2.4 — honest Ф1 cut) -----------------------------------
  "overview.title": "Обзор",
  "overview.tagline": "взгляд внутрь себя",
  "overview.searchHint": "Нажмите / или ⌘K для поиска",
  // Well hero (blueprint §12.3): display headline + counters + HUD.
  "overview.heroTitle": "Память жива",
  "overview.heroSubtitle": "Память ваших ИИ-помощников",
  "overview.heroMemories": "записей — {{count}}",
  // Фикс-раунд W1b: счётчик честности заменяет пару «записей/тегов» —
  // он описывает ровно нарисованное (выборку) по ответившим проводам.
  "overview.heroShownOf": "показано — {{shown}} свежайших из {{total}}",
  "overview.heroShown": "показано — {{shown}}",
  // Легенда тонов (фикс-раунд W1b): строка на поверхности + полный словарь.
  "overview.legendAbout": "О цветах",
  "overview.legendProblem": "проблема",
  "overview.legendAttention": "внимание",
  "overview.legendUpdate": "обновление",
  "overview.legendToneRecall": "покой · память читают",
  "overview.legendToneWrite": "запись · ждёт подтверждения",
  "overview.legendToneSuccess": "подключение",
  "overview.legendToneWarning": "внимание (до минуты)",
  "overview.legendToneError": "проблема (пока жива)",
  "overview.legendToneUpdate": "обновление (пока не примут или не отклонят)",
  "overview.legendNote":
    "На колодце — {{shown}} свежайших записей и их связи. Связи показаны только между отображёнными записями.",
  "overview.heroTags": "тегов — {{count}}",
  "overview.waitingChip": "Ждут всего: {{count}}",
  "overview.tickerItem": "{{time}} записано в память: {{title}} · {{server}}",
  "overview.wellEmpty": "Колодец ждёт первой записи — их пишут агенты.",
  "overview.wellError": "Колодец недоступен — шина не ответила",
  // UX-overhaul §3/§8 (Ф1): Обзор ведёт в рабочие домены (Задачи/Агенты)
  // и говорит одной строкой, что ещё не живо (персона-ревью: формулировка).
  // Review P3-4: Sessions/Traces left the nav in Ф1 — the line tells the
  // owner where they live (they are reachable, just later).
  "overview.honestyLater":
    "Хранилища и метрики — в работе; сессии и трассировки появятся позже",
  "overview.storesLoading": "Загружаем состояние хранилищ",
  "overview.storesError": "Состояние хранилищ недоступно: {{message}}",
  "overview.storeOk": "работает",
  "overview.storeFail": "недоступно",
  "overview.storeDisabled": "отключено",
  "overview.storeDisabledNote": "Хранилище отключено и не участвует в выборке.",
  "overview.storeMemories": "записей — {{count}}",
  "overview.storeLatency": "отклик {{ms}} мс",
  "overview.pulseTitle": "Свежий пульс",
  "overview.pulseAll": "весь пульс",
  "overview.pulseError": "Пульс недоступен: {{message}}",
  // SCHED-1-UI: the auto-launch counter lives INSIDE the busy block now.
  "overview.autoLaunchesToday": "авто-запусков сегодня: {{count}}",

  // --- memory pulse (Ф1) ---------------------------------------------------------
  "pulse.title": "Пульс памяти",
  "pulse.loading": "Загружаем пульс",
  "pulse.loadFailed": "Не удалось загрузить пульс",
  "pulse.emptyTitle": "Пока тихо",
  "pulse.emptyMessage": "Новых записей в выбранных хранилищах нет.",
  "pulse.scopeLabel": "Область пульса",
  "pulse.scopeAll": "все хранилища",
  "pulse.feedLabel": "Лента записей пульса",
  "pulse.untitled": "без заголовка",
  "pulse.degradedStores": "Часть хранилищ не ответила: {{servers}}",
  "pulse.unavailableTitle": "Пульс недоступен в vesma-режиме",
  "pulse.unavailableMessage":
    "Пульс собирает записи со всех подключённых бордов. Сейчас приложение связано с vesma напрямую, поэтому ленте пока неоткуда взяться — подключите борд, и записи появятся.",

  // --- auth / connection --------------------------------------------------------
  "auth.localMock": "локально (mock)",
  "auth.connected": "подключено к {{backend}}: {{endpoint}}",
  "auth.degraded": "{{backend}} деградирует",
  "auth.offline": "нет соединения",
  "auth.connecting": "подключение…",
  "auth.signIn": "Войти",
  "auth.signOut": "Выйти",
  "auth.signOutAria": "Выйти из vesma",
  "auth.title": "Вход в vesma",
  "auth.title2fa": "Двухфакторная проверка",
  "auth.description":
    "Вставьте mnk_-токен доступа. Он остаётся в этом браузере и уходит только в ваш vesma.",
  "auth.description2fa": "Введите 6-значный код из приложения-аутентификатора.",
  "auth.sessionExpired": "Сессия истекла — войдите снова, чтобы продолжить.",
  "auth.tokenLabel": "Токен доступа",
  "auth.codeLabel": "Одноразовый код",
  "auth.show": "Показать",
  "auth.hide": "Скрыть",
  "auth.continueReadOnly": "Продолжить в режиме чтения",
  "auth.signingIn": "Входим…",
  "auth.verify": "Подтвердить",

  // --- auth session + gates v6 (union И1, 07k §1–§4; копии — карта И1 §1.3) ----
  "auth.status.anonymous": "аноним",
  "auth.status.signedIn": "вы: владелец",
  "auth.lock.why": "откроется после входа",
  "auth.gate.heading": "Раздел „{{domain}}“ откроется после входа",
  "auth.gate.inside.memory": "Записи, поиск по смыслу, пульс и теги — содержимое памяти",
  "auth.gate.inside.tasks": "Канбан, список, входящие и архив — работа и поручения",
  "auth.gate.inside.agents": "Исполнение, хосты и подключение новых машин",
  "auth.gate.inside.kora": "Журнал сессий всех хостов: что агент делал и говорил",
  "auth.gate.inside.system": "Статус, устройства и трассировки — служебная зона",
  "auth.gate.elsewhere": "Статистика открыта всем — она на Обзоре.",
  "auth.gate.goOverview": "Открыть Обзор",
  "auth.gate.signUp": "Создать аккаунт",
  "auth.gate.signUpNote":
    "Аккаунты создаёт владелец борта. Первый созданный аккаунт становится владельцем.",
  "auth.gate.seeMore": "Что я увижу после входа",
  "auth.gate.seeMore.memoryRecords": "Записи памяти: список, фильтры, теги",
  "auth.gate.seeMore.memorySearch": "Поиск по смыслу по всем записям",
  "auth.gate.seeMore.memoryPulse": "Пульс памяти: что добавилось и когда",
  "auth.gate.seeMore.tasksBoard": "Канбан и список ваших задач",
  "auth.gate.seeMore.tasksInbox": "Входящие: что ждёт вашего решения",
  "auth.gate.seeMore.tasksArchive": "Архив и история изменений",
  "auth.gate.seeMore.agentsHosts": "Хосты: какие машины на связи и чем заняты",
  "auth.gate.seeMore.agentsExecution": "Исполнение: кто какую работу ведёт",
  "auth.gate.seeMore.agentsConnect": "Подключение новой машины к борту",
  "auth.gate.seeMore.koraJournal": "Сессии всех хостов в одном журнале",
  "auth.gate.seeMore.koraTranscripts": "Транскрипты: что агент делал и говорил",
  "auth.gate.seeMore.koraCoverage": "Покрытие: что видно с ваших машин",
  "auth.gate.seeMore.systemStatus": "Статус борта и хранилищ памяти",
  "auth.gate.seeMore.systemSettings": "Настройки и автоматизация",
  "auth.gate.seeMore.systemDevices": "Подключённые устройства",
  "auth.gate.checkingSession": "Проверяем сессию…",
  "auth.route.back": "← На борт",
  "auth.route.alreadySignedIn": "Вы уже вошли",

  // --- search -------------------------------------------------------------------
  "search.title": "Поиск",
  "search.tagline": "взгляд внутрь себя",
  "search.placeholder": "Поиск по колодцу…",
  "search.formLabel": "Поиск по воспоминаниям",
  "search.inputLabel": "Поисковый запрос",
  "search.submit": "Искать",
  "search.submitting": "Ищем…",
  "search.typeLegend": "Тип поиска",
  "search.typeAuto": "Авто",
  "search.typeFts": "FTS",
  "search.typeSemantic": "Смысловой",
  "search.typeAutoTitle": "Ранжирование на стороне сервера",
  "search.typeFtsTitle": "Только полнотекстовые попадания (фильтр на клиенте)",
  "search.typeSemanticTitle": "Только смысловые попадания (фильтр на клиенте)",
  "search.resultsLabel": "Результаты поиска",
  "search.failed": "Не удалось выполнить поиск. Проверьте соединение и попробуйте ещё раз.",
  "search.nothing": "Ничего не нашлось",
  "search.noMatches": "По запросу «{{query}}» воспоминаний нет.",
  "search.noTypedMatches":
    "Попаданий типа {{type}} по запросу «{{query}}» нет. Возможно, конвейер ранжирует этот запрос иначе.",
  "search.noMatchesHint":
    "Попробуйте меньше или другие слова — колодец глубок, но буквален.",
  "search.hitsCount": "Найдено {{count}} по запросу «{{query}}»",
  "search.hitsTypedSuffix": " (клиентский фильтр по типу)",
  "search.relevanceTitle": "релевантность {{value}}",

  // --- memories (records list) --------------------------------------------------
  "memories.title": "Записи",
  "memories.filterLabel": "Фильтр воспоминаний",
  "memories.statusLabel": "Статус",
  "memories.projectLabel": "Проект",
  "memories.limitLabel": "На странице",
  "memories.allStatuses": "Все статусы",
  "memories.allProjects": "Все проекты",
  "memories.loading": "Загружаем воспоминания",
  "memories.loadFailed": "Не удалось загрузить воспоминания",
  "memories.noMatch": "Под эти фильтры ничего не подходит",
  "memories.noMatchHint":
    "Ослабьте фильтр по статусу или проекту, чтобы поднять больше из колодца.",
  "memories.clearFilters": "Сбросить фильтры",
  "memories.wellEmpty": "Здесь появятся записи вашей памяти",
  "memories.wellEmptyHint": "Память пишут агенты — записи появятся, когда те начнут работать.",
  "memories.prev": "Назад",
  "memories.next": "Вперёд",
  "memories.showing": "Показано {{from}}–{{to}}",
  "memories.pagesAria": "Страницы списка воспоминаний",
  "memories.all": "Все воспоминания",
  "memories.noId": "В маршруте нет id воспоминания",
  "memories.loadingOne": "Загружаем воспоминание",
  "memories.notFoundTitle": "Нет такого свитка",
  "memories.notFoundMessage": "В vesma нет воспоминания с id «{{id}}».",
  "memories.loadOneFailed": "Не удалось загрузить воспоминание",

  // --- memory card / scroll ------------------------------------------------------
  "memory.agentUnknown": "неизвестный агент",
  "memory.agentUnknownShort": "неизвестен",
  "memory.agentLabel": "агент:",
  "memory.projectLabel": "проект:",
  "memory.createdLabel": "создано:",
  "memory.confidenceTitle": "уверенность {{value}}",
  "memory.showingRaw": "Показано сырьё",
  "memory.showingEffective": "Показано очищенное",
  "memory.rawSwitch": "переключить",
  "memory.related": "Связанные воспоминания",
  "memory.idLabel": "id:",
  "memory.updatedLabel": "обновлено:",
  "memory.sourceLabel": "источник:",
  "memstatus.raw": "сырое",
  "memstatus.processing": "в обработке",
  "memstatus.processed": "обработано",
  // ME-072 C: the pulse badge carries this human explanation in
  // title/aria-label — a legend block was deliberately NOT added.
  "memstatus.processedHint": "запись прошла обработку и ждёт публикации",
  "memstatus.published": "опубликовано",
  "memstatus.publishedHint": "запись опубликована — видна в колодце и в поиске",
  "memstatus.archived": "в архиве",

  // --- tags -------------------------------------------------------------------
  "tags.title": "Теги",
  "tags.familyRowLabel": "Теги этого семейства",
  "tags.filterLabel": "Фильтр тегов",
  "tags.filterPlaceholder": "по подстроке имени…",
  "tags.loading": "Загружаем теги",
  "tags.loadFailed": "Не удалось загрузить теги",
  "tags.noMatch": "Нет подходящих тегов",
  "tags.noTags": "Теги появятся, когда в памяти будут записи с темами",
  "tags.noMatchMessage": "Ничего не подходит: «{{filter}}».",
  "tags.noTagsMessage": "Откройте память — теги проставят агенты.",
  "tags.noneInWell": "В колодце пока нет тегов.",
  "tags.memoriesCount": "воспоминаний — {{count}}",
  "tags.all": "Все теги",
  "tags.drilldownTitle": "Воспоминания с тегом",
  "tags.drilldownNote":
    "Фильтрация на клиенте — у vesma нет выборки по тегу.",
  "tags.nothingCarries": "Под этим тегом ничего нет",
  "tags.nothingCarriesMessage": "Сейчас нет воспоминаний с тегом {{tag}}.",
  // --- tags cloud (UI-17, spec 2026-09-21 §9; owner-approved copy) -----------
  "tags.statsLine": "{{count}} тегов · данные на {{time}}",
  "tags.partialData": "Данные от {{answered}} из {{total}} хранилищ",
  "tags.partialStores": "Не ответили хранилища: {{servers}}",
  "tags.family.all": "Все семейства",
  "tags.family.bare": "без префикса",
  "tags.family.tags": "{{count}} тегов",
  "tags.band.core": "Ядро · 1000+",
  "tags.band.frequent": "Частые · 100–999",
  "tags.band.middle": "Средние · 10–99",
  "tags.band.rare": "Редкие · 1–9",
  "tags.band.showAll": "Показать все {{count}}",
  "tags.band.showMore": "Ещё {{count}}",
  "tags.band.collapse": "Свернуть",
  "tags.searchMatches": "Подходит: {{count}}",
  "tags.searchCapped": "Показаны первые {{count}} — уточните запрос",
  "tags.group.heading": "Группа {{group}}",
  "tags.group.open": "Открыть группу {{group}}",
  "tags.drill.siblings": "Рядом в семействе {{family}}",
  "tags.drill.tasks": "Задачи с этим тегом",
  "tags.drill.tasksEmpty": "Задач с этим тегом нет",
  "tags.drill.memories": "Записи",
  "tags.drill.storeErrors": "Недоступны хранилища: {{servers}}",
  "tags.drill.openInMemories": "Открыть в Записях",

  // --- status -----------------------------------------------------------------
  "status.title": "Статус",
  "status.loading": "Загружаем статус",
  "status.unreachable": "vesma недоступен",
  "status.metricsBroken": "Со здоровьем порядок, с метриками — нет",
  "status.retryMetrics": "Повторить метрики",
  "status.refreshHealth": "Обновить состояние",
  "status.apiStatus": "Состояние API",
  "status.memoriesStat": "Воспоминания",
  "status.publishedDetail": "{{count}} опубликовано",
  "status.avgLatency": "Средняя задержка поиска",
  "status.avgLatencyNotReported": "в /metrics vesma нет задержки",
  "status.dlq": "Глубина DLQ",
  "status.dlqNotReported": "нет ключа dlq в /metrics",
  "status.tagsStat": "Теги",
  "status.sessionsStat": "Сессии A2A",
  "status.tracesStat": "Трассировки конвейера",
  "status.avgQuality": "Средний балл качества",
  "status.generated": "Метрики собраны",
  "status.notReported": "не сообщается",
  // UX-overhaul §6/§8 (Ф1): health показывается всегда, метрики — одна честная
  // строка (HonestLine) вместо полноэкранного EmptyState; «Борд» больше не
  // первичный текст статуса — владелец знает сервис как «сервер приложения».
  "status.metricsLater": "Метрики появятся позже — сейчас доступен статус служб",
  "status.unreachableMessage":
    "Не удалось получить состояние служб — сервер приложения не отвечает.",
  "status.healthOk": "работает",
  "status.healthDegraded": "деградация",
  "status.healthError": "ошибка",
  "status.healthUnknown": "неизвестно",
  "status.srBackendStatus": "статус: ",

  // --- sessions -----------------------------------------------------------------
  "sessions.title": "Сессии A2A",
  "sessions.loading": "Загружаем сессии",
  "sessions.loadFailed": "Не удалось загрузить сессии",
  "sessions.unavailableMnemos": "Список сессий недоступен в vesma 4.1",
  "sessions.unavailableMnemosMessage":
    "У vesma нет эндпоинта списка сессий — только POST /v1/sessions (создать) и GET /v1/sessions/{id}. Открывайте сессию по id, когда он известен.",
  "sessions.empty": "Сессий A2A пока нет",
  "sessions.emptyMessage":
    "Сессии появятся, когда агенты начнут говорить через vesma.",
  "sessions.noId": "В маршруте нет id сессии",
  "sessions.loadingOne": "Загружаем сессию",
  "sessions.notFound": "Нет такой сессии",
  "sessions.notFoundMessage": "В vesma нет сессии с id «{{id}}».",
  "sessions.loadOneFailed": "Не удалось загрузить сессию",
  "sessions.created": "создана",
  "sessions.updated": "обновлена",
  "sessions.turns": "Ходов: {{count}}",
  "sessions.ttlUntil": "ttl до {{time}}",
  "sessions.persistent": "постоянная",
  "sessions.metadata": "Метаданные",
  "sessions.transcriptsHidden": "Расшифровки ходов не отдаются",
  "sessions.transcriptsHiddenMessage":
    "vesma 4.1 возвращает только счётчики и метаданные сессии — отдельных ходов и связанных воспоминаний у него нет read-эндпоинта. Счётчик выше — честный итог.",
  "sessions.all": "Все сессии",

  // --- toasts (Ф3 mutation feedback) ---------------------------------------------
  "toasts.regionLabel": "Уведомления",
  "toasts.dismissAria": "Закрыть уведомление",

  // --- ui-token login window (Ф3, class ui; fix/login-window; ADR 0014) ------------
  "login.title": "Вход",
  "login.description":
    "Войдите с ui-токеном, чтобы изменять задачи. Значение проверяется сервером; сессия живёт в cookie этого браузера — все вкладки, один вход, 6 часов бездействия.",
  "login.continueQueued":
    "Войдите, чтобы продолжить — действие выполнится автоматически",
  // Отказ «у порога» (ADR 0014 Ф1): verify вернул отказ — ничего не сохранено.
  "login.rejected": "Сервер не принял токен — проверьте значение и попробуйте ещё раз.",
  // Отказ «в полёте» (ADR 0014 Ф2): сохранённый токен протух / сессия истекла
  // по idle-таймауту — отдельный текст, чтобы не читалось как «опечатка».
  "login.sessionExpired": "Сессия истекла — войдите ещё раз.",
  "login.fieldLabel": "Токен",
  "login.showValue": "Показать значение токена",
  "login.hideValue": "Скрыть значение токена",
  // ME-028: the guidance leads («спросите у администратора»); the kubectl
  // command is a disclosure below — still available, no longer the first thing
  // a non-admin reads.
  "login.hint": "Где взять токен: спросите у администратора кластера.",
  "login.hintCommandSummary": "Команда для администратора (kubectl)",
  "login.hintCommand":
    "kubectl -n kube-agents get secret vesmaro-eyes-ui-token -o jsonpath='{.data.VESMARO_UI_TOKEN}' | base64 -d",
  "login.continueReadOnly": "Продолжить только чтение",
  "login.submit": "Войти",
  "login.verifying": "Проверка…",
  "login.signIn": "Войти",
  "login.signOut": "Выйти",
  "login.signOutAria": "Завершить сессию на сервере (все вкладки этого браузера)",
  // Login feedback toasts (fix/login-feedback): confirm the stored token,
  // shout about the server-side 401 (alongside the inline window line).
  "login.toastSignedIn": "Вход выполнен — доступно управление",
  "login.toastLegacy":
    "Принят board-токен: отдельный ui-токен (vesmaro-eyes-ui-token) не настроен — работает legacy-режим.",
  "login.toastRejected": "Токен отклонён",
  "login.toastRejectedDetail":
    "Сервер вернул 401 — окно входа открыто, вставьте актуальное значение.",
  // UI-22 device beat, scope v1: fires only for a `read`-scope device —
  // every mutation is a server 403 verdict there. A control device
  // mutates; closed routes refuse with the server's own honest detail.
  "login.deviceForbidden": "Действия с устройства закрыты",
  "login.deviceForbiddenDetail":
    "Скоуп этого устройства — только чтение: мутации выполняются в сессии владельца.",
  "login.logoutFailed":
    "Не удалось завершить сессию на сервере — вы всё ещё вошли. Проверьте связь и повторите.",

  // --- tasks (Ф2 reads + Ф3 mutations) --------------------------------------------
  "tasks.title": "Задачи",
  "tasks.loading": "Загружаем задачи",
  "tasks.loadFailed": "Не удалось загрузить задачи",
  "tasks.unavailableTitle": "Домен «Задачи» недоступен в vesma-режиме",
  "tasks.unavailableMessage":
    "Задачи живут на борде, а приложение сейчас связано с vesma напрямую, поэтому здесь их нет. Подключите борд — и доска со списком появятся.",
  "tasks.statsLabel": "Статистика статусов по всей доске",
  "tasks.filterLabel": "Фильтр задач",
  "tasks.searchLabel": "Поиск",
  "tasks.searchPlaceholder": "по названию или id…",
  "tasks.statusLabel": "Статус",
  "tasks.allStatuses": "Все статусы",
  "tasks.priorityLabel": "Приоритет",
  "tasks.allPriorities": "Все приоритеты",
  "tasks.projectLabel": "Проект",
  "tasks.allProjects": "Все проекты",
  "tasks.agentLabel": "Агент",
  "tasks.allAgents": "Все агенты",
  "tasks.colLabel": "Колонка",
  "tasks.allColumns": "Все колонки",
  "tasks.limitLabel": "На странице",
  "tasks.noMatch": "Под эти фильтры ничего не подходит",
  "tasks.noMatchHint":
    "Ослабьте фильтры или очистите поиск, чтобы поднять больше задач.",
  "tasks.boardEmpty": "Доска пуста",
  "tasks.boardEmptyHint":
    "На борде пока нет задач — создайте первую или загляните во входящие.",
  "tasks.clearFilters": "Сбросить фильтры",
  "tasks.tableCaption": "Список задач, сгруппированный по проектам",
  "tasks.colPriority": "Приоритет",
  "tasks.colStatus": "Статус",
  "tasks.colTitle": "Заголовок",
  "tasks.colProject": "Проект",
  "tasks.colAgent": "Агент",
  "tasks.colDate": "Обновлено",
  "tasks.colActions": "Действия",
  "tasks.noProject": "без проекта",
  "tasks.reportsCountTitle": "отчётов — {{count}}",
  "tasks.loadingOne": "Загружаем задачу",
  "tasks.loadOneFailed": "Не удалось загрузить задачу",
  "tasks.noId": "В маршруте нет id задачи",
  "tasks.notFoundTitle": "Нет такой задачи",
  "tasks.notFoundMessage":
    "Задачи «{{id}}» нет на доске — возможно, она в архиве или id опечатан.",
  "tasks.goArchive": "Открыть архив",
  "tasks.editLabel": "Изменить",
  "tasks.createdLabel": "создана",
  "tasks.updatedLabel": "обновлена",
  "tasks.agentChip": "агент: {{agent}}",
  "tasks.tabsLabel": "Разделы задачи",
  "tasks.tabReports": "Отчёты",
  "tasks.tabHistory": "История",
  "tasks.tabMemory": "Память",
  "tasks.tabDetails": "Детали",
  "tasks.tabExecution": "Исполнение",

  // --- UI-31 карточка задачи: описание, связи, «Кто работал» -----------------
  "tasks.descriptionLabel": "Описание",
  "tasks.descriptionEmpty": "Описания пока нет.",
  "tasks.descriptionEmptyHint": "Добавьте его через «Изменить».",
  // ME-078: «для человека / исходник» toggle on the task card description.
  "tasks.sourceToggle.raw": "Исходник",
  "tasks.sourceToggle.human": "Для человека",
  "tasks.sourceToggleAria.raw": "Исходник: показать spec, как его видит агент",
  "tasks.sourceToggleAria.human":
    "Для человека: вернуться к нормализованному виду",
  "tasks.relatedLabel": "Связанное",
  "tasks.relatedActivity": "Активность по задаче",
  "tasks.relatedKora": "Рабочие сессии (Кора)",
  "tasks.relatedMemory": "Память задачи",
  "tasks.workersLabel": "Кто работал",
  "tasks.workersLoading": "Загружаем журнал задачи",
  "tasks.workersFailed": "Не удалось загрузить журнал задачи",
  "tasks.workersUnavailableTitle": "Журнал недоступен в этом режиме",
  "tasks.workersUnavailableMessage":
    "Этот источник данных не отдаёт журнал активности — кто работал, показать нельзя.",
  "tasks.workersPartial":
    "Показаны последние {{limit}} событий — состав может быть неполным.",
  "tasks.workersEmptyTitle": "Об исполнителе ничего не известно",
  "tasks.workersEmpty":
    "Событий по этой задаче в журнале нет — она не доходила до исполнения.",
  "tasks.workersNoAttribution":
    "Атрибуция не велась: журнал до версии 1.35 не записывал, кто работал над задачей.",
  "tasks.workersEvents": "событий: {{count}}",
  "tasks.workersLast": "последнее: {{time}}",
  "tasks.workersAgents": "Заявленные агенты",
  "tasks.workersReportsLink": "Отчёты по задаче: {{count}}",

  // --- ME-063 «Специалисты и сессии» (agents-ui-spec §6.2) --------------------
  "tasks.sessionsLabel": "Специалисты и сессии",
  "tasks.sessionsLoading": "Загружаем сессии специалистов",
  "tasks.sessionsUnavailableTitle": "Сессии недоступны в этом режиме",
  "tasks.sessionsUnavailableMessage":
    "Этот источник данных не отдаёт сессии специалистов — блок покажет их, когда борд подключён.",
  "tasks.sessionsFailed": "Не удалось загрузить сессии",
  "tasks.sessionsFailedMessage":
    "Борд не ответил на запрос сессий — повторите попытку.",
  "tasks.sessionsEmptyTitle": "Агент ещё не отчитался о сессиях",
  "tasks.sessionsEmptyMessage":
    "Сессии специалистов сообщает агент исполнителя. Пока их нет — это честное отсутствие, а не поломка: задачи, которые ведёт поллер или исполнитель без агента, сессий не дают.",
  "tasks.sessionsLive": "работает",
  "tasks.sessionsIdle": "завершилась",
  "tasks.sessionsToolCalls": "тул-каллов: {{count}}",
  "tasks.sessionsAge": "{{age}} назад",
  "tasks.sessionsExecutor": "докладал {{name}}",
  "tasks.sessionsOpenTranscript": "Открыть транскрипт",
  "tasks.sessionsReportedHint":
    "Факты — зеркальный отчёт агента (совещательный, не авторитетный); возраст считается от начала сессии.",

  // --- UI-28 «Активность» (spec 2026-09-27 §6 + row grammar §2) --------------
  "nav.taskActivity": "Активность",
  "activity.title": "Активность",
  "activity.subtitle": "Поток выполнения задач: кто, что и где шуршит",
  "activity.live": "В реальном времени",
  "activity.reconnecting": "Данные на {{time}} — переподключаемся",
  "activity.loading": "Загружаем активность",
  "activity.loadFailed": "Не удалось загрузить активность",
  "activity.retry": "Повторить",
  "activity.emptyTitle": "Активности пока нет",
  "activity.emptyMessage":
    "Как только задачи и агенты зашуршат, события появятся здесь сами.",
  "activity.emptyFiltered": "Под эти фильтры ничего не попало.",
  "activity.clearFilters": "Сбросить фильтры",
  "activity.loadMore": "Показать ещё",
  "activity.feedEnd": "Это вся глубина журнала",
  "activity.newBatch": "Новых событий: {{count}} — показать",
  "activity.type.task": "Задачи",
  "activity.type.assignment": "Исполнение",
  "activity.type.report": "Отчёты",
  "activity.filter.agent": "Агент",
  "activity.filter.host": "Хост",
  "activity.filter.task": "Задача",
  "activity.filter.label": "Фильтры",
  "activity.filter.taskPlaceholder": "id задачи…",
  "activity.filter.clearTask": "Убрать фильтр задачи",
  "activity.chart.label": "Активность за 24 часа",
  "activity.chart.barAria":
    "{{range}} — {{total}} событий: {{tasks}} задач, {{assignments}} исполнений, {{reports}} отчётов",
  "activity.chart.empty": "Событий за сутки не было",
  "activity.chart.now": "сейчас",

  "activity.feed.label": "Лента активности",
  "activity.actor.owner": "владелец",
  "activity.actor.board": "борд",
  "activity.actor.reaper": "фоновый сервис (reaper)",
  "activity.actor.sweep": "валидационный свип",
  "activity.kind.taskCreated": "создана",
  "activity.kind.taskMoved": "переведена",
  "activity.kind.taskUpdated": "правка деталей",
  "activity.kind.taskArchived": "в архиве",
  "activity.kind.taskUnarchived": "вернулась из архива",
  "activity.kind.assignmentCreated": "поручено",
  "activity.kind.assignmentClaimed": "взята в работу",
  "activity.kind.assignmentStarted": "исполнение начато",
  "activity.kind.assignmentDone": "завершено",
  "activity.kind.assignmentFailed": "провалено",
  "activity.kind.assignmentCancelled": "отменено",
  "activity.kind.assignmentExpired": "истекло",
  "activity.kind.reportIntermediate": "отчёт (промежуточный)",
  "activity.kind.reportFinal": "финальный отчёт",

  "tasks.resumeLabel": "Вернуть в работу",
  "tasks.resumeTitle":
    "UI-8: статус → in-progress, колонка не меняется (живой финальный отчёт)",
  "tasks.reportsLoading": "Загружаем отчёты",
  "tasks.reportsFailed": "Не удалось загрузить отчёты",
  "tasks.reportsEmpty": "Отчётов пока нет",
  "tasks.reportsEmptyHint": "Агенты ещё не отчитывались по этой задаче.",
  "tasks.reportsLabel": "Отчёты по задаче, хронологично",
  "tasks.reportFinal": "финальный",
  "tasks.reportIntermediate": "промежуточный",
  "tasks.reportSuperseded": "заменён",
  "tasks.reportNoAgent": "без агента",
  "tasks.historyLoading": "Загружаем историю",
  "tasks.historyFailed": "Не удалось загрузить историю",
  "tasks.historyEmpty": "История пуста",
  "tasks.historyEmptyHint": "По этой задаче пока нет событий и связанных памятей.",
  "tasks.historyLabel": "Хронология задачи",
  "tasks.historyMemory": "память",
  "tasks.history.created": "задача создана",
  "tasks.history.updated": "задача обновлена",
  "tasks.history.moved": "статус изменён",
  "tasks.history.deleted": "задача удалена",
  "tasks.history.archived": "задача в архиве",
  "tasks.history.unarchived": "задача из архива",
  "tasks.history.report": "отчёт агента",
  "tasks.history.event": "событие",
  "tasks.memoryLoading": "Загружаем связанные памяти",
  "tasks.memoryFailed": "Не удалось загрузить связанные памяти",
  "tasks.memoryEmpty": "Связанных памятей нет",
  "tasks.memoryEmptyHint": "Задача пока не ссылается на записи vesma.",
  "tasks.memoryLabel": "Связанные памяти",
  "tasks.memorySource": "источник: {{server}}",
  "tasks.memoryOpenPrompt": "Открыть запись памяти",
  "tasks.memoryUnresolved": "Неразрешённые ссылки (нет на активных серверах):",
  "tasks.detailsSummaryLabel": "Сводка",
  "tasks.detailsMetaLabel": "Метаданные",
  "tasks.detailsEnv": "Среда",
  "tasks.detailsProject": "Проект",
  "tasks.detailsSpecialists": "Специалисты",
  "tasks.detailsTags": "Теги vesma",
  "tasks.detailsMemoryIds": "Связанные памяти (id)",
  "tasks.inboxTitle": "Входящие",
  "tasks.inboxLoading": "Загружаем входящие",
  "tasks.inboxFailed": "Не удалось загрузить входящие",
  "tasks.inboxCount": "записей — {{count}}",
  "tasks.inboxRefreshed": "скан: {{time}}",
  "tasks.inboxShowAdopted": "показывать принятые",
  "tasks.inboxEmpty": "Сканирование завершено — новых задач не нашлось",
  "tasks.inboxEmptyHint":
    "Новые задачи появятся после сканирования хранилищ (кнопка «Сканировать»).",
  "tasks.inboxLabel": "Список входящих задач",
  "tasks.inboxStaleNote": "Исчезли из источника (примятие невозможно):",
  "tasks.inboxStaleLabel": "Исчезнувшие записи",
  "tasks.inboxSource": "сервер: {{server}}",
  "tasks.inboxAdoptedLink": "принята → {{id}}",
  "tasks.inboxNoSpecialist": "специалист не указан",
  // UI-25: key:value chips + expand/edit
  "tasks.inboxProjectChip": "проект: {{value}}",
  "tasks.inboxPriorityChip": "приоритет: {{value}}",
  "tasks.inboxEditedBadge": "изменено",
  "tasks.inboxExpandLabel": "Подробнее о записи",
  "tasks.inboxCollapseLabel": "Свернуть",
  "tasks.inboxDetailsLabel": "Детали записи",
  "tasks.inboxDetailsSpecialist": "специалист: {{value}}",
  "tasks.inboxDetailsCreated": "создана в источнике: {{value}}",
  "tasks.inboxDetailsMemoryId": "память: {{value}}",
  "tasks.inboxFullTextLabel": "Текст записи из памяти",
  "tasks.inboxFullTextFailed": "Не удалось загрузить запись из памяти",
  "tasks.inboxEditLabel": "Править",
  "tasks.inboxEditTitle": "Правка записи до принятия в борд",
  "tasks.inboxEditHint":
    "Правки поедут в задачу и синхронизируются в память при принятии.",
  "tasks.inboxEdit.titleLabel": "Заголовок",
  "tasks.inboxEdit.summaryLabel": "Описание (spec)",
  "tasks.inboxEdit.priorityLabel": "Приоритет",
  "tasks.inboxEdit.projectLabel": "Проект",
  "tasks.inboxEdit.save": "Сохранить правку",
  "tasks.inboxEdit.cancel": "Отмена",
  "tasks.scanLabel": "Сканировать хранилища",
  "tasks.scanBusy": "Сканируем…",
  "tasks.adoptLabel": "Принять в борд",
  "tasks.adoptAllLabel": "Принять все",
  "tasks.adoptAllConfirm": "Принять все записи в борд ({{count}})?",
  "tasks.adoptAllBusy": "Принимаем…",
  "tasks.adoptAllNone": "Нет записей для принятия",
  "tasks.archiveTitle": "Архив",
  "tasks.archiveLoading": "Загружаем архив",
  "tasks.archiveFailed": "Не удалось загрузить архив",
  "tasks.archiveFilterLabel": "Фильтр архива",
  "tasks.archiveSearchLabel": "Поиск по архиву",
  "tasks.archiveSearchPlaceholder": "по названию или сводке…",
  "tasks.archiveEmpty": "В архиве ничего нет",
  "tasks.archiveEmptyHint": "Под эти фильтры архивных задач нет — ослабьте условия.",
  "tasks.archiveLabel": "Архивные задачи",
  "tasks.archiveFrom": "архивирована из «{{col}}»",
  "tasks.unarchiveLabel": "Вернуть на доску",
  "tasks.archivePagesAria": "Страницы архива",
  "tasks.archiveRange": "Показано {{from}}–{{to}} из {{total}}",
  "tasks.archivePageEmpty": "На этой странице записей нет — вернитесь назад.",
  "tasks.status.open": "открыта",
  "tasks.status.in-progress": "в работе",
  "tasks.status.blocked": "заблокирована",
  "tasks.status.resolved": "решена",
  "tasks.status.done": "завершена",
  "tasks.status.withdrawn": "отозвана",
  "tasks.status.unknown": "неизвестно",

  // --- tasks: WF-1 kanban column titles (7 lanes; mirror server COLUMN_RU) ---------
  // ME-072 C: column labels lead with a capital (the board header + every
  // «колонка: …» / «… → …» embedding reads list-like after a colon).
  // ME-077: owner-facing renames («Открыто»→«В очереди»,
  // «Решено»→«Ждёт проверки») — the WIRE column ids never change.
  "tasks.column.backlog": "Бэклог",
  "tasks.column.validating": "На валидации",
  "tasks.column.open": "В очереди",
  "tasks.column.in-progress": "В работе",
  "tasks.column.blocked": "Блокировано",
  "tasks.column.resolved": "Ждёт проверки",
  "tasks.column.done": "Готово",

  // --- ME-077: column hints (whose action moves the card onward) -------------------
  "tasks.columnHint.backlog": "переход: владелец — поставить в работу",
  "tasks.columnHint.validating": "переход: владелец — подтвердить или вернуть",
  "tasks.columnHint.open": "переход: исполнитель — взять в работу",
  "tasks.columnHint.in-progress": "переход: исполнитель — завершить или заблокировать",
  "tasks.columnHint.blocked": "переход: исполнитель — снять блокировку",
  "tasks.columnHint.resolved": "переход: владелец — принять или вернуть исполнителю",
  "tasks.columnHint.done": "авто-архив через 3 дня · возврат вручную",

  // --- tasks: kanban board (Ф3, CV-4 — ARCHCOM-3 verdict §3) ------------------------
  "tasks.view.toggleLabel": "Вид задач",
  "tasks.view.kanban": "Канбан",
  "tasks.view.list": "Список",
  "tasks.board.label": "Канбан-доска задач",
  "tasks.board.columnLabel": "Колонка «{{col}}»",
  "tasks.board.emptyColumn": "Пусто",
  "tasks.board.noMatchColumn": "Ничего не подходит под фильтры",
  "tasks.board.archcomBadge": "archcom",
  "tasks.board.archcomTitle": "требуется решение владельца",
  "tasks.board.validatingFor": "в валидации {{hours}}ч {{minutes}}м",
  "tasks.board.validatingOverdueTitle":
    "в валидации дольше 24 часов — требуется решение владельца",
  "tasks.board.dragDisabled": "войдите для управления",
  "tasks.board.styleLabel": "Вид доски",
  "tasks.board.styleGroups": "Группы",
  "tasks.board.styleClassic": "Классика",
  // ME-077: column visibility (компакт 5 / все 7), persisted board setting.
  "tasks.board.columnsLabel": "Колонки",
  "tasks.board.columnsCompact": "5 колонок",
  "tasks.board.columnsAll": "все 7",
  "tasks.board.hiddenColumns": "Скрыто: {{cols}}",
  "tasks.board.expandColumn": "Развернуть пустую колонку «{{col}}»",
  "tasks.board.collapseColumn": "Свернуть пустую колонку «{{col}}»",

  // --- ME-074: lifecycle time labels on cards ---------------------------------------
  "tasks.card.arrived": "поступила {{date}}",
  "tasks.card.hanging": "висит {{duration}}",
  "tasks.card.completed": "завершена {{date}}",

  // --- ME-075: date filters (поступила / завершена + пресеты) -----------------------
  "tasks.date.label": "Даты",
  "tasks.date.arrivalLabel": "Поступила",
  "tasks.date.completedLabel": "Завершена",
  "tasks.date.from": "с",
  "tasks.date.to": "по",
  "tasks.date.presetToday": "Сегодня",
  "tasks.date.presetWeek": "Неделя",
  "tasks.date.presetAll": "Всё",
  "tasks.date.clear": "Очистить даты",
  "tasks.priority.critical": "критический",
  "tasks.priority.high": "высокий",
  "tasks.priority.normal": "обычный",
  "tasks.priority.low": "низкий",

  // --- tasks: edit dialog (Ф3, BE-12 force path) -----------------------------------
  "tasks.edit.title": "Изменить задачу",
  "tasks.edit.description":
    "Контентные поля задачи {{id}}. Рабочие статусы меняются отдельно (перемещение, UI-8).",
  "tasks.edit.titleLabel": "Название",
  "tasks.edit.titleError":
    "Название обязательно (1–200 символов) — пустую задачу сохранить нельзя.",
  "tasks.edit.summaryLabel": "Сводка",
  "tasks.edit.specLabel": "Спецификация",
  "tasks.edit.projectLabel": "Проект",
  "tasks.edit.envLabel": "Среда",
  "tasks.edit.priorityLabel": "Приоритет",
  "tasks.edit.specialistsLabel": "Специалисты (через запятую)",
  "tasks.edit.tagsLabel": "Теги vesma (через запятую)",
  "tasks.edit.listPlaceholder": "значение, значение…",
  "tasks.edit.cancel": "Отмена",
  "tasks.edit.submit": "Сохранить",
  "tasks.edit.lockedTitle": "Задача старше 24 часов — правка заблокирована (423)",
  "tasks.edit.lockedDetail":
    "Сервер блокирует правку контента задач старше 24 часов (BE-12). Можно изменить принудительно — правка будет помечена force=true в истории.",
  "tasks.edit.forceLabel": "Изменить принудительно",
  "tasks.edit.forceConfirm":
    "Задача старше 24 часов. Изменить принудительно (force=true)? Правка попадёт в аудит как принудительная.",

  // --- tasks: create dialog (Ф3 — direct POST /api/tasks) ---------------------------
  "tasks.create.label": "Задача",
  "tasks.create.title": "Новая задача",
  "tasks.create.description":
    "Первая строка — название, остальное — сводка. Задача создаётся сразу на борде в колонке «открыта».",
  "tasks.create.textLabel": "Сырой текст",
  "tasks.create.textPlaceholder":
    "Название задачи с первой строки…\nДальше — сводка и контекст.",
  "tasks.create.textHint": "первая строка → название (1–200), остальное → сводка",
  "tasks.create.textError":
    "Первая строка обязательна и должна быть короче 200 символов — из неё получается название.",
  "tasks.create.projectLabel": "Проект",
  "tasks.create.tagsLabel": "Теги vesma (через запятую)",
  "tasks.create.submit": "Создать задачу",

  // --- tasks: row action menu (Ф3) ---------------------------------------------------
  "tasks.menu.triggerAria": "Действия с задачей {{id}}",
  "tasks.menu.label": "Меню задачи {{id}}",
  "tasks.menu.edit": "Изменить",
  "tasks.menu.move": "Переместить…",
  "tasks.menu.archive": "Архивировать",
  "tasks.menu.archiveConfirm":
    "Архивировать {{id}}? Задачу можно будет вернуть из архива.",
  "tasks.menu.back": "Назад",

  // --- tasks: mutation toasts (Ф3) ---------------------------------------------------
  "tasks.mutation.editFailed": "Не удалось сохранить задачу",
  "tasks.mutation.saved": "{{id}}: сохранено",
  "tasks.mutation.savedDetail": "содержание задачи обновлено",
  "tasks.mutation.savedForced": "изменено принудительно (force=true)",
  "tasks.mutation.resumeFailed": "Не удалось вернуть задачу в работу",
  "tasks.mutation.resumed": "{{id}}: возвращена в работу",
  "tasks.mutation.resumedDetail": "статус in-progress · колонка не менялась",
  "tasks.mutation.moveFailed": "Не удалось переместить задачу",
  "tasks.mutation.moveInvalidTitle": "недопустимый переход: сначала в работу",
  "tasks.mutation.moveRevertedDetail": "карточка возвращена на прежнее место",
  "tasks.mutation.moved": "{{id}}: перемещена",
  "tasks.mutation.movedDetail": "колонка: {{col}}",
  "tasks.mutation.archiveFailed": "Не удалось архивировать задачу",
  "tasks.mutation.archived": "{{id}}: в архиве",
  "tasks.mutation.unarchiveFailed": "Не удалось вернуть задачу из архива",
  "tasks.mutation.unarchived": "{{id}}: возвращена на доску",
  "tasks.mutation.createFailed": "Не удалось создать задачу",
  "tasks.mutation.created": "Создана задача {{id}}",
  "tasks.mutation.openTask": "Открыть задачу",
  "tasks.mutation.adoptFailed": "Не удалось принять запись в борд",
  "tasks.mutation.adoptConflictTitle": "Запись уже принята",
  "tasks.mutation.adoptConflictDetail": "уже существует задача {{id}}",
  "tasks.mutation.adopted": "Принята в борд: {{id}}",
  "tasks.mutation.adoptBatchDone": "Записи приняты",
  "tasks.mutation.adoptBatchDetailAll": "принято записей: {{count}}",
  "tasks.mutation.adoptBatchDetailPartial":
    "принято: {{adopted}} · с ошибками: {{failed}} — детали в отчёте сервера",
  "tasks.mutation.adoptBatchFailed": "Не удалось принять записи",
  "tasks.mutation.inboxEditFailed": "Не удалось сохранить правку записи",
  "tasks.mutation.inboxEditSaved": "Правка сохранена — примётся в борд в этой версии",
  "tasks.mutation.scanFailed": "Не удалось просканировать хранилища",
  "tasks.mutation.scanDone": "Сканирование завершено",
  "tasks.mutation.scanDetail": "просмотрено записей: {{found}}, новых: {{new}}",

  // --- traces -----------------------------------------------------------------
  "traces.title": "Трассировки",
  "traces.filterLabel": "Фильтр по метке задачи",
  "traces.filterPlaceholder": "по подстроке id или имени…",
  "traces.loading": "Загружаем трассировки",
  "traces.loadFailed": "Не удалось загрузить трассировки",
  "traces.empty": "Трассировок нет",
  "traces.emptyFiltered": "Нет трассировок с меткой «{{label}}».",
  // ME-072 C: the filtered-empty state carries the one-click way out.
  "traces.clearFilter": "Сбросить фильтр",
  "traces.emptyPlain": "Конвейер ещё не записал ни одной трассировки.",
  "traces.caption": "Трассировки конвейера, новые сверху",
  "traces.colTrace": "Трассировка",
  "traces.colTaskLabel": "Метка задачи",
  "traces.colStatus": "Статус",
  "traces.colStarted": "Начало",
  "traces.colDuration": "Длительность",
  "traces.colDetails": "Подробности",
  "traces.rawJson": "Сырой JSON",
  "traces.unknownStatus": "неизвестно",

  // --- agents domain (AGW-2: assignment trigger + execution tab) -------------------
  "agents.list.label": "Поручения задачи",
  "agents.list.loading": "Загружаем поручения",
  "agents.list.failed": "Не удалось загрузить поручения",
  "agents.empty.title": "Поручений ещё нет",
  "agents.empty.message":
    "Возьмите задачу в работу — поручение встанет в очередь к исполнителю.",
  "agents.state.queued": "в очереди",
  "agents.state.claimed": "взято",
  "agents.state.running": "исполняется",
  "agents.state.done": "завершено",
  "agents.state.failed": "провал",
  "agents.state.cancelled": "отменено",
  "agents.state.expired": "истекло",
  "agents.age.queued": "в очереди {{age}}",
  "agents.age.claimed": "взято {{age}} назад",
  "agents.age.running": "пульс {{age}} назад",
  "agents.age.terminal": "завершено {{age}} назад",
  "agents.age.unitMinutes": "мин",
  "agents.age.unitHours": "ч",
  "agents.age.unitDays": "д",
  "agents.identity.reportedBy": "от {{who}} · не проверено",
  "agents.identity.tooltip": "Личность заявлена исполнителем, сервером не проверена",
  "agents.routing.resolvedRow": "маршрут: {{name}} · {{reason}}",
  "agents.routing.unmatchedRow": "ждёт исполнителя",
  "agents.routing.waitsOffline": "ждёт исполнителя (офлайн {{age}})",
  "agents.routing.previewLabel": "Превью маршрута",
  "agents.routing.previewResolved": "{{name}} · {{reason}}",
  "agents.routing.previewUnmatched":
    "Нет доступного исполнителя — поручение будет ждать в очереди",
  "agents.routing.previewWaits":
    "исполнитель сейчас не на связи — поручение подождёт его",
  "agents.routing.previewNote":
    "превью по текущим правилам маршрутизации; кто возьмёт поручение в работу, покажет факт исполнения",
  "agents.routing.reason.explicit": "целевой исполнитель",
  "agents.routing.reason.specialist": "по специалисту",
  "agents.routing.reason.taskSpecialists": "по специалистам задачи",
  "agents.routing.reason.projectDefault": "по умолчанию проекта",
  "agents.routing.reason.globalDefault": "по умолчанию",
  "agents.routing.reason.auto": "живой свободный исполнитель",
  "agents.routing.reason.unmatched": "без маршрута",
  "agents.executor.noCapabilities": "пока не назначены",
  "agents.executor.noCapabilitiesHint":
    "Умения — что хосту можно запускать. Назначьте — и задачи смогут его находить.",
  "agents.executor.neverSeen": "ни одной связи",
  "agents.executor.lastSeen": "последняя связь",
  "agents.executor.pendingReason": "ожидает подтверждения владельца",
  "agents.executor.revokedReason": "доступ отозван",
  "agents.executor.disabledReason": "выключен владельцем",
  "agents.executor.offlineReason": "не на связи — последняя связь {{age}} назад",
  "agents.executor.staleReason":
    "пульс пропущен ({{age}} назад) — дефолту нужен строго онлайн",
  "agents.executor.staleShort": "пульс пропущен — дефолту нужен строго онлайн",
  "agents.sheet.title": "Взять в работу",
  "agents.sheet.subtitle": "{{id}}: поручение встанет в очередь к исполнителю",
  "agents.sheet.specialistLabel": "Специалист",
  "agents.sheet.harnessLabel": "Харнес",
  "agents.sheet.executorLabel": "Исполнитель",
  "agents.sheet.defaultExecutor": "По умолчанию",
  "agents.sheet.defaultExecutorName": "настройка: {{name}}",
  "agents.sheet.defaultExecutorNone": "дефолт не задан — маршрут по правилам",
  "agents.sheet.cancel": "Отмена",
  "agents.sheet.submit": "Назначить",
  "agents.sheet.submitting": "Назначаем…",
  "agents.assign.open": "Взять в работу",
  "agents.assign.terminalTask":
    "Задача в терминальной колонке — создание поручений закрыто",
  "agents.assign.createFailed": "Не удалось назначить",
  "agents.assign.created": "{{id}}: назначено",
  "agents.assign.createdDetail": "поручение в очереди, ждёт поллера",
  "agents.cancel.label": "Отменить",
  "agents.cancel.confirm":
    "Исполнителю будет отправлен сигнал остановки. Отменить поручение?",
  "agents.cancel.reason": "отменено владельцем",
  "agents.cancel.sent": "{{id}}: отмена отправлена",
  "agents.cancel.sentDetail": "исполнитель получит сигнал остановки",
  "agents.cancel.failed": "Не удалось отменить поручение",
  "agents.retry.label": "Перезапустить",
  "agents.badge.title": "Исполнение: {{state}}",

  // --- agents domain: execution section (AGW-3) -----------------------------------
  "nav.agentsExecution": "Исполнение",
  "nav.systemSettings": "Настройки",
  // ME-014: the host roster («Хосты») — the section's default landing.
  // ME-072 C: agents.roster.title retired — the visible h1 reads the nav key.
  "nav.agentsHosts": "Хосты",
  "agents.roster.loading": "Загружаем ростер агентов",
  "agents.roster.failed": "Не удалось загрузить ростер",
  "agents.roster.emptyTitle": "Агентов ещё нет",
  "agents.roster.emptyMessage": "Ростер оживёт, когда подключится первый исполнитель.",
  "agents.roster.emptyAction": "Открыть «Подключение»",
  "agents.roster.hostUnknown": "хост не указан",
  "agents.roster.onlineCounter": "{{online}}/{{total}} онлайн",
  "agents.roster.idle": "простаивает",
  "agents.roster.disabledBadge": "отключён",
  "agents.roster.pendingBadge": "ожидает",
  "agents.roster.revokedBadge": "отозван",
  "agents.execution.title": "Исполнение",
  "agents.execution.emptyTitle": "Поручений нет",
  "agents.execution.emptyMessage":
    "Активных попыток исполнения сейчас нет — возьмите задачу в работу на её странице.",
  "agents.unavailableTitle": "Раздел недоступен в режиме vesma",
  "agents.unavailableMessage":
    "Исполнение — доска-нативный домен; переключитесь в режим board или mock.",
  "agents.strip.label": "Исполнители",
  "agents.strip.empty": "Нет подключённых исполнителей",
  "agents.strip.emptyHint": "Исполнители появятся, когда агент подключится",
  "agents.strip.emptyAction": "Подключить агента",
  "agents.strip.transportLocal": "локальный",
  "agents.strip.transportMesh": "через mesh",
  "agents.strip.lastSeen": "последняя связь",
  "agents.strip.error": "Не удалось загрузить реестр исполнителей",
  "agents.presence.online": "онлайн",
  "agents.presence.stale": "пульс пропущен",
  "agents.presence.offline": "не на связи",
  "agents.presence.unknown": "присутствие неизвестно",
  "agents.group.active": "активные",
  "agents.group.queued": "очередь",
  "agents.group.terminal": "терминальные за сегодня",
  "agents.filters.specialist": "специалист",
  "agents.filters.search": "поиск: задача, исполнитель…",
  "agents.row.menuAria": "Действия с поручением {{id}}",
  "agents.row.menuLabel": "Меню поручения {{id}}",
  "agents.row.openTask": "Открыть задачу",
  "agents.row.copyId": "Копировать id ({{id}})",
  "agents.timing.expiresIn": "истечёт через ~{{minutes}} мин",
  "agents.timing.noClaimStamp": "без метки взятия",
  "agents.timing.queuedNotifyHint":
    "~{{minutes}} мин без исполнителя — poller не забирает (уведомление)",
  "agents.timing.reapOverdue": "истёк — ждёт жнеца",
  "agents.timeline.created": "создано",
  "agents.timeline.claimed": "взято",
  "agents.timeline.started": "старт",
  "agents.timeline.heartbeat": "пульс",
  "agents.timeline.finished": "финиш",
  "agents.drawer.openTask": "задача {{id}} →",
  "agents.drawer.timelineLabel": "Таймлайн фаз",
  "agents.drawer.identityLabel": "Идентичность",
  "agents.drawer.identityNone": "исполнитель не заявлен",
  "agents.drawer.envelopeLabel": "Конверт запуска (реконструкция по полям API)",
  "agents.drawer.reportLabel": "Финальный отчёт",
  "agents.drawer.reportLoading": "загружаем отчёты задачи…",
  "agents.drawer.reportNone": "финального отчёта ещё нет",
  "agents.feed.label": "Лента исполнения",
  "agents.feed.listLabel": "События исполнения, новые сверху",
  "agents.feed.hint": "интерливинг поручений и отчётов",
  "agents.feed.empty": "Событий исполнения пока нет — возьмите задачу в работу",
  "agents.feed.actor": "действует: {{who}}",
  "agents.feed.created": "поручение создано",
  "agents.feed.claimed": "взято в работу",
  "agents.feed.started": "исполнение начато",
  "agents.feed.done": "завершено",
  "agents.feed.failed": "провалено",
  "agents.feed.cancelled": "отменено",
  "agents.feed.expired": "истекло",
  "agents.feed.report": "отчёт",
  "agents.stream.stale": "данные на {{time}}",
  "agents.settings.title": "Настройки",
  "agents.settings.executionTitle": "Исполнение",
  "agents.settings.executionHint":
    "Маршрут по умолчанию и запасной исполнитель (глобально; проектные переопределения — зарезервированы)",
  "agents.settings.defaultLabel": "Исполнитель по умолчанию",
  "agents.settings.fallbackLabel": "Запасной исполнитель",
  "agents.settings.none": "— не задан —",
  "agents.settings.save": "Сохранить",
  "agents.settings.saving": "Сохраняем…",
  "agents.settings.saved": "Настройки исполнения сохранены",
  "agents.settings.savedDetail": "маршрутизация новых поручений обновлена",
  "agents.settings.saveFailed": "Не удалось сохранить настройки исполнения",
  "agents.settings.meshIneligible": "mesh-транспорт — маршрутизация недоступна до R4",

  // --- agents domain: registry page /agents/harnesses (AGW-4) ----------------------
  "nav.agentsHarnesses": "Подключение",
  "agents.registry.title": "Подключение агентов",
  "agents.registry.loading": "Загружаем реестр исполнителей",
  "agents.registry.failed": "Не удалось загрузить реестр исполнителей",
  "agents.registry.band.pending": "Ожидают подтверждения",
  "agents.registry.band.active": "Подключённые",
  "agents.registry.band.revoked": "Отозванные",
  "agents.registry.approve": "Одобрить",
  "agents.registry.approveHint":
    "после одобрения включите исполнителя — маршрутизация берёт только включённых",
  "agents.registry.enable": "Включить",
  "agents.registry.disable": "Отключить",
  "agents.registry.revoke": "Отозвать",
  "agents.registry.remove": "Удалить",
  "agents.registry.capabilitiesLabel": "Умения",
  "agents.registry.capabilitiesHint":
    "Умения — что хосту можно запускать. Назначьте — и задачи смогут его находить.",
  "agents.registry.hostLabel": "хост",
  "agents.registry.revokedHint":
    "доверие не восстанавливается — зарегистрируйте исполнителя заново",

  // UXE-2: the connection lifecycle pills (07a dictionary §4) — the state
  // LIST is server-owned (meta.lifecycle.states), the HUMAN wording lives
  // here. Every pill = state + age + the next step, never a lone chip.
  "agents.lifecycle.state.provisioning": "ставится…",
  "agents.lifecycle.state.awaiting-approval": "ждёт одобрения",
  "agents.lifecycle.state.awaiting-first-report": "ждёт первый доклад",
  "agents.lifecycle.state.online": "на связи",
  "agents.lifecycle.state.silent": "молчит",
  "agents.lifecycle.state.offline": "не на связи",
  "agents.lifecycle.state.disabled": "выключен владельцем",
  "agents.lifecycle.state.revoked": "отозван",
  "agents.lifecycle.next.provisioning": "Ставим агента на машину — обычно пара минут.",
  "agents.lifecycle.next.awaiting-approval":
    "Хост зарегистрировался. Проверьте данные и одобрите.",
  "agents.lifecycle.next.awaiting-first-report":
    "Агент установлен; обычно докладывается до {{silentMax}} — проверить связь.",
  "agents.lifecycle.next.online": "Последний доклад {{age}} назад.",
  "agents.lifecycle.next.silent": "Докладов нет {{age}} — проверить связь.",
  "agents.lifecycle.next.offline": "Последняя связь {{age}} назад — проверить связь.",
  "agents.lifecycle.next.disabled": "Новые задачи не получает; доклады продолжаются.",
  "agents.lifecycle.next.revoked": "Доступ отозван. Секрет больше не действует.",
  "agents.lifecycle.reportAgo": "{{age}} назад",
  "agents.lifecycle.reportNever": "докладов ещё не было",
  "agents.lifecycle.checkLink": "Проверить связь",

  "agents.connect.label": "Как подключить внешнего агента",
  "agents.connect.step1":
    "Нажмите «Добавить исполнителя», заполните имя и харнес — свой харнес можно добавить прямо в списке.",
  "agents.connect.step2": "Создайте токен и скопируйте ОДНУ команду с экрана.",
  "agents.connect.step3":
    "Выполните её на внешней машине (VPS) — она сама установит зависимости, агента и службу.",
  "agents.connect.step4":
    "Агент появится здесь в «Ожидают подтверждения» — одобрите и включите.",
  "agents.connect.step5":
    "Дайте задачу кнопкой на карточке задачи — исполнение будет на внешней машине.",
  "agents.connect.note":
    "Команда скачивает установщик с борда (текст установщика публичный), дальнейшее — по защищённому каналу с проверкой сертификата. Токен одноразовый, живёт 15 минут.",
  "agents.connect.manual":
    "Ручной путь — deploy/poller/REMOTE-EXECUTOR.md («Путь 2 — руками», для диагностики и изолированных сетей).",
  "agents.executors.actionFailed": "Не удалось изменить исполнителя",
  "agents.executors.approved": "{{name}}: одобрен",
  "agents.executors.approvedDetail":
    "включите исполнителя — маршрутизация берёт только включённых",
  "agents.executors.enabled": "{{name}}: включён",
  "agents.executors.disabled": "{{name}}: отключён",
  "agents.executors.revokeConfirm":
    "Отозвать доступ {{name}}? Доверие не восстанавливается: состояние терминальное, исполнитель должен зарегистрироваться заново (новая запись и секрет).",
  "agents.executors.revoked": "{{name}}: доступ отозван",
  "agents.executors.revokedDetail":
    "состояние терминальное — только повторная регистрация",
  "agents.executors.deleteConfirm":
    "Удалить запись {{name}} из реестра? Удаление жёсткое: секрет исполнителя умирает вместе с записью, имя освободится для повторной регистрации; активные поручения сохранят ссылки на исполнителя.",
  "agents.executors.deleted": "{{name}}: запись удалена",

  // --- agents domain: execution polish (AGW-4) -------------------------------------
  "agents.execution.openTasks": "Открыть задачи",
  "agents.group.terminalIdle": "Последние завершённые — {{date}}",
  "agents.onboarding.label": "Как это работает",
  "agents.onboarding.body":
    "Возьмите задачу в разделе «Задачи» и нажмите на её странице «Взять в работу» — поллер подхватит поручение через ~10 секунд, и вы увидите его здесь; лента внизу наполняется событиями вживую.",

  // --- agents domain: enrollment + context menus (AGW-5 phase 2) -------------------
  "agents.menu.triggerAria": "Действия с исполнителем {{name}}",
  "agents.menu.label": "Меню исполнителя {{name}}",
  "agents.menu.copyId": "Копировать id ({{id}})",
  "agents.menu.openRegistry": "Открыть реестр",
  // AGW-6 A: проверка связи (outbound-only честность). UX-overhaul §4.4/§8 (Ф1):
  // «связь» обещало ping, которого нет — «пульс» обещает ровно то, что
  // происходит; хинт говорит, что именно сделает кнопка.
  "agents.linkcheck.trigger": "Обновить пульс",
  "agents.linkcheck.triggerHint": "Проверить, когда агент был на связи",
  "agents.linkcheck.checkForReal": "Проверить по-настоящему",
  "agents.linkcheck.verdict.never": "ещё не отвечал на опрос",
  "agents.linkcheck.verdict.online": "на связи — ответил на опрос {{age}} назад",
  "agents.linkcheck.verdict.stale": "отвечал давно — {{age}} назад",
  "agents.linkcheck.verdict.offline": "не отвечает — последний ответ {{age}} назад",
  "agents.linkcheck.verdict.revoked": "отозван — присутствие погасло",
  "agents.linkcheck.verdict.unknown": "пороги присутствия ещё не загружены",
  "agents.linkcheck.disclaimer":
    "Борд не пингует агентов (outbound-only): это возраст последнего ответа поллеру, а не доступность машины.",
  "agents.linkcheck.unitSeconds": "с",
  "agents.linktest.title": "Проверить по-настоящему — {{name}}",
  "agents.linktest.subtitle":
    "Выберите задачу — откроется «Взять в работу» с пином на «{{name}}».",
  "agents.linktest.allowlistNote":
    "Промах по allowlist — тоже валидный тест: refusal-report докажет связь не хуже успешного запуска.",
  "agents.linktest.loading": "Загружаем задачи борда",
  "agents.linktest.empty":
    "Нет задач, принимающих поручения. Создайте тестовую задачу на борде и вернитесь.",
  "agents.linktest.listLabel": "Задачи для тестового поручения",
  "agents.linktest.rowAria": "Открыть «Взять в работу» с пином на {{name}}",
  "agents.sheet.pinnedHint":
    "Пин на исполнителя: поручение дождётся его выхода на связь — отправка активна.",
  "agents.sheet.pinnedInvalidHint":
    "Запиненный исполнитель сейчас не может взять задачу — выберите «По умолчанию» или другого исполнителя.",
  // AGW-6 B: карточка настроек исполнителя (drawer)
  "agents.card.title": "Карточка исполнителя",
  "agents.card.description":
    "Настройки исполнителя: идентичность, связь, доступ, заявленные возможности",
  "agents.card.menuOpen": "Карточка настроек",
  "agents.card.sectionIdentity": "Идентичность",
  "agents.card.sectionLink": "Связь",
  "agents.card.sectionAccess": "Доступ",
  "agents.card.sectionCaps": "Возможности (заявленные)",
  "agents.card.sectionDanger": "Опасная зона",
  // UX-overhaul §4.3/§8 (Ф1): работа сверху — чем исполнитель занят СЕЙЧАС
  // (первый блок карточки), пустой ответ тоже состояние, не отсутствие блока.
  "agents.card.nowWorking": "Сейчас выполняет",
  "agents.card.nowIdle": "Свободен — задач в работе нет",
  "agents.card.allTasks": "Все задачи",
  // Служебные facts-поля уходят под свёрнутое раскрытие (персона-ревью:
  // «Служебное: харнес…» — не первичный текст карточки).
  "agents.card.techDetails": "Технические данные",
  "agents.card.nameLabel": "Имя",
  "agents.card.copyId": "Скопировать id ({{id}})",
  "agents.card.harnessLabel": "харнес",
  "agents.card.transportLabel": "транспорт",
  "agents.card.versionLabel": "версия",
  "agents.card.registeredVia": "источник",
  "agents.card.registeredAt": "регистрация",
  "agents.card.updatedAt": "обновлено",
  "agents.card.harnessNote":
    "Харнес не редактируется: это ось матча локального allowlist на машине — смена рассинхронила бы борд и poller.yaml молча. Смена харнеса = «Отозвать» + повторная регистрация.",
  "agents.card.stateApproved": "одобрен",
  "agents.card.enabledLabel": "Включён для диспетчеризации",
  "agents.card.enabledNote": "диспетчеризация = одобрен И включён",
  "agents.card.enabledPendingHint":
    "Сначала одобрите — переключатель диспетчеризации появится после одобрения.",
  "agents.card.capsPlaceholder": "роль специалиста, например researcher",
  // ME-064 «Обнаружено на хосте» (agents-ui-spec §3.1): инвентарь-дропдауны.
  "agents.card.sectionInventory": "Обнаружено на хосте",
  "agents.card.inventoryNone": "Нет данных",
  "agents.card.inventoryNoneNote":
    "Обнаружение установок умеет только агент (Go). Хост, подключённый поллером, пришлёт список после ME-056 — пусто здесь честный ответ, а не задержка.",
  "agents.card.inventorySpecialists": "специалисты",
  "agents.card.inventorySkills": "скиллы",
  "agents.card.inventoryPlugins": "плагины",
  "agents.card.inventoryInstructions": "инструкции",
  "agents.card.inventoryNoNames": "имён нет — только счётчик",
  "agents.card.inventoryOverflow": "…и ещё {{count}}",
  "agents.card.inventoryGcwShare": "из них gcw-*: {{count}}",
  "agents.card.capsInputAria": "Новая возможность",
  "agents.card.capsAdd": "Добавить",
  "agents.card.capsClear": "Очистить",
  "agents.card.capsClearConfirm":
    "Отправить пустой список возможностей? Сервер сотрёт все заявленные значения ([] — валидная операция).",
  "agents.card.capsDup": "Такая возможность уже заявлена.",
  "agents.card.capsMax": "Максимум 64 — больше сервер не примет.",
  "agents.card.capsRemoveAria": "Убрать возможность {{capability}}",
  "agents.card.capsNote":
    "Декларации для маршрутизации (owner-declared); на запуск не влияют — реальный гейт = локальный allowlist поллера.",
  "agents.card.save": "Сохранить",
  "agents.card.saved": "{{name}}: карточка сохранена",
  "agents.card.noChanges": "изменений нет",
  "agents.card.dangerNote":
    "«Отозвать» — терминально, доверие не восстанавливается; «Удалить» убирает запись — активные назначения и пины остаются.",
  "agents.card.revokedReadOnly":
    "Исполнитель отозван — карточка только для чтения, кроме удаления.",
  "agents.card.secretHint":
    "Секрет не показывается никогда: он виден один раз при регистрации. Потеряли — отзовите исполнителя и зарегистрируйте заново.",
  "agents.registry.viaEnrollment": "происхождение: enrollment-токен",
  "agents.registry.viaMachine": "происхождение: машина-токен",
  "agents.enrollment.title": "Добавить исполнителя",
  "agents.enrollment.description":
    "Создание одноразового токена подключения для удалённого исполнителя",
  "agents.enrollment.formHint":
    "Заполните карточку — получите одну команду для внешней машины. Агент установится сам и появится здесь на одобрение.",
  "agents.enrollment.label": "Название (для себя)",
  "agents.enrollment.labelPlaceholder": "например, vps-1",
  "agents.enrollment.harness": "Харнес (подсказка для команд)",
  "agents.enrollment.nameHint": "Имя исполнителя (необязательно)",
  "agents.enrollment.create": "Создать токен",
  "agents.enrollment.creating": "Создаём…",
  "agents.enrollment.createFailed": "Не удалось создать токен",
  "agents.enrollment.created": "Токен подключения создан",
  "agents.enrollment.tokenLabel": "Токен подключения",
  "agents.enrollment.tokenOnce": "Токен показывается один раз — скопируйте сейчас.",
  "agents.enrollment.copy": "Копировать",
  "agents.enrollment.copied": "Скопировано",
  "agents.enrollment.copyFailedToken":
    "Скопировать не удалось — токен остаётся видимым, выделите его вручную.",
  "agents.enrollment.copyFailed":
    "Скопировать не удалось — значение в строке, выделите вручную.",
  "agents.enrollment.copyAll": "Скопировать всё",
  "agents.enrollment.copyStepAria": "Копировать шаг {{step}}",
  "agents.enrollment.ttl": "истечёт через {{time}}",
  "agents.enrollment.state.created": "ждёт подключения",
  "agents.enrollment.state.used": "использован",
  "agents.enrollment.state.expired": "истёк",
  "agents.enrollment.state.revoked": "отозван",
  "agents.enrollment.bootstrapTitle": "На VPS выполните",
  "agents.enrollment.afterRegister":
    "После регистрации на VPS исполнитель появится выше в «Ожидают подтверждения» — проверьте происхождение и IP, затем Одобрить → Включить.",
  "agents.enrollment.usedBy": "использован: {{name}}",
  "agents.enrollment.usedIp": "IP подключения: {{ip}}",
  "agents.enrollment.done": "Готово",
  "agents.harness.addOption": "Добавить харнес…",
  "agents.harness.add": "Добавить",
  "agents.harness.adding": "Добавляем…",
  "agents.harness.addFailed": "Не удалось добавить харнес",
  "agents.harness.invalid":
    "Строчные латиница/цифры, затем точки, дефисы, подчёркивания (до 60 знаков).",

  "agents.enrollment.oneLinerHint":
    "Внешний -k безопасен: текст установщика публичен и без секретов — всё внутри ездит на запинненном CA. --url должен быть адресом, который резолвится С ЭТОЙ машины (адрес VPN-оверлея может отличаться от LAN).",
  "agents.enrollment.tokenInCopyNote":
    "При копировании полный токен попадает в буфер обмена.",
  "agents.enrollment.quotaCount": "Живых токенов: {{count}} из 3",
  "agents.enrollment.quotaFull":
    "Достигнут лимит живых токенов (3) — отзовите лишний или дождитесь TTL.",
  "agents.enrollment.manualToggle":
    "Ручной путь — диагностика / изолированные (air-gapped) установки",

  // --- AGW-11: the connect card (SSH provisioner, wave 4) -------------------

  "agents.provision.title": "Подключение по SSH",
  "agents.provision.subtitle":
    "борд сам зайдёт на машину, поставит агента и доведёт его до одобрения",
  "agents.provision.host": "Адрес машины (IP или домен)",
  "agents.provision.hostError":
    "строчные латиница/цифры/дефисы и точки — IP или FQDN без слэшей",
  "agents.provision.port": "SSH-порт",
  "agents.provision.portError": "порт — число от 1 до 65535",
  "agents.provision.name": "Имя исполнителя (необязательно)",
  "agents.provision.nameError":
    "начинается с буквы/цифры; буквы, цифры, точка, «_», «-» до 120 знаков",
  "agents.provision.authLegend": "Способ входа",
  "agents.provision.authKey": "SSH-ключ",
  "agents.provision.authAlias": "Алиас из ssh-config борда",
  "agents.provision.authPassword": "Пароль",
  // UX-overhaul §4.1 (Ф1): карточка подключения уходит под свёрнутое
  // раскрытие (П2 — конфигурация после рабочего состояния); заголовок
  // обещает действие, а не технологию.
  "agents.provision.enrollTitle": "Подключить нового агента",
  "agents.provision.authPasswordNote":
    "Вход по паролю сейчас выключен на сервере — используйте ключ.",
  "agents.provision.authAliasNote":
    "Борд войдёт по алиасу из своего ssh-config: пользователь, ключ и порт определяет конфиг. Имя пользователя отдельным полем сервер пока не принимает — используйте алиас.",
  "agents.provision.keySecret": "Приватный ключ (вставьте целиком)",
  "agents.provision.passwordSecret": "Пароль",
  "agents.provision.secretShow": "Показать ключ",
  "agents.provision.secretHide": "Скрыть ключ",
  "agents.provision.secretNote":
    "Секрет живёт только в памяти страницы до отправки: не пишется в базу, логи и события. Маскируется от посторонних глаз.",
  "agents.provision.secretError": "Для этого способа входа нужен секрет.",
  "agents.provision.passphrase": "Кодовая фраза ключа (если есть)",
  "agents.provision.harness": "Харнес (подсказка для команд)",
  "agents.provision.boardUrl": "Адрес борда для машины",
  "agents.provision.boardUrlNote":
    "https://хост[:порт], который резолвится С подключаемой машины (адрес оверлея может отличаться от браузерного).",
  "agents.provision.boardUrlError":
    "нужен строгий https://хост[:порт] без пути и параметров",
  "agents.provision.submit": "Подключить",
  "agents.provision.submitting": "Запускаем…",
  "agents.provision.submitFailed": "Не удалось запустить подключение",
  "agents.provision.queued": "Подключение {{host}} запущено",
  "agents.provision.reuseNote":
    "Повтор использует живой токен подключения из прошлой попытки",
  "agents.provision.feedTitle": "Подключение {{host}}",
  "agents.provision.close": "Скрыть",
  "agents.provision.closeAria": "Скрыть карточку подключения",
  "agents.provision.feedLoading": "Читаем состояние задания…",
  "agents.provision.feedError": "Задание недоступно: {{message}}",
  "agents.provision.feedLive": "Задание выполняется — лента обновляется сама",
  "agents.provision.funnelAria": "Шаги установки",
  "agents.provision.state.live": "выполняется",
  "agents.provision.state.done": "агент зарегистрирован",
  "agents.provision.state.failed": "ошибка",
  "agents.provision.stage.bootstrapStarted": "SSH-подключение к машине",
  "agents.provision.stage.caPinned": "Ключ доверия машины закреплён",
  "agents.provision.stage.pollerInstalled": "Агент установлен",
  "agents.provision.stage.firstHeartbeat": "Первый отклик агента",
  "agents.provision.stage.wgHandshake": "Mesh-туннель",
  "agents.provision.stage.reserved": "позже",
  "agents.provision.connectivityTitle": "Транспорт связи",
  "agents.provision.connectivityManual": "временно: ручной туннель",
  "agents.provision.connectivityMesh": "mesh",
  "agents.provision.connectivityProfile": "Профиль связности:",
  "agents.provision.connectivityLater": "позже",
  "agents.provision.logTitle": "Лента шагов",
  "agents.provision.updatedAt": "обновлено {{time}}",
  "agents.provision.errorCode": "Код: {{code}}",
  "agents.provision.expectedFingerprint": "Ожидаемый отпечаток ключа машины:",
  "agents.provision.knownHostsHint":
    "Ключ машины не совпал с закреплённым. Если машину ПЕРЕУСТАНАВЛИВАЛИ намеренно — на борде выполняется отдельная процедура re-pin (POST /api/executors/provision/host/{host}/repin). Вслепую повторять не надо: несовпадение может означать подмену (MITM).",
  "agents.provision.retry": "Повторить",
  "agents.provision.doneTitle": "Исполнитель «{{name}}» ждёт вашего одобрения",
  "agents.provision.doneLoadingRow": "Ждём появления строки в реестре…",
  "agents.provision.approvedAlready":
    "«{{name}}» уже одобрен — включите маршрутизацию в реестре",
  "agents.provision.approveIntro": "Проверьте ключ машины и подтвердите подключение.",
  "agents.provision.pasteBackLabel":
    "Последние 8 hex-символов отпечатка С САМОЙ машины",
  "agents.provision.pasteBackHint":
    "Выполните на машине: awk '{print $2}' /etc/ssh/ssh_host_ed25519_key.pub | base64 -d | sha256sum — введите последние 8 символов вывода. Кнопка разблокируется только при совпадении.",
  "agents.provision.pasteBackSkipped":
    "Ключ этой машины уже был закреплён и проверен ранее — сверка не нужна.",
  "agents.provision.hint.sshUnreachable":
    "Машина недоступна: проверьте адрес, порт и файрвол.",
  "agents.provision.hint.sshAuthFailed": "Не подошёл ключ или пароль.",
  "agents.provision.hint.sshSudoRequired":
    "Дайте пользователю passwordless sudo (NOPASSWD) или запускайте установку от root.",
  "agents.provision.hint.caUnavailable":
    "Борд не отдал свой CA — проблема на сервере борда, посмотрите его журналы.",
  "agents.provision.hint.hostKeyMismatch":
    "Ключ машины не совпал с ожидаемым — установка остановлена из соображений безопасности.",
  "agents.provision.hint.wgKeyDelivery":
    "Не удалось доставить ключи туннеля (транспорт будущего mesh-слоя — заглушка).",
  "agents.provision.hint.wgHandshake":
    "Туннель не поднялся вовремя (транспорт будущего mesh-слоя — заглушка).",
  "agents.provision.hint.bootstrapTimeout":
    "Установка затянулась и была остановлена по таймауту.",
  "agents.provision.hint.bootstrapExit":
    "Установщик завершился с ошибкой — техническая деталь ниже.",
  "agents.provision.hint.registerTimeout":
    "Агент поставился, но не зарегистрировался вовремя — проверьте его журнал на машине.",
  "agents.provision.hint.restarted":
    "Борд перезапустился во время установки — секреты живут только в памяти задания. Запустите подключение заново.",
  "agents.provision.hint.pinInvalidated":
    "Закреплённый ключ машины изменили (re-pin) — задание остановлено.",
  "agents.provision.hint.generic": "Установка не удалась — техническая деталь ниже.",

  "agents.enrollment.listTitle": "Токены подключения",
  "agents.enrollment.listHint": "живые + история",
  "agents.enrollment.listLoading": "Загружаем токены",
  "agents.enrollment.listFailed": "Не удалось загрузить токены",
  "agents.enrollment.empty": "Токенов пока не было",
  "agents.enrollment.loginHint":
    "Войдите токеном владельца — создание и статусы подключения требуют ui-токен.",
  "agents.enrollment.revoke": "Отозвать",
  "agents.enrollment.revokeConfirm":
    "Отозвать токен {{label}}? Подключение по нему станет невозможно.",
  "agents.enrollment.revoked": "Токен отозван",
  "agents.enrollment.revokeFailed": "Не удалось отозвать токен",

  // --- automation section (SCHED-1-UI, ADR 0013 §8) ------------------------------
  "nav.systemAutomation": "Автоматизация",
  "automation.title": "Автоматизация",
  "automation.unavailableTitle": "Раздел недоступен в режиме vesma",
  "automation.unavailableMessage":
    "Автоматизация — контракт борда; переключитесь в режим board или mock.",
  "automation.statusLoading": "Загружаем статус движка",
  "automation.statusFailed": "Не удалось загрузить статус",
  "automation.tabSchedules": "Расписания",
  "automation.tabHooks": "Правила",
  "automation.tabJournal": "Журнал",
  "automation.tabsLabel": "Разделы автоматизации",
  "automation.banner.engineOff": "Движок не включён",
  "automation.banner.engineOffNote":
    "Работают только ручные запуски: расписания не тикают сами, «Запустить сейчас» — рука владельца.",
  "automation.banner.killSwitch": "глобальный выключатель",
  "automation.banner.cap": "лимит в день",
  "automation.banner.usedToday": "авто-запусков сегодня",
  "automation.banner.rules": "правил",
  "automation.banner.rulesCount": "расписаний {{schedules}}, правил-хуков {{hooks}}",
  "automation.banner.settingsLink": "изменить в настройках",
  // UI-21 settings hub: the kill-switch/cap form (server contract §2).
  "automation.settings.title": "Автоматизация",
  "automation.settings.enabledLabel": "Автоматизация включена",
  "automation.settings.engineOffNote":
    "Движок пока не работает (S1): настройка сохранит решение и заработает вместе с движком.",
  "automation.settings.capLabel": "Лимит авто-запусков в день",
  "automation.settings.capHint":
    "От 1 до 1000; сегодня использовано {{used}} из {{cap}}.",
  "automation.settings.capError": "Введите целое число от 1 до 1000.",
  "automation.settings.save": "Сохранить",
  "automation.settings.saving": "Сохраняем…",
  "automation.settings.saved": "Настройки автоматизации сохранены",
  "automation.settings.savedDetail": "выключатель и дневной лимит обновлены",
  "automation.settings.saveFailed": "Не удалось сохранить настройки автоматизации",
  // UI-23 settings hub v2: sections, controls, hints and verdicts (spec §7).
  "settings.hub.navLabel": "Разделы страницы",
  "settings.hub.appearanceTitle": "Внешний вид",
  "settings.hub.behaviorTitle": "Поведение",
  "settings.hub.boardTitle": "Доска",
  "settings.hub.navigationTitle": "Навигация",
  "settings.hub.executionTitle": "Исполнение",
  "settings.hub.automationTitle": "Автоматизация",
  "settings.hub.devicesTitle": "Устройства",
  "settings.hub.devicesHint":
    "Отзыв скомпрометированного устройства и доступы к компонентам (задачи, отчёты, инбокс, уведомления) — по каждому подключённому устройству.",
  "settings.hub.devicesCta": "Управлять устройствами",
  "settings.hub.themeLabel": "Тема",
  "settings.hub.themeSystem": "Системная",
  "settings.hub.themeDark": "Тёмная",
  "settings.hub.themeLight": "Светлая",
  "settings.hub.themeHint": "«Системная» следует за настройкой вашей ОС.",
  "settings.hub.langLabel": "Язык интерфейса",
  "settings.hub.densityLabel": "Плотность строк",
  "settings.hub.densityComfortable": "Просторная",
  "settings.hub.densityCompact": "Компактная",
  "settings.hub.densityHint":
    "Рабочие списки — задачи, реестры, выдача. Поиск и память остаются просторными.",
  "settings.hub.appliesEverywhere": "Применяется сразу во всём интерфейсе.",
  "settings.hub.boardStyleLabel": "Стиль канбан-доски",
  "settings.hub.boardStyleHint": "Применится на странице Задачи → Канбан.",
  "settings.hub.motionLabel": "Анимации",
  "settings.hub.motionSystem": "Системные",
  "settings.hub.motionReduced": "Минимум",
  "settings.hub.motionHint":
    "«Минимум» отключает движение и мерцания независимо от настроек ОС.",
  // «Живой слой» (ME-071 W1a): the control is live — it drives the veins
  // background through lib/liveLayerStore. «Спокойный» is the default
  // (АРХКОМ union rule §1.6); honesty: light follows real data only.
  "settings.hub.livingLabel": "Живой слой",
  "settings.hub.livingFull": "Полный",
  "settings.hub.livingCalm": "Спокойный",
  "settings.hub.livingOff": "Выключен",
  "settings.hub.livingHint":
    "Фон-жилы дышат и красятся только реальными данными. Спокойный (по умолчанию): дыхание, тона и Весма в гнезде. Полный: ещё и импульсы и полёты Весмы.",
  // Весма, смотритель гнезда (ME-071 W2): her lines. Жаргон-норма ME-078:
  // zero ids in the phrases — {task} is the human notification title only.
  "living.vesma.intro": "Я Весма, смотрю за памятью.",
  "living.vesma.done": "Есть решение по «{{task}}» — ждёт вас.",
  "living.vesma.doneGeneric": "Работа закончилась — результат ждёт в задачах.",
  "living.vesma.report": "По «{{task}}» пришёл отчёт.",
  "living.vesma.expired": "Поручение по «{{task}}» не завершилось — посмотрите.",
  "living.vesma.health": "Память отвечает хуже обычного — посмотрите здоровье.",
  "living.vesma.healthOk": "Связь с памятью восстановлена.",
  "living.vesma.provision": "Устройство подключить не вышло — смотрите в подключениях.",
  "living.vesma.gotIt": "Понятно",
  "settings.hub.sidebarLabel": "Сайдбар",
  "settings.hub.sidebarExpanded": "Развёрнут",
  "settings.hub.sidebarCollapsed": "Свёрнут",
  "settings.hub.sidebarHint": "Меняется и кнопкой на самом сайдбаре.",
  "settings.hub.onboardingReplay": "Показать подсказку «Как это работает» снова",
  "settings.hub.onboardingReplayed":
    "Подсказка снова развернётся на странице Исполнение.",
  "settings.hub.notCustomizable": "Что не настраивается",
  "settings.hub.verdict.fonts":
    "Типографика — одна пара шрифтов и одна шкала: целостность важнее выбора.",
  "settings.hub.verdict.contemplative":
    "Поиск и память остаются просторными независимо от плотности — это дизайн-решение.",
  "settings.hub.verdict.viewRoute":
    "«Канбан» и «Список» — маршруты, а не настройка: адрес страницы и есть выбор.",
  "settings.hub.verdict.domains":
    "Состав и порядок разделов сайдбара фиксированы — карта продукта видна целиком.",
  "settings.hub.verdict.groups":
    "Свёрнутость групп проектов запоминается по каждому проекту — это состояние, не настройка.",
  "settings.hub.verdict.dnd":
    "Перетаскивание карточек — основной способ управления доской.",
  "settings.hub.verdict.filters":
    "Фильтры и поиск — часть адреса страницы (?project=&q=), их можно сохранить в закладку.",
  "settings.hub.verdict.panels":
    "Панели терминала и ленты сворачиваются на месте на странице Исполнение — состояние запоминается.",
  "settings.hub.verdict.confirms":
    "Подтверждения опасных действий всегда включены — это защита ваших данных.",
  "settings.hub.verdict.scrolls":
    "Прокрутка страниц целиком с возвратом позиции по «Назад» зафиксирована.",
  "settings.hub.verdict.updateBanner":
    "Страница никогда не перезагружается сама — о новой версии сообщает спокойный баннер.",
  "settings.hub.verdict.hotkeys":
    "Горячие клавиши фиксированы: «/» — поиск, «?» — подсказка.",
  "settings.hub.verdict.search":
    "Глобальный поиск — единый вход в память: его поведение — часть структуры, а не настройка.",
  "settings.hub.verdict.crumbs":
    "Хлебные крошки — навигационный контекст маршрута; их отключение ломает ориентирование.",
  "automation.listLoading": "Загружаем",
  "automation.listFailed": "Не удалось загрузить список",
  "automation.schedule.create": "Новое расписание",
  "automation.schedule.title": "Новое расписание",
  "automation.schedule.subtitle":
    "Создаётся выключенным — включение отдельным шагом; тик — только после включения движка",
  "automation.schedule.empty": "Расписаний нет",
  "automation.schedule.emptyHint":
    "Создайте расписание — ручной запуск работает сразу, автоматический ждёт движок (S2).",
  "automation.hook.create": "Новое правило",
  "automation.hook.title": "Новое правило-хук",
  "automation.hook.subtitle":
    "Событие (on) + условия + действие; создаётся выключенным",
  "automation.hook.empty": "Правил нет",
  "automation.hook.emptyHint":
    "Создайте правило на событие борда — действие сработает при включении.",
  "automation.hook.noCondition": "без условий",
  "automation.rule.enabled": "включено",
  "automation.rule.disabled": "выключено",
  "automation.rule.enable": "Включить",
  "automation.rule.disable": "Выключить",
  "automation.rule.delete": "Удалить",
  "automation.rule.runNow": "Запустить сейчас",
  "automation.rule.runNowTitle":
    "Ручной запуск: поручение создаётся сразу, мимо движка и лимитов",
  "automation.rule.dailyAt": "ежедневно в {{at}}",
  "automation.rule.everyInterval": "каждые {{interval}}",
  "automation.form.nameLabel": "Название",
  "automation.form.taskLabel": "Задача",
  "automation.form.specialistLabel": "Специалист",
  "automation.form.harnessLabel": "Харнес",
  "automation.form.triggerKindLabel": "Запуск",
  "automation.form.triggerDaily": "ежедневно",
  "automation.form.triggerInterval": "по интервалу",
  "automation.form.triggerAtLabel": "время (HH:MM)",
  "automation.form.triggerEveryLabel": "интервал",
  "automation.form.scheduleTriggerNote":
    "У расписания условие — это триггер: время или интервал; крон-синтаксиса нет.",
  "automation.form.conditionLabel": "Условия",
  "automation.form.conditionNote":
    "Условия собираются из серверного словаря — поля, операторы и значения приходят с борда.",
  "automation.form.clausesLabel": "Условия правила",
  "automation.form.fieldLabel": "Поле",
  "automation.form.opLabel": "Оператор",
  "automation.form.valueLabel": "Значение",
  "automation.form.addClause": "Добавить",
  "automation.form.addClauseTitle": "Добавить условие из словаря",
  "automation.form.removeClause": "Убрать условие {{clause}}",
  "automation.form.noValueEnum":
    "У этого поля нет закрытого набора значений — условие недоступно в v1.",
  "automation.form.onLabel": "Событие (on)",
  "automation.form.actionLabel": "Действие",
  "automation.form.create": "Создать",
  "automation.field.taskCol": "колонка задачи",
  "automation.field.taskPriority": "приоритет задачи",
  "automation.field.taskProject": "проект задачи",
  "automation.field.taskStatus": "статус задачи",
  "automation.field.raw": "поле условия",
  "automation.journal.empty": "Запусков нет",
  "automation.journal.emptyHint": "Журнал пуст — запустите правило руками.",
  "automation.journal.launched": "запущено",
  "automation.journal.skipped": "пропущено",
  "automation.journal.missed": "пропущено (окно)",
  "automation.journal.assignment": "поручение #{{id}} →",
  "automation.journal.more": "Ещё",
  "automation.journal.moreFailed": "Не удалось догрузить журнал",
  "automation.mutation.disabledNote":
    "Изменения недоступны без ui-токена — раздел открыт только для чтения.",
  "automation.mutation.createFailed": "Не удалось создать правило",
  "automation.mutation.patchFailed": "Не удалось изменить правило",
  "automation.mutation.deleteFailed": "Не удалось удалить правило",
  "automation.mutation.deleteConfirm":
    "Удалить правило «{{name}}»? Имя останется занятым (мягкое удаление с retention) — создать правило с тем же именем нельзя.",
  "automation.mutation.deleted": "«{{name}}» удалено",
  "automation.mutation.retainedNote": "мягкое удаление: строка сохранена выключенной",
  "automation.mutation.created": "«{{name}}» создано (выключено)",
  "automation.mutation.runFailed": "Не удалось запустить",
  "automation.mutation.launched": "«{{name}}»: запущено",
  "automation.mutation.launchedDetail":
    "поручение в очереди задачи {{id}} — смотрите «Исполнение»",
  "automation.mutation.skipped": "«{{name}}»: пропущено",
  "automation.mutation.skippedDetail": "запуск отказан — причина в журнале",

  // --- docs section (ADR 0015/0016, contract 2026-09-23 §§4–6) ---------------------
  "nav.docs": "Документация",
  "docs.cat.product": "О продукте",
  "docs.catDesc.product": "Что такое vesma и vesma-eyes: концепции и словарь.",
  "docs.cat.gettingStarted": "Начало работы",
  "docs.catDesc.gettingStarted":
    "Развёртывание борда и первый вход — с нуля до рабочего места.",
  "docs.cat.board": "Доска и группы",
  "docs.catDesc.board":
    "Группы проектов и канбан-доска: структура и повседневная работа с задачами.",
  "docs.cat.agents": "Агенты и поручения",
  "docs.catDesc.agents": "Поручения, исполнители и отчёты об исполнении.",
  "docs.cat.automation": "Автоматизация",
  "docs.catDesc.automation": "Правила и расписания — без крон-синтаксиса.",
  "docs.cat.devices": "Устройства и подключение",
  "docs.catDesc.devices": "Подключение устройства к борду по QR-коду.",
  "docs.cat.security": "Безопасность и токены",
  "docs.catDesc.security": "Токены доступа, их выдача и ротация.",
  "docs.cat.maintenance": "Обслуживание",
  "docs.catDesc.maintenance":
    "Бэкап, обновление и диагностика — что делать, когда что-то пошло не так.",
  "docs.cat.faq": "Частые вопросы",
  "docs.catDesc.faq": "Короткие ответы на частые вопросы.",
  // Imported hubs (contract §4 — формулировки по спеке хабов §2).
  "docs.cat.mnemosUser": "Пользователю",
  "docs.catDesc.mnemosUser":
    "Установка, первый прогон, синхронизация и справочники — повседневная работа с сервером памяти.",
  "docs.cat.mnemosAdmin": "Администратору",
  "docs.catDesc.mnemosAdmin":
    "Безопасность, федерация и операционные ранбуки для администратора vesma.",
  "docs.cat.mnemosArchitecture": "Архитектура",
  "docs.catDesc.mnemosArchitecture":
    "Обзор устройства mnemos: гибридная память и поверхности управления.",
  "docs.cat.meshUser": "Пользователю",
  "docs.catDesc.meshUser": "Запуск узла vesma-mesh и настройка федерации.",
  "docs.cat.meshAdmin": "Администратору",
  "docs.catDesc.meshAdmin": "Эксплуатация и безопасность узла vesma-mesh.",
  "docs.cat.apiOverview": "Обзор хаба",
  "docs.catDesc.apiOverview": "Что здесь живёт, карта API проектов и правило свежести.",
  "docs.cat.apiBoard": "API борда",
  "docs.catDesc.apiBoard":
    "Референс HTTP API vesma-eyes, сгенерированный из OpenAPI-снапшота.",
  "docs.cat.apiMnemos": "HTTP API vesma",
  "docs.catDesc.apiMnemos":
    "Карта поверхностей сервера памяти и контракт A2A-сессий.",
  "docs.cat.apiAgent": "Протокол vesmaro-agent",
  "docs.catDesc.apiAgent":
    "Проводной протокол агента и выжимка service charter v2.",
  "docs.cat.apiMesh": "vesma-mesh",
  "docs.catDesc.apiMesh":
    "Публичного HTTP API нет — внутренний протокол и поверхность оператора.",
  "docs.search.placeholder": "Поиск по документации",
  "docs.search.ariaLabel": "Поиск по документации",
  "docs.search.resultsLabel": "Результаты поиска",
  "docs.search.indexing": "Индексируется…",
  "docs.search.noResults": "По запросу «{{query}}» ничего не найдено",
  "docs.search.noResultsHint":
    "Попробуйте одно слово: «токен» вместо «ротация токенов»",
  "docs.search.localeHint":
    "Некоторые страницы доступны только на одном языке — переключите язык интерфейса (RU|EN в шапке).",
  "docs.toc.title": "На этой странице",
  "docs.prev": "Предыдущая",
  "docs.next": "Следующая",
  "docs.prevNextNav": "Навигация по страницам",
  "docs.badge.verified": "актуально для v{{version}}",
  "docs.localeOriginal": "На языке оригинала ({{lang}})",
  "docs.lang.ru": "русский",
  "docs.lang.en": "английский",
  "docs.provenance.badge": "из {{repo}}@{{sha}} · синхр. {{date}}",
  "docs.provenance.full":
    "Импортировано из репозитория {{repo}}, коммит {{sha}}, синхронизировано {{date}}",
  "docs.provenance.multiSource": "источников: {{count}} · свежее {{date}}",
  "docs.provenance.multiSourceFull":
    "Страницы хаба синхронизированы из {{count}} репозиториев по пинам; самая свежая синхронизация {{date}} — пин каждой страницы на её бейдже",
  "docs.hub.start": "С чего начать",
  "docs.hub.categories": "Категории",
  "docs.hub.vesmaroEyes.lede":
    "Справочник по борду: от первого запуска до обновления — доска, агенты, токены и обслуживание.",
  "docs.hub.mnemos.lede":
    "Сервер памяти для ИИ-агентов: колодец записей, поиск по смыслу и хранилище под контрактом тегов. Здесь — руководства пользователя и администратора и обзорная архитектура.",
  "docs.hub.mnemosMesh.lede":
    "Федерация хранилищ: поднять узел vesma-mesh, настроить канал и эксплуатировать связку двух инстансов.",
  "docs.hub.api.lede":
    "API экосистемы в одном месте: референс борда из OpenAPI-снапшота, HTTP-поверхность vesma, протокол vesmaro-agent и заметка про mesh. Каждая страница синхронизирована из источника — пин и дата на бейдже.",
  "docs.hub.coverage.both": "Доступно на русском и английском",
  "docs.hub.coverage.ru": "Доступно на русском",
  "docs.hub.coverage.en": "Доступно на английском",
  "docs.hub.coverage.mixed": "Частично переведено (ru+en)",
  "docs.copy.code": "Скопировать код",
  "docs.copy.done": "Код скопирован",
  "docs.mermaid.renderFailed":
    "Диаграмму не удалось отрисовать — показан исходный код.",
  "docs.notFound.title": "Такой страницы нет",
  "docs.notFound.message": "Проверьте адрес или вернитесь к списку категорий.",
  "docs.notFound.cta": "Открыть документацию",
  "docs.error.title": "Не удалось показать страницу",
  "docs.loading": "Загрузка…",
  "docs.pages.one": "{{count}} страница",
  "docs.pages.few": "{{count}} страницы",
  "docs.pages.many": "{{count}} страниц",

  // --- shared empty/error ----------------------------------------------------------
  "common.retry": "Повторить",
  // UX-overhaul §7.2 (Ф1): сырой текст ошибки — только под раскрытием.
  "common.techDetails": "Технические подробности",

  // --- UI-27: TextEngine (авторский текст — markdown-движок) ------------------------
  "text.showFull": "Показать полностью",
  "empty.offlineNote":
    "Если вы работаете с живым vesma — проверьте, что API поднят и что dev-прокси (/api → vesma) доступен. В разработке запросы из браузера остаются под CORS.",
  "app.loadingView": "Загружаем раздел",
  // ME-072 A: единый 404-паттерн (эталон — задачный: объяснение + действие).
  "app.notFoundTitle": "Нет такой страницы",
  "app.notFoundMessage": "Такого пути в колодце нет — адрес устарел или опечатан.",
  "app.notFoundAction": "Вернуться к обзору",

  // --- CV-7: QR-пейринг и устройства (ADR 0012) ------------------------------------
  "nav.devices": "Устройства",

  // Диалог «Подключить устройство» (владельческая сторона, §2.1–§2.4).
  "pairing.title": "Подключить устройство",
  "pairing.description":
    "Диалог QR-пейринга: создайте код, отсканируйте его устройством и подтвердите запрос после сверки четырёх цифр.",
  "pairing.creating": "Создаём пейринг…",
  "pairing.createFailed": "Не удалось создать пейринг",
  "pairing.confirmFailed": "Не удалось подтвердить пейринг",
  "pairing.denyFailed": "Не удалось отклонить пейринг",
  "pairing.cancelFailed": "Не удалось отменить пейринг",
  "pairing.qrTitle": "Отсканируйте QR устройством",
  "pairing.qr.hint": "Нет камеры? Код ниже вводится вручную на устройстве.",
  "pairing.qr.loading": "Загружаем QR…",
  "pairing.codeLabel": "Код подключения",
  "pairing.codeHint":
    "Ручной ввод: откройте на устройстве страницу /pair и введите этот код.",
  "pairing.copy": "Копировать",
  "pairing.copied": "Скопировано",
  "pairing.copyFailed": "Скопировать не удалось — код в строке, выделите вручную.",
  "pairing.waitingScan": "Ждём сканирования…",
  "pairing.ttl": "истечёт через {{time}}",
  "pairing.expiredShort": "истёк — начните заново",
  "pairing.cancel": "Отменить",
  "pairing.requestTitle": "Запрос подключения",
  "pairing.requestHint":
    "Устройство отсканировало код. Сверь четыре цифры с его экраном и подтверди.",
  "pairing.unverified": "не проверено",
  "pairing.sourceIp": "IP устройства",
  "pairing.noDeviceName": "без имени",
  "pairing.verifyLabel": "Код подтверждения",
  "pairing.verifyHint":
    "Четыре цифры — сверка экранов, не пароль: они должны совпадать на обоих устройствах.",
  "pairing.approve": "Подтвердить",
  "pairing.deny": "Отклонить",
  "pairing.confirmedTitle": "Устройство подтверждено",
  "pairing.confirmedMessage":
    "Токен выдастся при следующем обмене устройства — запись появится в списке устройств.",
  "pairing.deniedTitle": "Запрос отклонён",
  "pairing.deniedMessage": "Устройство не получит токен, код погашен.",
  "pairing.cancelledTitle": "Пейринг отменён",
  "pairing.expiredTitle": "Пейринг истёк — начните заново",
  "pairing.expiredMessage": "Код живёт 3 минуты. Создайте новый пейринг.",
  "pairing.revokedTitle": "Пейринг отозван",
  "pairing.failedTitle": "Пейринг не создан",
  "pairing.restart": "Начать заново",
  "pairing.done": "Готово",

  // Страница «Устройства» (/system/devices, §10.2).
  "pairing.devices.title": "Устройства",
  "pairing.devices.listLabel": "Спаренные устройства",
  "pairing.devices.loading": "Загружаем устройства…",
  "pairing.devices.failed": "Не удалось загрузить устройства",
  "pairing.devices.loginHint":
    "Список устройств требует сессии владельца — войдите, чтобы видеть подключённые устройства.",
  "pairing.devices.empty": "Пока нет спаренных устройств",
  "pairing.devices.emptyHint":
    "Подключите телефон или планшет: «Подключить устройство» → QR → подтверждение.",
  "pairing.devices.state.active": "активно",
  "pairing.devices.state.expired": "истекло",
  "pairing.devices.state.revoked": "отозвано",
  "pairing.devices.created": "подключено",
  "pairing.devices.lastIp": "последний IP",
  "pairing.devices.expires": "скользящий TTL до",
  "pairing.devices.hardExpires": "жёсткий до",
  "pairing.devices.revoke": "Отозвать",
  "pairing.devices.revokeConfirm":
    "Отозвать «{{name}}»? Отзыв необратим — устройству понадобится новый пейринг.",
  "pairing.devices.revoked": "Устройство отозвано",
  "pairing.devices.revokeFailed": "Не удалось отозвать устройство",
  // Пер-устройственные гранулы (Amendment §A.7 — «давать и забирать
  // доступы к компонентам»; глобальные read всегда открыты, свитча нет).
  "pairing.devices.grantsExpand": "Показать доступы к компонентам",
  "pairing.devices.grantsCollapse": "Скрыть доступы к компонентам",
  "pairing.devices.grantsTitle": "Доступы к компонентам",
  "pairing.devices.grantsHint":
    "Чтение всегда открыто; переключатель выдаёт или забирает мутации компонента — действует сразу, без переподключения.",
  "pairing.devices.granule.tasks": "Задачи",
  "pairing.devices.granule.reports": "Отчёты",
  "pairing.devices.granule.inbox": "Инбокс",
  "pairing.devices.granule.notifications": "Уведомления",
  "pairing.devices.grantOn": "выдано",
  "pairing.devices.grantOff": "закрыто",
  "pairing.devices.grantsSaved": "Доступы обновлены",
  "pairing.devices.grantsFailed": "Не удалось обновить доступы",
  "pairing.unsupportedTitle": "Пейринг недоступен в этом режиме",
  "pairing.unsupportedMessage":
    "Домен устройств говорит на merge-API борда; в режиме прямого vesma этой страницы нет.",

  // Страница устройства (/pair, §2.3 — без аутентификации).
  "pair.title": "Подключение устройства",
  "pair.intro": "Введите код подключения с экрана владельца и имя устройства.",
  "pair.codeLabel": "Код подключения",
  "pair.codeInvalid": "Код не может быть пустым",
  "pair.nameLabel": "Имя устройства",
  "pair.defaultName": "Браузер {{platform}}",
  "pair.platformUnknown": "без платформы",
  "pair.connect": "Подключить",
  "pair.connecting": "Подключаем…",
  "pair.verifyingTitle": "Код принят — подтвердите на доверенной стороне",
  "pair.verifyHint":
    "Покажите владельцу эти четыре цифры и дождитесь подтверждения на его экране.",
  "pair.waitHint":
    "Проверим ещё раз автоматически через минуту; кнопка работает и вручную.",
  "pair.checkNow": "Проверить",
  "pair.checking": "Проверяем…",
  "pair.linkedTitle": "Устройство подключено — привязано к этому браузеру",
  "pair.boundNote":
    "Токен сохранён на этом устройстве, копировать его никуда не нужно. Кнопка ниже — только для переноса в другое приложение.",
  "pair.tokenLabel": "Токен устройства",
  "pair.copyToken": "Скопировать токен",
  "pair.copyFallback": "Скопировано резервным способом браузера.",
  "pair.copyManual":
    "Скопировать не удалось — токен выделен в строке, скопируйте вручную.",
  "pair.startWork": "Начать работу",
  "pair.deviceId": "Идентификатор устройства",
  "pair.scope": "права",
  "pair.expires": "истекает",
  "pair.enterAnother": "Ввести другой код",
  "pair.err403": "Код привязан к другому адресу",
  "pair.err404": "Неизвестный код",
  "pair.err410": "Код истёк или уже использован",
  "pair.err429": "Слишком много попыток",
  "pair.err503": "Пейринг отключён на сервере",
  "pair.errGeneric": "Подключить не удалось",

  // --- Кора (ADR 0019 rev.2; union И1 — рабочее пространство 07j/07l) ------------
  // Развязка И1 (i1-dressing-map §1.2/§1.3): каркас v7 — рабочая зона +
  // дерево + Пульт. Строки одной волной ru/en; внутренних кодов фаз
  // («И1…И5», «срез», ADR) в пользовательских строках нет (07a §3.5).
  "kora.workspace.title": "Кора · сессии хостов",
  "kora.workspace.hint":
    "Кора — журнал сессий всех хостов: что агент делал и что говорил. Записи только для чтения",
  "kora.summary.hosts": "хостов: {{n}}",
  "kora.summary.running": "идёт сессий: {{n}}",
  "kora.summary.day": "за 24 ч: {{n}}",
  "kora.filter.label": "Фильтр по хосту",
  "kora.filter.all": "Все хосты",
  "kora.side.region": "Хосты и сессии",
  "kora.tree.title": "Хосты и агенты",
  "kora.tree.explain":
    "Агенты — программы, через которые на машине идёт работа: например, zcode",
  "kora.tree.noAgents": "агентов ещё нет",
  "kora.tree.emptyNoExecutors": "Хостов пока нет",
  "kora.tree.expand": "раскрыть",
  "kora.tree.collapse": "свернуть",
  "kora.block2.section": "Сессии",
  "kora.block2.titleAll": "Сессии · все хосты",
  "kora.block2.titleHost": "Сессии · {{host}}",
  "kora.block2.titleAgent": "Сессии · {{harness}} на {{host}}",
  "kora.block2.titleExecutor": "Сессии · {{name}}",
  "kora.block2.qfRunning": "идущие",
  "kora.block2.qfDay": "за 24 ч",
  "kora.block2.emptyContext": "Здесь сессий нет",
  "kora.block2.emptyFiltered": "Под этот фильтр сессий нет",
  "kora.about.title": "О сессии",
  "kora.about.started": "Начало",
  "kora.about.lastActivity": "Активность",
  "kora.about.coverage": "Покрытие этой сессии",
  "kora.about.harness": "Источник",
  "kora.about.copyLink": "Скопировать ссылку на сессию",
  "kora.about.copied": "Ссылка скопирована",
  "kora.about.copyFailed": "Не удалось скопировать — скопируйте из адресной строки",
  // Два имени покрытия (07j §3.5): формулировка сессии — по строке покрытия
  // харнеса из реестра; «unknown» — строки покрытия у харнеса нет.
  "kora.sessionCov.full": "полный ход",
  "kora.sessionCov.partial": "видим начало",
  "kora.sessionCov.metadata-only": "только метаданные",
  "kora.sessionCov.absent": "не сканируем",
  "kora.sessionCov.unknown": "покрытие пока не названо",
  "kora.pill.liveAge": "идёт · {{age}}",
  "kora.age.min": "{{n}} мин",
  "kora.age.hour": "{{n}} ч",
  "kora.age.day": "{{n}} сут",
  "kora.coverage.support.full": "полностью",
  "kora.coverage.support.lists-only": "только списки",
  "kora.coverage.support.metadata-only": "только метаданные",
  "kora.coverage.support.absent": "не сканируется",
  "kora.coverage.gaps": "Известные пробелы",
  "kora.legend.title": "Что мы видим с ваших машин",
  "kora.legend.growNote":
    "Покрытие растёт по мере готовности сканеров — список обновим",
  "kora.list.loading": "Загружаем сессии",
  "kora.list.loadMore": "Показать ещё",
  "kora.list.loadFailed": "Не удалось загрузить список сессий",
  "kora.list.inactiveTitle": "Сессия не активна",
  "kora.list.inactiveHint": "Войдите — и сессии хостов появятся здесь",
  // UX-overhaul §5/§9.3 (Ф1): честное пустое — ветвление по числу исполнителей.
  // Вариант A (исполнителей 0) — призыв подключить; вариант B (исполнители
  // есть, сканер ещё не приносил сессии) — без обещания «появятся сами».
  // ME-072 №7: CTA «Подключить агента» живёт ОДИН раз на экране — в центре
  // воркзона; строки правой панели факт констатируют, без действий.
  "kora.list.emptyNoExecutors": "Сессии появятся, когда подключите агента",
  "kora.list.emptyNoSessions": "Сессии появятся, когда сканер хостов начнёт работу",
  "kora.list.emptyAction": "Подключить агента",
  "kora.list.emptyStatusLink": "Открыть статус системы",
  "kora.session.steerable": "можно рулить",
  "kora.session.origin.relay": "реле",
  "kora.session.origin.local": "локальная",
  "kora.session.state.live": "живая",
  "kora.session.state.idle": "ожидает",
  "kora.session.state.dead": "процесс мёртв",
  "kora.session.notFound": "Сессия не найдена",
  "kora.session.notFoundMessage": "Сессии «{{id}}» нет в реестре Коры.",
  // ME-063: причина покрытия на 404-плашке — возврат из карточки задачи
  // с объяснением, а не пустой экран (agents-ui-spec §5).
  "kora.session.notFoundCoverage":
    "Хост недоступен для просмотра: борд читает транскрипты только хостов со сканером. Вернитесь к списку сессий или в карточку задачи — ссылка останется рабочей, когда хост станет читаемым.",
  "kora.session.backToList": "К списку сессий",
  "kora.session.inactiveTitle": "Сессия не активна",
  "kora.transcript.region": "Ход сессии",
  "kora.transcript.loading": "Загружаем транскрипт",
  "kora.transcript.loadFailed": "Не удалось загрузить транскрипт",
  "kora.transcript.inactiveHint": "Войдите — и транскрипт этой сессии появится здесь",
  "kora.transcript.emptyMessage":
    "Сессия в реестре, но записей в сторе нет — или ридер ещё не дошёл до неё.",
  "kora.transcript.redacted": "маскировано",
  "kora.transcript.redactedNote":
    "Часть строки скрыта единым redaction-модулем при выдаче",
  // UX-overhaul П4 (Ф1): строки транскрипта без таймстемпа показывают
  // нейтральную метку; курсор seq — служебная метрика, живёт в тултипе.
  "kora.transcript.line": "строка транскрипта",
  // Рабочая зона (07j §3.1): приглашение без выбора; инструменты чтения.
  "kora.workzone.invite": "Выберите сессию — здесь откроется её ход",
  "kora.workzone.openedAnnounce": "Открыта сессия: {{name}}",
  "kora.workzone.followTail": "Следить за хвостом",
  "kora.workzone.searchLabel": "Найти в сессии",
  "kora.workzone.searchPlaceholder": "Найти в сессии…",
  "kora.workzone.matches": "совпадений: {{n}}",
  // Пульт (07j §4, И1-решение dressing map §1.2.3): стартует свёрнутым,
  // содержимое вкладок честно называет, что появится.
  "kora.pult.title": "Пульт",
  "kora.pult.explain": "Пульт — лента событий и разбор сессии",
  "kora.pult.tabsLabel": "Вкладки Пульта",
  "kora.pult.digest": "Дайджест",
  "kora.pult.ether": "Эфир",
  "kora.pult.hint": "Выберите сессию — её разбор появится здесь",
  "kora.pult.digestEmpty": "Разбор сессии собирается автоматически — появится позже",
  "kora.pult.etherEmpty":
    "Лента событий появится позже — пока читайте ход сессий в транскриптах",
  "kora.pult.readTranscript": "Читать транскрипт",
  "kora.pult.waiting": "ждут владельца: {{n}}",
  "kora.pult.waitingHint": "Задачи, которые ждут вашего решения",
  "kora.pult.expand": "Развернуть",
  "kora.pult.collapse": "Свернуть",
  // Композер (07j §4.6, И1-срез dressing map §1.2.4): поле и машина
  // реальны, отправка честно отложена; фейк доставки запрещён (07a §1).
  "kora.composer.label": "Написать агенту в эту сессию",
  "kora.composer.placeholder": "Написать агенту…",
  "kora.composer.send": "Отправить",
  "kora.composer.sendLaterChip": "Отправка появится позже",
  "kora.composer.sendLaterNote":
    "Отправка сообщений агенту появится позже — пока Кора показывает ход сессий. Черновик живёт, пока вы на странице сессии.",
  // «Завершена» в реестре сессий пока нет (live/idle/dead) — строка ждёт
  // своего состояния; «прервана» = процесс мёртв.
  "kora.composer.finishedNote":
    "Сессия завершена — писать некому; начните новую на хосте",
  "kora.composer.interruptedNote": "Сессия прервана — агент здесь уже не слушает",
} as const;

export type TranslationKey = keyof typeof ru;
