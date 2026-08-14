/* ============================================================
   BRANCH PERFORMANCE — THE READS
   branch-narrative.js · Kate, 2026-08-14

   The Working / Watch / Do this panel under each branch's growth card.

   TWO WRITERS, AND THE ORDER MATTERS.

     bnFallback()  Rules, in this file. Reads the figures, ranks each branch's
                   benchmarks against target, finds the leader of each one, and
                   writes plain sentences. No network, no key, no cost. This is what
                   renders on load, and what stays on screen if anything below fails.

     branch-narrative  The Edge Function (supabase/functions/branch-narrative). Same
                   figures, better prose, and it may not write a number it was not
                   given. When it answers, its copy replaces the rules copy in place.

   So the page is never blank, never waiting, and never showing a figure that was not
   computed here. If the function is not deployed — as of 14 Aug it is not, and
   neither is pulse-narrative — the page still reads properly; it just reads plainer.

   Wiring is two lines in index.html, after branch-ledger.js:
     <script src="branch-narrative.js"></script>
   and branch-ledger.js calls bnRender() once the growth series is in hand.
   ============================================================ */

// ── WHAT COUNTS AS GOOD ──────────────────────────────────────
// The five standing benchmarks, each with the target it is read against and the
// wording the branch actually uses for it. `key` is the summary field; `pts` marks
// the ones that move in percentage points rather than percent.
const BN_BENCHMARKS = [
  { id:'rebook',    label:'Rebooking',       key:'rebookPct',     target:() => TARGETS.rebookPct,     fmt:v => lgPct(v), pts:true },
  { id:'treatment', label:'Treatment',       key:'treatmentPct',  target:() => TARGETS.treatmentPct,  fmt:v => lgPct(v), pts:true, hairOnly:true },
  { id:'retail',    label:'Retail',          key:'retailPct',     target:() => TARGETS.retailPct,     fmt:v => lgPct(v), pts:true },
  { id:'hairBill',  label:'Hair avg bill',   key:'hairAvgBill',   target:() => TARGETS.hairAvgBill,   fmt:v => lgAed(v) },
  { id:'beautyBill',label:'Beauty avg bill', key:'beautyAvgBill', target:() => TARGETS.beautyAvgBill, fmt:v => lgAed(v), beautyOnly:true },
];

// One action per weak benchmark, and per the one non-benchmark failure worth naming
// (traffic). Written to be done inside a fortnight by the people already on that
// floor — a "review the strategy" action is how a page like this gets ignored.
const BN_ACTIONS = {
  rebook: {
    do: 'Move the rebooking ask to the chair. Every colour and cut client leaves with her next date before she stands up, and the desk stops being where it is asked.',
    check: 'The rebooked count rises against the same client volume next period.',
  },
  treatment: {
    do: 'One treatment offered to every colour client, and logged on the ledger whether she takes it or not — so next period says how often it was asked, not just how often it sold.',
    check: 'Treatment revenue rises without the average bill falling.',
  },
  retail: {
    do: 'Two retail recommendations per stylist per day, written on the ledger beside the service they belong to.',
    check: 'Retail units rise; the retail share of net take follows.',
  },
  hairBill: {
    do: 'Check the price list is being applied at the desk — every service on the ticket, no rounded-down totals, no forgotten add-ons.',
    check: 'The average bill rises with no change in client numbers.',
  },
  beautyBill: {
    do: 'Pair one beauty service with every hair booking at the point of booking, so the beauty room fills from the hair diary rather than waiting on its own walk-ins.',
    check: 'Beauty clients rise and the beauty average bill holds.',
  },
  traffic: {
    do: 'Work the lapsed list: every client who came in the previous period but not this one gets one message from the branch, and the desk writes down what came back.',
    check: 'Client numbers recover against a written count of who was contacted.',
  },
};

