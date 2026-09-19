// ── TEAM ROSTER TAB ──────────────────────────────────────────
// Kate, 19 Sep 2026: "an on and off switch for each staff... to put in if
// resigned na ba or employed pa rin". One row per STAFF_PROFILES entry
// (staff-profiles.js, loaded above this file), grouped by branch, each with a
// toggle that writes to the staff_status table instead of a hand-edited
// `resigned:true` in that file. dashboard.js's Staff Cards view reads the same
// table and merges it over staff-profiles.js's own `resigned` field, so a name
// with no row there just keeps using whatever the JS file says.
const ROSTER_BRANCH_ORDER = ['KCA', 'SAA', 'MC', 'AQ', 'other'];
const ROSTER_BRANCH_LABEL = {
  KCA: 'Khalifa City A', SAA: 'Mamsha Al Saadiyat', MC: 'Motor City', AQ: 'Al Quoz',
  other: 'Other / Former Team',
};

let ROSTER_STATUS = null; // Map<STAFF_PROFILES key, resigned boolean>, once loaded

function rosterSlug(name) {
  return String(name).replace(/[^A-Za-z0-9]+/g, '_');
}

// STAFF_PROFILES keys are upper case (the canonical form canonicalStaffName()
// produces) — Title Case here is display only, same treatment the surnames
// already get in staff-profiles.js.
function rosterTitleCase(name) {
  return String(name).toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

async function loadRosterStatus() {
  const { data, error } = await sb.from('staff_status').select('staff_name,resigned');
  if (error) {
    console.error('staff_status load failed', error);
    ROSTER_STATUS = new Map();
    return ROSTER_STATUS;
  }
  ROSTER_STATUS = new Map((data || []).map(r => [r.staff_name, r.resigned]));
  return ROSTER_STATUS;
}

// The Supabase override wins when one exists; otherwise fall back to whatever
// staff-profiles.js already says (its own hand-set `resigned:true` entries).
function rosterIsResigned(key, profile) {
  if (ROSTER_STATUS && ROSTER_STATUS.has(key)) return !!ROSTER_STATUS.get(key);
  return !!profile.resigned;
}

async function initRosterTab() {
  await renderTeamRoster();
}

async function renderTeamRoster() {
  const host = document.getElementById('rosterList');
  if (!host) return;
  if (typeof STAFF_PROFILES === 'undefined') {
    host.innerHTML = '<div class="empty-col">Staff profiles didn’t load.</div>';
    return;
  }
  host.innerHTML = '<div class="empty-col">Loading…</div>';
  await loadRosterStatus();

  // Same dedupe as dashboard.js's stylistBranchGroups(): an alias key pointing
  // at the same photo/handle as another entry must not produce two rows.
  const seen = new Set();
  const byBranch = new Map();
  Object.entries(STAFF_PROFILES).forEach(([key, p]) => {
    const dedupeKey = p.photo || p.photoFull || p.ig || key;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    const b = p.branch || 'other';
    if (!byBranch.has(b)) byBranch.set(b, []);
    byBranch.get(b).push({ key, ...p });
  });

  host.innerHTML = ROSTER_BRANCH_ORDER.filter(b => byBranch.has(b)).map(b => {
    const list = byBranch.get(b).sort((x, y) => x.key.localeCompare(y.key));
    const rows = list.map(s => {
      const resigned = rosterIsResigned(s.key, s);
      const slug = rosterSlug(s.key);
      const displayName = rosterTitleCase(s.key) + (s.last ? ' ' + s.last : '');
      return `
        <div class="roster-row">
          <div>
            <div class="roster-row-name">${displayName}</div>
            <div class="roster-row-role">${s.role || ''}</div>
          </div>
          <div class="mini-toggle-wrap roster-toggle" onclick="rosterToggleStatus('${s.key.replace(/'/g, "\\'")}')" role="button">
            <span class="mini-toggle-lbl" id="rosterLbl-${slug}">${resigned ? 'Resigned' : 'Employed'}</span>
            <div class="mini-toggle-track${resigned ? '' : ' on'}" id="rosterTrack-${slug}"><div class="mini-toggle-thumb"></div></div>
          </div>
        </div>`;
    }).join('');
    return `
      <div class="roster-branch">
        <div class="roster-branch-hd">${ROSTER_BRANCH_LABEL[b] || b}</div>
        ${rows}
      </div>`;
  }).join('');
}

async function rosterToggleStatus(key) {
  const slug = rosterSlug(key);
  const track = document.getElementById('rosterTrack-' + slug);
  const lbl = document.getElementById('rosterLbl-' + slug);
  if (!track) return;

  const wasResigned = !track.classList.contains('on');
  const nextResigned = !wasResigned;

  // Optimistic flip — reverted below if the write fails.
  track.classList.toggle('on', !nextResigned);
  if (lbl) lbl.textContent = nextResigned ? 'Resigned' : 'Employed';
  if (!ROSTER_STATUS) ROSTER_STATUS = new Map();
  ROSTER_STATUS.set(key, nextResigned);

  const { error } = await sb.from('staff_status')
    .upsert({ staff_name: key, resigned: nextResigned, updated_at: new Date().toISOString() });

  if (error) {
    console.error('staff_status save failed', error);
    track.classList.toggle('on', !wasResigned);
    if (lbl) lbl.textContent = wasResigned ? 'Resigned' : 'Employed';
    ROSTER_STATUS.set(key, wasResigned);
    alert('Could not save that change — check your connection and try again.');
  }
}
