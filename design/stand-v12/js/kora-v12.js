/* kora-v12.js — Кора «Дирижёрская» (спека 15 §3.2, срез §8.3).
 *
 * Пульт в два крыла (вкладок нет); транскрипт-сцена с actor-rail;
 * Эфир — постоянный поток: строки появляются по событиям ЕДИНОЙ шины
 * stand:feed-event (демо-лента data.js + демо-кнопки + композер-мост).
 * task.start → вспышка строки Эфира ирис 240ms; error → красная кромка
 * + assertive. Швы Ж3/Ж4 — drag/клавиатура v7 (living.js строит жилы по
 * классам .kora-seam-side/.kora-seam-pult, движок не правится).
 */
(function () {
  "use strict";
  var doc = document;
  if (!doc.body.hasAttribute("data-screen") || doc.body.getAttribute("data-screen") !== "kora") return;

  var EV_TO_ETHER = {
    write: "записал в память",
    recall: "обратился к памяти",
    index: "переиндексация",
    "task.start": "начал задачу",
    "task.done": "завершил задачу",
    "owner.wait": "ждёт владельца",
    "owner.clear": "владелец ответил",
    error: "связь потеряна",
  };
  function fmtClock(d) {
    d = d || new Date();
    return [("0" + d.getHours()).slice(-2), ("0" + d.getMinutes()).slice(-2)].join(":");
  }
  function fmtAge(min) {
    if (min < 1) return "только что";
    if (min < 60) return min + " мин";
    return Math.round(min / 60) + " ч";
  }

  /* ── Сцена: выбранная сессия ───────────────────────────────────────── */
  var sceneName = doc.getElementById("scene-name");
  var sceneMeta = doc.getElementById("scene-meta");
  var sceneState = doc.getElementById("scene-state");
  var trList = doc.getElementById("tr-list");
  var digestName = doc.getElementById("digest-name");
  var digestSteps = doc.getElementById("digest-steps");

  function trRow(who, text, timeLabel, thought) {
    var row = doc.createElement("div");
    row.className = "tr-row is-fresh" + (thought ? " thought" : "");
    row.setAttribute("data-who", who === "вы" || who === "owner" ? "owner" : "agent");
    var body = doc.createElement("span");
    body.className = "tr-body";
    var name = doc.createElement("span");
    name.className = "tr-who";
    name.textContent = who === "вы" ? "владелец" : who;
    body.appendChild(name);
    body.appendChild(doc.createTextNode(" " + text));
    var time = doc.createElement("span");
    time.className = "tr-time";
    time.textContent = timeLabel;
    /* grid: rail рисуется ::before (первый трек 3px) | body | time */
    row.appendChild(body);
    row.appendChild(time);
    return row;
  }
  function renderSession(sess, skeleton) {
    if (!sess || !trList) return;
    trList.setAttribute("aria-busy", "true");
    trList.innerHTML = "";
    if (skeleton) {
      var sk = doc.createElement("div");
      sk.className = "tr-skeleton";
      for (var i = 0; i < 3; i++) {
        var r = doc.createElement("div");
        r.className = "skel-row";
        sk.appendChild(r);
      }
      trList.appendChild(sk);
    }
    var paint = function () {
      trList.innerHTML = "";
      sess.transcript.forEach(function (t) {
        var thought = /^записал в память/.test(t.text);
        var clock = fmtClock(new Date(Date.now() - (sess.lastActivityMinAgo + t.minFromStart) * 60000));
        trList.appendChild(trRow(t.who, t.text, clock, thought));
      });
      trList.removeAttribute("aria-busy");
      if (sceneName) sceneName.textContent = sess.name;
      if (sceneMeta) sceneMeta.textContent = sess.host + " · агент " + sess.agent + " · " + fmtAge(sess.startedMinAgo);
      if (sceneState) {
        sceneState.textContent = sess.state === "live" ? "идёт" : "завершена";
        sceneState.setAttribute("data-state", sess.state);
      }
      if (digestName) digestName.textContent = sess.name + " · " + sess.agent;
      if (digestSteps) {
        digestSteps.innerHTML = "";
        (sess.digest && sess.digest.steps || []).forEach(function (s) {
          var li = doc.createElement("li");
          li.textContent = s;
          digestSteps.appendChild(li);
        });
      }
      currentSession = sess;
    };
    if (skeleton) setTimeout(paint, 300); else paint();
  }

  var sessions = (window.STAND && window.STAND.koraSessions) || [];
  var currentSession = null;

  /* ── Эфир: постоянный поток (Крыло-2) ──────────────────────────────── */
  var etherList = doc.getElementById("ether-list");
  var etherEmpty = doc.getElementById("ether-empty");
  function etherRow(o) {
    /* o: {kind, who, action, sessId?, time, errorText?} */
    var row = doc.createElement(o.sessId ? "button" : "div");
    row.type = o.sessId ? "button" : undefined;
    row.className = "ether-row" + (o.sessId ? "" : " plain");
    row.setAttribute("data-kind", o.kind);
    if (o.errorText) row.setAttribute("aria-live", "assertive"); /* 4.1.3 */
    var tx = doc.createElement("span");
    tx.className = "ether-text";
    var strong = doc.createElement("strong");
    strong.textContent = o.who;
    tx.appendChild(strong);
    tx.appendChild(doc.createTextNode(" · " + (o.errorText || o.action)));
    var tm = doc.createElement("span");
    tm.className = "ether-time";
    tm.textContent = o.time;
    row.appendChild(tx);
    row.appendChild(tm);
    if (o.sessId) row.addEventListener("click", function () {
      var sess = sessions.filter(function (s) { return s.id === o.sessId; })[0];
      if (sess) renderSession(sess, true);
    });
    return row;
  }
  function etherPush(row, flash) {
    if (!etherList) return;
    if (etherEmpty) etherEmpty.hidden = true;
    etherList.insertBefore(row, etherList.firstChild);
    while (etherList.children.length > 24) etherList.lastElementChild.remove();
    if (flash) {
      row.classList.add("is-flash");
      row.addEventListener("animationend", function () { row.classList.remove("is-flash"); }, { once: true });
    }
  }
  /* seed: последняя активность хостов (фикстуры koraEther) */
  function seedEther() {
    if (!etherList || !window.STAND) return;
    var ether = window.STAND.koraEther || [];
    ether.slice().reverse().forEach(function (e) {
      var time = e.signal ? fmtClock(new Date()) : fmtAge(e.ageMinAgo);
      etherPush(etherRow({
        kind: e.kind,
        who: e.who,
        action: e.action,
        sessId: e.kind === "write" && e.host === "laptop-go-1" ? "sess-41a2" : null,
        time: time,
        errorText: e.signal ? e.text : null,
      }), false);
    });
  }

  /* ── Шина: Эфир питается только событиями (закон честного света) ───── */
  doc.addEventListener("stand:feed-event", function (e) {
    var d = e.detail || {};
    var ev = d.ev || "";
    var who = d.who || (ev === "write" ? "agb" : "core");
    var action = EV_TO_ETHER[ev] || ev;
    var row = etherRow({
      kind: ev === "error" ? "error" : (ev === "write" || ev === "task.done") ? "write" : ev === "task.start" ? "recall" : "index",
      who: who,
      action: action + (d.mem ? " · " + d.mem : ""),
      sessId: (ev === "write" || ev === "task.start") ? (currentSession && currentSession.id) : null,
      time: fmtClock(),
      errorText: ev === "error" ? (d.text || "связь потеряна") : null,
    });
    /* вспышка ирис 240ms — класс события task.start (§3.2) */
    etherPush(row, ev === "task.start" || ev === "owner.wait");

    /* сцена: write от активной сессии дописывает строку агента; ошибка —
     * строку ошибки (rail красный, имя дублирует) */
    if (trList && currentSession) {
      if (ev === "write") {
        trList.appendChild(trRow(currentSession.agent, (d.text || "записал в память"), fmtClock(), /^записал/.test(d.text || "")));
        trList.scrollTop = trList.scrollHeight;
      } else if (ev === "error") {
        var erow = trRow(currentSession.agent, "связь потеряна: " + (d.text || "повторная попытка"), fmtClock(), false);
        erow.setAttribute("data-ev", "error");
        trList.appendChild(erow);
      }
    }

    /* Пульт: бейдж «ждут владельца» — состояние данных (v11 14 §2.3:
     * living.js вешает курьер owner.wait от #pult-badge, пока не hidden) */
    if (pultBadge) {
      if (ev === "owner.wait") {
        waitCount++;
        pultBadge.hidden = false;
        pultBadgeCount.textContent = String(waitCount);
      } else if (ev === "owner.clear") {
        waitCount = 0;
        pultBadge.hidden = true;
      }
    }
  });

  var pultBadge = doc.getElementById("pult-badge");
  var pultBadgeCount = doc.getElementById("pult-badge-count");
  var waitCount = 0;
  if (pultBadge) pultBadge.hidden = true;

  /* ── Композер-мост: отправка = событие шины (владелец пишет агенту) ── */
  var composerForm = doc.getElementById("composer-form");
  var composerInput = doc.getElementById("composer-input");
  if (composerForm && composerInput) {
    composerForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var text = composerInput.value.trim();
      if (!text) return;
      composerInput.value = "";
      if (trList && currentSession) {
        trList.appendChild(trRow("вы", text, fmtClock(), false));
        trList.scrollTop = trList.scrollHeight;
      }
      doc.dispatchEvent(new CustomEvent("stand:feed-event", {
        detail: { ev: "write", mem: null, text: "владелец → " + (currentSession ? currentSession.agent : "агент") + ": " + text, who: "owner", srv: "mnemos-01", at: Date.now() },
      }));
    });
  }

  /* ── «Дать задачу» (CTA пустого Эфира) — publish task.start ────────── */
  doc.querySelectorAll("[data-give-task]").forEach(function (b) {
    b.addEventListener("click", function () {
      doc.dispatchEvent(new CustomEvent("stand:feed-event", {
        detail: { ev: "task.start", mem: null, text: "владелец дал задачу «Утренний прогон»", who: "owner", srv: "mnemos-01", at: Date.now() },
      }));
    });
  });

  /* ── Швы Ж3/Ж4: drag + клавиатура (v7-механика, зона ≥24px) ────────── */
  var grid = doc.querySelector(".kora-grid");
  function seamDrag(seam, axis) {
    if (!seam || !grid) return;
    var start = 0, base = 0;
    function clampPx(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
    function apply(px) {
      if (axis === "x") grid.style.setProperty("--ether-w", clampPx(px, 280, 520) + "px");
      else grid.style.setProperty("--pult-h", clampPx(px, 140, 320) + "px");
    }
    seam.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      seam.setPointerCapture(e.pointerId);
      start = axis === "x" ? e.clientX : e.clientY;
      base = axis === "x"
        ? grid.getBoundingClientRect().right - seam.getBoundingClientRect().left - 12
        : grid.getBoundingClientRect().bottom - seam.getBoundingClientRect().top - 12;
      doc.body.classList.add("seam-grab", "seam-dragging");
    });
    seam.addEventListener("pointermove", function (e) {
      if (!seam.hasPointerCapture || !seam.hasPointerCapture(e.pointerId)) return;
      var now = axis === "x" ? e.clientX : e.clientY;
      var gridRect = grid.getBoundingClientRect();
      var px = axis === "x"
        ? gridRect.right - (now - start + base)
        : gridRect.bottom - (now - start + base);
      apply(px);
    });
    function drop(e) {
      if (!seam.hasPointerCapture || !seam.hasPointerCapture(e.pointerId)) return;
      seam.releasePointerCapture(e.pointerId);
      doc.body.classList.remove("seam-grab", "seam-dragging");
    }
    seam.addEventListener("pointerup", drop);
    seam.addEventListener("pointercancel", drop);
    /* клавиатура: ±24px (2.1.1) */
    seam.addEventListener("keydown", function (e) {
      var cur = axis === "x"
        ? parseFloat(getComputedStyle(grid).getPropertyValue("--ether-w"))
        : parseFloat(getComputedStyle(grid).getPropertyValue("--pult-h"));
      var step = 0;
      if (axis === "x") {
        if (e.key === "ArrowLeft") step = 24;
        if (e.key === "ArrowRight") step = -24;
      } else {
        if (e.key === "ArrowUp") step = 24;
        if (e.key === "ArrowDown") step = -24;
      }
      if (!step) return;
      e.preventDefault();
      apply(cur + step);
    });
  }
  seamDrag(doc.getElementById("seam-side"), "x");
  seamDrag(doc.getElementById("seam-pult"), "y");

  /* ── Старт: сессия + seed Эфира (после data.js) ────────────────────── */
  function init() {
    if (sessions.length) renderSession(sessions[0], false);
    seedEther();
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init);
  else init();
})();
