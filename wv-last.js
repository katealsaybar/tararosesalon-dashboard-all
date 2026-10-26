// Wellness Voucher Blast, 4th blast: the last push (Kate, 23 Oct 2026), a page of its own. It was first drawn at the top of the 3rd blast's page (wv-blast.js) and
// covered it, so it moved here. Loads after wv-blast.js in the same lazy group and borrows its helpers (wvOk, wvPerfOnly, wvAed, wvPct, wvDay, wvBoughtLine,
// wvPayName, WV_BR, WV_PER) and Lost Clients' (lcEsc, lcNum, lgx*).
// ---- The last push (Kate, 23 Oct 2026): the final WhatsApp push before the voucher closes on 31 Oct, 312 clients in two lists, sent from the Blast 4 send panel on this page
// (wv-lastsend.js) through respond.io on Mon 26 Oct; until then the numbers are the list. wv_lastpush_performance (the money, Level 3 and above) and
// wv_lastpush_get (the list, Level 3 and 5), migrations/wv_lastpush.sql. Null until the functions are live: the section stays out and the page draws as before.
const WV_LP_LAUNCH = '2026-10-26';
const WV_LP_RATE = 0.1753;   // AED a marketing message: USD 0.046 at the 3.81 the company card pays (0.17526), the rate passed to the function
let wvLp = null, wvLpRows = null, wvLpPage = 1, wvLpSel = { seg: 'all', state: 'tomsg', per: 20, sort: null };
try { Object.assign(wvLpSel, JSON.parse(localStorage.getItem('trs-wv-lastpush') || '{}')); } catch (e) {}
const wvLpSave = () => { try { localStorage.setItem('trs-wv-lastpush', JSON.stringify(wvLpSel)); } catch (e) {} };
const wvAed1 = n => 'AED ' + (Math.round((+n || 0) * 10) / 10).toLocaleString('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const wvLpSegName = k => k === 'warm' ? 'Warm: asked about it before' : 'Clean: not messaged before';
const wvLpOut = r => !!(r.bought_before || r.stop);   // left out of the send: she bought after the list was built, or she is on a stop list now
const wvLpSince = r => !r.bought_before && !!r.bought_on && String(r.bought_on) >= WV_LP_LAUNCH;
const wvLpWhy = r => r.bought_before ? 'Bought a voucher before the launch' : r.stop ? 'On a stop list' + (r.stop_why ? ': ' + r.stop_why : '') : '';
// Sortable headers (Kate, 23 Oct 2026, "like Google Sheets"): click a header to sort A to Z or low to high, again for the other way, a third time to go back
// to the list's own order. Empty cells always sit last. Copy numbers and the files follow the sort, because they read wvLpFiltered.
const WV_LP_COLS = [['Client', 'client', 't'], ['List', 'seg', 't'], ['2026 spend', 'spend', 'n'], ['Last visit', 'last_visit', 'd'], ['Last wrote to us', 'last_wrote', 'd'], ['Phone', 'phone', 't'], ['Status', 'status', 's']];
const wvLpKey = (r, k) => k === 'status' ? (wvLpOut(r) ? 2 : wvLpSince(r) ? 1 : 0) : k === 'last_wrote' || k === 'last_visit' ? String(r[k] || '').slice(0, 10) : r[k];
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
  const tr = rows.map(r => `<tr><td>${lcEsc(label(r.k))}</td><td>${lcNum(r.to_message)}<div class="slv-note">of ${lcNum(r.listed)} listed</div></td><td>${wvAed(r.to_message * rate)}<div class="slv-note">${r.aed ? `came in ${wvAed(r.aed)}, ${lcNum(r.bought)} bought` : 'nothing sold yet'}</div></td></tr>`).join('');
  return `<div class="wv-pbox"><h4>${title}</h4><div class="wv-pscroll"><table class="slv-table wv-ptbl"><thead><tr><th></th><th>To message</th><th>Cost (est.)</th></tr></thead><tbody>${tr}</tbody></table></div></div>`;
}
function wvLastHtml() {
  const p = wvLp; if (!p || !p.totals) return '';
  const t = p.totals, rate = +p.rate || WV_LP_RATE, cost = t.to_message * rate;
  const by = (arr, k) => (arr || []).find(x => x.k === k) || { listed: 0, to_message: 0 };
  const warm = by(p.by_seg, 'warm'), clean = by(p.by_seg, 'clean');
  const o = p.other || {};
  const tiers = (p.by_tier || []).map(x => `${lcEsc(({ D: 'Dip Your Toes', S: 'Season of You', V: 'All-In VIP Year' })[x.k] || x.k)} ${lcNum(x.vouchers)} (${wvAed(x.aed)})`).join(' · ');
  const pays = (p.by_pay || []).map(x => `${lcEsc(wvPayName(x.k) || x.k)} ${lcNum(x.vouchers)}`).join(' · ');
  const left = t.bought_before + t.stopped;
  const d4 = (typeof wvBlastData === 'function' ? wvBlastData() : []).find(d => d.key === 'b4');
  const block = wvBlockHtml({
    title: 'Blast 4: the last push', tag: d4 && !d4.planned ? 'Sent Mon 26 Oct' : 'Next: Mon 26 Oct', next: !(d4 && !d4.planned),
    intro: ['The last WhatsApp message before the voucher closes on 31 Oct, sent from this page through respond.io.', d4 && !d4.planned ? 'It was the last chance to reach clients who had not bought.' : 'It is the last chance to reach clients who have not bought.', d4 && !d4.planned ? 'Watch the full performance below as it fills in.' : 'Mon 26 Oct: press Send in the Blast 4 send panel below (Meta has approved both messages), or schedule it.'],
    line: d4 ? wvLine(d4) : '',
    what: 'A WhatsApp message to two lists: clients who asked about the voucher on Blast 3, and top spenders we have not messaged before.',
    who: `<b>${lcNum(warm.listed)} warm</b>: asked about the voucher on Blast 3 and have not bought.<br><b>${lcNum(clean.listed)} clean</b>: top spenders (2026 spend AED 2,000+) we have not messaged before. Anyone with a lightening service in the last 12 months is left out, because Blonde now starts in January.`,
    when: 'Mon 26 Oct.',
    stats: [[lcNum(t.to_message), 'To message', left ? `${lcNum(left)} left out of ${lcNum(t.listed)}` : `all ${lcNum(t.listed)} on the list`], [lcNum(t.vouchers), 'Vouchers sold', t.bought ? `${lcNum(t.bought)} client${t.bought === 1 ? '' : 's'}` : (d4 && !d4.planned ? 'none yet' : 'none yet, it has not gone out')], [wvAed(t.aed), 'AED collected'], [wvAed(cost), 'Cost (estimate)', `${lcNum(t.to_message)} to message × AED ${rate.toFixed(4)}`], [cost && t.aed ? wvBackTxt(t.aed, cost) : (d4 && !d4.planned ? 'nothing back yet' : 'not sent yet'), 'Back for every AED 1']],
    depth: typeof wvDepthHtml === 'function' ? wvDepthHtml('b4') : '',
    moreTitle: d4 && !d4.planned ? 'Break it down: the list that went out' : 'Break it down: the list before it goes out',
    more: `<div class="wv-pgrid">
      ${wvLpTable('By list', p.by_seg || [], k => wvLpSegName(k), rate)}
      ${wvLpTable('By branch', p.by_branch || [], k => WV_BR[k] || k, rate)}
    </div>
    ${tiers || pays ? `<p class="slv-note">Bought: ${tiers}${tiers && pays ? '. Paid by ' : ''}${pays}.</p>` : ''}`,
    fold: wvReadHtml(`${lcNum(t.to_message)} clients to message × AED ${rate.toFixed(4)} = about ${wvAed(cost)}. That is the cost.`, [
      ['To message', `The list minus clients who already bought or are on a stop list. Check it on the morning of the send.${left ? ` ${lcNum(left)} are left out now: ${lcNum(t.bought_before)} bought since the list was made, ${lcNum(t.stopped)} on a stop list.` : ''}`],
      ['Cost', `Clients to message × AED ${rate.toFixed(4)} (USD 0.046 at 3.81) before it goes out. Once it is sent from this page, the messages really sent. An estimate: Meta's invoice has the exact figure.`],
      ['WhatsApp balance', 'Every message goes from Call Center 2, so all of it comes off the shared balance (the one KCA, MC and AQ use), not Saadiyat\'s own.'],
      ['Bought', `A Phorest voucher sale from ${lcEsc(wvDay(WV_LP_LAUNCH))} on, matched by name. The sales feed runs a day behind.${o.vouchers ? ` ${lcNum(o.vouchers)} other voucher${o.vouchers === 1 ? '' : 's'} (${wvAed(o.aed)}) sold to clients not on this list are not counted.` : ''}`]])
  });
  return `<div id="wvLast">${block}
    ${typeof wvOk5 === 'function' && wvOk5() ? '<div id="wvLsBox"></div>' : ''}
    ${wvLpRows ? wvLpListHtml() : ''}</div>`;
}
function wvLpListHtml() {
  const rows = wvLpRows || [];
  const n = f => rows.filter(f).length;
  const chip = (k, v, l) => `<button type="button" class="ll-fchip${wvLpSel[k] === v ? ' on ll-act' : ''}" onclick="wvLpSet('${k}','${v}')">${l}</button>`;
  return `<div class="ll-panel" id="wvLpPanel">
    <h4 class="wv-h4">Blast 4: the send list</h4>
    <p class="slv-note wv-what"><b>Use it to</b> copy the numbers into respond.io, or save them as a file. Click a column heading to sort it.</p>
    <div class="ll-filters">
      <div class="ll-chips"><span class="slv-note">List</span>${chip('seg', 'all', 'Both')}${chip('seg', 'warm', 'Warm (' + lcNum(n(r => r.seg === 'warm')) + ')')}${chip('seg', 'clean', 'Clean (' + lcNum(n(r => r.seg === 'clean')) + ')')}</div>
      <div class="ll-chips"><span class="slv-note">Show</span>${chip('state', 'tomsg', 'To message (' + lcNum(n(r => !wvLpOut(r))) + ')')}${chip('state', 'left', 'Left out (' + lcNum(n(wvLpOut)) + ')')}${chip('state', 'bought', 'Bought (' + lcNum(n(wvLpSince)) + ')')}${chip('state', 'all', 'Everyone (' + lcNum(rows.length) + ')')}</div>
      <div class="wv-acts">
        <button type="button" class="tglr lc-btn" onclick="wvLpCopy()" title="Copy the numbers shown, one per line">Copy numbers</button>
        <button type="button" class="tglr lc-btn" onclick="wvLpFile('xlsx')">XLSX</button>
        <button type="button" class="tglr lc-btn" onclick="wvLpFile('csv')">CSV</button>
      </div>
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
  const head = ['Client', 'Branch', 'List', '2026 spend (AED)', 'Last visit', 'Last wrote to us', 'Phone', 'Status', 'Bought on', 'Voucher', 'Paid (AED)', 'Paid via'];
  const num = new Set(['2026 spend (AED)', 'Paid (AED)']);
  const lines = rows.map(r => [r.client, WV_BR[r.branch] || r.branch, r.seg === 'warm' ? 'Warm' : 'Clean', Math.round(r.spend), r.last_visit || '', r.last_wrote ? String(r.last_wrote).slice(0, 10) : '',
    r.phone || '', wvLpOut(r) ? wvLpWhy(r) : wvLpSince(r) ? 'Bought since the launch' : 'To message', r.bought_on || '', r.bought_serial || '', r.bought_on ? Math.round(r.bought_aed) : '', r.bought_on ? wvPayName(r.bought_pay) : '']);
  const pi = head.indexOf('Phone');
  const out = kind === 'csv' ? lines.map(l => l.map((v, j) => j === pi && v ? `="${v}"` : v)) : lines;   // as lost-lists.js: Excel would show 9.72E+11
  const built = lgxBuild({ sheets: [{ name: 'Wellness Voucher last push', blocks: [{ cols: head.map(h => ({ label: h, fmt: num.has(h) ? 'num' : 'text' })), rows: out.map(l => ({ cells: l })) }] }] });
  const name = ['wellness-voucher-last-push', wvLpSel.seg !== 'all' ? wvLpSel.seg : '', wvLpSel.state === 'tomsg' ? 'to-message' : wvLpSel.state === 'all' ? '' : wvLpSel.state, new Date().toISOString().slice(0, 10)].filter(Boolean).join('-');
  if (kind === 'xlsx') lgxSave(lgxXlsxBlob(built), name + '.xlsx');
  else lgxSave(new Blob(['﻿' + lgxCsv(built[0])], { type: 'text/csv;charset=utf-8' }), name + '.csv');
  wvLpSay(`Saved ${lcNum(lines.length)} rows as ${kind.toUpperCase()}`);
}

// Blast 4 on the blasts page (wv-blast.js renderWvBlast): wvLastLoad() fetches the money and, for Level 3 and 5, the list; wvLastMount() draws them into #wvB4.
// It was a page of its own for an hour on 23 Oct 2026 and Kate folded it into one page with the other blasts. Level 4 gets the money only.
async function wvLastLoad() {
  try {
    const [lp, lr] = await Promise.all([sb.rpc('wv_lastpush_performance', { p_rate: WV_LP_RATE }), wvPerfOnly() ? Promise.resolve({ data: null, error: null }) : sb.rpc('wv_lastpush_get')]);
    wvLp = (!lp.error && lp.data && lp.data.totals) ? lp.data : null;
    wvLpRows = (!lr.error && Array.isArray(lr.data)) ? lr.data : null;
    if (lp.error) console.warn('wv_lastpush_performance', lp.error);
    if (lr.error) console.warn('wv_lastpush_get', lr.error);
  } catch (e) { console.error(e); wvLp = null; wvLpRows = null; }
}
function wvLastMount() {
  const b = document.getElementById('wvB4'); if (b) b.innerHTML = wvLp ? wvLastHtml() : '';
  if (wvLp && typeof wvOk5 === 'function' && wvOk5() && typeof wvLsLoad === 'function') wvLsLoad();   // the send panel (wv-lastsend.js, Level 5)
}
