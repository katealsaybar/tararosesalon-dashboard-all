// ── NEWER-DATA WATCH (Upload Portal) ─────────────────────────
// Kate, 4 Sep 2026, after the same change went into the dashboard: "gawin din
// natin sa upload portal."
//
// The portal never redrew itself on a timer, and it must not start: the three
// Backfill Progress cards each page the whole of their table — tens of thousands
// of rows — to work out which days are missing, which is why each one has its
// own ↻ Refresh rather than a heartbeat. What the portal was missing is the
// other half of the dashboard change: nothing ever told you WHEN to press it.
// Two coordinators uploading in parallel, a backfill session running against the
// same table, or the Sheet pushing a night's ledgers, and your amber blocks and
// missing-date lists are answers to a question that has since moved on.
//
// So: one cheap poll — a count and a newest stamp per table, three requests,
// nothing drawn — and when a table has moved past what a card was drawn from,
// the notice top right names the card, says what moved, and reloads just that
// card. Every other pixel on the page stays where the person working left it,
// mid-paste included.
//
// Each card stamps its OWN baseline when it redraws, which is what keeps your
// own upload from announcing itself back to you: the refreshers already run at
// the end of every push, so by the time the next poll comes round the baseline
// has moved with the card.

const UPD_MS = 60000;

// One entry per Backfill Progress card. `stamp` is the column that moves when
// new days land; the count catches a re-upload of days already covered, which
// leaves the newest date exactly where it was. `filter` matches what the card
// itself counts, so the two are talking about the same rows — Staff Daily reads
// the is_total rows only.
const UPD_FEEDS = [
  {
    key: 'staffperf',
    table: 'phorest_staff_daily',
    stamp: 'date',
    filter: q => q.eq('is_total', true),
    label: 'Staff Daily · Phorest',
    affects: 'the backfill card, its missing-date list and the tab pip',
    refresher: 'refreshStaffPerfProgress',
  },
  {
    key: 'sheetsync',
    table: 'branch_staff_daily',
    stamp: 'date',
    label: 'Ledgers · Sheets',
    affects: 'the coverage card, the last-synced boxes and the tab pip',
    refresher: 'refreshSheetSyncProgress',
  },
  {
    key: 'ops',
    table: 'staff_utilisation',
    stamp: 'date_to',
    label: 'Utilisation · Phorest',
    affects: 'the coverage card and the tab pip',
    refresher: 'refreshUtilProgress',
  },
];

// Per feed: the signature its card was last drawn from. A feed with no entry has
// no card on screen yet — the tab has never been opened — so there is nothing to
// be stale and nothing to say about it.
const updBase = {};
const updShown = {};   // the signature already put in front of the viewer
let updTimer = null;

function updFeed(key) { return UPD_FEEDS.find(f => f.key === key); }

// Count and newest stamp in one request: PostgREST puts the exact count in
// Content-Range even when the range asked for is a single row.
async function updReadFeed(f) {
  let q = sb.from(f.table).select(f.stamp, { count: 'exact' });
  if (f.filter) q = f.filter(q);
  const { data, count, error } = await q.order(f.stamp, { ascending: false }).limit(1);
  if (error) return null;
  return { count: count || 0, stamp: (data && data[0] && data[0][f.stamp]) || null };
}

function updSigKey(sig) { return sig ? `${sig.count}|${sig.stamp}` : ''; }

// "2026-09-04" and "2026-09-04T11:20:14Z" both read as "4 Sep".
const UPD_MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function updStampLabel(stamp) {
  if (!stamp) return null;
  const d = new Date(String(stamp).slice(0, 10) + 'T00:00:00');
  if (isNaN(d)) return null;
  return `${d.getDate()} ${UPD_MON[d.getMonth()]}`;
}

// Called by each card's refresher once it has finished drawing. This is the only
// place a baseline is set: the card and the line it is measured against move
// together, or the notice ends up arguing with what is on screen.
async function updStamp(key) {
  const f = updFeed(key);
  if (!f) return;
  const sig = await updReadFeed(f);
  if (sig) updBase[key] = sig;
  updShown[key] = null;
  updRender();
}