// ── THE FACTS ────────────────────────────────────────────────
// What the function is allowed to write about. Built for EVERY active branch
// regardless of the branch chips, so switching filters reads one cached row rather
// than paying for a generation per combination.
//
// Only real, finite numbers go in. A field the current aggregation path did not
// populate is left out rather than sent as 0 — a zero reads as a fact, and the
// model would write about it. Same rule as pulse-narrative.
function bnFacts(g, targets) {
  const f = {};
  const put = (k, v) => {
    if (typeof v === 'number' && Number.isFinite(v)) f[k] = Math.round(v * 100) / 100;
  };

  Object.entries(targets || {}).forEach(([k, v]) => put('target_' + k, v));
  put('window_days', g.days);

  const scope = ['group'].concat(ACTIVE_BRANCHES.filter(c => g[c] && g[c].cur));
  scope.forEach(code => {
    const p = code === 'group' ? 'group' : code;
    const cur = g[code].cur, prev = g[code].prev;
    if (!cur) return;
    put(`${p}_net_take`,        cur.netTake);
    put(`${p}_clients`,         cur.totalClients);
    put(`${p}_new_clients`,     cur.newClientsTotal);
    put(`${p}_ncr`,             cur.ncrTotal);
    put(`${p}_rebooked`,        cur.totalRebooked);
    put(`${p}_rebook_pct`,      cur.rebookPct);
    put(`${p}_treatment_pct`,   cur.treatmentPct);
    put(`${p}_retail_pct`,      cur.retailPct);
    put(`${p}_hair_avg_bill`,   cur.hairAvgBill);
    put(`${p}_beauty_avg_bill`, cur.beautyAvgBill);
    if (prev) {
      put(`${p}_net_take_prev`,      prev.netTake);
      put(`${p}_clients_prev`,       prev.totalClients);
      put(`${p}_hair_avg_bill_prev`, prev.hairAvgBill);
      put(`${p}_rebook_pct_prev`,    prev.rebookPct);
      const t = bpDelta(cur.netTake, prev.netTake);
      const c = bpDelta(cur.totalClients, prev.totalClients);
      const b = bpDelta(cur.hairAvgBill, prev.hairAvgBill);
      if (t.pct != null) put(`${p}_net_take_growth_pct`, t.pct);
      if (c.pct != null) put(`${p}_clients_growth_pct`, c.pct);
      if (b.pct != null) put(`${p}_hair_avg_bill_growth_pct`, b.pct);
    }
  });
  return f;
}

// Who leads each benchmark, and who trails it. Computed here so a comparative
// sentence is a fact rather than the model's arithmetic.
function bnRanks(g) {
  const out = {};
  const rank = (key, id) => {
    const rows = ACTIVE_BRANCHES
      .filter(c => g[c] && g[c].cur && typeof g[c].cur[key] === 'number' && g[c].cur[key] > 0)
      .map(c => ({ code: c, v: g[c].cur[key] }))
      .sort((a, b) => b.v - a.v);
    if (rows.length) out[id] = { best: rows[0], worst: rows[rows.length - 1], rows };
  };
  BN_BENCHMARKS.forEach(bm => rank(bm.key, bm.id));
  // Volume is not a benchmark — there is no target for "number of clients" — but it
  // is the most distinguishing thing about a floor, and without it three branches
  // whose only above-target figure is the hair bill all open on the same sentence.
  rank('totalClients',    'clients');
  rank('newClientsTotal', 'newClients');
  return out;
}

// 1 for the group leader, 2 for the runner-up, and so on. Null when the branch has
// no figure for it.
function bnPlace(ranks, id, code) {
  const rows = ranks[id] && ranks[id].rows;
  if (!rows) return null;
  const i = rows.findIndex(r => r.code === code);
  return i < 0 ? null : i + 1;
}

// Each branch's benchmarks as attainment against target, sorted worst first. The
// ratio is what makes five different units comparable: 20% of a 45% target and
// AED 697 of a AED 650 one are 0.44 and 1.07.
function bnScored(cur) {
  const hairOnly = !((cur.beautyTotalClients || 0) || (cur.beautyServicesTotal || 0));
  return BN_BENCHMARKS
    .filter(bm => !(bm.beautyOnly && hairOnly))
    .map(bm => {
      const t = bm.target();
      const v = Number(cur[bm.key]) || 0;
      return { ...bm, value: v, targetValue: t, ratio: t ? v / t : null };
    })
    .filter(x => x.ratio != null && x.value > 0)
    .sort((a, b) => a.ratio - b.ratio);
}

