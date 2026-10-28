// Lost Clients, To message laid out like the Wellness Voucher blast (Kate, 16 Oct 2026: "para ndi nakakalito"). Same three blocks as wv-blast.js:
//   1. Send from here: one table, a row per wave (Wave 1 split 1a / 1b), with its status and ONE button (Open wave, Send N now, Stop), and the kill switch.
//   2. Wave cards, one per wave, that pick which wave the list shows.
//   3. One panel: what the wave is, chips (Show, Branch, Message), search, Copy numbers, XLSX / CSV, and the client list.
// It only changes how the WhatsApp area is drawn. The rules are still lost-waves.js (the waves, the gates, lqwOpen / lqwEnd / lqwReopen) and lost-queue.js
// (lqSendRowsReview -> lost_send_enqueue, the kill switch, the list and its rows). lqwPaint calls lqbPaint for WhatsApp; the Text area is untouched.
// Loaded after lost-waves.js.
const LQB_DESC = {
  1: 'The 50 who wrote to us most recently. Half get the standard message (1a), half the story message (1b)',
  2: 'Wrote to one of our numbers in the last 12 months. Offer message first, then Due',
  3: 'Last wrote to us 12 to 18 months ago. Offer message first, then Due, with the STOP line',
  4: 'No reply seen. The coldest group: the Due message only, with the STOP line, at half the daily cap',
};
const LQB_CAPS = [50, 100, 250, 500, 1000, 1900];
const LQB_SLOTS = [[0, 'No limit'], [50, '50'], [100, '100'], [200, '200']];
const lqbWindow = i => !!(i && i.dubai_hour >= i.hour_from && i.dubai_hour < i.hour_to);
const lqbJobIs = (r, ...st) => !!(r._job && st.includes(r._job.status));

// One row per thing you can send: Wave 1a, Wave 1b, Wave 2, Wave 3, Wave 4.
function lqbGroups() {
  const out = [];
  LQW.forEach(w => {
    const s = lqwSt[w.n];
    if (!s) return;
    if (w.n === 1) ['a', 'b'].forEach(a => out.push({ k: '1' + a, n: 1, label: 'Wave 1' + a, msg: a === 'a' ? 'Standard' : 'Story', rows: s.rows.filter(r => lqwArm(r) === a) }));
    else out.push({ k: String(w.n), n: w.n, label: 'Wave ' + w.n, msg: w.n === 4 ? 'Due, STOP line' : w.n === 3 ? 'Offer then Due, STOP line' : 'Offer then Due', rows: s.rows });
  });
  return out;
}
function lqbStat(g) {
  const rs = g.rows;
  return { total: rs.length, sent: rs.filter(r => r.messaged).length,
    waiting: rs.filter(r => !r.messaged && lqbJobIs(r, 'queued', 'sending')).length,
    failed: rs.filter(r => !r.messaged && lqbJobIs(r, 'failed')).length, skipped: rs.filter(r => !r.messaged && lqbJobIs(r, 'skipped')).length,
    ready: rs.filter(lqCanSend) };
}
// What the day still has for wave n (see lqwDayRoom in lost-waves.js): the daily cap less what has been queued or sent today, and Wave 4 also
// stays inside half the cap counting only its own sends.
function lqbRoom(n) { return lqwDayRoom(n); }
const lqbOrder = (a, b) => (LQ_WA_ORDER[a.wa] - LQ_WA_ORDER[b.wa]) || (LQ_TYPE_ORDER.indexOf(a.qtype) - LQ_TYPE_ORDER.indexOf(b.qtype)) || (a.days_since - b.days_since);

