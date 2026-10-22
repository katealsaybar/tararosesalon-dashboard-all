/* THE LIST OF DASHBOARD PAGES. One place that says what each page is called, where it sits, who may open it and which address it
   uses. Everything that used to carry its own copy reads this instead: the section label in the masthead, showView's level and
   scope rules, the address slugs, the filter lists, the dashboard search's page words, the /search/ door and Team Home's starred
   pages. scripts/build-search-index.py --check fails if index.html's sidebar and this list disagree.
   Audit 17 Oct 2026 (P1-15): the same names were written by hand in nine places and had drifted (Wellness Voucher Blast was
   missing from /search/ and Team Home, the retired Branch Performance was still offered, "Staff's 13 Week" had two names).

   One entry per page:
     id        what showView() and every ?view= calls it
     label     the sidebar name, which is also what search shows
     section   the masthead's small heading, when it is not the label
     group     the sidebar group; sub is the subhead inside Numbers
     slug      the address when it is not the id (?view=last-visit is the page whose id is lostclients)
     min       the lowest dashboard level that may open it (default 1); the page and its data refuse the rest too
     lv        Kate, 21 Oct 2026: the levels besides 3 and 5 that may open it, e.g. [2] for coordinators, [4] for accounts, [] for
               executives only. Level 5 opens every page; Level 3 opens every page whose min is 3 or less. A page with no lv falls back to min.
               Levels are no longer cumulative for 2 and 4: Level 4 does not inherit Level 3's pages.
               Kate, 22 Oct 2026: Level 1 (the team) is on the same footing: it opens only the pages whose lv lists 1, which today are
               Staff Cards (Kate, 22 Oct 2026: Org Chart is Level 2 and up, so not Level 1). Nobody holds Level 1 in dashboard_users, so this is what View as Level 1 shows and what a
               first Level 1 login would get, rather than the twenty pages the old min rule opened. A person's own extras
               (dashboard_users.extra_pages) open more pages for that person only. This decides what is drawn; the data itself is
               still protected by row-level security.
     inside    Kate, 22 Oct 2026: the page lives inside another page (Wellness Voucher (3rd blast) is inside Wellness Voucher Performance: the last entry of
               its On this page rail, no sidebar entry of its own), so Team Home and the Reports Hub do not list it as a second report
     scope     a Bahrain-scoped sign-in may open it
     filtered  reads the masthead's Branch and Period;  ledger  takes the Branch but fixes the period to the ledger month
     free      needs nothing from the Pulse's load, so a direct link opens it at once (index.html enterDashboard)
     perfkey   needs nothing from the Pulse's load but the sign-in's Staff Benchmarks key, so a direct link opens it once that arrives
     nopulse   draws from its own loaders and takes nothing from the Pulse's computed state: a first load onto it does not run the Pulse, and a Branch or Period change redraws it alone (dashboard.js NOPULSE_VIEWS)
     lazy      the script group that holds its code (trsLazy in index.html)
     ic        Team Home's icon name for it
     words     what people type that is not in the name
     retired   the page it was folded into; its old links and stars still land there
   Keep the list between the markers strict JSON: the check reads it. */
