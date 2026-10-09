/* PDFs for My 1-to-1 and Goals (Kate, 7 Oct 2026): the HR-10 and HR-09 layouts, made in the
   browser with pdfmake from the saved record (and its frozen numbers), so a signed copy is
   always the same document. Same lazy loader and static Inter / Playfair cuts as Team Home's
   PDFs (hub/kb-doc.js). Drafts carry a DRAFT watermark. */
(function () {
'use strict';
const C = { ink: '#2D2E37', soft: '#74747B', hair: '#E2DDD3', cream: '#F1ECE3', good: '#0F6E56', warn: '#BA7517', bad: '#A32D2D' };
const FONTS = ['Inter-Regular.ttf', 'Inter-SemiBold.ttf', 'Inter-Italic.ttf', 'Inter-SemiBoldItalic.ttf', 'PlayfairDisplay-Medium.ttf', 'PlayfairDisplay-MediumItalic.ttf'];
let ready = null, logo = null;

function b64(buf) {
  let s = '', a = new Uint8Array(buf);
  for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000));
  return btoa(s);
}
function load() {
  if (ready) return ready;
  ready = new Promise((res, rej) => {
    if (window.pdfMake) return res();
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.12/pdfmake.min.js';
    s.onload = res; s.onerror = () => { ready = null; rej(new Error('The PDF maker did not load. Check the connection and try again.')); };
    document.head.appendChild(s);
  }).then(() => Promise.all(FONTS.map(f => fetch('/assets/fonts/pdf/' + f).then(r => { if (!r.ok) throw new Error(f); return r.arrayBuffer(); }).then(b => [f, b64(b)]))
    .concat([fetch('/assets/email-logo.png').then(r => r.arrayBuffer()).then(b => ['__logo', 'data:image/png;base64,' + b64(b)])])))
  .then(files => {
    pdfMake.vfs = pdfMake.vfs || {};
    files.forEach(f => { if (f[0] === '__logo') logo = f[1]; else pdfMake.vfs[f[0]] = f[1]; });
    pdfMake.fonts = {
      Inter: { normal: 'Inter-Regular.ttf', bold: 'Inter-SemiBold.ttf', italics: 'Inter-Italic.ttf', bolditalics: 'Inter-SemiBoldItalic.ttf' },
      Playfair: { normal: 'PlayfairDisplay-Medium.ttf', bold: 'PlayfairDisplay-Medium.ttf', italics: 'PlayfairDisplay-MediumItalic.ttf', bolditalics: 'PlayfairDisplay-MediumItalic.ttf' }
    };
  }, e => { ready = null; throw e; });
  return ready;
}

