/* ============================================================
   My 1-to-1 and Goals (Kate, 7 Oct 2026). The 1-to-1 (HR-10, with the Stylist Priorities
   Checklist) and yearly Goals (HR-09). Trial: Ibrahim only (perf_staff.one2one_on).
   The two are written by different people. Goals are the stylist's own: she writes them on her link
   (private draft, autosaved), then submits; only then do Kate, Tara and Emma see them, and Emma signs
   them off or sends them back. The 1-to-1 is Coach Emma's: she fills it in and signs it, and it
   appears on the stylist's link once she has finished. No cadence (monthly, quarterly) is promised.
   Two faces of one module:
     me(el, ctx)      a stylist's own link, the fourth tab. Goals: an editable form, then Submit
                      (perf_one2one_me_save / _me_submit). 1-to-1 and checks: read-only, and she
                      acknowledges them with her signature (perf_one2one_confirm). perf_one2one_me.
     leader(el, ctx)  Staff Benchmarks, a leader key only (Kate, Tara, Emma): the 1-to-1 and the
                      13-week checks are editable by Emma (autosave, then Sign off); the goals are
                      read-only once submitted (Sign off or Ask to revise). perf_one2one_get / save /
                      sign / reopen. The viewer and payroll keys get nothing.
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
// How long the window is, in words: 13 weeks, 4 weeks, or 30 days (the leader can pick any From and To).
const spanOf = snap => {
  if (!snap || !snap.from || !snap.to) return '13 weeks';
  const n = Math.round((new Date(snap.to + 'T00:00:00') - new Date(snap.from + 'T00:00:00')) / 864e5) + 1;
  return n % 7 === 0 ? `${n / 7} week${n === 7 ? '' : 's'}` : `${n} days`;
};
const spanAdj = snap => spanOf(snap).replace(/s$/, '').replace(' ', '-');
const winLine = snap => snap && snap.from ? `${spanOf(snap)}, ${dShort(snap.from)} to ${dShort(snap.to)}` : '';

// The shared 13-week table, for a stylist's page.
function numbersRows(snap, notes) {
  return NUM_ROWS.map(([k, label]) => {
    const r = numRow(snap, k), n = notes && notes[k];
    return `<div class="row"><span>${label}</span><span class="r-val">${esc(r.a)}<span class="r-tail">${r.t ? `<small>aim ${esc(r.t)}</small>` : ''}<i class="dot ${r.st}"></i></span></span>${has(n) ? `<span class="r-note">${esc(n)}</span>` : ''}</div>`;
  }).join('');
}

// Who can read what, said plainly, with the exceptions (Kate, 7 Oct 2026).
const PRIV_NOTE = 'Private to you and your leaders. Anyone who has your personal link can open this page, so please do not share it.';
const PRIV_ME = 'These are your own words. In the dashboard only you, Emma, Tara and Kate can read them, not Accounts and not other dashboard users. Two things to know: anyone who has your personal link can open this page, so please keep it to yourself, and the people who run the system can technically reach the database. Share only what you feel comfortable sharing.';
const PRIV_LEADER = st => `Visible in the dashboard to Emma, Tara and Kate, and to ${first(st.name)} on their own link. Not visible to Accounts or to other dashboard users. Two things to know: anyone holding ${first(st.name)}'s personal link can open it, and the people who run the system can technically reach the database. Keep it to what the team needs.`;
const dayStamp = ts => ts ? new Date(ts).toLocaleDateString('en-GB', { timeZone: 'Asia/Dubai', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '';
// When it was filled in and what the figures are, so a signed copy is never read as today's numbers.
function fillLine(r, snap, meeting, draft) {
  const bits = [];
  if (has(meeting)) bits.push(`Filled in on ${dMid(meeting)}`);
  if (r && r.signed_at) bits.push(`signed by ${first(r.signed_by)} on ${dayStamp(r.signed_at)}`);
  let t = bits.length ? bits.join(', ') + '. ' : '';
  if (snap && snap.from) {
    const srcs = `Sales come from Phorest, clients and rebooking from the branch ledger${snap.client_through ? `, and client history runs to ${dShort(snap.client_through)}` : ''}.`;
    t += draft ? `Figures are live: the ${spanOf(snap)} to ${dShort(snap.to)}. ${srcs} They freeze when it is signed.`
      : `Figures are the ${spanOf(snap)} to ${dShort(snap.to)}. ${srcs} They were frozen when it was signed, so today's numbers may differ.`;
  }
  return t;
}

// ════════════════════════════════════════════════════════════
//  Signature pad: draw with a finger or mouse, or upload a picture. Optional; the result is a small
//  PNG/JPEG data URL. An inline panel, not a pop-up (in Staff Benchmarks the page is a tall frame).
// ════════════════════════════════════════════════════════════
function sigPanel(slot, o) {
  const key = 'trs-o2o-sig:' + o.saveKey;
  let saved = null; if (o.remember) { try { saved = localStorage.getItem(key); } catch (e) {} }
  let mode = 'draw', drawn = false, uploaded = null;
  slot.innerHTML = `<div class="o2o-sig"><div class="o2o-sig-t">${esc(o.title)}</div>
    <div class="o2o-pills"><button type="button" class="o2o-pill on" data-m="draw">Draw</button><button type="button" class="o2o-pill" data-m="upload">Upload a picture</button>${saved ? '<button type="button" class="o2o-pill" data-m="saved">My saved signature</button>' : ''}</div>
    <div data-pane="draw"><canvas class="o2o-pad" aria-label="Signature pad"></canvas><div class="o2o-sig-row"><span class="legend" style="margin:0">Sign with your finger or mouse.</span><button type="button" class="btn small o2o-ghost" data-clear>Clear</button></div></div>
    <div data-pane="upload" hidden><input type="file" accept="image/*" data-file><p class="legend">A photo or scan of your signature on white paper.</p><img class="o2o-sigprev" data-prev alt="" hidden></div>
    <div data-pane="saved" hidden>${saved ? `<img class="o2o-sigprev" src="${saved}" alt="Your saved signature">` : ''}</div>
    ${o.withComment ? '<label class="o2o-fl" style="margin-top:12px">Add a comment (optional)<textarea data-comment rows="3" maxlength="2000" placeholder="Anything you want to add or talk about"></textarea></label>' : ''}
    ${o.remember ? '<label class="o2o-ck"><input type="checkbox" data-remember><span>Remember my signature on this device (only on your own device)</span></label>' : ''}
    <p class="legend">No signature? The PDF then shows your name and the time instead.</p>
    <div class="o2o-btns"><button type="button" class="btn o2o-new" data-go>${esc(o.cta)}</button><button type="button" class="btn o2o-ghost" data-cancel>Cancel</button></div></div>`;
  const root = slot.firstElementChild, cv = root.querySelector('canvas'), g = cv.getContext('2d');
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const fit = () => { const w = cv.clientWidth || 300; cv.width = w * dpr; cv.height = 170 * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.lineWidth = 2.4; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#1F2937'; };
  fit();
  let down = false;
  const pt = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  cv.addEventListener('pointerdown', e => { down = true; drawn = true; try { cv.setPointerCapture(e.pointerId); } catch (err) {} const [x, y] = pt(e); g.beginPath(); g.moveTo(x, y); g.lineTo(x + 0.01, y + 0.01); g.stroke(); e.preventDefault(); });
  cv.addEventListener('pointermove', e => { if (!down) return; const [x, y] = pt(e); g.lineTo(x, y); g.stroke(); g.beginPath(); g.moveTo(x, y); e.preventDefault(); });
  const up = () => { down = false; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  root.querySelector('[data-clear]').onclick = () => { g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height); g.restore(); drawn = false; };
  root.querySelectorAll('[data-m]').forEach(b => b.onclick = () => {
    mode = b.dataset.m;
    root.querySelectorAll('[data-m]').forEach(x => x.classList.toggle('on', x === b));
    root.querySelectorAll('[data-pane]').forEach(p => { p.hidden = p.dataset.pane !== mode; });
    if (mode === 'draw' && !drawn) fit();
  });
  root.querySelector('[data-file]').onchange = e => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    const im = new Image(), fr = new FileReader();
    fr.onload = () => { im.onload = () => {
      const sc = Math.min(1, 600 / im.width, 220 / im.height), c2 = document.createElement('canvas');
      c2.width = Math.max(1, Math.round(im.width * sc)); c2.height = Math.max(1, Math.round(im.height * sc));
      const x = c2.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c2.width, c2.height); x.drawImage(im, 0, 0, c2.width, c2.height);
      uploaded = c2.toDataURL('image/jpeg', 0.85);
      const pv = root.querySelector('[data-prev]'); pv.src = uploaded; pv.hidden = false;
    }; im.src = fr.result; };
    fr.readAsDataURL(f);
  };
  // The drawing, cropped to the ink with a little margin, as a transparent PNG.
  const drawnPng = () => {
    const w = cv.width, h = cv.height, d = g.getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 0) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return null;
    const m = 6 * dpr; x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(w - 1, x1 + m); y1 = Math.min(h - 1, y1 + m);
    const c2 = document.createElement('canvas'); c2.width = x1 - x0 + 1; c2.height = y1 - y0 + 1;
    c2.getContext('2d').drawImage(cv, x0, y0, c2.width, c2.height, 0, 0, c2.width, c2.height);
    return c2.toDataURL('image/png');
  };
  root.querySelector('[data-cancel]').onclick = () => { slot.innerHTML = ''; };
  root.querySelector('[data-go]').onclick = async e => {
    const btn = e.currentTarget;
    const sig = mode === 'draw' ? (drawn ? drawnPng() : null) : mode === 'upload' ? uploaded : saved;
    const rm = root.querySelector('[data-remember]');
    if (sig && rm && rm.checked) { try { localStorage.setItem(key, sig); } catch (err) {} }
    btn.disabled = true;
    const comment = o.withComment ? root.querySelector('[data-comment]').value.trim() : null;
    try { await o.onSign(sig, comment); } catch (err) { btn.disabled = false; }
  };
  slot.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// ════════════════════════════════════════════════════════════
//  The stylist's own tab
// ════════════════════════════════════════════════════════════
const ME = { tab: 'month', sel: 0, hz: 'm6', el: null, ctx: null, wired: false, g: null };

function me(el, ctx) {
  // A goals edit still waiting for its autosave goes out before the page is rebuilt from the database.
  if (ME.g && ME.g.timer) meSave();
  ME.el = el; ME.ctx = ctx; ME.g = null;
  if (!ME.wired) { el.addEventListener('click', onMeClick); el.addEventListener('input', onMeInput); ME.wired = true; }
  drawMe();
}
const recs = kind => (ME.ctx.data.records || []).filter(r => r.kind === kind);

function meHead(r, kind, noPdf) {
  const who = first(r.signed_by) || 'your leader';
  if (r.updating) return `<p style="margin-top:10px"><span class="o2o-chip">${esc(who)} is updating this one</span></p><p class="o2o-done">You are seeing the version you last agreed. The new one appears once it is signed.</p>`;
  if (r.status === 'filed') return `<p style="margin-top:10px"><span class="o2o-chip good">Signed by you both</span> <span class="o2o-done">You signed it on ${esc(stamp(r.confirmed_at))}</span></p>${has(r.staff_comment) ? `<div class="o2o-qa"><b>Your comment</b>${br(r.staff_comment)}</div>` : ''}
    ${noPdf ? '' : `<button class="btn" type="button" data-act="pdf" data-kind="${kind}" data-i="${r._i}">Download my signed copy (PDF)</button>
    <p class="legend">Saved as it was signed. Later changes never alter it.</p>`}`;
  return `<p style="margin-top:10px"><span class="o2o-chip warn">Waiting for you</span> <span class="o2o-done">${esc(who)} signed it on ${esc(stamp(r.signed_at))}.</span></p>
    <button class="btn" type="button" data-act="confirm" data-kind="${kind}" data-period="${esc(String(r.period).slice(0, 10))}">I have read this. Sign to acknowledge</button>
    ${noPdf ? '' : `<button class="btn o2o-ghost" type="button" data-act="pdf" data-kind="${kind}" data-i="${r._i}" style="margin-left:6px">Download a copy (PDF)</button>`}
    <p class="legend">Signing shows you have read it, like your signature on the paper form. You can add your handwritten signature and a comment, and your PDF is saved at that moment.</p><div data-sigslot></div>`;
}

function meMonth() {
  const all = recs('monthly').map((r, i) => Object.assign(r, { _i: i }));
  if (!all.length) return `<div class="o2o-empty">Your first 1-to-1 will appear here once your leader has written it up and signed it. It will show what went well, your numbers, what you agreed, and the next steps.</div>`;
  const r = all[Math.min(ME.sel, all.length - 1)], c = r.content || {}, snap = r.snapshot || {};
  const cc = ckCounts(c), todo = [];
  CHECK.forEach((g, i) => g[1].forEach((t, j) => { if (!(c.check && c.check[i] && c.check[i][j])) todo.push(t); }));
  const prev = (c.prev_actions || []).filter(a => has(a.action));
  const acts = (c.actions || []).filter(a => has(a.action));
  const pri = String(c.priorities || '').split('\n').map(x => x.trim()).filter(Boolean);
  const bits = [];
  bits.push(`<section class="card hero o2o-card-new"><div class="eyebrow">1-to-1</div><h2>Your 1-to-1 with ${esc(first(r.signed_by) || 'your leader')}</h2>
    <p class="sub" style="margin-bottom:0">${esc(dMid(c.meeting_date))}${snap.from ? ' · looking back at ' + esc(winLine(snap)) : ''}</p><p class="o2o-fill">${esc(fillLine(r, snap, c.meeting_date, false))}</p><p class="o2o-fill">${esc(PRIV_NOTE)}</p>${meHead(r, 'monthly')}</section>`);
  if (has(c.wins)) bits.push(`<section class="card"><div class="eyebrow">Wins and highlights</div><p class="o2o-text">${br(c.wins)}</p></section>`);
  if (prev.length) bits.push(`<section class="card"><div class="eyebrow">Actions from last time</div><div class="rows">${prev.map(a =>
    `<div class="row"><span style="flex:1 1 200px">${esc(a.action)}</span><span class="r-val"><span class="o2o-chip ${a.status === 'Done' ? 'good' : 'warn'}">${esc(a.status || 'Ongoing')}</span></span>${has(a.progress) ? `<span class="r-note">${esc(a.progress)}</span>` : ''}</div>`).join('')}</div></section>`);
  if (snap.rows) bits.push(`<section class="card"><div class="eyebrow">Your ${spanOf(snap)}</div><p class="sub">${esc(winLine(snap))}. Worked out from your own numbers; your leader's notes sit under each line.${snap.off_days > 0 ? ` You were away ${snap.off_days} days in this window, so your aims are adjusted to match.` : ''}</p><div class="rows">${numbersRows(snap, c.notes13)}</div>
    <p class="legend">Green means at or above your aim, amber means close, red means still to reach.</p></section>`);
  if (has(c.opportunities) || has(c.social_grow) || has(c.social_help)) bits.push(`<section class="card">
    ${has(c.opportunities) ? `<div class="eyebrow">Performance notes</div><p class="o2o-text">${br(c.opportunities)}</p>` : ''}
    ${has(c.social_grow) || has(c.social_help) ? `<div class="eyebrow" style="margin-top:14px">Social media / personal brand marketing notes</div>${has(c.social_grow) ? `<p class="o2o-text">${br(c.social_grow)}</p>` : ''}${has(c.social_help) ? `<p class="o2o-text" style="margin-top:6px">${br(c.social_help)}</p>` : ''}` : ''}</section>`);
  if (acts.length || has(c.next_meeting)) bits.push(`<section class="card"><div class="eyebrow">What you agreed</div>${acts.map(a =>
    `<div class="o2o-act"><span class="k">${esc(a.owner || '')}${has(a.due) ? ' · due ' + esc(dShort(a.due) || a.due) : ''}</span>${esc(a.action)}${has(a.measure) ? `<small>Success looks like: ${esc(a.measure)}</small>` : ''}</div>`).join('')}
    ${has(c.next_meeting) ? `<p class="legend">Next 1-to-1: ${esc(dFull(c.next_meeting))}</p>` : ''}</section>`);
  bits.push(`<section class="card"><div class="eyebrow">Stylist priorities checklist</div><div style="font-size:30px;font-weight:700;margin:2px 0">${cc.y} of ${cc.t}</div>
    <p class="sub">things you are consistently showing. The rest are the next focus, not a mark against you.</p>
    <div class="o2o-sid">${CHECK.map((g, i) => `<span>0${i + 1} ${esc(g[0])}</span><b>${cc.per[i]} of ${g[1].length}</b><div class="o2o-meter"><i style="width:${cc.per[i] / g[1].length * 100}%"></i></div>`).join('')}</div>
    ${todo.length ? `<details class="o2o-more"><summary><span>What is still to work on</span><span class="hint">${todo.length} ${todo.length === 1 ? 'item' : 'items'}</span></summary><ul class="o2o-chk">${todo.map(t => `<li><i>&#9675;</i><span>${esc(t)}</span></li>`).join('')}</ul></details>` : ''}</section>`);
  if (pri.length || has(c.support)) bits.push(`<section class="card">${pri.length ? `<div class="eyebrow">Our priorities for the next ${spanOf(snap)}</div><ol class="o2o-text" style="padding-left:20px">${pri.map(p => `<li>${esc(p.replace(/^\d+[.)]\s*/, ''))}</li>`).join('')}</ol>` : ''}
    ${has(c.support) ? `<div class="eyebrow" style="margin-top:14px">Training or support that would help</div><p class="o2o-text">${br(c.support)}</p>` : ''}</section>`);
  if (all.length > 1) bits.push(`<details class="o2o-more"><summary><span>Earlier 1-to-1s</span><span class="hint">${all.length - 1}</span></summary><div class="rows">${all.map((x, i) => i === ME.sel ? '' :
    `<button class="row" type="button" data-act="sel" data-i="${i}" style="font:inherit;color:inherit;cursor:pointer;text-align:left;width:100%"><span>${esc(dMid((x.content || {}).meeting_date) || mLong(x.period))}</span><span class="r-val"><small>${esc(first(x.signed_by))}</small></span></button>`).join('')}</div></details>`);
  return bits.join('');
}

const yearStart = () => todayISO().slice(0, 4) + '-01-01';
const goalRec = () => recs('goals')[0] || null;
const gVal = p => { const v = getP(ME.g.content, p); return v == null ? '' : v; };
function gStatus(txt) { const e = ME.el && ME.el.querySelector('[data-gsave]'); if (e) e.textContent = txt; }
async function meSave() {
  const g = ME.g; if (!g) return false;
  clearTimeout(g.timer); g.timer = null;
  gStatus('Saving…');
  try {
    const r = await call('perf_one2one_me_save', { p_token: ME.ctx.token, p_period: g.per, p_content: g.content });
    if (r === 'ok') { gStatus('Saved ' + stamp(new Date())); return true; }
    gStatus(r === 'locked' ? 'These goals are already submitted.' : 'Could not save (' + r + ').');
  } catch (e) { gStatus('Could not save. Check the connection; it will try again as you type.'); }
  return false;
}
function onMeInput(e) {
  const t = e.target; if (!ME.g || !t.matches || !t.matches('[data-gp]')) return;
  setP(ME.g.content, t.dataset.gp, t.value);
  gStatus('Unsaved changes…');
  clearTimeout(ME.g.timer); ME.g.timer = setTimeout(meSave, 1500);
}

// Her own goals, while they are a draft: only she can see them. The 13-week figures beside the milestones
// are live ("Now"); they freeze when she submits.
function meGoalsEdit(r) {
  if (!ME.g) {
    const c = (r && r.content) || {};
    ME.g = { per: r ? String(r.period).slice(0, 10) : yearStart(), timer: null, content: JSON.parse(JSON.stringify({ goals: c.goals || {}, mile: c.mile || {} })) };
  }
  const d = ME.ctx.data || {}, snap = d.numbers || {}, yr = ME.g.per.slice(0, 4), bits = [];
  bits.push(`<section class="card hero o2o-card-new"><div class="eyebrow">My goals · ${esc(yr)}</div><h2>Where I am heading</h2>
    <p class="sub" style="margin-bottom:0">Your goals for this year, in your own words: what you want, why it matters, and what would help. Take your time. It saves as you type, and nobody else can read it until you submit it.</p>
    <p style="margin-top:10px"><span class="o2o-chip">Draft, only you can see this</span></p></section>`);
  bits.push(`<div class="o2o-priv"><span>&#128274;</span><span>${esc(PRIV_ME)}</span></div>`);
  bits.push(`<div class="o2o-pills">${HZ.map(([k, l]) => `<button type="button" class="o2o-pill ${ME.hz === k ? 'on' : ''}" data-act="hz" data-v="${k}">${l}</button>`).join('')}</div>`);
  bits.push(`<section class="card">${HZ.map(([h]) => `<div class="o2o-g3" data-hz="${h}"${ME.hz === h ? '' : ' hidden'}>${KINDS.map(([kk, l]) =>
    `<div class="o2o-goalcol"><h3>${l} goal</h3>${QS.map(([qk, ql]) => `<label class="o2o-fl">${ql}<textarea rows="3" data-gp="goals.${h}.${kk}.${qk}">${esc(gVal(`goals.${h}.${kk}.${qk}`))}</textarea></label>`).join('')}</div>`).join('')}</div>`).join('')}</section>`);
  bits.push(`<section class="card"><div class="eyebrow">Where I want my numbers to be</div>
    <p class="sub">"Now" is your 13-week figure today, worked out from your own numbers. Type where you would like each one to be.</p>
    <div class="o2o-wrap"><table class="o2o-tbl ed"><tr><th>Measure</th><th class="r">Now</th><th>6 months</th><th>1 year</th><th>3 years</th></tr>
    ${MILE.map(([k, l, how, w]) => `<tr><td style="padding-top:11px">${l}</td><td class="r o2o-auto">${esc(nowOf(snap, k, how, w))}</td>${['m6', 'y1', 'y3'].map(h => `<td><input data-gp="mile.${k}.${h}" value="${esc(gVal(`mile.${k}.${h}`))}"></td>`).join('')}</tr>`).join('')}</table></div></section>`);
  bits.push(`<section class="card"><div class="eyebrow">When you are ready</div>
    <p class="sub">Submitting lets Emma, Tara and Kate read your goals, and saves your 13-week numbers with them as they are today. You cannot change them after that unless Emma opens them again for you.</p>
    <div class="o2o-btns"><button class="btn o2o-new" type="button" data-act="gsubmit">Submit my goals</button><span class="o2o-save" data-gsave>${r && r.updated_at ? 'Saved ' + esc(stamp(r.updated_at)) : 'Not saved yet. It saves by itself as you type.'}</span></div><div data-sigslot></div></section>`);
  return bits.join('');
}