// Who set the schedule for a wave (Kate, 16 Oct 2026): scheduled_by on the jobs that are still waiting, else on the ones that went. Several names: the
// person who set most of it, plus how many others.
function lqbSetBy(g) {
  const js = g.rows.map(r => r._job).filter(j => j && !j.is_test && (j.status === 'queued' || j.status === 'sent'));
  const q = js.filter(j => j.status === 'queued'), src = q.length ? q : js, n = {};
  src.forEach(j => { const w = j.scheduled_by || j.requested_by; if (w) n[w] = (n[w] || 0) + 1; });
  const names = Object.keys(n).sort((a, b) => n[b] - n[a]);
  if (!names.length) return '<span class="slv-muted">–</span>';
  return `<span title="${lcEsc(names.map(w => w + ' ' + lcNum(n[w])).join(', '))}">${lcEsc(names[0])}${names.length > 1 ? ` <span class="slv-note">+${names.length - 1}</span>` : ''}</span>`;
}
function lqbRow(g) {
  const st = lqwStatus(g.n), s = lqbStat(g), i = lqSnd.info, lvl4 = lqwLevel(4);
  let status = '<span class="slv-muted">Not open yet</span>';
  if (st === 'open' || st === 'done') {
    const q = g.rows.filter(r => !r.messaged && lqbJobIs(r, 'queued')).map(r => r._job), schedN = q.filter(lqIsSched).length;
    if (s.waiting) status = `<b>${schedN && schedN === s.waiting ? 'Scheduled' : 'Sending'}</b>: ${lcNum(s.sent)} done, ${lcNum(s.waiting)} waiting`;
    else if (s.sent) status = `Sent <b>${lcNum(s.sent)}</b> of ${lcNum(s.total)}`;
    else status = '<span class="slv-muted">Not sent</span>';
  } else if (st === 'ready') status = '<span class="slv-muted">Ready, not open</span>';
  const pills = [s.failed ? `<span class="ll-pill ll-num" title="Failed: see the Sending view below, or the send log">${lcNum(s.failed)} failed</span>` : '',
    s.skipped ? `<span class="ll-pill ll-num" title="Skipped by a safety check (STOP, blocked, not a contact)">${lcNum(s.skipped)} skipped</span>` : ''].join(' ');
  let act = '', at = '<span class="slv-muted">–</span>';
  if (st === 'open') {
    const sch = g.rows.map(r => r._job).filter(j => j && j.status === 'queued' && j.scheduled_for).sort((a, b) => Date.parse(a.next_try_at) - Date.parse(b.next_try_at));
    if (sch.length) at = `<div class="ss-cell"><span>${lqIsSched(sch[0]) ? 'Next' : 'Due'} <b>${lcEsc(ssFmt(sch[0].next_try_at))}</b></span>${sch.length > 1 && sch[sch.length - 1].next_try_at !== sch[0].next_try_at ? `<span class="slv-note">Last ${lcEsc(ssFmt(sch[sch.length - 1].next_try_at))}</span>` : ''}<button type="button" class="tglr lc-btn" onclick="lqbChange('${g.k}')">Change time</button></div>`;
    else if (s.ready.length && i && !s.waiting) at = `<button type="button" class="tglr lc-btn lq-pri" onclick="lqbSend('${g.k}','at')">Schedule…</button>`;
    if (s.waiting) act = `<button type="button" class="tglr lc-btn" onclick="lqbStop('${g.k}')">Stop</button>`;
    else if (s.ready.length && i) {
      const room = Math.min(s.ready.length, lqbRoom(g.n));
      act = room ? `<button type="button" class="tglr lc-btn wv-go" onclick="lqbSend('${g.k}')">${s.sent ? 'Send the rest' : 'Send ' + lcEsc(g.label)} (${lcNum(room)})</button>`
        : '<span class="slv-muted">Today\'s cap is used. Schedule it for another day.</span>';
    } else if (g.n === 1 && g.k === '1b' && LQW_HOLD_1B) act = '<span class="slv-muted">Held back</span>';
    else act = s.sent ? '<span class="slv-muted">Nothing left to send</span>' : '<span class="slv-muted">Nothing ready</span>';
  } else if (st === 'ready') act = lvl4 && g.k !== '1b' ? `<button type="button" class="tglr lc-btn wv-go" onclick="lqwOpen(${g.n})">Open ${g.n === 1 ? 'Wave 1' : lcEsc(g.label)}</button>` : g.k === '1b' ? '<span class="slv-muted">Opens with 1a</span>' : '<span class="slv-muted">Level 5 opens it</span>';
  else if (st === 'done') act = '<span class="slv-muted">Done</span>';
  else {
    // The wave before is open and nothing of it is still waiting: this button finishes it and opens this one (lqwOpen asks the usual questions first).
    const prevOpen = g.n > 1 && lqwIsOpen(g.n - 1) && !(lqwSt[g.n - 1] ? lqwSt[g.n - 1].rows : []).some(r => !r.messaged && lqbJobIs(r, 'queued', 'sending'));
    act = prevOpen && lvl4 ? `<button type="button" class="tglr lc-btn wv-go" onclick="lqwOpen(${g.n})" title="Finishes Wave ${g.n - 1} and opens Wave ${g.n}. It asks you to confirm first.">Finish Wave ${g.n - 1}, open ${lcEsc(g.label)}</button>`
      : prevOpen ? '<span class="slv-muted">Level 5 opens it</span>' : `<span class="slv-muted">After Wave ${g.n - 1}</span>`;
  }
  return `<tr><td class="ll-nw"><b>${lcEsc(g.label)}</b></td><td class="ll-nw"><a href="#" class="lqb-msg" onclick="event.preventDefault();lqbShowMsg('${g.k}')" title="Read the message">${lcEsc(g.msg)}</a></td><td class="ll-nw">${lcNum(s.total)}</td><td>${status} ${pills}</td><td class="ll-nw">${at}</td><td class="ll-nw">${lqbSetBy(g)}</td><td class="ll-nw">${act}</td></tr>`;
}
// The wave whose checks matter next: the first one that is ready to open, else the one after the open wave.
function lqbNextGate() {
  for (let n = 1; n <= 4; n++) if (lqwStatus(n) === 'ready') return n;
  for (let n = 1; n < 4; n++) if (lqwIsOpen(n)) return n + 1;
  return 0;
}

