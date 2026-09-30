/* hosts-v12.js — Хосты «ростер машин» (ME-061 доводка, P0-2).
 *
 * Единственный источник — фикстура STAND.hosts (data.js): ростер честный,
 * без выдуманных строк. Карточка несёт словарь 07a: «состояние · возраст ·
 * действие»; счётчики — из tech/recent. Пустой список — качественный
 * empty-state («Хостов нет» + что делает владелец дальше), не заглушка. */
(function () {
  "use strict";
  var doc = document;
  if (!doc.body.hasAttribute("data-screen") || doc.body.getAttribute("data-screen") !== "hosts") return;

  var LIFECYCLE_RU = {
    online: "на связи",
    silent: "молчит",
    off: "выключен",
    provisioning: "ставится",
    failed: "ошибка",
  };

  function el(tag, cls, text) {
    var n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function statCell(value, label) {
    var s = el("span", "stat");
    s.appendChild(el("b", null, value));
    s.appendChild(doc.createTextNode(" " + label));
    return s;
  }

  function recentList(host) {
    var ul = el("ul", "host-recent");
    (host.recent || []).slice(0, 2).forEach(function (r) {
      var li = el("li");
      var t = el("span", "ev-time", r.time);
      li.appendChild(t);
      li.appendChild(el("span", null, r.text));
      ul.appendChild(li);
    });
    if (!ul.children.length) {
      var li = el("li");
      li.appendChild(el("span", null, "событий пока нет — машина только ставится"));
      ul.appendChild(li);
    }
    return ul;
  }

  function hostCard(host) {
    var card = el("article", "host-card");
    card.dataset.lifecycle = host.lifecycle || "off";

    var head = el("div", "host-head");
    head.appendChild(el("span", "vital-dot"));
    head.appendChild(el("span", "host-name", host.name));
    head.appendChild(el("span", "host-state", LIFECYCLE_RU[host.lifecycle] || host.lifecycle));
    card.appendChild(head);

    card.appendChild(el("p", "host-status", host.statusLine || ""));
    if (host.statusNote) card.appendChild(el("p", "host-note", host.statusNote));
    if (host.busyLine) card.appendChild(el("p", "host-busy", host.busyLine));

    var stats = el("div", "host-stats");
    var tech = host.tech || {};
    stats.appendChild(statCell(host.harness ? host.harness + " " + (tech.harnessVer || "") : "—", "harness"));
    stats.appendChild(statCell(String((host.agents || []).length), host.agents && host.agents.length === 1 ? "агент" : "агентов"));
    stats.appendChild(statCell(String(host.tasksActive || 0), host.tasksActive === 1 ? "задача" : "задачи"));
    if (tech.reports) stats.appendChild(statCell(tech.reports.split(" ")[0] || "0", tech.reports.indexOf("доклад") >= 0 ? "докл." : "отч."));
    card.appendChild(stats);

    card.appendChild(recentList(host));

    if (tech.id && tech.registered) {
      card.appendChild(el("p", "host-tech", tech.id + " · " + tech.registered));
    }
    return card;
  }

  function render() {
    var roster = doc.getElementById("roster");
    if (!roster) return;
    var hosts = (window.STAND && window.STAND.hosts) || [];
    var summary = doc.getElementById("hosts-summary");
    if (summary) {
      summary.textContent = "";
      var online = hosts.filter(function (h) { return h.lifecycle === "online"; }).length;
      var warn = hosts.filter(function (h) { return h.lifecycle === "silent"; }).length;
      [["sum-n", String(hosts.length), hosts.length === 1 ? "машина" : "машин"],
       ["sum-ok", String(online), "на связи"],
       ["sum-warn", String(warn), "требуют внимания"]].forEach(function (row) {
        var s = el("span", row[0]);
        s.appendChild(el("b", "sum-n", row[1]));
        s.appendChild(doc.createTextNode(" " + row[2]));
        summary.appendChild(s);
      });
    }
    roster.textContent = "";
    if (!hosts.length) {
      var empty = el("div", "roster-empty");
      empty.appendChild(el("strong", null, "Хостов нет: машины ещё не регистрировались."));
      empty.appendChild(el("span", null,
        "Зарегистрируйте машину по токену регистрации — она появится здесь с первой строкой состояния."));
      var cta = el("a", "btn secondary sm", "Как подключить машину");
      cta.href = "settings.html";
      empty.appendChild(cta);
      roster.appendChild(empty);
      return;
    }
    hosts.forEach(function (h) { roster.appendChild(hostCard(h)); });
  }

  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", render);
  else render();
})();
