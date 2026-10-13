// Over the Years (Kate, 9 Oct 2026), built from Downloads/over-the-years-mockup.html.
//
// The business year on year, 2021 to now, and season by season, from migrations/over_the_years.sql:
//   over_the_years()     money (Phorest financial totals, net), clients per staff and per visit, season takings
//                        per open day, Google review counts and stars. Security invoker, so a branch-scoped
//                        login only reads its own branch.
//   over_the_years_ig()  Instagram by month. Level 3 and above, as the Social page.
//   over_the_years_months()  net takings, open days and clients per staff by branch, year and month (oty_month_branch,
//                        refreshed hourly), for the month by month section. Security invoker, branch scope follows.
//
// Rules the page follows (Kate and Emma Coach):
//  - Seasons, not calendar months: Ramadan and Eid drift about 11 days earlier every year, so each season is set
//    against the same season last year, per open day. The season list is oty_seasons, one table.
//  - Same days first: the year in progress is set against the same dates (1 Jan to the last day of takings) in
//    every earlier year. Full years is the other switch, with the current year marked partial.
//  - Average bill is per staff, the Pulse's default; per visit through the door is the snippet.
//  - Branches arrive over time (Motor City Nov 2022, Al Quoz Sep 2023), so the totals jump when they appear;
//    Like for like (Saadiyat + Khalifa City A) is the trend. Bahrain is not on this page. Fratelli (closed 22 May
//    2026) is an opt-in chip, as in the dashboard's pickers: out of "All four", in under "Fratelli (closed)" and
//    "All + Fratelli" (Kate, 9 Oct 2026).
//  - Google reviews and Instagram are marked (UNDER CONSTRUCTION): the review sync is still by hand while the
//    Google approval is pending, and Instagram only exists from 2025.
const OTY_STORE = 'trs-over-years';
const OTY = { b: 'ALL', basis: 'same', line: 'growth', sel: null, ig: null, sreg: 'AD', syrs: null,
  mreg: 'AD', mmet: 'net', mbase: 'same', mview: 'index', mpy: null, mmsel: null, myrs: null };
try {
  const s = JSON.parse(localStorage.getItem(OTY_STORE) || '{}');
  for (const k of ['b', 'basis', 'line', 'sreg', 'mreg', 'mmet', 'mbase', 'mview']) if (typeof s[k] === 'string') OTY[k] = s[k];
  if (Array.isArray(s.syrs)) OTY.syrs = s.syrs.map(Number).filter(Boolean);
} catch (e) {}
function otySave() { try { localStorage.setItem(OTY_STORE, JSON.stringify({ b: OTY.b, basis: OTY.basis, line: OTY.line, sreg: OTY.sreg, syrs: OTY.syrs, mreg: OTY.mreg, mmet: OTY.mmet, mbase: OTY.mbase, mview: OTY.mview })); } catch (e) {} }

const OTY_BR = ['SAA', 'KCA', 'MC', 'AQ', 'FRT'];
const OTY_NAME = { SAA: 'Saadiyat', KCA: 'Khalifa City A', MC: 'Motor City', AQ: 'Al Quoz', FRT: 'Fratelli' };
const OTY_COL = { SAA: '#C4B5FD', KCA: '#FFD4D9', MC: '#99F6E4', AQ: '#FF9B9B', FRT: '#EEF3C7' };
const OTY_ORDER = ['ALL', 'LFL', 'SAA', 'KCA', 'MC', 'AQ', 'ALLF', 'FRT'];
let otyRaw = null, otyIgRaw = null, otyD = null, otyBusy = false, otyErr = '', otyIgErr = '', otyIgLoaded = false;

const otyEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const otyNum = v => Math.round(Number(v) || 0).toLocaleString('en-GB');
const otyM = v => v >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : Math.round(v / 1e3) + 'k';
const otyMs = v => v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : Math.round(v / 1e3) + 'k';
const otyAed = v => 'AED ' + otyNum(v);
const otyPct = (a, b) => a > 0 ? (b - a) / a * 100 : null;
const otyChg = p => p == null ? '' : `<span class="oty-chg ${Math.abs(p) < .5 ? 'flat' : p > 0 ? 'up' : 'dn'}">${p > 0 ? '+' : ''}${p.toFixed(1)}%</span>`;
const otyTxt = p => p == null ? 'n/a' : `<span class="${p > 0 ? 'oty-up' : 'oty-dn'}">${p > 0 ? '+' : ''}${p.toFixed(1)}%</span>`;
const OTY_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const otyDay = iso => { const d = new Date(iso + 'T00:00:00'); return `${d.getDate()} ${OTY_MON[d.getMonth()]}`; };

function otyCss() {
  if (document.getElementById('otyCss')) return;
  const st = document.createElement('style'); st.id = 'otyCss';
  st.textContent = `
  .oty{--o-gut:0px;width:100%;max-width:1320px;margin:0 auto;color:var(--text)}
  .oty *{box-sizing:border-box;min-width:0}
  .oty h1{font-family:'Playfair Display',serif;font-weight:500;font-size:clamp(28px,8vw,48px);line-height:1.06;margin:18px 0 8px}
  .oty h1 em{font-weight:400;color:var(--hair)}
  .oty .oty-deck{font-family:'Playfair Display',serif;font-style:italic;color:var(--muted);font-size:clamp(15.5px,4vw,19px);margin:0;line-height:1.35}
  .oty .oty-eb{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin:30px 0 10px;font-size:11.5px;font-weight:700;letter-spacing:.13em;text-transform:uppercase;color:var(--muted)}
  .oty .oty-eb i{width:8px;height:8px;border-radius:50%;flex:none;display:inline-block}
  .oty .oty-uc{font-size:11px;font-weight:800;letter-spacing:.08em;color:var(--warn);border:1px dashed var(--warn);border-radius:999px;padding:3px 9px;text-transform:uppercase}
  .oty .oty-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-card,10px);padding:14px;width:100%}
  .oty .oty-flag{border-left:3px solid var(--warn)}
  .oty .oty-lab{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--muted2);margin:16px 0 8px}
  .oty .oty-pills{display:flex;flex-wrap:wrap;gap:8px}
  .oty .oty-pill{appearance:none;border:1px solid var(--border);background:transparent;color:var(--muted);font:600 13px Inter,sans-serif;padding:9px 13px;border-radius:999px;cursor:pointer;white-space:nowrap}
  .oty .oty-pill[aria-pressed=true]{background:var(--accent);color:var(--accent-fg);border-color:var(--accent)}
  .oty .oty-tiles{display:grid;gap:10px;grid-template-columns:repeat(2,minmax(0,1fr));margin-top:18px}
  .oty .oty-tile .k{font-size:10.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted2)}
  .oty .oty-tile .v{font-size:clamp(19px,5.6vw,30px);font-weight:600;margin:6px 0 2px;font-variant-numeric:tabular-nums;white-space:nowrap}
  .oty .oty-tile .s{font-size:12px;color:var(--muted);line-height:1.4}
  .oty .oty-tile.now{border-color:var(--accent)}
  .oty .oty-chg{display:inline-block;font-weight:700;font-size:12.5px;padding:3px 9px;border-radius:999px;margin-top:6px;white-space:nowrap}
  .oty .oty-chg.up{color:var(--good);background:var(--good-bg)}.oty .oty-chg.dn{color:var(--bad);background:var(--bad-bg)}.oty .oty-chg.flat{color:var(--muted);background:var(--surface2)}
  .oty .oty-up{color:var(--good)}.oty .oty-dn{color:var(--bad)}
  .oty .oty-card{position:relative}
  .oty svg rect.seg{cursor:default}
  .oty svg rect.seg:hover{opacity:1;stroke:var(--text);stroke-width:1.5}
  .oty .oty-tt{position:absolute;z-index:5;pointer-events:none;display:none;min-width:150px;max-width:240px;padding:10px 12px;border-radius:8px;background:var(--bg);border:1px solid var(--border);box-shadow:0 6px 24px rgba(0,0,0,.35);font-size:12px;line-height:1.45;color:var(--muted)}
  .oty .oty-tt.on{display:block}
  .oty .oty-tt .h{display:flex;align-items:center;gap:7px;color:var(--text);font-size:13px}
  .oty .oty-tt .h i{width:10px;height:10px;border-radius:3px;flex:none}
  .oty .oty-tt .h span{margin-left:auto;color:var(--muted2);font-size:12px}
  .oty .oty-tt .v{font-size:19px;font-weight:600;color:var(--text);margin:5px 0 3px;font-variant-numeric:tabular-nums}
  .oty .oty-tt .s b{color:var(--text)}
  .oty .oty-legend{display:flex;gap:6px 14px;flex-wrap:wrap;font-size:12px;color:var(--muted);margin:0 0 8px}
  .oty .oty-legend i{display:inline-block;width:11px;height:11px;border-radius:3px;margin-right:6px;vertical-align:-1px}
  .oty .oty-legend i.ln{height:3px;width:16px;border-radius:2px;vertical-align:3px}
  .oty svg{display:block;width:100%;height:auto;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
  .oty svg text{fill:var(--muted2);font-family:Inter,sans-serif}
  .oty svg text.tv{fill:var(--text);font-weight:600}
  .oty svg text.tl{fill:var(--warn)}
  .oty .oty-read{margin-top:10px;padding:10px 12px;background:var(--surface2);border-radius:8px;font-size:13px;color:var(--muted);line-height:1.55}
  .oty .oty-read b{color:var(--text)}
  .oty .oty-rh{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:12px}
  .oty .oty-rh b{font-family:'Playfair Display',serif;font-weight:500;font-size:24px;color:var(--text)}
  .oty .oty-rh span{font-size:13px;color:var(--muted)}
  .oty .oty-rt{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(min(100%,140px),1fr))}
  .oty .oty-rs{padding:11px 13px;border-radius:8px;background:var(--surface);border:1px solid var(--border)}
  .oty .oty-rs .k{font-size:10.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted2)}
  .oty .oty-rs .v{font-size:24px;font-weight:600;margin:5px 0 3px;font-variant-numeric:tabular-nums;white-space:nowrap;color:var(--text)}
  .oty .ih-tip{text-transform:none;letter-spacing:0;font-weight:400;font-size:12px;line-height:1.45;white-space:normal;text-align:left}
  .oty .oty-rs:nth-child(n+3) .ih-tip{left:auto;right:0}
  .oty .oty-rs .s{font-size:12px;color:var(--muted);line-height:1.4}
  .oty .oty-rb{display:grid;gap:10px 18px;grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr));margin-top:14px;padding-top:14px;border-top:1px solid var(--border)}
  .oty .oty-rbr .m{display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-size:13px;margin-bottom:5px}
  .oty .oty-rbr .m span{color:var(--text);font-variant-numeric:tabular-nums}
  .oty .oty-rbr .m em{font-style:normal;color:var(--muted2);margin-left:4px}
  .oty .oty-rbr .tr{height:5px;border-radius:3px;background:var(--border)}
  .oty .oty-rbr .tr i{display:block;height:100%;border-radius:3px;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--text) 22%,transparent)}
  /* Kate, 13 Oct 2026: the branch names were drawn in the branch's pastel, unreadable on the light theme. The name is
     now in the text colour with the pastel as a dot, and the pastel dots, bars and legend swatches get a faint edge so
     the pale ones (Fratelli's yellow) still show on white. */
  .oty .oty-bdot{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:7px;vertical-align:-1px;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--text) 22%,transparent)}
  .oty .oty-legend i{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--text) 22%,transparent)}
  .oty .oty-ro{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:2px 12px;margin-top:6px}
  .oty table{width:100%;border-collapse:collapse;font-size:12.5px;font-variant-numeric:tabular-nums;table-layout:fixed}
  .oty th{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted2);text-align:right;padding:6px 4px;font-weight:700}
  .oty td{padding:9px 4px;border-top:1px solid var(--border);text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .oty th:first-child,.oty td:first-child{text-align:left;width:13%}
  .oty td.m{color:var(--muted)}
  .oty .oty-chip{display:inline-flex;align-items:center;gap:8px;appearance:none;border:1px solid var(--border);background:transparent;color:var(--muted);font:600 13px Inter,sans-serif;padding:8px 13px;border-radius:999px;cursor:pointer}
  .oty .oty-chip i{width:12px;height:12px;border-radius:3px;display:inline-block}
  .oty .oty-chip[aria-pressed=false]{opacity:.55}.oty .oty-chip[aria-pressed=false] i{background:transparent!important;box-shadow:inset 0 0 0 1.5px var(--muted2)}
  .oty .oty-chip[aria-pressed=true]{color:var(--text);border-color:var(--muted2);background:var(--surface2)}
  .oty .oty-sep{width:1px;background:var(--border);margin:0 4px}
  .oty .oty-hint{font-size:12px;color:var(--muted2);margin:10px 0 0}
  .oty .oty-chead{display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:2px}
  .oty .oty-chead b{font-size:16px}.oty .oty-chead span{font-size:12.5px;color:var(--muted2)}
  .oty .oty-plot{position:relative;margin-top:8px;padding-left:36px}
  .oty .oty-grid{position:absolute;left:36px;right:0;pointer-events:none}
  .oty .oty-gl{position:absolute;left:0;right:0;border-top:1px solid var(--border)}
  .oty .oty-gl span{position:absolute;left:-36px;top:-8px;width:30px;text-align:right;font-size:10.5px;color:var(--muted2);font-variant-numeric:tabular-nums}
  .oty .oty-groups{position:relative;display:grid}
  .oty .oty-grp{padding:0 10px;display:flex;flex-direction:column}
  .oty .oty-grp+.oty-grp{border-left:1px dashed var(--border)}
  .oty .oty-delta{height:62px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;text-align:center}
  .oty .oty-dp{font-weight:700;font-size:clamp(13px,1.8vw,16px);padding:5px 12px;border-radius:999px;white-space:nowrap}
  .oty .oty-dp.up{color:var(--good);background:var(--good-bg)}.oty .oty-dp.dn{color:var(--bad);background:var(--bad-bg)}.oty .oty-dp.flat{color:var(--muted);background:var(--surface2)}
  .oty .oty-delta small{font-size:11px;color:var(--muted2);line-height:1.25}
  .oty .oty-bars{display:flex;align-items:flex-end;justify-content:center;gap:clamp(2px,.6vw,7px);height:var(--H)}
  .oty .oty-bar{flex:1 1 0;max-width:46px;height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;cursor:pointer;outline:none;position:relative}
  .oty .oty-bar .vl{font-size:clamp(8px,.85vw,10.5px);color:var(--muted);font-variant-numeric:tabular-nums;margin-bottom:4px;white-space:nowrap}
  .oty .oty-bar .b{width:100%;border-radius:5px 5px 0 0;transition:filter .12s}
  .oty .oty-bar:hover .b,.oty .oty-bar:focus-visible .b,.oty .oty-bar.sel .b{filter:brightness(1.15);box-shadow:0 0 0 2px var(--text)}
  .oty .oty-bar.cur .vl{color:var(--text);font-weight:700}
  .oty .oty-bar.part .b{background-image:repeating-linear-gradient(135deg,rgba(45,46,55,.62) 0 4px,transparent 4px 9px)}
  .oty .oty-bar.void .b{background:transparent!important;border-bottom:2px dashed var(--muted2);height:3px!important;box-shadow:none!important;filter:none!important}
  .oty .oty-bar.void .vl{opacity:.65;font-size:9px;white-space:normal;text-align:center;line-height:1.1;max-width:44px}
  .oty .oty-grpyrs,.oty .oty-names{display:grid}
  .oty .oty-grpyrs>div{padding:0 10px}
  .oty .oty-yl{display:flex;justify-content:center;gap:clamp(2px,.6vw,7px);margin-top:6px;font-size:10px;color:var(--muted2)}
  .oty .oty-yl span{flex:1 1 0;max-width:46px;text-align:center}.oty .oty-yl .cur{color:var(--text);font-weight:700}
  .oty .oty-names{margin-top:8px}.oty .oty-names>div{text-align:center;padding:0 6px}
  .oty .oty-names b{display:flex;align-items:center;justify-content:center;gap:7px;font-size:clamp(12.5px,1.7vw,15px)}
  .oty .oty-names b i{width:10px;height:10px;border-radius:3px;flex:none}
  .oty .oty-names span{display:block;font-size:11px;color:var(--muted2);margin-top:2px;line-height:1.35}.oty .oty-names span.live{color:var(--warn)}
  @media(max-width:700px){.oty .oty-bar:not(.cur) .vl{display:none}.oty .oty-bar.void .vl{display:block}.oty .oty-yl span:not(.cur){font-size:9px}}
  .oty .oty-track{position:relative;height:40px;border-radius:8px;background:var(--surface2);overflow:hidden}
  .oty .oty-band{position:absolute;top:0;bottom:0;display:flex;align-items:center;justify-content:center;font-size:11.5px;font-weight:700;color:#2D2E37;white-space:nowrap;overflow:hidden}
  .oty .oty-band.live{justify-content:flex-start;padding-left:8px}
  .oty .oty-trackw{position:relative}
  .oty .oty-today{position:absolute;top:-6px;bottom:-6px;width:2px;margin-left:-1px;background:var(--text);z-index:2;outline:none}
  .oty .oty-today::before{content:'';position:absolute;top:0;bottom:0;left:-10px;right:-10px}
  .oty .oty-today span{position:absolute;bottom:100%;left:50%;transform:translateX(-50%);margin-bottom:6px;white-space:nowrap;padding:5px 10px;border-radius:8px;background:var(--bg);border:1px solid var(--muted2);font-size:12px;font-weight:600;color:var(--text);box-shadow:0 6px 18px rgba(0,0,0,.35);opacity:0;pointer-events:none;transition:opacity .12s}
  .oty .oty-today:hover span,.oty .oty-today:focus span{opacity:1}
  .oty .oty-months{display:grid;grid-template-columns:repeat(12,1fr);margin-top:6px;font-size:10.5px;color:var(--muted2);text-align:center}
  .oty .oty-cov{display:grid;gap:4px;align-items:center;font-size:10.5px;color:var(--muted2)}
  .oty .oty-cov .c{height:16px;border-radius:3px;background:var(--surface2)}
  .oty .oty-cov .c.ok{background:var(--good)}.oty .oty-cov .c.part{background:var(--warn)}
  .oty .oty-cov .l{font-size:11.5px;color:var(--muted)}
  .oty .oty-note{font-size:13px;color:var(--muted);line-height:1.55}
  .oty .oty-note b{color:var(--text)}
  .oty .oty-note p{margin:0 0 10px}.oty .oty-note p:last-child{margin:0}
  .oty .oty-load{padding:40px 8px;text-align:center;color:var(--muted)}
  .oty-stt{position:fixed;z-index:60;pointer-events:none;display:none;min-width:210px;max-width:270px;padding:11px 13px;border-radius:9px;background:var(--bg);border:1px solid var(--muted2);box-shadow:0 8px 28px rgba(0,0,0,.45);font-size:12px;line-height:1.5;color:var(--muted)}
  .oty-stt.on{display:block}
  .oty-stt .h{display:flex;align-items:center;gap:8px;color:var(--text);font-size:13px}
  .oty-stt .h i{width:10px;height:10px;border-radius:3px}
  .oty-stt .h span{margin-left:auto;font-size:12px;color:var(--muted2)}
  .oty-stt .v{font-size:20px;font-weight:700;color:var(--text);margin:6px 0 2px;font-variant-numeric:tabular-nums}
  .oty-stt .v small{font-size:11.5px;font-weight:500;color:var(--muted)}
  .oty-stt b{color:var(--text)}.oty-stt .oty-up{color:var(--good)}.oty-stt .oty-dn{color:var(--bad)}
  .oty .mo-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
  .oty .mo-hm{min-width:700px;display:grid;grid-template-columns:44px repeat(12,minmax(0,1fr)) 46px 46px;gap:4px;align-items:stretch}
  .oty .mo-hm .h{font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted2);text-align:center;padding:4px 0}
  .oty .mo-hm .yr{display:flex;align-items:center;font-size:13px;font-weight:700;color:var(--text)}
  .oty .mo-c{position:relative;height:46px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;font-variant-numeric:tabular-nums;cursor:pointer;background:var(--surface2);border:1.5px solid transparent;user-select:none;padding:0;color:var(--text);font-family:inherit}
  .oty .mo-c:hover{border-color:var(--muted2)}
  .oty .mo-c.sel{border-color:var(--text);box-shadow:0 0 0 1px var(--text)}
  .oty .mo-c.live{background-image:repeating-linear-gradient(135deg,rgba(45,46,55,.55) 0 4px,transparent 4px 9px)}
  .oty .mo-c.none{background:transparent;border:1px dashed var(--border);color:var(--muted2);cursor:default;font-weight:500;font-size:11px}
  .oty .mo-c.part{background:transparent;border:1px dashed var(--muted2);color:var(--muted2);cursor:default;font-weight:500;font-size:11px}
  .oty .mo-c.ahead{background:transparent;border:1px solid var(--border);cursor:default}
  .oty .mo-c.llf{border:1.5px dashed var(--warn)}
  .oty .mo-c.llf.sel{border:1.5px solid var(--text)}
  .oty .mo-c .moon{position:absolute;top:2px;right:4px;font-size:10px;line-height:1;opacity:.85}
  .oty .mo-c.pk::after,.oty .mo-c.lo::after{content:'';position:absolute;left:6px;bottom:4px;width:5px;height:5px;border-radius:50%}
  .oty .mo-c.pk::after{background:var(--text)}.oty .mo-c.lo::after{box-shadow:inset 0 0 0 1.5px var(--text)}
  .oty .mo-hm .pl{display:flex;align-items:center;justify-content:center;font-size:12.5px;font-weight:600;color:var(--muted)}
  .oty .mo-hm .rowmsg{grid-column:2 / span 14;display:flex;align-items:center;font-size:12px;color:var(--muted2);border:1px dashed var(--border);border-radius:7px;padding:0 12px;min-height:46px;line-height:1.35}
  .oty .mo-hm .avg{height:36px;background:transparent;border:1px solid var(--border);color:var(--muted);cursor:default}
  .oty .mo-hm .spr{height:30px;background:transparent;border:0;color:var(--muted2);font-size:11.5px;cursor:default}
  .oty .mo-hm .sec{grid-column:1 / -1;height:1px;background:var(--border);margin:6px 0}
  .oty .mo-hm .sl{display:flex;align-items:center;font-size:11px;color:var(--muted2);font-weight:600}
  .oty .mo-legend{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:12px;color:var(--muted);margin:14px 0 0;align-items:center}
  .oty .mo-legend .sw{display:inline-flex;align-items:center;gap:7px}
  .oty .mo-legend .box{width:16px;height:12px;border-radius:3px;display:inline-block}
  .oty .mo-scale{display:inline-flex;align-items:center;gap:6px}
  .oty .mo-scale .bar{width:120px;height:10px;border-radius:5px;background:linear-gradient(90deg,color-mix(in srgb,var(--bad) 55%,transparent),var(--surface2),color-mix(in srgb,var(--good) 55%,transparent))}
  .oty .mo-dt{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr));gap:10px;margin-top:12px}
  .oty .mo-dt>div{padding:11px 13px;border-radius:8px;background:var(--bg);border:1px solid var(--border)}
  .oty .mo-dt .k{font-size:10.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted2)}
  .oty .mo-dt .v{font-size:23px;font-weight:600;margin:5px 0 3px;font-variant-numeric:tabular-nums}
  .oty .mo-dt .v small{font-size:13px;font-weight:500;color:var(--muted)}
  .oty .mo-dt .s{font-size:12px;color:var(--muted);line-height:1.4}
  .oty .mo-lane{display:grid;grid-template-columns:44px 1fr;gap:4px 8px;align-items:center;margin-top:12px}
  .oty .mo-lane .ly{font-size:11px;color:var(--muted2);text-align:right}
  .oty .mo-lane .lt{position:relative;height:9px;border-radius:5px;background:var(--surface2)}
  .oty .mo-lane .lt i{position:absolute;top:0;bottom:0;border-radius:5px}
  .oty .mo-lane .lm{display:grid;grid-template-columns:repeat(12,1fr);font-size:10.5px;color:var(--muted2);text-align:center;margin-top:2px}
  .oty .mo-pairs{min-width:600px;display:grid;grid-template-columns:repeat(12,1fr);gap:0 6px}
  .oty .mo-pr{display:flex;flex-direction:column;align-items:center}
  .oty .mo-pr .dp{height:30px;display:flex;align-items:center;justify-content:center}
  .oty .mo-dpp{font-weight:700;font-size:12px;padding:4px 8px;border-radius:999px;white-space:nowrap}
  .oty .mo-dpp.up{color:var(--good);background:var(--good-bg)}.oty .mo-dpp.dn{color:var(--bad);background:var(--bad-bg)}.oty .mo-dpp.fl{color:var(--muted);background:var(--surface2)}
  .oty .mo-pr .bars{height:170px;display:flex;align-items:flex-end;gap:3px;width:100%;justify-content:center}
  .oty .mo-b{flex:1 1 0;max-width:22px;border-radius:4px 4px 0 0}
  .oty .mo-b.live{background-image:repeating-linear-gradient(135deg,rgba(45,46,55,.62) 0 4px,transparent 4px 9px)}
  .oty .mo-pr .m{margin-top:6px;font-size:11px;color:var(--muted2)}
  `;
  document.head.appendChild(st);
}

