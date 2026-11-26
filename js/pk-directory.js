// Campaigns Directory (Kate, 26 Nov 2026): the table of contents of every campaign page, in four lists: Blasts, Packages, Courses and Offers (Kate: "ilagay mo na lahat diyan",
// split "one blasts, two packages, three courses"; Offers holds Active Deals and Discounts and Vouchers, which are none of those three). One row per campaign with a link to its page.
// Packages carry figures: when a group launched, when it last sold, packages sold, sales, AED and clients, read with each group's own function in summary mode (pk_keratin(true),
// pk_pamper_2025(true), pk_back_to_school(true), pk_hair_colour(true), pk_ads499(true), pk_dubai_deals(true)): totals only, Level 2 and above, no client rows, nothing new in the
// database. The other three lists have no figures here: each page holds its own. A row is listed only when its page is on the dashboard (pages.js) and the reader may open it
// (trsPageOpen), so a Level 2 reader does not see the Level 3 blast pages. Nothing is added across groups (two can share an offer), so there is no grand total. A price test is never
// inside a total: it sits beside it as "+N by price". Lifetime figures, so the masthead's Branch and Period are not used. Sort by (oldest, newest, A to Z, Z to A; Packages also most
// sales and most AED) drives every list, and every table has the Google Sheets heading menus.
// Self-contained: it needs sb, TRS_LEVEL, TRS_EXTRA, TRS_PAGES, trsPageOpen, TRSD (drill.js), TRSheet (sheet-table.js), whyWall(), trsPlain(), showView(), lgJump(), spy().
const PKD_GROUPS = [
  { id: 'pkpamper', name: 'Pamper Packages 2025', cat: 'PACKAGES (April 2025 post)', fn: 'pk_pamper_2025' },
  { id: 'pkkeratin', name: 'Keratin Packages', cat: '1TREATMENT - KERATIN', fn: 'pk_keratin' },
  { id: 'pkschool', name: 'Back to School Offer', cat: 'PACKAGES (Back to School)', fn: 'pk_back_to_school' },
  { id: 'pkhaircolour', name: 'Hair Colour Packages', cat: '1HAIR COLOR', fn: 'pk_hair_colour' },
  { id: 'pkads499', name: 'ADS 499 Packages', cat: 'ADS - PACKAGE', fn: 'pk_ads499' },
  { id: 'pkdubai', name: 'Dubai Daily Deals', cat: 'DUBAI DEALS', fn: 'pk_dubai_deals' }
];
// The other three lists. ran = what a person reads, key = the first day, for sorting (Wellness Voucher's start day is not kept on the dashboard, so it sorts by its year).
// A new campaign page is one more line here, with the page's id from pages.js.
const PKD_LISTS = [
  { id: 'pd-blasts', tbl: 'pdb', title: 'Blasts', rail: 'Blasts', what: 'The WhatsApp and email pushes to clients: who was messaged, in which waves, and the results. One row each, with a link.', rows: [
    { view: 'lostlists', name: 'Lost Client Blasts, October 2026', what: 'The lapsed-client outreach: the lists, the waves, the templates and the results.', ran: 'October 2026', key: '2026-10-01' },
    { view: 'wvperf', name: 'Wellness Voucher Performance', what: 'Redemptions and credit against the campaign target. Its Message and Email Blasts page, every blast with its wave and results, sits inside it.', ran: '2026, closes 31 Dec 2026', key: '2026-01-01' },
    { view: 'campaignblasts', name: 'Campaign Blasts, November', what: 'Each November WhatsApp blast as it looks on the phone, when it goes, and Coach Emma’s review.', ran: 'November 2026', key: '2026-11-01' },
    { view: 'novblasts', name: 'Database Blasts, November 2026', what: 'The November database blasts to the client list, by segment and send day.', ran: 'November 2026', key: '2026-11-01' }] },
  { id: 'pd-packages', tbl: 'pdtab', title: 'Packages', rail: 'Packages', packages: true },
  { id: 'pd-courses', tbl: 'pdc', title: 'Courses', rail: 'Courses', what: 'Courses are sold once and used over several visits: Glow Club, and every course on the Phorest Courses list.', rows: [
    { view: 'glowclub', name: 'Glow Club Performance', what: 'The membership course: Silver, Gold and Platinum members, renewals and perks used.', ran: '2025', key: '2025-01-01' },
    { view: 'coursesperf', name: 'Courses Performance', what: 'Every prepaid course sold at the till and the sessions used, with Glow Club kept apart.', ran: '2026', key: '2026-01-01' }] },
  { id: 'pd-offers', tbl: 'pdo', title: 'Offers', rail: 'Offers', what: 'The deals and discount codes that are neither a blast, a package nor a course.', rows: [
    { view: 'dealsperf', name: 'Active Deals Performance', what: 'The 2026 brochure deals: what each offer sold, per branch.', ran: '2026', key: '2026-01-01' },
    { view: 'discountsvouchers', name: 'Discounts and Vouchers', what: 'Phorest’s Discounts and Client Vouchers lists, archived ones included, with balances and what is outstanding.', ran: '2026', key: '2026-01-01' }] }
];
const PKD_SORTS = [['fs-1', 'Oldest first', 'fs', 1], ['fs--1', 'Newest first', 'fs', -1], ['g-1', 'A to Z', 'g', 1], ['g--1', 'Z to A', 'g', -1],
  ['s--1', 'Packages: most sales', 's', -1], ['a--1', 'Packages: most AED', 'a', -1], ['own', 'A column heading', '', 0]];
