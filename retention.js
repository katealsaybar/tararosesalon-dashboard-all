// Retention (Kate, 3 Nov 2026): of the clients who came in during the Period, how many came back in the 2 months after.
// Built from the local mockup docs/mockups/retention.html in the cowork repo. Everything is read through two functions
// (migrations/retention_report.sql):
//   retention_report        one row per salon and one per stylist, for the header's Branch and Period
//   drill_retention_clients the clients behind any number on the page (each figure opens them through TRSD, drill.js)
// Same client rules as clients through the door and handled per staff: one client once a day, a paid sale, real spend, no walk-ins,
// no staff bookings, no BUSINESS TRS; kept by Phorest client id and counted per salon (a client who moves salon is not back at the first).
// Kate's rulings applied here: the header's Branch and Period drive the page (no filter bar of its own), every figure opens its
// clients, the stylist list shows Hair and Beauty (tag + filter), a toggle for resigned staff, both return measures at once
// (back to the salon, back to the same stylist or beautician), the staff cutout photo at its own shape (never a circle),
// 10px side margins on a phone.
// Needs from dashboard.js (shared script scope): sb, sel, dateFrom, dateTo, dateToIso, BH_BRANCHES, UAE_ACTIVE, BRANCH_INFO, TRS_LEVEL,
// STAFF_PROFILES (staff-profiles.js), TRSD (drill.js) and PD (pulse-drill.js, for the client's own window).
const RET_STORE = 'trs-retention';
const RET = { team: 'A', res: 0, rank: 'any', order: 'low', all: false };
try {
  const s = JSON.parse(localStorage.getItem(RET_STORE) || '{}');
  if (['A', 'H', 'B'].includes(s.team)) RET.team = s.team;
  if (s.res === 1) RET.res = 1;
  if (s.rank === 'same') RET.rank = 'same';
  if (s.order === 'high') RET.order = 'high';
} catch (e) {}
const retSave = () => { try { localStorage.setItem(RET_STORE, JSON.stringify({ team: RET.team, res: RET.res, rank: RET.rank, order: RET.order })); } catch (e) {} };
const RET_MIN_CLIENTS = 20;   // stylists with fewer clients in the Period are left out of the list
let retData = null, retSeq = 0, retRows = [];
const retCache = {};
const retMon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const retDay = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${+m[3]} ${retMon[+m[2] - 1]} ${m[1]}` : ''; };
const retDayS = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${+m[3]} ${retMon[+m[2] - 1]}` : ''; };
const retN = v => Math.round(+v || 0).toLocaleString('en-GB');
const retP = (a, b) => b ? Math.round(1000 * a / b) / 10 : 0;
const retEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const retName = c => (typeof BRANCH_INFO !== 'undefined' && BRANCH_INFO[c] && BRANCH_INFO[c].name) || c;

// ── THE WINDOW (the header's Branch and Period) ──────────────────────────────────────
function retRange() {
  const today = dateToIso(new Date());
  const a = typeof dateFrom !== 'undefined' && dateFrom ? dateToIso(dateFrom) : '2021-08-01';
  const b = typeof dateTo !== 'undefined' && dateTo ? dateToIso(dateTo) : today;
  return [a, b];
}
// ['all'] is the four open UAE branches (null to the functions); otherwise the codes picked. Bahrain has no history here (its chip is struck out).
function retCodes() {
  if (typeof sel === 'undefined' || !sel.branch || sel.branch.includes('all')) return null;
  const c = sel.branch.filter(b => typeof BH_BRANCHES === 'undefined' || !BH_BRANCHES.includes(b));
  return !c.length || (typeof UAE_ACTIVE !== 'undefined' && UAE_ACTIVE.every(b => c.includes(b))) ? null : c;
}
const retBranchArg = () => { const c = retCodes(); return c ? c.join(',') : null; };
const retScope = () => { const c = retCodes(); return c ? c.map(retName).join(' + ') : 'UAE'; };
function retCall(name, args) {
  const key = name + JSON.stringify(args);
  const hit = retCache[key];
  if (hit && Date.now() - hit.t < 600000) return hit.p;
  const p = Promise.resolve(sb.rpc(name, args)).then(r => { if (r.error) throw r.error; return r.data; });
  retCache[key] = { t: Date.now(), p };
  p.catch(() => { if (retCache[key] && retCache[key].p === p) delete retCache[key]; });
  return p;
}
const retArgs = () => { const [a, b] = retRange(); return { p_from: a, p_to: b, p_branch: retBranchArg() }; };

