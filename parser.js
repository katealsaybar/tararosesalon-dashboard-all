/* ============================================================
   TARA ROSE LADIES SALON — parser.js
   Smart XLSX parser: hunts by stylist name + metric label.
   No hardcoded row/column positions.
   Works across all branches and all weeks.
   ============================================================ */

const SKIP_NAMES   = new Set(['STAFF','TOTALS','TYPE','TYPE ','']);
const BEAUTY_NAMES = new Set(['MIMI','GRACE','SHILA','KIM','KIMBERLY']);

// ── Helpers ──────────────────────────────────────────────────

function parseNum(v) {
  if (v === null || v === undefined) return 0;
  const s = String(v).replace(/AED|,|\s/g,'').trim();
  if (s === '' || s === '#DIV/0!' || s === '#N/A' || s === '#VALUE!') return 0;
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function normLabel(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim().toUpperCase().replace(/\s+/g,' ');
}

// ── Read all rows from a sheet ────────────────────────────────

function getRows(wb, sheetName) {
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { header:1, defval:null });
}

// ── Parse WEEKEND summary sheet ──────────────────────────────
// Reads per-stylist aggregated totals already on the WEEKEND sheet.
// Hunts by stylist name row + column header — zero hardcoded positions.

function parseWeekendSheet(wb) {
  const rows = getRows(wb, 'WEEKEND');
  if (!rows.length) return { hairStaff:[], beautyStaff:[], summary:{} };

  // Step 1: find header rows (contains 'HAIR SALES TAKE' or 'BEAUTY SALES TAKE')
  let hairHdrRowIdx   = -1;
  let beautyHdrRowIdx = -1;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i].map(normLabel);
    if (hairHdrRowIdx   === -1 && row.includes('HAIR SALES TAKE'))   hairHdrRowIdx   = i;
    if (beautyHdrRowIdx === -1 && row.includes('BEAUTY SALES TAKE')) beautyHdrRowIdx = i;
  }

  if (hairHdrRowIdx === -1) return { hairStaff:[], beautyStaff:[], summary:{} };

  // Step 2: build column index map from header row
  // Note: keep FIRST occurrence of duplicate labels (e.g. 'TOTAL' appears multiple times;
  // the first one at col ~7 is the client count total we want)
  function buildColMap(hdrRowIdx) {
    const map = {};
    rows[hdrRowIdx].forEach((cell, idx) => {
      const lbl = normLabel(cell);
      if (lbl && map[lbl] === undefined) map[lbl] = idx; // first occurrence wins
    });
    return map;
  }

  const hairCols   = buildColMap(hairHdrRowIdx);
  const beautyCols = beautyHdrRowIdx !== -1 ? buildColMap(beautyHdrRowIdx) : {};

  // Step 3: read staff rows between header and TOTALS
  function readStaffRows(fromIdx, colMap, isBeauty) {
    const staff = [];
    for (let i = fromIdx + 1; i < rows.length; i++) {
      const row   = rows[i];
      const first = normLabel(row[0]);
      if (!first || SKIP_NAMES.has(first)) continue;
      // Stop when we hit the other section or end markers
      if (!isBeauty && beautyHdrRowIdx !== -1 && i >= beautyHdrRowIdx) break;
      if (first === 'TOTAL CLIENTS' || first === 'NET SALON TAKE') break;

      const get = key => parseNum(row[colMap[key]]);

      if (isBeauty) {
        const total = parseInt(row[colMap['TOTAL']]) || 0;
        const sales = get('BEAUTY SALES TAKE');
        if (total === 0 && sales === 0) continue;
        staff.push({
          name:         String(row[0]).trim(),
          total,
          newClientReq: get('NEW CLIENT REQ'),
          req:          get('REQ'),
          salon:        get('SALON'),
          newC:         get('NEW'),
          rebooked:     get('REBOOKED'),
          rebookPct:    parseNum(row[colMap['REBOOKING %']]) * 100,
          beautySales:  sales,
          beautyNet:    get('BEAUTY SALES TAKE VAT EXCLUSIVE'),
          avgBill:      get('AV.BILL'),
          ncrPct: (get('REQ') + get('SALON')) > 0
            ? (get('REQ') / (get('REQ') + get('SALON'))) * 100 : 0,
        });
      } else {
        const total = parseInt(row[colMap['TOTAL']]) || 0;
        const sales = get('HAIR SALES TAKE');
        if (total === 0 && sales === 0) continue;

        // Retail: look for dedicated RETAIL col, else sum retail sub-cols
        const retailCol = colMap['RETAIL'] ?? colMap['RETAIL AED'] ?? colMap['OTHER RETAIL'] ?? null;
        let retail = retailCol !== null ? parseNum(row[retailCol]) : 0;
        if (!retail) {
          // sum known retail sub-columns
          ['KMR','SKR','ABCR','BWR','OR','OTHER RETAIL'].forEach(k => {
            if (colMap[k] !== undefined) retail += parseNum(row[colMap[k]]);
          });
        }

        // Treatments: look for TREATMENT col, else sum treatment sub-cols
        const treatCol = colMap['TREATMENT'] ?? colMap['TREATMENTS'] ?? null;
        let treatments = treatCol !== null ? parseNum(row[treatCol]) : 0;
        if (!treatments) {
          ['ABCT','OT','FCT','BMD','GB','OTHER - TREATMENT','OTHER TREATMENT'].forEach(k => {
            if (colMap[k] !== undefined) treatments += parseNum(row[colMap[k]]);
          });
        }

        staff.push({
          name:         String(row[0]).trim(),
          total,
          newClientReq: get('NEW CLIENT REQ'),
          req:          get('REQ'),
          salon:        get('SALON'),
          newC:         get('NEW'),
          rebooked:     get('REBOOKED'),
          rebookPct:    parseNum(row[colMap['REBOOKING %']]) * 100,
          hairSales:    sales,
          hairSalesNet: get('HAIR SALES TAKE VAT EXCLUSIVE'),
          avgBill:      get('AV.BILL'),
          col:          get('COL'),
          colPct:       parseNum(row[colMap['COL%']]) * 100,
          cbd:          get('CBD'),
          keratin:      get('KERATIN') || get('Keratin') || 0,
          retail,
          treatments,
          ncrPct: (get('REQ') + get('SALON')) > 0
            ? (get('REQ') / (get('REQ') + get('SALON'))) * 100 : 0,
        });
      }
    }
    return staff;
  }

  const hairStaff   = readStaffRows(hairHdrRowIdx,   hairCols,   false);
  const beautyStaff = beautyHdrRowIdx !== -1
    ? readStaffRows(beautyHdrRowIdx, beautyCols, true)
    : [];

  // Step 4: read summary rows (TOTAL CLIENTS, HAIR RETAIL SALES, etc.)
  const summary = {};
  const SUMMARY_LABELS = {
    'TOTAL CLIENTS':      'totalClients',
    'HAIR RETAIL SALES':  'hairRetail',
    'RETAIL SALES':       'hairRetail',
    'TREATMENT SALES':    'treatmentSales',
    'COL TAKE AED':       'colTake',
    'CBD TAKE AED':       'cbdTake',
    'BEAUTY SALES':       'beautySales',
    'BEAUTY RETAIL SALES':'beautyRetail',
    'NET SALON TAKE':     'netTake',
  };

  for (const row of rows) {
    const lbl = normLabel(row[0]);
    if (!lbl) continue;
    const key = SUMMARY_LABELS[lbl];
    if (key) {
      // First non-zero numeric value in the row (skip col 0)
      for (let c = 1; c < row.length; c++) {
        const n = parseNum(row[c]);
        if (n !== 0) { summary[key] = n; break; }
      }
    }
    if (lbl === 'NET SALON TAKE') {
      // Avg bill is usually col I (8) on this row
      for (let c = 2; c < row.length; c++) {
        const n = parseNum(row[c]);
        if (n > 0 && n < 5000) { summary.avgBill = n; break; } // sanity: avg bill < 5000
      }
    }
  }

  // Fallback: compute hairRetail from staff if not found in summary
  if (!summary.hairRetail && hairStaff.length) {
    summary.hairRetail = hairStaff.reduce((s, st) => s + (st.retail || 0), 0);
    summary._retailSource = 'staff_sum';
  } else {
    summary._retailSource = 'weekend_summary';
  }

  summary.totals = {
    hairSales:    hairStaff.reduce((s, st) => s + (st.hairSales    || 0), 0),
    hairSalesNet: hairStaff.reduce((s, st) => s + (st.hairSalesNet || 0), 0),
    retail:       hairStaff.reduce((s, st) => s + (st.retail       || 0), 0),
    treatments:   hairStaff.reduce((s, st) => s + (st.treatments   || 0), 0),
    total:        hairStaff.reduce((s, st) => s + (st.total        || 0), 0),
    rebooked:     hairStaff.reduce((s, st) => s + (st.rebooked     || 0), 0),
  };

  return { hairStaff, beautyStaff, summary };
}

