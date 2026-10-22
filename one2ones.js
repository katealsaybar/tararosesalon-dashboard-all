// 1-to-1s & Goals (Kate, 22 Oct 2026): who has had a 1-to-1, whose goals are set, at a glance. Numbers > Team Performance, Level 3 and 5.
//
// One call (migrations/perf_one2one_list.sql): perf_one2one_list(p_admin), statuses and dates only, never what was written. It answers
// leaders only (Emma, Kate, Tara: perf_admins.role = 'leader', the gate perf_one2one_get already has), so anyone else on Level 3 gets null and a
// line that says so. "Open" goes to that person's own My Numbers page on the 1-to-1 tab, where the leader writes it up and signs it.
// The key is the Staff Benchmarks one (spfGet), the same as Staff's 13 Week. Nothing here is stored in the browser except the filters.
const O2_STORE = 'trs-one2ones';
const O2 = { branch: 'all', team: 'all', need: false, sort: 'name', dir: 1 };
try {
  const s = JSON.parse(localStorage.getItem(O2_STORE) || '{}');
  if (typeof s.branch === 'string') O2.branch = s.branch;
  if (typeof s.team === 'string') O2.team = s.team;
  if (typeof s.need === 'boolean') O2.need = s.need;
} catch (e) {}
const o2Save = () => { try { localStorage.setItem(O2_STORE, JSON.stringify({ branch: O2.branch, team: O2.team, need: O2.need })); } catch (e) {} };
let o2Data = null, o2Msg = '', o2Seq = 0;

const o2Esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const o2Day = iso => {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};
const o2Mon = iso => (iso ? new Date(String(iso).slice(0, 10) + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }) : '');
const O2_LAB = { signed: 'Signed', filed: 'Filed', draft: 'Draft', sent: 'Staff sent', none: 'None yet' };
// A record's status as one of: none, draft, sent (the staff member has sent their part), signed (signed or filed).
function o2State(rec) {
  if (!rec) return 'none';
  const s = String(rec.status || '');
  if (s === 'signed' || s === 'filed') return 'signed';
  if (s === 'submitted' || s === 'sent') return 'sent';
  return 'draft';
}
const o2Done = rec => o2State(rec) === 'signed';
const o2Rank = rec => ({ none: 0, sent: 1, draft: 2, signed: 3 }[o2State(rec)]);
function o2Chip(rec, month) {
  const st = o2State(rec);
  const label = st === 'signed' && rec.status === 'filed' ? O2_LAB.filed : O2_LAB[st];
  const when = rec ? o2Day(rec.signed_at || rec.submitted_at || rec.updated_at) : '';
  const old = rec && month && rec.period && String(rec.period).slice(0, 7) !== String(month).slice(0, 7) ? ' · ' + o2Mon(rec.period) : '';
  return `<span class="o2-chip ${st}">${label}</span>${when ? `<span class="o2-dt">${o2Esc(when + old)}</span>` : ''}`;
}
const o2Staff = () => (o2Data && o2Data.staff) || [];
const o2Needs = (p, month) => !(o2Done(p.monthly) && String(p.monthly.period).slice(0, 7) === String(month).slice(0, 7)) || !o2Done(p.goals);

function o2List() {
  const month = o2Data.month;
  const l = o2Staff().filter(p => (O2.branch === 'all' || p.branch === O2.branch) && (O2.team === 'all' || p.dept === O2.team) && (!O2.need || o2Needs(p, month)));
  l.sort((a, b) => {
    const r = O2.sort === 'name' ? String(a.name).localeCompare(String(b.name)) : O2.sort === 'oto' ? o2Rank(a.monthly) - o2Rank(b.monthly) : o2Rank(a.goals) - o2Rank(b.goals);
    return r * O2.dir || String(a.name).localeCompare(String(b.name));
  });
  return l;
}
const o2Pills = (key, vals, label) => `<span class="o2-pills"><span class="o2-k">${label}</span>${vals.map(([v, t]) =>
  `<button type="button" class="o2-pill" data-${key}="${o2Esc(v)}" aria-pressed="${O2[key] === v}">${o2Esc(t)}</button>`).join('')}</span>`;
const o2Link = p => `/performance/?s=${encodeURIComponent(p.slug)}&tab=one`;