// ── THE DATA ─────────────────────────────────────────────────────────────
function otyBuild(raw, ig) {
  const years = [...new Set((raw.money || []).map(r => r.y))].sort((a, b) => a - b);
  const idx = y => years.indexOf(y), z = () => years.map(() => 0);
  const D = {};
  const br = b => D[b] || (D[b] = { net: { full: z(), ytd: z() }, vis: { full: z(), ytd: z() }, stf: { full: z(), ytd: z() },
    rev: { n: z(), s: z(), ny: z(), sy: z() } });
  (raw.money || []).forEach(r => { const o = br(r.b), i = idx(r.y); o.net.full[i] = +r.net || 0; o.net.ytd[i] = +r.net_y || 0; });
  (raw.visits || []).forEach(r => { const o = br(r.b), i = idx(r.y); if (i < 0) return; o.vis.full[i] = +r.vis || 0; o.vis.ytd[i] = +r.vis_y || 0; });
  (raw.staff || []).forEach(r => { const o = br(r.b), i = idx(r.y); if (i < 0) return; o.stf.full[i] = +r.stf || 0; o.stf.ytd[i] = +r.stf_y || 0; });
  (raw.reviews || []).forEach(r => { const o = br(r.b), i = idx(r.y); if (i < 0) return;
    o.rev.n[i] = +r.n || 0; o.rev.s[i] = +r.st || 0; o.rev.ny[i] = +r.n_y || 0; o.rev.sy[i] = +r.st_y || 0; });
  const present = OTY_BR.filter(b => D[b]);
  const open = present.filter(b => b !== 'FRT');
  const sets = { ALL: open };
  if (present.includes('SAA') && present.includes('KCA')) sets.LFL = ['SAA', 'KCA'];
  present.forEach(b => { sets[b] = [b]; });
  if (present.includes('FRT') && open.length) sets.ALLF = present.slice();
  return { years, D, present, sets, cut: raw.cut, curYear: new Date(raw.cut + 'T00:00:00').getFullYear(), ig };
}
const otySetName = k => k === 'ALL' ? 'All four branches' : k === 'LFL' ? 'Saadiyat + Khalifa City A' : k === 'ALLF' ? 'All four + Fratelli' : k === 'FRT' ? 'Fratelli (closed 22 May 2026)' : OTY_NAME[k] || k;
const otyCutLabel = () => otyDay(otyD.cut);

async function otyLoad(force) {
  if (otyBusy) return;
  if (otyRaw && !force) { otyDraw(); return; }
  otyBusy = true; otyErr = '';
  const host = document.getElementById('overYearsContent');
  if (host && !otyRaw) host.innerHTML = '<div class="oty oty-load">Reading six years of takings. This takes a few seconds.</div>';
  try {
    const { data, error } = await sb.rpc('over_the_years');
    if (error) throw error;
    otyRaw = data;
  } catch (e) { otyErr = (e && e.message) || 'Could not load.'; }
  if (otyRaw && !otyIgLoaded && typeof TRS_LEVEL !== 'undefined' && TRS_LEVEL >= 3) {
    try {
      const r = await sb.rpc('over_the_years_ig');
      if (r.error) throw r.error;
      otyIgRaw = r.data;
    } catch (e) { otyIgErr = (e && e.message) || 'Could not load Instagram.'; }
    otyIgLoaded = true;
  }
  // Kate, 13 Oct 2026: the month by month section reads its own small feed (oty_month_branch), loaded for every level.
  if (otyRaw && (!otyMoLoaded || force)) {
    try {
      const r = await sb.rpc('over_the_years_months');
      if (r.error) throw r.error;
      otyMoRaw = r.data; otyMoErr = '';
    } catch (e) { otyMoErr = (e && e.message) || 'Could not load month by month.'; }
    otyMoLoaded = true;
  }
  otyBusy = false;
  if (otyRaw) otyD = otyBuild(otyRaw, otyIgRaw);
  otyDraw();
}
function renderOverYears() { otyCss(); otyLoad(false); }

// ── THE NUMBERS FOR ONE SELECTION ────────────────────────────────────────
function otySum(set, key, which, i) {
  const D = otyD.D;
  return set.reduce((a, b) => a + ((D[b][key][which][i]) || 0), 0);
}
function otyRows() {
  const { years, D, sets, curYear } = otyD;
  const set = sets[OTY.b] || sets.ALL, same = OTY.basis === 'same';
  return years.map((y, i) => {
    const w = same ? 'ytd' : 'full', partial = !same && y === curYear;
    const net = otySum(set, 'net', w, i), vis = otySum(set, 'vis', w, i), stf = otySum(set, 'stf', w, i);
    // Growth follows the toggle: whole year on whole year, except the year in progress, which can only be read on the same days.
    const gw = same || partial ? 'ytd' : 'full';
    const netY = otySum(set, 'net', gw, i), netP = i ? otySum(set, 'net', gw, i - 1) : 0;
    const g = otyPct(netP, netY), big = g != null && Math.abs(g) > 100;
    return { y, i, net, vis, stf, avg: stf ? net / stf : 0, avgV: vis ? net / vis : 0, growth: big ? null : g, big, partial,
      per: set.map(b => ({ b, v: D[b].net[w][i] || 0 })) };
  });
}

// A smooth path through points [[x, y], ...] (monotone cubic, Fritsch-Carlson): it passes through every point and
// never overshoots between two of them, so a month at 0 does not dip below the axis and a peak stays the peak.
function otyCurve(pts) {
  const n = pts.length, f = v => v.toFixed(1);
  if (!n) return '';
  if (n === 1) return `M${f(pts[0][0])} ${f(pts[0][1])}`;
  const dx = [], m = [];
  for (let k = 0; k < n - 1; k++) { dx[k] = pts[k + 1][0] - pts[k][0]; m[k] = (pts[k + 1][1] - pts[k][1]) / (dx[k] || 1); }
  const tg = [m[0]];
  for (let k = 1; k < n - 1; k++) tg[k] = m[k - 1] * m[k] <= 0 ? 0 : (m[k - 1] + m[k]) / 2;
  tg[n - 1] = m[n - 2];
  for (let k = 0; k < n - 1; k++) {
    if (m[k] === 0) { tg[k] = 0; tg[k + 1] = 0; continue; }
    const a = tg[k] / m[k], b = tg[k + 1] / m[k], s = a * a + b * b;
    if (s > 9) { const u = 3 / Math.sqrt(s); tg[k] = u * a * m[k]; tg[k + 1] = u * b * m[k]; }
  }
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let k = 0; k < n - 1; k++) {
    const h = dx[k] / 3;
    d += ` C${f(pts[k][0] + h)} ${f(pts[k][1] + tg[k] * h)} ${f(pts[k + 1][0] - h)} ${f(pts[k + 1][1] - tg[k + 1] * h)} ${f(pts[k + 1][0])} ${f(pts[k + 1][1])}`;
  }
  return d;
}

