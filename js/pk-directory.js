// Campaigns Directory (Kate, 26 Nov 2026): a table of contents of the package pages (Keratin, Pamper 2025, ADS 499, Hair Colour, Back to School and, once its page
// is on the dashboard, Dubai Daily Deals). One row per package group: when it launched, when it last sold, what it sold, and a link to its own page. Sorted oldest launch first
// by default; A to Z, most sales and most AED are one tap away in "Sort by", and every table heading has the Google Sheets menus.
// Each group's figures are the ones its own page shows in All time, read with the group's own function in summary mode (pk_keratin(true), pk_pamper_2025(true), pk_ads499(true),
// pk_hair_colour(true), pk_back_to_school(true), pk_dubai_deals(true)): totals only, Level 2 and above, no client rows. Nothing is added across groups (two of them can share an
// offer), so the page has no grand total. A price test is never inside a total: it sits beside it as "+N by price". Lifetime figures, so the masthead's Branch and Period are not used.
// Self-contained: it needs sb, TRS_LEVEL, TRS_PAGES, TRSD (drill.js), TRSheet (sheet-table.js), whyWall(), trsPlain(), showView().
const PKD_GROUPS = [
  { id: 'pkpamper', name: 'Pamper Packages 2025', cat: 'PACKAGES (April 2025 post)', fn: 'pk_pamper_2025' },
  { id: 'pkkeratin', name: 'Keratin Packages', cat: '1TREATMENT - KERATIN', fn: 'pk_keratin' },
  { id: 'pkschool', name: 'Back to School Offer', cat: 'PACKAGES (Back to School)', fn: 'pk_back_to_school' },
  { id: 'pkhaircolour', name: 'Hair Colour Packages', cat: '1HAIR COLOR', fn: 'pk_hair_colour' },
  { id: 'pkads499', name: 'ADS 499 Packages', cat: 'ADS - PACKAGE', fn: 'pk_ads499' },
  { id: 'pkdubai', name: 'Dubai Daily Deals', cat: 'DUBAI DEALS', fn: 'pk_dubai_deals' }
];
const PKD_SORTS = [['fs-1', 'Launched, oldest first', 'fs', 1], ['fs--1', 'Launched, newest first', 'fs', -1], ['g-1', 'A to Z', 'g', 1], ['g--1', 'Z to A', 'g', -1],
  ['s--1', 'Most sales', 's', -1], ['a--1', 'Most AED', 'a', -1], ['own', 'A column heading', '', 0]];
let pkdRows = [], pkdFailed = [], pkdAt = '', pkdBusy = false, pkdT = null, pkdWin = {};

const pkdEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pkdN = v => Math.round(Number(v) || 0).toLocaleString('en-GB');
const pkdSum = (l, k) => l.reduce((a, r) => a + (Number(r[k]) || 0), 0);
const pkdOk = () => typeof TRS_LEVEL !== 'undefined' && TRS_LEVEL >= 2;
const pkdDay = iso => { try { return iso ? new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '–'; } catch (e) { return iso || '–'; } };
const pkdWhen = iso => { try { return new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).replace(' at ', ', '); } catch (e) { return ''; } };
const pkdPl = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
// The page of a group: a link that opens it inside the dashboard (a click with a modifier key opens it in a new tab as a link should).
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
  // A group is listed once its page is on the dashboard, so the Directory never points at a page that is not there.
  const live = PKD_GROUPS.filter(m => typeof TRS_PAGES !== 'undefined' && TRS_PAGES.some(p => p.id === m.id));
  const res = await Promise.allSettled(live.map(m => sb.rpc(m.fn, { p_summary: true })));
  const rows = [], bad = []; let at = '';
  res.forEach((r, i) => {
    const d = r.status === 'fulfilled' && !r.value.error ? r.value.data : null;
    if (d && Array.isArray(d.packages)) { rows.push(pkdPrep(live[i], d)); if (d.at && d.at > at) at = d.at; } else { bad.push(live[i].name); console.error(live[i].fn, r.reason || (r.value && r.value.error)); }
  });
  pkdRows = rows; pkdFailed = bad; pkdAt = at; pkdBusy = false; pkdWin = {};
  pkdPaint();
}

