// Deposit Checking (Kate, 17 Nov 2026): every deposit a client paid that has not been taken off a bill yet, per salon. Its own page, in Tools > Operations, next to Stripe vs Phorest.
// Built from the local mockup docs/mockups/open-deposits.html in the cowork repo. One function (migrations/open_deposits_17nov.sql): open_deposits() reads open_deposits_cache,
// worked out hourly from the Phorest sales lines (a 'Deposit' line is a deposit; it counts as taken off when a later bill of the same client at the same salon carries an A(...) tender).
// CANDIDATES, not proof. The next appointment (and what she is booked for) is the earliest booking in client_bookings (the Phorest diary, read each morning), matched by client name.
// Kate's rulings applied: the header's Branch and Period drive it (the Period is read against the deposit's paid date), every column header has the Google Sheets filter menu,
// dates are DD MMM YYYY, 10px side margins on a phone, dark mode. Phone and email beside the client and the Client Book link are Level 5 only (the Top Clients rule).
// Needs from dashboard.js (shared script scope): sb, sel, dateFrom, dateTo, dateToIso, TRS_LEVEL. Nothing is written to Phorest or Stripe.
const DPC_BR = { KCA: 'Khalifa City A', AQ: 'Al Quoz', SAA: 'Saadiyat', MC: 'Motor City' };
const DPC_ORDER = ['KCA', 'AQ', 'SAA', 'MC'];
const dpcEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dpcWD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], dpcMO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dpcFd = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); if (!m) return ''; const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); return `${dpcWD[d.getUTCDay()]} ${+m[3]} ${dpcMO[+m[2] - 1]}`; };
const dpcFull = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${+m[3]} ${dpcMO[+m[2] - 1]} ${m[1]}` : ''; };
const dpcTime = iso => { try { return new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Asia/Dubai', hour: '2-digit', minute: '2-digit', hour12: false }); } catch (e) { return ''; } };
const dpcM2 = v => (+v || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dpcM0 = v => (+v || 0).toLocaleString('en-GB', { minimumFractionDigits: (+v || 0) % 1 ? 2 : 0, maximumFractionDigits: 2 });
const dpcSg = v => v === 0 ? '0.00' : (v > 0 ? '+' : '-') + dpcM2(Math.abs(v));
const dpcR2 = v => Math.round((+v || 0) * 100) / 100;
const dpcSum = list => dpcR2(list.reduce((t, r) => t + r.amt, 0));
const dpcName = c => DPC_BR[c] || c;
const dpcFirst = n => String(n || '').trim().split(/\s+/)[0] || 'the client';

function dpcCodes() {   // the salons picked in the header; the four when All (Bahrain has no Stripe account here)
  if (typeof sel === 'undefined' || !sel.branch || sel.branch.includes('all')) return DPC_ORDER.slice();
  const c = sel.branch.filter(b => DPC_ORDER.includes(b));
  return c.length ? c : DPC_ORDER.slice();
}

const dpcBookOk = () => typeof TRS_LEVEL !== 'undefined' && TRS_LEVEL >= 5;   // the Client Book is a Level 5 page

const OPD = { status: 'all', q: '', shown: 30, f: {}, sort: null, open: null };
const OPD_NAME = { came: 'Came back, not deducted', part: 'Part used', old: 'No visit, nothing booked', wait: 'Waiting', small: 'Under AED 50' };
const OPD_CLS = { came: 'notco', part: 'nostripe', old: 'wrong', wait: 'waiting', small: 'waiting' };   // reuse the Stripe tab's badge and dot colours
const OPD_RANK = { came: 0, part: 1, old: 2, wait: 3, small: 4 };
let opdData = null, opdRows = [], opdLoading = null, opdCtState = '';   // opdCtState: '' not asked, 'busy', 'done'

function opdStatus(r, todayIso) {
  const age = Math.round((Date.parse(todayIso) - Date.parse(r.l)) / 864e5);
  r.age = age;
  if (r.a < 50) return 'small';
  if (r.v && !(r.u > 0)) return 'came';
  if (r.u > 0) return 'part';
  return age > 14 && !r.na ? 'old' : 'wait';   // an appointment booked in Phorest means she is just waiting for it
}
function opdBuild(d) {
  const today = dateToIso(new Date());
  return (d.rows || []).map(x => { const r = { b: x.b, id: x.id, c: x.n || 'No name', f: x.f, l: x.l, a: +x.a || 0, u: +x.u || 0, v: x.v || null, na: x.na || null, ns: x.ns || '', nst: x.nst || '' }; r.o = dpcR2(r.a - r.u); r.s = opdStatus(r, today); return r; })
    .sort((x, y) => OPD_RANK[x.s] - OPD_RANK[y.s] || (x.l > y.l ? 1 : x.l < y.l ? -1 : 0));
}
function opdNeedCount() { const c = dpcCodes(); return opdRows.filter(r => c.includes(r.b) && r.s !== 'wait' && r.s !== 'small').length; }
function opdLoad(force) {
  if (opdData && !force) return Promise.resolve(true);
  if (opdLoading) return opdLoading;
  opdLoading = (async () => {
    try {
      const { data, error } = await sb.rpc('open_deposits');
      if (error) throw error;
      if (!data || !data.ok) throw new Error('no report');
      opdData = data; opdRows = opdBuild(data); opdCtState = '';
      return true;
    } catch (e) { console.error(e); return e; } finally { opdLoading = null; }
  })();
  return opdLoading;
}
// Phone and email beside the client, at Level 5 only (the same rule and the same function as Top Clients: drill_client_contacts refuses anyone lower, as Client Book does).
// Asked once per load for every row; a client name shared by several Phorest profiles shows a note instead of a guess.
async function opdContacts() {
  if (typeof TRS_LEVEL === 'undefined' || TRS_LEVEL < 5 || !opdRows.length || opdCtState) return;
  opdCtState = 'busy';
  const rows = opdRows, today = dateToIso(new Date());
  try {
    const { data, error } = await sb.rpc('drill_client_contacts', { p_items: rows.map(r => [r.c, r.b, r.f, today]) });
    if (error) throw error;
    (data || []).forEach(x => { const r = rows[x.i]; if (r) { r._amb = !!x.a; r._ph = x.m || ''; r._em = x.e || ''; } });
    opdCtState = 'done';
  } catch (e) { opdCtState = 'done'; console.warn('contacts', e && e.message); }
  if (rows === opdRows) opdPaint();
}
function opdCtCell(r) {
  if (opdCtState !== 'done') return '<span class="spv-dim">Reading…</span>';
  if (r._amb) return '<span class="spv-dim">Several clients share this name. Open the Client Book.</span>';
  const ph = String(r._ph || '').split(' / ').filter(Boolean).map(x => `<a href="tel:${dpcEsc(x.replace(/[^\d+]/g, ''))}">${dpcEsc(x)}</a>`).join('<br>');
  const em = String(r._em || '').split(' / ').filter(Boolean).map(x => `<a href="mailto:${dpcEsc(x)}" title="${dpcEsc(x)}">${dpcEsc(x)}</a>`).join('<br>');
  return (ph || em) ? ph + (ph && em ? '<br>' : '') + em : '<span class="spv-dim">–</span>';
}

function opdRange() { const a = typeof dateFrom !== 'undefined' && dateFrom ? dateToIso(dateFrom) : '', b = typeof dateTo !== 'undefined' && dateTo ? dateToIso(dateTo) : ''; return [a, b]; }
const opdInPeriod = r => { const [a, b] = opdRange(); return (!a || r.l >= a) && (!b || r.l <= b); };
function opdBase() { const c = dpcCodes(); return opdRows.filter(r => c.includes(r.b) && opdInPeriod(r)); }
function opdAllPeriods() { const c = dpcCodes(); return opdRows.filter(r => c.includes(r.b)); }   // a search looks at every date (Kate, 17 Nov 2026: a client searched by name must not vanish because of the header's Period)
function opdOutside() { const c = dpcCodes(); return opdRows.filter(r => c.includes(r.b) && !opdInPeriod(r)); }

function opdTodo(r) {
  const f = dpcEsc(dpcFirst(r.c)), sal = dpcName(r.b);
  if (r.s === 'came') return `${f} came back on ${opdD(r.v)} and no deposit came off. Ask the ${sal} front desk whether ${f} paid twice. If so, refund ${f}.`;
  if (r.s === 'part') return `Part of the deposit came off, AED ${dpcM0(r.o)} is left. Check whether the rest is for a later visit.`;
  if (r.s === 'old') return `No visit for ${r.age} days and nothing booked in Phorest. Check: no-show (deposit kept), moved, or a refund owed.`;
  if (r.s === 'small') return 'Small amount, most likely a rounding or test line. Ignore unless the client says otherwise.';
  if (r.na) return `Booked for ${opdD(r.na)}. The deposit should come off at checkout. Nothing to do yet.`;
  return 'Nothing booked in Phorest yet, but it is early. Nothing to do yet.';
}
// Kate, 17 Nov 2026: every header row follows Google Sheets filtering (sort, filter by condition, filter by values, the same menu logic as drill.js), dates are DD MMM YYYY,
// and the header's Branch and Period drive the list (the Period is read against the deposit's paid date; deposits outside it are counted in a line under the list).
const OPD_PLAIN = h => String(h == null ? '' : h).replace(/<[^>]*>/g, '').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const opdD = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${m[3]} ${dpcMO[+m[2] - 1]} ${m[1]}` : ''; };
function opdCtText(r) {
  if (opdCtState !== 'done') return '';
  if (r._amb) return 'Several clients share this name';
  return [r._ph, r._em].filter(Boolean).join(' / ').replace(/ \/ /g, ' ').trim();
}
const DPC_W = { l: 118, b: 124, c: 170, ct: 210, a: 86, u: 86, age: 86, na: 150, ns: 280, s: 206, todo: 400 };   // column widths, so What to do is wide and the table scrolls sideways with the first column frozen
const opdBookText = r => r.na ? [r.ns, r.nst ? 'with ' + r.nst : ''].filter(Boolean).join(' · ') : '';
const OPD_COLS = [
  { k: 'l', l: 'Deposit paid', t: 'date', raw: r => r.l, disp: r => opdD(r.l) },
  { k: 'b', l: 'Salon', t: 'text', raw: r => dpcName(r.b), disp: r => dpcName(r.b) },
  { k: 'c', l: 'Client', t: 'text', raw: r => r.c, disp: r => r.c },
  { k: 'ct', l: 'Contact details', t: 'text', ct: true, raw: r => opdCtText(r), disp: r => opdCtText(r) },
  { k: 'a', l: 'Deposit', t: 'num', raw: r => r.a, disp: r => dpcM0(r.a) },
  { k: 'u', l: 'Taken off', t: 'num', raw: r => r.u, disp: r => dpcM0(r.u) },
  { k: 'age', l: 'Days open', t: 'num', raw: r => r.age, disp: r => String(r.age) },
  { k: 'na', l: 'Next appointment', t: 'date', raw: r => r.na || '', disp: r => r.na ? opdD(r.na) : 'Nothing booked' },
  { k: 'ns', l: 'Booked for', t: 'text', raw: r => opdBookText(r), disp: r => opdBookText(r) },
  { k: 's', l: 'Status', t: 'text', raw: r => OPD_NAME[r.s], disp: r => OPD_NAME[r.s] },
  { k: 'todo', l: 'What to do', t: 'text', raw: r => OPD_PLAIN(opdTodo(r)), disp: r => OPD_PLAIN(opdTodo(r)) }
];
const opdCols = () => OPD_COLS.filter(c => !c.ct || dpcBookOk());   // the contact details are Level 5 only
function opdPass(c, r, f) {
  if (!f) return true;
  if (f.vals && !f.vals.has(c.disp(r))) return false;
  if (f.op) {
    const v = c.raw(r);
    if (c.t === 'num') { const a = f.a, b = f.b; return f.op === 'eq' ? v === a : f.op === 'gt' ? v > a : f.op === 'ge' ? v >= a : f.op === 'lt' ? v < a : f.op === 'le' ? v <= a : f.op === 'bt' ? (v >= Math.min(a, b) && v <= Math.max(a, b)) : true; }
    if (c.t === 'date') { const d = String(v || '').slice(0, 10); return f.op === 'eq' ? d === f.a : f.op === 'af' ? d >= f.a : f.op === 'bf' ? d <= f.a : f.op === 'bt' ? (d >= f.a && d <= f.b) : true; }
    const t = String(v).toLowerCase(), q = String(f.a || '').toLowerCase();
    return f.op === 'ct' ? t.indexOf(q) >= 0 : f.op === 'nc' ? t.indexOf(q) < 0 : f.op === 'eq' ? t === q : f.op === 'sw' ? t.indexOf(q) === 0 : true;
  }
  return true;
}
const opdCmp = (c, a, b) => { const x = c.raw(a), y = c.raw(b); return c.t === 'num' ? (x - y) || 0 : String(x).localeCompare(String(y), undefined, { numeric: true }); };
function opdVisible() {
  const st = OPD.status, q = OPD.q.toLowerCase(), cols = opdCols();
  let rows = (q ? opdAllPeriods() : opdBase()).filter(r => (st === 'all' || (st === 'needs' ? (r.s !== 'wait' && r.s !== 'small') : r.s === st)) && (!q || r.c.toLowerCase().includes(q))
    && cols.every(c => !OPD.f[c.k] || opdPass(c, r, OPD.f[c.k])));
  if (OPD.sort) { const c = cols.find(x => x.k === OPD.sort.k); if (c) rows = rows.slice().sort((a, b) => opdCmp(c, a, b) * OPD.sort.dir); }
  return rows;
}
// ── the Sheets-style menu on a header: sort, filter by condition, filter by values (a checklist with search) ──
let opdPop = null;
function opdClosePop() { if (opdPop) { opdPop.remove(); opdPop = null; } }
function opdOpenPop(btn, key) {
  const was = opdPop && opdPop.dataset.k === key; opdClosePop(); if (was) return;
  const c = opdCols().find(x => x.k === key); if (!c) return;
  const cur0 = OPD.f[key] || {}, map = new Map();
  opdBase().forEach(r => { const d = c.disp(r), x = map.get(d) || { d, n: 0, raw: c.raw(r) }; x.n++; map.set(d, x); });
  const list = [...map.values()].sort(c.t === 'num' ? (a, b) => a.raw - b.raw : c.t === 'date' ? (a, b) => String(b.raw).localeCompare(String(a.raw)) : (a, b) => a.d.localeCompare(b.d, undefined, { numeric: true }));
  const sel = new Set(cur0.vals ? [...cur0.vals] : list.map(x => x.d));
  const ops = c.t === 'num' ? [['', 'No condition'], ['eq', 'Is equal to'], ['gt', 'Greater than'], ['ge', 'Greater than or equal to'], ['lt', 'Less than'], ['le', 'Less than or equal to'], ['bt', 'Is between']]
    : c.t === 'date' ? [['', 'No condition'], ['eq', 'Is on'], ['af', 'Is on or after'], ['bf', 'Is on or before'], ['bt', 'Is between']]
    : [['', 'No condition'], ['ct', 'Contains'], ['nc', 'Does not contain'], ['eq', 'Is exactly'], ['sw', 'Starts with']];
  const it = c.t === 'date' ? 'date' : 'text', up = c.t === 'num' ? 'smallest to largest' : c.t === 'date' ? 'oldest to newest' : 'A to Z', dn = c.t === 'num' ? 'largest to smallest' : c.t === 'date' ? 'newest to oldest' : 'Z to A';
  const host = document.getElementById('depositContent'); if (!host) return;
  const pop = document.createElement('div'); pop.className = 'opd-pop'; pop.dataset.k = key; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Filter ' + c.l);
  pop.innerHTML = `<div class="opd-pop-sort"><button type="button" data-ps="1">Sort ${up}</button><button type="button" data-ps="-1">Sort ${dn}</button></div>
    <div class="opd-pop-l">Filter by condition</div>
    <select class="opd-pop-op">${ops.map(([v, l]) => `<option value="${v}"${(cur0.op || '') === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
    <div class="opd-pop-in"><input class="opd-pop-a" type="${it}" value="${dpcEsc(cur0.a == null ? '' : cur0.a)}"><input class="opd-pop-b" type="${it}" value="${dpcEsc(cur0.b == null ? '' : cur0.b)}"></div>
    <div class="opd-pop-l">Filter by values</div>
    <input class="opd-pop-q" type="search" placeholder="Search" aria-label="Search values">
    <div class="opd-pop-sel"><button type="button" data-pa="1">Select all</button><span>·</span><button type="button" data-pa="0">Clear</button></div>
    <div class="opd-pop-list"></div>
    <div class="opd-pop-act"><button type="button" data-pr>Reset</button><span></span><button type="button" data-pc>Cancel</button><button type="button" class="ok" data-pk>OK</button></div>`;
  host.appendChild(pop); opdPop = pop;
  const opEl = pop.querySelector('.opd-pop-op'), aEl = pop.querySelector('.opd-pop-a'), bEl = pop.querySelector('.opd-pop-b'), qEl = pop.querySelector('.opd-pop-q'), listEl = pop.querySelector('.opd-pop-list');
  const showIn = () => { aEl.hidden = !opEl.value; bEl.hidden = opEl.value !== 'bt'; };
  const drawList = () => {
    const q = qEl.value.trim().toLowerCase(), shown = list.filter(x => !q || x.d.toLowerCase().indexOf(q) >= 0);
    listEl.innerHTML = shown.slice(0, 400).map(x => `<label class="opd-pop-v"><input type="checkbox" data-v="${dpcEsc(x.d)}"${sel.has(x.d) ? ' checked' : ''}><span>${dpcEsc(x.d === '' ? '(blank)' : x.d)}</span><em>${x.n}</em></label>`).join('')
      + (shown.length > 400 ? `<p class="opd-pop-more">${shown.length - 400} more: search to narrow them down.</p>` : '') + (shown.length ? '' : '<p class="opd-pop-more">Nothing matches.</p>');
  };
  showIn(); drawList();
  const rc = btn.getBoundingClientRect(), W = Math.min(300, window.innerWidth - 16), phone = window.innerWidth <= 760;
  pop.style.width = W + 'px'; pop.style.left = (phone ? 8 : Math.max(8, Math.min(rc.right - W, window.innerWidth - W - 8))) + 'px';
  pop.style.top = Math.min(rc.bottom + 4, Math.max(8, window.innerHeight - 220)) + 'px'; pop.style.maxHeight = Math.max(240, window.innerHeight - parseInt(pop.style.top, 10) - 12) + 'px';
  opEl.addEventListener('change', showIn);
  qEl.addEventListener('input', drawList);
  pop.addEventListener('change', e => { const cb = e.target.closest && e.target.closest('input[data-v]'); if (cb) { if (cb.checked) sel.add(cb.dataset.v); else sel.delete(cb.dataset.v); } });
  pop.addEventListener('click', e => {
    const t = e.target; OPD.shown = 30;
    const ps = t.closest('[data-ps]'); if (ps) { OPD.sort = { k: key, dir: +ps.dataset.ps }; opdClosePop(); opdPaint(); return; }
    const pa = t.closest('[data-pa]'); if (pa) { const q = qEl.value.trim().toLowerCase(); list.forEach(x => { if (!q || x.d.toLowerCase().indexOf(q) >= 0) { if (pa.dataset.pa === '1') sel.add(x.d); else sel.delete(x.d); } }); drawList(); return; }
    if (t.closest('[data-pr]')) { delete OPD.f[key]; if (OPD.sort && OPD.sort.k === key) OPD.sort = null; opdClosePop(); opdPaint(); return; }
    if (t.closest('[data-pc]')) { opdClosePop(); return; }
    if (t.closest('[data-pk]')) {
      const op = opEl.value, a = aEl.value.trim(), b = bEl.value.trim(); let cond = null;
      if (op) {
        if (c.t === 'num') { const na = parseFloat(a.replace(/,/g, '')), nb = parseFloat(b.replace(/,/g, '')); if (isFinite(na) && (op !== 'bt' || isFinite(nb))) cond = { op, a: na, b: nb }; }
        else if (c.t === 'date') { if (a && (op !== 'bt' || b)) cond = { op, a, b }; }
        else if (a) cond = { op, a };
      }
      const vals = sel.size === list.length ? null : new Set(sel);   // everything ticked is no filter at all
      if (!cond && !vals) delete OPD.f[key]; else OPD.f[key] = Object.assign({}, cond || {}, { vals });
      opdClosePop(); opdPaint();
    }
  });
  qEl.focus();
}
// ── CLICK A NUMBER, SEE WHAT THE DEPOSIT WAS FOR (Kate, 17 Nov 2026: "numbers should be clickable too to show what service is this deposit for"). The Deposit, Taken off and Days open figures open the
// bills behind them (open_deposit_detail(): the Deposit lines, and what was rung through for this client at this salon after the deposit). Phorest sales show what was rung through, not what was
// booked, so what she had when she came back is the best read of the service; a client who has not come back has no service to read yet.
const OPD_DET = {};
const opdKey = r => r.b + '|' + r.id;
const OPD_PAY = { S: 'Stripe', CC: 'Card', C: 'Cash', A: 'Account', V: 'Voucher', T: 'Tabby' };
const opdPayText = raw => String(raw || '').split(',').map(x => { const m = /^\s*([A-Za-z]+)\((-?[\d.]+)\)\s*$/.exec(x); return m ? (OPD_PAY[m[1]] || m[1]) + ' AED ' + dpcM0(+m[2]) : ''; }).filter(Boolean).join(', ');
const opdPaySum = raw => { let t = 0; String(raw || '').replace(/(?:^|,)\s*[A-Za-z]+\((-?[\d.]+)\)/g, (_, n) => { t += +n; return ''; }); return dpcR2(t); };
const opdAUsed = raw => { let t = 0; String(raw || '').replace(/(?:^|,)\s*A\((-?[\d.]+)\)/g, (_, n) => { t += +n; return ''; }); return dpcR2(t); };
async function opdToggle(key) {
  OPD.open = OPD.open === key ? null : key;
  const r = opdRows.find(x => opdKey(x) === key);
  if (OPD.open && r && !OPD_DET[key]) {
    OPD_DET[key] = { busy: true }; opdPaint();
    try {
      const { data, error } = await sb.rpc('open_deposit_detail', { p_branch: r.b, p_client: r.id, p_from: r.f });
      if (error) throw error;
      OPD_DET[key] = { data };
    } catch (e) { console.error(e); OPD_DET[key] = { err: true }; }
  }
  opdPaint();
}
function opdDetRow(r, n) {
  const det = OPD_DET[opdKey(r)] || {}, f = dpcEsc(dpcFirst(r.c));
  let inner;
  if (det.err) inner = '<div class="spv-next">The bills did not load. Close this and open it again.</div>';
  else if (!det.data) inner = '<div class="spv-next">Reading the bills…</div>';
  else {
    const dp = det.data.deposits || [], lines = det.data.lines || [], visits = [], by = {};
    lines.forEach(l => { if (!by[l.sale]) { by[l.sale] = { d: l.d, rows: [], pay: l.pay }; visits.push(by[l.sale]); } by[l.sale].rows.push(l); });
    const depHtml = dp.length ? dp.map(x => `<div>${opdD(x.d)}: AED ${dpcM0(x.t)}${x.t < 0 ? ' (refund)' : ''}<span class="spv-sub">${dpcEsc(opdPayText(x.pay))}${Math.abs(opdPaySum(x.pay) - (+x.t || 0)) > 0.5 ? ' (the whole bill it was paid with)' : ''}</span></div>`).join('') : '<span class="spv-dim">None found</span>';
    const offHtml = visits.map(v => ({ v, a: opdAUsed(v.pay) })).filter(x => x.a).map(x => `<div>${opdD(x.v.d)}: AED ${dpcM0(x.a)} came off</div>`).join('') || '<span class="spv-dim">Nothing has come off yet</span>';
    const shown = visits.slice(0, 3), more = visits.length - shown.length;
    const svc = shown.length
      ? shown.map(v => `<div class="opd-visit"><b>${opdD(v.d)}</b><ul class="opd-vl">${v.rows.map(l => `<li><span>${dpcEsc(l.item)}${l.staff && !/^BUSINESS/i.test(l.staff) ? `<em> · ${dpcEsc(l.staff)}</em>` : ''}</span><span class="p">AED ${dpcM0(l.t)}</span></li>`).join('')}</ul></div>`).join('') + (more > 0 ? `<div class="spv-dim">${more} more visit${more === 1 ? '' : 's'} not shown.</div>` : '')
      : r.na ? `<div><b>${opdD(r.na)}</b>${r.ns ? ': ' + dpcEsc(r.ns) : ''}${r.nst ? ' with ' + dpcEsc(r.nst) : ''}. ${f} has not been rung through since the deposit, so this booking is most likely what it is for.</div>`
      : `<span class="spv-dim">${f} has not been rung through since the deposit and has nothing booked in Phorest, so there is no service to read yet.</span>`;
    inner = `<div class="spv-dgrid"><div><small>Deposit paid</small>${depHtml}</div><div><small>Taken off</small>${offHtml}</div>` +
      `<div><small>Days open</small>${r.age} day${r.age === 1 ? '' : 's'} since the last deposit, ${opdD(r.l)}</div>` +
      `<div class="opd-wide"><small>${shown.length ? `What ${f} had when she came back, most likely what the deposit was for` : r.na ? 'Booked next, most likely what the deposit is for' : 'What the deposit is for'}</small>${svc}</div>` +
      `<div class="spv-next">What she had comes from Phorest sales (what was rung through). The next appointment comes from the Phorest diary, read each morning and matched by client name, so it is the best read of the service, not a promise.</div></div>`;
  }
  return `<tr class="opd-det"><td colspan="${n}">${inner}</td></tr>`;
}
// ── SAVE AS XLSX / CSV (Kate, 17 Nov 2026: "no xlsx and csv buttons for downloads"). What is on screen: the salons and period in the header, the card or chip picked, the column filters
// and the sort. The file builder is ledger-export.js (the lgx group, loaded with this page). The CSV is the list; the XLSX has a Summary tab as well. Contact details only exist at Level 5.
function opdSave(kind) {
  if (typeof lgxBuild !== 'function') return;
  const cols = opdCols(), rows = opdVisible(), base = opdBase(), today = dateToIso(new Date());
  const [pa, pb] = opdRange();
  const brs = dpcCodes().map(c => dpcName(c)).join(', ');
  const per = pa ? opdD(pa) + ' to ' + opdD(pb || today) : 'All time';
  const fmt = c => c.t === 'num' ? (c.k === 'age' ? 'num' : 'aed') : 'text';
  const val = (c, r) => c.t === 'num' ? c.raw(r) : c.disp(r);
  const sum = k => dpcR2(rows.reduce((t, r) => t + (+r[k] || 0), 0));
  const total = { total: true, cells: cols.map((c, i) => i === 0 ? 'Total' : c.k === 'a' ? sum('a') : c.k === 'u' ? sum('u') : '') };
  const filtered = rows.length !== base.length;
  const built = lgxBuild({ sheets: [
    { name: 'Summary', blocks: [{ cols: [{ label: 'Deposit Checking', fmt: 'text' }, { label: '', fmt: 'text' }], rows: [
      { cells: ['Salons', brs] }, { cells: ['Deposits paid', per] }, { cells: ['Rows', filtered ? 'Filtered: ' + rows.length + ' of ' + base.length : String(rows.length)] },
      { cells: ['Report made', today] },
      { cells: ['How it is read', 'A deposit is a Deposit line in the Phorest sales lines (a refund nets it off). It counts as taken off when a later bill of the same client at the same salon carries an A(...) tender. Candidates only. Next appointment is the earliest booking in the Phorest diary from today, matched by client name. Days open counts from the last deposit.'] }] }] },
    { name: 'Open deposits', blocks: [{ cols: cols.map(c => ({ label: c.l, fmt: fmt(c) })), rows: rows.map(r => ({ cells: cols.map(c => val(c, r)) })).concat(rows.length ? [total] : []) }] }
  ] });
  const name = 'deposit-checking-' + today;
  if (kind === 'csv') lgxSave(new Blob(['\uFEFF' + lgxCsv(built[1])], { type: 'text/csv;charset=utf-8' }), name + '.csv');
  else lgxSave(lgxXlsxBlob(built), name + '.xlsx');
}
if (!window.__opdPopWired) { window.__opdPopWired = 1; document.addEventListener('click', e => { if (opdPop && !opdPop.contains(e.target) && !(e.target.closest && e.target.closest('[data-opdfc]'))) opdClosePop(); }); }

function opdPaint() {
  const el = document.getElementById('depositContent');
  if (!el || !opdData) return;
  opdClosePop();
  const base = opdBase(), by = k => base.filter(r => r.s === k), sumAmt = l => dpcR2(l.reduce((t, r) => t + r.o, 0));
  const K = [['came', 'act bad', 'Possible double charge. Ask the front desk first.'], ['part', 'act info', 'Some of the deposit came off, some is left.'], ['old', 'act warn', 'Over 14 days, no appointment booked. No-show, moved, or a refund owed.'], ['wait', 'quiet', 'Normal. She is booked, or it is not time yet.']];
  const cards = K.map(([k, cls, why]) => { const l = by(k);
    return `<button type="button" class="spv-sc ${cls}" data-od='${k}' aria-pressed="${OPD.status === k}"><span class="spv-lbl"><i class="spv-dot ${OPD_CLS[k]}"></i>${OPD_NAME[k]}</span><span class="spv-big">${l.length}</span><span class="spv-amt">AED ${dpcM0(sumAmt(l))}</span><span class="spv-why2">${why}</span>${cls.startsWith('act') && l.length ? '<span class="spv-cta">Show these &rsaquo;</span>' : ''}</button>`; }).join('');
  const CH = [['all', 'All'], ['needs', 'Needs checking'], ['came', 'Came back'], ['part', 'Part used'], ['old', 'Nothing booked'], ['wait', 'Waiting'], ['small', 'Under AED 50']];
  const chips = CH.map(([k, n]) => { const c = base.filter(r => k === 'all' || (k === 'needs' ? (r.s !== 'wait' && r.s !== 'small') : r.s === k)).length;
    return `<button type="button" class="spv-schip ${k === 'needs' ? 'needs' : ''}" data-ost="${k}" aria-pressed="${OPD.status === k}">${n} <span class="c">${c}</span></button>`; }).join('');
  const rows = opdVisible(), shown = rows.slice(0, OPD.shown), rest = rows.length - shown.length;
  const bookOk = dpcBookOk(), cols = opdCols(), ct = bookOk;   // the Client Book and the contact details are Level 5 only
  const tw = cols.reduce((t, c) => t + (DPC_W[c.k] || 120), 0), colg = cols.map(c => `<col style="width:${DPC_W[c.k] || 120}px">`).join('');
  const fbtn = c => { const on = OPD.sort && OPD.sort.k === c.k || !!OPD.f[c.k];
    return `<button type="button" class="opd-fb${on ? ' on' : ''}" data-opdfc="${c.k}" aria-label="Filter ${c.l}" aria-haspopup="true"><svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true"><path d="M1 2h10L7 6.5V10L5 9V6.5z" fill="currentColor"/></svg></button>`; };
  const head = cols.map(c => `<th class="${c.t === 'num' ? 'r' : ''}"><span class="opd-th"><span>${c.l}${OPD.sort && OPD.sort.k === c.k ? (OPD.sort.dir > 0 ? ' ↑' : ' ↓') : ''}</span>${fbtn(c)}</span></th>`).join('');
  const colbar = cols.map(c => { const on = OPD.sort && OPD.sort.k === c.k || !!OPD.f[c.k]; return `<button type="button" class="spv-schip${on ? ' opd-on' : ''}" data-opdfc="${c.k}" aria-haspopup="true">${c.l} ▾</button>`; }).join('');
  const body = shown.map(r => {
    const nm = bookOk ? `<a class="spv-bk" href="/?view=clientbook&amp;cbq=${encodeURIComponent(r.c)}" target="_blank" rel="noopener" title="Find ${dpcEsc(r.c)} in the Client Book">${dpcEsc(r.c)}</a>` : dpcEsc(r.c);
    const rk = opdKey(r), nb = t => `<button type="button" class="spv-fig" data-odet="${dpcEsc(rk)}" aria-expanded="${OPD.open === rk}" title="Show what this deposit was for">${t}</button>`;
    const rowHtml = `<tr class="opd-row ${OPD_CLS[r.s]}${OPD.open === rk ? ' open' : ''}"><td data-l="Deposit paid" class="num">${opdD(r.l)}${r.f !== r.l ? `<span class="spv-sub">first ${opdD(r.f)}</span>` : ''}</td>` +
      `<td data-l="Salon">${dpcName(r.b)}</td><td data-l="Client" class="opd-cl">${nm}${r.v ? `<span class="spv-sub">came back ${opdD(r.v)}</span>` : ''}</td>` +
      (ct ? `<td data-l="Contact details" class="opd-ct">${opdCtCell(r)}</td>` : '') +
      `<td class="r num" data-l="Deposit">${nb(dpcM0(r.a))}</td><td class="r num" data-l="Taken off">${nb(dpcM0(r.u))}</td><td class="r num" data-l="Days open">${nb('<b>' + r.age + '</b>')}</td>` +
      `<td data-l="Next appointment" class="num">${r.na ? opdD(r.na) : '<span class="spv-dim">Nothing booked</span>'}</td><td data-l="Booked for" class="opd-bk">${r.na ? dpcEsc(opdBookText(r)) : '<span class="spv-dim">\u2013</span>'}</td>` +
      `<td data-l="Status"><span class="spv-badge ${OPD_CLS[r.s]}"><i class="spv-dot ${OPD_CLS[r.s]}"></i>${OPD_NAME[r.s]}</span></td><td data-l="What to do" class="opd-todo">${opdTodo(r)}</td></tr>`;
    return OPD.open === rk ? rowHtml + opdDetRow(r, cols.length) : rowHtml;
  }).join('') || `<tr><td colspan="${cols.length}" class="spv-empty2"><b>Nothing here.</b>No deposits match these filters. That is good news if you were looking for problems.</td></tr>`;
  const upd = opdData.at ? new Date(opdData.at).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '';
  const dirty = OPD.status !== 'all' || OPD.q || OPD.sort || Object.keys(OPD.f).length > 0;
  const out = opdOutside(), [pa, pb] = opdRange();
  const outLine = out.length ? `<div class="spv-note">${out.length} more open deposit${out.length === 1 ? '' : 's'} (AED ${dpcM0(sumAmt(out))}) ${out.length === 1 ? 'was' : 'were'} paid outside the period in the header${pa ? ', ' + opdD(pa) + ' to ' + opdD(pb || dateToIso(new Date())) : ''}. Pick All time to see ${out.length === 1 ? 'it' : 'them'}.</div>` : '';
  el.innerHTML =
    `<div class="spv-head"><div class="spv-eyebrow">Tools · Deposits</div><h1>Deposit Checking</h1>` +
    `<p>Every deposit a client paid that has not been taken off a bill yet. The one that matters most is a client who <b>came back and paid in full</b>, because she may have paid twice.</p>` +
    `<div class="spv-card spv-whycard"><p><b>Why this:</b> a deposit should come off the client's bill when she is checked out. This page shows the deposits that have not been taken off yet, so the front desk can check them.</p>` +
    `<p><b>If we do nothing:</b> a missed deduction is only found when the client mentions it.</p></div></div>` +
    `<div class="spv-cards opd-cards">${cards}</div>` +
    `<div class="spv-sec" id="opdList"><h2>Every open deposit</h2><p class="spv-lead">Deposits from the last 90 days at the salons and period picked in the header. Tap a card to filter the list. Every column header has a filter menu, like Google Sheets.${upd ? ' Last worked out ' + upd + '.' : ''}</p>` +
    `<div class="spv-bar"><input class="spv-search" id="opdQ" type="search" placeholder="Search a client" aria-label="Search a client" value="${dpcEsc(OPD.q)}"><div class="spv-status-set" role="group" aria-label="Status">${chips}</div>` +
    `</div>` +
    `<div class="opd-colbar" aria-label="Column filters">${colbar}</div>` +
    `<div class="spv-sumline">Showing <b>${rows.length}</b> client${rows.length === 1 ? '' : 's'}, AED <b>${dpcM0(sumAmt(rows))}</b> open${OPD.q ? ' · <span class="spv-dim">searching all dates, not only the Period</span>' : ''}${dirty ? ' · <button type="button" class="spv-clear" data-act="oclear">Clear filters</button>' : ''}<div class="opd-save" role="group" aria-label="Download"><button type="button" class="spv-schip" data-osave="xlsx" title="What is on screen, with a Summary tab">Save as XLSX</button><button type="button" class="spv-schip" data-osave="csv" title="What is on screen, one list">Save as CSV</button></div></div>` +
    `<div class="spv-card spv-tw opd-box"><table class="spv-tbl spv-opd" style="--opd-w:${tw}px"><colgroup>${colg}</colgroup><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>` +
    `<div class="spv-more-row"${rest > 0 ? '' : ' hidden'}><button class="spv-morebtn" type="button" data-act="omore">Show ${Math.min(30, rest)} more (${rest} left)</button></div></div>` + outLine +
    `<div class="spv-callout"><b>A deposit before the appointment is normal.</b> A client with an appointment booked in Phorest shows as Waiting, with the date and what she is booked for. Only <b>Came back</b>, <b>Part used</b> and <b>No visit, nothing booked</b> need a person.</div>` +
    `<div class="spv-note">How it is read: a deposit is a "Deposit" line in Phorest (a refund nets it off). It counts as taken off when a later bill for the same client at the same salon carries an A(...) tender. The next appointment is the earliest one in the Phorest diary from today, matched by client name (two clients with one name can mix). These are candidates only. Check the client in Phorest before telling her anything. Bahrain is left out, as on the Stripe tab.</div></div>`;
  opdContacts();
  el.querySelectorAll('[data-opdfc]').forEach(b => { b.onclick = e => { e.stopPropagation(); opdOpenPop(b, b.getAttribute('data-opdfc')); }; });
  el.querySelectorAll('[data-od]').forEach(b => { b.onclick = () => { const k = b.getAttribute('data-od'); OPD.status = OPD.status === k ? 'all' : k; OPD.shown = 30; opdPaint(); if (OPD.status !== 'all') { const t = document.getElementById('opdList'); if (t) t.scrollIntoView({ block: 'start' }); } }; });
  el.querySelectorAll('[data-ost]').forEach(b => { b.onclick = () => { OPD.status = b.getAttribute('data-ost'); OPD.shown = 30; opdPaint(); }; });
  const q = document.getElementById('opdQ');
  if (q) q.oninput = () => { OPD.q = q.value.trim(); OPD.shown = 30; const pos = q.selectionStart; opdPaint(); const n = document.getElementById('opdQ'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) {} } };
  const clr = el.querySelector('[data-act="oclear"]'); if (clr) clr.onclick = () => { OPD.status = 'all'; OPD.q = ''; OPD.sort = null; OPD.f = {}; OPD.shown = 30; opdPaint(); };
  el.querySelectorAll('[data-odet]').forEach(b => { b.onclick = () => opdToggle(b.getAttribute('data-odet')); });
  el.querySelectorAll('[data-osave]').forEach(b => { b.onclick = () => opdSave(b.getAttribute('data-osave')); });
  const more = el.querySelector('[data-act="omore"]'); if (more) more.onclick = () => { OPD.shown += 30; opdPaint(); };
}


