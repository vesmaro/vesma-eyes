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
  "nav.system": "Система",
  // D8 (вердикт панели 2026-10-21): мёртвые пункты («Хранилища — скоро»,
  // «Сессии — позже», «Трассировки — позже») ушли из ежедневной навигации;
  // слот-механика снята вместе с ними (nav.soon/nav.later/soonStores).
  // Роуты-заглушки живы по прямым URL, их честные строки остались ключами
  // страниц (ниже); живые темы живут по одному месту: сессии — Кора,
  // память — Память, дорожная карта — Документация.
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
  // В1 live-layer indicator (blueprint §6.6, canon v11 §4). The state words
  // are lowercased — they interpolate mid-sentence into liveLayerAria and
  // follow the dictionary block's convention («пауза», «выкл»); «полный»
  // mirrors the hub's livingFull label (review round: the raw "live" was an
  // EN leak on every RU first screen).
  "topbar.liveLayerAria": "Живой слой: {{state}}. Нажмите, чтобы сменить режим.",
  // D12: заголовок был «Живой слой: live → …» — EN-вкрапление и непонятная
  // кнопка. Теперь: текущий режим словами + что делает клик.
  "topbar.liveLayerTitle":
    "Живой слой: {{state}}. Каждый клик переключает режим: полный → пауза → выкл",
  "topbar.liveLive": "полный",
  "topbar.liveCalm": "пауза",
  "topbar.liveOff": "выкл",
  "topbar.langLabel": "Язык интерфейса",
  // Union И1 (stand 03 §4): the topbar global search — a REAL input now;
  // Enter carries the query to /memory/search, `/` focuses the field.
  "topbar.searchPlaceholder": "Поиск по памяти…",
  "topbar.searchLabel": "Глобальный поиск по памяти",
  "topbar.openSidebar": "Открыть разделы",
  "topbar.densityToCompact": "Переключить плотность на компактную",
  "topbar.densityToComfortable": "Переключить плотность на комфортную",
  "topbar.densityCompact": "Компактная плотность",
  "topbar.densityComfortable": "Комфортная плотность",
  // ME-071 W3 slice 2: В1-пилюля статус-зоны (без кода яруса в копии).
  "topbar.b1.title": "Живой слой: {{state}}",
  "topbar.b1.stateOk": "норма",
  "topbar.b1.stateWarn": "с оговорками",
  "topbar.b1.stateError": "проблема",
  "topbar.b1.stateNone": "данных нет",
  "topbar.b1.done": "решений за сессию: {{count}}",

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
  "hotkeys.paletteHost": "Палитра: открыть хост",
  "hotkeys.paletteHostKeys": "хост <имя>",
  "hotkeys.paletteConnect": "Палитра: подключить новый хост",
  "hotkeys.paletteConnectKeys": "подключить хост",
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
  // W-A (D1): «в очереди» остаётся словарём ЗАДАЧ (колонка канбана);
  // очереди поручений исполняет своё слово — иначе один ярлык читал
  // два разных счётчика (1 на Обзоре против 213 на канбане).
  "cockpit.busyQueued": "поручений в очереди: {{count}}",
  "cockpit.agentsNone": "Агентов пока нет — подключите первого",
  "cockpit.agentsNoneAction": "Подключить агента",
  "cockpit.busyError": "Не удалось получить занятость",
  "cockpit.waitingTitle": "Что ждёт меня",
  // ME-072 C: the chip renders the number and this LABEL side by side —
  // the count lives only in the numeral (no «3 … ждут вас: 3» double).
  "cockpit.waitingSummaryLabel": "Ждут владельца",
  // W-A (D1): расшифровка формулы общего счётчика (тултип чипа Обзора и
  // блока «Что ждёт меня») — «чей счёт» отвечают слова, не догадка.
  "cockpit.waitingFormula": "входящие + на проверке + поручения в очереди",
  "cockpit.waitingSummaryTitle": "Открыть самое срочное",
  "cockpit.waitingInbox": "Входящие: {{count}}",
  "cockpit.waitingReview": "На проверке: {{count}}",
  "cockpit.waitingQueued": "Поручений в очереди: {{count}}",
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
  // W-A (D1): чип колодца и блок «Что ждёт меня» читают ОДНУ формулу
  // (useWaitingSummary.total) — слова теперь тоже одни («Ждут владельца»),
  // расшифровка формулы — общий ключ cockpit.waitingFormula (тултип).
  "overview.waitingChip": "Ждут владельца: {{count}}",
  // U2 «Обзор-колодец» (2026-10-08): HUD + шинный тикер. Один родительский
  // слот «Поделиться»; витальный кластер — только из ответивших проводов;
  // тикер — одна строка реальных событий /api/events (словарь по смыслу,
  // без кодов видов в строках). Тихая шина = пустая строка (честная тишина).
  "overview.share": "Поделиться",
  "overview.shareDone": "Ссылка скопирована",
  "overview.shareManual": "Скопируйте адрес: {{url}}",
  "overview.heroAgents": "агентов — {{count}}",
  "overview.tickerLabel": "Лента событий шины",
  "overview.eventTaskCreated": "Новая задача: {{ref}}",
  "overview.eventTaskUpdated": "Задача обновлена: {{ref}}",
  "overview.eventTaskMoved": "Задача перемещена: {{ref}}",
  "overview.eventTaskDeleted": "Задача удалена: {{ref}}",
  "overview.eventTaskArchived": "Задача в архиве: {{ref}}",
  "overview.eventTaskUnarchived": "Задача возвращена из архива: {{ref}}",
  "overview.eventReport": "Отчёт по задаче: {{ref}}",
  "overview.eventAssignmentCreated": "Создано назначение: {{ref}}",
  "overview.eventAssignmentClaimed": "Задачу взяли: {{ref}}",
  "overview.eventAssignmentStarted": "В работе: {{ref}}",
  "overview.eventAssignmentDone": "Завершено: {{ref}}",
  "overview.eventAssignmentFailed": "Не удалось: {{ref}}",
  "overview.eventAssignmentCancelled": "Назначение отменено: {{ref}}",
  "overview.eventAssignmentExpired": "Назначение истекло: {{ref}}",
  "overview.eventExecutorOnline": "Агент на связи: {{ref}}",
  "overview.eventExecutorOffline": "Агент отключился: {{ref}}",
  "overview.eventExecutorRegistered": "Новый агент: {{ref}}",
  "overview.eventExecutorUpdated": "Агент обновлён: {{ref}}",
  "overview.eventExecutorDeleted": "Агент удалён: {{ref}}",
  "overview.eventServerChanged": "Изменилось хранилище памяти",
  "overview.eventNotification": "Уведомление: {{ref}}",
  "overview.eventEnrollmentCreated": "Создан токен подключения",
  "overview.eventEnrollmentUsed": "Подключение по токену: {{ref}}",
  "overview.eventEnrollmentRevoked": "Токен подключения отозван",
  "overview.eventEnrollmentExpired": "Токен подключения истёк",
  "overview.eventHarnessAdded": "Новый харнес: {{ref}}",
  "overview.eventHarnessRemoved": "Харнес удалён: {{ref}}",
  "overview.eventProvisionCreated": "Подключение запущено: {{ref}}",
  "overview.eventProvisionProgress": "Подключение продолжается: {{ref}}",
  "overview.eventProvisionOk": "Подключён: {{ref}}",
  "overview.eventProvisionFailed": "Подключение не удалось: {{ref}}",
  "overview.eventProvisionRepinned": "Хост перепривязан: {{ref}}",
  "overview.eventPairingRequested": "Запрос пары устройств: {{ref}}",
  "overview.eventPairingConfirmed": "Устройство подтверждено: {{ref}}",
  "overview.eventPairingRevoked": "Пара устройств отменена",
  "overview.eventPairingExpired": "Пара устройств истекла",
  "overview.eventRuleCreated": "Создано правило автоматизации",
  "overview.eventRuleUpdated": "Правило автоматизации обновлено",
  "overview.eventRuleToggled": "Правило автоматизации переключено",
  "overview.eventRuleDeleted": "Правило автоматизации удалено",
  "overview.eventOther": "Событие шины",
  "overview.wellEmpty": "Колодец ждёт первой записи — их пишут агенты.",
  "overview.wellError": "Колодец недоступен — шина не ответила",
  // UX-overhaul §3/§8 (Ф1) + D8 (панель 2026-10-21): строка честности
  // ОБЗОРА не спорит с экраном и остаётся правдой НА КАЖДОМ адаптере:
  // хранилища на capable-шлюзах живы карточками прямо выше (строка их не
  // обещает), сессии — в разделе «Кора»; «позже» — только у
  // действительно несделанного (трассировки).
  "overview.honestyLater":
    "Сессии живут в разделе «Кора»; трассировки появятся позже",
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
  "pulse.subtitle": "Что появилось последним — свежий срез всех хранилищ. Фильтры, авторы и темы — в Записях.",
  "pulse.toRecords": "Открыть Записи",
  "pulse.stalled": "Пульс почти остановился: последняя запись {{days}} дн. назад ({{date}}). Свежих записей в этом скоупе нет.",
  "pulse.loading": "Загружаем пульс",
  "pulse.loadFailed": "Не удалось загрузить пульс",
  "pulse.emptyTitle": "Пока тихо",
  "pulse.emptyMessage": "Новых записей в выбранных хранилищах нет.",
  "pulse.scopeLabel": "Область пульса",
  "pulse.scopeAll": "все хранилища",
  "pulse.feedLabel": "Лента записей пульса",
  "pulse.untitled": "без заголовка",
  "pulse.degradedStores": "Часть хранилищ не ответила: {{servers}}",
  // W-A (D2): плашка-тупик получает выход — ссылка на состояние хранилищ
  // (/system/status#stores, тот же health-провод, что читает Обзор).
  "pulse.degradedStoresAction": "открыть состояние хранилищ",
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
  "auth.signInAria": "Войти в vesma",
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
  "auth.gate.inside.memory":
    "Записи, поиск по смыслу, пульс и теги — содержимое памяти",
  "auth.gate.inside.tasks": "Канбан, список, входящие и архив — работа и поручения",
  "auth.gate.inside.agents": "Исполнение, хосты и подключение новых машин",
  "auth.gate.inside.kora": "Журнал сессий всех хостов: что агент делал и говорил",
  "auth.gate.inside.system": "Статус, устройства и трассировки — служебная зона",
  "auth.gate.elsewhere": "Статистика открыта всем — она на Обзоре.",
  "auth.gate.goOverview": "Открыть Обзор",
  "auth.gate.signUp": "Создать аккаунт",
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
  // U1 (спека унификации, доработка гейта): подпись мини-превью — честно
  // называет эскиз эскизом: содержимое не рисуется и не обещается.
  "auth.gate.previewCaption": "Набросок раздела — содержимое откроется после входа",
  "auth.gate.checkingSession": "Проверяем сессию…",

  // --- ME-080: /auth route, «Вход | Регистрация» (07k §4.1–§4.4; копирайт —
  // ME-078-стандарт: ноль жаргона, человеческие исходы) ------------------------
  "auth.route.registerTitle": "Регистрация",
  "auth.route.passwordDescription": "Вход по логину и паролю.",
  "auth.route.tokenDescription":
    "Вход по токену — для машин и служебных развёртываний. Люди входят по логину и паролю.",
  "auth.route.registerDescription":
    "Создайте аккаунт — он сразу станет вашим входом на борт.",
  "auth.route.tabsLabel": "Вход или регистрация",
  "auth.route.tabSignIn": "Вход",
  "auth.route.tabRegister": "Регистрация",
  "auth.route.registerSubmit": "Создать аккаунт",
  "auth.route.signingIn": "Входим…",
  "auth.route.creating": "Создаём…",
  "auth.route.registerNote": "Первый созданный аккаунт становится владельцем борта.",
  "auth.route.usernameLabel": "Имя пользователя",
  "auth.route.passwordLabel": "Пароль",
  "auth.route.confirmLabel": "Пароль ещё раз",
  "auth.route.showPassword": "Показать пароль",
  "auth.route.hidePassword": "Скрыть пароль",
  "auth.route.usernameHint":
    "Имя — строчной латиницей, от 3 до 32 знаков; можно цифры, дефис и подчёркивание.",
  "auth.route.passwordHint": "Пароль — не короче 8 знаков.",
  "auth.route.errRequiredUsername": "Введите имя.",
  "auth.route.errRequiredPassword": "Введите пароль.",
  "auth.route.errRequiredConfirm": "Повторите пароль.",
  "auth.route.errUsername":
    "Имя не подходит: нужна строчная латиница, от 3 до 32 знаков; внутри можно цифры, дефис и подчёркивание.",
  "auth.route.errPassword": "Пароль коротковат — нужно не меньше 8 знаков.",
  "auth.route.errConfirm": "Пароли не совпадают — проверьте второе поле.",
  "auth.route.verdictPrefix": "Ошибка:",
  "auth.route.loginFailed": "Неверное имя или пароль.",
  "auth.route.loginFailedHelp":
    "Что проверить: раскладка RU/EN, регистр букв, Caps Lock.",
  "auth.route.tooManyAttempts":
    "Слишком много попыток — подождите минуту и попробуйте снова.",
  "auth.route.nameTaken": "Такое имя уже есть. Возьмите другое.",
  // fix/kora-auth-honesty (жалоба владельца, прод 1.63.0): вердикт называет
  // причину И путь решения — кто и каким флагом открывает регистрацию.
  "auth.route.registrationClosed":
    "Регистрация закрыта — у борда уже есть владелец. Доступ новых членов открывает владелец в настройках сервера (флаг VESMARO_ALLOW_REGISTRATION).",
  "auth.route.techDetail": "Техническая информация сервера",
  "auth.route.registerFailed": "Аккаунт создать не удалось.",
  "auth.route.networkFailed":
    "Сервер не ответил — проверьте связь и попробуйте ещё раз.",
  "auth.route.signedInToast": "Вы вошли: {{username}}",
  "auth.route.accountCreatedToast": "Аккаунт создан. Вы вошли: {{username}}",
  "auth.route.alreadySignedInNamed": "Вы уже вошли: {{username}}",
  "auth.route.tokenModeLink": "Вход по токену (админ)",
  "auth.route.backToPassword": "← Вернуться к входу по логину и паролю",
  "auth.route.roleOwner": "владелец",
  "auth.route.roleMember": "участник",
  // U1 (07h §12): заметная кнопка возврата у центрального блока /auth и /pair —
  // иконка-стрелка + чистый лейбл (глиф «←» из строки выше в кнопку не тащим).
  "auth.route.backLabel": "На борт",
  "auth.route.backAria": "На борт — вернуться на главную",
  "auth.route.alreadySignedIn": "Вы уже вошли",

  // --- fix/recovery-ux: дорожка восстановления пароля на /auth (жалоба
  // владельца, прод 1.64.0: «как сбросить пароль, если не помню старый?»).
  // Два шага на состоянии страницы, без нового роута: вход по токену —
  // и сразу задание нового пароля; текущий не спрашиваем никогда.
  "auth.route.recoveryLink": "Забыли пароль?",
  "auth.route.recoveryTitle": "Восстановление доступа",
  "auth.route.recoveryTokenLead":
    "Войдите по токену — сразу зададим новый пароль; текущий не понадобится.",
  "auth.route.recoverySetLead":
    "Токен принят. Задайте новый пароль аккаунту — текущий не нужен.",
  "auth.route.recoveryFormTitle": "Задать новый пароль",
  "auth.route.recoveryUsernameLabel": "Имя аккаунта",
  "auth.route.recoveryUsernamePlaceholder": "например, abyss",
  "auth.route.recoverySubmit": "Задать пароль",
  "auth.route.recoverySaving": "Задаём…",
  "auth.route.recoveryDoneToast": "Пароль задан — теперь войдите",
  "auth.route.recoveryBack": "← Назад ко входу",
  "auth.route.recoveryForbidden":
    "Недостаточно прав — восстановление доступно владельцу борда.",
  "auth.route.recoveryTooManyAttempts":
    "Слишком много попыток — подождите {{n}} с и попробуйте снова.",
  "auth.route.recoveryFailed": "Пароль задать не удалось.",

  // --- search -------------------------------------------------------------------
  "search.title": "Поиск",
  "search.tagline": "взгляд внутрь себя",
  "search.placeholder": "Поиск по колодцу…",
  "search.formLabel": "Поиск по воспоминаниям",
  "search.inputLabel": "Поисковый запрос",
  "search.submit": "Искать",
  "search.submitting": "Ищем…",
  "search.typeLegend": "Режим поиска",
  "search.typeAuto": "Авто — сам выберет",
  "search.typeFts": "По словам",
  "search.typeSemantic": "По смыслу",
  "search.typeAutoTitle": "Сервер сам выбирает способ подбора и ранжирует выдачу",
  "search.typeFtsTitle": "Показать только попадания по словам (фильтр поверх выдачи сервера)",
  "search.typeSemanticTitle": "Показать только смысловые попадания (фильтр поверх выдачи сервера)",
  "search.modeHintAuto": "Сервер сам решает, как искать: и по точным словам, и по смыслу — и ранжирует выдачу.",
  "search.modeHintFts": "Буквальные совпадения слов из запроса — фильтр поверх выдачи сервера.",
  "search.modeHintSemantic": "Записи, близкие по значению, даже если слов в запросе нет — фильтр поверх выдачи сервера.",
  "search.resultsLabel": "Результаты поиска",
  "search.failed":
    "Не удалось выполнить поиск. Проверьте соединение и попробуйте ещё раз.",
  "search.nothing": "Ничего не нашлось",
  "search.noMatches": "По запросу «{{query}}» воспоминаний нет.",
  "search.noTypedMatches":
    "Попаданий типа {{type}} по запросу «{{query}}» нет. Возможно, конвейер ранжирует этот запрос иначе.",
  "search.noMatchesHint":
    "Попробуйте меньше или другие слова — колодец глубок, но буквален.",
  "search.hitsCount": "Найдено {{count}} по запросу «{{query}}»",
  "search.hitsTypedSuffix": " (клиентский фильтр по типу)",
  "search.hitTypeFts": "по словам",
  "search.hitTypeSemantic": "по смыслу",
  "search.hitTypeHybrid": "слова + смысл",
  "search.hitTypeExplainFts": "нашёл поиск по словам: запрос встречается в тексте записи",
  "search.hitTypeExplainSemantic": "нашёл смысловой поиск: запись близка по значению к запросу",
  "search.hitTypeExplainHybrid": "нашёл комбинированный поиск: сработали и слова, и смысл",
  "search.relevanceTitle": "оценка сервера {{value}} — шкала внутренняя, важен порядок выдачи",

  // --- memories (records list) --------------------------------------------------
  "memories.title": "Записи",
  "memories.subtitle": "Весь архив памяти: фильтры по статусу, проекту, автору и тегу. Свежий срез — в Пульсе.",
  "memories.toPulse": "Открыть Пульс",
  "memories.filterLabel": "Фильтр воспоминаний",
  "memories.statusLabel": "Статус",
  "memories.projectLabel": "Проект",
  "memories.agentLabel": "Автор",
  "memories.limitLabel": "На странице",
  "memories.allStatuses": "Все статусы",
  "memories.allProjects": "Все проекты",
  "memories.allAgents": "Все авторы",
  "memories.loading": "Загружаем воспоминания",
  "memories.loadFailed": "Не удалось загрузить воспоминания",
  "memories.noMatch": "Под эти фильтры ничего не подходит",
  "memories.noMatchHint":
    "Ослабьте фильтр по статусу или проекту, чтобы поднять больше из колодца.",
  "memories.clearFilters": "Сбросить фильтры",
  "memories.wellEmpty": "Здесь появятся записи вашей памяти",
  "memories.wellEmptyHint":
    "Память пишут агенты — записи появятся, когда те начнут работать.",
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
  "memory.actionsLabel": "Действия с записью",
  "memory.actionCopyId": "Скопировать id",
  "memory.actionCopied": "id скопирован",
  "memory.actionCopyFailed": "не удалось скопировать",
  "memory.actionFindSimilar": "Найти похожее",
  "memory.actionTagRecords": "Записи с тегом {{tag}}",
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
  "tags.drilldownNote": "Фильтрация на клиенте — у vesma нет выборки по тегу.",
  "tags.nothingCarries": "Под этим тегом ничего нет",
  "tags.nothingCarriesMessage": "Сейчас нет воспоминаний с тегом {{tag}}.",
  // --- tags cloud (UI-17, spec 2026-09-21 §9; owner-approved copy) -----------
  "tags.statsLine": "тегов: {{count}} · данные на {{time}}",
  "tags.partialData": "Данные от {{answered}} из {{total}} хранилищ",
  "tags.partialStores": "Не ответили хранилища: {{servers}}",
  "tags.family.all": "Все семейства",
  "tags.family.bare": "без префикса",
  "tags.family.tags": "тегов: {{count}}",
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
  // W-A (D2b): Статус показывает ХРАНИЛИЩА теми же карточками, что и Обзор
  // (один health-провод GET /api/health) — «работает» больше не противоречит
  // плашке «laptop не отвечает».
  "status.storesTitle": "Хранилища",
  "status.storesHint": "тот же опрос, что читает Обзор",
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
  "sessions.emptyMessage": "Сессии появятся, когда агенты начнут говорить через vesma.",
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
  "tasks.sourceToggleAria.human": "Для человека: вернуться к нормализованному виду",
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
  "tasks.tabSubstance": "Вещество",
  // P1 «карточка = вещество»: один композитный читок, честные пустоты.
  "tasks.substanceLoading": "Загружаем вещество карточки",
  "tasks.substanceFailed": "Не удалось загрузить вещество карточки",
  "tasks.substanceNotFound": "Задача не найдена — вещество недоступно",
  "tasks.substanceNoAccess": "Нет доступа к веществу задачи (нужна owner-сессия)",
  "tasks.substancePlan": "План",
  "tasks.substanceReports": "Отчёты",
  "tasks.substanceReportsMeta": "всего {{count}} · актуальных {{live}}",
  "tasks.substanceFinalLive": "итог",
  "tasks.substanceExecutors": "Исполнители",
  "tasks.substanceExecutorsEmpty": "Назначений не было",
  "tasks.substanceExecutorsActive": "Активное назначение",
  "tasks.substanceExecutorsHistory": "История назначений",
  "tasks.substanceSpecialistNone": "специалист не указан",
  "tasks.substanceAttempts": "попыток: {{attempts}}",
  "tasks.substanceSessionsMemory": "Сессии и память",
  "tasks.substanceAgentsSilent":
    "Нет данных от агентов: ни рабочих сессий, ни связанных памятей.",
  "tasks.substanceSessionsLabel": "Рабочие сессии",
  "tasks.substanceSessionLive": "живая сессия",
  "tasks.substanceSessionsEmpty": "Рабочих сессий нет",
  "tasks.substanceMemoriesLabel": "Связанные памяти",
  "tasks.substanceMemoriesEmpty": "Связанных памятей нет",
  "tasks.substanceReview": "Ревью",
  "tasks.substanceReviewNone": "Источника ревью в базе нет.",
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
  // W-B (D6): «примятие невозможно» → человеческая причина.
  "tasks.inboxStaleNote":
    "Исчезли из памяти-источника — пока записи нет на месте, принять её в борд нельзя:",
  "tasks.inboxStaleLabel": "Исчезнувшие записи",
  "tasks.inboxSource": "сервер: {{server}}",
  "tasks.inboxAdoptedLink": "принята → {{id}}",
  // W-B (D6, ревью P1): specialist приходит из тега owner: записи и при
  // принятии уходит в task.specialists — это «КОМУ поручено» (делающий),
  // не «от кого просят». Значение — каноничное «@GCW: …», приставка без
  // второго двоеточия. Пустота — одним словом с деталями («специалист»).
  "tasks.inboxAssignee": "поручение для {{who}}",
  "tasks.inboxNoAssignee": "специалист не назначен",
  "tasks.inboxNoSpecialist": "не назначен",
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
  // W-B (D6): сырой дамп полей живёт под катом — и называется честно.
  "tasks.inboxFullTextLabel": "Сырая запись из памяти",
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
  // W-B (D6): одна строка контекста к кнопке (вердикт: «без контекста»).
  "tasks.scanHint":
    "Скан заново читает хранилища памяти и обновляет список: во Входящие попадают записи с меткой task:queue.",
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
  // W-B (D4): «Ждёт проверки» → «На проверке» — слово колонки, чипа
  // счётчика и Обзора снова одно (W-A переименовала чип — колонка
  // догоняет, а не наоборот).
  "tasks.column.backlog": "Бэклог",
  "tasks.column.validating": "На валидации",
  "tasks.column.open": "В очереди",
  "tasks.column.in-progress": "В работе",
  "tasks.column.blocked": "Блокировано",
  "tasks.column.resolved": "На проверке",
  "tasks.column.done": "Готово",

  // --- W-B (D4): карта соответствий «статус → колонка» -----------------------------
  // Статус (слово чипов списка) и колонка (слово доски) — один смысл с
  // разными словами; тултип чипа статуса называет колонку, чтобы владелец
  // не переводил словари в голове.
  "tasks.statusColumn.open":
    "задача в начале пути: колонки «Бэклог», «На валидации» или «В очереди»",
  "tasks.statusColumn.in-progress": "колонка «В работе»",
  "tasks.statusColumn.blocked": "колонка «Блокировано»",
  "tasks.statusColumn.resolved": "колонка «На проверке» — задача ждёт вашего решения",
  "tasks.statusColumn.done": "колонка «Готово»",
  "tasks.statusColumn.withdrawn": "колонки на доске нет — задача отозвана",

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
  // W-C (вердикт панели D5, P0): мобильное представление доски — чипы
  // колонок с живыми счётчиками, свайп как переключатель одной рукой.
  "tasks.board.mobileChipsLabel": "Колонки доски",
  "tasks.board.mobileSwipeHint":
    "Свайп влево или вправо переключает колонку; чипы выше открывают любую колонку одним касанием.",

  // ME-071 W3: живой пульт (15-WOW §3.4/§8.5) — фасад «Ждут владельца»,
  // темп решений в шапке колонки, вспышка task.done, кромка блокировки.
  // W-A (D1): чип считает ТОЛЬКО колонку «На проверке» — и теперь называется
  // её словом; «Ждут владельца» осталось именем общей формулы Обзора.
  "tasks.board.waitingChip": "На проверке: {{count}}",
  "tasks.board.waitingChipTitle":
    "Показать задачи в колонке «На проверке» — они ждут вашего решения",
  "tasks.board.doneTempoUnit": "/ч",
  "tasks.board.doneTempoAria": "решений за последний час: {{count}}",
  "tasks.board.resolvedToast": "Задача «{{title}}» решена",
  "tasks.board.doneToast": "Задача «{{title}}» завершена",
  "tasks.board.blockedReason": "агент не может взять задачу",

  // U3: словарь причин блокировки (blocked-кромка с причиной, 15-WOW §3.4
  // п.4) — причина выводится из данных задачи, никогда не выдумывается.
  "tasks.blocked.failed": "попытка исполнения не удалась",
  "tasks.blocked.expired": "исполнение истекло: агент перестал отвечать",
  "tasks.blocked.unrouted": "нет доступного исполнителя",
  "tasks.blocked.unassigned": "исполнитель не назначен",

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
    "Сервер блокирует правку контента задач старше 24 часов. Можно изменить принудительно — правка будет помечена force=true в истории.",
  "tasks.edit.forceLabel": "Изменить принудительно",
  "tasks.edit.forceConfirm":
    "Задача старше 24 часов. Изменить принудительно (force=true)? Правка попадёт в аудит как принудительная.",

  // --- tasks: create dialog (Ф3 — direct POST /api/tasks) ---------------------------
  "tasks.create.label": "Задача",
  // W-C (D5): below md the bare «Задача» chip is unrecognizable as the
  // creation entry — the mobile label names the action.
  "tasks.create.labelMobile": "Новая задача",
  "tasks.create.title": "Новая задача",
  // W-B (D4): «в колонке «открыта»» называло несуществующую колонку —
  // «открыта» это слово СТАТУСА; задача приземляется в колонку «В очереди».
  "tasks.create.description":
    "Первая строка — название, остальное — сводка. Задача создаётся сразу на борде в колонке «В очереди».",
  "tasks.create.textLabel": "Сырой текст",
  "tasks.create.textPlaceholder":
    "Название задачи с первой строки…\nДальше — сводка и контекст.",
  "tasks.create.textHint": "первая строка → название (1–200), остальное → сводка",
  "tasks.create.textError":
    "Первая строка обязательна и должна быть короче 200 символов — из неё получается название.",
  "tasks.create.projectLabel": "Проект",
  "tasks.create.tagsLabel": "Теги vesma (через запятую)",
  "tasks.create.submit": "Создать задачу",
  // --- U8: конвейер формирования задачи (v12-мастер «Что → Кому → Проверка»);
  // шаг = реальная операция, «Кому» живёт движком исполнений (spec §2.4).
  "tasks.create.stepWhat": "Что",
  "tasks.create.stepWhom": "Кому",
  "tasks.create.stepReview": "Проверка",
  "tasks.create.conveyorLabel": "Шаги задачи",
  "tasks.create.next": "Дальше",
  "tasks.create.whatTitle": "Что сделать",
  "tasks.create.whomTitle": "Кому поручить",
  "tasks.create.whomSub":
    "Каждая карточка обещает честный момент старта — когда задача реально начнётся.",
  "tasks.create.queueChoice": "В очередь без исполнителя",
  "tasks.create.queueNote":
    "Задача ждёт в канбане — исполнителя назначите позже. Равноправный путь, не запасной.",
  "tasks.create.startLive": "На связи: задача начнётся после ближайшего доклада агента",
  "tasks.create.startOffline":
    "Не на связи: задача встанет в очередь — агент заберёт её при возвращении",
  "tasks.create.assignHint":
    "Прямое поручение «{{name}}» идёт через движок исполнений: нужны специалист и харнесс.",
  "tasks.create.specialistError": "движку поручений нужен специалист (1–120 символов)",
  "tasks.create.sumWhat": "Что",
  "tasks.create.sumTags": "Теги",
  "tasks.create.whomQueue": "Очередь без исполнителя",
  "tasks.create.whomExecutor":
    "{{name}} · специалист {{specialist}} · харнесс {{harness}}",
  "tasks.create.give": "Дать задачу",
  "tasks.create.assignmentFailed":
    "Задача {{id}} создана, но поручение не встало — причина во всплывающем сообщении. Задачу можно поручить из её карточки.",

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
  // W-B (D4): тултипы-карта состояний ПОРУЧЕНИЙ — вторая ось (попытки
  // исполнения), не колонки доски; слова частично сталкиваются («в очереди»),
  // поэтому каждый чип состояния объясняет себя словами.
  "agents.stateHint.queued": "поручение создано и ждёт, пока исполнитель его заберёт",
  "agents.stateHint.claimed": "исполнитель забрал поручение и готовится начать",
  "agents.stateHint.running": "исполнитель работает над поручением сейчас",
  "agents.stateHint.done": "исполнение дошло до конца — отчёт в карточке задачи",
  "agents.stateHint.failed": "исполнение не удалось — задача, скорее всего, заблокирована",
  "agents.stateHint.cancelled": "исполнение отменено вручную",
  "agents.stateHint.expired": "у поручения истёк срок — задача, скорее всего, заблокирована",
  // W-B (D4): одна строка осям — чипы ниже про поручения, не про колонки.
  "agents.statesAxisNote":
    "Фильтры ниже — про поручения (попытки исполнения задач), а не про колонки канбана.",
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
  // agents-redesign A1: the card-grid keys retired with the grid; the frame
  // speaks agents.hosts.* (below) + the survivors here.
  "nav.agentsHosts": "Хосты",
  "agents.roster.failed": "Не удалось загрузить ростер",
  "agents.roster.emptyTitle": "Агентов ещё нет",
  "agents.roster.emptyMessage": "Ростер оживёт, когда подключится первый исполнитель.",
  "agents.roster.hostUnknown": "Без хоста",
  // agents-redesign A1 (blueprint 2026-10-09): the hosts FRAME — the roster
  // panel (compact host rows + filter chips + the connect action) and the
  // selected-host scaffold in the field.
  "nav.agentsHost": "Хост",
  "agents.hosts.loading": "Загружаем ростер хостов",
  "agents.hosts.summary.machines": "машин: {{n}}",
  "agents.hosts.summary.online": "на связи: {{n}}",
  "agents.hosts.summary.attention": "требуют внимания: {{n}}",
  "agents.hosts.filter.groupLabel": "Фильтр ростера хостов",
  "agents.hosts.filter.all": "Все",
  "agents.hosts.filter.attention": "Требуют внимания",
  "agents.hosts.filter.decision": "Ожидают решения",
  // Roster-host-binding-cleanup: чип «Архив» — уставшие disabled-строки
  // живут здесь, из дефолтных видов они убраны.
  "agents.hosts.filter.archive": "Архив",
  "agents.hosts.filterEmpty": "Под фильтр не попал ни один хост.",
  "agents.hosts.onlineCounter": "{{online}}/{{total}} харнесов онлайн",
  // D12: готовое определение из словаря (глоссарий, docs/glossary.md) —
  // тултип при ПЕРВОМ употреблении лор-слова.
  "agents.hosts.harnessHint":
    "Харнес — среда исполнения агента (например, zcode или hermes).",
  // P2-1 (ревью волны W-E): одна дорога — одно имя. CTA ведёт на
  // «Подключение агентов», палитра говорит «Подключить агента», и по факту
  // дорога заводит АГЕНТА (имя хоста приходит из его отчёта); «хост»
  // остаётся существительным поля машины и счётчика ростера.
  "agents.hosts.connectAction": "Подключить агента",
  // UX-AUDIT A5: короткая подпись тихой кнопки в шапке ростера (глиф «+»
  // несёт иконка; полный CTA пустого состояния/панели остаётся «хост»).
  "agents.hosts.connectShort": "Подключить",
  "agents.hosts.pendingPill": "ждёт решения",
  "agents.hosts.fieldPlaceholder":
    "Рабочее поле хоста появится в следующем обновлении.",
  "agents.hosts.notFound": "Хост не найден",
  "agents.hosts.notFoundMessage":
    "Хоста «{{host}}» нет в ростере — возможно, его запись удалили.",
  "agents.hosts.backToRoster": "К ростеру хостов",
  "agents.hosts.rosterRegion": "Ростер хостов",
  "agents.hosts.rosterTrigger": "Ростер · {{n}}",
  "agents.hosts.ribbonLabel": "Лента хостов",
  "agents.hosts.sheetHint": "Выберите хост — его карточка откроется в основном поле.",
  "agents.hosts.taskCount": "активные задачи: {{n}}",
  "agents.hosts.actionGiveTask": "Дать задачу",
  "agents.hosts.actionKora": "Сессии в Кору",
  "agents.hosts.actionLinkCheck": "Проверить связь",
  "agents.hosts.nowTitle": "Сейчас",
  "agents.hosts.nowIdle": "Простаивает — активных задач и живых сессий нет.",
  "agents.hosts.nowAssignments": "Активные задачи",
  "agents.hosts.nowSessions": "Живые сессии",
  "agents.hosts.nowNoSessions":
    "Живых сессий нет — появятся, когда харнес начнёт работу.",
  "agents.hosts.sessionsFailed": "Сессии недоступны.",
  // W3 «Сессия в центре» (states.md §1 S-SESSION): READ-ONLY превью
  // транскрипта выбранной сессии; чат живёт ТОЛЬКО в Корe (blueprint §9) —
  // ключи переиспользуют словарь «О сессии» Коры (kora.about.*).
  "agents.hosts.session.label": "Сессия",
  "agents.hosts.session.openInKora": "Открыть в Корe",
  "agents.hosts.session.closeAria": "Закрыть просмотр сессии",
  "agents.hosts.session.menuLabel": "Операции сессии",
  "agents.hosts.session.menuTriggerAria": "Операции сессии {{name}}",
  "agents.hosts.session.readonlyNote":
    "Просмотр только для чтения — чат живёт в Корe",
  "agents.hosts.session.notFound":
    "Этой сессии нет среди живых сессий хоста",
  "agents.hosts.session.notFoundHint":
    "Возможно, она завершилась, ушла из живых или ссылка устарела.",
  "agents.hosts.session.backToHost": "Вернуться к хосту",
  "agents.hosts.session.transcriptLabel": "Транскрипт сессии",
  // W2 «Мета-панель» (states.md §2): блоки правой панели; «Недавно» поля
  // переехало в блок «Пульс» (ключи pulse* — те же честные состояния).
  "agents.hosts.panelRegion": "Панель хостов",
  "agents.hosts.presenceTitle": "Присутствие",
  "agents.hosts.pulseTitle": "Пульс",
  "agents.hosts.pulseNoHost": "Выберите хост — здесь появится его пульс за сутки.",
  "agents.hosts.pulseEmpty": "Тишина. Первые события — после первого доклада.",
  "agents.hosts.pulseFailed": "Ленту не удалось загрузить.",
  "agents.hosts.settingsTitle": "Настройки",
  "agents.hosts.reconnectAction": "Подключить заново",
  // Харнесы хоста (agents-workspace-ide W1 «Распустить сплетения»):
  // компактный чип-стрип вместо аккордеона «Сплетения зоны»; лор из
  // структурных подписей уходит (см. блок agents.lore ниже).
  "agents.hosts.harnessStripLabel": "Харнесы",
  "agents.hosts.zoneEmpty":
    "Харнесов в этом хосте пока нет — подключите, и он появится здесь.",
  "agents.hosts.actionAddHarness": "Подключить харнес",
  "palette.hostItem": "Хост {{host}}",
  // D9: одна сущность на экране Подключения — «агент»; «хост» остаётся
  // только меткой поля машины.
  "palette.connectHost": "Подключить агента",
  "agents.hosts.refusalDisabled": "отключён",
  "agents.hosts.refusalRevoked": "отозван",
  "agents.hosts.execEnvTooltip": "Среда исполнения (данные агента)",
  "agents.hosts.foundAtTooltip": "Эта же установка также найдена в",
  // Лор-словарь зон (BRAIN-ZONES-VISUAL-DOC §2, гейт i18n): «зона / сплетение
  // / нейрон / ядро / путь». W1 (agents-workspace-ide): из структурных
  // подписей лор уходит — рендерится ровно ОДИН капс-акцент «зона коры» над
  // именем хоста, словарь живёт в его тултипе. «Ядро» (команда) и «путь»
  // (миссия) — задел Z2/Z3: НЕ рендерятся.
  "agents.lore.zone": "зона коры",
  "agents.lore.zoneTooltip":
    "словарь: сплетение — харнес · нейрон — специалист · ядро — команда · путь — миссия",
  // «Сплетение»/«нейрон» — dictionary reserve (Z2/Z3), no renderer by
  // design: лор-подписи и счётчик «нейронов: N» ушли в ретир вместе с
  // аккордеоном W1; ключи остаются словарным каноном (гейт i18n,
  // BRAIN-ZONES-VISUAL-DOC §2) наравне с «ядром»/«путём» ниже.
  "agents.lore.plexus": "сплетение",
  "agents.lore.neuron": "нейрон",
  "agents.lore.core": "ядро",
  "agents.lore.path": "путь",
  "agents.lore.coreHint":
    "Ядро — команда специалистов, функциональная группа нейронов. В ростере пока не отображается.",
  "agents.lore.pathHint":
    "Путь — проводящий путь делегации: дерево задач от замысла до отчёта. В ростере пока не отображается.",
  "agents.hosts.resize.label": "Ширина панели хостов",
  "agents.hosts.resize.tooltip":
    "Потяните, чтобы изменить ширину. Двойной клик — вернуть как было",
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
  // D9 (панель 2026-10-21): «присутствие неизвестно · отключён» рядом с
  // живыми сессиями хоста читалось как противоречие. Подсказка объясняет
  // ДВУХ-ЧАСОВОЕ правило (§2.1): присутствие и живость сессий — независимые
  // факты; данные не выдумываются.
  "agents.presence.unknownHint":
    "Пульса от этой строки нет, поэтому присутствие неизвестно — это не поломка. Живые сессии хоста — отдельный факт: они приходят из журнала сессий и от пульса не зависят.",
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
  // Честный дефолт пульса хостов (ревью W2-2): union kinds шире словаря
  // (task.moved/updated/archived/unarchived, assignment.created) — родное
  // слово вместо чужого «поручение создано».
  "agents.feed.event": "событие",
  "agents.stream.stale": "данные на {{time}}",
  "agents.settings.title": "Настройки",
  "agents.settings.executionTitle": "Исполнение",
  "agents.settings.executionHint":
    "Маршрут по умолчанию и запасной исполнитель (глобально; проектные переопределения — зарезервированы)",
  "agents.settings.defaultLabel": "Исполнитель по умолчанию",
  "agents.settings.fallbackLabel": "Запасной исполнитель",
  "agents.settings.none": "— не задан —",
  // W-A (D11-UI): сохранённая пара «по умолчанию/запасной» проверяется теми
  // же правилами, что гейт сохранения; нерабочая пара предупреждает ЗДЕСЬ —
  // пока задачи неделями «не забираются», настройка молчала.
  "agents.settings.warnNone":
    "Исполнитель по умолчанию не задан — новые задачи не будут разбираться.",
  "agents.settings.warnMissing":
    "Выбранный исполнитель «{{name}}» исчез из реестра — задачи не будут разбираться, пока не выбран другой.",
  "agents.settings.warnPending":
    "Выбранный исполнитель «{{name}}» ещё не подтверждён — задачи не будут разбираться.",
  "agents.settings.warnRevoked":
    "Выбранный исполнитель «{{name}}» отозван — задачи не будут разбираться, пока не выбран другой.",
  "agents.settings.warnDisabled":
    "Выбранный исполнитель «{{name}}» выключен — задачи не будут разбираться.",
  "agents.settings.warnOffline":
    "Выбранный исполнитель «{{name}}» не на связи — задачи будут ждать, пока он не ответит.",
  "agents.settings.warnMesh":
    "Выбранный исполнитель «{{name}}» работает через mesh — poller задачи не забирает (маршрутизация недоступна до R4).",
  "agents.settings.warnFallbackNone":
    "Запасной исполнитель не задан — при сбое первого задачам некуда уходить.",
  "agents.settings.warnAction": "Открыть исполнителей",
  "agents.settings.save": "Сохранить",
  "agents.settings.saving": "Сохраняем…",
  "agents.settings.saved": "Настройки исполнения сохранены",
  "agents.settings.savedDetail": "маршрутизация новых поручений обновлена",
  "agents.settings.saveFailed": "Не удалось сохранить настройки исполнения",
  "agents.settings.meshIneligible": "mesh-транспорт — маршрутизация недоступна до R4",

  // --- agents domain: registry page /agents/harnesses (AGW-4) ----------------------
  "nav.agentsHarnesses": "Подключение агентов",
  "agents.registry.title": "Подключение агентов",
  "agents.registry.loading": "Загружаем реестр агентов",
  "agents.registry.failed": "Не удалось загрузить реестр агентов",
  "agents.registry.band.pending": "Ожидают подтверждения",
  "agents.registry.band.active": "Подключённые",
  "agents.registry.band.revoked": "Отозванные",
  "agents.registry.approve": "Одобрить",
  "agents.registry.approveHint":
    "после одобрения включите агента — маршрутизация берёт только включённых",
  "agents.registry.enable": "Включить",
  "agents.registry.disable": "Отключить",
  "agents.registry.revoke": "Отозвать",
  "agents.registry.remove": "Удалить",
  "agents.registry.capabilitiesLabel": "Умения",
  "agents.registry.capabilitiesHint":
    "Умения — что этому агенту можно поручать. Назначьте первое в его карточке — задачи смогут его находить.",
  "agents.registry.hostLabel": "хост",
  "agents.registry.revokedHint":
    "доверие не восстанавливается — зарегистрируйте агента заново",

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
    "Нажмите «Добавить агента», заполните имя и харнес — свой харнес можно добавить прямо в списке.",
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
  "agents.executors.actionFailed": "Не удалось изменить агента",
  "agents.executors.approved": "{{name}}: одобрен",
  "agents.executors.approvedDetail":
    "включите агента — маршрутизация берёт только включённых",
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
    "Список установок присылает сам агент; хосты на поллере пришлют его позже — пусто здесь честный ответ, а не задержка.",
  "agents.card.inventorySpecialists": "специалисты",
  "agents.card.inventorySkills": "скиллы",
  "agents.card.inventoryPlugins": "плагины",
  "agents.card.inventoryInstructions": "инструкции",
  "agents.card.inventoryNoNames": "имён нет — только счётчик",
  "agents.card.inventoryOverflow": "…и ещё {{count}}",
  "agents.card.inventoryGcwShare": "из них gcw-*: {{count}}",
  // specialists-interactive-cards (директива владельца 21.10): карточки
  // записей инвентаря — человеческая структура вместо сырого списка.
  "agents.card.recordTypeSpecialist": "специалист",
  "agents.card.recordTypeSkill": "скилл",
  "agents.card.recordTypePlugin": "плагин",
  "agents.card.recordTypeInstruction": "инструкция",
  "agents.card.recordName": "Имя",
  "agents.card.recordType": "Тип записи",
  "agents.card.recordEnv": "Окружение",
  "agents.card.recordSurface": "Среда",
  "agents.card.recordEnvPath": "Путь окружения",
  "agents.card.recordEnvVersion": "Версия окружения",
  "agents.card.recordDescription": "Описание",
  "agents.card.recordNoDescription": "нет — агент присылает только имена",
  "agents.card.recordTasksAgent": "Задачи с участием",
  "agents.card.recordTasksAgentHint": "список задач с фильтром по агенту",
  "agents.card.recordAssignments": "Поручения специалиста",
  "agents.card.recordAssignmentsHint":
    "страница «Исполнение» с фильтром по специалисту",
  "agents.card.recordTaskMentions": "Упоминания в задачах",
  "agents.card.recordTaskMentionsHint": "поиск по названиям и описаниям задач",
  "agents.card.recordNoMoreActions":
    "других действий у записи нет — она известна только из отчёта агента",
  "agents.card.inventoryRawList": "сырой список имён",
  // AGW-23/24 «Среда исполнения» (карточка): зеркало surface-фактов агента.
  "agents.card.surfaceFacts": "Среда исполнения (данные агента)",
  "agents.card.surfaceRuntime": "Процесс агента",
  "agents.card.surfaceContainers": "Distrobox-контейнеры",
  "agents.card.surfaceNodes": "Узлы кластера",
  "agents.card.surfacePods": "Поды кластера",
  "agents.card.surfaceVerdicts": "Вердикты последнего скана",
  "agents.card.surfaceReady": "готов",
  "agents.card.surfaceNotReady": "не готов",
  "agents.card.surfaceReadyUnknown": "статус неизвестен",
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
  "agents.enrollment.title": "Добавить агента",
  "agents.enrollment.description":
    "Создание одноразового токена подключения для удалённого агента",
  "agents.enrollment.formHint":
    "Заполните карточку — получите одну команду для внешней машины. Агент установится сам и появится здесь на одобрение.",
  "agents.enrollment.label": "Название (для себя)",
  "agents.enrollment.labelPlaceholder": "например, vps-1",
  "agents.enrollment.harness": "Харнес (подсказка для команд)",
  "agents.enrollment.nameHint": "Имя агента (необязательно)",
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
  "agents.provision.name": "Имя агента (необязательно)",
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
  "agents.provision.openHost": "Открыть хост",
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
  // W-B (D10): значение выключателя — по-русски, не «on/off» (D12-класс).
  "automation.banner.killSwitch": "глобальный выключатель",
  "automation.banner.switchOn": "вкл.",
  "automation.banner.switchOff": "выкл.",
  "automation.banner.cap": "лимит в день",
  "automation.banner.usedToday": "авто-запусков сегодня",
  "automation.banner.rules": "правил",
  "automation.banner.rulesCount": "расписаний {{schedules}}, правил-хуков {{hooks}}",
  "automation.banner.settingsLink": "изменить в настройках",
  // UI-21 settings hub: the kill-switch/cap form (server contract §2).
  "automation.settings.title": "Автоматизация",
  "automation.settings.enabledLabel": "Автоматизация включена",
  // W-B (D10): одно согласованное состояние — движок не работает, поэтому
  // переключатель недоступен; без внутреннего кода этапа («S1») в тексте.
  "automation.settings.engineOffNote":
    "Движок автоматики ещё не включён на этом борде — переключатель станет доступным, когда движок заработает. Сохранённое решение и лимит применяются, как прежде.",
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
  // ME-080 follow-up: секция «Безопасность» — форма пароля (POST /auth/password).
  "settings.hub.securityTitle": "Безопасность",
  "settings.security.formTitle": "Пароль",
  "settings.security.usernameLabel": "Имя аккаунта",
  "settings.security.currentLabel": "Текущий пароль",
  "settings.security.currentHint": "Если входили по паролю",
  "settings.security.newLabel": "Новый пароль",
  "settings.security.confirmLabel": "Новый пароль ещё раз",
  "settings.security.save": "Сохранить",
  "settings.security.saving": "Сохраняем…",
  "settings.security.toastOk": "Пароль обновлён",
  "settings.security.wrongCurrent": "Текущий пароль не подходит.",
  "settings.security.forbidden":
    "Недостаточно прав: восстановление доступно владельцу.",
  "settings.security.tooManyAttempts":
    "Слишком много попыток — подождите {{n}} с и попробуйте снова.",
  "settings.security.saveFailed": "Сохранить не удалось.",
  "settings.security.honestySession":
    "Вы вошли по паролю: это смена пароля своего аккаунта — текущий пароль обязателен.",
  // fix/recovery-ux (жалоба владельца, прод 1.64.0): в токен-ноге поле
  // «Текущий пароль» вообще не рендерится, и строка ноги говорит это прямо.
  "settings.security.honestyToken":
    "Вы вошли по токену: задайте новый пароль — текущий не нужен.",
  "settings.security.unavailable":
    "Форма недоступна: нет активного входа. Войдите по паролю или токену — и вернитесь сюда.",
  "settings.security.recoveryLine":
    "Если пароль потерян — войдите по токену (кнопка «Войти» вверху) и задайте новый здесь: текущий пароль не понадобится.",
  // Presets brief §1 (themes-presets-wave1): ONE «Оформление» control —
  // «Системная» + five lore-named presets. The topbar toggle keeps its
  // family-level aria (topbar.themeToLight/themeToDark).
  "settings.hub.themeLabel": "Оформление",
  "settings.hub.themeSystem": "Системная",
  "settings.hub.presetWell": "Колодец",
  "settings.hub.presetZhila": "Жила",
  "settings.hub.presetSozvezdia": "Созвездия",
  "settings.hub.presetLight": "Береста",
  "settings.hub.presetProsvet": "Просвет",
  "settings.hub.themeHint":
    "«Системная» следует за настройкой вашей ОС. Тумблер в топбаре переключает тёмное↔светлое семейство, не сбрасывая выбранный пресет.",
  "settings.hub.langLabel": "Язык интерфейса",
  "settings.hub.densityLabel": "Плотность строк",
  "settings.hub.densityComfortable": "Просторная",
  "settings.hub.densityCompact": "Компактная",
  "settings.hub.densityHint":
    "Рабочие списки — задачи, реестры, выдача. Поиск и память остаются просторными.",
  "settings.hub.appliesEverywhere": "Применяется сразу во всём интерфейсе.",
  // «Зеркало» настроек (U6; SPEC-2026-10-07 «Система»: живое превью
  // 380–480px — данные текущего вида, не анимация; ноль живого слоя).
  "settings.mirror.title": "Зеркало",
  "settings.mirror.hint":
    "Живое превью текущего вида: обновляется сразу — это данные, не анимация.",
  "settings.mirror.sampleCaps": "Образец",
  "settings.mirror.sampleTitle": "Карточка в текущей теме",
  "settings.mirror.sampleSecondary": "Вторичный текст остаётся читаемым",
  "settings.mirror.sampleMuted": "Приглушённый — для служебных подписей",
  "settings.mirror.sampleRow": "Строка при текущей плотности",
  "settings.mirror.themeCaption": "Тема",
  "settings.mirror.densityCaption": "Плотность",
  "settings.mirror.livingCaption": "Живой слой",
  "settings.hub.boardStyleLabel": "Стиль канбан-доски",
  "settings.hub.boardStyleHint": "Применится на странице Задачи → Канбан.",
  "settings.hub.motionLabel": "Анимации",
  "settings.hub.motionSystem": "Системные",
  "settings.hub.motionReduced": "Минимум",
  "settings.hub.motionHint":
    "«Минимум» отключает движение и мерцания независимо от настроек ОС.",
  // «Живой слой» (ME-071 W1a): the control is live — it drives the veins
  // background through lib/liveLayerStore. «Полный» is the default (owner
  // resolution 2026-10-07 — supersedes the АРХКОМ §1.6 calm default);
  // honesty: light follows real data only.
  "settings.hub.livingLabel": "Живой слой",
  "settings.hub.livingFull": "Полный",
  "settings.hub.livingCalm": "Спокойный",
  "settings.hub.livingOff": "Выключен",
  "settings.hub.livingHint":
    "Фон-жилы дышат и красятся только реальными данными. Полный (по умолчанию): дыхание, тона, импульсы и полёты Весмы. Спокойный: дыхание и тона без импульсов.",
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
  "living.vesma.dialog": "Открыт диалог — дела подождут.",
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
    "Создайте расписание — ручной запуск работает сразу, автоматический заработает вместе с движком.",
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
  "automation.form.onLabel": "Событие (когда запускать)",
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
    "Обзор устройства vesma: гибридная память и поверхности управления.",
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
  "docs.catDesc.apiMnemos": "Карта поверхностей сервера памяти и контракт A2A-сессий.",
  "docs.cat.apiAgent": "Протокол vesmaro-agent",
  "docs.catDesc.apiAgent": "Проводной протокол агента и выжимка service charter v2.",
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
  "docs.provenance.badge": "актуально для {{repo}}@{{sha}} · пин от {{date}}",
  "docs.provenance.full":
    "Актуально для репозитория {{repo}}, коммит {{sha}}, пин от {{date}}",
  "docs.provenance.multiSource": "источников: {{count}} · пин от {{date}}",
  "docs.provenance.multiSourceFull":
    "Страницы хаба импортированы из {{count}} репозиториев по пинам; самый свежий пин — от {{date}} — пин каждой страницы на её бейдже",
  "docs.hub.start": "С чего начать",
  "docs.hub.categories": "Категории",
  // U6: карточки хабов со статистикой (v12-канон; счётчики — данные,
  // ноль живого слоя). W1 docs-hubs-nav: полоса хабов — на КАЖДОМ хабе.
  "docs.hub.cardsLabel": "Хабы",
  "docs.hub.cardUpdated": "обновлено {{stamp}}",
  "docs.hub.cardMultiSource": "источников: {{count}}",
  // W1 docs-hubs-nav: общая грамматика карточки на всех трёх уровнях
  // оглавления (книги → категории → страницы) — футер и «вы здесь».
  "docs.card.here": "Вы здесь",
  "docs.card.open": "Открыть",
  "docs.category.pagesLabel": "Страницы",
  // W2 docs-hubs-nav: единый хлебный путь «Книга › Категория › Страница»
  // внутри поля страницы (не путать с «Хлебными крошками» верхней панели).
  "docs.breadcrumbs.label": "Навигация по книге",
  // W3 docs-hubs-nav: контекстный возврат UI-18 — подпись контрола «← …»,
  // та же грамматика «Назад: …», что у Shell BackControl (review P3:
  // «назад к Задача» → «Назад: Задача»).
  "docs.back.label": "Назад: {{place}}",
  // U6: честная ошибка манифеста (honest-map строки 20–21) — явный слот
  // с «Повторить» вместо вечного скелетона.
  "docs.error.manifestTitle": "Каталог документов не собрался",
  "docs.error.manifestMessage":
    "Не удалось загрузить оглавление документации — страницы не могут быть показаны. Проверьте соединение и повторите; если не помогло — перезагрузите страницу (после обновления сервера старый кэш может ссылаться на устаревшие файлы).",
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
  // U6: билингв RUS/ORIG на странице документа (v12-подача над движком
  // main): переключатель виден только когда есть и перевод, и оригинал.
  "docs.bilingual.group": "Язык статьи: перевод или оригинал",
  "docs.bilingual.rus": "Русский перевод",
  "docs.bilingual.orig": "Язык оригинала",
  "docs.pages.one": "{{count}} страница",
  "docs.pages.few": "{{count}} страницы",
  "docs.pages.many": "{{count}} страниц",

  // --- shared empty/error ----------------------------------------------------------
  "common.retry": "Повторить",
  // UX-overhaul §7.2 (Ф1): сырой текст ошибки — только под раскрытием.
  "common.techDetails": "Технические подробности",
  // docs-tables-width §3 правило 4: доступное имя скролл-обёртки таблицы.
  "common.tableScrollRegion": "Горизонтально прокручиваемая таблица",

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
  "kora.field.region": "Поле хоста",
  "kora.field.summary": "агентов: {{agents}} · идёт: {{running}} / всего: {{total}} · за 24 ч: {{day}}",
  "kora.field.unknownHost": "Такого хоста нет в реестре",
  "kora.field.unknownHostHint": "Проверьте адрес — или вернитесь в Кору.",
  "kora.field.backToKora": "К Коре",
  "kora.field.noAgents": "На этом хосте пока нет агентов",
  "kora.field.agentEmpty": "У этого агента сессий нет",
  "kora.group.noCwd": "Без каталога",
  "kora.group.source": "источник: {{source}}",
  "kora.panel.region": "Дерево и мета",
  "kora.tree.searchLabel": "Поиск по хостам и агентам",
  "kora.tree.searchPlaceholder": "Найти хост или агента…",
  "kora.tree.noMatches": "Ничего не найдено",
  "kora.tree.found": "найдено: {{n}}",
  "kora.breadcrumb.field": "← {{host}} · поле",
  "kora.breadcrumb.kora": "← Кора",
  "kora.list.loadingMore": "Загружаем…",
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
  "kora.list.inactiveTitle": "Кора ждёт входа на борт",
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
  "kora.session.origin.relay": "через релей",
  // D12 (панель 2026-10-21): «реле»-чип без расшифровки. Ярлык читается словами, тултип — готовая формулировка контракта сессий (relay = через релей Коры).
  "kora.session.origin.relayHint": "Сессия началась через релей Коры",
  "kora.session.origin.local": "локальная",
  "kora.session.origin.localHint": "Сессия началась вне Коры, на самой машине",
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
  "kora.session.inactiveTitle": "Кора ждёт входа на борт",
  "kora.transcript.region": "Ход сессии",
  "kora.transcript.loading": "Загружаем транскрипт",
  "kora.transcript.loadFailed": "Не удалось загрузить транскрипт",
  "kora.transcript.inactiveHint": "Войдите — и транскрипт этой сессии появится здесь",
  "kora.transcript.emptyMessage":
    "Сессия в реестре, но записей в сторе нет — или ридер ещё не дошёл до неё.",
  "kora.transcript.redacted": "маскировано",
  "kora.transcript.redactedNote":
    "Часть строки скрыта единым redaction-модулем при выдаче",
  // transcript-ux (2026-10-10): сырой ход под катом + связность лог↔ответ.
  "kora.transcript.rawWalk": "Сырой ход",
  "kora.transcript.rawWalkHint":
    "Как агент думал и действовал: служебные строки и вызовы инструментов",
  "kora.transcript.jumpToAnswer": "Показать ответ, к которому относится строка",
  "kora.transcript.spotlightAnnounce":
    "Ответ, к которому относится строка, подсвечен в транскрипте (ответ {{n}})",
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
  // Пульт распущен (KW1 «Три колонки», kora-rethink blueprint §6): полоса
  // ушла из структуры, крылья переехали в мету, бейдж — в шапку. Высотная
  // механика ждёт KW2 (зона «Все ходы») — ключи её полос вернутся с ней.
  "kora.meta.digest": "Дайджест",
  "kora.meta.ether": "Эфир",
  "kora.meta.digestHint": "Выберите сессию — её разбор появится здесь",
  "kora.meta.digestEmpty": "Разбор сессии собирается автоматически — появится позже",
  "kora.meta.readTranscript": "Читать транскрипт",
  "kora.meta.region": "Мета-панель",
  "kora.meta.aboutNoSession": "Сессия не выбрана — свойства появятся здесь",
  // Бейдж «ждут владельца» в шапке (переезд из Пульта): реальный счётчик
  // входящих UI-30, словарь источника («Входящие»), скрыт, пока неизвестен.
  "kora.header.waiting": "Входящие: {{n}}",
  "kora.header.waitingHint": "Задачи, которые ждут вашего решения",
  // Левая панель «Навигация» (KW1): дерево + сессии контекста + закреплённая
  // запись кластерного чата (пока ведёт в нынешний hermes-режим; маршрут
  // /kora/hermes — KW2).
  "kora.nav.region": "Навигация",
  "kora.nav.clusterChat": "Чат с кластером",
  "kora.nav.clusterChatHint": "Открыть чат с кластером Hermes",
  // Швы ресайза (U5, 07l §3; KW1 добавил левый шов): имена поверхностей,
  // подсказки и честные aria-значения разделителей.
  "kora.resize.side.label": "Ширина мета-панели",
  "kora.resize.side.tooltip":
    "Потяните, чтобы изменить ширину. Двойной клик — вернуть как было",
  "kora.resize.nav.label": "Ширина панели навигации",
  // Эфир (U5, 15-WOW §3.2): живая лента только из реальных событий шины;
  // тихая шина = честное пустое и ноль движения.
  "kora.ether.caps": "Эфир — всё, что происходит в сессиях сейчас",
  "kora.ether.title": "Лента Эфира",
  "kora.ether.empty":
    "Событий пока нет — лента собирает то, что происходит в сессиях, пока вы на странице",
  "kora.ether.emptyFiltered": "Событий по хосту {{host}} пока нет",
  "kora.ether.online": "{{name}} на {{host}} — на связи",
  "kora.ether.onlineNoHost": "{{name}} — на связи",
  "kora.ether.offline": "{{name}} на {{host}} — оффлайн",
  "kora.ether.offlineNoHost": "{{name}} — оффлайн",
  "kora.ether.registered": "Новый агент: {{name}} на {{host}}",
  "kora.ether.registeredNoHost": "Новый агент: {{name}}",
  "kora.ether.report": "Доклад по задаче {{task}}",
  "kora.ether.reportBy": "{{actor}}: доклад по задаче {{task}}",
  // Композер (07j §4.6, И1-срез dressing map §1.2.4): поле и машина
  // реальны, отправка честно отложена; фейк доставки запрещён (07a §1).
  "kora.composer.label": "Написать агенту в эту сессию",
  "kora.composer.placeholder": "Написать агенту…",
  "kora.composer.send": "Отправить",
  "kora.composer.sendLaterChip": "Отправка появится позже",
  "kora.composer.sendLaterNote":
    "Отправка сообщений агенту появится позже — пока Кора показывает ход сессий. Черновик сохраняется на этой машине и переживёт перезагрузку страницы.",
  // Персист черновика (U5, ключ vesmaro.koraDraft:{sessionId}): индикация
  // честная — «сохранён» только после реальной записи, сбой назван.
  "kora.composer.draftSaved": "Черновик сохранён",
  "kora.composer.draftFailed":
    "Черновик не сохранился — он живёт, пока открыта страница",
  // «Завершена» в реестре сессий пока нет (live/idle/dead) — строка ждёт
  // своего состояния; «прервана» = процесс мёртв.
  "kora.composer.finishedNote":
    "Сессия завершена — писать некому; начните новую на хосте",
  "kora.composer.interruptedNote": "Сессия прервана — агент здесь уже не слушает",
  // Hermes-мост (T004 срез 2, hermes-bridge 2026-10-10): источник «hermes» —
  // первый класс: селектор фильтра, статус-строка (данные, не пульс),
  // ручное обновление (один живой пулл по кнопке), честный офф и пустота.
  "kora.hermes.filterOption": "Hermes (кластер)",
  "kora.hermes.sourceName": "Hermes (кластер)",
  "kora.hermes.stateOk": "подключён",
  "kora.hermes.stateOff": "не подключён",
  "kora.hermes.registryCount": "сессий в реестре: {{n}}",
  "kora.hermes.statusLoading": "Читаем статус моста hermes",
  "kora.hermes.statusUnknown": "Статус моста hermes пока неизвестен",
  "kora.hermes.offTitle": "Hermes не подключён",
  "kora.hermes.offDefaultReason": "Причина включения не названа на борде",
  "kora.hermes.offHint":
    "Ключ HERMES_API_KEY передаётся через deploy-канал (env пода борда) — и источник включится без изменения кода.",
  "kora.block2.titleHermes": "Сессии · Hermes (кластер)",
  "kora.hermes.refresh": "Обновить",
  "kora.hermes.refreshing": "Обновляем…",
  "kora.hermes.emptyNoPull":
    "Сессий пока нет — нажмите «Обновить»: борд запросит живой список у кластера hermes и положит его в реестр",
  "kora.hermes.reasoning": "Размышления",
  "kora.hermes.toolCalls": "Вызовы инструментов: {{n}}",
  "kora.hermes.chatTitle": "Чат с hermes",
  "kora.hermes.chatRegion": "Чат hermes",
  "kora.hermes.chatAnchor": "продолжение сессии {{name}}",
  "kora.hermes.chatNoAnchor":
    "сессий api_server источника в реестре нет — ответ начнётся с чистого листа",
  "kora.hermes.chatEmpty":
    "Пока пусто — напишите в кластер hermes; ответ придёт целиком, без потока",
  "kora.hermes.chatInput": "Сообщение для hermes",
  "kora.hermes.chatPlaceholder": "Напишите в кластер hermes…",
  "kora.hermes.chatSend": "Отправить",
  "kora.hermes.chatSending": "Отправляем… (ответ придёт целиком, до 60 секунд)",
  "kora.hermes.chatErrorPrefix": "Не доставлено: ",
  "kora.hermes.chatNote":
    "Ответ приходит целиком, не потоково; лимит чата — 12 сообщений в минуту",
  "kora.hermes.chatUnknownReply":
    "Ответ получен, но текст в нём не распознан — формат hermes не совпал с ожидаемым",
  "kora.hermes.chatAnnounce": "Ответ hermes получен",
  // KW2 «Живой чат»: шапка чата — переключатель сессий (пишет роут), выбор
  // модели (ростер из /status, дефолт preselected), бейдж источника (данные
  // сервера, не декор) и честная нота неперсистентности (POST /chat
  // бессостояний — ответ не попадает в транскрипт сессии).
  "kora.hermes.chatSourceBadge": "hermes · real-time",
  "kora.hermes.chatSessionLabel": "Сессия",
  "kora.hermes.modelLabel": "Модель",
  "kora.hermes.chatNonPersistent":
    "Ответы чата не записываются в транскрипт сессии hermes — нить переписки живёт на этой странице, перезагрузка покажет хранимую историю сессии",
  // Зона «Все ходы» (KW2, kora-rethink blueprint §4): свёрнутая полоса —
  // дефолт; разворот = транскрипт сегодняшней грамматикой; высота персистится
  // только на commit (vesmaro.koraMovesH), авто = отсутствие ключа.
  "kora.moves.region": "Все ходы",
  "kora.moves.caps": "Все ходы · {{n}}",
  "kora.moves.expand": "Развернуть",
  "kora.moves.collapse": "Свернуть",
  "kora.moves.seamLabel": "Высота зоны «Все ходы»",
  "kora.moves.seamTooltip":
    "Потяните, чтобы изменить высоту. Двойной клик — вернуть как было",
  // Честные aria-значения шва высоты (07l §3.3): авто названо авто, свёрнута
  // названа свёрнутой — расширенный шов докладывает свою геометрию сам.
  "kora.resize.autoPx": "авто, {{n}} px",
  "kora.resize.auto": "авто",
  "kora.resize.collapsedPx": "свёрнута, {{n}} px",

  // --- base kit state matrices (spec 05 §2.2/§2.5, волна U0) -----------------
  // Поле ввода: ошибка называется текстом, не только цветом (§2.5 error-ряд).
  "field.errorPrefix": "Ошибка:",
  // Чип-тег: отключённый фильтр объясняет причину (§2.2 disabled-ряд).
  "tag.filterUnavailable": "Фильтр недоступен здесь",

  // --- конвейер (U8 v12-UX-потоки): общие слова пошагового кита --------------
  // Состояние шага для скринридера: номер/✓ — визуальные глифы (aria-hidden),
  // состояние названо словом (WCAG 4.1.2).
  "flows.rail.stateDone": "Шаг пройден",
  "flows.rail.stateCurrent": "Текущий шаг",
  "flows.rail.stateUpcoming": "Шаг впереди",
  "flows.rail.backTitle": "Вернуться к шагу «{{step}}»",
  // Возобновление черновика (koraFrameStorage-прецедент): восстановление
  // названо и датировано — форма не притворяется, что её не закрывали.
  "flows.draft.restored":
    "Черновик восстановлен после перезагрузки (сохранён в {{time}})",
  "flows.draft.keepNote": "Черновик хранится локально и переживает перезагрузку",
  "flows.draft.startOver": "Начать заново",

  // --- конвейер подключения агента (U8): шаги «Данные → Токен → Первый
  // коннект». Прогресс = реальные состояния операции, не таймер.
  "agents.enrollment.railLabel": "Шаги подключения агента",
  "agents.enrollment.stepForm": "Данные",
  "agents.enrollment.stepToken": "Токен и команда",
  "agents.enrollment.stepConnect": "Первый коннект",
  "agents.enrollment.stepTokenTitle": "Токен создан — выполняется один раз",
  "agents.enrollment.watch": "Следить за коннектом",
  "agents.enrollment.backToToken": "К команде установки",
  "agents.enrollment.stepConnectTitle": "Ждём первый коннект: {{label}}",
  "agents.enrollment.watchWaiting":
    "Токен жив — выполните команду с шага «Токен и команда» на машине. Как только агент доложится серверу, шаг закроется сам.",
  "agents.enrollment.watchPollNote":
    "Статус обновляется автоматически; страницу можно закрыть — токен досматривается в списке ниже реестра.",
  "agents.enrollment.watchConnected":
    "Агент подключился — «{{name}}» зарегистрирован и ждёт одобрения",
  "agents.enrollment.watchApproveNote":
    "Остался последний шаг: одобрить нового исполнителя в реестре (сверка отпечатка).",
  "agents.enrollment.watchOpenRegistry": "Открыть реестр — одобрить",
  "agents.enrollment.watchApproved": "«{{name}}» подключён и одобрен — всё готово",
  "agents.enrollment.watchUsedNoRow":
    "Токен использован, но карточка исполнителя ещё не дошла до реестра — обновите страницу или загляните в реестр.",
  "agents.enrollment.watchExpired": "Срок действия токена истёк — коннекта не было",
  "agents.enrollment.watchExpiredHint":
    "Ничего не сломалось: машина просто не успела доложиться. Начните заново — свежий токен, те же поля.",
  "agents.enrollment.watchRestart": "Начать подключение заново",
  "agents.enrollment.watchRevoked":
    "Токен отозван — подключение по нему невозможно. Начните заново со свежим токеном.",
  "agents.enrollment.watchListError": "Не удалось обновить статус токена: {{message}}",
  "agents.enrollment.cancelNote":
    "Закрыть окно можно на любом шаге — токен от этого не гаснет и останется в списке ниже реестра (срок истечёт {{time}}).",

  // --- конвейер добавления хоста (U8): «Машина → Установка → Проверка».
  // Шаг = реальное состояние provision-задачи; таймерных прогрессов нет.
  "agents.provision.conveyorLabel": "Шаги подключения машины",
  "agents.provision.stepMachine": "Машина",
  "agents.provision.stepInstall": "Установка",
  "agents.provision.stepVerify": "Проверка",
  "agents.provision.detachNote":
    "Карточку можно закрыть — установка НЕ отменится: она продолжится на сервере, а при возвращении карточка снова подхватит задачу.",

  // --- models fleet: hub «Модели» (MF1, ux-blueprint §6) ---------------------
  "nav.agentsModels": "Модели",
  "models.hub.title": "Модели",
  "models.hub.loading": "Загружаем ростер моделей",
  "models.hub.failed": "Не удалось загрузить ростер моделей",
  "models.hub.empty.title": "Моделей пока не видно",
  "models.hub.empty.message":
    "Борд пока не видит ни одного факта о моделях: провайдеры не подключены, агенты ничего не отчитали, борд-ростер пуст.",
  "models.hub.connectedTitle": "Подключённые провайдеры",
  "models.hub.mirrorTitle": "Найдено агентами — не подключено",
  "models.hub.mirrorEmpty": "Модели пока не видны — ждём отчёт агентов",
  "models.hub.boardTitle": "Борд-ростер",
  "models.hub.boardBadge": "борд",
  "models.hub.boardCluster": "(кластер)",
  "models.hub.boardNoModels": "Модели не указаны",
  "models.hub.noKey": "без ключа",
  "models.hub.modelsCount": "модели: {{count}}",
  "models.hub.overflow": "…и ещё {{count}}",
  "models.hub.defaultModel": "дефолт: {{model}}",
  "models.hub.mirrorSeenOn": "найдено на {{where}}",
  "models.hub.mirrorAuthConfigured": "ключ настроен локально",
  "models.hub.mirrorAuthAnonymous": "анонимно",
  "models.hub.mirrorAuthUnknown": "ключ: неизвестно",
  "models.hub.sourceConfig": "источник: конфиг харнеса",
  "models.hub.sourceProbe": "источник: локальный сервер моделей",

  // --- models fleet: подключение провайдеров (MF2, ux-blueprint §3/§6,
  // --- security-verdict §5: ключ write-only, слот set/unset/rejected) ---
  "models.hub.connectCta": "Подключить провайдера",
  "models.hub.connectedEmpty": "Провайдеров пока не подключено.",
  "models.slot.set": "Ключ установлен",
  "models.slot.unset": "Не подключён — ключ не установлен",
  "models.slot.rejected": "Ключ отклонён провайдером",
  "models.slot.unknown": "Статус ключа пока неизвестен",
  "models.slot.fingerprintHint": "Отпечаток — это не ключ",
  "models.slot.setAt": "установлен {{date}}",
  "models.off.title": "Подключение провайдеров выключено",
  "models.off.reason":
    "На борде не настроен каталог секретов (VESMARO_SECRETS_DIR) — регистрация и замена ключей недоступны.",
  // --- MF3: слот-факты + гранты (ux §3.2/§3.3, pull-семантика вердикта)
  "models.slot.usedAt": "использован {{when}}",
  "models.slot.neverUsed": "не использовался",
  "models.slot.rejectedAt": "последняя попытка {{when}}",
  "models.grants.title": "Доступ",
  "models.grants.empty":
    "Доступ никуда не выдан — провайдер доступен только борду",
  "models.grants.grantCta": "Выдать доступ",
  "models.grants.needsKey":
    "Сначала установите ключ — доступ выдаётся только подключённому провайдеру",
  "models.grants.colWho": "Кому",
  "models.grants.colKind": "Тип",
  "models.grants.colStatus": "Статус",
  "models.grants.colGranted": "Выдан",
  "models.grants.colBy": "Кем",
  "models.grants.colAction": "Действие",
  "models.grants.kindHostRow": "хост",
  "models.grants.kindExecutorRow": "исполнитель",
  "models.grants.statusActive": "активен",
  "models.grants.statusPaused": "приостановлен",
  "models.grants.switchLabel": "Доступ для {{who}}",
  "models.grants.unknownDate": "—",
  "models.grants.revokeCta": "Отозвать",
  "models.grants.revokeConfirmCta": "Отозвать доступ",
  "models.grants.revoking": "Отзываем…",
  "models.grants.revokeConfirm":
    "Отозвать доступ для {{who}}? Следующий вызов с этого адреса пройдёт без доступа.",
  "models.grants.pullPromise":
    "Пауза и отзыв действуют сразу: следующий вызов с этого адреса пройдёт без доступа.",
  "models.grants.dialogTitle": "Выдать доступ",
  "models.grants.dialogDescription":
    "Выберите, откуда разрешены вызовы провайдера через борд. Ключ остаётся на борде — раздачи ключей нет.",
  "models.grants.kindGroupLabel": "Кому выдать доступ",
  "models.grants.kindHosts": "Хосты",
  "models.grants.kindExecutors": "Исполнители",
  "models.grants.search": "Поиск по списку",
  "models.grants.searchEmpty": "Ничего не найдено",
  "models.grants.emptyRegistry":
    "Нет хостов в реестре — сначала подключите агента",
  "models.grants.emptyRegistryLink": "Подключить агента",
  "models.grants.alreadyGranted": "доступ уже выдан",
  "models.grants.granting": "Выдаём…",
  "models.grants.dialogError": "Не удалось выдать доступ.",
  "models.card.setKey": "Установить ключ",
  "models.card.rotate": "Заменить ключ",
  "models.card.removeKey": "Удалить ключ",
  "models.card.removing": "Удаляем…",
  "models.card.removeConfirmTitle": "Удалить ключ?",
  "models.card.removeConfirm":
    "Ключ будет удалён из хранилища. Провайдер останется в списке как «не подключён»; управление доступом включится в следующей волне.",
  "models.card.removeKeep": "Оставить",
  "models.card.removeConfirmCta": "Удалить ключ",
  "models.form.title": "Подключить провайдера",
  "models.form.rotateTitle": "Заменить ключ",
  "models.form.description":
    "Ключ уходит на борд один раз и сохраняется только в каталоге секретов — ни ответы, ни журнал его не содержат.",
  "models.form.name": "Имя",
  "models.form.nameHint": "латиница, цифры, дефис — до 60 символов",
  "models.form.errName": "Имя: латиница в нижнем регистре, цифры и дефис, до 60 символов",
  "models.form.baseUrl": "Base URL",
  "models.form.baseUrlPreview": "сохранится как: {{url}}",
  "models.form.key": "Ключ",
  "models.form.keyHint":
    "Ключ сохраняется один раз и больше не показывается — проверьте перед сохранением.",
  "models.form.reveal": "Показать",
  "models.form.hide": "Скрыть",
  "models.form.submit": "Подключить провайдера",
  "models.form.rotateSubmit": "Заменить ключ",
  "models.form.saving": "Сохраняем…",
  "models.form.cancel": "Отмена",
  "models.toast.connected": "Провайдер подключён",
  "models.toast.rotated": "Ключ заменён",
  "models.toast.removed": "Ключ удалён",

} as const;

export type TranslationKey = keyof typeof ru;
