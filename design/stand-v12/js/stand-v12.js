/* stand-v12.js — машинерия стенда «ВАУ v12» (ME-061, скаффолд).
 *
 * Что здесь есть (и что остаётся при смене арт-наполнения):
 *   - тема (data-theme, localStorage vesmaro.theme);
 *   - режимы живого слоя (vesmaro.livingLayer + событие stand:living-change,
 *     тот же контракт, что у living.js из stand-v11-base);
 *   - демо-хуки шины: кнопки [data-ev] публикуют события в ЕДИНСТВЕННЫЙ
 *     источник — document-событие stand:feed-event (08 §3.1); второй
 *     источник не создаётся;
 *   - лента шины (role=log) — видимое подтверждение ответа живого слоя;
 *   - авто-дуга трейлера (body[data-wow-feed]): 5-секундный сценарий
 *     task.start → write → task.done → owner.wait → owner.clear.
 *
 * Чего здесь НЕТ: таймеров «оживления» вне шины, прямых обращений к
 * canvas Нейры, второй шины. living.js подключается как есть (js/living.js).
 */
(function () {
  "use strict";
  var doc = document;
  var root = doc.documentElement;

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
