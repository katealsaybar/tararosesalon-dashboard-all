// Marketing Spend (Kate, 23 Oct 2026). What Google ads, Meta ads, the agency (Leaders in Digital) and the WhatsApp and CRM tools cost each
// month, beside the new clients the salons got: the CAC (what winning a new client costs) and the LTV (what a new client is worth in their
// first year). One call to marketing_spend_report (migrations/marketing_spend*.sql). Level 3 and above: pages.js holds the level and the
// function refuses below it too.
//
// Laid out with the Tara Rose learning doctrine (Downloads, "How Adults Learn", Kate 23 Oct 2026: "ui improvement through this"): the why
// before the how (three lines), the answer first in one sentence, a place to try it (what counts as cost: ads only, plus the agency, plus
// the tools, and the CAC moves as you pick), the sums one step at a time with the live numbers, what stands out in plain words and the
// questions to ask, then the chart and the table, then the fine print folded away. Styles are in marketing-spend.css.
//
// The months shown follow the masthead's Period (Kate, 23 Oct 2026: "use the global sticky header filter"): a month is in view when any
// day of it falls inside the Period, and All time shows every month. The Branch row is hidden here (ads are not bought per salon).
// A month's CAC needs Meta running through it (the Drive invoices start 25 Sep 2025), the agency's invoice in and the clients counted;
// otherwise it shows a dash. Content, influencers, commissions and staff time are not in it.
//
// Borrows the Products page's card and table styles (slv-*), like google-ads.js.
let mspendData = null, mspendChart = null;
let mspendDef = 'all';      // what counts as cost: 'ads', 'agency' or 'all'
let mspendCounted = false;  // the numbers count up once, the first time they are drawn
let mspendFiles = [];       // the invoice PDFs (marketing_invoice_files), kept in the private bucket marketing-invoices

const MSPEND_META_FULL_FROM = '2025-10-01';   // the first month with Meta spend all the way through (Drive starts 25 Sep 2025)
const MSPEND_DEFS = [
  { k: 'ads', label: 'Ads only', sub: 'Google + Meta' },
  { k: 'agency', label: 'Ads and the agency', sub: 'adds Leaders in Digital' },
  { k: 'all', label: 'Everything we can measure', sub: 'adds respond.io and GoHighLevel' },
];
const mspendEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mspendNum = v => Math.round(Number(v) || 0).toLocaleString('en-GB');
const mspendAed = v => 'AED ' + mspendNum(v);
const mspendMonth = mo => new Date(mo + 'T00:00:00').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
const mspendIso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const mspendLastDay = mo => { const d = new Date(mo + 'T00:00:00'); return mspendIso(new Date(d.getFullYear(), d.getMonth() + 1, 0)); };
// '2025-01 to 2025-09' as 'Jan to Sep 2025'.
const mspendCohort = c => {
  const m = /^(\d{4})-(\d\d) to (\d{4})-(\d\d)$/.exec(c || '');
  if (!m) return c || '';
  const mon = (y, n) => new Date(Number(y), Number(n) - 1, 1).toLocaleDateString('en-GB', { month: 'short' });
  return m[1] === m[3] ? `${mon(m[1], m[2])} to ${mon(m[3], m[4])} ${m[1]}` : `${mon(m[1], m[2])} ${m[1]} to ${mon(m[3], m[4])} ${m[3]}`;
};

// The masthead Period as { from, to } (ISO days), or null for All time (or before the window is known).
function mspendWindow() {
  try {
    if (typeof activePeriodKey === 'function' && activePeriodKey() === 'All time') return null;
    if (typeof dateFrom !== 'undefined' && dateFrom && dateTo) return { from: mspendIso(dateFrom), to: mspendIso(dateTo) };
  } catch (e) {}
  return null;
}

// A Branch or Period change redraws from the data already loaded (dashboard.js NOPULSE_REDRAW).
function mspendRefresh() {
  const el = document.getElementById('marketingSpendContent');
  if (mspendData && el) { mspendPaint(el); return Promise.resolve(); }
  return renderMarketingSpend();
}

