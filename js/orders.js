// Orders and Receipts (Kate, 18 Nov 2026), built from the local mockup docs/mockups/orders-receipts.html in the cowork repo.
//
// What it shows: every supplier order, quotation, invoice and statement that reaches the info@ mailbox, ONE ROW PER ORDER (never one per email). The
// confirmation, shipping note, delivery and invoice of an order are steps inside its row. Each order says what was bought (product, quantity, price, line total),
// the total in AED and any discount, clearly: the AED the supplier took off, or the percentage when the email only gives that (Kate, 18 Nov 2026: "very impt").
// Where the supplier's email has no item list (an Excel order form, a PDF invoice) the order says so, it never invents one.
//
// Data: orders_get() (migrations/orders_receipts.sql), Level 5 or the extra page 'orders'. It returns one row per EMAIL that the info@ Apps Script
// (apps-script copy docs/orders-receipts/sync-orders-mailbox.gs in the cowork repo) has read; this page groups them by `group` (supplier plus order number for
// Falconpack and Carrefour, else supplier plus Gmail thread). Nothing is written from this page. The table is empty until that script has run.
//
// The masthead's Branch and Period drive the page (sel, dateFrom, dateTo): an order belongs to the Period it STARTED in. An email that names no salon is
// "All salons": it shows under UAE Branches and under no single salon. Bahrain is not in the mailbox (NO_BAH_VIEWS).
//
// Needs from dashboard.js (shared script scope): sb, sel, dateFrom, dateTo, dateToIso, BRANCH_INFO; sheet-table.js TRSheet; why-wall.js whyWall; drill.js TRSD;
// report-export.js rexButtons. Own helpers below, so it does not lean on another page's file.
const ORD_STORE = 'trs-orders';
// The mini side nav (Kate, 19 Nov 2026: "walang mini sidebar navi"): the shared "On this page" rail, a column in the gutter from 1100px and a pinned row of chips under the masthead below that (lgShell, jump-nav.js).
const ORD_RAIL = [['ordSecOver', 'Overview'], ['ordSecLook', 'Needs a look'], ['ordSecSup', 'By supplier'], ['ordEverySec', 'Every order'], ['ordHow', 'How it is worked out'], ['ordAbout', 'About this page']];
const ORD = { n: 10, kind: '', q: '' };
let ordRows = null, ordByKey = {}, ordGroups = [], ordT = null, ordTS = null, ordTL = null, ordSeq = 0, ordHK = 'look', ordAK = 'one', ordBusy = false, ordErr = '', ordChecks = {}, ordDrafts = {}, ordDraftTimer = null, ordProofs = [], ORD_SEL = new Set(), ordNavList = [], ordLastEl = null;
try { const s = JSON.parse(localStorage.getItem(ORD_STORE) || '{}'); if ([10, 20, 50, 100].includes(s.n)) ORD.n = s.n; } catch (e) {}
const ordSave = () => { try { localStorage.setItem(ORD_STORE, JSON.stringify({ n: ORD.n })); } catch (e) {} };

