// Log a Complaint (Kate, 22 Oct 2026): "add the client complaints submission under client complaints section", as its own page and not in the
// mini side nav of Client Complaints. The form (client_complaint_submit) and the page that lists the complaints logged from it, to follow up and
// close. It shares state, styles and the list with complaints.js (CQ, cqCss, cqLoadList, cqPaintList, cqUpdate, cqRemove), which loads first in the
// same lazy group (cp); only one of the two pages is drawn at a time, so their ids never meet. Levels 2 and up, enforced in every function.

// Kate, 22 Oct 2026: "make sure na ma-flag or di mag-go through if duplicate filing", and an i button that reminds to check first.
// client_complaint_dupes looks for the same client (full name, or first and last name) near that date; the same client, branch and date is
// refused by client_complaint_submit itself (DUPLICATE), a similar one asks for a confirmation (SIMILAR, then p_force).
const CQ_DUP_TIP = 'Check first: search Logged complaints below, and Client Complaints, for this client. If it is already there, open it and add a follow-up instead of logging it again. The same client, branch and date cannot be logged twice, and a mobile number that is already on a complaint is flagged.';
const cqInfo = () => `<button type="button" class="cq-i" aria-label="Check that it was not already submitted" data-tip="${cqEsc(CQ_DUP_TIP)}" onclick="event.preventDefault();event.stopPropagation()">i</button>`;
let cqDupSeq = 0, cqDupTimer = 0;

// ── Who was involved, who else should know, and where it goes (Kate, 29 Oct 2026, complaint triage batch 2) ──
// "Who was involved?" is written down and nobody is messaged (their coordinator talks to them). "Who else should know?" are copied: each gets one
// WhatsApp. Kate and the branch coordinator are always told, so they show as fixed. Only people on the list (table complaint_taggers) can be picked.
// The side card "Where it goes" follows the kind and the branch, and shows who is on the site now. The dots only inform: nobody is skipped for being off.
// If a person who was involved is on the chain, the chain skips them (the worker does the same).
const CMPF = { roles: { Reception: false, Beautician: false }, stylistOn: true, people: [], names: [], cc: [], chain: null, key: '', panel: '' };
let cmpChainSeq = 0, cmpChainTimer = 0, cmpUrgentTimer = 0;
const cmpE = s => CmpPeople.esc(s);
const cmpVal = id => ((document.getElementById(id) || {}).value || '').trim();

function cmpCssTag() {
  return `<style>
    .cmp-split{display:grid;gap:4px 22px;grid-template-columns:minmax(0,1fr);grid-template-areas:"f" "s" "b"}
    .cmp-f{grid-area:f;min-width:0}.cmp-s{grid-area:s;min-width:0}.cmp-b{grid-area:b;min-width:0}
    @media (min-width:1280px){.cmp-split{grid-template-columns:minmax(0,1.6fr) minmax(290px,1fr);grid-template-areas:"f s" "b s"}.cmp-s{align-self:start;position:sticky;top:12px}}
    .cmp-side{border:1px solid var(--border);border-radius:12px;background:var(--surface);padding:12px 14px;margin:10px 0}
    .cmp-side h3,.cmp-urg h3{font-size:14px;font-weight:600;margin:0 0 6px}
    .cmp-k{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;padding:7px 0;border-top:1px solid var(--border);font-size:13.5px}
    .cmp-k:first-of-type{border-top:0}.cmp-k>span{color:var(--muted);flex:none}
    .cmp-k>div{text-align:right;display:grid;gap:4px;justify-items:end}
    .cmp-k b{font-weight:500}.cmp-k b small{display:block;font-weight:400;font-size:11.5px;color:var(--muted)}
    .cmp-k b.skip{text-decoration:line-through;opacity:.65}.cmp-k b.skip small{text-decoration:none}
    .cmp-who .cmp-panel{margin:2px 0 8px}
    .cmp-panel .cmp-free{display:flex;gap:8px;margin-top:8px}.cmp-panel .cmp-free input{flex:1;min-width:0}
    .cmp-urg{border:1px solid var(--border);border-radius:14px;padding:16px;margin:10px 0;background:var(--surface)}
    .cmp-urg p{margin:0 0 10px;font-size:14px;line-height:1.5}
    .cmp-dial{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;background:var(--surface2);border-radius:12px;padding:12px 14px;margin:8px 0}
    .cmp-dial b{font-size:18px}
    .cmp-call{background:#B4412F;color:#fff;border:0;border-radius:12px;padding:10px 20px;font:inherit;font-weight:600;text-decoration:none;cursor:pointer;min-height:42px;display:inline-flex;align-items:center}
    .cmp-ok{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;margin:0 0 12px;font-size:13px}
  </style>`;
}

// Adult learning audit (ALAD-3, Kate, 30 Oct 2026): the why wall and the two doors at the top, the form in three short steps, the answer to "what did my
// choice do" under the kind, and one next step after saving. Wording and layout only: the same fields are sent, the same functions are called.
function cqLogCss() {
  return `<style>
    .cql-why{max-width:820px;margin:0 0 14px;font-size:14px;line-height:1.55}
    .cql-why p{margin:0}
    .cql-doors{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:0 0 8px;max-width:820px}
    .cql-door{display:flex;flex-direction:column;gap:3px;text-align:left;font:inherit;color:var(--text);background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-card);padding:14px 16px;min-height:64px;cursor:pointer}
    .cql-door b{font-size:15px;font-weight:600}
    .cql-door span{font-size:12.5px;color:var(--muted)}
    .cql-door:hover,.cql-door:focus-visible{background:var(--surface2);border-color:var(--accent)}
    .cql-door.over span{color:#d9534f}
    .cql-more{margin:0 0 16px;font-size:13px;color:var(--muted);display:flex;flex-wrap:wrap;align-items:center;gap:8px}
    .cql-pill{display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:0 14px;border:1px solid var(--border);border-radius:999px;background:var(--surface);color:var(--text);text-decoration:none}
    .cql-pill:hover,.cql-pill:focus-visible{background:var(--surface2);border-color:var(--accent)}
    .cql-step{margin:14px 0 0}
    .cql-step h3{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600;margin:0 0 2px}
    .cql-step h3 i{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:var(--accent);color:var(--bg);font:600 12px/1 inherit;font-style:normal;flex:none}
    .cql-l{display:block}
    .cq-req{font-style:normal;font-size:11px;font-weight:600;color:var(--accent);margin-left:6px;letter-spacing:.02em}
    .cql-inline{display:flex;gap:8px;align-items:center}
    .cq-form .cql-inline .cq-in{flex:1 1 auto;width:auto;min-width:0}
    .cql-inline .cq-btn{flex:none;min-height:38px}
    .cql-here{margin:-4px 0 0;font-size:12.5px;line-height:1.45;color:var(--muted);padding:7px 10px;border-left:3px solid var(--accent);background:var(--surface2);border-radius:0 8px 8px 0}
    @media (min-width:1280px){.cql-here{display:none}}
    .cql-fold{margin:14px 0 4px;border-top:1px solid var(--border);padding-top:10px}
    .cql-fold>summary{cursor:pointer;font-size:13.5px;font-weight:600;list-style:none}
    .cql-fold>summary::-webkit-details-marker{display:none}
    .cql-fold>summary::before{content:'+';display:inline-block;width:16px;color:var(--muted)}
    .cql-fold[open]>summary::before{content:'−'}
    .cql-fold>summary small{font-weight:400;color:var(--muted);margin-left:6px}
    .cql-lead{margin:2px 0 0;font-size:12.5px;color:var(--muted);line-height:1.45}
    .cql-ask{margin:0 0 10px}
    .cql-ask .cq-bar{margin:10px 0 0}
    .cql-alw{font-size:12px;color:var(--muted);align-self:center}
    @media (max-width:760px){.cql-doors{grid-template-columns:1fr}.cql-door{min-height:60px}#cqfGo{min-height:44px;padding:0 22px}}
  </style>`;
}

