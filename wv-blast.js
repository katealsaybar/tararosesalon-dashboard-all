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
const wvOk = () => typeof TRS_LEVEL !== 'undefined' && TRS_LEVEL >= 2;   // Kate, 28 Oct 2026: Level 2 sees the performance, as Level 4 does (wvPerfOnly)
// Kate, 22 Oct 2026: Level 4 (Accounts and Admin) sees how the blast is doing in AED and nothing else: the list, the phone numbers and the sends stay Level 3 and 5.
const wvPerfOnly = () => typeof TRS_LEVEL !== 'undefined' && (TRS_LEVEL === 4 || TRS_LEVEL === 2);
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

// Which blast the page shows (Kate, 23 Oct 2026): the sidebar lists Overall Blast performances and Blast 4, 3, 2, 1 under Wellness Voucher Performance, each a page of its own with
// its own mini nav. One view (view-wvblast) draws all five. WV_ONLY (index.html, wvGoBlast) says which; else the section in the address of a deep link; else Overall.
let wvMode = 'all';
function wvModeOfId(id) {
  id = id || '';
  const m = /^wv(?:B|Full|Read)([1-4])$/.exec(id);
  if (m) return 'b' + m[1];
  if (/^wvAll/.test(id)) return 'all';
  if (/^wv(Ls|Lp|Last)/.test(id)) return 'b4';
  if (/^wv(SendBox|List|Host|Perf)$/.test(id)) return 'b3';
  return null;
}
const WV_MODE_NAME = { all: 'Overall Blast performances', b4: 'Blast 4: the last push', b3: 'Blast 3: the 600 top spenders', b2: 'Blast 2: the reminder', b1: 'Blast 1: the first message' };
// Sub-entries under Full performance in a blast page's "On this page" rail (Kate, 23 Oct 2026, the way Lost Client Blasts lists its Performance report: lost-report.js lrRailSubs).
// Each box of the full performance (From message to voucher, Cost against what came in, How soon they bought, ...) gets a link under the Full performance entry, found from the
// boxes that are really on the page, so a cut with no record has no link. Sidebar rail only (wv-blast.css, 1400px and up); the lit entry follows the scroll.
let wvSpy = null;
function wvRailClear() {
  document.querySelectorAll('#wvBlastContent .side-sub').forEach(n => n.remove());
  if (wvSpy) { window.removeEventListener('scroll', wvSpy); wvSpy = null; }
}
function wvGoSection(id) {
  const el = document.getElementById(id);
  if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - (typeof jnOffset === 'function' ? jnOffset(el) : 120), behavior: 'smooth' });
}
function wvRailSubs() {
  wvRailClear();
  const n = /^b([1-4])$/.exec(wvMode);
  if (!n) return;
  const a = document.querySelector(`#wvBlastContent .side-nav a[href="#wvFull${n[1]}"]`);
  const boxes = [...document.querySelectorAll(`#wvFull${n[1]} .wv-pbox`)].filter(b => b.querySelector('h4'));
  if (!a || !boxes.length) return;
  const subs = boxes.map((b, i) => { if (!b.id) b.id = `wvF${n[1]}-${i}`; return [b.id, b.querySelector('h4').textContent.trim()]; });
  const nav = document.createElement('div');
  nav.className = 'side-sub'; nav.setAttribute('role', 'group'); nav.setAttribute('aria-label', 'Full performance sections');
  nav.innerHTML = subs.map(([id, l]) => `<a href="#${id}" data-s="${id}" onclick="event.preventDefault();wvGoSection('${id}')">${lcEsc(l)}</a>`).join('');
  a.insertAdjacentElement('afterend', nav);
  // the lit entry is the last box whose top has passed just under the pinned header
  const spy = () => {
    let cur = subs[0][0];
    subs.forEach(([id]) => { const el = document.getElementById(id); if (el && el.getBoundingClientRect().top <= 150) cur = id; });
    nav.querySelectorAll('a').forEach(x => x.classList.toggle('on', x.dataset.s === cur));
  };
  wvSpy = spy;
  window.addEventListener('scroll', wvSpy, { passive: true });
  spy();
}
async function renderWvBlast() {
  const el = document.getElementById('wvBlastContent');
  if (!el || !wvOk()) return;
  wvRailClear();
  wvMode = (typeof WV_ONLY !== 'undefined' && WV_ONLY) || wvModeOfId((location.hash || '').slice(1)) || 'all';
  if (typeof WV_ONLY !== 'undefined') WV_ONLY = null;
  const mode = wvMode;
  // The mini side nav (Kate, 23 Oct 2026: every page gets one; ALD-X-01): the rail in the gutter from 1400px, a row of chips below, listing this page's own sections. Level 4 has the money only.
  const blastRail = (n, extra) => [['wvB' + n, 'Blast ' + n + ': what it was and what it brought'], ['wvFull' + n, 'Full performance']].concat(wvPerfOnly() ? [] : [['wvMsg' + n, 'The messages']]).concat([['wvRead' + n, 'How to read these numbers']]).concat(extra || []);
  const rails = {
    all: [['wvAllBlasts', 'The answer, blast by blast'], ['wvAllCmp', 'Compare the blasts'], ['wvAllWords', 'Each blast in words'], ['wvAllHow', 'How to read these numbers']],
    b4: blastRail(4, (wvOk5() ? [['wvLsBox', 'Send Blast 4'], ['wvRmBox', 'Send the reminder']] : []).concat(wvPerfOnly() ? [] : [['wvLpPanel', 'The send list']])),
    b3: blastRail(3, (wvOk5() ? [['wvSendBox', 'Send a wave']] : []).concat(wvPerfOnly() ? [] : [['wvList', 'The send list']])),
    b2: blastRail(2), b1: blastRail(1)
  };
  const parts = {
    all: '<div id="wvAll"><p class="slv-muted">Loading…</p></div>',
    b4: '<section class="wv-blast" id="wvB4"><p class="slv-muted">Loading…</p></section>',
    b3: '<section class="wv-blast" id="wvB3"><div id="wvB3Head"></div><div id="wvHost"><p class="slv-muted">Loading the list…</p></div></section>',
    b2: '<section class="wv-blast" id="wvB2"></section>',
    b1: '<section class="wv-blast" id="wvB1"></section>'
  };
  const body = parts[mode];
  const intro = mode === 'all' ? `<section class="slv-intro"><h2>Wellness Voucher Message and Email Blasts</h2>
    <div class="wv-why">
      <p><b>Why this?</b> The voucher closes on 31 Oct. This page shows what each blast cost and brought in.</p>
      <p id="wvWhyNow"><b>Why now?</b> Blast 4, the last push, goes out on Mon 26 Oct, from the send panel on its page.</p>
      <p id="wvWhyNo"><b>If we do nothing?</b> The clients on the last-push list will not hear from us before it closes.</p>
      <p id="wvSoFar"></p>
      <p class="wv-act" id="wvNext"><b>Next step:</b> Mon 26 Oct, Kate sends Blast 4 with the Send button on the Blast 4 page, or schedules it from there.${wvPerfOnly() ? ' This page shows the money only.' : ''}</p>
    </div></section>` : `<section class="slv-intro"><h2>Wellness Voucher Message and Email Blasts</h2>
    <p class="slv-note"><a href="#" onclick="event.preventDefault();wvGoBlast('all')">← Overall Blast performances</a>${wvPerfOnly() ? ' · This page shows the money only.' : ''}</p></section>`;
  el.innerHTML = `${intro}${typeof lgShell === 'function' ? lgShell(rails[mode], body, 'lg-shell-wide') : body}`;
  const needPerf = mode === 'all' || mode === 'b3', needList = mode === 'b3' && !wvPerfOnly();
  const hp = sb.rpc('wv_blasts_history').then(r => r, e => ({ error: e })),
    lp = typeof wvLastLoad === 'function' && (mode === 'all' || mode === 'b4') ? wvLastLoad() : Promise.resolve(),
    dpp = typeof wvDepthLoad === 'function' ? wvDepthLoad() : Promise.resolve();
  const after = async () => {
    const h = await hp; await lp; await dpp;
    wvHist = (!h.error && h.data) ? h.data : null;
    if (h.error) console.warn('wv_blasts_history', h.error);
    if (wvMode !== mode) return;   // she went to another blast while this one was loading
    wvAllPaint();
    const pe = document.getElementById('wvPerf'); if (pe && wvPerf) pe.outerHTML = wvPerfHtml();   // without its old break-down once the full performance is there
    if (typeof wvLastMount === 'function') wvLastMount();
    wvRailSubs();
  };
  if (!needList) {
    if (needPerf) {
      const pf = await sb.rpc('wv_blast_performance', { p_rate: WV_GHL_RATE });
      wvPerf = (!pf.error && pf.data && pf.data.totals) ? pf.data : null;
      const host = document.getElementById('wvHost');
      if (host) host.innerHTML = wvPerf ? wvPerfHtml() : '<p class="slv-muted">The numbers did not load. Refresh to try again.</p>';
    }
    await after();
    return;
  }
  try {
    const [{ data, error }, pf] = await Promise.all([sb.rpc('wv_blast_get'), sb.rpc('wv_blast_performance', { p_rate: WV_GHL_RATE })]);
    if (error || !Array.isArray(data)) throw error || new Error('no list');
    wvRows = data; wvErr = '';
    wvPerf = (!pf.error && pf.data && pf.data.totals) ? pf.data : null;
    if (pf.error) console.warn('wv_blast_performance', pf.error);
  } catch (e) { console.error(e); wvErr = 'The list did not load. Refresh to try again.'; }
  wvPaint();
  await after();
}