function lqbSendPanel() {
  const i = lqSnd.info, lvl5 = lqwLevel(5);
  if (!i) return '<div class="ll-panel wv-send"><p class="slv-muted">The send panel did not load. Refresh to try again.</p></div>';
  const on = !!i.enabled, win = lqbWindow(i), jobs = Object.values(lqSnd.jobs);
  const waiting = jobs.filter(j => j.status === 'queued' || j.status === 'sending').length;
  const sw = lvl5 ? `<button type="button" class="tglr lc-btn wv-sw ${on ? 'on' : 'off'}" onclick="lqSendToggle()" title="The kill switch. Off: nothing more is sent, even what is already queued.">Sending is ${on ? 'ON' : 'OFF'} · turn ${on ? 'off' : 'on'}</button>`
    : `<span class="ll-pill ${on ? 'll-act' : 'll-num'}">Sending is ${on ? 'ON' : 'OFF'}</span>`;
  const pace = i.slot_cap ? `${lcNum(i.slot_cap)} every ${lcNum(i.slot_minutes)} minutes` : `${lcNum(i.per_run)} a minute`;
  const capSel = lvl5 ? `<select class="ll-sel" aria-label="Daily cap" onchange="lqwCap(this.value)">${[...new Set(LQB_CAPS.concat(i.daily_cap))].sort((a, b) => a - b).map(v => `<option${v === i.daily_cap ? ' selected' : ''}>${v}</option>`).join('')}</select>` : `<b>${lcNum(i.daily_cap)}</b>`;
  const slotSel = lvl5 ? `<select class="ll-sel" aria-label="Per half hour" onchange="lqbSlot(this.value)">${LQB_SLOTS.concat(LQB_SLOTS.some(x => x[0] === i.slot_cap) ? [] : [[i.slot_cap, String(i.slot_cap)]]).map(([v, l]) => `<option value="${v}"${v === i.slot_cap ? ' selected' : ''}>${l}</option>`).join('')}</select>` : `<b>${i.slot_cap ? lcNum(i.slot_cap) : 'no limit'}</b>`;
  const test = i.test_ready && lvl5 ? `<span class="lq-testbox"><select class="ll-sel" id="lqTestTpl" aria-label="Template to test">${(i.templates || []).filter(t => t.approved).map(t => `<option value="${t.key}">${lcEsc(t.respond_name)}</option>`).join('') || '<option value="">No approved template</option>'}</select>
      <button type="button" class="tglr lc-btn" onclick="lqSendTest()">Send a test to my number</button></span>` : '';
  const gate = lqbNextGate();
  return `<div class="ll-panel wv-send">
    <div class="wv-send-h"><div><b>Send from here</b> <span class="slv-note">Level 5 opens a wave · Level 6 switches sending and sets the pace</span></div>${sw}</div>
    <p class="slv-muted wv-send-p">Each message goes through respond.io from that client's own branch number, as an approved template. It sends only between ${lcEsc(lqHour(i.hour_from))} and ${lcEsc(lqHour(i.hour_to))} Dubai${win ? '' : ' <b>(closed right now, so it waits)</b>'}, ${pace}.
      Today <b>${lcNum(i.sent_today || 0)}</b> sent${waiting ? `, <b>${lcNum(waiting)}</b> waiting` : ''}, up to ${lcNum(i.daily_cap)} a day. A client who wrote STOP, is blocked, or is not a respond.io contact is skipped.</p>
    <div class="slv-wrap"><table class="slv-table"><thead><tr><th>Wave</th><th>Message</th><th>Clients</th><th>Status</th><th>Send at</th><th>Set by</th><th></th></tr></thead><tbody>${lqbGroups().map(lqbRow).join('')}</tbody><tbody id="lqbRsTb">${lqbRsRowHtml()}</tbody></table></div>
    <div id="lqbRS">${lqbRsHtml()}</div>
    <div id="lqbCamp">${lqbCampHtml()}</div>
    <div id="lqNote" class="slv-note" style="margin-top:6px"></div>
    <details class="wv-log"><summary>Pace and test</summary><div class="lqb-pace"><label class="slv-note">Daily cap ${capSel}</label> <label class="slv-note">Every ${lcNum(i.slot_minutes || 30)} minutes ${slotSel}</label> ${test}
      <p class="slv-note">Meta limits how many new people each branch number can message in 24 hours and rates each number's quality, which this page cannot see. Check it in Meta Business Manager before opening the next wave. Wave 4 goes at half the daily cap because those clients are the likeliest to block or report.</p></div></details>
    ${gate ? `<details class="wv-log"><summary>Checks before Wave ${gate} opens</summary>${lqwGateHtml(gate)}</details>` : ''}
    <details class="wv-log"><summary>What happened to the messages</summary><p class="slv-note">The full record, with times and the text each client was sent, is the <a href="#" onclick="event.preventDefault();lqShowTab('perf')">Performance report</a>. Open the Sending view below to see queued, failed and skipped ones here.</p></details>
  </div>`;
}
function lqbCards() {
  const cur = lqwCurrent();
  return `<div class="ll-cards wv-cards">${LQW.map(w => {
    const s = lqwSt[w.n], st = lqwStatus(w.n), label = { done: 'Done', open: 'Sending', ready: 'Ready', planned: 'Planned' }[st];
    const by = LQW_BR.map(b => `${b} ${lcNum(s.br[b] || 0)}`).join(' · ');
    return `<button type="button" class="ll-card${cur === w.n ? ' on' : ''}" onclick="lqwPick(${w.n})"><div class="ll-t">Wave ${w.n}: ${lcEsc(w.name)} <span class="lqw-pill ${st}">${label}</span></div>
      <div class="ll-n">${lcNum(s.size)}</div><div class="ll-d">${lcEsc(LQB_DESC[w.n])}</div><div class="ll-ch">${by}</div>${s.arm ? `<div class="ll-ch">1a ${lcNum(s.arm.a)} · 1b ${lcNum(s.arm.b)}</div>` : ''}</button>`;
  }).join('')}</div>`;
}

