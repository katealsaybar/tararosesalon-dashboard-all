function formatViewedTimestamp() {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  document.getElementById('viewedTimestamp').innerHTML =
    `Viewed ${dateStr}<br><span style="font-size:9px;opacity:.7">${tz.replace('_',' ')} · ${timeStr}</span>`;
}
window.addEventListener('DOMContentLoaded', formatViewedTimestamp);

const SUPA_URL = 'https://gvijxenafoowajqktqvd.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2aWp4ZW5hZm9vd2FqcWt0cXZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3MTA1OTksImV4cCI6MjA5MTI4NjU5OX0.GL3YXupXOBGfN4FCyelbQWraUw12VJNJu-wUB3zR7Zw';
const sb = supabase.createClient(SUPA_URL, SUPA_KEY);

const STYLIST_IG = {
  "Emma":       "https://www.instagram.com/emmalou.williamson/",
  "Jeida":      "https://www.instagram.com/jeida11/",
  "Danika":     "https://www.instagram.com/hairby_danika/",
  "Holly":      "https://www.instagram.com/holly_the_hairdresser/",
  "Molly":      "https://www.instagram.com/mollyrobinsonhair/",
  "Tammy":      "https://www.instagram.com/tammy_peter_hair/",
  "April":      "https://www.instagram.com/april_apple_13/",
  "Bethany":    "https://www.instagram.com/bethanysmith.hair/",
  "Eds":        "https://www.instagram.com/edzasuncion/",
  "Ashleigh":   "https://www.instagram.com/ashleighfairgrievehair",
  "Alan":       "https://www.instagram.com/alan_joseph_hair_",
  "Robyn":      "https://www.instagram.com/robynharthair",
  "Elise":      "https://www.instagram.com/ehfhair",
  "Lucy":       "https://www.instagram.com/lucy.glow.hair",
  "Kylie":      "https://www.instagram.com/thathairgirlkylie",
  "Tegan":      "https://www.instagram.com/teganskinnerhair",
  "Kate":       "https://www.instagram.com/katesirik",
  "Katie":      "https://www.instagram.com/katiesanchez_",
  "Lizanie":    "https://www.instagram.com/lizaniejacobsz_hair",
  "Nikki":      "https://www.instagram.com/hairbynikki.na",
  "Olena":      "https://www.instagram.com/ostertag.olena",
  "Hazel May":  "https://www.instagram.com/hairby_mhay",
  "Irlyn":      "https://www.instagram.com/hairby_lyn11",
  "Ruth":       "https://www.instagram.com/rainbowsby_ruth",
  "Zandri":     "https://www.instagram.com/hairby.zandri",
  "Samantha":   "https://www.instagram.com/samanthaahmadhair",
  "Ibrahim":    "https://www.instagram.com/almofdi.hairstylist",
  "Shelley":    "https://www.instagram.com/shelley_the_global_hairstylist"
};

const BRANCH_INFO = {
  KCA:{ name:'Khalifa City',  color:'#FFD4D9' },
  SAA:{ name:'Saadiyat',      color:'#C4B5FD' },
  MC: { name:'Motor City',    color:'#99F6E4' },
  AQ: { name:'AQ Ladies',     color:'#FF9B9B' },
  FRT:{ name:'Fratelli',      color:'#EEF3C7' },
};
const BEAUTY_NAMES = new Set(['MIMI','GRACE','SHILA','KIM','KIMBERLY','REDA','CHONA']);
const SKIP_NAMES   = new Set(['STAFF','TOTALS','TYPE','TYPE ','BUSINESS','TARA','ASISSTANTS','ASSISTANTS',
  'HAIR RETAIL SALES','TREATMENT SALES','COL TAKE AED','CBD TAKE AED','BEAUTY SALES','BEAUTY RETAIL SALES',
  'NET SALON TAKE','TOTAL CLIENTS']);

const AVATAR_COLORS = ['#C4B5FD','#99F6E4','#FFD4D9','#FF9B9B','#EEF3C7','#B5EAD7','#FFDAC1','#D4E4FF'];
const fmtAED = n  => 'AED ' + Math.round(n||0).toLocaleString();
const fmtPct = n  => (+(n||0)).toFixed(1) + '%';
const initials = n => n.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();


let dateFrom = null;
let dateTo = null;

// ── STATE ──────────────────────────────────────────────────
let allRows = [];         // raw supabase records
let stylistMap = {};      // name -> { weeks:[], hair/beautyStaff data consolidated }
let typeFilter = 'all';
let sortKey    = 'hairSalesNet';
let branchFilter = 'all';
let selectedStylist = null;
let activeChart = null;
let viewMode = 'weekly';

