// What each supplier's PDF says, by rule and never by guess (Kate, 18 Nov 2026). Plain JavaScript so the same file is tested in Node and runs in the edge function.
// Every parser returns null when the PDF is not the layout it knows, and sets `lines` only when the lines add up to the invoice's own figures (within 5 fils):
// a missed line would otherwise put a wrong order on the page. The text comes from unpdf (one line per text row, Arabic in presentation forms, which is ignored).
//
// patch = { lines: [{ code, name, qty, unit, total, disc, note }], amount, subtotal, discount, delivery, vat }
//   amount   the invoice total as the supplier prints it, VAT included
//   subtotal the items after the discount, before VAT where the supplier says so (see each parser); discount the AED taken off; vat the VAT amount

const AR = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;
const num = (s) => { const v = parseFloat(String(s).replace(/,/g, '')); return Number.isFinite(v) ? v : null; };
const r2 = (x) => Math.round(x * 100) / 100;
const rows = (text) => String(text || '').split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
const NEAR = 0.05;

/** Carrefour "Tax Invoice" (FU-COM LLC): one block per item, then a row of nine figures. */
export function parseCarrefour(text) {
  if (!/Tax Invoice/.test(text) || !/Carrefour/i.test(text)) return null;
  const L = rows(text);
  const ROW = /^(\d+(?:\.\d+)?) (\d+(?:\.\d+)?) (\d+\.\d{2}) (\d+\.\d{2}) (\d+\.\d{2}) (\d+(?:\.\d+)?) (\d+\.\d{2}) (\d+\.\d{2}) (\d+\.\d{2})$/;
  const lines = [];
  let cur = [], code = '', bundle = 0, share = 0, drop = 0, total = null, vat = 0, saved = null;
  for (const l of L) {
    let m;
    if ((m = /^Total Amount Incl\. VAT.*AED\s*([\d,]+\.\d{2})\s*$/.exec(l))) { total = num(m[1]); continue; }
    if ((m = /^(\d+(?:\.\d+)?) ?% ([\d,]+\.\d{2}) ([\d,]+\.\d{2})$/.exec(l))) { vat += num(m[3]); continue; }
    if ((m = /^Total savings.*?([\d,]+\.\d{2})\s*$/.exec(l))) { saved = num(m[1]); continue; }
    if (/^Tot Price Incl/.test(l)) { cur = []; code = ''; bundle = 0; share = 0; drop = 1; continue; }
    if (drop) { drop = 0; if (l === 'VAT') continue; }
    if ((m = ROW.exec(l))) {
      const [, ord, del, unit, , , , , , tot] = m;
      const name = cur.join(' ').replace(/\s+/g, ' ').trim();
      const note = [];
      if (num(ord) !== num(del)) note.push('ordered ' + num(ord) + ', delivered ' + num(del));
      if (bundle) note.push('bundle discount AED ' + bundle.toFixed(2));
      if (share) note.push('share savings AED ' + share.toFixed(2));
      if (name) lines.push({ code, name, qty: num(del), unit: num(unit), total: num(tot), disc: r2(bundle + share), note: note.join(', ') });
      cur = []; code = ''; bundle = 0; share = 0; continue;
    }
    if (AR.test(l)) continue;
    if ((m = /^Barcode:\s*(\d+)/.exec(l))) { code = m[1]; continue; }
    if ((m = /^Bundle Discount:\s*([\d.]+)/.exec(l))) { bundle = num(m[1]); continue; }
    if ((m = /^Share Savings:\s*([\d.]+)/.exec(l))) { share = num(m[1]); continue; }
    if (/^Online Bundle/.test(l)) continue;
    cur.push(l);
  }
  if (total == null) return null;
  const sum = r2(lines.reduce((t, x) => t + (x.total || 0), 0));
  const ok = lines.length && Math.abs(sum - total) <= NEAR;
  // the savings are what Carrefour prints under "Your Savings": the price drops, bundle and Share card savings against the shelf price
  return { lines: ok ? lines : undefined, amount: total, discount: saved, vat: vat || null, subtotal: null, delivery: null, _check: { lines: lines.length, sum, total, ok: !!ok } };
}

