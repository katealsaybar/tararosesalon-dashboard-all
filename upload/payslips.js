// ── PAYSLIPS TAB ─────────────────────────────────────────────
// Kate, 25 Sep 2026: the accounts and admin team upload each person's monthly
// payslip PDF here. The files go to the private `payslips` bucket through the
// payslips edge function (supabase/functions/payslips), which checks a payroll
// or leader key on every call; the portal password alone is not enough, since it
// lives in this page's own code. Each stylist then sees her payslip on her
// performance page, and apps-script/monthly-performance-email.gs attaches it.
//
// Drop several PDFs at once: each is matched to a person by the words of their
// name in the file name ("Holly Branchett Sep 2026.pdf"). Anything it can't
// match waits for a pick from the list instead of guessing.
//
// Or drop ONE big PDF with everyone's payslip in it (Kate + Jumera, 30 Sep 2026:
// Accounts export the whole month from Excel in one go). Each page is read for a
// name and split off on its own, all in this browser; pages that belong to the
// same person are saved together as one payslip.
const PS_FN = 'https://gvijxenafoowajqktqvd.supabase.co/functions/v1/payslips';
const PS_KEY_STORE = 'payslipKey';
// The Staff Payslips Apps Script, deployed as a web app from payroll@ (Execute as:
// Me, access: Anyone). It sends the monthly emails; see
// apps-script/monthly-performance-email.gs. Every call carries the payslip key.
const PS_SEND_URL = 'https://script.google.com/macros/s/AKfycbxJLja-iKKSDUHXAk8sCCKRG4b7scPoIaVJ18dpLNAX3t3gwEg0RFUKLX9Li_-XCHVRdg/exec';
const PS_BRANCH = { KCA: 'Khalifa City A', SAA: 'Mamsha Al Saadiyat', MC: 'Motor City', AQ: 'Al Quoz' };
let PS_STATE = { month: null, staff: [], admin: null, pending: [], q: '', branch: (() => { try { return localStorage.getItem('trs-ps-branch') || ''; } catch (e) { return ''; } })(), pos: (() => { try { return localStorage.getItem('trs-ps-pos') || ''; } catch (e) { return ''; } })(), up: (() => { try { return localStorage.getItem('trs-ps-up') || ''; } catch (e) { return ''; } })(), send: null, sendBusy: '', sendMsg: '', sendErr: '' };

// A typed key wins; otherwise the one the sign-in hands payroll and leaders (PS_AUTO, set in upload.html).
const psKey = () => { try { return localStorage.getItem(PS_KEY_STORE) || window.PS_AUTO || null; } catch (e) { return window.PS_AUTO || null; } };
const psEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const psNorm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