// ── DRAW ─────────────────────────────────────────────────────────────────
function otyDraw() {
  const host = document.getElementById('overYearsContent');
  if (!host) return;
  if (!otyD) { host.innerHTML = `<div class="oty oty-load">${otyEsc(otyErr || 'No data yet.')}</div>`; return; }
  if (OTY.sel == null || OTY.sel >= otyD.years.length) OTY.sel = otyD.years.length - 1;
  if (!otyD.sets[OTY.b]) OTY.b = 'ALL';
  const rows = otyRows();
  // Kate, 13 Oct 2026: the mini side nav, the same rail as Organisation Pulse and Branch Performance (lgRail in
  // branch-ledger.js, lit by spy() in index.html): in the gutter from 1100px, a pinned row of chips below that. The
  // header, the switches and the tiles stay full width above it; the rail starts at the chart. A rail entry points
  // at the section's id, and a section with nothing to show (the seasons, before the data arrives) has no entry.
  const parts = [['oty-net', 'Net take by year', otyChartBlock(rows)], ['oty-years', 'The years, side by side', otyTable(rows)],
    ['oty-seasons', 'Season on season', otySeasons()], ['oty-months', 'Month by month', otyMonths()], ['oty-reviews', 'Google reviews', otyReviews()], ['oty-ig', 'Instagram', otyInstagram()],
    ['oty-cov', 'What each year has behind it', otyCoverage()], ['oty-how', 'How to read this page', otyNotes()]].filter(x => x[2]);
  const body = parts.map(([id, , html]) => `<section id="${id}" class="oty-sec">${html}</section>`).join('');
  const shell = typeof lgRail === 'function'
    ? `<div class="lg-shell lg-shell-wide">${lgRail(parts.map(([id, label]) => [id, label]))}<div class="lg-doc">${body}</div></div>`
    : body;
  host.innerHTML = `<div class="oty">
    <div class="oty-eb"><i style="background:var(--accent)"></i>Numbers · Business · Over the years</div>
    <h1>${otyD.years.length} years, <em>season by season.</em></h1>
    <p class="oty-deck">Where the business has grown, which branch carried it, and how this year's seasons sit against the years before.</p>
    ${otyControls()}
    ${otyTiles(rows)}
    ${shell}
  </div>`;
  otySeasonPlace();
}
function otyControls() {
  const keys = OTY_ORDER.filter(k => otyD.sets[k]);
  const lab = k => k === 'ALL' ? 'All four' : k === 'LFL' ? 'Like for like' : k === 'ALLF' ? 'All + Fratelli' : k === 'FRT' ? 'Fratelli (closed)' : OTY_NAME[k];
  const bp = keys.map(k => `<button class="oty-pill" aria-pressed="${k === OTY.b}" onclick="otySet('b','${k}')">${lab(k)}</button>`).join('');
  return `<div class="oty-lab">Branches</div><div class="oty-pills">${bp}</div>
    <div class="oty-lab">Compare on</div><div class="oty-pills">
      <button class="oty-pill" aria-pressed="${OTY.basis === 'same'}" onclick="otySet('basis','same')">Same days (1 Jan – ${otyCutLabel()})</button>
      <button class="oty-pill" aria-pressed="${OTY.basis === 'full'}" onclick="otySet('basis','full')">Full years</button></div>`;
}
function otySet(k, v) { OTY[k] = v; otySave(); otyDraw(); }
function otyPick(i) { OTY.sel = i; otyDraw(); }
// Kate, 13 Oct 2026: the tiles ignored the Compare on switch (Full years still said "1 Jan – 12 Oct" and "same days").
// Full years now shows the last two whole years, each against the whole year before it, and says where this year stands.
function otyTiles(rows) {
  const n = rows.length, set = otyD.sets[OTY.b], cy = otyD.curYear, c = otyCutLabel();
  const sumW = (w, i) => i >= 0 ? otySum(set, 'net', w, i) : 0;
  const tile = (cls, k, v, p, vs) => `<div class="oty-card oty-tile ${cls}"><div class="k">${k}</div><div class="v">${otyM(v)}</div><div class="s">${otySetName(OTY.b)}</div>${otyChg(p)}<div class="s" style="margin-top:6px">${vs}</div></div>`;
  if (OTY.basis === 'full') {
    const a = n - 2, b = n - 3, c2 = n - 4, ys = otyD.years;
    const va = sumW('full', a), vb = sumW('full', b), vc = sumW('full', c2);
    return `<div class="oty-tiles">
      ${tile('now', `${ys[a]} · full year`, va, otyPct(vb, va), `on the full year ${ys[b]}`)}
      ${tile('', `${ys[b]} · full year`, vb, c2 >= 0 ? otyPct(vc, vb) : null, c2 >= 0 ? `on the full year ${ys[c2]}` : '')}
    </div>
    <p class="oty-note" style="margin:10px 2px 0">${cy} is part-way, so it is not set against a whole year: ${otyM(sumW('ytd', n - 1))} from 1 Jan to ${c}.</p>`;
  }
  const cur = sumW('ytd', n - 1), prev = sumW('ytd', n - 2), prev2 = sumW('ytd', n - 3);
  return `<div class="oty-tiles">
    ${tile('now', `${cy} · 1 Jan – ${c}`, cur, otyPct(prev, cur), `on the same days of ${cy - 1}`)}
    ${tile('', `${cy - 1} · 1 Jan – ${c}`, prev, otyPct(prev2, prev), `on the same days of ${cy - 2}`)}
  </div>`;
}
// Kate, 9 Oct 2026: "it's too big" on a desktop. The charts were drawn on a 360 unit phone canvas and then
// stretched to the page, so at 1000px wide the type was 3x and the chart taller than the screen. Now the canvas
// is as wide as the page (up to 820 units) and flatter (78% of the phone height, about 290px on screen at
// full width), so the type stays near its true size and a chart plus its legend fits one screen. Under 560px, a phone, it is the 360 unit canvas as before.
function otyCanvas(h) {
  const host = document.getElementById('overYearsContent');
  const w = Math.min(1100, (host && host.clientWidth) || window.innerWidth) - 30;
  const W = w >= 560 ? Math.min(Math.round(w), 820) : 360;
  return { W, H: W > 360 ? Math.round(h * .78) : h, bmax: W > 360 ? 64 : 30 };
}
// Kate, 9 Oct 2026: per visit leads on this page, with a small hover note on why (the 2021 to 2024 ledgers are
// not fully attached, so the per staff counts for those years are incomplete).
const OTY_WHY = 'Per visit counts each client once a day, through the door. Per staff counts a client once for each staff who served her, and the 2021 to 2024 per staff figures are not complete yet, so per visit leads on this page.';
const otyWhy = label => typeof ihTip === 'function' ? ihTip(label, OTY_WHY) : label;
function otyChartBlock(rows) {
  const { years, sets } = otyD, set = sets[OTY.b], n = years.length;
  const { W, H, bmax } = otyCanvas(300), L = 38, R = 38, T = 26, B = 30, bw = (W - L - R) / n, bar = Math.min(bmax, bw * .62);
  const maxNet = Math.max(...rows.map(r => r.net), 1) * 1.12, yb = v => T + (H - T - B) * (1 - v / maxNet);
  // Kate, 9 Oct 2026: the 2021 to 2024 ledgers are not fully attached yet, so the line has to say which count it
  // is: per staff (a client counts once for each staff who served her) or per visit (each client once a day).
  const LINES = { growth: r => r.growth, avg: r => r.avg, avgV: r => r.avgV, stf: r => r.stf, vis: r => r.vis };
  const LN = LINES[OTY.line] ? OTY.line : 'growth', isAvg = LN === 'avg' || LN === 'avgV';
  const vals = rows.map(LINES[LN]);
  const nums = vals.filter((v, i) => v != null && (v !== 0 || LN === 'growth'));
  let lo, hi;
  if (LN === 'growth') { lo = Math.min(-10, ...nums); hi = Math.max(10, ...nums); lo = Math.floor(lo / 10) * 10; hi = Math.ceil(hi / 10) * 10; }
  else { lo = Math.min(...(nums.length ? nums : [0])) * .85; hi = Math.max(...(nums.length ? nums : [1])) * 1.08; }
  const yl = v => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  const fmtL = v => LN === 'growth' ? (v > 0 ? '+' : '') + Math.round(v) + '%' : isAvg ? Math.round(v) : v >= 1000 ? (v / 1000).toFixed(0) + 'k' : Math.round(v);
  const sel = OTY.sel;
  let g = `<rect x="${L + bw * sel}" y="${T - 6}" width="${bw}" height="${H - T - B + 6}" fill="var(--accent)" opacity=".1" rx="4"/>`;
  for (let k = 0; k <= 4; k++) {
    const v = maxNet * k / 4, y = yb(v);
    g += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="var(--border)"/><text x="${L - 6}" y="${y + 3.5}" text-anchor="end" font-size="9.5">${v === 0 ? '0' : otyMs(v)}</text>`;
    const lv = lo + (hi - lo) * k / 4;
    g += `<text class="tl" x="${W - R + 6}" y="${yl(lv) + 3.5}" font-size="9.5">${fmtL(lv)}</text>`;
  }
  if (LN === 'growth' && lo < 0) g += `<line x1="${L}" x2="${W - R}" y1="${yl(0)}" y2="${yl(0)}" stroke="var(--warn)" stroke-opacity=".4" stroke-dasharray="3 3"/>`;
  rows.forEach((r, i) => {
    const cx = L + bw * i + bw / 2, x0 = cx - bar / 2; let acc = 0;
    r.per.forEach(p => {
      if (!p.v) return;
      const h = (H - T - B) * p.v / maxNet, y = yb(acc + p.v); acc += p.v;
      g += `<rect class="seg" x="${x0}" y="${y}" width="${bar}" height="${h}" fill="${set.length === 1 ? 'var(--hair)' : OTY_COL[p.b]}" opacity="${r.partial ? .5 : .92}" ${r.partial ? 'stroke="var(--text)" stroke-opacity=".6" stroke-dasharray="3 2"' : ''}${otyTT(p.b, r.y, otyM(p.v) + ' net take', r.net ? p.v / r.net * 100 : 0, `of the ${otyM(r.net)} ${r.y}${r.partial ? '*' : ''} total`, OTY.basis === 'same' || r.partial ? `1 Jan – ${otyCutLabel()}` : 'full year')}/>`;
    });
    g += `<text class="tv" x="${cx}" y="${yb(r.net) - 5}" text-anchor="middle" font-size="9.5">${r.net ? otyMs(r.net) : '·'}</text>`;
    g += `<text x="${cx}" y="${H - 10}" text-anchor="middle" font-size="10.5" style="${i === sel ? 'fill:var(--accent);font-weight:700' : ''}">${r.y}${r.partial ? '*' : ''}</text>`;
  });
  const pts = rows.map((r, i) => ({ i, v: vals[i] })).filter(p => p.v != null && (p.v !== 0 || LN === 'growth'));
  if (pts.length) g += `<path d="${pts.map((p, k) => (k ? 'L' : 'M') + (L + bw * p.i + bw / 2).toFixed(1) + ' ' + yl(p.v).toFixed(1)).join(' ')}" fill="none" stroke="var(--warn)" stroke-width="2.4" stroke-linejoin="round"/>`;
  pts.forEach(p => g += `<circle cx="${L + bw * p.i + bw / 2}" cy="${yl(p.v)}" r="${p.i === sel ? 5 : 3.5}" fill="${p.i === sel ? 'var(--bg)' : 'var(--warn)'}" stroke="var(--warn)" stroke-width="2"/>`);
  const lineName = { growth: OTY.basis === 'full' ? `Growth vs the year before (full years, ${otyD.curYear} on the same days)` : 'Growth vs the year before (same days)', avg: 'Average bill per staff (AED)', avgV: 'Average bill per visit (AED)',
    stf: 'Clients per staff', vis: 'Clients per visit' }[LN];
  // Kate, 13 Oct 2026: the points are hoverable (and tappable) too: a bigger invisible circle on each one says what it is.
  const fv = v => LN === 'growth' ? (v > 0 ? '+' : '') + v.toFixed(1) + '%' : isAvg ? otyAed(v) : otyNum(v);
  pts.forEach(p => g += `<circle class="hit" cx="${L + bw * p.i + bw / 2}" cy="${yl(p.v)}" r="11" fill="transparent"${otyTTh(`<div class="h"><b>${rows[p.i].y}${rows[p.i].partial ? '*' : ''}</b></div><div class="v">${fv(p.v)}</div><div class="s">${lineName}</div><div class="s">Net take <b>${otyM(rows[p.i].net)}</b></div>`)}/>`);
  const legend = (set.length > 1 ? set.map(b => `<span><i style="background:${OTY_COL[b]}"></i>${OTY_NAME[b]}</span>`).join('') : `<span><i style="background:var(--hair)"></i>${OTY_NAME[set[0]]}</span>`)
    + `<span><i class="ln" style="background:var(--warn)"></i>${lineName}</span>`;
  const r = rows[sel], lab = OTY.basis === 'same' || r.partial ? `1 Jan – ${otyCutLabel()}` : 'full year';
  const split = r.per.filter(p => p.v).map(p => `<span><i class="oty-bdot" style="background:${OTY_COL[p.b]}"></i><b>${OTY_NAME[p.b]}</b> ${otyM(p.v)}</span>`).join('');
  // Kate, 9 Oct 2026: "make info here easy to read". The readout under the chart was a heading line and a
  // pile of plain lines in two columns. It is now the year as a heading, four figure tiles (value big, label
  // small, the per visit figure under the avg bill), and one row per branch with its share of the take.
  const gTxt = r.growth == null ? '·' : otyTxt(r.growth);
  const tile = (k, v, s) => `<div class="oty-rs"><div class="k">${k}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
  const branchRow = p => { const sh = r.net ? p.v / r.net * 100 : 0;
    return `<div class="oty-rbr"><div class="m"><b><i class="oty-bdot" style="background:${OTY_COL[p.b]}"></i>${OTY_NAME[p.b]}</b><span>${otyM(p.v)} <em>${Math.round(sh)}%</em></span></div>
      <div class="tr"><i style="width:${Math.max(2, sh).toFixed(1)}%;background:${OTY_COL[p.b]}"></i></div></div>`; };
  const readout = `<div class="oty-rh"><b>${r.y}</b><span>${lab}</span></div>
    <div class="oty-rt">
      ${tile('Net take', otyM(r.net), '')}
      ${tile(otyWhy('Clients · per visit'), r.vis ? otyNum(r.vis) : '·', r.stf ? `Per staff ${otyNum(r.stf)}` : '')}
      ${tile(otyWhy('Avg bill · per visit'), r.avgV ? otyAed(r.avgV) : '·', r.avg ? `Per staff ${otyAed(r.avg)}` : '')}
      ${tile('Growth', gTxt, r.y > otyD.years[0] ? `vs ${r.y - 1}` : '')}
    </div>
    ${set.length > 1 ? `<div class="oty-rb">${r.per.filter(p => p.v).map(branchRow).join('')}</div>` : ''}`;
  const pills = '<span class="oty-lab" style="margin:0 2px 0 0;align-self:center">Line</span>'
    + [['growth', 'Growth vs last year'], ['avgV', 'Avg bill · per visit'], ['avg', 'Avg bill · per staff'], ['vis', 'Clients · per visit'], ['stf', 'Clients · per staff']]
    .map(([k, l]) => `<button class="oty-pill" aria-pressed="${LN === k}" onclick="otySet('line','${k}')">${l}</button>`).join('');
  return `<div class="oty-eb"><i style="background:var(--hair)"></i>Net take by year, with the line on top</div>
    <div class="oty-card"><div class="oty-pills" style="margin-bottom:12px">${pills}</div><div class="oty-legend">${legend}</div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Net take by year, as bars, with a line" onpointerdown="otyTapChart(event,${n},${L},${R},${W})">${g}</svg>
    <div class="oty-read">${readout}</div></div>
    <p class="oty-note" style="margin:10px 2px 0">${OTY.basis === 'full' ? `* ${otyD.curYear} is 1 Jan to ${otyCutLabel()} only, shown faded. ` : `Every bar is 1 Jan to ${otyCutLabel()} of that year. `}The line reads on the right-hand scale. Growth over 100% is a year new branches opened in, so it is left off the line. Tap a year.</p>`;
}
// Kate, 13 Oct 2026: "when i hover, lalabas dapat kung anong branch yan and values associated". Each stacked segment
// carries its branch, year, figure and share as data attributes; otyHov() writes them into the card's one floating box.
function otyTT(b, y, val, share, of, when) {
  const d = { b: OTY_NAME[b] || b, c: OTY_COL[b] || 'var(--hair)', y, v: val, s: Math.round(share), of, w: when };
  return ' ' + Object.entries(d).map(([k, v]) => `data-t${k}="${otyEsc(v)}"`).join(' ') + ' onpointerenter="otyHov(event,this)" onpointermove="otyHov(event,this)" onpointerleave="otyHovOff(this)"';
}
// A point or a month column: the whole line of facts goes in as html (already escaped by the caller).
function otyTTh(html) {
  return ` data-thtml="${otyEsc(html)}" onpointerenter="otyHov(event,this)" onpointermove="otyHov(event,this)" onpointerleave="otyHovOff(this)"`;
}
function otyHov(ev, el) {
  const card = el.closest('.oty-card'); if (!card) return;
  let tt = card.querySelector('.oty-tt');
  if (!tt) { tt = document.createElement('div'); tt.className = 'oty-tt'; card.appendChild(tt); }
  const d = el.dataset;
  tt.innerHTML = d.thtml || `<div class="h"><i style="background:${d.tc}"></i><b>${d.tb}</b><span>${d.ty}</span></div><div class="v">${d.tv}</div><div class="s"><b>${d.ts}%</b> ${d.tof}</div><div class="s">${d.tw}</div>`;
  tt.classList.add('on');
  const cr = card.getBoundingClientRect(), x = ev.clientX - cr.left, y = ev.clientY - cr.top;
  const w = tt.offsetWidth, h = tt.offsetHeight;
  tt.style.left = Math.max(6, Math.min(cr.width - w - 6, x + 16 > cr.width - w - 6 ? x - w - 16 : x + 16)) + 'px';
  tt.style.top = Math.max(6, y - h - 12 < 6 ? y + 16 : y - h - 12) + 'px';
}
function otyHovOff(el) { const c = el.closest('.oty-card'), t = c && c.querySelector('.oty-tt'); if (t) t.classList.remove('on'); }
function otyTapChart(ev, n, L, R, W) {
  const r = ev.currentTarget.getBoundingClientRect(), px = (ev.clientX - r.left) / r.width * W, bw = (W - L - R) / n;
  otyPick(Math.max(0, Math.min(n - 1, Math.floor((px - L) / bw))));
}
function otyTable(rows) {
  let h = '<tr><th>Year</th><th>Net take</th><th>Clients per visit</th><th>Clients per staff</th><th>Avg bill per visit</th><th>Avg bill per staff</th><th>Growth</th></tr>';
  rows.slice().reverse().forEach(r => {
    h += `<tr><td>${r.y}${r.partial ? '*' : ''}</td><td>${otyM(r.net)}</td><td class="m">${r.vis ? otyNum(r.vis) : '·'}</td><td class="m">${otyNum(r.stf)}</td><td class="m">${r.avgV ? Math.round(r.avgV) : '·'}</td><td class="m">${r.avg ? Math.round(r.avg) : '·'}</td><td class="${r.growth == null ? 'm' : r.growth > 0 ? 'oty-up' : 'oty-dn'}">${r.growth == null ? (r.big ? 'new' : '·') : (r.growth > 0 ? '+' : '') + r.growth.toFixed(1) + '%'}</td></tr>`;
  });
  return `<div class="oty-eb"><i style="background:var(--warn)"></i>${otyWhy('The years, side by side')}</div>
    <div class="oty-card"><table>${h}</table></div>`;
}

// ── SEASONS ──────────────────────────────────────────────────────────────
// Kate, 13 Oct 2026: season on season is one chart, not four cards. Four seasons side by side, a bar per year in each,
// the pill above a season being this year against last year. Switches: Where (Abu Dhabi, Dubai, side by side, or one
// branch) and Years shown (the last five by default, a chip per year, All years for the full range). Mocked up in
// Downloads/season-on-season-mockup.html. The numbers come from over_the_years().season_br (a row per branch, season
// and year); the season names and dates from .seasons.
//  - Per open day, because the seasons run different lengths. A region adds its branches together, and a season only
//    gets a bar when every branch of the region traded it: one branch against two is not like for like, so it says
//    "1 of 2 open" instead (Dubai before Al Quoz opened in Sep 2023).
//  - A season still running is set against the same days of last year (tot_w, days_w), not all of last year's season.
const OTY_REGION = { AD: ['SAA', 'KCA'], DXB: ['MC', 'AQ'] };
const OTY_REGION_NAME = { AD: 'Abu Dhabi', DXB: 'Dubai' };
const OTY_SEASON_COL = ['#FFD4D9', '#EEF3C7', '#C4B5FD', '#99F6E4'];
const OTY_AGE = ['#99F6E4', '#C4B5FD', '#9a94c4', '#807cab', '#6d6a95', '#5d5a80'];
const otyAge = y => OTY_AGE[Math.min(otyD.curYear - y, OTY_AGE.length - 1)];
const otyFullDay = iso => `${otyDay(iso)} ${iso.slice(0, 4)}`;
const otyK = v => (v / 1000).toFixed(1) + 'k';
const otySLen = r => Math.round((new Date(r.end_date) - new Date(r.start_date)) / 864e5) + 1;

let otyModelMemo = { raw: null, m: null };
function otySeasonModel() {
  if (otyModelMemo.raw === otyRaw && otyModelMemo.m) return otyModelMemo.m;
  const { years, cut, present, curYear } = otyD;
  const cal = (otyRaw.seasons || []), br = (otyRaw.season_br || []);
  const names = [...new Set(cal.slice().sort((a, b) => a.sort - b.sort).map(r => r.season))];
  const vis = b => present.includes(b) && b !== 'FRT';
  const regions = {};   // only the branches this login can see
  for (const k of Object.keys(OTY_REGION)) { const bs = OTY_REGION[k].filter(vis); if (bs.length) regions[k] = bs; }
  OTY_BR.filter(b => b !== 'FRT' && vis(b)).forEach(b => { regions[b] = [b]; });
  const dates = (nm, y) => cal.find(r => r.season === nm && r.y === y);
  const row = (b, nm, y) => br.find(r => r.b === b && r.season === nm && r.y === y && +r.tot > 0);
  // one season in one year for a set of branches: a bar, or why there is none
  const cell = (bs, nm, y, win) => {
    const d = dates(nm, y); if (!d) return null;
    const rs = bs.map(b => row(b, nm, y)).filter(Boolean);
    const out = { y, start_date: d.start_date, end_date: d.end_date, open: rs.length, of: bs.length, per: null, tot: null, days: 0 };
    if (!rs.length) return out;
    const days = Math.max(...rs.map(r => +r.days)), tot = rs.reduce((t, r) => t + +r.tot, 0);
    if (rs.length === bs.length) { out.per = tot / days; out.tot = tot; out.days = days; }
    else { out.partPer = tot / days; }
    if (win) {   // the same days as the running season, in this year
      const w = bs.map(b => row(b, nm, y)).filter(r => r && +r.days_w > 0);
      if (w.length === bs.length) out.perW = w.reduce((t, r) => t + +r.tot_w, 0) / Math.max(...w.map(r => +r.days_w));
    }
    return out;
  };
  const state = c => c.start_date > cut ? 'ahead' : c.end_date > cut ? 'live' : 'done';
  const build = key => {
    const bs = regions[key];
    return names.map(nm => {
      const cells = years.map(y => cell(bs, nm, y, true)).filter(Boolean);
      const cur = cells.find(c => c.y === curYear), prev = cells.find(c => c.y === curYear - 1);
      const s = cur ? state(cur) : 'ahead';
      const base = s === 'live' ? (prev && prev.perW) : (prev && prev.per);
      return { nm, cells, cur, state: s, chg: cur && cur.per != null && base ? (cur.per - base) / base * 100 : null, base };
    });
  };
  return (otyModelMemo = { raw: otyRaw, m: { names, regions, build, state } }).m;
}

function otySeasons() {
  const { years, curYear, cut } = otyD;
  if (!(otyRaw.seasons || []).length || !(otyRaw.season_br || []).length) return '';
  const M = otySeasonModel(), keys = Object.keys(M.regions);
  if (!keys.length) return '';
  if (!M.regions[OTY.sreg] && OTY.sreg !== 'BOTH') OTY.sreg = M.regions.AD ? 'AD' : keys[0];
  if (OTY.sreg === 'BOTH' && !(M.regions.AD && M.regions.DXB)) OTY.sreg = keys[0];
  let ys = (OTY.syrs || []).filter(y => years.includes(y));
  if (!ys.length) ys = years.slice(-5);
  OTY.syrs = ys; const shown = new Set(ys);
  const last5 = years.slice(-5), isLast5 = shown.size === last5.length && last5.every(y => shown.has(y)), isAll = shown.size === years.length;

  const regPills = [['AD', 'Abu Dhabi'], ['DXB', 'Dubai']].filter(([k]) => M.regions[k]).concat(M.regions.AD && M.regions.DXB ? [['BOTH', 'Side by side']] : [])
    .map(([k, l]) => `<button class="oty-pill" aria-pressed="${OTY.sreg === k}" onclick="otySeasonSet('sreg','${k}')">${l}</button>`).join('');
  const brPills = OTY_BR.filter(b => M.regions[b]).map(b => `<button class="oty-pill" aria-pressed="${OTY.sreg === b}" onclick="otySeasonSet('sreg','${b}')">${OTY_NAME[b]}</button>`).join('');
  const yrChips = years.map(y => `<button class="oty-chip" aria-pressed="${shown.has(y)}" onclick="otySeasonYear(${y})"><i style="background:${otyAge(y)}"></i>${y}</button>`).join('');
  const hint = isLast5 ? `Showing ${last5[0]} to ${curYear}. Tap a year to add or remove it, or pick All years for the full range.`
    : isAll ? `Showing every year from ${years[0]}.` : `Showing ${ys.join(', ')}. Tap a year to add or remove it.`;
  const charts = OTY.sreg === 'BOTH' ? otySeasonChart('AD', M, shown, 165) + otySeasonChart('DXB', M, shown, 165) : otySeasonChart(OTY.sreg, M, shown, 210);
  const dxb = OTY.sreg === 'DXB' || OTY.sreg === 'BOTH';
  const running = M.build(OTY.sreg === 'BOTH' ? 'AD' : OTY.sreg).find(s => s.state === 'live');
  const notes = (running ? `<p><b>${otyEsc(running.nm)} is still running</b> (${running.cur.days} of ${otySLen(running.cur)} days), so its ${curYear} bar is striped. The pill compares those ${running.cur.days} days with the same days of ${curYear - 1}, not with all of last year's season, so it is a fair read and can still move before the season closes.</p>` : '')
    + (dxb ? `<p><b>Dubai starts later.</b> Al Quoz opened in Sep 2023, so Autumn 2023 is the first season with both Dubai branches. A season where only some branches traded is marked "1 of 2 open" and left out of the bars, because one branch against two is not like for like.</p>` : '')
    + `<p>Per open day, because the seasons run different lengths. The season list is one table (oty_seasons); the four here are a placeholder until Emma sets the real ones.</p>`;
  return `<div class="oty-eb"><i style="background:var(--hair)"></i>Season on season · per open day</div>
    <p class="oty-deck" style="font-size:clamp(14px,3.4vw,16px)">How each season is doing against the same season last year. Mint is this year, lavender last year.</p>
    ${otySeasonCal(M)}
    <div class="oty-card" style="margin-top:12px">
      <div class="oty-lab" style="margin-top:0">Where</div><div class="oty-pills">${regPills}${regPills && brPills ? '<span class="oty-sep"></span>' : ''}${brPills}</div>
      <div class="oty-lab">Years shown</div><div class="oty-pills"><button class="oty-pill" aria-pressed="${isLast5}" onclick="otySeasonYears('last5')">Last 5 years</button><button class="oty-pill" aria-pressed="${isAll}" onclick="otySeasonYears('all')">All years</button><span class="oty-sep"></span>${yrChips}</div>
      <div class="oty-hint">${hint}</div>
    </div>
    ${charts}
    <p class="oty-note" style="margin:10px 2px 0"><b>Hover or tap a bar</b> for that year's exact dates, open days, per-day figure and season total. Ramadan and Eid move about 11 days earlier every year, so each bar carries its own dates.</p>
    <div class="oty-card oty-flag oty-note" style="margin-top:10px">${notes}</div>`;
}
function otySeasonSet(k, v) { OTY[k] = v; otySave(); otyDraw(); }
function otySeasonYears(m) { OTY.syrs = m === 'all' ? otyD.years.slice() : otyD.years.slice(-5); otySave(); otyDraw(); }
function otySeasonYear(y) {
  const s = new Set(OTY.syrs || []);
  if (s.has(y)) { if (s.size > 1) s.delete(y); } else s.add(y);
  OTY.syrs = [...s].sort((a, b) => a - b); otySave(); otyDraw();
}

// the year laid out by season, with today marked
function otySeasonCal(M) {
  const { curYear, cut } = otyD, start = new Date(curYear, 0, 1), pos = iso => ((new Date(iso + 'T00:00:00') - start) / 864e5) / 365 * 100;
  const cal = otyRaw.seasons || [];
  const bands = M.names.map((nm, i) => {
    const r = cal.find(x => x.season === nm && x.y === curYear); if (!r) return '';
    const x = pos(r.start_date), w = pos(r.end_date) - x + 100 / 365, live = r.start_date <= cut && r.end_date > cut;
    return `<div class="oty-band ${live ? 'live' : ''}" tabindex="0" data-band="${otyEsc(nm)}" style="left:${x}%;width:${w}%;background:${OTY_SEASON_COL[i % 4]}">${w > 16 ? otyEsc(nm) : w > 6 ? otyEsc(nm.split(' ')[0]) : ''}</div>`;
  }).join('');
  return `<div class="oty-card oty-cal" style="margin-top:12px"><div class="oty-trackw"><div class="oty-track">${bands}</div><div class="oty-today" tabindex="0" aria-label="We're here, ${otyDay(cut)}" style="left:${pos(cut)}%"><span>We're here · ${otyDay(cut)}</span></div></div>
    <div class="oty-months">${OTY_MON.map(m => `<span>${m}</span>`).join('')}</div>
    <p class="oty-note" style="margin:10px 0 0">${curYear} laid out by season. The white line is the last day of takings (${otyDay(cut)}). The gap between Ramadan and summer is not part of any season.</p></div>`;
}

function otySeasonChart(key, M, shown, H) {
  const { years, curYear, cut } = otyD, seasons = M.build(key), yrs = years.filter(y => shown.has(y));
  const bs = M.regions[key], title = OTY_REGION_NAME[key] || OTY_NAME[key];
  const vals = seasons.flatMap(s => s.cells.filter(c => shown.has(c.y) && c.per != null).map(c => c.per));
  const raw = Math.max(...vals, 1) * 1.1, step = [1000, 2000, 2500, 5000, 10000, 20000, 50000].find(s => raw / s <= 5) || 50000;
  const MAXV = Math.max(step * 2, Math.ceil(raw / step) * step);
  const grid = Array.from({ length: MAXV / step + 1 }, (_, i) => i * step).map(v => `<div class="oty-gl" style="bottom:${v / MAXV * H}px"><span>${v ? (v / 1000) + 'k' : '0'}</span></div>`).join('');
  const groups = seasons.map(s => {
    const pill = s.chg == null ? `<span class="oty-dp flat">${s.state === 'ahead' ? 'not started' : 'n/a'}</span>`
      : `<span class="oty-dp ${Math.abs(s.chg) < .5 ? 'flat' : s.chg > 0 ? 'up' : 'dn'}">${s.chg > 0 ? '+' : ''}${s.chg.toFixed(1)}%</span>`;
    const small = s.state === 'live' ? `${curYear} so far, vs same days of ${curYear - 1}` : s.state === 'ahead' ? 'opens ' + otyDay(s.cur.start_date) : `${curYear} vs ${curYear - 1}`;
    const bars = s.cells.filter(c => shown.has(c.y)).map(c => {
      const none = c.per == null, isCur = c.y === curYear, live = isCur && s.state === 'live';
      const lab = none ? (c.open ? `${c.open} of ${c.of} open` : (c.start_date <= cut ? 'no data' : '')) : otyK(c.per);
      return `<div class="oty-bar ${isCur ? 'cur' : ''} ${none ? 'void' : ''} ${live ? 'part' : ''}" tabindex="0" data-k="${key}" data-s="${otyEsc(s.nm)}" data-y="${c.y}"><span class="vl">${lab}</span><div class="b" style="height:${none ? 3 : Math.max(4, c.per / MAXV * H)}px;background:${otyAge(c.y)}"></div></div>`;
    }).join('');
    return `<div class="oty-grp"><div class="oty-delta">${pill}<small>${small}</small></div><div class="oty-bars" style="--H:${H}px">${bars}</div></div>`;
  }).join('');
  const yrRow = M.names.map(() => `<div><div class="oty-yl">${yrs.map(y => `<span class="${y === curYear ? 'cur' : ''}">${yrs.length > 6 ? String(y).slice(2) : y}</span>`).join('')}</div></div>`).join('');
  // a season whose dates change year to year (Ramadan and Eid) says so; the exact dates are on each bar
  const moves = nm => { const rs = (otyRaw.seasons || []).filter(r => r.season === nm); return rs.some(r => r.start_date.slice(5) !== rs[0].start_date.slice(5) || r.end_date.slice(5) !== rs[0].end_date.slice(5)); };
  const names = M.names.map((nm, i) => { const s = seasons[i], r = s.cur;
    return `<div><b><i style="background:${OTY_SEASON_COL[i % 4]}"></i>${otyEsc(nm)}</b><span class="${s.state === 'live' ? 'live' : ''}">${r ? `${otyDay(r.start_date)} to ${otyDay(r.end_date)}${s.state === 'live' ? ' · running' : moves(nm) ? ' · moves each year' : ''}` : ''}</span></div>`; }).join('');
  const n = M.names.length;
  return `<div class="oty-card" style="margin-top:12px"><div class="oty-chead"><b>${otyEsc(title)}</b><span>${bs.map(b => OTY_NAME[b]).join(' + ')} · per open day</span></div>
    <div class="oty-plot" data-plot><div class="oty-grid">${grid}</div><div class="oty-groups" style="grid-template-columns:repeat(${n},minmax(0,1fr))">${groups}</div>
    <div class="oty-grpyrs" style="grid-template-columns:repeat(${n},minmax(0,1fr))">${yrRow}</div>
    <div class="oty-names" style="grid-template-columns:repeat(${n},minmax(0,1fr))">${names}</div></div></div>`;
}
// line the gridlines up with the bars, which start below the pill row
function otySeasonPlace() {
  document.querySelectorAll('#overYearsContent [data-plot]').forEach(pl => {
    const g = pl.querySelector('.oty-grid'), br = pl.querySelector('.oty-bars').getBoundingClientRect(), pr = pl.getBoundingClientRect();
    g.style.bottom = (pr.bottom - br.bottom) + 'px'; g.style.height = br.height + 'px';
  });
}
// tooltip: hover on a desktop, tap on a phone. One box on the page, delegated, so a redraw does not lose it.
function otySeasonTip(el, ev) {
  const M = otySeasonModel(), key = el.dataset.k, nm = el.dataset.s, y = +el.dataset.y;
  const bs = M.regions[key]; if (!bs) return;
  const cells = M.build(key).find(s => s.nm === nm); if (!cells) return;
  const c = cells.cells.find(x => x.y === y); if (!c) return;
  const cut = otyD.cut, curYear = otyD.curYear, st = M.state(c), L = otySLen(c);
  const who = OTY_REGION_NAME[key] || OTY_NAME[key];
  let tt = document.getElementById('otySeasonTip');
  if (!tt) { tt = document.createElement('div'); tt.id = 'otySeasonTip'; tt.className = 'oty-stt'; document.body.appendChild(tt); }
  const head = `<div class="h"><i style="background:${otyAge(y)}"></i><b>${otyEsc(nm)}</b><span>${y} · ${otyEsc(who)}</span></div>`;
  const dates = `${otyFullDay(c.start_date)} to ${otyFullDay(c.end_date)}`;
  let body;
  if (c.per == null) {
    const why = c.open ? `Only ${c.open} of ${c.of} branches traded it${c.partPer ? ` (AED ${otyNum(c.partPer)} a day)` : ''}, so one branch against ${c.of} is not like for like.` : c.start_date > cut ? '' : 'No takings held for this season.';
    body = `<div class="v" style="font-size:14px">${c.start_date > cut ? 'Not started yet' : 'Not shown'}</div><div>${dates}</div>${why ? `<div style="margin-top:4px">${why}</div>` : ''}`;
  } else {
    const pr = cells.cells.find(x => x.y === y - 1), dd = pr && pr.per ? (c.per - pr.per) / pr.per * 100 : null;
    const chgTxt = (v, lab) => `<div>${lab}: <b class="${v >= 0 ? 'oty-up' : 'oty-dn'}">${v > 0 ? '+' : ''}${v.toFixed(1)}%</b></div>`;
    body = `<div class="v">${otyAed(c.per)} <small>per open day</small></div><div>${dates}</div>
      <div>${st === 'live' ? `${c.days} of ${L} days so far` : `${L} days`} · season total <b>${(c.tot / 1e6).toFixed(2)}M</b>${st === 'live' ? ' so far' : ''}</div>
      ${st === 'live' && y === curYear && cells.chg != null ? chgTxt(cells.chg, `vs the same ${c.days} days of ${y - 1}`) : dd == null ? '' : chgTxt(dd, `vs ${y - 1}`)}`;
  }
  tt.innerHTML = head + body; tt.classList.add('on');
  const w = tt.offsetWidth, h = tt.offsetHeight, bx = el.getBoundingClientRect();
  let x = bx.left + bx.width / 2 - w / 2; x = Math.max(8, Math.min(innerWidth - w - 8, x));
  let yy = (ev && ev.clientY ? ev.clientY : bx.top) - h - 14; if (yy < 8) yy = bx.bottom + 10;
  tt.style.left = x + 'px'; tt.style.top = yy + 'px';
  document.querySelectorAll('.oty-bar.sel').forEach(b => b.classList.remove('sel')); el.classList.add('sel');
}
// hover or tap a season on the calendar strip: its name and the dates it runs this year
function otyBandTip(el, ev) {
  const nm = el.dataset.band, curYear = otyD.curYear, cut = otyD.cut;
  const cal = (otyRaw.seasons || []).filter(r => r.season === nm), r = cal.find(x => x.y === curYear); if (!r) return;
  const idx = [...new Set((otyRaw.seasons || []).slice().sort((a, b) => a.sort - b.sort).map(x => x.season))].indexOf(nm);
  const L = otySLen(r), live = r.start_date <= cut && r.end_date > cut, ahead = r.start_date > cut;
  const moves = cal.some(x => x.start_date.slice(5) !== cal[0].start_date.slice(5) || x.end_date.slice(5) !== cal[0].end_date.slice(5));
  let tt = document.getElementById('otySeasonTip');
  if (!tt) { tt = document.createElement('div'); tt.id = 'otySeasonTip'; tt.className = 'oty-stt'; document.body.appendChild(tt); }
  const days = Math.round((new Date(cut) - new Date(r.start_date)) / 864e5) + 1;
  tt.innerHTML = `<div class="h"><i style="background:${OTY_SEASON_COL[idx % 4]}"></i><b>${otyEsc(nm)}</b><span>${curYear}</span></div>
    <div class="v" style="font-size:15px">${otyFullDay(r.start_date)} to ${otyFullDay(r.end_date)}</div>
    <div>${L} days${live ? ` · running, ${days} so far` : ahead ? ' · not started' : ''}</div>${moves ? '<div style="margin-top:4px">Moves about 11 days earlier each year.</div>' : ''}`;
  tt.classList.add('on');
  const w = tt.offsetWidth, h = tt.offsetHeight, bx = el.getBoundingClientRect();
  let x = (ev && ev.clientX ? ev.clientX : bx.left + bx.width / 2) - w / 2; x = Math.max(8, Math.min(innerWidth - w - 8, x));
  let yy = bx.top - h - 10; if (yy < 8) yy = bx.bottom + 10;
  tt.style.left = x + 'px'; tt.style.top = yy + 'px';
}
function otySeasonTipOff() {
  const tt = document.getElementById('otySeasonTip'); if (tt) tt.classList.remove('on');
  document.querySelectorAll('.oty-bar.sel').forEach(b => b.classList.remove('sel'));
}
if (!window.__otySeasonBound) {
  window.__otySeasonBound = true;
  const bar = e => e.target && e.target.closest && e.target.closest('.oty-bar');
  const band = e => e.target && e.target.closest && e.target.closest('.oty-band');
  const show = e => { const b = bar(e), d = band(e); if (b) otySeasonTip(b, e); else if (d) otyBandTip(d, e); };
  document.addEventListener('mouseover', show);
  document.addEventListener('mousemove', show);
  document.addEventListener('mouseout', e => { const sel = '.oty-bar,.oty-band'; if (e.target.closest && e.target.closest(sel) && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest(sel))) otySeasonTipOff(); });
  document.addEventListener('focusin', e => { const b = bar(e), d = band(e); if (b) otySeasonTip(b); else if (d) otyBandTip(d); });
  document.addEventListener('click', e => { if (bar(e) || band(e)) show(e); else otySeasonTipOff(); });
  addEventListener('resize', otySeasonPlace);
}