//CHART VIEW MODES
function setChartView(mode, el){
  viewMode = mode;

  const lbl = document.getElementById('chartTitleLabel');
  if(lbl) lbl.textContent = (document.querySelector('.detail-name')?.textContent || '') + ' · ' + mode.charAt(0).toUpperCase()+mode.slice(1) + ' Trend';

  document.querySelectorAll('.chart-toggle-btn').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');

  // re-render ONLY the detail chart
  if(selectedStylist && stylistMap[selectedStylist]){
    const s = stylistMap[selectedStylist];
    s._stats = getStats(s);
    drawChart(s._stats, s.isBeauty);
  }
}

// ── THEME ──────────────────────────────────────────────────
function toggleTheme(){
  const dark = document.documentElement.getAttribute('data-theme')==='dark';
  document.documentElement.setAttribute('data-theme', dark ? 'light' : 'dark');
  document.getElementById('themeLbl').textContent = dark ? 'Dark' : 'Light';
}


// ── FILTER HELPERS ─────────────────────────────────────────
function setTypeFilter(type, el){
  typeFilter = type;
  document.querySelectorAll('#filterAll,#filterHair,#filterBeauty').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
  renderGrid();
}
function setSort(key, el){
  sortKey = key;
  document.querySelectorAll('#sortSales,#sortClients,#sortRebook,#sortAvgBill').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
  renderGrid();
}

// ── LOAD DATA ──────────────────────────────────────────────
async function loadData(){
  const { data, error } = await sb
  .from('weekly_data')
  .select('*')
  .order('uploaded_at', { ascending: true });
  if(error){ document.getElementById('loadingEl').innerHTML='<div style="color:var(--bad)">Error loading data: '+error.message+'</div>'; return; }
  allRows = data || [];

  const dates = allRows.map(r => new Date(r.uploaded_at)).filter(d => !isNaN(d));

  if(allRows.length){
    // Use week_label to get true date range, not uploaded_at
    let minDate = null, maxDate = null;
    for(const row of allRows){
      const wd = getWeekDatesFromLabel(row.week_label);
      const d = wd ? wd.start : null;
      if(!d) continue;
      if(!minDate || d < minDate) minDate = d;
      if(!maxDate || d > maxDate) maxDate = d;
    }
    if(!minDate){
      // fallback to uploaded_at but strip timezone properly
      const raw = allRows.map(r => new Date(r.uploaded_at)).filter(d => !isNaN(d));
      const minRaw = new Date(Math.min(...raw));
      const maxRaw = new Date(Math.max(...raw));
      minDate = new Date(minRaw.getFullYear(), minRaw.getMonth(), minRaw.getDate());
      maxDate = new Date(maxRaw.getFullYear(), maxRaw.getMonth(), maxRaw.getDate());
    }
  
    calFrom = new Date(minDate);
    calTo   = new Date(maxDate);
    calYear = calFrom.getFullYear(); calMonth = calFrom.getMonth();
  
    dateFrom = new Date(minDate); dateFrom.setHours(0,0,0,0);
    dateTo   = new Date(maxDate); dateTo.setHours(23,59,59,999);
  
    const fmt = dt => dt.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
    document.getElementById('dateFromInput').value = minDate.getFullYear()+'-'+String(minDate.getMonth()+1).padStart(2,'0')+'-'+String(minDate.getDate()).padStart(2,'0');
    document.getElementById('dateToInput').value   = maxDate.getFullYear()+'-'+String(maxDate.getMonth()+1).padStart(2,'0')+'-'+String(maxDate.getDate()).padStart(2,'0');
    document.getElementById('datePickerLabel').textContent = fmt(calFrom) + ' → ' + fmt(calTo);
    document.getElementById('calFromDisplay').textContent = fmt(calFrom);
    document.getElementById('calToDisplay').textContent   = fmt(calTo);
  }

  buildStylistMap();
  document.getElementById('loadingEl').style.display='none';
  document.getElementById('mainContent').style.display='block';
  renderGrid();
  console.log('SAMPLE week_label:', allRows[0]?.week_label);
  console.log('SAMPLE uploaded_at:', allRows[0]?.uploaded_at);
}

function isSkip(name){
  const n = name.toUpperCase().trim();
  if(SKIP_NAMES.has(n)) return true;
  if(n.includes('RETAIL') || n.includes('TREATMENT') || n.includes('TAKE') || n.includes('TOTAL') || n.includes('SALES')) return true;
  return false;
}

