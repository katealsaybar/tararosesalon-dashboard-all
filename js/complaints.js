// Client Complaints (Kate, 22 Oct 2026): the historical map of client complaints, per branch, per year, by kind and by
// how each one was resolved. Built from the notes staff typed into Phorest (client card and visit notes), copied on
// 21 Oct 2026 for the Zenoti move, then read and sorted one by one. A snapshot, not live.
//
// Kate, 22 Oct 2026: Levels 2 and up may view it and log a complaint from it ("complaints view and complaints submission shall be
// available to level 2 and up"). The form saves through client_complaint_submit into the same table, so a logged complaint is counted
// like any other and shows a "Logged by staff" mark; the person who logged it (or Level 5) can remove it again.
// A logged complaint is tracked here instead of in WhatsApp (Kate, 22 Oct 2026): it starts Open unless it was resolved when logged, takes
// follow-up notes (who was spoken to, what was agreed) in client_complaint_update, and is marked Resolved with how it ended, or reopened.
// Calls (migrations/client_complaints.sql), all Levels 2 and up; the first two read only:
//   client_complaints_summary   everything on the page above the list: tiles, branch table, years, kinds, outcomes
//   client_complaints_list      a page of the complaints themselves, with the original note
// The table behind them is owner_read only and the functions refuse anyone under Level 2, because the dashboard's
// table policies check membership, not level. Nothing here is stored in the browser except the rows-per-page pick: no
// names or notes ever go into localStorage.
//
// Branch is the masthead's Branch chips (sel.branch), like every other page (Kate, 22 Oct 2026: "we must use global sticky
// header filter"); there is no Period, it is a snapshot. The page keeps only its own list filters, sort and page size.
// The summary and list take the branch as 'all', one code, or codes joined by commas.
// What it cannot show: complaints nobody wrote down, WhatsApp complaints, and Google reviews (that is its own page).
const CQ_STORE = 'trs-client-complaints';
const CQ = { src: 'visit', type: 'all', res: 'all', google: 'all', status: 'all', q: '', low: false, page: 0, size: 10, sort: 'date', dir: 'desc' };
const CQ_SIZES = [10, 20, 50, 100];
try {
  const st = JSON.parse(localStorage.getItem(CQ_STORE) || '{}');
  if (CQ_SIZES.includes(st.size)) CQ.size = st.size;
} catch (e) {}
const cqSave = () => { try { localStorage.setItem(CQ_STORE, JSON.stringify({ size: CQ.size })); } catch (e) {} };
let cqMode = 'main';   // 'main' = Client Complaints, 'log' = Log a Complaint (the logged ones, with the form)
const cqSrc = () => (cqMode === 'log' ? 'logged' : CQ.src);
let cqSum = null, cqList = null, cqSeqS = 0, cqSeqL = 0, cqTimer = 0, cqOpen = 0;
// The masthead's Branch pick as the functions want it. Dashboard code FRT (Fratelli) is FRA in the notes.
const cqBranch = () => {
  const b = (typeof sel !== 'undefined' && sel && Array.isArray(sel.branch)) ? sel.branch : ['all'];
  return (!b.length || b.includes('all')) ? 'all' : b.map(c => (c === 'FRT' ? 'FRA' : c)).join(',');
};
// The masthead's Period as the functions want it: both null for All time (the notes go back to 2016, the chip starts in 2021, and the undated
// client-card notes count only then); otherwise the window's first and last day.
const cqWin = () => {
  try {
    if (typeof activePeriodKey === 'function' && activePeriodKey() === 'All time') return { p_from: null, p_to: null };
    if (typeof dateFrom !== 'undefined' && dateFrom && dateTo) return { p_from: dateToIso(dateFrom), p_to: dateToIso(dateTo) };
  } catch (e) {}
  return { p_from: null, p_to: null };
};
const cqWindowed = () => { const w = cqWin(); return !!(w.p_from || w.p_to); };
let cqAllTimeDone = false;
const cqPicked = () => { const b = cqBranch(); return b === 'all' ? [] : b.split(','); };
const CQ_BRANCH = { SAA: 'Saadiyat', KCA: 'Khalifa City A', MC: 'Motor City', AQ: 'Al Quoz', MRY: 'Marasy', FRA: 'Fratelli', BAH: 'Bahrain' };
const CQ_COLOUR = { SAA: '#b4637a', KCA: '#3e7f8f', MC: '#c8923a', AQ: '#6f8f4e', MRY: '#8a7aa6', FRA: '#999', BAH: '#c06a3a' };
const CQ_TYPE = {
  colour_result: 'Colour result', nail_service: 'Nail service', treatment_result: 'Treatment result', cut_result: 'Cut result',
  price_or_billing: 'Price or billing', repeat_complainer: 'Repeat complainer', booking_or_admin: 'Booking or admin',
  wait_or_time: 'Wait or time', staff_attitude: 'Staff attitude', skin_reaction_or_injury: 'Skin reaction or injury',
  facility_or_parking: 'Facility or parking', product: 'Product', other: 'Other', unclear: 'Unclear'
};
const CQ_RES = {
  free_redo: 'Free redo', refund: 'Refund', discount_or_credit: 'Discount or credit', free_service_or_product: 'Free service or product',
  adjusted_same_visit: 'Fixed during the visit', apology_or_explanation: 'Talked through', escalated_followup: 'Escalated, follow-up',
  client_lost_or_cancelled: 'Client cancelled or left', no_action_noted: 'No outcome written', unclear: 'Unclear', open: 'Still open'
};

const cqEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cqNum = n => Number(n || 0).toLocaleString('en-GB');
const cqPct = (n, t) => t ? Math.round(100 * n / t) + '%' : '0%';
const cqText = s => cqEsc(s).replace(/\r?\n/g, '<br>');
const cqDay = iso => {
  if (!iso) return 'Client card';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
};
const cqBr = c => CQ_BRANCH[c] || c || 'Not matched';

// The archive (Kate, 12 Nov 2026): every complaint is one row of three things, the complaint, where it was found and where it is now. A row opens like the pipeline.
const cqMDY = iso => { if (!iso) return 'Client card'; const [y, m, d] = String(iso).slice(0, 10).split('-'); return m + '/' + d + '/' + y; };
const cqFound = r => (r.by ? 'Logged by staff' : r.src === 'client' ? 'Phorest client card' : 'Phorest note');
const cqFoundKey = r => (r.by ? 'staff' : 'ph');
// Where it is now, in the pipeline's words. Old Phorest notes were written after the fact, so they are Closed, history.
function cqStage(r) {
  if (r.duplicate_of) return { i: 4, tone: 'grey', text: 'Duplicate' };
  if (r.status === 'open') {
    if (r.flag === 'overdue') return { i: r.first_response_at ? 3 : 1, tone: 'red', text: 'Overdue' };
    if (r.first_response_at) return { i: 3, tone: 'green', text: 'Replied, client back?' };
    if (r.flag === 'pending') return { i: 1, tone: 'amber', text: 'Pending action' };
    return { i: 1, tone: 'amber', text: 'Waiting to be taken' };
  }
  return { i: 4, tone: 'grey', text: r.by ? 'Closed' : 'Closed, history' };
}
const cqPri = r => r.status !== 'open' ? 'low' : ((r.type === 'skin_reaction_or_injury' || r.flag === 'overdue') ? 'high' : 'mid');   // the pipeline's rule: closed is low, a skin reaction or an overdue reply is high
const CQ_STAGES = ['Found', 'Waiting', 'Taken', 'Replied', 'Closed'];
function cqPipe(r) {
  const st = cqStage(r);
  const bar = CQ_STAGES.map((g, i) => `<div class="cq-stg${i < st.i ? ' done' : i === st.i ? ' cur' + (st.tone === 'red' ? ' red' : '') : ''}">${i < st.i ? '&#10003; ' : ''}${g}<small>${i === 0 && st.i > 0 ? cqEsc(cqFound(r).toLowerCase()) : i === st.i ? cqEsc(st.text.toLowerCase()) : ''}</small></div>`).join('');
  return `<div class="cq-pipe" role="img" aria-label="Stage: ${cqEsc(CQ_STAGES[st.i])}">${bar}</div>`;
}
// Today as the server counts it: the Dubai day (cq_today). A phone in Manila is a day ahead between midnight and 4 am there, so the browser's own date
// made the form say "the date she complained is in the future" (Kate, 31 Oct 2026).
const cqToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' });
const cqLevelOk = (pg) => typeof TRS_LEVEL !== 'undefined' && (typeof trsPageOpen === 'function'
  ? trsPageOpen(pg || 'complaints', TRS_LEVEL, typeof TRS_EXTRA !== 'undefined' ? TRS_EXTRA : null) : TRS_LEVEL >= 2);

// The mini side nav: the "On this page" rail the Ledgers pages carry (lgShell in branch-ledger.js; spy() lights the entry in view).
const CQ_RAIL = [['cq-branch', 'By branch'], ['cq-year', 'By year'], ['cq-kind', 'What it was about'], ['cq-res', 'How it was resolved'], ['cq-list', 'The complaints']];
function cqRailShell(body, items) {
  return typeof lgShell === 'function' ? lgShell(items || CQ_RAIL, body, 'lg-shell-wide') : body;
}

async function cqRemove(id) {
  if (!window.confirm('Remove this logged complaint?')) return;
  try {
    const { data, error } = await sb.rpc('client_complaint_submission_delete', { p_id: id });
    if (error) throw error;
    if (!data) { window.alert('Only the person who logged it, or Level 6, can remove it.'); return; }
    cqOpen = 0; cqLoadSummary(); cqLoadList();
  } catch (e) { console.error(e); window.alert('It could not be removed. Try again.'); }
}

