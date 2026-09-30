/* settings-v12.js — Настройки «Личность коры» (спека 15 §3.5 + §13.9).
 *
 * Радио «Внешнего вида» («Живой слой» — первой строкой) меняют атрибуты
 * корня: data-living/data-theme/data-density — один источник состояния,
 * продукт и лупа синхронны. Нейра в лупе — статичная SVG-морфология
 * текущего состояния + CSS-glow вздох (transform-free), подпись «превью»:
 * living.js не поддерживает второй canvas — выбор FE по §13.9.2.
 */
(function () {
  "use strict";
  var doc = document;
  var root = doc.documentElement;
  if (!doc.body.hasAttribute("data-screen") || doc.body.getAttribute("data-screen") !== "settings") return;
  var S = window.StandV12;

  /* ── Радио «Живой слой» (первая строка) ────────────────────────────── */
  function livingNow() {
    try {
      var v = sessionStorage.getItem("stand-living-override") ||
              localStorage.getItem("vesmaro.livingLayer") || "full";
      return ["full", "calm", "off"].indexOf(v) === -1 ? "calm" : v;
    } catch (e) { return "calm"; }
  }
  function syncLivingRadios() {
    var cur = livingNow();
    doc.querySelectorAll("[data-living-radio]").forEach(function (r) {
      r.checked = r.value === cur;
    });
  }
  doc.querySelectorAll("[data-living-radio]").forEach(function (r) {
    r.addEventListener("change", function () {
      try {
        sessionStorage.removeItem("stand-living-override");
        localStorage.setItem("vesmaro.livingLayer", r.value);
      } catch (e) {}
      window.dispatchEvent(new Event("stand:living-change"));
    });
  });
  window.addEventListener("stand:living-change", syncLivingRadios);
  syncLivingRadios();

  /* ── Радио «Тема» и «Плотность» ────────────────────────────────────── */
  function syncThemeRadios() {
    var light = root.getAttribute("data-theme") === "light";
    doc.querySelectorAll("[data-theme-radio]").forEach(function (r) {
      r.checked = (r.value === "light") === light;
    });
  }
  doc.querySelectorAll("[data-theme-radio]").forEach(function (r) {
    r.addEventListener("change", function () {
      if (S && S.setTheme) S.setTheme(r.value);
      syncThemeRadios();
    });
  });
  function syncDensityRadios() {
    var d = root.getAttribute("data-density") || "comfortable";
    doc.querySelectorAll("[data-density-radio]").forEach(function (r) {
      r.checked = r.value === d;
    });
  }
  doc.querySelectorAll("[data-density-radio]").forEach(function (r) {
    r.addEventListener("change", function () {
      if (S && S.setDensity) S.setDensity(r.value);
      syncDensityRadios();
    });
  });
  syncThemeRadios();
  syncDensityRadios();

  /* ── Лупа: статичная Нейра + две строки списка ────────────────────── */
  var mirror = doc.getElementById("mirror-neura");
  var loupeRow = doc.querySelector(".loupe-row");
  var errHoldUntil = 0;

  function mirrorMode() {
    if (!mirror) return;
    var mode = root.getAttribute("data-living");
    if (mode === "off") mirror.setAttribute("data-state", "off");
    else mirror.setAttribute("data-state", mode === "calm" ? "calm-last" : "idle");
  }
  mirrorMode();
  new MutationObserver(mirrorMode).observe(root, { attributes: true, attributeFilter: ["data-living"] });
  window.addEventListener("stand:living-change", mirrorMode);

  var EV_COLOR = {
    write: "var(--synapse-write)", "task.done": "var(--synapse-write)",
    "owner.wait": "var(--synapse-write)", error: "var(--color-error)",
    default: "var(--color-iris)",
  };
  doc.addEventListener("stand:feed-event", function (e) {
    if (!mirror) return;
    var d = e.detail || {};
    var ev = d.ev || "";
    /* «Спокойный»: цвет = последнее событие (как Нейра 08 §5.1) */
    mirror.style.setProperty("--mirror-last", EV_COLOR[ev] || EV_COLOR.default);
    if (root.getAttribute("data-living") === "off") return;
    var mode = root.getAttribute("data-living");
    if (mode === "calm") { mirror.setAttribute("data-state", "calm-last"); }
    else if (ev === "error") {
      mirror.setAttribute("data-state", "error"); /* error-hold ~10s (08 §5.1) */
      errHoldUntil = Date.now() + 10000;
      setTimeout(function () {
        if (Date.now() >= errHoldUntil && mirror.getAttribute("data-state") === "error") {
          mirror.setAttribute("data-state", "idle");
        }
      }, 10100);
    } else {
      mirror.setAttribute("data-state", ev === "write" || ev === "task.done" ? "write" : "idle");
      setTimeout(function () {
        if (mirror.getAttribute("data-state") === "write" &&
            Date.now() >= errHoldUntil) mirror.setAttribute("data-state", "idle");
      }, 600);
    }
    if (ev === "owner.wait") mirror.setAttribute("data-wait", "1");  /* дилатация */
    if (ev === "owner.clear") mirror.setAttribute("data-wait", "0");
    /* строка списка лупы отзывается вспышкой (лупа = живой фрагмент) */
    if (loupeRow) {
      loupeRow.classList.remove("is-fresh");
      void loupeRow.offsetWidth;
      loupeRow.classList.add("is-fresh");
    }
  });
})();
