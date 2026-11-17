// Daily reports (Kate, 17 Nov 2026). The page for the cloud sync of the Phorest reports: what is saved, what needs a second look, and the buttons that sync now.
// Built from the local mockup docs/mockups/daily-reports-buttons.html (v3) in the cowork repo, laid out like Marketing Spend and with the Tara Rose learning doctrine
// (the why first, the answer in one sentence, a place to choose what to run, the steps with this day's numbers, then the board).
//
// WHERE THE NUMBERS COME FROM: the GitHub Actions runner in katealsaybar/trs-phorest-sync (github.com, private) pulls the Phorest PDFs at 9 am, 1 pm, 5 pm, 9 pm
// and 1 am Dubai and writes one "square" per report x salon x day into sync_squares (and the last good sync into sync_latest, the run itself into sync_runs).
// This page only READS those three tables (read policy for dashboard users, migrations/cloud_sync.sql) and, for the owner, presses the button:
// supabase/functions/sync-now (migrations/sync_request.sql checks the owner, the function then asks GitHub to run the sync for that row).
//
// Owner only (Level 5, pages.js). The header's Branch drives the salons; the header's Period decides the day (its last day, clamped to the last 60 days),
// and a tap on a day in the last 14 days opens that day instead. Needs from dashboard.js (shared script scope): sb, sel, dateTo, dateToIso.
const DR_CODES = ['SAA', 'KCA', 'MC', 'AQ', 'BAH'];
const DR_NAME = { SAA: 'Saadiyat', KCA: 'Khalifa City A', MC: 'Motor City', AQ: 'Al Quoz', BAH: 'Bahrain' };
const DR_SHORT = { SAA: 'Saadiyat', KCA: 'Khalifa', MC: 'Motor City', AQ: 'Al Quoz', BAH: 'Bahrain' };
const DR_ROWS = [
  { id: 'fin', name: 'Financial Totals', d: 'Banked, payment types and the cashbook.' },
  { id: 'daily', name: 'Staff Daily', d: 'Sales per stylist for the day.' },
  { id: 'sales', name: 'Sales Transactions', d: "Per-staff totals, plus the client lines behind Top Clients, Service Rankings and Client's Last Visit." },
  { id: 'util', name: 'Staff Utilisation', d: 'Booked and available hours per stylist.' },
  { id: 'track', name: 'Staff Performance Tracker', d: 'Rebooked % per stylist, the figure My Numbers shows from Phorest.' },
  { id: 'ledger', name: 'Ledger check', d: 'Has reception filled in the ledger for this day. Reads only.', ro: 1, na: ['BAH'] },
];
const DR_PIPE = ['fin', 'daily', 'sales', 'util', 'track'];
const DR_WORD = { done: 'In', run: 'Running', queued: 'Queued', dry: 'Checked', held: 'Look', failed: 'Stopped', need: 'Chase', idle: 'Not yet', na: '-' };
const DR_MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], DR_WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DR = { day: null, mode: null, sq: {}, latest: [], fin: {}, runs: [], busy: false, poll: null, pollStart: 0, err: '', seq: 0 };

const drEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const drToday = () => new Date(Date.now() + 4 * 3600e3).toISOString().slice(0, 10);   // Dubai is UTC+4 all year
const drAdd = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const drFull = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${m[3]} ${DR_MO[+m[2] - 1]} ${m[1]}` : ''; };
const drDow = iso => new Date(iso + 'T00:00:00Z').getUTCDay();
const drTime = iso => { try { return new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Asia/Dubai', hour: 'numeric', minute: '2-digit', hour12: true }).replace(' am', ' am').replace(' pm', ' pm'); } catch (e) { return ''; } };
const drWhen = iso => { try { const d = new Date(new Date(iso).getTime() + 4 * 3600e3); return `${String(d.getUTCDate()).padStart(2, '0')} ${DR_MO[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${drTime(iso)}`; } catch (e) { return ''; } };

function drHeaderDay() {
  const t = drToday(); let d = (typeof dateTo !== 'undefined' && dateTo) ? dateToIso(dateTo) : '';
  if (!d || d > t) d = drAdd(t, -1);
  if (d < drAdd(t, -60)) d = drAdd(t, -1);
  return d;
}
const drDay = () => DR.day || drHeaderDay();
function drSalons() {   // the header's Branch, read like the Reviews frame reads it: UAE Branches is the four, All is those and Bahrain
  const uae = DR_CODES.filter(b => b !== 'BAH');
  if (typeof sel === 'undefined' || !sel.branch) return uae;
  const c = sel.branch.includes('all') ? (typeof GROUP_MODE !== 'undefined' && GROUP_MODE ? DR_CODES.slice() : uae) : sel.branch.filter(b => DR_CODES.includes(b));
  return c.length ? c : uae;
}
const drExpect = day => day === drToday() ? ['fin', 'daily', 'sales'] : DR_PIPE;   // today only has the three that the daytime runs pull
const drIsNa = (r, b) => (DR_ROWS.find(x => x.id === r) || {}).na && DR_ROWS.find(x => x.id === r).na.includes(b);
function drState(r, b) { if (drIsNa(r, b)) return 'na'; const s = DR.sq[r + '|' + b]; return s ? s.state : 'idle'; }
const drWhat = r => (DR_ROWS.find(x => x.id === r) || {}).name || r;

function drToast(msg) {
  const el = document.getElementById('dailyReportsContent'); if (!el) return;
  let t = el.querySelector('.dr-toast'); if (!t) { t = document.createElement('div'); t.className = 'dr-toast'; t.setAttribute('role', 'status'); el.appendChild(t); }
  t.textContent = msg; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 4200);
}

// ── DATA ─────────────────────────────────────────────────────────────────────────────
async function drLoad() {
  const day = drDay(), since = drAdd(drToday(), -13), seq = ++DR.seq;
  try {
    const [sq, lat, runs, fin] = await Promise.all([
      sb.from('sync_squares').select('run_id,report,branch,date,state,detail,rows,updated_at').eq('date', day).order('updated_at', { ascending: false }).limit(600),
      sb.from('sync_latest').select('report,branch,date,synced_at,rows').gte('date', since).limit(1000),
      sb.from('sync_runs').select('id,trigger,requested_by,status,summary,scope,created_at,started_at,finished_at').order('id', { ascending: false }).limit(12),
      sb.from('financial_totals').select('date,branch').gte('date', since).limit(200),   // the days saved by hand before the cloud began
    ]);
    for (const r of [sq, lat, runs, fin]) if (r.error) throw r.error;
    if (seq !== DR.seq) return;
    const map = {};   // the newest square per report and salon; a practice run (dry) never hides a real one
    const live = {}, dry = {};
    (sq.data || []).forEach(s => {
      const k = s.report + '|' + s.branch;
      if (s.state === 'dry') { if (!dry[k]) dry[k] = s; } else if (!live[k]) live[k] = s;
    });
    new Set([...Object.keys(live), ...Object.keys(dry)]).forEach(k => { map[k] = live[k] || dry[k]; });
    DR.fin = {}; (fin.data || []).forEach(r => { (DR.fin[r.date] = DR.fin[r.date] || new Set()).add(r.branch); });
    DR.sq = map; DR.latest = lat.data || []; DR.runs = runs.data || []; DR.err = '';
    const fresh = DR.runs.find(r => (r.status === 'queued' || r.status === 'running') && Date.now() - new Date(r.created_at).getTime() < 25 * 60e3);
    DR.busy = !!fresh;
  } catch (e) {
    if (seq !== DR.seq) return;
    console.error(e);
    DR.err = /Not open|permission|denied/i.test(String(e && e.message)) ? 'This page is not open to your account.' : 'The sync numbers did not load. Refresh to try again.';
  }
}
function drStartPoll() {
  clearInterval(DR.poll); DR.pollStart = Date.now();
  DR.poll = setInterval(async () => {
    if (!document.getElementById('dailyReportsContent') || document.getElementById('view-dailyreports').style.display === 'none') { clearInterval(DR.poll); return; }
    await drLoad(); drPaint();
    if (!DR.busy || Date.now() - DR.pollStart > 20 * 60e3) { clearInterval(DR.poll); DR.busy = false; drPaint(); }
  }, 6000);
}

// ── THE PICTURE OF THE DAY ───────────────────────────────────────────────────────────
function drCounts() {
  const day = drDay(), sal = drSalons(), reps = drExpect(day);
  const c = { tot: 0, done: 0, look: 0, missing: 0, run: 0, held: [], failed: [], need: [], saved: 0 };
  sal.forEach(b => {
    let all = true;
    reps.forEach(r => {
      const s = drState(r, b); c.tot++;
      if (s === 'done' || s === 'dry') c.done++; else all = false;
      if (s === 'held') { c.look++; if (!c.held.includes(b)) c.held.push(b); }
      if (s === 'failed') { c.look++; if (!c.failed.includes(b)) c.failed.push(b); }
      if (s === 'idle' || s === 'failed') c.missing++;
      if (s === 'run' || s === 'queued') c.run++;
    });
    if (all) c.saved++;
    if (day !== drToday() && drState('ledger', b) === 'need' && !c.need.includes(b)) c.need.push(b);
  });
  return c;
}
function drNextRun() {
  const now = new Date(Date.now() + 4 * 3600e3), h = now.getUTCHours() + now.getUTCMinutes() / 60;
  const next = [1, 9, 13, 17, 21].find(x => x > h);
  const t = next == null ? 1 : next;
  return (t === 1 ? '1 am' : t === 9 ? '9 am' : t === 13 ? '1 pm' : t === 17 ? '5 pm' : '9 pm') + (next == null ? ', tomorrow' : '');
}
function drSyncedAt(day) {
  let m = ''; DR.latest.forEach(r => { if (r.date === day && r.synced_at > m) m = r.synced_at; });
  return m;
}
function drEffMode(c) { return DR.mode || (c.missing ? 'missing' : 'all'); }

// ── PAINT ────────────────────────────────────────────────────────────────────────────
function drPaint() {
  const el = document.getElementById('dailyReportsContent'); if (!el) return;
  const keepToast = el.querySelector('.dr-toast');   // a repaint must not throw away the message that is being read
  if (DR.err) { el.innerHTML = '<div class="dr-ask"><h4>' + drEsc(DR.err) + '</h4></div>'; return; }
  const day = drDay(), sal = drSalons(), c = drCounts(), F = drFull(day), reps = drExpect(day), m = drEffMode(c);
  const overridden = !!DR.day && DR.day !== drHeaderDay();
  // the answer
  let a;
  if (DR.busy || c.run) a = 'Working on <b>' + F + '</b>. You can leave this page, the cloud keeps going.';
  else if (c.done === 0 && (DR.fin[day] || new Set()).size >= 4) a = 'The numbers for <b>' + F + '</b> are already in, saved by hand before the cloud began. The cloud has not run for this day yet, so the squares below are empty.';
  else if (c.done === 0) a = (day === drToday() ? 'Nothing is saved for <b>today</b> yet. ' : 'Nothing is saved for <b>' + F + '</b> yet. ') + 'The next run is ' + drNextRun() + '.';
  else if (c.held.length) a = `<b>${c.saved} of ${sal.length} salons</b> are saved for ${F}. <span class="dr-bad">${drEsc(DR_NAME[c.held[0]])}</span> needs a second look, so nothing from it was saved.`;
  else if (c.failed.length) a = `<b>${c.saved} of ${sal.length} salons</b> are saved for ${F}. <span class="dr-bad">${drEsc(DR_NAME[c.failed[0]])}</span> could not finish, and the next run tries it again.`;
  else a = `<b>${c.saved === sal.length ? 'All ' + sal.length + ' salons' : c.saved + ' of ' + sal.length + ' salons'}</b> ${c.saved === sal.length ? 'are' : 'are'} saved for ${F}. ` + (c.need.length ? 'Nothing needs you, except one ledger that only reception can fill.' : 'Nothing needs you.');
  const synced = drSyncedAt(day);
  const stat = (l, v, n, cls) => `<button class="dr-stat${cls ? ' ' + cls : ''}" type="button" data-go="${l}"><div class="dr-stat-l">${l}</div><div class="dr-stat-v">${v}</div><div class="dr-stat-n">${n}</div></button>`;
  const stats = stat('Salons saved', c.saved + ' of ' + sal.length, c.held.length || c.failed.length ? drEsc(DR_NAME[(c.held.concat(c.failed))[0]]) + ' is waiting' : 'Every salon you picked', c.held.length || c.failed.length ? 'look' : '') +
    stat('Squares on the board', c.done + ' of ' + c.tot, c.look ? c.look + ' need a look' : 'Reports that are in', c.look ? 'look' : '') +
    stat('Last saved', synced ? drTime(synced) : '-', synced ? 'for ' + F : 'nothing saved yet', '') +
    stat('Next run', drNextRun(), 'Runs on its own, weekends too', '');
  const pc = c.tot ? Math.round(c.done / c.tot * 100) : 0, lc = c.tot ? Math.round(c.look / c.tot * 100) : 0;
  const pic = `<div class="dr-pic-t">The picture: how much of this day is saved.</div><div class="dr-track" role="img" aria-label="${c.done} of ${c.tot} saved"><i class="s" style="width:${pc}%"></i><i class="l" style="width:${lc}%"></i></div>` +
    `<div class="dr-pic-k"><span><i style="background:var(--ms-teal)"></i>Saved, ${c.done}</span><span><i style="background:var(--ms-coral)"></i>Needs a look, ${c.look}</span><span><i style="background:color-mix(in srgb,var(--ms-teal) 40%,transparent)"></i>The whole bar, ${c.tot} squares</span></div>`;
  // the ladder
  const rungs = [
    { k: 'missing', l: 'Only what is missing', s: 'Squares that are not In yet', w: c.tot ? c.missing / c.tot : 0, v: c.missing + ' squares', sm: 'would be saved' },
    { k: 'all', l: 'Everything for this day', s: 'Every report, every salon you picked', w: 1, v: c.tot + ' squares', sm: 'would be saved again' },
    { k: 'practice', l: 'A practice run', s: 'Does everything, saves nothing', w: 1, v: '0 saved', sm: c.tot + ' squares checked' }];
  const ladder = rungs.map(r => `<button class="dr-rung" type="button" role="radio" aria-checked="${m === r.k}" data-mode="${r.k}"><span class="dr-rung-l">${r.l}<span class="dr-rung-s">${r.s}</span></span><span class="dr-rung-bar"><i style="width:${Math.round(r.w * 100)}%"></i></span><span class="dr-rung-v">${r.v}<small>${r.sm}</small></span></button>`).join('');
  const goText = m === 'missing' ? (c.missing ? 'Run what is missing' : 'Nothing is missing') : m === 'all' ? 'Run everything' : 'Start the practice run';
  const goOff = DR.busy || (m === 'missing' && !c.missing);
  const notice = DR.busy ? 'A sync is running now. The squares below move as it goes.' : m === 'practice' ? 'Nothing will be saved. The board shows Checked instead of In.' : (m === 'missing' && !c.missing ? 'Every square is In. Pick another choice to run it again.' : (day === drToday() ? 'Today is only part of a day until the salons close.' : ''));
  // the steps
  const exp = reps.length * sal.length;
  let files = 0, stopped = 0, match = 0; const ledSal = sal.filter(b => !drIsNa('ledger', b));
  sal.forEach(b => { reps.forEach(r => { const s = drState(r, b); if (s === 'done' || s === 'dry' || s === 'held') files++; if (s === 'failed') stopped++; }); const x = drState('daily', b), y = drState('fin', b); if ((x === 'done' || x === 'dry') && (y === 'done' || y === 'dry')) match++; });
  const led = ledSal.filter(b => { const s = drState('ledger', b); return s === 'done' || s === 'dry'; }).length;
  const none = c.done === 0 && !c.look;
  const steps = [
    { t: 'Fetch', v: none ? '-' : files + ' of ' + exp, d: 'The PDFs Phorest makes for each salon, one for each report.', a: stopped > 0 },
    { t: 'Check each file', v: none ? '-' : (stopped ? stopped + ' stopped' : 'All pass'), d: 'Every file has to add up to its own total before it is kept.', a: stopped > 0 },
    { t: 'Compare two reports', v: none ? '-' : match + ' of ' + sal.length + ' match', d: "Staff Daily and Financial Totals should agree. A small usual gap is allowed.", a: c.held.length > 0 },
    { t: 'Save', v: none ? '-' : c.saved + ' of ' + sal.length + ' saved', d: 'Only what passed goes to the dashboard. A practice run saves nothing.', a: false },
    { t: 'Ledger look', v: day === drToday() || !ledSal.length ? '-' : led + ' of ' + ledSal.length + ' filled', d: 'Reception fills in the ledger. An empty one needs a person.', a: false }];
  const stepsHtml = steps.map((x, i) => `<div class="dr-step${x.a ? ' attn' : ''}"><div class="dr-step-n">Step ${i + 1}</div><div class="dr-step-t">${x.t}</div><div class="dr-step-v">${x.v}</div><div class="dr-step-d">${x.d}</div></div>`).join('');
  // what stands out
  const li = [];
  sal.forEach(b => DR_ROWS.forEach(r => { const s = DR.sq[r.id + '|' + b]; if (s && (s.state === 'held' || s.state === 'failed' || s.state === 'need')) li.push(`<b>${drEsc(DR_NAME[b])}, ${drEsc(r.name)}:</b> ${drEsc(s.detail || DR_WORD[s.state])}`); }));
  if (!li.length) li.push(none ? 'Nothing has run for this day yet.' : 'Every report matched and every salon you picked is saved.');
  const hasQ = c.held.length > 0;
  const two = `<div class="dr-two${hasQ ? '' : ' one'}"><div><ul class="dr-list">${li.slice(0, 12).map(x => '<li>' + x + '</li>').join('')}</ul></div>` + (hasQ ? `<div class="dr-ask"><h4>Questions to ask</h4><p>What do you notice about ${drEsc(DR_NAME[c.held[0]])} on ${F}? A refund or a void can sit in one report and not the other, and a late sale can land after the first download. Pulling it again re-reads Phorest.</p><button class="dr-btn sm" type="button" data-pull="${c.held[0]}"${DR.busy ? ' disabled' : ''}>Pull ${drEsc(DR_NAME[c.held[0]])} again</button></div>` : '') + '</div>';
  // the board
  const head = '<div class="dr-brow bhead"><div></div>' + DR_CODES.map(b => `<div class="dr-bh"><span>${DR_SHORT[b]}</span><button class="dr-lnk" type="button" data-col="${b}"${!sal.includes(b) || DR.busy ? ' disabled' : ''}>Run all</button></div>`).join('') + '<div></div></div>';
  const cell = (r, b) => { const s = drState(r.id, b), off = !sal.includes(b), dis = s === 'na' || off || DR.busy || r.ro; const det = (DR.sq[r.id + '|' + b] || {}).detail; return `<button class="dr-cell ${s}${off && s !== 'na' ? ' off' : ''}" type="button" data-r="${r.id}" data-b="${b}"${dis ? ' disabled' : ''} aria-label="${drEsc(r.name)}, ${drEsc(DR_NAME[b])}: ${DR_WORD[s]}"${det ? ` title="${drEsc(det)}"` : ''}><span class="cc">${b}</span><span class="dr-dot ${s}"></span><span class="w">${DR_WORD[s]}</span></button>`; };
  const rows = DR_ROWS.map(r => `<div class="dr-brow"><div class="dr-bname"><b>${r.name}${r.ro ? '<span class="dr-ro">Reads only</span>' : ''}</b><span>${r.d}</span></div>${DR_CODES.map(b => cell(r, b)).join('')}<div class="dr-bact"><button class="dr-btn sm" type="button" data-row="${r.id}"${DR.busy ? ' disabled' : ''}>Run</button></div></div>`).join('');
  const legend = '<div class="dr-legend">' + [['done', 'In'], ['run', 'Running'], ['dry', 'Checked, nothing saved'], ['held', 'Look: needs a second look'], ['failed', 'Stopped: could not finish'], ['need', 'Chase: needs a person'], ['idle', 'Not yet'], ['na', 'Not for this salon']].map(x => `<span><span class="dr-dot ${x[0]}"></span>${x[1]}</span>`).join('') + '</div>';
  // the last 14 days
  const perDate = {}; DR.latest.forEach(r => { (perDate[r.date] = perDate[r.date] || new Set()).add(r.report + '|' + r.branch); });
  let strip = '';
  for (let i = 13; i >= 0; i--) {
    const k = drAdd(drToday(), -i), w = drDow(k), n = (perDate[k] || new Set()).size, hand = (DR.fin[k] || new Set()).size, need = k === drToday() ? 15 : 25, st = (n >= need - 1 || hand >= 4) ? 'done' : (n || hand) ? 'need' : 'idle';
    strip += `<button class="dr-day${w === 0 || w === 6 ? ' wk' : ''}" type="button" data-day="${k}" aria-pressed="${k === day}" aria-label="${drFull(k)}"><span class="wd">${DR_WD[w]}</span><span class="dn">${k.slice(8)}</span><span class="dr-dot ${st}"></span></button>`;
  }
  // the log
  const who = r => r.trigger === 'schedule' ? 'The cloud, on its own' : (r.requested_by ? String(r.requested_by).split('@')[0].replace(/^./, ch => ch.toUpperCase()) + ', with the button' : 'The button');
  const dotFor = s => s === 'done' ? 'done' : s === 'needs_look' ? 'held' : s === 'failed' ? 'failed' : 'run';
  const log = DR.runs.map(r => { const sc = r.scope || {}; const d = (sc.dates || []).map(drFull).join(', '); const txt = r.summary || (r.status === 'queued' ? 'Waiting for GitHub to start.' : r.status === 'running' ? 'Running now.' : ''); return `<li><span class="when">${drWhen(r.created_at)}</span><span class="dr-dot ${dotFor(r.status)}" style="margin-top:7px"></span><span><b>${who(r)}.</b> ${sc.practice ? 'Practice run. ' : ''}${d ? 'For ' + drEsc(d) + '. ' : ''}${drEsc(txt)}</span></li>`; }).join('') || '<li>No runs yet.</li>';
  const bahOff = !sal.includes('BAH');
  const hdr = overridden ? `<p class="dr-sub">Showing <b>${F}</b>, picked from the last 14 days. <button class="dr-lnk" type="button" data-header>Use the header's date instead</button></p>` : '';
  el.innerHTML = `<div class="dr-eyebrow">Tools · Data</div><h2 class="dr-h" style="font-size:30px;margin:4px 0 8px">Daily reports</h2><p class="dr-sub">The daily Phorest numbers, fetched, checked and saved for you. In the cloud, every night, weekends too. ${hdr ? '' : 'Showing <b>' + F + '</b>, the last day of the header\'s Period.'}${bahOff ? ' Bahrain is dimmed: choose All in the header to include it.' : ''}</p>${hdr}
    <div class="dr-why"><div class="dr-why-i"><div class="dr-why-n">01</div><div class="dr-why-t">Why this page</div><div class="dr-why-b">Every page on the dashboard reads yesterday's numbers. They only appear once someone has fetched them from Phorest, checked them and saved them.</div></div>
      <div class="dr-why-i"><div class="dr-why-n">02</div><div class="dr-why-t">Why now</div><div class="dr-why-b">That used to need you at your laptop, every day, weekends included. It now runs in the cloud five times a day, and you step in only when a number needs a second look.</div></div>
      <div class="dr-why-i"><div class="dr-why-n">03</div><div class="dr-why-t">What it changes</div><div class="dr-why-b">The pages never freeze on an old day. In October, Top Clients showed "No data" because the client lines had stopped at 30 Sep.</div></div></div>
    <div class="dr-sec"><div class="dr-eyebrow">The answer</div><div class="dr-answer">${a}</div><div class="dr-stats">${stats}</div><div class="dr-pic">${pic}</div></div>
    <div class="dr-sec"><div class="dr-eyebrow">Try it</div><h3 class="dr-h">What should the cloud do?</h3><p class="dr-sub">Pick one and press the button. A practice run does everything except save, so it is safe to try.</p><div class="dr-ladder" role="radiogroup" aria-label="What should the cloud do">${ladder}</div>
      <div class="dr-run"><button class="dr-btn big" type="button" id="drGo"${goOff ? ' disabled' : ''}>${goText}</button><span class="dr-notice">${notice}</span></div></div>
    <div class="dr-sec"><div class="dr-eyebrow">How it is worked out</div><h3 class="dr-h">Five steps, with this day's numbers</h3><div class="dr-steps">${stepsHtml}</div></div>
    <div class="dr-sec"><div class="dr-eyebrow">What stands out</div><h3 class="dr-h">In plain words</h3>${two}</div>
    <div class="dr-sec"><div class="dr-eyebrow">Report by report</div><h3 class="dr-h">The board</h3><p class="dr-sub">Reports down the side, salons across the top. Press a square to run that one report for that one salon, or Run at the end of a row for the whole report.</p><div class="dr-board">${head}${rows}${legend}</div></div>
    <div class="dr-sec"><div class="dr-eyebrow">Day by day</div><h3 class="dr-h">The last 14 days</h3><p class="dr-sub">Tap a day to open it. A day with a missing square is filled in by the next run.</p><div class="dr-strip">${strip}</div><div class="dr-stripnote">Shaded days are weekends. The runs happen on those days too. A filled dot before 17 Nov means the numbers were saved by hand.</div></div>
    <div class="dr-sec"><div class="dr-eyebrow">What happened</div><h3 class="dr-h">What the cloud did</h3><ul class="dr-log">${log}</ul></div>
    <details class="dr-more"><summary>It runs without you</summary><div class="dr-more-b"><p>The cloud runs at <b>9 am, 1 pm, 5 pm, 9 pm and 1 am</b> Dubai time, every day. The 9 am run also fills in yesterday and checks yesterday's ledger, and the 1 am run saves the day that just closed as its final version. Each run replaces the older copy of the same day.</p><p>The Phorest sign-in lives in the database and renews itself on every run, so it only runs out if no run happens for a whole month. A day where Staff Daily and Financial Totals do not agree by more than the usual gap is held: nothing from that salon is saved for the day, and the older numbers stay until it is looked at.</p><p>The sync can be paused from GitHub (the schedule block in the sync workflow), and its permission to write can be switched off in one line in Supabase. Fratelli is closed and never listed. The ledger of Bahrain is still filled in by hand.</p></div></details>`;
  if (keepToast) el.appendChild(keepToast);
  drWire(el, { day, sal, c, m });
}

// ── BUTTONS ──────────────────────────────────────────────────────────────────────────
function drWire(el, ctx) {
  const { day, sal, c, m } = ctx, q = (s, f) => [].forEach.call(el.querySelectorAll(s), f);
  q('[data-mode]', b => { b.onclick = () => { if (DR.busy) return; DR.mode = b.getAttribute('data-mode'); drPaint(); }; });
  q('[data-day]', b => { b.onclick = async () => { DR.day = b.getAttribute('data-day'); DR.mode = null; await drLoad(); drPaint(); }; });
  q('[data-header]', b => { b.onclick = async () => { DR.day = null; DR.mode = null; await drLoad(); drPaint(); }; });
  q('.dr-stat', b => { b.onclick = () => { const g = b.getAttribute('data-go'); const t = el.querySelector(g === 'Next run' || g === 'Last saved' ? '.dr-log' : g === 'Squares on the board' ? '.dr-board' : '.dr-two'); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'center' }); }; });
  const base = extra => Object.assign({ dates: [day], practice: false }, extra);
  const all = sal.length === DR_CODES.length;
  const go = el.querySelector('#drGo');
  if (go) go.onclick = () => {
    if (m === 'missing') {
      const miss = []; sal.forEach(b => drExpect(day).forEach(r => { const s = drState(r, b); if (s === 'idle' || s === 'failed') miss.push([r, b]); }));
      drRun(base({ reports: [...new Set(miss.map(x => x[0]))], branches: [...new Set(miss.map(x => x[1]))], ledger: day < drToday() ? day : undefined }), 'what was missing');
    } else drRun(base({ branches: all ? undefined : sal, ledger: day < drToday() ? day : undefined, practice: m === 'practice' }), m === 'practice' ? 'a practice run' : 'everything');
  };
  q('.dr-cell', b => { b.onclick = () => { const r = b.getAttribute('data-r'), br = b.getAttribute('data-b'); drRun(base({ reports: [r], branches: [br], practice: DR.mode === 'practice' }), drWhat(r) + ', ' + DR_NAME[br]); }; });
  q('[data-row]', b => { b.onclick = () => { const r = b.getAttribute('data-row'); drRun(r === 'ledger' ? { dates: [], ledger: day, practice: false } : base({ reports: [r], branches: all ? undefined : sal, practice: DR.mode === 'practice' }), drWhat(r)); }; });
  q('[data-col]', b => { b.onclick = () => drRun(base({ branches: [b.getAttribute('data-col')], practice: DR.mode === 'practice' }), DR_NAME[b.getAttribute('data-col')]); });
  q('[data-pull]', b => { b.onclick = () => drRun(base({ reports: ['fin', 'daily'], branches: [b.getAttribute('data-pull')] }), 'a fresh pull'); });
}
async function drRun(scope, what) {
  if (DR.busy) return;
  Object.keys(scope).forEach(k => scope[k] === undefined && delete scope[k]);
  drToast('Starting ' + what + '…');
  try {
    const { data, error } = await sb.functions.invoke('sync-now', { body: { scope } });
    if (error) { let msg = error.message || 'It did not start.'; try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch (e) {} throw new Error(msg); }
    if (data && data.error) throw new Error(data.error);
    DR.busy = true; DR.mode = null;
    drToast('Started. It takes about 3 minutes, and you can leave this page.');
    await drLoad(); drPaint(); drStartPoll();
  } catch (e) {
    drToast(String((e && e.message) || e).slice(0, 160));
    await drLoad(); drPaint();
  }
}

try { NOPULSE_REDRAW.dailyreports = 'renderDailyReports'; } catch (e) {}   // the header's Branch or Period changed: redraw this page alone (registered here so dashboard.js is untouched)
// Kate, 17 Nov 2026: every page gets the mini side nav ("On this page", jump-nav.js). Each .dr-sec starts with its eyebrow, which names the section.
try { if (typeof jnAdd === 'function' && !window._drJn) { window._drJn = 1; jnAdd('dailyreports', { sel: '#dailyReportsContent .dr-sec > .dr-eyebrow', full: true }); } } catch (e) {}
async function renderDailyReports() {
  const el = document.getElementById('dailyReportsContent'); if (!el) return;
  try { if (window.trsWindowReady) await window.trsWindowReady; } catch (e) {}
  const hd = drHeaderDay(); if (DR.lastHeader && DR.lastHeader !== hd) { DR.day = null; DR.mode = null; } DR.lastHeader = hd;   // a new date in the header replaces a day picked from the strip
  clearInterval(DR.poll);
  el.innerHTML = '<p class="dr-sub">Reading the sync…</p>';
  await drLoad(); drPaint();
  if (DR.busy) drStartPoll();
}
