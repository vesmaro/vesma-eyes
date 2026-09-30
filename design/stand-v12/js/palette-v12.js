/* palette-v12.js — Палитра ⌘K «командная магия» (спека 15 §3.3 + §13.7).
 *
 * Магия = скорость и контекст, НЕ анимация: открытие/закрытие ≤120ms
 * (opacity + scale 0.98→1, origin top center, ноль stagger); отклик на
 * ввод — пересчёт ≤80ms без движения (замер performance.now вокруг
 * рендера, §13.7.6: цифра в console.debug + window.__paletteRenderMs).
 * Ирис-отсвет «попадание в память» — ровно один раз, при открытии, если
 * в стартовых результатах есть записи памяти (§13.7.3); при вводе —
 * только мгновенная подсветка совпадений.
 *
 * paletteCommands() перенесена из stand-v11-base/js/shell.js (§13.7.5):
 * замок у гейтов + 401-CTA «Войти» анониму (data-auth=anon); навигация
 * адаптирована к экранам v12. Источник индекса — STAND (data.js).
 */
(function () {
  "use strict";
  var doc = document;
  var root = doc.documentElement;

  /* ── paletteCommands (порт v11 shell.js; gated-механика как есть) ──── */
  var GATED = { "kora.html": 1, "tasks.html": 1 }; /* гейты v6 (07k): в стенде анонима нет — путь живёт честно */
  var LOCK_SVG = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect width="14" height="10" x="5" y="11" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
  function paletteCommands() {
    var anon = root.getAttribute("data-auth") === "anon";
    var nav = [
      { title: "Обзор · колодец памяти", href: "overview.html", keys: "обзор главная home колодец герой" },
      { title: "Задачи · живая доска", href: "tasks.html", keys: "задачи канбан доска борд темп" },
      { title: "Кора · дирижёрская", href: "kora.html", keys: "кора сессии эфир транскрипты дирижёр" },
      { title: "Настройки · личность коры", href: "settings.html", keys: "настройки вид тема зеркало плотность" },
      { title: "Полигон машинерии", href: "shell.html", keys: "полигон демо шина крюки события" },
      { title: "Трейлер", href: "wow.html", keys: "трейлер вау пять секунд" },
      { title: "Хосты", href: "hosts.html", keys: "хосты машины хранилища" },
    ].map(function (c) {
      return { group: "Переход", title: c.title, keys: c.keys, href: c.href, gated: !!GATED[c.href.split("?")[0]] };
    });
    var actions = [
      { group: "Действия", title: "Дать задачу", keys: "задача дать новая поручение", act: "give-task" },
      { group: "Действия", title: "Сменить тему: колодец / береста", keys: "тема тёмная светлая береста", act: "theme" },
      { group: "Действия", title: "Живой слой: полный", keys: "живой слой полный living full", act: "living-full" },
      { group: "Действия", title: "Живой слой: спокойный", keys: "живой слой спокойный calm", act: "living-calm" },
      { group: "Действия", title: "Живой слой: выключен", keys: "живой слой выключить off", act: "living-off" },
      { group: "Действия", title: "Демо: задача завершена (task.done)", keys: "демо задача завершена done спектакль", act: "demo-done" },
      { group: "Действия", title: "Демо: ждут владельца (owner.wait)", keys: "демо ждут владельца внимание", act: "demo-wait" },
    ];
    if (anon) {
      actions = [
        { group: "Действия", title: "Войти", keys: "войти вход login", href: "auth.html", gated: false, cta401: true },
        { group: "Действия", title: "Сменить тему: колодец / береста", keys: "тема береста", act: "theme" },
      ];
    }
    return nav.concat(actions);
  }

  /* ── индекс: команды + сущности STAND ─────────────────────────────── */
  var items = [];
  function buildIndex() {
    var D = window.STAND || {};
    items = paletteCommands();
    (D.memories || []).forEach(function (m) {
      items.push({
        group: "Память", kind: "mem", title: m.id + " · " + m.title,
        keys: (m.tags || []).join(" ") + " " + m.title,
        preview: (m.content && m.content[0]) || "", prov: m.prov || "",
        href: "overview.html#fold", route: "обзор → лента",
      });
    });
    (D.tasks || []).forEach(function (t) {
      items.push({
        group: "Задачи", kind: "task", title: t.id + " · " + t.title,
        keys: (t.tags || []).join(" ") + " " + t.title,
        state: t.state, agent: t.assignee || "без исполнителя",
        href: "tasks.html", route: "задачи → доска",
        ownerWait: t.id === "T-121",
      });
    });
    (D.koraSessions || []).forEach(function (s) {
      items.push({
        group: "Сессии", kind: "sess", title: s.name,
        keys: s.name + " " + s.agent + " сессия кора",
        preview: s.topic || "", prov: s.host + " · агент " + s.agent,
        href: "kora.html", route: "кора → сцена",
      });
    });
  }

  /* ── DOM оверлея ──────────────────────────────────────────────────── */
  var overlay = doc.createElement("div");
  overlay.className = "palette-overlay";
  overlay.hidden = true;
  overlay.innerHTML =
    '<div class="palette" role="dialog" aria-modal="true" aria-label="Командная палитра">' +
      '<div class="palette-input-row">' +
        '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>' +
        '<input class="palette-input" type="text" placeholder="Память, задачи, сессии, команды…" aria-label="Поиск по памяти, задачам и командам" autocomplete="off" spellcheck="false">' +
        '<span class="kbd palette-esc" aria-hidden="true">esc</span>' +
      '</div>' +
      '<div class="palette-results" role="listbox" aria-label="Результаты"></div>' +
    '</div>';
  doc.body.appendChild(overlay);
  var input = overlay.querySelector(".palette-input");
  var results = overlay.querySelector(".palette-results");
  var open = false, activeIdx = -1, renderedRows = [];

  /* ── фильтр: prefix > includes; подсветка совпадений мгновенно ────── */
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch];
    });
  }
  function hi(title, q) {
    if (!q) return esc(title);
    var i = title.toLowerCase().indexOf(q);
    if (i < 0) return esc(title);
    return esc(title.slice(0, i)) + "<mark>" + esc(title.slice(i, i + q.length)) + "</mark>" + esc(title.slice(i + q.length));
  }
  var STATE_RU = { open: "открыто", "in-progress": "в работе", blocked: "блокировано", resolved: "решено", done: "готово" };
  function rowHTML(it, q) {
    var secondary = "";
    if (it.kind === "mem") {
      secondary = '<span class="pal-preview">' + esc(it.preview) + ' <span class="prov">' + esc(it.prov) + "</span></span>";
    } else if (it.kind === "task") {
      secondary = '<span class="pal-preview"><span class="status-chip" data-state="' + it.state + '">' + (STATE_RU[it.state] || it.state) + "</span>" +
        esc(it.agent) + (it.ownerWait ? " · ◆ ждут владельца" : "") + "</span>";
    } else if (it.kind === "sess") {
      secondary = '<span class="pal-preview">' + esc(it.preview) + ' <span class="prov">' + esc(it.prov) + "</span></span>";
    }
    var right = it.href
      ? '<span class="pal-route">' + esc(it.route || "переход") + "</span>"
      : '<span class="pal-route"><span class="kbd">enter</span></span>';
    if (it.act) right = '<span class="pal-route"><span class="kbd">enter</span></span>';
    if (it.gated) right += '<span class="pal-lock" title="Раздел за гейтом входа">' + LOCK_SVG + "</span>";
    return '<span class="pal-main"><span class="pal-title">' + hi(it.title, q) + "</span>" + secondary + "</span>" + right;
  }
  function render() {
    var t0 = performance.now();
    var q = input.value.trim().toLowerCase();
    var pool = items;
    if (q) {
      pool = items.filter(function (it) {
        return (it.title + " " + (it.keys || "")).toLowerCase().indexOf(q) >= 0;
      }).sort(function (a, b) { /* prefix первичен */
        var ai = a.title.toLowerCase().indexOf(q) === 0 ? 0 : 1;
        var bi = b.title.toLowerCase().indexOf(q) === 0 ? 0 : 1;
        return ai - bi;
      });
    }
    var html = "";
    var byGroup = {};
    pool.slice(0, 40).forEach(function (it) { (byGroup[it.group] = byGroup[it.group] || []).push(it); });
    Object.keys(byGroup).forEach(function (g) {
      html += '<div class="palette-group" role="group" aria-label="' + g + '">' +
        '<div class="palette-group-head">' + g + ' <span class="group-count">' + byGroup[g].length + "</span></div>";
      byGroup[g].forEach(function (it) { html += '<button type="button" class="pal-row" role="option" tabindex="-1" data-kind="' + (it.kind || "cmd") + '">' + rowHTML(it, q) + "</button>"; });
      html += "</div>";
    });
    if (!pool.length && q) {
      html = '<div class="pal-empty"><span>Ничего не нашлось по «' + esc(input.value.trim()) + '»</span><span class="pal-empty-hint">попробуйте короче — например, «задач» или «кора»</span></div>';
    }
    results.innerHTML = html;
    renderedRows = Array.prototype.slice.call(results.querySelectorAll(".pal-row"));
    activeIdx = renderedRows.length ? 0 : -1;
    syncActive();
    var dt = performance.now() - t0;
    window.__paletteRenderMs = dt; /* §13.7.6: бюджет ≤80ms, цифра — в отчёт среза */
    if (window.console && console.debug) console.debug("[palette] render", dt.toFixed(1) + "ms /", pool.length, "совпадений");
  }

  function syncActive() {
    renderedRows.forEach(function (r, i) { r.classList.toggle("is-active", i === activeIdx); });
  }

  /* ── открытие/закрытие ≤120ms: opacity+scale, origin top center ───── */
  function openPalette() {
    if (open) return;
    if (!items.length) buildIndex();
    open = true;
    overlay.hidden = false;
    requestAnimationFrame(function () {
      overlay.classList.add("is-open", "is-anim");
    });
    input.value = "";
    render();
    /* §13.7.3: ирис-отсвет — ОДИН раз, при открытии, на строках памяти */
    var memRows = renderedRows.filter(function (r) { return r.getAttribute("data-kind") === "mem"; });
    if (memRows.length) memRows.forEach(function (r) {
      r.classList.add("is-hit");
      r.addEventListener("animationend", function () { r.classList.remove("is-hit"); }, { once: true });
    });
    input.focus();
  }
  function closePalette() {
    if (!open) return;
    open = false;
    overlay.classList.remove("is-anim");
    overlay.classList.add("is-closing");
    setTimeout(function () {
      overlay.classList.remove("is-open", "is-closing");
      overlay.hidden = true;
    }, 120); /* гаснет ≤120ms (§13.7.4) */
  }

  /* ── действия строк ───────────────────────────────────────────────── */
  function emitBus(ev, text) {
    doc.dispatchEvent(new CustomEvent("stand:feed-event", {
      detail: { ev: ev, mem: null, text: text, who: "owner", srv: "stand-v12", at: Date.now() },
    }));
  }
  function runIdx(i) {
    /* соответствие индексов: renderedRows строились из pool.slice(0,40) —
     * берём данные прямо из атрибутов не храним: перезапускаем фильтр */
    var q = input.value.trim().toLowerCase();
    var pool = q ? items.filter(function (it) { return (it.title + " " + (it.keys || "")).toLowerCase().indexOf(q) >= 0; })
                    .sort(function (a, b) {
                      var ai = a.title.toLowerCase().indexOf(q) === 0 ? 0 : 1;
                      var bi = b.title.toLowerCase().indexOf(q) === 0 ? 0 : 1;
                      return ai - bi;
                    })
                 : items;
    var it = pool.slice(0, 40)[i];
    if (!it) return;
    closePalette();
    if (it.href) {
      try { sessionStorage.setItem("stand-focus-h1", "1"); } catch (e) {}
      window.location.href = it.href;
      return;
    }
    switch (it.act) {
      case "theme":
        var btn = doc.querySelector("[data-theme-toggle]");
        if (btn) btn.click();
        break;
      case "living-full": case "living-calm": case "living-off": {
        var m = it.act.split("-")[1];
        try {
          sessionStorage.removeItem("stand-living-override");
          localStorage.setItem("vesmaro.livingLayer", m);
        } catch (e) {}
        window.dispatchEvent(new Event("stand:living-change"));
        break;
      }
      case "give-task": emitBus("task.start", "владелец дал задачу «Утренний прогон»"); break;
      case "demo-done": emitBus("task.done", "демо палитры: задача T-128 завершена агентом agb"); break;
      case "demo-wait": emitBus("owner.wait", "демо палитры: задача T-121 ждёт вашего решения"); break;
    }
  }

  /* ── клавиатура: ⌘K/Ctrl+K, стрелки, Enter, Esc, фокус-ловушка ────── */
  doc.addEventListener("keydown", function (e) {
    if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K" || e.key === "л")) {
      e.preventDefault();
      if (open) closePalette(); else openPalette();
      return;
    }
    if (!open) return;
    if (e.key === "Escape") { e.preventDefault(); closePalette(); }
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (activeIdx < renderedRows.length - 1) { activeIdx++; syncActive(); renderedRows[activeIdx].focus(); }
    }
    else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (activeIdx > 0) { activeIdx--; syncActive(); renderedRows[activeIdx].focus(); }
      else input.focus();
    }
    else if (e.key === "Enter") {
      e.preventDefault();
      runIdx(activeIdx);
    }
    else if (e.key === "Tab" && !e.shiftKey && doc.activeElement === renderedRows[renderedRows.length - 1]) {
      e.preventDefault(); input.focus(); /* ловушка фокуса (2.1.2) */
    }
  });
  input.addEventListener("input", render); /* пересчёт ≤80ms, без анимаций */
  overlay.addEventListener("mousedown", function (e) { if (e.target === overlay) closePalette(); });
  results.addEventListener("click", function (e) {
    var row = e.target.closest(".pal-row");
    if (!row) return;
    activeIdx = renderedRows.indexOf(row);
    runIdx(activeIdx);
  });

  /* кнопка ⌘K в топбаре (вставляется в .topbar-status) */
  var status = doc.querySelector(".topbar-status");
  if (status) {
    var btn = doc.createElement("button");
    btn.type = "button";
    btn.className = "palette-open-btn";
    btn.setAttribute("aria-label", "Открыть командную палитру (Ctrl+K или ⌘K)");
    btn.innerHTML = 'поиск <span class="kbd">⌘K</span>';
    btn.addEventListener("click", openPalette);
    status.insertBefore(btn, status.firstChild);
  }

  /* индекс — после data.js */
  function init() { buildIndex(); }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init);
  else init();
})();