let pkdRows = [], pkdFailed = [], pkdAt = '', pkdBusy = false, pkdTs = {}, pkdVis = [];

const pkdEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pkdN = v => Math.round(Number(v) || 0).toLocaleString('en-GB');
const pkdSum = (l, k) => l.reduce((a, r) => a + (Number(r[k]) || 0), 0);
const pkdOk = () => typeof TRS_LEVEL !== 'undefined' && TRS_LEVEL >= 2;
const pkdDay = iso => { try { return iso ? new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '–'; } catch (e) { return iso || '–'; } };
const pkdWhen = iso => { try { return new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).replace(' at ', ', '); } catch (e) { return ''; } };
const pkdPl = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
// A page is listed when it is on the dashboard and this reader may open it.
const pkdPage = id => typeof TRS_PAGES !== 'undefined' ? TRS_PAGES.find(p => p.id === id) : null;
const pkdCan = id => { const p = pkdPage(id); if (!p) return false; return typeof trsPageOpen === 'function' ? !!trsPageOpen(id, TRS_LEVEL, typeof TRS_EXTRA !== 'undefined' ? TRS_EXTRA : []) : TRS_LEVEL >= (p.min || 1); };
const pkdWho = id => { const p = pkdPage(id); return p && p.min ? 'Level ' + p.min + ' and up' : ''; };
// The page of a campaign: a link that opens it inside the dashboard (a click with a modifier key opens it in a new tab as a link should).
const pkdGo = (id, txt, cls) => `<a class="${cls || 'pd-link'}" href="/?view=${id}" onclick="if(trsPlain(event)){event.preventDefault();if(typeof TRSD!=='undefined')TRSD.close();showView('${id}', null)}">${txt}</a>`;
const pkdOpen = (g, txt, n) => n && typeof TRSD !== 'undefined' ? TRSD.num(txt, pkdSpec(g)) : `<span class="ad-zero">${txt}</span>`;