window.TRS_PAGES = /*PAGES*/[
  {"id": "dashboard", "label": "Organisation Pulse", "group": "Numbers", "sub": "Business", "scope": 1, "filtered": 1, "words": "home overview kpi sales revenue takings pulse summary", "lv": []},
  {"id": "compare", "lazy": "cmp", "label": "Comparison", "group": "Numbers", "sub": "Business", "words": "compare comparison versus vs side by side", "lv": []},
  {"id": "dailyperf", "label": "Daily Performance", "group": "Numbers", "sub": "Business", "filtered": 1, "lazy": "dp", "words": "daily day by day per branch graph chart radar heatmap weekday strengths weaknesses sales clients utilisation rebooking target", "lv": []},
  {"id": "overyears", "label": "Over the Years", "group": "Numbers", "sub": "Business", "filtered": 1, "lazy": "oty", "words": "years history annual year by year seasons month by month growth", "lv": []},
  {"id": "ledgerFinancials", "nopulse": 1, "label": "Financial Totals", "group": "Numbers", "sub": "Business", "scope": 1, "filtered": 1, "ledger": 1, "lazy": "lgx", "words": "financial totals ledger cash card payments", "lv": [4]},
  {"id": "team", "lazy": "tp", "nopulse": 1, "label": "Podium Race", "group": "Numbers", "sub": "Team Performance", "scope": 1, "filtered": 1, "ic": "access", "words": "podium race ranking leaderboard top performer", "lv": [2]},
  {"id": "teamquad", "lazy": "tp", "nopulse": 1, "label": "Staff Quadrant", "group": "Numbers", "sub": "Team Performance", "filtered": 1, "ic": "access", "words": "staff quadrant treatment retail rebook rebooking takings", "lv": []},
  {"id": "staffperf", "perfkey": 1, "label": "Staff Dashboards", "group": "Numbers", "sub": "Team Performance", "ic": "access", "words": "benchmarks money five kpi promotion rebooking retention conversion request rate column fill colour client numbers new client requests reputation treatment retail", "lv": []},
  {"id": "staffweeks", "lazy": "wk", "perfkey": 1, "label": "Staff’s 13 Week", "group": "Numbers", "sub": "Team Performance", "ic": "access", "words": "staff quarterly performance quarter q1 q2 q3 q4 13 week thirteen weekly report emma rebooking retention conversion request rate column fill colour client numbers new client requests reputation treatment retail", "lv": []},
  {"id": "stafflevels", "lazy": "lv", "perfkey": 1, "label": "Stylist’s Benchmarks", "group": "Numbers", "sub": "Team Performance", "ic": "access", "words": "levels promotion grade stylist benchmarks rebooking retention conversion request rate column fill colour client numbers new client requests reputation treatment retail", "lv": []},
  {"id": "one2ones", "lazy": "o2", "nopulse": 1, "perfkey": 1, "label": "1-to-1s & Goals", "group": "Numbers", "sub": "Team Performance", "min": 3, "ic": "access", "words": "1-to-1 one to one 1on1 goals goal setting meeting staff review appraisal signed draft hr-10 hr-09 prep leader emma", "lv": []},
  {"id": "attrition", "lazy": "at", "label": "Staff Attrition", "group": "Numbers", "sub": "Team Performance", "min": 3, "ic": "access", "words": "attrition turnover leavers left resigned resignation staff retention tenure how long stayed stylists beauticians churn", "lv": []},
  {"id": "clients", "label": "Top Clients", "group": "Numbers", "sub": "Clients", "lazy": "cl", "words": "top clients customers", "lv": []},
  {"id": "clientmix", "label": "Client Mix", "group": "Numbers", "sub": "Clients", "lazy": "cl", "words": "client mix colour units new returning mix of clients", "lv": []},
  {"id": "clientbook", "label": "Client Book", "group": "Numbers", "sub": "Clients", "lazy": "cb", "nopulse": 1, "min": 5, "words": "client book clients phone number email contact details notes client notes visit notes appointment history allergies formulas search directory records", "lv": []},
  {"id": "complaints", "label": "Client Complaints", "group": "Numbers", "sub": "Clients", "lazy": "cp", "nopulse": 1, "filtered": 1, "min": 2, "words": "client complaints complaint unhappy not happy redo free redo refund resolved resolution dissatisfied feedback problems per branch notes phorest", "lv": [2]},
  {"id": "complaintlog", "label": "Log a Client Complaint", "group": "Numbers", "sub": "Clients", "lazy": "cp", "nopulse": 1, "filtered": 1, "min": 2, "words": "log a complaint complaint submission submit report new complaint follow up resolve resolved open track tracking unhappy client whatsapp", "lv": [2]},
  {"id": "lostclients", "label": "Client’s Last Visit", "group": "Numbers", "sub": "Clients", "min": 2, "slug": "last-visit", "filtered": 1, "nopulse": 1, "lazy": "cl", "ic": "lost-clients", "words": "last visit lapsed clients not back come back haven't been back win back", "lv": [2]},
  {"id": "lostlists", "label": "Lost Client Blasts, October 2026", "group": "Campaigns", "min": 2, "slug": "lost-clients", "lazy": "cl", "ic": "lost-clients", "words": "lost clients outreach lists whatsapp groups waves campaign templates to message", "lv": [2, 4]},
  {"id": "wvblast", "label": "Wellness Voucher (3rd blast)", "group": "Campaigns", "inside": "wvperf", "min": 3, "lazy": "cl", "words": "voucher blast whatsapp wave send message vouchers clients", "lv": [4]},
  {"id": "reviews", "label": "Google Reviews", "group": "Numbers", "sub": "Clients", "filtered": 1, "words": "google reviews ratings stars", "lv": [2]},
  {"id": "services", "label": "Service Rankings", "group": "Numbers", "sub": "Sales & Stock", "lazy": "cl", "words": "service rankings treatments top services", "lv": []},
  {"id": "products", "lazy": "pr", "label": "Products", "group": "Numbers", "sub": "Sales & Stock", "filtered": 1, "words": "products stock orders retail professional spend", "lv": [4]},
  {"id": "supplierspend", "lazy": "sp", "nopulse": 1, "label": "Stock & Supplier Spend", "group": "Numbers", "sub": "Sales & Stock", "min": 4, "words": "supplier suppliers spend stock caps budget invoices invoiced categories consumables retail professional dbd accounts", "lv": [4]},
  {"id": "ledgerTargets", "nopulse": 1, "label": "Daily Target Sheet", "group": "Targets", "section": "Ledgers · Daily Target Sheet", "filtered": 1, "ledger": 1, "lazy": "lgx", "ic": "today", "words": "daily target sheet ledger", "lv": [2]},
  {"id": "ledgerStylist", "nopulse": 1, "label": "Daily Stylist Target", "group": "Targets", "section": "Ledgers · Daily Stylist Target", "filtered": 1, "ledger": 1, "lazy": "lgx", "ic": "today", "words": "stylist target daily ledger", "lv": [2]},
  {"id": "ledgerActuals", "nopulse": 1, "label": "Actuals vs Targets", "group": "Targets", "section": "Ledgers · Actuals vs Targets", "filtered": 1, "ledger": 1, "lazy": "lgx", "ic": "today", "words": "actuals targets pacing ledger", "lv": [2]},
  {"id": "googleads", "lazy": "mk", "label": "Google Ads", "group": "Content", "min": 3, "free": 1, "ic": "marketing", "words": "ads adwords campaigns clicks spend cost per click paid search", "lv": []},
  {"id": "website", "lazy": "mk", "label": "Website & Search", "group": "Content", "min": 3, "free": 1, "ic": "dashboards", "words": "website traffic visitors seo search console sessions analytics google", "lv": []},
  {"id": "social", "lazy": "mk", "label": "Social", "group": "Content", "min": 3, "free": 1, "ic": "marketing", "words": "instagram tiktok youtube facebook followers reach views posts reels metricool", "lv": []},
  {"id": "wvperf", "label": "Wellness Voucher Performance", "group": "Campaigns", "min": 2, "ic": "campaigns", "words": "voucher performance redemptions credit collected campaign target", "lv": [2, 4]},
  {"id": "glowclub", "label": "Glow Club Performance", "group": "Campaigns", "min": 3, "lazy": "gc", "ic": "campaigns", "words": "glow club membership silver gold platinum members renewals perks used monthly performance campaign circle", "lv": [4]},
  {"id": "stylists", "lazy": "sc", "label": "Staff Cards", "group": "People", "free": 1, "ic": "access", "words": "cards photos instagram profiles", "lv": [1, 2, 4]},
  {"id": "orgchart", "lazy": "oc", "label": "Org Chart", "group": "People", "free": 1, "ic": "people", "words": "org chart structure hierarchy", "lv": [2, 4]},
  {"id": "branchperf", "label": "Branch Performance", "retired": "dailyperf", "scope": 1, "filtered": 1, "words": "branch staff table figures services retail"}
]/*END*/;
(function () {
  var by = {};
  TRS_PAGES.forEach(function (p) { by[p.id] = p; });
  window.trsPage = function (id) { return by[id] || null; };
  // The page an id really opens: a retired page opens the one it was folded into.
  window.trsLive = function (id) { var p = by[id]; return p && p.retired ? p.retired : id; };
  // Kate, 21 Oct 2026: who may open a page. Level 5 (Kate) opens all of them and Level 3 (executives and marketing) every page whose min is 3
  // or less. Level 2 (coordinators) and Level 4 (accounts) open only the pages whose lv lists them, plus any page named in their own extras.
  // Kate, 22 Oct 2026: Level 1 opens only the pages whose lv lists 1 (Staff Cards, Org Chart). With no level at all (not signed in yet) the old
  // rule stands (min), so nothing is hidden before the sign-in has answered.
  window.trsPageOpen = function (id, level, extras) {
    var p = by[window.trsLive(id)];
    if (!p) return true;
    if (!level) return (p.min || 1) <= 1;
    if (level === 1) return !!(p.lv && p.lv.indexOf(1) >= 0);
    if (level >= 5) return true;
    if (level === 3) return (p.min || 1) <= 3;
    if (extras && extras.indexOf(p.id) >= 0) return true;
    if (p.lv) return p.lv.indexOf(level) >= 0;
    return (p.min || 1) <= level;
  };
  // The page a person lands on when none is asked for (or the one asked for is not theirs): the Pulse for executives, the
  // Daily Target Sheet for coordinators, Financial Totals for accounts, Staff Cards for the team.
  window.trsHomePage = function (level) {
    return level === 1 ? 'stylists' : level === 2 ? 'ledgerTargets' : level === 4 ? 'ledgerFinancials' : 'dashboard';
  };
  window.trsPageLabel = function (id) { var p = by[window.trsLive(id)]; return p ? p.label : id; };
  window.trsPageMin = function (id) { var p = by[id]; return (p && p.min) || 1; };
  window.trsSlugOf = function (id) { var p = by[id]; return (p && p.slug) || id; };
  // An address's ?view= back to the page id: a slug, or a retired page's old name.
  window.trsViewOfSlug = function (v) {
    for (var i = 0; i < TRS_PAGES.length; i++) if (TRS_PAGES[i].slug === v) return TRS_PAGES[i].id;
    return window.trsLive(v);
  };
  // id -> title for every page a person can star or search for (the retired one shows the title of the page it became).
  window.trsPageTitles = function () { var m = {}; TRS_PAGES.forEach(function (p) { m[p.id] = window.trsPageLabel(p.id); }); return m; };
})();
