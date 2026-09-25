// Reviews come from google_reviews on the dashboard's Supabase, kept current by
// apps-script/sync-google-reviews.gs. data.js (the 24 Sep 2026 pull) is only
// loaded if Supabase can't be reached, and the note then says it's the old copy.
const SUPA_URL = "https://gvijxenafoowajqktqvd.supabase.co";
const SUPA_KEY = "sb_publishable_e5o0vPayb-6552oARTeu7Q_KoqfT7xO";
// The dashboard's sign-in session (auth.js, 25 Sep 2026); the public key alone can't read these once Phase B is on.
const authHeaders = () => (window.TRSAuth ? TRSAuth.headers() : {apikey:SUPA_KEY, Authorization:"Bearer "+SUPA_KEY});
let R = [], META, TODAY, SYNC = null;
const BRANCHES = ["Khalifa City A, Abu Dhabi","Saadiyat, Abu Dhabi","Al Quoz, Dubai","Motor City, Dubai","District 2, Bahrain"];
const SHORT = {"Khalifa City A, Abu Dhabi":"Khalifa City A","Saadiyat, Abu Dhabi":"Saadiyat","Al Quoz, Dubai":"Al Quoz","Motor City, Dubai":"Motor City","District 2, Bahrain":"Bahrain"};
const REC = [["30","Last 30 days"],["90","Last 90 days"],["180","Last 6 months"],["365","Last 12 months"],["730","Last 2 years"],["all","All time"]];
const ALL = [1,2,3,4,5];
const state = {branches:new Set(BRANCHES), stars:new Set(ALL), rec:"all", withText:false, noReply:false, q:"", sort:"new", staff:""};