// Submitted (Emma has it) or signed off (filed): her answers, read-only.
function meGoalsDone(r) {
  const c = r.content || {}, snap = r.snapshot || {}, set = (c.goals || {})[ME.hz] || {}, filed = r.status === 'filed', bits = [];
  r._i = 0;
  const head = filed
    ? `<span class="o2o-chip good">Signed off by ${esc(first(r.signed_by))}</span> <span class="o2o-done">on ${esc(stamp(r.signed_at))}</span>`
    : `<span class="o2o-chip warn">Submitted</span> <span class="o2o-done">on ${esc(stamp(r.submitted_at))}. Emma, Tara and Kate can read it, and Emma signs it off.</span>`;
  bits.push(`<section class="card hero o2o-card-new"><div class="eyebrow">My goals · ${esc(String(r.period).slice(0, 4))}</div><h2>Where I am heading</h2>
    <p class="o2o-fill">${esc(fillLine(r, snap, String(r.submitted_at || '').slice(0, 10), false))}</p>
    <p style="margin-top:10px">${head}</p>
    <button class="btn o2o-ghost" type="button" data-act="pdf" data-kind="goals" data-i="0">Download a copy (PDF)</button>
    <p class="legend">Saved as it was submitted. If Emma opens it again for you to change, you submit it again.</p></section>`);
  bits.push(`<div class="o2o-priv"><span>&#128274;</span><span>${esc(PRIV_ME)}</span></div>`);
  bits.push(`<div class="o2o-pills">${HZ.map(([k, l]) => `<button type="button" class="o2o-pill ${ME.hz === k ? 'on' : ''}" data-act="hz" data-v="${k}">${l}</button>`).join('')}</div>`);
  KINDS.forEach(([k, l]) => {
    const g = set[k] || {};
    bits.push(has(g.goal)
      ? `<section class="card"><div class="eyebrow">${l} goal</div><div class="o2o-goal">${esc(g.goal)}</div>${has(g.why) ? `<div class="o2o-qa"><b>Why it matters</b>${br(g.why)}</div>` : ''}
        <details class="o2o-more"><summary><span>Everything I wrote</span></summary>${QS.slice(2).filter(q => has(g[q[0]])).map(q => `<div class="o2o-qa"><b>${q[1]}</b>${br(g[q[0]])}</div>`).join('')}</details></section>`
      : `<section class="card"><div class="eyebrow">${l} goal</div><p class="muted" style="font-size:14px">Nothing written here for this time frame.</p></section>`);
  });
  const mileHas = MILE.some(m => { const v = (c.mile || {})[m[0]] || {}; return has(v.m6) || has(v.y1) || has(v.y3); });
  if (snap.rows || mileHas) bits.push(`<section class="card"><div class="eyebrow">Where the numbers are heading</div>
    <p class="sub">"Now" is your 13-week average on the day you submitted. The milestones are the ones you wrote.</p>
    <div class="o2o-wrap"><table class="o2o-tbl"><tr><th>Measure</th><th class="r">Now</th><th class="r">6 m</th><th class="r">1 yr</th><th class="r">3 yrs</th></tr>
    ${MILE.map(([k, l, how, w]) => { const v = (c.mile || {})[k] || {}; return `<tr><td>${l}</td><td class="r"><b>${esc(nowOf(snap, k, how, w))}</b></td><td class="r">${esc(v.m6 || '·')}</td><td class="r">${esc(v.y1 || '·')}</td><td class="r">${esc(v.y3 || '·')}</td></tr>`; }).join('')}</table></div></section>`);
  const pri = (c.priorities || []).filter(a => has(a.action));
  if (pri.length) bits.push(`<section class="card"><div class="eyebrow">Our agreed priorities, next 13 weeks</div>${pri.map(a =>
    `<div class="o2o-act"><span class="k">${esc(a.led || '')} leads${has(a.due) ? ' · due ' + esc(dShort(a.due) || a.due) : ''}</span>${esc(a.action)}${has(a.support) ? `<small>Support: ${esc(a.support)}</small>` : ''}</div>`).join('')}</section>`);
  const checks = recs('check').map((x, n) => Object.assign(x, { _i: n }));
  bits.push(`<section class="card"><div class="eyebrow">13-week checks</div>${checks.length ? '<p class="sub" style="margin:0">Each check is signed on its own. The newest is first.</p>'
    : `<p class="muted" style="font-size:14px">Not due yet. At each check you look at what progress has been made, what you learned, and what to change.</p>`}</section>`);
  checks.forEach(x => bits.push(meCheck(x)));
  return bits.join('');
}
function meGoals() {
  const r = goalRec();
  return !r || r.status === 'draft' ? meGoalsEdit(r) : meGoalsDone(r);
}