// ── Parse day sheets for per-day breakdown (optional enrichment) ─
// Hunts by stylist name as column header, reads known metric rows.

function parseDaySheets(wb) {
  const perDay = {};

  for (const dayName of DAY_SHEETS) {
    const rows = getRows(wb, dayName);
    if (!rows.length) continue;

    // Find the row where stylist names are listed as column headers
    let nameRowIdx = -1;
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const row = rows[i];
      // Name row: has 3+ non-null values, first non-null looks like a person name
      const nonNull = row.filter(v => v !== null && v !== undefined && String(v).trim() !== '');
      if (nonNull.length >= 3 && typeof nonNull[0] === 'string' && nonNull[0].length > 1) {
        // Check it's not a date or label row
        const first = normLabel(nonNull[0]);
        if (!['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY',
               'DATE','WEEK','BRANCH'].includes(first)) {
          nameRowIdx = i;
          break;
        }
      }
    }
    if (nameRowIdx === -1) continue;

    // Build stylist → col index map (stylist names every 4 cols)
    const stylistCols = {};
    rows[nameRowIdx].forEach((cell, idx) => {
      const name = cell ? String(cell).trim() : '';
      if (name && !SKIP_NAMES.has(normLabel(name))) {
        stylistCols[name.toUpperCase()] = idx;
      }
    });

    // Find the summary block rows by label in col 0
    // Pattern: repeating label sections per stylist block
    // We look for the FIRST occurrence of each label (they repeat per stylist)
    const labelRows = {};
    const TARGET_LABELS = ['REQUEST','SALON','NEW','NEW CLIENT REQ','COLOUR',
                           'TOTAL','REBOOKED','TOTAL RETAIL','TOTAL RETAIL QTY'];
    for (let i = nameRowIdx + 1; i < rows.length; i++) {
      const lbl = normLabel(rows[i][0]);
      if (TARGET_LABELS.includes(lbl) && labelRows[lbl] === undefined) {
        labelRows[lbl] = i;
      }
    }

    const dayData = {};
    for (const [stylistName, nameCol] of Object.entries(stylistCols)) {
      const countCol  = nameCol + 1; // counts (Request, Salon, etc.)
      const amountCol = nameCol + 3; // amounts (Total $, Retail $, Treatment $)

      const get = (labelKey, col) => {
        const rowIdx = labelRows[labelKey];
        if (rowIdx === undefined) return 0;
        return parseNum(rows[rowIdx][col]);
      };

      dayData[stylistName] = {
        req:        get('REQUEST',         countCol),
        salon:      get('SALON',           countCol),
        newC:       get('NEW',             countCol),
        ncrCount:   get('NEW CLIENT REQ',  countCol),
        colour:     get('COLOUR',          countCol),
        total:      get('TOTAL',           amountCol),
        rebooked:   get('REBOOKED',        amountCol),
        retail:     get('TOTAL RETAIL',    countCol), // Total Retail is at countCol
        treatment:  get('TOTAL RETAIL',    amountCol),
      };
    }
    perDay[dayName] = dayData;
  }
  return perDay;
}

