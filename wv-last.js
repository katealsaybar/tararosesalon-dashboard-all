// Wellness Voucher Blast, 4th blast: the last push (Kate, 23 Oct 2026), a page of its own. It was first drawn at the top of the 3rd blast's page (wv-blast.js) and
// covered it, so it moved here. Loads after wv-blast.js in the same lazy group and borrows its helpers (wvOk, wvPerfOnly, wvAed, wvPct, wvDay, wvBoughtLine,
// wvPayName, WV_BR, WV_PER) and Lost Clients' (lcEsc, lcNum, lgx*).
// ---- The last push (Kate, 23 Oct 2026): the final WhatsApp push before the voucher closes on 31 Oct, 312 clients in two lists, launched by hand from
// respond.io on Mon 26 Oct (not through the site queue, so what was really sent is not visible here). wv_lastpush_performance (the money, Level 3 and above) and
// wv_lastpush_get (the list, Level 3 and 5), migrations/wv_lastpush.sql. Null until the functions are live: the section stays out and the page draws as before.
const WV_LP_LAUNCH = '2026-10-26';
const WV_LP_RATE = 0.1753;   // AED a marketing message: USD 0.046 at the 3.81 the company card pays (0.17526), the rate passed to the function
let wvLp = null, wvLpRows = null, wvLpPage = 1, wvLpSel = { seg: 'all', state: 'tomsg', per: 20, sort: null };
try { Object.assign(wvLpSel, JSON.parse(localStorage.getItem('trs-wv-lastpush') || '{}')); } catch (e) {}
const wvLpSave = () => { try { localStorage.setItem('trs-wv-lastpush', JSON.stringify(wvLpSel)); } catch (e) {} };
const wvAed1 = n => 'AED ' + (Math.round((+n || 0) * 10) / 10).toLocaleString('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const wvLpBalance = k => k === 'SA' ? 'Saadiyat (SA balance)' : 'KCA, AQ and MC (shared balance)';
const wvLpSegName = k => k === 'warm' ? 'Warm: asked about it before' : 'Clean: not messaged before';
const wvLpOut = r => !!(r.bought_before || r.stop);   // left out of the send: she bought after the list was built, or she is on a stop list now
const wvLpSince = r => !r.bought_before && !!r.bought_on && String(r.bought_on) >= WV_LP_LAUNCH;
const wvLpWhy = r => r.bought_before ? 'Bought a voucher before the launch' : r.stop ? 'On a stop list' + (r.stop_why ? ': ' + r.stop_why : '') : '';
// Sortable headers (Kate, 23 Oct 2026, "like Google Sheets"): click a header to sort A to Z or low to high, again for the other way, a third time to go back
// to the list's own order. Empty cells always sit last. Copy numbers and the files follow the sort, because they read wvLpFiltered.
const WV_LP_COLS = [['Client', 'client', 't'], ['List', 'seg', 't'], ['WhatsApp balance', 'bal', 't'], ['2026 spend', 'spend', 'n'], ['Last visit', 'last_visit', 'd'], ['Last wrote to us', 'last_wrote', 'd'], ['Phone', 'phone', 't'], ['Status', 'status', 's']];
const wvLpKey = (r, k) => k === 'bal' ? (r.branch === 'SAA' ? 'SA' : 'Shared') : k === 'status' ? (wvLpOut(r) ? 2 : wvLpSince(r) ? 1 : 0) : k === 'last_wrote' || k === 'last_visit' ? String(r[k] || '').slice(0, 10) : r[k];
function wvLpSorted(rows) {
  const s = wvLpSel.sort, col = s && WV_LP_COLS.find(c => c[1] === s.k);
  if (!col) return rows;
  const dir = s.dir === 'desc' ? -1 : 1, empty = v => v == null || v === '';
  return rows.slice().sort((x, y) => {
    const a = wvLpKey(x, col[1]), b = wvLpKey(y, col[1]);
    if (empty(a) && empty(b)) return 0;
    if (empty(a)) return 1;
    if (empty(b)) return -1;
    const c = col[2] === 'n' || col[2] === 's' ? (+a) - (+b) : String(a).localeCompare(String(b), 'en', { sensitivity: 'base', numeric: true });
    return c * dir;
  });
}
function wvLpSort(k) {
  const s = wvLpSel.sort;
  wvLpSel.sort = !s || s.k !== k ? { k, dir: 'asc' } : s.dir === 'asc' ? { k, dir: 'desc' } : null;
  wvLpSave(); wvLpPage = 1;
  const t = document.getElementById('wvLpTable'); if (t) t.innerHTML = wvLpTableHtml();
}
function wvLpFiltered() {
  let rows = wvLpRows || [];
  if (wvLpSel.seg !== 'all') rows = rows.filter(r => r.seg === wvLpSel.seg);
  if (wvLpSel.state === 'tomsg') rows = rows.filter(r => !wvLpOut(r));
  else if (wvLpSel.state === 'left') rows = rows.filter(wvLpOut);
  else if (wvLpSel.state === 'bought') rows = rows.filter(wvLpSince);
  return wvLpSorted(rows);
}
function wvLpTable(title, rows, label, rate) {
  const tr = rows.map(r => `<tr><td>${lcEsc(label(r.k))}</td><td>${lcNum(r.listed)}</td><td>${lcNum(r.to_message)}</td><td>${wvAed1(r.to_message * rate)}</td><td>${lcNum(r.bought)}</td><td>${wvAed(r.aed)}</td></tr>`).join('');
  return `<div class="wv-pbox"><h4>${title}</h4><div class="wv-pscroll"><table class="slv-table wv-ptbl"><thead><tr><th></th><th>On the list</th><th>To message</th><th>Estimated cost</th><th>Bought</th><th>AED collected</th></tr></thead><tbody>${tr}</tbody></table></div></div>`;
}
function wvLastHtml() {
  const p = wvLp; if (!p || !p.totals) return '';
  const t = p.totals, rate = +p.rate || WV_LP_RATE, cost = t.to_message * rate, per = t.bought ? t.aed / t.bought : 0;
  const by = (arr, k) => (arr || []).find(x => x.k === k) || { listed: 0, to_message: 0 };
  const sa = by(p.by_waba, 'SA'), sh = by(p.by_waba, 'Shared'), warm = by(p.by_seg, 'warm'), clean = by(p.by_seg, 'clean');
  const card = (n, ti, d) => `<div class="ll-card wv-pcard"><div class="ll-t">${ti}</div><div class="ll-n">${n}</div><div class="ll-d">${d}</div></div>`;
  const o = p.other || {};
  const tiers = (p.by_tier || []).map(x => `${lcEsc(({ D: 'Dip Your Toes', S: 'Season of You', V: 'All-In VIP Year' })[x.k] || x.k)} ${lcNum(x.vouchers)} (${wvAed(x.aed)})`).join(' · ');
  const pays = (p.by_pay || []).map(x => `${lcEsc(wvPayName(x.k) || x.k)} ${lcNum(x.vouchers)}`).join(' · ');
  const left = t.bought_before + t.stopped;
  return `<section class="wv-perf" id="wvLast"><h3>The last push, Mon 26 Oct</h3>
    <p class="slv-note">The final WhatsApp push before the voucher closes on 31 Oct, sent by hand from respond.io: <b>${lcNum(warm.listed)}</b> warm (tapped Tell me more or Reserve mine on the 15 and 16 Oct blast and have not bought) and <b>${lcNum(clean.listed)}</b> clean (top spenders we have not messaged before, 2026 spend AED 2,000+, no lightening service in the last 12 months because Blonde is now January).</p>
    <div class="ll-cards wv-pcards">
      ${card(lcNum(t.listed), 'On the list', `${lcNum(warm.listed)} warm · ${lcNum(clean.listed)} clean, listed ${lcEsc(wvDay('2026-10-23'))}`)}
      ${card(lcNum(t.to_message), 'To message', left ? `${lcNum(left)} left out: ${lcNum(t.bought_before)} bought a voucher since the list was built, ${lcNum(t.stopped)} on a stop list` : 'nobody left out yet')}
      ${card(wvAed1(cost), 'Estimated cost', `${lcNum(sa.to_message)} on the SA balance (${wvAed1(sa.to_message * rate)}) · ${lcNum(sh.to_message)} on the shared balance (${wvAed1(sh.to_message * rate)})`)}
      ${card(lcNum(t.bought), 'Bought since the launch', t.bought ? `${wvPct(t.bought, t.to_message)} of those to message, ${lcNum(t.vouchers)} voucher${t.vouchers === 1 ? '' : 's'}` : 'launch is Mon 26 Oct, nobody yet')}
      ${card(wvAed(t.aed), 'AED collected', t.bought ? `${wvAed(per)} per buyer, VAT included` : 'no buyer yet')}
      ${card(cost && t.aed ? wvAed1(t.aed / cost) : '–', 'Back for every AED 1 spent', 'AED collected divided by the estimated cost')}
    </div>
    ${tiers || pays ? `<p class="slv-note">Bought: ${tiers}${tiers && pays ? '. Paid by ' : ''}${pays}.</p>` : ''}
    ${o.vouchers ? `<p class="slv-note"><b>${lcNum(o.vouchers)}</b> other voucher${o.vouchers === 1 ? '' : 's'} (${wvAed(o.aed)}) sold since the launch to clients who are not on this list. They are not counted above.</p>` : ''}
    <div class="wv-pgrid">
      ${wvLpTable('By list', p.by_seg || [], k => wvLpSegName(k), rate)}
      ${wvLpTable('By WhatsApp balance', p.by_waba || [], k => wvLpBalance(k), rate)}
      ${wvLpTable('By branch', p.by_branch || [], k => WV_BR[k] || k, rate)}
    </div>
    ${wvLpRows ? wvLpListHtml() : ''}
    <p class="slv-note">The cost is an estimate: the clients to message times AED ${rate.toFixed(4)} (USD 0.046 at 3.81). Meta's invoice has the exact figure. The balance follows the client's branch (Saadiyat has its own WhatsApp balance, KCA, MC and AQ share one), so it moves if the call centre number sends from another balance. Bought is a Phorest voucher sale from ${lcEsc(wvDay(WV_LP_LAUNCH))} on, matched by name, and the sales feed runs a day behind. We send by hand, so this page cannot see what was actually sent.</p></section>`;
}
function wvLpListHtml() {
  const rows = wvLpRows || [];
  const n = f => rows.filter(f).length;
  const chip = (k, v, l) => `<button type="button" class="ll-fchip${wvLpSel[k] === v ? ' on ll-act' : ''}" onclick="wvLpSet('${k}','${v}')">${l}</button>`;
  return `<div class="ll-panel" id="wvLpPanel">
    <div class="ll-filters">
      <div class="ll-chips"><span class="slv-note">List</span>${chip('seg', 'all', 'Both')}${chip('seg', 'warm', 'Warm (' + lcNum(n(r => r.seg === 'warm')) + ')')}${chip('seg', 'clean', 'Clean (' + lcNum(n(r => r.seg === 'clean')) + ')')}</div>
      <div class="ll-chips"><span class="slv-note">Show</span>${chip('state', 'tomsg', 'To message (' + lcNum(n(r => !wvLpOut(r))) + ')')}${chip('state', 'left', 'Left out (' + lcNum(n(wvLpOut)) + ')')}${chip('state', 'bought', 'Bought since launch (' + lcNum(n(wvLpSince)) + ')')}${chip('state', 'all', 'Everyone (' + lcNum(rows.length) + ')')}</div>
      <button type="button" class="tglr lc-btn" onclick="wvLpCopy()" title="Copy the numbers shown, one per line">Copy numbers</button>
      <button type="button" class="tglr lc-btn" onclick="wvLpFile('xlsx')">XLSX</button>
      <button type="button" class="tglr lc-btn" onclick="wvLpFile('csv')">CSV</button>
      <span id="wvLpCount" class="slv-note" style="display:inline"></span>
      <span id="wvLpNote" class="slv-note" style="display:inline"></span>
    </div>
    <div id="wvLpTable">${wvLpTableHtml()}</div></div>`;
}
function wvLpStatus(r) {
  if (r.bought_before) return `<span class="ll-pill ll-num" title="${lcEsc(wvLpWhy(r))}">Bought already</span>`;
  if (r.stop) return `<span class="ll-pill ll-num" title="${lcEsc(wvLpWhy(r))}">Stop list</span>`;
  if (wvLpSince(r)) return '<span class="ll-pill ll-act">Bought</span>';
  return '<span class="ll-pill ll-act" title="To message on Mon 26 Oct">To message</span>';
}
function wvLpTableHtml() {
  const rows = wvLpFiltered(), per = WV_PER.includes(wvLpSel.per) ? wvLpSel.per : 20;
  const pages = Math.max(1, Math.ceil(rows.length / per));
  wvLpPage = Math.min(Math.max(1, wvLpPage), pages);
  const shown = rows.slice((wvLpPage - 1) * per, wvLpPage * per), from = (wvLpPage - 1) * per + 1;
  const cols = WV_LP_COLS;
  const tr = shown.map(r => `<tr${wvLpSince(r) ? ' class="wv-bought"' : ''}>
      <td>${lcEsc(r.client)}<div class="slv-note">${lcEsc(WV_BR[r.branch] || r.branch)}</div></td>
      <td class="ll-nw"><span class="ll-tag">${r.seg === 'warm' ? 'Warm' : 'Clean'}</span></td>
      <td class="ll-nw">${r.branch === 'SAA' ? 'SA' : 'Shared'}</td>
      <td class="ll-nw">${lcNum(Math.round(r.spend))}</td>
      <td class="ll-nw">${lcEsc(wvDay(r.last_visit))}</td>
      <td class="ll-nw">${r.last_wrote ? lcEsc(wvDay(r.last_wrote)) : '<span class="slv-muted">–</span>'}</td>
      <td class="ll-ph">${r.phone ? `<a href="tel:${lcEsc(r.phone)}" style="color:inherit;white-space:nowrap">${lcEsc(r.phone)}</a>` : '–'}</td>
      <td>${wvLpStatus(r)}${wvLpSince(r) ? `<div class="slv-note">${lcEsc(wvDay(r.bought_on))} · ${lcEsc(wvBoughtLine(r))}</div>` : ''}</td></tr>`).join('');
  const cards = shown.map(r => `<li class="prd-card${wvLpSince(r) ? ' wv-bought' : ''}"><div class="prd-body">
      <div class="prd-top"><span class="prd-name">${lcEsc(r.client)}</span><span>${wvLpStatus(r)}</span></div>
      <div class="prd-meta">${lcEsc(WV_BR[r.branch] || r.branch)} · ${r.seg === 'warm' ? 'Warm' : 'Clean'} · AED ${lcNum(Math.round(r.spend))}</div>
      ${wvLpSince(r) ? `<div class="prd-meta wv-bought-line"><b>Bought ${lcEsc(wvDay(r.bought_on))}</b> · ${lcEsc(wvBoughtLine(r))}</div>` : ''}
      ${r.phone ? `<div class="prd-meta" style="margin-top:4px"><a href="tel:${lcEsc(r.phone)}" style="color:inherit">${lcEsc(r.phone)}</a></div>` : ''}</div></li>`).join('');
  setTimeout(() => { const c = document.getElementById('wvLpCount'); if (c) c.textContent = `${lcNum(rows.length)} shown`; }, 0);
  return `<div class="slv-wrap prd-desk lc-wrap ll-wrap"><table class="slv-table"><thead><tr>${WV_LP_COLS.map(c => { const on = wvLpSel.sort && wvLpSel.sort.k === c[1], d = on ? wvLpSel.sort.dir : ''; return `<th aria-sort="${d === 'asc' ? 'ascending' : d === 'desc' ? 'descending' : 'none'}"><button type="button" class="wv-sort${on ? ' on' : ''}" onclick="wvLpSort('${c[1]}')" title="Sort by ${lcEsc(c[0])}">${lcEsc(c[0])}<span class="wv-sortic" aria-hidden="true">${d === 'asc' ? '▲' : d === 'desc' ? '▼' : '↕'}</span></button></th>`; }).join('')}</tr></thead>
      <tbody>${tr || `<tr><td colspan="${cols.length}" class="slv-muted">No one matches those filters.</td></tr>`}</tbody></table></div>
      <ol class="prd-cards">${cards || '<li class="slv-muted">No one matches those filters.</li>'}</ol>
      ${rows.length ? `<div class="lc-pager">
        <div class="lc-pg-size"><span class="slv-note">Show</span><div class="sc-seg" role="group" aria-label="Rows per page">${WV_PER.map(v => `<button type="button" class="${v === per ? 'on' : ''}" onclick="wvLpSet('per',${v})">${v}</button>`).join('')}</div></div>
        <div class="lc-pg-nav"><span class="lc-pg-txt">Page <b>${wvLpPage}</b> of <b>${lcNum(pages)}</b><span class="slv-note"> · ${lcNum(from)}–${lcNum(from + shown.length - 1)} of ${lcNum(rows.length)}</span></span>
          <button type="button" class="tglr" onclick="wvLpGo(-1)"${wvLpPage <= 1 ? ' disabled' : ''}>‹ Prev</button>
          <button type="button" class="tglr" onclick="wvLpGo(1)"${wvLpPage >= pages ? ' disabled' : ''}>Next ›</button></div></div>` : ''}`;
}
function wvLpRepaint() { const b = document.getElementById('wvLpPanel'); if (b) b.outerHTML = wvLpListHtml(); }
function wvLpSet(k, v) { wvLpSel[k] = v; wvLpSave(); wvLpPage = 1; wvLpRepaint(); }
function wvLpGo(d) { wvLpPage += d; const b = document.getElementById('wvLpTable'); if (b) b.innerHTML = wvLpTableHtml(); }
function wvLpSay(t) { const n = document.getElementById('wvLpNote'); if (n) n.textContent = t; }
async function wvLpCopy() {
  const nums = [...new Set(wvLpFiltered().filter(r => r.phone).map(r => r.phone))];
  try { await navigator.clipboard.writeText(nums.join('\n')); }
  catch (e) { wvLpSay('The browser would not copy. Use the file instead.'); return; }
  wvLpSay(`Copied ${lcNum(nums.length)} numbers`);
}
function wvLpFile(kind) {
  if (typeof lgxBuild !== 'function') return;
  const rows = wvLpFiltered();
  const head = ['Client', 'Branch', 'List', 'WhatsApp balance', '2026 spend (AED)', 'Last visit', 'Last wrote to us', 'Phone', 'Status', 'Bought on', 'Voucher', 'Paid (AED)', 'Paid via'];
  const num = new Set(['2026 spend (AED)', 'Paid (AED)']);
  const lines = rows.map(r => [r.client, WV_BR[r.branch] || r.branch, r.seg === 'warm' ? 'Warm' : 'Clean', r.branch === 'SAA' ? 'SA' : 'Shared', Math.round(r.spend), r.last_visit || '', r.last_wrote ? String(r.last_wrote).slice(0, 10) : '',
    r.phone || '', wvLpOut(r) ? wvLpWhy(r) : wvLpSince(r) ? 'Bought since the launch' : 'To message', r.bought_on || '', r.bought_serial || '', r.bought_on ? Math.round(r.bought_aed) : '', r.bought_on ? wvPayName(r.bought_pay) : '']);
  const pi = head.indexOf('Phone');
  const out = kind === 'csv' ? lines.map(l => l.map((v, j) => j === pi && v ? `="${v}"` : v)) : lines;   // as lost-lists.js: Excel would show 9.72E+11
  const built = lgxBuild({ sheets: [{ name: 'Wellness Voucher last push', blocks: [{ cols: head.map(h => ({ label: h, fmt: num.has(h) ? 'num' : 'text' })), rows: out.map(l => ({ cells: l })) }] }] });
  const name = ['wellness-voucher-last-push', wvLpSel.seg !== 'all' ? wvLpSel.seg : '', wvLpSel.state === 'tomsg' ? 'to-message' : wvLpSel.state === 'all' ? '' : wvLpSel.state, new Date().toISOString().slice(0, 10)].filter(Boolean).join('-');
  if (kind === 'xlsx') lgxSave(lgxXlsxBlob(built), name + '.xlsx');
  else lgxSave(new Blob(['﻿' + lgxCsv(built[0])], { type: 'text/csv;charset=utf-8' }), name + '.csv');
  wvLpSay(`Saved ${lcNum(lines.length)} rows as ${kind.toUpperCase()}`);
}

// The page (a page of its own since 23 Oct 2026, Kate: the last push is the 4th blast and must not sit on top of the 3rd). Level 3 and above sees the money
// and the list; Level 4 sees the money only, like the 3rd blast's page.
async function renderWvLast() {
  const el = document.getElementById('wvLastContent');
  if (!el || !wvOk()) return;
  el.innerHTML = `<section class="slv-intro"><h2>Wellness Voucher Blast, 4th blast</h2>
    <p>The last push before the voucher closes on 31 Oct. The 3rd blast, waves 1 to 5, stays on its own page.${wvPerfOnly() ? ' This page shows the money only.' : ''}</p></section><div id="wvLastHost"><p class="slv-muted">Loading…</p></div>`;
  const host = () => document.getElementById('wvLastHost');
  try {
    const [lp, lr] = await Promise.all([sb.rpc('wv_lastpush_performance', { p_rate: WV_LP_RATE }), wvPerfOnly() ? Promise.resolve({ data: null, error: null }) : sb.rpc('wv_lastpush_get')]);
    wvLp = (!lp.error && lp.data && lp.data.totals) ? lp.data : null;
    wvLpRows = (!lr.error && Array.isArray(lr.data)) ? lr.data : null;
    if (lp.error) console.warn('wv_lastpush_performance', lp.error);
    if (lr.error) console.warn('wv_lastpush_get', lr.error);
  } catch (e) { console.error(e); wvLp = null; wvLpRows = null; }
  if (host()) host().innerHTML = wvLp ? wvLastHtml() : '<p class="slv-muted">The numbers did not load. Refresh to try again.</p>';
}