function buildStylistMap(){
  stylistMap = {};
  console.log('BUILDING MAP from rows:', allRows.length);
  console.log('SAMPLE ROW:', JSON.stringify(allRows[0], null, 2));
  for(const row of allRows){
    const { branch, week_label, data: d, uploaded_at } = row;
    if(!d) continue;
    const allStaff = [
      ...(d.hairStaff||[]).map(s=>({...s, isBeauty:false})),
      ...(d.beautyStaff||[]).map(s=>({...s, isBeauty:true})),
    ];
    for(const st of allStaff){
      const name = (st.name||'').trim().toUpperCase();
      if(!name || isSkip(name)) continue;
      // Decide type: explicitly beauty OR in beauty names list
      const isBeauty = st.isBeauty || BEAUTY_NAMES.has(name);
      if(!stylistMap[name]){
        stylistMap[name] = { name, isBeauty, weeks:[], color: AVATAR_COLORS[Object.keys(stylistMap).length % AVATAR_COLORS.length] };
      }
      stylistMap[name].weeks.push({
        week_label: week_label||'—',
        branch: branch||'—',
        uploaded_at,
        total:        st.total||0,
        req:          st.req||0,
        salon:        st.salon||0,
        newC:         st.newC||0,
        rebooked:     st.rebooked||0,
        rebookPct:    st.rebookPct||0,
        hairSalesNet: st.hairSalesNet||0,
        hairSales:    st.hairSales||0,
        beautySales:  st.beautySales||0,
        avgBill:      st.avgBill||0,
        col:          st.col||0,
        colPct:       st.colPct||0,
        retail:       st.retail||0,
        treatments:   st.treatments||0,
        ncrPct:       st.ncrPct||0,
      });
    }
  }
}


function getWeekDatesFromLabel(label) {
  if (!label) return null;
  const monthMap = { JAN:0,FEB:1,MAR:2,APR:3,MAY:4,JUN:5,JUL:6,AUG:7,SEP:8,OCT:9,NOV:10,DEC:11 };
  const m = label.match(/\(([A-Z]{3})\s+(\d+)\s*[–\-]\s*([A-Z]{3})\s+(\d+)\)/i);
  if (!m) return null;
  const startMon = m[1].toUpperCase(), startDay = parseInt(m[2]);
  const endMon   = m[3].toUpperCase(), endDay   = parseInt(m[4]);
  const yearMatch = label.match(/20\d\d/);
  const endYear   = yearMatch ? parseInt(yearMatch[0]) : new Date().getFullYear();
  const endMonth   = monthMap[endMon];
  const startMonth = monthMap[startMon];
  const startYear = (startMonth === 11 && endMonth === 0) ? endYear - 1 : endYear;
  const start = new Date(startYear, startMonth, startDay); start.setHours(0,0,0,0);
  const end   = new Date(endYear,   endMonth,   endDay);   end.setHours(0,0,0,0);
  return { start, end };
}

// ── COMPUTE CONSOLIDATED STATS ─────────────────────────────
function getStats(stylist){
  let weeks = stylist.weeks;

  if(window.DEBUG) console.log('FILTERED WEEKS:', weeks.length);

// 🔥 DATE FILTER 
if (dateFrom || dateTo) {
  weeks = weeks.filter(w => {
    // Parse date from week_label e.g. "W14 2026 (APR 1 – APR 7)"
    const weekDates = getWeekDatesFromLabel(w.week_label);
    let checkDate;
    if (weekDates) {
      checkDate = weekDates.start;
    } else {
      // fallback to uploaded_at as local date
      const u = new Date(w.uploaded_at);
      checkDate = new Date(u.getFullYear(), u.getMonth(), u.getDate());
    }
    if (dateFrom && checkDate < dateFrom) return false;
    if (dateTo   && checkDate > dateTo)   return false;
    return true;
  });
}

console.log('DATE FILTER:', {
  from: dateFrom,
  to: dateTo,
  remainingWeeks: weeks.length
});

// Branch filter
if (branchFilter !== 'all') {
  weeks = weeks.filter(w => w.branch === branchFilter);
}

  if(!weeks.length) return null;
  const sum = (key) => weeks.reduce((a,w)=>a+(w[key]||0),0);
  const avg = (key) => sum(key)/weeks.length;
  const totalClients = sum('total');
  const netRevTotal  = sum('hairSalesNet') + sum('beautySales');

  return {
    weeksActive:   weeks.length,
    total:         sum('total'),
    req:           sum('req'),
    salon:         sum('salon'),
    newC:          sum('newC'),
    rebooked:      sum('rebooked'),
    rebookPct:     totalClients>0 ? sum('rebooked')/totalClients*100 : avg('rebookPct'),
    hairSalesNet:  sum('hairSalesNet'),
    hairSales:     sum('hairSales'),
    beautySales:   sum('beautySales'),
    netRevTotal,
    avgBill:       totalClients>0 ? netRevTotal/totalClients : avg('avgBill'),
    col:           sum('col'),
    colPct:        avg('colPct'),
    retail:        sum('retail'),
    treatments:    sum('treatments'),
    ncrPct:        avg('ncrPct'),
    weeks,
  };
}

