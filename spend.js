// Stock and Supplier Spend (Kate, 21 Oct 2026): every supplier, the products Phorest received under it, the five categories, with
// each branch, category and supplier read against its cap.
//
// The numbers that count against the caps are Phorest's: what arrived on stock orders in the month (stock_order_lines, at the Stock
// List cost), so every line has its product, category and branch. What Accounts paid per supplier (their Supplier Balance monthly
// sheet, loaded by scripts/spend/load_supplier_months.py into spend_invoiced) is its own section at the bottom: that sheet follows
// payments, not invoice dates, so it is read as cash out and is not part of the caps. Income for the percentages is the
// dashboard's own (phorest_staff_daily TOTAL, ex VAT).
//
// One call to spend_report() draws the page; spend_set() saves a tag or a cap (migrations/stock_spend_report.sql). Level 4
// and up only: the functions refuse anyone else, whatever this file does.
//
// Drawn inside a shadow root: the sheet, pills, chips and bars here are small and generic, and the dashboard already has
// .card, .pill, .bar, .chips and .seg of its own. The dashboard's colour tokens still reach in (custom properties inherit).
(function () {
  const B = ['SAA', 'KCA', 'MC', 'AQ'];
  const BN = { SAA: 'Saadiyat', KCA: 'Khalifa City A', MC: 'Motor City', AQ: 'Al Quoz' };
  const FIVE = ['Hair Retail', 'Hair Professional', 'Beauty Retail', 'Beauty Professional', 'Consumables'];
  const ALLCATS = FIVE.concat(['Not sorted', 'Outside the 5']);
  const DEFAULT_SALON_CAP = 10;

  const CSS = `
:host{display:block}
*{box-sizing:border-box}
.stage{container-type:inline-size;color:var(--text);font:inherit;
  --ok:var(--good,#0F6E56);--over:var(--bad,#A32D2D);--hl:color-mix(in srgb,var(--warn,#BA7517) 24%,var(--surface,#fff))}
.pg{max-width:1240px;margin:0 auto;padding:10px 28px 48px}
button,select,input{font:inherit;color:inherit}
.muted{color:var(--muted)}.small{font-size:12.5px}
.msg{padding:30px 0;color:var(--muted);font-size:14px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px 16px}
.grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;align-items:stretch;margin-bottom:6px}
.grid3{grid-auto-rows:minmax(380px,auto)}
.grid3>.card{display:flex;flex-direction:column;min-width:0}
.grid3>.card:not(.fit){contain:size}
.grid3>.card.fit .pbody{overflow:visible;margin-right:0;padding-right:0}
.pbody{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;margin-right:-8px;padding-right:8px;scrollbar-width:thin}
.pt{font-size:12px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin:0 0 10px}
.pt span{text-transform:none;letter-spacing:0;font-weight:400}
.prow{padding:9px 0;border-top:1px solid var(--border2)}
.prow:first-child{border-top:0}
.prow .l1{display:flex;justify-content:space-between;gap:10px;align-items:baseline}
.prow .pn{font-weight:600;font-size:14px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.prow .pv{font-variant-numeric:tabular-nums;font-weight:600;white-space:nowrap}
.prow .l2{display:flex;justify-content:space-between;gap:8px;align-items:center;font-size:12.5px;color:var(--muted);flex-wrap:wrap}
.bar{position:relative;height:9px;border-radius:999px;background:var(--surface2);margin:8px 0 4px}
.bar>i{position:absolute;left:0;top:0;bottom:0;border-radius:999px;background:var(--ok)}
.bar>i.over{background:var(--over)}.bar>i.neu{background:var(--accent);opacity:.5}
.bar>b{position:absolute;top:-3px;bottom:-3px;width:2px;background:var(--text)}
.pill{display:inline-block;font-size:12px;font-weight:600;border-radius:999px;padding:2px 10px;line-height:1.5;white-space:nowrap}
.p-over{background:color-mix(in srgb,var(--over) 16%,var(--surface));color:var(--over)}
.p-ok{background:color-mix(in srgb,var(--ok) 16%,var(--surface));color:var(--ok)}
.capin{width:62px;border:1px dashed var(--border);border-radius:7px;background:var(--surface2);padding:2px 6px;font-size:12.5px;text-align:right;font-variant-numeric:tabular-nums}
.capin.aed{width:78px}
.capin:focus{outline:2px solid var(--accent);border-style:solid}
.capin:disabled{opacity:.6;border-style:solid}
.basisnote{font-size:13px;color:var(--muted);margin:0 0 14px;max-width:110ch}
h2.s{font-size:12px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin:22px 0 10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center}
h2.s em{font-style:normal;font-weight:500;letter-spacing:0;text-transform:none;color:var(--muted2)}

/* the one filter bar */
.fwrap{position:sticky;top:var(--topbar-cond-h,104px);z-index:40;background:var(--bg);margin:0 0 14px;padding:8px 0 10px;border-bottom:1px solid var(--border)}
.fhead{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.fsum{font-size:13px;color:var(--muted);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fmsg{font-size:12.5px;color:var(--muted2)}
.fbar2{display:flex;gap:10px 18px;flex-wrap:wrap;align-items:center;margin-top:10px}
.fbar2 .fg{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.lab{font-size:12px;color:var(--muted2);margin-right:2px}
.fbtn{border:1px solid var(--border);background:var(--surface);border-radius:999px;padding:5px 13px;font-size:13px;cursor:pointer;white-space:nowrap}
.fbtn.on{background:var(--hl);border-color:transparent;font-weight:600}
.fbtn:focus-visible,.seg button:focus-visible,.chips button:focus-visible,#q:focus-visible,.exp:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.seg{display:inline-flex;border:1px solid var(--border);border-radius:999px;background:var(--surface);overflow:hidden}
.seg button{border:0;background:none;padding:6px 13px;font-size:13px;cursor:pointer;color:var(--muted);white-space:nowrap}
.seg button[aria-pressed="true"]{background:var(--accent);color:var(--accent-fg)}
.chips{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.chips button{border:1px solid var(--border);background:var(--surface);border-radius:999px;padding:5px 13px;font-size:13px;color:var(--muted);cursor:pointer;white-space:nowrap}
.chips button[aria-pressed="true"]{background:var(--accent);color:var(--accent-fg);border-color:var(--accent)}
#q{border:1px solid var(--border);border-radius:999px;background:var(--surface);padding:5px 14px;font-size:13px;min-width:210px}
#menu{position:absolute;z-index:5;background:var(--surface);border:1px solid var(--border);border-radius:10px;box-shadow:var(--shadow-card,0 8px 24px rgba(0,0,0,.18));width:240px;padding:8px;display:none}
#menu input[type=search]{width:100%;border:1px solid var(--border);border-radius:8px;background:var(--surface2);padding:5px 9px;font-size:13px;margin-bottom:6px}
#menu .acts{display:flex;gap:10px;font-size:12px;margin:0 2px 6px}
#menu .acts button{border:0;background:none;color:var(--text);cursor:pointer;padding:0;text-decoration:underline}
#menu .list{max-height:230px;overflow:auto}
#menu label{display:flex;gap:8px;align-items:center;font-size:13px;padding:3px 2px;cursor:pointer}
#menu label span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#menu label em{font-style:normal;color:var(--muted2);font-size:11.5px}

/* the sheet */
.sheet{background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden}
.sw{max-height:560px;overflow:auto;position:relative}
table.sh{border-collapse:separate;border-spacing:0;width:100%;font-size:13.5px;font-variant-numeric:tabular-nums}
table.sh th{position:sticky;top:0;z-index:2;background:var(--surface2);text-align:right;font-size:12px;font-weight:600;color:var(--muted);padding:8px 10px;border-bottom:1px solid var(--border);border-right:1px solid var(--border2);white-space:nowrap}
table.sh th.l,table.sh td.l{text-align:left}
table.sh td{padding:6px 10px;border-bottom:1px solid var(--border2);border-right:1px solid var(--border2);text-align:right;white-space:nowrap;background:var(--surface)}
table.sh td.n,table.sh th.n{width:34px;text-align:center;color:var(--muted2);font-size:11.5px;padding:6px 4px}
table.sh th.n{z-index:3}
table.sh tr.g td{background:var(--surface2);font-weight:600}
table.sh tr.g.zero td{font-weight:400;color:var(--muted2)}
table.sh td.pc{text-align:left;max-width:380px;overflow:hidden;text-overflow:ellipsis;padding-left:26px}
table.sh td.pc.flat{padding-left:10px}
table.sh td.pc small{display:block;color:var(--muted2);font-size:11.5px}
table.sh tbody tr:hover td{background:color-mix(in srgb,var(--hl) 45%,var(--surface))}
table.sh tr.g:hover td{background:color-mix(in srgb,var(--hl) 55%,var(--surface2))}
.sh button.so{border:0;background:none;cursor:pointer;color:inherit;font:inherit;padding:0}
.sel{border:1px solid transparent;background:transparent;border-radius:6px;padding:1px 2px;font-size:13px;max-width:150px;cursor:pointer}
.sel:hover,.sel:focus{border-color:var(--border);background:var(--surface)}
.sel:disabled{cursor:default;opacity:1;-webkit-appearance:none;appearance:none}
.exp{border:0;background:none;cursor:pointer;width:18px;color:var(--muted);padding:0}
.tag{font-size:11px;font-weight:600;border-radius:5px;padding:0 6px;margin-left:6px;background:var(--warn-bg);color:var(--warn);vertical-align:1px}
.catc{display:inline-block;font-size:12px;border-radius:999px;padding:1px 9px;background:var(--surface2);border:1px solid var(--border)}
.stat{display:flex;gap:6px 22px;flex-wrap:wrap;padding:9px 14px;border-top:1px solid var(--border);background:var(--surface2);font-size:12.5px;color:var(--muted)}
.stat b{color:var(--text)}

@container (max-width:900px){.grid3{grid-template-columns:1fr}.grid3>.card:not(.fit){contain:none;height:380px}}
@container (max-width:600px){.pg{padding-left:14px;padding-right:14px}.fwrap{margin:0 -14px 14px;padding-left:14px;padding-right:14px}#q{min-width:0;width:100%}}

/* phone: the page is under 600px wide. No boxes round the panels, a card per supplier instead of a table, the filters as one row
   that drops a panel down (Kate's phone rulings, 16 Oct 2026). */
.ph.pg{padding-left:14px;padding-right:14px}
.ph .fwrap{position:relative;top:auto;margin:0 -14px 10px;padding:6px 14px}  /* a second sticky bar would hang mid-list under the phone header: it scrolls (Kate, 23 Oct 2026) */
.ph .fhead{flex-wrap:nowrap}
.ph .fhead .fsum{font-size:12.5px}
.ph .fbtn,.ph .seg button,.ph .chips button{min-height:36px}
.ph .fbar2.ov{position:absolute;left:0;right:0;top:100%;margin:0;background:var(--bg);border-bottom:1px solid var(--border);box-shadow:0 18px 30px -18px rgba(0,0,0,.5);padding:12px 14px 14px;display:flex;flex-direction:column;align-items:stretch;gap:12px;max-height:calc(100vh - var(--topbar-cond-h,92px) - 70px);overflow:auto}
.ph .seg{display:flex;width:100%}
.ph .seg button{flex:1;padding:6px 4px}
.ph .fg2{display:flex;gap:8px}
.ph .fg2>*{flex:1}
.ph #q{width:100%;min-width:0;min-height:38px}
.ph #menu{left:8px!important;right:8px;width:auto}
.ph .fbtn.pri{background:var(--accent);color:var(--accent-fg);border-color:var(--accent);font-weight:600}
.ph .grid3{display:block}
.ph .grid3>.card:not(.fit){contain:none;height:auto}
.ph .grid3>.card{height:auto;border:0;border-radius:0;background:transparent;padding:14px 0;border-top:1px solid var(--border)}
.ph .grid3>.card:first-child{border-top:0;padding-top:4px}
.ph .pbody{overflow:visible;margin:0;padding:0}
.ph .capin{min-height:32px;width:70px}
.ph .capin.aed{width:84px}
.ph h2.s em{display:none}
details.how{margin:0 0 6px;font-size:13px;color:var(--muted)}
details.how summary{cursor:pointer;color:var(--text);font-weight:600;padding:6px 0}
.ph .sheet{border:0;border-radius:0;background:transparent;overflow:visible}
.ph .stat{background:transparent;border-top:1px solid var(--border);padding:10px 0}
.sc{border-top:1px solid var(--border);padding:12px 0}
.sc:first-child{border-top:0}
.sch{display:flex;justify-content:space-between;gap:10px;width:100%;border:0;background:none;padding:0;text-align:left;font-weight:600;font-size:15px;cursor:pointer;color:var(--text)}
.sch:disabled{cursor:default}
.scn{min-width:0;overflow-wrap:anywhere}
.scv{font-variant-numeric:tabular-nums;white-space:nowrap}
.scm{display:flex;gap:4px 10px;align-items:center;flex-wrap:wrap;margin-top:6px;font-size:12.5px;color:var(--muted)}
.scb{display:flex;gap:4px 14px;flex-wrap:wrap;margin-top:6px;font-size:12.5px;color:var(--muted);font-variant-numeric:tabular-nums}
.scb b,.scr b{color:var(--text);font-weight:600}
.scr{margin-top:4px;font-size:12.5px;color:var(--muted);font-variant-numeric:tabular-nums}
.sc.zero .scn{font-weight:400;color:var(--muted2)}
.spl{margin:10px 0 0 4px;border-left:2px solid var(--border);padding-left:12px}
.pcard{padding:9px 0;border-top:1px solid var(--border2)}
.pcard:first-child{border-top:0}
.pcn{font-size:14px;overflow-wrap:anywhere}
.pcs{font-size:11.5px;color:var(--muted2)}
.pcr{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:6px;flex-wrap:wrap}
.pcr b{font-variant-numeric:tabular-nums}
.ph .sel{border-color:var(--border);background:var(--surface);min-height:34px;max-width:100%}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
`;

  let host = null, root = null, D = null;
  let SUP = [], PR = [], FM = [], UW = [], PS = {}, COVER = [], CAPS = { salon: {}, cat: {}, sup: {}, fam: {} }, INC = {}, EDIT = false;
  const S = { phone: false, month: null, br: 'ALL', group: true, activeOnly: true, q: '', qraw: '', fSup: null, fCat: null, fPrio: null, fType: 'all', sort: { k: 'val', d: -1 }, open: {}, menu: null, fOpen: true, msg: '' };
  let loading = false;
  const isPhone = () => { const w = host ? host.getBoundingClientRect().width : 0; return w ? w < 600 : S.phone; };   // hidden (width 0) keeps what it was

  const $ = id => root.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const f = n => Math.round(n).toLocaleString('en-US');
  const p1 = x => (x * 100).toFixed(1) + '%';
  const bi = b => B.indexOf(b);
  // Priority: a tag someone saved wins; else the suggestion from spend (A = the first 80% of the last 4 months' spend in the branch, B = the next 15%).
  const sugOf = p => { const r = PS[p.key]; return r ? (r[S.br === 'ALL' ? 4 : bi(S.br)] || '') : ''; };
  const prEff = p => p.pr || sugOf(p);
  const scope = () => S.br === 'ALL' ? B : [S.br];
  const sumP = p => scope().reduce((a, b) => a + p.v[bi(b)], 0);
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  const dsh = () => '<span class="muted">-</span>';
  const dis = () => EDIT ? '' : ' disabled';
  const day = d => d ? new Date(d.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
  const monthLabel = (m, partial) => new Date(m + 'T00:00:00').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) + (partial ? ' so far' : '');
  const thisMonth = () => { const t = new Date(); return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-01'; };
  const incomeFor = bs => { let t = 0; for (const b of bs) { if (!INC[b]) return null; t += Number(INC[b]); } return t; };

  /* ---------- data in ---------- */
  function ingest(d) {
    D = d; S.month = d.month; EDIT = !!(d.access && d.access.edit);
    const byName = {};
    SUP = d.suppliers.map(s => (byName[s.n] = { n: s.n, cat: s.cat, inv: {} }));
    d.invoiced.forEach(r => { const s = byName[r.s]; if (s) s.inv[r.b] = Number(r.v); });
    const bs = d.brandsup || {}, pc = {}, pp = {};
    d.prodcat.forEach(r => { pc[r[0] + '\n' + r[1]] = r[2]; });
    (d.prodprio || []).forEach(r => { pp[r[0] + '\n' + r[1]] = r[2]; });
    PR = d.products.map((r, i) => {
      const def = (r[3] === 'Beauty' ? 'Beauty' : 'Hair') + (r[2] === 'retail' ? ' Retail' : ' Professional'), key = r[0] + '\n' + r[1];
      return { i, brand: r[0], p: r[1], key, def, c: pc[key] || def, pr: pp[key] || '', s: bs[r[0]] || 'Unassigned', v: [r[4], r[5], r[6], r[7]].map(Number), q: Number(r[8]) };
    });
    FM = (d.fam_months || []).map(r => ({ b: r[0], f: r[1], t: r[2], m: r[3], s: Number(r[4]), u: Number(r[5]) }));
    UW = (d.use_weeks || []).map(r => ({ b: r[0], f: r[1], t: r[2], w: r[3], s: Number(r[4]), u: Number(r[5]) }));
    PS = {}; (d.prio_sug || []).forEach(r => { PS[r[0] + '\n' + r[1]] = [r[2], r[3], r[4], r[5], r[6]]; });
    COVER = d.use_cover || [];
    CAPS = { salon: {}, cat: {}, sup: {}, fam: {} };
    d.caps.forEach(r => { if (CAPS[r[0]]) CAPS[r[0]][r[1]] = Number(r[2]); });
    INC = d.income || {};
  }
  async function load(month) {
    const { data, error } = await sb.rpc('spend_report', { p_month: month || null });
    if (error) throw error;
    return data;
  }
  async function save(kind, key, val) {
    S.msg = 'Saving...'; drawBar();
    const { error } = await sb.rpc('spend_set', { p_kind: kind, p_key: key, p_val: val == null ? null : String(val) });
    if (error) {
      console.error(error);
      S.msg = 'That change did not save. Showing what is saved.';
      try { ingest(await load(S.month)); } catch (e) { /* keep what is drawn */ }
      draw(); return;
    }
    S.msg = 'Saved'; drawBar();
    setTimeout(() => { if (S.msg === 'Saved') { S.msg = ''; drawBar(); } }, 2500);
  }

  /* ---------- the numbers ---------- */
  // Phorest: the categories a supplier's received products fall in, with the AED in each (null when it has none this month).
  function prodCats(name) {
    const o = {}; let t = 0;
    PR.forEach(p => { if (p.s === name) { const v = p.v.reduce((a, x) => a + x, 0); if (v) { o[p.c] = (o[p.c] || 0) + v; t += v; } } });
    return t ? o : null;
  }
  function figures() {
    const bs = scope(), out = { salon: {}, cat: {}, sup: {} };
    B.forEach(b => { out.salon[b] = 0; });
    PR.forEach(p => {
      B.forEach(b => { out.salon[b] += p.v[bi(b)]; });
      const v = sumP(p);
      if (v > 0) { out.cat[p.c] = (out.cat[p.c] || 0) + v; out.sup[p.s] = (out.sup[p.s] || 0) + v; }
    });
    return out;
  }
  const capIn = (kind, key, val, cls) => '<input class="capin ' + (cls || '') + '" type="number" min="0" step="' + (kind === 'sup' ? 500 : kind === 'fam' ? 100 : 0.5) + '" data-cap="' + kind + '|' + esc(key) + '" value="' + (val == null ? '' : val) + '" placeholder="cap" aria-label="Cap for ' + esc(key) + '"' + dis() + '>';
  function bar(ratio, capRatio) {
    const w = Math.max(0, Math.min(ratio, 1)) * 100, over = capRatio != null && ratio > capRatio;
    return '<div class="bar" aria-hidden="true"><i class="' + (capRatio == null ? 'neu' : over ? 'over' : '') + '" style="width:' + w.toFixed(1) + '%"></i>' + (capRatio != null ? '<b style="left:' + (Math.min(capRatio, 1) * 100).toFixed(1) + '%"></b>' : '') + '</div>';
  }

  function dash() {
    const F = figures(), bs = scope(), inS = incomeFor(bs);
    let h = '<div class="card fit"><div class="pt">Salon vs cap <span>% of net income</span></div><div class="pbody">';
    bs.forEach(b => {
      const v = F.salon[b], income = INC[b] ? Number(INC[b]) : null, cp = CAPS.salon[b] != null ? CAPS.salon[b] : DEFAULT_SALON_CAP;
      if (income) {
        const r = v / income, over = r > cp / 100;
        h += '<div class="prow"><div class="l1"><span class="pn">' + BN[b] + '</span><span class="pv">' + p1(r) + '</span></div>' + bar(r / 0.25, cp / 100 / 0.25) +
          '<div class="l2"><span>AED ' + f(v) + ' of ' + f(income) + '</span><span>' + (over ? '<span class="pill p-over" title="Over the cap by AED ' + f(v - cp / 100 * income) + '">Over ' + f(v - cp / 100 * income) + '</span>' : '<span class="pill p-ok" title="AED ' + f(cp / 100 * income - v) + ' left under the cap">' + f(cp / 100 * income - v) + ' left</span>') + ' cap ' + capIn('salon', b, cp) + '%</span></div></div>';
      } else {
        h += '<div class="prow"><div class="l1"><span class="pn">' + BN[b] + '</span><span class="pv">AED ' + f(v) + '</span></div><div class="l2"><span>No income on the dashboard for this month yet.</span></div></div>';
      }
    });
    h += '</div></div>';

    const cats = FIVE.concat(F.cat['Not sorted'] ? ['Not sorted'] : []);
    h += '<div class="card"><div class="pt">By category <span>AED, share of net income</span></div><div class="pbody">';
    cats.forEach(c => {
      const v = F.cat[c] || 0, cp = CAPS.cat[c], capAed = (cp != null && inS) ? cp / 100 * inS : null;
      const tot = cats.reduce((a, k) => a + (F.cat[k] || 0), 0), scale = capAed ? Math.max(capAed * 1.5, v) : Math.max(tot * 0.6, 1);
      h += '<div class="prow"><div class="l1"><span class="pn">' + c + '</span><span class="pv">' + (v ? f(v) : '<span class="muted">-</span>') + '</span></div>' + bar(v / scale, capAed ? capAed / scale : null) +
        '<div class="l2"><span>' + (inS && v ? p1(v / inS) + ' of income' : '') + '</span><span>' + (capAed ? (v > capAed ? '<span class="pill p-over">Over</span> ' : '<span class="pill p-ok">Within</span> ') : '') + (c === 'Not sorted' ? '' : 'cap ' + capIn('cat', c, cp) + '%') + '</span></div></div>';
    });
    h += '<div class="small muted" style="margin-top:8px">Consumables and most Beauty are not ordered through Phorest, so they only show here when Phorest has them. What Accounts paid for them is in the last section.</div></div></div>';

    h += '<div class="card"><div class="pt">Top suppliers <span>AED, cap in AED a month</span></div><div class="pbody">';
    const top = Object.keys(F.sup).map(k => [k, F.sup[k]]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, S.phone ? 8 : 12);
    const mx = top.length ? top[0][1] : 1;
    top.forEach(x => {
      const cp = CAPS.sup[x[0]], sc = cp ? Math.max(cp * 1.4, x[1]) : mx;
      h += '<div class="prow"><div class="l1"><span class="pn">' + esc(x[0]) + '</span><span class="pv">' + f(x[1]) + '</span></div>' + bar(x[1] / sc, cp ? cp / sc : null) +
        '<div class="l2"><span>' + (cp ? (x[1] > cp ? '<span class="pill p-over">Over by ' + f(x[1] - cp) + '</span>' : '<span class="pill p-ok">' + f(cp - x[1]) + ' left</span>') : '') + '</span><span>cap ' + capIn('sup', x[0], cp, 'aed') + '</span></div></div>';
    });
    if (!top.length) h += '<div class="small muted">No stock received in Phorest for this month.</div>';
    return h + '</div></div>';
  }

  /* ---------- Phorest: every supplier and its products ---------- */
  function supRows() {
    const groups = {}, q = S.q.toLowerCase();
    PR.forEach(p => { (groups[p.s] = groups[p.s] || { n: p.s, prods: [] }).prods.push(p); });
    const out = [];
    Object.keys(groups).forEach(k => {
      const g = groups[k]; if (S.fSup && !S.fSup[g.n]) return;
      const qs = q && g.n.toLowerCase().indexOf(q) >= 0;
      const ps = g.prods.filter(p => sumP(p) > 0 && (!S.fCat || S.fCat[p.c]) && (!S.fPrio || (prEff(p) || '-') === S.fPrio) && (!q || qs || (p.p + ' ' + p.brand).toLowerCase().indexOf(q) >= 0));
      if (!ps.length) return;
      const bv = scope().map(b => ps.reduce((a, p) => a + p.v[bi(b)], 0)), tot = bv.reduce((a, v) => a + v, 0);
      const cs = {}; ps.forEach(p => { cs[p.c] = (cs[p.c] || 0) + sumP(p); });
      out.push({ g, ps, bv, tot, cs });
    });
    const sk = S.sort.k, d = S.sort.d;
    out.sort((a, b) => sk === 'name' ? d * a.g.n.localeCompare(b.g.n) : (d * (a.tot - b.tot) || a.g.n.localeCompare(b.g.n)));
    return out;
  }
  const catSel = (val, attr) => '<select class="sel" ' + attr + ' aria-label="Category"' + dis() + '>' + ALLCATS.map(c => '<option' + (c === val ? ' selected' : '') + '>' + c + '</option>').join('') + '</select>';
  const supSel = (val, attr) => '<select class="sel" ' + attr + ' aria-label="Supplier" title="Moves every product of this brand"' + dis() + '>' + SUP.map(s => s.n).concat(['Unassigned']).map(c => '<option' + (c === val ? ' selected' : '') + '>' + esc(c) + '</option>').join('') + '</select>';
  const prioSel = (val, attr, sg) => '<select class="sel prio" ' + attr + ' aria-label="Priority"' + (sg && !val ? ' title="Suggested ' + sg + ' from spend. Pick A or B to keep your own."' : '') + dis() + '><option value="">' + (sg ? sg + '?' : '-') + '</option><option' + (val === 'A' ? ' selected' : '') + '>A</option><option' + (val === 'B' ? ' selected' : '') + '>B</option></select>';
  const catChip = cs => {
    const ks = Object.keys(cs).sort((a, b) => cs[b] - cs[a]), t = ks.reduce((a, c) => a + cs[c], 0);
    return '<span class="catc" title="' + esc(ks.map(c => c + ' ' + Math.round(cs[c] / t * 100) + '%').join(', ')) + '">' + ks[0] + (ks.length > 1 ? ' +' + (ks.length - 1) : '') + '</span>';
  };
  const prioCount = r => { const a = r.ps.filter(p => prEff(p) === 'A').length, b = r.ps.filter(p => prEff(p) === 'B').length; return (a ? 'A ' + a : '') + (a && b ? ' · ' : '') + (b ? 'B ' + b : ''); };
  const isOpenRow = (name, r, anyFilter) => !!S.open[name] || (anyFilter && r.ps.length > 0 && S.open[name] !== false);

  function sheetPhone() {
    const rows = supRows(), bs = scope(), anyFilter = !!(S.fSup || S.fCat || S.q), grand = rows.reduce((a, r) => a + r.tot, 0);
    const prodCard = (p, withSup) => '<div class="pcard"><div class="pcn">' + esc(p.p) + '</div><div class="pcs">' + esc(p.brand) + ' · qty ' + f(p.q) + '</div><div class="pcr">' +
      (withSup ? supSel(p.s, 'data-psup="' + p.i + '"') : '') + catSel(p.c, 'data-pcat="' + p.i + '"') + prioSel(p.pr, 'data-pprio="' + p.i + '"', sugOf(p)) + '<b>AED ' + f(sumP(p)) + '</b></div></div>';
    const supCard = (r, isOpen) => '<div class="sc"><button type="button" class="sch" data-exp="' + esc(r.g.n) + '" aria-expanded="' + isOpen + '"><span class="scn">' + (isOpen ? '▾ ' : '▸ ') + esc(r.g.n) +
      (r.g.n === 'Unassigned' ? '<span class="tag">no supplier yet</span>' : '') + '</span><span class="scv">' + f(r.tot) + '</span></button>' +
      '<div class="scm">' + catChip(r.cs) + '<span>' + r.ps.length + ' product lines' + (isOpen ? '' : ', tap to open') + '</span></div>' +
      (r.bv.some(Boolean) ? '<div class="scb">' + bs.map((b, i) => r.bv[i] ? '<span>' + b + ' <b>' + f(r.bv[i]) + '</b></span>' : '').join('') + '</div>' : '') +
      (isOpen ? '<div class="spl">' + r.ps.slice().sort((a, b) => sumP(b) - sumP(a)).map(p => prodCard(p, false)).join('') + '</div>' : '') + '</div>';
    let body = '', cnt = rows.length;
    if (S.group) body = rows.map(r => supCard(r, isOpenRow(r.g.n, r, anyFilter))).join('');
    else {
      const all = []; rows.forEach(r => r.ps.forEach(p => all.push(p)));
      all.sort((a, b) => S.sort.k === 'name' ? S.sort.d * (a.s + a.p).localeCompare(b.s + b.p) : S.sort.d * (sumP(a) - sumP(b)));
      cnt = all.length; body = all.map(p => prodCard(p, true)).join('');
    }
    if (!body) body = '<p class="msg">No stock received matches these filters.</p>';
    return '<div class="cards">' + body + '</div><div class="stat"><span><b>' + cnt + '</b> ' + (S.group ? 'suppliers' : 'product lines') + (anyFilter ? ' (filtered)' : '') + '</span><span>Received <b>AED ' + f(grand) + '</b></span></div>';
  }
  function sheet() {
    if (S.phone) return sheetPhone();
    const rows = supRows(), bs = scope(), anyFilter = !!(S.fSup || S.fCat || S.q), arrow = S.sort.d > 0 ? '▲' : '▼', grand = rows.reduce((a, r) => a + r.tot, 0);
    const supTh = '<button type="button" class="so" data-sort="name">Supplier ' + (S.sort.k === 'name' ? arrow : '') + '</button>';
    const th = '<tr><th class="n">#</th>' + (S.group ? '<th class="l" colspan="2">' + supTh + ' <span style="font-weight:400">and its products</span></th>' : '<th class="l">' + supTh + '</th><th class="l">Product</th>') +
      '<th class="l">Category</th><th class="l" title="A or B. A tag you set wins; a letter with a ? is the suggestion: A = the products that make the first 80% of spend over the last 4 months in the branch, B = the next 15%.">Prio</th>' + bs.map(b => '<th>' + b + '</th>').join('') + '<th><button type="button" class="so" data-sort="val">Received ' + (S.sort.k === 'val' ? arrow : '') + '</button></th></tr>';
    const prodCells = (p, withSup) => (withSup ? '<td class="l">' + supSel(p.s, 'data-psup="' + p.i + '"') + '</td>' : '') +
      '<td class="pc' + (withSup ? ' flat' : '') + '"' + (withSup ? '' : ' colspan="2"') + '><span title="' + esc(p.p) + '">' + esc(p.p) + '</span><small>' + esc(p.brand) + ' · qty ' + f(p.q) + '</small></td><td class="l">' + catSel(p.c, 'data-pcat="' + p.i + '"') + '</td><td class="l">' + prioSel(p.pr, 'data-pprio="' + p.i + '"', sugOf(p)) + '</td>' +
      bs.map(b => '<td>' + (p.v[bi(b)] ? f(p.v[bi(b)]) : dsh()) + '</td>').join('') + '<td>' + f(sumP(p)) + '</td>';
    let n = 0, cnt = rows.length, body;
    const groupRow = r => {
      n++;
      const isOpen = isOpenRow(r.g.n, r, anyFilter);
      return '<tr class="g"><td class="n">' + n + '</td><td class="l" colspan="2"><button type="button" class="exp" data-exp="' + esc(r.g.n) + '" aria-label="Show products" aria-expanded="' + isOpen + '">' + (isOpen ? '▾' : '▸') + '</button>' + esc(r.g.n) +
        (r.g.n === 'Unassigned' ? '<span class="tag">no supplier yet</span>' : '') + ' <span class="muted" style="font-weight:400;font-size:12px">' + r.ps.length + ' product lines</span></td><td class="l">' + catChip(r.cs) + '</td><td class="l muted">' + prioCount(r) + '</td>' +
        r.bv.map(v => '<td>' + (v ? f(v) : dsh()) + '</td>').join('') + '<td>' + f(r.tot) + '</td></tr>' +
        (isOpen ? r.ps.slice().sort((a, b) => sumP(b) - sumP(a)).map(p => '<tr class="pr"><td class="n"></td>' + prodCells(p, false) + '</tr>').join('') : '');
    };
    if (S.group) body = rows.map(groupRow).join('');
    else {
      const all = []; rows.forEach(r => r.ps.forEach(p => all.push(p)));
      all.sort((a, b) => S.sort.k === 'name' ? S.sort.d * (a.s + a.p).localeCompare(b.s + b.p) : S.sort.d * (sumP(a) - sumP(b)));
      cnt = all.length; body = all.map((p, i) => '<tr class="pr"><td class="n">' + (i + 1) + '</td>' + prodCells(p, true) + '</tr>').join('');
    }
    if (!body) body = '<tr><td colspan="' + (6 + bs.length) + '" class="l" style="padding:22px;color:var(--muted)">No stock received matches these filters.</td></tr>';
    const st = '<div class="stat"><span><b>' + cnt + '</b> ' + (S.group ? 'suppliers' : 'product lines') + (anyFilter ? ' (filtered)' : '') + '</span><span>Received <b>AED ' + f(grand) + '</b></span><span>' + monthLabel(S.month, D.partial) + ' · ' + (S.br === 'ALL' ? 'all branches' : BN[S.br]) + '</span></div>';
    return '<div class="sw"><table class="sh"><thead>' + th + '</thead><tbody>' + body + '</tbody></table></div>' + st;
  }

  /* ---------- Weekly spend by product family: what was USED (Phorest Product Usage x the Stock List cost), received beside it ---------- */
  // Family = Phorest's own Product Category. A week is Monday to Sunday and counts only once it is over (and inside the loaded usage).
  // The band is the lowest to the highest complete week BEFORE the chosen month; "this month" is the average of the complete weeks that
  // start inside it, so a family can sit above or below its usual band. A reference only: Mette decides the real min and max.
  const ymd = d => d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
  const utc = s => { const a = s.slice(0, 10).split('-').map(Number); return new Date(Date.UTC(a[0], a[1] - 1, a[2])); };
  const typeOk = t => S.fType === 'all' || t === S.fType;
  function famModel() {
    const bs = scope(), m0 = utc(S.month), m1 = new Date(Date.UTC(m0.getUTCFullYear(), m0.getUTCMonth() + 1, 1));
    const start = new Date(Date.UTC(m0.getUTCFullYear(), m0.getUTCMonth() - 3, 1));
    const lastDay = D.use_through ? utc(D.use_through) : null, endCap = new Date(m1.getTime() - 86400000);
    const through = lastDay && lastDay < endCap ? lastDay : endCap;
    // Mondays whose whole week (to Sunday) is inside the window and inside the loaded usage
    const weeks = [];
    let w = new Date(start); w.setUTCDate(w.getUTCDate() + ((8 - (w.getUTCDay() || 7)) % 7));
    for (; new Date(w.getTime() + 6 * 86400000) <= through; w = new Date(w.getTime() + 7 * 86400000)) weeks.push(ymd(w));
    const useOn = !!(D.use_through && weeks.length >= 4);
    const base = weeks.filter(k => k < S.month), cur = weeks.filter(k => k >= S.month);
    const by = {};
    UW.forEach(r => { if (bs.indexOf(r.b) < 0 || !typeOk(r.t)) return; const o = (by[r.f] = by[r.f] || { w: {} }); o.w[r.w] = (o.w[r.w] || 0) + r.s; });
    // received (monthly) as a weekly rate, the comparison column: the complete months in the window
    const months = []; for (let i = 3; i >= 0; i--) months.push(ymd(new Date(Date.UTC(m0.getUTCFullYear(), m0.getUTCMonth() - i, 1))));
    const dim = k => { const d = utc(k); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); };
    const partialDays = D.partial && D.orders_through ? utc(D.orders_through).getUTCDate() : null;
    const rec = {};
    FM.forEach(r => { if (bs.indexOf(r.b) < 0 || !typeOk(r.t)) return; const i = months.indexOf(r.m); if (i < 0) return; (rec[r.f] = rec[r.f] || months.map(() => 0))[i] += r.s; });
    const recWeeks = months.map(k => (k === S.month && partialDays != null ? partialDays : dim(k)) / 7);
    const recStat = arr => { let sp = 0, wk = 0; arr.forEach((v, i) => { if (!(months[i] === S.month && D.partial)) { sp += v; wk += recWeeks[i]; } }); return wk ? sp / wk : 0; };
    const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
    const stat = (name, o, capKey, recArr) => {
      let usual = 0, lo = 0, hi = 0, now = null, tot = 0;
      if (useOn) {
        const vb = base.map(k => o.w[k] || 0), vc = cur.map(k => o.w[k] || 0);
        usual = avg(vb) || 0; lo = vb.length ? Math.min.apply(null, vb) : 0; hi = vb.length ? Math.max.apply(null, vb) : 0; now = avg(vc);
        tot = weeks.reduce((a, k) => a + (o.w[k] || 0), 0);
      } else if (recArr) {
        const rate = recArr.map((v, i) => v / recWeeks[i]), ok = rate.filter((r, i) => recWeeks[i] >= 1);
        usual = recStat(recArr); lo = ok.length ? Math.min.apply(null, ok) : 0; hi = ok.length ? Math.max.apply(null, ok) : 0;
        now = recWeeks[3] >= 1 ? rate[3] : null; tot = recArr.reduce((a, v) => a + v, 0);
      }
      const cap = capKey ? CAPS.fam[S.br + '|' + name] : null;
      let st = '';
      if (now != null) st = cap != null ? (now > cap ? 'over' : 'ok') : (now > hi * 1.0001 ? 'above' : now < lo * 0.9999 ? 'below' : 'in');
      return { name, usual, lo, hi, cur: now, cap, st, tot, capKey, rec: recArr ? recStat(recArr) : null };
    };
    const names = {}; Object.keys(by).forEach(k => { names[k] = 1; }); Object.keys(rec).forEach(k => { names[k] = 1; });
    const rows = Object.keys(names).map(k => stat(k, by[k] || { w: {} }, true, rec[k] || months.map(() => 0))).filter(r => r.tot > 0 || r.rec > 0)
      .sort((a, b) => b.usual - a.usual || b.rec - a.rec);
    const top = rows.slice(0, 12), rest = rows.slice(12);
    const merge = list => { const o = { w: {} }; list.forEach(r => { const f = by[r.name]; if (f) Object.keys(f.w).forEach(k => { o.w[k] = (o.w[k] || 0) + f.w[k]; }); }); return o; };
    const sumRec = list => months.map((m, i) => list.reduce((a, r) => a + ((rec[r.name] || [])[i] || 0), 0));
    if (rest.length) top.push(stat('Other families (' + rest.length + ')', merge(rest), false, sumRec(rest)));
    return { rows: top, total: stat('All families together', merge(rows), false, sumRec(rows)), weeks, base, cur, useOn };
  }
  const famPill = r => r.st === 'over' ? '<span class="pill p-over">Over cap</span>' : r.st === 'ok' ? '<span class="pill p-ok">Within cap</span>' : r.st === 'above' ? '<span class="pill p-over">Above usual</span>' : r.st === 'below' ? '<span class="pill p-ok">Below usual</span>' : r.st === 'in' ? '<span class="pill p-ok">Usual</span>' : '<span class="muted">-</span>';
  function famSheet() {
    const M = famModel(), bs = scope();
    const seg = '<div class="stat" style="border-top:0;border-bottom:1px solid var(--border)"><span class="lab">Type</span><span class="seg">' + [['all', 'All'], ['professional', 'Professional'], ['retail', 'Retail']].map(x => '<button type="button" data-ftype="' + x[0] + '" aria-pressed="' + (S.fType === x[0]) + '">' + x[1] + '</button>').join('') + '</span></div>';
    if (!M.rows.length) return seg + '<p class="msg">Nothing used or received in these months for this selection.</p>';
    const cv = COVER.filter(c => bs.indexOf(c[0]) >= 0), usedA = cv.reduce((a, c) => a + Number(c[3]), 0), recA = cv.reduce((a, c) => a + Number(c[4]), 0);
    const note = '<div class="stat"><span>' + (M.useOn
      ? '<b>Used</b> is what staff took off the shelf in Phorest (Product Usage Details x the Stock List cost). Usual = the average complete week before ' + monthLabel(S.month, false) + ' (' + M.base.length + ' weeks), band = its lowest to highest week, this month = the average of ' + M.cur.length + ' complete weeks in it.'
      : 'Usage is not loaded for these weeks, so this shows what Phorest <b>received</b>: band = lowest to highest month as AED a week.') + '</span>' +
      '<span><b>Received</b> = stock booked in, as AED a week over the complete months. Over the 4 months: used AED ' + f(usedA) + ' against received AED ' + f(recA) + (D.use_through ? ', usage logged to ' + day(D.use_through) : '') + '. Phorest\'s usage report ends with Phorest.</span>' +
      '<span>The band is a reference from each family\'s own total, not the min and max. Usage dips when a product is out of stock, so Mette decides the real min and max and types it in Cap a week.</span></div>';
    const capCell = r => r.capKey ? capIn('fam', S.br + '|' + r.name, r.cap, 'aed') : '';
    if (S.phone) {
      const card = r => '<div class="sc"><div class="sch" style="cursor:default"><span class="scn">' + esc(r.name) + '</span><span class="scv">' + f(r.usual) + ' / wk</span></div>' +
        '<div class="scb"><span>Band <b>' + f(r.lo) + ' to ' + f(r.hi) + '</b></span><span>This month <b>' + (r.cur != null ? f(r.cur) : '-') + '</b></span><span>Received <b>' + (r.rec ? f(r.rec) : '-') + '</b></span></div><div class="scm">' + famPill(r) + (r.capKey ? '<span>cap ' + capCell(r) + ' a week</span>' : '') + '</div></div>';
      return seg + '<div class="cards">' + M.rows.map(card).join('') + card(M.total) + '</div>' + note;
    }
    const th = '<tr><th class="l">Product family</th><th>' + (M.useOn ? 'Used' : 'Received') + ' usual a week</th><th>Band a week</th><th>This month a week</th><th class="l">Against</th><th>Cap a week</th><th title="Stock booked in, AED a week over the complete months">Received a week</th></tr>';
    const row = (r, tot) => '<tr class="' + (tot ? 'g' : '') + '"><td class="l">' + esc(r.name) + '</td><td>' + f(r.usual) + '</td><td>' + f(r.lo) + ' to ' + f(r.hi) + '</td><td>' + (r.cur != null ? '<b>' + f(r.cur) + '</b>' : dsh()) + '</td><td class="l">' + famPill(r) + '</td><td>' + (r.capKey ? capCell(r) : '') + '</td><td>' + (r.rec ? f(r.rec) : dsh()) + '</td></tr>';
    return seg + '<div class="sw" style="max-height:none"><table class="sh"><thead>' + th + '</thead><tbody>' + M.rows.map(r => row(r, false)).join('') + row(M.total, true) + '</tbody></table></div>' + note;
  }

  /* ---------- Accounts: what was paid, per supplier (their monthly sheet; not part of the caps) ---------- */
  function acctRows() {
    const q = S.q.toLowerCase(), out = [];
    SUP.forEach(s => {
      if (S.fSup && !S.fSup[s.n]) return;
      if (q && s.n.toLowerCase().indexOf(q) < 0) return;
      const cs = prodCats(s.n);
      if (S.fCat && !(cs ? Object.keys(cs).some(c => S.fCat[c]) : S.fCat[s.cat])) return;
      const bv = scope().map(b => s.inv[b] || 0), tot = bv.reduce((a, v) => a + v, 0);
      if (S.activeOnly && !tot) return;
      out.push({ s, cs, bv, tot });
    });
    const sk = S.sort.k, d = S.sort.d;
    out.sort((a, b) => sk === 'name' ? d * a.s.n.localeCompare(b.s.n) : (d * (a.tot - b.tot) || a.s.n.localeCompare(b.s.n)));
    return out;
  }
  function acctSheet() {
    const rows = acctRows(), bs = scope(), arrow = S.sort.d > 0 ? '▲' : '▼', grand = rows.reduce((a, r) => a + r.tot, 0);
    const catCell = r => r.cs ? catChip(r.cs) : catSel(r.s.cat, 'data-supcat="' + esc(r.s.n) + '"');
    const st = '<div class="stat"><span><b>' + rows.length + '</b> suppliers' + (S.activeOnly ? ' with a payment' : '') + '</span><span>Paid <b>AED ' + f(grand) + '</b></span>' + (D.invoiced_loaded ? '<span>Accounts\' sheet loaded ' + day(D.invoiced_loaded) + '</span>' : '') + '</div>';
    if (S.phone) {
      const body = rows.map(r => '<div class="sc' + (!r.tot ? ' zero' : '') + '"><div class="sch" style="cursor:default"><span class="scn">' + esc(r.s.n) + '</span><span class="scv">' + (r.tot ? f(r.tot) : '-') + '</span></div>' +
        '<div class="scm">' + catCell(r) + '</div>' + (r.bv.some(Boolean) ? '<div class="scb">' + bs.map((b, i) => r.bv[i] ? '<span>' + b + ' <b>' + f(r.bv[i]) + '</b></span>' : '').join('') + '</div>' : '') + '</div>').join('');
      return '<div class="cards">' + (body || '<p class="msg">No suppliers match these filters.</p>') + '</div>' + st;
    }
    const th = '<tr><th class="n">#</th><th class="l"><button type="button" class="so" data-sort="name">Supplier ' + (S.sort.k === 'name' ? arrow : '') + '</button></th><th class="l">Category</th>' + bs.map(b => '<th>' + b + '</th>').join('') +
      '<th><button type="button" class="so" data-sort="val">Paid ' + (S.sort.k === 'val' ? arrow : '') + '</button></th></tr>';
    const body = rows.map((r, i) => '<tr><td class="n">' + (i + 1) + '</td><td class="l">' + esc(r.s.n) + '</td><td class="l">' + catCell(r) + '</td>' +
      r.bv.map(v => '<td>' + (v ? f(v) : dsh()) + '</td>').join('') + '<td><b>' + (r.tot ? f(r.tot) : '-') + '</b></td></tr>').join('');
    return '<div class="sw"><table class="sh"><thead>' + th + '</thead><tbody>' + (body || '<tr><td colspan="' + (4 + bs.length) + '" class="l" style="padding:22px;color:var(--muted)">No suppliers match these filters.</td></tr>') + '</tbody></table></div>' + st;
  }

  /* ---------- the one filter bar ---------- */
  const SHORT = { ALL: 'All', SAA: 'SAA', KCA: 'KCA', MC: 'MC', AQ: 'AQ' };
  function barPhone() {
    const nF = (S.fSup ? 1 : 0) + (S.fCat ? 1 : 0) + (S.fPrio ? 1 : 0) + (S.q ? 1 : 0), open = S.fOpen, cnt = o => o ? ' · ' + Object.keys(o).length : '';
    let h = '<div class="fhead"><button type="button" class="fbtn' + (nF ? ' on' : '') + '" data-ftoggle="1" aria-expanded="' + open + '">Filters' + (nF ? ' · ' + nF : '') + ' ' + (open ? '▴' : '▾') + '</button>' +
      '<span class="fsum">' + monthLabel(S.month, D.partial) + ' · ' + (S.br === 'ALL' ? 'All' : S.br) + '</span>' +
      (S.msg ? '<span class="fmsg" role="status">' + esc(S.msg) + '</span>' : '') + (nF ? '<button type="button" class="fbtn" data-clear="1">Clear</button>' : '') + '</div>';
    if (open) {
      h += '<div class="fbar2 ov"><div class="seg">' + (D.months || []).slice(0, 6).reverse().map(m => '<button type="button" data-m="' + m + '" aria-pressed="' + (m === S.month) + '">' + monthLabel(m, m === thisMonth()) + '</button>').join('') + '</div>' +
        '<div class="seg">' + ['ALL'].concat(B).map(b => '<button type="button" data-br="' + b + '" aria-pressed="' + (S.br === b) + '" title="' + (b === 'ALL' ? 'All branches' : BN[b]) + '">' + SHORT[b] + '</button>').join('') + '</div>' +
        '<div class="fg2"><button type="button" class="fbtn' + (S.fSup ? ' on' : '') + '" data-fmenu="sup">Supplier' + cnt(S.fSup) + ' ▾</button><button type="button" class="fbtn' + (S.fCat ? ' on' : '') + '" data-fmenu="cat">Category' + cnt(S.fCat) + ' ▾</button></div>' +
        '<input type="search" id="q" placeholder="Search supplier, product or brand" value="' + esc(S.qraw) + '" aria-label="Search the sheet">' +
        '<div class="seg">' + [['', 'Any priority'], ['A', 'A'], ['B', 'B'], ['-', 'None']].map(x => '<button type="button" data-prio="' + x[0] + '" aria-pressed="' + ((S.fPrio || '') === x[0]) + '">' + x[1] + '</button>').join('') + '</div>' +
        '<div class="seg"><button type="button" data-grp="1" aria-pressed="' + S.group + '">By supplier</button><button type="button" data-grp="0" aria-pressed="' + !S.group + '">Flat list</button></div>' +
        '<div class="seg"><button type="button" data-psort="val" aria-pressed="' + (S.sort.k === 'val') + '">Biggest first</button><button type="button" data-psort="name" aria-pressed="' + (S.sort.k === 'name') + '">A to Z</button></div>' +
        '<div class="chips"><button type="button" data-tgl="active" aria-pressed="' + S.activeOnly + '">Accounts: paid this month only</button></div>' +
        '<button type="button" class="fbtn pri" data-ftoggle="1">Done</button></div>';
    }
    return h;
  }
  function barHtml() {
    if (S.phone) return barPhone();
    const nF = (S.fSup ? 1 : 0) + (S.fCat ? 1 : 0) + (S.fPrio ? 1 : 0) + (S.q ? 1 : 0), open = S.fOpen;
    const cnt = o => o ? ' · ' + Object.keys(o).length : '';
    let h = '<div class="fhead"><button type="button" class="fbtn' + (nF ? ' on' : '') + '" data-ftoggle="1" aria-expanded="' + open + '">Filters' + (nF ? ' · ' + nF + ' on' : '') + ' ' + (open ? '▴' : '▾') + '</button>' +
      '<span class="fsum">' + monthLabel(S.month, D.partial) + ' · ' + (S.br === 'ALL' ? 'All branches' : BN[S.br]) + (S.fSup ? ' · ' + plural(Object.keys(S.fSup).length, 'supplier', 'suppliers') : '') + (S.fCat ? ' · ' + plural(Object.keys(S.fCat).length, 'category', 'categories') : '') + (S.q ? ' · "' + esc(S.q) + '"' : '') + '</span>' +
      (S.msg ? '<span class="fmsg" role="status">' + esc(S.msg) + '</span>' : '') + (nF ? '<button type="button" class="fbtn" data-clear="1">Clear</button>' : '') + '</div>';
    if (open) {
      h += '<div class="fbar2"><span class="fg"><span class="lab">Month</span><span class="seg">' +
        (D.months || []).slice(0, 6).reverse().map(m => '<button type="button" data-m="' + m + '" aria-pressed="' + (m === S.month) + '">' + monthLabel(m, m === thisMonth()) + '</button>').join('') + '</span></span>' +
        '<span class="fg chips"><span class="lab">Branch</span>' + ['ALL'].concat(B).map(b => '<button type="button" data-br="' + b + '" aria-pressed="' + (S.br === b) + '">' + (b === 'ALL' ? 'All' : BN[b]) + '</button>').join('') + '</span>' +
        '<span class="fg"><span class="lab">Show</span><button type="button" class="fbtn' + (S.fSup ? ' on' : '') + '" data-fmenu="sup">Supplier' + cnt(S.fSup) + ' ▾</button><button type="button" class="fbtn' + (S.fCat ? ' on' : '') + '" data-fmenu="cat">Category' + cnt(S.fCat) + ' ▾</button>' +
        '<input type="search" id="q" placeholder="Search supplier, product or brand" value="' + esc(S.qraw) + '" aria-label="Search the sheet"></span>' +
        '<span class="fg chips"><span class="lab">Priority</span>' + [['', 'Any'], ['A', 'A'], ['B', 'B'], ['-', 'None']].map(x => '<button type="button" data-prio="' + x[0] + '" aria-pressed="' + ((S.fPrio || '') === x[0]) + '">' + x[1] + '</button>').join('') + '</span>' +
        '<span class="fg chips"><button type="button" data-tgl="group" aria-pressed="' + S.group + '" title="On: open a supplier to see its products. Off: a flat list where you can move a brand to another supplier. Applies to the Phorest sheet.">Group by supplier</button><button type="button" data-tgl="active" aria-pressed="' + S.activeOnly + '" title="Accounts section: hide suppliers with nothing paid this month">Paid this month only</button></span></div>';
    }
    return h;
  }
  const drawBar = () => { const b = root && $('fbar'); if (b) b.innerHTML = barHtml(); };
  function drawBody() {
    const d = $('dash'), s = $('sheet'), a = $('acct'), fm = $('fam'); if (!d || !s || !a || !fm) return;
    const tops = [].map.call(d.querySelectorAll('.pbody'), x => x.scrollTop);
    d.innerHTML = dash();
    [].forEach.call(d.querySelectorAll('.pbody'), (x, i) => { x.scrollTop = tops[i] || 0; });
    const keep = el => { const sc = el.querySelector('.sw'); return sc ? [sc.scrollTop, sc.scrollLeft] : [0, 0]; };
    const k1 = keep(s), k2 = keep(a);
    s.innerHTML = sheet(); a.innerHTML = acctSheet(); fm.innerHTML = famSheet();
    const n1 = s.querySelector('.sw'), n2 = a.querySelector('.sw');
    if (n1) { n1.scrollTop = k1[0]; n1.scrollLeft = k1[1]; }
    if (n2) { n2.scrollTop = k2[0]; n2.scrollLeft = k2[1]; }
  }
  function draw() {
    const note = [];
    if (D.orders_through) note.push('stock received to ' + day(D.orders_through));
    if (D.income_through) note.push('income to ' + day(D.income_through));
    const how = '<b>Spend here is what Phorest received on stock orders</b> in the month (booked in, at the Stock List cost), so every line has its product, category and branch. It does not include consumables or most beauty. The caps, panels and the first sheet use only this. <b>What Accounts paid</b> is its own section at the bottom: their monthly sheet follows payments, not invoice dates, so read it as cash out, not as spend. The filters above apply to both.' +
      (D.partial ? ' <b>Month to date</b>: ' + esc(note.join(', ')) + '.' : ' ' + esc(note.join(', ').replace(/^./, c => c.toUpperCase())) + '.');
    $('pg').className = 'pg' + (S.phone ? ' ph' : '');
    $('pg').innerHTML = '<div class="fwrap" id="fwrap"><div id="fbar">' + barHtml() + '</div><div id="menu" role="dialog" aria-label="Filter"></div></div>' +
      (S.phone ? '<details class="how"><summary>How this is worked out</summary><p class="basisnote">' + how + '</p></details>' : '<p class="basisnote">' + how + '</p>') +
      '<div class="grid3" id="dash"></div><h2 class="s">Weekly spend by product family <em>what Phorest says was used, with what was received beside it, as AED a week' + (EDIT ? ', set a cap a week' : '') + '</em></h2><div class="sheet" id="fam"></div><h2 class="s">Every supplier and its products <em>Phorest, received in the month' + (EDIT ? ', change a Category cell to tag it' : ' (view only)') + '</em></h2><div class="sheet" id="sheet"></div>' +
      '<h2 class="s">What Accounts paid, per supplier <em>from their monthly sheet, not part of the caps</em></h2><div class="sheet" id="acct"></div>';
    S.menu = null;
    drawBody();
  }

  /* ---------- filter menus (a value list, like a sheet's column filter) ---------- */
  function menuValues(k) {
    const vals = {};
    if (k === 'sup') { SUP.forEach(s => { vals[s.n] = 0; }); vals['Unassigned'] = 0; PR.forEach(p => { if (vals[p.s] != null) vals[p.s]++; }); }
    else { ALLCATS.forEach(c => { vals[c] = 0; }); PR.forEach(p => { if (vals[p.c] != null) vals[p.c]++; }); }
    return Object.keys(vals).sort().map(v => [v, vals[v]]);
  }
  function renderMenu(filter) {
    const m = $('menu'), k = S.menu, cur = k === 'sup' ? S.fSup : S.fCat;
    const list = menuValues(k).filter(v => !filter || v[0].toLowerCase().indexOf(filter.toLowerCase()) >= 0);
    m.innerHTML = '<input type="search" id="mq" placeholder="Search values" value="' + esc(filter) + '" aria-label="Search values"><div class="acts"><button type="button" data-mall="1">Select all</button><button type="button" data-mnone="1">Clear</button></div><div class="list">' +
      list.map(v => '<label><input type="checkbox" data-mv="' + esc(v[0]) + '"' + (!cur || cur[v[0]] ? ' checked' : '') + '><span>' + esc(v[0]) + '</span>' + (v[1] ? '<em>' + v[1] + '</em>' : '') + '</label>').join('') + '</div>';
    if (filter) { const q = $('mq'); q.focus(); q.setSelectionRange(filter.length, filter.length); }
  }
  function openMenu(k, btn) {
    const m = $('menu'), r = btn.getBoundingClientRect(), pr = $('fwrap').getBoundingClientRect();
    S.menu = k; m.style.display = 'block'; m.style.left = Math.max(8, Math.min(r.left - pr.left, pr.width - 250)) + 'px'; m.style.top = (r.bottom - pr.top + 6) + 'px';
    renderMenu('');
  }
  function closeMenu() { if (!root) return; const m = $('menu'); if (m) m.style.display = 'none'; S.menu = null; }
  const setFilter = (k, v) => { if (k === 'sup') S.fSup = v; else S.fCat = v; };

  /* ---------- events ---------- */
  async function switchMonth(m) {
    if (loading) return; loading = true;
    try { ingest(await load(m)); S.open = {}; draw(); }
    catch (e) { console.error(e); S.msg = 'That month did not load.'; drawBar(); }
    loading = false;
  }
  function wire() {
    root.addEventListener('click', e => {
      const t = e.target, up = sel => t.closest(sel);
      let el;
      if (!up('#menu') && !up('[data-fmenu]')) closeMenu();
      if (up('[data-ftoggle]')) { S.fOpen = !S.fOpen; closeMenu(); drawBar(); return; }
      if ((el = up('[data-m]'))) { switchMonth(el.getAttribute('data-m')); return; }
      if ((el = up('[data-br]'))) { S.br = el.getAttribute('data-br'); drawBar(); drawBody(); return; }
      if ((el = up('[data-tgl]'))) { if (el.getAttribute('data-tgl') === 'group') S.group = !S.group; else S.activeOnly = !S.activeOnly; drawBar(); drawBody(); return; }
      if (up('[data-clear]')) { S.fSup = null; S.fCat = null; S.fPrio = null; S.q = ''; S.qraw = ''; closeMenu(); drawBar(); drawBody(); return; }
      if ((el = up('[data-prio]'))) { S.fPrio = el.getAttribute('data-prio') || null; drawBar(); drawBody(); return; }
      if ((el = up('[data-ftype]'))) { S.fType = el.getAttribute('data-ftype'); drawBody(); return; }
      if ((el = up('[data-grp]'))) { S.group = el.getAttribute('data-grp') === '1'; drawBar(); drawBody(); return; }
      if ((el = up('[data-psort]'))) { const k = el.getAttribute('data-psort'); S.sort = { k, d: k === 'name' ? 1 : -1 }; drawBar(); drawBody(); return; }
      if ((el = up('[data-exp]'))) { const n = el.getAttribute('data-exp'); S.open[n] = !(S.open[n] || ((S.fSup || S.fCat || S.q) && S.open[n] !== false)); drawBody(); return; }
      if ((el = up('[data-sort]'))) { const k = el.getAttribute('data-sort'); S.sort = S.sort.k === k ? { k, d: -S.sort.d } : { k, d: k === 'name' ? 1 : -1 }; drawBody(); return; }
      if ((el = up('[data-fmenu]'))) { const k = el.getAttribute('data-fmenu'); if (S.menu === k) closeMenu(); else openMenu(k, el); return; }
      if (up('[data-mall]')) { setFilter(S.menu, null); renderMenu($('mq').value); drawBar(); drawBody(); return; }
      if (up('[data-mnone]')) { setFilter(S.menu, {}); renderMenu($('mq').value); drawBar(); drawBody(); return; }
    });
    root.addEventListener('change', e => {
      const t = e.target;
      if (t.matches('[data-mv]')) {
        const k = S.menu, vals = menuValues(k).map(x => x[0]);
        let cur = Object.assign({}, (k === 'sup' ? S.fSup : S.fCat) || vals.reduce((a, x) => { a[x] = 1; return a; }, {}));
        if (t.checked) cur[t.getAttribute('data-mv')] = 1; else delete cur[t.getAttribute('data-mv')];
        setFilter(k, Object.keys(cur).length === vals.length ? null : cur); drawBar(); drawBody(); return;
      }
      if (!EDIT) return;
      if (t.matches('[data-cap]')) {
        const [kind, key] = [t.getAttribute('data-cap').split('|')[0], t.getAttribute('data-cap').split('|').slice(1).join('|')];
        const val = t.value === '' ? null : Math.max(0, parseFloat(t.value));
        if (val == null) delete CAPS[kind][key]; else CAPS[kind][key] = val;
        drawBody(); save('cap', kind + '|' + key, val); return;
      }
      if (t.matches('[data-pprio]')) { const p = PR[+t.getAttribute('data-pprio')]; p.pr = t.value === '-' ? '' : t.value; drawBody(); save('prodprio', p.key, p.pr || null); return; }
      if (t.matches('[data-pcat]')) { const p = PR[+t.getAttribute('data-pcat')]; p.c = t.value; drawBody(); save('prodcat', p.key, t.value === p.def ? null : t.value); return; }
      if (t.matches('[data-psup]')) { const p = PR[+t.getAttribute('data-psup')]; PR.forEach(x => { if (x.brand === p.brand) x.s = t.value; }); drawBody(); save('brandsup', p.brand, t.value); return; }
      if (t.matches('[data-supcat]')) { const s = SUP.find(x => x.n === t.getAttribute('data-supcat')); if (s) { s.cat = t.value; drawBody(); save('supcat', s.n, t.value); } }
    });
    root.addEventListener('input', e => {
      if (e.target.id === 'q') { S.qraw = e.target.value; S.q = e.target.value.trim(); drawBody(); const pos = e.target.selectionStart; drawBar(); const q = $('q'); if (q) { q.focus(); q.setSelectionRange(pos, pos); } }
      if (e.target.id === 'mq') renderMenu(e.target.value);
    });
    root.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
    document.addEventListener('click', e => { if (root && !e.composedPath().includes(host)) closeMenu(); });
  }

  window.renderSpend = async function renderSpend() {
    host = document.getElementById('spendContent');
    if (!host) return;
    if (!root) {
      root = host.attachShadow({ mode: 'open' });
      root.innerHTML = '<style>' + CSS + '</style><div class="stage"><div class="pg" id="pg"></div></div>';
      wire();
      S.phone = isPhone(); S.fOpen = !S.phone;
      new ResizeObserver(() => requestAnimationFrame(() => { const p = isPhone(); if (p !== S.phone && D) { S.phone = p; S.fOpen = !p; draw(); } })).observe(host);
    }
    S.phone = isPhone();
    $('pg').innerHTML = '<p class="msg">Loading supplier spend…</p>';
    try {
      const d = await load(S.month);
      if (d && d.denied) { $('pg').innerHTML = '<p class="msg">This page is for Accounts and Admin. Ask Kate if you need it.</p>'; return; }
      ingest(d);
    } catch (e) {
      console.error(e);
      $('pg').innerHTML = '<p class="msg">Supplier spend didn\'t load. Refresh to try again.</p>';
      return;
    }
    draw();
  };
})();