function mspendSetDef(k) {
  mspendDef = k;
  const el = document.getElementById('marketingSpendContent');
  if (mspendData && el) mspendPaint(el);
}

async function renderMarketingSpend() {
  const el = document.getElementById('marketingSpendContent');
  if (!el) return;
  el.innerHTML = '<p class="slv-muted">Loading Marketing Spend…</p>';
  // The Period is only known once the dashboard has worked out its window (a direct link can open this page first).
  try { if (window.trsWindowReady) await window.trsWindowReady; } catch (e) {}
  try {
    const [rep, files] = await Promise.all([sb.rpc('marketing_spend_report'), sb.rpc('marketing_invoice_files')]);
    if (rep.error || !rep.data) throw rep.error || new Error('no data');
    mspendData = rep.data;
    mspendFiles = (files && !files.error && Array.isArray(files.data) ? files.data : []).map((f, i) => ({ ...f, i }));   // the page works without the list
  } catch (e) {
    console.error(e);
    el.innerHTML = '<p class="slv-muted">Marketing Spend didn’t load. Refresh to try again.</p>';
    return;
  }
  mspendPaint(el);
}

// The months in view, each with its spend under the three definitions and whether it has a CAC.
function mspendRows() {
  const now = new Date(), cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const all = (mspendData.months || []).map(m => {
    const google = Number(m.google) || 0, meta = Number(m.meta) || 0, nc = Number(m.new_clients) || 0;
    const agency = m.agency === null || m.agency === undefined ? null : Number(m.agency);
    const metaFull = m.mo >= MSPEND_META_FULL_FROM;
    const other = m.other === null || m.other === undefined ? 0 : Number(m.other);
    const by = { ads: google + meta, agency: google + meta + (agency || 0), all: google + meta + (agency || 0) + other };
    const priced = metaFull && agency !== null && nc > 0;   // a CAC needs Meta through the month, the agency's invoice in, and the clients counted
    return { ...m, google, meta, agency, other, nc, by, total: by.all, metaFull, priced, partial: m.mo === cur };
  });
  // Months before any ad spend was recorded add nothing to look at.
  const from = all.findIndex(r => r.total > 0);
  const live = from < 0 ? [] : all.slice(from);
  const w = mspendWindow();
  return w ? live.filter(r => r.mo <= w.to && mspendLastDay(r.mo) >= w.from) : live;
}

const mspendCacOf = (r, k) => (r.priced ? r.by[k] / r.nc : null);

