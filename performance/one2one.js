/* ============================================================
   My 1-to-1 and Goals (Kate, 7 Oct 2026). Monthly 1-to-1 (HR-10, with the Stylist Priorities
   Checklist) and yearly Goals (HR-09). Trial: Ibrahim only (perf_staff.one2one_on).
   Two faces of one module:
     me(el, ctx)      a stylist's own link, the fourth tab, read-only. She sees a record once a
                      leader has signed it, and confirms it (her signature). perf_one2one_me,
                      perf_one2one_confirm.
     leader(el, ctx)  Staff Benchmarks, a leader key only (Kate, Tara, Emma): two editable cards
                      that autosave a draft, then Sign off. perf_one2one_get / save / sign /
                      reopen. The viewer and payroll keys get nothing.
   The 13-week numbers are never typed: the database works them out and freezes them at
   sign-off, so a signed copy and its PDF never change. Wrapped in one function: performance.js
   keeps esc, fmt, rpc and friends at the top level.
   ============================================================ */
(function () {
'use strict';

async function call(fn, body) {
  const r = await fetch(`${SUPA_URL}/rest/v1/rpc/${fn}`, { method: 'POST',
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(fn + ' ' + r.status);
  return r.json();
}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const br = s => esc(s).replace(/\n/g, '<br>');
const has = v => v != null && String(v).trim() !== '';
const num = v => Math.round(Number(v) || 0).toLocaleString('en-GB');
const aed = v => 'AED ' + num(v);
const pct = v => v == null ? '·' : Math.round(v) + '%';
const day = iso => iso ? new Date(String(iso).slice(0, 10) + 'T00:00:00') : null;
const dFull = iso => has(iso) ? day(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
const dMid = iso => has(iso) ? day(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '';
const dShort = iso => has(iso) ? day(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
const mName = iso => day(iso).toLocaleDateString('en-GB', { month: 'long' });
const mLong = iso => day(iso).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
const stamp = ts => ts ? new Date(ts).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
const first = n => String(n || '').split(' ')[0];
const todayISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' });
const plus = (iso, n) => { const d = day(iso); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA'); };

// ── The two forms, in the paper forms' own wording ───────────────────────
const CHECK = [
  ['Essentials for every client, every visit', [
    'Take every client through the 8-Step Hair Plan consultation: lifestyle, hair history, desired outcome, condition and suitability.',
    'Give a clear quote before the service begins, so price and timings are understood and agreed.',
    'Complete the relevant waiver form with the client, whenever it applies.',
    "Fill in the client's colour notes on their record, every time.",
    'Put every client on a hair journey, with a considered plan for their next visits and longer-term goals.',
    'Talk through the Confidence Promise.',
    'Check out your client personally and invite them to rebook before they leave.']],
  ['Client experience and professional standards', [
    'Arrive prepared and on time, well groomed, with a clean and ready station.',
    'Welcome every guest warmly and give attentive, considered service.',
    'Talk through the service plan, realistic result, maintenance and timings before starting.',
    "Respect each client's comfort, privacy, preferences and appointment time, and let them know early if there is a delay.",
    'Share personalised aftercare advice, including the maintenance schedule that suits each client.']],
  ['Technical quality, safety and education', [
    'Follow consultation, patch and strand testing and manufacturer safety protocols wherever they apply.',
    'Deliver consistent cutting, colour, styling and treatment work, in line with your stylist level.',
    'Protect the integrity of the hair, recommending treatments only when they suit the client and explaining the benefits.',
    'Keep hygiene standards high: clean tools, a tidy trolley, correct product handling and considered stock use.',
    'Stay up to date with education from the brands we use, relevant to your work.',
    'Name the skills you would like to develop and agree a practical education or mentoring plan.']],
  ['Revenue, productivity and client retention', [
    'Know your 13-week service revenue, treatment revenue, retail and average bill trends, and review them together.',
    'Review utilisation, appointment gaps and column productivity, and plan how to make the best use of your time.',
    'Recommend treatments and homecare that genuinely suit each client, always with care and never with pressure.',
    'Work towards your agreed retail goals.',
    'Review new clients, repeat visits, retention and requests, and look for ways to build a loyal column.',
    'Support thoughtful cross-referrals to beauty, junior stylists and other Tara Rose Salons services.']],
  ['Social media, networking and personal brand', [
    'Keep a clear stylist identity: your specialist services, strengths and ideal client.',
    'Capture before-and-after content with client consent (CL-12), and share usable photos and videos with marketing.',
    'Contribute to Tara Rose Salons content and team-led expertise, where relevant.',
    'Share a realistic monthly social media and networking plan, and any support or training you would value.',
    'Build professional relationships, referrals and local visibility, representing Tara Rose Salons consistently.']],
  ['Teamwork, accountability and growth', [
    'Keep reception informed about bookings, timing, client requests and follow-ups.',
    'Guide and support assistants with respect, delegating thoughtfully and giving useful feedback.',
    'Take part in briefings, education and agreed salon initiatives.',
    'Review actions from your last one-to-one and share progress, or anything that has been in the way.',
    'Set personal, professional and financial goals (HR-09) that connect to clear, measurable actions.',
    'Agree specific next steps, who will lead each one, the support needed and completion dates.']]
];
const QS = [['goal', 'What is your specific goal?'], ['why', 'Why is achieving this goal important to you?'],
  ['gain', 'If you achieve this goal, how will it change your life?'], ['lose', 'If you do not achieve this goal, how will it affect your life?'],
  ['steps', 'What steps will you take, and what support or training would you like from us?']];
const KINDS = [['personal', 'Personal'], ['professional', 'Professional'], ['financial', 'Financial']];
const HZ = [['m6', '6 months'], ['y1', '1 year'], ['y3', '3 years']];
// The 13-week review rows of HR-10, in the form's order. ret = retention and conversion together.
const NUM_ROWS = [['hair_services', 'Service revenue'], ['treatments', 'Treatment revenue'], ['retail', 'Retail revenue'],
  ['total_revenue', 'Total revenue'], ['rebooking_pct', 'Rebooking %'], ['ret', 'Retention and new clients'], ['avg_bill', 'Average bill']];
// HR-09's business table: [row key, label, how to show, which figure is "now"] (m = monthly average, a = the 13-week figure).
const MILE = [['hair_services', 'Service revenue (monthly)', 'aed', 'm'], ['treatments', 'Treatment revenue (monthly)', 'aed', 'm'],
  ['retail', 'Retail (monthly)', 'aed', 'm'], ['avg_bill', 'Average bill', 'aed', 'a'], ['rebooking_pct', 'Rebooking %', 'pct', 'a'],
  ['new_clients', 'New clients (monthly)', 'num', 'm'], ['column_fill_pct', 'Utilisation %', 'pct', 'a']];

function statusOf(a, t, mn) { if (a == null || t == null) return ''; if (a >= t) return 'good'; if (mn != null && a >= mn) return 'warn'; return 'bad'; }
function numRow(snap, key) {
  const R = (snap && snap.rows) || {};
  if (key === 'ret') {
    const r = R.retention_pct || {}, c = R.conversion_pct || {};
    const sr = statusOf(r.a, r.t, r.mn), sc = statusOf(c.a, c.t, c.mn);
    return { a: `${pct(r.a)} kept · ${pct(c.a)} of new came back`, t: r.t != null ? `${pct(r.t)} · ${pct(c.t)}` : '',
      st: [sr, sc].includes('bad') ? 'bad' : [sr, sc].includes('warn') ? 'warn' : (sr || sc) };
  }
  const r = R[key] || {};
  const f = v => v == null ? '·' : key.endsWith('_pct') ? pct(v) : aed(v);
  return { a: f(r.a), t: r.t != null ? f(r.t) : '', st: statusOf(r.a, r.t, r.mn) };
}
function nowOf(snap, key, how, which) {
  const r = ((snap && snap.rows) || {})[key] || {};
  const v = which === 'm' ? r.m : r.a;
  return v == null ? '·' : how === 'aed' ? aed(v) : how === 'pct' ? pct(v) : num(v);
}
function ckCounts(content) {
  const ck = (content && content.check) || [];
  let y = 0, t = 0;
  const per = CHECK.map((g, i) => { let n = 0; g[1].forEach((_, j) => { if (ck[i] && ck[i][j]) n++; }); y += n; t += g[1].length; return n; });
  return { y, t, per };
}
const getP = (o, p) => p.split('.').reduce((a, k) => a == null ? undefined : a[k], o);
function setP(o, p, v) {
  const ks = p.split('.');
  ks.slice(0, -1).forEach((k, i) => { if (o[k] == null) o[k] = /^\d+$/.test(ks[i + 1]) ? [] : {}; o = o[k]; });
  o[ks[ks.length - 1]] = v;
}
const winLine = snap => snap && snap.from ? `13 weeks, ${dShort(snap.from)} to ${dShort(snap.to)}` : '';

// The shared 13-week table, for a stylist's page.
function numbersRows(snap, notes) {
  return NUM_ROWS.map(([k, label]) => {
    const r = numRow(snap, k), n = notes && notes[k];
    return `<div class="row"><span>${label}</span><span class="r-val">${esc(r.a)}<span class="r-tail">${r.t ? `<small>aim ${esc(r.t)}</small>` : ''}<i class="dot ${r.st}"></i></span></span>${has(n) ? `<span class="r-note">${esc(n)}</span>` : ''}</div>`;
  }).join('');
}

// ════════════════════════════════════════════════════════════
//  The stylist's own tab
// ════════════════════════════════════════════════════════════
const ME = { tab: 'month', sel: 0, hz: 'm6', el: null, ctx: null, wired: false };

function me(el, ctx) {
  ME.el = el; ME.ctx = ctx;
  if (!ME.wired) { el.addEventListener('click', onMeClick); ME.wired = true; }
  drawMe();
}
const recs = kind => (ME.ctx.data.records || []).filter(r => r.kind === kind);

function meHead(r, kind) {
  const who = first(r.signed_by) || 'your leader';
  if (r.updating) return `<p style="margin-top:10px"><span class="o2o-chip">${esc(who)} is updating this one</span></p><p class="o2o-done">You are seeing the version you last agreed. The new one appears once it is signed.</p>`;
  if (r.status === 'filed') return `<p style="margin-top:10px"><span class="o2o-chip good">Agreed by you both</span> <span class="o2o-done">You confirmed it on ${esc(stamp(r.confirmed_at))}</span></p>
    <button class="btn" type="button" data-act="pdf" data-kind="${kind}" data-i="${r._i}">Download my signed copy (PDF)</button>
    <p class="legend">Saved as it was signed. Later changes never alter it.</p>`;
  return `<p style="margin-top:10px"><span class="o2o-chip warn">Waiting for you</span> <span class="o2o-done">${esc(who)} signed it on ${esc(stamp(r.signed_at))}.</span></p>
    <button class="btn" type="button" data-act="confirm" data-kind="${kind}" data-period="${esc(String(r.period).slice(0, 10))}">I have read it, confirm</button>
    <button class="btn o2o-ghost" type="button" data-act="pdf" data-kind="${kind}" data-i="${r._i}" style="margin-left:6px">Download a copy (PDF)</button>
    <p class="legend">Confirming is your signature on the paper form. Your PDF is saved at that moment.</p>`;
}

function meMonth() {
  const all = recs('monthly').map((r, i) => Object.assign(r, { _i: i }));
  if (!all.length) return `<div class="o2o-empty">Your first 1-to-1 will appear here once your leader has written it up and signed it. It will show what went well, your 13 weeks in numbers, what you agreed, and the next steps.</div>`;
  const r = all[Math.min(ME.sel, all.length - 1)], c = r.content || {}, snap = r.snapshot || {};
  const cc = ckCounts(c), todo = [];
  CHECK.forEach((g, i) => g[1].forEach((t, j) => { if (!(c.check && c.check[i] && c.check[i][j])) todo.push(t); }));
  const prev = (c.prev_actions || []).filter(a => has(a.action));
  const acts = (c.actions || []).filter(a => has(a.action));
  const pri = String(c.priorities || '').split('\n').map(x => x.trim()).filter(Boolean);
  const bits = [];
  bits.push(`<section class="card hero o2o-card-new"><div class="eyebrow">Monthly 1-to-1</div><h2>${esc(mName(r.period))}, with ${esc(first(r.signed_by) || 'your leader')}</h2>
    <p class="sub" style="margin-bottom:0">${esc(dMid(c.meeting_date))}${snap.from ? ' · looking back at ' + esc(winLine(snap)) : ''}</p>${meHead(r, 'monthly')}</section>`);
  if (has(c.wins)) bits.push(`<section class="card"><div class="eyebrow">Wins and highlights</div><p class="o2o-text">${br(c.wins)}</p></section>`);
  if (prev.length) bits.push(`<section class="card"><div class="eyebrow">Actions from last time</div><div class="rows">${prev.map(a =>
    `<div class="row"><span style="flex:1 1 200px">${esc(a.action)}</span><span class="r-val"><span class="o2o-chip ${a.status === 'Done' ? 'good' : 'warn'}">${esc(a.status || 'Ongoing')}</span></span>${has(a.progress) ? `<span class="r-note">${esc(a.progress)}</span>` : ''}</div>`).join('')}</div></section>`);
  if (snap.rows) bits.push(`<section class="card"><div class="eyebrow">Your 13 weeks</div><p class="sub">${esc(winLine(snap))}. Worked out from your own numbers; your leader's notes sit under each line.${snap.off_days > 0 ? ` You were away ${snap.off_days} days in this window, so the aims are cut to match.` : ''}</p><div class="rows">${numbersRows(snap, c.notes13)}</div>
    <p class="legend">Green means at or above your aim, amber means close, red means under.</p></section>`);
  if (has(c.opportunities) || has(c.social_grow) || has(c.social_help)) bits.push(`<section class="card">
    ${has(c.opportunities) ? `<div class="eyebrow">Support you would value</div><p class="o2o-text">${br(c.opportunities)}</p>` : ''}
    ${has(c.social_grow) || has(c.social_help) ? `<div class="eyebrow" style="margin-top:14px">Social media and networking</div>${has(c.social_grow) ? `<p class="o2o-text">${br(c.social_grow)}</p>` : ''}${has(c.social_help) ? `<p class="o2o-text" style="margin-top:6px">${br(c.social_help)}</p>` : ''}` : ''}</section>`);
  if (acts.length || has(c.next_meeting)) bits.push(`<section class="card"><div class="eyebrow">What you agreed</div>${acts.map(a =>
    `<div class="o2o-act"><span class="k">${esc(a.owner || '')}${has(a.due) ? ' · due ' + esc(dShort(a.due) || a.due) : ''}</span>${esc(a.action)}${has(a.measure) ? `<small>Success looks like: ${esc(a.measure)}</small>` : ''}</div>`).join('')}
    ${has(c.next_meeting) ? `<p class="legend">Next 1-to-1: ${esc(dFull(c.next_meeting))}</p>` : ''}</section>`);
  bits.push(`<section class="card"><div class="eyebrow">Stylist priorities checklist</div><div style="font-size:30px;font-weight:700;margin:2px 0">${cc.y} of ${cc.t}</div>
    <p class="sub">things you are consistently showing. The rest are the next focus, not a mark against you.</p>
    <div class="o2o-sid">${CHECK.map((g, i) => `<span>0${i + 1} ${esc(g[0])}</span><b>${cc.per[i]} of ${g[1].length}</b><div class="o2o-meter"><i style="width:${cc.per[i] / g[1].length * 100}%"></i></div>`).join('')}</div>
    ${todo.length ? `<details class="o2o-more"><summary><span>What is still to work on</span><span class="hint">${todo.length} ${todo.length === 1 ? 'item' : 'items'}</span></summary><ul class="o2o-chk">${todo.map(t => `<li><i>&#9675;</i><span>${esc(t)}</span></li>`).join('')}</ul></details>` : ''}</section>`);
  if (pri.length || has(c.support)) bits.push(`<section class="card">${pri.length ? `<div class="eyebrow">Our priorities for the next 13 weeks</div><ol class="o2o-text" style="padding-left:20px">${pri.map(p => `<li>${esc(p.replace(/^\d+[.)]\s*/, ''))}</li>`).join('')}</ol>` : ''}
    ${has(c.support) ? `<div class="eyebrow" style="margin-top:14px">Training or support that would help</div><p class="o2o-text">${br(c.support)}</p>` : ''}</section>`);
  if (all.length > 1) bits.push(`<details class="o2o-more"><summary><span>Earlier 1-to-1s</span><span class="hint">${all.length - 1}</span></summary><div class="rows">${all.map((x, i) => i === ME.sel ? '' :
    `<button class="row" type="button" data-act="sel" data-i="${i}" style="font:inherit;color:inherit;cursor:pointer;text-align:left;width:100%"><span>${esc(mLong(x.period))}</span><span class="r-val"><small>${esc(first(x.signed_by))}</small></span></button>`).join('')}</div></details>`);
  return bits.join('');
}

function meGoals() {
  const all = recs('goals').map((r, i) => Object.assign(r, { _i: i }));
  if (!all.length) return `<div class="o2o-empty">Your goals will appear here once you and your leader have talked them through and your leader has signed them. They cover 6 months, 1 year and 3 years, and are checked every 13 weeks.</div>`;
  const r = all[0], c = r.content || {}, snap = r.snapshot || {}, set = (c.goals || {})[ME.hz] || {};
  const bits = [];
  bits.push(`<section class="card hero o2o-card-new"><div class="eyebrow">My goals</div><h2>Where I am heading</h2>
    <p class="sub" style="margin-bottom:0">${has(c.meeting_date) ? 'Set on ' + esc(dMid(c.meeting_date)) + ' · ' : ''}checked every 13 weeks${has(c.next_review) ? ' · next check ' + esc(dMid(c.next_review)) : ''}</p>${meHead(r, 'goals')}</section>`);
  bits.push(`<div class="o2o-priv"><span>&#128274;</span><span>These are your own words. Only you and your leaders (Tara, Emma and Kate) can read this page. Share only what you feel comfortable sharing.</span></div>`);
  bits.push(`<div class="o2o-pills">${HZ.map(([k, l]) => `<button type="button" class="o2o-pill ${ME.hz === k ? 'on' : ''}" data-act="hz" data-v="${k}">${l}</button>`).join('')}</div>`);
  KINDS.forEach(([k, l]) => {
    const g = set[k] || {};
    bits.push(has(g.goal)
      ? `<section class="card"><div class="eyebrow">${l} goal</div><div class="o2o-goal">${esc(g.goal)}</div>${has(g.why) ? `<div class="o2o-qa"><b>Why it matters</b>${br(g.why)}</div>` : ''}
        <details class="o2o-more"><summary><span>Everything we talked through</span></summary>${QS.slice(2).filter(q => has(g[q[0]])).map(q => `<div class="o2o-qa"><b>${q[1]}</b>${br(g[q[0]])}</div>`).join('')}</details></section>`
      : `<section class="card"><div class="eyebrow">${l} goal</div><p class="muted" style="font-size:14px">Not set yet. You and your leader can add it at your next goals check.</p></section>`);
  });
  const mileHas = MILE.some(m => { const v = (c.mile || {})[m[0]] || {}; return has(v.m6) || has(v.y1) || has(v.y3); });
  if (snap.rows || mileHas) bits.push(`<section class="card"><div class="eyebrow">Where the numbers need to go</div>
    <p class="sub">"Now" is your 13-week average, worked out from your own numbers. The milestones are the ones you agreed.</p>
    <div class="o2o-wrap"><table class="o2o-tbl"><tr><th>Measure</th><th class="r">Now</th><th class="r">6 m</th><th class="r">1 yr</th><th class="r">3 yrs</th></tr>
    ${MILE.map(([k, l, how, w]) => { const v = (c.mile || {})[k] || {}; return `<tr><td>${l}</td><td class="r"><b>${esc(nowOf(snap, k, how, w))}</b></td><td class="r">${esc(v.m6 || '·')}</td><td class="r">${esc(v.y1 || '·')}</td><td class="r">${esc(v.y3 || '·')}</td></tr>`; }).join('')}</table></div></section>`);
  const pri = (c.priorities || []).filter(a => has(a.action));
  if (pri.length) bits.push(`<section class="card"><div class="eyebrow">Our agreed priorities, next 13 weeks</div>${pri.map(a =>
    `<div class="o2o-act"><span class="k">${esc(a.led || '')} leads${has(a.due) ? ' · due ' + esc(dShort(a.due) || a.due) : ''}</span>${esc(a.action)}${has(a.support) ? `<small>Support: ${esc(a.support)}</small>` : ''}</div>`).join('')}</section>`);
  const fol = (c.follow || []).filter(f => has(f.progress) || has(f.change));
  bits.push(`<section class="card"><div class="eyebrow">13-week follow-up</div>${fol.length ? fol.map(f => `<div class="o2o-qa">${has(f.date) ? `<b>${esc(dMid(f.date))}</b>` : ''}${has(f.progress) ? br(f.progress) : ''}${has(f.change) ? `<div style="margin-top:6px"><b>Change or prioritise next</b>${br(f.change)}</div>` : ''}</div>`).join('')
    : `<p class="muted" style="font-size:14px">Not due yet. At each check you look at what progress has been made, what you learned, and what to change.</p>`}</section>`);
  return bits.join('');
}

function drawMe() {
  const sub = ME.tab === 'month' ? 'month' : 'goals';
  ME.el.innerHTML = `<div class="o2o-pills"><button type="button" class="o2o-pill ${sub === 'month' ? 'on' : ''}" data-act="tab" data-v="month">Monthly 1-to-1</button><button type="button" class="o2o-pill ${sub === 'goals' ? 'on' : ''}" data-act="tab" data-v="goals">My goals</button></div>` + (sub === 'month' ? meMonth() : meGoals());
}
async function onMeClick(e) {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act;
  if (a === 'tab') { ME.tab = b.dataset.v; ME.sel = 0; drawMe(); window.scrollTo(0, 0); }
  else if (a === 'sel') { ME.sel = Number(b.dataset.i); drawMe(); window.scrollTo(0, 0); }
  else if (a === 'hz') { ME.hz = b.dataset.v; drawMe(); }
  else if (a === 'confirm') {
    b.disabled = true; b.textContent = 'Saving…';
    try { const ok = await call('perf_one2one_confirm', { p_token: ME.ctx.token, p_kind: b.dataset.kind, p_period: b.dataset.period }); if (!ok) throw new Error('not confirmed'); await ME.ctx.reload(); }
    catch (err) { b.disabled = false; b.textContent = 'Could not save, try again'; }
  } else if (a === 'pdf') {
    const r = recs(b.dataset.kind)[Number(b.dataset.i)]; if (!r) return;
    pdf(b.dataset.kind, { content: r.content, snapshot: r.snapshot, status: r.status, signed_by: r.signed_by, signed_at: r.signed_at, confirmed_at: r.confirmed_at, period: r.period }, ME.ctx.data.staff, b);
  }
}

// ════════════════════════════════════════════════════════════
//  Leaders, in Staff Benchmarks
// ════════════════════════════════════════════════════════════
const L = { d: null, ctx: null, slot: null, open: { monthly: false, goals: false }, hz: 'm6', content: {}, timers: {}, wired: false };
const period = kind => kind === 'monthly' ? L.d.month : L.d.year;
const rec = kind => L.d[kind];
const locked = kind => !!rec(kind) && rec(kind).status !== 'draft';

function initial(kind) {
  const r = rec(kind);
  if (r && r.content && Object.keys(r.content).length) return JSON.parse(JSON.stringify(r.content));
  const t = todayISO();
  if (kind === 'monthly') {
    const prev = (L.d.previous && L.d.previous.content && L.d.previous.content.actions) || [];
    return { meeting_date: t, prev_actions: prev.filter(a => has(a.action)).map(a => ({ action: a.action, progress: '', status: 'Ongoing' })) };
  }
  return { meeting_date: t, next_review: plus(t, 91) };
}
async function leader(slot, ctx) {
  L.slot = slot; L.ctx = ctx;
  let d = null;
  try { d = await call('perf_one2one_get', { p_admin: ctx.admin, p_token: ctx.token, p_month: ctx.month + '-01' }); } catch (e) {}
  if (!d) { slot.innerHTML = ''; return; }
  L.d = d; L.content = { monthly: initial('monthly'), goals: initial('goals') };
  L.wired = false; drawLeader();
}
async function reload() {
  await Promise.all(['monthly', 'goals'].map(k => L.timers[k] ? save(k) : null));
  const d = await call('perf_one2one_get', { p_admin: L.ctx.admin, p_token: L.ctx.token, p_month: L.ctx.month + '-01' });
  L.d = d; L.content = { monthly: initial('monthly'), goals: initial('goals') }; drawLeader();
}

// Field builders: every input carries its path in the content (data-p).
const K = kind => ({ kind, c: L.content[kind], lock: locked(kind) });
const dis = k => k.lock ? ' disabled' : '';
const fv = (k, p) => { const v = getP(k.c, p); return v == null ? '' : v; };
const fTa = (k, p, label, rows = 2) => `<label class="o2o-fl">${label}<textarea rows="${rows}" data-p="${p}"${dis(k)}>${esc(fv(k, p))}</textarea></label>`;
const fIn = (k, p, type = 'text', ph = '') => `<input type="${type}" data-p="${p}" value="${esc(fv(k, p))}" placeholder="${esc(ph)}"${dis(k)}>`;
const fSel = (k, p, opts) => {
  const cur = fv(k, p); if (cur && !opts.includes(cur)) opts = opts.concat([cur]);
  return `<select data-p="${p}"${dis(k)}>${opts.map(o => `<option${cur === o || (!cur && o === opts[0]) ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
};
const rowsOf = (k, arr, min) => Math.max(min, (getP(k.c, arr) || []).length);

function steps(kind) {
  const r = rec(kind), st = !r ? 0 : r.status === 'draft' ? 1 : r.status === 'signed' ? 2 : 3;
  const lb = ['Draft', `${L.d.who} signs`, `${first(L.d.staff.name)} confirms`, 'Filed'];
  const cls = i => i < st ? 'done' : i === st ? 'cur' : '';
  return `<div class="o2o-steps">${lb.map((l, i) => `<span class="${cls(i)}"><b>${i < st ? '&#10003;' : i + 1}</b>${esc(l)}</span>`).join('')}</div>`;
}
function chip(kind) {
  const r = rec(kind);
  if (!r) return `<span class="o2o-chip">Not started</span>`;
  if (r.status === 'draft') return `<span class="o2o-chip">Draft</span>`;
  if (r.status === 'signed') return `<span class="o2o-chip warn">Waiting for ${esc(first(L.d.staff.name))}</span>`;
  return `<span class="o2o-chip good">Filed</span>`;
}
function snapOf(kind) { return locked(kind) && rec(kind).snapshot ? rec(kind).snapshot : L.d.numbers; }

function btns(kind) {
  const r = rec(kind), name = first(L.d.staff.name), pdfTxt = kind === 'monthly' ? 'HR-10' : 'HR-09';
  if (locked(kind)) return `<div class="o2o-btns"><button class="btn" type="button" data-act="pdf" data-kind="${kind}">Download ${r.status === 'filed' ? 'signed copy' : 'copy'} (PDF, ${pdfTxt})</button>
    <button class="btn o2o-ghost" type="button" data-act="reopen" data-kind="${kind}">Reopen to edit</button>
    <span class="o2o-save">${r.status === 'filed' ? `Filed. ${esc(name)} confirmed on ${esc(stamp(r.confirmed_at))}. Reopening starts a new version and keeps this one.` : `Signed by ${esc(r.signed_by)} on ${esc(stamp(r.signed_at))}. ${esc(name)} confirms on their own link.`}</span></div>`;
  return `<div class="o2o-btns"><button class="btn" type="button" data-act="savenow" data-kind="${kind}">Save draft</button>
    <button class="btn o2o-new" type="button" data-act="sign" data-kind="${kind}">Sign off as ${esc(L.d.who)}</button>
    <button class="btn o2o-ghost" type="button" data-act="pdf" data-kind="${kind}">Preview PDF (${pdfTxt})</button>
    <span class="o2o-save" data-save="${kind}">${r ? 'Saved ' + esc(stamp(r.updated_at)) : 'Not saved yet. It saves by itself as you type.'}</span></div>
    <p class="o2o-who">${esc(name)} sees it on their link once you sign, not before.</p>`;
}

function monthlyBody(k) {
  const snap = snapOf('monthly'), st = L.d.staff;
  const prevN = rowsOf(k, 'prev_actions', 1), actN = rowsOf(k, 'actions', 3);
  const rowsHtml = (arr, n, cells) => Array.from({ length: n }, (_, i) => `<tr>${cells(i)}</tr>`).join('');
  return `
  <div class="o2o-g3"><label class="o2o-fl">Team member<input value="${esc(st.name)}" disabled></label><label class="o2o-fl">Role<input value="${esc(st.role)}" disabled></label><label class="o2o-fl">Branch<input value="${esc(st.branch)}" disabled></label>
    <label class="o2o-fl">Manager<input value="${esc((rec('monthly') && rec('monthly').signed_by) || L.d.who)}" disabled></label><label class="o2o-fl">Meeting date${fIn(k, 'meeting_date', 'date')}</label><label class="o2o-fl">Review period (13 weeks)<input value="${esc(snap.from ? dShort(snap.from) + ' to ' + dShort(snap.to) : '')}" disabled></label></div>

  <div class="o2o-sec">01 Wins and highlights</div>
  ${fTa(k, 'wins', 'What has gone well since we last met: achievements, progress and kind words from clients or colleagues', 3)}

  <div class="o2o-sec">02 Actions from our last meeting</div>
  <div class="o2o-wrap"><table class="o2o-tbl ed"><tr><th>Previous action</th><th>Progress and outcome</th><th>Status</th></tr>
  ${rowsHtml('prev_actions', prevN, i => `<td>${fIn(k, `prev_actions.${i}.action`)}</td><td>${fIn(k, `prev_actions.${i}.progress`)}</td><td style="width:120px">${fSel(k, `prev_actions.${i}.status`, ['Ongoing', 'Done'])}</td>`)}</table></div>
  ${k.lock ? '' : `<button class="btn o2o-ghost" type="button" data-act="addrow" data-kind="monthly" data-arr="prev_actions" style="margin-top:6px">Add a row</button>`}

  <div class="o2o-sec">03 Business revenue, 13-week review</div>
  <p class="o2o-lock"><span class="o2o-autoh">Auto</span> figures come from ${esc(first(st.name))}'s numbers and the aims for their level${snap.off_days > 0 ? `, cut for the ${snap.off_days} days away` : ''}. Only the notes are typed.${k.lock ? '' : ' They update until you sign.'}</p>
  <div class="o2o-wrap"><table class="o2o-tbl ed"><tr><th>Metric</th><th>13-week actual</th><th>Target</th><th></th><th>Notes and trends</th></tr>
  ${NUM_ROWS.map(([key, label]) => { const r = numRow(snap, key); return `<tr><td style="padding-top:11px">${label}</td><td class="o2o-auto">${esc(r.a)}</td><td class="o2o-auto">${esc(r.t || '·')}</td><td style="padding-top:12px"><i class="dot ${r.st}"></i></td><td style="min-width:230px">${fIn(k, `notes13.${key}`)}</td></tr>`; }).join('')}</table></div>
  <div style="margin-top:12px">${fTa(k, 'opportunities', 'Key opportunities and the support you would value', 2)}</div>

  <div class="o2o-sec">04 Social media and networking</div>
  <div class="o2o-g2">${fTa(k, 'social_grow', 'How would you like to grow your visibility, build relationships and welcome new clients?')}${fTa(k, 'social_help', 'What help, resources, training or support would be useful to you?')}</div>

  <div class="o2o-sec">05 Agreed actions</div>
  <div class="o2o-wrap"><table class="o2o-tbl ed"><tr><th>Action or next step</th><th>Owner</th><th>Due date</th><th>Success measure</th></tr>
  ${rowsHtml('actions', actN, i => `<td>${fIn(k, `actions.${i}.action`)}</td><td style="width:130px">${fSel(k, `actions.${i}.owner`, [first(st.name), L.d.who, 'Reception', 'Marketing'].filter((v, j, a) => a.indexOf(v) === j))}</td><td style="width:140px">${fIn(k, `actions.${i}.due`, 'date')}</td><td>${fIn(k, `actions.${i}.measure`)}</td>`)}</table></div>
  ${k.lock ? '' : `<button class="btn o2o-ghost" type="button" data-act="addrow" data-kind="monthly" data-arr="actions" style="margin-top:6px">Add an action</button>`}
  <div class="o2o-g3" style="margin-top:12px"><label class="o2o-fl">Next meeting date${fIn(k, 'next_meeting', 'date')}</label></div>

  <div class="o2o-sec">Stylist priorities checklist <span class="o2o-save" data-ckt style="letter-spacing:0;text-transform:none;font-weight:500">${ckCounts(k.c).y} of ${ckCounts(k.c).t} ticked</span></div>
  ${CHECK.map((g, i) => `<details class="o2o-more" data-ckg="${i}"><summary><span>0${i + 1} ${esc(g[0])}</span><span class="hint" data-cks>${ckCounts(k.c).per[i]} of ${g[1].length}</span></summary>
    ${g[1].map((t, j) => `<label class="o2o-ck"><input type="checkbox" data-p="check.${i}.${j}"${getP(k.c, `check.${i}.${j}`) ? ' checked' : ''}${dis(k)}><span>${esc(t)}</span></label>`).join('')}</details>`).join('')}
  <div class="o2o-g2" style="margin-top:12px">${fTa(k, 'priorities', 'Our priorities for the next 13 weeks', 4)}${fTa(k, 'support', 'Training or management support that would help', 4)}</div>`;
}

function goalsBody(k) {
  const st = L.d.staff, snap = snapOf('goals');
  const polN = 3, folN = rowsOf(k, 'follow', 1);
  return `
  <p class="o2o-who">&#128274; Only ${esc(first(st.name))}, Tara, Emma and Kate can read these answers. They are never shown to the Level 3 leaders, the viewer key or payroll.</p>
  <div class="o2o-g3"><label class="o2o-fl">Team member<input value="${esc(st.name)}" disabled></label><label class="o2o-fl">Role<input value="${esc(st.role)}" disabled></label><label class="o2o-fl">Branch<input value="${esc(st.branch)}" disabled></label>
    <label class="o2o-fl">Manager<input value="${esc((rec('goals') && rec('goals').signed_by) || L.d.who)}" disabled></label><label class="o2o-fl">Meeting date${fIn(k, 'meeting_date', 'date')}</label><label class="o2o-fl">Next 13-week review${fIn(k, 'next_review', 'date')}</label></div>
  <div class="o2o-sec">Goals</div>
  <div class="o2o-pills">${HZ.map(([h, l]) => `<button type="button" class="o2o-pill ${L.hz === h ? 'on' : ''}" data-act="hz" data-v="${h}">${l}</button>`).join('')}</div>
  ${HZ.map(([h]) => `<div class="o2o-g3" data-hz="${h}"${L.hz === h ? '' : ' hidden'}>${KINDS.map(([kk, l]) => `<div class="o2o-goalcol"><h3>${l} goal</h3>${QS.map(([qk, ql]) => fTa(k, `goals.${h}.${kk}.${qk}`, ql, 2)).join('')}</div>`).join('')}</div>`).join('')}

  <div class="o2o-sec">Business performance, 13-week review</div>
  <p class="o2o-lock"><span class="o2o-autoh">Auto</span> is the current 13-week figure. The three milestone columns are typed.</p>
  <div class="o2o-wrap"><table class="o2o-tbl ed"><tr><th>Measure</th><th>Current 13-week</th><th>6 months</th><th>1 year</th><th>3 years</th></tr>
  ${MILE.map(([key, label, how, w]) => `<tr><td style="padding-top:11px">${label}</td><td class="o2o-auto">${esc(nowOf(snap, key, how, w))}</td><td>${fIn(k, `mile.${key}.m6`)}</td><td>${fIn(k, `mile.${key}.y1`)}</td><td>${fIn(k, `mile.${key}.y3`)}</td></tr>`).join('')}</table></div>

  <div class="o2o-sec">Our agreed priorities, next 13 weeks (up to three)</div>
  <div class="o2o-wrap"><table class="o2o-tbl ed"><tr><th>Action</th><th>Led by</th><th>Support needed</th><th>Due date</th></tr>
  ${Array.from({ length: polN }, (_, i) => `<tr><td>${fIn(k, `priorities.${i}.action`)}</td><td style="width:130px">${fSel(k, `priorities.${i}.led`, [first(st.name), L.d.who])}</td><td>${fIn(k, `priorities.${i}.support`)}</td><td style="width:140px">${fIn(k, `priorities.${i}.due`, 'date')}</td></tr>`).join('')}</table></div>

  <div class="o2o-sec">13-week follow-up</div>
  ${Array.from({ length: folN }, (_, i) => `<div class="o2o-g2" style="margin-bottom:10px"><label class="o2o-fl">Check date${fIn(k, `follow.${i}.date`, 'date')}</label><span></span>${fTa(k, `follow.${i}.progress`, 'What progress has been made, and what have we learned?', 3)}${fTa(k, `follow.${i}.change`, 'What should change or be prioritised next?', 3)}</div>`).join('')}
  ${k.lock ? '' : `<button class="btn o2o-ghost" type="button" data-act="addrow" data-kind="goals" data-arr="follow">Add the next 13-week check</button>`}`;
}

function cardHTML(kind) {
  const k = K(kind), isM = kind === 'monthly', open = L.open[kind];
  const title = isM ? `One-to-one with ${first(L.d.staff.name)}` : `Goals with ${first(L.d.staff.name)}`;
  const eyebrow = isM ? `Monthly 1-to-1 · ${mLong(L.d.month)}` : `Yearly goals · ${day(L.d.year).getFullYear()}`;
  return `<section class="card o2o-card${open ? ' open' : ''}" data-kind="${kind}" data-locked="${k.lock ? 1 : 0}">
    <button type="button" class="o2o-fold" data-act="fold" data-kind="${kind}" aria-expanded="${open}"><span class="o2o-ft"><div class="eyebrow">${eyebrow}</div><h2>${title}</h2></span>${chip(kind)}<span class="o2o-chev" aria-hidden="true">&#8963;</span></button>
    <div class="o2o-body"${open ? '' : ' hidden'}>${steps(kind)}${k.lock ? `<div class="o2o-banner">${rec(kind).status === 'filed' ? 'Filed and locked.' : 'Signed and locked.'} Reopen it to change anything.</div>` : ''}
    ${isM ? monthlyBody(k) : goalsBody(k)}${btns(kind)}</div></section>`;
}
function drawLeader() {
  L.slot.innerHTML = cardHTML('monthly') + cardHTML('goals');
  if (!L.wired) {
    L.slot.addEventListener('click', onLeaderClick);
    L.slot.addEventListener('input', onLeaderInput);
    L.slot.addEventListener('change', onLeaderInput);
    L.wired = true;
  }
}
function redrawCard(kind) {
  const old = L.slot.querySelector(`[data-kind="${kind}"]`);
  const t = document.createElement('div'); t.innerHTML = cardHTML(kind);
  old.replaceWith(t.firstElementChild);
}

function gather(kind) {
  const card = L.slot.querySelector(`[data-kind="${kind}"]`), out = {};
  card.querySelectorAll('[data-p]').forEach(el => setP(out, el.dataset.p, el.type === 'checkbox' ? el.checked : el.value));
  // Rows nobody filled in are dropped; the sheets re-pad on the next draw.
  [['prev_actions', ['action', 'progress']], ['actions', ['action', 'due', 'measure']], ['priorities', ['action', 'support', 'due']], ['follow', ['date', 'progress', 'change']]]
    .forEach(([arr, keys]) => { if (Array.isArray(out[arr])) out[arr] = out[arr].filter(r => r && keys.some(x => has(r[x]))); });
  if (L.content[kind] && L.content[kind].next_meeting && out.next_meeting == null) out.next_meeting = L.content[kind].next_meeting;
  return out;
}
function setSave(kind, txt) { const e = L.slot.querySelector(`[data-save="${kind}"]`); if (e) e.textContent = txt; }
async function save(kind) {
  clearTimeout(L.timers[kind]); L.timers[kind] = null;
  if (locked(kind)) return false;
  const content = gather(kind); L.content[kind] = content;
  setSave(kind, 'Saving…');
  try {
    const r = await call('perf_one2one_save', { p_admin: L.ctx.admin, p_token: L.ctx.token, p_kind: kind, p_period: period(kind), p_content: content });
    if (r === 'ok') { L.d[kind] = Object.assign(L.d[kind] || { status: 'draft' }, { content, updated_at: new Date().toISOString() }); setSave(kind, 'Saved ' + stamp(new Date())); return true; }
    setSave(kind, r === 'locked' ? 'This one is already signed. Reopen it to edit.' : 'Could not save (' + r + ').');
  } catch (e) { setSave(kind, 'Could not save. Check the connection, it will try again as you type.'); }
  return false;
}
function onLeaderInput(e) {
  const card = e.target.closest('[data-kind]'); if (!card || card.dataset.locked === '1' || !e.target.matches('[data-p]')) return;
  const kind = card.dataset.kind;
  if (e.target.type === 'checkbox') {
    const cc = ckCounts(gather(kind));
    card.querySelectorAll('[data-ckg]').forEach(d => { d.querySelector('[data-cks]').textContent = `${cc.per[Number(d.dataset.ckg)]} of ${CHECK[Number(d.dataset.ckg)][1].length}`; });
    const t = card.querySelector('[data-ckt]'); if (t) t.textContent = `${cc.y} of ${cc.t} ticked`;
  }
  setSave(kind, 'Unsaved changes…');
  clearTimeout(L.timers[kind]); L.timers[kind] = setTimeout(() => save(kind), 1500);
}
async function onLeaderClick(e) {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act, kind = b.dataset.kind;
  if (a === 'fold') { L.open[kind] = !L.open[kind]; const card = b.closest('.o2o-card'); card.classList.toggle('open', L.open[kind]); card.querySelector('.o2o-body').hidden = !L.open[kind]; b.setAttribute('aria-expanded', L.open[kind]); }
  else if (a === 'hz') { L.hz = b.dataset.v; const card = b.closest('.o2o-card'); card.querySelectorAll('.o2o-pill').forEach(p => p.classList.toggle('on', p === b)); card.querySelectorAll('[data-hz]').forEach(g => { g.hidden = g.dataset.hz !== L.hz; }); }
  else if (a === 'addrow') { if (locked(kind)) return; L.content[kind] = gather(kind); const arr = b.dataset.arr; L.content[kind][arr] = (L.content[kind][arr] || []).concat([{}]); redrawCard(kind); }
  else if (a === 'savenow') { await save(kind); }
  else if (a === 'sign') {
    if (!confirm(`Sign off as ${L.d.who}?\n\nThe numbers freeze and ${first(L.d.staff.name)} can see this on their own link. You can reopen it later; the signed version is kept.`)) return;
    b.disabled = true; if (!(await save(kind))) { b.disabled = false; return; }
    try { const r = await call('perf_one2one_sign', { p_admin: L.ctx.admin, p_token: L.ctx.token, p_kind: kind, p_period: period(kind) }); if (r !== 'ok') alert('Could not sign: ' + r); await reload(); }
    catch (err) { b.disabled = false; alert('Could not sign. Check the connection and try again.'); }
  } else if (a === 'reopen') {
    if (!confirm(`Reopen this for editing?\n\n${first(L.d.staff.name)} keeps seeing the signed version until you sign the new one.`)) return;
    try { await call('perf_one2one_reopen', { p_admin: L.ctx.admin, p_token: L.ctx.token, p_kind: kind, p_period: period(kind) }); L.open[kind] = true; await reload(); }
    catch (err) { alert('Could not reopen. Try again.'); }
  } else if (a === 'pdf') {
    if (!locked(kind)) await save(kind);
    const r = rec(kind) || {};
    pdf(kind, { content: locked(kind) ? r.content : gather(kind), snapshot: snapOf(kind), status: r.status || 'draft', signed_by: r.signed_by, signed_at: r.signed_at, confirmed_at: r.confirmed_at, period: period(kind), manager: L.d.who }, L.d.staff, b);
  }
}

async function pdf(kind, record, staff, btn) {
  const txt = btn && btn.textContent;
  if (btn) { btn.disabled = true; btn.textContent = 'Making the PDF…'; }
  try { await window.PerfO2OPdf.make(kind, record, staff); }
  catch (e) { alert('The PDF could not be made. ' + (e && e.message || '')); }
  if (btn) { btn.disabled = false; btn.textContent = txt; }
}

window.PerfO2O = { me, leader, CHECK, QS, KINDS, HZ, NUM_ROWS, MILE, numRow, nowOf, ckCounts, dFull, dMid, dShort, mLong, stamp, first, has };
})();