const ORD_SALONS = ['SAA', 'KCA', 'MC', 'AQ'];
const ORD_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ordEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ordN = v => Math.round(+v || 0).toLocaleString('en-GB');
const ordAed = v => (v == null || !isFinite(v)) ? '' : (Math.round(v * 100) / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ordDay = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${+m[3]} ${ORD_MON[+m[2] - 1]} ${m[1]}` : ''; };
const ordTime = iso => { try { return new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ordDay(iso); } };
const ordToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' });
const ordDiff = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 864e5);
const ordSlug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const ordName = c => c === 'UAE' ? 'All salons' : ((typeof BRANCH_INFO !== 'undefined' && BRANCH_INFO[c] && BRANCH_INFO[c].name) || c);
const ordNum = (html, spec) => (typeof TRSD !== 'undefined' && spec) ? TRSD.num(html, spec) : html;

// ── THE WINDOW (the masthead's Period) AND THE SALONS ────────────────────────────────
function ordRange() {
  const t = ordToday();
  let a = typeof dateFrom !== 'undefined' && dateFrom ? dateToIso(dateFrom) : t.slice(0, 8) + '01';
  let b = typeof dateTo !== 'undefined' && dateTo ? dateToIso(dateTo) : t;
  if (b > t) b = t;
  if (b < a) b = a;
  return [a, b];
}
// null = every salon; otherwise the UAE codes the masthead has picked
function ordCodes() {
  if (typeof sel === 'undefined' || !sel.branch || sel.branch.includes('all')) return null;
  const c = sel.branch.filter(b => ORD_SALONS.includes(b));
  return !c.length || c.length === ORD_SALONS.length ? null : c;
}
const ordScopeText = () => { const c = ordCodes(); return c ? c.map(ordName).join(' + ') : 'UAE Branches'; };
const ordPeriodText = () => { const [a, b] = ordRange(); return ordDay(a) + ' to ' + ordDay(b); };

// ── ONE ROW PER ORDER ────────────────────────────────────────────────────────────────
const ORD_ORDERK = { order: 1, confirmation: 1, quotation: 1, shipped: 1, delivered: 1 };
const ORD_RANK = { quotation: 1, order: 2, confirmation: 3, shipped: 4, delivered: 5, invoice: 6 };
const ORD_RANKNAME = { 1: 'Quoted', 2: 'Ordered', 3: 'Confirmed', 4: 'Shipped', 5: 'Delivered', 6: 'Invoiced' };
const ORD_KINDNAME = { order: 'Order sent', quotation: 'Quotation', confirmation: 'Order confirmed', shipped: 'Shipped', delivered: 'Delivered', invoice: 'Invoice', statement: 'Statement', notice: 'Notice', message: 'Message', reply: 'Our reply' };
// a file is kept for the order: a PDF (Receipts kept) or an Excel order form (File kept)
const ordIsKept = g => g.f === 'PDF kept' || g.f === 'File kept';
const ordHasLines = d => Array.isArray(d.lines) && d.lines.length && d.lines.some(l => l && l.unit != null);

// Kate, 23 Nov 2026: "bat naisama to, di naman sya order". A supplier's sign-in, password or verification-code email is not paperwork: it is dropped before anything is grouped.
const ordNoise = r => r.kind === 'message' && /sign-?in|log-?in|password|verification code|security alert|one-time/i.test(r.subject || '');
function ordBuild(rows0) {
  const rows = rows0.filter(r => !ordNoise(r)), m = {};
  // Falconpack and Carrefour: the invoice and the shipping note carry the order number as their reference, but the confirmation and the delivery email only
  // name it in the subject, so they used to sit in a row of their own and the real order looked as if no invoice had come (Kate, 20 Nov 2026: "ndi na ba tlga to ma reconcile").
  // Join them to the row that already holds that number. Nothing is written back; a number that no other email carries stays where it was.
  const byRef = {};
  rows.forEach(r => { if (r.reference && /^(FALCONPACK|CARREFOUR)$/.test(r.supplier || '')) byRef[r.supplier + '|' + r.reference] = r.group; });
  // DBD: a tax invoice has no order number, and it arrives in whatever thread the team chased it in (often a later order's follow-up). It belongs to the order whose
  // product codes it repeats: every code on the invoice is on that order's forms (95% or more), the order started on or before the invoice date, and no other order
  // ties. The invoice email alone moves; the rest of its thread stays, since a follow-up can carry a new order of its own (Kate, 20 Nov 2026).
  const dbdCodes = {};
  rows.forEach(r => {
    if (r.supplier !== 'DBD' || !/^(order|confirmation|quotation)$/.test(r.kind || '') || !Array.isArray(r.lines)) return;
    const o = dbdCodes[r.group] || (dbdCodes[r.group] = { set: {}, start: r.date });
    r.lines.forEach(l => { if (l && l.code) o.set[l.code] = 1; });
    if (r.date < o.start) o.start = r.date;
  });
  const invTo = {};
  rows.forEach(r => {
    if (r.supplier !== 'DBD' || r.kind !== 'invoice' || !Array.isArray(r.lines)) return;
    const cs = r.lines.map(l => l && l.code).filter(Boolean);
    if (cs.length < 5) return;
    let best = null, top = 0, tie = false;
    Object.keys(dbdCodes).forEach(g => {
      const o = dbdCodes[g]; if (o.start > r.date) return;
      const sh = cs.filter(c => o.set[c]).length;
      if (sh > top) { top = sh; best = g; tie = false; } else if (sh === top && sh > 0) tie = true;
    });
    if (best && !tie && top >= 0.95 * cs.length) invTo[r.key] = best;
  });
  const amzConf = rows.filter(r => r.supplier === 'AMAZON.AE' && r.kind === 'confirmation');
  const joinGroup = r => {
    if (invTo[r.key]) return invTo[r.key];
    // Amazon: the Ordered and Shipped emails carry the order number as their reference, but "Delivered: 2 items | Order # 402-3567620-8477117" only has it in the subject, so the delivery
    // sat in a row of its own and the real order looked shipped for ever (Kate, 20 Nov 2026). The group key of an Amazon order is AMAZON.AE|<order number>.
    // A cancel or refund email may name the order only in its text ("the refund of AED 111.75 for your order: 406-..."), so those two kinds are also read for it.
    if (r.supplier === 'AMAZON.AE' && !r.reference) {
      const am = /(\d{3}-\d{7}-\d{7})/.exec(r.subject || '') || (/cancel|refund|return/i.test(r.subject || '') || /total estimated refund|refund subtotal/i.test(r.body || '') ? /(\d{3}-\d{7}-\d{7})/.exec((r.body || '') + ' ' + (r.note || '')) : null);
      if (am) return 'AMAZON.AE|' + am[1];
      // "Items cancelled successfully: 5 "Metaltex 25 cm Stainless..."" names no order at all, but repeats the product text of the Ordered email of the last five days: join it only when exactly one order has that text
      if (/cancel/i.test(r.subject || '')) {
        const sn = /[“"]([^“”"]{8,})/.exec(r.subject || '');
        if (sn) {
          const hit = {}; amzConf.forEach(c => { const dd = ordDiff(c.date, r.date); if (dd >= 0 && dd <= 5 && String(c.subject || '').indexOf(sn[1]) >= 0) hit[c.group] = 1; });
          const ks = Object.keys(hit); if (ks.length === 1) return ks[0];
        }
      }
    }
    // Hotpack web store: every email of an order (confirmed, ready to dispatch, out for delivery, delivered) is its own thread; the order number is in the subject
    if (r.supplier === 'HOTPACK') { const hp = /order #(\d{4,})/i.exec(r.subject || ''); if (hp) return 'HOTPACK|#' + hp[1]; }
    if (r.reference ||!/^(FALCONPACK|CARREFOUR)$/.test(r.supplier || '')) return r.group;
    const nums = String(r.subject || '').match(/\d{7,}/g) || [];
    for (let i = 0; i < nums.length; i++) { const g = byRef[r.supplier + '|' + nums[i]]; if (g) return g; }
    return r.group;
  };
  rows.forEach(r => { const k = joinGroup(r); (m[k] || (m[k] = [])).push(r); });
  ordByKey = {};
  ordGroups = Object.keys(m).map(k => ordFinish(k, m[k])).sort((a, b) => (b.last < a.last ? -1 : b.last > a.last ? 1 : 0) || (b.start < a.start ? -1 : 1));
  ordGroups.forEach(g => { ordByKey[g.key] = g; });
}
// Refunds (Kate, 23 Nov 2026: "eto refund to, it should have its own column, beside discount %"). An Amazon return or refund email states the amount as
// "Total estimated refund* AED 58.60" or "the refund of AED 111.75"; failing that, a refund email's own amount is the refund. Nothing else is read as one.
function ordRefundAmt(d) {
  const t = (d.subject || '') + ' ' + (d.body || '') + ' ' + (d.note || '');
  const m = /total estimated refund\*?\s*AED\s*([\d,]+(?:\.\d+)?)/i.exec(t) || /refund(?:ed)? of\s*AED\s*([\d,]+(?:\.\d+)?)/i.exec(t);
  if (m) return parseFloat(m[1].replace(/,/g, ''));
  return /refund/i.test(d.subject || '') && d.amount != null ? Number(d.amount) : null;
}
function ordFinish(key, docs) {
  docs.sort((x, y) => (x.at < y.at ? -1 : x.at > y.at ? 1 : 0));
  const first = docs[0], last = docs[docs.length - 1], g = { key, docs, s: first.supplier, cat: first.category || '', start: first.date, last: last.date };
  g.b = 'UAE'; docs.forEach(d => { if (d.salon && d.salon !== 'UAE' && g.b === 'UAE') g.b = d.salon; });
  g.r = ''; docs.forEach(d => { if (d.reference && !g.r) g.r = d.reference; });
  const has = {}; docs.forEach(d => { has[d.kind] = 1; });
  // an email the reader filed as a message or quotation can still carry the invoice as its PDF (Euro's Proforma Invoice, Neu's "Invoice 7352.pdf"): orders_get says so in invoice_pdf (Kate, 20 Nov 2026)
  g.hasInv = !!has.invoice || docs.some(d => d.invoice_pdf);
  g.type = docs.some(d => ORD_ORDERK[d.kind]) ? 'Order' : has.invoice ? 'Invoice' : has.statement ? 'Statement' : 'Other';
  // what was bought: the first email that lists priced lines. A second email of the same order (the invoice) lists them again, so they are never added twice.
  const buyDoc = docs.find(ordHasLines) || null;
  g.buy = buyDoc ? { lines: buyDoc.lines.filter(l => l && l.unit != null), sub: buyDoc.subtotal, disc: Number(buyDoc.discount) || 0, deliv: buyDoc.delivery, vat: buyDoc.vat, total: buyDoc.amount } : null;
  g.oos = []; docs.forEach(d => { if (d.kind === 'notice' && Array.isArray(d.lines)) d.lines.forEach(l => { if (l && l.unit == null && l.name) g.oos.push(l); }); });
  const dp = docs.find(d => d.discount_pct != null);
  g.discPct = dp ? Number(dp.discount_pct) : 0; g.discShould = dp && dp.discount_should != null ? Number(dp.discount_should) : null;
  const inv = docs.find(d => d.kind === 'invoice' && d.amount != null), any = docs.find(d => d.amount != null);
  g.inv = inv ? Number(inv.amount) : null;
  g.a = g.buy && g.buy.total != null ? Number(g.buy.total) : inv ? Number(inv.amount) : any ? Number(any.amount) : null;
  if (g.buy && g.buy.total == null && g.a != null) g.buy.total = g.a;   // the total may sit on another email of the same order (the confirmation or the invoice): the window must always show it
  g.disc = g.buy ? g.buy.disc : 0;
  g.refund = 0; docs.forEach(d => { const v = ordRefundAmt(d); if (v != null && isFinite(v)) g.refund = v; });   // the latest refund email of the order wins: a second email repeats the same refund
  g.refundOnly = g.refund > 0 && g.type === 'Other' && !g.hasInv;
  g.refundFor = '';
  if (g.refund > 0) docs.forEach(d => { if (ordRefundAmt(d) != null) { const m = /(\d{3}-\d{7}-\d{7})/.exec((d.subject || '') + ' ' + (d.body || '') + ' ' + (d.note || '')); if (m) g.refundFor = m[1]; } });
  if (g.refundOnly && g.refundFor && !g.r) g.r = g.refundFor;   // the Reference column and the Find box then answer "which order was this refund for"
  if (g.refundOnly) g.a = null;   // its only amount is the refund, which has its own column, so it is not an order total
  g.items = g.buy ? g.buy.lines.length : 0;
  g.units = g.buy ? g.buy.lines.reduce((t, l) => t + (Number(l.qty) || 0), 0) : 0;
  let rk = 0; docs.forEach(d => { if ((ORD_RANK[d.kind] || 0) > rk) rk = ORD_RANK[d.kind]; });
  g.st = g.type === 'Order' ? ORD_RANKNAME[g.hasInv ? 6 : rk] : g.type === 'Statement' ? 'Statement' : g.type === 'Invoice' ? 'Invoiced' : (last.status || 'Notice');
  g.f = docs.some(d => d.file_path && /\.pdf$/i.test(d.file_name || d.file_path)) ? 'PDF kept' : docs.some(d => d.file_path) ? 'File kept' : docs.some(d => d.has_file) ? 'File in email' : 'Email only';
  // why it needs a look: a rule from the script, plus two that depend on today's date, so they are worked out here and never go stale
  const today = ordToday(), fl = [], chk0 = ordChecks[key] || null;
  docs.forEach(d => { if (d.flag && !/^Invoice due in/.test(d.flag) && fl.indexOf(d.flag) < 0) fl.push(d.flag); });
  // Kate, 23 Nov 2026: an invoice past its due date is only a question (the mailbox cannot see a payment). Once somebody has checked it in the account, or cancelled it, the question is answered.
  if (!chk0) docs.forEach(d => { if (d.kind === 'invoice' && d.due) { const left = ordDiff(today, d.due); if (left < 0) fl.push('Invoice overdue by ' + (-left) + ' day' + (left === -1 ? '' : 's') + ', due ' + ordDay(d.due)); else if (left <= 14) fl.push('Invoice due in ' + left + ' day' + (left === 1 ? '' : 's') + ', on ' + ordDay(d.due)); } });
  const age = ordDiff(g.start, today);
  // Amazon, Lulu and the Hotpack web store are paid at checkout, so a delivered order from them never gets an invoice to chase (Kate, 20 Nov 2026). Neu is not: its orders go through people.
  const paysAtCheckout = /^(amazon|lulu|hotpack)/i.test(g.s || ''), paidOnOrder = paysAtCheckout && rk >= ORD_RANK.delivered;
  // Amazon cancels and refunds an order by email ("Items cancelled successfully", "Update on refund processed"): such an order is closed, nothing is owed or on its way
  const cancelled = /^amazon/i.test(g.s || '') && rk < ORD_RANK.delivered && docs.some(d => /cancel|refund/i.test(d.subject || ''));
  if (cancelled) g.st = 'Cancelled';
  if (g.refundOnly && !cancelled) g.st = 'Refund';
  // someone opened the order in the supplier's account (or portal) and ticked Checked, with a note and a pasted screenshot as proof (Kate, 20 Nov 2026): the mailbox silence is answered
  const chk = ordChecks[key] || null; g.chk = chk;
  // Kate, 23 Nov 2026: an order cancelled in the supplier's account (Amazon 'Your order was cancelled', no email) is marked Cancelled by hand. It is kept as a check whose note starts with [cancelled], so no new table is needed; Undo brings the order back.
  g.canc = !!(chk && /^\[cancelled\]/.test(chk.note || ''));
  if (g.canc) g.st = 'Cancelled';
  if (g.type === 'Order' && !g.hasInv && age >= 7 && !paidOnOrder && !cancelled && !chk) {
    // for these suppliers the question is not the invoice but whether it ever arrived (or was cancelled or the payment was declined): check it in the supplier's own account
    fl.push(paysAtCheckout ? 'No delivery email after ' + age + ' days: check the order in the ' + (/^amazon/i.test(g.s) ? 'Amazon' : g.s.charAt(0) + g.s.slice(1).toLowerCase()) + ' account' : 'No invoice seen after ' + age + ' days');
  }
  g.x = g.canc ? '' : fl.join('; ');
  g.n = first.subject || first.note || '';
  return g;
}
// FIND AN ORDER (Kate, 20 Nov 2026): one box over the page. Every word typed must appear somewhere in the order: supplier, order number (with or without the dashes), product,
// salon, status, what the emails say, the note of a check. While something is typed the tables look at ALL orders, not only the Period and Branch picked above.
function ordHay(g) {
  if (g._hay) return g._hay;
  const bits = [g.s, g.r, g.key, g.n, g.st, g.x, g.type, ordName(g.b), g.cat];
  if (g.buy) g.buy.lines.forEach(l => bits.push(l.name));
  g.docs.forEach(d => { bits.push(d.reference, d.subject, d.file_name); });
  if (g.chk) bits.push(ordChkTxt(g.chk), g.chk.by, g.canc ? 'cancelled' : 'checked');
  g._hay = bits.filter(Boolean).join(' | ').toLowerCase();
  g._flat = g._hay.replace(/[\s-]+/g, '');
  return g._hay;
}
function ordFindOk(g) {
  if (!ORD.q) return true;
  const h = ordHay(g);
  return ORD.q.toLowerCase().split(/\s+/).filter(Boolean).every(t => h.indexOf(t) >= 0 || g._flat.indexOf(t.replace(/[\s-]+/g, '')) >= 0);
}
let ordFindTimer = null;
function ordFindTyped(v) {
  clearTimeout(ordFindTimer);
  ordFindTimer = setTimeout(() => {
    ORD.q = String(v || '').trim();
    [ordTL, ordT].forEach(T => { if (T) { T.page = 0; T.draw(); } });
    const m = document.getElementById('ordFindMsg'); if (!m) return;
    if (!ORD.q) { m.innerHTML = ''; ordOffsets(); return; }
    const hit = ordGroups.filter(ordFindOk), lk = hit.filter(g => g.x).length, ck = hit.filter(g => g.chk).length;
    m.innerHTML = hit.length ? `${hit.length} found in all orders, all time: ${lk} need a look, ${ck} checked. <button type="button" class="ord-lk" onclick="ordGoEvery()">Show them in Every order</button>` : 'Nothing found. Try the order number, a supplier or a product word.';
    ordOffsets();
  }, 200);
}
function ordGoEvery() { ordKind(''); const e = document.getElementById('ordEverySec'); if (e && e.scrollIntoView) e.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
// the orders somebody ticked Checked, newest tick first, in Every order (Kate, 20 Nov 2026: "find an order I recently checked")
function ordShowChecked() { ordKind('Checked'); const e = document.getElementById('ordEverySec'); if (e && e.scrollIntoView) e.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
function ordScope() {
  const [a, b] = ordRange(), c = ordCodes();
  return ordGroups.filter(g => g.start >= a && g.start <= b && (!c || c.includes(g.b)));
}
function ordMatch(g, f) {
  if (f.s && g.s !== f.s) return false;
  if (f.kind === 'order' && g.type !== 'Order') return false;
  if (f.kind === 'inv' && !g.hasInv && g.type !== 'Invoice') return false;
  if (f.kind === 'stmt' && g.type !== 'Statement') return false;
  if (f.look && !g.x) return false;
  if (f.cat && ordCat(g) !== f.cat) return false;
  if (f.why && ordWhy(g).indexOf(f.why) < 0) return false;
  if (f.file && !ordIsKept(g)) return false;
  if (f.amt && g.a == null) return false;
  if (f.disc && !(g.disc > 0 || g.discPct > 0)) return false;
  return true;
}
const ordSumInv = gs => gs.reduce((t, g) => t + (g.inv || 0), 0);
const ordSumDisc = gs => gs.reduce((t, g) => t + (g.disc || 0), 0);

// ── WINDOWS (drill.js): the orders a figure counts ───────────────────────────────────
const ordOpenBtn = (g, txt) => `<button type="button" class="ord-lk" data-k="${ordEsc(g.key)}" onclick="ordOpen(this.dataset.k)">${ordEsc(txt)}</button>`;
function ordListSpec(title, f) {
  return { title, sub: ordScopeText() + ' · ' + ordPeriodText(), cur: 'AED', sk: ordSlug('orders ' + title), views: [{ id: 'orders', label: 'Orders', load: async () => {
    const rows = ordScope().filter(g => ordMatch(g, f));
    return { cols: [{ k: 'd', l: 'Started', t: 'date' }, { k: 's', l: 'Supplier' }, { k: 'ty', l: 'Type' }, { k: 'b', l: 'Salon' }, { k: 'r', l: 'Reference' }, { k: 'a', l: 'Total', t: 'aed' },
      { k: 'q', l: 'Discount', t: 'html' }, { k: 'st', l: 'Status', t: 'html' }],
      rows: rows.map(g => ({ d: g.start, s: g.s, ty: g.type, b: ordName(g.b), r: g.r || '-', a: g.a, q: g.disc ? '- AED ' + ordAed(g.disc) : g.discPct ? g.discPct + '% applied' : '-', st: ordOpenBtn(g, g.st) })),
      // The total row adds the Total column, so a list of orders no longer ends on AED 0. A list opened from an Invoiced figure adds the invoiced amounts, the figure it came from.
      foot: rows.length ? { d: '', s: rows.length + ' tracked', ty: '', b: '', r: '', a: rows.reduce((t, g) => t + ((f.amt || f.kind === 'inv' ? g.inv : g.a) || 0), 0), q: '', st: '' } : null,
      note: 'Each row is one order, invoice or statement, counted once. The total row adds the Total column' + (f.amt || f.kind === 'inv' ? ' (the invoiced amounts)' : '') + '. Tap a status to open it: items, discount, steps and emails.' };
  } }] };
}
const ordFig = (n, title, f) => ordNum(ordN(n), n ? ordListSpec(title, f) : null);
// The column header already says AED, so the cell is the bare amount (Kate, 19 Nov 2026: "AED AED"). unit = true only where the header mixes AED and %.
const ordMoney = (v, title, f, unit) => v ? ordNum((unit ? 'AED ' : '') + ordAed(v), ordListSpec(title, f)) : '<span class="ord-muted">-</span>';

// ── LOAD ─────────────────────────────────────────────────────────────────────────────
function ordShell() {
  return `
    <section class="slv-intro">
      <h2>Orders and Receipts</h2>
      <p>What did we order, from whom, and is the paperwork in? Every supplier order, quotation, invoice and statement that reaches the info mailbox, one row per order, with what was bought, the total and any discount.</p>
    </section>
    ${whyWall([
      ['Why this page', 'Orders, invoices and statements all arrive in one shared inbox, so nobody can see in one place what was ordered, what was billed and what is still waiting for a receipt.'],
      ['Why now', 'Cristine now places every salon\'s order from one place each Monday, so the whole week\'s paperwork lands in one inbox and can be read as one list before Zenoti.'],
      ['If we do nothing', 'A wrong discount on an invoice is only caught if someone happens to read that email. An overdue statement shows up as a supplier chasing us.']],
      'Kate checks the first twenty orders against Jumera\'s Supplier Balance sheet. No date set yet.')}
    <div id="ordBody"><p class="slv-muted" style="margin-top:16px">Loading orders…</p></div>`;
}
async function renderOrders() {
  const el = document.getElementById('ordersContent');
  if (!el) return;
  el.innerHTML = ordShell();
  ordBuildTables();
  if (ordRows) { ordPaint(); return; }
  ordLoad();
}
async function ordLoad() {
  const seq = ++ordSeq;
  ordBusy = true; ordErr = '';
  try {
    const { data, error } = await sb.rpc('orders_get', { p_from: null, p_to: null });
    if (seq !== ordSeq) return;
    if (error) throw error;
    ordRows = (data && data.rows) || [];
    ordChecks = (data && data.checks) || {};
    ordDrafts = (data && data.drafts) || {};
    ordBuild(ordRows);
  } catch (e) {
    console.error(e);
    ordErr = /not open to your account/i.test((e && e.message) || '') ? 'denied' : 'failed';
  }
  ordBusy = false;
  if (seq === ordSeq) ordPaint();
}

// ── THE PAGE ─────────────────────────────────────────────────────────────────────────
function ordPaint() {
  const body = document.getElementById('ordBody'); if (!body) return;
  if (ordErr === 'denied') { body.innerHTML = '<p class="slv-muted" style="margin-top:16px">This page is for Kate and the people she adds. Ask Kate if you need it.</p>'; return; }
  if (ordErr) { body.innerHTML = '<p class="slv-muted" style="margin-top:16px">Orders did not load. <button type="button" class="cm-pill" onclick="ordRows=null;ordErr=\'\';renderOrders()">Try again</button></p>'; return; }
  if (!ordRows || !ordRows.length) { body.innerHTML = '<section class="ord-empty"><div class="ord-ek">Nothing here yet</div><p>The info mailbox script has not sent any orders. Once it has been installed and has run, every order, invoice and statement appears here by itself.</p></section>' + ordAboutHtml(); ordDrawAbout(); return; }
  if (!body.dataset.drawn) {
    body.dataset.drawn = '1';
    const ans = `<section class="ord-ans" aria-label="The answer in one line"><div class="ord-ans-k">The answer in one line</div><div class="ord-ans-t" id="ordAns"></div><div class="ord-ans-s" id="ordAns2"></div></section>`;
    const secs = `
      <section class="ord-sec" id="ordSecOver" data-jn="Overview">
        <h3>1 Overview</h3>
        <div class="ord-learn"><p><b>What is this?</b> Every order, invoice and statement of the Period, split three ways: where it is, why it needs a look, who it is with.</p>
          <p class="watch"><b>What to watch.</b> <span id="ordW0"></span></p></div>
        <div id="ordOverview"></div>
      </section>
      <section class="ord-sec" id="ordSecLook" data-jn="Needs a look">
        <h3>2 Needs a look</h3>
        <div class="ord-learn"><p><b>What is this?</b> The orders that ask for a decision: a wrong discount, an overdue statement, items out of stock, an invoice about to fall due.</p>
          <p><b>Why it matters.</b> These are the ones that cost money or stock if nobody opens them this week.</p>
          <p class="watch"><b>What to watch.</b> <span id="ordW1"></span></p></div>
        <div class="ord-bar"><button type="button" class="cm-pill ord-phone" data-sxcm="look" aria-label="Sort and filter">Filter</button><span class="ord-sp"></span><button type="button" class="cm-pill" id="ordShowChk" onclick="ordShowChecked()">Checked orders (<span id="ordChkN">0</span>)</button><button type="button" class="cm-pill" id="ordClearLook" hidden onclick="ordTL.clear();ordTL.draw()">Clear filters</button>${typeof rexButtons === 'function' ? rexButtons('ordExportLook') : ''}</div>
        ${ordBulkHtml('look')}
        <div class="ord-card"><table id="ordTblLook"></table></div>
        ${ordPagerHtml('look')}
      </section>
      <section class="ord-sec" id="ordSecSup" data-jn="By supplier">
        <h3>3 By supplier</h3>
        <div class="ord-learn"><p><b>What is this?</b> One row per supplier in the Period: what they supply, how many orders and invoices, what they invoiced and what they took off.</p>
          <p class="watch"><b>What to watch.</b> <span id="ordW2"></span></p></div>
        <div class="ord-bar"><button type="button" class="cm-pill" onclick="ordToggleMore('sup')">All columns</button><button type="button" class="cm-pill ord-phone" data-sxcm="sup" aria-label="Sort and filter">Filter</button><span class="ord-sp"></span><button type="button" class="cm-pill" id="ordClearSup" hidden onclick="ordTS.clear();ordTS.draw()">Clear filters</button>${typeof rexButtons === 'function' ? rexButtons('ordExportSup') : ''}</div>
        <div class="ord-card"><table id="ordTblSup"></table></div>
        ${ordPagerHtml('sup')}
      </section>
      <section class="ord-sec" data-jn="Every order" id="ordEverySec">
        <h3>4 Every order and invoice</h3>
        <div class="ord-learn"><p><b>What is this?</b> One row per order, invoice or statement. An order is tracked once: its confirmation, shipping note, delivery and invoice are steps inside the same row.</p>
          <p><b>Why it matters.</b> You see what was bought, how many, the total and any discount without opening five emails.</p>
          <p class="watch"><b>What to watch.</b> <span id="ordW3"></span></p></div>
        <div class="ord-bar" id="ordBar">
          <div class="ord-seg-row"><div class="sc-seg" role="group" aria-label="Type"><button type="button" class="on" data-ord-kind="" onclick="ordKind('')">All</button><button type="button" data-ord-kind="Order" onclick="ordKind('Order')">Orders</button><button type="button" data-ord-kind="Invoice" onclick="ordKind('Invoice')">Invoices</button><button type="button" data-ord-kind="Statement" onclick="ordKind('Statement')">Statements</button><button type="button" data-ord-kind="Checked" onclick="ordKind('Checked')">Checked</button></div></div>
          <button type="button" class="cm-pill" id="ordMore" onclick="ordToggleMore('doc')">All columns</button>
          <button type="button" class="cm-pill ord-phone" data-sxcm="doc" aria-label="Sort and filter">Filter</button>
          <span class="ord-sp"></span>
          <button type="button" class="cm-pill" id="ordClear" hidden onclick="ordT.clear();ordT.draw()">Clear filters</button>${typeof rexButtons === 'function' ? rexButtons('ordExport') : ''}
        </div>
        <p class="ord-key"><span class="ord-st ord-look">Orange</span> means it needs a look. Hover it, or see section 2, for why.</p>
        ${ordBulkHtml('doc')}
        <div class="ord-card"><table id="ordTbl"></table></div>
        ${ordPagerHtml('doc')}
      </section>
      <section class="ord-how" id="ordHow"><h3>How it is worked out</h3><div class="sc-seg ord-pick" id="ordPick" role="group" aria-label="Which figure"></div><div class="ord-hcard" id="ordHCard"></div></section>
      ${ordAboutHtml()}`;
    const find = `<section class="ord-find" aria-label="Find an order"><input id="ordFind" type="search" autocomplete="off" placeholder="Find an order: order number, supplier, product, note..." oninput="ordFindTyped(this.value)"><p class="ord-muted" id="ordFindMsg"></p></section>`;
    body.innerHTML = ans + find + (typeof lgShell === 'function' ? lgShell(ORD_RAIL, secs, 'lg-shell-wide') : secs);
    document.querySelectorAll('#ordersContent .ord-pgsel').forEach(x => { x.value = String(ORD.n); });
  }
  ordPaintAnswer(); ordPaintNotes(); [ordT, ordTL, ordTS].forEach(T => { T.shown = ORD.n; T.page = 0; }); ordTL.draw(); ordTS.draw(); ordT.draw(); ordPaintHow(); ordDrawAbout(); ordOffsets(); ordWatch();
}
function ordAboutHtml() { return '<section class="ord-how ord-about" id="ordAbout"><h3>About this page</h3><div class="sc-seg ord-pick" id="ordAPick" role="group" aria-label="About this page"></div><div class="ord-hcard" id="ordACard"></div></section>'; }

function ordPaintAnswer() {
  const gs = ordScope(), a = document.getElementById('ordAns'), a2 = document.getElementById('ordAns2');
  if (!gs.length) { a.textContent = 'Nothing tracked in this Period for ' + ordScopeText() + '. Try a wider Period.'; a2.textContent = ''; return; }
  const sup = {}; gs.forEach(g => { sup[g.s] = 1; });
  const ns = Object.keys(sup).length, ord = gs.filter(g => g.type === 'Order'), inv = gs.filter(g => g.hasInv || g.type === 'Invoice'), st = gs.filter(g => g.type === 'Statement'), lk = gs.filter(g => g.x), dc = ordSumDisc(gs), sum = ordSumInv(gs);
  const pl = (n, one, many) => n === 1 ? one : many;
  a.innerHTML = ordFig(gs.length, 'Everything tracked', {}) + ' ' + pl(gs.length, 'order, invoice or statement', 'orders, invoices and statements') + ' from ' + ns + pl(ns, ' supplier, ', ' suppliers, ') + 'each tracked once: ' +
    ordFig(ord.length, 'Orders', { kind: 'order' }) + pl(ord.length, ' order, ', ' orders, ') + ordFig(inv.length, 'Invoices', { kind: 'inv' }) + pl(inv.length, ' invoice', ' invoices') +
    (sum ? ' with ' + ordMoney(sum, 'Invoices with an amount', { kind: 'inv', amt: 1 }) + ' on them' : '') + (dc ? ', ' + ordMoney(dc, 'Orders with a discount', { disc: 1 }) + ' of it in discounts' : '') + ', ' +
    ordFig(st.length, 'Statements', { kind: 'stmt' }) + pl(st.length, ' statement, and ', ' statements, and ') + ordFig(lk.length, 'Needs a look', { look: 1 }) + ' that need a look.';
  a2.textContent = ordScopeText() + ' · ' + ordPeriodText() + '. One order is one row, however many emails it has. Amounts count only what the email shows.';
}
function ordPaintNotes() {
  const cn = document.getElementById('ordChkN'); if (cn) cn.textContent = ordGroups.filter(g => g.chk).length;
  ordPaintOverview();
  const gs = ordScope(), lk = gs.filter(g => g.x), w1 = document.getElementById('ordW1'), w2 = document.getElementById('ordW2'), w3 = document.getElementById('ordW3');
  const w0 = document.getElementById('ordW0');
  if (w0) { const st = {}; gs.forEach(g => { const c = ordCat(g); st[c] = (st[c] || 0) + 1; }); const top = Object.keys(st).sort((a, b) => st[b] - st[a])[0];
    w0.textContent = !gs.length ? 'Nothing tracked in this Period.' : lk.length ? lk.length + ' of ' + gs.length + ' need a look (' + Math.round(lk.length / gs.length * 100) + '%). Most are ' + top.toLowerCase() + '. Tap a number to see which.' : 'Nothing needs a look. Most are ' + top.toLowerCase() + '.'; }
  w1.textContent = lk.length ? lk.length + ' in this Period. Start with the oldest: it has waited longest.' : 'Nothing needs a look in this Period.';
  const rows = ordSupRows(); w2.textContent = rows.length ? rows[0].s + ' has the most tracked items (' + rows[0].n + '). A supplier with orders but no invoice yet is worth a message.' : 'No supplier in this Period.';
  const noinv = gs.filter(g => /No invoice seen/.test(g.x)).length;
  w3.textContent = noinv ? noinv + ' order' + (noinv === 1 ? ' has' : 's have') + ' no invoice seen after a week. Open the Needs a look list to find them.' : 'Every order older than a week has its invoice.';
}

// ── TABLES (sheet-table.js: the Google Sheets heading menus) ─────────────────────────
function ordSupRows() {
  const m = {}; ordScope().forEach(g => { (m[g.s] || (m[g.s] = [])).push(g); });
  return Object.keys(m).map(s => { const gs = m[s]; return { s, gs, n: gs.length, ord: gs.filter(g => g.type === 'Order').length, inv: gs.filter(g => g.hasInv || g.type === 'Invoice').length, amt: ordSumInv(gs), disc: ordSumDisc(gs),
    last: gs.reduce((x, g) => g.last > x ? g.last : x, ''), pdf: gs.filter(g => ordIsKept(g)).length, look: gs.filter(g => g.x).length }; }).sort((a, b) => b.n - a.n);
}
function ordStatusPill(g) {
  if (g.canc) return `<button type="button" class="ord-st" data-k="${ordEsc(g.key)}" title="Marked as cancelled by ${ordEsc(g.chk.by || '')}" onclick="ordOpen(this.dataset.k)">Cancelled</button>`;
  if (g.chk && !g.x) return `<button type="button" class="ord-st ord-ok" data-k="${ordEsc(g.key)}" title="Checked in the account by ${ordEsc(g.chk.by || '')}" onclick="ordOpen(this.dataset.k)">Checked</button>`;
  if (g.x) return `<button type="button" class="ord-st ord-look" data-k="${ordEsc(g.key)}" title="${ordEsc('Needs a look: ' + g.x)}" onclick="ordOpen(this.dataset.k)">${ordEsc(g.st)}</button>`;
  return `<span class="ord-st${/Invoiced|Delivered|Shipped|Confirmed/.test(g.st) ? ' ord-ok' : ''}">${ordEsc(g.st)}</span>`;
}
const ordRcPill = g => `<button type="button" class="ord-rc${ordIsKept(g) ? ' ord-pdf' : ''}" data-k="${ordEsc(g.key)}" title="Open this order: items, steps and emails" onclick="ordOpen(this.dataset.k)">${ordEsc(g.f)}</button>`;
const ordDiscCell = g => g.disc ? `<button type="button" class="ord-dsc" data-k="${ordEsc(g.key)}" onclick="ordOpen(this.dataset.k)">- AED ${ordAed(g.disc)}</button>` : g.discPct ? `<button type="button" class="ord-dsc ord-warn" data-k="${ordEsc(g.key)}" onclick="ordOpen(this.dataset.k)">${g.discPct}% applied</button>` : '<span class="ord-muted">-</span>';
const ordItemsCell = g => g.items ? `<button type="button" class="ord-lk" data-k="${ordEsc(g.key)}" onclick="ordOpen(this.dataset.k)">${g.items} item${g.items === 1 ? '' : 's'}${g.units && g.units !== g.items ? ', ' + g.units + ' units' : ''}</button>`
  : g.oos.length ? `<button type="button" class="ord-lk" data-k="${ordEsc(g.key)}" onclick="ordOpen(this.dataset.k)">out of stock list</button>` : g.type === 'Order' ? '<span class="ord-muted">in the file</span>' : '<span class="ord-muted">-</span>';

function ordBuildTables() {
  const dateCol = () => ({ k: 'd', l: 'Started', t: 'txt', raw: g => ordDay(g.start), disp: g => ordDay(g.start), sk: g => Date.parse(g.start), cell: g => ordDay(g.start) });
  const supCol = () => ({ k: 's', l: 'Supplier', t: 'txt', raw: g => g.s, disp: g => g.s, cell: g => '<b>' + ordEsc(g.s) + '</b>' });
  const salCol = () => ({ k: 'b', l: 'Salon', t: 'txt', raw: g => ordName(g.b), disp: g => ordName(g.b), cell: g => ordEsc(ordName(g.b)) });
  const amtCol = () => ({ k: 'a', l: 'Total', sub: 'AED', t: 'num', raw: g => g.a == null ? -1 : g.a, disp: g => g.a == null ? '' : ordAed(g.a), cell: g => g.a == null ? '<span class="ord-muted">-</span>' : `<button type="button" class="ord-lk" data-k="${ordEsc(g.key)}" title="Open this order" onclick="ordOpen(this.dataset.k)">${ordAed(g.a)}</button>` });   // one order's total opens that order (it used to open every order of the supplier under this order's name)
  ordTL = TRSheet.table({ id: 'ordlook', el: '#ordTblLook', rows: () => (ORD.q ? ordGroups : ordScope()).filter(g => g.x && ordFindOk(g)), limit: ORD.n,
    cols: [ordSelCol('look'), dateCol(), supCol(),
      { k: 'x', l: 'Why it needs a look', t: 'txt', raw: g => g.x, disp: g => g.x, cell: g => `<button type="button" class="ord-st ord-look" data-k="${ordEsc(g.key)}" onclick="ordOpen(this.dataset.k)">${ordEsc(g.x)}</button>` },
      { k: 'k', l: 'Type', t: 'txt', raw: g => g.type, disp: g => g.type, cell: g => ordEsc(g.type) }, salCol(), amtCol()],
    total: rows => ({ d: rows.length + ' to look at' }), after: (T, rows) => { ordAfter('look', T, rows, 'to look at'); ordBulkPaint(); } });
  ordTS = TRSheet.table({ id: 'ordsup', el: '#ordTblSup', rows: ordSupRows, limit: ORD.n,
    cols: [
      { k: 's', l: 'Supplier', t: 'txt', raw: r => r.s, disp: r => r.s, cell: r => '<b>' + ordEsc(r.s) + '</b>' },
      { k: 'n', l: 'Tracked', t: 'num', raw: r => r.n, disp: r => r.n, cell: r => ordFig(r.n, r.s, { s: r.s }) },
      { k: 'o', l: 'Orders', t: 'num', raw: r => r.ord, disp: r => r.ord, cell: r => ordFig(r.ord, r.s + ', orders', { s: r.s, kind: 'order' }) },
      { k: 'v', l: 'Invoices', t: 'num', raw: r => r.inv, disp: r => r.inv, cell: r => ordFig(r.inv, r.s + ', invoices', { s: r.s, kind: 'inv' }) },
      { k: 'm', l: 'Invoiced', sub: 'AED, where shown', t: 'num', raw: r => r.amt, disp: r => r.amt ? ordAed(r.amt) : '', cell: r => ordMoney(r.amt, r.s + ', invoices with an amount', { s: r.s, kind: 'inv', amt: 1 }) },
      { k: 'q', l: 'Discounts', sub: 'AED, where shown', t: 'num', raw: r => r.disc, disp: r => r.disc ? ordAed(r.disc) : '', cell: r => ordMoney(r.disc, r.s + ', orders with a discount', { s: r.s, disc: 1 }) },
      { k: 'l', l: 'Latest', t: 'txt', raw: r => ordDay(r.last), disp: r => ordDay(r.last), sk: r => Date.parse(r.last), cell: r => ordDay(r.last) },
      { k: 'p', l: 'Receipts kept', t: 'num', x: 1, raw: r => r.pdf, disp: r => r.pdf, cell: r => ordFig(r.pdf, r.s + ', with a PDF kept', { s: r.s, file: 1 }) },
      { k: 'w', l: 'Needs a look', t: 'num', x: 1, raw: r => r.look, disp: r => r.look, cell: r => ordFig(r.look, r.s + ', needs a look', { s: r.s, look: 1 }) }],
    total: rows => { let n = 0, o = 0, v = 0, a = 0, q = 0; rows.forEach(r => { n += r.n; o += r.ord; v += r.inv; a += r.amt; q += r.disc; }); return { s: rows.length + ' suppliers', n: ordFig(n, 'Everything tracked', {}), o: ordFig(o, 'Orders', { kind: 'order' }), v: ordFig(v, 'Invoices', { kind: 'inv' }), m: ordMoney(a, 'Invoices with an amount', { kind: 'inv', amt: 1 }), q: ordMoney(q, 'Orders with a discount', { disc: 1 }) }; }, after: (T, rows) => ordAfter('sup', T, rows, 'suppliers') });
  ordT = TRSheet.table({ id: 'ordall', el: '#ordTbl', limit: ORD.n,
    rows: () => ORD.kind === 'Checked' ? ordGroups.filter(g => g.chk && ordFindOk(g)) : (ORD.q ? ordGroups : ordScope()).filter(g => (!ORD.kind || g.type === ORD.kind) && ordFindOk(g)),
    cols: [ordSelCol('doc'), dateCol(), supCol(), salCol(),
      { k: 'n', l: 'Items', sub: 'what was bought', t: 'num', raw: g => g.items, disp: g => g.items ? g.items : '', cell: ordItemsCell },
      amtCol(),
      { k: 'q', l: 'Discount', sub: 'AED or %', t: 'num', raw: g => g.disc || g.discPct, disp: g => g.disc ? ordAed(g.disc) : g.discPct ? g.discPct + '%' : '', cell: ordDiscCell },
      { k: 'rf', l: 'Refund', sub: 'AED', t: 'num', raw: g => g.refund || 0, disp: g => g.refund ? ordAed(g.refund) : '', cell: g => g.refund ? `<button type="button" class="ord-dsc" data-k="${ordEsc(g.key)}" title="${ordEsc(g.refundFor ? 'Refund for order ' + g.refundFor : 'Refund stated in the supplier\'s email')}" onclick="ordOpen(this.dataset.k)">${ordAed(g.refund)}</button>${g.refundOnly && g.refundFor ? `<small class="ord-rfo">${ordByKey['AMAZON.AE|' + g.refundFor] ? `<button type="button" class="ord-lk" data-k="${ordEsc('AMAZON.AE|' + g.refundFor)}" title="Open the order this refund is for" onclick="ordOpen(this.dataset.k)">order ${ordEsc(g.refundFor)}</button>` : 'order ' + ordEsc(g.refundFor) + ', not in the mailbox'}</small>` : ''}` : '<span class="ord-muted">-</span>' },
      { k: 't', l: 'Status', t: 'txt', raw: g => g.st, disp: g => g.st, cell: ordStatusPill },
      { k: 'f', l: 'Receipt', t: 'txt', raw: g => g.f, disp: g => g.f, cell: ordRcPill },
      { k: 'r', l: 'Reference', t: 'txt', x: 1, raw: g => g.r, disp: g => g.r, cell: g => g.r ? ordEsc(g.r) : '<span class="ord-muted">-</span>' },
      { k: 'ty', l: 'Type', t: 'txt', x: 1, raw: g => g.type, disp: g => g.type, cell: g => ordEsc(g.type) },
      { k: 'e', l: 'What it says', t: 'txt', x: 1, raw: g => g.n, disp: g => g.n, cell: g => ordEsc(g.n) },
      { k: 'g', l: 'Category', t: 'txt', x: 1, raw: g => g.cat, disp: g => g.cat, cell: g => ordEsc(g.cat) },
      { k: 'ck', l: 'Checked', t: 'txt', x: 1, raw: g => g.chk ? ordDay(String(g.chk.at).slice(0, 10)) + ' by ' + (g.chk.by || '') : '', disp: g => g.chk ? ordDay(String(g.chk.at).slice(0, 10)) + ' by ' + (g.chk.by || '') : '', sk: g => g.chk ? Date.parse(g.chk.at) : 0,
        cell: g => g.chk ? `<button type="button" class="ord-lk" data-k="${ordEsc(g.key)}" title="Open this order" onclick="ordOpen(this.dataset.k)">${ordEsc(ordDay(String(g.chk.at).slice(0, 10)))} · ${ordEsc(g.chk.by || '')}</button>` : '<span class="ord-muted">-</span>' },
      { k: 'cn', l: 'Check note', t: 'txt', x: 1, raw: g => g.chk ? ordChkTxt(g.chk) : '', disp: g => g.chk ? ordChkTxt(g.chk) : '', cell: g => g.chk && ordChkTxt(g.chk) ? ordEsc(ordChkTxt(g.chk)) : '<span class="ord-muted">-</span>' }],
    rowCls: g => g.x ? 'ord-rowlook' : '',
    total: rows => ({ d: rows.length + ' tracked', a: ordMoney(ordSumInv(rows), 'Invoices with an amount', { kind: 'inv', amt: 1 }), q: ordMoney(ordSumDisc(rows), 'Orders with a discount', { disc: 1 }, true), rf: rows.some(g => g.refund) ? ordAed(rows.reduce((t, g) => t + (g.refund || 0), 0)) : '' }),
    after: (T, rows) => { ordAfter('doc', T, rows, 'tracked'); ordBulkPaint(); } });
}
// ── OVERVIEW (Kate, 23 Nov 2026: "bago ang needs a look dapat may overview, graphs of which is which") ──
// Three small bar charts of the orders the masthead picks: where they are, why some need a look, who they are with. Orange is "needs a look", green is "fine".
// Every figure opens the orders behind it. Every bar lifts and glows on hover and says what it means in one sentence (a tap does the same on a phone).
const ORD_STAGES = ['Quotation', 'Ordered', 'Confirmed', 'Shipped', 'Delivered', 'Invoiced', 'Statement', 'Refund', 'Cancelled', 'Checked'];
const ordCat = g => g.canc ? 'Cancelled' : (g.chk && !g.x) ? 'Checked' : g.st;
const ordWhy = g => !g.x ? [] : g.x.split('; ').map(t => /^Invoice overdue/.test(t) ? 'Invoice overdue' : /^Invoice due in/.test(t) ? 'Invoice due soon' : /^No invoice seen/.test(t) ? 'No invoice seen' : /^No delivery email/.test(t) ? 'No delivery email' : /discount/i.test(t) ? 'Discount to check' : /stock/i.test(t) ? 'Out of stock' : 'Something else');
const ORD_WHYS = ['Invoice overdue', 'Invoice due soon', 'No invoice seen', 'No delivery email', 'Discount to check', 'Out of stock', 'Something else'];
function ordBarRow(label, parts, max, n, title, f, tip) {
  // parts: [{ n, cls }] drawn left to right; the bar is as long as n is against the biggest row of the chart
  const w = max ? n / max * 100 : 0;
  return `<div class="ord-bar1" tabindex="0" data-ordtip="${ordEsc(tip)}"><span class="ob-l">${ordEsc(label)}</span><span class="ob-t"><span class="ob-f" style="width:${w.toFixed(1)}%">${parts.filter(p => p.n > 0).map(p => `<i class="${p.cls}" style="flex:${p.n}"></i>`).join('')}</span></span><span class="ob-n">${ordFig(n, title, f)}</span></div>`;
}
function ordPaintOverview() {
  const el = document.getElementById('ordOverview'); if (!el) return;
  const gs = ordScope(); if (!gs.length) { el.innerHTML = '<p class="ord-muted">Nothing tracked in this Period. Try a wider Period.</p>'; return; }
  const pl = (n, a, b) => n === 1 ? a : b, look = g => !!g.x;
  // 1 where they are
  const cat = {}; gs.forEach(g => { const c = ordCat(g); (cat[c] || (cat[c] = [])).push(g); });
  const cats = Object.keys(cat).sort((a, b) => { const ia = ORD_STAGES.indexOf(a), ib = ORD_STAGES.indexOf(b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || cat[b].length - cat[a].length; });
  const m1 = Math.max.apply(null, cats.map(c => cat[c].length));
  const c1 = cats.map(c => { const a = cat[c], lk = a.filter(look).length; return ordBarRow(c, [{ n: lk, cls: 'ob-look' }, { n: a.length - lk, cls: 'ob-ok' }], m1, a.length, c, { cat: c }, c + ': ' + a.length + ' ' + pl(a.length, 'order, invoice or statement', 'orders, invoices and statements') + (lk ? ', ' + lk + (lk === 1 ? ' of them needs' : ' of them need') + ' a look.' : ', none need a look.')); }).join('');
  // 2 why they need a look
  const why = {}; gs.filter(look).forEach(g => { ordWhy(g).forEach(w => { (why[w] || (why[w] = {}))[g.key] = 1; }); });
  const ws = ORD_WHYS.filter(w => why[w]), nl = gs.filter(look).length, m2 = Math.max.apply(null, [1].concat(ws.map(w => Object.keys(why[w]).length)));
  const c2 = ws.length ? ws.map(w => { const n = Object.keys(why[w]).length; return ordBarRow(w, [{ n, cls: 'ob-look' }], m2, n, w, { why: w }, w + ': ' + n + ' of the ' + nl + ' that need a look (' + Math.round(n / nl * 100) + '%). One order can have more than one reason.'); }).join('') : '<p class="ord-muted">Nothing needs a look in this Period.</p>';
  // 3 who they are with
  const sup = ordSupRows().slice(0, 8), m3 = Math.max.apply(null, [1].concat(sup.map(r => r.n)));
  const c3 = sup.map(r => ordBarRow(r.s, [{ n: r.look, cls: 'ob-look' }, { n: r.n - r.look, cls: 'ob-ok' }], m3, r.n, r.s, { s: r.s }, r.s + ': ' + r.n + ' tracked, ' + r.look + ' need a look, ' + (r.n - r.look) + ' fine.')).join('');
  const more = ordSupRows().length - sup.length;
  el.innerHTML = `<div class="ord-ovg">
    <div class="ord-ovc"><h4>Where they are</h4><p class="ord-ovs">${gs.length} tracked, by where each one has got to.</p>${c1}<p class="ord-leg"><i class="ob-look"></i>needs a look <i class="ob-ok"></i>fine</p></div>
    <div class="ord-ovc"><h4>Why they need a look</h4><p class="ord-ovs">${nl} ${pl(nl, 'order needs', 'orders need')} a look, by reason.</p>${c2}</div>
    <div class="ord-ovc"><h4>Who they are with</h4><p class="ord-ovs">${ordSupRows().length} ${pl(ordSupRows().length, 'supplier', 'suppliers')}${more > 0 ? ', the ' + sup.length + ' with the most' : ''}.</p>${c3}<p class="ord-leg"><i class="ob-look"></i>needs a look <i class="ob-ok"></i>fine</p></div></div>`;
}
// the answer card of a bar: follows the pointer on a computer, a tap on a phone (the figure inside still opens its list)
let ordTipEl = null, ordTipT = 0;
function ordTip(row, x, y) {
  if (!ordTipEl) { ordTipEl = document.createElement('div'); ordTipEl.className = 'ord-hovc'; ordTipEl.setAttribute('role', 'status'); document.body.appendChild(ordTipEl); }
  ordTipEl.textContent = row.dataset.ordtip; ordTipEl.hidden = false;
  const w = ordTipEl.offsetWidth, h = ordTipEl.offsetHeight;
  ordTipEl.style.left = Math.max(8, Math.min(innerWidth - w - 8, x + 14)) + 'px'; ordTipEl.style.top = Math.max(8, Math.min(innerHeight - h - 8, y - h - 26)) + 'px';
}
const ordTipHide = () => { clearTimeout(ordTipT); if (ordTipEl) ordTipEl.hidden = true; };
const ordHover = () => window.matchMedia && matchMedia('(hover:hover)').matches;
document.addEventListener('mousemove', e => { if (!ordHover()) return; const r = e.target.closest && e.target.closest('.ord-bar1'); r ? ordTip(r, e.clientX, e.clientY) : ordTipHide(); });
document.addEventListener('focusin', e => { const r = e.target; if (r && r.classList && r.classList.contains('ord-bar1')) { const b = r.getBoundingClientRect(); ordTip(r, b.left + 60, b.top + 20); } });
document.addEventListener('focusout', e => { if (e.target && e.target.classList && e.target.classList.contains('ord-bar1')) ordTipHide(); });
document.addEventListener('click', e => {
  if (ordHover()) return;
  const r = e.target.closest && e.target.closest('.ord-bar1'); if (!r || e.target.closest('.dn,[data-dn],button,a')) return;
  ordTip(r, 0, innerHeight); clearTimeout(ordTipT); ordTipT = setTimeout(ordTipHide, 5000);
});

// ── BULK: tick orders in Needs a look or in Every order and mark them all checked or all cancelled (Kate, 23 Nov 2026) ──
// The ticks live in ORD_SEL (one set for the page). Only the ticked orders that a table shows right now (its filters included) are acted on, so an order filtered out can never be marked by accident.
// An order somebody has already checked or cancelled has no box: it is done.
const ordSelectable = g => !g.chk;
const ordBulkTab = k => k === 'doc' ? ordT : ordTL, ordBulkSel = k => k === 'doc' ? '#ordTbl' : '#ordTblLook';
const ordBulkRows = k => { const T = ordBulkTab(k); return T ? T.rows().filter(ordSelectable) : []; };
const ordBulkPage = k => { const T = ordBulkTab(k); return T ? T.rows().slice(T.page * T.shown, (T.page + 1) * T.shown).filter(ordSelectable) : []; };
const ordSelKeys = k => { const all = new Set(ordBulkRows(k).map(g => g.key)); return Array.from(ORD_SEL).filter(x => all.has(x)); };
const ordSelCell = k => g => ordSelectable(g) ? `<input type="checkbox" class="ord-cb" data-k="${ordEsc(g.key)}" ${ORD_SEL.has(g.key) ? 'checked ' : ''}onchange="ordSelToggle(this)" aria-label="Select ${ordEsc(g.s + (g.r ? ' ' + g.r : ''))}">` : '';
const ordSelCol = k => ({ k: 'sel', l: 'Select', t: 'txt', hd: () => ordSelHead(k), hide: () => k === 'doc' && ORD.kind === 'Checked', raw: g => ORD_SEL.has(g.key) ? 1 : 0, disp: g => ORD_SEL.has(g.key) ? 'Selected' : '', cell: ordSelCell(k) });
function ordSelHead(k) {
  const pg = ordBulkPage(k), n = pg.filter(g => ORD_SEL.has(g.key)).length;
  return `<input type="checkbox" class="ord-cb" id="ordSelPage-${k}" onchange="ordSelPage(this,'${k}')" aria-label="Select every order on this page"${pg.length && n === pg.length ? ' checked' : ''}>`;
}
function ordBulkHtml(k) {
  return `<div class="ord-bulk" id="ordBulk-${k}" hidden><span class="ord-bk-n" id="ordBulkN-${k}"></span><button type="button" class="cm-pill" id="ordBulkAll-${k}" hidden onclick="ordSelAll('${k}')"></button><input type="text" id="ordBulkNote-${k}" maxlength="500" autocomplete="off" aria-label="Note for all the selected orders" placeholder="Note for all of them, e.g. tax invoice complete, paid by bank transfer"><button type="button" class="cm-pill" id="ordBulkGo-${k}" onclick="ordBulkSave(false,'${k}')" title="Checked in the supplier's account: a note is needed">Mark as checked</button><button type="button" class="cm-pill" id="ordBulkCx-${k}" onclick="ordBulkSave(true,'${k}')" title="Cancelled in the supplier's account: closed, nothing is owed">Mark as cancelled</button><button type="button" class="cm-pill" onclick="ordSelClear()">Clear</button><span class="ord-muted" id="ordBulkMsg-${k}" role="status"></span></div>`;
}
const ordBoxes = () => document.querySelectorAll('#ordTblLook .ord-cb, #ordTbl .ord-cb');
function ordSelToggle(cb) { cb.checked ? ORD_SEL.add(cb.dataset.k) : ORD_SEL.delete(cb.dataset.k); ordBoxes().forEach(x => { if (x.dataset.k === cb.dataset.k) x.checked = cb.checked; }); ordBulkPaint(); }
function ordSelPage(cb, k) {
  ordBulkPage(k).forEach(g => { cb.checked ? ORD_SEL.add(g.key) : ORD_SEL.delete(g.key); });
  ordBoxes().forEach(x => { if (x.dataset.k) x.checked = ORD_SEL.has(x.dataset.k); });
  ordBulkPaint();
}
function ordSelAll(k) { ordBulkRows(k).forEach(g => ORD_SEL.add(g.key)); ordBoxes().forEach(x => { if (x.dataset.k) x.checked = ORD_SEL.has(x.dataset.k); }); ordBulkPaint(); }
function ordSelClear() { ORD_SEL.clear(); ordBoxes().forEach(x => { x.checked = false; x.indeterminate = false; }); ['look', 'doc'].forEach(k => { const m = document.getElementById('ordBulkMsg-' + k); if (m) m.textContent = ''; }); ordBulkPaint(); }
function ordBulkPaint() {
  ['look', 'doc'].forEach(k => {
    const bar = document.getElementById('ordBulk-' + k); if (!bar) return;
    const keys = ordSelKeys(k), total = ordBulkRows(k).length, pg = ordBulkPage(k), n = pg.filter(g => ORD_SEL.has(g.key)).length;
    bar.hidden = !keys.length && !(document.getElementById('ordBulkMsg-' + k) || {}).textContent;
    document.getElementById('ordBulkN-' + k).textContent = keys.length ? keys.length + ' selected' : '';
    const all = document.getElementById('ordBulkAll-' + k); all.hidden = !keys.length || keys.length >= total; all.textContent = 'Select all ' + total;
    ['ordBulkNote-', 'ordBulkGo-', 'ordBulkCx-'].forEach(id => { const e = document.getElementById(id + k); if (e) e.hidden = !keys.length; });
    const hp = document.getElementById('ordSelPage-' + k); if (hp) { hp.checked = pg.length > 0 && n === pg.length; hp.indeterminate = n > 0 && n < pg.length; }
  });
}
let ordBulkBusy = false;
async function ordBulkSave(canc, k) {
  const keys = ordSelKeys(k).filter(x => ordByKey[x] && ordSelectable(ordByKey[x])), msg = document.getElementById('ordBulkMsg-' + k), noteEl = document.getElementById('ordBulkNote-' + k);
  if (!keys.length || ordBulkBusy) return;
  const note = (noteEl.value || '').trim(), what = keys.length + ' order' + (keys.length === 1 ? '' : 's');
  if (!canc && !note) { msg.textContent = 'Type a note for all of them first, for example: tax invoice complete, paid by bank transfer.'; noteEl.focus(); return; }
  if (!confirm('Mark ' + what + ' as ' + (canc ? 'cancelled' : 'checked') + '?\n\nThe note is kept on each one, with your name and today\'s date. Each can be undone from its own window.')) return;
  ordBulkBusy = true;
  const btns = document.querySelectorAll('#ordBulk-' + k + ' button'); btns.forEach(b => { b.disabled = true; }); noteEl.disabled = true;
  const note2 = canc ? ('[cancelled] ' + note).trim() : note, ok = [], bad = [];
  for (let i = 0; i < keys.length; i += 5) {
    await Promise.all(keys.slice(i, i + 5).map(async x => {
      try {
        const proofs = ((ordDrafts[x] || {}).proofs || []).map(p => ({ path: p.path, name: p.name }));   // files already added to this order's draft stay with it
        const r = await sb.rpc('orders_check_set', { p_group: x, p_on: true, p_note: note2 || null, p_proofs: proofs });
        if (r.error) throw r.error;
        ordChecks[x] = { by: (r.data && r.data.by) || '', at: new Date().toISOString(), note: note2 || null, proofs };
        delete ordDrafts[x]; ORD_SEL.delete(x); ok.push(x);
      } catch (e) { console.error(e); bad.push(x); }
    }));
    msg.textContent = 'Saving ' + (ok.length + bad.length) + ' of ' + keys.length + '...';
  }
  ordBulkBusy = false; btns.forEach(b => { b.disabled = false; }); noteEl.disabled = false;
  if (ok.length) { noteEl.value = ''; ordBuild(ordRows); ordPaintAnswer(); ordPaintNotes(); [ordTL, ordTS, ordT].forEach(T => { if (T) T.draw(); }); ordOffsets(); }
  msg.textContent = (ok.length ? ok.length + ' marked as ' + (canc ? 'cancelled' : 'checked') + '.' : '') + (bad.length ? ' ' + bad.length + ' did not save: they are still ticked, try again.' : '');
  ordBulkPaint();
}

// ── ARROWS: the open order has ← and → to go to the one before or after it in the list it was opened from (Kate, 23 Nov 2026) ──
// The list is the table's rows in the order shown (every page, filters and sort included), or the orders of the list window that is open.
document.addEventListener('click', e => { ordLastEl = e.target; }, true);
function ordNavFrom(el) {
  if (!el || !el.closest) return [];
  let keys = [];
  if (el.closest('#ordTblLook') && ordTL) keys = ordTL.rows().map(g => g.key);
  else if (el.closest('#ordTbl') && ordT) keys = ordT.rows().map(g => g.key);
  else { const w = el.closest('.dr-modal'); if (w) w.querySelectorAll('[onclick*="ordOpen"][data-k]').forEach(b => keys.push(b.dataset.k)); }
  const seen = {}; return keys.filter(k => ordByKey[k] && !seen[k] && (seen[k] = 1));
}
function ordNavGo(d) {
  if (!ordCur) return;
  const i = ordNavList.indexOf(ordCur.key) + d;
  if (i < 0 || i >= ordNavList.length) return;
  ordOpen(ordNavList[i], true);
}
document.addEventListener('keydown', e => {
  if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || !document.getElementById('ordModal')) return;
  const t = e.target; if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;   // never steal the arrows while a note is being typed
  e.preventDefault(); ordNavGo(e.key === 'ArrowLeft' ? -1 : 1);
});
function ordNavHtml(g) {
  const i = ordNavList.indexOf(g.key), n = ordNavList.length; if (i < 0 || n < 2) return '';
  return `<span class="ord-nv"><button type="button" class="cm-pill" onclick="ordNavGo(-1)" title="The one before (left arrow key)" aria-label="Previous order"${i === 0 ? ' disabled' : ''}>←</button><span class="ord-npos">${i + 1} of ${n}</span><button type="button" class="cm-pill" onclick="ordNavGo(1)" title="The next one (right arrow key)" aria-label="Next order"${i === n - 1 ? ' disabled' : ''}>→</button></span>`;
}
function ordKind(k) {
  ORD.kind = k; ordT.page = 0;
  // the Checked view shows every column and the newest tick first; leaving it puts the table back as it was
  if (k === 'Checked') { ordT.more = true; ordT.sort = { k: 'ck', dir: -1 }; } else if (ordT.sort && ordT.sort.k === 'ck') { ordT.more = false; ordT.sort = null; }
  document.querySelectorAll('[data-ord-kind]').forEach(b => b.classList.toggle('on', b.dataset.ordKind === k)); ordT.draw(); ordOffsets();
}
// A table with a Rows choice has pages (Kate, 18 Nov 2026): Previous, Page x of y, Next, on every table of the page. One Rows choice is remembered for all three.
const ordTab = k => k === 'look' ? ordTL : k === 'sup' ? ordTS : ordT;
function ordPagerHtml(k) {
  return `<div class="ord-pager" id="ordPg-${k}"><span class="ord-pgt"></span><span class="ord-sp"></span><span class="slv-eyebrow">Rows</span><select class="ord-pgsel" aria-label="Rows to show" onchange="ordRowsPick('${k}',+this.value)"><option value="10">10</option><option value="20">20</option><option value="50">50</option><option value="100">100</option></select>
    <button type="button" class="cm-pill ord-prev" onclick="ordPage('${k}',-1)">‹ Previous</button><span class="ord-pgn"></span><button type="button" class="cm-pill ord-next" onclick="ordPage('${k}',1)">Next ›</button></div>`;
}
function ordAfter(k, T, rows, noun) {
  const c = document.getElementById(k === 'doc' ? 'ordClear' : k === 'look' ? 'ordClearLook' : 'ordClearSup'); if (c) c.hidden = !T.active();
  const el = document.getElementById('ordPg-' + k); if (!el) return;
  const from = rows.length ? T.page * T.shown + 1 : 0, to = Math.min(rows.length, (T.page + 1) * T.shown), pages = T.pages(rows.length);
  el.querySelector('.ord-pgt').textContent = from + ' to ' + to + ' of ' + rows.length + ' ' + noun;
  el.querySelector('.ord-prev').disabled = T.page <= 0; el.querySelector('.ord-next').disabled = T.page >= pages - 1; el.querySelector('.ord-pgn').textContent = 'Page ' + (T.page + 1) + ' of ' + pages;
  el.hidden = rows.length <= 10;   // a short list needs no pager
}
function ordRowsPick(k, n) { ORD.n = n; ordSave(); const T = ordTab(k); T.shown = n; T.page = 0; T.draw(); ordOffsets(); }
// The toolbar above each table is sticky, so it already sits under the masthead and scrollIntoView on it pushed the page down by that much on every click
// (Kate, 20 Nov 2026: "keeps scrolling down as i go through page per page"). Only ever scroll UP, and only if the top of the table has gone out of view,
// so the new page starts at its first row and the pager never runs away from the cursor.
function ordPage(k, d) {
  const T = ordTab(k); T.page += d; T.draw(); ordOffsets();
  const sec = document.getElementById('ordPg-' + k).closest('.ord-sec'), b = sec.querySelector('.ord-bar'), w = sec.querySelector('.sx-wrap') || sec.querySelector('table');
  if (!b || !w) return;
  const gap = w.getBoundingClientRect().top - b.getBoundingClientRect().bottom;
  if (gap < 0) window.scrollBy(0, gap);
}
function ordToggleMore(w) { const T = w === 'sup' ? ordTS : ordT; T.toggleMore(); }
function ordOffsets() {
  const side = document.querySelector('#ordersContent .lg-side'), mast = document.getElementById('topbar'), root = document.documentElement.style;
  const edge = mast && getComputedStyle(mast).position === 'fixed' ? Math.max(0, Math.round(mast.getBoundingClientRect().bottom)) : 0;
  // below the gutter width the rail is a pinned row of chips: the toolbars sit under it. In the gutter it takes no height at the top.
  const nav = side && side.querySelector('.side-nav'), row = !!(nav && getComputedStyle(nav).display === 'flex' && getComputedStyle(side).position === 'sticky');
  const top = row ? (parseFloat(getComputedStyle(side).top) || edge) : edge;
  root.setProperty('--sx-top', (top + (row ? side.offsetHeight : 0)) + 'px');
  document.querySelectorAll('#ordersContent .ord-sec').forEach(s => { const b = s.querySelector('.ord-bar'); s.style.setProperty('--bh', (b ? b.offsetHeight : 0) + 'px'); });
}
window.addEventListener('resize', () => { if (typeof CURRENT_VIEW !== 'undefined' && CURRENT_VIEW === 'orders') ordOffsets(); });
// Kate, 18 Nov 2026 (component 37): the pinned toolbars follow the masthead and the rail as they really are, not as measured once. Hide filters, the compact
// masthead on scroll, a phone rotation or a late-loading font all change their height, so a ResizeObserver watches them and the offsets are re-read each time.
let ordRO = null, ordRaf = 0;
const ordOnOrders = () => typeof CURRENT_VIEW === 'undefined' || CURRENT_VIEW === 'orders';
function ordWatch() {
  if (ordRO) ordRO.disconnect();
  const mast = document.getElementById('topbar'), side = document.querySelector('#ordersContent .lg-side'), bars = [...document.querySelectorAll('#ordersContent .ord-bar')];
  if (typeof ResizeObserver !== 'undefined') { ordRO = new ResizeObserver(() => { if (ordOnOrders()) ordOffsets(); }); [mast, side, ...bars].forEach(e => { if (e) ordRO.observe(e); }); }
}
window.addEventListener('scroll', () => { if (ordRaf || !ordOnOrders()) return; ordRaf = requestAnimationFrame(() => { ordRaf = 0; ordOffsets(); }); }, { passive: true });

// ── HOW IT IS WORKED OUT, ABOUT THIS PAGE: centred, one short idea per card (component 36) ──
function ordPaintHow() {
  const pick = document.getElementById('ordPick'); if (!pick) return;
  const gs = ordScope(), lk = gs.filter(g => g.x), pdf = gs.filter(g => ordIsKept(g));
  const HOW = {
    look: ['Needs a look', 'A rule puts it here: an overdue statement, a wrong discount, items out of stock, or no invoice after a week (Amazon, Lulu and Hotpack are paid at checkout, so for them it is no delivery email after a week instead).', ordFig(lk.length, 'Needs a look', { look: 1 }) + ' of ' + ordFig(gs.length, 'Everything tracked', {}) + ' tracked', 'New rules are added by Kate.'],
    inv: ['Invoiced and discounts', 'The invoice total of each order, counted once. A discount is what the supplier took off.', ordMoney(ordSumInv(gs), 'Invoices with an amount', { kind: 'inv', amt: 1 }) + ' invoiced<br>' + ordMoney(ordSumDisc(gs), 'Orders with a discount', { disc: 1 }) + ' in discounts', 'An invoice with no amount in the email shows a dash.'],
    rec: ['Receipts kept', 'A PDF or an Excel order form in the email is kept. A PDF opens here, an Excel form downloads.', ordFig(pdf.length, 'With a PDF kept', { file: 1 }) + ' of ' + ordFig(gs.length, 'Everything tracked', {}) + ' have a file', 'File in email means the PDF is attached but not kept here yet.']
  };
  pick.innerHTML = Object.keys(HOW).map(k => `<button type="button" class="${k === ordHK ? 'on' : ''}" onclick="ordHK='${k}';ordPaintHow()">${ordEsc(HOW[k][0])}</button>`).join('');
  const h = HOW[ordHK];
  document.getElementById('ordHCard').innerHTML = `<div class="ord-hc-t">${ordEsc(h[0])}</div><p class="ord-hc-m">${ordEsc(h[1])}</p><div class="ord-hc-big">${h[2]}</div><div class="ord-hc-cv">${ordEsc(h[3])}</div>`;
}
const ORD_ABOUT = {
  one: ['One row per order', 'An order is one row. Its confirmation, shipping note and invoice are steps inside it.', 'Open a row to see the items, discount and emails.'],
  data: ['What this shows', 'Every supplier order, invoice and statement that reaches the info mailbox.', 'New mail is read about every 10 minutes.'],
  items: ['Items and discounts', 'They show where the email, its PDF or its Excel order form lists them.', 'Some suppliers still have no items. Nothing is invented.'],
  who: ['Who sees it', 'Kate, and anyone she adds, like Recruitment with Coach Emma.', 'Not for the whole team.'],
  not: ['Not here yet', 'Payment status. The emails say what was billed, not what was paid.', 'Phone and WhatsApp orders are not here.']
};
function ordDrawAbout() {
  const pick = document.getElementById('ordAPick'); if (!pick) return;
  pick.innerHTML = Object.keys(ORD_ABOUT).map(k => `<button type="button" class="${k === ordAK ? 'on' : ''}" onclick="ordAK='${k}';ordDrawAbout()">${ordEsc(ORD_ABOUT[k][0])}</button>`).join('');
  const h = ORD_ABOUT[ordAK];
  document.getElementById('ordACard').innerHTML = `<div class="ord-hc-t">${ordEsc(h[0])}</div><p class="ord-hc-m">${ordEsc(h[1])}</p>${h[2] ? `<div class="ord-hc-cv">${ordEsc(h[2])}</div>` : ''}`;
}

// ── THE ORDER WINDOW: steps, what was bought, the discount, the emails ───────────────
function ordStepsText(g) {   // the same steps as the row of boxes, written as one line for the download
  const el = document.createElement('div'); el.innerHTML = ordStepsHtml(g);
  return [...el.querySelectorAll('.ord-step')].map(x => x.querySelector('b').textContent + ' ' + x.querySelector('i').textContent).join(' · ');
}
function ordStepsHtml(g) {
  const seen = {}, has = {}; g.docs.forEach(d => { has[d.kind] = 1; });
  g.docs.forEach(d => {
    const k = d.invoice_pdf ? 'Invoiced' : d.kind === 'quotation' ? 'Quoted' : d.kind === 'order' ? 'Ordered' : d.kind === 'confirmation' ? (has.order ? 'Confirmed' : 'Ordered') : d.kind === 'shipped' ? 'Shipped' : d.kind === 'delivered' ? 'Delivered' : d.kind === 'invoice' ? 'Invoiced' : (ORD_KINDNAME[d.kind] || d.kind);
    if (!seen[k]) seen[k] = d.date;
  });
  // Amazon marketplace sellers: an "Invoice request from Amazon customer ..." thread in the mailbox means the invoice has been asked for (the seller's PDF then shows as Invoiced)
  g.docs.forEach(d => { if (/^amazon/i.test(g.s || '') && d.kind !== 'invoice' && !d.invoice_pdf && /invoice request/i.test(d.subject || '') && !seen['Invoice requested']) seen['Invoice requested'] = d.date; });
  const names = g.type === 'Order' ? ['Quoted', 'Ordered', 'Confirmed', 'Shipped', 'Delivered', 'Invoice requested', 'Invoiced'].filter(n => seen[n] || ['Ordered', 'Shipped', 'Delivered', 'Invoiced'].includes(n)) : Object.keys(seen);
  return '<div class="ord-steps" aria-label="Steps">' + names.map(n => `<span class="ord-step${seen[n] ? ' on' : ''}"><b>${ordEsc(n)}</b><i>${seen[n] ? ordDay(seen[n]) : 'not seen'}</i></span>`).join('') + '</div>';
}
// ── TRANSLATE TO ENGLISH (Kate, 19 Nov 2026) ─────────────────────────────────────────
// Some suppliers (Falconpack) write the product names in Arabic. The button sits on the What was bought line, far right above Total AED, and only shows when a name has Arabic in it.
// It swaps every product name in the window for its English and back. Each name is asked for once and kept, so a second click is instant. Only product names leave the page, nothing about the salon.
const ordHasAr = s => /[\u0590-\u08FF\uFB50-\uFEFF]/.test(String(s || ''));
const ordTrCache = {};
async function ordTranslateOne(t) {
  if (ordTrCache[t]) return ordTrCache[t];
  const r = await fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=' + encodeURIComponent(t));
  if (!r.ok) throw new Error('translate ' + r.status);
  const j = await r.json(), out = (j[0] || []).map(x => x[0]).join('').replace(/\s+/g, ' ').trim();
  if (!out) throw new Error('translate empty');
  return (ordTrCache[t] = out);
}
async function ordTranslate(btn) {
  const box = btn.closest('.ord-buy'); if (!box) return;
  const names = [...box.querySelectorAll('.ord-bt .ord-nm')];
  if (btn.dataset.on === '1') {   // back to what the supplier wrote
    names.forEach(n => { if (n.dataset.o != null) n.textContent = n.dataset.o; n.removeAttribute('title'); });
    btn.dataset.on = ''; btn.textContent = 'Translate to English'; return;
  }
  const old = btn.textContent; btn.disabled = true; btn.textContent = 'Translating...';
  try {
    const todo = names.filter(n => ordHasAr(n.dataset.o != null ? n.dataset.o : n.textContent));
    const res = await Promise.all(todo.map(n => ordTranslateOne(n.dataset.o != null ? n.dataset.o : n.textContent)));
    todo.forEach((n, i) => { if (n.dataset.o == null) n.dataset.o = n.textContent; n.textContent = res[i]; n.title = n.dataset.o; });
    btn.dataset.on = '1'; btn.textContent = 'Show original';
  } catch (e) {
    console.error(e); btn.textContent = 'Could not translate, try again';
    setTimeout(() => { if (btn.dataset.on !== '1') btn.textContent = old; }, 3500);
  } finally { btn.disabled = false; }
}
// the downloads carry the English names too (Kate, 19 Nov 2026): returns a function name -> English, and how many names could not be translated (they stay as the supplier wrote them)
async function ordEnglishNames(names) {
  const map = {}; let failed = 0;
  await Promise.all([...new Set(names.filter(ordHasAr))].map(async n => { try { map[n] = await ordTranslateOne(n); } catch (e) { console.error(e); failed++; } }));
  return { en: n => map[n] || n, failed, any: Object.keys(map).length > 0 };
}
function ordBuyHtml(g) {
  const b = g.buy;
  let h = '';
  if (!b) h += `<h4>What was bought</h4><p class="ord-muted">${g.docs.some(d => d.file_path) ? 'The items are in the file of this order. Open it under The emails below. This page could not read its lines.' : g.type === 'Order' ? (g.docs.some(d => d.has_file) ? 'The items are in the attached file (Excel or PDF), which this page does not read yet. It will list every product with its quantity and price.' : 'The items are named in the email on the right. This page could not split them into lines with a quantity and a price' + (/^carrefour/i.test(g.s || '') ? ': they are in the Carrefour account, use the button above.' : '.')) : 'No items are listed in this email.'}</p>`;
  else {
    h += `<div class="ord-bh"><h4>What was bought</h4>${b.lines.some(l => ordHasAr(l.name)) ? '<button type="button" class="cm-pill ord-tr" onclick="ordTranslate(this)" title="Show the product names in English">Translate to English</button>' : ''}</div><table class="ord-bt"><thead><tr><th>Product</th><th class="r">Qty</th><th class="r">Price AED</th><th class="r">Total AED</th></tr></thead><tbody>` +
      b.lines.map(l => `<tr><td data-l="Product"><div class="ord-prod">${ordPhoto(l)}<span><span class="ord-nm">${ordEsc(l.name)}</span>${l.note ? ` <span class="ord-dnote">${ordEsc(l.note)}</span>` : ''}</span></div></td><td class="r" data-l="Qty">${l.qty == null ? '-' : ordEsc(l.qty)}</td><td class="r" data-l="Price AED">${l.unit == null ? '-' : ordAed(+l.unit)}</td><td class="r" data-l="Total AED">${l.total == null ? '-' : ordAed(+l.total)}</td></tr>`).join('') + '</tbody></table>';
    h += '<dl class="ord-tot">' + (b.sub != null ? `<dt>Items after discounts</dt><dd>AED ${ordAed(+b.sub)}</dd>` : '') +
      (b.disc ? `<dt class="ord-dsc">Discount taken off</dt><dd class="ord-dsc">- AED ${ordAed(b.disc)}</dd>` : (b.sub != null ? '<dt>Discount</dt><dd>none</dd>' : '')) +
      (b.deliv != null ? `<dt>Delivery</dt><dd>${+b.deliv ? 'AED ' + ordAed(+b.deliv) : 'free'}</dd>` : '') + (b.vat != null ? `<dt>VAT included</dt><dd>AED ${ordAed(+b.vat)}</dd>` : '') +
      (b.total != null ? `<dt class="ord-big">Total</dt><dd class="ord-big">AED ${ordAed(+b.total)}</dd>` : '') + '</dl>';
  }
  if (g.discPct) h += `<dl class="ord-tot"><dt class="ord-dsc ord-warn">Discount applied</dt><dd class="ord-dsc ord-warn">${g.discPct}%</dd>${g.discShould != null ? `<dt>Discount agreed</dt><dd>${g.discShould}%</dd>` : ''}</dl><p class="ord-dnote2">The AED difference is on the invoice PDF, which this page does not read yet.</p>`;
  if (g.oos.length) h += '<h4>Out of stock, not supplied</h4><table class="ord-bt"><thead><tr><th>Product</th><th class="r">Ordered</th><th class="r">Supplied</th></tr></thead><tbody>' + g.oos.map(l => `<tr><td data-l="Product"><span class="ord-nm">${ordEsc(l.name)}</span></td><td class="r" data-l="Ordered">${ordEsc(l.qty)}</td><td class="r" data-l="Supplied">0</td></tr>`).join('') + '</tbody></table>';
  return '<div class="ord-buy">' + h + '</div>';
}
// ── THE KEPT FILES: a PDF shows INSIDE the dashboard, an Excel form downloads ────────
// Kate, 19 Nov 2026: "ndi updated yung url, naka supabase pa rin". The file is downloaded here with the signed-in session (the storage policy order_files_read) and shown from a blob,
// so the address bar never leaves trk-salon-os.com and no supabase.co link is ever shown. Same way the Recruitment page opens a CV. The bucket is private; Level 5 or the extra page orders.
const ORD_FTYPE = { pdf: 'application/pdf', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel' };
const ordExt = n => (String(n || '').split('.').pop() || '').toLowerCase();
// a stored extra file is named <timestamp>-<name with dashes for spaces>: show it as a person would write it
const ordPretty = n => String(n || '').replace(/^\d+-/, '').replace(/-+/g, ' ').replace(/\s+\.(xlsx?|pdf)$/i, '.$1').trim();
let ordBlobUrl = '', ordCur = null;

// ── THE ORDER WINDOW, TWO COLUMNS (Kate, 19 Nov 2026) ────────────────────────────────
// Left: when a PDF is kept, the PDF and nothing else (a switch brings back What was bought). No PDF: What was bought. Right, the last column: the emails, drawn like Gmail.
// The product's own photo, taken from the supplier's email (Amazon shows one next to every item; the reader job orders-amazon-images keeps its link in lines[].img).
// Only an https picture on Amazon's image host is drawn, and a picture that does not load is dropped, so a line never shows a broken box.
// Amazon (images/I), Carrefour (cdn.mafrservices.com, their picture is 1700 px so a 200 px version is asked for first and the original is the fallback) and Lulu (akinoncloud products).
const ORD_PHOTO_OK = [/^https:\/\/m\.media-amazon\.com\/images\/I\/[\w%+.,\-]+\.(jpg|jpeg|png|webp)$/i, /^https:\/\/cdn\.mafrservices\.com\/[\w%+.,\-\/]+\.(jpg|jpeg|png|webp)(\?[\w=&%.,\-]*)?$/i, /^https:\/\/[\w\-]+\.cdn\.akinoncloud\.com\/products\/[\w%+.,\-\/]+\.(jpg|jpeg|png|webp)$/i];
const ordPhoto = l => {
  const u = String((l && l.img) || '');
  if (!ORD_PHOTO_OK.some(re => re.test(u))) return '';
  const sm = u.replace('Resize=1700', 'Resize=200');
  return `<img class="ord-ph" src="${ordEsc(sm)}" data-o="${ordEsc(u)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="if(this.dataset.o&&this.src!==this.dataset.o){this.src=this.dataset.o}else{this.remove()}">`;
};
const ordKindPdf = d =>d.file_path && ordExt(d.file_name || d.file_path) === 'pdf';
const ordHue = s => { let h = 0; String(s).split('').forEach(c => { h = (h * 31 + c.charCodeAt(0)) % 360; }); return h; };