// The window a figure opens: the packages of that group. The sales behind a package are on the group's own page, one tap on.
function pkdSpec(g) {
  return { title: g.name, tip: 'See the packages', cur: 'AED', views: [{ id: 'packages', label: 'Packages', load: async () => {
    const c = g.pk.filter(p => p.cnt), plain = p => p.sales ? pkdGo(g.id, pkdN(p.sales)) : '<span class="ad-zero">0</span>';
    const tag = p => p.sales ? (p.cnt ? '<span class="ad-tag ok">Exact</span>' : '<span class="ad-tag warn">Price test</span>') : '<span class="ad-tag">No sale</span>';
    return {
      sub: g.cat + ' · ' + pkdPl(g.n, 'package') + ' · ' + pkdPl(g.sales, 'sale') + ' · AED ' + pkdN(g.aed) + (g.clients == null ? '' : ' · ' + pkdPl(g.clients, 'client')),
      note: 'This is the last step here: the sales behind a package, line by line, are on the page for ' + g.name + ' (tap a number to open it). '
        + (g.pkSales !== g.sales ? 'One sale holds two packages, so the packages add to ' + pkdN(g.pkSales) + ' and the sales are ' + pkdN(g.sales) + '. ' : '')
        + (g.pt.length ? 'The price test (' + pkdPl(g.ptS, 'sale') + ', AED ' + pkdN(g.ptA) + ') is not in the total. ' : ''),
      cols: [{ k: 'n', l: 'Package' }, { k: 'pl', l: 'Price' }, { k: 'ct', l: 'Match', t: 'html' }, { k: 'f', l: 'First sold', t: 'date' }, { k: 'l', l: 'Last sold', t: 'date' },
        { k: 's', l: 'Sales', t: 'html' }, { k: 'a', l: 'AED', t: 'html' }, { k: 'c', l: 'Clients', t: 'html' }],
      rows: g.pk.map(p => ({ n: p.n, pl: p.pl || '–', ct: tag(p), f: p.first || '', l: p.last || '', s: plain(p), a: p.sales ? pkdGo(g.id, pkdN(p.aed)) : '<span class="ad-zero">0</span>',
        c: p.clients == null ? '–' : (p.sales ? pkdGo(g.id, pkdN(p.clients)) : '<span class="ad-zero">0</span>'), _cls: p.cnt ? '' : 'pp-off' })),
      foot: { n: 'Total: ' + c.length + ' counted' + (g.pk.length > c.length ? ' (the rest left out)' : ''), s: pkdN(g.pkSales), a: pkdN(g.aed) } };
  } }] };
}

function pkdSyncSort() {
  const sel = document.getElementById('pkdSort'); if (!sel || !pkdT) return;
  const key = pkdT.sort ? pkdT.sort.k + '-' + pkdT.sort.dir : '', hit = PKD_SORTS.find(s => s[0] === key), v = hit ? hit[0] : (pkdT.sort ? 'own' : 'fs-1');
  if (sel.value !== v) sel.value = v;
}

function pkdTable() {
  if (typeof TRSheet === 'undefined' || !document.getElementById('pdtab')) return;
  const old = pkdT, col = (k, l, t, raw, disp, cell, x) => ({ k, l, t, raw, disp, cell, x });
  const T = TRSheet.table({ id: 'pdtab', el: '#pdtab', rows: () => pkdRows, limit: 10, after: pkdSyncSort, cols: [
    col('g', 'Package group', 'text', g => g.name, g => g.name, g => '<b>' + pkdGo(g.id, pkdEsc(g.name)) + '</b><span class="pd-sub">' + pkdEsc(g.cat) + ' · ' + pkdPl(g.n, 'package') + '</span>'),
    col('fs', 'Launched', 'text', g => g.first, g => pkdDay(g.first), g => pkdDay(g.first)),
    col('ls', 'Last sold', 'text', g => g.last, g => pkdDay(g.last), g => pkdDay(g.last)),
    col('pk', 'Packages sold', 'num', g => g.withSale, g => g.withSale + ' of ' + g.n, g => pkdOpen(g, g.withSale + ' of ' + g.n, g.n)),
    col('s', 'Sales', 'num', g => g.sales, g => String(g.sales), g => pkdOpen(g, pkdN(g.sales), g.sales) + (g.ptS ? '<span class="pd-sub">' + pkdOpen(g, '+' + g.ptS + ' by price', g.ptS) + '</span>' : '')),
    col('a', 'AED', 'num', g => g.aed, g => pkdN(g.aed), g => pkdOpen(g, pkdN(g.aed), g.sales)),
    col('c', 'Clients', 'num', g => g.clients == null ? -1 : g.clients, g => g.clients == null ? '–' : String(g.clients), g => g.clients == null ? '<span class="ad-zero">–</span>' : pkdOpen(g, pkdN(g.clients), g.clients)),
    col('mt', 'Match', 'text', g => g.match, g => g.match, g => '<span class="ad-tag ' + (g.pt.length ? 'warn' : 'ok') + '">' + pkdEsc(g.match) + '</span>', true),
    col('av', 'AED a sale', 'num', g => g.sales ? Math.round(g.aed / g.sales) : 0, g => g.sales ? pkdN(g.aed / g.sales) : '–', g => g.sales ? pkdN(g.aed / g.sales) : '<span class="ad-zero">–</span>', true)
  ] });
  T.sort = old ? old.sort : { k: 'fs', dir: 1 }; if (old) { T.f = old.f; T.more = old.more; }
  pkdT = T; T.draw();
}

