/* ============================================================
   My Numbers: My year + How you move up (Kate, 1 Oct 2026)
   Two tabs beside This month on a stylist's own link (?t= or /me/<slug>). This
   month is performance.js, untouched; these draw into #perfMore and read only:
     perf_year_weeks_me(p_token)  her own weeks, leave and aim per week
     perf_levels(p_token)         the ladder (Stylist Levels' numbers)
   Nothing about anyone else. Not shown in the dashboard frame (embed=1) or on a
   leader's view (?admin=). Wrapped in one function: performance.js keeps esc, fmt,
   rpc and friends at the top level, so nothing here may share a global name.
   ============================================================ */
(function () {
async function call(fn, body) {
  const r = await fetch(`${SUPA_URL}/rest/v1/rpc/${fn}`, { method: 'POST',
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(fn + ' ' + r.status);
  return r.json();
}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const aed = v => 'AED ' + Math.round(v || 0).toLocaleString('en-GB');
const k = v => v >= 1000 ? (Math.round(v / 100) / 10).toString().replace(/\.0$/, '') + 'k' : String(Math.round(v));
const fmt = (v, t) => v == null ? '·' : t === 'aed' ? aed(v) : t === 'pct' ? Math.round(v) + '%' : t === 'rep' ? Number(v).toFixed(1) : Math.round(v).toLocaleString('en-GB');
const dShort = iso => new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const first = n => String(n).split(' ')[0];
const CHEV = '<svg class="chev" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 4.5 6 8.5 10 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const BRANCH = { SAA: 'Saadiyat', KCA: 'Khalifa City A', MC: 'Motor City', AQ: 'Al Quoz', FRT: 'Fratelli' };

// Same groups and labels as Stylist Levels on the dashboard (stylist-levels.js).
const GROUPS = [
  ['Sales', [['total_revenue', 'Total revenue', 'aed'], ['hair_services', 'Hair services', 'aed'], ['treatments', 'Treatments', 'aed'],
    ['treatments_pct', 'Treatments %', 'pct'], ['retail', 'Retail', 'aed'], ['retail_pct', 'Retail %', 'pct'], ['avg_bill', 'Average bill', 'aed']]],
  ['Clients', [['clients', 'Client numbers', 'num'], ['ncr', 'New client requests', 'num'], ['request_pct', 'Request rate %', 'pct'],
    ['rebooking_pct', 'Rebooking %', 'pct'], ['retention_pct', 'Retention %', 'pct'], ['conversion_pct', 'Conversion %', 'pct'],
    ['column_fill_pct', 'Column fill %', 'pct'], ['colour_pct', 'Colour %', 'pct']]],
  ['Reputation and socials', [['reputation', 'Reputation score', 'rep'], ['google_reviews', 'Google reviews', 'num'],
    ['social_feed', 'Social posts (feed)', 'num'], ['social_workdays', 'Social posts (workdays)', 'num']]],
];
// The four a stylist reads first; the rest fold away (progressive disclosure).
const HEADLINE = ['total_revenue', 'treatments', 'retail', 'rebooking_pct'];

const S = { tab: 'month', levels: [], me: null, year: null, pick: null, q: null };
const levelOf = name => S.levels.find(l => l.level === name) || null;
const nextOf = name => { const l = levelOf(name); return l ? S.levels.find(x => x.order === l.order + 1) || null : null; };

// ── THE TABS ────────────────────────────────────────────────
// This month is #app (performance.js); the other two draw into #perfMore. The month
// picker in the header only means something on This month, so it hides elsewhere.
function paint() {
  const hasLevel = !!levelOf(S.me && S.me.level);
  const tabs = document.getElementById('perfTabs'), more = document.getElementById('perfMore');
  const b = (k, l, extra = '') => `<button type="button" role="tab" aria-selected="${S.tab === k}" class="${S.tab === k ? 'on' : ''}" onclick="PerfTabs.go('${k}')"${extra}>${l}</button>`;
  tabs.innerHTML = b('month', 'This month') + b('year', 'My year')
    + b('levels', 'How you move up', hasLevel ? '' : ' disabled title="Levels for beauty are not set yet"');
  tabs.parentElement.hidden = false;
  const onMonth = S.tab === 'month';
  document.getElementById('app').hidden = !onMonth;
  more.hidden = onMonth;
  const mp = document.querySelector('.month-pick'); if (mp) mp.style.visibility = onMonth ? '' : 'hidden';
  if (onMonth) { more.innerHTML = ''; return; }
  more.innerHTML = S.tab === 'year' ? yearTab() : levelsTab();
  if (S.tab === 'year') wireChart();
}
function go(t) {
  if (t === 'levels' && !levelOf(S.me && S.me.level)) return;
  S.tab = t;
  // Kept in the address, so a refresh or a shared bookmark lands on the same tab.
  const u = new URL(location.href);
  if (t === 'month') u.searchParams.delete('tab'); else u.searchParams.set('tab', t);
  history.replaceState(null, '', u);
  paint();
  window.scrollTo(0, 0);
}
let lastW = innerWidth;
addEventListener('resize', () => { if (Math.abs(innerWidth - lastW) > 40 && S.tab === 'year' && S.year) { lastW = innerWidth; paint(); } });

async function mount(token) {
  if (!token || !document.getElementById('perfTabs')) return;
  try {
    const [levels, year] = await Promise.all([call('perf_levels', { p_token: token }), call('perf_year_weeks_me', { p_token: token })]);
    if (!year) return;                     // link not active: This month already says so
    S.levels = levels || []; S.year = year; S.me = year.staff; S.pick = S.me.level;
    const want = new URLSearchParams(location.search).get('tab');
    S.tab = want === 'year' || (want === 'levels' && levelOf(S.me.level)) ? want : 'month';
    paint();
  } catch (e) { console.warn('My year / levels unavailable', e); }
}

// ── MY YEAR ─────────────────────────────────────────────────
function yearTab() {
  const y = S.year, lvl = levelOf(S.me.level);
  const monthAim = lvl?.kpis?.total_revenue?.target ? Number(lvl.kpis.total_revenue.target) : null;
  const wkAim = monthAim ? monthAim * 12 / 52 : null;
  // The week's own aim when the token function sent one (cut for leave), else the flat one.
  const aimOf = w => w.aim != null ? Number(w.aim) : wkAim;
  const onLeave = w => (w.leave_days || 0) >= 7;
  const noData = w => w.phorest_days === 0;
  const weeks = (y.weeks || []).filter(w => (w.numbers?.total_revenue || 0) > 0 || w.current || onLeave(w) || noData(w));
  const full = weeks.filter(w => !w.current);
  const cur = weeks.find(w => w.current);
  const total = full.reduce((a, w) => a + (w.numbers.total_revenue || 0), 0);
  // A week counts towards "at aim" only when she was in and the week is uploaded.
  const counted = full.filter(w => !onLeave(w) && !noData(w) && aimOf(w) > 0);
  const atAim = wkAim ? counted.filter(w => w.numbers.total_revenue >= aimOf(w)).length : null;
  const leaveWeeks = full.filter(onLeave).length;
  const best = full.slice().sort((a, b) => b.numbers.total_revenue - a.numbers.total_revenue)[0];

  // Quarters: 1-13, 14-26, 27-39, 40-52.
  const qs = [1, 2, 3, 4].map(n => {
    const ws = full.filter(w => w.quarter === n);
    const cw = counted.filter(w => w.quarter === n);
    return { n, ws, cw, sum: ws.reduce((a, w) => a + w.numbers.total_revenue, 0),
      aimSum: ws.reduce((a, w) => a + (aimOf(w) || 0), 0),
      hit: wkAim ? cw.filter(w => w.numbers.total_revenue >= aimOf(w)).length : null };
  });
  // One next step, worked out for her (2% action: one thing, this quarter).
  const live = qs.slice().reverse().find(q => q.ws.length || (q.n === 4 && cur)) || qs[0];
  let step = '';
  if (wkAim) {
    // Weeks gone carry their own aim (less for leave); weeks to come carry the full one.
    const left = 13 - live.ws.length - (live.n === 4 && cur ? 1 : 0);
    const curIn = live.n === 4 && cur;
    const qAim = live.aimSum + (curIn ? wkAim : 0) + left * wkAim;
    const done = live.sum + (curIn ? cur.numbers.total_revenue || 0 : 0);
    step = done >= qAim
      ? `You have already reached this quarter's aim of ${aed(qAim)}. Every week from here is above it.`
      : left > 0
        ? `Q${live.n}'s aim is ${aed(qAim)}. You are at ${aed(done)}, so <b>${aed((qAim - done) / left)} a week</b> for the ${left} weeks left gets you there.`
        : `Q${live.n} finished at ${aed(done)} against an aim of ${aed(qAim)}.`;
  }

  // Kate, 1 Oct 2026: forty rows in one list was hard to find your way round. The
  // quarter cards are the way in now: tap one and its weeks show underneath, one
  // line each, newest first. Opens on the quarter she is in.
  if (S.q == null || !qs[S.q - 1] || !(qs[S.q - 1].ws.length || (S.q === 4 && cur))) S.q = live.n;
  const qCards = qs.map((q, i) => {
    const prev = i ? qs[i - 1] : null;
    const chg = prev && prev.ws.length && q.ws.length ? (q.sum - prev.sum) / prev.sum * 100 : null;
    const soFar = !q.ws.length && q.n === 4 && cur;
    const has = q.ws.length || soFar;
    const note = !q.ws.length ? (soFar ? 'started this week' : 'not started')
      : chg == null ? '' : `${chg >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(chg))}% on Q${q.n - 1}`;
    return `<button type="button" class="q${S.q === q.n ? ' on' : ''}" onclick="PerfTabs.pickQ(${q.n})" aria-pressed="${S.q === q.n}"${has ? '' : ' disabled'}>
      <span class="lbl">Q${q.n}</span>
      <span class="v">${q.ws.length ? aed(q.sum) : soFar ? aed(cur.numbers.total_revenue) : '·'}</span>
      <span class="s">${note}</span>
      ${q.cw.length && wkAim ? `<span class="s">${q.hit} of ${q.cw.length} at aim</span>` : ''}</button>`;
  }).join('');

  const pq = qs[S.q - 1];
  const qWeeks = weeks.filter(w => w.quarter === S.q).reverse();
  const rows = qWeeks.map(w => {
    const n = w.numbers || {};
    const hit = wkAim && !onLeave(w) && !noData(w) && aimOf(w) > 0 && n.total_revenue >= aimOf(w);
    if (onLeave(w) || noData(w)) return `<tr class="wk-off"><td><b>W${w.week_no}</b> <span class="wk-d">${dShort(w.week_start)}</span></td>
      <td colspan="3" class="wk-flag">${onLeave(w) ? 'On leave' : 'Not uploaded yet'}</td></tr>`;
    return `<tr><td><b>W${w.week_no}</b> <span class="wk-d">${w.current ? 'so far' : dShort(w.week_start)}${w.leave_days ? ` · ${w.leave_days}d leave` : ''}</span></td>
      <td class="r">${Math.round(n.total_revenue || 0).toLocaleString('en-GB')}${hit ? '<span class="wk-hit" title="At or above your aim"> ✓</span>' : ''}</td>
      <td class="r">${n.clients ? `${n.rebooked || 0}/${n.clients}` : '·'}</td>
      <td class="r">${Math.round(n.retail || 0).toLocaleString('en-GB')}</td></tr>`;
  }).join('');

  return `
    <section class="card">
      <div class="eyebrow">Your 2026 so far</div>
      <div class="hero-n">${aed(total)}</div>
      <div class="hero-s">${atAim != null ? `<b>${atAim} of ${counted.length}</b> weeks at or above your aim` : `${full.length} weeks`}${leaveWeeks ? ` · ${leaveWeeks} on leave, not counted` : ''}</div>
      ${step ? `<div class="step"><span class="k">Your next step</span>${step}</div>` : ''}
    </section>
    <section class="card">
      <h2>Week by week</h2>
      <div class="chart" id="pmChart">${chartSvg(weeks, wkAim, aimOf)}<div class="tip" id="pmTip"></div></div>
      <div class="legend"><span><i></i>A week</span>${cur ? '<span><i class="soft"></i>This week so far</span>' : ''}${wkAim ? '<span><i class="line"></i>Your aim</span>' : ''}</div>
      <details class="more"><summary><span><span class="when-shut">How to read this</span><span class="when-open">How to read this</span></span>${CHEV}</summary>
        <p class="why">Every bar is one week of your sales. ${wkAim ? `The dashed line is your aim: your level's ${aed(monthAim)} a month, spread across the weeks (${aed(wkAim)} a week). It drops on weeks you were on leave, so time off never counts against you.` : ''}
        One quiet week is normal. A run of them is the thing to talk about with your manager.</p></details>
    </section>
    <section class="card">
      <h2>Your quarters</h2>
      <p class="sub">13 weeks each. Tap one to see its weeks.</p>
      <div class="qs">${qCards}</div>
      <div class="wk-head"><b>Q${S.q}</b>, newest first${pq.cw.length && wkAim ? ` · ✓ means at or above your aim` : ''}</div>
      <div class="tbl-wrap"><table class="tbl wk"><thead><tr><th>Week</th><th class="r">Sales</th><th class="r">Rebooked</th><th class="r">Retail</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
      <p class="sub wk-foot">Money in AED. Rebooked is clients who booked again, out of all your clients that week.</p>
    </section>`;
}
function pickQ(n) { S.q = n; paint(); document.querySelector('#perfMore .qs')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }

function chartSvg(weeks, wkAim, aimOf) {
  if (!weeks.length) return '<p class="sub">No weeks yet this year.</p>';
  // Drawn at the width it will be shown at, so the 10px labels stay 10px on a phone.
  const W = Math.round(Math.min(720, Math.max(320, innerWidth - 66))), H = W < 500 ? 200 : 240, pad = { l: 34, r: 6, t: 22, b: 24 };
  const max = Math.max(wkAim || 0, ...weeks.map(w => w.numbers.total_revenue || 0)) * 1.08 || 1;
  const n = 53, slot = (W - pad.l - pad.r) / n, bw = Math.max(3, slot - 3);
  const x = wk => pad.l + (wk - 1) * slot;
  const y = v => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const ticks = [0, .5, 1].map(f => max / 1.08 * f);
  let s = ticks.map(t => `<line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(t)}" y2="${y(t)}"/><text class="ax" x="${pad.l - 6}" y="${y(t) + 3}" text-anchor="end">${k(t)}</text>`).join('');
  s += [1, 2, 3, 4].map(q => `<text class="ql" x="${x((q - 1) * 13 + 1)}" y="12">Q${q}</text>${q > 1 ? `<line class="grid" x1="${x((q - 1) * 13 + 1) - 1.5}" x2="${x((q - 1) * 13 + 1) - 1.5}" y1="${pad.t - 6}" y2="${H - pad.b}"/>` : ''}`).join('');
  s += weeks.map(w => {
    const v = w.numbers.total_revenue || 0, top = y(v), h = Math.max(0, H - pad.b - top), bx = x(w.week_no) + (slot - bw) / 2;
    const r = Math.min(3, bw / 2, h);
    // Rounded top, square base on the axis.
    const path = h ? `M${bx},${H - pad.b} V${top + r} Q${bx},${top} ${bx + r},${top} H${bx + bw - r} Q${bx + bw},${top} ${bx + bw},${top + r} V${H - pad.b} Z` : '';
    return `<path class="bar${w.current ? ' cur' : ''}" data-w="${w.week_no}" d="${path}"/>`;
  }).join('');
  // The guide that follows a finger or the mouse across the weeks.
  s += `<line class="guide" id="cGuide" x1="0" x2="0" y1="${pad.t - 4}" y2="${H - pad.b}"/>`;
  S.geo = { W, l: pad.l, slot, first: weeks[0].week_no, last: weeks[weeks.length - 1].week_no };
  // The aim as a step, one dash per week, so a leave week shows its lower aim.
  if (wkAim) {
    const byNo = Object.fromEntries(weeks.map(w => [w.week_no, w]));
    let d = '';
    for (let wk = 1; wk <= 52; wk++) {
      const w = byNo[wk], a = w ? aimOf(w) : wkAim;
      if (a > 0) d += `M${x(wk)},${y(a)} H${x(wk) + slot}`;
    }
    s += `<path class="aim" d="${d}" fill="none"/>`;
  }
  s += (W < 500 ? [1, 14, 27, 40] : [1, 14, 27, 40, 52]).map(wk =>
 `<text class="ax" x="${x(wk) + slot / 2}" y="${H - 8}" text-anchor="middle">W${wk}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" tabindex="0" role="img" aria-label="Weekly sales for 2026${wkAim ? ', with your aim as a dashed line' : ''}. Slide along it, or use the arrow keys, to read each week. Every figure is also in the weeks list under Your quarters.">${s}</svg>`;
}

function wireChart() {
  const box = document.getElementById('pmChart'), tip = document.getElementById('pmTip');
  const svg = box && box.querySelector('svg');
  if (!svg || !S.geo) return;
  const g = S.geo, guide = svg.querySelector('#cGuide');
  const byNo = Object.fromEntries((S.year.weeks || []).map(w => [w.week_no, w]));
  const bars = Object.fromEntries([...svg.querySelectorAll('.bar')].map(b => [b.dataset.w, b]));
  let on = null, hideT = null;

  const show = wk => {
    wk = Math.max(g.first, Math.min(g.last, wk));
    const w = byNo[wk]; if (!w) return;
    box.classList.add('scrub');
    if (on !== wk) {
      if (on != null && bars[on]) bars[on].classList.remove('hl');
      if (bars[wk]) bars[wk].classList.add('hl');
      on = wk;
      const n = w.numbers || {};
      tip.innerHTML = (w.leave_days >= 7) ? `<b>On leave</b>W${w.week_no} · ${dShort(w.week_start)}`
        : w.phorest_days === 0 ? `<b>Not uploaded yet</b>W${w.week_no} · ${dShort(w.week_start)}`
        : `<b>${aed(n.total_revenue)}</b>W${w.week_no} · ${w.current ? 'so far' : dShort(w.week_start)}${w.aim != null ? ` · aim ${aed(w.aim)}` : ''}<br>${n.clients || 0} clients · ${n.rebooked || 0} rebooked${w.leave_days ? ` · ${w.leave_days} days leave` : ''}`;
    }
    // Centre of the week's slot, in the svg's own units, then in page pixels.
    const cx = g.l + (wk - 1) * g.slot + g.slot / 2;
    guide.setAttribute('x1', cx); guide.setAttribute('x2', cx);
    const px = cx * box.clientWidth / g.W;
    const left = Math.max(0, Math.min(box.clientWidth - tip.offsetWidth, px - tip.offsetWidth / 2));
    tip.style.transform = `translate(${left}px, -6px)`;
  };
  const hide = () => {
    box.classList.remove('scrub');
    if (on != null && bars[on]) bars[on].classList.remove('hl');
    on = null;
  };
  const weekAt = e => {
    const r = svg.getBoundingClientRect();
    const sx = (e.clientX - r.left) * g.W / r.width;
    return Math.floor((sx - g.l) / g.slot) + 1;
  };

  svg.addEventListener('pointermove', e => { clearTimeout(hideT); show(weekAt(e)); });
  svg.addEventListener('pointerdown', e => { clearTimeout(hideT); show(weekAt(e)); });
  // Mouse: gone when the pointer leaves. Finger: it stays a moment after lifting, so
  // the figure can be read, then fades.
  svg.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hide(); });
  svg.addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') { clearTimeout(hideT); hideT = setTimeout(hide, 2500); } });
  svg.addEventListener('pointercancel', () => { hideT = setTimeout(hide, 1200); });
  // Keyboard: left and right walk the weeks, starting from the latest.
  svg.addEventListener('keydown', e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    show((on ?? g.last + (e.key === 'ArrowLeft' ? 1 : 0)) + (e.key === 'ArrowLeft' ? -1 : 1));
  });
  svg.addEventListener('blur', hide);
}

// ── HOW YOU MOVE UP ─────────────────────────────────────────
function levelsTab() {
  const mine = levelOf(S.me.level), next = nextOf(S.me.level);
  const pick = levelOf(S.pick) || mine, pickNext = nextOf(pick.level);
  const tagOf = l => l.level === mine.level ? 'You are here' : next && l.level === next.level ? 'Next' : '';
  const ladder = S.levels.map(l => `<li class="${l.level === mine.level ? 'you' : ''}"><button type="button" class="${l.level === pick.level ? 'pick' : ''}" onclick="PerfTabs.pickLevel('${esc(l.level)}')" aria-pressed="${l.level === pick.level}">
      <span class="n">${l.order}</span><span class="nm">${esc(l.level)}</span><span class="tag">${tagOf(l)}</span></button></li>`).join('');

  const row = ([key, label, t]) => {
    const a = pick.kpis[key]; if (!a) return '';
    const b = pickNext && pickNext.kpis[key];
    // Money without "AED" in every cell (the line above the table says so), so a phone row stays on one line.
    const f = v => t === 'aed' ? (v == null ? '·' : Math.round(v).toLocaleString('en-GB')) : fmt(v, t);
    return `<tr><td>${label}</td><td class="r">${f(a.min)}</td><td class="r"><b>${f(a.target)}</b></td>${pickNext ? `<td class="r">${b ? f(b.target) : '·'}</td>` : ''}</tr>`;
  };
  const head = `<thead><tr><th>Measure</th><th class="r">Holds it</th><th class="r">Aim</th>${pickNext ? `<th class="r">${esc(pickNext.level)}</th>` : ''}</tr></thead>`;
  const headRows = GROUPS.flatMap(g => g[1]).filter(m => HEADLINE.includes(m[0])).sort((a, b) => HEADLINE.indexOf(a[0]) - HEADLINE.indexOf(b[0])).map(row).join('');
  const allRows = GROUPS.map(([g, ms]) => {
    const body = ms.map(row).join('');
    return body ? `<tr class="grp"><td colspan="4">${g}</td></tr>${body}` : '';
  }).join('');
  const isMine = pick.level === mine.level;

  return `
    <section class="card">
      <h2>How you move up</h2>
      <p class="why"><b>What this is:</b> the six levels, and the numbers each one asks for: a number that <b>holds</b> the level, and an <b>aim</b> to work towards. Your manager talks you through your next step.</p>
      <ol class="ladder" aria-label="Levels, top level last">${ladder}</ol>
      <p class="sub">Tap a level to see its numbers.</p>
    </section>
    <section class="card lv-card">
      <div class="eyebrow">${isMine ? 'Your level' : 'Level ' + pick.order + ' of ' + S.levels.length}</div>
      <h2>${esc(pick.level)}</h2>
      <p class="sub">${pickNext ? `The last column is what ${esc(pickNext.level)} asks for.` : 'The top of the ladder.'} Monthly numbers, money in AED.</p>
      <div class="tbl-wrap lv-head"><table class="tbl">${head}<tbody>${headRows}</tbody></table></div>

      <details class="more"><summary><span><span class="when-shut">Show all ${GROUPS.reduce((a, g) => a + g[1].filter(m => pick.kpis[m[0]]).length, 0)} measures</span><span class="when-open">Show fewer</span> <span class="hint when-shut">· plus clients, socials</span></span>${CHEV}</summary>
        <div class="tbl-wrap"><table class="tbl">${head}<tbody>${allRows}</tbody></table></div></details>
      ${isMine && next ? `<div class="step"><span class="k">Where you are this month</span>Your own numbers against these sit on This month, under "Your next step up".</div>` : ''}
    </section>`;
}
function pickLevel(l) { S.pick = l; paint(); }

window.PerfTabs = { mount, go, pickQ, pickLevel };
})();
