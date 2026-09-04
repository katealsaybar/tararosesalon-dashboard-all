// ── MONTHLY TARGETS (Upload Portal) ──────────────────────────
// Kate, 4 Sep 2026: "gawa tayo ng standard parser or fill out form para sa
// targets dito sa upload."
//
// THE PROBLEM THIS REPLACES. Every month four coordinators send their branch's
// target table into the Mette & Coordinators group as a screenshot, in four
// different layouts, and someone retypes ~40 stylists into ledger-targets.js by
// hand. Nothing checks the retyping, nothing checks the coordinator's own
// arithmetic, and the file goes stale silently — the whole reason the dashboard
// printed a phantom 42k Khalifa shortfall in the 3 Sep leadership call was a
// target read against the wrong row.
//
// So: paste the coordinator's table, get it back as an editable grid with the
// 80/12/20 chain recomputed, every disagreement with what she typed flagged
// rather than silently overwritten, and one Save. Rows land in staff_targets and
// the branch's summed totals in branch_targets — see
// migrations/create_staff_targets.sql for why those are two tables.
//
// WHAT THE PARSER HAS TO SURVIVE. Both September samples in one paste each:
//
//   Frans, Al Quoz            Christine, Saadiyat
//   "Sample:" junk row        "SAADIYAT BRANCH- SEPTEMBER, 2026" title row
//   4 columns of numbers      same 4, formatted "50,000.00"
//   no title row              a leading Sheets row-number column
//   footer: service, retail,  footer: service + retail, no under-line
//   and an "under of" line
//
// Neither of them is the shape the other is, and neither is the shape next
// month's will be, so nothing is read positionally where a header word can be
// found instead. Rows survive: a blank designation, a 0.00 target (Holly is
// really zero, she was off the floor — dropping her would make the branch look
// one stylist smaller), a name with a trailing role in it, and thousands
// separators.
//
// WHAT IT DELIBERATELY DOES NOT DO. It never trusts the coordinator's derived
// columns over its own arithmetic, and it never quietly replaces them either.
// Frans's own footer does not reconcile: she wrote "Salon is under of 8280"
// where 24,840 − 19,872 = 4,968 (8,280 is the gap against a 10% retail rate, so
// her yellow box looks like it is measuring an older version of her table).
// The grid shows both numbers and leaves the call to a person.
//
// THE TABLE IS THE TOTAL. Kate, 4 Sep 2026: "i base mo na lang sa table yung
// true target totals per stylist/beautician, wag na doon sa yellow box." So the
// branch's true monthly target is the sum of the stylist rows, full stop. The
// yellow box is saved beside it as stated_* and shown as a difference, because
// a 127,000 gap at Saadiyat is worth knowing about, but it never becomes a
// total and it never blocks a save.

const TG_TABLE        = 'staff_targets';
const TG_BRANCH_TABLE = 'branch_targets';

// Fratelli is historical-only (closed 22 May 2026) and is never given a target,
// so it is not offered here at all — unlike the daily feeds, which still have to
// render its past coverage.
const TG_BRANCHES = [
  { code: 'SAA', label: 'Saadiyat' },
  { code: 'KCA', label: 'Khalifa City A' },
  { code: 'MC',  label: 'Motor City' },
  { code: 'AQ',  label: 'Al Quoz' },
];
const TG_BRANCH_CODES = TG_BRANCHES.map(b => b.code);

// The first month a target sheet exists for. Kept as its own constant rather
// than borrowed from SP_BACKFILL_START: the daily feeds backfill to Jan 2025,
// but nobody is going to retype 2025's target sheets.
const TG_START_MONTH = '2026-01';

const TG_MONTHS = ['January','February','March','April','May','June',
                   'July','August','September','October','November','December'];

// Default derivation rates. Every table seen so far uses these, but they are
// typed into each branch's sheet by hand, so the grid exposes them and they are
// saved per branch per month.
const TG_DEFAULT_PCT = { actual: 80, retail: 12, treatment: 20 };

// ── DEPARTMENT ────────────────────────────────────────────────
// dept is part of the staff_targets key because nicknames repeat across benches
// (MJ and SHINE are each on both the hair and beauty rows at Al Quoz in
// ledger-targets.js). The coordinators do not write a dept column — they write a
// designation — so it is derived from that and then left editable, because the
// derivation is a guess about a job title and the person pasting knows better.
const TG_BEAUTY_WORDS = ['beaut', 'nail', 'technician', 'therapist', 'lash', 'brow',
                         'wax', 'massage', 'spa', 'aesthetic'];

function tgDeptFromDesignation(designation){
  const d = String(designation || '').toLowerCase();
  if (!d) return 'HAIR';
  // "Nail Technician" and "Technician" both land on beauty; "Style Director",
  // "Senior Stylist", "Blowdry Specialist", "Junior Stylist" all stay on hair.
  return TG_BEAUTY_WORDS.some(w => d.includes(w)) ? 'BEAUTY' : 'HAIR';
}

// ── NUMBER + TEXT HELPERS ─────────────────────────────────────

// "50,000.00" → 50000, "AED 1 234" → 1234, "-" → null, "" → null.
// null means "the cell was empty", which is not the same as a real 0.00 — Holly
// is a genuine zero and has to be kept, an empty cell has to be computed.
function tgNum(raw){
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim();
  if (!s || s === '-' || s === '–' || s === '—') return null;
  const neg = /^\(.*\)$/.test(s);          // (1,234) accounting negatives
  s = s.replace(/[()]/g, '')
       .replace(/aed|dhs?| /gi, '')
       .replace(/[,\s]/g, '')
       .replace(/%$/, '');
  if (!/^-?\d*\.?\d+$/.test(s)) return null;
  const n = parseFloat(s);
  if (!isFinite(n)) return null;
  return neg ? -n : n;
}

function tgFmt(n, dp = 0){
  if (n === null || n === undefined || !isFinite(n)) return '';
  return TR_NUM_FMT[dp] ? TR_NUM_FMT[dp].format(n) : String(n);
}

function tgNorm(s){ return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }

// Two money figures are "the same number" if they agree to the fils. The sheets
// carry two decimal places and the derivations are exact, so anything looser
// would hide a real disagreement.
function tgSame(a, b){
  if (a === null || b === null) return true;   // nothing to disagree about
  return Math.abs(a - b) < 0.005;
}

function tgMonthIso(ym){ return `${ym}-01`; }

function tgMonthLabel(ym){
  const [y, m] = String(ym).split('-');
  return `${TG_MONTHS[Number(m) - 1] || m} ${y}`;
}