// ── STAFF: team, photo, resigned (staff-profiles.js, the same cutouts Staff Cards uses) ────────────
const RET_ALIAS = { 'MARY JOY': 'MJ', 'TAMRYN': 'TAMMY', 'KIMBERLY': 'KIM', 'PRINCESS AREANNE': 'AREANNE' };   // the ledger's name for her is not Phorest's
const RET_CROSS = ['IBRAHIM', 'ZANDRI', 'ROBYN', 'ELISE', 'CLARISSA'];   // one person who works at more than one salon
function retProfile(emp, branch) {
  if (typeof STAFF_PROFILES === 'undefined') return null;
  const u = String(emp || '').toUpperCase().trim().split(/\s+/);
  const cands = [u.slice(0, 2).join(' '), u[0], RET_ALIAS[u.slice(0, 2).join(' ')], RET_ALIAS[u[0]], RET_ALIAS[u.slice(0, 3).join(' ')]];
  const key = cands.find(k => k && STAFF_PROFILES[k]);
  if (!key) return null;
  const p = STAFF_PROFILES[key];
  const also = Array.isArray(p.alsoAt) ? p.alsoAt : [];
  if (!(p.branch === branch || also.includes(branch) || RET_CROSS.includes(key))) return null;   // May Manguiat at Saadiyat is not May Fernandez at Khalifa City
  return p;
}
function retPhoto(p) {
  if (!p) return '';
  if (p.photoFull) return encodeURI(p.photoFull);
  return p.photo ? 'assets/staff/' + encodeURIComponent(p.photo) : '';
}
const retTeamOf = p => !p ? '' : (/Beauty|Nail/.test(p.role || '') ? 'B' : 'H');

// ── THE LISTS BEHIND EVERY FIGURE ─────────────────────────────────────────────────────
// One window per figure, with Came back and Did not come back as its two tabs. The client's own name opens her visits (PD.clientHistory).
function retListView(id, label, extra) {
  return { id, label, load: async () => {
    const s = retData, multi = !retCodes() || retCodes().length > 1;
    const d = await retCall('drill_retention_clients', Object.assign({ p_from: s.from, p_to: s.to, p_branch: retBranchArg(), p_seg: 'all', p_ret: 'all', p_emp: null, p_eb: null, p_same: false, p_bucket: null }, extra));
    const rows = d.rows || [], back = extra.p_ret === 'back', notback = extra.p_ret === 'notback';
    const tail = notback ? { k: 'days', l: 'Days since last visit', t: 'num' } : { k: 'back', l: 'First visit back', t: 'date' };
    const ctx = { cur: 'AED', label: 'Retention' };
    let sub = `${retEsc(retScope())}, clients who came in ${retDay(s.from)} to ${retDay(s.to)}, and whether they came back by ${retDay(s.ret_to)}. A client counts once, at the salon she came to; a visit is a paid day with real spend (no deposits, vouchers, staff bookings or BUSINESS TRS).`;
    if (s.partial) sub += ` The 2 months after the Period are not over: figures so far, to ${retDay(s.ret_to)}.`;
    if (d.total > rows.length) sub += ` The first ${retN(rows.length)} of ${retN(d.total)} are shown.`;
    return {
      sub,
      cols: [{ k: 'c', l: 'Client' }, ...(multi ? [{ k: 'b', l: 'Salon' }] : []), { k: 'st', l: 'Seen by' }, { k: 'v', l: 'Visits in the Period', t: 'num' }, { k: 'last', l: 'Last visit', t: 'date' }, tail],
      client: { k: 'c', b: 'bc', i: 'k', from: s.from, to: s.ret_to },
      rows: rows.map(r => ({ c: r.c, k: r.k, b: retName(r.b), bc: r.b, st: r.st || '', v: r.v, last: r.last, back: r.back, days: r.days,
        _dn: { c: (typeof PD !== 'undefined' && PD.clientHistory) ? PD.clientHistory(ctx, { client: r.c, cid: r.k, from: s.from, to: s.ret_to }) : null } })),
      empty: back ? 'Nobody in this group came back yet.' : 'Nobody here.',
      note: null,
    };
  } };
}
// a figure with a back and a not-back side: the percentage opens both tabs, the "came back" count only the first
function retSpec(title, extra, backN, totalN, only) {
  const views = [];
  if (only !== 'notback') views.push(retListView('back', `Came back (${retN(backN)})`, Object.assign({}, extra, { p_ret: 'back' })));
  if (only !== 'back') views.push(retListView('notback', `Did not come back (${retN(totalN - backN)})`, Object.assign({}, extra, { p_ret: 'notback' })));
  return { title, views };
}
function retAllSpec(title, extra, n) { return { title, views: [retListView('all', `Clients (${retN(n)})`, Object.assign({}, extra, { p_ret: 'all' }))] }; }
const retNum = (html, spec) => (typeof TRSD !== 'undefined' && spec) ? TRSD.num(html, spec) : html;