function cqCss() {
  return `<style>
    .cq h1{font-family:'Playfair Display',Georgia,serif;font-weight:500;font-size:28px;margin:6px 0 4px}
    .cq .cq-sub{color:var(--muted);font-size:13px;margin:0 0 16px;max-width:820px;line-height:1.5}
    .cq-bar{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;margin-bottom:14px}
    .cq-in{flex:1 1 240px;min-width:0;border:1px solid var(--border);background:var(--surface);color:var(--text);border-radius:999px;padding:8px 16px;font:inherit;font-size:14px}
    .cq-sel{border:1px solid var(--border);background:var(--surface);color:var(--text);border-radius:999px;padding:7px 12px;font:inherit;font-size:13px;max-width:100%}
    .cq-chk{font-size:13px;color:var(--muted);display:inline-flex;gap:6px;align-items:center}
    .cq-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:14px}
    .cq-tile{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-card);padding:10px 14px}
    .cq-tile b{display:block;font-size:24px;font-weight:600;line-height:1.2}
    .cq-tile span{font-size:12px;color:var(--muted)}
    .cq-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-card);padding:12px 14px 12px;margin-bottom:14px}
    .cq-card h2{font-size:14px;font-weight:600;margin:0 0 2px}
    .cq-card .cq-note{color:var(--muted);font-size:12px;margin:0 0 10px;line-height:1.45}
    .cq-meta{color:var(--muted);font-size:12px;margin:0 0 8px;min-height:16px}
    table.cq-t{width:100%;border-collapse:collapse;font-size:13px}
    .cq-t th{text-align:left;font-size:11px;font-weight:600;color:var(--muted);padding:8px 8px;border-bottom:1px solid var(--border);white-space:nowrap}
    .cq-t td{padding:9px 8px;border-bottom:1px solid var(--border2);vertical-align:top}
    .cq-t .n{text-align:right;font-variant-numeric:tabular-nums}
    .cq-t tr.cq-br.on td{background:var(--surface2)}
    .cq-t th.cq-sort{cursor:pointer;user-select:none}
    .cq-t th.cq-sort:hover,.cq-t th.cq-sort:focus-visible{color:var(--text);background:var(--surface2)}
    .cq-t th.cq-sort:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
    .cq-t th.cq-sort .ar{display:inline-block;width:12px;margin-left:4px;font-size:10px;opacity:.35}
    .cq-t th.cq-sort[aria-sort] {color:var(--text)}
    .cq-t th.cq-sort[aria-sort] .ar{opacity:1}
    .cq-t tr.cq-row{cursor:pointer;position:relative}
    .cq-rowlink{color:inherit;text-decoration:none}.cq-rowlink::after{content:"";position:absolute;inset:0;z-index:1}.cq-rowlink:hover{text-decoration:underline}
    .cq-row .cq-code,.cq-row .cq-sub2{position:relative;z-index:1}
    /* What happened is the column people read: wide enough for a few lines, not a thin strip (Kate, 9 Nov 2026). On a phone the other columns fold away, so it takes what is left. */
    .cq-t.cq-lg th:nth-child(4),.cq-t.cq-lg td:nth-child(4){min-width:200px}
    @media (min-width:761px){.cq-t.cq-lg th:nth-child(4),.cq-t.cq-lg td:nth-child(4){min-width:340px;max-width:560px}}
    .cq-t tr.cq-row:hover td,.cq-t tr.cq-row:focus-visible td,.cq-t tr.cq-row.on td{background:var(--surface2)}
    .cq-t tr.cq-row:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
    .cq-t td.cq-det{padding:14px 12px 18px;background:var(--surface2)}
    .cq-intro{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px 22px;background:var(--surface);border:1px solid var(--border);border-left:4px solid var(--accent);border-radius:var(--radius-card);padding:12px 16px;margin:0 0 14px}
    .cq-intro p{margin:0;font-size:13.5px;line-height:1.45}
    .cq-intro b{display:block;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-bottom:2px}
    .cq-link{background:none;border:0;padding:0;font:inherit;font-weight:600;text-decoration:underline;color:inherit;cursor:pointer}
    @media (max-width:900px){.cq-intro{grid-template-columns:minmax(0,1fr)}}
    /* The archive rows (Kate, 12 Nov 2026): three columns only. */
    .cq-t.cq-arc td:first-child{border-left:5px solid transparent}
    .cq-t.cq-arc tr.cq-row.p-high td:first-child{border-left-color:#E0674F}
    .cq-t.cq-arc tr.cq-row.p-mid td:first-child{border-left-color:#D9A441}
    .cq-t.cq-arc tr.cq-row.p-low td:first-child{border-left-color:#A8A398}
    .cq-t.cq-arc td.cq-det{border-left:0}
    .cq-nm{display:block;font-weight:600;overflow-wrap:anywhere}
    .cq-qt{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;color:var(--muted);font-size:12.5px;margin-top:2px;line-height:1.35}
    .cq-ch{display:inline-block;border-radius:999px;padding:2px 10px;font-size:12px;font-weight:600;border:1px solid var(--border);background:var(--surface2);line-height:1.4}
    .cq-ch.ph{background:#ECE8FB;border-color:#C4B5FD;color:#2D2E37}.cq-ch.staff{background:var(--surface2);color:var(--muted)}
    .cq-ch.red{background:#F8E4DF;color:#B4412F;border-color:transparent}.cq-ch.amber{background:#FAEFD6;color:#8A5A00;border-color:transparent}.cq-ch.green{background:#E1F1E6;color:#2F7A4B;border-color:transparent}.cq-ch.grey{background:var(--border);color:var(--muted);border-color:transparent}
    .cq-pipe{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));margin:0 0 14px}
    .cq-stg{text-align:center;padding:9px 4px 7px;font-size:13px;font-weight:600;background:var(--surface);border:1.5px solid var(--border);margin-left:-1.5px;color:var(--muted);min-width:0}
    .cq-stg:first-child{border-radius:10px 0 0 10px;margin-left:0}.cq-stg:last-child{border-radius:0 10px 10px 0}
    .cq-stg small{display:block;font-size:11px;font-weight:500;min-height:1.3em;overflow-wrap:anywhere}
    .cq-stg.done{background:#E1F1E6;border-color:#2F7A4B;color:#1f5a35}
    .cq-stg.cur{background:#99F6E4;border-color:var(--accent);color:#1C1B18}
    .cq-stg.cur.red{background:#E0674F;border-color:#E0674F;color:#2b0d08}
    .cq-gone{display:none}
    .cq-tilebtn{text-align:left;cursor:pointer;font:inherit;color:inherit}.cq-tilebtn:hover{border-color:var(--muted)}.cq-tilebtn.on{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 14%,var(--surface))}
    .cq-recgrid{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:14px;align-items:start}
    .cq-decide{position:sticky;top:12px}
    .cq-acts{display:grid;gap:8px}
    .cq-act{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:46px;border-radius:10px;border:1.5px solid var(--border);background:var(--surface);padding:8px 14px;font:inherit;font-size:14.5px;font-weight:600;cursor:pointer;text-align:left;color:inherit}
    .cq-act:hover{border-color:var(--muted)}.cq-act.pri{background:var(--text);color:var(--bg);border-color:var(--text)}.cq-act.cur{outline:2.5px solid var(--accent);outline-offset:2px}
    .cq-act kbd{font:inherit;font-size:11px;font-weight:600;border:1px solid currentColor;border-radius:5px;padding:0 6px;opacity:.7}
    .cq-toast{background:#DDF0E3;color:#1f5a35;border-radius:10px;padding:9px 14px;font-size:13.5px;margin:0 0 12px}
    .cd-scroll{max-height:72vh;overflow:auto}
    .cd-t th{position:sticky;top:0;background:var(--surface);z-index:2}
    .cd-t td.cd-wide{min-width:240px;max-width:420px}
    @media (max-width:1000px){.cq-recgrid{grid-template-columns:minmax(0,1fr)}.cq-decide{position:static}.cq-act kbd{display:none}}
    .cq-recbar{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin:0 0 12px}
    .cq-recpos{display:inline-flex;gap:6px;align-items:center;font-size:13px;color:var(--muted)}
    .cq-recbox{padding:16px 18px 18px;max-width:1040px}
    .cq-rectitle{font-size:19px !important;line-height:1.35;font-weight:600;margin:0 0 8px !important;overflow-wrap:anywhere}
    .cq-recchips{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:0 0 14px}
    .cq-rioline{margin:0 0 10px;font-size:13px;line-height:1.5;color:var(--muted)}.cq-rioline b{color:var(--text)}
    .cq-tabs{display:flex;gap:6px;border-bottom:1px solid var(--border);margin:0 0 12px;flex-wrap:wrap}
    .cq-tab{background:none;border:0;border-bottom:3px solid transparent;padding:8px 10px;font:inherit;font-size:13.5px;font-weight:600;color:var(--muted);cursor:pointer}
    .cq-tab.on{color:var(--text);border-bottom-color:var(--accent)}
    .cq-tab .cq-ch{margin-left:4px;padding:0 7px;font-size:11px}
    .cq-box{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:10px 12px;font-size:13.5px;line-height:1.5;margin-bottom:8px}
    .cq-cand{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap}
    .cq-seq{display:flex;gap:8px;flex-wrap:wrap}
    .cq-ptiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:10px}
    .cq-ptile{display:flex;flex-direction:column;align-items:flex-start;text-align:left;background:var(--surface);border:1.5px solid var(--border);border-radius:10px;padding:8px 12px;min-width:0;font:inherit;color:inherit}
    button.cq-ptile{cursor:pointer}button.cq-ptile:hover{border-color:var(--muted)}
    .cq-ptile b{font-size:20px;font-weight:600;line-height:1.25;overflow-wrap:anywhere}.cq-ptile span{font-size:12px;color:var(--muted)}
    .cq-rio{background:#fff;color:#1c2330;border:1px solid #cfd5e0;border-radius:12px;overflow:hidden;max-width:720px}
    .cq-rhd{display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid #e3e7ef;flex-wrap:wrap}
    .cq-rav{flex:none;width:36px;height:36px;border-radius:10px;background:#dfe6f7;color:#2c3f7a;display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:13px}
    .cq-rwho{min-width:0;flex:1 1 140px}.cq-rwho b{display:block;font-size:14.5px}.cq-rwho small{color:#5b6477;font-size:12.5px}
    .cq-rpill{font-size:12px;font-weight:600;border-radius:999px;padding:2px 10px;background:#e4f4ea;color:#1d6b3a;border:1px solid #bfe3cc}.cq-rpill.ghost{background:#f1f3f8;color:#4a5468;border-color:#d9dde6}
    .cq-rsub{display:flex;gap:6px;flex-wrap:wrap;align-items:center;padding:8px 12px;border-bottom:1px solid #e3e7ef;font-size:12.5px;color:#4a5468;background:#fafbfd}
    .cq-rtag{background:#eef1f7;border-radius:6px;padding:1px 8px;font-size:12px;color:#3b4560}
    .cq-rbody{background:#f3f5f9;padding:12px;display:grid;gap:8px;max-height:560px;overflow:auto}
    .cq-rday{justify-self:center;font-size:11.5px;color:#5b6477;background:#e6eaf2;border-radius:999px;padding:2px 12px}
    .cq-rb{max-width:80%;padding:8px 12px;border-radius:14px;font-size:14px;line-height:1.45;overflow-wrap:anywhere;user-select:text}
    .cq-rb.in{justify-self:start;background:#fff;border:1px solid #e0e4ec;border-bottom-left-radius:4px}
    .cq-rb.out{justify-self:end;background:#dbe8ff;border:1px solid #c3d6fb;border-bottom-right-radius:4px}
    .cq-rimg{display:block;width:260px;max-width:100%;border-radius:10px;margin:0 0 6px}
    .cq-rlink{color:inherit;text-decoration:underline}
    .cq-rbt{display:block;font-size:11.5px;color:#6a7488;margin-top:3px;text-align:right}
    @media (max-width:760px){.cq-rb{max-width:92%}.cq-ptiles{grid-template-columns:1fr}}
    @media (max-width:760px){.cq-stg{font-size:12px;padding:8px 2px 6px}.cq-stg small{font-size:10px}.cq-t.cq-arc th.hm,.cq-t.cq-arc td.hm{display:none}}
    .cq-bars{display:grid;grid-template-columns:minmax(120px,190px) 1fr auto;gap:6px 10px;align-items:center;font-size:13px}
    .cq-bars.yrs{grid-template-columns:44px 1fr auto}
    .cq-ftog{display:none}
    .cq-fsel{display:contents}
    .cq-ftog .n{display:inline-block;min-width:18px;margin-left:6px;border-radius:9px;background:var(--accent);color:#102;font-size:11px;font-weight:700;line-height:18px;text-align:center}
    .cq-card.cq-wait{border:0;background:none;padding:0;margin-bottom:0}
    .cq-card.cq-wait>:not(#cqBody){display:none}
    .cq-metarow{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px 12px;margin:0 0 8px}
    .cq-metarow .cq-meta{margin:0}
    .cq-sheetwrap{display:inline-flex;align-items:center;gap:10px;flex-wrap:wrap}
    .cq-sheetwrap .cq-meta:empty{display:none}   /* an empty message left a 10px gap before the button, so it sat out of line with the search box */
    .cq-trk{height:14px;border-radius:7px;background:var(--surface2);display:flex;overflow:hidden}
    .cq-seg{height:100%;min-width:2px}
    .cq-val{font-variant-numeric:tabular-nums;font-size:12px;color:var(--muted);white-space:nowrap}
    .cq-legend{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;color:var(--muted);margin:0 0 10px}
    .cq-legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}
    .cq-pill{display:inline-block;border-radius:999px;padding:1px 8px;font-size:11px;background:var(--surface2);color:var(--muted);margin-right:4px;white-space:nowrap}
    .cq-pill.warn{background:var(--warn-bg);color:var(--warn)}
    .cq-muted{color:var(--muted)}
    .cq-grid{display:grid;grid-template-columns:minmax(220px,300px) 1fr;gap:18px 28px}
    .cq-eye{font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);margin:0 0 6px}
    .cq-kv{margin:0 0 4px;font-size:13px;line-height:1.5;overflow-wrap:anywhere}
    .cq-kv span{color:var(--muted)}
    .cq-orig{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:10px 12px;font-size:13px;line-height:1.5;margin:0 0 10px;overflow-wrap:anywhere}
    .cq-btn{border:1px solid var(--border);background:var(--surface);color:var(--text);border-radius:999px;padding:5px 14px;font:inherit;font-size:13px;cursor:pointer}
    .cq-btn:disabled{opacity:.4;cursor:default}
    .cq-pager{display:flex;align-items:center;gap:10px;justify-content:flex-end;flex-wrap:wrap;padding:10px 0 2px}
    .cq-pager .cq-size{margin-right:auto;display:inline-flex;align-items:center;gap:8px;font-size:13px;color:var(--muted)}
    .cq-tip{position:fixed;z-index:9999;pointer-events:none;max-width:260px;padding:6px 10px;border-radius:8px;font-size:12px;line-height:1.4;background:var(--surface2);color:var(--text);border:1px solid var(--border);box-shadow:0 4px 14px rgba(0,0,0,.25);display:none}
    .cq [data-tip]{cursor:default}
    details.cq-card>summary{cursor:pointer;font-size:14px;font-weight:600;list-style:none}
    details.cq-card>summary::-webkit-details-marker{display:none}
    details.cq-card>summary::before{content:'+';display:inline-block;width:16px;color:var(--muted)}
    details.cq-card[open]>summary::before{content:'−'}
    .cq-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px 14px;margin:10px 0 12px}
    .cq-form label{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--muted);min-width:0}
    .cq-form .wide{grid-column:1/-1}
    .cq-form .cq-in,.cq-form .cq-sel,.cq-form textarea{flex:none;width:100%;box-sizing:border-box;border-radius:12px;color:var(--text)}
    .cq-form textarea{border:1px solid var(--border);background:var(--surface);padding:9px 14px;font:inherit;font-size:14px;resize:vertical}
    .cq-msg{font-size:13px}.cq-msg.err{color:var(--warn)}
    .cq-btn.pri{background:var(--accent);color:var(--bg);border-color:var(--accent);font-weight:600}   /* the text takes the page colour, so it reads on the accent in dark and light */
    .cq-foot{color:var(--muted);font-size:12px;line-height:1.5;margin:12px 0 0;max-width:820px}
    .cq-i{position:relative;display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;margin-left:8px;border:1px solid var(--border);border-radius:50%;background:var(--surface2);color:var(--muted);font:600 11px/1 inherit;cursor:help;padding:0;vertical-align:middle;flex:none}
    .cq-i::after{content:attr(data-tip);position:absolute;left:0;top:calc(100% + 8px);width:260px;max-width:70vw;padding:8px 10px;border-radius:8px;background:var(--surface2);color:var(--text);border:1px solid var(--border);box-shadow:0 4px 14px rgba(0,0,0,.3);font:400 12px/1.45 inherit;text-align:left;white-space:normal;display:none;z-index:50}
    .cq-i:hover::after,.cq-i:focus::after{display:block}
    .cq-dup{margin:0 0 10px;padding:10px 12px;border-radius:10px;border:1px solid var(--warn);background:var(--warn-bg);color:var(--text);font-size:13px;line-height:1.5}
    .cq-dup[hidden]{display:none}
    .cq-dup.hard{border-color:#d9534f}
    .cq-dup ul{margin:4px 0 0 18px;padding:0}
    .cq-form[hidden]{display:none}
    .cq-flag{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:2px 10px;font-size:11px;font-weight:600;white-space:nowrap}
    .cq-flag i{width:8px;height:8px;border-radius:50%;background:currentColor}
    .cq-flag.over{background:rgba(217,83,79,.15);color:#d9534f}
    .cq-flag.pend{background:var(--warn-bg);color:var(--warn)}
    .cq-tile.btn{cursor:pointer;text-align:left;font:inherit;color:inherit}
    .cq-tile.btn:hover,.cq-tile.btn:focus-visible{background:var(--surface2)}
    .cq-tile.btn[aria-pressed="true"]{border-color:var(--accent)}
    .cq-tile.over b{color:#d9534f}.cq-tile.pend b{color:var(--warn)}
    .cq-sub2{font-size:12px;color:var(--muted);margin-top:3px;line-height:1.4}
    .cq-t .sm{display:none}
    .cq-sub2.late{color:#d9534f}
    .cq-files{margin:4px 0 6px;padding:0;list-style:none}
    .cq-files li{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:13px;margin:0 0 4px}
    .cq-link{background:none;border:0;padding:0;color:var(--accent);font:inherit;cursor:pointer;text-decoration:underline;text-align:left}
    .cq-chk-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
    .cq-kv a{color:var(--accent)}
    .cq-code{display:inline-flex;align-items:center;gap:6px;padding:2px 9px;border-radius:8px;background:var(--surface2);color:var(--text);font-size:12px;font-weight:600;letter-spacing:.02em;white-space:nowrap}
    .cq-code button{background:none;border:0;padding:0;color:var(--accent);font:inherit;font-size:11.5px;font-weight:500;cursor:pointer;text-decoration:underline}
    @media (max-width:760px){.cq-t .hm{display:none}.cq-t .sm{display:block}.cq-t.cq-lg th,.cq-t.cq-lg td{padding-left:5px;padding-right:5px}.cq-t.cq-lg td.cq-det{padding-left:12px;padding-right:12px}.cq-t.cq-lg{font-size:12px}.cq-t.cq-lg .cq-sub2{font-size:11px}.cq-t.cq-lg .cq-flag{padding:2px 7px;font-size:10.5px}.cq-t.cq-lg td.cq-det{font-size:13px}.cq-grid{grid-template-columns:1fr}.cq h1{font-size:24px}.cq-bars{grid-template-columns:minmax(90px,130px) 1fr auto}
      .cq-bars.yrs{grid-template-columns:40px 1fr auto}
      .cq-card{padding:12px 12px}
      .cq .cq-filt{display:grid;grid-template-columns:1fr auto;gap:8px}
      .cq .cq-filt .cq-in{min-height:42px}
      .cq .cq-ftog{display:inline-flex;align-items:center;min-height:42px;padding:0 16px}
      .cq .cq-filt .cq-fsel{display:none}
      .cq .cq-filt.open .cq-fsel{display:grid;grid-template-columns:1fr 1fr;gap:8px;grid-column:1/-1}
      .cq .cq-filt .cq-sel{width:100%;min-width:0;min-height:40px;font-size:14px;padding:0 10px}
      .cq .cq-filt .cq-chk{grid-column:1/-1}
      #complaintsContent .lg-side{display:none}
      .cq .cq-filt .cq-sel:only-of-type{grid-column:1/-1}
      .cq-metarow{flex-direction:column;align-items:stretch;gap:8px}
      .cq-sheetwrap{display:flex;width:100%}
      .cq-sheetwrap .cq-btn{flex:1 1 auto;min-height:40px}
      .cq-tiles{grid-template-columns:1fr 1fr}
      .cq-tile{padding:9px 11px}.cq-tile b{font-size:21px}}
  </style>`;
}