function meCheck(r) {
  const c = r.content || {}, snap = r.snapshot || {}, pri = (c.priorities || []).filter(a => has(a.action));
  return `<section class="card hero o2o-card-new"><div class="eyebrow">13-week check</div><h2>${esc(mLong(r.period))}, with ${esc(first(r.signed_by) || 'your leader')}</h2>
    <p class="sub" style="margin-bottom:0">${esc(dMid(c.meeting_date))}</p><p class="o2o-fill">${esc(fillLine(r, snap, c.meeting_date, false))}</p>${meHead(r, 'check', true)}
    ${has(c.progress) ? `<div class="o2o-qa"><b>Progress and what we learned</b>${br(c.progress)}</div>` : ''}
    ${has(c.change) ? `<div class="o2o-qa"><b>What changes or comes next</b>${br(c.change)}</div>` : ''}
    ${pri.map(a => `<div class="o2o-act"><span class="k">${esc(a.led || '')} leads${has(a.due) ? ' · due ' + esc(dShort(a.due) || a.due) : ''}</span>${esc(a.action)}${has(a.support) ? `<small>Support: ${esc(a.support)}</small>` : ''}</div>`).join('')}</section>`;
}
function drawMe() {
  const sub = ME.tab === 'month' ? 'month' : 'goals';
  ME.el.innerHTML = `<div class="o2o-pills"><button type="button" class="o2o-pill ${sub === 'month' ? 'on' : ''}" data-act="tab" data-v="month">1-to-1</button><button type="button" class="o2o-pill ${sub === 'goals' ? 'on' : ''}" data-act="tab" data-v="goals">My goals</button></div>` + (sub === 'month' ? meMonth() : meGoals());
}
async function onMeClick(e) {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act;
  if (a === 'tab') { ME.tab = b.dataset.v; ME.sel = 0; drawMe(); window.scrollTo(0, 0); }
  else if (a === 'sel') { ME.sel = Number(b.dataset.i); drawMe(); window.scrollTo(0, 0); }
  else if (a === 'hz') {
    ME.hz = b.dataset.v;
    if (ME.g) { ME.el.querySelectorAll('.o2o-pill[data-act="hz"]').forEach(p => p.classList.toggle('on', p === b)); ME.el.querySelectorAll('[data-hz]').forEach(g => { g.hidden = g.dataset.hz !== ME.hz; }); }
    else drawMe();
  }
  else if (a === 'gsubmit') {
    const any = HZ.some(([h]) => KINDS.some(([k]) => has(getP(ME.g.content, `goals.${h}.${k}.goal`))));
    if (!any) { alert('Write at least one goal first. Even one line is a start.'); return; }
    b.disabled = true; const ok = await meSave(); b.disabled = false; if (!ok) return;
    const slot = b.closest('.card').querySelector('[data-sigslot]');
    sigPanel(slot, { title: 'Sign and submit my goals', cta: 'Submit my goals', saveKey: 's-' + ME.ctx.token.slice(0, 8), onSign: async sig => {
      if (!confirm('Submit your goals?\n\nEmma, Tara and Kate can read them once you do. You cannot change them unless Emma opens them again for you.')) throw new Error('cancelled');
      try {
        const res = await call('perf_one2one_me_submit', { p_token: ME.ctx.token, p_period: ME.g.per, p_sig: sig });
        if (res !== 'ok') { alert('Could not submit: ' + res); throw new Error(res); }
        ME.g = null; await ME.ctx.reload();
      } catch (err) { if (String(err && err.message) !== 'cancelled') alert('Could not submit. Check the connection and try again.'); throw err; } } });
  }
  else if (a === 'confirm') {
    const slot = b.closest('.card').querySelector('[data-sigslot]'), kind = b.dataset.kind, per = b.dataset.period;
    sigPanel(slot, { title: 'Acknowledge and sign', cta: 'Acknowledge', withComment: true, saveKey: 's-' + ME.ctx.token.slice(0, 8), onSign: async (sig, comment) => {
      try { const ok = await call('perf_one2one_confirm', { p_token: ME.ctx.token, p_kind: kind, p_period: per, p_sig: sig, p_comment: comment }); if (!ok) throw new Error('not confirmed'); await ME.ctx.reload(); }
      catch (err) { alert('Could not save. Check the connection and try again.'); throw err; } } });
  } else if (a === 'pdf') {
    const r = recs(b.dataset.kind)[Number(b.dataset.i)]; if (!r) return;
    pdf(b.dataset.kind, { content: r.content, snapshot: r.snapshot, status: r.status, submitted_at: r.submitted_at, signed_by: r.signed_by, signed_at: r.signed_at, confirmed_at: r.confirmed_at, manager_sig: r.manager_sig, staff_sig: r.staff_sig, staff_comment: r.staff_comment, period: r.period, checks: b.dataset.kind === 'goals' ? recs('check') : undefined }, ME.ctx.data.staff, b);
  }
}

