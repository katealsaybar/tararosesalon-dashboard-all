// Wellness Voucher Blast 4, the last push: SEND IT FROM HERE (Level 5, Kate, 23 Oct 2026), the way Lost Clients and Blast 3 send. Press Send, or Schedule it for Monday.
// It queues one WhatsApp message per client (wv_last_enqueue); the edge function wv-last-worker then sends each through respond.io from the channel Call Center 2 (+971 56 277 3945)
// with the two approved Meta templates (wellness_voucher_last_push_warm for the warm list, wellness_voucher_last_push_new for the clean list), and tags the contact.
// migrations/wv_last_send.sql. The switch (wv_last_config.enabled) is the kill switch: off, nothing is claimed. Sends only inside the Dubai window (10:00 to 19:00).
// Scheduling uses send-schedule.js (ssWhenHtml, ssWhenRead, ssTriageHtml, ssModalOpen), the confirm dialog is wvAsk (wv-blast.js). Loads after wv-blast.js and wv-last.js.
let wvLs = null, wvLsMsg = '', wvLsBusy = false, wvLsTimer = 0, wvLsSkew = 0, wvLsCtx = null;
const wvLsWin = i => i && i.dubai_hour >= i.hour_from && i.dubai_hour < i.hour_to;
const wvLsNow = () => Date.now() + wvLsSkew;   // the database's clock, so "due" does not depend on the laptop's
const wvLsIsSched = s => Number(s.waiting) > 0 && !!s.next_run_at && Date.parse(s.next_run_at) > wvLsNow() + 1000;
const wvLsIsDue = s => Number(s.waiting) > 0 && !wvLsIsSched(s);
const wvLsList = k => k === 'warm' ? 'Warm list' : 'Clean list';
const wvLsTpl = k => (wvLs && (wvLs.templates || []).find(t => t.key === (k === 'warm' ? 'warm' : 'new'))) || null;
// Branches that still have someone ready in a list (wv_last_info segs[].by_branch), so a list can go one branch at a time (26 Oct 2026, migrations/wv_last_branch.sql).
const wvLsBr = s => ['SAA', 'KCA', 'MC', 'AQ'].filter(b => Number(((s || {}).by_branch || {})[b]) > 0);
async function wvLsLoad() {
  try {
    const { data, error } = await sb.rpc('wv_last_info');
    if (error || !data) throw error || new Error('no info');
    wvLs = data;
    if (data.server_now) wvLsSkew = Date.parse(data.server_now) - Date.now();
  } catch (e) { console.error(e); wvLs = null; wvLsMsg = 'The send panel did not load. Refresh to try again.'; }
  wvLsPaint();
}
function wvLsSay(t) { wvLsMsg = t; const n = document.getElementById('wvLsNote'); if (n) n.textContent = t; }
function wvLsPaint() {
  const box = document.getElementById('wvLsBox');
  if (!box) return;
  const logOpen = !!box.querySelector('.wv-log[open]');
  if (!wvLs) { box.innerHTML = `<div class="ll-panel wv-send"><p class="slv-muted">${lcEsc(wvLsMsg || 'Loading…')}</p></div>`; return; }
  const i = wvLs, on = !!i.enabled, win = wvLsWin(i), segs = i.segs || [];
  const dt = ts => ts ? lcEsc(new Date(ts).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })) : '<span class="slv-muted">–</span>';
  const approved = (i.templates || []).every(t => t.approved);
  const rows = segs.map(s => {
    const sent = Number(s.sent) || 0, wait = Number(s.waiting) || 0, bad = Number(s.failed) || 0, skip = Number(s.skipped) || 0, canc = Number(s.cancelled) || 0, ready = Number(s.ready) || 0, sched = wvLsIsSched(s);
    let st = '<span class="slv-muted">Not sent</span>';
    if (wait && sched) st = `<b>Scheduled</b>: ${lcNum(sent)} done, ${lcNum(wait)} waiting`;
    else if (wait) st = `<span class="wv-ring" role="status" aria-label="Sending"></span> <b>Sending</b>: ${lcNum(sent)} done, ${lcNum(wait)} waiting`;
    else if (sent || bad || skip || canc) st = `Sent <b>${lcNum(sent)}</b> of ${lcNum(s.listed)}`;
    const extra = [bad ? `<span class="ll-pill ll-num" title="Failed: sorted under Failed sends below">${lcNum(bad)} failed</span>` : '', skip ? `<span class="ll-pill ll-num" title="Skipped by a safety check, see the log">${lcNum(skip)} skipped</span>` : '', canc ? `<span class="ll-pill ll-num">${lcNum(canc)} stopped</span>` : ''].filter(Boolean).join(' ');
    let act = '', at = '<span class="slv-muted">–</span>';
    if (wait) {
      act = `${sched ? `<button type="button" class="tglr lc-btn" onclick="wvLsBring('${s.seg}')"${wvLsBusy ? ' disabled' : ''}>Send now</button>` : `<button type="button" class="tglr lc-btn" onclick="wvLsRun()"${wvLsBusy ? ' disabled' : ''}>Run now</button>`} <button type="button" class="tglr lc-btn" onclick="wvLsStop('${s.seg}')">Stop</button>${ready > 0 ? ` <button type="button" class="tglr lc-btn lq-pri" onclick="wvLsSchedOpen('${s.seg}','new')"${wvLsBusy ? ' disabled' : ''} title="The rest of this list, ${lcNum(ready)} not queued yet, for another branch or another time">Schedule the other ${lcNum(ready)}…</button>` : ''}`;
      at = `<div class="ss-cell">${s.next_run_at ? `<span>${sched ? 'Next' : 'Due'} <b>${lcEsc(ssFmt(s.next_run_at))}</b></span>` : ''}<button type="button" class="tglr lc-btn" onclick="wvLsSchedOpen('${s.seg}','move')">Change time</button></div>`;
    } else if (ready > 0) {
      act = `<button type="button" class="tglr lc-btn wv-go" onclick="wvLsGo('${s.seg}')"${wvLsBusy ? ' disabled' : ''}>${sent ? 'Send the rest' : 'Send the ' + (s.seg === 'warm' ? 'warm' : 'clean') + ' list'}</button>`;
      at = `<button type="button" class="tglr lc-btn lq-pri" onclick="wvLsSchedOpen('${s.seg}','new')"${wvLsBusy ? ' disabled' : ''}>Schedule…</button>`;
    } else if (sent) { act = '<span class="slv-muted">Done</span>'; if (s.first_sent_at) at = dt(s.first_sent_at); }   // a list that has gone: Send at = when its first message went (wv_last_info first_sent_at, 26 Oct 2026)
    else act = '<span class="slv-muted">No one left to send</span>';
    const byBr = ready > 0 && wvLsBr(s).length > 1 ? `<div class="slv-note" style="margin:2px 0 6px">Ready by branch: ${wvLsBr(s).map(b => `${lcEsc(WV_BR[b] || b)} <b>${lcNum(Number(s.by_branch[b]))}</b>`).join(' · ')}</div>` : '';
    return `<div class="wv-lcard"><div class="wv-lh"><b>${wvLsList(s.seg)}</b><span class="slv-note">${lcNum(ready)} ready, of ${lcNum(s.listed)} on the list</span></div>${byBr}
      <div class="wv-ll"><span class="slv-note">Status</span><span>${st} ${extra}</span></div>
      <div class="wv-ll"><span class="slv-note">Send at</span><span>${at}</span></div>
      <div class="wv-ll"><span class="slv-note">Last sent</span><span>${wait ? '<span class="slv-muted">in progress</span>' : dt(s.last_run_at)}</span></div>
      <div class="wv-lb">${act}</div></div>`;
  }).join('');
  const recent = (i.recent || []).map(r => `<tr><td class="ll-nw">${lcEsc(wvLsList(r.seg))}</td><td>${lcEsc(r.client)}<div class="slv-note">${lcEsc(WV_BR[r.branch] || r.branch)}</div></td><td class="ll-nw">${lcEsc(r.status)}</td><td>${lcEsc(r.error || '')}</td><td class="ll-nw">${dt(r.at)}</td></tr>`).join('');
  const tri = ssTriageHtml((i.failed || []).map(f => ({ id: f.id, cls: f.cls, error: f.error })), { retry: 'wvLsTriRetry', copy: 'wvLsTriCopy',
    checkSay: 'The message may already have gone (the connection dropped while sending). Look in respond.io, on Call Center 2, first. Retry only the ones that did not go.',
    stopSay: 'These fail the same way every time (not a contact in respond.io yet, or respond.io refused). Message her by hand from respond.io.' });
  const nothing = segs.every(s => !Number(s.ready) && !Number(s.waiting));
  const prev = (i.templates || []).map(t => `<div class="wv-msg"><div class="slv-note"><b>${lcEsc(t.key === 'warm' ? 'Warm list' : 'Clean list')}</b> · ${lcEsc(t.respond_name)} · ${t.approved ? 'approved by Meta' : '<b>not approved yet</b>'}</div><pre class="wv-pre">${lcEsc(String(t.body).replace('{{1}}', 'Name'))}</pre></div>`).join('');
  box.innerHTML = `<div class="ll-panel wv-send">
    <div class="wv-send-h"><div><b>Blast 4: send it</b> <span class="slv-note">only you see this</span></div>
      <button type="button" class="tglr lc-btn wv-sw ${on ? 'on' : 'off'}" onclick="wvLsSwitch(${on ? 'false' : 'true'})" title="The kill switch. Off: nothing is sent, even what is already queued.">Sending is ${on ? 'ON' : 'OFF'} · turn ${on ? 'off' : 'on'}</button></div>
    <p class="slv-note wv-what"><b>What is this?</b> The buttons that send Blast 4 on WhatsApp from Call Center 2 (${lcEsc(String(i.channel_label || '').replace(/^Call Center 2 /, ''))}), the shared balance. <b>Why it matters:</b> sent messages cannot be called back. <b>Next:</b> ${nothing ? 'nothing to send, both lists have gone.' : on ? 'press Send for a list, or Schedule… for Monday.' : 'turn Sending ON, then press Send for a list, or Schedule… for Monday.'}</p>
    ${approved ? '' : '<p class="ss-plan ss-bad">A template is not approved yet. Nothing can be queued until it is.</p>'}
    <div class="wv-lcards">${rows}</div>
    <div class="wv-acts" style="margin-top:8px"><button type="button" class="tglr lc-btn" onclick="wvLsTest()"${wvLsBusy || !i.test_ready ? ' disabled' : ''} title="One real WhatsApp to your own phone, the warm message, so you see it before the clients do">Send a test to my phone</button></div>
    <div id="wvLsNote" class="slv-note" style="margin-top:6px">${lcEsc(wvLsMsg)}</div>
    ${tri}
    <details class="wv-how"><summary>The messages</summary>${prev}<p class="slv-note">The clean list gets the second message: it has not heard from us about the voucher. The buttons under each message are part of the approved template. Both messages link to the voucher page, tararosesalon.com/en/ae/wellness-voucher-campaign.</p></details>
    <details class="wv-how"><summary>How sending works</summary><p class="slv-muted wv-send-p">Each client gets one message, from Call Center 2, with her first name in it. <b>Ready</b> is the list minus anyone who has bought a voucher, is on a stop list or has already been messaged; it is worked out again every time you press Send, and the sender checks each client once more just before her message goes (bought since, blocked, wrote STOP). Sends only between ${i.hour_from}:00 and ${i.hour_to}:00 Dubai${win ? '' : ' <b>(outside that window now)</b>'}. <b>Schedule…</b> picks the day and time, how many, and a pace (for example 40 every 30 minutes); it then sends itself, so you can close this page${on ? '' : ', but only while Sending is ON'}. Sent messages cannot be called back; <b>Stop</b> cancels only the ones still waiting.</p></details>
    <details class="wv-log"><summary>Recent activity (last 40)</summary>
      <div class="slv-wrap"><table class="slv-table"><thead><tr><th>List</th><th>Client</th><th>Status</th><th>Note</th><th>When</th></tr></thead>
      <tbody>${recent || '<tr><td colspan="5" class="slv-muted">Nothing has been sent from this page yet.</td></tr>'}</tbody></table></div></details></div>`;
  if (logOpen) { const d = box.querySelector('.wv-log'); if (d) d.open = true; }
  // While a list is going out, look again every 6 seconds so the numbers and the ring keep up, even if the cron is doing the sending. Waiting for its time: once in a while.
  clearTimeout(wvLsTimer);
  if (segs.some(s => Number(s.waiting) > 0) && !wvLsBusy) wvLsTimer = setTimeout(() => { if (document.getElementById('wvLsBox')) wvLsLoad(); }, segs.some(wvLsIsDue) ? 6000 : 30000);
}
async function wvLsSwitch(on) {
  if (on && !(await wvAsk({ title: 'Turn Blast 4 sending ON?', ok: 'Turn sending on', lines: [
    'Lists you send, or have scheduled, will go to <b>real clients</b> at their time.',
    'You can turn it off again at any time; that stops everything still waiting.'] }))) return;
  const { data, error } = await sb.rpc('wv_last_config_set', { p_patch: { enabled: on } });
  if (error) { wvLsSay('Could not change the switch: ' + (error.message || error)); return; }
  wvLs = data; wvLsMsg = on ? 'Sending is ON.' : 'Sending is OFF. Nothing more will go.'; await wvLsLoad();
}
async function wvLsGo(seg) {
  const s = (wvLs?.segs || []).find(x => x.seg === seg);
  if (!s) return;
  if (!wvLs.enabled) { wvLsSay('Turn sending ON first (top right of this panel).'); return; }
  if (!wvLsWin(wvLs)) { wvLsSay(`It is outside the send window (${wvLs.hour_from}:00 to ${wvLs.hour_to}:00 Dubai). Use Schedule… to pick when it goes.`); return; }
  const t = wvLsTpl(seg);
  if (!(await wvAsk({ title: `Send the ${seg === 'warm' ? 'warm' : 'clean'} list now?`, ok: `Send the ${seg === 'warm' ? 'warm' : 'clean'} list`, lines: [
    `Up to <b>${lcNum(Number(s.ready) || 0)}</b> clients get <b>${lcEsc(t ? t.respond_name : 'the message')}</b> on WhatsApp from Call Center 2, biggest spenders first.`,
    'Anyone who bought a voucher since, is on a stop list or was already messaged is left out.',
    `Sending is ${wvLs.enabled ? 'ON' : 'OFF'}; the send window is ${wvLs.hour_from}:00 to ${wvLs.hour_to}:00 Dubai.`,
    'Sent messages cannot be called back.'] }))) return;
  wvLsBusy = true; wvLsPaint(); wvLsSay(`Queueing the ${seg === 'warm' ? 'warm' : 'clean'} list…`);
  const { data, error } = await sb.rpc('wv_last_enqueue', { p_seg: seg });
  if (error) { wvLsBusy = false; wvLsSay('Could not queue it: ' + (error.message || error)); await wvLsLoad(); return; }
  wvLsSay(`Queued ${data?.queued ?? 0}. Sending…`);
  await wvLsRun();
}
// Calls the worker until nothing is due, the switch goes off or the window closes. If the page is closed first, what is left stays queued and the cron (every minute inside the window) carries on.
async function wvLsRun() {
  wvLsBusy = true;
  try {
    for (let k = 0; k < 60; k++) {
      const { data: r, error } = await sb.functions.invoke('wv-last-worker', { body: {} });
      if (error) { wvLsSay('The sender did not answer. Press Run now to try again.'); break; }
      await wvLsLoad();
      const segs = wvLs?.segs || [], due = segs.filter(wvLsIsDue).reduce((n, s) => n + (Number(s.waiting) || 0), 0), later = segs.some(wvLsIsSched);
      if (!due || !wvLs?.enabled || !wvLsWin(wvLs)) {
        wvLsSay(!due ? (later ? 'Sent what was due. The rest goes at its scheduled time.' : 'All sent.') : !wvLs?.enabled ? 'Sending is off, so the rest is waiting.' : 'The send window is closed, so the rest is waiting.');
        break;
      }
      if (!r || !r.claimed) await new Promise(res => setTimeout(res, 3000));
    }
  } catch (e) { console.error(e); wvLsSay('Something went wrong. Check the activity log, then press Run now.'); }
  wvLsBusy = false; wvLsPaint();
}
async function wvLsStop(seg) {
  if (!(await wvAsk({ title: `Stop the ${seg === 'warm' ? 'warm' : 'clean'} list?`, ok: 'Stop', lines: [
    'Everyone still waiting is cancelled.', 'Anyone already messaged has been sent and cannot be called back.'] }))) return;
  const { data, error } = await sb.rpc('wv_last_stop', { p_seg: seg });
  if (error) { wvLsSay('Could not stop it: ' + (error.message || error)); return; }
  await wvLsLoad(); wvLsSay(`Stopped: ${data?.cancelled ?? 0} cancelled.`);
}
// Bring a scheduled list forward: everyone waiting becomes due now (the window and the switch still apply).
async function wvLsBring(seg) {
  const s = (wvLs?.segs || []).find(x => x.seg === seg);
  if (!s) return;
  if (!(await wvAsk({ title: `Send the ${seg === 'warm' ? 'warm' : 'clean'} list now?`, ok: 'Send now', lines: [
    `The <b>${lcNum(Number(s.waiting) || 0)}</b> still waiting go now, instead of at their scheduled time.`,
    `Sending is ${wvLs.enabled ? 'ON' : 'OFF'}; the send window is ${wvLs.hour_from}:00 to ${wvLs.hour_to}:00 Dubai.`, 'Sent messages cannot be called back.'] }))) return;
  const { data, error } = await sb.rpc('wv_last_reschedule', { p_seg: seg, p_at: null });
  if (error) { wvLsSay('Could not change the time: ' + (error.message || error)); return; }
  await wvLsLoad();
  if (wvLs?.enabled && wvLsWin(wvLs)) { wvLsSay(`${data?.moved ?? 0} moved to now. Sending…`); await wvLsRun(); }
  else wvLsSay(`${data?.moved ?? 0} moved to now. ${wvLs?.enabled ? 'They go when the send window opens.' : 'Sending is OFF, so nothing goes until you turn it ON.'}`);
}
// One real message to the test number (Kate's phone), the warm template. Ignores the switch and the window.
async function wvLsTest() {
  if (!(await wvAsk({ title: 'Send a test to your phone?', ok: 'Send the test', lines: [
    'One real WhatsApp goes to your own phone, from Call Center 2, using the warm message with your first name.',
    'It costs about AED 0.18 and does not touch the client lists.'] }))) return;
  wvLsBusy = true; wvLsPaint(); wvLsSay('Sending the test…');
  const { data: id, error } = await sb.rpc('wv_last_test');
  if (error) { wvLsBusy = false; wvLsSay('Could not queue the test: ' + (error.message || error)); wvLsPaint(); return; }
  let res = null;
  for (let k = 0; k < 6 && !(res && ['sent', 'failed', 'skipped'].includes(res.status)); k++) {
    await sb.functions.invoke('wv-last-worker', { body: {} }).then(() => {}, () => {});
    const g = await sb.rpc('wv_last_test_get', { p_id: id }); res = g.data || res;
    if (!(res && ['sent', 'failed', 'skipped'].includes(res.status))) await new Promise(r => setTimeout(r, 2500));
  }
  wvLsBusy = false;
  wvLsSay(!res ? 'No answer yet. Look at your phone, and try again if nothing comes.' : res.status === 'sent' ? 'Test sent. Check your phone.' : `The test did not go: ${res.error || res.status}`);
  wvLsPaint();
}
// ── schedule, change time, retry (one dialog: when, how many, what pace) ────────────────────────────────────────
function wvLsSchedForm(max) {
  const i = wvLs;
  return `${i.enabled ? '' : '<p class="ss-plan ss-bad">Sending is OFF. Nothing goes until you turn it ON at the top of this panel.</p>'}
    ${ssWhenHtml('wvl', { max, maxNow: max, from: i.hour_from, to: i.hour_to, nowOk: true, onChange: r => { const b = document.getElementById('wvlGo'); if (b) b.disabled = !!r.error; } })}`;
}
function wvLsSchedOpen(seg, mode) {
  const s = (wvLs?.segs || []).find(x => x.seg === seg);
  if (!s || !wvLs) return;
  const move = mode === 'move', wait = Number(s.waiting) || 0, ready = Number(s.ready) || 0, max = move ? wait : ready;
  if (max < 1) { wvLsSay('Nobody left in this list.'); return; }
  const br = move ? [] : wvLsBr(s), split = br.length > 1;
  wvLsCtx = { seg, move, br };
  ssModalOpen(`<h3>${move ? 'Change the time of the' : 'Schedule the'} ${seg === 'warm' ? 'warm' : 'clean'} list</h3>
    <p class="slv-note">${move ? `All ${lcNum(wait)} still waiting are moved to the new time and pace.` : `Up to ${lcNum(ready)} clients can go, biggest spenders first. Each gets her message on WhatsApp from Call Center 2.`}</p>
    ${split ? `<label class="ss-opt"><input type="checkbox" id="wvlSplit" onchange="wvLsSplit()"> <b>Set each branch separately</b> <span class="slv-note">its own day, time and pace</span></label>` : ''}
    <div id="wvlAll">${wvLsSchedForm(max)}</div>
    ${split ? `<div id="wvlEach" hidden>${br.map(b => { const n = Number(s.by_branch[b]); return `<div class="lqm-br"><label class="ss-opt"><input type="checkbox" id="wvlcb_${b}" checked onchange="wvLsSplitSum()"> <b>${lcEsc(WV_BR[b] || b)}</b> <span class="slv-note">${lcNum(n)} client${n === 1 ? '' : 's'}</span></label>
      ${ssWhenHtml('wvlb_' + b, { max: n, maxNow: n, from: wvLs.hour_from, to: wvLs.hour_to, nowOk: true, onChange: wvLsSplitSum })}</div>`; }).join('')}</div>` : ''}
    <ul class="lqm-list"><li>It sends itself at that time, even with this page closed. Times outside ${wvLs.hour_from}:00 to ${wvLs.hour_to}:00 Dubai wait for the window to open.</li>
      <li>Stop cancels the ones that have not gone. A message that has gone cannot be called back.</li></ul>
    <div class="lqm-btns"><button type="button" class="tglr lc-btn" onclick="ssModalClose()">Cancel</button>
      <button type="button" class="tglr lc-btn lq-pri" id="wvlGo" onclick="wvLsSchedGo()">${move ? 'Change time' : 'Schedule'}</button></div>`);
  if (move) { const n = document.getElementById('wvlN'); if (n) n.disabled = true; const at = document.querySelector('input[name=wvlMode][value=at]'); if (at) at.checked = true; }
  ssUpdate('wvl');
}
// "Set each branch separately": the one form is swapped for a block per branch (the Lost Clients pattern), each queued with its own wv_last_enqueue(p_branch).
const wvLsSplitOn = () => { const c = document.getElementById('wvlSplit'); return !!(c && c.checked); };
function wvLsSplit() {
  const on = wvLsSplitOn(), all = document.getElementById('wvlAll'), each = document.getElementById('wvlEach');
  if (all) all.hidden = on;
  if (each) each.hidden = !on;
  if (on) ((wvLsCtx || {}).br || []).forEach(b => ssUpdate('wvlb_' + b));
  else { const go = document.getElementById('wvlGo'); if (go) go.textContent = 'Schedule'; ssUpdate('wvl'); }
  wvLsSplitSum();
}
const wvLsSplitPicks = () => ((wvLsCtx || {}).br || []).filter(b => { const c = document.getElementById('wvlcb_' + b); return c && c.checked; }).map(b => ({ b, r: ssWhenRead('wvlb_' + b) }));
function wvLsSplitSum() {
  if (!wvLsSplitOn()) return;
  const go = document.getElementById('wvlGo'), picks = wvLsSplitPicks(), bad = picks.some(x => x.r.error), n = picks.reduce((a, x) => a + (x.r.error ? 0 : x.r.count), 0);
  if (go) { go.disabled = bad || !picks.length; go.textContent = `${picks.some(x => x.r.at || x.r.every) ? 'Schedule' : 'Queue'} ${lcNum(n)}`; }
}
async function wvLsSchedGoSplit() {
  const picks = wvLsSplitPicks();
  if (!picks.length || picks.some(x => x.r.error)) { wvLsSplitSum(); return; }
  const go = document.getElementById('wvlGo');
  if (go) { go.disabled = true; go.textContent = 'Queueing…'; }
  const out = [];
  let failed = null;
  for (const p of picks) {
    const { data, error } = await sb.rpc('wv_last_enqueue', { p_seg: 'clean', p_branch: p.b, p_at: p.r.at, p_limit: p.r.limit, p_batch: p.r.batch, p_every: p.r.every });
    if (error) { console.error(error); failed = { p, error }; break; }
    out.push({ p, data });
  }
  ssModalClose();
  await wvLsLoad();
  const when = ({ p, data }) => (p.r.at || p.r.every) && data.first_at ? `first ${ssFmt(data.first_at)}${data.last_at && data.last_at !== data.first_at ? `, last ${ssFmt(data.last_at)}` : ''}` : 'now';
  let msg = out.length ? `Clean list: ${out.map(o => `${WV_BR[o.p.b] || o.p.b} ${lcNum(o.data.queued)} (${when(o)})`).join('. ')}. ${wvLs?.enabled ? 'It sends itself, you can close this page.' : 'Sending is OFF, so nothing goes until you turn it ON.'}` : '';
  if (failed) msg += `${msg ? ' ' : ''}${WV_BR[failed.p.b] || failed.p.b} did not queue: ${failed.error.message || 'try again'}.${out.length ? ' The branches before it did queue.' : ''}`;
  wvLsSay(msg);
  if (out.some(o => !o.p.r.at) && wvLs?.enabled && wvLsWin(wvLs)) wvLsRun();
}
async function wvLsSchedGo() {
  if (wvLsSplitOn() && wvLsCtx && !wvLsCtx.move && !wvLsCtx.retry) { await wvLsSchedGoSplit(); return; }
  const c = wvLsCtx, r = ssWhenRead('wvl');
  if (!c || r.error) { ssUpdate('wvl'); return; }
  const b = document.getElementById('wvlGo');
  if (b) { b.disabled = true; b.textContent = 'Working…'; }
  const pace = { p_batch: r.batch, p_every: r.every };
  const res = c.retry ? await sb.rpc('wv_last_retry', { p_ids: c.ids.slice(0, r.limit), p_at: r.at, ...pace })
    : c.move ? await sb.rpc('wv_last_reschedule', { p_seg: c.seg, p_at: r.at, ...pace })
    : await sb.rpc('wv_last_enqueue', { p_seg: c.seg, p_at: r.at, p_limit: r.limit, ...pace });
  ssModalClose();
  if (res.error) { console.error(res.error); await wvLsLoad(); wvLsSay('Did not go through: ' + (res.error.message || res.error)); return; }
  const d = res.data || {};
  await wvLsLoad();
  const n = c.move ? d.moved : d.queued, first = d.first_at || r.first, last = d.last_at || r.last;
  wvLsSay(`${c.retry ? 'Retrying' : c.seg === 'warm' ? 'Warm list:' : 'Clean list:'} ${lcNum(n ?? 0)} ${c.move ? 'moved' : 'queued'}. First ${ssFmt(first)}${last && last !== first ? `, last ${ssFmt(last)}` : ''}. ${wvLs?.enabled ? 'It sends itself, you can close this page.' : 'Sending is OFF, so nothing goes until you turn it ON.'}`);
  if (!c.move && !c.retry && !r.at && wvLs?.enabled && wvLsWin(wvLs)) wvLsRun();   // as soon as: do not wait for the next minute of the cron
}
// ── failed-send triage (send-schedule.js draws it) ──────────────────────────────────────────────────────────────
const wvLsTriRows = cls => (wvLs?.failed || []).filter(f => f.cls === cls);
function wvLsTriRetry(cls) {
  const rows = wvLsTriRows(cls);
  if (!rows.length || !wvLs) return;
  wvLsCtx = { retry: true, ids: rows.map(f => f.id) };
  ssModalOpen(`<h3>Retry ${lcNum(rows.length)} failed send${rows.length === 1 ? '' : 's'}?</h3>
    <p class="slv-note">${cls === 'check' ? 'Only do this once you have looked in respond.io and the message did not go. ' : ''}Each one is checked again just before it goes. Choose when they go and at what pace.</p>
    ${wvLsSchedForm(rows.length)}
    <div class="lqm-btns"><button type="button" class="tglr lc-btn" onclick="ssModalClose()">Cancel</button>
      <button type="button" class="tglr lc-btn lq-pri" id="wvlGo" onclick="wvLsSchedGo()">Retry</button></div>`);
  ssUpdate('wvl');
}
async function wvLsTriCopy(cls) {
  const nums = [...new Set(wvLsTriRows(cls).map(f => f.phone).filter(Boolean))];
  try { await navigator.clipboard.writeText(nums.join('\n')); wvLsSay(`Copied ${lcNum(nums.length)} numbers.`); }
  catch (e) { wvLsSay('The browser would not copy.'); }
}
