// Lost Clients, To message in waves (Kate, 13 Oct 2026). Loaded after lost-queue.js, which calls into it when the waves tables are there
// (migrations/lost_waves.sql); without them lqwOn() is false and To message is the single list it was.
//
// Two separate sending areas: WhatsApp (respond.io, from each branch's own number, Meta's rules) and Text (SMS: copied, sent by hand, marked sent).
// WhatsApp goes out in four waves by how warm the client is, one open at a time, so Meta does not flag the numbers:
//   Wave 1  pilot, the first 50 of the active group (offer message first, then Due, most recent first)
//   Wave 2  wrote to one of our numbers in the last 12 months (queue wa = act), the rest of that group after the pilot
//   Wave 3  last wrote 12 to 18 months ago (r18), STOP line
//   Wave 4  in respond.io, no reply seen (noreply), Due message only is the plan, STOP line, half the daily cap
// A wave stays closed until a Level 4+ person opens it, and the next one cannot open until the one before it is finished. The size of the
// pilot and the half cap for Wave 4 are held by this page; "the wave is open" is also checked in lost_send_enqueue. The daily cap, the send
// window and the kill switch are the ones in lost_send_config (lost-queue.js).
const LQW = [
  { n: 1, name: 'Pilot', factor: 1, cls: 2, who: 'The best 50 clients of the active group whose message can go out now: offer message first, then Due, most recent first' },
  { n: 2, name: 'Active on WhatsApp', factor: 1, cls: 2, who: 'Wrote to one of our numbers in the last 12 months. Offer message first, then Due' },
  { n: 3, name: 'Replied 12 to 18 months ago', factor: 1, cls: 3, who: 'Last wrote to us 12 to 18 months ago. Offer message first, then Due. The message carries the STOP line' },
  { n: 4, name: 'No reply seen', factor: 0.5, cls: 4, who: 'In respond.io, no reply in their last 50 messages. The coldest group: STOP line, and half the daily cap' },
];
const LQW_PILOT = 50;
const LQW_STOP_LIMIT = 0.02, LQW_FAIL_LIMIT = 0.05;   // suggested limits, shown in the gate and asked to confirm past, not hard stops
const LQW_BR = ['SAA', 'KCA', 'MC', 'AQ'];
const LQW_BRC = { SAA: '#7C5CD4', KCA: '#1F8A70', MC: '#C2874A', AQ: '#C2416A' };
let lqWaves = {}, lqwOk = false, lqwKeys = new Set(), lqwSt = {};
const lqwOn = () => lqwOk;
const lqwLevel = n => typeof TRS_LEVEL !== 'undefined' && TRS_LEVEL >= n;

async function lqwLoad() {
  try {
    const { data, error } = await sb.rpc('lost_waves_get');
    if (error || !Array.isArray(data)) throw error || new Error('no waves');
    lqWaves = {}; data.forEach(w => { lqWaves[w.n] = w; });
    lqwOk = true;
  } catch (e) { lqWaves = {}; lqwOk = false; }
}

// ── state of each wave ──────────────────────────────────────────────────────────────────────
const lqwIsOpen = n => !!(lqWaves[n] && lqWaves[n].opened_at && !lqWaves[n].closed_at);
const lqwIsClosed = n => !!(lqWaves[n] && lqWaves[n].closed_at);
function lqwStatus(n) {
  if (lqwIsClosed(n)) return 'done';
  if (lqwIsOpen(n)) return 'open';
  return n === 1 || lqwIsClosed(n - 1) ? 'ready' : 'planned';
}
const lqwClass = r => r.wa === 'act' ? 2 : r.wa === 'r18' ? 3 : r.wa === 'noreply' ? 4 : 0;
const lqwUsed = r => !!(r.messaged || (r._job && (r._job.status === 'queued' || r._job.status === 'sending')));
// The wave a message would go out in right now (0 when its wave is not open).
function lqwSendWave(r) {
  const c = lqwClass(r);
  if (!c) return 0;
  if (c === 2) return lqwIsOpen(2) ? 2 : lqwIsOpen(1) ? 1 : 0;
  return lqwIsOpen(c) ? c : 0;
}
function lqwCanWave(r) {
  const w = lqwSendWave(r);
  if (!w) return false;
  return w === 1 ? lqwKeys.has(r.client_key) : !(lqwClass(r) === 2 && lqwKeys.has(r.client_key));
}
// Can its template go out now (approved, every variable filled)? Offer templates cannot until the versions without an end date are approved in Meta,
// so until then the pilot and each wave start with the clients whose message can actually be sent.
function lqwTplOk(r) {
  if (!lqSnd.info) return 0;
  const t = lqSendTpl(r);
  return t && t.approved && lqSendParams(t, r).every(Boolean) ? 1 : 0;
}
const lqwOrder = (a, b) => (lqwTplOk(b) - lqwTplOk(a)) || (LQ_TYPE_ORDER.indexOf(a.qtype) - LQ_TYPE_ORDER.indexOf(b.qtype)) || (a.days_since - b.days_since);