const has = v => v != null && String(v).trim() !== '';
const t = v => has(v) ? String(v) : '·';
const stampY = ts => ts ? new Date(ts).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
const lab = s => ({ text: s.toUpperCase(), fontSize: 7, color: C.soft, characterSpacing: 0.7, margin: [0, 8, 0, 2] });
const val = s => has(s) ? { text: String(s), fontSize: 9.5, color: C.ink, lineHeight: 1.3 } : { text: 'Not filled in', fontSize: 8.5, italics: true, color: C.soft };
const field = (l, v) => ({ stack: [lab(l), val(v)] });
const sec = s => ({ text: s, font: 'Playfair', fontSize: 13, color: C.ink, margin: [0, 18, 0, 4] });
const small = s => ({ text: s, fontSize: 8.5, color: C.soft, margin: [0, 0, 0, 4] });
function table(head, rows, widths) {
  return { table: { headerRows: 1, widths, body: [head.map(h => ({ text: h.toUpperCase(), fontSize: 7, color: C.soft, characterSpacing: 0.6 })),
      ...(rows.length ? rows : [head.map(() => ({ text: ' ' }))]).map(r => r.map(c => (typeof c === 'object' && c !== null && !Array.isArray(c) ? c : { text: t(c), fontSize: 9, color: C.ink })))] },
    layout: { hLineColor: () => C.hair, vLineWidth: () => 0, hLineWidth: (i, n) => (i === 0 || i === 1 || i === n.table.body.length) ? 0.7 : 0.3, paddingTop: () => 5, paddingBottom: () => 5, paddingLeft: () => 4, paddingRight: () => 4 } };
}
function sigs(rec, staff, form) {
  const mgr = rec.signed_by || rec.manager || '';
  return { columns: [
    { width: '*', stack: [lab('Team member signature'), rec.staff_sig ? { image: rec.staff_sig, fit: [150, 56], margin: [0, 2, 0, 2] } : { text: ' ' }, { text: staff.name, font: 'Playfair', fontSize: 12, color: C.ink }, { text: rec.confirmed_at ? 'Acknowledged on screen, ' + stampY(rec.confirmed_at) : 'Awaiting acknowledgement', fontSize: 8, color: C.soft, margin: [0, 2, 0, 0] }] },
    { width: '*', stack: [lab('Manager signature'), rec.manager_sig ? { image: rec.manager_sig, fit: [150, 56], margin: [0, 2, 0, 2] } : { text: ' ' }, { text: mgr || '·', font: 'Playfair', fontSize: 12, color: C.ink }, { text: rec.signed_at ? 'Signed on screen, ' + stampY(rec.signed_at) : 'Not signed yet', fontSize: 8, color: C.soft, margin: [0, 2, 0, 0] }] }],
    columnGap: 24 };
}
function sigBlock(rec, staff, form) {
  const cols = sigs(rec, staff, form);
  return { stack: [cols, rec.staff_comment ? field('Team member comment', rec.staff_comment) : { text: '' }], margin: [0, 16, 0, 0], unbreakable: true };
}
function top(form, title, sub) {
  return [{ text: form, fontSize: 8, color: C.soft, characterSpacing: 1.4 },
    { text: title, font: 'Playfair', fontSize: 25, color: C.ink, margin: [0, 8, 0, 2] }, sub ? { text: sub, fontSize: 10, color: C.soft, margin: [0, 0, 0, 6] } : {}];
}
const frame = (form, ver, draft) => ({
  pageSize: 'A4', pageMargins: [40, 84, 40, 46], defaultStyle: { font: 'Inter', fontSize: 9.5, color: C.ink },
  // The logo, small and centred at the top of every page (Kate, 7 Oct 2026).
  header: { margin: [0, 20, 0, 0], stack: [logo ? { image: logo, width: 84, alignment: 'center' } : { text: 'TARA ROSE SALONS', alignment: 'center', fontSize: 9, characterSpacing: 2 }] },
  footer: (cur, total) => ({ columns: [{ text: 'Tara Rose Salons · Mamsha al Saadiyat · Khalifa City A · Motor City · Al Quoz', fontSize: 7, color: C.soft }, { text: `${form} · ${ver} · page ${cur} of ${total}`, alignment: 'right', fontSize: 7, color: C.soft }], margin: [40, 14, 40, 0] }),
  watermark: draft ? { text: 'DRAFT', color: '#999999', opacity: 0.12, bold: true, italics: false } : undefined
});
const grid3 = items => ({ columns: items.map(i => i[0] ? ({ width: '*', ...field(i[0], i[1]) }) : ({ width: '*', text: '' })), columnGap: 14, margin: [0, 0, 0, 2] });

// One signed 13-week check: what was said, the next priorities, and who signed it when.
function checkBlock(ch, staff, P) {
  const cc = ch.content || {}, pri = (cc.priorities || []).filter(a => has(a.action)).map(a => [a.action, a.led, a.support, P.dShort(a.due) || a.due]);
  const state = ch.status === 'filed' ? `Signed by ${ch.signed_by} on ${stampY(ch.signed_at)}. Acknowledged by ${staff.name} on ${stampY(ch.confirmed_at)}.`
    : ch.status === 'signed' ? `Signed by ${ch.signed_by} on ${stampY(ch.signed_at)}. Waiting for ${staff.name} to acknowledge.` : 'Draft, not signed.';
  const img = (src, who) => src ? { stack: [{ image: src, fit: [110, 40] }, { text: who, fontSize: 7, color: C.soft }] } : { text: '' };
  return { stack: [{ text: `Check on ${P.dMid(cc.meeting_date) || P.mLong(ch.period)}`, bold: true, fontSize: 10.5, margin: [0, 12, 0, 0] }, small(state),
    field('What progress has been made, and what have we learned?', cc.progress), field('What should change or be prioritised next?', cc.change),
    { text: 'AGREED PRIORITIES, NEXT 13 WEEKS', fontSize: 7, color: C.soft, characterSpacing: 0.7, margin: [0, 8, 0, 2] },
    table(['Action', 'Led by', 'Support needed', 'Due date'], pri, ['*', 70, '*', 70]),
    ch.staff_comment ? field('Team member comment', ch.staff_comment) : { text: '' },
    { columns: [img(ch.staff_sig, staff.name), img(ch.manager_sig, ch.signed_by || '')], columnGap: 16, margin: [0, 6, 0, 0] }], unbreakable: true };
}