// ---- All four blasts (Kate, 23 Oct 2026: "i pattern mo sa lost clients"): a section on top with one plain line per blast and the same numbers as a picture or a table, then one block per
// blast, newest first, every block the same shape: what and why in one line, the result in a sentence of numbers, the cards, three plain facts, the breakdown and the notes folded away.
// Blasts 1 and 2 went out of GoHighLevel. GHL's own stats screen only shows trigger attempts, so on 23 Oct 2026 the messages in the chats of the 3,168 tagged contacts were counted (wv_ghl_sends,
// migrations/wv_blasts_history_ghl.sql). Their vouchers are Phorest sales in the 7 days after each send (wv_blasts_history). Blasts 3 and 4 use their own functions.
const WV_RATE = 0.1753;   // AED a marketing message: USD 0.046 at the 3.81 the company card pays. Blast 4's rate (it goes through respond.io); Blasts 1 to 3 went out of GoHighLevel and use WV_GHL_RATE below.
// Blasts 1 and 2 went out of GoHighLevel, so their cost uses GoHighLevel's rate card, not Meta's through respond.io (Kate, 23 Oct 2026): WhatsApp to the UAE, marketing, USD 0.0524 a delivered
// message (HighLevel's WhatsApp pricing guide, the rate to 30 Sep 2026, so it covers the August sends), plus the 5% card fee on wallet top-ups, at the 3.81 the company card pays = AED 0.2096.
// LC Email is USD 0.675 for 1,000 emails, the same 5%, same rate = AED 0.0027 an email. An estimate: the GoHighLevel wallet usage report has the exact figure.
const WV_GHL_RATE = 0.2096, WV_GHL_EMAIL = 0.0027;
const WV_LAUNCH4 = '2026-10-26';
let wvHist = null, wvAllView = 'visual';
try { if (localStorage.getItem('wv-all-view') === 'table') wvAllView = 'table'; } catch (e) {}
const wvBack = (aed, cost) => cost && aed ? Math.round(aed / cost) : 0;
const wvBackTxt = (aed, cost) => wvBack(aed, cost) ? 'AED ' + lcNum(wvBack(aed, cost)) : '–';
const wvN = (n, w) => lcNum(n) + ' ' + w + (n === 1 ? '' : 's');
const wvGhl = (blast, channel) => ((wvHist && wvHist.ghl) || []).find(g => g.blast === blast && g.channel === channel) || null;
const wvJump = id => { const el = document.getElementById(id); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; } const m = wvModeOfId(id); if (m && typeof wvGoBlast === 'function') wvGoBlast(m); };
const wvToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' });

