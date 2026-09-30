/* pair.js — «Живая кора» stand v3: /pair phases (spec 07h).
 * Outside the Shell: own header, no sidebar; theme via same store contract.
 * Honest TTL arc 3:00 → expiry fade + «Запросить новый код» (never dead).
 * Phase invariant: pairing code and verify digits never render in one phase
 * (ADR 0012 §3.5) — the wait phase replaces the QR phase entirely. */
(function () {
  "use strict";

  var doc = document;
  var toast = window.standToast;

  /* theme: same store contract as shell.js (shared across stand pages) */
  var root = doc.documentElement;
  var store = {
    get: function (k, d) {
      try { return localStorage.getItem("stand-" + k) || d; } catch (e) { return d; }
    },
    set: function (k, v) {
      try { localStorage.setItem("stand-" + k, v); } catch (e) { /* file:// */ }
    },
  };
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
  });

  /* ── phases: статические секции в разметке pair.html ─────────────────── */
  var phases = {
    qr: doc.getElementById("phase-qr"),
    wait: doc.getElementById("phase-wait"),
    success: doc.getElementById("phase-success"),
    fail: doc.getElementById("phase-fail"),
    manual: doc.getElementById("phase-manual"),
  };
  var reduced = function () {
    return root.getAttribute("data-motion") === "reduced";
  };

  /* честная постура фаз: смена объявляется скринридеру (07h §6) */
  var live = doc.createElement("div");
  live.setAttribute("role", "status");
  live.setAttribute("aria-live", "polite");
  live.className = "sr-only";
  doc.body.appendChild(live);
  var announceTimer = null;
  function announce(text) {
    if (announceTimer) clearTimeout(announceTimer);
    live.textContent = "";
    announceTimer = setTimeout(function () { live.textContent = text; }, 50);
  }

  /* ── demo QR: fixed deterministic pseudo-pattern («демо», не реальный код) */
  (function drawQr() {
    var svg = doc.getElementById("qr-svg");
    var N = 29;
    var cells = [];
    var seed = 0x5f3759df;
    function rnd() {
      seed ^= seed << 13; seed >>>= 0;
      seed ^= seed >> 17;
      seed ^= seed << 5; seed >>>= 0;
      return seed / 4294967296;
    }
    var y, x;
    for (y = 0; y < N; y++) {
      cells[y] = [];
      for (x = 0; x < N; x++) cells[y][x] = rnd() > 0.52;
    }
    function finder(cx, cy) {
      var i, j, p;
      for (i = 0; i < 7; i++) {
        for (j = 0; j < 7; j++) {
          var edge = i === 0 || i === 6 || j === 0 || j === 6;
          var core = i >= 2 && i <= 4 && j >= 2 && j <= 4;
          cells[cy + i][cx + j] = edge || core;
        }
      }
      for (i = -1; i < 8; i++) {
        var ring = [[cx + i, cy - 1], [cx + i, cy + 7], [cx - 1, cy + i], [cx + 7, cy + i]];
        for (j = 0; j < ring.length; j++) {
          p = ring[j];
          if (p[0] >= 0 && p[0] < N && p[1] >= 0 && p[1] < N) cells[p[1]][p[0]] = false;
        }
      }
    }
    finder(0, 0);
    finder(N - 7, 0);
    finder(0, N - 7);
    for (x = 8; x < N - 8; x++) cells[6][x] = x % 2 === 0;
    for (y = 8; y < N - 8; y++) cells[y][6] = y % 2 === 0;
    for (y = N - 9; y < N - 4; y++) {
      for (x = N - 9; x < N - 4; x++) {
        var dy = Math.abs(y - (N - 7)), dx = Math.abs(x - (N - 7));
        cells[y][x] = Math.max(dx, dy) !== 1;
      }
    }
    var ns = "http://www.w3.org/2000/svg";
    var rect = doc.createElementNS(ns, "rect");
    rect.setAttribute("width", N);
    rect.setAttribute("height", N);
    rect.setAttribute("fill", "#ffffff");
    svg.appendChild(rect);
    var pathD = "";
    for (y = 0; y < N; y++) {
      for (x = 0; x < N; x++) {
        if (cells[y][x]) pathD += "M" + x + " " + y + "h1v1h-1z";
      }
    }
    var path = doc.createElementNS(ns, "path");
    path.setAttribute("d", pathD);
    path.setAttribute("fill", "#0d0f14");
    svg.appendChild(path);
  })();

  /* ── TTL: 3:00 дуга; ≤20 c — warning; истёк → затухание + CTA ────────── */
  var TTL_SECONDS = 180;
  var ARC_LEN = 97.4;
  var ttlTimer = null;
  var ttlLeft = TTL_SECONDS;
  var ttlArc = doc.getElementById("ttl-arc");
  var ttlFg = doc.getElementById("ttl-fg");
  var ttlText = doc.getElementById("ttl-text");
  var qrBox = doc.getElementById("qr-box");
  var qrContent = doc.getElementById("phase-qr-content");
  var expiredCard = doc.getElementById("phase-expired");

  function fmt(s) {
    var m = Math.floor(s / 60);
    var r = s % 60;
    return m + ":" + (r < 10 ? "0" : "") + r;
  }
  function stopTTL() {
    if (ttlTimer) { clearInterval(ttlTimer); ttlTimer = null; }
  }
  function resetTTL() {
    stopTTL();
    ttlLeft = TTL_SECONDS;
    ttlArc.classList.remove("warn");
    qrBox.classList.remove("expired");
    qrBox.style.opacity = "";
    ttlText.textContent = "истечёт через " + fmt(ttlLeft);
    ttlFg.setAttribute("stroke-dashoffset", "0");
  }
  function startTTL() {
    resetTTL();
    if (reduced()) ttlFg.setAttribute("data-static", "true"); /* дуга статична, текст тикает */
    ttlTimer = setInterval(function () {
      ttlLeft -= 1;
      if (ttlLeft <= 20 && ttlLeft > 0) ttlArc.classList.add("warn");
      if (ttlLeft <= 0) {
        stopTTL();
        expireQr();
        return;
      }
      ttlText.textContent = "истечёт через " + fmt(ttlLeft);
      ttlFg.setAttribute("stroke-dashoffset", String(ARC_LEN * (1 - ttlLeft / TTL_SECONDS)));
    }, 1000);
  }
  function expireQr() {
    qrBox.classList.add("expired");
    ttlText.textContent = "истёк";
    announce("Срок действия кода вышел");
    setTimeout(function () {
      toast("Код истёк — срок действия вышел (3 минуты)", "info");
      qrContent.hidden = true;
      expiredCard.hidden = false;
      var nb = doc.getElementById("new-code");
      if (nb) nb.focus();
    }, 260);
  }
  function newCode() {
    expiredCard.hidden = true;
    qrContent.hidden = false;
    resetTTL();
    startTTL();
    var chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    var code = "mne-";
    var i;
    for (i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
    code += "-";
    for (i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
    code += "-";
    for (i = 0; i < 4; i++) code += "0123456789"[Math.floor(Math.random() * 10)];
    doc.getElementById("pair-code").textContent = code;
    toast("Новый код запрошен — живёт 3 минуты, работает один раз", "success");
    setPhase("qr", false);
  }

  /* ── фазы + объявление смены для скринридера ─────────────────────────── */
  var current = "qr";
  var phaseTitles = {
    qr: "Фаза: отсканируйте QR камерой телефона",
    wait: "Фаза: ждём подтверждения на экране владельца",
    success: "Фаза: телефон подключён",
    fail: "Фаза: подключение не состоялось",
    manual: "Фаза: ручной ввод кода",
  };
  function setPhase(name, focusTitle) {
    Object.keys(phases).forEach(function (k) {
      phases[k].hidden = k !== name;
    });
    if (name === "qr") {
      qrContent.hidden = false;
      expiredCard.hidden = true;
      startTTL();
    } else {
      stopTTL();
    }
    current = name;
    announce(phaseTitles[name] || name);
    if (focusTitle !== false) {
      var t = phases[name].querySelector("h2");
      if (t) t.focus();
    }
  }

  /* ── копирование кода (честный фолбэк) ───────────────────────────────── */
  doc.getElementById("copy-code").addEventListener("click", function () {
    var code = doc.getElementById("pair-code").textContent;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(
        function () { toast("Код скопирован — вставьте на странице vesmaro на телефоне", "success"); },
        function () { toast("Не удалось скопировать автоматически — выделите код вручную", "info"); }
      );
    } else {
      toast("Буфер обмена недоступен в этом браузере — выделите код вручную", "info");
    }
  });

  /* ── «Что это даёт?» — свёрнутый, персистентен в сессии (07h §2) ─────── */
  var cbToggle = doc.querySelector(".pair-details > .cb-toggle");
  var cbBody = doc.getElementById("pair-whatfor");
  var cbOpen = store.get("pair-whatfor", "") === "1";
  function applyCb() {
    cbToggle.setAttribute("aria-expanded", cbOpen ? "true" : "false");
    cbBody.hidden = !cbOpen;
  }
  cbToggle.addEventListener("click", function () {
    cbOpen = !cbOpen;
    store.set("pair-whatfor", cbOpen ? "1" : "0");
    applyCb();
  });
  applyCb();

  /* ── ожидание: честная постура «проверим ещё раз через минуту» ───────── */
  var autoTimer = null;
  function startWait() {
    if (autoTimer) clearTimeout(autoTimer);
    autoTimer = setTimeout(function () {
      if (current === "wait") {
        toast("Проверили автоматически: подтверждения пока нет", "info");
        startWait();
      }
    }, 60000);
  }
  doc.getElementById("check-now").addEventListener("click", function () {
    toast("Проверили: подтверждения пока нет — владелец ещё не ответил", "info");
  });

  /* ── форма ручного кода: busy, inline-ошибка, вердикт 404 ────────────── */
  doc.getElementById("fail-manual").addEventListener("click", function () {
    setPhase("manual");
  });
  doc.getElementById("manual-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var inp = doc.getElementById("manual-code-input");
    var err = doc.getElementById("manual-err");
    var v = inp.value.trim().toUpperCase();
    if (!/^MNE-[A-Z0-9]{4}-[A-Z0-9]{4}-\d{4}$/.test(v)) {
      err.hidden = false;
      inp.setAttribute("aria-invalid", "true");
      inp.focus();
      return;
    }
    err.hidden = true;
    inp.removeAttribute("aria-invalid");
    var btn = doc.getElementById("manual-submit");
    btn.disabled = true;
    btn.textContent = "Подключаем…";
    setTimeout(function () {
      btn.disabled = false;
      btn.textContent = "Подключить";
      if (v === doc.getElementById("pair-code").textContent.toUpperCase()) {
        setPhase("wait");
        startWait();
      } else {
        showFail("Неизвестный код", "Проверьте код — возможно, опечатка при ручном вводе. Код напечатан на экране владельца рядом с QR.");
      }
    }, 600);
  });

  /* ── отказ/ошибка: честные вердикты (07h §5) ─────────────────────────── */
  function showFail(title, why) {
    doc.getElementById("fail-title").textContent = title;
    doc.getElementById("fail-why").textContent = why;
    setPhase("fail");
  }

  /* ── демо-переходы фаз (канон стенда) ────────────────────────────────── */
  doc.addEventListener("click", function (e) {
    var nb = e.target.closest("#new-code");
    if (nb) { newCode(); return; }
    var b = e.target.closest("[data-demo-phase]");
    if (!b) return;
    var p = b.dataset.demoPhase;
    if (p === "wait") { setPhase("wait"); startWait(); return; }
    if (p === "success") {
      if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
      setPhase("success");
      return;
    }
    if (p === "reject") {
      if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
      showFail("Подключение отклонено", "Владелец отклонил запрос: устройство не получит доступ, код погашен.");
      return;
    }
    if (p === "expired") { expireQr(); return; }
    if (p === "netfail") {
      showFail("Подключить не удалось", "Сервер не ответил. Проверьте сеть и повторите.");
      return;
    }
    if (p === "manual") { setPhase("manual"); return; }
    if (p === "qr") {
      if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
      setPhase("qr");
      return;
    }
  });

  /* старт: фаза QR, фокус не крадём (публичная точка входа) */
  setPhase("qr", false);
})();