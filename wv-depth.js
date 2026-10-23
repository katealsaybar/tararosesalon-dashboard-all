// Wellness Voucher blasts: the full performance of each blast (Kate, 23 Oct 2026: "an in depth performance of each blast, not just a summary").
// wv_blast_depth() (migrations/wv_blast_depth.sql, Level 3 and above, names for Level 3 and 5 only) returns b1..b4 with the same parts; this file draws them into
// each blast's block (wvBlockHtml in wv-blast.js reads b.depth). Loads after wv-blast.js and wv-last.js in the same lazy group and borrows their helpers
// (wvAed, wvPct, wvN, wvDay, wvGhl, wvHist, wvBlastData, wvTierName, wvPayName, WV_BR, WV_RATE) and Lost Clients' (lcEsc, lcNum).
// Every part says plainly when there is no record, so an empty number is never mistaken for a zero.
let wvDepth = null;
const wvDp = k => (wvDepth && wvDepth[k]) || null;
const wvDpPc = (a, b) => b ? Math.round(100 * a / b) + '%' : '';
async function wvDepthLoad() {
  try {
    const r = await sb.rpc('wv_blast_depth');
    wvDepth = (!r.error && r.data && r.data.b3) ? r.data : null;
    if (r.error) console.warn('wv_blast_depth', r.error);
  } catch (e) { console.error(e); wvDepth = null; }
}
const WV_BUCKETS = [['before', 'Before her message'], ['same', 'The same day'], ['d1', 'The next day'], ['d2_3', '2 to 3 days later'], ['d4_7', '4 to 7 days later'], ['d8p', '8 or more days later']];
const wvCutName = (k, dim, blast) => dim === 'branch' ? (WV_BR[k] || k) : blast === 'b3' ? (dim === 'g1' ? 'Wave ' + k : k === 'A' ? 'A: short message' : 'B: long message') : (k === 'warm' ? 'Warm: asked before' : 'Clean: not messaged before');

// From message to voucher: a bar for each step, as a share of the messages made. A step with no record says so.
function wvFunnelHtml(k) {
  const dp = wvDp(k), d = dp && dp.delivery, bt = dp && dp.bought, h = wvHist || {};
  const rows = [];   // [label, n | null, note]
  let base = 0;
  if (k === 'b1' || k === 'b2') {
    const g = wvGhl(k, 'whatsapp'), w = h[k] || {};
    if (!g) return '<p class="slv-muted">The send count did not load.</p>';
    base = g.tried;
    rows.push(['WhatsApp messages made', g.tried, ''], ['Got through', g.tried - g.failed, `${lcNum(g.failed)} failed, WhatsApp refused them`], ['Read', g.read, 'opened by the client'],
      ['Wrote back', null, 'not counted: only the messages were read from GoHighLevel'],
      ['Vouchers sold in the 7 days after', w.vouchers || 0, `voucher log; the till shows ${lcNum(w.phorest_vouchers || 0)} (${wvAed(w.phorest_aed)})`]);
  } else {
    const sent = d ? d.sent : 0, known = d && d.unknown < d.sent;
    base = sent;
    if (k === 'b4' && wvLp && wvLp.totals) { const left = wvLp.totals.bought_before + wvLp.totals.stopped; rows.push(['On the list', wvLp.totals.listed, left ? `${lcNum(wvLp.totals.to_message)} to message, ${lcNum(left)} left out (bought, or on a stop list)` : 'all to message']); }
    if (!sent) { if (k === 'b4') rows.push(['Sent', 'later', '']); }
    else rows.push([k === 'b3' ? 'Messaged' : 'Sent', sent, k === 'b3' ? 'every client got one message' : '']);
    if (sent) rows.push(['Got through', known ? d.seen + d.delivered : null, known ? `${lcNum(d.seen)} seen, ${lcNum(d.delivered)} delivered, ${lcNum(d.failed)} failed${d.sent_only ? ', ' + lcNum(d.sent_only) + ' not delivered yet' : ''}` : 'not read yet: respond.io\'s nightly check fills it in tomorrow morning'],
      ['Seen', known ? d.seen : null, known ? 'opened by the client' : ''], ['Wrote back', d.replied, k === 'b3' ? 'any message after ours (a check on 21 Oct, then respond.io)' : 'any message after ours, from respond.io'],
      ['Wrote STOP', d.stop, 'asked us not to message her again']);
    rows.push(['Bought a voucher', sent || k === 'b3' ? (bt ? bt.clients : 0) : 'later', bt && bt.clients ? `${lcNum(bt.vouchers)} voucher${bt.vouchers === 1 ? '' : 's'}, ${wvAed(bt.aed)}${bt.replied_buyers ? `; ${lcNum(bt.replied_buyers)} had written back` : ''}` : (sent ? 'none yet' : '')]);
  }
  const line = r => {
    const [label, n, note] = r;
    if (n === 'later') return `<div class="wv-fun"><div class="wv-fun-h"><span>${label}</span><b class="slv-muted">after it goes out</b></div></div>`;
    if (n == null) return `<div class="wv-fun"><div class="wv-fun-h"><span>${label}</span><b class="slv-muted">no record</b></div>${note ? `<div class="slv-note">${note}</div>` : ''}</div>`;
    const pc = base && label !== 'WhatsApp messages made' && label !== 'Messaged' && label !== 'Sent' && label !== 'On the list' ? wvPct(n, base) : '';
    const w = base ? Math.max(n ? 1.5 : 0, Math.min(100, 100 * n / base)) : 0;
    return `<div class="wv-fun"><div class="wv-fun-h"><span>${label}</span><b>${lcNum(n)}${pc ? ` <span class="slv-note">${pc}</span>` : ''}</b></div>
      <div class="wv-vtrack">${n ? `<span class="wv-bar" style="width:${w}%"><i data-tip="${lcEsc(label + ': ' + lcNum(n))}" tabindex="0" role="button" aria-label="${lcEsc(label + ': ' + lcNum(n))}"></i></span>` : ''}</div>${note ? `<div class="slv-note">${note}</div>` : ''}</div>`;
  };
  return `<div class="wv-pbox"><h4>From message to voucher</h4>${rows.map(line).join('')}<p class="slv-note">Each bar is a share of the messages made.</p></div>`;
}

