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
  {"id": "dashboard", "label": "Organisation Pulse", "group": "Numbers", "sub": "Business", "scope": 1, "filtered": 1, "words": "home overview kpi sales revenue takings pulse summary"},
  {"id": "compare", "lazy": "cmp", "label": "Comparison", "group": "Numbers", "sub": "Business", "words": "compare comparison versus vs side by side"},
  {"id": "dailyperf", "label": "Daily Performance", "group": "Numbers", "sub": "Business", "filtered": 1, "lazy": "dp", "words": "daily day by day per branch graph chart radar heatmap weekday strengths weaknesses sales clients utilisation rebooking target"},
  {"id": "overyears", "label": "Over the Years", "group": "Numbers", "sub": "Business", "filtered": 1, "lazy": "oty", "words": "years history annual year by year seasons month by month growth"},
  {"id": "ledgerFinancials", "nopulse": 1, "label": "Financial Totals", "group": "Numbers", "sub": "Business", "scope": 1, "filtered": 1, "ledger": 1, "lazy": "lgx", "words": "financial totals ledger cash card payments"},
  {"id": "team", "nopulse": 1, "label": "Podium Race", "group": "Numbers", "sub": "Team Performance", "scope": 1, "filtered": 1, "ic": "access", "words": "podium race ranking leaderboard top performer"},
  {"id": "teamquad", "nopulse": 1, "label": "Staff Quadrant", "group": "Numbers", "sub": "Team Performance", "filtered": 1, "ic": "access", "words": "staff quadrant treatment retail rebook rebooking takings"},
  {"id": "staffperf", "perfkey": 1, "label": "Staff Dashboards", "group": "Numbers", "sub": "Team Performance", "ic": "access", "words": "benchmarks money five kpi promotion rebooking retention conversion request rate column fill colour client numbers new client requests reputation treatment retail"},
  {"id": "staffweeks", "lazy": "wk", "perfkey": 1, "label": "Staff’s 13 Week", "group": "Numbers", "sub": "Team Performance", "ic": "access", "words": "staff quarterly performance quarter q1 q2 q3 q4 13 week thirteen weekly report emma rebooking retention conversion request rate column fill colour client numbers new client requests reputation treatment retail"},
  {"id": "stafflevels", "lazy": "lv", "perfkey": 1, "label": "Stylist’s Benchmarks", "group": "Numbers", "sub": "Team Performance", "ic": "access", "words": "levels promotion grade stylist benchmarks rebooking retention conversion request rate column fill colour client numbers new client requests reputation treatment retail"},
  {"id": "clients", "label": "Top Clients", "group": "Numbers", "sub": "Clients", "lazy": "cl", "words": "top clients customers"},
  {"id": "clientmix", "label": "Client Mix", "group": "Numbers", "sub": "Clients", "lazy": "cl", "words": "client mix colour units new returning mix of clients"},
  {"id": "lostclients", "label": "Client’s Last Visit", "group": "Numbers", "sub": "Clients", "min": 2, "slug": "last-visit", "lazy": "cl", "ic": "lost-clients", "words": "last visit lapsed clients not back come back haven't been back win back"},
  {"id": "lostlists", "label": "Lost Clients", "group": "Numbers", "sub": "Clients", "min": 2, "slug": "lost-clients", "lazy": "cl", "ic": "lost-clients", "words": "lost clients outreach lists whatsapp groups waves campaign templates to message"},
  {"id": "wvblast", "label": "Wellness Voucher Blast", "group": "Numbers", "sub": "Clients", "min": 3, "lazy": "cl", "words": "voucher blast whatsapp wave send message vouchers clients"},
  {"id": "reviews", "label": "Google Reviews", "group": "Numbers", "sub": "Clients", "filtered": 1, "words": "google reviews ratings stars"},
  {"id": "services", "label": "Service Rankings", "group": "Numbers", "sub": "Sales & Stock", "lazy": "cl", "words": "service rankings treatments top services"},
  {"id": "products", "label": "Products", "group": "Numbers", "sub": "Sales & Stock", "filtered": 1, "words": "products stock orders retail professional spend"},
  {"id": "ledgerTargets", "nopulse": 1, "label": "Daily Target Sheet", "group": "Targets", "section": "Ledgers · Daily Target Sheet", "filtered": 1, "ledger": 1, "lazy": "lgx", "ic": "today", "words": "daily target sheet ledger"},
  {"id": "ledgerStylist", "nopulse": 1, "label": "Daily Stylist Target", "group": "Targets", "section": "Ledgers · Daily Stylist Target", "filtered": 1, "ledger": 1, "lazy": "lgx", "ic": "today", "words": "stylist target daily ledger"},
  {"id": "ledgerActuals", "nopulse": 1, "label": "Actuals vs Targets", "group": "Targets", "section": "Ledgers · Actuals vs Targets", "filtered": 1, "ledger": 1, "lazy": "lgx", "ic": "today", "words": "actuals targets pacing ledger"},
  {"id": "googleads", "lazy": "mk", "label": "Google Ads", "group": "Content", "min": 3, "free": 1, "ic": "marketing", "words": "ads adwords campaigns clicks spend cost per click paid search"},
  {"id": "website", "lazy": "mk", "label": "Website & Search", "group": "Content", "min": 3, "free": 1, "ic": "dashboards", "words": "website traffic visitors seo search console sessions analytics google"},
  {"id": "social", "lazy": "mk", "label": "Social", "group": "Content", "min": 3, "free": 1, "ic": "marketing", "words": "instagram tiktok youtube facebook followers reach views posts reels metricool"},
  {"id": "wvperf", "label": "Wellness Voucher Performance", "group": "Content", "min": 2, "ic": "campaigns", "words": "voucher performance redemptions credit collected campaign target"},
  {"id": "stylists", "label": "Staff Cards", "group": "People", "free": 1, "ic": "access", "words": "cards photos instagram profiles"},
  {"id": "orgchart", "label": "Org Chart", "group": "People", "free": 1, "ic": "people", "words": "org chart structure hierarchy"},
  {"id": "branchperf", "label": "Branch Performance", "retired": "dailyperf", "scope": 1, "filtered": 1, "words": "branch staff table figures services retail"}
]/*END*/;
(function () {
  var by = {};
  TRS_PAGES.forEach(function (p) { by[p.id] = p; });
  window.trsPage = function (id) { return by[id] || null; };
  // The page an id really opens: a retired page opens the one it was folded into.
  window.trsLive = function (id) { var p = by[id]; return p && p.retired ? p.retired : id; };
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