// Kate, 23 Oct 2026 (ALD4-03): the Why wall opens To message. Why now follows the wave: the offer has no end date (13 Oct), so it says
// whether a wave is open today, not a date.
function lqbWhy(cur) {
  const st = n => typeof lqwStatus === 'function' ? lqwStatus(n) : '';
  const allDone = [1, 2, 3, 4].every(n => st(n) === 'done');
  const now = st(cur) === 'open' ? `Wave ${cur} is open now, so its clients can be messaged today.`
    : allDone ? 'All four waves have gone out, so nothing is waiting to send.'
    : 'No wave is open right now. The next one goes out when a Level 5 person opens it.';
  return whyWall([
    ['Why this page', 'A client who has gone quiet already knows us, so she is the easiest booking we can still win.'],
    ['Why now', now],
    ['If we do nothing', 'She books somewhere else and we never hear why.']]);
}
function lqbPaint(host) {
  const areaRows = lqRows.filter(r => r._ch === 'whatsapp');
  const nView = v => lqFiltered(v).length;   // what the list below would show for that view, with the filters on screen
  const sk = (lqData && lqData.skipped) || {}, held = (lqData && lqData.held) || 0;
  const recentN = (lqData && lqData.recent) || 0, taken = (lqData && lqData.excluded) || 0, reviewed = Object.keys((lqData && lqData.review) || {}).length;
  const cnt = a => lqRows.filter(r => a === 'sms' ? r._ch === 'sms' : r._ch === 'whatsapp').length;
  const cur = lqwCurrent(), w = LQW[cur - 1], brs = [...new Set(areaRows.map(r => r.branch))].sort();
  const chip = (on, label, fn, n) => `<button type="button" class="ll-fchip${on ? ' on ll-act' : ''}" onclick="${fn}">${label}${n != null ? ` <span class="slv-note">${lcNum(n)}</span>` : ''}</button>`;
  const left = held + recentN + taken + (sk.nonum || 0) + (sk.blocked || 0) + (sk.optout || 0) + (sk.unchecked || 0);
  const views = [['send', 'To send'], ['out', 'Sending'], ['sent', 'Sent'], ['reply', 'Replied']];
  host.innerHTML = `
    ${lqbWhy(cur)}
    <div class="ll-fresh">
      <span class="ll-chip">Sent is read from <b>respond.io</b> every night</span>
      <span class="ll-chip">Campaign started <b>${lcEsc(llDay(LL_CAMPAIGN_STARTED))}</b></span>
      <span class="ll-chip${reviewed < 4 ? ' warn' : ' ok'}" title="Coordinators mark their branch reviewed on the Lost Clients groups tab">Branches reviewed <b>${reviewed} of 4</b></span>
      <button type="button" class="ll-chip lq-refresh" onclick="lqRenderQueue(true)" title="Fetch the list again">Refresh</button>
    </div>
    <div class="sc-seg lqw-area" role="tablist" aria-label="Sending area">
      <button type="button" role="tab" class="on" onclick="lqwArea('wa')"><b>WhatsApp</b> <span class="slv-note">${lcNum(cnt('wa'))} clients · through respond.io, from each branch's number</span></button>
      <button type="button" role="tab" onclick="lqwArea('sms')"><b>Text (SMS)</b> <span class="slv-note">${lcNum(cnt('sms'))} clients · ${LQW_SMS_PARKED ? 'parked for now' : 'copied, sent by hand, marked sent'}</span></button></div>
    ${lqbSendPanel()}
    ${lqbCards()}
    <p class="slv-note lqb-left" title="Booked clients, clients who came in within the last 6 weeks, and clients the coordinators took out are kept off To message">Left out of the list: ${lcNum(left)} (${lcNum(held)} booked · ${lcNum(recentN)} came in lately · ${lcNum(taken)} taken out · ${lcNum(sk.nonum || 0)} no number${sk.blocked ? ` · ${lcNum(sk.blocked)} blocked` : ''}${sk.optout ? ` · ${lcNum(sk.optout)} opted out` : ''}${sk.unchecked ? ` · ${lcNum(sk.unchecked)} not checked yet` : ''})</p>
    <div class="ll-panel">
      <div class="ll-def"><b>Wave ${cur}: ${lcEsc(w.name)}.</b> ${lcEsc(LQB_DESC[cur])}.</div>
      <div class="ll-filters">
        <div class="ll-chips"><span class="slv-note">Show</span>${views.map(([v, l]) => chip(lqSel.view === v, l, `lqSet('view','${v}')`, nView(v))).join('')}</div>
        <div class="ll-chips"><span class="slv-note">Branch</span>${chip(lqSel.br === 'all', 'All', "lqSet('br','all')")}${brs.map(b => chip(lqSel.br === b, lcEsc(LC_BRANCH[b] || b), `lqSet('br','${b}')`)).join('')}</div>
        <div class="ll-chips"><span class="slv-note">Message</span>${chip(lqSel.ty === 'all', 'All', "lqSet('ty','all')")}${LQ_TYPE_ORDER.map(k => chip(lqSel.ty === k, lcEsc(LQ_TYPES[k][0]), `lqSet('ty','${k}')`)).join('')}</div>
        ${cur === 1 ? `<div class="ll-chips"><span class="slv-note">Version</span>${[['all', 'Both'], ['a', '1a standard'], ['b', '1b story']].map(([k, l]) => chip((lqSel.arm || 'all') === k, l, `lqSet('arm','${k}')`)).join('')}</div>` : ''}
        <input id="lqSearch" class="ll-sel" type="search" placeholder="Search name or stylist" value="${lcEsc(lqQuery)}" oninput="lqQuery=this.value;lqPage=1;lqPaintTable()" style="min-width:210px">
        <button type="button" class="tglr lc-btn" onclick="lqbCopy()" title="Copy the numbers shown, one per line">Copy numbers</button>
        <button type="button" class="tglr lc-btn" onclick="lqSaveFile('xlsx')" title="Download what is shown, with the message for each">XLSX</button>
        <button type="button" class="tglr lc-btn" onclick="lqSaveFile('csv')" title="Download what is shown, with the message for each">CSV</button>
        <span id="lqCount" class="slv-note" style="display:inline"></span>
      </div>
      <div id="lqTable"></div>
      <p class="slv-muted ll-foot">One message per client, first match wins: smoothing, then colour, then other services, then everyone else. Someone in several groups appears once.
      Sent comes from respond.io (it only sees messages sent through it); WhatsApp opened from here is marked by the button. A client with a booking, or who came in within the last 6 weeks, leaves the list on her own. Two clients on one number get one message.</p>
    </div>`;
  lqPaintTable();
  lqbRsLoad();
  lqbCampLoad();
}