// What actually moved, in words, so the notice says why the card is worth
// reloading rather than only that something happened.
function updChangeText(from, to) {
  const bits = [];
  if (to.stamp !== from.stamp) {
    const now = updStampLabel(to.stamp), was = updStampLabel(from.stamp);
    if (now && was)  bits.push(`now through <b>${now}</b>, was ${was}`);
    else if (now)    bits.push(`first rows in, <b>${now}</b>`);
  }
  const d = to.count - from.count;
  if (d > 0)      bits.push(`<b>${d.toLocaleString()}</b> new ${d === 1 ? 'row' : 'rows'}`);
  else if (d < 0) bits.push(`<b>${(-d).toLocaleString()}</b> ${-d === 1 ? 'row' : 'rows'} removed`);
  return bits.join(' · ');
}

// Every feed whose table has moved past the card drawn from it.
let updLatest = {};
function updStale() {
  return UPD_FEEDS
    .filter(f => updBase[f.key] && updLatest[f.key]
      && updSigKey(updLatest[f.key]) !== updSigKey(updBase[f.key]))
    .map(f => ({ feed: f, text: updChangeText(updBase[f.key], updLatest[f.key]) }))
    .filter(r => r.text);
}

function updRender() {
  const box  = document.getElementById('updNotice');
  const full = document.getElementById('updFull');
  if (!box || !full) return;
  const stale = updStale();
  if (!stale.length) { box.hidden = true; box.classList.remove('mini'); return; }
  // Only reopen the card for a change the viewer has not already been shown —
  // otherwise pressing Later would be undone by the next poll a minute later.
  const fresh = stale.some(r => updShown[r.feed.key] !== updSigKey(updLatest[r.feed.key]));
  stale.forEach(r => { updShown[r.feed.key] = updSigKey(updLatest[r.feed.key]); });

  full.innerHTML = `
    <div class="upd-eye">${stale.length === 1 ? 'A card is out of date' : `${stale.length} cards are out of date`}</div>
    <p class="upd-lead">Someone else has uploaded, or the Sheet has pushed, since
      ${stale.length === 1 ? 'this card was' : 'these cards were'} drawn. Nothing on
      the page has moved — reload only what you need.</p>
    <ul class="upd-list">
      ${stale.map(r => `<li>
        <b>${r.feed.label}</b> — ${r.text}
        <span class="upd-aff">affects ${r.feed.affects}</span>
        <button class="upd-btn small" onclick="updReload('${r.feed.key}', this)">Reload card</button>
      </li>`).join('')}
    </ul>
    <p class="upd-foot">The cards page their whole table to find the gaps, which is
      why they are not on a timer. Reloading redraws that card and its tab pip only.</p>
    <div class="upd-acts">
      ${stale.length > 1 ? '<button class="upd-btn" onclick="updReloadAll(this)">Reload all</button>' : ''}
      <button class="upd-btn ghost" onclick="updDismiss()">Later</button>
    </div>`;
  if (fresh) box.classList.remove('mini');
  box.hidden = false;
}

// One card, redrawn. The refresher stamps its own baseline on the way out, which
// drops this line from the notice; when the last line goes, so does the notice.
async function updReload(key, btn) {
  const f = updFeed(key);
  if (!f) return;
  const fn = window[f.refresher];
  if (typeof fn !== 'function') return;
  if (btn) { btn.disabled = true; btn.textContent = 'Reloading…'; }
  await fn();
}

async function updReloadAll(btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Reloading…'; }
  for (const r of updStale()) await updReload(r.feed.key);
}

// Waved off, not resolved: the card folds to a pill rather than vanishing, so the
// page never quietly pretends the gaps on it are current.
function updDismiss() {
  const box = document.getElementById('updNotice');
  if (box) box.classList.add('mini');
}

function updExpand() {
  const box = document.getElementById('updNotice');
  if (box) box.classList.remove('mini');
}

async function updTick() {
  const reads = await Promise.all(UPD_FEEDS.map(f => updBase[f.key] ? updReadFeed(f) : null));
  UPD_FEEDS.forEach((f, i) => { if (reads[i]) updLatest[f.key] = reads[i]; });
  updRender();
}

function startUploadWatch() {
  if (updTimer) clearInterval(updTimer);
  updTimer = setInterval(updTick, UPD_MS);
  // A portal left open over lunch should not sit for another minute before being
  // told: check the moment the tab is looked at again.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) updTick(); });
}

function stopUploadWatch() {
  if (updTimer) clearInterval(updTimer);
  updTimer = null;
  UPD_FEEDS.forEach(f => { delete updBase[f.key]; delete updShown[f.key]; });
  updLatest = {};
  const box = document.getElementById('updNotice');
  if (box) { box.hidden = true; box.classList.remove('mini'); }
}