// Who is signed in, once: the owner of a new complaint defaults to them, and the confirmation says "you".
let cqMeName = null;
async function cqWhoAmI() {
  if (cqMeName !== null) return cqMeName;
  try { const m = await TRSAuth.me(); cqMeName = String((m && m.name) || '').trim(); } catch (e) { cqMeName = ''; }
  return cqMeName;
}
async function cqFillMe(force) {
  const el = document.getElementById('cqfResp');
  if (!el || (el.value.trim() && !force)) return;
  const n = await cqWhoAmI();
  if (n && el && (force || !el.value.trim())) el.value = n;
}
const cqNameList = (a) => a.length < 2 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
const cqShortDay = iso => { const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }); };
const cqPlusDays = (iso, n) => { const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };

// What the kind and the branch did, in one line right under the kind (the side card sits beside the form on a wide screen, under it on a phone)
function cmpDrawHere() {
  const el = document.getElementById('cmpHere');
  if (!el) return;
  const ch = CMPF.chain;
  if (!ch) { el.textContent = 'Pick the branch and the kind, and this line says who hears about it first.'; return; }
  const names = ps => cqNameList((ps || []).map(p => p.name));
  const hrs = Math.round((ch.step_minutes || 180) / 60);
  const s0 = (ch.steps && ch.steps[0] && ch.steps[0].people) || [], s1 = (ch.steps && ch.steps[1] && ch.steps[1].people) || [];
  if (ch.grp === 'minor') el.textContent = 'This one goes to the daily summary. Nobody needs to act.';
  else if (ch.grp === 'urgent') el.textContent = `${names(s0)} are told at once, and you will see who to ring.`;
  else el.textContent = `${names(s0)} hear about it first${s1.length ? `, then ${names(s1)} after ${hrs} hours` : ''}.`;
}

function cmpWho() {
  return `<div class="wide cmp-who">
    <div class="cmp-lab">Who was involved? <small>(written down, not messaged. Their coordinator will talk to them)</small></div>
    <div class="cmp-pills" id="cmpInv"></div>
    <div class="cmp-lab">Who else should know? <small>(each gets one message)</small></div>
    <div class="cmp-pills" id="cmpCc"></div>
    <div class="cmp-panel" id="cmpPanel" hidden></div>
  </div>`;
}

function cmpInvolvedList() {
  const out = [];
  const st = cmpVal('cqfStylist');
  if (st && CMPF.stylistOn) out.push({ name: 'Stylist: ' + st });
  Object.keys(CMPF.roles).forEach(r => { if (CMPF.roles[r]) out.push({ name: r }); });
  CMPF.people.forEach(p => out.push({ name: p.name, email: p.email }));
  CMPF.names.forEach(n => out.push({ name: n }));
  return out;
}

function cmpDrawInv() {
  const box = document.getElementById('cmpInv');
  if (!box) return;
  const st = cmpVal('cqfStylist');
  const pills = [];
  if (st) pills.push(`<button type="button" class="cmp-pill${CMPF.stylistOn ? ' on' : ''}" data-inv="stylist" aria-pressed="${CMPF.stylistOn}">Stylist: ${cmpE(st)}</button>`);
  Object.keys(CMPF.roles).forEach(r => pills.push(`<button type="button" class="cmp-pill${CMPF.roles[r] ? ' on' : ''}" data-inv="role" data-v="${r}" aria-pressed="${CMPF.roles[r]}">${r}</button>`));
  CMPF.people.forEach(p => pills.push(`<button type="button" class="cmp-pill on" data-inv="rm" data-v="${cmpE(p.email)}" title="Take off">${cmpE(p.name)} <span class="x">×</span></button>`));
  CMPF.names.forEach((n, i) => pills.push(`<button type="button" class="cmp-pill on" data-inv="rmn" data-v="${i}" title="Take off">${cmpE(n)} <span class="x">×</span></button>`));
  pills.push(`<button type="button" class="cmp-pill" data-inv="add">+ Add</button>`);
  box.innerHTML = pills.join('');
}

function cmpDrawCc() {
  const box = document.getElementById('cmpCc');
  if (!box) return;
  const told = (CMPF.chain && CMPF.chain.told) || [];
  const fixed = told.map(t => `<span class="cmp-pill fixed" title="Always told, nothing for you to do">${cmpE(t.name)}${/^(Kate)$/.test(t.name) ? '' : ' (coordinator)'}</span>`);
  if (fixed.length) fixed.unshift(`<span class="cql-alw">Always told, nothing for you to do:</span>`);   // said on the page, not only in a hover tip (a phone has no hover)
  const mine = CMPF.cc.map(p => `<button type="button" class="cmp-pill on" data-cc="rm" data-v="${cmpE(p.email)}" title="Take off">${cmpE(p.name)} <span class="x">×</span></button>`);
  box.innerHTML = fixed.concat(mine).concat([`<button type="button" class="cmp-pill" data-cc="add">+ Add</button>`]).join('');
}