/** BS Pro Brands (QuickBooks): description lines, then "qty rate VAT amount vat". */
export function parseBsPro(text) {
  if (!/Tax Invoice/i.test(text) || !/BS Pro/i.test(text)) return null;
  const L = rows(text);
  const ROW = /^(\d+(?:\.\d+)?) ([\d,]+\.\d{2}) (\S+) ([\d,]+\.\d{2}) ([\d,]+\.\d{2})$/;
  let on = false, cur = [], sub = null, vat = null, tot = null, disc = 0;
  const lines = [];
  for (const l of L) {
    let m;
    if (/^ACTIVITY DESCRIPTION QTY RATE/.test(l)) { on = true; cur = []; continue; }
    if (!on) continue;
    if ((m = /^SUBTOTAL ([\d,]+\.\d{2})/.exec(l))) { sub = num(m[1]); on = false; }
    if (m) continue;
    if ((m = /^(?:DISCOUNT|Discount)\b.*?-?([\d,]+\.\d{2})\s*$/.exec(l))) { disc += num(m[1]); continue; }
    if ((m = ROW.exec(l))) {
      lines.push({ code: '', name: cur.join(' ').replace(/\s+/g, ' ').trim(), qty: num(m[1]), unit: num(m[2]), total: num(m[4]), disc: 0, note: 'before VAT' });
      cur = []; continue;
    }
    cur.push(l);
  }
  for (const l of L) {
    let m;
    if ((m = /^VAT TOTAL ([\d,]+\.\d{2})/.exec(l))) vat = num(m[1]);
    else if ((m = /^TOTAL ([\d,]+\.\d{2})/.exec(l))) tot = num(m[1]);
    else if ((m = /^BALANCE DUE AED ([\d,]+\.\d{2})/.exec(l)) && tot == null) tot = num(m[1]);
  }
  if (tot == null) return null;
  const sum = r2(lines.reduce((t, x) => t + (x.total || 0), 0));
  const ok = lines.length && lines.every((x) => x.name) && sub != null && (Math.abs(sum - sub) <= NEAR || Math.abs(sum - disc - sub) <= NEAR);
  return { lines: ok ? lines : undefined, amount: tot, subtotal: sub, discount: disc || null, vat, delivery: null, _check: { lines: lines.length, sum, sub, ok: !!ok } };
}

/** DBD "TAX Invoice": item rows come out as "<unit price><qty><description> <line total><itemcode> <vat %> <vat>", with no spaces between the numbers; a long description wraps onto
 *  the next line, so the row is then the head "<unit price><qty><description start>", the rest of the description, and a tail "<line total><itemcode> <vat %> <vat>". */
export function parseDbd(text) {
  if (!/TAX Invoice/.test(text) || !/Itemcode Item Description/.test(text)) return null;
  const L = rows(text);
  const P = '(\\d{1,3}(?:,\\d{3})*\\.\\d{2})';
  const ROW = new RegExp('^' + P + '(\\d{1,3})(.+?) ' + P + '(\\d{7}) (\\d+) (\\d+\\.\\d{2})$');
  const HEAD = new RegExp('^' + P + '(\\d{1,3})([A-Za-z].*)$');
  const TAIL = new RegExp('^' + P + '(\\d{7}) (\\d+) (\\d+\\.\\d{2})$');
  const STOP = /^(VAT|F\d{9}|\d{9}$|PO |Page|Currency|Continued|\/|Being the Sum|System Generated|AED)/;
  const lines = [];
  let bad = 0, total = null, sub = null, disc = null, vat = null, net = null, pend = null;
  const add = (unit, qty, name, tot, code) => {
    if (Math.abs(unit * qty - tot) > NEAR) { bad++; return; }
    lines.push({ code, name: name.replace(/\s+/g, ' ').trim(), qty, unit, total: tot, disc: 0, note: 'before the account discount and VAT' });
  };
  for (const l of L) {
    let m;
    if (pend) {
      if ((m = TAIL.exec(l))) { add(pend.unit, pend.qty, pend.desc, num(m[1]), m[2]); pend = null; continue; }
      if (!STOP.test(l) && pend.n < 3) { pend.desc += ' ' + l; pend.n++; continue; }
      bad++; pend = null;
    }
    if ((m = ROW.exec(l))) { add(num(m[1]), num(m[2]), m[3], num(m[4]), m[5]); continue; }
    if ((m = /^AED\s*(\d{1,3}(?:,\d{3})*\.\d{2})(\d{1,3}(?:,\d{3})*\.\d{2}) (\d{1,3}(?:,\d{3})*\.\d{2})$/.exec(l))) { total = num(m[1]); sub = num(m[2]); disc = num(m[3]); continue; }
    if ((m = /^(\d{1,3}(?:,\d{3})*\.\d{2})(\d{1,3}(?:,\d{3})*\.\d{2})$/.exec(l))) { vat = num(m[1]); net = num(m[2]); continue; }
    if ((m = HEAD.exec(l))) pend = { unit: num(m[1]), qty: num(m[2]), desc: m[3], n: 0 };
  }
  if (total == null) return null;
  const sum = r2(lines.reduce((t, x) => t + x.total, 0));
  const ok = lines.length && !bad && sub != null && Math.abs(sum - sub) <= NEAR;
  // the items are shown before the account discount, so "subtotal" is what is left after it, before VAT: items - discount = net, net + VAT = total
  return { lines: ok ? lines : undefined, amount: total, subtotal: net, discount: disc, vat, delivery: null, _check: { lines: lines.length, bad, sum, sub, ok: !!ok } };
}

export function parseDoc(supplier, kind, text) {
  if (!text) return null;
  const s = String(supplier || '').toUpperCase();
  if (kind !== 'invoice') return null;
  if (s === 'CARREFOUR') return parseCarrefour(text);
  if (s === 'BS PRO') return parseBsPro(text);
  if (s === 'DBD') return parseDbd(text);
  return null;
}