// When they bought: by day, and how long after her message.
function wvWhenHtml(k) {
  const dp = wvDp(k); if (!dp) return '';
  const early = k === 'b1' || k === 'b2', days = (dp.by_day || []).filter(x => x.vouchers || x.sent);
  const bk = dp.buckets || {}, total = Object.values(bk).reduce((a, b) => a + b, 0);
  const buck = total ? WV_BUCKETS.filter(b => bk[b[0]]).map(b => `<div class="wv-fun"><div class="wv-fun-h"><span>${b[1]}</span><b>${lcNum(bk[b[0]])} <span class="slv-note">${wvDpPc(bk[b[0]], total)}</span></b></div>
      <div class="wv-vtrack"><span class="wv-bar" style="width:${Math.max(1.5, 100 * bk[b[0]] / total)}%"><i data-tip="${lcEsc(b[1] + ': ' + bk[b[0]] + ' voucher' + (bk[b[0]] === 1 ? '' : 's'))}" tabindex="0" role="button" aria-label="${lcEsc(b[1])}"></i></span></div></div>`).join('') : '<p class="slv-muted">No voucher sold from this blast yet.</p>';
  const tr = days.map(x => `<tr><td>${lcEsc(wvDay(x.d))}</td>${early ? '' : `<td>${x.sent ? lcNum(x.sent) : '<span class="slv-muted">–</span>'}</td>`}<td>${x.vouchers ? lcNum(x.vouchers) : '<span class="slv-muted">–</span>'}</td><td>${x.aed ? wvAed(x.aed) : '<span class="slv-muted">–</span>'}</td></tr>`).join('');
  return `<div class="wv-pbox"><h4>How soon they bought</h4>${buck}<p class="slv-note">Vouchers sold, by the days after ${early ? 'the send' : 'her own message'}.</p></div>
    <div class="wv-pbox"><h4>Day by day</h4>${days.length ? `<div class="wv-pscroll"><table class="slv-table wv-ptbl"><thead><tr><th>Day</th>${early ? '' : '<th>Sent</th>'}<th>Vouchers</th><th>AED</th></tr></thead><tbody>${tr}</tbody></table></div>` : '<p class="slv-muted">Nothing yet.</p>'}</div>`;
}

// Who bought, one line per voucher.
function wvBuyersHtml(k) {
  const dp = wvDp(k); if (!dp || !dp.buyers || !dp.buyers.length) return '';
  const early = k === 'b1' || k === 'b2';
  const grp = b => early ? '' : k === 'b3' ? `Wave ${b.g1}${b.g2 ? ', ' + (b.g2 === 'A' ? 'short' : 'long') + ' message' : ''}` : (b.g1 === 'warm' ? 'Warm list' : 'Clean list');
  const tr = dp.buyers.map(b => `<tr><td>${lcEsc(b.who || 'A client')}<div class="slv-note">${lcEsc(WV_BR[b.br] || b.br || '')}${grp(b) ? ' · ' + lcEsc(grp(b)) : ''}</div></td>
      <td>${lcEsc(wvDay(b.date))}<div class="slv-note">${b.days === 0 ? 'same day' : b.days < 0 ? 'before her message' : lcNum(b.days) + ' day' + (b.days === 1 ? '' : 's') + ' after'}${b.replied ? ' · wrote back' : ''}</div></td>
      <td>${wvAed(b.aed)}<div class="slv-note">${lcEsc(wvTierName(b.serial))} · ${lcEsc(wvPayName(b.pay))}</div></td></tr>`).join('');
  return `<div class="wv-pbox wv-pwide"><h4>Who bought</h4><div class="wv-pscroll"><table class="slv-table wv-ptbl wv-tbl3"><thead><tr><th>Client</th><th>Bought</th><th>Voucher</th></tr></thead><tbody>${tr}</tbody></table></div>
    ${early ? `<p class="slv-note">These are the till's voucher sales in the 7 days after the send. We cannot tell who of them got the message: it went from GoHighLevel and the list of who got it is not kept here.</p>` : ''}</div>`;
}