// the picker panel under the two lists: mode 'involved' (can also take a typed name) or 'cc'
function cmpOpenPanel(mode) {
  const panel = document.getElementById('cmpPanel');
  if (!panel) return;
  if (CMPF.panel === mode && !panel.hidden) { panel.hidden = true; CMPF.panel = ''; return; }
  CMPF.panel = mode; panel.hidden = false;
  panel.innerHTML = `<div class="cmp-lab" style="margin-top:0">${mode === 'cc' ? 'Who else should know? Pick a name.' : 'Who was involved? Pick a name, or write one.'}</div><div id="cmpPickBox"></div>
    ${mode === 'involved' ? `<div class="cmp-free"><input class="cq-in" id="cmpFree" maxlength="80" placeholder="Or write a name" autocomplete="off"><button type="button" class="cq-btn" data-inv="free">Add</button></div>` : ''}
    <div style="margin-top:8px"><button type="button" class="cq-btn" data-panel="close">Done</button></div>`;
  const taken = () => { const ex = {}; (mode === 'cc' ? CMPF.cc : CMPF.people).forEach(p => { ex[p.email] = 1; }); return ex; };
  const badges = () => { const b = {}; (mode === 'cc' ? CMPF.cc : CMPF.people).forEach(p => { b[p.email] = 'added'; }); (CMPF.chain && CMPF.chain.told || []).forEach(t => { if (mode === 'cc') b[t.email] = 'always told'; }); return b; };
  const h = CmpPeople.mount(document.getElementById('cmpPickBox'), {
    badges, lockBadged: true,
    onPick: p => {
      const list = mode === 'cc' ? CMPF.cc : CMPF.people;
      if (!list.some(x => x.email === p.email)) list.push({ name: p.short, email: p.email });
      cmpDrawInv(); cmpDrawCc(); cmpDrawSide(); h.draw();
    }
  });
  h.focus();
}

function cmpDrawSide() {
  cmpDrawHere();
  const box = document.getElementById('cmpSide');
  if (!box) return;
  const ch = CMPF.chain;
  if (!ch) { box.innerHTML = `<h3>Where it goes</h3><p class="cq-note" style="margin:0">Pick the kind of complaint and the branch, and it shows here who gets it first.</p>`; return; }
  const invs = cmpInvolvedList();
  const invNames = invs.map(i => String(i.name).toLowerCase()), invEmails = invs.map(i => i.email).filter(Boolean);
  const isInv = p => invEmails.includes(p.email) || (String(p.name).toLowerCase() !== 'kate' && invNames.some(n => n.indexOf(String(p.name).toLowerCase()) >= 0));
  const person = p => {
    const o = CmpPeople.byEmail[p.email], sk = isInv(p);
    return `<b class="${sk ? 'skip' : ''}">${o ? CmpPeople.dot(o) : ''}${cmpE(p.name)}<small>${sk ? 'involved, so skipped' : (o ? cmpE(CmpPeople.seen(o)) : '')}</small></b>`;
  };
  const hrs = Math.round((ch.step_minutes || 180) / 60);
  let rows = '';
  if (ch.grp === 'minor') rows = `<div class="cmp-k"><span>Goes to</span><div><b>The daily summary<small>No clock, nobody needs to act</small></b></div></div>`;
  else if (ch.grp === 'urgent') rows = `<div class="cmp-k"><span>All at once</span><div>${((ch.steps[0] || {}).people || []).map(person).join('')}</div></div>`
    + `<div class="cmp-k"><span>And</span><div><b>You see who to ring<small>A person has to hear this one</small></b></div></div>`;
  else rows = (ch.steps || []).map((s, i) => `<div class="cmp-k"><span>${i === 0 ? 'First' : 'After ' + (hrs * i) + ' hours'}</span><div>${s.people.map(person).join('')}</div></div>`).join('');
  const stepped = ch.grp !== 'urgent' && ch.grp !== 'minor';
  const told = (ch.told || []).filter(t => ch.grp !== 'urgent' || !((ch.steps[0] || {}).people || []).some(p => p.email === t.email));
  if (told.length || CMPF.cc.length) rows += `<div class="cmp-k"><span>Also told</span><div>${told.concat(CMPF.cc).map(person).join('')}</div></div>`;
  box.innerHTML = `<h3>Where it goes</h3>${rows}${CmpPeople.legend()}
    <p class="cq-note" style="margin:8px 0 0">Online only tells you who might see it sooner. The message still reaches them by WhatsApp either way.${stepped ? ` The clock runs ${ch.hours_from > 12 ? ch.hours_from - 12 + ' pm' : ch.hours_from + ' am'} to ${ch.hours_to > 12 ? ch.hours_to - 12 + ' pm' : ch.hours_to + ' am'}, Dubai time.` : ''} If someone who was involved is on the list, they are skipped and it goes to the next one.</p>`;
}

function cmpLoadChain() {
  clearTimeout(cmpChainTimer);
  cmpChainTimer = setTimeout(async () => {
    const type = cmpVal('cqfType'), branch = cmpVal('cqfBranch');
    if (!type || !branch) { CMPF.chain = null; CMPF.key = ''; cmpDrawSide(); cmpDrawCc(); return; }
    const key = type + '|' + branch;
    if (key === CMPF.key && CMPF.chain) { cmpDrawSide(); return; }
    const seq = ++cmpChainSeq;
    try {
      const { data, error } = await sb.rpc('cmp_chain', { p_type: type, p_branch: branch });
      if (error || seq !== cmpChainSeq) return;
      CMPF.chain = data; CMPF.key = key;
      cmpDrawSide(); cmpDrawCc();
    } catch (e) { console.error(e); }
  }, 150);
}