// One group from its summary: counted packages make the totals; a price test and a package with no sale stay apart.
function pkdPrep(meta, d) {
  const pk = (d.packages || []).map(p => ({ k: p.k, n: p.n, pl: p.pl || '', cnt: p.cnt !== false, sales: Number(p.sales) || 0, aed: Number(p.aed) || 0, clients: p.clients == null ? null : Number(p.clients), first: p.first || '', last: p.last || '' }));
  const c = pk.filter(p => p.cnt), pt = pk.filter(p => !p.cnt && p.sales > 0), pkSales = pkdSum(c, 'sales');
  const g = Object.assign({}, meta, { pk, n: pk.length, withSale: c.filter(p => p.sales > 0).length, pkSales, sales: d.sales != null ? Number(d.sales) : pkSales, aed: pkdSum(c, 'aed'),
    clients: d.clients == null ? null : Number(d.clients), pt, ptS: pkdSum(pt, 'sales'), ptA: pkdSum(pt, 'aed'),
    first: c.filter(p => p.first).map(p => p.first).sort()[0] || '', last: c.filter(p => p.last).map(p => p.last).sort().slice(-1)[0] || '' });
  g.match = pt.length ? 'Exact, price test apart' : 'Exact';
  return g;
}

async function renderCampaignsDirectory(force) {
  const el = document.getElementById('pkDirContent');
  if (!el || !pkdOk()) return;
  if (pkdRows.length && !force) { pkdPaint(); return; }
  if (pkdBusy) return;
  pkdBusy = true;
  el.innerHTML = '<div class="ad-state">Reading the till…</div>';
  // A package group is listed once its page is on the dashboard and the reader may open it, so the Directory never points at a page that is not there.
  const live = PKD_GROUPS.filter(m => pkdCan(m.id));
  const res = await Promise.allSettled(live.map(m => sb.rpc(m.fn, { p_summary: true })));
  const rows = [], bad = []; let at = '';
  res.forEach((r, i) => {
    const d = r.status === 'fulfilled' && !r.value.error ? r.value.data : null;
    if (d && Array.isArray(d.packages)) { rows.push(pkdPrep(live[i], d)); if (d.at && d.at > at) at = d.at; } else { bad.push(live[i].name); console.error(live[i].fn, r.reason || (r.value && r.value.error)); }
  });
  pkdRows = rows; pkdFailed = bad; pkdAt = at; pkdBusy = false;
  pkdPaint();
}

// The window a figure opens: the packages of that group. The sales behind a package are on the group's own page, one tap on.
function pkdSpec(g) {
  return { title: g.name, tip: 'See the packages', cur: 'AED', views: [{ id: 'packages', label: 'Packages', load: async () => {
    const c = g.pk.filter(p => p.cnt);
    const tag = p => p.sales ? (p.cnt ? '<span class="ad-tag ok">Exact</span>' : '<span class="ad-tag warn">Price test</span>') : '<span class="ad-tag">No sale</span>';
    const zero = '<span class="ad-zero">0</span>';
    return {
      sub: g.cat + ' · ' + pkdPl(g.n, 'package') + ' · ' + pkdPl(g.sales, 'sale') + ' · AED ' + pkdN(g.aed) + (g.clients == null ? '' : ' · ' + pkdPl(g.clients, 'client')),
      note: 'This is the last step here: the sales behind a package, line by line, are on the page for ' + g.name + ' (tap a number to open it). '
        + (g.pkSales !== g.sales ? 'One sale holds two packages, so the packages add to ' + pkdN(g.pkSales) + ' and the sales are ' + pkdN(g.sales) + '. ' : '')
        + (g.pt.length ? 'The price test (' + pkdPl(g.ptS, 'sale') + ', AED ' + pkdN(g.ptA) + ') is not in the total. ' : ''),
      cols: [{ k: 'n', l: 'Package' }, { k: 'pl', l: 'Price' }, { k: 'ct', l: 'Match', t: 'html' }, { k: 'f', l: 'First sold', t: 'date' }, { k: 'l', l: 'Last sold', t: 'date' },
        { k: 's', l: 'Sales', t: 'html' }, { k: 'a', l: 'AED', t: 'html' }, { k: 'c', l: 'Clients', t: 'html' }],
      rows: g.pk.map(p => ({ n: p.n, pl: p.pl || '–', ct: tag(p), f: p.first || '', l: p.last || '', s: p.sales ? pkdGo(g.id, pkdN(p.sales)) : zero, a: p.sales ? pkdGo(g.id, pkdN(p.aed)) : zero,
        c: p.clients == null ? '–' : (p.sales ? pkdGo(g.id, pkdN(p.clients)) : zero) })),
      foot: { n: 'Total: ' + c.length + ' counted' + (g.pk.length > c.length ? ' (the rest left out)' : ''), s: pkdN(g.pkSales), a: pkdN(g.aed) } };
  } }] };
}