async function psCall(payload, file) {
  const headers = { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` };
  let body;
  if (file) {
    body = new FormData();
    Object.entries(payload).forEach(([k, v]) => body.append(k, v));
    body.append('file', file, file.name);
  } else {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(payload);
  }
  const r = await fetch(PS_FN, { method: 'POST', headers, body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
  return j;
}

function psDefaultMonth() {
  // Payslips are for the month just finished.
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function initPayslipsTab() {
  const host = document.getElementById('payslipHost');
  if (!host) return;
  if (!psKey()) { psRenderKeyPrompt(); return; }
  if (!PS_STATE.month) PS_STATE.month = psDefaultMonth();
  host.innerHTML = '<div class="empty-col">Loading…</div>';
  PS_STATE.send = null;
  try {
    const d = await psCall({ action: 'list', admin: psKey(), month: PS_STATE.month });
    PS_STATE.staff = d.staff; PS_STATE.admin = d.admin;
    psRender();
  } catch (e) {
    if (/admin token/.test(e.message)) { try { localStorage.removeItem(PS_KEY_STORE); } catch (x) {} psRenderKeyPrompt('That key isn’t valid. Ask Kate for the payslip key.'); return; }
    host.innerHTML = `<div class="empty-col">Couldn’t load payslips: ${psEsc(e.message)}</div>`;
  }
}

function psRenderKeyPrompt(err) {
  document.getElementById('payslipHost').innerHTML = `
    <div style="max-width:460px">
      <div class="card-sub" style="margin-bottom:10px">Enter the payslip key once. This browser remembers it.</div>
      <input id="psKeyInput" type="text" placeholder="Payslip key" autocomplete="off"
        style="width:100%;padding:10px;border:1px solid var(--border);border-radius:10px;background:var(--surface2);color:var(--text);font:inherit">
      ${err ? `<div style="color:var(--bad);font-size:13px;margin-top:6px">${psEsc(err)}</div>` : ''}
      <button class="btn" style="margin-top:10px" onclick="psSaveKey()">Open payslips</button>
    </div>`;
}
function psSaveKey() {
  const v = document.getElementById('psKeyInput').value.trim();
  if (!/^[0-9a-f-]{36}$/i.test(v)) { psRenderKeyPrompt('That doesn’t look like a payslip key.'); return; }
  try { localStorage.setItem(PS_KEY_STORE, v); } catch (e) {}
  initPayslipsTab();
}
function psForgetKey() { try { localStorage.removeItem(PS_KEY_STORE); } catch (e) {} psRenderKeyPrompt(); }

// Which person a file name belongs to: every word of their name in it, or a
// first name that only one person has. Null when unsure.
function psMatch(fileName) {
  const f = ' ' + psNorm(fileName.replace(/\.pdf$/i, '')) + ' ';
  const full = PS_STATE.staff.filter(s => psNorm(s.name).split(' ').every(w => f.includes(' ' + w + ' ')));
  if (full.length === 1) return full[0];
  const first = PS_STATE.staff.filter(s => f.includes(' ' + psNorm(s.name).split(' ')[0] + ' '));
  return first.length === 1 ? first[0] : null;
}

// Which person a page of a combined PDF belongs to, from the page's own text:
// every word of their name, else their first and last name. Null when it's
// nobody on the list, or more than one person.
function psMatchText(text) {
  const f = ' ' + psNorm(text) + ' ';
  const has = w => f.includes(' ' + w + ' ');
  const words = s => psNorm(s.name).split(' ');
  let hit = PS_STATE.staff.filter(s => words(s).every(has));
  if (hit.length > 1) {
    // "Grace Sarmiento" beats "Grace" when both fit: keep the longest names only.
    const top = Math.max(...hit.map(s => words(s).length));
    hit = hit.filter(s => words(s).length === top);
  }
  if (hit.length === 1) return hit[0];
  if (hit.length > 1) return null;
  hit = PS_STATE.staff.filter(s => { const w = words(s); return w.length > 1 && has(w[0]) && has(w[w.length - 1]); });
  return hit.length === 1 ? hit[0] : null;
}

// Kate, 2 Oct 2026: the payslip carries the payroll name, which is often not the
// dashboard's (Shelly Douglas / Shelley Douglas, Tamryn / Tammy Peter, Kimberly /
// Kim Casas, Jovelyn Assuncion / Nikki Asuncion). Accounts' template prints it
// under EMPLOYEE NAME, with the branch under BRANCH.
const PS_PAY_LABELS = 'FROM|JOINING DATE|TO|STATUS|BRANCH|POSITION|NO\\.|MONTHLY SALARY|PAYMENT MODE|GROSS SALARY';
function psPayslipFields(text) {
  const t = String(text).replace(/\s+/g, ' ');
  const grab = lbl => (t.match(new RegExp(`${lbl}\\s+(.+?)\\s+(?:${PS_PAY_LABELS})\\b`)) || [])[1] || '';
  const name = grab('EMPLOYEE NAME').trim();
  const b = grab('BRANCH').toLowerCase();
  const branch = /saadiyat|mamsha/.test(b) ? 'SAA' : /khalifa/.test(b) ? 'KCA' : /motor/.test(b) ? 'MC' : /quoz/.test(b) ? 'AQ' : '';
  return { name: /[a-z]/i.test(name) && name.length < 60 ? name : '', branch };
}

function psLev(a, b) {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = t;
    }
  }
  return d[b.length];
}
// How alike two name words are, 0 to 1: Kim/Kimberly 0.85, Shelly/Shelley 0.83.
function psSim(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if ((a.length >= 3 && b.startsWith(a)) || (b.length >= 3 && a.startsWith(b))) return 0.85;
  let cp = 0; while (cp < a.length && a[cp] === b[cp]) cp++;
  return Math.max(1 - psLev(a, b) / Math.max(a.length, b.length), cp >= 3 ? 0.6 : 0);
}
// Closest person to a payslip name. A first or last name counts only when it is
// close (0.75+: Shelly/Shelley, Ostertah/Ostertag, Kim/Kimberly), plus half a
// point for the same branch, so one close name at the right branch is enough
// (Mona Rakesh / Mona Soba) but loosely similar names are not (Stella Mendez /
// Shila Mandal). Only a clear winner counts, and the row is marked for a check.
function psFuzzy(payName, branch) {
  const P = psNorm(payName).split(' ').filter(Boolean);
  if (!P.length) return null;
  const close = x => (x >= 0.75 ? x : 0);
  const scored = PS_STATE.staff.map(s => {
    const S = psNorm(s.name).split(' ');
    const last = S.length > 1 ? Math.max(0, ...P.slice(1).map(w => psSim(w, S[S.length - 1]))) : 0;
    return { s, score: close(psSim(P[0], S[0])) + close(last) + (branch && s.branch === branch ? 0.5 : 0) };
  }).sort((x, y) => y.score - x.score);
  const [a, b] = scored;
  return a && a.score >= 1.2 && (!b || a.score - b.score >= 0.3) ? a.s : null;
}

// Payroll (government) names → dashboard names, from September 2026's payslips,
// checked by Kate and Jumera on 2 Oct 2026. A payslip name here matches outright,
// with no "check it's right" flag. Key = payslip name as psNorm gives it. Add a
// line when a new starter's payslip name differs from their dashboard name.
const PS_ALIASES = {
  'adelyn ancheta': 'Eds Asuncion',
  'alaysa vertudis': 'Mimi Vertudes',
  'chalani amarasinghe': 'Chalani Kaushallya',
  'jovelyn assuncion': 'Nikki Asuncion',
  'kateryna siryk': 'Kate Siryk',
  'kimberly casas': 'Kim Casas',
  'lizanie jacobs': 'Lizanie Jacobsz',
  'lucia gonzales': 'Lucy Rodriguez',
  'marry joy gales': 'Mary Joy Galos',
  'mevil aranas': 'Mevil Miraflor',
  'mona rakesh': 'Mona Soba',
  'olena ostertah': 'Olena Ostertag',
  'redalyn ramirez': 'Reda Ramirez',
  'shelly douglas': 'Shelley Douglas',
  'sunshine castillo': 'Shine Castillo',
  'tamryn peter': 'Tammy Peter',
  'vicky taylor': 'Vicki Taylor',
};

// One page's person: a confirmed alias, then exact words of the payslip name,
// then the closest name; pages from another template fall back to the page text.
function psMatchPage(text) {
  const { name, branch } = psPayslipFields(text);
  if (!name) return { match: psMatchText(text), payName: '', fuzzy: false };
  const alias = PS_STATE.staff.find(s => s.name === PS_ALIASES[psNorm(name)]);
  if (alias) return { match: alias, payName: name, fuzzy: false };
  const exact = psMatchText(name);
  if (exact) return { match: exact, payName: name, fuzzy: false };
  const near = psFuzzy(name, branch);
  return { match: near, payName: name, fuzzy: !!near };
}

let psPdfLibReady = null;
function psPdfLib() {
  psPdfLibReady ||= new Promise((ok, fail) => {
    const sc = document.createElement('script');
    sc.src = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';
    sc.onload = () => ok(window.PDFLib);
    sc.onerror = () => { psPdfLibReady = null; fail(new Error('Couldn’t load the PDF splitter. Check the connection and try again.')); };
    document.head.appendChild(sc);
  });
  return psPdfLibReady;
}

const psPageText = async (pdf, i) => (await (await pdf.getPage(i)).getTextContent()).items.map(t => t.str).join(' ');

// One PDF → one pending row per page, each matched by the name printed on it.
// A one-page PDF comes back as one row holding the file itself (no page number).
async function psSplitPdf(file) {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf.slice(0) }).promise;
  if (pdf.numPages < 2) {
    const text = await psPageText(pdf, 1);
    if (!text.trim()) return null;
    return [{ file, ...psMatchPage(text), error: '', status: 'ready' }];
  }
  const { PDFDocument } = await psPdfLib();
  const src = await PDFDocument.load(buf);
  const rows = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const text = await psPageText(pdf, i);
    const one = await PDFDocument.create();
    one.addPage((await one.copyPages(src, [i - 1]))[0]);
    const f = new File([await one.save()], `${file.name.replace(/\.pdf$/i, '')} page ${i}.pdf`, { type: 'application/pdf' });
    rows.push({ file: f, ...(text.trim() ? psMatchPage(text) : { match: null, payName: '', fuzzy: false }), error: '', status: 'ready',
      page: i, of: pdf.numPages, source: file.name, noText: !text.trim() });
  }
  return rows;
}

// The payroll name on a single uploaded payslip (Upload PDF / Replace), or ''.
async function psReadPayName(file) {
  try {
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    return psPayslipFields(await psPageText(pdf, 1)).name;
  } catch (e) { return ''; }
}

function psMonthOptions() {
  const out = [], now = new Date();
  for (let i = 0; i < 13; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    out.push(`<option value="${v}"${v === PS_STATE.month ? ' selected' : ''}>${d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</option>`);
  }
  return out.join('');
}

function psRender() {
  const host = document.getElementById('payslipHost');
  const done = PS_STATE.staff.filter(s => s.payslip).length, all = PS_STATE.staff.length;
  const groups = {};
  PS_STATE.staff.forEach(s => (groups[s.branch] ||= []).push(s));
  const row = s => {
    const p = s.payslip;
    return `<div class="ps-row${p ? ' done' : ''}" data-name="${psEsc(psNorm(s.name))}" data-pos="${psEsc(s.level || s.dept || '')}">
      <div><div class="ps-name">${psEsc(s.name)}<span class="ps-badge"></span></div><div class="ps-meta">${psEsc(s.level || s.dept)}${p ? ` · ${psEsc(p.file_name || 'payslip.pdf')} · by ${psEsc(p.uploaded_by)}, ${new Date(p.uploaded_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}</div></div>
      <div class="ps-actions">
        ${p ? `<button class="btn-dl" onclick="psView('${s.id}')">View</button>` : ''}
        <label class="btn-outline ps-pick">${p ? 'Replace' : 'Upload PDF'}<input type="file" accept="application/pdf,.pdf" hidden onchange="psUploadOne('${s.id}', this.files[0]); this.value=''"></label>
        ${p ? `<button class="btn-danger" onclick="psRemove('${s.id}')">Remove</button>` : ''}
      </div></div>`;
  };
  host.innerHTML = `
    <div class="ps-top">
      <label class="ps-month">Month <select onchange="PS_STATE.month=this.value; initPayslipsTab()">${psMonthOptions()}</select></label>
      <div class="ps-count"><b>${done}</b> of ${all} uploaded</div>
      <a href="#" class="ps-key" onclick="psForgetKey();return false">Signed in as ${psEsc(PS_STATE.admin)} · change key</a>
    </div>
    <div class="ps-send" id="psSendPanel"></div>
    <div class="ps-drop" id="psDrop">
      <b>Drop payslip PDFs here</b>, or <label class="ps-link">choose files<input type="file" accept="application/pdf,.pdf" multiple hidden onchange="psAddFiles(this.files); this.value=''"></label>.
      <div class="ps-meta">One PDF with everyone in it? Drop it here: each page is matched by the name printed on it. Or one file per person, named like “Holly Branchett.pdf”. PDF only, up to 10 MB each.</div>
    </div>
    <div id="psPending"></div>
    <div class="ps-search-wrap">
      <input id="psSearch" class="ps-search" type="search" placeholder="Search a name…" autocomplete="off"
        value="${psEsc(PS_STATE.q)}" oninput="PS_STATE.q=this.value; psFilter()">
      <div class="ps-branches">${['', 'KCA', 'SAA', 'MC', 'AQ'].filter(b => !b || groups[b]).map(b => `
        <button type="button" class="ps-bpill${PS_STATE.branch === b ? ' on' : ''}" onclick="psPickBranch('${b}')">${b ? psEsc(PS_BRANCH[b]) : 'All'}</button>`).join('')}</div>
      <div class="ps-branches ps-up">${[['', 'Everyone'], ['done', `Uploaded · ${done}`], ['todo', `Not yet · ${all - done}`]].map(([v, t]) => `
        <button type="button" class="ps-bpill${PS_STATE.up === v ? ' on' : ''}" data-up="${v}" onclick="psPickUp('${v}')">${t}</button>`).join('')}</div>
      <select class="ps-pos" onchange="psPickPos(this.value)">
        <option value="">All positions</option>
        ${psPositions().map(v => `<option value="${psEsc(v)}"${PS_STATE.pos === v ? ' selected' : ''}>${psEsc(v)}</option>`).join('')}
      </select>
      <span class="ps-meta" id="psSearchNone" hidden>Nobody matches.</span>
    </div>
    ${['KCA', 'SAA', 'MC', 'AQ'].filter(b => groups[b]).map(b => `
      <div class="roster-branch ps-branch" data-branch="${b}"><div class="roster-branch-hd">${PS_BRANCH[b]} · ${groups[b].filter(s => s.payslip).length}/${groups[b].length}</div>
      ${groups[b].map(row).join('')}</div>`).join('')}`;
  const drop = document.getElementById('psDrop');
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('dragover'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('dragover'); }));
  drop.addEventListener('drop', e => psAddFiles(e.dataTransfer.files));
  psRenderPending();
  psFilter();
  psRenderSend();
  if (!PS_STATE.send && PS_SEND_URL) psLoadSend();
}