function cmpFormInit() {
  const card = document.getElementById('cq-new');
  if (!card || card.dataset.cmp) return;
  card.dataset.cmp = '1';
  CMPF.people = []; CMPF.names = []; CMPF.cc = []; CMPF.roles = { Reception: false, Beautician: false }; CMPF.stylistOn = true; CMPF.chain = null; CMPF.key = ''; CMPF.panel = '';
  cmpDrawInv(); cmpDrawCc(); cmpDrawSide();
  CmpPeople.load().then(() => { cmpDrawSide(); });
  CmpPeople.subs.push(() => { if (document.getElementById('cmpSide')) cmpDrawSide(); });
  ['cqfType', 'cqfBranch'].forEach(id => { const el = document.getElementById(id); if (el) el.addEventListener('change', cmpLoadChain); });
  const ty = document.getElementById('cqfType'); if (ty) ty.addEventListener('change', cqKindChanged);
  const meBtn = document.getElementById('cqfMe'); if (meBtn) meBtn.addEventListener('click', () => cqFillMe(true));
  cqFillMe(false);
  const stl = document.getElementById('cqfStylist'); if (stl) stl.addEventListener('input', () => { cmpDrawInv(); cmpDrawSide(); });
  cmpLoadChain();
  card.addEventListener('click', e => {
    const t = e.target;
    const cp = t.closest && t.closest('[data-copy]');
    if (cp) { e.preventDefault(); cqCopy(cp); return; }
    const inv = t.closest && t.closest('[data-inv]');
    if (inv) {
      const k = inv.dataset.inv;
      if (k === 'stylist') CMPF.stylistOn = !CMPF.stylistOn;
      else if (k === 'role') CMPF.roles[inv.dataset.v] = !CMPF.roles[inv.dataset.v];
      else if (k === 'rm') CMPF.people = CMPF.people.filter(p => p.email !== inv.dataset.v);
      else if (k === 'rmn') CMPF.names.splice(Number(inv.dataset.v), 1);
      else if (k === 'add') { cmpOpenPanel('involved'); return; }
      else if (k === 'free') { const f = document.getElementById('cmpFree'), n = ((f || {}).value || '').trim(); if (n.length >= 2 && !CMPF.names.includes(n)) CMPF.names.push(n); if (f) f.value = ''; }
      cmpDrawInv(); cmpDrawSide();
      return;
    }
    const cc = t.closest && t.closest('[data-cc]');
    if (cc) {
      if (cc.dataset.cc === 'add') { cmpOpenPanel('cc'); return; }
      CMPF.cc = CMPF.cc.filter(p => p.email !== cc.dataset.v);
      cmpDrawCc(); cmpDrawSide();
      return;
    }
    if (t.closest && t.closest('[data-panel="close"]')) { const pn = document.getElementById('cmpPanel'); if (pn) pn.hidden = true; CMPF.panel = ''; }
  });
}

// right after the save: who was involved and who else should know (the server checks each against the list)
async function cmpSavePeople(id) {
  const involved = cmpInvolvedList(), cc = CMPF.cc.map(p => ({ name: p.name, email: p.email }));
  if (!involved.length && !cc.length) return '';
  try {
    const { data, error } = await sb.rpc('cmp_set_people', { p_id: id, p_involved: involved, p_cc: cc });
    if (error) throw error;
    if (!data || !data.ok) return `The people were not saved (${data && data.why ? data.why : 'try again on the complaint page'}).`;
    return '';
  } catch (e) { console.error(e); return 'The people were not saved. Add them on the complaint page.'; }
}

// Skin reaction or injury: not a message and wait. The person who logged it sees "needs a call now"; the numbers show only to them, only for an hour,
// and only once Kate has turned show_urgent_numbers on (complaint_triage_config). Until then it names who to ring.
async function cmpUrgentShow(id, code) {
  const box = document.getElementById('cmpUrgent'), split = document.getElementById('cmpSplit');
  if (!box) return;
  let info = null;
  try { const { data } = await sb.rpc('cmp_urgent_numbers', { p_id: id }); info = data; } catch (e) { /* names only */ }
  const people = (info && info.people && info.people.length) ? info.people : [{ name: 'Coach Emma' }, { name: 'Mette' }];
  const dial = people.filter(p => p.phone).map(p => `<div class="cmp-dial"><div><div class="cq-muted">${cmpE(p.name)}</div><b>${cmpE(p.phone)}</b></div>
    <div class="cq-bar" style="margin:0"><a class="cmp-call" href="tel:${cmpE(String(p.phone).replace(/[^0-9+]/g, ''))}">Call</a><button type="button" class="cq-btn" data-copy="${cmpE(p.phone)}">Copy</button></div></div>`).join('');
  box.innerHTML = `${cmpCssTag()}<div class="cmp-urg"><h3>Logged. This one needs a call now.</h3>
    <p class="cq-muted">${code ? `<span class="cq-code">${cmpE(code)} <button type="button" data-copy="${cmpE(code)}">Copy</button></span> ` : ''}</p>
    <p>Skin reactions and injuries go to Coach Emma, Mette, Kate and your coordinator at the same time. The first to take it stops the rest.</p>
    ${dial || `<p><b>Please ring ${people.map(p => cmpE(p.name)).join(' or ')} now.</b> Ask your coordinator if you do not have the number.</p>`}
    <p class="cq-muted">A message alone is not enough for this one: a person needs to hear it. ${dial ? 'Call opens your phone app if you are on a phone. On a laptop, dial the number from your own phone or the desk phone, or Copy it.' : ''}</p>
    <p id="cmpUrgState" class="cq-muted" aria-live="polite">Waiting for someone to take it. This page tells you who did.</p>
    <button type="button" class="cq-btn" id="cmpUrgDone">Log another complaint</button></div>`;
  box.hidden = false; if (split) split.hidden = true;
  box.onclick = e => {
    const cp = e.target.closest && e.target.closest('[data-copy]');
    if (cp) { cqCopy(cp); return; }
    if (e.target.id === 'cmpUrgDone') { clearInterval(cmpUrgentTimer); box.hidden = true; box.innerHTML = ''; if (split) split.hidden = false; }
  };
  clearInterval(cmpUrgentTimer);
  let n = 0;
  const look = async () => {
    const st = document.getElementById('cmpUrgState');
    if (!st || ++n > 120) { clearInterval(cmpUrgentTimer); return; }
    try {
      const { data } = await sb.rpc('cmp_get', { p_id: id });
      const t = data && data.triage;
      if (t && t.state === 'claimed') { st.textContent = `${t.claimed_by || 'Someone'} took it. Thank you.`; clearInterval(cmpUrgentTimer); }
      else if (t && t.state === 'stuck') st.textContent = 'Nobody has taken it yet. Please keep ringing.';
    } catch (e) { /* try again next time */ }
  };
  cmpUrgentTimer = setInterval(look, 20000);
}