// ════════════════════════════════════════════════════════════
//  The line on This month: what is waiting for her, and the next 1-to-1 with an Add to calendar file.
// ════════════════════════════════════════════════════════════
function nudge(data) {
  const recs = (data && data.records) || [], monthly = recs.filter(r => r.kind === 'monthly');
  const waiting = recs.filter(r => r.status === 'signed' && !r.updating);
  const gl = recs.find(r => r.kind === 'goals'), needGoals = !gl || gl.status === 'draft';
  const latest = monthly[0], nm = latest && latest.content && latest.content.next_meeting;
  const upcoming = nm && String(nm).slice(0, 10) >= todayISO() ? String(nm).slice(0, 10) : null;
  if (!waiting.length && !upcoming && !needGoals) return null;
  const who = first((waiting[0] || latest || {}).signed_by) || 'your leader';
  const lines = [];
  waiting.forEach(r => lines.push(`<p class="o2o-text">Your ${r.kind === 'monthly' ? '1-to-1' : r.kind === 'check' ? '13-week check' : 'goals'} with ${esc(first(r.signed_by) || 'your leader')} is ready. Read it through, then sign to acknowledge when you are ready.</p>`));
  if (needGoals) lines.push(`<p class="o2o-text">Your yearly goals are yours to write. Take your time: nobody else can read them until you submit.</p>`);
  let cal = '';
  if (upcoming) {
    const d = day(upcoming), nx = new Date(d); nx.setDate(nx.getDate() + 1);
    const ymd = x => x.toLocaleDateString('en-CA').replace(/-/g, '');
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Tara Rose Salons//1-to-1//EN', 'BEGIN:VEVENT', `UID:o2o-${upcoming}@trk-salon-os.com`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')}`, `DTSTART;VALUE=DATE:${ymd(d)}`, `DTEND;VALUE=DATE:${ymd(nx)}`,
      `SUMMARY:1-to-1 with ${who}`, 'DESCRIPTION:Your 1-to-1 at Tara Rose Salons. The time is agreed with your leader.',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:1-to-1 tomorrow', 'TRIGGER:-PT15H', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    lines.push(`<p class="o2o-text">Your next 1-to-1: <b>${esc(dFull(upcoming))}</b></p>`);
    cal = `<a class="btn small o2o-ghost" download="1-to-1 ${esc(upcoming)}.ics" href="data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}">Add to calendar</a>`;
  }
  const key = waiting.map(r => r.kind + r.period + r.status).join(',') + '|' + (upcoming || '') + '|' + (needGoals ? 'g' : '');
  const open = (waiting.length ? `<button class="btn small" type="button" onclick="PerfTabs.go('one')">Open My 1-to-1</button>` : '')
    + (needGoals ? `<button class="btn small" type="button" onclick="PerfO2O.showGoals();PerfTabs.go('one')">Write my goals</button>` : '');
  return { key, html: `<section class="card o2o-nudge" data-h="${esc(key)}"><div class="eyebrow">1-to-1</div>${lines.join('')}<div class="o2o-btns" style="margin-top:10px">${open}${cal}</div></section>` };
}