// Branch pills next to the search (Kate, 30 Sep 2026), remembered per browser.
function psPickBranch(b) {
  PS_STATE.branch = b;
  try { localStorage.setItem('trs-ps-branch', b); } catch (e) {}
  document.querySelectorAll('#payslipHost .ps-bpill').forEach(x => x.classList.toggle('on', x.getAttribute('onclick') === `psPickBranch('${b}')`));
  psFilter();
}

// Position dropdown (Kate, 30 Sep 2026): the level for hair, Beauty for the beauty team.
const PS_POS_ORDER = ['Blow-Dry Specialist', 'Junior Stylist', 'Stylist', 'Senior Stylist', 'Style Director', 'Beauty'];
function psPositions() {
  const have = [...new Set(PS_STATE.staff.map(s => s.level || s.dept).filter(Boolean))];
  const rank = v => { const i = PS_POS_ORDER.indexOf(v); return i < 0 ? 99 : i; };
  return have.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}
function psPickPos(v) {
  PS_STATE.pos = v;
  try { localStorage.setItem('trs-ps-pos', v); } catch (e) {}
  psFilter();
}

// Uploaded / not yet toggle (Kate, 2 Oct 2026), remembered per browser.
function psPickUp(v) {
  PS_STATE.up = v;
  try { localStorage.setItem('trs-ps-up', v); } catch (e) {}
  document.querySelectorAll('#payslipHost .ps-up .ps-bpill').forEach(x => x.classList.toggle('on', x.dataset.up === v));
  psFilter();
}