// What each wave holds, from the rows on the page. Called before every paint.
function lqwCompute() {
  const rows = lqRows.filter(r => r._ch === 'whatsapp');
  const cls = { 2: [], 3: [], 4: [] };
  rows.forEach(r => { const c = lqwClass(r); if (c) cls[c].push(r); });
  const act = cls[2].slice().sort(lqwOrder);
  const usedAct = act.filter(lqwUsed), unusedAct = act.filter(r => !lqwUsed(r));
  const psize = Math.min(LQW_PILOT, act.length);
  // Once Wave 1 is finished only the clients it actually messaged are the pilot; the rest of the group belongs to Wave 2.
  const pilot = lqwIsClosed(1) ? usedAct.slice(0, psize) : usedAct.slice(0, psize).concat(unusedAct.slice(0, psize - Math.min(psize, usedAct.length)));
  const pilotSet = new Set(pilot.map(r => r.client_key));
  const rest2 = act.filter(r => !pilotSet.has(r.client_key));
  // Until Wave 1 is finished the pilot's unsent clients are the only ones Wave 1 may send; once it is finished they join Wave 2.
  lqwKeys = new Set(lqwIsClosed(1) ? [] : pilot.filter(r => !lqwUsed(r)).map(r => r.client_key));
  const groups = { 1: pilot, 2: rest2, 3: cls[3], 4: cls[4] };
  const out = {};
  LQW.forEach(w => {
    const rs = groups[w.n], used = rs.filter(lqwUsed).length;
    const br = {}; LQW_BR.forEach(b => { br[b] = rs.filter(r => r.branch === b).length; });
    out[w.n] = { n: w.n, rows: rs, size: rs.length, used, left: rs.length - used, br,
      failed: rs.filter(r => r._job && r._job.status === 'failed').length,
      replied: rs.filter(r => r.messaged && r.replied).length, sent: rs.filter(r => r.messaged).length };
  });
  lqwSt = out;
  return out;
}
// Clients who wrote STOP (or are otherwise opted out) since the wave opened. The check runs nightly, so it lags by a day.
function lqwStop(n) {
  const w = lqWaves[n];
  if (!w || !w.opened_at) return null;
  const now = (lqData && lqData.skipped && lqData.skipped.optout) || 0;
  const next = lqWaves[n + 1];
  const end = next && next.opened_at ? next.optout_at_open : now;
  return Math.max(0, end - (w.optout_at_open || 0));
}
// The wave the list below shows: the one she picked, else the open one, else the next ready one.
function lqwCurrent() {
  if (lqSel.wv >= 1 && lqSel.wv <= 4) return lqSel.wv;
  for (let n = 4; n >= 1; n--) if (lqwIsOpen(n)) return n;
  for (let n = 1; n <= 4; n++) if (lqwStatus(n) === 'ready') return n;
  return 4;
}
// Called by lqFiltered for the To send list: only the wave on screen.
function lqwKeep(r, view) {
  if (view !== 'send' || r._ch !== 'whatsapp') return true;
  const n = lqwCurrent(), c = lqwClass(r);
  if (n === 1) return lqwKeys.has(r.client_key);
  if (n === 2) return c === 2 && !(!lqwIsClosed(1) && lqwKeys.has(r.client_key));
  return c === n;
}
// How many may still go out today in the wave on screen: the daily cap (half of it in Wave 4) less what has gone, and the pilot's own 50.
function lqwRoom() {
  const i = lqSnd.info;
  if (!i) return 0;
  const n = lqwCurrent();
  if (lqwStatus(n) !== 'open') return 0;
  const w = LQW[n - 1];
  const day = Math.max(0, Math.min(i.daily_cap, Math.round(i.daily_cap * w.factor)) - i.used_today);
  return n === 1 ? Math.min(day, (lqwSt[1] || { left: 0 }).left) : day;
}

