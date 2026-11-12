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
    // Blast 4's reply check (who pressed Tell me more, Reserve mine, Not for me, STOP), Level 3 and 5 only: the function refuses Level 4 and the rows just say so.
    try { const r2 = await sb.rpc('wv_last_replies_get'); wvLr = (!r2.error && r2.data && Array.isArray(r2.data.rows)) ? r2.data : null; } catch (e) { wvLr = null; }
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

// Warm against Standard (Blast 4) and Short against Long (Blast 3), laid out like the Lost Clients Performance page (Kate, 2 Nov 2026): a row per question, one column per side,
// the verdict on top. The two pages share one definition (agreed with the Lost Clients session): Warm and Standard are told apart by the AUDIENCE, and the text each side got is always
// shown beside it. Blast 4: Warm = the 20 who asked about the voucher on Blast 3 and had not bought, Standard = the 292 clean list. Blast 3 has no warm/standard split (all 600 had
// written to us in the last 12 months, so every one is warm): its only split is the short message against the long one, and it says so. "Bought" is a voucher bought (the till,
// matched by name), not an appointment booked. A comparison with fewer than 5 buyers on a side is "too few to call", the same rule as the Lost Clients page.
let wvLr = null;   // Blast 4's reply check (wv_last_replies_get, Level 3 and 5 only): who pressed what, per list
const wvLrReplied = r => r.tell_me_more || r.reserve_mine || r.not_for_me || r.stop || r.other;
const wvLrSay = r => r.reserve_mine ? 'Reserve mine' : r.tell_me_more ? 'Tell me more' : r.not_for_me ? 'Not for me' : r.stop ? 'STOP' : 'Wrote something else';
function wvBoughtSpec(title, list) {
  if (typeof TRSD === 'undefined' || !list || !list.length) return null;
  const l = list.slice().sort((a, b) => String(a.date) < String(b.date) ? -1 : 1);
  return { title, cur: 'AED', views: [{ id: 'b', label: 'Who bought', load: async () => ({
    sub: l.length + (l.length === 1 ? ' voucher' : ' vouchers') + ' bought by clients we messaged.',
    cols: [{ k: 'who', l: 'Client' }, { k: 'br', l: 'Branch' }, { k: 'date', l: 'Bought', t: 'date' }, { k: 'aed', l: 'Paid', t: 'aed' }, { k: 'v', l: 'Voucher' }, { k: 'pay', l: 'Paid via' }],
    rows: l.map(b => ({ who: b.who || 'A client', br: WV_BR[b.br] || b.br || '', date: String(b.date || '').slice(0, 10), aed: +b.aed || 0, v: wvTierName(b.serial), pay: wvPayName(b.pay) })),
    foot: { who: 'Total', aed: l.reduce((a, b) => a + (+b.aed || 0), 0) } }) }] };
}
function wvLrSpec(title, rows) {
  if (typeof TRSD === 'undefined' || !rows || !rows.length) return null;
  return { title, views: [{ id: 'r', label: 'Who wrote back', load: async () => ({
    sub: rows.length + (rows.length === 1 ? ' client' : ' clients') + '. From the reply check on the blast channel.',
    cols: [{ k: 'who', l: 'Client' }, { k: 'br', l: 'Branch' }, { k: 'said', l: 'Said' }, { k: 'at', l: 'Last reply', t: 'date' }],
    rows: rows.map(r => ({ who: r.client, br: WV_BR[r.branch] || r.branch || '', said: wvLrSay(r), at: String(r.last_reply_at || '').slice(0, 10) })) }) }] };
}
function wvMsgSpec(title, rows) {
  if (typeof TRSD === 'undefined' || !rows || !rows.length) return null;
  return { title, cur: 'AED', views: [{ id: 'm', label: 'Clients messaged', load: async () => ({
    sub: rows.length + ' clients on the list.',
    cols: [{ k: 'who', l: 'Client' }, { k: 'br', l: 'Branch' }, { k: 'sp', l: '2026 spend', t: 'aed' }, { k: 'lv', l: 'Last visit', t: 'date' }],
    rows: rows.map(r => ({ who: r.client, br: WV_BR[r.branch] || r.branch || '', sp: +r.spend || 0, lv: String(r.last_visit || '').slice(0, 10) })) }) }] };
}
function wvCompareHtml(k) {
  const dp = wvDp(k); if (!dp || (k !== 'b3' && k !== 'b4')) return '';
  const b4 = k === 'b4', dim = b4 ? 'g1' : 'g2', keys = b4 ? ['warm', 'clean'] : ['A', 'B'];
  const C = keys.map(x => (dp.cuts || []).find(c => c.dim === dim && c.k === x)); if (!C[0] || !C[1]) return '';
  const d = dp.delivery, known = d && d.unknown < d.sent;
  const rate = b4 ? WV_RATE : WV_GHL_RATE, usdRate = b4 ? 0.046 : 0.0524;
  const lr = b4 && wvLr && Array.isArray(wvLr.rows) ? wvLr : null;
  const nm = ['Warm', 'Standard'], nmB3 = ['A: short', 'B: long'], name = i => (b4 ? nm : nmB3)[i];
  const aed2 = n => 'AED ' + (Math.round(n * 100) / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const num = (txt, sp) => sp && typeof TRSD !== 'undefined' ? TRSD.num(txt, sp) : txt;
  const sm = x => `<span class="slv-note">${x}</span>`;
  const who = i => b4 ? name(i) : 'the ' + (i ? 'long' : 'short') + ' message';
  const S = C.map((c, i) => {
    const rr = lr ? lr.rows.filter(r => r.seg === keys[i] && wvLrReplied(r)) : null;
    return { c, reached: known ? c.seen + c.delivered : null, sp: c.sent * rate, rr,
      tm: rr ? rr.filter(r => r.tell_me_more || r.reserve_mine) : null, nf: rr ? rr.filter(r => r.not_for_me || r.stop) : null,
      bl: (dp.buyers || []).filter(b => b[dim] === c.k), list: b4 && typeof wvLpRows !== 'undefined' && wvLpRows ? wvLpRows.filter(r => r.seg === c.k) : null };
  });
  const per100 = (b, sent) => sent ? (100 * b / sent).toFixed(1) : '0.0';
  const none = '<span class="slv-muted">not recorded</span>', lvl = '<span class="slv-muted">Level 3 and 5 only</span>';
  const R = [];   // [label, cell for side 1, cell for side 2, class]
  R.push(['Who it went to', ...S.map((s, i) => b4 ? (i ? 'Top spenders (AED 2,000+ in 2026) we had not messaged before' : 'Asked about the voucher on Blast 3 and had not bought') : `${lcNum(s.c.sent)} clients, the "${i ? 'b' : 'a'}" half of each wave. All had written to us in the last 12 months`)]);
  R.push(['The text they got', ...(b4 ? ['<code>wellness_voucher_last_push_warm</code>', '<code>wellness_voucher_last_push_new</code>'] : ['Picture caption, no name in it', 'Longer text with her first name'])]);
  R.push(['Clients messaged', ...S.map((s, i) => num(lcNum(s.c.sent), s.list && wvMsgSpec(name(i) + ': clients messaged', s.list)))]);
  R.push(['Reached (delivered or seen)', ...S.map(s => known ? `${lcNum(s.reached)} ${sm(wvDpPc(s.reached, s.c.sent))}` : none)]);
  if (b4) {
    R.push(['Replied to the message <small>of reached</small>', ...S.map((s, i) => s.rr ? `${num(lcNum(s.rr.length), wvLrSpec(name(i) + ': replied to the message', s.rr))} ${sm(wvDpPc(s.rr.length, s.reached))}` : lvl)]);
    R.push(['Pressed Tell me more or Reserve mine', ...S.map((s, i) => s.tm ? num(lcNum(s.tm.length), wvLrSpec(name(i) + ': Tell me more or Reserve mine', s.tm)) : lvl)]);
    R.push(['Not for me / STOP', ...S.map((s, i) => s.nf ? `${num(lcNum(s.nf.filter(r => r.not_for_me).length), wvLrSpec(name(i) + ': Not for me or STOP', s.nf))} / ${lcNum(s.nf.filter(r => r.stop).length)}` : lvl)]);
  } else R.push(['STOP', none, none]);
  R.push(['Any message after the blast <small>includes ordinary chat</small>', ...S.map(s => `${lcNum(s.c.replied)} ${sm(wvDpPc(s.c.replied, s.c.sent) + (b4 ? '' : ' of messaged'))}`)]);
  R.push(['Bought a voucher <small>per 100 messaged</small>', ...S.map((s, i) => `${num(lcNum(s.c.bought), wvBoughtSpec(name(i) + ': who bought', s.bl))} ${sm(per100(s.c.bought, s.c.sent))}`), 'key']);
  R.push(['Spent on messages <small>every message sent</small>', ...S.map(s => `${aed2(s.sp)} ${sm('USD ' + (s.c.sent * usdRate).toFixed(2))}`)]);
  R.push(['If only delivered are charged', ...S.map(s => known ? aed2(s.reached * rate) : none)]);
  R.push(['Cost per client who bought', ...S.map(s => s.c.bought ? wvAed(s.sp / s.c.bought) : '<span class="slv-muted">none yet</span>')]);
  R.push(['Paid at the till since', ...S.map((s, i) => s.c.aed ? num(wvAed(s.c.aed), wvBoughtSpec(name(i) + ': who bought', s.bl)) : 'AED 0')]);
  R.push(['AED back per AED 1 spent', ...S.map(s => s.c.aed && s.sp ? 'AED ' + Math.round(s.c.aed / s.sp) : '<span class="slv-muted">none yet</span>')]);
  // The verdict, on top. Same rule as Lost Clients: no winner when a side has fewer than 5 buyers.
  const bA = C[0].bought, bB = C[1].bought, tot = bA + bB, back = s => s.sp ? s.c.aed / s.sp : 0;
  let head, body = [];
  if (!tot) { head = 'Too few to call.'; body.push('Nobody has bought from either side yet.'); }
  else if (Math.min(bA, bB) < 5) {
    head = 'Too few to call.'; body.push(`${bA} and ${bB} ${tot === 1 ? 'buyer' : 'buyers'}.`);
    if (S[0].c.aed !== S[1].c.aed) { const w = S[0].c.aed > S[1].c.aed ? 0 : 1; body.push(`For what it is worth, ${who(w)} brought in more per dirham spent (AED ${Math.round(back(S[w]))} back for each AED 1 against ${Math.round(back(S[1 - w]))}).`); }
  } else {
    const p0 = C[0].sent ? bA / C[0].sent : 0, p1 = C[1].sent ? bB / C[1].sent : 0, w = p0 >= p1 ? 0 : 1, hi = Math.max(p0, p1), lo = Math.min(p0, p1);
    head = `${name(w)} wins.`; body.push(`Per 100 clients messaged, ${(100 * hi).toFixed(1)} bought against ${(100 * lo).toFixed(1)}${lo ? ` (${(hi / lo).toFixed(1)} times as many)` : ''}.`);
  }
  if (S[0].rr && S[1].rr && S[0].reached && S[1].reached) {
    const a = Math.round(100 * S[0].rr.length / S[0].reached), b = Math.round(100 * S[1].rr.length / S[1].reached);
    body.push(a === b ? `Replies to the message are level (${a}% of the clients it reached).` : `Replies to the message are ${a}% of the clients it reached on ${name(0)} against ${b}% on ${name(1)}.`);
    body.push(`${S[0].tm.length} pressed Tell me more or Reserve mine on ${name(0)} against ${S[1].tm.length} on ${name(1)}.`);
  } else if (!b4 && C[0].replied !== C[1].replied) {
    const w = C[0].replied / C[0].sent > C[1].replied / C[1].sent ? 0 : 1;
    body.push(`${who(w)[0].toUpperCase() + who(w).slice(1)} got more messages after (${wvDpPc(C[w].replied, C[w].sent)} against ${wvDpPc(C[1 - w].replied, C[1 - w].sent)}), mostly ordinary chat.`);
  }
  const care = b4
    ? `Warm here means "asked before", not a different text, so the two sides differ in audience and in text. Spent is an estimate: messages sent × AED ${rate} (respond.io bills USD 0.046 a message, at 3.81). Bought means a voucher bought, matched by name from the till, so a sale not in the till yet is missing here.`
    : `Both sides are the same audience (all 600 had written to us in the last 12 months), so Blast 3 has no warm or standard split: this compares the two messages. Spent is an estimate at GoHighLevel's rate: messages sent × AED ${rate} (USD 0.0524). Delivered and seen were not recorded for this blast. "Any message after the blast" is mostly ordinary chat, not only a reply to the buttons.`;
  const tr = R.map(r => `<tr${r[3] ? ' class="wv-key"' : ''}><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('');
  return `<div class="wv-pbox wv-pwide wv-cmp"><h4>${b4 ? 'Warm list against clean list' : 'Short against long message'} <span class="slv-note">${b4 ? '' : 'no warm or standard split'}</span></h4>
    <div class="wv-verdict"><b>${lcEsc(head)}</b> ${body.map(lcEsc).join(' ')}</div>
    <div class="wv-pscroll"><table class="slv-table wv-ptbl wv-cmp-t"><thead><tr><th></th><th>${lcEsc(name(0))}</th><th>${lcEsc(name(1))}</th></tr></thead><tbody>${tr}</tbody></table></div>
    <p class="slv-note"><b>Read this with care.</b> ${care}</p></div>`;
}

// Which group did best, the old small tables: by wave (Blast 3) and by branch.
function wvCutsHtml(k) {
  const dp = wvDp(k); if (!dp || !(dp.cuts || []).length) return '';
  const d = dp.delivery, known = d && d.unknown < d.sent;
  const box = (title, dim) => {
    const rows = (dp.cuts || []).filter(c => c.dim === dim); if (!rows.length) return '';
    const tr = rows.map(c => `<tr><td>${lcEsc(wvCutName(c.k, dim, k))}</td><td>${lcNum(c.sent)}${known ? `<div class="slv-note">${lcNum(c.seen)} seen</div>` : ''}</td>
        <td>${lcNum(c.replied)}<div class="slv-note">${wvDpPc(c.replied, c.sent)}</div></td><td>${lcNum(c.bought)}<div class="slv-note">${c.aed ? wvAed(c.aed) : wvPct(c.bought, c.sent) + ' bought'}</div></td></tr>`).join('');
    return `<div class="wv-pbox"><h4>${title}</h4><div class="wv-pscroll"><table class="slv-table wv-ptbl"><thead><tr><th></th><th>Sent</th><th>Wrote back</th><th>Bought</th></tr></thead><tbody>${tr}</tbody></table></div></div>`;
  };
  return (k === 'b3' ? box('By wave', 'g1') : '') + box('By branch', 'branch');
}

// What they bought: tier, tender and the average voucher.
function wvWhatHtml(k) {
  const dp = wvDp(k); if (!dp || !dp.bought || !dp.bought.vouchers) return '';
  const tier = (dp.tiers || []).map(x => `<tr><td>${lcEsc(({ D: 'Dip Your Toes', S: 'Season of You', V: 'All-In VIP Year' })[x.k] || x.k)}</td><td>${lcNum(x.vouchers)}</td><td>${wvAed(x.aed)}</td></tr>`).join('');
  const pay = (dp.pays || []).map(x => `<tr><td>${lcEsc(wvPayName(x.k) || x.k)}</td><td>${lcNum(x.vouchers)}</td><td>${wvAed(x.aed)}</td></tr>`).join('');
  const t = tb => `<div class="wv-pscroll"><table class="slv-table wv-ptbl"><thead><tr><th></th><th>Vouchers</th><th>AED</th></tr></thead><tbody>${tb}</tbody></table></div>`;
  return `<div class="wv-pbox"><h4>What they bought</h4>${t(tier)}<p class="slv-note">Average voucher ${wvAed(dp.bought.avg_ticket)}.</p></div><div class="wv-pbox"><h4>How they paid</h4>${t(pay)}</div>`;
}

// Blast 1's email (Kate, 23 Oct 2026: "asan yung email performance"). The email went the day after the WhatsApp from the same GoHighLevel list. What GoHighLevel keeps for an email is only whether it was
// sent or failed: no open or click report comes back into the chats, so those two steps say there is no record. The vouchers cannot be split between the WhatsApp and the email.
function wvEmailHtml(k) {
  const g = k === 'b1' ? wvGhl('b1', 'email') : null;
  if (!g) return '';
  const ok = g.tried - g.failed, cost = g.tried * WV_GHL_EMAIL;
  const row = (label, n, note, share) => n == null
    ? `<div class="wv-fun"><div class="wv-fun-h"><span>${label}</span><b class="slv-muted">no record</b></div>${note ? `<div class="slv-note">${note}</div>` : ''}</div>`
    : `<div class="wv-fun"><div class="wv-fun-h"><span>${label}</span><b>${lcNum(n)}${share ? ` <span class="slv-note">${wvPct(n, g.tried)}</span>` : ''}</b></div>
      <div class="wv-vtrack">${n ? `<span class="wv-bar" style="width:${Math.max(1.5, 100 * n / g.tried)}%"><i data-tip="${lcEsc(label + ': ' + lcNum(n))}" tabindex="0" role="button" aria-label="${lcEsc(label + ': ' + lcNum(n))}"></i></span>` : ''}</div>${note ? `<div class="slv-note">${note}</div>` : ''}</div>`;
  return `<div class="wv-pbox"><h4>Blast 1's email</h4>
    ${row('Emails made', g.tried, `${lcEsc(g.sent_on)}, after the WhatsApp`, false)}
    ${row('Sent', ok, 'accepted by GoHighLevel', true)}
    ${row('Failed', g.failed, 'GoHighLevel could not send them, for example a bad or blocked address', true)}
    ${row('Opened', null, 'GoHighLevel keeps no open report in the client chats')}
    ${row('Clicked', null, 'no click report either')}
    <p class="slv-note">Cost about ${wvAed(cost)} (AED ${WV_GHL_EMAIL} an email, GoHighLevel's rate), so the email is a small part of Blast 1's spend. The vouchers cannot be split between the WhatsApp and the email: they are the sales in the 7 days after the send. GoHighLevel's own email report, if it has one for this send, would have the opens and clicks.</p></div>`;
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
  const parts = [wvFunnelHtml(k), wvEmailHtml(k), wvEconHtml(k), wvWhenHtml(k), wvWhatHtml(k), wvCompareHtml(k), wvCutsHtml(k)].join('');
  return `<details class="wv-how wv-more wv-depth" open><summary>Full performance of this blast</summary>
    <div class="wv-pgrid">${parts}</div>${wvBuyersHtml(k)}</details>`;
}