// ── Staff named in reviews (Kate, 25 Sep 2026) ───────────────────────────
// Who a review names is decided by staff_name_variants in Supabase: every
// spelling we accept per person (name, nicknames, typos clients really made).
// The Staff Performance pages read the same table (perf_review_names), so the
// two always agree. Names and photos come from ../../staff-profiles.js, the same
// list Staff Cards uses, so leavers stay in for history.
//   loose spellings match in any case ("nikki" = Nikki) at any UAE branch
//   strict spellings (May, Grace, Shine, Robin...) match only capitalised and at
//   the person's own branch
//   never the reviewer's own name; April / May not when they read as a month;
//   not_after: never right after that word (the table's own exceptions)
// People who aren't in staff-profiles.js (kept off Staff Cards on purpose) but
// whose reviews still count come from the table too: label / home_branch / photo
// on their name row. Daisy Cropper, Managing Director of TRS Bahrain, is one, so
// Bahrain reviews count for whoever's home it is.
const BR_OF = {KCA:"Khalifa City A, Abu Dhabi", SAA:"Saadiyat, Abu Dhabi", MC:"Motor City, Dubai", AQ:"Al Quoz, Dubai", BAH:"District 2, Bahrain"};
const MONTH_BEFORE = /(?:\b(?:in|on|of|since|last|this|next|early|late|mid|from|until|till|during|by)\s+)$/i;
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordRe = (list, flags) => list.length ? new RegExp("(?<![\\p{L}])(" + list.map(reEsc).join("|") + ")(?![\\p{L}])", flags + "u") : null;
let STAFF = [], VARIANTS = null;
// Reviews that name nobody but came from a client of that stylist within 14 days
// of a visit (google_review_client_credit view, built from the sales lines).
let CLIENT_CREDIT = {};
async function loadClientCredit(){
  try {
    const res = await fetch(`${SUPA_URL}/rest/v1/google_review_client_credit?select=review_id,staff_key`, {headers:authHeaders()});
    if (res.ok) (await res.json()).forEach(c => { if (c.staff_key) (CLIENT_CREDIT[c.review_id] ||= []).push(c.staff_key); });
  } catch (e) { console.warn("google_review_client_credit unreachable", e); }
}
async function loadVariants(){
  try {
    const res = await fetch(`${SUPA_URL}/rest/v1/staff_name_variants?select=staff_key,variant,strict,not_after,label,home_branch,photo`, {headers:authHeaders()});
    if (res.ok) VARIANTS = await res.json();
  } catch (e) { console.warn("staff_name_variants unreachable, matching on first names only", e); }
}
function buildStaff(){
  if (typeof STAFF_PROFILES === "undefined") return;
  const by = {};
  (VARIANTS || []).forEach(v => (by[v.staff_key] ||= []).push(v));
  const seen = new Set();
  const make = (k, p, label) => {
    const vs = by[k] || [{variant: label, strict: false}];   // offline: first name only
    const loose = vs.filter(v => !v.strict).map(v => v.variant).sort((a,b) => b.length - a.length);
    const strict = vs.filter(v => v.strict).map(v => v.variant).sort((a,b) => b.length - a.length);
    return {key:k, label, names: vs.map(v => v.variant), branch:BR_OF[p.branch] || null, role:p.role || "", resigned:!!p.resigned,
      photo: p.photoFull ? "../../" + encodeURI(p.photoFull) : p.photo ? "../../assets/staff/" + encodeURIComponent(p.photo) : null,
      notAfter: Object.fromEntries(vs.filter(v => v.not_after).map(v => [v.variant.toLowerCase(), new RegExp("(?<![\\p{L}])" + reEsc(v.not_after) + "\\s+$", "iu")])),
      loose: wordRe(loose, "gi"), strict: wordRe(strict, "g")};
  };
  // People in the table with no profile: name row carries label / home_branch / photo.
  const extra = Object.entries(by).filter(([k]) => !STAFF_PROFILES[k]).map(([k, vs]) => {
    const row = vs.find(v => v.label || v.home_branch || v.photo) || vs[0];
    return make(k, {branch: row.home_branch, photoFull: row.photo || null}, row.label || row.variant);
  });
  STAFF = [...Object.entries(STAFF_PROFILES).filter(([k]) => !k.includes("/")).map(([k,p]) => {
    const label = k.length <= 2 ? k : k.toLowerCase().replace(/(^|\s)[a-z]/g, c => c.toUpperCase());
    return make(k, p, label);
  }), ...extra].filter(s => { const id = s.photo || s.key; if (seen.has(id)) return false; seen.add(id); return true; });
}
// Which staff a review names, and where, so the text can highlight them.
function tagStaff(r){
  r.staff = []; r.hits = []; r.viaClient = false;
  if (!r.comment) { if (r.id && CLIENT_CREDIT[r.id]) { r.staff = [...new Set(CLIENT_CREDIT[r.id])]; r.viaClient = true; } return; }
  r.staff = [];
  const bahrain = r.branch === "District 2, Bahrain";
  STAFF.forEach(s => {
    // Bahrain reviews only count for someone whose home is Bahrain.
    if (bahrain && s.branch !== r.branch) return;
    // A client signing off with her own name ("... Maria.") isn't naming a stylist.
    const own = s.names.find(n => wordRe([n], "i").test(r.reviewer || ""));
    const hits = [];
    [[s.loose, true], [s.strict, r.branch === s.branch]].forEach(([re, ok]) => {
      if (!re || !ok) return;
      re.lastIndex = 0; let m;
      while ((m = re.exec(r.comment))) {
        const w = m[1];
        if (own && own.toLowerCase() === w.toLowerCase()) continue;
        const na = s.notAfter[w.toLowerCase()];
        if (na && na.test(r.comment.slice(Math.max(0, m.index - 20), m.index))) continue;
        if ((w === "April" || w === "May") &&
            (MONTH_BEFORE.test(r.comment.slice(Math.max(0, m.index - 12), m.index)) || /^\s*\d/.test(r.comment.slice(m.index + w.length)))) continue;
        hits.push([m.index, m.index + w.length]);
      }
    });
    if (hits.length) { r.staff.push(s.key); r.hits.push(...hits); }
  });
  // Nobody named: fall back to whoever served this reviewer just before.
  r.viaClient = false;
  if (!r.staff.length && r.id && CLIENT_CREDIT[r.id]) { r.staff = [...new Set(CLIENT_CREDIT[r.id])]; r.viaClient = true; }
}
const staffBy = k => STAFF.find(s => s.key === k);
function markNames(r){
  if (!r.hits || !r.hits.length) return esc(r.comment);
  const hs = [...r.hits].sort((a,b) => a[0]-b[0]); let out = "", at = 0;
  hs.forEach(([a,b]) => { if (a < at) return; out += esc(r.comment.slice(at, a)) + "<mark>" + esc(r.comment.slice(a, b)) + "</mark>"; at = b; });
  return out + esc(r.comment.slice(at));
}
const days = d => (TODAY - new Date(d+"T00:00:00"))/864e5;
const esc = s => s.replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const setEq = (a,b) => a.size===b.length && b.every(x=>a.has(x));