// How long the review window is, in words (13 weeks, 4 weeks, 30 days), and as an adjective (13-week, 30-day).
function spanOf(snap) {
  if (!snap || !snap.from || !snap.to) return '13 weeks';
  const n = Math.round((new Date(snap.to + 'T00:00:00') - new Date(snap.from + 'T00:00:00')) / 864e5) + 1;
  return n % 7 === 0 ? `${n / 7} week${n === 7 ? '' : 's'}` : `${n} days`;
}
const spanAdj = snap => spanOf(snap).replace(/s$/, '').replace(' ', '-');

function monthly(rec, staff, P) {
  const c = rec.content || {}, snap = rec.snapshot || {}, mgr = rec.signed_by || rec.manager || '';
  const win = snap.from ? `${P.dShort(snap.from)} to ${P.dShort(snap.to)} ${new Date(snap.to + 'T00:00:00').getFullYear()}` : '';
  const prev = (c.prev_actions || []).filter(a => has(a.action)).map(a => [a.action, a.progress, a.status]);
  const numRows = P.NUM_ROWS.map(([k, l]) => { const r = P.numRow(snap, k); return [l, r.a, r.t || '·', (c.notes13 || {})[k]]; });
  const acts = (c.actions || []).filter(a => has(a.action)).map(a => [a.action, a.owner, P.dShort(a.due) || a.due, a.measure]);
  const cc = P.ckCounts(c);
  const body = [].concat(
    top('HR FORM · HR-10', 'One-to-One Meeting Form', 'With stylist priorities checklist'),
    sec('Details'),
    grid3([['Team member', staff.name], ['Role', staff.role], ['Branch', staff.branch]]),
    grid3([['Manager', mgr], ['Meeting date', P.dMid(c.meeting_date)], ['Review period', win]]),
    small(P.fillLine(rec, snap, c.meeting_date, rec.status === 'draft')),
    sec('01  Wins and highlights'), field('What has gone well since we last met: achievements, progress and kind words from clients or colleagues', c.wins),
    sec('02  Actions from our last meeting'), table(['Previous action', 'Progress and outcome', 'Status'], prev, ['*', '*', 70]),
    sec('03  Business revenue, ' + spanAdj(snap) + ' review'), small('Worked out from the stylist\'s own numbers' + (snap.off_days > 0 ? `, with aims adjusted for ${snap.off_days} days away.` : '.')),
    table(['Metric', spanAdj(snap) + ' actual', 'Target', 'Notes and trends'], numRows, [105, 115, 85, '*']),
    field('Performance notes', c.opportunities),
    sec('04  Social media / personal brand marketing notes'), val(c.social_grow),
    sec('05  Agreed actions'), table(['Action or next step', 'Owner', 'Due date', 'Success measure'], acts, ['*', 70, 70, '*']),
    field('Next meeting date', P.dMid(c.next_meeting)), sigBlock(rec, staff),
    { text: 'ONE-TO-ONE ATTACHMENT · HR-10', pageBreak: 'before', fontSize: 8, color: C.soft, characterSpacing: 1.4 },
    { text: 'Stylist Priorities Checklist', font: 'Playfair', fontSize: 22, color: C.ink, margin: [0, 6, 0, 6] },
    grid3([['Stylist', staff.name], ['Level', staff.role], ['Branch', staff.branch]]), grid3([['Date', P.dMid(c.meeting_date)], ['Consistently shown', `${cc.y} of ${cc.t}`], ['', '']]),
    small('Reviewed together. Ticked when consistently shown; the rest are the next focus.'),
    ...P.CHECK.map((g, i) => [sec(`0${i + 1}  ${g[0]}`), table(['Item', 'Shown'], g[1].map((x, j) => [x, (c.check && c.check[i] && c.check[i][j])
        ? { text: 'Consistently', fontSize: 8.5, color: C.good, bold: true } : { text: 'Next focus', fontSize: 8.5, color: C.soft }]), ['*', 70])]),
    sec('Our priorities for the next ' + spanOf(snap)), val(c.priorities), field('Training or management support that would help', c.support), sigBlock(rec, staff));
  return Object.assign(frame('HR-10', 'v1 · Oct 2026', rec.status === 'draft'), { content: body });
}

