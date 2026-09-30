/* wow-v12.js — трейлер: живые превью в карточках-тактах (P1-5, доводка ME-061).
 *
 * Каждый такт получает мини-кадр канваса («мини-колодец»): та же морфология,
 * что в продукте — узлы-ирисы, миелиновые рёбра, импульс словаря события.
 * Первый кадр рисуется СИНХРОННО (урок P0-1: headless-скриншот исполняет
 * один rAF), затем один общий rAF-цикл на страницу анимирует импульсы.
 * Цвета — только токены; reduced — статичный кадр. */
(function () {
  "use strict";
  var doc = document;
  if (!doc.body.hasAttribute("data-wow-feed")) return;

  function v(name, fallback) {
    var val = getComputedStyle(doc.documentElement).getPropertyValue(name).trim();
    return val || fallback;
  }
  var C = {
    iris: v("--color-iris", "#1a8a96"),
    irisBright: v("--color-iris-bright", "#4fc2ce"),
    gold: v("--synapse-write", "#c9933a"),
    idle: v("--synapse-idle", "rgba(122,138,158,0.35)"),
    myelin: v("--myelin-strong", "rgba(230,237,243,0.14)"),
    bg: v("--color-well-canvas", "#090b0f"),
  };

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    doc.documentElement.getAttribute("data-motion") === "reduced";

  /* узел: ядро-ирис + мягкий гало (lighter) */
  function node(ctx, x, y, r, core, glow) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    var g = ctx.createRadialGradient(x, y, 0, x, y, r * 5);
    g.addColorStop(0, core);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = glow;
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r * 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.fillStyle = core;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  function edge(ctx, x1, y1, x2, y2) {
    ctx.strokeStyle = C.idle;
    ctx.lineWidth = 1.25;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  function pulse(ctx, x, y, color) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    var g = ctx.createRadialGradient(x, y, 0, x, y, 12);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill();
  }
  function ring(ctx, x, y, r, color, a) {
    ctx.globalAlpha = a;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  var lerp = function (a, b, k) { return a + (b - a) * k; };

  /* ── сцены: event | done | attention ─────────────────────────────── */
  function sceneEvent(ctx, w, h, t) {
    var N = [[0.14, 0.62], [0.4, 0.3], [0.66, 0.66], [0.88, 0.34]].map(function (p) {
      return [p[0] * w, p[1] * h];
    });
    edge(ctx, N[0][0], N[0][1], N[1][0], N[1][1]);
    edge(ctx, N[1][0], N[1][1], N[2][0], N[2][1]);
    edge(ctx, N[2][0], N[2][1], N[3][0], N[3][1]);
    edge(ctx, N[1][0], N[1][1], N[3][0], N[3][1]);
    var k = (t / 1600) % 1; /* импульс идёт по маршруту 0→1→2 */
    var seg = Math.min(2, Math.floor(k * 3)), sk = (k * 3) % 1;
    var px = lerp(N[seg][0], N[seg + 1][0], sk), py = lerp(N[seg][1], N[seg + 1][1], sk);
    pulse(ctx, px, py, C.irisBright);
    node(ctx, N[0][0], N[0][1], 3, C.iris, 0.16);
    node(ctx, N[1][0], N[1][1], 3.4, C.iris, 0.16);
    node(ctx, N[2][0], N[2][1], 2.8, C.iris, 0.16);
    node(ctx, N[3][0], N[3][1], 3.2, C.iris, 0.16);
  }
  function sceneDone(ctx, w, h, t) {
    var cx = w * 0.5, cy = h * 0.52;
    edge(ctx, w * 0.14, h * 0.3, cx, cy);
    edge(ctx, cx, cy, w * 0.86, h * 0.34);
    edge(ctx, w * 0.2, h * 0.82, cx, cy);
    edge(ctx, cx, cy, w * 0.8, h * 0.78);
    var k = (t / 1600) % 1;
    ring(ctx, cx, cy, 10 + 26 * k, C.gold, 0.85 * (1 - k));
    node(ctx, w * 0.14, h * 0.3, 2.6, C.iris, 0.12);
    node(ctx, w * 0.86, h * 0.34, 2.6, C.iris, 0.12);
    node(ctx, w * 0.2, h * 0.82, 2.4, C.iris, 0.12);
    node(ctx, w * 0.8, h * 0.78, 2.4, C.iris, 0.12);
    node(ctx, cx, cy, 4.6, C.gold, 0.3); /* запись — золото уверенности */
  }
  function sceneAttention(ctx, w, h, t) {
    var cx = w * 0.5, cy = h * 0.52;
    edge(ctx, w * 0.12, h * 0.5, cx, cy);
    edge(ctx, cx, cy, w * 0.88, h * 0.5);
    var k = (t / 1600) % 1;
    /* двойной удар: кольца со сдвигом фазы 0.18 — «постучали дважды» */
    ring(ctx, cx, cy, 9 + 22 * k, C.gold, 0.8 * Math.max(0, 1 - k));
    var k2 = (k + 0.82) % 1;
    ring(ctx, cx, cy, 9 + 22 * k2, C.gold, 0.8 * Math.max(0, 1 - k2));
    node(ctx, w * 0.12, h * 0.5, 2.6, C.iris, 0.12);
    node(ctx, w * 0.88, h * 0.5, 2.6, C.iris, 0.12);
    node(ctx, cx, cy, 5, C.iris, 0.22);
    ctx.fillStyle = C.bg; /* расширенный зрачок ожидания (14 §1.4) */
    ctx.beginPath(); ctx.arc(cx, cy, 2.2, 0, Math.PI * 2); ctx.fill();
  }
  var SCENES = { event: sceneEvent, done: sceneDone, attention: sceneAttention };

  /* ── монтаж: канвас в каждый такт ─────────────────────────────────── */
  var shots = [];
  doc.querySelectorAll(".wow-beat").forEach(function (beat) {
    var kind = beat.getAttribute("data-kind") || "event";
    var draw = SCENES[kind] || sceneEvent;
    var cv = doc.createElement("canvas");
    cv.className = "wow-shot";
    cv.setAttribute("aria-hidden", "true");
    var w = 300, h = 96;
    cv.width = w * 2; cv.height = h * 2;
    beat.insertBefore(cv, beat.querySelector(".wow-beat-text"));
    var ctx = cv.getContext("2d");
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    var paint = function (t) {
      ctx.clearRect(0, 0, w, h);
      draw(ctx, w, h, t);
    };
    paint(400); /* синхронный первый кадр (не ждём rAF) */
    shots.push(paint);
  });

  if (!reduced && shots.length) {
    var raf = null;
    var loop = function (now) {
      raf = doc.hidden ? null : requestAnimationFrame(loop);
      if (doc.hidden) return;
      shots.forEach(function (p) { p(now % 100000); });
    };
    raf = requestAnimationFrame(loop);
    doc.addEventListener("visibilitychange", function () {
      if (!doc.hidden && raf == null) raf = requestAnimationFrame(loop);
    });
  }
})();