// ── THE PAGE ────────────────────────────────────────────────────────────────────────────
function retCss() {
  if (document.getElementById('retCss')) return;
  const st = document.createElement('style'); st.id = 'retCss';
  st.textContent = `
#retentionContent{max-width:1100px;margin:0 auto;padding:10px 28px 48px}
@media(max-width:760px){#retentionContent{padding:10px 10px 40px!important}}
#retentionContent .rt-q{margin:4px 0 16px;color:var(--muted);font-size:15px}
.rt-hero{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-card);padding:20px 24px;display:grid;grid-template-columns:auto 1fr;gap:6px 24px;align-items:center;margin-bottom:12px}
.rt-big{font-family:'Playfair Display',serif;font-size:clamp(52px,9vw,80px);line-height:1;letter-spacing:-.02em}
.rt-big small{font-size:.42em;margin-left:2px}
.rt-hero p{margin:0;font-size:17px;line-height:1.4}
.rt-hero p .s{display:block;color:var(--muted);font-size:13.5px;margin-top:4px}
.rt-note{background:var(--warn-bg);border:1px solid var(--border);border-radius:var(--radius-card);padding:12px 16px;margin-bottom:12px;font-size:14.5px;line-height:1.5}
.rt-trio{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:24px}
.rt-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-card);padding:12px 14px}
.rt-card .l{font-size:13px;color:var(--muted)}
.rt-card .n{font-family:'Playfair Display',serif;font-size:30px;line-height:1.15}
.rt-card .d{font-size:12.5px;color:var(--muted);margin-top:2px}
.rt-h{font-size:12px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin:0}
.rt-sec{margin-bottom:26px}
.rt-bar{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;margin-bottom:10px}
.rt-bar .rt-h{margin-right:auto}
.rt-fl{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;margin:0 0 8px}
.rt-lbl{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}
.rt-lbl.rk{margin-left:10px}
.rt-chip{border:0;background:none;padding:3px 1px;font:inherit;font-size:13px;color:var(--muted);cursor:pointer;border-bottom:2px solid transparent}
.rt-chip[aria-pressed="true"]{color:var(--text);border-bottom-color:var(--text);font-weight:600}
.rt-sep{color:var(--muted)}
.rt-mini{border:1px solid var(--border);background:var(--surface);border-radius:999px;padding:3px 10px;font:inherit;font-size:12px;color:var(--muted);cursor:pointer;display:inline-flex;align-items:center;gap:5px;line-height:1.5}
.rt-mini input{margin:0;accent-color:var(--accent)}
.rt-rows{display:flex;flex-direction:column;gap:2px}
.rt-row{display:grid;grid-template-columns:46px minmax(170px,300px) 1fr 66px;gap:12px;align-items:center;padding:6px 10px;border-radius:10px;cursor:pointer}
.rt-row.np{grid-template-columns:minmax(170px,300px) 1fr 66px;cursor:default}
@media(hover:hover){.rt-row:not(.np):hover{background:var(--surface)}}
.rt-nm{font-size:15px;min-width:0;line-height:1.3}
.rt-nm em{font-style:normal;color:var(--muted);font-size:12px;white-space:nowrap}
.rt-nm .l2{display:block}
.rt-tag{font-size:10px;letter-spacing:.08em;text-transform:uppercase;border:1px solid var(--border);border-radius:999px;padding:1px 7px;margin-left:6px;color:var(--muted);white-space:nowrap}
.rt-tag.H{color:var(--hair);border-color:var(--hair)}
.rt-tag.B{color:var(--beauty);border-color:var(--beauty)}
.rt-tag.res{color:var(--warn);border-color:var(--warn)}
.rt-pho{height:56px;display:flex;align-items:flex-end;justify-content:center}
.rt-pho img{height:56px;width:auto;max-width:46px;object-fit:contain;display:block}
.rt-row.res .rt-pho img,.rt-more.res img{filter:grayscale(1);opacity:.55}
.rt-bars{display:flex;flex-direction:column;gap:7px}
.rt-trk{position:relative;height:10px;border-radius:999px;background:var(--surface2)}
.rt-row.np .rt-trk{height:12px}
.rt-fill{position:absolute;left:0;top:0;bottom:0;border-radius:999px;background:var(--accent)}
.rt-trk.t2 .rt-fill{background:var(--hair)}
.rt-avg{position:absolute;top:-4px;bottom:-4px;width:2px;background:var(--text);opacity:.55;border-radius:2px}
.rt-pc{display:flex;flex-direction:column;gap:3px;line-height:1.2;text-align:right;font-variant-numeric:tabular-nums}
.rt-pc b{font-weight:600;white-space:nowrap}
.rt-pc b.k2{font-weight:500;color:var(--muted)}
.rt-pc b::before,.rt-sw{content:"";display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px;vertical-align:1px}
.rt-pc b.k1::before,.rt-sw.k1{background:var(--accent)}
.rt-pc b.k2::before,.rt-sw.k2{background:var(--hair)}
.rt-row.np .rt-pc b::before{display:none}
.rt-more{display:flex;gap:16px;align-items:flex-start;padding:8px 14px 12px;font-size:13px;color:var(--muted);background:var(--surface);border-radius:10px;margin:0 0 4px}
.rt-more img{height:96px;width:auto;max-width:40%;object-fit:contain;flex:0 0 auto}
.rt-more div{display:flex;flex-direction:column;gap:3px}
.rt-more b{color:var(--text)}
.rt-btn{border:1px solid var(--border);background:var(--surface);border-radius:999px;padding:8px 16px;font:inherit;font-size:14px;cursor:pointer;margin-top:8px;color:var(--text)}
.rt-legend{font-size:12px;color:var(--muted);margin-top:10px;display:flex;flex-direction:column;gap:4px}
.rt-legend b{color:var(--text)}
.rt-legend i{display:inline-block;width:2px;height:11px;background:var(--text);opacity:.55;margin-right:8px;vertical-align:-1px}
.rt-foot{font-size:12px;color:var(--muted);border-top:1px solid var(--border);padding-top:14px;margin-top:8px}
.rt-empty{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-card);padding:20px 22px;font-size:15px;line-height:1.55}
@media(max-width:640px){
  .rt-trio{grid-template-columns:1fr}
  .rt-hero{grid-template-columns:1fr;padding:16px 14px}
  .rt-row{grid-template-columns:46px 1fr 60px;gap:4px 10px}
  .rt-row.np{grid-template-columns:1fr 60px}
  .rt-row .rt-bars,.rt-row>.rt-trk{grid-column:1/-1;order:3}
}`;
  document.head.appendChild(st);
}