// ── THE RULES WRITER ─────────────────────────────────────────
// Plain, and true. Every sentence here is assembled from a figure this file was
// given, which is the same contract the function is held to.
function bnFallback(g) {
  const ranks = bnRanks(g);
  const nm = code => (BRANCH_INFO[code] || {}).name || code;
  const copy = {};

  // Is the movement group-wide? Four branches moving the same way is a season or a
  // market, and the panels must not coach one floor for it.
  const moves = ACTIVE_BRANCHES
    .filter(c => g[c] && g[c].cur && g[c].prev)
    .map(c => bpDelta(g[c].cur.netTake, g[c].prev.netTake));
  const allDown = moves.length > 1 && moves.every(m => m.dir === 'down');
  const allUp   = moves.length > 1 && moves.every(m => m.dir === 'up');

  const gc = g.group.cur, gp = g.group.prev;
  const gt = gp ? bpDelta(gc.netTake, gp.netTake) : null;
  const gcl = gp ? bpDelta(gc.totalClients, gp.totalClients) : null;
  copy.group = {
    heading: allDown ? 'Every branch moved the same way'
           : allUp   ? 'The whole group is up'
           : 'Mixed period across the four',
    body: [
      gt && gt.pct != null
        ? `Group net take is ${lgAed(gc.netTake)}, ${gt.pct > 0 ? 'up' : 'down'} ${Math.abs(gt.pct).toFixed(1)}% on the ${g.days} days before this window.`
        : `Group net take is ${lgAed(gc.netTake)}.`,
      gcl && gcl.pct != null
        ? `Clients moved ${gcl.pct > 0 ? 'up' : 'down'} ${Math.abs(gcl.pct).toFixed(1)}% over the same two windows, on the same number of days.`
        : '',
      allDown ? 'All four moved down together, which points at the season rather than at any one floor — read each branch below against the group, not against its own target alone.' : '',
      allUp ? 'All four moved up together, so the question below is which floor moved least.' : '',
    ].filter(Boolean).join(' '),
  };

  ACTIVE_BRANCHES.forEach(code => {
    const b = g[code];
    if (!b || !b.cur) return;
    const cur = b.cur, prev = b.prev;
    const scored = bnScored(cur);
    if (!scored.length) return;

    const worst = scored[0];
    const leads = BN_BENCHMARKS
      .filter(bm => ranks[bm.id] && ranks[bm.id].best.code === code)
      .map(bm => bm.label.toLowerCase());
    const trails = ranks[worst.id] && ranks[worst.id].worst.code === code;
    // Leading the group is more interesting than clearing a target everybody clears.
    // Without this every panel opened on the hair average bill, because it is over
    // target at all four and therefore always the highest attainment — four
    // identical "Working" columns, which is the same as no column at all.
    const led = scored.filter(x => x !== worst && leads.includes(x.label.toLowerCase()));
    const rest = scored.filter(x => x !== worst);
    const best = led.length ? led[led.length - 1]
               : rest.length ? rest[rest.length - 1]
               : scored[scored.length - 1];
    const bestLeads = leads.includes(best.label.toLowerCase());
    // The branch can be furthest from target on a metric AND still the best of the
    // four at it — AQ is, on treatment. Printing "leads the group on treatment"
    // beside "treatment is the gap" reads as a contradiction unless the panel says
    // which it is: a group-wide gap, not this floor's.
    const worstLeadsToo = leads.includes(worst.label.toLowerCase());

    const take    = prev ? bpDelta(cur.netTake, prev.netTake) : null;
    const clients = prev ? bpDelta(cur.totalClients, prev.totalClients) : null;
    const bill    = prev ? bpDelta(cur.hairAvgBill, prev.hairAvgBill) : null;

    // WORKING — what genuinely distinguishes this floor, in this order: a benchmark
    // it leads · the volume it holds · a benchmark it is second on · its best
    // attainment. Three of the four branches clear only one target, so attainment
    // alone gave three identical columns; this makes each panel say its own thing
    // without any of them saying something untrue.
    const topClients = bnPlace(ranks, 'clients', code) === 1;
    const topNew     = bnPlace(ranks, 'newClients', code) === 1;
    const second     = rest.filter(x => bnPlace(ranks, x.id, code) === 2);
    const runnerUp   = second.length ? second[second.length - 1] : null;

    let subject, workBits;
    if (bestLeads) {
      subject = `${best.label}, best of the four`;
      workBits = [`${best.label} is ${best.fmt(best.value)} against a ${best.fmt(best.targetValue)} target${
        best.ratio >= 1 ? ', clear of it' : ''} and the best of the four.`];
    } else if (topClients || topNew) {
      subject = 'The busiest floor in the group';
      workBits = [[
        topClients ? `${lgNum(cur.totalClients)} clients` : null,
        topNew ? `${lgNum(cur.newClientsTotal)} new ones` : null,
      ].filter(Boolean).join(' and ') + `, more than any other branch. New business is arriving; what happens next is the question below.`];
      workBits.push(`${best.label} is ${best.fmt(best.value)}, clear of its ${best.fmt(best.targetValue)} target.`);
    } else if (runnerUp) {
      subject = `${runnerUp.label}, second in the group`;
      workBits = [`${runnerUp.label} is ${runnerUp.fmt(runnerUp.value)} against a ${runnerUp.fmt(runnerUp.targetValue)} target — second of the four.`];
      if (runnerUp.id !== best.id) {
        workBits.push(`${best.label} is ${best.fmt(best.value)}, clear of its ${best.fmt(best.targetValue)} target.`);
      }
    } else {
      subject = `${best.label} is holding`;
      workBits = [`${best.label} is ${best.fmt(best.value)} against a ${best.fmt(best.targetValue)} target${
        best.ratio >= 1 ? ', clear of it' : ''}.`];
    }

    // Only the leads that are not already the subject of a column — the worst one is
    // named in Watch and repeating it here is what made the two columns argue.
    const otherLeads = leads.filter(l =>
      l !== best.label.toLowerCase() && l !== worst.label.toLowerCase()
      && (!runnerUp || l !== runnerUp.label.toLowerCase()));
    if (otherLeads.length) {
      workBits.push(`It also leads the group on ${otherLeads.join(' and ')}.`);
    }
    if (bill && bill.dir === 'up' && bill.pct != null) {
      workBits.push(`The average bill is up ${bill.pct.toFixed(1)}% on the previous window, so the money per client is moving the right way.`);
    }
    if (cur.newClientsTotal && !topNew) {
      workBits.push(`${lgNum(cur.newClientsTotal)} new clients this window.`);
    }

    // WATCH — the weakest benchmark, with the growth context around it.
    const watchBits = [
      `${worst.label} is ${worst.fmt(worst.value)} against a ${worst.fmt(worst.targetValue)} target${
        trails ? ', the lowest of the four'
        : worstLeadsToo ? ' — and that is the best of the four, so this one is the group\'s gap and not this floor\'s'
        : ''}.`,
    ];
    if (worst.id === 'rebook' && cur.totalClients) {
      watchBits.push(`${lgNum(cur.totalRebooked)} of ${lgNum(cur.totalClients)} clients came back.`);
    }
    let action = BN_ACTIONS[worst.id] || BN_ACTIONS.traffic;
    if (take && take.dir === 'down' && clients && clients.dir === 'down' && bill && bill.dir === 'up') {
      watchBits.push(`Net take is down ${Math.abs(take.pct).toFixed(1)}% on a ${Math.abs(clients.pct).toFixed(1)}% fall in clients while the average bill rose — that is traffic, not pricing${
        allDown ? ', and every branch moved the same way' : ''}.`);
      // A traffic fall outranks a soft benchmark: there is no point coaching the
      // retail share of a client who is not in the chair.
      if (worst.ratio > 0.75) action = BN_ACTIONS.traffic;
    } else if (take && take.dir === 'down' && take.pct != null) {
      watchBits.push(`Net take is down ${Math.abs(take.pct).toFixed(1)}% on the previous ${g.days} days.`);
    }

    copy[code] = {
      working: { heading: subject, body: workBits.join(' ') },
      watch: {
        heading: worstLeadsToo ? `${worst.label}, a group-wide gap` : `${worst.label} is the gap`,
        body: watchBits.join(' '),
      },
      action,
      _rules: true,
    };
  });

  return copy;
}