// ── Main exported parser function ────────────────────────────
// Drop-in replacement for the old parseXLSXWeekly() in upload.html

async function parseXLSXWeekly(file) {
  const ab = await file.arrayBuffer();
  const wb = XLSX.read(ab, { type:'array' });

  // Primary: parse WEEKEND sheet (aggregated weekly totals per stylist)
  const { hairStaff, beautyStaff, summary } = parseWeekendSheet(wb);
  
  console.log('=== PARSER DEBUG ===');
  console.log('hairCols snapshot — check if RETAIL is here:');
  console.log('hairStaff[0]:', JSON.stringify(hairStaff[0], null, 2));
  console.log('summary:', JSON.stringify(summary, null, 2));

  // Enrich with per-day breakdown from Monday–Sunday sheets
  // (used for daily retail audit + cross-checking)
  let dailyRetailSum = 0;
  let daysScanned = 0, daysWithRetail = 0;
  const perDayRetail = {};

  for (const dayName of DAY_SHEETS) {
    const rows = getRows(wb, dayName);
    if (!rows.length) continue;
    daysScanned++;

    // Hunt for retail total row in each day sheet
    const RETAIL_LABELS = new Set([
      'RETAIL TOTAL','HAIR RETAIL','RETAIL','RETAIL SALES',
      'PRODUCT SALES','TOTAL RETAIL'
    ]);
    let dayRetail = 0;
    for (const row of rows) {
      const lbl = normLabel(row[0]);
      if (RETAIL_LABELS.has(lbl)) {
        // First numeric value in row after col 0
        for (let c = 1; c < row.length; c++) {
          const n = parseNum(row[c]);
          if (n > 0) { dayRetail += n; break; }
        }
      }
    }
    if (dayRetail > 0) { daysWithRetail++; dailyRetailSum += dayRetail; }
    perDayRetail[dayName] = dayRetail;
  }

  // Retail audit: prefer daily sum if available, flag mismatches
  const summaryRetail = summary.hairRetail || 0;
  let finalRetail = summaryRetail;
  let mismatch = null;

  if (dailyRetailSum > 0) {
    finalRetail = dailyRetailSum;
    if (summaryRetail > 0) {
      const diff    = Math.abs(dailyRetailSum - summaryRetail);
      const pctDiff = diff / Math.max(dailyRetailSum, summaryRetail) * 100;
      if (pctDiff > 1) {
        mismatch = {
          daily:   dailyRetailSum,
          summary: summaryRetail,
          diff,
          pctDiff: +pctDiff.toFixed(2)
        };
      }
    }
  }

  summary.hairRetail   = finalRetail;
  summary._retailDebug = {
    source:        dailyRetailSum > 0 ? 'daily_sum' : 'weekend_summary',
    dailySum:      dailyRetailSum,
    summaryTotal:  summaryRetail,
    daysScanned,
    daysWithRetail,
    perDay:        perDayRetail,
    mismatch
  };

  return { hairStaff, beautyStaff, summary };
}
