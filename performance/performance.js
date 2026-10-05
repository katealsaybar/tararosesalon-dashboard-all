// Money Five stylist pages (Kate, 25 Sep 2026).
//   ?t=<staff token>            one stylist's own page, what the monthly email links to
//   ?admin=<admin token>        team grid for Tara / Emma / Kate
//   ?t=..&admin=..              a stylist's page opened from the team grid, with notes editable
//   &m=YYYY-MM                  month (defaults to this month)
// Every number comes from Supabase (see migrations/create_performance.sql). The
// anon key here can't read any perf_ table, only call the token-checked functions.

const SUPA_URL = 'https://gvijxenafoowajqktqvd.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2aWp4ZW5hZm9vd2FqcWt0cXZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3MTA1OTksImV4cCI6MjA5MTI4NjU5OX0.GL3YXupXOBGfN4FCyelbQWraUw12VJNJu-wUB3zR7Zw';

// The live address a stylist's own link points at, whatever this page was opened from.
// The employment-model brochures (Kate, 30 Sep 2026). The GHL page at
// promo.tararosesalon.com/employment-models went 404, so each "Read the brochure"
// opens our own copy of it in a new window: employment-models.html, the swipe
// viewer, opened on that brochure (?b=). Flex has an Abu Dhabi and a Dubai
// version, chosen by the stylist's branch. Absolute, so the same link works from
// the dashboard's frame.
const BROCHURE_VIEWER = 'https://trk-salon-os.com/performance/employment-models.html?b=';
const BROCHURE = Object.fromEntries(['employed', 'flex-abudhabi', 'flex-dubai', 'chair', 'overview', 'relocation']
  .map(k => [k, BROCHURE_VIEWER + k]));
// A review's branch → that branch's Google Maps listing, where its reviews can
// be read in full. A search link, not a place ID, by Kate's choice (25 Sep 2026).
const mapsFor = branch => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('Tara Rose Salon ' + branch);
const PUBLIC_PAGE = 'https://trk-salon-os.com/performance/';
// The "Ask your coach" chat box (perf-coach edge function). Off until the Anthropic
// account has credit again (it ran dry 24 Sep 2026); flip to true and bump the
// performance.js stamp. ?coach=1 shows it anyway, for testing.
const COACH_ON = false;
const COACH_FN = SUPA_URL + '/functions/v1/perf-coach';
const qs = new URLSearchParams(location.search);
let TOKEN = qs.get('t');
const STAFF_SLUG = qs.get('staff');   // dashboard address: ?view=staffperf&staff=andrea-gladstone
const ADMIN = qs.get('admin');
// sid: a person opened from the team grid by staff id. The dashboard's built-in
// viewer key never gets staff tokens (those open payslips), so its links use
// this instead; leader keys still link by token.
let SID = qs.get('sid');
let ROLE = null;   // 'leader' | 'viewer', from the server
const canEdit = () => !!ADMIN && !!TOKEN && ROLE !== 'viewer';
// embed=1: framed inside the dashboard's Staff Performance view. No brand bar,
// transparent background, and the page tells the dashboard how tall it is.
const EMBED = qs.get('embed') === '1';
let DEPT = ['Hair', 'Beauty'].includes(qs.get('dept')) ? qs.get('dept') : 'all';
const keep = EMBED ? '&embed=1' : '';
// Team grid sort, remembered per browser.
let SORT = 'branch', SORT_REV = false;
// Sales chart: 'week' or 'day', remembered per browser.
let CHART_MODE = 'week';
try { if (localStorage.getItem('perf-chart') === 'day') CHART_MODE = 'day'; } catch (e) {}
try { const v = JSON.parse(localStorage.getItem('perf-sort') || 'null'); if (v) { SORT = v.k; SORT_REV = !!v.rev; } } catch (e) {}
// Kate, 5 Oct 2026: a Ledger | Phorest switch on her page. Sales are always Phorest's;
// clients, requests, new clients and rebooking come from the branch ledger unless she
// picks Phorest, which swaps in Phorest's own counts (perf_core's 'phorest'). Phorest
// has no rebooking in what we pull, so that shows a dash. Remembered per browser,
// &src=phorest|ledger in the address wins.
let SRC = 'ledger';
try { if (localStorage.getItem('perf-src') === 'phorest') SRC = 'phorest'; } catch (e) {}
if (['ledger', 'phorest'].includes(qs.get('src'))) SRC = qs.get('src');
let RAW = null, RAW_KEY = null;   // the last perf_dashboard answer, so the switch needn't ask again
function withSource(d) {
  if (SRC !== 'phorest') return d;
  const swap = n => {
    if (!n || !n.phorest) return;
    Object.assign(n, n.phorest);
    n.salon = n.ncr = n.rebooked = n.rebooking_pct = null;
  };
  swap(d.numbers);
  (d.weeks || []).forEach(w => swap(w.numbers));
  (d.history || []).forEach(h => swap(h.numbers));
  (d.days || []).forEach(x => { if (x.phorest_clients !== undefined) x.clients = x.phorest_clients; });
  return d;
}
function postHeight() {
  if (EMBED) parent.postMessage({ type: 'perf-height', h: Math.ceil(document.body.getBoundingClientRect().height) + 8 }, '*');
}
if (EMBED) {
  document.body.classList.add('embed');
  window.perfResize = new ResizeObserver(postHeight);   // held globally so it isn't collected
  window.perfResize.observe(document.body);
  addEventListener('load', postHeight);
  addEventListener('message', e => {
    // The dashboard's sticky Hair / Beauty bar.
    if (e.data && e.data.type === 'perf-dept') {
      DEPT = ['Hair', 'Beauty'].includes(e.data.dept) ? e.data.dept : 'all';
      // On someone's page, the bar takes you back to the team grid, filtered.
      if (TOKEN || SID) { location.search = `?admin=${encodeURIComponent(ADMIN)}&m=${MONTH}${keep}&dept=${DEPT}`; return; }
      renderTeam();
    }
    // The dashboard's sort, in the same bar.
    if (e.data && e.data.type === 'perf-sort') {
      SORT = e.data.k; SORT_REV = !!e.data.rev;
      if (!TOKEN) renderTeam();
      return;
    }
    // The dashboard's month picker, in the same bar.
    if (e.data && e.data.type === 'perf-month' && /^\d{4}-\d{2}$/.test(e.data.m)) {
      qs.set('m', e.data.m); location.search = qs.toString(); return;
    }
    if (e.data && e.data.type === 'trs-theme') { document.documentElement.dataset.theme = e.data.theme === 'dark' ? 'dark' : 'light'; if (typeof perfPaintTheme === 'function') perfPaintTheme(); }
  });
}
const app = document.getElementById('app');
const slugOf = name => String(name).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// Tell the dashboard which person is open, so its address carries the slug.
const tellParent = slug => { if (EMBED) parent.postMessage({ type: 'perf-nav', staff: slug || null }, '*'); };