function cqShell() {
  const topts = ['<option value="all">All kinds</option>'].concat(Object.keys(CQ_TYPE).map(k => `<option value="${k}">${cqEsc(CQ_TYPE[k])}</option>`)).join('');
  const ropts = ['<option value="all">All outcomes</option>'].concat(Object.keys(CQ_RES).map(k => `<option value="${k}">${cqEsc(CQ_RES[k])}</option>`)).join('');
  return cqCss() + `<div class="cq">
    <h1>Client Complaints</h1>
    <div id="cqRec" class="cq-gone"></div>
    <div id="cqMain">
    <p class="cq-sub">Every complaint written into a Phorest client card or visit note, read one by one and sorted by branch, year, kind and how it was resolved. Levels 3 and up. It shows what staff wrote down, not every complaint that happened, and it is a copy from 21 Oct 2026.</p>
    <div class="cq-intro" id="cqIntro">
      <p><b>What is this?</b>Every complaint we know about, wherever it was found. Click one and it opens like the pipeline.</p>
      <p><b>Why it matters</b>Phorest notes show what staff wrote down, not everything a client told us. Every complaint is looked up in respond.io first (WhatsApp, Instagram and Facebook), so her own words sit beside it.</p>
      <p><b>Do this now</b><span id="cqDo">Loading…</span></p>
    </div>
    ${cqRailShell(`<div id="cqTop"><p class="cq-meta">Loading…</p></div>
    <div class="cq-card cq-wait" id="cq-list">
      <h2>The complaints</h2>
      <p class="cq-note">Tap one to read the original note and how it ended. Redo notes with no reason written are in here as complaints with the reason left blank.</p>
      <div class="cq-bar cq-filt">
        <input id="cqQ" class="cq-in" type="search" inputmode="search" autocomplete="off" placeholder="Name, stylist or words in the note" aria-label="Search complaints" value="${cqEsc(CQ.q)}">
        <button type="button" id="cqFtog" class="cq-btn cq-ftog" aria-expanded="false">Filters</button>
        <div class="cq-fsel">
        <select id="cqS" class="cq-sel" aria-label="Found in"><option value="visit">Found in: Phorest visit notes</option><option value="client">Found in: Phorest client cards</option><option value="logged">Found in: logged by staff</option></select>
        <select id="cqT" class="cq-sel" aria-label="Kind">${topts}</select>
        <select id="cqR" class="cq-sel" aria-label="Outcome">${ropts}</select>
        <select id="cqSt" class="cq-sel" aria-label="Status"><option value="all">Status: any</option><option value="open">Still open</option><option value="resolved">Resolved</option></select>
        <select id="cqG" class="cq-sel" aria-label="Google review"><option value="all">Google: any</option><option value="yes">Left a Google review</option><option value="no">No Google review found</option></select>
        <label class="cq-chk"><input id="cqL" type="checkbox"> Unsure only</label>
        </div>
      </div>
      <div class="cq-metarow"><p class="cq-meta" id="cqMeta" aria-live="polite"></p><span class="cq-sheetwrap"><span id="cqSheetMsg" class="cq-meta" aria-live="polite"></span><button type="button" id="cqSheet" class="cq-btn">Open in Google Sheets</button>${typeof rexButtons === 'function' ? rexButtons('cqExport') : ''}</span></div>
      <div id="cqBody" style="overflow-x:auto"><p class="cq-meta">Loading…</p></div>
    </div>`)}
    <p class="cq-foot">How to read it. A complaint here is a note where the client was unhappy with the service, result, price, wait or experience, or where a redo, refund or credit was given because the result was not right. Cancellation apologies, deposit rules, Google review requests and clients unhappy with another salon were left out. A free redo means a redo was written down; most of them had no charge on the visit, some did. The rate per 1,000 noted visits is there because branches do not write notes equally, so the raw count favours the branch that writes most. Marasy closed in 2022. Not included: WhatsApp complaints, respond.io tags, Google reviews, and anything nobody typed into Phorest. Client card notes have no date, so they are counted apart and only show in All time. Unsure means the note was too short to be sure, usually a bare "redo". The Google column looks for a Google review whose reviewer name is the client's full name, left on or after the complaint. Reviewers often post a first name or a nickname, so None found is not proof that nothing was posted, and a match is the same name, not a certainty it is about that visit.</p>
    </div>
  </div>`;
}

// The Filters button on a phone says how many of the pickers are set to something.
function cqFtogLabel() {
  const ft = document.getElementById('cqFtog');
  if (!ft) return;
  const n = (cqMode === 'log' ? [CQ.status] : [CQ.src === 'visit' ? 'all' : CQ.src, CQ.type, CQ.res, CQ.status, CQ.google]).filter(v => v && v !== 'all').length + (cqMode !== 'log' && CQ.low ? 1 : 0);
  ft.innerHTML = 'Filters' + (n ? `<span class="n">${n}</span>` : '');
}

function cqWire() {
  const q = document.getElementById('cqQ'), body = document.getElementById('cqBody'), top = document.getElementById('cqTop');
  const ft = document.getElementById('cqFtog');
  if (ft && !ft.dataset.w) {
    ft.dataset.w = '1';
    ft.addEventListener('click', () => { const bar = ft.closest('.cq-filt'); const on = bar.classList.toggle('open'); ft.setAttribute('aria-expanded', String(on)); });
  }
  cqFtogLabel();
  const rec = document.getElementById('cqRec');
  if (rec && !rec.dataset.w) { rec.dataset.w = '1'; rec.addEventListener('click', cqClick); }
  if (!window.cqEscWired) { window.cqEscWired = true; document.addEventListener('keydown', e => { if (e.key === 'Escape' && cqOpen && !/INPUT|TEXTAREA|SELECT/.test((e.target || {}).tagName || '')) cqRecClose(); }); }
  const sh = document.getElementById('cqSheet');
  if (sh && !sh.dataset.w) { sh.dataset.w = '1'; sh.addEventListener('click', cqSheetsExport); }
  const go = document.getElementById('cqfGo');
  if (go && !go.dataset.w) { go.dataset.w = '1'; go.addEventListener('click', cqSubmit); }
  if (typeof cqWireDup === 'function') cqWireDup();
  if (q && !q.dataset.w) {
    q.dataset.w = '1';
    q.addEventListener('input', () => { CQ.q = q.value; CQ.page = 0; cqOpen = 0; clearTimeout(cqTimer); cqTimer = setTimeout(cqLoadList, 300); });
  }
  [['cqS', 'src'], ['cqT', 'type'], ['cqR', 'res'], ['cqSt', 'status'], ['cqG', 'google']].forEach(([id, k]) => {
    const el = document.getElementById(id);
    if (el && !el.dataset.w) {
      el.dataset.w = '1';
      el.value = CQ[k];
      el.addEventListener('change', () => { CQ[k] = el.value; CQ.page = 0; cqOpen = 0; cqFtogLabel(); cqLoadList(); });
    }
  });
  const low = document.getElementById('cqL');
  if (low && !low.dataset.w) {
    low.dataset.w = '1';
    low.checked = CQ.low;
    low.addEventListener('change', () => { CQ.low = low.checked; CQ.page = 0; cqOpen = 0; cqFtogLabel(); cqLoadList(); });
  }
  if (body && !body.dataset.w) {
    body.dataset.w = '1';
    body.addEventListener('click', cqClick);
    body.addEventListener('change', e => {
      if (e.target && e.target.id === 'cqu-res') cqRevisitShow();
      if (e.target && e.target.id === 'cqN') { CQ.size = Number(e.target.value) || 10; CQ.page = 0; cqOpen = 0; cqSave(); cqLoadList(); }
    });
    body.addEventListener('keydown', e => {
      const c = e.target.classList;
      if ((e.key === 'Enter' || e.key === ' ') && c && (c.contains('cq-row') || c.contains('cq-sort'))) { e.preventDefault(); cqClick(e); }
    });
  }
  if (top && !top.dataset.w) {
    top.dataset.w = '1';
    cqWireTip(top);
  }
}

// One floating tooltip for the bars: hover shows the number, a tap does on a phone. The native title tooltip showed blank.
function cqWireTip(root) {
  let tip = document.getElementById('cqTip');
  if (!tip) { tip = document.createElement('div'); tip.id = 'cqTip'; tip.className = 'cq-tip'; tip.setAttribute('role', 'tooltip'); document.body.appendChild(tip); }
  const at = (e, el) => {
    tip.textContent = el.dataset.tip; tip.style.display = 'block';
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.max(6, Math.min(e.clientX + 14, window.innerWidth - w - 6)) + 'px';
    tip.style.top = Math.max(6, (e.clientY - h - 12 < 6) ? e.clientY + 18 : e.clientY - h - 12) + 'px';
  };
  const off = () => { tip.style.display = 'none'; };
  root.addEventListener('mousemove', e => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el) at(e, el); else off(); });
  root.addEventListener('mouseleave', off);
  root.addEventListener('click', e => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el) at(e, el); else off(); });
  window.addEventListener('scroll', off, { passive: true });
}