function windowStart(rec){ if(rec==="all") return null; const d=new Date(TODAY); d.setDate(d.getDate()-(+rec)); return d.toISOString().slice(0,10); }
function isComplete(rec, branches){
  const ws = windowStart(rec);
  return [...branches].every(b => META.cover[b]===null || (ws && ws >= META.cover[b]));
}

function baseFilter(skip){
  return R.filter(r =>
    (skip==="branch" || state.branches.has(r.branch)) &&
    (skip==="stars" || state.stars.has(r.stars)) &&
    (skip==="rec" || state.rec==="all" || days(r.date) <= +state.rec) &&
    (!state.withText || r.comment) && (!state.noReply || !r.replied) &&
    (skip==="staff" || !state.staff || (state.staff==="__any" ? r.staff.length : r.staff.includes(state.staff))) &&
    (!state.q || (r.comment+" "+r.reviewer+" "+r.reply).toLowerCase().includes(state.q.toLowerCase())));
}
function chip(label, on, n, fn, extra){
  const b=document.createElement("button"); b.className="chip"+(on?" on":"");
  b.innerHTML=esc(label)+(extra||"")+(n!==null?` <span class="n">${n}</span>`:""); b.onclick=fn; return b;
}
function sep(){const d=document.createElement("span");d.className="sep";return d;}
function toggle(set, all, v){
  if(set.size===all.length) return new Set([v]);
  if(set.has(v)){ set.delete(v); return set.size? set : new Set(all); }
  set.add(v); return set;
}
function renderFilters(){
  const fb=document.getElementById("fBranch"); fb.innerHTML="";
  const pb=baseFilter("branch");
  fb.appendChild(chip("All", state.branches.size===BRANCHES.length, pb.length, ()=>{state.branches=new Set(BRANCHES);render();}));
  BRANCHES.forEach(b=>fb.appendChild(chip(SHORT[b], state.branches.has(b) && state.branches.size!==BRANCHES.length, pb.filter(r=>r.branch===b).length, ()=>{state.branches=toggle(state.branches,BRANCHES,b);render();})));

  const fs=document.getElementById("fStars"); fs.innerHTML="";
  const ps=baseFilter("stars");
  fs.appendChild(chip("All", setEq(state.stars,ALL), ps.length, ()=>{state.stars=new Set(ALL);render();}));
  fs.appendChild(chip("Complaints 1–3★", setEq(state.stars,[1,2,3]), ps.filter(r=>r.stars<=3).length, ()=>{state.stars=new Set([1,2,3]);render();}));
  fs.appendChild(chip("Positive 4–5★", setEq(state.stars,[4,5]), ps.filter(r=>r.stars>=4).length, ()=>{state.stars=new Set([4,5]);render();}));
  fs.appendChild(sep());
  const single = !setEq(state.stars,ALL) && !setEq(state.stars,[1,2,3]) && !setEq(state.stars,[4,5]);
  ALL.forEach(s=>fs.appendChild(chip(s+"★", single && state.stars.has(s), ps.filter(r=>r.stars===s).length, ()=>{
    if(!single) state.stars=new Set([s]); else state.stars=toggle(state.stars,ALL,s);
    render();})));

  const fr=document.getElementById("fRec"); fr.innerHTML="";
  const pr=baseFilter("rec");
  REC.forEach(([k,l])=>{
    const full = isComplete(k, state.branches);
    fr.appendChild(chip(l, state.rec===k, k==="all"?pr.length:pr.filter(r=>days(r.date)<=+k).length, ()=>{state.rec=k;render();}, ""));
  });
  const fst=document.getElementById("fStaff");
  if (fst) {
    const pst=baseFilter("staff"), cnt={};
    pst.forEach(r=>r.staff.forEach(k=>cnt[k]=(cnt[k]||0)+1));
    const any=pst.filter(r=>r.staff.length).length;
    const opts=STAFF.filter(s=>cnt[s.key]||s.key===state.staff).sort((a,b)=>(cnt[b.key]||0)-(cnt[a.key]||0)||a.label.localeCompare(b.label));
    fst.innerHTML=`<option value="">All reviews</option><option value="__any"${state.staff==="__any"?" selected":""}>Names any staff (${any})</option>`+
      opts.map(s=>`<option value="${esc(s.key)}"${s.key===state.staff?" selected":""}>${esc(s.label)}${s.resigned?" (former)":""} · ${cnt[s.key]||0}</option>`).join("");
  }
  const fm=document.getElementById("fMore"); fm.innerHTML="";
  fm.appendChild(chip("With written comment only", state.withText, null, ()=>{state.withText=!state.withText;render();}));
  fm.appendChild(chip("No reply yet", state.noReply, null, ()=>{state.noReply=!state.noReply;render();}));
}
function renderKpis(F){
  const low=F.filter(r=>r.stars<=3).length, hi=F.length-low;
  const avg=F.length?(F.reduce((a,r)=>a+r.stars,0)/F.length).toFixed(2):"–";
  const replied=F.filter(r=>r.replied).length;
  const recLabel = REC.find(x=>x[0]===state.rec)[1].toLowerCase();
  const pct=n=>F.length?Math.round(n/F.length*100):0;
  document.getElementById("kpis").innerHTML=`
   <div class="kpi"><div class="l">Reviews shown</div><div class="v">${F.length}</div><div class="h">${recLabel}</div></div>
   <div class="kpi"><div class="l">Average rating</div><div class="v">${avg}<span style="font-size:16px;color:var(--faint)">★</span></div><div class="h">of filtered reviews</div></div>
   <div class="kpi"><div class="l">Complaints (1–3★)</div><div class="v" style="color:var(--s1)">${low}</div><div class="h">${pct(low)}% of filtered</div></div>
   <div class="kpi"><div class="l">Positive (4–5★)</div><div class="v" style="color:var(--s5)">${hi}</div><div class="h">${pct(hi)}% of filtered</div></div>
   <div class="kpi"><div class="l">Replied</div><div class="v">${F.length?Math.floor(replied/F.length*1000)/10:0}%</div><div class="h">${F.length-replied} without a reply</div></div>`;
}
function renderExact(){
  const E=META.exact, T=META.totals;
  const cell=(b,s)=>{const v=E[b][String(s)]; if(v!==null) return `<td>${v.toLocaleString()}</td>`;
    if(s===3) return `<td class="q" title="At least 12; Google caps results at 50">12+</td>`;
    return `<td class="q" title="Google doesn't expose this split for Khalifa City A">–</td>`;};
  let rows=BRANCHES.map(b=>{
    const low=[1,2,3].reduce((a,s)=>a+(E[b][s]===null&&s===3?12:(E[b][s]||0)),0);
    const lowTxt = E[b]["3"]===null? low+"+" : low;
    return `<tr><td>${SHORT[b]}</td>${ALL.map(s=>cell(b,s)).join("")}<td><b>${T[b].toLocaleString()}</b></td><td>${META.avg[b].toFixed(2)}★</td><td>${lowTxt} <span style="color:var(--faint)">(${(low/T[b]*100).toFixed(1)}%${E[b]["3"]===null?"+":""})</span></td></tr>`;}).join("");
  const sum=s=>BRANCHES.reduce((a,b)=>a+(E[b][String(s)]===null&&s===3?12:(E[b][String(s)]||0)),0);
  const tot=BRANCHES.reduce((a,b)=>a+T[b],0);
  const lowAll=[1,2,3].reduce((a,s)=>a+sum(s),0);
  rows+=`<tr class="tot"><td>All branches</td><td>${sum(1)}</td><td>${sum(2)}</td><td>${sum(3)}</td><td>${sum(4)}</td><td>${sum(5).toLocaleString()}</td><td>${tot.toLocaleString()}</td><td></td><td>${lowAll} (${(lowAll/tot*100).toFixed(1)}%)</td></tr>`;
  document.getElementById("exact").innerHTML=`<div style="overflow-x:auto"><table class="ex" style="min-width:620px"><thead><tr><th>Branch</th><th>1★</th><th>2★</th><th>3★</th><th>4★</th><th>5★</th><th>Total</th><th>Avg</th><th>1–3★ share</th></tr></thead><tbody>${rows}</tbody></table></div>
  `;
}
function renderBranches(){
  const F=baseFilter("branch");
  const max=Math.max(1,...BRANCHES.map(b=>F.filter(r=>r.branch===b).length));
  const el=document.getElementById("branches"); el.innerHTML="";
  BRANCHES.forEach(b=>{
    const rs=F.filter(r=>r.branch===b), n=rs.length, dim=!state.branches.has(b);
    const seg=s=>{const k=rs.filter(r=>r.stars===s).length; return k?`<span style="width:${k/max*100}%;background:var(--s${s})" title="${s}★: ${k}"></span>`:"";};
    const low=rs.filter(r=>r.stars<=3).length;
    const row=document.createElement("div"); row.className="brow"; row.style.opacity=dim?.4:1;
    row.innerHTML=`<div class="bname" title="${b}">${SHORT[b]}</div><div class="bar">${ALL.map(seg).join("")}</div><div class="bval"><b>${n}</b> <small>${low} complaint${low===1?"":"s"}</small></div>`;
    row.onclick=()=>{state.branches=new Set([b]);render();};
    el.appendChild(row);
  });
}
// Who clients name, within every filter except the staff one.
let STAFF_ALL=false;
// Kate, 25 Sep 2026: All / Hair / Beauty on the board, read off each person's role.
// Assistants work the hair floor, so they count as Hair.
let STAFF_DEPT="all";
const BEAUTY_ROLES=new Set(["Beauty Therapist","Senior Beauty Therapist","Nail Technician","Senior Nail Technician","Beauty Team Member"]);
const deptOf=s=>BEAUTY_ROLES.has(s.role)?"beauty":"hair";
document.getElementById("staffDept")?.addEventListener("click",e=>{
  const b=e.target.closest("button[data-d]"); if(!b||b.dataset.d===STAFF_DEPT) return;
  STAFF_DEPT=b.dataset.d; STAFF_ALL=false;
  b.parentElement.querySelectorAll("button").forEach(x=>{const on=x===b; x.classList.toggle("on",on); x.setAttribute("aria-pressed",String(on));});
  renderStaffBoard();
});
function renderStaffBoard(){
  const el=document.getElementById("staffBoard"); if(!el) return;
  const F=baseFilter("staff"), rows={};
  F.forEach(r=>r.staff.forEach(k=>{(rows[k] ||= []).push(r);}));
  const list=Object.entries(rows).map(([k,rs])=>({s:staffBy(k),rs})).filter(x=>x.s&&(STAFF_DEPT==="all"||deptOf(x.s)===STAFF_DEPT)).sort((a,b)=>b.rs.length-a.rs.length||a.s.label.localeCompare(b.s.label));
  if(!list.length){el.innerHTML=`<div class="empty" style="padding:20px">No ${STAFF_DEPT==="all"?"":STAFF_DEPT+" "}staff named in these reviews.</div>`;return;}
  const max=list[0].rs.length, show=STAFF_ALL?list:list.slice(0,12);
  el.innerHTML=show.map(({s,rs})=>{
    const seg=st=>{const k=rs.filter(r=>r.stars===st).length;return k?`<span style="width:${k/max*100}%;background:var(--s${st})" title="${st}★: ${k}"></span>`:"";};
    const low=rs.filter(r=>r.stars<=3).length, avg=(rs.reduce((a,r)=>a+r.stars,0)/rs.length).toFixed(1);
    return `<div class="srow${state.staff===s.key?" on":""}" data-k="${esc(s.key)}">
      ${s.photo?`<img src="${s.photo}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`:`<span class="sph"></span>`}
      <div class="sname"><b>${esc(s.label)}</b><small>${esc((s.branch?SHORT[s.branch]:"")+(s.resigned?" · former":""))}</small></div>
      <div class="bar">${ALL.map(seg).join("")}</div>
      <div class="bval"><b>${rs.length}</b> <small>${avg}★${low?` · ${low} complaint${low===1?"":"s"}`:""}</small></div></div>`;}).join("")
    + (list.length>12?`<div style="text-align:center;margin-top:8px"><button class="chip" id="staffAll">${STAFF_ALL?"Show top 12":`Show all ${list.length}`}</button></div>`:"");
  el.querySelectorAll(".srow").forEach(r=>r.onclick=()=>{state.staff=state.staff===r.dataset.k?"":r.dataset.k;render();});
  const b=document.getElementById("staffAll"); if(b) b.onclick=()=>{STAFF_ALL=!STAFF_ALL;renderStaffBoard();};
}
function renderTimeline(F){
  const tl=document.getElementById("tl"), lab=document.getElementById("tlab"); tl.innerHTML=""; lab.innerHTML="";
  let buckets=[], keyOf, per;
  if(state.rec!=="all" && +state.rec<=365){
    per="month"; const cnt=Math.max(Math.ceil(+state.rec/30.4),3);
    for(let i=cnt-1;i>=0;i--){const d=new Date(TODAY.getFullYear(),TODAY.getMonth()-i,1);buckets.push({k:d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0"),l:d.toLocaleString("en",{month:"short"})+" "+String(d.getFullYear()).slice(2)});}
    keyOf=d=>d.slice(0,7);
  } else {
    per="year"; const ys=F.length?F.map(r=>+r.date.slice(0,4)):[TODAY.getFullYear()];
    let y0=Math.min(...ys); if(state.rec==="730") y0=Math.min(y0,TODAY.getFullYear()-2);
    for(let y=y0;y<=TODAY.getFullYear();y++) buckets.push({k:String(y),l:String(y)});
    keyOf=d=>d.slice(0,4);
  }
  document.getElementById("tlTitle").textContent="Over time · per "+per;
  const counts=buckets.map(b=>ALL.map(s=>F.filter(r=>keyOf(r.date)===b.k&&r.stars===s).length));
  const max=Math.max(1,...counts.map(c=>c.reduce((a,x)=>a+x,0)));
  const tip=document.getElementById("tip");
  buckets.forEach((b,i)=>{
    const col=document.createElement("div"); col.className="tcol";
    ALL.forEach((s,j)=>{ if(counts[i][j]){const sp=document.createElement("span");sp.style.height=(counts[i][j]/max*100)+"%";sp.style.background=`var(--s${s})`;col.appendChild(sp);} });
    const tot=counts[i].reduce((a,x)=>a+x,0);
    col.onmousemove=e=>{tip.style.display="block";tip.style.left=(e.clientX+12)+"px";tip.style.top=(e.clientY-10)+"px";tip.innerHTML=`<b>${b.l}</b>: ${tot}<br>`+ALL.map((s,j)=>`${s}★ ${counts[i][j]}`).join(" · ");};
    col.onmouseleave=()=>tip.style.display="none";
    tl.appendChild(col);
    const l=document.createElement("div"); l.textContent=b.l; lab.appendChild(l);
  });
}
function fmtDate(d){return new Date(d+"T00:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"});}
function ago(d){const n=Math.round(days(d)); if(n<1)return "today"; if(n<60)return n+"d ago"; if(n<730)return Math.round(n/30.4)+"mo ago"; return Math.round(n/365)+"y ago";}
let LIMIT=60;
function renderList(F){
  const L=[...F].sort((a,b)=> state.sort==="new"? b.date.localeCompare(a.date) : state.sort==="old"? a.date.localeCompare(b.date) : state.sort==="low"? a.stars-b.stars || b.date.localeCompare(a.date) : b.stars-a.stars || b.date.localeCompare(a.date));
  document.getElementById("listTitle").textContent=`Reviews (${L.length})`;
  const el=document.getElementById("list");
  if(!L.length){el.innerHTML=`<div class="empty">No reviews match these filters.</div>`;return;}
  el.innerHTML=L.slice(0,LIMIT).map((r,i)=>{
    const st="<b>"+"★".repeat(r.stars)+"</b><em>"+"★".repeat(5-r.stars)+"</em>";
    const long=r.comment.length>380;
    return `<div class="rev s${r.stars}">
      <div class="rtop"><span class="stars">${st}</span><span class="who">${esc(r.reviewer||"Anonymous")}</span><span class="tag">${SHORT[r.branch]}</span>
      ${r.replied?'<span class="tag ok">Replied</span>':'<span class="tag no">No reply</span>'}
      ${r.staff.map(k=>{const s=staffBy(k);return s?`<button class="stag${r.viaClient?" via":""}" data-k="${esc(k)}" title="${r.viaClient?"Not named, but this reviewer was their client in the 14 days before":"Named in the review"}">${s.photo?`<img src="${s.photo}" alt="">`:""}${esc(s.label)}${r.viaClient?" · client":""}</button>`:"";}).join("")}
      <span class="date" title="${r.approx?'Approximate date from Google Maps':r.date}">${r.approx?esc((r.when||'').replace(/^Edited /,'edited '))+' · approx.':fmtDate(r.date)+' · '+ago(r.date)}</span></div>
      ${r.comment?`<div class="rtext${long?" clamp":""}" id="t${i}">${markNames(r)}</div>${long?`<button class="more" onclick="document.getElementById('t${i}').classList.toggle('clamp');this.textContent=this.textContent==='Show more'?'Show less':'Show more'">Show more</button>`:""}`:`<div class="rtext none">Rating only, no written comment</div>`}
      ${r.replied?`<details class="reply"><summary><b>Our reply</b></summary><div style="white-space:pre-wrap;margin-top:6px">${esc(r.reply)}</div></details>`:""}
      ${r.url?`<div style="margin-top:8px"><a class="gbp" href="${r.url}" target="_blank" rel="noopener">Open in Business Profile →</a></div>`:""}
    </div>`;}).join("") + (L.length>LIMIT?`<div style="text-align:center;margin-top:12px"><button class="chip" id="moreBtn">Show ${Math.min(60,L.length-LIMIT)} more of ${L.length-LIMIT} remaining</button></div>`:"");
  const mb=document.getElementById("moreBtn"); if(mb) mb.onclick=()=>{LIMIT+=60;renderList(F);};
  el.querySelectorAll(".stag").forEach(b=>b.onclick=()=>{state.staff=b.dataset.k;render();window.scrollTo(0,0);});
}
function renderNote(){
  const n=R.length.toLocaleString(), el=document.getElementById("note");
  if(!SYNC){ el.innerHTML=`<b>⚠ Offline copy: ${n} Google reviews as of 24 Sep 2026.</b> The live table couldn't be reached, so anything newer, and any reply posted since, is missing here.`; return; }
  const when=new Date(SYNC.last).toLocaleString("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit",timeZone:"Asia/Dubai"});
  el.innerHTML = SYNC.seedOnly
    ? `<b>✓ All ${n} Google reviews</b> across the 5 branches, from the 24 Sep 2026 pull. The daily sync from Business Profile starts once Google approves API access. Older reviews use Google Maps' approximate dates ("a year ago").`
    : `<b>✓ All ${n} Google reviews</b> across the 5 branches, synced from Business Profile. Last sync ${when}.`;
}
async function loadLive(){
  const rows=[], cols="review_id,branch,stars,reviewer,comment,review_date,date_approx,when_text,replied,reply,url,source,synced_at";
  for(let from=0;;from+=1000){
    const res=await fetch(`${SUPA_URL}/rest/v1/google_reviews?select=${cols}&order=review_date.desc,review_id`,{headers:{...authHeaders(),Range:`${from}-${from+999}`}});
    if(!res.ok) throw new Error("google_reviews "+res.status);
    const page=await res.json(); rows.push(...page); if(page.length<1000) break;
  }
  if(!rows.length) throw new Error("google_reviews is empty");
  R=rows.map(r=>({id:r.review_id,branch:r.branch,stars:r.stars,reviewer:r.reviewer,date:r.review_date,comment:r.comment||"",replied:r.replied,reply:r.reply||"",url:r.url,approx:r.date_approx,when:r.when_text}));
  SYNC={last:rows.reduce((m,r)=>r.synced_at>m?r.synced_at:m,""),seedOnly:rows.every(r=>r.source==="seed")};
  const today=new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Dubai"});
  const totals={},exact={},avg={},cover={};
  BRANCHES.forEach(b=>{const rs=R.filter(r=>r.branch===b);totals[b]=rs.length;cover[b]=null;
    exact[b]={};ALL.forEach(s=>exact[b][s]=rs.filter(r=>r.stars===s).length);
    avg[b]=rs.length?rs.reduce((a,r)=>a+r.stars,0)/rs.length:0;});
  META={generated:today,totals,exact,avg,cover};
}
function loadOffline(){
  return new Promise((ok,fail)=>{const s=document.createElement("script");s.src="data.js";
    s.onload=()=>{R=window.REVIEWS;META=window.META;ok();};s.onerror=fail;document.body.appendChild(s);});
}
function render(){
  const F=baseFilter();
  LIMIT=60;
  renderFilters(); renderKpis(F); renderNote(); renderBranches(); renderStaffBoard(); renderTimeline(F); renderList(F);
}
document.getElementById("q").oninput=e=>{state.q=e.target.value;render();};
document.getElementById("sort").onchange=e=>{state.sort=e.target.value;render();};
document.getElementById("reset").onclick=()=>{Object.assign(state,{branches:new Set(BRANCHES),stars:new Set(ALL),rec:"all",withText:false,noReply:false,q:"",staff:""});document.getElementById("q").value="";render();};
// Embedded in the dashboard: no own toggle and no own scrollbar. The dashboard's
// sticky-header toggle sends the theme by postMessage (direct parent access is
// blocked when the dashboard is opened from file://), and this page reports its
// height so the iframe grows to fit and only the dashboard scrolls.
const tb=document.getElementById("theme");
const setTheme=t=>{document.documentElement.setAttribute("data-theme",t);tb.textContent=t==="dark"?"Light mode":"Dark mode";};
tb.onclick=()=>setTheme(document.documentElement.getAttribute("data-theme")==="dark"?"light":"dark");
if(window.parent!==window){
  tb.style.display="none";
  document.documentElement.classList.add("embedded");
  window.addEventListener("message",e=>{
    if(e.source===window.parent&&e.data&&e.data.type==="trs-theme"){setTheme(e.data.theme==="dark"?"dark":"light");setTimeout(postH,50);}
  });
  function postH(){window.parent.postMessage({type:"trs-reviews-height",h:Math.ceil(document.body.getBoundingClientRect().height)},"*");}
  new ResizeObserver(postH).observe(document.body);
  window.parent.postMessage({type:"trs-reviews-ready"},"*");
}
loadLive().catch(e=>{console.warn("Google reviews: live load failed, using the 24 Sep copy.",e);return loadOffline();})
  .then(()=>Promise.all([loadVariants(), loadClientCredit()]))
  .then(()=>{TODAY=new Date(META.generated+"T00:00:00");buildStaff();R.forEach(tagStaff);renderExact();render();});
document.getElementById("fStaff").onchange=e=>{state.staff=e.target.value;render();};