// Search box (Kate, 30 Sep 2026): shows only the people whose name has every word
// typed, in any order ("mae marco", "ibra"). Branches with nobody left are hidden.
function psFilter() {
  const words = psNorm(PS_STATE.q || '').split(' ').filter(Boolean);
  let shown = 0;
  document.querySelectorAll('#payslipHost .ps-branch').forEach(br => {
    if (PS_STATE.branch && br.dataset.branch !== PS_STATE.branch) { br.hidden = true; return; }
    let any = false;
    br.querySelectorAll('.ps-row').forEach(r => {
      const n = r.dataset.name || '';
      const ok = words.every(w => n.split(' ').some(part => part.startsWith(w)));
      const okPos = !PS_STATE.pos || r.dataset.pos === PS_STATE.pos;
      const okUp = !PS_STATE.up || r.classList.contains('done') === (PS_STATE.up === 'done');
      const show = ok && okPos && okUp;
      r.hidden = !show; if (show) { any = true; shown++; }
    });
    br.hidden = !any;
  });
  const none = document.getElementById('psSearchNone');
  if (none) none.hidden = !!shown;
}

async function psAddFiles(files) {
  const el = document.getElementById('psPending');
  for (const f of [...files]) {
    const ok = /\.pdf$/i.test(f.name) || f.type === 'application/pdf';
    if (!ok) { PS_STATE.pending.push({ file: f, match: null, error: 'Not a PDF', status: 'ready' }); continue; }
    let pages = null;
    try {
      if (el) el.innerHTML = `<div class="ps-pending"><span class="ps-meta">Reading ${psEsc(f.name)}…</span></div>`;
      pages = await psSplitPdf(f);
    } catch (e) {
      PS_STATE.pending.push({ file: f, match: null, error: 'Couldn’t read this PDF: ' + e.message, status: 'ready' });
      continue;
    }
    // No page names anyone, but the file name does ("Ibrahim.pdf"): it's that one
    // person's file, however many pages, so keep it whole (Kate, 30 Sep 2026).
    const byName = psMatch(f.name);
    if (pages && byName && !pages.some(r => r.match)) pages = null;
    if (pages) PS_STATE.pending.push(...pages);
    else PS_STATE.pending.push({ file: f, match: psMatch(f.name), error: '', status: 'ready' });
  }
  // A closest-name guess never takes someone whose own name is already on a page.
  const sure = new Set(PS_STATE.pending.filter(p => p.match && !p.fuzzy).map(p => p.match.id));
  PS_STATE.pending.forEach(p => { if (p.fuzzy && p.match && sure.has(p.match.id)) { p.match = null; p.fuzzy = false; } });
  psRenderPending();
}

