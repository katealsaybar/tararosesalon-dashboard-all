// Google Reviews (Kate, 24 Nov 2026), built from the local mockup docs/mockups/google-reviews-revamp.html in the cowork repo. It replaces the old frame (add ons/google-reviews,
// whose files stay where they are). The page is drawn here, in the shell, so the masthead's Branch and Period drive it like every other report.
//
// Data: google_reviews (the Business Profile API sync, Metricool and the 24 Sep 2026 seed), staff_name_variants and google_review_client_credit, read with the signed-in client.
// A loader that fails throws and the page says so with a Try again button; it never draws an empty page as if there were no reviews.
// Who a review names is the old page's own logic, moved across unchanged: staff_name_variants spellings (loose, strict, strict + any case, not_after), the reviewer's own name,
// April and May read as months, the hand tags (staff_manual, staff_not), the client credit of the 14 days before, Fratelli's five barbers, Marasy matched by hand only and
// Bahrain reviews only for people whose home is Bahrain.
//
// Kate's rulings applied here: the masthead's Branch and Period drive the page; UAE Branches never count Bahrain (it is a row marked "not in the UAE total"
// on that view), Bahrain is its own view, and All = UAE + Bahrain (back on 25 Nov 2026) counts it in; Fratelli and Marasy (closed) count while the Period touches them; a closed salon never counts as waiting for a reply and Marasy's reply status is unknown, so it
// stays out of every reply figure; every table has the Google Sheets heading menus (sheet-table.js) and 10, 20, 50 or 100 rows with pages; every figure opens the reviews behind it
// (drill.js) down to a single review; XLSX and CSV on every table and once in the masthead (page-export.js); Why wall, "On this page" (data-jn), first-time guide.
// Needs from the shell (shared script scope): sb, sel, dateFrom, dateTo, dateToIso, activePeriodKey, isBahrainView, BH_BRANCHES, closedOffered, TRS_LEVEL; from drill.js TRSD;
// sheet-table.js TRSheet; why-wall.js whyWall; report-export.js rexButtons; staff-profiles.js STAFF_PROFILES.
(function () {
'use strict';

const BR = { KCA: 'Khalifa City A', SAA: 'Saadiyat', MC: 'Motor City', AQ: 'Al Quoz', BAH: 'Bahrain', FRT: 'Fratelli', MRY: 'Marasy' };
const DBN = { 'Khalifa City A, Abu Dhabi': 'KCA', 'Saadiyat, Abu Dhabi': 'SAA', 'Al Quoz, Dubai': 'AQ', 'Motor City, Dubai': 'MC', 'District 2, Bahrain': 'BAH', 'Fratelli Barbershop, Al Quoz': 'FRT', 'Marasy, Abu Dhabi': 'MRY' };
const UAE = ['KCA', 'SAA', 'MC', 'AQ'];
const ORDER = ['KCA', 'SAA', 'MC', 'AQ', 'FRT', 'MRY', 'BAH'];
const MRY_SPAN = { first: '2020-01-01', last: '2022-12-31' };   // the dates its email-notice reviews cover
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FULLMON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// Each review's own public Google link, rebuilt from its Maps review id and the branch's Maps CID (28 Sep 2026); the Business Profile link beside it is for replying.
const MAPS_CID = { KCA: '0x22d8bf3bc3c4e957', SAA: '0xe3bea74269b98995', AQ: '0x662e693c3678cb39', MC: '0x66221db8f29e9130', BAH: '0xf7a43c8e59e763dd' };
const GBP_LOC = { KCA: '5307528376474579201', SAA: '1607584651014081566', AQ: '15851980431586936756', MC: '1197765864514331563', BAH: '9531547727804411119' };
const BEAUTY_ROLES = new Set(['Beauty Therapist', 'Senior Beauty Therapist', 'Nail Technician', 'Senior Nail Technician', 'Beauty Team Member']);
const FRT_STAFF = ['GONCALO', 'HAFEZ', 'BILLY', 'MIHAELA', 'JOSH'];   // Fratelli's barbers who are tagged (18 Oct 2026); the others stay untagged
const ALSO_BRANCH = { 'HAZEL MAE': ['AQ'], GONCALO: ['FRT'], HAFEZ: ['FRT'], BILLY: ['FRT'], MIHAELA: ['FRT'], JOSH: ['FRT'] };
const MONTH_BEFORE = /(?:\b(?:in|on|of|since|last|this|next|early|late|mid|from|until|till|during|by)\s+)$/i;
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = (list, flags) => list.length ? new RegExp('(?<![\\p{L}])(' + list.map(reEsc).join('|') + ')(?![\\p{L}])', flags + 'u') : null;
const SC = { 1: 'var(--bad)', 2: 'color-mix(in srgb,var(--bad) 60%,var(--surface2,var(--border2)))', 3: 'var(--warn)', 4: 'color-mix(in srgb,var(--good) 45%,var(--surface2,var(--border2)))', 5: 'var(--good)' };

let RV = null, STAFF = [], VARIANTS = [], CREDIT = {}, CREDIT_OK = true, SYNC = null, LOADED_AT = 0, ERR = null, SEQ = 0, CAN_EDIT = false, GBP_ERR = '';
const GBP = {};
const T = {};   // the tables
const S = { v2: 'vis', v3: 'vis', v4: 'vis', v5: 'vis', v6: 'vis', v7: 'vis', team: 'A', teamB: 'A', tyB: { w: 1, s: 1, p: 1 }, tyS: { w: 1, p: 1 }, res: false, styN: 12, phN: 12, hk: 'avg', ak: 'what', rows: 10, open: {}, rf: { s: 'all', st: '', q: '', so: 'new', txt: 0, nr: 0, ph: 0, nt: 0, nl: 0 } };
try { const n = +localStorage.getItem('trs-reviews-rows'); if ([10, 20, 50, 100].includes(n)) S.rows = n; } catch (e) {}

// ── helpers ───────────────────────────────────────────────────────────────────────────
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => [].slice.call((r || document).querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const p2 = n => ('0' + n).slice(-2);
const n0 = v => Math.round(+v || 0).toLocaleString('en-GB');
const pf = (a, b) => b ? (Math.round(1000 * a / b) / 10).toFixed(1) + '%' : '0.0%';
const fd = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? p2(+m[3]) + ' ' + MON[+m[2] - 1] + ' ' + m[1] : ''; };   // 17 Nov 2026
const isoOf = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
const dIso = iso => new Date(iso + 'T00:00:00');
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' });
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70);
const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
const stars = n => '<span class="rv-st' + (n >= 4 ? ' good' : '') + '" aria-label="' + n + ' stars">' + '★'.repeat(n) + '<s>' + '★'.repeat(5 - n) + '</s></span>';
const photoUrl = (u, w) => u + '=w' + w + '-h' + w + '-p';
const snip = (t, n) => { t = (t || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : t; };
const num = (html, spec) => (typeof TRSD !== 'undefined' && spec) ? TRSD.num(html, spec) : html;
const fig = (n, spec) => n ? num(n0(n), spec) : '<span class="rv-z">' + n0(n) + '</span>';
const clk = (html, spec, n) => n ? num(html, spec) : html;
const pc = (n, den, spec) => clk(pf(n, den), spec, n);
const fp = (n, den, spec) => '<span class="rv-fp">' + fig(n, spec) + '<span class="rv-pcs">' + pc(n, den, spec) + '</span></span>';
const mg = (a, b) => Object.assign({}, a, b);
const avg = o => o.n ? (o.sum / o.n).toFixed(2) : '–';

// ── the masthead: which salons, which dates ───────────────────────────────────────────
const bah = () => typeof isBahrainView === 'function' && isBahrainView();
const grp = () => typeof isGroupView === 'function' && isGroupView();   // All = UAE + Bahrain (Kate, 25 Nov 2026)
function range() {   // [from or null for all time, to]
  const t = today();
  let a = null, b = t;
  try {
    if (typeof dateFrom !== 'undefined' && dateFrom && typeof dateTo !== 'undefined' && dateTo) {
      const all = (typeof activePeriodKey === 'function' && activePeriodKey() === 'All time') || dateFrom.getFullYear() <= 2000;
      a = all ? null : dateToIso(dateFrom); b = dateToIso(dateTo);
    } else { const d = new Date(); d.setDate(d.getDate() - 89); a = isoOf(d); }
  } catch (e) {}
  if (b > t) b = t;
  return [a, b];
}
function codes() {
  if (bah()) return ['BAH'];
  const [a, b] = range();
  const s = (typeof sel !== 'undefined' && sel.branch) ? sel.branch : ['all'];
  if (!s.length || s.includes('all')) {
    const c = UAE.slice();
    if (!a || (a <= MRY_SPAN.last && b >= MRY_SPAN.first)) c.push('MRY');   // Marasy's reviews cover Jan 2020 to Dec 2022
    if (typeof closedOffered === 'function' && closedOffered('FRT')) c.push('FRT');
    if (grp()) c.push('BAH');
    return c;
  }
  return ORDER.filter(c => s.includes(c) && c !== 'BAH');
}
const inBr = r => codes().includes(r.b);
function inPer(r) { const [a, b] = range(); return !!r.d && (!a || r.d >= a) && r.d <= b; }
const vis = () => RV.filter(r => inBr(r) && inPer(r));
function label() { const c = codes(); if (bah()) return 'Bahrain'; if (grp()) return 'All · UAE + Bahrain'; const open = c.filter(x => x !== 'FRT' && x !== 'MRY'); return open.length === UAE.length && sel_all() ? 'UAE Branches' : c.map(x => BR[x]).join(', '); }
const sel_all = () => !(typeof sel !== 'undefined' && sel.branch && sel.branch.length && !sel.branch.includes('all'));
function periodText() { const [a, b] = range(); return a ? fd(a) + ' to ' + fd(b) : 'All time, up to ' + fd(b); }
const waiting = r => r.b !== 'MRY' && r.b !== 'FRT' && !r.rep;   // a closed salon never waits for a reply; Marasy's reply status is unknown

function stat(rows) {
  const o = { n: rows.length, sum: 0, c: 0, w: 0, rp: 0, kn: 0, five: 0, cnt: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
  rows.forEach(r => { o.sum += r.s; o.cnt[r.s]++; if (r.s <= 3) o.c++; if (r.s === 5) o.five++; if (waiting(r)) o.w++; if (r.b !== 'MRY') { o.kn++; if (r.rep) o.rp++; } });
  o.pr = o.cnt[4] + o.cnt[5];
  return o;
}

// ── data ──────────────────────────────────────────────────────────────────────────────
async function pages(make) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const r = await make(from, from + 999);
    if (r.error) throw r.error;
    out.push(...(r.data || []));
    if ((r.data || []).length < 1000) break;
  }
  return out;
}
function googleUrl(r) {
  let id = String(r.id || '').replace(/^seed:/, '');
  if (!/^C[hi]/.test(id)) id = (window.REVIEW_MAPS_IDS || {})[id] || (String(r.url || '').match(/\/reviews\/(C[hi][\w-]+)/) || [])[1] || '';
  const cid = MAPS_CID[r.b];
  if (!id || !cid) return '';
  let inner = '';
  try { const b = atob(id.replace(/-/g, '+').replace(/_/g, '/')); if (b.charCodeAt(0) === 10) inner = b.substr(2, b.charCodeAt(1)); } catch (e) {}
  return 'https://www.google.com/maps/reviews/data=' + (inner ? `!4m8!14m7!1m6!2m5!1s${id}!2m1!1s0x0:${cid}!3m1!1s2@1:${inner}%7C%7C` : `!4m6!14m5!1m4!2m3!1s${id}!2m1!1s0x0:${cid}`) + '?hl=en';
}
const gbpUrl = r => r.url || (GBP_LOC[r.b] ? `https://www.google.com/local/business/${GBP_LOC[r.b]}/customers/reviews?knm=0&ih=lu&hl=en&dcs=1` : '');

async function loadAll() {
  const cols = 'review_id,branch,stars,reviewer,comment,review_date,date_approx,when_text,replied,reply,url,source,synced_at,photos,gbp_name,staff_manual,staff_not';
  const rows = await pages((a, b) => sb.from('google_reviews').select(cols).order('review_date', { ascending: false }).order('review_id').range(a, b));
  if (!rows.length) throw new Error('google_reviews is empty');
  const vr = await sb.from('staff_name_variants').select('staff_key,variant,strict,ci,not_after,label,home_branch,photo,role');
  if (vr.error) throw vr.error;
  CREDIT = {}; CREDIT_OK = true;
  try {
    const cr = await pages((a, b) => sb.from('google_review_client_credit').select('review_id,staff_key').range(a, b));
    cr.forEach(c => { if (c.staff_key) (CREDIT[c.review_id] = CREDIT[c.review_id] || []).push(c.staff_key); });
  } catch (e) { console.warn('Google reviews: client credit did not load', e); CREDIT_OK = false; }
  VARIANTS = vr.data || [];
  RV = rows.map(r => ({ id: r.review_id, b: DBN[r.branch] || null, s: r.stars, n: r.reviewer || 'Anonymous', d: r.review_date || '', t: r.comment || '', rep: !!r.replied, rp: r.reply || '', url: r.url, approx: r.date_approx,
    when: r.when_text, ph: r.photos || [], manual: r.staff_manual || [], not: r.staff_not || [] })).filter(r => r.b && r.s >= 1 && r.s <= 5);
  SYNC = { last: rows.reduce((m, r) => (r.synced_at || '') > m ? r.synced_at : m, ''), live: new Set(rows.filter(r => r.gbp_name).map(r => DBN[r.branch])) };
  buildStaff(); RV.forEach(tagStaff);
  RV.forEach((r, i) => { r.i = i; });
  LOADED_AT = Date.now();
  try { if (window.TRSAuth && TRSAuth.token && TRSAuth.token()) { const x = await sb.rpc('google_review_can_edit'); CAN_EDIT = !x.error && x.data === true; } } catch (e) { CAN_EDIT = false; }
}

// ── who a review names (the old page's logic, unchanged) ─────────────────────────────
const atBranch = (s, r) => r.b === s.branch || (s.also || []).includes(r.b);
function buildStaff() {
  const by = {}; VARIANTS.forEach(v => (by[v.staff_key] = by[v.staff_key] || []).push(v));
  const prof = typeof STAFF_PROFILES !== 'undefined' ? STAFF_PROFILES : {};
  const seen = new Set();
  const make = (k, p, lab) => {
    const vs = by[k] || [{ variant: lab, strict: false }];
    const loose = vs.filter(v => !v.strict).map(v => v.variant).sort((a, b) => b.length - a.length);
    const strict = vs.filter(v => v.strict && !v.ci).map(v => v.variant).sort((a, b) => b.length - a.length);
    const strictCi = vs.filter(v => v.strict && v.ci).map(v => v.variant).sort((a, b) => b.length - a.length);
    return { key: k, label: lab, branch: BR[p.branch] ? p.branch : null, also: ALSO_BRANCH[k] || [], role: p.role || '', resigned: !!p.resigned,
      photo: p.photoFull ? encodeURI(p.photoFull) : p.photo ? 'assets/staff/' + encodeURIComponent(p.photo) : null,
      notAfter: Object.fromEntries(vs.filter(v => v.not_after).map(v => [v.variant.toLowerCase(), new RegExp('(?<![\\p{L}])' + reEsc(v.not_after) + '\\s+$', 'iu')])),
      ownRes: vs.map(v => ({ n: v.variant, re: wordRe([v.variant], 'i') })),
      loose: wordRe(loose, 'gi'), strict: wordRe(strict, 'g'), strictCi: wordRe(strictCi, 'gi') };
  };
  const extra = Object.entries(by).filter(([k]) => !prof[k]).map(([k, vs]) => { const row = vs.find(v => v.label || v.home_branch || v.photo || v.role) || vs[0];
    return make(k, { branch: row.home_branch, photoFull: row.photo || null, role: row.role || '' }, row.label || row.variant); });
  STAFF = [...Object.entries(prof).filter(([k]) => !k.includes('/')).map(([k, p]) => make(k, p, k.length <= 2 ? k : k.toLowerCase().replace(/(^|\s)[a-z]/g, c => c.toUpperCase()))), ...extra]
    .filter(s => { const id = s.photo || s.key; if (seen.has(id)) return false; seen.add(id); return true; });
  STAFF.forEach(s => { s.team = BEAUTY_ROLES.has(s.role) ? 'Beauty' : 'Hair'; });
}
const staffBy = k => STAFF.find(s => s.key === k);
function tagStaffAuto(r) {
  r.staff = []; r.hits = []; r.viaClient = false;
  if (!r.t) { if (r.id && CREDIT[r.id]) { r.staff = [...new Set(CREDIT[r.id])]; r.viaClient = true; } return; }
  const frt = r.b === 'FRT';
  if (r.b === 'MRY') return;   // Marasy's stylists are matched by hand
  const bahrain = r.b === 'BAH';
  STAFF.forEach(s => {
    if (frt && !FRT_STAFF.includes(s.key)) return;
    if (bahrain && s.branch !== r.b) return;   // Bahrain reviews only count for someone whose home is Bahrain
    let own; const hits = [];
    [[s.loose, true], [s.strict, atBranch(s, r)], [s.strictCi, atBranch(s, r)]].forEach(([re, ok]) => {
      if (!re || !ok) return;
      re.lastIndex = 0; let m;
      while ((m = re.exec(r.t))) {
        const w = m[1];
        if (own === undefined) own = (s.ownRes.find(o => o.re.test(r.n || '')) || {}).n || null;   // a client signing off with her own name is not naming a stylist
        if (own && own.toLowerCase() === w.toLowerCase()) continue;
        const na = s.notAfter[w.toLowerCase()];
        if (na && na.test(r.t.slice(Math.max(0, m.index - 20), m.index))) continue;
        if ((w === 'April' || w === 'May') && (MONTH_BEFORE.test(r.t.slice(Math.max(0, m.index - 12), m.index)) || /^\s*\d/.test(r.t.slice(m.index + w.length)))) continue;
        hits.push([m.index, m.index + w.length]);
      }
    });
    if (hits.length) { r.staff.push(s.key); r.hits.push(...hits); }
  });
  if (!frt && !r.staff.length && r.id && CREDIT[r.id]) { r.staff = [...new Set(CREDIT[r.id])]; r.viaClient = true; }
}
function tagStaff(r) {
  tagStaffAuto(r);
  r.named = r.viaClient ? [] : r.staff.slice();
  const man = (r.manual || []).filter(k => staffBy(k));
  if (man.length) { r.staff = [...new Set([...r.named, ...man])]; r.viaClient = false; }
  if (r.not && r.not.length) { r.staff = r.staff.filter(k => !r.not.includes(k)); r.named = [...r.named.filter(k => !r.not.includes(k)), ...man.filter(k => r.staff.includes(k))]; }
  if (r.b === 'MRY') r.named = man;
  r.sf = r.staff;
}
function markNames(r) {
  if (!r.hits || !r.hits.length) return esc(r.t);
  const hs = [...r.hits].sort((a, b) => a[0] - b[0]); let out = '', at = 0;
  hs.forEach(([a, b]) => { if (a < at) return; out += esc(r.t.slice(at, a)) + '<mark class="rv-m">' + esc(r.t.slice(a, b)) + '</mark>'; at = b; });
  return out + esc(r.t.slice(at));
}

// ── the windows a figure opens: reviews, then one review (the last step) ───────────────
function tyStr(st) { let o = ''; ['w', 's', 'p'].forEach(k => { if (st[k]) o += k; }); return o === 'wsp' ? '' : o; }
const typeMatch = (r, ty) => !ty || (ty.includes('w') && !!r.t) || (ty.includes('s') && !r.t) || (ty.includes('p') && r.ph.length > 0);
// Staff named: a review with no words still counts as written when it is credited to a stylist by her client's visit or by a hand tag.
const typeMatchS = (r, ty) => !ty || (ty.includes('w') && (!!r.t || r.viaClient || (r.manual || []).length > 0)) || (ty.includes('p') && r.ph.length > 0);
const tmMatch = (r, tm) => !tm || tm === 'A' || r.sf.some(k => (staffBy(k) || {}).team === tm);
function listRows(d) {
  let rows = d.all ? RV : RV.filter(inPer);
  if (d.from) rows = rows.filter(r => r.d >= d.from && r.d <= d.to);
  rows = d.b ? rows.filter(r => r.b === d.b) : rows.filter(inBr);
  if (d.sf) rows = rows.filter(r => r.sf.includes(d.sf));
  if (d.pr) rows = rows.filter(r => r.s >= 4);
  if (d.s) rows = rows.filter(r => r.s === d.s);
  if (d.ty) rows = rows.filter(r => (d.sty ? typeMatchS : typeMatch)(r, d.ty));
  if (d.tm) rows = rows.filter(r => tmMatch(r, d.tm));
  if (d.ph) rows = rows.filter(r => r.ph.length);
  if (d.cp) rows = rows.filter(r => r.s <= 3);
  if (d.w) rows = rows.filter(waiting);
  if (d.rp) rows = rows.filter(r => r.rep && r.b !== 'MRY');
  return rows.slice().sort((a, b) => a.d < b.d ? 1 : a.d > b.d ? -1 : 0);
}
const D = (k, t, x) => Object.assign({ k, t }, x || {});
function spec(d) {
  return { title: d.t, sub: d.all ? 'all time' : periodText(), sk: slug(d.k + ' ' + d.t), views: [{ id: 'list', label: 'Reviews', load: async () => listRes(d) }] };
}
const rDate = r => (r.approx ? '≈ ' : '') + fd(r.d);
function listRes(d) {
  const rows = listRows(d);
  const one = r => oneSpec(r);
  const salonSpec = r => spec(mg(d, { t: BR[r.b] + ', ' + d.t, b: r.b, k: 'salon' }));
  const starSpec = r => spec(mg(d, { t: r.s + (r.s === 1 ? ' star, ' : ' stars, ') + d.t, s: r.s, k: 'stars' }));
  return {
    sub: plural(rows.length, 'review') + ' · ' + (d.all ? 'all time' : (d.from ? 'written ' + fd(d.from > (range()[0] || '') ? d.from : (range()[0] || d.from)) + ' to ' + fd(d.to < range()[1] ? d.to : range()[1]) : 'written ' + periodText())) + '. Tap a salon, a star count, a name or the words to go one level deeper.',
    cols: [{ k: 'd', l: 'Date', t: 'date' }, { k: 'b', l: 'Salon', t: 'text' }, { k: 's', l: 'Stars', t: 'num' }, { k: 'n', l: 'Reviewer', t: 'text' }, { k: 'x', l: 'What she said', t: 'html' },
      { k: 'ph', l: 'Photos', t: 'num' }, { k: 'staff', l: 'Staff named', t: 'text' }, { k: 'r', l: 'Reply', t: 'text' }],
    rows: rows.map(r => ({ d: r.d, b: BR[r.b], s: r.s, n: r.n, ph: r.ph.length, staff: r.sf.map(k => (staffBy(k) || {}).label || k).join(', '),
      r: r.b === 'MRY' ? 'Unknown' : r.rep ? 'Replied' : r.b === 'FRT' ? 'Closed salon' : 'Waiting',
      x: r.t ? num('<span class="rv-sn">' + esc(r.t) + '</span>', one(r)) : '<span class="rv-nt">(stars only)</span>',
      _dn: { b: salonSpec(r), s: starSpec(r), n: one(r), ph: r.ph.length ? one(r) : null } })),
    foot: { n: 'Total: ' + plural(rows.length, 'review') }
  };
}
function oneSpec(r) {
  return { title: 'Review by ' + r.n, sub: BR[r.b] + ' · ' + fd(r.d) + ' · ' + plural(r.s, 'star'), sk: slug('review ' + r.n + ' ' + r.d + ' ' + r.i), panel: true, tip: 'Open this review', views: [{ id: 'one', label: 'Review', load: async () => oneRes(r) }] };
}
function oneRes(r) {
  const g = googleUrl(r), u = gbpUrl(r), miss = !g && MAPS_CID[r.b];
  const chips = r.staff.map(k => { const s = staffBy(k), hand = !r.viaClient && (r.manual || []).includes(k) && !(r.named || []).includes(k); return s ? `<span class="rv-chip">${esc(s.label)}${r.viaClient ? ' <em>client</em>' : hand ? ' <em>tagged</em>' : ''}</span>` : ''; }).join('');
  const rows = [
    { f: 'Salon', v: esc(BR[r.b]) }, { f: 'Date', v: esc(fd(r.d)) + (r.approx ? ' <span class="rv-nt">(approximate, from Google Maps)</span>' : '') }, { f: 'Stars', v: stars(r.s) }, { f: 'Reviewer', v: esc(r.n) },
    { f: 'What she said', v: r.t ? '<div class="rv-one-t">' + markNames(r) + '</div>' : '<span class="rv-nt">She left stars only, no words.</span>' }
  ];
  if (chips) rows.push({ f: 'Staff named', v: chips });
  if (r.ph.length) rows.push({ f: 'Photos', v: '<div class="rv-photos">' + r.ph.map((x, k) => `<button type="button" class="rv-pt" data-rv-lb="${r.i}:${k}" aria-label="Photo ${k + 1} of ${r.ph.length}"><img src="${esc(photoUrl(x, 360))}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"></button>`).join('') + '</div>' });
  rows.push({ f: 'Our reply', v: r.b === 'MRY' ? '<span class="rv-nt">Unknown: Marasy reviews come from Google’s email notices, which do not show replies.</span>' : r.rep ? '<div class="rv-or">' + esc(r.rp || '(reply held on Google)') + '</div>' : (r.b === 'FRT' ? '<span class="rv-nt">Closed salon, so nothing is waiting.</span>' : '<div class="rv-or none"><b>No reply from us yet.</b></div>') });
  rows.push({ f: 'On Google', v: (g ? `<a class="rv-lnk" href="${esc(g)}" target="_blank" rel="noopener">View on Google ↗</a>` : '') + (miss ? '<span class="rv-nt">No link to this review yet: it has no Google review id on file, and the branch page is not the review.</span>' : '') + (u ? `<a class="rv-lnk" href="${esc(u)}" target="_blank" rel="noopener">${r.url ? 'Reply in Business Profile →' : 'Open this branch’s reviews in Business Profile →'}</a>` : '') });
  if (CAN_EDIT && r.id) rows.push({ f: 'Match staff', v: `<div class="rv-match" data-rv-match="${r.i}">${matchHtml(r)}</div>` });
  return { cols: [{ k: 'f', l: 'Detail', t: 'text' }, { k: 'v', l: 'This review', t: 'html' }], rows, sub: 'This is the last step: a single review has nothing behind it.' };
}
// Match staff (Kate, 19 Oct 2026): the owner login tags a review to a stylist, or says a name in the text is not hers. google_review_set_staff refuses anyone else.
function matchHtml(r, msg) {
  const man = r.manual || [], nots = r.not || [], named = r.named || [];
  const lab = k => esc((staffBy(k) || { label: k }).label);
  const cur = r.staff.map(k => { const hand = man.includes(k) && !named.includes(k), how = hand ? 'by hand' : (r.viaClient ? 'client credit' : 'named in the text');
    return `<span class="rv-chip"><b>${lab(k)}</b> <em>${how}</em>${hand ? `<button type="button" data-rv-mt="remove:${esc(k)}">Remove</button>` : `<button type="button" data-rv-mt="not:${esc(k)}">Not her</button>`}</span>`; }).join('') || '<span class="rv-nt">Nobody tagged on this review yet</span>';
  const off = nots.map(k => `<span class="rv-chip"><b>${lab(k)}</b> <em>excluded</em><button type="button" data-rv-mt="undo:${esc(k)}">Undo</button></span>`).join('');
  const taken = new Set(r.staff);
  const opts = STAFF.filter(s => !taken.has(s.key)).sort((a, b) => ((b.branch === r.b) - (a.branch === r.b)) || a.label.localeCompare(b.label)).map(s => `<option value="${esc(s.key)}">${esc(s.label)}${s.resigned ? ' (former)' : ''}${s.branch ? ' · ' + esc(BR[s.branch]) : ''}</option>`).join('');
  return `<div>${cur}${off}</div><div class="rv-mrow"><select class="rv-msel" aria-label="Add a staff member"><option value="">Add staff…</option>${opts}</select><button type="button" class="cm-pill" data-rv-mt="add:">Add</button></div>${msg ? '<div class="rv-nt">' + esc(msg) + '</div>' : ''}`;
}
async function saveMatch(r, box, manual, not) {
  try {
    const out = await sb.rpc('google_review_set_staff', { p_review_id: r.id, p_manual: manual, p_not: not });
    if (out.error) throw out.error;
    r.manual = (out.data && out.data.manual) || []; r.not = (out.data && out.data.not) || []; tagStaff(r);
    box.innerHTML = matchHtml(r, 'Saved'); draw();
  } catch (e) { box.innerHTML = matchHtml(r, 'Not saved: ' + (/Level 5|403|401/.test(String(e.message || e)) ? 'only the owner login can match staff' : String(e.message || e).slice(0, 120))); }
}

// ── the numbers ───────────────────────────────────────────────────────────────────────
function salRows(all) {
  const P = RV.filter(r => all || inPer(r));
  const list = codes().map(c => ({ c, extra: false }));
  if (!bah() && !grp()) list.push({ c: 'BAH', extra: true });
  return list.map(x => mg(x, { o: stat(P.filter(r => r.b === x.c)) }));
}
function salTotal(rows) {
  const o = { n: 0, sum: 0, c: 0, w: 0, rp: 0, kn: 0, five: 0, cnt: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, pr: 0 };
  rows.forEach(r => { if (r.extra) return; ['n', 'sum', 'c', 'w', 'rp', 'kn', 'five', 'pr'].forEach(k => { o[k] += r.o[k]; }); for (let k = 1; k <= 5; k++) o.cnt[k] += r.o.cnt[k]; });
  return o;
}
function buckets() {
  const [a0, b0] = range(), b = dIso(b0);
  let a = a0 ? dIso(a0) : null;
  if (!a) { const first = RV.filter(inBr).reduce((m, r) => r.d && (!m || r.d < m) ? r.d : m, ''); a = first ? dIso(first) : new Date(b.getFullYear(), 0, 1); }
  const months = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth() + 1, max = 12;
  const unit = months <= max ? 1 : months <= max * 3 ? 3 : 12;
  let m = a.getMonth(); if (unit === 3) m -= m % 3; if (unit === 12) m = 0;
  const out = [];
  for (let d = new Date(a.getFullYear(), m, 1); d <= b; d = new Date(d.getFullYear(), d.getMonth() + unit, 1)) {
    const e = new Date(d.getFullYear(), d.getMonth() + unit, 0), mm = d.getMonth(), yy = d.getFullYear();
    out.push({ a: isoOf(d), z: isoOf(e), lab: unit === 1 ? MON[mm] + (mm === 0 || !out.length ? '<small>' + String(yy).slice(2) + '</small>' : '') : unit === 3 ? 'Q' + (mm / 3 + 1) + '<small>' + String(yy).slice(2) + '</small>' : String(yy),
      long: unit === 1 ? FULLMON[mm] + ' ' + yy : unit === 3 ? MON[mm] + ' to ' + MON[mm + 2] + ' ' + yy : String(yy) });
  }
  return out;
}
function monRows() {
  const P = vis();
  return buckets().map(b => { const l = P.filter(r => r.d >= b.a && r.d <= b.z), c = l.filter(r => r.s <= 3); return { b, n: l.length, c: c.length, rp: c.filter(r => r.rep && r.b !== 'MRY').length, w: l.filter(waiting).length }; });
}
function styRows() {
  const m = {}, ty = tyStr(S.tyS);
  vis().filter(r => typeMatchS(r, ty)).forEach(r => r.sf.forEach(k => { (m[k] = m[k] || []).push(r); }));
  return Object.keys(m).map(k => ({ s: staffBy(k), o: stat(m[k]) })).filter(x => x.s && (S.team === 'A' || x.s.team === S.team) && (S.res || !x.s.resigned))
    .sort((a, b) => b.o.pr - a.o.pr || b.o.n - a.o.n || a.s.label.localeCompare(b.s.label));
}
function brRows() {
  const ty = tyStr(S.tyB), P = RV.filter(r => inPer(r) && typeMatch(r, ty) && tmMatch(r, S.teamB));
  const list = codes().map(c => ({ c, extra: false }));
  if (!bah() && !grp()) list.push({ c: 'BAH', extra: true });
  return list.map(x => mg(x, { o: stat(P.filter(r => r.b === x.c)) }));
}

// ── draw: the page ────────────────────────────────────────────────────────────────────
function shell() {
  return `
    <section class="rv-intro"><h2>Google Reviews</h2><p id="rvLead">Loading the reviews…</p></section>
    <div id="rvWhy"></div>
    <div id="rvBody"><p class="slv-muted" style="margin-top:16px">Loading reviews…</p></div>`;
}
const rx = fn => typeof rexButtons === 'function' ? rexButtons(fn) : '';
function bodyHtml() {
  const bar = (id, extra) => `<div class="rv-bar" id="rvB${id}"><div class="sc-seg" role="group" aria-label="View"><button type="button" data-rv-v="${id}:vis">Visual</button><button type="button" data-rv-v="${id}:tab">Table</button></div>${extra || ''}<span class="rv-sp"></span><button type="button" class="cm-pill rv-phone" data-sxcm="${({ 2: 'rvsal', 3: 'rvmon', 4: 'rvsty', 5: 'rvstar', 6: 'rvgbp', 7: 'rvbr' })[id]}" hidden>Sort and filter</button>${rx(({ 2: 'rvExportSal', 3: 'rvExportMon', 4: 'rvExportSty', 5: 'rvExportStar', 6: 'rvExportGbp', 7: 'rvExportBr' })[id])}</div>`;
  const more = id => `<button type="button" class="cm-pill" data-rv-more="${id}" aria-pressed="false" hidden>All columns</button>`;
  const team = (k, cur) => `<div class="sc-seg" role="group" aria-label="Team">${[['A', 'All teams'], ['Hair', 'Hair'], ['Beauty', 'Beauty']].map(t => `<button type="button" data-rv-team="${k}:${t[0]}">${t[1]}</button>`).join('')}</div>`;
  const pager = id => `<div class="rv-pager" id="rvPg${id}" hidden><span class="rv-pgt"></span><span class="rv-sp"></span><span class="slv-eyebrow">Rows</span><select data-rv-rows="${id}" aria-label="Rows to show"><option>10</option><option>20</option><option>50</option><option>100</option></select><button type="button" class="cm-pill" data-rv-pg="${id}:-1">‹ Previous</button><span class="rv-pgn"></span><button type="button" class="cm-pill" data-rv-pg="${id}:1">Next ›</button></div>`;
  return `
    <section class="rv-ans" aria-label="The answer in one line"><div class="rv-ans-k">The answer in one line</div><div class="rv-ans-t" id="rvAns"></div><div class="rv-ans-s" id="rvAns2"></div></section>
    <div class="rv-tiles" id="rvSum"></div>

    <section class="rv-sec" data-jn="Where to start" id="rvSec1">
      <h3>Where to start</h3>
      <div class="rv-learn"><p><b>What is this?</b> On the left, each salon: reviews, average stars, complaints, replies waiting. On the right, complaints month by month.</p>
        <p><b>Why it matters.</b> It shows where to start, and when something went wrong.</p>
        <p class="watch"><b>What to watch.</b> <span id="rvW2"></span> <span id="rvW3"></span></p></div>
      <div class="rv-two">
        <div class="rv-box"><h3 class="rv-bt">Which salon needs you</h3>${bar(2, more(2))}
          <div id="rvSalV"><div class="rv-fun" id="rvSal"></div><p class="rv-hint">The bar is the number of complaints (1 to 3 stars). Hover or tap a row for the answer.</p></div>
          <div id="rvSalT" hidden><div class="rv-tw"><table id="rvTSal"></table></div></div></div>
        <div class="rv-box"><h3 class="rv-bt">Complaints by month</h3>${bar(3)}
          <div class="rv-monv" id="rvMonV"><div class="rv-mon" id="rvMon"></div><div class="rv-ml" id="rvMonL"></div><div class="rv-leg"><span><i style="background:var(--rv-bar)"></i>Complaints</span><span><i style="background:var(--rv-fill)"></i>with a reply from us</span></div></div>
          <div id="rvMonT" hidden><div class="rv-tw"><table id="rvTMon"></table></div>${pager('Mon')}</div></div>
      </div>
    </section>

    <section class="rv-sec" data-jn="Reviews by" id="rvSec2">
      <h3>Reviews by</h3>
      <div class="rv-learn"><p><b>What is this?</b> Every review, counted two ways: by salon, and by the stylist clients name.</p>
        <p><b>Why it matters.</b> By Branch counts every review, including stars only and reviews that name nobody. Staff named shows what clients notice and thank us for, so the team can teach it on.</p>
        <p class="watch"><b>What to watch.</b> <span id="rvWB" style="display:block"></span><span id="rvW4" style="display:block"></span></p></div>

      <h3 class="rv-sh" data-jn="By Branch" id="rvSec2a">By Branch</h3>
      ${bar(7, `${team('B')}<div class="rv-ty" id="rvTyB" role="group" aria-label="Review type"><label><input type="checkbox" data-rv-ty="B:w"> Written</label><label><input type="checkbox" data-rv-ty="B:s"> Stars only</label><label><input type="checkbox" data-rv-ty="B:p"> With photos</label></div>${more(7)}`)}
      <div id="rvBrV"><div class="rv-fun rv-sty" id="rvBrBars"></div><div class="rv-leg" id="rvBrLeg"></div></div>
      <div id="rvBrT" hidden><div class="rv-card rv-tw"><table id="rvTBr"></table></div></div>
      <p class="rv-hint">A review counts once, whether or not it has words, a photo or a stylist's name. Hair and Beauty count only reviews that name someone in that team, so reviews that name nobody show under All teams. Tick the boxes to choose which reviews are counted.</p>

      <h3 class="rv-sh" data-jn="Staff named" id="rvSec2b">Staff named</h3>
      ${bar(4, `${team('S')}<div class="rv-ty" id="rvTyS" role="group" aria-label="Review type"><label><input type="checkbox" data-rv-ty="S:w"> Written</label><label><input type="checkbox" data-rv-ty="S:p"> With photos</label></div><button type="button" class="cm-pill" data-rv-res aria-pressed="false">With resigned staff</button>${more(4)}`)}
      <div id="rvStyV"><div class="rv-fun rv-sty" id="rvStyBars"></div><div class="rv-leg" id="rvStyLeg"></div></div>
      <div id="rvStyT" hidden><div class="rv-card rv-tw"><table id="rvTSty"></table></div>${pager('Sty')}</div>
      <button type="button" class="cm-pill rv-more" id="rvStyMore" hidden></button>
      <p class="rv-hint">Sorted by reviews with 4 or 5 stars. A review counts for a stylist when its words name her at her own salon, so a review with no words never shows here and there is no Stars only box. A review that names nobody but came from her client in the 14 days before counts for her too, and is marked client.</p>
    </section>

    <section class="rv-sec" data-jn="Client photos" id="rvSec3">
      <h3>Photos clients added</h3>
      <div class="rv-learn"><p><b>What is this?</b> Reviews where the client added her own photos, newest first.</p>
        <p><b>Why it matters.</b> A photo is the proof: it shows the colour or the cut, and the next client sees it too.</p>
        <p class="watch"><b>What to watch.</b> <span id="rvPhCount"></span></p></div>
      <div class="rv-wall" id="rvPhWall"></div>
      <button type="button" class="cm-pill rv-more" id="rvPhMore" hidden></button>
    </section>

    <section class="rv-sec" data-jn="Every review" id="rvSecR">
      <h3>Every review</h3>
      <div class="rv-learn"><p><b>What is this?</b> The reviews themselves for the Branch and Period at the top. Narrow them by stars, by the stylist named, by what the client wrote, or by a word.</p>
        <p><b>Why it matters.</b> A count only says how many. Here you read the reviews, find the ones that name a stylist or still wait for a reply, and open any one to answer it on Google.</p>
        <p class="watch"><b>What to watch.</b> <span id="rvRfW"></span></p></div>
      <div class="rv-rf" id="rvRf">
        <div class="rv-rfr"><span class="rv-rfl">Rating</span><div class="rv-chips" id="rvRfS"></div></div>
        <div class="rv-rfr"><span class="rv-rfl">Staff</span><span id="rvRfStW"></span><span class="rv-rfl rv-rfl2">Sort</span><span id="rvRfSoW"></span></div>
        <div class="rv-rfr"><span class="rv-rfl">Show only</span><div class="rv-chips" id="rvRfM"></div></div>
        <div class="rv-rfr"><input type="search" class="rv-q" id="rvRfQ" placeholder="Search review text, reviewer, stylist name…" aria-label="Search the reviews" autocomplete="off"><button type="button" class="cm-pill" data-rv-rfreset>Reset refine</button></div>
      </div>
      <div class="rv-bar" id="rvB8"><span class="rv-cnt" id="rvRfC"></span><span class="rv-sp"></span><button type="button" class="cm-pill rv-phone" data-sxcm="rvrev">Sort and filter</button><button type="button" class="cm-pill" data-rv-more="8" aria-pressed="false">All columns</button>${rx('rvExportRev')}</div>
      <div class="rv-card rv-tw"><table id="rvTRev"></table></div>
      ${pager('Rev')}
      <p class="rv-hint">Newest first until you pick another Sort or use a heading menu. Tap a star count, a name or the words to open that review.</p>
    </section>

    <section class="rv-sec" data-jn="More detail" id="rvSec4">
      <h3>More detail</h3>
      <p class="rv-hint" style="margin:0 0 10px">Closed until you open them. Each opens a table with the same heading menus.</p>
      <div class="rv-dets">
        <details class="rv-det" data-rv-det="star"><summary><span>Every star, all time<small>1 to 5 stars for each salon, whatever the Period</small></span></summary>
          <div class="rv-db">${bar(5, more(5))}<div id="rvStarV"><div class="rv-fun" id="rvStarBars"></div><div class="rv-leg" id="rvStarLeg"></div></div><div id="rvStarT" hidden><div class="rv-card rv-tw"><table id="rvTStar"></table></div></div></div></details>
        <details class="rv-det" data-rv-det="gbp"><summary><span>How people find each salon on Google<small>views, calls, directions, website</small></span></summary>
          <div class="rv-db">${bar(6, more(6))}<div id="rvGbpV"><div class="rv-fun" id="rvGbpBars"></div></div><div id="rvGbpT" hidden><div class="rv-card rv-tw"><table id="rvTGbp"></table></div></div><p class="rv-hint" id="rvGbpNote"></p></div></details>
        <details class="rv-det" data-rv-det="notes"><summary><span>Data notes<small>what this page does and does not hold</small></span></summary>
          <div class="rv-db"><p class="rv-note" id="rvNotes"></p></div></details>
      </div>
    </section>

    <section class="rv-how" id="rvHow"><h3>How it is worked out</h3><div class="sc-seg rv-pick" id="rvHPick" role="group" aria-label="Which figure"></div><div class="rv-hc" id="rvHCard"></div></section>
    <section class="rv-how" id="rvAbout"><h3>About this page</h3><div class="sc-seg rv-pick" id="rvAPick" role="group" aria-label="About"></div><div class="rv-hc" id="rvACard"></div></section>
    <div class="rv-lb" id="rvLb" hidden><button type="button" class="rv-lbx" data-rv-lbx="close" aria-label="Close">&times;</button><button type="button" class="rv-lbn rv-lbp" data-rv-lbx="prev" aria-label="Previous photo">&#8249;</button><img id="rvLbImg" alt=""><button type="button" class="rv-lbn rv-lbf" data-rv-lbx="next" aria-label="Next photo">&#8250;</button></div>`;
}

const salName = r => BR[r.c] + (r.extra ? ' (not in the UAE total)' : '');
function buildTables() {
  const col = (k, l, raw, disp, cell, x) => Object.assign({ k, l, t: 'num', raw, disp, cell }, x ? { x: 1 } : {});
  const txt = (k, l, raw, cell, x) => Object.assign({ k, l, t: 'txt', raw, disp: raw, cell }, x ? { x: 1 } : {});
  const L = () => label();
  const pager = (id, tbl, word) => (T2, rows) => {
    const bx = $('#rvPg' + id); if (!bx) return;
    const n = rows.length, pg = T2.pages(n), from = n ? T2.page * T2.shown + 1 : 0, to = Math.min(n, (T2.page + 1) * T2.shown);
    bx.hidden = n <= 10;
    $('.rv-pgt', bx).textContent = from + ' to ' + to + ' of ' + n + ' ' + word;
    $('[data-rv-rows]', bx).value = String(T2.shown);
    $('[data-rv-pg$=":-1"]', bx).disabled = T2.page <= 0; $('[data-rv-pg$=":1"]', bx).disabled = T2.page >= pg - 1; $('.rv-pgn', bx).textContent = 'Page ' + (T2.page + 1) + ' of ' + pg;
  };
  const salCols = (all) => [
    txt('s', 'Salon', salName, r => '<b>' + esc(BR[r.c]) + '</b>' + (r.extra ? '<em class="sm">not in the UAE total</em>' : '')),
    col('n', all ? 'Reviews, all time' : 'Reviews', r => r.o.n, r => r.o.n, r => fig(r.o.n, spec(D('salon', BR[r.c] + ', all reviews', { b: r.c, all: all || 0 })))),
    col('a', 'Average stars', r => +avg(r.o) || 0, r => avg(r.o), r => clk(avg(r.o), spec(D('salon', BR[r.c] + ', all reviews', { b: r.c, all: all || 0 })), r.o.n)),
    col('c', 'Complaints', r => r.o.c, r => r.o.c, r => fp(r.o.c, r.o.n, spec(D('comp', BR[r.c] + ', complaints', { b: r.c, cp: 1, all: all || 0 }))))
  ];
  const totalCell = (rows, extra) => { const o = salTotal(rows), l = L(), b = rows.filter(r => !r.extra).length === 1 ? { b: rows.filter(r => !r.extra)[0].c } : {}; return { o, l, b }; };
  T.sal = TRSheet.table({ id: 'rvsal', el: '#rvTSal', rows: () => salRows(), rowCls: r => r.extra ? 'rv-bah' : '',
    cols: salCols().concat([
      col('f', '5 stars', r => r.o.five, r => r.o.five, r => fp(r.o.five, r.o.n, spec(D('stars', BR[r.c] + ', 5 stars', { b: r.c, s: 5 }))), 1),
      col('w', 'Waiting for a reply', r => r.o.w, r => r.o.w, r => fig(r.o.w, spec(D('wait', BR[r.c] + ', waiting for a reply', { b: r.c, w: 1 }))), 1),
      col('p', 'Replied', r => r.o.rp, r => r.o.rp, r => fp(r.o.rp, r.o.kn, spec(D('replied', BR[r.c] + ', with a reply', { b: r.c, rp: 1 }))), 1)]),
    total: rows => { const { o, l, b } = totalCell(rows), n = rows.filter(r => !r.extra).length;
      return { s: '<b>' + (bah() ? 'Bahrain' : grp() ? 'All · UAE + Bahrain' : (n >= UAE.length ? 'UAE Branches' : 'Chosen salons')) + '</b>', n: fig(o.n, spec(D('all', 'All reviews, ' + l, b))), a: clk(avg(o), spec(D('all', 'All reviews, ' + l, b)), o.n),
        c: fp(o.c, o.n, spec(D('comp', 'Complaints, ' + l, mg(b, { cp: 1 })))), f: fp(o.five, o.n, spec(D('stars', '5 stars, ' + l, mg(b, { s: 5 })))), w: fig(o.w, spec(D('wait', 'Waiting for a reply, ' + l, mg(b, { w: 1 })))), p: fp(o.rp, o.kn, spec(D('replied', 'With a reply, ' + l, mg(b, { rp: 1 })))) }; },
    after: () => offsets() });
  T.mon = TRSheet.table({ id: 'rvmon', el: '#rvTMon', rows: monRows, limit: S.rows,
    cols: [
      txt('m', 'Month', r => r.b.a, r => '<b>' + esc(r.b.long) + '</b>'),
      col('n', 'Reviews', r => r.n, r => r.n, r => fig(r.n, spec(D('month', 'Reviews, ' + r.b.long, { from: r.b.a, to: r.b.z })))),
      col('c', 'Complaints', r => r.c, r => r.c, r => fp(r.c, r.n, spec(D('month', 'Complaints, ' + r.b.long, { from: r.b.a, to: r.b.z, cp: 1 })))),
      col('w', 'Waiting for a reply', r => r.w, r => r.w, r => fig(r.w, spec(D('month', 'Waiting for a reply, ' + r.b.long, { from: r.b.a, to: r.b.z, w: 1 }))))],
    total: rows => { let n = 0, c = 0, w = 0; rows.forEach(r => { n += r.n; c += r.c; w += r.w; }); const l = L();
      return { m: '<b>All months</b>', n: fig(n, spec(D('all', 'All reviews, ' + l))), c: fp(c, n, spec(D('comp', 'Complaints, ' + l, { cp: 1 }))), w: fig(w, spec(D('wait', 'Waiting for a reply, ' + l, { w: 1 }))) }; },
    after: pager('Mon', 'mon', 'months') });
  const bd = (x, extra, t) => D('salon', t || (BR[x.c] + ', reviews'), mg({ b: x.c, ty: tyStr(S.tyB), tm: S.teamB === 'A' ? '' : S.teamB }, extra || {}));
  T.br = TRSheet.table({ id: 'rvbr', el: '#rvTBr', rows: brRows, rowCls: r => r.extra ? 'rv-bah' : '',
    cols: [
      txt('s', 'Salon', salName, r => '<b>' + esc(BR[r.c]) + '</b>' + (r.extra ? '<em class="sm">not in the UAE total</em>' : '')),
      col('n', 'Reviews', r => r.o.n, r => r.o.n, r => fig(r.o.n, spec(bd(r)))),
      col('p', '4 and 5 stars', r => r.o.pr, r => r.o.pr, r => fp(r.o.pr, r.o.n, spec(bd(r, { pr: 1 }, BR[r.c] + ', 4 and 5 stars')))),
      col('a', 'Average stars', r => +avg(r.o) || 0, r => avg(r.o), r => clk(avg(r.o), spec(bd(r)), r.o.n)),
      col('c', 'Complaints', r => r.o.c, r => r.o.c, r => fp(r.o.c, r.o.n, spec(bd(r, { cp: 1 }, BR[r.c] + ', 1 to 3 stars'))), 1)] });
  const sd = (x, extra, t) => D('sty', t || ('Reviews naming ' + x.s.label), mg({ sf: x.s.key, ty: tyStr(S.tyS), sty: 1 }, extra || {}));
  T.sty = TRSheet.table({ id: 'rvsty', el: '#rvTSty', rows: styRows, limit: S.rows,
    cols: [
      txt('n', 'Stylist', r => r.s.label, r => `<span class="rv-stf">${phCell(r.s)}<span>${clk('<b>' + esc(r.s.label) + '</b>', spec(sd(r)), r.o.n)}<em>${esc(BR[r.s.branch] || '')}${r.s.resigned ? ' · former' : ''}</em></span></span>`),
      txt('t', 'Team', r => r.s.team, r => r.s.team, 1),
      col('m', 'Named in', r => r.o.n, r => r.o.n, r => fig(r.o.n, spec(sd(r)))),
      col('p', '4 and 5 stars', r => r.o.pr, r => r.o.pr, r => fp(r.o.pr, r.o.n, spec(sd(r, { pr: 1 }, r.s.label + ', 4 and 5 stars')))),
      col('a', 'Average stars', r => +avg(r.o) || 0, r => avg(r.o), r => clk(avg(r.o), spec(sd(r)), r.o.n)),
      col('c', 'Complaints', r => r.o.c, r => r.o.c, r => fp(r.o.c, r.o.n, spec(sd(r, { cp: 1 }, r.s.label + ', 1 to 3 stars'))), 1)],
    after: pager('Sty', 'sty', 'stylists') });
  T.star = TRSheet.table({ id: 'rvstar', el: '#rvTStar', rows: () => salRows(true),
    rowCls: r => r.extra ? 'rv-bah' : '',
    cols: salCols(1).concat([1, 2, 3, 4, 5].map(k => col('s' + k, k + (k === 1 ? ' star' : ' stars'), r => r.o.cnt[k], r => r.o.cnt[k], r => fig(r.o.cnt[k], spec(D('stars', BR[r.c] + ', ' + k + (k === 1 ? ' star' : ' stars') + ', all time', { b: r.c, s: k, all: 1 }))), 1))),
    total: rows => { const o = salTotal(rows), l = L(), t = { s: '<b>' + (bah() ? 'Bahrain' : grp() ? 'All · UAE + Bahrain' : 'UAE Branches') + '</b>', n: fig(o.n, spec(D('all', 'All reviews, ' + l + ', all time', { all: 1 }))), a: clk(avg(o), spec(D('all', 'All reviews, ' + l + ', all time', { all: 1 })), o.n), c: fp(o.c, o.n, spec(D('comp', 'Complaints, ' + l + ', all time', { cp: 1, all: 1 }))) };
      for (let k = 1; k <= 5; k++) t['s' + k] = fig(o.cnt[k], spec(D('stars', k + (k === 1 ? ' star, ' : ' stars, ') + l + ', all time', { s: k, all: 1 }))); return t; } });
  T.gbp = TRSheet.table({ id: 'rvgbp', el: '#rvTGbp', rows: gbpRows, rowCls: r => r.extra ? 'rv-bah' : '',
    cols: [
      txt('s', 'Salon', salName, r => '<b>' + esc(BR[r.c]) + '</b>' + (r.extra ? '<em class="sm">not in the UAE total</em>' : '')),
      col('a', 'Seen on Google', r => r.v ? r.v.seen : -1, r => r.v ? n0(r.v.seen) : '', r => r.v ? n0(r.v.seen) : '<span class="rv-nt">no numbers</span>'),
      col('b', 'Calls', r => r.v ? r.v.calls : -1, r => r.v ? n0(r.v.calls) : '', r => r.v ? n0(r.v.calls) : ''),
      col('c', 'Directions', r => r.v ? r.v.directions : -1, r => r.v ? n0(r.v.directions) : '', r => r.v ? n0(r.v.directions) : ''),
      col('d', 'Website', r => r.v ? r.v.website : -1, r => r.v ? n0(r.v.website) : '', r => r.v ? n0(r.v.website) : '', 1)] });
  const one = r => oneSpec(r);
  T.rev = TRSheet.table({ id: 'rvrev', el: '#rvTRev', rows: revRows, limit: S.rows,
    cols: [
      { k: 'd', l: 'Date', t: 'date', raw: r => r.d, disp: r => fd(r.d), cell: r => esc(rDate(r)) },
      txt('b', 'Salon', r => BR[r.b], r => esc(BR[r.b])),
      { k: 's', l: 'Stars', t: 'num', raw: r => r.s, disp: r => r.s, cell: r => num(stars(r.s), one(r)) },
      txt('n', 'Reviewer', r => r.n, r => num(esc(r.n), one(r))),
      Object.assign(txt('x', 'What she said', r => r.t, r => r.t ? num('<span class="rv-sn">' + esc(r.t) + '</span>', one(r)) : '<span class="rv-nt">(stars only)</span>'), { disp: r => r.t ? 'Written' : 'Stars only', ex: r => r.t }),
      txt('f', 'Staff named', staffNames, r => esc(staffNames(r))),
      col('p', 'Photos', r => r.ph.length, r => r.ph.length, r => r.ph.length ? num(String(r.ph.length), one(r)) : '<span class="rv-z">0</span>', 1),
      txt('r', 'Reply', replyOf, r => replyOf(r) === 'Waiting' ? '<b>Waiting</b>' : esc(replyOf(r))),
      txt('l', 'Google link', r => noLinkYet(r) ? 'No link yet' : 'Has a link', r => noLinkYet(r) ? '<span class="rv-nt">No link yet</span>' : 'Has a link', 1)],
    after: pager('Rev', 'rev', 'reviews') });
}
function phCell(s) { return s.photo ? '<img class="ph" src="' + esc(s.photo) + '" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">' : '<span class="ini" style="width:36px;height:44px">' + esc(s.label.charAt(0)) + '</span>'; }
const gbpRows = () => { const d = GBP[gbpKey()]; const by = {}; ((d && d.branches) || []).forEach(b => { by[b.branch] = b; });
  return salRows(true).map(r => ({ c: r.c, extra: r.extra, v: by[r.c] && by[r.c].seen != null ? { seen: +by[r.c].seen, calls: +by[r.c].calls || 0, directions: +by[r.c].directions || 0, website: +by[r.c].website || 0 } : null })); };

function draw() {
  if (!RV) return;
  drawAnswer(); drawWhy(); drawSum(); drawSal(); drawMon(); drawBr(); drawSty(); drawPhotos(); drawSelects(); drawRefine(); drawStar(); drawGbp(); drawNotes(); drawHow(); drawAbout();
  syncControls();
  ['sal', 'mon', 'br', 'sty', 'star', 'gbp'].forEach(k => { const w = $('#rv' + ({ sal: 'SalT', mon: 'MonT', br: 'BrT', sty: 'StyT', star: 'StarT', gbp: 'GbpT' })[k]); if (w && !w.hidden) T[k].draw(); });
  if (T.rev) T.rev.draw();
  offsets();
}
function drawAnswer() {
  const P = vis(), o = stat(P), L = label(), dAll = D('all', 'All reviews, ' + L), dC = D('comp', 'Complaints, ' + L, { cp: 1 }), dW = D('wait', 'Waiting for a reply, ' + L, { w: 1 });
  const a = $('#rvAns'), a2 = $('#rvAns2'), lead = $('#rvLead');
  if (!o.n) { a.textContent = 'No reviews for ' + L + ' in this Period.'; a2.textContent = 'Pick a wider Period in the header.'; lead.textContent = 'No reviews in this Period.'; $('#rvW2').textContent = ''; $('#rvW3').textContent = ''; return; }
  a.innerHTML = fig(o.c, spec(dC)) + (o.c === 1 ? ' complaint' : ' complaints') + ' in ' + fig(o.n, spec(dAll)) + ' reviews, and ' + fig(o.w, spec(dW)) + ' waiting for a reply.';
  const R = salRows().filter(x => !x.extra && x.o.n);
  let best = null, low = null; R.forEach(x => { if (!best || x.o.sum / x.o.n > best.o.sum / best.o.n) best = x; if (!low || x.o.sum / x.o.n < low.o.sum / low.o.n) low = x; });
  const sp = x => clk(avg(x.o), spec(D('salon', BR[x.c] + ', all reviews', { b: x.c })), x.o.n);
  a2.innerHTML = R.length > 1 && best.c !== low.c ? 'Highest average: ' + esc(BR[best.c]) + ' ' + sp(best) + ' stars. Lowest: ' + esc(BR[low.c]) + ' ' + sp(low) + ' stars. Average for ' + esc(L) + ': ' + clk(avg(o), spec(dAll), o.n) + ' stars.'
    : 'Average for ' + esc(L) + ': ' + clk(avg(o), spec(dAll), o.n) + ' stars.';
  lead.textContent = o.w ? plural(o.w, 'review') + (o.w === 1 ? ' is' : ' are') + ' waiting for a reply. ' + plural(o.c, 'complaint') + ' came in this Period.' : 'Every review in this Period has a reply. ' + plural(o.c, 'complaint') + (o.c === 1 ? ' needs' : ' need') + ' a closer look.';
  let mc = null, lc = null; R.forEach(x => { if (!mc || x.o.c > mc.o.c) mc = x; if (!lc || x.o.c < lc.o.c) lc = x; });
  $('#rvW2').innerHTML = R.length > 1 ? (mc.o.c ? esc(BR[mc.c]) + ' has the most complaints: ' + fig(mc.o.c, spec(D('comp', BR[mc.c] + ', complaints', { b: mc.c, cp: 1 }))) + ' of its ' + fig(mc.o.n, spec(D('salon', BR[mc.c] + ', all reviews', { b: mc.c }))) + ' reviews. ' + esc(BR[lc.c]) + ' has the fewest: ' + fig(lc.o.c, spec(D('comp', BR[lc.c] + ', complaints', { b: lc.c, cp: 1 }))) + '. Start with the first, learn from the second.' : 'No salon has a complaint in this Period.') : 'Pick more than one salon to compare them.';
}
function drawWhy() {
  const o = stat(vis()), L = label(), newest = RV.reduce((m, r) => r.d > m ? r.d : m, '');
  const now = o.n ? plural(o.c, 'complaint') + ' and ' + plural(o.w, 'unanswered review') + ' in this Period for ' + L + '. The newest review held is dated ' + fd(newest) + '.' : 'Nothing to look at in this Period.';
  $('#rvWhy').innerHTML = whyWall([
    ['Why this page', 'A Google review is the first thing a new client reads about a salon. A review with no reply looks like we do not listen. This page shows which salon needs a reply or a closer look.'],
    ['Why now', now],
    ['If we do nothing', 'A complaint with no reply stays on Google for good, and the next client reads it before she books. The same complaint then repeats at the next visit.']]);
}
function drawSum() {
  const o = stat(vis()), L = label();
  $('#rvSum').innerHTML =
    `<div class="rv-tile"><span class="rv-tn">${fig(o.n, spec(D('all', 'All reviews, ' + L)))}</span><span class="rv-tl">Reviews in this Period</span></div>` +
    `<div class="rv-tile"><span class="rv-tn">${o.n ? clk(avg(o), spec(D('all', 'All reviews, ' + L)), o.n) + ' ★' : '–'}</span><span class="rv-tl">Average rating</span></div>` +
    `<div class="rv-tile"><span class="rv-tn">${fig(o.c, spec(D('comp', 'Complaints, ' + L, { cp: 1 })))}</span><span class="rv-tl">Complaints, 1 to 3 stars</span></div>` +
    `<div class="rv-tile${o.w ? ' rv-warn' : ''}"><span class="rv-tn">${fig(o.w, spec(D('wait', 'Waiting for a reply, ' + L, { w: 1 })))}</span><span class="rv-tl">${o.w ? 'Waiting for a reply' : 'Waiting for a reply: all caught up'}</span></div>`;
}
function drawSal() {
  const R = salRows(); let mx = 1; R.forEach(x => { mx = Math.max(mx, x.o.c); });
  $('#rvSal').innerHTML = R.map(x => {
    const o = x.o, c = x.c, lc = RV.filter(r => r.b === c && r.s <= 3 && inPer(r)).sort((a, b) => a.d < b.d ? 1 : -1)[0];
    const tip = BR[c] + ': ' + plural(o.n, 'review') + ', average ' + avg(o) + ' stars, ' + plural(o.c, 'complaint') + (o.n ? ' (' + pf(o.c, o.n) + ')' : '') + ', ' + o.w + ' waiting for a reply.' + (lc ? ' Latest complaint: ' + fd(lc.d) + '.' : '');
    return `<div class="rv-fs" data-bh tabindex="0" data-tip="${esc(tip)}"><div class="nm">${clk(esc(BR[c]), spec(D('salon', BR[c] + ', all reviews', { b: c })), o.n)}<small>${x.extra ? 'not in the UAE total · ' : ''}average ${avg(o)} stars</small></div>` +
      `<div class="rv-fb"><i data-bh-fill style="width:${Math.round(100 * o.c / mx)}%"></i></div>` +
      `<div class="rv-fn">${fig(o.c, spec(D('comp', BR[c] + ', complaints', { b: c, cp: 1 })))}${o.c === 1 ? ' complaint' : ' complaints'} · ${fig(o.n, spec(D('salon', BR[c] + ', all reviews', { b: c })))} reviews · ${fig(o.w, spec(D('wait', BR[c] + ', waiting for a reply', { b: c, w: 1 })))} waiting</div></div>`;
  }).join('');
}
function drawMon() {
  const R = monRows(), L = label(); let mx = 1; R.forEach(r => { mx = Math.max(mx, r.c); });
  $('#rvMon').style.setProperty('--n', R.length); $('#rvMonL').style.setProperty('--n', R.length);
  $('#rvMon').innerHTML = R.map(r => {
    const d = D('month', 'Complaints, ' + r.b.long + ', ' + L, { from: r.b.a, to: r.b.z, cp: 1 });
    const tip = r.b.long + ': ' + plural(r.c, 'complaint') + ' out of ' + plural(r.n, 'review') + (r.n ? ' (' + pf(r.c, r.n) + ')' : '') + '. ' + r.rp + ' with a reply, ' + (r.c - r.rp) + ' without.';
    return `<div class="rv-mc" data-bh tabindex="0" data-tip="${esc(tip)}"><div class="rv-mn">${fig(r.c, spec(d))}</div><div class="rv-mb" style="--p:${(r.c / mx).toFixed(4)}"><i data-bh-fill style="height:${r.c ? Math.round(100 * r.rp / r.c) : 0}%"></i></div></div>`;
  }).join('');
  $('#rvMonL').innerHTML = R.map(r => '<span>' + r.b.lab + '</span>').join('');
  let top = null; R.forEach(r => { if (r.c && (!top || r.c > top.c)) top = r; });
  $('#rvW3').innerHTML = top ? 'The tallest bar is ' + esc(top.b.long) + ' with ' + fig(top.c, spec(D('month', 'Complaints, ' + top.b.long + ', ' + L, { from: top.b.a, to: top.b.z, cp: 1 }))) + (top.c === 1 ? ' complaint' : ' complaints') + ' out of ' + fig(top.n, spec(D('month', 'Reviews, ' + top.b.long + ', ' + L, { from: top.b.a, to: top.b.z }))) + ' reviews.' : 'No complaints in this Period.';
}
const legend = () => [1, 2, 3, 4, 5].map(k => '<span><i style="background:' + SC[k] + '"></i>' + k + (k === 1 ? ' star' : ' stars') + '</span>').join('');
function segBtn(o, k, mk) { return o.cnt[k] ? `<button type="button" class="rv-sg" ${dnAttr(mk(k))} style="flex:${o.cnt[k]};background:${SC[k]}" title="${k} star${k === 1 ? '' : 's'}: ${o.cnt[k]}" aria-label="${k} stars, ${o.cnt[k]} reviews"></button>` : ''; }
function dnAttr(sp) { const id = typeof TRSD !== 'undefined' && sp ? TRSD.reg(sp) : ''; return id ? 'data-dn="' + id + '" role="button"' : ''; }
function drawBr() {
  const R = brRows();
  $('#rvBrBars').innerHTML = R.map(x => {
    const o = x.o, bd = (extra, t) => D('salon', t || (BR[x.c] + ', reviews'), mg({ b: x.c, ty: tyStr(S.tyB), tm: S.teamB === 'A' ? '' : S.teamB }, extra || {}));
    const tip = BR[x.c] + ': ' + plural(o.n, 'review') + ', ' + o.pr + ' of them with 4 or 5 stars, average ' + avg(o) + ' stars.' + (o.c ? ' ' + o.c + ' with 1 to 3 stars.' : ' No complaints.');
    return `<div class="rv-fs" data-bh data-bh-multi tabindex="0" data-tip="${esc(tip)}"><div class="nm">${clk(esc(BR[x.c]), spec(bd()), o.n)}<small>${x.extra ? 'not in the UAE total · ' : ''}average ${avg(o)} stars</small></div>` +
      `<div class="rv-fb"><div class="rv-seg" data-bh-fill style="width:100%">${[1, 2, 3, 4, 5].map(k => segBtn(o, k, k2 => spec(bd({ s: k2 }, BR[x.c] + ', ' + k2 + (k2 === 1 ? ' star' : ' stars'))))).join('')}</div></div>` +
      `<div class="rv-fn">${fig(o.n, spec(bd()))} reviews · ${fig(o.pr, spec(bd({ pr: 1 }, BR[x.c] + ', 4 and 5 stars')))} with 4 or 5 stars · ${fig(o.c, spec(bd({ cp: 1 }, BR[x.c] + ', 1 to 3 stars')))}${o.c === 1 ? ' complaint' : ' complaints'}</div></div>`;
  }).join('');
  $('#rvBrLeg').innerHTML = legend();
  const u = R.filter(x => !x.extra && x.o.n); let best = null, low = null;
  u.forEach(x => { const sh = x.o.pr / x.o.n; if (!best || sh > best.sh) best = { x, sh }; if (!low || sh < low.sh) low = { x, sh }; });
  const bd2 = (x, extra, t) => D('salon', t, mg({ b: x.c, ty: tyStr(S.tyB), tm: S.teamB === 'A' ? '' : S.teamB }, extra));
  $('#rvWB').innerHTML = best && best.x !== low.x ? esc(BR[best.x.c]) + ' has the highest share of 4 and 5 stars: ' + clk(pf(best.x.o.pr, best.x.o.n), spec(bd2(best.x, { pr: 1 }, BR[best.x.c] + ', 4 and 5 stars')), best.x.o.pr) + '. ' + esc(BR[low.x.c]) + ' has the lowest: ' + clk(pf(low.x.o.pr, low.x.o.n), spec(bd2(low.x, { pr: 1 }, BR[low.x.c] + ', 4 and 5 stars')), low.x.o.pr) + '.' : '';
}
function drawSty() {
  const R = styRows();
  R.forEach((x, i) => { x.rk = i + 1; });   // Kate, 26 Nov 2026: 1, 2, 3, 4 in the order shown; tied stylists no longer share a number (it read 4, 5, 5, 7, 7, 9)
  const sd = (x, extra, t) => D('sty', t || ('Reviews naming ' + x.s.label), mg({ sf: x.s.key, ty: tyStr(S.tyS), sty: 1 }, extra || {}));
  const tipOf = x => '#' + x.rk + ' ' + x.s.label + (x.s.branch ? ' (' + BR[x.s.branch] + ')' : '') + ': named in ' + plural(x.o.n, 'review') + ', ' + x.o.pr + ' of them with 4 or 5 stars, average ' + avg(x.o) + ' stars.' + (x.o.c ? ' ' + x.o.c + ' with 1 to 3 stars.' : ' No complaints.');
  const bar = x => [1, 2, 3, 4, 5].map(k => segBtn(x.o, k, k2 => spec(sd(x, { s: k2 }, x.s.label + ', ' + k2 + (k2 === 1 ? ' star' : ' stars'))))).join('');
  const shown = R.slice(0, S.styN), pod = shown.slice(0, 3), rest = shown.slice(3);
  const podH = pod.map((x, i) => { const s = x.s, o = x.o;
    return `<div class="rv-pod rv-p${i + 1}" data-bh data-bh-multi tabindex="0" data-tip="${esc(tipOf(x))}"><span class="rv-rk m${Math.min(x.rk, 3)}">${x.rk}</span><div class="rv-pph">${phCell(s)}</div>` +
      `<div class="rv-pn">${clk('<b>' + esc(s.label) + '</b>', spec(sd(x)), o.n)}<small>${esc(BR[s.branch] || '')}${s.resigned ? ' · former' : ''}</small></div>` +
      `<div class="rv-pbig">${fig(o.n, spec(sd(x)))}<span>named</span></div><div class="rv-pbar"><div class="rv-seg">${bar(x)}</div></div>` +
      `<div class="rv-pm">${clk(avg(o) + ' ★', spec(sd(x)), o.n)} · ${fig(o.pr, spec(sd(x, { pr: 1 }, s.label + ', 4 and 5 stars')))} with 4 or 5 stars</div></div>`; }).join('');
  const restH = rest.map(x => { const s = x.s, o = x.o;
    return `<div class="rv-fs rv-srow" data-bh data-bh-multi tabindex="0" data-tip="${esc(tipOf(x))}"><span class="rv-rn">${x.rk}</span><div class="rv-ph">${phCell(s)}</div><div class="nm">${clk(esc(s.label), spec(sd(x)), o.n)}<small>${esc(BR[s.branch] || '')}${s.resigned ? ' · former' : ''}</small></div>` +
      `<div class="rv-fb"><div class="rv-seg" data-bh-fill style="width:100%">${bar(x)}</div></div><div class="rv-fn">${fig(o.n, spec(sd(x)))} named · ${clk(avg(o) + ' ★', spec(sd(x)), o.n)} · ${fig(o.c, spec(sd(x, { cp: 1 }, s.label + ', 1 to 3 stars')))}${o.c === 1 ? ' complaint' : ' complaints'}</div></div>`; }).join('');
  $('#rvStyBars').innerHTML = !R.length ? '<p class="rv-note">No stylist is named in the reviews for this Period and salon pick.</p>' : '<div class="rv-podium">' + podH + '</div>' + (restH ? '<div class="rv-rest">' + restH + '</div>' : '');
  $('#rvStyLeg').innerHTML = legend();
  const left = R.length - S.styN, mb = $('#rvStyMore'); mb.hidden = left <= 0; mb.textContent = 'Show ' + Math.min(12, left) + ' more (' + left + ' left)';
  const top = R[0]; $('#rvW4').innerHTML = top ? esc(top.s.label) + ' is named most: ' + fig(top.o.n, spec(sd(top))) + ' reviews, ' + fig(top.o.pr, spec(sd(top, { pr: 1 }, top.s.label + ', 4 and 5 stars'))) + ' with 4 or 5 stars. ' + n0(R.length) + ' stylists are named in all.' : 'Nobody is named in this Period.';
}
function drawPhotos() {
  const R = vis().filter(r => r.ph.length).sort((a, b) => a.d < b.d ? 1 : a.d > b.d ? -1 : 0), L = label(), n = R.reduce((a, r) => a + r.ph.length, 0), d = D('photos', 'Reviews with client photos, ' + L, { ph: 1 });
  $('#rvPhCount').innerHTML = R.length ? fig(R.length, spec(d)) + ' review' + (R.length === 1 ? '' : 's') + ' with ' + n0(n) + ' photo' + (n === 1 ? '' : 's') + ' in this Period for ' + esc(L) + '. The newest is from ' + fd(R[0].d) + '.' : 'No client photos in this Period for ' + esc(L) + '.';
  $('#rvPhWall').innerHTML = R.slice(0, S.phN).map(r => `<button type="button" class="rv-tilep" ${dnAttr(oneSpec(r))} aria-label="Photo from ${esc(r.n)}, ${r.s} stars, ${esc(BR[r.b])}"><img src="${esc(photoUrl(r.ph[0], 360))}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><span class="rv-tb">${'★'.repeat(r.s)}</span>${r.ph.length > 1 ? '<span class="rv-tn2">+' + (r.ph.length - 1) + '</span>' : ''}<span class="rv-ts">${esc(BR[r.b])}</span></button>`).join('');
  const left = R.length - S.phN, mb = $('#rvPhMore'); mb.hidden = left <= 0; mb.textContent = 'Show ' + Math.min(12, left) + ' more (' + left + ' left)';
}
function drawStar() {
  const R = salRows(true);
  $('#rvStarBars').innerHTML = R.map(r => {
    const o = r.o, c = r.c, L = BR[c] + ', all time';
    const tip = L + ': ' + n0(o.n) + ' reviews, average ' + avg(o) + ' stars. ' + [5, 4, 3, 2, 1].map(k => k + ' star' + (k === 1 ? '' : 's') + ' ' + n0(o.cnt[k]) + (o.n ? ' (' + pf(o.cnt[k], o.n) + ')' : '')).join(', ') + '.';
    const seg = [1, 2, 3, 4, 5].map(k => segBtn(o, k, k2 => spec(D('stars', BR[c] + ', ' + k2 + (k2 === 1 ? ' star' : ' stars') + ', all time', { b: c, s: k2, all: 1 })))).join('');
    return `<div class="rv-fs" data-bh data-bh-multi tabindex="0" data-tip="${esc(tip)}"><div class="nm">${clk(esc(BR[c]), spec(D('salon', L, { b: c, all: 1 })), o.n)}<small>${r.extra ? 'not in the UAE total · ' : ''}average ${avg(o)} stars</small></div><div class="rv-fb"><div class="rv-seg" data-bh-fill style="width:100%">${seg}</div></div>` +
      `<div class="rv-fn">${fig(o.n, spec(D('salon', L, { b: c, all: 1 })))} reviews · ${fig(o.c, spec(D('comp', BR[c] + ', complaints, all time', { b: c, cp: 1, all: 1 })))}${o.c === 1 ? ' complaint' : ' complaints'} · ${fig(o.cnt[5], spec(D('stars', BR[c] + ', 5 stars, all time', { b: c, s: 5, all: 1 })))} five stars</div></div>`;
  }).join('');
  $('#rvStarLeg').innerHTML = legend();
}
// Every review: the Refine rows and the list (Kate, 25 Nov 2026, "fix pls": the old page's Refine bar, long review list and no-link list were left out of the new page)
const rfDefault = () => ({ s: 'all', st: '', q: '', so: 'new', txt: 0, nr: 0, ph: 0, nt: 0, nl: 0 });
const noLinkYet = r => !!MAPS_CID[r.b] && !googleUrl(r);   // a salon with a Google Maps id should have a link to the review; the closed ones never had one
const unnamed = r => !!r.t && !r.sf.length;   // written, and nobody named
const staffNames = r => [...new Set(r.sf.map(k => (staffBy(k) || {}).label || k))].join(', ');
const replyOf = r => r.b === 'MRY' ? 'Unknown' : r.rep ? 'Replied' : r.b === 'FRT' ? 'Closed salon' : 'Waiting';
const RFS = [['all', 'All'], ['c', 'Complaints 1–3★'], ['p', 'Positive 4–5★'], [5, '5★'], [4, '4★'], [3, '3★'], [2, '2★'], [1, '1★']];
const RFM = [['txt', 'With a written comment', r => !!r.t], ['nr', 'No reply yet', waiting], ['ph', 'With client photos', r => r.ph.length > 0], ['nt', 'Comment, no staff named', unnamed], ['nl', 'No Google link yet', noLinkYet]];
const rfStars = (r, s) => s === 'all' || (s === 'c' ? r.s <= 3 : s === 'p' ? r.s >= 4 : r.s === s);
function rfPass(r, skip) {   // skip = the one choice to leave out, so each button can show how many it would give
  const f = S.rf;
  if (skip !== 's' && !rfStars(r, f.s)) return false;
  if (skip !== 'st' && f.st && !(f.st === '__any' ? r.sf.length : f.st === '__none' ? unnamed(r) : r.sf.includes(f.st))) return false;
  for (const m of RFM) if (skip !== m[0] && f[m[0]] && !m[2](r)) return false;
  if (skip !== 'q' && f.q) { const hay = (r.t + ' ' + r.n + ' ' + staffNames(r)).toLowerCase(); if (!f.q.toLowerCase().split(/\s+/).every(w => hay.includes(w))) return false; }
  return true;
}
const byNew = (a, b) => a.d < b.d ? 1 : a.d > b.d ? -1 : 0;
const SORTS = { new: ['Newest first', byNew], old: ['Oldest first', (a, b) => byNew(b, a)], low: ['Lowest stars first', (a, b) => a.s - b.s || byNew(a, b)], high: ['Highest stars first', (a, b) => b.s - a.s || byNew(a, b)] };
const revRows = () => vis().filter(r => rfPass(r)).sort(SORTS[S.rf.so][1]);
function drawSelects() {   // the two menus are drawn again with the page (the Branch or Period changed), not on every click, so an open menu is never rebuilt under the finger
  const w = $('#rvRfStW'), sw = $('#rvRfSoW'); if (!w || !sw) return;
  const P = vis(), cnt = {}; P.forEach(r => r.sf.forEach(k => { cnt[k] = (cnt[k] || 0) + 1; }));
  const opts = STAFF.filter(s => cnt[s.key] || s.key === S.rf.st).sort((a, b) => (cnt[b.key] || 0) - (cnt[a.key] || 0) || a.label.localeCompare(b.label));
  w.innerHTML = `<select id="rvRfSt" aria-label="Staff named in the review"><option value="">All reviews</option><option value="__any">Names any staff (${n0(P.filter(r => r.sf.length).length)})</option><option value="__none">Written, no staff named (${n0(P.filter(unnamed).length)})</option>` +
    opts.map(s => `<option value="${esc(s.key)}">${esc(s.label)}${s.resigned ? ' (former)' : ''} · ${n0(cnt[s.key] || 0)}</option>`).join('') + '</select>';
  sw.innerHTML = `<select id="rvRfSo" aria-label="Sort the reviews">${Object.keys(SORTS).map(k => `<option value="${k}">${SORTS[k][0]}</option>`).join('')}</select>`;
  $('#rvRfSt').value = S.rf.st; $('#rvRfSo').value = S.rf.so;
}
function drawRefine() {
  const f = S.rf, P = vis(), rows = revRows();
  $('#rvRfS').innerHTML = RFS.map(([k, l]) => `<button type="button" class="cm-pill${f.s === k ? ' on' : ''}" aria-pressed="${f.s === k}" data-rv-rs="${k}">${l}<small>${n0(P.filter(r => rfPass(r, 's') && rfStars(r, k)).length)}</small></button>`).join('');
  $('#rvRfM').innerHTML = RFM.map(([k, l, fn]) => `<button type="button" class="cm-pill${f[k] ? ' on' : ''}" aria-pressed="${!!f[k]}" data-rv-rf="${k}">${l}<small>${n0(P.filter(r => rfPass(r, k) && fn(r)).length)}</small></button>`).join('');
  const q = $('#rvRfQ'); if (q && q.value.trim() !== f.q) q.value = f.q;
  const on = f.s !== 'all' || !!f.st || !!f.q || RFM.some(m => f[m[0]]);
  const rs = $('[data-rv-rfreset]'); if (rs) rs.disabled = !(on || f.so !== 'new');
  $('#rvRfC').innerHTML = '<b>' + n0(rows.length) + '</b> of ' + n0(P.length) + (P.length === 1 ? ' review' : ' reviews') + ' for ' + esc(label()) + ', ' + esc(periodText()) + (on ? ', refined' : '');
  const o = stat(rows), nl = P.filter(noLinkYet).length;
  $('#rvRfW').innerHTML = esc(rows.length ? plural(o.c, 'complaint') + ' and ' + n0(o.w) + ' waiting for a reply in this list.' : 'No review fits these choices. Take one off above.') +
    (nl ? ' ' + esc(n0(nl) + (nl === 1 ? ' review has' : ' reviews have') + ' no link to their own Google page yet; the No Google link yet button lists them.') : '');
  const sync = T.rev && $('#rvB8 [data-rv-more]'); if (sync) { sync.classList.toggle('on', !!T.rev.more); sync.setAttribute('aria-pressed', !!T.rev.more); }
}
function refineGo() { drawRefine(); if (T.rev) { T.rev.page = 0; T.rev.draw(); } }

// Google profile (Kate, 6 Oct 2026): how often each salon's profile showed on Google and what people did, from Metricool through gbp_report. It follows the Period, but Google reports
// about three days late and Metricool goes back 12 months, so the window ends yesterday and starts at most 364 days before it.
function gbpWindow() {
  const [a0, b0] = range(), y = dIso(today()); y.setDate(y.getDate() - 1);
  const yi = isoOf(y); let to = b0 < yi ? b0 : yi, from = a0 || '0000-00-00';
  const floor = new Date(y); floor.setDate(floor.getDate() - 364);
  const cut = from < isoOf(floor); if (cut) from = isoOf(floor);
  if (to < from) to = from;
  return { from, to, cut };
}
const gbpKey = () => { const w = gbpWindow(); return w.from + '|' + w.to; };
function drawGbp() {
  const w = gbpWindow(), k = gbpKey(), note = $('#rvGbpNote'), bars = $('#rvGbpBars');
  if (!GBP[k] && !GBP_ERR) {
    if (!GBP['@' + k]) {
      GBP['@' + k] = true;
      Promise.resolve(sb.rpc('gbp_report', { p_from: w.from, p_to: w.to })).then(r => { if (r.error) throw r.error; GBP[k] = r.data || { branches: [] }; GBP_ERR = ''; })
        .catch(e => { console.warn('Google profile numbers:', e); delete GBP['@' + k]; GBP_ERR = 'The Google profile numbers did not load. Open this again to try again.'; })
        .then(() => { if (CUR() && RV) { drawGbp(); if (T.gbp && $('#rvGbpT') && !$('#rvGbpT').hidden) T.gbp.draw(); } });
    }
    bars.innerHTML = '<p class="rv-note">Loading the Google profile numbers…</p>'; note.textContent = ''; return;
  }
  if (GBP_ERR && !GBP[k]) { bars.innerHTML = '<p class="rv-note">' + esc(GBP_ERR) + '</p>'; note.textContent = ''; GBP_ERR = ''; delete GBP['@' + k]; return; }
  const rows = gbpRows(); let mx = 1; rows.forEach(r => { if (r.v) mx = Math.max(mx, r.v.seen); });
  bars.innerHTML = rows.map(r => {
    if (!r.v) return `<div class="rv-fs" tabindex="0"><div class="nm"><b>${esc(BR[r.c])}</b><small>${r.extra ? 'not in the UAE total · ' : ''}no numbers in these dates</small></div><div></div><div class="rv-fn"></div></div>`;
    const v = r.v, tip = BR[r.c] + ': seen ' + n0(v.seen) + ' times on Google, ' + n0(v.calls) + ' calls (' + pf(v.calls, v.seen) + ' of views), ' + n0(v.directions) + ' directions, ' + n0(v.website) + ' website visits.';
    return `<div class="rv-fs" data-bh tabindex="0" data-tip="${esc(tip)}"><div class="nm"><b>${esc(BR[r.c])}</b><small>${r.extra ? 'not in the UAE total' : 'seen ' + n0(v.seen) + ' times'}</small></div><div class="rv-fb"><i data-bh-fill style="width:${Math.round(100 * v.seen / mx)}%"></i></div><div class="rv-fn">${n0(v.calls)} calls · ${n0(v.directions)} directions · ${n0(v.website)} website</div></div>`;
  }).join('');
  note.textContent = 'From Metricool, ' + (w.cut ? 'at most the last 12 months, ' : '') + fd(w.from) + ' to ' + fd(w.to) + ' (Google runs about three days late). It follows the Branch and Period at the top. These figures have no list behind them, so they stay plain. The bar is how often the salon was seen.';
}
const CUR = () => typeof CURRENT_VIEW !== 'undefined' && CURRENT_VIEW === 'reviews';
function drawNotes() {
  const n = RV.filter(r => r.b !== 'MRY').length, noLink = RV.filter(r => MAPS_CID[r.b] && !googleUrl(r));
  const when = SYNC && SYNC.last ? new Date(SYNC.last).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai' }) : '';
  $('#rvNotes').innerHTML = esc(n0(n) + ' Google reviews are held' + (when ? ', last refreshed ' + when + ' (Dubai time)' : '') + '. New reviews and replies arrive on the Phorest sync times. Older reviews use Google Maps’ approximate dates, marked ≈. ') +
    'Marasy and Fratelli (closed) count while the Period touches their reviews; Marasy’s come from Google’s email notices (first words only, no reply status), so they stay out of every reply figure, and nothing is ever waiting for a closed salon. ' +
    (noLink.length ? esc(n0(noLink.length) + ' review' + (noLink.length === 1 ? ' has' : 's have') + ' no link to their own Google page yet, so View on Google stays off for them. ') : '') +
    (CREDIT_OK ? '' : 'The client credit did not load, so reviews that name nobody are not credited to a stylist right now. ');
}
// How it is worked out: one figure at a time.
function drawHow() {
  const o = stat(vis()), L = label();
  const HOW = {
    avg: ['Average rating', 'Add up every star, then divide by the number of reviews.', o.n ? '<b>' + avg(o) + '</b> = ' + n0(o.sum) + ' stars ÷ ' + fig(o.n, spec(D('all', 'All reviews, ' + L))) + ' reviews' : '–', 'The stars clients gave on Google, for reviews written in this Period.'],
    comp: ['Complaints', 'A review with 1, 2 or 3 stars, replied to or not.', (() => { const d = spec(D('comp', 'Complaints, ' + L, { cp: 1 })); return fig(o.c, d) + ' of ' + n0(o.n) + ' = ' + clk(pf(o.c, o.n), d, o.c); })(), 'A 4 or 5 star review is never a complaint, even when it has a note.'],
    wait: ['Waiting for a reply', 'A review in this Period that has no reply from us on Google.', (() => { const d = spec(D('wait', 'Waiting for a reply, ' + L, { w: 1 })); return fig(o.w, d) + ' of ' + n0(o.n) + ' = ' + clk(pf(o.w, o.n), d, o.w); })(), 'Closed salons never count as waiting, and Marasy’s reply status is unknown.']
  };
  $('#rvHPick').innerHTML = Object.keys(HOW).map(k => `<button type="button" data-rv-how="${k}" class="${k === S.hk ? 'on' : ''}">${HOW[k][0]}</button>`).join('');
  const h = HOW[S.hk]; $('#rvHCard').innerHTML = `<div class="t">${h[0]}</div><div class="m">${h[1]}</div><div class="big">${h[2]}</div><div class="cv">${h[3]}</div>`;
}
const ABOUT = {
  what: ['What it is', 'Every Google review for our salons, with our reply, in one place.', 'On UAE Branches, Bahrain sits in its own row and never joins the UAE numbers. On All it counts in.'],
  src: ['Where it comes from', 'Google Business Profile and Metricool, read on the Phorest sync times.', 'A new review can show up a few hours late.'],
  who: ['Who sees it', 'The same people who could open the old page.', 'Reviewer names are on Google already, so they show to everyone who can open this page.'],
  fix: ['Fixing a name', 'The owner login can match a review to a stylist, or say a name in the text is not hers.', 'Open the review from any list and use Match staff at the bottom.']
};
function drawAbout() {
  $('#rvAPick').innerHTML = Object.keys(ABOUT).map(k => `<button type="button" data-rv-about="${k}" class="${k === S.ak ? 'on' : ''}">${ABOUT[k][0]}</button>`).join('');
  const a = ABOUT[S.ak]; $('#rvACard').innerHTML = `<div class="t">${a[0]}</div><div class="m">${a[1]}</div><div class="cv">${a[2]}</div>`;
}
// the controls show what is picked
function syncControls() {
  const root = $('#reviewsContent'); if (!root) return;
  [2, 3, 4, 5, 6, 7].forEach(id => { const v = S['v' + id]; $$('[data-rv-v^="' + id + ':"]', root).forEach(b => b.classList.toggle('on', b.dataset.rvV === id + ':' + v)); });
  $$('[data-rv-team]', root).forEach(b => { const [k, t] = b.dataset.rvTeam.split(':'); b.classList.toggle('on', (k === 'B' ? S.teamB : S.team) === t); });
  $$('[data-rv-ty]', root).forEach(b => { const [k, t] = b.dataset.rvTy.split(':'); b.checked = !!(k === 'B' ? S.tyB : S.tyS)[t]; });
  const rs = $('[data-rv-res]', root); if (rs) { rs.classList.toggle('on', S.res); rs.setAttribute('aria-pressed', S.res); }
  const sec = { 2: ['Sal', T.sal], 3: ['Mon', T.mon], 4: ['Sty', T.sty], 5: ['Star', T.star], 6: ['Gbp', T.gbp], 7: ['Br', T.br] };
  Object.keys(sec).forEach(id => { const v = S['v' + id] === 'vis', [nm, tb] = sec[id], V = $('#rv' + nm + 'V', root), TT = $('#rv' + nm + 'T', root); if (V) V.hidden = !v; if (TT) TT.hidden = v;
    const mb = $('[data-rv-more="' + id + '"]', root); if (mb) { mb.hidden = v; mb.classList.toggle('on', !!(tb && tb.more)); mb.setAttribute('aria-pressed', !!(tb && tb.more)); }
    const ph = $('#rvB' + id + ' .rv-phone', root); if (ph) ph.hidden = v; });
  const m8 = $('#rvB8 [data-rv-more]', root); if (m8 && T.rev) { m8.classList.toggle('on', !!T.rev.more); m8.setAttribute('aria-pressed', !!T.rev.more); }
  $$('details[data-rv-det]', root).forEach(d => { d.open = !!S.open[d.dataset.rvDet]; });
}
// The "On this page" rail (Kate, 26 Nov 2026): one entry per data-jn section, in the gutter from 1100px and a row of chips below it.
function rvRail(on) {
  const shell = $('#rvShell'), side = $('#rvSide'); if (!shell || !side) return;
  const items = on ? $$('#reviewsContent [data-jn]').filter(e => e.id) : [];
  shell.classList.toggle('rv-norail', items.length < 2);
  const nav = side.querySelector('.side-nav'), sig = items.map(e => e.id + '|' + e.dataset.jn).join(';');
  if (nav && nav.dataset.sig !== sig) {
    nav.dataset.sig = sig;
    nav.innerHTML = '<div class="side-k">On this page</div>' + items.map(e => `<a href="#${e.id}" onclick="lgJump(event,'${e.id}')">${esc(e.dataset.jn)}</a>`).join('');
  }
  if (typeof spy === 'function') spy();
}
function offsets() {   // the table's sticky offsets (under the masthead and the "On this page" chips), read from the page, never guessed
  const nav = $('#rvSide .side-nav'), chips = nav && nav.offsetParent && getComputedStyle(nav).display === 'flex' ? $('#rvSide') : null;   // the row of chips under 1100px; in the gutter nothing sits under the masthead
  const jn = $('#view-reviews .jn-rail') || chips, root = document.documentElement.style;
  const top = jn ? parseFloat(getComputedStyle(jn).top) || 0 : (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--topbar-cond-h'), 10) || 104);
  root.setProperty('--sx-top', (top + (jn ? jn.offsetHeight : 0)) + 'px');
  $$('#reviewsContent .rv-sec').forEach(s => s.style.setProperty('--bh', '0px'));
}

// ── events ────────────────────────────────────────────────────────────────────────────
let LB = { i: 0, k: 0 };
function lbShow() { const r = RV[LB.i]; if (!r) return; $('#rvLbImg').src = r.ph[LB.k] + '=w1600'; $('#rvLb').hidden = false; $$('.rv-lbn').forEach(b => { b.hidden = r.ph.length < 2; }); }
function bind() {
  const root = $('#reviewsContent'); if (!root || root.dataset.bound) return; root.dataset.bound = '1';
  root.addEventListener('click', e => {
    const t = e.target, q = s => t.closest(s);
    let b;
    if ((b = q('[data-rv-v]'))) { const [id, v] = b.dataset.rvV.split(':'); S['v' + id] = v; syncControls(); if (v === 'tab') ({ 2: T.sal, 3: T.mon, 4: T.sty, 5: T.star, 6: T.gbp, 7: T.br })[id].draw(); offsets(); return; }
    if ((b = q('[data-rv-more]'))) { const id = b.dataset.rvMore; ({ 2: T.sal, 4: T.sty, 5: T.star, 6: T.gbp, 7: T.br, 8: T.rev })[id].toggleMore(); syncControls(); return; }
    if ((b = q('[data-rv-rs]'))) { const v = b.dataset.rvRs; S.rf.s = /^[1-5]$/.test(v) ? +v : v; refineGo(); return; }
    if ((b = q('[data-rv-rf]'))) { const k = b.dataset.rvRf; S.rf[k] = S.rf[k] ? 0 : 1; refineGo(); return; }
    if (q('[data-rv-rfreset]')) { S.rf = rfDefault(); if (T.rev) T.rev.sort = null; drawSelects(); refineGo(); return; }
    if ((b = q('[data-rv-team]'))) { const [k, v] = b.dataset.rvTeam.split(':'); if (k === 'B') S.teamB = v; else { S.team = v; S.styN = 12; } if (k === 'B') { drawBr(); T.br.draw(); } else { drawSty(); T.sty.page = 0; T.sty.draw(); } syncControls(); return; }
    if (q('[data-rv-res]')) { S.res = !S.res; S.styN = 12; drawSty(); T.sty.page = 0; T.sty.draw(); syncControls(); return; }
    if (q('#rvStyMore')) { S.styN += 12; drawSty(); return; }
    if (q('#rvPhMore')) { S.phN += 12; drawPhotos(); return; }
    if ((b = q('[data-rv-how]'))) { S.hk = b.dataset.rvHow; drawHow(); return; }
    if ((b = q('[data-rv-about]'))) { S.ak = b.dataset.rvAbout; drawAbout(); return; }
    if ((b = q('[data-rv-pg]'))) { const [id, d] = b.dataset.rvPg.split(':'), tb = { Mon: T.mon, Sty: T.sty, Rev: T.rev }[id]; tb.page += +d; tb.draw(); return; }
    if ((b = q('[data-rv-lb]'))) { const [i, k] = b.dataset.rvLb.split(':'); LB = { i: +i, k: +k }; lbShow(); return; }
  });
  root.addEventListener('change', e => {
    const t = e.target;
    if (t.matches('[data-rv-ty]')) { const [k, v] = t.dataset.rvTy.split(':'), st = k === 'B' ? S.tyB : S.tyS; st[v] = t.checked ? 1 : 0; if (k === 'B') { if (!st.w && !st.s && !st.p) { st.w = st.s = st.p = 1; } drawBr(); T.br.draw(); } else { if (!st.w && !st.p) { st.w = st.p = 1; } S.styN = 12; drawSty(); T.sty.page = 0; T.sty.draw(); } syncControls(); return; }
    if (t.matches('[data-rv-rows]')) { const n = +t.value; S.rows = n; try { localStorage.setItem('trs-reviews-rows', String(n)); } catch (x) {} [T.mon, T.sty, T.rev].forEach(x => { x.shown = n; x.page = 0; x.draw(); }); return; }
    if (t.id === 'rvRfSt') { S.rf.st = t.value; refineGo(); return; }
    if (t.id === 'rvRfSo') { S.rf.so = t.value; if (T.rev) T.rev.sort = null; refineGo(); return; }
  });
  let rfTimer = 0;
  root.addEventListener('input', e => { if (e.target.id !== 'rvRfQ') return; clearTimeout(rfTimer); const v = e.target.value; rfTimer = setTimeout(() => { S.rf.q = v.trim(); refineGo(); }, 200); });
  root.addEventListener('toggle', e => { const d = e.target; if (d.matches && d.matches('details[data-rv-det]')) { S.open[d.dataset.rvDet] = d.open; if (d.open) ({ star: () => { drawStar(); if (S.v5 === 'tab') T.star.draw(); }, gbp: () => { drawGbp(); if (S.v6 === 'tab') T.gbp.draw(); }, notes: () => {} })[d.dataset.rvDet](); } }, true);
  root.addEventListener('mouseover', () => {}, { passive: true });
  // the one-review window (drill.js draws it on the body, not in this page) hears the lightbox and Match staff buttons too
}
document.addEventListener('click', e => {
  const t = e.target;
  const lb = t.closest && t.closest('[data-rv-lb]');
  if (lb && !t.closest('#reviewsContent')) { const [i, k] = lb.dataset.rvLb.split(':'); LB = { i: +i, k: +k }; lbShow(); return; }
  const x = t.closest && t.closest('[data-rv-lbx]');
  if (x) { const k = x.dataset.rvLbx, r = RV && RV[LB.i]; if (k === 'close') $('#rvLb').hidden = true; else if (r) { LB.k = (LB.k + (k === 'next' ? 1 : r.ph.length - 1)) % r.ph.length; lbShow(); } return; }
  if (t.id === 'rvLb') { $('#rvLb').hidden = true; return; }
  const mt = t.closest && t.closest('[data-rv-mt]');
  if (mt) {
    const box = mt.closest('[data-rv-match]'), r = box && RV[+box.dataset.rvMatch]; if (!r) return;
    const [a, k0] = mt.dataset.rvMt.split(':'); let m = (r.manual || []).slice(), n = (r.not || []).slice(), k = k0;
    if (a === 'remove') m = m.filter(x2 => x2 !== k);
    else if (a === 'not') { m = m.filter(x2 => x2 !== k); if (!n.includes(k)) n.push(k); }
    else if (a === 'undo') n = n.filter(x2 => x2 !== k);
    else if (a === 'add') { k = (box.querySelector('.rv-msel') || {}).value; if (!k) return; if (!m.includes(k)) m.push(k); n = n.filter(x2 => x2 !== k); }
    saveMatch(r, box, m, n);
  }
});
document.addEventListener('keydown', e => {
  const lb = $('#rvLb'); if (!lb || lb.hidden) return;
  if (e.key === 'Escape') { lb.hidden = true; e.stopImmediatePropagation(); e.preventDefault(); return; }
  const r = RV && RV[LB.i];
  if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && r && r.ph.length > 1) { LB.k = (LB.k + (e.key === 'ArrowRight' ? 1 : r.ph.length - 1)) % r.ph.length; lbShow(); }
}, true);
window.addEventListener('resize', () => { if (CUR()) offsets(); });

// ── the entry points ──────────────────────────────────────────────────────────────────
async function start(force) {
  const el = document.getElementById('reviewsContent'); if (!el) return;
  const seq = ++SEQ;
  el.innerHTML = shell();
  rvRail(false);
  if (RV && !force && Date.now() - LOADED_AT < 10 * 60 * 1000) { paint(); return; }
  try {
    ERR = null; await loadAll();
    if (seq !== SEQ) return;
    paint();
  } catch (e) {
    console.error('Google reviews', e);
    if (seq !== SEQ) return;
    ERR = e;
    const b = $('#rvBody'); if (b) b.innerHTML = '<p class="slv-muted rv-err">The reviews did not load. <button type="button" class="cm-pill" id="rvRetry">Try again</button></p>';
    const lead = $('#rvLead'); if (lead) lead.textContent = 'The reviews did not load.';
    const rt = $('#rvRetry'); if (rt) rt.onclick = () => start(true);
  }
}
function paint() {
  const body = $('#rvBody'); if (!body) return;
  body.innerHTML = bodyHtml();
  Object.keys(T).forEach(k => delete T[k]);
  buildTables(); bind();
  draw();
  rvRail(true);
}
window.renderReviews = function (force) { return start(!!force); };   // force = read the tables again (Refresh now)

// ── downloads (Kate, 10 Nov 2026: every report gets an XLSX and a CSV button; report-export.js draws the buttons and saves the file) ──
const r2 = x => (x == null || !isFinite(x)) ? null : Math.round(x * 100) / 100;
const plainTxt = h => String(h == null ? '' : h).replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
function tableModel(tb, title, file) {
  if (!RV || !tb) return null;
  const rows = tb.rows(); if (!rows.length) return null;
  const cols = tb.cfg.cols.filter(c => typeof c.l === 'string');
  const sub = label() + ' · ' + periodText();
  const lines = rows.map(r => ({ cells: cols.map(c => c.t === 'num' ? r2(c.raw(r)) : plainTxt(c.ex ? c.ex(r) : c.disp(r))) }));
  return { name: [file, label(), (range()[0] || 'all-time'), 'to', range()[1]].map(slug).join('-'), csv: 0, sheets: [{ name: title.slice(0, 31), title, subtitle: sub, blocks: [{ cols: cols.map(c => ({ label: c.l, fmt: c.t === 'num' ? 'num' : 'text' })), rows: lines }],
    legend: [['Complaints', 'A review with 1, 2 or 3 stars.'], ['Waiting for a reply', 'No reply from us on Google. A closed salon never waits, and Marasy’s reply status is unknown.']] }] };
}
window.rvExportSal = () => tableModel(T.sal, 'Google Reviews by salon', 'google-reviews-by-salon');
window.rvExportMon = () => tableModel(T.mon, 'Complaints by month', 'google-reviews-by-month');
window.rvExportBr = () => tableModel(T.br, 'Reviews by branch', 'google-reviews-by-branch');
window.rvExportSty = () => tableModel(T.sty, 'Staff named in reviews', 'google-reviews-staff-named');
window.rvExportStar = () => tableModel(T.star, 'Every star, all time', 'google-reviews-every-star');
window.rvExportRev = () => tableModel(T.rev, 'Every review', 'google-reviews-every-review');
window.rvExportGbp = () => tableModel(T.gbp, 'How people find each salon on Google', 'google-reviews-google-profile');
// The whole page in one workbook (js/page-export.js): every review the Branch and Period leave, then By salon, Complaints by month and Staff named. The CSV is the first tab.
window.rvExportPage = function () {
  if (!RV) return null;
  const P = vis().slice().sort((a, b) => a.d < b.d ? 1 : a.d > b.d ? -1 : 0); if (!P.length) return null;
  const sub = label() + ' · ' + periodText() + ' · ' + plural(P.length, 'review');
  const cols = [{ label: 'Date', fmt: 'text' }, { label: 'Branch', fmt: 'text' }, { label: 'Stars', fmt: 'num' }, { label: 'Reviewer', fmt: 'text' }, { label: 'What she wrote', fmt: 'text' }, { label: 'Replied', fmt: 'text' }, { label: 'Our reply', fmt: 'text' },
    { label: 'Staff named', fmt: 'text' }, { label: 'Photos', fmt: 'num' }, { label: 'Link to the review', fmt: 'text' }];
  const sheets = [{ name: 'Reviews', title: 'Google Reviews', subtitle: sub, blocks: [{ cols, rows: P.map(r => ({ cells: [r.d + (r.approx ? ' (approximate)' : ''), BR[r.b], r.s, r.n, r.t, r.b === 'MRY' ? 'Unknown' : r.rep ? 'Yes' : 'No', r.rp, r.sf.map(k => (staffBy(k) || {}).label || k).join(', '), r.ph.length, googleUrl(r) || r.url || ''] })) }],
    legend: [['Date', 'The day Google shows; an approximate date comes from Google Maps when the exact one was not read.'], ['Replied', 'Marasy’s reviews come from Google’s email notices, which do not show replies, so its reply status is Unknown.'],
      ['Staff named', 'Decided by the staff name variants table, the client credit and hand tags, the same as the page.']] }];
  [[T.sal, 'By salon'], [T.mon, 'Complaints by month'], [T.sty, 'Staff named']].forEach(([tb, nm]) => { const m = tableModel(tb, nm, 'x'); if (m) sheets.push(m.sheets[0]); });
  return { name: ['google-reviews', slug(label()), range()[0] || 'all-time', 'to', range()[1]].map(slug).join('-'), csv: 0, sheets };
};
})();
