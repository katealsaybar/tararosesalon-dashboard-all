// Reviews come from google_reviews on the dashboard's Supabase. Since 6 Oct 2026 the
// metricool-sync edge function keeps them current nightly through Metricool (new reviews,
// replies, exact dates), for every salon connected there; apps-script/sync-google-reviews.gs
// is the Business Profile API sync still waiting on Google's approval. data.js (the 24 Sep 2026 pull) is only
// loaded if Supabase can't be reached, and the note then says it's the old copy.
const SUPA_URL = "https://gvijxenafoowajqktqvd.supabase.co";
const SUPA_KEY = "sb_publishable_e5o0vPayb-6552oARTeu7Q_KoqfT7xO";
// The dashboard's sign-in session (auth.js, 25 Sep 2026); the public key alone can't read these once Phase B is on.
const authHeaders = () => (window.TRSAuth ? TRSAuth.headers() : {apikey:SUPA_KEY, Authorization:"Bearer "+SUPA_KEY});
let R = [], META, TODAY, SYNC = null;
const BRANCHES = ["Khalifa City A, Abu Dhabi","Saadiyat, Abu Dhabi","Al Quoz, Dubai","Motor City, Dubai","District 2, Bahrain"];
const SHORT = {"Khalifa City A, Abu Dhabi":"Khalifa City A","Saadiyat, Abu Dhabi":"Saadiyat","Al Quoz, Dubai":"Al Quoz","Motor City, Dubai":"Motor City","District 2, Bahrain":"Bahrain"};
// Each review's own public Google link (Kate, 28 Sep 2026): the exact URL Google's
// Share button gives, rebuilt from the Maps review id and the branch's Maps CID.
// Opens that one review for anyone, signed in or not; the Business Profile link
// beside it stays for replying. The id is the row's review_id (an API reviewId or
// "seed:" + one), or for the older hash-keyed seed rows, review-links.js.
const MAPS_CID = {"Khalifa City A, Abu Dhabi":"0x22d8bf3bc3c4e957","Saadiyat, Abu Dhabi":"0xe3bea74269b98995","Al Quoz, Dubai":"0x662e693c3678cb39","Motor City, Dubai":"0x66221db8f29e9130","District 2, Bahrain":"0xf7a43c8e59e763dd"};
function googleReviewUrl(r){
  let id=String(r.id||"").replace(/^seed:/,"");
  if(!/^C[hi]/.test(id)) id=(window.REVIEW_MAPS_IDS||{})[id] || (String(r.url||"").match(/\/reviews\/(C[hi][\w-]+)/)||[])[1] || "";
  const cid=MAPS_CID[r.branch];
  if(!id||!cid) return "";
  let inner="";
  try{ const b=atob(id.replace(/-/g,"+").replace(/_/g,"/")); if(b.charCodeAt(0)===10) inner=b.substr(2,b.charCodeAt(1)); }catch(e){}
  return "https://www.google.com/maps/reviews/data=" + (inner
    ? `!4m8!14m7!1m6!2m5!1s${id}!2m1!1s0x0:${cid}!3m1!1s2@1:${inner}%7C%7C`
    : `!4m6!14m5!1m4!2m3!1s${id}!2m1!1s0x0:${cid}`) + "?hl=en";
}
// Reviews added by hand before review-links.js knows their Maps id (Kate, 2 Oct
// 2026: Tiffany's had no link at all) still get both links: the branch's Google
// listing, and its reviews page in Business Profile (location ids below).
const GBP_LOC = {"Khalifa City A, Abu Dhabi":"5307528376474579201","Saadiyat, Abu Dhabi":"1607584651014081566","Al Quoz, Dubai":"15851980431586936756","Motor City, Dubai":"1197765864514331563","District 2, Bahrain":"9531547727804411119"};
const branchMapsUrl = r => MAPS_CID[r.branch] ? "https://www.google.com/maps?cid=" + BigInt(MAPS_CID[r.branch]).toString() + "&hl=en" : "";
const branchGbpUrl = r => GBP_LOC[r.branch] ? `https://www.google.com/local/business/${GBP_LOC[r.branch]}/customers/reviews?knm=0&ih=lu&hl=en&dcs=1` : "";
const ALL = [1,2,3,4,5];
const CODE_TO_BRANCH={KCA:"Khalifa City A, Abu Dhabi",SAA:"Saadiyat, Abu Dhabi",AQ:"Al Quoz, Dubai",MC:"Motor City, Dubai",BAH:"District 2, Bahrain"};
// Branch and window are the dashboard's masthead bar (Kate, 8 Oct 2026): dashboard.js
// postReviewsBranch sends them as trs-reviews-filter and applyFilter below takes them,
// so this page keeps only what is specific to reviews (rating, staff, comments, search).
// Until the first message arrives it reads the last 90 days (the 1 Oct 2026 default:
// "All time" averaged years of reviews and hid the recent trend; the official all-time
// totals stay in their own table). range.from null means all time.
const state = {branches:new Set(BRANCHES), range:null, stars:new Set(ALL), withText:false, noReply:false, withPhotos:false, q:"", sort:"new", staff:""};
const isoLocal = d => d.toLocaleDateString("en-CA");
function curRange(){
  if(state.range) return state.range;
  const f=new Date(TODAY); f.setDate(f.getDate()-89);
  return {from:isoLocal(f), to:isoLocal(TODAY), label:"Last 90 days"};
}
const inRange = d => { const r=curRange(); return (!r.from || d>=r.from) && d<=r.to; };