// ── MONTH BY MONTH ───────────────────────────────────────────────────────
// Kate, 13 Oct 2026, for Coach Emma: the revenue pattern across the months is not the same every year, and she wants to
// see that across all the years. Mocked up in Downloads/month-by-month-mockup.html. The numbers come from
// over_the_years_months() (oty_month_branch: net takings, open days and clients per staff, a row per branch, year and
// month), added up here into a region (Abu Dhabi, Dubai, all four) or one branch.
//  - Shape view: each month's takings per open day set against that year's own average month (100 = an average month).
//    Every year is measured against itself, so growth drops out and what is left is the shape. Peak, low, an average row
//    and a spread row (how far apart the years are in that month) sit with it.
//  - Index base: "same" is Jan to the last finished month, in every year (the default), "full" is all twelve for finished
//    years. A year needs 5+ finished base months, every one with figures for every branch in the region, or its row says
//    why not. Saadiyat and Khalifa City A only started trading in Jul 2021 (May and Jun 2021 are 4 and 6 launch days),
//    so 2021 has no shape of its own and shows in the Change and Actual views from July.
//  - A finished month with under 10 open days counts as not trading yet, so a launch stub cannot skew a year's average.
//  - Change view: a month against the same month a year earlier, per open day, so a month in progress reads against
//    the same number of open days. A dashed edge means Ramadan and Eid fell differently than the year before.
//  - Ramadan and Eid come from oty_seasons (the season named Ramadan), so when Emma resets the season list the marks
//    follow. A month with 10+ days of it gets a crescent.
let otyMoRaw = null, otyMoErr = '', otyMoLoaded = false, otyMoM = null, otyMoMemo = {};
const OTY_MO_REG = { AD: ['SAA', 'KCA'], DXB: ['MC', 'AQ'] };
const OTY_MO_PAL = ['#99F6E4', '#C4B5FD', '#FFD4D9', '#EEF3C7', '#FF9B9B', '#9aa3c7'];
const otyMoCol = y => OTY_MO_PAL[(otyD.curYear - y) % OTY_MO_PAL.length];
const otyMoName = k => k === 'AD' ? 'Abu Dhabi' : k === 'DXB' ? 'Dubai' : k === 'ALL' ? 'All four' : OTY_NAME[k];
const otyMoMetName = { net: 'Net take', clients: 'Clients per staff', bill: 'Average bill per staff' };
const otyMoDim = (y, m) => new Date(y, m + 1, 0).getDate();
const otyMoSign = n => n > 0 ? '+' : n < 0 ? '−' : '';