function psRenderPending() {
  const el = document.getElementById('psPending');
  if (!el) return;
  const P = PS_STATE.pending;
  if (!P.length) { el.innerHTML = ''; return; }
  const opts = sel => `<option value="">Pick who this is…</option>` + PS_STATE.staff.map(s => `<option value="${s.id}"${sel && sel.id === s.id ? ' selected' : ''}>${psEsc(s.name)} (${s.branch})</option>`).join('');
  const live = P.filter(p => p.status === 'ready' && p.match && !p.error);
  const people = new Set(live.map(p => p.match.id)).size;
  const count = id => live.filter(p => p.match.id === id).length;
  const need = P.filter(p => p.status === 'ready' && !p.match && !p.error).length;
  const guess = live.filter(p => p.fuzzy).length;
  // From a combined PDF: who on the list has no page at all (and no payslip yet).
  const split = P.some(p => p.page);
  const missing = split ? PS_STATE.staff.filter(s => !s.payslip && !P.some(p => p.match && p.match.id === s.id)) : [];
  const label = p => p.page ? `Page ${p.page} of ${p.of}<span class="ps-meta"> · ${psEsc(p.source)}</span>` : psEsc(p.file.name);
  el.innerHTML = `<div class="ps-pending">
    ${split ? `<div class="ps-summary"><b>${live.length} page${live.length === 1 ? '' : 's'} matched</b> to ${people} ${people === 1 ? 'person' : 'people'}${need ? ` · <span class="ps-err">${need} need${need === 1 ? 's' : ''} a name picked</span>` : ''}${guess ? ` · <span class="ps-check">${guess} matched by closest name, check ${guess === 1 ? 'it' : 'them'}</span>` : ''}. Press View to check a page. A page that isn’t anyone on the list? Remove it with ✕.</div>` : ''}
    ${P.map((p, i) => `<div class="ps-prow ${p.status}${p.status === 'ready' && !p.match && !p.error ? ' need' : ''}${p.fuzzy && p.match && p.status === 'ready' ? ' guess' : ''}">
      <span class="ps-fname">${label(p)}</span>
      ${p.error ? `<span class="ps-err">${psEsc(p.error)}</span>`
        : p.status === 'done' ? `<span class="ps-ok">Saved for ${psEsc(p.match.name)}</span>`
        : p.status === 'saving' ? `<span class="ps-meta">Saving…</span>`
        : `${p.payName ? `<span class="ps-meta">On payslip: <b>${psEsc(p.payName)}</b></span>` : ''}
           <select onchange="PS_STATE.pending[${i}].match=PS_STATE.staff.find(s=>s.id===this.value)||null; PS_STATE.pending[${i}].fuzzy=false; psRenderPending()">${opts(p.match)}</select>
           ${p.fuzzy && p.match ? '<span class="ps-check">closest name, check it’s right</span>' : ''}
           ${p.noText && !p.match ? '<span class="ps-meta">no text on this page, press View and pick</span>' : ''}
           ${p.match && count(p.match.id) > 1 ? `<span class="ps-meta">saved together with ${count(p.match.id) - 1} other page${count(p.match.id) > 2 ? 's' : ''}</span>` : ''}
           ${p.match && p.match.payslip ? '<span class="ps-meta">replaces the one already there</span>' : ''}`}
      <span class="ps-prow-btns">
        ${p.status !== 'done' ? `<button class="btn-dl" onclick="psViewPending(${i})">View</button>` : ''}
        ${p.status !== 'saving' ? `<button class="btn-outline" onclick="PS_STATE.pending.splice(${i},1); psRenderPending()">✕</button>` : ''}
      </span>
    </div>`).join('')}
    ${missing.length ? `<div class="ps-meta ps-missing">No page found for ${missing.length}: ${missing.map(s => psEsc(s.name)).join(', ')}</div>` : ''}
    <div style="display:flex;gap:10px;margin-top:10px">
      <button class="btn" style="width:auto;padding:10px 18px" ${people ? '' : 'disabled'} onclick="psSaveAll()">Save ${people} payslip${people === 1 ? '' : 's'}</button>
      <button class="btn-outline" onclick="PS_STATE.pending=[]; psRenderPending()">Clear</button>
    </div></div>`;
}