// a Gmail style attachment card: a small type tile, the file name, what a click does
function ordAttCard(path, name) {
  const nm = name || ordPretty(String(path).split('/').pop()), x = ordExt(nm), pdf = x === 'pdf';
  return `<button type="button" class="ord-ac" data-p="${ordEsc(path)}" data-n="${ordEsc(nm)}" onclick="ordFile(this)" title="${pdf ? 'Show this PDF on the left' : 'Download this Excel form'}"><span class="ord-ai ${pdf ? 'ord-ai-pdf' : 'ord-ai-xls'}">${pdf ? 'PDF' : 'XLS'}</span><span class="ord-an">${ordEsc(nm)}</span><span class="ord-ak">${pdf ? 'Show' : 'Download'}</span></button>`;
}
function ordMsgHtml(d, open) {
  const ours = d.kind === 'order' || d.kind === 'reply', files = (d.file_names || '').split(/;\s*/).filter(Boolean);
  const from = ours ? 'Tara Rose Salon' : d.supplier, to = ours ? d.supplier : 'Tara Rose Salon';
  const snip = String(d.note || d.body || '').replace(/\s+/g, ' ').trim().slice(0, 140);
  const att = d.file_path ? ordAttCard(d.file_path, d.file_name) + (d.kind === 'order' ? `<span class="ord-xtra" data-pre="${ordEsc(String(d.file_path).split('/')[0])}"></span>` : '')
    : files.map(n => `<span class="ord-ac ord-ac-off" title="In the email, not kept here"><span class="ord-ai ord-ai-${/\.pdf$/i.test(n) ? 'pdf' : /\.xlsx?$/i.test(n) ? 'xls' : 'oth'}">${ordEsc((ordExt(n) || 'file').slice(0, 4).toUpperCase())}</span><span class="ord-an">${ordEsc(n)}</span></span>`).join('');
  return `<div class="ord-gmm${open ? ' open' : ''}"><div class="ord-gmh" role="button" tabindex="0" onclick="this.parentNode.classList.toggle('open')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.parentNode.classList.toggle('open')}">` +
    `<span class="ord-av" style="background:hsl(${ordHue(from)} 42% 40%)">${ordEsc(from.charAt(0).toUpperCase())}</span>` +
    `<span class="ord-gmw"><span class="ord-gmf"><b>${ordEsc(from)}</b><i>${ordEsc(ORD_KINDNAME[d.kind] || d.kind)}</i></span><span class="ord-gmt">to ${ordEsc(to)}</span><span class="ord-gsn">${ordEsc(snip)}</span></span>` +
    `<span class="ord-gmd">${ordEsc(ordTime(d.at))}</span></div>` +
    `<div class="ord-gmb"><div class="ord-mb">${ordEsc(d.body || d.note || '')}</div><div class="ord-ma">${att}${ordGmailLink(d)}</div></div></div>`;
}
// An Amazon order opens on its own page in the Amazon.ae account (Kate, 20 Nov 2026: the account knows what the emails do not, e.g. delivered, return window closed, and Invoice 1 to 4 to download).
// Only a plain link: nothing is read from or written to the account, whoever opens it signs in to Amazon as usual.
// Carrefour (Kate, 23 Nov 2026, her screenshots of carrefouruae.com): an order opens at /mafuae/en/app/orders/<order number>/<consignment number>, for example 784010022791363/11000067445.
// The order number (15 digits from 784) and the consignment number are read from the order's own emails (reference, subject, note, text). With both the button opens that order;
// with only the order number it opens My Orders, where the number is searched by eye, because a link without the consignment number is not known to open the order.
function ordCarrefourNos(g) {
  const txt = g.docs.map(d => [d.reference, d.subject, d.note, d.body].filter(Boolean).join(' ')).join(' ');
  const ord = (/\b(784\d{12})\b/.exec([g.r, txt].join(' ')) || [])[1] || '';
  let con = (/consignment(?:\s*(?:number|no\.?|#))?\s*[:#-]?\s*(\d{6,12})/i.exec(txt) || [])[1] || '';
  if (!con && g.r && /^\d{6,12}$/.test(g.r) && g.r !== ord) con = g.r;
  return { ord, con };
}
function ordAmazonLink(g) {
  if (/^carrefour/i.test(g.s || '')) {
    const n = ordCarrefourNos(g); if (!n.ord) return '';
    const url = 'https://www.carrefouruae.com/mafuae/en/app/orders/' + n.ord + (n.con ? '/' + n.con : '');   // the order number alone is tried when no email names the consignment number
    return `<p class="ord-amz"><a class="ord-ac ord-gml" href="${url}" target="_blank" rel="noopener" title="Opens this order in the Carrefour account: delivery, payment and the invoice"><span class="ord-ai ord-ai-oth">CRF</span><span class="ord-an">Open this order in the Carrefour account</span><span class="ord-ak">Carrefour ${n.ord}</span></a></p>`;
  }
  const no = /^amazon/i.test(g.s || '') && /^\d{3}-\d{7}-\d{7}$/.test(g.r || '') ? g.r : '';
  if (!no) return '';
  return `<p class="ord-amz"><a class="ord-ac ord-gml" href="https://www.amazon.ae/gp/your-account/order-details?orderID=${no}" target="_blank" rel="noopener" title="Opens this order in the Amazon.ae account: delivery, payment and the invoices"><span class="ord-ai ord-ai-oth">AMZ</span><span class="ord-an">Open this order in the Amazon account</span><span class="ord-ak">Amazon.ae</span></a></p>`;
}
// ── CHECKED IN THE ACCOUNT (Kate, 20 Nov 2026) ───────────────────────────────────────
// An order that needs a look only because the mailbox is silent can be cleared by whoever checked it in the supplier's account: a note (for example the card that paid it) and
// proof: as many screenshots as needed, PASTED with Ctrl+V, plus PDFs (Choose a PDF, or drop it on the box). Saved in order_checks (orders_check_set), the files in the private bucket
// order-proofs. The note and every file are also kept as a DRAFT the moment they are typed or added (orders_draft_set), so closing the window before Mark as checked loses nothing.
// The tick can be undone.
const ordChkTxt = c => String((c && c.note) || '').replace(/^\[cancelled\]\s*/, '');
const ordSafeKey = s => String(s).replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 80);
const ORD_PROOF_MAX = 10, ORD_PROOF_BYTES = 10 * 1024 * 1024;
let ordUp = 0;
const ordIsPdf = n => /\.pdf$/i.test(String(n || ''));
function ordCheckHtml(g) {
  const k = ordEsc(g.key), c = g.chk;
  if (c) {
    ordProofs = [];
    const ps = Array.isArray(c.proofs) ? c.proofs : [];
    return `<div class="ord-chk done" id="ordChk"><div class="ord-chk-h"><b>${g.canc ? 'Marked as cancelled' : 'Checked in the account'}</b> by ${ordEsc(c.by || '')} on ${ordEsc(ordDay(String(c.at || '').slice(0, 10)))}</div>${ordChkTxt(c) ? `<p class="ord-chk-n">${ordEsc(ordChkTxt(c))}</p>` : ''}` +
      `<div class="ord-chk-b">${ps.map((p, i) => `<button type="button" class="cm-pill" data-p="${ordEsc(p.path)}" data-n="${ordEsc(p.name || '')}" onclick="ordProofView(this)">${ordIsPdf(p.name || p.path) ? ordEsc(p.name || 'PDF') : 'Screenshot ' + (i + 1)}</button>`).join('')}<button type="button" class="cm-pill" data-k="${k}" onclick="ordCheckUndo(this.dataset.k)">Undo</button></div><div id="ordChkShow"></div></div>`;
  }
  const d = ordDrafts[g.key] || {};
  ordProofs = g.x ? (Array.isArray(d.proofs) ? d.proofs : []).map(p => ({ path: p.path, name: p.name || '', url: '' })) : [];
  if (!g.x) return g.type === 'Order' && g.st !== 'Cancelled' ? `<div class="ord-chk" id="ordChk"><div class="ord-chk-b"><button type="button" class="cm-pill" data-k="${k}" onclick="ordCancelSave(this.dataset.k)">Mark as cancelled</button><span class="ord-muted" id="ordChkMsg">Cancelled in the supplier's account? Mark it here.</span></div></div>` : '';
  return `<div class="ord-chk" id="ordChk"><div class="ord-chk-h"><b>Checked it in the account?</b> Clear this order here.</div>` +
    `<textarea id="ordChkNote" rows="2" maxlength="500" data-k="${k}" oninput="ordDraftTyped(this.dataset.k)" placeholder="Note, for example: paid with the Mastercard ending 2600, arrived 14 Jan">${ordEsc(d.note || '')}</textarea>` +
    `<div class="ord-paste" id="ordChkPaste" tabindex="0">Copy a screenshot, then press Ctrl+V anywhere in this window. Paste as many as you need. To add a PDF, drop it here or <button type="button" class="ord-lk" onclick="document.getElementById('ordChkFile').click()">choose a PDF</button>. Everything is kept as you add it.</div>` +
    `<input type="file" id="ordChkFile" accept="application/pdf,image/png,image/jpeg,image/webp" multiple hidden onchange="ordAddProofs(this.files);this.value=''"><div id="ordChkPrev" class="ord-prevs"></div>` +
    `<div class="ord-chk-b"><button type="button" class="cm-pill" id="ordChkGo" data-k="${k}" onclick="ordCheckSave(this.dataset.k)">Mark as checked</button><button type="button" class="cm-pill" data-k="${k}" onclick="ordCancelSave(this.dataset.k)" title="The order was cancelled in the supplier's account: it is closed, nothing is owed">Mark as cancelled</button><span class="ord-muted" id="ordChkMsg"></span></div></div>`;
}
function ordProofsPaint() {
  const prev = document.getElementById('ordChkPrev'); if (!prev) return;
  prev.innerHTML = ordProofs.map((p, i) => `<span class="ord-pv">${p.url ? `<img class="ord-prev" src="${p.url}" alt="Screenshot ${i + 1}">` : `<span class="ord-pdfchip">${ordIsPdf(p.name) ? 'PDF ' + ordEsc(p.name) : 'Screenshot ' + (i + 1)}</span>`}<button type="button" class="ord-pvx" title="Remove" aria-label="Remove" onclick="ordProofDrop(${i})">×</button></span>`).join('');
}
// a kept screenshot from the draft has no picture on this computer yet: fetch each one so it can be seen and removed
function ordProofsInit() {
  ordProofsPaint();
  ordProofs.forEach(async p => {
    if (p.url || ordIsPdf(p.name || p.path)) return;
    try { const r = await sb.storage.from('order-proofs').download(p.path); if (r.error || !r.data) return; p.url = URL.createObjectURL(r.data); ordProofsPaint(); } catch (e) { /* the chip stays */ }
  });
}
async function ordProofDrop(i) {
  const p = ordProofs[i], ta = document.getElementById('ordChkNote'); if (!p || !ta) return;
  ordProofs.splice(i, 1); ordProofsPaint();
  if (p.url) { try { URL.revokeObjectURL(p.url); } catch (e) { /* harmless */ } }
  try { await sb.storage.from('order-proofs').remove([p.path]); } catch (e) { /* the file is only unlinked then */ }
  ordDraftSave(ta.dataset.k, true);
}
async function ordAddProofs(files) {
  const ta = document.getElementById('ordChkNote'), msg = document.getElementById('ordChkMsg'); if (!ta) return;
  const key = ta.dataset.k, added = []; let bad = '';
  const list = Array.prototype.slice.call(files || []);
  for (const f of list) {
    const img = /^image\/(png|jpeg|webp)$/.test(f.type), pdf = f.type === 'application/pdf';
    if (!img && !pdf) { bad = 'Only a screenshot (PNG, JPG, WebP) or a PDF can be added.'; continue; }
    if (f.size > ORD_PROOF_BYTES) { bad = 'A file is over 10 MB.'; continue; }
    if (ordProofs.length >= ORD_PROOF_MAX) { bad = 'That is the most you can add (10).'; continue; }
    const name = f.name && f.name !== 'image.png' ? f.name : (img ? 'screenshot-' + (ordProofs.length + 1) + '.' + (f.type.split('/')[1] || 'png').replace('jpeg', 'jpg') : 'file.pdf');
    const path = `checks/${ordSafeKey(key)}/${Date.now()}-${ordProofs.length + 1}-${ordSafeKey(name)}`;
    const item = { path, name, url: img ? URL.createObjectURL(f) : '' };
    ordProofs.push(item); ordProofsPaint(); ordUp++;
    if (msg) msg.textContent = 'Saving ' + name + '...';
    try {
      const up = await sb.storage.from('order-proofs').upload(path, f, { contentType: f.type, upsert: false });
      if (up.error) throw up.error;
      added.push(item);
    } catch (e) {
      console.error(e); ordProofs.splice(ordProofs.indexOf(item), 1); ordProofsPaint(); bad = 'A file did not save. Try again.';
    }
    ordUp--;
  }
  if (document.getElementById('ordChkNote') === ta) { await ordDraftSave(key, true); const m2 = document.getElementById('ordChkMsg'); if (m2) m2.textContent = bad || 'Saved.'; }
  else if (added.length && !ordChecks[key]) {
    // the window was closed while the files went up: add them to the draft that is already kept
    const had = ordDrafts[key] || {}, proofs = (had.proofs || []).concat(added.map(p => ({ path: p.path, name: p.name }))), note = ta.value.trim() || had.note || '';
    try { const r = await sb.rpc('orders_draft_set', { p_group: key, p_note: note, p_proofs: proofs }); if (!r.error) ordDrafts[key] = { note, proofs, by: '', at: new Date().toISOString() }; } catch (e) { console.error(e); }
  }
}
// one listener for the page: images and PDFs on the clipboard go to the open Checked box, anything else pastes as normal; a file dropped on the box is added too
document.addEventListener('paste', e => {
  if (!document.getElementById('ordChkPaste')) return;
  const fs = Array.prototype.filter.call((e.clipboardData && e.clipboardData.items) || [], x => x.kind === 'file' && /^(image\/|application\/pdf)/.test(x.type)).map(x => x.getAsFile()).filter(Boolean);
  if (!fs.length) return;
  e.preventDefault();
  ordAddProofs(fs);
});
document.addEventListener('dragover', e => { if (e.target && e.target.closest && e.target.closest('#ordChkPaste')) { e.preventDefault(); e.target.closest('#ordChkPaste').classList.add('over'); } });
document.addEventListener('dragleave', e => { const b = e.target && e.target.closest && e.target.closest('#ordChkPaste'); if (b) b.classList.remove('over'); });
document.addEventListener('drop', e => {
  const b = e.target && e.target.closest && e.target.closest('#ordChkPaste'); if (!b) return;
  e.preventDefault(); b.classList.remove('over'); ordAddProofs(e.dataTransfer && e.dataTransfer.files);
});
// The note is kept as you type: a moment after the last key, again after every file added or removed, and when the window closes. A draft is shared with whoever opens the order;
// marking the order as checked turns it into the tick's note and files and removes the draft.
function ordDraftTyped(key) { clearTimeout(ordDraftTimer); ordDraftTimer = setTimeout(() => ordDraftSave(key), 700); }
async function ordDraftSave(key, force) {
  const ta = document.getElementById('ordChkNote'); if (!ta || ta.dataset.k !== key || ordChecks[key]) return;
  const note = ta.value.trim(), proofs = ordProofs.map(p => ({ path: p.path, name: p.name }));
  const had = ordDrafts[key] || {};
  if (!force && note === (had.note || '') && JSON.stringify(proofs) === JSON.stringify(had.proofs || [])) return;
  const msg = document.getElementById('ordChkMsg');
  try {
    const r = await sb.rpc('orders_draft_set', { p_group: key, p_note: note, p_proofs: proofs });
    if (r.error) throw r.error;
    if (note || proofs.length) ordDrafts[key] = { note, proofs, by: '', at: new Date().toISOString() }; else delete ordDrafts[key];
    if (msg && !/^Saving/.test(msg.textContent)) msg.textContent = note || proofs.length ? 'Draft saved.' : '';
  } catch (e) { console.error(e); if (msg) msg.textContent = 'The draft did not save. Keep this window open, or copy your note.'; }
}
function ordDraftFlush() {
  const ta = document.getElementById('ordChkNote'); if (!ta) return;
  clearTimeout(ordDraftTimer); ordDraftSave(ta.dataset.k);
}
async function ordCheckSave(key) {
  const note = ((document.getElementById('ordChkNote') || {}).value || '').trim(), msg = document.getElementById('ordChkMsg'), go = document.getElementById('ordChkGo');
  if (ordUp) { if (msg) msg.textContent = 'A file is still saving. One moment.'; return; }
  if (!note && !ordProofs.length) { if (msg) msg.textContent = 'Type a note or add a screenshot or PDF first.'; return; }
  if (go) go.disabled = true; if (msg) msg.textContent = 'Saving...';
  try {
    const proofs = ordProofs.map(p => ({ path: p.path, name: p.name }));
    const r = await sb.rpc('orders_check_set', { p_group: key, p_on: true, p_note: note || null, p_proofs: proofs });
    if (r.error) throw r.error;
    ordChecks[key] = { by: (r.data && r.data.by) || '', at: new Date().toISOString(), note: note || null, proofs };
    delete ordDrafts[key]; clearTimeout(ordDraftTimer);
    ordAfterCheck(key);
  } catch (e) {
    console.error(e);
    if (go) go.disabled = false; if (msg) msg.textContent = 'It did not save. Try again, or tell Kate.';
  }
}
async function ordCancelSave(key) {
  const ta = document.getElementById('ordChkNote'), msg = document.getElementById('ordChkMsg');
  if (ordUp) { if (msg) msg.textContent = 'A file is still saving. One moment.'; return; }
  const note = ta ? ta.value.trim() : '', note2 = ('[cancelled] ' + note).trim();
  document.querySelectorAll('#ordChk button').forEach(b => { b.disabled = true; }); if (msg) msg.textContent = 'Saving...';
  try {
    const proofs = ordProofs.map(p => ({ path: p.path, name: p.name }));
    const r = await sb.rpc('orders_check_set', { p_group: key, p_on: true, p_note: note2, p_proofs: proofs });
    if (r.error) throw r.error;
    ordChecks[key] = { by: (r.data && r.data.by) || '', at: new Date().toISOString(), note: note2, proofs };
    delete ordDrafts[key]; clearTimeout(ordDraftTimer);
    ordAfterCheck(key);
  } catch (e) {
    console.error(e);
    document.querySelectorAll('#ordChk button').forEach(b => { b.disabled = false; }); if (msg) msg.textContent = 'It did not save. Try again, or tell Kate.';
  }
}
async function ordCheckUndo(key) {
  try {
    const r = await sb.rpc('orders_check_set', { p_group: key, p_on: false });
    if (r.error) throw r.error;
    delete ordChecks[key];
    ordAfterCheck(key);
  } catch (e) { console.error(e); const b = document.querySelector('#ordChk .ord-chk-b'); if (b) b.insertAdjacentHTML('beforeend', '<span class="ord-muted"> It did not undo. Try again.</span>'); }
}
async function ordProofView(btn) {
  const out = document.getElementById('ordChkShow'); if (!out) return;
  if (out.dataset.p === btn.dataset.p && out.firstChild) { out.innerHTML = ''; out.dataset.p = ''; return; }
  out.dataset.p = btn.dataset.p; out.innerHTML = '<p class="ord-muted">Opening...</p>';
  try {
    const r = await sb.storage.from('order-proofs').download(btn.dataset.p);
    if (r.error || !r.data) throw r.error || new Error('no file');
    const u = URL.createObjectURL(r.data);
    out.innerHTML = /pdf/i.test(r.data.type) ? `<p><a href="${u}" target="_blank" rel="noopener">Open ${ordEsc(btn.dataset.n || 'the PDF')}</a></p>` : `<img class="ord-prev ord-prev-big" src="${u}" alt="The screenshot kept as proof">`;
  } catch (e) { console.error(e); out.innerHTML = '<p class="ord-muted">That file did not open. Try again.</p>'; }
}
// the tick changes which orders need a look: rebuild, redraw every table where it is (same page of each) and open the order again
function ordAfterCheck(key) {
  ordBuild(ordRows);
  ordPaintAnswer(); ordPaintNotes(); [ordTL, ordTS, ordT].forEach(T => { if (T) T.draw(); });
  ordClose(); ordOpen(key, true);
}
// Every email can be opened as the real thing in the info@ mailbox (Kate, 20 Nov 2026: "i must be able to view this on the email"). The page keeps a short text of each email
// (and, for an Amazon order mail, the items it lists), so the original, with its pictures and every line, is one click away. Needs Kate or whoever is signed in to info@ in Google.
function ordGmailLink(d) {
  const id = String(d.thread || String(d.key || '').replace(/^info:/, '').split(':')[0] || '').replace(/[^0-9a-f]/gi, '');
  if (!id) return '';
  return `<a class="ord-ac ord-gml" href="https://mail.google.com/mail/?authuser=info%40tararosesalon.com#all/${id}" target="_blank" rel="noopener" title="Opens this email in the info mailbox in Gmail"><span class="ord-ai ord-ai-oth">MAIL</span><span class="ord-an">Open the original email</span><span class="ord-ak">Gmail</span></a>`;
}
function ordThreadHtml(g) {
  const subj = (g.docs.find(d => d.subject) || {}).subject || '';
  return `<div class="ord-gm"><div class="ord-gms"><span>${ordEsc(subj || 'The emails')}</span><em>${g.docs.length}</em></div>${g.docs.map((d, i) => ordMsgHtml(d, i === g.docs.length - 1)).join('')}</div>`;
}
// the other Excel forms of an order email sit in order-files/<folder>/extra/ (orders-file-upload, x-part extra): list them under the main file
async function ordLoadExtras(m) {
  const spans = [...m.querySelectorAll('.ord-xtra[data-pre]')].filter(s => s.dataset.pre);
  for (const s of spans) {
    try {
      const r = await sb.storage.from('order-files').list(s.dataset.pre + '/extra', { limit: 20, sortBy: { column: 'name', order: 'asc' } });
      if (!document.body.contains(s)) return;
      s.innerHTML = (r.data || []).filter(x => x && x.name && /\.(xlsx?|pdf)$/i.test(x.name)).map(x => ordAttCard(s.dataset.pre + '/extra/' + x.name, ordPretty(x.name))).join('');
    } catch (e) { console.error(e); }
  }
}
// A phone cannot be trusted to draw a PDF inside a page (Android Chrome downloads it, iPhone Safari shows page 1 only): there the Download button comes first and "Show it here" is the choice.
const ordPdfInline = () => navigator.pdfViewerEnabled !== false && !(window.matchMedia('(max-width:760px)').matches && window.matchMedia('(pointer:coarse)').matches);
function ordPdfHtml(name, url) {
  return `<div class="ord-pbar"><span class="ord-pn">${ordEsc(name)}</span><a class="cm-pill" href="${url}" download="${ordEsc(name)}">Download</a></div>` +
    (ordPdfInline() ? `<iframe class="ord-vframe" title="${ordEsc(name)}" src="${url}#navpanes=0&view=FitH"></iframe>`
      : `<div class="ord-vcard"><p>This PDF may not show well on a phone.</p><p class="ord-muted">Download it, or try showing it here.</p><button type="button" class="cm-pill" onclick="ordShowInline(this)">Show it here</button></div>`);
}
function ordShowInline(btn) {
  const box = btn.closest('#ordPanePdf'), a = box && box.querySelector('.ord-pbar a'); if (!box || !a) return;
  btn.closest('.ord-vcard').outerHTML = `<iframe class="ord-vframe" title="PDF" src="${a.getAttribute('href')}#navpanes=0&view=FitH"></iframe>`;
}
// the left column: switch between the PDF and What was bought
function ordPane(which) {
  const p = document.getElementById('ordPanePdf'), b = document.getElementById('ordPaneBuy'); if (!p || !b) return;
  p.hidden = which !== 'pdf'; b.hidden = which !== 'buy';
  document.querySelectorAll('#ordSeg button').forEach(x => x.classList.toggle('on', x.dataset.w === which));
}
async function ordLoadPdf(path, name) {
  const box = document.getElementById('ordPanePdf'); if (!box) return;
  ordPane('pdf');
  document.querySelectorAll('#ordPdfPick button').forEach(x => x.classList.toggle('on', x.dataset.p === path));
  box.innerHTML = `<p class="ord-muted ord-vload">Opening ${ordEsc(name)}...</p>`;
  try {
    const r = await sb.storage.from('order-files').download(path);
    if (r.error || !r.data) throw r.error || new Error('no file');
    if (!document.getElementById('ordPanePdf')) return;   // the window was closed meanwhile
    if (ordBlobUrl) { try { URL.revokeObjectURL(ordBlobUrl); } catch (e) { /* harmless */ } }
    ordBlobUrl = URL.createObjectURL(new Blob([r.data], { type: 'application/pdf' }));
    box.innerHTML = ordPdfHtml(name, ordBlobUrl);
  } catch (e) { console.error(e); box.innerHTML = '<p class="ord-muted">That PDF did not open. Try again, or ask Kate.</p>'; }
}
// a click on an attachment card: a PDF goes to the left column, an Excel form downloads under its own name
async function ordFile(b) {
  const path = b.dataset.p, name = b.dataset.n || ordPretty(String(path).split('/').pop()), ext = ordExt(name) || ordExt(path);
  if (ext === 'pdf') {
    await ordLoadPdf(path, name);
    const a = document.getElementById('ordPanePdf'); if (a && a.scrollIntoView) a.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return;
  }
  if (b.disabled) return;
  b.disabled = true;
  try {
    const r = await sb.storage.from('order-files').download(path);
    if (r.error || !r.data) throw r.error || new Error('no file');
    const u = URL.createObjectURL(new Blob([r.data], { type: ORD_FTYPE[ext] || 'application/octet-stream' }));
    const a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => { try { URL.revokeObjectURL(u); } catch (e) { /* harmless */ } }, 5000);
    if (typeof lgxToast === 'function') lgxToast('Downloaded ' + name + '. Open it in Excel.');
  } catch (e) { console.error(e); if (typeof lgxToast === 'function') lgxToast('That file did not open. Try again, or ask Kate.', true); }
  finally { b.disabled = false; }
}
function ordOpen(key, keepNav) {
  const g = ordByKey[key]; if (!g) return;
  if (keepNav !== true) ordNavList = ordNavFrom(ordLastEl);
  ordClose();
  ordCur = g;
  // Kate, 19 Nov 2026: Back to the list it came from, then XLSX, CSV, Close (the buttons of every site window). Back shows only when a list window is open underneath.
  const under = document.querySelector('.dr-modal'), back = !!under, backTxt = under ? ((under.querySelector('h3') || {}).textContent || 'the list') : '';
  const pdfs = g.docs.filter(ordKindPdf), hasBuy = !!(g.buy || g.oos.length || g.discPct);
  // the PDF to show first: the latest invoice, else the latest PDF
  const first = pdfs.filter(d => d.kind === 'invoice').pop() || pdfs[pdfs.length - 1];
  let left;
  if (pdfs.length) {
    left = (hasBuy ? `<div class="ord-seg" id="ordSeg"><button type="button" class="on" data-w="pdf" onclick="ordPane('pdf')">PDF</button><button type="button" data-w="buy" onclick="ordPane('buy')">What was bought</button></div>` : '') +
      (pdfs.length > 1 ? `<div class="ord-seg" id="ordPdfPick">${pdfs.map(d => `<button type="button" class="${d === first ? 'on' : ''}" data-p="${ordEsc(d.file_path)}" data-n="${ordEsc(d.file_name || '')}" onclick="ordLoadPdf(this.dataset.p,this.dataset.n||ordPretty(this.dataset.p.split('/').pop()))">${ordEsc((ORD_KINDNAME[d.kind] || d.kind) + ', ' + ordDay(d.date))}</button>`).join('')}</div>` : '') +
      `<div id="ordPanePdf" class="ord-pane"></div><div id="ordPaneBuy" class="ord-pane" hidden>${ordBuyHtml(g)}</div>`;
  } else left = ordBuyHtml(g);
  const m = document.createElement('div');
  m.className = 'ord-modal'; m.id = 'ordModal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-label', 'Order');
  m.innerHTML = `<div class="ord-dlg ord-wide"><div class="ord-top"><div><h3>${ordEsc(g.s + (g.r ? ' ' + g.r : '') + ' · ' + g.type)}</h3><div class="ord-sub">${ordEsc(ordName(g.b))} · started ${ordDay(g.start)} · ${g.docs.length} email${g.docs.length === 1 ? '' : 's'} tracked as one</div></div><div class="ord-hb">${ordNavHtml(g)}${back ? `<button type="button" class="cm-pill ord-back" onclick="ordClose()" title="Back to ${ordEsc(backTxt)}" aria-label="Back to ${ordEsc(backTxt)}">‹ Back<span class="ord-bk-l"> to ${ordEsc(backTxt)}</span></button>` : ''}${typeof rexButtons === 'function' ? rexButtons('ordExportOne') : ''}<button type="button" class="cm-pill" onclick="ordClose()">Close</button></div></div>
    <div class="ord-dbody">${g.x ? `<p class="ord-st ord-look ord-xline">${ordEsc(g.x)}</p>` : ''}${ordStepsHtml(g)}${ordAmazonLink(g)}${ordCheckHtml(g)}<div class="ord-cols"><section class="ord-cola" aria-label="${pdfs.length ? 'The PDF' : 'What was bought'}">${left}</section><section class="ord-colb" aria-label="The emails">${ordThreadHtml(g)}</section></div><p class="ord-last">This is the last step: a single order line has nothing behind it.</p></div></div>`;
  m.addEventListener('click', e => { if (e.target === m) ordClose(); });
  document.body.appendChild(m);
  const c = m.querySelector('button'); if (c) c.focus();
  ordLoadExtras(m); ordProofsInit();
  if (first) ordLoadPdf(first.file_path, first.file_name || ordPretty(String(first.file_path).split('/').pop()));
}
function ordClose() {
  ordDraftFlush();
  const m = document.getElementById('ordModal'); if (m) m.remove();
  ordCur = null; ordProofs.forEach(x => { if (x.url) { try { URL.revokeObjectURL(x.url); } catch (e) { /* harmless */ } } }); ordProofs = [];
  if (ordBlobUrl) { const u = ordBlobUrl; ordBlobUrl = ''; setTimeout(() => { try { URL.revokeObjectURL(u); } catch (e) { /* harmless */ } }, 1000); }
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.getElementById('ordModal')) { e.stopPropagation(); ordClose(); } }, true);

