// Stripe vs Phorest (Kate, 9 Nov 2026): every Stripe payment from the four salons in one list, checked against what the front desk rang through in Phorest.
// Built from the local mockup docs/mockups/stripe-vs-phorest.html in the cowork repo. One function (migrations/stripe_vs_phorest.sql):
//   stripe_vs_phorest(p_from, p_to)   the Period's Stripe payments with a status, the Phorest Stripe lines no payment explains, and the salon totals
// The Stripe side is our own copy (stripe_charges, filled nightly by the stripe-sync edge function from four read-only keys); the Phorest side is the sales lines
// (a Stripe takings fragment) and the client's Phorest id and email. Nothing is written back to Stripe or Phorest.
// Kate's rulings applied here: the header's Branch and Period drive the page (no filter bar of its own), every figure opens its rows,
// 10px side margins on a phone, dark mode, plain words for Belle. Level 3 and up, and anyone given the page in dashboard_users.extra_pages ('stripedeposits').
// Needs from dashboard.js (shared script scope): sb, sel, dateFrom, dateTo, dateToIso, BH_BRANCHES.
const SPV_STORE = 'trs-stripe-phorest';
function spvSave() { try { localStorage.setItem(SPV_STORE, JSON.stringify({ note: SPV.note, view: SPV.view })); } catch (e) {} }
const SPV = { view: 'visual', status: 'all', q: '', fPh: '', fSt: '', sort: 'smart', shown: 20, open: null, salon: 'ALL', note: ['', '', ''], tab: 'stripe' };
try { if (new URLSearchParams(location.search).get('tab') === 'deposits') SPV.tab = 'deposits'; } catch (e) {}   // a link can open the Open deposits tab: /?view=stripedeposits&tab=deposits
try { const s = JSON.parse(localStorage.getItem(SPV_STORE) || '{}'); if (s.view === 'table' || s.view === 'visual') SPV.view = s.view; if (Array.isArray(s.note)) SPV.note = [0, 1, 2].map(i => String(s.note[i] || '').slice(0, 200)); } catch (e) {}
const SPV_BR = { KCA: 'Khalifa City A', AQ: 'Al Quoz', SAA: 'Saadiyat', MC: 'Motor City' };
const SPV_ORDER = ['KCA', 'AQ', 'SAA', 'MC'];
const SPV_FROM = '2026-10-01';   // the list starts here; Stripe's copy goes back to 1 Aug 2026 so a deposit paid weeks ahead still finds its sale
const SPV_MAP = { not_checked_out: 'notco', wrong_branch: 'wrong', matched: 'matched', likely: 'likely', check: 'check', waiting: 'waiting', refunded: 'refunded' };
const SPV_NAME = { notco: 'Not checked out', wrong: 'Wrong branch', nostripe: 'Not in Stripe', check: 'Check', likely: 'Likely', waiting: 'Waiting', matched: 'Matched', refunded: 'Refunded' };
const SPV_RANK = { notco: 0, wrong: 1, nostripe: 2, check: 3, likely: 4, waiting: 5, refunded: 6, matched: 7 };
const SPV_NEEDS = ['notco', 'wrong', 'nostripe', 'check'];
const SPV_CHIPS = [['all', 'All'], ['needs', 'Needs checking'], ['notco', 'Not checked out'], ['wrong', 'Wrong branch'], ['nostripe', 'Not in Stripe'], ['check', 'Check'], ['likely', 'Likely'], ['waiting', 'Waiting'], ['matched', 'Matched'], ['refunded', 'Refunded']];
let spvData = null, spvKey = '', spvRows = [], spvSeq = 0;

const spvEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const spvWD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], spvMO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const spvFd = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); if (!m) return ''; const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); return `${spvWD[d.getUTCDay()]} ${+m[3]} ${spvMO[+m[2] - 1]}`; };
const spvFull = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${+m[3]} ${spvMO[+m[2] - 1]} ${m[1]}` : ''; };
const spvTime = iso => { try { return new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Asia/Dubai', hour: '2-digit', minute: '2-digit', hour12: false }); } catch (e) { return ''; } };
const spvM2 = v => (+v || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const spvM0 = v => (+v || 0).toLocaleString('en-GB', { minimumFractionDigits: (+v || 0) % 1 ? 2 : 0, maximumFractionDigits: 2 });
const spvSg = v => v === 0 ? '0.00' : (v > 0 ? '+' : '-') + spvM2(Math.abs(v));
const spvR2 = v => Math.round((+v || 0) * 100) / 100;
const spvSum = list => spvR2(list.reduce((t, r) => t + r.amt, 0));
const spvName = c => SPV_BR[c] || c;
const spvFirst = n => String(n || '').trim().split(/\s+/)[0] || 'the client';

// ── THE WINDOW (the header's Branch and Period) ──────────────────────────────────────
function spvRange() {
  const today = dateToIso(new Date());
  let a = typeof dateFrom !== 'undefined' && dateFrom ? dateToIso(dateFrom) : SPV_FROM;
  const b = typeof dateTo !== 'undefined' && dateTo ? dateToIso(dateTo) : today;
  if (a < SPV_FROM) a = SPV_FROM;
  return [a, b < a ? a : b];
}
function spvCodes() {   // the salons picked in the header; the four when All (Bahrain has no Stripe account here)
  if (typeof sel === 'undefined' || !sel.branch || sel.branch.includes('all')) return SPV_ORDER.slice();
  const c = sel.branch.filter(b => SPV_ORDER.includes(b));
  return c.length ? c : SPV_ORDER.slice();
}

// ── ROWS ─────────────────────────────────────────────────────────────────────────────
function spvBuild(d) {
  const rows = [];
  (d.charges || []).forEach(c => rows.push({ id: c.id, b: c.acct, name: c.name || 'No name on the payment', amt: +c.amt || 0, ref: +c.ref || 0, paid: c.paid, at: c.at,
    s: SPV_MAP[c.status] || 'check', why: c.why || '', sale: c.sale, sdate: c.sdate, sbranch: c.sbranch, sclient: c.sclient }));
  (d.phorest_only || []).forEach(p => rows.push({ id: 'ph' + p.sale, b: p.branch, name: p.name || 'No name on the sale', amt: +p.amt || 0, ref: 0, paid: p.date, at: null,
    s: 'nostripe', why: 'No Stripe payment from this client in any of the four accounts in the 60 days before.', sale: p.sale, sdate: p.date, sbranch: p.branch, sclient: p.name }));
  return rows;
}
const spvInBranch = (r, codes) => codes.includes(r.b) || (r.s === 'wrong' && r.sbranch && codes.includes(r.sbranch));
const spvInSalon = r => SPV.salon === 'ALL' || r.b === SPV.salon || (r.s === 'wrong' && r.sbranch === SPV.salon);
const spvNm = t => (t || '').toLowerCase().replace(/[^a-zÀ-ɏ؀-ۿ ]+/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');
const spvSameName = (a, b) => spvNm(a) !== '' && spvNm(a) === spvNm(b);
const spvBookOk = () => typeof TRS_LEVEL !== 'undefined' && TRS_LEVEL >= 5;   // the Client Book is a Level 5 page
const spvHas = (t, q) => (t || '').toLowerCase().includes(q.toLowerCase());
const spvMatchQ = r => (!SPV.q || spvHas(r.name, SPV.q) || spvHas(r.sclient, SPV.q))
  && (!SPV.fPh || spvHas(r.sclient, SPV.fPh))                       // the Phorest Name filter under the header
  && (!SPV.fSt || (r.s !== 'nostripe' && spvHas(r.name, SPV.fSt)));  // the Stripe Name filter (a Phorest-only sale has no Stripe name)
function spvInStatus(r, st) {
  if (st === 'all') return true;
  if (st === 'needs') return SPV_NEEDS.includes(r.s);
  if (st === 'diff') return ['waiting', 'notco', 'wrong', 'check', 'nostripe'].includes(r.s);
  return r.s === st;
}
const spvBase = () => { const c = spvCodes(); return spvRows.filter(r => spvInBranch(r, c) && spvInSalon(r)); };

// ── PAGE ─────────────────────────────────────────────────────────────────────────────
async function renderStripePhorest(force) {
  const el = document.getElementById('stripeContent');
  if (!el) return;
  spvCss();
  try { if (window.trsWindowReady) await window.trsWindowReady; } catch (e) {}
  const [a, b] = spvRange(), key = a + '|' + b, seq = ++spvSeq;
  SPV.open = null; SPV.shown = 20;
  if (SPV.tab === 'deposits') { opdRender(force); return; }   // Open deposits tab (17 Nov 2026): its own data, below
  if (!force && spvData && spvKey === key) { spvPaint(); return; }
  el.innerHTML = '<p class="spv-q">Reading Stripe and Phorest…</p>';
  try {
    const { data, error } = await sb.rpc('stripe_vs_phorest', { p_from: a, p_to: b });
    if (error) throw error;
    if (seq !== spvSeq) return;
    if (!data || !data.ok) throw new Error('no report');
    spvData = data; spvKey = key; spvRows = spvBuild(data);
    opdLoad(false);   // the Open deposits count on its tab, read quietly in the background
  } catch (e) {
    if (seq !== spvSeq) return;
    console.error(e);
    el.innerHTML = '<div class="spv-empty"><b>' + (/Not open/i.test(String(e && e.message)) ? 'This page is not open to your account.' : 'The Stripe numbers did not load.') + '</b>' +
      (/Not open/i.test(String(e && e.message)) ? '' : 'Refresh to try again.') + '</div>';
    return;
  }
  spvPaint();
}

function spvNextStep(r) {
  const first = spvFirst(r.name), sal = spvName(r.b);
  if (r.s === 'notco') return `Ask the ${sal} front desk to check ${spvEsc(first)} out in Phorest with this Stripe payment, or refund it if the client did not come.`;
  if (r.s === 'wrong') return `Ask ${spvName(r.sbranch)} to move this sale to ${sal} in Phorest, so the takings sit at the right salon.`;
  if (r.s === 'nostripe') return `Check Stripe for an unpaid or expired link, or a payment taken in another account. If ${spvEsc(first)} never paid, ask the ${sal} front desk to correct the payment type in Phorest.`;
  if (r.s === 'check') return /another way/.test(r.why) ? `Ask the ${sal} front desk how ${spvEsc(first)} paid at checkout and whether the deposit was counted.` : `Open the Stripe payment and the Phorest sale and confirm they are the same client.`;
  if (r.s === 'likely') return `Probably fine. Confirm the name or the amount in Phorest and it clears.`;
  if (r.s === 'waiting') return `Nothing to do yet. This clears when ${spvEsc(first)} is checked out in Phorest.`;
  if (r.s === 'refunded') return `Nothing to do. The refund went through Stripe.`;
  return 'Nothing to do.';
}
function spvAskFirst(r) {
  const first = spvEsc(spvFirst(r.name));
  if (r.s === 'notco') return `Did ${first} come in after paying? If so, how were they checked out?`;
  if (r.s === 'wrong') return `Which salon did ${first} actually visit?`;
  if (r.s === 'nostripe') return `Was a Stripe link sent to ${first}, and did they open it?`;
  if (r.s === 'check') return `Did ${first} pay a different way at the till?`;
  if (r.s === 'waiting') return `Is ${first}'s appointment still on?`;
  return 'What did you notice?';
}
function spvPhorestText(r) {
  if (r.s === 'nostripe') return `Stripe takings line, AED ${spvM2(r.amt)}, rung through ${spvFd(r.sdate)} at ${spvName(r.sbranch)}`;
  if (r.s === 'notco') return `No Stripe line for this client at ${spvName(r.b)} since ${spvFd(r.paid)}`;
  if (r.s === 'wrong') return `Stripe line found at ${spvName(r.sbranch)}, ${spvFd(r.sdate)}`;
  if (r.s === 'waiting') return 'Not there yet, paid in the last 14 days';
  if (r.s === 'refunded') return 'Fully refunded in Stripe';
  if (r.sale) return `Stripe line at ${spvName(r.sbranch)}, ${spvFd(r.sdate)}` + (r.sclient ? `, ${spvEsc(r.sclient)}` : '');
  return 'No Stripe line of this amount';
}
const spvBadge = r => `<span class="spv-badge ${r.s}"><i class="spv-dot ${r.s}"></i>${SPV_NAME[r.s]}</span>`;