// kpi key → how to show it. sum: adds up over the month, so mid-month it is
// judged on pace. untracked: no data source yet. unscored: shown, not counted.
const KPIS = [
  { k: 'total_revenue',   label: 'Total revenue',          fmt: 'aed', sum: true },
  { k: 'hair_services',   label: 'Hair services',          fmt: 'aed', sum: true },
  { k: 'treatments',      label: 'Treatments',             fmt: 'aed', sum: true },
  { k: 'treatments_pct',  label: 'Treatments %',           fmt: 'pct' },
  { k: 'retail',          label: 'Retail',                 fmt: 'aed', sum: true },
  { k: 'retail_pct',      label: 'Retail %',               fmt: 'pct' },
  { k: 'avg_bill',        label: 'Average bill',           fmt: 'aed' },
  { k: 'rebooking_pct',   label: 'Rebooking %',            fmt: 'pct' },
  { k: 'retention_pct',   label: 'Retention %',            fmt: 'pct' },
  { k: 'clients',         label: 'Client numbers',         fmt: 'num', sum: true },
  { k: 'ncr',             label: 'New client requests',    fmt: 'num', sum: true },
  { k: 'request_pct',     label: 'Request rate %',         fmt: 'pct' },
  { k: 'conversion_pct',  label: 'Conversion %',           fmt: 'pct' },
  { k: 'column_fill_pct', label: 'Column fill %',          fmt: 'pct' },
  { k: 'colour_pct',      label: 'Colour %',               fmt: 'pct' },
  // Average Google stars over 90 days, from 3 reviews (perf_reputation). Kate, 28 Sep 2026.
  { k: 'reputation',      label: 'Reputation score',       fmt: 'rep',
    needs: n => `Needs 3 Google reviews in 90 days, has ${n.reputation_n || 0}`,
    note: 'Average star rating of the Google reviews that name you or come from your clients, over the last 90 days. Counts once you have at least 3.' },
  { k: 'google_reviews',  label: 'Google reviews',         fmt: 'num', sum: true },
  // Posts tagging @tararosesalon from her own handle (ig-tags-sync, nightly). Kate, 28 Sep 2026.
  { k: 'social_feed',     label: 'Social posts (feed)',    fmt: 'num', sum: true, needs: 'No Instagram handle on file' },
  // Interim until Tara defines it (Kate, 28 Sep 2026): days worked with a post, collab or
  // story mention (perf_core). Stories only count from 28 Sep 2026.
  { k: 'social_workdays', label: 'Social posts (workdays)', fmt: 'num', sum: true, needs: 'No Instagram handle on file',
    note: 'Days you worked this month on which you posted with @tararosesalon, were a collaborator on a salon post, or mentioned the salon in your story.' },
];
const KPI = Object.fromEntries(KPIS.map(x => [x.k, x]));

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
function fmt(v, f) {
  if (v === null || v === undefined || Number.isNaN(v)) return '–';
  if (f === 'aed') return 'AED ' + nf.format(v);
  if (f === 'pct') return (Math.round(v * 10) / 10) + '%';
  // Stars, not "x/5": "5/5 / 4.8/5" read like two scores (Kate, 28 Sep 2026).
  if (f === 'rep') return (Math.round(v * 10) / 10).toFixed(1) + '★';
  return nf.format(v);
}
const dayLabel = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '–';
// When a leader wrote a note, always in UAE time whatever the reader's device is set to: 30 Sep 2026, 9:19 am.
const noteStamp = at => new Date(at).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) + ' UAE';
// Staff photo from staff-profiles.js (the same cutouts Staff Cards uses), matched
// on the person's ledger names. Shown at its own shape, never cropped to a circle.
function photoFor(keys) {
  if (typeof STAFF_PROFILES === 'undefined') return null;
  for (const k of keys || []) {
    const p = STAFF_PROFILES[String(k).toUpperCase()];
    if (p && p.photoFull) return '../' + encodeURI(p.photoFull);
    if (p && p.photo) return '../assets/staff/' + encodeURIComponent(p.photo);
  }
  return null;
}
const monthLabel = m => new Date(m + 'T00:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

// Kate, 2 Oct 2026: on phones a load often failed with "Couldn't load the numbers"
// (perf_dashboard hit anon's 3s limit on a cold start; fixed in the database the same
// day). A dropped connection or a server error now gets one quiet retry after a
// second before the page gives up. A 4xx (a bad link) fails at once, as before.
async function rpc(fn, args, retried) {
  let r;
  try {
    r = await fetch(`${SUPA_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
  } catch (e) {
    if (!retried) { await new Promise(res => setTimeout(res, 1000)); return rpc(fn, args, true); }
    throw e;
  }
  if (r.status >= 500 && !retried) { await new Promise(res => setTimeout(res, 1000)); return rpc(fn, args, true); }
  if (!r.ok) throw new Error(`${fn}: ${r.status} ${await r.text()}`);
  return r.json();
}

// The signed-in person's Supabase session on this site (the dashboard keeps it in
// localStorage), so an RPC can check who is asking. Null when signed out.
function sessionJwt() {
  try { return JSON.parse(localStorage.getItem('sb-gvijxenafoowajqktqvd-auth-token')).access_token || null; }
  catch (e) { return null; }
}
async function staffLinkButton(s, staffId) {
  const jwt = sessionJwt();
  if (!jwt) return;
  let slug = null;
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/rpc/perf_staff_link`, {
      method: 'POST',
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_staff_id: staffId }),
    });
    if (r.ok) slug = await r.json();
  } catch (e) {}
  const slot = document.getElementById('linkSlot');
  if (!slug || !slot) return;
  const link = 'https://trk-salon-os.com/me/' + slug;
  slot.outerHTML = `<button class="btn small" id="copyLink">Open ${esc(s.name.split(' ')[0])}'s view in another window ↗</button>`;
  document.getElementById('copyLink').onclick = async (e) => {
    const btn = e.currentTarget;
    window.open(link, '_blank', 'noopener');
    try { await navigator.clipboard.writeText(link); btn.textContent = 'Opened · link copied'; }
    catch (err) { btn.textContent = 'Opened'; prompt('Copy this link:', link); }
  };
}

// ── month picker ─────────────────────────────────────────────────────────
const now = new Date();
const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
// Kate, 2 Oct 2026: the month a page opens on. Last month stays the default until
// the day after the payslip email goes out (the first Monday of the month, 07:00
// Dubai), so nobody lands on a half-empty new month before their email. Dubai time.
// The same rule lives in index.html (spfOpeningMonth); change both together.
function openingMonth() {
  const d = new Date(Date.now() + 4 * 3600e3);              // Dubai is UTC+4, no DST
  const y = d.getUTCFullYear(), m = d.getUTCMonth();
  const firstMon = 1 + (8 - new Date(Date.UTC(y, m, 1)).getUTCDay()) % 7;
  const t = d.getUTCDate() > firstMon ? new Date(Date.UTC(y, m, 1)) : new Date(Date.UTC(y, m - 1, 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
}
const MONTH = /^\d{4}-\d{2}$/.test(qs.get('m') || '') ? qs.get('m') : openingMonth();
(function buildMonths() {
  const sel = document.getElementById('monthSel');
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    sel.add(new Option(d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }), v, false, v === MONTH));
  }
  sel.onchange = () => { qs.set('m', sel.value); location.search = qs.toString(); };
  pillMenu(sel);
})();

// Kate, 25 Sep 2026: the closed pill says "Sept 2026", not "September 2026", which
// wrapped the pill onto two lines on a phone. The open list keeps the full names;
// anything that is not "<Month> <year>" (Sort: Branch) is left as it is.
function pillShort(t) {
  // Inside the function: pillMenu() runs before this part of the file is reached.
  const mon = {January:'Jan',February:'Feb',March:'Mar',April:'Apr',May:'May',June:'Jun',July:'Jul', August:'Aug',September:'Sept',October:'Oct',November:'Nov',December:'Dec'};
  return t.replace(/^(January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})$/, (m, mo, y) => mon[mo] + ' ' + y);
}
// The dashboard's soft pill menu over a hidden <select> (a port of spfDD in index.html):
// the select keeps the value and fires its own change event.
function pillMenu(sel) {
  const wrap = sel.parentNode;
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'pdd-btn';
  btn.setAttribute('aria-haspopup', 'listbox'); btn.setAttribute('aria-label', sel.getAttribute('aria-label') || '');
  const menu = document.createElement('div');
  menu.className = 'pdd-menu'; menu.setAttribute('role', 'listbox');
  wrap.append(btn, menu);
  const close = () => { wrap.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); };
  const cur = sel.options[sel.selectedIndex];
  btn.innerHTML = esc(cur ? pillShort(cur.text) : '') + '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 3.5 5 7l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  [...sel.options].forEach(o => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = o.text; b.setAttribute('role', 'option');
    if (o.value === sel.value) { b.className = 'on'; b.setAttribute('aria-selected', 'true'); }
    b.onclick = () => { close(); if (sel.value !== o.value) { sel.value = o.value; sel.dispatchEvent(new Event('change')); } };
    menu.append(b);
  });
  btn.onclick = e => {
    e.stopPropagation();
    const open = !wrap.classList.contains('open');
    wrap.classList.toggle('open', open); btn.setAttribute('aria-expanded', String(open));
    // Kate, 2 Oct 2026: flip to the left edge when the right-hung menu would open off the screen.
    if (open) { menu.style.left = ''; menu.style.right = '';
      if (menu.getBoundingClientRect().left < 8) { menu.style.right = 'auto'; menu.style.left = '0'; } }
    if (open) (menu.querySelector('.on') || menu.firstChild).focus();
  };
  document.addEventListener('click', e => { if (!wrap.contains(e.target)) close(); });
  wrap.addEventListener('keydown', e => { if (e.key === 'Escape') { close(); btn.focus(); } });
}