function cqClick(e) {
  const t = e.target;
  if (t.closest && t.closest('[data-cqback]')) { cqRecClose(); return; }
  const nv = t.closest && t.closest('[data-cqnav]');
  if (nv) { cqRecNav(Number(nv.dataset.cqnav)); return; }
  const tb = t.closest && t.closest('[data-cqtab]');
  if (tb) { cqTabShow(Number(tb.dataset.id), tb.dataset.cqtab); return; }
  const go = t.closest && t.closest('[data-cqgo]');
  if (go) { const el = document.getElementById(go.dataset.cqgo); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
  const rt = t.closest && t.closest('[data-cqretry]');
  if (rt) { const id = Number(rt.dataset.cqretry), r = cqRowById(id); if (r) { delete cqCacheOf(id).chat; cqTabShow(id, 'chat'); cqRioStatus(r); } return; }
  const yes = t.closest && t.closest('[data-cqyes]');
  if (yes) { const id = Number(yes.dataset.id); cqChatLink(id, Number(yes.dataset.cqyes)).then(ok => { const r = cqRowById(id); if (ok && r) { cqTabShow(id, 'chat'); cqRioStatus(r); } }); return; }
  const no = t.closest && t.closest('[data-cqno]');
  if (no) { const id = Number(no.dataset.id), r = cqRowById(id); cqCacheOf(id).skip.push(Number(no.dataset.cqno)); if (r) { cqTabShow(id, 'chat'); cqRioStatus(r); } return; }
  const cul = t.closest && t.closest('[data-cqunlink]');
  if (cul) { const id = Number(cul.dataset.cqunlink); cqChatLink(id, null).then(ok => { const r = cqRowById(id); if (ok && r) { cqTabShow(id, 'chat'); cqRioStatus(r); } }); return; }
  const cp = t.closest && t.closest('[data-copy]');
  if (cp) { e.stopPropagation(); cqCopy(cp); return; }
  const dl = t.closest && t.closest('[data-dup]');
  if (dl) { cqDupLink(Number(dl.dataset.dup)); return; }
  const ul = t.closest && t.closest('[data-unlink]');
  if (ul) { cqDupUnlink(Number(ul.dataset.unlink)); return; }
  const up = t.closest && t.closest('[data-up]');
  if (up) { cqUpdate(Number(up.dataset.id), up.dataset.up); return; }
  const del = t.closest && t.closest('[data-del]');
  if (del) { cqRemove(Number(del.dataset.del)); return; }
  const fo = t.closest && t.closest('[data-file]');
  if (fo) { cqOpenFile(fo.dataset.file); return; }
  const fd = t.closest && t.closest('[data-delfile]');
  if (fd) { cqRemoveFile(Number(fd.dataset.delfile), Number(fd.dataset.cid)); return; }
  const fu = t.closest && t.closest('[data-upfiles]');
  if (fu) { cqAddFiles(Number(fu.dataset.upfiles)); return; }
  const th = t.closest && t.closest('th[data-s]');
  if (th) {
    const k = th.dataset.s;
    if (CQ.sort === k) CQ.dir = CQ.dir === 'asc' ? 'desc' : 'asc';
    else { CQ.sort = k; CQ.dir = ['date', 'cdate', 'resolved'].includes(k) ? 'desc' : 'asc'; }
    CQ.page = 0; cqOpen = 0; cqLoadList(); return;
  }
  const pg = t.closest && t.closest('[data-pg]');
  if (pg) { CQ.page = Math.max(0, CQ.page + Number(pg.dataset.pg)); cqOpen = 0; cqLoadList(); return; }
  const row = t.closest && t.closest('tr.cq-row');
  if (row && cqMode === 'log') { if (t.closest('a.cq-rowlink')) return; cqOpenRecord(Number(row.dataset.i)); return; }
  if (row) cqToggle(row);
}

// Log a Client Complaint (Kate, 30 Oct 2026): a row opens the full record in a new window (the ticket page, addressed by its code). The follow-up, how it ended,
// reopen and delete are still on the dashboard, one link away on that page, and open this row when the address carries cid.
const cqRecordUrl = r => r && r.code ? '/hub/complaint?c=' + encodeURIComponent(r.code) : '/hub/complaint?cid=' + (r && r.id) + '&t=1';
function cqOpenRecord(id) {
  const r = ((cqList && cqList.rows) || []).find(x => x.id === id);
  window.open(cqRecordUrl(r || { id }), '_blank', 'noopener');
}

// The record (Kate, 12 Nov 2026): the stage bar, one line on what respond.io found, and three tabs. Complaint is the card the row always had; Conversation is her chat in
// respond.io (WhatsApp, Instagram, Facebook); Client profile is who she is in Phorest. Levels 3 and up, checked again in the database and in the edge function.
const cqCache = {};
const cqCacheOf = id => (cqCache[id] = cqCache[id] || { skip: [] });
const cqDateIso = r => { const d = r.complaint_date || r.date; return d ? String(d).slice(0, 10) : null; };
function cqRecord(r) {
  return `${cqPipe(r)}<p class="cq-rioline" id="cqRioLine" aria-live="polite"><b>respond.io check:</b> looking her up…</p>
    <div class="cq-tabs" role="tablist">${[['complaint', 'Complaint'], ['chat', 'Conversation'], ['client', 'Client profile']].map(([k, l], i) => `<button type="button" role="tab" class="cq-tab${i ? '' : ' on'}" data-cqtab="${k}" data-id="${r.id}">${l}</button>`).join('')}</div>
    <div id="cqTabBody">${cqCard(r)}</div>`;
}
async function cqProfile(id) {
  const c = cqCacheOf(id);
  if (c.profile !== undefined) return c.profile;
  try {
    const [p, l] = await Promise.all([sb.rpc('complaint_client_profile', { p_id: id }), sb.rpc('complaint_chat_link_get', { p_id: id })]);
    if (p.error) throw p.error;
    c.profile = p.data || null;
    c.link = l && !l.error && l.data ? Number(l.data) : null;
  } catch (e) { console.error(e); c.profile = null; c.link = null; c.err = true; }
  return c.profile;
}
const cqRowById = id => ((cqList && cqList.rows) || []).find(x => x.id === id);
// Ask respond.io (through the edge function) for her chat: by the confirmed contact, else by her phone, else by her name (then a person confirms).
async function cqChat(r, force) {
  const c = cqCacheOf(r.id);
  if (c.chat && !force) return c.chat;
  const p = await cqProfile(r.id);
  const body = { phone: (p && p.phone) || r.phone || '', name: (p && p.name) || r.client || '', date: cqDateIso(r) };
  if (c.link) body.contact_id = c.link;
  try {
    const { data, error } = await sb.functions.invoke('complaint-chat', { body });
    if (error) throw error;
    if (data && data.error) throw new Error(data.error);
    c.chat = data || { status: 'none' };
  } catch (e) { console.error(e); c.chat = { status: 'error' }; }
  return c.chat;
}
// The line under the stage bar: the first thing a complaint does is look for her in respond.io.
async function cqRioStatus(r) {
  const chat = await cqChat(r);
  const el = document.getElementById('cqRioLine');
  if (!el || cqOpen !== r.id) return;
  const how = chat.how === 'confirmed' ? 'The contact was confirmed by a person.' : 'Matched by her phone number.';
  const chans = Array.from(new Set((chat.messages || []).map(m => m.ch))).join(', ');
  const n = (chat.messages || []).length;
  const cands = (chat.candidates || []).filter(x => !cqCacheOf(r.id).skip.includes(x.id));
  el.innerHTML = chat.status === 'found'
    ? `<b>respond.io check:</b> <span class="cq-ch green">chat found</span> ${n ? cqNum(n) + ' message' + (n === 1 ? '' : 's') + ' around the complaint' + (chans ? ' on ' + cqEsc(chans) : '') + '. ' : 'No messages around the complaint date. '}${how}`
    : chat.status === 'possible' && cands.length
      ? `<b>respond.io check:</b> <span class="cq-ch amber">confirm it is her</span> ${cands.length} possible ${cands.length === 1 ? 'person' : 'people'} by name. Open the Conversation tab.`
      : chat.status === 'error'
        ? `<b>respond.io check:</b> <span class="cq-ch grey">did not load</span> Open the Conversation tab to try again.`
        : `<b>respond.io check:</b> <span class="cq-ch grey">not found</span> Searched by phone and by name. She may never have written to us.`;
  const tab = document.querySelector('.cq-tab[data-cqtab="chat"]');
  if (tab) tab.innerHTML = 'Conversation' + (chat.status === 'found' ? ' <span class="cq-ch green">found</span>' : chat.status === 'possible' && cands.length ? ' <span class="cq-ch amber">confirm</span>' : '');
}
function cqMsgTime(ts) { return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai' }); }
function cqMsgDay(ts) { return new Date(ts).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Dubai' }); }
// What she sent besides words: a photo shows in the chat (a tap opens it full size), a video or a voice note plays, anything else is a link to the file.
function cqAtt(a) {
  if (!a || !a.url || !/^https:\/\//i.test(a.url)) return '';
  const u = cqEsc(a.url);
  if (a.type === 'image') return `<a href="${u}" target="_blank" rel="noopener" class="cq-rlink"><img class="cq-rimg" src="${u}" alt="A photo she sent" loading="lazy"></a>`;
  if (a.type === 'video') return `<video class="cq-rimg" controls preload="none" src="${u}"></video>`;
  if (a.type === 'audio') return `<audio controls preload="none" src="${u}" style="max-width:100%"></audio>`;
  return `<a href="${u}" target="_blank" rel="noopener" class="cq-rlink">${cqEsc(a.name || 'Open the file')}</a>`;
}
function cqChatHtml(r, chat) {
  const box = cqCacheOf(r.id);
  const note = '<p class="cq-note">A look at her chat in respond.io, around the day of the complaint. Nothing here can be sent. Replies are made in respond.io.</p>';
  if (chat.status === 'error') return note + '<p class="cq-meta">The chat did not load. <button type="button" class="cq-link" data-cqretry="' + r.id + '">Try again</button></p>';
  if (chat.status === 'none') return note + '<div class="cq-box">No chat found. We searched by phone and by name in respond.io (WhatsApp, Instagram and Facebook). She may never have written to us.</div>';
  if (chat.status === 'possible') {
    const cands = (chat.candidates || []).filter(x => !box.skip.includes(x.id));
    if (!cands.length) return note + '<div class="cq-box">No chat found. Every possible person was marked as not her.</div>';
    return note + `<div class="cq-eye">Is this her in respond.io?</div>` + cands.map(x => `<div class="cq-box cq-cand"><div><b>${cqEsc(x.name || 'No name')}</b>${x.phone ? ', ' + cqEsc(x.phone) : ', no phone number'}${x.lifecycle ? ' <span class="cq-muted">' + cqEsc(x.lifecycle) + '</span>' : ''}${(x.tags || []).length ? '<div class="cq-sub2">' + (x.tags || []).slice(0, 5).map(cqEsc).join(', ') + '</div>' : ''}<div class="cq-sub2">Matched by name only, because Instagram and Facebook have no phone number.</div></div>
      <div class="cq-seq"><button type="button" class="cq-btn" data-cqyes="${x.id}" data-id="${r.id}">Yes, this is her</button><button type="button" class="cq-btn" data-cqno="${x.id}" data-id="${r.id}">Not her</button></div></div>`).join('');
  }
  const ct = chat.contact || {}, msgs = chat.messages || [];
  const chans = Array.from(new Set(msgs.map(m => m.ch)));
  let day = '';
  const body = msgs.length ? msgs.map(m => {
    const d = cqMsgDay(m.ts); let sep = '';
    if (d !== day) { day = d; sep = `<span class="cq-rday">${cqEsc(d)}</span>`; }
    return `${sep}<div class="cq-rb ${m.w === 'c' ? 'in' : 'out'}">${cqAtt(m.att)}${m.text ? cqText(m.text) : ''}<span class="cq-rbt">${m.w === 's' ? 'Tara Rose, ' : ''}${cqMsgTime(m.ts)}${chans.length > 1 ? ' · ' + cqEsc(m.ch) : ''}</span></div>`;
  }).join('') : '<p class="cq-meta" style="margin:8px">No messages around the date of the complaint.</p>';
  const initials = String(ct.name || '?').split(/\s+/).map(x => x[0]).slice(0, 2).join('').toUpperCase();
  return note + `<div class="cq-rio"><div class="cq-rhd"><span class="cq-rav">${cqEsc(initials)}</span><div class="cq-rwho"><b>${cqEsc(ct.name || 'No name')}</b><small>${cqEsc(ct.phone || 'No phone number')}</small></div>
      ${ct.status ? `<span class="cq-rpill">${cqEsc(String(ct.status).replace(/^./, c => c.toUpperCase()))}</span>` : ''}<span class="cq-rpill ghost">${cqEsc(ct.assignee || 'Unassigned')}</span></div>
    <div class="cq-rsub">${chans.length ? cqEsc(chans.join(', ')) : 'respond.io'}${(ct.tags || []).slice(0, 6).map(t => `<span class="cq-rtag">${cqEsc(t)}</span>`).join('')}</div>
    <div class="cq-rbody">${body}</div></div>
    ${box.link ? `<p class="cq-note" style="margin-top:8px">Confirmed as her by a person. <button type="button" class="cq-link" data-cqunlink="${r.id}">Not her after all</button></p>` : ''}`;
}
function cqProfileHtml(r, p) {
  if (!p) return '<p class="cq-meta">The profile did not load. Tap the tab to try again.</p>';
  const items = v => (v.items || []).map(i => `${cqEsc(i.desc || 'Service')}${i.st ? ' <span class="cq-muted">with ' + cqEsc(i.st) + '</span>' : ''}`).join('<br>') || '<span class="cq-muted">No service listed</span>';
  const visits = (p.recent || []).map(v => `<tr><td style="white-space:nowrap">${cqEsc(cqDay(v.date))}</td><td>${items(v)}</td></tr>`).join('');
  const others = p.others || [];
  return `<div class="cq-grid"><div>
      <div class="cq-eye">Who she is</div>
      <p class="cq-kv"><span>Name</span> ${cqEsc(p.name || r.client || '')}</p>
      <p class="cq-kv"><span>Phone</span> ${p.phone ? cqEsc(p.phone) : '<span class="cq-muted">None on file</span>'}</p>
      <p class="cq-kv"><span>Email</span> ${p.email ? cqEsc(p.email) : '<span class="cq-muted">' + (p.email_status === 'no email' ? 'No email on file' : 'None that is hers') + '</span>'}</p>
      <p class="cq-kv"><span>Branches</span> ${(p.branches || []).length ? (p.branches || []).map(b => cqEsc(cqBr(b))).join(', ') : '<span class="cq-muted">Not matched</span>'}</p>
      ${p.archived ? '<p class="cq-kv"><span class="cq-pill warn">Archived in Phorest</span></p>' : ''}
      ${p.on_phorest ? '' : '<p class="cq-kv cq-muted">She is not matched to a Phorest client, so there are no visits to show.</p>'}
      <div class="cq-ptiles">
        <button type="button" class="cq-ptile" data-cqgo="cqVisits" title="Shows her last visits"><b>${cqNum(p.visits)}</b><span>Visits</span></button>
        <button type="button" class="cq-ptile" data-cqgo="cqOthers" title="Shows her other complaints"><b>${cqNum(others.length)}</b><span>Other complaints</span></button>
        <div class="cq-ptile"><b>${p.last_visit ? cqEsc(cqDay(p.last_visit)) : 'None'}</b><span>Last visit${p.first_visit ? ', first ' + cqEsc(cqDay(p.first_visit)) : ''}</span></div>
      </div></div>
    <div><div class="cq-eye" id="cqOthers">Her other complaints</div>
      ${others.length ? `<table class="cq-t"><tr><th>Date</th><th>About</th><th>Where it is</th></tr>${others.map(o => `<tr><td style="white-space:nowrap">${cqEsc(cqDay(o.date))}</td><td>${cqEsc(CQ_TYPE[o.type] || o.type || 'Unclear')}${o.code ? ' <span class="cq-muted">' + cqEsc(o.code) + '</span>' : ''}</td><td>${o.status === 'open' ? 'Open' : 'Closed'}</td></tr>`).join('')}</table>` : '<p class="cq-kv cq-muted">No other complaints for this client.</p>'}
      <div class="cq-eye" id="cqVisits" style="margin-top:14px">Last visits in Phorest</div>
      ${visits ? `<table class="cq-t"><tr><th>Date</th><th>What she had</th></tr>${visits}</table>` : '<p class="cq-kv cq-muted">No visits on file.</p>'}</div></div>`;
}
async function cqTabShow(id, tab) {
  const box = document.getElementById('cqTabBody');
  if (!box) return;
  document.querySelectorAll('.cq-tab').forEach(b => b.classList.toggle('on', b.dataset.cqtab === tab));
  const r = cqRowById(id);
  if (!r) return;
  if (tab === 'complaint') { box.innerHTML = cqCard(r); return; }
  box.innerHTML = '<p class="cq-meta" style="padding:8px 2px">Loading…</p>';
  if (tab === 'client') {
    const c = cqCacheOf(id); if (c.err) { delete c.profile; c.err = false; }
    const p = await cqProfile(id);
    if (document.querySelector('.cq-tab.on')?.dataset.cqtab === 'client') box.innerHTML = cqProfileHtml(r, p);
  } else {
    const chat = await cqChat(r);
    if (document.querySelector('.cq-tab.on')?.dataset.cqtab === 'chat') box.innerHTML = cqChatHtml(r, chat);
  }
}
async function cqChatLink(id, contact) {
  const { error } = await sb.rpc('complaint_chat_link_set', { p_id: id, p_contact: contact });
  if (error) { console.error(error); return false; }
  const c = cqCacheOf(id); c.link = contact; delete c.chat;
  return true;
}

// The record's own view (Kate, 12 Nov 2026: "can it have its own opening? masikip, and nakakalito pag nasa pinaka baba"). A row used to open a card under itself at the foot of the list.
// Now it replaces the archive with the record, a Back button and previous and next through the page of complaints, and Back returns to the same place in the list.
let cqBackY = 0;
function cqRecOpen(id) {
  const r = cqRowById(id), rec = document.getElementById('cqRec'), main = document.getElementById('cqMain');
  if (!r || !rec || !main) return;
  if (!main.classList.contains('cq-gone')) cqBackY = window.scrollY;
  const rows = (cqList && cqList.rows) || [], i = rows.findIndex(x => x.id === id);
  cqOpen = id;
  const st = cqStage(r), pri = cqPri(r);
  rec.innerHTML = `<div class="cq-recbar"><button type="button" class="cq-btn" data-cqback="1">&larr; Back to the archive</button>
      <span class="cq-recpos">${i + 1} of ${rows.length} on this page <button type="button" class="cq-btn" data-cqnav="-1" aria-label="Previous complaint"${i <= 0 ? ' disabled' : ''}>&lsaquo;</button><button type="button" class="cq-btn" data-cqnav="1" aria-label="Next complaint"${i >= rows.length - 1 ? ' disabled' : ''}>&rsaquo;</button></span></div>
    <div class="cq-card cq-recbox">
      <h2 class="cq-rectitle">${cqEsc(cqMDY(r.date))} | ${cqEsc(r.branch || '')} | ${cqEsc(r.client || 'No name')} | ${cqEsc(CQ_TYPE[r.type] || 'Unclear')}</h2>
      <div class="cq-recchips"><span class="cq-ch ${cqFoundKey(r)}">${cqEsc(cqFound(r))}</span><span class="cq-ch ${st.tone}">${cqEsc(st.text)}</span><span class="cq-ch ${pri === 'high' ? 'red' : pri === 'mid' ? 'amber' : 'grey'}">${pri === 'high' ? 'High' : pri === 'mid' ? 'Mid' : 'Low'} priority</span>${r.code ? cqCodeChip(r) : ''}</div>
      ${cqRecord(r)}
    </div>`;
  main.classList.add('cq-gone'); rec.classList.remove('cq-gone');
  window.scrollTo(0, 0);
  cqRioStatus(r);
}
function cqRecClose() {
  const rec = document.getElementById('cqRec'), main = document.getElementById('cqMain');
  if (!rec || !main || rec.classList.contains('cq-gone')) return;
  rec.classList.add('cq-gone'); rec.innerHTML = '';
  main.classList.remove('cq-gone');
  cqOpen = 0;
  window.scrollTo(0, cqBackY);
}
function cqRecNav(d) {
  const rows = (cqList && cqList.rows) || [], i = rows.findIndex(x => x.id === cqOpen), n = rows[i + d];
  if (i >= 0 && n) cqRecOpen(n.id);
}

function cqToggle(row) {
  const id = Number(row.dataset.i);
  if (cqMode === 'main') { cqRecOpen(id); return; }
  const body = document.getElementById('cqBody');
  body.querySelectorAll('tr.cq-detrow').forEach(r => r.remove());
  body.querySelectorAll('tr.cq-row.on').forEach(r => r.classList.remove('on'));
  if (cqOpen === id) { cqOpen = 0; return; }
  const r = ((cqList && cqList.rows) || []).find(x => x.id === id);
  if (!r) return;
  cqOpen = id;
  row.classList.add('on');
  const det = document.createElement('tr');
  det.className = 'cq-detrow';
  det.innerHTML = `<td class="cq-det" colspan="${row.children.length}">${cqRecord(r)}</td>`;
  row.after(det);
  cqRioStatus(r);
}

// Which complaints reached Google: a Google review whose reviewer name is the client's full name, left on or after the complaint.
// A name match only (reviewers often post a first name), so "none found" is not proof there is no review.
function cqGoogle(r) {
  if (!r.g_date && r.g_manual) return `<span class="cq-pill"><a href="${cqEsc(r.g_manual)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Posted (logged)</a></span>`;
  if (!r.g_date) return '<span class="cq-muted">None found</span>';
  const txt = `${'★'.repeat(Math.max(0, Math.min(5, Number(r.g_stars) || 0)))} ${cqDay(r.g_date)}`;
  const low = Number(r.g_stars) > 0 && Number(r.g_stars) <= 3;
  const body = r.g_url ? `<a href="${cqEsc(r.g_url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${cqEsc(txt)}</a>` : cqEsc(txt);
  return `<span class="cq-pill${low ? ' warn' : ''}">${body}</span>`;
}

// ── Follow-through (Kate, 26 Oct 2026, from Belle's review of the page) ──
// Reply to the client within 2 days of the complaint and close it within 7; the database says which are overdue (cq_flag) and the list shows it.
// A colour complaint is closed by the revisit, not by the promise of one. Screenshots and photos go in the private bucket complaint-files.
const CQ_NEEDS_REVISIT = ['free_redo', 'adjusted_same_visit', 'free_service_or_product', 'apology_or_explanation', 'discount_or_credit', 'escalated_followup'];
// Who checks one (Kate, 26 Oct 2026): Mette and Coach Emma see every complaint; the technical ones go to the educators. Hair: Emma W and Ashleigh.
// Beauty: not decided yet, so it says so rather than guessing.
const CQ_TECH = { colour_result: 'hair', cut_result: 'hair', treatment_result: 'both', nail_service: 'beauty', skin_reaction_or_injury: 'beauty' };
function cqChecker(type) {
  const k = CQ_TECH[type];
  if (k === 'hair') return 'Emma W and Ashleigh. Mette and Coach Emma see it too.';
  if (k === 'beauty') return 'Mona Soba (to be confirmed). Mette and Coach Emma see it too.';
  if (k === 'both') return 'Emma W and Ashleigh if it is hair, Mona Soba (to be confirmed) if it is beauty. Mette and Coach Emma see it too.';
  return 'Mette and Coach Emma.';
}
const cqDubai = ts => ts ? new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Dubai' }) : '';
const cqFlagPill = r => r.flag === 'overdue'
  ? '<span class="cq-flag over" title="Past the target time: no reply by the end of day 2, or not closed by the end of day 7."><i></i>Overdue</span>'
  : (r.flag === 'pending' ? '<span class="cq-flag pend" title="Still waiting for an update or a decision. Reply by day 2, close by day 7."><i></i>Pending action</span>' : '');
const cqDaysText = r => r.days_open == null ? '' : (r.status === 'open'
  ? (r.days_open === 0 ? 'Opened today' : `Day ${r.days_open} open`)
  : `Closed in ${r.days_open} day${r.days_open === 1 ? '' : 's'}`);
const CQ_HAPPY = { yes: 'She was happy', no: 'She was not happy', unsure: 'Not sure she was happy' };
const cqKB = n => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';

const CQ_FILE_OK = /^(image\/(jpeg|png|webp|gif|heic)|application\/pdf|text\/plain)$/;
// Uploads each file to the bucket, then registers it on the complaint. Returns how many went and why the rest did not.
async function cqUpload(id, files) {
  const fails = []; let ok = 0, n = 0;
  for (const f of Array.from(files || [])) {
    const type = f.type || (/\.heic$/i.test(f.name) ? 'image/heic' : '');
    if (!CQ_FILE_OK.test(type)) { fails.push(`${f.name}: only photos, PDF or text`); continue; }
    if (f.size > 10 * 1024 * 1024) { fails.push(`${f.name}: over 10 MB`); continue; }
    const safe = f.name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80) || 'file';
    const path = `${id}/${Date.now()}-${n++}-${safe}`;
    try {
      const up = await sb.storage.from('complaint-files').upload(path, f, { contentType: type, upsert: false });
      if (up.error) throw up.error;
      const { error } = await sb.rpc('client_complaint_add_file', { p_id: id, p_path: path, p_name: f.name, p_size: f.size, p_mime: type });
      if (error) throw error;
      ok++;
    } catch (e) { console.error(e); fails.push(`${f.name}: ${(e && e.message) || 'did not upload'}`); }
  }
  return { ok, fails };
}
// Opens a file in a new tab through a 5 minute link. The tab is opened on the click so the browser does not block it.
async function cqOpenFile(path) {
  const w = window.open('', '_blank'), msg = document.getElementById('cqu-msg');
  try {
    const { data, error } = await sb.storage.from('complaint-files').createSignedUrl(path, 300);
    if (error || !data) throw error || new Error('no link');
    if (w) w.location.href = data.signedUrl;
  } catch (e) { console.error(e); if (w) w.close(); if (msg) msg.textContent = 'The file did not open. Try again.'; }
}
async function cqReopenRow(id) {
  cqOpen = 0;
  await Promise.all([cqLoadList(), (typeof cqLoadFlags === 'function' ? cqLoadFlags() : null)]);
  const row = document.querySelector(`#cqBody tr.cq-row[data-i="${id}"]`);
  if (row) cqToggle(row);
}
async function cqAddFiles(id) {
  const inp = document.getElementById('cqu-files'), msg = document.getElementById('cqu-msg');
  if (!inp || !inp.files || !inp.files.length) { if (msg) msg.textContent = 'Choose the photos or screenshots first.'; return; }
  if (msg) msg.textContent = 'Uploading…';
  const r = await cqUpload(id, inp.files);
  await cqReopenRow(id);
  const m2 = document.getElementById('cqu-msg');
  if (m2) m2.textContent = r.fails.length ? `Added ${r.ok}. Not added: ${r.fails.join('; ')}` : `Added ${r.ok} file${r.ok === 1 ? '' : 's'}.`;
}
async function cqRemoveFile(fileId, cid) {
  if (!window.confirm('Remove this file from the complaint?')) return;
  try {
    const { data, error } = await sb.rpc('client_complaint_remove_file', { p_file_id: fileId });
    if (error) throw error;
    if (!data) { const m = document.getElementById('cqu-msg'); if (m) m.textContent = 'Only the person who added a file can remove it.'; return; }
    try { await sb.storage.from('complaint-files').remove([data]); } catch (e) { /* the row is gone; a stray file in the bucket is harmless */ }
    await cqReopenRow(cid);
  } catch (e) { console.error(e); const m = document.getElementById('cqu-msg'); if (m) m.textContent = (e && e.message) || 'It did not remove. Try again.'; }
}
function cqRevisitShow() {
  const box = document.getElementById('cqu-rv'), sel = document.getElementById('cqu-res');
  if (box && sel) box.hidden = !(box.dataset.type === 'colour_result' && CQ_NEEDS_REVISIT.includes(sel.value));
}

function cqFollow(r) {
  const ups = (r.updates || []).map(u => {
    const tag = u.status === 'resolved' ? ` <span class="cq-pill">Resolved: ${cqEsc(CQ_RES[u.res] || u.res || '')}</span>`
      : (u.status === 'open' ? ' <span class="cq-pill warn">Reopened</span>' : (u.status === 'responded' ? ' <span class="cq-pill">Client contacted</span>' : ''));
    return `<p class="cq-kv"><span>${cqEsc(cqDay(u.at))}, ${cqEsc(u.by || '')}</span>${tag} ${cqText(u.note || '')}</p>`;
  }).join('');
  const ropts = ['<option value="">How it ended (needed to mark it resolved)</option>'].concat(Object.keys(CQ_RES).filter(k => k !== 'unclear' && k !== 'open')
    .map(k => `<option value="${k}">${cqEsc(CQ_RES[k])}</option>`)).join('');
  const isOpen = r.status === 'open';
  const today = cqToday();
  const files = (r.files || []).map(f => `<li><button type="button" class="cq-link" data-file="${cqEsc(f.path)}">${cqEsc(f.name)}</button> <span class="cq-muted">${cqEsc(cqKB(Number(f.size) || 0))}, ${cqEsc(f.by || '')}, ${cqEsc(cqDubai(f.at))}</span>`
    + ` <button type="button" class="cq-btn" data-delfile="${f.id}" data-cid="${r.id}">Remove</button></li>`).join('');
  return `<div style="grid-column:1/-1">
    <div class="cq-eye">Follow-up ${isOpen ? '<span class="cq-pill warn">Open</span>' : '<span class="cq-pill">Resolved</span>'} ${isOpen ? cqFlagPill(r) : ''}</div>
    ${ups || '<p class="cq-kv cq-muted">No follow-up written yet.</p>'}
    ${cqDupBlock(r)}
    <div class="cq-eye" style="margin-top:10px">Screenshots and photos</div>
    ${files ? `<ul class="cq-files">${files}</ul>` : '<p class="cq-kv cq-muted">None added yet.</p>'}
    <div class="cq-chk-row"><input type="file" id="cqu-files" multiple accept="image/*,application/pdf,.txt" aria-label="Choose photos or screenshots"><button type="button" class="cq-btn" data-upfiles="${r.id}">Add files</button></div>
    <div class="cq-form" style="margin-top:8px">
      <label class="wide">Add an update<textarea id="cqu-note" rows="2" maxlength="1000" placeholder="Who you spoke to, what was agreed, what was done"></textarea></label>
      <label>Responsible for closing it<input id="cqu-resp" class="cq-in" maxlength="80" list="cqRespList" autocomplete="off" value="${cqEsc(r.responsible || '')}"></label>
      <label>Why it is still pending${isOpen ? '' : ' (cleared when resolved)'}<input id="cqu-why" class="cq-in" maxlength="300" autocomplete="off" value="${cqEsc(r.pending_reason || '')}"${isOpen ? '' : ' disabled'}></label>
      <label>${isOpen ? 'Mark it resolved with' : 'Reopen it, or add a note'}<select id="cqu-res" class="cq-sel"${isOpen ? '' : ' disabled'}>${ropts}</select></label>
    </div>
    ${r.type === 'colour_result' && isOpen ? `<div class="cq-form" id="cqu-rv" data-type="colour_result" hidden>
      <label class="wide cq-muted">A colour complaint is closed by the revisit, not by the promise of one: once she has come back and agreed.</label>
      <label>Date she came back<input id="cqu-rd" class="cq-in" type="date" min="${cqEsc(String(r.date || '').slice(0, 10))}" max="${today}"></label>
      <label>Was she happy?<select id="cqu-rh" class="cq-sel"><option value="">Pick one</option><option value="yes">Yes</option><option value="no">No</option><option value="unsure">Not sure</option></select></label>
      <label class="wide">What the stylist did at the revisit<input id="cqu-rn" class="cq-in" maxlength="400" autocomplete="off"></label>
    </div>` : ''}
    <div class="cq-bar"><button type="button" class="cq-btn" data-up="note" data-id="${r.id}">Add update</button>
      ${isOpen && !r.first_response_at ? `<button type="button" class="cq-btn" data-up="responded" data-id="${r.id}" title="Starts the 2 day reply clock off: the client was contacted, or a solution was offered">Client contacted, solution offered</button>` : ''}
      ${isOpen ? `<button type="button" class="cq-btn pri" data-up="resolved" data-id="${r.id}">Mark resolved</button>` : `<button type="button" class="cq-btn" data-up="open" data-id="${r.id}">Reopen</button>`}
      <span id="cqu-msg" class="cq-msg err" aria-live="polite"></span></div>
  </div>`;
}

async function cqUpdate(id, kind) {
  const val = i => ((document.getElementById(i) || {}).value || '').trim();
  const msg = document.getElementById('cqu-msg');
  const say = t => { if (msg) msg.textContent = t; };
  const note = val('cqu-note'), res = val('cqu-res');
  const r = ((cqList && cqList.rows) || []).find(x => x.id === id) || {};
  if (kind === 'resolved' && !res) return say('Pick how it ended, then mark it resolved.');
  if (kind !== 'resolved' && note.length < 2) return say('Write the update first.');
  const needRv = kind === 'resolved' && r.type === 'colour_result' && CQ_NEEDS_REVISIT.includes(res);
  if (needRv && (!val('cqu-rd') || !val('cqu-rh') || val('cqu-rn').length < 3))
    return say('A colour complaint is closed by the revisit: the date she came back, whether she was happy and what the stylist did.');
  say('Saving…');
  try {
    const args = { p_id: id, p_note: note, p_resolution: kind === 'resolved' ? res : '', p_status: kind, p_responsible: val('cqu-resp'), p_pending_reason: kind === 'resolved' ? '' : val('cqu-why') };
    if (needRv) Object.assign(args, { p_revisit_date: val('cqu-rd'), p_revisit_happy: val('cqu-rh'), p_revisit_note: val('cqu-rn') });
    const { error } = await sb.rpc('client_complaint_update', args);
    if (error) throw error;
    cqOpen = 0;
    await Promise.all([cqLoadSummary(), cqLoadList(), (typeof cqLoadFlags === 'function' ? cqLoadFlags() : null)]);
    const row = document.querySelector(`#cqBody tr.cq-row[data-i="${id}"]`);
    if (row) cqToggle(row);
  } catch (e) { console.error(e); say((e && e.message) || 'It did not save. Try again.'); }
}

// The complaint code (Kate, 29 Oct 2026): CMP-SAA-20261029-01, the one everybody says out loud. Shown with a Copy button wherever a complaint is.
const cqCodeChip = r => r.code ? `<span class="cq-code">${cqEsc(r.code)} <button type="button" data-copy="${cqEsc(r.code)}">Copy</button></span>` : '';
async function cqCopy(btn) {
  const text = btn.dataset.copy || '';
  try { await navigator.clipboard.writeText(text); } catch (e) {
    const ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e2) { /* nothing to do */ }
    ta.remove();
  }
  const was = btn.textContent; btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = was; }, 1400);
}
// Link as a duplicate (Kate, 29 Oct 2026): the record stays on file, is not counted twice and drops out of the pipeline.
async function cqDupAfter(id) {
  cqOpen = 0;
  await Promise.all([cqLoadSummary(), cqLoadList(), (typeof cqLoadFlags === 'function' ? cqLoadFlags() : null)]);
  const row = document.querySelector(`#cqBody tr.cq-row[data-i="${id}"]`);
  if (row) cqToggle(row);
}
async function cqDupLink(id) {
  const inp = document.getElementById('cqu-dup'), msg = document.getElementById('cqu-dupmsg');
  const say = t => { if (msg) msg.textContent = t; };
  const code = ((inp || {}).value || '').trim();
  if (code.length < 8) return say('Write the code of the first complaint, for example CMP-SAA-20261029-01.');
  say('Linking…');
  try {
    const { data, error } = await sb.rpc('cmp_link_duplicate', { p_id: id, p_of: code });
    if (error) throw error;
    if (!data || !data.ok) return say(data && data.why ? data.why.charAt(0).toUpperCase() + data.why.slice(1) + '.' : 'It did not link. Try again.');
    await cqDupAfter(id);
  } catch (e) { console.error(e); say((e && e.message) || 'It did not link. Try again.'); }
}
async function cqDupUnlink(id) {
  const msg = document.getElementById('cqu-dupmsg');
  try {
    const { data, error } = await sb.rpc('cmp_unlink_duplicate', { p_id: id });
    if (error) throw error;
    if (!data || !data.ok) { if (msg) msg.textContent = data && data.why ? data.why.charAt(0).toUpperCase() + data.why.slice(1) + '.' : 'It did not unlink.'; return; }
    await cqDupAfter(id);
  } catch (e) { console.error(e); if (msg) msg.textContent = (e && e.message) || 'It did not unlink. Try again.'; }
}
function cqDupBlock(r) {
  if (!r.by) return '';
  const ticket = `<a class="cq-link" href="/hub/complaint?cid=${r.id}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Open the complaint page</a> <span class="cq-muted">(people, assign, notes)</span>`;
  if (r.duplicate_of) return `<div class="cq-eye" style="margin-top:10px">Duplicate</div>
    <p class="cq-kv">Linked as a duplicate of <b>${cqEsc(r.duplicate_code || 'another complaint')}</b>. It stays on file and is not counted twice. <button type="button" class="cq-btn" data-unlink="${r.id}">Unlink</button> <span id="cqu-dupmsg" class="cq-msg err" aria-live="polite"></span></p>
    <p class="cq-kv">${ticket}</p>`;
  return `<div class="cq-eye" style="margin-top:10px">Is it the same complaint as another one?</div>
    <div class="cq-chk-row"><input id="cqu-dup" class="cq-in" maxlength="30" autocomplete="off" placeholder="CMP-SAA-20261029-01" aria-label="Code of the first complaint"> <button type="button" class="cq-btn" data-dup="${r.id}">Link as duplicate</button> <span id="cqu-dupmsg" class="cq-msg err" aria-live="polite"></span></div>
    <p class="cq-kv cq-muted">It stays on file, is not counted twice and leaves the pipeline.</p>
    <p class="cq-kv">${ticket}</p>`;
}