function psViewPending(i) {
  const p = PS_STATE.pending[i];
  if (!p) return;
  const url = URL.createObjectURL(p.file);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// Kate, 2 Oct 2026: every saved payslip is named the same way, whatever the
// file was called: "Shelly_Douglas_Sept_2026_payslip.pdf", from the name printed
// on the payslip, or the dashboard name when the page carries none.
const PS_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
function psFileName(person, payName) {
  const [y, m] = PS_STATE.month.split('-');
  const name = String(payName || person.name).trim().replace(/[\\/:*?"<>|]+/g, '').split(/\s+/).join('_');
  return `${name}_${PS_MON[+m - 1]}_${y}_payslip.pdf`;
}

// Pages (or files) picked for the same person become one PDF, in the order dropped.
async function psMergeFor(person, rows) {
  const name = psFileName(person, (rows.find(r => r.payName) || {}).payName);
  if (rows.length === 1) return new File([rows[0].file], name, { type: 'application/pdf' });
  const { PDFDocument } = await psPdfLib();
  const out = await PDFDocument.create();
  for (const r of rows) {
    const src = await PDFDocument.load(await r.file.arrayBuffer());
    (await out.copyPages(src, src.getPageIndices())).forEach(pg => out.addPage(pg));
  }
  return new File([await out.save()], name, { type: 'application/pdf' });
}

async function psSaveAll() {
  const groups = new Map();
  PS_STATE.pending.forEach(p => {
    if (p.status !== 'ready' || !p.match || p.error) return;
    if (!groups.has(p.match.id)) groups.set(p.match.id, []);
    groups.get(p.match.id).push(p);
  });
  for (const rows of groups.values()) {
    const person = rows[0].match;
    rows.forEach(r => { r.status = 'saving'; }); psRenderPending();
    try {
      const file = await psMergeFor(person, rows);
      await psCall({ action: 'upload', admin: psKey(), month: PS_STATE.month, staff_id: person.id }, file);
      rows.forEach(r => { r.status = 'done'; });
    } catch (e) { rows.forEach(r => { r.status = 'ready'; r.error = e.message; }); }
    psRenderPending();
  }
  const keep = PS_STATE.pending.filter(p => p.status !== 'done');
  await initPayslipsTab();
  PS_STATE.pending = keep; psRenderPending();
}

async function psUploadOne(staffId, file) {
  if (!file) return;
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') { alert('Payslips must be PDF files.'); return; }
  const person = PS_STATE.staff.find(s => s.id === staffId);
  if (person) file = new File([file], psFileName(person, await psReadPayName(file)), { type: 'application/pdf' });
  try { await psCall({ action: 'upload', admin: psKey(), month: PS_STATE.month, staff_id: staffId }, file); await initPayslipsTab(); }
  catch (e) { alert('Couldn’t save it: ' + e.message); }
}

// Kate, 2 Oct 2026: opens on trk-salon-os.com/payslip/, not the storage address
// (payslip/open.js passes the 10-minute link across).
function psView(staffId) {
  const person = PS_STATE.staff.find(s => s.id === staffId);
  openPayslipPage(
    async () => {
      const d = await psCall({ action: 'url', admin: psKey(), month: PS_STATE.month, staff_id: staffId });
      return d.url ? { url: d.url, name: person ? psFileName(person) : 'payslip.pdf' } : null;
    },
    e => alert(e ? e.message : 'No payslip for this month.'));
}

async function psRemove(staffId) {
  const s = PS_STATE.staff.find(x => x.id === staffId);
  if (!confirm(`Remove ${s ? s.name + '’s' : 'this'} payslip for this month?`)) return;
  try { await psCall({ action: 'delete', admin: psKey(), month: PS_STATE.month, staff_id: staffId }); await initPayslipsTab(); }
  catch (e) { alert(e.message); }
}

// ── EMAIL TO STAFF (Kate, 30 Sep 2026) ──────────────────────────────────
// The monthly payslip email, run from here instead of the Apps Script editor, so
// anyone on Accounts can check it, test it, pause it or send it. The script drafts
// on Saturday 09:00 and Sunday 18:00 once payslips are in, and sends on Monday
// around 07:00; these buttons only look at and nudge that.
const PS_STATE_LABEL = {
  sent: 'Emailed', draft_ready: 'Draft ready', draft_no_payslip: 'Draft, no payslip',
  payslip_in: 'Payslip in', waiting: '', no_email: 'No email', paused: 'Email off',
};

async function psSend(action, extra) {
  const r = await fetch(PS_SEND_URL, {
    method: 'POST',   // text/plain body: Apps Script can't answer a CORS preflight
    body: JSON.stringify(Object.assign({ action, key: psKey(), month: PS_STATE.month }, extra || {})),
  });
  let j = {};
  try { j = await r.json(); } catch (e) { throw new Error('The payslip mailer didn’t answer. Try again in a minute.'); }
  if (j.error) throw new Error(j.error);
  return j;
}

async function psLoadSend() {
  const month = PS_STATE.month;
  try {
    const j = await psSend('status');
    if (PS_STATE.month !== month) return;
    PS_STATE.send = j; PS_STATE.sendErr = '';
  } catch (e) { PS_STATE.sendErr = e.message; }
  psRenderSend();
}

// 'Sat 3 Oct' for the next such weekday in Dubai (today counts until that hour).
function psNextDay(dow, hour) {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Dubai' }));
  let add = (dow - d.getDay() + 7) % 7;
  if (add === 0 && d.getHours() >= hour) add = 7;
  d.setDate(d.getDate() + add);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}
const psWhen = iso => new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function psRenderSend() {
  const el = document.getElementById('psSendPanel');
  if (!el) return;
  const monthName = new Date(PS_STATE.month + '-15').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  if (!PS_SEND_URL) {
    el.innerHTML = `<div class="ps-send-hd">Email to staff · ${psEsc(monthName)}</div><div class="ps-meta">Not connected yet: the payslip mailer’s web address still needs adding to the portal.</div>`;
    return;
  }
  const S = PS_STATE.send;
  if (!S) {
    el.innerHTML = `<div class="ps-send-hd">Email to staff · ${psEsc(monthName)}</div>
      <div class="ps-meta">${PS_STATE.sendErr ? `<span class="ps-err">${psEsc(PS_STATE.sendErr)}</span> <a href="#" class="ps-link" onclick="PS_STATE.sendErr='';psRenderSend();psLoadSend();return false">Try again</a>` : 'Checking the email status…'}</div>`;
    return;
  }
  const n = st => S.people.filter(p => p.state === st).length;
  const ready = n('draft_ready'), sent = n('sent'), noSlip = n('draft_no_payslip') + n('waiting') + n('payslip_in'), noEmail = n('no_email');
  const mon = psNextDay(1, 7), sat = psNextDay(6, 9), sun = psNextDay(0, 18);
  let line;
  if (S.hold) line = `<b>Paused.</b> Nothing goes out on Monday until someone presses Resume.`;
  else if (S.sent) line = `<b>Sent ${psEsc(psWhen(S.sent))}.</b> ${sent} ${sent === 1 ? 'person has' : 'people have'} theirs.${ready ? ` ${ready} more ${ready === 1 ? 'draft is' : 'drafts are'} ready to send.` : ''}`;
  else if (S.drafted) line = `<b>Drafts ready: ${ready}.</b> They go out ${psEsc(mon)} around 07:00.`;
  else line = `<b>No drafts yet.</b> They’re made ${psEsc(sat)} at 09:00 (again ${psEsc(sun)} at 18:00) once payslips are in, and go out ${psEsc(mon)} around 07:00.`;
  const people = S.people.filter(p => p.state !== 'no_email' && p.state !== 'paused');
  const opts = people.map(p => `<option value="${psEsc(p.name)}">${psEsc(p.name)}${p.state === 'draft_ready' || p.state === 'payslip_in' || p.state === 'sent' ? '' : ' (no payslip yet)'}</option>`).join('');
  const busy = PS_STATE.sendBusy;
  const dis = busy ? ' disabled' : '';
  el.innerHTML = `
    <div class="ps-send-hd">Email to staff · ${psEsc(monthName)}</div>
    <div class="ps-send-line">${line}</div>
    ${S.schedule ? '' : `<div class="ps-err" style="margin-top:4px">The weekly schedule isn’t switched on in payroll@’s Apps Script, so nothing will be drafted or sent by itself. Ask Kate.</div>`}
    <div class="ps-chips">
      <span class="ps-chip st-sent">Emailed ${sent}</span>
      <span class="ps-chip st-draft_ready">Ready ${ready}</span>
      <span class="ps-chip st-waiting">Waiting for payslip ${noSlip}</span>
      ${noEmail ? `<span class="ps-chip st-no_email">No email ${noEmail}</span>` : ''}
    </div>
    <div class="ps-send-row">
      <select id="psTestWho"${dis}>${opts}</select>
      <button class="btn-outline" onclick="psSendTest()"${dis}>Send a test to ${psEsc((S.sender || 'payroll@').split('@')[0])}@</button>
    </div>
    <div class="ps-send-row">
      ${S.hold ? `<button class="btn" onclick="psSendAct('release')"${dis}>Resume Monday send</button>`
               : `<button class="btn-outline" onclick="psSendAct('hold')"${dis}>Pause Monday send</button>`}
      <button class="btn-outline" onclick="psSendAct('draft')"${dis}>Make drafts now</button>
      <button class="btn-outline" onclick="psSendAct('send')"${dis || (!ready || S.hold ? ' disabled' : '')}>Send ${ready} ready now</button>
      <a href="#" class="ps-link ps-refresh" onclick="PS_STATE.send=null;psRenderSend();psLoadSend();return false">Refresh</a>
    </div>
    ${busy ? `<div class="ps-meta">${psEsc(busy)}</div>` : ''}
    ${PS_STATE.sendMsg ? `<div class="ps-ok">${psEsc(PS_STATE.sendMsg)}</div>` : ''}
    ${PS_STATE.sendErr ? `<div class="ps-err">${psEsc(PS_STATE.sendErr)}</div>` : ''}
    ${S.log && S.log.length ? `<div class="ps-send-log">${S.log.map(l => `<div>${psEsc(psWhen(l.at))} · ${psEsc(l.who)} · ${psEsc(l.what)}</div>`).join('')}</div>` : ''}`;
  psBadges();
}

// A small state tag next to each name in the list below.
function psBadges() {
  const S = PS_STATE.send;
  if (!S) return;
  const by = {};
  S.people.forEach(p => { by[psNorm(p.name)] = p.state; });
  document.querySelectorAll('#payslipHost .ps-row').forEach(r => {
    const b = r.querySelector('.ps-badge');
    if (!b) return;
    const st = by[r.dataset.name] || '';
    b.className = 'ps-badge' + (st ? ' st-' + st : '');
    b.textContent = PS_STATE_LABEL[st] || '';
  });
}

const PS_CONFIRM = {
  hold: null,
  release: null,
  draft: 'Make the drafts now? Anyone with a payslip gets a draft, and drafts with a payslip go out on Monday, or when someone presses Send. Nobody who already got theirs is emailed again.',
  send: 'Send every draft that has a payslip, now? Staff get their email straight away.',
};
const PS_BUSY = {
  hold: 'Pausing…', release: 'Resuming…',
  draft: 'Making the drafts. This takes a minute or two, keep this page open.',
  send: 'Sending. This takes a minute, keep this page open.',
};

async function psSendAct(action) {
  if (PS_CONFIRM[action] && !confirm(PS_CONFIRM[action])) return;
  PS_STATE.sendBusy = PS_BUSY[action]; PS_STATE.sendMsg = ''; PS_STATE.sendErr = ''; psRenderSend();
  try {
    const j = await psSend(action);
    PS_STATE.send = j; PS_STATE.sendMsg = j.done || (action === 'hold' ? 'Paused. Nothing goes out on Monday.' : action === 'release' ? 'Resumed. Monday’s send is back on.' : '');
  } catch (e) { PS_STATE.sendErr = e.message; }
  PS_STATE.sendBusy = ''; psRenderSend();
}

async function psSendTest() {
  const who = document.getElementById('psTestWho');
  if (!who || !who.value) return;
  PS_STATE.sendBusy = `Sending a test of ${who.value}’s email…`; PS_STATE.sendMsg = ''; PS_STATE.sendErr = ''; psRenderSend();
  try { const j = await psSend('test', { staff: [who.value] }); PS_STATE.send = j; PS_STATE.sendMsg = j.done; }
  catch (e) { PS_STATE.sendErr = e.message; }
  PS_STATE.sendBusy = ''; psRenderSend();
}