// ── RENDER GRID ────────────────────────────────────────────
function renderGrid(){
  const search = document.getElementById('searchInput').value.trim().toUpperCase();
  branchFilter = document.getElementById('branchFilter')?.value || 'all';

  let stylists = Object.values(stylistMap).filter(s=>{
    if(search && !s.name.includes(search)) return false;
    const stats = getStats(s);
    if(!stats) return false;
    s._stats = stats;
    return true;
  });

  if(!stylists.length){
    console.warn('No results after filtering. Check date range.');
  }

  console.log('ALL ROWS:', allRows.length);
  console.log('DATE FROM:', dateFrom);
  console.log('DATE TO:', dateTo);

  const hair   = stylists.filter(s=>!s.isBeauty);
  const beauty = stylists.filter(s=>s.isBeauty);

  const doSort = arr => arr.sort((a,b)=>{
    const aVal = sortKey==='hairSalesNet' ? (a._stats.hairSalesNet+a._stats.beautySales) : (a._stats[sortKey]||0);
    const bVal = sortKey==='hairSalesNet' ? (b._stats.hairSalesNet+b._stats.beautySales) : (b._stats[sortKey]||0);
    return bVal - aVal;
  });
  doSort(hair); 
  doSort(beauty);

  const showHair   = typeFilter==='all'||typeFilter==='hair';
  const showBeauty = typeFilter==='all'||typeFilter==='beauty';

  document.getElementById('hairSection').style.display   = showHair   && hair.length   ? 'block' : 'none';
  document.getElementById('beautySection').style.display = showBeauty && beauty.length ? 'block' : 'none';

  const isEmpty = (!showHair || !hair.length) && (!showBeauty || !beauty.length);
  document.getElementById('emptyState').style.display = isEmpty ? 'block' : 'none';

  if(isEmpty && (dateFrom || dateTo)){
    console.warn('Date filter too strict');
  }

  if(showHair)   renderSection(hair,   'hairGrid',   'Hair Stylists',  hair.length,   'hairSectionTitle');
  if(showBeauty) renderSection(beauty, 'beautyGrid', 'Beauticians',    beauty.length, 'beautySectionTitle');

  if(selectedStylist && stylistMap[selectedStylist]){
    const s = stylistMap[selectedStylist];
    s._stats = getStats(s);
    if(s._stats) renderDetail(s);
    else { 
      document.getElementById('detailPanel').style.display='none'; 
      selectedStylist=null; 
    }
  }
}

function renderSection(list, gridId, title, count, titleId){
  document.getElementById(titleId).textContent = `${title} · ${count} ${count===1?'person':'people'}`;
  const grid = document.getElementById(gridId);

  grid.innerHTML = list.map(s=>{
    const st   = s._stats;
    const rev  = s.isBeauty ? st.beautySales : st.hairSalesNet;
    const revLabel = s.isBeauty ? 'Beauty Sales' : 'Net Hair Rev';

    // Week pills: all weeks this stylist appears in (highlight ones matching filter)
    const allWeeks  = [...new Set(s.weeks.map(w=>w.week_label))].sort();
    const activeWks = new Set(st.weeks.map(w=>w.week_label));
    const pillsHTML = allWeeks.map(w=>`<span class="week-pill ${activeWks.has(w)?'active':''}">${w}</span>`).join('');

    return `<div class="stylist-card ${selectedStylist===s.name?'selected':''}" onclick="selectStylist('${s.name}')">
      <div class="stylist-card-top">
        <div class="stylist-avatar" style="background:${s.color}">${initials(s.name)}</div>
        <div>
          <div class="stylist-card-name">${s.name}${(()=>{const k=s.name.charAt(0)+s.name.slice(1).toLowerCase();const k2=s.name.split(' ').map(w=>w.charAt(0)+w.slice(1).toLowerCase()).join(' ');const url=STYLIST_IG[k2]||STYLIST_IG[k]||STYLIST_IG[s.name];return url?`<a href="${url}" target="_blank" onclick="event.stopPropagation()" class="ig-badge" title="View on Instagram">IG</a>`:''})()}</div>
          <div class="stylist-card-type">
  ${s.isBeauty ? '💅 Beautician' : '✂️ Hair Stylist'} · ${st.weeksActive}w · ${[...new Set(st.weeks.map(w=>BRANCH_INFO[w.branch]?.name||w.branch))].join(', ')} 
        </div>
        </div>
      </div>
      <div class="stylist-card-stat"><span>${revLabel}</span><span class="stylist-card-val">${fmtAED(rev)}</span></div>
      <div class="stylist-card-stat"><span>Clients</span><span class="stylist-card-val">${st.total}</span></div>
      <div class="stylist-card-stat"><span>Rebook</span><span class="stylist-card-val">${fmtPct(st.rebookPct)}</span></div>
      <div class="stylist-card-stat"><span>Avg Bill</span><span class="stylist-card-val">${fmtAED(st.avgBill)}</span></div>
      <div class="stylist-weeks-pills">${pillsHTML}</div>
    </div>`;
  }).join('');
}