async function renderRetention() {
  const el = document.getElementById('retentionContent');
  if (!el) return;
  retCss();
  try { if (window.trsWindowReady) await window.trsWindowReady; } catch (e) {}
  const seq = ++retSeq;
  el.innerHTML = '<p class="rt-q">Counting who came back…</p>';
  let d;
  try { d = await retCall('retention_report', retArgs()); }
  catch (e) {
    if (seq !== retSeq) return;
    console.error(e);
    el.innerHTML = '<div class="rt-empty">The retention numbers did not load. A long Period can time out: try a shorter one, or refresh.</div>';
    return;
  }
  if (seq !== retSeq) return;
  retData = d;
  if (!d || !d.ok) {
    const days = d && d.days ? d.days : 0;
    el.innerHTML = `<p class="rt-q">Clients who came in during the Period, and how many came back in the 2 months after.</p><div class="rt-empty"><b>Retention looks forward from the Period.</b><br>It needs a Period that ended at least 30 days ago (${days ? retN(days) + ' days of follow-up so far' : 'this one has none yet'}). Pick Month, Last month or Custom with dates from earlier, for example 1 May to 31 Jul.</div>`;
    return;
  }
  retPaint();
}

function retSum(list) {
  const t = { cohort: 0, back: 0, new_c: 0, new_b: 0, old_c: 0, old_b: 0, once_c: 0, once_b: 0, rep_c: 0, rep_b: 0 };
  list.forEach(b => Object.keys(t).forEach(k => { t[k] += +b[k] || 0; }));
  return t;
}
const retCard = (l, n, d) => `<div class="rt-card"><div class="l">${l}</div><div class="n">${n}</div><div class="d">${d}</div></div>`;
const retBar = (p, avg, cls) => `<div class="rt-trk ${cls || ''}"><div class="rt-fill" style="width:${p}%"></div>${avg != null ? `<div class="rt-avg" style="left:${avg}%"></div>` : ''}</div>`;

