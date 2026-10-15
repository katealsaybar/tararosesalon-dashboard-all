// Wellness Voucher Blast (Kate, 15 Oct 2026). The 3rd blast list, the top spenders who can be messaged on WhatsApp about the
// Wellness Voucher, as its own page beside Lost Clients. wv_blast (migrations/wv_blast.sql) holds one row per client:
// the wave she was tagged in on 9 Oct (wv-blast-wave-1..5 in GHL), her spend and last visit, whether she can be messaged and,
// if not, why. A client who has slipped off the list stays, labelled "Removed", so nobody has to wonder where she went.
// The list is refreshed by a script (wv_blast_candidates / wv_blast_push, pusher pass), not by this page.
//
// Level 3 and above (names and phone numbers); wv_blast_get refuses the rest too. Borrows Lost Clients' look (ll-*, slv-*,
// lc-pager), lcEsc / lcNum, and the XLSX writer (lgx*), so it loads after lost-lists.js.
const WV_BANDS = { 1: '10k+', 2: '8k to 10k', 3: '6k to 8k', 4: '5k to 6k', 5: '4k to 5k' };
const WV_BR = { SAA: 'Saadiyat', KCA: 'Khalifa City A', AQ: 'Al Quoz', MC: 'Motor City' };
const WV_PER = [10, 20, 50, 100];
let wvSel = { wave: 'all', branch: 'all', per: 20 };
try { Object.assign(wvSel, JSON.parse(localStorage.getItem('trs-wv-blast') || '{}')); } catch (e) {}
let wvRows = null, wvErr = '', wvPage = 1, wvQuery = '', wvShown = [];
const wvSave = () => { try { localStorage.setItem('trs-wv-blast', JSON.stringify(wvSel)); } catch (e) {} };
const wvOk = () => typeof TRS_LEVEL !== 'undefined' && TRS_LEVEL >= 3;
const wvIsNew = r => !!(r.listed_on && String(r.listed_on) > '2026-10-08');   // added at a refresh after the first build
const wvWave = r => wvIsNew(r) ? 'new' : String(r.wave);
const wvDay = d => { if (!d) return ''; const x = new Date(String(d).slice(0, 10) + 'T00:00:00'); return x.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: x.getFullYear() === new Date().getFullYear() ? undefined : '2-digit' }); };
const wvDayY = d => d ? new Date(String(d).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const wvWhy = r => String(r.status || '').replace(/^No: /, '');
const wvWaveName = w => w === 'all' ? 'Everyone on the list' : w === 'new' ? 'New since 8 Oct' : w === 'out' ? 'Removed' : 'Wave ' + w;

async function renderWvBlast() {
  const el = document.getElementById('wvBlastContent');
  if (!el || !wvOk()) return;
  el.innerHTML = `<section class="slv-intro"><h2>Wellness Voucher Blast</h2>
    <p>The 3rd blast: top spenders who can be messaged on WhatsApp about the Wellness Voucher, by wave.</p></section><div id="wvHost"><p class="slv-muted">Loading the list…</p></div>`;
  try {
    const { data, error } = await sb.rpc('wv_blast_get');
    if (error || !Array.isArray(data)) throw error || new Error('no list');
    wvRows = data; wvErr = '';
  } catch (e) { console.error(e); wvErr = 'The list did not load. Refresh to try again.'; }
  wvPaint();
}

const wvCan = () => (wvRows || []).filter(r => r.can_message);
const wvOut = () => (wvRows || []).filter(r => !r.can_message);
function wvFiltered() {
  const q = wvQuery.trim().toLowerCase(), qd = q.replace(/\D/g, '');
  let rows = wvSel.wave === 'out' ? wvOut() : wvCan();
  if (wvSel.wave !== 'all' && wvSel.wave !== 'out') rows = rows.filter(r => wvWave(r) === wvSel.wave);
  if (wvSel.branch !== 'all') rows = rows.filter(r => r.branch === wvSel.branch);
  if (q) rows = rows.filter(r => r.client.toLowerCase().includes(q) || (qd.length >= 3 && String(r.phone || '').replace(/\D/g, '').includes(qd)));
  return rows;
}

function wvCard(key, title, desc) {
  const rows = key === 'out' ? wvOut() : wvCan().filter(r => key === 'all' || wvWave(r) === key);
  const by = ['SAA', 'KCA', 'AQ'].map(b => `${b} ${rows.filter(r => r.branch === b).length}`).join(' · ');
  return `<button type="button" class="ll-card${wvSel.wave === key ? ' on' : ''}" onclick="wvSet('wave','${key}')">
    <div class="ll-t">${lcEsc(title)}</div><div class="ll-n">${lcNum(rows.length)}</div><div class="ll-d">${desc}</div><div class="ll-ch">${by}</div></button>`;
}

function wvPaint() {
  const host = document.getElementById('wvHost');
  if (!host) return;
  if (wvErr) { host.innerHTML = `<p class="slv-muted">${lcEsc(wvErr)}</p>`; return; }
  const all = wvRows || [];
  if (!all.length) { host.innerHTML = '<p class="slv-muted">No list has been built yet.</p>'; return; }
  const when = all.reduce((m, r) => r.refreshed_on > m ? r.refreshed_on : m, '');
  const newN = wvCan().filter(wvIsNew).length;
  const chip = (txt, warn) => `<span class="ll-chip${warn ? ' warn' : ''}">${txt}</span>`;
  const cards = [1, 2, 3, 4, 5].map(n => wvCard(String(n), 'Wave ' + n, WV_BANDS[n] + ' spenders, tagged wv-blast-wave-' + n))
    .concat([wvCard('new', 'New since 8 Oct', 'Qualify now, tagged in GHL by spend band'), wvCard('out', 'Removed', 'Were on the 8 Oct list, no longer qualify')]).join('');
  host.innerHTML = `<div class="ll-fresh">${chip('List refreshed <b>' + lcEsc(wvDayY(when)) + '</b>')}${chip('First built <b>8 Oct 2026</b>')}${newN ? chip('<b>' + lcNum(newN) + '</b> added since 8 Oct') : ''}</div>
    <div class="ll-cards wv-cards">${wvCard('all', 'Everyone on the list', 'Can be messaged on WhatsApp now')}${cards}</div>
    <div class="ll-panel">
      <div class="ll-def"><b>${lcEsc(wvWaveName(wvSel.wave))}:</b> ${wvSel.wave === 'out' ? 'Clients on the 8 Oct list who no longer qualify, with the reason. Nobody here is in the list above.'
        : wvSel.wave === 'new' ? 'Clients who now qualify and were not on the 8 Oct list. Each carries the wave tag for her spend band in GHL (added 15 Oct).'
        : wvSel.wave === 'all' ? 'Every client who can be messaged: 2026 spend AED 4,000+ (net, ex VAT), visited in the last 90 days, one clear number, no Wellness Voucher bought yet, and she wrote to one of our branch WhatsApp numbers in the last 12 months (not blocked, not unsubscribed).'
        : 'Spend band ' + lcEsc(WV_BANDS[wvSel.wave] || '') + '. The wave is the tag put on her in GHL on 9 Oct 2026, so the waves go out in the order they were tagged.'}</div>
      <div class="ll-filters">
        <div class="ll-chips"><span class="slv-note">Branch</span>${['all', 'SAA', 'KCA', 'AQ'].map(b => `<button type="button" class="ll-fchip${wvSel.branch === b ? ' on ll-act' : ''}" onclick="wvSet('branch','${b}')">${b === 'all' ? 'All' : lcEsc(WV_BR[b])}</button>`).join('')}</div>
        <input id="wvSearch" class="ll-sel" type="search" placeholder="Search name or number" value="${lcEsc(wvQuery)}" oninput="wvQuery=this.value;wvPage=1;wvPaintTable()" style="min-width:210px">
        <button type="button" class="tglr lc-btn" onclick="wvCopy()" title="Copy the numbers shown, one per line">Copy numbers</button>
        <button type="button" class="tglr lc-btn" onclick="wvSaveFile('xlsx')">XLSX</button>
        <button type="button" class="tglr lc-btn" onclick="wvSaveFile('csv')">CSV</button>
        <span id="wvCount" class="slv-note" style="display:inline"></span>
        <span id="wvNote" class="slv-note" style="display:inline"></span>
      </div>
      <div id="wvTable"></div>
      <p class="slv-muted ll-foot">Built from Phorest sales (2026 spend AED 4,000+ net of VAT, last visit within 90 days of 14 Oct) and respond.io (she wrote to one of our branch WhatsApp numbers in the last 12 months). Phorest marketing opt-in is not checked. A client who bought a Wellness Voucher is left out. The list is refreshed by hand, so it is only as fresh as the date above.</p>
    </div>`;
  wvPaintTable();
}

function wvPill(r) {
  return r.can_message ? '<span class="ll-pill ll-act" title="Can be messaged on WhatsApp">Can message</span>'
    : `<span class="ll-pill ll-num" title="${lcEsc(r.status)}">${lcEsc(wvWhy(r))}</span>`;
}
function wvPaintTable() {
  const rows = wvFiltered(), per = WV_PER.includes(wvSel.per) ? wvSel.per : 20;
  const pages = Math.max(1, Math.ceil(rows.length / per));
  wvPage = Math.min(Math.max(1, wvPage), pages);
  const shown = rows.slice((wvPage - 1) * per, wvPage * per);
  wvShown = shown;
  const cnt = document.getElementById('wvCount');
  if (cnt) cnt.textContent = `${lcNum(rows.length)} shown`;
  const box = document.getElementById('wvTable');
  if (!box) return;
  const out = wvSel.wave === 'out';
  const waveCell = r => r.wave ? `<span class="ll-tag">Wave ${r.wave}</span>${wvIsNew(r) ? ' <span class="ll-tag" title="Added after 8 Oct">New</span>' : ''}` : '<span class="slv-muted">–</span>';
  const cols = ['Client', 'Wave', '2026 spend', 'Last visit', 'Last wrote to us', 'Phone', 'Status'];
  const tr = shown.map(r => `<tr>
      <td>${lcEsc(r.client)}<div class="slv-note">${lcEsc(WV_BR[r.branch] || r.branch)}</div></td>
      <td class="ll-nw">${waveCell(r)}</td>
      <td class="ll-nw">${lcNum(Math.round(r.spend))}<div class="slv-note">${r.band ? lcEsc(WV_BANDS[r.band]) : ''}</div></td>
      <td class="ll-nw">${lcEsc(wvDay(r.last_visit))}</td>
      <td class="ll-nw">${r.last_wrote ? lcEsc(wvDay(r.last_wrote)) + `<div class="slv-note">to ${lcEsc(r.wrote_to || '')}</div>` : '<span class="slv-muted">–</span>'}</td>
      <td class="ll-ph">${r.phone ? `<a href="tel:${lcEsc(r.phone)}" style="color:inherit;white-space:nowrap">${lcEsc(r.phone)}</a>` : '–'}</td>
      <td>${wvPill(r)}</td></tr>`).join('');
  const cards = shown.map(r => `<li class="prd-card"><div class="prd-body">
      <div class="prd-top"><span class="prd-name">${lcEsc(r.client)}</span><span>${wvPill(r)}</span></div>
      <div class="prd-meta">${lcEsc(WV_BR[r.branch] || r.branch)} · ${r.wave ? 'Wave ' + r.wave : ''}${wvIsNew(r) ? ' (new)' : ''} · AED ${lcNum(Math.round(r.spend))}</div>
      <div class="prd-meta">Last visit ${lcEsc(wvDay(r.last_visit))}${r.last_wrote ? ' · wrote to us ' + lcEsc(wvDay(r.last_wrote)) : ''}</div>
      ${r.phone ? `<div class="prd-meta" style="margin-top:4px"><a href="tel:${lcEsc(r.phone)}" style="color:inherit">${lcEsc(r.phone)}</a></div>` : ''}</div></li>`).join('');
  const from = (wvPage - 1) * per + 1;
  box.innerHTML = `<div class="slv-wrap prd-desk lc-wrap ll-wrap"><table class="slv-table"><thead><tr>${cols.map(c => `<th>${lcEsc(c)}</th>`).join('')}</tr></thead>
      <tbody>${tr || `<tr><td colspan="${cols.length}" class="slv-muted">${out ? 'Nobody has been removed.' : 'No one matches those filters.'}</td></tr>`}</tbody></table></div>
      <ol class="prd-cards">${cards || '<li class="slv-muted">No one matches those filters.</li>'}</ol>
      ${rows.length ? `<div class="lc-pager">
        <div class="lc-pg-size"><span class="slv-note">Show</span><div class="sc-seg" role="group" aria-label="Rows per page">${WV_PER.map(v => `<button type="button" class="${v === per ? 'on' : ''}" onclick="wvSet('per',${v})">${v}</button>`).join('')}</div></div>
        <div class="lc-pg-nav"><span class="lc-pg-txt">Page <b>${wvPage}</b> of <b>${lcNum(pages)}</b><span class="slv-note"> · ${lcNum(from)}–${lcNum(from + shown.length - 1)} of ${lcNum(rows.length)}</span></span>
          <button type="button" class="tglr" onclick="wvGo(-1)"${wvPage <= 1 ? ' disabled' : ''}>‹ Prev</button>
          <button type="button" class="tglr" onclick="wvGo(1)"${wvPage >= pages ? ' disabled' : ''}>Next ›</button></div></div>` : ''}`;
}
function wvSet(k, v) { wvSel[k] = v; wvSave(); wvPage = 1; if (k === 'per') wvPaintTable(); else wvPaint(); }
function wvGo(d) { wvPage += d; wvPaintTable(); }
function wvNote(t) { const n = document.getElementById('wvNote'); if (n) n.textContent = t; }

// ── COPY AND FILES ─────────────────────────────────────────────────────────
async function wvCopy() {
  const nums = [...new Set(wvFiltered().filter(r => r.can_message && r.phone).map(r => r.phone))];
  try { await navigator.clipboard.writeText(nums.join('\n')); }
  catch (e) { wvNote('The browser would not copy. Use the file instead.'); return; }
  wvNote(`Copied ${lcNum(nums.length)} numbers`);
}
function wvSaveFile(kind) {
  if (typeof lgxBuild !== 'function') return;
  const rows = wvFiltered();
  const head = ['Client', 'Branch', 'Wave (GHL tag)', 'Spend band', '2026 spend (AED)', 'Last visit', 'Phone', 'Last wrote to us', 'Wrote to', 'Status', 'On the list since'];
  const num = new Set(['2026 spend (AED)']);
  const lines = rows.map(r => [r.client, WV_BR[r.branch] || r.branch, r.wave ? 'wv-blast-wave-' + r.wave : 'Not tagged yet', r.band ? WV_BANDS[r.band] : '', Math.round(r.spend), r.last_visit || '',
    r.phone || '', r.last_wrote || '', r.wrote_to || '', r.can_message ? 'Can message' : wvWhy(r), r.listed_on || '']);
  const pi = head.indexOf('Phone');
  const out = kind === 'csv' ? lines.map(l => l.map((v, j) => j === pi && v ? `="${v}"` : v)) : lines;   // as lost-lists.js: Excel would show 9.72E+11
  const built = lgxBuild({ sheets: [{ name: 'Wellness Voucher blast', blocks: [{ cols: head.map(h => ({ label: h, fmt: num.has(h) ? 'num' : 'text' })), rows: out.map(l => ({ cells: l })) }] }] });
  const name = ['wellness-voucher-blast', wvSel.wave === 'all' ? '' : wvSel.wave === 'out' ? 'removed' : wvSel.wave === 'new' ? 'new' : 'wave-' + wvSel.wave, wvSel.branch !== 'all' ? wvSel.branch.toLowerCase() : '', new Date().toISOString().slice(0, 10)].filter(Boolean).join('-');
  if (kind === 'xlsx') lgxSave(lgxXlsxBlob(built), name + '.xlsx');
  else lgxSave(new Blob(['﻿' + lgxCsv(built[0])], { type: 'text/csv;charset=utf-8' }), name + '.csv');
  wvNote(`Saved ${lcNum(lines.length)} rows as ${kind.toUpperCase()}`);
}