// One record per blast, newest first: every part of the page reads its numbers from here, so the line, the picture, the table and the cards cannot disagree.
// tried = messages made, through = the ones that did not fail (null when the blast has no delivery record), cost = an estimate (through, or tried, times the rate).
function wvBlastData() {
  const h = wvHist || {}, t3 = wvPerf && wvPerf.totals, lp = typeof wvLp !== 'undefined' && wvLp, t4 = lp && lp.totals, rate4 = lp ? (+lp.rate || WV_RATE) : WV_RATE;
  const out = [];
  const s4 = (typeof wvDepth !== 'undefined' && wvDepth && wvDepth.b4 && wvDepth.b4.delivery) ? Number(wvDepth.b4.delivery.sent) || 0 : 0;   // what the send panel really sent
  if (t4) out.push({ key: 'b4', name: 'Blast 4', when: 'Mon 26 Oct', jump: 'wvB4', planned: !s4, tried: s4 || t4.to_message, through: null, vouchers: t4.vouchers, clients: t4.bought, aed: t4.aed, cost: (s4 || t4.to_message) * rate4 });
  if (t3) out.push({ key: 'b3', name: 'Blast 3', when: '15 and 16 Oct', jump: 'wvB3', tried: t3.sent, through: null, vouchers: t3.vouchers, clients: t3.bought, aed: t3.aed, cost: t3.cost });
  const early = (key, name, when, jump, w, g) => ({ key, name, when, jump, tried: g ? g.tried : null, through: g ? g.tried - g.failed : null, failed: g ? g.failed : null, read: g ? g.read : null,
    vouchers: w ? w.vouchers : null, clients: w ? w.clients : null, aed: w ? w.aed : null, cost: g ? (g.tried - g.failed) * WV_GHL_RATE + (key === 'b1' && wvGhl('b1', 'email') ? wvGhl('b1', 'email').tried * WV_GHL_EMAIL : 0) : null });
  out.push(early('b2', 'Blast 2', '28 Aug', 'wvB2', h.b2, wvGhl('b2', 'whatsapp')));
  out.push(early('b1', 'Blast 1', '21 and 22 Aug', 'wvB1', h.b1, wvGhl('b1', 'whatsapp')));
  return out;
}
// The result in one sentence of numbers (Principle 2: concrete before abstract)
function wvLine(d) {
  const back = wvBack(d.aed, d.cost) ? `, about AED ${lcNum(wvBack(d.aed, d.cost))} back for every AED 1` : '';
  if (d.key === 'b4') return d.planned
    ? `<b>Blast 4</b> goes to ${wvN(d.tried, 'client')} on Mon 26 Oct, for about ${wvAed(d.cost)} (estimate). Nothing has been sold from it yet.`
    : `<b>Blast 4</b> went to about ${wvN(d.tried, 'client')} for about ${wvAed(d.cost)} (estimate). ${wvN(d.clients, 'client')} bought and ${wvAed(d.aed)} came in${back}.`;
  if (d.key === 'b3') return `<b>Blast 3</b> sent ${wvN(d.tried, 'message')} for about ${wvAed(d.cost)} (estimate). ${wvN(d.clients, 'client')} bought and ${wvAed(d.aed)} came in${back}.`;
  if (d.tried == null) return `<b>${d.name}</b>: the send count did not load. Refresh to try again.`;
  const em = d.key === 'b1' && wvGhl('b1', 'email');
  return `<b>${d.name}</b> sent ${lcNum(d.tried)} WhatsApp messages${em ? ` and ${lcNum(em.tried)} emails` : ''}, and ${lcNum(d.through)} of the WhatsApp got through, for about ${wvAed(d.cost)} (estimate). ${wvN(d.vouchers || 0, 'voucher')} sold in the week after, ${wvAed(d.aed)}${back}.`;
}
// The numbers for blast 1 and 2 as plain cards (Lost Clients' "campaign so far")
function wvEarlyStats(d) {
  if (d.tried == null) return [];
  return [[lcNum(d.tried), 'WhatsApp sent', `${lcNum(d.failed)} failed`], [lcNum(d.through), 'Got through', `${lcNum(d.read)} read`], [lcNum(d.vouchers || 0), 'Vouchers sold', 'in the 7 days after, from the voucher log'],
    [wvAed(d.aed), 'AED collected'], [wvAed(d.cost), 'Cost (estimate)', `${lcNum(d.through)} got through × AED ${WV_GHL_RATE}${d.key === 'b1' && wvGhl('b1', 'email') ? ` + ${lcNum(wvGhl('b1', 'email').tried)} emails × AED ${WV_GHL_EMAIL}` : ''}, GoHighLevel's rate`], [wvBackTxt(d.aed, d.cost), 'Back for every AED 1']];
}
function wvEarlyMore(blast) {
  const rows = ['whatsapp', 'email'].map(c => wvGhl(blast, c)).filter(Boolean);
  if (!rows.length) return '';
  const tr = rows.map(g => {
    const through = g.tried - g.failed;
    return `<tr><td>${g.channel === 'email' ? 'Email' : 'WhatsApp'}, ${lcEsc(g.sent_on)}</td><td>${lcNum(through)}${g.read ? `<div class="slv-note">${lcNum(g.read)} read</div>` : ''}</td><td>${lcNum(g.failed)}</td></tr>`;
  }).join('');
  return `<div class="wv-pbox"><h4>By message</h4><div class="wv-pscroll"><table class="slv-table wv-ptbl"><thead><tr><th></th><th>Got through</th><th>Failed</th></tr></thead><tbody>${tr}</tbody></table></div></div>
    <p class="slv-note">There is no split by wave or branch for this blast: it went to one tagged list in GoHighLevel.</p>`;
}
const wvEarlyFold = (h, d) => wvReadHtml(d && d.through != null ? `${wvN(d.through, 'WhatsApp message')} got through × AED ${WV_GHL_RATE} = about ${wvAed(d.through * WV_GHL_RATE)}.${d.key === 'b1' ? ' The emails add a little more.' : ''}` : '', [
  ['Sends', 'Counted from the chats in GoHighLevel on 23 Oct. Its own stats screen only shows attempts, so it was not used. Only contacts that still carry the tag are counted.'],
  ['Failed', 'WhatsApp refused it, for example no WhatsApp on that number. GoHighLevel charges only for the ones delivered.'],
  ['Cost', `Messages that got through × AED ${WV_GHL_RATE} (GoHighLevel's rate card for a marketing message to the UAE, USD 0.0524, plus its 5% card fee, at 3.81), and for Blast 1's emails AED ${WV_GHL_EMAIL} each. An estimate: the wallet usage report in GoHighLevel has the exact figure.`],
  ['Vouchers', 'The voucher log\'s sales in the 7 days after the send. It does not prove the message sold them.'],
  ['AED', 'What the client paid, VAT included.'],
  h && h.gap ? ['Between Blast 2 and 3', `4 Sep to 14 Oct Phorest shows ${wvN(h.gap.vouchers, 'voucher')} sold, ${wvAed(h.gap.aed)}.`] : null]);