function tgCurrentMonth(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Every month from TG_START_MONTH to the one after this, newest first. Next
// month is offered because a target sheet lands before the month it is for.
function tgMonthOptions(){
  const [sy, sm] = TG_START_MONTH.split('-').map(Number);
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const out = [];
  for (let d = new Date(sy, sm - 1, 1); d <= end; d.setMonth(d.getMonth() + 1)){
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out.reverse();
}

// ── PARSER ───────────────────────────────────────────────────
// A paste from Sheets or Excel is tab-separated; a paste out of a rendered table
// or a CSV export is comma-separated. Both arrive, so the delimiter is sniffed
// per paste rather than assumed.

function tgSplitRows(text){
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  // Tabs win whenever any line has one: a Sheets paste of "50,000.00" is full of
  // commas that are not delimiters, so sniffing on comma-count first would cut
  // every money cell in half.
  const useTab = lines.some(l => l.includes('\t'));
  return lines.map(l => (useTab ? l.split('\t') : tgSplitCsv(l)).map(c => String(c).trim()));
}

// Comma split that respects quotes, so "Smith, Jane" survives.
function tgSplitCsv(line){
  const out = [];
  let cur = '', q = false;
  for (const ch of String(line)){
    if (ch === '"'){ q = !q; continue; }
    if (ch === ',' && !q){ out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

// Header words, in the order they are tried. `target` is matched last and
// excludes "should be", which is the footer's phrase, not a column's.
const TG_COL_MATCH = [
  { key: 'name',        words: ['stylist', 'staff', 'employee', 'name', 'team'] },
  { key: 'designation', words: ['designation', 'position', 'role', 'title', 'level'] },
  { key: 'actual',      words: ['actual'] },
  { key: 'retail',      words: ['retail'] },
  { key: 'treatment',   words: ['treatment'] },
  { key: 'target',      words: ['target given', 'salon target', 'target'] },
];

function tgReadHeader(cells){
  const map = {};
  cells.forEach((cell, i) => {
    const c = tgNorm(cell);
    if (!c || c.includes('should be')) return;
    for (const { key, words } of TG_COL_MATCH){
      if (map[key] !== undefined) continue;
      if (words.some(w => c.includes(w))){ map[key] = i; return; }
    }
  });
  if (map.target === undefined) return null;

  // Frans's table heads the money columns and leaves the name and designation
  // columns blank - her header row reads "Sample: | | Target given by salon | ...".
  // So a row that heads the target column AND at least one of the derived columns
  // is a header even with no name heading, and the name is then the first column,
  // designation the next if there is room. Read positionally only for the columns
  // she did not label.
  if (map.name === undefined){
    const derived = ['actual', 'retail', 'treatment'].filter(k => map[k] !== undefined).length;
    if (!derived || map.target < 1) return null;
    map.name = 0;
    if (map.designation === undefined && map.target > 1) map.designation = 1;
  }
  // "SAADIYAT BRANCH- SEPTEMBER, 2026" is a title, not a header: it names no
  // target column, so it never reaches here.
  return map;
}

// The yellow footer box. Both samples write it as free text in one cell rather
// than as columns, so it is read by phrase and the number is whatever number is
// on that line.
function tgReadFooterLine(line){
  const l = tgNorm(line);
  const n = tgNum((String(line).match(/-?[\d,]+(?:\.\d+)?\s*$/) || [])[0]
                  || (String(line).match(/-?[\d][\d,]*(?:\.\d+)?/) || [])[0]);
  if (n === null) return null;

  // Matched on the whole PHRASE, not on the word "target" or the word "under".
  // A loose test here would eat a stylist row: a designation is allowed to
  // contain almost anything, and a two-column paste ("RUTH  75000") has exactly
  // one number on the line, same as a footer does.
  const stated = l.includes('should be') || /target\s*[:=]/.test(l);
  if (stated && l.includes('service')) return { key: 'stated_service', value: n };
  if (stated && l.includes('retail'))  return { key: 'stated_retail',  value: n };
  if (/\b(is|are)\s+(under|over)\b/.test(l) || /\b(under|over)\s+(of|by)\b/.test(l)){
    return { key: 'note', value: n, text: String(line).replace(/\s+/g, ' ').trim() };
  }
  return null;
}

// "SAADIYAT BRANCH- SEPTEMBER, 2026" → { branch:'SAA', month:'2026-09' }.
// Only used to pre-set the two selectors, never to override what is chosen: a
// mis-read title silently filing Saadiyat's targets against Al Quoz is exactly
// the class of mistake this tab exists to stop.
function tgReadTitle(line){
  const l = tgNorm(line);
  const out = {};
  for (const [code, kws] of Object.entries(BRANCH_DETECT)){
    if (!TG_BRANCH_CODES.includes(code)) continue;
    if (kws.some(k => k.length > 2 && l.includes(k))){ out.branch = code; break; }
  }
  const mi = TG_MONTHS.findIndex(m => l.includes(m.toLowerCase()));
  const yr = (l.match(/\b(20\d{2})\b/) || [])[1];
  if (mi >= 0 && yr) out.month = `${yr}-${String(mi + 1).padStart(2, '0')}`;
  return (out.branch || out.month) ? out : null;
}

// Rows the parser must not read as a stylist. The totals row is the one that
// matters: it has no name and four money cells, and read as a stylist it would
// save a nameless person on the whole branch's target.
function tgIsTotalsRow(cells, cols){
  const name = tgNorm(cells[cols.name] || '');
  if (name && !/^(total|totals|grand total|sum)\b/.test(name)) return false;
  return cells.some(c => tgNum(c) !== null);
}

// One paste → { rows, footer, title, totals, warnings }.
function tgParsePaste(text){
  const grid = tgSplitRows(text).filter(r => r.some(c => c !== ''));
  const out = { rows: [], footer: {}, title: null, totals: null, notes: [], warnings: [] };
  if (!grid.length){ out.warnings.push('Nothing in the box.'); return out; }

  // Pass 1: find the header row, and read anything above it as a title.
  let cols = null, headerAt = -1;
  for (let i = 0; i < grid.length; i++){
    const m = tgReadHeader(grid[i]);
    if (m){ cols = m; headerAt = i; break; }
  }
  for (let i = 0; i < (headerAt < 0 ? Math.min(3, grid.length) : headerAt); i++){
    const t = tgReadTitle(grid[i].join(' '));
    if (t){ out.title = Object.assign(out.title || {}, t); }
  }

  // No header at all: fall back to positions. Column 0 is the name unless it is
  // a Sheets row-number gutter, then the first numeric column is the target and
  // the next three, if present, are actual / retail / treatment in sheet order.
  if (!cols){
    const body = grid.filter(r => r.some(c => tgNum(c) !== null) && r.some(c => c && tgNum(c) === null));
    if (!body.length){
      out.warnings.push('No header row and no rows that look like "name … number". Check the paste covers the table itself, header included.');
      return out;
    }
    const sample = body[0];
    let nameAt = sample.findIndex(c => c && tgNum(c) === null);
    let firstNum = sample.findIndex((c, i) => i > nameAt && tgNum(c) !== null);
    cols = { name: nameAt, target: firstNum };
    if (firstNum + 1 < sample.length) cols.actual    = firstNum + 1;
    if (firstNum + 2 < sample.length) cols.retail    = firstNum + 2;
    if (firstNum + 3 < sample.length) cols.treatment = firstNum + 3;
    // The column after the name is a designation only if it is text.
    if (nameAt + 1 < firstNum && sample[nameAt + 1] && tgNum(sample[nameAt + 1]) === null){
      cols.designation = nameAt + 1;
    }
    headerAt = -1;
    out.warnings.push('No header row found — columns were read by position. Check every row in the grid before saving.');
  }

  // Pass 2: the body.
  for (let i = headerAt + 1; i < grid.length; i++){
    const cells = grid[i];
    const joined = cells.join(' ');

    const foot = tgReadFooterLine(joined);
    if (foot){
      if (foot.key === 'note') out.notes.push(foot.text);
      else out.footer[foot.key] = foot.value;
      continue;
    }

    if (tgIsTotalsRow(cells, cols)){
      // Kept for the cross-check, not saved. It is the coordinator's own sum,
      // and disagreeing with it means a row was missed by one side or the other.
      if (!out.totals){
        out.totals = {
          target:    tgNum(cells[cols.target]),
          actual:    cols.actual    !== undefined ? tgNum(cells[cols.actual])    : null,
          retail:    cols.retail    !== undefined ? tgNum(cells[cols.retail])    : null,
          treatment: cols.treatment !== undefined ? tgNum(cells[cols.treatment]) : null,
        };
      }
      continue;
    }

    const rawName = String(cells[cols.name] || '').trim();
    if (!rawName) continue;
    // A row number gutter ("4") is not a name, and neither is a stray note.
    if (tgNum(rawName) !== null) continue;
    if (/^(sample|note|notes)\b/i.test(rawName)) continue;

    const target = tgNum(cells[cols.target]);
    if (target === null){
      // A name with no target is either a section heading the coordinator typed
      // into the name column, or a stylist she has not filled in yet. Flagged
      // rather than dropped, because it is exactly what a coordinator forgets.
      out.warnings.push(`"${rawName}" has no target figure — row skipped. Add it by hand if she meant to give one.`);
      continue;
    }

    const designation = cols.designation !== undefined ? String(cells[cols.designation] || '').trim() : '';
    out.rows.push({
      name: canonicalStaffName(rawName.replace(/\s+/g, ' ')).toUpperCase(),
      rawName,
      designation,
      dept: tgDeptFromDesignation(designation),
      target,
      // The coordinator's own derived figures, kept beside ours so the grid can
      // show a disagreement rather than pick a winner.
      pasted: {
        actual:    cols.actual    !== undefined ? tgNum(cells[cols.actual])    : null,
        retail:    cols.retail    !== undefined ? tgNum(cells[cols.retail])    : null,
        treatment: cols.treatment !== undefined ? tgNum(cells[cols.treatment]) : null,
      },
    });
  }

  if (!out.rows.length) out.warnings.push('Header found, but no stylist rows under it.');
  return out;
}

// ── STATE ─────────────────────────────────────────────────────
// One grid at a time: a branch and a month. Rows carry both the figure we
// computed and the figure she pasted, and `edited` marks a cell a person has
// typed into so recomputing the chain does not throw their correction away.

let tgRows   = [];
// `tgSalon` is what the coordinator wrote in her yellow box, and nothing else.
// The branch total is tgSum('target') — see the header note.
let tgSalon  = { stated_service: null, stated_retail: null, notes: '' };

// The five client-count targets. NOT from the coordinator's table, which is money
// only: these come off the MTD pacing panel of Emma's Monday Target Sheet and are
// typed in. They are here because the dashboard's Ledgers pages ask for eleven
// branch metrics and the paste can only produce six of them; without these five
// the flip off ledger-targets.js leaves half the target columns blank (Kate,
// 4 Sep 2026). null means nobody has keyed it, which must never render as a
// target of zero clients.
const TG_CLIENT_FIELDS = [
  { key: 'total_clients',   label: 'Total clients' },
  { key: 'new_clients',     label: 'New clients' },
  { key: 'ncr',             label: 'NCR' },
  { key: 'rebooked',        label: 'Rebooked' },
  { key: 'beauty_rebooked', label: 'Beauty rebooked' },
];
let tgClients = {};
let tgPct    = Object.assign({}, TG_DEFAULT_PCT);
let tgTotals = null;          // the coordinator's own totals row, for the cross-check
let tgWarnings = [];
let tgRoster = {};            // branch -> Set of names seen in the ledger lately
let tgLoadedKey = '';         // "AQ|2026-09" the grid was last loaded/saved for
let tgSeq = 0;                // row ids, so a delete does not renumber the rest

function tgDerive(row){
  const a = row.actualEdited    ? row.actual    : row.target * (tgPct.actual / 100);
  const r = row.retailEdited    ? row.retail    : a * (tgPct.retail / 100);
  const t = row.treatmentEdited ? row.treatment : a * (tgPct.treatment / 100);
  row.actual = a; row.retail = r; row.treatment = t;
  return row;
}

function tgNewRow(patch = {}){
  const row = Object.assign({
    id: ++tgSeq, name: '', rawName: '', designation: '', dept: 'HAIR',
    target: 0, actual: 0, retail: 0, treatment: 0,
    actualEdited: false, retailEdited: false, treatmentEdited: false,
    pasted: { actual: null, retail: null, treatment: null },
  }, patch);
  return tgDerive(row);
}

function tgSum(key){ return tgRows.reduce((n, r) => n + (Number(r[key]) || 0), 0); }

// ── ROW-LEVEL CHECKS ─────────────────────────────────────────
// Everything a person needs to look at before saving, per row, in the order a
// person would care: a name we cannot place, then a duplicate, then a
// disagreement with what the coordinator typed.

function tgRowIssues(row){
  const out = [];
  if (!row.name) out.push({ kind: 'bad', text: 'no name' });

  const dupes = tgRows.filter(r => r.name && r.name === row.name && r.dept === row.dept);
  if (dupes.length > 1) out.push({ kind: 'bad', text: `${dupes.length}× on ${row.dept.toLowerCase()}` });

  const known = tgRoster[tgBranchSel()];
  if (row.name && known && known.size && !known.has(row.name)){
    out.push({ kind: 'warn', text: 'not seen in this branch\'s ledger' });
  }

  const p = row.pasted || {};
  const drift = [];
  if (!row.actualEdited    && !tgSame(p.actual,    row.actual))    drift.push(`actual ${tgFmt(p.actual, 2)}`);
  if (!row.retailEdited    && !tgSame(p.retail,    row.retail))    drift.push(`retail ${tgFmt(p.retail, 2)}`);
  if (!row.treatmentEdited && !tgSame(p.treatment, row.treatment)) drift.push(`treatment ${tgFmt(p.treatment, 2)}`);
  if (drift.length) out.push({ kind: 'warn', text: `she typed ${drift.join(', ')}` });

  return out;
}

function tgAnyBlocking(){
  return tgRows.some(r => tgRowIssues(r).some(i => i.kind === 'bad'));
}

// ── UI: the paste + grid segment ──────────────────────────────

function tgBranchSel(){ return document.getElementById('tgBranch')?.value || ''; }
function tgMonthSel(){  return document.getElementById('tgMonth')?.value  || ''; }

function tgRenderSelectors(){
  const b = document.getElementById('tgBranch');
  if (b && !b.options.length){
    b.innerHTML = TG_BRANCHES.map(x => `<option value="${x.code}">${x.label}</option>`).join('');
  }
  const m = document.getElementById('tgMonth');
  if (m && !m.options.length){
    m.innerHTML = tgMonthOptions().map(ym => `<option value="${ym}">${tgMonthLabel(ym)}</option>`).join('');
    m.value = tgCurrentMonth();
  }
  ['tgPctActual', 'tgPctRetail', 'tgPctTreatment'].forEach(id => {
    const el = document.getElementById(id);
    if (el && el.value === '') el.value = tgPct[id.replace('tgPct', '').toLowerCase()];
  });
}

function tgPctChanged(){
  tgPct.actual    = tgNum(document.getElementById('tgPctActual')?.value)    ?? TG_DEFAULT_PCT.actual;
  tgPct.retail    = tgNum(document.getElementById('tgPctRetail')?.value)    ?? TG_DEFAULT_PCT.retail;
  tgPct.treatment = tgNum(document.getElementById('tgPctTreatment')?.value) ?? TG_DEFAULT_PCT.treatment;
  tgRows.forEach(tgDerive);
  tgRenderGrid();
}

function tgParseClicked(){
  const box = document.getElementById('tgPasteBox');
  const raw = box ? box.value : '';
  if (!raw.trim()){ tgMsg('Paste the coordinator\'s table into the box first.', false); return; }

  const p = tgParsePaste(raw);
  tgWarnings = p.warnings.slice();

  // The title only ever pre-selects. If it disagrees with what is already
  // chosen, say so and leave the selectors alone — see tgReadTitle.
  if (p.title){
    if (p.title.branch && p.title.branch !== tgBranchSel()){
      tgWarnings.unshift(`The paste says <b>${BRANCHES[p.title.branch]?.name || p.title.branch}</b> but <b>${BRANCHES[tgBranchSel()]?.name}</b> is selected. Change the selector if the paste is right — nothing was switched for you.`);
    }
    if (p.title.month && p.title.month !== tgMonthSel()){
      tgWarnings.unshift(`The paste says <b>${tgMonthLabel(p.title.month)}</b> but <b>${tgMonthLabel(tgMonthSel())}</b> is selected.`);
    }
  }

  tgRows = p.rows.map(r => tgNewRow({
    name: r.name, rawName: r.rawName, designation: r.designation,
    dept: r.dept, target: r.target, pasted: r.pasted,
  }));
  tgTotals = p.totals;
  tgSalon = {
    stated_service: p.footer.stated_service ?? null,
    stated_retail:  p.footer.stated_retail  ?? null,
    notes: p.notes.join(' · '),
  };
  tgRenderGrid();
  tgMsg(`${tgRows.length} ${tgRows.length === 1 ? 'stylist' : 'stylists'} read. Check the grid, then Save.`, true);
  document.getElementById('tgGridCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function tgMsg(html, ok){
  const el = document.getElementById('tgPasteMsg');
  if (!el) return;
  el.innerHTML = html;
  el.style.color = ok ? 'var(--good)' : 'var(--bad)';
}

function tgAddRow(){
  tgRows.push(tgNewRow());
  tgRenderGrid();
  // Straight into the new name cell — the point of Add row is to type.
  setTimeout(() => document.querySelector('#tgGrid tbody tr:last-child input[data-f="name"]')?.focus(), 0);
}

function tgDeleteRow(id){
  tgRows = tgRows.filter(r => r.id !== Number(id));
  tgRenderGrid();
}

function tgClearGrid(){
  tgRows = []; tgTotals = null; tgWarnings = [];
  tgSalon = { stated_service: null, stated_retail: null, notes: '' };
  tgClients = {};
  const box = document.getElementById('tgPasteBox');
  if (box) box.value = '';
  tgMsg('', true);
  tgRenderGrid();
}

// A cell edit. The three derived columns latch as soon as they are typed into,
// so a coordinator's override survives a later change to the percentages; the
// Reset link on the row unlatches them again.
function tgCellEdit(id, field, value){
  const row = tgRows.find(r => r.id === Number(id));
  if (!row) return;
  if (field === 'name'){
    row.name = canonicalStaffName(String(value).trim()).toUpperCase();
  } else if (field === 'designation'){
    row.designation = String(value).trim();
    // Re-derive the bench only while nobody has picked one by hand.
    if (!row.deptEdited) row.dept = tgDeptFromDesignation(row.designation);
  } else if (field === 'dept'){
    row.dept = value === 'BEAUTY' ? 'BEAUTY' : 'HAIR';
    row.deptEdited = true;
  } else {
    const n = tgNum(value);
    row[field] = n === null ? 0 : n;
    if (field !== 'target') row[`${field}Edited`] = true;
  }
  tgDerive(row);
  tgRenderGrid();
}

function tgResetRow(id){
  const row = tgRows.find(r => r.id === Number(id));
  if (!row) return;
  row.actualEdited = row.retailEdited = row.treatmentEdited = false;
  tgDerive(row);
  tgRenderGrid();
}

function tgSalonEdit(field, value){
  if (field === 'notes') tgSalon.notes = String(value);
  else tgSalon[field] = tgNum(value);
  tgRenderGrid();
}

// A head count, so it is rounded and a blank stays null rather than becoming 0.
function tgClientEdit(field, value){
  const n = tgNum(value);
  tgClients[field] = (n === null) ? null : Math.round(n);
  tgRenderSummary();
}

function tgRenderGrid(){
  const host = document.getElementById('tgGrid');
  if (!host) return;

  if (!tgRows.length){
    host.innerHTML = `<div style="padding:16px;font-size:14px;color:var(--muted2)">
      Nothing loaded. Paste a table above, press <b>Load saved month</b> to edit what is already in, or <b>Add row</b> to start from blank.</div>`;
    tgRenderSummary();
    return;
  }

  const rowsHtml = tgRows.map(r => {
    const issues = tgRowIssues(r);
    const worst  = issues.some(i => i.kind === 'bad') ? 'bad' : issues.length ? 'warn' : '';
    const latched = r.actualEdited || r.retailEdited || r.treatmentEdited;
    return `<tr class="${worst ? 'tg-' + worst : ''}">
      <td class="tg-l"><input data-f="name" value="${tgEsc(r.name)}" onchange="tgCellEdit(${r.id},'name',this.value)" placeholder="NAME"></td>
      <td class="tg-l"><input data-f="designation" value="${tgEsc(r.designation)}" onchange="tgCellEdit(${r.id},'designation',this.value)" placeholder="Designation"></td>
      <td class="tg-l"><select onchange="tgCellEdit(${r.id},'dept',this.value)">
        <option value="HAIR"${r.dept === 'HAIR' ? ' selected' : ''}>Hair</option>
        <option value="BEAUTY"${r.dept === 'BEAUTY' ? ' selected' : ''}>Beauty</option></select></td>
      <td><input class="tg-n" value="${tgFmt(r.target, 2)}" onchange="tgCellEdit(${r.id},'target',this.value)"></td>
      <td><input class="tg-n${r.actualEdited ? ' tg-latched' : ''}" value="${tgFmt(r.actual, 2)}" onchange="tgCellEdit(${r.id},'actual',this.value)"></td>
      <td><input class="tg-n${r.retailEdited ? ' tg-latched' : ''}" value="${tgFmt(r.retail, 2)}" onchange="tgCellEdit(${r.id},'retail',this.value)"></td>
      <td><input class="tg-n${r.treatmentEdited ? ' tg-latched' : ''}" value="${tgFmt(r.treatment, 2)}" onchange="tgCellEdit(${r.id},'treatment',this.value)"></td>
      <td class="tg-l tg-note">${issues.map(i => `<span class="tg-flag ${i.kind}">${i.text}</span>`).join(' ')}</td>
      <td class="tg-l tg-acts">
        ${latched ? `<button class="btn-outline tg-mini" onclick="tgResetRow(${r.id})" title="Recompute this row's three derived cells from its salon target">Recompute</button>` : ''}
        <button class="btn-danger tg-mini" onclick="tgDeleteRow(${r.id})" title="Remove this row">✕</button>
      </td>
    </tr>`;
  }).join('');

  host.innerHTML = `
    <div class="sp-table-wrap tg-wrap">
      <table class="sp-table tg-table">
        <thead><tr>
          <th>Stylist</th><th>Designation</th><th>Bench</th>
          <th>Salon target</th>
          <th>Actual ${tgFmt(tgPct.actual)}%</th>
          <th>Retail ${tgFmt(tgPct.retail)}%</th>
          <th>Treatment ${tgFmt(tgPct.treatment)}%</th>
          <th>Flags</th><th></th>
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
        <tfoot><tr class="is-total">
          <td class="tg-l">${tgRows.length} rows</td><td></td><td></td>
          <td>${tgFmt(tgSum('target'), 2)}</td>
          <td>${tgFmt(tgSum('actual'), 2)}</td>
          <td>${tgFmt(tgSum('retail'), 2)}</td>
          <td>${tgFmt(tgSum('treatment'), 2)}</td>
          <td></td><td></td>
        </tr></tfoot>
      </table>
    </div>`;
  tgRenderSummary();
  if (typeof measureStickyChrome === 'function') measureStickyChrome();
}

function tgEsc(s){
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// THE BRANCH TOTAL, and everything the person has to look at before Save.
// The four headline figures are the table's own sums — that is the branch's
// real target for the month (Kate, 4 Sep 2026). Her yellow box sits underneath
// as a reference line, and where the two disagree the difference is spelled out
// rather than resolved: it is a conversation with the coordinator, not a bug.
function tgRenderSummary(){
  const host = document.getElementById('tgSummary');
  if (!host) return;

  const sums = {
    target:    tgSum('target'),
    actual:    tgSum('actual'),
    retail:    tgSum('retail'),
    treatment: tgSum('treatment'),
  };
  const hair   = tgRows.filter(r => r.dept === 'HAIR').length;
  const beauty = tgRows.length - hair;

  const totalsHtml = `
    <div class="tg-totals">
      <div class="tg-tot"><span>Branch service target</span><b>${tgFmt(sums.target, 2)}</b>
        <i>${tgRows.length} people · ${hair} hair, ${beauty} beauty</i></div>
      <div class="tg-tot"><span>Actual ${tgFmt(tgPct.actual)}%</span><b>${tgFmt(sums.actual, 2)}</b></div>
      <div class="tg-tot"><span>Retail</span><b>${tgFmt(sums.retail, 2)}</b></div>
      <div class="tg-tot"><span>Treatment</span><b>${tgFmt(sums.treatment, 2)}</b></div>
    </div>
    <div class="tg-line ok">This is what gets saved as the branch total — summed from the rows above, not from the yellow box.</div>`;

  const lines = [];

  // Her own totals row against ours. A disagreement here means a row was missed
  // on one side or the other, and it is the cheapest check on the page.
  if (tgTotals && tgTotals.target !== null && !tgSame(tgTotals.target, sums.target)){
    lines.push(`<div class="tg-line warn"><b>Her totals row says ${tgFmt(tgTotals.target, 2)}</b>,
      the rows above sum to ${tgFmt(sums.target, 2)} — a difference of
      ${tgFmt(Math.abs(tgTotals.target - sums.target), 2)}. A row is missing from one side or the other.</div>`);
  } else if (tgTotals && tgTotals.target !== null){
    lines.push(`<div class="tg-line ok">Her own totals row agrees with the rows above: ${tgFmt(sums.target, 2)}.</div>`);
  }

  // The yellow box, purely as a difference. Saadiyat's September is 443,000 of
  // a stated 570,000 — worth seeing, never a total.
  if (tgSalon.stated_service !== null){
    lines.push(tgStatedLine('service', tgSalon.stated_service, sums.target));
  }
  if (tgSalon.stated_retail !== null){
    lines.push(tgStatedLine('retail', tgSalon.stated_retail, sums.retail));
  }
  if (tgSalon.notes){
    lines.push(`<div class="tg-line">She also wrote: <i>${tgEsc(tgSalon.notes)}</i> — kept as a note, not checked against anything.</div>`);
  }

  const warnHtml = tgWarnings.length
    ? `<ul class="tg-warns">${tgWarnings.map(w => `<li>${w}</li>`).join('')}</ul>`
    : '';

  host.innerHTML = `
    ${totalsHtml}
    <div class="tg-stated-hd">Client-count targets — from Emma's Monday sheet, not from the paste</div>
    <div class="tg-salon">
      ${TG_CLIENT_FIELDS.map(f => `<div class="field" style="max-width:150px">
        <label class="field-label">${f.label}</label>
        <input value="${tgClients[f.key] === null || tgClients[f.key] === undefined ? '' : tgClients[f.key]}"
               placeholder="not set" onchange="tgClientEdit('${f.key}',this.value)"></div>`).join('')}
    </div>
    <div class="tg-line${tgClientsMissing().length ? '' : ' ok'}">${tgClientsMissing().length
      ? `The Ledgers pages read these five straight from here. <b>${tgClientsMissing().join(', ')}</b>
         ${tgClientsMissing().length === 1 ? 'is' : 'are'} blank, so ${tgClientsMissing().length === 1 ? 'that row' : 'those rows'}
         will show no target for this month. Blank is fine and is not a zero.`
      : 'All five client-count targets are set, so every Ledgers target column has a figure for this month.'}</div>

    <div class="tg-stated-hd">Her yellow box — reference only, saved beside the totals</div>
    <div class="tg-salon">
      <div class="field"><label class="field-label">She wrote: service</label>
        <input value="${tgSalon.stated_service === null ? '' : tgFmt(tgSalon.stated_service, 2)}"
               placeholder="blank if she wrote none" onchange="tgSalonEdit('stated_service',this.value)"></div>
      <div class="field"><label class="field-label">She wrote: retail</label>
        <input value="${tgSalon.stated_retail === null ? '' : tgFmt(tgSalon.stated_retail, 2)}"
               placeholder="blank if she wrote none" onchange="tgSalonEdit('stated_retail',this.value)"></div>
      <div class="field" style="flex:1;min-width:220px"><label class="field-label">Note</label>
        <input value="${tgEsc(tgSalon.notes)}" placeholder="anything else in the box" onchange="tgSalonEdit('notes',this.value)"></div>
    </div>
    ${lines.join('')}
    ${warnHtml}`;

  const btn = document.getElementById('tgSaveBtn');
  if (btn){
    const blocked = !tgRows.length || tgAnyBlocking();
    btn.disabled = blocked;
    btn.title = blocked
      ? (tgRows.length ? 'Fix the red flags first — a row with no name or a duplicate cannot be saved.' : 'Nothing to save.')
      : `Replace ${BRANCHES[tgBranchSel()]?.name || tgBranchSel()}'s ${tgMonthLabel(tgMonthSel())} targets with these ${tgRows.length} rows`;
  }
}

// One line comparing her yellow box against the table's own sum. Deliberately
// worded as a difference and styled as a note, not a warning: the table wins, and
// a branch whose stated figure is higher is simply not fully allocated yet.
// Named, not counted: "NCR and Rebooked are blank" tells you what to go and find.
function tgClientsMissing(){
  return TG_CLIENT_FIELDS
    .filter(f => tgClients[f.key] === null || tgClients[f.key] === undefined)
    .map(f => f.label);
}

function tgStatedLine(word, stated, actual){
  const gap = stated - actual;
  if (Math.abs(gap) < 0.005){
    return `<div class="tg-line ok">Her stated ${word} figure matches the table: ${tgFmt(actual, 2)}.</div>`;
  }
  return gap > 0
    ? `<div class="tg-line note">She wrote ${tgFmt(stated, 2)} ${word}; the table gives out ${tgFmt(actual, 2)}.
       <b>${tgFmt(gap, 2)}</b> is not allocated to anyone. The table is what gets saved.</div>`
    : `<div class="tg-line note">She wrote ${tgFmt(stated, 2)} ${word}; the table gives out ${tgFmt(actual, 2)},
       <b>${tgFmt(-gap, 2)}</b> more than she stated. The table is what gets saved.</div>`;
}

// ── SAVE ──────────────────────────────────────────────────────
// Replace-the-month semantics, same as every other feed here: a re-paste is a
// correction, not an addition, so the month is deleted and rewritten rather than
// upserted row by row. That is also what makes a removed stylist actually go.

async function tgSave(){
  const branch = tgBranchSel(), ym = tgMonthSel();
  if (!branch || !ym){ tgMsg('Pick a branch and a month.', false); return; }
  if (!tgRows.length){ tgMsg('Nothing to save.', false); return; }
  if (tgAnyBlocking()){ tgMsg('Fix the red flags first.', false); return; }

  const month = tgMonthIso(ym);
  const btn = document.getElementById('tgSaveBtn');
  if (btn){ btn.disabled = true; btn.textContent = 'Saving…'; }

  try{
    const source = `Targets tab paste · ${new Date().toISOString().slice(0, 10)}`;
    const rows = tgRows.map(r => ({
      branch, month, dept: r.dept,
      staff_name: r.name,
      designation: r.designation || null,
      service_target:   Number(r.target)    || 0,
      actual_target:    Number(r.actual)    || 0,
      retail_target:    Number(r.retail)    || 0,
      treatment_target: Number(r.treatment) || 0,
      source,
    }));

    await sb.from(TG_TABLE).delete().eq('branch', branch).eq('month', month);
    const { error } = await sb.from(TG_TABLE).insert(rows);
    if (error) throw error;

    // The branch row is the table's own sums, computed from the rows that were
    // just written rather than from anything the coordinator stated. Her yellow
    // box rides along in stated_* so the difference stays visible later.
    const { error: bErr } = await sb.from(TG_BRANCH_TABLE).upsert({
      branch, month,
      service_target:   rows.reduce((n, r) => n + r.service_target, 0),
      actual_target:    rows.reduce((n, r) => n + r.actual_target, 0),
      retail_target:    rows.reduce((n, r) => n + r.retail_target, 0),
      treatment_target: rows.reduce((n, r) => n + r.treatment_target, 0),
      staff_count:      rows.length,
      stated_service_target: tgSalon.stated_service,
      stated_retail_target:  tgSalon.stated_retail,
      total_clients:   tgClients.total_clients   ?? null,
      new_clients:     tgClients.new_clients     ?? null,
      ncr:             tgClients.ncr             ?? null,
      rebooked:        tgClients.rebooked        ?? null,
      beauty_rebooked: tgClients.beauty_rebooked ?? null,
      actual_pct:     tgPct.actual,
      retail_pct:     tgPct.retail,
      treatment_pct:  tgPct.treatment,
      notes:  tgSalon.notes || null,
      source,
    }, { onConflict: 'branch,month' });
    if (bErr) throw bErr;

    tgLoadedKey = `${branch}|${ym}`;
    tgMsg(`Saved — ${rows.length} rows for ${BRANCHES[branch]?.name || branch}, ${tgMonthLabel(ym)}.`, true);
    showToast(`${BRANCHES[branch]?.name || branch} ${tgMonthLabel(ym)} targets saved`);
    await refreshTargetsProgress();
    // Browse renders once, the first time it is opened. A save has just changed
    // what it would show, so let it run again.
    if (typeof trBrowseRan === 'object') trBrowseRan.targets = false;
  }catch(e){
    tgMsg(`Save failed. ${tgErrText(e)}`, false);
  }finally{
    if (btn){ btn.textContent = 'Save Targets'; }
    tgRenderSummary();
  }
}

// Pull a month that is already in, into the grid, so a correction is an edit
// rather than a retype. The pasted-vs-computed flags are meaningless on a load,
// so `pasted` is seeded from the saved figures and every derived cell arrives
// latched — a saved number is a decision somebody made, not a guess to redo.
async function tgLoadSaved(){
  const branch = tgBranchSel(), ym = tgMonthSel();
  if (!branch || !ym) return;
  const month = tgMonthIso(ym);

  const [{ data: rows, error }, { data: bt }] = await Promise.all([
    sb.from(TG_TABLE).select('*').eq('branch', branch).eq('month', month).order('dept').order('staff_name'),
    sb.from(TG_BRANCH_TABLE).select('*').eq('branch', branch).eq('month', month).maybeSingle(),
  ]);
  if (error){ tgMsg(`Load failed. ${tgErrText(error)}`, false); return; }
  if (!rows || !rows.length){
    tgMsg(`Nothing saved yet for ${BRANCHES[branch]?.name || branch}, ${tgMonthLabel(ym)}.`, false);
    return;
  }

  if (bt){
    tgPct = {
      actual:    Number(bt.actual_pct)    || TG_DEFAULT_PCT.actual,
      retail:    Number(bt.retail_pct)    || TG_DEFAULT_PCT.retail,
      treatment: Number(bt.treatment_pct) || TG_DEFAULT_PCT.treatment,
    };
    document.getElementById('tgPctActual').value    = tgPct.actual;
    document.getElementById('tgPctRetail').value    = tgPct.retail;
    document.getElementById('tgPctTreatment').value = tgPct.treatment;
    tgSalon = {
      stated_service: bt.stated_service_target === null ? null : Number(bt.stated_service_target),
      stated_retail:  bt.stated_retail_target  === null ? null : Number(bt.stated_retail_target),
      notes: bt.notes || '',
    };
    tgClients = {};
    TG_CLIENT_FIELDS.forEach(f => {
      tgClients[f.key] = (bt[f.key] === null || bt[f.key] === undefined) ? null : Number(bt[f.key]);
    });
  } else {
    tgSalon = { stated_service: null, stated_retail: null, notes: '' };
    tgClients = {};
  }

  tgRows = rows.map(r => tgNewRow({
    name: r.staff_name, designation: r.designation || '', dept: r.dept,
    target:    Number(r.service_target)   || 0,
    actual:    Number(r.actual_target)    || 0,
    retail:    Number(r.retail_target)    || 0,
    treatment: Number(r.treatment_target) || 0,
    actualEdited: true, retailEdited: true, treatmentEdited: true,
    deptEdited: true,
    pasted: {
      actual:    Number(r.actual_target)    || 0,
      retail:    Number(r.retail_target)    || 0,
      treatment: Number(r.treatment_target) || 0,
    },
  }));
  tgTotals = null;
  tgWarnings = ['Loaded from Supabase. Every derived cell is held as saved — press <b>Recompute</b> on a row to put it back on the percentages.'];
  tgLoadedKey = `${branch}|${ym}`;
  tgRenderGrid();
  tgMsg(`${tgRows.length} saved rows loaded.`, true);
}

// ── ROSTER ────────────────────────────────────────────────────
// "Not seen in this branch's ledger" is the flag that catches a misread name -
// the one failure mode a paste cannot check on its own, because a typo parses
// perfectly. Names come from the data rather than from staff-profiles.js: the
// roster moves faster than the profile map, and the profile map is not loaded in
// the portal.
//
// BOTH feeds, unioned. phorest_staff_daily is the payroll system and carries
// everyone who took money, beauty bench included; branch_staff_daily is the
// branch Sheet, current within the day but only covering the benches that Sheet
// tracks. On its own either one would flag half a real team as unknown, and a
// flag that cries wolf is worse than no flag. 90 days is wide enough to carry
// someone who has been on leave.

async function tgLoadRoster(branch){
  if (tgRoster[branch]) return;
  const since = new Date();
  since.setDate(since.getDate() - 90);
  const from = trIsoDate(since);
  const [a, b] = await Promise.all([
    sb.from('phorest_staff_daily').select('employee_name').eq('branch', branch).gte('date', from).limit(8000),
    sb.from('branch_staff_daily').select('staff_name').eq('branch', branch).gte('date', from).limit(8000),
  ]);
  const set = new Set();
  const add = v => { const n = canonicalStaffName(String(v || '').trim()).toUpperCase(); if (n) set.add(n); };
  (a.data || []).forEach(r => add(r.employee_name));
  (b.data || []).forEach(r => add(r.staff_name));
  // A failed roster read must not block a paste: the flag is a courtesy, and an
  // empty set turns it off rather than flagging every single row.
  tgRoster[branch] = set;
}

async function tgBranchChanged(){
  await tgLoadRoster(tgBranchSel());
  tgRenderGrid();
}

// Both tables land in one migration, so until somebody runs it every read and
// every save fails the same way. PostgREST answers "Could not find the table
// 'public.staff_targets' in the schema cache", which tells you nothing about
// what to do, so it is translated once here.
function tgErrText(e){
  if (!e) return '';
  if (e.code === 'PGRST205' || /schema cache/i.test(e.message || '')){
    return 'The targets tables are not in Supabase yet. Run <code>migrations/create_staff_targets.sql</code> in the SQL Editor once, then press Refresh.';
  }
  // The five client-count columns were added after the tables were first created,
  // so a table built from the original file is missing them and every save fails
  // on the first one. Same class of problem, different file to run.
  if (/column .* does not exist/i.test(e.message || '')){
    return 'The client-count columns are not in Supabase yet. Run <code>migrations/add_client_targets_to_branch_targets.sql</code> in the SQL Editor once, then try again.';
  }
  return tgEsc(e.message || String(e));
}

// ── PROGRESS ──────────────────────────────────────────────────
// Which branch has a target sheet in, for which month. A month × branch grid,
// because that is the shape of the question: it is four cells a month, not 611
// days, so the whole table is one small read.

async function refreshTargetsProgress(){
  const host = document.getElementById('tgProgressGrid');
  const { data, error } = await sb.from(TG_TABLE)
    .select('branch,month,dept,service_target').gte('month', tgMonthIso(TG_START_MONTH));
  if (error){
    if (host) host.innerHTML = `<div style="padding:8px 0;font-size:14px;color:var(--bad)">${tgErrText(error)}</div>`;
    // The strip still gets drawn, from nothing: a tab whose top band is blank
    // reads as broken, and "no sheet in for any branch" is the honest answer
    // when the table cannot be read at all.
    tgRenderMonthStrip(TG_BRANCHES.map(b => ({ label: b.label, in: false, ended: false,
      title: `${b.label} — cannot read the targets table` })), tgCurrentMonth());
    return;
  }

  // branch|YYYY-MM -> { rows, total }
  const cells = {};
  (data || []).forEach(r => {
    const ym = String(r.month).slice(0, 7);
    const k = `${r.branch}|${ym}`;
    cells[k] = cells[k] || { rows: 0, total: 0 };
    cells[k].rows += 1;
    cells[k].total += Number(r.service_target) || 0;
  });

  const months = tgMonthOptions();
  if (host){
    host.innerHTML = `
      <div class="sp-table-wrap" style="max-height:none;min-height:0">
        <table class="sp-table tg-prog">
          <thead><tr><th>Month</th>${TG_BRANCHES.map(b => `<th>${b.label}</th>`).join('')}</tr></thead>
          <tbody>${months.map(ym => `<tr>
            <td class="tg-l">${tgMonthLabel(ym)}</td>
            ${TG_BRANCHES.map(b => {
              const c = cells[`${b.code}|${ym}`];
              return c
                ? `<td class="tg-cell in" title="${c.rows} stylists, ${tgFmt(c.total)} total">${c.rows} · ${tgFmt(c.total)}</td>`
                : `<td class="tg-cell out" title="No target sheet in">—</td>`;
            }).join('')}
          </tr>`).join('')}</tbody>
        </table>
      </div>`;
  }

  // The strip and the pip read THIS month only: last month's blanks are history,
  // and a target sheet for a month that has started is the thing worth chasing.
  const ym = tgCurrentMonth();
  const rows = TG_BRANCHES.map(b => ({
    label: b.label,
    in: !!cells[`${b.code}|${ym}`],
    ended: false,
    title: cells[`${b.code}|${ym}`]
      ? `${b.label} — ${cells[`${b.code}|${ym}`].rows} stylists in for ${tgMonthLabel(ym)}`
      : `${b.label} — no target sheet for ${tgMonthLabel(ym)} yet`,
  }));
  tgRenderMonthStrip(rows, ym);

  if (typeof updStamp === 'function') updStamp('targets');
}

// The other tabs pin a Today strip; a monthly feed pins a month. Same markup and
// the same pip, worded for a month rather than a day, and no closed-day logic —
// a target sheet is not something a branch can be shut for.
function tgRenderMonthStrip(rows, ym){
  const host = document.getElementById('tgMonthStrip');
  const missing = rows.filter(r => !r.in);
  if (host){
    host.innerHTML = `
      <div class="today-date">${tgMonthLabel(ym)}<span>This month</span></div>
      <div class="today-pills">` +
      rows.map(r => `<span class="today-pill ${r.in ? 'in' : 'out'}" title="${r.title}">${r.in ? '&#10003;' : '&#9675;'} ${r.label}</span>`).join('') +
      `</div>
      <span class="today-note">${missing.length ? missing.length + ' still to come' : 'all four in'}</span>` +
      (missing.length ? `<button class="btn" style="width:auto;padding:9px 18px" onclick="tgJumpToPaste()">Paste now</button>` : '');
  }
  const pip = document.getElementById('tabPipTargets');
  if (pip){
    pip.classList.toggle('clear', missing.length === 0);
    pip.classList.toggle('warn',  missing.length > 0);
    pip.title = missing.length
      ? `${missing.length} branch${missing.length === 1 ? '' : 'es'} with no target sheet for ${tgMonthLabel(ym)}`
      : `every branch has a target sheet for ${tgMonthLabel(ym)}`;
  }
  if (typeof measureStickyChrome === 'function') measureStickyChrome();
}

function tgJumpToPaste(){
  switchSegTo('targets', 'upload');
  document.getElementById('tgPasteBox')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ── BROWSE ────────────────────────────────────────────────────

async function runTargetsFilter(){
  const host = document.getElementById('tgTableHost');
  if (!host) return;
  const branch = document.getElementById('tgfBranch')?.value || '';
  const ym     = document.getElementById('tgfMonth')?.value  || '';
  const staff  = (document.getElementById('tgfStaff')?.value || '').trim().toUpperCase();

  let q = sb.from(TG_TABLE).select('*');
  if (branch) q = q.eq('branch', branch);
  if (ym)     q = q.eq('month', tgMonthIso(ym));
  const { data, error } = await q.order('month', { ascending: false })
                                .order('branch').order('dept').order('staff_name');
  if (error){ host.innerHTML = `<div style="padding:16px;font-size:14px;color:var(--bad)">${tgErrText(error)}</div>`; return; }

  let rows = data || [];
  if (staff) rows = rows.filter(r => String(r.staff_name || '').toUpperCase().includes(staff));

  const count = document.getElementById('tgResultCount');
  if (count) count.textContent = `${rows.length} row${rows.length === 1 ? '' : 's'}`;
  if (!rows.length){ host.innerHTML = `<div style="padding:16px;font-size:14px;color:var(--muted2)">Nothing saved for that filter.</div>`; return; }

  const tot = rows.reduce((a, r) => ({
    s: a.s + (Number(r.service_target)   || 0),
    a: a.a + (Number(r.actual_target)    || 0),
    r: a.r + (Number(r.retail_target)    || 0),
    t: a.t + (Number(r.treatment_target) || 0),
  }), { s: 0, a: 0, r: 0, t: 0 });

  host.innerHTML = `
    <table class="sp-table">
      <thead><tr><th>Month</th><th>Branch</th><th>Stylist</th><th>Designation</th><th>Bench</th>
        <th>Salon target</th><th>Actual</th><th>Retail</th><th>Treatment</th></tr></thead>
      <tbody>
        <tr class="is-total"><td colspan="5">TOTAL · ${rows.length} rows</td>
          <td>${tgFmt(tot.s, 2)}</td><td>${tgFmt(tot.a, 2)}</td><td>${tgFmt(tot.r, 2)}</td><td>${tgFmt(tot.t, 2)}</td></tr>
        ${rows.map(r => `<tr>
          <td>${tgMonthLabel(String(r.month).slice(0, 7))}</td>
          <td>${BRANCHES[r.branch]?.name || r.branch}</td>
          <td>${tgEsc(r.staff_name)}</td>
          <td>${tgEsc(r.designation || '')}</td>
          <td>${r.dept === 'BEAUTY' ? 'Beauty' : 'Hair'}</td>
          <td>${tgFmt(r.service_target, 2)}</td>
          <td>${tgFmt(r.actual_target, 2)}</td>
          <td>${tgFmt(r.retail_target, 2)}</td>
          <td>${tgFmt(r.treatment_target, 2)}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
  if (typeof measureStickyChrome === 'function') measureStickyChrome();
}

function resetTargetsFilter(){
  const b = document.getElementById('tgfBranch'); if (b) b.value = '';
  const m = document.getElementById('tgfMonth');  if (m) m.value = '';
  const s = document.getElementById('tgfStaff');  if (s) s.value = '';
  runTargetsFilter();
}

// ── INIT ──────────────────────────────────────────────────────

let tgInited = false;

function initTargetsTab(){
  tgRenderSelectors();
  if (!tgInited){
    // Browse gets its own copies of the two selectors, plus an "any" option
    // each — this table is small enough that all four branches at once is a
    // reasonable thing to ask for.
    const fb = document.getElementById('tgfBranch');
    if (fb) fb.innerHTML = `<option value="">All branches</option>` +
      TG_BRANCHES.map(x => `<option value="${x.code}">${x.label}</option>`).join('');
    const fm = document.getElementById('tgfMonth');
    if (fm) fm.innerHTML = `<option value="">All months</option>` +
      tgMonthOptions().map(ym => `<option value="${ym}">${tgMonthLabel(ym)}</option>`).join('');
    tgInited = true;
  }
  tgLoadRoster(tgBranchSel()).then(tgRenderGrid);
  refreshTargetsProgress();
}
