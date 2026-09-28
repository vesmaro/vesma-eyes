/* shell.js — «Живая кора» stand: sidebar, topbar, command palette, hotkeys, toasts.
 * Vanilla JS, no dependencies. All navigation between stand pages = real <a href>.
 * Guard rule (spec 03 §7): hotkeys except Esc/Ctrl+K are ignored inside inputs.
 * v6 (07k): auth session, footer status line, anonymous topbar, sidebar locks,
 * gate screen, user chip menu, anon palette/search guards. */
(function () {
  "use strict";

  var doc = document;
  var root = doc.documentElement;
  var store = {
    get: function (k, d) {
      try {
        return localStorage.getItem("stand-" + k) || d;
      } catch (e) {
        return d;
      }
    },
    set: function (k, v) {
      try {
        localStorage.setItem("stand-" + k, v);
      } catch (e) {
        /* file:// without storage — stand still works */
      }
    },
  };

  /* ── Auth session (07k §5.1): model key, NOT a view setting ─────────── */
  var AUTH_KEY = "vesmaro.authSession";
  var HANDOFF_KEY = "stand-auth-handoff"; /* toast text that survives redirect */
  function readSession() {
    try {
      var raw = localStorage.getItem(AUTH_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      return s && s.user ? s : null;
    } catch (e) {
      return null;
    }
  }
  function writeSession(s) {
    try {
      if (s) localStorage.setItem(AUTH_KEY, JSON.stringify(s));
      else localStorage.removeItem(AUTH_KEY);
    } catch (e) {
      /* file:// — stand still works */
    }
    doc.dispatchEvent(new CustomEvent("stand:authchange"));
  }
  function humanInterval(ms) {
    /* 07a §1.5: human intervals, precise stamps live in tooltips/details */
    var m = Math.max(1, Math.round(ms / 60000));
    if (m < 60) return m + " мин назад";
    var h = Math.round(m / 60);
    if (h < 24) return h + " ч назад";
    var d = Math.round(h / 24);
    return d + " дн назад";
  }
  window.standAuth = {
    get: readSession,
    set: writeSession,
    /* sign in/out from auth.html and the chip menu share one writer */
    signIn: function (user, role) {
      writeSession({ user: user, role: role || "owner", since: new Date().toISOString() });
    },
    signOut: function () {
      writeSession(null);
    },
  };

  function inInput(e) {
    var t = e.target;
    return t && t.closest && t.closest('input, textarea, select, [contenteditable="true"]');
  }

  /* ── Toast: single action→feedback channel (spec 05 §3) ─────────────── */
  var toastRegion = null;
  var toastTimer = null;
  function toast(text, type) {
    if (!toastRegion) {
      toastRegion = doc.createElement("div");
      toastRegion.className = "toast-region";
      toastRegion.setAttribute("role", "status");
      toastRegion.setAttribute("aria-live", "polite");
      doc.body.appendChild(toastRegion);
    }
    toastRegion.textContent = "";
    var el = doc.createElement("div");
    el.className = "toast";
    el.dataset.type = type || "info";
    el.textContent = text;
    toastRegion.appendChild(el);
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.add("leaving");
      setTimeout(function () {
        el.remove();
      }, 120);
    }, 4000);
    el.addEventListener("mouseenter", function () {
      if (toastTimer) clearTimeout(toastTimer);
    });
    el.addEventListener("mouseleave", function () {
      toastTimer = setTimeout(function () {
        el.classList.add("leaving");
        setTimeout(function () {
          el.remove();
        }, 120);
      }, 2000);
    });
  }
  window.standToast = toast;

  /* ── Cross-page handoff toast (07k §4.2): text survives a redirect ──── */
  (function () {
    var pending = null;
    try {
      pending = sessionStorage.getItem(HANDOFF_KEY);
      if (pending) sessionStorage.removeItem(HANDOFF_KEY);
    } catch (e) {}
    if (pending) {
      /* one frame later: region exists, page scripts are not racing us */
      setTimeout(function () { toast(pending, "success"); }, 0);
    }
  })();
  window.standHandoffToast = function (text) {
    try {
      sessionStorage.setItem(HANDOFF_KEY, text);
    } catch (e) {}
  };

  /* ── Focus transfer to H1 after palette/hotkey navigation (03 §8) ───── */
  if (store.get("focus-h1", "") === "1") {
    store.set("focus-h1", "");
    var h1 = doc.querySelector("h1[tabindex='-1']");
    if (h1) {
      h1.focus({ preventScroll: false });
    }
  }
  function go(url) {
    store.set("focus-h1", "1");
    window.location.href = url;
  }
  window.standGo = go;

  /* ── v6 auth hook (07k §2–§5): session → view, before first paint ────── */
  var GATED = { /* pages of gated domains (07k §2.1) */
    "memories.html": "Память",
    "search.html": "Память",
    "tasks.html": "Задачи",
    "agents.html": "Агенты",
    "hosts.html": "Агенты",
    "connect.html": "Агенты",
    "kora.html": "Кора",
    "status.html": "Система",
    "desktop.html": "Рабочий стол",
    "explorer.html": "Рабочий стол",
  };
  var GATE_INSIDE = { /* «что внутри», одна строка по 07k §3 */
    "Память": "Записи, поиск по смыслу, пульс и теги — содержимое памяти",
    "Задачи": "Канбан, список, входящие и архив — работа и поручения",
    "Агенты": "Исполнение, хосты и подключение новых машин",
    "Кора": "Журнал сессий всех хостов: что агент делал и что говорил",
    "Система": "Статус, устройства и трассировки — служебная зона",
    "Рабочий стол": "Терминал и проводник — экспериментальная зона стенда",
  };
  var GATE_AFTER = { /* свёрнутый блок: конкретика раздела, без обещаний лишнего */
    "Память": [
      "Список записей с уверенностью и провенансом: кто · где · когда.",
      "Поиск по смыслу: вопрос человеческим языком — ответ со ссылками на записи.",
      "Пульс памяти: свежие записи и события живой ленты.",
    ],
    "Задачи": [
      "Канбан и список задач с исполнителями и сроками.",
      "Входящие: предложения задач, ещё не взятых в работу.",
      "Архив завершённых задач — история остаётся на борту.",
    ],
    "Агенты": [
      "Исполнение: какой агент какую задачу ведёт прямо сейчас.",
      "Хосты: машины, на которых работают агенты, и их связь.",
      "Подключение новой машины за 4 шага — мастер 07b.",
    ],
    "Кора": [
      "Сессии всех хостов: транскрипты — что агент делал и говорил.",
      "Ход сессии по уровням глубины: от старта до вердикта.",
    ],
    "Система": [
      "Статус хранилищ и устройств с человеческими пояснениями.",
      "Трассировки — служебная зона для разбора инцидентов.",
    ],
    "Рабочий стол": [
      "Терминал стенда: демо-панель без доступа к реальным машинам.",
      "Проводник проектов: дерево файлов и вкладки редактора.",
    ],
  };
  function pageName() {
    var p = window.location.pathname.split("/").pop() || "index.html";
    return p.split("?")[0];
  }
  function returnParam() {
    var p = pageName();
    var q = window.location.search;
    return q ? p + q : p;
  }
  function authUrl(tab) {
    return "auth.html?return=" + encodeURIComponent(returnParam()) + (tab ? "&tab=" + tab : "");
  }

  var esc2 = function (s) {
    return s.replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  };

  /* ── Footer status line (07k §1): one source STAND.version ──────────── */
  function shortVersion() {
    var D = window.STAND || {};
    return (D.version || "?").split(".").slice(0, 2).join(".");
  }
  function footerText(session) {
    var D = window.STAND || { version: "?", slice: "v?" };
    return "vesmaro-eyes " + D.version + " · " + (session ? "вы: " + session.user : "аноним");
  }
  function footerTooltip(session) {
    var D = window.STAND || { version: "?", slice: "v?" };
    var base = "Стенд дизайна, срез " + D.slice + " · демо-данные";
    if (session) {
      var role = session.role === "owner" ? "владелец" : "участник";
      var age = session.since ? " · вход " + humanInterval(Date.now() - new Date(session.since).getTime()) : "";
      return base + " · роль: " + role + age;
    }
    return base;
  }
  function renderFooterStatus(session) {
    /* Sidebar slot: replaces the old stand-note (07k §1.2) */
    var foot = doc.querySelector(".side-foot .stand-note");
    if (foot) {
      foot.textContent = "";
      var full = doc.createElement("span");
      full.className = "ss-full";
      full.textContent = footerText(session);
      foot.appendChild(full);
      foot.title = footerTooltip(session);
      foot.classList.toggle("auth-user", !!session);
      foot.setAttribute("data-short", shortVersion());
    }
    /* Pages outside Shell (pair, auth): second line of the footer (07k §1.3) */
    doc.querySelectorAll("[data-stand-version-line]").forEach(function (el) {
      if (el === foot) return;
      el.textContent = footerText(session);
      el.title = footerTooltip(session);
      el.classList.toggle("auth-user", !!session);
    });
  }

  /* ── Sidebar locks (07k §2.2): counter → lock on gated domains ──────── */
  var LOCK_SVG =
    '<svg class="side-lock icon" viewBox="0 0 24 24" aria-hidden="true"><rect width="14" height="10" x="5" y="11" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
  function renderSidebarLocks(session) {
    /* re-run safe: locks apply once, only in the anonymous state (07k §2.2) */
    if (session || doc.querySelector(".side-count-gated, .side-lock-slot")) return;
    doc.querySelectorAll(".side-link").forEach(function (row) {
      var label = row.querySelector(".side-label");
      if (!label) return;
      var name = label.textContent.trim();
      /* domain rows (.side-domain) and standalone gated links (Кора) map by name */
      if (!GATE_DOMAINS[name]) return; /* public row — no lock */
      var count = row.querySelector(".side-count");
      if (count) {
        count.classList.add("side-count-gated");
        count.innerHTML = LOCK_SVG;
        count.setAttribute("data-gated", "true");
      } else {
        /* rows without a counter (Память, Настройки, Кора): append a lock */
        var lock = doc.createElement("span");
        lock.className = "side-count side-lock-slot";
        lock.setAttribute("data-gated", "true");
        lock.innerHTML = LOCK_SVG;
        var chev = row.querySelector(".side-chevron");
        if (chev) row.insertBefore(lock, chev);
        else row.appendChild(lock);
      }
      row.setAttribute("title", "Откроется после входа");
      row.setAttribute("aria-label", name + " — откроется после входа");
    });
    /* collapsed sidebar: lock visible under the icon of a gated row (07k §2.2) */
    doc.querySelectorAll(".side-link").forEach(function (row) {
      var label = row.querySelector(".side-label");
      if (!label || !GATE_DOMAINS[label.textContent.trim()]) return;
      var lock = doc.createElement("span");
      lock.className = "side-lock-collapsed";
      lock.setAttribute("aria-hidden", "true");
      lock.innerHTML = LOCK_SVG;
      row.appendChild(lock);
    });
    /* v7-раунд: разделы внутри замкнутого домена («Хосты 4», «Входящие 2»)
     * тоже раскрывают содержимое — у анонима цифры нет вовсе: родительский
     * замок уже говорит «после входа», дубль замка в подrow шума даёт */
    doc.querySelectorAll(".side-section[href]").forEach(function (a) {
      var page = (a.getAttribute("href") || "").split("?")[0];
      if (!GATED[page]) return;
      var c = a.querySelector(".side-count[data-side-count]");
      if (c) {
        c.textContent = "";
        c.setAttribute("data-gated", "true");
      }
    });
  }
  var GATE_DOMAINS = {
    "Память": "Память",
    "Задачи": "Задачи",
    "Агенты": "Агенты",
    "Кора": "Кора",
    "Система": "Система",
    "Настройки": "Система",
    "Рабочий стол": "Рабочий стол",
  };

  /* ── Topbar: two states (07k §2.3) + user chip (07k §5.2) ───────────── */
  var applyAuthState = null; /* set by renderTopbar; re-applies slot only */
  function renderTopbar(session) {
    var status = doc.querySelector(".topbar-status");
    if (!status || status.dataset.authBound === "done") {
      if (status && status.dataset.authBound === "done" && applyAuthState) applyAuthState(session);
      return;
    }
    status.dataset.authBound = "done";
    var anon = !session;
    root.setAttribute("data-auth", anon ? "anon" : "user");
    /* search slot: anon gets none — search leaks memory contents (07k §0);
     * hidden up-front by html[data-auth="anon"] CSS + [hidden] for a11y tree */
    var ts = doc.querySelector(".topsearch");
    if (ts) ts.hidden = anon;
    var expand = status.querySelector("[data-search-expand]");
    if (expand) expand.hidden = anon;
    var bell = status.querySelector("[data-bell]");
    if (bell) bell.hidden = anon;
    var exec = status.querySelector("[data-exec-count]");
    if (exec) exec.hidden = anon;
    /* auth pair / chip live in a slot the hook owns; myelin divider between
     * the auth zone and the settings (lang/theme) zone (07k §2.3) */
    var slot = doc.createElement("span");
    slot.className = "auth-slot";
    status.insertBefore(slot, status.querySelector(".langtoggle"));
    var myelin = doc.createElement("span");
    myelin.className = "topbar-myelin";
    myelin.setAttribute("aria-hidden", "true");
    status.insertBefore(myelin, slot);
    applyAuthState = function (s) {
      var anonNow = !s;
      slot.textContent = "";
      if (anonNow) {
        var login = doc.createElement("a");
        login.className = "btn primary sm";
        login.href = "auth.html?return=" + encodeURIComponent(returnParam());
        login.textContent = "Войти";
        var reg = doc.createElement("a");
        reg.className = "btn ghost sm";
        reg.href = "auth.html?return=" + encodeURIComponent(returnParam()) + "&tab=register";
        reg.textContent = "Регистрация";
        slot.appendChild(login);
        slot.appendChild(reg);
      } else {
        slot.appendChild(buildChip(s));
      }
    };
    applyAuthState(session);
  }

  function buildChip(session) {
    var chip = doc.createElement("button");
    chip.type = "button";
    chip.className = "user-chip";
    chip.setAttribute("aria-haspopup", "menu");
    chip.setAttribute("aria-expanded", "false");
    var roleWord = session.role === "owner" ? "владелец" : "участник";
    chip.innerHTML =
      '<span class="user-ava" aria-hidden="true">' + esc2(session.user.charAt(0).toUpperCase()) + "</span>" +
      '<span class="user-name">' + esc2(session.user) + "</span>" +
      '<svg class="icon user-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
    chip.setAttribute("aria-label", "вы: " + session.user + " · " + roleWord + " — открыть меню");

    var menu = doc.createElement("div");
    menu.className = "user-menu";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", "Меню пользователя");
    menu.hidden = true;
    menu.innerHTML =
      '<div class="user-menu-head">' +
      '<div class="um-title">вы: ' + esc2(session.user) + " · " + roleWord + "</div>" +
      '<div class="um-since">вход: ' + (session.since ? humanInterval(Date.now() - new Date(session.since).getTime()) : "—") + "</div>" +
      "</div>" +
      '<div class="user-menu-sep" role="separator"></div>' +
      '<button type="button" class="user-menu-item" role="menuitem" data-um="profile">Профиль</button>' +
      '<button type="button" class="user-menu-item" role="menuitem" data-um="logout">Выйти</button>';

    chip.addEventListener("click", function () {
      menu.hidden ? openMenu() : closeMenu();
    });
    menu.addEventListener("keydown", function (e) {
      var items = Array.prototype.slice.call(menu.querySelectorAll("[role='menuitem']"));
      var i = items.indexOf(doc.activeElement);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        var next = e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
        items[next].focus();
      } else if (e.key === "Escape") {
        e.stopPropagation();
        closeMenu();
        chip.focus();
      } else if (e.key === "Tab") {
        /* focus trap inside the menu (03 §7 overlay canon) */
        e.preventDefault();
        if (e.shiftKey) items[items.length - 1].focus();
        else items[0].focus();
      }
    });
    menu.addEventListener("click", function (e) {
      var item = e.target.closest("[data-um]");
      if (!item) return;
      if (item.dataset.um === "profile") {
        closeMenu();
        toast("Профиль — появится в продуктовой версии", "info");
      } else {
        signOutHere();
      }
    });
    function openMenu() {
      /* fixed menu is anchored to the chip (appended to body → no clipping) */
      var r = chip.getBoundingClientRect();
      menu.style.top = r.bottom + 6 + "px";
      menu.style.right = Math.max(8, window.innerWidth - r.right) + "px";
      menu.hidden = false;
      chip.setAttribute("aria-expanded", "true");
      var first = menu.querySelector("[role='menuitem']");
      if (first) first.focus();
    }
    function closeMenu() {
      menu.hidden = true;
      chip.setAttribute("aria-expanded", "false");
    }
    doc.addEventListener("click", function (e) {
      if (menu.hidden) return;
      if (!e.target.closest(".user-chip") && !e.target.closest(".user-menu")) closeMenu();
    });
    doc.body.appendChild(menu);
    return chip;
  }

  /* ── Sign out (07k §5.3): reversible → no confirm ───────────────────── */
  function signOutHere() {
    window.standAuth.signOut();
    toast("Вы вышли из аккаунта", "info");
    var page = pageName();
    if (GATED[page]) {
      go("index.html"); /* gated page → anonymous has no business here */
      return;
    }
    /* public page: re-render anon view without reload (hook listens) */
    applyAuthEverywhere(null);
  }

  /* ── Gate screen (07k §3): replaces the content slot, no flash ──────── */
  function renderGate(domain) {
    var main = doc.getElementById("main");
    if (!main) return;
    main.dataset.gated = "true";
    /* owner's H1 template (07k §3): «Раздел „Имя“ откроется после входа» */
    var title = "Раздел „" + domain + "“ откроется после входа";
    var inner = GATE_AFTER[domain] || [];
    var url = authUrl();
    var gate = doc.createElement("div");
    gate.className = "gate-screen";
    gate.setAttribute("role", "region");
    gate.setAttribute("aria-label", "Раздел закрыт до входа");
    gate.innerHTML =
      '<svg class="gate-iris" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/></svg>' +
      '<h1 class="gate-h1" tabindex="-1">' + esc2(title) + "</h1>" +
      '<p class="gate-what">' + esc2(GATE_INSIDE[domain] || "") + "</p>" +
      '<p class="gate-public">Статистика открыта всем — она на <a href="index.html">Обзоре</a>.</p>' +
      '<div class="gate-actions">' +
      '<a class="btn primary" href="' + esc2(url) + '">Войти</a>' +
      '<a class="btn ghost" href="' + esc2(url) + '&amp;tab=register">Создать аккаунт</a>' +
      "</div>" +
      '<div class="collapse-block gate-more"><button class="cb-toggle" type="button" aria-expanded="false" aria-controls="gate-after">' +
      '<svg class="chev icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>' +
      "Что я увижу после входа</button>" +
      '<div class="cb-body" id="gate-after" hidden><ul>' +
      inner.map(function (li) { return "<li>" + esc2(li) + "</li>"; }).join("") +
      "</ul></div></div>";
    /* crumbs stay (they live outside #main) — the user sees where they arrived;
     * everything the page scripts render into #main must not leak: replace node */
    while (main.firstChild) main.removeChild(main.firstChild);
    main.appendChild(gate);
    /* collapse-block behaviour (07h §2 pattern: persistent in session) */
    var tg = gate.querySelector(".cb-toggle");
    var body = gate.querySelector(".cb-body");
    if (store.get("gate-more", "") === "1" && tg) {
      tg.setAttribute("aria-expanded", "true");
      body.hidden = false;
    }
    tg.addEventListener("click", function () {
      var open = tg.getAttribute("aria-expanded") === "true";
      tg.setAttribute("aria-expanded", open ? "false" : "true");
      body.hidden = open;
      store.set("gate-more", open ? "" : "1");
    });
    var hh = gate.querySelector("h1");
    if (hh) hh.focus({ preventScroll: false });
  }

  /* ── One hook to run and re-run on auth change ──────────────────────── */
  function applyAuthEverywhere(session) {
    root.setAttribute("data-auth", session ? "user" : "anon");
    /* overview two-state slots (07k §6): data-auth-only / data-anon-only;
     * hidden attribute wins globally (base.css) — a11y tree follows */
    doc.querySelectorAll("[data-auth-only]").forEach(function (el) {
      el.hidden = !session;
    });
    doc.querySelectorAll("[data-anon-only]").forEach(function (el) {
      el.hidden = !!session;
    });
    /* public counters: clickable → gate, honest tooltip, never a dead number
     * (07k §6); the tip applies only while anonymous */
    doc.querySelectorAll("[data-anon-gated]").forEach(function (el) {
      if (!session) el.setAttribute("title", "Откроется после входа");
      else el.removeAttribute("title");
    });
    renderFooterStatus(session);
    renderTopbar(session);
    renderSidebarLocks(session);
    var page = pageName();
    var domain = GATED[page];
    if (domain && !session && !doc.getElementById("main").dataset.gated) {
      renderGate(domain);
    }
    /* cheat-sheet (07k §2.2): «/» hotkey is gated — the row says so for anons */
    if (!session) {
      doc.querySelectorAll("#cheatsheet tbody tr").forEach(function (tr) {
        var kbd = tr.querySelector("td:first-child kbd");
        var td = tr.querySelector("td:last-child");
        if (!kbd || !td || kbd.textContent.trim() !== "/" || td.dataset.gateMark) return;
        td.dataset.gateMark = "1";
        td.textContent += " — после входа";
      });
    }
  }
  /* v7-раунд: полное имя домена в подсказке — узкий сайдбар режет подпись
   * до «Раб…», пилюля «эксп» раскрывается словами. Ставится ДО хука аутентичности:
   * у анонима renderSidebarLocks перезапишет на «откроется после входа». */
  doc.querySelectorAll(".side-link").forEach(function (row) {
    var lab = row.querySelector(".side-label");
    if (!lab || lab.textContent.trim() !== "Рабочий стол") return;
    row.title = "Рабочий стол — экспериментальный раздел";
    row.setAttribute("aria-label", "Рабочий стол — экспериментальный раздел");
  });

  applyAuthEverywhere(readSession());
  doc.addEventListener("stand:authchange", function () {
    applyAuthEverywhere(readSession());
  });

  /* Counters of the public summary: clickable → gate, never a dead number
   * (07k §6). Applied only for an anonymous visitor. */
  doc.addEventListener("click", function (e) {
    var link = e.target.closest("[data-anon-gated]");
    if (!link || root.getAttribute("data-auth") !== "anon") return;
    e.preventDefault();
    go(link.getAttribute("href"));
  });

  /* ── Theme + density + motion ───────────────────────────────────────── */
  function applyTheme(t) {
    if (t === "light") root.setAttribute("data-theme", "light");
    else root.removeAttribute("data-theme");
    doc.querySelectorAll("[data-theme-toggle]").forEach(function (b) {
      b.setAttribute("aria-pressed", t === "light" ? "true" : "false");
    });
  }
  applyTheme(store.get("theme", "dark"));
  doc.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-theme-toggle]");
    if (!btn) return;
    var next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
    store.set("theme", next);
    applyTheme(next);
    toast(next === "light" ? "Тема: береста (светлая)" : "Тема: колодец (тёмная)", "info");
  });
  function applyMotion(m) {
    if (m === "reduced") root.setAttribute("data-motion", "reduced");
    else root.removeAttribute("data-motion");
  }
  applyMotion(store.get("motion", "auto"));
  doc.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-motion-toggle]");
    if (!btn) return;
    var next = root.getAttribute("data-motion") === "reduced" ? "auto" : "reduced";
    store.set("motion", next);
    applyMotion(next);
    toast(next === "reduced" ? "Движение сокращено (состояния без анимации)" : "Движение: канон «Живой коры»", "info");
  });
  doc.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-density-toggle]");
    if (!btn) return;
    var next = root.getAttribute("data-density") === "compact" ? "comfortable" : "compact";
    store.set("density", next);
    root.setAttribute("data-density", next);
    toast(next === "compact" ? "Плотность: операционная (32px строки)" : "Плотность: созерцательная (56px строки)", "info");
  });
  root.setAttribute("data-density", store.get("density", "comfortable"));

  /* ── Sidebar: collapse, one domain open (03 §3) ─────────────────────── */
  var app = doc.querySelector(".app");
  if (store.get("sidebar", "open") === "collapsed") app.classList.add("sidebar-collapsed");
  function toggleSidebar() {
    var collapsed = app.classList.toggle("sidebar-collapsed");
    store.set("sidebar", collapsed ? "collapsed" : "open");
    doc.querySelectorAll("[data-sidebar-toggle]").forEach(function (b) {
      b.setAttribute("aria-expanded", collapsed ? "false" : "true");
    });
  }
  doc.addEventListener("click", function (e) {
    if (e.target.closest("[data-sidebar-toggle]")) toggleSidebar();
  });
  doc.querySelectorAll(".side-group > .side-domain").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var group = btn.parentElement;
      var open = group.hasAttribute("data-open");
      doc.querySelectorAll(".side-group[data-open]").forEach(function (g) {
        g.querySelector(".side-domain").setAttribute("aria-expanded", "false");
        g.removeAttribute("data-open");
      });
      if (!open) {
        group.setAttribute("data-open", "");
        btn.setAttribute("aria-expanded", "true");
      }
    });
  });

  /* ── Sidebar counters: computed from the same fixtures that feed the screens
   *    (u-a #13). tasks = live states only (open / in-progress / blocked);
   *    agents = running assignments; hosts / inbox = fixture lengths. ─────── */
  (function () {
    var D = window.STAND;
    if (!D) return;
    var sideCounts = {
      tasks: (D.tasks || []).filter(function (t) {
        return t.state === "open" || t.state === "in-progress" || t.state === "blocked";
      }).length,
      agents: D.assignments ? D.assignments.active.length : 0,
      hosts: (D.hosts || []).length,
      inbox: (D.taskInbox || []).length,
    };
    doc.querySelectorAll("[data-side-count]").forEach(function (el) {
      /* v7-раунд: на замок цифра не возвращается — порядок init такой, что
       * замки (applyAuthEverywhere выше) уже стоят; анониму счётчик не пишем
       * вовсе (07k §2.2: под замком ноль цифр) */
      if (el.getAttribute("data-gated") === "true") return;
      var v = sideCounts[el.getAttribute("data-side-count")];
      if (typeof v === "number") el.textContent = String(v);
    });
  })();

  /* ── Topbar: search, lang, bell ─────────────────────────────────────── */
  var topInput = doc.querySelector(".topsearch input");
  if (topInput) {
    topInput.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        if (topInput.value) topInput.value = "";
        else topInput.blur();
      }
      if (e.key === "Enter") {
        go("search.html?q=" + encodeURIComponent(topInput.value.trim()));
      }
    });
    doc.querySelectorAll("[data-search-expand]").forEach(function (b) {
      b.addEventListener("click", function () {
        var wrap = doc.querySelector(".topsearch");
        wrap.classList.toggle("open");
        if (wrap.classList.contains("open")) topInput.focus();
      });
    });
  }
  doc.querySelectorAll("[data-lang-demo]").forEach(function (b) {
    b.addEventListener("click", function () {
      toast("Переключение RU|EN — в стенде не переведено; рабочий на «Документах» (РУС|ORIG)", "info");
    });
  });
  doc.querySelectorAll("[data-bell]").forEach(function (b) {
    b.addEventListener("click", function () {
      toast("Уведомления: в стенде лента не подключена — демо-данные", "info");
    });
  });
  doc.querySelectorAll("[data-share]").forEach(function (b) {
    b.addEventListener("click", function () {
      toast("Поделиться обзором — действие продуктовой версии, в стенде заглушка", "info");
    });
  });

  /* Honest stubs: any [data-demo-action] explains itself (feedback canon) */
  doc.addEventListener("click", function (e) {
    var el = e.target.closest("[data-demo-action]");
    if (!el) return;
    toast(el.getAttribute("data-demo-action"), "info");
  });

  /* ── Overlays: palette, modals — one stack, Esc pops the top (03 §7) ── */
  function openOverlay(el, opener) {
    el.hidden = false;
    el.dataset.opener = opener ? Array.prototype.indexOf.call(doc.querySelectorAll("body *"), opener) : "";
    var focusable = el.querySelector(".palette-input") || el.querySelector("button, [href], input");
    if (focusable) focusable.focus();
  }
  function closeOverlay(el) {
    el.hidden = true;
    if (el.dataset.opener) {
      var n = parseInt(el.dataset.opener, 10);
      var orig = doc.querySelectorAll("body *")[n];
      if (orig) orig.focus();
    }
  }

  /* ── Command palette (Ctrl+K, 03 §6) ────────────────────────────────── */
  var palette = doc.getElementById("palette");
  var pInput = palette && palette.querySelector(".palette-input");
  var pResults = palette && palette.querySelector(".palette-results");
  var pItems = [];
  var pActive = 0;

  function paletteCommands() {
    var D = window.STAND || { memories: [] };
    /* v6 (07k §2.2): anonymous palette = public + gated (lock mark) + auth
     * actions. Entities (записи, хосты, задачи) and «Дать задачу» are content
     * — hidden. Navigation itself is not a secret. */
    var anon = root.getAttribute("data-auth") === "anon";
    var nav = [
      { title: "Обзор", href: "index.html", keys: "обзор главная home" },
      { title: "Записи", href: "memories.html", keys: "записи память memory" },
      { title: "Поиск по памяти", href: "search.html", keys: "поиск поиск search" },
      { title: "Задачи · Канбан", href: "tasks.html", keys: "задачи канбан tasks борд" },
      { title: "Задачи · Список", href: "tasks.html?view=list", keys: "задачи список таблица list" },
      { title: "Задачи · Входящие", href: "tasks.html?view=inbox", keys: "задачи входящие предложения inbox" },
      { title: "Задачи · Архив", href: "tasks.html?view=archive", keys: "задачи архив archive" },
      { title: "Документы", href: "docs.html", keys: "документы docs хабы" },
      { title: "Агенты · Исполнение", href: "agents.html", keys: "агенты исполнение agents" },
      { title: "Агенты · Хосты", href: "hosts.html", keys: "агенты хосты hosts машины" },
      { title: "Агенты · Подключить хост", href: "connect.html", keys: "агенты подключить подключение мастер connect" },
      { title: "Кора · сессии хостов", href: "kora.html", keys: "кора сессии kora транскрипты" },
      { title: "Подключить телефон", href: "pair.html", keys: "подключить телефон пейринг pair устройство qr" },
      { title: "Статус · живая сводка", href: "status.html", keys: "статус система здоровье status" },
      { title: "Рабочий стол · Терминал", href: "desktop.html", keys: "терминал стол desk" },
      { title: "Проводник проектов", href: "explorer.html", keys: "проводник файлы explorer" },
      { title: "Галерея дизайн-системы", href: "gallery.html", keys: "галерея дизайн токены" },
    ].map(function (c) {
      return {
        group: "Переход",
        title: c.title,
        keys: c.keys,
        href: c.href,
        gated: !!GATED[c.href.split("?")[0]],
      };
    });
    var actions = anon
      ? [
          { group: "Действия", title: "Войти", keys: "войти вход login авторизация сессия", href: authUrl() },
          { group: "Действия", title: "Создать аккаунт", keys: "регистрация создать аккаунт sign up", href: authUrl("register") },
          { group: "Действия", title: "Подключить телефон", keys: "телефон устройство пейринг pair подключить", act: "pair" },
          { group: "Действия", title: "Сменить тему", keys: "тема тёмная светлая береста", act: "theme" },
          { group: "Действия", title: "Плотность: операционная / созерцательная", keys: "плотность компакт", act: "density" },
          { group: "Действия", title: "Сменить язык RU|EN", keys: "язык язык en ru", act: "lang" },
        ]
      : [
          { group: "Действия", title: "Дать задачу", keys: "задача дать новая создать поручение", act: "give-task" },
          { group: "Действия", title: "Подключить телефон", keys: "телефон устройство пейринг pair подключить", act: "pair" },
          { group: "Действия", title: "Сменить тему", keys: "тема тёмная светлая береста", act: "theme" },
          { group: "Действия", title: "Плотность: операционная / созерцательная", keys: "плотность компакт", act: "density" },
          { group: "Действия", title: "Сменить язык RU|EN", keys: "язык язык en ru", act: "lang" },
        ];
    var ents = [];
    if (!anon) {
      ents = (D.memories || []).slice(0, 6).map(function (m) {
        return {
          group: "Сущности",
          title: m.id + " · " + m.title,
          keys: (m.tags || []).join(" "),
          href: "memories.html?id=" + m.id,
        };
      });
      ents.push(
        { group: "Сущности", title: "агент agb", keys: "агент агент writer", href: "agents.html" },
        { group: "Сущности", title: "агент core", keys: "агент ядро", href: "agents.html" },
        { group: "Сущности", title: "документы mnemos-eyes", keys: "хаб доки", href: "docs.html#mnemos-eyes" }
      );
      (D.tasks || []).slice(0, 6).forEach(function (t) {
        ents.push({
          group: "Сущности",
          title: "задача · " + t.title,
          keys: "задача " + t.id + " " + (t.tags || []).join(" "),
          href: "tasks.html?task=" + encodeURIComponent(t.id),
        });
      });
      (D.hosts || []).forEach(function (h) {
        ents.push({
          group: "Сущности",
          title: "хост " + h.name,
          keys: "хост машина " + (h.harness || "") + " " + h.statusLine,
          href: "hosts.html?host=" + encodeURIComponent(h.name),
        });
      });
      (D.koraSessions || []).slice(0, 4).forEach(function (s) {
        ents.push({
          group: "Сущности",
          title: "сессия · " + (s.name || (s.agent + " на " + s.host)),
          keys: "сессия кора " + s.host + " " + (s.agent || ""),
          href: "kora.html?session=" + encodeURIComponent(s.id),
        });
      });
    }
    return nav.concat(actions, ents);
  }

  function esc(s) {
    return s.replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function markMatch(title, q) {
    if (!q) return esc(title);
    var i = title.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return esc(title);
    return (
      esc(title.slice(0, i)) + "<mark>" + esc(title.slice(i, i + q.length)) + "</mark>" + esc(title.slice(i + q.length))
    );
  }

  function renderPalette(q) {
    var cmds = paletteCommands().map(function (c, i) {
      c._i = i;
      return c;
    });
    var ql = q.trim().toLowerCase();
    var found = cmds.filter(function (c) {
      return !ql || (c.title + " " + c.keys).toLowerCase().indexOf(ql) >= 0;
    });
    found.sort(function (a, b) {
      var pa = !ql || a.title.toLowerCase().startsWith(ql) ? 0 : 1;
      var pb = !ql || b.title.toLowerCase().startsWith(ql) ? 0 : 1;
      return pa - pb || a._i - b._i;
    });
    pItems = found;
    pActive = 0;
    if (!found.length) {
      pResults.innerHTML =
        '<div class="palette-empty"><span>Ничего не нашлось по «' +
        esc(q) +
        "».</span>" +
        /* v6: memory search is content — no search CTA for an anonymous visitor */
        (root.getAttribute("data-auth") === "anon"
          ? ""
          : '<a class="btn secondary sm" href="search.html?q=' +
            encodeURIComponent(q.trim()) +
            '">Запустить поиск по памяти →</a>') +
        "</div>";
      return;
    }
    var html = "";
    var lastGroup = null;
    found.forEach(function (c, idx) {
      if (c.group !== lastGroup) {
        html += '<div class="palette-group">' + c.group + "</div>";
        lastGroup = c.group;
      }
      var lock = c.gated
        ? '<svg class="icon palette-lock" viewBox="0 0 24 24" aria-hidden="true"><rect width="14" height="10" x="5" y="11" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>'
        : "";
      html +=
        '<button type="button" class="palette-item" role="option" id="pal-opt-' +
        idx +
        '" data-idx="' +
        idx +
        '" data-active="' +
        (idx === 0) +
        '"' +
        (c.gated ? ' aria-label="' + esc(c.title) + ' — откроется после входа"' : "") +
        ">" +
        lock +
        markMatch(c.title, ql) +
        (c.href ? '<span class="palette-id">' + esc(c.href.replace(".html", "").replace(/^/, "/")) + "</span>" : "") +
        "</button>";
    });
    pResults.innerHTML = html;
    pResults.querySelectorAll(".palette-item").forEach(function (it) {
      it.addEventListener("click", function () {
        runPaletteItem(parseInt(it.dataset.idx, 10));
      });
      it.addEventListener("mousemove", function () {
        setActive(parseInt(it.dataset.idx, 10));
      });
    });
  }

  function setActive(idx) {
    if (!pItems.length) return;
    pActive = (idx + pItems.length) % pItems.length;
    pResults.querySelectorAll(".palette-item").forEach(function (it) {
      it.dataset.active = parseInt(it.dataset.idx, 10) === pActive ? "true" : "false";
    });
    if (pInput) pInput.setAttribute("aria-activedescendant", "pal-opt-" + pActive);
    var cur = pResults.querySelector('.palette-item[data-idx="' + pActive + '"]');
    if (cur) cur.scrollIntoView({ block: "nearest" });
  }

  function runPaletteItem(idx) {
    var c = pItems[idx];
    if (!c) return;
    closeOverlay(palette);
    if (c.act === "theme") {
      doc.querySelector("[data-theme-toggle]") && doc.querySelector("[data-theme-toggle]").click();
      return;
    }
    if (c.act === "density") {
      doc.querySelector("[data-density-toggle]") && doc.querySelector("[data-density-toggle]").click();
      return;
    }
    if (c.act === "lang") {
      toast("Переключение RU|EN — в стенде не переведено", "info");
      return;
    }
    if (c.act === "give-task") {
      if (window.location.pathname.indexOf("tasks.html") >= 0) {
        /* on the tasks page the page script owns the wizard */
        doc.dispatchEvent(new CustomEvent("stand:give-task"));
      } else {
        go("tasks.html?wizard=1");
      }
      return;
    }
    if (c.act === "pair") {
      go("pair.html");
      return;
    }
    if (c.href) {
      /* the auth page is self-evident — no «Перешли» toast on the way to it */
      if (c.href.indexOf("auth.html") !== 0) {
        toast("Перешли: " + c.title.split(" · ")[0].replace(/^агент |^документы /, ""), "success");
      }
      go(c.href);
    }
  }

  function openPalette() {
    if (!palette) return;
    openOverlay(palette);
    renderPalette("");
  }
  window.standOpenPalette = openPalette;

  if (palette) {
    doc.addEventListener("click", function (e) {
      if (e.target.closest("[data-palette-open]")) {
        openPalette();
        return;
      }
      if (e.target === palette) closeOverlay(palette);
    });
    pInput.addEventListener("input", function () {
      renderPalette(pInput.value);
    });
    pInput.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive(pActive + 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive(pActive - 1);
      } else if (e.key === "Enter") {
        e.preventDefault();
        runPaletteItem(pActive);
      }
    });
    palette.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeOverlay(palette);
      }
    });
  }

  /* ── Hotkeys cheat-sheet modal (03 §7) ──────────────────────────────── */
  var cheatsheet = doc.getElementById("cheatsheet");
  if (cheatsheet) {
    doc.addEventListener("click", function (e) {
      if (e.target.closest("[data-cheatsheet-open]")) openOverlay(cheatsheet);
      if (e.target === cheatsheet) closeOverlay(cheatsheet);
      if (e.target.closest("[data-modal-close]")) closeOverlay(e.target.closest(".overlay"));
    });
  }
  function anyOpenOverlay() {
    return doc.querySelector(".overlay:not([hidden])");
  }

  /* ── Global hotkeys ─────────────────────────────────────────────────── */
  var gArmed = null;
  /* v7-раунд: индикаторов может быть несколько (на Корее — в крошках для
   * гейта анонима и в шапке каркаса); видим в каждый момент ровно один */
  var gIndicators = Array.prototype.slice.call(doc.querySelectorAll(".gprefix"));
  var gTimer = null;
  function armG() {
    gArmed = true;
    gIndicators.forEach(function (el) { el.classList.add("on"); });
    if (gTimer) clearTimeout(gTimer);
    gTimer = setTimeout(disarmG, 1500);
  }
  function disarmG() {
    gArmed = null;
    gIndicators.forEach(function (el) { el.classList.remove("on"); });
  }
  var gMap = {
    o: "index.html",
    m: "memories.html",
    t: "tasks.html",
    b: "tasks.html",
    i: "tasks.html?view=inbox",
    a: "agents.html",
    d: "docs.html",
    w: "desktop.html",
    s: "explorer.html",
    p: "memories.html",
    e: "agents.html",
    k: "kora.html",
  };
  /* v3: t/b/i открыли реальный домен «Задачи» — gStub больше не нужен для них */
  var gStub = {};

  doc.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      if (palette && !palette.hidden) closeOverlay(palette);
      else openPalette();
      return;
    }
    if (e.key === "Escape") {
      var ov = anyOpenOverlay();
      if (ov) {
        e.preventDefault();
        closeOverlay(ov);
      } else if (app.classList.contains("side-open")) {
        app.classList.remove("side-open");
      }
      return;
    }
    /* focus trap for the topmost overlay (palette, modals) — Tab never escapes */
    var topOverlay = anyOpenOverlay();
    if (e.key === "Tab" && topOverlay) {
      var f = topOverlay.querySelectorAll("button, input, a[href], select, textarea");
      if (f.length) {
        var firstF = f[0];
        var lastF = f[f.length - 1];
        if (e.shiftKey && doc.activeElement === firstF) {
          e.preventDefault();
          lastF.focus();
        } else if (!e.shiftKey && doc.activeElement === lastF) {
          e.preventDefault();
          firstF.focus();
        }
      }
      return;
    }
    if (inInput(e)) return;
    if (e.key === "/") {
      e.preventDefault();
      /* v6: global search is gated — it returns memory contents (07k §0) */
      if (root.getAttribute("data-auth") === "anon") {
        toast("Поиск откроется после входа — он ищет по памяти", "info");
        return;
      }
      if (topInput) topInput.focus();
      return;
    }
    if (e.key === "?") {
      e.preventDefault();
      if (cheatsheet) openOverlay(cheatsheet);
      return;
    }
    if (e.key === "[") {
      e.preventDefault();
      toggleSidebar();
      return;
    }
    if (e.key === "g") {
      armG();
      return;
    }
    if (gArmed && gMap[e.key.toLowerCase()]) {
      var k = e.key.toLowerCase();
      disarmG();
      if (gStub[k]) {
        toast("«" + gStub[k] + "» — раздел вне стенда; в сайдбаре помечен как недоступный", "info");
        return;
      }
      /* v6: gated destinations for an anonymous visitor (07k §2.2):
       * navigation itself is URL-first and not a secret — the gate screen
       * waits at the destination, no redirect loops. */
      toast("Перешли: " + k, "success");
      go(gMap[k]);
    }
  });

  /* ── Mobile drawer close on nav click ───────────────────────────────── */
  doc.querySelectorAll(".sidebar a").forEach(function (a) {
    a.addEventListener("click", function () {
      app.classList.remove("side-open");
    });
  });
})();