function cqCard(r) {
  const conf = r.confidence === 'low' ? '<span class="cq-pill warn">Unsure</span>' : '';
  const logged = !!r.by, open = r.status === 'open';
  const dates = logged ? `
      <p class="cq-kv"><span>Date of the appointment</span> ${cqEsc(cqDay(r.date))}</p>
      <p class="cq-kv"><span>Date of the complaint</span> ${cqEsc(cqDay(r.complaint_date))}</p>
      ${open ? `<p class="cq-kv"><span>Reply</span> ${r.first_response_at ? 'Done on ' + cqEsc(cqDubai(r.first_response_at)) : 'Due by ' + cqEsc(cqDay(r.reply_due)) + ' (2 days)'}</p>
      <p class="cq-kv"><span>Close by</span> ${cqEsc(cqDay(r.close_due))} (7 days) ${cqFlagPill(r)}</p>` : ''}
      ${r.resolved_at ? `<p class="cq-kv"><span>Date resolved</span> ${cqEsc(cqDubai(r.resolved_at))}${r.days_open != null ? ' (' + cqEsc(cqDaysText(r)) + ')' : ''}</p>` : ''}`
    : `<p class="cq-kv"><span>Date</span> ${cqEsc(cqDay(r.date))}</p>`;
  const people = logged ? `
      ${r.phone ? `<p class="cq-kv"><span>Mobile</span> <a href="tel:${cqEsc(String(r.phone).replace(/[^0-9+]/g, ''))}" onclick="event.stopPropagation()">${cqEsc(r.phone)}</a></p>` : ''}
      <p class="cq-kv"><span>Checks it</span> ${cqEsc(cqChecker(r.type))}</p>
      <p class="cq-kv"><span>Responsible</span> ${r.responsible ? cqEsc(r.responsible) : '<span class="cq-muted">Nobody named yet</span>'}</p>
      ${open ? `<p class="cq-kv"><span>Why pending</span> ${r.pending_reason ? cqEsc(r.pending_reason) : '<span class="cq-muted">Not written yet</span>'}</p>` : ''}` : '';
  const revisit = (logged && r.revisit_date) ? `<p class="cq-kv"><span>Revisit</span> ${cqEsc(cqDay(r.revisit_date))}. ${cqEsc(CQ_HAPPY[r.revisit_happy] || '')}${r.revisit_note ? '. ' + cqEsc(r.revisit_note) : ''}</p>` : '';
  return `<div class="cq-grid">
    <div>
      <div class="cq-eye">Where and who</div>
      ${r.code ? `<p class="cq-kv"><span>Code</span> ${cqCodeChip(r)}</p>` : ''}
      <p class="cq-kv"><span>Branch</span> ${cqEsc(cqBr(r.branch))}${r.src === 'client' ? ' <span class="cq-muted">(the branch the client sits under)</span>' : ''}</p>
      ${dates}
      ${people}
      ${r.stylists ? `<p class="cq-kv"><span>Stylist</span> ${cqEsc(r.stylists)}</p>` : ''}
      ${r.services ? `<p class="cq-kv"><span>Services that day</span> ${cqEsc(r.services)}</p>` : ''}
      ${r.fee != null && r.src === 'visit' ? `<p class="cq-kv"><span>Charged that visit</span> AED ${cqNum(r.fee)}</p>` : ''}
      ${r.handled_by ? `<p class="cq-kv"><span>Handled by</span> ${cqEsc(r.handled_by)}</p>` : ''}
      <p class="cq-kv"><span>Google review</span> ${(r.g_date || r.g_manual) ? cqGoogle(r) : 'None found under this name'}</p>
      ${r.by ? `<p class="cq-kv"><span>Logged by</span> ${cqEsc(r.by)}${r.by_at ? ' on ' + cqEsc(cqDubai(r.by_at)) : ''} <button type="button" class="cq-btn" data-del="${r.id}" style="margin-left:8px">Remove</button></p>` : `<p class="cq-kv"><span>Phorest ID</span> ${cqEsc(r.phorest_id)}</p>`}
    </div>
    <div>
      <div class="cq-eye">What was written ${conf}</div>
      <div class="cq-orig">${cqText(r.note)}</div>
      <div class="cq-eye">How it was read</div>
      <p class="cq-kv"><span>Kind</span> ${cqEsc(CQ_TYPE[r.type] || r.type || 'Unclear')}</p>
      <p class="cq-kv"><span>Problem</span> ${cqEsc(r.detail || 'Not stated')}</p>
      <p class="cq-kv"><span>Resolution</span> ${open ? 'Still open' : cqEsc(CQ_RES[r.resolution] || r.resolution || 'Unclear')}${r.resolution_detail ? ': ' + cqEsc(r.resolution_detail) : ''}</p>
      ${revisit}
    </div>
    ${r.by ? cqFollow(r) : ''}
  </div>`;
}

