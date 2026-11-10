// Report downloads (Kate, 10 Nov 2026): every dashboard report gets an XLSX and a CSV button. Staff's 13 Week was the first.
// One place for it, so the next page is a model and a button, not a new writer:
//   1. the page draws rexButtons('myExportFn') somewhere in its toolbar;
//   2. myExportFn() returns { name: 'file-name-without-extension', sheets: [ lgx sheet model ] } (the model is described at the top of ledger-export.js:
//      Sheet { name, title, subtitle, blocks:[{ cols:[{ key, label, fmt }], rows:[{ key, total, cells }] }], legend }).
// The XLSX is the whole workbook, formulas and number formats intact. The CSV is one tab, the first or the one the model's csv index names (a CSV holds one sheet), figures only: no title
// lines above the headings and no formulas, so it opens cleanly in anything. The writers are ledger-export.js's (lgx*), loaded on first click.
function rexButtons(fn) {
  return `<span class="rex-bar" role="group" aria-label="Download this report">
    <button type="button" class="sc-btn rex-btn" title="Download as an Excel file" onclick="rexRun('${fn}','xlsx',this)">XLSX</button>
    <button type="button" class="sc-btn rex-btn" title="Download as a CSV file" onclick="rexRun('${fn}','csv',this)">CSV</button>
  </span>`;
}

function rexToast(msg, bad) {
  if (typeof lgxToast === 'function') lgxToast(msg, bad);
  else alert(msg);
}

// The date a file is saved, in Dubai time, so a download at 1 am is still that day.
const rexToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' });

async function rexRun(fn, kind, btn) {
  if (btn) btn.disabled = true;
  try {
    if (typeof lgxBuild !== 'function' && typeof trsLazy === 'function') await trsLazy('lgx');
    if (typeof lgxBuild !== 'function') throw new Error('The spreadsheet writer did not load');
    const m = window[fn] && window[fn]();
    if (!m || !m.sheets || !m.sheets.length) { rexToast('Nothing to download yet. Wait for the page to finish loading.', true); return; }
    const base = m.name + '-' + rexToday();
    if (kind === 'xlsx') {
      const built = lgxBuild({ sheets: m.sheets });
      lgxSave(lgxXlsxBlob(built), base + '.xlsx');
      rexToast('Saved ' + base + '.xlsx' + (built.length > 1 ? ' · ' + built.length + ' tabs' : ''));
    } else {
      // Figures only: drop the title lines and every formula, keep the headings and the rows.
      const ci = (m.csv >= 0 && m.csv < m.sheets.length) ? m.csv : 0;
      const flat = m.sheets.slice(ci, ci + 1).map(s => Object.assign({}, s, { title: null, subtitle: null, legend: null,
        blocks: (s.blocks || []).filter(Boolean).map(b => Object.assign({}, b, { title: null, note: null, legend: null,
          rows: (b.rows || []).map(r => (r && r.cells) ? Object.assign({}, r, { cells: r.cells.map(c => (c && typeof c === 'object') ? { v: c.v, fmt: c.fmt } : c) }) : r) })) }));
      const built = lgxBuild({ sheets: flat });
      lgxSave(new Blob(['﻿' + lgxCsv(built[0])], { type: 'text/csv;charset=utf-8' }), base + '.csv');
      rexToast('Saved ' + base + '.csv' + (m.sheets.length > 1 ? ' · the “' + m.sheets[ci].name + '” tab only, a CSV holds one sheet. Use XLSX for all ' + m.sheets.length + '.' : ''));
    }
  } catch (e) {
    console.error(e);
    rexToast('The download did not work. Try again.', true);
  } finally {
    if (btn) btn.disabled = false;
  }
}