// ── DOWNLOADS (report-export.js draws the XLSX and CSV buttons) ──────────────────────
const ordR2 = x => (x == null || !isFinite(x)) ? null : Math.round(x * 100) / 100;
async function ordExport() {
  const rows = ordT ? ordT.rows() : []; if (!rows.length) return null;
  const T = await ordEnglishNames(rows.flatMap(g => g.buy ? g.buy.lines.map(l => l.name) : []));
  const [a, b] = ordRange();
  const cols = [{ key: 'start', label: 'Started', fmt: 'text' }, { key: 'sup', label: 'Supplier', fmt: 'text' }, { key: 'sal', label: 'Salon', fmt: 'text' }, { key: 'type', label: 'Type', fmt: 'text' }, { key: 'ref', label: 'Reference', fmt: 'text' },
    { key: 'items', label: 'Items', fmt: 'num' }, { key: 'units', label: 'Units', fmt: 'num' }, { key: 'total', label: 'Total (AED)', fmt: 'aed' }, { key: 'disc', label: 'Discount (AED)', fmt: 'aed' }, { key: 'pct', label: 'Discount applied (%)', fmt: 'pct' }, { key: 'refund', label: 'Refund (AED)', fmt: 'aed' },
    { key: 'status', label: 'Status', fmt: 'text' }, { key: 'file', label: 'Receipt', fmt: 'text' }, { key: 'look', label: 'Needs a look', fmt: 'text' }];
  const lines = rows.map(g => ({ cells: [ordDay(g.start), g.s, ordName(g.b), g.type, g.r, g.items, g.units, ordR2(g.a), g.disc ? ordR2(g.disc) : null, g.discPct || null, g.refund ? ordR2(g.refund) : null, g.st, g.f, g.x] }));
  const items = []; rows.forEach(g => { if (g.buy) g.buy.lines.forEach(l => items.push({ cells: [ordDay(g.start), g.s, g.r, T.en(l.name), ordR2(+l.qty), ordR2(+l.unit), ordR2(+l.total), l.note || ''].concat(T.any ? [T.en(l.name) !== l.name ? l.name : ''] : []) })); });
  const sheets = [{ name: 'Orders', title: 'Orders and Receipts', subtitle: `${ordScopeText()} · ${a} to ${b}. One row per order. Amounts only where the supplier email shows them.`, blocks: [{ cols, rows: lines }],
    legend: [['Total', 'The order total from the email. An invoice with no amount in the email text shows a dash.'], ['Discount', 'The AED the supplier took off, or the percentage applied when the email only says that.']] }];
  if (items.length) sheets.push({ name: 'Items', title: 'What was bought', subtitle: `${ordScopeText()} · ${a} to ${b}` + (T.failed ? `. ${T.failed} product name${T.failed === 1 ? '' : 's'} could not be translated this time and stay as the supplier wrote them.` : ''), blocks: [{ cols: [{ label: 'Started', fmt: 'text' }, { label: 'Supplier', fmt: 'text' }, { label: 'Reference', fmt: 'text' }, { label: 'Product', fmt: 'text' }, { label: 'Qty', fmt: 'num' }, { label: 'Price (AED)', fmt: 'aed' }, { label: 'Line total (AED)', fmt: 'aed' }, { label: 'Discount note', fmt: 'text' }].concat(T.any ? [{ label: 'As the supplier wrote it', fmt: 'text' }] : []), rows: items }] });
  return { name: ['orders-and-receipts', ordScopeText(), a, 'to', b].map(ordSlug).join('-'), csv: 0, sheets };
}
// One order, for the XLSX and CSV in its window: the summary, what was bought (with the discount and total), what was out of stock and every email. The CSV holds What was bought when
// there are lines, else the emails.
async function ordExportOne() {
  const g = ordCur; if (!g) return null;
  const T = await ordEnglishNames((g.buy ? g.buy.lines : []).concat(g.oos).map(l => l.name));
  const sheets = [], sub = g.s + (g.r ? ' ' + g.r : '') + ' · ' + g.type;
  const sum = [['Supplier', g.s], ['Reference', g.r || ''], ['Type', g.type], ['Salon', ordName(g.b)], ['Started', ordDay(g.start)], ['Status', g.st], ['Total (AED)', g.a == null ? '' : ordAed(g.a)],
    ['Discount', g.disc ? 'AED ' + ordAed(g.disc) : g.discPct ? g.discPct + '% applied' : 'none'], ['Needs a look', g.x || ''], ['Steps', ordStepsText(g)], ['Receipt', g.f]];
  sheets.push({ name: 'Order', title: sub, subtitle: ordName(g.b) + ' · started ' + ordDay(g.start), blocks: [{ cols: [{ label: 'Detail', fmt: 'text' }, { label: 'Value', fmt: 'text' }], rows: sum.map(r => ({ cells: r })) }] });
  let csv = 0;
  if (g.buy && g.buy.lines.length) {
    const L = g.buy.lines, rows = L.map(l => ({ cells: [T.en(l.name), l.qty == null ? null : ordR2(+l.qty), l.unit == null ? null : ordR2(+l.unit), l.total == null ? null : ordR2(+l.total), l.note || ''].concat(T.any ? [T.en(l.name) !== l.name ? l.name : ''] : []) }));
    rows.push({ cells: ['Total (' + L.length + ' lines)', ordR2(L.reduce((t, l) => t + (Number(l.qty) || 0), 0)), null, ordR2(L.reduce((t, l) => t + (Number(l.total) || 0), 0)), ''].concat(T.any ? [''] : []) });
    if (g.buy.disc) rows.push({ cells: ['Discount taken off', null, null, ordR2(-g.buy.disc), ''].concat(T.any ? [''] : []) });
    if (g.buy.deliv != null) rows.push({ cells: ['Delivery', null, null, ordR2(+g.buy.deliv), ''].concat(T.any ? [''] : []) });
    if (g.buy.total != null) rows.push({ cells: ['Order total', null, null, ordR2(+g.buy.total), ''].concat(T.any ? [''] : []) });
    csv = sheets.length;
    sheets.push({ name: 'What was bought', title: 'What was bought', subtitle: sub + (T.failed ? `. ${T.failed} product name${T.failed === 1 ? '' : 's'} could not be translated this time and stay as the supplier wrote them.` : ''), blocks: [{ cols: [{ label: 'Product', fmt: 'text' }, { label: 'Qty', fmt: 'num' }, { label: 'Price (AED)', fmt: 'aed' }, { label: 'Line total (AED)', fmt: 'aed' }, { label: 'Discount note', fmt: 'text' }].concat(T.any ? [{ label: 'As the supplier wrote it', fmt: 'text' }] : []), rows }] });
  }
  if (g.oos.length) sheets.push({ name: 'Out of stock', title: 'Ordered but not supplied', subtitle: sub, blocks: [{ cols: [{ label: 'Product', fmt: 'text' }, { label: 'Ordered', fmt: 'num' }, { label: 'Supplied', fmt: 'num' }], rows: g.oos.map(l => ({ cells: [T.en(l.name), Number(l.qty) || 0, 0] })) }] });
  if (!csv) csv = sheets.length;
  sheets.push({ name: 'The emails', title: 'The emails', subtitle: sub, blocks: [{ cols: [{ label: 'Received', fmt: 'text' }, { label: 'Step', fmt: 'text' }, { label: 'From', fmt: 'text' }, { label: 'To', fmt: 'text' }, { label: 'Subject', fmt: 'text' }, { label: 'The email', fmt: 'text' }, { label: 'File', fmt: 'text' }],
    rows: g.docs.map(d => { const ours = d.kind === 'order' || d.kind === 'reply'; return { cells: [ordTime(d.at), ORD_KINDNAME[d.kind] || d.kind, ours ? 'Tara Rose Salon' : d.supplier, ours ? d.supplier : 'Tara Rose Salon', d.subject || '', d.body || d.note || '', d.file_name || d.file_names || ''] }; }) }] });
  return { name: ['order', g.s, g.r || g.start].map(ordSlug).join('-'), csv, sheets };
}
function ordExportSup() {
  const rows = ordTS ? ordTS.rows() : []; if (!rows.length) return null;
  const [a, b] = ordRange();
  return { name: ['orders-by-supplier', ordScopeText(), a, 'to', b].map(ordSlug).join('-'), csv: 0, sheets: [{ name: 'By supplier', title: 'Orders by supplier', subtitle: `${ordScopeText()} · ${a} to ${b}`,
    blocks: [{ cols: [{ key: 's', label: 'Supplier', fmt: 'text' }, { key: 'n', label: 'Tracked', fmt: 'num' }, { key: 'o', label: 'Orders', fmt: 'num' }, { key: 'v', label: 'Invoices', fmt: 'num' }, { key: 'm', label: 'Invoiced (AED)', fmt: 'aed' }, { key: 'q', label: 'Discounts (AED)', fmt: 'aed' }, { key: 'l', label: 'Latest', fmt: 'text' }],
      rows: rows.map(r => ({ cells: [r.s, r.n, r.ord, r.inv, ordR2(r.amt), ordR2(r.disc), ordDay(r.last)] })) }] }] };
}
function ordExportLook() {
  const rows = ordTL ? ordTL.rows() : []; if (!rows.length) return null;
  const [a, b] = ordRange();
  return { name: ['orders-needs-a-look', ordScopeText(), a, 'to', b].map(ordSlug).join('-'), csv: 0, sheets: [{ name: 'Needs a look', title: 'Orders that need a look', subtitle: `${ordScopeText()} · ${a} to ${b}`,
    blocks: [{ cols: [{ key: 'd', label: 'Started', fmt: 'text' }, { key: 's', label: 'Supplier', fmt: 'text' }, { key: 'x', label: 'Why it needs a look', fmt: 'text' }, { key: 'k', label: 'Type', fmt: 'text' }, { key: 'b', label: 'Salon', fmt: 'text' }, { key: 'a', label: 'Total (AED)', fmt: 'aed' }],
      rows: rows.map(g => ({ cells: [ordDay(g.start), g.s, g.x, g.type, ordName(g.b), ordR2(g.a)] })) }] }] };
}
