// Over the Years (Kate, 9 Oct 2026), built from Downloads/over-the-years-mockup.html.
//
// The business year on year, 2021 to now, and season by season, from migrations/over_the_years.sql:
//   over_the_years()     money (Phorest financial totals, net), clients per staff and per visit, season takings
//                        per open day, Google review counts and stars. Security invoker, so a branch-scoped
//                        login only reads its own branch.
//   over_the_years_ig()  Instagram by month. Level 3 and above, as the Social page.
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
const OTY = { b: 'ALL', basis: 'same', line: 'growth', sel: null, ig: null };
try {
  const s = JSON.parse(localStorage.getItem(OTY_STORE) || '{}');
  for (const k of ['b', 'basis', 'line']) if (typeof s[k] === 'string') OTY[k] = s[k];
} catch (e) {}
function otySave() { try { localStorage.setItem(OTY_STORE, JSON.stringify({ b: OTY.b, basis: OTY.basis, line: OTY.line })); } catch (e) {} }

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
  .oty{--o-gut:0px;width:100%;max-width:1100px;margin:0 auto;color:var(--text)}
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
  .oty .oty-legend{display:flex;gap:6px 14px;flex-wrap:wrap;font-size:12px;color:var(--muted);margin:0 0 8px}
  .oty .oty-legend i{display:inline-block;width:11px;height:11px;border-radius:3px;margin-right:6px;vertical-align:-1px}
  .oty .oty-legend i.ln{height:3px;width:16px;border-radius:2px;vertical-align:3px}
  .oty svg{display:block;width:100%;height:auto;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
  .oty svg text{fill:var(--muted2);font-family:Inter,sans-serif}
  .oty svg text.tv{fill:var(--text);font-weight:600}
  .oty svg text.tl{fill:var(--warn)}
  .oty .oty-read{margin-top:10px;padding:10px 12px;background:var(--surface2);border-radius:8px;font-size:13px;color:var(--muted);line-height:1.55}
  .oty .oty-read b{color:var(--text)}
  .oty .oty-ro{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:2px 12px;margin-top:6px}
  .oty table{width:100%;border-collapse:collapse;font-size:12.5px;font-variant-numeric:tabular-nums;table-layout:fixed}
  .oty th{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted2);text-align:right;padding:6px 4px;font-weight:700}
  .oty td{padding:9px 4px;border-top:1px solid var(--border);text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .oty th:first-child,.oty td:first-child{text-align:left;width:15%}
  .oty td.m{color:var(--muted)}
  .oty .oty-sg{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))}
  .oty .oty-sn .h{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
  .oty .oty-sn .nm{font-weight:600;font-size:14.5px}
  .oty .oty-sn .dt{font-size:11.5px;color:var(--muted2);margin:4px 0 12px;line-height:1.45}
  .oty .oty-cols{display:grid;gap:6px;align-items:end;height:118px}
  .oty .oty-col{display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%;gap:4px}
  .oty .oty-col .vl{font-size:10px;color:var(--muted);font-variant-numeric:tabular-nums}
  .oty .oty-col .b{width:100%;border-radius:4px 4px 0 0;background:var(--hair);opacity:.7}
  .oty .oty-col.last .b{background:var(--accent);opacity:1}
  .oty .oty-col .b.part{background:repeating-linear-gradient(45deg,var(--accent),var(--accent) 4px,transparent 4px,transparent 8px);opacity:1}
  .oty .oty-col .b.none{background:transparent;border-bottom:2px dashed var(--border);opacity:1}
  .oty .oty-yrs{display:grid;gap:6px;margin-top:5px;font-size:10.5px;color:var(--muted2);text-align:center}
  .oty .oty-cov{display:grid;gap:4px;align-items:center;font-size:10.5px;color:var(--muted2)}
  .oty .oty-cov .c{height:16px;border-radius:3px;background:var(--surface2)}
  .oty .oty-cov .c.ok{background:var(--good)}.oty .oty-cov .c.part{background:var(--warn)}
  .oty .oty-cov .l{font-size:11.5px;color:var(--muted)}
  .oty .oty-note{font-size:13px;color:var(--muted);line-height:1.55}
  .oty .oty-note b{color:var(--text)}
  .oty .oty-note p{margin:0 0 10px}.oty .oty-note p:last-child{margin:0}
  .oty .oty-load{padding:40px 8px;text-align:center;color:var(--muted)}
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
    const netY = otySum(set, 'net', 'ytd', i), netP = i ? otySum(set, 'net', 'ytd', i - 1) : 0;
    const g = otyPct(netP, netY), big = g != null && Math.abs(g) > 100;
    return { y, i, net, vis, stf, avg: stf ? net / stf : 0, avgV: vis ? net / vis : 0, growth: big ? null : g, big, partial,
      per: set.map(b => ({ b, v: D[b].net[w][i] || 0 })) };
  });
}

