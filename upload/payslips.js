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
const PS_FN = 'https://gvijxenafoowajqktqvd.supabase.co/functions/v1/payslips';
const PS_KEY_STORE = 'payslipKey';
const PS_BRANCH = { KCA: 'Khalifa City A', SAA: 'Mamsha Al Saadiyat', MC: 'Motor City', AQ: 'Al Quoz' };
let PS_STATE = { month: null, staff: [], admin: null, pending: [] };

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
    return `<div class="ps-row${p ? ' done' : ''}">
      <div><div class="ps-name">${psEsc(s.name)}</div><div class="ps-meta">${psEsc(s.level || s.dept)}${p ? ` · ${psEsc(p.file_name || 'payslip.pdf')} · by ${psEsc(p.uploaded_by)}, ${new Date(p.uploaded_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}</div></div>
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
    <div class="ps-drop" id="psDrop">
      <b>Drop payslip PDFs here</b>, or <label class="ps-link">choose files<input type="file" accept="application/pdf,.pdf" multiple hidden onchange="psAddFiles(this.files); this.value=''"></label>.
      <div class="ps-meta">Name each file with the person’s name, e.g. “Holly Branchett.pdf”, and it goes to the right person. PDF only, up to 10 MB.</div>
    </div>
    <div id="psPending"></div>
    ${['KCA', 'SAA', 'MC', 'AQ'].filter(b => groups[b]).map(b => `
      <div class="roster-branch"><div class="roster-branch-hd">${PS_BRANCH[b]} · ${groups[b].filter(s => s.payslip).length}/${groups[b].length}</div>
      ${groups[b].map(row).join('')}</div>`).join('')}`;
  const drop = document.getElementById('psDrop');
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('dragover'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('dragover'); }));
  drop.addEventListener('drop', e => psAddFiles(e.dataTransfer.files));
  psRenderPending();
}

function psAddFiles(files) {
  [...files].forEach(f => {
    const ok = /\.pdf$/i.test(f.name) || f.type === 'application/pdf';
    PS_STATE.pending.push({ file: f, match: ok ? psMatch(f.name) : null, error: ok ? '' : 'Not a PDF', status: 'ready' });
  });
  psRenderPending();
}

function psRenderPending() {
  const el = document.getElementById('psPending');
  if (!el) return;
  const P = PS_STATE.pending;
  if (!P.length) { el.innerHTML = ''; return; }
  const opts = sel => `<option value="">Pick who this is…</option>` + PS_STATE.staff.map(s => `<option value="${s.id}"${sel && sel.id === s.id ? ' selected' : ''}>${psEsc(s.name)} (${s.branch})</option>`).join('');
  const ready = P.filter(p => p.status === 'ready' && p.match && !p.error).length;
  el.innerHTML = `<div class="ps-pending">
    ${P.map((p, i) => `<div class="ps-prow ${p.status}">
      <span class="ps-fname">${psEsc(p.file.name)}</span>
      ${p.error ? `<span class="ps-err">${psEsc(p.error)}</span>`
        : p.status === 'done' ? `<span class="ps-ok">Saved for ${psEsc(p.match.name)}</span>`
        : p.status === 'saving' ? `<span class="ps-meta">Saving…</span>`
        : `<select onchange="PS_STATE.pending[${i}].match=PS_STATE.staff.find(s=>s.id===this.value)||null; psRenderPending()">${opts(p.match)}</select>
           ${p.match && p.match.payslip ? '<span class="ps-meta">replaces the one already there</span>' : ''}`}
      ${p.status !== 'saving' ? `<button class="btn-outline" onclick="PS_STATE.pending.splice(${i},1); psRenderPending()">✕</button>` : ''}
    </div>`).join('')}
    <div style="display:flex;gap:10px;margin-top:10px">
      <button class="btn" style="width:auto;padding:10px 18px" ${ready ? '' : 'disabled'} onclick="psSaveAll()">Save ${ready} payslip${ready === 1 ? '' : 's'}</button>
      <button class="btn-outline" onclick="PS_STATE.pending=[]; psRenderPending()">Clear</button>
    </div></div>`;
}

async function psSaveAll() {
  for (const p of PS_STATE.pending) {
    if (p.status !== 'ready' || !p.match || p.error) continue;
    p.status = 'saving'; psRenderPending();
    try { await psCall({ action: 'upload', admin: psKey(), month: PS_STATE.month, staff_id: p.match.id }, p.file); p.status = 'done'; }
    catch (e) { p.status = 'ready'; p.error = e.message; }
    psRenderPending();
  }
  const keep = PS_STATE.pending.filter(p => p.status !== 'done');
  await initPayslipsTab();
  PS_STATE.pending = keep; psRenderPending();
}

async function psUploadOne(staffId, file) {
  if (!file) return;
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') { alert('Payslips must be PDF files.'); return; }
  try { await psCall({ action: 'upload', admin: psKey(), month: PS_STATE.month, staff_id: staffId }, file); await initPayslipsTab(); }
  catch (e) { alert('Couldn’t save it: ' + e.message); }
}

async function psView(staffId) {
  const w = window.open('', '_blank');
  try {
    const d = await psCall({ action: 'url', admin: psKey(), month: PS_STATE.month, staff_id: staffId });
    if (d.url) w.location = d.url; else { w.close(); alert('No payslip for this month.'); }
  } catch (e) { w.close(); alert(e.message); }
}

async function psRemove(staffId) {
  const s = PS_STATE.staff.find(x => x.id === staffId);
  if (!confirm(`Remove ${s ? s.name + '’s' : 'this'} payslip for this month?`)) return;
  try { await psCall({ action: 'delete', admin: psKey(), month: PS_STATE.month, staff_id: staffId }); await initPayslipsTab(); }
  catch (e) { alert(e.message); }
}