function spvVisible() {
  let rows = spvBase().filter(spvMatchQ).filter(r => spvInStatus(r, SPV.status));
  const s = SPV.sort, a = rows.slice();
  if (s === 'smart') a.sort((x, y) => SPV_RANK[x.s] - SPV_RANK[y.s] || (y.paid > x.paid ? 1 : y.paid < x.paid ? -1 : 0));
  else if (s === 'dateDesc') a.sort((x, y) => (y.paid > x.paid ? 1 : y.paid < x.paid ? -1 : 0));
  else if (s === 'dateAsc') a.sort((x, y) => (x.paid > y.paid ? 1 : x.paid < y.paid ? -1 : 0));
  else if (s === 'amtDesc') a.sort((x, y) => y.amt - x.amt);
  else a.sort((x, y) => x.amt - y.amt);
  return a;
}

function spvPaint() {
  const el = document.getElementById('stripeContent');
  if (!el || !spvData) return;
  const d = spvData, codes = spvCodes(), base = spvBase();
  const by = st => base.filter(r => r.s === st);
  const act = [
    { k: 'notco', cls: 'act bad', t: 'Not checked out', why: 'Paid in Stripe, but Phorest has no visit for this client since.' },
    { k: 'wrong', cls: 'act warn', t: 'Wrong branch', why: 'Paid at one salon, rung through at another.' },
    { k: 'nostripe', cls: 'act info', t: 'Not in Stripe', why: 'Phorest shows a Stripe payment but Stripe has none for this client. An unpaid link, another account or a refund.' },
    { k: 'check', cls: 'act warn dashed', t: 'Check', why: 'The amount matches but not the name, or the client paid another way. Open it and confirm.' }
  ];
  const quiet = [
    { k: 'likely', t: 'Likely', why: 'Probably right. One click to confirm.' },
    { k: 'waiting', t: 'Waiting', why: 'Paid in the last 14 days. Normal, nothing to do.' },
    { k: 'matched', t: 'Matched', why: 'Same client and same amount in Phorest.' }
  ];
  const cardHtml = (x, isAct) => {
    const list = x.k === 'matched' ? base.filter(r => r.s === 'matched' || r.s === 'refunded') : by(x.k);
    return `<button type="button" class="spv-sc ${isAct ? x.cls : 'quiet'}" data-go='${JSON.stringify({ status: x.k })}' aria-pressed="${SPV.status === x.k}">` +
      `<span class="spv-lbl"><i class="spv-dot ${x.k}"></i>${x.t}</span><span class="spv-big">${list.length}</span><span class="spv-amt">AED ${spvM0(spvSum(list))}</span>` +
      `<span class="spv-why2">${x.why}</span>${isAct && list.length ? '<span class="spv-cta">Show these &rsaquo;</span>' : ''}</button>`;
  };
  // salon totals: Stripe and Phorest come from the server for the whole Period; the columns after them come from the rows
  const T = {};
  SPV_ORDER.forEach(c => { T[c] = { stripe: spvR2((d.salons[c] || {}).stripe), phorest: spvR2((d.salons[c] || {}).phorest), n: (d.salons[c] || {}).n || 0, wait: 0, notco: 0, wrong: 0, check: 0, nostripe: 0 }; });
  spvRows.forEach(r => {
    const t = T[r.b]; if (!t) return;
    if (r.s === 'waiting') t.wait += r.amt; else if (r.s === 'notco') t.notco += r.amt; else if (r.s === 'check') t.check += r.amt; else if (r.s === 'nostripe') t.nostripe += r.amt;
    else if (r.s === 'wrong') { t.wrong += r.amt; if (T[r.sbranch]) T[r.sbranch].wrong -= r.amt; }
  });
  const list = SPV.salon === 'ALL' ? codes : [SPV.salon];
  const fig = (v, txt, o, cls) => !v ? `<span class="spv-fig spv-zero">${txt}</span>` : `<button type="button" class="spv-fig ${cls || ''}" data-go='${JSON.stringify(o)}'>${txt}</button>`;
  const trow = (code, t, label, isTot) => {
    const diff = spvR2(t.stripe - t.phorest), br = isTot ? 'ALL' : code;
    return `<tr class="${isTot ? 'spv-tot' : ''}"><td data-l="Salon">${label}</td>` +
      `<td class="r" data-l="Stripe">${fig(t.stripe, spvM2(t.stripe), { salon: br, status: 'all' })}</td>` +
      `<td class="r" data-l="Phorest">${fig(t.phorest, spvM2(t.phorest), { salon: br, status: 'matched' })}</td>` +
      `<td class="r" data-l="Difference">${diff === 0 ? '<span class="spv-ok">0.00</span>' : `<button type="button" class="spv-fig spv-bad2" data-go='${JSON.stringify({ salon: br, status: 'diff' })}'>${spvM2(diff)}</button>`}</td>` +
      `<td class="r" data-l="Waiting">${fig(t.wait, spvM2(t.wait), { salon: br, status: 'waiting' })}</td>` +
      `<td class="r" data-l="Not checked out">${fig(t.notco, spvM2(t.notco), { salon: br, status: 'notco' })}</td>` +
      `<td class="r" data-l="Wrong branch">${fig(t.wrong, spvSg(spvR2(t.wrong)), { salon: br, status: 'wrong' })}</td>` +
      `<td class="r" data-l="Check">${fig(t.check, spvM2(t.check), { salon: br, status: 'check' })}</td>` +
      `<td class="r" data-l="Not in Stripe">${fig(t.nostripe, spvSg(-spvR2(t.nostripe)), { salon: br, status: 'nostripe' })}</td></tr>`;
  };
  let trows = list.map(c => trow(c, T[c], spvName(c), false)).join('');
  const tot = { stripe: 0, phorest: 0, wait: 0, notco: 0, wrong: 0, check: 0, nostripe: 0 };
  list.forEach(c => Object.keys(tot).forEach(k => { tot[k] = spvR2(tot[k] + T[c][k]); }));
  trows += trow('ALL', tot, list.length === 1 ? spvName(list[0]) + ' total' : (list.length === 4 ? 'All salons' : 'Salons picked'), true);

  // the visual: one card per salon, Stripe and Phorest as two bars, the difference, and the parts behind it (all clickable)
  const visCard = (code, t, label, isTot) => {
    const diff = spvR2(t.stripe - t.phorest), br = isTot ? 'ALL' : code, mx = Math.max(t.stripe, t.phorest, 1);
    const bar = (cls, v, lab, st) => `<div class="spv-vbar"><span class="spv-vl">${lab}</span><span class="spv-vtrack"><i class="${cls}" style="width:${Math.max(v > 0 ? 2 : 0, Math.round(v / mx * 100))}%"></i></span>${fig(v, spvM2(v), { salon: br, status: st })}</div>`;
    const parts = [['wait', 'Waiting', 'waiting', spvM2], ['notco', 'Not checked out', 'notco', spvM2], ['wrong', 'Wrong branch', 'wrong', v => spvSg(spvR2(v))], ['check', 'Check', 'check', spvM2], ['nostripe', 'Not in Stripe', 'nostripe', v => spvSg(-spvR2(v))]]
      .filter(x => t[x[0]]).map(x => `<button type="button" class="spv-vchip ${x[2]}" data-go='${JSON.stringify({ salon: br, status: x[2] })}'><i class="spv-dot ${x[2]}"></i>${x[1]} <b>${x[3](t[x[0]])}</b></button>`).join('');
    return `<div class="spv-vcard${isTot ? ' tot' : ''}"><div class="spv-vtop"><h3>${label}</h3>` +
      (diff === 0 ? '<span class="spv-ok">Balanced</span>' : `<button type="button" class="spv-fig spv-bad2 spv-vdiff" data-go='${JSON.stringify({ salon: br, status: 'diff' })}'>${spvSg(diff)}<small>Stripe minus Phorest</small></button>`) + `</div>` +
      bar('s', t.stripe, 'Stripe', 'all') + bar('p', t.phorest, 'Phorest', 'matched') +
      `<div class="spv-vparts">${parts || '<span class="spv-dim">Nothing waiting on a person here.</span>'}</div></div>`;
  };
  const visHtml = `<div class="spv-vgrid">${list.map(c => visCard(c, T[c], spvName(c), false)).join('')}${list.length > 1 ? visCard('ALL', tot, list.length === 4 ? 'All salons' : 'Salons picked', true) : ''}</div>`;

  // list
  const rows = spvVisible(), shown = rows.slice(0, SPV.shown);
  const chips = SPV_CHIPS.map(([k, n]) => {
    const c = spvBase().filter(spvMatchQ).filter(r => spvInStatus(r, k)).length;
    return `<button type="button" class="spv-schip ${k === 'needs' ? 'needs' : ''}" data-st="${k}" aria-pressed="${SPV.status === k}">${n} <span class="c">${c}</span></button>`;
  }).join('');
  const arrow = k => SPV.sort === k + 'Desc' ? '↓' : SPV.sort === k + 'Asc' ? '↑' : '';
  const body = shown.map(r => {
    const open = SPV.open === r.id;
    const salCell = spvName(r.b) + (r.s === 'wrong' ? `<span class="spv-sub">rung through at ${spvName(r.sbranch)}</span>` : '');
    const sameNm = r.sclient && r.s !== 'nostripe' && spvSameName(r.name, r.sclient);   // same name on both sides: leave the Phorest cell blank
    const phLink = spvBookOk() && r.sclient ? `<a class="spv-bk" href="/?view=clientbook&amp;cbq=${encodeURIComponent(r.sclient)}" target="_blank" rel="noopener" title="Find ${spvEsc(r.sclient)} in the Client Book" onclick="event.stopPropagation()">${spvEsc(r.sclient)}</a>` : spvEsc(r.sclient || '');
    const phCell = sameNm ? '' : r.sclient ? phLink : r.s === 'waiting' ? '<span class="spv-dim">Appointment ahead</span>' : '<span class="spv-dim">Not found</span>';
    const phShow = !sameNm && !!r.sclient;
    const clSub = '';
    let h = `<tr class="spv-row ${r.s}${open ? ' open' : ''}" data-id="${spvEsc(r.id)}" tabindex="0" role="button" aria-expanded="${open}">` +
      `<td class="dt num">${spvFd(r.paid)}<span class="slp"> · ${spvName(r.b)}${r.s === 'wrong' ? ' to ' + spvName(r.sbranch) : ''}</span></td>` +
      `<td class="sl">${salCell}</td>` +
      `<td class="ph${phShow ? '' : ' none'}">${phCell}</td>` +
      `<td class="cl">${r.s === 'nostripe' ? '<span class="spv-dim">No Stripe payment</span>' : spvEsc(r.name)}${clSub}</td>` +
      `<td class="r amt num">${spvM2(r.amt)}</td><td class="st">${spvBadge(r)}</td><td class="go" aria-hidden="true">${open ? '&#9650;' : '&#9660;'}</td></tr>`;
    if (open) {
      const stripeTxt = r.s === 'nostripe' ? `No Stripe payment found for this client in any of the four accounts` :
        `Paid ${spvFd(r.paid)}${r.at ? ', ' + spvTime(r.at) : ''}<br>AED ${spvM2(r.amt)}${r.ref ? `, refunded AED ${spvM2(r.ref)}` : ''}`;
      const searched = ['notco', 'nostripe', 'check', 'wrong'].includes(r.s) && r.why;
      h += `<tr class="spv-det ${r.s}"><td colspan="7"><div class="spv-dgrid">` +
        `<div><small>Stripe</small>${stripeTxt}</div><div><small>Phorest</small>${spvPhorestText(r)}</div>` +
        `<div><small>Why this status</small>${spvEsc(r.why)}</div>` +
        (searched ? `<div class="spv-next look"><b>We searched for you.</b> We looked through the Stripe payments and the Phorest sales of all four salons. ${spvEsc(r.why)}.</div>` : '') +
        `<div class="spv-next"><b>Ask first.</b> ${spvAskFirst(r)}</div><div class="spv-next"><b>Next step.</b> ${spvNextStep(r)}</div></div></td></tr>`;
    }
    return h;
  }).join('') || '<tr><td colspan="7" class="spv-empty2"><b>Nothing here.</b>No payments match these filters. That is good news if you were looking for problems.</td></tr>';
  const rest = rows.length - shown.length;
  const stripeRows = rows.filter(r => r.s !== 'nostripe'), phRows = rows.filter(r => r.s === 'nostripe');
  const money = (stripeRows.length || !phRows.length ? `AED <b>${spvM2(spvSum(stripeRows))}</b> in Stripe` : '') + (phRows.length ? (stripeRows.length ? ' and ' : '') + `AED <b>${spvM2(spvSum(phRows))}</b> only in Phorest` : '');
  const sn = SPV.status === 'all' ? 'all statuses' : SPV.status === 'needs' ? 'Needs checking' : SPV.status === 'diff' ? 'everything behind the difference' : SPV_NAME[SPV.status];
  const dirty = SPV.status !== 'all' || SPV.q || SPV.fPh || SPV.fSt || SPV.salon !== 'ALL';
  const [pa, pb] = spvRange();
  const sum = `Showing <b>${rows.length}</b> row${rows.length === 1 ? '' : 's'}, ${money} · ${sn}${SPV.salon !== 'ALL' ? ' · ' + spvName(SPV.salon) : ''}${dirty ? ' · <button type="button" class="spv-clear" data-act="clear">Clear filters</button>' : ''}`;
  const synced = d.synced_at ? new Date(d.synced_at).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) : '';

  el.innerHTML = spvTabs() +
    `<div class="spv-head"><div class="spv-eyebrow">Finance · Stripe deposits</div><h1>Stripe and Phorest, side by side</h1>` +
    `<p>Every Stripe payment from the four salons in one list, checked against what the front desk rang through in Phorest. You only need to look at <b>Not checked out</b>, <b>Wrong branch</b>, <b>Not in Stripe</b> and <b>Check</b>.</p>` +
    `<div class="spv-card spv-whycard"><div class="spv-eyebrow">Why this page</div>` +
    `<p><b>Why this:</b> a deposit that was paid but never rung through in Phorest is money we cannot see on the salon's numbers.</p>` +
    `<p><b>Why now:</b> there are four Stripe accounts, and checking them one by one is where the gaps hide.</p>` +
    `<p><b>If we do nothing:</b> the check stays by hand, and a missed deposit is found weeks later, if at all.</p></div></div>` +
    `<div class="spv-cards">${act.map(x => cardHtml(x, true)).join('')}${quiet.map(x => cardHtml(x, false)).join('')}</div>` +
    `<div class="spv-sec" id="spvSalons"><h2>Branch Discrepancies</h2><p class="spv-lead">What Stripe took, what Phorest shows as Stripe takings, and why they differ. Tap any figure to see the payments behind it.</p>` +
    `<div class="spv-vtog" role="group" aria-label="Show as"><button type="button" data-view="visual" aria-pressed="${SPV.view === 'visual'}">Visual</button><button type="button" data-view="table" aria-pressed="${SPV.view === 'table'}">Table</button></div>` +
    (SPV.view === 'visual' ? visHtml : '') +
    `<div class="spv-card spv-tw"${SPV.view === 'visual' ? ' hidden' : ''}><table class="spv-tbl"><thead><tr><th>Salon</th><th>Stripe</th><th>Phorest</th><th>Difference</th><th>Waiting</th><th>Not checked out</th><th>Wrong branch</th><th>Check</th><th>Not in Stripe</th></tr></thead><tbody>${trows}</tbody></table></div>` +
    `<div class="spv-callout"><b>A difference is normal when a deposit is paid ahead of the appointment.</b> It closes by itself once the client is checked out in Phorest. Only the four coloured statuses need a person.</div>` +
    `<div class="spv-note">Stripe and Phorest are totalled for ${spvFull(d.from)} to ${spvFull(d.data_to < d.to ? d.data_to : d.to)}, the days Phorest has. Stripe counts payments taken, Phorest counts Stripe takings rung through. Difference = Stripe minus Phorest. A difference of 0.00 does not mean clean, because two opposite problems can cancel each other out, so always check the list. Wrong branch is a plus at the salon that took the payment and a minus at the salon that rang it through.</div></div>` +
    `<div class="spv-sec" id="spvPay"><h2>Every Stripe payment</h2><p class="spv-lead">All amounts in AED. Tap a row to see what Stripe has, what Phorest has, and what to do next.${synced ? ' Stripe last copied ' + synced + '.' : ''}</p>` +
    `<div class="spv-bar"><input class="spv-search" id="spvQ" type="search" placeholder="Search a Stripe or Phorest name" aria-label="Search a Stripe or Phorest name" value="${spvEsc(SPV.q)}"><div class="spv-status-set" role="group" aria-label="Status">${chips}</div></div>` +
    `<div class="spv-sumline">${sum}</div>` +
    `<div class="spv-card spv-tw"><table class="spv-tbl spv-pay"><colgroup><col class="c-date"><col class="c-salon"><col class="c-ph"><col><col class="c-amt"><col class="c-stat"><col class="c-go"></colgroup>` +
    `<thead><tr><th class="sortable" style="text-align:left"><button type="button" data-sort="date">Date paid ${arrow('date')}</button></th><th style="text-align:left">Salon</th><th style="text-align:left">Phorest Name</th><th style="text-align:left">Stripe Name</th>` +
    `<th class="sortable"><button type="button" data-sort="amt">Amount ${arrow('amt')}</button></th><th style="text-align:left">Status</th><th></th></tr>` +
    `<tr class="spv-frow"><th></th><th><select id="spvFSalon" aria-label="Filter by salon"><option value="ALL">All salons</option>${codes.map(c => `<option value="${c}"${SPV.salon === c ? ' selected' : ''}>${spvName(c)}</option>`).join('')}</select></th>` +
    `<th><input id="spvFPh" type="search" placeholder="Filter" aria-label="Filter by Phorest name" value="${spvEsc(SPV.fPh)}"></th>` +
    `<th><input id="spvFSt" type="search" placeholder="Filter" aria-label="Filter by Stripe name" value="${spvEsc(SPV.fSt)}"></th><th></th>` +
    `<th><select id="spvFStatus" aria-label="Filter by status">${SPV_CHIPS.map(([k, n]) => `<option value="${k}"${SPV.status === k ? ' selected' : ''}>${k === 'all' ? 'All statuses' : n}</option>`).join('')}${SPV.status === 'diff' ? '<option value="diff" selected>Behind the difference</option>' : ''}</select></th><th></th></tr></thead><tbody>${body}</tbody></table>` +
    `<div class="spv-more-row"${rest > 0 ? '' : ' hidden'}><button class="spv-morebtn" type="button" data-act="more">Show ${Math.min(20, rest)} more (${rest} left)</button></div></div>` +
    `<div class="spv-card spv-commit"><h3>One action this week</h3><p class="lead2">Pick one payment from the list above. One action, one person to teach it to, one date.</p>` +
    `<div class="spv-crow"><label for="spvC0">My commitment this week is</label><input id="spvC0" data-note="0" type="text" maxlength="200" value="${spvEsc(SPV.note[0])}">` +
    `<label for="spvC1">I will teach it to</label><input id="spvC1" data-note="1" type="text" maxlength="200" value="${spvEsc(SPV.note[1])}">` +
    `<label for="spvC2">By</label><input id="spvC2" data-note="2" type="text" maxlength="200" value="${spvEsc(SPV.note[2])}"></div>` +
    `<div class="spv-note">Kept on this device only.</div></div></div>`;
  spvWire(el);
}

