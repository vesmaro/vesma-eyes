/* stand-v12.js — машинерия стенда «ВАУ v12» (ME-061, спека 15 §8).
 *
 * Что здесь есть (и что остаётся при смене арт-наполнения):
 *   - ДЕФОЛТ living «Полный» для КОНЦЕПТ-СТЕНДА (§4): бутстрап ДО парса
 *     living.js выставляет вкладочный оверрайд, только если пользователь
 *     ничего не выбрал. Прод-дефолт living.js — «Спокойный» — НЕ тронут:
 *     supersede дефолта гейтится вердиктом владельца (12 §1 п.6).
 *   - тема (data-theme, localStorage vesmaro.theme);
 *   - режимы живого слоя (vesmaro.livingLayer + stand:living-change);
 *   - демо-хуки шины [data-ev] → stand:feed-event (единственный источник,
 *     08 §3.1; второй источник не создаётся);
 *   - лента шины #feed-log (полигон) и тикер героя [data-ticker] (§3.1):
 *     fade-swap 240ms, пауза живого слоя останавливает и его;
 *   - герой Обзора: HUD-цифры из STAND, чип «Ждут владельца» (empty —
 *     не рендерится), share-кнопка, «Пробуждение» раз/сессию (§3.1:
 *     sessionStorage vesmaro.awakened; первый импульс ~1.4s — реальное
 *     событие в ту же шину);
 *   - авто-дуга трейлера (body[data-wow-feed]).
 *
 * Чего здесь НЕТ: таймеров «оживления» вне шины, прямых обращений к
 * canvas Нейры/колодца, второй шины. living.js/synapse.js — js/ как есть
 * (кроме санкционированной правки плотности в synapse.js).
 */