// ── actions ──────────────────────────────────────────────────────────────────────────────────
function lqbSend(key, preset) {
  const g = lqbGroups().find(x => x.k === key);
  if (!g) return;
  // All the ready clients, best first: the dialog caps "now" at what today still has and a later day at a fresh day's cap (16 Oct 2026, scheduling).
  const rows = g.rows.filter(lqCanSend).sort(lqbOrder);
  if (rows.length) lqSendRowsReview(rows, lqbRoom(g.n), preset);
}
// Change the time of everything scheduled in this wave (lost-queue.js lqChgOpen).
function lqbChange(key) {
  const g = lqbGroups().find(x => x.k === key);
  if (!g) return;
  const ids = lqSchedIds(g.rows);
  if (ids.length) lqChgOpen(ids);
}
// Cancel everything of this wave that is still waiting (queued, not yet sent). What has gone cannot be called back.
async function lqbStop(key) {
  const g = lqbGroups().find(x => x.k === key);
  if (!g) return;
  const ids = g.rows.filter(r => !r.messaged && lqbJobIs(r, 'queued')).map(r => r._job.id);
  if (!ids.length) { lqNote('Nothing is waiting to stop.'); return; }
  if (!confirm(`Stop ${g.label}?\n\n${lcNum(ids.length)} messages that have not gone yet are cancelled. Anything already sent cannot be called back.`)) return;
  const { error } = await sb.rpc('lost_send_cancel', { p_ids: ids });
  if (error) { console.error(error); lqNote('That did not stop. Try again.'); return; }
  await lqSendLoad(); lqRelink(); lqPaint(); lqNote(`Stopped ${g.label}: ${lcNum(ids.length)} cancelled.`);
}
async function lqbSlot(v) {
  if (!lqwLevel(5)) return;
  const { error } = await sb.rpc('lost_send_config_set', { p_patch: { slot_cap: +v } });
  if (error) { console.error(error); lqNote('That did not save. Try again.'); return; }
  await lqSendLoad(); lqRelink(); lqPaint();
}
async function lqbCopy() {
  const nums = [...new Set(lqFiltered().map(r => r._phone).filter(Boolean))];
  try { await navigator.clipboard.writeText(nums.join('\n')); } catch (e) { lqNote('The browser would not copy. Use the file instead.'); return; }
  lqNote(`Copied ${lcNum(nums.length)} numbers`);
}