// ── SELECT + DETAIL ────────────────────────────────────────
function selectStylist(name){
  if(selectedStylist===name){ closeDetail(); return; }
  selectedStylist = name;
  const s  = stylistMap[name];
  s._stats = getStats(s);
  renderDetail(s);
  renderGrid(); // re-highlight card
  document.getElementById('detailPanel').scrollIntoView({behavior:'smooth',block:'nearest'});
}

function closeDetail(){
  selectedStylist = null;
  document.getElementById('detailPanel').style.display='none';
  if(activeChart){ activeChart.destroy(); activeChart=null; }
  renderGrid();
}

function renderDetail(s){
  const st = s._stats;
  const panel = document.getElementById('detailPanel');
  panel.style.display='block';

  const isBeauty = s.isBeauty;
  const rev = isBeauty ? st.beautySales : st.hairSalesNet;

  // Target benchmarks
  const rebookClass = st.rebookPct >= 45 ? 'good' : st.rebookPct >= 30 ? '' : 'bad';
  const ncrClass    = st.ncrPct >= 20 ? 'good' : st.ncrPct >= 10 ? '' : 'bad';
  const avgBillClass= st.avgBill >= 650 ? 'good' : st.avgBill >= 500 ? '' : 'bad';
  const colClass    = !isBeauty && st.colPct >= 60 ? 'good' : !isBeauty && st.colPct >= 40 ? '' : '';

  panel.innerHTML = `
    <div class="detail-header">
      <div class="detail-avatar" style="background:${s.color}">${initials(s.name)}</div>
      <div>
        <div class="detail-name">${s.name}</div>
        <div class="detail-sub">${isBeauty?'Beautician':'Hair Stylist'} · Active ${st.weeksActive} week${st.weeksActive!==1?'s':''} · ${[...new Set(st.weeks.map(w=>BRANCH_INFO[w.branch]?.name||w.branch))].join(', ')}</div>
      </div>
      <button class="detail-close" onclick="closeDetail()">✕ Close</button>
    </div>

    <div class="metrics-row">
      <div class="metric-box">
        <div class="metric-box-label">${isBeauty?'Beauty Sales':'Net Hair Revenue'}</div>
        <div class="metric-box-value">${fmtAED(rev)}</div>
        <div class="metric-box-sub">across ${st.weeksActive} weeks</div>
      </div>
      <div class="metric-box">
        <div class="metric-box-label">Total Clients</div>
        <div class="metric-box-value">${st.total}</div>
        <div class="metric-box-sub">${Math.round(st.total/Math.max(1,st.weeksActive))}/week avg</div>
      </div>
      <div class="metric-box ${avgBillClass}">
        <div class="metric-box-label">Avg Bill</div>
        <div class="metric-box-value">${fmtAED(st.avgBill)}</div>
        <div class="metric-box-sub">Target: AED 650</div>
      </div>
      <div class="metric-box ${rebookClass}">
        <div class="metric-box-label">Rebooking %</div>
        <div class="metric-box-value">${fmtPct(st.rebookPct)}</div>
        <div class="metric-box-sub">Target: 45%</div>
      </div>
      <div class="metric-box ${ncrClass}">
        <div class="metric-box-label">NCR %</div>
        <div class="metric-box-value">${fmtPct(st.ncrPct)}</div>
        <div class="metric-box-sub">Target: 20%</div>
      </div>
      ${!isBeauty ? `
      <div class="metric-box ${colClass}">
        <div class="metric-box-label">Colour %</div>
        <div class="metric-box-value">${fmtPct(st.colPct)}</div>
        <div class="metric-box-sub">Colour clients</div>
      </div>
      <div class="metric-box">
        <div class="metric-box-label">Retail Sales</div>
        <div class="metric-box-value">${fmtAED(st.retail)}</div>
        <div class="metric-box-sub">total</div>
      </div>
      <div class="metric-box">
        <div class="metric-box-label">Treatments</div>
        <div class="metric-box-value">${fmtAED(st.treatments)}</div>
        <div class="metric-box-sub">total</div>
      </div>
      ` : `
      <div class="metric-box">
        <div class="metric-box-label">Rebooked</div>
        <div class="metric-box-value">${st.rebooked}</div>
        <div class="metric-box-sub">clients</div>
      </div>
      `}
    </div>

    <!-- WEEKLY BREAKDOWN TABLE -->
    <div class="chart-title" style="margin-bottom:8px;margin-top:4px">WEEK-BY-WEEK BREAKDOWN</div>
    <div class="weekly-table-wrap">
      ${renderWeekTable(st, isBeauty)}
    </div>

    <!-- RADAR CHART -->
    <div class="chart-wrap" style="margin-bottom:16px">
      <div class="chart-title" style="margin-bottom:12px">PERFORMANCE RADAR</div>
      <canvas id="radarChart" style="max-height:260px"></canvas>
    </div>

    <!-- TREND CHART -->
    <div class="chart-wrap">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
    <div class="chart-title">
  ${isBeauty?'Beauty Sales':'Net Revenue'} + Clients · ${viewMode.charAt(0).toUpperCase()+viewMode.slice(1)} Trend
</div>

    <div class="tabs" style="margin-bottom:0;">
      <button class="tab-btn chart-toggle-btn active" onclick="setChartView('daily', this)">Daily</button>
      <button class="tab-btn chart-toggle-btn" onclick="setChartView('weekly', this)">Weekly</button>
      <button class="tab-btn chart-toggle-btn" onclick="setChartView('monthly', this)">Monthly</button>
      <button class="tab-btn chart-toggle-btn" onclick="setChartView('yearly', this)">Yearly</button>
    </div>
  </div>

  <span id="chartTitleLabel">${isBeauty?'Beauty Sales':'Net Revenue'} + Clients · Weekly Trend</span>
  <canvas id="trendChart"></canvas>
</div>
  `;

  viewMode = 'weekly';

  // Draw charts after DOM is ready
  setTimeout(()=>{ drawChart(st, isBeauty); drawRadar(st, isBeauty); }, 50);
}