// Under the two doors: My complaints, and the Pipeline for leadership and the salon coordinators (the database says who, cmp_my_badge)
async function cmpLinks() {
  const box = document.getElementById('cmpLinks');
  if (!box) return;
  try {
    const { data } = await sb.rpc('cmp_my_badge');
    if (!data) return;
    const dot = ((data.waiting || 0) + (data.tagged || 0)) > 0 ? ' <span title="Something is waiting for you" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#B4412F;vertical-align:middle"></span>' : '';
    box.innerHTML = `<span>Or open</span> <a class="cql-pill" href="/hub/complaint">My complaints${dot}</a>` + (data.board ? ` <a class="cql-pill" href="/hub/complaint?view=board">Pipeline</a>` : '');
  } catch (e) { /* the plain link stays */ }
}

// After the save: one next step (who replies, by when), the new code with a Copy button, and one link to the complaint page. info = { client, owner, complaintDate, resolved, extra }
async function cmpDone(id, info) {
  const ok = document.getElementById('cqfOk');
  if (!ok) return null;
  let code = null, due = null;
  try {
    const { data } = await sb.rpc('client_complaints_list', { p_src: 'logged', p_limit: 1, p_offset: 0, p_id: id });
    const r = data && data.rows && data.rows[0]; code = r && r.code; due = r && r.reply_due;
  } catch (e) { /* the list below shows it */ }
  if (!due && info.complaintDate) due = cqPlusDays(info.complaintDate, 2);
  const me = (cqMeName || '').toLowerCase(), owner = info.owner || '';
  const who = owner && me && owner.toLowerCase() === me ? 'you' : (owner || 'not set');
  const first = String(info.client || '').trim().split(/\s+/)[0] || 'her';
  const head = info.resolved ? 'Logged as resolved.' : `Logged. Reply to ${first} by ${due ? cqShortDay(due) : 'the end of day 2'}. Owner: ${who}.`;
  ok.innerHTML = `<div class="cmp-ok"><b>${cmpE(head)}</b>${code ? `<span class="cq-code">${cmpE(code)} <button type="button" data-copy="${cmpE(code)}">Copy</button></span>` : ''}${id ? `<a class="cq-link" href="/hub/complaint?cid=${id}" target="_blank" rel="noopener">Open the complaint page</a>` : ''}</div>`
    + (info.extra ? `<p class="cq-note" style="margin:0 0 10px">${cmpE(info.extra.trim())}</p>` : '');
  return code;
}

function cqSyncDates() {
  const a = document.getElementById('cqfDate'), c = document.getElementById('cqfCDate');
  if (a && c) { c.min = a.value || ''; if (a.value && c.value && c.value < a.value) c.value = a.value; }
}
function cqWireDup() {
  [['cqfClient', 'input'], ['cqfPhone', 'input'], ['cqfBranch', 'change'], ['cqfDate', 'change']].forEach(([id, ev]) => {
    const el = document.getElementById(id);
    if (el && !el.dataset.dw) { el.dataset.dw = '1'; el.addEventListener(ev, cqDupSoon); }
  });
  const a = document.getElementById('cqfDate');
  if (a && !a.dataset.ds) { a.dataset.ds = '1'; a.addEventListener('change', cqSyncDates); }
}
function cqDupSoon() { clearTimeout(cqDupTimer); cqDupTimer = setTimeout(cqCheckDup, 450); }
async function cqCheckDup() {
  const box = document.getElementById('cqfDup');
  if (!box) return;
  const val = id => ((document.getElementById(id) || {}).value || '').trim();
  const name = val('cqfClient'), phone = val('cqfPhone');
  if (name.length < 3 && phone.replace(/\D/g, '').length < 9) { box.hidden = true; return; }
  const seq = ++cqDupSeq;
  try {
    const { data, error } = await sb.rpc('client_complaint_dupes', { p_name: name, p_branch: val('cqfBranch'), p_date: val('cqfDate') || null, p_phone: phone || null });
    if (error || seq !== cqDupSeq) return;
    const rows = data || [], exact = rows.some(r => r.exact), byPhone = rows.some(r => r.by_phone);
    if (!rows.length) { box.hidden = true; return; }
    box.className = 'cq-dup' + (exact ? ' hard' : '');
    box.innerHTML = `<b>${exact ? 'This one is already on file, so it cannot be logged again.' : byPhone ? 'Check before you log: this mobile number or client already has a complaint on file.' : 'Check before you log: this client already has a complaint on file.'}</b>`
      + `<ul>${rows.map(r => `<li>${cqEsc(r.text)}${r.by_phone ? ', same mobile number' : ''}${r.holder ? ', ' + cqEsc(r.holder) : ''}${r.code ? ` <span class="cq-code">${cqEsc(r.code)} <button type="button" data-copy="${cqEsc(r.code)}">Copy</button></span>` : ''}</li>`).join('')}</ul>`
      + `<div class="cq-note" style="margin:4px 0 0">${exact ? 'Find it in Logged complaints below and add a follow-up there.' : 'If it is the same complaint, open it and add a follow-up (or log this one and use Link as duplicate on it). If it is a new one, go ahead and log it.'}</div>`;
    box.hidden = false;
  } catch (e) { /* the server checks again on submit */ }
}

// The outcomes the form offers. A colour complaint cannot be closed until she has come back (Belle's rule, 26 Oct 2026), so for that kind they are not offered at all.
function cqResOpts(type) {
  return ['<option value="">Not resolved yet (keep it open)</option>'].concat(Object.keys(CQ_RES)
    .filter(k => k !== 'unclear' && k !== 'open' && !(type === 'colour_result' && CQ_NEEDS_REVISIT.includes(k)))
    .map(k => `<option value="${k}">${cqEsc(CQ_RES[k])}</option>`)).join('');
}
function cqKindChanged() {
  const t = cmpVal('cqfType'), sel = document.getElementById('cqfRes'), note = document.getElementById('cqlColour');
  if (sel) { const keep = sel.value; sel.innerHTML = cqResOpts(t); if ([...sel.options].some(o => o.value === keep)) sel.value = keep; }
  if (note) note.hidden = t !== 'colour_result';
}