// ── THE FUNCTION ─────────────────────────────────────────────
// Null on anything going wrong — not deployed, no key, figures rejected — and the
// caller keeps the rules copy. Never throws into the render path.
async function fetchBranchNarrative(g, facts, labels, names) {
  try {
    if (typeof sb === 'undefined' || !sb.functions) return null;
    const { data, error } = await sb.functions.invoke('branch-narrative', {
      body: {
        period_key: `${lgYmd(g.windows.cur.from)}..${lgYmd(g.windows.cur.to)}|${g.days}d`,
        labels, facts, staff_names: names,
      },
    });
    if (error) throw error;
    if (!data || !data.copy) {
      if (data?.unsupported_figures) console.warn('[branch] rejected — unsupported figures:', data.unsupported_figures);
      if (data?.named_staff)        console.warn('[branch] rejected — named staff:', data.named_staff);
      return null;
    }
    return data.copy;
  } catch (e) {
    console.warn('[branch] narrative unavailable, keeping the rules copy —', e?.message || e);
    return null;
  }
}

// ── OWNER AND DEADLINE ───────────────────────────────────────
// The doctrine is one action, one owner, one deadline, and the owner is never the
// model's to choose. Taken from the roster: the Style Directors on that floor. All
// of them when there are several — picking one would be inventing a decision Kate
// has not made. The deadline is the coming Monday, because that is when the branch
// meeting is.
function bnOwners(code) {
  if (typeof STAFF_PROFILES === 'undefined') return [];
  return Object.entries(STAFF_PROFILES)
    .filter(([, p]) => p.branch === code && p.role === 'Style Director')
    .map(([name]) => name.charAt(0) + name.slice(1).toLowerCase());
}
function bnNextMonday() {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
  return `${d.getDate()} ${MON_SHORT[d.getMonth()]}`;
}

