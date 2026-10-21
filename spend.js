// Stock and Supplier Spend (Kate, 21 Oct 2026): every supplier Accounts pays, the products Phorest received under it,
// sorted into the five categories, with each branch, category and supplier read against its cap.
//
// One source for every number: what suppliers invoiced (Accounts' Supplier Balance files, loaded by
// scripts/spend/load_supplier_months.py into spend_invoiced). An invoice has no category, so a supplier's amount is
// split by the products received under it (stock_order_lines); the Phorest column in the sheet is that detail only.
// Income for the percentages is the dashboard's own (phorest_staff_daily TOTAL, ex VAT).
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
.grid3>.card{display:flex;flex-direction:column;height:440px;min-width:0}
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
.fwrap{position:sticky;top:var(--topbar-cond-h,104px);z-index:40;background:var(--bg);margin:0 -28px 14px;padding:8px 28px 10px;border-bottom:1px solid var(--border)}
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

@container (max-width:900px){.grid3{grid-template-columns:1fr}}
@container (max-width:600px){.pg{padding-left:14px;padding-right:14px}.fwrap{margin:0 -14px 14px;padding-left:14px;padding-right:14px}#q{min-width:0;width:100%}}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
`;

  let host = null, root = null, D = null;
  let SUP = [], PR = [], CAPS = { salon: {}, cat: {}, sup: {} }, INC = {}, EDIT = false;
  const S = { month: null, br: 'ALL', group: true, activeOnly: true, q: '', qraw: '', fSup: null, fCat: null, sort: { k: 'val', d: -1 }, open: {}, menu: null, fOpen: true, msg: '' };
  let loading = false;

  const $ = id => root.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const f = n => Math.round(n).toLocaleString('en-US');
  const p1 = x => (x * 100).toFixed(1) + '%';
  const bi = b => B.indexOf(b);
  const scope = () => S.br === 'ALL' ? B : [S.br];
  const sumP = p => scope().reduce((a, b) => a + p.v[bi(b)], 0);
  const sumInv = s => scope().reduce((a, b) => a + (s.inv[b] || 0), 0);
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
    const bs = d.brandsup || {}, pc = {};
    d.prodcat.forEach(r => { pc[r[0] + '\n' + r[1]] = r[2]; });
    PR = d.products.map((r, i) => {
      const def = (r[3] === 'Beauty' ? 'Beauty' : 'Hair') + (r[2] === 'retail' ? ' Retail' : ' Professional'), key = r[0] + '\n' + r[1];
      return { i, brand: r[0], p: r[1], key, def, c: pc[key] || def, s: bs[r[0]] || 'Unassigned', v: [r[4], r[5], r[6], r[7]].map(Number), q: Number(r[8]) };
    });
    CAPS = { salon: {}, cat: {}, sup: {} };
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
  // An invoice has no category, so a supplier's amount is split by the products received under it.
  function splitOf(name, bs) {
    const s = SUP.find(x => x.n === name), ps = PR.filter(p => p.s === name);
    const weights = list => { const o = {}; let t = 0; ps.forEach(p => { const v = list.reduce((a, b) => a + p.v[bi(b)], 0); if (v) { o[p.c] = (o[p.c] || 0) + v; t += v; } }); return [o, t]; };
    let r = weights(bs); if (!r[1]) r = weights(B);
    if (!r[1]) { const o = {}; o[s ? s.cat : 'Not sorted'] = 1; return o; }
    const out = {}; Object.keys(r[0]).forEach(c => { out[c] = r[0][c] / r[1]; }); return out;
  }
  function figures() {
    const bs = scope(), out = { salon: {}, cat: {}, sup: {}, outside: 0 };
    B.forEach(b => { out.salon[b] = 0; });
    SUP.forEach(s => {
      const sp = splitOf(s.n, bs), tot = sumInv(s), keep = 1 - (sp['Outside the 5'] || 0);
      B.forEach(b => { out.salon[b] += (s.inv[b] || 0) * keep; });
      Object.keys(sp).forEach(c => { const v = tot * sp[c]; if (c === 'Outside the 5') out.outside += v; else out.cat[c] = (out.cat[c] || 0) + v; });
      if (tot * keep > 0) out.sup[s.n] = tot * keep;
    });
    return out;
  }
  const capIn = (kind, key, val, cls) => '<input class="capin ' + (cls || '') + '" type="number" min="0" step="' + (kind === 'sup' ? 500 : 0.5) + '" data-cap="' + kind + '|' + esc(key) + '" value="' + (val == null ? '' : val) + '" placeholder="cap" aria-label="Cap for ' + esc(key) + '"' + dis() + '>';
  function bar(ratio, capRatio) {
    const w = Math.max(0, Math.min(ratio, 1)) * 100, over = capRatio != null && ratio > capRatio;
    return '<div class="bar" aria-hidden="true"><i class="' + (capRatio == null ? 'neu' : over ? 'over' : '') + '" style="width:' + w.toFixed(1) + '%"></i>' + (capRatio != null ? '<b style="left:' + (Math.min(capRatio, 1) * 100).toFixed(1) + '%"></b>' : '') + '</div>';
  }

  function dash() {
    const F = figures(), bs = scope(), inS = incomeFor(bs);
    let h = '<div class="card"><div class="pt">Salon vs cap <span>% of net income</span></div><div class="pbody">';
    bs.forEach(b => {
      const v = F.salon[b], income = INC[b] ? Number(INC[b]) : null, cp = CAPS.salon[b] != null ? CAPS.salon[b] : DEFAULT_SALON_CAP;
      if (income) {
        const r = v / income, over = r > cp / 100;
        h += '<div class="prow"><div class="l1"><span class="pn">' + BN[b] + '</span><span class="pv">' + p1(r) + '</span></div>' + bar(r / 0.25, cp / 100 / 0.25) +
          '<div class="l2"><span>AED ' + f(v) + ' of ' + f(income) + '</span><span>' + (over ? '<span class="pill p-over">Over by AED ' + f(v - cp / 100 * income) + '</span>' : '<span class="pill p-ok">AED ' + f(cp / 100 * income - v) + ' left</span>') + ' cap ' + capIn('salon', b, cp) + '%</span></div></div>';
      } else {
        h += '<div class="prow"><div class="l1"><span class="pn">' + BN[b] + '</span><span class="pv">AED ' + f(v) + '</span></div><div class="l2"><span>No income on the dashboard for this month yet.</span></div></div>';
      }
    });
    if (F.outside) h += '<div class="small muted" style="margin-top:8px">Not counted: AED ' + f(F.outside) + ' from suppliers outside the 5 (accountants, insurance and similar).</div>';
    h += '</div></div>';

    const cats = FIVE.concat(['Not sorted']);
    h += '<div class="card"><div class="pt">By category <span>AED, share of net income</span></div><div class="pbody">';
    cats.forEach(c => {
      const v = F.cat[c] || 0, cp = CAPS.cat[c], capAed = (cp != null && inS) ? cp / 100 * inS : null;
      const tot = cats.reduce((a, k) => a + (F.cat[k] || 0), 0), scale = capAed ? Math.max(capAed * 1.5, v) : Math.max(tot * 0.6, 1);
      h += '<div class="prow"><div class="l1"><span class="pn">' + c + '</span><span class="pv">' + (v ? f(v) : '<span class="muted">-</span>') + '</span></div>' + bar(v / scale, capAed ? capAed / scale : null) +
        '<div class="l2"><span>' + (inS && v ? p1(v / inS) + ' of income' : '') + '</span><span>' + (capAed ? (v > capAed ? '<span class="pill p-over">Over</span> ' : '<span class="pill p-ok">Within</span> ') : '') + (c === 'Not sorted' ? '' : 'cap ' + capIn('cat', c, cp) + '%') + '</span></div></div>';
    });
    h += '<div class="small muted" style="margin-top:8px">A supplier with products in two categories is split by what was received (for example DBD). Suppliers not sorted yet show under Not sorted.</div></div></div>';

    h += '<div class="card"><div class="pt">Top suppliers <span>AED, cap in AED a month</span></div><div class="pbody">';
    const top = Object.keys(F.sup).map(k => [k, F.sup[k]]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 12);
    const mx = top.length ? top[0][1] : 1;
    top.forEach(x => {
      const cp = CAPS.sup[x[0]], sc = cp ? Math.max(cp * 1.4, x[1]) : mx;
      h += '<div class="prow"><div class="l1"><span class="pn">' + esc(x[0]) + '</span><span class="pv">' + f(x[1]) + '</span></div>' + bar(x[1] / sc, cp ? cp / sc : null) +
        '<div class="l2"><span>' + (cp ? (x[1] > cp ? '<span class="pill p-over">Over by ' + f(x[1] - cp) + '</span>' : '<span class="pill p-ok">' + f(cp - x[1]) + ' left</span>') : '') + '</span><span>cap ' + capIn('sup', x[0], cp, 'aed') + '</span></div></div>';
    });
    if (!top.length) h += '<div class="small muted">No invoices loaded for this month.</div>';
    return h + '</div></div>';
  }

  /* ---------- the sheet ---------- */
  function supRows() {
    const groups = {}, q = S.q.toLowerCase();
    SUP.forEach(s => { groups[s.n] = { n: s.n, s, prods: [] }; });
    PR.forEach(p => { if (!groups[p.s]) groups[p.s] = { n: p.s, s: { n: p.s, cat: 'Not sorted', inv: {} }, prods: [] }; groups[p.s].prods.push(p); });
    const out = [];
    Object.keys(groups).forEach(k => {
      const g = groups[k]; if (S.fSup && !S.fSup[g.n]) return;
      const sp = splitOf(g.n, scope()), cats = Object.keys(sp);
      const share = S.fCat ? cats.reduce((a, c) => a + (S.fCat[c] ? sp[c] : 0), 0) : 1;
      const hasProds = g.prods.some(p => p.v.some(Boolean));
      const qs = q && g.n.toLowerCase().indexOf(q) >= 0;
      const ps = g.prods.filter(p => p.v.some(Boolean) && (!S.fCat || S.fCat[p.c]) && (!q || qs || (p.p + ' ' + p.brand).toLowerCase().indexOf(q) >= 0));
      const show = hasProds ? ps.length > 0 : ((!q || qs) && (!S.fCat || share > 0));
      if (!show) return;
      const rec = ps.reduce((a, p) => a + sumP(p), 0), inv = sumInv(g.s) * share;
      if (S.activeOnly && !inv && !rec) return;
      out.push({ g, sp, cats, ps, rec, inv, hasProds, bv: scope().map(b => (g.s.inv[b] || 0) * share) });
    });
    const sk = S.sort.k, d = S.sort.d;
    out.sort((a, b) => sk === 'name' ? d * a.g.n.localeCompare(b.g.n) : (d * (a.inv - b.inv) || d * (a.rec - b.rec) || a.g.n.localeCompare(b.g.n)));
    return out;
  }
  const catSel = (val, attr) => '<select class="sel" ' + attr + ' aria-label="Category"' + dis() + '>' + ALLCATS.map(c => '<option' + (c === val ? ' selected' : '') + '>' + c + '</option>').join('') + '</select>';
  const supSel = (val, attr) => '<select class="sel" ' + attr + ' aria-label="Supplier" title="Moves every product of this brand"' + dis() + '>' + SUP.map(s => s.n).concat(['Unassigned']).map(c => '<option' + (c === val ? ' selected' : '') + '>' + esc(c) + '</option>').join('') + '</select>';

  function sheet() {
    const rows = supRows(), bs = scope(), anyFilter = !!(S.fSup || S.fCat || S.q), arrow = S.sort.d > 0 ? '▲' : '▼';
    const sumInvT = rows.reduce((a, r) => a + r.inv, 0), sumRec = rows.reduce((a, r) => a + r.rec, 0);
    const supTh = '<button type="button" class="so" data-sort="name">Supplier ' + (S.sort.k === 'name' ? arrow : '') + '</button>';
    const th = '<tr><th class="n">#</th>' + (S.group ? '<th class="l" colspan="2">' + supTh + ' <span style="font-weight:400">and its products</span></th>' : '<th class="l">' + supTh + '</th><th class="l">Product</th>') +
      '<th class="l">Category</th>' + bs.map(b => '<th>' + b + '</th>').join('') +
      '<th><button type="button" class="so" data-sort="val">Invoiced ' + (S.sort.k === 'val' ? arrow : '') + '</button></th><th title="What arrived on Phorest stock orders in the month, at the Stock List cost. Product detail only.">Received (Phorest)</th></tr>';
    const catCell = r => {
      if (!r.hasProds) return catSel(r.g.s.cat, 'data-supcat="' + esc(r.g.n) + '"');
      const ks = r.cats.slice().sort((a, b) => r.sp[b] - r.sp[a]);
      const tip = ks.map(c => c + ' ' + Math.round(r.sp[c] * 100) + '%').join(', ');
      return '<span class="catc" title="Split by products received: ' + esc(tip) + '">' + ks[0] + (ks.length > 1 ? ' +' + (ks.length - 1) : '') + '</span>';
    };
    const prodCells = (p, withSup) =>
      (withSup ? '<td class="l">' + supSel(p.s, 'data-psup="' + p.i + '"') + '</td>' : '') +
      '<td class="pc' + (withSup ? ' flat' : '') + '"' + (withSup ? '' : ' colspan="2"') + '><span title="' + esc(p.p) + '">' + esc(p.p) + '</span><small>' + esc(p.brand) + ' · qty ' + f(p.q) + '</small></td><td class="l">' + catSel(p.c, 'data-pcat="' + p.i + '"') + '</td>' +
      bs.map(() => '<td>' + dsh() + '</td>').join('') + '<td>' + dsh() + '</td><td>' + f(sumP(p)) + '</td>';
    let n = 0, cnt = 0, body;
    const groupRow = r => {
      n++; cnt++;
      const isOpen = !!S.open[r.g.n] || (anyFilter && r.ps.length > 0 && S.open[r.g.n] !== false);
      return '<tr class="g' + (!r.rec && !r.inv ? ' zero' : '') + '"><td class="n">' + n + '</td><td class="l" colspan="2">' +
        (r.ps.length ? '<button type="button" class="exp" data-exp="' + esc(r.g.n) + '" aria-label="Show products" aria-expanded="' + isOpen + '">' + (isOpen ? '▾' : '▸') + '</button>' : '<span class="exp" style="display:inline-block"></span>') + esc(r.g.n) +
        (r.g.n === 'Unassigned' ? '<span class="tag">no supplier yet</span>' : '') +
        (r.ps.length ? ' <span class="muted" style="font-weight:400;font-size:12px">' + r.ps.length + ' product lines</span>' : '') + (r.hasProds ? '' : ' <span class="muted" style="font-weight:400;font-size:12px"><i>whole supplier, no product list yet</i></span>') +
        '</td><td class="l">' + catCell(r) + '</td>' + r.bv.map(v => '<td>' + (v ? f(v) : dsh()) + '</td>').join('') +
        '<td>' + (r.inv ? f(r.inv) : dsh()) + '</td><td>' + (r.rec ? f(r.rec) : dsh()) + '</td></tr>' +
        (isOpen ? r.ps.slice().sort((a, b) => sumP(b) - sumP(a)).map(p => '<tr class="pr"><td class="n"></td>' + prodCells(p, false) + '</tr>').join('') : '');
    };
    if (S.group) body = rows.map(groupRow).join('');
    else {
      const all = [];
      rows.forEach(r => { if (r.ps.length) r.ps.forEach(p => all.push({ p, r })); else all.push({ r }); });
      all.sort((a, b) => S.sort.d * ((a.p ? sumP(a.p) : a.r.inv) - (b.p ? sumP(b.p) : b.r.inv)));
      cnt = all.length;
      body = all.map((x, i) => x.p ? '<tr class="pr"><td class="n">' + (i + 1) + '</td>' + prodCells(x.p, true) + '</tr>' :
        '<tr class="g"><td class="n">' + (i + 1) + '</td><td class="l">' + esc(x.r.g.n) + '</td><td class="l muted" style="font-weight:400"><i>Whole supplier, no product list yet</i></td><td class="l">' + catSel(x.r.g.s.cat, 'data-supcat="' + esc(x.r.g.n) + '"') + '</td>' +
        x.r.bv.map(v => '<td>' + (v ? f(v) : dsh()) + '</td>').join('') + '<td>' + (x.r.inv ? f(x.r.inv) : dsh()) + '</td><td>' + dsh() + '</td></tr>').join('');
    }
    if (!body) body = '<tr><td colspan="' + (6 + bs.length) + '" class="l" style="padding:22px;color:var(--muted)">No rows match these filters.</td></tr>';
    const st = '<div class="stat"><span><b>' + cnt + '</b> ' + (S.group ? 'suppliers' : 'rows') + (anyFilter ? ' (filtered)' : '') + '</span><span>Invoiced <b>AED ' + f(sumInvT) + '</b></span><span>Received in Phorest <b>AED ' + f(sumRec) + '</b> (detail)</span><span>' + monthLabel(S.month, D.partial) + ' · ' + (S.br === 'ALL' ? 'all branches' : BN[S.br]) + '</span></div>';
    return '<div class="sw"><table class="sh"><thead>' + th + '</thead><tbody>' + body + '</tbody></table></div>' + st;
  }

  /* ---------- the one filter bar ---------- */
  function barHtml() {
    const nF = (S.fSup ? 1 : 0) + (S.fCat ? 1 : 0) + (S.q ? 1 : 0), open = S.fOpen;
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
        '<span class="fg chips"><button type="button" data-tgl="group" aria-pressed="' + S.group + '" title="On: open a supplier to see its products. Off: a flat list where you can move a brand to another supplier.">Group by supplier</button><button type="button" data-tgl="active" aria-pressed="' + S.activeOnly + '">Active this month</button></span></div>';
    }
    return h;
  }
  const drawBar = () => { const b = root && $('fbar'); if (b) b.innerHTML = barHtml(); };
  function drawBody() {
    const d = $('dash'), s = $('sheet'); if (!d || !s) return;
    const tops = [].map.call(d.querySelectorAll('.pbody'), x => x.scrollTop);
    d.innerHTML = dash();
    [].forEach.call(d.querySelectorAll('.pbody'), (x, i) => { x.scrollTop = tops[i] || 0; });
    const sc = s.querySelector('.sw'), top = sc ? sc.scrollTop : 0, left = sc ? sc.scrollLeft : 0;
    s.innerHTML = sheet();
    const nw = s.querySelector('.sw'); if (nw) { nw.scrollTop = top; nw.scrollLeft = left; }
  }
  function draw() {
    const note = [];
    if (D.invoiced_loaded) note.push('Accounts\' files loaded ' + day(D.invoiced_loaded));
    if (D.orders_through) note.push('products received to ' + day(D.orders_through));
    if (D.income_through) note.push('income to ' + day(D.income_through));
    $('pg').innerHTML = '<div class="fwrap" id="fwrap"><div id="fbar">' + barHtml() + '</div><div id="menu" role="dialog" aria-label="Filter"></div></div>' +
      '<p class="basisnote"><b>One source: what suppliers invoiced</b>, from Accounts\' supplier files. An invoice has no category, so each supplier\'s amount is split by the products received in Phorest, and a supplier with no products carries a category set by hand. "Received (Phorest)" in the sheet is product detail only.' +
      (D.partial ? ' <b>Month to date</b>: ' + esc(note.join(', ')) + '.' : ' ' + esc(note.join(', ')) + '.') + '</p>' +
      '<div class="grid3" id="dash"></div><h2 class="s">Every supplier and its products <em>sort by clicking a header, change a Category cell to tag it' + (EDIT ? '' : ' (view only)') + '</em></h2><div class="sheet" id="sheet"></div>';
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
      if (up('[data-clear]')) { S.fSup = null; S.fCat = null; S.q = ''; S.qraw = ''; closeMenu(); drawBar(); drawBody(); return; }
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
    }
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