// ════════════════════════════════════════════════════════════
//  Leaders, in Staff Benchmarks
// ════════════════════════════════════════════════════════════
const L = { d: null, ctx: null, slot: null, view: 'numbers', tok: null, hz: 'm6', content: {}, timers: {}, wired: false, newChecks: [] };
const appEl = () => document.getElementById('app');
// A card's key: 'monthly', 'goals' or 'check:YYYY-MM-01' (a 13-week check of the goals, signed on its own).
const kindOf = key => key.split(':')[0];
const periodOf = key => key === 'monthly' ? L.d.month : key === 'goals' ? L.d.year : key.split(':')[1];
const viewOf = key => key === 'monthly' ? 'monthly' : 'goals';
const rec = key => key === 'monthly' ? L.d.monthly : key === 'goals' ? L.d.goals
  : ((L.d.checks || []).find(c => String(c.period).slice(0, 10) === key.split(':')[1]) || null);
// Only the editor (Coach Emma) writes and signs; Tara and Kate read (perf_admins.one2one_editor).
const ro = () => !L.d.can_edit;
const isSigned = key => !!rec(key) && rec(key).status !== 'draft';
// Goals are the stylist's to write: the leader side only reads them (and signs off or sends them back).
const locked = key => ro() || isSigned(key) || kindOf(key) === 'goals';
const checkKeys = () => {
  const have = (L.d.checks || []).map(c => 'check:' + String(c.period).slice(0, 10));
  return have.concat(L.newChecks.filter(k => !have.includes(k))).sort().reverse();
};
const allKeys = () => ['monthly', 'goals'].concat(checkKeys());

function initial(key) {
  const r = rec(key);
  if (r && r.content && Object.keys(r.content).length) return JSON.parse(JSON.stringify(r.content));
  const t = todayISO();
  if (key === 'monthly') {
    const prev = (L.d.previous && L.d.previous.content && L.d.previous.content.actions) || [];
    return { meeting_date: t, prev_actions: prev.filter(a => has(a.action)).map(a => ({ action: a.action, progress: '', status: 'Ongoing' })) };
  }
  if (key === 'goals') return { meeting_date: t, next_review: plus(t, 91) };
  return { meeting_date: t, priorities: [] };
}
const initAll = () => { L.content = {}; allKeys().forEach(k => { L.content[k] = initial(k); }); };
async function leader(slot, ctx) {
  L.slot = slot; L.ctx = ctx;
  // Another stylist, or the page redrawn: always start from the numbers unless it is the same person.
  if (L.tok !== ctx.token) { L.view = 'numbers'; L.newChecks = []; }
  L.tok = ctx.token;
  appEl().classList.remove('o2o-view');
  let d = null;
  try { d = await call('perf_one2one_get', { p_admin: ctx.admin, p_token: ctx.token, p_month: ctx.month + '-01' }); } catch (e) {}
  if (!d) { slot.innerHTML = ''; if (ctx.bar) ctx.bar.innerHTML = ''; return; }
  L.d = d; initAll();
  L.wired = false; drawLeader();
  if (ctx.bar) ctx.bar.onclick = e => { const b = e.target.closest('[data-act="view"]'); if (b) setView(b.dataset.v); };
}
async function flushAll() { await Promise.all(Object.keys(L.timers).filter(k => L.timers[k]).map(k => save(k))); }
async function reload() {
  await flushAll();
  const d = await call('perf_one2one_get', { p_admin: L.ctx.admin, p_token: L.ctx.token, p_month: L.ctx.month + '-01' });
  L.d = d;
  const have = (d.checks || []).map(c => 'check:' + String(c.period).slice(0, 10));
  L.newChecks = L.newChecks.filter(k => !have.includes(k));
  initAll(); drawLeader();
}