function mspendPaint(el) {
  const d = mspendData, rows = mspendRows(), ltv = d.ltv || {};
  const priced = rows.filter(r => r.priced);
  const pNew = priced.reduce((a, r) => a + r.nc, 0);
  const year1 = Number(ltv.avg_net_12m) || null;
  const defs = MSPEND_DEFS.map(df => {
    const spend = priced.reduce((a, r) => a + r.by[df.k], 0);
    const cac = pNew ? spend / pNew : null;
    return { ...df, spend, cac, ratio: cac && year1 ? year1 / cac : null };
  });
  const pick = defs.find(x => x.k === mspendDef) || defs[2];
  const cac = pick.cac, ratio = pick.ratio;
  const spendAll = rows.reduce((a, r) => a + r.by[pick.k], 0);
  const ceiling = year1 ? year1 / 3 : null;
  const nMonths = n => n + ' month' + (n === 1 ? '' : 's');
  const hasOther = rows.some(r => r.other > 0);

  const s = d.sync;
  const stale = !s || !s.last_ok_at || (Date.now() - new Date(s.last_ok_at).getTime()) > 36 * 3600e3;
  const synced = s && s.last_ok_at ? new Date(s.last_ok_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null;

  // ── 1. The why, in three lines.
  const why = `<div class="ms-why">
      <div class="ms-why-i"><div class="ms-why-n">01</div><div class="ms-why-t">Why this page</div><div class="ms-why-b">Marketing is one of the biggest things we pay for. This shows what it buys: new clients.</div></div>
      <div class="ms-why-i"><div class="ms-why-n">02</div><div class="ms-why-t">Why now</div><div class="ms-why-b">The agency came off in October, so this is the first month we can read without its fee.</div></div>
      <div class="ms-why-i"><div class="ms-why-n">03</div><div class="ms-why-t">What it changes</div><div class="ms-why-b">The next dirham goes where a client really costs least, decided from numbers and not a feeling.</div></div>
    </div>`;

  // ── 2. The answer, then the four numbers and the picture.
  const answer = cac !== null && year1
    ? `Winning a new client costs about <b>${mspendAed(cac)}</b>. A new client spends about <b>${mspendAed(year1)}</b> in their first year. That is <b class="${ratio >= 3 ? '' : 'ms-bad'}">${ratio.toFixed(1)} to 1</b>, ${ratio >= 3 ? 'above' : 'below'} the 3 to 1 target.`
    : 'There is no CAC for these dates yet: no month in view has Meta, the agency’s invoice and the new clients all in. Pick a longer Period at the top.';
  const num = (v, f, text) => `<span class="ms-count" data-v="${v}" data-f="${f}">${text}</span>`;
  const stats = `<div class="ms-stats">
      <div class="ms-stat"><div class="ms-stat-l">Marketing spend</div><div class="ms-stat-v">${num(spendAll, 'aed', mspendAed(spendAll))}</div><div class="ms-stat-n">${mspendEsc(pick.label.toLowerCase())}, ${nMonths(rows.length)}</div></div>
      <div class="ms-stat"><div class="ms-stat-l">CAC</div><div class="ms-stat-v">${cac !== null ? num(cac, 'aed', mspendAed(cac)) : '–'}</div><div class="ms-stat-n">Cost to win one new client</div></div>
      <div class="ms-stat"><div class="ms-stat-l">LTV</div><div class="ms-stat-v">${year1 ? num(year1, 'aed', mspendAed(year1)) : '–'}</div><div class="ms-stat-n">What a new client spends in their first 12 months</div></div>
      <div class="ms-stat"><div class="ms-stat-l">LTV ÷ CAC</div><div class="ms-stat-v">${ratio ? num(ratio, 'ratio', ratio.toFixed(1) + ' to 1') : '–'}</div><div class="ms-stat-n">3 to 1 or better is the target</div></div>
    </div>`;
  const pct = cac !== null && year1 ? Math.min(100, 100 * cac / year1) : 0;
  const picture = cac !== null && year1 ? `<div class="ms-pic">
      <div class="ms-pic-t">The picture: what it costs to win a client, against what that client goes on to spend.</div>
      <div class="ms-track" role="img" aria-label="CAC ${mspendAed(cac)} against LTV ${mspendAed(year1)}"><div class="ms-cost" style="width:${pct.toFixed(1)}%"></div><div class="ms-ceil" style="left:33.33%"><span>3 to 1 limit ${mspendAed(ceiling)}</span></div></div>
      <div class="ms-pic-k"><span><i style="background:var(--ms-coral)"></i>CAC, ${mspendAed(cac)}</span><span><i style="background:color-mix(in srgb,var(--ms-teal) 40%,transparent)"></i>LTV, the whole bar, ${mspendAed(year1)}</span></div>
      <p class="ms-sub" style="margin:10px 0 0">Read it with care: CAC divides by every new client, including the many who came without an ad (a friend, walking past, a Google search), so it is a low number. It is what marketing costs per client we win, not what a client who came from an ad costs.</p>
    </div>` : '';
  const answerCard = `<section class="slv-card">
      <div class="ms-eyebrow">The answer</div>
      <div class="ms-answer">${answer}</div>
      ${rows.length ? stats + picture : '<p class="slv-muted">No marketing spend in these dates. Change the Period at the top.</p>'}
    </section>`;
  if (!rows.length) { el.innerHTML = `<section class="slv-intro"><h2>Marketing Spend</h2></section>${why}${answerCard}`; return; }

  // ── 3. Try it: what counts as cost.
  const maxCac = Math.max(...defs.map(x => x.cac || 0), 1);
  const rungs = defs.map(x => `<button type="button" class="ms-rung" role="radio" aria-checked="${x.k === pick.k}" onclick="mspendSetDef('${x.k}')">
        <span class="ms-rung-l">${mspendEsc(x.label)}<span class="ms-rung-s">${mspendEsc(x.sub)}</span></span>
        <span class="ms-rung-bar"><i style="width:${x.cac ? (100 * x.cac / maxCac).toFixed(1) : 0}%"></i></span>
        <span class="ms-rung-v">${x.cac !== null ? mspendAed(x.cac) : '–'}<small>${x.ratio ? x.ratio.toFixed(1) + ' to 1' : ''}</small></span>
      </button>`).join('');
  let notice = '';
  if (defs[0].cac !== null) {
    const stepA = defs[1].cac - defs[0].cac, stepT = defs[2].cac - defs[1].cac;
    notice = `Adding the agency moves the CAC from ${mspendAed(defs[0].cac)} to ${mspendAed(defs[1].cac)}; adding respond.io and GoHighLevel takes it to ${mspendAed(defs[2].cac)}. <b>${stepA >= stepT ? 'The agency' : 'The tools'}</b> is the bigger step. What did you notice?`;
  }
  const tryCard = `<section class="slv-card ms-sec">
      <div class="ms-eyebrow">Try it</div>
      <h3 class="ms-h">What counts as the cost?</h3>
      <p class="ms-sub">Pick one and the whole page follows it. Same months, same new clients: only the list of costs changes.</p>
      <div class="ms-ladder" role="radiogroup" aria-label="What counts as the cost">${rungs}</div>
      ${notice ? `<p class="ms-notice">${notice}</p>` : ''}
    </section>`;

  // ── 4. The sums, one step at a time.
  const defNote = { ads: 'Google + Meta', agency: 'Google + Meta + agency', all: 'Google + Meta + agency + tools' }[pick.k];
  const stepsCard = `<section class="slv-card ms-sec">
      <div class="ms-eyebrow">How it is worked out</div>
      <h3 class="ms-h">Five steps, with this page’s numbers</h3>
      <div class="ms-steps">
        <div class="ms-step"><div class="ms-step-n">1</div><div class="ms-step-t">Add up the costs</div><div class="ms-step-v">${mspendAed(pick.spend)}</div><div class="ms-step-d">${mspendEsc(defNote)}, over the ${nMonths(priced.length)} with every cost in.</div></div>
        <div class="ms-step"><div class="ms-step-n">2</div><div class="ms-step-t">Count the new clients</div><div class="ms-step-v">${mspendNum(pNew)}</div><div class="ms-step-d">A client’s first sale at any salon, Bahrain included, matched by name.</div></div>
        <div class="ms-step"><div class="ms-step-n">3</div><div class="ms-step-t">Divide: that is the CAC</div><div class="ms-step-v">${cac !== null ? mspendAed(cac) : '–'}</div><div class="ms-step-d">${cac !== null ? `${mspendAed(pick.spend)} ÷ ${mspendNum(pNew)}.` : 'Needs a month with every cost in.'}</div></div>
        <div class="ms-step"><div class="ms-step-n">4</div><div class="ms-step-t">See what a client spends: the LTV</div><div class="ms-step-v">${year1 ? mspendAed(year1) : '–'}</div><div class="ms-step-d">${year1 ? `Average net sales in 12 months, for the ${mspendNum(ltv.clients)} clients who first came ${mspendEsc(mspendCohort(ltv.cohort))}. Half spent under ${mspendAed(ltv.median_net_12m)}; ${ltv.pct_returned}% came back. Sales, not profit.` : ''}</div></div>
        <div class="ms-step"><div class="ms-step-n">5</div><div class="ms-step-t">Compare: LTV ÷ CAC</div><div class="ms-step-v">${ratio ? ratio.toFixed(1) + ' to 1' : '–'}</div><div class="ms-step-d">${ceiling ? `At 3 to 1 a new client can cost at most ${mspendAed(ceiling)}. As that is sales, the real limit is lower.` : ''}</div></div>
      </div>
    </section>`;

  // ── 5. What stands out, and the questions to ask.
  const bullets = [];
  const share = [['Google', r => r.google], ['Meta', r => r.meta], ['The agency', r => r.agency || 0], ['The tools', r => r.other]];
  const tot = rows.reduce((a, r) => a + r.total, 0) || 1;
  const parts = share.map(([n, f]) => [n, rows.reduce((a, r) => a + f(r), 0)]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (parts.length > 1) bullets.push(`<b>${parts[0][0]}</b> is the biggest cost, ${Math.round(100 * parts[0][1] / tot)}% of everything in view, then ${parts[1][0].toLowerCase()} at ${Math.round(100 * parts[1][1] / tot)}%.`);
  if (priced.length > 1) {
    const hi = priced.reduce((a, r) => (mspendCacOf(r, pick.k) > mspendCacOf(a, pick.k) ? r : a)), lo = priced.reduce((a, r) => (mspendCacOf(r, pick.k) < mspendCacOf(a, pick.k) ? r : a));
    bullets.push(`The most expensive month per new client was <b>${mspendMonth(hi.mo)}</b> at ${mspendAed(mspendCacOf(hi, pick.k))}; the cheapest was <b>${mspendMonth(lo.mo)}</b> at ${mspendAed(mspendCacOf(lo, pick.k))}.`);
  }
  const g = rows.filter(r => r.google > 0);
  if (g.length > 1 && g[g.length - 1].google > g[0].google * 1.5) bullets.push(`Google ads went from ${mspendAed(g[0].google)} in ${mspendMonth(g[0].mo)} to ${mspendAed(g[g.length - 1].google)} in ${mspendMonth(g[g.length - 1].mo)}${g[g.length - 1].partial ? ' so far' : ''}.`);
  const last = rows[rows.length - 1], prev = rows[rows.length - 2];
  if (last && prev && last.agency === 0 && prev.agency > 0) bullets.push(`The agency fee stops from ${mspendMonth(last.mo)}: about ${mspendAed(prev.agency)} a month less to pay.`);
  const stand = `<section class="slv-card ms-sec">
      <div class="ms-two">
        <div><div class="ms-eyebrow">What stands out</div><h3 class="ms-h">In plain words</h3>
          <ul class="ms-list">${bullets.map(b => `<li>${b}</li>`).join('') || '<li>Pick a longer Period to see what changed.</li>'}</ul></div>
        <div class="ms-ask"><h4>Questions to ask the team</h4>
          <ul class="ms-list"><li>What was different about the month that cost the most per new client?</li><li>Which of these costs are about winning new clients, and which are about looking after the ones we have?</li></ul></div>
      </div>
    </section>`;

  // ── 6. The month by month chart and table, then the fine print folded away.
  const body = rows.slice().reverse().map(r => {
    const c = mspendCacOf(r, pick.k);
    return `<tr>
      <td>${mspendEsc(mspendMonth(r.mo))}${r.partial ? '<div class="slv-note">so far</div>' : ''}</td>
      <td>${r.google ? mspendNum(r.google) : '–'}</td>
      <td>${r.meta ? mspendNum(r.meta) : '–'}</td>
      <td>${r.agency !== null ? mspendNum(r.agency) : '–'}${r.agency === null && r.metaFull ? '<div class="slv-note">not invoiced yet</div>' : ''}</td>
      ${hasOther ? `<td>${r.other ? mspendNum(r.other) : '–'}</td>` : ''}
      <td><b>${mspendNum(r.by[pick.k])}</b></td>
      <td>${mspendNum(r.nc)}</td>
      <td>${c !== null ? mspendAed(c) : '–'}</td></tr>`;
  }).join('');
  const tableCard = `<section class="slv-card ms-sec">
      <div class="ms-eyebrow">Month by month</div>
      <h3 class="ms-h">Spend and CAC</h3>
      <div class="mk-chart-head">
        <div class="slv-eyebrow">Spend by month, with the CAC (${mspendEsc(pick.label.toLowerCase())})</div>
        <span class="w13-skey" aria-label="Chart key">
          <span><i class="bar" style="background:#A78BFA"></i>Google</span>
          <span><i class="bar" style="background:#E07A5F"></i>Meta</span>
          ${pick.k !== 'ads' ? '<span><i class="bar" style="background:#94A3B8"></i>Agency</span>' : ''}
          ${pick.k === 'all' && hasOther ? '<span><i class="bar" style="background:#5FB3A8"></i>Tools</span>' : ''}
          <span><i class="line" style="--c:#0F6E56"></i>CAC</span>
        </span>
      </div>
      <div style="position:relative;height:300px"><canvas id="mspendCanvas"></canvas></div>
      <div class="slv-wrap" style="margin-top:14px"><table class="slv-table">
        <thead><tr><th>Month</th><th>Google (AED)</th><th>Meta (AED)</th><th>Agency (AED)</th>${hasOther ? '<th>Tools (AED)</th>' : ''}<th>Total (AED)</th><th>New clients</th><th>CAC (AED)</th></tr></thead>
        <tbody>${body}</tbody></table></div>
      <p class="ms-sub" style="margin:8px 0 0">The Total and CAC columns follow what you picked above (${mspendEsc(pick.label.toLowerCase())}).</p>
    </section>`;
  const fine = `<details class="ms-more">
      <summary>What is and is not in these numbers</summary>
      <div class="ms-more-b"><ul class="slv-notes" style="margin:0;padding-left:18px;line-height:1.55">
        <li><b>Agency.</b> Leaders in Digital’s monthly fee for the UAE salons and Bahrain, before VAT, until they were taken off in October 2026. Bahrain’s website build (AED 20,000) has not been billed, so it is not in. A month shows “not invoiced yet” until its invoice is in, and has no CAC until then.</li>
        <li><b>Tools.</b> What was paid each month for respond.io (the plan and the WhatsApp top ups, not the balance still unused) and GoHighLevel (the plan, the add-ons and the wallet recharges). respond.io is billed in dollars, so its dirham figure uses the rate the card was charged, about 3.81. They also serve clients we already have, so part of this is not about winning new ones.</li>
        <li><b>Meta.</b> Includes the small Instagram boosts paid from a second Meta account in Dec 2025 and Aug 2026. Meta before Oct 2025 is not available, so those months show Google only and no CAC.</li>
        <li><b>Not here.</b> Content, influencer fees, commissions and staff time, which have no figures kept, and Phorest, which will show under Tools once its total is in. Add those before calling this the whole cost of winning a client.</li>
        <li><b>New clients.</b> The count runs a little high, and the CAC a little low, because a name spelt differently counts again. The till history starts in May 2021, and the current month is as of last night.</li>
        <li><b>LTV.</b> Voucher and deposit lines are left out. It is net sales over the 12 months after a client’s first visit, not profit.</li>
      </ul>
      <p class="slv-muted">${synced ? 'Meta updated ' + mspendEsc(synced) + '.' : ''}</p></div>
    </details>`;

  el.innerHTML = `
    <section class="slv-intro">
      <h2>Marketing Spend</h2>
      <p>What Google ads, Meta ads, the agency and the WhatsApp and CRM tools cost, what that comes to for every new client the salons got, and what a new client is worth. Shows every month that falls in the Period at the top.</p>
    </section>
    ${stale ? `<p class="slv-muted" style="color:#b42318">Meta spend from Metricool is paused${s && s.last_error ? ': ' + mspendEsc(s.last_error) : ''}. Last good update: ${synced ? mspendEsc(synced) : 'never'}.</p>` : ''}
    ${why}${answerCard}${tryCard}${stepsCard}${stand}${tableCard}${mspendFilesCard(rows)}${fine}`;
  mspendDraw(rows, pick.k, hasOther);
  mspendCountUp(el);
}

// ── The invoices behind the numbers: a download for each, and a zip for the month. They sit in the private bucket marketing-invoices, which
// only Level 3 and above can read (a storage policy), so a download is a short-lived signed link made here.
const MSPEND_KINDS = [['google', 'Google Ads statement'], ['meta', 'Meta ads invoices'], ['agency', 'Agency invoices (Leaders in Digital)']];
const mspendKb = b => (b >= 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' KB');
const mspendFileName = f => f.path.split('/').pop();
function mspendFilesCard(rows) {
  const months = rows.map(r => r.mo.slice(0, 7)), by = {};
  mspendFiles.forEach(f => { const m = f.month.slice(0, 7); if (months.includes(m)) (by[m] = by[m] || []).push(f); });
  const list = months.slice().reverse().filter(m => by[m]);
  if (!list.length) return '';
  const block = m => {
    const fs = by[m];
    const groups = MSPEND_KINDS.map(([k, label]) => {
      const g = fs.filter(f => f.kind === k);
      if (!g.length) return '';
      return `<div class="ms-inv-g"><div class="ms-inv-gt">${mspendEsc(label)}${k === 'meta' ? ' <span>(listed in the month they were paid)</span>' : ''}</div>${g.map(f => `<div class="ms-inv-r">
          <span class="ms-inv-n">${mspendEsc(f.title)}${f.amount !== null && f.amount !== undefined ? `<span class="ms-inv-a">${mspendAed(f.amount)}${f.kind === 'agency' ? ' before VAT' : ''}</span>` : ''}</span>
          <button type="button" class="ms-inv-b" onclick="mspendDl(${f.i}, this)" aria-label="Download ${mspendEsc(f.title)}">Download <small>${mspendKb(f.bytes)}</small></button></div>`).join('')}</div>`;
    }).join('');
    return `<details class="ms-inv"><summary><b>${mspendEsc(mspendMonth(m + '-01'))}</b><span>${fs.length} file${fs.length === 1 ? '' : 's'}</span>
        <button type="button" class="ms-inv-zip" onclick="event.preventDefault();event.stopPropagation();mspendZip('${m}', this)">Download all (zip)</button></summary>
        <div class="ms-inv-body">${groups}</div></details>`;
  };
  return `<section class="slv-card ms-sec">
      <div class="ms-eyebrow">The paperwork</div>
      <h3 class="ms-h">Invoices to download</h3>
      <p class="ms-sub">The Google statements, the Meta invoices and Leaders in Digital’s invoices behind the numbers above, month by month. Only the months in the Period at the top are listed. The Meta files are the paid ones; failed and pending payments are not here.</p>
      <div class="ms-invs">${list.map(block).join('')}</div>
      <p class="slv-muted" id="mspendDlMsg" role="status"></p>
    </section>`;
}
function mspendDlMsg(t) { const n = document.getElementById('mspendDlMsg'); if (n) n.textContent = t || ''; }
function mspendSave(url, name) {
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
}
async function mspendDl(i, btn) {
  const f = mspendFiles[i]; if (!f) return;
  if (btn) btn.disabled = true;
  try {
    const { data, error } = await sb.storage.from('marketing-invoices').createSignedUrl(f.path, 120, { download: mspendFileName(f) });
    if (error || !data) throw error || new Error('no link');
    mspendSave(data.signedUrl, mspendFileName(f)); mspendDlMsg('');
  } catch (e) { console.error(e); mspendDlMsg('That invoice would not download. Refresh and try again.'); }
  if (btn) btn.disabled = false;
}
let mspendZipLib = null;
function mspendLoadZip() {
  if (window.JSZip) return Promise.resolve();
  if (mspendZipLib) return mspendZipLib;
  mspendZipLib = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'; s.onload = res; s.onerror = () => { mspendZipLib = null; rej(new Error('zip tool did not load')); }; document.head.appendChild(s);
  });
  return mspendZipLib;
}
async function mspendZip(m, btn) {
  const fs = mspendFiles.filter(f => f.month.slice(0, 7) === m); if (!fs.length) return;
  const label = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Preparing…'; }
  try {
    await mspendLoadZip();
    const { data, error } = await sb.storage.from('marketing-invoices').createSignedUrls(fs.map(f => f.path), 300);
    if (error || !data) throw error || new Error('no links');
    const zip = new window.JSZip();
    for (const d of data) {
      if (d.error || !d.signedUrl) throw new Error(d.error || 'missing link');
      const f = fs.find(x => x.path === d.path), blob = await (await fetch(d.signedUrl)).blob();
      zip.file(`${f.kind}/${mspendFileName(f)}`, blob);
    }
    const out = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(out); mspendSave(url, `Marketing invoices ${m}.zip`); setTimeout(() => URL.revokeObjectURL(url), 5000); mspendDlMsg('');
  } catch (e) { console.error(e); mspendDlMsg('The zip would not build. Download the files one by one, or refresh and try again.'); }
  if (btn) { btn.disabled = false; btn.textContent = label; }
}