// ── THE PANELS ───────────────────────────────────────────────
function bnPanel(code, read, byline) {
  const info = BRANCH_INFO[code] || { name: code };
  const owners = bnOwners(code);
  return `<div class="card bn-p" id="bn-${code}" style="--b:${info.color};--bl:${info.colorLight || info.color}">
    <div class="bn-hd">
      <span class="bn-dot"></span>
      <span class="bn-nm">${escapeHtml(info.name)}</span>
    </div>
    <div class="bn-body">
      <div class="bn-col good">
        <div class="bn-k"><span class="bar"></span>Working</div>
        <p class="bn-h">${escapeHtml(read.working.heading)}</p>
        <p>${escapeHtml(read.working.body)}</p>
      </div>
      <div class="bn-col watch">
        <div class="bn-k"><span class="bar"></span>Watch</div>
        <p class="bn-h">${escapeHtml(read.watch.heading)}</p>
        <p>${escapeHtml(read.watch.body)}</p>
      </div>
      <div class="bn-col act">
        <div class="bn-k"><span class="bar"></span>Do this</div>
        <div class="bn-act">${escapeHtml(read.action.do)}
          <div class="bn-meta">
            <span>${owners.length ? '👤 ' + escapeHtml(owners.join(' · ')) + (owners.length > 1 ? ' · Style Directors' : ' · Style Director') : '👤 owner to assign'}</span>
            <span>📅 ${escapeHtml(bnNextMonday())}</span>
          </div>
        </div>
        <p class="bn-check">How we will know: ${escapeHtml(read.action.check)}</p>
      </div>
    </div>
    ${byline}
  </div>`;
}

// The byline is not decoration. A reader has to be able to tell whether a sentence
// was written by a rule or by the model, and how many figures stood behind it.
function bnByline(read, factCount, model) {
  const rules = read && read._rules;
  return `<div class="bn-by">
    <span class="bn-who">${rules ? '⌗ Written from the figures by rule' : '✦ Written by branch-narrative'}</span>
    <span>${rules
      ? 'no model called — the read is assembled from the benchmarks and the growth window'
      : escapeHtml(`${model || 'claude-opus-5'} · from ${factCount} figures · cached for this period`)}</span>
  </div>`;
}

/**
 * Renders the reads into `hostId`. Rules copy first, synchronously, then the
 * function's copy over the top if it answers. Returns nothing: the page is already
 * correct after the first paint.
 */
async function bnRender(hostId, g, codes) {
  const host = document.getElementById(hostId);
  if (!host || !g || !g.group || !g.group.cur) return;

  const targets = (typeof TARGETS !== 'undefined') ? TARGETS : {};
  const facts   = bnFacts(g, targets);
  const labels  = {
    window:      `${shortD(g.windows.cur.from)} – ${shortD(g.windows.cur.to)}`,
    prev_window: `${shortD(g.windows.prev.from)} – ${shortD(g.windows.prev.to)}`,
    branches:    ACTIVE_BRANCHES.map(c => `${c} ${(BRANCH_INFO[c] || {}).name || c}`).join(', '),
  };

  const draw = (copy, model) => {
    const shown = codes.filter(c => copy[c]);
    host.innerHTML =
      (copy.group ? `<div class="bn-grp">
        <div class="bn-grp-k">Across the group</div>
        <p class="bn-grp-h">${escapeHtml(copy.group.heading)}</p>
        <p class="bn-grp-b">${escapeHtml(copy.group.body)}</p>
      </div>` : '') +
      (shown.length
        ? `<div class="bn-wrap">${shown.map(c =>
            bnPanel(c, copy[c], bnByline(copy[c], Object.keys(facts).length, model))).join('')}</div>`
        : lgEmpty('No figures for the selected branches in this window.'));
  };

  const rules = bnFallback(g);
  draw(rules);

  // The staff names the page is about to print, so the function can be checked for
  // having reached for one of them.
  const names = ACTIVE_BRANCHES.flatMap(bnOwners);
  const live = await fetchBranchNarrative(g, facts, labels, names);
  if (live) {
    // Keep the rules copy for any branch the function did not cover, rather than
    // dropping a panel because one key was missing.
    const merged = Object.assign({}, rules, live);
    ACTIVE_BRANCHES.forEach(c => { if (live[c]) delete merged[c]._rules; });
    draw(merged, live._model);
  }
}