function otyMoModel() {
  if (otyMoM && otyMoM.raw === otyMoRaw) return otyMoM;
  const MO = {};
  (otyMoRaw.months || []).forEach(r => { const by = MO[r.b] || (MO[r.b] = {}), ym = by[r.y] || (by[r.y] = []); ym[r.m - 1] = r; });
  const have = Object.keys(MO), regions = {};
  for (const k of Object.keys(OTY_MO_REG)) { const bs = OTY_MO_REG[k].filter(b => have.includes(b)); if (bs.length > 1) regions[k] = bs; }
  const open = OTY_BR.filter(b => b !== 'FRT' && have.includes(b));
  if (open.length > 1) regions.ALL = open;
  open.forEach(b => { regions[b] = [b]; });
  otyMoMemo = {};
  return (otyMoM = { raw: otyMoRaw, MO, regions, cut: new Date(otyD.cut + 'T00:00:00') });
}
const otyMoState = (M, y, m) => new Date(y, m, 1) > M.cut ? 'ahead' : new Date(y, m, otyMoDim(y, m)) > M.cut ? 'live' : 'done';
// one month in one year for a region: a figure, or why there is none (no takings held, or only some branches traded)
function otyMoCell(M, reg, y, m) {
  const state = otyMoState(M, y, m); if (state === 'ahead') return { state, y, m };
  const bs = M.regions[reg], rs = bs.map(b => M.MO[b] && M.MO[b][y] && M.MO[b][y][m]).filter(r => r && +r.net > 0 && (state === 'live' || +r.days >= 10));
  const c = { state, y, m, open: rs.length, of: bs.length, dim: otyMoDim(y, m) };
  if (!rs.length) return c;
  c.days = Math.max(...rs.map(r => +r.days));
  if (reg === 'ALL' || rs.length === bs.length) {
    c.tot = rs.reduce((t, r) => t + +r.net, 0);
    if (rs.every(r => +r.stf > 0)) { c.stf = rs.reduce((t, r) => t + +r.stf, 0); c.avg = c.tot / c.stf; }
  }
  return c;
}
const otyMoCells = (M, reg) => otyMoMemo['c' + reg] || (otyMoMemo['c' + reg] = otyD.years.map(y => Array.from({ length: 12 }, (_, m) => otyMoCell(M, reg, y, m))));
// Ramadan and Eid, from the season list: the days of it that fall in a month
function otyRam(y) { const r = (otyRaw.seasons || []).find(s => /ramadan/i.test(s.season) && s.y === y); return r ? [new Date(r.start_date + 'T00:00:00'), new Date(r.end_date + 'T00:00:00')] : null; }
function otyRamIn(y, m) {
  const r = otyRam(y); if (!r) return 0;
  const lo = Math.max(r[0], new Date(y, m, 1)), hi = Math.min(r[1], new Date(y, m, otyMoDim(y, m)));
  return hi >= lo ? Math.round((hi - lo) / 864e5) + 1 : 0;
}

