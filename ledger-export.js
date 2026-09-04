/* ══════════════════════════════════════════════════════════════════════════════
   LEDGER EXPORT — the Ledgers pages as a spreadsheet that shows its own working
   Kate, 4 Sep 2026: "add an excel file button to each sub section of the ledgers
   section. it must show how the formulas happen, if you will."

   THE POINT IS THE FORMULAS, NOT THE FIGURES. A CSV of rendered numbers is a
   photograph of this page and answers nothing you could not already see. What her
   sheet does, and what these pages had stopped doing, is let you click a cell and
   read where it came from. So every derived figure in these exports is written as a
   real formula against real cells:

     Total revenue      = Hair revenue + Beauty services + Retail Total
     Variance           = MTD − Target
     MTD                = SUM(the day or week columns)
     Rebooking %        = Rebooked / Total clients × 100
     Group total        = 'Saadiyat'!D12 + 'Khalifa City'!D12 + …

   Change a day's figure in the exported file and the month, the variance and the
   group total all move, because they are arithmetic and not text.

   EVERY CELL ALSO CARRIES ITS VALUE. A formula is an addition to a cell, never a
   replacement: the value this dashboard computed is written alongside as the cached
   result. So a wrong formula can only ever be a wrong formula — it cannot make the
   export disagree with the page — and a CSV, which has no other sheets to reach,
   falls back to the value wherever a formula would have pointed across a tab.

   THREE WAYS OUT, NO SETUP OF ANY KIND (Kate's choice, 4 Sep 2026, over an Apps
   Script web app and an OAuth client — both of which needed a deployment step from
   her before the first click):

     CSV              one block, formulas intact, opens anywhere
     XLSX             the whole section, real formulas, number formats, one file
     Copy for Sheets  the block on the clipboard as TSV — Ctrl+Shift+V into Sheets
                      and the formulas arrive as formulas

   and one button per page for the whole Ledgers section as a single .xlsx with a
   tab per block, which Sheets opens from Drive with the formulas live.

   NO LIBRARY. The .xlsx is written here, by hand — a stored (uncompressed) zip of
   the parts Excel actually requires. SheetJS was the alternative and would have
   been ~900KB vendored for a file we need total control of: the community build
   does not write cell styles, and a "show me the formula" export whose headers,
   totals and number formats are all General is missing the half that makes it
   readable. Verified by writing a workbook and reading it back with openpyxl —
   formulas, cached values, number formats and tab names all round-trip.
   ══════════════════════════════════════════════════════════════════════════════ */

/* ── THE MODEL ─────────────────────────────────────────────────────────────────
   Workbook { fileName, sheets:[Sheet] }
   Sheet    { name, title, subtitle, blocks:[Block], legend:[[label,text]] }
   Block    { title, note, cols:[Col], rows:[Row], legend:[[label,text]] }
   Col      { key, label, fmt }
   Row      { group:'label' } | { key, total, cells:[Cell] }
   Cell     number | string | null | { v, f, fmt, bold }

   `key` on a row and on a column is what a formula addresses: A('mtd') is this
   row's MTD cell, A('mtd','totalRevenue') is another row's, and A('mtd', key, 'Al
   Quoz') reaches the same cell on another tab. Rows and columns without a key are
   unreachable by formula, which is fine for anything nothing points at.
   ───────────────────────────────────────────────────────────────────────────── */

// Cell shorthand → object. A bare number, string or null is a value cell.
function lgxCell(c) {
  if (c === null || c === undefined) return { v: null };
  if (typeof c === 'object') return c;
  return { v: c };
}

// A spreadsheet cell holds text, not markup.
//
// A belt-and-braces net at the one place every string passes through, rather than
// trust at each of a few hundred call sites. The models take their labels from the
// page's own definitions and one of those — the stylist name, which sets the
// surname in a lighter face — was HTML, so a cell read
// `KATE <span class="lg-last">Alsaybar</span>`. That one is fixed at source
// (lgPersonNamePlain), and this is here so the next label that grows a <b> is a
// cosmetic near-miss rather than a broken column.
function lgxText(v) {
  const s = String(v);
  if (s.indexOf('<') === -1 && s.indexOf('&') === -1) return s;
  return s.replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

// A1 column letters. 26 columns is not enough here — Daily split on a 31-day month
// runs well past AF — so this has to carry properly rather than assume one letter.
function lgxColName(i) {
  let s = '';
  for (let n = i + 1; n > 0; ) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = (n - r - 1) / 26; }
  return s;
}
function lgxA1(colIdx, rowIdx) { return lgxColName(colIdx) + (rowIdx + 1); }

// Excel tab names: 31 characters, and none of : \ / ? * [ ]. Deduped, because two
// blocks called "Sales" in one workbook is a file Excel refuses to open rather than
// one with a mangled tab.
function lgxTabName(raw, taken) {
  const clean = String(raw || 'Sheet').replace(/[:\\/?*[\]]/g, ' ').replace(/\s+/g, ' ').trim();
  const base = clean.slice(0, 31) || 'Sheet';
  if (!taken) return base;
  let name = base, i = 2;
  while (taken.has(name.toLowerCase())) {
    const suffix = ' (' + i + ')';
    name = base.slice(0, 31 - suffix.length) + suffix;
    i++;
  }
  taken.add(name.toLowerCase());
  return name;
}

/* ── LAYOUT ────────────────────────────────────────────────────────────────────
   Model → a grid of cells with every formula resolved to real addresses.

   Two passes over the whole workbook, and it has to be two: a formula on the group
   tab points at cells on the branch tabs, so nothing can be resolved until every
   sheet knows where its own rows landed. Pass one places cells and records
   positions, pass two calls each formula function with a resolver.
   ───────────────────────────────────────────────────────────────────────────── */

// One sheet's cells, plus where its keyed rows and columns ended up.
function lgxPlace(sheet) {
  const grid = [];
  const blocks = [];
  const put = cells => { grid.push(cells); return grid.length - 1; };
  const text = (s, style) => [{ v: lgxText(s), fmt: 'text', style: style }];

  if (sheet.title)    put(text(sheet.title, 'h1'));
  if (sheet.subtitle) put(text(sheet.subtitle, 'muted'));
  if (sheet.title || sheet.subtitle) put([]);

  (sheet.blocks || []).filter(Boolean).forEach(block => {
    const pos = { rowOf: {}, colOf: {}, cols: block.cols || [] };
    (block.cols || []).forEach((c, i) => { if (c.key) pos.colOf[c.key] = i; });

    if (block.title) put(text(block.title, 'blockT'));
    if (block.note)  put(text(block.note, 'muted'));

    // A numeric column's heading is right-aligned over its figures, the way the
    // page has it — a left-set "Variance" above a column of right-set money reads
    // as a heading belonging to the column before it.
    pos.head = put((block.cols || []).map(c => ({ v: lgxText(c.label), fmt: 'text',
      style: (c.fmt && c.fmt !== 'text') ? 'headR' : 'head' })));
    pos.first = grid.length;

    (block.rows || []).forEach(r => {
      if (!r) return;
      if (r.group !== undefined) { put(text(r.group, 'group')); return; }
      const style = r.total ? 'total' : 'body';
      const idx = put((r.cells || []).map((c, i) => {
        const cell = lgxCell(c);
        return { v: (typeof cell.v === 'string' ? lgxText(cell.v) : cell.v),
                 f: cell.f, style: cell.bold ? 'total' : style,
                 fmt: cell.fmt || (block.cols[i] && block.cols[i].fmt) || 'text' };
      }));
      if (r.key) pos.rowOf[r.key] = idx;
    });
    pos.last = grid.length - 1;
    blocks.push(pos);

    // The working, in words, under the block it belongs to. Two columns: the figure
    // and how it is arrived at. This is the half of "show how the formulas happen"
    // that a cell reference cannot do on its own — =D12-C12 is the mechanism, and
    // "MTD less Target" is what the mechanism means.
    if (block.legend && block.legend.length) {
      put([]);
      put(text('How this block is worked out', 'blockT'));
      block.legend.forEach(([k, v]) => put([
        { v: lgxText(k), fmt: 'text', style: 'legendK' },
        { v: lgxText(v), fmt: 'text', style: 'muted' }]));
    }
    put([]);
  });

  if (sheet.legend && sheet.legend.length) {
    put(text('Notes', 'blockT'));
    sheet.legend.forEach(([k, v]) => put([
      { v: lgxText(k), fmt: 'text', style: 'legendK' },
      { v: lgxText(v), fmt: 'text', style: 'muted' }]));
  }

  return { grid: grid, blocks: blocks };
}

/* Pass two: every formula function gets a resolver and becomes a string.

   A(colKey)                    this row, that column
   A(colKey, rowKey)            another keyed row of the same block, same column
   A(colKey, rowKey, sheetName) the same on another tab, quoted for Excel
   A.range(fromColKey, toColKey) this row, a span — SUM() across the split columns
   A.col(colKey, fromRow, toRow) one column, a span of rows
   A.has(colKey)                is that column even here? The split columns are
                                absent on MTD, so a formula has to be able to ask   */
