/* auth.js — «Живая кора» stand v6: public sign-in page (spec 07k §4).
 * Outside the Shell: own theme toggle (same store contract as pair.js).
 * Session model key: "vesmaro.authSession" (07k §5.1) — written here,
 * read by shell.js on every Shell page. Handoff toast key:
 * "stand-auth-handoff" — read by shell.js after the redirect, so the
 * «Вы вошли» toast survives navigation (07k §4.2).
 * Honest stand: any name + password succeed; no network latency is
 * simulated — the loading state lives for two frames, then we redirect. */
(function () {
  "use strict";

  var doc = document;
  var root = doc.documentElement;
  var HANDOFF = "stand-auth-handoff";
  var AUTH_KEY = "vesmaro.authSession";

  /* ── store + theme: same contract as shell.js / pair.js ─────────────── */
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

  /* ── session + return (07k §4.2, §5.1) ──────────────────────────────── */
  function readSession() {
    try {
      var s = JSON.parse(localStorage.getItem(AUTH_KEY) || "null");
      return s && s.user ? s : null;
    } catch (e) {
      return null;
    }
  }
  function writeSession(user) {
    try {
      localStorage.setItem(
        AUTH_KEY,
        JSON.stringify({ user: user, role: "owner", since: new Date().toISOString() })
      );
    } catch (e) { /* file:// — the stand still works */ }
  }
  function handoff(text) {
    try { sessionStorage.setItem(HANDOFF, text); } catch (e) {}
  }
  /* returnTo is honest: only relative stand pages, own query allowed
   * (07k §9 — «?return= хранит только путь, не содержимое») */
  function returnTo() {
    var r = "";
    try { r = new URLSearchParams(window.location.search).get("return") || ""; } catch (e) {}
    return /^[A-Za-z0-9._~-]+\.html(\?.*)?$/.test(r) ? r : "index.html";
  }

  /* already signed in → honest redirect, not a duplicate form (07k §4.2) */
  var existing = readSession();
  if (existing) {
    handoff("Вы уже вошли: " + existing.user);
    window.location.replace(returnTo());
    return;
  }

  /* ── footer status line (07k §1.3): one source STAND.version ────────── */
  (function () {
    var line = doc.querySelector("[data-stand-version-line]");
    if (!line) return;
    var D = window.STAND || {};
    line.textContent = "vesmaro-eyes " + (D.version || "?") + " · аноним";
    line.title = "Стенд дизайна, срез " + (D.slice || "v6") + " · демо-данные";
  })();

  /* ── tabs «Вход | Регистрация» (07k §4.1): URL-first ?tab= ──────────── */
  var tabs = [doc.getElementById("tab-login"), doc.getElementById("tab-register")];
  var panels = {};
  tabs.forEach(function (t) {
    panels[t.id] = doc.getElementById(t.getAttribute("aria-controls"));
  });
  function syncTabUrl(tab) {
    try {
      var u = new URL(window.location.href);
      if (tab.id === "tab-register") u.searchParams.set("tab", "register");
      else u.searchParams.delete("tab");
      window.history.replaceState(null, "", u);
    } catch (e) { /* file:// */ }
  }
  function selectTab(tab, focusInput) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on ? 0 : -1;
      panels[t.id].hidden = !on;
    });
    /* 150ms fade; restart the animation so repeat switches still run */
    var p = panels[tab.id];
    p.classList.remove("auth-panel-in");
    void p.offsetWidth;
    p.classList.add("auth-panel-in");
    if (focusInput) {
      var first = p.querySelector("input");
      if (first) first.focus();
    }
  }
  tabs.forEach(function (t, i) {
    t.addEventListener("click", function () {
      selectTab(t, true);
      syncTabUrl(t);
    });
    t.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      var next = e.key === "ArrowRight" ? (i + 1) % tabs.length : (i - 1 + tabs.length) % tabs.length;
      tabs[next].focus();
      selectTab(tabs[next], true);
      syncTabUrl(tabs[next]);
    });
  });
  /* deep link ?tab=register (from the gate / topbar): open + focus the form.
   * Plain arrival keeps focus where it is — public entry, we don't steal it
   * (same rule as pair.js). */
  (function () {
    var wantRegister = false;
    try { wantRegister = new URLSearchParams(window.location.search).get("tab") === "register"; } catch (e) {}
    if (wantRegister) {
      selectTab(tabs[1], true);
      syncTabUrl(tabs[1]);
    }
  })();

  /* ── показать пароль (07k §4.4): 24px target, aria-pressed + label ──── */
  doc.querySelectorAll(".pass-eye").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var wrap = btn.closest(".pass-wrap");
      var input = wrap && wrap.querySelector("input");
      if (!input) return;
      var show = btn.getAttribute("aria-pressed") !== "true";
      btn.setAttribute("aria-pressed", show ? "true" : "false");
      btn.setAttribute("aria-label", show ? "Скрыть пароль" : "Показать пароль");
      input.type = show ? "text" : "password";
      input.focus();
    });
  });

  /* ── fields: live validation after the first blur (05 §2.5) ─────────── */
  function errEl(input) {
    var f = input.closest(".field");
    return f ? f.querySelector(".field-error") : null;
  }
  function setErr(input, message) {
    var err = errEl(input);
    if (err) {
      if (message) err.textContent = message;
      err.hidden = !message;
    }
    input.setAttribute("aria-invalid", message ? "true" : "false");
    return !message;
  }
  function wireLive(input, validate) {
    input.addEventListener("blur", function () {
      input.dataset.touched = "1";
      validate();
    });
    input.addEventListener("input", function () {
      if (input.dataset.touched) validate();
    });
  }

  var loginName = doc.getElementById("login-name");
  var loginPass = doc.getElementById("login-pass");
  var regName = doc.getElementById("reg-name");
  var regPass = doc.getElementById("reg-pass");
  var regPass2 = doc.getElementById("reg-pass2");

  function vLoginName() {
    return setErr(loginName, loginName.value.trim() ? "" : "Введите имя");
  }
  function vLoginPass() {
    return setErr(loginPass, loginPass.value ? "" : "Введите пароль");
  }
  function vRegName() {
    var v = regName.value.trim();
    if (!v) return setErr(regName, "Введите имя");
    if (v.length < 2) return setErr(regName, "Имя короче двух символов — придумайте подлиннее");
    return setErr(regName, "");
  }
  function vRegPass() {
    return setErr(regPass, regPass.value ? "" : "Введите пароль");
  }
  function vRegPass2() {
    if (!regPass2.value) return setErr(regPass2, "Введите пароль ещё раз");
    if (regPass2.value !== regPass.value) return setErr(regPass2, "Пароли не совпадают — проверьте второе поле");
    return setErr(regPass2, "");
  }
  wireLive(loginName, vLoginName);
  wireLive(loginPass, vLoginPass);
  wireLive(regName, vRegName);
  wireLive(regPass, vRegPass);
  wireLive(regPass2, vRegPass2);

  /* ── verdicts (07k §4.2): inline, polite, «Ошибка:» prefix, not a toast */
  function showVerdict(box, titleEl, text, hint) {
    titleEl.textContent = text;
    if (hint) {
      var h = box.querySelector(".verdict-hint");
      if (h) h.textContent = hint;
    }
    box.hidden = false;
  }

  /* ── loading state: honest, two frames, no simulated latency ────────── */
  function submitAs(btn, label, fn) {
    if (btn.dataset.busy) return;
    btn.dataset.busy = "1";
    btn.disabled = true;
    var spin = btn.querySelector(".spinner");
    var lab = btn.querySelector(".submit-label");
    if (spin) spin.hidden = false;
    if (lab) lab.textContent = label;
    /* rAF ×2: let the loading state actually paint once, then redirect */
    requestAnimationFrame(function () {
      requestAnimationFrame(fn);
    });
  }

  /* ── demo phases (07k §4.2): arm a failure for the next submit ──────── */
  var armed = { loginFail: false, nameTaken: false };
  doc.querySelectorAll("[data-demo-phase]").forEach(function (b) {
    b.addEventListener("click", function () {
      var k = b.dataset.demoPhase;
      if (k === "login-fail") {
        armed.loginFail = !armed.loginFail;
        b.setAttribute("aria-pressed", armed.loginFail ? "true" : "false");
      } else if (k === "name-taken") {
        armed.nameTaken = !armed.nameTaken;
        b.setAttribute("aria-pressed", armed.nameTaken ? "true" : "false");
      }
    });
  });

  /* ── outcomes (07b §5 canon: typed → human, what-to-check inline) ───── */
  doc.getElementById("login-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var okN = vLoginName();
    var okP = vLoginPass();
    if (!okN) { loginName.focus(); return; }
    if (!okP) { loginPass.focus(); return; }
    var verdict = doc.getElementById("login-verdict");
    var verdictTitle = doc.getElementById("login-verdict-title");
    if (armed.loginFail) {
      armed.loginFail = false;
      var fb = doc.querySelector('[data-demo-phase="login-fail"]');
      if (fb) fb.setAttribute("aria-pressed", "false");
      showVerdict(verdict, verdictTitle, "Ошибка: Неверное имя или пароль");
      loginName.focus();
      loginName.select();
      return;
    }
    var user = loginName.value.trim();
    submitAs(doc.getElementById("login-submit"), "Входим…", function () {
      writeSession(user);
      handoff("Вы вошли: " + user);
      window.location.replace(returnTo());
    });
  });

  doc.getElementById("register-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var okN = vRegName();
    var okP = vRegPass();
    var okP2 = vRegPass2();
    if (!okN) { regName.focus(); return; }
    if (!okP) { regPass.focus(); return; }
    if (!okP2) { regPass2.focus(); return; }
    var verdict = doc.getElementById("reg-verdict");
    var verdictTitle = doc.getElementById("reg-verdict-title");
    if (armed.nameTaken) {
      armed.nameTaken = false;
      var tb = doc.querySelector('[data-demo-phase="name-taken"]');
      if (tb) tb.setAttribute("aria-pressed", "false");
      showVerdict(verdict, verdictTitle, "Ошибка: Аккаунт создать не удалось", "Такое имя уже есть. Возьмите другое");
      regName.focus();
      regName.select();
      return;
    }
    var user = regName.value.trim();
    submitAs(doc.getElementById("reg-submit"), "Создаём…", function () {
      /* первый созданный аккаунт становится владельцем борта (07k §4.1) */
      writeSession(user);
      handoff("Аккаунт создан. Вы вошли: " + user);
      window.location.replace(returnTo());
    });
  });
})();