function retPaint() {
  const el = document.getElementById('retentionContent'), s = retData, w = retScope();
  const t = retSum(s.branches || []), nw = retP(t.new_b, t.new_c), ol = retP(t.old_b, t.old_c);
  const one = (title, extra, back, total) => retSpec(`${w}: ${title}`, extra, back, total);
  const pct = (v, spec) => retNum(Math.round(v) + '%', spec);
  const per = `${retDay(s.from)} to ${retDay(s.to)}`;
  const ret = `${retDay(s.ret_from)} to ${retDay(s.ret_to)}`;
  let h = `<p class="rt-q">Clients who came in during the Period (${retEsc(per)}), and how many came back in the 2 months after (${retEsc(ret)}).</p>`;
  h += `<div class="rt-hero"><div class="rt-big">${retNum(Math.round(retP(t.back, t.cohort)) + '<small>%</small>', one('clients who came in, then came back', {}, t.back, t.cohort))}</div>
    <p><b>${retNum(retN(t.back), retSpec(`${w}: clients who came back`, {}, t.back, t.cohort, 'back'))} of ${retNum(retN(t.cohort), retAllSpec(`${w}: clients who came in`, {}, t.cohort))}</b> clients who came in ${retEsc(per)} came back by ${retEsc(retDay(s.ret_to))} (${retEsc(w)}).
    <span class="s">Same salon only. A client who tried a different salon counts as not back here.${s.partial ? ' The 2 months are not over yet, so this will still rise.' : ''}</span></p></div>`;
  h += nw < ol - 5
    ? `<div class="rt-note"><b>The leak is new clients.</b> Only ${pct(nw, one('new clients', { p_seg: 'new' }, t.new_b, t.new_c))} of first-timers came back, against ${pct(ol, one('clients we already knew', { p_seg: 'known' }, t.old_b, t.old_c))} of clients we already knew. Who sees a new client in the first visit decides the second one.</div>`
    : `<div class="rt-note"><b>New clients are coming back as well as the clients we already knew:</b> ${pct(nw, one('new clients', { p_seg: 'new' }, t.new_b, t.new_c))} against ${pct(ol, one('clients we already knew', { p_seg: 'known' }, t.old_b, t.old_c))}.</div>`;
  const cell = (label, seg, b, c, extraTxt) => retCard(label, pct(retP(b, c), one(label.toLowerCase(), { p_seg: seg }, b, c)),
    `${retNum(retN(b), retSpec(`${w}: ${label.toLowerCase()} who came back`, { p_seg: seg }, b, c, 'back'))} of ${retNum(retN(c), retAllSpec(`${w}: ${label.toLowerCase()}`, { p_seg: seg }, c))} came back${extraTxt || ''}`);
  h += `<div class="rt-trio">${cell('New clients', 'new', t.new_b, t.new_c)}${cell('Clients we already knew', 'known', t.old_b, t.old_c)}${cell('Came once', 'once', t.once_b, t.once_c,
    `; ${pct(retP(t.rep_b, t.rep_c), one('clients who came 2+ times', { p_seg: 'repeat' }, t.rep_b, t.rep_c))} of the ${retNum(retN(t.rep_c), retAllSpec(`${w}: clients who came 2+ times`, { p_seg: 'repeat' }, t.rep_c))} who came 2+ times`)}</div>`;

  const bl = (s.branches || []).slice().sort((a, b) => retP(b.back, b.cohort) - retP(a.back, a.cohort) || a.branch.localeCompare(b.branch));
  if (bl.length > 1) {
    const avg = retP(t.back, t.cohort);
    h += `<div class="rt-sec"><h3 class="rt-h" style="margin-bottom:10px">By salon</h3><div class="rt-rows">${bl.map(b => {
      const p = retP(b.back, b.cohort), nm = retName(b.branch);
      return `<div class="rt-row np"><span class="rt-nm">${retEsc(nm)} <em>${retNum(retN(b.cohort), retAllSpec(`${nm}: clients who came in`, { p_branch: b.branch }, b.cohort))} clients</em></span>${retBar(p, avg)}<span class="rt-pc"><b>${retNum(Math.round(p) + '%', retSpec(`${nm}: clients who came in, then came back`, { p_branch: b.branch }, b.back, b.cohort))}</b></span></div>`;
    }).join('')}</div></div>`;
  }
  h += '<div class="rt-sec" id="retStylists"></div>';
  h += `<div class="rt-foot">One client counts once a day: a paid sale, spend above AED 0, no staff bookings, no BUSINESS TRS. Counted per salon: a client who moves salon shows as not back at the first one. Stylists and beauticians with under ${RET_MIN_CLIENTS} clients are left out of the list. Anyone with no staff profile yet shows under All teams only, without a photo. Every number opens the clients behind it.</div>`;
  el.innerHTML = h;
  retStylists();
}

