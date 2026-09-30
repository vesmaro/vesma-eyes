/* tasks.js — «Живая кора» stand v3: tasks world (spec 07g).
 * Views: Канбан (вид №1) · Список · Входящие · Архив; task drawer with 4 tabs;
 * «Дать задачу» wizard with honest outcomes (07b §5 canon). Vanilla JS.
 * Demo mutations actually mutate stand fixtures so pages stay consistent. */
(function () {
  "use strict";

  /* v6 (07k §3): anonymous visit renders the gate instead of the board —
   * shell.js has already replaced #main; nothing here should run or throw. */
  if (document.getElementById("main") && document.getElementById("main").dataset.gated) return;

  var D = window.STAND;
  var doc = document;
  var toast = window.standToast;
  var store = {
    get: function (k, d) {
      try { return localStorage.getItem(k) || d; } catch (e) { return d; }
    },
    set: function (k, v) {
      try { localStorage.setItem(k, v); } catch (e) { /* file:// ok */ }
    },
  };

  /* ── helpers ─────────────────────────────────────────────────────────── */
  function el(tag, cls, text) {
    var n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function stateName(key) {
    for (var i = 0; i < D.taskStates.length; i++) {
      if (D.taskStates[i].key === key) return D.taskStates[i].name;
    }
    return key;
  }
  function findTask(id) {
    for (var i = 0; i < D.tasks.length; i++) {
      if (D.tasks[i].id === id) return D.tasks[i];
    }
    return null;
  }
  function plural(n) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return "задачу";
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 > 20)) return "задачи";
    return "задач";
  }
  function pluralNom(n) { /* именительный: для aria-label колонок */
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return "задача";
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 > 20)) return "задачи";
    return "задач";
  }
  function ageMin(age) {
    var m = /^(\d+)\s*(мин|ч|д)$/.exec(String(age).trim());
    if (!m) return 0;
    var v = parseInt(m[1], 10);
    if (m[2] === "ч") v *= 60;
    if (m[2] === "д") v *= 1440;
    return v;
  }
  function priWeight(p) { return p === "высокий" ? 2 : p === "низкий" ? 0 : 1; }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  /* ── shared confirm modal (последствие — в тексте, канон 05 §2.1) ────── */
  var confirmOv = doc.getElementById("confirm");
  var confirmYes = doc.getElementById("confirm-yes");
  var confirmNo = doc.getElementById("confirm-no");
  var confirmCb = null;
  function askConfirm(title, text, yesLabel, cb) {
    doc.getElementById("confirm-title").textContent = title;
    doc.getElementById("confirm-text").textContent = text;
    confirmYes.textContent = yesLabel;
    confirmCb = cb;
    confirmOv.hidden = false;
    confirmNo.focus();
  }
  confirmYes.addEventListener("click", function () {
    confirmOv.hidden = true;
    if (confirmCb) confirmCb();
    confirmCb = null;
  });
  confirmNo.addEventListener("click", function () {
    confirmOv.hidden = true;
    confirmCb = null;
  });
  confirmOv.addEventListener("click", function (e) {
    if (e.target === confirmOv) { confirmOv.hidden = true; confirmCb = null; }
  });

  /* ── view state ──────────────────────────────────────────────────────── */
  var filters = { q: "", tag: null, assignee: null, state: null, hasReport: false };
  var sel = {};          /* list selection by id */
  var sortKey = null;    /* age | priority | state */
  var sortDir = 1;
  var groupsOpen = {};
  try { groupsOpen = JSON.parse(store.get("vesmaro.taskGroups", "{}")) || {}; } catch (e) { groupsOpen = {}; }
  var curView = "board";
  var drawerTask = null;
  var drawerTab = "overview";
  var drawerOpener = null;
  var wizardPrefill = null;

  function persistGroups() { store.set("vesmaro.taskGroups", JSON.stringify(groupsOpen)); }

  function matchFilters(t) {
    if (filters.q) {
      var hay = (t.title + " " + (t.body || []).join(" ")).toLowerCase();
      if (hay.indexOf(filters.q.toLowerCase()) < 0) return false;
    }
    if (filters.tag && t.tags.indexOf(filters.tag) < 0) return false;
    if (filters.assignee) {
      if (filters.assignee === "none") { if (t.assignee) return false; }
      else if (t.assignee !== filters.assignee) return false;
    }
    if (filters.state && t.state !== filters.state) return false;
    if (filters.hasReport && !t.reportCount) return false;
    return true;
  }
  function anyFilterActive() {
    return !!(filters.q || filters.tag || filters.assignee || filters.state || filters.hasReport);
  }

  /* ── view switcher (Канбан — вид №1) ─────────────────────────────────── */
  var segBtns = [].slice.call(doc.querySelectorAll(".view-row .segment button"));
  var viewSections = {
    board: doc.getElementById("view-board"),
    list: doc.getElementById("view-list"),
    inbox: doc.getElementById("view-inbox"),
    archive: doc.getElementById("view-archive"),
  };
  var viewNames = { board: "Канбан", list: "Список", inbox: "Входящие", archive: "Архив" };

  function setView(v, focus) {
    curView = v;
    segBtns.forEach(function (b) {
      b.setAttribute("aria-pressed", b.dataset.view === v ? "true" : "false");
    });
    Object.keys(viewSections).forEach(function (k) {
      viewSections[k].hidden = k !== v;
    });
    var crumb = doc.getElementById("crumb-view");
    if (crumb) crumb.textContent = viewNames[v];
    if (v === "board") renderBoard();
    if (v === "list") renderList();
    if (v === "inbox") renderInbox();
    if (v === "archive") renderArchive();
    if (focus) {
      var h2 = viewSections[v].querySelector("h2");
      if (h2) h2.focus();
    }
    try {
      var u = new URL(window.location.href);
      u.searchParams.set("view", v);
      window.history.replaceState({}, "", u);
    } catch (e) { /* file:// */ }
  }
  segBtns.forEach(function (b) {
    b.addEventListener("click", function () { setView(b.dataset.view, true); });
  });

  /* ══ KANBAN (07g §2) ══════════════════════════════════════════════════ */
  var boardEl = doc.getElementById("board");

  function confHtml(t) {
    if (t.conf == null) return "";
    var low = t.conf < 0.7 ? " low" : "";
    return '<span class="conf-point' + low + '" title="Уверенность записи: ' + t.conf + '">' + t.conf + "</span>";
  }
  function chipsHtml(t) {
    var out = "";
    t.tags.slice(0, 2).forEach(function (tg) {
      out += '<button type="button" class="chip" data-tag="' + esc(tg) + '">#' + esc(tg) + "</button>";
    });
    var rest = Math.max(0, t.tags.length - 2) + (t.extraTags || 0);
    if (rest > 0) out += '<span class="tc-more" title="Остальные теги задачи">+' + rest + "</span>";
    return out;
  }

  function makeCard(t) {
    var card = el("article", "task-card");
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-label", "Задача «" + t.title + "», " + stateName(t.state) +
      ", " + (t.assignee || "без исполнителя") + (t.unreadReport ? ", есть непрочитанный отчёт" : "") +
      ". Откроется карточка задачи; перенос — через меню «⋯»");
    card.dataset.id = t.id;
    var h = '<span class="tc-title">' + esc(t.title) + "</span>" +
      '<span class="tc-chips">' + confHtml(t) + chipsHtml(t) + "</span>";
    if (t.blockedNote) {
      h += '<span class="tc-failed" title="' + esc(t.blockedNote) + '">не вышло</span>';
    }
    if (t.stagnant) {
      h += '<span class="tc-stagn">⚠ ' + esc(t.stagnant) + "</span>";
    }
    h += '<span class="tc-foot">' +
      '<span class="tc-assignee">' + esc(t.assignee || "без исполнителя") + "</span>" +
      '<span class="tc-age">' + esc(t.age) + "</span>";
    if (t.unreadReport) {
      h += '<button type="button" class="report-dot" data-report="' + t.id +
        '" aria-label="Непрочитанный отчёт — открыть отчёты задачи" title="непрочитанный отчёт ' +
        esc((t.assignee || "").replace("агент ", "")) + " · " + esc(t.reportAge || "только что") + '"></button>';
    }
    h += '<button type="button" class="tc-menu" data-move="' + t.id +
      '" aria-haspopup="menu" aria-label="Перенести «' + esc(t.title) + '» в другую колонку">' +
      '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>' +
      "</button>";
    h += "</span>";
    card.innerHTML = h;

    card.addEventListener("click", function (e) {
      var dot = e.target.closest("[data-report]");
      if (dot) { e.stopPropagation(); openDrawer(t.id, "reports", card); return; }
      var chip = e.target.closest("[data-tag]");
      if (chip) {
        e.stopPropagation();
        filters.tag = chip.dataset.tag;
        setView("list");
        toast("Фильтр по тегу #" + chip.dataset.tag + " — в Списке", "info");
        return;
      }
      if (e.target.closest("[data-move]")) { e.stopPropagation(); return; }
      openDrawer(t.id, "overview", card);
    });
    card.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDrawer(t.id, "overview", card); }
    });
    /* pointer DnD; keyboard parity — меню «Перенести в…» (07g §2.3) */
    card.draggable = true;
    card.addEventListener("dragstart", function (e) {
      e.dataTransfer.setData("text/plain", t.id);
      e.dataTransfer.effectAllowed = "move";
      card.classList.add("dragging");
    });
    card.addEventListener("dragend", function () { card.classList.remove("dragging"); });
    card.querySelector("[data-move]").addEventListener("click", function (e) {
      e.stopPropagation();
      openMoveMenu(t.id, e.currentTarget);
    });
    return card;
  }

  function buildColumn(state) {
    var inCol = D.tasks.filter(function (t) { return t.state === state.key && matchFilters(t); });
    var col = el("section", "board-col");
    col.dataset.state = state.key;
    col.setAttribute("aria-label", "Колонка «" + state.name + "», " + inCol.length + " " + pluralNom(inCol.length));
    var head = el("div", "col-head");
    head.appendChild(el("span", null, state.name));
    head.appendChild(el("span", "col-count", String(inCol.length)));
    col.appendChild(head);
    /* warning-полоса 2px — только при реальной блокировке внутри (07g §2.1) */
    if (state.key === "blocked" && inCol.length) col.classList.add("col-blocked-live");
    var body = el("div", "col-body");
    body.setAttribute("role", "list");
    body.setAttribute("aria-label", "Задачи колонки «" + state.name + "»");
    body.addEventListener("dragover", function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      body.classList.add("drag-over");
    });
    body.addEventListener("dragleave", function (e) {
      if (!body.contains(e.relatedTarget)) body.classList.remove("drag-over");
    });
    body.addEventListener("drop", function (e) {
      e.preventDefault();
      body.classList.remove("drag-over");
      var id = e.dataTransfer.getData("text/plain");
      if (id) requestMove(id, state.key);
    });
    if (!inCol.length) {
      var emptyText = "Здесь пусто — задачи в этом состоянии появятся, когда меняется их состояние в памяти";
      if (state.key === "open" && !D.tasks.length) emptyText = "Задач нет — начните с «Дать задачу» или загляните во Входящие";
      var empty = el("p", "col-empty", emptyText);
      if (state.key === "open" && !D.tasks.length) {
        var cta = el("div");
        cta.className = "col-empty-cta";
        var b = el("button", "btn primary sm", "Дать задачу");
        b.type = "button";
        b.addEventListener("click", openWizard);
        cta.appendChild(b);
        var wrap = el("div");
        wrap.appendChild(empty);
        wrap.appendChild(cta);
        body.appendChild(wrap);
      } else {
        body.appendChild(empty);
      }
    } else {
      var byProject = {};
      inCol.forEach(function (t) {
        if (!byProject[t.project]) byProject[t.project] = [];
        byProject[t.project].push(t);
      });
      var projKeys = Object.keys(byProject).sort();
      if (projKeys.length === 1) {
        byProject[projKeys[0]].forEach(function (t) {
          var li = el("div");
          li.setAttribute("role", "listitem");
          li.appendChild(makeCard(t));
          body.appendChild(li);
        });
      } else {
        projKeys.forEach(function (pk) {
          var grp = el("div", "task-group");
          var gh = el("button", "tg-head");
          gh.type = "button";
          gh.setAttribute("aria-expanded", groupsOpen[pk] === false ? "false" : "true");
          gh.setAttribute("aria-controls", "tg-" + state.key + "-" + pk);
          gh.innerHTML = '<svg class="chev icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>' +
            "<span>" + esc(pk) + "</span>" +
            '<span class="tg-count">' + byProject[pk].length + "</span>";
          var gb = el("div", "tg-body");
          gb.id = "tg-" + state.key + "-" + pk;
          if (groupsOpen[pk] === false) gb.hidden = true;
          byProject[pk].forEach(function (t) {
            var li = el("div");
            li.setAttribute("role", "listitem");
            li.appendChild(makeCard(t));
            gb.appendChild(li);
          });
          gh.addEventListener("click", function () {
            var open = gh.getAttribute("aria-expanded") === "true";
            gh.setAttribute("aria-expanded", open ? "false" : "true");
            gb.hidden = open;
            groupsOpen[pk] = !open;
            persistGroups();
          });
          grp.appendChild(gh);
          grp.appendChild(gb);
          body.appendChild(grp);
        });
      }
    }
    col.appendChild(body);
    return col;
  }

  function renderBoard() {
    boardEl.innerHTML = "";
    D.taskStates.forEach(function (s) {
      boardEl.appendChild(buildColumn(s));
    });
    renderMiniStats();
    updateScrollHint();
  }

  /* скролл-хинт «→ ещё N кол.»: появляется, когда доска честно скроллится;
     клик — прокрутка вправо (дефект приёмки №1: признак прокрутки) */
  var scrollHint = doc.getElementById("board-scroll-hint");
  var scrollHintCount = doc.getElementById("board-hint-count");
  function updateScrollHint() {
    var over = boardEl.scrollWidth - boardEl.clientWidth;
    if (over > 8) {
      var hiddenCols = Math.ceil(over / (boardEl.querySelector(".board-col").offsetWidth + 12));
      scrollHintCount.textContent = String(Math.max(1, hiddenCols));
      scrollHint.hidden = false;
    } else {
      scrollHint.hidden = true;
    }
  }
  scrollHint.addEventListener("click", function () {
    boardEl.scrollBy({ left: boardEl.clientWidth * 0.6, behavior: "smooth" });
  });
  boardEl.addEventListener("scroll", function () {
    updateScrollHint();
  });
  if (window.ResizeObserver) {
    new ResizeObserver(updateScrollHint).observe(boardEl);
  } else {
    window.addEventListener("resize", updateScrollHint);
  }
  /* reduced-motion: прокрутка мгновенно (глобальный guard base.css гасит smooth) */

  /* мини-статы: «Готово за сегодня: N · Решено: N» (mono tnum, кликабельны) */
  function renderMiniStats() {
    var box = doc.getElementById("mini-stats");
    var done = D.tasks.filter(function (t) { return t.state === "done"; }).length;
    var res = D.tasks.filter(function (t) { return t.state === "resolved"; }).length;
    var b1 = doc.getElementById("ms-done");
    var b2 = doc.getElementById("ms-resolved");
    b1.textContent = "Готово за сегодня: " + done;
    b2.textContent = "Решено: " + res;
    b1.onclick = function () {
      filters.state = "done";
      setView("list");
    };
    b2.onclick = function () {
      filters.state = "resolved";
      setView("list");
    };
  }

  /* DnD: перенос в «готово» — только через confirm (07g §2.3) */
  function requestMove(id, toState) {
    var t = findTask(id);
    if (!t || t.state === toState) return;
    if (toState === "done") {
      askConfirm(
        "Закрыть «" + t.title + "»?",
        "Состояние в памяти изменится на task:done — агенты это увидят.",
        "Закрыть задачу",
        function () { applyMove(id, toState, ""); }
      );
    } else {
      applyMove(id, toState, "Перенесли в «" + stateName(toState) + "»");
    }
  }
  function applyMove(id, toState, msg) {
    var t = findTask(id);
    if (!t) return;
    t.state = toState;
    renderBoard();
    renderListIfVisible();
    var cardEl = boardEl.querySelector('.task-card[data-id="' + id + '"]');
    if (cardEl) {
      cardEl.classList.add("dropped");
      setTimeout(function () { cardEl.classList.remove("dropped"); }, 320);
    }
    if (msg) toast(msg, "success");
  }
  function renderListIfVisible() {
    if (curView === "list") renderList();
  }

  /* клавиатурный паритет DnD: меню «Перенести в…» (07g §2.3 / WCAG 2.1.1) */
  var moveMenu = doc.getElementById("move-menu");
  var moveOpener = null;
  function openMoveMenu(id, openerBtn) {
    moveOpener = openerBtn;
    var t = findTask(id);
    moveMenu.innerHTML = "";
    moveMenu.appendChild(el("div", "mm-head", "Перенести «" + t.title + "» в…"));
    D.taskStates.forEach(function (s) {
      var b = el("button", null, stateName(s.key));
      b.type = "button";
      if (s.key === t.state) {
        b.setAttribute("aria-disabled", "true");
        var now = el("span", "mm-now", "сейчас");
        b.appendChild(now);
      } else {
        b.addEventListener("click", function () {
          closeMoveMenu();
          requestMove(id, s.key);
        });
      }
      moveMenu.appendChild(b);
    });
    moveMenu.hidden = false;
    var r = openerBtn.getBoundingClientRect();
    var top = Math.min(r.bottom + 4, window.innerHeight - moveMenu.offsetHeight - 8);
    var left = Math.min(r.left, window.innerWidth - moveMenu.offsetWidth - 8);
    moveMenu.style.top = Math.max(8, top) + "px";
    moveMenu.style.left = Math.max(8, left) + "px";
    var first = moveMenu.querySelector("button:not([aria-disabled='true'])") || moveMenu.querySelector("button");
    if (first) first.focus();
  }
  function closeMoveMenu() {
    moveMenu.hidden = true;
    if (moveOpener) moveOpener.focus();
    moveOpener = null;
  }
  doc.addEventListener("click", function (e) {
    if (!moveMenu.hidden && !e.target.closest("#move-menu") && !e.target.closest("[data-move]")) closeMoveMenu();
  });
  doc.addEventListener("keydown", function (e) {
    if (moveMenu.hidden) return;
    if (e.key === "Escape") { e.stopPropagation(); closeMoveMenu(); }
    if (e.key === "Tab") {
      var f = [].slice.call(moveMenu.querySelectorAll("button"));
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  /* демо-события: пульс только по событию демо-ленты (07g §10) */
  var demoMoveBtn = doc.getElementById("demo-agent-move");
  if (demoMoveBtn) {
    demoMoveBtn.addEventListener("click", function () {
      var t = findTask("T-131");
      if (!t || t.state !== "open") return;
      t.state = "in-progress";
      renderBoard();
      var cardEl = boardEl.querySelector('.task-card[data-id="' + t.id + '"]');
      if (cardEl) cardEl.classList.add("card-enter");
      toast("агент core взял «Дозапись смыслового индекса» — автоперенос из памяти", "success");
    });
  }
  var demoReportBtn = doc.getElementById("demo-report");
  if (demoReportBtn) {
    demoReportBtn.addEventListener("click", function () {
      var t = findTask("T-131");
      if (!t) return;
      t.unreadReport = true;
      t.reportAge = "только что";
      renderBoard();
      var cardEl = boardEl.querySelector('.task-card[data-id="' + t.id + '"]');
      if (cardEl) cardEl.classList.add("card-enter");
      toast("Новый отчёт агента — золотая точка на карточке", "info");
    });
  }

  /* ══ LIST (07g §3) ════════════════════════════════════════════════════ */
  var listBody = doc.getElementById("task-tbody");
  var bulkbar = doc.getElementById("bulkbar");
  var bulkCount = doc.getElementById("bulk-count");

  function listTasks() {
    var rows = D.tasks.filter(matchFilters);
    if (sortKey === "age") {
      rows.sort(function (a, b) { return sortDir * (ageMin(a.age) - ageMin(b.age)); });
    } else if (sortKey === "priority") {
      rows.sort(function (a, b) { return sortDir * (priWeight(b.priority) - priWeight(a.priority)); });
    } else if (sortKey === "state") {
      var order = D.taskStates.map(function (s) { return s.key; });
      rows.sort(function (a, b) { return sortDir * (order.indexOf(a.state) - order.indexOf(b.state)); });
    }
    return rows;
  }

  function renderList() {
    listBody.innerHTML = "";
    var rows = listTasks();
    var listEmpty = doc.getElementById("list-empty");
    var tableWrap = doc.getElementById("list-table-wrap");
    if (!rows.length) {
      tableWrap.hidden = true;
      bulkbar.hidden = true;
      listEmpty.hidden = false;
      doc.getElementById("list-empty-title").textContent = anyFilterActive()
        ? "Под эти фильтры не попало ни одной задачи"
        : "Задач нет — начните с «Дать задачу» или загляните во Входящие";
      return;
    }
    listEmpty.hidden = true;
    tableWrap.hidden = false;
    rows.forEach(function (t) {
      var tr = doc.createElement("tr");
      tr.dataset.id = t.id;
      if (sel[t.id]) tr.classList.add("row-selected");
      tr.setAttribute("aria-selected", sel[t.id] ? "true" : "false");

      var td0 = doc.createElement("td");
      var cb = doc.createElement("input");
      cb.type = "checkbox";
      cb.className = "checkbox";
      cb.setAttribute("aria-label", "Выбрать задачу «" + t.title + "»");
      cb.checked = !!sel[t.id];
      cb.addEventListener("change", function () {
        if (cb.checked) sel[t.id] = true; else delete sel[t.id];
        tr.classList.toggle("row-selected", cb.checked);
        tr.setAttribute("aria-selected", cb.checked ? "true" : "false");
        renderBulk();
      });
      td0.appendChild(cb);
      tr.appendChild(td0);

      var tdT = doc.createElement("td");
      tdT.className = "t-title";
      var btnT = el("button", "t-title-btn", t.title);
      btnT.type = "button";
      btnT.addEventListener("click", function () { openDrawer(t.id, "overview", tr); });
      tdT.appendChild(btnT);
      tr.appendChild(tdT);

      var tdS = doc.createElement("td");
      var badge = el("span", "state-badge", stateName(t.state));
      badge.dataset.state = t.state;
      tdS.appendChild(badge);
      if (t.stagnant) tdS.appendChild(el("span", "tc-stagn", " · " + t.stagnant));
      tr.appendChild(tdS);

      var tdP = doc.createElement("td");
      tdP.textContent = t.priority;
      tr.appendChild(tdP);

      var tdA = doc.createElement("td");
      tdA.className = "t-age";
      tdA.textContent = t.age;
      tr.appendChild(tdA);

      var tdAs = doc.createElement("td");
      tdAs.className = "t-assignee";
      tdAs.textContent = t.assignee || "—";
      tr.appendChild(tdAs);

      var tdR = doc.createElement("td");
      tdR.className = "t-reports";
      if (t.reportCount) {
        tdR.appendChild(el("span", null, (t.unreadReport ? "● " : "") + t.reportCount + " отч."));
        tdR.title = t.unreadReport ? "есть непрочитанный отчёт" : "отчёты прочитаны";
        if (t.unreadReport) tdR.style.color = "var(--color-confidence)";
        var rbtn = el("button", "report-dot");
        rbtn.type = "button";
        rbtn.setAttribute("aria-label", "Открыть отчёты задачи «" + t.title + "»");
        rbtn.addEventListener("click", function () { openDrawer(t.id, "reports", tr); });
        tdR.appendChild(rbtn);
      } else {
        tdR.textContent = "—";
      }
      tr.appendChild(tdR);

      var tdG = doc.createElement("td");
      t.tags.slice(0, 2).forEach(function (tg) {
        var c = el("button", "chip", "#" + tg);
        c.type = "button";
        c.addEventListener("click", function () {
          filters.tag = tg;
          renderList();
          toast("Фильтр по тегу #" + tg, "info");
        });
        tdG.appendChild(c);
      });
      var moreN = Math.max(0, t.tags.length - 2) + (t.extraTags || 0);
      if (moreN > 0) tdG.appendChild(el("span", "tc-more", "+" + moreN));
      tr.appendChild(tdG);

      tr.addEventListener("keydown", function (e) {
        if (e.key === "x") {
          cb.checked = !cb.checked;
          var ev = doc.createEvent("HTMLEvents");
          ev.initEvent("change", true, false);
          cb.dispatchEvent(ev);
        } else if (e.key === "Enter") {
          openDrawer(t.id, "overview", tr);
        } else if (e.key === "j" || e.key === "k") {
          e.preventDefault();
          moveRowFocus(tr, e.key === "j" ? 1 : -1);
        }
      });
      listBody.appendChild(tr);
    });
    renderBulk();
  }
  function moveRowFocus(row, dir) {
    var rows = [].slice.call(listBody.querySelectorAll("tr"));
    var i = rows.indexOf(row) + dir;
    if (i >= 0 && i < rows.length) {
      row.tabIndex = -1;
      rows[i].tabIndex = 0;
      rows[i].focus();
    }
  }

  /* bulk: каждое действие — confirm с числом и последствием (07g §3) */
  function renderBulk() {
    var ids = Object.keys(sel);
    bulkbar.hidden = !ids.length;
    if (ids.length) bulkCount.textContent = "Выбрано: " + ids.length;
  }
  doc.getElementById("bulk-cancel").addEventListener("click", function () {
    sel = {};
    renderList();
  });
  doc.getElementById("bulk-state-apply").addEventListener("click", function () {
    var ids = Object.keys(sel);
    if (!ids.length) return;
    var to = doc.getElementById("bulk-state").value;
    if (to === "done") {
      askConfirm(
        "Закрыть " + ids.length + " " + plural(ids.length) + "?",
        "Состояние в памяти изменится на task:done — агенты это увидят.",
        "Закрыть",
        function () { bulkApplyState(ids, to); }
      );
    } else {
      bulkApplyState(ids, to);
    }
  });
  function bulkApplyState(ids, to) {
    ids.forEach(function (id) {
      var t = findTask(id);
      if (t) t.state = to;
    });
    sel = {};
    renderList();
    toast("Сменили состояние на «" + stateName(to) + "» — карточки переедут в канбане", "success");
  }
  doc.getElementById("bulk-assign-apply").addEventListener("click", function () {
    var ids = Object.keys(sel);
    if (!ids.length) return;
    var v = doc.getElementById("bulk-assign").value;
    var label = v === "none" ? "снять исполнителей" : v;
    askConfirm(
      "Назначить исполнителя: " + label + "?",
      "Изменится очередь " + ids.length + " " + plural(ids.length) + " — исполнители увидят задачи после ближайшего доклада.",
      "Назначить",
      function () {
        ids.forEach(function (id) {
          var t = findTask(id);
          if (t) t.assignee = v === "none" ? null : v;
        });
        sel = {};
        renderList();
        toast("Исполнитель назначен — задачи в очереди исполнителей", "success");
      }
    );
  });
  doc.getElementById("bulk-archive").addEventListener("click", function () {
    var ids = Object.keys(sel);
    if (!ids.length) return;
    askConfirm(
      "Архивировать " + ids.length + " " + plural(ids.length) + "?",
      "Из канбана исчезнут; история и отчёты сохранятся.",
      "Архивировать",
      function () {
        ids.forEach(function (id) {
          var t = findTask(id);
          if (!t) return;
          archiveTask(t, "сегодня");
        });
        sel = {};
        renderList();
        toast("Архивировали — задачи в Архиве, история сохранена", "success");
      }
    );
  });
  function archiveTask(t, dateLabel) {
    D.taskArchive.unshift({
      id: t.id, title: t.title, project: t.project,
      month: "сентябрь 2026", from: stateName(t.state),
      date: dateLabel, reports: t.reportCount || 0,
      summary: (t.body && t.body[0] ? t.body[0] : "").slice(0, 120),
    });
    D.tasks = D.tasks.filter(function (x) { return x.id !== t.id; });
  }

  /* сортировка: aria-sort + подсказка направления */
  [].slice.call(doc.querySelectorAll(".th-sort")).forEach(function (b) {
    b.addEventListener("click", function () {
      var k = b.dataset.sort;
      if (sortKey === k) sortDir = -sortDir;
      else { sortKey = k; sortDir = 1; }
      [].slice.call(doc.querySelectorAll("th[data-sort]")).forEach(function (th) {
        th.removeAttribute("aria-sort");
        th.removeAttribute("title");
      });
      var th = b.closest("th");
      th.setAttribute("aria-sort", sortDir === 1 ? "ascending" : "descending");
      th.setAttribute("title", sortDir === 1 ? "сортировка по возрастанию" : "сортировка по убыванию");
      renderList();
    });
  });

  /* фильтры чипами: исполнитель · тег · состояние · «есть отчёт» */
  [].slice.call(doc.querySelectorAll("[data-filter]")).forEach(function (c) {
    c.addEventListener("click", function () {
      var k = c.dataset.filter;
      var v = c.dataset.value;
      var on = c.getAttribute("aria-pressed") === "true";
      c.setAttribute("aria-pressed", on ? "false" : "true");
      if (k === "hasReport") filters.hasReport = !on;
      else filters[k] = on ? null : v;
      renderList();
    });
  });
  doc.getElementById("list-q").addEventListener("input", function () {
    filters.q = this.value.trim();
    renderList();
  });
  var resetBtn = doc.getElementById("filters-reset");
  if (resetBtn) {
    resetBtn.addEventListener("click", function () {
      filters = { q: "", tag: null, assignee: null, state: null, hasReport: false };
      doc.getElementById("list-q").value = "";
      [].slice.call(doc.querySelectorAll("[data-filter]")).forEach(function (c) {
        c.setAttribute("aria-pressed", "false");
      });
      renderList();
      toast("Фильтры сброшены", "info");
    });
  }

  /* ══ INBOX (AGG-1; 07g §4) ════════════════════════════════════════════ */
  var inboxListEl = doc.getElementById("inbox-list");
  var draftListEl = doc.getElementById("draft-list");

  function renderInbox() {
    inboxListEl.innerHTML = "";
    draftListEl.innerHTML = "";
    var empty = doc.getElementById("inbox-empty");
    if (!D.taskInbox.length && !D.taskDrafts.length) {
      empty.hidden = false;
      doc.getElementById("drafts-sec").hidden = true;
      doc.getElementById("drafts-sep").hidden = true;
      return;
    }
    empty.hidden = true;
    D.taskInbox.forEach(function (item) {
      inboxListEl.appendChild(makeInboxCard(item));
    });
    var hasDrafts = D.taskDrafts.length > 0;
    doc.getElementById("drafts-sec").hidden = !hasDrafts;
    doc.getElementById("drafts-sep").hidden = !hasDrafts;
    if (hasDrafts) {
      D.taskDrafts.forEach(function (d) {
        draftListEl.appendChild(makeDraftCard(d));
      });
    }
  }

  function makeInboxCard(item) {
    var card = el("article", "inbox-card");
    card.dataset.id = item.id;
    card.appendChild(el("div", "in-meta", "Принёс " + item.from + " · " + item.where + " · " + item.when));
    card.appendChild(el("div", "in-title", item.title));
    var ex = el("p", "in-excerpt", item.excerpt);
    card.appendChild(ex);
    var more = el("button", "btn ghost sm", "Показать целиком");
    more.type = "button";
    more.setAttribute("aria-expanded", "false");
    more.addEventListener("click", function () {
      var exp = ex.classList.toggle("expanded");
      more.setAttribute("aria-expanded", exp ? "true" : "false");
      more.textContent = exp ? "Свернуть" : "Показать целиком";
    });
    card.appendChild(more);
    var tags = el("div", "tc-chips");
    item.tags.forEach(function (tg) {
      var c = el("button", "chip", "#" + tg);
      c.type = "button";
      c.addEventListener("click", function () {
        filters.tag = tg;
        setView("list");
        toast("Фильтр по тегу #" + tg, "info");
      });
      tags.appendChild(c);
    });
    card.appendChild(tags);
    var actions = el("div", "in-actions");
    var bAdopt = el("button", "btn primary sm", "Принять");
    var bEdit = el("button", "btn secondary sm", "Принять с правкой");
    var bRej = el("button", "btn danger sm", "Отклонить");
    bAdopt.type = bEdit.type = bRej.type = "button";
    actions.appendChild(bAdopt);
    actions.appendChild(bEdit);
    actions.appendChild(bRej);
    card.appendChild(actions);
    var note = el("p", "in-source-note", "Попадёт в канбан; источник останется в памяти");
    note.hidden = true;
    card.appendChild(note);

    /* Принять → попутный выбор колонки и исполнителя */
    bAdopt.addEventListener("click", function () {
      actions.hidden = true;
      note.hidden = false;
      var form = el("div", "in-edit");
      var f1 = el("div", "field");
      var l1 = el("label", null, "Колонка");
      l1.htmlFor = "in-col-" + item.id;
      var s1 = doc.createElement("select");
      s1.id = "in-col-" + item.id;
      s1.className = "confirm-select";
      D.taskStates.slice(0, 2).forEach(function (s) {
        var o = doc.createElement("option");
        o.value = s.key;
        o.textContent = s.name;
        s1.appendChild(o);
      });
      f1.appendChild(l1);
      f1.appendChild(s1);
      var f2 = el("div", "field");
      var l2 = el("label", null, "Исполнитель");
      l2.htmlFor = "in-asg-" + item.id;
      var s2 = doc.createElement("select");
      s2.id = "in-asg-" + item.id;
      s2.className = "confirm-select";
      var asgOpts = [["", "без исполнителя — подождёт в канбане"], ["агент agb", "агент agb · на связи"], ["агент core", "агент core · молчит"]];
      asgOpts.forEach(function (p) {
        var o = doc.createElement("option");
        o.value = p[0];
        o.textContent = p[1];
        s2.appendChild(o);
      });
      f2.appendChild(l2);
      f2.appendChild(s2);
      var row = el("div", "in-actions");
      var ok = el("button", "btn primary sm", "Принять в канбан");
      var cancel = el("button", "btn secondary sm", "Отмена");
      ok.type = cancel.type = "button";
      row.appendChild(ok);
      row.appendChild(cancel);
      form.appendChild(f1);
      form.appendChild(f2);
      form.appendChild(row);
      card.appendChild(form);
      s1.focus();
      cancel.addEventListener("click", function () {
        form.remove();
        note.hidden = true;
        actions.hidden = false;
        bAdopt.focus();
      });
      ok.addEventListener("click", function () {
        adoptInbox(item, s1.value, s2.value || null, item.title, item.tags.slice(), false);
      });
    });

    /* Принять с правкой → инлайн-редактор: «правка попадёт в память — агент увидит» */
    bEdit.addEventListener("click", function () {
      actions.hidden = true;
      note.hidden = true;
      var form = el("div", "in-edit");
      var f = el("div", "field");
      var lab = el("label", null, "Заголовок задачи");
      lab.htmlFor = "in-ed-" + item.id;
      var inp = doc.createElement("input");
      inp.id = "in-ed-" + item.id;
      inp.className = "input";
      inp.value = item.title;
      f.appendChild(lab);
      f.appendChild(inp);
      var tagsEdit = el("div", "tag-pick");
      item.tags.forEach(function (tg) {
        var c = el("button", "chip", "#" + tg);
        c.type = "button";
        c.setAttribute("aria-pressed", "true");
        c.addEventListener("click", function () {
          c.setAttribute("aria-pressed", c.getAttribute("aria-pressed") === "true" ? "false" : "true");
        });
        tagsEdit.appendChild(c);
      });
      var hint = el("p", "in-source-note", "Правка попадёт в память — агент увидит");
      var row = el("div", "in-actions");
      var ok = el("button", "btn primary sm", "Принять с правкой");
      var cancel = el("button", "btn secondary sm", "Отмена");
      ok.type = cancel.type = "button";
      row.appendChild(ok);
      row.appendChild(cancel);
      form.appendChild(f);
      form.appendChild(tagsEdit);
      form.appendChild(hint);
      form.appendChild(row);
      card.appendChild(form);
      inp.focus();
      cancel.addEventListener("click", function () {
        form.remove();
        actions.hidden = false;
        bEdit.focus();
      });
      ok.addEventListener("click", function () {
        var kept = [].slice.call(tagsEdit.querySelectorAll('button[aria-pressed="true"]')).map(function (b) {
          return b.textContent.replace("#", "");
        });
        adoptInbox(item, "open", null, inp.value.trim() || item.title, kept, true);
      });
    });

    /* Отклонить → confirm с причиной + «не потеряется» */
    bRej.addEventListener("click", function () {
      rejectInbox(item, card);
    });
    return card;
  }

  function rejectInbox(item, card) {
    var reasonSel = doc.createElement("select");
    reasonSel.id = "reject-reason";
    reasonSel.className = "confirm-select";
    [["дубль", "Дубль уже разобранной записи"], ["не задача", "Это не задача"], ["не актуально", "Неактуально"]].forEach(function (p) {
      var o = doc.createElement("option");
      o.value = p[0];
      o.textContent = p[1];
      reasonSel.appendChild(o);
    });
    var lab = el("label", null, "Причина");
    lab.htmlFor = "reject-reason";
    var wrap = el("div", "field");
    wrap.appendChild(lab);
    wrap.appendChild(reasonSel);
    var body = doc.getElementById("confirm-body");
    body.insertBefore(wrap, body.firstChild);
    var cleanup = function () {
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
    };
    askConfirm(
      "Отклонить «" + item.title + "»?",
      "Отклонённое вернётся в память как пометка — не потеряется.",
      "Отклонить",
      function () {
        card.classList.add("leaving");
        setTimeout(function () {
          D.taskInbox = D.taskInbox.filter(function (x) { return x.id !== item.id; });
          renderInbox();
        }, 250);
        toast("Отклонено · пометка в памяти: " + reasonSel.value, "info");
      }
    );
    /* confirm modal закрылся — убрать временный селект после выбора/отмены */
    setTimeout(cleanup, 0);
    confirmYes.addEventListener("click", cleanup, { once: true });
    confirmNo.addEventListener("click", cleanup, { once: true });
    confirmOv.addEventListener("click", cleanup, { once: true });
    reasonSel.focus();
  }

  function adoptInbox(item, state, assignee, title, tags, edited) {
    var t = {
      id: nextTaskId(),
      title: title,
      state: state,
      project: "mnemos-eyes",
      conf: 0.6,
      tags: tags,
      extraTags: 0,
      assignee: assignee,
      host: assignee ? "—" : null,
      age: "только что",
      priority: "обычный",
      unreadReport: false,
      reportCount: 0,
      body: [item.excerpt + (edited ? " (правка владельца вернулась в память — агент увидит)" : "")],
      reports: [],
      history: [{ what: "предложение агента принято владельцем", when: "только что", actor: "вы" }],
      execution: assignee
        ? { state: "queued", line: "в очереди · " + assignee, pulse: "агент заберёт задачу при возвращении на связь" }
        : null,
    };
    D.tasks.push(t);
    D.taskInbox = D.taskInbox.filter(function (x) { return x.id !== item.id; });
    renderInbox();
    toast("Принято — «" + title + "» в канбане; источник остался в памяти", "success");
    renderBoard();
  }

  function makeDraftCard(d) {
    var card = el("article", "inbox-card");
    card.appendChild(el("div", "in-meta", "вы · черновик · дошёл до шага " + d.step + " из 3"));
    card.appendChild(el("div", "in-title", d.title));
    card.appendChild(el("p", "in-excerpt", d.excerpt));
    var actions = el("div", "in-actions");
    var bCont = el("button", "btn primary sm", "Продолжить");
    bCont.type = "button";
    bCont.addEventListener("click", function () {
      wizardPrefill = { title: d.title, desc: d.excerpt, tags: d.tags.slice(), step: d.step };
      openWizard();
    });
    var bDel = el("button", "btn danger sm", "Убрать");
    bDel.type = "button";
    bDel.addEventListener("click", function () {
      askConfirm(
        "Убрать черновик «" + d.title + "»?",
        "Черновик будет удалён из памяти. Убрать?",
        "Убрать",
        function () {
          D.taskDrafts = D.taskDrafts.filter(function (x) { return x.id !== d.id; });
          renderInbox();
          toast("Черновик убран", "info");
        }
      );
    });
    actions.appendChild(bCont);
    actions.appendChild(bDel);
    card.appendChild(actions);
    return card;
  }

  var inboxRefresh = doc.getElementById("inbox-refresh");
  if (inboxRefresh) {
    inboxRefresh.addEventListener("click", function () {
      toast("Обновили: новых предложений нет — агенты докладываются в память", "info");
    });
  }

  /* ══ ARCHIVE (07g §5) ═════════════════════════════════════════════════ */
  var archWrap = doc.getElementById("archive-groups");

  function renderArchive() {
    archWrap.innerHTML = "";
    var q = (doc.getElementById("arch-q").value || "").trim().toLowerCase();
    var items = D.taskArchive.filter(function (a) {
      if (!q) return true;
      return (a.title + " " + a.summary).toLowerCase().indexOf(q) >= 0;
    });
    doc.getElementById("archive-empty").hidden = !!items.length;
    if (!items.length) return;
    var months = {};
    items.forEach(function (a) {
      if (!months[a.month]) months[a.month] = [];
      months[a.month].push(a);
    });
    Object.keys(months).forEach(function (m) {
      var grp = el("section", "arch-group");
      grp.setAttribute("aria-label", "Задачи за " + m);
      grp.appendChild(el("h3", null, m));
      months[m].forEach(function (a) {
        var row = el("div", "arch-row");
        var t = el("button", "ar-title", a.title);
        t.type = "button";
        t.setAttribute("aria-label", "Открыть архивную задачу «" + a.title + "»");
        t.addEventListener("click", function () { openArchiveDrawer(a, t); });
        row.appendChild(t);
        row.appendChild(el("span", "ar-meta", "архивирована из «" + a.from + "» · " + a.date + " · " + a.reports + " отч."));
        var b = el("button", "btn secondary sm", "Вернуть");
        b.type = "button";
        b.setAttribute("aria-label", "Вернуть «" + a.title + "» в канбан");
        b.addEventListener("click", function () {
          askConfirm(
            "Вернуть «" + a.title + "» в канбан?",
            "Вернём в исходное состояние («" + a.from.toLowerCase() + "»), как было до архивации.",
            "Вернуть",
            function () {
              D.taskArchive = D.taskArchive.filter(function (x) { return x.id !== a.id; });
              D.tasks.push({
                id: a.id, title: a.title, state: "open", project: a.project,
                conf: 0.7, tags: ["archive"], extraTags: 0, assignee: null, host: null,
                age: a.date, priority: "обычный", unreadReport: false,
                reportCount: a.reports, body: [a.summary], reports: [],
                history: [{ what: "вернули из архива", when: "только что", actor: "вы" }],
                execution: null,
              });
              renderArchive();
              renderBoard();
              toast("Вернули «" + a.title + "» в канбан («открыто»)", "success");
            }
          );
        });
        row.appendChild(b);
        grp.appendChild(row);
      });
      archWrap.appendChild(grp);
    });
  }
  doc.getElementById("arch-q").addEventListener("input", renderArchive);

  function openArchiveDrawer(a, opener) {
    var stub = {
      id: a.id, title: a.title, archived: true, project: a.project, tags: [],
      age: a.date, assignee: null, host: null, reportCount: a.reports,
      body: [a.summary], reports: [], history: [], execution: null, memory: [],
    };
    D.tasks.push(stub);
    openDrawer(a.id, "overview", opener);
    D.tasks = D.tasks.filter(function (x) { return x.id !== a.id; });
  }

  /* ══ TASK DRAWER (4 таба; 07g §6) ═════════════════════════════════════ */
  var drawerOv = doc.getElementById("drawer-ov");
  var drawer = doc.getElementById("task-drawer");

  function openDrawer(id, tab, opener) {
    var t = findTask(id);
    if (!t) { toast("Задача не найдена в демо-данных", "info"); return; }
    drawerTask = t;
    drawerTab = tab || "overview";
    drawerOpener = opener || null;
    renderDrawer();
    drawerOv.hidden = false;
    drawer.hidden = false;
    doc.getElementById("td-title").focus();
  }
  function closeDrawer() {
    drawer.hidden = true;
    drawerOv.hidden = true;
    if (drawerOpener && drawerOpener.focus) drawerOpener.focus();
    drawerOpener = null;
  }
  doc.getElementById("td-close").addEventListener("click", closeDrawer);
  drawerOv.addEventListener("click", closeDrawer);
  doc.addEventListener("keydown", function (e) {
    if (drawer.hidden) return;
    if (e.key === "Escape") { e.stopPropagation(); closeDrawer(); }
    if (e.key === "Tab") {
      var f = [].slice.call(drawer.querySelectorAll("button, a[href], input, select, textarea"));
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  function renderDrawer() {
    var t = drawerTask;
    var titleEl = doc.getElementById("td-title");
    titleEl.textContent = t.title;
    titleEl.title = t.id + " · возраст: " + t.age; /* T-id только в tooltip (07a §1.4) */
    var meta = doc.getElementById("td-meta");
    meta.innerHTML = "";
    var badge = el("span", "state-badge", stateName(t.state));
    badge.dataset.state = t.state;
    meta.appendChild(badge);
    meta.appendChild(el("span", null, t.assignee
      ? t.assignee + (t.host && t.host !== "—" ? " · " + t.host : "")
      : "без исполнителя"));
    meta.appendChild(el("span", "mono", t.age));

    var headActions = doc.getElementById("td-actions");
    headActions.innerHTML = "";
    if (t.archived) {
      headActions.appendChild(el("p", "in-source-note", "Архивная задача — только чтение. Вернуть из архива можно на странице Архива."));
    } else {
      var bA = el("button", "btn secondary sm", t.execution ? "Переназначить" : "Назначить исполнителя");
      bA.type = "button";
      bA.setAttribute("data-demo-action", "Шторка выбора исполнителя — в продуктовой версии; в стенде демо");
      var bE = el("button", "btn secondary sm", "Изменить");
      bE.type = "button";
      bE.setAttribute("data-demo-action", "Правка задачи попадёт в память — в продуктовой версии; в стенде демо");
      var bArc = el("button", "btn danger sm", "Архивировать");
      bArc.type = "button";
      bArc.addEventListener("click", function () {
        askConfirm(
          "Архивировать «" + t.title + "»?",
          "Задача уйдёт из канбана; история и отчёты сохранятся.",
          "Архивировать",
          function () {
            archiveTask(t, "сегодня");
            closeDrawer();
            renderAllViews();
            toast("Архивировали — история и отчёты сохранены", "success");
          }
        );
      });
      headActions.appendChild(bA);
      headActions.appendChild(bE);
      headActions.appendChild(bArc);
    }

    [].slice.call(doc.querySelectorAll(".dtab")).forEach(function (b) {
      if (b.dataset.tab === drawerTab) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
      if (b.dataset.tab === "reports") {
        var c = b.querySelector(".dt-count");
        if (c) c.textContent = String(t.reportCount || 0);
        var nd = b.querySelector(".dt-new");
        if (nd) nd.hidden = !t.unreadReport;
      }
    });

    var body = doc.getElementById("td-body");
    body.innerHTML = "";
    if (drawerTab === "overview") body.appendChild(tabOverview(t));
    else if (drawerTab === "reports") body.appendChild(tabReports(t));
    else if (drawerTab === "history") body.appendChild(tabHistory(t));
    else body.appendChild(tabExecution(t));
  }
  [].slice.call(doc.querySelectorAll(".dtab")).forEach(function (b) {
    b.addEventListener("click", function () {
      drawerTab = b.dataset.tab;
      renderDrawer();
      var first = doc.querySelector("#td-body h3");
      if (first) first.focus();
    });
  });

  function secLabel(text) {
    var d = el("div", "drawer-sec-label", text);
    d.tabIndex = -1;
    return d;
  }
  function tabOverview(t) {
    var w = el("div");
    var sc = el("div", "scroll-card");
    var body = el("div", "scroll-body");
    t.body.forEach(function (p) {
      var pEl = doc.createElement("p");
      pEl.textContent = p;
      body.appendChild(pEl);
    });
    sc.appendChild(body);
    w.appendChild(sc);
    var mem = el("div");
    mem.style.marginTop = "var(--space-4)";
    mem.appendChild(secLabel("Память задачи"));
    if (!t.memory || !t.memory.length) {
      mem.appendChild(el("p", "status-line", "Память о задаче ещё не разошлась — записи появятся, когда агенты начнут ссылаться"));
    } else {
      var chips = el("div", "memory-chips");
      t.memory.forEach(function (m) {
        var a = doc.createElement("a");
        a.className = "chip";
        a.href = "memories.html?id=" + encodeURIComponent(m);
        a.setAttribute("aria-label", "Открыть запись памяти " + m);
        a.textContent = m;
        chips.appendChild(a);
      });
      mem.appendChild(chips);
    }
    return w;
  }

  function tabReports(t) {
    var w = el("div");
    if (!t.reports || !t.reports.length) {
      var es = el("div", "empty-state");
      es.style.padding = "var(--space-6) var(--space-2)";
      es.appendChild(el("p", "es-title", "Отчётов пока нет"));
      es.appendChild(el("p", null, "Исполнитель отчитается после первого этапа — добровольно, по контракту докладов."));
      var b = el("button", "btn secondary sm", "Проверить исполнение");
      b.type = "button";
      b.addEventListener("click", function () {
        drawerTab = "execution";
        renderDrawer();
      });
      es.appendChild(b);
      w.appendChild(es);
      return w;
    }
    t.reports.forEach(function (r) {
      var row = el("div", "report-row" + (r.unread ? " unread" : ""));
      var head = el("button", "rr-head");
      head.type = "button";
      head.setAttribute("aria-expanded", "false");
      var dot = el("span", "rr-dot");
      dot.setAttribute("aria-hidden", "true");
      head.appendChild(dot);
      head.appendChild(el("span", "rr-who", r.who));
      head.appendChild(el("span", "rr-when", r.when));
      if (r.unread) head.appendChild(el("span", "rr-new", "новый"));
      head.appendChild(el("span", "rr-kind", r.kind));
      row.appendChild(head);
      var body = el("div", "report-scroll");
      body.hidden = true;
      var sc = el("div", "scroll-body");
      sc.style.fontSize = "var(--text-ui)";
      r.body.forEach(function (p) {
        var pEl = doc.createElement("p");
        pEl.textContent = p;
        sc.appendChild(pEl);
      });
      body.appendChild(sc);
      /* T-id — только в сносках отчёта (канон M-148) */
      body.appendChild(el("div", "report-footnote", "Сноски: " + r.refs));
      row.appendChild(body);
      head.addEventListener("click", function () {
        var wasOpen = !body.hidden;
        body.hidden = wasOpen;
        head.setAttribute("aria-expanded", wasOpen ? "false" : "true");
        if (!wasOpen && r.unread) {
          r.unread = false;
          drawerTask.unreadReport = t.reports.some(function (x) { return x.unread; });
          row.classList.remove("unread");
          var nn = row.querySelector(".rr-new");
          if (nn) nn.hidden = true;
          renderBoard();
        }
      });
      w.appendChild(row);
    });
    return w;
  }

  function tabHistory(t) {
    var w = el("div");
    if (!t.history || !t.history.length) {
      w.appendChild(el("p", "status-line", "Задача создана — история начнётся с первого перехода."));
      return w;
    }
    t.history.forEach(function (h) {
      var row = el("div", "history-row");
      row.appendChild(el("span", "hs-when", h.when));
      var main = el("span");
      main.appendChild(el("span", null, h.what + " · "));
      var who = el("span");
      who.style.color = "var(--color-text-primary)";
      who.textContent = h.actor;
      main.appendChild(who);
      row.appendChild(main);
      w.appendChild(row);
    });
    return w;
  }

  function tabExecution(t) {
    var w = el("div");
    w.className = "exec-block";
    if (!t.execution) {
      var es = el("div", "empty-state");
      es.style.padding = "var(--space-6) var(--space-2)";
      es.appendChild(el("p", null, "Исполнителя нет — задача ждёт в канбане."));
      var b = el("button", "btn primary sm", "Назначить исполнителя");
      b.type = "button";
      b.setAttribute("data-demo-action", "Шторка выбора исполнителя — в продуктовой версии; в стенде демо");
      es.appendChild(b);
      w.appendChild(es);
      return w;
    }
    var ex = t.execution;
    var pillCls = { running: "busy", queued: "queued", stagnant: "stagnant", failed: "ended", done: "ended" }[ex.state] || "queued";
    var pillText = { running: "идёт", queued: "в очереди", stagnant: "агент не берёт задачу", failed: "не вышло", done: "завершено" }[ex.state] || ex.state;
    var pillTitle = ex.state === "stagnant" ? "агент не может взять задачу — стоит проверить связь" : "";
    var line = el("div", "status-line");
    var pill = el("span", "pill " + pillCls);
    var dot = el("span", "dot");
    dot.setAttribute("aria-hidden", "true");
    pill.appendChild(dot);
    var pillTx = el("span", null, pillText);
    if (pillTitle) pillTx.title = pillTitle;
    pill.appendChild(pillTx);
    line.appendChild(pill);
    line.appendChild(el("span", null, ex.line));
    w.appendChild(line);
    var pulse = el("p", "status-line", ex.pulse);
    if (ex.state === "stagnant" || ex.state === "failed") pulse.style.color = "var(--color-warning)";
    w.appendChild(pulse);
    if (ex.report) w.appendChild(el("p", "status-line", ex.report));
    if (ex.state !== "done") {
      var acts = el("div", "danger-zone");
      var bUn = el("button", "btn secondary sm", "Снять");
      bUn.type = "button";
      bUn.addEventListener("click", function () {
        askConfirm(
          "Снять " + (t.assignee || "исполнителя") + " с задачи?",
          "Исполнителю уйдёт сигнал остановки — он завершит текущий шаг и вернёт задачу.",
          "Снять",
          function () {
            toast("Отмена отправлена — сигнал остановки уходит исполнителю", "info");
            t.execution = { state: "failed", line: "снято владельцем · исполнитель получил сигнал", pulse: "задача ждёт нового исполнителя" };
            renderDrawer();
            renderBoard();
          }
        );
      });
      var bRe = el("button", "btn ghost sm", "Переназначить");
      bRe.type = "button";
      bRe.setAttribute("data-demo-action", "Шторка переназначения с префиллом — в продуктовой версии");
      acts.appendChild(bUn);
      acts.appendChild(bRe);
      w.appendChild(acts);
    }
    return w;
  }

  /* ══ WIZARD «Дать задачу» (3 шага; 07g §7) ════════════════════════════ */
  var wiz = doc.getElementById("task-wizard");
  var wizState = { step: 1, max: 1, title: "", desc: "", tags: [], assignee: "queue" };

  function openWizard() {
    if (wizardPrefill) {
      wizState.title = wizardPrefill.title || "";
      wizState.desc = wizardPrefill.desc || "";
      wizState.tags = (wizardPrefill.tags || []).slice();
      wizState.step = wizardPrefill.step || 1;
      wizState.max = Math.max(1, wizState.step);
      doc.getElementById("wz-title").value = wizState.title;
      doc.getElementById("wz-desc").value = wizState.desc;
      renderTagPick();
      wizardPrefill = null;
    }
    wiz.hidden = false;
    renderWizSteps();
  }
  function closeWizard() {
    wiz.hidden = true;
    if (wizOpener && wizOpener.focus) wizOpener.focus();
    wizOpener = null;
  }
  var wizOpener = null;
  doc.getElementById("wz-close").addEventListener("click", closeWizard);
  wiz.addEventListener("click", function (e) {
    if (e.target === wiz) closeWizard();
  });
  doc.addEventListener("keydown", function (e) {
    if (wiz.hidden) return;
    if (e.key === "Escape") { e.stopPropagation(); closeWizard(); }
    if (e.key === "Tab") {
      var f = [].slice.call(wiz.querySelectorAll("button, a[href], input, select, textarea"));
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  [].slice.call(doc.querySelectorAll("[data-wizard-open]")).forEach(function (b) {
    b.addEventListener("click", function () {
      wizOpener = b;
      openWizard();
    });
  });

  var wizStepsEls = [].slice.call(doc.querySelectorAll("#task-wizard .wstep"));
  var wizPanels = [].slice.call(doc.querySelectorAll("#task-wizard .wpanel"));

  function renderWizSteps() {
    wizStepsEls.forEach(function (s) {
      var n = parseInt(s.dataset.step, 10);
      var wn = s.querySelector(".wnum");
      if (n < wizState.step) {
        s.classList.add("done");
        s.disabled = false;
        s.removeAttribute("aria-current");
        wn.textContent = "✓";
      } else if (n === wizState.step) {
        s.classList.remove("done");
        s.disabled = false;
        s.setAttribute("aria-current", "step");
        wn.textContent = String(n);
      } else {
        s.classList.remove("done");
        s.disabled = true;
        s.removeAttribute("aria-current");
        wn.textContent = String(n);
      }
    });
    wizPanels.forEach(function (p) {
      p.hidden = p.dataset.panel !== String(wizState.step);
    });
    doc.getElementById("wz-back").disabled = wizState.step === 1;
    doc.getElementById("wz-next").hidden = wizState.step === 3;
    doc.getElementById("wz-give").hidden = wizState.step !== 3;
    var h2 = doc.querySelector('#task-wizard .wpanel[data-panel="' + wizState.step + '"] h2');
    if (h2) h2.focus({ preventScroll: true });
  }
  wizStepsEls.forEach(function (s) {
    s.addEventListener("click", function () {
      var n = parseInt(s.dataset.step, 10);
      if (n <= wizState.max && n < wizState.step) {
        wizState.step = n;
        renderWizSteps();
      }
    });
  });

  /* шаг 1: чипы тегов по словарю; новый тег честно помечается «тег новый» */
  var tagPickEl = doc.getElementById("wz-tags");
  function renderTagPick() {
    tagPickEl.innerHTML = "";
    D.tagDictionary.forEach(function (tg) {
      var c = el("button", "chip", "#" + tg);
      c.type = "button";
      c.setAttribute("aria-pressed", wizState.tags.indexOf(tg) >= 0 ? "true" : "false");
      c.addEventListener("click", function () {
        var on = c.getAttribute("aria-pressed") === "true";
        c.setAttribute("aria-pressed", on ? "false" : "true");
        if (on) wizState.tags = wizState.tags.filter(function (x) { return x !== tg; });
        else wizState.tags.push(tg);
      });
      tagPickEl.appendChild(c);
    });
  }
  renderTagPick();
  function addCustomTag() {
    var inp = doc.getElementById("wz-tag-input");
    var v = inp.value.trim().toLowerCase().replace(/\s+/g, "-");
    if (!v) return;
    if (D.tagDictionary.indexOf(v) >= 0) {
      toast("Тег #" + v + " уже в словаре — выберите его чипом выше", "info");
      return;
    }
    if (wizState.tags.indexOf(v) < 0) wizState.tags.push(v);
    inp.value = "";
    var mark = el("button", "chip", "#" + v);
    mark.type = "button";
    mark.setAttribute("aria-pressed", "true");
    var m = el("span", "tag-new-mark", "тег новый");
    m.setAttribute("title", "Этого тега ещё не было в памяти");
    mark.appendChild(m);
    mark.addEventListener("click", function () {
      mark.remove();
      wizState.tags = wizState.tags.filter(function (x) { return x !== v; });
    });
    tagPickEl.appendChild(mark);
    toast("Тег «" + v + "» новый — попадёт в память как есть", "info");
  }
  doc.getElementById("wz-tag-add").addEventListener("click", addCustomTag);
  doc.getElementById("wz-tag-input").addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); addCustomTag(); }
  });

  /* live-валидация после blur (05 §2.5) */
  doc.getElementById("wz-title").addEventListener("blur", function () {
    var err = doc.getElementById("wz-title-err");
    if (!this.value.trim()) {
      this.setAttribute("aria-invalid", "true");
      err.hidden = false;
    } else {
      this.removeAttribute("aria-invalid");
      err.hidden = true;
    }
  });

  /* шаг 2: lifecycle-обещания карточек (07a §4) */
  [].slice.call(doc.querySelectorAll('input[name="wz-assignee"]')).forEach(function (r) {
    r.addEventListener("change", function () { wizState.assignee = r.value; });
  });

  function wizValidate() {
    if (!doc.getElementById("wz-title").value.trim()) {
      doc.getElementById("wz-title-err").hidden = false;
      doc.getElementById("wz-title").focus();
      return false;
    }
    return true;
  }
  doc.getElementById("wz-next").addEventListener("click", function () {
    if (!wizValidate()) return;
    wizState.title = doc.getElementById("wz-title").value.trim();
    wizState.desc = doc.getElementById("wz-desc").value.trim();
    wizState.step = Math.min(3, wizState.step + 1);
    wizState.max = Math.max(wizState.max, wizState.step);
    if (wizState.step === 3) renderSummary();
    renderWizSteps();
  });
  doc.getElementById("wz-back").addEventListener("click", function () {
    if (wizState.step > 1) {
      wizState.step -= 1;
      renderWizSteps();
    }
  });

  function renderSummary() {
    doc.getElementById("sum-what").textContent = wizState.title;
    doc.getElementById("sum-desc").textContent = wizState.desc || "—";
    doc.getElementById("sum-tags").textContent = wizState.tags.length
      ? wizState.tags.map(function (t) { return "#" + t; }).join(" ")
      : "—";
    doc.getElementById("sum-whom").textContent = summaryAssignee();
  }
  function summaryAssignee() {
    var v = wizState.assignee;
    if (v === "queue") return "в очередь без исполнителя — назначите позже";
    var h = D.hosts.filter(function (x) { return x.name === v; })[0];
    if (!h) return v;
    if (h.lifecycle === "online") return "агент на " + h.name + " — начнётся после ближайшего доклада (обычно до 2 минут)";
    if (h.lifecycle === "silent") return "агент на " + h.name + " — встанет в очередь, агент заберёт её при возвращении";
    if (h.lifecycle === "off") return h.name + " выключен владельцем — недоступен";
    if (h.lifecycle === "provisioning") return "агент на " + h.name + " ещё ставится — начнёт, когда выйдет на связь";
    return "агент на " + h.name;
  }

  function nextTaskId() {
    var max = 100;
    [].concat(D.tasks, D.taskArchive).forEach(function (t) {
      var m = /^T-(\d+)$/.exec(t.id);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return "T-" + (max + 1);
  }

  /* шаг 3 → исходы по канону 07b §5 */
  doc.getElementById("wz-give").addEventListener("click", function () {
    wizState.title = doc.getElementById("wz-title").value.trim();
    wizState.desc = doc.getElementById("wz-desc").value.trim();
    giveTask(false);
  });
  function giveTask(fail) {
    var btn = doc.getElementById("wz-give");
    btn.classList.add("loading");
    btn.textContent = "Даём задачу…";
    setTimeout(function () {
      btn.classList.remove("loading");
      btn.textContent = "Дать задачу";
      if (fail) { showGiveResult("fail", null); return; }
      var t = buildTaskFromWizard();
      D.tasks.push(t);
      showGiveResult("ok", t);
    }, 700);
  }
  function buildTaskFromWizard() {
    var v = wizState.assignee;
    var agent = null;
    var host = null;
    if (v !== "queue") {
      var h = D.hosts.filter(function (x) { return x.name === v; })[0];
      host = v;
      if (h && h.lifecycle === "online") agent = "агент agb";
      else if (h && h.lifecycle !== "provisioning") agent = "агент core";
    }
    return {
      id: nextTaskId(),
      title: wizState.title,
      state: "open",
      project: "mnemos-eyes",
      conf: null,
      tags: wizState.tags.slice(0, 3),
      extraTags: Math.max(0, wizState.tags.length - 3),
      assignee: agent,
      host: agent ? host : null,
      age: "только что",
      priority: "обычный",
      unreadReport: false,
      reportCount: 0,
      body: [wizState.desc || wizState.title],
      reports: [],
      history: [{ what: "создано владельцем", when: "только что", actor: "вы" }],
      execution: agent
        ? { state: "queued", line: "в очереди · " + agent + " · " + host, pulse: "начнётся после ближайшего доклада — обычно до 2 минут" }
        : null,
    };
  }
  function showGiveResult(kind, t) {
    var res = doc.getElementById("wz-result");
    res.hidden = false;
    doc.getElementById("wz-demo-row").hidden = false;
    if (kind === "ok") {
      var execLine = t.execution
        ? "Задача у " + t.assignee + ". Видна в канбане и в очереди исполнителя."
        : "Задача ждёт в канбане — исполнителя назначите позже.";
      res.innerHTML =
        '<div class="result-card ok" role="status">' +
        '<div class="rc-title"><span aria-hidden="true">●</span> Задача принята</div>' +
        "<p style='margin:0'>«" + esc(t.title) + "». " + esc(execLine) + "</p>" +
        '<div style="display:flex; gap: var(--space-2); flex-wrap: wrap; margin-top: var(--space-2)">' +
        '<button class="btn primary sm" type="button" data-wz-open="' + t.id + '">Открыть задачу</button>' +
        '<button class="btn secondary sm" type="button" data-wz-again>Ещё одну</button>' +
        '<button class="btn secondary sm" type="button" data-wz-board>К канбану</button>' +
        "</div></div>";
      toast("Задача «" + t.title + "» — в канбане", "success");
      renderBoard();
      renderListIfVisible();
    } else {
      res.innerHTML =
        '<div class="result-card fail" role="alert">' +
        '<div class="rc-title"><span aria-hidden="true">●</span> Дать задачу не удалось</div>' +
        '<ul><li>нет связи с исполнителем — проверьте хост на «Хостах»</li>' +
        "<li>сервер ответил ошибкой — повторите</li></ul>" +
        '<div style="display:flex; gap: var(--space-2); flex-wrap: wrap; margin-top: var(--space-2)">' +
        '<button class="btn secondary sm" type="button" data-wz-retry>Повторить</button>' +
        '<button class="btn secondary sm" type="button" data-wz-draft>Сохранить черновиком</button>' +
        "</div></div>";
    }
  }
  doc.getElementById("wz-result").addEventListener("click", function (e) {
    var open = e.target.closest("[data-wz-open]");
    if (open) {
      closeWizard();
      setView("board");
      openDrawer(open.dataset.wzOpen, "overview", null);
      return;
    }
    if (e.target.closest("[data-wz-again]")) {
      wizState = { step: 1, max: 1, title: "", desc: "", tags: [], assignee: "queue" };
      doc.getElementById("wz-title").value = "";
      doc.getElementById("wz-desc").value = "";
      doc.getElementById("wz-result").hidden = true;
      renderTagPick();
      renderWizSteps();
      return;
    }
    if (e.target.closest("[data-wz-board]")) {
      closeWizard();
      setView("board");
      return;
    }
    if (e.target.closest("[data-wz-retry]")) {
      doc.getElementById("wz-result").hidden = true;
      return;
    }
    if (e.target.closest("[data-wz-draft]")) {
      saveWizardDraft();
      doc.getElementById("wz-result").hidden = true;
    }
  });
  [].slice.call(doc.querySelectorAll("[data-wz-demo]")).forEach(function (b) {
    b.addEventListener("click", function () {
      giveTask(b.dataset.wzDemo === "fail");
    });
  });
  function saveWizardDraft() {
    var title = doc.getElementById("wz-title").value.trim();
    if (!title) {
      doc.getElementById("wz-title-err").hidden = false;
      return;
    }
    D.taskDrafts.push({
      id: "DR-" + (D.taskDrafts.length + 2),
      title: title,
      excerpt: doc.getElementById("wz-desc").value.trim() || "Черновик без описания",
      tags: wizState.tags.slice(0, 3),
      step: 2,
    });
    closeWizard();
    toast("Сохранили черновик — он во Входящих с пометкой «вы · черновик»", "success");
    setView("inbox");
  }
  var draftBtn = doc.getElementById("wz-draft-btn");
  if (draftBtn) {
    draftBtn.addEventListener("click", function () {
      wizState.title = doc.getElementById("wz-title").value.trim();
      wizState.desc = doc.getElementById("wz-desc").value.trim();
      if (!wizState.title) {
        doc.getElementById("wz-title-err").hidden = false;
        doc.getElementById("wz-title").focus();
        return;
      }
      saveWizardDraft();
    });
  }

  function renderAll() {
    if (curView === "board") renderBoard();
    else if (curView === "list") renderList();
    else if (curView === "inbox") renderInbox();
    else renderArchive();
  }

  /* ── хоткеи домена (07g §9): j/k/x/Enter; Ctrl+K и Esc владеет shell.js ── */
  function inInput(e) {
    var t = e.target;
    return t && t.closest && t.closest('input, textarea, select, [contenteditable="true"]');
  }
  doc.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) || e.key === "Escape" || e.key === "Tab") return;
    if (inInput(e)) return;
    if (!drawer.hidden || !wiz.hidden || !moveMenu.hidden || !confirmOv.hidden) return;
    if (curView !== "list") return;
    if (e.key === "j" || e.key === "k") {
      e.preventDefault();
      var rows = [].slice.call(listBody.querySelectorAll("tr"));
      if (!rows.length) return;
      var active = rows.indexOf(doc.activeElement);
      var next = active < 0 ? 0 : Math.min(rows.length - 1, Math.max(0, active + (e.key === "j" ? 1 : -1)));
      rows.forEach(function (r) { r.tabIndex = -1; });
      rows[next].tabIndex = 0;
      rows[next].focus();
    }
  });

  /* ── deep-links: ?view= · ?task=T-…&tab=reports · ?wizard=1 ──────────── */
  var params = new URLSearchParams(window.location.search);
  var v0 = params.get("view");
  if (v0 && viewSections[v0]) setView(v0, false);
  else { renderBoard(); }
  /* палитра на самой странице Задач: «Дать задачу» открывает мастер локально */
  doc.addEventListener("stand:give-task", function () {
    wizOpener = doc.querySelector(".page-actions [data-wizard-open]");
    openWizard();
  });
  var tOpen = params.get("task");
  if (tOpen) {
    setTimeout(function () {
      if (findTask(tOpen)) openDrawer(tOpen, params.get("tab") === "reports" ? "reports" : "overview", null);
      else toast("Задача " + tOpen + " не найдена в демо-данных", "info");
    }, 150);
  }
  if (params.get("wizard") === "1") setTimeout(openWizard, 150);
  var bq = doc.getElementById("board-q");
  if (bq) {
    bq.addEventListener("input", function () {
      filters.q = this.value.trim();
      renderBoard();
    });
  }
})();