// ── scoring ──────────────────────────────────────────────────────────────
// Share of the month the data covers, so a sum KPI on 12 Sep is judged on pace.
function paceFactor(d) {
  const m1 = new Date(d.month + 'T00:00:00');
  const days = new Date(m1.getFullYear(), m1.getMonth() + 1, 0).getDate();
  // Kate, 30 Sep 2026: the branch's last day of data, not hers. Ashleigh went on leave
  // on 17 Sep and the page said "data up to 16 Sept", pacing her as if half the month
  // was still to come.
  const to = d.numbers.data_to || d.numbers.last_date;
  const last = to ? new Date(to + 'T00:00:00') : null;
  if (!last || last.getMonth() !== m1.getMonth()) return 1;
  // In her first month the pace runs from her start day, not the 1st; leave days count on neither side.
  const from = startIn(d) ? startIn(d).day : 1, off = d.numbers.leave_days || 0;
  const total = days - from + 1 - off;
  return total > 0 ? Math.min(1, (last.getDate() - from + 1 - off) / total) : 1;
}
// Kate, 30 Sep 2026: "sa days lang na may pasok sila", for everyone. Four or more days
// in a row with no clients and no rostered hours is leave (perf_leave in Supabase), and
// the month's summed aims are cut to the days left, like a first month.
function workShare(d) {
  const m1 = new Date(d.month + 'T00:00:00');
  const days = new Date(m1.getFullYear(), m1.getMonth() + 1, 0).getDate();
  const st = startIn(d), off = d.numbers.leave_days || 0;
  const left = (st ? st.left : days) - off;
  if (!st && !off) return null;
  return left > 0 ? { f: left / days, left, off } : null;
}
// Kate, 28 Sep 2026: a stylist who started this month (perf_staff.started_on, her first
// day with clients) is judged on the days since, so the month's summed aims are
// prorated; percentages and averages don't depend on days and stay as they are.
function startIn(d) {
  const sd = d.numbers.start_date ? new Date(d.numbers.start_date + 'T00:00:00') : null;
  const m1 = new Date(d.month + 'T00:00:00');
  if (!sd || sd.getFullYear() !== m1.getFullYear() || sd.getMonth() !== m1.getMonth() || sd.getDate() === 1) return null;
  const days = new Date(m1.getFullYear(), m1.getMonth() + 1, 0).getDate();
  return { day: sd.getDate(), left: days - sd.getDate() + 1, f: (days - sd.getDate() + 1) / days };
}
function prorate(bm, f) {
  if (!bm) return;
  const cut = (v, fm) => v === null || v === undefined ? v
    : fm === 'aed' ? Math.round(v * f / 100) * 100 : Math.max(v > 0 ? 1 : 0, Math.round(v * f));
  Object.entries(bm).forEach(([k, b]) => {
    if (!KPI[k]?.sum || !b) return;
    b.target = cut(b.target, KPI[k].fmt);
    b.min = cut(b.min, KPI[k].fmt);
  });
}
function judged(k, n, pace) {
  const v = n[k];
  if (v === null || v === undefined) return null;
  return KPI[k]?.sum && pace < 1 ? v / pace : v;
}
function paceNote(k, n, pace, target) {
  // Nothing yet (0) has no pace to speak of: "on pace for 0" read like it was on track.
  if (!KPI[k]?.sum || pace >= 1 || !n[k]) return '';
  // Kate, 28 Sep 2026: only when the pace reaches the aim. "On pace for 110" under an aim
  // of 130 read like good news; the red dot already says she's behind.
  if (target !== null && target !== undefined && n[k] / pace < target) return '';
  return `On pace for ${fmt(n[k] / pace, KPI[k].fmt)}`;
}
// good = at or above target, warn = at or above minimum (or within 15% of the
// target when the PDF sets no minimum), bad = below that.
function status(v, b) {
  if (v === null || v === undefined || !b || b.target === null || b.target === undefined) return '';
  if (v >= b.target) return 'good';
  const floor = b.min !== null && b.min !== undefined ? b.min : b.target * 0.85;
  return v >= floor ? 'warn' : 'bad';
}
// What each number means, shown on hover or tap of the ⓘ by its label. Kept in step
// with perf_core / perf_clients / perf_reputation (Kate, 28 Sep 2026).
const TIPS = {
  total_revenue:   'Your service sales this month from Phorest, before VAT. Retail is not included.',
  hair_services:   'Your service sales minus treatments, before VAT.',
  treatments:      'Treatment sales on your clients this month, from the branch ledger, before VAT.',
  treatments_pct:  'Treatments as a share of your hair services.',
  retail:          'Products you sold this month, from Phorest, before VAT.',
  retail_pct:      'Retail as a share of your service sales.',
  avg_bill:        'Your service sales divided by your client numbers.',
  rebooking_pct:   'The share of your clients who booked their next visit before they left.',
  retention_pct:   'Of the returning clients you saw 3 to 6 months ago, the share you have seen again in the last 3 months.',
  clients:         'The clients you saw this month, from the branch ledger.',
  // Your client numbers (Kate, 30 Sep 2026): the four columns the branch ledger splits your clients into.
  req:             'Returning clients who booked with you by name. From the branch ledger.',
  salon:           'Returning clients who had no preference, so the salon booked them with you. From the branch ledger.',
  new_clients:     'Brand new clients on their first visit who did not ask for anyone, so the salon booked them with you. From the branch ledger.',
  ncr:             'New clients who asked for you by name, usually through a referral or your socials.',
  request_pct:     'Clients who asked for you (request clients plus new client requests) as a share of your client numbers.',
  conversion_pct:  'Of the brand new clients whose first visit was with you 3 to 6 months ago, the share who came back within 12 weeks.',
  column_fill_pct: 'Your booked hours as a share of your available hours, from Phorest.',
  colour_pct:      'The share of your client visits this month that included a colour service.',
  reputation:      'Average star rating of the Google reviews that name you or come from your clients, over the last 90 days. Counts once you have at least 3.',
  google_reviews:  'Google reviews this month that name you.',
  social_feed:     'Your posts tagging @tararosesalon this month, plus salon posts you are a collaborator on. Each post counts once.',
  social_workdays: 'Days you worked this month on which you posted with @tararosesalon, were a collaborator on a salon post, or mentioned the salon in your story.',
};
// A label with its meaning: hover on a computer, tap on a phone (tabindex makes it focusable).
const tipLbl = (k, label) => TIPS[k]
  ? `<span class="kpi-lbl" tabindex="0">${esc(label)}<span class="kpi-i" aria-hidden="true">ⓘ</span><span class="kpi-tip" role="tooltip">${esc(TIPS[k])}</span></span>`
  : `<span>${esc(label)}</span>`;
// A tip on a label near the right edge (the right-hand tiles on a phone) would run off
// the screen; slide it left just enough to stay on.
function fitTip(e) {
  const l = e.target.closest && e.target.closest('.kpi-lbl');
  if (!l) return;
  const tip = l.querySelector('.kpi-tip');
  tip.style.left = '0px';
  const over = tip.getBoundingClientRect().right - (document.documentElement.clientWidth - 8);
  if (over > 0) tip.style.left = -over + 'px';
}
document.addEventListener('mouseover', fitTip);
document.addEventListener('focusin', fitTip);
// ── stylist page ─────────────────────────────────────────────────────────
function tile(k, label, d, pace, extra = '') {
  const b = d.benchmarks?.[k];
  const st = status(judged(k, d.numbers, pace), b);
  const f = KPI[k].fmt;
  const aim = b ? (b.min !== null && b.min !== undefined && b.min !== b.target
    ? `Minimum ${fmt(b.min, f)} · aim ${fmt(b.target, f)}` : `Aim ${fmt(b.target, f)}`) : '';
  return `<div class="tile ${st}"><div class="lbl"><span class="dot"></span>${tipLbl(k, label)}</div>
    <div class="val">${fmt(d.numbers[k], f)}</div><div class="aim">${esc(aim)}${paceNote(k, d.numbers, pace, b?.target) ? '<br>' + esc(paceNote(k, d.numbers, pace, b?.target)) : ''}${extra}</div></div>`;
}

// Kate, 30 Sep 2026 (Tara on the call): always start with the win, then one top tip to
// close the gap next month. An AI-written pair saved for the month (d.ai_tip, from
// perf_tips) wins; otherwise the formula in win-gap.js, which the email uses too.
function winTipCard(d) {
  // win-gap.js cuts the aims for leave itself (the email has no page to do it), so it gets them uncut.
  const f = typeof winGap === 'function' ? winGap(Object.assign({}, d, { benchmarks: d.benchmarks_full })) : null;
  const ai = d.ai_tip && d.ai_tip.win && d.ai_tip.tip ? d.ai_tip : null;
  const w = ai ? ai.win : f && f.win, t = ai ? ai.tip : f && f.tip, how = ai ? ai.how : f && f.how;
  if (!w && !t) return '';
  return `<section class="card wintip">
      ${w ? `<div class="wt-block wt-win"><div class="eyebrow">Your win</div><p>${esc(w)}</p></div>` : ''}
      ${t ? `<div class="wt-block wt-tip"><div class="eyebrow">Top tip for next month</div><p>${esc(t)}</p>${how ? `<p class="wt-how">${esc(how)}</p>` : ''}</div>` : ''}
    </section>`;
}

