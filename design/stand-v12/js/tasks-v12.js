/* tasks-v12.js — Задачи «Живой пульт» (спека 15 §3.4 + §13.8).
 *
 * Доска живёт шиной: шапки колонок = счётчик + темп N/ч (производная
 * task.done за 60 минут, честное 0/ч); спектакль task.done в три такта
 * (вспышка 240/600 → мгновенный DOM-перенос + FLIP 400ms → курьер Ж2 от
 * события — сам living.js); ▸N инкрементится по событию сразу.
 * Drag в стенде нет (борд заморожен по лору M-189) — «во время drag
 * хореография не стартует» (§13.8.2) выполняется тривиально.
 */
(function () {
  "use strict";
  var doc = document;
  if (!doc.body.hasAttribute("data-screen") || doc.body.getAttribute("data-screen") !== "tasks") return;

  var STATE_RU = {
    open: "Открыто", "in-progress": "В работе", blocked: "Блокировано", resolved: "Решено",
  };
  var OWNER_WAIT_IDS = { "T-121": 1 }; /* фикстура: ждёт решения (feedSeed) */
  var board, columns = {}, doneTimes = [];

  function el(tag, cls, text) {
    var n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function colEl(state) { return columns[state]; }

  function cardNode(t) {
    var card = el("article", "task-card");
    card.dataset.id = t.id;
    card.tabIndex = 0;
    if (t.state === "blocked") {
      card.setAttribute("data-blocked", "");
      card.title = "Блокировано: " + (t.blockedNote || "причина неизвестна"); /* §13.8.5: причина в title */
      card.setAttribute("aria-label", t.id + " " + t.title + ". Блокировано: " + (t.blockedNote || ""));
    }
    if (OWNER_WAIT_IDS[t.id]) card.setAttribute("data-owner-wait", "");
    card.appendChild(el("span", "card-id", t.id + (t.state === "blocked" ? " ⟂" : "")));
    card.appendChild(el("span", "card-title", t.title));
    var meta = el("div", "card-meta");
    meta.appendChild(el("span", "card-agent", t.assignee || "без исполнителя"));
    if (t.host) meta.appendChild(el("span", null, t.host));
    if (t.age) meta.appendChild(el("span", null, t.age));
    card.appendChild(meta);
    if (t.state === "blocked" && t.blockedNote) {
      card.appendChild(el("span", "card-blocked-note", "⟂ " + t.blockedNote));
    }
    return card;
  }

  function emptyNode(state) {
    var box = el("div", "col-empty");
    box.dataset.emptyFor = state;
    box.appendChild(el("span", null, "Пусто — агентам есть что взять"));
    var cta = el("button", "btn secondary sm", "Дать задачу");
    cta.type = "button";
    cta.addEventListener("click", giveTask);
    box.appendChild(cta);
    return box;
  }

  function syncCounts() {
    Object.keys(columns).forEach(function (st) {
      var col = columns[st];
      var cards = col.querySelectorAll(".task-card:not(.is-leaving)").length;
      var count = col.querySelector(".col-count");
      if (count) count.textContent = String(cards);
      var emptyBox = col.querySelector(".col-empty");
      if (!emptyBox) { emptyBox = emptyNode(st); col.appendChild(emptyBox); }
      emptyBox.hidden = cards > 0;
    });
    /* мини-статистика «готово» (архив) — в шапке РЕШЕНО (§13.8.6) */
    var D = window.STAND || {};
    var doneN = (D.taskArchive || D.tasks || []).filter(function (t) { return t.state === "done"; }).length;
    var mini = board.querySelector('[data-mini="done"]');
    if (mini) mini.textContent = "готово " + (doneN + resolvedByBus()) + " ↗";
  }
  function resolvedByBus() {
    return doneTimes.length ? doneTimes.length : 0;
  }

  /* темп: task.done за последние 60 минут (§13.8.1), честное 0/ч */
  function syncRate() {
    var now = Date.now();
    doneTimes = doneTimes.filter(function (t) { return now - t < 3600000; });
    var rate = board.querySelector(".col-rate");
    if (rate) {
      rate.textContent = doneTimes.length + "/ч";
      rate.title = "решений за последний час";
    }
  }

  function buildBoard(D) {
    board = doc.getElementById("board");
    if (!board) return;
    board.innerHTML = "";
    ["open", "in-progress", "blocked", "resolved"].forEach(function (st) {
      var col = el("section", "col");
      col.dataset.state = st;
      var head = el("div", "col-head");
      head.appendChild(el("span", "col-name", STATE_RU[st]));
      head.appendChild(el("span", "col-count", "0"));
      if (st === "resolved") {
        head.appendChild(el("span", "col-rate", "0/ч"));
        var mini = el("button", "col-mini", "готово 1 ↗");
        mini.type = "button";
        mini.dataset.mini = "done";
        mini.setAttribute("aria-label", "Мини-статистика: готово за сегодня — открыть архив");
        mini.addEventListener("click", function () {
          var arch = doc.getElementById("archive-panel");
          if (arch) arch.scrollIntoView({ block: "nearest" });
        });
        head.appendChild(mini);
      }
      col.appendChild(head);
      columns[st] = col;
      board.appendChild(col);
    });
    (D.tasks || []).forEach(function (t) {
      var col = colEl(t.state);
      if (col) col.appendChild(cardNode(t));
    });
    syncCounts();
    syncRate();
  }

  /* «Дать задачу»: новый каркас в «Открыто» + событие шины */
  var giveSeq = 104;
  function giveTask() {
    var col = colEl("open");
    if (col) {
      giveSeq += 1;
      col.insertBefore(cardNode({
        id: "T-" + giveSeq, title: "Утренний прогон задач", state: "open",
        assignee: null, host: "laptop-go-1", age: "только что",
      }), col.querySelector(".col-empty"));
      syncCounts();
    }
    doc.dispatchEvent(new CustomEvent("stand:feed-event", {
      detail: { ev: "task.start", mem: null, text: "владелец дал задачу «Утренний прогон задач»", who: "owner", srv: "stand-v12", at: Date.now() },
    }));
  }
  doc.querySelectorAll("[data-give-task]").forEach(function (b) {
    b.addEventListener("click", giveTask);
  });

  /* ── Фасад «Ждут владельца»: aria-pressed-фильтр (§13.8.4) ─────────── */
  var facade = doc.getElementById("facade-wait");
  if (facade) {
    var D0 = window.STAND || {};
    var n = (D0.counters && D0.counters.waiting) || 0;
    facade.setAttribute("aria-pressed", "false");
    facade.querySelector(".wait-count").textContent = String(n);
    function syncFacade() {
      var on = facade.getAttribute("aria-pressed") === "true";
      facade.querySelector(".wait-mode").textContent = on ? "· скрыть" : "· показать";
      if (board) {
        if (on) board.setAttribute("data-owner-wait", "");
        else board.removeAttribute("data-owner-wait");
      }
    }
    facade.addEventListener("click", function () {
      facade.setAttribute("aria-pressed", facade.getAttribute("aria-pressed") === "true" ? "false" : "true");
      syncFacade();
    });
    syncFacade();
  }

  /* ── Спектакль task.done: три такта (§13.8.2) ─────────────────────── */
  function reduced() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      doc.documentElement.getAttribute("data-motion") === "reduced";
  }
  function incrementExecBadge() {
    /* §13.8.3: данные — сразу по событию; свечение — по прибытию курьера.
     * living.js не экспортирует хук прибытия (execBadgeGlow приватен и
     * зовётся только для owner.wait) — допустимо синхронно с событием
     * (аппроксимация §13.8.3, в отчёт среза). */
    var badge = doc.querySelector("[data-exec-count]");
    if (!badge) return;
    var dot = badge.querySelector(".badge-dot");
    var v = (parseInt(dot && dot.textContent, 10) || 0) + 1;
    if (dot) dot.textContent = String(v);
    badge.classList.add("attention-hold");
    setTimeout(function () { badge.classList.remove("attention-hold"); }, 2400);
  }
  function playDoneSpectacle() {
    var victim = board && (board.querySelector('.col[data-state="in-progress"] .task-card') ||
                           board.querySelector('.col[data-state="open"] .task-card:not([data-blocked])'));
    var target = colEl("resolved");
    if (!victim || !target) return;
    doneTimes.push(Date.now());
    syncRate();
    incrementExecBadge();
    var restoreFocus = victim.contains(doc.activeElement);

    if (reduced()) {
      /* reduced: мгновенная перестановка + статичный золотой тинт 1.5s */
      target.insertBefore(victim, target.querySelector(".col-empty"));
      victim.classList.add("is-done-tint");
      victim.addEventListener("animationend", function () { victim.classList.remove("is-done-tint"); }, { once: true });
      syncCounts();
      if (restoreFocus) victim.focus();
      return;
    }
    /* такт 1: вспышка 240ms + hold 600ms */
    victim.classList.add("is-done-flash");
    setTimeout(function () {
      /* такт 2: мгновенный DOM-перенос + FLIP-transform 400ms */
      var first = victim.getBoundingClientRect();
      target.insertBefore(victim, target.querySelector(".col-empty"));
      var last = victim.getBoundingClientRect();
      var dx = first.left - last.left, dy = first.top - last.top;
      victim.classList.remove("is-done-flash");
      victim.classList.add("is-flipping");
      victim.style.transform = "translate(" + dx + "px," + dy + "px)";
      requestAnimationFrame(function () {
        victim.style.transform = "";
        victim.addEventListener("transitionend", function () {
          victim.classList.remove("is-flipping");
        }, { once: true });
      });
      syncCounts();
      if (restoreFocus) victim.focus();
    }, 840); /* 240ms + 600ms hold */
    /* такт 3: курьер от колонки к Ж2 вверх к Нейре — living.js (словарь v11) */
  }

  doc.addEventListener("stand:feed-event", function (e) {
    var ev = (e.detail || {}).ev;
    if (ev === "task.done") playDoneSpectacle();
  });

  function init() {
    buildBoard(window.STAND || {});
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init);
  else init();
})();