function lgxResolve(laidOut) {
  const byName = {};
  laidOut.forEach(s => { byName[s.name] = s; });

  laidOut.forEach(sheet => {
    sheet.blocks.forEach((pos, bi) => {
      for (let rowIdx = pos.first; rowIdx <= pos.last; rowIdx++) {
        const row = sheet.grid[rowIdx];
        if (!row) continue;
        row.forEach(cell => {
          if (!cell || typeof cell.f !== 'function') return;
          const A = (colKey, rowKey, sheetName) => {
            const target = sheetName ? byName[sheetName] : sheet;
            if (!target) return '#REF!';
            const tpos = sheetName ? target.blocks[bi] : pos;
            if (!tpos) return '#REF!';
            const ci = tpos.colOf[colKey];
            const ri = rowKey ? tpos.rowOf[rowKey] : rowIdx;
            if (ci === undefined || ri === undefined) return '#REF!';
            const ref = lgxA1(ci, ri);
            // Only quoted when it crosses a tab, so a reference reads as
            // 'Al Quoz'!D12 rather than as something escaped for its own sake.
            return sheetName ? "'" + String(target.name).replace(/'/g, "''") + "'!" + ref : ref;
          };
          A.range = (fromKey, toKey) => {
            const a = pos.colOf[fromKey], b = pos.colOf[toKey];
            if (a === undefined || b === undefined) return null;
            return lgxA1(a, rowIdx) + ':' + lgxA1(b, rowIdx);
          };
          A.col = (colKey, fromRowKey, toRowKey) => {
            const c = pos.colOf[colKey];
            const a = pos.rowOf[fromRowKey], b = pos.rowOf[toRowKey];
            if (c === undefined || a === undefined || b === undefined) return null;
            return lgxA1(c, a) + ':' + lgxA1(c, b);
          };
          A.has = colKey => pos.colOf[colKey] !== undefined;
          let out = null;
          try { out = cell.f(A); } catch (e) { out = null; }
          // A formula that cannot be built is not an error — the cell keeps the
          // value the dashboard computed, which is the whole point of carrying both.
          cell.f = (out && String(out).indexOf('#REF!') === -1) ? String(out) : null;
        });
      }
    });
  });
  return laidOut;
}

// Model → laid-out sheets, ready for any of the three writers.
function lgxBuild(workbook) {
  const taken = new Set();
  const laidOut = (workbook.sheets || []).filter(Boolean).map(sheet => {
    const placed = lgxPlace(sheet);
    return { name: lgxTabName(sheet.name, taken), grid: placed.grid, blocks: placed.blocks };
  });
  return lgxResolve(laidOut);
}

/* ── NUMBER FORMATS AND STYLES ─────────────────────────────────────────────────
   Five formats, and every one of them is here because a figure reads wrong without
   it. Money as #,##0 with negatives in red, because a variance is the column she
   reads and a leading minus sign is easy to miss. Percentages as 0.0"%" and NOT as
   Excel's own percent type: the values on these pages are already out of a hundred
   — 2.04 means 2.04% — and the percent type would multiply them again and print
   204%. Fils only where the whole question is whether two figures agree to the fils.
   ───────────────────────────────────────────────────────────────────────────── */
const LGX_FMTS = [
  ['text', 0,   null],
  ['aed',  164, '#,##0;[Red]-#,##0'],
  ['aed2', 165, '#,##0.00;[Red]-#,##0.00'],
  ['pct',  166, '0.0"%"'],
  ['num',  167, '#,##0;[Red]-#,##0'],
];
const LGX_FMT_IDX = {};
LGX_FMTS.forEach((f, i) => { LGX_FMT_IDX[f[0]] = i; });

// style name → [font, fill, border, alignRight]
const LGX_STYLES = [
  ['body',    0, 0, 0, 0],
  ['h1',      2, 0, 0, 0],
  ['muted',   3, 0, 0, 0],
  ['blockT',  4, 0, 0, 0],
  ['head',    1, 2, 1, 0],
  ['headR',   1, 2, 1, 1],
  ['group',   5, 3, 0, 0],
  ['total',   1, 0, 2, 0],
  ['legendK', 1, 0, 0, 0],
];
const LGX_STYLE_IDX = {};
LGX_STYLES.forEach((s, i) => { LGX_STYLE_IDX[s[0]] = i; });

// One cellXf per style × format, so a bold total in AED and a muted note in plain
// text are two indices into the same flat table rather than two special cases.
function lgxXf(style, fmt) {
  const s = LGX_STYLE_IDX[style] === undefined ? LGX_STYLE_IDX.body : LGX_STYLE_IDX[style];
  const f = LGX_FMT_IDX[fmt] === undefined ? 0 : LGX_FMT_IDX[fmt];
  return s * LGX_FMTS.length + f;
}

/* ── THE THREE WRITERS ─────────────────────────────────────────────────────────
   CSV and TSV are one sheet by definition, so a formula that reaches across tabs
   has nowhere to point and the cell falls back to its value. Same rule both ways,
   in lgxFlatCell, so the clipboard and the file can never disagree.
   ───────────────────────────────────────────────────────────────────────────── */

// What one cell says in a single-sheet, text-only world.
function lgxFlatCell(cell) {
  if (!cell) return '';
  // A cross-tab reference cannot survive on its own, so the figure goes instead.
  if (cell.f && cell.f.indexOf('!') === -1) return '=' + cell.f;
  if (cell.v === null || cell.v === undefined) return '';
  if (typeof cell.v === 'number') return isFinite(cell.v) ? String(Math.round(cell.v * 1e6) / 1e6) : '';
  return String(cell.v);
}

function lgxCsv(sheet) {
  const q = s => (/[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);
  return sheet.grid.map(row => (row || []).map(c => q(lgxFlatCell(c))).join(',')).join('\r\n');
}

// Tab separated, for the clipboard. Sheets reads =D12-C12 out of a pasted cell as a
// formula, which is the whole reason this button exists beside the file ones. A tab
// or a newline inside a cell would split it, so both are flattened to spaces.
function lgxTsv(sheet) {
  const clean = s => s.replace(/[\t\r\n]+/g, ' ');
  return sheet.grid.map(row => (row || []).map(c => clean(lgxFlatCell(c))).join('\t')).join('\r\n');
}

/* ── XLSX ──────────────────────────────────────────────────────────────────────
   The minimum set of parts Excel and Sheets both accept, written by hand:

     [Content_Types].xml           what each part is
     _rels/.rels                   the workbook is the root
     xl/workbook.xml               the tabs, in order
     xl/_rels/workbook.xml.rels    tab → worksheet file
     xl/styles.xml                 the formats and styles above
     xl/worksheets/sheetN.xml      the cells

   Strings are written inline rather than through a shared-strings table: these
   sheets are mostly numbers, the strings are mostly labels used once, and a second
   part that has to stay index-perfect with the first is a class of bug this does
   not need for a file measured in hundreds of kilobytes.
   ───────────────────────────────────────────────────────────────────────────── */

function lgxXml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
    // Control characters are not legal anywhere in XML 1.0, and one of them in a
    // stylist's name would make the whole file refuse to open rather than that one
    // cell read oddly.
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

const LGX_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

function lgxStylesXml() {
  const numFmts = LGX_FMTS.filter(f => f[2]);
  return LGX_HEAD +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="' + numFmts.length + '">' +
      numFmts.map(f => '<numFmt numFmtId="' + f[1] + '" formatCode="' + lgxXml(f[2]) + '"/>').join('') +
    '</numFmts>' +
    '<fonts count="6">' +
      '<font><sz val="11"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="11"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="15"/><name val="Calibri"/></font>' +
      '<font><sz val="10"/><color rgb="FF6B6560"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="10"/><color rgb="FF3D3A36"/><name val="Calibri"/></font>' +
      '<font><b/><i/><sz val="11"/><name val="Calibri"/></font>' +
    '</fonts>' +
    '<fills count="4">' +
      '<fill><patternFill patternType="none"/></fill>' +
      '<fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFF0EBE1"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFFAF6EF"/><bgColor indexed="64"/></patternFill></fill>' +
    '</fills>' +
    '<borders count="3">' +
      '<border><left/><right/><top/><bottom/><diagonal/></border>' +
      '<border><left/><right/><top/><bottom style="thin"><color rgb="FFBDB6AC"/></bottom><diagonal/></border>' +
      '<border><left/><right/><top style="thin"><color rgb="FFBDB6AC"/></top><bottom/><diagonal/></border>' +
    '</borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="' + (LGX_STYLES.length * LGX_FMTS.length) + '">' +
      LGX_STYLES.map(st => LGX_FMTS.map(f =>
        '<xf numFmtId="' + f[1] + '" fontId="' + st[1] + '" fillId="' + st[2] + '" borderId="' + st[3] + '"' +
        ' xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"' +
        (st[4] ? ' applyAlignment="1"><alignment horizontal="right"/></xf>' : '/>')
      ).join('')).join('') +
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';
}

// Column widths from the widest thing each column carries. Without this every
// column opens 8.43 wide and a table of AED figures is a wall of ####. Legend text
// runs to a sentence, so it is not allowed to drag a column out to 200 wide.
function lgxWidths(sheet) {
  const w = [];
  sheet.grid.forEach(row => (row || []).forEach((c, i) => {
    if (!c || c.v == null) return;
    if (i > 0 && (c.style === 'muted' || c.style === 'h1')) return;
    w[i] = Math.max(w[i] || 0, String(c.v).length);
  }));
  return w.map((len, i) => (i === 0
    ? Math.max(18, Math.min(46, (len || 0) + 2))
    : Math.max(11, Math.min(22, (len || 0) + 2))));
}

function lgxSheetXml(sheet) {
  const widths = lgxWidths(sheet);
  const cols = widths.length
    ? '<cols>' + widths.map((wd, i) =>
        '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + wd + '" customWidth="1"/>').join('') + '</cols>'
    : '';

  // The first block's headings stay put, and so does the label beside them: a
  // 31-column daily table scrolled to the far right is unreadable otherwise, and
  // that is the table most worth exporting.
  const fb = sheet.blocks && sheet.blocks[0];
  const pane = (fb && fb.first > 0)
    ? '<sheetViews><sheetView workbookViewId="0"><pane xSplit="1" ySplit="' + fb.first +
      '" topLeftCell="' + lgxA1(1, fb.first) + '" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>'
    : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';

  const rows = sheet.grid.map((row, r) => {
    if (!row || !row.length) return '';
    const cells = row.map((c, i) => {
      if (!c) return '';
      const ref = lgxA1(i, r);
      const s = ' s="' + lgxXf(c.style, c.fmt) + '"';
      const num = (typeof c.v === 'number' && isFinite(c.v));
      // Formula plus cached value: the file opens showing the figure this dashboard
      // computed, and recalculates to the same one the moment anything is edited.
      if (c.f) {
        return '<c r="' + ref + '"' + s + '><f>' + lgxXml(c.f) + '</f>' +
               (num ? '<v>' + (Math.round(c.v * 1e6) / 1e6) + '</v>' : '') + '</c>';
      }
      if (num) return '<c r="' + ref + '"' + s + '><v>' + (Math.round(c.v * 1e6) / 1e6) + '</v></c>';
      if (c.v === null || c.v === undefined || c.v === '') return '';
      return '<c r="' + ref + '"' + s + ' t="inlineStr"><is><t xml:space="preserve">' +
             lgxXml(c.v) + '</t></is></c>';
    }).join('');
    return cells ? '<row r="' + (r + 1) + '">' + cells + '</row>' : '';
  }).join('');

  return LGX_HEAD +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    pane + cols + '<sheetData>' + rows + '</sheetData></worksheet>';
}

function lgxWorkbookParts(sheets) {
  const parts = [];
  parts.push(['[Content_Types].xml', LGX_HEAD +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    sheets.map((s, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) +
      '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') +
    '</Types>']);

  parts.push(['_rels/.rels', LGX_HEAD +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>']);

  parts.push(['xl/workbook.xml', LGX_HEAD +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"' +
    ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
    sheets.map((s, i) => '<sheet name="' + lgxXml(s.name) + '" sheetId="' + (i + 1) +
      '" r:id="rId' + (i + 1) + '"/>').join('') +
    '</sheets>' +
    // Recalculated on open rather than trusting the cached values written beside
    // every formula. Those values are this dashboard's own and are checked to agree
    // with their formula before it is written, so a recalculation should change
    // nothing — which is exactly why it is worth asking for. If it ever did change
    // something, that is a thing worth seeing rather than a number worth hiding.
    '<calcPr calcId="0" fullCalcOnLoad="1"/>' +
    '</workbook>']);

  parts.push(['xl/_rels/workbook.xml.rels', LGX_HEAD +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    sheets.map((s, i) => '<Relationship Id="rId' + (i + 1) +
      '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"' +
      ' Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') +
    // Styles is numbered after the sheets, so adding a tab never renumbers it.
    '<Relationship Id="rId' + (sheets.length + 1) +
      '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '</Relationships>']);

  parts.push(['xl/styles.xml', lgxStylesXml()]);
  sheets.forEach((s, i) => parts.push(['xl/worksheets/sheet' + (i + 1) + '.xml', lgxSheetXml(s)]));
  return parts;
}

/* ── ZIP ───────────────────────────────────────────────────────────────────────
   Stored, not deflated. An .xlsx is a zip and a zip entry may be stored, which
   both Excel and Sheets accept — so the alternative was shipping a deflate
   implementation to save a few hundred kilobytes on a file that goes straight to
   the Downloads folder. CompressionStream would do it natively but is async, which
   would turn every export path into a promise for no gain anyone can see.
   ───────────────────────────────────────────────────────────────────────────── */

const LGX_CRC_TABLE = (function () {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function lgxCrc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = LGX_CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function lgxZip(parts) {
  const enc = new TextEncoder();
  const now = new Date();
  // MS-DOS date and time, which is what a zip header carries. Two-second
  // resolution, hence the halved seconds; 1980 is the epoch.
  const dosTime = ((now.getHours() & 31) << 11) | ((now.getMinutes() & 63) << 5) |
                  ((Math.floor(now.getSeconds() / 2)) & 31);
  const dosDate = (((now.getFullYear() - 1980) & 127) << 9) | (((now.getMonth() + 1) & 15) << 5) |
                  (now.getDate() & 31);

  const u16 = v => [v & 0xFF, (v >>> 8) & 0xFF];
  const u32 = v => [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF];

  const chunks = [], central = [];
  let offset = 0;

  parts.forEach(part => {
    const nameBytes = enc.encode(part[0]);
    const data = enc.encode(part[1]);
    const crc = lgxCrc32(data);
    // Bit 11 says the name is UTF-8. Every name here is ASCII, but a reader that
    // trusts the flag and one that guesses a codepage then agree.
    const head = [].concat(
      u32(0x04034b50), u16(20), u16(0x0800), u16(0),
      u16(dosTime), u16(dosDate), u32(crc), u32(data.length), u32(data.length),
      u16(nameBytes.length), u16(0));
    chunks.push(new Uint8Array(head), nameBytes, data);
    central.push([[].concat(
      u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0),
      u16(dosTime), u16(dosDate), u32(crc), u32(data.length), u32(data.length),
      u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset)),
      nameBytes]);
    offset += head.length + nameBytes.length + data.length;
  });

  const dirStart = offset;
  let dirLen = 0;
  central.forEach(entry => {
    chunks.push(new Uint8Array(entry[0]), entry[1]);
    dirLen += entry[0].length + entry[1].length;
  });
  chunks.push(new Uint8Array([].concat(
    u32(0x06054b50), u16(0), u16(0), u16(parts.length), u16(parts.length),
    u32(dirLen), u32(dirStart), u16(0))));

  return new Blob(chunks, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function lgxXlsxBlob(sheets) { return lgxZip(lgxWorkbookParts(sheets)); }

/* ══════════════════════════════════════════════════════════════════════════════
   A FORMULA IS ONLY WRITTEN WHEN IT REPRODUCES THE FIGURE

   The one rule that makes these files trustworthy. Every derived cell is checked
   against the value this dashboard computed before its formula is written, and a
   formula that would not come out to the same number is dropped — the cell keeps
   the figure and simply has no working shown.

   It is not a theoretical guard. MTD = SUM(the day columns) is exactly right on a
   month whose days are all loaded and exactly wrong on one where they are not: the
   page prints a dash for a day it has no rows for, SUM would read that as nothing,
   and the formula would quietly restate a 1.4m month as whatever fraction of it
   happens to be uploaded. Same for a group total summed across branch tabs when the
   branch filter has some of them switched off. Rather than special-case every one
   of those, the arithmetic is done here first and has to agree.
   ══════════════════════════════════════════════════════════════════════════════ */

function lgxNum(v) { const n = Number(v); return isFinite(n) ? n : null; }

// value, what the formula would come to, the formula. Third argument dropped
// unless the second reproduces the first.
function lgxChk(value, expected, formula, fmt) {
  const cell = { v: (value == null ? null : lgxNum(value)) };
  if (fmt) cell.fmt = fmt;
  if (cell.v === null || expected == null || !isFinite(expected) || !formula) return cell;
  const tol = Math.max(0.01, Math.abs(cell.v) * 1e-9);
  if (Math.abs(expected - cell.v) <= tol) cell.f = formula;
  return cell;
}

// Sum of a list, null when every one of them is null — so a row nobody has data
// for stays unknown rather than becoming a zero somebody could act on.
function lgxSum(list) {
  let any = false, t = 0;
  (list || []).forEach(v => { const n = lgxNum(v); if (n !== null) { any = true; t += n; } });
  return any ? t : null;
}

/* ── SPLIT COLUMNS ─────────────────────────────────────────────────────────────
   The Split chips' own columns, keyed s0…sN so a formula can SUM across them. The
   labels are the page's, minus the markup: the page stacks the week number over its
   dates in two lines, which a spreadsheet cell cannot do, so they run together.
   ───────────────────────────────────────────────────────────────────────────── */
function lgxSplitCols(series, fmt) {
  const sp = lgSplit(series);
  return sp.windows.map((x, i) => ({
    key: 's' + i,
    label: (sp.key === 'weeks' ? 'Week ' + String(i).padStart(2, '0') + ' · ' : (x.dow ? x.dow + ' ' : '')) + x.label,
    fmt: fmt || 'aed',
  }));
}

// One row's split values, as numbers. Same shape as lgSplitCells, without the
// formatting — a null is a window the branch has nothing for.
function lgxSplitVals(series, bucket, pick) {
  const sp = lgSplit(series);
  if (!sp.key) return [];
  const cells = (bucket && bucket[sp.key]) ? bucket[sp.key] : [];
  return sp.windows.map((x, i) => {
    const s = cells[i];
    if (!s) return null;
    return lgxNum(pick(s));
  });
}

// MTD = SUM(s0:sN), when there are split columns and they add up to the MTD figure.
function lgxSplitSum(n) {
  return n > 0 ? (A => 'SUM(' + A.range('s0', 's' + (n - 1)) + ')') : null;
}

/* ══════════════════════════════════════════════════════════════════════════════
   1 · ACTUALS vs TARGETS

   Her SUMMARY tab's left-hand block, and the four branch tabs that repeat it. Built
   from LG_SHEET_ROWS — the page's own row definitions, not a copy — so a row added
   there arrives here with its figures, and with its formula too if it is one of the
   lines below that other lines add up to.

   WHAT IS DERIVED FROM WHAT, in her vocabulary:

     Total revenue      Hair revenue + Beauty services + Retail Total
     Services Total     Hair services (excl) + Beauty services
     Retail Total       Hair retail + Beauty retail
     Hair services      Hair revenue − treatments − courses
     Rebooking %        Rebooked / Total Clients × 100
     Treatment %        Hair treatments / Hair revenue × 100
     Retail %           Hair retail / (Hair revenue + Hair retail) × 100

   and on the group tab, every line that nothing else on the tab adds up to is
   written as the sum of the same line on the four branch tabs. Which is why the
   group total is worth opening in the whole-Ledgers workbook rather than on its
   own: on its own there are no branch tabs to point at, so those cells carry the
   figure and no formula.
   ══════════════════════════════════════════════════════════════════════════════ */

// [row key] → the rows it is the sum of.
const LGX_ROW_SUMS = {
  totalRevenue:  ['hairRevenue', 'beautyServices', 'retailTotal'],
  servicesTotal: ['hairServicesExcl', 'beautyServices'],
  retailTotal:   ['hairRetail', 'beautyRetail'],
};
// [row key] → [the row it starts from, the rows taken off it].
const LGX_ROW_DIFFS = {
  hairServicesExcl: ['hairRevenue', ['hairTreatments', 'hairCourses']],
};
// [row key] → [numerator rows, denominator rows] — a percentage of the two.
const LGX_ROW_RATIOS = {
  rebookPct:    [['rebooked'], ['totalClients']],
  treatmentPct: [['hairTreatments'], ['hairRevenue']],
  retailPct:    [['hairRetail'], ['hairRevenue', 'hairRetail']],
};

// The three shapes above as an Excel expression over one column, plus what that
// expression comes to — so lgxChk can throw it away if it does not agree.
function lgxRowFormula(xk, col, valueAt) {
  const add = keys => ({
    f: A => keys.map(k => A(col, k)).join('+'),
    v: lgxSum(keys.map(k => valueAt(k, col))),
  });
  if (LGX_ROW_SUMS[xk]) return add(LGX_ROW_SUMS[xk]);
  if (LGX_ROW_DIFFS[xk]) {
    const [from, less] = LGX_ROW_DIFFS[xk];
    const base = valueAt(from, col);
    if (base == null) return null;
    return {
      f: A => A(col, from) + less.map(k => '-' + A(col, k)).join(''),
      v: base - (lgxSum(less.map(k => valueAt(k, col))) || 0),
    };
  }
  if (LGX_ROW_RATIOS[xk]) {
    const [num, den] = LGX_ROW_RATIOS[xk];
    const n = lgxSum(num.map(k => valueAt(k, col)));
    const d = lgxSum(den.map(k => valueAt(k, col)));
    if (n == null || !d) return null;
    const nExpr = A => num.map(k => A(col, k)).join('+');
    const dExpr = A => den.map(k => A(col, k)).join('+');
    return {
      f: A => '(' + nExpr(A) + ')/(' + dExpr(A) + ')*100',
      v: n / d * 100,
    };
  }
  return null;
}

// One tab: the group, or one branch. `peers` are the branch tab names the group
// tab is allowed to add up; empty for a branch, and empty for a one-tab export.
function lgxSheetActuals(series, ctx, code, name, peers) {
  const bucket = code ? series[code] : series.group;
  if (!bucket || !bucket.mtd) return null;

  const w = series.windows;
  const hairOnly = code ? !((bucket.mtd.beautyTotalClients || 0) || (bucket.mtd.beautyServicesTotal || 0)) : false;
  const bm = (typeof LEDGER_TARGETS !== 'undefined') ? LEDGER_TARGETS.benchmarks : TARGETS;
  const splitCols = lgxSplitCols(series);
  const nSplit = splitCols.length;

  const cols = [{ key: 'label', label: 'Category / Metric' },
                { key: 'prev', label: w.prev.label, fmt: 'aed' },
                { key: 'target', label: 'Target', fmt: 'aed' }]
    .concat(splitCols)
    .concat([{ key: 'mtd', label: 'MTD', fmt: 'aed' },
             { key: 'variance', label: 'Variance', fmt: 'aed' }]);

  // Every figure first, keyed row × column, because a formula cannot be checked
  // against the value it should come to until every value it refers to is known.
  const rows = LG_SHEET_ROWS.filter(r => !(r.beauty && hairOnly));
  const vals = {};
  const meta = {};
  rows.forEach(r => {
    if (r.group || !r.xk) return;
    const pick = r.pick;
    const target = r.ratio
      ? lgxNum(bm[r.bm])
      : ((r.key && ctx.applies) ? lgxNum(ledgerBranchTarget(r.key, code ? [code] : null)) : null);
    const cell = { prev: lgxNum(bucket.prev ? pick(bucket.prev) : null), target: target,
                   mtd: lgxNum(bucket.mtd ? pick(bucket.mtd) : null) };
    lgxSplitVals(series, bucket, pick).forEach((v, i) => { cell['s' + i] = v; });
    cell.variance = (cell.mtd == null || cell.target == null) ? null : cell.mtd - cell.target;
    vals[r.xk] = cell;
    meta[r.xk] = r;
  });
  const valueAt = (xk, col) => (vals[xk] ? vals[xk][col] : null);

  // Per-branch figures for the group tab's cross-tab sums, and only for the
  // branches whose tabs are actually in this workbook.
  //
  // Filtered per row, not once: Motor City runs hair only, so its tab has no
  // beauty rows at all, and a sum that reached for one would resolve to #REF! and
  // cost the group's beauty lines their formula over a branch that contributes
  // nothing to them.
  const peersFor = xk => (peers || []).filter(p => p.vals && p.vals[xk]);

  const modelRows = rows.map(r => {
    if (r.group) return { group: r.group };
    if (!r.xk) return null;
    const v = vals[r.xk];
    const fmt = r.ratio ? (r.money ? 'aed' : 'pct') : (r.num ? 'num' : 'aed');

    const cells = cols.map(c => {
      if (c.key === 'label') return r.label;
      const value = v[c.key];

      // Variance is the same subtraction on every row, and it is the column she
      // reads, so it gets its formula before anything else is considered.
      if (c.key === 'variance') {
        return lgxChk(value, (v.mtd == null || v.target == null) ? null : v.mtd - v.target,
          A => A('mtd') + '-' + A('target'), fmt);
      }

      // Then: is this row something the other rows on this tab add up to?
      const derived = lgxRowFormula(r.xk, c.key, valueAt);
      if (derived) {
        const cell = lgxChk(value, derived.v, derived.f, fmt);
        if (cell.f) return cell;
      }

      // Then, for MTD only: the split columns, when they cover the whole month.
      if (c.key === 'mtd' && nSplit && !r.ratio) {
        const cell = lgxChk(value, lgxSum(splitCols.map((x, i) => v['s' + i])), lgxSplitSum(nSplit), fmt);
        if (cell.f) return cell;
      }

      // Last: the same line added up across the branch tabs. Ratios are excluded
      // on purpose — four branches' rebooking rates do not average to the group's,
      // and a formula that says they do is worse than no formula.
      if (!code && !r.ratio && c.key !== 'target') {
        const mine = peersFor(r.xk);
        if (mine.length) {
          const cell = lgxChk(value, lgxSum(mine.map(p => p.vals[r.xk][c.key])),
            A => mine.map(p => A(c.key, r.xk, p.name)).join('+'), fmt);
          if (cell.f) return cell;
        }
      }

      return { v: value, fmt: fmt };
    });
    return { key: r.xk, cells: cells, total: !!r.tot };
  }).filter(Boolean);

  const legend = [
    ['Total revenue', 'Hair revenue + Beauty services + Retail Total. Ex VAT, and courses counted as performed rather than as sold.'],
    ['Services Total', 'Hair services excluding treatments and courses, plus Beauty services. No retail.'],
    ['Retail Total', 'Hair retail + Beauty retail, Phorest’s own branch products line, house account included.'],
    ['Hair services', 'Hair revenue less treatments less courses.'],
    ['Variance', 'MTD less Target. Negative is money still to find.'],
    ['Rebooking %', 'Rebooked / Total Clients × 100.'],
    ['Treatment %', 'Hair treatments / Hair revenue × 100.'],
    ['Retail %', 'Hair retail / (Hair revenue + Hair retail) × 100.'],
  ];
  if (nSplit) legend.push(['MTD', 'SUM of the ' + (lgGrain === 'daily' ? 'day' : 'week') + ' columns, where every one of them is loaded.']);
  if (!code && peers && peers.length) {
    legend.push(['Every other line', 'The same line added up across the ' + peers.length + ' branch tabs in this file.']);
  }
  legend.push(['Benchmark targets', 'Standing ratios, not monthly figures, so they are the same at any window length and carry no variance in money.']);
  legend.push(['A cell with no formula', 'A figure the arithmetic on this tab could not reproduce — a part-loaded month, or a line whose parts are not all here. The figure is the dashboard’s and is right; only the working is missing.']);

  return {
    name: name,
    title: (code ? ((BRANCH_INFO[code] || {}).name || code) : 'Group total — all salons'),
    subtitle: w.prev.label + ' actuals and ' + w.month.label + ' targets · ex VAT'
      + (ctx.applies ? '' : ' · no target sheet for this month, so the Target column is empty'),
    blocks: [{ cols: cols, rows: modelRows, legend: legend }],
    _vals: vals,
  };
}

// The page: the group tab, then a tab per branch, in her sheet's order. The group
// tab is built last so it can add up the branch tabs it is going to sit beside.
function lgxModelActuals(series, ctx) {
  const order = ['SAA', 'KCA', 'AQ', 'MC'].filter(c => ACTIVE_BRANCHES.includes(c));
  const branchSheets = [];
  order.forEach(code => {
    const name = lgxTabName((BRANCH_INFO[code] || {}).name || code);
    const sheet = lgxSheetActuals(series, ctx, code, name, null);
    if (sheet) branchSheets.push({ name: name, sheet: sheet, vals: sheet._vals });
  });
  const group = lgxSheetActuals(series, ctx, null, 'Group total', branchSheets);
  return [group].concat(branchSheets.map(b => b.sheet)).filter(Boolean);
}

/* ══════════════════════════════════════════════════════════════════════════════
   2 · DAILY TARGET SHEET

   The benchmark pivot, then her six pacing blocks, from LG_PACE_BLOCKS — the
   page's own definitions. The pacing blocks are where the working matters most:
   Target, then the actual cut by week or day, then MTD, Variance, % done and
   Remaining, every one of the last four an arithmetic step off the two before it.
   ══════════════════════════════════════════════════════════════════════════════ */

// One pacing block. `codes` is the branch selection on screen; the grand total
// adds up the rows above it rather than being read off the group, the same way
// the page builds it.
function lgxPaceBlock(series, ctx, block, codes) {
  const showTargets = ctx.applies;
  const splitCols = lgxSplitCols(series);
  const nSplit = splitCols.length;
  const cols = [{ key: 'branch', label: 'Branch' }]
    .concat(showTargets ? [{ key: 'target', label: 'Target', fmt: 'aed' }] : [])
    .concat(splitCols)
    .concat([{ key: 'mtd', label: 'MTD actual', fmt: 'aed' }])
    .concat(showTargets ? [{ key: 'variance', label: 'Variance', fmt: 'aed' },
                           { key: 'pctDone', label: '% done', fmt: 'pct' },
                           { key: 'remaining', label: 'Remaining', fmt: 'aed' }] : []);

  const rows = [];
  const used = [];
  codes.forEach(code => {
    const bucket = series[code];
    if (!bucket || !bucket.mtd) return;
    const info = BRANCH_INFO[code] || { name: code };
    const actual = lgxNum(block.pick(bucket.mtd)) || 0;
    const target = showTargets ? (lgxNum(ledgerBranchTarget(block.key, [code])) || 0) : 0;
    const p = ledgerPace(actual, target);
    const splits = lgxSplitVals(series, bucket, s => block.pick(s) || 0);

    const cells = [info.name]
      .concat(showTargets ? [{ v: target, fmt: 'aed' }] : [])
      .concat(splits.map(v => ({ v: v, fmt: 'aed' })))
      .concat([lgxChk(actual, lgxSum(splits), lgxSplitSum(nSplit), 'aed')])
      .concat(showTargets ? [
        lgxChk(p.variance, actual - target, A => A('mtd') + '-' + A('target'), 'aed'),
        lgxChk(p.pctDone, target ? actual / target * 100 : null,
          A => 'IFERROR(' + A('mtd') + '/' + A('target') + '*100,"")', 'pct'),
        lgxChk(p.remaining, Math.max(0, target - actual),
          A => 'MAX(0,' + A('target') + '-' + A('mtd') + ')', 'aed'),
      ] : []);
    rows.push({ key: 'b-' + code, cells: cells });
    used.push({ code: code, target: target, actual: actual, splits: splits });
  });

  if (used.length) {
    const first = 'b-' + used[0].code, last = 'b-' + used[used.length - 1].code;
    const colSum = key => A => 'SUM(' + A.col(key, first, last) + ')';
    const tT = used.reduce((n, u) => n + u.target, 0);
    const tA = used.reduce((n, u) => n + u.actual, 0);
    const g = ledgerPace(tA, tT);
    const cells = ['Grand total']
      .concat(showTargets ? [lgxChk(tT, tT, colSum('target'), 'aed')] : [])
      .concat(splitCols.map((c, i) => {
        const v = lgxSum(used.map(u => u.splits[i]));
        return lgxChk(v, v, colSum(c.key), 'aed');
      }))
      .concat([lgxChk(tA, tA, colSum('mtd'), 'aed')])
      .concat(showTargets ? [
        lgxChk(g.variance, tA - tT, A => A('mtd') + '-' + A('target'), 'aed'),
        lgxChk(g.pctDone, tT ? tA / tT * 100 : null,
          A => 'IFERROR(' + A('mtd') + '/' + A('target') + '*100,"")', 'pct'),
        lgxChk(g.remaining, Math.max(0, tT - tA),
          A => 'MAX(0,' + A('target') + '-' + A('mtd') + ')', 'aed'),
      ] : []);
    rows.push({ key: 'grand', total: true, cells: cells });
  }

  return { title: block.title, cols: cols, rows: rows };
}

function lgxModelTargetsPace(series, ctx) {
  const codes = lgBranches();
  const nSplit = lgxSplitCols(series).length;
  const legend = [
    ['MTD actual', nSplit ? 'SUM of the ' + (lgGrain === 'daily' ? 'day' : 'week') + ' columns.' : 'The month to date, from the daily branch ledger and Phorest.'],
    ['Variance', 'MTD less Target. Negative is money still to find.'],
    ['% done', 'MTD / Target × 100. Raw progress through the target, deliberately NOT paced against elapsed days — the ledger does it this way and Emma reads both side by side.'],
    ['Remaining', 'MAX(0, Target − MTD). It stops at nil rather than going negative once the target is passed.'],
    ['Grand total', 'The sum of the branch rows above it, not the group figure — so it always matches the branches actually on screen.'],
  ];
  if (!ctx.applies) legend.push(['No target columns', 'The target sheet does not cover ' + series.windows.month.label + ', so this is actuals only.']);
  return {
    name: 'Pacing',
    title: 'Daily Target Sheet · ' + (ctx.applies ? 'target vs actual' : 'actuals by branch'),
    subtitle: series.windows.month.label + ' · ex VAT · ' + ctx.label,
    blocks: LG_PACE_BLOCKS.map(b => lgxPaceBlock(series, ctx, b, codes)),
    legend: legend,
  };
}

// The benchmark pivot. Rebooking % is the one ratio whose two parts are both
// columns of this block, so it is the one that gets a formula; the others are
// ratios of figures that live on Actuals vs Targets, and the legend says so
// rather than leaving them looking arbitrary.
function lgxModelTargetsPivot(series) {
  const codes = lgBranches();
  const cols = [
    { key: 'branch', label: 'Branch' },
    { key: 'rebookPct', label: 'Rebooking %', fmt: 'pct' },
    { key: 'treatmentPct', label: 'Treatment %', fmt: 'pct' },
    { key: 'retailPct', label: 'Retail %', fmt: 'pct' },
    { key: 'hairAvgBill', label: 'Hair avg bill', fmt: 'aed' },
    { key: 'beautyAvgBill', label: 'Beauty avg bill', fmt: 'aed' },
    { key: 'totalClients', label: 'Total clients', fmt: 'num' },
    { key: 'newClients', label: 'New', fmt: 'num' },
    { key: 'ncr', label: 'NCR', fmt: 'num' },
    { key: 'rebooked', label: 'Rebooked', fmt: 'num' },
  ];

  const rows = [], used = [];
  codes.forEach(code => {
    const d = series[code] && series[code].mtd;
    if (!d) return;
    const info = BRANCH_INFO[code] || { name: code };
    const hairNet = (d.hairServicesIncl || 0) + (d.hairRetailOnly || 0);
    const v = {
      rebookPct: lgxNum(d.rebookPct != null ? d.rebookPct : d.hairRebookPct),
      treatmentPct: (d.treatmentSales == null || !(d.hairServicesIncl || 0)) ? null : d.treatmentSales / d.hairServicesIncl * 100,
      retailPct: hairNet ? (d.hairRetailOnly || 0) / hairNet * 100 : null,
      hairAvgBill: lgxNum(d.hairAvgBill), beautyAvgBill: lgxNum(d.beautyAvgBill),
      totalClients: lgxNum(d.totalClients), newClients: lgxNum(d.newClientsTotal),
      ncr: lgxNum(d.ncrTotal), rebooked: lgxNum(d.totalRebooked),
    };
    const rebookF = A => 'IFERROR(' + A('rebooked') + '/' + A('totalClients') + '*100,"")';
    rows.push({ key: 'b-' + code, cells: [info.name,
      lgxChk(v.rebookPct, (v.rebooked != null && v.totalClients) ? v.rebooked / v.totalClients * 100 : null, rebookF, 'pct'),
      { v: v.treatmentPct, fmt: 'pct' }, { v: v.retailPct, fmt: 'pct' },
      { v: v.hairAvgBill, fmt: 'aed' }, { v: v.beautyAvgBill, fmt: 'aed' },
      { v: v.totalClients, fmt: 'num' }, { v: v.newClients, fmt: 'num' },
      { v: v.ncr, fmt: 'num' }, { v: v.rebooked, fmt: 'num' }] });
    used.push(v);
  });

  if (used.length) {
    const roll = lgRollup(codes.map(c => series[c] && series[c].mtd));
    const anyLedger = codes.some(c => series[c] && series[c].mtd && !series[c].mtd._phorestOnly);
    const hairNetAll = roll.hairServicesIncl + roll.hairRetailOnly;
    const first = rows[0].key, last = rows[rows.length - 1].key;
    const colSum = key => A => 'SUM(' + A.col(key, first, last) + ')';
    const sumOf = key => lgxSum(used.map(u => u[key]));
    const clients = sumOf('totalClients'), rebooked = anyLedger ? sumOf('rebooked') : null;
    rows.push({ key: 'grand', total: true, cells: ['Grand total',
      lgxChk(anyLedger ? lgxNum(roll.rebookPct) : null,
        (rebooked != null && clients) ? rebooked / clients * 100 : null,
        A => 'IFERROR(' + A('rebooked') + '/' + A('totalClients') + '*100,"")', 'pct'),
      { v: anyLedger ? (roll.hairServicesIncl ? roll.treatmentSales / roll.hairServicesIncl * 100 : null) : null, fmt: 'pct' },
      { v: hairNetAll ? roll.hairRetailOnly / hairNetAll * 100 : null, fmt: 'pct' },
      { v: lgxNum(roll.hairAvgBill), fmt: 'aed' }, { v: lgxNum(roll.beautyAvgBill), fmt: 'aed' },
      lgxChk(lgxNum(roll.totalClients), clients, colSum('totalClients'), 'num'),
      lgxChk(lgxNum(roll.newClientsTotal), sumOf('newClients'), colSum('newClients'), 'num'),
      lgxChk(anyLedger ? lgxNum(roll.ncrTotal) : null, anyLedger ? sumOf('ncr') : null, colSum('ncr'), 'num'),
      lgxChk(rebooked, rebooked, colSum('rebooked'), 'num')] });
  }

  return {
    name: 'Benchmarks by branch',
    title: 'Daily Target Sheet · benchmarks by branch',
    subtitle: series.windows.month.label + ' · month to date, whatever Split is set to',
    blocks: [{ cols: cols, rows: rows }],
    legend: [
      ['Rebooking %', 'Rebooked / Total clients × 100 — both of them columns here, so this one carries its working.'],
      ['Treatment %, Retail %, the avg bills', 'Ratios of figures that are not columns on this block: treatment AED against hair revenue, hair retail against hair revenue plus retail, revenue against client count. Their parts are all on the Actuals vs Targets tabs, which is where those three carry formulas.'],
      ['Grand total', 'Counts are the sum of the branch rows. The ratio is rebuilt from the summed parts and NOT averaged across branches — four branches’ rebooking rates do not average to the group’s.'],
      ['Always month to date', 'A benchmark is a ratio of its own window, so this block ignores Split. The pacing blocks are where the weeks and days live.'],
    ],
  };
}

/* ══════════════════════════════════════════════════════════════════════════════
   3 · FINANCIAL TOTALS

   Four tabs, and they divide on one line: what this dashboard derives, and what
   Phorest's own report says.

   The dashboard tabs carry their working — Total (Ex VAT) is its three parts added
   up, VAT is 5% of it, the gross is the two together. The Phorest report tab
   mostly does not, and that is the point of it: those figures are read off the
   report and are the outside number, so the only formulas there are the report's
   own internal sums, which is exactly what you would want to check.

   The reconciliation tab is the one that matters, and its last column is a real
   subtraction: report, less this dashboard, less courses, less uncredited service.
   In fils, because the whole question is whether it comes to nil.
   ══════════════════════════════════════════════════════════════════════════════ */

// Branch rows plus an All salons total, for any block over the parsed report.
// `pick` returns one branch's cells; `sumKeys` are the column keys the total row
// adds up, everything else on that row is left to its own formula or its value.
function lgxFtBlock(title, ft, branches, cols, pick, opts) {
  const o = opts || {};
  const rows = branches.map(c => ({
    key: 'b-' + c,
    cells: [(BRANCH_INFO[c] || { name: c }).name].concat(pick(ft[c], c)),
  }));
  if (rows.length) {
    const first = rows[0].key, last = rows[rows.length - 1].key;
    const colSum = key => A => 'SUM(' + A.col(key, first, last) + ')';
    const allCells = pick(ft.ALL, 'ALL');
    rows.push({
      key: 'all', total: true,
      cells: [o.allLabel || 'All salons'].concat(allCells.map((cell, i) => {
        const col = cols[i + 1];
        if (!col || !col.key || col.fmt === 'text') return cell;
        const obj = lgxCell(cell);
        // A column with its own row formula keeps it — the total of a derived
        // column is better read as that column's own arithmetic than as a sum of
        // sums, and the two agree anyway.
        if (obj.f) return cell;
        const branchSum = lgxSum(branches.map(c => {
          const bc = lgxCell(pick(ft[c], c)[i]);
          return bc.v;
        }));
        return lgxChk(obj.v, branchSum, colSum(col.key), obj.fmt || col.fmt);
      })),
    });
  }
  return { title: title, cols: cols, rows: rows, note: o.note, legend: o.legend };
}

// The dashboard's own four lines, recut from the same summaries every other
// Ledgers page reads. The previous month's total is a column here where the page
// prints only the delta — a "vs last month" with nothing to subtract from is the
// one figure on the page whose working cannot be shown.
function lgxModelFinancialsSales(series) {
  const w = series.windows;
  const order = ['SAA', 'KCA', 'AQ', 'MC'].filter(c => ACTIVE_BRANCHES.includes(c));
  const cols = [{ key: 'branch', label: 'Branch' },
    { key: 'services', label: 'Services', fmt: 'aed' },
    { key: 'courses', label: 'Courses', fmt: 'aed' },
    { key: 'products', label: 'Products', fmt: 'aed' },
    { key: 'net', label: 'Total (Ex VAT)', fmt: 'aed' },
    { key: 'vat', label: 'VAT @ 5%', fmt: 'aed' },
    { key: 'gross', label: 'Total (Inc VAT)', fmt: 'aed' },
    { key: 'prevNet', label: w.prev.label + ' total (Ex VAT)', fmt: 'aed' },
    { key: 'vsPrev', label: 'vs ' + w.prev.label, fmt: 'aed' }];

  const cellsFor = (s, prev) => {
    const f = lgFinancials(s);
    if (!f) return [null, null, null, null, null, null, null, null];
    const p = lgFinancials(prev);
    return [
      { v: f.services, fmt: 'aed' }, { v: f.courses, fmt: 'aed' }, { v: f.products, fmt: 'aed' },
      lgxChk(f.net, f.services + f.courses + f.products,
        A => A('services') + '+' + A('courses') + '+' + A('products'), 'aed'),
      lgxChk(f.vat, f.net * LG_VAT, A => A('net') + '*' + LG_VAT, 'aed'),
      lgxChk(f.gross, f.net + f.vat, A => A('net') + '+' + A('vat'), 'aed'),
      { v: p ? p.net : null, fmt: 'aed' },
      p ? lgxChk(f.net - p.net, f.net - p.net, A => A('net') + '-' + A('prevNet'), 'aed') : { v: null, fmt: 'aed' },
    ];
  };

  const rows = [];
  order.forEach(code => {
    const b = series[code];
    if (!b || !b.mtd) return;
    rows.push({ key: 'b-' + code, cells: [(BRANCH_INFO[code] || { name: code }).name].concat(cellsFor(b.mtd, b.prev)) });
  });
  if (rows.length) {
    const first = rows[0].key, last = rows[rows.length - 1].key;
    const colSum = key => A => 'SUM(' + A.col(key, first, last) + ')';
    const g = series.group || {};
    const cells = cellsFor(g.mtd, g.prev).map((cell, i) => {
      const col = cols[i + 1];
      const obj = lgxCell(cell);
      if (obj.f) return cell;
      const branchSum = lgxSum(rows.map(r => lgxCell(r.cells[i + 1]).v));
      return lgxChk(obj.v, branchSum, colSum(col.key), col.fmt);
    });
    rows.push({ key: 'all', total: true, cells: ['All salons'].concat(cells) });
  }

  return {
    name: 'Financial totals',
    title: 'Financial Totals · this dashboard',
    subtitle: w.month.label + ' · ex VAT unless the column says otherwise',
    blocks: [{ cols: cols, rows: rows }],
    legend: [
      ['Total (Ex VAT)', 'Services + Courses + Products. The figure to check a branch’s Phorest report against.'],
      ['VAT @ 5%', 'Total (Ex VAT) × 0.05, which is what the report’s own VAT Breakdown block applies.'],
      ['Total (Inc VAT)', 'Total (Ex VAT) + VAT.'],
      ['vs ' + w.prev.label, 'This month’s Total (Ex VAT) less last month’s.'],
      ['Services', 'Courses taken out of it, the way Phorest’s report splits them. Every other tab carries courses inside the service figure.'],
      ['Courses', 'Courses PERFORMED. Phorest’s report counts courses SOLD, which is one of the two reasons this reads under the report.'],
      ['All salons', 'The sum of the branch rows, so it always matches the branches on screen.'],
    ],
  };
}

// The drill-down, only when Split asks for it: one number per cell, Total (Ex VAT),
// because the question it answers is which day the gap is on.
function lgxModelFinancialsSplit(series) {
  const w = series.windows;
  const sp = lgSplit(series);
  if (!sp.key) return null;
  const order = ['SAA', 'KCA', 'AQ', 'MC'].filter(c => ACTIVE_BRANCHES.includes(c));
  const splitCols = lgxSplitCols(series);
  const nSplit = splitCols.length;
  const cols = [{ key: 'branch', label: 'Branch' }].concat(splitCols)
    .concat([{ key: 'total', label: w.month.label + ' total', fmt: 'aed' }]);
  const netOf = s => { const f = lgFinancials(s); return f ? f.net : null; };

  const rows = [];
  order.forEach(code => {
    const b = series[code];
    if (!b || !b.mtd) return;
    const splits = lgxSplitVals(series, b, netOf);
    rows.push({ key: 'b-' + code,
      cells: [(BRANCH_INFO[code] || { name: code }).name]
        .concat(splits.map(v => ({ v: v, fmt: 'aed' })))
        .concat([lgxChk(netOf(b.mtd), lgxSum(splits), lgxSplitSum(nSplit), 'aed')]) });
  });
  if (rows.length) {
    const first = rows[0].key, last = rows[rows.length - 1].key;
    const colSum = key => A => 'SUM(' + A.col(key, first, last) + ')';
    const gSplits = lgxSplitVals(series, series.group, netOf);
    rows.push({ key: 'all', total: true,
      cells: ['All salons']
        .concat(splitCols.map((c, i) => lgxChk(gSplits[i], lgxSum(rows.map(r => lgxCell(r.cells[i + 1]).v)), colSum(c.key), 'aed')))
        .concat([lgxChk(netOf(series.group && series.group.mtd), lgxSum(gSplits), lgxSplitSum(nSplit), 'aed')]) });
  }

  return {
    name: 'Total ex VAT by ' + (lgGrain === 'daily' ? 'day' : 'week'),
    title: 'Financial Totals · Total (Ex VAT) by ' + (lgGrain === 'daily' ? 'day' : 'week'),
    subtitle: w.month.label + ' · ex VAT',
    blocks: [{ cols: cols, rows: rows }],
    legend: [
      [w.month.label + ' total', 'SUM of the ' + (lgGrain === 'daily' ? 'day' : 'week') + ' columns.'],
      ['A blank cell', 'No rows uploaded for that ' + (lgGrain === 'daily' ? 'day' : 'week') + ' at that branch. A zero is rows that are there and total nothing, which is a different thing.'],
      ['Closed days', 'The page marks the days a branch does not trade and flags money landing on one, which is the most useful thing on that table. A spreadsheet cell cannot carry the marking, so check the page for that read — Al Quoz shuts Sunday and Monday, from 1 June 2026 onward only.'],
    ],
  };
}

// Phorest's own blocks, in the report's order, under its own headings.
function lgxModelFinancialsReport(series, ft, monthDays) {
  if (!ft) return null;
  const w = series.windows;
  const order = ['SAA', 'KCA', 'AQ', 'MC'].filter(c => ACTIVE_BRANCHES.includes(c));
  const branches = order.filter(c => ft[c]);
  if (!branches.length) return null;

  const keysOf = which => {
    const seen = new Set();
    branches.concat(['ALL']).forEach(c => Object.entries((ft[c] || {})[which] || {})
      .forEach(([k, v]) => { if (Math.abs(Number(v) || 0) >= 0.005) seen.add(k); }));
    return [...seen].sort();
  };

  const salesCols = [{ key: 'branch', label: 'Branch' },
    { key: 'nSvc', label: '# services', fmt: 'num' }, { key: 'svc', label: 'Services', fmt: 'aed2' },
    { key: 'nCrs', label: '# courses', fmt: 'num' }, { key: 'crs', label: 'Courses sold', fmt: 'aed2' },
    { key: 'nPrd', label: '# products', fmt: 'num' }, { key: 'prd', label: 'Products', fmt: 'aed2' },
    { key: 'net', label: 'Total (Ex VAT)', fmt: 'aed2' }, { key: 'vat', label: 'VAT', fmt: 'aed2' },
    { key: 'total', label: 'Total (Inc VAT)', fmt: 'aed2' }];
  const sales = lgxFtBlock('Sales', ft, branches, salesCols, f => [
    { v: lgxNum(f.services_count), fmt: 'num' }, { v: lgxNum(f.services_net), fmt: 'aed2' },
    { v: lgxNum(f.courses_count), fmt: 'num' }, { v: lgxNum(f.courses_net), fmt: 'aed2' },
    { v: lgxNum(f.products_count), fmt: 'num' }, { v: lgxNum(f.products_net), fmt: 'aed2' },
    lgxChk(lgxNum(f.sales_net), (f.services_net || 0) + (f.courses_net || 0) + (f.products_net || 0),
      A => A('svc') + '+' + A('crs') + '+' + A('prd'), 'aed2'),
    { v: lgxNum(f.sales_vat), fmt: 'aed2' },
    lgxChk(lgxNum(f.sales_total), (f.sales_net || 0) + (f.sales_vat || 0),
      A => A('net') + '+' + A('vat'), 'aed2'),
  ], { note: 'Read off the report itself, not derived from anything. This is the outside number.' });

  const nonRevCols = [{ key: 'branch', label: 'Branch' },
    { key: 'sold', label: 'Vouchers sold', fmt: 'aed2' }, { key: 'paid', label: 'Paid into account', fmt: 'aed2' },
    { key: 'used', label: 'Vouchers used', fmt: 'aed2' }, { key: 'memb', label: 'Memberships used', fmt: 'aed2' },
    { key: 'acct', label: 'Account used', fmt: 'aed2' }, { key: 'total', label: 'Total', fmt: 'aed2' }];
  const nonRev = lgxFtBlock('Non-revenue sales', ft, branches, nonRevCols, f => [
    { v: lgxNum(f.vouchers_sold_total), fmt: 'aed2' }, { v: lgxNum(f.paid_into_account_total), fmt: 'aed2' },
    { v: lgxNum(f.vouchers_used_total), fmt: 'aed2' }, { v: lgxNum(f.memberships_used_total), fmt: 'aed2' },
    { v: lgxNum(f.account_used_total), fmt: 'aed2' },
    lgxChk(lgxNum(f.non_revenue_total),
      (f.vouchers_sold_total || 0) + (f.paid_into_account_total || 0) + (f.vouchers_used_total || 0)
        + (f.memberships_used_total || 0) + (f.account_used_total || 0),
      A => A('sold') + '+' + A('paid') + '+' + A('used') + '+' + A('memb') + '+' + A('acct'), 'aed2'),
  ], { note: 'Money moving rather than money earned, which is why no total anywhere else includes it. Used lines are negative, as the report has them.' });

  const NAMED = new Set(['cash (net of sundries)', 'card (debit/credit/tabby)', 'stripe', 'tabby-link']);
  const extras = keysOf('payment_types').filter(k => !NAMED.has(String(k).trim().toLowerCase()));
  const payCols = [{ key: 'branch', label: 'Branch' },
    { key: 'cash', label: 'Cash', fmt: 'aed2' }, { key: 'card', label: 'Card', fmt: 'aed2' },
    { key: 'stripe', label: 'Stripe', fmt: 'aed2' }, { key: 'tabby', label: 'Tabby link', fmt: 'aed2' }]
    .concat(extras.map((k, i) => ({ key: 'x' + i, label: k, fmt: 'aed2' })))
    .concat([{ key: 'banked', label: 'Total banked', fmt: 'aed2' }]);
  const pay = lgxFtBlock('Payment types and banking', ft, branches, payCols, f => {
    const named = [f.pay_cash, f.pay_card, f.pay_stripe, f.pay_tabby_link].map(v => lgxNum(v) || 0);
    const ex = extras.map(k => lgxNum((f.payment_types || {})[k]) || 0);
    const parts = named.concat(ex);
    return named.map(v => ({ v: v, fmt: 'aed2' }))
      .concat(ex.map(v => ({ v: v, fmt: 'aed2' })))
      .concat([lgxChk(lgxNum(f.total_banked), parts.reduce((a, b) => a + b, 0),
        A => ['cash', 'card', 'stripe', 'tabby'].concat(extras.map((k, i) => 'x' + i)).map(k => A(k)).join('+'), 'aed2')]);
  }, { note: 'Every line Phorest sends is kept, so a payment type this page has never heard of gets a column of its own. A blank is a line that branch’s report does not print, which is not the same as taking nothing that way.' });

  const cbKeys = keysOf('cashbook');
  const cash = cbKeys.length ? lgxFtBlock('Cashbook', ft, branches,
    [{ key: 'branch', label: 'Branch' }].concat(cbKeys.map((k, i) => ({ key: 'c' + i, label: k, fmt: 'aed2' }))),
    f => cbKeys.map(k => ({ v: lgxNum((f.cashbook || {})[k]) || 0, fmt: 'aed2' })),
    { note: 'The report’s own cashbook lines, not a restatement of the payment types above: Khalifa City’s DTRANSFER is booked here and nowhere else.' }) : null;

  const vat = lgxFtBlock('VAT and pay outs', ft, branches,
    [{ key: 'branch', label: 'Branch' },
     { key: 'svcNet', label: 'Service net', fmt: 'aed2' }, { key: 'svcVat', label: 'Service VAT', fmt: 'aed2' },
     { key: 'prdNet', label: 'Product net', fmt: 'aed2' }, { key: 'prdVat', label: 'Product VAT', fmt: 'aed2' },
     { key: 'payOuts', label: 'Pay outs', fmt: 'aed2' }],
    f => [{ v: lgxNum(f.vat_service_net), fmt: 'aed2' }, { v: lgxNum(f.vat_service_vat), fmt: 'aed2' },
          { v: lgxNum(f.vat_product_net), fmt: 'aed2' }, { v: lgxNum(f.vat_product_vat), fmt: 'aed2' },
          { v: lgxNum(f.sundries_total), fmt: 'aed2' }],
    { note: 'Row labels differ by branch in Phorest, so they are read by position: first row service, second product. Service here has courses inside it where the Sales block keeps them apart — the report’s own behaviour.' });

  const partial = branches.filter(c => ft[c].days < monthDays);
  const failed = branches.filter(c => ft[c].checksFailed > 0);
  const legend = [
    ['Everything on this tab', 'Read off Phorest’s Financial Totals report, not derived. The only formulas here are the report’s own internal sums, which is what you would want to check.'],
    ['Total (Ex VAT)', 'Services + Courses sold + Products, as the report adds them.'],
    ['Total banked', 'The payment type columns added up.'],
    ['Days uploaded', branches.map(c => (BRANCH_INFO[c] || { name: c }).name + ' ' + ft[c].days + ' of ' + monthDays).join(' · ')],
  ];
  if (partial.length) legend.push(['⚠ Part month', partial.map(c => (BRANCH_INFO[c] || { name: c }).name).join(' · ')
    + ' — these rows are the sum of the days that are in, so they are not the branch’s month and must not be read against a monthly target.']);
  if (failed.length) legend.push(['⚠ Failed its own cross-checks', failed.map(c => (BRANCH_INFO[c] || { name: c }).name + ', ' + ft[c].checksFailed + ' day(s)').join(' · ')
    + ' — the report’s four internal sums did not agree on those days, so the parse is wrong rather than the day being odd. Worth re-uploading before trusting the row.']);

  return {
    name: 'Phorest report',
    title: 'Financial Totals · Phorest report',
    subtitle: w.month.label + ' · the outside number',
    blocks: [sales, nonRev, pay, cash, vat].filter(Boolean),
    legend: legend,
  };
}

// The reconciliation, and the whole reason the page exists once there is a report
// to do it with. Every known cause taken off, and the remainder named.
function lgxModelFinancialsRecon(series, ft) {
  if (!ft) return null;
  const w = series.windows;
  const order = ['SAA', 'KCA', 'AQ', 'MC'].filter(c => ACTIVE_BRANCHES.includes(c));
  const branches = order.filter(c => ft[c]);
  if (!branches.length) return null;

  const cols = [{ key: 'branch', label: 'Branch' },
    { key: 'report', label: 'Report', fmt: 'aed2' },
    { key: 'dash', label: 'Dashboard', fmt: 'aed2' },
    { key: 'courses', label: 'Courses sold − performed', fmt: 'aed2' },
    { key: 'uncredited', label: 'Uncredited service', fmt: 'aed2' },
    { key: 'left', label: 'Unexplained', fmt: 'aed2' }];

  const cellsFor = (f, s) => {
    const mine = lgFinancials(s);
    if (!f || !mine) return [null, null, null, null, null];
    const coursesGap = (f.sales_net != null ? (f.courses_net || 0) : 0) - (mine.courses || 0);
    const uncredited = lgxNum(s.servicesUnattributed) || 0;
    const left = (f.sales_net || 0) - mine.net - coursesGap - uncredited;
    return [
      { v: lgxNum(f.sales_net), fmt: 'aed2' }, { v: mine.net, fmt: 'aed2' },
      { v: coursesGap, fmt: 'aed2' }, { v: uncredited, fmt: 'aed2' },
      lgxChk(left, (f.sales_net || 0) - mine.net - coursesGap - uncredited,
        A => A('report') + '-' + A('dash') + '-' + A('courses') + '-' + A('uncredited'), 'aed2'),
    ];
  };

  const rows = branches.map(c => ({ key: 'b-' + c,
    cells: [(BRANCH_INFO[c] || { name: c }).name].concat(cellsFor(ft[c], series[c] && series[c].mtd)) }));
  // The total rolls up only the branches the report covers, never series.group:
  // reading two uploaded branches against a dashboard figure for four is not a
  // reconciliation, and it printed a −368,583 "unexplained" the first time it ran.
  const groupSummary = lgRollup(branches.map(c => series[c] && series[c].mtd));
  const first = rows[0].key, last = rows[rows.length - 1].key;
  const colSum = key => A => 'SUM(' + A.col(key, first, last) + ')';
  rows.push({ key: 'all', total: true,
    cells: [branches.length === order.length ? 'All salons' : 'All salons (' + branches.length + ' of ' + order.length + ' uploaded)']
      .concat(cellsFor(ft.ALL, groupSummary).map((cell, i) => {
        const obj = lgxCell(cell);
        if (obj.f) return cell;
        return lgxChk(obj.v, lgxSum(rows.map(r => lgxCell(r.cells[i + 1]).v)), colSum(cols[i + 1].key), 'aed2');
      })) });

  return {
    name: 'Report vs dashboard',
    title: 'Financial Totals · report against this dashboard',
    subtitle: w.month.label + ' · ex VAT, to the fils',
    blocks: [{ cols: cols, rows: rows }],
    legend: [
      ['Unexplained', 'Report − Dashboard − Courses − Uncredited service. This is the column to read: a nil means the two agree once both known causes are accounted for, and a figure is a real difference worth chasing.'],
      ['Courses sold − performed', 'Phorest counts courses SOLD; every figure on this dashboard counts courses PERFORMED, because Phorest’s staff export offers a "Courses (perf)" column and nothing gives courses sold.'],
      ['Uncredited service', 'Service revenue no stylist was credited with. These pages are built by summing staff rows, and a row is dropped when it cannot be tied to a person the ledger knows — an assistant, whose work never attributes to a stylist.'],
      ['All salons', 'Rolled up from the branches the report covers on BOTH sides, so the row can only ever compare like with like.'],
      ['Worked example', 'Saadiyat August: the report says 518,674, this dashboard says 517,888, and the 786 between them is 481 of courses plus 305 of uncredited service — two assistants at 152.38 each. Services and Products match the report to the fils.'],
    ],
  };
}

/* ══════════════════════════════════════════════════════════════════════════════
   4 · DAILY STYLIST TARGET

   Her own tab: one row per stylist, grouped branch then department, with a totals
   row per group. Every ratio on the row is a ratio of two other cells on the same
   row, and every totals row is the sum of the rows above it — so this is the tab
   where the working is densest.
   ══════════════════════════════════════════════════════════════════════════════ */
function lgxModelStylist(series, ctx) {
  const showTargets = ctx.applies;
  const splitCols = lgxSplitCols(series);
  const nSplit = splitCols.length;
  const canon = n => String((typeof canonicalStaffName === 'function' ? canonicalStaffName(n) : n) || '').trim().toUpperCase();
  const svcOf = (st, dept) => dept === 'BEAUTY' ? (st.beautySales || 0) : (st.hairSalesNet || 0);

  const cols = [{ key: 'name', label: 'Stylist' }, { key: 'dept', label: 'Dept' }]
    .concat(showTargets ? [{ key: 'svcTarget', label: 'Services target', fmt: 'aed' }] : [])
    .concat(splitCols)
    .concat([{ key: 'svcMtd', label: 'Services MTD', fmt: 'aed' }])
    .concat(showTargets ? [{ key: 'svcVar', label: 'Services variance', fmt: 'aed' }] : [])
    .concat([{ key: 'clients', label: 'Clients', fmt: 'num' }, { key: 'newC', label: 'New', fmt: 'num' },
             { key: 'ncr', label: 'NCR', fmt: 'num' }, { key: 'rebooked', label: 'Rebooked', fmt: 'num' },
             { key: 'rebookPct', label: 'Rebook %', fmt: 'pct' }, { key: 'avgBill', label: 'Avg bill', fmt: 'aed' }])
    .concat(showTargets ? [{ key: 'txTarget', label: 'Treatment target', fmt: 'aed' }] : [])
    .concat([{ key: 'txMtd', label: 'Treatment MTD', fmt: 'aed' }, { key: 'txUnit', label: 'Treatment unit', fmt: 'num' },
             { key: 'txPct', label: 'Treatment %', fmt: 'pct' }])
    .concat(showTargets ? [{ key: 'retTarget', label: 'Retail target', fmt: 'aed' }] : [])
    .concat([{ key: 'retMtd', label: 'Retail MTD', fmt: 'aed' }, { key: 'retUnit', label: 'Retail unit', fmt: 'num' },
             { key: 'retPct', label: 'Retail %', fmt: 'pct' }]);

  // The ratios, as one shared set: every stylist row and every totals row reads
  // them the same way, which is the point of them being formulas at all.
  const rebookF = A => 'IFERROR(' + A('rebooked') + '/' + A('clients') + '*100,"")';
  const avgF    = A => 'IFERROR(' + A('svcMtd') + '/' + A('clients') + ',"")';
  const txPctF  = A => 'IFERROR(' + A('txMtd') + '/' + A('svcMtd') + '*100,"")';
  const retPctF = A => 'IFERROR(' + A('retMtd') + '/(' + A('svcMtd') + '+' + A('retMtd') + ')*100,"")';

  const rows = [];
  lgBranches().forEach(code => {
    const bd = series[code] && series[code].staff.mtd;
    if (!bd) return;
    const info = BRANCH_INFO[code] || { name: code };

    [['HAIR', bd.hairStaff || []], ['BEAUTY', bd.beautyStaff || []]].forEach(([dept, staff]) => {
      if (!staff.length) return;
      rows.push({ group: info.name + ' · ' + (dept === 'HAIR' ? 'Hair' : 'Beauty') });

      const maps = nSplit
        ? (series[code].staff[lgSplit(series).key] || []).map(rec => {
            const m = {};
            ((dept === 'BEAUTY' ? rec.beautyStaff : rec.hairStaff) || []).forEach(st => {
              const k = canon(st.name);
              m[k] = (m[k] || 0) + svcOf(st, dept);
            });
            return m;
          })
        : [];

      const tot = { st: 0, sa: 0, tt: 0, ta: 0, rt: 0, ra: 0, c: 0, n: 0, ncr: 0, rb: 0, tu: 0, ru: 0 };
      const mine = [];
      staff.slice()
        .sort((a, b) => svcOf(b, dept) - svcOf(a, dept))
        .forEach((st, i) => {
          const tg = (showTargets && typeof ledgerStaffTarget === 'function')
            ? ledgerStaffTarget(code, dept, st.name) : null;
          const svcA = svcOf(st, dept);
          const txA = dept === 'BEAUTY' ? null : lgxNum(st.treatments);
          const retA = lgxNum(st.retail);
          const clients = lgxNum(st.total);
          const rebooked = lgxNum(st.rebooked);
          const splits = maps.map(m => { const k = canon(st.name); return m[k] == null ? null : m[k]; });

          tot.sa += svcA || 0; tot.ta += txA || 0; tot.ra += retA || 0;
          tot.st += (tg ? tg.services : 0) || 0; tot.tt += (tg ? tg.treatment : 0) || 0; tot.rt += (tg ? tg.retail : 0) || 0;
          tot.c += clients || 0; tot.n += lgxNum(st.newClients) || 0;
          tot.ncr += lgxNum(st.newClientReq) || 0; tot.rb += rebooked || 0;
          tot.tu += lgxNum(st.treatmentUnits) || 0; tot.ru += lgxNum(st.retailUnits) || 0;

          const key = 'st-' + code + '-' + dept + '-' + i;
          mine.push(key);
          rows.push({ key: key, cells: [lgPersonNamePlain(st.name), dept === 'HAIR' ? 'Hair' : 'Beauty']
            .concat(showTargets ? [{ v: tg ? lgxNum(tg.services) : null, fmt: 'aed' }] : [])
            .concat(splits.map(v => ({ v: v, fmt: 'aed' })))
            .concat([lgxChk(svcA, lgxSum(splits), lgxSplitSum(nSplit), 'aed')])
            .concat(showTargets ? [lgxChk(tg ? svcA - tg.services : null, tg ? svcA - tg.services : null,
              A => A('svcMtd') + '-' + A('svcTarget'), 'aed')] : [])
            .concat([{ v: clients, fmt: 'num' },
                     { v: lgxNum(st.newClients != null ? st.newClients : st.newClientReq), fmt: 'num' },
                     { v: lgxNum(st.newClientReq), fmt: 'num' }, { v: rebooked, fmt: 'num' },
                     lgxChk(lgxNum(st.rebookPct), clients ? (rebooked || 0) / clients * 100 : null, rebookF, 'pct'),
                     lgxChk(lgxNum(st.avgBill), clients ? svcA / clients : null, avgF, 'aed')])
            .concat(showTargets ? [{ v: tg ? lgxNum(tg.treatment) : null, fmt: 'aed' }] : [])
            .concat([{ v: txA, fmt: 'aed' },
                     { v: dept === 'BEAUTY' ? null : lgxNum(st.treatmentUnits), fmt: 'num' },
                     dept === 'BEAUTY' ? { v: null, fmt: 'pct' }
                       : lgxChk(lgxNum(st.treatmentPct), svcA ? (txA || 0) / svcA * 100 : null, txPctF, 'pct')])
            .concat(showTargets ? [{ v: tg ? lgxNum(tg.retail) : null, fmt: 'aed' }] : [])
            .concat([{ v: retA, fmt: 'aed' }, { v: lgxNum(st.retailUnits), fmt: 'num' },
                     lgxChk(lgxNum(st.retailPct), (svcA + (retA || 0)) ? (retA || 0) / (svcA + (retA || 0)) * 100 : null, retPctF, 'pct')]) });
        });

      if (mine.length) {
        const first = mine[0], last = mine[mine.length - 1];
        const colSum = key => A => 'SUM(' + A.col(key, first, last) + ')';
        const totSplit = maps.map(m => Object.keys(m).reduce((a, k) => a + m[k], 0));
        rows.push({ key: 'tot-' + code + '-' + dept, total: true,
          cells: ['Totals', '']
            .concat(showTargets ? [lgxChk(tot.st || null, tot.st || null, colSum('svcTarget'), 'aed')] : [])
            .concat(splitCols.map((c, i) => lgxChk(totSplit[i], totSplit[i], colSum(c.key), 'aed')))
            .concat([lgxChk(tot.sa, tot.sa, colSum('svcMtd'), 'aed')])
            .concat(showTargets ? [lgxChk(tot.st ? tot.sa - tot.st : null, tot.st ? tot.sa - tot.st : null,
              A => A('svcMtd') + '-' + A('svcTarget'), 'aed')] : [])
            .concat([lgxChk(tot.c, tot.c, colSum('clients'), 'num'),
                     lgxChk(tot.n, tot.n, colSum('newC'), 'num'),
                     lgxChk(tot.ncr, tot.ncr, colSum('ncr'), 'num'),
                     lgxChk(tot.rb, tot.rb, colSum('rebooked'), 'num'),
                     lgxChk(tot.c ? tot.rb / tot.c * 100 : null, tot.c ? tot.rb / tot.c * 100 : null, rebookF, 'pct'),
                     lgxChk(tot.c ? tot.sa / tot.c : null, tot.c ? tot.sa / tot.c : null, avgF, 'aed')])
            .concat(showTargets ? [lgxChk(tot.tt || null, tot.tt || null, colSum('txTarget'), 'aed')] : [])
            .concat([dept === 'BEAUTY' ? { v: null, fmt: 'aed' } : lgxChk(tot.ta, tot.ta, colSum('txMtd'), 'aed'),
                     dept === 'BEAUTY' ? { v: null, fmt: 'num' } : lgxChk(tot.tu, tot.tu, colSum('txUnit'), 'num'),
                     dept === 'BEAUTY' ? { v: null, fmt: 'pct' }
                       : lgxChk(tot.sa ? tot.ta / tot.sa * 100 : null, tot.sa ? tot.ta / tot.sa * 100 : null, txPctF, 'pct')])
            .concat(showTargets ? [lgxChk(tot.rt || null, tot.rt || null, colSum('retTarget'), 'aed')] : [])
            .concat([lgxChk(tot.ra, tot.ra, colSum('retMtd'), 'aed'),
                     lgxChk(tot.ru, tot.ru, colSum('retUnit'), 'num'),
                     lgxChk((tot.sa + tot.ra) ? tot.ra / (tot.sa + tot.ra) * 100 : null,
                       (tot.sa + tot.ra) ? tot.ra / (tot.sa + tot.ra) * 100 : null, retPctF, 'pct')]) });
      }
    });
  });

  return {
    name: 'Stylist target',
    title: 'Daily Stylist Target',
    subtitle: series.windows.month.label + ' · ex VAT'
      + (showTargets ? '' : ' · no target sheet for this month, so the target columns are out'),
    blocks: [{ cols: cols, rows: rows }],
    legend: [
      ['Services MTD', nSplit ? 'SUM of her ' + (lgGrain === 'daily' ? 'day' : 'week') + ' columns. A blank one is a window she did not work, which is not a zero.' : 'Her services for the month to date.'],
      ['Services variance', 'Services MTD less her target.'],
      ['Rebook %', 'Rebooked / Clients × 100.'],
      ['Avg bill', 'Services MTD / Clients.'],
      ['Treatment %', 'Treatment MTD / Services MTD × 100.'],
      ['Retail %', 'Retail MTD / (Services MTD + Retail MTD) × 100.'],
      ['Totals', 'The sum of the stylist rows in that branch and department, with the ratios rebuilt from the summed parts rather than averaged.'],
      ['A blank target', 'That stylist has no target in ' + ((typeof LEDGER_TARGETS !== 'undefined' && LEDGER_TARGETS) ? LEDGER_TARGETS.source : 'the sheet') + ' — a new starter, or a leaver still carrying history. It is not a zero.'],
      ['Retail here', 'Only what a stylist was credited with. Retail rung against nobody goes to a house account and is deliberately not shared out, so these columns add up to less than the branch Retail Total on the other tabs.'],
    ],
  };
}

/* ══════════════════════════════════════════════════════════════════════════════
   THE COVER TAB

   First tab of the whole-Ledgers workbook. Not decoration: everything on it is a
   thing that has to be known before a figure on any other tab can be read
   correctly — the basis, the window, where each feed comes from, and the two
   reasons the dashboard reads under Phorest's own report.
   ══════════════════════════════════════════════════════════════════════════════ */
function lgxCoverSheet(series, ctx) {
  const w = series.windows;
  const rows = [
    ['Month', w.month.label],
    ['Compared against', w.prev.label],
    ['Split', (lgGrain === 'mtd' ? 'MTD — the month in one column' : (lgGrain === 'weekly' ? 'Weekly — her Week 00 to Week 04' : 'Daily — a column per day'))],
    ['Branches', lgBranchLabel()],
    ['Basis', 'VAT exclusive throughout, which is what every target is set against.'],
    ['Currency', 'AED.'],
    ['Targets', ctx.applies
      ? 'The ' + (typeof LEDGER_TARGETS !== 'undefined' && LEDGER_TARGETS ? lgMonthLabel(LEDGER_TARGETS.month) : 'sheet') + ' target sheet applies to this month, so the target columns are live.'
      : 'The target sheet does not cover this month, so the target columns are out. Actuals only.'],
    ['Exported', new Date().toLocaleString('en-GB')],
    ['', ''],
    ['HOW THE FORMULAS WORK', ''],
    ['Every derived cell is a real formula', 'Change a day and the month, the variance and the group total all move. The figure this dashboard computed is stored alongside as the cached result, so the file opens showing the same numbers as the page.'],
    ['A cell with no formula', 'Its arithmetic could not be reproduced from what is on the tab — a part-loaded month, or a line whose parts are not all there. The figure is still the dashboard’s and is still right; only the working is missing. A formula is never written unless it comes out to the same number.'],
    ['Cross-tab sums', 'The group total tab adds up the branch tabs beside it. Those only appear in a file that has the branch tabs in it — export one section on its own and the same cells carry the figure with no formula.'],
    ['Percentages', 'Stored out of a hundred, formatted with a % sign. So 2.0% is the number 2.0, not 0.02 — which is why a ratio must not be reformatted as an Excel percentage.'],
    ['', ''],
    ['WHERE THE FIGURES COME FROM', ''],
    ['Revenue', 'Phorest’s staff daily export, with retail read off Phorest’s branch TOTAL products line so the house-account share is not lost.'],
    ['Clients, treatment AED, unit counts', 'The daily branch ledger (branch_staff_daily), synced from the branch files.'],
    ['Targets', 'Hand-maintained in ledger-targets.js, from her monthly target sheet.'],
    ['Phorest report tab', 'The Financial Totals report itself, uploaded through the Upload Portal. The outside number, not derived from anything here.'],
    ['', ''],
    ['WHY THIS READS UNDER PHOREST', ''],
    ['Courses', 'Phorest counts courses SOLD. Everything here counts courses PERFORMED, because the staff export offers a "Courses (perf)" column and nothing gives courses sold.'],
    ['Uncredited service', 'These pages sum staff rows, and a row is dropped when it cannot be tied to a person the ledger knows — an assistant, whose work never attributes to a stylist. Report vs dashboard measures both and names what is left.'],
    ['Motor City', 'Hair only, so its beauty rows are absent rather than zero.'],
  ];
  return {
    name: 'How to read this',
    title: 'Tara Rose Salons · Ledgers',
    subtitle: w.month.label + ' · exported from the dashboard',
    blocks: [{ cols: [{ key: 'k', label: 'What' }, { key: 'v', label: 'Which means' }],
               rows: rows.map(([k, v]) => ({ cells: [k, v] })) }],
  };
}

/* ══════════════════════════════════════════════════════════════════════════════
   THE BUTTONS

   A section registers what it can export while it renders, and lgxToolbar then
   draws its three buttons. lgSection calls that for every section it builds, so a
   registered section gets buttons and an unregistered one gets nothing — which is
   why Branch Performance and Stylist Cards, which share the same section chrome,
   are unaffected without knowing anything about this file.
   ══════════════════════════════════════════════════════════════════════════════ */

// section id → { label, build() → { sheets, fileName } }
const LGX_REG = {};

// Cleared at the start of every render, because a stale builder closes over the
// month and the Split it was made under and would export last look's figures.
function lgxResetRegistry() { Object.keys(LGX_REG).forEach(k => { delete LGX_REG[k]; }); }

function lgxRegister(id, label, build) { LGX_REG[id] = { label: label, build: build }; }

function lgxToolbar(id) {
  const e = LGX_REG[id];
  if (!e) return '';
  // stopPropagation on the wrapper: these sit inside the section header, whose own
  // click collapses the section, and a download that folds the table away as it
  // starts reads as the page breaking.
  return '<span class="lgx-bar" onclick="event.stopPropagation()">'
    + '<button type="button" class="lgx-b" onclick="lgxGo(event,\'' + id + '\',\'xlsx\')"'
    + ' title="Excel file — real formulas, number formats, one tab per block">XLSX</button>'
    + '<button type="button" class="lgx-b" onclick="lgxGo(event,\'' + id + '\',\'csv\')"'
    + ' title="CSV — formulas kept, opens anywhere">CSV</button>'
    + '<button type="button" class="lgx-b" onclick="lgxGo(event,\'' + id + '\',\'copy\')"'
    + ' title="Copy for Google Sheets — paste with Ctrl+Shift+V and the formulas arrive as formulas">Sheets</button>'
    + '</span>';
}

// The page-level button: the whole Ledgers section, all four pages, one file.
//
// `ownId` is for a page whose table is not inside a collapsible section — Daily
// Stylist Target is one long table with group rows, so there is no section header
// for lgxToolbar to sit in and its three buttons ride here instead.
function lgxPageBar(ownId) {
  const own = (ownId && LGX_REG[ownId])
    ? '<span class="lgx-own">This table: ' + lgxToolbar(ownId) + '</span>'
    : '';
  return '<div class="lgx-page">' + own
    + '<button type="button" class="lgx-b lgx-b-lg" onclick="lgxWholeLedgers(event)">'
    + 'Whole Ledgers section → one .xlsx, a tab per block</button>'
    + '<span class="lgx-hint">Every block on all four Ledgers pages, formulas live. '
    + 'Drop it in Drive and open with Google Sheets, or open it in Excel.</span>'
    + '</div>';
}

function lgxToast(msg, bad) {
  let el = document.getElementById('lgxToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'lgxToast';
    el.className = 'lgx-toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.toggle('bad', !!bad);
  el.classList.add('on');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('on'), 3600);
}

function lgxSafeName(s) {
  return String(s || 'export').replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
}

function lgxSave(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked late rather than immediately: Safari has been known to cancel the
  // download when the URL goes away in the same tick as the click.
  setTimeout(() => URL.revokeObjectURL(url), 20000);
}

// One button press. Everything is built here rather than at render time, so the
// file is always the month and the Split that are on screen right now.
function lgxGo(event, id, kind) {
  if (event) { event.preventDefault(); event.stopPropagation(); }
  const entry = LGX_REG[id];
  if (!entry) { lgxToast('Nothing registered for this section.', true); return; }
  let out;
  try {
    out = entry.build();
  } catch (e) {
    lgxToast('Could not build that export: ' + e.message, true);
    return;
  }
  const sheets = (out && out.sheets ? out.sheets : []).filter(Boolean);
  if (!sheets.length) { lgxToast('Nothing to export in this section yet.', true); return; }

  const built = lgxBuild({ sheets: sheets });
  const base = lgxSafeName(out.fileName || entry.label);

  if (kind === 'xlsx') {
    lgxSave(lgxXlsxBlob(built), base + '.xlsx');
    lgxToast('Saved ' + base + '.xlsx — ' + built.length + (built.length === 1 ? ' tab' : ' tabs'));
    return;
  }
  if (kind === 'csv') {
    lgxSave(new Blob(['﻿' + lgxCsv(built[0])], { type: 'text/csv;charset=utf-8' }), base + '.csv');
    lgxToast('Saved ' + base + '.csv'
      + (built.length > 1 ? ' — first tab only, a CSV holds one sheet. Use XLSX for all ' + built.length + '.' : ''));
    return;
  }
  const tsv = lgxTsv(built[0]);
  const done = () => lgxToast('Copied. In Google Sheets paste with Ctrl+Shift+V so the formulas arrive as formulas.');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(tsv).then(done, () => lgxCopyFallback(tsv, done));
  } else {
    lgxCopyFallback(tsv, done);
  }
}

// Clipboard permission can be refused, and a page that then says nothing looks
// broken. A hidden textarea and execCommand still work everywhere that matters.
function lgxCopyFallback(text, done) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  ta.remove();
  if (ok) done(); else lgxToast('The browser would not let the page reach the clipboard. Use CSV or XLSX instead.', true);
}

/* ── THE WHOLE LEDGERS SECTION ─────────────────────────────────────────────────
   One file, a tab per block, in the order the nav runs the pages: Financial
   Totals, Daily Target Sheet, Actuals vs Targets, Daily Stylist Target. Async,
   because the Phorest report tab needs a query — and if that comes back empty the
   file is simply built without those two tabs rather than with two empty ones.
   ───────────────────────────────────────────────────────────────────────────── */
async function lgxWholeLedgers(event) {
  if (event) { event.preventDefault(); event.stopPropagation(); }
  lgxToast('Building the whole Ledgers section…');
  try {
    const series = await lgSeries();
    if (!series) { lgxToast('This needs a targets file to know which month to read.', true); return; }
    const ctx = lgLedgerContext(series);
    const w = series.windows;

    await lgLoadClosedDays();
    const ft = lgFtAggregate(await lgLoadFinancialTotals(lgYmd(w.month.from), lgYmd(w.month.to)));
    const monthDays = Math.round((w.month.to - w.month.from) / 86400000) + 1;

    const sheets = [lgxCoverSheet(series, ctx)]
      .concat([lgxModelFinancialsReport(series, ft, monthDays),
               lgxModelFinancialsRecon(series, ft),
               lgxModelFinancialsSales(series),
               lgxModelFinancialsSplit(series),
               lgxModelTargetsPivot(series),
               lgxModelTargetsPace(series, ctx)])
      .concat(lgxModelActuals(series, ctx))
      .concat([lgxModelStylist(series, ctx)])
      .filter(Boolean);

    const built = lgxBuild({ sheets: sheets });
    const name = lgxSafeName('TRS Ledgers — ' + w.month.label + ' — ' + lgBranchLabel());
    lgxSave(lgxXlsxBlob(built), name + '.xlsx');
    lgxToast('Saved ' + name + '.xlsx — ' + built.length + ' tabs.');
  } catch (e) {
    lgxToast('Could not build the workbook: ' + e.message, true);
  }
}

/* ── WHAT EACH PAGE REGISTERS ──────────────────────────────────────────────────
   Called by each renderer before it builds its HTML, because lgxToolbar only
   draws buttons for a section it can already see registered.
   ───────────────────────────────────────────────────────────────────────────── */

function lgxRegisterActuals(series, ctx) {
  lgxResetRegistry();
  const month = series.windows.month.label;
  const order = ['SAA', 'KCA', 'AQ', 'MC'].filter(c => ACTIVE_BRANCHES.includes(c));
  // The group's file carries the branch tabs too — they are what its formulas
  // point at, and a group total whose working reads #REF! is worse than one with
  // no working at all.
  lgxRegister('laAll', 'Group total', () => ({
    sheets: lgxModelActuals(series, ctx),
    fileName: 'TRS Actuals vs Targets — Group total — ' + month,
  }));
  order.forEach(code => {
    const name = (BRANCH_INFO[code] || { name: code }).name;
    lgxRegister('la' + code, name, () => ({
      sheets: [lgxSheetActuals(series, ctx, code, lgxTabName(name), null)],
      fileName: 'TRS Actuals vs Targets — ' + name + ' — ' + month,
    }));
  });
}

function lgxRegisterTargets(series, ctx) {
  lgxResetRegistry();
  const month = series.windows.month.label;
  lgxRegister('ltPivot', 'Benchmarks by branch', () => ({
    sheets: [lgxModelTargetsPivot(series)],
    fileName: 'TRS Daily Target Sheet — Benchmarks — ' + month,
  }));
  lgxRegister('ltPace', 'Pacing', () => ({
    sheets: [lgxModelTargetsPace(series, ctx)],
    fileName: 'TRS Daily Target Sheet — Pacing — ' + month,
  }));
}

function lgxRegisterFinancials(series, ft, monthDays) {
  lgxResetRegistry();
  const month = series.windows.month.label;
  lgxRegister('fnSales', 'This dashboard', () => ({
    sheets: [lgxModelFinancialsSales(series)],
    fileName: 'TRS Financial Totals — Dashboard — ' + month,
  }));
  if (lgSplit(series).key) {
    lgxRegister('fnSplit', 'By ' + (lgGrain === 'daily' ? 'day' : 'week'), () => ({
      sheets: [lgxModelFinancialsSplit(series)],
      fileName: 'TRS Financial Totals — By ' + (lgGrain === 'daily' ? 'day' : 'week') + ' — ' + month,
    }));
  }
  if (ft) {
    lgxRegister('fnReport', 'Phorest report', () => ({
      sheets: [lgxModelFinancialsReport(series, ft, monthDays)],
      fileName: 'TRS Financial Totals — Phorest report — ' + month,
    }));
    lgxRegister('fnRecon', 'Report vs dashboard', () => ({
      sheets: [lgxModelFinancialsRecon(series, ft)],
      fileName: 'TRS Financial Totals — Report vs dashboard — ' + month,
    }));
  }
}

// Daily Stylist Target is one long table rather than a stack of sections, so it
// has nothing for lgxToolbar to attach to. Its page bar carries an extra button.
function lgxRegisterStylist(series, ctx) {
  lgxResetRegistry();
  lgxRegister('lsAll', 'Stylist target', () => ({
    sheets: [lgxModelStylist(series, ctx)],
    fileName: 'TRS Daily Stylist Target — ' + series.windows.month.label,
  }));
}