function cqBars(rows, labelOf, total, colour) {
  if (!rows.length) return '<p class="cq-meta">Nothing here.</p>';
  const max = Math.max(...rows.map(r => r.n), 1);
  return `<div class="cq-bars">${rows.map(r => `<div>${cqEsc(labelOf(r))}</div>
    <div class="cq-trk" role="img" aria-label="${cqEsc(labelOf(r))}: ${r.n}" data-tip="${cqEsc(labelOf(r))}: ${cqNum(r.n)} complaint${r.n === 1 ? '' : 's'} (${cqPct(r.n, total)})"><div class="cq-seg" style="width:${(100 * r.n / max).toFixed(1)}%;background:${colour}"></div></div>
    <div class="cq-val">${cqNum(r.n)} · ${cqPct(r.n, total)}</div>`).join('')}</div>`;
}

function cqYears(rows) {
  if (!rows.length) return '<p class="cq-meta">Nothing here.</p>';
  const byYr = {};
  rows.forEach(r => { (byYr[r.yr] = byYr[r.yr] || { yr: r.yr, tot: 0, seg: [] }); byYr[r.yr].tot += r.n; byYr[r.yr].seg.push(r); });
  const yrs = Object.values(byYr).sort((a, b) => a.yr - b.yr);
  const max = Math.max(...yrs.map(y => y.tot), 1);
  const used = Array.from(new Set(rows.map(r => r.branch)));
  const order = ['SAA', 'KCA', 'MC', 'AQ', 'MRY', 'FRA', 'BAH'].filter(b => used.includes(b));
  const legend = cqPicked().length !== 1
    ? `<div class="cq-legend">${order.map(b => `<span><i style="background:${CQ_COLOUR[b] || '#999'}"></i>${cqEsc(cqBr(b))}</span>`).join('')}</div>` : '';
  const bars = yrs.map(y => {
    const segs = order.map(b => { const s = y.seg.find(x => x.branch === b); return s ? `<div class="cq-seg" data-tip="${cqEsc(cqBr(b))}, ${y.yr}: ${cqNum(s.n)} complaint${s.n === 1 ? '' : 's'} (${cqPct(s.n, y.tot)} of the year)" style="width:${(100 * s.n / max).toFixed(1)}%;background:${CQ_COLOUR[b] || '#999'}"></div>` : ''; }).join('');
    const parts = order.map(b => { const s = y.seg.find(x => x.branch === b); return s ? `${cqBr(b)} ${s.n}` : ''; }).filter(Boolean).join(', ');
    return `<div>${y.yr}</div><div class="cq-trk" role="img" aria-label="${y.yr}: ${y.tot} (${cqEsc(parts)})" data-tip="${y.yr}: ${cqNum(y.tot)} complaint${y.tot === 1 ? '' : 's'}">${segs}</div><div class="cq-val">${cqNum(y.tot)}</div>`;
  }).join('');
  return `${legend}<div class="cq-bars yrs">${bars}</div>`;
}