// everything the section needs for the current switches, in one place
function otyMoCtx() {
  const M = otyMoModel(), keys = Object.keys(M.regions);
  if (!M.regions[OTY.mreg]) OTY.mreg = M.regions.AD ? 'AD' : keys[0];
  const reg = OTY.mreg, met = OTY.mmet, years = otyD.years, curYear = otyD.curYear, X = { M, reg, met, years, curYear, keys };
  X.cell = (y, m) => { const row = otyMoCells(M, reg)[years.indexOf(y)]; return row ? row[m] : null; };
  X.val = c => met === 'net' ? c.tot : met === 'clients' ? c.stf : c.avg;
  X.ok = c => !!c && c.state !== 'ahead' && X.val(c) != null;
  X.pd = c => met === 'bill' ? c.avg : X.val(c) / c.days;
  X.fv = v => met === 'net' ? (v >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : Math.round(v / 1e3) + 'k') : otyNum(v);
  X.fd = v => otyMoSign(v) + X.fv(Math.abs(v));
  X.doneN = [...Array(12).keys()].filter(m => otyMoState(M, curYear, m) === 'done').length;
  X.baseMonths = y => OTY.mbase === 'full' ? [...Array(12).keys()].filter(m => otyMoState(M, y, m) === 'done') : [...Array(X.doneN).keys()];
  X.baseLabel = b => b === 'full' ? 'Full year' : `Jan to ${OTY_MON[Math.max(X.doneN - 1, 0)]}`;
  X.idx = y => {
    const k = ['i', reg, met, OTY.mbase, y].join('|'); if (k in otyMoMemo) return otyMoMemo[k];
    const B = X.baseMonths(y); let out = null;
    if (B.length >= 5 && B.every(m => X.ok(X.cell(y, m)))) {
      const avg = B.reduce((t, m) => t + X.pd(X.cell(y, m)), 0) / B.length;
      out = Array.from({ length: 12 }, (_, m) => { const c = X.cell(y, m); return X.ok(c) ? X.pd(c) / avg * 100 : null; });
    }
    return (otyMoMemo[k] = out);
  };
  X.why = y => {
    const B = X.baseMonths(y), miss = B.filter(m => !X.ok(X.cell(y, m))), held = [...Array(12).keys()].filter(m => X.ok(X.cell(y, m)));
    if (B.length < 5) return `Too few finished months to draw a shape for ${y}.`;
    if (!held.length) return `No takings held for ${y} here.`;
    if (held[0] > 0 && miss.includes(0)) return `Takings are held from ${OTY_MON[held[0]]} ${y}${reg !== 'ALL' && M.regions[reg].length > 1 ? ' with every branch open' : ''}, so ${y} has no full ${X.baseLabel(OTY.mbase)} to set against its own average. It shows in the Change and Actual views.`;
    return `${y} cannot be set against its own average here: no figures for ${miss.map(m => OTY_MON[m]).slice(0, 3).join(', ')}${miss.length > 3 ? ' and more' : ''}.`;
  };
  X.cmp = (y, m) => {
    const c = X.cell(y, m), p = y > years[0] ? X.cell(y - 1, m) : null;
    if (!X.ok(c)) return null; if (!X.ok(p)) return { none: true };
    const cur = X.val(c), prevW = met === 'bill' ? X.val(p) : X.val(p) / p.days * c.days, pct = (cur / prevW - 1) * 100;
    return { cur, prevW, pct, diff: cur - prevW, big: Math.abs(pct) > 100 };
  };
  X.llf = (y, m) => y > years[0] && Math.abs(otyRamIn(y, m) - otyRamIn(y - 1, m)) >= 10;
  X.stats = () => {
    const idx = {}; years.forEach(y => { idx[y] = X.idx(y); });
    const avg = [], spr = [];
    for (let m = 0; m < 12; m++) {
      const xs = years.map(y => idx[y] && otyMoState(M, y, m) === 'done' ? idx[y][m] : null).filter(x => x != null);
      avg[m] = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; spr[m] = xs.length > 1 ? Math.max(...xs) - Math.min(...xs) : null;
    }
    const peak = {}, low = {};
    years.forEach(y => { const ix = idx[y]; if (!ix) return; let mx = -1e9, mn = 1e9; ix.forEach((x, m) => { if (x == null || otyMoState(M, y, m) !== 'done') return; if (x > mx) { mx = x; peak[y] = m; } if (x < mn) { mn = x; low[y] = m; } }); });
    return { idx, avg, spr, peak, low };
  };
  return X;
}
const otyMoHeat = (v, span) => `color-mix(in srgb, var(${v >= 0 ? '--good' : '--bad'}) ${Math.round((Math.min(Math.abs(v) / span, 1) * .52 + .06) * 100)}%, transparent)`;
const otyMoOrd = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : n % 10 > 3 ? 0 : n % 10] || 'th');

function otyMonths() {
  const head = `<div class="oty-eb"><i style="background:var(--hair)"></i>Month by month · the shape of each year</div>`;
  if (!otyMoRaw) return otyMoErr ? `${head}<div class="oty-card oty-flag"><div class="oty-note">${otyEsc(otyMoErr)}</div></div>` : '';
  if (!(otyMoRaw.months || []).length) return '';
  const X = otyMoCtx(); if (!X.keys.length) return '';
  const S = X.stats(), years = X.years, curYear = X.curYear, v = OTY.mview;
  const pill = (key, k, l) => `<button class="oty-pill" aria-pressed="${OTY[key] === k}" onclick="otyMoSet('${key}','${k}')">${l}</button>`;
  const regs = ['AD', 'DXB', 'ALL'].filter(k => X.M.regions[k]), brs = OTY_BR.filter(b => X.M.regions[b] && b !== 'FRT');
  const bases = [['same', `${X.baseLabel('same')}, same months every year`], ['full', 'Full year']];
  const baseHint = OTY.mbase === 'same' ? `Every year is set against its own average of ${X.baseLabel('same')}, the months ${curYear} has finished, so all the years are on the same base. A year without all of those months says so instead.`
    : `Finished years are set against all twelve months, ${curYear} against the ${X.doneN} it has, so ${curYear} is not strictly like for like in this view.`;
  const mname = otyMoMetName[X.met];
  const sub = `${X.M.regions[X.reg].map(b => OTY_NAME[b]).join(' + ')} · ${v === 'index' ? '100 = an average month of that year' : 'tap a month for the detail'}`;
  const title = v === 'index' ? `${mname}, month by month · shape of each year` : v === 'chg' ? `${mname}, each month against the same month a year earlier` : `${mname}, each month`;

  // the grid
  const sel = OTY.mmsel && years.includes(OTY.mmsel.y) ? OTY.mmsel : (OTY.mmsel = { y: curYear, m: Math.max(X.doneN - 1, 0) });
  let g = '<div class="h"></div>' + OTY_MON.map(m => `<div class="h">${m}</div>`).join('') + `<div class="h">${v === 'index' ? 'Peak' : ''}</div><div class="h">${v === 'index' ? 'Low' : ''}</div>`;
  for (const y of years.slice().reverse()) {
    const ix = S.idx[y];
    g += `<div class="yr">${y}</div>`;
    if (v === 'index' && !ix) { g += `<div class="rowmsg">${otyEsc(X.why(y))}</div>`; continue; }
    for (let m = 0; m < 12; m++) {
      const c = X.cell(y, m), st = c.state, moon = otyRamIn(y, m) >= 10 ? '<span class="moon">☾</span>' : '';
      if (st === 'ahead') { g += '<div class="mo-c ahead"></div>'; continue; }
      if (c.tot == null || !X.ok(c)) {
        const msg = !c.open ? 'No takings held for this month.' : c.tot == null ? `Only ${c.open} of ${c.of} branches traded it, so it is left out.` : 'No per-staff figure held for this month.';
        g += `<div class="mo-c ${c.open ? 'part' : 'none'}" data-y="${y}" data-m="${m}">${c.open && c.tot == null ? c.open + '/' + c.of : '·'}</div>`; continue;
      }
      let txt = '', bg = '', cls = 'mo-c' + (st === 'live' ? ' live' : '') + (sel.y === y && sel.m === m ? ' sel' : '');
      const x = ix && ix[m];
      if (v === 'index') { txt = Math.round(x); bg = otyMoHeat(x - 100, 35); if (S.peak[y] === m) cls += ' pk'; if (S.low[y] === m) cls += ' lo'; }
      else if (v === 'act') { txt = X.fv(X.val(c)); bg = x != null ? otyMoHeat(x - 100, 35) : ''; }
      else {
        const k = X.cmp(y, m);
        if (k.none) { g += `<div class="mo-c none">·</div>`; continue; }
        txt = k.big ? 'new' : otyMoSign(k.pct) + Math.abs(k.pct).toFixed(0) + '%'; bg = k.big ? '' : otyMoHeat(k.pct, 25); if (X.llf(y, m)) cls += ' llf';
      }
      g += `<button class="${cls}" style="background-color:${bg}" data-y="${y}" data-m="${m}" onclick="otyMoSel(${y},${m})">${txt}${moon}</button>`;
    }
    g += `<div class="pl">${v === 'index' && S.peak[y] != null ? OTY_MON[S.peak[y]] : ''}</div><div class="pl">${v === 'index' && S.low[y] != null ? OTY_MON[S.low[y]] : ''}</div>`;
  }
  if (v === 'index') {
    g += '<div class="sec"></div><div class="sl">Avg</div>' + S.avg.map(a => `<div class="mo-c avg">${a == null ? '' : Math.round(a)}</div>`).join('') + '<div></div><div></div>';
    g += '<div class="sl">Spread</div>' + S.spr.map(a => `<div class="mo-c spr">${a == null ? '' : Math.round(a) + ' pts'}</div>`).join('') + '<div></div><div></div>';
  }
  const hasRam = !!otyRam(curYear);
  const legend = v === 'chg'
    ? `<span class="mo-scale">weaker<span class="bar"></span>stronger</span>${hasRam ? '<span class="sw">☾ Ramadan and Eid in the month</span><span class="sw"><span class="box" style="border:1.5px dashed var(--warn)"></span>Ramadan and Eid fell differently than last year, so not like for like</span>' : ''}`
    : `<span class="mo-scale">below average<span class="bar"></span>above average</span>${hasRam ? '<span class="sw">☾ Ramadan and Eid in the month (10+ days)</span>' : ''}${v === 'index' ? '<span class="sw">● strongest month ○ weakest month</span>' : ''}<span class="sw"><span class="box" style="background-image:repeating-linear-gradient(135deg,rgba(45,46,55,.55) 0 4px,transparent 4px 9px);background-color:var(--surface2)"></span>Month still running</span>`;

  return `${head}
    <p class="oty-deck" style="font-size:clamp(14px,3.4vw,16px)">Does every year have the same shape? Six years on one grid, with growth taken out, so the months can be compared.</p>
    <div class="oty-card" style="margin-top:12px">
      <div class="oty-lab" style="margin-top:0">Where</div><div class="oty-pills">${regs.map(k => pill('mreg', k, otyMoName(k))).join('')}${regs.length && brs.length ? '<span class="oty-sep"></span>' : ''}${brs.map(b => pill('mreg', b, OTY_NAME[b])).join('')}</div>
      <div class="oty-lab">Measure</div><div class="oty-pills">${['net', 'clients', 'bill'].map(k => pill('mmet', k, otyMoMetName[k])).join('')}</div>
      <div class="oty-lab">Index set against</div><div class="oty-pills">${bases.map(([k, l]) => pill('mbase', k, l)).join('')}</div>
      <div class="oty-hint">${baseHint}</div>
    </div>
    <div class="oty-card" style="margin-top:12px">
      <div class="oty-chead"><b>${title}</b><span>${otyEsc(sub)}</span></div>
      <div class="oty-pills" style="margin-bottom:14px">${[['index', 'Shape (index)'], ['chg', 'Change on last year'], ['act', 'Actual']].map(([k, l]) => pill('mview', k, l)).join('')}</div>
      <div class="mo-scroll"><div class="mo-hm">${g}</div></div>
      <div class="mo-legend">${legend}</div>
    </div>
    <div class="oty-card" style="margin-top:12px">${otyMoDetail(X, S, sel)}</div>
    ${otyMoLines(X, S)}
    ${otyMoPairs(X)}
    ${otyMoStands(X, S)}
    <div class="oty-card oty-note" style="margin-top:12px">
      <p><b>How to read the grid.</b> Each cell is that month's takings per open day, set against the average month of the same year (100 = an average month). 120 is a month 20% stronger than that year's average, 85 is 15% weaker. Every year is measured against itself, so growth drops out and what is left is the shape.</p>
      <p><b>Per open day,</b> so a 28-day February and a 31-day March, or a branch that shuts on some days, are fair against each other, as on the season chart.</p>
      <p><b>Striped cells</b> are the month still running. They are left out of every average, and the Change view reads them against the same number of open days last year.</p>
      <p><b>Growth inside a year</b> tilts the shape a little: a year that grows all the way through reads low in January and high in December. That is real, so it stays in. A single branch or one region is the cleanest read. All four is bent by branches opening part-way through the years.</p>
      <p><b>Figures from Phorest's daily totals,</b> refreshed hourly. Net take is net of VAT; clients and average bill are per staff, the page's default.</p>
    </div>`;
}
function otyMoSet(k, v) { OTY[k] = v; otySave(); otyDraw(); }
function otyMoSel(y, m) { OTY.mmsel = { y, m }; otyDraw(); }
function otyMoYr(y) {
  const s = new Set(OTY.myrs || otyD.years);
  if (s.has(y)) s.delete(y); else s.add(y);
  OTY.myrs = s; otyDraw();
}
function otyMoYrs(mode) { OTY.myrs = mode === 'none' ? new Set() : null; otyDraw(); }
function otyMoPy(y) { OTY.mpy = y; otyDraw(); }

// tap a month: its figure, how it sits in its own year, and how it sits against the other years
function otyMoDetail(X, S, sel) {
  const { y, m } = sel, c = X.cell(y, m);
  if (!c || !X.ok(c)) return '<div class="oty-note">Tap a month in the grid.</div>';
  const ix = S.idx[y], k = X.cmp(y, m), rd = otyRamIn(y, m), rp = y > X.years[0] ? otyRamIn(y - 1, m) : 0, p = y > X.years[0] ? X.cell(y - 1, m) : null, live = c.state === 'live';
  const done = mm => otyMoState(X.M, y, mm) === 'done', ixs = ix ? ix.map((x, i) => [x, i]).filter(a => a[0] != null && done(a[1])) : [];
  const rank = ix && done(m) ? ixs.slice().sort((a, b) => b[0] - a[0]).findIndex(a => a[1] === m) + 1 : null;
  const others = X.years.filter(o => o !== y).map(o => { const r = X.idx(o); return r && otyMoState(X.M, o, m) === 'done' ? r[m] : null; }).filter(x => x != null);
  const oavg = others.length ? others.reduce((a, b) => a + b, 0) / others.length : null;
  const pc = k && !k.none ? `<span class="oty-chg ${k.big ? 'flat' : Math.abs(k.pct) < .5 ? 'flat' : k.pct > 0 ? 'up' : 'dn'}" style="margin:0">${k.big ? 'new' : otyMoSign(k.pct) + Math.abs(k.pct).toFixed(1) + '%'}</span>` : '';
  const ram = rd || rp ? `${rd} of ${c.dim} days in ${y}${p ? `, ${rp} of ${p.dim} in ${y - 1}` : ''}${p && Math.abs(rd - rp) >= 10 ? '. Not like for like, read it with the shape view.' : ''}` : 'Not touched in either year';
  return `<div class="oty-rh"><b>${OTY_MON[m]} ${y}</b><span>${live ? `1 to ${c.days} open days, against the same number of open days in ${y - 1}` : y > X.years[0] ? `against ${OTY_MON[m]} ${y - 1}` : 'first year held'}</span>${pc}</div>
    <div class="mo-dt">
      <div><div class="k">${otyMoMetName[X.met]}</div><div class="v">${X.met === 'net' ? 'AED ' : ''}${X.fv(X.val(c))}</div><div class="s">${k && !k.none ? `${X.fd(k.diff)} on the same open days of ${y - 1}` : 'No year before to set against'}</div></div>
      <div><div class="k">Shape index</div><div class="v">${ix && ix[m] != null ? Math.round(ix[m]) : '·'}</div><div class="s">${rank ? `${otyMoOrd(rank)} strongest of ${ixs.length} finished months in ${y}` : ix ? 'Month still running' : 'Not enough months for a shape'}</div></div>
      <div><div class="k">Same month, other years</div><div class="v">${oavg != null ? Math.round(oavg) : '·'}</div><div class="s">${oavg != null && ix && ix[m] != null ? `${y} is ${Math.abs(ix[m] - oavg).toFixed(0)} pts ${ix[m] >= oavg ? 'above' : 'below'} the average of the other years` : 'Average index across the other years'}</div></div>
      <div><div class="k">Ramadan and Eid</div><div class="v">${rd} <small>of ${c.dim} days</small></div><div class="s">${ram}</div></div>
    </div>`;
}