function o2Draw() {
  const host = document.getElementById('one2onesContent');
  if (!host) return;
  const head = `<div class="o2-head"><h2>1-to-1s &amp; Goals</h2><p>Who has had a 1-to-1, and whose goals are set. Open a name to write it up or read what was agreed.</p></div>`;
  if (!o2Data) { host.innerHTML = head + `<p class="o2-empty">${o2Esc(o2Msg || 'Loading…')}</p>`; return; }
  const all = o2Staff(), month = o2Data.month, year = String(o2Data.year || '').slice(0, 4);
  const n = f => all.filter(f).length;
  const tiles = [
    ['Signed this month', n(p => o2Done(p.monthly) && String(p.monthly.period).slice(0, 7) === String(month).slice(0, 7)), '1-to-1s written up and signed'],
    ['Drafts', n(p => o2State(p.monthly) === 'draft' || o2State(p.goals) === 'draft'), 'started, not signed yet'],
    ['Staff have sent', n(p => !!p.prep || o2State(p.goals) === 'sent' || o2State(p.monthly) === 'sent'), 'their part, waiting for you'],
    ['No 1-to-1 yet', n(p => !p.monthly), 'nothing written up'],
    ['Goals set', `${n(p => o2Done(p.goals))} of ${all.length}`, `signed for ${year}`]
  ];
  const branches = [...new Set(all.map(p => p.branch).filter(Boolean))];
  const teams = [...new Set(all.map(p => p.dept).filter(Boolean))];
  const l = o2List();
  const rows = l.map(p => `<tr><td class="o2-nm"><b>${o2Esc(p.name)}</b><span>${o2Esc(p.branch || '')} · ${o2Esc(p.level || (p.dept ? p.dept + ' team' : ''))}</span></td>
    <td>${o2Chip(p.monthly, month)}</td>
    <td>${p.prep ? `<span class="o2-chip sent">Sent</span><span class="o2-dt">${o2Esc(o2Day(p.prep.submitted_at))}</span>` : '<span class="o2-dt">·</span>'}</td>
    <td>${o2Chip(p.goals, month)}</td>
    <td><a class="o2-open" href="${o2Link(p)}" target="_blank" rel="noopener">Open</a></td></tr>`).join('');
  const cards = l.map(p => `<div class="o2-row"><div class="o2-nm"><b>${o2Esc(p.name)}</b><span>${o2Esc(p.branch || '')} · ${o2Esc(p.level || (p.dept ? p.dept + ' team' : ''))}</span></div>
    <div class="o2-two"><div><div class="o2-lab">1-to-1</div>${o2Chip(p.monthly, month)}</div><div><div class="o2-lab">Goals ${o2Esc(year)}</div>${o2Chip(p.goals, month)}</div></div>
    <div><a class="o2-open" href="${o2Link(p)}" target="_blank" rel="noopener">Open</a></div></div>`).join('');
  host.innerHTML = head +
    `<div class="o2-tiles">${tiles.map(t => `<div class="o2-tile"><div class="o2-l">${t[0]}</div><div class="o2-v">${t[1]}</div><div class="o2-h">${t[2]}</div></div>`).join('')}</div>` +
    `<div class="o2-bar">${o2Pills('branch', [['all', 'All'], ...branches.map(b => [b, b])], 'Branch')}${o2Pills('team', [['all', 'All'], ...teams.map(t => [t, t])], 'Team')}
      <span class="o2-pills"><button type="button" class="o2-pill" data-need="1" aria-pressed="${O2.need}">Needs attention</button></span></div>` +
    (l.length ? `<div class="o2-card"><table><thead><tr><th><button type="button" data-sort="name">Name</button></th><th><button type="button" data-sort="oto">1-to-1</button></th><th>Their part</th><th><button type="button" data-sort="goals">Goals ${o2Esc(year)}</button></th><th></th></tr></thead><tbody>${rows}</tbody></table><div class="o2-cards">${cards}</div></div>`
      : '<p class="o2-empty">Nobody matches those filters.</p>') +
    `<p class="o2-foot">${l.length} of ${all.length} people. Only staff whose 1-to-1 is switched on are listed. Emma, Tara and Kate only: the list asks for the leader key.</p>`;
}

async function renderOne2Ones() {
  const host = document.getElementById('one2onesContent');
  if (!host) return;
  if (!host.dataset.wired) {
    host.dataset.wired = '1';
    host.addEventListener('click', e => {
      const b = e.target.closest('[data-branch],[data-team],[data-need],[data-sort]');
      if (!b || !o2Data) return;
      if (b.dataset.branch) O2.branch = b.dataset.branch;
      else if (b.dataset.team) O2.team = b.dataset.team;
      else if (b.dataset.need) O2.need = !O2.need;
      else if (b.dataset.sort) { if (O2.sort === b.dataset.sort) O2.dir = -O2.dir; else { O2.sort = b.dataset.sort; O2.dir = 1; } }
      o2Save(); o2Draw();
    });
  }
  const seq = ++o2Seq;
  if (!o2Data) { o2Msg = 'Loading…'; o2Draw(); }
  // The key arrives a moment after sign-in for a direct link: wait a few seconds for it.
  let key = null;
  for (let i = 0; i < 24 && !key; i++) {
    key = typeof spfGet === 'function' ? spfGet() : null;
    if (!key) await new Promise(r => setTimeout(r, 250));
  }
  if (seq !== o2Seq) return;
  if (!key) { o2Data = null; o2Msg = 'This list is for Emma, Tara and Kate. It needs the leader key from your sign-in.'; o2Draw(); return; }
  const { data, error } = await sb.rpc('perf_one2one_list', { p_admin: key });
  if (seq !== o2Seq) return;
  if (error) { o2Data = null; o2Msg = 'The list did not load. Refresh to try again.'; o2Draw(); return; }
  if (!data) { o2Data = null; o2Msg = 'This list is for Emma, Tara and Kate. It needs the leader key from your sign-in.'; o2Draw(); return; }
  o2Data = data; o2Draw();
}