// Road to promotion (Tara, 30 Sep 2026, phase two): the numbers at the bottom against
// the next level's aims, what closing each is worth a month, and the price step that
// comes with the level. "If they increased those, not only would they increase their
// revenue dramatically, they would then also be ready for a price increase."
// Prices: Downloads/Tara Rose Salons - Hair Price List.pdf (2026, by level). basket is the
// medium-length price of the nine level-priced services (cut, blow-dry, root and full
// colour, three balayages, half and full head foils) added up. No Artistic Director
// column yet, so a Style Director's card has no price line until Tara sets them (Kate's call).
const LEVEL_PRICES = {
  'Junior Stylist': { cut: 255, basket: 4090 },
  'Stylist':        { cut: 360, basket: 4845 },
  'Senior Stylist': { cut: 395, basket: 5340 },
  'Style Director': { cut: 420, basket: 5565 },
};
function roadCard(d, next) {
  if (!d.next_benchmarks || !d.next_level || typeof perfGaps !== 'function') return '';
  const g = perfGaps(d, d.next_benchmarks);
  if (!g) return '';
  const top = g.gaps.slice(0, 3), total = top.reduce((t, x) => t + x.aed, 0);
  const lvl = esc(d.next_level);
  const bar = x => {
    const f = KPI[x.k].fmt, w = Math.max(4, Math.min(100, Math.round(100 * x.now / x.aim)));
    return `<div class="road-row"><div class="road-top"><span>${esc(KPI[x.k].label.replace(/ %$/, ''))}</span><span class="road-worth">about ${fmt(x.aed, 'aed')} a month</span></div>
      <div class="road-bar" role="img" aria-label="${esc(fmt(x.now, f))} of ${esc(fmt(x.aim, f))}"><i style="width:${w}%"></i></div>
      <div class="road-ends"><span>You: ${esc(fmt(x.now, f))}</span><span>${lvl}: ${esc(fmt(x.aim, f))}</span></div></div>`;
  };
  const a = LEVEL_PRICES[d.staff.level], b = LEVEL_PRICES[d.next_level];
  const up = a && b ? b.basket / a.basket - 1 : null;
  const price = up > 0
    ? `<p class="road-price">At ${lvl} your prices go up too. A Cut &amp; Finish goes from AED ${a.cut} to AED ${b.cut}, and colour and balayage rise about ${Math.round(up * 100)}% on average. On this month's column that is about ${fmt(g.services * up, 'aed')} more a month, with the same clients.</p>` : '';
  return `<section class="card road">
      <div class="eyebrow">Your road to ${lvl}</div>
      <h2>${next ? `${next.hit} of ${next.of} there.` : 'Your next step.'}</h2>
      ${top.length ? `<p class="sub">The ${top.length === 1 ? 'number' : `${top.length} numbers`} that would move you most. Each bar runs from where you are now to the ${lvl} aim.</p>
        <div class="road-rows">${top.map(bar).join('')}</div>
        <p class="road-total">Close ${top.length === 1 ? 'it' : top.length === 2 ? 'both' : 'these three'} and you would take about <strong>${fmt(total, 'aed')} more a month</strong>.</p>`
        : `<p class="sub">Your money numbers are already at the ${lvl} aims. The rest of the step is in the list below.</p>`}
      ${price}
    </section>`;
}

