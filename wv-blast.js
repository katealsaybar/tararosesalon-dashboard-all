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
let wvSel = { wave: 'all', branch: 'all', msg: 'all', per: 20 };
try { Object.assign(wvSel, JSON.parse(localStorage.getItem('trs-wv-blast') || '{}')); } catch (e) {}
let wvRows = null, wvErr = '', wvPage = 1, wvQuery = '', wvShown = [];
const wvSave = () => { try { localStorage.setItem('trs-wv-blast', JSON.stringify(wvSel)); } catch (e) {} };
const wvOk = () => typeof TRS_LEVEL !== 'undefined' && TRS_LEVEL >= 3;
const wvOk5 = () => typeof TRS_LEVEL !== 'undefined' && TRS_LEVEL >= 5;   // sending waves from this page is Level 5 (Kate) only
const wvIsNew = r => !!(r.listed_on && String(r.listed_on) > '2026-10-08');   // added at a refresh after the first build
const wvWave = r => wvIsNew(r) ? 'new' : String(r.wave);
const wvInWave = (r, w) => w === 'new' ? wvIsNew(r) : String(r.wave) === w;   // the new clients sit in their spend-band wave too
// The message test (15 Oct 2026): each wave and branch split half and half. A = the short message (image, Tell me more / Reserve mine), B = the long one.
const wvArm = r => r.test_arm === 'short' ? 'A' : r.test_arm === 'long' ? 'B' : '';
const wvArmName = a => a === 'A' ? 'A: short message' : a === 'B' ? 'B: long message' : '';
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
  if (wvSel.wave !== 'all' && wvSel.wave !== 'out') rows = rows.filter(r => wvInWave(r, wvSel.wave));
  if (wvSel.msg !== 'all' && wvSel.wave !== 'out') rows = rows.filter(r => wvArm(r) === wvSel.msg);
  if (wvSel.branch !== 'all') rows = rows.filter(r => r.branch === wvSel.branch);
  if (q) rows = rows.filter(r => r.client.toLowerCase().includes(q) || (qd.length >= 3 && String(r.phone || '').replace(/\D/g, '').includes(qd)));
  return rows;
}

