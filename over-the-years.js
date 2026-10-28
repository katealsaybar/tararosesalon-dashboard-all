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

// Kate, 14 Oct 2026: Marasy (MRY), a former branch with Phorest daily totals and per-staff counts from 1 Jul 2021 to 24 Dec
// 2022 (the real closing date is unproven, so it is "data to", not "closed"). It has its own chip and is never part of All
// four or Like for like, but it is in All + closed (with Fratelli), so the group's whole history adds up. Its own chip always reads
// whole years, since "same days of this year" means nothing for it.
// Kate, 16 Oct 2026: for a few hours 2021 per-visit was left out whenever Saadiyat or Khalifa City A was in the set, because their
// sales lines (the visits) only started on 23 Aug and 10 Aug 2021 though they traded from 1 Jul. The Phorest PDFs for the earlier days
// were on disk but the parser needed a 4-digit sale id (July's are 1 to 3 digits), so those days failed their check and were skipped.
// Fixed and backfilled the same day (every 2021 trading day now has lines), so the list is empty. If a branch's year ever comes up
// short of lines again, put its code here and its per-visit figures for that year are left out rather than overstated.
const OTY_VIS_GAP_2021 = [];
const OTY_BR = ['SAA', 'KCA', 'MC', 'AQ', 'FRT', 'MRY'];
const OTY_NAME = { SAA: 'Saadiyat', KCA: 'Khalifa City A', MC: 'Motor City', AQ: 'Al Quoz', FRT: 'Fratelli', MRY: 'Marasy' };
const OTY_COL = { SAA: '#C4B5FD', KCA: '#FFD4D9', MC: '#99F6E4', AQ: '#FF9B9B', FRT: '#EEF3C7', MRY: '#A5D8FF' };
const OTY_ORDER = ['ALL', 'LFL', 'SAA', 'KCA', 'MC', 'AQ', 'ALLF', 'FRT', 'MRY'];
// Kate, 18 Oct 2026: Marasy's reviews are in now (84 rebuilt from Google's notification emails), so it counts like the others, but only what the emails kept.
const OTY_MRY_REV = "Marasy's reviews are only the ones Google's notification emails kept (its Google profile cannot be reached), so its count is short of the real total.";
const OTY_HIST = ['FRT', 'MRY'];   // branches that are not open now, so out of All four
// Kate, 14 Oct 2026: "gamitin na lang natin yung global sticky filters, nakakalito". The page's own Branches pills are gone;
// the branch comes from the masthead Branch chips (sel.branch), like the Pulse. UAE Branches = every branch with figures,
// closed ones included for the years they traded; one chip = that branch; several chips = those added together. The masthead
// Period chips are greyed here (the page sets years against years itself), and the closed-branch chips always show.
function otyCodes() {
  const have = otyD ? otyD.present : [];
  const all = typeof sel === 'undefined' || !sel.branch || sel.branch.includes('all');
  const picked = all ? [] : OTY_BR.filter(b => sel.branch.includes(b) && have.includes(b));
  return picked.length ? picked : have.slice();
}
const otySetLabel = set => {
  const have = otyD ? otyD.present : [];
  if (set.length === have.length) return set.some(b => OTY_HIST.includes(b)) ? 'All four + Fratelli + Marasy' : 'All four branches';
  return set.map(b => OTY_NAME[b]).join(' + ');
};
const otyHist = () => { const c = otyCodes(); return c.length === 1 && c[0] === 'MRY'; };
const otySame = () => OTY.basis === 'same' && !otyHist();
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
  /* Kate, 14 Oct 2026: "6 containers, scrollable from left to right like an album, kasi 2025 at 2024 lang to". One tile for every year
     that has figures, newest first, in a row that scrolls sideways and snaps. About three and a bit show on a laptop (the fourth
     peeks, so it reads as scrollable), one and a bit on a phone. Tapping a tile picks that year in the chart below.
     Kate, 14 Oct 2026: "too wide containers" on a big screen, where a third of the row is about 490px for one short number. From 1280px
     up a tile is a sixth of the row, never under 190px, so all six years sit in one row on a wide screen (the page is at most 1320px
     wide, so about 210px each) and the row only scrolls when the screen is too narrow for that. */
  .oty .oty-tiles{display:flex;gap:10px;margin-top:18px;overflow-x:auto;scroll-snap-type:x proximity;padding:2px 2px 10px;
    -webkit-overflow-scrolling:touch;scrollbar-width:thin;overscroll-behavior-x:contain}
  .oty .oty-tiles .oty-tile{flex:0 0 calc((100% - 20px) / 3.25);min-width:210px;scroll-snap-align:start;cursor:pointer;user-select:none}
  @media(min-width:1280px){.oty .oty-tiles .oty-tile{flex-basis:max(190px,calc((100% - 50px) / 6));min-width:190px}}
  @media(max-width:700px){.oty .oty-tiles .oty-tile{flex-basis:76%;min-width:0}}
  .oty .oty-tiles:focus-visible{outline:2px solid var(--accent);outline-offset:3px;border-radius:12px}
  .oty .oty-tiles .oty-tile:hover{border-color:var(--muted2)}
  .oty .oty-tiles .oty-tile.sel{border-color:var(--accent)}
  .oty .oty-tile .k{font-size:10.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted2)}
  .oty .oty-tile .v{font-size:clamp(19px,5.6vw,30px);font-weight:600;margin:6px 0 2px;font-variant-numeric:tabular-nums;white-space:nowrap}
  .oty .oty-tile .s{font-size:12px;color:var(--muted);line-height:1.4}
  .oty .oty-tile.now{border-color:var(--accent)}
  .oty .oty-rows,.oty .oty-m,.oty .oty-jumpm{display:none}
  /* Kate, 16 Oct 2026: Measure and Index set against as toggles (one row, like Daily Performance's Team toggle) */
  /* Kate, 28 Oct 2026: the toggles looked "stocky and out of place": slimmer track, lighter text, a smaller filled pill (phone keeps the 44px touch size below) */
  .oty .oty-seg{display:flex;max-width:100%;padding:2px;gap:2px;border:1px solid var(--border);border-radius:999px;background:transparent;width:max-content}
  .oty .oty-sg{appearance:none;border:0;background:transparent;color:var(--muted);font:500 12.5px Inter,sans-serif;padding:5px 14px;border-radius:999px;cursor:pointer;white-space:nowrap;min-height:30px;transition:background .15s,color .15s}
  .oty .oty-sg:hover:not([aria-pressed=true]){color:var(--text)}
  .oty .oty-sg[aria-pressed=true]{background:var(--accent);color:var(--accent-fg);font-weight:600}
  .oty .oty-sg .s{display:none}
  .oty .oty-sp,.oty .mo-swipe{display:none}
  .oty .oty-sm{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,330px),1fr));gap:0 32px;margin-top:6px}
  .oty .oty-sm .oty-hint{grid-column:1 / -1;margin:0 0 6px}
  .oty .sm-blk{padding:12px 0;border-top:1px solid var(--border)}
  .oty .sm-blk:first-of-type{border-top:0}
  .oty .sm-t{font-size:15px;font-weight:700;margin:0 0 6px}.oty .sm-t small{font-size:11.5px;font-weight:500;color:var(--muted2)}
  .oty .sm-g{position:relative;display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:3px}
  .oty .sm-g::before{content:'';position:absolute;left:0;right:0;top:var(--base);border-top:1px dashed var(--muted2);pointer-events:none}
  .oty .sm-c{position:relative;height:calc(var(--SH) + 20px)}
  .oty .sm-b{position:absolute;left:12%;right:12%;border-radius:3px}
  .oty .sm-b.up{background:var(--good)}.oty .sm-b.dn{background:var(--bad)}
  .oty .sm-v{position:absolute;left:-4px;right:-4px;text-align:center;font-style:normal;font-size:10.5px;font-weight:600;color:var(--text);font-variant-numeric:tabular-nums;line-height:12px;white-space:nowrap}
  .oty .sm-m{position:absolute;left:0;right:0;top:calc(var(--SH) + 4px);text-align:center;font-style:normal;font-size:10.5px;color:var(--muted2)}
  .oty .sm-r{display:block;font-size:10px;line-height:1;color:var(--text)}
  .oty .st-yrs{display:grid;gap:8px 14px;grid-template-columns:repeat(auto-fit,minmax(min(100%,170px),1fr))}
  .oty .st-y{display:grid;grid-template-columns:50px minmax(0,1fr) minmax(0,1fr);align-items:center;gap:8px}
  .oty .st-y b{font-size:14px;font-variant-numeric:tabular-nums}
  .oty .st-c{font-size:13px;font-weight:700;padding:7px 10px;border-radius:999px;white-space:nowrap;text-align:center}
  .oty .st-c.hi{color:var(--good);background:var(--good-bg)}.oty .st-c.lo{color:var(--bad);background:var(--bad-bg)}
  .oty .st-spr{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:4px;align-items:end}
  .oty .st-b{display:flex;flex-direction:column;align-items:center;gap:3px}
  .oty .st-t{width:100%;height:112px;padding-top:18px;box-sizing:border-box;display:flex;align-items:flex-end}
  .oty .st-f{position:relative;width:100%;border-radius:4px 4px 0 0;background:var(--border)}
  .oty .st-f em{position:absolute;left:-6px;right:-6px;bottom:100%;margin-bottom:3px;text-align:center;font-style:normal;font-size:11px;font-weight:700;color:var(--text);font-variant-numeric:tabular-nums;line-height:1}
  .oty .st-b.ok .st-f{background:var(--good)}.oty .st-b.wd .st-f{background:var(--warn)}
  .oty .st-b i{font-style:normal;font-size:10px;color:var(--muted2)}
  .oty .st-k{display:inline-block;width:10px;height:10px;border-radius:3px;margin:0 5px 0 0;vertical-align:-1px}
  .oty .st-k+.st-k,.oty .oty-hint .st-k:not(:first-child){margin-left:12px}
  .oty .st-k.ok{background:var(--good)}.oty .st-k.wd{background:var(--warn)}
  .oty .oty-how summary{cursor:pointer;font-weight:700;color:var(--text);font-size:13.5px;min-height:28px}
  .oty .oty-how ul{margin:10px 0 0;padding-left:18px}.oty .oty-how li{margin:0 0 8px}
  .oty .mo-sw{position:relative}
  .oty .mo-sw::before,.oty .mo-sw::after{content:'';position:absolute;top:0;bottom:0;width:34px;pointer-events:none;opacity:0;transition:opacity .15s;z-index:3}
  .oty .mo-sw::after{right:0;background:linear-gradient(to left,var(--surface),transparent)}
  .oty .mo-sw::before{left:0;background:linear-gradient(to right,var(--surface),transparent)}
  .oty .mo-sw.can-r::after,.oty .mo-sw.can-l::before{opacity:1}
  @media(max-width:760px),(hover:none) and (max-height:480px){
    .oty .oty-tiles,.oty .oty-d,.oty .lg-side{display:none}
    .oty .oty-m{display:inline}
    .oty .oty-rows{display:block;margin-top:14px}
    .oty .oty-rcap{margin:0 0 2px;font-size:13px;color:var(--muted)}
    .oty .oty-rh,.oty .oty-row{display:grid;grid-template-columns:minmax(0,1fr) 76px 92px;column-gap:10px;align-items:center}   /* fixed columns, so the header sits over the figures */
    .oty .oty-rh{font-size:12px;color:var(--muted);padding:8px 0 6px;border-bottom:1px solid var(--border)}
    .oty .oty-rh span:not(:first-child){text-align:right}
    .oty .oty-row{min-height:52px;padding:0 8px;margin:0 -8px;border-bottom:1px solid var(--border);cursor:pointer;-webkit-tap-highlight-color:transparent}
    .oty .oty-row.sel{background:color-mix(in srgb,var(--accent) 14%,transparent);border-radius:8px}
    .oty .oty-row .y b{display:block;font-size:16px;font-weight:600;line-height:1.2}
    .oty .oty-row .y small,.oty .oty-row .g small{display:block;font-size:12px;color:var(--muted);line-height:1.3}
    .oty .oty-row .v{font-size:16px;font-weight:600;text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
    .oty .oty-row .g{text-align:right}
    .oty .oty-row .g .oty-chg{margin-top:0;font-size:12.5px}
    .oty .oty-jumpm{display:block;margin:14px 0 4px}
    .oty .oty-jumpm>span{display:block;font-size:12px;color:var(--muted);margin:0 0 4px}
    .oty .oty-jumpm select{width:100%;min-height:44px}
    /* Kate, 16 Oct 2026: on a phone the site swaps this select for its pill button (.ps), and two page rules reached into it: the
       label rule made the .ps wrapper a block, and .oty svg{width:100%} stretched the chevron to the full width, so the control
       became a 283px circle. The label rule now takes only the direct span, and the chevron keeps its own size. */
    .oty .oty-jumpm .ps{display:flex;width:100%}
    .oty .oty-jumpm .ps-btn{min-height:44px}
    .oty .ps-btn svg{width:10px;height:10px;flex:none}
    .oty .oty-pill,.oty .oty-chip{min-height:44px}
    /* Kate, 16 Oct 2026: "wag mo na ibalot sa containers masyado, it looks constricted. Base it on Daily Performance." Same as
       mobile-late.css does for .dpf: no box round a card on a phone, a hairline between one section and the next. A flagged
       card keeps its coloured edge, since that is the signal. The boxes inside a card (stat tiles, the 2026 read-out) go too. */
    .oty .oty-card{background:none;border:0;border-radius:0;box-shadow:none;padding:16px 0 0;border-top:1px solid var(--border)}
    .oty .oty-card.oty-flag{border-left:3px solid var(--warn);padding-left:12px}
    .oty .oty-card .oty-rs,.oty .oty-card .mo-dt>div,.oty .oty-card .oty-read{background:none;border:0;border-radius:0;padding:10px 0 0;border-top:1px solid var(--border)}
    .oty .oty-card .oty-rt,.oty .oty-card .mo-dt{gap:0 18px}
    .oty .mo-hm .yr{background:var(--bg)}
    .oty .mo-sw::after{background:linear-gradient(to left,var(--bg),transparent)}
    .oty .mo-sw::before{background:linear-gradient(to right,var(--bg),transparent)}
    .oty .oty-seg{width:100%}
    .oty .oty-sg{flex:1 1 0;min-height:44px;padding:9px 8px}
    .oty .oty-sg .l{display:none}.oty .oty-sg .s{display:inline}
    .oty .mo-swipe{display:block;font-size:12.5px;color:var(--muted);margin:0 0 8px}
    /* a tappable month looks tappable: a visible edge, and a press state */
    .oty .mo-hm button.mo-c:not(.sel):not(.none):not(.part):not(.ahead){border-color:color-mix(in srgb,var(--text) 24%,transparent)}
    .oty .mo-hm button.mo-c:active,.oty .mo-pr.hit:active{filter:brightness(1.25)}
    .oty .mo-pr.hit{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--text) 18%,transparent)}
    .oty .mo-hm .yr{position:sticky;left:0;z-index:2;background:var(--surface)}
    .oty .oty-plot,.oty .oty-lines{display:none}
    .oty .oty-sm{display:block;margin-top:10px}
    .oty .oty-card .oty-cov{grid-template-columns:repeat(var(--cols),minmax(0,1fr));gap:4px}
    .oty .oty-card .oty-cov .cx{display:none}
    .oty .oty-card .oty-cov .l{grid-column:1 / -1;font-size:13px;color:var(--text);margin-top:10px}
    .oty .oty-card .oty-cov .c{height:22px}
    .oty .oty-sp{display:block;margin-top:14px}
    .oty .oty-spb{padding:14px 0;border-top:1px solid var(--border)}
    .oty .oty-spb:first-child{border-top:0;padding-top:0}
    .oty .oty-sph{display:flex;align-items:center;justify-content:space-between;gap:10px}
    .oty .oty-sph b{display:flex;align-items:center;gap:8px;font-size:15px}
    .oty .oty-sph b i{width:10px;height:10px;border-radius:3px;flex:none}
    .oty .oty-spm{font-size:12px;color:var(--muted2);line-height:1.4;margin:4px 0 8px}
    .oty .oty-sp .oty-bars{gap:6px}
    .oty .oty-sp .oty-bars .oty-bar{max-width:none}
    .oty .oty-sp .oty-bars .oty-bar .vl,.oty .oty-sp .oty-bars .oty-bar:not(.cur) .vl{display:block;font-size:10.5px}
    .oty .oty-sp .oty-yl{gap:6px}
    .oty .oty-sp .oty-yl span,.oty .oty-sp .oty-yl span:not(.cur){max-width:none;font-size:11px}
    /* The years table was squeezed into 375px with fixed columns: headers ran into each other and every figure was cut to "20...".
       On a phone each year is a small card, the labels coming from data-l on each cell. */
    .oty table.oty-yt,.oty table.oty-yt tbody{display:block}
    .oty table.oty-yt .oty-th{display:none}
    .oty table.oty-yt tr{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 14px;padding:14px 0;border-top:1px solid var(--border)}
    .oty table.oty-yt tr:first-child+tr{border-top:0;padding-top:2px}
    .oty table.oty-yt td{display:block;border:0;padding:0;text-align:left;width:auto;white-space:normal;overflow:visible;font-size:15px;font-weight:600;color:var(--text)}
    .oty table.oty-yt td::before{content:attr(data-l);display:block;font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted2);margin-bottom:2px}
    .oty table.oty-yt td.yr{grid-column:1 / -1;font-family:'Playfair Display',serif;font-weight:500;font-size:22px}
    .oty table.oty-yt td.yr::before,.oty table.oty-yt td.nt::before{display:none}
    .oty table.oty-yt td.nt{font-size:20px;color:var(--text)}
    .oty table.oty-yt td.m{color:var(--text)}
  }
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
  .oty .oty-legend .nope{opacity:.6}
  .oty .oty-legend .nope s{text-decoration:line-through;text-decoration-thickness:1.5px}
  .oty .oty-legend .nope i{background:transparent!important;box-shadow:inset 0 0 0 1.5px var(--muted2)}
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
  /* The years, side by side (Kate, 28 Oct 2026: "masyadong dikit dikit yung header titles"): room between the six figures, and a long title wraps onto two lines instead of touching the next one. Phone keeps its own card layout above. */
  @media(min-width:761px){
    .oty table.oty-yt th{padding:8px 16px 8px 12px;line-height:1.4;white-space:normal;vertical-align:bottom;letter-spacing:.06em}
    .oty table.oty-yt td{padding:12px 16px 12px 12px}
    .oty table.oty-yt th:first-child,.oty table.oty-yt td:first-child{width:9%;padding-left:6px}
    .oty table.oty-yt th:last-child,.oty table.oty-yt td:last-child{padding-right:8px}
  }
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
  .oty .oty-delta{height:50px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;text-align:center}
  .oty .oty-dp{font-weight:600;font-size:clamp(11px,1.2vw,12.5px);padding:3px 10px;border-radius:999px;white-space:nowrap}
  .oty .oty-dp.up{color:var(--good);background:var(--good-bg)}.oty .oty-dp.dn{color:var(--bad);background:var(--bad-bg)}.oty .oty-dp.flat{color:var(--muted);background:var(--surface2)}
  .oty .oty-delta small{font-size:10.5px;color:var(--muted2);line-height:1.25}
  .oty .oty-bars{display:flex;align-items:flex-end;justify-content:center;gap:clamp(2px,.6vw,7px);height:var(--H)}
  .oty .oty-bar{flex:1 1 0;max-width:46px;height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;cursor:pointer;outline:none;position:relative}
  .oty .oty-bar .vl{font-size:clamp(8px,.85vw,10.5px);color:var(--muted);font-variant-numeric:tabular-nums;margin-bottom:4px;white-space:nowrap}
  .oty .oty-bar .b{width:100%;border-radius:5px 5px 0 0;transition:filter .12s;position:relative}
  .oty .mo-hm .mo-c.mry{box-shadow:inset 0 -3px 0 #A5D8FF}
  .oty .mo-hm .mo-c.brk{outline:2px dashed #3f8fd2;outline-offset:-3px}
  .oty .mo-hm .mo-c.est{outline:1.5px dotted var(--muted);outline-offset:-3px}
  .oty .oty-bar .b .mseg{position:absolute;left:0;right:0;top:0;background:#A5D8FF;border-radius:5px 5px 0 0;min-height:3px}
  .oty .oty-mdot{display:inline-block;width:9px;height:9px;border-radius:2px;background:#A5D8FF;margin-right:5px;vertical-align:-1px}
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
  .oty .oty-cov{grid-template-columns:minmax(0,1.5fr) repeat(var(--cols),minmax(0,1fr))}
  .oty .st-k.cv{background:var(--warn)}.oty .st-k.no{background:var(--surface2);box-shadow:inset 0 0 0 1px var(--border)}
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
  .oty .mo-hm{min-width:724px;display:grid;grid-template-columns:44px repeat(12,minmax(0,1fr)) 46px 46px;gap:4px;align-items:stretch}
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
  .oty .mo-hm .tot{background:transparent;border:1px solid var(--muted2);cursor:default;font-weight:700}
  .oty .mo-hm .tot.none{border:1px dashed var(--border);font-weight:500}
  .oty .mo-hm button.tot{cursor:pointer;color:var(--text);font-family:inherit;font-size:13px}
  .oty .mo-hm button.tot:hover{border-color:var(--text)}
  .oty .mo-hm button.tot.sel{border-color:var(--text);box-shadow:0 0 0 1px var(--text)}
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
  .oty #otyMoDetail{scroll-margin:140px 0 20px}
  .oty .mo-pr.hit{cursor:pointer;border-radius:8px;transition:background .12s}
  .oty .mo-pr.hit:hover,.oty .mo-pr.hit.on{background:var(--surface2)}
  .oty .mo-b{flex:1 1 0;max-width:22px;border-radius:4px 4px 0 0}
  .oty .mo-b.live{background-image:repeating-linear-gradient(135deg,rgba(45,46,55,.62) 0 4px,transparent 4px 9px)}
  .oty .mo-pr .m{margin-top:6px;font-size:11px;color:var(--muted2)}
  /* Type floor on a phone (audit 18 Oct 2026, P1-13): 240 text runs here measured 9 to 11.5px at 375. Nothing below 12px. */
  @media(max-width:760px),(hover:none) and (max-height:480px){
    :root .oty .oty-eb,
    :root .oty .oty-uc,
    :root .oty .oty-lab,
    :root .oty .oty-tile .k,
    :root .oty .sm-t small,
    :root .oty .sm-v,
    :root .oty .sm-m,
    :root .oty .sm-r,
    :root .oty .st-f em,
    :root .oty .st-b i,
    :root .oty .oty-rs .k,
    :root .oty th,
    :root .oty .oty-gl span,
    :root .oty .oty-delta small,
    :root .oty .oty-bar .vl,
    :root .oty .oty-bar.void .vl,
    :root .oty .oty-yl,
    :root .oty .oty-yl span,
    :root .oty .oty-yl span:not(.cur),
    :root .oty .oty-names span,
    :root .oty .oty-band,
    :root .oty .oty-months,
    :root .oty .oty-cov,
    :root .oty .oty-cov .l,
    :root .oty-stt .v small,
    :root .oty .mo-hm .h,
    :root .oty .mo-c.none,
    :root .oty .mo-c.part,
    :root .oty .mo-c .moon,
    :root .oty .mo-hm .spr,
    :root .oty .mo-hm .sl,
    :root .oty .mo-dt .k,
    :root .oty .mo-lane .ly,
    :root .oty .mo-lane .lm,
    :root .oty .mo-pr .m,
    :root .oty .oty-dp,
    :root .oty .vl,
    :root .oty .cur,
    :root .oty .ih-lbl,
    :root .oty table.oty-yt td::before{font-size:12px}
    :root .oty .oty-sp .oty-bars .oty-bar .vl,:root .oty .oty-sp .oty-bars .oty-bar:not(.cur) .vl,:root .oty .oty-sp .oty-yl span,:root .oty .oty-sp .oty-yl span:not(.cur),:root .oty .oty-yl span:not(.cur){font-size:12px}
    :root .oty svg text{font-size:12px}
  }
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
  const open = present.filter(b => !OTY_HIST.includes(b));
  const sets = { ALL: open };
  if (present.includes('SAA') && present.includes('KCA')) sets.LFL = ['SAA', 'KCA'];
  present.forEach(b => { sets[b] = [b]; });
  if (present.some(b => OTY_HIST.includes(b)) && open.length) sets.ALLF = present.slice();
  return { years, D, present, sets, cut: raw.cut, curYear: new Date(raw.cut + 'T00:00:00').getFullYear(), ig };
}
const otySetName = k => k === 'ALL' ? 'All four branches' : k === 'LFL' ? 'Saadiyat + Khalifa City A' : k === 'ALLF' ? 'All four + Fratelli + Marasy' : k === 'FRT' ? 'Fratelli (closed 22 May 2026)' : k === 'MRY' ? 'Marasy (Phorest data to 24 Dec 2022)' : OTY_NAME[k] || k;
const otyCutLabel = () => otyDay(otyD.cut);

async function otyLoad(force) {
  if (otyBusy) return;
  if (otyRaw && !force) { otyDraw(); return; }
  otyBusy = true; otyErr = '';
  const host = document.getElementById('overYearsContent');
  if (host && !otyRaw) host.innerHTML = '<div class="oty oty-load">Reading six years of takings. This takes a few seconds.</div>';
  // Audit 18 Oct 2026 (P2-11): the three reads do not depend on each other, so they go out together (they used to run one after
  // another, two avoidable round trips on a page that says it takes a few seconds). A failed one is handled exactly as before;
  // Instagram and the months are only kept when the main read worked, as they were.
  const ask = name => sb.rpc(name).then(r => r, e => ({ data: null, error: e }));
  const wantIg = !otyIgLoaded && typeof TRS_LEVEL !== 'undefined' && TRS_LEVEL >= 3;
  const wantMo = !otyMoLoaded || force;
  const [main, ig, mo] = await Promise.all([ask('over_the_years'), wantIg ? ask('over_the_years_ig') : null, wantMo ? ask('over_the_years_months') : null]);
  if (main.error) otyErr = (main.error && main.error.message) || 'Could not load.'; else otyRaw = main.data;
  if (otyRaw && wantIg && ig) {
    if (ig.error) otyIgErr = (ig.error && ig.error.message) || 'Could not load Instagram.'; else otyIgRaw = ig.data;
    otyIgLoaded = true;
  }
  // Kate, 13 Oct 2026: the month by month section reads its own small feed (oty_month_branch), loaded for every level.
  if (otyRaw && wantMo && mo) {
    if (mo.error) otyMoErr = (mo.error && mo.error.message) || 'Could not load month by month.'; else { otyMoRaw = mo.data; otyMoErr = ''; }
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
  const set = otyCodes(), same = otySame();
  return years.map((y, i) => {
    const w = same ? 'ytd' : 'full', partial = !same && !otyHist() && y === curYear;
    const net = otySum(set, 'net', w, i), stf = otySum(set, 'stf', w, i);
    const vis = y === 2021 && set.some(b => OTY_VIS_GAP_2021.includes(b)) ? 0 : otySum(set, 'vis', w, i);   // 2021 visits are part-year for SAA and KCA, see OTY_VIS_GAP_2021
    // Growth follows the toggle: whole year on whole year, except the year in progress, which can only be read on the same days.
    const gw = same || partial ? 'ytd' : 'full';
    const netY = otySum(set, 'net', gw, i), netP = i ? otySum(set, 'net', gw, i - 1) : 0;
    const g = otyHist() ? null : otyPct(netP, netY), big = g != null && Math.abs(g) > 100;   // Marasy: 2021 starts in July, so no growth
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
  const rows = otyRows();
  // Kate, 13 Oct 2026: the mini side nav, the same rail as Organisation Pulse and Branch Performance (lgRail in
  // branch-ledger.js, lit by spy() in index.html): in the gutter from 1100px, a pinned row of chips below that. The
  // header, the switches and the tiles stay full width above it; the rail starts at the chart. A rail entry points
  // at the section's id, and a section with nothing to show (the seasons, before the data arrives) has no entry.
  const parts = [['oty-net', 'Net take by year', otyChartBlock(rows)], ['oty-years', 'The years, side by side', otyTable(rows)],
    ['oty-seasons', 'Season on season', otySeasons()], ['oty-months', 'Month by month', otyMonths()], ['oty-reviews', 'Google reviews', otyReviews()], ['oty-ig', 'Instagram', otyInstagram()],
    ['oty-cov', 'What each year has behind it', otyCoverage()], ['oty-how', 'How to read this page', otyNotes()]].filter(x => x[2])
    // Kate, 14 Oct 2026: a section that returns a list of [id, label, html] is several sub-sections, each with its own id and rail entry
    .flatMap(x => Array.isArray(x[2]) ? x[2] : [x]);
  const body = parts.map(([id, , html]) => `<section id="${id}" class="oty-sec">${html}</section>`).join('');
  const shell = typeof lgRail === 'function'
    ? `<div class="lg-shell lg-shell-wide">${lgRail(parts.map(([id, label]) => [id, label]))}<div class="lg-doc">${body}</div></div>`
    : body;
  const prevTiles = host.querySelector('.oty-tiles'), tileX = prevTiles ? prevTiles.scrollLeft : 0;
  host.innerHTML = `<div class="oty">
    <div class="oty-eb"><i style="background:var(--accent)"></i>Numbers · Business · Over the years</div>
    <h1>${otyD.years.length} years, <em>season by season.</em></h1>
    <p class="why-oneline">How the business has grown. Judge this year against the same days last year, not last month.</p>
    <p class="oty-deck">Where the business has grown, which branch carried it, and how this year's seasons sit against the years before.</p>
    ${otyControls()}
    ${otyTiles(rows)}
    ${otyJumpMenu(parts)}
    ${shell}
  </div>`;
  otySeasonPlace();
  otyScrollHints();
  if (typeof paintFilterChips === 'function') paintFilterChips();
  const nowTiles = host.querySelector('.oty-tiles'); if (nowTiles && tileX) nowTiles.scrollLeft = tileX;
}
// A sideways-scrolling grid shows a fade on the edge that has more behind it (can-r, can-l on its wrapper), so it is clear it scrolls.
function otyScrollHints() {
  document.querySelectorAll('#overYearsContent .mo-sw').forEach(w => {
    const sc = w.querySelector('.mo-scroll'); if (!sc) return;
    w.classList.toggle('can-r', sc.scrollLeft + sc.clientWidth < sc.scrollWidth - 2);
    w.classList.toggle('can-l', sc.scrollLeft > 2);
  });
}
if (!window.__otyScrollBound) {
  window.__otyScrollBound = true;
  document.addEventListener('scroll', e => { if (e.target && e.target.classList && e.target.classList.contains('mo-scroll')) otyScrollHints(); }, true);
  addEventListener('resize', otyScrollHints);
}
// Kate, 16 Oct 2026: the years are ticked in the masthead's own filter (the universal sticky header; the Period row, which does not
// apply here, becomes a row of years). One selection, OTY.syrs, drives season on season, the monthly shapes and the year against
// year pairs, so there is one place to choose them. At least one year stays ticked.
function otySelYears() {
  const ys = (OTY.syrs || []).filter(y => otyD && otyD.years.includes(y)).sort((a, b) => a - b);
  return ys.length ? ys : (otyD ? otyD.years.slice(-5) : []);
}
function otyYearChips() {
  if (!otyD) return '';
  const on = new Set(otySelYears());
  return otyD.years.map(y => `<button type="button" class="chip oty-yr" aria-pressed="${on.has(y)}" data-yr="${y}">${on.has(y) ? '&#10003; ' : ''}${y}</button>`).join('<span class="sep">·</span>');
}
function otySelLabel() {
  const ys = otySelYears(); if (!ys.length) return 'Every year';
  return ys.length > 2 && ys.every((y, i) => !i || y === ys[i - 1] + 1) ? `${ys[0]} – ${ys[ys.length - 1]}` : ys.join(', ');
}
function otyToggleYear(y) {
  const s = new Set(otySelYears());
  if (s.has(y)) { if (s.size > 1) s.delete(y); } else s.add(y);
  OTY.syrs = [...s].sort((a, b) => a - b); otySave(); otyDraw();
}
function otyControls() {
  return `<div class="oty-lab">Compare on</div><div class="oty-pills">
      <button class="oty-pill" aria-pressed="${OTY.basis === 'same'}" onclick="otySet('basis','same')">Same days (1 Jan – ${otyCutLabel()})</button>
      <button class="oty-pill" aria-pressed="${OTY.basis === 'full'}" onclick="otySet('basis','full')">Full years</button></div>`;
}
// On a phone the rail's chips wrapped into five rows; this is the same list as one menu (the rail is hidden there).
function otyJumpMenu(parts) {
  return `<label class="oty-jumpm"><span>On this page</span><select aria-label="On this page" onchange="otyJump(this)"><option value="">Jump to a section</option>${parts.map(([id, label]) => `<option value="${id}">${otyEsc(label)}</option>`).join('')}</select></label>`;
}
function otyJump(sel) { if (sel.value && typeof lgJump === 'function') lgJump(null, sel.value); }
function otySet(k, v) { OTY[k] = v; otySave(); otyDraw(); }
function otyPick(i) { OTY.sel = i; otyDraw(); }
// Kate, 13 Oct 2026: the tiles ignored the Compare on switch (Full years still said "1 Jan – 12 Oct" and "same days").
// Full years now shows the last two whole years, each against the whole year before it, and says where this year stands.
function otyTiles(rows) {
  const { years, curYear: cy } = otyD, set = otyCodes(), c = otyCutLabel(), hist = otyHist(), same = otySame();
  // One tile per year the selection has figures for, newest first. rows already follow the basis (same days or full years,
  // the year in progress always on the same days) and carry the growth on the year before.
  const part = y => y === 2021 ? 'from 1 Jul' : y === 2022 ? 'to 24 Dec' : 'Phorest data';
  const label = r => hist ? part(r.y) : (r.partial || same) ? `1 Jan – ${c}` : 'full year';
  const vs = r => hist ? 'part year, so not set against the other' : r.y === years[0] ? '' : (r.partial || same) ? `on the same days of ${r.y - 1}` : `on the full year ${r.y - 1}`;
  const chg = r => r.big ? '<span class="oty-chg flat">new</span>' : otyChg(r.growth);
  const tiles = rows.filter(r => r.net > 0).slice().reverse().map(r => `<div class="oty-card oty-tile${OTY.sel === r.i ? ' sel' : ''}" role="button" tabindex="0" aria-pressed="${OTY.sel === r.i}" onclick="otyPick(${r.i})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();otyPick(${r.i})}">
      <div class="k">${r.y} · ${label(r)}</div><div class="v">${otyM(r.net)}</div><div class="s">${otySetLabel(set)}</div>${hist ? '' : chg(r)}<div class="s" style="margin-top:6px">${vs(r)}</div></div>`).join('');
  // A phone gets one row per year instead of the sideways tiles (Kate, 15 Oct 2026: no containers, no album scrolling); the
  // CSS shows one or the other. Same figures, same tap.
  const rowOf = r => `<div class="oty-row${OTY.sel === r.i ? ' sel' : ''}" role="button" tabindex="0" aria-pressed="${OTY.sel === r.i}" onclick="otyPick(${r.i})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();otyPick(${r.i})}"><span class="y"><b>${r.y}</b><small>${label(r)}</small></span><span class="v">${otyM(r.net)}</span><span class="g">${hist ? '' : (chg(r) || '<small>first year</small>')}</span></div>`;
  const rowsHtml = rows.filter(r => r.net > 0).slice().reverse().map(rowOf).join('');
  const list = `<div class="oty-rows" role="group" aria-label="Net take for each year"><p class="oty-rcap">${otySetLabel(set)}</p><div class="oty-rh"><span>Year</span><span>Net take</span><span>${hist ? '' : 'vs year before'}</span></div>${rowsHtml}</div>`;
  const tail = `${cy} is part-way, so it is always set against the same days of ${cy - 1}.`;
  const note = hist ? `Marasy's Phorest data runs 1 Jul 2021 to 24 Dec 2022. Both years are part-years, so there is no growth figure, and the real closing date is not confirmed.`
    : `<span class="oty-d">One tile for every year. Scroll sideways for the rest, and tap one to read it in the chart below. </span><span class="oty-m">Tap a year to read it in the chart below. </span>${tail}`;
  return `<div class="oty-tiles" tabindex="0" role="group" aria-label="Net take for each year, scroll sideways">${tiles}</div>${list}
    <p class="oty-note" style="margin:6px 2px 0">${note}</p>`;
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
  const { years } = otyD, set = otyCodes(), n = years.length;
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
      g += `<rect class="seg" x="${x0}" y="${y}" width="${bar}" height="${h}" fill="${set.length === 1 ? 'var(--hair)' : OTY_COL[p.b]}" opacity="${r.partial ? .5 : .92}" ${r.partial ? 'stroke="var(--text)" stroke-opacity=".6" stroke-dasharray="3 2"' : ''}${otyTT(p.b, r.y, otyM(p.v) + ' net take', r.net ? p.v / r.net * 100 : 0, `of the ${otyM(r.net)} ${r.y}${r.partial ? '*' : ''} total`, otySame() || r.partial ? `1 Jan – ${otyCutLabel()}` : otyHist() ? 'Phorest data held' : 'full year')}/>`;
    });
    g += `<text class="tv" x="${cx}" y="${yb(r.net) - 5}" text-anchor="middle" font-size="9.5">${r.net ? otyMs(r.net) : '·'}</text>`;
    g += `<text x="${cx}" y="${H - 10}" text-anchor="middle" font-size="10.5" style="${i === sel ? 'fill:var(--accent);font-weight:700' : ''}">${r.y}${r.partial ? '*' : ''}</text>`;
  });
  const pts = rows.map((r, i) => ({ i, v: vals[i] })).filter(p => p.v != null && (p.v !== 0 || LN === 'growth'));
  if (pts.length) g += `<path d="${pts.map((p, k) => (k ? 'L' : 'M') + (L + bw * p.i + bw / 2).toFixed(1) + ' ' + yl(p.v).toFixed(1)).join(' ')}" fill="none" stroke="var(--warn)" stroke-width="2.4" stroke-linejoin="round"/>`;
  pts.forEach(p => g += `<circle cx="${L + bw * p.i + bw / 2}" cy="${yl(p.v)}" r="${p.i === sel ? 5 : 3.5}" fill="${p.i === sel ? 'var(--bg)' : 'var(--warn)'}" stroke="var(--warn)" stroke-width="2"/>`);
  const lineName = { growth: otyHist() ? 'Growth vs the year before (part years)' : OTY.basis === 'full' ? `Growth vs the year before (full years, ${otyD.curYear} on the same days)` : 'Growth vs the year before (same days)', avg: 'Average bill per staff (AED)', avgV: 'Average bill per visit (AED)',
    stf: 'Clients per staff', vis: 'Clients per visit' }[LN];
  // Kate, 13 Oct 2026: the points are hoverable (and tappable) too: a bigger invisible circle on each one says what it is.
  const fv = v => LN === 'growth' ? (v > 0 ? '+' : '') + v.toFixed(1) + '%' : isAvg ? otyAed(v) : otyNum(v);
  pts.forEach(p => g += `<circle class="hit" cx="${L + bw * p.i + bw / 2}" cy="${yl(p.v)}" r="11" fill="transparent"${otyTTh(`<div class="h"><b>${rows[p.i].y}${rows[p.i].partial ? '*' : ''}</b></div><div class="v">${fv(p.v)}</div><div class="s">${lineName}</div><div class="s">Net take <b>${otyM(rows[p.i].net)}</b></div>`)}/>`);
  const legend = (set.length > 1 ? set.map(b => `<span><i style="background:${OTY_COL[b]}"></i>${OTY_NAME[b]}</span>`).join('') : `<span><i style="background:var(--hair)"></i>${OTY_NAME[set[0]]}</span>`)
    + `<span><i class="ln" style="background:var(--warn)"></i>${lineName}</span>`;
  const r = rows[sel], lab = otySame() || r.partial ? `1 Jan – ${otyCutLabel()}` : otyHist() ? (r.y === 2021 ? 'from 1 Jul 2021' : r.y === 2022 ? 'to 24 Dec 2022' : 'no Phorest data') : 'full year';
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
    <p class="oty-note" style="margin:10px 2px 0">${otyHist() ? 'Marasy has Phorest data from 1 Jul 2021 to 24 Dec 2022 only, so both bars are part-years. ' : OTY.basis === 'full' ? `* ${otyD.curYear} is 1 Jan to ${otyCutLabel()} only, shown faded. ` : `Every bar is 1 Jan to ${otyCutLabel()} of that year. `}The line reads on the right-hand scale. Growth over 100% is a year new branches opened in, so it is left off the line. Tap a year.</p>`;
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
// Kate, 27 Oct 2026: a year's figures open the branches (and, for net take, the months) they are made of (drill.js). This page holds only the cached
// totals per year and branch, so those are the lists: the branches add up to the year by construction. Net take by month comes from the month feed,
// which is a separate cache, and says so in bold if its months do not add to the year. Years before the sales lines have no day or client rows to go deeper.
function otySpec(kind, r) {
  const { D } = otyD, set = otyCodes(), same = otySame(), w = same ? 'ytd' : 'full', i = r.i, c = otyCutLabel();
  const when = (same || r.partial) ? `${r.y}, 1 Jan to ${c}` : `${r.y}, full year`, who = otySetLabel(set);
  const T = { net: 'Net take', vis: 'Clients per visit', stf: 'Clients per staff', avgV: 'Avg bill per visit', avg: 'Avg bill per staff' }[kind];
  const per = set.map(b => ({ b: OTY_NAME[b] || b, net: +D[b].net[w][i] || 0, vis: +D[b].vis[w][i] || 0, stf: +D[b].stf[w][i] || 0 })).filter(x => x.net || x.vis || x.stf);
  const wantOf = { net: r.net, vis: r.vis, stf: r.stf };
  const views = [{ id: 'br', label: 'By branch', load: async () => {
    if (kind === 'avgV' || kind === 'avg') {
      const den = kind === 'avgV' ? 'vis' : 'stf', rows = per.filter(x => x.net && x[den]).map(x => ({ b: x.b, net: x.net, d: x[den], a: x.net / x[den] }));
      const net = rows.reduce((a, x) => a + x.net, 0), d = rows.reduce((a, x) => a + x.d, 0);
      return { cols: [{ k: 'b', l: 'Branch' }, { k: 'net', l: 'Net take', t: 'aed' }, { k: 'd', l: kind === 'avgV' ? 'Clients per visit' : 'Clients per staff', t: 'num' }, { k: 'a', l: 'Avg bill', t: 'aed' }], rows,
        foot: { b: 'Total', net, d, a: d ? net / d : null }, sub: `${TRSD.esc(who)}, ${TRSD.esc(when)}. Net take over ${kind === 'avgV' ? 'clients through the door (each client once a day)' : 'clients counted per staff (a client seen by two staff counts twice)'}.` };
    }
    const rows = per.filter(x => x[kind]).map(x => ({ b: x.b, v: x[kind] })).sort((a, b) => b.v - a.v), sum = rows.reduce((a, x) => a + x.v, 0), want = wantOf[kind];
    if (Math.abs(sum - want) >= 0.5) rows.push({ b: 'Not matched to a branch', v: want - sum, _cls: 'dr-muted' });
    return { cols: [{ k: 'b', l: 'Branch' }, { k: 'v', l: T, t: kind === 'net' ? 'aed' : 'num' }], rows, foot: { b: 'Total', v: want },
      sub: `${TRSD.esc(who)}, ${TRSD.esc(when)}. ${kind === 'net' ? 'Everything the salon billed, ex VAT.' : kind === 'vis' ? 'Each client once a day, through the door.' : 'Counted once for each staff member who served her.'} Held as a total per year and branch, so this is as far down as it goes.` };
  } }];
  if (kind === 'net' && !same && !r.partial && otyMoRaw) views.push({ id: 'mo', label: 'By month', load: async () => {
    const M = otyMoModel(), MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const rows = MON.map((m, k) => ({ m: m + ' ' + r.y, v: set.reduce((a, b) => { const x = M.MO[b] && M.MO[b][r.y] && M.MO[b][r.y][k]; return a + (x && +x.net > 0 ? +x.net : 0); }, 0) })).filter(x => x.v);
    const sum = rows.reduce((a, x) => a + x.v, 0), off = Math.abs(sum - r.net) >= 1;
    return { cols: [{ k: 'm', l: 'Month' }, { k: 'v', l: 'Net take', t: 'aed' }], rows, foot: { m: 'Total of the months', v: sum },
      sub: `${TRSD.esc(who)}, ${r.y}. The month by month feed.${off ? ` <b>These months add to ${Math.round(sum).toLocaleString('en-GB')}, the year shows ${Math.round(r.net).toLocaleString('en-GB')}: the two are cached separately and do not agree to the dirham.</b>` : ''}` };
  } });
  return { title: `${T} · ${r.y}`, cur: 'AED', views };
}
const otyDn = (html, kind, r) => (typeof TRSD !== 'undefined' && otyD && !(typeof TRS_LEVEL !== 'undefined' && TRS_LEVEL === 2)) ? TRSD.num(html, otySpec(kind, r)) : html;
function otyTable(rows) {
  let h = '<tr class="oty-th"><th>Year</th><th>Net take</th><th>Clients per visit</th><th>Clients per staff</th><th>Avg bill per visit</th><th>Avg bill per staff</th><th>Growth</th></tr>';
  rows.slice().reverse().forEach(r => {
    h += `<tr><td class="yr">${r.y}${r.partial ? '*' : ''}</td><td class="nt" data-l="Net take">${otyDn(otyM(r.net), 'net', r)}</td><td class="m" data-l="Clients per visit">${r.vis ? otyDn(otyNum(r.vis), 'vis', r) : '·'}</td><td class="m" data-l="Clients per staff">${r.stf ? otyDn(otyNum(r.stf), 'stf', r) : otyNum(r.stf)}</td><td class="m" data-l="Avg bill per visit">${r.avgV ? otyDn(Math.round(r.avgV), 'avgV', r) : '·'}</td><td class="m" data-l="Avg bill per staff">${r.avg ? otyDn(Math.round(r.avg), 'avg', r) : '·'}</td><td data-l="Growth" class="${r.growth == null ? 'm' : r.growth > 0 ? 'oty-up' : 'oty-dn'}">${r.growth == null ? (r.big ? 'new' : '·') : (r.growth > 0 ? '+' : '') + r.growth.toFixed(1) + '%'}</td></tr>`;
  });
  return `<div class="oty-eb"><i style="background:var(--warn)"></i>${otyWhy('The years, side by side')}</div>
    <div class="oty-card"><table class="oty-yt">${h}</table></div>`;
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
// Kate, 14 Oct 2026: Marasy in season on season. Abu Dhabi stays Saadiyat + Khalifa City A (the like-for-like line). "Abu Dhabi + Marasy" (the Saadiyat, Khalifa City A and Marasy chips ticked together) adds Marasy for the seasons it traded (2021 and 2022) and nothing from 2023, so a bar that loses a branch is marked, not
// read as a fall; Marasy's share is the sky-blue segment on the bar. The Marasy chip alone shows its two years. In any mix
// that includes Marasy it is the optional branch, so it never makes a season "1 of 3 open".
const OTY_REGION = { AD: ['SAA', 'KCA'], ADM: ['SAA', 'KCA', 'MRY'], DXB: ['MC', 'AQ'] };
const OTY_REGION_NAME = { AD: 'Abu Dhabi', ADM: 'Abu Dhabi + Marasy', DXB: 'Dubai' };
const OTY_REGION_OPT = { ADM: ['MRY'] };
// Kate, 14 Oct 2026: the Season on season and Month by month sections no longer have their own Where pills. They follow the
// Branch chips at the top of the page: UAE Branches = the four open salons together (Abu Dhabi and Dubai side by side on the
// season chart), one chip = that salon, a pair that is exactly Abu Dhabi or Dubai = that region, any other mix = those added
// together. They cover the four open salons; Marasy joins them only when it is ticked (alone, or with Saadiyat + Khalifa City A for
// Abu Dhabi + Marasy, or as the optional extra in any other mix), and Fratelli on its own says so instead.
function otyOpenCodes(have) {
  const all = typeof sel === 'undefined' || !sel.branch || sel.branch.includes('all');
  const pick = all ? have.slice() : OTY_BR.filter(b => sel.branch.includes(b) && have.includes(b));
  return { all, codes: pick.filter(b => b !== 'FRT' && (!all || !OTY_HIST.includes(b))) };   // ticked Marasy stays in; UAE Branches means the four open salons
}
function otyRegionKey(M, codes, all, allKey) {
  if (!codes.length) return null;
  if (all) return allKey;
  const same = (a, b) => a.length === b.length && a.every(x => b.includes(x));
  for (const k of Object.keys(OTY_REGION)) if (M.regions[k] && same(codes, M.regions[k])) return k;
  if (codes.length === 1 && M.regions[codes[0]]) return codes[0];
  const key = 'SEL:' + codes.join('+');
  M.regions[key] = codes.slice(); OTY_REGION_NAME[key] = codes.map(b => OTY_NAME[b]).join(' + ');
  OTY_REGION_OPT[key] = codes.includes('MRY') && codes.length > 1 ? ['MRY'] : [];   // Marasy is the optional branch in any mix
  return key;
}
const otyOpenOnly = title => `<div class="oty-eb"><i style="background:var(--hair)"></i>${title}</div><div class="oty-card oty-flag oty-note">This section covers the four open salons and Marasy. Pick one of them, or UAE Branches, at the top of the page.</div>`;
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
  const vis = (b, k) => present.includes(b) && (!OTY_HIST.includes(b) || (OTY_REGION_OPT[k] || []).includes(b));
  const regions = {};   // only the branches this login can see
  for (const k of Object.keys(OTY_REGION)) { const bs = OTY_REGION[k].filter(b => vis(b, k)); if (bs.length && (k !== 'ADM' || (bs.includes('MRY') && bs.length > 1))) regions[k] = bs; }
  OTY_BR.filter(b => vis(b)).forEach(b => { regions[b] = [b]; });
  if (present.includes('MRY')) regions.MRY = ['MRY'];
  const dates = (nm, y) => cal.find(r => r.season === nm && r.y === y);
  const row = (b, nm, y) => br.find(r => r.b === b && r.season === nm && r.y === y && +r.tot > 0);
  // one season in one year for a set of branches: a bar, or why there is none
  const cell = (bs, nm, y, win, opt = []) => {
    const d = dates(nm, y); if (!d) return null;
    const need = bs.filter(b => !opt.includes(b)), main = need.map(b => row(b, nm, y)).filter(Boolean), mry = opt.includes('MRY') ? row('MRY', nm, y) : null;
    const out = { y, start_date: d.start_date, end_date: d.end_date, open: main.length, of: need.length, per: null, tot: null, days: 0 };
    if (!main.length) return out;
    const days = Math.max(...main.map(r => +r.days)), tot = main.reduce((t, r) => t + +r.tot, 0);
    if (main.length === need.length) {
      out.per = tot / days; out.tot = tot; out.days = days;
      if (mry) { out.mryPer = +mry.tot / +mry.days; out.mryDays = +mry.days; out.per += out.mryPer; out.tot += +mry.tot; }   // Marasy added per its own open days
    } else { out.partPer = tot / days; }
    if (win) {   // the same days as the running season, in this year
      const w = need.map(b => row(b, nm, y)).filter(r => r && +r.days_w > 0);
      if (w.length === need.length) out.perW = w.reduce((t, r) => t + +r.tot_w, 0) / Math.max(...w.map(r => +r.days_w));
    }
    return out;
  };
  const state = c => c.start_date > cut ? 'ahead' : c.end_date > cut ? 'live' : 'done';
  const build = key => {
    const bs = regions[key], opt = OTY_REGION_OPT[key] || [], hist = key === 'MRY';
    return names.map(nm => {
      let cells = years.map(y => cell(bs, nm, y, true, opt)).filter(Boolean);
      if (hist) cells = cells.filter(c => c.per != null);   // Marasy: only the years it traded; its last year stands in for "this year"
      const cur = hist ? cells[cells.length - 1] : cells.find(c => c.y === curYear), prev = cells.find(c => c.y === (cur ? cur.y : curYear) - 1);
      const s = hist ? 'done' : cur ? state(cur) : 'ahead';
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
  const w = otyOpenCodes(otyD.present);
  const skey = otyRegionKey(M, w.codes, w.all, (M.regions.AD && M.regions.DXB) ? 'BOTH' : keys[0]);
  if (!skey) return otyOpenOnly('Season on season · per open day');
  OTY.sreg = skey;
  const ys = otySelYears(), shown = new Set(ys);
  const hint = OTY.sreg === 'MRY' ? 'Marasy traded 2021 and 2022 only, so those are the years shown; the year ticks do not apply to it.' : `Showing ${otySelLabel()}. Tick the years at the top of the page.`;
  const charts = OTY.sreg === 'BOTH' ? otySeasonChart('AD', M, shown, 165) + otySeasonChart('DXB', M, shown, 165) : otySeasonChart(OTY.sreg, M, shown, 210);
  const dxb = OTY.sreg === 'DXB' || OTY.sreg === 'BOTH';
  const running = M.build(OTY.sreg === 'BOTH' ? 'AD' : OTY.sreg).find(s => s.state === 'live');
  const notes = (running ? `<p><b>${otyEsc(running.nm)} is still running</b> (${running.cur.days} of ${otySLen(running.cur)} days), so its ${curYear} bar is striped. The pill compares those ${running.cur.days} days with the same days of ${curYear - 1}, not with all of last year's season, so it is a fair read and can still move before the season closes.</p>` : '')
    + (dxb ? `<p><b>Dubai starts later.</b> Al Quoz opened in Sep 2023, so Autumn 2023 is the first season with both Dubai branches. A season where only some branches traded is marked "1 of 2 open" and left out of the bars, because one branch against two is not like for like.</p>` : '')
    + ((OTY_REGION_OPT[OTY.sreg] || []).length ? `<p><b>Marasy is in this view</b> (Marasy ticked with other branches at the top of the page): it is added to the bars for 2021 and 2022 (the sky-blue part of the bar is Marasy's share, per its own open days). Its Phorest data stops on 24 Dec 2022, so from 2023 the bars are the other branches only: a step down at 2023 is Marasy leaving, not trade falling. The pill above each season compares this year with last year, where Marasy is not in either.</p>` : '')
    + (OTY.sreg === 'MRY' ? `<p><b>Marasy</b> has Phorest data from 1 Jul 2021 to 24 Dec 2022. Summer 2021 is only July and August, so its bar is a part-season (the tip says how many days are held). The pill sets 2022 against 2021.</p>` : '')
    + `<p>Per open day, because the seasons run different lengths. The season list is one table (oty_seasons); the four here are a placeholder until Emma sets the real ones.</p>`;
  return `<div class="oty-eb"><i style="background:var(--hair)"></i>Season on season · per open day</div>
    <p class="oty-deck" style="font-size:clamp(14px,3.4vw,16px)">How each season is doing against the same season last year. Mint is this year, lavender last year.</p>
    ${otySeasonCal(M)}
    <div class="oty-card" style="margin-top:12px">
      <div class="oty-hint" style="margin:0">Follows the Branch filter and the year ticks at the top of the page. ${hint}</div>
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
  const { years, curYear, cut } = otyD, seasons = M.build(key), hist = key === 'MRY';
  const yrs = hist ? years.filter(y => seasons.some(s => s.cells.some(c => c.y === y))) : years.filter(y => shown.has(y)), topY = hist ? yrs[yrs.length - 1] : curYear;
  const bs = M.regions[key], title = OTY_REGION_NAME[key] || OTY_NAME[key];
  const vals = seasons.flatMap(s => s.cells.filter(c => (hist || shown.has(c.y)) && c.per != null).map(c => c.per));
  const raw = Math.max(...vals, 1) * 1.1, step = [1000, 2000, 2500, 5000, 10000, 20000, 50000].find(s => raw / s <= 5) || 50000;
  const MAXV = Math.max(step * 2, Math.ceil(raw / step) * step);
  const grid = Array.from({ length: MAXV / step + 1 }, (_, i) => i * step).map(v => `<div class="oty-gl" style="bottom:${v / MAXV * H}px"><span>${v ? (v / 1000) + 'k' : '0'}</span></div>`).join('');
  const ph = [];
  const mkBars = (s, Hh) => s.cells.filter(c => hist || shown.has(c.y)).map(c => {
    const none = c.per == null, isCur = c.y === topY, live = isCur && s.state === 'live';
    const lab = none ? (c.open ? `${c.open} of ${c.of} open` : (c.start_date <= cut ? 'no data' : '')) : otyK(c.per);
    return `<div class="oty-bar ${isCur ? 'cur' : ''} ${none ? 'void' : ''} ${live ? 'part' : ''}" tabindex="0" data-k="${key}" data-s="${otyEsc(s.nm)}" data-y="${c.y}"><span class="vl">${lab}</span><div class="b" style="height:${none ? 3 : Math.max(4, c.per / MAXV * Hh)}px;background:${otyAge(c.y)}">${c.mryPer && !none ? `<i class="mseg" style="height:${(c.mryPer / c.per * 100).toFixed(1)}%"></i>` : ''}</div></div>`;
  }).join('');
  const groups = seasons.map(s => {
    const pill = s.chg == null ? `<span class="oty-dp flat">${s.state === 'ahead' ? 'not started' : 'n/a'}</span>`
      : `<span class="oty-dp ${Math.abs(s.chg) < .5 ? 'flat' : s.chg > 0 ? 'up' : 'dn'}">${s.chg > 0 ? '+' : ''}${s.chg.toFixed(1)}%</span>`;
    const cy = hist && s.cur ? s.cur.y : curYear;
    const small = s.state === 'live' ? `${curYear} so far, vs same days of ${curYear - 1}` : s.state === 'ahead' ? 'opens ' + otyDay(s.cur.start_date) : `${cy} vs ${cy - 1}`;
    const bars = mkBars(s, H);
    ph.push({ pill, small, bars: mkBars(s, 120) });
    return `<div class="oty-grp"><div class="oty-delta">${pill}<small>${small}</small></div><div class="oty-bars" style="--H:${H}px">${bars}</div></div>`;
  }).join('');
  const yrRow = M.names.map(() => `<div><div class="oty-yl">${yrs.map(y => `<span class="${y === topY ? 'cur' : ''}">${yrs.length > 6 ? String(y).slice(2) : y}</span>`).join('')}</div></div>`).join('');
  // a season whose dates change year to year (Ramadan and Eid) says so; the exact dates are on each bar
  const moves = nm => { const rs = (otyRaw.seasons || []).filter(r => r.season === nm); return rs.some(r => r.start_date.slice(5) !== rs[0].start_date.slice(5) || r.end_date.slice(5) !== rs[0].end_date.slice(5)); };
  const names = M.names.map((nm, i) => { const s = seasons[i], r = s.cur;
    return `<div><b><i style="background:${OTY_SEASON_COL[i % 4]}"></i>${otyEsc(nm)}</b><span class="${s.state === 'live' ? 'live' : ''}">${r ? `${otyDay(r.start_date)} to ${otyDay(r.end_date)}${s.state === 'live' ? ' · running' : moves(nm) ? ' · moves each year' : ''}` : ''}</span></div>`; }).join('');
  // Kate, 16 Oct 2026: four seasons side by side left about 65px for six bars, so the year labels ran together. On a phone each season
  // is its own chart across the card (the same scale, so they still compare), with a value on every bar; the side-by-side plot is
  // for wider screens.
  const phone = seasons.map((s, i) => { const r = s.cur, nm = M.names[i], p = ph[i];
    const when = r ? `${otyDay(r.start_date)} to ${otyDay(r.end_date)}${s.state === 'live' ? ' · running' : moves(nm) ? ' · moves each year' : ''}` : '';
    return `<div class="oty-spb"><div class="oty-sph"><b><i style="background:${OTY_SEASON_COL[i % 4]}"></i>${otyEsc(nm)}</b>${p.pill}</div><div class="oty-spm">${when ? when + ' · ' : ''}${p.small}</div><div class="oty-bars" style="--H:120px">${p.bars}</div><div class="oty-yl">${yrs.map(y => `<span class="${y === topY ? 'cur' : ''}">${y}</span>`).join('')}</div></div>`; }).join('');
  const n = M.names.length;
  return `<div class="oty-card" style="margin-top:12px"><div class="oty-chead"><b>${otyEsc(title)}</b><span>${bs.map(b => OTY_NAME[b]).join(' + ')} · per open day</span></div>
    <div class="oty-plot" data-plot><div class="oty-grid">${grid}</div><div class="oty-groups" style="grid-template-columns:repeat(${n},minmax(0,1fr))">${groups}</div>
    <div class="oty-grpyrs" style="grid-template-columns:repeat(${n},minmax(0,1fr))">${yrRow}</div>
    <div class="oty-names" style="grid-template-columns:repeat(${n},minmax(0,1fr))">${names}</div></div><div class="oty-sp">${phone}</div></div>`;
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
    const swap = (OTY_REGION_OPT[key] || []).length > 0 && pr && pr.per && !!c.mryPer !== !!pr.mryPer;   // Marasy is in one of the two years and not the other
    const chgTxt = (v, lab) => `<div>${lab}: <b class="${v >= 0 ? 'oty-up' : 'oty-dn'}">${v > 0 ? '+' : ''}${v.toFixed(1)}%</b></div>`;
    const held = st === 'done' && c.days < L - 2;   // a part-season: the data starts or ends inside it (Marasy's Summer 2021)
    body = `<div class="v">${otyAed(c.per)} <small>per open day</small></div><div>${dates}</div>
      <div>${st === 'live' ? `${c.days} of ${L} days so far` : held ? `${c.days} of ${L} days held` : `${L} days`} · season total <b>${(c.tot / 1e6).toFixed(2)}M</b>${st === 'live' ? ' so far' : ''}</div>
      ${c.mryPer ? `<div><i class="oty-mdot"></i>Marasy is <b>${otyAed(c.mryPer)}</b> of that per open day (${c.mryDays} open days)</div>` : ''}
      ${swap ? `<div style="margin-top:4px">Not like for like with ${y - 1}: Marasy is ${c.mryPer ? 'in this year and not in ' + (y - 1) : 'out from ' + y + ' (its data ends 24 Dec 2022)'}.</div>`
        : st === 'live' && y === curYear && cells.chg != null ? chgTxt(cells.chg, `vs the same ${c.days} days of ${y - 1}`) : dd == null ? '' : chgTxt(dd, `vs ${y - 1}`)}`;
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
//    why not. Phorest only holds launch days for Saadiyat, Khalifa City A and Marasy before Jul 2021 (they traded, the data starts
//    then). 18 Oct 2026: Clients per staff for Jan to Jun 2021 comes from the weekly ledgers, scaled to Phorest's count (oty_month_branch
//    src = 'ledger', see migrations/oty_month_ledger_2021.sql); Net take and Average bill stay empty for those months.
//  - A finished month with under 10 open days has too little data to count, so a Phorest start-up stub cannot skew a year's average.
//  - Change view: a month against the same month a year earlier, per open day, so a month in progress reads against
//    the same number of open days. A dashed edge means Ramadan and Eid fell differently than the year before.
//  - Ramadan and Eid come from oty_seasons (the season named Ramadan), so when Emma resets the season list the marks
//    follow. A month with 10+ days of it gets a crescent.
let otyMoRaw = null, otyMoErr = '', otyMoLoaded = false, otyMoM = null, otyMoMemo = {};
// Kate, 14 Oct 2026: Marasy in Month by month, same middle ground as season on season. "Abu Dhabi" stays Saadiyat + Khalifa City A.
// "Abu Dhabi + Marasy" adds it for the months it traded (Jul 2021 to Dec 2022); in 2023 and after it is Saadiyat + Khalifa City A,
// and a month where Marasy is in one year and not the other is marked, not read as a fall. "Marasy" alone shows its own two years.
const OTY_MO_REG = { AD: ['SAA', 'KCA'], ADM: ['SAA', 'KCA', 'MRY'], DXB: ['MC', 'AQ'] };
const OTY_MO_PAL = ['#99F6E4', '#C4B5FD', '#FFD4D9', '#EEF3C7', '#FF9B9B', '#9aa3c7'];
const otyMoCol = y => OTY_MO_PAL[(otyD.curYear - y) % OTY_MO_PAL.length];
const otyMoName = k => k === 'AD' ? 'Abu Dhabi' : k === 'ADM' ? 'Abu Dhabi + Marasy' : k === 'DXB' ? 'Dubai' : k === 'ALL' ? 'All four' : OTY_NAME[k];
const otyMoMetName = { net: 'Net take', clients: 'Clients per staff', bill: 'Average bill per staff' };
// the stat behind the index numbers, in words (the index is X.pd: per open day, except the average bill)
const otyMoStatLine = X => X.met === 'bill' ? 'Average bill per staff' : `${otyMoMetName[X.met]} per open day`;
const otyMoDim = (y, m) => new Date(y, m + 1, 0).getDate();
const otyMoSign = n => n > 0 ? '+' : n < 0 ? '−' : '';

function otyMoModel() {
  if (otyMoM && otyMoM.raw === otyMoRaw) return otyMoM;
  const MO = {};
  (otyMoRaw.months || []).forEach(r => { const by = MO[r.b] || (MO[r.b] = {}), ym = by[r.y] || (by[r.y] = []); ym[r.m - 1] = r; });
  const have = Object.keys(MO), regions = {};
  for (const k of Object.keys(OTY_MO_REG)) { const bs = OTY_MO_REG[k].filter(b => have.includes(b)); if (bs.length > 1 && (k !== 'ADM' || bs.includes('MRY'))) regions[k] = bs; }
  const open = OTY_BR.filter(b => !OTY_HIST.includes(b) && have.includes(b));
  if (open.length > 1) regions.ALL = open;
  open.forEach(b => { regions[b] = [b]; });
  if (have.includes('MRY')) regions.MRY = ['MRY'];
  otyMoMemo = {};
  return (otyMoM = { raw: otyMoRaw, MO, regions, cut: new Date(otyD.cut + 'T00:00:00') });
}
const otyMoState = (M, y, m) => new Date(y, m, 1) > M.cut ? 'ahead' : new Date(y, m, otyMoDim(y, m)) > M.cut ? 'live' : 'done';
const rs0 = rows => rows.map(x => x[1]);
// one month in one year for a region: a figure, or why there is none (no takings held, or only some branches traded)
function otyMoCell(M, reg, y, m) {
  const state = otyMoState(M, y, m); if (state === 'ahead') return { state, y, m };
  const bs = M.regions[reg], opt = OTY_REGION_OPT[reg] || [], need = bs.filter(b => !opt.includes(b));
  const rows = bs.map(b => [b, M.MO[b] && M.MO[b][y] && M.MO[b][y][m]]).filter(([, r]) => r && (+r.net > 0 || (r.src === 'ledger' && +r.stf > 0)) && (state === 'live' || +r.days >= 10));   // a ledger month (2021 Jan to Jun) has clients but no takings
  const rs = rows.map(x => x[1]), got = rows.filter(([b]) => need.includes(b)).length;
  const c = { state, y, m, open: got, of: need.length, dim: otyMoDim(y, m), mry: rows.some(([b]) => opt.includes(b)), est: rs0(rows).some(r => r.src === 'ledger'), k: rs0(rows).filter(r => r.src === 'ledger').map(r => +r.k) };   // mry: Marasy is in this month's figure
  if (!rs.length) return c;
  c.days = Math.max(...rs.map(r => +r.days));
  if (reg === 'ALL' || got === need.length) {
    if (rs.every(r => +r.net > 0)) c.tot = rs.reduce((t, r) => t + +r.net, 0);   // no takings for a ledger month: Net take and Average bill stay empty
    if (rs.every(r => +r.stf > 0)) { c.stf = rs.reduce((t, r) => t + +r.stf, 0); if (c.tot != null) c.avg = c.tot / c.stf; }
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
  const w = otyOpenCodes(Object.keys(M.MO)), mk = otyRegionKey(M, w.codes, w.all, M.regions.ALL ? 'ALL' : keys[0]);
  OTY.mreg = mk || (M.regions.AD ? 'AD' : keys[0]);
  const all = otyD.years, reg = OTY.mreg, met = OTY.mmet;
  const years = reg === 'MRY' ? all.filter(y => M.MO.MRY && M.MO.MRY[y]) : all, curYear = reg === 'MRY' ? years[years.length - 1] : otyD.curYear;   // Marasy alone: its own years, its last year standing in for "this year"
  const X = { M, reg, met, years, curYear, keys };
  X.cell = (y, m) => { const row = otyMoCells(M, reg)[all.indexOf(y)]; return row ? row[m] : null; };
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
    if (y === 2021 && met !== 'clients' && miss.includes(0)) return `Phorest takings for 2021 start in July, and the ledger has clients but no takings, so ${met === 'net' ? 'Net take' : 'Average bill'} has no shape for 2021. Switch Measure to Clients to see Jan to Jun from the ledger.`;
    if (held[0] > 0 && miss.includes(0)) return `Takings are held from ${OTY_MON[held[0]]} ${y}${reg !== 'ALL' && M.regions[reg].length > 1 ? ' with every branch open' : ''}, so ${y} has no full ${X.baseLabel(OTY.mbase)} to set against its own average. It shows in the Change and Actual views.`;
    return `${y} cannot be set against its own average here: no figures for ${miss.map(m => OTY_MON[m]).slice(0, 3).join(', ')}${miss.length > 3 ? ' and more' : ''}.`;
  };
  X.cmp = (y, m, py) => {
    py = py || y - 1;
    const c = X.cell(y, m), p = py >= years[0] ? X.cell(py, m) : null;
    if (!X.ok(c)) return null; if (!X.ok(p)) return { none: true };
    const cur = X.val(c), prevW = met === 'bill' ? X.val(p) : X.val(p) / p.days * c.days, pct = (cur / prevW - 1) * 100;
    return { cur, prevW, pct, diff: cur - prevW, big: Math.abs(pct) > 100, brk: (OTY_REGION_OPT[reg] || []).length > 0 && !!c.mry !== !!p.mry };   // brk: Marasy is in one of the two months and not the other
  };
  // Kate, 14 Oct 2026: a Total at the end of each year's row (Actual and Change views). A year's total is the sum of its
  // finished months and only shows when every one of them has a figure, so a year with months left out says so ('·')
  // instead of printing a short total. The current year is Jan to the last finished month, set against the same months
  // of the year before in the Change view, so it is like for like.
  X.mths = y => [...Array(12).keys()].filter(m => otyMoState(M, y, m) === 'done');
  X.sumOf = (y, B) => { const cs = B.map(m => X.cell(y, m)), t = cs.reduce((a, c) => a + (c.tot || 0), 0), s = cs.reduce((a, c) => a + (c.stf || 0), 0); return met === 'net' ? t : met === 'clients' ? s : t / s; };
  X.tot = y => { const B = X.mths(y); return B.length && B.every(m => X.ok(X.cell(y, m))) ? X.sumOf(y, B) : null; };
  X.totChg = y => {
    if (y <= years[0] || X.tot(y) == null) return null;
    const B = X.mths(y), ks = B.map(m => X.cmp(y, m));
    if (!ks.every(k => k && !k.none) || ks.some(k => k.brk)) return null;
    const cur = met === 'bill' ? X.sumOf(y, B) : ks.reduce((a, k) => a + k.cur, 0), prevW = met === 'bill' ? X.sumOf(y - 1, B) : ks.reduce((a, k) => a + k.prevW, 0), pct = (cur / prevW - 1) * 100;
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
  if (!otyOpenCodes(Object.keys(otyMoModel().MO)).codes.length) return otyOpenOnly('Month by month · the shape of each year');
  const X = otyMoCtx(); if (!X.keys.length) return '';
  const S = X.stats(), years = X.years, curYear = X.curYear, v = OTY.mview;
  const pill = (key, k, l) => `<button class="oty-pill" aria-pressed="${OTY[key] === k}" onclick="otyMoSet('${key}','${k}')">${l}</button>`;
  // Kate, 16 Oct 2026: Measure and Index set against are toggles, one row, like the Team toggle on Daily Performance. On a phone the
  // labels shorten (Clients, Avg bill, Jan to Sep) so every option stays on the row; the long wording is in the hint below.
  const tog = (key, k, long, short) => `<button class="oty-sg" aria-pressed="${OTY[key] === k}" onclick="otyMoSet('${key}','${k}')"><span class="l">${long}</span><span class="s">${short}</span></button>`;
  const bases = [['same', `${X.baseLabel('same')}, same months every year`], ['full', 'Full year']];
  const baseHint = OTY.mbase === 'same' ? `Every year is set against its own average of ${X.baseLabel('same')}, the months ${curYear} has finished, so all the years are on the same base. A year without all of those months says so instead.`
    : `Finished years are set against all twelve months, ${curYear} against the ${X.doneN} it has, so ${curYear} is not strictly like for like in this view.`;
  const mname = otyMoMetName[X.met];
  const sub = `${X.M.regions[X.reg].map(b => OTY_NAME[b]).join(' + ')} · ${v === 'index' ? '100 = an average month of that year' : 'tap a month or a total for the detail'}`;
  const title = v === 'index' ? `${mname}, month by month · shape of each year` : v === 'chg' ? `${mname}, each month against the same month a year earlier` : `${mname}, each month`;

  // the grid
  const sel = OTY.mmsel && years.includes(OTY.mmsel.y) ? OTY.mmsel : (OTY.mmsel = { y: curYear, m: Math.max(X.doneN - 1, 0) });
  let g = '<div class="h"></div>' + OTY_MON.map(m => `<div class="h">${m}</div>`).join('') + (v === 'index' ? '<div class="h">Peak</div><div class="h">Low</div>' : '<div class="h" style="grid-column:span 2">Total</div>');
  // the year's total, in the two columns Peak and Low use in the Shape view
  const totCell = y => {
    const lab = y === curYear ? `Jan to ${OTY_MON[Math.max(X.doneN - 1, 0)]} ${y}` : `Full year ${y}`;
    if (v === 'chg') {
      const k = X.totChg(y);
      return k ? `<button class="mo-c tot${sel.y === y && sel.m == null ? ' sel' : ''}" style="grid-column:span 2;background-color:${k.big ? '' : otyMoHeat(k.pct, 25)}" title="${lab}, against the same months of ${y - 1}. Tap for the detail" onclick="otyMoYear(${y})">${k.big ? 'new' : otyMoSign(k.pct) + Math.abs(k.pct).toFixed(0) + '%'}</button>`
        : '<div class="mo-c none tot" style="grid-column:span 2" title="Not every month has a figure to set against last year">·</div>';
    }
    const t = X.tot(y);
    return t != null ? `<button class="mo-c tot${sel.y === y && sel.m == null ? ' sel' : ''}" style="grid-column:span 2" title="${lab}. Tap for the detail" onclick="otyMoYear(${y})">${X.fv(t)}</button>`
      : '<div class="mo-c none tot" style="grid-column:span 2" title="Not every month has a figure, so there is no total">·</div>';
  };
  for (const y of years.slice().reverse()) {
    const ix = S.idx[y];
    g += `<div class="yr">${y}</div>`;
    if (v === 'index' && !ix) { g += `<div class="rowmsg">${otyEsc(X.why(y))}</div>`; continue; }
    for (let m = 0; m < 12; m++) {
      const c = X.cell(y, m), st = c.state, moon = otyRamIn(y, m) >= 10 ? '<span class="moon">☾</span>' : '';
      if (st === 'ahead') { g += '<div class="mo-c ahead"></div>'; continue; }
      if (!X.ok(c)) {
        const led = c.est && X.met !== 'clients';   // a ledger month has clients, not takings
        const msg = led ? 'Phorest takings start in Jul 2021 and the ledger has no takings, only clients. Switch Measure to Clients.' : !c.open ? 'No takings held for this month.' : c.tot == null ? `Only ${c.open} of ${c.of} branches traded it, so it is left out.` : 'No per-staff figure held for this month.';
        g += `<div class="mo-c ${c.open && !led ? 'part' : 'none'}" title="${otyEsc(msg)}" data-y="${y}" data-m="${m}">${c.open && c.tot == null && !led ? c.open + '/' + c.of : '·'}</div>`; continue;
      }
      let txt = '', bg = '', cls = 'mo-c' + (st === 'live' ? ' live' : '') + (sel.y === y && sel.m === m ? ' sel' : '') + (c.mry ? ' mry' : '') + (c.est ? ' est' : '');
      const x = ix && ix[m];
      if (v === 'index') { txt = Math.round(x); bg = otyMoHeat(x - 100, 35); if (S.peak[y] === m) cls += ' pk'; if (S.low[y] === m) cls += ' lo'; }
      else if (v === 'act') { txt = X.fv(X.val(c)); bg = x != null ? otyMoHeat(x - 100, 35) : ''; }
      else {
        const k = X.cmp(y, m);
        if (k.none) { g += `<div class="mo-c none">·</div>`; continue; }
        txt = k.big ? 'new' : otyMoSign(k.pct) + Math.abs(k.pct).toFixed(0) + '%'; bg = k.big ? '' : otyMoHeat(k.pct, 25); if (X.llf(y, m)) cls += ' llf'; if (k.brk) cls += ' brk';
      }
      g += `<button class="${cls}" style="background-color:${bg}" data-y="${y}" data-m="${m}" onclick="otyMoSel(${y},${m})">${txt}${moon}</button>`;
    }
    g += v === 'index' ? `<div class="pl">${S.peak[y] != null ? OTY_MON[S.peak[y]] : ''}</div><div class="pl">${S.low[y] != null ? OTY_MON[S.low[y]] : ''}</div>` : totCell(y);
  }
  if (v === 'index') {
    g += '<div class="sec"></div><div class="sl">Avg</div>' + S.avg.map(a => `<div class="mo-c avg">${a == null ? '' : Math.round(a)}</div>`).join('') + '<div></div><div></div>';
    g += '<div class="sl">Spread</div>' + S.spr.map(a => `<div class="mo-c spr">${a == null ? '' : Math.round(a) + ' pts'}</div>`).join('') + '<div></div><div></div>';
  }
  const hasRam = !!otyRam(curYear);
  const totNote = v === 'index' ? '' : `<span class="sw">Total is the year's finished months (${curYear}: Jan to ${OTY_MON[Math.max(X.doneN - 1, 0)]})${v === 'chg' ? ', against the same months a year earlier' : ''}. A dot means a month is missing, so there is no total</span>`;
  const legend = totNote + (v === 'chg'
    ? `<span class="mo-scale">weaker<span class="bar"></span>stronger</span>${hasRam ? '<span class="sw">☾ Ramadan and Eid in the month</span><span class="sw"><span class="box" style="border:1.5px dashed var(--warn)"></span>Ramadan and Eid fell differently than last year, so not like for like</span>' : ''}`
    : `<span class="mo-scale">below average<span class="bar"></span>above average</span>${hasRam ? '<span class="sw">☾ Ramadan and Eid in the month (10+ days)</span>' : ''}${v === 'index' ? '<span class="sw">● strongest month ○ weakest month</span>' : ''}<span class="sw"><span class="box" style="background-image:repeating-linear-gradient(135deg,rgba(45,46,55,.55) 0 4px,transparent 4px 9px);background-color:var(--surface2)"></span>Month still running</span>`);

  // Kate, 14 Oct 2026: each sub-section is its own section with its own id, so the rail lists it and the address bar
  // follows it (#oty-months-shapes, #oty-months-pairs, #oty-months-stands) instead of staying on #oty-months all the way down.
  const grid = `${head}
    <p class="oty-deck" style="font-size:clamp(14px,3.4vw,16px)">Does every year have the same shape? Six years on one grid, with growth taken out, so the months can be compared.</p>
    <div class="oty-card" style="margin-top:12px">
      <div class="oty-chead"><b>${title}</b><span>${otyEsc(sub)}</span></div>
      <div class="oty-hint" style="margin:10px 0 0">Follows the Branch filter at the top of the page.</div>
      <div class="oty-lab">Measure</div><div class="oty-seg" role="group" aria-label="Measure">${[['net', 'Net take'], ['clients', 'Clients'], ['bill', 'Avg bill']].map(([k, sh]) => tog('mmet', k, otyMoMetName[k], sh)).join('')}</div>
      <div class="oty-lab">Index set against</div><div class="oty-seg" role="group" aria-label="Index set against">${bases.map(([k, l]) => tog('mbase', k, l, k === 'same' ? X.baseLabel('same') : l)).join('')}</div>
      <div class="oty-hint">${baseHint}</div>
      <div class="oty-seg" role="group" aria-label="View" style="margin:18px 0 14px">${[['index', 'Shape (index)', 'Shape'], ['chg', 'Change on last year', 'Change'], ['act', 'Actual', 'Actual']].map(([k, l, sh]) => tog('mview', k, l, sh)).join('')}</div>
      <div class="mo-swipe">Swipe sideways for the other months and the totals. Tap a month for its detail.</div><div class="mo-sw"><div class="mo-scroll"><div class="mo-hm">${g}</div></div></div>
      <div class="mo-legend">${legend}${X.met === 'clients' && years.includes(2021) ? '<span class="sw"><span class="box" style="border:1.5px dotted var(--muted)"></span>Estimated from the ledger (2021, Jan to Jun)</span>' : ''}${(OTY_REGION_OPT[X.reg] || []).length ? '<span class="sw"><span class="box" style="border-bottom:3px solid #A5D8FF"></span>Marasy is in the figure</span><span class="sw"><span class="box" style="border:2px dashed #3f8fd2"></span>Marasy is in one of the two months and not the other: not like for like</span>' : ''}</div>
    </div>
    <div class="oty-card" id="otyMoDetail" style="margin-top:12px">${otyMoDetail(X, S, sel)}</div>`;
  const notes = `
    <details class="oty-card oty-note oty-how" style="margin-top:12px"><summary>How to read this section</summary>
      <ul>
        <li><b>100 = a normal month</b> for that year. 120 is 20% stronger, 85 is 15% weaker. Each year is set against itself, so growth drops out and the shape is left.</li>
        <li><b>Per open day</b>, so a short February or a closed day is fair.</li>
        <li><b>Striped</b> = the month still running, left out of every average.</li>
        <li><b>Totals</b> (Actual, Change) show only when every finished month has a figure. ${curYear} is Jan to ${OTY_MON[Math.max(X.doneN - 1, 0)]}.</li>
        <li><b>Marasy</b> (Phorest data 1 Jul 2021 to 24 Dec 2022) is added only when ticked. Shape is fair across it; Actual and Change are not, and those cells have a dashed sky-blue edge.</li>
        <li><b>2021, Jan to Jun (Clients only):</b> The salons were trading long before 2021 (Tara Rose started in 2015); it is the <b>Phorest data</b> that starts late: a few days in May and June 2021 for Saadiyat and Khalifa City A, complete from July, and 1 July for Marasy. So Jan to Jun 2021 comes from the weekly ledgers (every day of 2021 is there). The ledger counts clients, not takings, so <b>Net take and Average bill stay empty</b> for those months. The ledger counted more clients than Phorest did later in 2021, so each branch's ledger figure is scaled by its own Jul to Dec 2021 ratio (Phorest ÷ ledger; Saadiyat 0.84, Khalifa City A 0.89, Marasy 1.16) to avoid a false step in July. These cells have a dotted edge: <b>treat them as an estimate, good for the shape and the direction, not for the exact count.</b> From July 2021 it is Phorest, as for every other year.</li>
        <li><b>2020 and before:</b> the page starts at 2021 because that is where the loaded data starts, not because the salons did. Only December 2020 ledgers have been found (Saadiyat, Khalifa City A, Marasy) and they are not loaded.</li>
        <li><b>Source:</b> Phorest daily totals, refreshed hourly (2021 Jan to Jun Clients: the ledger, see above). Net take is net of VAT.</li>
      </ul>
    </details>`;
  // [id, rail label, html] per sub-section; otyDraw() turns each into its own section. The notes ride with the last one.
  const subs = [['oty-months', 'Month by month', grid], ['oty-months-shapes', 'The shape of each year', otyMoLines(X, S)],
    ['oty-months-pairs', 'Year against the year before', otyMoPairs(X)], ['oty-months-stands', 'What stands out', otyMoStands(X, S)]].filter(s => s[2]);
  subs[subs.length - 1][2] += notes;
  return subs;
}
function otyMoSet(k, v) { OTY[k] = v; otySave(); otyDraw(); }
// the detail sits under the grid and its legend, below the fold on most screens, so a tap brings it into view
function otyMoSel(y, m) {
  OTY.mmsel = { y, m }; otyDraw();
  const d = document.getElementById('otyMoDetail'); if (d && d.scrollIntoView) d.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
// a year's Total is clickable too: sel.m is null and the detail below the grid reads the whole year
function otyMoYear(y) {
  OTY.mmsel = { y, m: null }; otyDraw();
  const d = document.getElementById('otyMoDetail'); if (d && d.scrollIntoView) d.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// tap a month: its figure, how it sits in its own year, and how it sits against the other years
// tap a year's Total: the whole year's figure, against the same months of the year before, and its strongest and weakest month
function otyMoYearDetail(X, y) {
  const B = X.mths(y), t = X.tot(y), cur = y === X.curYear, last = B.length ? OTY_MON[B[B.length - 1]] : '', lab = cur ? `Jan to ${last} ${y}` : `Full year ${y}`;
  if (t == null) return `<div class="oty-rh"><b>${lab}</b></div><div class="oty-note">Not every month of ${y} has a figure here, so there is no total.</div>`;
  const k = X.totChg(y), pre = X.met === 'net' ? 'AED ' : '';
  const pc = k ? `<span class="oty-chg ${k.big || Math.abs(k.pct) < .5 ? 'flat' : k.pct > 0 ? 'up' : 'dn'}" style="margin:0">${k.big ? 'new' : otyMoSign(k.pct) + Math.abs(k.pct).toFixed(1) + '%'}</span>` : '';
  const ranked = B.map(m => [m, X.val(X.cell(y, m))]).sort((a, b) => b[1] - a[1]), hi = ranked[0], lo = ranked[ranked.length - 1];
  const vs = k ? `${X.fd(k.diff)} on the same months of ${y - 1}` : y > X.years[0] ? `Not like for like with ${y - 1}, so no comparison` : 'No year before to set against';
  return `<div class="oty-rh"><b>${lab}</b><span>${y > X.years[0] && k ? `against the same months of ${y - 1}` : 'the finished months of the year, added up'}</span>${pc}</div>
    <div class="mo-dt">
      <div><div class="k">${otyMoMetName[X.met]}</div><div class="v">${pre}${X.fv(t)}</div><div class="s">${vs}</div></div>
      <div><div class="k">Months counted</div><div class="v">${B.length} <small>of 12</small></div><div class="s">${cur ? `${OTY_MON[B[0]]} to ${last}, the months ${y} has finished` : 'Every month of the year'}</div></div>
      <div><div class="k">Strongest month</div><div class="v">${OTY_MON[hi[0]]}</div><div class="s">${pre}${X.fv(hi[1])}</div></div>
      <div><div class="k">Weakest month</div><div class="v">${OTY_MON[lo[0]]}</div><div class="s">${pre}${X.fv(lo[1])}</div></div>
    </div>`;
}
function otyMoDetail(X, S, sel) {
  if (sel.m == null) return otyMoYearDetail(X, sel.y);
  const { y, m } = sel, c = X.cell(y, m);
  if (!c || !X.ok(c)) return '<div class="oty-note">Tap a month in the grid.</div>';
  const ix = S.idx[y], k = X.cmp(y, m), rd = otyRamIn(y, m), rp = y > X.years[0] ? otyRamIn(y - 1, m) : 0, p = y > X.years[0] ? X.cell(y - 1, m) : null, live = c.state === 'live';
  const done = mm => otyMoState(X.M, y, mm) === 'done', ixs = ix ? ix.map((x, i) => [x, i]).filter(a => a[0] != null && done(a[1])) : [];
  const rank = ix && done(m) ? ixs.slice().sort((a, b) => b[0] - a[0]).findIndex(a => a[1] === m) + 1 : null;
  const others = X.years.filter(o => o !== y).map(o => { const r = X.idx(o); return r && otyMoState(X.M, o, m) === 'done' ? r[m] : null; }).filter(x => x != null);
  const oavg = others.length ? others.reduce((a, b) => a + b, 0) / others.length : null;
  const pc = k && !k.none ? `<span class="oty-chg ${k.big ? 'flat' : Math.abs(k.pct) < .5 ? 'flat' : k.pct > 0 ? 'up' : 'dn'}" style="margin:0">${k.big ? 'new' : otyMoSign(k.pct) + Math.abs(k.pct).toFixed(1) + '%'}</span>` : '';
  const ram = rd || rp ? `${rd} of ${c.dim} days in ${y}${p ? `, ${rp} of ${p.dim} in ${y - 1}` : ''}${p && Math.abs(rd - rp) >= 10 ? '. Not like for like, read it with the shape view.' : ''}` : 'Not touched in either year';
  const estNote = c.est ? `<div class="oty-note" style="margin-top:10px"><b>Estimated from the ledger.</b> Phorest has no full data for this month (its data starts in July 2021, the salon was open), so the clients come from the weekly ledgers, scaled to Phorest's count (×${c.k.length ? [...new Set(c.k)].map(x => x.toFixed(2)).join(' / ') : '1'} by branch, from Jul to Dec ${y}). Use it for the shape and the direction, not the exact count. The ledger has no takings, so Net take and Average bill are empty.</div>` : '';
  return `<div class="oty-rh"><b>${OTY_MON[m]} ${y}</b><span>${live ? `1 to ${c.days} open days, against the same number of open days in ${y - 1}` : y > X.years[0] ? `against ${OTY_MON[m]} ${y - 1}` : 'first year held'}</span>${pc}</div>
    <div class="mo-dt">
      <div><div class="k">${otyMoMetName[X.met]}</div><div class="v">${X.met === 'net' ? 'AED ' : ''}${X.fv(X.val(c))}</div><div class="s">${k && !k.none ? `${X.fd(k.diff)} on the same open days of ${y - 1}` : 'No year before to set against'}</div></div>
      <div><div class="k">Index · 100 = average month</div><div class="v">${ix && ix[m] != null ? Math.round(ix[m]) : '·'}</div><div class="s">${rank ? `${otyMoOrd(rank)} strongest of ${ixs.length} finished months in ${y}` : ix ? 'Month still running' : 'Not enough months for a shape'}</div></div>
      <div><div class="k">Same month, other years</div><div class="v">${oavg != null ? Math.round(oavg) : '·'}</div><div class="s">${oavg != null && ix && ix[m] != null ? `${y} is ${Math.abs(ix[m] - oavg).toFixed(0)} pts ${ix[m] >= oavg ? 'above' : 'below'} the average of the other years` : 'Average index across the other years'}</div></div>
      <div><div class="k">Ramadan and Eid</div><div class="v">${rd} <small>of ${c.dim} days</small></div><div class="s">${ram}</div></div>
    </div>${estNote}`;
}

// a smooth curve through the points (monotone cubic, so it never overshoots a peak or dips below a low that is not in the data)
function otySmoothPath(p) {
  const n = p.length, f = v => v.toFixed(1); if (!n) return '';
  if (n < 3) return p.map((q, i) => (i ? 'L' : 'M') + f(q[0]) + ' ' + f(q[1])).join(' ');
  const dx = [], sl = [], t = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = p[i + 1][0] - p[i][0]; sl[i] = (p[i + 1][1] - p[i][1]) / dx[i]; }
  t[0] = sl[0]; t[n - 1] = sl[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = sl[i - 1] * sl[i] <= 0 ? 0 : (sl[i - 1] + sl[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (sl[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / sl[i], b = t[i + 1] / sl[i], h = Math.hypot(a, b);
    if (h > 3) { t[i] = 3 * a / h * sl[i]; t[i + 1] = 3 * b / h * sl[i]; }
  }
  let d = 'M' + f(p[0][0]) + ' ' + f(p[0][1]);
  for (let i = 0; i < n - 1; i++) d += ` C${f(p[i][0] + dx[i] / 3)} ${f(p[i][1] + t[i] * dx[i] / 3)} ${f(p[i + 1][0] - dx[i] / 3)} ${f(p[i + 1][1] - t[i + 1] * dx[i] / 3)} ${f(p[i + 1][0])} ${f(p[i + 1][1])}`;
  return d;
}

// one line per year on the same axis
function otyMoLines(X, S) {
  const years = X.years, shown = new Set(otySelYears()), W = 900, H = 330, L = 44, Rr = 14, T = 16, B = 30;
  const all = years.filter(y => shown.has(y) && S.idx[y]).flatMap(y => S.idx[y].filter((x, m) => x != null && otyMoState(X.M, y, m) === 'done'));
  if (!all.length && !S.avg.some(a => a != null)) return '';
  const lo = Math.min(...all, ...S.avg.filter(a => a != null), 100), hi = Math.max(...all, ...S.avg.filter(a => a != null), 100);
  const ymin = Math.floor((lo - 4) / 20) * 20, ymax = Math.ceil((hi + 4) / 20) * 20;
  const Xp = m => L + (W - L - Rr) * (m + .5) / 12, Yp = vv => T + (H - T - B) * (1 - (vv - ymin) / (ymax - ymin));
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Monthly shape by year" onmousemove="otyMoLineTip(event)">`;
  for (let t = ymin; t <= ymax; t += 20) s += `<line x1="${L}" x2="${W - Rr}" y1="${Yp(t)}" y2="${Yp(t)}" stroke="${t === 100 ? 'var(--muted2)' : 'var(--border)'}" ${t === 100 ? 'stroke-dasharray="4 4"' : ''}/><text x="${L - 8}" y="${Yp(t) + 4}" text-anchor="end" font-size="11">${t}</text>`;
  OTY_MON.forEach((m, i) => { s += `<text x="${Xp(i)}" y="${H - 8}" text-anchor="middle" font-size="11.5">${m}</text>`; });
  const path = pts => otySmoothPath(pts.map(p => [Xp(p[0]), Yp(p[1])]));
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
  const chips = `<div class="oty-legend" style="margin:0">${years.filter(y => shown.has(y)).map(y => `<span><i style="background:${otyMoCol(y)}"></i>${y}</span>`).join('')}</div>`;
  // Kate, 16 Oct 2026: six lines on one 340px chart cannot be read. On a phone each year is its own small bar chart, all on the
  // same scale, bars up from 100 (a normal month) in green and down in red, the figure on every bar and a moon under a month
  // Ramadan or Eid touched. Newest first, then the average of the years. The line chart stays for wider screens.
  const rng = ymax - ymin, SH = 104;
  const mini = (title, vals, y) => {
    const cols = vals.map((v, m) => {
      const mo = `<i class="sm-m">${OTY_MON[m][0]}${y && otyRamIn(y, m) >= 10 ? '<span class="sm-r">&#9790;</span>' : ''}</i>`;
      if (v == null) return `<div class="sm-c"><em class="sm-v" style="top:${((ymax - 100) / rng * SH - 6).toFixed(1)}px">·</em>${mo}</div>`;
      const top = (ymax - Math.max(v, 100)) / rng * SH, h = Math.max(2, Math.abs(v - 100) / rng * SH), up = v >= 100;
      return `<div class="sm-c"><div class="sm-b ${up ? 'up' : 'dn'}" style="top:${top.toFixed(1)}px;height:${h.toFixed(1)}px"></div><em class="sm-v" style="top:${(up ? top - 13 : top + h + 1).toFixed(1)}px">${Math.round(v)}</em>${mo}</div>`;
    }).join('');
    return `<div class="sm-blk"><div class="sm-t">${title}</div><div class="sm-g" style="--SH:${SH}px;--base:${((ymax - 100) / rng * SH).toFixed(1)}px">${cols}</div></div>`;
  };
  const smYears = years.filter(y => shown.has(y) && S.idx[y]).reverse();
  const sm = `<div class="oty-sm"><div class="oty-hint">&#9790; Ramadan or Eid in the month. Tick the years at the top of the page.</div>`
    + smYears.map(y => mini(`${y}${y === X.curYear ? ' <small>so far</small>' : ''}`, S.idx[y].map((x, m) => x != null && otyMoState(X.M, y, m) === 'done' ? x : null), y)).join('')
    + (S.avg.some(a => a != null) ? mini('Average of the years', S.avg.map(a => a == null ? null : a), 0) : '') + '</div>';
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
  return `<div class="oty-eb" style="margin-top:26px"><i style="background:var(--hair)"></i>The shape of each year</div>
    <div class="oty-card"><div class="oty-chead"><b>Each year's shape</b><span>${otyMoStatLine(X)}. 100 is a normal month for that year, so 117 means 17% above normal and 90 means 10% below.</span></div>
      ${sm}
      <details class="oty-lines oty-how" style="margin-top:14px"><summary>All the years on one line chart</summary><div style="margin:10px 0 12px">${chips}</div>${s}${lane}</details></div>`;
}

// each month this year against the same month the year before
function otyMoPairs(X) {
  // Kate, 16 Oct 2026: the latest ticked year against the ticked year before it (the year before, when only one is ticked).
  const years = X.years, sel = otySelYears().filter(v => years.includes(v));
  let y = sel.length ? sel[sel.length - 1] : X.curYear; if (y <= years[0]) y = years[1] || y;
  const lower = sel.filter(v => v < y), py = lower.length ? lower[lower.length - 1] : y - 1;
  const rows = [...Array(12).keys()].map(m => ({ m, c: X.cell(y, m), k: X.cmp(y, m, py) })), live = r => r.c && r.c.state === 'live';
  const vals = rows.flatMap(r => r.k && !r.k.none ? [r.k.cur, r.k.prevW] : []), mx = Math.max(...vals, 1);
  const cols = rows.map(r => {
    if (!r.k || r.k.none) return `<div class="mo-pr"><div class="dp">${r.c && r.c.state === 'ahead' ? '' : '<span class="mo-dpp fl">·</span>'}</div><div class="bars"></div><div class="m">${OTY_MON[r.m]}</div></div>`;
    const k = r.k, cl = k.big || Math.abs(k.pct) < .5 ? 'fl' : k.pct > 0 ? 'up' : 'dn';
    return `<div class="mo-pr hit" data-by="${y}" data-bp="${py}" data-bm="${r.m}"><div class="dp"><span class="mo-dpp ${cl}">${k.big ? 'new' : otyMoSign(k.pct) + Math.abs(k.pct).toFixed(0) + '%'}</span></div>
      <div class="bars"><div class="mo-b ${live(r) ? 'live' : ''}" data-bw="p" style="height:${Math.max(2, k.prevW / mx * 100)}%;background-color:var(--hair)"></div><div class="mo-b ${live(r) ? 'live' : ''}" data-bw="c" style="height:${Math.max(2, k.cur / mx * 100)}%;background-color:var(--good)"></div></div>
      <div class="m">${OTY_MON[r.m]}${otyRamIn(y, r.m) >= 10 ? ' ☾' : ''}</div></div>`;
  }).join('');
  return `<div class="oty-eb" style="margin-top:26px"><i style="background:var(--hair)"></i>Year against the year before, month by month</div>
    <div class="oty-card"><div class="oty-chead"><b>${y} against ${py}</b><span>${otyMoMetName[X.met]} · same open days in each month</span></div>
      <div class="oty-hint" style="margin:8px 0 14px">The latest two ticked years. Tick the years at the top of the page.</div>
      <div class="mo-swipe">Swipe sideways for the other months. Tap a pair for its detail.</div><div class="mo-sw"><div class="mo-scroll"><div class="mo-pairs">${cols}</div></div></div>
      <div class="mo-legend"><span class="sw"><i class="box" style="background:var(--hair)"></i>${py}</span><span class="sw"><i class="box" style="background:var(--good)"></i>${y}</span><span class="sw">The pill is the month against the same month a year earlier</span></div></div>`;
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
  // Kate, 16 Oct 2026: "too wordy, make it visual, only what is necessary". Chips for each year's strongest and weakest month, a bar
  // per month for how much the years disagree, and two numbers for Ramadan and Eid.
  const tightM = new Set(tight.map(a => a[1])), wideM = new Set(wide.map(a => a[1])), mxS = Math.max(...ok.map(a => a[0]), 1);
  const sprBars = OTY_MON.map((mn, m) => { const v = S.spr[m];
    if (v == null) return `<div class="st-b"><div class="st-t"></div><i>${mn}</i></div>`;
    const cls = tightM.has(m) ? 'ok' : wideM.has(m) ? 'wd' : '';
    return `<div class="st-b ${cls}"><div class="st-t"><div class="st-f" style="height:${Math.max(4, v / mxS * 100)}%">${cls ? `<em>${Math.round(v)}</em>` : ''}</div></div><i>${mn}</i></div>`; }).join('');
  const yrChips = ys.slice().reverse().map(y => `<div class="st-y"><b>${y}${y === X.curYear ? '*' : ''}</b><span class="st-c hi">&#9650; ${OTY_MON[S.peak[y]]}</span><span class="st-c lo">&#9660; ${OTY_MON[S.low[y]]}</span></div>`).join('');
  return `<div class="oty-eb" style="margin-top:26px"><i style="background:var(--warn)"></i>What stands out</div>
    <div class="oty-card oty-flag">
      <div class="oty-lab" style="margin-top:0">Strongest and weakest month</div>
      <div class="st-yrs">${yrChips}</div>${ys.includes(X.curYear) ? `<div class="oty-hint" style="margin-top:6px">* ${X.curYear} so far</div>` : ''}
      <div class="oty-lab">How far the years disagree, by month</div>
      <div class="st-spr">${sprBars}</div>
      <div class="oty-hint"><span class="st-k ok"></span>Steadiest <span class="st-k wd"></span>Changes most (points apart)</div>
      ${rIn.length ? `<div class="oty-hint" style="margin-top:14px">&#9790; Ramadan and Eid move about 11 days earlier every year, so the dip lands in a different month each time.</div>` : ''}</div>`;
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
  const m = +r.dataset.lm, X = otyMoCtx(), S = X.stats(), shown = new Set(otySelYears());
  const gap = x => { const d = Math.round(x) - 100; return d === 0 ? 'a normal month' : `${Math.abs(d)}% ${d > 0 ? 'above' : 'below'} normal`; };
  let t = `<div class="h"><b>${OTY_MON[m]}</b><span>${otyMoStatLine(X)}. 100 = a normal month for that year</span></div>`;
  for (const y of X.years.slice().reverse()) {
    if (!shown.has(y)) continue;
    const x = S.idx[y] && otyMoState(X.M, y, m) === 'done' ? S.idx[y][m] : null;
    t += `<div style="display:flex;justify-content:space-between;gap:12px"><span><i style="display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:6px;background:${otyMoCol(y)}"></i>${y}${otyRamIn(y, m) >= 10 ? ' ☾' : ''}</span><span>${x == null ? 'no shape' : `<b>${Math.round(x)}</b> <small style="color:var(--muted2)">${gap(x)}</small>`}</span></div>`;
  }
  if (S.avg[m] != null) t += `<div style="display:flex;justify-content:space-between;gap:12px;margin-top:4px;padding-top:4px;border-top:1px solid var(--border)"><span>Average of the years</span><span><b>${Math.round(S.avg[m])}</b> <small style="color:var(--muted2)">${gap(S.avg[m])}</small></span></div>`;
  otyMoTipBox(r, ev, t);
}
function otyMoTipFor(el, ev) {
  const X = otyMoCtx();
  if (el.dataset.by) {
    const y = +el.dataset.by, py = +el.dataset.bp || y - 1, m = +el.dataset.bm, k = X.cmp(y, m, py), c = X.cell(y, m); if (!k || k.none) return;
    const bar = ev.target.closest && ev.target.closest('.mo-b'), hot = bar ? bar.dataset.bw : '', live = c.state === 'live', pre = X.met === 'net' ? 'AED ' : '';
    const row = (yy, v, col, w, note) => `<div style="display:flex;justify-content:space-between;gap:14px;${hot && hot !== w ? 'opacity:.6;' : ''}"><span><i style="display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:6px;background:${col}"></i>${yy}${note}</span><b>${pre}${X.fv(v)}</b></div>`;
    otyMoTipBox(el, ev, `<div class="h"><b>${OTY_MON[m]}</b><span>${live ? `${c.days} open days so far` : 'same open days in each year'}</span></div>
      ${row(y, k.cur, 'var(--good)', 'c', '')}${row(py, k.prevW, 'var(--hair)', 'p', '')}
      <div style="margin-top:4px;padding-top:4px;border-top:1px solid var(--border)">${X.fd(k.diff)} · <b class="${k.pct >= 0 ? 'oty-up' : 'oty-dn'}">${k.big ? 'new' : otyMoSign(k.pct) + Math.abs(k.pct).toFixed(1) + '%'}</b></div>${py === y - 1 && X.llf(y, m) ? '<div style="margin-top:4px">Ramadan and Eid fell differently, so not like for like.</div>' : ''}`);
    return;
  }
  const y = +el.dataset.y, m = +el.dataset.m, c = X.cell(y, m); if (!c) return;
  if (!X.ok(c)) { otyMoTipBox(el, ev, `<div class="h"><b>${OTY_MON[m]} ${y}</b></div><div>${c.est && X.met !== 'clients' ? 'Phorest takings start in Jul 2021; the ledger has clients only. Switch Measure to Clients.' : !c.open ? 'No takings held for this month.' : c.tot == null ? `Only ${c.open} of ${c.of} branches traded it, so it is left out.` : 'No per-staff figure held for this month.'}</div>`); return; }
  const ix = X.idx(y), k = X.cmp(y, m), rd = otyRamIn(y, m);
  otyMoTipBox(el, ev, `<div class="h"><i style="background:${otyMoCol(y)}"></i><b>${OTY_MON[m]} ${y}</b><span>${otyEsc(otyMoName(X.reg))}</span></div><div class="v">${X.met === 'net' ? 'AED ' : ''}${X.fv(X.val(c))}</div>
    <div>${ix && ix[m] != null ? `Index <b>${Math.round(ix[m])}</b> (100 = this year's average month)` : 'No shape for this year'}${c.state === 'live' ? ` · ${c.days} open days so far` : ''}</div>
    ${k && !k.none ? `<div>vs ${y - 1}: <b class="${k.pct >= 0 ? 'oty-up' : 'oty-dn'}">${k.big ? 'new' : otyMoSign(k.pct) + Math.abs(k.pct).toFixed(1) + '%'}</b></div>` : ''}${rd ? `<div>Ramadan and Eid: ${rd} of ${c.dim} days</div>` : ''}`);
}
if (!window.__otyMoBound) {
  window.__otyMoBound = true;
  document.addEventListener('mousemove', e => {
    const t = e.target && e.target.closest && e.target.closest('#overYearsContent .mo-c[data-y],#overYearsContent .mo-pr[data-by]');
    if (t) { try { otyMoTipFor(t, e); } catch (x) { otyMoTipOff(); } } else if (!(e.target.closest && e.target.closest('[data-lm]'))) otyMoTipOff();
  });
  // a phone has no hover: tap a month pair to read it, tap anywhere else to close
  document.addEventListener('click', e => {
    document.querySelectorAll('#overYearsContent .mo-pr.on').forEach(n => n.classList.remove('on'));
    const t = e.target && e.target.closest && e.target.closest('#overYearsContent .mo-pr[data-by]');
    if (!t) { if (!(e.target.closest && e.target.closest('.mo-c[data-y]'))) otyMoTipOff(); return; }
    t.classList.add('on'); try { otyMoTipFor(t, e); } catch (x) { otyMoTipOff(); }
  });
}

// ── GOOGLE REVIEWS (UNDER CONSTRUCTION) ──────────────────────────────────
function otyReviews() {
  const { years, D, sets, curYear } = otyD, set = otyCodes(), same = OTY.basis === 'same', n = years.length;
  const rows = years.map((y, i) => {
    const per = set.map(b => ({ b, v: (same ? D[b].rev.ny : D[b].rev.n)[i] || 0, s: (same ? D[b].rev.sy : D[b].rev.s)[i] || 0 }));
    const c = per.reduce((a, p) => a + p.v, 0), stars = c ? per.reduce((a, p) => a + p.v * p.s, 0) / c : 0;
    return { y, i, n: c, stars, per, partial: !same && y === curYear };
  });
  if (!rows.some(r => r.n)) return `<div class="oty-eb"><i style="background:var(--warn)"></i>Reputation · Google reviews <span class="oty-uc">(UNDER CONSTRUCTION)</span></div><div class="oty-card oty-flag"><div class="oty-note">No Google reviews are held for ${otySetLabel(set)}.</div></div>`;
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
    <div class="oty-card oty-flag" style="margin-top:10px"><div class="oty-note"><p><b>Check before reading ${d == null ? 'it' : d.toFixed(0) + '%'} as a drop.</b> ${n26} reviews so far in ${otyD.curYear} against ${n25} on the same days of ${otyD.curYear - 1}. A fall that steep may be the review sync, not the salons: new reviews are still pulled by hand while the Google approval is pending, and older dates are approximate ("2 years ago"), so the years are solid and the days are not.</p><p><b>The stars</b> are a review-weighted average of every review in the window, so a branch with more reviews counts for more.</p>${set.includes('MRY') ? `<p><b>Marasy is in these figures.</b> ${otyEsc(OTY_MRY_REV)}</p>` : ''}</div></div>`;
}

// ── INSTAGRAM (UNDER CONSTRUCTION) ───────────────────────────────────────
function otyInstagram() {
  const head = `<div class="oty-eb"><i style="background:var(--hair)"></i>Instagram · posts, collabs and tags, by month <span class="oty-uc">(UNDER CONSTRUCTION)</span></div>`;
  if (typeof TRS_LEVEL === 'undefined' || TRS_LEVEL < 3) return head + `<div class="oty-card oty-flag"><div class="oty-note">Instagram is for Level 4 and above.</div></div>`;
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
  const open = present.filter(b => !OTY_HIST.includes(b)), led = otyRaw.ledger || [];
  const ledg = years.map(y => {
    const rs = led.filter(r => r.y === y && open.includes(r.b)), l = rs.reduce((t, r) => t + (+r.led || 0), 0), d = rs.reduce((t, r) => t + (+r.days || 0), 0);
    return !l ? 0 : d && l / d >= .85 ? 1 : 2;
  });
  const ledFrom = years.find((y, i) => ledg[i]);
  const rows = [['Phorest daily totals', has('net')], ['Phorest sales lines', has('vis').map((v, i) => v && years[i] === 2021 && OTY_VIS_GAP_2021.some(b => present.includes(b)) ? 2 : v)], ['Phorest per staff', has('stf')],
    ['Ledgers (hair, beauty)', ledg], ['Google reviews (year only)', years.map(y => present.some(b => (otyD.D[b].rev.n[years.indexOf(y)] || 0) > 0) ? 2 : 0)],
    ['Instagram posts, collabs, tags', years.map(y => y >= 2025 ? 2 : 0)]];
  return `<div class="oty-eb"><i style="background:var(--good)"></i>What each year has behind it</div>
    <div class="oty-card"><div class="oty-cov" style="--cols:${years.length}"><span class="cx"></span>${years.map(y => `<span style="text-align:center">${String(y).slice(2)}</span>`).join('')}
    ${rows.map(([l, a]) => `<span class="l">${l}</span>${a.map(c => `<span class="c ${c === 2 ? 'part' : c ? 'ok' : ''}"></span>`).join('')}`).join('')}</div>
    <div class="oty-hint" style="margin:12px 0 0"><span class="st-k ok"></span>Complete <span class="st-k cv"></span>There, with a caveat <span class="st-k no"></span>Not there</div>
    <details class="oty-note oty-how" style="margin-top:10px"><summary>What the caveats are</summary><ul>
      <li><b>Phorest</b> totals, sales lines and per-staff counts go back to 2021.</li>
      <li><b>Ledgers</b> (hair against beauty, rebooking, requests, per-staff counts) ${ledFrom ? `start in ${ledFrom}` : 'are not in yet'}; a year is yellow under 85% of Phorest's days.</li>
      <li><b>Google reviews:</b> dates are approximate before 2026. ${otyEsc(OTY_MRY_REV)}</li>
      <li><b>Instagram</b> only exists from 2025 and builds up through the year.</li></ul></details></div>`;
}
function otyNotes() {
  return `<div class="oty-eb"><i style="background:var(--accent)"></i>How to read this page</div>
    <details class="oty-card oty-note oty-how"><summary>The rules this page follows</summary>
      <p><b>Seasons, not calendar months.</b> Ramadan and Eid move about 11 days earlier every year, so month against month compares different seasons. The month by month section is there so Coach Emma can see the shape of each year anyway, and it marks every month Ramadan and Eid touched.</p>
      <p><b>Branches arrive over time.</b> Motor City's data starts Nov 2022 and Al Quoz's Sep 2023, so the all-branches total jumps when they appear. Like for like (Saadiyat + Khalifa City A) is the trend.</p>
      <p><b>Fratelli</b> closed on 22 May 2026. It is out of All four, as everywhere on the dashboard, and has its own chip, and All + closed puts it back in for the years it traded.</p>
      <p><b>Marasy</b> is a former branch. Its Phorest data runs 1 Jul 2021 to 24 Dec 2022, so it has its own chip and is in All + closed, not in All four or Like for like. Both its years are part-years (2021 starts in July), and its closing date is not confirmed, so it says "data to" and not "closed". Its sales lines run from 1 Jul 2021, like Saadiyat's and Khalifa City A's.</p>
      <p><b>Same days first.</b> The year in progress is set against the same dates in every earlier year. Switch to Full years to see whole years, with this one marked as partial.</p>
      <p><b>Slightly different from the Pulse.</b> These are Phorest's own financial totals. The Pulse's net take is built from the ledgers, so the two differ by about 1%.</p>
    </details>`;
}