function cqPaintSummary() {
  const el = document.getElementById('cqTop');
  if (!el || !cqSum) return;
  const t = cqSum.tiles || {}, total = Number(t.complaints || 0);
  const picked = cqPicked();
  const where = picked.length ? ' at ' + picked.map(cqBr).join(', ') : '';
  const tiles = [
    [cqNum(t.complaints), 'complaints in visit notes' + where],
    ...(Number(t.open_now) > 0 ? [[cqNum(t.open_now), 'logged complaints still open']] : []),
    [cqNum(t.since_2025), 'of them since 1 Jan 2025'],
    [cqNum(t.clients), 'different clients'],
    [cqNum(t.repeat_clients), 'clients with 2 or more'],
    ...(cqWindowed() ? [] : [[cqNum(t.profile_flags), 'more on client cards, undated']]),
    [cqNum(t.low_confidence), 'unsure, note too short']].concat(cqSum.google ? [[cqNum(cqSum.google.on_google), 'also left a Google review (same name)']] : []
  ).map(([b, s]) => `<div class="cq-tile"><b>${b}</b><span>${cqEsc(s)}</span></div>`).join('');
  const doEl = document.getElementById('cqDo');
  if (doEl) doEl.innerHTML = Number(t.open_now) > 0
    ? `Open the <button type="button" class="cq-link" id="cqOpenNow">${cqNum(t.open_now)} complaint${Number(t.open_now) === 1 ? '' : 's'} still open</button>. Overdue replies come first.`
    : 'Nothing is open. Every logged complaint has an ending.';
  const on = document.getElementById('cqOpenNow');
  if (on) on.addEventListener('click', () => {
    CQ.src = 'logged'; CQ.status = 'open'; CQ.page = 0; cqOpen = 0;
    ['cqS', 'cqSt'].forEach(id => { const el = document.getElementById(id); if (el) el.value = id === 'cqS' ? 'logged' : 'open'; });
    cqFtogLabel(); cqLoadList();
    const l = document.getElementById('cq-list'); if (l) l.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  const brows = (cqSum.branches || []).map(b => {
    const rate = b.noted_since_2024 ? (1000 * b.since_2024 / b.noted_since_2024).toFixed(1) : 'n/a';
    return `<tr class="cq-br${picked.includes(b.branch) ? ' on' : ''}">
      <td><b>${cqEsc(cqBr(b.branch))}</b></td><td class="n">${cqNum(b.complaints)}</td><td class="n">${cqNum(b.since_2025)}</td><td class="n hm">${rate}</td>
      <td class="n">${cqNum(b.free_redo)}</td><td class="n hm">${cqNum(b.refund)}</td><td class="n hm">${cqNum(b.discount_credit)}</td><td class="n hm">${cqNum(b.free_service)}</td>
      <td class="n hm">${cqNum(b.adjusted)}</td><td class="n hm">${cqNum(b.talked)}</td><td class="n hm">${cqNum(b.lost)}</td><td class="n">${cqNum(b.no_outcome)}</td></tr>`;
  }).join('');
  const types = (cqSum.types || []).map(r => ({ n: r.n, k: r.type }));
  const ress = (cqSum.resolutions || []).map(r => ({ n: r.n, k: r.resolution }));
  el.innerHTML = `<div class="cq-tiles">${tiles}</div>
    <div class="cq-card" id="cq-branch"><h2>By branch</h2>
      <p class="cq-note">Visit notes only. Every branch is shown here; pick branches in the filter at the top to narrow the rest of the page. The rate is complaints per 1,000 visits that had a note, since 1 Jan 2024, so branches that write fewer notes are not flattered.</p>
      <div style="overflow-x:auto"><table class="cq-t"><tr><th>Branch</th><th class="n">Complaints</th><th class="n">Since 2025</th><th class="n hm">Per 1,000 noted</th><th class="n">Free redo</th><th class="n hm">Refund</th><th class="n hm">Discount or credit</th><th class="n hm">Free service</th><th class="n hm">Fixed on the day</th><th class="n hm">Talked or escalated</th><th class="n hm">Client lost</th><th class="n">No outcome</th></tr>${brows}</table></div></div>
    <div class="cq-card" id="cq-year"><h2>By year</h2><p class="cq-note">Complaints by the year of the visit${picked.length === 1 ? '' : ', split by branch'}. The early years are thin because few notes were typed then.</p>${cqYears(cqSum.years || [])}</div>
    <div class="cq-card" id="cq-kind"><h2>What the complaint was about</h2>${cqBars(types, r => CQ_TYPE[r.k] || r.k, total, 'var(--accent)')}</div>
    <div class="cq-card" id="cq-res"><h2>How it was resolved</h2><p class="cq-note">What the note says happened. No outcome written means the problem is on record but the note does not say how it ended.</p>${cqBars(ress, r => CQ_RES[r.k] || r.k, total, 'var(--accent)')}</div>`;
}

function cqPaintList() {
  const body = document.getElementById('cqBody'), meta = document.getElementById('cqMeta');
  if (!body || !cqList) return;
  const wcard = document.getElementById('cq-list'); if (wcard) wcard.classList.remove('cq-wait');
  const rows = cqList.rows || [], total = Number(cqList.total || 0);
  const from = total ? CQ.page * CQ.size + 1 : 0, to = CQ.page * CQ.size + rows.length;
  if (meta) meta.textContent = total ? `${cqNum(from)} to ${cqNum(to)} of ${cqNum(total)} complaint${total === 1 ? '' : 's'}` : '';
  if (!rows.length) { body.innerHTML = '<p class="cq-meta" style="padding:10px 4px">No complaint matches that.</p>'; return; }
  const log = cqMode === 'log';
  // Log a Complaint (Belle, 26 Oct 2026): the dates in their own columns (appointment, complaint, resolved), the resolution beside them, and what is
  // overdue or pending first. Client Complaints keeps the columns it had.
  const tr = rows.map(r => log ? `<tr class="cq-row" tabindex="0" role="button" aria-label="Open this complaint in a new tab" data-i="${r.id}">
      <td class="hm" style="white-space:nowrap">${cqEsc(cqDay(r.date))}</td>
      <td class="hm" style="white-space:nowrap">${cqEsc(cqDay(r.complaint_date))}</td>
      <td><b><a class="cq-rowlink" href="${cqEsc(cqRecordUrl(r))}" target="_blank" rel="noopener">${cqEsc(r.client || 'No name')}</a></b><div style="margin-top:3px">${cqCodeChip(r)}</div><div class="cq-sub2">${cqEsc(cqBr(r.branch))}${r.phone ? ' · ' + cqEsc(r.phone) : ''}</div>
        <div class="cq-sub2 sm">Appointment ${cqEsc(cqDay(r.date))}<br>Complaint ${cqEsc(cqDay(r.complaint_date))}</div></td>
      <td>${cqEsc(r.detail || 'Not stated')}<div class="cq-muted" style="font-size:12px">${cqEsc(CQ_TYPE[r.type] || '')}</div></td>
      <td>${r.duplicate_of ? `<span class="cq-pill">Duplicate of ${cqEsc(r.duplicate_code || 'another')}</span>` : r.status === 'open' ? cqFlagPill(r) : '<span class="cq-pill">Resolved</span>'}
        <div class="cq-sub2${r.flag === 'overdue' ? ' late' : ''}">${cqEsc(cqDaysText(r))}${r.status === 'open' && !r.first_response_at ? (r.flag === 'overdue' ? ' · reply to her today' : ' · waiting for a first reply') : ''}</div>
        ${(window.CmpTriage && window.CmpTriage.on && r.holder) ? `<div class="cq-sub2">${cqEsc(r.holder.charAt(0).toUpperCase() + r.holder.slice(1))}</div>` : ''}
        ${r.status === 'open' && !r.duplicate_of ? `<div class="cq-sub2">${r.responsible ? 'Replying: ' + cqEsc(r.responsible) : 'Who will reply? Add a name on the complaint page'}${r.pending_reason ? ' · ' + cqEsc(r.pending_reason) : (r.flag ? ' · why is it waiting? Add a reason' : '')}</div>` : ''}</td>
      <td class="hm" style="white-space:nowrap">${r.resolved_at ? cqEsc(cqDubai(r.resolved_at)) : '<span class="cq-muted">Open</span>'}</td>
      <td class="hm">${r.status === 'open' ? '<span class="cq-muted">Not yet</span>' : cqEsc(CQ_RES[r.resolution] || '')}${r.revisit_date ? `<div class="cq-sub2">${cqEsc(CQ_HAPPY[r.revisit_happy] || '')}</div>` : ''}</td>
    </tr>` : `<tr class="cq-row p-${cqPri(r)}" tabindex="0" role="button" aria-label="Open this complaint" data-i="${r.id}">
      <td><span class="cq-nm">${cqEsc(cqMDY(r.date))} | ${cqEsc(r.branch || '')} | ${cqEsc(r.client || 'No name')} | ${cqEsc(CQ_TYPE[r.type] || 'Unclear')}</span><span class="cq-qt">${cqEsc(r.detail || r.note || 'Not stated')}${r.confidence === 'low' ? ' (unsure)' : ''}</span></td>
      <td class="hm"><span class="cq-ch ${cqFoundKey(r)}">${cqEsc(cqFound(r))}</span></td>
      <td><span class="cq-ch ${cqStage(r).tone}">${cqEsc(cqStage(r).text)}</span></td>
    </tr>`).join('');
  const th = (k, label, cls) => {
    const on = CQ.sort === k;
    return `<th class="cq-sort${cls ? ' ' + cls : ''}" tabindex="0" role="columnheader button" data-s="${k}"${on ? ` aria-sort="${CQ.dir === 'asc' ? 'ascending' : 'descending'}"` : ''} title="Sort by ${label.toLowerCase()}">${label}<span class="ar" aria-hidden="true">${on ? (CQ.dir === 'asc' ? '▲' : '▼') : '↕'}</span></th>`;
  };
  const sizes = CQ_SIZES.map(n => `<option value="${n}"${CQ.size === n ? ' selected' : ''}>${n}</option>`).join('');
  const head = log
    ? `${th('date', 'Appointment', 'hm')}${th('cdate', 'Complaint', 'hm')}${th('client', 'Client')}${th('detail', 'What happened')}${th('priority', 'Status')}${th('resolved', 'Date resolved', 'hm')}${th('resolution', 'Resolution', 'hm')}`
    : `${th('date', 'Complaint')}<th class="hm">Found in</th>${th('resolution', 'Where it is now')}`;
  body.innerHTML = `<table class="cq-t${log ? ' cq-lg' : ' cq-arc'}"><tr>${head}</tr>${tr}</table>
    <div class="cq-pager"><label class="cq-size">Show <select id="cqN" class="cq-sel" aria-label="Complaints per page">${sizes}</select> per page</label><button type="button" class="cq-btn" data-pg="-1"${CQ.page === 0 ? ' disabled' : ''}>Previous</button>
    <button type="button" class="cq-btn" data-pg="1"${to >= total ? ' disabled' : ''}>Next</button></div>`;
}

async function cqLoadSummary() {
  const el = document.getElementById('cqTop');
  if (!el) return;
  const seq = ++cqSeqS;
  try {
    const [{ data, error }, g] = await Promise.all([
      sb.rpc('client_complaints_summary', { p_branch: cqBranch(), ...cqWin() }),
      sb.rpc('client_complaints_google_count', { p_branch: cqBranch(), ...cqWin() })
    ]);
    if (error) throw error;
    if (seq !== cqSeqS) return;
    cqSum = data;
    if (cqSum && g && !g.error) cqSum.google = g.data;
    cqPaintSummary();
  } catch (e) {
    console.error(e);
    if (seq !== cqSeqS) return;
    el.innerHTML = '<p class="cq-meta" style="padding:10px 4px">The complaints did not load. Refresh to try again.</p>';
  }
}

const cqListArgs = (limit, offset) => ({
  p_branch: cqBranch(), p_src: cqSrc(), p_type: CQ.type, p_resolution: CQ.res, p_q: CQ.q.trim(), p_low: CQ.low,
  p_limit: limit, p_offset: offset, p_sort: CQ.sort, p_dir: CQ.dir, p_google: CQ.google, p_status: ['overdue', 'pending'].includes(CQ.status) ? 'open' : CQ.status, p_flag: ['overdue', 'pending'].includes(CQ.status) ? CQ.status : 'all', ...cqWin()
});

// A complaint alert opens its own record (Kate, 29 Oct 2026, "a direct link to the complaint record"): ?view=complaintlog&cid=<id>, read at load into
// window.TRS_CID by dashboard.js. If the complaint is not on the page showing, it is fetched by id and put at the top of this page of the list.
async function cqOpenFromLink() {
  const id = Number(window.TRS_CID) || 0;
  if (!id || cqMode !== 'log') return;
  window.TRS_CID = 0;
  try {
    let r = ((cqList && cqList.rows) || []).find(x => x.id === id);
    if (!r) {
      const { data, error } = await sb.rpc('client_complaints_list', { p_src: 'logged', p_limit: 1, p_offset: 0, p_id: id });
      if (error) throw error;
      r = data && data.rows && data.rows[0];
      if (!r) { const m = document.getElementById('cqMeta'); if (m) m.textContent = 'That complaint is not on file any more.'; return; }
      cqList.rows.unshift(r); cqList.total = Number(cqList.total || 0) + 1; cqPaintList();
    }
    const row = document.querySelector(`#cqBody tr.cq-row[data-i="${id}"]`);
    if (row) { cqOpen = 0; cqToggle(row); row.scrollIntoView({ block: 'center' }); }
  } catch (e) { console.error(e); }
}

// Open in Google Sheets (Kate, 22 Oct 2026: "this table may be opened on Google Sheets"). A Google Sheet cannot be made from the page without a
// sign-in to Google, so this copies every row the filters match (not only the page on screen), tab separated, and opens a new Google Sheet to
// paste into with Ctrl+V. The rows are copied first and the sheet is opened after (9 Nov 2026: the other way round took the focus and the copy failed).
async function cqSheetsExport() {
  const btn = document.getElementById('cqSheet'), msg = document.getElementById('cqSheetMsg');
  const say = t => { if (msg) msg.textContent = t; };
  if (btn) btn.disabled = true;
  say('Getting the rows…');
  try {
    const rows = []; let total = Infinity, off = 0;
    while (off < total && off < 5000) {
      const { data, error } = await sb.rpc('client_complaints_list', cqListArgs(100, off));
      if (error) throw error;
      total = Number(data.total || 0);
      const got = data.rows || [];
      rows.push(...got);
      if (!got.length) break;
      off += 100;
    }
    const cell = v => String(v == null ? '' : v).replace(/[\t\r\n]+/g, ' ').replace(/"/g, "'").trim();
    const head = ['Code', 'Date', 'Branch', 'Client', 'Kind', 'What happened', 'Outcome', 'How it ended', 'Stylist', 'Service', 'Charged (AED)', 'Handled by',
      'Status', 'Logged by', 'Google review', 'Mobile', 'Date of the complaint', 'Date resolved', 'Days open', 'Flag', 'Responsible', 'Why pending', 'Original note'];
    const lines = [head].concat(rows.map(r => [
      r.code, r.date ? String(r.date).slice(0, 10) : 'Client card', cqBr(r.branch), r.client, CQ_TYPE[r.type] || r.type,
      r.detail, r.status === 'open' ? 'Still open' : (CQ_RES[r.resolution] || r.resolution), r.resolution_detail, r.stylists, r.services,
      r.fee, r.handled_by, r.status === 'open' ? 'Open' : (r.status === 'resolved' ? 'Resolved' : ''), r.by,
      r.g_date ? `${'★'.repeat(Math.max(0, Math.min(5, Number(r.g_stars) || 0)))} ${String(r.g_date).slice(0, 10)}` : (r.g_manual ? 'Posted (logged)' : ''),
      r.phone, r.complaint_date ? String(r.complaint_date).slice(0, 10) : '', r.resolved_at ? String(r.resolved_at).slice(0, 10) : '', r.days_open,
      r.flag === 'overdue' ? 'Overdue' : (r.flag === 'pending' ? 'Pending action' : ''), r.responsible, r.pending_reason, r.note
    ]));
    const text = lines.map(l => l.map(cell).join('\t')).join('\n');
    // The copy comes first and the new tab second. Opening the tab first (the old order) moved the focus to it, and a browser refuses to copy from a page that is
    // not in focus (Kate, 9 Nov 2026: "it could not copy the rows"). Copying through a hidden box is the fallback.
    try { await navigator.clipboard.writeText(text); } catch (e) {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      ta.remove();
      if (!ok) throw e;
    }
    const n = `${rows.length} row${rows.length === 1 ? '' : 's'}`;
    const w = window.open('https://sheets.new', '_blank');
    if (w) say(`Copied ${n}. Paste them into the new sheet with Ctrl+V.`);
    else if (msg) msg.innerHTML = `Copied ${n}. <a href="https://sheets.new" target="_blank" rel="noopener">Open a new Google Sheet</a> and paste with Ctrl+V.`;
  } catch (e) {
    console.error(e);
    say('It could not copy the rows. Try again.');
  } finally { if (btn) btn.disabled = false; }
}

// XLSX and CSV (Kate, 10 Nov 2026 ruling for every report): every row the filters match, not only the page on screen. report-export.js draws the buttons and saves.
async function cqExport() {
  const rows = []; let total = Infinity, off = 0;
  while (off < total && off < 5000) {
    const { data, error } = await sb.rpc('client_complaints_list', cqListArgs(100, off));
    if (error) throw error;
    total = Number(data.total || 0);
    const got = data.rows || [];
    rows.push(...got);
    if (!got.length) break;
    off += 100;
  }
  if (!rows.length) return null;
  const phones = rows.some(r => r.phone);
  const cols = [{ key: 'date', label: 'Date', fmt: 'text' }, { key: 'branch', label: 'Branch', fmt: 'text' }, { key: 'client', label: 'Client', fmt: 'text' }, { key: 'kind', label: 'Kind', fmt: 'text' },
    { key: 'what', label: 'What happened', fmt: 'text' }, { key: 'found', label: 'Found in', fmt: 'text' }, { key: 'now', label: 'Where it is now', fmt: 'text' }, { key: 'out', label: 'Outcome', fmt: 'text' },
    { key: 'end', label: 'How it ended', fmt: 'text' }, { key: 'sty', label: 'Stylist', fmt: 'text' }, { key: 'svc', label: 'Services that day', fmt: 'text' }, { key: 'fee', label: 'Charged (AED)', fmt: 'aed' },
    { key: 'by', label: 'Handled by', fmt: 'text' }, { key: 'g', label: 'Google review', fmt: 'text' }, { key: 'code', label: 'Code', fmt: 'text' }, { key: 'note', label: 'Original note', fmt: 'text' }]
    .concat(phones ? [{ key: 'phone', label: 'Mobile', fmt: 'text' }] : []);
  const out = rows.map(r => {
    const cells = [r.date ? String(r.date).slice(0, 10) : 'Client card', cqBr(r.branch), r.client || '', CQ_TYPE[r.type] || r.type || '', r.detail || '', cqFound(r), cqStage(r).text,
      r.status === 'open' ? 'Still open' : (CQ_RES[r.resolution] || r.resolution || ''), r.resolution_detail || '', r.stylists || '', r.services || '', r.fee == null ? null : Number(r.fee),
      r.handled_by || '', r.g_date ? `${String(r.g_date).slice(0, 10)}, ${Number(r.g_stars) || ''} stars` : (r.g_manual ? 'Posted (logged)' : ''), r.code || '', r.note || ''];
    if (phones) cells.push(r.phone || '');
    return { cells };
  });
  return { name: 'client-complaints-' + (cqBranch() === 'all' ? 'all-branches' : cqBranch().toLowerCase().replace(/,/g, '-')), sheets: [{ name: 'Complaints', title: 'Client Complaints',
    subtitle: `${out.length} complaint${out.length === 1 ? '' : 's'}, with the filters set on the page`, blocks: [{ cols, rows: out }],
    legend: [['Found in', 'Where the complaint was first written down: a Phorest visit note, a Phorest client card, or logged by staff.'], ['Where it is now', 'The pipeline stage. Notes from Phorest were written after the fact, so they are Closed, history.']] }] };
}
window.cqExport = cqExport;

async function cqLoadList() {
  const body = document.getElementById('cqBody');
  if (!body) return;
  const seq = ++cqSeqL;
  try {
    const { data, error } = await sb.rpc('client_complaints_list', cqListArgs(CQ.size, CQ.page * CQ.size));
    if (error) throw error;
    if (seq !== cqSeqL) return;
    cqList = data;
    cqPaintList();
    cqOpenFromLink();
  } catch (e) {
    console.error(e);
    if (seq !== cqSeqL) return;
    const wc = document.getElementById('cq-list'); if (wc) wc.classList.remove('cq-wait');
    body.innerHTML = '<p class="cq-meta" style="padding:10px 4px">The list did not load. Refresh to try again.</p>';
  }
}

// The masthead's Branch chips changed (dashboard.js NOPULSE_REDRAW): redraw the numbers and the list for the new pick.
function cqRefresh() {
  cqRecClose();
  if (!document.getElementById('cqTop')) return renderComplaints();
  CQ.page = 0; cqOpen = 0;
  cqLoadSummary();
  return cqLoadList();
}

function renderComplaints() {
  const el = document.getElementById('complaintsContent');
  if (!el) return;
  const other = document.getElementById('complaintlogContent'); if (other) other.innerHTML = '';   // one page's ids at a time
  cqMode = 'main';
  CQ.sort = 'date'; CQ.dir = 'desc'; if (['overdue', 'pending'].includes(CQ.status)) CQ.status = 'all';
  if (!cqLevelOk()) { el.innerHTML = '<div class="cq"><p class="cq-meta" style="padding:20px 0">Client Complaints is for Levels 3 and up.</p></div>'; return; }
  el.innerHTML = cqShell();
  cqWire();
  cqOpen = 0;
  cqLoadSummary();
  cqLoadList();
  // Kate, 22 Oct 2026: "all time toggling pwede". The notes go back years, so the first time the page opens in a visit it asks for the
  // masthead's All time (the Period chips are the toggle after that); the chip's own redraw reloads the page, so only the chip is touched here.
  cqAllTime();
}

function cqAllTime() {
  if (cqAllTimeDone) return;
  cqAllTimeDone = true;
  const chip = document.querySelector('#periodChips .chip[data-v="All time"]');
  if (chip && !chip.disabled && chip.getAttribute('aria-pressed') !== 'true') chip.click();
}