(function () {
  "use strict";
  var doc = document;
  var root = doc.documentElement;

  /* ── Дефолт «Полный» для концепт-стенда (спека 15 §4) ────────────────
   * Вкладочный оверрайд living.js ставится ДО его парса (порядок
   * подключения: stand-v12.js → data.js → living.js → synapse.js).
   * Условие: пользователь ничего не выбрал сам (нет localStorage-режима,
   * нет ?living=). Прод-логика не затронута: default living.js = "calm". */
  try {
    var qpLiving = new URLSearchParams(window.location.search).get("living");
    var chosen = localStorage.getItem("vesmaro.livingLayer");
    if (!qpLiving && !chosen && !sessionStorage.getItem("stand-living-override")) {
      sessionStorage.setItem("stand-living-override", "full");
    }
  } catch (e) {}

  var EVENT_LABELS = {
    recall: "обращение к памяти",
    write: "запись в память",
    index: "переиндексация",
    error: "ошибка связи",
    "task.start": "задача началась",
    "task.done": "задача завершена",
    "owner.wait": "ждут вашего решения",
    "owner.clear": "вы ответили — ждущих нет",
  };

  function emit(ev, text) {
    doc.dispatchEvent(new CustomEvent("stand:feed-event", {
      detail: {
        ev: ev, mem: null,
        text: text || "стенд v12: " + (EVENT_LABELS[ev] || ev),
        who: "demo", srv: "stand-v12", at: Date.now(),
      },
    }));
  }
  window.StandV12 = { emit: emit }; /* витринный минимум для консоли/тестов */

  /* ── Тема ──────────────────────────────────────────────────────────── */
  var THEME_KEY = "vesmaro.theme";
  try {
    if (sessionStorage.getItem("stand-theme-override") === "light" ||
        (!sessionStorage.getItem("stand-theme-override") &&
         localStorage.getItem(THEME_KEY) === "light")) {
      root.setAttribute("data-theme", "light");
    }
  } catch (e) {}
  doc.querySelectorAll("[data-theme-toggle]").forEach(function (b) {
    var light = root.getAttribute("data-theme") === "light";
    b.setAttribute("aria-pressed", light ? "true" : "false");
    b.setAttribute("aria-label", "Сменить тему: сейчас " + (light ? "светлая" : "тёмная"));
    b.addEventListener("click", function () {
      var now = root.getAttribute("data-theme") === "light" ? "dark" : "light";
      if (now === "dark") root.removeAttribute("data-theme");
      else root.setAttribute("data-theme", "light");
      try { localStorage.setItem(THEME_KEY, now); } catch (e) {}
      b.setAttribute("aria-pressed", now === "light" ? "true" : "false");
      b.setAttribute("aria-label", "Сменить тему: сейчас " + (now === "light" ? "светлая" : "тёмная"));
    });
  });

  /* ── Режимы живого слоя (ключ и событие — контракт living.js v11) ──── */
  var LIVING_KEY = "vesmaro.livingLayer";
  function livingNow() {
    try {
      var v = sessionStorage.getItem("stand-living-override") ||
              localStorage.getItem(LIVING_KEY) || "calm";
      return ["full", "calm", "off"].indexOf(v) === -1 ? "calm" : v;
    } catch (e) { return "calm"; }
  }
  function syncLivingButtons() {
    var cur = livingNow();
    doc.querySelectorAll("[data-living-mode]").forEach(function (b) {
      b.setAttribute("aria-pressed", b.getAttribute("data-living-mode") === cur ? "true" : "false");
    });
  }
  doc.querySelectorAll("[data-living-mode]").forEach(function (b) {
    b.addEventListener("click", function () {
      var m = b.getAttribute("data-living-mode");
      try {
        sessionStorage.removeItem("stand-living-override");
        localStorage.setItem(LIVING_KEY, m);
      } catch (e) {}
      window.dispatchEvent(new Event("stand:living-change"));
      syncLivingButtons();
    });
  });
  window.addEventListener("stand:living-change", syncLivingButtons);
  syncLivingButtons();

  /* ── Демо-хуки: кнопки событий шины ────────────────────────────────── */
  doc.querySelectorAll(".demo-btn[data-ev]").forEach(function (b) {
    b.addEventListener("click", function () {
      var ev = b.getAttribute("data-ev");
      emit(ev, "демо-хук: " + ev);
      if (ev === "error") {
        /* карточка В3 открывается после 2 ошибок ПОДРЯД (v11, 08 §5.3) —
         * зеркалим поведение витрины living-demo.js */
        setTimeout(function () { emit("error", "демо-хук: error (повтор)"); }, 300);
      }
    });
  });

  /* ── Лента шины: видимый ответ живого слоя ─────────────────────────── */
  var log = doc.getElementById("feed-log");
  if (log) {
    doc.addEventListener("stand:feed-event", function (e) {
      var d = e.detail || {};
      var row = doc.createElement("div");
      row.className = "feed-row";
      row.setAttribute("data-ev", d.ev || "");
      var t = new Date(d.at || Date.now());
      var hhmmss = [("0" + t.getHours()).slice(-2), ("0" + t.getMinutes()).slice(-2), ("0" + t.getSeconds()).slice(-2)].join(":");
      var time = doc.createElement("time");
      time.dateTime = t.toISOString();
      time.textContent = hhmmss;
      var ev = doc.createElement("span");
      ev.className = "feed-ev";
      ev.textContent = d.ev || "?";
      var tx = doc.createElement("span");
      tx.textContent = d.text || EVENT_LABELS[d.ev] || "";
      row.appendChild(time); row.appendChild(ev); row.appendChild(tx);
      var empty = log.querySelector(".feed-empty");
      if (empty) empty.remove();
      log.insertBefore(row, log.firstChild);
      while (log.children.length > 12) log.removeChild(log.lastChild);
    });
  }

  /* ── Герой Обзора «Световой колодец» (спека 15 §3.1) ─────────────────
   * Скрипты подключаются в порядке: stand-v12 → data → living → synapse;
   * STAND-зависимая инициализация — на DOMContentLoaded (data.js уже
   * выполнен), слушатели шины вешаются сразу. */
  var ticker = doc.querySelector("[data-ticker]");
  var hero = doc.querySelector(".well-hero");

  function onHeroReady() {
    var STAND = window.STAND;
    if (!doc.body.hasAttribute("data-screen") ||
        doc.body.getAttribute("data-screen") !== "overview" || !STAND) return;

    var c = STAND.counters || {};
    var t = doc.querySelector("[data-hud-total]");
    if (t && c.total) t.textContent = c.total;
    var ph = doc.getElementById("pulses-hour");
    if (ph && c.pulsesHour != null) ph.textContent = String(c.pulsesHour);
    var vt = doc.querySelector("[data-vital-tags]");
    if (vt && c.tags != null) vt.textContent = String(c.tags);
    var va = doc.querySelector("[data-vital-agents]");
    if (va && STAND.agents) va.textContent = String(STAND.agents.length);
    var vh = doc.querySelector("[data-vital-hosts]");
    if (vh && STAND.hosts) vh.textContent = String(STAND.hosts.length);

    /* Чип «Ждут владельца»: empty — НЕ рендерится (тишина, 15 §3.1) */
    var chip = doc.querySelector(".hud-wait-chip");
    var waiting = STAND.waiting || [];
    if (chip) {
      if (!waiting.length || !(c.waiting > 0)) {
        chip.remove();
      } else {
        var wc = chip.querySelector(".wait-count");
        var wt = chip.querySelector(".wait-title");
        if (wc) wc.textContent = String(c.waiting);
        if (wt) wt.textContent = waiting[0].title;
      }
    }

    /* тикер: стартовая строка — последнее событие ленты */
    if (ticker && STAND.feedSeed && STAND.feedSeed.length && !ticker.getAttribute("data-ev")) {
      tickerSet(STAND.feedSeed[0]);
    }
    awakenStart(STAND);
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", onHeroReady);
  else onHeroReady();

  /* Тикер: одна строка, события шины (НЕ marquee). §13.3: тикер = данные —
   * строка обновляется ВО ВСЕХ режимах живого слоя (включая «Выключен»);
   * гасится только ДВИЖЕНИЕ: fade-swap 240ms живёт лишь в «Полном» и
   * вне паузы Нейры (aria-pressed кнопки — живой атрибут living.js,
   * клик-перехват удалён по вердикту). */
  function tickerSet(d) {
    if (!ticker) return;
    var tm = ticker.querySelector(".ticker-time");
    var ev = ticker.querySelector(".ticker-ev");
    var tx = ticker.querySelector(".ticker-text");
    var dd = new Date(d.at || Date.now());
    if (tm) tm.textContent = [("0" + dd.getHours()).slice(-2), ("0" + dd.getMinutes()).slice(-2)].join(":");
    if (ev) ev.textContent = EVENT_LABELS[d.ev] || d.ev;
    if (tx) tx.textContent = d.text || "";
    ticker.setAttribute("data-ev", d.ev || "");
  }
  function fadeAllowed() {
    if (root.getAttribute("data-living") !== "full") return false;
    var neura = doc.querySelector(".living-neura");
    return !(neura && neura.getAttribute("aria-pressed") === "true");
  }
  if (ticker) {
    doc.addEventListener("stand:feed-event", function (e) {
      var d = e.detail || {};
      if (!fadeAllowed()) { tickerSet(d); return; } /* мгновенная подстановка */
      ticker.classList.add("is-swapping");
      setTimeout(function () {
        tickerSet(d);
        ticker.classList.remove("is-swapping");
      }, 120);
    });
  }

  /* «Поделиться»: честная кнопка — копирует адрес страницы */
  doc.querySelectorAll("[data-share]").forEach(function (b) {
    b.addEventListener("click", function () {
      var was = b.textContent;
      function say(msg) { b.textContent = msg; setTimeout(function () { b.textContent = was; }, 1800); }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(window.location.href).then(
          function () { say("Ссылка скопирована"); },
          function () { say("Скопируйте из адресной строки"); }
        );
      } else say("Скопируйте из адресной строки");
    });
  });

  /* Пробуждение (§3.1): раз за сессию; veil 1200ms + каскад HUD ≤8;
   * ~1.4s — первый импульс: РЕАЛЬНОЕ событие в ту же шину (не второй
   * источник); данные — фикстура data.js (agb · «Схема провенанса») */
  function systemReduced() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      root.getAttribute("data-motion") === "reduced";
  }
  var AWAKEN_KEY = "vesmaro.awakened";
  function awakenStart(STAND) {
    if (!hero) return;
    var awakened = false;
    var quiet = false;
    try {
      awakened = sessionStorage.getItem(AWAKEN_KEY) === "1";
      quiet = new URLSearchParams(window.location.search).get("static") === "1";
    } catch (e) {}
    if (awakened || quiet || systemReduced()) return;
    /* ФЛАГ не пишем: окно волны закрывает и флагует движок (synapse.js
     * §13.1 p.4); здесь — только HUD-каскад и один импульс. */
    hero.setAttribute("data-awaken", "");
    setTimeout(function () {
      var seed = (STAND && STAND.wellNodes && STAND.wellNodes[9]) || { id: null, title: "Схему провенанса" };
      /* Ровно одно событие (§13.2), единый издательский уровень стенда
       * (тот же хук, что демо-кнопки). Прод: событие приходит из реальной
       * шины — издатель удалить. */
      doc.dispatchEvent(new CustomEvent("stand:feed-event", {
        detail: { ev: "write", mem: seed.id, text: "агент agb записал «" + seed.title + "»", who: "agb", srv: "mnemos-01", at: Date.now() },
      }));
    }, 1400);
    setTimeout(function () { hero.removeAttribute("data-awaken"); }, 1600);
  }

  /* ── Трейлер: авто-дуга «продукт живой» (5 секунд) ─────────────────── */
  if (doc.body.hasAttribute("data-wow-feed")) {
    var quiet = false;
    try { quiet = new URLSearchParams(window.location.search).get("static") === "1"; } catch (e) {}
    if (!quiet) {
      [ [900, "task.start"], [2300, "write"], [3600, "task.done"],
        [4900, "owner.wait"], [6600, "owner.clear"],
      ].forEach(function (step) {
        setTimeout(function () { emit(step[1], "трейлер: " + EVENT_LABELS[step[1]]); }, step[0]);
      });
    }
  }
})();