function spvGo(o) {
  if (o.salon !== undefined) SPV.salon = o.salon;
  SPV.status = o.status || 'all'; SPV.q = ''; SPV.fPh = ''; SPV.fSt = ''; SPV.shown = 20; SPV.open = null;
  spvPaint();
  const t = document.getElementById('spvPay'); if (t) t.scrollIntoView({ block: 'start' });
}
function spvWire(el) {
  spvWireTabs(el);
  el.querySelectorAll('[data-go]').forEach(b => { b.onclick = () => { try { spvGo(JSON.parse(b.getAttribute('data-go'))); } catch (e) {} }; });
  el.querySelectorAll('.spv-schip').forEach(b => { b.onclick = () => { SPV.status = b.getAttribute('data-st'); SPV.shown = 20; SPV.open = null; spvPaint(); }; });
  el.querySelectorAll('tr.spv-row').forEach(tr => {
    const t = () => { const i = tr.getAttribute('data-id'); SPV.open = SPV.open === i ? null : i; spvPaint(); };
    tr.onclick = t; tr.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); t(); } };
  });
  el.querySelectorAll('[data-sort]').forEach(b => { b.onclick = () => {
    const k = b.getAttribute('data-sort');
    SPV.sort = k === 'date' ? (SPV.sort === 'dateDesc' ? 'dateAsc' : SPV.sort === 'dateAsc' ? 'smart' : 'dateDesc') : (SPV.sort === 'amtDesc' ? 'amtAsc' : SPV.sort === 'amtAsc' ? 'smart' : 'amtDesc');
    spvPaint(); }; });
  const clr = el.querySelector('[data-act="clear"]'); if (clr) clr.onclick = () => { SPV.status = 'all'; SPV.q = ''; SPV.fPh = ''; SPV.fSt = ''; SPV.salon = 'ALL'; SPV.shown = 20; SPV.open = null; spvPaint(); };
  const more = el.querySelector('[data-act="more"]'); if (more) more.onclick = () => { SPV.shown += 20; spvPaint(); };
  const q = document.getElementById('spvQ');
  if (q) q.oninput = () => { SPV.q = q.value.trim(); SPV.shown = 20; SPV.open = null; const pos = q.selectionStart; spvPaint(); const n = document.getElementById('spvQ'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) {} } };
  el.querySelectorAll('[data-view]').forEach(b => { b.onclick = () => { SPV.view = b.getAttribute('data-view'); spvSave(); spvPaint(); }; });
  const fSal = document.getElementById('spvFSalon'); if (fSal) fSal.onchange = () => { SPV.salon = fSal.value; SPV.shown = 20; SPV.open = null; spvPaint(); };
  const fSta = document.getElementById('spvFStatus'); if (fSta) fSta.onchange = () => { SPV.status = fSta.value; SPV.shown = 20; SPV.open = null; spvPaint(); };
  [['spvFPh', 'fPh'], ['spvFSt', 'fSt']].forEach(([id, k]) => { const i = document.getElementById(id); if (!i) return;
    i.oninput = () => { SPV[k] = i.value.trim(); SPV.shown = 20; SPV.open = null; const pos = i.selectionStart; spvPaint(); const n = document.getElementById(id); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) {} } }; });
  el.querySelectorAll('[data-note]').forEach(i => { i.oninput = () => { SPV.note[+i.getAttribute('data-note')] = i.value; try { spvSave(); } catch (e) {} }; });
}