// one line per year on the same axis
function otyMoLines(X, S) {
  const years = X.years, shown = new Set(OTY.myrs || years), W = 900, H = 330, L = 44, Rr = 14, T = 16, B = 30;
  const all = years.filter(y => shown.has(y) && S.idx[y]).flatMap(y => S.idx[y].filter((x, m) => x != null && otyMoState(X.M, y, m) === 'done'));
  if (!all.length && !S.avg.some(a => a != null)) return '';
  const lo = Math.min(...all, ...S.avg.filter(a => a != null), 100), hi = Math.max(...all, ...S.avg.filter(a => a != null), 100);
  const ymin = Math.floor((lo - 4) / 20) * 20, ymax = Math.ceil((hi + 4) / 20) * 20;
  const Xp = m => L + (W - L - Rr) * (m + .5) / 12, Yp = vv => T + (H - T - B) * (1 - (vv - ymin) / (ymax - ymin));
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Monthly shape by year" onmousemove="otyMoLineTip(event)">`;
  for (let t = ymin; t <= ymax; t += 20) s += `<line x1="${L}" x2="${W - Rr}" y1="${Yp(t)}" y2="${Yp(t)}" stroke="${t === 100 ? 'var(--muted2)' : 'var(--border)'}" ${t === 100 ? 'stroke-dasharray="4 4"' : ''}/><text x="${L - 8}" y="${Yp(t) + 4}" text-anchor="end" font-size="11">${t}</text>`;
  OTY_MON.forEach((m, i) => { s += `<text x="${Xp(i)}" y="${H - 8}" text-anchor="middle" font-size="11.5">${m}</text>`; });
  const path = pts => pts.map((p, i) => (i ? 'L' : 'M') + Xp(p[0]).toFixed(1) + ' ' + Yp(p[1]).toFixed(1)).join(' ');
  for (const y of years) {
    if (!shown.has(y) || !S.idx[y]) continue;
    const pts = S.idx[y].map((x, m) => x != null && otyMoState(X.M, y, m) === 'done' ? [m, x] : null).filter(Boolean);
    s += `<path d="${path(pts)}" fill="none" stroke="${otyMoCol(y)}" stroke-width="${y === X.curYear ? 3 : 2}" stroke-linejoin="round"/>` + pts.map(p => `<circle cx="${Xp(p[0])}" cy="${Yp(p[1])}" r="${y === X.curYear ? 3.6 : 2.6}" fill="${otyMoCol(y)}"/>`).join('');
  }
  const ap = S.avg.map((a, m) => a != null ? [m, a] : null).filter(Boolean);
  if (ap.length) s += `<path d="${path(ap)}" fill="none" stroke="var(--text)" stroke-width="2.4" stroke-dasharray="7 5" opacity=".9"/>`;
  s += `<text x="${W - Rr}" y="${T - 4}" text-anchor="end" font-size="11" style="fill:var(--text)">- - -  average of the years</text>`;
  for (let m = 0; m < 12; m++) s += `<rect x="${Xp(m) - (W - L - Rr) / 24}" y="${T}" width="${(W - L - Rr) / 12}" height="${H - T - B}" fill="transparent" data-lm="${m}"/>`;
  s += '</svg>';
  const chips = years.map(y => `<button class="oty-chip" aria-pressed="${shown.has(y)}" onclick="otyMoYr(${y})"><i style="background:${otyMoCol(y)}"></i>${y}</button>`).join('')
    + '<span class="oty-sep"></span><button class="oty-pill" aria-pressed="false" onclick="otyMoYrs(\'none\')">Average only</button><button class="oty-pill" aria-pressed="false" onclick="otyMoYrs(\'all\')">All years</button>';
  let lane = '';
  if (otyRam(X.curYear)) {
    for (const y of years.slice().reverse()) {
      const r = otyRam(y); if (!shown.has(y) || !r) continue;
      const j = new Date(y, 0, 1), len = (new Date(y + 1, 0, 1) - j) / 864e5, pos = d => (d - j) / 864e5 / len * 100;
      lane += `<div class="ly">${y}</div><div class="lt"><i style="left:${pos(r[0])}%;width:${pos(r[1]) - pos(r[0]) + .3}%;background:${otyMoCol(y)}"></i></div>`;
    }
    if (lane) lane = `<div class="mo-lane">${lane}<div></div><div class="lm">${OTY_MON.map(m => `<span>${m}</span>`).join('')}</div></div>
      <div class="oty-hint">The bars under the chart show where Ramadan and Eid fell in each year. They move about 11 days earlier every year, which is the main reason the dip and the Eid lift keep changing month.</div>`;
  }
  return `<div class="oty-eb" style="margin-top:26px"><i style="background:var(--hair)"></i>The shapes on top of each other</div>
    <div class="oty-card"><div class="oty-chead"><b>One line per year</b><span>Hover a month to read every year in it</span></div>
      <div class="oty-pills" style="margin-bottom:12px">${chips}</div>${s}${lane}</div>`;
}

// each month this year against the same month the year before
function otyMoPairs(X) {
  const years = X.years, y = OTY.mpy && years.includes(OTY.mpy) && OTY.mpy > years[0] ? OTY.mpy : X.curYear;
  const rows = [...Array(12).keys()].map(m => ({ m, c: X.cell(y, m), k: X.cmp(y, m) })), live = r => r.c && r.c.state === 'live';
  const vals = rows.flatMap(r => r.k && !r.k.none ? [r.k.cur, r.k.prevW] : []), mx = Math.max(...vals, 1);
  const pills = years.slice(1).map(yy => `<button class="oty-pill" aria-pressed="${yy === y}" onclick="otyMoPy(${yy})">${yy} on ${yy - 1}</button>`).join('');
  const cols = rows.map(r => {
    if (!r.k || r.k.none) return `<div class="mo-pr"><div class="dp">${r.c && r.c.state === 'ahead' ? '' : '<span class="mo-dpp fl">·</span>'}</div><div class="bars"></div><div class="m">${OTY_MON[r.m]}</div></div>`;
    const k = r.k, cl = k.big || Math.abs(k.pct) < .5 ? 'fl' : k.pct > 0 ? 'up' : 'dn';
    return `<div class="mo-pr"><div class="dp"><span class="mo-dpp ${cl}">${k.big ? 'new' : otyMoSign(k.pct) + Math.abs(k.pct).toFixed(0) + '%'}</span></div>
      <div class="bars"><div class="mo-b ${live(r) ? 'live' : ''}" data-by="${y}" data-bm="${r.m}" style="height:${Math.max(2, k.prevW / mx * 100)}%;background-color:var(--hair)"></div><div class="mo-b ${live(r) ? 'live' : ''}" data-by="${y}" data-bm="${r.m}" style="height:${Math.max(2, k.cur / mx * 100)}%;background-color:var(--good)"></div></div>
      <div class="m">${OTY_MON[r.m]}${otyRamIn(y, r.m) >= 10 ? ' ☾' : ''}</div></div>`;
  }).join('');
  return `<div class="oty-eb" style="margin-top:26px"><i style="background:var(--hair)"></i>Year against the year before, month by month</div>
    <div class="oty-card"><div class="oty-chead"><b>${y} against ${y - 1}</b><span>${otyMoMetName[X.met]} · same open days in each month</span></div>
      <div class="oty-pills" style="margin-bottom:14px">${pills}</div>
      <div class="mo-scroll"><div class="mo-pairs">${cols}</div></div>
      <div class="mo-legend"><span class="sw"><i class="box" style="background:var(--hair)"></i>${y - 1}</span><span class="sw"><i class="box" style="background:var(--good)"></i>${y}</span><span class="sw">The pill is the month against the same month a year earlier</span></div></div>`;
}

// what the grid says, worked out from the grid
function otyMoStands(X, S) {
  const label = (y, m) => `${y} ${OTY_MON[m]}${y === X.curYear ? ' (so far)' : ''}`;
  const ys = X.years.filter(y => S.idx[y] && S.low[y] != null);
  if (ys.length < 2) return '';
  const ok = S.spr.map((s, m) => [s, m]).filter(a => a[0] != null), wide = ok.slice().sort((a, b) => b[0] - a[0]).slice(0, 2), tight = ok.slice().sort((a, b) => a[0] - b[0]).slice(0, 2);
  const rIn = [], rOut = [];
  ys.forEach(y => S.idx[y].forEach((x, m) => { if (x != null && otyMoState(X.M, y, m) === 'done') (otyRamIn(y, m) >= 10 ? rIn : rOut).push(x); }));
  const mean = a => a.reduce((t, x) => t + x, 0) / a.length;
  const sp = a => `${OTY_MON[a[1]]} (${Math.round(a[0])} pts apart)`;
  return `<div class="oty-eb" style="margin-top:26px"><i style="background:var(--warn)"></i>What stands out</div>
    <div class="oty-card oty-flag oty-note"><p><b>The weakest and strongest months.</b> Lowest month by year: ${ys.map(y => label(y, S.low[y])).join(', ')}. Strongest: ${ys.map(y => label(y, S.peak[y])).join(', ')}.</p>
      <p><b>Steadiest and most unsteady months.</b> ${tight.map(sp).join(' and ')} behave much the same every year. ${wide.map(sp).join(' and ')} are the ones that change most.</p>
      ${rIn.length && rOut.length ? `<p><b>Ramadan and Eid.</b> A month with 10 or more days of it averages ${Math.round(mean(rIn))} on the index, against ${Math.round(mean(rOut))} for the rest. As the dates move earlier each year the dip lands in a different month, which is most of why the monthly pattern does not repeat.</p>` : ''}</div>`;
}

// hover tips: the grid cells, the bar pairs and the line chart columns (one floating box, delegated like the seasons)
function otyMoTipBox(el, ev, html) {
  let tt = document.getElementById('otyMoTip');
  if (!tt) { tt = document.createElement('div'); tt.id = 'otyMoTip'; tt.className = 'oty-stt'; document.body.appendChild(tt); }
  tt.innerHTML = html; tt.classList.add('on');
  const w = tt.offsetWidth, h = tt.offsetHeight;
  let x = Math.max(8, Math.min(innerWidth - w - 8, ev.clientX + 14)), yy = ev.clientY + 16; if (yy + h > innerHeight - 8) yy = ev.clientY - h - 14;
  tt.style.left = x + 'px'; tt.style.top = Math.max(8, yy) + 'px';
}
function otyMoTipOff() { const tt = document.getElementById('otyMoTip'); if (tt) tt.classList.remove('on'); }
function otyMoLineTip(ev) {
  const r = ev.target.closest && ev.target.closest('[data-lm]'); if (!r) { otyMoTipOff(); return; }
  const m = +r.dataset.lm, X = otyMoCtx(), S = X.stats(), shown = new Set(OTY.myrs || X.years);
  let t = `<div class="h"><b>${OTY_MON[m]}</b></div>`;
  for (const y of X.years.slice().reverse()) {
    if (!shown.has(y)) continue;
    const x = S.idx[y] && otyMoState(X.M, y, m) === 'done' ? S.idx[y][m] : null;
    t += `<div style="display:flex;justify-content:space-between;gap:12px"><span><i style="display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:6px;background:${otyMoCol(y)}"></i>${y}${otyRamIn(y, m) >= 10 ? ' ☾' : ''}</span><b>${x == null ? '·' : Math.round(x)}</b></div>`;
  }
  if (S.avg[m] != null) t += `<div style="display:flex;justify-content:space-between;margin-top:4px;padding-top:4px;border-top:1px solid var(--border)"><span>Average</span><b>${Math.round(S.avg[m])}</b></div>`;
  otyMoTipBox(r, ev, t);
}
function otyMoTipFor(el, ev) {
  const X = otyMoCtx();
  if (el.dataset.by) {
    const y = +el.dataset.by, m = +el.dataset.bm, k = X.cmp(y, m), c = X.cell(y, m); if (!k || k.none) return;
    otyMoTipBox(el, ev, `<div class="h"><b>${OTY_MON[m]} ${y}</b></div><div class="v">${X.fv(k.cur)} <small>${y}${c.state === 'live' ? `, ${c.days} open days so far` : ''}</small></div>
      <div>${y - 1}: <b>${X.fv(k.prevW)}</b>${c.state === 'live' ? ' (same open days)' : ''}</div><div>${X.fd(k.diff)} · <b class="${k.pct >= 0 ? 'oty-up' : 'oty-dn'}">${k.big ? 'new' : otyMoSign(k.pct) + Math.abs(k.pct).toFixed(1) + '%'}</b></div>${X.llf(y, m) ? '<div style="margin-top:4px">Ramadan and Eid fell differently, so not like for like.</div>' : ''}`);
    return;
  }
  const y = +el.dataset.y, m = +el.dataset.m, c = X.cell(y, m); if (!c) return;
  if (!X.ok(c)) { otyMoTipBox(el, ev, `<div class="h"><b>${OTY_MON[m]} ${y}</b></div><div>${!c.open ? 'No takings held for this month.' : c.tot == null ? `Only ${c.open} of ${c.of} branches traded it, so it is left out.` : 'No per-staff figure held for this month.'}</div>`); return; }
  const ix = X.idx(y), k = X.cmp(y, m), rd = otyRamIn(y, m);
  otyMoTipBox(el, ev, `<div class="h"><i style="background:${otyMoCol(y)}"></i><b>${OTY_MON[m]} ${y}</b><span>${otyEsc(otyMoName(X.reg))}</span></div><div class="v">${X.met === 'net' ? 'AED ' : ''}${X.fv(X.val(c))}</div>
    <div>${ix && ix[m] != null ? `Shape index <b>${Math.round(ix[m])}</b>` : 'No shape for this year'}${c.state === 'live' ? ` · ${c.days} open days so far` : ''}</div>
    ${k && !k.none ? `<div>vs ${y - 1}: <b class="${k.pct >= 0 ? 'oty-up' : 'oty-dn'}">${k.big ? 'new' : otyMoSign(k.pct) + Math.abs(k.pct).toFixed(1) + '%'}</b></div>` : ''}${rd ? `<div>Ramadan and Eid: ${rd} of ${c.dim} days</div>` : ''}`);
}
if (!window.__otyMoBound) {
  window.__otyMoBound = true;
  document.addEventListener('mousemove', e => {
    const t = e.target && e.target.closest && e.target.closest('#overYearsContent .mo-c[data-y],#overYearsContent .mo-b[data-by]');
    if (t) { try { otyMoTipFor(t, e); } catch (x) { otyMoTipOff(); } } else if (!(e.target.closest && e.target.closest('[data-lm]'))) otyMoTipOff();
  });
}