function cqForm() {
  const picked = cqPicked();
  const brs = [['SAA', 'Saadiyat'], ['KCA', 'Khalifa City A'], ['MC', 'Motor City'], ['AQ', 'Al Quoz'], ['BAH', 'Bahrain']];
  const bopts = ['<option value="">Pick the branch</option>'].concat(brs.map(([k, l]) => `<option value="${k}"${picked.length === 1 && picked[0] === k ? ' selected' : ''}>${l}</option>`)).join('');
  const topts = ['<option value="">Pick one</option>'].concat(Object.keys(CQ_TYPE).filter(k => k !== 'unclear' && k !== 'repeat_complainer').map(k => `<option value="${k}">${cqEsc(CQ_TYPE[k])}</option>`)).join('');
  const ropts = cqResOpts('');
  const today = cqToday();
  const req = '<em class="cq-req">required</em>';
  // Minimisable (Kate, 22 Oct 2026): open the first time, then it stays as it was left in this browser. A door or a link that opens or folds it does not change what is remembered.
  let closed = false; try { closed = localStorage.getItem('trs-cq-form') === 'closed'; } catch (e) {}
  return `<details class="cq-card" id="cq-new"${closed ? '' : ' open'} ontoggle="try{if(!this.dataset.door)localStorage.setItem('trs-cq-form',this.open?'open':'closed');delete this.dataset.door}catch(e){}"><summary>Log a complaint</summary>
    <p class="cq-note" style="margin-top:6px">For a complaint a client made that is not in the Phorest notes yet. It is counted with the rest and marked as logged by staff, under your name. Three short steps; the fields marked required are the ones it needs.</p>
    ${cmpCssTag()}
    <div class="cmp-split" id="cmpSplit">
    <div class="cmp-f">
    <section class="cql-step">
      <h3><i>1</i>Who she is</h3>
      <p class="cql-lead">Search Logged complaints below for her name or mobile number first. If she is already there, open it and add a follow-up instead.</p>
      <div class="cq-form">
        <label><span class="cql-l">Client's full name ${req}</span><input id="cqfClient" class="cq-in" maxlength="80" autocomplete="off"></label>
        <label><span class="cql-l">Mobile number ${req}</span><input id="cqfPhone" class="cq-in" type="tel" inputmode="tel" maxlength="24" autocomplete="off" placeholder="05x xxx xxxx or +971 …"></label>
        <label><span class="cql-l">Branch ${req}</span><select id="cqfBranch" class="cq-sel">${bopts}</select></label>
      </div>
      <div id="cqfDup" class="cq-dup" hidden></div>
    </section>
    <section class="cql-step">
      <h3><i>2</i>What happened</h3>
      <div class="cq-form">
        <label><span class="cql-l">Date of the appointment ${req}</span><input id="cqfDate" class="cq-in" type="date" max="${today}"></label>
        <label><span class="cql-l">Date she complained ${req}</span><input id="cqfCDate" class="cq-in" type="date" max="${today}" value="${today}"></label>
        <label><span class="cql-l">What it was about ${req}</span><select id="cqfType" class="cq-sel">${topts}</select></label>
        <div class="wide cql-here" id="cmpHere" aria-live="polite"></div>
        <div class="wide cq-note" id="cqlColour" hidden style="margin:0">A colour complaint stays open until she has come back and agreed.</div>
        <label class="wide"><span class="cql-l">What happened ${req}</span><textarea id="cqfDetail" rows="3" maxlength="4000" placeholder="One or two sentences, in your own words"></textarea></label>
      </div>
    </section>
    <section class="cql-step">
      <h3><i>3</i>Who takes it from here</h3>
      <div class="cq-form">
        <label class="wide"><span class="cql-l">Who will reply to her? ${req}</span><span class="cql-inline"><input id="cqfResp" class="cq-in" maxlength="80" list="cqRespList" autocomplete="off" placeholder="A name"><button type="button" class="cq-btn" id="cqfMe">Me</button></span></label>
        ${cmpWho()}
      </div>
    </section>
    <details class="cql-fold"><summary>Add more detail <small>all optional</small></summary>
      <div class="cq-form">
        <label><span class="cql-l">Stylist</span><input id="cqfStylist" class="cq-in" maxlength="80" autocomplete="off"></label>
        <label><span class="cql-l">Service</span><input id="cqfService" class="cq-in" maxlength="120" autocomplete="off"></label>
        <label><span class="cql-l">Google review link, if she posted one</span><input id="cqfG" class="cq-in" type="url" placeholder="https://" autocomplete="off"></label>
        <label class="wide"><span class="cql-l">Screenshots of the conversation or photos (up to 10 files of 10 MB)</span><input id="cqfFiles" type="file" multiple accept="image/*,application/pdf,.txt"></label>
        <label><span class="cql-l">Already sorted? How it was resolved</span><select id="cqfRes" class="cq-sel">${ropts}</select></label>
        <label><span class="cql-l">How it ended, in a few words</span><input id="cqfResD" class="cq-in" maxlength="300" autocomplete="off"></label>
        <label><span class="cql-l">Handled by</span><input id="cqfBy" class="cq-in" maxlength="80" autocomplete="off"></label>
      </div>
    </details>
    </div>
    <aside class="cmp-s"><div class="cmp-side" id="cmpSide" aria-live="polite"></div></aside>
    <div class="cmp-b"><div class="cq-bar"><button type="button" id="cqfGo" class="cq-btn pri">Log this complaint</button><span id="cqfMsg" class="cq-msg" aria-live="polite"></span></div>
    <div id="cqfOk" aria-live="polite"></div></div>
    </div>
    <div id="cmpUrgent" hidden></div>
  </details>`;
}

// A similar complaint is already on file: ask on the page, with two buttons, instead of the browser's own box. Resolves true when it is the same complaint.
function cqAskSimilar(lines) {
  const box = document.getElementById('cqfOk');
  return new Promise(resolve => {
    if (!box) { resolve(false); return; }
    box.innerHTML = `<div class="cq-dup cql-ask" role="group" aria-label="Is it the same complaint?"><b>This client already has a complaint on file. Is it the same one?</b>
      <ul>${lines.map(l => `<li>${cqEsc(l)}</li>`).join('')}</ul>
      <div class="cq-bar"><button type="button" class="cq-btn" data-ask="same">Yes, same one. I will add a follow-up there</button><button type="button" class="cq-btn pri" data-ask="new">No, a new one. Log it</button></div></div>`;
    const done = v => { box.innerHTML = ''; resolve(v); };
    box.querySelector('[data-ask="same"]').addEventListener('click', () => done(true));
    box.querySelector('[data-ask="new"]').addEventListener('click', () => done(false));
    box.querySelector('[data-ask="same"]').focus();
  });
}