// "Ask your coach" (Kate, 30 Sep 2026): a small chat box where she asks about her own
// numbers. The server fetches her month itself from her link, so it can only ever
// answer from her own data. Kept for the visit only, nothing is saved.
const coachShown = () => COACH_ON || qs.get('coach') === '1';
function coachCard(d) {
  if (!coachShown()) return '';
  const first = esc(d.staff.name.split(' ')[0]);
  const ideas = d.staff.dept === 'Hair'
    ? ['How do I get more clients?', 'What if I rebook 3 more a week?', 'How far am I from my next level?']
    : ['How do I get more clients?', 'What if I rebook 3 more a week?', 'Which number should I work on first?'];
  return `<section class="card coach" id="coach">
      <div class="eyebrow">Ask your coach</div>
      <p class="sub">Ask anything about your own numbers, ${first}. It only sees your page.</p>
      <div class="coach-log" id="coachLog" aria-live="polite"></div>
      <div class="coach-ideas">${ideas.map(q => `<button type="button" class="chip" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
      <form class="coach-form" id="coachForm"><input id="coachIn" maxlength="500" placeholder="Type your question…" autocomplete="off"><button class="btn" type="submit">Ask</button></form>
    </section>`;
}
function wireCoach(d) {
  const form = document.getElementById('coachForm');
  if (!form) return;
  const log = document.getElementById('coachLog'), inp = document.getElementById('coachIn');
  const history = [];
  const bubble = (who, text) => {
    const b = document.createElement('div');
    b.className = 'coach-msg ' + who; b.textContent = text; log.appendChild(b);
    b.scrollIntoView({ block: 'nearest' }); return b;
  };
  const ask = async (q) => {
    q = q.trim(); if (!q) return;
    bubble('me', q); inp.value = '';
    const wait = bubble('ai wait', 'Thinking…');
    try {
      const r = await fetch(COACH_FN, {
        method: 'POST',
        headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({ action: 'ask', question: q, month: MONTH, history },
          TOKEN ? { token: TOKEN } : { admin: ADMIN, staff_id: d.staff_id })),
      });
      const out = await r.json().catch(() => ({}));
      const a = out.answer || out.error || 'No answer came back. Try again.';
      wait.className = 'coach-msg ai' + (out.answer ? '' : ' err'); wait.textContent = a;
      if (out.answer) history.push({ role: 'user', content: q }, { role: 'assistant', content: a });
    } catch (e) {
      wait.className = 'coach-msg ai err'; wait.textContent = 'Could not reach the coach. Try again in a moment.';
    }
  };
  form.onsubmit = (e) => { e.preventDefault(); ask(inp.value); };
  document.querySelectorAll('#coach .chip').forEach(c => c.onclick = () => ask(c.dataset.q));
}

function kpiRows(n, bm, pace, keys) {
  return keys.filter(k => bm?.[k]).map(k => {
    const x = KPI[k], b = bm[k];
    const note = x.note ? `<small class="r-note">${esc(x.note)}</small>` : '';
    const needs = typeof x.needs === 'function' ? x.needs(n) : x.needs;
    if (x.untracked || (x.needs && (n[k] === null || n[k] === undefined))) return `<div class="row untracked">${tipLbl(k, x.label)}<span class="r-val"><small>${x.untracked ? 'Not tracked yet' : esc(needs)} · aim ${fmt(b.target, x.fmt)}</small></span>${note}</div>`;
    const st = x.unscored ? '' : status(judged(k, n, pace), b);
    const pn = paceNote(k, n, pace, b.target);
    const tail = x.unscored ? `<small>${esc(x.unscored)}</small>` : `<small>/ ${fmt(b.target, x.fmt)}${pn ? ' · ' + esc(pn.charAt(0).toLowerCase() + pn.slice(1)) : ''}</small>`;
    return `<div class="row">${tipLbl(k, x.label)}<span class="r-val">${fmt(n[k], x.fmt)} <span class="r-tail">${tail}<span class="dot ${st}"></span></span></span>${note}</div>`;
  }).join('');
}

// Instagram posts that tag @tararosesalon from her own handle, the salon's posts she's a
// collaborator on (via 'collab'), plus story mentions (perf_socials). Shown for everyone, Beauty included, benchmark or not. Kate, 28 Sep 2026.
const IG_TYPE = { VIDEO: 'Reel', CAROUSEL_ALBUM: 'Carousel', IMAGE: 'Post' };
function socials(n) {
  const h = n.ig_handles || [];
  if (!h.length) return `<p class="muted">No Instagram handle on file yet. Tell your salon manager yours so your posts count.</p>`;
  const list = n.social_list || [];
  const handles = h.map(x => `<a class="rv-link" href="https://www.instagram.com/${encodeURIComponent(x)}/" target="_blank" rel="noopener">@${esc(x)}</a>`).join(', ');
  return `<p class="sub">${fmt(list.length, 'num')} ${list.length === 1 ? 'post' : 'posts'} with @tararosesalon this month · ${fmt(n.social_stories, 'num')} story ${n.social_stories === 1 ? 'mention' : 'mentions'} · ${handles}</p>
    ${list.length ? list.map(p => `<div class="note">${p.via === 'collab' ? 'Collab on a salon post' : esc(IG_TYPE[p.type] || 'Post')}<div class="by">${esc(dayLabel(p.date))}${p.link ? ` · <a class="rv-link" href="${esc(p.link)}" target="_blank" rel="noopener">View on Instagram ↗</a>` : ''}</div></div>`).join('')
      : `<p class="muted">Nothing tagged yet this month. Tag @tararosesalon on your posts and reels so they show here.</p>`}
    <p class="legend">Feed posts, reels and carousels update nightly. Story mentions count from 28 Sep 2026.</p>`;
}

// Reputation on its own, no aim, for a page with no benchmarks yet (Beauty). Kate, 28 Sep 2026.
function repRow(n) {
  const x = KPI.reputation, has = n.reputation !== null && n.reputation !== undefined;
  return `<div class="row${has ? '' : ' untracked'}">${tipLbl('reputation', x.label)}<span class="r-val">${has ? fmt(n.reputation, x.fmt) : `<small>${esc(x.needs(n))}</small>`}</span><small class="r-note">${esc(x.note)}</small></div>`;
}

function scoreLine(n, bm, pace) {
  const keys = KPIS.filter(x => !x.untracked && !x.unscored && bm?.[x.k] && n[x.k] !== null && n[x.k] !== undefined).map(x => x.k);
  const hit = keys.filter(k => judged(k, n, pace) >= bm[k].target).length;
  return { hit, of: keys.length };
}

// Kate, 28 Sep 2026: the cards under the numbers fold, so the page isn't a wall of
// information. Tap a card's title to open or close it; each card remembers its state
// in this browser. Google reviews and socials start closed, with a one-line summary
// on the title so the headline still shows; the month's numbers never fold.
const FOLD_KEEP = /^(This month so far|Your month|Your team|Your road to)/;
const FOLD_SHUT = ['Your Google reviews', 'Your socials'];
// Tara, 30 Sep 2026: "if I open it on my phone, I don't open it because there's so much".
// On a phone the page opens on the win, the tip, the six numbers and the payslip; every
// other card starts closed with a one-line summary, cards titled by a heading as well
// as by an eyebrow. Desktop is as it was. A phone remembers its own open cards.
const PHONE = matchMedia('(max-width:619px)').matches;
const FOLD_KEEP_PHONE = /^(This month so far|Your month|Your team|Payslip|Ask your coach|Your road to)/;
const FOLD_KEY = PHONE ? 'perf-fold-phone' : 'perf-fold';
let FOLD = {};
try { FOLD = JSON.parse(localStorage.getItem(FOLD_KEY) || '{}') || {}; } catch (e) {}
function foldCards(summary) {
  app.querySelectorAll('section.card').forEach(card => {
    if (card.classList.contains('hero') || card.classList.contains('wintip')) return;
    // Desktop: eyebrow titles only. Phone: a heading (or the chart's head, which carries
    // its Daily / Weekly buttons) stands in when there is no eyebrow.
    const head = card.querySelector(':scope > .eyebrow')
      || (PHONE && (card.querySelector(':scope > .card-head') || card.querySelector(':scope > h2')));
    if (!head) return;
    const title = (head.querySelector('h2') || head).textContent.trim();
    if ((PHONE ? FOLD_KEEP_PHONE : FOLD_KEEP).test(title)) return;
    const key = title.replace(/ · .*/, '');
    const body = document.createElement('div');
    body.className = 'fold-body';
    while (head.nextSibling) body.appendChild(head.nextSibling);
    card.appendChild(body);
    // A div, not a button: the chart's head has buttons of its own inside it.
    const btn = document.createElement('div');
    btn.className = 'fold-h'; btn.setAttribute('role', 'button'); btn.tabIndex = 0;
    const sum = summary[key] ? `<span class="fold-sum">${esc(summary[key])}</span>` : '';
    btn.innerHTML = `<span class="fold-t"></span>${sum}<span class="fold-chev" aria-hidden="true">⌄</span>`;
    head.replaceWith(btn);
    btn.querySelector('.fold-t').appendChild(head);
    const shut = key in FOLD ? FOLD[key] : PHONE || FOLD_SHUT.includes(key);
    const paint = s => { card.classList.toggle('folded', s); btn.setAttribute('aria-expanded', String(!s)); };
    paint(shut);
    const flip = () => {
      const s = !card.classList.contains('folded');
      paint(s); FOLD[key] = s;
      try { localStorage.setItem(FOLD_KEY, JSON.stringify(FOLD)); } catch (e) {}
      // A chart drawn while its card was closed has no size; redraw it once it shows.
      if (!s && typeof Chart !== 'undefined') card.querySelectorAll('canvas').forEach(cv => { const ch = Chart.getChart(cv); if (ch) { ch.resize(); ch.update('none'); } });
      postHeight();
    };
    btn.onclick = e => { if (!e.target.closest('button, a')) flip(); };
    btn.onkeydown = e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === btn) { e.preventDefault(); flip(); } };
  });
}

async function renderStylist() {
  // Kate, 2 Oct 2026: on her own link the tip only needs the token, so it is asked for
  // alongside perf_dashboard instead of after it.
  const tipAsk = TOKEN ? rpc('perf_tip', { p_token: TOKEN, p_month: MONTH + '-01' }).catch(() => null) : null;
  const key = [TOKEN, SID, MONTH].join('|');
  if (RAW_KEY !== key || !RAW) {
    RAW = TOKEN
      ? await rpc('perf_dashboard', { p_token: TOKEN, p_month: MONTH + '-01' })
      : await rpc('perf_dashboard_by_id', { p_admin: ADMIN, p_staff_id: SID, p_month: MONTH + '-01' });
    RAW_KEY = key;
  }
  const d = RAW ? withSource(JSON.parse(JSON.stringify(RAW))) : null;
  if (!d) { app.innerHTML = `<p class="err">This link isn't active. Ask your salon manager for a new one.</p>`; return; }
  if (d.role) ROLE = d.role; else if (ADMIN && TOKEN && !ROLE) ROLE = 'leader';
  // An AI-written win + tip for the month, if one was saved (perf_tips); the formula otherwise.
  try {
    d.ai_tip = TOKEN ? await tipAsk
      : d.staff_id ? await rpc('perf_tip_by_id', { p_admin: ADMIN, p_staff_id: d.staff_id, p_month: MONTH + '-01' }) : null;
  } catch (e) { d.ai_tip = null; }
  const started = startIn(d), share = workShare(d);
  d.benchmarks_full = d.benchmarks ? JSON.parse(JSON.stringify(d.benchmarks)) : d.benchmarks;
  if (share) { prorate(d.benchmarks, share.f); prorate(d.next_benchmarks, share.f); }
  const n = d.numbers, s = d.staff, pace = paceFactor(d);
  const isHair = s.dept === 'Hair';
  const midMonth = pace < 1;
  document.title = `${s.name} · My Numbers`;
  tellParent(slugOf(s.name));

  const six = [
    tile('avg_bill', isHair ? 'Average bill' : 'Beauty average bill', d, pace,
      `<br>With retail: ${fmt(n.avg_bill_retail, 'aed')}`),
    isHair ? tile('treatments_pct', 'Treatment %', d, pace) : tile('request_pct', 'Request rate', d, pace),
    tile('retail_pct', 'Retail %', d, pace),
    // Emma, 29 Sep 2026: the count under the rate, "10 of 20 clients rebooked".
    tile('rebooking_pct', 'Rebooking %', d, pace, SRC === 'phorest' ? '<br>Not in our Phorest feed yet. Switch to Ledger to see it.'
      : n.clients > 0 ? `<br>${fmt(n.rebooked, 'num')} of ${fmt(n.clients, 'num')} clients rebooked` : ''),
    tile('clients', 'Total clients', d, pace),
    tile('column_fill_pct', 'Column fill', d, pace, `<br>${fmt(n.booked_hours, 'num')} of ${fmt(n.available_hours, 'num')} hours booked`),
  ].join('');

  const pct = v => n.clients > 0 ? ` · ${Math.round(100 * v / n.clients)}%` : '';
  // Phorest only splits out requests and new clients, so salon and NCR drop off there.
  const clientTiles = [['req', 'Request', n.req], ['salon', 'Salon', n.salon], ['new_clients', 'New', n.new_clients], ['ncr', 'New client request', n.ncr]]
    .filter(([, , v]) => SRC !== 'phorest' || v !== null)
    .map(([k, l, v]) => `<div class="tile"><div class="lbl">${tipLbl(k, l)}</div><div class="val">${fmt(v, 'num')}</div><div class="aim">${fmt(v, 'num')} of ${fmt(n.clients, 'num')}${pct(v)}</div></div>`).join('');

  const allKeys = KPIS.map(x => x.k);
  const own = d.benchmarks ? scoreLine(n, d.benchmarks, pace) : null;
  const next = d.next_benchmarks ? scoreLine(n, d.next_benchmarks, pace) : null;

  const weeks = d.weeks.filter(w => w.numbers.total_revenue > 0 || w.numbers.clients > 0);
  // Daily: every day from the 1st to the last day with any sales or clients, days off
  // left in as zeros so the gaps show.
  const allDays = d.days || [];
  let lastDay = -1;
  allDays.forEach((x, i) => { if (x.total_revenue > 0 || x.clients > 0) lastDay = i; });
  const days = allDays.slice(0, lastDay + 1);
  // Kate, 28 Sep 2026: on a phone five columns with "AED" in two of them wrapped every
  // figure onto two lines. AED moves to a note under the title (so the headers stay one even row), the month shortens (Jun 2026),
  // and the figures never wrap; only the month column may.
  const hist = (d.history || []).map(h => `<tr><td>${esc(monthLabel(h.month).replace(/^(\w{3})\w*/, '$1'))}</td><td>${fmt(h.numbers.total_revenue, 'num')}</td><td>${fmt(h.numbers.clients, 'num')}</td><td>${fmt(h.numbers.rebooking_pct, 'pct')}</td><td>${fmt(h.numbers.avg_bill, 'num')}</td></tr>`).join('');

  const cw = n.conversion_weeks || {};
  const notes = (d.notes || []).map(x => `<div class="note">${esc(x.note)}<div class="by">${esc(x.author)} · ${esc(noteStamp(x.at))}${canEdit() ? `<button data-del="${x.id}">remove</button>` : ''}</div></div>`).join('');

  app.innerHTML = `
    ${ADMIN ? `<div class="admin-bar"><a class="back" href="?admin=${encodeURIComponent(ADMIN)}&m=${MONTH}${keep}&dept=${DEPT}">← Your team</a>
      ${canEdit() ? `<button class="btn small" id="copyLink">Open ${esc(s.name.split(' ')[0])}'s view in another window ↗</button>` : `<span id="linkSlot"></span>`}</div>` : ''}
    <section class="card hero">
      ${photoFor(s.keys) ? `<img class="hero-photo" src="${photoFor(s.keys)}" alt="" onerror="this.remove()">` : ''}
      <h1>${esc(s.name)}</h1>
      <div class="level">${esc(s.level || (isHair ? 'Hair team' : 'Beauty team'))} · ${esc(s.branch)} · ${esc(monthLabel(d.month))}</div>
      <div class="intro">Your month in pictures: what went well, one tip for next month, and where you are against the next step up. One page with your own numbers and your leader's notes, nothing about anyone else.</div>
    </section>

    ${winTipCard(d)}
    ${coachCard(d)}

    <section class="card">
      <div class="eyebrow">${midMonth ? 'This month so far' : 'Your month'}</div>
      <div class="card-head"><h2>The six numbers.</h2><div class="dept-seg chart-seg" id="srcSeg" role="group" aria-label="Where the client numbers come from"><button type="button" data-src="ledger"${SRC === 'ledger' ? ' class="on"' : ''}>Ledger</button><button type="button" data-src="phorest"${SRC === 'phorest' ? ' class="on"' : ''}>Phorest</button></div></div>
      <p class="sub">${SRC === 'phorest'
        ? 'Clients, requests, new clients and average bill are Phorest’s own counts. Sales are from Phorest either way.'
        : 'Clients, requests, new clients and rebooking are from the branch ledger reception fills in. Sales are from Phorest either way.'}</p>
      ${midMonth ? `<p class="sub">Money numbers are judged on pace for the full month, with data up to ${esc(dayLabel(n.data_to || n.last_date))}.</p>` : ''}
      ${started && !(share && share.off) ? `<p class="sub">You started on ${esc(dayLabel(n.start_date))}, so this month's totals are aimed at the ${started.left} days since.</p>` : ''}
      ${share && share.off ? `<p class="sub">${started ? `You started on ${esc(dayLabel(n.start_date))} and` : 'You'} were away ${(n.leave || []).map(x => x.from === x.to ? esc(dayLabel(x.from)) : `${esc(dayLabel(x.from))} to ${esc(dayLabel(x.to))}`).join(' and ')}, so this month's totals are aimed at the ${share.left} days you were here.</p>` : ''}
      <div class="grid three">${six}</div>
      <p class="legend">${d.benchmarks ? 'Green means at or above your aim, amber means close, red means under.' : 'Benchmarks for the beauty team are still being set, so these show your numbers only.'}</p>
    </section>


    ${roadCard(d, next)}

    <section class="card">
      <h2>Your client numbers</h2>
      <p class="sub">Who sat in your chair this month.</p>
      <div class="grid">${clientTiles}</div>
    </section>

    ${weeks.length ? `<section class="card"><div class="card-head"><h2 id="wkTitle">${CHART_MODE === 'day' ? 'Day by day' : 'Week by week'}</h2>${days.length ? `<div class="dept-seg chart-seg" id="wkSeg"><button type="button" data-m="day"${CHART_MODE === 'day' ? ' class="on"' : ''}>Daily</button><button type="button" data-m="week"${CHART_MODE === 'week' ? ' class="on"' : ''}>Weekly</button></div>` : ''}</div><p class="sub">Sales (bars) and clients (line).</p><div class="chart-wrap"><canvas id="wk"></canvas></div></section>` : ''}

    ${d.benchmarks ? `<section class="card">
      <div class="eyebrow">Your level · ${esc(s.level)}</div>
      <h2>Holding your level</h2>
      <p class="score">You're at or above target on <strong>${own.hit} of ${own.of}</strong>.</p>
      <div class="rows">${kpiRows(n, d.benchmarks, pace, allKeys)}</div>
    </section>` : ''}

    ${d.next_benchmarks ? `<section class="card">
      <div class="eyebrow">Ready for ${esc(d.next_level)}?</div>
      <h2>Your next step up</h2>
      <p class="score">These are the aims for ${esc(d.next_level)}. You're there on <strong>${next.hit} of ${next.of}</strong>.</p>
      <div class="rows">${kpiRows(n, d.next_benchmarks, pace, allKeys)}</div>
    </section>` : ''}

    ${d.benchmarks ? '' : `<section class="card">
      <div class="eyebrow">Your reputation score</div>
      <div class="rows">${repRow(n)}</div>
    </section>`}

    <section class="card">
      <div class="eyebrow">Your Google reviews</div>
      ${(n.review_list || []).length ? `<p class="sub">${n.google_reviews} this month${n.review_stars ? ` · average ${n.review_stars} stars` : ''}.</p>
        ${n.review_list.map(r => `<div class="note"><span class="stars">${'★'.repeat(r.stars || 0)}</span> ${r.comment ? esc(r.comment) : '<i class="muted">Rating only, no written comment</i>'}<div class="by">${esc(dayLabel(r.date))}${r.how === 'client' ? ' · from your client, who didn\'t name anyone' : ''}${r.branch ? ` · <a class="rv-link" href="${mapsFor(r.branch)}" target="_blank" rel="noopener">Read on Google ↗</a>` : ''}</div></div>`).join('')}`
        : `<p class="muted">No Google reviews for you yet this month. Ask happy clients to mention you by name.</p>`}
    </section>

    <section class="card">
      <div class="eyebrow">Your socials</div>
      ${socials(n)}
    </section>

    <section class="card">
      <div class="eyebrow">Notes from Tara and Emma</div>
      ${notes || `<p class="muted">No notes yet for this month. They appear here once a leader has written them.</p>`}
      ${canEdit() ? `<textarea id="noteText" placeholder="Write a note for ${esc(s.name)}…"></textarea><button class="btn" id="noteSave">Add note</button>` : ''}
    </section>

    <section class="card">
      <div class="eyebrow">New clients and returning clients</div>
      <p class="sub">The ${fmt(n.conversion_n, 'num')} new clients whose first visit was with you 3 to 6 months ago, and when they came back.</p>
      <div class="rows">
        <div class="row"><span>Back within 4 weeks</span><span class="r-val">${fmt(cw.w4, 'num')}</span></div>
        <div class="row"><span>5 to 6 weeks</span><span class="r-val">${fmt(cw.w6, 'num')}</span></div>
        <div class="row"><span>7 to 8 weeks</span><span class="r-val">${fmt(cw.w8, 'num')}</span></div>
        <div class="row"><span>9 to 12 weeks</span><span class="r-val">${fmt(cw.w12, 'num')}</span></div>
        <div class="row"><span>Not back yet</span><span class="r-val">${fmt(cw.not_yet, 'num')}</span></div>
      </div>
      <p class="legend">Conversion ${fmt(n.conversion_pct, 'pct')} of ${fmt(n.conversion_n, 'num')} new clients · Retention ${fmt(n.retention_pct, 'pct')} of ${fmt(n.retention_n, 'num')} regulars. Client history runs to ${esc(dayLabel(n.asof))}.</p>
    </section>

    ${hist ? `<section class="card"><h2>The last three months</h2>
      <p class="hist-note">Revenue and average bill in AED.</p>
      <table class="hist"><tr><th>Month</th><th>Revenue</th><th>Clients</th><th>Rebook</th><th>Avg bill</th></tr>${hist}</table></section>` : ''}

    <section class="card">
      <div class="eyebrow">Payslip · ${esc(monthLabel(d.month))}</div>
      <div id="payslipBox">${TOKEN ? '<p class="muted">Checking for your payslip…</p>' : `<p class="muted">Payslips are private. Only ${esc(s.name.split(' ')[0])} can open hers, from her own link.</p>`}</div>
    </section>
    ${isHair ? `
    <section class="card">
      <div class="eyebrow">Your three paths at Tara Rose</div>
      <div class="paths">
        <div class="path"><b>The Employed Stylist</b>Commission on your quota with a guaranteed income while you build. Tara Rose brings the clients, colour, visa and health cover.<a class="path-link" href="${BROCHURE.employed}" target="_blank" rel="noopener">Read the brochure →</a></div>
        <div class="path"><b>The Flex Stylist</b>A higher commission split and more say over your schedule, with the full Tara Rose support behind you.<a class="path-link" href="${BROCHURE[/^(SAA|KCA)$|saadiyat|khalifa/i.test(s.branch || '') ? 'flex-abudhabi' : 'flex-dubai']}" target="_blank" rel="noopener">Read the brochure →</a></div>
        <div class="path"><b>Rent-a-Chair</b>Pay a monthly chair fee and keep your own clients and bookings.<a class="path-link" href="${BROCHURE.chair}" target="_blank" rel="noopener">Read the brochure →</a></div>
        <div class="path"><b>Relocation</b>Moving country to join on the Employed path: what we cover, from visa and health cover to a guaranteed income while you settle in.<a class="path-link" href="${BROCHURE.relocation}" target="_blank" rel="noopener">Read the brochure →</a></div>
      </div>
      <p class="legend"><a href="https://trk-salon-os.com/performance/compare-paths.html${/^(SAA|KCA)$|saadiyat|khalifa/i.test(s.branch || '') ? '?city=abudhabi' : ''}" target="_blank" rel="noopener">See all three paths side by side</a>. If you need more details, ask Tara or your manager about each path.</p>
    </section>` : ''}`;

  foldCards({
    'Your Google reviews': `${fmt(n.google_reviews || 0, 'num')} this month`,
    'Your socials': `${fmt((n.social_list || []).length, 'num')} ${(n.social_list || []).length === 1 ? 'post' : 'posts'}`,
    // Phone-only titles (desktop never folds these).
    'Your client numbers': `${fmt(n.clients || 0, 'num')} clients`,
    'Your level': own ? `${own.hit} of ${own.of} at target` : '',
    [`Ready for ${d.next_level}?`]: next ? `${next.hit} of ${next.of}` : '',
    'Notes from Tara and Emma': (d.notes || []).length ? `${d.notes.length} ${d.notes.length === 1 ? 'note' : 'notes'}` : 'None yet',
    'New clients and returning clients': n.conversion_pct != null ? `${fmt(n.conversion_pct, 'pct')} came back` : '',
  });
  if (TOKEN) loadPayslip();
  wireCoach(d);
  document.getElementById('foot').textContent =
    `Reviews to ${dayLabel(d.data_through.reviews)} · sales to ${dayLabel(d.data_through.revenue)} · clients to ${dayLabel(d.data_through.clients)} · column fill to ${dayLabel(d.data_through.column_fill)} · client history to ${dayLabel(d.data_through.client_history)}. Revenue is ex VAT.`;

  let wkChart = null;
  // Kate, 29 Sep 2026: hair keeps violet bars and a green line; beauty is pink bars
  // and a deep violet line, so the two teams' charts never look alike.
  const pal = isHair ? { bar: '#C4B5FD', line: '#0F6E56' } : { bar: '#FF9B9B', line: '#6D28D9' };
  const drawChart = () => {
    const css = getComputedStyle(document.documentElement);
    const daily = CHART_MODE === 'day' && days.length;
    const rows = daily
      ? days.map(x => ({ label: new Date(x.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' }), sales: x.total_revenue, clients: x.clients }))
      : weeks.map(w => ({ label: new Date(w.week_start + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), sales: w.numbers.total_revenue, clients: w.numbers.clients }));
    if (wkChart) wkChart.destroy();
    wkChart = new Chart(document.getElementById('wk'), {
      data: {
        labels: rows.map(r => r.label),
        datasets: [
          // Lower order draws on top, so the line sits over the bars instead of vanishing behind them.
          { type: 'bar', order: 2, label: 'Sales (AED)', data: rows.map(r => r.sales), backgroundColor: pal.bar, yAxisID: 'y', borderRadius: daily ? 3 : 6, maxBarThickness: 120 },
          { type: 'line', order: 1, label: 'Clients', data: rows.map(r => r.clients), borderColor: pal.line, borderWidth: daily ? 2 : 2.5, backgroundColor: pal.line,
            pointRadius: daily ? 3 : 5, pointHoverRadius: daily ? 5 : 7, pointBackgroundColor: '#fff', pointBorderColor: pal.line, pointBorderWidth: 2, yAxisID: 'y1', tension: 0.4, cubicInterpolationMode: 'monotone' },   // smooth, never overshoots (Kate, 29 Sep 2026)
        ],
      },
      options: {
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { labels: { color: css.getPropertyValue('--muted'), usePointStyle: true, pointStyle: 'circle', boxHeight: 8 } } },
        scales: {
          // Both axes start at zero with headroom, so a short week doesn't look like a cliff and the tallest bar doesn't hit the ceiling.
          y: { beginAtZero: true, grace: '10%', ticks: { color: css.getPropertyValue('--muted') }, grid: { color: css.getPropertyValue('--border') } },
          y1: { position: 'right', beginAtZero: true, grace: '10%', ticks: { color: css.getPropertyValue('--muted'), precision: 0 }, grid: { display: false } },
          x: { ticks: { color: css.getPropertyValue('--muted'), autoSkip: true, maxRotation: 0 }, grid: { display: false } },
        },
      },
    });
  };
  if (weeks.length && window.Chart) {
    drawChart();
    const seg = document.getElementById('wkSeg');
    if (seg) seg.onclick = (e) => {
      const b = e.target.closest('button[data-m]');
      if (!b || b.dataset.m === CHART_MODE) return;
      CHART_MODE = b.dataset.m;
      try { localStorage.setItem('perf-chart', CHART_MODE); } catch (err) {}
      seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      document.getElementById('wkTitle').textContent = CHART_MODE === 'day' ? 'Day by day' : 'Week by week';
      drawChart();
    };
  }

  const srcSeg = document.getElementById('srcSeg');
  if (srcSeg) srcSeg.onclick = (e) => {
    const b = e.target.closest('button[data-src]');
    if (!b || b.dataset.src === SRC) return;
    SRC = b.dataset.src;
    try { localStorage.setItem('perf-src', SRC); } catch (err) {}
    const y = scrollY;
    renderStylist().then(() => scrollTo(0, y));
  };

  // Kate, 3 Oct 2026: Level 3 and above see the staff link on a view-only key too.
  // perf_staff_link answers only for a signed-in dashboard user at Level 3+ (UAE
  // scope), with her /me/ link; Level 2 and below get null and no button.
  if (!canEdit() && d.staff_id && document.getElementById('linkSlot')) staffLinkButton(s, d.staff_id);

  if (canEdit()) {
    // Their own link: no admin key, no month, so it always opens on the current month.
    // Kate, 25 Sep 2026: opens it (so you see what they see) and copies it in the same
    // tap. The window opens first, while the tap still counts as the gesture that
    // allows a new window; the copy waits on the clipboard after that.
    document.getElementById('copyLink').onclick = async (e) => {
      const btn = e.currentTarget;
      const link = PUBLIC_PAGE + '?t=' + TOKEN;
      window.open(link, '_blank', 'noopener');
      try { await navigator.clipboard.writeText(link); btn.textContent = 'Opened · link copied'; }
      catch (err) { btn.textContent = 'Opened'; prompt('Copy this link:', link); }
    };
    document.getElementById('noteSave').onclick = async () => {
      const t = document.getElementById('noteText').value;
      if (!t.trim()) return;
      await rpc('perf_add_note', { p_admin: ADMIN, p_token: TOKEN, p_month: MONTH + '-01', p_note: t });
      RAW = null; renderStylist();
    };
    app.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      if (!confirm('Remove this note?')) return;
      await rpc('perf_delete_note', { p_admin: ADMIN, p_note_id: Number(b.dataset.del) });
      RAW = null; renderStylist();
    });
  }
}

// Her own payslip for the month, from the private bucket through the payslips
// edge function. The link it hands back is signed and lasts ten minutes, so it
// is fetched fresh on the click rather than baked into the page.
const PAYSLIP_FN = SUPA_URL + '/functions/v1/payslips';
async function payslipMine() {
  const r = await fetch(PAYSLIP_FN, {
    method: 'POST',
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'mine', token: TOKEN, month: MONTH }),
  });
  if (!r.ok) throw new Error('payslip ' + r.status);
  return r.json();
}
async function loadPayslip() {
  const box = document.getElementById('payslipBox');
  if (!box) return;
  try {
    const p = await payslipMine();
    if (!p.exists) {
      box.innerHTML = `<p class="muted">Your payslip for this month isn't up yet. It appears here, and comes attached to your monthly email, once the accounts team has uploaded it.</p>`;
      return;
    }
    box.innerHTML = `<p>Your payslip is ready. Only you can open it.</p>
      <button class="btn" id="payslipOpen">Open your payslip (PDF)</button>`;
    // Kate, 2 Oct 2026: opens on trk-salon-os.com/payslip/, not the storage address
    // (payslip/open.js passes the 10-minute link across).
    document.getElementById('payslipOpen').onclick = () => openPayslipPage(
      async () => { const q = await payslipMine(); return q.url ? { url: q.url, name: q.file_name } : null; },
      e => { if (e) alert("Couldn't open it just now. Try again in a minute."); });
  } catch (e) {
    box.innerHTML = `<p class="muted">Couldn't check for your payslip just now.</p>`;
  }
  postHeight();
}