function wvCard(key, title, desc) {
  const rows = key === 'out' ? wvOut() : wvCan().filter(r => key === 'all' || wvInWave(r, key));
  const ab = key === 'out' ? '' : `<div class="ll-ch">A ${rows.filter(r => wvArm(r) === 'A').length} · B ${rows.filter(r => wvArm(r) === 'B').length}</div>`;
  const by = ['SAA', 'KCA', 'AQ'].map(b => `${b} ${rows.filter(r => r.branch === b).length}`).join(' · ');
  return `<button type="button" class="ll-card${wvSel.wave === key ? ' on' : ''}" onclick="wvSet('wave','${key}')">
    <div class="ll-t">${lcEsc(title)}</div><div class="ll-n">${lcNum(rows.length)}</div><div class="ll-d">${desc}</div><div class="ll-ch">${by}</div>${ab}</button>`;
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
  const cards = [1, 2, 3, 4, 5].map(n => wvCard(String(n), 'Wave ' + n, WV_BANDS[n] + ' spenders, tags wv-blast-wave-' + n + 'a / ' + n + 'b'))
    .concat([wvCard('new', 'New since 8 Oct', 'Added 15 Oct, already inside their wave'), wvCard('out', 'Removed', 'Were on the 8 Oct list, no longer qualify')]).join('');
  host.innerHTML = `${wvOk5() ? '<div id="wvSendBox"></div>' : ''}<div class="ll-fresh">${chip('List refreshed <b>' + lcEsc(wvDayY(when)) + '</b>')}${chip('First built <b>8 Oct 2026</b>')}${newN ? chip('<b>' + lcNum(newN) + '</b> added since 8 Oct') : ''}${wvCan().some(r => wvArm(r)) ? chip('Message test: <b>' + lcNum(wvCan().filter(r => wvArm(r) === 'A').length) + '</b> short (A) · <b>' + lcNum(wvCan().filter(r => wvArm(r) === 'B').length) + '</b> long (B)') : ''}</div>
    <div class="ll-cards wv-cards">${wvCard('all', 'Everyone on the list', 'Can be messaged on WhatsApp now')}${cards}</div>
    <div class="ll-panel">
      <div class="ll-def"><b>${lcEsc(wvWaveName(wvSel.wave))}:</b> ${wvSel.wave === 'out' ? 'Clients on the 8 Oct list who no longer qualify, with the reason. Nobody here is in the list above.'
        : wvSel.wave === 'new' ? 'Clients who now qualify and were not on the 8 Oct list. Each carries the wave tag for her spend band in GHL (added 15 Oct).'
        : wvSel.wave === 'all' ? 'Every client who can be messaged: 2026 spend AED 4,000+ (net, ex VAT), visited in the last 90 days, one clear number, no Wellness Voucher bought yet, and she wrote to one of our branch WhatsApp numbers in the last 12 months (not blocked, not unsubscribed).'
        : 'Spend band ' + lcEsc(WV_BANDS[wvSel.wave] || '') + '. The wave is the tag put on her in GHL (wv-blast-wave-N), so the waves go out in order. Each wave is split half and half by branch: <b>a</b> gets the short message, <b>b</b> the long one with the plans written out.'}</div>
      <div class="ll-filters">
        <div class="ll-chips"><span class="slv-note">Branch</span>${['all', 'SAA', 'KCA', 'AQ'].map(b => `<button type="button" class="ll-fchip${wvSel.branch === b ? ' on ll-act' : ''}" onclick="wvSet('branch','${b}')">${b === 'all' ? 'All' : lcEsc(WV_BR[b])}</button>`).join('')}</div>
        <div class="ll-chips"><span class="slv-note">Message</span>${[['all', 'Both'], ['A', 'A short'], ['B', 'B long']].map(([k, l]) => `<button type="button" class="ll-fchip${wvSel.msg === k ? ' on ll-act' : ''}" onclick="wvSet('msg','${k}')">${l}</button>`).join('')}</div>
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
  if (wvOk5()) { if (wvSnd) wvSendPaint(); else wvSendLoad(); }
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
  const waveCell = r => r.wave ? `<span class="ll-tag">Wave ${lcEsc(r.sub_wave || r.wave)}</span>${wvIsNew(r) ? ' <span class="ll-tag" title="Added after 8 Oct">New</span>' : ''}` : '<span class="slv-muted">–</span>';
  const armCell = r => wvArm(r) ? `<span class="ll-tag" title="${lcEsc(wvArmName(wvArm(r)))}">${lcEsc(wvArmName(wvArm(r)))}</span>` : '<span class="slv-muted">–</span>';
  const cols = ['Client', 'Wave', 'Message', '2026 spend', 'Last visit', 'Last wrote to us', 'Phone', 'Status'];
  const tr = shown.map(r => `<tr>
      <td>${lcEsc(r.client)}<div class="slv-note">${lcEsc(WV_BR[r.branch] || r.branch)}</div></td>
      <td class="ll-nw">${waveCell(r)}</td>
      <td class="ll-nw">${armCell(r)}</td>
      <td class="ll-nw">${lcNum(Math.round(r.spend))}<div class="slv-note">${r.band ? lcEsc(WV_BANDS[r.band]) : ''}</div></td>
      <td class="ll-nw">${lcEsc(wvDay(r.last_visit))}</td>
      <td class="ll-nw">${r.last_wrote ? lcEsc(wvDay(r.last_wrote)) + `<div class="slv-note">to ${lcEsc(r.wrote_to || '')}</div>` : '<span class="slv-muted">–</span>'}</td>
      <td class="ll-ph">${r.phone ? `<a href="tel:${lcEsc(r.phone)}" style="color:inherit;white-space:nowrap">${lcEsc(r.phone)}</a>` : '–'}</td>
      <td>${wvPill(r)}</td></tr>`).join('');
  const cards = shown.map(r => `<li class="prd-card"><div class="prd-body">
      <div class="prd-top"><span class="prd-name">${lcEsc(r.client)}</span><span>${wvPill(r)}</span></div>
      <div class="prd-meta">${lcEsc(WV_BR[r.branch] || r.branch)} · ${r.wave ? 'Wave ' + lcEsc(r.sub_wave || r.wave) : ''}${wvArm(r) ? ' · ' + lcEsc(wvArmName(wvArm(r))) : ''}${wvIsNew(r) ? ' (new)' : ''} · AED ${lcNum(Math.round(r.spend))}</div>
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
  const head = ['Client', 'Branch', 'Wave (GHL tag)', 'Message (test)', 'Spend band', '2026 spend (AED)', 'Last visit', 'Phone', 'Last wrote to us', 'Wrote to', 'Status', 'On the list since'];
  const num = new Set(['2026 spend (AED)']);
  const lines = rows.map(r => [r.client, WV_BR[r.branch] || r.branch, r.sub_wave ? 'wv-blast-wave-' + r.sub_wave : r.wave ? 'wv-blast-wave-' + r.wave : 'Not tagged', wvArmName(wvArm(r)), r.band ? WV_BANDS[r.band] : '', Math.round(r.spend), r.last_visit || '',
    r.phone || '', r.last_wrote || '', r.wrote_to || '', r.can_message ? 'Can message' : wvWhy(r), r.listed_on || '']);
  const pi = head.indexOf('Phone');
  const out = kind === 'csv' ? lines.map(l => l.map((v, j) => j === pi && v ? `="${v}"` : v)) : lines;   // as lost-lists.js: Excel would show 9.72E+11
  const built = lgxBuild({ sheets: [{ name: 'Wellness Voucher blast', blocks: [{ cols: head.map(h => ({ label: h, fmt: num.has(h) ? 'num' : 'text' })), rows: out.map(l => ({ cells: l })) }] }] });
  const name = ['wellness-voucher-blast', wvSel.wave === 'all' ? '' : wvSel.wave === 'out' ? 'removed' : wvSel.wave === 'new' ? 'new' : 'wave-' + wvSel.wave, wvSel.msg !== 'all' ? 'msg-' + wvSel.msg.toLowerCase() : '', wvSel.branch !== 'all' ? wvSel.branch.toLowerCase() : '', new Date().toISOString().slice(0, 10)].filter(Boolean).join('-');
  if (kind === 'xlsx') lgxSave(lgxXlsxBlob(built), name + '.xlsx');
  else lgxSave(new Blob(['﻿' + lgxCsv(built[0])], { type: 'text/csv;charset=utf-8' }), name + '.csv');
  wvNote(`Saved ${lcNum(lines.length)} rows as ${kind.toUpperCase()}`);
}

