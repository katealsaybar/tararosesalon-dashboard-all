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
// What the day still has for wave n: the daily cap (half of it in Wave 4) less what has been queued or sent today.
function lqbRoom(n) {
  const i = lqSnd.info;
  if (!i) return 0;
  const w = LQW[n - 1];
  return Math.max(0, Math.min(i.daily_cap, Math.round(i.daily_cap * w.factor)) - i.used_today);
}
const lqbOrder = (a, b) => (LQ_WA_ORDER[a.wa] - LQ_WA_ORDER[b.wa]) || (LQ_TYPE_ORDER.indexOf(a.qtype) - LQ_TYPE_ORDER.indexOf(b.qtype)) || (a.days_since - b.days_since);

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
  } else if (st === 'ready') act = lvl4 && g.k !== '1b' ? `<button type="button" class="tglr lc-btn wv-go" onclick="lqwOpen(${g.n})">Open ${g.n === 1 ? 'Wave 1' : lcEsc(g.label)}</button>` : g.k === '1b' ? '<span class="slv-muted">Opens with 1a</span>' : '<span class="slv-muted">Level 4 opens it</span>';
  else if (st === 'done') act = '<span class="slv-muted">Done</span>';
  else act = `<span class="slv-muted">After Wave ${g.n - 1}</span>`;
  return `<tr><td class="ll-nw"><b>${lcEsc(g.label)}</b></td><td class="ll-nw"><a href="#" class="lqb-msg" onclick="event.preventDefault();lqbShowMsg('${g.k}')" title="Read the message">${lcEsc(g.msg)}</a></td><td class="ll-nw">${lcNum(s.total)}</td><td>${status} ${pills}</td><td class="ll-nw">${at}</td><td class="ll-nw">${act}</td></tr>`;
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
    <div class="wv-send-h"><div><b>Send from here</b> <span class="slv-note">Level 4 opens a wave · Level 5 switches sending and sets the pace</span></div>${sw}</div>
    <p class="slv-muted wv-send-p">Each message goes through respond.io from that client's own branch number, as an approved template. It sends only between ${lcEsc(lqHour(i.hour_from))} and ${lcEsc(lqHour(i.hour_to))} Dubai${win ? '' : ' <b>(closed right now, so it waits)</b>'}, ${pace}.
      Today <b>${lcNum(i.sent_today || 0)}</b> sent${waiting ? `, <b>${lcNum(waiting)}</b> waiting` : ''}, up to ${lcNum(i.daily_cap)} a day. A client who wrote STOP, is blocked, or is not a respond.io contact is skipped.</p>
    <div class="slv-wrap"><table class="slv-table"><thead><tr><th>Wave</th><th>Message</th><th>Clients</th><th>Status</th><th>Send at</th><th></th></tr></thead><tbody>${lqbGroups().map(lqbRow).join('')}</tbody></table></div>
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
    <div class="ll-fresh">
      <span class="ll-chip">Sent is read from <b>respond.io</b> every night</span>
      <span class="ll-chip">Campaign started <b>${lcEsc(llDay(lqData.campaign_from))}</b></span>
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
      <div class="lq-bubble">${lcEsc(body).replace(/
/g, '<br>')}${t.footer ? `<div class="slv-note" style="margin-top:8px">${lcEsc(t.footer)}</div>` : ''}</div></div>`;
  }).join('');
  lqModalOpen(`<h3>${lcEsc((g || {}).label || 'Wave')}: what it sends</h3>
    <p class="slv-note">An example for a client called Sara at Saadiyat. The name, branch and month change for each client; the rest is the approved wording.</p>${cards}
    <div class="lqm-btns"><button type="button" class="tglr lc-btn" onclick="lqModalClose()">Close</button></div>`);
}