let dpcSeq = 0;
async function renderDepositCheck(force) {
  const el = document.getElementById('depositContent');
  if (!el) return;
  dpcCss();
  try { if (window.trsWindowReady) await window.trsWindowReady; } catch (e) {}
  const seq = ++dpcSeq;
  if (!opdData || force) el.innerHTML = '<p class="spv-q">Reading the deposits…</p>';
  const res = await opdLoad(!!force);
  if (seq !== dpcSeq) return;
  if (res !== true) {
    const denied = /Not open/i.test(String(res && res.message));
    el.innerHTML = '<div class="spv-empty"><b>' + (denied ? 'This page is not open to your account.' : 'The deposits did not load.') + '</b>' + (denied ? '' : 'Refresh to try again.') + '</div>';
    return;
  }
  opdPaint();
}

function dpcCss() {
  if (document.getElementById('dpcCss')) return;
  const st = document.createElement('style'); st.id = 'dpcCss';
  st.textContent = `
#depositContent{--s-bad:#A03C3C;--s-bad-bg:#F7E9E9;--s-bad-on:#fff;--s-warn:#8A5F12;--s-warn-bg:#FBF3E2;--s-warn-on:#fff;--s-info:#4B3FA3;--s-info-bg:#EEEBFA;--s-info-on:#fff;--s-good:#3E7A5E;--s-good-bg:#E4F1EA;max-width:1100px;margin:0 auto;padding:10px 28px 56px}
[data-theme="dark"] #depositContent{--s-bad:#FF9B9B;--s-bad-bg:rgba(255,155,155,.12);--s-bad-on:#2D2E37;--s-warn:#FFB27A;--s-warn-bg:rgba(255,178,122,.12);--s-warn-on:#2D2E37;--s-info:#C4B5FD;--s-info-bg:rgba(196,181,253,.13);--s-info-on:#2D2E37;--s-good:#99F6E4;--s-good-bg:rgba(153,246,228,.12)}
#depositContent .num{font-variant-numeric:tabular-nums}
#depositContent .spv-q{margin:4px 0 16px;color:var(--muted);font-size:15px}
#depositContent .spv-empty{padding:34px 18px;text-align:center;color:var(--muted)}#depositContent .spv-empty b{display:block;font-family:'Playfair Display',serif;font-size:20px;font-weight:500;color:var(--text);margin-bottom:4px}
#depositContent .spv-eyebrow{font-size:12px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--muted2)}
#depositContent .spv-head{padding-top:12px}
#depositContent .spv-head h1{font-family:'Playfair Display',serif;font-weight:500;font-size:34px;line-height:1.15;margin:4px 0 8px}
#depositContent .spv-head p{margin:0;color:var(--muted);max-width:66ch;font-size:16px}
#depositContent .spv-card{background:var(--surface);border:1px solid var(--border);border-radius:14px;box-shadow:var(--shadow)}
#depositContent .spv-whycard{margin-top:16px;padding:14px 18px 10px;max-width:80ch;box-shadow:none}
#depositContent .spv-whycard p{margin:6px 0;font-size:15px;color:var(--text)}
#depositContent .spv-commit{margin-top:22px;padding:18px 20px;max-width:80ch}
#depositContent .spv-commit h3{font-family:'Playfair Display',serif;font-weight:500;font-size:20px;margin:0 0 4px}
#depositContent .spv-commit .lead2{margin:0 0 12px;color:var(--muted);font-size:14.5px}
#depositContent .spv-crow{display:grid;grid-template-columns:auto 1fr;gap:10px 12px;align-items:center;font-size:15px}
#depositContent .spv-crow label{color:var(--muted);white-space:nowrap}
#depositContent .spv-crow input{border:1px solid var(--border);background:var(--bg);color:var(--text);border-radius:10px;padding:8px 12px;min-height:38px;width:100%;font:inherit}
#depositContent .spv-sec{margin-top:34px}
#depositContent .spv-sec>h2{font-family:'Playfair Display',serif;font-weight:500;font-size:23px;margin:0 0 4px}
#depositContent .spv-lead{margin:0 0 14px;color:var(--muted);font-size:15px;max-width:72ch}
#depositContent .spv-cards{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:12px;margin-top:18px}
#depositContent .spv-sc{grid-column:span 3;display:flex;flex-direction:column;align-items:flex-start;text-align:left;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:14px;padding:16px 18px 14px;cursor:pointer;box-shadow:var(--shadow);min-width:0;font:inherit}
#depositContent .spv-sc.quiet{grid-column:span 4;box-shadow:none}
#depositContent .spv-sc:hover{border-color:var(--muted2)}
#depositContent .spv-lbl{font-size:13px;font-weight:600;display:flex;align-items:center;gap:8px}
#depositContent .spv-big{font-family:'Playfair Display',serif;font-size:34px;font-weight:500;line-height:1.1;margin:8px 0 0;font-variant-numeric:tabular-nums}
#depositContent .spv-amt{font-size:14.5px;color:var(--muted);margin-top:2px;font-variant-numeric:tabular-nums}
#depositContent .spv-why2{font-size:13px;color:var(--muted);margin-top:10px;max-width:30ch}
#depositContent .spv-cta{font-size:13px;font-weight:700;margin-top:10px}
#depositContent .spv-sc.act{border-width:2px}#depositContent .spv-sc.act .spv-big{font-size:40px}
#depositContent .spv-sc.act.bad{border-color:var(--s-bad);background:var(--s-bad-bg)}#depositContent .spv-sc.act.bad .spv-big,#depositContent .spv-sc.act.bad .spv-lbl{color:var(--s-bad)}
#depositContent .spv-sc.act.warn{border-color:var(--s-warn);background:var(--s-warn-bg)}#depositContent .spv-sc.act.warn .spv-big,#depositContent .spv-sc.act.warn .spv-lbl{color:var(--s-warn)}
#depositContent .spv-sc.act.info{border-color:var(--s-info);background:var(--s-info-bg)}#depositContent .spv-sc.act.info .spv-big,#depositContent .spv-sc.act.info .spv-lbl{color:var(--s-info)}
#depositContent .spv-sc.act.dashed{border-style:dashed}
#depositContent .spv-sc[aria-pressed="true"]{outline:3px solid var(--accent);outline-offset:1px}
#depositContent .spv-dot{display:inline-block;width:10px;height:10px;border-radius:50%;flex:none}
#depositContent .spv-dot.notco{background:var(--s-bad)}#depositContent .spv-dot.wrong,#depositContent .spv-dot.check{background:var(--s-warn)}#depositContent .spv-dot.nostripe{background:var(--s-info)}
#depositContent .spv-dot.waiting,#depositContent .spv-dot.likely{border:2px solid var(--muted2)}#depositContent .spv-dot.matched{background:var(--s-good)}#depositContent .spv-dot.refunded{background:var(--muted2)}
#depositContent .spv-tw{overflow-x:auto;-webkit-overflow-scrolling:touch}
#depositContent table.spv-tbl{border-collapse:collapse;width:100%;font-size:14.5px}
#depositContent .spv-tbl th,#depositContent .spv-tbl td{padding:10px 14px;border-bottom:1px solid var(--border);vertical-align:middle}
#depositContent .spv-tbl:not(.spv-pay) th{white-space:normal;line-height:1.25;min-width:70px}
#depositContent .spv-tw[hidden]{display:none}
#depositContent .spv-vtog{display:inline-flex;border:1px solid var(--border);border-radius:999px;padding:3px;background:var(--surface);margin:0 0 14px}
#depositContent .spv-vtog button{border:0;background:none;color:var(--muted);font:inherit;font-size:14px;padding:6px 18px;border-radius:999px;cursor:pointer}
#depositContent .spv-vtog button[aria-pressed="true"]{background:var(--text);color:var(--bg);font-weight:600}
#depositContent .spv-vgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
#depositContent .spv-vcard{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:16px 18px;box-shadow:var(--shadow);min-width:0}
#depositContent .spv-vcard.tot{grid-column:1/-1;background:var(--surface2)}
#depositContent .spv-vtop{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:10px}
#depositContent .spv-vtop h3{margin:0;font-family:'Playfair Display',serif;font-size:20px;font-weight:500;color:var(--text)}
#depositContent .spv-vdiff{font-size:20px;font-weight:700;text-align:right;line-height:1.1}#depositContent .spv-vdiff small{display:block;font-size:11.5px;font-weight:400;color:var(--muted2);margin-top:2px}
#depositContent .spv-vbar{display:grid;grid-template-columns:62px minmax(0,1fr) auto;align-items:center;gap:10px;margin:7px 0;font-variant-numeric:tabular-nums}
#depositContent .spv-vl{font-size:13px;color:var(--muted)}
#depositContent .spv-vtrack{height:12px;border-radius:6px;background:var(--surface2);overflow:hidden}
#depositContent .spv-vtrack i{display:block;height:100%;border-radius:6px}#depositContent .spv-vtrack i.s{background:var(--accent)}#depositContent .spv-vtrack i.p{background:var(--muted2)}
#depositContent .spv-vparts{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
#depositContent .spv-vchip{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--border);background:var(--surface);color:var(--text);border-radius:999px;padding:5px 12px;font:inherit;font-size:13.5px;cursor:pointer}
#depositContent .spv-vchip:hover{border-color:var(--muted2)}
#depositContent .spv-vchip.notco{border-color:var(--s-bad)}#depositContent .spv-vchip.wrong,#depositContent .spv-vchip.check{border-color:var(--s-warn)}#depositContent .spv-vchip.nostripe{border-color:var(--s-info)}
@media(max-width:760px){#depositContent .spv-vgrid{grid-template-columns:minmax(0,1fr)}}
#depositContent .spv-tbl th{font-size:12px;font-weight:600;color:var(--muted2);letter-spacing:.04em;text-transform:uppercase;text-align:right;vertical-align:bottom}
#depositContent .spv-tbl th:first-child,#depositContent .spv-tbl td:first-child{text-align:left}
#depositContent .spv-tbl td.r{text-align:right;font-variant-numeric:tabular-nums}
#depositContent .spv-tbl tr:last-child td{border-bottom:0}
#depositContent .spv-tot td{font-weight:700;background:var(--surface2)}
#depositContent .spv-fig{border:0;background:none;padding:2px 0;cursor:pointer;color:inherit;text-decoration:underline;text-decoration-color:var(--border);text-underline-offset:4px;font:inherit;font-variant-numeric:tabular-nums;font-weight:inherit}
#depositContent .spv-fig:hover{text-decoration-color:var(--text)}
#depositContent .spv-zero{color:var(--muted2);text-decoration:none;cursor:default;font-variant-numeric:tabular-nums}
#depositContent .spv-bad2{color:var(--s-bad);font-weight:700}#depositContent .spv-ok{color:var(--s-good);font-weight:700;font-variant-numeric:tabular-nums}
#depositContent .spv-callout{margin-top:12px;padding:14px 18px;border-left:4px solid var(--s-warn);background:var(--s-warn-bg);border-radius:10px;font-size:15px;max-width:80ch}
#depositContent .spv-note{font-size:13px;color:var(--muted2);margin:10px 2px 0;max-width:90ch}
#depositContent #dpcSalons table{min-width:900px;table-layout:fixed}#depositContent #dpcSalons th:first-child{width:16%}
#depositContent .spv-bar{display:flex;flex-wrap:wrap;gap:10px 14px;align-items:center;margin-bottom:10px}
#depositContent .spv-search{flex:1 1 220px;max-width:320px;border:1px solid var(--border);background:var(--surface);color:var(--text);border-radius:999px;padding:7px 14px;min-height:36px;font:inherit}
#depositContent .spv-status-set{display:flex;flex-wrap:wrap;gap:6px}
#depositContent .spv-schip{border:1px solid var(--border);background:var(--surface);color:var(--text);border-radius:999px;padding:5px 12px;font:inherit;font-size:13.5px;cursor:pointer;display:inline-flex;gap:8px;align-items:center;min-height:34px;white-space:nowrap}
#depositContent .spv-schip .c{font-variant-numeric:tabular-nums;color:var(--muted2);font-size:12.5px}
#depositContent .spv-schip[aria-pressed="true"]{background:var(--accent);color:var(--accent-fg);border-color:transparent;font-weight:600}
#depositContent .spv-schip[aria-pressed="true"] .c{color:inherit;opacity:.8}
#depositContent .spv-schip.needs{border-color:var(--s-bad);color:var(--s-bad);font-weight:600}
#depositContent .spv-schip.needs[aria-pressed="true"]{background:var(--s-bad);color:var(--s-bad-on);border-color:transparent}
#depositContent .spv-schip.needs[aria-pressed="true"] .c{color:var(--s-bad-on)}
#depositContent .spv-sumline{display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;font-size:14px;color:var(--muted);margin:2px 0 10px}
#depositContent .spv-sumline b{color:var(--text)}
#depositContent .spv-clear{border:0;background:none;text-decoration:underline;cursor:pointer;color:var(--text);font:inherit;font-size:14px;padding:0}
#depositContent .spv-pay{table-layout:fixed;min-width:1010px}
#depositContent .spv-pay col.c-date{width:116px}#depositContent .spv-pay col.c-salon{width:190px}#depositContent .spv-pay col.c-ph{width:200px}#depositContent .spv-pay col.c-amt{width:120px}#depositContent .spv-pay col.c-stat{width:178px}#depositContent .spv-pay col.c-go{width:44px}
#depositContent .spv-pay tr.spv-frow th{padding:6px 14px 10px;text-transform:none;letter-spacing:0;font-weight:400}
#depositContent .spv-frow select,#depositContent .spv-frow input{width:100%;box-sizing:border-box;font:inherit;font-size:13px;color:var(--text);background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:6px 8px}
#depositContent .spv-pay th.sortable{cursor:pointer;user-select:none}
#depositContent .spv-pay th.sortable button{border:0;background:none;padding:0;font:inherit;color:inherit;letter-spacing:inherit;text-transform:inherit;cursor:pointer}
#depositContent .spv-pay td{padding:11px 14px}
#depositContent .spv-pay td.cl,#depositContent .spv-pay td.ph{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#depositContent a.spv-bk{color:inherit;text-decoration:underline dotted;text-underline-offset:3px}#depositContent a.spv-bk:hover{text-decoration:underline}
#depositContent .spv-dim{font-weight:400;color:var(--muted2)}
#depositContent .spv-pay td.go{text-align:right;color:var(--muted2);padding-right:16px}
#depositContent .spv-pay tr.spv-row{cursor:pointer}
#depositContent .spv-pay tr.spv-row:hover td{background:var(--surface2)}
#depositContent .spv-pay tr.spv-row.notco td{background:var(--s-bad-bg)}#depositContent .spv-pay tr.spv-row.wrong td,#depositContent .spv-pay tr.spv-row.check td{background:var(--s-warn-bg)}#depositContent .spv-pay tr.spv-row.nostripe td{background:var(--s-info-bg)}
#depositContent .spv-pay tr.spv-row.notco td:first-child{box-shadow:inset 5px 0 0 var(--s-bad)}#depositContent .spv-pay tr.spv-row.wrong td:first-child,#depositContent .spv-pay tr.spv-row.check td:first-child{box-shadow:inset 5px 0 0 var(--s-warn)}#depositContent .spv-pay tr.spv-row.nostripe td:first-child{box-shadow:inset 5px 0 0 var(--s-info)}
#depositContent .spv-pay tr.spv-row.open td{border-bottom-color:transparent}
#depositContent .spv-sub{display:block;font-size:12.5px;font-weight:400;color:var(--muted2)}
#depositContent .spv-badge{display:inline-flex;align-items:center;gap:7px;border-radius:999px;padding:3px 11px 3px 9px;font-size:13px;font-weight:600;white-space:nowrap}
#depositContent .spv-badge .spv-dot{width:8px;height:8px}
#depositContent .spv-badge.notco{background:var(--s-bad);color:var(--s-bad-on)}#depositContent .spv-badge.notco .spv-dot{background:var(--s-bad-on)}
#depositContent .spv-badge.wrong,#depositContent .spv-badge.check{background:var(--s-warn);color:var(--s-warn-on)}#depositContent .spv-badge.wrong .spv-dot,#depositContent .spv-badge.check .spv-dot{background:var(--s-warn-on)}
#depositContent .spv-badge.nostripe{background:var(--s-info);color:var(--s-info-on)}#depositContent .spv-badge.nostripe .spv-dot{background:var(--s-info-on)}
#depositContent .spv-badge.waiting,#depositContent .spv-badge.likely{border:1.5px solid var(--muted2);color:var(--muted);font-weight:500}
#depositContent .spv-badge.matched{background:var(--s-good-bg);color:var(--s-good)}#depositContent .spv-badge.matched .spv-dot{background:var(--s-good)}
#depositContent .spv-badge.refunded{background:var(--surface2);color:var(--muted)}
#depositContent .spv-pay tr.spv-det td{padding:0 14px 14px;background:var(--surface2)}
#depositContent .spv-pay tr.spv-det.notco td{background:var(--s-bad-bg)}#depositContent .spv-pay tr.spv-det.wrong td,#depositContent .spv-pay tr.spv-det.check td{background:var(--s-warn-bg)}#depositContent .spv-pay tr.spv-det.nostripe td{background:var(--s-info-bg)}
#depositContent .spv-dgrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px 20px;padding:12px 4px 2px;border-top:1px dashed var(--border);font-size:14px}
#depositContent .spv-dgrid small{display:block;font-size:11.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted2);margin-bottom:2px}
#depositContent .spv-next{grid-column:1/-1;font-size:14.5px}#depositContent .spv-next b{font-weight:700}
#depositContent .spv-next.look{padding:10px 14px;border-radius:10px;background:var(--surface);border:1px dashed var(--muted2)}
#depositContent .spv-more-row{display:flex;justify-content:center;padding:14px}#depositContent .spv-more-row[hidden]{display:none}
#depositContent .spv-morebtn{border:1px solid var(--border);background:var(--surface);color:var(--text);border-radius:999px;padding:8px 20px;cursor:pointer;font:inherit}
#depositContent .spv-empty2{padding:34px 18px;text-align:center;color:var(--muted);display:table-cell}#depositContent .spv-empty2 b{display:block;font-family:'Playfair Display',serif;font-size:20px;font-weight:500;color:var(--text);margin-bottom:4px}
#depositContent :focus-visible{outline:2px solid var(--accent);outline-offset:2px}
@media(max-width:1000px){#depositContent .spv-sc{grid-column:span 6}#depositContent .spv-sc.quiet{grid-column:span 4}}
@media(max-width:760px){
#depositContent{padding:10px 10px 44px!important}
#depositContent .spv-head h1{font-size:28px}
#depositContent .spv-cards{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
#depositContent .spv-sc,#depositContent .spv-sc.quiet{grid-column:span 1}
#depositContent .spv-sc.act .spv-why2{max-width:none}
#depositContent .spv-big,#depositContent .spv-sc.act .spv-big{font-size:30px}
#depositContent #dpcSalons table,#depositContent #dpcSalons tbody,#depositContent #dpcSalons tr,#depositContent #dpcSalons td{display:block;min-width:0;width:100%}
#depositContent #dpcSalons thead{display:none}
#depositContent #dpcSalons tr{display:grid;grid-template-columns:1fr 1fr;gap:2px 12px;padding:12px 14px;border-bottom:1px solid var(--border)}
#depositContent #dpcSalons tr:last-child{border-bottom:0}
#depositContent #dpcSalons td{border:0;padding:4px 0;text-align:left!important;display:flex;flex-direction:column;align-items:flex-start;gap:1px}
#depositContent #dpcSalons td::before{content:attr(data-l);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted2);font-weight:600}
#depositContent #dpcSalons td:first-child{grid-column:1/-1;font-size:17px;font-family:'Playfair Display',serif}
#depositContent #dpcSalons td:first-child::before{content:none}
#depositContent #dpcSalons .spv-tot td{background:none}#depositContent #dpcSalons tr.spv-tot{background:var(--surface2)}
#depositContent .spv-search{max-width:none;flex-basis:100%}
#depositContent .spv-status-set{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;width:100%;padding-bottom:2px}
#depositContent .spv-status-set::-webkit-scrollbar{display:none}
#depositContent .spv-pay{min-width:0;table-layout:auto}
#depositContent .spv-pay colgroup,#depositContent .spv-pay thead{display:none}
#depositContent .spv-pay,#depositContent .spv-pay tbody{display:block}
#depositContent .spv-pay tr.spv-row{display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"cl amt" "ph amt" "meta stat";gap:4px 12px;padding:12px 14px 12px 18px;border-bottom:1px solid var(--border)}
#depositContent .spv-pay tr.spv-row td{display:block;border:0;padding:0;background:none!important;box-shadow:none!important}
#depositContent .spv-pay tr.spv-row.notco{background:var(--s-bad-bg);box-shadow:inset 5px 0 0 var(--s-bad)}
#depositContent .spv-pay tr.spv-row.wrong,#depositContent .spv-pay tr.spv-row.check{background:var(--s-warn-bg);box-shadow:inset 5px 0 0 var(--s-warn)}
#depositContent .spv-pay tr.spv-row.nostripe{background:var(--s-info-bg);box-shadow:inset 5px 0 0 var(--s-info)}
#depositContent .spv-pay td.cl{grid-area:cl;font-size:16px;white-space:normal}
#depositContent .spv-pay td.ph{grid-area:ph;font-size:13px;font-weight:400;color:var(--muted);white-space:normal}
#depositContent .spv-pay td.ph::before{content:'Phorest: ';color:var(--muted2)}
#depositContent .spv-pay td.ph.none{display:none}
#depositContent .spv-pay td.amt{grid-area:amt;text-align:right;font-weight:700}
#depositContent .spv-pay td.dt{grid-area:meta;color:var(--muted);font-size:13px;white-space:normal}
#depositContent .spv-pay td.sl,#depositContent .spv-pay td.go{display:none!important}
#depositContent .spv-pay td.st{grid-area:stat;text-align:right}
#depositContent .spv-pay tr.spv-det{display:block}
#depositContent .spv-pay tr.spv-det td{display:block;padding:0 14px 12px}
#depositContent .spv-dgrid{grid-template-columns:1fr}
}
@media(min-width:761px){#depositContent .spv-pay td.dt .slp{display:none}}
#depositContent .spv-tabs{display:flex;gap:4px;margin:6px 0 0;border-bottom:1px solid var(--border)}
#depositContent .spv-tab{border:0;background:none;color:var(--muted);font:inherit;font-size:15px;padding:10px 16px;cursor:pointer;border-bottom:3px solid transparent;margin-bottom:-1px}
#depositContent .spv-tab[aria-selected="true"]{color:var(--text);font-weight:600;border-bottom-color:var(--accent)}
#depositContent .spv-tab .n{display:inline-block;margin-left:6px;font-size:12px;background:var(--s-bad);color:var(--s-bad-on);border-radius:999px;padding:1px 8px;font-weight:700}
#depositContent .spv-tab .n[hidden]{display:none}
#depositContent .opd-cards .spv-sc.quiet{grid-column:span 3}
#depositContent .opd-cards .spv-sc.act{grid-column:span 3}
#depositContent table.spv-opd{table-layout:fixed;min-width:var(--opd-w,1120px);width:max(100%,var(--opd-w,1120px))}
#depositContent .spv-opd td.num{white-space:nowrap}
/* the first column is frozen on a wide table: it needs a solid colour, or the next column shows through it (the status tints are see-through in dark mode) */
#depositContent .spv-opd th:first-child{background:var(--surface)}
#depositContent .spv-opd tr.opd-row td:first-child{background:var(--surface)}
#depositContent .spv-opd tr.opd-row.notco td:first-child{background:linear-gradient(var(--s-bad-bg),var(--s-bad-bg)),var(--surface)}
#depositContent .spv-opd tr.opd-row.nostripe td:first-child{background:linear-gradient(var(--s-info-bg),var(--s-info-bg)),var(--surface)}
#depositContent .spv-opd tr.opd-row.wrong td:first-child{background:linear-gradient(var(--s-warn-bg),var(--s-warn-bg)),var(--surface)}
#depositContent .spv-opd td{vertical-align:top}
#depositContent .spv-opd th.r{text-align:right}
#depositContent .spv-opd tr.opd-row.notco td{background:var(--s-bad-bg)}#depositContent .spv-opd tr.opd-row.nostripe td{background:var(--s-info-bg)}#depositContent .spv-opd tr.opd-row.wrong td{background:var(--s-warn-bg)}
#depositContent .spv-opd tr.opd-row.notco td:first-child{box-shadow:inset 5px 0 0 var(--s-bad)}
#depositContent .opd-cl{font-weight:600}
#depositContent .opd-bk{font-size:13.5px;color:var(--muted)}
#depositContent .opd-cl a.spv-bk{text-decoration:underline;text-decoration-style:solid;cursor:pointer}
#depositContent .opd-ct{font-size:13.5px;min-width:170px;word-break:break-word}#depositContent .opd-ct a{color:inherit;text-decoration:underline dotted;text-underline-offset:3px}
#depositContent .opd-todo{font-size:13.5px;color:var(--muted)}
@media(max-width:1000px){#depositContent .opd-cards .spv-sc,#depositContent .opd-cards .spv-sc.quiet,#depositContent .opd-cards .spv-sc.act{grid-column:span 6}}
@media(max-width:760px){
#depositContent .opd-cards .spv-sc,#depositContent .opd-cards .spv-sc.quiet,#depositContent .opd-cards .spv-sc.act{grid-column:span 1}
#depositContent table.spv-opd{min-width:0;width:100%;table-layout:auto}
#depositContent .spv-opd colgroup{display:none}
#depositContent .spv-opd thead{display:none}
#depositContent .spv-opd,#depositContent .spv-opd tbody,#depositContent .spv-opd tr,#depositContent .spv-opd td{display:block;width:100%}
#depositContent .spv-opd tr.opd-row{padding:10px 14px 10px 18px;border-bottom:1px solid var(--border)}
#depositContent .spv-opd tr.opd-row td{border:0;padding:3px 0;text-align:left!important;background:none!important;box-shadow:none!important}
#depositContent .spv-opd td[data-l]::before{content:attr(data-l) ": ";color:var(--muted2);font-size:12.5px}
#depositContent .spv-opd tr.opd-row.notco{background:var(--s-bad-bg);box-shadow:inset 5px 0 0 var(--s-bad)}
#depositContent .spv-opd tr.opd-row.nostripe{background:var(--s-info-bg)}#depositContent .spv-opd tr.opd-row.wrong{background:var(--s-warn-bg)}
#depositContent .opd-todo{max-width:none}
}

#depositContent .opd-th{display:inline-flex;align-items:center;gap:6px}
/* a sticky header row (Kate, 17 Nov 2026): the table is a scroll box as tall as the screen under the top bar, like Lost Clients, so the headings stay in view while the list scrolls */
#depositContent .opd-box{overflow:auto;max-height:calc(100vh - var(--topbar-cond-h,104px) - 28px);overscroll-behavior-x:contain}
#depositContent .opd-box thead th{position:sticky;top:0;z-index:5;background:var(--surface);box-shadow:0 1px 0 var(--border)}
#depositContent .opd-box thead th:first-child{left:0;z-index:6}
#depositContent .opd-box tbody td:first-child:not([colspan]){position:sticky;left:0}
#depositContent .opd-box tbody td:first-child{z-index:3}
#depositContent .spv-opd tr.opd-det td{padding:0 14px 16px;background:var(--surface2);white-space:normal}
#depositContent .spv-opd tr.opd-row.open td{border-bottom-color:transparent}
#depositContent .opd-wide{grid-column:1/-1}
#depositContent .opd-visit{margin:6px 0 10px}
#depositContent .opd-vl{list-style:none;margin:4px 0 0;padding:0;max-width:640px}
#depositContent .opd-vl li{display:flex;gap:12px;justify-content:space-between;padding:2px 0;font-size:14px}
#depositContent .opd-vl em{font-style:normal;color:var(--muted2)}
#depositContent .opd-vl .p{font-variant-numeric:tabular-nums;white-space:nowrap}
#depositContent .opd-save{display:flex;gap:6px;margin-left:auto;align-items:center}
#depositContent .opd-save .spv-schip{font-weight:600}
@media(max-width:760px){#depositContent .opd-box{overflow:visible;max-height:none}#depositContent .opd-save{margin-left:0;width:100%}#depositContent .opd-save .spv-schip{flex:1 1 0;justify-content:center}}
#depositContent .spv-opd th.r .opd-th{justify-content:flex-end}
#depositContent .opd-fb{border:0;background:none;color:var(--muted2);cursor:pointer;padding:3px;border-radius:6px;line-height:0}
#depositContent .opd-fb:hover{background:var(--surface2)}
#depositContent .opd-fb.on{color:var(--s-bad);background:var(--s-bad-bg)}
#depositContent .opd-colbar{display:none;gap:6px;overflow-x:auto;padding-bottom:4px;margin-bottom:8px;scrollbar-width:none}
#depositContent .opd-colbar .spv-schip{flex:0 0 auto}
#depositContent .spv-schip.opd-on{border-color:var(--accent);font-weight:600}
@media(max-width:760px){#depositContent .opd-colbar{display:flex}}
#depositContent .opd-pop{position:fixed;z-index:80;background:var(--surface);border:1px solid var(--border);border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.35);padding:10px;display:flex;flex-direction:column;gap:6px;overflow:auto;font-size:14px;color:var(--text)}
#depositContent .opd-pop [hidden]{display:none}
#depositContent .opd-pop-sort button{display:block;width:100%;text-align:left;border:0;background:none;color:inherit;font:inherit;padding:7px 8px;border-radius:8px;cursor:pointer}
#depositContent .opd-pop-sort button:hover,#depositContent .opd-pop-sel button:hover{background:var(--surface2)}
#depositContent .opd-pop-l{font-size:11.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted2);margin-top:4px}
#depositContent .opd-pop select,#depositContent .opd-pop input[type=text],#depositContent .opd-pop input[type=date],#depositContent .opd-pop input[type=search]{width:100%;font:inherit;font-size:13.5px;color:var(--text);background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:6px 8px}
#depositContent .opd-pop-in{display:grid;gap:6px}
#depositContent .opd-pop-sel{display:flex;gap:6px;align-items:center;font-size:13px;color:var(--muted2)}
#depositContent .opd-pop-sel button{border:0;background:none;color:var(--text);text-decoration:underline;font:inherit;cursor:pointer;padding:2px 6px;border-radius:6px}
#depositContent .opd-pop-list{max-height:170px;overflow:auto;border:1px solid var(--border2);border-radius:8px;padding:4px}
#depositContent .opd-pop-v{display:flex;gap:8px;align-items:center;padding:3px 4px;font-size:13.5px}
#depositContent .opd-pop-v span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#depositContent .opd-pop-v em{font-style:normal;color:var(--muted2);font-size:12.5px}
#depositContent .opd-pop-more{margin:6px;color:var(--muted2);font-size:13px}
#depositContent .opd-pop-act{display:flex;gap:6px;align-items:center}
#depositContent .opd-pop-act span{flex:1}
#depositContent .opd-pop-act button{border:1px solid var(--border);background:var(--surface);border-radius:999px;padding:6px 14px;font:inherit;cursor:pointer;color:inherit}
#depositContent .opd-pop-act button.ok{background:var(--accent);color:var(--accent-fg);border-color:transparent}
`;
  document.head.appendChild(st);
}
