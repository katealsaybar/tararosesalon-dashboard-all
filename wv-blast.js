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
let wvSel = { wave: 'all', branch: 'all', msg: 'all', bought: 'all', per: 20 };
try { Object.assign(wvSel, JSON.parse(localStorage.getItem('trs-wv-blast') || '{}')); } catch (e) {}
let wvRows = null, wvErr = '', wvPage = 1, wvQuery = '', wvShown = [];
// How the blast is doing, in AED (Kate, 22 Oct 2026): wv_blast_performance (migrations/wv_blast_performance.sql, Level 3 and above). Null until the function is live:
// the section stays out and the page draws as before.
let wvPerf = null;
const wvSave = () => { try { localStorage.setItem('trs-wv-blast', JSON.stringify(wvSel)); } catch (e) {} };
const wvOk = () => typeof TRS_LEVEL !== 'undefined' && TRS_LEVEL >= 3;
// Kate, 22 Oct 2026: Level 4 (Accounts and Admin) sees how the blast is doing in AED and nothing else: the list, the phone numbers and the sends stay Level 3 and 5.
const wvPerfOnly = () => typeof TRS_LEVEL !== 'undefined' && TRS_LEVEL === 4;
const wvOk5 = () => typeof TRS_LEVEL !== 'undefined' && TRS_LEVEL >= 5;   // sending waves from this page is Level 5 (Kate) only
const wvIsNew = r => !!(r.listed_on && String(r.listed_on) > '2026-10-08');   // added at a refresh after the first build
const wvWave = r => wvIsNew(r) ? 'new' : String(r.wave);
// Who has bought a voucher since the blast started (21 Oct 2026, Kate). wv_blast_get adds bought_on / bought_serial / bought_aed / bought_pay to a
// row when her name matches a Phorest voucher sale from 15 Oct on (migrations/wv_blast_bought.sql). bought_pay is the Phorest tender code.
const wvBought = r => !!r.bought_on;
const wvPayName = c => ({ S: 'Stripe', T: 'Tabby link', CC: 'Card' })[String(c || '').trim()] || String(c || '').trim();
const wvTierName = serial => ({ D: 'Dip Your Toes', S: 'Season of You', V: 'All-In VIP Year' })[String(serial || '').split('-')[1]?.[0]] || '';
const wvBoughtLine = r => [wvTierName(r.bought_serial), 'AED ' + lcNum(Math.round(r.bought_aed)), wvPayName(r.bought_pay)].filter(Boolean).join(' · ');
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
    <p>The 3rd blast: top spenders who can be messaged on WhatsApp about the Wellness Voucher, by wave.${wvPerfOnly() ? ' This page shows the money only.' : ''}</p></section><div id="wvHost"><p class="slv-muted">Loading the list…</p></div>`;
  if (wvPerfOnly()) {
    const pf = await sb.rpc('wv_blast_performance');
    wvPerf = (!pf.error && pf.data && pf.data.totals) ? pf.data : null;
    const host = document.getElementById('wvHost');
    if (host) host.innerHTML = wvPerf ? wvPerfHtml() : '<p class="slv-muted">The numbers did not load. Refresh to try again.</p>';
    return;
  }
  try {
    const [{ data, error }, pf] = await Promise.all([sb.rpc('wv_blast_get'), sb.rpc('wv_blast_performance')]);
    if (error || !Array.isArray(data)) throw error || new Error('no list');
    wvRows = data; wvErr = '';
    wvPerf = (!pf.error && pf.data && pf.data.totals) ? pf.data : null;
    if (pf.error) console.warn('wv_blast_performance', pf.error);
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
  if (wvSel.bought === 'yes') rows = rows.filter(wvBought);
  if (q) rows = rows.filter(r => r.client.toLowerCase().includes(q) || (qd.length >= 3 && String(r.phone || '').replace(/\D/g, '').includes(qd)));
  return rows;
}

// ---- How the blast is doing: cards, then by wave / message / branch with a bar for each row's AED collected (click, tap or tab to a bar for its value) ----
const wvAed = n => 'AED ' + lcNum(Math.round(+n || 0));
const wvPct = (a, b) => b ? (100 * a / b).toFixed(1) + '%' : '–';
function wvTipOn(seg) {
  document.querySelectorAll('.wv-tip').forEach(n => n.remove());
  if (!seg) return;
  const row = seg.closest('tr'), who = row && row.firstElementChild ? row.firstElementChild.textContent.trim() : '';
  const el = document.createElement('div'); el.className = 'wv-tip'; el.setAttribute('role', 'status');
  el.textContent = (who ? who + ': ' : '') + seg.dataset.tip; document.body.appendChild(el);
  const r = seg.getBoundingClientRect(), tw = el.offsetWidth, th = el.offsetHeight;
  el.style.left = Math.max(8, Math.min(window.innerWidth - tw - 8, r.left + r.width / 2 - tw / 2)) + 'px';
  el.style.top = (r.top - th - 8 < 8 ? r.bottom + 8 : r.top - th - 8) + 'px';
}
let wvTipPinned = null;
const wvSegOf = e => e.target.closest && e.target.closest('.wv-bar i[data-tip]');
document.addEventListener('click', e => {
  const seg = wvSegOf(e);
  if (!seg || wvTipPinned === seg) { wvTipOn(null); wvTipPinned = null; return; }
  wvTipOn(seg); wvTipPinned = seg;
});
document.addEventListener('mouseover', e => { const seg = wvSegOf(e); if (seg && !wvTipPinned) wvTipOn(seg); });
document.addEventListener('mouseout', e => { if (!wvTipPinned && wvSegOf(e)) wvTipOn(null); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { wvTipOn(null); wvTipPinned = null; return; }
  const seg = wvSegOf(e);
  if (seg && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); if (wvTipPinned === seg) { wvTipOn(null); wvTipPinned = null; } else { wvTipOn(seg); wvTipPinned = seg; } }
});
window.addEventListener('scroll', () => { wvTipOn(null); wvTipPinned = null; }, { passive: true });
function wvPerfRows(rows, label, max) {
  return rows.map(r => {
    const tip = `${wvAed(r.aed)} from ${lcNum(r.bought)} client${r.bought === 1 ? '' : 's'} bought, of ${lcNum(r.sent)} messaged (${wvPct(r.bought, r.sent)})`;
    const bar = r.aed ? `<span class="wv-bar" style="width:${Math.max(6, 100 * r.aed / max)}%"><i data-tip="${lcEsc(tip)}" tabindex="0" role="button" aria-label="${lcEsc(label(r.k) + ': ' + tip)}"></i></span>` : '';
    return `<tr><td>${lcEsc(label(r.k))}</td><td>${lcNum(r.sent)}</td><td>${lcNum(r.bought)}</td><td>${wvPct(r.bought, r.sent)}</td><td class="wv-aedc"><span class="wv-aedt">${wvAed(r.aed)}</span>${bar}</td></tr>`;
  }).join('');
}
function wvPerfTable(title, rows, label) {
  const max = Math.max(1, ...rows.map(r => r.aed || 0));
  return `<div class="wv-pbox"><h4>${title}</h4><div class="wv-pscroll"><table class="slv-table wv-ptbl"><thead><tr><th></th><th>Messaged</th><th>Bought</th><th>Bought %</th><th>AED collected</th></tr></thead><tbody>${wvPerfRows(rows, label, max)}</tbody></table></div></div>`;
}
function wvPerfHtml() {
  const p = wvPerf; if (!p) return '';
  const t = p.totals, o = p.other || {}, per = t.bought ? t.aed / t.bought : 0;
  const card = (n, ti, d) => `<div class="ll-card wv-pcard"><div class="ll-t">${ti}</div><div class="ll-n">${n}</div><div class="ll-d">${d}</div></div>`;
  const when = iso => { try { return new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Asia/Dubai', day: 'numeric', month: 'short' }); } catch (e) { return ''; } };
  const tierName = k => ({ D: 'Dip Your Toes', S: 'Season of You', V: 'All-In VIP Year' })[k] || k;
  const tiers = (p.by_tier || []).map(x => `${lcEsc(tierName(x.k))} ${lcNum(x.vouchers)} (${wvAed(x.aed)})`).join(' · '), pays = (p.by_pay || []).map(x => `${lcEsc(wvPayName(x.k) || x.k)} ${lcNum(x.vouchers)}`).join(' · ');
  return `<section class="wv-perf" id="wvPerf"><h3>How the blast is doing</h3>
    <div class="ll-cards wv-pcards">
      ${card(lcNum(t.sent), 'Messaged', t.first ? `sent ${lcEsc(when(t.first))} to ${lcEsc(when(t.last))}${t.failed ? `, ${lcNum(t.failed)} failed` : ''}${t.queued ? `, ${lcNum(t.queued)} still queued` : ''}` : 'nothing sent yet')}
      ${card(lcNum(t.bought), 'Bought', `${wvPct(t.bought, t.sent)} of the messaged, ${lcNum(t.vouchers)} voucher${t.vouchers === 1 ? '' : 's'}`)}
      ${card(wvAed(t.aed), 'AED collected', t.bought ? `${wvAed(per)} per buyer, VAT included` : 'no buyer yet')}
      ${card(wvAed(t.cost), 'Spent (estimate)', `${lcNum(t.sent)} messages at AED ${(+p.rate).toFixed(2)} each. Meta's invoice has the exact figure`)}
      ${card(t.cost ? wvAed(t.aed / t.cost) : '–', 'Back for every AED 1 spent', 'AED collected divided by the estimated spend')}
    </div>
    ${tiers || pays ? `<p class="slv-note">Bought: ${tiers}${tiers && pays ? '. Paid by ' : ''}${pays}.</p>` : ''}
    ${o.vouchers ? `<p class="slv-note"><b>${lcNum(o.vouchers)}</b> other voucher${o.vouchers === 1 ? '' : 's'} (${wvAed(o.aed)}) sold since the blast started to clients who are not on the messaged list: a spelling that does not match, or someone who bought without our message. They are not counted above.</p>` : ''}
    <div class="wv-pgrid">
      ${wvPerfTable('By wave', p.by_wave || [], k => 'Wave ' + k)}
      ${wvPerfTable('By message', p.by_arm || [], k => k === 'A' ? 'A: short message' : 'B: long message')}
      ${wvPerfTable('By branch', p.by_branch || [], k => WV_BR[k] || k)}
    </div>
    <p class="slv-note">Messages sent through this page, one per client. A client may have bought without our message, and the match to a sale is by name. Replies and STOP are not shown: respond.io's status feed only covers a small part of this list.</p></section>`;
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
  host.innerHTML = `${wvOk5() ? '<div id="wvSendBox"></div>' : ''}${wvPerfHtml()}<div class="ll-fresh">${chip('List refreshed <b>' + lcEsc(wvDayY(when)) + '</b>')}${chip('First built <b>8 Oct 2026</b>')}${newN ? chip('<b>' + lcNum(newN) + '</b> added since 8 Oct') : ''}${wvRows.some(wvBought) ? chip('<b>' + lcNum(wvRows.filter(wvBought).length) + '</b> have bought since the blast') : ''}${wvCan().some(r => wvArm(r)) ? chip('Message test: <b>' + lcNum(wvCan().filter(r => wvArm(r) === 'A').length) + '</b> short (A) · <b>' + lcNum(wvCan().filter(r => wvArm(r) === 'B').length) + '</b> long (B)') : ''}</div>
    <div class="ll-cards wv-cards">${wvCard('all', 'Everyone on the list', 'Can be messaged on WhatsApp now')}${cards}</div>
    <div class="ll-panel">
      <div class="ll-def"><b>${lcEsc(wvWaveName(wvSel.wave))}:</b> ${wvSel.wave === 'out' ? 'Clients on the 8 Oct list who no longer qualify, with the reason. Nobody here is in the list above.'
        : wvSel.wave === 'new' ? 'Clients who now qualify and were not on the 8 Oct list. Each carries the wave tag for her spend band in GHL (added 15 Oct).'
        : wvSel.wave === 'all' ? 'Every client who can be messaged: 2026 spend AED 4,000+ (net, ex VAT), visited in the last 90 days, one clear number, no Wellness Voucher bought yet, and she wrote to one of our branch WhatsApp numbers in the last 12 months (not blocked, not unsubscribed).'
        : 'Spend band ' + lcEsc(WV_BANDS[wvSel.wave] || '') + '. The wave is the tag put on her in GHL (wv-blast-wave-N), so the waves go out in order. Each wave is split half and half by branch: <b>a</b> gets the short message, <b>b</b> the long one with the plans written out.'}</div>
      <div class="ll-filters">
        <div class="ll-chips"><span class="slv-note">Branch</span>${['all', 'SAA', 'KCA', 'AQ'].map(b => `<button type="button" class="ll-fchip${wvSel.branch === b ? ' on ll-act' : ''}" onclick="wvSet('branch','${b}')">${b === 'all' ? 'All' : lcEsc(WV_BR[b])}</button>`).join('')}</div>
        <div class="ll-chips"><span class="slv-note">Bought</span>${[['all', 'Everyone'], ['yes', 'Bought (' + lcNum(wvCan().filter(wvBought).length) + ')']].map(([k, l]) => `<button type="button" class="ll-fchip${wvSel.bought === k ? ' on ll-act' : ''}" onclick="wvSet('bought','${k}')">${l}</button>`).join('')}</div>
        <div class="ll-chips"><span class="slv-note">Message</span>${[['all', 'Both'], ['A', 'A short'], ['B', 'B long']].map(([k, l]) => `<button type="button" class="ll-fchip${wvSel.msg === k ? ' on ll-act' : ''}" onclick="wvSet('msg','${k}')">${l}</button>`).join('')}</div>
        <input id="wvSearch" class="ll-sel" type="search" placeholder="Search name or number" value="${lcEsc(wvQuery)}" oninput="wvQuery=this.value;wvPage=1;wvPaintTable()" style="min-width:210px">
        <button type="button" class="tglr lc-btn" onclick="wvCopy()" title="Copy the numbers shown, one per line">Copy numbers</button>
        <button type="button" class="tglr lc-btn" onclick="wvSaveFile('xlsx')">XLSX</button>
        <button type="button" class="tglr lc-btn" onclick="wvSaveFile('csv')">CSV</button>
        <span id="wvCount" class="slv-note" style="display:inline"></span>
        <span id="wvNote" class="slv-note" style="display:inline"></span>
      </div>
      <div id="wvTable"></div>
      <p class="slv-muted ll-foot">Built from Phorest sales (2026 spend AED 4,000+ net of VAT, last visit within 90 days of 14 Oct) and respond.io (she wrote to one of our branch WhatsApp numbers in the last 12 months). Phorest marketing opt-in is not checked. Names and phone numbers on this page are for Level 3 and above. A client who bought a Wellness Voucher is left out. The list is refreshed by hand, so it is only as fresh as the date above.</p>
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
  const cols = ['Client', 'Wave', 'Message', '2026 spend', 'Last visit', 'Last wrote to us', 'Phone', 'Status', 'Bought'];
  const boughtCell = r => wvBought(r) ? `<b>${lcEsc(wvDay(r.bought_on))}</b><div class="slv-note">${lcEsc(wvBoughtLine(r))}</div><div class="slv-note">${lcEsc(r.bought_serial || '')}</div>` : '<span class="slv-muted">–</span>';
  const tr = shown.map(r => `<tr${wvBought(r) ? ' class="wv-bought"' : ''}>
      <td>${lcEsc(r.client)}<div class="slv-note">${lcEsc(WV_BR[r.branch] || r.branch)}</div></td>
      <td class="ll-nw">${waveCell(r)}</td>
      <td class="ll-nw">${armCell(r)}</td>
      <td class="ll-nw">${lcNum(Math.round(r.spend))}<div class="slv-note">${r.band ? lcEsc(WV_BANDS[r.band]) : ''}</div></td>
      <td class="ll-nw">${lcEsc(wvDay(r.last_visit))}</td>
      <td class="ll-nw">${r.last_wrote ? lcEsc(wvDay(r.last_wrote)) + `<div class="slv-note">to ${lcEsc(r.wrote_to || '')}</div>` : '<span class="slv-muted">–</span>'}</td>
      <td class="ll-ph">${r.phone ? `<a href="tel:${lcEsc(r.phone)}" style="color:inherit;white-space:nowrap">${lcEsc(r.phone)}</a>` : '–'}</td>
      <td>${wvPill(r)}</td>
      <td class="ll-nw">${boughtCell(r)}</td></tr>`).join('');
  const cards = shown.map(r => `<li class="prd-card${wvBought(r) ? ' wv-bought' : ''}"><div class="prd-body">
      <div class="prd-top"><span class="prd-name">${lcEsc(r.client)}</span><span>${wvPill(r)}</span></div>
      <div class="prd-meta">${lcEsc(WV_BR[r.branch] || r.branch)} · ${r.wave ? 'Wave ' + lcEsc(r.sub_wave || r.wave) : ''}${wvArm(r) ? ' · ' + lcEsc(wvArmName(wvArm(r))) : ''}${wvIsNew(r) ? ' (new)' : ''} · AED ${lcNum(Math.round(r.spend))}</div>
      ${wvBought(r) ? `<div class="prd-meta wv-bought-line"><b>Bought ${lcEsc(wvDay(r.bought_on))}</b> · ${lcEsc(wvBoughtLine(r))}</div>` : ''}
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
  const head = ['Client', 'Branch', 'Wave (GHL tag)', 'Message (test)', 'Spend band', '2026 spend (AED)', 'Last visit', 'Phone', 'Last wrote to us', 'Wrote to', 'Status', 'On the list since', 'Bought on', 'Voucher', 'Paid (AED)', 'Paid via'];
  const num = new Set(['2026 spend (AED)', 'Paid (AED)']);
  const lines = rows.map(r => [r.client, WV_BR[r.branch] || r.branch, r.sub_wave ? 'wv-blast-wave-' + r.sub_wave : r.wave ? 'wv-blast-wave-' + r.wave : 'Not tagged', wvArmName(wvArm(r)), r.band ? WV_BANDS[r.band] : '', Math.round(r.spend), r.last_visit || '',
    r.phone || '', r.last_wrote || '', r.wrote_to || '', r.can_message ? 'Can message' : wvWhy(r), r.listed_on || '',
    r.bought_on || '', r.bought_serial || '', wvBought(r) ? Math.round(r.bought_aed) : '', wvBought(r) ? wvPayName(r.bought_pay) : '']);
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
// Scheduling (16 Oct 2026, migrations/send_schedule*.sql, send-schedule.js): each queued client carries the time she may go (run_at). The Send at column
// sets it for a whole wave: a set time, how many (top spenders first), and "B at a time every M minutes". A cron (wv-send-worker, every minute inside
// the window) sends them when they are due, so the page can be closed. Failed sends are sorted into retry / will fail again below the table.
let wvSnd = null, wvSndMsg = '', wvSndBusy = false, wvSndTimer = 0, wvSkew = 0, wvSchedCtx = null;
const wvSndWin = i => i && i.dubai_hour >= i.hour_from && i.dubai_hour < i.hour_to;
const wvNow = () => Date.now() + wvSkew;   // the database's clock, so "due" does not depend on the laptop's
const wvIsSched = w => Number(w.waiting) > 0 && !!w.next_run_at && Date.parse(w.next_run_at) > wvNow() + 1000;
const wvIsDue = w => Number(w.waiting) > 0 && !wvIsSched(w);
async function wvSendLoad() {
  try {
    const { data, error } = await sb.rpc('wv_send_info');
    if (error || !data) throw error || new Error('no info');
    wvSnd = data;
    if (data.server_now) wvSkew = Date.parse(data.server_now) - Date.now();
  } catch (e) { console.error(e); wvSnd = null; wvSndMsg = 'The send panel did not load. Refresh to try again.'; }
  wvSendPaint();
}
function wvSendPaint() {
  const box = document.getElementById('wvSendBox');
  if (!box) return;
  const logOpen = !!box.querySelector('.wv-log[open]');   // keep the activity log open across repaints
  if (!wvSnd) { box.innerHTML = `<div class="ll-panel wv-send"><p class="slv-muted">${lcEsc(wvSndMsg || 'Loading…')}</p></div>`; return; }
  const i = wvSnd, on = !!i.enabled, win = wvSndWin(i);
  const dt = ts => ts ? lcEsc(new Date(ts).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })) : '<span class="slv-muted">–</span>';
  const rows = (i.waves || []).map(w => {
    const total = Number(w.clients) || 0, sent = Number(w.sent) || 0, wait = Number(w.waiting) || 0, bad = Number(w.failed) || 0, skip = Number(w.skipped) || 0, canc = Number(w.cancelled) || 0;
    const msg = w.sub_wave.endsWith('a') ? 'Short' : 'Long', sched = wvIsSched(w);
    let st = '<span class="slv-muted">Not sent</span>';
    if (wait && sched) st = `<b>Scheduled</b>: ${lcNum(sent)} done, ${lcNum(wait)} waiting`;
    else if (wait) st = `<span class="wv-ring" role="status" aria-label="Sending"></span> <b>Sending</b>: ${lcNum(sent)} done, ${lcNum(wait)} waiting`;
    else if (sent || bad || skip || canc) st = `Sent <b>${lcNum(sent)}</b> of ${lcNum(total)}`;
    const extra = [bad ? `<span class="ll-pill ll-num" title="Failed: sorted under Failed sends below">${lcNum(bad)} failed</span>` : '', skip ? `<span class="ll-pill ll-num" title="Skipped by a safety check, see the log">${lcNum(skip)} skipped</span>` : '', canc ? `<span class="ll-pill ll-num">${lcNum(canc)} stopped</span>` : ''].filter(Boolean).join(' ');
    const left = Math.max(0, total - sent - wait - bad - skip);
    let act = '', at = '<span class="slv-muted">–</span>';
    if (wait) {
      act = `${sched ? `<button type="button" class="tglr lc-btn" onclick="wvSendBring('${w.sub_wave}')"${wvSndBusy ? ' disabled' : ''}>Send now</button>` : `<button type="button" class="tglr lc-btn" onclick="wvSendRun()"${wvSndBusy ? ' disabled' : ''}>Run now</button>`} <button type="button" class="tglr lc-btn" onclick="wvSendStop('${w.sub_wave}')">Stop</button>`;
      at = `<div class="ss-cell">${w.next_run_at ? `<span>${sched ? 'Next' : 'Due'} <b>${lcEsc(ssFmt(w.next_run_at))}</b></span>` : ''}${w.last_run_at && w.last_run_at !== w.next_run_at ? `<span class="slv-note">Last ${lcEsc(ssFmt(w.last_run_at))}</span>` : ''}<button type="button" class="tglr lc-btn" onclick="wvSchedOpen('${w.sub_wave}','move')">Change time</button></div>`;
    } else if (left > 0) {
      act = `<button type="button" class="tglr lc-btn wv-go" onclick="wvSendGo('${w.sub_wave}')"${wvSndBusy ? ' disabled' : ''}>${sent ? 'Send the rest' : 'Send wave ' + w.sub_wave}</button>`;
      at = `<button type="button" class="tglr lc-btn lq-pri" onclick="wvSchedOpen('${w.sub_wave}','new')"${wvSndBusy ? ' disabled' : ''}>Schedule…</button>`;
    } else if (sent) act = '<span class="slv-muted">Done</span>';
    // Launched = when it was queued; Finished = the last one done, once nothing is waiting. Waves 1a to 2b were sent by hand in GHL: their time is
    // the first client's enrolment time in GHL's Send workflow history (right to the minute, the wave took under a minute).
    return `<tr><td class="ll-nw"><b>Wave ${lcEsc(w.sub_wave)}</b></td><td class="ll-nw">${msg}</td><td class="ll-nw">${lcNum(total)}</td><td>${st} ${extra}</td><td class="ll-nw">${at}</td><td class="ll-nw">${dt(w.launched_at)}</td><td class="ll-nw">${wait ? '<span class="slv-muted">in progress</span>' : dt(w.finished_at)}</td><td class="ll-nw">${act}</td></tr>`;
  }).join('');
  const recent = (i.recent || []).map(r => `<tr><td class="ll-nw">${lcEsc(r.sub_wave)}</td><td>${lcEsc(r.client)}<div class="slv-note">${lcEsc(WV_BR[r.branch] || r.branch)}</div></td><td class="ll-nw">${lcEsc(r.status)}</td><td>${lcEsc(r.error || '')}</td><td class="ll-nw">${r.done_at ? dt(r.done_at) : 'waiting'}</td></tr>`).join('');
  const tri = ssTriageHtml((i.failed || []).map(f => ({ id: f.id, cls: f.cls, error: f.error })), { retry: 'wvTriRetry', copy: 'wvTriCopy',
    stopSay: 'These fail the same way every time (no contact with that number in GHL, or GHL refused). Fix the contact in GHL, or message her by hand.' });
  box.innerHTML = `<div class="ll-panel wv-send">
    <div class="wv-send-h"><div><b>Send a wave from here</b> <span class="slv-note">Level 5 only</span> <a class="slv-note" href="?view=wvperf" onclick="event.preventDefault();showView('wvperf', document.querySelector('#sidebar .nav-sub[onclick*=&quot;wvperf&quot;]'))">Results: Wellness Voucher Performance</a></div>
      <button type="button" class="tglr lc-btn wv-sw ${on ? 'on' : 'off'}" onclick="wvSendSwitch(${on ? 'false' : 'true'})" title="The kill switch. Off: nothing is sent, even what is already queued.">Sending is ${on ? 'ON' : 'OFF'} · turn ${on ? 'off' : 'on'}</button></div>
    <p class="slv-muted wv-send-p">Each client gets the GHL go tag, which makes GHL send her WhatsApp message and add her to the Wellness Voucher pipeline (Received Blast Campaign). a = short message, b = long message. Sends only between ${i.hour_from}:00 and ${i.hour_to}:00 Dubai${win ? '' : ' <b>(outside that window now)</b>'}. <b>Schedule…</b> picks the day and time, how many, and a pace (for example 40 every 30 minutes); it then sends itself, so you can close this page${on ? '' : ', but only while Sending is ON'}. Sent messages cannot be called back; <b>Stop</b> cancels only the ones still waiting.</p>
    <div class="slv-wrap"><table class="slv-table"><thead><tr><th>Wave</th><th>Message</th><th>Clients</th><th>Status</th><th>Send at</th><th>Launched</th><th>Finished</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <div id="wvSendNote" class="slv-note" style="margin-top:6px">${lcEsc(wvSndMsg)}</div>
    ${tri}
    <details class="wv-log"><summary>Recent activity (last 40)</summary>
      <div class="slv-wrap"><table class="slv-table"><thead><tr><th>Wave</th><th>Client</th><th>Status</th><th>Note</th><th>When</th></tr></thead>
      <tbody>${recent || '<tr><td colspan="5" class="slv-muted">Nothing has been sent from this page yet.</td></tr>'}</tbody></table></div></details></div>`;
  if (logOpen) { const d = box.querySelector('.wv-log'); if (d) d.open = true; }
  // While a wave is going out, look again every 6 seconds so the numbers and the ring keep up, even if another tab (or the cron) is doing the sending.
  // Waves only waiting for their time need a look once in a while.
  clearTimeout(wvSndTimer);
  const ws = i.waves || [];
  if (ws.some(w => Number(w.waiting) > 0) && !wvSndBusy) wvSndTimer = setTimeout(() => { if (document.getElementById('wvSendBox')) wvSendLoad(); }, ws.some(wvIsDue) ? 6000 : 30000);
}
// A review dialog in place of the browser's confirm() (audit 18 Oct 2026, P4-19), the same dialog the schedule and retry steps use
// (send-schedule.js ssModalOpen). Cancel has the focus, so an Enter or a stray tap does not send; Escape, a click outside or any other way
// the dialog goes away counts as Cancel. Resolves true only for the button named in `ok`.
function wvAsk({ title, lines, ok }) {
  return new Promise(res => {
    ssModalOpen(`<h3>${lcEsc(title)}</h3>
      <ul class="lqm-list">${lines.map(l => `<li>${l}</li>`).join('')}</ul>
      <div class="lqm-btns"><button type="button" class="tglr lc-btn" id="wvAskNo">Cancel</button>
        <button type="button" class="tglr lc-btn lq-pri" id="wvAskYes">${lcEsc(ok)}</button></div>`);
    const no = document.getElementById('wvAskNo'), yes = document.getElementById('wvAskYes');
    const gone = new MutationObserver(() => { if (!document.getElementById('ssModal')) { gone.disconnect(); res(false); } });
    gone.observe(document.body, { childList: true });
    if (no) { no.onclick = () => { ssModalClose(); res(false); }; no.focus(); }
    if (yes) yes.onclick = () => { gone.disconnect(); ssModalClose(); res(true); };
  });
}
function wvSendSay(t) { wvSndMsg = t; const n = document.getElementById('wvSendNote'); if (n) n.textContent = t; }
async function wvSendSwitch(on) {
  if (on && !(await wvAsk({ title: 'Turn sending ON?', ok: 'Turn sending on', lines: [
    'Waves you queue, or have scheduled, will go to <b>real clients</b> at their time.',
    'You can turn it off again at any time; that stops everything still waiting.'] }))) return;
  const { data, error } = await sb.rpc('wv_send_config_set', { p_patch: { enabled: on } });
  if (error) { wvSendSay('Could not change the switch: ' + (error.message || error)); return; }
  wvSnd = data; wvSndMsg = on ? 'Sending is ON.' : 'Sending is OFF. Nothing more will go.'; await wvSendLoad();
}
async function wvSendGo(sub) {
  const w = (wvSnd?.waves || []).find(x => x.sub_wave === sub);
  if (!w) return;
  if (!wvSnd.enabled) { wvSendSay('Turn sending ON first (top right of this panel).'); return; }
  if (!wvSndWin(wvSnd)) { wvSendSay(`It is outside the send window (${wvSnd.hour_from}:00 to ${wvSnd.hour_to}:00 Dubai). Use Schedule… to pick when it goes.`); return; }
  const msg = sub.endsWith('a') ? 'the SHORT message' : 'the LONG message';
  if (!(await wvAsk({ title: `Send wave ${sub} now?`, ok: `Send wave ${sub}`, lines: [
    `Up to <b>${lcNum(Number(w.clients) || 0)}</b> clients get <b>${msg}</b> on WhatsApp from GHL, and go into the Wellness Voucher pipeline.`,
    `Sending is ${wvSnd.enabled ? 'ON' : 'OFF'}; the send window is ${wvSnd.hour_from}:00 to ${wvSnd.hour_to}:00 Dubai.`,
    'Sent messages cannot be called back.'] }))) return;
  wvSndBusy = true; wvSendPaint(); wvSendSay(`Queueing wave ${sub}…`);
  const { data, error } = await sb.rpc('wv_send_enqueue', { p_sub: sub });
  if (error) { wvSndBusy = false; wvSendSay('Could not queue it: ' + (error.message || error)); await wvSendLoad(); return; }
  wvSendSay(`Queued ${data?.queued ?? 0} for wave ${sub}. Sending…`);
  await wvSendRun();
}
// Calls the worker until nothing is due, the switch goes off or the window closes. If the page is closed first, what is left stays queued and the
// cron (every minute inside the window) carries on.
async function wvSendRun() {
  wvSndBusy = true;
  try {
    for (let k = 0; k < 40; k++) {
      const { data: r, error } = await sb.functions.invoke('wv-send-worker', { body: {} });
      if (error) { wvSendSay('The sender did not answer. Press Run now to try again.'); break; }
      await wvSendLoad();
      const waves = wvSnd?.waves || [], due = waves.filter(wvIsDue).reduce((s, w) => s + (Number(w.waiting) || 0), 0), later = waves.some(wvIsSched);
      if (!due || !wvSnd?.enabled || !wvSndWin(wvSnd)) {
        wvSendSay(!due ? (later ? 'Sent what was due. The rest goes at its scheduled time.' : 'All sent.') : !wvSnd?.enabled ? 'Sending is off, so the rest is waiting.' : 'The send window is closed, so the rest is waiting.');
        break;
      }
      if (!r || !r.claimed) await new Promise(res => setTimeout(res, 3000));
    }
  } catch (e) { console.error(e); wvSendSay('Something went wrong. Check the activity log, then press Run now.'); }
  wvSndBusy = false; wvSendPaint();
}
async function wvSendStop(sub) {
  if (!(await wvAsk({ title: `Stop wave ${sub}?`, ok: `Stop wave ${sub}`, lines: [
    'Everyone still waiting is cancelled.',
    'Anyone already tagged has been sent and cannot be called back.'] }))) return;
  const { data, error } = await sb.rpc('wv_send_stop', { p_sub: sub });
  if (error) { wvSendSay('Could not stop it: ' + (error.message || error)); return; }
  await wvSendLoad(); wvSendSay(`Stopped wave ${sub}: ${data?.cancelled ?? 0} cancelled.`);
}
// Bring a scheduled wave forward: everyone waiting becomes due now (the window and the switch still apply).
async function wvSendBring(sub) {
  const w = (wvSnd?.waves || []).find(x => x.sub_wave === sub);
  if (!w) return;
  if (!(await wvAsk({ title: `Send wave ${sub} now?`, ok: 'Send now', lines: [
    `The <b>${lcNum(Number(w.waiting) || 0)}</b> still waiting go now, instead of at their scheduled time.`,
    `Sending is ${wvSnd.enabled ? 'ON' : 'OFF'}; the send window is ${wvSnd.hour_from}:00 to ${wvSnd.hour_to}:00 Dubai.`,
    'Sent messages cannot be called back.'] }))) return;
  const { data, error } = await sb.rpc('wv_send_reschedule', { p_sub: sub, p_at: null });
  if (error) { wvSendSay('Could not change the time: ' + (error.message || error)); return; }
  await wvSendLoad();
  if (wvSnd?.enabled && wvSndWin(wvSnd)) { wvSendSay(`Wave ${sub}: ${data?.moved ?? 0} moved to now. Sending…`); await wvSendRun(); }
  else wvSendSay(`Wave ${sub}: ${data?.moved ?? 0} moved to now. ${wvSnd?.enabled ? 'They go when the send window opens.' : 'Sending is OFF, so nothing goes until you turn it ON.'}`);
}