function retStaffRows() {
  const s = retData;
  return (s.staff || []).filter(r => +r.clients >= RET_MIN_CLIENTS).map(r => {
    const p = retProfile(r.e, r.b);
    return Object.assign({}, r, { p, team: retTeamOf(p), res: !!(p && p.resigned), role: p ? p.role : '', photo: retPhoto(p) });
  });
}
function retStylists() {
  const box = document.getElementById('retStylists');
  if (!box) return;
  const s = retData, w = retScope(), multi = !retCodes() || retCodes().length > 1;
  const base = retStaffRows().filter(r => RET.team === 'A' || r.team === RET.team);
  const nres = base.filter(r => r.res).length;
  let rows = base.filter(r => RET.res || !r.res).map(r => ({ r, pa: retP(r.any, r.clients), ps: retP(r.same, r.clients) }));
  const key = x => RET.rank === 'any' ? x.pa : x.ps;
  rows.sort((a, b) => (RET.order === 'low' ? key(a) - key(b) : key(b) - key(a)) || a.r.e.localeCompare(b.r.e));
  const tc = rows.reduce((a, x) => a + x.r.clients, 0), avgA = retP(rows.reduce((a, x) => a + x.r.any, 0), tc), avgS = retP(rows.reduce((a, x) => a + x.r.same, 0), tc);
  const shown = RET.all ? rows : rows.slice(0, 8);
  retRows = shown;
  const chip = (attr, val, label, on) => `<button class="rt-chip" type="button" ${attr}="${val}" aria-pressed="${on}">${label}</button>`;
  const sep = '<span class="rt-sep">·</span>';
  let h = `<div class="rt-bar"><h3 class="rt-h">By stylist (${rows.length})</h3>
    <label class="rt-mini"><input type="checkbox" id="retRes"${RET.res ? ' checked' : ''}> Resigned${nres ? ' (+' + nres + ')' : ''}</label>
    <button class="rt-mini" id="retSort" type="button">${RET.order === 'low' ? 'Lowest' : 'Highest'} first &#8645;</button></div>
    <div class="rt-fl"><span class="rt-lbl">Team</span>${chip('data-team', 'A', 'All', RET.team === 'A')}${sep}${chip('data-team', 'H', 'Hair', RET.team === 'H')}${sep}${chip('data-team', 'B', 'Beauty', RET.team === 'B')}
      <span class="rt-lbl rk">Rank by</span>${chip('data-rank', 'any', 'Salon return', RET.rank === 'any')}${sep}${chip('data-rank', 'same', 'Same stylist', RET.rank === 'same')}</div>`;
  h += '<div class="rt-rows">' + shown.map((x, i) => {
    const r = x.r, who = `${r.e} (${retName(r.b)})`, ex = { p_emp: r.e, p_eb: r.b };
    const img = r.photo ? `<div class="rt-pho"><img alt="" src="${retEsc(r.photo)}" onerror="this.remove()"></div>` : '<div class="rt-pho"></div>';
    const tag = r.team ? `<span class="rt-tag ${r.team}">${r.team === 'B' ? 'Beauty' : 'Hair'}</span>` : '';
    const worker = r.team === 'B' ? 'beautician' : 'stylist';
    return `<div class="rt-row${r.res ? ' res' : ''}" data-i="${i}">${img}<span class="rt-nm">${retEsc(r.e)}${tag}${r.res ? '<span class="rt-tag res">Resigned</span>' : ''}<span class="l2"><em>${r.role ? retEsc(r.role) + ', ' : ''}${multi ? r.b + ', ' : ''}${retNum(retN(r.clients), retAllSpec(`${who}: clients handled`, ex, r.clients))} clients</em></span></span>
      <div class="rt-bars">${retBar(x.pa, avgA)}${retBar(x.ps, avgS, 't2')}</div>
      <span class="rt-pc"><b class="k1">${retNum(Math.round(x.pa) + '%', retSpec(`${who}: her clients, back to the salon`, ex, r.any, r.clients))}</b><b class="k2">${retNum(Math.round(x.ps) + '%', retSpec(`${who}: her clients, back to the same ${worker}`, Object.assign({ p_same: true }, ex), r.same, r.clients))}</b></span></div>`;
  }).join('') + '</div>';
  if (rows.length > 8) h += `<button class="rt-btn" id="retMore" type="button">${RET.all ? 'Show fewer' : 'Show all ' + rows.length + ' stylists'}</button>`;
  h += `<div class="rt-legend"><div><span class="rt-sw k1"></span><b>Back to the salon</b>: counts a return to any stylist or beautician at the salon. Average ${Math.round(avgA)}%.</div>
    <div><span class="rt-sw k2"></span><b>Back to the same stylist or beautician</b>: counts only a return to the same person. Average ${Math.round(avgS)}%.</div>
    <div><i></i>The line on each bar is that average for the people shown.${RET.res ? ' Resigned staff are included, in grey.' : ''}</div></div>`;
  box.innerHTML = h;
}