function pkdPaint() {
  const el = document.getElementById('pkDirContent'); if (!el) return;
  const head = `<div class="ad-top"><div><h1 class="ad-t">Campaigns Directory</h1><p class="ad-sub">${pkdAt ? 'As of ' + pkdEsc(pkdWhen(pkdAt)) + '. ' : ''}Every package page, in one list.</p></div>
    <div class="ad-toplinks"><button class="ad-btn" type="button" onclick="renderCampaignsDirectory(true)">Refresh</button></div></div>`;
  if (!pkdRows.length) { el.innerHTML = head + `<div class="ad-state">The directory did not load. Press Refresh to try again.</div>`; return; }
  const G = pkdRows, big = G.slice().sort((a, b) => b.sales - a.sales)[0], one = G.slice().sort((a, b) => a.sales - b.sales)[0];
  const first = G.map(g => g.first).filter(Boolean).sort()[0], last = G.map(g => g.last).filter(Boolean).sort().slice(-1)[0];
  let h = head + whyWall([
    ['Why this page', 'Each package group has its own page. This is the one list that points to all of them, oldest launch first, so nobody has to remember they exist.'],
    ['Why now', 'Active Deals Performance covers only the 2026 brochure. The older package groups were archived in Phorest, so their results sit on separate pages that are easy to lose.'],
    ['If we do nothing', 'Nobody finds the old results, and the next package is priced without knowing what the last ones sold.']]);
  h += `<section class="ad-card" id="pd-directory"><h2>Directory</h2>
    <p class="ad-sub">${G.length} package groups, from ${pkdEsc(pkdDay(first))} to ${pkdEsc(pkdDay(last))}. Tap a group name to open its page, or a number to see that group's packages.</p>
    <p class="ad-sub"><b>What to watch.</b> ${pkdEsc(big.name)} has ${pkdOpen(big, pkdN(big.sales) + ' sales', big.sales)}, and ${pkdEsc(one.name)} has only ${pkdOpen(one, pkdN(one.sales) + ' sale' + (one.sales === 1 ? '' : 's'), one.sales)}. Groups are not added up: two of them can share an offer.</p>
    ${pkdFailed.length ? `<p class="ad-sub"><span class="ad-status warn"><span aria-hidden="true">!</span>${pkdEsc(pkdFailed.join(', '))} did not load, so ${pkdFailed.length === 1 ? 'it is' : 'they are'} not listed. Press Refresh.</span></p>` : ''}
    <div class="pd-bar"><div class="pd-sort"><label for="pkdSort">Sort by</label><select id="pkdSort" aria-label="Sort by">${PKD_SORTS.map(s => `<option value="${s[0]}">${s[1]}</option>`).join('')}</select></div>
      <button class="ad-btn" id="pkdAll" type="button" aria-pressed="${pkdT && pkdT.more ? 'true' : 'false'}">All columns</button></div>
    <div><button type="button" class="ad-btn ad-phone" data-sxcm="pdtab" aria-label="Sort and filter">Sort or filter</button><table id="pdtab"></table></div>
    <p class="pd-note">The 2026 brochure deals are on Active Deals Performance, not here.</p></section>
    <details class="more"><summary>How these numbers are counted</summary>
      <p class="ad-sub"><b>Launched</b> is the day of the first sale at the till under a package's name: Phorest keeps no launch date, and a price test never sets it. <b>Last sold</b> is the latest such sale.</p>
      <p class="ad-sub"><b>Sales</b> are distinct sales (branch, date, sale number): a package is one sale made of lines, so we count sales, not lines. Only packages with their name at the till are in the total. A price test, where a package left no name and its page found it by price, is a guess, so it sits beside the total as "+N by price" and is in no total.</p>
      <p class="ad-sub"><b>Clients</b> are the different people on that group's page. They are never added across groups, so one person is one client.</p>
      <p class="ad-sub">Two groups can share offers (Polish and Pamper, Peaceful Pause), so adding the rows up would count a sale twice and the page has no grand total. Sale lines start on 23 May 2021, so a launch before that cannot show. Bahrain has none of these packages, and Marasy (closed) is included where it sold. Level 2 and above, like Active Deals Performance.</p></details>`;
  el.innerHTML = h;
  pkdTable();
  const all = document.getElementById('pkdAll');
  if (all) all.addEventListener('click', () => { if (pkdT) { pkdT.toggleMore(); all.setAttribute('aria-pressed', pkdT.more ? 'true' : 'false'); } });
  const sel = document.getElementById('pkdSort');
  if (sel) { pkdSyncSort(); sel.addEventListener('change', () => { const s = PKD_SORTS.find(x => x[0] === sel.value); if (s && s[2] && pkdT) { pkdT.sort = { k: s[2], dir: s[3] }; pkdT.page = 0; pkdT.draw(); } }); }
}
