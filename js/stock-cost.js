// Stock Cost (Kate, 12 Nov 2026): the "Stock Cost 2026" Excel as a page that fills itself. Per UAE salon, per month: stock spend against income,
// against that salon's max to spend (the Excel's 10%).
//   Income      Phorest, ex VAT: services + courses + products, every day (financial_totals).
//   Stock       Phorest stock orders that ARRIVED, at the Stock List cost, by arrival month (stock_order_lines): Hair Retail, Hair Professional,
//               Beauty Retail, Beauty Professional. Order lines with no Stock List price are not counted; the "!" says how many.
//   Consumables not in Phorest: Accounts' monthly P&L, "Total for Consumables" (stock_cost_consumables, loaded by scripts/spend/load_pnl_consumables.py).
//   Max to spend one % per salon, changed by Kate only (stock_cost_cap_set), every change kept for good (the triangle lists who changed it).
// Branch and Period are the dashboard's own sticky header filter: this page draws no filter bar of its own. The figures are by whole month, so a
// Period shows every month it touches. Two views: Visual (stacked bars by month, donut, the five lines; click a colour to look at one line alone)
// and Table (the Excel's layout). Click a stock figure to see the order lines behind it.
// Level 3 and up on screen (2 and up in the database's numbers); the functions refuse anyone else, whatever this file does.
// Drawn inside a shadow root: the dashboard's colour tokens reach in (custom properties inherit); the tip and the order-lines dialog sit beside
// .stage, not inside it, because a container-type box would trap their position: fixed.
(function () {
  const B = ['SAA', 'KCA', 'MC', 'AQ'];
  const BN = { SAA: 'Saadiyat', KCA: 'Khalifa City A', MC: 'Motor City', AQ: 'Al Quoz' };
  const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  // a month row from stock_cost_report(): [days with income, services + courses, products, hair retail, hair professional, beauty retail, beauty professional, consumables or null, lines with no price]
  const LINES = [['hr', 'Hair Retail', '--c-hr'], ['hp', 'Hair Professional', '--c-hp'], ['br', 'Beauty Retail', '--c-br'], ['bp', 'Beauty Professional', '--c-bp'], ['cons', 'Consumables', '--c-co']];

  const CSS = `
:host{display:block}
*{box-sizing:border-box}
.stage{container-type:inline-size;color:var(--text);font:inherit;
  --ok:var(--good,#0F8A72);--over:var(--bad,#B3322F);--tri:var(--warn,#E08A00);--gx:28px;
  --c-hr:#2BB89E;--c-hp:#7B67D8;--c-br:#E0645F;--c-bp:#C9A227;--c-co:#8C8A95}
.stage.dk{--c-hr:#99F6E4;--c-hp:#C4B5FD;--c-br:#FF9B9B;--c-bp:#EEF3C7;--c-co:#9A98A6}
@container (max-width:900px){.pg{--gx:18px}}
@container (max-width:760px){.pg{--gx:10px}}
.pg{padding:10px var(--gx) 48px}
button,select,textarea,input{font:inherit;color:inherit}
.msg{padding:30px 0;color:var(--muted);font-size:14px}
h1.t{margin:0 0 4px;font-size:clamp(22px,4cqi,28px);font-weight:600;letter-spacing:-.01em;line-height:1.15}
.sub{margin:0 0 14px;color:var(--muted);max-width:90ch;font-size:14px}
.warnbox{margin:0 0 12px;padding:9px 14px;border-radius:10px;background:var(--warn-bg,#FAEEDA);color:var(--warn,#8A5A0C);font-size:13.5px}

/* salon cards */
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px;margin:0 0 18px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px 16px;display:flex;flex-direction:column;gap:8px;min-width:0}
.card .nm{font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}
.card .big{font-size:34px;font-weight:600;letter-spacing:-.02em;line-height:1;font-variant-numeric:tabular-nums}
.card .big small{font-size:15px;font-weight:500;color:var(--muted);margin-left:3px}
.card .big.over{color:var(--over)}.card .big.ok{color:var(--ok)}.card .big.na{color:var(--muted2)}
.bar{position:relative;height:8px;border-radius:999px;background:var(--surface2)}
.bar i{position:absolute;left:0;top:0;bottom:0;border-radius:999px;background:var(--ok)}
.bar i.over{background:var(--over)}
.bar u{position:absolute;top:-4px;bottom:-4px;width:2px;background:var(--text);text-decoration:none}
.card .st{font-size:13px;line-height:1.4}.card .st b{font-weight:700}.card .st.over b{color:var(--over)}.card .st.ok b{color:var(--ok)}
.card .meta{font-size:12px;color:var(--muted2);font-variant-numeric:tabular-nums;line-height:1.45}
.card .cap{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted);border-top:1px solid var(--border2);padding-top:8px;margin-top:auto;position:relative}
.cap button{border:1px solid var(--border);background:var(--surface2);border-radius:999px;padding:2px 10px;font-size:12px;font-weight:600;color:var(--text);cursor:pointer}
.cap button[disabled]{cursor:default;color:var(--muted);border-style:dashed}
.cap .tri{position:absolute;right:-4px;bottom:-4px;width:0;height:0;border-style:solid;border-width:0 0 12px 12px;border-color:transparent transparent var(--tri) transparent;cursor:help}
.cap input{width:54px;border:1px solid var(--text);border-radius:8px;padding:2px 6px;font-size:13px;background:var(--surface);text-align:right}

/* toolbar */
.tools{display:flex;gap:10px 14px;flex-wrap:wrap;align-items:center;justify-content:space-between;margin:0 0 10px}
.tools .cnt{color:var(--muted);font-size:13px}
.tools .btns{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.seg{display:inline-flex;border:1px solid var(--border);border-radius:999px;background:var(--surface);overflow:hidden}
.seg button{border:0;background:none;padding:7px 14px;font-size:13px;cursor:pointer;color:var(--muted);white-space:nowrap}
.seg button[aria-pressed="true"]{background:var(--accent);color:var(--accent-fg)}
.pill,.dl button{border:1px solid var(--border);background:var(--surface);border-radius:999px;padding:6px 16px;font-size:13px;font-weight:600;cursor:pointer}
.pill:hover,.dl button:hover{border-color:var(--muted2)}
.dl{display:inline-flex;gap:8px}

/* the sheet */
.sheetbox{background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden}
.xw{overflow:auto;position:relative}
table.xt{border-collapse:separate;border-spacing:0;font-size:13px;font-variant-numeric:tabular-nums;width:max-content;min-width:100%}
.xt th{position:sticky;top:0;z-index:3;background:var(--surface2);font-size:12px;font-weight:600;color:var(--muted);padding:7px 9px;text-align:right;border-bottom:1px solid var(--border);vertical-align:bottom;line-height:1.25;white-space:nowrap}
.xt th.wrap{white-space:normal;min-width:84px}
.xt th small{display:block;font-weight:400;color:var(--muted2);font-size:11px}
.xt th.grp{text-align:center;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted2);border-bottom:1px solid var(--border2);padding:6px 12px;border-left:1px solid var(--border2)}
.xt tr.h2 th{top:31px}
.xt td{padding:7px 9px;border-bottom:1px solid var(--border2);text-align:right;white-space:nowrap;background:var(--surface);vertical-align:middle}
.xt td.l,.xt th.l{text-align:left}
.xt .c-mo{position:sticky;left:0;z-index:2;min-width:118px;width:118px;box-shadow:1px 0 0 var(--border);font-weight:600}
.xt th.c-mo{z-index:4}
.xt .sepl{border-left:1px solid var(--border2)}
.xt td .p{display:block;font-size:11px;color:var(--muted2);line-height:1.2}
.xt td.num a{color:inherit;text-decoration:none;border-bottom:1px dotted var(--muted2);cursor:pointer}
.xt td.num a:hover{color:var(--text);border-bottom-style:solid}
.xt tr.sel td{background:color-mix(in srgb,var(--ok) 9%,var(--surface))}
.xt tr.empty td{color:var(--muted2)}
.xt tr.tot td{background:var(--surface2);font-weight:700;border-top:1px solid var(--border);border-bottom:0}
.xt tr.tot td .p{font-weight:400}
.flag{display:inline-grid;place-items:center;margin-left:6px;width:16px;height:16px;border-radius:50%;background:var(--warn-bg,#FAEEDA);color:var(--warn,#8A5A0C);font-size:11px;font-weight:700;cursor:pointer;font-style:normal}
.mtd{font-weight:400;color:var(--muted2);font-size:11px;display:block;line-height:1.2}
.chip{display:inline-block;border-radius:999px;padding:2px 10px;font-size:12px;font-weight:600}
.chip.ok{background:color-mix(in srgb,var(--ok) 20%,transparent);color:var(--ok)}
.chip.over{background:color-mix(in srgb,var(--over) 18%,transparent);color:var(--over)}
.dash{color:var(--muted2)}

/* visual view */
.vwrap{display:grid;grid-template-columns:minmax(0,1fr);gap:14px}
.vwrap>*,.vpair>*,.cards>*,.howto>*{min-width:0}
.vcard{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px 18px 14px}
.vcard h2{margin:0 0 2px;font-size:15px;font-weight:600}
.vcard .vs{margin:0 0 10px;font-size:12.5px;color:var(--muted)}
.legend{display:flex;flex-wrap:wrap;gap:6px 12px;margin:0 0 8px;font-size:12.5px;color:var(--muted)}
.legend span{display:inline-flex;align-items:center;gap:6px}
.legend i{width:11px;height:11px;border-radius:3px;display:inline-block}
.legend i.dash2{width:18px;height:0;border-top:2px dashed var(--text);border-radius:0}
.legend button.lg{border:1px solid transparent;background:none;border-radius:999px;padding:3px 10px 3px 6px;font-size:12.5px;color:var(--muted);cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.legend button.lg:hover{border-color:var(--border);color:var(--text)}
.legend button.lg.on{border-color:var(--text);color:var(--text);font-weight:600}
.legend button.lg.dim{opacity:.45}
.focusp{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;margin:0 0 10px;padding:8px 12px;border:1px solid var(--border);border-radius:10px;background:var(--surface2);font-size:14px}
.chartw{overflow-x:auto}
.chartw svg{display:block;width:100%;min-width:680px;height:auto}
.chartw text{font-family:inherit;fill:var(--muted);font-size:11px}
.chartw .tot{fill:var(--text);font-weight:700;font-size:11.5px}
.chartw .tot.over{fill:var(--over)}
.chartw .grid{stroke:var(--border2);stroke-width:1}
.chartw .band{fill:color-mix(in srgb,var(--ok) 9%,transparent)}
.chartw .hit{fill:transparent;cursor:pointer}
.chartw .hit:hover{fill:color-mix(in srgb,var(--text) 6%,transparent)}
.chartw .segr{cursor:pointer}
.chartw .segr:hover{filter:brightness(1.12);stroke:var(--text);stroke-width:1.5}
.chartw .capl{stroke:var(--text);stroke-width:1.6;stroke-dasharray:6 5}
.chartw .capt{fill:var(--text);font-weight:600}
.chartw .mlab.sel{fill:var(--text);font-weight:700}
.vnote{margin:10px 0 0;font-size:12.5px;color:var(--muted)}
.vpair{display:grid;grid-template-columns:minmax(0,380px) minmax(0,1fr);gap:14px;align-items:stretch}
.vcard.don{display:flex;flex-direction:column}
.donw{position:relative;width:min(100%,250px);margin:6px auto 0}
.donw svg{display:block;width:100%;height:auto;transform:rotate(-90deg)}
.donw circle.seg{fill:none;stroke-width:30;cursor:pointer;transition:opacity .15s}
.donw circle.seg:hover{stroke-width:34}
.donw circle.seg.dim{opacity:.18}
.donc{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;pointer-events:none;line-height:1.25}
.donc b{font-size:18px;font-weight:600;letter-spacing:-.01em;font-variant-numeric:tabular-nums}
.donc span{font-size:12px;color:var(--muted)}
.donc em{font-style:normal;font-size:12px;color:var(--muted2);margin-top:2px}
.dlist{display:flex;flex-wrap:wrap;justify-content:center;gap:4px 14px;margin:14px 0 0;font-size:12px;color:var(--muted)}
.dlist span{display:inline-flex;align-items:center;gap:6px}.dlist i{width:10px;height:10px;border-radius:3px;display:inline-block}
.split{display:grid;gap:10px}
.srow{display:grid;grid-template-columns:170px minmax(0,1fr) 260px;gap:12px;align-items:center;font-size:13px}
.srow.clk{cursor:pointer;border-radius:10px;padding:4px 6px;margin:0 -6px}
.srow.clk:hover{background:var(--surface2)}
.srow.one{padding-top:10px;padding-bottom:10px}
.srow .nm{display:flex;align-items:center;gap:8px;font-weight:600}
.srow .nm i{width:11px;height:11px;border-radius:3px;display:inline-block;flex-shrink:0}
.srow .tr{height:14px;border-radius:999px;background:var(--surface2);overflow:hidden}
.srow .tr b{display:block;height:100%;border-radius:999px}
.srow .vl{text-align:right;font-variant-numeric:tabular-nums}
.srow .vl a{color:inherit;text-decoration:none;border-bottom:1px dotted var(--muted2);cursor:pointer;font-weight:600}
.srow .vl span{display:block;font-size:11.5px;color:var(--muted2)}
@container (max-width:900px){.vpair{grid-template-columns:minmax(0,1fr)}}
@container (max-width:760px){
  .srow{grid-template-columns:minmax(0,1fr);gap:4px}.srow .vl{text-align:left}.xt .c-mo{min-width:96px;width:96px}
  .cards{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.card{padding:12px}.card .big{font-size:28px}.card .st{font-size:12.5px}
  .tools{flex-direction:column;align-items:stretch}.tools .btns{justify-content:space-between}
  .vcard{padding:14px 12px 12px}.chartw svg{min-width:0}
  .legend{gap:4px 6px}.legend button.lg{padding:4px 9px 4px 6px}
  .howto{grid-template-columns:minmax(0,1fr)}
  .xt td,.xt th{padding:7px 7px}
}
.msheet{position:fixed;left:8px;right:8px;bottom:8px;z-index:230;background:var(--text);color:var(--bg);border-radius:14px;padding:12px 14px;font-size:13px;line-height:1.5;box-shadow:0 8px 28px rgba(0,0,0,.35);display:none}
.msheet.on{display:block}
.msheet .x{float:right;border:0;background:none;color:inherit;font-size:13px;font-weight:600;cursor:pointer;padding:0 0 6px 12px}

/* how to read */
.howh{margin:22px 0 10px;font-size:13px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--muted)}
.howto{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px}
.howto div{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:11px 14px;font-size:14px;line-height:1.45;color:var(--text)}
.howto div>b{display:block;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin-bottom:3px}

.tip{position:fixed;z-index:200;max-width:300px;background:var(--text);color:var(--bg);border-radius:10px;padding:9px 12px;font-size:12.5px;line-height:1.5;box-shadow:0 8px 24px rgba(0,0,0,.25);pointer-events:none;display:none}
.tip b{display:block;margin-bottom:4px}
#toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:var(--accent);color:var(--accent-fg);padding:9px 18px;border-radius:999px;font-size:13px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,.25);opacity:0;pointer-events:none;transition:opacity .2s;z-index:210}
#toast.on{opacity:1}

/* the order lines behind a figure */
.mdl{position:fixed;inset:0;z-index:240;background:rgba(26,26,26,.45);display:none;align-items:center;justify-content:center;padding:16px}
.mdl.on{display:flex}
.mdl-in{width:min(900px,100%);max-height:88vh;overflow:auto;background:var(--surface);color:var(--text);border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,.3);padding:18px 20px}
.mdl-in h2{margin:0 0 4px;font-size:18px}
.mdl-in p{margin:0 0 10px;color:var(--muted);font-size:13.5px}
.mdl-in table{border-collapse:collapse;width:100%;font-size:13px;font-variant-numeric:tabular-nums}
.mdl-in th{position:sticky;top:0;background:var(--surface2);text-align:right;font-size:12px;color:var(--muted);padding:6px 8px;border-bottom:1px solid var(--border)}
.mdl-in td{padding:6px 8px;border-bottom:1px solid var(--border2);text-align:right;vertical-align:top}
.mdl-in th.l,.mdl-in td.l{text-align:left}
.mdl-in tr.t td{font-weight:700;background:var(--surface2)}
.mdl-x{float:right}

/* the site's one scrollbar (css/scrollbars.css) repeated here, because that sheet cannot reach inside a shadow root: thin, no arrows, no track, a soft pill in the colour of the text */
*{scrollbar-width:thin;scrollbar-color:color-mix(in srgb,var(--text) 30%,transparent) transparent}
@supports selector(::-webkit-scrollbar){
  *{scrollbar-width:auto;scrollbar-color:auto}
  *::-webkit-scrollbar{width:10px;height:10px;background:transparent}
  *::-webkit-scrollbar-track,*::-webkit-scrollbar-corner{background:transparent}
  *::-webkit-scrollbar-button{display:none;width:0;height:0}
  *::-webkit-scrollbar-thumb{background:color-mix(in srgb,var(--text) 30%,transparent);background-clip:padding-box;border:3px solid transparent;border-radius:999px;min-height:40px;min-width:40px}
  *::-webkit-scrollbar-thumb:hover,*::-webkit-scrollbar-thumb:active{background:color-mix(in srgb,var(--text) 55%,transparent);background-clip:padding-box}
}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
`;

  /* ---------- state ---------- */
  let host = null, root = null, wired = false, themeObs = null, sizeObs = null;
  let _v = 'visual'; try { _v = localStorage.getItem('trs-stockcost-view') || 'visual'; } catch (e) { /* default */ }
  const S = { d: null, caps: {}, capLog: {}, access: { edit: false }, year: null, asof: null, brs: B.slice(), ids: [], view: _v === 'table' ? 'table' : 'visual', focus: null, editing: null, loadedAt: 0, loadedKey: '', last: -1, phone: false };
  const $ = id => root.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => Math.round(n).toLocaleString('en-US');
  const pc = n => (Math.round(n * 10) / 10).toFixed(1) + '%';
  const pad = n => (n < 10 ? '0' : '') + n;
  const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const dmy = s => { const p = String(s || '').slice(0, 10).split('-'); return p.length === 3 ? (+p[2]) + ' ' + MON[+p[1] - 1].slice(0, 3) + ' ' + p[0] : ''; };
  const fmtAt = s => { const d = new Date(s); return isNaN(d) ? '' : d.getDate() + ' ' + MON[d.getMonth()].slice(0, 3) + ', ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const dim = (y, m) => new Date(y, m + 1, 0).getDate();
  let toastT = 0;
  function toast(t) { const e = $('toast'); e.textContent = t; e.className = 'on'; clearTimeout(toastT); toastT = setTimeout(() => { e.className = ''; }, 3600); }

  /* ---------- the global header filter ---------- */
  function wantBranches() {
    try { const b = sel.branch; if (Array.isArray(b) && !b.includes('all')) { const x = b.filter(c => B.includes(c)); if (x.length) return x; } } catch (e) { /* All */ }
    return B.slice();
  }
  function wantWindow() {
    try {
      if (typeof activePeriodKey === 'function' && activePeriodKey() === 'All time') return { from: '2000-01-01', to: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' }) };
      if (typeof dateFrom !== 'undefined' && typeof dateTo !== 'undefined' && dateFrom && dateTo) return { from: iso(dateFrom), to: iso(dateTo) };
    } catch (e) { /* the window is not known yet: the page reads its own default */ }
    return { from: null, to: null };
  }
  // The year and the months the Period touches (the figures are by whole month).
  function wantMonths() {
    const w = wantWindow(), today = new Date();
    if (!w.from) return { year: today.getFullYear(), ids: [today.getMonth()] };
    const f = new Date(w.from + 'T00:00:00'), t = new Date(w.to + 'T00:00:00'), year = t.getFullYear();
    const m0 = f.getFullYear() < year ? 0 : f.getMonth(), m1 = t.getMonth(), ids = [];
    for (let i = m0; i <= m1; i++) ids.push(i);
    return { year, ids };
  }
  const brLabel = () => S.brs.length === B.length ? 'All four UAE salons' : S.brs.map(b => BN[b]).join(' + ');

  /* ---------- the numbers ---------- */
  function mon(b, i) {
    const r = S.d[b] && S.d[b][i]; if (!r || !r[0]) return null;      // no income days = no data for the month
    const c = r[7], cl = c !== null && c !== undefined;
    const inc = +r[1] + +r[2], stock = +r[3] + +r[4] + +r[5] + +r[6] + (cl ? +c : 0);
    return { d: r[0], svc: +r[1], prod: +r[2], inc, hr: +r[3], hp: +r[4], br: +r[5], bp: +r[6], cons: cl ? +c : null, stock, un: r[8] || 0 };
  }
  function sum(bs, ids) {
    const t = { svc: 0, prod: 0, inc: 0, hr: 0, hp: 0, br: 0, bp: 0, cons: 0, stock: 0, un: 0, consMissing: false, any: false };
    bs.forEach(b => ids.forEach(i => {
      const m = mon(b, i); if (!m) return; t.any = true;
      ['svc', 'prod', 'inc', 'hr', 'hp', 'br', 'bp', 'stock', 'un'].forEach(k => { t[k] += m[k]; });
      if (m.cons === null) t.consMissing = true; else t.cons += m.cons;
    }));
    return t;
  }
  const lineVal = (t, k) => k === 'cons' ? t.cons : t[k];
  const capOf = bs => bs.reduce((a, b) => a + (+S.caps[b] || 10), 0) / bs.length;
  const consNone = t => t.consMissing && t.cons === 0;
  function lastMonth() { let l = -1; for (let i = 0; i < 12; i++) if (S.brs.some(b => mon(b, i))) l = i; return l; }
  const mlabel = i => { const dd = Math.max(0, ...S.brs.map(b => { const m = mon(b, i); return m ? m.d : 0; })); return MON[i].slice(0, 3) + (i === S.last && dd && dd < dim(S.year, i) ? ' (' + dd + 'd)' : ''); };
  function perShort() {
    const a = S.ids[0], z = S.ids[S.ids.length - 1];
    if (a === undefined) return String(S.year);
    if (a === 0 && z >= 9 && S.ids.length >= 10) return S.ids.length === 12 ? 'Year ' + S.year : 'January to ' + MON[z] + ' ' + S.year;
    return a === z ? MON[a] + ' ' + S.year : MON[a] + ' to ' + MON[z] + ' ' + S.year;
  }

  /* ---------- the visual view ---------- */
  const swatch = c => '<i style="display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:7px;background:var(' + c + ');box-shadow:0 0 0 1px rgba(128,128,128,.55)"></i>';
  function cardHtml(b) {
    const t = sum([b], S.ids), cap = +S.caps[b] || 10, pct = t.inc ? t.stock / t.inc * 100 : null, over = pct !== null && pct > cap, left = t.inc * cap / 100 - t.stock;
    const width = pct === null ? 0 : Math.min(100, pct / (cap * 1.5) * 100), tick = 100 / 1.5, cls = pct === null ? 'na' : over ? 'over' : 'ok', L = S.capLog[b];
    const capEl = S.editing === b ? '<input id="capIn" type="text" inputmode="decimal" value="' + cap + '" aria-label="Max to spend, percent"> %'
      : '<button type="button" data-cap="' + b + '"' + (S.access.edit ? '' : ' disabled') + ' title="' + (S.access.edit ? 'Change the max for ' + BN[b] : 'Only Kate can change this') + '">' + cap + '%</button>';
    const tri = L ? '<span class="tri" tabindex="0" data-tip="' + esc((L.by || 'Someone') + ' changed the max from ' + L.from + '% to ' + L.to + '%, ' + fmtAt(L.at)) + '"></span>' : '';
    return '<div class="card"><div class="nm">' + BN[b] + '</div><div class="big ' + cls + '">' + (pct === null ? '&ndash;' : pc(pct).replace('%', '')) + '<small>%</small></div>' +
      '<div class="bar"><i class="' + (over ? 'over' : '') + '" style="width:' + width + '%"></i><u style="left:' + tick + '%"></u></div>' +
      '<div class="st ' + cls + '">' + (pct === null ? 'No data in this Period' : over ? '<b>' + (pct - cap).toFixed(1) + ' points over</b> the max, AED ' + fmt(-left) + ' too much' : '<b>' + (cap - pct).toFixed(1) + ' points under</b> the max, AED ' + fmt(left) + ' left') + '</div>' +
      '<div class="meta">Stock AED ' + fmt(t.stock) + ' of income AED ' + fmt(t.inc) + (t.consMissing ? (t.cons === 0 ? '<br>Consumables not in the P&amp;L yet for this Period' : '<br>Consumables up to the last P&amp;L month only') : '') + '</div>' +
      '<div class="cap"><span>Max to spend</span>' + capEl + tri + '</div></div>';
  }
  function visualHtml() {
    const F = S.focus, FL = F ? LINES.find(x => x[0] === F) : null, brs = S.brs, capv = capOf(brs), sel = new Set(S.ids);
    const PH = S.phone, W = PH ? 360 : 980, H = PH ? 270 : 320, L = PH ? 30 : 46, R = PH ? 6 : 14, T = PH ? 20 : 22, Bt = PH ? 26 : 40, iw = W - L - R, ih = H - T - Bt, slot = iw / 12, bw = slot * (PH ? 0.62 : 0.56);
    const data = [...Array(12).keys()].map(i => ({ i, t: sum(brs, [i]) }));
    const pctOf = t => t.inc ? (F ? lineVal(t, F) : t.stock) / t.inc * 100 : 0;
    let ymax = F ? Math.max(1, ...data.map(d => d.t.any ? pctOf(d.t) : 0)) * 1.25 : Math.max(capv * 1.35, ...data.map(d => d.t.any ? pctOf(d.t) : 0)) * 1.1;
    ymax = F ? Math.ceil(ymax) : Math.ceil(ymax / 2) * 2;
    const y = v => T + ih - (v / ymax) * ih, step = F ? (ymax > 8 ? 2 : 1) : (ymax > 16 ? 4 : 2);
    let g = '';
    for (let v = 0; v <= ymax; v += step) g += '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text x="' + (L - (PH ? 4 : 8)) + '" y="' + (y(v) + 4) + '" text-anchor="end"' + (PH ? ' style="font-size:9px"' : '') + '>' + v + (PH ? '' : '%') + '</text>';
    data.forEach(d => { if (sel.has(d.i)) g += '<rect class="band" x="' + (L + slot * d.i + 2) + '" y="' + (T - 6) + '" width="' + (slot - 4) + '" height="' + (ih + Bt - 4) + '" rx="8"/>';
      g += '<rect class="hit" data-m="' + d.i + '" x="' + (L + slot * d.i) + '" y="' + (T - 6) + '" width="' + slot + '" height="' + (ih + Bt) + '"/>'; });
    data.forEach(d => {
      const cx = L + slot * d.i + slot / 2;
      if (!d.t.any) g += '<text x="' + cx + '" y="' + (y(0) - 8) + '" text-anchor="middle" style="fill:var(--muted2);pointer-events:none' + (PH ? ';font-size:8px' : '') + '">' + (PH ? '-' : 'no data') + '</text>';
      else if (F === 'cons' && consNone(d.t)) g += '<text x="' + cx + '" y="' + (y(0) - 8) + '" text-anchor="middle" style="fill:var(--muted2);pointer-events:none' + (PH ? ';font-size:8px' : '') + '">' + (PH ? '-' : 'not in P&amp;L') + '</text>';
      else {
        let acc = 0;
        (F ? [FL] : LINES).forEach(([k, n, c]) => { const v = lineVal(d.t, k) / d.t.inc * 100; if (!(v > 0)) return;
          g += '<rect class="segr" data-line="' + k + '" data-m="' + d.i + '" x="' + (cx - bw / 2) + '" y="' + y(acc + v) + '" width="' + bw + '" height="' + Math.max(0, y(acc) - y(acc + v) - (F ? 0 : 1)) + '" rx="2" fill="var(' + c + ')"></rect>'; acc += v; });
        const over = !F && acc > capv;
        g += '<text class="tot' + (over ? ' over' : '') + '" x="' + cx + '" y="' + (y(acc) - (PH ? 4 : 6)) + '" text-anchor="middle" style="pointer-events:none' + (PH ? ';font-size:8.5px' : '') + '">' + (PH ? acc.toFixed(1) : acc.toFixed(1) + '%') + (!F && d.t.consMissing ? '*' : '') + '</text>';
      }
      g += '<text class="mlab' + (sel.has(d.i) ? ' sel' : '') + '" x="' + cx + '" y="' + (H - 14) + '" text-anchor="middle" style="pointer-events:none' + (PH ? ';font-size:9.5px' : '') + '">' + (PH ? MON[d.i].slice(0, 1) : mlabel(d.i)) + '</text>';
    });
    if (!F) g += '<line class="capl" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(capv) + '" y2="' + y(capv) + '" style="pointer-events:none"/><text class="capt" x="' + (PH ? L + 2 : W - R - 4) + '" y="' + (PH ? 9 : y(capv) - 6) + '" text-anchor="' + (PH ? 'start' : 'end') + '" style="pointer-events:none' + (PH ? ';font-size:9.5px' : '') + '">' + (PH ? 'Max ' : 'Max to spend ') + (Number.isInteger(capv) ? capv : capv.toFixed(1)) + '%</text>';
    const leg = LINES.map(([k, n, c]) => '<button type="button" class="lg' + (F === k ? ' on' : '') + (F && F !== k ? ' dim' : '') + '" data-focus="' + k + '" aria-pressed="' + (F === k) + '"><i style="background:var(' + c + ')"></i>' + n + '</button>').join('') + (F ? '' : '<span><i class="dash2"></i>Max to spend</span>');
    const t = sum(brs, S.ids), parts = LINES.map(([k, n, c]) => ({ k, n, c, v: lineVal(t, k) })), cn = consNone(t), mx = Math.max(1, ...parts.map(x => x.v));
    const shown = F ? parts.filter(x => x.k === F) : parts;
    const rows = t.any ? shown.map(x => '<div class="srow clk' + (F ? ' one' : '') + '" data-focus="' + x.k + '" role="button" tabindex="0"><span class="nm"><i style="background:var(' + x.c + ')"></i>' + x.n + '</span><span class="tr"><b style="width:' + (x.v / mx * 100) + '%;background:var(' + x.c + ')"></b></span><span class="vl">' +
      (x.k === 'cons' && cn ? '<span style="font-size:13px;color:var(--muted2)">not in the P&amp;L yet</span>' : '<a data-open="' + x.k + '">AED ' + fmt(x.v) + '</a><span>' + (t.stock ? pc(x.v / t.stock * 100) : '-') + ' of the stock spend &middot; ' + (t.inc ? pc(x.v / t.inc * 100) : '-') + ' of income</span>') + '</span></div>').join('') : '<p class="vnote">No data in this Period.</p>';
    const nm = brLabel();
    const dparts = parts.filter(x => !(x.k === 'cons' && cn) && x.v > 0), dtot = dparts.reduce((a, x) => a + x.v, 0), CIRC = 2 * Math.PI * 70;
    let off = 0, donut = '<svg viewBox="0 0 200 200" role="img" aria-label="Donut chart of how the stock spend is shared between the five lines"><circle cx="100" cy="100" r="70" fill="none" stroke="var(--surface2)" stroke-width="30"/>';
    if (dtot > 0) dparts.forEach(x => { const len = x.v / dtot * CIRC, gap = dparts.length > 1 ? Math.min(2.5, len * .4) : 0;
      donut += '<circle class="seg' + (F && F !== x.k ? ' dim' : '') + '" data-seg="' + x.k + '" cx="100" cy="100" r="70" stroke="var(' + x.c + ')" stroke-dasharray="' + Math.max(0, len - gap) + ' ' + CIRC + '" stroke-dashoffset="' + (-off) + '"></circle>'; off += len; });
    donut += '</svg>';
    const fv = F ? lineVal(t, F) : 0;
    const center = !t.any ? '<span>No data</span>' : F ? (F === 'cons' && cn ? '<b>&ndash;</b><span>not in the P&amp;L yet</span>' : '<b>AED ' + fmt(fv) + '</b><span>' + pc(fv / t.inc * 100) + ' of income</span><em>' + pc(t.stock ? fv / t.stock * 100 : 0) + ' of the stock spend</em>')
      : '<b>AED ' + fmt(t.stock) + '</b><span>' + pc(t.stock / t.inc * 100) + ' of income</span>' + (cn ? '<em>without Consumables</em>' : t.consMissing ? '<em>Consumables to the last P&amp;L month</em>' : '');
    const pill = F ? '<div class="focusp"><span>' + swatch(FL[2]) + 'Showing only <b>' + FL[1] + '</b></span><button type="button" class="pill" data-unfocus="1">Show all five &#10005;</button></div>' : '';
    return '<div class="vwrap"><div class="vcard"><h2>' + (F ? FL[1] + ' as a share of income, by month' : 'Stock cost as a share of income, by month') + '</h2><p class="vs">' + esc(nm) + '. ' +
      (F ? 'Only this line is shown. The max to spend is for the total, so it is hidden here.' : 'Each bar is the month\'s stock spend divided by its income, split into the five lines; the dashed line is the max to spend.') +
      ' <b>Click a colour to look at that line only.</b> Hover a month for its figures (on a phone, tap it). Click a figure in the Table view for the order lines behind it.</p>' + pill + '<div class="legend">' + leg + '</div>' +
      '<div class="chartw"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Bars of stock cost as a percentage of income for each month of ' + S.year + '">' + g + '</svg></div>' +
      '<p class="vnote">' + (F ? '' : '* Total without Consumables: the P&amp;L does not have that month yet. ') + 'The month in progress is month to date. The highlighted months are the Period you picked at the top.</p></div>' +
      '<div class="vpair"><div class="vcard don"><h2>' + (F ? FL[1] + ', ' : 'Share of the stock spend, ') + esc(perShort()) + '</h2><p class="vs">' + esc(nm) + '. ' + (F ? 'This line against the rest. Click it again to see all five.' : 'How each line makes up the spend. Click a slice to look at it alone.') + '</p>' +
      '<div class="donw">' + donut + '<div class="donc">' + center + '</div></div><div class="dlist">' + parts.filter(x => !(x.k === 'cons' && cn)).map(x => '<span' + (F && F !== x.k ? ' style="opacity:.4"' : '') + '><i style="background:var(' + x.c + ')"></i>' + x.n + '</span>').join('') + '</div></div>' +
      '<div class="vcard"><h2>' + (F ? FL[1] + ', ' + esc(perShort()) : 'The five lines, ' + esc(perShort())) + '</h2><p class="vs">' + esc(nm) + (t.any ? ': AED ' + fmt(t.stock) + ' on stock against AED ' + fmt(t.inc) + ' of income (' + pc(t.stock / t.inc * 100) + ').' : '.') +
      (cn ? ' Consumables not in the P&amp;L yet for this Period, so it is without it.' : t.consMissing ? ' Consumables is the P&amp;L months only.' : '') + (F ? '' : ' Click a line to look at it alone.') + '</p><div class="split">' + rows + '</div></div></div></div>';
  }
  function tipRows(t, brs) {
    const F = S.focus, capv = capOf(brs), pct = t.stock / t.inc * 100, row = (a, b) => '<div style="display:flex;justify-content:space-between;gap:14px"><span>' + a + '</span><span>' + b + '</span></div>';
    let h = '';
    (F ? [LINES.find(x => x[0] === F)] : LINES).forEach(([k, n, c]) => { const v = k === 'cons' ? (consNone(t) ? null : t.cons) : t[k]; h += row(swatch(c) + n, v === null ? 'not in the P&amp;L yet' : 'AED ' + fmt(v) + ' &middot; <b>' + pc(v / t.inc * 100) + '</b>'); });
    if (!F) h += '<div style="border-top:1px solid rgba(128,128,128,.4);margin-top:4px;padding-top:4px">' + row('Total stock', '<b>AED ' + fmt(t.stock) + '</b>') + row('Income', 'AED ' + fmt(t.inc)) +
      row('<i style="display:inline-block;width:14px;height:0;border-top:2px dashed currentColor;margin-right:7px;vertical-align:middle"></i>' + (pct > capv ? 'Over the max by' : 'Under the max by'), '<b>' + Math.abs(capv - pct).toFixed(1) + ' pts</b>') + '</div>';
    return h;
  }
  const placeAt = e => { const tip = $('tip'); tip.style.display = 'block'; tip.style.left = Math.max(8, Math.min(innerWidth - 310, e.clientX + 14)) + 'px'; tip.style.top = Math.max(8, Math.min(innerHeight - tip.offsetHeight - 8, e.clientY - tip.offsetHeight / 2)) + 'px'; };
  const hideTip = () => { if (root) { const t = $('tip'); if (t) t.style.display = 'none'; } };
  function placeEl(el, h) {
    const tip = $('tip'); tip.innerHTML = h; tip.style.display = 'block';
    const r = el.getBoundingClientRect(), w = tip.offsetWidth, hh = tip.offsetHeight;
    tip.style.left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + 'px';
    let top = r.bottom + 6; if (top + hh > innerHeight - 8) top = Math.max(8, r.top - hh - 6);
    tip.style.top = top + 'px';
  }
  function monthSheet(i, line) {
    const tt = sum(S.brs, [i]), sh = $('msheet'); if (!tt.any) { sh.classList.remove('on'); return; }
    const pct = tt.stock / tt.inc * 100;
    sh.innerHTML = '<button type="button" class="x" data-msx="1">Close</button><b>' + MON[i] + ': ' + (S.focus ? '' : pct.toFixed(1) + '% of income') + '</b>' + tipRows(tt, S.brs) +
      (line && !S.focus ? '<div style="margin-top:8px"><button type="button" class="pill" data-focus="' + line + '" style="background:var(--bg);color:var(--text)">Look at ' + LINES.find(x => x[0] === line)[1] + ' only</button></div>' : '');
    sh.classList.add('on');
  }
  function setFocus(k) { $('msheet') && $('msheet').classList.remove('on'); S.focus = S.focus === k ? null : k; draw(); }

  /* ---------- the table view ---------- */
  function rowHtml(i, ids, label, tot) {
    const brs = S.brs, t = sum(brs, ids), sel = !tot && S.ids.indexOf(i) >= 0;
    const lab = '<td class="c-mo l">' + label + (!tot && i === S.last && t.any && Math.max(...brs.map(b => (mon(b, i) || { d: 0 }).d)) < dim(S.year, i) ? '<span class="mtd">month to date</span>' : '') +
      (t.un ? '<i class="flag" tabindex="0" data-unpriced="' + (tot ? ids.join(',') : i) + '" data-tip="' + esc(t.un + ' order line' + (t.un > 1 ? 's have' : ' has') + ' no price in the Stock List, so they are not counted yet. Click to see them.') + '">!</i>' : '') + '</td>';
    if (!t.any) return '<tr class="empty">' + lab + '<td colspan="12" class="l" style="text-align:left">No data yet</td></tr>';
    const capv = capOf(brs), pct = t.stock / t.inc * 100, bal = capv - pct, p = v => t.inc ? pc(v / t.inc * 100) : '', cn = consNone(t), cpart = t.consMissing && t.cons > 0, key = tot ? ids.join(',') : String(i);
    const ck = k => '<td class="num' + (k === 'hr' ? ' sepl' : '') + '"><a data-open="' + k + '|' + key + '">' + fmt(t[k]) + '</a><span class="p">' + p(t[k]) + '</span></td>';
    return '<tr class="' + (tot ? 'tot' : '') + (sel ? ' sel' : '') + '">' + lab + '<td class="num">' + fmt(t.svc) + '</td><td class="num">' + fmt(t.prod) + '</td><td class="num"><b>' + fmt(t.inc) + '</b></td>' +
      ck('hr') + ck('hp') + ck('br') + ck('bp') +
      (cn ? '<td class="num"><span class="dash" title="Consumables for this month are not in the P&amp;L yet">&ndash;</span></td>' : '<td class="num"><a data-open="cons|' + key + '">' + fmt(t.cons) + '</a><span class="p">' + p(t.cons) + '</span></td>') +
      '<td class="num sepl"><b>' + fmt(t.stock) + '</b>' + (cn ? '<span class="p">w/o consumables</span>' : cpart ? '<span class="p">consumables to the last P&amp;L month</span>' : '') + '</td>' +
      '<td class="num"><span class="chip ' + (pct > capv ? 'over' : 'ok') + '">' + pc(pct) + '</span></td><td class="num">' + pc(capv) + '</td>' +
      '<td class="num"><span class="chip ' + (bal < 0 ? 'over' : 'ok') + '">' + (bal < 0 ? '' : '+') + bal.toFixed(1) + ' pts</span></td></tr>';
  }
  function sheetHtml() {
    let rows = ''; for (let i = 0; i < 12; i++) rows += rowHtml(i, [i], MON[i], false);
    const all = [...Array(12).keys()]; rows += rowHtml(-1, all, 'Year to date', true);
    return '<div class="sheetbox"><div class="xw"><table class="xt"><thead>' +
      '<tr><th class="c-mo l grp" rowspan="2" style="text-align:left;letter-spacing:0;text-transform:none;font-size:12px;color:var(--muted);vertical-align:bottom;border-left:0">Month</th>' +
      '<th class="grp" colspan="3">Income, ex VAT <small style="text-transform:none;letter-spacing:0;display:inline;font-weight:400">Phorest, every day</small></th>' +
      '<th class="grp" colspan="5">Stock that arrived <small style="text-transform:none;letter-spacing:0;display:inline;font-weight:400">Phorest, Stock List cost, and % of income</small></th><th class="grp" colspan="4">Against the max</th></tr>' +
      '<tr class="h2"><th>Net services<small>courses included</small></th><th>Net retail<small>products</small></th><th>Net income<small>services + retail</small></th>' +
      '<th class="sepl">Hair Retail</th><th class="wrap">Hair Professional</th><th>Beauty Retail</th><th class="wrap">Beauty Professional</th><th>Consumables<small>P&amp;L, Accounts</small></th>' +
      '<th class="sepl">Total stock<small>all five</small></th><th>% of income</th><th>Max to spend</th><th>Balance<small>max minus actual</small></th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
  }

  /* ---------- draw ---------- */
  function draw() {
    if (!root || !S.d) return;
    S.last = lastMonth();
    const ts = wantMonths(); S.ids = ts.ids.filter(i => i >= 0 && i < 12);
    applyTheme();
    $('pg').innerHTML = '<h1 class="t">Stock Cost</h1><p class="sub">What each salon spends on stock as a share of its income, against its max to spend. Branch and Period are the filters at the top of the page. It fills itself: income and stock come from Phorest every day, Consumables from Accounts\' monthly P&amp;L. Click a figure to see what is behind it.</p>' +
      '<div class="cards">' + S.brs.map(cardHtml).join('') + '</div>' +
      '<div class="tools"><span class="cnt">' + esc(brLabel()) + ' &middot; every month of ' + S.year + ', <b>' + esc(perShort()) + '</b> highlighted</span><span class="btns">' +
      '<span class="seg" role="group" aria-label="View"><button type="button" data-view="visual" aria-pressed="' + (S.view === 'visual') + '">Visual</button><button type="button" data-view="table" aria-pressed="' + (S.view === 'table') + '">Table</button></span>' +
      '<span class="dl" role="group" aria-label="Download this report"><button type="button" onclick="rexRun(\'stockCostExport\',\'xlsx\',this)" title="Download as an Excel file">XLSX</button><button type="button" onclick="rexRun(\'stockCostExport\',\'csv\',this)" title="Download as a CSV file">CSV</button></span></span></div>' +
      (S.view === 'table' ? sheetHtml() : visualHtml()) +
      '<h2 class="howh">How to read this</h2><div class="howto">' +
      '<div><b>Stock</b>What Phorest shows as arrived that month, at the Stock List cost. Not the order date.</div>' +
      '<div><b><span class="flag" style="margin:0 4px 0 0;cursor:default">!</span> Warning</b>Some order lines have no price in the Stock List yet, so they are not counted. Click the ! to see them.</div>' +
      '<div><b>Consumables</b>Accounts\' P&amp;L, Total for Consumables. A month shows a dash until Accounts close it.</div>' +
      '<div><b>Max to spend</b>One % per salon, set by Kate. Starts at 10%.</div>' +
      '<div><b>Balance</b>Max minus actual. <b style="display:inline;letter-spacing:0;text-transform:none;color:var(--ok)">Plus</b> is under the max, <b style="display:inline;letter-spacing:0;text-transform:none;color:var(--over)">minus</b> is over.</div>' +
      '<div><b>Month in progress</b>Month to date, so its % is not final.</div></div>';
  }
  function applyTheme() {
    const st = root && root.querySelector('.stage'); if (!st) return;
    st.classList.toggle('dk', document.documentElement.getAttribute('data-theme') === 'dark');
  }

  /* ---------- order lines behind a figure ---------- */
  async function openLines(line, key) {
    const ids = String(key).split(',').filter(x => x !== '').map(Number).filter(i => i >= 0), mo = ids.map(i => i + 1);
    const m = $('mdl'), inn = $('mdlIn'); m.classList.add('on');
    const title = line === 'unpriced' ? 'Order lines with no Stock List price' : (LINES.find(x => x[0] === line) || [0, line])[1] + ' that arrived';
    const when = ids.length === 1 ? MON[ids[0]] + ' ' + S.year : (ids.length === 12 ? 'Year to date ' + S.year : MON[ids[0]] + ' to ' + MON[ids[ids.length - 1]] + ' ' + S.year);
    inn.innerHTML = '<button type="button" class="pill mdl-x" data-close="1">Close</button><h2>' + esc(title) + '</h2><p>' + esc(brLabel()) + ', ' + esc(when) + '. Loading the order lines…</p>';
    try {
      if (line === 'cons') { inn.innerHTML = '<button type="button" class="pill mdl-x" data-close="1">Close</button><h2>Consumables</h2><p>' + esc(brLabel()) + ', ' + esc(when) + '. Consumables is not in Phorest. It is Accounts\' monthly P&amp;L, the line Total for Consumables (hair and beauty products, kitchen and bathroom supplies, supplies and materials), one figure per salon per month.</p>'; return; }
      const { data, error } = await sb.rpc('stock_cost_lines', { p_year: S.year, p_months: mo, p_branches: S.brs, p_line: line });
      if (error) throw error;
      if (data && data.denied) { inn.innerHTML = '<p>This page is for Leadership and up.</p>'; return; }
      const rows = data.rows || [];
      inn.innerHTML = '<button type="button" class="pill mdl-x" data-close="1">Close</button><h2>' + esc(title) + '</h2><p>' + esc(brLabel()) + ', ' + esc(when) + '. ' + data.n + ' order line' + (data.n === 1 ? '' : 's') + (line === 'unpriced' ? ', not counted in the totals because Phorest\'s Stock List has no price for them.' : ', AED ' + fmt(data.total) + ' at the Stock List cost.') + (rows.length < data.n ? ' The biggest ' + rows.length + ' are shown.' : '') + '</p>' +
        '<table><thead><tr><th class="l">Salon</th><th class="l">Product</th><th class="l">Brand</th><th>Units</th><th>Unit cost</th><th>Spend</th><th class="l">Order</th><th class="l">Arrived</th></tr></thead><tbody>' +
        rows.map(r => '<tr><td class="l">' + esc(BN[r[0]] || r[0]) + '</td><td class="l">' + esc(r[1]) + '</td><td class="l">' + esc(r[2]) + '</td><td>' + (r[3] == null ? '' : +r[3]) + '</td><td>' + (r[4] == null ? '-' : (+r[4]).toFixed(2)) + '</td><td>' + (r[5] == null ? '-' : fmt(r[5])) + '</td><td class="l">' + esc(r[6]) + '</td><td class="l">' + esc(dmy(r[7])) + '</td></tr>').join('') +
        (line === 'unpriced' ? '' : '<tr class="t"><td class="l" colspan="5">Total</td><td>' + fmt(data.total) + '</td><td colspan="2"></td></tr>') + '</tbody></table>';
    } catch (e) { console.error(e); inn.innerHTML = '<button type="button" class="pill mdl-x" data-close="1">Close</button><p>The order lines did not load. Try again.</p>'; }
  }

  /* ---------- wiring ---------- */
  function wire() {
    const R = root;
    R.addEventListener('click', e => {
      const t = e.target, q = s => t.closest && t.closest(s);
      let el;
      if ((el = q('[data-view]'))) { S.view = el.dataset.view; S.focus = null; try { localStorage.setItem('trs-stockcost-view', S.view); } catch (x) { /* fine */ } draw(); return; }
      if ((el = q('[data-unfocus]'))) { S.focus = null; draw(); return; }
      if ((el = q('[data-close]')) || t.id === 'mdl') { $('mdl').classList.remove('on'); return; }
      if ((el = q('a[data-open]'))) { const p = el.dataset.open; if (p.indexOf('|') > 0) { const [l, k] = p.split('|'); openLines(l, k); } else openLines(p, S.ids.join(',')); return; }
      if ((el = q('[data-unpriced]'))) { openLines('unpriced', el.dataset.unpriced); return; }
      if ((el = q('[data-cap]'))) { if (S.access.edit) { S.editing = el.dataset.cap; draw(); const i = $('capIn'); if (i) { i.focus(); i.select(); } } return; }
      if ((el = q('.seg[data-seg]'))) { setFocus(el.dataset.seg); return; }
      if ((el = q('[data-focus]'))) { setFocus(el.dataset.focus); return; }
      if ((el = q('.segr'))) { if (S.phone && !S.focus) { monthSheet(+el.dataset.m, el.dataset.line); return; } setFocus(el.dataset.line); return; }
      if ((el = q('.hit'))) { if (S.phone) monthSheet(+el.dataset.m); return; }
      if ((el = q('[data-msx]'))) { $('msheet').classList.remove('on'); return; }
    });
    R.addEventListener('keydown', e => {
      const t = e.target;
      if (t.id === 'capIn') { if (e.key === 'Enter') saveCap(true); else if (e.key === 'Escape') saveCap(false); return; }
      if ((e.key === 'Enter' || e.key === ' ') && t.dataset && t.dataset.focus) { e.preventDefault(); setFocus(t.dataset.focus); }
      if (e.key === 'Escape') { if ($('mdl').classList.contains('on')) $('mdl').classList.remove('on'); else if (S.focus) { S.focus = null; draw(); } }
    });
    R.addEventListener('focusout', e => { if (e.target.id === 'capIn' && S.editing) saveCap(true); });
    R.addEventListener('mousemove', e => {
      const t = e.target, brs = S.brs;
      const mm = t.closest && t.closest('.hit, .segr');
      if (mm) { const i = +mm.dataset.m, tt = sum(brs, [i]); if (!tt.any) { hideTip(); return; }
        const pct = tt.stock / tt.inc * 100; $('tip').innerHTML = '<b>' + MON[i] + ': ' + (S.focus ? '' : pct.toFixed(1) + '% of income') + '</b>' + tipRows(tt, brs) + '<div style="opacity:.7;margin-top:4px">' + (mm.classList.contains('segr') ? 'Click to look at this line only' : 'Click a figure in the table for the order lines') + '</div>'; placeAt(e); return; }
      const sg = t.closest && t.closest('.donw .seg');
      if (sg) { const k = sg.dataset.seg, tt = sum(brs, S.ids), L = LINES.find(x => x[0] === k), v = lineVal(tt, k);
        $('tip').innerHTML = '<b>' + swatch(L[2]) + L[1] + '</b><div style="display:flex;justify-content:space-between;gap:14px"><span>Spend</span><b>AED ' + fmt(v) + '</b></div><div style="display:flex;justify-content:space-between;gap:14px"><span>Of the stock spend</span><span>' + pc(v / tt.stock * 100) + '</span></div><div style="display:flex;justify-content:space-between;gap:14px"><span>Of income</span><span>' + pc(v / tt.inc * 100) + '</span></div><div style="opacity:.7;margin-top:4px">Click to look at this line only</div>'; placeAt(e); return; }
      hideTip();
    });
    R.addEventListener('mouseover', e => { const t = e.target.closest && e.target.closest('[data-tip]'); if (t) placeEl(t, esc(t.dataset.tip)); });
    R.addEventListener('mouseout', e => { const t = e.target.closest && e.target.closest('[data-tip]'); if (t) hideTip(); });
    R.addEventListener('focusin', e => { const t = e.target; if (t.dataset && t.dataset.tip) placeEl(t, esc(t.dataset.tip)); });
    R.addEventListener('focusout', e => { const t = e.target; if (t.dataset && t.dataset.tip) hideTip(); });
    if (!wired) {
      wired = true;
      window.addEventListener('scroll', hideTip, true);
      themeObs = new MutationObserver(applyTheme); themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    }
  }
  async function saveCap(ok) {
    const b = S.editing, i = $('capIn'); if (!b) return;
    const v = i ? parseFloat(String(i.value).replace(',', '.')) : NaN; S.editing = null;
    if (ok && v > 0 && v < 100 && v !== +S.caps[b]) {
      try {
        const { data, error } = await sb.rpc('stock_cost_cap_set', { p_branch: b, p_cap: v });
        if (error) throw error;
        S.capLog[b] = { by: data.by, from: data.from, to: data.to, at: data.at }; S.caps[b] = data.to;
        draw(); toast('The max for ' + BN[b] + ' is now ' + data.to + '%.'); return;
      } catch (e) { console.error(e); toast('The max did not save. Try again.'); }
    } else if (ok && !(v > 0 && v < 100)) toast('The max to spend is a percentage between 0 and 100.');
    draw();
  }

  /* ---------- data in ---------- */
  async function load(year) {
    const { data, error } = await sb.rpc('stock_cost_report', { p_year: year });
    if (error) throw error;
    return data;
  }
  function ingest(d) {
    S.d = d.branches; S.caps = d.caps || {}; S.capLog = d.cap_log || {}; S.access = d.access || { edit: false }; S.year = d.year; S.asof = d.asof; S.loadedAt = Date.now();
  }

  /* ---------- download ---------- */
  window.stockCostExport = function stockCostExport() {
    if (!S.d) return null;
    const brs = S.brs, capv = capOf(brs);
    const head = [['Month', 'text'], ['Net services', 'aed'], ['Net retail', 'aed'], ['Net income', 'aed'], ['Hair Retail', 'aed'], ['Hair Professional', 'aed'], ['Beauty Retail', 'aed'], ['Beauty Professional', 'aed'], ['Consumables', 'aed'], ['Total stock', 'aed'], ['% of income', 'pct'], ['Max to spend', 'pct'], ['Balance, points', 'pct']].map(h => ({ label: h[0], fmt: h[1] }));
    const line = (label, t, tot) => { const pct = t.inc ? t.stock / t.inc * 100 : null; return { total: !!tot, cells: [label, t.svc, t.prod, t.inc, t.hr, t.hp, t.br, t.bp, consNone(t) ? null : t.cons, t.stock, pct, capv, pct === null ? null : capv - pct] }; };
    const rows = []; for (let i = 0; i < 12; i++) { const t = sum(brs, [i]); if (t.any) rows.push(line(MON[i], t, false)); }
    const all = sum(brs, [...Array(12).keys()]); if (all.any) rows.push(line('Year to date', all, true));
    return { name: 'stock-cost-' + S.year + (brs.length === 1 ? '-' + brs[0].toLowerCase() : ''), sheets: [{ name: 'Stock Cost ' + S.year, title: 'Stock Cost ' + S.year, subtitle: brLabel() + '. Income from Phorest, stock that arrived from Phorest at the Stock List cost, Consumables from the P&L (blank where the P&L does not have the month yet). The max to spend is ' + (Number.isInteger(capv) ? capv : capv.toFixed(1)) + '%.', blocks: [{ cols: head, rows }] }] };
  };

  /* ---------- entry ---------- */
  window.renderStockCost = async function renderStockCost() {
    host = document.getElementById('stockCostContent');
    if (!host) return;
    if (!root) {
      root = host.attachShadow({ mode: 'open' });
      root.innerHTML = '<style>' + CSS + '</style><div class="stage"><div class="pg" id="pg"></div></div><div class="tip" id="tip" role="tooltip"></div><div class="msheet" id="msheet" role="dialog" aria-label="Month detail"></div><div class="mdl" id="mdl" role="dialog" aria-modal="true" aria-label="Order lines"><div class="mdl-in" id="mdlIn"></div></div><div id="toast" role="status"></div>';
      wire();
    }
    S.phone = host.clientWidth < 640;
    if (!sizeObs && window.ResizeObserver) { sizeObs = new ResizeObserver(() => requestAnimationFrame(() => { const p = host.clientWidth < 640; if (p !== S.phone && S.d) { S.phone = p; draw(); } })); sizeObs.observe(host); }
    try { if (window.trsWindowReady) await window.trsWindowReady; } catch (e) { /* the page reads its own default window */ }
    S.brs = wantBranches();
    const want = wantMonths();
    if (S.d && S.year === want.year && Date.now() - S.loadedAt < 300000) { draw(); return; }
    if (!S.d) $('pg').innerHTML = '<p class="msg">Loading Stock Cost…</p>';
    try {
      const d = await load(want.year);
      if (d && d.denied) { $('pg').innerHTML = '<p class="msg">This page is for Leadership and up. Ask Kate if you need it.</p>'; return; }
      ingest(d);
    } catch (e) {
      console.error(e);
      $('pg').innerHTML = '<p class="msg">Stock Cost didn\'t load. Refresh to try again.</p>';
      return;
    }
    draw();
  };
})();
