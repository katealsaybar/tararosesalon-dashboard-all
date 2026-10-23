// Tool Spend (Kate, 23 Oct 2026). What GoHighLevel, respond.io and Phorest cost: one report each, switched at the top. The lines come from
// one call to tool_spend_report (migrations/tool_spend.sql, Level 3 and above: pages.js holds the level and the function refuses below it
// too). Each line is a payment, invoice or statement row loaded from the three spend sheets of 23 Oct 2026; the sentences under What
// stands out and The one next step are rows in the same table (kind note and action), so they change without a deploy.
//
// Laid out with the Tara Rose learning doctrine (Downloads, "How Adults Learn", Kate 23 Oct 2026): the why before the how (three lines),
// the answer first in one sentence, a month in plain numbers, the chart and the table, what stands out and the questions to ask, the one
// next step (one action, one owner, one date), then the detail folded away. Styles are in tool-spend.css, which reuses the Marketing
// Spend look.
//
// The months shown follow the masthead's Period (Kate: use the global sticky header filter): a month is in view when any day of it falls
// inside the Period, and All time shows every month. The Branch row is hidden here (a tool is not bought per salon). AED is first
// everywhere; each vendor's own currency (USD, USD, EUR) sits beside it. Only paid, invoiced and overdue lines are added up: usage drawn
// from a respond.io balance, unknown months, memos, and notes are shown but never counted.
let tsData = null, tsChart = null;
let tsTool = 'ghl';
try { const s = localStorage.getItem('ts-tool'); if (s === 'ghl' || s === 'respond' || s === 'phorest') tsTool = s; } catch (e) {}

const TS_SUM_KINDS = new Set(['paid', 'invoiced', 'overdue']);
const TS_COL = { teal: '#3AA892', coral: '#E07A5F', slate: '#94A3B8', violet: '#A78BFA', gold: '#D9A441' };
const TS_TOOLS = {
  ghl: {
    name: 'GoHighLevel', sub: 'CRM, tags and automations', cur: 'USD',
    series: [['plan', 'Plan', TS_COL.teal], ['addon', 'Seats and add-ons', TS_COL.violet], ['wallet', 'Wallet', TS_COL.coral]],
    keyOf: l => l.c,
    why: [
      ['What it is', 'Everything we pay HighLevel: the monthly plan, the WhatsApp seats and the prepaid wallet.'],
      ['Why it matters', 'It runs our CRM, tags and automations. A failed payment stops messages as well as the bill.'],
      ['What it changes', 'We know the real monthly cost and who is watching the receipts before the next renewal.'],
    ],
    ask: ['What would we stop paying for if we turned off a feature nobody uses?', 'Who sees the receipt the day a payment fails?'],
    left: [
      '<b>Not in these numbers.</b> The Leaders in Digital retainer has a CRM line. It is billed separately and its scope is not confirmed, so it is not counted as HighLevel cost.',
      '<b>The wallet.</b> Texts, calls, emails and WhatsApp are drawn from the prepaid wallet. Only the top-ups are in the receipts, so what was actually used is not shown.',
      '<b>Dirhams.</b> Each receipt is converted at the rate on the day it was paid. The first three months were discounted. The HighLevel API cannot show billing, so every line is from the Stripe receipts.',
    ],
  },
  respond: {
    name: 'respond.io', sub: 'WhatsApp inbox and blasts', cur: 'USD',
    series: [['plan', 'Plan', TS_COL.teal], ['topup', 'WhatsApp top-ups', TS_COL.coral]],
    keyOf: l => l.c,
    why: [
      ['What it is', 'Every dollar paid into respond.io: the monthly plan and the top-ups for WhatsApp messages.'],
      ['Why it matters', 'When a balance reaches zero, that number stops. The team cannot reply to clients.'],
      ['What it changes', 'Each top-up goes to the balance that is actually running low, and nobody is surprised.'],
    ],
    ask: ['Which branch spends its balance fastest, and is its top-up sized for that?', 'What did our last blast cost per message?'],
    left: [
      '<b>Cash and usage.</b> Cash paid is what left the card: plan invoices and top-ups. Usage is what respond.io drew from the balances in its monthly statements. Usage is not extra cash, and the balance still unused is not spend.',
      '<b>Dirhams.</b> respond.io bills in dollars. The dirham figure uses the rate the company card was charged, which is a little above the bank rate. Plan invoices shown in dollars only are converted at the same rate.',
      '<b>Per message.</b> A WhatsApp marketing message has a small cost each. Meta’s own invoice holds the exact amount.',
    ],
  },
  phorest: {
    name: 'Phorest', sub: 'Salon booking and till system', cur: 'EUR',
    series: [['Saadiyat', 'Saadiyat', TS_COL.teal], ['Khalifa City A', 'Khalifa City A', TS_COL.violet], ['Al Quoz', 'Al Quoz', TS_COL.coral], ['Marasy (closed)', 'Marasy (closed)', TS_COL.slate]],
    keyOf: l => l.b,
    why: [
      ['What it is', 'What Phorest invoiced each branch from May 2021: the monthly fee per location, and SMS.'],
      ['Why it matters', 'We are moving to Zenoti. This is the cost we are leaving and the bill still open.'],
      ['What it changes', 'We decide on the overdue invoices and the exit date with the whole cost in front of us.'],
    ],
    ask: ['What do we still need Phorest for after the move, and for how long?', 'Which months are missing, and who can get them from the Invoice Portal?'],
    left: [
      '<b>Invoiced is not paid.</b> These are Phorest’s invoices. Only the company card statements can prove a payment was taken.',
      '<b>Not in these numbers.</b> Motor City, whose invoices are not in the inbox; the months with no invoice email, listed below; Technology People, the old Shortcuts reseller, for SMS and software in 2021; and the app developer fee, which was paid outside Phorest.',
      '<b>Contract.</b> Free setup and training, a 12 month minimum, then auto renew. The length of the notice period was not found.',
      '<b>Dirhams.</b> Each invoice is converted at the euro rate on its invoice date, so the same monthly fee is a different dirham figure each month.',
    ],
  },
};

const tsEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tsNum = v => Math.round(Number(v) || 0).toLocaleString('en-GB');
const tsAed = v => 'AED ' + tsNum(v);
const tsNat = (cur, v) => (cur === 'USD' ? '$' : 'EUR ') + tsNum(v);
const tsMonth = mo => new Date(mo.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
const tsIso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const tsLastDay = mo => { const d = new Date(mo.slice(0, 10) + 'T00:00:00'); return tsIso(new Date(d.getFullYear(), d.getMonth() + 1, 0)); };
const tsDay = s => new Date(s.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

// The masthead Period as { from, to } (ISO days), or null for All time (or before the window is known).
function tsWindow() {
  try {
    if (typeof activePeriodKey === 'function' && activePeriodKey() === 'All time') return null;
    if (typeof dateFrom !== 'undefined' && dateFrom && dateTo) return { from: tsIso(dateFrom), to: tsIso(dateTo) };
  } catch (e) {}
  return null;
}
const tsInView = (mo, w) => !w || (mo.slice(0, 10) <= w.to && tsLastDay(mo) >= w.from);

// A Branch or Period change redraws from the data already loaded (dashboard.js NOPULSE_REDRAW).
function tsRefresh() {
  const el = document.getElementById('toolSpendContent');
  if (tsData && el) { tsPaint(el); return Promise.resolve(); }
  return renderToolSpend();
}
function tsPick(k) {
  tsTool = k;
  try { localStorage.setItem('ts-tool', k); } catch (e) {}
  const el = document.getElementById('toolSpendContent');
  if (tsData && el) tsPaint(el);
}

async function renderToolSpend() {
  const el = document.getElementById('toolSpendContent');
  if (!el) return;
  el.innerHTML = '<p class="slv-muted">Loading Tool Spend…</p>';
  try { if (window.trsWindowReady) await window.trsWindowReady; } catch (e) {}
  try {
    const { data, error } = await sb.rpc('tool_spend_report');
    if (error || !data) throw error || new Error('no data');
    tsData = data;
  } catch (e) {
    console.error(e);
    el.innerHTML = '<p class="slv-muted">Tool Spend didn’t load. Refresh to try again.</p>';
    return;
  }
  tsPaint(el);
  tsAllTime();
}

// The payments go back to 2021 and a month is not much to read, so the first time the page opens in a visit it asks for the masthead's
// All time (as Client Complaints does); the Period chips are the toggle after that. The chip's own redraw comes back through tsRefresh.
let tsAllTimeDone = false;
function tsAllTime() {
  if (tsAllTimeDone) return;
  tsAllTimeDone = true;
  const chip = document.querySelector('#periodChips .chip[data-v="All time"]');
  if (chip && !chip.disabled && chip.getAttribute('aria-pressed') !== 'true') chip.click();
}

// The lines of one tool, grouped by month for the months in view. Only paid, invoiced and overdue lines are added up.
function tsMonths(tool, w) {
  const T = TS_TOOLS[tool], by = new Map();
  for (const l of tsData.lines) {
    if (l.t !== tool || !l.n || !TS_SUM_KINDS.has(l.k) || !tsInView(l.mo, w)) continue;
    const key = l.mo.slice(0, 10);
    const m = by.get(key) || { mo: key, aed: 0, u: 0, s: {}, overdue: 0, items: {} };
    const sk = T.keyOf(l) || 'other';
    m.aed += Number(l.a) || 0; m.u += Number(l.u) || 0;
    m.s[sk] = m.s[sk] || { aed: 0, u: 0 };
    m.s[sk].aed += Number(l.a) || 0; m.s[sk].u += Number(l.u) || 0;
    if (l.k === 'overdue') m.overdue += Number(l.u) || 0;
    const it = (l.i || '').replace(/^Plan: /, '');
    m.items[it] = (m.items[it] || 0) + (Number(l.u) || 0);
    by.set(key, m);
  }
  return [...by.values()].sort((a, b) => (a.mo < b.mo ? -1 : 1));
}

function tsPaint(el) {
  const w = tsWindow(), T = TS_TOOLS[tsTool];
  const rows = tsMonths(tsTool, w);
  const all = tsData.lines.filter(l => l.t === tsTool);
  const spendAed = rows.reduce((a, r) => a + r.aed, 0), spendU = rows.reduce((a, r) => a + r.u, 0);
  const nMonths = rows.length;
  const share = key => { const s = rows.reduce((a, r) => a + ((r.s[key] || {}).aed || 0), 0); return spendAed ? Math.round(100 * s / spendAed) : 0; };
  const sumU = key => rows.reduce((a, r) => a + ((r.s[key] || {}).u || 0), 0);
  const sumA = key => rows.reduce((a, r) => a + ((r.s[key] || {}).aed || 0), 0);
  const plural = (n, w1) => n + ' ' + w1 + (n === 1 ? '' : 's');
  const num = (v, t) => t;   // the shared count-up.js counts the big numbers when a section opens

  // ── The three tabs, each with its own headline for the months in view.
  const tabs = Object.keys(TS_TOOLS).map(k => {
    const a = tsMonths(k, w).reduce((s, r) => s + r.aed, 0);
    return `<button type="button" class="ts-tab" role="tab" aria-selected="${k === tsTool}" onclick="tsPick('${k}')">
        <span class="ts-tab-n">${tsEsc(TS_TOOLS[k].name)}</span><span class="ts-tab-s">${tsEsc(TS_TOOLS[k].sub)}</span>
        <span class="ts-tab-v">${tsAed(a)}</span></button>`;
  }).join('');
  // The three tools added together for the same months (dirhams only: dollars and euros do not add).
  const parts = Object.keys(TS_TOOLS).map(k => ({ k, aed: tsMonths(k, w).reduce((s, r) => s + r.aed, 0) }));
  const grand = parts.reduce((a, x) => a + x.aed, 0);
  const pctOf = v => (grand ? Math.round(100 * v / grand) : 0);
  const grandCard = grand > 0 ? `<section class="slv-card ts-grand">
      <div class="ts-eyebrow">All three together</div>
      <div class="ts-answer">We have spent <b>${tsAed(grand)}</b> on GoHighLevel, respond.io and Phorest in these dates.</div>
      <div class="ts-stats">
        <div class="ts-stat"><div class="ts-stat-l">Grand total</div><div class="ts-stat-v">${tsAed(grand)}</div><div class="ts-stat-n">All three tools</div></div>
        ${parts.map(x => `<div class="ts-stat"><div class="ts-stat-l">${tsEsc(TS_TOOLS[x.k].name)}</div><div class="ts-stat-v">${tsAed(x.aed)}</div><div class="ts-stat-n">${pctOf(x.aed)}% of the total</div></div>`).join('')}
      </div>
      <p class="ts-sub" style="margin:10px 0 0">GoHighLevel and respond.io are what was paid. Phorest is what it invoiced, so that part is a floor: Motor City and the months with no invoice are not in it. The three tabs below show each one.</p>
    </section>` : '';
  const head = `<section class="slv-intro">
      <h2>Tool Spend</h2>
      <p>What GoHighLevel, respond.io and Phorest cost us, one report each. Shows every month that falls in the Period at the top, in dirhams first.</p>
    </section>
    ${grandCard}
    <div class="ts-tabs" role="tablist" aria-label="Choose a report">${tabs}</div>`;

  // ── 1. The why, in three lines.
  const why = `<div class="ts-why">${T.why.map(([t, b], i) => `<div class="ts-why-i"><div class="ts-why-n">0${i + 1}</div><div class="ts-why-t">${tsEsc(t)}</div><div class="ts-why-b">${tsEsc(b)}</div></div>`).join('')}</div>`;

  // ── 2. The answer, then four numbers.
  let answer = '', stats = [];
  const last = rows[rows.length - 1];
  if (!rows.length) {
    answer = `No ${tsEsc(T.name)} payments in these dates. Change the Period at the top.`;
  } else if (tsTool === 'ghl') {
    answer = `We have paid HighLevel <b>${tsAed(spendAed)}</b> (<b>${tsNat('USD', spendU)}</b>) over ${plural(nMonths, 'month')}. About <b>${share('plan')}%</b> of it is the monthly plan.`;
    stats = [['Paid', num(spendAed, tsAed(spendAed)), tsNat('USD', spendU) + ' in ' + plural(nMonths, 'month')],
      ['Plan', num(sumA('plan'), tsAed(sumA('plan'))), share('plan') + '% of the total, ' + tsNat('USD', sumU('plan'))],
      ['Average a month', num(spendAed / nMonths, tsAed(spendAed / nMonths)), tsNat('USD', spendU / nMonths) + ' a month'],
      ['Wallet top-ups', num(sumA('wallet'), tsAed(sumA('wallet'))), share('wallet') + '% of the total, ' + tsNat('USD', sumU('wallet'))]];
  } else if (tsTool === 'respond') {
    answer = `We have paid respond.io <b>${tsAed(spendAed)}</b> over ${plural(nMonths, 'month')}. <b>${share('plan')}%</b> of it is the plan. The rest is WhatsApp top-ups.`;
    const bal = all.filter(l => l.k === 'balance');
    const balU = bal.reduce((a, l) => a + (Number(l.u) || 0), 0), balA = bal.reduce((a, l) => a + (Number(l.a) || 0), 0);
    const planMo = rows.filter(r => (r.s.plan || {}).aed > 0).pop();
    stats = [['Cash paid', num(spendAed, tsAed(spendAed)), tsNat('USD', spendU) + ' in ' + plural(nMonths, 'month')],
      ['Plan', num(sumA('plan'), tsAed(sumA('plan'))), planMo ? tsAed(planMo.s.plan.aed) + ' in ' + tsMonth(planMo.mo) : share('plan') + '% of the total'],
      ['WhatsApp top-ups', num(sumA('topup'), tsAed(sumA('topup'))), tsNat('USD', sumU('topup')) + ' put into the two balances'],
      ['Unused in the balances', bal.length ? num(balA, tsAed(balA)) : '–', bal.length ? tsNat('USD', balU) + ', as of ' + tsDay(bal[0].d || bal[0].mo) : '']];
  } else {
    const od = all.filter(l => l.k === 'overdue'), odU = od.reduce((a, l) => a + (Number(l.u) || 0), 0), odA = od.reduce((a, l) => a + (Number(l.a) || 0), 0);
    const fee = all.filter(l => l.c === 'fee' && TS_SUM_KINDS.has(l.k) && Number(l.u) >= 100).pop();
    const unk = new Set(all.filter(l => l.k === 'unknown').map(l => l.mo + '|' + l.b)).size;
    answer = `Phorest has invoiced <b>${tsNat('EUR', spendU)}</b>, about <b>${tsAed(spendAed)}</b>, in these dates. That is a floor, not the whole bill: Motor City and the months with no invoice are not in it.`;
    stats = [['Invoiced', num(spendAed, tsAed(spendAed)), tsNat('EUR', spendU) + ' in ' + plural(nMonths, 'month')],
      ['Overdue now', od.length ? num(odA, tsAed(odA)) : '–', od.length ? tsNat('EUR', odU) + ', ' + plural(od.filter(l => l.c === 'fee').length, 'invoice') : 'Nothing overdue'],
      ['Fee per location', fee ? num(Number(fee.a), tsAed(fee.a)) : '–', fee ? tsNat('EUR', fee.u) + ' a month, at the ' + tsMonth(fee.mo) + ' rate' : ''],
      ['Months with no invoice', unk ? num(unk, tsNum(unk)) : '0', unk ? 'branch months the inbox does not hold' : '']];
  }
  const answerCard = `<section class="slv-card">
      <div class="ts-eyebrow">The answer</div>
      <div class="ts-answer">${answer}</div>
      ${stats.length ? `<div class="ts-stats">${stats.map(([l, v, n]) => `<div class="ts-stat"><div class="ts-stat-l">${tsEsc(l)}</div><div class="ts-stat-v">${v}</div><div class="ts-stat-n">${tsEsc(n)}</div></div>`).join('')}</div>` : ''}
    </section>`;
  if (!rows.length) { el.innerHTML = head + why + answerCard; return; }

  // ── 3. A month in plain numbers.
  let example = '';
  const eq = parts => `<div class="ts-eqn">${parts.join('<span class="ts-op">+</span>')}</div>`;
  const chip = (b, t) => `<span class="ts-chip"><b>${b}</b> ${tsEsc(t)}</span>`;
  if (tsTool === 'ghl') {
    const m = rows.filter(r => (r.s.plan || {}).aed > 0 && r.mo !== (tsData.as_of || '').slice(0, 7) + '-01').pop() || last;
    const cats = [['plan', 'plan'], ['addon', 'seats and add-ons'], ['wallet', 'wallet top-ups']].filter(([k]) => (m.s[k] || {}).u > 0);
    example = `<h3 class="ts-h">A month in plain numbers</h3>
      <p class="ts-sub">${tsMonth(m.mo)} cost <b>${tsNat('USD', m.u)}</b>, <b>${tsAed(m.aed)}</b>. It was ${cats.length} thing${cats.length === 1 ? '' : 's'} on one card:</p>
      ${eq(cats.map(([k, t]) => chip(tsNat('USD', m.s[k].u), t)))}
      <p class="ts-sub">The wallet is prepaid credit. Texts, calls, emails and WhatsApp are drawn from it, so the receipts show the top-ups and not what was used.</p>`;
  } else if (tsTool === 'respond') {
    const m = rows.filter(r => (r.s.plan || {}).aed > 0).pop() || last;
    const items = Object.entries(m.items).filter(([k, v]) => !/^Top up/.test(k) && v !== 0);
    example = `<h3 class="ts-h">A month in plain numbers</h3>
      <p class="ts-sub">The plan is the same every month, whether we send a message or not. In ${tsMonth(m.mo)} it was <b>${tsNat('USD', (m.s.plan || {}).u || 0)}</b>, <b>${tsAed((m.s.plan || {}).aed || 0)}</b>:</p>
      ${eq(items.map(([k, v]) => chip(tsNat('USD', v), k.replace(/ \(flat fee\)/, '').replace(/^Growth subscription$/, 'Growth plan').replace(/^MAC add-on$/, 'active contacts fee'))))}
      <p class="ts-sub">Messages are extra: each one we send is paid for from a top-up.</p>`;
  } else {
    const m = rows.filter(r => r.mo >= '2022-07-01').pop() || last;
    const locs = Object.keys(m.s).filter(k => m.s[k].u >= 100);
    const per = locs.length ? m.s[locs[0]].u : 0, perA = locs.length ? m.s[locs[0]].aed : 0;
    example = `<h3 class="ts-h">One location, one month</h3>
      <p class="ts-sub">Every location pays the same monthly fee, plus a little SMS. In ${tsMonth(m.mo)} it was <b>${tsNat('EUR', per)}</b> each, about <b>${tsAed(perA)}</b>:</p>
      ${eq(locs.map(k => chip(tsNat('EUR', m.s[k].u), k)))}
      <p class="ts-sub">${locs.length} locations pay it now, so about ${tsNat('EUR', per * locs.length)} a month, ${tsNat('EUR', per * locs.length * 12)} a year, about ${tsAed(perA * locs.length * 12)}.</p>`;
  }
  const exampleCard = `<section class="slv-card ts-sec">${example}</section>`;

  // ── Respond.io only: the two balances today.
  let balCard = '';
  if (tsTool === 'respond') {
    const bal = all.filter(l => l.k === 'balance');
    if (bal.length) {
      const topAll = b => all.filter(l => l.k === 'paid' && l.c === 'topup' && l.b === b).reduce((a, l) => a + (Number(l.u) || 0), 0);
      const names = { Saadiyat: ['Tara Rose Salon SA', 'Saadiyat only'], Shared: ['Tara Rose Salon & Fratelli Barbershop', 'Khalifa City A, Motor City, Al Quoz'] };
      balCard = `<section class="slv-card ts-sec">
        <div class="ts-eyebrow">The two balances</div>
        <h3 class="ts-h">What is left to send with</h3>
        <p class="ts-sub">Two WhatsApp numbers, two separate balances. A top-up goes to one of them, so say which.</p>
        <div class="slv-wrap"><table class="slv-table">
          <thead><tr><th>Balance</th><th>Branches</th><th>Unused (AED)</th><th>Unused (USD)</th><th>Top-ups to date (USD)</th></tr></thead>
          <tbody>${bal.map(l => `<tr><td>${tsEsc((names[l.b] || [l.i])[0])}</td><td>${tsEsc((names[l.b] || ['', ''])[1])}</td><td><b>${tsNum(l.a)}</b></td><td>${Number(l.u).toFixed(2)}</td><td>${tsNum(topAll(l.b))}</td></tr>`).join('')}</tbody></table></div>
        <p class="ts-sub" style="margin:8px 0 0">As of ${tsEsc(tsDay(bal[0].d || bal[0].mo))}.</p>
      </section>`;
    }
  }

  // ── Chart and table.
  const cols = T.series;
  const body = rows.slice().reverse().map(r => `<tr>
      <td>${tsEsc(tsMonth(r.mo))}${r.overdue ? '<div class="ts-pill risk">overdue</div>' : ''}</td>
      ${cols.map(([k]) => `<td>${(r.s[k] || {}).u ? tsNum(r.s[k].u) : '–'}</td>`).join('')}
      <td><b>${tsNum(r.u)}</b></td><td><b>${tsNum(r.aed)}</b></td></tr>`).join('');
  const unitHead = T.cur === 'USD' ? 'USD' : 'EUR';
  const colSum = k => rows.reduce((a, r) => a + ((r.s[k] || {}).u || 0), 0);
  const totalRow = `<tr class="ts-total"><td><b>Total</b></td>${cols.map(([k]) => `<td><b>${colSum(k) ? tsNum(colSum(k)) : '–'}</b></td>`).join('')}<td><b>${tsNum(spendU)}</b></td><td><b>${tsNum(spendAed)}</b></td></tr>`;
  const chartCard = `<section class="slv-card ts-sec">
      <div class="ts-eyebrow">Month by month</div>
      <h3 class="ts-h">What we paid, by month</h3>
      <div class="mk-chart-head">
        <div class="slv-eyebrow">Dirhams by month${tsTool === 'phorest' ? ', by branch' : ''}</div>
        <span class="w13-skey" aria-label="Chart key">${cols.map(([, n, c]) => `<span><i class="bar" style="background:${c}"></i>${tsEsc(n)}</span>`).join('')}</span>
      </div>
      <div style="position:relative;height:300px"><canvas id="tsCanvas"></canvas></div>
    </section>`;
  const tableCard = `<details class="ts-more">
      <summary>Every month in a table (${plural(nMonths, 'month')})</summary>
      <div class="ts-more-b"><div class="slv-wrap"><table class="slv-table">
        <thead><tr><th>Month</th>${cols.map(([, n]) => `<th>${tsEsc(n)} (${unitHead})</th>`).join('')}<th>Total (${unitHead})</th><th>Total (AED)</th></tr></thead>
        <tbody>${body}${totalRow}</tbody></table></div></div>
    </details>`;

  // ── What stands out (the notes are rows in the table) and the questions to ask.
  const notes = all.filter(l => l.k === 'note').sort((a, b) => ['risk', 'watch', 'fine'].indexOf(a.c) - ['risk', 'watch', 'fine'].indexOf(b.c));
  const pill = { risk: ['risk', 'Risk'], watch: ['watch', 'Watch'], fine: ['ok', 'Fine'] };
  const bullets = [];
  if (rows.length > 2) {
    const hi = rows.reduce((a, r) => (r.aed > a.aed ? r : a));
    bullets.push(`The dearest month was <b>${tsMonth(hi.mo)}</b> at ${tsAed(hi.aed)}${last && hi.mo === last.mo ? ' so far' : ''}.`);
  }
  const standCard = `<section class="slv-card ts-sec">
      <div class="ts-two">
        <div><div class="ts-eyebrow">What stands out</div><h3 class="ts-h">In plain words</h3>
          <ul class="ts-notes">${notes.map(n => `<li><span class="ts-pill ${pill[n.c][0]}">${pill[n.c][1]}</span><span>${tsEsc(n.i)}</span></li>`).join('')}${bullets.map(b => `<li><span class="ts-pill ok">Fact</span><span>${b}</span></li>`).join('')}</ul></div>
        <div class="ts-ask"><h4>Questions to ask the team</h4>
          <ul class="ts-list">${T.ask.map(q => `<li>${tsEsc(q)}</li>`).join('')}</ul></div>
      </div>
    </section>`;

  // ── The one next step.
  const act = all.find(l => l.k === 'action');
  const asOf = (tsData.as_of || tsIso(new Date())).slice(0, 10);
  const actionCard = act ? `<section class="ts-action">
      <div class="ts-eyebrow">The one next step</div>
      <p class="ts-do">${tsEsc(act.i)}</p>
      <div class="ts-who"><span><b>Owner</b> ${tsEsc(act.o || '')}</span><span><b>By</b> ${act.due ? tsEsc(tsDay(act.due)) : ''}${act.due && act.due.slice(0, 10) < asOf ? ' <span class="ts-pill risk">date passed</span>' : ''}</span></div>
    </section>` : '';

  // ── The detail: by year, the months we do not have, what is left out.
  const yr = {};
  rows.forEach(r => { const k = r.mo.slice(0, 4); yr[k] = yr[k] || { u: 0, aed: 0, s: {} }; yr[k].u += r.u; yr[k].aed += r.aed; cols.forEach(([c]) => { yr[k].s[c] = (yr[k].s[c] || 0) + ((r.s[c] || {}).u || 0); }); });
  const yrBody = Object.keys(yr).map(k => `<tr><td>${k}</td>${cols.map(([c]) => `<td>${yr[k].s[c] ? tsNum(yr[k].s[c]) : '–'}</td>`).join('')}<td><b>${tsNum(yr[k].u)}</b></td><td><b>${tsNum(yr[k].aed)}</b></td></tr>`).join('');
  const yrTotal = `<tr class="ts-total"><td><b>Total</b></td>${cols.map(([c]) => `<td><b>${colSum(c) ? tsNum(colSum(c)) : '–'}</b></td>`).join('')}<td><b>${tsNum(spendU)}</b></td><td><b>${tsNum(spendAed)}</b></td></tr>`;
  let unknownNote = '';
  const unk = all.filter(l => l.k === 'unknown');
  if (tsTool === 'phorest' && unk.length) {
    const ms = [...new Set(unk.map(l => l.mo.slice(0, 10)))].sort();
    unknownNote = `<li><b>Months with no invoice email (${unk.length} branch months).</b> ${ms.map(m => tsMonth(m)).join(', ')}. These need the Phorest Invoice Portal.</li>`;
  } else if (unk.length) {
    unknownNote = `<li><b>Not found.</b> ${unk.map(l => tsEsc(l.i)).join(' ')}</li>`;
  }
  const usedA = all.filter(l => l.k === 'used').reduce((a, l) => a + (Number(l.a) || 0), 0), usedU = all.filter(l => l.k === 'used').reduce((a, l) => a + (Number(l.u) || 0), 0);
  const usedNote = tsTool === 'respond' && usedU ? `<li><b>Drawn from the balances.</b> Monthly usage statements add up to ${tsNat('USD', usedU)}, about ${tsAed(usedA)}, since Oct 2024. That is paid from the top-ups above and is not counted again.</li>` : '';
  const fine = `<details class="ts-more">
      <summary>Totals by year, and what is and is not in these numbers</summary>
      <div class="ts-more-b">
        <div class="slv-wrap"><table class="slv-table">
          <thead><tr><th>Year</th>${cols.map(([, n]) => `<th>${tsEsc(n)} (${unitHead})</th>`).join('')}<th>Total (${unitHead})</th><th>Total (AED)</th></tr></thead>
          <tbody>${yrBody}${yrTotal}</tbody></table></div>
        <ul class="slv-notes" style="margin:12px 0 0;padding-left:18px;line-height:1.55">${T.left.map(x => `<li>${x}</li>`).join('')}${usedNote}${unknownNote}</ul>
      </div>
    </details>`;

  el.innerHTML = head + why + answerCard + exampleCard + balCard + chartCard + standCard + actionCard + tableCard + fine;
  tsDraw(rows, T);
}

function tsDraw(rows, T) {
  if (tsChart) { tsChart.destroy(); tsChart = null; }
  const cv = document.getElementById('tsCanvas');
  if (!cv || !window.Chart) return;
  const css = getComputedStyle(document.documentElement);
  const muted = css.getPropertyValue('--muted').trim(), border = css.getPropertyValue('--border').trim();
  tsChart = new Chart(cv, {
    type: 'bar',
    data: {
      labels: rows.map(r => new Date(r.mo + 'T00:00:00').toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })),
      datasets: T.series.map(([k, n, c], i) => ({ label: n, data: rows.map(r => Math.round((r.s[k] || {}).aed || 0)), backgroundColor: c, stack: 's', maxBarThickness: 48, borderRadius: i === T.series.length - 1 ? 4 : 0 })),
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `${c.dataset.label}: AED ${Number(c.raw).toLocaleString('en-GB')}` } } },
      scales: {
        x: { stacked: true, ticks: { color: muted, autoSkip: true, maxRotation: 0 }, grid: { display: false } },
        y: { stacked: true, beginAtZero: true, grace: '10%', ticks: { color: muted }, grid: { color: border } },
      },
    },
  });
}

function tsRedrawForTheme() {
  const v = document.getElementById('view-toolspend');
  if (v && v.style.display !== 'none' && tsData) tsPaint(document.getElementById('toolSpendContent'));
}