// ── OPEN DEPOSITS (Kate, 17 Nov 2026): the second tab. Built from the local mockup docs/mockups/open-deposits.html in the cowork repo ────────────
// One function (migrations/open_deposits_17nov.sql): open_deposits() reads open_deposits_cache, worked out hourly from the Phorest sales lines.
// A deposit is a 'Deposit' line; it counts as taken off when a later bill of the same client at the same salon carries an A(...) tender.
// These are CANDIDATES: the sales lines carry no appointment date, so a client with a booking still ahead shows as Waiting. The header's Branch drives it;
// the Period does not (a deposit stays open until it is taken off, whatever the week). Same access as the Stripe tab.
const OPD = { status: 'all', q: '', shown: 30 };
const OPD_NAME = { came: 'Came back, not deducted', part: 'Part used', old: 'No visit, over 14 days', wait: 'Waiting', small: 'Under AED 50' };
const OPD_CLS = { came: 'notco', part: 'nostripe', old: 'wrong', wait: 'waiting', small: 'waiting' };   // reuse the Stripe tab's badge and dot colours
const OPD_RANK = { came: 0, part: 1, old: 2, wait: 3, small: 4 };
let opdData = null, opdRows = [], opdLoading = null, opdCtState = '';   // opdCtState: '' not asked, 'busy', 'done'