// Which group did best (Blasts 3 and 4): sent, seen, wrote back, bought.
function wvCutsHtml(k) {
  const dp = wvDp(k); if (!dp || !(dp.cuts || []).length) return '';
  const d = dp.delivery, known = d && d.unknown < d.sent;
  const box = (title, dim) => {
    const rows = (dp.cuts || []).filter(c => c.dim === dim); if (!rows.length) return '';
    const tr = rows.map(c => `<tr><td>${lcEsc(wvCutName(c.k, dim, k))}</td><td>${lcNum(c.sent)}${known ? `<div class="slv-note">${lcNum(c.seen)} seen</div>` : ''}</td>
        <td>${lcNum(c.replied)}<div class="slv-note">${wvDpPc(c.replied, c.sent)}</div></td><td>${lcNum(c.bought)}<div class="slv-note">${c.aed ? wvAed(c.aed) : wvPct(c.bought, c.sent) + ' bought'}</div></td></tr>`).join('');
    return `<div class="wv-pbox"><h4>${title}</h4><div class="wv-pscroll"><table class="slv-table wv-ptbl"><thead><tr><th></th><th>Sent</th><th>Wrote back</th><th>Bought</th></tr></thead><tbody>${tr}</tbody></table></div></div>`;
  };
  return (k === 'b3' ? box('By wave', 'g1') + box('By message', 'g2') : box('By list', 'g1')) + box('By branch', 'branch');
}

// What they bought: tier, tender and the average voucher.
function wvWhatHtml(k) {
  const dp = wvDp(k); if (!dp || !dp.bought || !dp.bought.vouchers) return '';
  const tier = (dp.tiers || []).map(x => `<tr><td>${lcEsc(({ D: 'Dip Your Toes', S: 'Season of You', V: 'All-In VIP Year' })[x.k] || x.k)}</td><td>${lcNum(x.vouchers)}</td><td>${wvAed(x.aed)}</td></tr>`).join('');
  const pay = (dp.pays || []).map(x => `<tr><td>${lcEsc(wvPayName(x.k) || x.k)}</td><td>${lcNum(x.vouchers)}</td><td>${wvAed(x.aed)}</td></tr>`).join('');
  const t = tb => `<div class="wv-pscroll"><table class="slv-table wv-ptbl"><thead><tr><th></th><th>Vouchers</th><th>AED</th></tr></thead><tbody>${tb}</tbody></table></div>`;
  return `<div class="wv-pbox"><h4>What they bought</h4>${t(tier)}<p class="slv-note">Average voucher ${wvAed(dp.bought.avg_ticket)}.</p></div><div class="wv-pbox"><h4>How they paid</h4>${t(pay)}</div>`;
}

// What it cost against what came in.
function wvEconHtml(k) {
  const d = (typeof wvBlastData === 'function' ? wvBlastData() : []).find(x => x.key === k), dp = wvDp(k);
  if (!d || !d.cost || !d.tried) return '';
  const early = k === 'b1' || k === 'b2';   // blasts 1 and 2: the voucher log's count, the same one the cards use
  const v = !early && dp && dp.bought ? dp.bought.vouchers : d.vouchers, c = !early && dp && dp.bought ? dp.bought.clients : (d.clients || d.vouchers);
  if (!v) return `<div class="wv-pbox"><h4>Cost against what came in</h4><p>${wvAed(d.cost)} (estimate) for ${lcNum(d.tried)} messages, and nothing has sold from them yet.</p></div>`;
  const rows = [[wvAed(d.cost / v), 'Cost for each voucher sold'], [wvAed(d.cost / Math.max(1, c)), 'Cost for each client who bought'], ['1 in ' + lcNum(Math.round(d.tried / v)), 'Messages for each voucher'], [wvAed(d.aed / v), 'Average voucher']];
  return `<div class="wv-pbox"><h4>Cost against what came in</h4><div class="wv-stats wv-stats2">${rows.map(r => `<div class="wv-stat"><div class="wv-sn">${r[0]}</div><div class="wv-sl">${r[1]}</div></div>`).join('')}</div>
    <p class="slv-note">${early || k === 'b3' ? `Cost is the estimate at GoHighLevel's rate (AED ${WV_GHL_RATE} for each WhatsApp message ${k === 'b3' ? 'sent' : 'that got through'}${k === 'b1' ? `, AED ${WV_GHL_EMAIL} for each email` : ''}).` : `Cost is the estimate on this page (messages × AED ${WV_RATE}).`} The vouchers are the ones counted above.</p></div>`;
}

function wvDepthHtml(k) {
  if (!wvDp(k)) return '';
  const parts = [wvFunnelHtml(k), wvEconHtml(k), wvWhenHtml(k), wvWhatHtml(k), wvCutsHtml(k)].join('');
  return `<details class="wv-how wv-more wv-depth" open><summary>Full performance of this blast</summary>
    <div class="wv-pgrid">${parts}</div>${wvBuyersHtml(k)}</details>`;
}