function renderWeekTable(st, isBeauty){
  const weeks = [...st.weeks].sort((a,b)=>a.week_label.localeCompare(b.week_label));
  const cols = isBeauty
    ? ['week_label','branch','total','rebooked','rebookPct','beautySales','avgBill']
    : ['week_label','branch','total','rebooked','rebookPct','hairSalesNet','avgBill','col','colPct','retail','treatments'];
  const heads = isBeauty
    ? ['Week','Branch','Clients','Rebooked','Rebook %','Beauty Sales','Avg Bill']
    : ['Week','Branch','Clients','Rebooked','Rebook %','Net Revenue','Avg Bill','Colour','Col %','Retail','Treatment'];

  // Totals row
  const totals = {};
  for(const c of cols){
    if(c==='week_label') totals[c]='TOTAL';
    else if(c==='branch') totals[c]='';
    else if(c==='rebookPct') totals[c] = st.total>0 ? st.rebooked/st.total*100 : 0;
    else if(c==='colPct') totals[c] = weeks.length>0 ? weeks.reduce((a,w)=>a+(w.colPct||0),0)/weeks.length : 0;
    else if(c==='avgBill') totals[c] = st.total>0 ? (st.hairSalesNet+st.beautySales)/st.total : 0;
    else totals[c] = weeks.reduce((a,w)=>a+(w[c]||0),0);
  }

  const fmtCell = (col, val, isTotal=false) => {
    if(col==='week_label'||col==='branch') return val || '—';
    if(col==='rebookPct'||col==='colPct') return fmtPct(val);
    if(col==='total'||col==='rebooked'||col==='col') return Math.round(val||0).toLocaleString();
    return fmtAED(val);
  };
  const cellClass = (col, val) => {
    if(col==='rebookPct') return val>=45?'good':val>=30?'':'bad';
    if(col==='colPct')    return val>=60?'good':val>=40?'':'';
    if(col==='avgBill')   return val>=650?'good':val>=500?'':'bad';
    return val===0?'zero':'';
  };

  const bodyRows = weeks.map(w=>`
    <tr>
      ${cols.map(c=>`<td class="${cellClass(c,w[c]||0)}">${fmtCell(c,w[c])}</td>`).join('')}
    </tr>
  `).join('');

  const totalRow = `<tr class="total-row">${cols.map(c=>`<td class="${c==='week_label'?'':''}${cellClass(c,totals[c])}">${fmtCell(c,totals[c],true)}</td>`).join('')}</tr>`;

  return `<table>
    <thead><tr>${heads.map(h=>`<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${bodyRows}${totalRow}</tbody>
  </table>`;
}

function drawRadar(st, isBeauty){
  const canvas = document.getElementById('radarChart');
  if(!canvas) return;
  if(window._activeRadar){ window._activeRadar.destroy(); window._activeRadar=null; }

  const isDark = document.documentElement.getAttribute('data-theme')==='dark';
  const textColor = isDark ? 'rgba(250,248,243,0.55)' : '#9a8a87';
  const gridColor = isDark ? 'rgba(250,248,243,0.08)' : 'rgba(92,85,87,0.1)';

  // Normalize each metric 0-100 against targets
  const rebookScore  = Math.min(100, (st.rebookPct / 45) * 100);
  const avgBillScore = Math.min(100, (st.avgBill / 650) * 100);
  const ncrScore     = Math.min(100, (st.ncrPct / 20) * 100);
  const colScore     = isBeauty ? 50 : Math.min(100, (st.colPct / 60) * 100);
  const clientScore  = Math.min(100, st.total > 0 ? Math.min(st.total / Math.max(1, st.total) * 100, 100) : 0);

  // Use weeks active as a proxy for consistency (capped at 100)
  const consistencyScore = Math.min(100, (st.weeksActive / 10) * 100);

  window._activeRadar = new Chart(canvas, {
    type: 'radar',
    data: {
      labels: ['Rebook %', 'Avg Bill', 'NCR %', isBeauty ? 'Beauty' : 'Colour %', 'Clients', 'Consistency'],
      datasets: [{
        label: st.name || 'Stylist',
        data: [rebookScore, avgBillScore, ncrScore, colScore, 100, consistencyScore],
        backgroundColor: 'rgba(196,181,253,0.2)',
        borderColor: '#C4B5FD',
        borderWidth: 2,
        pointBackgroundColor: '#FF9B9B',
        pointRadius: 4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { display: false } },
      scales: {
        r: {
          min: 0, max: 100,
          ticks: { display: false },
          grid: { color: gridColor },
          angleLines: { color: gridColor },
          pointLabels: { color: textColor, font: { size: 10 } }
        }
      }
    }
  });
}

function drawChart(st, isBeauty){
  const canvas = document.getElementById('trendChart');
  if(!canvas) return;
  if(activeChart){ activeChart.destroy(); activeChart=null; }

  let grouped = {};

  for(const w of st.weeks){
    const weekDates = getWeekDatesFromLabel(w.week_label);
    const d = weekDates ? weekDates.start : new Date(w.uploaded_at);
    let key;
    if(viewMode === 'daily'){
      key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    } else if(viewMode === 'monthly'){
      key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
    } else if(viewMode === 'yearly'){
      key = String(d.getFullYear());
    } else {
      key = w.week_label;
    }
    if(!grouped[key]) grouped[key] = { rev:0, clients:0 };
    grouped[key].rev += isBeauty ? w.beautySales : w.hairSalesNet;
    grouped[key].clients += w.total;
  }

  const labels = Object.keys(grouped).sort();
  const revData = labels.map(k=>grouped[k].rev);
  const clData  = labels.map(k=>grouped[k].clients);

  const isDark = document.documentElement.getAttribute('data-theme')==='dark';
  const textColor = isDark ? 'rgba(250,248,243,0.55)' : '#9a8a87';
  const gridColor = isDark ? 'rgba(250,248,243,0.06)' : 'rgba(92,85,87,0.08)';

  activeChart = new Chart(canvas, {
    data:{
      labels,
      datasets:[
        { type:'bar', label: isBeauty?'Beauty Sales':'Net Revenue', data:revData,
          backgroundColor: 'rgba(196,181,253,0.5)', borderColor:'#C4B5FD', borderWidth:1, borderRadius:6, yAxisID:'y' },
        { type:'line', label:'Clients', data:clData,
          borderColor:'#FF9B9B', backgroundColor:'transparent', pointBackgroundColor:'#FF9B9B',
          pointRadius:4, tension:0.3, borderWidth:2, yAxisID:'y2' },
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:true,
      plugins:{ legend:{ labels:{ color:textColor, font:{size:11}, boxWidth:12 } } },
      scales:{
        x:{ ticks:{ color:textColor, font:{size:10} }, grid:{ color:gridColor } },
        y:{ ticks:{ color:textColor, font:{size:10}, callback:v=>'AED '+Math.round(v/1000)+'k' }, grid:{ color:gridColor }, position:'left' },
        y2:{ ticks:{ color:textColor, font:{size:10} }, grid:{ display:false }, position:'right' },
      }
    }
  });
}


// ── DATE PICKER CALENDAR ───────────────────────────────────
let calYear, calMonth, calSelectingFrom = true, calFrom = null, calTo = null;

function initCal(){
  // Default to the month of calFrom if already set (from data), else current month
  const ref = calFrom || new Date();
  calYear = ref.getFullYear();
  calMonth = ref.getMonth();
  renderCal();
}

function calNav(dir){
  calMonth += dir;
  if(calMonth > 11){ calMonth = 0; calYear++; }
  if(calMonth < 0){ calMonth = 11; calYear--; }
  renderCal();
}

function renderCal(){
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  document.getElementById('calMonthLabel').textContent = months[calMonth] + ' ' + calYear;
  const grid = document.getElementById('calGrid');
  const days = ['Su','Mo','Tu','We','Th','Fr','Sa'];
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth+1, 0).getDate();
  let html = days.map(d=>`<div style="font-size:9px;text-align:center;color:var(--muted);padding:4px;letter-spacing:.05em">${d}</div>`).join('');
  for(let i=0;i<firstDay;i++) html += '<div></div>';
  for(let d=1;d<=daysInMonth;d++){
    const thisDate = new Date(calYear, calMonth, d);
    const iso = calYear + '-' + String(calMonth+1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
    let bg = 'transparent', color = 'var(--text)', fw = '400';
    const calFromIso = calFrom ? calFrom.getFullYear()+'-'+String(calFrom.getMonth()+1).padStart(2,'0')+'-'+String(calFrom.getDate()).padStart(2,'0') : null;
    const calToIso = calTo ? calTo.getFullYear()+'-'+String(calTo.getMonth()+1).padStart(2,'0')+'-'+String(calTo.getDate()).padStart(2,'0') : null;
    const isFrom = calFromIso === iso;
    const isTo = calToIso === iso;
    const inRange = calFrom && calTo && thisDate > calFrom && thisDate < calTo;
    if(isFrom || isTo){ bg = 'var(--accent)'; color = 'var(--accent-fg)'; fw = '700'; }
    else if(inRange){ bg = 'var(--surface2)'; }
    html += `<div onclick="calPickDay('${iso}')" style="
      text-align:center;padding:5px 2px;font-size:11px;cursor:pointer;border-radius:6px;
      background:${bg};color:${color};font-weight:${fw};transition:background .15s
    " onmouseover="this.style.opacity='.75'" onmouseout="this.style.opacity='1'">${d}</div>`;
  }
  grid.innerHTML = html;
}