// ── Resend what WhatsApp did not deliver (Kate, 19 Oct 2026) ─────────────────────────────────────────────────────────────────
// Meta kept some messages back ("not delivered to maintain healthy ecosystem engagement", nothing charged). respond.io still calls them sent, so Send
// from here refuses them as already sent. This is the way back: lost_resend_info says how many per branch can be queued again, lost_send_resend queues
// them as new jobs (same client, same template, one per client, nobody who replied, wrote STOP, is blocked or has booked) with a time and a pace, one
// branch at a time so each branch can have its own time. Level 4 and up (migrations/lost_send_resend.sql).
let lqbRS = null;
async function lqbRsLoad() {
  const host = document.getElementById('lqbRS');
  if (!host || !lqwLevel(4)) return;
  try {
    const { data, error } = await sb.rpc('lost_resend_info');
    if (error || !data) throw error || new Error('no resend info');
    lqbRS = data;
  } catch (e) { lqbRS = null; }
  const h = document.getElementById('lqbRS'), tb = document.getElementById('lqbRsTb');
  if (h) h.innerHTML = lqbRsHtml();
  if (tb) tb.innerHTML = lqbRsRowHtml();
}
// The Resend line in the waves table (Kate, 19 Oct 2026: where are the resends that are waiting). The resent jobs are a separate campaign
// (name plus -resend), so the wave rows above never count them; this row does, with when they go and a Stop for the ones that have not gone.
function lqbRsRowHtml() {
  const d = lqbRS;
  if (!d || !lqwLevel(4) || !Number(d.resent)) return '';
  const sent = Number(d.resent_sent) || 0, wait = Number(d.resent_waiting) || 0, fail = Number(d.resent_failed) || 0, total = sent + wait + fail;
  const future = d.resent_first && Date.parse(d.resent_first) > Date.now() + (lqSnd.skew || 0);
  const status = wait ? `<b>${future ? 'Scheduled' : 'Sending'}</b>: ${lcNum(sent)} done, ${lcNum(wait)} waiting` : `Sent <b>${lcNum(sent)}</b> of ${lcNum(total)}`;
  const pill = fail ? ` <span class="ll-pill ll-num" title="Failed to queue or send: see the send log">${lcNum(fail)} failed</span>` : '';
  const at = wait && d.resent_first ? `<div class="ss-cell"><span>${future ? 'Next' : 'Due'} <b>${lcEsc(ssFmt(d.resent_first))}</b></span>${d.resent_last && d.resent_last !== d.resent_first ? `<span class="slv-note">Last ${lcEsc(ssFmt(d.resent_last))}</span>` : ''}</div>` : '<span class="slv-muted">–</span>';
  const by = d.resent_by ? lcEsc(String(d.resent_by).replace(/ \(resend\)$/, '')) : '<span class="slv-muted">–</span>';
  const act = wait ? '<button type="button" class="tglr lc-btn" onclick="lqbRsStop()">Stop</button>' : '<span class="slv-muted">Done</span>';
  return `<tr><td class="ll-nw"><b>Resend</b></td><td class="ll-nw">Not delivered, again</td><td class="ll-nw">${lcNum(total)}</td><td>${status}${pill}</td><td class="ll-nw">${at}</td><td class="ll-nw">${by}</td><td class="ll-nw">${act}</td></tr>`;
}
async function lqbRsStop() {
  const wait = lqbRS ? Number(lqbRS.resent_waiting) || 0 : 0;
  if (!wait) { lqNote('Nothing is waiting to stop.'); return; }
  if (!confirm(`Stop the resend?\n\n${lcNum(wait)} messages that have not gone yet are cancelled. Anything already sent cannot be called back. Those clients go back under Not delivered and can be scheduled again.`)) return;
  const { data, error } = await sb.rpc('lost_resend_cancel');
  if (error) { console.error(error); lqNote('That did not stop. Try again.'); return; }
  await lqbRsLoad();
  lqNote(`Stopped the resend: ${lcNum(data)} cancelled.`);
}