// ── team view ────────────────────────────────────────────────────────────
async function renderTeam() {
  const d = await rpc('perf_team', { p_admin: ADMIN, p_month: MONTH + '-01' });
  if (!d) { app.innerHTML = `<p class="err">This team link isn't valid.</p>`; return; }
  ROLE = d.role || 'leader';
  // Opened from a dashboard address with &staff=<slug>: go straight to that person.
  const hit = STAFF_SLUG && d.staff.find(s => slugOf(s.name) === STAFF_SLUG);
  if (hit) { if (hit.token) TOKEN = hit.token; else SID = hit.id; return renderStylist(); }
  tellParent(null);
  const BR = { KCA: 'Khalifa City A', SAA: 'Saadiyat', MC: 'Motor City', AQ: 'Al Quoz' };
  // The standalone page carries its own Hair / Beauty switch; in the dashboard
  // the sticky bar above the frame does it.
  const shown = d.staff.filter(s => DEPT === 'all' || s.dept === DEPT);
  const initials = n => n.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  // Branch keeps the grouped layout; any other sort is one flat grid with the
  // branch on each card. Names and branches run A–Z first, numbers high first.
  const num = v => (v === null || v === undefined || Number.isNaN(v)) ? -Infinity : v;
  // Position: the hair ladder, top first (same order as perf_benchmarks.level_order).
  // Beauty has no level set, so it sits after the ladder as one group.
  const LADDER = ['Style Director', 'Senior Stylist', 'Stylist', 'Junior Stylist', 'Blow-Dry Specialist'];
  const rankOf = s => { const i = LADDER.indexOf(s.level); return i < 0 ? -1 : LADDER.length - i; };
  const posOf = s => s.level || s.dept;
  const SORTS = {
    branch:  { label: 'Branch' },
    name:    { label: 'Name',    cmp: (a, b) => a.name.localeCompare(b.name) },
    takings: { label: 'Takings', cmp: (a, b) => num(b.numbers.total_revenue) - num(a.numbers.total_revenue) },
    clients: { label: 'Clients', cmp: (a, b) => num(b.numbers.clients) - num(a.numbers.clients) },
    rebook:  { label: 'Rebook %', cmp: (a, b) => num(b.numbers.rebooking_pct) - num(a.numbers.rebooking_pct) },
    level:   { label: 'Position', cmp: (a, b) => rankOf(b) - rankOf(a) },
  };
  if (!SORTS[SORT]) SORT = 'branch';
  const flip = SORT_REV ? -1 : 1;
  const card = s => `
        <a class="member" href="?${s.token ? 't=' + encodeURIComponent(s.token) : 'sid=' + encodeURIComponent(s.id)}&admin=${encodeURIComponent(ADMIN)}&m=${MONTH}${keep}&dept=${DEPT}&staff=${slugOf(s.name)}">
          ${photoFor(s.keys)
            ? `<img class="photo" src="${photoFor(s.keys)}" alt="" loading="lazy" onerror="this.outerHTML='<div class=&quot;ini&quot;>${esc(initials(s.name))}</div>'">`
            : `<div class="ini">${esc(initials(s.name))}</div>`}
          <div class="nm">${esc(s.name)}</div>
          <div class="lv">${esc(s.level || s.dept)}${SORT === 'branch' ? '' : ` · ${esc(BR[s.branch] || s.branch)}`}</div>
          <div class="mini">${fmt(s.numbers.total_revenue, 'aed')} · ${fmt(s.numbers.clients, 'num')} clients<br>Rebook ${fmt(s.numbers.rebooking_pct, 'pct')}</div>
          ${s.notes ? `<div class="lv">${s.notes} note${s.notes > 1 ? 's' : ''}</div>` : ''}
          ${!s.has_email ? `<div class="flag">No email on file</div>` : (!s.send_email ? `<div class="flag">Email paused</div>` : '')}
        </a>`;
  let body;
  if (SORT === 'branch') {
    const groups = {};
    shown.forEach(s => (groups[s.branch] ||= []).push(s));
    body = Object.keys(groups).sort((a, b) => flip * (BR[a] || a).localeCompare(BR[b] || b)).map(b => `
      <div class="branch-h">${esc(BR[b] || b)}</div>
      ${['Hair', 'Beauty'].filter(dp => groups[b].some(s => s.dept === dp)).map(dp => `
      ${DEPT === 'all' ? `<div class="dept-h">${dp}</div>` : ''}
      <div class="team-grid">${groups[b].filter(s => s.dept === dp).map(card).join('')}</div>`).join('')}`).join('');
  } else if (SORT === 'level') {
    // Grouped like Branch: one heading per position, branch on each card.
    const groups = {};
    shown.forEach(s => (groups[posOf(s)] ||= []).push(s));
    body = Object.keys(groups).sort((a, b) => flip * (rankOf(groups[b][0]) - rankOf(groups[a][0]))).map(g => `
      <div class="branch-h">${esc(g)}</div>
      <div class="team-grid">${groups[g].sort((a, b) => a.name.localeCompare(b.name)).map(card).join('')}</div>`).join('');
  } else {
    const cmp = SORTS[SORT].cmp;
    body = `<div class="team-grid flat">${[...shown].sort((a, b) => flip * cmp(a, b) || a.name.localeCompare(b.name)).map(card).join('')}</div>`;
  }
  app.innerHTML = `
    <section class="card hero">
      <div class="eyebrow">Your team · ${esc(monthLabel(d.month))}</div>
      <p class="sub">Every number fills itself: sales from Phorest, client numbers counted once each from the ledgers. Tap a person to see their page${ROLE === 'viewer' ? '' : ' and leave a note'}.</p>
    </section>
    ${EMBED ? '' : `<div class="dept-seg" role="group" aria-label="Team">${['all', 'Hair', 'Beauty'].map(x =>
      `<button type="button" data-dept="${x}" class="${DEPT === x ? 'on' : ''}">${x === 'all' ? 'All' : x}</button>`).join('')}</div>`}
    ${EMBED ? '' : `<div class="sort-bar">
      <label>Sort by <select id="sortSel">${Object.entries(SORTS).map(([k, o]) =>
        `<option value="${k}"${k === SORT ? ' selected' : ''}>${o.label}</option>`).join('')}</select></label>
      <button type="button" class="sort-dir" id="sortDir" title="Reverse the order">${['branch', 'name'].includes(SORT) ? (SORT_REV ? 'Z–A' : 'A–Z') : (SORT_REV ? 'Lowest first' : 'Highest first')} ⇅</button>
    </div>`}
    ${body}`;
  app.querySelectorAll('.dept-seg [data-dept]').forEach(b => b.onclick = () => { DEPT = b.dataset.dept; renderTeam(); });
  const saveSort = () => { try { localStorage.setItem('perf-sort', JSON.stringify({ k: SORT, rev: SORT_REV })); } catch (e) {} renderTeam(); };
  if (!EMBED) {
    document.getElementById('sortSel').onchange = e => { SORT = e.target.value; SORT_REV = false; saveSort(); };
    document.getElementById('sortDir').onclick = () => { SORT_REV = !SORT_REV; saveSort(); };
  }
}