// The four numbers count up once, the first time they are drawn (not for people who ask for less motion).
function mspendCountUp(root) {
  if (mspendCounted) return;
  mspendCounted = true;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  root.querySelectorAll('.ms-count').forEach(n => {
    const to = Number(n.dataset.v), f = n.dataset.f, t0 = performance.now(), end = n.textContent;
    if (!isFinite(to)) return;
    const fmt = v => (f === 'ratio' ? v.toFixed(1) + ' to 1' : 'AED ' + Math.round(v).toLocaleString('en-GB'));
    const tick = now => {
      const p = Math.min(1, (now - t0) / 700), e = 1 - Math.pow(1 - p, 3);
      n.textContent = p < 1 ? fmt(to * e) : end;
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function mspendDraw(rows, k, hasOther) {
  if (mspendChart) { mspendChart.destroy(); mspendChart = null; }
  const cv = document.getElementById('mspendCanvas');
  if (!cv || !window.Chart) return;
  const css = getComputedStyle(document.documentElement);
  const muted = css.getPropertyValue('--muted').trim(), border = css.getPropertyValue('--border').trim();
  const lineCol = '#0F6E56';
  const sets = [
    { label: 'Google', color: '#A78BFA', get: r => r.google },
    { label: 'Meta', color: '#E07A5F', get: r => r.meta },
  ];
  if (k !== 'ads') sets.push({ label: 'Agency', color: '#94A3B8', get: r => r.agency || 0 });
  if (k === 'all' && hasOther) sets.push({ label: 'Tools', color: '#5FB3A8', get: r => r.other });
  mspendChart = new Chart(cv, {
    data: {
      labels: rows.map(r => new Date(r.mo + 'T00:00:00').toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })),
      datasets: [
        ...sets.map((x, i) => ({ type: 'bar', order: 2, label: x.label, data: rows.map(r => Math.round(x.get(r))), yAxisID: 'y', stack: 's', backgroundColor: x.color, maxBarThickness: 48, borderRadius: i === sets.length - 1 ? 4 : 0 })),
        { type: 'line', order: 1, label: 'CAC', data: rows.map(r => { const c = mspendCacOf(r, k); return c === null ? null : Math.round(c * 10) / 10; }), yAxisID: 'y1',
          borderColor: lineCol, backgroundColor: lineCol, borderWidth: 2, pointRadius: 3, pointBackgroundColor: '#fff', pointBorderColor: lineCol, pointBorderWidth: 2,
          tension: 0.3, spanGaps: false },
      ],
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => `${c.dataset.label}: AED ${Number(c.raw).toLocaleString('en-GB')}` } },
      },
      scales: {
        x: { stacked: true, ticks: { color: muted, autoSkip: true, maxRotation: 0 }, grid: { display: false } },
        y: { stacked: true, beginAtZero: true, grace: '10%', ticks: { color: muted }, grid: { color: border } },
        y1: { position: 'right', beginAtZero: true, grace: '10%', ticks: { color: muted }, grid: { display: false } },
      },
    },
  });
}

function mspendRedrawForTheme() {
  const v = document.getElementById('view-marketingspend');
  if (v && v.style.display !== 'none' && mspendData) mspendPaint(document.getElementById('marketingSpendContent'));
}
