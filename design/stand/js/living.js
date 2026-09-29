/* living.js — v10 «Живой слой» (spec 08-LIVING-NEURON).
 *
 * Ярусы: В1 «Нейра» (28px canvas в статус-зоне, слева от LIVE-пилюли),
 * В2 «Синапс» (курьеры по существующим швам каркаса — жилам Ж1–Ж4),
 * В3 «Ирис» (статичная морфология ×3.4: карточка ошибки связи, empty-блоки).
 *
 * Канон: свет = данные (06 §5). Единственный источник событий — шина
 * stand:feed-event (data.js, 08 §3.1); таймеров «оживления» нет.
 * Грамматика транспорта: норма течёт К Нейре (сток), бедствие — ОТ неё.
 * Производительность: один RAF на страницу, пауза в фоне, деградация
 * <55.5fps → DPR 1.5 + glow off, <45 → статичный SVG (08 §2.5).
 * Режимы: vesmaro.livingLayer = full | calm | off (+ data-living на <html>);
 * prefers-reduced-motion ограничивает сверху до «Спокойного» (08 §4).
 */
(function () {
  "use strict";
  var doc = document;
  var root = doc.documentElement;
  var store = {
    get: function (k, d) { try { return localStorage.getItem(k) || d; } catch (e) { return d; } },
  };

  /* ── режим: пользовательский выбор × системный reduced (08 §4) ────── */
  var LIVING_KEY = "vesmaro.livingLayer";
  var userMode = store.get(LIVING_KEY, "full");
  if (["full", "calm", "off"].indexOf(userMode) === -1) userMode = "full";
  root.setAttribute("data-living", userMode);

  function systemReduced() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      root.getAttribute("data-motion") === "reduced";
  }
  function effectiveMode() {
    if (userMode === "off") return "off";
    if (userMode === "calm" || systemReduced()) return "calm";
    return "full";
  }

  var statusZone = doc.querySelector(".topbar-status");
  if (!statusZone) return; /* не Shell-страница — живого слоя нет */

  /* ── цвета из токенов (перечитываются при смене темы) ─────────────── */
  var C = {};
  function readColors() {
    var cs = getComputedStyle(root);
    function v(name, fallback) {
      var val = cs.getPropertyValue(name).trim();
      return val || fallback;
    }
    C.membrane = v("--myelin-strong", "#5a6470");
    C.iris = v("--color-iris", "#1a8a96");
    C.irisBright = v("--color-iris-bright", "#4fc2ce");
    C.pupil = v("--color-bg-base", "#0d0f14");
    C.myelin = v("--color-confidence-dim", "#7a5520");
    C.gold = v("--color-confidence", "#c9933a");
    C.recall = v("--synapse-recall", C.irisBright);
    C.write = v("--synapse-write", C.gold);
    C.error = v("--color-error", "#d24f4f");
    C.breathA = parseFloat(v("--neura-breath-alpha", "0.18")) || 0.18;
    C.veinA = parseFloat(v("--vein-breath-alpha", "0.10")) || 0.10;
  }
  readColors();
  new MutationObserver(function () {
    readColors();
    if (typeof paintStaticSvg === "function") paintStaticSvg();
  }).observe(root, { attributes: true, attributeFilter: ["data-theme"] });

  /* цвет события словаря 06 §5: recall — ирис, write — золото, error — красный;
   * index (переиндексация) — семья ириса */
  function colorOf(ev) {
    if (ev === "error") return C.error;
    if (ev === "write") return C.write;
    return C.recall;
  }

  /* ── геометрия морфологии (08 §1.2: px от центра слота) ─────────────
   * Одна draw-функция для В1 (28px) и В3 (×3.4, 7 дендритов — характер,
   * не зеркалить). Дендриты — горизонтально-диагональный веер, на двух
   * отростках ветвление 2-го порядка. */
  var TIER_V1 = {
    membrane: 13, iris: 8, pupil: 3, dots: 3, dend: [
      { a: 172, len: 10 }, { a: 8, len: 10 },
      { a: 215, len: 8, branch: true }, { a: 325, len: 7, branch: true },
    ],
    dotIdx: [0, 1, 2], /* точки на концах левого, правого, верхне-левого */
  };
  var TIER_V3 = {
    membrane: 44, iris: 27, pupil: 10, dots: 5, dend: [
      { a: 174, len: 32 }, { a: 6, len: 30 }, { a: 222, len: 27, branch: true },
      { a: 318, len: 34, branch: true }, { a: 246, len: 24 }, { a: 294, len: 26 },
      { a: 205, len: 31 },
    ],
    dotIdx: [0, 1, 2, 3, 6],
  };

  function dendritePath(ctx, cx, cy, tier, scale, membraneR, folded) {
    /* v10-раунд: пауза — дендриты сложены, контур без ветвлений (08 §5.1) */
    ctx.strokeStyle = C.membrane;
    ctx.lineWidth = 1;
    tier.dend.forEach(function (d) {
      var rad = d.a * Math.PI / 180;
      var x1 = cx + Math.cos(rad) * membraneR;
      var y1 = cy + Math.sin(rad) * membraneR;
      var len = d.len * (folded ? 0.35 : scale);
      var x2 = cx + Math.cos(rad) * (membraneR + len);
      var y2 = cy + Math.sin(rad) * (membraneR + len);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      if (d.branch && !folded) { /* ветвление 2-го порядка: развилка на 60% длины */
        var bx = x1 + (x2 - x1) * 0.6, by = y1 + (y2 - y1) * 0.6;
        var half = len * 0.45;
        [-28, 28].forEach(function (da) {
          var br = (d.a + da) * Math.PI / 180;
          ctx.beginPath(); ctx.moveTo(bx, by);
          ctx.lineTo(bx + Math.cos(br) * half, by + Math.sin(br) * half);
          ctx.stroke();
        });
      }
    });
  }

  function drawNeuron(ctx, size, tier, state) {
    /* state: { iris, pupilR, dendScale, glow, dotGold } */
    var cx = size / 2, cy = size / 2;
    ctx.clearRect(0, 0, size, size);
    /* дендриты (под мембраной) */
    dendritePath(ctx, cx, cy, tier, state.dendScale, tier.membrane, state.folded);
    /* точки-миелин: золото только при write (словарная роль, 08 §1.2) */
    ctx.fillStyle = state.dotGold ? C.gold : C.myelin;
    tier.dotIdx.forEach(function (i) {
      var d = tier.dend[i];
      if (!d) return;
      var rad = d.a * Math.PI / 180;
      var r = tier.membrane + d.len * state.dendScale;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(rad) * r, cy + Math.sin(rad) * r, size >= 80 ? 3.4 : 1, 0, 7);
      ctx.fill();
    });
    /* мембрана */
    ctx.strokeStyle = C.membrane;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, tier.membrane, 0, 7); ctx.stroke();
    /* ирис-кольцо */
    ctx.fillStyle = state.iris;
    ctx.beginPath(); ctx.arc(cx, cy, tier.iris, 0, 7); ctx.fill();
    /* ядро-зрачок (сжатие, не перемещение — покой честный) */
    ctx.fillStyle = C.pupil;
    ctx.beginPath(); ctx.arc(cx, cy, state.pupilR, 0, 7); ctx.fill();
    /* вздох: glow поверх ириса, без translate/scale (08 §1.2) */
    if (state.glow > 0.004) {
      ctx.save();
      ctx.globalAlpha = state.glow;
      ctx.shadowColor = state.iris;
      ctx.shadowBlur = size >= 80 ? 26 : 9;
      ctx.strokeStyle = state.iris;
      ctx.lineWidth = size >= 80 ? 5 : 2.5;
      ctx.beginPath(); ctx.arc(cx, cy, tier.iris, 0, 7); ctx.stroke();
      ctx.restore();
    }
  }

  /* ── В1: кнопка + canvas ──────────────────────────────────────────── */
  var neuraBtn = doc.createElement("button");
  neuraBtn.type = "button";
  neuraBtn.className = "living-neura";
  neuraBtn.setAttribute("aria-pressed", "false");
  neuraBtn.setAttribute("aria-label", "Нейра: пауза живого слоя");
  neuraBtn.title = "Клик — пауза живого слоя";
  var neuraCv = doc.createElement("canvas");
  neuraCv.width = 28 * 2; neuraCv.height = 28 * 2; /* DPR ≥1: старт с 2x, деградация уменьшит */
  neuraCv.style.width = "28px"; neuraCv.style.height = "28px";
  neuraCv.setAttribute("aria-hidden", "true");
  neuraBtn.appendChild(neuraCv);
  var livePill = statusZone.querySelector(".pill.live");
  statusZone.insertBefore(neuraBtn, livePill || statusZone.firstChild); /* слева от LIVE */
  var nctx = neuraCv.getContext("2d");
  var dpr = 2;

  function setNeuraSize(dprCap) {
    dpr = Math.max(1, Math.min(dprCap || 2, window.devicePixelRatio || 1));
    neuraCv.width = 28 * dpr; neuraCv.height = 28 * dpr;
    nctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  setNeuraSize(2);

  /* ── состояние Нейры ──────────────────────────────────────────────── */
  var paused = false;            /* клик-жест сессии, не персистится (08 §1.4) */
  var flash = null;              /* { color, t0, gold } — вспышка события */
  var errorHoldUntil = 0;        /* error-hold: до первого успеха или 10s */
  var breathUntil = 0;           /* окно вздоха (ambient-билет у Нейры) */
  var breathStart = 0;           /* v10-раунд: фаза вздоха от старта окна */
  var lastEventColor = null;     /* «Спокойный»: цвет = последнее событие */

  function neuraFlash(ev, at) {
    if (effectiveMode() === "off") return;
    var color = colorOf(ev);
    if (ev === "error") {
      errorHoldUntil = at + 10000;
    } else {
      errorHoldUntil = 0;
    }
    if (typeof paintStaticSvg === "function") paintStaticSvg();
    if (effectiveMode() === "calm") {
      lastEventColor = color; /* Спокойный: цвет = последнее событие (08 §5.1) */
      return;
    }
    flash = { color: color, t0: performance.now(), gold: ev === "write" };
    eventTooltip(ev);
  }

  /* v10-раунд: тултип вспышки словами — «запись в память · 15:27» (08 §1.2
   * через 07a: цвет получает расшифровку). Через 4s — базовый тултип */
  var tooltipTimer = null;
  function eventTooltip(ev) {
    if (paused || effectiveMode() !== "full") return;
    var labels = {
      write: "запись в память",
      recall: "обращение к памяти",
      index: "переиндексация",
      error: "ошибка связи",
    };
    var d = new Date();
    var hhmm = ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
    neuraBtn.title = (labels[ev] || "событие памяти") + " · " + hhmm;
    clearTimeout(tooltipTimer);
    tooltipTimer = setTimeout(function () {
      if (effectiveMode() === "off") return; /* режим сменился — applyMode уже поставил свой title */
      neuraBtn.title = paused ? "Живой слой на паузе — клик, чтобы вернуть" : "Клик — пауза живого слоя";
    }, 4000);
  }

  function neuraState(now) {
    var mode = effectiveMode();
    if (mode === "off") return null;
    if (mode === "calm" || paused) {
      /* Спокойный/пауза: статичный индикатор, цвет = последнее событие.
       * Пауза видна глазами: дендриты сложены, зрачок собран (08 §5.1) */
      var folded = paused;
      var st = C.iris;
      if (mode === "calm" && lastEventColor && !paused) st = lastEventColor;
      return {
        iris: st,
        pupilR: folded ? TIER_V1.pupil - 1 : TIER_V1.pupil,
        dendScale: 1, glow: 0, dotGold: false, folded: folded,
      };
    }
    var iris = C.iris, pupilR = TIER_V1.pupil, dend = 1, gold = false, glow = 0;
    if (now < errorHoldUntil) {
      iris = C.error;
      glow = 0.12; /* error-hold: слабое постоянное свечение (08 §5.1) */
    }
    if (flash) {
      var dt = now - flash.t0, RISE = 240, HOLD = 600, FALL = 400;
      var env = dt < RISE ? dt / RISE : dt < RISE + HOLD ? 1 :
        dt < RISE + HOLD + FALL ? 1 - (dt - RISE - HOLD) / FALL : 0;
      if (env <= 0) flash = null;
      else {
        iris = flash.color;
        pupilR = TIER_V1.pupil - 1 * env;  /* Ø6 → Ø4 */
        dend = 1 + 0.12 * env;             /* ×1.12 */
        gold = flash.gold;
      }
    }
    if (now < breathUntil && !flash && now >= breathStart) {
      /* v10-раунд: фаза от старта окна — вздох всегда открывается с нуля,
       * полный вдох-выдох за окно (08 §1.2: период --duration-neura) */
      var phase = (now - breathStart) / 8000;
      if (phase <= 1) glow = Math.max(glow, Math.sin(Math.PI * phase) * C.breathA);
    }
    return { iris: iris, pupilR: pupilR, dendScale: dend, glow: glow, dotGold: gold };
  }

  /* ── жилы: оверлеи существующих швов (08 §2.1, новых линий нет) ───── */
  var veins = {}; /* id -> {el, rect(), visible, busy} */
  function makeVein(id, host, orient) {
    var el = doc.createElement("span");
    el.className = "living-vein living-vein-" + orient;
    el.setAttribute("aria-hidden", "true");
    el.dataset.vein = id;
    doc.body.appendChild(el);
    var v = { el: el, host: host, orient: orient, visible: true, busy: 0 };
    veins[id] = v;
    positionVein(v);
    return v;
  }
  function positionVein(v) {
    var r = v.host.getBoundingClientRect();
    var s = v.el.style;
    if (v.orient === "h") {
      s.left = r.left + "px"; s.top = (r.bottom - 1) + "px";
      s.width = r.width + "px"; s.height = "2px";
    } else {
      s.left = (r.right - 1) + "px"; s.top = r.top + "px";
      s.width = "2px"; s.height = r.height + "px";
    }
  }
  var sidebar = doc.querySelector(".sidebar");
  var j1 = makeVein("j1", doc.querySelector(".topbar"), "h");           /* магистраль */
  var j2 = sidebar ? makeVein("j2", sidebar, "v") : null;               /* магистраль */
  var koraSeamSide = doc.querySelector(".kora-seam-side");              /* притоки Коры */
  var koraSeamPult = doc.querySelector(".kora-seam-pult");
  var j3 = koraSeamSide ? makeVein("j3", koraSeamSide, "v") : null;
  var j4 = koraSeamPult ? makeVein("j4", koraSeamPult, "h") : null;

  var resizeTimer = null;
  function repositionVeins() {
    if (resizeTimer) return;
    resizeTimer = setTimeout(function () {
      resizeTimer = null;
      Object.keys(veins).forEach(function (k) { positionVein(veins[k]); });
    }, 100);
  }
  window.addEventListener("resize", repositionVeins);
  /* v10-раунд: drag швов/сворачивание сайдбара меняют геометрию без
   * window-resize — следим за хостами швов (08 §2.5) */
  if ("ResizeObserver" in window) {
    var seamRO = new ResizeObserver(repositionVeins);
    [doc.querySelector(".topbar"), sidebar, koraSeamSide, koraSeamPult]
      .filter(Boolean).forEach(function (h) { seamRO.observe(h); });
  }

  /* шов вне вьюпорта не живёт (08 §2.5) */
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        Object.keys(veins).forEach(function (k) {
          if (veins[k].el === en.target) veins[k].visible = en.isIntersecting;
        });
      });
    }, { threshold: 0 });
    Object.keys(veins).forEach(function (k) { io.observe(veins[k].el); });
  }

  /* drag шва: приоритет жеста — курьеры не стартуют, амбиент стоит (08 §5.2) */
  var dragging = false;
  doc.addEventListener("pointerdown", function (e) {
    if (e.target.closest && e.target.closest(".kora-seam")) dragging = true;
  }, true);
  doc.addEventListener("pointerup", function () { dragging = false; }, true);
  doc.addEventListener("pointercancel", function () { dragging = false; }, true);

  /* ambient стоит при взаимодействии, возврат через 10s (06 §4) */
  var interactUntil = 0;
  doc.addEventListener("pointerdown", function () { interactUntil = performance.now() + 10000; }, true);
  doc.addEventListener("keydown", function () { interactUntil = performance.now() + 10000; }, true);

  function veinTint(vein, color) {
    /* Спокойный/reduced + след курьера: статичный тинт сегмента 1.5s */
    if (!vein || !vein.el) return;
    var el = vein.el;
    el.style.setProperty("--vein-tint", color);
    el.classList.remove("is-tinted");
    void el.offsetWidth; /* перезапуск перехода */
    el.classList.add("is-tinted");
    clearTimeout(vein.tintTimer);
    vein.tintTimer = setTimeout(function () { el.classList.remove("is-tinted"); }, 1600);
  }
  function veinBreath(vein, ms) {
    if (!vein || !vein.visible || effectiveMode() !== "full" || paused) return;
    vein.el.classList.add("is-breathing");
    setTimeout(function () { vein.el.classList.remove("is-breathing"); }, ms);
  }

  /* ── В2-курьеры: offset-path по швам (GPU, 08 §2.5) ───────────────── */
  var courierOK = window.CSS && CSS.supports &&
    CSS.supports("offset-path", 'path("M0,0 L10,10")');
  var activeCouriers = 0; /* глобально ≤3 (08 §2.4) */

  function pathLen(segs) { /* segs: [[x,y],[x,y],...] */
    var L = 0;
    for (var i = 1; i < segs.length; i++) {
      L += Math.hypot(segs[i][0] - segs[i - 1][0], segs[i][1] - segs[i - 1][1]);
    }
    return L;
  }
  function toPathD(segs) {
    return segs.map(function (p, i) {
      return (i ? "L" : "M") + p[0].toFixed(1) + "," + p[1].toFixed(1);
    }).join(" ");
  }

  function spawnCourier(vein, segs, color, ev, aggregated) {
    var mode = effectiveMode();
    if (mode !== "full" || paused || dragging || !courierOK) {
      veinTint(vein, color); /* честная деградация: статичный тинт */
      scheduleArrival(ev, color, 0);
      return null;
    }
    if (!vein || !vein.visible || vein.busy > 0 || activeCouriers >= 3) {
      /* насыщение: новый не стартует, след старшего продлевается (08 §2.4) */
      veinTint(vein, color);
      scheduleArrival(ev, color, 0);
      return null;
    }
    var len = pathLen(segs);
    var dur = Math.max(400, Math.min(1600, len / 0.6)); /* clamp(путь/600px/s) */
    var el = doc.createElement("span");
    el.className = "living-courier" + (aggregated ? " aggregated" : "");
    el.style.setProperty("offset-path", 'path("' + toPathD(segs) + '")');
    el.style.setProperty("--courier-dur", dur + "ms");
    el.style.setProperty("--courier-color", color);
    el.setAttribute("aria-hidden", "true");
    doc.body.appendChild(el);
    vein.busy++; activeCouriers++;
    el.addEventListener("animationend", function () {
      el.remove(); vein.busy--; activeCouriers--;
      veinTint(vein, color); /* след затухает 1.5s (CSS-переход) */
      scheduleArrival(ev, color, 0);
    });
    /* страховка от потерянного animationend (свернула вкладку и т.п.) */
    setTimeout(function () {
      if (el.parentNode) {
        el.remove(); vein.busy = Math.max(0, vein.busy - 1);
        activeCouriers = Math.max(0, activeCouriers - 1);
        scheduleArrival(ev, color, 0);
      }
    }, dur + 600);
    return el;
  }

  /* прибытие = вспышка Нейры (сток; 08 §0: события стекаются к администратору) */
  function scheduleArrival(ev, color, delay) {
    setTimeout(function () { neuraFlash(ev, performance.now()); }, delay);
    if (ev !== "error") hideErrorCard(); /* связь восстановилась (08 §5.3) */
  }

  /* ── маршруты (08 §2.3): узел-источник → ближайшая жила → Нейра ───── */
  function sideRowY(labelText) {
    if (!sidebar || sidebar.getBoundingClientRect().width < 40) return null;
    var rows = sidebar.querySelectorAll(".side-domain .side-label, .side-link .side-label");
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].textContent.trim() === labelText) {
        var r = rows[i].getBoundingClientRect();
        return r.top + r.height / 2;
      }
    }
    return null;
  }
  function geometry() {
    var j1r = j1.el.getBoundingClientRect();
    var nr = neuraBtn.getBoundingClientRect();
    return {
      j1y: j1r.top + 1,
      j2x: j2 ? j2.el.getBoundingClientRect().left + 1 : null,
      neuraX: nr.left + nr.width / 2,
      vh: window.innerHeight,
    };
  }
  function isOverview() { return !!doc.querySelector(".well-canvas"); } /* колодец = ткань Обзора */

  function routeEvent(ev) {
    var mode = effectiveMode();
    if (mode === "off") return null;
    var color = colorOf(ev);
    /* Правило одной ткани (08 §3.2): Обзор отыгрывает события колодцем;
     * исключение — ошибка, она дублируется всеми тканями */
    if (isOverview() && ev !== "error") { neuraFlash(ev, performance.now()); return null; }

    var g = geometry();
    if (ev === "error") {
      /* эффорент: от Нейры наружу по магистралям (08 §2.3) */
      spawnCourier(j1, [[g.neuraX, g.j1y], [g.j2x || 0, g.j1y]], color, ev, false);
      if (j2) spawnCourier(j2, [[g.j2x || 0, g.j1y], [g.j2x || 0, g.vh - 12]], color, ev, false);
      if (j3) { /* на Корее — ответвление на Ж3, затем Ж4 (08 §2.3) */
        var j3x = j3.el.getBoundingClientRect().left + 1;
        spawnCourier(j3, [[g.j2x || 0, g.j1y], [j3x, g.j1y], [j3x, g.vh - 12]], color, ev, false);
      }
      if (j4) { /* Ж4: шов Пульта — горизонтальный участок под ответвлением */
        var j4r = j4.el.getBoundingClientRect();
        spawnCourier(j4, [[j4r.left, j4r.top + 1], [j4r.right, j4r.top + 1]], color, ev, false);
      }
      return null;
    }
    var srcY = null;
    if (ev === "write") srcY = sideRowY("Память");
    if (ev === "index") srcY = sideRowY("Агенты");
    if (srcY != null && j2) {
      /* боковая строка → вверх по Ж2 → поворот на Ж1 → вправо к Нейре */
      return spawnCourier(j2, [[g.j2x, srcY], [g.j2x, g.j1y], [g.neuraX, g.j1y]], color, ev, false);
    }
    /* recall / нет сайдбара: ближайший узел на Ж1 → Нейра */
    var search = doc.querySelector(".topsearch");
    var sx = (search && !search.hidden) ? search.getBoundingClientRect().left + 40 : g.neuraX - 120;
    return spawnCourier(j1, [[Math.max(sx, 40), g.j1y], [g.neuraX, g.j1y]], color, ev, false);
  }

  /* ── агрегация 600ms, приоритет error > write > recall (08 §2.4) ──── */
  var pending = [], flushTimer = null;
  var COLOR_RANK = { error: 3, write: 2, recall: 1, index: 1 };
  var errorStreak = 0; /* v10-раунд: карточка только после 2 ошибок ПОДРЯД */
  function onBusEvent(e) {
    var ev = e.detail || {};
    if (effectiveMode() === "off") return;
    /* аноним (07k): В1 — только статус-индикатор; курьеров контентных
     * событий и В3-карточек нет (08 §0) */
    if (root.getAttribute("data-auth") === "anon") return;
    /* v10-раунд (демо-гигиена): единичная ошибка с самовосстановлением —
     * только строка ленты; карточка — после 2 ошибок ПОДРЯД (счётчик
     * сбрасывается первым успехом) */
    if (ev.ev === "error") {
      errorStreak++;
      if (errorStreak >= 2) showErrorCard();
    } else {
      errorStreak = 0;
      hideErrorCard();
    }
    if (effectiveMode() !== "full") {
      /* Спокойный: событие = мгновенный тинт + статичный цвет Нейры */
      var color = colorOf(ev.ev);
      veinTint(ev.ev === "error" ? j1 : (j2 || j1), color);
      neuraFlash(ev.ev, performance.now());
      return;
    }
    pending.push(ev);
    if (flushTimer) return;
    flushTimer = setTimeout(flushPending, 600);
  }
  function flushPending() {
    flushTimer = null;
    if (!pending.length) return;
    /* один цвет за окно: приоритет error > write > recall; ярче и хвост длиннее */
    var win = pending.slice(); pending = [];
    var best = win.reduce(function (a, b) {
      return (COLOR_RANK[b.ev] || 0) > (COLOR_RANK[a.ev] || 0) ? b : a;
    });
    var el = routeEvent(best.ev);
    if (el && win.length > 1) el.classList.add("aggregated");
  }

  /* ── ambient-планировщик: один билет — дышит одна ткань за раз ───────
   * (08 §2.2/§3.5: Нейра ⊕ жилы Ж1–Ж4 в общей ротации, фазы разнесены
   * самой очерёдностью; duty: активность 3–5s, сон 10–30s) */
  var ambientNext = performance.now() + 3000;
  var ambientRotation = 0;
  function ambientTick(now) {
    if (paused || dragging || now < interactUntil || effectiveMode() !== "full") return;
    if (now < ambientNext) return;
    var tissues = [neuraBtn, j1, j2, j3, j4].filter(Boolean);
    var pick = tissues[ambientRotation++ % tissues.length];
    /* Нейра: полный вздох — окно = период --duration-neura (8s, 08 §1.2);
     * жилы: duty 3–5s */
    var active = pick === neuraBtn ? 8000 : 3000 + Math.random() * 2000;
    if (pick === neuraBtn) { breathStart = now; breathUntil = now + active; }
    else veinBreath(pick, active);
    ambientNext = now + active + 10000 + Math.random() * 20000; /* сон 10–30s */
  }

  /* ── пауза по клику (08 §1.4): не персистится, меню нет ───────────── */
  neuraBtn.addEventListener("click", function () {
    if (effectiveMode() === "off") return; /* выключенному слою пауза не нужна */
    paused = !paused;
    neuraBtn.setAttribute("aria-pressed", paused ? "true" : "false");
    neuraBtn.title = paused ? "Живой слой на паузе — клик, чтобы вернуть" : "Клик — пауза живого слоя";
    if (paused) {
      breathUntil = 0;
      Object.keys(veins).forEach(function (k) { veins[k].el.classList.remove("is-breathing"); });
    }
  });

  /* ── В3: карточка ошибки связи (08 §5.3, правый нижний угол) ──────── */
  var errCard = null, errShownAt = 0;
  function showErrorCard() {
    if (effectiveMode() === "off") return;
    var now = Date.now();
    if (errCard && errCard.parentNode) return;      /* уже открыта */
    if (now - errShownAt < 90000) return;           /* демо: не чаще раза в 90s */
    errShownAt = now;
    errCard = doc.createElement("aside");
    errCard.className = "living-v3-card";
    errCard.setAttribute("role", "status");
    var cv = doc.createElement("canvas");
    cv.width = 96 * 2; cv.height = 96 * 2;
    cv.style.width = "96px"; cv.style.height = "96px";
    var vctx = cv.getContext("2d");
    vctx.setTransform(2, 0, 0, 2, 0, 0);
    drawNeuron(vctx, 96, TIER_V3, {
      iris: C.error, pupilR: TIER_V3.pupil, dendScale: 1, glow: 0, dotGold: false,
    });
    cv.setAttribute("aria-hidden", "true");
    errCard.appendChild(cv);
    var tx = doc.createElement("p");
    tx.className = "living-v3-text";
    tx.textContent = "Связь с памятью оборвалась. Я на месте и позову, как только она ответит.";
    errCard.appendChild(tx);
    var row = doc.createElement("div");
    row.className = "living-v3-actions";
    var ok = doc.createElement("button");
    ok.type = "button"; ok.className = "btn secondary sm"; ok.textContent = "Понятно";
    ok.addEventListener("click", hideErrorCard);
    var hosts = doc.createElement("a");
    hosts.className = "btn ghost sm"; hosts.href = "hosts.html";
    hosts.textContent = "Открыть Хосты";
    row.appendChild(ok); row.appendChild(hosts);
    errCard.appendChild(row);
    doc.body.appendChild(errCard);
    requestAnimationFrame(function () { errCard.classList.add("is-open"); });
    doc.addEventListener("keydown", v3Esc);
  }
  function v3Esc(e) {
    if (e.key === "Escape" && errCard && errCard.parentNode &&
        errCard.contains(doc.activeElement)) hideErrorCard();
  }
  function hideErrorCard() {
    if (!errCard || !errCard.parentNode) return;
    var el = errCard; errCard = null;
    doc.removeEventListener("keydown", v3Esc);
    if (effectiveMode() === "full" && !systemReduced()) {
      el.classList.remove("is-open");
      setTimeout(function () { el.remove(); }, 240);
    } else el.remove();
  }

  /* ── В3 static mount: empty-блоки (Поиск и т.п.) зовут Living.mountV3 */
  function mountV3(canvas) {
    if (!canvas || effectiveMode() === "off") {
      if (canvas) canvas.hidden = true;
      return;
    }
    canvas.width = 96 * 2; canvas.height = 96 * 2;
    canvas.style.width = "96px"; canvas.style.height = "96px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    drawNeuron(ctx, 96, TIER_V3, {
      iris: C.iris, pupilR: TIER_V3.pupil, dendScale: 1, glow: 0, dotGold: false,
    });
  }

  /* ── FPS-лестница (08 §2.5): 2s окно; <55.5 lite; <45 static ──────── */
  var raf = null, lastT = 0, frames = 0, windowStart = 0;
  var lite = false, staticMode = false, goodSince = 0, warned = false;
  function fpsCheck(now) {
    frames++;
    if (!windowStart) windowStart = now;
    if (now - windowStart < 2000) return;
    var fps = frames * 1000 / (now - windowStart);
    frames = 0; windowStart = now;
    if (!staticMode && fps < 45) {
      staticMode = true; lite = true;
      root.classList.add("living-static", "living-lite");
      if (!warned) { warned = true; console.warn("[living] fps < 45 — живой слой статичен до роста FPS"); }
      goodSince = 0;
    } else if (!staticMode && !lite && fps < 55.5) {
      lite = true;
      root.classList.add("living-lite"); /* DPR 1.5 + glow-спрайты off (CSS) */
      setNeuraSize(1.5);
      goodSince = 0;
    } else if (fps > 52) {
      if (!goodSince) goodSince = now;
      if (staticMode && now - goodSince > 4000) {
        staticMode = false; lite = false;
        root.classList.remove("living-static", "living-lite");
        setNeuraSize(2);
      } else if (lite && !staticMode && now - goodSince > 4000) {
        lite = false;
        root.classList.remove("living-lite");
        setNeuraSize(2);
      }
    } else goodSince = 0;
  }

  function frame(now) {
    raf = doc.hidden ? null : requestAnimationFrame(frame);
    if (doc.hidden) return;
    fpsCheck(now);
    if (staticMode) return; /* Нейра заменена статичным SVG (CSS) */
    ambientTick(now);
    var st = neuraState(now);
    if (st) drawNeuron(nctx, 28, TIER_V1, st);
  }
  function startLoop() {
    if (raf == null && !doc.hidden) { lastT = 0; windowStart = 0; frames = 0; raf = requestAnimationFrame(frame); }
  }
  doc.addEventListener("visibilitychange", function () {
    if (!doc.hidden) startLoop();
    else if (raf != null) { cancelAnimationFrame(raf); raf = null; }
  });

  /* статичный SVG вместо canvas при <45fps (кроссфейд — CSS, 08 §2.5);
   * v10-раунд: перекрашивается при смене темы и error-hold */
  var neuraSvg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
  neuraSvg.setAttribute("viewBox", "0 0 28 28");
  neuraSvg.setAttribute("class", "living-neura-svg");
  neuraSvg.setAttribute("aria-hidden", "true");
  neuraBtn.appendChild(neuraSvg); /* видим только в .living-static (CSS) */
  function paintStaticSvg() {
    var st = neuraState(performance.now()) || { iris: C.iris, folded: false };
    var lines = "";
    TIER_V1.dend.forEach(function (d) {
      var rad = d.a * Math.PI / 180;
      var len = d.len * (st.folded ? 0.35 : 1);
      lines += '<line x1="' + (14 + Math.cos(rad) * 13) + '" y1="' + (14 + Math.sin(rad) * 13) +
        '" x2="' + (14 + Math.cos(rad) * (13 + len)) + '" y2="' + (14 + Math.sin(rad) * (13 + len)) +
        '" stroke="' + C.membrane + '" stroke-width="1"/>';
    });
    neuraSvg.innerHTML =
      lines +
      '<circle cx="14" cy="14" r="13" fill="none" stroke="' + C.membrane + '"/>' +
      '<circle cx="14" cy="14" r="8" fill="' + st.iris + '"/>' +
      '<circle cx="14" cy="14" r="' + (st.pupilR || TIER_V1.pupil) + '" fill="' + C.pupil + '"/>';
  }
  paintStaticSvg();

  /* ── смена режима из Настроек (08 §4) ─────────────────────────────── */
  function applyMode() {
    var mode = effectiveMode();
    neuraBtn.classList.toggle("is-calm", mode === "calm");
    neuraBtn.classList.toggle("is-off-mode", mode === "off");
    /* v10-раунд: при «Выключен» кнопка не мёртвая — честно называет,
     * где слой включается (disabled не бывает: путь назад всегда, 08 §5.1) */
    if (mode === "off") {
      neuraBtn.title = "Живой слой выключен — включить в Настройках";
      neuraBtn.setAttribute("aria-label", "Живой слой выключен — включить можно в Настройках");
    } else {
      neuraBtn.title = paused ? "Живой слой на паузе — клик, чтобы вернуть" : "Клик — пауза живого слоя";
      neuraBtn.setAttribute("aria-label", "Нейра: пауза живого слоя");
    }
    if (mode !== "full") {
      breathUntil = 0; flash = null;
      Object.keys(veins).forEach(function (k) {
        veins[k].el.classList.remove("is-breathing");
      });
      doc.querySelectorAll(".living-courier").forEach(function (el) { el.remove(); });
    }
    if (mode === "off" && neuraCv.parentNode === neuraBtn) {
      /* «Выключен»: статичная точка Ø8 — статус-зона не проваливается */
      var dot = doc.createElement("span");
      dot.className = "living-dot";
      dot.setAttribute("aria-hidden", "true");
      neuraBtn.insertBefore(dot, neuraCv);
    }
    if (mode !== "off") {
      var dotEl = neuraBtn.querySelector(".living-dot");
      if (dotEl) dotEl.remove();
    }
  }
  window.addEventListener("stand:living-change", function () {
    userMode = store.get(LIVING_KEY, "full");
    if (["full", "calm", "off"].indexOf(userMode) === -1) userMode = "full";
    root.setAttribute("data-living", userMode);
    applyMode();
  });
  window.addEventListener("storage", function (e) {
    if (e.key === LIVING_KEY) {
      userMode = store.get(LIVING_KEY, "full");
      root.setAttribute("data-living", userMode);
      applyMode();
    }
  });

  /* ── шина: единственный источник событий (08 §3.1) ────────────────── */
  doc.addEventListener("stand:feed-event", onBusEvent);

  applyMode();
  startLoop();

  /* публичный минимум: В3-mount для empty-блоков + ручная вспышка (тесты) */
  window.Living = { mountV3: mountV3, flash: neuraFlash };
})();