// Field builders: every input carries its path in the content (data-p).
const K = key => ({ key, kind: kindOf(key), c: L.content[key], lock: locked(key) });
const dis = k => k.lock ? ' disabled' : '';
const fv = (k, p) => { const v = getP(k.c, p); return v == null ? '' : v; };
const fTa = (k, p, label, rows = 2) => `<label class="o2o-fl">${label}<textarea rows="${rows}" data-p="${p}"${dis(k)}>${esc(fv(k, p))}</textarea></label>`;
const fIn = (k, p, type = 'text', ph = '') => `<input type="${type}" data-p="${p}" value="${esc(fv(k, p))}" placeholder="${esc(ph)}"${dis(k)}>`;
const fSel = (k, p, opts) => {
  const cur = fv(k, p); if (cur && !opts.includes(cur)) opts = opts.concat([cur]);
  return `<select data-p="${p}"${dis(k)}>${opts.map(o => `<option${cur === o || (!cur && o === opts[0]) ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
};
const rowsOf = (k, arr, min) => Math.max(min, (getP(k.c, arr) || []).length);
// A date as three plain choices, the month by NAME, with the whole date written out under it: nothing to
// mistake for dd/mm or mm/dd (Kate, 7 Oct 2026). The real value is a hidden ISO date.
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const rng = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
function fDate(k, p, dflt) {
  const v = String(fv(k, p) || dflt || '').slice(0, 10), parts = v ? v.split('-').map(Number) : [0, 0, 0];
  const y = parts[0], m = parts[1], d = parts[2], yr = new Date().getFullYear(), years = rng(yr - 1, yr + 3);
  if (y && !years.includes(y)) years.push(y);
  const opts = (arr, sel, f) => arr.map(x => `<option value="${x}"${x === sel ? ' selected' : ''}>${f ? f(x) : x}</option>`).join('');
  return `<span class="o2o-date" data-date><input type="hidden" data-p="${p}" value="${esc(v)}">
    <select data-dp="d" data-native aria-label="Day"${dis(k)}><option value="">Day</option>${opts(rng(1, 31), d)}</select>
    <select data-dp="m" data-native aria-label="Month"${dis(k)}><option value="">Month</option>${opts(rng(1, 12), m, x => MON[x - 1])}</select>
    <select data-dp="y" data-native aria-label="Year"${dis(k)}><option value="">Year</option>${opts(years, y)}</select>
    <b class="o2o-dread" data-dread>${v ? esc(dMid(v)) : 'Pick a day, month and year'}</b></span>`;
}
function onDate(e) {
  const s = e.target.closest && e.target.closest('select[data-dp]'); if (!s) return;
  const w = s.closest('[data-date]'), n = k => Number(w.querySelector(`[data-dp="${k}"]`).value);
  const hid = w.querySelector('input[data-p]'), rd = w.querySelector('[data-dread]');
  let d = n('d'); const m = n('m'), y = n('y');
  if (d && m && y) {
    const last = new Date(y, m, 0).getDate(); if (d > last) { d = last; w.querySelector('[data-dp="d"]').value = String(d); }
    hid.value = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; rd.textContent = dMid(hid.value);
  } else { hid.value = ''; rd.textContent = 'Pick a day, month and year'; }
  hid.dispatchEvent(new Event('input', { bubbles: true }));
}

function steps(key) {
  const r = rec(key);
  if (kindOf(key) === 'goals') {
    const g = !r || r.status === 'draft' ? 0 : r.status === 'submitted' ? 2 : 3, lb = [`${first(L.d.staff.name)} writes`, 'Submitted', `${L.d.editor || L.d.who} signs off`];
    return `<div class="o2o-steps">${lb.map((l, i) => `<span class="${i < g ? 'done' : i === g ? 'cur' : ''}"><b>${i < g ? '&#10003;' : i + 1}</b>${esc(l)}</span>`).join('')}</div>`;
  }
  const st = !r ? 0 : r.status === 'draft' ? 1 : r.status === 'signed' ? 2 : 3;
  const lb = ['Draft', `${L.d.editor || L.d.who} signs`, `${first(L.d.staff.name)} signs`, 'Filed'];
  const cls = i => i < st ? 'done' : i === st ? 'cur' : '';
  return `<div class="o2o-steps">${lb.map((l, i) => `<span class="${cls(i)}"><b>${i < st ? '&#10003;' : i + 1}</b>${esc(l)}</span>`).join('')}</div>`;
}
function chip(key) {
  const r = rec(key);
  if (kindOf(key) === 'goals') {
    if (!r) return `<span class="o2o-chip">Not started</span>`;
    return r.status === 'draft' ? `<span class="o2o-chip">Being written</span>` : r.status === 'submitted' ? `<span class="o2o-chip warn">Submitted</span>` : `<span class="o2o-chip good">Signed off</span>`;
  }
  if (!r) return `<span class="o2o-chip">Not started</span>`;
  if (r.status === 'draft') return `<span class="o2o-chip">Draft</span>`;
  if (r.status === 'signed') return `<span class="o2o-chip warn">Waiting for ${esc(first(L.d.staff.name))}</span>`;
  return `<span class="o2o-chip good">Filed</span>`;
}
function snapOf(key) { return isSigned(key) && rec(key).snapshot ? rec(key).snapshot : key === 'monthly' && L.d.numbers_m ? L.d.numbers_m : L.d.numbers; }
// When it was filled in and what the figures are, on every card, so a signed copy is never read as today's numbers.
function fillNote(key) {
  const r = rec(key), c = L.content[key] || {};
  const md = kindOf(key) === 'goals' ? String((r && r.submitted_at) || '').slice(0, 10) : c.meeting_date;
  return fillLine(r, snapOf(key), md, !isSigned(key));
}

function btns(key) {
  const r = rec(key), name = first(L.d.staff.name), kind = kindOf(key), pdfTxt = kind === 'monthly' ? 'HR-10' : 'HR-09';
  const pdfBtn = (label, cls = '') => kind === 'check' ? '' : `<button class="btn${cls}" type="button" data-act="pdf" data-kind="${key}">${label}</button>`;
  if (kind === 'goals') {
    if (r && r.status === 'submitted') return `<div class="o2o-btns">${ro() ? '' : `<button class="btn o2o-new" type="button" data-act="sign" data-kind="${key}">Sign off as ${esc(L.d.who)}</button>
      <button class="btn o2o-ghost" type="button" data-act="reopen" data-kind="${key}">Ask ${esc(name)} to revise</button>`}
      ${pdfBtn(`Preview PDF (${pdfTxt})`, ' o2o-ghost')}<span class="o2o-save">${ro() ? `View only. ${esc(L.d.editor || 'The editor')} signs these off.` : `${esc(name)} wrote these. Read them, then sign off, or send them back to be revised.`}</span></div><div data-sigslot="${key}"></div>`;
    if (r && r.status === 'filed') return `<div class="o2o-btns">${pdfBtn(`Download signed copy (PDF, ${pdfTxt})`)}
      ${ro() ? '' : `<button class="btn o2o-ghost" type="button" data-act="reopen" data-kind="${key}">Ask ${esc(name)} to revise</button>`}
      <span class="o2o-save">Submitted ${esc(stamp(r.submitted_at))}. Signed off by ${esc(r.signed_by)} on ${esc(stamp(r.signed_at))}.</span></div>`;
    return '';
  }
  if (isSigned(key)) return `<div class="o2o-btns">${pdfBtn(`Download ${r.status === 'filed' ? 'signed copy' : 'copy'} (PDF, ${pdfTxt})`)}
    ${ro() ? '' : `<button class="btn o2o-ghost" type="button" data-act="reopen" data-kind="${key}">Reopen to edit</button>`}
    <span class="o2o-save">${r.status === 'filed' ? `Filed. ${esc(name)} acknowledged and signed on ${esc(stamp(r.confirmed_at))}.${ro() ? '' : ' Reopening starts a new version and keeps this one.'}` : `Signed by ${esc(r.signed_by)} on ${esc(stamp(r.signed_at))}. ${esc(name)} signs on their own link.`}</span></div>`;
  if (ro()) return `<div class="o2o-btns">${pdfBtn(`Preview PDF (${pdfTxt})`, ' o2o-ghost')}<span class="o2o-save">View only. ${esc(L.d.editor || 'The editor')} writes and signs these.</span></div>`;
  return `<div class="o2o-btns"><button class="btn" type="button" data-act="savenow" data-kind="${key}">Save draft</button>
    <button class="btn o2o-new" type="button" data-act="sign" data-kind="${key}">Sign off as ${esc(L.d.who)}</button>
    ${pdfBtn(`Preview PDF (${pdfTxt})`, ' o2o-ghost')}
    <span class="o2o-save" data-save="${key}">${r ? 'Saved ' + esc(stamp(r.updated_at)) : 'Not saved yet. It saves by itself as you type.'}</span></div>
    <p class="o2o-who">${esc(name)} sees it on their link once you sign, not before.</p><div data-sigslot="${key}"></div>`;
}

const mgrName = key => (rec(key) && rec(key).signed_by) || L.d.editor || L.d.who;
const people = k => { const st = L.d.staff; return `<label class="o2o-fl">Team member<input value="${esc(st.name)}" disabled></label><label class="o2o-fl">Role<input value="${esc(st.role)}" disabled></label><label class="o2o-fl">Branch<input value="${esc(st.branch)}" disabled></label><label class="o2o-fl">Manager<input value="${esc(mgrName(k.key))}" disabled></label>`; };

function monthlyBody(k) {
  const snap = snapOf('monthly'), st = L.d.staff;
  const prevN = rowsOf(k, 'prev_actions', 1), actN = rowsOf(k, 'actions', 3);
  const rowsHtml = (arr, n, cells) => Array.from({ length: n }, (_, i) => `<tr>${cells(i)}</tr>`).join('');
  return `
  <div class="o2o-g3">${people(k)}<label class="o2o-fl">Meeting date${fDate(k, 'meeting_date')}</label></div>
  <div class="o2o-g3"><label class="o2o-fl">Review period, from${fDate(k, 'period_from', snap.from)}</label><label class="o2o-fl">Review period, to${fDate(k, 'period_to', snap.to)}</label></div>

  <div class="o2o-sec">01 Wins and highlights</div>
  ${fTa(k, 'wins', 'What has gone well since we last met: achievements, progress and kind words from clients or colleagues', 3)}

  <div class="o2o-sec">02 Actions from our last meeting</div>
  <div class="o2o-wrap"><table class="o2o-tbl ed"><tr><th>Previous action</th><th>Progress and outcome</th><th>Status</th></tr>
  ${rowsHtml('prev_actions', prevN, i => `<td>${fIn(k, `prev_actions.${i}.action`)}</td><td>${fIn(k, `prev_actions.${i}.progress`)}</td><td style="width:120px">${fSel(k, `prev_actions.${i}.status`, ['Ongoing', 'Done'])}</td>`)}</table></div>
  ${k.lock ? '' : `<button class="btn o2o-ghost" type="button" data-act="addrow" data-kind="monthly" data-arr="prev_actions" style="margin-top:6px">Add a row</button>`}

  <div class="o2o-sec">03 Business revenue, ${spanAdj(snap)} review</div>
  <p class="o2o-lock"><span class="o2o-autoh">Auto</span> figures come from ${esc(first(st.name))}'s numbers and the aims for their level${snap.off_days > 0 ? `, adjusted for the ${snap.off_days} days away` : ''}. Only the notes are typed.${k.lock ? '' : ' They update until you sign.'}</p>
  <div class="o2o-wrap"><table class="o2o-tbl ed"><tr><th>Metric</th><th>${spanAdj(snap)} actual</th><th>Target</th><th></th><th>Notes and trends</th></tr>
  ${NUM_ROWS.map(([key, label]) => { const r = numRow(snap, key); return `<tr><td style="padding-top:11px">${label}</td><td class="o2o-auto">${esc(r.a)}</td><td class="o2o-auto">${esc(r.t || '·')}</td><td style="padding-top:12px"><i class="dot ${r.st}"></i></td><td style="min-width:230px">${fIn(k, `notes13.${key}`)}</td></tr>`; }).join('')}</table></div>
  <div style="margin-top:12px">${fTa(k, 'opportunities', 'Performance notes', 2)}</div>

  <div class="o2o-sec">04 Social media / personal brand marketing notes</div>
  <div>${fTa(k, 'social_grow', '', 3)}</div>

  <div class="o2o-sec">05 Agreed actions</div>
  <div class="o2o-wrap"><table class="o2o-tbl ed"><tr><th>Action or next step</th><th>Owner</th><th>Due date</th><th>Success measure</th></tr>
  ${rowsHtml('actions', actN, i => `<td>${fIn(k, `actions.${i}.action`)}</td><td style="width:130px">${fSel(k, `actions.${i}.owner`, [first(st.name), L.d.editor || L.d.who, 'Reception', 'Marketing'].filter((v, j, a) => a.indexOf(v) === j))}</td><td style="width:250px">${fDate(k, `actions.${i}.due`)}</td><td>${fIn(k, `actions.${i}.measure`)}</td>`)}</table></div>
  ${k.lock ? '' : `<button class="btn o2o-ghost" type="button" data-act="addrow" data-kind="monthly" data-arr="actions" style="margin-top:6px">Add an action</button>`}
  <div class="o2o-g3" style="margin-top:12px"><label class="o2o-fl">Next meeting date${fDate(k, 'next_meeting')}</label></div>

  <div class="o2o-sec">Stylist priorities checklist <span class="o2o-save" data-ckt style="letter-spacing:0;text-transform:none;font-weight:500">${ckCounts(k.c).y} of ${ckCounts(k.c).t} ticked</span></div>
  ${CHECK.map((g, i) => `<details class="o2o-more" data-ckg="${i}"><summary><span>0${i + 1} ${esc(g[0])}</span><span class="hint" data-cks>${ckCounts(k.c).per[i]} of ${g[1].length}</span></summary>
    ${g[1].map((t, j) => `<label class="o2o-ck"><input type="checkbox" data-p="check.${i}.${j}"${getP(k.c, `check.${i}.${j}`) ? ' checked' : ''}${dis(k)}><span>${esc(t)}</span></label>`).join('')}</details>`).join('')}
  <div class="o2o-g2" style="margin-top:12px">${fTa(k, 'priorities', `Our priorities for the next ${spanOf(snap)}`, 4)}${fTa(k, 'support', 'Training or management support that would help', 4)}</div>`;
}

const priTable = (k, n) => `<div class="o2o-wrap"><table class="o2o-tbl ed"><tr><th>Action</th><th>Led by</th><th>Support needed</th><th>Due date</th></tr>
  ${Array.from({ length: n }, (_, i) => `<tr><td>${fIn(k, `priorities.${i}.action`)}</td><td style="width:130px">${fSel(k, `priorities.${i}.led`, [first(L.d.staff.name), L.d.editor || L.d.who])}</td><td>${fIn(k, `priorities.${i}.support`)}</td><td style="width:250px">${fDate(k, `priorities.${i}.due`)}</td></tr>`).join('')}</table></div>
  ${k.lock ? '' : `<button class="btn o2o-ghost" type="button" data-act="addrow" data-kind="${k.key}" data-arr="priorities" style="margin-top:6px">Add a priority</button>`}`;

function goalsBody(k) {
  const st = L.d.staff, snap = snapOf('goals');
  const legacy = (getP(k.c, 'follow') || []).filter(f => has(f.progress) || has(f.change));
  return `
  <p class="o2o-who">&#128274; ${esc(PRIV_LEADER(st))}</p>
  <div class="o2o-g3">${people(k)}</div>
  <div class="o2o-sec">Goals</div>
  <div class="o2o-pills">${HZ.map(([h, l]) => `<button type="button" class="o2o-pill ${L.hz === h ? 'on' : ''}" data-act="hz" data-v="${h}">${l}</button>`).join('')}</div>
  ${HZ.map(([h]) => `<div class="o2o-g3" data-hz="${h}"${L.hz === h ? '' : ' hidden'}>${KINDS.map(([kk, l]) => `<div class="o2o-goalcol"><h3>${l} goal</h3>${QS.map(([qk, ql]) => fTa(k, `goals.${h}.${kk}.${qk}`, ql, 2)).join('')}</div>`).join('')}</div>`).join('')}

  <div class="o2o-sec">Business performance, 13-week review</div>
  <p class="o2o-lock"><span class="o2o-autoh">Auto</span> is the 13-week figure on the day ${esc(first(st.name))} submitted. The three milestone columns are what they wrote.</p>
  <div class="o2o-wrap"><table class="o2o-tbl ed"><tr><th>Measure</th><th>Current 13-week</th><th>6 months</th><th>1 year</th><th>3 years</th></tr>
  ${MILE.map(([key, label, how, w]) => `<tr><td style="padding-top:11px">${label}</td><td class="o2o-auto">${esc(nowOf(snap, key, how, w))}</td><td>${fIn(k, `mile.${key}.m6`)}</td><td>${fIn(k, `mile.${key}.y1`)}</td><td>${fIn(k, `mile.${key}.y3`)}</td></tr>`).join('')}</table></div>

  ${(getP(k.c, 'priorities') || []).some(a => has(a.action)) ? `<div class="o2o-sec">Our agreed priorities, next 13 weeks</div>${priTable(k, rowsOf(k, 'priorities', 3))}` : ''}
  ${legacy.length ? `<div class="o2o-sec">Earlier follow-up notes</div>${legacy.map(f => `<p class="o2o-text">${has(f.date) ? `<b>${esc(dMid(f.date))}</b><br>` : ''}${br(f.progress || '')}${has(f.change) ? `<br><i>Next:</i> ${br(f.change)}` : ''}</p>`).join('')}` : ''}`;
}

function checkBody(k) {
  return `
  <div class="o2o-g3">${people(k)}<label class="o2o-fl">Check date${fDate(k, 'meeting_date')}</label></div>
  <div class="o2o-sec">13-week follow-up</div>
  <div class="o2o-g2">${fTa(k, 'progress', 'What progress has been made, and what have we learned?', 4)}${fTa(k, 'change', 'What should change or be prioritised next?', 4)}</div>
  <div class="o2o-sec">Our agreed priorities, next 13 weeks</div>
  ${priTable(k, rowsOf(k, 'priorities', 3))}`;
}

function cardHTML(key) {
  const k = K(key), kind = k.kind, name = first(L.d.staff.name);
  const title = kind === 'monthly' ? `1-to-1 with ${name}` : kind === 'goals' ? `Goals with ${name}` : `13-week check with ${name}`;
  const eyebrow = kind === 'monthly' ? `1-to-1` : kind === 'goals' ? `Yearly goals · ${day(L.d.year).getFullYear()}` : `13-week check · ${mLong(periodOf(key))}`;
  const r = rec(key);
  if (kind === 'goals' && (!r || r.status === 'draft')) {
    return `<section class="card o2o-card" data-kind="${key}" data-view="${viewOf(key)}" data-locked="1"${L.view === viewOf(key) ? '' : ' hidden'}>
      <div class="o2o-fold"><span class="o2o-ft"><div class="eyebrow">${eyebrow}</div><h2>${title}</h2></span>${chip(key)}</div>
      <div class="o2o-body">${steps(key)}<p class="o2o-who">${r ? `${esc(name)} is writing their goals. They appear here once ${esc(name)} submits them.` : `${esc(name)} has not started their goals. They write them on their own link, and they appear here once submitted.`}</p></div></section>`;
  }
  const gBanner = kind === 'goals' ? (r.status === 'filed' ? `<div class="o2o-banner">Signed off and filed. Read only.</div>` : `<div class="o2o-banner">Submitted by ${esc(name)} on ${esc(stamp(r.submitted_at))}. These are ${esc(name)}'s own words, so they are read only here.</div>`) : '';
  const banner = kind === 'goals' ? gBanner : isSigned(key) ? `<div class="o2o-banner">${r.status === 'filed' ? 'Filed and locked.' : 'Signed and locked.'}${ro() ? '' : ' Reopen it to change anything.'}</div>${has(r.staff_comment) ? `<div class="o2o-banner"><b>${esc(name)}'s comment:</b> ${br(r.staff_comment)}</div>` : ''}`
    : ro() ? `<div class="o2o-banner">View only. ${esc(L.d.editor || 'The editor')} writes and signs these.</div>` : '';
  return `<section class="card o2o-card" data-kind="${key}" data-view="${viewOf(key)}" data-locked="${locked(key) ? 1 : 0}"${L.view === viewOf(key) ? '' : ' hidden'}>
    <div class="o2o-fold"><span class="o2o-ft"><div class="eyebrow">${eyebrow}</div><h2>${title}</h2></span>${chip(key)}</div>
    <div class="o2o-body">${steps(key)}${banner}<p class="o2o-fill">${esc(fillNote(key))}</p>
    ${kind === 'monthly' ? monthlyBody(k) : kind === 'goals' ? goalsBody(k) : checkBody(k)}${btns(key)}</div></section>`;
}
function checksHTML() {
  const g = rec('goals'), ready = g && g.status !== 'draft', keys = checkKeys();
  return `<div class="o2o-checks" data-view="goals"${L.view === 'goals' ? '' : ' hidden'}><div class="o2o-sec">13-week checks</div>
    <p class="o2o-who">Each check is signed on its own, so the goals above stay exactly as they were submitted. ${ready ? '' : 'The first check comes once the goals are submitted, about 13 weeks later.'}</p>
    ${keys.map(cardHTML).join('')}
    ${ready && !ro() ? `<button class="btn" type="button" data-act="newcheck">Start a 13-week check</button>` : ''}</div>`;
}
function barHTML() {
  const worst = rs => { rs = rs.filter(Boolean); return !rs.length ? '' : rs.every(r => r.status === 'filed') ? 'good' : 'warn'; };
  const dot = v => v === 'monthly' ? worst([rec('monthly')]) : v === 'goals' ? ((!rec('goals') || rec('goals').status === 'draft') ? '' : worst([rec('goals')].concat(L.d.checks || []))) : '';
  const seg = [['numbers', 'This month'], ['monthly', '1-to-1'], ['goals', 'Goals']];
  return seg.map(([v, l]) => `<button type="button" role="tab" aria-selected="${L.view === v}" class="${L.view === v ? 'on' : ''}" data-act="view" data-v="${v}">${l}${dot(v) ? `<i class="dot ${dot(v)}"></i>` : ''}</button>`).join('');
}
function drawBar() { if (L.ctx.bar) L.ctx.bar.innerHTML = barHTML(); }
// The numbers page is #app's own cards; 1-to-1 and Goals swap them out (CSS .o2o-view hides the rest).
function applyView() {
  appEl().classList.toggle('o2o-view', L.view !== 'numbers');
  L.slot.hidden = L.view === 'numbers';
  L.slot.querySelectorAll('[data-view]').forEach(e => { e.hidden = e.dataset.view !== L.view; });
  drawBar();
}
function setView(v) { L.view = v; applyView(); window.scrollTo(0, 0); }
function drawLeader() {
  L.slot.innerHTML = cardHTML('monthly') + cardHTML('goals') + checksHTML();
  applyView();
  if (!L.wired) {
    L.slot.addEventListener('click', onLeaderClick);
    L.slot.addEventListener('input', onLeaderInput);
    L.slot.addEventListener('change', e => { onDate(e); onLeaderInput(e); });
    L.wired = true;
  }
}
function redrawCard(key) {
  const old = L.slot.querySelector(`[data-kind="${key}"]`);
  const t = document.createElement('div'); t.innerHTML = cardHTML(key);
  old.replaceWith(t.firstElementChild);
}

function gather(key, raw) {
  const card = L.slot.querySelector(`[data-kind="${key}"]`), out = {};
  card.querySelectorAll('[data-p]').forEach(el => setP(out, el.dataset.p, el.type === 'checkbox' ? el.checked : el.value));
  // Rows nobody filled in are dropped; the sheets re-pad on the next draw.
  [['prev_actions', ['action', 'progress']], ['actions', ['action', 'due', 'measure']], ['priorities', ['action', 'support', 'due']]]
    .forEach(([arr, keys]) => { if (!raw && Array.isArray(out[arr])) out[arr] = out[arr].filter(r => r && keys.some(x => has(r[x]))); });
  const was = L.content[key] || {};
  if (was.next_meeting && out.next_meeting == null) out.next_meeting = was.next_meeting;
  if (was.follow && out.follow == null) out.follow = was.follow;        // notes typed before checks became their own records
  return out;
}
function setSave(key, txt) { const e = L.slot.querySelector(`[data-save="${key}"]`); if (e) e.textContent = txt; }
async function save(key) {
  clearTimeout(L.timers[key]); L.timers[key] = null;
  if (locked(key)) return false;
  const content = gather(key); L.content[key] = content;
  setSave(key, 'Saving…');
  try {
    const r = await call('perf_one2one_save', { p_admin: L.ctx.admin, p_token: L.ctx.token, p_kind: kindOf(key), p_period: periodOf(key), p_content: content });
    if (r === 'ok') {
      let row = rec(key);
      if (!row) {
        row = { kind: kindOf(key), period: periodOf(key), status: 'draft' };
        if (key === 'monthly') L.d.monthly = row; else if (key === 'goals') L.d.goals = row; else L.d.checks = (L.d.checks || []).concat([row]);
      }
      Object.assign(row, { content, updated_at: new Date().toISOString() });
      setSave(key, 'Saved ' + stamp(new Date())); drawBar(); return true;
    }
    setSave(key, r === 'locked' ? 'This one is already signed. Reopen it to edit.' : r === 'denied' ? 'Only ' + (L.d.editor || 'the editor') + ' can save changes.' : 'Could not save (' + r + ').');
  } catch (e) { setSave(key, 'Could not save. Check the connection, it will try again as you type.'); }
  return false;
}
function onLeaderInput(e) {
  const card = e.target.closest('[data-kind]'); if (!card || card.dataset.locked === '1' || !e.target.matches('[data-p]')) return;
  const key = card.dataset.kind;
  if (e.target.type === 'checkbox') {
    const cc = ckCounts(gather(key));
    card.querySelectorAll('[data-ckg]').forEach(d => { d.querySelector('[data-cks]').textContent = `${cc.per[Number(d.dataset.ckg)]} of ${CHECK[Number(d.dataset.ckg)][1].length}`; });
    const t = card.querySelector('[data-ckt]'); if (t) t.textContent = `${cc.y} of ${cc.t} ticked`;
  }
  setSave(key, 'Unsaved changes…');
  clearTimeout(L.timers[key]); L.timers[key] = setTimeout(() => save(key), 1500);
  // A new Review period means new figures: save, then fetch them (once both dates make sense).
  if (/^period_(from|to)$/.test(e.target.dataset.p)) {
    clearTimeout(L.pTimer);
    L.pTimer = setTimeout(() => {
      const c = gather(key);
      if (c.period_from && c.period_to && c.period_from <= c.period_to) reload();
      else if (c.period_from && c.period_to) setSave(key, 'The From date has to be on or before the To date.');
    }, 400);
  }
}
async function onLeaderClick(e) {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act, key = b.dataset.kind;
  if (a === 'hz') { L.hz = b.dataset.v; const card = b.closest('.o2o-card'); card.querySelectorAll('.o2o-pill').forEach(p => p.classList.toggle('on', p === b)); card.querySelectorAll('[data-hz]').forEach(g => { g.hidden = g.dataset.hz !== L.hz; }); }
  else if (a === 'addrow') { if (locked(key)) return; L.content[key] = gather(key, true); const arr = b.dataset.arr; L.content[key][arr] = (L.content[key][arr] || []).concat([{}]); redrawCard(key); }
  else if (a === 'savenow') { await save(key); }
  else if (a === 'newcheck') {
    if (ro()) return;
    await flushAll();
    const key2 = 'check:' + todayISO().slice(0, 7) + '-01';
    if (!checkKeys().includes(key2)) { L.newChecks.push(key2); L.content[key2] = initial(key2); }
    drawLeader(); const card = L.slot.querySelector(`[data-kind="${key2}"]`); if (card) card.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  else if (a === 'sign') {
    if (ro()) return;
    b.disabled = true; const okSave = kindOf(key) === 'goals' ? true : await save(key); b.disabled = false; if (!okSave) return;
    const slot = L.slot.querySelector(`[data-sigslot="${key}"]`), name = first(L.d.staff.name);
    sigPanel(slot, { title: `Sign off as ${L.d.who}`, cta: `Sign off as ${L.d.who}`, remember: true, saveKey: 'm-' + L.d.who, onSign: async sig => {
      if (!confirm(kindOf(key) === 'goals' ? `Sign off ${name}'s goals as ${L.d.who}?\n\nThis files them. You can send them back to ${name} later; the version they submitted is kept.`
        : `Sign off as ${L.d.who}?\n\nThe numbers freeze and ${name} can see this on their own link. You can reopen it later; the signed version is kept.`)) throw new Error('cancelled');
      try { const r = await call('perf_one2one_sign', { p_admin: L.ctx.admin, p_token: L.ctx.token, p_kind: kindOf(key), p_period: periodOf(key), p_sig: sig }); if (r !== 'ok') alert('Could not sign: ' + r); await reload(); }
      catch (err) { alert('Could not sign. Check the connection and try again.'); throw err; } } });
  } else if (a === 'reopen') {
    if (ro()) return;
    if (!confirm(kindOf(key) === 'goals' ? `Send these goals back to ${first(L.d.staff.name)} to revise?\n\nThey can edit and submit them again. The version they submitted is kept.`
      : `Reopen this for editing?\n\n${first(L.d.staff.name)} keeps seeing the signed version until you sign the new one.`)) return;
    try { await call('perf_one2one_reopen', { p_admin: L.ctx.admin, p_token: L.ctx.token, p_kind: kindOf(key), p_period: periodOf(key) }); await reload(); }
    catch (err) { alert('Could not reopen. Try again.'); }
  } else if (a === 'pdf') {
    const kind = kindOf(key); if (kind === 'check') return;
    if (!locked(key)) await save(key);
    const r = rec(key) || {};
    const checks = kind === 'goals' ? (L.d.checks || []).map(c => ({ period: c.period, status: c.status, content: c.content, signed_by: c.signed_by, signed_at: c.signed_at, confirmed_at: c.confirmed_at, manager_sig: c.manager_sig, staff_sig: c.staff_sig, staff_comment: c.staff_comment })) : undefined;
    pdf(kind, { content: locked(key) ? r.content : gather(key), submitted_at: r.submitted_at, snapshot: snapOf(key), status: r.status || 'draft', signed_by: r.signed_by, signed_at: r.signed_at, confirmed_at: r.confirmed_at, manager_sig: r.manager_sig, staff_sig: r.staff_sig, staff_comment: r.staff_comment, period: periodOf(key), manager: L.d.editor || L.d.who, checks }, L.d.staff, b);
  }
}

async function pdf(kind, record, staff, btn) {
  const txt = btn && btn.textContent;
  if (btn) { btn.disabled = true; btn.textContent = 'Making the PDF…'; }
  // The PDF opens in its own window (with a Download button), not straight into Downloads. The window
  // is opened now, on the click, so the pop-up blocker allows it; the PDF follows once it is made.
  const win = window.open('', '_blank');
  if (win) win.document.write('<title>Making your PDF</title><body style="font-family:system-ui,sans-serif;background:#2D2E37;color:#FAF8F3;padding:32px">Making your PDF…</body>');
  try { await window.PerfO2OPdf.make(kind, record, staff, win); }
  catch (e) { if (win) win.close(); alert('The PDF could not be made. ' + (e && e.message || '')); }
  if (btn) { btn.disabled = false; btn.textContent = txt; }
}

window.PerfO2O = { showGoals: () => { ME.tab = 'goals'; ME.sel = 0; }, me, leader, nudge, fillLine, CHECK, QS, KINDS, HZ, NUM_ROWS, MILE, numRow, nowOf, ckCounts, dFull, dMid, dShort, mLong, stamp, first, has };
})();