// ── SCHEDULE, CHANGE TIME, RETRY (one dialog: when, how many, what pace) ───────────────────────────────────────
function wvSchedForm(max, nowOk) {
  const i = wvSnd;
  return `${i.enabled ? '' : '<p class="ss-plan ss-bad">Sending is OFF. Nothing goes until you turn it ON at the top of this panel.</p>'}
    ${ssWhenHtml('wvs', { max, maxNow: max, from: i.hour_from, to: i.hour_to, nowOk, onChange: r => { const b = document.getElementById('wvsGo'); if (b) b.disabled = !!r.error; } })}`;
}
function wvSchedOpen(sub, mode) {
  const w = (wvSnd?.waves || []).find(x => x.sub_wave === sub);
  if (!w || !wvSnd) return;
  const total = Number(w.clients) || 0, sent = Number(w.sent) || 0, wait = Number(w.waiting) || 0, bad = Number(w.failed) || 0, skip = Number(w.skipped) || 0;
  const move = mode === 'move', left = Math.max(0, total - sent - wait - bad - skip), max = move ? wait : left;
  if (max < 1) { wvSendSay('Nobody left in this wave.'); return; }
  wvSchedCtx = { sub, move };
  const msg = sub.endsWith('a') ? 'the SHORT message' : 'the LONG message';
  ssModalOpen(`<h3>${move ? 'Change the time of' : 'Schedule'} wave ${lcEsc(sub)}</h3>
    <p class="slv-note">${move ? `All ${lcNum(wait)} still waiting are moved to the new time and pace.` : `Up to ${lcNum(left)} clients can go, biggest spenders first. Each gets ${msg} on WhatsApp from GHL and goes into the Wellness Voucher pipeline.`}</p>
    ${wvSchedForm(max, true)}
    <ul class="lqm-list"><li>It sends itself at that time, even with this page closed. Times outside ${wvSnd.hour_from}:00 to ${wvSnd.hour_to}:00 Dubai wait for the window to open.</li>
      <li>Stop cancels the ones that have not gone. A message that has gone cannot be called back.</li></ul>
    <div class="lqm-btns"><button type="button" class="tglr lc-btn" onclick="ssModalClose()">Cancel</button>
      <button type="button" class="tglr lc-btn lq-pri" id="wvsGo" onclick="wvSchedGo()">${move ? 'Change time' : 'Schedule'}</button></div>`);
  if (move) { const n = document.getElementById('wvsN'); if (n) n.disabled = true; const at = document.querySelector('input[name=wvsMode][value=at]'); if (at) at.checked = true; }
  ssUpdate('wvs');
}
async function wvSchedGo() {
  const c = wvSchedCtx, r = ssWhenRead('wvs');
  if (!c || r.error) { ssUpdate('wvs'); return; }
  const b = document.getElementById('wvsGo');
  if (b) { b.disabled = true; b.textContent = 'Working…'; }
  const pace = { p_batch: r.batch, p_every: r.every };
  const res = c.retry ? await sb.rpc('wv_send_retry', { p_ids: c.ids.slice(0, r.limit), p_at: r.at, ...pace })
    : c.move ? await sb.rpc('wv_send_reschedule', { p_sub: c.sub, p_at: r.at, ...pace })
    : await sb.rpc('wv_send_enqueue', { p_sub: c.sub, p_at: r.at, p_limit: r.limit, ...pace });
  ssModalClose();
  if (res.error) { console.error(res.error); await wvSendLoad(); wvSendSay('Did not go through: ' + (res.error.message || res.error)); return; }
  const d = res.data || {};
  await wvSendLoad();
  const n = c.move ? d.moved : d.queued, first = d.first_at || r.first, last = d.last_at || r.last;
  wvSendSay(`${c.retry ? 'Retrying' : 'Wave ' + c.sub + ':'} ${lcNum(n ?? 0)} ${c.move ? 'moved' : 'queued'}. First ${ssFmt(first)}${last && last !== first ? `, last ${ssFmt(last)}` : ''}. ${wvSnd?.enabled ? 'It sends itself, you can close this page.' : 'Sending is OFF, so nothing goes until you turn it ON.'}`);
  if (!c.move && !r.at && wvSnd?.enabled && wvSndWin(wvSnd)) wvSendRun();   // as soon as: do not wait for the next minute of the cron
}
// ── failed-send triage (send-schedule.js draws it) ─────────────────────────────────────────────────────────────
const wvTriRows = cls => (wvSnd?.failed || []).filter(f => f.cls === cls);
function wvTriRetry(cls) {
  const rows = wvTriRows(cls);
  if (!rows.length || !wvSnd) return;
  wvSchedCtx = { retry: true, ids: rows.map(f => f.id) };
  ssModalOpen(`<h3>Retry ${lcNum(rows.length)} failed send${rows.length === 1 ? '' : 's'}?</h3>
    <p class="slv-note">Each one is looked up in GHL again first. Anyone who already has a go tag is skipped, so nobody is messaged twice. Choose when they go and at what pace.</p>
    ${wvSchedForm(rows.length, true)}
    <div class="lqm-btns"><button type="button" class="tglr lc-btn" onclick="ssModalClose()">Cancel</button>
      <button type="button" class="tglr lc-btn lq-pri" id="wvsGo" onclick="wvSchedGo()">Retry</button></div>`);
  ssUpdate('wvs');
}
async function wvTriCopy(cls) {
  const nums = [...new Set(wvTriRows(cls).map(f => f.phone).filter(Boolean))];
  try { await navigator.clipboard.writeText(nums.join('\n')); wvSendSay(`Copied ${lcNum(nums.length)} numbers.`); }
  catch (e) { wvSendSay('The browser would not copy.'); }
}