// ── Finish campaign (Kate, 19 Oct 2026) ──────────────────────────────────────────────────────────────────────────────────────────
// Once the last messages have gone out, Level 5 can finish the campaign: no new client goes into the four Google sheets or into the lists (the same
// switch as Stop adding new clients on the review sheets, plus the nightly refresh of the lists stops). Sending is not touched. migrations/lost_campaign_finish.sql.
let lqbCamp = null;
async function lqbCampLoad() {
  const host = document.getElementById('lqbCamp');
  if (!host) return;
  try {
    const { data, error } = await sb.rpc('lost_campaign_get');
    if (error || !data) throw error || new Error('no campaign info');
    lqbCamp = data;
  } catch (e) { lqbCamp = null; }
  const h = document.getElementById('lqbCamp');
  if (h) h.innerHTML = lqbCampHtml();
}
function lqbCampHtml() {
  const c = lqbCamp, lvl5 = lqwLevel(5);
  if (!c) return '';
  if (c.finished) {
    const day = c.at ? new Date(c.at).toLocaleDateString('en-GB', { timeZone: 'Asia/Dubai', day: 'numeric', month: 'short' }) : '';
    return `<div class="lqb-rs"><div><b>Campaign finished</b> <span class="slv-note">${c.by ? 'by ' + lcEsc(c.by) : ''}${day ? ' on ' + lcEsc(day) : ''}. No new client is added to the four Google sheets or to these lists, and the last wave is ended. Clients already on them keep updating, and anything already queued still goes.</span></div>
      ${lvl5 ? '<button type="button" class="tglr lc-btn" onclick="lqbCampSet(false)">Reopen campaign</button>' : ''}</div>`;
  }
  if (!lvl5) return '';
  return `<div class="lqb-rs"><div><b>Finish the campaign</b> <span class="slv-note">When the last messages have gone out: no new client is added to the four Google sheets or to these lists, and the last wave is ended. Clients already on them keep updating, and what is already queued still goes. You can reopen it.</span></div>
    <button type="button" class="tglr lc-btn lq-pri" onclick="lqbCampSet(true)">Finish campaign…</button></div>`;
}
async function lqbCampSet(on) {
  if (!lqwLevel(5)) return;
  const waiting = Object.values(lqSnd.jobs || {}).filter(j => j.status === 'queued' || j.status === 'sending').length + (lqbRS ? Number(lqbRS.resent_waiting) || 0 : 0);
  const ask = on
    ? `Finish the campaign?\n\nNo new client will be added to the four Google sheets or to the lists on this page, and any wave still open is ended. Clients already on them keep updating.${waiting ? `\n\n${lcNum(waiting)} messages are still waiting and will still go out: finishing does not stop sending.` : ''}\n\nYou can reopen it here.`
    : 'Reopen the campaign?\n\nNew clients are added to the sheets and the lists again, from tonight\'s refresh, and the wave that was ended comes back.';
  if (!confirm(ask)) return;
  const { error } = await sb.rpc('lost_campaign_finish', { p_on: !!on });
  if (error) { console.error(error); lqNote('That did not save. Only Level 6 can do it.'); return; }
  await lqbCampLoad();
  lqNote(on ? 'Campaign finished. No new clients will be added.' : 'Campaign reopened.');
}
const lqbRsBr = () => ['SAA', 'KCA', 'MC', 'AQ'].filter(b => Number(((lqbRS || {}).by_branch || {})[b]) > 0);
function lqbRsHtml() {
  const d = lqbRS;
  if (!d || !lqwLevel(4)) return '';
  const total = Number(d.total) || 0, resent = Number(d.resent) || 0, wait = Number(d.resent_waiting) || 0;
  if (!total && !resent) return '';
  const by = lqbRsBr().map(b => `${lcEsc(LC_BRANCH[b] || b)} ${lcNum(Number(d.by_branch[b]))}`).join(' · ');
  const on = lqSnd.info && lqSnd.info.enabled;
  return `<div class="lqb-rs"><div><b>Not delivered</b> <span class="slv-note">${total ? `${lcNum(total)} message${total === 1 ? '' : 's'} that WhatsApp did not deliver can be queued again (${by}).` : 'Nothing left to resend.'}
      Meta held them back to keep engagement healthy, and nothing was charged. One message per client, never anyone who replied, wrote STOP, is blocked or has booked.${resent ? ` Resent so far: ${lcNum(resent)}${wait ? `, ${lcNum(wait)} still waiting` : ''}.` : ''}</span></div>
    ${total ? `<button type="button" class="tglr lc-btn lq-pri" onclick="lqbRsOpen()"${on ? '' : ' disabled title="Sending is off"'}>Resend ${lcNum(total)}…</button>` : ''}</div>`;
}
function lqbRsOpen() {
  const d = lqbRS, i = lqSnd.info;
  if (!d || !i || !lqbRsBr().length) return;
  const brs = lqbRsBr();
  lqModalOpen(`<h3 id="lqrH">Resend ${lcNum(Number(d.total))} message${Number(d.total) === 1 ? '' : 's'} through respond.io?</h3>
    <p class="slv-note">The same message each client was sent, from the same branch number. Pick a time and a pace for each branch. They go out themselves at that time, even with this page closed, ${lcEsc(lqHour(i.hour_from))} to ${lcEsc(lqHour(i.hour_to))} Dubai time. Meta may hold some back again, and it costs nothing when it does.</p>
    ${brs.map(b => { const n = Number(d.by_branch[b]); return `<div class="lqm-br"><label class="ss-opt"><input type="checkbox" id="lqrb_${b}" checked onchange="lqbRsSummary()"> <b>${lcEsc(LC_BRANCH[b] || b)}</b> <span class="slv-note">${lcNum(n)} client${n === 1 ? '' : 's'}</span></label>
      ${ssWhenHtml('lqr_' + b, { max: n, maxNow: n, from: i.hour_from, to: i.hour_to, nowOk: true, onChange: lqbRsSummary })}</div>`; }).join('')}
    <div class="lqm-btns"><button type="button" class="tglr lc-btn" onclick="lqModalClose()">Cancel</button>
      <button type="button" class="tglr lc-btn lq-pri" id="lqrGo" onclick="lqbRsGo()">Schedule</button></div>`);
  // A starting point, not a rule: today at 16:00 (tomorrow if that has passed), 50 at a time every 10 minutes. Change any of it.
  const day = ssLocalStr(new Date()).slice(0, 10), at = day + 'T16:00', fut = new Date(at + ':00' + SS_OFF).getTime() > Date.now() + 60000;
  brs.forEach(b => {
    const m = document.querySelector(`input[name=lqr_${b}Mode][value=at]`), t = document.getElementById(`lqr_${b}At`), bb = document.getElementById(`lqr_${b}B`), ee = document.getElementById(`lqr_${b}E`);
    if (m) m.checked = true;
    if (t && fut) t.value = at;
    if (bb) bb.value = '50';
    if (ee) ee.value = '10';
    ssUpdate('lqr_' + b);
  });
  lqbRsSummary();
}
function lqbRsPicks() {
  return lqbRsBr().filter(b => { const c = document.getElementById('lqrb_' + b); return c && c.checked; }).map(b => ({ b, r: ssWhenRead('lqr_' + b) }));
}
function lqbRsSummary() {
  const go = document.getElementById('lqrGo'), h = document.getElementById('lqrH'), picks = lqbRsPicks();
  const bad = picks.some(x => x.r.error), n = picks.reduce((a, x) => a + (x.r.error ? 0 : x.r.count), 0);
  if (go) { go.disabled = bad || !picks.length; go.textContent = `${picks.some(x => x.r.at || x.r.every) ? 'Schedule' : 'Queue'} ${lcNum(n)}`; }
  if (h) h.textContent = `Resend ${lcNum(n)} message${n === 1 ? '' : 's'} through respond.io?`;
}
async function lqbRsGo() {
  const picks = lqbRsPicks();
  if (!picks.length || picks.some(x => x.r.error)) { lqbRsSummary(); return; }
  const go = document.getElementById('lqrGo');
  if (go) { go.disabled = true; go.textContent = 'Queueing…'; }
  const out = [];
  let failed = null;
  for (const p of picks) {
    const { data, error } = await sb.rpc('lost_send_resend', { p_branch: p.b, p_limit: p.r.limit, p_at: p.r.at, p_batch: p.r.batch, p_every: p.r.every });
    if (error) { console.error(error); failed = { p, error }; break; }
    out.push({ p, data });
  }
  lqModalClose();
  const when = ({ p, data }) => (p.r.at || p.r.every) && data.first_at ? `first ${ssFmt(data.first_at)}${data.last_at && data.last_at !== data.first_at ? `, last ${ssFmt(data.last_at)}` : ''}` : 'now';
  let msg = out.length ? `Queued again: ${out.map(o => `${LC_BRANCH[o.p.b] || o.p.b} ${lcNum(o.data.queued)} (${when(o)})`).join('. ')}. ${out.some(o => o.p.r.at || o.p.r.every) ? 'It sends itself.' : ''}`.trim() : '';
  if (failed) {
    const em = failed.error.message || 'try again';
    msg += `${msg ? ' ' : ''}${/switched off/i.test(em) ? 'Sending is switched off.' : `${LC_BRANCH[failed.p.b] || failed.p.b} did not queue: ${em}.`}${out.length ? ' The branches above it did queue.' : ''}`;
  }
  await lqSendLoad(); lqRelink(); lqPaint();
  lqNote(msg);
  if (out.some(o => !o.p.r.at)) lqKick();
  lqPoll();
}