function calPickDay(iso){
  const [y,m,day] = iso.split('-').map(Number);
const d = new Date(y, m-1, day);
  if(!calFrom || (calFrom && calTo)){
    calFrom = d; calTo = null; calSelectingFrom = false;
  } else {
    if(d < calFrom){ calTo = calFrom; calFrom = d; }
    else { calTo = d; }
    calSelectingFrom = true;
  }
  const fmt = dt => dt ? dt.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '';
  document.getElementById('calFromDisplay').textContent = fmt(calFrom) || 'Select start';
  document.getElementById('calToDisplay').textContent = fmt(calTo) || 'Select end';
  renderCal();
}

function clearDateRange(){
  calFrom = null; calTo = null;
  document.getElementById('calFromDisplay').textContent = 'Select start';
  document.getElementById('calToDisplay').textContent = 'Select end';
  document.getElementById('datePickerLabel').textContent = 'Select Date/s From and To';
  document.getElementById('dateFromInput').value = '';
  document.getElementById('dateToInput').value = '';
  dateFrom = null; dateTo = null;
  renderCal();
  renderGrid();
}

function applyDatePicker(){
  if(!calFrom){ return; }
  const effectiveTo = calTo || calFrom;
  const fmt = dt => dt.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
  document.getElementById('datePickerLabel').textContent = fmt(calFrom) + ' → ' + fmt(effectiveTo);
  document.getElementById('dateFromInput').value = calFrom.toISOString().split('T')[0];
  document.getElementById('dateToInput').value = effectiveTo.toISOString().split('T')[0];
  dateFrom = new Date(calFrom); dateFrom.setHours(0,0,0,0);
  dateTo = new Date(effectiveTo); dateTo.setHours(23,59,59,999);
  document.getElementById('datePickerDropdown').style.display = 'none';
  renderGrid();
}

