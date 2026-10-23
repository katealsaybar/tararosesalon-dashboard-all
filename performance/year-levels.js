/* ============================================================
   My Numbers: My year + How you move up (Kate, 1 Oct 2026)
   Two tabs beside This month on a stylist's own link (?t= or /me/<slug>). This
   month is performance.js, untouched; these draw into #perfMore and read only:
     perf_year_weeks_me(p_token)  her own weeks, leave and aim per week
     perf_levels(p_token)         the ladder (Stylist Levels' numbers)
     perf_podium_stats_me(p_token) the Podium Race, every stat, for her own team only (19 and 23 Oct 2026)
   Nothing else about anyone else. Not shown in the dashboard frame (embed=1) or on a
   leader's view (?admin=). Wrapped in one function: performance.js keeps esc, fmt,
   rpc and friends at the top level, so nothing here may share a global name.
   ============================================================ */
(function () {
async function call(fn, body) {
  const r = await fetch(`${SUPA_URL}/rest/v1/rpc/${fn}`, { method: 'POST',
    headers: await PerfAuth.headers(), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(fn + ' ' + r.status + ' ' + await r.text());
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

const S = { podPer: 'month', podScope: 'all', podRangeOk: null, podCache: {}, podLoad: null, podMsg: '', podAll: false, podStat: null, tab: 'month', levels: [], me: null, year: null, pick: null, o2o: null, token: null, pod: null, podLast: false, podCur: null };
const levelOf = name => S.levels.find(l => l.level === name) || null;
const nextOf = name => { const l = levelOf(name); return l ? S.levels.find(x => x.order === l.order + 1) || null : null; };

// ── THE TABS ────────────────────────────────────────────────
// This month is #app (performance.js); the other two draw into #perfMore. The month
// picker in the header only means something on This month, so it hides elsewhere.
function tabBar() {
  const hasLevel = !!levelOf(S.me && S.me.level);
  const b = (k, l, short, extra = '') => `<button type="button" role="tab" aria-selected="${S.tab === k}" aria-label="${l}" class="${S.tab === k ? 'on' : ''}" onclick="PerfTabs.go('${k}')"${extra}><span class="tl">${l}</span><span class="ts" aria-hidden="true">${short}</span></button>`;
  return b('month', 'This month', 'Month') + b('year', 'My year', 'Year') + (S.pod ? b('podium', 'Podium Race', 'Podium') : '')
    + (hasLevel ? b('levels', 'How you move up', 'Move up') : '') + (S.o2o ? b('one', 'My 1-to-1', '1-to-1') : '');
}
function paint() {
  const tabs = document.getElementById('perfTabs'), more = document.getElementById('perfMore');
  // Kate, 19 Oct 2026: on a phone the bar is underline tabs with the short name (Month, Year, Podium, Move up, 1-to-1);
  // the full name stays for screen readers and for the wider pill bar.
  // No levels for her team (beauty, so far): no "How you move up" tab at all, rather
  // than a greyed-out one (Kate, 2 Oct 2026). It comes back by itself once
  // perf_benchmarks carries levels for that team.
  // My 1-to-1 (Kate, 7 Oct 2026): only for a stylist the trial is switched on for
  // (perf_one2one_me answers null for everyone else), drawn by one2one.js.
  tabs.innerHTML = tabBar();
  tabs.parentElement.hidden = false;
  const onMonth = S.tab === 'month';
  document.getElementById('app').hidden = !onMonth;
  more.hidden = onMonth;
  // Kate, 7 Oct 2026: gone, not just invisible: it left a blank gap between the home and Light buttons.
  const mp = document.querySelector('.month-pick:not(.year-pick)'); if (mp) mp.style.display = onMonth ? '' : 'none';
  // Kate, 22 Oct 2026: the Year toggle belongs to My year, and only when there is more than one year to pick.
  const yp = document.querySelector('.year-pick'); if (yp) yp.style.display = S.tab === 'year' && S.year && (S.year.years || []).length > 1 ? '' : 'none';
  if (onMonth) { more.innerHTML = ''; placeNudge(); return; }
  if (S.tab === 'one') {
    more.innerHTML = '';
    window.PerfO2O.me(more, { token: S.token, data: S.o2o, reload: async () => { S.o2o = await call('perf_one2one_me', { p_token: S.token }); paint(); } });
    return;
  }
  more.innerHTML = S.tab === 'year' ? yearTab() : S.tab === 'podium' ? podiumTab() : levelsTab();
  if (S.tab === 'year') wireChart();
  if (S.tab === 'podium') { const c = more.querySelector('.pod-chips'), on = c && c.querySelector('.on'); if (on) c.scrollLeft = on.offsetLeft - (c.clientWidth - on.offsetWidth) / 2; }
}
// The 1-to-1 line under the win and tip on This month. performance.js redraws #app now and then
// (the Ledger | Phorest switch), so it is put back whenever the page changes under it.
function placeNudge() {
  const app = document.getElementById('app');
  if (!app || S.tab !== 'month') return;
  const n = S.o2o && window.PerfO2O ? PerfO2O.nudge(S.o2o) : null, old = app.querySelector('.o2o-nudge');
  if (!n) { if (old) old.remove(); return; }
  if (old && old.dataset.h === n.key) return;
  if (old) old.remove();
  const anchor = app.querySelector('.wintip') || app.querySelector('.hero');
  if (anchor) anchor.insertAdjacentHTML('afterend', n.html);
}
// Kate, 22 Oct 2026: "should also have year toggle sa taas". perf_year_weeks_me takes a year and says which ones exist (years), so the header
// gets a Year pill next to where Month sits on This month. Picking one redraws My year for that year and keeps it in the address (?y=).
function buildYearPick() {
  const wrap = document.querySelector('.year-pick .pdd'), sel = document.getElementById('yearSel');
  if (!wrap || !sel || typeof pillMenu !== 'function' || !S.year) return;
  wrap.querySelectorAll('.pdd-btn, .pdd-menu').forEach(n => n.remove());
  wrap.classList.remove('open');
  sel.innerHTML = (S.year.years || []).map(y => `<option value="${y}"${y === S.year.year ? ' selected' : ''}>${y}</option>`).join('');
  sel.onchange = async () => {
    const y = +sel.value;
    try {
      const next = await call('perf_year_weeks_me', { p_token: S.token, p_year: y });
      if (next) {
        S.year = next;
        const u = new URL(location.href);
        u.searchParams.set('y', String(y));
        history.replaceState(null, '', u);
      }
    } catch (e) { console.warn('Year not available', e); }
    buildYearPick();
    paint();
  };
  pillMenu(sel);
}
function go(t) {
  if (t === 'levels' && !levelOf(S.me && S.me.level)) return;
  if (t === 'one' && !S.o2o) return;
  if (t === 'podium' && !S.pod) return;
  S.tab = t;
  if (t === 'podium') S.podStat = null;      // the tab opens on all her places; a board is one tap in
  // Kept in the address, so a refresh or a shared bookmark lands on the same tab.
  const u = new URL(location.href);
  if (t === 'month') u.searchParams.delete('tab'); else u.searchParams.set('tab', t);
  u.searchParams.delete('stat');
  history.replaceState(null, '', u);
  paint();
  window.scrollTo(0, 0);
}
let lastW = innerWidth;
addEventListener('resize', () => { if (Math.abs(innerWidth - lastW) > 40 && S.tab === 'year' && S.year) { lastW = innerWidth; paint(); } });

async function mount(token) {
  if (!token || !document.getElementById('perfTabs')) return;
  try {
    // The Podium is read apart: if it is slow or fails, the other tabs still open and this one is simply not there.
    // Kate, 23 Oct 2026: it now carries every board, so the tab bar no longer waits for it; the Podium tab simply appears when it lands.
    const podP = loadPod(token, null);
    const [levels, year, o2o] = await Promise.all([call('perf_levels', { p_token: token }), call('perf_year_weeks_me', { p_token: token, p_year: +new URLSearchParams(location.search).get('y') || null }),
      window.PerfO2O ? call('perf_one2one_me', { p_token: token }).catch(() => null) : null]);
    if (!year) return;                     // link not active: This month already says so
    S.levels = levels || []; S.year = year; S.me = year.staff; S.pick = S.me.level; S.token = token; S.o2o = o2o && o2o.enabled ? o2o : null;
    const want = new URLSearchParams(location.search).get('tab');
    const takePod = pod => {
      S.pod = pod; S.podCur = pod ? pod.month : null; S.podPer = 'month'; S.podLast = false; S.podCache = pod ? { month: pod } : {};
      if (pod && S.podRangeOk === null) podProbe(token);
      const st = new URLSearchParams(location.search).get('stat'); S.podStat = pod && st && pstat(st) && pod.stats[st] ? st : null;
    };
    if (want === 'podium') takePod(await podP);       // a bookmark to the tab waits for it
    buildYearPick();
    S.tab = want === 'year' || (want === 'podium' && S.pod) || (want === 'levels' && levelOf(S.me.level)) || (want === 'one' && S.o2o) ? want : 'month';
    paint();
    if (want !== 'podium') podP.then(pod => { takePod(pod); const t = document.getElementById('perfTabs'); if (t) t.innerHTML = tabBar(); });
    if (S.o2o) new MutationObserver(placeNudge).observe(document.getElementById('app'), { childList: true });
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

  // One next step, worked out for her (2% action: one thing, this year). Kate, 7 Oct 2026:
  // no quarters on the staff link, so it reads against the year's 52 weeks.
  let step = '';
  if (wkAim) {
    const lastNo = cur ? cur.week_no : (full.length ? full[full.length - 1].week_no : 0);
    const left = Math.max(0, 52 - lastNo);
    // Weeks gone carry their own aim (less for leave); weeks to come carry the full one.
    const yAim = full.reduce((a, w) => a + (aimOf(w) || 0), 0) + (cur ? wkAim : 0) + left * wkAim;
    const done = total + (cur ? cur.numbers.total_revenue || 0 : 0);
    step = done >= yAim
      ? `You have already reached this year's aim of ${aed(yAim)}. Every week from here is above it.`
      : left > 0
        ? `This year's aim is ${aed(yAim)}. You are at ${aed(done)}, so <b>${aed((yAim - done) / left)} a week</b> for the ${left} weeks left gets you there.`
        : `The year finished at ${aed(done)} against an aim of ${aed(yAim)}.`;
  }

  // Weeks 1 to 52 in one list, newest first (Kate, 7 Oct 2026: no quarters).
  const allWeeks = weeks.slice().reverse();
  const rows = allWeeks.map(w => {
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
      <div class="eyebrow">Your ${y.year}${(y.years || [])[0] > y.year ? '' : ' so far'}</div>
      <div class="hero-n">${aed(total)}</div>
      <div class="hero-s">${atAim != null ? `<b>${atAim} of ${counted.length}</b> weeks at or above your aim` : `${full.length} weeks`}${leaveWeeks ? `, ${leaveWeeks} on leave and not counted` : ''}</div>
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
      <h2>Weeks 1 to 52</h2>
      <p class="sub">Newest first${counted.length && wkAim ? '. ✓ means at or above your aim' : ''}.</p>
      <div class="tbl-wrap"><table class="tbl wk"><thead><tr><th>Week</th><th class="r">Sales</th><th class="r">Rebooked</th><th class="r">Retail</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
      <p class="sub wk-foot">Money in AED. Clients are the branch ledger's count, whichever source This month is showing. Rebooked is clients who booked again, out of all your clients that week.</p>
    </section>`;
}

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
  s += (W < 500 ? [1, 26, 52] : [1, 13, 26, 39, 52]).map(wk =>
 `<text class="ax" x="${x(wk) + slot / 2}" y="${H - 8}" text-anchor="middle">W${wk}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" tabindex="0" role="img" aria-label="Weekly sales for ${S.year.year}${wkAim ? ', with your aim as a dashed line' : ''}. Slide along it, or use the arrow keys, to read each week. Every figure is also in the weeks list under Weeks 1 to 52.">${s}</svg>`;
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

// ── PODIUM RACE ─────────────────────────────────────────────
// Kate, 19 Oct 2026: where she stands on the Podium Race, on her own link, for her own team only (hair with hair, beauty with
// beauty). Kate, 23 Oct 2026: "show the podium race's other stats", and make it easy for anyone. perf_podium_stats_me(p_token)
// answers every board in one call, so there are two levels and no waiting between them:
//   1. Where you stand: one card per stat with her place ("7th of 35") and her figure; the top three are marked.
//   2. One board: tap a card and read the whole team in order, with a row of chips to hop to the next stat and a way back.
// Every row is a name, a branch and one figure; nothing else about anyone. If the new call is not there, the old single
// board (perf_podium_me, total sales) is drawn instead, so the tab never goes blank.
const ord = n => { const v = n % 100, t = ['th', 'st', 'nd', 'rd']; return n + (t[(v - 20) % 10] || t[v] || t[0]); };
const monthName = iso => new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { month: 'long' });

// Plain words, grouped the way This month groups them. f: aed | pct | num. unit is the column heading on a board.
const PSTATS = [
  ['Sales', [
    { k: 'sales', name: 'Total sales', f: 'aed', unit: 'AED', what: 'Services and retail together, before VAT. This is your net take.', none: 'Your place appears as soon as your first sale is in.' },
    { k: 'services', name: 'Services', f: 'aed', unit: 'AED', what: 'What you took on services, before VAT. It is your Total revenue on This month.', none: 'No services in your numbers yet.' },
    { k: 'retail', name: 'Retail', f: 'aed', unit: 'AED', what: 'Products you sold, before VAT.', none: 'No retail yet this month.' },
    { k: 'treatments', name: 'Treatments', f: 'aed', unit: 'AED', what: 'Treatment sales, from the branch ledger.', none: 'No treatments yet this month.' }]],
  ['Clients', [
    { k: 'rebooking', name: 'Rebooking', f: 'pct', unit: '%', what: 'The share of your clients who booked their next visit before leaving, from Phorest.', foot: 'It counts once someone has 20 visits in the month, so one lucky day cannot top the board. Anyone under that is not listed yet.', none: 'It starts counting once you have 20 visits in the month.' },
    { k: 'ncr', name: 'New client requests', f: 'num', unit: 'Requests', what: 'New clients who asked for you by name.', none: 'No new client requests yet this month.' },
    { k: 'clients', name: 'Clients', f: 'num', unit: 'Visits', what: 'Visits you looked after, from Phorest.', none: 'No visits in your numbers yet.' }]],
  ['Reputation', [
    { k: 'reviews', name: 'Google reviews', f: 'num', unit: 'Reviews', what: 'Google reviews that name you.', none: 'No Google reviews naming you yet this month.' },
    { k: 'posts', name: 'Instagram posts', f: 'num', unit: 'Posts', what: 'Posts and Reels that tag the salon and you.', foot: 'Only people with their Instagram handle on file are listed.', none: 'No tagged posts yet this month.' }]],
];
const PALL = PSTATS.flatMap(g => g[1]);
const pstat = k => PALL.find(x => x.k === k) || null;
// Worth a board: more than just her, except Total sales, which has always shown "just you, so far".
const pvisible = (p, x) => { const s = p.stats[x.k]; return !!s && (x.k === 'sales' ? s.ranked >= 1 : s.ranked >= 2); };
const pval = (x, v) => x.f === 'aed' ? Math.round(v).toLocaleString('en-GB') : x.f === 'pct' ? Number(v).toFixed(1).replace(/\.0$/, '') + '%' : Math.round(v).toLocaleString('en-GB');
const pvalFull = (x, v) => x.f === 'aed' ? 'AED ' + pval(x, v) : pval(x, v) + (x.f === 'num' ? ' ' + (Math.round(v) === 1 ? x.unit.toLowerCase().replace(/s$/, '') : x.unit.toLowerCase()) : '');

async function loadPod(token, iso) {
  try {
    const r = await call('perf_podium_stats_me', { p_token: token, p_month: iso });
    if (r && r.stats && r.stats.sales) return r;
  } catch (e) { console.warn('Podium stats unavailable, drawing the one board', e); }
  const o = await call('perf_podium_me', { p_token: token, p_month: iso }).catch(() => null);
  if (!o || !o.board) return null;
  return { month: o.month, to: o.to, dept: o.dept, stats: { sales: { ranked: o.ranked, me: o.me ? { rank: o.me.rank, value: o.me.amount } : null,
    board: o.board.map(r => ({ rank: r.rank, name: r.name, branch: r.branch, value: r.amount, me: r.me })) } } };
}
// Kate, 23 Oct 2026: the same filter principles as the management Podium Race, a period, a stat to rank by and the salon. The period is
// This month, Last month, This year and All time; the stat is the chip row under the board; the salon is Everyone or her own. This month and
// Last month are one-month calls as before. This year and All time read perf_podium_range_me (migrations/perf_podium_alltime.sql), which
// sums a monthly rollup and works the month in progress live. Nothing but a one-line "is it installed" check runs on load; a longer window is
// read only when she taps it, shows "working it out" at once, and is kept for the rest of the visit.
const PODFIRST = '2021-05-01';          // where Phorest's staff figures begin
async function podProbe(token) {
  S.podRangeOk = false;
  try {
    const r = await call('perf_podium_range_me', { p_token: token, p_from: null, p_to: null });
    S.podRangeOk = !!(r && r.ready);
  } catch (e) { S.podRangeOk = false; }
  if (S.podRangeOk) { if (S.tab === 'podium') paint(); const t = document.getElementById('perfTabs'); if (t) t.innerHTML = tabBar(); }
}
async function loadPodRange(token, from) {
  const r = await call('perf_podium_range_me', { p_token: token, p_from: from, p_to: null });
  return r && r.stats && r.stats.sales ? r : null;
}
const PODLABEL = { month: 'this month', last: 'last month', year: 'this year', all: 'all time' };
async function podPeriod(per) {
  if (S.podLoad || per === S.podPer) return;
  const prev = S.podPer;
  S.podMsg = '';
  let r = S.podCache[per];
  if (!r) {
    S.podLoad = per; paint();
    try {
      const d = new Date(S.podCur + 'T00:00:00');
      if (per === 'month' || per === 'last') {
        const m = per === 'last' ? new Date(d.getFullYear(), d.getMonth() - 1, 1) : d;
        r = await loadPod(S.token, `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}-01`);
      } else r = await loadPodRange(S.token, per === 'year' ? `${d.getFullYear()}-01-01` : PODFIRST);
    } catch (e) { r = null; }
    S.podLoad = null;
    if (r) S.podCache[per] = r; else S.podMsg = 'That did not load. Try again in a moment.';
  }
  if (r) { S.pod = r; S.podPer = per; S.podLast = per === 'last'; S.podAll = false; } else S.podPer = prev;
  paint();
}
function podScope(k) { S.podScope = k === 'mine' ? 'mine' : 'all'; S.podAll = false; paint(); }
// Her own salon only: the same boards, filtered to her salon and ranked again among them.
function podMyBranch(p) {
  for (const k of Object.keys(p.stats)) { const m = p.stats[k].board.find(r => r.me); if (m && m.branch) return m.branch; }
  return null;
}
function podScoped(p) {
  const b = S.podScope === 'mine' ? podMyBranch(p) : null;
  if (!b) return p;
  const stats = {};
  for (const k of Object.keys(p.stats)) {
    const rows = p.stats[k].board.filter(r => r.branch === b).map(r => ({ ...r, rank: 1 + p.stats[k].board.filter(o => o.branch === b && o.value > r.value).length }));
    const me = rows.find(r => r.me);
    stats[k] = { ranked: rows.length, me: me ? { rank: me.rank, value: me.value } : null, board: rows };
  }
  return { ...p, stats, scopeName: BRANCH[b] || b };
}
// Pick the stat the team board shows. Kept in the address so a refresh or a shared bookmark lands on it. Kate, 23 Oct 2026: the whole team
// is on the page now, not a second screen, so this moves the board and brings it into view rather than opening a new page.
function podStat(key) {
  S.podStat = key || null; S.podAll = false;
  const u = new URL(location.href);
  if (S.podStat) u.searchParams.set('stat', S.podStat); else u.searchParams.delete('stat');
  history.replaceState(null, '', u);
  paint();
  const b = document.getElementById('podBoard');
  if (b) b.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
// All the rows of the board, or the top eight and her.
function podAllToggle() { S.podAll = !S.podAll; paint(); }
function podSeg() {
  const per = [['month', 'This month'], ['last', 'Last month']].concat(S.podRangeOk ? [['year', 'This year'], ['all', 'All time']] : []);
  const mine = podMyBranch(S.pod);
  const busy = !!S.podLoad;
  return `<div class="pod-seg" role="group" aria-label="Period">${per.map(([k, l]) =>
      `<button type="button" class="${S.podPer === k ? 'on' : ''}" onclick="PerfTabs.period('${k}')" aria-pressed="${S.podPer === k}"${busy ? ' disabled' : ''}>${l}</button>`).join('')}</div>
    ${mine ? `<div class="pod-seg pod-seg2" role="group" aria-label="Who">
      <button type="button" class="${S.podScope === 'all' ? 'on' : ''}" onclick="PerfTabs.scope('all')" aria-pressed="${S.podScope === 'all'}">Everyone</button>
      <button type="button" class="${S.podScope === 'mine' ? 'on' : ''}" onclick="PerfTabs.scope('mine')" aria-pressed="${S.podScope === 'mine'}">${esc(BRANCH[mine] || mine)} only</button></div>` : ''}
    ${busy ? `<p class="sub pr-load" role="status">Working out ${PODLABEL[S.podLoad]}. A few seconds.</p>` : ''}${S.podMsg ? `<p class="sub pr-load" role="status">${esc(S.podMsg)}</p>` : ''}`;
}

// Kate, 23 Oct 2026 (mock-up approved in docs/mockups/podium-race-staff-link.html): one page, top to bottom. Her win first, the place she is
// closest to winning, her place on every stat as one list, then the whole team in order for the stat she picked, with the rest of the stats a chip away.
const POD_TOP = 8;   // rows of the board shown before "Show all"
const podGap = (x, g) => x.f === 'aed' ? 'AED ' + Math.round(g).toLocaleString('en-GB') : x.f === 'pct' ? Number(g).toFixed(1).replace(/\.0$/, '') + ' points' : Math.round(g).toLocaleString('en-GB');
function podiumTab() {
  const p = podScoped(S.pod), per = S.podPer, base = p.dept === 'Beauty' ? 'Beauty team' : 'Hair team';
  const team = p.scopeName ? `${base} at ${p.scopeName}` : base;
  const mn = per === 'year' ? 'this year' : per === 'all' ? 'all time' : monthName(p.month);
  const through = p.to ? dShort(p.to) : '', live = per !== 'last', was = live ? 'are' : 'were';
  const since = per === 'all' ? new Date(S.pod.from + 'T00:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : '';
  const inWin = per === 'month' ? 'in the month' : per === 'last' ? 'that month' : 'in this window';
  const noneOf = x => per === 'month' ? x.none : x.none.replace(/yet this month\./, per === 'last' ? 'yet that month.' : 'yet in this window.');
  const shown = PALL.filter(x => pvisible(p, x));
  const cur = shown.find(x => x.k === S.podStat) || shown[0];
  const mine = x => p.stats[x.k].me;

  // 1. her win
  const firsts = shown.filter(x => mine(x) && mine(x).rank === 1).map(x => x.name);
  const words = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
  const list = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
  const win = firsts.length
    ? `<b>You ${was} 1st on ${words[firsts.length] || firsts.length} of them.</b><p>${esc(list(firsts))}. That is the part to be proud of.</p>`
    : `<b>Here is where you stand.</b><p>A race is a moment, not a verdict. ${live ? 'Your place can change by tomorrow.' : 'A new month starts fresh for all of us.'}</p>`;

  // 2. her closest chance: the stat she is best placed on without being first, and how far the place above is
  let chance = '';
  if (live && per === 'month') {
    const t = shown.filter(x => mine(x) && mine(x).rank > 1).sort((a, b) => mine(a).rank - mine(b).rank)[0];
    if (t) {
      const s = p.stats[t.k], up = s.board.filter(r => r.rank < mine(t).rank).pop(), gap = up ? up.value - mine(t).value : 0;
      chance = `<section class="pr-chance"><div class="eyebrow">Your closest chance</div>
        <p><b>${esc(t.name)}: you are ${ord(mine(t).rank)} of ${s.ranked}.</b>${gap > 0 ? ` The place above you is ${esc(podGap(t, gap))} ahead.` : ''}${t.k === 'rebooking' ? ' Ask for the next visit before she leaves the chair.' : ''}</p></section>`;
    }
  }

  // 3. her places, one list
  const row = x => {
    const s = p.stats[x.k], me = s.me, top = me && me.rank <= 3;
    const pos = me && s.ranked > 1 ? (me.rank - 1) / (s.ranked - 1) * 100 : 0;
    const body = me
      ? `<span class="pr-p"><b>${ord(me.rank)}</b><small>of ${s.ranked}</small></span><span class="pr-v">${esc(pvalFull(x, me.value))}</span><span class="pr-track"><i style="left:${pos}%"></i></span>`
      : `<span class="pr-p none"><b>Not yet</b></span><span class="pr-v">${esc(noneOf(x))}</span>`;
    return `<button type="button" class="pr${top ? ' top' : ''}${me ? '' : ' none'}${x.k === cur.k ? ' sel' : ''}" onclick="PerfTabs.stat('${x.k}')"
      aria-label="${esc(x.name)}: ${me ? `you are ${ord(me.rank)} of ${s.ranked}` : 'not ranked yet'}. Show the whole team for it.">
      <span class="pr-n">${esc(x.name)}</span>${body}</button>`;
  };
  const groups = PSTATS.map(([g, xs]) => {
    const t = xs.filter(x => pvisible(p, x)).map(row).join('');
    return t ? `<h3 class="pt-grp">${g}</h3><div class="pr-list">${t}</div>` : '';
  }).join('');

  // 4. the whole team, for the stat she picked
  const s = p.stats[cur.k], me = s.me, n = s.ranked;
  const chips = shown.map(c => `<button type="button" class="${c.k === cur.k ? 'on' : ''}" onclick="PerfTabs.stat('${c.k}')" aria-pressed="${c.k === cur.k}">${esc(c.name)}</button>`).join('');
  const rows = S.podAll ? s.board : s.board.filter(r => r.rank <= POD_TOP || r.me);
  let prev = 0;
  const body = rows.map(r => {
    const gap = !S.podAll && prev && r.rank - prev > 1 ? '<tr class="gap"><td colspan="3">…</td></tr>' : '';
    prev = r.rank;
    return gap + `<tr class="${r.me ? 'me' : ''}"><td class="pl"><span class="rk${r.rank <= 3 ? ' podtop' : ''}">${r.rank}</span></td>
      <td>${esc(r.name)}${r.me ? ' <span class="you-tag">You</span>' : ''}<span class="br">${esc(BRANCH[r.branch] || r.branch || '')}</span></td>
      <td class="r">${esc(pval(cur, r.value))}</td></tr>`;
  }).join('');
  const more = s.board.length > POD_TOP + 1 ? `<button type="button" class="pr-more" onclick="PerfTabs.all()">${S.podAll ? 'Show the top ' + POD_TOP + ' and me' : 'Show all ' + n}</button>` : '';
  return `
    <section class="card">
      <div class="eyebrow">Podium Race${per === 'month' ? (through ? ', to ' + through : ', ' + mn) : per === 'all' ? ', all time, since ' + since : per === 'year' ? ', ' + new Date(p.to + 'T00:00:00').getFullYear() + ' so far' : ', ' + mn}</div>
      <h2>Where you stand on the ${team}</h2>
      <p class="sub">Your place on each one for ${per === 'month' ? mn + ' so far' : per === 'year' ? 'the year so far' : per === 'all' ? 'all time' : mn}. ${p.scopeName ? 'Only the ' + esc(p.scopeName) + ' team is below.' : 'Everyone on the ' + team + ' is below.'}</p>
      ${podSeg()}
      <div class="pr-win">${win}</div>
      ${chance}
      ${groups}
    </section>
    <section class="card" id="podBoard">
      <h2>The ${team}: ${esc(cur.name)}</h2>
      <p class="sub">${n === 1 ? 'Just you, so far.' : n + ' people, in order.'}${me ? ' You ' + was + ' ' + ord(me.rank) + '.' : ''} ${esc(cur.what)}</p>
      <div class="pod-chips" role="group" aria-label="Choose a stat">${chips}</div>
      <div class="tbl-wrap"><table class="tbl pod"><thead><tr><th class="pl">Place</th><th>Name</th><th class="r">${esc(cur.unit)}</th></tr></thead><tbody>${body}</tbody></table></div>
      ${more}
      <p class="sub wk-foot">${cur.k === 'sales' ? 'Sales are services plus retail before VAT, the same figures as This month. ' : ''}Anyone with nothing yet ${inWin} is not listed.${cur.foot ? ' ' + esc(cur.foot) : ''} A race is a moment, not a verdict: it moves every day, and a place only tells you where you are today.</p>
    </section>`;
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

window.PerfTabs = { mount, go, pickLevel, period: podPeriod, scope: podScope, stat: podStat, all: podAllToggle };
})();