function opdStatus(r, todayIso) {
  const age = Math.round((Date.parse(todayIso) - Date.parse(r.l)) / 864e5);
  r.age = age;
  if (r.a < 50) return 'small';
  if (r.v && !(r.u > 0)) return 'came';
  if (r.u > 0) return 'part';
  return age > 14 ? 'old' : 'wait';
}
function opdBuild(d) {
  const today = dateToIso(new Date());
  return (d.rows || []).map(x => { const r = { b: x.b, id: x.id, c: x.n || 'No name', f: x.f, l: x.l, a: +x.a || 0, u: +x.u || 0, v: x.v || null }; r.o = spvR2(r.a - r.u); r.s = opdStatus(r, today); return r; })
    .sort((x, y) => OPD_RANK[x.s] - OPD_RANK[y.s] || (x.l > y.l ? 1 : x.l < y.l ? -1 : 0));
}
function opdNeedCount() { const c = spvCodes(); return opdRows.filter(r => c.includes(r.b) && r.s !== 'wait' && r.s !== 'small').length; }
function opdLoad(force) {
  if (opdData && !force) return Promise.resolve(true);
  if (opdLoading) return opdLoading;
  opdLoading = (async () => {
    try {
      const { data, error } = await sb.rpc('open_deposits');
      if (error) throw error;
      if (!data || !data.ok) throw new Error('no report');
      opdData = data; opdRows = opdBuild(data); opdCtState = '';
      const n = document.getElementById('spvTabN'); if (n) n.textContent = opdNeedCount();
      return true;
    } catch (e) { console.error(e); return e; } finally { opdLoading = null; }
  })();
  return opdLoading;
}
function spvTabs() {
  return `<div class="spv-tabs" role="tablist">` +
    `<button type="button" class="spv-tab" role="tab" data-tab="stripe" aria-selected="${SPV.tab !== 'deposits'}">Stripe payments</button>` +
    `<button type="button" class="spv-tab" role="tab" data-tab="deposits" aria-selected="${SPV.tab === 'deposits'}">Open deposits <span class="n" id="spvTabN"${opdData ? '' : ' hidden'}>${opdData ? opdNeedCount() : ''}</span></button></div>`;
}
function spvWireTabs(el) {
  el.querySelectorAll('[data-tab]').forEach(b => { b.onclick = () => { const t = b.getAttribute('data-tab'); if (t === SPV.tab) return; SPV.tab = t; renderStripePhorest(false); }; });
}
async function opdRender(force) {
  const el = document.getElementById('stripeContent');
  if (!el) return;
  if (!opdData || force) el.innerHTML = spvTabs() + '<p class="spv-q">Reading the deposits…</p>';
  const seq = spvSeq, res = await opdLoad(!!force);
  if (seq !== spvSeq || SPV.tab !== 'deposits') return;
  if (res !== true) {
    const denied = /Not open/i.test(String(res && res.message));
    el.innerHTML = spvTabs() + '<div class="spv-empty"><b>' + (denied ? 'This page is not open to your account.' : 'The deposits did not load.') + '</b>' + (denied ? '' : 'Refresh to try again.') + '</div>';
    spvWireTabs(el); return;
  }
  opdPaint();
}
// Phone and email beside the client, at Level 5 only (the same rule and the same function as Top Clients: drill_client_contacts refuses anyone lower, as Client Book does).
// Asked once per load for every row; a client name shared by several Phorest profiles shows a note instead of a guess.
async function opdContacts() {
  if (typeof TRS_LEVEL === 'undefined' || TRS_LEVEL < 5 || !opdRows.length || opdCtState) return;
  opdCtState = 'busy';
  const rows = opdRows, today = dateToIso(new Date());
  try {
    const { data, error } = await sb.rpc('drill_client_contacts', { p_items: rows.map(r => [r.c, r.b, r.f, today]) });
    if (error) throw error;
    (data || []).forEach(x => { const r = rows[x.i]; if (r) { r._amb = !!x.a; r._ph = x.m || ''; r._em = x.e || ''; } });
    opdCtState = 'done';
  } catch (e) { opdCtState = 'done'; console.warn('contacts', e && e.message); }
  if (SPV.tab === 'deposits' && rows === opdRows) opdPaint();
}
function opdCtCell(r) {
  if (opdCtState !== 'done') return '<span class="spv-dim">Reading…</span>';
  if (r._amb) return '<span class="spv-dim">Several clients share this name. Open the Client Book.</span>';
  const ph = String(r._ph || '').split(' / ').filter(Boolean).map(x => `<a href="tel:${spvEsc(x.replace(/[^\d+]/g, ''))}">${spvEsc(x)}</a>`).join('<br>');
  const em = String(r._em || '').split(' / ').filter(Boolean).map(x => `<a href="mailto:${spvEsc(x)}" title="${spvEsc(x)}">${spvEsc(x)}</a>`).join('<br>');
  return (ph || em) ? ph + (ph && em ? '<br>' : '') + em : '<span class="spv-dim">–</span>';
}
function opdBase() { const c = spvCodes(); return opdRows.filter(r => c.includes(r.b)); }
function opdTodo(r) {
  const f = spvEsc(spvFirst(r.c)), sal = spvName(r.b);
  if (r.s === 'came') return `${f} came back on ${spvFd(r.v)} and no deposit came off. Ask the ${sal} front desk whether ${f} paid twice. If so, refund ${f}.`;
  if (r.s === 'part') return `Part of the deposit came off, AED ${spvM0(r.o)} is left. Check whether the rest is for a later visit.`;
  if (r.s === 'old') return `No visit for ${r.age} days. Check the booking: no-show (deposit kept), moved, or a refund owed.`;
  if (r.s === 'small') return 'Small amount, most likely a rounding or test line. Ignore unless the client says otherwise.';
  return 'Booking not reached yet, or not seen by Phorest sales. Nothing to do.';
}
function opdVisible() {
  const st = OPD.status, q = OPD.q.toLowerCase();
  return opdBase().filter(r => (st === 'all' || (st === 'needs' ? (r.s !== 'wait' && r.s !== 'small') : r.s === st)) && (!q || r.c.toLowerCase().includes(q)));
}
function opdPaint() {
  const el = document.getElementById('stripeContent');
  if (!el || !opdData) return;
  const base = opdBase(), by = k => base.filter(r => r.s === k), sumAmt = l => spvR2(l.reduce((t, r) => t + r.o, 0));
  const K = [['came', 'act bad', 'Possible double charge. Ask the front desk first.'], ['part', 'act info', 'Some of the deposit came off, some is left.'], ['old', 'act warn', 'No-show, moved, or a refund owed.'], ['wait', 'quiet', 'Normal. A booking may still be ahead.']];
  const cards = K.map(([k, cls, why]) => { const l = by(k);
    return `<button type="button" class="spv-sc ${cls}" data-od='${k}' aria-pressed="${OPD.status === k}"><span class="spv-lbl"><i class="spv-dot ${OPD_CLS[k]}"></i>${OPD_NAME[k]}</span><span class="spv-big">${l.length}</span><span class="spv-amt">AED ${spvM0(sumAmt(l))}</span><span class="spv-why2">${why}</span>${cls.startsWith('act') && l.length ? '<span class="spv-cta">Show these &rsaquo;</span>' : ''}</button>`; }).join('');
  const CH = [['all', 'All'], ['needs', 'Needs checking'], ['came', 'Came back'], ['part', 'Part used'], ['old', 'Over 14 days'], ['wait', 'Waiting'], ['small', 'Under AED 50']];
  const chips = CH.map(([k, n]) => { const c = base.filter(r => k === 'all' || (k === 'needs' ? (r.s !== 'wait' && r.s !== 'small') : r.s === k)).length;
    return `<button type="button" class="spv-schip ${k === 'needs' ? 'needs' : ''}" data-ost="${k}" aria-pressed="${OPD.status === k}">${n} <span class="c">${c}</span></button>`; }).join('');
  const rows = opdVisible(), shown = rows.slice(0, OPD.shown), rest = rows.length - shown.length;
  const bookOk = spvBookOk(), ct = bookOk;   // the Client Book and the contact details are Level 5 only
  const body = shown.map(r => {
    const nm = bookOk ? `<a class="spv-bk" href="/?view=clientbook&amp;cbq=${encodeURIComponent(r.c)}" target="_blank" rel="noopener" title="Find ${spvEsc(r.c)} in the Client Book">${spvEsc(r.c)}</a>` : spvEsc(r.c);
    return `<tr class="opd-row ${OPD_CLS[r.s]}"><td data-l="Deposit paid" class="num">${spvFd(r.l)}${r.f !== r.l ? `<span class="spv-sub">first ${spvFd(r.f)}</span>` : ''}</td>` +
      `<td data-l="Salon">${spvName(r.b)}</td><td data-l="Client" class="opd-cl">${nm}${r.v ? `<span class="spv-sub">came back ${spvFd(r.v)}</span>` : ''}</td>` +
      (ct ? `<td data-l="Contact details" class="opd-ct">${opdCtCell(r)}</td>` : '') +
      `<td class="r num" data-l="Deposit">${spvM0(r.a)}</td><td class="r num" data-l="Taken off">${spvM0(r.u)}</td><td class="r num" data-l="Days open"><b>${r.age}</b></td>` +
      `<td data-l="Status"><span class="spv-badge ${OPD_CLS[r.s]}"><i class="spv-dot ${OPD_CLS[r.s]}"></i>${OPD_NAME[r.s]}</span></td><td data-l="What to do" class="opd-todo">${opdTodo(r)}</td></tr>`;
  }).join('') || `<tr><td colspan="${ct ? 9 : 8}" class="spv-empty2"><b>Nothing here.</b>No deposits match these filters. That is good news if you were looking for problems.</td></tr>`;
  const upd = opdData.at ? new Date(opdData.at).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) : '';
  const dirty = OPD.status !== 'all' || OPD.q;
  el.innerHTML = spvTabs() +
    `<div class="spv-head"><div class="spv-eyebrow">Tools · Deposits</div><h1>Open deposits</h1>` +
    `<p>Every deposit a client paid that has not been taken off a bill yet. The one that matters most is a client who <b>came back and paid in full</b>, because she may have paid twice.</p>` +
    `<div class="spv-card spv-whycard"><p><b>Why this:</b> a deposit should come off the client's bill when she is checked out. This page shows the deposits that have not been taken off yet, so the front desk can check them.</p>` +
    `<p><b>If we do nothing:</b> a missed deduction is only found when the client mentions it.</p></div></div>` +
    `<div class="spv-cards opd-cards">${cards}</div>` +
    `<div class="spv-sec" id="opdList"><h2>Every open deposit</h2><p class="spv-lead">Deposits from the last 90 days at the salons picked in the header. Tap a card to filter the list.${upd ? ' Last worked out ' + upd + '.' : ''}</p>` +
    `<div class="spv-bar"><input class="spv-search" id="opdQ" type="search" placeholder="Search a client" aria-label="Search a client" value="${spvEsc(OPD.q)}"><div class="spv-status-set" role="group" aria-label="Status">${chips}</div></div>` +
    `<div class="spv-sumline">Showing <b>${rows.length}</b> client${rows.length === 1 ? '' : 's'}, AED <b>${spvM0(sumAmt(rows))}</b> open${dirty ? ' · <button type="button" class="spv-clear" data-act="oclear">Clear filters</button>' : ''}</div>` +
    `<div class="spv-card spv-tw"><table class="spv-tbl spv-opd"><thead><tr><th>Deposit paid</th><th>Salon</th><th>Client</th>${ct ? '<th>Contact details</th>' : ''}<th class="r">Deposit</th><th class="r">Taken off</th><th class="r">Days open</th><th>Status</th><th>What to do</th></tr></thead><tbody>${body}</tbody></table>` +
    `<div class="spv-more-row"${rest > 0 ? '' : ' hidden'}><button class="spv-morebtn" type="button" data-act="omore">Show ${Math.min(30, rest)} more (${rest} left)</button></div></div>` +
    `<div class="spv-callout"><b>A deposit waiting for a booking is normal.</b> Phorest sales do not carry the appointment date, so a client with a booking still ahead shows as Waiting. Only <b>Came back</b>, <b>Part used</b> and <b>No visit, over 14 days</b> need a person.</div>` +
    `<div class="spv-note">How it is read: a deposit is a "Deposit" line in Phorest (a refund nets it off). It counts as taken off when a later bill for the same client at the same salon carries an A(...) tender. These are candidates only. Check the client in Phorest before telling her anything. Bahrain is left out, as on the Stripe tab.</div></div>`;
  spvWireTabs(el);
  opdContacts();
  el.querySelectorAll('[data-od]').forEach(b => { b.onclick = () => { const k = b.getAttribute('data-od'); OPD.status = OPD.status === k ? 'all' : k; OPD.shown = 30; opdPaint(); if (OPD.status !== 'all') { const t = document.getElementById('opdList'); if (t) t.scrollIntoView({ block: 'start' }); } }; });
  el.querySelectorAll('[data-ost]').forEach(b => { b.onclick = () => { OPD.status = b.getAttribute('data-ost'); OPD.shown = 30; opdPaint(); }; });
  const q = document.getElementById('opdQ');
  if (q) q.oninput = () => { OPD.q = q.value.trim(); OPD.shown = 30; const pos = q.selectionStart; opdPaint(); const n = document.getElementById('opdQ'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) {} } };
  const clr = el.querySelector('[data-act="oclear"]'); if (clr) clr.onclick = () => { OPD.status = 'all'; OPD.q = ''; OPD.shown = 30; opdPaint(); };
  const more = el.querySelector('[data-act="omore"]'); if (more) more.onclick = () => { OPD.shown += 30; opdPaint(); };
}