// ── SEND A WAVE (Level 5, Kate, 16 Oct 2026) ───────────────────────────────────────────────────────────────
// Queues a sub-wave (wv_send_enqueue); the edge function wv-send-worker then adds GHL's go tag to each client (wv-send-short for 1a..5a, wv-send-long
// for 1b..5b), which fires GHL's "WV blast - Send (tag go)" workflow. migrations/wv_send.sql. The switch (wv_send_config.enabled) is the kill switch:
// off, nothing is claimed. Sends only inside the Dubai window (10:00 to 19:00 by default). A hand send in GHL still works; waves 1a to 2b are
// recorded as sent already.
let wvSnd = null, wvSndMsg = '', wvSndBusy = false;
const wvSndWin = i => i && i.dubai_hour >= i.hour_from && i.dubai_hour < i.hour_to;
async function wvSendLoad() {
  try {
    const { data, error } = await sb.rpc('wv_send_info');
    if (error || !data) throw error || new Error('no info');
    wvSnd = data;
  } catch (e) { console.error(e); wvSnd = null; wvSndMsg = 'The send panel did not load. Refresh to try again.'; }
  wvSendPaint();
}
function wvSendPaint() {
  const box = document.getElementById('wvSendBox');
  if (!box) return;
  if (!wvSnd) { box.innerHTML = `<div class="ll-panel wv-send"><p class="slv-muted">${lcEsc(wvSndMsg || 'Loading…')}</p></div>`; return; }
  const i = wvSnd, on = !!i.enabled, win = wvSndWin(i);
  const rows = (i.waves || []).map(w => {
    const total = Number(w.clients) || 0, sent = Number(w.sent) || 0, wait = Number(w.waiting) || 0, bad = Number(w.failed) || 0, skip = Number(w.skipped) || 0, canc = Number(w.cancelled) || 0;
    const msg = w.sub_wave.endsWith('a') ? 'Short' : 'Long';
    let st = '<span class="slv-muted">Not sent</span>';
    if (wait) st = `<b>Sending</b>: ${lcNum(sent)} done, ${lcNum(wait)} waiting`;
    else if (sent || bad || skip || canc) st = `Sent <b>${lcNum(sent)}</b> of ${lcNum(total)}`;
    const extra = [bad ? `<span class="ll-pill ll-num" title="Failed: check them in GHL before trying again">${lcNum(bad)} failed</span>` : '', skip ? `<span class="ll-pill ll-num" title="Skipped by a safety check, see the log">${lcNum(skip)} skipped</span>` : '', canc ? `<span class="ll-pill ll-num">${lcNum(canc)} stopped</span>` : ''].filter(Boolean).join(' ');
    const left = Math.max(0, total - sent - wait - bad - skip);
    let act = '';
    if (wait) act = `<button type="button" class="tglr lc-btn" onclick="wvSendRun()"${wvSndBusy ? ' disabled' : ''}>Run now</button> <button type="button" class="tglr lc-btn" onclick="wvSendStop('${w.sub_wave}')">Stop</button>`;
    else if (left > 0) act = `<button type="button" class="tglr lc-btn wv-go" onclick="wvSendGo('${w.sub_wave}')"${wvSndBusy ? ' disabled' : ''}>${sent ? 'Send the rest' : 'Send wave ' + w.sub_wave}</button>`;
    else if (sent) act = '<span class="slv-muted">Done</span>';
    return `<tr><td class="ll-nw"><b>Wave ${lcEsc(w.sub_wave)}</b></td><td class="ll-nw">${msg}</td><td class="ll-nw">${lcNum(total)}</td><td>${st} ${extra}</td><td class="ll-nw">${act}</td></tr>`;
  }).join('');
  const recent = (i.recent || []).map(r => `<tr><td class="ll-nw">${lcEsc(r.sub_wave)}</td><td>${lcEsc(r.client)}<div class="slv-note">${lcEsc(WV_BR[r.branch] || r.branch)}</div></td><td class="ll-nw">${lcEsc(r.status)}</td><td>${lcEsc(r.error || '')}</td><td class="ll-nw">${r.done_at ? lcEsc(new Date(r.done_at).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })) : 'waiting'}</td></tr>`).join('');
  box.innerHTML = `<div class="ll-panel wv-send">
    <div class="wv-send-h"><div><b>Send a wave from here</b> <span class="slv-note">Level 5 only</span></div>
      <button type="button" class="tglr lc-btn wv-sw ${on ? 'on' : 'off'}" onclick="wvSendSwitch(${on ? 'false' : 'true'})" title="The kill switch. Off: nothing is sent, even what is already queued.">Sending is ${on ? 'ON' : 'OFF'} · turn ${on ? 'off' : 'on'}</button></div>
    <p class="slv-muted wv-send-p">Each client gets the GHL go tag, which makes GHL send her WhatsApp message and add her to the Wellness Voucher pipeline (Received Blast Campaign). a = short message, b = long message. Sends only between ${i.hour_from}:00 and ${i.hour_to}:00 Dubai${win ? '' : ' <b>(outside that window now)</b>'}. Sent messages cannot be called back; <b>Stop</b> cancels only the ones still waiting.</p>
    <div class="slv-wrap"><table class="slv-table"><thead><tr><th>Wave</th><th>Message</th><th>Clients</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <div id="wvSendNote" class="slv-note" style="margin-top:6px">${lcEsc(wvSndMsg)}</div>
    <details class="wv-log"><summary>Recent activity (last 40)</summary>
      <div class="slv-wrap"><table class="slv-table"><thead><tr><th>Wave</th><th>Client</th><th>Status</th><th>Note</th><th>When</th></tr></thead>
      <tbody>${recent || '<tr><td colspan="5" class="slv-muted">Nothing has been sent from this page yet.</td></tr>'}</tbody></table></div></details></div>`;
}
function wvSendSay(t) { wvSndMsg = t; const n = document.getElementById('wvSendNote'); if (n) n.textContent = t; }
async function wvSendSwitch(on) {
  if (on && !confirm('Turn sending ON?\n\nWaves you queue will start going to real clients. You can turn it off again at any time; that stops everything still waiting.')) return;
  const { data, error } = await sb.rpc('wv_send_config_set', { p_patch: { enabled: on } });
  if (error) { wvSendSay('Could not change the switch: ' + (error.message || error)); return; }
  wvSnd = data; wvSndMsg = on ? 'Sending is ON.' : 'Sending is OFF. Nothing more will go.'; wvSendPaint();
}
async function wvSendGo(sub) {
  const w = (wvSnd?.waves || []).find(x => x.sub_wave === sub);
  if (!w) return;
  if (!wvSnd.enabled) { wvSendSay('Turn sending ON first (top right of this panel).'); return; }
  if (!wvSndWin(wvSnd)) { wvSendSay(`It is outside the send window (${wvSnd.hour_from}:00 to ${wvSnd.hour_to}:00 Dubai). Try again then.`); return; }
  const msg = sub.endsWith('a') ? 'the SHORT message' : 'the LONG message';
  if (!confirm(`Send wave ${sub} now?\n\nUp to ${w.clients} clients get ${msg} on WhatsApp from GHL, and go into the Wellness Voucher pipeline.\nSent messages cannot be called back.`)) return;
  wvSndBusy = true; wvSendPaint(); wvSendSay(`Queueing wave ${sub}…`);
  const { data, error } = await sb.rpc('wv_send_enqueue', { p_sub: sub });
  if (error) { wvSndBusy = false; wvSendSay('Could not queue it: ' + (error.message || error)); await wvSendLoad(); return; }
  wvSendSay(`Queued ${data?.queued ?? 0} for wave ${sub}. Sending…`);
  await wvSendRun();
}
// Calls the worker until nothing is waiting, the switch goes off or the window closes. If the page is closed first, what is left stays queued and
// "Run now" picks it up.
async function wvSendRun() {
  wvSndBusy = true;
  try {
    for (let k = 0; k < 40; k++) {
      const { data: r, error } = await sb.functions.invoke('wv-send-worker', { body: {} });
      if (error) { wvSendSay('The sender did not answer. Press Run now to try again.'); break; }
      await wvSendLoad();
      const waiting = (wvSnd?.waves || []).reduce((s, w) => s + (Number(w.waiting) || 0), 0);
      if (!waiting || !wvSnd?.enabled || !wvSndWin(wvSnd)) {
        wvSendSay(!waiting ? 'All sent.' : !wvSnd?.enabled ? 'Sending is off, so the rest is waiting.' : 'The send window is closed, so the rest is waiting.');
        break;
      }
      if (!r || !r.claimed) await new Promise(res => setTimeout(res, 3000));
    }
  } catch (e) { console.error(e); wvSendSay('Something went wrong. Check the activity log, then press Run now.'); }
  wvSndBusy = false; wvSendPaint();
}
async function wvSendStop(sub) {
  if (!confirm(`Stop wave ${sub}?\n\nEveryone still waiting is cancelled. Anyone already tagged has been sent and cannot be called back.`)) return;
  const { data, error } = await sb.rpc('wv_send_stop', { p_sub: sub });
  if (error) { wvSendSay('Could not stop it: ' + (error.message || error)); return; }
  await wvSendLoad(); wvSendSay(`Stopped wave ${sub}: ${data?.cancelled ?? 0} cancelled.`);
}