// ── DRAW ─────────────────────────────────────────────────────────────────
function otyDraw() {
  const host = document.getElementById('overYearsContent');
  if (!host) return;
  if (!otyD) { host.innerHTML = `<div class="oty oty-load">${otyEsc(otyErr || 'No data yet.')}</div>`; return; }
  if (OTY.sel == null || OTY.sel >= otyD.years.length) OTY.sel = otyD.years.length - 1;
  if (!otyD.sets[OTY.b]) OTY.b = 'ALL';
  const rows = otyRows();
  host.innerHTML = `<div class="oty">
    <div class="oty-eb"><i style="background:var(--accent)"></i>Numbers · Business · Over the years</div>
    <h1>${otyD.years.length} years, <em>season by season.</em></h1>
    <p class="oty-deck">Where the business has grown, which branch carried it, and how this year's seasons sit against the years before.</p>
    ${otyControls()}
    ${otyTiles(rows)}
    ${otyChartBlock(rows)}
    ${otyTable(rows)}
    ${otySeasons()}
    ${otyReviews()}
    ${otyInstagram()}
    ${otyCoverage()}
    ${otyNotes()}
  </div>`;
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
function otyTiles(rows) {
  const n = rows.length, set = otyD.sets[OTY.b], cy = otyD.curYear, c = otyCutLabel();
  const a = rows[n - 1], p = rows[n - 2];
  const cur = otySum(set, 'net', 'ytd', n - 1), prev = n > 1 ? otySum(set, 'net', 'ytd', n - 2) : 0;
  const prev2 = n > 2 ? otySum(set, 'net', 'ytd', n - 3) : 0;
  return `<div class="oty-tiles">
    <div class="oty-card oty-tile now"><div class="k">${cy} · 1 Jan – ${c}</div><div class="v">${otyM(cur)}</div><div class="s">${otySetName(OTY.b)}</div>${otyChg(otyPct(prev, cur))}<div class="s" style="margin-top:6px">on the same days of ${cy - 1}</div></div>
    <div class="oty-card oty-tile"><div class="k">${cy - 1} · 1 Jan – ${c}</div><div class="v">${otyM(prev)}</div><div class="s">${otySetName(OTY.b)}</div>${otyChg(otyPct(prev2, prev))}<div class="s" style="margin-top:6px">on the same days of ${cy - 2}</div></div>
  </div>`;
}
function otyChartBlock(rows) {
  const { years, sets } = otyD, set = sets[OTY.b], n = years.length;
  const W = 360, H = 300, L = 38, R = 38, T = 26, B = 30, bw = (W - L - R) / n, bar = Math.min(30, bw * .62);
  const maxNet = Math.max(...rows.map(r => r.net), 1) * 1.12, yb = v => T + (H - T - B) * (1 - v / maxNet);
  const vals = rows.map(r => OTY.line === 'growth' ? r.growth : OTY.line === 'avg' ? r.avg : r.stf);
  const nums = vals.filter((v, i) => v != null && (v !== 0 || OTY.line === 'growth'));
  let lo, hi;
  if (OTY.line === 'growth') { lo = Math.min(-10, ...nums); hi = Math.max(10, ...nums); lo = Math.floor(lo / 10) * 10; hi = Math.ceil(hi / 10) * 10; }
  else { lo = Math.min(...(nums.length ? nums : [0])) * .85; hi = Math.max(...(nums.length ? nums : [1])) * 1.08; }
  const yl = v => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  const fmtL = v => OTY.line === 'growth' ? (v > 0 ? '+' : '') + Math.round(v) + '%' : OTY.line === 'avg' ? Math.round(v) : v >= 1000 ? (v / 1000).toFixed(0) + 'k' : Math.round(v);
  const sel = OTY.sel;
  let g = `<rect x="${L + bw * sel}" y="${T - 6}" width="${bw}" height="${H - T - B + 6}" fill="var(--accent)" opacity=".1" rx="4"/>`;
  for (let k = 0; k <= 4; k++) {
    const v = maxNet * k / 4, y = yb(v);
    g += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="var(--border)"/><text x="${L - 6}" y="${y + 3.5}" text-anchor="end" font-size="9.5">${v === 0 ? '0' : otyMs(v)}</text>`;
    const lv = lo + (hi - lo) * k / 4;
    g += `<text class="tl" x="${W - R + 6}" y="${yl(lv) + 3.5}" font-size="9.5">${fmtL(lv)}</text>`;
  }
  if (OTY.line === 'growth' && lo < 0) g += `<line x1="${L}" x2="${W - R}" y1="${yl(0)}" y2="${yl(0)}" stroke="var(--warn)" stroke-opacity=".4" stroke-dasharray="3 3"/>`;
  rows.forEach((r, i) => {
    const cx = L + bw * i + bw / 2, x0 = cx - bar / 2; let acc = 0;
    r.per.forEach(p => {
      if (!p.v) return;
      const h = (H - T - B) * p.v / maxNet, y = yb(acc + p.v); acc += p.v;
      g += `<rect x="${x0}" y="${y}" width="${bar}" height="${h}" fill="${set.length === 1 ? 'var(--hair)' : OTY_COL[p.b]}" opacity="${r.partial ? .5 : .92}" ${r.partial ? 'stroke="var(--text)" stroke-opacity=".6" stroke-dasharray="3 2"' : ''}/>`;
    });
    g += `<text class="tv" x="${cx}" y="${yb(r.net) - 5}" text-anchor="middle" font-size="9.5">${r.net ? otyMs(r.net) : '·'}</text>`;
    g += `<text x="${cx}" y="${H - 10}" text-anchor="middle" font-size="10.5" style="${i === sel ? 'fill:var(--accent);font-weight:700' : ''}">${r.y}${r.partial ? '*' : ''}</text>`;
  });
  const pts = rows.map((r, i) => ({ i, v: vals[i] })).filter(p => p.v != null && (p.v !== 0 || OTY.line === 'growth'));
  if (pts.length) g += `<path d="${pts.map((p, k) => (k ? 'L' : 'M') + (L + bw * p.i + bw / 2).toFixed(1) + ' ' + yl(p.v).toFixed(1)).join(' ')}" fill="none" stroke="var(--warn)" stroke-width="2.4" stroke-linejoin="round"/>`;
  pts.forEach(p => g += `<circle cx="${L + bw * p.i + bw / 2}" cy="${yl(p.v)}" r="${p.i === sel ? 5 : 3.5}" fill="${p.i === sel ? 'var(--bg)' : 'var(--warn)'}" stroke="var(--warn)" stroke-width="2"/>`);
  const lineName = OTY.line === 'growth' ? 'Growth vs the year before (same days)' : OTY.line === 'avg' ? 'Average bill per staff (AED)' : 'Clients counted by staff';
  const legend = (set.length > 1 ? set.map(b => `<span><i style="background:${OTY_COL[b]}"></i>${OTY_NAME[b]}</span>`).join('') : `<span><i style="background:var(--hair)"></i>${OTY_NAME[set[0]]}</span>`)
    + `<span><i class="ln" style="background:var(--warn)"></i>${lineName}</span>`;
  const r = rows[sel], lab = OTY.basis === 'same' || r.partial ? `1 Jan – ${otyCutLabel()}` : 'full year';
  const split = r.per.filter(p => p.v).map(p => `<span><b style="color:${OTY_COL[p.b]}">${OTY_NAME[p.b]}</b> ${otyM(p.v)}</span>`).join('');
  const readout = `<b>${r.y}</b> · ${lab}<div class="oty-ro"><span>Net take <b>${otyM(r.net)}</b></span><span>Clients, per staff <b>${otyNum(r.stf)}</b></span><span>Avg bill, per staff <b>${r.avg ? otyAed(r.avg) : '·'}</b></span><span>Growth ${otyTxt(r.growth)}</span><span style="opacity:.8">Per visit: ${r.avgV ? otyAed(r.avgV) : '·'} over ${otyNum(r.vis)} visits</span></div>${set.length > 1 ? `<div class="oty-ro">${split}</div>` : ''}`;
  const pills = [['growth', 'Growth vs last year'], ['avg', 'Average bill per staff'], ['stf', 'Clients per staff']]
    .map(([k, l]) => `<button class="oty-pill" aria-pressed="${OTY.line === k}" onclick="otySet('line','${k}')">Line: ${l}</button>`).join('');
  return `<div class="oty-eb"><i style="background:var(--hair)"></i>Net take by year, with the line on top</div>
    <div class="oty-card"><div class="oty-pills" style="margin-bottom:12px">${pills}</div><div class="oty-legend">${legend}</div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Net take by year, as bars, with a line" onpointerdown="otyTapChart(event,${n},${L},${R},${W})">${g}</svg>
    <div class="oty-read">${readout}</div></div>
    <p class="oty-note" style="margin:10px 2px 0">${OTY.basis === 'full' ? `* ${otyD.curYear} is 1 Jan to ${otyCutLabel()} only, shown faded. ` : `Every bar is 1 Jan to ${otyCutLabel()} of that year. `}The line reads on the right-hand scale. Growth over 100% is a year new branches opened in, so it is left off the line. Tap a year.</p>`;
}
function otyTapChart(ev, n, L, R, W) {
  const r = ev.currentTarget.getBoundingClientRect(), px = (ev.clientX - r.left) / r.width * W, bw = (W - L - R) / n;
  otyPick(Math.max(0, Math.min(n - 1, Math.floor((px - L) / bw))));
}
function otyTable(rows) {
  let h = '<tr><th>Year</th><th>Net take</th><th>Clients</th><th>Avg bill</th><th>Growth</th></tr>';
  rows.slice().reverse().forEach(r => {
    h += `<tr><td>${r.y}${r.partial ? '*' : ''}</td><td>${otyM(r.net)}</td><td class="m">${otyNum(r.stf)}</td><td class="m">${r.avg ? Math.round(r.avg) : '·'}</td><td class="${r.growth == null ? 'm' : r.growth > 0 ? 'oty-up' : 'oty-dn'}">${r.growth == null ? (r.big ? 'new' : '·') : (r.growth > 0 ? '+' : '') + r.growth.toFixed(1) + '%'}</td></tr>`;
  });
  return `<div class="oty-eb"><i style="background:var(--warn)"></i>The years, side by side</div>
    <div class="oty-card"><table>${h}</table><p class="oty-note" style="margin:10px 0 0">Clients and Avg bill are per staff, the same default as the Pulse. Per visit, through the door, is in the readout above.</p></div>`;
}

// ── SEASONS ──────────────────────────────────────────────────────────────
function otySeasons() {
  const { years, cut } = otyD, ss = (otyRaw.seasons || []);
  const names = [...new Set(ss.slice().sort((a, b) => a.sort - b.sort).map(r => r.season))];
  if (!names.length) return '';
  const cards = names.map(nm => {
    const rows = ss.filter(r => r.season === nm);
    const by = y => rows.find(r => r.y === y);
    const vals = years.map(y => { const r = by(y); return r && r.days > 0 && r.per_day != null ? +r.per_day : null; });
    const mx = Math.max(...vals.filter(v => v != null), 1);
    const lastY = years[years.length - 1], prevY = years[years.length - 2];
    const rl = by(lastY), part = !!(rl && rl.days > 0 && rl.end_date > cut);
    const total = rl ? Math.round((new Date(rl.end_date) - new Date(rl.start_date)) / 864e5) + 1 : 0;
    const last = vals[vals.length - 1], prev = vals[vals.length - 2];
    const head = last == null ? `<span class="oty-chg flat">${rl && rl.start_date > cut ? 'not started' : 'n/a'}</span>` : otyChg(otyPct(prev, last));
    const cols = vals.map((v, i) => v == null
      ? `<div class="oty-col"><span class="vl">·</span><div class="b none" style="height:3px"></div></div>`
      : `<div class="oty-col ${i === vals.length - 1 ? 'last' : ''}"><span class="vl">${(v / 1000).toFixed(1)}k</span><div class="b ${part && i === vals.length - 1 ? 'part' : ''}" style="height:${Math.max(4, v / mx * 84)}px"></div></div>`).join('');
    const starts = rows.slice().sort((a, b) => a.y - b.y);
    const same = starts.every(r => r.start_date.slice(5) === starts[0].start_date.slice(5) && r.end_date.slice(5) === starts[0].end_date.slice(5));
    const dt = same ? `${otyDay(starts[0].start_date)} to ${otyDay(starts[0].end_date)}, every year`
      : 'Starts ' + starts.map(r => `${otyDay(r.start_date)} ${r.y}`).join(' · ');
    const note = part ? `<div class="oty-note" style="margin-top:8px;color:var(--warn)">Part season, ${rl.days} of ${total} days so far. Firms up when it closes.</div>` : '';
    return `<div class="oty-card oty-sn"><div class="h"><span class="nm">${otyEsc(nm)}</span>${head}</div><div class="dt">${otyEsc(dt)}</div>
      <div class="oty-cols" style="grid-template-columns:repeat(${years.length},minmax(0,1fr))">${cols}</div>
      <div class="oty-yrs" style="grid-template-columns:repeat(${years.length},minmax(0,1fr))">${years.map(y => `<span>${String(y).slice(2)}</span>`).join('')}</div>${note}</div>`;
  }).join('');
  const lfl = otyD.present.includes('SAA') && otyD.present.includes('KCA');
  return `<div class="oty-eb"><i style="background:var(--hair)"></i>Season on season · Saadiyat + Khalifa City A, per open day</div>
    <div class="oty-sg">${cards}</div>
    <p class="oty-note" style="margin:10px 2px 0">${lfl ? '' : 'Your login sees one branch, so these seasons are empty. '}Only Saadiyat and Khalifa City A are in these, because they are the two branches with data in every year. Per open day, because the seasons run different lengths. Bars are net take per day. The season list is one table (oty_seasons); the four here are a placeholder until Emma sets the real ones.</p>`;
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
  const W = 360, H = 260, L = 34, R = 36, T = 24, B = 28, bw = (W - L - R) / n, bar = Math.min(30, bw * .62);
  const maxN = Math.max(250, Math.ceil(Math.max(...rows.map(r => r.n), 1) * 1.08 / 250) * 250), yb = v => T + (H - T - B) * (1 - v / maxN);
  const lo = 4.4, hi = 5.0, yl = v => T + (H - T - B) * (1 - (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo));
  let g = '';
  for (let k = 0; k <= 4; k++) { const v = maxN * k / 4, y = yb(v); g += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="var(--border)"/><text x="${L - 6}" y="${y + 3.5}" text-anchor="end" font-size="9.5">${Math.round(v)}</text>`; }
  [4.4, 4.6, 4.8, 5.0].forEach(v => g += `<text class="tl" x="${W - R + 6}" y="${yl(v) + 3.5}" font-size="9.5">${v.toFixed(1)}</text>`);
  rows.forEach((r, i) => {
    const cx = L + bw * i + bw / 2, x0 = cx - bar / 2; let acc = 0;
    r.per.forEach(p => { if (!p.v) return; const h = (H - T - B) * p.v / maxN, y = yb(acc + p.v); acc += p.v;
      g += `<rect x="${x0}" y="${y}" width="${bar}" height="${h}" fill="${set.length === 1 ? 'var(--hair)' : OTY_COL[p.b]}" opacity="${r.partial ? .5 : .92}" ${r.partial ? 'stroke="var(--text)" stroke-opacity=".6" stroke-dasharray="3 2"' : ''}/>`; });
    g += `<text class="tv" x="${cx}" y="${yb(r.n) - 5}" text-anchor="middle" font-size="9.5">${r.n || '·'}</text><text x="${cx}" y="${H - 9}" text-anchor="middle" font-size="10.5">${r.y}${r.partial ? '*' : ''}</text>`;
  });
  const pts = rows.filter(r => r.n);
  if (pts.length) g += `<path d="${pts.map((r, k) => (k ? 'L' : 'M') + (L + bw * r.i + bw / 2).toFixed(1) + ' ' + yl(r.stars).toFixed(1)).join(' ')}" fill="none" stroke="var(--warn)" stroke-width="2.4" stroke-linejoin="round"/>`;
  pts.forEach(r => g += `<circle cx="${L + bw * r.i + bw / 2}" cy="${yl(r.stars)}" r="3.6" fill="var(--warn)"/>`);
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
  const W = 360, H = 270, L = 32, R = 30, T = 22, B = 34, bw = (W - L - R) / n, bar = Math.max(5, bw * .62);
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
  const line = (arr, col, w) => { let d = '', pen = false; arr.forEach((v, i) => { if (v == null) { pen = false; return; } d += (pen ? 'L' : 'M') + (L + bw * i + bw / 2).toFixed(1) + ' ' + yp(v).toFixed(1) + ' '; pen = true; }); return `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linejoin="round"/>`; };
  g += line(own, 'var(--warn)', 2.4) + line(col, 'var(--good)', 2.2);
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
  const rows = [['Phorest daily totals', has('net')], ['Phorest sales lines', has('vis')], ['Phorest per staff', has('stf')],
    ['Ledgers (hair, beauty)', years.map(y => y >= 2025 ? 1 : 0)], ['Google reviews (year only)', years.map(y => present.some(b => (otyD.D[b].rev.n[years.indexOf(y)] || 0) > 0) ? 2 : 0)],
    ['Instagram posts, collabs, tags', years.map(y => y >= 2025 ? 2 : 0)]];
  const tpl = `minmax(0,1.5fr) repeat(${years.length},minmax(0,1fr))`;
  return `<div class="oty-eb"><i style="background:var(--good)"></i>What each year has behind it</div>
    <div class="oty-card"><div class="oty-cov" style="grid-template-columns:${tpl}"><span></span>${years.map(y => `<span style="text-align:center">${String(y).slice(2)}</span>`).join('')}
    ${rows.map(([l, a]) => `<span class="l">${l}</span>${a.map(c => `<span class="c ${c === 2 ? 'part' : c ? 'ok' : ''}"></span>`).join('')}`).join('')}</div>
    <p class="oty-note" style="margin:12px 0 0">Green is complete. Yellow is there but with a caveat: Google review dates are approximate before 2026, and Instagram only exists from 2025 and builds up through the year. Net take, per-staff clients, average bill and visits go back to 2021, from Phorest. Hair against beauty, rebooking, requests and per-staff counts need the ledger, which starts in 2025, so those measures would show a dash before then.</p></div>`;
}
function otyNotes() {
  return `<div class="oty-eb"><i style="background:var(--accent)"></i>How to read this page</div>
    <div class="oty-card oty-note">
      <p><b>Seasons, not calendar months.</b> Ramadan and Eid move about 11 days earlier every year, so month against month compares different seasons.</p>
      <p><b>Branches arrive over time.</b> Motor City's data starts Nov 2022 and Al Quoz's Sep 2023, so the all-branches total jumps when they appear. Like for like (Saadiyat + Khalifa City A) is the trend.</p>
      <p><b>Fratelli</b> closed on 22 May 2026. It is out of All four, as everywhere on the dashboard, and has its own chip, and All + Fratelli puts it back in for the years it traded.</p>
      <p><b>Same days first.</b> The year in progress is set against the same dates in every earlier year. Switch to Full years to see whole years, with this one marked as partial.</p>
      <p><b>Slightly different from the Pulse.</b> These are Phorest's own financial totals. The Pulse's net take is built from the ledgers, so the two differ by about 1%.</p>
    </div>`;
}