// ── actions ──────────────────────────────────────────────────────────────────────────────────
async function lqwSet(n, action) {
  const opt = (lqData && lqData.skipped && lqData.skipped.optout) || 0;
  const { data, error } = await sb.rpc('lost_wave_set', { p_n: n, p_action: action, p_optouts: opt });
  if (error || !Array.isArray(data)) { console.error(error); lqNote((error && error.message) || 'That did not save. Try again.'); return false; }
  lqWaves = {}; data.forEach(w => { lqWaves[w.n] = w; });
  return true;
}
async function lqwOpen(n) {
  if (!lqwLevel(4)) { lqNote('Level 4 and above opens a wave.'); return; }
  const g = n > 1 ? lqwGate(n - 1) : null;
  if (g && g.over.length && !confirm('Wave ' + (n - 1) + ' is over its limit: ' + g.over.join(', ') + '.\n\nOpen Wave ' + n + ' anyway?')) return;
  if (g && g.left > 0 && !confirm(lcNum(g.left) + ' clients in Wave ' + (n - 1) + ' have not been messaged yet. Finish Wave ' + (n - 1) + ' and open Wave ' + n + '?')) return;
  if (n > 1 && lqwIsOpen(n - 1) && !(await lqwSet(n - 1, 'close'))) return;
  if (!(await lqwSet(n, 'open'))) return;
  lqSel.wv = n; lqSave(); lqPaint();
}
async function lqwEnd(n) {
  if (!lqwLevel(4)) { lqNote('Level 4 and above ends a wave.'); return; }
  if (!confirm('End Wave ' + n + '? Nothing more goes out in it unless you reopen it.')) return;
  if (await lqwSet(n, 'close')) lqPaint();
}
async function lqwReopen(n) {
  if (!lqwLevel(4)) { lqNote('Level 4 and above reopens a wave.'); return; }
  if (await lqwSet(n, 'reopen')) lqPaint();
}
function lqwPick(n) { lqSel.wv = n; lqPage = 1; lqSave(); lqPaint(); }
const LQW_SMS_PARKED = true;   // Text (SMS) is parked 13 Oct 2026: WhatsApp goes first, the text clients wait (no gateway, no reply path)
function lqwArea(a) { lqSel.area = a === 'sms' ? 'sms' : 'wa'; lqSel.ch = lqSel.area === 'sms' ? 'sms' : 'whatsapp'; lqSel.view = 'send'; lqPage = 1; lqSave(); lqPaint(); }
async function lqwCap(v) {
  if (!lqwLevel(5)) return;
  const { error } = await sb.rpc('lost_send_config_set', { p_patch: { daily_cap: +v } });
  if (error) { console.error(error); lqNote('That did not save. Try again.'); return; }
  await lqSendLoad(); lqRelink(); lqPaint();
}
function lqwSmsCap(v) { lqSel.smsCap = +v; lqSave(); lqPaint(); }

// What has to look right before the wave AFTER n opens: the numbers for wave n.
function lqwGate(n) {
  const s = lqwSt[n] || { used: 0, failed: 0, replied: 0, left: 0 };
  const stop = lqwStop(n);
  const failP = (s.used + s.failed) ? s.failed / (s.used + s.failed) : 0, stopP = s.used && stop != null ? stop / s.used : 0;
  const over = [];
  if (failP > LQW_FAIL_LIMIT) over.push('failed ' + (failP * 100).toFixed(1) + '% (limit ' + LQW_FAIL_LIMIT * 100 + '%)');
  if (stopP > LQW_STOP_LIMIT) over.push('STOP ' + (stopP * 100).toFixed(1) + '% (limit ' + LQW_STOP_LIMIT * 100 + '%)');
  return { s, stop, failP, stopP, over, left: s.left };
}