const pkdCol = (k, l, t, raw, disp, cell, x) => ({ k, l, t, raw, disp, cell, x });
function pkdMake(id, rows, cols, extra) {
  if (typeof TRSheet === 'undefined' || !document.getElementById(id)) return null;
  const old = pkdTs[id];
  const T = TRSheet.table(Object.assign({ id, el: '#' + id, rows: () => rows, cols, limit: 10 }, extra || {}));
  T.sort = old ? old.sort : { k: 'fs', dir: 1 }; if (old) { T.f = old.f; T.more = old.more; }
  pkdTs[id] = T; T.draw(); return T;
}
function pkdSyncSort() {
  const sel = document.getElementById('pkdSort'); if (!sel) return;
  const T = pkdTs.pdtab || pkdTs[Object.keys(pkdTs)[0]]; if (!T) return;
  const key = T.sort ? T.sort.k + '-' + T.sort.dir : '', hit = PKD_SORTS.find(s => s[0] === key), v = hit ? hit[0] : (T.sort ? 'own' : 'fs-1');
  if (sel.value !== v) sel.value = v;
}
function pkdTables() {
  const simple = () => [
    pkdCol('g', 'Campaign', 'text', r => r.name, r => r.name, r => '<b>' + pkdGo(r.view, pkdEsc(r.name)) + '</b><span class="pd-sub">' + pkdEsc(r.what) + '</span>'),
    pkdCol('fs', 'Ran', 'text', r => r.key, r => r.ran, r => pkdEsc(r.ran)),
    pkdCol('lv', 'Who sees it', 'text', r => r.who, r => r.who, r => pkdEsc(r.who))];
  pkdVis.forEach(l => {
    if (l.packages) {
      pkdMake('pdtab', pkdRows, [
        pkdCol('g', 'Package group', 'text', g => g.name, g => g.name, g => '<b>' + pkdGo(g.id, pkdEsc(g.name)) + '</b><span class="pd-sub">' + pkdEsc(g.cat) + ' · ' + pkdPl(g.n, 'package') + '</span>'),
        pkdCol('fs', 'Launched', 'text', g => g.first, g => pkdDay(g.first), g => pkdDay(g.first)),
        pkdCol('ls', 'Last sold', 'text', g => g.last, g => pkdDay(g.last), g => pkdDay(g.last)),
        pkdCol('pk', 'Packages sold', 'num', g => g.withSale, g => g.withSale + ' of ' + g.n, g => pkdOpen(g, g.withSale + ' of ' + g.n, g.n)),
        pkdCol('s', 'Sales', 'num', g => g.sales, g => String(g.sales), g => pkdOpen(g, pkdN(g.sales), g.sales) + (g.ptS ? '<span class="pd-sub">' + pkdOpen(g, '+' + g.ptS + ' by price', g.ptS) + '</span>' : '')),
        pkdCol('a', 'AED', 'num', g => g.aed, g => pkdN(g.aed), g => pkdOpen(g, pkdN(g.aed), g.sales)),
        pkdCol('c', 'Clients', 'num', g => g.clients == null ? -1 : g.clients, g => g.clients == null ? '–' : String(g.clients), g => g.clients == null ? '<span class="ad-zero">–</span>' : pkdOpen(g, pkdN(g.clients), g.clients)),
        pkdCol('mt', 'Match', 'text', g => g.match, g => g.match, g => '<span class="ad-tag ' + (g.pt.length ? 'warn' : 'ok') + '">' + pkdEsc(g.match) + '</span>', true),
        pkdCol('av', 'AED a sale', 'num', g => g.sales ? Math.round(g.aed / g.sales) : 0, g => g.sales ? pkdN(g.aed / g.sales) : '–', g => g.sales ? pkdN(g.aed / g.sales) : '<span class="ad-zero">–</span>', true)],
        { after: pkdSyncSort });
    } else pkdMake(l.tbl, l.shown, simple());
  });
}