async function cqSubmit() {
  const v = id => (document.getElementById(id) || {}).value || '';
  const msg = document.getElementById('cqfMsg'), btn = document.getElementById('cqfGo');
  const say = (t, err) => { if (msg) { msg.textContent = t; msg.className = 'cq-msg' + (err ? ' err' : ''); } };
  const p = {
    p_client: v('cqfClient').trim(), p_branch: v('cqfBranch'), p_date: v('cqfDate') || null, p_stylist: v('cqfStylist').trim(), p_service: v('cqfService').trim(),
    p_type: v('cqfType'), p_detail: v('cqfDetail').trim(), p_resolution: v('cqfRes'), p_resolution_detail: v('cqfResD').trim(), p_handled_by: v('cqfBy').trim(),
    p_google_url: v('cqfG').trim(), p_phone: v('cqfPhone').trim(), p_complaint_date: v('cqfCDate') || null, p_responsible: v('cqfResp').trim()
  };
  const files = Array.from((document.getElementById('cqfFiles') || {}).files || []);
  const today = cqToday();
  if (p.p_client.length < 3) return say('Write the client\'s full name.', true);
  if (!(p.p_phone.replace(/\D/g, '').length >= 7 && p.p_phone.replace(/\D/g, '').length <= 15)) return say('Write the client\'s mobile number (7 to 15 digits).', true);
  if (!p.p_branch) return say('Pick the branch.', true);
  if (!p.p_date) return say('Pick the date of the appointment.', true);
  if (!p.p_complaint_date) return say('Pick the date she complained.', true);
  if (p.p_complaint_date < p.p_date || p.p_complaint_date > today) return say('The date she complained cannot be before the appointment or in the future.', true);
  if (!p.p_type) return say('Pick what the complaint was about.', true);
  if (p.p_detail.length < 10) return say('Write what happened, a sentence will do.', true);
  if (p.p_responsible.length < 2) return say('Write who will reply to her. Tap Me if it is you.', true);
  if (p.p_google_url && !/^https?:\/\//i.test(p.p_google_url)) { const f = document.querySelector('.cql-fold'); if (f) f.open = true; return say('The Google link must start with http.', true); }
  if (p.p_type === 'colour_result' && CQ_NEEDS_REVISIT.includes(p.p_resolution)) return say('A colour complaint stays open until she has come back and agreed. Add the revisit when she returns.', true);
  if (files.length > 10) return say('Add up to 10 files.', true);
  if (btn) btn.disabled = true;
  say('Saving…');
  try {
    let force = false, newId = null;
    for (;;) {
      const { data, error } = await sb.rpc('client_complaint_submit', { ...p, p_force: force });
      if (!error) { newId = data; break; }
      const m = String(error.message || '');
      if (!force && m.startsWith('SIMILAR:')) {
        say('One question first, below.');
        const same = await cqAskSimilar(m.replace(/^SIMILAR:\s*/, '').split('; '));
        if (same) { say('Not logged. Open the one on file and add a follow-up there.'); return; }
        force = true;
        continue;
      }
      throw error;
    }
    let upMsg = '';
    const peopleMsg = newId ? await cmpSavePeople(Number(newId)) : '';
    if (files.length && newId) {
      say('Logged. Uploading the files…');
      const r = await cqUpload(Number(newId), files);
      upMsg = r.fails.length ? ` ${r.ok} file${r.ok === 1 ? '' : 's'} added. Not added: ${r.fails.join('; ')}. Open the complaint page to add them again.` : '';   // said only when something needs doing
    }
    const dupBox = document.getElementById('cqfDup'); if (dupBox) dupBox.hidden = true;
    ['cqfClient', 'cqfPhone', 'cqfStylist', 'cqfService', 'cqfDetail', 'cqfResp', 'cqfResD', 'cqfBy', 'cqfG', 'cqfDate', 'cqfFiles'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const cd = document.getElementById('cqfCDate'); if (cd) { cd.value = today; cd.min = ''; }
    ['cqfType', 'cqfRes'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    cqKindChanged(); cqFillMe(false);
    const doneExtra = (upMsg + (peopleMsg ? ' ' + peopleMsg : '')).trim();
    say('Logged.', false);
    const newCode = await cmpDone(Number(newId), { client: p.p_client, owner: p.p_responsible, complaintDate: p.p_complaint_date, resolved: !!p.p_resolution, extra: doneExtra });
    if (p.p_type === 'skin_reaction_or_injury') cmpUrgentShow(Number(newId), newCode);
    CMPF.people = []; CMPF.names = []; CMPF.cc = []; CMPF.roles = { Reception: false, Beautician: false }; CMPF.stylistOn = true; cmpDrawInv(); cmpDrawCc(); cmpDrawSide();
    CQ.page = 0; CQ.sort = 'priority'; CQ.dir = 'asc'; cqOpen = 0;
    cqLoadSummary(); cqLoadList(); cqLoadFlags();
  } catch (e) {
    console.error(e);
    const m = (e && e.message) ? String(e.message).replace(/^DUPLICATE:\s*/, 'Already logged: ') : 'It did not save. Try again.';
    say(m, true);
  } finally { if (btn) btn.disabled = false; }
}


// ── LOG A COMPLAINT (Kate, 22 Oct 2026: "add the client complaints submission under client complaints section", not in the same mini side nav) ──
// Its own page in the Clients group: the form, and the complaints logged from it, to follow up and close. Same list, filters, follow-up and
// Remove as Client Complaints (list source 'logged' = only the ones logged from the form), so the ids are shared and only one page is drawn at a time.
function cqLogShell() {
  return cqCss() + cqLogCss() + `<div class="cq">
    <h1>Log a Client Complaint</h1>
    <div class="cql-why">
      <p>We log a complaint here so it is written down once and not lost in a WhatsApp chat. A client who hears nothing for 2 days is the one who writes the review. If nobody replies, she is still waiting, and the complaint turns red and goes up to the next person on the list.</p>
    </div>
    <div class="cql-doors" role="group" aria-label="What do you need to do?">
      <button type="button" class="cql-door" data-door="log"><b>A client just complained</b><span>Log it in three short steps</span></button>
      <button type="button" class="cql-door" data-door="chase" id="cqlChase"><b>Chase the ones waiting</b><span id="cqlChaseN">See what is overdue</span></button>
    </div>
    <p class="cql-more" id="cmpLinks"><span>Or open</span> <a class="cql-pill" href="/hub/complaint">My complaints</a></p>
    <p class="cq-sub" style="margin:0 0 14px">Levels 3 and up. Everything logged here also counts in Client Complaints.</p>
    ${cqRailShell(`<div class="cq-tiles" id="cqFlags" aria-live="polite"></div>
    <p class="cq-note" style="margin:-6px 0 14px">These counts follow the Branch above and cover every period. The list below follows Period and Branch.</p>
    <datalist id="cqRespList"><option value="Emma W"><option value="Ashleigh"><option value="Mette"><option value="Coach Emma"><option value="Mona"><option value="Kate"></datalist>
    ${cqForm()}
    <div class="cq-card cq-wait" id="cq-list">
      <h2>Logged complaints</h2>
      <p class="cq-note">Tap one to open its complaint page in a new tab: the follow-up, how it ended and reopening are there.</p>
      <div class="cq-bar cq-filt">
        <input id="cqQ" class="cq-in" type="search" inputmode="search" autocomplete="off" placeholder="Name, mobile number, code (CMP-SAA-20261029-01), stylist or words in the note" aria-label="Search complaints" value="${cqEsc(CQ.q)}">
        <button type="button" id="cqFtog" class="cq-btn cq-ftog" aria-expanded="false">Filters</button>
        <div class="cq-fsel">
        <select id="cqSt" class="cq-sel" aria-label="Status"><option value="all">Status: any</option><option value="open">Still open</option><option value="overdue">Overdue</option><option value="pending">Pending action</option><option value="resolved">Resolved</option></select>
        </div>
      </div>
      <div class="cq-metarow"><p class="cq-meta" id="cqMeta" aria-live="polite"></p><span class="cq-sheetwrap"><span id="cqSheetMsg" class="cq-meta" aria-live="polite"></span><button type="button" id="cqSheet" class="cq-btn">Open in Google Sheets</button></span></div>
      <div id="cqBody" style="overflow-x:auto"><p class="cq-meta">Loading…</p></div>
    </div>`, [['cq-new', 'Log a complaint'], ['cq-list', 'Logged complaints']])}
  </div>`;
}

// The two doors: log it opens the form, chase it folds the form and shows what is overdue. Neither changes what the form remembers.
function cqLogDoor(which) {
  const d = document.getElementById('cq-new');
  const move = (el, open) => { if (el && el.open !== open) { el.dataset.door = '1'; el.open = open; } };
  if (which === 'log') {
    move(d, true);
    if (d) d.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const f = document.getElementById('cqfClient'); if (f) setTimeout(() => f.focus({ preventScroll: true }), 350);
    return;
  }
  move(d, false);
  const od = Number((document.getElementById('cqlChase') || {}).dataset.n || 0);
  if (od > 0) {
    CQ.status = 'overdue';
    const sel = document.getElementById('cqSt'); if (sel) sel.value = 'overdue';
    CQ.page = 0; cqOpen = 0; cqLoadList(); cqLoadFlags();
  }
  const l = document.getElementById('cq-list'); if (l) l.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderComplaintLog() {
  const el = document.getElementById('complaintlogContent');
  if (!el) return;
  if (!cqLevelOk('complaintlog')) { el.innerHTML = '<div class="cq"><p class="cq-meta" style="padding:20px 0">Log a Client Complaint is for Levels 3 and up.</p></div>'; return; }
  const other = document.getElementById('complaintsContent'); if (other) other.innerHTML = '';
  cqMode = 'log';
  CQ.page = 0; cqOpen = 0; CQ.sort = 'priority'; CQ.dir = 'asc';
  el.innerHTML = cqLogShell();
  cqWire();
  cmpFormInit();
  cmpLinks();
  el.querySelectorAll('[data-door]').forEach(b => b.addEventListener('click', () => cqLogDoor(b.dataset.door)));
  // a link that carries #cq-new (or ?open=new) lands on an open form, not on a folded summary line
  try { if (/(^|[#&])cq-new/.test(location.hash) || new URLSearchParams(location.search).get('open') === 'new') setTimeout(() => cqLogDoor('log'), 60); } catch (e) {}
  const fl = document.getElementById('cqFlags');
  if (fl) fl.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-flt]');
    if (!b) return;
    CQ.status = CQ.status === b.dataset.flt ? 'all' : b.dataset.flt;
    const sel = document.getElementById('cqSt'); if (sel) sel.value = CQ.status;
    CQ.page = 0; cqOpen = 0; cqLoadList(); cqLoadFlags();
  });
  cqLoadList();
  cqLoadFlags();
  cqAllTime();
}

// The strip at the top (Belle, 26 Oct 2026): what is overdue, what is pending, what is still waiting for a first reply. Tap Overdue, Pending or Resolved to
// show only those. Counts every logged complaint in the Branch picked above, whatever the Period.
async function cqLoadFlags() {
  const box = document.getElementById('cqFlags');
  if (!box) return;
  try {
    const { data, error } = await sb.rpc('client_complaint_flags', { p_branch: cqBranch() });
    if (error) throw error;
    const t = (k, label, n, cls) => `<button type="button" class="cq-tile btn ${cls}" data-flt="${k}" aria-pressed="${CQ.status === k}"><b>${cqNum(n)}</b><span>${label}</span></button>`;
    const door = document.getElementById('cqlChase'), doorN = document.getElementById('cqlChaseN');
    if (door && doorN) {
      door.dataset.n = Number(data.overdue || 0); door.classList.toggle('over', Number(data.overdue || 0) > 0);
      doorN.textContent = Number(data.overdue || 0) > 0 ? `${cqNum(data.overdue)} overdue, ${cqNum(data.pending)} pending` : (Number(data.pending || 0) > 0 ? `Nothing overdue, ${cqNum(data.pending)} pending` : 'Nothing overdue');
    }
    box.innerHTML = t('overdue', 'Overdue: no reply in 2 days, or not closed in 7', data.overdue, 'over')
      + t('pending', 'Pending action: open, inside both limits', data.pending, 'pend')
      + `<div class="cq-tile"><b>${cqNum(data.unreplied)}</b><span>Still waiting for a first reply</span></div>`
      + t('resolved', 'Resolved', data.resolved, '');
  } catch (e) { console.error(e); box.innerHTML = ''; }
}

// The masthead's Branch or Period changed while this page is open (dashboard.js NOPULSE_REDRAW).
function cqRefreshLog() {
  if (!document.getElementById('cqBody') || cqMode !== 'log') return renderComplaintLog();
  CQ.page = 0; cqOpen = 0;
  cqLoadFlags();
  return cqLoadList();
}