// ── drawing ──────────────────────────────────────────────────────────────────────────────────
const lqwDay = d => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const lqwWork = d => d.getDay() !== 0 && d.getDay() !== 6;
function lqwBranchBar(br) {
  const tot = LQW_BR.reduce((a, b) => a + (br[b] || 0), 0) || 1;
  return `<div class="lqw-brw"><div class="lqw-brs">${LQW_BR.map(b => `<i style="width:${100 * (br[b] || 0) / tot}%;background:${LQW_BRC[b]}" title="${lcEsc(LC_BRANCH[b] || b)} ${lcNum(br[b] || 0)}"></i>`).join('')}</div>
    <div class="lqw-leg">${LQW_BR.map(b => `<span style="--c:${LQW_BRC[b]}">${b} ${lcNum(br[b] || 0)}</span>`).join('')}</div></div>`;
}
// Days each unfinished wave needs at the daily cap, one after the other, each on a fresh sending day (Monday to Friday).
function lqwPlan() {
  const cap = lqSnd.info ? lqSnd.info.daily_cap : 50;
  const out = []; const cur = new Date(); cur.setHours(0, 0, 0, 0);
  LQW.forEach(w => {
    const s = lqwSt[w.n];
    if (lqwStatus(w.n) === 'done') return;
    const wcap = Math.max(1, Math.round(cap * w.factor));
    while (!lqwWork(cur)) cur.setDate(cur.getDate() + 1);
    const start = new Date(cur); let left = s.left, days = 0;
    while (left > 0) { if (!lqwWork(cur)) { cur.setDate(cur.getDate() + 1); continue; } left -= wcap; days++; if (left > 0) cur.setDate(cur.getDate() + 1); }
    out.push({ w, s, start, end: new Date(cur), days, wcap });
    cur.setDate(cur.getDate() + 1);
  });
  return out;
}
function lqwStatusBar() {
  const stt = LQW.map(w => lqwStatus(w.n));
  const cur = lqwCurrent(), s = lqwSt[cur];
  const openN = LQW.map(w => w.n).filter(n => lqwIsOpen(n))[0];
  const doneN = stt.filter(x => x === 'done').length;
  let line;
  if (openN) line = `<b>Wave ${openN} is sending.</b> ${lcNum(lqwSt[openN].used)} of ${lcNum(lqwSt[openN].size)} messaged${lqSnd.info ? `, ${lcNum(lqSnd.info.used_today)} of ${lcNum(lqSnd.info.daily_cap)} queued or sent today` : ''}. The next wave stays closed until you open it.`;
  else if (doneN === 4) line = '<b>All four waves are done.</b>';
  else if (doneN) line = `<b>Wave ${doneN} is done.</b> Wave ${doneN + 1} is waiting for you to open it.`;
  else line = `<b>Not started.</b> ${lqSendOn() ? '' : 'Sending is off. '}Wave 1, the ${lcNum(lqwSt[1].size)} client pilot, is ready once the checks below are done.`;
  const steps = LQW.map((w, k) => `<div class="lqw-step ${stt[k]}"><div class="lqw-dot">${stt[k] === 'done' ? '✓' : w.n}</div><div class="slv-note">Wave ${w.n}<br>${{ done: 'Done', open: 'Sending', ready: 'Ready', planned: 'Planned' }[stt[k]]}</div></div>`).join('');
  return `<div class="lqw-status"><div class="lqw-lab">WhatsApp status</div><div class="lqw-line">${line}</div><div class="lqw-steps">${steps}</div></div>`;
}
function lqwPaceCard(areaRows) {
  const wa = lqSel.area !== 'sms';
  const i = lqSnd.info, canCap = lqwLevel(5) && i;
  if (!wa) {
    const cap = [30, 50, 100, 200, 300].includes(lqSel.smsCap) ? lqSel.smsCap : 100;
    const left = areaRows.filter(r => !r.messaged).length, days = Math.ceil(left / cap);
    const d = new Date(); d.setHours(0, 0, 0, 0); let k = days; while (k > 0) { if (lqwWork(d)) k--; if (k > 0) d.setDate(d.getDate() + 1); else break; }
    const doneToday = areaRows.filter(r => r.messaged && String(r.sent_on || '').slice(0, 10) === lqToday()).length;
    return `<div class="lqw-pace slv-card"><div class="lqw-row"><b>Pace</b><span class="slv-note">Texts need no Meta rating, so the cap is only how many your team can send by hand in a day.</span><span style="flex:1"></span>
      <label class="slv-note">Daily cap <select class="ll-sel" onchange="lqwSmsCap(this.value)">${[30, 50, 100, 200, 300].map(v => `<option${v === cap ? ' selected' : ''}>${v}</option>`).join('')}</select></label></div>
      <div class="lqw-row lqw-big"><div><b>${lcNum(left)}</b> <span class="slv-note">still to send</span></div><div><b>${lcNum(doneToday)}</b> <span class="slv-note">of ${lcNum(cap)} sent today</span></div><div><b>${left ? lqwDay(d) : 'Done'}</b> <span class="slv-note">${left ? 'at this pace, Mon to Fri' : ''}</span></div></div></div>`;
  }
  const plan = lqwPlan();
  const left = plan.reduce((a, x) => a + x.s.left, 0), days = plan.reduce((a, x) => a + x.days, 0), last = plan[plan.length - 1];
  const rows = plan.map(x => `<tr><td><b>Wave ${x.w.n}</b> ${lcEsc(x.w.name)}</td><td>${lcNum(x.s.left)}</td><td>${lcNum(x.wcap)} a day${x.w.factor < 1 ? ' <span class="slv-note">(half)</span>' : ''}</td><td>${x.days} day${x.days === 1 ? '' : 's'}</td><td>${lcEsc(lqwDay(x.start))} to ${lcEsc(lqwDay(x.end))}</td></tr>`).join('');
  const cap = i ? i.daily_cap : 0;
  const lanes = LQW_BR.map(b => {
    const rs = lqRows.filter(r => r._ch === 'whatsapp' && r.branch === b);
    const today = rs.filter(r => r.messaged && String(r.sent_on || '').slice(0, 10) === lqToday()).length;
    return `<div class="lqw-lane"><b>${lcEsc(LC_BRANCH[b] || b)}</b><div class="slv-note">${lcNum(rs.filter(r => !lqwUsed(r)).length)} left · ${lcNum(today)} sent today</div></div>`;
  }).join('');
  return `<div class="lqw-pace slv-card"><div class="lqw-row"><b>Pace</b><span class="slv-note">How many go out each sending day, across the four branch numbers.</span><span style="flex:1"></span>
      ${canCap ? `<label class="slv-note">Daily cap <select class="ll-sel" onchange="lqwCap(this.value)">${[50, 100, 250, 500].map(v => `<option${v === cap ? ' selected' : ''}>${v}</option>`).join('')}</select></label>` : `<span class="slv-note">Daily cap <b>${lcNum(cap)}</b>${i ? '' : ''}</span>`}</div>
    ${plan.length ? `<div class="lqw-row lqw-big"><div><b>${lcNum(left)}</b> <span class="slv-note">still to send</span></div><div><b>${days}</b> <span class="slv-note">sending days (Mon to Fri)</span></div><div><b>${lcEsc(lqwDay(last.end))}</b> <span class="slv-note">last wave finishes</span></div></div>
      <table class="slv-table lqw-tbl"><thead><tr><th>Wave</th><th>Left</th><th>Per day</th><th>Days</th><th>Dates</th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="slv-note">Every wave is done.</p>'}
    <div class="lqw-lanes">${lanes}</div>
    <p class="slv-note">Each branch number is its own lane. Meta also limits how many new people each number can message in a day, and rates each number's quality, which this page cannot see: check it in Meta Business Manager before you open the next wave. Wave 4 goes at half the cap because those clients are the likeliest to block or report.</p></div>`;
}
function lqwGateHtml(n) {
  // The block shown before opening wave n.
  const first = n === 1, prev = first ? null : lqwGate(n - 1), i = lqSnd.info;
  const tick = (ok, t) => `<div class="lqw-chk"><span class="${ok ? 'lqw-ok' : 'lqw-no'}">${ok ? '✓' : '!'}</span><span>${t}</span></div>`;
  let items;
  if (first) {
    const tpl = i && (i.templates || []).some(t => t.approved);
    items = tick(!!(i && i.enabled), 'Sending is switched on') + tick(!!tpl, 'Meta has approved the templates') + tick(!!(i && i.test_ready), 'A test number is set, and a test message has gone to it')
      + tick(Object.keys((lqData && lqData.review) || {}).length > 0, 'At least one branch is marked reviewed on the five groups tab');
  } else {
    const s = prev.s, p = n - 1;
    items = tick(!prev.over.some(x => /^failed/.test(x)), `Wave ${p}: ${lcNum(s.used)} messaged, ${lcNum(s.failed)} failed (${(prev.failP * 100).toFixed(1)}%, limit ${LQW_FAIL_LIMIT * 100}%)`)
      + tick(!prev.over.some(x => /^STOP/.test(x)), `New STOP or opt-outs since Wave ${p} opened: ${prev.stop == null ? '–' : lcNum(prev.stop)} (${(prev.stopP * 100).toFixed(1)}%, limit ${LQW_STOP_LIMIT * 100}%), checked nightly`)
      + tick(s.replied === 0, `${lcNum(s.replied)} repl${s.replied === 1 ? 'y' : 'ies'} to answer in respond.io first`)
      + tick(prev.left === 0, prev.left ? `${lcNum(prev.left)} in Wave ${p} not messaged yet` : `Everyone in Wave ${p} has been messaged`);
  }
  const lbl = first ? 'Open Wave 1 and start sending' : `Finish Wave ${n - 1} and open Wave ${n}`;
  return `<div class="lqw-gate"><b>${first ? 'Before Wave 1 opens' : `Before Wave ${n} opens`}</b>${items}
    <div class="lqw-chk"><span class="lqw-no">!</span><span>Check each branch number's quality rating in Meta (it cannot be read here)</span></div>
    <div class="lqw-row" style="margin-top:10px">${lqwLevel(4) ? `<button type="button" class="tglr lc-btn lq-pri" onclick="lqwOpen(${n})">${lbl}</button>` : '<span class="slv-note">Level 4 and above opens a wave.</span>'}
      <span class="slv-note">You can open it with a warning showing. It only asks you to confirm.</span></div></div>`;
}
function lqwBody(n) {
  const s = lqwSt[n], st = lqwStatus(n), w = lqWaves[n], stop = lqwStop(n);
  let h = '<div class="lqw-body">';
  if (st === 'open' || st === 'done') {
    h += `<div class="lqw-results">
      <div class="lqw-res"><b>${lcNum(s.used)}</b><span>messaged</span></div>
      <div class="lqw-res good"><b>${lcNum(s.replied)}</b><span>replied${s.sent ? ` (${(100 * s.replied / s.sent).toFixed(0)}%)` : ''}</span></div>
      <div class="lqw-res${s.failed ? ' bad' : ''}"><b>${lcNum(s.failed)}</b><span>failed</span></div>
      <div class="lqw-res${stop ? ' bad' : ''}"><b>${stop == null ? '–' : lcNum(stop)}</b><span>new STOP or opt-outs, checked nightly</span></div></div>
      <div class="lqw-row"><div class="lq-prog"><i style="width:${s.size ? 100 * s.used / s.size : 0}%"></i></div><span class="slv-note">${lcNum(s.used)} of ${lcNum(s.size)} messaged${w && w.opened_at ? ` · opened ${lcEsc(llDayS(w.opened_at))} by ${lcEsc(w.opened_by || '')}` : ''}${w && w.closed_at ? ` · finished ${lcEsc(llDayS(w.closed_at))}` : ''}</span></div>`;
  }
  if (st === 'open') {
    h += `<div class="lqw-row" style="margin-top:10px">${lqwLevel(4) ? `<button type="button" class="tglr lc-btn" onclick="lqwEnd(${n})">End this wave</button>` : ''}<span class="slv-note">Today's list and the send button are below.</span></div>`;
    if (n < 4) h += lqwGateHtml(n + 1);
  } else if (st === 'ready') h += lqwGateHtml(n);
  else if (st === 'done') h += `<div class="lqw-row" style="margin-top:10px">${lqwLevel(4) && !(lqwIsOpen(n + 1) || lqwIsClosed(n + 1)) ? `<button type="button" class="tglr lc-btn" onclick="lqwReopen(${n})">Reopen this wave</button>` : ''}</div>`;
  else h += `<p class="slv-note">Opens after Wave ${n - 1} is finished. Nothing here goes out on its own.</p>`;
  return h + '</div>';
}
function lqwWavesHtml() {
  const cur = lqwCurrent();
  return LQW.map(w => {
    const s = lqwSt[w.n], st = lqwStatus(w.n), label = { done: 'Done', open: 'Sending', ready: 'Ready', planned: 'Planned' }[st];
    return `<div class="lqw-wave ${st}${w.n === cur ? ' cur' : ''}"><button type="button" class="lqw-wh" onclick="lqwPick(${w.n})">
      <span class="lqw-num">${st === 'done' ? '✓' : w.n}</span>
      <span class="lqw-wt"><b>Wave ${w.n}: ${lcEsc(w.name)}</b> <span class="lqw-pill ${st}">${label}</span><span class="slv-note">${lcEsc(w.who)}</span></span>
      <span class="lqw-cnt"><b>${lcNum(s.size)}</b><span class="slv-note">${s.used ? `${lcNum(s.used)} messaged` : 'clients'}</span></span>${lqwBranchBar(s.br)}</button>
      ${w.n === cur ? lqwBody(w.n) : ''}</div>`;
  }).join('');
}

