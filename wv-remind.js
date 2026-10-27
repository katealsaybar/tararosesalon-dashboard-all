// Wellness Voucher Blast 4, the REMINDER: deploy it from here (Level 5, Kate, 27 Oct 2026). Sits under the Blast 4 send panel (wv-lastsend.js) on the blasts page.
// The reminder itself is a GoHighLevel workflow, "WV reminder - Send (tag go)": it fires when a contact gets the tag wv-reminder-go, sends the WhatsApp template
// wellness_voucher_2026_reminder and then adds wv-reminder-sent. Kate publishes that workflow herself. This panel only adds the tag, a batch at a time, to the 302 clients
// locked on 27 Oct 2026 (wv_reminder_list), through the edge function wv-reminder-worker. It never sends a WhatsApp itself, so a tag added while the workflow is still a draft sends nothing.
// migrations/wv_reminder.sql. The switch (wv_reminder_config.enabled) is the kill switch: off, nothing is claimed. Tags only inside the Dubai window (10:00 to 19:00).
// Scheduling uses send-schedule.js (ssWhenHtml, ssWhenRead, ssTriageHtml, ssModalOpen), the confirm dialog is wvAsk (wv-blast.js). Loads after wv-lastsend.js.
let wvRm = null, wvRmMsg = '', wvRmBusy = false, wvRmTimer = 0, wvRmSkew = 0, wvRmCtx = null;
const wvRmWin = i => i && i.dubai_hour >= i.hour_from && i.dubai_hour < i.hour_to;
const wvRmNow = () => Date.now() + wvRmSkew;   // the database's clock, so "due" does not depend on the laptop's
const wvRmN = v => Number(v) || 0;
const wvRmIsSched = i => !!i && wvRmN(i.counts.waiting) > 0 && !!i.job.next_run_at && Date.parse(i.job.next_run_at) > wvRmNow() + 1000;
const wvRmIsDue = i => !!i && wvRmN(i.counts.waiting) > 0 && !wvRmIsSched(i);
const WV_RM_OUT = [['bought', 'bought a voucher since 26 Oct'], ['optout', 'on the opt-out list'], ['excluded', 'marked Do not contact or Wrong number'], ['not_for_me', 'wrote "not for me"'], ['stop', 'wrote STOP']];
async function wvRmLoad() {
  try {
    const { data, error } = await sb.rpc('wv_reminder_info');
    if (error || !data) throw error || new Error('no info');
    wvRm = data;
    if (data.server_now) wvRmSkew = Date.parse(data.server_now) - Date.now();
  } catch (e) { console.error(e); wvRm = null; wvRmMsg = 'The reminder panel did not load. Refresh to try again.'; }
  wvRmPaint();
}
function wvRmSay(t) { wvRmMsg = t; const n = document.getElementById('wvRmNote'); if (n) n.textContent = t; }
function wvRmPaint() {
  const box = document.getElementById('wvRmBox');
  if (!box) return;
  const logOpen = !!box.querySelector('.wv-log[open]');
  if (!wvRm) { box.innerHTML = `<div class="ll-panel wv-send"><p class="slv-muted">${lcEsc(wvRmMsg || 'Loading…')}</p></div>`; return; }
  const i = wvRm, c = i.counts, j = i.job, on = !!i.enabled, win = wvRmWin(i), sched = wvRmIsSched(i);
  const ready = wvRmN(c.ready), wait = wvRmN(c.waiting), sent = wvRmN(c.sent), bad = wvRmN(c.failed), skip = wvRmN(c.skipped), out = wvRmN(c.left_out), canc = wvRmN(j.cancelled);
  const dt = ts => ts ? lcEsc(new Date(ts).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })) : '<span class="slv-muted">–</span>';
  let st = '<span class="slv-muted">Not sent</span>';
  if (wait && sched) st = `<b>Scheduled</b>: ${lcNum(sent)} done, ${lcNum(wait)} waiting`;
  else if (wait) st = `<span class="wv-ring" role="status" aria-label="Sending"></span> <b>Sending</b>: ${lcNum(sent)} done, ${lcNum(wait)} waiting`;
  else if (sent || bad || skip || canc) st = `Tagged <b>${lcNum(sent)}</b> of ${lcNum(c.listed)}`;
  const pills = [bad ? `<span class="ll-pill ll-num" title="Failed: sorted under Failed sends below">${lcNum(bad)} failed</span>` : '', skip ? `<span class="ll-pill ll-num" title="Skipped by a safety check, see the log">${lcNum(skip)} skipped</span>` : '', canc ? `<span class="ll-pill ll-num">${lcNum(canc)} stopped</span>` : ''].filter(Boolean).join(' ');
  let act = '', at = '<span class="slv-muted">–</span>';
  if (wait) {
    act = `${sched ? `<button type="button" class="tglr lc-btn" onclick="wvRmBring()"${wvRmBusy ? ' disabled' : ''}>Send now</button>` : `<button type="button" class="tglr lc-btn" onclick="wvRmRun()"${wvRmBusy ? ' disabled' : ''}>Run now</button>`} <button type="button" class="tglr lc-btn" onclick="wvRmStop()">Stop</button>${ready > 0 ? ` <button type="button" class="tglr lc-btn lq-pri" onclick="wvRmSchedOpen('new')"${wvRmBusy ? ' disabled' : ''} title="The ${lcNum(ready)} not queued yet">Schedule the other ${lcNum(ready)}…</button>` : ''}`;
    at = `<div class="ss-cell">${j.next_run_at ? `<span>${sched ? 'Next' : 'Due'} <b>${lcEsc(ssFmt(j.next_run_at))}</b></span>` : ''}<button type="button" class="tglr lc-btn" onclick="wvRmSchedOpen('move')">Change time</button></div>`;
  } else if (ready > 0) {
    act = `<button type="button" class="tglr lc-btn wv-go" onclick="wvRmGo()"${wvRmBusy ? ' disabled' : ''}>${sent ? `Send the other ${lcNum(ready)}` : `Send the reminder to ${lcNum(ready)}`}</button>`;
    at = `<button type="button" class="tglr lc-btn lq-pri" onclick="wvRmSchedOpen('new')"${wvRmBusy ? ' disabled' : ''}>Schedule…</button>`;
  } else if (sent) { act = '<span class="slv-muted">Done</span>'; if (j.first_sent_at) at = dt(j.first_sent_at); }
  else act = '<span class="slv-muted">No one left to send</span>';
  const outList = WV_RM_OUT.filter(([k]) => wvRmN(c[k]) > 0).map(([k, t]) => `<b>${lcNum(c[k])}</b> ${lcEsc(t)}`).join(' · ');
  const atSend = [['dup', 'on do-not-disturb or already tagged in GHL'], ['bought', 'bought a voucher'], ['optout', 'on the opt-out list'], ['excluded', 'Do not contact or Wrong number'], ['not_for_me', 'wrote "not for me"'], ['stop', 'wrote STOP']]
    .filter(([k]) => wvRmN(j['skipped_' + k]) > 0).map(([k, t]) => `<b>${lcNum(j['skipped_' + k])}</b> ${lcEsc(t)}`).join(' · ');
  const recent = (i.recent || []).map(r => `<tr><td class="ll-nw">${r.is_test ? 'Test' : lcEsc(r.seg === 'warm' ? 'Warm' : 'Clean')}</td><td>${lcEsc(r.client)}<div class="slv-note">${lcEsc(WV_BR[r.branch] || r.branch)}</div></td><td class="ll-nw">${lcEsc(r.status)}</td><td>${lcEsc(r.error || '')}</td><td class="ll-nw">${dt(r.at)}</td></tr>`).join('');
  const tri = ssTriageHtml((i.failed || []).map(f => ({ id: f.id, cls: f.cls, error: f.error })), { retry: 'wvRmTriRetry', copy: 'wvRmTriCopy',
    checkSay: 'The tag may already be on her (the connection dropped while tagging). Retrying is safe: she is looked up in GHL first and skipped if the tag is already there.',
    stopSay: 'These fail the same way every time (not a contact in GHL yet, or GHL refused). Fix her in GHL, or message her by hand.' });
  const nothing = !ready && !wait;
  box.innerHTML = `<div class="ll-panel wv-send">
    <div class="wv-send-h"><div><b>Blast 4: send the reminder</b> <span class="slv-note">only you see this</span></div>
      <button type="button" class="tglr lc-btn wv-sw ${on ? 'on' : 'off'}" onclick="wvRmSwitch(${on ? 'false' : 'true'})" title="The kill switch. Off: nothing is tagged, even what is already queued.">Sending is ${on ? 'ON' : 'OFF'} · turn ${on ? 'off' : 'on'}</button></div>
    <p class="slv-note wv-what"><b>What is this?</b> The buttons that deploy the Blast 4 reminder, a WhatsApp to the ${lcNum(c.listed)} clients locked on 27 Oct (${lcNum(c.clean)} clean, ${lcNum(c.warm)} warm). <b>Why it matters:</b> each client you tag gets the WhatsApp at once and it cannot be called back. <b>Next:</b> ${nothing ? 'nothing to send, everyone has been tagged.' : on ? 'press Send, or Schedule… for later.' : 'publish the workflow in GHL, turn Sending ON, then press Send, or Schedule… for later.'}</p>
    <p class="ss-plan ss-bad wv-rm-warn"><b>Publish the workflow first.</b> In GHL, "WV reminder - Send (tag go)" must be <b>Published</b>. While it is a draft, tagging sends nothing and the client is marked tagged anyway. Once it is published, <b>tagging fires the WhatsApp immediately</b>.</p>
    <div class="wv-lcards">
      <div class="wv-lcard"><div class="wv-lh"><b>The reminder</b><span class="slv-note">${lcNum(ready)} ready, of ${lcNum(c.listed)} on the list</span></div>
        <div class="wv-ll"><span class="slv-note">Status</span><span>${st} ${pills}</span></div>
        <div class="wv-ll"><span class="slv-note">Send at</span><span>${at}</span></div>
        <div class="wv-ll"><span class="slv-note">Last sent</span><span>${wait ? '<span class="slv-muted">in progress</span>' : dt(j.last_sent_at)}</span></div>
        <div class="wv-ll"><span class="slv-note">Left out</span><span>${out ? `<b>${lcNum(out)}</b> now: ${outList}` : 'No one now. Checked again when you press Send, and once more before each client is tagged.'}</span></div>
        ${atSend ? `<div class="wv-ll"><span class="slv-note">Dropped</span><span>${atSend}</span></div>` : ''}
        <div class="wv-lb">${act}</div></div></div>
    <div class="wv-acts" style="margin-top:8px"><button type="button" class="tglr lc-btn" onclick="wvRmTest()"${wvRmBusy || !i.test_ready ? ' disabled' : ''} title="Tags your own number only. If the workflow is Published, one WhatsApp reaches your phone">Send a test to my phone</button></div>
    <div id="wvRmNote" class="slv-note" style="margin-top:6px">${lcEsc(wvRmMsg)}</div>
    ${tri}
    <details class="wv-how"><summary>How deploying works</summary><p class="slv-muted wv-send-p">Each client gets the GHL tag <b>wv-reminder-go</b>, which starts the GHL workflow "WV reminder - Send (tag go)": the WhatsApp template wellness_voucher_2026_reminder from +971 58 155 9679 with her first name, then the tag <b>wv-reminder-sent</b>. The workflow allows each contact in once, so nobody gets it twice. <b>Ready</b> is the locked list minus anyone who has bought a voucher since 26 Oct, is on the opt-out list, is marked Do not contact or Wrong number, or wrote "not for me" or STOP; it is worked out again every time you press Send, and the sender checks each client once more just before her tag goes. In GHL the sender also skips anyone on do-not-disturb or who already has either tag. Warm clients go first. Tags go on only between ${i.hour_from}:00 and ${i.hour_to}:00 Dubai${win ? '' : ' <b>(outside that window now)</b>'}, ${i.per_run} at a time. To start small, press <b>Schedule…</b>, keep "as soon as", and set <b>How many</b> to 20: those are the warm clients. <b>Schedule…</b> also picks a day, time and pace, then it sends itself, so you can close this page${on ? '' : ', but only while Sending is ON'}. <b>Stop</b> cancels only the clients still waiting.</p></details>
    <details class="wv-log"><summary>Recent activity (last 40)</summary>
      <div class="slv-wrap"><table class="slv-table"><thead><tr><th>List</th><th>Client</th><th>Status</th><th>Note</th><th>When</th></tr></thead>
      <tbody>${recent || '<tr><td colspan="5" class="slv-muted">Nothing has been tagged from this page yet.</td></tr>'}</tbody></table></div></details></div>`;
  if (logOpen) { const d = box.querySelector('.wv-log'); if (d) d.open = true; }
  // While clients are going out, look again every 6 seconds so the numbers and the ring keep up, even if the cron is doing the work. Waiting for its time: once in a while.
  clearTimeout(wvRmTimer);
  if (wait > 0 && !wvRmBusy) wvRmTimer = setTimeout(() => { if (document.getElementById('wvRmBox')) wvRmLoad(); }, wvRmIsDue(i) ? 6000 : 30000);
}
async function wvRmSwitch(on) {
  if (on && !(await wvAsk({ title: 'Turn the reminder sending ON?', ok: 'Turn sending on', lines: [
    'Clients you send, or have scheduled, get the GHL tag <b>wv-reminder-go</b> at their time. If the workflow is Published, that sends the WhatsApp straight away.',
    'You can turn it off again at any time; that stops everything still waiting.'] }))) return;
  const { data, error } = await sb.rpc('wv_reminder_config_set', { p_patch: { enabled: on } });
  if (error) { wvRmSay('Could not change the switch: ' + (error.message || error)); return; }
  wvRm = data; wvRmMsg = on ? 'Sending is ON.' : 'Sending is OFF. Nothing more will go.'; await wvRmLoad();
}
async function wvRmGo() {
  if (!wvRm) return;
  const n = wvRmN(wvRm.counts.ready);
  if (!wvRm.enabled) { wvRmSay('Turn sending ON first (top right of this panel).'); return; }
  if (!wvRmWin(wvRm)) { wvRmSay(`It is outside the send window (${wvRm.hour_from}:00 to ${wvRm.hour_to}:00 Dubai). Use Schedule… to pick when it goes.`); return; }
  if (n < 1) { wvRmSay('No one is ready to send.'); return; }
  if (!(await wvAsk({ title: 'Send the reminder now?', ok: `Send to ${lcNum(n)} clients`, lines: [
    `<b>This sends a WhatsApp to ${lcNum(n)} clients.</b> It cannot be called back.`,
    'Make sure the GHL workflow <b>"WV reminder - Send (tag go)"</b> is <b>Published</b>. Tagging fires the WhatsApp immediately.',
    'Anyone who bought a voucher since 26 Oct, is on a stop list, or wrote "not for me" or STOP is left out, and anyone on do-not-disturb in GHL is skipped.',
    `Sending is ${wvRm.enabled ? 'ON' : 'OFF'}; the send window is ${wvRm.hour_from}:00 to ${wvRm.hour_to}:00 Dubai.`] }))) return;
  wvRmBusy = true; wvRmPaint(); wvRmSay('Queueing the reminder…');
  const { data, error } = await sb.rpc('wv_reminder_enqueue', {});
  if (error) { wvRmBusy = false; wvRmSay('Could not queue it: ' + (error.message || error)); await wvRmLoad(); return; }
  wvRmSay(`Queued ${data?.queued ?? 0}. Sending…`);
  await wvRmRun();
}
// Calls the worker until nothing is due, the switch goes off or the window closes. If the page is closed first, what is left stays queued and the cron (every minute inside the window) carries on.
async function wvRmRun() {
  wvRmBusy = true;
  try {
    for (let k = 0; k < 60; k++) {
      const { data: r, error } = await sb.functions.invoke('wv-reminder-worker', { body: {} });
      if (error) { wvRmSay('The sender did not answer. Press Run now to try again.'); break; }
      await wvRmLoad();
      const due = wvRmIsDue(wvRm) ? wvRmN(wvRm.counts.waiting) : 0, later = wvRmIsSched(wvRm);
      if (!due || !wvRm?.enabled || !wvRmWin(wvRm)) {
        wvRmSay(!due ? (later ? 'Tagged what was due. The rest goes at its scheduled time.' : 'All done.') : !wvRm?.enabled ? 'Sending is off, so the rest is waiting.' : 'The send window is closed, so the rest is waiting.');
        break;
      }
      if (!r || !r.claimed) await new Promise(res => setTimeout(res, 3000));
    }
  } catch (e) { console.error(e); wvRmSay('Something went wrong. Check the activity log, then press Run now.'); }
  wvRmBusy = false; wvRmPaint();
}
async function wvRmStop() {
  if (!(await wvAsk({ title: 'Stop the reminder?', ok: 'Stop', lines: [
    'Everyone still waiting is cancelled.', 'Clients already tagged have gone to GHL and cannot be called back.'] }))) return;
  const { data, error } = await sb.rpc('wv_reminder_stop');
  if (error) { wvRmSay('Could not stop it: ' + (error.message || error)); return; }
  await wvRmLoad(); wvRmSay(`Stopped: ${data?.cancelled ?? 0} cancelled.`);
}
// Bring a scheduled batch forward: everyone waiting becomes due now (the window and the switch still apply).
async function wvRmBring() {
  const w = wvRmN(wvRm?.counts.waiting);
  if (!(await wvAsk({ title: 'Send the reminder now?', ok: 'Send now', lines: [
    `<b>This sends a WhatsApp to ${lcNum(w)} clients</b>, now instead of at their scheduled time. It cannot be called back.`,
    'Make sure the GHL workflow <b>"WV reminder - Send (tag go)"</b> is <b>Published</b>. Tagging fires the WhatsApp immediately.',
    `Sending is ${wvRm.enabled ? 'ON' : 'OFF'}; the send window is ${wvRm.hour_from}:00 to ${wvRm.hour_to}:00 Dubai.`] }))) return;
  const { data, error } = await sb.rpc('wv_reminder_reschedule', { p_at: null });
  if (error) { wvRmSay('Could not change the time: ' + (error.message || error)); return; }
  await wvRmLoad();
  if (wvRm?.enabled && wvRmWin(wvRm)) { wvRmSay(`${data?.moved ?? 0} moved to now. Sending…`); await wvRmRun(); }
  else wvRmSay(`${data?.moved ?? 0} moved to now. ${wvRm?.enabled ? 'They go when the send window opens.' : 'Sending is OFF, so nothing goes until you turn it ON.'}`);
}
// One test: your own number only (wv_reminder_config.test_phone). Ignores the switch and the window. Tags the number in GHL; the workflow, if Published, sends one WhatsApp to your phone.
async function wvRmTest() {
  if (!(await wvAsk({ title: 'Send a test to your phone?', ok: 'Send the test', lines: [
    'Your own number gets the GHL tag <b>wv-reminder-go</b>. If the workflow is <b>Published</b>, one real WhatsApp reaches your phone. If it is still a draft, nothing is sent.',
    'If your number already has the tag, nothing is sent (the workflow lets each contact in once). Remove the tags on your contact in GHL to test again.',
    'It does not touch the client list.'] }))) return;
  wvRmBusy = true; wvRmPaint(); wvRmSay('Sending the test…');
  const { data: id, error } = await sb.rpc('wv_reminder_test');
  if (error) { wvRmBusy = false; wvRmSay('Could not queue the test: ' + (error.message || error)); wvRmPaint(); return; }
  let res = null;
  for (let k = 0; k < 6 && !(res && ['sent', 'failed', 'skipped'].includes(res.status)); k++) {
    await sb.functions.invoke('wv-reminder-worker', { body: {} }).then(() => {}, () => {});
    const g = await sb.rpc('wv_reminder_test_get', { p_id: id }); res = g.data || res;
    if (!(res && ['sent', 'failed', 'skipped'].includes(res.status))) await new Promise(r => setTimeout(r, 2500));
  }
  wvRmBusy = false;
  wvRmSay(!res ? 'No answer yet. Look at your phone, and try again if nothing comes.' : res.status === 'sent' ? 'Test tagged in GHL. If the workflow is Published, check your phone.' : `The test did not go: ${res.error || res.status}`);
  await wvRmLoad();
}
// ── schedule and change time (one dialog: when, how many, what pace) ─────────────────────────────────────────────
function wvRmSchedForm(max) {
  const i = wvRm;
  return `${i.enabled ? '' : '<p class="ss-plan ss-bad">Sending is OFF. Nothing goes until you turn it ON at the top of this panel.</p>'}
    ${ssWhenHtml('wvr', { max, maxNow: max, from: i.hour_from, to: i.hour_to, nowOk: true, onChange: r => { const b = document.getElementById('wvrGo'); if (b) b.disabled = !!r.error; } })}`;
}
function wvRmSchedOpen(mode) {
  if (!wvRm) return;
  const move = mode === 'move', wait = wvRmN(wvRm.counts.waiting), ready = wvRmN(wvRm.counts.ready), max = move ? wait : ready;
  if (max < 1) { wvRmSay('No one left.'); return; }
  wvRmCtx = { move };
  ssModalOpen(`<h3>${move ? 'Change the time of the' : 'Schedule the'} reminder</h3>
    <p class="slv-note">${move ? `All ${lcNum(wait)} still waiting are moved to the new time and pace.` : `<b>At that time this sends a WhatsApp to up to ${lcNum(ready)} clients.</b> Warm clients go first.`}</p>
    ${wvRmSchedForm(max)}
    <ul class="lqm-list"><li>It goes by itself at that time, even with this page closed, but only while Sending is ON and the GHL workflow "WV reminder - Send (tag go)" is Published. Times outside ${wvRm.hour_from}:00 to ${wvRm.hour_to}:00 Dubai wait for the window to open.</li>
      <li>Stop cancels the ones that have not gone. A WhatsApp that has gone cannot be called back.</li></ul>
    <div class="lqm-btns"><button type="button" class="tglr lc-btn" onclick="ssModalClose()">Cancel</button>
      <button type="button" class="tglr lc-btn lq-pri" id="wvrGo" onclick="wvRmSchedGo()">${move ? 'Change time' : 'Schedule'}</button></div>`);
  if (move) { const n = document.getElementById('wvrN'); if (n) n.disabled = true; const at = document.querySelector('input[name=wvrMode][value=at]'); if (at) at.checked = true; }
  ssUpdate('wvr');
}
async function wvRmSchedGo() {
  const c = wvRmCtx, r = ssWhenRead('wvr');
  if (!c || r.error) { ssUpdate('wvr'); return; }
  const b = document.getElementById('wvrGo');
  if (b) { b.disabled = true; b.textContent = 'Working…'; }
  const pace = { p_batch: r.batch, p_every: r.every };
  const res = c.move ? await sb.rpc('wv_reminder_reschedule', { p_at: r.at, ...pace }) : await sb.rpc('wv_reminder_enqueue', { p_at: r.at, p_limit: r.limit, ...pace });
  ssModalClose();
  if (res.error) { console.error(res.error); await wvRmLoad(); wvRmSay('Did not go through: ' + (res.error.message || res.error)); return; }
  const d = res.data || {};
  await wvRmLoad();
  const n = c.move ? d.moved : d.queued, first = d.first_at || r.first, last = d.last_at || r.last;
  wvRmSay(`Reminder: ${lcNum(n ?? 0)} ${c.move ? 'moved' : 'queued'}. First ${ssFmt(first)}${last && last !== first ? `, last ${ssFmt(last)}` : ''}. ${wvRm?.enabled ? 'It sends itself, you can close this page.' : 'Sending is OFF, so nothing goes until you turn it ON.'}`);
  if (!c.move && !r.at && wvRm?.enabled && wvRmWin(wvRm)) wvRmRun();   // as soon as: do not wait for the next minute of the cron
}
// ── failed ones (send-schedule.js draws the triage) ─────────────────────────────────────────────────────────────
const wvRmTriRows = cls => (wvRm?.failed || []).filter(f => f.cls === cls);
async function wvRmTriRetry(cls) {
  const rows = wvRmTriRows(cls);
  if (!rows.length || !wvRm) return;
  if (!(await wvAsk({ title: `Retry ${lcNum(rows.length)} failed tag${rows.length === 1 ? '' : 's'}?`, ok: 'Retry', lines: [
    'Each client is looked up in GHL again first and skipped if she already has the tag, so nobody is tagged twice.',
    `<b>This sends a WhatsApp to up to ${lcNum(rows.length)} clients</b> if the GHL workflow is Published.`,
    `Sending is ${wvRm.enabled ? 'ON' : 'OFF'}; the send window is ${wvRm.hour_from}:00 to ${wvRm.hour_to}:00 Dubai.`] }))) return;
  const { data, error } = await sb.rpc('wv_reminder_retry', { p_ids: rows.map(f => f.id) });
  if (error) { wvRmSay('Could not retry: ' + (error.message || error)); return; }
  await wvRmLoad(); wvRmSay(`Retrying ${data?.queued ?? 0}.`);
  if (wvRm?.enabled && wvRmWin(wvRm)) wvRmRun();
}
async function wvRmTriCopy(cls) {
  const nums = [...new Set(wvRmTriRows(cls).map(f => f.phone).filter(Boolean))];
  try { await navigator.clipboard.writeText(nums.join('\n')); wvRmSay(`Copied ${lcNum(nums.length)} numbers.`); }
  catch (e) { wvRmSay('The browser would not copy.'); }
}
