// fix-blank-rows.js — re-parses 3 weekly Excel files and patches weekly_data in Supabase
// Run: node fix-blank-rows.js (from dashboard root)

const XLSX    = require('D:/WORK/Claude/claude-cowork-build/node_modules/xlsx');
const https   = require('https');

const SUPA_URL = 'https://gvijxenafoowajqktqvd.supabase.co';
const SUPA_KEY = 'sb_publishable_e5o0vPayb-6552oARTeu7Q_KoqfT7xO';

const TARGETS = [
  { id: '1e53c22d-f40f-46fd-bfbe-cdc2c2fd9742', branch: 'MC',  file: 'C:/Users/user/Downloads/LEDGERS/02 FEB/02 MC/WK 4 (Feb 23 - Mar 1).xlsx' },
  { id: '9762152e-7912-4370-bedd-821144ea2d03', branch: 'KCA', file: 'C:/Users/user/Downloads/LEDGERS/03 MAR/03 MARCH KCA/WEEK 1 (2-8th).xlsx' },
  { id: '37af76ce-fceb-4d4a-bc03-191bc221d09d', branch: 'AQ',  file: 'C:/Users/user/Downloads/LEDGERS/04 APR/4 APRIL al quoz/WK 5 (Apr 27 - May 3) AQ.xlsx' },
];

const SKIP_NAMES = new Set(['STAFF','TOTALS','TYPE','TYPE ','']);
const BEAUTY_NAMES = new Set(['MIMI','GRACE','SHILA','KIM','KIMBERLY']);

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

function parseWeekendSheet(wb) {
  const ws = wb.Sheets['WEEKEND'];
  if (!ws) return { hairStaff:[], beautyStaff:[], summary:{} };
  const rows = XLSX.utils.sheet_to_json(ws, { header:1, defval:null });

  let hairHdrRowIdx = -1, beautyHdrRowIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i].map(normLabel);
    if (hairHdrRowIdx   === -1 && row.includes('HAIR SALES TAKE'))   hairHdrRowIdx   = i;
    if (beautyHdrRowIdx === -1 && row.includes('BEAUTY SALES TAKE')) beautyHdrRowIdx = i;
  }
  if (hairHdrRowIdx === -1) return { hairStaff:[], beautyStaff:[], summary:{} };

  function buildColMap(hdrRowIdx) {
    const map = {};
    rows[hdrRowIdx].forEach((cell, idx) => {
      const lbl = normLabel(cell);
      if (lbl && map[lbl] === undefined) map[lbl] = idx;
    });
    return map;
  }

  const hairCols   = buildColMap(hairHdrRowIdx);
  const beautyCols = beautyHdrRowIdx !== -1 ? buildColMap(beautyHdrRowIdx) : {};

  function readStaffRows(fromIdx, colMap, isBeauty) {
    const staff = [];
    for (let i = fromIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      let first = normLabel(row[0]);

      // ── FIX: blank-name rows with clients → treat as ASSISTANTS ──
      if (!first) {
        const blankTotal = parseInt(row[colMap['TOTAL']]) || 0;
        if (blankTotal > 0) first = 'ASSISTANTS';
        else continue;
      }

      if (SKIP_NAMES.has(first)) continue;
      if (!isBeauty && beautyHdrRowIdx !== -1 && i >= beautyHdrRowIdx) break;
      if (first === 'TOTAL CLIENTS' || first === 'NET SALON TAKE') break;

      const get = key => parseNum(row[colMap[key]]);

      if (isBeauty) {
        const total = parseInt(row[colMap['TOTAL']]) || 0;
        const sales = get('BEAUTY SALES TAKE');
        if (total === 0 && sales === 0) continue;
        staff.push({
          name: first === 'ASSISTANTS' ? 'ASSISTANTS' : String(row[0]).trim(),
          total, newClientReq: get('NEW CLIENT REQ'), req: get('REQ'),
          salon: get('SALON'), newC: get('NEW'), rebooked: get('REBOOKED'),
          rebookBase: get('TOTAL'), beautySales: sales,
        });
      } else {
        const total = parseInt(row[colMap['TOTAL']]) || 0;
        const sales = get('HAIR SALES TAKE');
        if (total === 0 && sales === 0) continue;
        staff.push({
          name: first === 'ASSISTANTS' ? 'ASSISTANTS' : String(row[0]).trim(),
          total, newClientReq: get('NEW CLIENT REQ'), req: get('REQ'),
          salon: get('SALON'), newC: get('NEW'), rebooked: get('REBOOKED'),
          rebookBase: get('TOTAL'), hairSalesNet: get('HAIR SALES TAKE VAT EXCLUSIVE'),
          hairSales: sales, avgBill: get('AV.BILL'), col: get('COL'), cbd: get('CBD'),
        });
      }
    }
    return staff;
  }

  const hairStaff   = readStaffRows(hairHdrRowIdx, hairCols, false);
  const beautyStaff = beautyHdrRowIdx !== -1 ? readStaffRows(beautyHdrRowIdx, beautyCols, true) : [];

  const summary = {};
  const SUMMARY_LABELS = {
    'TOTAL CLIENTS': 'totalClients', 'HAIR RETAIL SALES': 'hairRetail',
    'RETAIL SALES': 'hairRetail', 'TREATMENT SALES': 'treatmentSales',
    'COL TAKE AED': 'colTake', 'BEAUTY SALES': 'beautySales', 'NET SALON TAKE': 'netTake',
  };
  for (const row of rows) {
    const lbl = normLabel(row[0]);
    if (!lbl) continue;
    const key = SUMMARY_LABELS[lbl];
    if (key) {
      for (let c = 1; c < row.length; c++) {
        const n = parseNum(row[c]);
        if (n !== 0) { summary[key] = n; break; }
      }
    }
  }

  return { hairStaff, beautyStaff, summary };
}

function supaRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const url  = new URL(SUPA_URL + path);
    const data = body ? JSON.stringify(body) : null;
    const req  = https.request({
      method, hostname: url.hostname, path: url.pathname + url.search,
      headers: {
        'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY,
        'Content-Type': 'application/json', 'Prefer': 'return=minimal',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      }
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function supaFetch(id) {
  const res = await supaRequest('GET', `/rest/v1/weekly_data?id=eq.${id}&select=*`);
  return JSON.parse(res.body)[0];
}

async function main() {
  for (const t of TARGETS) {
    console.log(`\nProcessing ${t.branch} — ${t.file.split('/').pop()}`);

    // Fetch current record
    const record = await supaFetch(t.id);
    if (!record) { console.log('  ❌ Record not found'); continue; }

    // Parse Excel with fixed parser
    const wb = XLSX.readFile(t.file);
    const { hairStaff, beautyStaff, summary } = parseWeekendSheet(wb);

    const beforeHair = (record.data.hairStaff || []).reduce((a,s) => a+(s.total||0), 0);
    const afterHair  = hairStaff.reduce((a,s) => a+(s.total||0), 0);
    console.log(`  Hair staff total: ${beforeHair} → ${afterHair} (diff: ${afterHair - beforeHair})`);

    // Merge new staff data into existing record data
    const newData = { ...record.data, hairStaff, beautyStaff, summary };

    // Patch Supabase
    const res = await supaRequest('PATCH', `/rest/v1/weekly_data?id=eq.${t.id}`, { data: newData });
    if (res.status >= 200 && res.status < 300) {
      console.log(`  ✅ Updated (HTTP ${res.status})`);
    } else {
      console.log(`  ❌ Failed (HTTP ${res.status}): ${res.body}`);
    }
  }
  console.log('\nDone. Refresh the dashboard to see updated breakdown.');
}

main().catch(console.error);
