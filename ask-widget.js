/* ============================================================
   TARA ROSE LADIES SALON — the dashboard's question widget
   ask-widget.js
   ============================================================

   Ported from the Wellness Voucher pack's cheat-sheet widget, 24 Sep 2026.
   A button in the corner, a panel, a question, an answer, and the line from
   the page that the answer came from.

   The grounding trick, and it is the whole point: what the model is sent is the
   open page itself, read out of the live DOM at ask time. The view's text and
   tables, the numbers behind its charts, and the Branch and Period she has
   picked. So the widget cannot drift from the screen, because it holds no other
   copy of the numbers. Change the filters and the answers change with them.

   The other pages are sent as names only, so the model can say "that is on Team
   Performance" rather than guess at a page it cannot see.

   The endpoint is supabase/functions/dashboard-ask, on the same project as
   dashboard.js (SUPA_URL / SUPA_KEY). The publishable key is public by design.
   ============================================================ */
(function () {
  "use strict";

  var BASE_URL = (typeof SUPA_URL !== "undefined") ? SUPA_URL : "https://gvijxenafoowajqktqvd.supabase.co";
  var ANON_KEY = (typeof SUPA_KEY !== "undefined") ? SUPA_KEY : "";
  var ENDPOINT = BASE_URL + "/functions/v1/dashboard-ask";
  var MAX_PAGE_CHARS = 150000;

  // Tappable starters, per view. The placeholder alone reads like a question
  // somebody already typed, so people press Ask on grey text and nothing happens.
  var STARTERS = {
    dashboard:  ["Which branch is furthest behind target?", "What is the rebooking rate?", "What should we fix first?"],
    branchperf: ["Who has the highest net take at Khalifa City?", "Which branch has the most new clients?", "Who sold the most retail?"],
    compare:    ["Which branch grew the most?", "How does this period compare to the last?"],
    team:       ["Who has the best rebooking rate?", "Who is below target?"],
    services:   ["What is the top service by revenue?", "Which treatment sells most?"],
    clients:    ["Who is the top client this period?", "How much did the top 10 spend?"],
    _default:   ["What does this page show?", "What stands out on this page?"]
  };

  function currentView() {
    return (typeof CURRENT_VIEW === "string" && CURRENT_VIEW) ? CURRENT_VIEW : "dashboard";
  }

  function clean(s) {
    return String(s || "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  // Readable text of the open view. innerText, not textContent, because it keeps
  // table rows on their own lines and skips anything display:none, which is how
  // a collapsed section stays out. The widget sits outside every view, so its
  // own past answers are never read back as if they were figures on the page.
  function textOf(node) {
    return node ? clean(node.innerText) : "";
  }

  // Charts are canvases, so their numbers are invisible to innerText. Chart.js
  // still holds them, so they are read out of the chart objects: labels, then
  // each series. Only charts inside the open view that are actually showing.
  function chartsIn(view) {
    if (typeof Chart === "undefined" || !Chart.instances) return "";
    var out = [];
    Object.keys(Chart.instances).forEach(function (k) {
      var c = Chart.instances[k];
      if (!c || !c.canvas || !view.contains(c.canvas) || !c.canvas.offsetParent) return;
      var d = c.data || {};
      var labels = (d.labels || []).map(String);
      var card = c.canvas.closest("section, .card, .panel, [class*='card']");
      var h = card && card.querySelector("h1, h2, h3, h4, .card-title, .sec-title");
      var title = c.canvas.getAttribute("aria-label") ||
                  (c.options && c.options.plugins && c.options.plugins.title && c.options.plugins.title.text) ||
                  (h && h.textContent.trim()) || ("Chart " + (out.length + 1));
      var lines = ["Chart: " + title];
      (d.datasets || []).forEach(function (ds) {
        var vals = (ds.data || []).map(function (v, i) {
          var val = (v && typeof v === "object") ? (v.y != null ? v.y : JSON.stringify(v)) : v;
          return (labels[i] != null ? labels[i] + " " : "") + val;
        });
        lines.push("  " + (ds.label || "Series") + ": " + vals.join(", "));
      });
      out.push(lines.join("\n"));
    });
    return out.join("\n\n");
  }

  function pressed(id) {
    var el = document.getElementById(id);
    if (!el) return "";
    return [].map.call(el.querySelectorAll('[aria-pressed="true"]'), function (b) {
      return b.textContent.trim();
    }).join(", ");
  }

  function filtersLine() {
    var wrap = document.getElementById("filtersWrap");
    if (!wrap || wrap.style.display === "none") return "This page has no Branch or Period filter; it keeps its own window.";
    var lines = [];
    var b = pressed("branchChips"); if (b) lines.push("Branch: " + b);
    var p = pressed("periodChips"); if (p) lines.push("Period: " + p);
    ["customDates", "monthPick", "yearPick"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && !el.hidden) {
        var vals = [].map.call(el.querySelectorAll("input, select"), function (i) {
          return i.tagName === "SELECT" ? (i.options[i.selectedIndex] || {}).text : i.value;
        }).filter(Boolean).join(" to ");
        var echo = document.getElementById("dateEcho");
        lines.push("Dates: " + ((id === "customDates" && echo && echo.textContent.trim()) || vals));
      }
    });
    var note = document.getElementById("filterNote");
    if (note && !note.hidden && note.textContent.trim()) lines.push("Filter note: " + note.textContent.trim());
    return lines.join("\n");
  }

  function otherPages(here) {
    return [].map.call(document.querySelectorAll(".nav-sub[onclick*='showView']"), function (n) {
      var m = /showView\('([^']+)'/.exec(n.getAttribute("onclick") || "");
      if (!m || m[1] === here) return null;
      return "- " + n.childNodes[0].textContent.trim();
    }).filter(Boolean).join("\n");
  }

  function buildPage() {
    var here = currentView();
    var view = document.getElementById("view-" + here);
    var label = (document.getElementById("headerSectionLabel") || {}).textContent || here;
    var fresh = (document.getElementById("mastFresh") || {}).textContent || "";

    var parts = [];
    parts.push("===== PAGE: " + label.trim() + " (full text, and this is the page in front of her) =====");
    parts.push("Asked on: " + new Date().toLocaleString("en-GB", { timeZone: "Asia/Dubai" }) + " (UAE time)");
    if (fresh.trim()) parts.push("Data freshness: " + fresh.trim());
    parts.push(filtersLine());
    parts.push("");
    var body = textOf(view);
    if (body.length > MAX_PAGE_CHARS) body = body.slice(0, MAX_PAGE_CHARS) + "\n[page cut off here for length]";
    parts.push(body);
    var charts = chartsIn(view || document.body);
    if (charts) parts.push("\n===== The numbers behind the charts on this page =====\n" + charts);
    parts.push("\n===== Other dashboard pages (names only, not loaded) =====\n" + otherPages(here));
    return parts.join("\n");
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }

  function mount() {
    var host = document.getElementById("dashboardWrap") || document.body;
    var root = el("div", null); root.id = "trs-ask";

    var btn = el("button", "trs-ask-btn");
    btn.type = "button";
    btn.setAttribute("aria-expanded", "false");
    btn.innerHTML = '<span aria-hidden="true">?</span> Ask a question';

    var panel = el("div", "trs-ask-panel");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Ask a question about this page");
    panel.hidden = true;

    var head = el("div", "trs-ask-head");
    head.appendChild(el("div", "trs-ask-title", "Ask this page"));
    var close = el("button", "trs-ask-close", "×");
    close.type = "button";
    close.setAttribute("aria-label", "Close");
    head.appendChild(close);

    var note = el("p", "trs-ask-note",
      "Answers come from the page you have open, with the Branch and Period you picked. If it is not on screen, you will be told so rather than guessed at. Collapsed sections are not read, so open them first.");

    var log = el("div", "trs-ask-log");
    log.setAttribute("aria-live", "polite");

    var chips = el("div", "trs-ask-chips");

    // Who answers. The reader picks the trade between speed and care. The key is
    // sent to the function, which holds the allowlist.
    var MODELS = [
      { key: "quick",    name: "Quick",    note: "fastest" },
      { key: "balanced", name: "Balanced", note: "middle" },
      { key: "careful",  name: "Careful",  note: "slowest, most exacting" }
    ];
    var chosen = "careful";
    try { chosen = localStorage.getItem("trsAskModel") || "careful"; } catch (e) {}
    if (!MODELS.some(function (m) { return m.key === chosen; })) chosen = "careful";

    var picker = el("div", "trs-ask-models");
    picker.setAttribute("role", "radiogroup");
    picker.setAttribute("aria-label", "Who answers");
    picker.appendChild(el("span", "trs-ask-models-lbl", "Answered by"));
    MODELS.forEach(function (m) {
      var b = el("button", "trs-ask-model" + (m.key === chosen ? " on" : ""), m.name);
      b.type = "button";
      b.title = m.name + ", " + m.note;
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", m.key === chosen ? "true" : "false");
      b.addEventListener("click", function () {
        chosen = m.key;
        try { localStorage.setItem("trsAskModel", chosen); } catch (e) {}
        [].forEach.call(picker.querySelectorAll(".trs-ask-model"), function (o) {
          var on = o === b;
          o.classList.toggle("on", on);
          o.setAttribute("aria-checked", on ? "true" : "false");
        });
      });
      picker.appendChild(b);
    });

    var form = el("form", "trs-ask-form");
    var input = el("input", "trs-ask-input");
    input.type = "text";
    input.placeholder = "Type your question";
    input.setAttribute("aria-label", "Your question");
    input.maxLength = 600;
    var send = el("button", "trs-ask-send", "Ask");
    send.type = "submit";
    form.appendChild(input); form.appendChild(send);

    // Starters follow the page, so they are repainted each time the panel opens.
    function paintChips() {
      chips.innerHTML = "";
      if (log.childNodes.length) return;
      (STARTERS[currentView()] || STARTERS._default).forEach(function (q) {
        var c = el("button", "trs-ask-chip", q);
        c.type = "button";
        c.addEventListener("click", function () {
          input.value = q;
          form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
        });
        chips.appendChild(c);
      });
    }

    panel.appendChild(head); panel.appendChild(note); panel.appendChild(chips);
    panel.appendChild(log); panel.appendChild(picker); panel.appendChild(form);
    root.appendChild(panel); root.appendChild(btn);
    host.appendChild(root);

    function open() {
      paintChips();
      panel.hidden = false;
      btn.setAttribute("aria-expanded", "true");
      input.focus();
    }
    function shut() {
      panel.hidden = true;
      btn.setAttribute("aria-expanded", "false");
      btn.focus();
    }
    btn.addEventListener("click", function () { panel.hidden ? open() : shut(); });
    close.addEventListener("click", shut);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !panel.hidden) shut();
    });

    function say(cls, text) {
      var b = el("div", "trs-ask-msg " + cls);
      b.textContent = text;
      log.appendChild(b);
      log.scrollTop = log.scrollHeight;
      return b;
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var q = input.value.trim();
      if (!q) return;

      say("trs-ask-q", q);
      input.value = "";
      input.disabled = true; send.disabled = true;
      chips.innerHTML = "";
      var pending = say("trs-ask-wait", "Reading the page...");
      var waited = 0;
      var tick = setInterval(function () {
        waited += 3;
        if (!pending.parentNode) { clearInterval(tick); return; }
        pending.textContent = waited < 6 ? "Reading the page..."
          : (waited < 12 ? "Checking the figures..." : "Nearly there, this one is taking a moment...");
      }, 3000);

      // Rebuilt on every ask, never cached: the filters or the view may have
      // changed since the last question.
      var page = buildPage();
      var headers = { "Content-Type": "application/json" };
      if (ANON_KEY) { headers["apikey"] = ANON_KEY; headers["Authorization"] = "Bearer " + ANON_KEY; }

      fetch(ENDPOINT, { method: "POST", headers: headers, body: JSON.stringify({ question: q, page: page, model: chosen }) })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (res) {
          clearInterval(tick); pending.remove();
          if (!res.ok || res.d.error) {
            say("trs-ask-err", res.d.error || "That did not work. Try again, or read the page.");
            return;
          }
          // found:false is a real answer, styled as a caution, not an error.
          say(res.d.found === false ? "trs-ask-none" : "trs-ask-a", res.d.answer || "No answer came back.");
          var who = MODELS.filter(function (m) { return m.key === res.d.model; })[0];
          if (who) log.appendChild(el("div", "trs-ask-by", "answered by " + who.name));
          if (res.d.source && res.d.source !== "not on this page") {
            var s = el("div", "trs-ask-src");
            s.appendChild(el("span", "trs-ask-srclbl", res.d.section ? "From " + res.d.section : "From the page"));
            s.appendChild(el("span", null, res.d.source));
            log.appendChild(s);
          }
          log.scrollTop = log.scrollHeight;
        })
        .catch(function () {
          clearInterval(tick); pending.remove();
          say("trs-ask-err", "Could not reach the answer service. The page is still correct; read it off the screen.");
        })
        .then(function () {
          input.disabled = false; send.disabled = false; input.focus();
        });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
