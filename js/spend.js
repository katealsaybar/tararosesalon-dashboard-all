// Weekly Product Plan (Kate, 12 Nov 2026): the page that used to be Stock & Supplier Spend, now ate Tine's Weekly Product Plan sheet.
// Her columns in her order, plus Type (Hair Professional or Hair Retail) and In stock now. One row per product per salon, built in the
// database from Phorest (Stock List + Product Usage): spend_plan(). What comes from Phorest and the price list is read only; what is ours
// (category, product, type, priority, min, max) is editable, every edit is saved with plan_set() and logged for good (nobody can delete the
// log), and a cell that was edited carries a triangle that lists who edited it.
//
// Branch and Period are the dashboard's own sticky header filter (Kate, 23 Oct 2026): this page draws no filter bar of its own for them.
// Avg Units / Week = units in the Period / days x 7 (the Period stops at the last day of usage loaded).
// Price lists: the supplier changes its SKUs and prices in January, so "Upload new prices" saves a NEW dated list (plan_price_save, the file
// goes to the private price-lists bucket) and never overwrites an old one. The Prices drop-down reads any list.
// Which brands and categories are in the plan, the saved edits and the prices are rows in the database behind RLS, not in this file.
// Level 4 and up only: the functions refuse anyone else, whatever this file does.
//
// Drawn inside a shadow root. The dashboard's colour tokens still reach in (custom properties inherit). Menus, the tip and the upload
// dialog sit beside .stage, not inside it, because a container-type box would trap their position: fixed.
(function () {
  const B = ['SAA', 'KCA', 'MC', 'AQ'];
  const BN = { SAA: 'Saadiyat', KCA: 'Khalifa City A', MC: 'Motor City', AQ: 'Al Quoz' };
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  // a row from spend_plan(): the first 17 come from the database, the next four are worked out here
  const K = 0, BR = 1, CAT = 2, NAME = 3, TYPE = 4, FLAG = 5, U = 6, PRIO = 7, MIN = 8, MAX = 9, COST = 10, PREV = 11, SALE = 12, STK = 13, STAT = 14, TAG = 15, AVG = 17, MINV = 18, MAXV = 19, WK = 20, MO = 100;
  const FIELD = { [CAT]: 'cat', [NAME]: 'name', [TYPE]: 'type', [PRIO]: 'prio', [MIN]: 'min', [MAX]: 'max' };

  const CSS = `
:host{display:block}
*{box-sizing:border-box}
.stage{container-type:inline-size;color:var(--text);font:inherit;
  --ok:var(--good,#0F8A72);--over:var(--bad,#B3322F);--hl:color-mix(in srgb,var(--warn,#BA7517) 24%,var(--surface,#fff));--tri:var(--warn,#E08A00);--gx:28px}
@container (max-width:900px){.pg{--gx:18px}}
@container (max-width:760px){.pg{--gx:10px}}
.pg{padding:10px var(--gx) 48px}
/* The site's one scrollbar (css/scrollbars.css), repeated here because that sheet cannot reach inside this page's shadow root: thin, no arrows,
   no track, a soft pill in the colour of the text, a little stronger under the pointer. */
*{scrollbar-width:thin;scrollbar-color:color-mix(in srgb,var(--text) 30%,transparent) transparent}
@supports selector(::-webkit-scrollbar){
  *{scrollbar-width:auto;scrollbar-color:auto}
  *::-webkit-scrollbar{width:10px;height:10px;background:transparent}
  *::-webkit-scrollbar-track,*::-webkit-scrollbar-corner{background:transparent}
  *::-webkit-scrollbar-button{display:none;width:0;height:0}
  *::-webkit-scrollbar-thumb{background:color-mix(in srgb,var(--text) 30%,transparent);background-clip:padding-box;border:3px solid transparent;border-radius:999px;min-height:40px;min-width:40px}
  *::-webkit-scrollbar-thumb:hover,*::-webkit-scrollbar-thumb:active{background:color-mix(in srgb,var(--text) 55%,transparent);background-clip:padding-box}
}
button,select,textarea,input{font:inherit;color:inherit}
.msg{padding:30px 0;color:var(--muted);font-size:14px}
h1.t{margin:0 0 4px;font-size:clamp(22px,4cqi,28px);font-weight:600;letter-spacing:-.01em;line-height:1.15}
.sub{margin:0 0 12px;color:var(--muted);max-width:84ch;font-size:14px}
.warnbox{margin:0 0 12px;padding:9px 14px;border-radius:10px;background:var(--warn-bg,#FAEEDA);color:var(--warn,#8A5A0C);font-size:13.5px}
.fbar{display:flex;gap:8px 14px;flex-wrap:wrap;align-items:center;margin:0 0 10px}
.fg{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.lab{font-size:12px;color:var(--muted2)}
#q{border:1px solid var(--border);border-radius:999px;background:var(--surface);padding:5px 14px;font-size:13px;min-width:210px}
.dl{display:flex;gap:6px;margin-left:auto}
.dl button,.rs,.btn{border:1px solid var(--border);background:var(--surface);border-radius:999px;padding:5px 13px;font-size:13px;cursor:pointer;font-weight:600}
.dl button:hover,.rs:hover,.btn:hover{background:var(--hl);border-color:transparent}
.btn.pri{background:var(--accent);color:var(--accent-fg);border-color:var(--accent)}
.btn.pri:hover{background:var(--accent);opacity:.9}
.btn:disabled,.dl button:disabled{opacity:.4;cursor:not-allowed}
.psel{border:1px solid var(--border);background:var(--surface);border-radius:999px;padding:5px 12px;font-size:13px;cursor:pointer;max-width:340px}
.chk{display:flex;gap:6px;align-items:center;font-size:13px;color:var(--muted);cursor:pointer}
.fi:focus-visible,.chip:focus-visible,.go:focus-visible,.tri:focus-visible,.btn:focus-visible,.rs:focus-visible,.psel:focus-visible,.dl button:focus-visible,#q:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.cnt{font-size:12.5px;color:var(--muted2)}
.chip{display:inline-flex;align-items:center;gap:6px;border:1px solid color-mix(in srgb,var(--ok) 45%,var(--border));background:color-mix(in srgb,var(--ok) 12%,var(--surface));color:var(--text);border-radius:999px;padding:3px 6px 3px 12px;font-size:12.5px;cursor:pointer}
.chip b{display:grid;place-items:center;width:18px;height:18px;border-radius:50%;background:color-mix(in srgb,var(--ok) 22%,transparent);font-size:12px;line-height:1}
.pnote{font-size:12.5px;color:var(--muted);margin:-4px 0 10px}
.pnote a{color:var(--text)}

/* the sheet */
.sheet{background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden}
.xw{max-height:max(420px,calc(100vh - var(--topbar-cond-h,104px) - 230px));overflow:auto;position:relative}
table.xt{border-collapse:separate;border-spacing:0;font-size:13px;font-variant-numeric:tabular-nums;width:max-content;min-width:100%}
.xt th{position:sticky;top:0;z-index:3;background:var(--surface2);font-size:12px;font-weight:600;color:var(--muted);padding:6px 6px 6px 10px;text-align:right;border-bottom:1px solid var(--border);vertical-align:bottom;line-height:1.25}
.xt th.on{background:color-mix(in srgb,var(--ok) 14%,var(--surface2))}
.xt th small{display:block;font-weight:400;color:var(--muted2);font-size:11px}
.hd{display:flex;align-items:flex-end;justify-content:flex-end;gap:2px}
.xt th.l .hd{justify-content:flex-start}
.hd .hl{min-width:0}
.fi{flex:none;width:22px;height:22px;border:0;border-radius:6px;background:none;color:var(--muted2);cursor:pointer;display:grid;place-items:center;padding:0}
.fi:hover{background:var(--border);color:var(--text)}
.fi.on{background:color-mix(in srgb,var(--ok) 22%,transparent);color:var(--ok)}
.fi svg{width:13px;height:13px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.srt{color:var(--ok);font-size:10px;margin-left:3px}
.xt td{position:relative;padding:3px 6px 3px 10px;border-bottom:1px solid var(--border2);text-align:right;white-space:nowrap;background:var(--surface);height:36px}
.xt th.l,.xt td.l{text-align:left}
.xt .c-cat{position:sticky;left:0;z-index:2;width:140px;min-width:140px;max-width:140px;text-align:left}
.xt .c-name{position:sticky;left:140px;z-index:2;width:270px;min-width:270px;max-width:270px;text-align:left;white-space:normal;box-shadow:1px 0 0 var(--border)}
.xt th.c-cat,.xt th.c-name{z-index:5}
.xt .c-type{text-align:left;width:164px;min-width:164px}
.xt th.c-type{background:color-mix(in srgb,var(--accent-lavender,#C4B5FD) 28%,var(--surface2));color:var(--text)}
.xt th.c-stk{background:color-mix(in srgb,var(--accent-mint,#99F6E4) 26%,var(--surface2));color:var(--text)}
.xt th.c-type.on,.xt th.c-stk.on{background:color-mix(in srgb,var(--ok) 22%,var(--surface2))}
.xt .c-stk{width:104px;min-width:104px}
.xt .c-m{width:76px;min-width:76px}
.xt .c-avg{width:100px;min-width:100px}
.xt td.c-avg{font-weight:600;padding-right:10px}
.xt .c-pr{text-align:center;width:96px;min-width:96px}
.xt .c-n{width:96px;min-width:96px}
.xt .c-uc{width:132px;min-width:132px}
.xt .c-st{text-align:left;width:210px;min-width:210px;max-width:210px;overflow:hidden;text-overflow:ellipsis;color:var(--muted)}
.xt tr.rw:hover td{background-image:linear-gradient(color-mix(in srgb,var(--warn,#BA7517) 14%,transparent),color-mix(in srgb,var(--warn,#BA7517) 14%,transparent))}
.xt tfoot td{position:sticky;bottom:0;z-index:2;background:var(--surface2);font-weight:600;border-top:1px solid var(--border);border-bottom:0;padding-right:10px}
.xt tfoot td.c-cat,.xt tfoot td.c-name{z-index:4}
.sal{display:block;font-size:11px;font-weight:600;letter-spacing:.04em;color:var(--muted2);margin-top:1px;padding-left:5px}
.tg{display:flex;gap:4px;flex-wrap:wrap;padding:0 0 1px 5px}
.tag{font-size:11px;font-weight:600;border-radius:5px;padding:0 6px;background:var(--warn-bg,#FAEEDA);color:var(--warn,#8A5A0C);white-space:normal}
.uc{display:flex;align-items:center;gap:4px;justify-content:flex-end}
.uc .num{flex:1;min-width:0}
.dlt{flex:none;font-size:11px;font-weight:700;border-radius:5px;padding:0 5px;white-space:nowrap}
.dlt.up{background:color-mix(in srgb,var(--over) 16%,var(--surface));color:var(--over)}
.dlt.dn{background:color-mix(in srgb,var(--ok) 16%,var(--surface));color:var(--ok)}

/* editable entries */
.num,.cs,.tx,.pri,.tyl{border:1px solid transparent;border-radius:6px;background:transparent;transition:none}
.num{width:100%;text-align:right;padding:3px 4px;font:inherit;font-variant-numeric:tabular-nums}
.num::-webkit-outer-spin-button,.num::-webkit-inner-spin-button{opacity:0}
.num:hover::-webkit-outer-spin-button,.num:hover::-webkit-inner-spin-button,.num:focus::-webkit-outer-spin-button,.num:focus::-webkit-inner-spin-button{opacity:1}
.cs{width:100%;padding:3px 2px;cursor:pointer;color:var(--muted);text-overflow:ellipsis;appearance:none;-webkit-appearance:none}
.tx{display:block;padding:4px 5px;font-weight:600;line-height:1.3;min-height:26px;outline:0;cursor:text;overflow-wrap:anywhere;white-space:pre-wrap}
.ro .tx,.ro .cs,.ro .num,.ro .tyl,.ro .pri{cursor:default}
.num:hover,.cs:hover,.tx:hover,.pri:hover,.tyl:hover{border-color:var(--border);background:var(--surface)}
.num:focus,.cs:focus,.tx:focus,.pri:focus,.tyl:focus{outline:2px solid var(--accent);outline-offset:0;background:var(--surface);position:relative;z-index:1}
.tyl{font-size:12px;font-weight:600;border-radius:999px;padding:2px 12px;cursor:pointer;color:var(--text);appearance:none;-webkit-appearance:none;text-align-last:left;max-width:100%}
.tyl.p{background:color-mix(in srgb,var(--accent-lavender,#C4B5FD) 45%,var(--surface))}
.tyl.r{background:color-mix(in srgb,var(--accent-butter,#EEF3C7) 80%,var(--surface));color:#2B2A1E}
.tyl.inf{font-style:italic}
.fl{display:inline-grid;place-items:center;width:15px;height:15px;border-radius:50%;background:var(--warn-bg,#FAEEDA);color:var(--warn,#8A5A0C);font-size:10px;font-weight:700;font-style:normal;margin-left:5px;vertical-align:1px;cursor:help}
.pri{min-width:32px;height:24px;font-weight:700;font-size:12px;cursor:pointer;padding:0 8px;text-align:center;text-align-last:center;appearance:none;-webkit-appearance:none;border-radius:7px}
.pri.A{background:color-mix(in srgb,var(--accent-mint,#99F6E4) 60%,var(--surface));color:#2B2A1E}
.pri.B{background:color-mix(in srgb,var(--accent-butter,#EEF3C7) 80%,var(--surface));color:#2B2A1E}
.pri.C{background:color-mix(in srgb,var(--accent-coral,#FF9B9B) 40%,var(--surface));color:#2B2A1E}
.gap{color:var(--muted2)}
.xt td.ro.z{color:var(--muted2)}
.uv{font-variant-numeric:tabular-nums;padding-right:4px}
.tri{position:absolute;right:0;bottom:0;width:13px;height:13px;background:linear-gradient(135deg,transparent 50%,var(--tri) 50%);cursor:help;z-index:1;display:block}
.tip{position:fixed;z-index:200;max-width:300px;background:var(--text);color:var(--bg);border-radius:10px;padding:9px 12px;font-size:12.5px;line-height:1.5;box-shadow:0 8px 24px rgba(0,0,0,.25);pointer-events:none;display:none}
.tip b{display:block;margin-bottom:4px}
.tip div{display:flex;flex-direction:column;padding:3px 0;border-top:1px solid color-mix(in srgb,var(--bg) 25%,transparent)}
.tip div:first-of-type{border-top:0}
.tip em{font-style:normal;opacity:.75;font-size:11.5px}
.howh{margin:22px 0 10px;font-size:13px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--muted)}
.howto{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px}
.howto div{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:11px 14px;font-size:14px;line-height:1.45;color:var(--text)}
.howto div>b{display:block;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin-bottom:3px}
.newsku{margin-top:14px;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:12px 14px}
.newsku h3{margin:0 0 6px;font-size:14px}
.newsku ul{margin:6px 0 10px;padding-left:18px;font-size:13px;color:var(--muted)}
#toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:var(--accent);color:var(--accent-fg);padding:9px 18px;border-radius:999px;font-size:13px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,.25);opacity:0;pointer-events:none;transition:opacity .2s;z-index:260;max-width:90vw;text-align:center}
#toast.on{opacity:1}

/* upload new prices */
.mdl{position:fixed;inset:0;z-index:240;background:rgba(26,26,26,.45);display:none;align-items:center;justify-content:center;padding:16px}
.mdl-in{width:min(680px,100%);max-height:88vh;overflow:auto;background:var(--surface);color:var(--text);border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,.3);padding:18px 20px}
.mdl-in h2{margin:0 0 4px;font-size:18px}
.mdl-in p{margin:0 0 10px;color:var(--muted);font-size:13.5px}
.mdl label.f{display:block;font-size:12px;font-weight:600;color:var(--muted);margin:10px 0 3px}
.mdl .fin2{width:100%;border:1px solid var(--border);border-radius:8px;background:var(--surface2);padding:7px 10px;font-size:14px}
.mdl .two{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.mdl .three{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
.mdl .sumrow{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0}
.mdl .sumrow span{font-size:12.5px;font-weight:600;border-radius:999px;padding:3px 11px;background:var(--surface2);border:1px solid var(--border)}
.mdl table{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums;margin-top:6px}
.mdl th{font-size:12px;color:var(--muted);text-align:right;padding:4px 6px;border-bottom:1px solid var(--border)}
.mdl td{padding:5px 6px;border-bottom:1px solid var(--border2);text-align:right}
.mdl th:first-child,.mdl td:first-child{text-align:left}
.mdl .acts{display:flex;gap:8px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap}
.mdl .keep{font-size:12.5px;color:var(--muted);background:var(--surface2);border-radius:10px;padding:8px 12px;margin-top:10px}
@media (max-width:520px){.mdl .two,.mdl .three{grid-template-columns:1fr}}

/* header filter menu, like Google Sheets */
.fm{position:fixed;z-index:150;width:288px;max-height:min(560px,calc(100vh - 20px));overflow:auto;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,.25);padding:6px 0;display:none;font-size:13.5px}
.fm .it{display:flex;gap:10px;align-items:center;width:100%;padding:8px 14px;border:0;background:none;cursor:pointer;text-align:left;font-size:13.5px}
.fm .it:hover{background:var(--surface2)}
.fm .it.on{color:var(--ok);font-weight:600}
.fm hr{border:0;border-top:1px solid var(--border);margin:6px 0}
.fm .sec{padding:2px 14px 6px}
.fm .sh{display:flex;justify-content:space-between;align-items:center;width:100%;border:0;background:none;padding:6px 0;font-size:12.5px;font-weight:600;color:var(--muted);cursor:pointer}
.fm select,.fm .fin{width:100%;border:1px solid var(--border);border-radius:8px;background:var(--surface2);padding:6px 9px;font-size:13px;margin-top:4px}
.fm .row2{display:flex;gap:6px}
.fm .vact{display:flex;gap:12px;font-size:12px;margin:6px 0 4px;align-items:center}
.fm .vact button{border:0;background:none;color:var(--ok);cursor:pointer;padding:0;text-decoration:underline;font-size:12px}
.fm .vact span{margin-left:auto;color:var(--muted2)}
.fm .vl{max-height:190px;overflow:auto;border:1px solid var(--border2);border-radius:8px;padding:4px 6px;margin-top:4px}
.fm .vl label{display:flex;gap:8px;align-items:center;padding:3px 2px;cursor:pointer}
.fm .vl label span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fm .vl label em{font-style:normal;color:var(--muted2);font-size:11.5px}
.fm .btns{display:flex;justify-content:flex-end;gap:8px;padding:8px 14px 6px}
.fm .go{border:1px solid var(--accent);background:var(--accent);color:var(--accent-fg);border-radius:999px;padding:6px 16px;font-size:13px;font-weight:600;cursor:pointer}
.fm .go.ghost{background:none;color:var(--text);border-color:var(--border)}
.fm button:focus-visible,.fm input:focus-visible,.fm select:focus-visible{outline:2px solid var(--accent);outline-offset:1px}

@container (max-width:760px){
  .xt .c-cat{display:none}
  .xt .c-name{left:0;width:176px;min-width:176px;max-width:176px}
  #q{min-width:0;width:100%}
  .dl{margin-left:0}
  .psel{max-width:100%}
}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
`;

  /* ---------- state ---------- */
  let host = null, root = null, wired = false;
  const S = {
    rows: [], months: [], edits: {}, lists: [], listId: null, win: null, usage: null, basis: null, asof: {}, newSkus: [], access: { edit: false },
    brs: B.slice(), from: null, to: null, loadedAt: 0, loadedKey: '', cmp: true,
    F: {}, sort: null, q: '', view: [], menu: null, imp: null
  };
  const $ = id => root.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const f = n => Math.round(n).toLocaleString('en-US');
  const f2 = n => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pad = n => (n < 10 ? '0' : '') + n;
  const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const dmy = s => { const p = String(s || '').slice(0, 10).split('-'); return p.length === 3 ? (+p[2]) + ' ' + MON[+p[1] - 1] + ' ' + p[0] : ''; };
  const fmtAt = s => { const d = new Date(s); return isNaN(d) ? '' : d.getDate() + ' ' + MON[d.getMonth()] + ', ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const pct1 = x => (x > 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
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
  const brLabel = () => S.brs.length === B.length ? 'All UAE branches' : S.brs.map(b => BN[b]).join(' + ');

  /* ---------- data in ---------- */
  function ingest(d) {
    S.access = d.access || { edit: false };
    S.months = d.months || []; S.win = d.window; S.usage = d.usage; S.basis = d.basis; S.asof = d.stock_asof || {};
    S.lists = d.lists || []; S.listId = d.list_id; S.newSkus = d.new_skus || [];
    S.rows = d.rows || [];
    S.edits = {};
    (d.edits || []).forEach(e => { const k = e[0] + '|' + e[1]; (S.edits[k] = S.edits[k] || { n: e[6], list: [] }).list.push({ who: e[2], at: e[3], from: e[4], to: e[5] }); });
    S.rows.forEach(calc);
    Object.keys(S.F).forEach(k => { if (+k >= MO) delete S.F[k]; });
    if (S.sort && S.sort.k >= MO) S.sort = null;
  }
  function days() { return S.win && S.win.days ? S.win.days : 0; }
  function calc(r) {
    const tot = r[U].reduce((a, x) => a + x, 0);
    r[AVG] = days() ? tot / days() * 7 : 0;
    r[MINV] = (r[MIN] != null && r[COST] != null) ? Math.round(r[MIN] * r[COST] * 100) / 100 : null;
    r[MAXV] = (r[MAX] != null && r[COST] != null) ? Math.round(r[MAX] * r[COST] * 100) / 100 : null;
    r[WK] = r[COST] != null ? Math.round(r[AVG] * r[COST] * 100) / 100 : null;
  }
  async function load(listId) {
    const w = wantWindow();
    const { data, error } = await sb.rpc('spend_plan', { p_from: w.from, p_to: w.to, p_list: listId || null });
    if (error) throw error;
    S.from = w.from; S.to = w.to; S.loadedAt = Date.now(); S.loadedKey = (w.from || '') + '|' + (w.to || '');
    return data;
  }

  /* ---------- columns, values, filters ---------- */
  function mlab(m) {
    const a = new Date(m.from + 'T00:00:00'), z = new Date(m.to + 'T00:00:00'), last = new Date(a.getFullYear(), a.getMonth() + 1, 0).getDate();
    return MON[a.getMonth()] + ((a.getDate() !== 1 || z.getDate() !== last) ? ' ' + a.getDate() + '-' + z.getDate() : '');
  }
  function cols() {
    const c = [['Category', '', CAT, 'l c-cat', 's'], ['Product', '', NAME, 'l c-name', 's'], ['Type', 'Hair Professional or Hair Retail', TYPE, 'l c-type', 's'], ['In stock now', 'on the shelf, Phorest', STK, 'c-n c-stk', 'n']];
    S.months.forEach((m, i) => c.push([mlab(m), '', MO + i, 'c-m', 'n']));
    c.push(['Avg Units / Week', '@avg', AVG, 'c-avg', 'n'], ['PRIORITY', '', PRIO, 'c-pr', 's'], ['Suggested Min Units', '', MIN, 'c-n', 'n'], ['Suggested Max Units', '', MAX, 'c-n', 'n'],
      ['Usage Unit Cost AED', '@price', COST, 'c-n c-uc', 'n'], ['Min Stock Value AED', '', MINV, 'c-n', 'n'], ['Max Stock Value AED', '', MAXV, 'c-n', 'n'],
      ['Avg Weekly Usage Cost AED', '', WK, 'c-n', 'n'], ['Match Status', '', STAT, 'l c-st', 's'], ['Stock List Price AED', '', SALE, 'c-n', 'n']);
    return c;
  }
  const colOf = k => cols().find(c => c[2] === k);
  const raw = (r, k) => k >= MO ? r[U][k - MO] : r[k];
  function shown(r, k) {
    const v = raw(r, k);
    if (v == null || v === '') return '';
    if (k === TYPE) return v === 'r' ? 'Hair Retail' : 'Hair Professional';
    if (k === AVG || k === COST || k === WK || k === SALE) return f2(v);
    if (k === MINV || k === MAXV || k === STK) return f(v);
    return String(v);
  }
  const vkey = (r, k) => { const s = shown(r, k); return s === '' ? '(Blanks)' : s; };
  const OPS_S = [['', 'None'], ['empty', 'Is empty'], ['notempty', 'Is not empty'], ['contains', 'Text contains'], ['notcontains', 'Text does not contain'], ['starts', 'Text starts with'], ['ends', 'Text ends with'], ['eq', 'Text is exactly']];
  const OPS_N = [['', 'None'], ['empty', 'Is empty'], ['notempty', 'Is not empty'], ['eq', 'Is equal to'], ['ne', 'Is not equal to'], ['gt', 'Greater than'], ['ge', 'Greater than or equal to'], ['lt', 'Less than'], ['le', 'Less than or equal to'], ['between', 'Is between']];
  const opLabel = (k, op) => { const L = colOf(k)[4] === 'n' ? OPS_N : OPS_S; const o = L.find(x => x[0] === op); return o ? o[1] : op; };
  function condPass(r, k, c) {
    if (!c || !c.op) return true;
    const v = raw(r, k), isN = colOf(k)[4] === 'n', txt = shown(r, k).toLowerCase(), a = (c.v1 || '').toLowerCase();
    if (c.op === 'empty') return v == null || v === '';
    if (c.op === 'notempty') return !(v == null || v === '');
    if (isN) {
      if (v == null) return false;
      const x = parseFloat(c.v1), y = parseFloat(c.v2);
      if (isNaN(x)) return true;
      switch (c.op) {
        case 'eq': return v === x; case 'ne': return v !== x; case 'gt': return v > x; case 'ge': return v >= x; case 'lt': return v < x; case 'le': return v <= x;
        case 'between': return isNaN(y) ? true : (v >= Math.min(x, y) && v <= Math.max(x, y));
      }
      return true;
    }
    switch (c.op) {
      case 'contains': return txt.indexOf(a) >= 0; case 'notcontains': return txt.indexOf(a) < 0; case 'starts': return txt.indexOf(a) === 0;
      case 'ends': return a === '' || txt.slice(-a.length) === a; case 'eq': return txt === a;
    }
    return true;
  }
  function passes(r, skip) {
    if (S.brs.indexOf(r[BR]) < 0) return false;
    for (const ks in S.F) {
      const k = +ks; if (k === skip) continue;
      const F = S.F[k];
      if (F.ex && F.ex.length && F.ex.indexOf(vkey(r, k)) >= 0) return false;
      if (F.cond && !condPass(r, k, F.cond)) return false;
    }
    if (S.q) { const q = S.q.toLowerCase(); if ((r[NAME] + ' ' + r[CAT]).toLowerCase().indexOf(q) < 0) return false; }
    return true;
  }
  function viewIdx() {
    const out = []; S.rows.forEach((r, i) => { if (passes(r, -1)) out.push(i); });
    if (S.sort) {
      const k = S.sort.k, d = S.sort.d, isN = colOf(k) && colOf(k)[4] === 'n';
      out.sort((a, b) => {
        const x = raw(S.rows[a], k), y = raw(S.rows[b], k), ex = (x == null || x === ''), ey = (y == null || y === '');
        if (ex && ey) return 0; if (ex) return 1; if (ey) return -1;
        return isN ? (x - y) * d : String(shown(S.rows[a], k)).localeCompare(String(shown(S.rows[b], k))) * d;
      });
    }
    return out;
  }

  /* ---------- price lists ---------- */
  const curList = () => S.lists.find(l => l.id === S.listId) || S.lists[0];
  const listLabel = l => 'Price list ' + l.n + ': ' + l.name;
  function deltaOf(r) {
    const c = curList(); if (!c || c.n < 2 || !S.cmp) return null;
    const a = r[PREV], b = r[COST];
    if (a == null || b == null || !a || Math.abs(b - a) < 0.005) return null;
    return { pct: (b - a) / a };
  }
  const k1 = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const toks = s => String(s || '').toLowerCase().match(/[a-z0-9]+/g) || [];
  function jac(a, b) { const A = new Set(a), Bs = new Set(b); let n = 0; A.forEach(x => { if (Bs.has(x)) n++; }); const u = A.size + Bs.size - n; return u ? n / u : 0; }
  const barcodeOf = r => { const p = String(r[K]).split('|'); return p.length >= 4 ? p[p.length - 1] : ''; };
  // Work out what a file does to the products on the sheet: same price, changed, renamed, not in the file any more, new.
  function buildImport(items, meta) {
    const names = {};   // one entry per product name, shared by every salon that has it
    S.rows.forEach(r => { if (r[BR] === undefined) return; const key = k1(r[NAME]); (names[key] = names[key] || { name: r[NAME], rows: [], cost: null }).rows.push(r); if (names[key].cost == null && r[COST] != null) names[key].cost = r[COST]; });
    const byName = {}, byCode = {};
    items.forEach(it => { byName[k1(it.name)] = it; if (it.code) byCode[it.code] = it; });
    const used = new Set(), I = { meta, links: [], renamed: [], removed: [], added: [], changed: [], same: 0, total: items.length, price: {} };
    const left = [], pending = [];
    Object.keys(names).forEach(key => {
      const n = names[key];
      let it = null;
      const bc = n.rows.map(barcodeOf).find(c => c && byCode[c]);
      if (bc) it = byCode[bc]; else if (byName[key]) it = byName[key];
      if (it) { used.add(it); link(n, it, null); } else pending.push(n);
    });
    items.forEach(it => { if (!used.has(it)) left.push(it); });
    pending.forEach(n => {
      const tp = toks(n.name); let best = null, bs = 0;
      left.forEach(it => { const s = jac(tp, toks(it.name)); if (s > bs) { bs = s; best = it; } });
      if (best && bs >= 0.7) { left.splice(left.indexOf(best), 1); used.add(best); link(n, best, best.name); I.renamed.push({ from: n.name, to: best.name }); }
      else { n.rows.forEach(r => I.links.push([r[K], 'removed', null, null, n.name])); I.removed.push(n.name); }
    });
    left.forEach(it => I.added.push(it));
    I.changed.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
    return I;
    function link(n, it, newName) {
      n.rows.forEach(r => {
        const same = r[COST] != null && Math.abs(it.price - r[COST]) < 0.005;
        I.links.push([r[K], newName ? 'renamed' : (same ? 'same' : 'changed'), it.price, newName, n.name]);
      });
      if (n.cost == null) I.changed.push({ name: n.name, old: null, nw: it.price, pct: 0 });
      else if (Math.abs(it.price - n.cost) < 0.005) I.same++;
      else I.changed.push({ name: n.name, old: n.cost, nw: it.price, pct: (it.price - n.cost) / n.cost });
    }
  }
  function parseCsv(t) {
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (q) { if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true;
      else if (c === ',' || c === ';' || c === '\t') { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.length > 1 || row[0] !== '') rows.push(row); row = []; }
      else cur += c;
    }
    row.push(cur); if (row.length > 1 || row[0] !== '') rows.push(row);
    return rows;
  }
  // A small .xlsx reader (a zip of XML files): the first sheet only, text and numbers. The browser's own inflate does the unzipping.
  async function inflateRaw(u8) { return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()); }
  async function readXlsx(buf) {
    const dv = new DataView(buf), u8 = new Uint8Array(buf), dec = new TextDecoder();
    let e = u8.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error('not an xlsx file');
    const n = dv.getUint16(e + 10, true), files = {}; let p = dv.getUint32(e + 16, true);
    for (let i = 0; i < n && dv.getUint32(p, true) === 0x02014b50; i++) {
      const nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
      files[dec.decode(u8.subarray(p + 46, p + 46 + nl))] = { method: dv.getUint16(p + 10, true), csize: dv.getUint32(p + 20, true), lo: dv.getUint32(p + 42, true) };
      p += 46 + nl + el + cl;
    }
    const get = async name => {
      const z = files[name]; if (!z) return null;
      const start = z.lo + 30 + dv.getUint16(z.lo + 26, true) + dv.getUint16(z.lo + 28, true), data = u8.subarray(start, start + z.csize);
      return dec.decode(z.method === 0 ? data : await inflateRaw(data));
    };
    const parse = x => new DOMParser().parseFromString(x, 'application/xml');
    const ss = await get('xl/sharedStrings.xml'), shared = [];
    if (ss) Array.from(parse(ss).getElementsByTagName('si')).forEach(si => shared.push(Array.from(si.getElementsByTagName('t')).map(t => t.textContent).join('')));
    const sheetName = Object.keys(files).filter(k => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort((a, b) => parseInt(a.replace(/\D/g, ''), 10) - parseInt(b.replace(/\D/g, ''), 10))[0];
    if (!sheetName) throw new Error('no sheet');
    const rows = [];
    Array.from(parse(await get(sheetName)).getElementsByTagName('row')).forEach(rw => {
      const out = [];
      Array.from(rw.getElementsByTagName('c')).forEach(c => {
        const ref = (c.getAttribute('r') || '').replace(/\d/g, ''); let ci = 0; for (const ch of ref) ci = ci * 26 + (ch.charCodeAt(0) - 64); ci--;
        const t = c.getAttribute('t'), v = c.getElementsByTagName('v')[0];
        let val = '';
        if (t === 's') val = shared[+(v ? v.textContent : -1)] || '';
        else if (t === 'inlineStr') val = Array.from(c.getElementsByTagName('t')).map(x => x.textContent).join('');
        else if (v) val = v.textContent;
        if (ci >= 0) out[ci] = val;
      });
      if (out.some(x => x !== undefined && String(x).trim() !== '')) rows.push(Array.from(out, x => x === undefined ? '' : x));
    });
    return rows;
  }
  // Find the header row and the Product, Price and optional Barcode columns; the dialog lets the person change the choice.
  function guessColumns(rows) {
    for (let i = 0; i < Math.min(rows.length, 25); i++) {
      const h = rows[i].map(x => String(x).trim());
      let pi = -1, qi = -1, bi = -1, qs = 0;
      h.forEach((x, j) => {
        if (pi < 0 && /product|description|item|article|name/i.test(x) && !/code|barcode|ean/i.test(x)) pi = j;
        if (bi < 0 && /barcode|ean|gtin|upc/i.test(x)) bi = j;
        const sc = /net|cost|dealer|wholesale|trade|salon/i.test(x) && /price|cost|aed|net/i.test(x) ? 3 : /price|cost|aed|net|rate/i.test(x) ? 1 : 0;
        if (sc > qs) { qs = sc; qi = j; }
      });
      if (pi >= 0 && qi >= 0) return { hdr: i, pi, qi, bi };
    }
    return null;
  }
  function itemsFrom(rows, g) {
    const out = [];
    rows.slice(g.hdr + 1).forEach(r => {
      let s = String(r[g.qi] == null ? '' : r[g.qi]).trim().replace(/\s/g, '');
      if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.'); else s = s.replace(/,/g, '');
      const p = parseFloat(s.replace(/[^0-9.\-]/g, ''));
      const name = String(r[g.pi] == null ? '' : r[g.pi]).trim();
      if (name && !isNaN(p)) out.push({ name, price: p, code: g.bi >= 0 ? String(r[g.bi] == null ? '' : r[g.bi]).trim() : '' });
    });
    return out;
  }
  function openPrices() { S.imp = null; drawMdl(); $('mdl').style.display = 'flex'; }
  function closePrices() { $('mdl').style.display = 'none'; S.imp = null; }
  function colOpts(hdr, cur, none) { return (none ? '<option value="-1">' + none + '</option>' : '') + hdr.map((h, j) => '<option value="' + j + '"' + (j === cur ? ' selected' : '') + '>' + esc(String(h).trim() || ('Column ' + (j + 1))) + '</option>').join(''); }
  function drawMdl(keep) {
    const prev = keep || {}, nxt = (S.lists.length ? Math.max.apply(null, S.lists.map(l => l.n)) : 0) + 1, defName = prev.name || 'New price list', defDate = prev.date || '';
    let h = '<h2>Upload new prices</h2><p>When the supplier changes its SKUs and prices, upload the new list here. It is saved as a <b>new, dated price list</b> and every list before it is kept, so you can switch back to any of them.</p>' +
      '<label class="f" for="pname">Name of this price list</label><input class="fin2" id="pname" type="text" maxlength="160" value="' + esc(defName) + '">' +
      '<div class="two"><div><label class="f" for="pdate">Prices apply from</label><input class="fin2" id="pdate" type="date" value="' + esc(defDate) + '"></div>' +
      '<div><label class="f" for="pfile">The supplier\'s file (Excel or CSV)</label><input class="fin2" id="pfile" type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></div></div>';
    const I = S.imp;
    if (I && I.raw) {
      const hdr = I.raw.rows[I.g.hdr] || [];
      h += '<div class="three"><div><label class="f" for="cpi">Product column</label><select class="fin2" id="cpi" data-col="pi">' + colOpts(hdr, I.g.pi) + '</select></div>' +
        '<div><label class="f" for="cqi">Price column</label><select class="fin2" id="cqi" data-col="qi">' + colOpts(hdr, I.g.qi) + '</select></div>' +
        '<div><label class="f" for="cbi">Barcode column (helps matching)</label><select class="fin2" id="cbi" data-col="bi">' + colOpts(hdr, I.g.bi, 'None') + '</select></div></div>';
    }
    if (I && I.imp) {
      const X = I.imp, ch = X.changed.filter(c => c.old != null); let avg = 0; ch.forEach(c => { avg += c.pct; }); avg = ch.length ? avg / ch.length : 0;
      h += '<div class="sumrow"><span>' + X.total + ' lines in the file</span><span>' + ch.length + ' price changes' + (ch.length ? ', average ' + pct1(avg) : '') + '</span><span>' + X.same + ' unchanged</span><span>' + X.renamed.length + ' renamed</span><span>' + X.removed.length + ' not in the new list</span><span>' + X.added.length + ' new SKUs</span></div>';
      if (X.changed.length) h += '<table><thead><tr><th>Biggest price changes</th><th>Old AED</th><th>New AED</th><th>Change</th></tr></thead><tbody>' + X.changed.slice(0, 8).map(c => '<tr><td>' + esc(c.name) + '</td><td>' + (c.old == null ? '-' : f2(c.old)) + '</td><td>' + f2(c.nw) + '</td><td>' + (c.old == null ? 'new cost' : pct1(c.pct)) + '</td></tr>').join('') + '</tbody></table>';
      if (X.renamed.length) h += '<p style="margin-top:8px"><b>Renamed:</b> ' + X.renamed.slice(0, 3).map(x => esc(x.from) + ' &rarr; ' + esc(x.to)).join('; ') + (X.renamed.length > 3 ? ' and ' + (X.renamed.length - 3) + ' more' : '') + '.</p>';
      if (X.removed.length) h += '<p><b>Not in the new list:</b> ' + X.removed.slice(0, 3).map(esc).join('; ') + (X.removed.length > 3 ? ' and ' + (X.removed.length - 3) + ' more' : '') + '. They stay on the sheet, tagged, at their old price.</p>';
      if (X.added.length) h += '<p><b>New SKUs:</b> ' + X.added.slice(0, 3).map(x => esc(x.name)).join('; ') + (X.added.length > 3 ? ' and ' + (X.added.length - 3) + ' more' : '') + '. You can add them to the sheet after saving.</p>';
      h += '<div class="keep"><b>Where it is kept.</b> The new list is saved in the database as a dated price list next to the old ones, with the file you uploaded and your name. Nothing is overwritten, so past months keep the prices they were bought at.</div>';
    } else if (I && I.err) h += '<p style="color:var(--over)">' + esc(I.err) + '</p>';
    h += '<div class="acts"><button type="button" class="btn" data-p="cancel">Cancel</button><button type="button" class="btn pri" data-p="save"' + (I && I.imp && !I.busy ? '' : ' disabled') + '>' + (I && I.busy ? 'Saving...' : 'Save as Price list ' + nxt) + '</button></div>';
    $('mdlIn').innerHTML = h;
  }
  const formVals = () => { const a = $('pname'), b = $('pdate'); return { name: a ? a.value : '', date: b ? b.value : '' }; };
  function runImport(fv) {
    const I = S.imp; I.err = ''; I.imp = null;
    const items = itemsFrom(I.raw.rows, I.g);
    if (!items.length) { I.err = 'No lines with a product name and a price were found with these columns. Pick the right columns above.'; drawMdl(fv); return; }
    I.imp = buildImport(items, { file: I.file.name }); drawMdl(fv);
  }
  async function onFile(file, fv) {
    S.imp = { file, raw: null, g: null, imp: null };
    try {
      let rows;
      if (/\.xlsx$/i.test(file.name)) rows = await readXlsx(await file.arrayBuffer());
      else if (/\.xls$/i.test(file.name)) { S.imp.err = 'Old .xls files cannot be read. Save it as .xlsx or CSV and choose it again.'; drawMdl(fv); return; }
      else rows = parseCsv(await file.text());
      const g = guessColumns(rows);
      if (!g) { S.imp.err = 'Could not find a Product column and a Price column in that file.'; drawMdl(fv); return; }
      S.imp.raw = { rows }; S.imp.g = g; runImport(fv);
    } catch (e) { console.error(e); S.imp.err = 'That file could not be read. Try saving it as CSV.'; drawMdl(fv); }
  }
  async function savePrices() {
    const I = S.imp, fv = formVals();
    if (!I || !I.imp || I.busy) return;
    const name = (fv.name || '').trim(), when = fv.date;
    if (!name) { toast('Give the price list a name.'); return; }
    if (!when) { toast('Pick the date the prices apply from.'); return; }
    I.busy = true; drawMdl(fv);
    try {
      const safe = I.file.name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80), path = new Date().toISOString().replace(/[:.]/g, '-') + '-' + safe;
      const up = await sb.storage.from('price-lists').upload(path, I.file, { upsert: false, contentType: I.file.type || undefined });
      if (up.error) throw up.error;
      const X = I.imp, links = X.links.concat(X.added.map(it => [null, 'new', it.price, null, it.name]));
      const res = await sb.rpc('plan_price_save', { p_name: name, p_from: when, p_file: I.file.name, p_path: path, p_items: X.total ? itemsFrom(I.raw.rows, I.g).map(it => [it.name, it.price]) : [], p_links: links });
      if (res.error) throw res.error;
      S.imp = null; $('mdl').style.display = 'none';
      const d = await load(res.data.id); ingest(d); draw();
      toast('Saved as Price list ' + curList().n + '. The earlier lists are kept, pick any of them in Prices.');
    } catch (e) { console.error(e); I.busy = false; I.err = 'The price list did not save. Nothing was changed. Try again.'; drawMdl(fv); }
  }
  async function addNewSkus() {
    const c = curList();
    const { error } = await sb.rpc('plan_add_new_skus', { p_list: c.id, p_branches: S.brs });
    if (error) { console.error(error); toast('The new SKUs did not save.'); return; }
    ingest(await load(c.id)); draw(); toast('New SKUs added to the sheet, with their new price and no usage yet.');
  }
  async function openFile(path) {
    const { data, error } = await sb.storage.from('price-lists').createSignedUrl(path, 120);
    if (error || !data) { toast('The file could not be opened.'); return; }
    window.open(data.signedUrl, '_blank', 'noopener');
  }

  /* ---------- edit history ---------- */
  const triHtml = (r, k) => S.edits[r[K] + '|' + FIELD[k]] ? '<i class="tri" tabindex="0" data-key="' + esc(r[K] + '|' + FIELD[k]) + '" data-col="' + k + '" aria-label="Edit history, hover or focus to see who edited this cell"></i>' : '';
  function fmtVal(k, v) {
    if (v == null || v === '') return '(blank)';
    if (k === TYPE) return v === 'r' ? 'Hair Retail' : v === 'p' ? 'Hair Professional' : v;
    return String(v);
  }
  function showTip(el) {
    const E = S.edits[el.getAttribute('data-key')]; if (!E) return;
    const k = +el.getAttribute('data-col'), names = [];
    E.list.forEach(e => { if (names.indexOf(e.who) < 0) names.push(e.who); });
    let h = '<b>Edited by ' + names.map(esc).join(', ') + '</b>';
    E.list.slice(0, 6).forEach(e => { h += '<div><span>' + esc(e.who) + '</span><em>' + fmtAt(e.at) + ' &middot; ' + esc(fmtVal(k, e.from)) + ' &rarr; ' + esc(fmtVal(k, e.to)) + '</em></div>'; });
    if (E.n > 6) h += '<div><em>and ' + (E.n - 6) + ' earlier edits</em></div>';
    placeTip(el, h);
  }
  // Kate, 12 Nov 2026: the "!" next to a Type used the browser's own title tooltip, a small box that was clipped and hard to read. It now uses
  // the page's own tip (readable size, wraps, stays inside the window), on hover and on keyboard focus like the edit-history triangle.
  function showSay(el) { const t = el.getAttribute('data-say'); if (t) placeTip(el, esc(t)); }
  function placeTip(el, h) {
    const tip = $('tip'); tip.innerHTML = h; tip.style.display = 'block';
    const r = el.getBoundingClientRect(), w = tip.offsetWidth, hh = tip.offsetHeight;
    tip.style.left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)) + 'px';
    let top = r.bottom + 6; if (top + hh > window.innerHeight - 8) top = Math.max(8, r.top - hh - 6);
    tip.style.top = top + 'px';
  }
  const hideTip = () => { const t = root && $('tip'); if (t) t.style.display = 'none'; };

  /* ---------- the sheet ---------- */
  const dash = (x, fn) => x == null ? '<span class="gap">-</span>' : fn(x);
  const heat = r => Math.max.apply(null, [0].concat(r[U]));
  const heatStyle = (v, mx) => { const a = (v && mx) ? Math.round(v / mx * 16) : 0; return a ? 'background-color:color-mix(in srgb,var(--accent) ' + a + '%,var(--surface))' : ''; };
  const catList = () => { const c = {}; S.rows.forEach(r => { c[r[CAT]] = 1; }); return Object.keys(c).sort(); };
  const multi = () => S.brs.length > 1;
  const dis = () => S.access.edit ? '' : ' disabled';
  function pvTag(r) {
    const t = r[TAG]; if (!t) return '';
    const c = curList();
    return '<div class="tg"><span class="tag">' + (t === 'removed' ? 'Not in price list ' + c.n : esc(t)) + '</span></div>';
  }
  function rowHtml(i) {
    const r = S.rows[i], mx = heat(r), d = deltaOf(r), flag = r[FLAG] === 2, ed = S.access.edit;
    let h = '<tr class="rw' + (ed ? '' : ' ro') + '" data-i="' + i + '">' +
      '<td class="c-cat"><select class="cs" data-k="' + CAT + '" aria-label="Category"' + dis() + '><option>' + esc(r[CAT]) + '</option></select>' + triHtml(r, CAT) + '</td>' +
      '<td class="c-name"><div class="tx" contenteditable="' + (ed ? 'true' : 'false') + '" spellcheck="false" data-k="' + NAME + '" role="textbox" aria-label="Product">' + esc(r[NAME]) + '</div>' + (multi() ? '<span class="sal">' + BN[r[BR]] + '</span>' : '') + pvTag(r) + triHtml(r, NAME) + '</td>' +
      '<td class="c-type"><select class="tyl ' + r[TYPE] + (r[FLAG] === 1 ? ' inf' : '') + '" data-k="' + TYPE + '" aria-label="Type"' + dis() + '><option value="p"' + (r[TYPE] === 'p' ? ' selected' : '') + '>Hair Professional</option><option value="r"' + (r[TYPE] === 'r' ? ' selected' : '') + '>Hair Retail</option></select>' +
      (flag ? '<i class="fl" tabindex="0" data-say="The category name says ' + (r[TYPE] === 'r' ? 'Professional' : 'Retail') + ' but Phorest has it as ' + (r[TYPE] === 'r' ? 'retail' : 'professional') + '. Change it here if Phorest is wrong." aria-label="The category name says ' + (r[TYPE] === 'r' ? 'Professional' : 'Retail') + ' but Phorest has it as ' + (r[TYPE] === 'r' ? 'retail' : 'professional') + '. Change it here if Phorest is wrong.">!</i>' : '') + triHtml(r, TYPE) + '</td>' +
      '<td class="c-n c-stk ro" title="From Phorest, not editable here">' + (r[STK] == null ? '<span class="gap">-</span>' : f(r[STK])) + '</td>';
    S.months.forEach((m, j) => { const v = r[U][j]; h += '<td class="c-m ro' + (v ? '' : ' z') + '" style="' + heatStyle(v, mx) + '" title="' + esc(mlab(m)) + ', from Phorest, not editable here">' + v + '</td>'; });
    h += '<td class="c-avg v17">' + f2(r[AVG]) + '</td>' +
      '<td class="c-pr"><select class="pri ' + r[PRIO] + '" data-k="' + PRIO + '" aria-label="Priority"' + dis() + '>' + ['A', 'B', 'C'].map(p => '<option' + (p === r[PRIO] ? ' selected' : '') + '>' + p + '</option>').join('') + '</select>' + triHtml(r, PRIO) + '</td>' +
      '<td class="c-n"><input class="num" type="number" min="0" step="1" data-k="' + MIN + '" aria-label="Suggested min units" value="' + (r[MIN] == null ? '' : r[MIN]) + '"' + dis() + '>' + triHtml(r, MIN) + '</td>' +
      '<td class="c-n"><input class="num" type="number" min="0" step="1" data-k="' + MAX + '" aria-label="Suggested max units" value="' + (r[MAX] == null ? '' : r[MAX]) + '"' + dis() + '>' + triHtml(r, MAX) + '</td>' +
      '<td class="c-n c-uc"><div class="uc">' + (d ? '<span class="dlt ' + (d.pct > 0 ? 'up' : 'dn') + '" title="Change from price list ' + (curList().n - 1) + '">' + (d.pct > 0 ? '&#9650; ' : '&#9660; ') + Math.abs(d.pct * 100).toFixed(1) + '%</span>' : '') + '<span class="uv" title="From Phorest and the price list, not editable here">' + (r[COST] == null ? '<span class="gap">-</span>' : f2(r[COST])) + '</span></div></td>' +
      '<td class="c-n v18">' + dash(r[MINV], f) + '</td><td class="c-n v19">' + dash(r[MAXV], f) + '</td><td class="c-n v20">' + dash(r[WK], f2) + '</td>' +
      '<td class="c-st" title="' + esc(r[STAT]) + '">' + esc(r[STAT]) + '</td><td class="c-n">' + dash(r[SALE], f2) + '</td></tr>';
    return h;
  }
  function totalsHtml() {
    const T = S.months.map(() => 0); let avg = 0, mn = 0, mx = 0, mv = 0, xv = 0, wc = 0, sk = 0;
    S.view.forEach(i => { const r = S.rows[i]; r[U].forEach((v, j) => { T[j] += v; }); avg += r[AVG]; mn += (r[MIN] || 0); mx += (r[MAX] || 0); mv += (r[MINV] || 0); xv += (r[MAXV] || 0); wc += (r[WK] || 0); sk += (r[STK] || 0); });
    let h = '<tr><td class="c-cat">Total</td><td class="c-name">' + S.view.length + ' products shown</td><td class="c-type"></td><td class="c-n c-stk">' + f(sk) + '</td>';
    T.forEach(v => { h += '<td class="c-m">' + f(v) + '</td>'; });
    return h + '<td class="c-avg">' + f2(avg) + '</td><td class="c-pr"></td><td class="c-n">' + f(mn) + '</td><td class="c-n">' + f(mx) + '</td><td class="c-n c-uc"></td><td class="c-n">' + f(mv) + '</td><td class="c-n">' + f(xv) + '</td><td class="c-n">' + f2(wc) + '</td><td class="c-st"></td><td class="c-n"></td></tr>';
  }
  const FUNNEL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18l-7 8v6l-4 2v-8z"/></svg>';
  function theadHtml() {
    const c0 = curList();
    return '<tr>' + cols().map(c => {
      const k = c[2], on = !!S.F[k], sr = S.sort && S.sort.k === k ? '<span class="srt">' + (S.sort.d > 0 ? '&#9650;' : '&#9660;') + '</span>' : '';
      const sub = c[1] === '@avg' ? (days() ? days() + ' days' : 'no usage in this Period') : c[1] === '@price' ? 'price list ' + c0.n : c[1];
      return '<th class="' + c[3] + (on ? ' on' : '') + '"><div class="hd"><span class="hl">' + esc(c[0]) + sr + '</span><button type="button" class="fi' + (on ? ' on' : '') + '" data-fcol="' + k + '" aria-label="Filter and sort ' + esc(c[0]) + '" aria-haspopup="dialog">' + FUNNEL + '</button></div>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</th>';
    }).join('') + '</tr>';
  }
  const tbodyHtml = () => S.view.length ? S.view.map(rowHtml).join('') : '<tr><td colspan="' + cols().length + '" style="text-align:center;padding:30px;color:var(--muted)">No product matches these filters.</td></tr>';
  function chipsHtml() {
    return Object.keys(S.F).map(ks => {
      const k = +ks, F = S.F[k], parts = [];
      if (F.ex && F.ex.length) { const keys = valueList(k).map(x => x.key), inc = keys.filter(x => F.ex.indexOf(x) < 0); parts.push(inc.length && inc.length <= 2 ? inc.join(', ') : (F.ex.length + ' hidden')); }
      if (F.cond) parts.push(opLabel(k, F.cond.op).toLowerCase() + (F.cond.v1 ? ' ' + F.cond.v1 : '') + (F.cond.op === 'between' ? ' and ' + F.cond.v2 : ''));
      return '<button type="button" class="chip" data-clear="' + k + '" title="Remove this filter">' + esc(colOf(k)[0]) + ': ' + esc(parts.join('; ')) + ' <b>&times;</b></button>';
    }).join('');
  }
  function newSkuHtml() {
    const c = curList(); if (!c || c.n < 2 || c.new_added || !S.newSkus.length || !S.access.edit) return '';
    return '<div class="newsku"><h3>' + S.newSkus.length + ' new SKUs in price list ' + c.n + ', not on the sheet yet</h3><ul>' + S.newSkus.slice(0, 5).map(x => '<li>' + esc(x[0]) + ', AED ' + f2(Number(x[1])) + '</li>').join('') + (S.newSkus.length > 5 ? '<li>and ' + (S.newSkus.length - 5) + ' more</li>' : '') + '</ul><button type="button" class="btn pri" data-act="addsku">Add them to the sheet (' + brLabel() + ')</button></div>';
  }
  function windowNote() {
    const w = S.win, u = S.usage;
    if (!w || !w.days) return '';
    let t = 'Usage from ' + dmy(w.from) + ' to ' + dmy(w.to) + ', ' + w.days + ' days.';
    if (w.asked_to && w.asked_to > w.to) t += ' The usage report is loaded to ' + dmy(u.last) + ', so the Period stops there.';
    return t;
  }
  function render() {
    S.view = viewIdx();
    const c = curList(), nf = Object.keys(S.F).length, edits = Object.keys(S.edits).length;
    const psel = S.lists.map(l => '<option value="' + l.id + '"' + (l.id === S.listId ? ' selected' : '') + '>' + esc(listLabel(l)) + '</option>').join('');
    const nowarn = S.win && !S.win.days;
    $('pg').innerHTML =
      '<h1 class="t">Weekly Product Plan</h1><p class="sub">One row per product per salon, built from Phorest. Branch and Period are the filters at the top of the page. Category, product, type, priority, min and max can be changed and every change is saved with your name; what comes from Phorest cannot be changed here. Use the funnel in a column header to sort or filter, like Google Sheets.</p>' +
      (nowarn ? '<div class="warnbox">There is no usage in this Period. Phorest usage is loaded from ' + dmy(S.usage.first) + ' to ' + dmy(S.usage.last) + '. Pick a Period inside those dates (Last month, Month, Year or Custom) to see the weekly figures.</div>' : '') +
      '<div class="fbar"><span class="lab">Prices</span><select class="psel" id="psel" aria-label="Price list">' + psel + '</select>' +
      (S.access.edit ? '<button type="button" class="btn" data-act="upload">Upload new prices</button>' : '') +
      (c && c.n > 1 ? '<label class="chk"><input type="checkbox" id="cmp"' + (S.cmp ? ' checked' : '') + '> Show the change from list ' + (c.n - 1) + '</label>' : '') + '</div>' +
      '<p class="pnote">Every price list is kept. Pick an older one to see the sheet at the prices of that time. ' + (c && c.source === 'upload' ? 'Saved ' + fmtAt(c.at) + ' by ' + esc(c.by) + (c.file ? ', file ' + (c.has_file ? '<a href="#" data-file="' + esc(c.path) + '">' + esc(c.file) + '</a>' : esc(c.file)) : '') + '.' : 'List 1 is the cost Phorest held on 12 Nov 2026, saved so it can be compared when the new list comes.') + ' ' + esc(windowNote()) + '</p>' +
      '<div class="fbar"><input id="q" type="search" placeholder="Search a product" aria-label="Search a product" value="' + esc(S.q) + '"><span class="fg" id="chips">' + chipsHtml() + '</span>' +
      (nf || S.sort ? '<button type="button" class="rs" data-act="clearall">Clear filters and sort</button>' : '') +
      '<span class="cnt" id="cnt"></span>' +
      '<span class="dl" role="group" aria-label="Download this report"><button type="button" onclick="rexRun(\'spendExport\',\'xlsx\',this)" title="Download as an Excel file">XLSX</button><button type="button" onclick="rexRun(\'spendExport\',\'csv\',this)" title="Download as a CSV file">CSV</button></span></div>' +
      '<div class="sheet"><div class="xw" id="xw"><table class="xt"><thead id="th">' + theadHtml() + '</thead><tbody id="tb">' + tbodyHtml() + '</tbody><tfoot id="tf">' + totalsHtml() + '</tfoot></table></div></div>' +
      newSkuHtml() + '<h2 class="howh">How to read this</h2><div class="howto" id="foot"></div>';
    refreshMeta();
  }
  function refreshMeta() {
    const all = S.rows.filter(r => S.brs.indexOf(r[BR]) >= 0), cf = all.filter(r => r[FLAG] === 2).length, orph = all.filter(r => r[FLAG] === 1).length, edits = Object.keys(S.edits).length, b = S.basis || {};
    $('cnt').innerHTML = S.view.length + ' of ' + all.length + ' products &middot; ' + brLabel() + (edits ? ' &middot; ' + edits + ' cells edited' : '');
    const asof = Object.keys(S.asof).filter(x => S.brs.indexOf(x) >= 0).map(x => S.asof[x]).sort()[0];
    const card = (t, h) => '<div><b>' + t + '</b>' + h + '</div>';
    $('foot').innerHTML =
      card('Type', 'The stock type Phorest holds. Colour products are always professional.' + (cf ? ' <i class="fl">!</i> marks the ' + cf + ' products where the category name and Phorest disagree, so change the Type in Phorest if it is wrong.' : '')) +
      (orph ? card('Not on the Stock List', 'The ' + orph + ' products in italics had usage but are not on the Stock List any more, so they have no shelf stock.') : '') +
      card('In stock now', 'The quantity Phorest shows on the shelf' + (asof ? ' (Stock List of ' + dmy(asof) + ')' : '') + '. A negative number is what Phorest holds.') +
      card('From Phorest', 'The months, In stock now and Usage Unit Cost come from Phorest and the price list, so they cannot be edited here.') +
      card('Avg Units / Week', 'The units of the Period chosen at the top, divided by its days, times 7' + (days() ? ' (' + days() + ' days now)' : '') + '.') +
      card('Min and Max', 'Start as the average weekly units of ' + dmy(b.minmax_from) + ' to ' + dmy(b.minmax_to) + ', rounded up. Max is Min plus 3.') +
      card('Priority', 'A is the products that make the first 80% of the spend from ' + dmy(b.prio_from) + ' to ' + dmy(b.prio_to) + ' at the Phorest cost. B is the rest.') +
      card('Your changes', 'Change any Min, Max or Priority and your change wins. Clear a Min or Max to go back to the starting figure. <span style="color:var(--tri)">&#9698;</span> A triangle in the lower right of a cell means someone edited it, hover it to see who.') +
      card('Stock Value', 'Min and Max Stock Value are Min or Max units times the unit cost, so they follow every change.');
  }
  const keep = fn => { let x = $('xw'); const sx = x ? x.scrollLeft : 0, sy = x ? x.scrollTop : 0; fn(); x = $('xw'); if (x) { x.scrollLeft = sx; x.scrollTop = sy; } };
  const redrawAll = () => keep(render);
  function draw() { render(); }

  /* ---------- header menu, Google Sheets style ---------- */
  function valueList(k) {
    const m = {}, isN = colOf(k)[4] === 'n';
    S.rows.forEach(r => { if (passes(r, k)) { const key = vkey(r, k); if (!m[key]) m[key] = { key, raw: raw(r, k), n: 0 }; m[key].n++; } });
    const L = Object.keys(m).map(x => m[x]);
    L.sort((a, b) => { if (a.key === '(Blanks)') return 1; if (b.key === '(Blanks)') return -1; return isN ? (a.raw - b.raw) : a.key.localeCompare(b.key); });
    return L;
  }
  function openMenu(k, btn) {
    const F = S.F[k] || {}, L = valueList(k), ex = F.ex || [];
    S.menu = { c: k, list: L, checked: {}, search: '', op: (F.cond && F.cond.op) || '', v1: (F.cond && F.cond.v1) || '', v2: (F.cond && F.cond.v2) || '', condOpen: !!F.cond, valOpen: true, btn };
    L.forEach(x => { S.menu.checked[x.key] = ex.indexOf(x.key) < 0; });
    drawMenu(true);
  }
  function drawMenu(place) {
    const m = S.menu, fm = $('fm'), k = m.c, isN = colOf(k)[4] === 'n', OPS = isN ? OPS_N : OPS_S, s = S.sort && S.sort.k === k ? S.sort.d : 0;
    const vis = m.list.filter(x => x.key.toLowerCase().indexOf(m.search.toLowerCase()) >= 0), nChecked = m.list.filter(x => m.checked[x.key]).length;
    let h = '<button type="button" class="it' + (s === 1 ? ' on' : '') + '" data-m="sort" data-d="1">' + (isN ? 'Sort smallest to largest' : 'Sort A to Z') + '</button>' +
      '<button type="button" class="it' + (s === -1 ? ' on' : '') + '" data-m="sort" data-d="-1">' + (isN ? 'Sort largest to smallest' : 'Sort Z to A') + '</button><hr>' +
      '<div class="sec"><button type="button" class="sh" data-m="tcond" aria-expanded="' + m.condOpen + '"><span>Filter by condition</span><span>' + (m.condOpen ? '&#9662;' : '&#9656;') + '</span></button>';
    if (m.condOpen) {
      h += '<select id="fop" aria-label="Condition">' + OPS.map(o => '<option value="' + o[0] + '"' + (m.op === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>';
      if (m.op && m.op !== 'empty' && m.op !== 'notempty') h += '<div class="row2"><input class="fin" id="fv1" type="' + (isN ? 'number' : 'text') + '" placeholder="Value" value="' + esc(m.v1) + '">' + (m.op === 'between' ? '<input class="fin" id="fv2" type="number" placeholder="and" value="' + esc(m.v2) + '">' : '') + '</div>';
    }
    h += '</div><hr><div class="sec"><button type="button" class="sh" data-m="tval" aria-expanded="' + m.valOpen + '"><span>Filter by values</span><span>' + (m.valOpen ? '&#9662;' : '&#9656;') + '</span></button>';
    if (m.valOpen) {
      h += '<div class="vact"><button type="button" data-m="all">Select all</button><button type="button" data-m="none">Clear</button><span>' + nChecked + ' of ' + m.list.length + ' selected</span></div>' +
        '<input class="fin" id="fsr" type="search" placeholder="Search values" value="' + esc(m.search) + '" style="margin-top:0"><div class="vl">' +
        (vis.length ? vis.map(x => '<label><input type="checkbox" data-v="' + esc(x.key) + '"' + (m.checked[x.key] ? ' checked' : '') + '><span title="' + esc(x.key) + '">' + esc(x.key) + '</span><em>' + x.n + '</em></label>').join('') : '<div style="padding:6px;color:var(--muted)">No values match.</div>') + '</div>';
    }
    h += '</div><div class="btns"><button type="button" class="go ghost" data-m="cancel">Cancel</button><button type="button" class="go" data-m="ok">OK</button></div>';
    fm.innerHTML = h; fm.style.display = 'block';
    if (place) {
      const r = m.btn.getBoundingClientRect(), w = 288;
      fm.style.left = Math.max(8, Math.min(r.left - 8, window.innerWidth - w - 8)) + 'px'; fm.style.top = Math.min(r.bottom + 4, Math.max(8, window.innerHeight - 120)) + 'px';
    }
  }
  function closeMenu() { S.menu = null; const fm = root && $('fm'); if (fm) fm.style.display = 'none'; }
  function applyMenu() {
    const m = S.menu, k = m.c, ex = [], F = {}, prev = (S.F[k] && S.F[k].ex) || [], listKeys = m.list.map(x => x.key);
    prev.forEach(x => { if (listKeys.indexOf(x) < 0) ex.push(x); });
    m.list.forEach(x => { if (!m.checked[x.key]) ex.push(x.key); });
    if (ex.length) F.ex = ex;
    if (m.op) { const need = m.op !== 'empty' && m.op !== 'notempty'; if (!need || m.v1 !== '') F.cond = { op: m.op, v1: m.v1, v2: m.v2 }; }
    if (F.ex || F.cond) S.F[k] = F; else delete S.F[k];
    closeMenu(); redrawAll();
  }

  /* ---------- editing ---------- */
  async function commit(el) {
    if (!S.access.edit) return;
    const k = +el.getAttribute('data-k'), tr = el.closest('tr'), td = el.closest('td'), i = +tr.getAttribute('data-i'), r = S.rows[i], before = r[k];
    let after;
    if (k === NAME) { const s = el.textContent.replace(/\s+/g, ' ').trim(); if (!s) { el.textContent = r[NAME]; return; } after = s; el.textContent = s; }
    else if (k === CAT || k === TYPE || k === PRIO) after = el.value;
    else { const n = el.value === '' ? null : Math.max(0, parseInt(el.value, 10)); after = (n == null || isNaN(n)) ? null : n; el.value = after == null ? '' : after; }
    if (after === before) return;
    const field = FIELD[k], oldTxt = before == null ? null : String(before), newTxt = after == null ? null : String(after);
    const { data, error } = await sb.rpc('plan_set', { p_row_key: r[K], p_field: field, p_val: newTxt, p_old: oldTxt, p_label: r[NAME] });
    if (error) {
      console.error(error); toast('That change did not save. Showing what is saved.');
      try { ingest(await load(S.listId)); redrawAll(); } catch (e) { /* keep what is drawn */ }
      return;
    }
    if (after == null) { try { ingest(await load(S.listId)); redrawAll(); } catch (e) { /* the cell stays cleared until the next load */ } return; }
    r[k] = after; calc(r);
    const key = r[K] + '|' + field, E = S.edits[key] = S.edits[key] || { n: 0, list: [] };
    E.list.unshift({ who: data.by, at: data.at, from: oldTxt, to: newTxt }); E.n++;
    if (k === TYPE) { el.className = 'tyl ' + after + (r[FLAG] === 1 ? ' inf' : ''); const fl = tr.querySelector('.fl'); if (fl) fl.style.display = 'none'; }
    if (k === PRIO) el.className = 'pri ' + after;
    tr.querySelector('.v18').innerHTML = dash(r[MINV], f); tr.querySelector('.v19').innerHTML = dash(r[MAXV], f);
    if (!td.querySelector('.tri')) td.insertAdjacentHTML('beforeend', triHtml(r, k));
    $('tf').innerHTML = totalsHtml(); refreshMeta();
  }

  /* ---------- events ---------- */
  function wire() {
    const R = root;
    R.addEventListener('click', e => {
      const t = e.target;
      const fi = t.closest('[data-fcol]');
      if (fi) { const k = +fi.getAttribute('data-fcol'); if (S.menu && S.menu.c === k) closeMenu(); else openMenu(k, fi); return; }
      const cl = t.closest('[data-clear]');
      if (cl) { delete S.F[+cl.getAttribute('data-clear')]; redrawAll(); return; }
      const fl = t.closest('[data-file]');
      if (fl) { e.preventDefault(); openFile(fl.getAttribute('data-file')); return; }
      const pb = t.closest('[data-p]');
      if (pb && $('mdl').contains(pb)) {
        const a = pb.getAttribute('data-p');
        if (a === 'cancel') closePrices(); else if (a === 'save') savePrices();
        return;
      }
      if (t.id === 'mdl') { closePrices(); return; }
      const mm = t.closest('[data-m]');
      if (mm && S.menu) {
        const a = mm.getAttribute('data-m'), m = S.menu;
        if (a === 'sort') { const d = +mm.getAttribute('data-d'); S.sort = (S.sort && S.sort.k === m.c && S.sort.d === d) ? null : { k: m.c, d }; closeMenu(); redrawAll(); }
        else if (a === 'tcond') { m.condOpen = !m.condOpen; drawMenu(); }
        else if (a === 'tval') { m.valOpen = !m.valOpen; drawMenu(); }
        else if (a === 'all' || a === 'none') { m.list.forEach(x => { if (x.key.toLowerCase().indexOf(m.search.toLowerCase()) >= 0) m.checked[x.key] = a === 'all'; }); drawMenu(); }
        else if (a === 'cancel') closeMenu();
        else if (a === 'ok') applyMenu();
        return;
      }
      const act = t.closest('[data-act]'); if (!act) return;
      const a = act.getAttribute('data-act');
      if (a === 'clearall') { S.F = {}; S.sort = null; S.q = ''; redrawAll(); }
      else if (a === 'upload') openPrices();
      else if (a === 'addsku') addNewSkus();
    });
    R.addEventListener('change', async e => {
      const el = e.target;
      if (S.menu && $('fm').contains(el)) {
        const m = S.menu;
        if (el.id === 'fop') { m.op = el.value; drawMenu(); }
        else if (el.hasAttribute('data-v')) { m.checked[el.getAttribute('data-v')] = el.checked; const n = m.list.filter(x => m.checked[x.key]).length; $('fm').querySelector('.vact span').textContent = n + ' of ' + m.list.length + ' selected'; }
        else if (el.id === 'fv1') m.v1 = el.value; else if (el.id === 'fv2') m.v2 = el.value;
        return;
      }
      if ($('mdl').contains(el)) {
        if (el.id === 'pfile' && el.files && el.files[0]) onFile(el.files[0], formVals());
        else if (el.hasAttribute('data-col') && S.imp && S.imp.raw) { S.imp.g[el.getAttribute('data-col')] = +el.value; runImport(formVals()); }
        return;
      }
      if (el.id === 'psel') { try { ingest(await load(+el.value)); redrawAll(); } catch (er) { console.error(er); toast('That price list did not load.'); } return; }
      if (el.id === 'cmp') { S.cmp = el.checked; redrawAll(); return; }
      if (el.hasAttribute('data-k') && el.tagName !== 'DIV') commit(el);
    });
    R.addEventListener('input', e => {
      const t = e.target;
      if (S.menu && $('fm').contains(t)) {
        const m = S.menu;
        if (t.id === 'fsr') { m.search = t.value; const pos = t.selectionStart; drawMenu(); const s = $('fsr'); s.focus(); s.setSelectionRange(pos, pos); }
        else if (t.id === 'fv1') m.v1 = t.value; else if (t.id === 'fv2') m.v2 = t.value;
        return;
      }
      if (t.id === 'q') { S.q = t.value; keep(() => { S.view = viewIdx(); $('tb').innerHTML = tbodyHtml(); $('tf').innerHTML = totalsHtml(); refreshMeta(); }); }
    });
    R.addEventListener('keydown', e => {
      const el = e.target;
      if (S.menu && $('fm').contains(el) && e.key === 'Enter' && el.tagName === 'INPUT' && el.type !== 'checkbox' && el.id !== 'fsr') { e.preventDefault(); applyMenu(); return; }
      if (e.key === 'Escape') { if ($('mdl').style.display === 'flex') closePrices(); else if (S.menu) { const b = S.menu.btn; closeMenu(); if (b) b.focus(); } }
      if (el.classList && el.classList.contains('tx')) {
        if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
        else if (e.key === 'Escape') { el.textContent = S.rows[+el.closest('tr').getAttribute('data-i')][NAME]; el.blur(); }
      }
    });
    R.addEventListener('focusout', e => { const el = e.target; if (el.classList && el.classList.contains('tx')) commit(el); if (el.classList && (el.classList.contains('tri') || el.classList.contains('fl'))) hideTip(); });
    R.addEventListener('focusin', e => {
      const el = e.target;
      if (el.classList && el.classList.contains('tri')) showTip(el);
      if (el.classList && el.classList.contains('fl')) showSay(el);
      if (el.classList && el.classList.contains('cs') && !el.dataset.full) fillCats(el);
    });
    R.addEventListener('mousedown', e => { const el = e.target; if (el.classList && el.classList.contains('cs') && !el.dataset.full) fillCats(el); });
    R.addEventListener('mouseover', e => { const t = e.target.closest && e.target.closest('.tri'); if (t) showTip(t); const f = e.target.closest && e.target.closest('.fl[data-say]'); if (f) showSay(f); });
    R.addEventListener('mouseout', e => { const t = e.target.closest && e.target.closest('.tri, .fl'); if (t) hideTip(); });
    R.addEventListener('paste', e => { if (e.target.classList && e.target.classList.contains('tx')) { e.preventDefault(); const t = (e.clipboardData || window.clipboardData).getData('text').replace(/\s+/g, ' '); document.execCommand('insertText', false, t); } });
    // the category list is filled when the cell is first used, so 1,900 rows do not carry 20,000 options
    function fillCats(el) { const cur = el.value; el.innerHTML = catList().map(c => '<option' + (c === cur ? ' selected' : '') + '>' + esc(c) + '</option>').join(''); el.dataset.full = '1'; }
    if (!wired) {
      wired = true;
      document.addEventListener('mousedown', e => { if (!S.menu) return; const p = e.composedPath(); if (!p.includes($('fm')) && !p.some(n => n.classList && n.classList.contains('fi'))) closeMenu(); });
      window.addEventListener('scroll', e => { hideTip(); if (S.menu && root && !e.composedPath()[0].closest?.('.fm')) closeMenu(); }, true);
      window.addEventListener('resize', () => closeMenu());
    }
  }

  /* ---------- download ---------- */
  window.spendExport = function spendExport() {
    if (!S.rows.length) return null;
    const cs = cols(), c0 = curList();
    const fmtOf = k => (k === AVG || k === COST || k === WK || k === SALE) ? 'aed2' : (k === MINV || k === MAXV) ? 'aed' : (colOf(k)[4] === 'n' ? 'num' : 'text');
    const cell = (r, k) => { const v = raw(r, k); return v == null || v === '' ? null : (k === TYPE ? shown(r, k) : v); };
    const head = cs.map(c => ({ label: c[0] === 'Avg Units / Week' ? c[0] : c[0], fmt: fmtOf(c[2]) }));
    const rows = S.view.map(i => { const r = S.rows[i]; return { cells: cs.map(c => c[2] === NAME ? r[NAME] + (multi() ? ' (' + BN[r[BR]] + ')' : '') : cell(r, c[2])) }; });
    const sumOf = k => S.view.reduce((a, i) => a + (Number(raw(S.rows[i], k)) || 0), 0);
    const tot = { total: true, cells: cs.map((c, j) => j === 0 ? 'Total' : j === 1 ? S.view.length + ' products' : (colOf(c[2])[4] === 'n' && c[2] !== COST && c[2] !== SALE) ? sumOf(c[2]) : null) };
    const sheet = {
      name: 'Weekly Product Plan', title: 'Weekly Product Plan',
      subtitle: brLabel() + '. ' + (S.win && S.win.days ? 'Usage ' + dmy(S.win.from) + ' to ' + dmy(S.win.to) + ', ' + S.win.days + ' days. ' : 'No usage in the Period. ') + listLabel(c0) + '.' + (Object.keys(S.F).length || S.q ? ' Filtered: ' + S.view.length + ' of ' + S.rows.filter(r => S.brs.indexOf(r[BR]) >= 0).length + ' products.' : ''),
      blocks: [{ cols: head, rows: rows.concat([tot]) }]
    };
    return { name: 'weekly-product-plan' + (S.brs.length === 1 ? '-' + S.brs[0].toLowerCase() : ''), sheets: [sheet] };
  };

  /* ---------- entry ---------- */
  window.renderSpend = async function renderSpend() {
    host = document.getElementById('spendContent');
    if (!host) return;
    if (!root) {
      root = host.attachShadow({ mode: 'open' });
      root.innerHTML = '<style>' + CSS + '</style><div class="stage"><div class="pg" id="pg"></div></div><div class="fm" id="fm" role="dialog" aria-label="Column filter"></div><div class="tip" id="tip" role="tooltip"></div>' +
        '<div class="mdl" id="mdl" role="dialog" aria-modal="true" aria-label="Upload new prices"><div class="mdl-in" id="mdlIn"></div></div><div id="toast" role="status"></div>';
      wire();
    }
    try { if (window.trsWindowReady) await window.trsWindowReady; } catch (e) { /* the page reads its own default window */ }
    S.brs = wantBranches();
    const w = wantWindow(), key = (w.from || '') + '|' + (w.to || '');
    // A Branch change redraws what is loaded; a new Period reads the usage again (it is the Period that sets the weekly figures).
    if (S.rows.length && key === S.loadedKey && Date.now() - S.loadedAt < 300000) { closeMenu(); draw(); return; }
    if (!S.rows.length) $('pg').innerHTML = '<p class="msg">Loading the Weekly Product Plan…</p>';
    try {
      const d = await load(S.rows.length ? S.listId : null);
      if (d && d.denied) { $('pg').innerHTML = '<p class="msg">This page is for Accounts and Admin. Ask Kate if you need it.</p>'; return; }
      ingest(d);
    } catch (e) {
      console.error(e);
      $('pg').innerHTML = '<p class="msg">The Weekly Product Plan didn\'t load. Refresh to try again.</p>';
      return;
    }
    closeMenu(); draw();
  };
})();