// ── the messages themselves (Kate, 16 Oct 2026: the Message column is a link) ───────────────────────────────────────────────────
// Click a wave's Message to read what it sends: each template with a sample client filled in, the STOP line where there is one, its Meta name and
// whether Meta has approved it yet. Which templates a wave uses is lqTkeyBase / lqTkey in lost-queue.js.
const LQB_MSGS = {
  '1a': ['colour_v2', 'smoothing_v2', 'due_v2'], '1b': ['colour_story', 'smoothing_story', 'due_story'], '2': ['colour_v2', 'smoothing_v2', 'due_v2'],
  '3': ['colour_v2_stop', 'smoothing_v2_stop', 'due_v2_stop'], '4': ['due_v2_stop'],
};
const LQB_MSG_NAME = { colour: 'Colour', smoothing: 'Smoothing', due: 'Due' };
function lqbShowMsg(key) {
  const i = lqSnd.info;
  if (!i) return;
  const sample = { first_name: 'Sara', branch: 'Saadiyat', month: 'August 2026', stylist: 'our team', offer_pct: '', offer_until: '' };
  const g = lqbGroups().find(x => x.k === key), cards = (LQB_MSGS[key] || []).map(k => {
    const t = (i.templates || []).find(x => x.key === k);
    if (!t) return `<div class="slv-note">${lcEsc(k)}: this template is not set up yet.</div>`;
    const body = t.body.replace(/\{\{(\d+)\}\}/g, (m, n) => { const v = t.vars[n - 1]; return sample[v] != null ? sample[v] : m; });
    return `<div class="lqb-mt"><div class="lqb-mh"><b>${lcEsc(LQB_MSG_NAME[t.qtype] || t.qtype)}</b> <span class="slv-note">${lcEsc(t.respond_name)}</span>
        <span class="ll-pill ${t.approved ? 'll-act' : 'll-num'}">${t.approved ? 'Approved by Meta' : 'Not approved yet'}</span></div>
      <div class="lq-bubble">${lcEsc(body).replace(/\n/g, '<br>')}${t.footer ? `<div class="slv-note" style="margin-top:8px">${lcEsc(t.footer)}</div>` : ''}</div></div>`;
  }).join('');
  lqModalOpen(`<h3>${lcEsc((g || {}).label || 'Wave')}: what it sends</h3>
    <p class="slv-note">An example for a client called Sara at Saadiyat. The name, branch and month change for each client; the rest is the approved wording.</p>${cards}
    <div class="lqm-btns"><button type="button" class="tglr lc-btn" onclick="lqModalClose()">Close</button></div>`);
}