function lqwPaint(host) {
  lqwCompute();
  if (lqSel.area !== 'sms') lqSel.area = 'wa';
  lqSel.ch = lqSel.area === 'sms' ? 'sms' : 'whatsapp';
  const sms = lqSel.area === 'sms';
  const areaRows = lqRows.filter(r => sms ? r._ch === 'sms' : r._ch === 'whatsapp');
  const n = v => areaRows.filter(r => lqView(r) === v).length;
  const sk = (lqData && lqData.skipped) || {}, held = (lqData && lqData.held) || 0;
  const recentN = (lqData && lqData.recent) || 0, taken = (lqData && lqData.excluded) || 0, reviewed = Object.keys((lqData && lqData.review) || {}).length;
  const stat = (v, t, d) => `<button type="button" class="ll-card lq-stat${lqSel.view === v ? ' on' : ''}" onclick="lqSet('view','${v}')"><div class="ll-t">${t}</div><div class="ll-n">${lcNum(n(v))}</div><div class="ll-d">${d}</div></button>`;
  const brs = [...new Set(areaRows.map(r => r.branch))].sort();
  const cnt = a => lqRows.filter(r => a === 'sms' ? r._ch === 'sms' : r._ch === 'whatsapp').length;
  const left = held + recentN + taken + (sk.nonum || 0) + (sk.blocked || 0) + (sk.optout || 0) + (sk.unchecked || 0);
  const cur = lqwCurrent(), curSt = lqwStatus(cur), room = sms ? 0 : lqwRoom();
  const leftCard = sms ? `<div class="ll-card lq-held"><div class="ll-t">Left out</div><div class="ll-n">${lcNum(sk.nonum || 0)}</div><div class="ll-d">no number at all, so nothing can be sent</div></div>`
    : `<div class="ll-card lq-held" title="Booked clients, clients who came in within the last 6 weeks, and clients the coordinators took out are kept off To message"><div class="ll-t">Left out</div><div class="ll-n">${lcNum(left)}</div>
        <div class="ll-d">${lcNum(held)} booked · ${lcNum(recentN)} came in lately · ${lcNum(taken)} taken out · ${lcNum(sk.nonum || 0)} no number${sk.blocked ? ` · ${lcNum(sk.blocked)} blocked` : ''}${sk.optout ? ` · ${lcNum(sk.optout)} opted out` : ''}${sk.unchecked ? ` · ${lcNum(sk.unchecked)} not checked yet` : ''}</div></div>`;
  const bar = sms ? '' : lqSendBarHtml();
  const sendNote = sms ? '' : (curSt === 'open' ? `<div class="slv-note lqw-slice">Wave ${cur} is open: up to ${lcNum(room)} more can go out today${LQW[cur - 1].factor < 1 ? ' (half the daily cap)' : ''}.</div>` : `<div class="slv-note lqw-slice">Wave ${cur} is ${curSt === 'ready' ? 'ready but not open' : curSt === 'done' ? 'finished' : 'not open yet'}, so nothing here can be sent. Open it above.</div>`);
  host.innerHTML = `
    <div class="ll-fresh">
      <span class="ll-chip">Sent is read from <b>respond.io</b> every night</span>
      <span class="ll-chip">Campaign started <b>${lcEsc(llDay(lqData.campaign_from))}</b></span>
      <span class="ll-chip${reviewed < 4 ? ' warn' : ' ok'}" title="Coordinators mark their branch reviewed on the Lost Clients groups tab">Branches reviewed <b>${reviewed} of 4</b></span>
      <button type="button" class="ll-chip lq-refresh" onclick="lqRenderQueue(true)" title="Fetch the list again">Refresh</button>
    </div>
    <div class="sc-seg lqw-area" role="tablist" aria-label="Sending area">
      <button type="button" role="tab" class="${sms ? '' : 'on'}" onclick="lqwArea('wa')"><b>WhatsApp</b> <span class="slv-note">${lcNum(cnt('wa'))} clients · through respond.io, from each branch's number</span></button>
      <button type="button" role="tab" class="${sms ? 'on' : ''}" onclick="lqwArea('sms')"><b>Text (SMS)</b> <span class="slv-note">${lcNum(cnt('sms'))} clients · ${LQW_SMS_PARKED ? 'parked for now' : 'copied, sent by hand, marked sent'}</span></button></div>
    ${sms && LQW_SMS_PARKED ? `<div class="lqw-status"><div class="lqw-lab">Text status</div><div class="lqw-line">Parked for now. WhatsApp goes first, so these ${lcNum(cnt('sms'))} clients are not on the list to send. The site cannot send texts and a text cannot be answered. They stay here, nothing is lost, and nobody needs to text them yet.</div></div>` : ''}
    ${sms && LQW_SMS_PARKED ? '' : `
    ${sms ? `<div class="lqw-status"><div class="lqw-lab">Text status</div><div class="lqw-line">The site does not send texts. Copy the text, send it, then mark it sent here. Offer message first, then Due.</div></div>` : lqwStatusBar()}
    <div class="ll-cards lq-stats">
      ${stat('send', 'To send', sms ? 'one text each, best first' : 'one message each, best first')}
      ${!sms && lqSnd.info && (lqSnd.info.enabled || n('out')) ? stat('out', 'Sending', lqOutLine()) : ''}
      ${stat('sent', 'Sent', 'waiting for a reply')}
      ${sms ? '' : stat('reply', 'Replied', 'someone needs to answer')}
      ${leftCard}
    </div>
    ${lqwPaceCard(areaRows)}
    ${sms ? '' : `<h3 class="lqw-h">The WhatsApp waves</h3><div class="lqw-waves">${lqwWavesHtml()}</div>`}
    <section class="slv-card ll-panel">
      <div class="lqw-ph"><b>${sms ? 'Texts to send' : `Wave ${cur}: ${lcEsc(LQW[cur - 1].name)}`}</b>${sendNote}</div>
      ${bar}
      <div class="lc-tools ll-tools lq-tools">
        <select class="ll-sel" aria-label="Message" onchange="lqSet('ty',this.value)"><option value="all">All messages</option>${LQ_TYPE_ORDER.map(k => `<option value="${k}"${lqSel.ty === k ? ' selected' : ''}>${lcEsc(LQ_TYPES[k][0])}</option>`).join('')}</select>
        <select class="ll-sel" aria-label="Branch" onchange="lqSet('br',this.value)"><option value="all">All branches</option>${brs.map(b => `<option value="${b}"${lqSel.br === b ? ' selected' : ''}>${lcEsc(LC_BRANCH[b] || b)}</option>`).join('')}</select>
        <select class="ll-sel" aria-label="Order" onchange="lqSet('sort',this.value)">${[['best', 'Best first'], ['oldest', 'Lost longest first'], ['name', 'Name A to Z']].map(([k, l]) => `<option value="${k}"${lqSel.sort === k ? ' selected' : ''}>${l}</option>`).join('')}</select>
        <input type="search" class="ll-search" id="lqSearch" placeholder="Search name or stylist" value="${lcEsc(lqQuery)}" oninput="lqQuery=this.value;lqPage=1;lqPaintTable()">
        <span style="flex:1"></span>
        <span class="lq-btns">
          <button type="button" class="tglr lc-btn" onclick="lqSaveFile('xlsx')" title="Download what is shown, with the message for each">XLSX</button>
          <button type="button" class="tglr lc-btn" onclick="lqSaveFile('csv')" title="Download what is shown, with the message for each">CSV</button>
        </span>
        <span id="lqNote" class="slv-note" style="display:inline"></span>
      </div>
      <p id="lqCount" class="slv-note"></p>
      <div id="lqTable"></div>
      <p class="slv-muted ll-foot">One message per client, first match wins: smoothing, then colour, then other services, then everyone else. Someone in several groups appears once.
      Sent comes from respond.io (it only sees messages sent through it); a text, or WhatsApp opened from here, is marked by the button. A client with a booking, or who came in within the last 6 weeks, leaves the list on her own. Two clients on one number get one message.</p>
    </section>`}`;
  lqPaintTable();
}