// ── STYLE (scoped; the colours match the approved mockup, light and dark) ───────────────
function spvCss() {
  if (document.getElementById('spvCss')) return;
  const st = document.createElement('style'); st.id = 'spvCss';
  st.textContent = `
#stripeContent{--s-bad:#A03C3C;--s-bad-bg:#F7E9E9;--s-bad-on:#fff;--s-warn:#8A5F12;--s-warn-bg:#FBF3E2;--s-warn-on:#fff;--s-info:#4B3FA3;--s-info-bg:#EEEBFA;--s-info-on:#fff;--s-good:#3E7A5E;--s-good-bg:#E4F1EA;max-width:1100px;margin:0 auto;padding:10px 28px 56px}
[data-theme="dark"] #stripeContent{--s-bad:#FF9B9B;--s-bad-bg:rgba(255,155,155,.12);--s-bad-on:#2D2E37;--s-warn:#FFB27A;--s-warn-bg:rgba(255,178,122,.12);--s-warn-on:#2D2E37;--s-info:#C4B5FD;--s-info-bg:rgba(196,181,253,.13);--s-info-on:#2D2E37;--s-good:#99F6E4;--s-good-bg:rgba(153,246,228,.12)}
#stripeContent .num{font-variant-numeric:tabular-nums}
#stripeContent .spv-q{margin:4px 0 16px;color:var(--muted);font-size:15px}
#stripeContent .spv-empty{padding:34px 18px;text-align:center;color:var(--muted)}#stripeContent .spv-empty b{display:block;font-family:'Playfair Display',serif;font-size:20px;font-weight:500;color:var(--text);margin-bottom:4px}
#stripeContent .spv-eyebrow{font-size:12px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--muted2)}
#stripeContent .spv-head{padding-top:12px}
#stripeContent .spv-head h1{font-family:'Playfair Display',serif;font-weight:500;font-size:34px;line-height:1.15;margin:4px 0 8px}
#stripeContent .spv-head p{margin:0;color:var(--muted);max-width:66ch;font-size:16px}
#stripeContent .spv-card{background:var(--surface);border:1px solid var(--border);border-radius:14px;box-shadow:var(--shadow)}
#stripeContent .spv-whycard{margin-top:16px;padding:14px 18px 10px;max-width:80ch;box-shadow:none}
#stripeContent .spv-whycard p{margin:6px 0;font-size:15px;color:var(--text)}
#stripeContent .spv-commit{margin-top:22px;padding:18px 20px;max-width:80ch}
#stripeContent .spv-commit h3{font-family:'Playfair Display',serif;font-weight:500;font-size:20px;margin:0 0 4px}
#stripeContent .spv-commit .lead2{margin:0 0 12px;color:var(--muted);font-size:14.5px}
#stripeContent .spv-crow{display:grid;grid-template-columns:auto 1fr;gap:10px 12px;align-items:center;font-size:15px}
#stripeContent .spv-crow label{color:var(--muted);white-space:nowrap}
#stripeContent .spv-crow input{border:1px solid var(--border);background:var(--bg);color:var(--text);border-radius:10px;padding:8px 12px;min-height:38px;width:100%;font:inherit}
#stripeContent .spv-sec{margin-top:34px}
#stripeContent .spv-sec>h2{font-family:'Playfair Display',serif;font-weight:500;font-size:23px;margin:0 0 4px}
#stripeContent .spv-lead{margin:0 0 14px;color:var(--muted);font-size:15px;max-width:72ch}
#stripeContent .spv-cards{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:12px;margin-top:18px}
#stripeContent .spv-sc{grid-column:span 3;display:flex;flex-direction:column;align-items:flex-start;text-align:left;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:14px;padding:16px 18px 14px;cursor:pointer;box-shadow:var(--shadow);min-width:0;font:inherit}
#stripeContent .spv-sc.quiet{grid-column:span 4;box-shadow:none}
#stripeContent .spv-sc:hover{border-color:var(--muted2)}
#stripeContent .spv-lbl{font-size:13px;font-weight:600;display:flex;align-items:center;gap:8px}
#stripeContent .spv-big{font-family:'Playfair Display',serif;font-size:34px;font-weight:500;line-height:1.1;margin:8px 0 0;font-variant-numeric:tabular-nums}
#stripeContent .spv-amt{font-size:14.5px;color:var(--muted);margin-top:2px;font-variant-numeric:tabular-nums}
#stripeContent .spv-why2{font-size:13px;color:var(--muted);margin-top:10px;max-width:30ch}
#stripeContent .spv-cta{font-size:13px;font-weight:700;margin-top:10px}
#stripeContent .spv-sc.act{border-width:2px}#stripeContent .spv-sc.act .spv-big{font-size:40px}
#stripeContent .spv-sc.act.bad{border-color:var(--s-bad);background:var(--s-bad-bg)}#stripeContent .spv-sc.act.bad .spv-big,#stripeContent .spv-sc.act.bad .spv-lbl{color:var(--s-bad)}
#stripeContent .spv-sc.act.warn{border-color:var(--s-warn);background:var(--s-warn-bg)}#stripeContent .spv-sc.act.warn .spv-big,#stripeContent .spv-sc.act.warn .spv-lbl{color:var(--s-warn)}
#stripeContent .spv-sc.act.info{border-color:var(--s-info);background:var(--s-info-bg)}#stripeContent .spv-sc.act.info .spv-big,#stripeContent .spv-sc.act.info .spv-lbl{color:var(--s-info)}
#stripeContent .spv-sc.act.dashed{border-style:dashed}
#stripeContent .spv-sc[aria-pressed="true"]{outline:3px solid var(--accent);outline-offset:1px}
#stripeContent .spv-dot{display:inline-block;width:10px;height:10px;border-radius:50%;flex:none}
#stripeContent .spv-dot.notco{background:var(--s-bad)}#stripeContent .spv-dot.wrong,#stripeContent .spv-dot.check{background:var(--s-warn)}#stripeContent .spv-dot.nostripe{background:var(--s-info)}
#stripeContent .spv-dot.waiting,#stripeContent .spv-dot.likely{border:2px solid var(--muted2)}#stripeContent .spv-dot.matched{background:var(--s-good)}#stripeContent .spv-dot.refunded{background:var(--muted2)}
#stripeContent .spv-tw{overflow-x:auto;-webkit-overflow-scrolling:touch}
#stripeContent table.spv-tbl{border-collapse:collapse;width:100%;font-size:14.5px}
#stripeContent .spv-tbl th,#stripeContent .spv-tbl td{padding:10px 14px;border-bottom:1px solid var(--border);vertical-align:middle}
#stripeContent .spv-tbl:not(.spv-pay) th{white-space:normal;line-height:1.25;min-width:70px}
#stripeContent .spv-tw[hidden]{display:none}
#stripeContent .spv-vtog{display:inline-flex;border:1px solid var(--border);border-radius:999px;padding:3px;background:var(--surface);margin:0 0 14px}
#stripeContent .spv-vtog button{border:0;background:none;color:var(--muted);font:inherit;font-size:14px;padding:6px 18px;border-radius:999px;cursor:pointer}
#stripeContent .spv-vtog button[aria-pressed="true"]{background:var(--text);color:var(--bg);font-weight:600}
#stripeContent .spv-vgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
#stripeContent .spv-vcard{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:16px 18px;box-shadow:var(--shadow);min-width:0}
#stripeContent .spv-vcard.tot{grid-column:1/-1;background:var(--surface2)}
#stripeContent .spv-vtop{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:10px}
#stripeContent .spv-vtop h3{margin:0;font-family:'Playfair Display',serif;font-size:20px;font-weight:500;color:var(--text)}
#stripeContent .spv-vdiff{font-size:20px;font-weight:700;text-align:right;line-height:1.1}#stripeContent .spv-vdiff small{display:block;font-size:11.5px;font-weight:400;color:var(--muted2);margin-top:2px}
#stripeContent .spv-vbar{display:grid;grid-template-columns:62px minmax(0,1fr) auto;align-items:center;gap:10px;margin:7px 0;font-variant-numeric:tabular-nums}
#stripeContent .spv-vl{font-size:13px;color:var(--muted)}
#stripeContent .spv-vtrack{height:12px;border-radius:6px;background:var(--surface2);overflow:hidden}
#stripeContent .spv-vtrack i{display:block;height:100%;border-radius:6px}#stripeContent .spv-vtrack i.s{background:var(--accent)}#stripeContent .spv-vtrack i.p{background:var(--muted2)}
#stripeContent .spv-vparts{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
#stripeContent .spv-vchip{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--border);background:var(--surface);color:var(--text);border-radius:999px;padding:5px 12px;font:inherit;font-size:13.5px;cursor:pointer}
#stripeContent .spv-vchip:hover{border-color:var(--muted2)}
#stripeContent .spv-vchip.notco{border-color:var(--s-bad)}#stripeContent .spv-vchip.wrong,#stripeContent .spv-vchip.check{border-color:var(--s-warn)}#stripeContent .spv-vchip.nostripe{border-color:var(--s-info)}
@media(max-width:760px){#stripeContent .spv-vgrid{grid-template-columns:minmax(0,1fr)}}
#stripeContent .spv-tbl th{font-size:12px;font-weight:600;color:var(--muted2);letter-spacing:.04em;text-transform:uppercase;text-align:right;vertical-align:bottom}
#stripeContent .spv-tbl th:first-child,#stripeContent .spv-tbl td:first-child{text-align:left}
#stripeContent .spv-tbl td.r{text-align:right;font-variant-numeric:tabular-nums}
#stripeContent .spv-tbl tr:last-child td{border-bottom:0}
#stripeContent .spv-tot td{font-weight:700;background:var(--surface2)}
#stripeContent .spv-fig{border:0;background:none;padding:2px 0;cursor:pointer;color:inherit;text-decoration:underline;text-decoration-color:var(--border);text-underline-offset:4px;font:inherit;font-variant-numeric:tabular-nums;font-weight:inherit}
#stripeContent .spv-fig:hover{text-decoration-color:var(--text)}
#stripeContent .spv-zero{color:var(--muted2);text-decoration:none;cursor:default;font-variant-numeric:tabular-nums}
#stripeContent .spv-bad2{color:var(--s-bad);font-weight:700}#stripeContent .spv-ok{color:var(--s-good);font-weight:700;font-variant-numeric:tabular-nums}
#stripeContent .spv-callout{margin-top:12px;padding:14px 18px;border-left:4px solid var(--s-warn);background:var(--s-warn-bg);border-radius:10px;font-size:15px;max-width:80ch}
#stripeContent .spv-note{font-size:13px;color:var(--muted2);margin:10px 2px 0;max-width:90ch}
#stripeContent #spvSalons table{min-width:900px;table-layout:fixed}#stripeContent #spvSalons th:first-child{width:16%}
#stripeContent .spv-bar{display:flex;flex-wrap:wrap;gap:10px 14px;align-items:center;margin-bottom:10px}
#stripeContent .spv-search{flex:1 1 220px;max-width:320px;border:1px solid var(--border);background:var(--surface);color:var(--text);border-radius:999px;padding:7px 14px;min-height:36px;font:inherit}
#stripeContent .spv-status-set{display:flex;flex-wrap:wrap;gap:6px}
#stripeContent .spv-schip{border:1px solid var(--border);background:var(--surface);color:var(--text);border-radius:999px;padding:5px 12px;font:inherit;font-size:13.5px;cursor:pointer;display:inline-flex;gap:8px;align-items:center;min-height:34px;white-space:nowrap}
#stripeContent .spv-schip .c{font-variant-numeric:tabular-nums;color:var(--muted2);font-size:12.5px}
#stripeContent .spv-schip[aria-pressed="true"]{background:var(--accent);color:var(--accent-fg);border-color:transparent;font-weight:600}
#stripeContent .spv-schip[aria-pressed="true"] .c{color:inherit;opacity:.8}
#stripeContent .spv-schip.needs{border-color:var(--s-bad);color:var(--s-bad);font-weight:600}
#stripeContent .spv-schip.needs[aria-pressed="true"]{background:var(--s-bad);color:var(--s-bad-on);border-color:transparent}
#stripeContent .spv-schip.needs[aria-pressed="true"] .c{color:var(--s-bad-on)}
#stripeContent .spv-sumline{display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;font-size:14px;color:var(--muted);margin:2px 0 10px}
#stripeContent .spv-sumline b{color:var(--text)}
#stripeContent .spv-clear{border:0;background:none;text-decoration:underline;cursor:pointer;color:var(--text);font:inherit;font-size:14px;padding:0}
#stripeContent .spv-pay{table-layout:fixed;min-width:1010px}
#stripeContent .spv-pay col.c-date{width:116px}#stripeContent .spv-pay col.c-salon{width:190px}#stripeContent .spv-pay col.c-ph{width:200px}#stripeContent .spv-pay col.c-amt{width:120px}#stripeContent .spv-pay col.c-stat{width:178px}#stripeContent .spv-pay col.c-go{width:44px}
#stripeContent .spv-pay tr.spv-frow th{padding:6px 14px 10px;text-transform:none;letter-spacing:0;font-weight:400}
#stripeContent .spv-frow select,#stripeContent .spv-frow input{width:100%;box-sizing:border-box;font:inherit;font-size:13px;color:var(--text);background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:6px 8px}
#stripeContent .spv-pay th.sortable{cursor:pointer;user-select:none}
#stripeContent .spv-pay th.sortable button{border:0;background:none;padding:0;font:inherit;color:inherit;letter-spacing:inherit;text-transform:inherit;cursor:pointer}
#stripeContent .spv-pay td{padding:11px 14px}
#stripeContent .spv-pay td.cl,#stripeContent .spv-pay td.ph{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#stripeContent a.spv-bk{color:inherit;text-decoration:underline dotted;text-underline-offset:3px}#stripeContent a.spv-bk:hover{text-decoration:underline}
#stripeContent .spv-dim{font-weight:400;color:var(--muted2)}
#stripeContent .spv-pay td.go{text-align:right;color:var(--muted2);padding-right:16px}
#stripeContent .spv-pay tr.spv-row{cursor:pointer}
#stripeContent .spv-pay tr.spv-row:hover td{background:var(--surface2)}
#stripeContent .spv-pay tr.spv-row.notco td{background:var(--s-bad-bg)}#stripeContent .spv-pay tr.spv-row.wrong td,#stripeContent .spv-pay tr.spv-row.check td{background:var(--s-warn-bg)}#stripeContent .spv-pay tr.spv-row.nostripe td{background:var(--s-info-bg)}
#stripeContent .spv-pay tr.spv-row.notco td:first-child{box-shadow:inset 5px 0 0 var(--s-bad)}#stripeContent .spv-pay tr.spv-row.wrong td:first-child,#stripeContent .spv-pay tr.spv-row.check td:first-child{box-shadow:inset 5px 0 0 var(--s-warn)}#stripeContent .spv-pay tr.spv-row.nostripe td:first-child{box-shadow:inset 5px 0 0 var(--s-info)}
#stripeContent .spv-pay tr.spv-row.open td{border-bottom-color:transparent}
#stripeContent .spv-sub{display:block;font-size:12.5px;font-weight:400;color:var(--muted2)}
#stripeContent .spv-badge{display:inline-flex;align-items:center;gap:7px;border-radius:999px;padding:3px 11px 3px 9px;font-size:13px;font-weight:600;white-space:nowrap}
#stripeContent .spv-badge .spv-dot{width:8px;height:8px}
#stripeContent .spv-badge.notco{background:var(--s-bad);color:var(--s-bad-on)}#stripeContent .spv-badge.notco .spv-dot{background:var(--s-bad-on)}
#stripeContent .spv-badge.wrong,#stripeContent .spv-badge.check{background:var(--s-warn);color:var(--s-warn-on)}#stripeContent .spv-badge.wrong .spv-dot,#stripeContent .spv-badge.check .spv-dot{background:var(--s-warn-on)}
#stripeContent .spv-badge.nostripe{background:var(--s-info);color:var(--s-info-on)}#stripeContent .spv-badge.nostripe .spv-dot{background:var(--s-info-on)}
#stripeContent .spv-badge.waiting,#stripeContent .spv-badge.likely{border:1.5px solid var(--muted2);color:var(--muted);font-weight:500}
#stripeContent .spv-badge.matched{background:var(--s-good-bg);color:var(--s-good)}#stripeContent .spv-badge.matched .spv-dot{background:var(--s-good)}
#stripeContent .spv-badge.refunded{background:var(--surface2);color:var(--muted)}
#stripeContent .spv-pay tr.spv-det td{padding:0 14px 14px;background:var(--surface2)}
#stripeContent .spv-pay tr.spv-det.notco td{background:var(--s-bad-bg)}#stripeContent .spv-pay tr.spv-det.wrong td,#stripeContent .spv-pay tr.spv-det.check td{background:var(--s-warn-bg)}#stripeContent .spv-pay tr.spv-det.nostripe td{background:var(--s-info-bg)}
#stripeContent .spv-dgrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px 20px;padding:12px 4px 2px;border-top:1px dashed var(--border);font-size:14px}
#stripeContent .spv-dgrid small{display:block;font-size:11.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted2);margin-bottom:2px}
#stripeContent .spv-next{grid-column:1/-1;font-size:14.5px}#stripeContent .spv-next b{font-weight:700}
#stripeContent .spv-next.look{padding:10px 14px;border-radius:10px;background:var(--surface);border:1px dashed var(--muted2)}
#stripeContent .spv-more-row{display:flex;justify-content:center;padding:14px}#stripeContent .spv-more-row[hidden]{display:none}
#stripeContent .spv-morebtn{border:1px solid var(--border);background:var(--surface);color:var(--text);border-radius:999px;padding:8px 20px;cursor:pointer;font:inherit}
#stripeContent .spv-empty2{padding:34px 18px;text-align:center;color:var(--muted);display:table-cell}#stripeContent .spv-empty2 b{display:block;font-family:'Playfair Display',serif;font-size:20px;font-weight:500;color:var(--text);margin-bottom:4px}
#stripeContent :focus-visible{outline:2px solid var(--accent);outline-offset:2px}
@media(max-width:1000px){#stripeContent .spv-sc{grid-column:span 6}#stripeContent .spv-sc.quiet{grid-column:span 4}}
@media(max-width:760px){
#stripeContent{padding:10px 10px 44px!important}
#stripeContent .spv-head h1{font-size:28px}
#stripeContent .spv-cards{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
#stripeContent .spv-sc,#stripeContent .spv-sc.quiet{grid-column:span 1}
#stripeContent .spv-sc.act .spv-why2{max-width:none}
#stripeContent .spv-big,#stripeContent .spv-sc.act .spv-big{font-size:30px}
#stripeContent #spvSalons table,#stripeContent #spvSalons tbody,#stripeContent #spvSalons tr,#stripeContent #spvSalons td{display:block;min-width:0;width:100%}
#stripeContent #spvSalons thead{display:none}
#stripeContent #spvSalons tr{display:grid;grid-template-columns:1fr 1fr;gap:2px 12px;padding:12px 14px;border-bottom:1px solid var(--border)}
#stripeContent #spvSalons tr:last-child{border-bottom:0}
#stripeContent #spvSalons td{border:0;padding:4px 0;text-align:left!important;display:flex;flex-direction:column;align-items:flex-start;gap:1px}
#stripeContent #spvSalons td::before{content:attr(data-l);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted2);font-weight:600}
#stripeContent #spvSalons td:first-child{grid-column:1/-1;font-size:17px;font-family:'Playfair Display',serif}
#stripeContent #spvSalons td:first-child::before{content:none}
#stripeContent #spvSalons .spv-tot td{background:none}#stripeContent #spvSalons tr.spv-tot{background:var(--surface2)}
#stripeContent .spv-search{max-width:none;flex-basis:100%}
#stripeContent .spv-status-set{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;width:100%;padding-bottom:2px}
#stripeContent .spv-status-set::-webkit-scrollbar{display:none}
#stripeContent .spv-pay{min-width:0;table-layout:auto}
#stripeContent .spv-pay colgroup,#stripeContent .spv-pay thead{display:none}
#stripeContent .spv-pay,#stripeContent .spv-pay tbody{display:block}
#stripeContent .spv-pay tr.spv-row{display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"cl amt" "ph amt" "meta stat";gap:4px 12px;padding:12px 14px 12px 18px;border-bottom:1px solid var(--border)}
#stripeContent .spv-pay tr.spv-row td{display:block;border:0;padding:0;background:none!important;box-shadow:none!important}
#stripeContent .spv-pay tr.spv-row.notco{background:var(--s-bad-bg);box-shadow:inset 5px 0 0 var(--s-bad)}
#stripeContent .spv-pay tr.spv-row.wrong,#stripeContent .spv-pay tr.spv-row.check{background:var(--s-warn-bg);box-shadow:inset 5px 0 0 var(--s-warn)}
#stripeContent .spv-pay tr.spv-row.nostripe{background:var(--s-info-bg);box-shadow:inset 5px 0 0 var(--s-info)}
#stripeContent .spv-pay td.cl{grid-area:cl;font-size:16px;white-space:normal}
#stripeContent .spv-pay td.ph{grid-area:ph;font-size:13px;font-weight:400;color:var(--muted);white-space:normal}
#stripeContent .spv-pay td.ph::before{content:'Phorest: ';color:var(--muted2)}
#stripeContent .spv-pay td.ph.none{display:none}
#stripeContent .spv-pay td.amt{grid-area:amt;text-align:right;font-weight:700}
#stripeContent .spv-pay td.dt{grid-area:meta;color:var(--muted);font-size:13px;white-space:normal}
#stripeContent .spv-pay td.sl,#stripeContent .spv-pay td.go{display:none!important}
#stripeContent .spv-pay td.st{grid-area:stat;text-align:right}
#stripeContent .spv-pay tr.spv-det{display:block}
#stripeContent .spv-pay tr.spv-det td{display:block;padding:0 14px 12px}
#stripeContent .spv-dgrid{grid-template-columns:1fr}
}
@media(min-width:761px){#stripeContent .spv-pay td.dt .slp{display:none}}
#stripeContent .spv-tabs{display:flex;gap:4px;margin:6px 0 0;border-bottom:1px solid var(--border)}
#stripeContent .spv-tab{border:0;background:none;color:var(--muted);font:inherit;font-size:15px;padding:10px 16px;cursor:pointer;border-bottom:3px solid transparent;margin-bottom:-1px}
#stripeContent .spv-tab[aria-selected="true"]{color:var(--text);font-weight:600;border-bottom-color:var(--accent)}
#stripeContent .spv-tab .n{display:inline-block;margin-left:6px;font-size:12px;background:var(--s-bad);color:var(--s-bad-on);border-radius:999px;padding:1px 8px;font-weight:700}
#stripeContent .spv-tab .n[hidden]{display:none}
#stripeContent .opd-cards .spv-sc.quiet{grid-column:span 3}
#stripeContent .opd-cards .spv-sc.act{grid-column:span 3}
#stripeContent table.spv-opd{min-width:1120px}
#stripeContent .spv-opd td{vertical-align:top}
#stripeContent .spv-opd th.r{text-align:right}
#stripeContent .spv-opd tr.opd-row.notco td{background:var(--s-bad-bg)}#stripeContent .spv-opd tr.opd-row.nostripe td{background:var(--s-info-bg)}#stripeContent .spv-opd tr.opd-row.wrong td{background:var(--s-warn-bg)}
#stripeContent .spv-opd tr.opd-row.notco td:first-child{box-shadow:inset 5px 0 0 var(--s-bad)}
#stripeContent .opd-cl{font-weight:600}
#stripeContent .opd-cl a.spv-bk{text-decoration:underline;text-decoration-style:solid;cursor:pointer}
#stripeContent .opd-ct{font-size:13.5px;min-width:170px;word-break:break-word}#stripeContent .opd-ct a{color:inherit;text-decoration:underline dotted;text-underline-offset:3px}
#stripeContent .opd-todo{font-size:13.5px;color:var(--muted);max-width:42ch}
@media(max-width:1000px){#stripeContent .opd-cards .spv-sc,#stripeContent .opd-cards .spv-sc.quiet,#stripeContent .opd-cards .spv-sc.act{grid-column:span 6}}
@media(max-width:760px){
#stripeContent .opd-cards .spv-sc,#stripeContent .opd-cards .spv-sc.quiet,#stripeContent .opd-cards .spv-sc.act{grid-column:span 1}
#stripeContent table.spv-opd{min-width:0}
#stripeContent .spv-opd thead{display:none}
#stripeContent .spv-opd,#stripeContent .spv-opd tbody,#stripeContent .spv-opd tr,#stripeContent .spv-opd td{display:block;width:100%}
#stripeContent .spv-opd tr.opd-row{padding:10px 14px 10px 18px;border-bottom:1px solid var(--border)}
#stripeContent .spv-opd tr.opd-row td{border:0;padding:3px 0;text-align:left!important;background:none!important;box-shadow:none!important}
#stripeContent .spv-opd td[data-l]::before{content:attr(data-l) ": ";color:var(--muted2);font-size:12.5px}
#stripeContent .spv-opd tr.opd-row.notco{background:var(--s-bad-bg);box-shadow:inset 5px 0 0 var(--s-bad)}
#stripeContent .spv-opd tr.opd-row.nostripe{background:var(--s-info-bg)}#stripeContent .spv-opd tr.opd-row.wrong{background:var(--s-warn-bg)}
#stripeContent .opd-todo{max-width:none}
}
`;
  document.head.appendChild(st);
}