const pkdPhone = id => `<button type="button" class="ad-btn ad-phone" data-sxcm="${id}" aria-label="Sort and filter">Sort or filter</button>`;

function pkdPaint() {
  const el = document.getElementById('pkDirContent'); if (!el) return;
  const head = `<div class="ad-top"><div><h1 class="ad-t">Campaigns Directory</h1><p class="ad-sub">${pkdAt ? 'As of ' + pkdEsc(pkdWhen(pkdAt)) + '. ' : ''}Every campaign page, in one list.</p></div>
    <div class="ad-toplinks"><button class="ad-btn" type="button" onclick="renderCampaignsDirectory(true)">Refresh</button></div></div>`;
  // The lists this reader has rows in, in order. A list with no rows is left out, and so is its entry in On this page.
  pkdVis = PKD_LISTS.map(l => l.packages ? Object.assign({}, l, { shown: pkdRows }) : Object.assign({}, l, { shown: l.rows.filter(r => pkdCan(r.view)).map(r => Object.assign({ who: pkdWho(r.view) }, r)) })).filter(l => l.shown.length);
  if (!pkdVis.length) { el.innerHTML = head + `<div class="ad-state">The directory did not load. Press Refresh to try again.</div>`; pkdRail(false); return; }
  const G = pkdRows, nBl = pkdVis.reduce((a, l) => a + l.shown.length, 0);
  const counts = pkdVis.map(l => l.shown.length + ' ' + l.title.toLowerCase().replace(/s$/, '') + (l.shown.length === 1 ? '' : 's'));
  let h = head + whyWall([
    ['Why this page', 'Every campaign has its own page, and the list in the sidebar grows each time. This is the one table of contents: blasts, packages, courses and offers, each with a link.'],
    ['Why now', 'The older campaigns are off the brochure and out of the sidebar’s view, so their results sit on pages that are easy to lose.'],
    ['If we do nothing', 'Nobody finds the old results, and the next campaign is planned without knowing what the last ones did.']]);
  h += `<p class="ad-sub">${nBl} campaign${nBl === 1 ? '' : 's'} on ${pkdVis.length} list${pkdVis.length === 1 ? '' : 's'}: ${pkdEsc(counts.join(', '))}. Each one opens its own page.</p>
    ${pkdFailed.length ? `<p class="ad-sub"><span class="ad-status warn"><span aria-hidden="true">!</span>${pkdEsc(pkdFailed.join(', '))} did not load, so ${pkdFailed.length === 1 ? 'it is' : 'they are'} not listed in Packages. Press Refresh.</span></p>` : ''}
    <div class="pd-bar"><div class="pd-sort"><label for="pkdSort">Sort by</label><select id="pkdSort" aria-label="Sort by">${PKD_SORTS.map(s => `<option value="${s[0]}">${s[1]}</option>`).join('')}</select></div></div>`;
  pkdVis.forEach((l, i) => {
    h += `<section class="ad-card" id="${l.id}"><h2>${i + 1} ${l.title}</h2>`;
    if (l.packages) {
      const big = G.slice().sort((a, b) => b.sales - a.sales)[0];
      h += `<p class="ad-sub">Every package group that has its own page: when it launched, what it sold, and a link to its page. Tap a group name to open its page, or a number to see that group’s packages.</p>
        <p class="ad-sub"><b>What to watch.</b> ${pkdEsc(big.name)} has ${pkdOpen(big, pkdN(big.sales) + ' sales', big.sales)}. Groups are not added up: two of them can share an offer.</p>
        <div class="pd-bar"><button class="ad-btn" id="pkdAll" type="button" aria-pressed="${pkdTs.pdtab && pkdTs.pdtab.more ? 'true' : 'false'}">All columns</button></div>
        <div>${pkdPhone('pdtab')}<table id="pdtab"></table></div>
        <p class="pd-note">The 2026 brochure deals are on Active Deals Performance (Offers), not here.</p></section>`;
    } else {
      h += `<p class="ad-sub">${pkdEsc(l.what)}</p><div>${pkdPhone(l.tbl)}<table id="${l.tbl}"></table></div></section>`;
    }
  });
  h += `<details class="more"><summary>How these numbers are counted</summary>
      <p class="ad-sub">Only Packages carries figures. The other lists give the campaign, when it ran, and who may open its page; the numbers are on the page itself.</p>
      <p class="ad-sub"><b>Launched</b> is the day of the first sale at the till under a package's name: Phorest keeps no launch date, and a price test never sets it. <b>Last sold</b> is the latest such sale.</p>
      <p class="ad-sub"><b>Sales</b> are distinct sales (branch, date, sale number): a package is one sale made of lines, so we count sales, not lines. Only packages with their name at the till are in the total. A price test, where a package left no name and its page found it by price, is a guess, so it sits beside the total as "+N by price" and is in no total.</p>
      <p class="ad-sub"><b>Clients</b> are the different people on that group's page. They are never added across groups, so one person is one client.</p>
      <p class="ad-sub">Two groups can share offers (Polish and Pamper, Peaceful Pause), so adding the rows up would count a sale twice and the page has no grand total. Sale lines start on 23 May 2021, so a launch before that cannot show. Bahrain has none of these packages, and Marasy (closed) is included where it sold. A row is left out for anyone who cannot open that page.</p></details>`;
  el.innerHTML = h;
  pkdTables(); pkdRail(true);
  const all = document.getElementById('pkdAll');
  if (all) all.addEventListener('click', () => { const T = pkdTs.pdtab; if (T) { T.toggleMore(); all.setAttribute('aria-pressed', T.more ? 'true' : 'false'); } });
  const sel = document.getElementById('pkdSort');
  if (sel) {
    pkdSyncSort();
    sel.addEventListener('change', () => {
      const s = PKD_SORTS.find(x => x[0] === sel.value);
      if (s && s[2]) Object.keys(pkdTs).forEach(id => { const T = pkdTs[id]; if (T && T.cfg.cols.some(c => c.k === s[2])) { T.sort = { k: s[2], dir: s[3] }; T.page = 0; T.draw(); } });
    });
  }
}

// ── ON THIS PAGE rail (the same shell as Active Deals Performance's), built from the lists this reader has ──────────
function pkdRail(on) {
  const shell = document.getElementById('pdShell'), side = document.getElementById('pdSide');
  if (!shell || !side) return;
  shell.classList.toggle('rv-norail', !on);
  const nav = side.querySelector('.side-nav'); if (!nav) return;
  const items = on ? pkdVis.map((l, i) => [l.id, (i + 1) + ' ' + l.rail]) : [], sig = items.map(x => x[0]).join(',');
  if (on && nav.dataset.sig !== sig) {
    nav.dataset.sig = sig;
    nav.innerHTML = '<div class="side-k">On this page</div>' + items.map(r => `<a href="#${r[0]}" onclick="lgJump(event,'${r[0]}')">${r[1]}</a>`).join('');
  }
  if (typeof spy === 'function') spy();
}