// ── GOOGLE REVIEWS (UNDER CONSTRUCTION) ──────────────────────────────────
function otyReviews() {
  const { years, D, sets, curYear } = otyD, set = sets[OTY.b], same = OTY.basis === 'same', n = years.length;
  const rows = years.map((y, i) => {
    const per = set.map(b => ({ b, v: (same ? D[b].rev.ny : D[b].rev.n)[i] || 0, s: (same ? D[b].rev.sy : D[b].rev.s)[i] || 0 }));
    const c = per.reduce((a, p) => a + p.v, 0), stars = c ? per.reduce((a, p) => a + p.v * p.s, 0) / c : 0;
    return { y, i, n: c, stars, per, partial: !same && y === curYear };
  });
  if (!rows.some(r => r.n)) return `<div class="oty-eb"><i style="background:var(--warn)"></i>Reputation · Google reviews <span class="oty-uc">(UNDER CONSTRUCTION)</span></div><div class="oty-card oty-flag"><div class="oty-note">No Google reviews are held for ${otySetName(OTY.b)}.</div></div>`;
  const { W, H, bmax } = otyCanvas(260), L = 34, R = 36, T = 24, B = 28, bw = (W - L - R) / n, bar = Math.min(bmax, bw * .62);
  const maxN = Math.max(250, Math.ceil(Math.max(...rows.map(r => r.n), 1) * 1.08 / 250) * 250), yb = v => T + (H - T - B) * (1 - v / maxN);
  const lo = 4.4, hi = 5.0, yl = v => T + (H - T - B) * (1 - (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo));
  let g = '';
  for (let k = 0; k <= 4; k++) { const v = maxN * k / 4, y = yb(v); g += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="var(--border)"/><text x="${L - 6}" y="${y + 3.5}" text-anchor="end" font-size="9.5">${Math.round(v)}</text>`; }
  [4.4, 4.6, 4.8, 5.0].forEach(v => g += `<text class="tl" x="${W - R + 6}" y="${yl(v) + 3.5}" font-size="9.5">${v.toFixed(1)}</text>`);
  rows.forEach((r, i) => {
    const cx = L + bw * i + bw / 2, x0 = cx - bar / 2; let acc = 0;
    r.per.forEach(p => { if (!p.v) return; const h = (H - T - B) * p.v / maxN, y = yb(acc + p.v); acc += p.v;
      g += `<rect class="seg" x="${x0}" y="${y}" width="${bar}" height="${h}" fill="${set.length === 1 ? 'var(--hair)' : OTY_COL[p.b]}" opacity="${r.partial ? .5 : .92}" ${r.partial ? 'stroke="var(--text)" stroke-opacity=".6" stroke-dasharray="3 2"' : ''}${otyTT(p.b, r.y, `${p.v} reviews${p.s ? `, ${p.s.toFixed(2)} stars` : ''}`, r.n ? p.v / r.n * 100 : 0, `of the ${r.n} ${r.y}${r.partial ? '*' : ''} reviews`, same || r.partial ? `1 Jan – ${otyCutLabel()}` : 'full year')}/>`; });
    g += `<text class="tv" x="${cx}" y="${yb(r.n) - 5}" text-anchor="middle" font-size="9.5">${r.n || '·'}</text><text x="${cx}" y="${H - 9}" text-anchor="middle" font-size="10.5">${r.y}${r.partial ? '*' : ''}</text>`;
  });
  const pts = rows.filter(r => r.n);
  if (pts.length) g += `<path d="${pts.map((r, k) => (k ? 'L' : 'M') + (L + bw * r.i + bw / 2).toFixed(1) + ' ' + yl(r.stars).toFixed(1)).join(' ')}" fill="none" stroke="var(--warn)" stroke-width="2.4" stroke-linejoin="round"/>`;
  pts.forEach(r => g += `<circle cx="${L + bw * r.i + bw / 2}" cy="${yl(r.stars)}" r="3.6" fill="var(--warn)"/><circle class="hit" cx="${L + bw * r.i + bw / 2}" cy="${yl(r.stars)}" r="11" fill="transparent"${otyTTh(`<div class="h"><b>${r.y}${r.partial ? '*' : ''}</b></div><div class="v">${r.stars.toFixed(2)} stars</div><div class="s">average of ${r.n} reviews</div>`)}/>`);
  const legend = (set.length > 1 ? set.map(b => `<span><i style="background:${OTY_COL[b]}"></i>${OTY_NAME[b]}</span>`).join('') : `<span><i style="background:var(--hair)"></i>${OTY_NAME[set[0]]}</span>`) + `<span><i class="ln" style="background:var(--warn)"></i>Average stars (right scale)</span>`;
  const a = rows[n - 1];
  const n25 = set.reduce((t, b) => t + (D[b].rev.ny[n - 2] || 0), 0), n26 = set.reduce((t, b) => t + (D[b].rev.ny[n - 1] || 0), 0);
  const s25 = n25 ? set.reduce((t, b) => t + (D[b].rev.ny[n - 2] || 0) * (D[b].rev.sy[n - 2] || 0), 0) / n25 : 0;
  const d = n25 ? (n26 - n25) / n25 * 100 : null;
  return `<div class="oty-eb"><i style="background:var(--warn)"></i>Reputation · Google reviews <span class="oty-uc">(UNDER CONSTRUCTION)</span></div>
    <div class="oty-card"><div class="oty-legend">${legend}</div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Google reviews by year, bars, with average stars as a line">${g}</svg>
    <div class="oty-read"><b>${otyD.curYear}</b> · ${same ? `1 Jan – ${otyCutLabel()}` : 'so far'}<div class="oty-ro"><span>Reviews <b>${a.n}</b></span><span>Average <b>${a.stars ? a.stars.toFixed(2) : '·'} stars</b></span><span>${otyD.curYear - 1}, same days <b>${n25}</b></span><span>${otyD.curYear - 1} average <b>${s25 ? s25.toFixed(2) : '·'}</b></span></div></div></div>
    <div class="oty-card oty-flag" style="margin-top:10px"><div class="oty-note"><p><b>Check before reading ${d == null ? 'it' : d.toFixed(0) + '%'} as a drop.</b> ${n26} reviews so far in ${otyD.curYear} against ${n25} on the same days of ${otyD.curYear - 1}. A fall that steep may be the review sync, not the salons: new reviews are still pulled by hand while the Google approval is pending, and older dates are approximate ("2 years ago"), so the years are solid and the days are not.</p><p><b>The stars</b> are a review-weighted average of every review in the window, so a branch with more reviews counts for more.</p></div></div>`;
}

// ── INSTAGRAM (UNDER CONSTRUCTION) ───────────────────────────────────────
function otyInstagram() {
  const head = `<div class="oty-eb"><i style="background:var(--hair)"></i>Instagram · posts, collabs and tags, by month <span class="oty-uc">(UNDER CONSTRUCTION)</span></div>`;
  if (typeof TRS_LEVEL === 'undefined' || TRS_LEVEL < 3) return head + `<div class="oty-card oty-flag"><div class="oty-note">Instagram is for Level 3 and above.</div></div>`;
  if (!otyIgRaw) return head + `<div class="oty-card oty-flag"><div class="oty-note">${otyEsc(otyIgErr || 'Instagram has not loaded.')}</div></div>`;
  const ms = otyIgRaw.months || [], st = otyIgRaw.start || {}, n = ms.length;
  const val = (r, k) => (r.m < (st[k] || '0000') ? null : r[k]);
  const own = ms.map(r => val(r, 'own')), col = ms.map(r => val(r, 'collab')), tag = ms.map(r => val(r, 'tags'));
  if (OTY.ig == null || OTY.ig >= n) OTY.ig = Math.max(0, n - 2);
  const { W, H } = otyCanvas(270), L = 32, R = 30, T = 22, B = 34, bw = (W - L - R) / n, bar = Math.max(5, bw * .62);
  const maxT = Math.max(130, Math.ceil(Math.max(...tag.filter(v => v != null), 1) * 1.1 / 10) * 10), maxP = Math.max(30, Math.ceil(Math.max(...own.concat(col).filter(v => v != null), 1) * 1.1 / 10) * 10);
  const yb = v => T + (H - T - B) * (1 - v / maxT), yp = v => T + (H - T - B) * (1 - v / maxP);
  let g = `<rect x="${L + bw * OTY.ig}" y="${T - 6}" width="${bw}" height="${H - T - B + 6}" fill="var(--accent)" opacity=".12" rx="3"/>`;
  for (let k = 0; k <= 4; k++) { const y = T + (H - T - B) * k / 4;
    g += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="var(--border)"/><text x="${L - 5}" y="${y + 3.5}" text-anchor="end" font-size="9">${Math.round(maxT * (4 - k) / 4)}</text><text class="tl" x="${W - R + 5}" y="${y + 3.5}" font-size="9">${Math.round(maxP * (4 - k) / 4)}</text>`; }
  ms.forEach((r, i) => {
    const cx = L + bw * i + bw / 2;
    if (tag[i]) g += `<rect x="${cx - bar / 2}" y="${yb(tag[i])}" width="${bar}" height="${(H - T - B) * tag[i] / maxT}" fill="var(--hair)" opacity=".9" rx="1.5"/>`;
    const mo = +r.m.slice(5) - 1;
    if (i % 3 === 0 || i === n - 1) g += `<text x="${cx}" y="${H - 18}" text-anchor="middle" font-size="9">${OTY_MON[mo][0]}</text>`;
    if (r.m.endsWith('-01') || i === 0) g += `<text class="tv" x="${cx}" y="${H - 6}" font-size="9.5">${r.m.slice(0, 4)}</text>`;
  });
  // Kate, 9 Oct 2026: "smoothen the lines". Each unbroken run of months is a smooth curve through its points
  // (otyCurve) instead of straight segments; a gap in the data still breaks the line.
  const line = (arr, col, w) => {
    const runs = []; let cur = null;
    arr.forEach((v, i) => { if (v == null) { cur = null; return; } if (!cur) runs.push(cur = []); cur.push([L + bw * i + bw / 2, yp(v)]); });
    return `<path d="${runs.map(otyCurve).join(' ')}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"/>`;
  };
  g += line(own, 'var(--warn)', 2.4) + line(col, 'var(--good)', 2.2);
  // Kate, 13 Oct 2026: "no clear nodes". The lines are smoothed, so each month's real value gets a small dot; the
  // selected month's are a little bigger. A month before a feed started has no value, so no dot.
  const dots = (arr, c) => arr.map((v, i) => v == null ? '' : `<circle cx="${(L + bw * i + bw / 2).toFixed(1)}" cy="${yp(v).toFixed(1)}" r="${i === OTY.ig ? 4.4 : 2.8}" fill="${c}" stroke="var(--surface)" stroke-width="1.2"/>`).join('');
  g += dots(own, 'var(--warn)') + dots(col, 'var(--good)');
  // Kate, 13 Oct 2026: hover (or tap) a month for all three figures; the column is invisible and sits on top.
  const nc = v => v == null ? '<span style="opacity:.6">not captured</span>' : `<b>${v}</b>`;
  ms.forEach((r, i) => { g += `<rect class="hit" x="${L + bw * i}" y="${T - 6}" width="${bw}" height="${H - T - B + 6}" fill="transparent"${otyTTh(`<div class="h"><b>${OTY_MON[+r.m.slice(5) - 1]} ${r.m.slice(0, 4)}</b></div><div class="s">Client tags ${nc(tag[i])}</div><div class="s">Our posts and reels ${nc(own[i])}</div><div class="s">Collab posts ${nc(col[i])}</div>`)}/>`; });
  const sel = OTY.ig, f = v => v == null ? '<span style="opacity:.6">not captured</span>' : `<b>${v}</b>`;
  const mn = OTY_MON[+ms[sel].m.slice(5) - 1] + ' ' + ms[sel].m.slice(0, 4);
  const stories = (otyIgRaw.stories || []).find(s => s.m === ms[sel].m);
  return head + `<div class="oty-card"><div class="oty-legend"><span><i style="background:var(--hair)"></i>Client tags (left scale)</span><span><i class="ln" style="background:var(--warn)"></i>Our posts and reels</span><span><i class="ln" style="background:var(--good)"></i>Collab posts</span></div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Instagram by month" onpointerdown="otyTapIg(event,${n},${L},${R},${W})">${g}</svg>
    <div class="oty-read"><b>${mn}</b>${ms[sel].m === ms[n - 1].m ? ' · so far' : ''}<div class="oty-ro"><span>Client tags ${f(tag[sel])}</span><span>Our posts and reels ${f(own[sel])}</span><span>Collab posts ${f(col[sel])}</span>${stories ? `<span>Stories <b>${stories.n}</b></span>` : ''}</div></div></div>
    <div class="oty-card oty-flag" style="margin-top:10px"><div class="oty-note"><p><b>Why only ${n} months.</b> Our own posts and reels are captured from ${otyMonLabel(st.own)}, collab posts from ${otyMonLabel(st.collab)} and client tags from ${otyMonLabel(st.tags)}. Stories only from Jul 2026, so they are left off the lines. Months before a feed starts show as not captured, not zero.</p><p><b>Not by branch.</b> These are the salon accounts together. Per-branch tags need the tagged account matched to a branch, which is not there yet.</p></div></div>`;
}
const otyMonLabel = m => m ? OTY_MON[+m.slice(5) - 1] + ' ' + m.slice(0, 4) : '';
function otyTapIg(ev, n, L, R, W) {
  const r = ev.currentTarget.getBoundingClientRect(), px = (ev.clientX - r.left) / r.width * W, bw = (W - L - R) / n;
  OTY.ig = Math.max(0, Math.min(n - 1, Math.floor((px - L) / bw))); otyDraw();
}

// ── COVERAGE + NOTES ─────────────────────────────────────────────────────
function otyCoverage() {
  const { years, present } = otyD;
  const has = key => years.map(y => present.some(b => (otyD.D[b][key].full[years.indexOf(y)] || 0) > 0) ? 1 : 0);
  // Kate, 13 Oct 2026: the Ledgers row was hardcoded to 2025 on, so it stayed grey after 2022 to 2024 were backfilled.
  // Now the ledger days held (over_the_years().ledger, from branch_staff_daily) against the days Phorest has, open
  // branches only: green from 85% of the days, yellow when there is some, grey when there is none.
  const open = present.filter(b => b !== 'FRT'), led = otyRaw.ledger || [];
  const ledg = years.map(y => {
    const rs = led.filter(r => r.y === y && open.includes(r.b)), l = rs.reduce((t, r) => t + (+r.led || 0), 0), d = rs.reduce((t, r) => t + (+r.days || 0), 0);
    return !l ? 0 : d && l / d >= .85 ? 1 : 2;
  });
  const ledFrom = years.find((y, i) => ledg[i]);
  const rows = [['Phorest daily totals', has('net')], ['Phorest sales lines', has('vis')], ['Phorest per staff', has('stf')],
    ['Ledgers (hair, beauty)', ledg], ['Google reviews (year only)', years.map(y => present.some(b => (otyD.D[b].rev.n[years.indexOf(y)] || 0) > 0) ? 2 : 0)],
    ['Instagram posts, collabs, tags', years.map(y => y >= 2025 ? 2 : 0)]];
  const tpl = `minmax(0,1.5fr) repeat(${years.length},minmax(0,1fr))`;
  return `<div class="oty-eb"><i style="background:var(--good)"></i>What each year has behind it</div>
    <div class="oty-card"><div class="oty-cov" style="grid-template-columns:${tpl}"><span></span>${years.map(y => `<span style="text-align:center">${String(y).slice(2)}</span>`).join('')}
    ${rows.map(([l, a]) => `<span class="l">${l}</span>${a.map(c => `<span class="c ${c === 2 ? 'part' : c ? 'ok' : ''}"></span>`).join('')}`).join('')}</div>
    <p class="oty-note" style="margin:12px 0 0">Green is complete. Yellow is there but with a caveat: Google review dates are approximate before 2026, Instagram only exists from 2025 and builds up through the year, and a ledger year is yellow when it holds under 85% of the days Phorest does. Net take, per-staff clients, average bill and visits go back to 2021, from Phorest. Hair against beauty, rebooking, requests and per-staff counts need the ledger, which ${ledFrom ? `starts in ${ledFrom}` : 'is not in yet'}, so those measures would show a dash before then.</p></div>`;
}
function otyNotes() {
  return `<div class="oty-eb"><i style="background:var(--accent)"></i>How to read this page</div>
    <div class="oty-card oty-note">
      <p><b>Seasons, not calendar months.</b> Ramadan and Eid move about 11 days earlier every year, so month against month compares different seasons. The month by month section is there so Coach Emma can see the shape of each year anyway, and it marks every month Ramadan and Eid touched.</p>
      <p><b>Branches arrive over time.</b> Motor City's data starts Nov 2022 and Al Quoz's Sep 2023, so the all-branches total jumps when they appear. Like for like (Saadiyat + Khalifa City A) is the trend.</p>
      <p><b>Fratelli</b> closed on 22 May 2026. It is out of All four, as everywhere on the dashboard, and has its own chip, and All + Fratelli puts it back in for the years it traded.</p>
      <p><b>Same days first.</b> The year in progress is set against the same dates in every earlier year. Switch to Full years to see whole years, with this one marked as partial.</p>
      <p><b>Slightly different from the Pulse.</b> These are Phorest's own financial totals. The Pulse's net take is built from the ledgers, so the two differ by about 1%.</p>
    </div>`;
}