// the detail under a row: her photo at the staff-card size (96px) and every number behind her percentages
function retMore(row) {
  const i = +row.dataset.i, x = retRows[i];
  if (!x) return;
  const open = row.nextElementSibling && row.nextElementSibling.classList.contains('rt-more');
  document.querySelectorAll('#retStylists .rt-more').forEach(n => n.remove());
  if (open) return;
  const r = x.r, who = `${r.e} (${retName(r.b)})`, ex = { p_emp: r.e, p_eb: r.b }, worker = r.team === 'B' ? 'beautician' : 'stylist';
  const d = document.createElement('div'); d.className = 'rt-more' + (r.res ? ' res' : '');
  const list = (title, extra, n) => retNum(retN(n), retAllSpec(`${who}: ${title}`, Object.assign({}, ex, extra), n));
  d.innerHTML = (r.photo ? `<img alt="" src="${retEsc(r.photo)}" onerror="this.remove()">` : '') + `<div>
    <span><b>${list('clients handled', {}, r.clients)}</b> clients, <b>${list('clients handled', {}, r.visits)}</b> visits (${(Math.round(100 * r.visits / r.clients) / 100).toFixed(2)} each)</span>
    <span>Came once <b>${list('clients who came once', { p_bucket: 1 }, r.c1)}</b>, twice <b>${list('clients who came twice', { p_bucket: 2 }, r.c2)}</b>, 3+ <b>${list('clients who came 3+ times', { p_bucket: 3 }, r.c3)}</b></span>
    <span>Back to the same ${worker} <b>${retNum(retN(r.same), retSpec(`${who}: back to the same ${worker}`, Object.assign({ p_same: true }, ex), r.same, r.clients))}</b>, back to the salon <b>${retNum(retN(r.any), retSpec(`${who}: back to the salon`, ex, r.any, r.clients))}</b></span></div>`;
  row.after(d);
}

document.addEventListener('click', e => {
  const host = e.target.closest && e.target.closest('#retentionContent');
  if (!host) return;
  if (e.target.closest('.dn')) return;   // a figure: drill.js opens its list
  const t = e.target.closest('[data-team]'); if (t) { RET.team = t.dataset.team; RET.all = false; retSave(); retStylists(); return; }
  const k = e.target.closest('[data-rank]'); if (k) { RET.rank = k.dataset.rank; retSave(); retStylists(); return; }
  if (e.target.id === 'retRes') { RET.res = e.target.checked ? 1 : 0; RET.all = false; retSave(); retStylists(); return; }
  if (e.target.closest('#retSort')) { RET.order = RET.order === 'low' ? 'high' : 'low'; retSave(); retStylists(); return; }
  if (e.target.id === 'retMore') { RET.all = !RET.all; retStylists(); return; }
  const row = e.target.closest('.rt-row:not(.np)'); if (row) retMore(row);
});
