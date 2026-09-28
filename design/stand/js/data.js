/* data.js — «Живая кора» stand demo fixtures (RU). Plausible mnemos-project data.
 * Every record: id, title, confidence (0–1), tags, provenance (who·where·when),
 * age label, and scroll content for the master-detail view. */
(function () {
  "use strict";

  const memories = [
    {
      id: "T-128",
      title: "UI-10 проводник",
      conf: 0.92,
      tags: ["ui", "agents"],
      prov: "agb · mnemos-01 · 2 ч",
      age: 2,
      kind: "задача",
      content: [
        "Решение по задаче UI-10: проводник проектов открывает дерево слева, редактор в центре, панель агентов справа. Три колонки — не догма: на узких экранах панель агентов уезжает вниз.",
        "Ключевое правило: правки агента подсвечиваются золотом в дереве и во вкладках редактора. Конфликт двух писателей — блокер, бейдж «конфликт», не цветом одним.",
        "Открытый вопрос: что показывать в панели агентов, когда пишет больше двух агентов. Черновик — очередь правок по времени, свежие сверху.",
      ],
    },
    {
      id: "T-121",
      title: "Пейринг QR",
      conf: 0.74,
      tags: ["pairing"],
      prov: "owner · abyss · 1 д",
      age: 24,
      kind: "задача",
      content: [
        "Пейринг устройства к колодцу памяти — через QR: устройство показывает код, владелец сканирует с телефона. Ручной ввод ключа остаётся запасным путём для headless-хостов.",
        "Замечание с ревью: QR должен жить не дольше 90 секунд, после — перегенерация. Иначе код, засветившийся на скриншоте, живёт вечно.",
      ],
    },
    {
      id: "M-204",
      title: "Решение по пейрингу: QR вместо ручного ввода",
      conf: 0.88,
      tags: ["pairing", "security"],
      prov: "owner · abyss · 3 ч",
      age: 3,
      kind: "решение",
      content: [
        "Выбрали QR-пейринг: меньше ручных ошибок, ключ не проходит через буфер обмена. Токен устройства одноразовый, живёт 90 секунд, хранится только на устройстве.",
        "Ссылка на задачу: T-121. Связанные записи: heartbeat-контракт агентов (M-215) — там тот же принцип «секрет не живёт дольше сессии».",
      ],
    },
    {
      id: "M-189",
      title: "Почему борд задач заморожен",
      conf: 0.81,
      tags: ["tasks", "process"],
      prov: "owner · abyss · 1 д",
      age: 26,
      kind: "заметка",
      content: [
        "Борд заморожен на время рефакторинга сессий: перетаскивание карточек конфликтовало с автопереносами агентов. Разморозить после того, как assignment получит единственного владельца.",
        "Признак разморозки: в журнале исполнений нет событий «перенял задачу» за неделю.",
      ],
    },
    {
      id: "M-215",
      title: "Heartbeat-контракт агентов",
      conf: 0.95,
      tags: ["agents", "contract"],
      prov: "core · mnemos-01 · 5 ч",
      age: 5,
      kind: "контракт",
      content: [
        "Агент шлёт heartbeat каждые 30 секунд, пока держит assignment. Молчание дольше 10 минут — предупреждение у строки; дольше 30 — исполнение считается потерянным и уходит обратно в очередь.",
        "«reported by X» — честная идентичность: подпись агента никогда не маскируется под владельца. Непроверенные отчёты помечаются «unverified».",
      ],
    },
    {
      id: "M-177",
      title: "Выбор шрифтов: Inter, Lora, JetBrains Mono",
      conf: 0.9,
      tags: ["ui", "design"],
      prov: "owner · abyss · 6 д",
      age: 144,
      kind: "решение",
      content: [
        "Три семейства и ни одним больше: Inter — интерфейс, Lora — содержание записей («свиток»), JetBrains Mono — числа, id, провенанс и терминал. Позиция запятых в числах выравнивается tabular-nums.",
        "Отказ: системный стек как основной — теряется характер «приборного кокпита»; как fallback — обязателен.",
      ],
    },
    {
      id: "M-156",
      title: "Лестница страт коры: пять уровней глубины",
      conf: 0.86,
      tags: ["ui", "design"],
      prov: "owner · abyss · 7 д",
      age: 168,
      kind: "решение",
      content: [
        "Глубина интерфейса = слои коры: canvas (дно колодца) → base → well → elevated → overlay. Чем глубже поверхность, тем она темнее; в светлой теме лестница инвертируется по свету, не по смыслу.",
        "Страт-тинты запрещены на карточках с текстом — иначе читались бы как статус. Только wash больших амбиентных поверхностей.",
      ],
    },
    {
      id: "M-201",
      title: "SSE-лента: контракт переподключения",
      conf: 0.93,
      tags: ["sync", "contract"],
      prov: "core · mnemos-01 · 8 ч",
      age: 8,
      kind: "контракт",
      content: [
        "Разрыв соединения — не молчание: пилюля в топбаре переходит в «подключаемся…» на 30 секунд, потом честное «нет связи» с кнопкой «Переподключить». Лента при разрыве не рисует событий — пустота честнее выдуманных данных.",
        "После восстановления лента дозапрашивает пропущенное окно, а не притворяется, что ничего не было.",
      ],
    },
    {
      id: "M-148",
      title: "Мнемос-ID в отчётах: сноски вместо тела",
      conf: 0.79,
      tags: ["process", "reporting"],
      prov: "owner · abyss · 12 д",
      age: 288,
      kind: "заметка",
      content: [
        "Идентификаторы записей и SHA в отчётах владельцу уходят в сноски, не в тело текста. Тело — человеческим языком: «в чём проблема / что мешает / что делать».",
        "Правило проверено на трёх проектах: отчёты с ID в теле перестают читать после второй страницы.",
      ],
    },
    {
      id: "M-233",
      title: "Схема провенанса: кто · где · когда",
      conf: 0.91,
      tags: ["memory", "contract"],
      prov: "agb · mnemos-01 · 30 мин",
      age: 1,
      kind: "контракт",
      content: [
        "Каждая запись несёт тройку провенанса: кто написал (владелец или агент), где (сервер или сессия), когда (человеческий возраст). Числа — mono, подписи — капс.",
        "Провенанс — часть записи, а не украшение: без него «уверенность» ничего не стоит.",
      ],
    },
    {
      id: "M-219",
      title: "Словарь импульсов: событие → цвет → место",
      conf: 0.94,
      tags: ["design", "motion"],
      prov: "owner · abyss · 1 ч",
      age: 1,
      kind: "решение",
      content: [
        "Импульс по ребру бежит только на реальное событие: recall — ирис, запись агента — золото, ошибка — тёплый красный. Цвет импульса всегда дублируется текстом в ленте. Импульс без события — блокер ревью.",
        "Затухание — не дольше 240 мс; glow budget: не больше двух источников свечения в кадре.",
      ],
    },
    {
      id: "M-241",
      title: "Теги памяти: первая сотня",
      conf: 0.68,
      tags: ["memory", "tags"],
      prov: "agb · mnemos-02 · 3 д",
      age: 72,
      kind: "заметка",
      content: [
        "Черновик тег-словаря: домены (ui, agents, sync, security), процессы (reporting, review), дизайн (design, motion). Синонимы склеиваются алиасами: «агенты» = agents.",
        "Уверенность низкая — словарь ещё не утверждён владельцем.",
      ],
    },
  ];

  const servers = [
    { name: "mnemos-01", status: "ok" },
    { name: "mnemos-02", status: "ok" },
    { name: "abyss-lab", status: "ok" },
    { name: "seal-vault", status: "warn" },
  ];

  const counters = {
    total: "12 483",
    tags: 342,
    pulsesHour: 37,
    waiting: 3,
  };

  const waiting = [
    { id: "W-12", title: "Утвердить тег-словарь (M-241)", cta: "Открыть" },
    { id: "W-11", title: "Разморозить борд после рефакторинга сессий", cta: "Открыть" },
    { id: "W-9", title: "Подтвердить пейринг нового устройства", cta: "Открыть" },
  ];

  const agents = [
    { id: "agb", desc: "писатель записей", status: "running" },
    { id: "core", desc: "ядро памяти", status: "queued" },
    { id: "morph", desc: "рефакторинг", status: "failed" },
  ];

  const assignments = {
    active: [
      {
        agent: "agb",
        task: "T-128",
        title: "UI-10 проводник",
        status: "running",
        hb: "пульс 40 с назад",
        report: "reported by agb (unverified)",
      },
    ],
    queued: [
      {
        agent: "core",
        task: "T-131",
        title: "Дозапись смыслового индекса",
        status: "queued",
        wait: "в очереди 4 мин",
        harness: "zcode",
      },
      {
        agent: "morph",
        task: "T-127",
        title: "Чистка дублей тегов",
        status: "queued",
        wait: "в очереди 12 мин",
        harness: "zcode",
        stagnant: true,
        note: "поллер молчит",
      },
    ],
  };

  const agentFeed = [
    { time: "14:02", agent: "agb", text: "отчёт (промежуточный): волна 1 закрыта", kind: "write" },
    { time: "13:47", agent: "core", text: "дозапись индекса: 214 записей переиндексировано", kind: "write" },
    { time: "13:12", agent: "morph", text: "assignment T-124 упал: конфликт записи с agb", kind: "error" },
    { time: "12:58", agent: "agb", text: "сверился с «Heartbeat-контрактом» при правке", kind: "recall" },
    { time: "12:31", agent: "core", text: "heartbeat восстановлен после паузы", kind: "recall" },
  ];

  const docs = [
    {
      id: "mnemos-eyes",
      title: { ru: "mnemos-eyes", orig: "mnemos-eyes" },
      snippet: {
        ru: "Вьюер памяти: «живая кора», колодец, импульсы по живой ленте.",
        orig: "Memory viewer: living cortex, the well, live-feed impulses.",
      },
      count: 48,
      updated: "обновлён 2 ч назад",
      prov: "agb · 3 сервера",
      featured: true,
      exp: false,
      paused: false,
    },
    {
      id: "gcw",
      title: { ru: "gcw", orig: "gcw" },
      snippet: {
        ru: "Оркестрация команды агентов: роли, гейты, протоколы отчётов.",
        orig: "Agent team orchestration: roles, gates, reporting protocols.",
      },
      count: 112,
      updated: "обновлён 1 д назад",
      prov: "owner · 1 сервер",
      featured: false,
      exp: false,
      paused: false,
    },
    {
      id: "sealbox",
      title: { ru: "sealbox", orig: "sealbox" },
      snippet: {
        ru: "Хранилище секретов: одноразовые ключи, QR-пейринг устройств.",
        orig: "Secret vault: one-shot keys, device QR pairing.",
      },
      count: 21,
      updated: "обновлён 9 д назад",
      prov: "owner · seal-vault",
      featured: false,
      exp: false,
      paused: true,
    },
  ];

  const explorerFiles = [
    {
      name: "web/",
      type: "dir",
      children: [
        {
          name: "styles/",
          type: "dir",
          children: [
            { name: "tokens.css", type: "file", edited: true },
            { name: "base.css", type: "file" },
          ],
        },
        { name: "app.js", type: "file" },
        { name: "index.html", type: "file" },
      ],
    },
    {
      name: "docs/",
      type: "dir",
      children: [
        { name: "ui-contract.md", type: "file" },
        { name: "adr-0006-frozen-tokens.md", type: "file" },
      ],
    },
    { name: "README.md", type: "file" },
  ];

  const editorTabs = [
    { name: "tokens.css", agent: "agb", note: "agb правит сейчас", lines: "строки 40–48", conflict: false, active: true },
    { name: "base.css", agent: null },
    { name: "adr-0006-frozen-tokens.md", agent: null },
  ];

  const codeLines = [
    "/* tokens — frozen names (ADR 0006) */",
    ":root {",
    "  --color-well-canvas: #090b0f;",
    "  --color-bg-base: #0d0f14;",
    "  --color-bg-well: #12161d;",
    "",
    "  /* v2: charcoal вместо сине-фиолетового уклона */",
    "  --color-bg-elevated: #161b23;",
    "  --color-bg-overlay: #1c222c;",
  ];
  const editedFrom = 5; // 1-based line the agent is editing from

  const buddy = [
    { agent: "agb", note: "«волна 1 закрыта, перехожу к правкам токенов»", lines: "строки 40–48 · tokens.css", diff: true },
    { agent: "core", note: "ждёт разбора индекса", lines: "—", diff: false },
  ];

  const termFiles = {
    "projects/": ["mnemos-eyes/", "gcw/", "sealbox/"],
    "projects/mnemos-eyes/README.md":
      "# mnemos-eyes — вьюер памяти\nКора держит, колодец светит, импульс говорит правду.\nСтенд дизайна: design/stand/, тёмная тема по умолчанию.\n",
    "projects/gcw/README.md":
      "# gcw — GithubCopilotWorkflow\nОркестрация команды агентов: роли, гейты, протоколы отчётов.\nРелизы — только через git-workflow-specialist.\n",
    "projects/sealbox/README.md":
      "# sealbox — хранилище секретов\nОдноразовые ключи, QR-пейринг устройств (90 секунд).\nСекреты не покидают vault без явного решения владельца.\n",
    "README.md":
      "# колодец mnemos\nПамять как организм: кора, страты, синапс-импульсы.\nИмпульс бежит только на реальное событие из ленты.\n",
    "notes.md":
      "# заметки\n- heartbeat агентов: 30 с; молчание 10 мин → предупреждение\n- QR-пейринг живёт 90 с, потом перегенерация\n- свиток читается в Lora, числа — JetBrains Mono\n",
  };

  const feedSeed = [
    { ev: "recall", mem: "M-219", text: "поиск нашёл «Словарь импульсов» — точное совпадение по запросу", time: "14:06" },
    { ev: "write", mem: "M-233", text: "агент agb записал «Схему провенанса»", time: "14:02" },
    { ev: "recall", mem: "M-215", text: "поиск нашёл «Heartbeat-контракт» — ссылка из свитка", time: "13:58" },
    { ev: "write", mem: "M-219", text: "агент core обновил индекс «Словаря импульсов»", time: "13:51" },
    { ev: "error", mem: "M-201", text: "SSE-разрыв на mnemos-02 — переподключились за 8 с", time: "13:47" },
    { ev: "recall", mem: "M-177", text: "поиск нашёл «Выбор шрифтов» — открытие записи", time: "13:40" },
    { ev: "write", mem: "M-241", text: "агент agb дополнил черновик тег-словаря", time: "13:32" },
    { ev: "recall", mem: "M-189", text: "поиск нашёл «Почему борд заморожен» — переход из поиска", time: "13:24" },
  ];

  const feedPool = [
    { ev: "recall", mem: "M-215", text: "поиск нашёл «Heartbeat-контракт агентов» — точное совпадение" },
    { ev: "write", mem: "M-233", text: "агент agb внес правку в «Схему провенанса»" },
    { ev: "recall", mem: "M-156", text: "поиск нашёл «Лестницу страт» — переход из свитка" },
    { ev: "recall", mem: "M-219", text: "поиск нашёл «Словарь импульсов» — ссылка в отчёте" },
    { ev: "write", mem: "M-241", text: "агент agb правит раздел тег-словаря" },
    { ev: "error", mem: "M-201", text: "mnemos-02 не ответил на дозапрос ленты" },
    { ev: "recall", mem: "M-177", text: "поиск нашёл «Выбор шрифтов» — открытие записи" },
    { ev: "write", mem: "M-128", text: "агент agb написал черновик к «UI-10 проводник»" },
  ];

  /* Well graph: 68 nodes in 4 project clusters (mnemos-eyes / gcw / sealbox / core).
   * First 12 = the real fixture memories (feed event ids point at them); the rest
   * are plausible demo records of the same memory organism. */
  function w(id, title, conf, age, cluster, tags, prov) {
    return { id: id, title: title, conf: conf, age: age, kind: "заметка", tags: tags, prov: prov, cluster: cluster, content: [] };
  }
  const wellNodes = [
    // ── реальные фикстуры (совпадают с feedPool/палитрой) ──
    w("T-128", "UI-10 проводник", 0.92, 2, 0, ["ui", "agents"], "agb · mnemos-01"),
    w("T-121", "Пейринг QR", 0.74, 24, 2, ["pairing"], "owner · abyss"),
    w("M-204", "Решение по пейрингу: QR вместо ручного ввода", 0.88, 3, 2, ["pairing", "security"], "owner · abyss"),
    w("M-189", "Почему борд задач заморожен", 0.81, 26, 1, ["tasks", "process"], "owner · abyss"),
    w("M-215", "Heartbeat-контракт агентов", 0.95, 5, 1, ["agents", "contract"], "core · mnemos-01"),
    w("M-177", "Выбор шрифтов: Inter, Lora, JetBrains Mono", 0.9, 144, 0, ["ui", "design"], "owner · abyss"),
    w("M-156", "Лестница страт коры: пять уровней глубины", 0.86, 168, 0, ["ui", "design"], "owner · abyss"),
    w("M-201", "SSE-лента: контракт переподключения", 0.93, 8, 0, ["sync", "contract"], "core · mnemos-01"),
    w("M-148", "Мнемос-ID в отчётах: сноски вместо тела", 0.79, 288, 1, ["process", "reporting"], "owner · abyss"),
    w("M-233", "Схема провенанса: кто · где · когда", 0.91, 1, 3, ["memory", "contract"], "agb · mnemos-01"),
    w("M-219", "Словарь импульсов: событие → цвет → место", 0.94, 1, 0, ["design", "motion"], "owner · abyss"),
    w("M-241", "Теги памяти: первая сотня", 0.68, 72, 3, ["memory", "tags"], "agb · mnemos-02"),
    // ── кластер mnemos-eyes ──
    w("M-301", "Свиток: переносы строк в Lora", 0.87, 12, 0, ["ui"], "agb · mnemos-01"),
    w("M-302", "Палитра Ctrl+K: скелетон-состояние", 0.82, 9, 0, ["ui", "motion"], "agb · mnemos-01"),
    w("M-303", "Хоткей «[»: сворачивание сайдбара", 0.9, 20, 0, ["ui"], "owner · abyss"),
    w("M-304", "Тосты: канал обратной связи", 0.85, 30, 0, ["ui"], "agb · mnemos-01"),
    w("M-305", "Скелетоны: shimmer без blur", 0.78, 40, 0, ["ui", "motion"], "agb · mnemos-02"),
    w("M-306", "Skip-link: первый таб-стоп", 0.92, 50, 0, ["ui", "a11y"], "owner · abyss"),
    w("M-307", "Крошки: обрезка по середине", 0.8, 60, 0, ["ui"], "agb · mnemos-01"),
    w("M-308", "Пилюля live: glow 16px", 0.83, 70, 0, ["ui", "motion"], "agb · mnemos-01"),
    w("M-309", "DPR cap 2 для канваса", 0.88, 80, 0, ["ui", "perf"], "core · mnemos-01"),
    w("M-310", "Idle-ребро: миелин 0.5px", 0.76, 90, 0, ["ui", "design"], "owner · abyss"),
    w("M-311", "Focus-ринг на sticky-панелях", 0.91, 100, 0, ["ui", "a11y"], "owner · abyss"),
    w("M-312", "Сегмент-контрол режимов поиска", 0.84, 110, 0, ["ui"], "agb · mnemos-01"),
    w("M-313", "Сырой вид записи: raw ▾", 0.72, 120, 0, ["ui"], "agb · mnemos-02"),
    w("M-314", "Пустой колодец: 3 узла-семени", 0.69, 130, 0, ["ui", "design"], "owner · abyss"),
    w("M-315", "Мобильный топбар: меню «⋮»", 0.75, 140, 0, ["ui"], "agb · mnemos-01"),
    w("M-316", "Плотность: компакт 32px строки", 0.86, 150, 0, ["ui"], "owner · abyss"),
    w("M-317", "Bento: против одинаковых плиток", 0.89, 160, 0, ["ui", "design"], "owner · abyss"),
    w("M-318", "Иконки: lucide-стиль, stroke 1.5", 0.93, 170, 0, ["ui", "design"], "owner · abyss"),
    w("M-319", "Галерея: витрина канона", 0.81, 180, 0, ["ui", "design"], "agb · mnemos-01"),
    // ── кластер gcw ──
    w("M-320", "Роли: границы и hard denials", 0.94, 55, 1, ["process"], "owner · abyss"),
    w("M-321", "Гейт ревью: veto-правила", 0.9, 65, 1, ["process", "review"], "owner · abyss"),
    w("M-322", "Отчёт волны: checkpoint board", 0.87, 75, 1, ["process", "reporting"], "owner · abyss"),
    w("M-323", "Мнемос-гейты G1–G4", 0.96, 85, 1, ["process", "memory"], "owner · abyss"),
    w("M-324", "Delegation: параллельные лейны", 0.83, 95, 1, ["process"], "owner · abyss"),
    w("M-325", "Блок «Ждут владельца»: формат", 0.88, 105, 1, ["process", "reporting"], "owner · abyss"),
    w("M-326", "Slice report: что/где/как проверено", 0.85, 115, 1, ["process"], "owner · abyss"),
    w("M-327", "Коммит-стиль: type(scope)", 0.92, 125, 1, ["process"], "owner · abyss"),
    w("M-328", "A2A: таблица маршрутизации", 0.8, 135, 1, ["process"], "owner · abyss"),
    w("M-329", "Канонизация: очередь для архитектора", 0.77, 145, 1, ["process"], "owner · abyss"),
    w("M-330", "Прогресс: living roadmap по волнам", 0.86, 155, 1, ["process"], "owner · abyss"),
    w("M-331", "Токен-экономика: recall перед чтением", 0.91, 165, 1, ["process", "memory"], "owner · abyss"),
    w("M-332", "Архком: реальные позиции и споры", 0.84, 175, 1, ["process"], "owner · abyss"),
    w("M-333", "Финальный отчёт: пять пунктов", 0.79, 185, 1, ["process", "reporting"], "owner · abyss"),
    w("M-334", "Чекпоинт в мнемос: каждые 5 ходов", 0.9, 195, 1, ["process", "memory"], "owner · abyss"),
    w("M-335", "Owner-mandate: приоритеты и эскалация", 0.93, 205, 1, ["process"], "owner · abyss"),
    // ── кластер sealbox ──
    w("M-340", "QR-пейринг: окно 90 секунд", 0.89, 15, 2, ["security", "pairing"], "owner · seal-vault"),
    w("M-341", "Одноразовый токен устройства", 0.92, 25, 2, ["security"], "owner · seal-vault"),
    w("M-342", "Маскирование секретов в логах", 0.95, 35, 2, ["security"], "owner · seal-vault"),
    w("M-343", "env:/file: ссылки вместо секретов", 0.9, 45, 2, ["security"], "owner · seal-vault"),
    w("M-344", "Vault: доступ по решению владельца", 0.97, 55, 2, ["security"], "owner · seal-vault"),
    w("M-345", "Ротация ключей сессии", 0.82, 65, 2, ["security"], "owner · seal-vault"),
    w("M-346", "Подпись отчёта: seal", 0.76, 75, 2, ["security"], "owner · seal-vault"),
    w("M-347", "Backup-ключи: оффлайн-хранение", 0.84, 85, 2, ["security"], "owner · seal-vault"),
    w("M-348", "Аудит доступа: журнал событий", 0.87, 95, 2, ["security"], "owner · seal-vault"),
    w("M-349", "Пин-пейринг: fallback без камеры", 0.71, 105, 2, ["security", "pairing"], "owner · seal-vault"),
    // ── кластер core (ядро памяти) ──
    w("M-350", "Индекс: инкрементальная дозапись", 0.93, 18, 3, ["memory", "sync"], "core · mnemos-02"),
    w("M-351", "Confidence: пересчёт при правке", 0.88, 28, 3, ["memory"], "core · mnemos-02"),
    w("M-352", "Сжатие старых сессий", 0.8, 38, 3, ["memory"], "core · mnemos-02"),
    w("M-353", "Синонимы тегов: алиасы", 0.74, 48, 3, ["memory", "tags"], "core · mnemos-02"),
    w("M-354", "Дедупликация записей", 0.85, 58, 3, ["memory"], "core · mnemos-02"),
    w("M-355", "SSE: переподключение 30 секунд", 0.94, 68, 3, ["sync"], "core · mnemos-02"),
    w("M-356", "Лента: окно дозагрузки пропущенного", 0.89, 78, 3, ["sync"], "core · mnemos-02"),
    w("M-357", "Снапшот графа: nightly", 0.83, 88, 3, ["memory"], "core · mnemos-02"),
    w("M-358", "Теги: счётчики использования", 0.78, 98, 3, ["memory", "tags"], "core · mnemos-02"),
    w("M-359", "Связи записей: синапсы по тегам", 0.86, 108, 3, ["memory"], "core · mnemos-02"),
  ];

  /* ── v2: hosts / registration tokens / kora sessions / status (07a–07f).
   * All user-facing strings already follow dictionary 07a: lifecycle status
   * line = «состояние · возраст · действие», ids live only in tech details. */

  const hosts = [
    {
      name: "laptop-go-1",
      lifecycle: "online",
      statusLine: "на связи · последний доклад 12 с назад",
      busyLine: "в работе: UI-10 · отчёт 6 мин назад",
      harness: "zcode",
      agents: ["zcode", "core", "vscode"],
      tasksActive: 1,
      now: {
        task: { title: "UI-10 проводник", state: "идёт", report: "отчёт 6 мин назад" },
        session: { harness: "zcode", opened: "открыта 41 мин" },
      },
      recent: [
        { time: "14:02", text: "агент доложился (опрос)" },
        { time: "12:40", text: "отчёт задачи «UI-10»: «волна 1 закрыта»", cta: true },
        { time: "09:15", text: "задача «UI-11» завершена — отчёт принят", cta: true },
      ],
      skills: [],
      roles: ["researcher", "frontend"],
      discovered: false,
      tech: {
        id: "hst-9f2a",
        registered: "зарегистрирован по токену регистрации · 2026-09-27",
        ip: "10.0.0.4",
        fp: "SHA256:9mXk…",
        agent: "v0.1.1",
        harnessVer: "0.9.2",
        transport: "докладывается из локальной сети",
        reports: "47 докладов за сегодня · интервал ~2 мин · средняя задержка 1,2 с",
      },
    },
    {
      name: "vpnus-1",
      lifecycle: "silent",
      statusLine: "молчит 4 мин",
      busyLine: "задач нет",
      harness: "pi",
      agents: ["pi", "hermes"],
      tasksActive: 0,
      now: { idle: "Простаивает 4 минуты" },
      recent: [
        { time: "13:58", text: "агент доложился (опрос)" },
        { time: "09:10", text: "сессия pi завершилась · 12 мин" },
      ],
      skills: ["терминал"],
      roles: [],
      discovered: false,
      tech: {
        id: "hst-41c0",
        registered: "зарегистрирован по токену регистрации · 25 сент",
        ip: "10.0.0.7",
        fp: "SHA256:Kk29…",
        agent: "v0.1.1",
        harnessVer: "3.1",
        transport: "через VPN",
        reports: "112 докладов за сегодня",
      },
    },
    {
      name: "laptop-zcode-1",
      lifecycle: "off",
      statusLine: "выключен владельцем",
      statusNote: "Новые задачи не получает; доклады продолжаются — машина жива",
      busyLine: "",
      harness: "zcode",
      agents: ["zcode"],
      tasksActive: 0,
      now: null,
      recent: [{ time: "08:30", text: "хост выключен владельцем" }],
      skills: ["терминал", "браузер"],
      roles: ["frontend"],
      discovered: false,
      tech: {
        id: "hst-77b3",
        registered: "зарегистрирован по токену регистрации · 20 сент",
        ip: "10.0.0.9",
        fp: "SHA256:Qa2e…",
        agent: "v0.1.1",
        harnessVer: "0.9.2",
        transport: "через VPN",
        reports: "за сегодня: 12 докладов",
      },
    },
    {
      name: "gpu-box",
      lifecycle: "provisioning",
      statusLine: "ставится…",
      statusNote: "Ставим агента на машину — обычно пара минут",
      busyLine: "",
      harness: null,
      agents: [],
      tasksActive: 0,
      now: null,
      recent: [],
      skills: [],
      roles: [],
      discovered: false,
      tech: {
        id: "hst-c84d",
        registered: "машина ещё ставится",
        ip: "10.0.0.12",
        fp: "—",
        agent: "—",
        harnessVer: "—",
        transport: "—",
        reports: "докладов ещё не было",
      },
    },
  ];

  const regTokens = [
    { state: "created", line: "Создан · только что · живёт до 14:15" },
    { state: "used", line: "Использован · laptop-go-1 · 14:02" },
    { state: "expired", line: "Истёк · 13:41" },
  ];

  /* ── v5: kora sessions per 07j §1–2. Times are OFFSETS from the "now"
   * anchor fixed at page load (07j §2.2) — never hand-written clock strings,
   * so a live session can never contradict its own transcript. Names are
   * human: the task («Командная: UI-10») or the owner's first reply, ≤48 ch.
   * Counters are derived from these records in kora.html — a literal number
   * in markup is a review bug (07j §2.2.3). */
  const koraSessions = [
    {
      id: "sess-41a2",
      host: "laptop-go-1",
      agent: "zcode",
      name: "Правка тестов токенов",
      state: "live",
      startedMinAgo: 41,
      lastActivityMinAgo: 2,
      topic: "Поправь тесты в tokens.test.ts: три падения на CI — порядок моков и флакующий таймер",
      shared: false,
      coverage: "full",
      digest: {
        steps: ["разобраны 3 падения", "порядок моков поправлен", "fake timers вместо таймаута", "прогон: 41 тест зелёный"],
        decisions: ["fake timers вместо sleep", "тесты не переписывались"],
        memory: [{ id: "M-242", title: "Порядок моков в tokens.test" }],
      },
      transcript: [
        { minFromStart: 0, who: "вы", text: "поправь тесты в tokens.test.ts" },
        { minFromStart: 2, who: "zcode", text: "разобрал 3 падения: двое — из-за порядка моков, одно — таймаут на медленном CI. Правлю порядок моков." },
        { minFromStart: 5, who: "вы", text: "а третий?" },
        { minFromStart: 5, who: "zcode", text: "третье — флакующий таймер; поставил fake timers, падение ушло." },
        { minFromStart: 9, who: "zcode", text: "тесты зелёные: 41 passed. Готово к ревью." },
        { minFromStart: 23, who: "вы", text: "собери краткий отчёт, что менял" },
        { minFromStart: 24, who: "zcode", text: "порядок моков в двух тестах + fake timers в test/tokens.test.ts. Больше ничего не трогал." },
        { minFromStart: 39, who: "вы", text: "обнови память по итогам" },
        { minFromStart: 39, who: "zcode", text: "записал в память: правки токенов, 41 тест зелёный." },
      ],
    },
    {
      id: "sess-5b21",
      host: "laptop-go-1",
      agent: "zcode",
      name: "Командная: UI-10",
      state: "live",
      startedMinAgo: 26,
      lastActivityMinAgo: 4,
      topic: "UI-10: панель агентов в проводнике. zcode — каркас и подсветка правок, core — подсказки из памяти",
      shared: true,
      participants: ["zcode", "core"],
      coverage: "mixed",
      coverageNote: "полный ход (zcode) + начало (core)",
      transcript: [
        { minFromStart: 0, who: "вы", text: "собираем UI-10: панель агентов. zcode — каркас, core — подсказки из памяти." },
        { minFromStart: 6, who: "core", text: "взял подсказки из записи «UI-10 проводник» — 12 пунктов, кладу в индекс." },
        { minFromStart: 12, who: "zcode", text: "каркас панели собрал: три зоны. Начинаю подсветку правок золотом." },
        { minFromStart: 18, who: "core", text: "индекс подсказок готов, передаю zcode — дальше он ведёт." },
        { minFromStart: 22, who: "zcode", text: "подсветка правок готова; конфликт двух писателей — бейдж, не цвет." },
      ],
    },
    {
      id: "sess-3d90",
      host: "laptop-go-1",
      agent: "zcode",
      name: "Разбор падений тестов",
      state: "done",
      startedMinAgo: 1226,
      lastActivityMinAgo: 1148,
      topic: "Тесты упали после рефакторинга страт — найти причины и поправить",
      shared: false,
      coverage: "full",
      digest: {
        steps: ["найдены 3 падения", "порядок моков поправлен", "таймаут CI отложен отдельным ходом"],
        decisions: ["таймаут CI разбирать отдельно", "правки только в тестах"],
        memory: [{ id: "M-243", title: "Падения тестов: порядок моков" }],
      },
      transcript: [
        { minFromStart: 0, who: "вы", text: "тесты упали после вчерашнего рефакторинга — разберись" },
        { minFromStart: 4, who: "zcode", text: "нашёл: два падения — порядок моков, одно — таймаут CI." },
        { minFromStart: 30, who: "zcode", text: "порядок моков поправил; таймаут подниму отдельным ходом, чтобы не мешать." },
        { minFromStart: 78, who: "zcode", text: "прогон зелёный, отчёт положил в задачу T-129." },
      ],
    },
    {
      id: "sess-7f13",
      host: "laptop-go-1",
      agent: "core",
      name: "Индекс памяти: перечитывание",
      state: "done",
      startedMinAgo: 2520,
      lastActivityMinAgo: 2468,
      topic: "Перечитать индекс после рефакторинга записей: найти записи с размытыми связями",
      shared: false,
      coverage: "partial",
      transcript: [
        { minFromStart: 0, who: "core", text: "перечитываю индекс: 214 записей после рефакторинга." },
        { minFromStart: 6, who: "core", text: "38 записей с размытыми связями — пометил на дозапись." },
      ],
    },
    {
      id: "sess-2a10",
      host: "laptop-go-1",
      agent: "vscode",
      name: "Черновик релизных заметок",
      state: "done",
      startedMinAgo: 2498,
      lastActivityMinAgo: 2454,
      topic: "Собрать черновик релизных заметок по волне 1",
      shared: false,
      coverage: "partial",
      transcript: [
        { minFromStart: 0, who: "вы", text: "собери черновик релизных заметок по волне 1" },
        { minFromStart: 2, who: "vscode", text: "открыл заметки: checkpoint-формат, отчёты исполнителей." },
      ],
    },
    {
      id: "sess-9c48",
      host: "vpnus-1",
      agent: "pi",
      name: "Правка конфига VPN",
      state: "done",
      startedMinAgo: 372,
      lastActivityMinAgo: 360,
      topic: "Поправить конфиг VPN: маршрут 10.0.0.0/24 перестал сходиться",
      shared: false,
      coverage: "partial",
      transcript: [
        { minFromStart: 0, who: "вы", text: "поправь конфиг VPN: маршрут 10.0.0.0/24" },
        { minFromStart: 3, who: "pi", text: "правку внёс, конфиг перечитал — маршрут на месте." },
      ],
    },
    {
      id: "sess-1d77",
      host: "vpnus-1",
      agent: "hermes",
      name: "Утренний прогон задач",
      state: "done",
      startedMinAgo: 84,
      lastActivityMinAgo: 72,
      topic: "Утренний прогон задач по расписанию",
      shared: false,
      coverage: "none",
    },
    {
      id: "sess-2e55",
      host: "laptop-zcode-1",
      agent: "zcode",
      name: "Черновик страницы статуса",
      state: "done",
      startedMinAgo: 4030,
      lastActivityMinAgo: 3986,
      topic: "Набросать страницу статуса: хранилища, сервер, хосты",
      shared: false,
      coverage: "full",
      digest: {
        steps: ["собраны три блока: хранилища, сервер, хосты", "черновик записан в память"],
        decisions: ["жизненный цикл связи — по словарю 07a"],
        memory: [{ id: "M-244", title: "Черновик страницы статуса" }],
      },
      transcript: [
        { minFromStart: 0, who: "вы", text: "набросай страницу статуса: хранилища, сервер, хосты" },
        { minFromStart: 8, who: "zcode", text: "собрал три блока, пилюли связи — по жизненному циклу." },
        { minFromStart: 44, who: "zcode", text: "черновик готов, записал в память." },
      ],
    },
  ];

  /* ── v5: Ether feed (07j §2.3) — a projection of the same fixtures, not a
   * second dataset. Newest first; signal rows (host connectivity) are pinned
   * at the end: they are a state, not an event. kind → dot color token:
   * write = gold, recall = iris, error = red (always with text, WCAG 1.4.1). */
  const koraEther = [
    { ageMinAgo: 2, kind: "write", host: "laptop-go-1", who: "zcode", action: "записал итог в память" },
    { ageMinAgo: 4, kind: "write", host: "laptop-go-1", who: "core", action: "продолжил «Командную: UI-10»" },
    { ageMinAgo: 12, kind: "recall", host: "vpnus-1", who: "pi", action: "доложился после паузы" },
    { ageMinAgo: 26, kind: "write", host: "laptop-go-1", who: "zcode и core", action: "начали «Командную: UI-10»" },
    { ageMinAgo: 41, kind: "write", host: "laptop-go-1", who: "zcode", action: "открыл сессию «Правка тестов токенов»" },
    { ageMinAgo: 72, kind: "recall", host: "vpnus-1", who: "hermes", action: "завершил «Утренний прогон задач»" },
    { ageMinAgo: 4, kind: "error", host: "vpnus-1", signal: true, text: "молчит 4 мин — проверить связь", cta: "Проверить связь" },
  ];

  const hostEvents = [
    { time: "14:02", host: "laptop-go-1", text: "агент доложился" },
    { time: "13:58", host: "vpnus-1", text: "агент доложился" },
    { time: "12:40", host: "laptop-go-1", text: "задача «UI-10»: отчёт «волна 1 закрыта»" },
    { time: "12:31", host: "laptop-go-1", text: "сессия zcode открыта" },
    { time: "09:15", host: "laptop-go-1", text: "задача «UI-11» завершена — отчёт принят" },
  ];

  const status = {
    updated: "обновлено только что",
    stores: [
      { name: "mnemos-01", state: "жив", note: "отвечает 3 с назад" },
      { name: "seal-vault", state: "с оговорками", note: "отвечает 4 с назад · записи идут, часть запросов медленнее обычного" },
      { name: "gcw-archive", state: "жив", note: "отвечает 3 с назад" },
      { name: "vesmaro-docs", state: "жив", note: "отвечает 5 с назад" },
    ],
    board: { line: "связь живая · события приходят только что · версия 0.4.2" },
    hosts: [
      { name: "laptop-go-1", line: "на связи · доклад 12 с назад · задача: 1 идёт", lifecycle: "online" },
      { name: "vpnus-1", line: "молчит 4 мин — проверить связь", lifecycle: "silent" },
      { name: "laptop-zcode-1", line: "выключен владельцем", lifecycle: "off" },
    ],
    memory: { recs: "12 483", tags: "342", pulses: "37", last: "2 ч" },
    tasks: { running: 1, queued: 2, validation: 1, doneToday: 3 },
  };

  /* ── v3: tasks world (07g). Kanban mirrors the mnemos state machine
   * (task:open / in-progress / blocked / resolved / done); cards stay
   * consistent with agents.html / hosts.html fixtures (T-128 agb running,
   * T-131 core queued 4 min, T-127 stagnant queue 12 min, T-124 failed). */

  const taskStates = [
    { key: "open", name: "открыто" },
    { key: "in-progress", name: "в работе" },
    { key: "blocked", name: "блокировано" },
    { key: "resolved", name: "решено" },
    { key: "done", name: "готово" },
  ];

  const tasks = [
    {
      id: "T-128",
      title: "UI-10 проводник",
      state: "in-progress",
      project: "mnemos-eyes",
      conf: 0.92,
      tags: ["ui", "agents"],
      extraTags: 1,
      assignee: "агент agb",
      host: "laptop-go-1",
      age: "2 ч",
      priority: "обычный",
      unreadReport: true,
      reportCount: 2,
      reportAge: "6 мин назад",
      memory: ["M-128", "M-215"],
      body: [
        "Проводник проектов открывает дерево слева, редактор в центре, панель агентов справа. Три колонки — не догма: на узких экранах панель агентов уезжает вниз.",
        "Ключевое правило: правки агента подсвечиваются золотом в дереве и во вкладках редактора. Конфликт двух писателей — блокер, бейдж «конфликт», не цветом одним.",
        "Открытый вопрос: что показывать в панели агентов, когда пишет больше двух агентов. Черновик — очередь правок по времени, свежие сверху.",
      ],
      reports: [
        {
          who: "агент agb",
          when: "6 мин назад · 14:02",
          kind: "промежуточный",
          unread: true,
          body: [
            "Волна 1 закрыта: дерево проектов, редактор и панель агентов собираются, колонки складываются на узких экранах.",
            "Дальше — подсветка правок золотом и бейдж конфликта. Больше ничего не трогал.",
          ],
          refs: "T-128 · M-148 · M-215",
        },
        {
          who: "агент agb",
          when: "1 ч назад · 13:04",
          kind: "промежуточный",
          unread: false,
          body: [
            "Разобрал каркас: три колонки, перетаскивание границ, сохранение раскладки. Скриншоты приложил в запись M-128.",
          ],
          refs: "T-128 · M-128",
        },
      ],
      history: [
        { what: "создано владельцем", when: "2 ч назад · 12:31", actor: "вы" },
        { what: "открыто → в работе · агент взял задачу", when: "1,5 ч назад · 12:58", actor: "агент agb (автоперенос из памяти)" },
        { what: "получен отчёт «волна 1 закрыта»", when: "6 мин назад · 14:02", actor: "агент agb" },
      ],
      execution: {
        state: "running",
        line: "идёт · агент agb · laptop-go-1",
        pulse: "пульс 40 с назад",
        report: "отчёт 6 мин назад · подписан agb · пока не проверено",
      },
    },
    {
      id: "T-131",
      title: "Дозапись смыслового индекса",
      state: "open",
      project: "mnemos-eyes",
      conf: 0.78,
      tags: ["memory", "sync"],
      extraTags: 0,
      assignee: "агент core",
      host: "mnemos-02",
      age: "4 мин",
      priority: "обычный",
      unreadReport: false,
      reportCount: 0,
      body: [
        "Дозаписать смысловой индекс после рефакторинга записей: 214 записей переиндексировано, остались 38 с размытыми связями.",
        "Готовность: индекс считается свежим, когда у каждой записи есть хотя бы один синапс-сосед.",
      ],
      reports: [],
      history: [{ what: "создано владельцем", when: "4 мин назад · 14:10", actor: "вы" }],
      execution: {
        state: "queued",
        line: "в очереди · агент core · mnemos-02",
        pulse: "агент докладывается каждые ~2 мин — сервер его не дёргает",
      },
    },
    {
      id: "T-127",
      title: "Чистка дублей тегов",
      state: "open",
      project: "mnemos-eyes",
      conf: 0.64,
      tags: ["memory", "tags"],
      extraTags: 0,
      assignee: "агент morph",
      host: "—",
      age: "12 мин",
      priority: "низкий",
      unreadReport: false,
      reportCount: 0,
      stagnant: "исполнитель молчит 12 мин",
      body: [
        "Свести дубли тегов к алиасам: три пары конфликтуют (черновик словаря — запись M-241). Уверенность записи низкая — словарь ещё не утверждён.",
        "Перед чисткой свериться с решением по тегам: если владелец не утвердил словарь — только отчёт, без правок.",
      ],
      reports: [],
      history: [
        { what: "создано агентом core (предложение принято)", when: "12 мин назад · 14:02", actor: "агент core (автоперенос из памяти)" },
      ],
      execution: {
        state: "stagnant",
        line: "в очереди 12 мин — исполнитель молчит",
        pulse: "очередь молчит: агент не забирает задачи 12 минут — проверьте связь хоста",
      },
    },
    {
      id: "T-121",
      title: "Пейринг QR",
      state: "open",
      project: "sealbox",
      conf: 0.74,
      tags: ["pairing"],
      extraTags: 0,
      assignee: null,
      host: null,
      age: "1 д",
      priority: "обычный",
      unreadReport: false,
      reportCount: 0,
      body: [
        "Пейринг устройства к колодцу памяти — через QR: устройство показывает код, владелец сканирует с телефона. Ручной ввод ключа остаётся запасным путём для headless-хостов.",
        "Замечание с ревью: код должен жить не дольше окна пейринга, после — перегенерация. Иначе код, засветившийся на скриншоте, живёт вечно.",
      ],
      reports: [],
      history: [{ what: "создано владельцем", when: "1 д назад", actor: "вы" }],
      execution: null,
    },
    {
      id: "T-124",
      title: "Сборка отчёта недели",
      state: "blocked",
      project: "gcw",
      conf: 0.7,
      tags: ["reporting"],
      extraTags: 0,
      assignee: "агент morph",
      host: "—",
      age: "1 д",
      priority: "обычный",
      unreadReport: false,
      reportCount: 1,
      blockedNote: "не вышло: конфликт записи с agb",
      body: [
        "Собрать отчёт недели из отчётов исполнителей: в чём проблема, что мешает, что делать — по канону M-148, идентификаторы в сносках.",
        "Поручение упало: morph и agb одновременно писали в один раздел отчёта. Нужен единственный писатель на раздел.",
      ],
      reports: [],
      history: [
        { what: "создано владельцем", when: "1 д назад", actor: "вы" },
        { what: "в работе → блокировано · поручение упало", when: "1 д назад · 13:12", actor: "агент morph (автоперенос из памяти)" },
      ],
      execution: {
        state: "failed",
        line: "не вышло · агент morph",
        pulse: "конфликт записи с agb — поручение отменено, задача ждёт нового исполнителя",
      },
    },
    {
      id: "T-129",
      title: "Правки токенов после ревью",
      state: "resolved",
      project: "mnemos-eyes",
      conf: 0.9,
      tags: ["design"],
      extraTags: 0,
      assignee: "агент agb",
      host: "laptop-go-1",
      age: "3 ч",
      priority: "обычный",
      unreadReport: false,
      reportCount: 1,
      body: [
        "Внести правки ревью в токены: контраст фокуса на бересте, плотность строк. Проверить, что имена не поменялись.",
      ],
      reports: [
        {
          who: "агент agb",
          when: "3 ч назад · 11:20",
          kind: "финальный",
          unread: false,
          body: ["Правки внесены: ринг на бересте 7.3:1, плотность через общий тумблер. Имена токенов не менялись."],
          refs: "T-129 · M-156",
        },
      ],
      history: [
        { what: "создано владельцем", when: "4 ч назад", actor: "вы" },
        { what: "в работе → решено · отчёт принят", when: "3 ч назад · 11:22", actor: "агент agb (автоперенос из памяти)" },
      ],
      execution: {
        state: "done",
        line: "завершено · агент agb · laptop-go-1",
        pulse: "финальный отчёт принят 3 ч назад",
      },
    },
    {
      id: "T-126",
      title: "Отчёт волны 1 в Коре",
      state: "done",
      project: "gcw",
      conf: 0.85,
      tags: ["reporting"],
      extraTags: 0,
      assignee: "агент agb",
      host: "laptop-go-1",
      age: "3 ч",
      priority: "обычный",
      unreadReport: false,
      reportCount: 1,
      body: ["Собрать отчёт волны 1 по checkpoint-формату и записать в память."],
      reports: [
        {
          who: "агент agb",
          when: "3 ч назад",
          kind: "финальный",
          unread: false,
          body: ["Отчёт записан в память, задача закрыта."],
          refs: "T-126",
        },
      ],
      history: [
        { what: "решено → готово · отчёт принят", when: "3 ч назад", actor: "вы" },
      ],
      execution: {
        state: "done",
        line: "завершено · агент agb",
        pulse: "закрыта владельцем 3 ч назад",
      },
    },
    {
      id: "T-123",
      title: "Схема провенанса в свитках",
      state: "done",
      project: "mnemos-eyes",
      conf: 0.88,
      tags: ["design", "memory"],
      extraTags: 0,
      assignee: "агент core",
      host: "mnemos-02",
      age: "6 ч",
      priority: "обычный",
      unreadReport: false,
      reportCount: 1,
      body: ["Показывать тройку провенанса (кто · где · когда) в шапке свитка, числа — mono tabular-nums."],
      reports: [
        {
          who: "агент core",
          when: "6 ч назад",
          kind: "финальный",
          unread: false,
          body: ["Схема внесена в свитки всех записей; провенанс читается в шапке."],
          refs: "T-123 · M-233",
        },
      ],
      history: [
        { what: "решено → готово · отчёт принят", when: "6 ч назад", actor: "агент core (автоперенос из памяти)" },
      ],
      execution: {
        state: "done",
        line: "завершено · агент core",
        pulse: "закрыта 6 ч назад",
      },
    },
  ];

  const taskArchive = [
    {
      id: "T-118",
      title: "Мобильный топбар: меню «⋮»",
      project: "mnemos-eyes",
      month: "сентябрь 2026",
      from: "в работе",
      date: "12 сент",
      reports: 3,
      summary: "Свернуть топбар в меню на узких экранах; поиск и тема остаются на поверхности",
    },
    {
      id: "T-114",
      title: "Скелетоны: shimmer без blur",
      project: "mnemos-eyes",
      month: "сентябрь 2026",
      from: "готово",
      date: "8 сент",
      reports: 2,
      summary: "Мерцание скелетонов через opacity, без фильтров размытия — дешевле на слабых машинах",
    },
    {
      id: "T-111",
      title: "Канонизация отчётов волн",
      project: "gcw",
      month: "сентябрь 2026",
      from: "решено",
      date: "3 сент",
      reports: 4,
      summary: "Единый формат отчёта волны: checkpoint-доска, исполнители, ревью-циклы",
    },
  ];

  const taskInbox = [
    {
      id: "IN-2",
      from: "агент agb",
      where: "mnemos-01",
      when: "26 мин назад",
      title: "Разобрать дубли тегов M-241",
      excerpt:
        "Разобрать дубли тегов: три алиаса конфликтуют — «агенты», «agents» и «борт» указывают на один домен, но счётчики расходятся. Предлагаю склеить по решению владельца.",
      tags: ["memory", "tags"],
      source: "запись памяти M-241",
    },
    {
      id: "IN-1",
      from: "агент core",
      where: "mnemos-02",
      when: "1 ч назад",
      title: "Сводка отчётов недели по канону сносок",
      excerpt:
        "Предлагаю еженедельную сводку отчётов: тело человеческим языком, идентификаторы — в сносках. Проверить правило на трёх проектах и записать как контракт.",
      tags: ["reporting", "process"],
      source: "запись памяти M-148",
    },
  ];

  const taskDrafts = [
    {
      id: "DR-1",
      title: "Проверить покрытие сессий vscode в Корее",
      excerpt: "Что делали vscode-сессии — покрытие начало среза; сверить с реестром сканеров.",
      tags: ["kora"],
      step: 2,
    },
  ];

  const tagDictionary = ["ui", "agents", "memory", "sync", "design", "reporting", "process", "security", "pairing"];

  /* v6 (07k §1.1): the single source of the stand version. No markup may
   * duplicate it — footer status lines (sidebar, pair, auth) and the gallery
   * caption all read STAND.version / STAND.slice. */
  const version = "1.41.0";
  const slice = "v6";

  window.STAND = {
    version,
    slice,
    memories,
    wellNodes,
    servers,
    counters,
    waiting,
    agents,
    assignments,
    agentFeed,
    docs,
    explorerFiles,
    editorTabs,
    codeLines,
    editedFrom,
    buddy,
    termFiles,
    feedSeed,
    feedPool,
    hosts,
    regTokens,
    koraSessions,
    koraEther,
    hostEvents,
    status,
    taskStates,
    tasks,
    taskArchive,
    taskInbox,
    taskDrafts,
    tagDictionary,
  };
})();