// "How to read these numbers", the same shape under every blast (23 Oct 2026, trs-adult-learning-design): a worked example first, then one short line per term in the facts layout.
function wvReadHtml(example, items) {
  return `<div class="wv-read">${example ? `<p class="wv-eg"><b>Example.</b> ${example}</p>` : ''}<dl class="wv-facts">${items.filter(Boolean).map(i => `<div><dt>${i[0]}</dt><dd>${i[1]}</dd></div>`).join('')}</dl></div>`;
}
// One block per blast: b = { title, tag, next, intro: [what, why, next], line, stats: [[value, label, detail]], what, who, when, more, moreTitle, fold }
function wvBlockHtml(b) {
  const bn = ((/^Blast (\d)/.exec(b.title || '') || [])[1]) || '';
  const f = (k, v) => v ? `<div><dt>${k}</dt><dd>${v}</dd></div>` : '';
  const stat = x => `<div class="wv-stat"><div class="wv-sn">${x[0]}</div><div class="wv-sl">${x[1]}</div>${x[2] ? `<div class="wv-sd">${x[2]}</div>` : ''}</div>`;
  return `<div class="wv-bhead"><h3>${b.title}</h3><span class="wv-btag${b.next ? ' next' : ''}">${b.tag}</span></div>
    <dl class="wv-facts wv-www"><div><dt>What is this</dt><dd>${b.intro[0]}</dd></div><div><dt>Why it matters</dt><dd>${b.intro[1]}</dd></div><div><dt>Next</dt><dd>${b.intro[2]}</dd></div></dl>
    ${b.line ? `<p class="wv-short">${b.line}</p>` : ''}
    ${b.stats && b.stats.length ? `<div class="wv-stats">${b.stats.map(stat).join('')}</div>` : ''}
    <dl class="wv-facts">${f('What it was', b.what)}${f('Who got it', b.who)}${f('When', b.when)}</dl>
    <div id="wvFull${bn}">${b.depth || ''}</div>
    ${bn && typeof wvMsgHtml === 'function' ? wvMsgHtml('b' + bn) : ''}
    ${b.more ? `<details class="wv-how wv-more"><summary>${b.moreTitle || 'Break it down'}</summary>${b.more}</details>` : ''}
    ${b.fold ? `<details class="wv-how" id="wvRead${bn}"><summary>How to read these numbers</summary>${b.fold}</details>` : ''}`;
}
function wvBlocks() {
  const h = wvHist || {}, by = {};
  wvBlastData().forEach(d => { by[d.key] = d; });
  const d1 = by.b1 || {}, d2 = by.b2 || {}, d3 = by.b3;
  return {
    b1: { title: 'Blast 1: the first message', tag: 'Sent 21 and 22 Aug', intro: ['The first voucher announcement: a WhatsApp message, then an email the next day.', 'It was the biggest send, so it is the baseline for the others.', 'Nothing to do here, it is finished.'],
      line: wvLine(d1), stats: wvEarlyStats(d1), depth: typeof wvDepthHtml === 'function' ? wvDepthHtml('b1') : '', what: 'A WhatsApp message on Fri 21 Aug, then an email on Sat 22 Aug.', who: '3,168 contacts tagged for the voucher in GoHighLevel.', when: 'Fri 21 and Sat 22 Aug.', more: wvEarlyMore('b1'), moreTitle: 'Break it down: by message', fold: wvEarlyFold(h, d1) },
    b2: { title: 'Blast 2: the reminder', tag: 'Sent 28 Aug', intro: ['A gentle WhatsApp reminder to the same contacts.', 'It shows whether a second nudge paid for itself.', 'Nothing to do here, it is finished. Compare it with Blast 1.'],
      line: wvLine(d2), stats: wvEarlyStats(d2), depth: typeof wvDepthHtml === 'function' ? wvDepthHtml('b2') : '', what: 'A gentle WhatsApp reminder.', who: 'The same contacts, minus anyone who had already replied or bought.', when: 'Fri 28 Aug.', more: wvEarlyMore('b2'), moreTitle: 'Break it down: by message', fold: wvEarlyFold(h, d2) },
    b3: d3 ? { title: 'Blast 3: the 600 top spenders', tag: 'Sent 15 and 16 Oct', intro: ['A WhatsApp message to our 600 top spenders, sent in five waves.', 'It is the one blast with a full record, so it is the one to learn from.', 'Nothing to send. Open Break it down to see which wave and message did best.'],
      line: wvLine(d3), stats: [[lcNum(d3.tried), 'Messages sent'], [lcNum(d3.vouchers), 'Vouchers sold', wvN(d3.clients, 'client')], [wvAed(d3.aed), 'AED collected', d3.clients ? `${wvAed(d3.aed / d3.clients)} per buyer` : ''], [wvAed(d3.cost), 'Cost (estimate)', `${lcNum(d3.tried)} sent × AED ${WV_GHL_RATE}, GoHighLevel's rate`], [wvBackTxt(d3.aed, d3.cost), 'Back for every AED 1']],
      depth: typeof wvDepthHtml === 'function' ? wvDepthHtml('b3') : '',
      what: 'A WhatsApp message with Tell me more and Reserve mine buttons, sent in five waves by spend. Half got the short message (A), half the long one (B).', who: '600 clients who spent AED 4,000+ this year, visited in the last 90 days and can be messaged on WhatsApp.', when: 'Thu 15 and Fri 16 Oct.' } : null
  };
}