function goals(rec, staff, P) {
  const c = rec.content || {}, snap = rec.snapshot || {}, mgr = rec.signed_by || rec.manager || '';
  const pri = (c.priorities || []).filter(a => has(a.action)).map(a => [a.action, a.led, a.support, P.dShort(a.due) || a.due]);
  const mile = P.MILE.map(([k, l, how, w]) => { const v = (c.mile || {})[k] || {}; return [l, { text: P.nowOf(snap, k, how, w), fontSize: 9, bold: true }, v.m6, v.y1, v.y3]; });
  const fol = (c.follow || []).filter(f => has(f.progress) || has(f.change));
  const checks = (rec.checks || []).slice().sort((x, y) => String(x.period).localeCompare(String(y.period)));
  const body = [].concat(
    top('HR FORM · HR-09', 'Personal, Professional & Financial Goals', '6 months, 1 year, 3 years'),
    { text: 'A guided conversation about what matters to you and how Tara Rose Salons can support your growth. Set goals across three time horizons and review progress every 13 weeks. Share personal or financial details only as far as you feel comfortable.', fontSize: 9, color: C.soft, margin: [0, 4, 0, 4], lineHeight: 1.3 },
    sec('Details'),
    grid3([['Team member', staff.name], ['Role', staff.role], ['Branch', staff.branch]]),
    grid3([['Written by', staff.name], ['Submitted', P.dMid(rec.submitted_at)], ['Signed off by', mgr]]),
    small(P.fillLine(rec, snap, String(rec.submitted_at || '').slice(0, 10), rec.status === 'draft')),
    ...P.HZ.map(([h, hl]) => [sec(`Goals · ${hl}`), small('For every goal, talk through the reason behind it and what achieving it, or not, would mean.'),
      ...P.KINDS.map(([k, kl], n) => [{ text: `0${n + 1}  ${kl} goal`, bold: true, fontSize: 10.5, margin: [0, 8, 0, 0] }, ...P.QS.map(([qk, ql], qi) => field(`${qi + 1}. ${ql}`, ((c.goals || {})[h] || {})[k] && c.goals[h][k][qk]))])]),
    sec('Business performance · 13-week review'), small('Current figures are worked out from the stylist\'s own numbers. The milestones are the ones agreed together.'),
    table(['Measure', 'Current 13-week', '6 months', '1 year', '3 years'], mile, ['*', 80, 60, 60, 60]),
    ...(pri.length ? [sec('Our agreed priorities · next 13 weeks'), table(['Action', 'Led by', 'Support needed', 'Due date'], pri, ['*', 70, '*', 70])] : []),
    sec('13-week follow-up'),
    ...(fol.length ? fol.map(f => [field('Earlier note' + (has(f.date) ? ` (${P.dMid(f.date)})` : ''), f.progress), field('What should change or be prioritised next?', f.change)]) : []),
    ...(checks.length ? checks.map(ch => checkBlock(ch, staff, P)) : (fol.length ? [] : [small('No 13-week check has been signed yet. Each check is signed on its own.')])),
    sigBlock(rec, staff));
  return Object.assign(frame('HR-09', 'v1 · Oct 2026', rec.status === 'draft'), { content: body });
}

async function build(kind, rec, staff) {
  await load();
  const P = window.PerfO2O;
  return kind === 'monthly' ? monthly(rec, staff, P) : goals(rec, staff, P);
}
const attr = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// The window the PDF opens in: the PDF itself, with a Download button that keeps a proper file name.
const viewer = (name, url) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${attr(name)}</title>
<style>html,body{margin:0;height:100%;font-family:Inter,system-ui,sans-serif}body{display:flex;flex-direction:column;background:#2D2E37}
.bar{display:flex;gap:12px;align-items:center;justify-content:space-between;padding:10px 16px;background:#383944;color:#FAF8F3;font-size:14px}
.bar span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bar a{flex:none;background:#FFD4D9;color:#2D2E37;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:999px}
iframe{flex:1;border:0;width:100%;background:#fff}</style>
<div class="bar"><span>${attr(name)}</span><a href="${url}" download="${attr(name)}">Download PDF</a></div><iframe src="${url}" title="${attr(name)}"></iframe>`;
// win: a window opened on the click (so the pop-up blocker lets it); without one the file downloads.
async function make(kind, rec, staff, win) {
  const doc = await build(kind, rec, staff);
  const ym = String(rec.period || '').slice(0, kind === 'monthly' ? 7 : 4);
  const name = `Tara Rose ${kind === 'monthly' ? 'HR-10 One-to-One' : 'HR-09 Goals'} ${staff.name} ${ym}${rec.status === 'draft' ? ' DRAFT' : ''}.pdf`;
  return new Promise((res, rej) => {
    try {
      pdfMake.createPdf(doc).getBlob(blob => {
        const url = URL.createObjectURL(blob);
        if (win && !win.closed) { win.document.open(); win.document.write(viewer(name, url)); win.document.close(); }
        else { const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
        res();
      });
    } catch (e) { rej(e); }
  });
}
window.PerfO2OPdf = { make, build };
})();