// Close picker on outside click
let _pickerJustOpened = false;

function toggleDatePicker(){
  const dd = document.getElementById('datePickerDropdown');
  const isOpen = dd.style.display !== 'none';
  dd.style.display = isOpen ? 'none' : 'block';
  if(!isOpen){ renderCal(); _pickerJustOpened = true; }
}

document.addEventListener('click', e => {
  const wrap = document.getElementById('dateRangeWrap');
  if(wrap && !wrap.contains(e.target)){
    const dd = document.getElementById('datePickerDropdown');
    if(dd) dd.style.display = 'none';
  }
});

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('searchInput').addEventListener('input', renderGrid);
    document.getElementById('dateFromInput').addEventListener('change', applyDateRange);
    document.getElementById('dateToInput').addEventListener('change', applyDateRange);
    document.body.classList.add('hide-week-pills'); // keeps pills hidden by default
    initCal();
    loadData();
  });


function applyDateRange(){
  const fromVal = document.getElementById('dateFromInput').value;
  const toVal   = document.getElementById('dateToInput').value;

  dateFrom = fromVal ? new Date(fromVal + 'T00:00:00') : null;
  dateTo   = toVal   ? new Date(toVal + 'T23:59:59') : null;

  if (dateFrom) dateFrom.setHours(0,0,0,0);
  if (dateTo)   dateTo.setHours(23,59,59,999);

  renderGrid();
}