// ---- The top section: one line per blast, then the same numbers as a picture (Visual) or a table, the choice remembered (Kate, 23 Oct 2026). AED collected and cost share one AED scale;
// vouchers sold and back for every AED 1 are their own small charts, never a second axis. Blasts always in the same order, newest first, so a reader finds Blast 3 in the same place in every chart.
function wvVisualHtml(rows) {
  const maxA = Math.max(1, ...rows.flatMap(d => [d.aed || 0, d.cost || 0])), maxV = Math.max(1, ...rows.map(d => d.vouchers || 0)), maxB = Math.max(1, ...rows.map(d => wvBack(d.aed, d.cost)));
  const seg = (n, max, cls, tip) => n ? `<span class="wv-bar ${cls}" style="width:${Math.max(1.5, 100 * n / max)}%"><i data-tip="${lcEsc(tip)}" tabindex="0" role="button" aria-label="${lcEsc(tip)}"></i></span>` : '';
  const line = (k, bar, v) => `<div class="wv-vline"><span class="wv-vk">${k}</span><span class="wv-vtrack">${bar}</span><b class="wv-vv">${v}</b></div>`;
  const name = d => `<div class="wv-vname"><b>${d.name}</b> <span class="slv-note">${d.when}</span></div>`;
  const money = rows.map(d => `<div class="wv-vrow">${name(d)}
      ${line('Came in', seg(d.aed, maxA, 'in', `${d.name}: ${wvAed(d.aed)} came in`), d.aed ? wvAed(d.aed) : (d.planned ? 'not sent yet' : '–'))}
      ${line('Cost', seg(d.cost, maxA, 'cost', `${d.name}: ${wvAed(d.cost)} cost (estimate)`), d.cost ? wvAed(d.cost) + (d.planned ? ' planned' : '') : '–')}</div>`).join('');
  const vouch = rows.map(d => `<div class="wv-vrow">${name(d)}${line('Sold', seg(d.vouchers, maxV, 'in', `${d.name}: ${wvN(d.vouchers, 'voucher')} sold`), d.vouchers ? lcNum(d.vouchers) : (d.planned ? 'not sent yet' : '0'))}</div>`).join('');
  const back = rows.map(d => `<div class="wv-vrow">${name(d)}${line('Back', seg(wvBack(d.aed, d.cost), maxB, 'in', `${d.name}: about AED ${lcNum(wvBack(d.aed, d.cost))} back for every AED 1`), wvBack(d.aed, d.cost) ? 'AED ' + lcNum(wvBack(d.aed, d.cost)) : (d.planned ? 'not sent yet' : '–'))}</div>`).join('');
  return `<div class="wv-vgrid">
    <div class="wv-pbox"><h4>AED came in, and what it cost</h4>${money}<div class="wv-key"><span><i class="in"></i>Came in (AED collected)</span><span><i class="cost"></i>Cost (estimate)</span></div></div>
    <div class="wv-pbox"><h4>Vouchers sold</h4>${vouch}</div>
    <div class="wv-pbox"><h4>Back for every AED 1</h4>${back}<p class="slv-note">AED collected divided by the cost estimate.</p></div></div>
    <p class="slv-note">Click, tap or tab to a bar for its value.</p>`;
}
function wvTableHtml(rows) {
  const tr = rows.map(d => `<tr><td><b>${d.name}</b><div class="slv-note">${d.when}</div><div><a href="#" class="slv-note" onclick="event.preventDefault();wvJump('${d.jump}')">Details ↓</a></div></td>
    <td>${d.aed ? `<b>${wvAed(d.aed)}</b>` : `<span class="slv-muted">${d.planned ? 'not sent yet' : '–'}</span>`}<div class="slv-note">${d.vouchers ? wvN(d.vouchers, 'voucher') : 'no vouchers yet'}</div></td>
    <td>${d.cost ? `<b>${wvAed(d.cost)}</b>${d.planned ? ' planned' : ''}` : '–'}<div class="slv-note">${wvBack(d.aed, d.cost) ? `AED ${lcNum(wvBack(d.aed, d.cost))} back per AED 1` : ''}</div></td></tr>`).join('');
  return `<div class="wv-pbox"><div class="wv-pscroll"><table class="slv-table wv-ptbl wv-tbl3"><thead><tr><th>Blast</th><th>Came in</th><th>Cost (estimate)</th></tr></thead><tbody>${tr}</tbody></table></div></div>`;
}
// The top section, redesigned 23 Oct 2026 (Kate: follow trs-adult-learning-design and adhd-feedback-rules). L1: one plain answer, then one card per blast with the three numbers that matter
// (came in, cost, back for every AED 1). L2: the same numbers as a picture or table. L3, folded: each blast in a sentence, and how to read the numbers with one worked example.
function wvScoreCard(d) {
  const back = wvBack(d.aed, d.cost), none = d.aed == null;
  const pill = d.planned ? '<span class="wv-btag next">Not sent yet</span>' : '<span class="wv-btag">Sent</span>';
  return `<div class="wv-sbc"><div class="wv-sbh"><span><b>${d.name}</b> <span class="slv-note">${d.when}</span></span>${pill}</div>
    <div class="wv-sbn">${none ? '–' : d.aed ? wvAed(d.aed) : (d.planned ? '–' : 'AED 0')}</div><div class="wv-sbl">came in</div>
    <dl class="wv-sbd"><div><dt>Cost (estimate)</dt><dd>${d.cost ? wvAed(d.cost) + (d.planned ? ' planned' : '') : '–'}</dd></div>
      <div><dt>Back for every AED 1</dt><dd>${back ? 'AED ' + lcNum(back) : (d.planned ? 'not sent yet' : '–')}</dd></div></dl>
    <p class="slv-note wv-sbf">${d.vouchers == null || d.planned ? '' : wvN(d.vouchers, 'voucher') + ' sold' + (d.clients ? ' to ' + wvN(d.clients, 'client') : '') + '. '}<a href="#" onclick="event.preventDefault();wvJump('${d.jump}')">Details ↓</a></p></div>`;
}
function wvHeadline(rows) {
  const done = rows.filter(d => !d.planned && wvBack(d.aed, d.cost)).sort((a, b) => wvBack(b.aed, b.cost) - wvBack(a.aed, a.cost));
  const plan = rows.find(d => d.planned);
  const a = done.length ? `<b>${done[0].name} paid back the most:</b> about AED ${lcNum(wvBack(done[0].aed, done[0].cost))} for every AED 1 it cost.` : '';
  return a + (plan ? `${a ? ' ' : ''}${plan.name} goes out ${plan.when}.` : '');
}
function wvAllHtml() {
  const rows = wvBlastData(), tbl = wvAllView === 'table';
  const lines = rows.map(d => `<li>${wvLine(d)} <a href="#" class="slv-note" onclick="event.preventDefault();wvJump('${d.jump}')">Details ↓</a></li>`).join('');
  const d3 = rows.find(d => d.key === 'b3' && d.cost && d.aed);
  const egTxt = d3 ? `Blast 3 cost about ${wvAed(d3.cost)} and brought in ${wvAed(d3.aed)}, so every AED 1 spent came back as about AED ${lcNum(wvBack(d3.aed, d3.cost))}.` : '';
  const head = wvHeadline(rows);
  return `<section class="wv-perf" id="wvAllBlasts"><h3>What each blast brought in</h3>
    <dl class="wv-facts wv-www"><div><dt>What is this</dt><dd>The result of every voucher blast, newest first.</dd></div>
      <div><dt>Why it matters</dt><dd>It shows which blast paid for itself, so the last one goes to the right people.</dd></div>
      <div><dt>Next</dt><dd>Read the cards, then open Details on the blast you want to check.</dd></div></dl>
    ${head ? `<p class="wv-short">${head}</p>` : ''}
    <div class="wv-sb">${rows.map(wvScoreCard).join('')}</div>
    <div class="wv-vhd" id="wvAllCmp"><h4>Compare them as</h4><div class="sc-seg" role="group" aria-label="View"><button type="button" class="${tbl ? '' : 'on'}" onclick="wvAllSet('visual')">Visual</button><button type="button" class="${tbl ? 'on' : ''}" onclick="wvAllSet('table')">Table</button></div></div>
    <div id="wvAllBody">${tbl ? wvTableHtml(rows) : wvVisualHtml(rows)}</div>
    <details class="wv-how" id="wvAllWords"><summary>Read each blast in words</summary><ul class="wv-lines">${lines}</ul></details>
    <details class="wv-how" id="wvAllHow"><summary>How to read these numbers</summary>${wvReadHtml(egTxt, [
      ['Back for every AED 1', 'AED collected divided by the cost estimate.'],
      ['Blasts 1 and 2', 'Sent from GoHighLevel. The sends are counted from the chats there. Vouchers are the log\'s sales in the 7 days after, so they do not prove the message sold them.'],
      ['Blasts 3 and 4', 'Vouchers bought by the clients on their own list, matched by name in Phorest. Blast 4\'s cost is the list × the rate until it has gone, then the messages really sent.'],
      ['AED and cost', `AED is what the client paid, VAT included. Cost is always an estimate. Blasts 1, 2 and 3 went out of GoHighLevel: AED ${WV_GHL_RATE} for each WhatsApp message (Blasts 1 and 2: each one that got through; Blast 3: every one sent, because its delivery is not recorded) and AED ${WV_GHL_EMAIL} for each Blast 1 email. Blast 4 goes through respond.io: messages × AED ${WV_RATE} (USD 0.046 at 3.81). The invoices have the exact figures.`],
      ['Phorest and the log', 'Blasts 3 and 4 come from Phorest, so they can differ from the voucher log by a voucher or two.']])}</details></section>`;
}
function wvAllSet(v) {
  wvAllView = v === 'table' ? 'table' : 'visual';
  try { localStorage.setItem('wv-all-view', wvAllView); } catch (e) {}
  wvTipOn(null);
  const sec = document.getElementById('wvAllBlasts');
  if (!sec) return;
  const rows = wvBlastData();
  document.getElementById('wvAllBody').innerHTML = wvAllView === 'table' ? wvTableHtml(rows) : wvVisualHtml(rows);
  sec.querySelectorAll('.wv-vhd .sc-seg button').forEach((b, i) => b.classList.toggle('on', (i === 1) === (wvAllView === 'table')));
}
function wvAllPaint() {
  const set = (id, html) => { const b = document.getElementById(id); if (b) b.innerHTML = html; };
  set('wvAll', wvAllHtml());
  const sf = wvBlastData().filter(d => wvBack(d.aed, d.cost));
  set('wvSoFar', sf.length ? `<b>So far:</b> ${sf.map((d, i) => i ? `${d.name} about AED ${lcNum(wvBack(d.aed, d.cost))}` : `${d.name} brought back about AED ${lcNum(wvBack(d.aed, d.cost))} for every AED 1`).join(', ')}.` : '');
  // Once Blast 4 has gone out (the send panel's sent count, wvBlastData planned = false) the why wall speaks in the past tense (Kate, 26 Oct 2026).
  const b4 = wvBlastData().find(d => d.key === 'b4');
  if (b4 && !b4.planned) {
    set('wvWhyNow', '<b>Why now?</b> Blast 4, the last push, went out on Mon 26 Oct: the warm list first, then the clean list.');
    set('wvWhyNo', `<b>What happened?</b> Blast 4 went to ${wvN(b4.tried, 'client')} on the last-push list, before the voucher closes.`);
    set('wvNext', `<b>Next step:</b> Watch Blast 4's full performance on its page until the voucher closes on 31 Oct.${wvPerfOnly() ? ' This page shows the money only.' : ''}`);
  }
  const k = wvBlocks();
  set('wvB3Head', k.b3 ? wvBlockHtml(k.b3) : '');
  set('wvB2', wvBlockHtml(k.b2));
  set('wvB1', wvBlockHtml(k.b1));
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
    return `<tr><td>${lcEsc(label(r.k))}</td><td>${lcNum(r.bought)} of ${lcNum(r.sent)}<div class="slv-note">${wvPct(r.bought, r.sent)} bought</div></td><td class="wv-aedc"><span class="wv-aedt">${wvAed(r.aed)}</span>${bar}</td></tr>`;
  }).join('');
}
function wvPerfTable(title, rows, label) {
  const max = Math.max(1, ...rows.map(r => r.aed || 0));
  return `<div class="wv-pbox"><h4>${title}</h4><div class="wv-pscroll"><table class="slv-table wv-ptbl"><thead><tr><th></th><th>Bought</th><th>AED collected</th></tr></thead><tbody>${wvPerfRows(rows, label, max)}</tbody></table></div></div>`;
}
function wvPerfHtml() {
  const p = wvPerf; if (!p) return '';
  const t = p.totals, o = p.other || {}, per = t.bought ? t.aed / t.bought : 0;
  const card = (n, ti, d) => `<div class="ll-card wv-pcard"><div class="ll-t">${ti}</div><div class="ll-n">${n}</div><div class="ll-d">${d}</div></div>`;
  const when = iso => { try { return new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Asia/Dubai', day: 'numeric', month: 'short' }); } catch (e) { return ''; } };
  const tierName = k => ({ D: 'Dip Your Toes', S: 'Season of You', V: 'All-In VIP Year' })[k] || k;
  const tiers = (p.by_tier || []).map(x => `${lcEsc(tierName(x.k))} ${lcNum(x.vouchers)} (${wvAed(x.aed)})`).join(' · '), pays = (p.by_pay || []).map(x => `${lcEsc(wvPayName(x.k) || x.k)} ${lcNum(x.vouchers)}`).join(' · ');
  const brk = typeof wvDp === 'function' && wvDp('b3') ? '' : `<details class="wv-how wv-more"><summary>Break it down: by wave, message and branch</summary>
    <div class="wv-pgrid">
      ${wvPerfTable('By wave', p.by_wave || [], k => 'Wave ' + k)}
      ${wvPerfTable('By message', p.by_arm || [], k => k === 'A' ? 'A: short message' : 'B: long message')}
      ${wvPerfTable('By branch', p.by_branch || [], k => WV_BR[k] || k)}
    </div>
    ${tiers || pays ? `<p class="slv-note">Bought: ${tiers}${tiers && pays ? '. Paid by ' : ''}${pays}.</p>` : ''}</details>`;
  return `<section class="wv-perf" id="wvPerf">${brk}
    <details class="wv-how"><summary>How to read these numbers</summary>${wvReadHtml(`${lcNum(t.sent)} messages × AED ${WV_GHL_RATE} = about ${wvAed(t.cost)}. That is the cost.`, [
      ['Messages', 'Sent through this page, one per client. A client may have bought without our message: the match to a sale is by name.'],
      ['Cost', `Messages sent × AED ${WV_GHL_RATE}, GoHighLevel's rate (USD 0.0524 a marketing message to the UAE, plus its 5% card fee, at 3.81). Every message counts, because delivery for this blast is not recorded, so it may be a little high. The GoHighLevel wallet usage report has the exact figure.`],
      ['Replies and STOP', 'From respond.io\'s nightly check, so up to a day behind. They are in the full performance above.'],
      o.vouchers ? ['Other vouchers', `${lcNum(o.vouchers)} voucher${o.vouchers === 1 ? '' : 's'} (${wvAed(o.aed)}) sold since the blast started to clients not on the messaged list, for example a spelling that does not match. They are not counted above.`] : null,
      ['Voucher log', 'The Wellness Voucher Performance page counts from the voucher log, so its totals can differ by a voucher or two.']])}</details></section>`;
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
  host.innerHTML = `${wvPerfHtml()}${wvOk5() ? '<div id="wvSendBox"></div>' : ''}<h3 class="wv-h3" id="wvList">Blast 3: the send list</h3><p class="slv-note wv-what"><b>What is this?</b> The 600 clients we messaged, by wave. <b>Use it to</b> see who bought, and to copy the numbers for a file.</p><div class="ll-fresh">${chip('List refreshed <b>' + lcEsc(wvDayY(when)) + '</b>')}${chip('First built <b>8 Oct 2026</b>')}${newN ? chip('<b>' + lcNum(newN) + '</b> added since 8 Oct') : ''}${wvRows.some(wvBought) ? chip('<b>' + lcNum(wvRows.filter(wvBought).length) + '</b> have bought since the blast') : ''}${wvCan().some(r => wvArm(r)) ? chip('Message test: <b>' + lcNum(wvCan().filter(r => wvArm(r) === 'A').length) + '</b> short (A) · <b>' + lcNum(wvCan().filter(r => wvArm(r) === 'B').length) + '</b> long (B)') : ''}</div>
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
    <div class="wv-send-h"><div><b>Blast 3: send the next wave</b> <span class="slv-note">only you see this</span> <a class="slv-note" href="?view=wvperf" onclick="event.preventDefault();showView('wvperf', document.querySelector('#sidebar .nav-sub[onclick*=&quot;wvperf&quot;]'))">Results: Wellness Voucher Performance</a></div>
      <button type="button" class="tglr lc-btn wv-sw ${on ? 'on' : 'off'}" onclick="wvSendSwitch(${on ? 'false' : 'true'})" title="The kill switch. Off: nothing is sent, even what is already queued.">Sending is ${on ? 'ON' : 'OFF'} · turn ${on ? 'off' : 'on'}</button></div>
    <dl class="wv-facts wv-www"><div><dt>What is this</dt><dd>The switch and buttons that send a wave of Blast 3 through GoHighLevel.</dd></div>
      <div><dt>Why it matters</dt><dd>Sent messages cannot be called back.</dd></div>
      <div><dt>Next</dt><dd>${(i.waves || []).every(w => !(Number(w.clients) - Number(w.sent) - Number(w.waiting) - Number(w.failed) - Number(w.skipped) > 0) && !Number(w.waiting)) ? 'Nothing to send, every wave has gone.' : 'Pick a wave, then press Send or Schedule.'}</dd></div></dl>
    <details class="wv-how"><summary>How sending works</summary>${wvReadHtml('Press Send wave 3a. Each of its clients gets the go tag in GoHighLevel, GoHighLevel sends her the short WhatsApp message and adds her to the Wellness Voucher pipeline.', [
      ['a and b', 'a is the short message, b is the long one.'],
      ['Send window', `Only between ${i.hour_from}:00 and ${i.hour_to}:00 Dubai.${win ? '' : ' <b>It is outside that window now.</b>'}`],
      ['Schedule…', `Pick the day and time, how many, and a pace (for example 40 every 30 minutes). It then sends itself, so you can close this page${on ? '' : ', but only while Sending is ON'}.`],
      ['Stop', 'Cancels only the clients still waiting. A message that has gone cannot be called back.']])}</details>
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
