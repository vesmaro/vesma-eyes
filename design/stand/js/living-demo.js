/* living-demo.js — витрина «Живой слой v11» (living.html, спека 14).
 * Служебный демо-скрипт стенда: в продуктовый living-чанк НЕ входит
 * (бюджет 07n §3 считают по living.js; витрина — отдельная лаборатория).
 * Грамматика: кнопки витрины публикуют события в единую шину
 * stand:feed-event (08 §3.1) — второй источник не создаётся. */
(function () {
  "use strict";
  var doc = document;
  var L = window.Living;
  var root = doc.documentElement;

  /* ── грамматика v2: живые строки-кнопки ────────────────────────────── */
  var GRAMMAR = [
    { ev: "recall", name: "обращение к памяти", kind: "событие", sign: "event", dir: "к Нейре", speed: "600 px/s", arrive: "вспышка ириса" },
    { ev: "write", name: "запись в память", kind: "событие", sign: "event gold", dir: "к Нейре", speed: "600 px/s", arrive: "вспышка · миелин золотеет" },
    { ev: "task.start", name: "задача началась", kind: "событие", sign: "event", dir: "от «Задачи» к Нейре", speed: "600 px/s", arrive: "вспышка ириса" },
    { ev: "task.done", name: "задача завершена", kind: "событие", sign: "event gold", dir: "от «Задачи» к Нейре", speed: "600 px/s", arrive: "вспышка золота" },
    { ev: "owner.wait", name: "ждут владельца", kind: "внимание", sign: "attention", dir: "от Пульта к Нейре", speed: "450 px/s", arrive: "двойной удар · ▸N светится · зрачок расширен" },
    { ev: "owner.clear", name: "владелец ответил", kind: "событие", sign: "event", dir: "от Пульта к Нейре", speed: "600 px/s", arrive: "снимает ожидание" },
    { ev: "error", name: "ошибка связи", kind: "ошибка", sign: "error", dir: "от Нейры наружу", speed: "750 px/s", arrive: "красный hold · искра по аксону · ×2 карточка" },
  ];
  var rowsHost = doc.getElementById("lv-grammar-rows");
  function emit(ev) {
    doc.dispatchEvent(new CustomEvent("stand:feed-event", {
      detail: { ev: ev, mem: null, text: "витрина: " + ev, who: "demo", srv: "mnemos-01", at: Date.now() },
    }));
  }
  if (rowsHost) {
    var head = doc.createElement("div");
    head.className = "lv-g-row head";
    head.innerHTML = "<span></span><span>событие · класс</span><span>направление</span><span>ритм</span><span>прибытие</span><span></span>";
    rowsHost.appendChild(head);
    GRAMMAR.forEach(function (g) {
      var row = doc.createElement("div");
      row.className = "lv-g-row";
      var sign = doc.createElement("span");
      sign.className = "lv-g-sign " + g.sign;
      sign.setAttribute("aria-hidden", "true");
      var name = doc.createElement("span");
      name.className = "lv-g-name";
      name.innerHTML = g.name + '<span class="lv-g-kind">' + g.kind + "</span>";
      var dir = doc.createElement("span"); dir.className = "lv-g-dir"; dir.textContent = g.dir;
      var spd = doc.createElement("span"); spd.className = "lv-g-speed"; spd.textContent = g.speed;
      var arr = doc.createElement("span"); arr.className = "lv-g-arrive"; arr.textContent = g.arrive;
      var act = doc.createElement("span");
      var btn = doc.createElement("button");
      btn.type = "button";
      btn.className = "btn secondary sm";
      btn.textContent = "Показать";
      btn.setAttribute("aria-label", "Показать событие: " + g.name);
      btn.addEventListener("click", function () {
        emit(g.ev);
        if (g.ev === "error") setTimeout(function () { emit("error"); }, 300); /* карточка после 2 подряд */
      });
      act.appendChild(btn);
      row.appendChild(sign); row.appendChild(name); row.appendChild(dir);
      row.appendChild(spd); row.appendChild(arr); row.appendChild(act);
      rowsHost.appendChild(row);
    });
    /* афиша режима и предупреждение анониму (07k: контент — после входа) */
    if (root.getAttribute("data-auth") === "anon") {
      var note = doc.getElementById("lv-anon-note");
      if (note) note.hidden = false;
    }
  }

  /* ── режим витрины: полная/спокойный/выключен ─────────────────────── */
  doc.querySelectorAll("[data-lv-mode]").forEach(function (b) {
    b.addEventListener("click", function () {
      var m = b.getAttribute("data-lv-mode");
      if (window.standPrefs) window.standPrefs.setLiving(m);
      if (window.standToast) {
        window.standToast("Живой слой: " + (m === "full" ? "полный" : m === "calm" ? "спокойный" : "выключен"), "info");
      }
      syncModeButtons();
    });
  });
  function syncModeButtons() {
    var cur = window.standPrefs ? window.standPrefs.living() : "calm";
    doc.querySelectorAll("[data-lv-mode]").forEach(function (b) {
      var on = b.getAttribute("data-lv-mode") === cur;
      b.classList.toggle("secondary", on);
      b.classList.toggle("ghost", !on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }
  doc.addEventListener("stand:living-change", syncModeButtons);
  syncModeButtons();

  /* ── анатомия: пластины В3 и В1×3 ─────────────────────────────────── */
  var v3c = doc.getElementById("lv-anat-v3");
  var v1c = doc.getElementById("lv-anat-v1");
  if (!L || !v3c || !v1c) return;
  var v3x = v3c.getContext("2d"), v1x = v1c.getContext("2d");
  var C = L.colors, T1 = L.tiers.v1, T3 = L.tiers.v3;
  v3x.setTransform(v3c.width / 96, 0, 0, v3c.height / 96, 0, 0);
  v1x.setTransform(v1c.width / 28, 0, 0, v1c.height / 28, 0, 0);

  var anat = "idle", animT0 = 0, rafId = null;
  function plateState(now) {
    var s = { iris: C.iris, pupilR: T1.pupil, dendScale: 1, glow: 0, dotGold: false, folded: false, axonSpark: 0 };
    var s3 = { iris: C.iris, pupilR: T3.pupil, dendScale: 1, glow: 0, dotGold: false, folded: false, axonSpark: 0 };
    if (anat === "paused") { s.folded = s3.folded = true; return [s, s3]; }
    if (anat === "wait") { s.pupilR = T1.pupilWait; s3.pupilR = T3.pupilWait; return [s, s3]; }
    if (anat === "error") {
      s.iris = s3.iris = C.error;
      s.glow = s3.glow = 0.12;
      var k = animT0 ? Math.min(1, (now - animT0) / 640) : 1; /* одна искра — как в продукте */
      s.axonSpark = s3.axonSpark = k;
      return [s, s3];
    }
    if (anat === "flash") {
      /* огибающая вспышки write: подъём 240 · удержание 600 · спад 400 */
      var dt = now - animT0;
      var RISE = 240, HOLD = 600, FALL = 400;
      var env = dt < RISE ? dt / RISE : dt < RISE + HOLD ? 1 : dt < RISE + HOLD + FALL ? 1 - (dt - RISE - HOLD) / FALL : 0;
      if (env <= 0) { setAnat("idle", true); return [s, s3]; }
      [s, s3].forEach(function (st, i) {
        st.iris = C.gold;
        st.pupilR = (i ? T3.pupil : T1.pupil) - (i ? 2 : 0.6) * env;
        st.dendScale = 1 + 0.08 * env;
        st.dotGold = true;
      });
    }
    return [s, s3];
  }
  function drawPlates(now) {
    var st = plateState(now || performance.now());
    L.draw(v1x, 28, T1, st[0]);
    L.draw(v3x, 96, T3, st[1]);
  }
  function loop(now) {
    rafId = null;
    drawPlates(now);
    if (anat === "flash" || anat === "error") {
      if (anat === "error" && now - animT0 > 640) { drawPlates(); return; } /* искра одна */
      rafId = requestAnimationFrame(loop);
    }
  }
  function setAnat(name, keep) {
    anat = name;
    animT0 = performance.now();
    if (!keep) {
      doc.querySelectorAll("[data-anat]").forEach(function (b) {
        var on = b.getAttribute("data-anat") === name;
        b.classList.toggle("secondary", on);
        b.classList.toggle("ghost", !on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
    }
    if (rafId == null) rafId = requestAnimationFrame(loop);
    else drawPlates();
  }
  doc.querySelectorAll("[data-anat]").forEach(function (b) {
    b.addEventListener("click", function () { setAnat(b.getAttribute("data-anat")); });
  });
  drawPlates();
  /* смена темы: цвета перечитаны living.js — пластины перерисовать */
  new MutationObserver(function () { drawPlates(); })
    .observe(root, { attributes: true, attributeFilter: ["data-theme"] });

  /* ── FPS: честная нагрузка главного потока (лестница в living.js) ──── */
  var fpsBtn = doc.getElementById("lv-fps-load");
  if (fpsBtn) {
    fpsBtn.addEventListener("click", function () {
      fpsBtn.disabled = true;
      var until = performance.now() + 6000;
      (function burn() {
        var t0 = performance.now();
        while (performance.now() - t0 < 26) { /* жжём ~26ms кадра → ~30fps */ }
        if (performance.now() < until) requestAnimationFrame(burn);
        else fpsBtn.disabled = false;
      })();
    });
  }

  /* ── V3-концепт: строка наведения (прототип, не продукт) ──────────── */
  var hint = doc.getElementById("lv-hint");
  var hintShow = doc.getElementById("lv-hint-show");
  var hintClose = doc.getElementById("lv-hint-close");
  if (hint && hintShow && hintClose) {
    hintShow.addEventListener("click", function () {
      hint.hidden = false;
      hintShow.disabled = true; /* не чаще одного показа за визит — как в правиле */
    });
    function dismiss() {
      hint.hidden = true;
      setTimeout(function () { hintShow.disabled = false; }, 1500);
    }
    hintClose.addEventListener("click", dismiss);
  }
})();
