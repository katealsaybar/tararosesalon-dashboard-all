// Supplier Spend (Kate, 13 Nov 2026): who we buy from and how much, with the two sources side by side, because they never agree.
//
//   Invoiced  what Accounts paid, from Jumera's Supplier Balance monthly sheet (spend_invoiced). That sheet follows payments, not
//             invoice dates, so it is cash out for the month. Only the months her files have loaded exist.
//   Received  what Phorest booked in on stock orders in the month, at the Stock List cost (stock_order_lines), so every line has
//             its product, its type and its branch.
//
// A brand only becomes a supplier when someone maps it (spend_brand_supplier, the Weekly Product Plan's Supplier column). An
// unmapped brand shows under its own name, so the page can say what is still to sort rather than hide it.
//
// One call draws it, the same one the old Stock & Supplier Spend report used: spend_report(p_month). No new SQL. The gate is
// spend_access() inside that function, Level 4 and up or a spend_viewers row, so the page refuses anyone it should and the
// data refuses them too. The Branch at the top of the page picks the salons; the Period picks the month.
//
// Drawn inside a shadow root, like the Weekly Product Plan: the cards, pills and bars here are small and generic and the
// dashboard has its own. The dashboard's colour tokens still reach in, custom properties inherit.
(function () {
  const B = ['SAA', 'KCA', 'MC', 'AQ'];
  const BN = { SAA: 'Saadiyat', KCA: 'Khalifa City A', MC: 'Motor City', AQ: 'Al Quoz' };
  const MN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const CSS = `
  :host{display:block}
  .pg{padding:0 0 10px;font:15px/1.5 Inter,system-ui,sans-serif;color:var(--text)}
  .msg{color:var(--muted);padding:26px 0}
  .wip{background:rgba(214,158,46,.14);border:1px solid rgba(214,158,46,.55);border-radius:10px;padding:9px 13px;font-size:13.5px;margin:0 0 16px}
  .wip b{font-weight:600}
  .hrow{display:flex;gap:12px 18px;align-items:flex-start;flex-wrap:wrap;justify-content:space-between;margin:0 0 4px}
  h1.t{margin:0 0 4px;font-size:clamp(21px,3.4vw,28px);font-weight:600;letter-spacing:-.01em;line-height:1.15}
  .sub{margin:0 0 14px;color:var(--muted);max-width:78ch;font-size:14px}
  .dl{display:flex;gap:6px}
  .dl button{border:1px solid var(--border);background:var(--surface);border-radius:999px;padding:6px 14px;font-size:13px;cursor:pointer;font-weight:600;color:var(--text)}
  .dl button:hover{background:var(--hl);border-color:transparent}
  .tabs{display:flex;gap:4px;border-bottom:1px solid var(--border);margin:0 0 16px;overflow-x:auto;scrollbar-width:none}
  .tabs::-webkit-scrollbar{display:none}
  .tabs button{border:0;background:none;padding:10px 16px;font-size:14px;color:var(--muted);cursor:pointer;border-bottom:2px solid transparent;white-space:nowrap}
  .tabs button[aria-selected="true"]{color:var(--text);font-weight:600;border-bottom-color:var(--text)}
  .tabs button .n{font-weight:600;background:rgba(214,158,46,.18);color:var(--text);border-radius:999px;padding:0 7px;font-size:12px;margin-left:6px}
  h2.s{font-size:12px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin:24px 0 10px;display:flex;gap:8px;flex-wrap:wrap;align-items:baseline}
  h2.s em{font-style:normal;font-weight:500;letter-spacing:0;text-transform:none;color:var(--muted)}
  .grid4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
  .card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px 16px;min-width:0}
  .kl{font-size:12.5px;color:var(--muted)}
  .big{font-size:25px;font-weight:600;letter-spacing:-.01em;line-height:1.2;margin:4px 0 2px;font-variant-numeric:tabular-nums}
  .small{font-size:12.5px}.muted{color:var(--muted)}
  .tw{background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden}
  .tb{display:flex;gap:8px 12px;flex-wrap:wrap;align-items:center;padding:10px 12px;border-bottom:1px solid var(--border);background:var(--surface2,rgba(0,0,0,.03))}
  .tb .hint{font-size:12.5px;color:var(--muted);margin-left:auto}
  .mini{border:1px solid var(--border);background:var(--surface);border-radius:999px;padding:3px 11px;font-size:12.5px;cursor:pointer;color:var(--text)}
  .mini.on{background:var(--hl);border-color:transparent;font-weight:600}
  .sr{display:grid;grid-template-columns:22px minmax(130px,2.2fr) 112px 104px 104px 92px 110px;gap:0 10px;align-items:center;padding:9px 14px;border-top:1px solid var(--border);font-size:13.5px;text-align:right;font-variant-numeric:tabular-nums}
  .sr.h{background:var(--surface2,rgba(0,0,0,.03));font-size:12px;font-weight:600;color:var(--muted);border-top:0}
  .sr>:nth-child(1),.sr>:nth-child(2){text-align:left}
  .sr .nm b{font-weight:600;display:block;overflow-wrap:anywhere}
  .sr .nm small{display:block;color:var(--muted);font-size:11.5px}
  .sr .lb{display:none}
  .sr.main{cursor:pointer;width:100%;border-left:0;border-right:0;border-bottom:0;background:none;color:inherit;font:inherit;font-size:13.5px}
  .sr.main:hover{background:var(--hl)}
  .sr.main[aria-expanded="true"]{background:var(--hl)}
  .rk{color:var(--muted);font-size:12px}
  .bar{display:block;position:relative;height:8px;border-radius:999px;background:var(--surface2,rgba(0,0,0,.06));margin:6px 0 0;overflow:hidden}
  .bar>i{position:absolute;left:0;top:0;bottom:0;border-radius:999px;background:var(--text);opacity:.5}
  .bar>i.b2{background:var(--accent-lavender,#C4B5FD);opacity:.9}
  .gapv{color:#B3322F;font-weight:600}
  .exp{padding:12px 14px 14px;background:var(--hl);border-top:1px dashed var(--border);font-size:13px}
  .exp h4{margin:0 0 8px;font-size:12px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
  .cols{display:grid;grid-template-columns:1fr 1fr;gap:16px 24px}
  .mt{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums;font-size:13px}
  .mt th{font-size:11.5px;font-weight:600;color:var(--muted);text-align:right;padding:3px 6px 6px}
  .mt th:first-child,.mt td:first-child{text-align:left;padding-left:0}
  .mt td{text-align:right;padding:5px 6px;border-top:1px solid var(--border)}
  .mt td.nm{font-weight:600}
  .pblock{margin-top:14px;padding-top:12px;border-top:1px solid var(--border)}
  .phead{display:flex;align-items:baseline;justify-content:space-between;gap:10px 16px;flex-wrap:wrap;margin:0 0 8px}
  .phead h4{margin:0}
  .plist{margin:0;padding:0;list-style:none}
  .plist li{display:grid;grid-template-columns:minmax(0,1fr) 96px 64px;gap:0 16px;align-items:baseline;padding:6px 0;border-top:1px solid var(--border);font-variant-numeric:tabular-nums}
  .plist li>:nth-child(2),.plist li>:nth-child(3){text-align:right;white-space:nowrap}
  .plist li.hd{border-top:0;padding-top:0;font-size:11.5px;font-weight:600;color:var(--muted)}
  .plist .pn2{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .plist .ty{color:var(--muted);font-size:12px}
  .stat{display:flex;gap:6px 22px;flex-wrap:wrap;padding:9px 14px;border-top:1px solid var(--border);background:var(--surface2,rgba(0,0,0,.03));font-size:12.5px;color:var(--muted);font-variant-numeric:tabular-nums}
  .stat b{color:var(--text)}
  .ul{display:grid;grid-template-columns:minmax(140px,2fr) 110px 1fr;gap:10px;align-items:center;padding:9px 14px;border-top:1px solid var(--border);font-size:13.5px;font-variant-numeric:tabular-nums}
  .ul.h{background:var(--surface2,rgba(0,0,0,.03));font-size:12px;font-weight:600;color:var(--muted);border-top:0}
  .ul>:nth-child(2){text-align:right}
  .ul .lb{display:none}
  .ul .why{color:var(--muted);font-size:12.5px}
  .pill{display:inline-block;font-size:12px;font-weight:600;border-radius:999px;padding:2px 10px;line-height:1.5;border:1px solid var(--border);background:var(--surface2,rgba(0,0,0,.04));color:var(--muted);white-space:nowrap}
  .chips{display:flex;gap:6px;flex-wrap:wrap}
  .dup{font-size:12.5px;color:var(--muted);line-height:1.9}
  .dup b{color:var(--text)}
  .lk{border:0;background:none;padding:0;color:inherit;font:inherit;cursor:pointer;text-decoration:underline;text-decoration-color:var(--border);text-underline-offset:3px;font-variant-numeric:tabular-nums}
  .lk:hover{text-decoration-color:currentColor}
  @media (max-width:1000px){.cols{grid-template-columns:1fr}.grid4{grid-template-columns:repeat(2,minmax(0,1fr))}}
  @media (max-width:820px){.sr{grid-template-columns:20px minmax(110px,2fr) 96px 92px 88px;gap:0 8px;font-size:13px}.sr .hid{display:none}}
  @media (max-width:700px){
    .sr.h,.ul.h{display:none}
    .sr{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 10px;padding:12px 14px;text-align:left}
    .sr>:nth-child(1){display:none}.sr>:nth-child(2){grid-column:1 / 3}
    .sr .lb{display:block;font-size:11px;color:var(--muted);font-weight:400}
    .sr .hid{display:block}
    .plist li{grid-template-columns:minmax(0,1fr) 80px 52px;gap:0 10px}
    .ul{grid-template-columns:1fr 1fr}.ul>:nth-child(1),.ul>:nth-child(3){grid-column:1 / 3}
    .ul>:nth-child(2){text-align:left}.ul .lb{display:block;font-size:11px;color:var(--muted)}
  }`;

  const S = { d: null, tab: 'who', basis: 'inv', open: '', brs: B.slice(), loadedKey: '', rows: [] };
  let host = null, root = null;
  const $ = id => root && root.getElementById(id);
  const f = n => Math.round(Number(n) || 0).toLocaleString('en-US');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const iso = d => d instanceof Date ? d.toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' }) : String(d || '');

  // the salons the masthead Branch is on, the same read as the Weekly Product Plan
  function wantBranches() {
    try { const b = sel.branch; if (Array.isArray(b) && !b.includes('all')) { const x = b.filter(c => B.includes(c)); if (x.length) return x; } } catch (e) { /* All */ }
    return B.slice();
  }
  // the month the masthead Period starts in; null lets spend_report pick the newest month Accounts have loaded
  function wantMonth() {
    try {
      if (typeof activePeriodKey === 'function' && activePeriodKey() === 'All time') return null;
      if (typeof dateFrom !== 'undefined' && dateFrom) { const s = iso(dateFrom); return s.slice(0, 8) + '01'; }
    } catch (e) { /* the window is not known yet */ }
    return null;
  }
  const brLabel = () => S.brs.length === B.length ? 'all four salons' : S.brs.map(b => BN[b]).join(' + ');
  const monthLabel = () => { const m = S.d && S.d.month ? String(S.d.month) : ''; return m ? MN[+m.slice(5, 7) - 1] + ' ' + m.slice(0, 4) : ''; };
  const hasInv = () => !!(S.d && S.d.invoiced && S.d.invoiced.length);

  /* ---------- the figures ---------- */
  // one row per supplier for the salons on screen: what Accounts paid, what Phorest received, and the retail part of it
  function build() {
    const d = S.d, m = {}, sup = {}, brandsup = d.brandsup || {};
    (d.suppliers || []).forEach(s => { sup[s.n] = s.cat || 'Not sorted'; });
    const get = n => (m[n] || (m[n] = { n: n, cat: sup[n] || null, inv: 0, rcv: 0, ret: 0, um: !Object.prototype.hasOwnProperty.call(sup, n) }));
    (d.invoiced || []).forEach(r => { if (S.brs.indexOf(r.b) >= 0) get(r.s).inv += Number(r.v) || 0; });
    const col = { SAA: 4, KCA: 5, MC: 6, AQ: 7 };
    (d.products || []).forEach(p => {
      let v = 0; S.brs.forEach(b => { v += Number(p[col[b]]) || 0; });
      if (!v) return;
      const who = brandsup[p[0]] || p[0] || 'No brand';
      const o = get(who);
      o.rcv += v;
      if (/retail/i.test(String(p[2] || ''))) o.ret += v;
    });
    S.rows = Object.keys(m).map(k => m[k]);
    S.sup = sup;
  }
  const sortRows = () => {
    const k = S.basis === 'inv' ? 'inv' : 'rcv';
    return S.rows.filter(r => r.inv > 0 || r.rcv > 0)
      .sort((a, b) => (b[k] - a[k]) || (b.rcv - a.rcv) || (b.inv - a.inv) || a.n.localeCompare(b.n));
  };
  const sum = (rs, k) => rs.reduce((a, r) => a + r[k], 0);
  // the products of one supplier this month, biggest first
  function prodsOf(name) {
    const d = S.d, brandsup = d.brandsup || {}, col = { SAA: 4, KCA: 5, MC: 6, AQ: 7 }, out = [];
    (d.products || []).forEach(p => {
      const who = brandsup[p[0]] || p[0] || 'No brand';
      if (who !== name) return;
      let v = 0; S.brs.forEach(b => { v += Number(p[col[b]]) || 0; });
      if (v > 0) out.push({ product: p[1], type: p[2], v: v, u: Number(p[8]) || 0 });
    });
    return out.sort((a, b) => b.v - a.v);
  }
  // the brands Phorest received that nobody has put under a supplier yet
  function unmapped() {
    return sortRows().filter(r => r.um && r.rcv > 0).map(r => ({ n: r.n, v: r.rcv }));
  }
  // suppliers Accounts paid that Phorest never saw: equipment, consumables, a service, or a brand not mapped yet
  function paidOnly() {
    return sortRows().filter(r => r.inv > 0 && r.rcv === 0).map(r => ({ n: r.n, v: r.inv, cat: r.cat }));
  }

  /* ---------- the page ---------- */
  function head() {
    const um = unmapped().length;
    return '<div class="wip"><b>Under construction.</b> The page is new and still being checked against Accounts’ own sheet. Read it, but do not quote a figure from it yet without telling Kate.</div>' +
      '<div class="hrow"><div><h1 class="t">Supplier Spend</h1>' +
      '<p class="sub">Who we buy from and how much. What Accounts paid sits beside what Phorest received, so you can see where the two do not agree. Branch and Period at the top of the page pick the salons and the month.</p></div>' +
      '<span class="dl" role="group" aria-label="Download this report"><button type="button" onclick="rexRun(\'supplierSpendExport\',\'xlsx\',this)" title="Download as an Excel file">XLSX</button><button type="button" onclick="rexRun(\'supplierSpendExport\',\'csv\',this)" title="Download as a CSV file">CSV</button></span></div>' +
      '<div class="tabs" role="tablist">' +
      '<button role="tab" aria-selected="' + (S.tab === 'who') + '" data-act="tab" data-v="who">Who we buy from</button>' +
      '<button role="tab" aria-selected="' + (S.tab === 'tidy') + '" data-act="tab" data-v="tidy">Still to sort' + (um ? '<span class="n">' + um + '</span>' : '') + '</button></div>';
  }

  function tiles() {
    const rs = sortRows(), inv = sum(rs, 'inv'), rcv = sum(rs, 'rcv');
    const top = rs[0], k = S.basis === 'inv' ? 'inv' : 'rcv', tot = S.basis === 'inv' ? inv : rcv;
    const share = top && tot ? Math.round(top[k] / tot * 100) : 0;
    let h = '<div class="grid4">';
    h += '<div class="card"><div class="kl">What Accounts paid, ' + esc(monthLabel()) + '</div><div class="big">' +
      (hasInv() ? 'AED ' + f(inv) : '<span class="muted">not loaded</span>') + '</div><div class="small muted">' +
      (hasInv() ? 'Supplier Balance sheet, ' + esc(brLabel()) : 'No Supplier Balance sheet for this month yet') + '</div></div>';
    h += '<div class="card"><div class="kl">Received into Phorest</div><div class="big">AED ' + f(rcv) + '</div>' +
      '<div class="small muted">Stock orders booked in, at the Stock List cost</div></div>';
    h += '<div class="card"><div class="kl">Suppliers used</div><div class="big">' + rs.length + '</div>' +
      '<div class="small muted">' + esc(brLabel()) + '</div></div>';
    h += '<div class="card"><div class="kl">Biggest supplier</div><div class="big">' + (top ? esc(top.n) : '-') + '</div>' +
      '<div class="small muted">' + share + '% of ' + (S.basis === 'inv' ? 'what was paid' : 'what arrived') + '</div></div>';
    return h + '</div>';
  }

  function detail(r) {
    const d = S.d, col = { SAA: 4, KCA: 5, MC: 6, AQ: 7 }, brandsup = d.brandsup || {};
    const byBr = {}; B.forEach(b => { byBr[b] = { inv: 0, rcv: 0 }; });
    (d.invoiced || []).forEach(x => { if (x.s === r.n && byBr[x.b]) byBr[x.b].inv += Number(x.v) || 0; });
    (d.products || []).forEach(p => {
      const who = brandsup[p[0]] || p[0] || 'No brand';
      if (who !== r.n) return;
      B.forEach(b => { byBr[b].rcv += Number(p[col[b]]) || 0; });
    });
    const prods = prodsOf(r.n).slice(0, 10);

    let h = '<div class="exp"><div class="cols">';
    h += '<div><h4>Salon by salon</h4><table class="mt"><thead><tr><th></th><th>Paid</th><th>Received</th></tr></thead><tbody>';
    B.forEach(b => {
      const o = byBr[b];
      h += '<tr><td class="nm">' + BN[b] + (S.brs.indexOf(b) >= 0 ? '' : ' <span class="muted small">(not in the Branch filter)</span>') + '</td>' +
        '<td>' + (o.inv ? f(o.inv) : '<span class="muted">-</span>') + '</td>' +
        '<td>' + (o.rcv ? f(o.rcv) : '<span class="muted">-</span>') + '</td></tr>';
    });
    h += '</tbody></table></div>';
    h += '<div><h4>How it splits</h4><table class="mt"><tbody>' +
      '<tr><td class="nm">Retail</td><td>' + (r.rcv ? f(r.ret) + ' <span class="muted">' + Math.round(r.ret / r.rcv * 100) + '%</span>' : '<span class="muted">-</span>') + '</td></tr>' +
      '<tr><td class="nm">Professional</td><td>' + (r.rcv ? f(r.rcv - r.ret) + ' <span class="muted">' + (100 - Math.round(r.ret / r.rcv * 100)) + '%</span>' : '<span class="muted">-</span>') + '</td></tr>' +
      '<tr><td class="nm">Sorted as</td><td>' + esc(r.cat || 'No supplier yet') + '</td></tr>' +
      '</tbody></table></div></div>';

    h += '<div class="pblock"><div class="phead"><h4>What we bought <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:400">' + esc(r.n) + ', ' + esc(monthLabel()) + ', ' + esc(brLabel()) + '</span></h4></div>';
    if (prods.length) {
      h += '<ul class="plist"><li class="hd"><span>Product</span><span>Spend AED</span><span>Units</span></li>' +
        prods.map(p => '<li><span class="pn2">' + esc(p.product) + ' <span class="ty">' + esc(/retail/i.test(String(p.type || '')) ? 'retail' : 'professional') + '</span></span>' +
          '<span>' + f(p.v) + '</span><span class="ty">' + f(p.u) + 'x</span></li>').join('') + '</ul>';
      h += '<p class="small muted" style="margin:8px 0 0">Top ' + prods.length + ' by spend. Retail or professional follows the stock type Phorest holds.</p>';
    } else {
      h += '<p class="small muted" style="margin:0">Nothing from ' + esc(r.n) + ' arrived in Phorest this month. Either it never goes through Phorest, or its brand is not mapped to this supplier yet.</p>';
    }
    h += '</div>';

    if (r.inv && r.rcv && Math.abs(r.inv - r.rcv) / Math.max(r.inv, r.rcv) > 0.25) {
      h += '<p class="small muted" style="margin:12px 0 0">The two are far apart this month. The Supplier Balance sheet follows payments and Phorest counts what was booked in, so a late delivery, a payment on account or a credit note sits on one side only.</p>';
    }
    return h;
  }

  function table() {
    const list = sortRows(), mx = list.length ? Math.max(list[0].inv, list[0].rcv) || 1 : 1;
    let h = '<div class="tw"><div class="tb"><span class="small muted">Rank by</span>' +
      '<button type="button" class="mini' + (S.basis === 'inv' ? ' on' : '') + '" data-act="basis" data-v="inv"' + (hasInv() ? '' : ' disabled') + '>What was paid</button>' +
      '<button type="button" class="mini' + (S.basis === 'rcv' ? ' on' : '') + '" data-act="basis" data-v="rcv">What arrived</button>' +
      '<span class="hint">Tap a supplier for the salons and the products</span></div>';
    h += '<div class="sr h"><span></span><span>Supplier</span><span>Paid</span><span>Received</span><span>Difference</span><span class="hid">Retail part</span><span class="hid">Share</span></div>';
    if (!list.length) h += '<p class="msg" style="text-align:center">Nothing for these salons in ' + esc(monthLabel()) + '.</p>';
    list.forEach((r, i) => {
      const open = S.open === r.n, dif = r.inv && r.rcv ? r.inv - r.rcv : null;
      const difH = dif === null ? '<span class="muted">-</span>' : (Math.abs(dif) < 1 ? '0' : (dif > 0 ? '+' : '-') + f(Math.abs(dif)));
      const wide = dif !== null && Math.abs(dif) / Math.max(r.inv, r.rcv) > 0.25;
      h += '<button type="button" class="sr main" data-act="open" data-v="' + esc(r.n) + '" aria-expanded="' + open + '">' +
        '<span class="rk">' + (i + 1) + '</span>' +
        '<span class="nm"><b>' + esc(r.n) + '</b><small>' + esc(r.um ? 'Phorest brand, no supplier yet' : (r.cat || 'Not sorted') + (r.rcv ? '' : ', nothing in Phorest')) + '</small></span>' +
        '<span><span class="lb">Paid</span>' + (r.inv ? f(r.inv) : '<span class="muted">' + (hasInv() ? '-' : 'n/a') + '</span>') + '</span>' +
        '<span><span class="lb">Received</span>' + (r.rcv ? f(r.rcv) : '<span class="muted">-</span>') + '</span>' +
        '<span><span class="lb">Difference</span><span' + (wide ? ' class="gapv"' : '') + '>' + difH + '</span></span>' +
        '<span class="hid"><span class="lb">Retail part</span>' + (r.rcv ? Math.round(r.ret / r.rcv * 100) + '%' : '<span class="muted">-</span>') + '</span>' +
        '<span class="hid"><span class="lb">Share</span><span class="bar"><i style="width:' + (r.inv / mx * 100).toFixed(1) + '%"></i></span>' +
        '<span class="bar" style="margin-top:3px"><i class="b2" style="width:' + (r.rcv / mx * 100).toFixed(1) + '%"></i></span></span></button>';
      if (open) h += detail(r);
    });
    h += '<div class="stat"><span>Paid <b>' + (hasInv() ? 'AED ' + f(sum(list, 'inv')) : 'n/a') + '</b></span>' +
      '<span>Received <b>AED ' + f(sum(list, 'rcv')) + '</b></span>' +
      '<span>Suppliers <b>' + list.length + '</b></span>' +
      '<span>The dark bar is what was paid, the light bar what arrived</span></div></div>';
    return h;
  }

  function whoTab() {
    let h = tiles();
    if (!hasInv()) h += '<p class="small muted" style="margin:14px 0 0">' + esc(monthLabel()) + ' has no Supplier Balance sheet loaded, so only what Phorest received is on screen. Pick another month with the Period at the top.</p>';
    h += '<h2 class="s">Who we buy from <em>' + esc(monthLabel()) + ', ' + esc(brLabel()) + '</em></h2>';
    return h + table();
  }

  function tidyTab() {
    const um = unmapped(), po = paidOnly(), sup = S.sup || {};
    const names = Object.keys(sup), ns = names.filter(n => (sup[n] || 'Not sorted') === 'Not sorted');
    const umTot = um.reduce((a, x) => a + x.v, 0), poTot = po.reduce((a, x) => a + x.v, 0);
    const pairs = [];
    names.forEach(a => names.forEach(b => { if (a !== b && b.indexOf(a) === 0 && b.length > a.length + 2 && pairs.length < 8) pairs.push([a, b]); }));

    let h = '<div class="grid4">';
    h += '<div class="card"><div class="kl">Brands with no supplier</div><div class="big">' + um.length + '</div><div class="small muted">AED ' + f(umTot) + ' received this month</div></div>';
    h += '<div class="card"><div class="kl">Paid, nothing in Phorest</div><div class="big">' + po.length + '</div><div class="small muted">AED ' + f(poTot) + ' this month</div></div>';
    h += '<div class="card"><div class="kl">Suppliers not sorted</div><div class="big">' + ns.length + '</div><div class="small muted">of ' + names.length + ' on the list</div></div>';
    h += '<div class="card"><div class="kl">Names written twice</div><div class="big">' + pairs.length + '</div><div class="small muted">one company, two entries</div></div></div>';

    h += '<h2 class="s">Brands with no supplier <em>they show under their brand name until someone maps them on the Weekly Product Plan</em></h2>';
    h += '<div class="tw"><div class="ul h"><span>Brand in Phorest</span><span>Received</span><span>What to do</span></div>';
    if (!um.length) h += '<p class="msg" style="text-align:center">Every brand that arrived this month sits under a supplier.</p>';
    um.forEach(x => {
      h += '<div class="ul"><span><b>' + esc(x.n) + '</b></span>' +
        '<span><span class="lb">Received</span><button type="button" class="lk" data-act="open" data-v="' + esc(x.n) + '">' + f(x.v) + '</button></span>' +
        '<span class="why">Set its Supplier on the Weekly Product Plan and it joins that supplier here</span></div>';
    });
    h += '<div class="stat"><span>Received with no supplier <b>AED ' + f(umTot) + '</b></span></div></div>';

    h += '<h2 class="s">Paid, but nothing in Phorest <em>what we pay for that never arrives as stock</em></h2>';
    h += '<div class="card"><table class="mt"><thead><tr><th>Supplier</th><th>Paid</th><th style="text-align:left;padding-left:14px">Sorted as</th></tr></thead><tbody>';
    if (!po.length) h += '<tr><td colspan="3" class="muted" style="text-align:center;padding:14px 0">Nothing this month.</td></tr>';
    po.forEach(x => {
      h += '<tr><td class="nm">' + esc(x.n) + '</td><td><button type="button" class="lk" data-act="open" data-v="' + esc(x.n) + '">' + f(x.v) + '</button></td>' +
        '<td style="text-align:left;padding-left:14px"><span class="pill">' + esc(x.cat || 'Not sorted') + '</span></td></tr>';
    });
    h += '</tbody></table><p class="small muted" style="margin:10px 0 0">Equipment, tools, consumables and services sit here, and so does any brand still waiting for a supplier. Worth a look when a name you expect to see as stock turns up in this list.</p></div>';

    h += '<h2 class="s">The supplier list <em>' + names.length + ' names, ' + ns.length + ' still unsorted</em></h2>';
    h += '<div class="cols"><div class="card"><div class="kl" style="margin-bottom:8px">Names written twice</div>';
    h += pairs.length ? '<p class="dup">' + pairs.map(p => '<b>' + esc(p[0]) + '</b> and <b>' + esc(p[1]) + '</b>').join('<br>') + '</p>' +
      '<p class="small muted" style="margin:6px 0 0">Each pair is one decision, and merging them changes who sits where in the list above.</p>'
      : '<p class="small muted" style="margin:0">Nothing on the list looks written twice.</p>';
    h += '</div><div class="card"><div class="kl" style="margin-bottom:8px">Sorted so far</div>';
    const cats = {}; names.forEach(n => { const c = sup[n] || 'Not sorted'; (cats[c] || (cats[c] = [])).push(n); });
    Object.keys(cats).sort().forEach(c => {
      const list = cats[c], show = c === 'Not sorted' ? list.slice(0, 16) : list;
      h += '<div style="margin-bottom:10px"><div class="small" style="font-weight:600;margin-bottom:5px">' + esc(c) + ' <span class="muted">' + list.length + '</span></div>' +
        '<div class="chips">' + show.map(n => '<span class="pill">' + esc(n) + '</span>').join('') +
        (list.length > show.length ? '<span class="pill">and ' + (list.length - show.length) + ' more</span>' : '') + '</div></div>';
    });
    return h + '</div></div>';
  }

  function draw() {
    if (!S.d) return;
    if (S.d.denied) { $('pg').innerHTML = '<p class="msg">This page is for Accounts and Admin. Ask Kate if you need it.</p>'; return; }
    $('pg').innerHTML = head() + (S.tab === 'who' ? whoTab() : tidyTab());
  }

  function wire() {
    root.addEventListener('click', e => {
      const t = e.target.closest && e.target.closest('[data-act]');
      if (!t) return;
      const a = t.getAttribute('data-act'), v = t.getAttribute('data-v');
      if (a === 'tab') { S.tab = v; S.open = ''; draw(); }
      else if (a === 'basis') { if (v === 'inv' && !hasInv()) return; S.basis = v; draw(); }
      else if (a === 'open') {
        if (!v) return;
        const was = S.tab;
        S.tab = 'who'; S.open = (S.open === v && was === 'who') ? '' : v;
        draw();
        if (was !== 'who') { const el = root.querySelector('[aria-expanded="true"][data-act="open"]'); if (el) el.scrollIntoView({ block: 'center' }); }
      }
    });
  }

  /* ---------- the download, one row per supplier, what is on screen ---------- */
  window.supplierSpendExport = function supplierSpendExport() {
    if (!S.d || S.d.denied || !S.rows.length) return null;
    const list = sortRows();
    const head = [{ label: 'Supplier', fmt: 'text' }, { label: 'Sorted as', fmt: 'text' }, { label: 'Paid', fmt: 'aed' },
      { label: 'Received', fmt: 'aed' }, { label: 'Difference', fmt: 'aed' }, { label: 'Retail part', fmt: 'aed' }, { label: 'Professional part', fmt: 'aed' }];
    const rows = list.map(r => ({ cells: [r.n, r.um ? 'No supplier yet' : (r.cat || 'Not sorted'), r.inv || null, r.rcv || null,
      (r.inv && r.rcv) ? r.inv - r.rcv : null, r.ret || null, r.rcv ? r.rcv - r.ret : null] }));
    const tot = { total: true, cells: ['Total', list.length + ' suppliers', sum(list, 'inv') || null, sum(list, 'rcv') || null, null, sum(list, 'ret') || null, sum(list, 'rcv') - sum(list, 'ret') || null] };
    return {
      name: 'supplier-spend-' + (S.d.month || '') + (S.brs.length === 1 ? '-' + S.brs[0].toLowerCase() : ''),
      sheets: [{
        name: 'Supplier Spend', title: 'Supplier Spend',
        subtitle: monthLabel() + '. ' + brLabel() + '. Paid is Accounts’ Supplier Balance sheet' + (hasInv() ? '' : ' (not loaded for this month)') + ', Received is what Phorest booked in at the Stock List cost.',
        blocks: [{ cols: head, rows: rows.concat([tot]) }]
      }]
    };
  };

  /* ---------- entry ---------- */
  window.renderSupplierSpend = async function renderSupplierSpend() {
    host = document.getElementById('supplierSpendContent');
    if (!host) return;
    if (!root) {
      root = host.attachShadow({ mode: 'open' });
      root.innerHTML = '<style>' + CSS + '</style><div class="pg" id="pg"></div>';
      wire();
    }
    try { if (window.trsWindowReady) await window.trsWindowReady; } catch (e) { /* the page reads its own default window */ }
    S.brs = wantBranches();
    const month = wantMonth(), key = (month || 'auto') + '|' + S.brs.join(',');
    if (S.d && key === S.loadedKey) { draw(); return; }
    if (!S.d) $('pg').innerHTML = '<p class="msg">Loading Supplier Spend…</p>';
    try {
      const { data, error } = await sb.rpc('spend_report', { p_month: month });
      if (error) throw error;
      S.d = data || {};
      S.loadedKey = key;
      if (S.d.denied) { draw(); return; }
      build();
      if (S.basis === 'inv' && !hasInv()) S.basis = 'rcv';
    } catch (e) {
      console.error(e);
      $('pg').innerHTML = '<p class="msg">Supplier Spend didn’t load. Refresh to try again.</p>';
      return;
    }
    draw();
  };
})();