// Team Home links (Kate, 2 Oct 2026). A stylist opening her email link isn't signed in,
// and Team Home turns staff away until kb_settings.staff_open is on, so the logo and
// the house button only work for someone signed in on this browser, or for everyone
// once staff_open is on. Nothing to redeploy when Team Home opens.
(async () => {
  let ok = false;
  try { ok = !!localStorage.getItem('sb-gvijxenafoowajqktqvd-auth-token'); } catch (e) {}
  if (!ok) { try { ok = await rpc('kb_staff_open', {}) === true; } catch (e) {} }
  if (ok) document.body.classList.add('hub-ok');
})();

(async () => {
  try {
    // Her name link (Kate, 1 Oct 2026): trk-salon-os.com/me/<slug> lands here as
    // ?s=<slug> (404.html), and the slug is swapped for her token, after which the
    // page is the same one the payslip email's ?t= link opens.
    if (!TOKEN && qs.get('s')) {
      TOKEN = await rpc('perf_slug_token', { p_slug: qs.get('s') });
      if (!TOKEN) { app.innerHTML = `<p class="err">This link isn't active. Ask your salon manager for a new one.</p>`; return; }
    }
    // My year + How you move up (year-levels.js): her own link only, not a leader's
    // view and not the dashboard frame. Kate, 2 Oct 2026: started before This month
    // rather than after it, so a &tab=levels or &tab=year link doesn't wait for the
    // month page and its chart to draw first.
    // Kate, 3 Oct 2026: year-levels.js loads after this file, so on a ?t= link (no
    // await above) PerfTabs wasn't there yet; the month drew and was then replaced by
    // "Open this page from the link...". Wait for the page's scripts first, and only
    // show that message when there is no token and no admin key at all.
    if (!window.PerfTabs && document.readyState === 'loading')
      await new Promise(res => document.addEventListener('DOMContentLoaded', res, { once: true }));
    const tabs = TOKEN && !ADMIN && !EMBED && window.PerfTabs;
    if (tabs) PerfTabs.mount(TOKEN);
    if (TOKEN || (SID && ADMIN)) await renderStylist();
    else if (ADMIN) await renderTeam();
    else app.innerHTML = `<p class="err">Open this page from the link in your performance email.</p>`;
    requestAnimationFrame(postHeight);
    setTimeout(postHeight, 300);   // rAF and ResizeObserver pause in a hidden tab; timers still run
  } catch (e) {
    console.error(e);
    app.innerHTML = `<p class="err">Couldn't load the numbers just now. Try again in a minute.</p>`;
  }
})();
