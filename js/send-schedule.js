// Scheduled sends, shared by every campaign sender (Kate, 16 Oct 2026). migrations/send_schedule.sql and send_schedule_pace_triage.sql explain the
// pattern: a queued job carries the time it may go out, the claim honours it, a cron drives the worker. This file is the page half, so the next
// campaign gets the same "When" form and the same retry triage by calling these:
//   ssWhenHtml(p, ctx)  the form: now or a set time, how many, "B at a time every M minutes", and a live plan line. ctx = {max, maxNow, from, to, nowOk, onChange}
//   ssWhenRead(p)       what she chose: {at, batch, every, limit, first, last, count} or {error}. at is an ISO time or null (as soon as the window allows).
//   ssTriageHtml(rows, h) the failed-send triage (retry / check first / will fail again). rows = [{id, cls, error}], h = handler names on the page.
//   ssModalOpen(html) / ssModalClose()
// All times are Dubai time (no daylight saving, so +04:00 is always right), whatever the laptop's clock says.
const SS_OFF = '+04:00', SS_DAY = 24 * 3600 * 1000;
const SS_CTX = {};
const ssDubaiParts = d => {
  const p = {};
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(d).forEach(x => { p[x.type] = x.value; });
  return p;
};
const ssLocalStr = d => { const p = ssDubaiParts(d); return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`; };
const ssDayKey = d => { const p = ssDubaiParts(new Date(d)); return `${p.year}-${p.month}-${p.day}`; };
function ssSuggest(from) {
  const p = ssDubaiParts(new Date(Date.now() + SS_DAY));
  return `${p.year}-${p.month}-${p.day}T${String(from == null ? 10 : from).padStart(2, '0')}:00`;
}
function ssPick(id, value, onchange) {
  return `<input type="datetime-local" class="ll-sel ss-at" id="${id}" min="${ssLocalStr(new Date())}" value="${value || ''}" step="900" aria-label="Send at (Dubai time)"${onchange ? ` onchange="${onchange}"` : ''}>`;
}
function ssRead(id) {
  const el = document.getElementById(id), v = el && el.value;
  if (!v) return '';
  const d = new Date(v + ':00' + SS_OFF);
  return isNaN(d) ? '' : d.toISOString();
}
function ssFmt(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
// A time inside the send window stays; before it opens it moves to when it opens that day, after it closes to when it opens the next day.
// (The database does the same in send_slot_norm, so this is only for the preview.)
function ssNorm(iso, from, to) {
  const d = new Date(iso), p = ssDubaiParts(d), h = Number(p.hour);
  if (h >= from && h < to) return d.toISOString();
  const day = new Date(new Date(`${p.year}-${p.month}-${p.day}T00:00:00${SS_OFF}`).getTime() + (h >= to ? SS_DAY : 0)), q = ssDubaiParts(day);
  return new Date(`${q.year}-${q.month}-${q.day}T${String(from).padStart(2, '0')}:00:00${SS_OFF}`).toISOString();
}
// When the first and last message go, for `count` messages, `batch` at a time every `every` minutes (both null = all together).
function ssPlan(startIso, count, batch, every, from, to) {
  let t = ssNorm(startIso || new Date().toISOString(), from, to);
  const first = t, batches = every ? Math.ceil(count / batch) : 1;
  for (let k = 1; k < batches; k++) t = ssNorm(new Date(new Date(t).getTime() + every * 60000).toISOString(), from, to);
  return { first, last: t, batches };
}

// ── the When form ────────────────────────────────────────────────────────────────────────────────────────
function ssWhenHtml(p, ctx) {
  SS_CTX[p] = ctx;
  const nowOk = ctx.nowOk !== false, max = Math.max(1, ctx.max || 1);
  return `<div class="ss-when">
    <label class="ss-opt"><input type="radio" name="${p}Mode" value="now"${nowOk ? ' checked' : ' disabled'} onchange="ssUpdate('${p}')"> As soon as the send window allows${nowOk ? '' : ' <span class="slv-note">(today\'s limit is used)</span>'}</label>
    <label class="ss-opt"><input type="radio" name="${p}Mode" value="at"${nowOk ? '' : ' checked'} onchange="ssUpdate('${p}')"> At a set time ${ssPick(p + 'At', ssSuggest(ctx.from), `document.querySelector('input[name=${p}Mode][value=at]').checked=true;ssUpdate('${p}')`)} <span class="slv-note">Dubai time</span></label>
    <div class="ss-row">
      <label>How many <input type="number" class="ll-sel ss-num" id="${p}N" min="1" max="${max}" value="${max}" oninput="ssUpdate('${p}')"> <span class="slv-note" id="${p}Max">of ${max}</span></label>
      <label>Send <input type="number" class="ll-sel ss-num" id="${p}B" min="1" max="500" placeholder="all" oninput="ssUpdate('${p}')"> at a time</label>
      <label>every <input type="number" class="ll-sel ss-num" id="${p}E" min="1" max="720" placeholder="min" oninput="ssUpdate('${p}')"> minutes</label>
    </div>
    <div class="slv-note ss-plan" id="${p}Plan"></div></div>`;
}
const ssNum = id => { const el = document.getElementById(id), v = el && el.value.trim(); return v === '' || v == null ? null : Number(v); };
function ssWhenRead(p) {
  const c = SS_CTX[p];
  if (!c) return { error: 'The form is not ready.' };
  const mode = (document.querySelector(`input[name=${p}Mode]:checked`) || {}).value || 'now';
  let at = null;
  if (mode === 'at') {
    at = ssRead(p + 'At');
    if (!at) return { error: 'Pick a date and time.' };
    if (new Date(at).getTime() < Date.now() - 60000) return { error: 'That time has passed. Pick a later one.' };
  }
  const sameDay = !at || ssDayKey(at) === ssDayKey(Date.now());
  const cap = sameDay ? (c.maxNow != null ? c.maxNow : c.max) : c.max;
  const n = ssNum(p + 'N'), b = ssNum(p + 'B'), e = ssNum(p + 'E');
  if (n == null || !Number.isInteger(n) || n < 1) return { error: 'How many must be at least 1.' };
  if (n > cap) return { error: `Only ${cap} can go ${sameDay ? 'today' : 'that day'}.`, cap };
  if ((b == null) !== (e == null)) return { error: 'Fill in both "at a time" and "every" minutes, or leave both empty to send them together.' };
  if (b != null && (!Number.isInteger(b) || b < 1 || b > 500 || !Number.isInteger(e) || e < 1 || e > 720)) return { error: 'At a time: 1 to 500. Every: 1 to 720 minutes.' };
  const plan = ssPlan(at, n, b, e, c.from, c.to);
  return { at, batch: b, every: e, limit: n, count: n, first: plan.first, last: plan.last, batches: plan.batches, moved: !!at && ssNorm(at, c.from, c.to) !== new Date(at).toISOString() };
}
function ssUpdate(p) {
  const c = SS_CTX[p], out = document.getElementById(p + 'Plan');
  if (!c || !out) return;
  const r = ssWhenRead(p);
  const mx = document.getElementById(p + 'Max'), nEl = document.getElementById(p + 'N');
  if (r.cap != null && mx) mx.textContent = `of ${r.cap} (limit)`;
  out.classList.toggle('ss-bad', !!r.error);
  if (r.error) out.textContent = r.error;
  else {
    out.textContent = `${r.count} message${r.count === 1 ? '' : 's'}${r.every ? ` in ${r.batches} batch${r.batches === 1 ? '' : 'es'} of ${r.batch}, one every ${r.every} min` : ' together'}. First ${ssFmt(r.first)}${r.batches > 1 ? `, last ${ssFmt(r.last)}` : ''}.`
      + (r.moved ? ` ${ssFmt(r.at)} is outside the send window (${c.from}:00 to ${c.to}:00), so it starts when the window opens.` : '')
      + (r.every && new Date(r.last).getTime() - new Date(r.first).getTime() > 0 && ssDayKey(r.last) !== ssDayKey(r.first) ? ' It carries on the next day when the window closes.' : '');
  }
  if (typeof c.onChange === 'function') c.onChange(r);
}

// ── the failed-send triage ────────────────────────────────────────────────────────────────────────────────
// rows: [{id, cls: 'retry'|'check'|'stop', error}]. h: names of page functions: h.retry(cls), h.copy(cls) and, when the page can, h.mark(cls) / h.open(cls).
const ssReason = e => String(e || 'No reason recorded').replace(/\d{5,}/g, '…').replace(/\s+/g, ' ').slice(0, 90);
function ssTriageHtml(rows, h) {
  if (!rows.length) return '';
  const by = { retry: [], check: [], stop: [] };
  rows.forEach(r => (by[r.cls] || by.check).push(r));
  const why = list => {
    const m = {};
    list.forEach(r => { const k = ssReason(r.error); m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `<li>${lcEsc(k)} <b>×${v}</b></li>`).join('');
  };
  const card = (cls, title, say, btns) => by[cls].length ? `<div class="ss-tri-card ss-${cls}"><div class="ss-tri-h"><b>${title}</b> <span class="ll-pill ll-num">${lcNum(by[cls].length)}</span></div>
      <p class="slv-note">${say}</p><ul class="ss-why">${why(by[cls])}</ul><div class="ss-btns">${btns}</div></div>` : '';
  const btn = (fn, cls, label, pri) => fn ? `<button type="button" class="tglr lc-btn${pri ? ' lq-pri' : ''}" onclick="${fn}('${cls}')">${label}</button>` : '';
  return `<div class="ss-tri"><div class="ss-tri-top"><b>Failed sends</b> <span class="slv-note">${lcNum(rows.length)} to sort out. Nothing here goes again until you choose.</span></div>
    <div class="ss-tri-grid">
      ${card('retry', 'Safe to retry', 'Nothing went out: a lookup or rate limit failed, or it gave up after three tries. Queueing them again cannot message anyone twice.', btn(h.retry, 'retry', `Retry ${lcNum(by.retry.length)}…`, true) + btn(h.copy, 'retry', 'Copy numbers'))}
      ${card('check', h.checkTitle || 'Check first', h.checkSay || 'The message may already have gone. Look in the inbox first. Retry only the ones that did not go.', btn(h.mark, 'check', 'I sent these, mark sent') + btn(h.retry, 'check', `I checked, none went: retry ${lcNum(by.check.length)}…`) + btn(h.copy, 'check', 'Copy numbers'))}
      ${card('stop', 'Will fail again', h.stopSay || 'These fail the same way every time (no contact, a bad number, or the other side refused). Fix the cause, or message them by hand.', btn(h.open, 'stop', 'Open the first in WhatsApp') + btn(h.mark, 'stop', 'I messaged these by hand, mark sent') + btn(h.copy, 'stop', 'Copy numbers'))}
    </div></div>`;
}

// ── modal ─────────────────────────────────────────────────────────────────────────────────────────────────
function ssModalOpen(html) {
  ssModalClose();
  const d = document.createElement('div');
  d.className = 'lqm-back'; d.id = 'ssModal';
  d.innerHTML = `<div class="lqm slv-card ss-modal" role="dialog" aria-modal="true">${html}</div>`;
  d.addEventListener('click', e => { if (e.target === d) ssModalClose(); });
  document.body.appendChild(d);
  document.addEventListener('keydown', ssModalKey);
}
function ssModalKey(e) { if (e.key === 'Escape') ssModalClose(); }
function ssModalClose() { const d = document.getElementById('ssModal'); if (d) d.remove(); document.removeEventListener('keydown', ssModalKey); }