// ── Staff named in reviews (Kate, 25 Sep 2026) ───────────────────────────
// Who a review names is decided by staff_name_variants in Supabase: every
// spelling we accept per person (name, nicknames, typos clients really made).
// The Staff Performance pages read the same table (perf_review_names), so the
// two always agree. Names and photos come from ../../staff-profiles.js, the same
// list Staff Cards uses, so leavers stay in for history.
//   loose spellings match in any case ("nikki" = Nikki) at any UAE branch
//   strict spellings (May, Grace, Shine, Robin...) match only capitalised and at
//   the person's own branch; a strict spelling marked ci (Lyn, Lynn, Leen for Irlyn,
//   8 Oct 2026) keeps the own-branch rule but matches in any case ("lyn" typed small)
//   never the reviewer's own name; April / May not when they read as a month;
//   not_after: never right after that word (the table's own exceptions)
// People who aren't in staff-profiles.js (kept off Staff Cards on purpose) but
// whose reviews still count come from the table too: label / home_branch / photo
// / role (role decides hair or beauty) on their name row. Daisy Cropper, Managing
// Director of TRS Bahrain, is one, so Bahrain reviews count for whoever's home it
// is; Kerryn, Charlene, Simi and Farwa (Bahrain, 1 Oct 2026) are the others.
const BR_OF = {KCA:"Khalifa City A, Abu Dhabi", SAA:"Saadiyat, Abu Dhabi", MC:"Motor City, Dubai", AQ:"Al Quoz, Dubai", BAH:"District 2, Bahrain"};
const MONTH_BEFORE = /(?:\b(?:in|on|of|since|last|this|next|early|late|mid|from|until|till|during|by)\s+)$/i;
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordRe = (list, flags) => list.length ? new RegExp("(?<![\\p{L}])(" + list.map(reEsc).join("|") + ")(?![\\p{L}])", flags + "u") : null;
// Kate, 9 Oct 2026: a strict first name (Hazel, Grace...) only counts at the person's own branch, because the same first
// name at another branch is often someone else (a 2020 Saadiyat "Hazel" was the receptionist). When someone worked at a
// second branch for a stretch, the extra branch is listed here: Hazel Mae Marco was at Al Quoz from Oct 2023 to Dec 2025,
// then back at Khalifa City A, so "Hazel was super amazing" on an Al Quoz review in 2025 is hers.
const ALSO_BRANCH = {"HAZEL MAE": ["AQ"]};
const atBranch = (s, r) => r.branch === s.branch || (s.also || []).includes(r.branch);
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
    const res = await fetch(`${SUPA_URL}/rest/v1/staff_name_variants?select=staff_key,variant,strict,ci,not_after,label,home_branch,photo,role`, {headers:authHeaders()});
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
    const strict = vs.filter(v => v.strict && !v.ci).map(v => v.variant).sort((a,b) => b.length - a.length);
    const strictCi = vs.filter(v => v.strict && v.ci).map(v => v.variant).sort((a,b) => b.length - a.length);
    return {key:k, label, names: vs.map(v => v.variant), branch:BR_OF[p.branch] || null, also:(ALSO_BRANCH[k] || []).map(b => BR_OF[b]), role:p.role || "", resigned:!!p.resigned,
      photo: p.photoFull ? "../../" + encodeURI(p.photoFull) : p.photo ? "../../assets/staff/" + encodeURIComponent(p.photo) : null,
      notAfter: Object.fromEntries(vs.filter(v => v.not_after).map(v => [v.variant.toLowerCase(), new RegExp("(?<![\\p{L}])" + reEsc(v.not_after) + "\\s+$", "iu")])),
      loose: wordRe(loose, "gi"), strict: wordRe(strict, "g"), strictCi: wordRe(strictCi, "gi")};
  };
  // People in the table with no profile: name row carries label / home_branch / photo.
  const extra = Object.entries(by).filter(([k]) => !STAFF_PROFILES[k]).map(([k, vs]) => {
    const row = vs.find(v => v.label || v.home_branch || v.photo || v.role) || vs[0];
    return make(k, {branch: row.home_branch, photoFull: row.photo || null, role: row.role || ""}, row.label || row.variant);
  });
  STAFF = [...Object.entries(STAFF_PROFILES).filter(([k]) => !k.includes("/")).map(([k,p]) => {
    const label = k.length <= 2 ? k : k.toLowerCase().replace(/(^|\s)[a-z]/g, c => c.toUpperCase());
    return make(k, p, label);
  }), ...extra].filter(s => { const id = s.photo || s.key; if (seen.has(id)) return false; seen.add(id); return true; });
}
// Which staff a review names, and where, so the text can highlight them. Then, Kate 9 Oct 2026: whoever is tagged by hand
// (google_reviews.staff_manual: a review that names nobody but is plainly one stylist's, her photo shows him) is added;
// r.named keeps what the text itself named, so the tag can say which is which.
function tagStaff(r){
  tagStaffAuto(r);
  r.named = r.viaClient ? [] : r.staff.slice();
  const man = (r.manual || []).filter(k => staffBy(k));
  if (man.length) { r.staff = [...new Set([...r.named, ...man])]; r.viaClient = false; }
}
function tagStaffAuto(r){
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
    [[s.loose, true], [s.strict, atBranch(s, r)], [s.strictCi, atBranch(s, r)]].forEach(([re, ok]) => {
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

// Kate, 9 Oct 2026: a written review whose text names no stylist the tagger recognised: no name at all, or a name
// spelled a way the list does not know (Irlyn and the like), so it sits untagged. A review credited to the stylist
// who served the reviewer just before (viaClient) still counts, because its own words named nobody.
const noStaffNamed = r => !!r.comment && !(r.hits && r.hits.length) && !(r.manual && r.manual.length);
function baseFilter(skip){
  return R.filter(r =>
    (skip==="branch" || state.branches.has(r.branch)) &&
    (skip==="stars" || state.stars.has(r.stars)) &&
    (skip==="range" || inRange(r.date)) &&
    (!state.withText || r.comment) && (!state.noReply || !r.replied) && (!state.withPhotos || r.photos.length) &&
    (skip==="staff" || !state.staff || (state.staff==="__any" ? r.staff.length : state.staff==="__none" ? noStaffNamed(r) : r.staff.includes(state.staff))) &&
    (!state.q || (r.comment+" "+r.reviewer+" "+r.reply).toLowerCase().includes(state.q.toLowerCase())));
}
// short: the phone panel's label (index.html swaps it in under the phone band).
function chip(label, on, n, fn, extra, short){
  const b=document.createElement("button"); b.className="chip"+(on?" on":"");
  b.innerHTML=(short?`<span class="lb">${esc(label)}</span><span class="sh">${esc(short)}</span>`:esc(label))+(extra||"")+(n!==null?` <span class="n">${n}</span>`:""); b.onclick=fn; return b;
}
function sep(){const d=document.createElement("span");d.className="sep";return d;}
function toggle(set, all, v){
  if(set.size===all.length) return new Set([v]);
  if(set.has(v)){ set.delete(v); return set.size? set : new Set(all); }
  set.add(v); return set;
}
function renderFilters(){
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

  const fst=document.getElementById("fStaff");
  if (fst) {
    const pst=baseFilter("staff"), cnt={};
    pst.forEach(r=>r.staff.forEach(k=>cnt[k]=(cnt[k]||0)+1));
    const any=pst.filter(r=>r.staff.length).length, none=pst.filter(noStaffNamed).length;
    const opts=STAFF.filter(s=>cnt[s.key]||s.key===state.staff).sort((a,b)=>(cnt[b.key]||0)-(cnt[a.key]||0)||a.label.localeCompare(b.label));
    fst.innerHTML=`<option value="">All reviews</option><option value="__any"${state.staff==="__any"?" selected":""}>Names any staff (${any})</option><option value="__none"${state.staff==="__none"?" selected":""}>Written, no staff named (${none})</option>`+
      opts.map(s=>`<option value="${esc(s.key)}"${s.key===state.staff?" selected":""}>${esc(s.label)}${s.resigned?" (former)":""} · ${cnt[s.key]||0}</option>`).join("");
  }
  const fm=document.getElementById("fMore"); fm.innerHTML="";
  fm.appendChild(chip("With written comment only", state.withText, null, ()=>{state.withText=!state.withText;render();}));
  fm.appendChild(chip("No reply yet", state.noReply, null, ()=>{state.noReply=!state.noReply;render();}));
  fm.appendChild(chip("With client photos", state.withPhotos, null, ()=>{state.withPhotos=!state.withPhotos;render();}));
  renderSummary();
}
// The phone filter bar (Kate, 2 Oct 2026): what's on, as pills that clear on a tap.
// Branch and window are the masthead's now, so only the refine filters get pills; the
// count line names the window. Hidden above the phone band (index.html).
function renderSummary(){
  const F=baseFilter(), pills=[];
  if(!setEq(state.stars,ALL)){
    const l=setEq(state.stars,[1,2,3])?"Complaints 1–3★":setEq(state.stars,[4,5])?"Positive 4–5★":ALL.filter(x=>state.stars.has(x)).map(x=>x+"★").join(", ");
    pills.push([l, ()=>{state.stars=new Set(ALL);}]);
  }
  if(state.staff){
    const s=STAFF.find(x=>x.key===state.staff);
    pills.push([state.staff==="__any"?"Names any staff":state.staff==="__none"?"Written, no staff named":(s?s.label:state.staff), ()=>{state.staff="";}]);
  }
  if(state.withText) pills.push(["With comment", ()=>{state.withText=false;}]);
  if(state.noReply) pills.push(["No reply yet", ()=>{state.noReply=false;}]);
  if(state.withPhotos) pills.push(["With photos", ()=>{state.withPhotos=false;}]);
  if(state.q) pills.push(["“"+state.q+"”", ()=>{state.q="";document.getElementById("q").value="";}]);
  const fp=document.getElementById("fPills"); fp.innerHTML="";
  pills.forEach(([l,clear])=>{
    const b=document.createElement("button"); b.type="button"; b.className="pill";
    b.setAttribute("aria-label","Clear "+l); b.innerHTML=`<span>${esc(l)}</span><i aria-hidden="true">×</i>`;
    b.onclick=()=>{clear();render();}; fp.appendChild(b);
  });
  document.getElementById("fBadge").textContent=pills.length||"";
  const recLabel=curRange().label;
  document.getElementById("fCount").innerHTML=`<b>${F.length.toLocaleString("en-GB")}</b> review${F.length===1?"":"s"} · ${esc(recLabel)}`;
  document.getElementById("fDoneN").textContent=F.length.toLocaleString("en-GB");
}
let onFiltersToggle=()=>{};
function setFiltersOpen(open){
  document.getElementById("filters").classList.toggle("open",open);
  document.getElementById("fOpen").setAttribute("aria-expanded",open);
  onFiltersToggle();
}
document.getElementById("fOpen").onclick=()=>setFiltersOpen(!document.getElementById("filters").classList.contains("open"));
document.getElementById("fDone").onclick=()=>setFiltersOpen(false);
function renderKpis(F){
  const low=F.filter(r=>r.stars<=3).length, hi=F.length-low;
  const avg=F.length?(F.reduce((a,r)=>a+r.stars,0)/F.length).toFixed(2):"–";
  const replied=F.filter(r=>r.replied).length;
  const rl = curRange().label, recLabel = /^(Last|This|All)/.test(rl) ? rl.toLowerCase() : rl;
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
    // A tap picks that branch on the dashboard's own bar.
    row.onclick=()=>{ if(window.parent!==window) window.parent.postMessage({type:"trs-reviews-pickbranch",code:Object.keys(CODE_TO_BRANCH).find(c=>CODE_TO_BRANCH[c]===b)},"*"); };
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
// Hide / Show the whole card (Kate, 9 Oct 2026), remembered in this browser. Storage can be
// blocked (private window, frame sandbox), so every read and write is wrapped.
(function(){
  const card=document.getElementById("staffCard"), btn=document.getElementById("staffToggle"); if(!card||!btn) return;
  const KEY="trs-reviews-staff-open";
  const set=(open,save)=>{ card.classList.toggle("collapsed",!open); btn.textContent=open?"Hide":"Show"; btn.setAttribute("aria-expanded",String(open));
    if(save){ try{ localStorage.setItem(KEY,open?"1":"0"); }catch(e){} } };
  let open=true; try{ if(localStorage.getItem(KEY)==="0") open=false; }catch(e){}
  set(open,false);
  btn.onclick=()=>set(card.classList.contains("collapsed"),true);
})();
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
  // Bars follow the window: weeks up to about six weeks, months up to about two years,
  // years beyond that (and for all time). Each bucket is an [a, b] pair of ISO dates.
  const rg=curRange(), toD=new Date(rg.to+"T00:00:00");
  const fromD=rg.from?new Date(rg.from+"T00:00:00"):new Date((F.length?Math.min(...F.map(r=>+r.date.slice(0,4))):toD.getFullYear())+"-01-01T00:00:00");
  const span=(toD-fromD)/864e5+1;
  let buckets=[], per;
  const iso=d=>d.toLocaleDateString("en-CA");
  if(rg.from && span<=45){
    per="week";
    for(let e=new Date(toD); e>=fromD; e.setDate(e.getDate()-7)){
      const a=new Date(e); a.setDate(a.getDate()-6); if(a<fromD) a.setTime(fromD.getTime());
      buckets.unshift({a:iso(a),b:iso(e),l:a.getDate()+" "+a.toLocaleString("en",{month:"short"})});
    }
  } else if(rg.from && span<=800){
    per="month";
    for(let d=new Date(fromD.getFullYear(),fromD.getMonth(),1); d<=toD; d.setMonth(d.getMonth()+1)){
      const e=new Date(d.getFullYear(),d.getMonth()+1,0);
      buckets.push({a:iso(d),b:iso(e),l:d.toLocaleString("en",{month:"short"})+" "+String(d.getFullYear()).slice(2)});
    }
  } else {
    per="year";
    for(let y=fromD.getFullYear();y<=toD.getFullYear();y++) buckets.push({a:y+"-01-01",b:y+"-12-31",l:String(y)});
  }
  document.getElementById("tlTitle").textContent="Over time · per "+per;
  const counts=buckets.map(b=>ALL.map(s=>F.filter(r=>r.date>=b.a&&r.date<=b.b&&r.stars===s).length));
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
// "ago" is counted from the real date, not from TODAY. TODAY is the snapshot's date
// when the live table is out of reach, so an offline copy from 24 Sep printed
// "1d ago" on 1 Oct. TODAY still anchors the recency filters. Kate, 1 Oct 2026.
function ago(d){const now=new Date(new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Dubai"})+"T00:00:00"); const n=Math.round((now-new Date(d+"T00:00:00"))/864e5); if(n<1)return "today"; if(n<60)return n+"d ago"; if(n<730)return Math.round(n/30.4)+"mo ago"; return Math.round(n/365)+"y ago";}
// Ten reviews a page, with a pager under the list (Kate, 9 Oct 2026: one long scroll was too much).
// Any filter, sort or window change goes back to page 1 (render() below).
const PAGE_SIZE=10;
let PAGE=0;
// Page numbers to show: first, last, and two either side of the current one, with … for gaps.
function pageNums(cur,total){
  const keep=new Set([0,total-1,cur-2,cur-1,cur,cur+1,cur+2].filter(p=>p>=0&&p<total)), out=[]; let prev=-1;
  [...keep].sort((a,b)=>a-b).forEach(p=>{ if(p-prev>1) out.push("…"); out.push(p); prev=p; });
  return out;
}
function renderList(F){
  const L=[...F].sort((a,b)=> state.sort==="new"? b.date.localeCompare(a.date) : state.sort==="old"? a.date.localeCompare(b.date) : state.sort==="low"? a.stars-b.stars || b.date.localeCompare(a.date) : b.stars-a.stars || b.date.localeCompare(a.date));
  document.getElementById("listTitle").textContent=`Reviews (${L.length})`;
  const el=document.getElementById("list");
  if(!L.length){el.innerHTML=`<div class="empty">No reviews match these filters.</div>`;return;}
  const pages=Math.ceil(L.length/PAGE_SIZE); PAGE=Math.min(Math.max(PAGE,0),pages-1);
  el.innerHTML=L.slice(PAGE*PAGE_SIZE,(PAGE+1)*PAGE_SIZE).map((r,i)=>{
    const st="<b>"+"★".repeat(r.stars)+"</b><em>"+"★".repeat(5-r.stars)+"</em>";
    const long=r.comment.length>380;
    return `<div class="rev s${r.stars}">
      <div class="rtop"><span class="stars">${st}</span><span class="who">${esc(r.reviewer||"Anonymous")}</span><span class="tag">${SHORT[r.branch]}</span>
      ${r.replied?'<span class="tag ok">Replied</span>':'<span class="tag no">No reply</span>'}
      ${r.staff.map(k=>{const s=staffBy(k), hand=!r.viaClient&&(r.manual||[]).includes(k)&&!(r.named||[]).includes(k);return s?`<button class="stag${r.viaClient||hand?" via":""}" data-k="${esc(k)}" title="${r.viaClient?"Not named, but this reviewer was their client in the 14 days before":hand?"Tagged by hand: not named in the text":"Named in the review"}">${s.photo?`<img src="${s.photo}" alt="">`:""}${esc(s.label)}${r.viaClient?" · client":hand?" · tagged":""}</button>`:"";}).join("")}
      <span class="date" title="${r.approx?'Approximate date from Google Maps'+(r.when?' ("'+esc(r.when)+'" when it was read)':''):r.date}">${r.approx?(r.date?fmtDate(r.date)+' · '+ago(r.date)+' · approx.':esc((r.when||'').replace(/^Edited /,'edited '))+' · approx.'):fmtDate(r.date)+' · '+ago(r.date)}</span></div>
      ${r.comment?`<div class="rtext${long?" clamp":""}" id="t${i}">${markNames(r)}</div>${long?`<button class="more" onclick="document.getElementById('t${i}').classList.toggle('clamp');this.textContent=this.textContent==='Show more'?'Show less':'Show more'">Show more</button>`:""}`:`<div class="rtext none">Rating only, no written comment</div>`}
      ${r.photos.length?`<div class="rphotos">${r.photos.map((u,k)=>`<button type="button" class="rph" data-u="${esc(u)}" aria-label="Photo ${k+1} of ${r.photos.length} from ${esc(r.reviewer||"the client")}"><img src="${esc(u)}=w240-h240-p" alt="" loading="lazy"></button>`).join("")}</div>`:""}
      ${r.replied?`<details class="reply"><summary><b>Our reply</b></summary><div style="white-space:pre-wrap;margin-top:6px">${esc(r.reply)}</div></details>`:""}
      ${(()=>{const g=googleReviewUrl(r)||branchMapsUrl(r),u=r.url||branchGbpUrl(r);return g||u?`<div class="links">${g?`<a class="gbp" href="${g}" target="_blank" rel="noopener">View on Google ↗</a>`:""}${u?`<a class="gbp" href="${u}" target="_blank" rel="noopener">Reply in Business Profile →</a>`:""}</div>`:"";})()}
    </div>`;}).join("") + (pages>1?`<nav class="pager" aria-label="Review pages">
      <div class="pg-info">Showing ${PAGE*PAGE_SIZE+1}–${Math.min((PAGE+1)*PAGE_SIZE,L.length)} of ${L.length}</div>
      <div class="pg-btns">
        <button type="button" class="chip" data-p="${PAGE-1}"${PAGE?"":" disabled"}>‹ Prev</button>
        ${pageNums(PAGE,pages).map(p=>p==="…"?`<span class="pg-gap">…</span>`:`<button type="button" class="chip${p===PAGE?" on":""}" data-p="${p}"${p===PAGE?' aria-current="page"':""} aria-label="Page ${p+1}">${p+1}</button>`).join("")}
        <button type="button" class="chip" data-p="${PAGE+1}"${PAGE<pages-1?"":" disabled"}>Next ›</button>
      </div></nav>`:"");
  el.querySelectorAll(".pager [data-p]").forEach(b=>b.onclick=()=>{
    PAGE=+b.dataset.p; renderList(F);
    // Back to the top of the list; embedded, this scrolls the dashboard (the frame has no scrollbar of its own).
    document.querySelector(".listhead").scrollIntoView({block:"start"});
  });
  el.querySelectorAll(".stag").forEach(b=>b.onclick=()=>{state.staff=b.dataset.k;render();window.scrollTo(0,0);});
  el.querySelectorAll(".rph").forEach(b=>b.onclick=()=>openPhoto(b));
}
// A client's photo full size, over the page; arrows step through that review's photos.
function openPhoto(btn){
  const all=[...btn.parentNode.querySelectorAll(".rph")]; let i=all.indexOf(btn);
  const box=document.createElement("div"); box.className="lbox"; box.setAttribute("role","dialog"); box.setAttribute("aria-label","Client photo");
  const show=()=>{box.innerHTML=`<img src="${esc(all[i].dataset.u)}=w1600" alt="">`+(all.length>1?`<button type="button" class="lb-prev" aria-label="Previous photo">‹</button><button type="button" class="lb-next" aria-label="Next photo">›</button><span class="lb-n">${i+1} / ${all.length}</span>`:"")+`<button type="button" class="lb-x" aria-label="Close">×</button>`;};
  const close=()=>{box.remove();document.removeEventListener("keydown",key);btn.focus();};
  const step=d=>{i=(i+d+all.length)%all.length;show();};
  const key=e=>{if(e.key==="Escape")close();else if(e.key==="ArrowRight"&&all.length>1)step(1);else if(e.key==="ArrowLeft"&&all.length>1)step(-1);};
  box.onclick=e=>{const t=e.target; if(t.classList.contains("lb-prev"))step(-1); else if(t.classList.contains("lb-next"))step(1); else if(t.tagName!=="IMG")close();};
  // Embedded, this frame is as tall as the whole list and the dashboard scrolls, so a
  // fixed box would sit mid-list: it covers only the part of the frame on screen.
  let fe=null; try{fe=window.frameElement;}catch(e){}
  if(fe){const fr=fe.getBoundingClientRect(), top=Math.max(0,-fr.top), bot=Math.min(fr.height,window.parent.innerHeight-fr.top);
    box.style.cssText=`position:absolute;inset:auto 0 auto 0;top:${top}px;height:${Math.max(240,bot-top)}px`;}
  document.addEventListener("keydown",key); show(); document.body.appendChild(box); box.querySelector(".lb-x").focus({preventScroll:true});
}
function renderNote(){
  const n=R.length.toLocaleString(), el=document.getElementById("note");
  if(!SYNC){ el.innerHTML=`<b>⚠ Offline copy: ${n} Google reviews as of 24 Sep 2026.</b> The live table couldn't be reached, so anything newer, and any reply posted since, is missing here.`; return; }
  const when=new Date(SYNC.last).toLocaleString("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit",timeZone:"Asia/Dubai"});
  // Which salons Metricool keeps current (Kate, 6 Oct 2026): any with a matched review.
  const live=BRANCHES.filter(b=>SYNC.live.has(b)), off=BRANCHES.filter(b=>!SYNC.live.has(b)).map(b=>SHORT[b]);
  el.innerHTML = !live.length
    ? `<b>✓ All ${n} Google reviews</b> across the 5 branches, from the 24 Sep 2026 pull. Older reviews use Google Maps' approximate dates ("a year ago").`
    : `<b>✓ All ${n} Google reviews</b> across the 5 branches. New reviews and replies come in nightly through Metricool, last ${when}.${off.length?` ${off.join(", ")} ${off.length>1?"are":"is"} still as of the 24 Sep 2026 pull, until connected in Metricool.`:""} Older reviews use Google Maps' approximate dates ("a year ago").`;
}
async function loadLive(){
  // photos: what the client attached on Google, read off Business Profile (google_review_photos, Kate, 5 Oct 2026).
  const rows=[], cols="review_id,branch,stars,reviewer,comment,review_date,date_approx,when_text,replied,reply,url,source,synced_at,photos,gbp_name,staff_manual";
  for(let from=0;;from+=1000){
    const res=await fetch(`${SUPA_URL}/rest/v1/google_reviews?select=${cols}&order=review_date.desc,review_id`,{headers:{...authHeaders(),Range:`${from}-${from+999}`}});
    if(!res.ok) throw new Error("google_reviews "+res.status);
    const page=await res.json(); rows.push(...page); if(page.length<1000) break;
  }
  if(!rows.length) throw new Error("google_reviews is empty");
  R=rows.map(r=>({id:r.review_id,branch:r.branch,stars:r.stars,reviewer:r.reviewer,date:r.review_date,comment:r.comment||"",replied:r.replied,reply:r.reply||"",url:r.url,approx:r.date_approx,when:r.when_text,photos:r.photos||[],manual:r.staff_manual||[]}));
  SYNC={last:rows.reduce((m,r)=>r.synced_at>m?r.synced_at:m,""),seedOnly:rows.every(r=>r.source==="seed"),live:new Set(rows.filter(r=>r.gbp_name).map(r=>r.branch))};
  const today=new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Dubai"});
  const totals={},exact={},avg={},cover={};
  BRANCHES.forEach(b=>{const rs=R.filter(r=>r.branch===b);totals[b]=rs.length;cover[b]=null;
    exact[b]={};ALL.forEach(s=>exact[b][s]=rs.filter(r=>r.stars===s).length);
    avg[b]=rs.length?rs.reduce((a,r)=>a+r.stars,0)/rs.length:0;});
  META={generated:today,totals,exact,avg,cover};
}
function loadOffline(){
  return new Promise((ok,fail)=>{const s=document.createElement("script");s.src="data.js";
    s.onload=()=>{R=window.REVIEWS.map(r=>({...r,photos:r.photos||[]}));META=window.META;ok();};s.onerror=fail;document.body.appendChild(s);});
}
// Google profile strip (Kate, 6 Oct 2026): how often each salon's Business Profile showed
// on Google and what people did, from Metricool via gbp_report (metricool-sync fills it
// nightly). Its own window, kept per browser; Google reports these about three days
// late, so the window ends yesterday and the note says the last day with numbers.
// Rows follow the Branch chips. Khalifa City A isn't connected in Metricool yet and
// shows as such until it is.
const GBP_CODE={KCA:"Khalifa City A, Abu Dhabi",SAA:"Saadiyat, Abu Dhabi",AQ:"Al Quoz, Dubai",MC:"Motor City, Dubai",BAH:"District 2, Bahrain"};
// 8 Oct 2026: it follows the masthead's window now (its own 7/30/90/This year switch is
// gone). The window ends yesterday, Google being days behind, and runs back at most 12
// months, which is also how far Metricool goes: All time and longer ranges are cut to that.
let gbpCut=false;
const gbpCache={};
function gbpWindow(){
  const r=curRange(), iso=d=>d.toLocaleDateString("en-CA");
  const y=new Date(new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Dubai"})+"T00:00:00"); y.setDate(y.getDate()-1);
  let to=r.to<iso(y)?r.to:iso(y), from=r.from||"0000-00-00";
  const floor=new Date(y); floor.setDate(floor.getDate()-364);
  gbpCut = from<iso(floor);
  if(gbpCut) from=iso(floor);
  if(to<from) to=from;
  return {from,to};
}
async function renderGbp(){
  const el=document.getElementById("gbp"); if(!el) return;
  const w=gbpWindow(), k=w.from+"|"+w.to;
  if(!gbpCache[k]){
    gbpCache[k]=fetch(`${SUPA_URL}/rest/v1/rpc/gbp_report`,{method:"POST",headers:{...authHeaders(),"Content-Type":"application/json"},body:JSON.stringify({p_from:w.from,p_to:w.to})})
      .then(r=>{if(!r.ok) throw new Error("gbp_report "+r.status); return r.json();});
    gbpCache[k].catch(()=>{delete gbpCache[k];});
  }
  let d; try{d=await gbpCache[k];}catch(e){console.warn("Google profile strip:",e); el.hidden=true; return;}
  const num=v=>v==null?"–":Math.round(+v).toLocaleString("en-GB");
  const by={}; (d.branches||[]).forEach(b=>{if(GBP_CODE[b.branch]) by[GBP_CODE[b.branch]]=b;});
  const shown=BRANCHES.filter(b=>state.branches.has(b)), have=shown.filter(b=>by[b]&&by[b].seen!=null);
  const mx=Math.max(1,...have.map(b=>+by[b].seen)), sum=f=>have.reduce((a,b)=>a+(+by[b][f]||0),0);
  const rows=shown.map(b=>{const r=by[b];
    if(!r) return `<tr class="na"><td>${SHORT[b]}</td><td colspan="5" style="text-align:left">Not connected in Metricool yet</td></tr>`;
    if(r.seen==null) return `<tr class="na"><td>${SHORT[b]}</td><td colspan="5" style="text-align:left">No numbers in these dates</td></tr>`;
    return `<tr><td><b>${SHORT[b]}</b><div class="gbp-bar"><b style="width:${100*r.seen/mx}%"></b></div></td><td>${num(r.seen)}</td><td>${num(r.calls)}</td><td>${num(r.directions)}</td><td>${num(r.website)}</td><td class="gbp-sm">${r.seen?(100*r.calls/r.seen).toFixed(1):"–"}</td></tr>`;}).join("");
  const tot=have.length>1?`<tr class="tot"><td>All shown</td><td>${num(sum("seen"))}</td><td>${num(sum("calls"))}</td><td>${num(sum("directions"))}</td><td>${num(sum("website"))}</td><td class="gbp-sm">${sum("seen")?(100*sum("calls")/sum("seen")).toFixed(1):"–"}</td></tr>`:"";
  const last=have.map(b=>by[b].last_date).filter(Boolean).sort().pop();
  const s=d.sync, stale=!s||!s.last_ok_at||(Date.now()-new Date(s.last_ok_at).getTime())>36*3600e3;
  el.hidden=false;
  el.innerHTML=`<div class="gbp-hd"><div><div class="gbp-ey">Google Business Profile</div><h2>How people found each salon on Google</h2></div>
    <span class="gbp-tag">Follows the Branch and Period above</span></div>
    ${shown.length?`<div class="gbp-wrap"><table class="gbp-t"><thead><tr><th>Salon</th><th>Seen on Google</th><th>Calls</th><th>Directions</th><th>Website clicks</th><th class="gbp-sm">Calls per 100 views</th></tr></thead><tbody>${rows}${tot}</tbody></table></div>`:""}
    <div class="gbp-note">"Seen on Google" is how many times the salon's profile showed in Search or Maps. ${gbpCut?"Profile numbers go back 12 months at most. ":""}${fmtDate(w.from)} to ${fmtDate(last&&last<w.to?last:w.to)}${last&&last<w.to?", the last day Google has reported (it runs about three days late)":""}. From Metricool, updated nightly.${stale?` <span class="no">Paused${s&&s.last_error?": "+String(s.last_error).replace(/[<>&]/g,""):""}.</span>`:""}</div>`;
}
function render(){
  const F=baseFilter();
  PAGE=0;
  renderGbp();
  renderFilters(); renderKpis(F); renderNote(); renderBranches(); renderStaffBoard(); renderTimeline(F); renderList(F);
}
document.getElementById("q").oninput=e=>{state.q=e.target.value;render();};
document.getElementById("sort").onchange=e=>{state.sort=e.target.value;render();};
document.getElementById("reset").onclick=()=>{Object.assign(state,{stars:new Set(ALL),withText:false,noReply:false,withPhotos:false,q:"",staff:""});document.getElementById("q").value="";render();};
document.getElementById("reset2").onclick=()=>document.getElementById("reset").click();
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
    if(e.source===window.parent&&e.data&&e.data.type==="trs-reviews-scroll"){pin=+e.data.pin||0;placeFilters();}
    if(e.source===window.parent&&e.data&&e.data.type==="trs-reviews-filter") applyFilter(e.data);
  });
  // The dashboard scrolls, not this frame, so position:sticky has nothing to stick
  // to. The dashboard sends how far this frame's top is under its header (pin), and
  // the filter bar is moved down by that much, stopping at the end of the list.
  // On a phone the closed bar follows too (Kate, 2 Oct 2026); the open panel holds
  // where it opened, so it can be scrolled through and doesn't jump to the top.
  // The dashboard's Branch and Period bar (dashboard.js postReviewsBranch), sent on every
  // change: the branch codes picked and the window (from null = all time). Kate, 8 Oct 2026.
  function applyFilter(m){
    const picked=(m.codes||[]).map(c=>CODE_TO_BRANCH[c]).filter(Boolean);
    state.branches=picked.length ? new Set(picked) : new Set(BRANCHES);
    if(m.to) state.range={from:m.from||null,to:m.to,label:m.label||""};
    if(META) render();
  }
  const fl=document.querySelector(".filters"), wide=matchMedia("(min-width:761px)");
  let pin=0, lastY=0;
  function placeFilters(){
    if(!fl) return;
    const list=document.getElementById("list"), held=!wide.matches && fl.classList.contains("open");
    const y=Math.max(0, Math.min(held ? lastY : pin - fl.offsetTop, list.offsetTop + list.offsetHeight - fl.offsetHeight - fl.offsetTop));
    lastY=y;
    fl.style.transform = y ? `translateY(${Math.round(y)}px)` : "";
    fl.classList.toggle("pinned", y > 0);
    // The panel is always the compact bar now (class "mini" in the markup): with Branch
    // and Recency on the masthead only the refine rows are left, so it opens in place
    // instead of unfolding when you scroll back to the top. Kate, 8 Oct 2026.
  }
  onFiltersToggle=placeFilters;
  function postH(){window.parent.postMessage({type:"trs-reviews-height",h:Math.ceil(document.body.getBoundingClientRect().height)},"*");placeFilters();}
  new ResizeObserver(postH).observe(document.body);
  window.parent.postMessage({type:"trs-reviews-ready"},"*");
}
loadLive().catch(e=>{console.warn("Google reviews: live load failed, using the 24 Sep copy.",e);return loadOffline();})
  .then(()=>Promise.all([loadVariants(), loadClientCredit()]))
  .then(()=>{TODAY=new Date(META.generated+"T00:00:00");buildStaff();R.forEach(tagStaff);renderExact();render();});
document.getElementById("fStaff").onchange=e=>{state.staff=e.target.value;render();};
