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

// Map first name → surname (from Phorest TSV 31 May 2026)
const STYLIST_SURNAMES = {
  "Alan":      "Russell",
  "April":     "Miraflor",
  "Ashleigh":  "Fairgrieve",
  "Bethany":   "Smith",
  "Danika":    "Ogrady",
  "Eds":       "Asuncion",
  "Elise":     "Ford",
  "Emma":      "Williamson",
  "Hazel Mae": "Marco",
  "Holly":     "Branchett",
  "Ibrahim":   "Al Mofdi",
  "Irlyn":     "Padilla",
  "Jeida":     "Rachmanova",
  "Kate":      "Siryk",
  "Katie":     "Sanchez",
  "Kylie":     "Bazely",
  "Lizanie":   "Jacobsz",
  "Lucy":      "Rodriguez",
  "Molly":     "Robinson",
  "Nikki":     "Asuncion",
  "Olena":     "Ostertag",
  "Robyn":     "Hart",
  "Ruth":      "Bocock",
  "Shelley":   "Douglas",
  "Tammy":     "Peter",
  "Tegan":     "Skinner",
  "Zandri":    "Wilson",
  "Sophie":    "Harrison",
  "Toni":      "Brits",
  "Samantha":  "Ahmad",   // archived/resigned
  // Beauticians from Phorest TSV 31 May 2026
  "Mimi":      "Vertudes",
  "Grace":     "Sarmiento",
  "Shila":     "Mandal",
  "Kim":       "Casas",
  "Kimberly":  "Casas",
  "Reda":      "Ramirez",
  "Chona":     "Manlapaz",
  "Arnalyn":   "Salisi",
  "Judy":      "Barias",
  "Mona":      "Soba",
  "Rovina":    "Jordan",
  "Sania":     "Ayaz",
  "Stella":    "Mendes",
  "Galina":    "Spierling",
  "Mary Joy":  "Galos",
  "MJ":        "Galos",
  "Roja":      "Pudtado",
  "Shine":     "Castillo",
  // Additional stylists from Phorest TSV 31 May 2026
  "Tamryn":        "Peter",
  "Helen":         "Lita",
  "Maria Theresa": "Lascanu",
  "May":           "Fernandez",
  "Mevil":         "Miraflor",
  "Myra":          "Sarmiento",
  "Daisy":         "Cropper",
  "Clarissa":      "Destacamento",
  "Princess":      "Miranda",
  "Princess Areanne": "Miranda",
  "Areanne":       "Miranda",
  "Xyrhy":         "Unisa",
  "Goncalo":       "de Almeida",
  "Tara":          "Kidd",
  "Dorah":         "Namayanja",
  "Marjorie":      "Sevilla",
  "Oliver":        "Green",
  "Stuart":        "Hastings",
};

// Map first name → photo path (relative to stylist/photos/)
// Photos are organised into branch subfolders: KCA / SAA / MC / AQ
const STYLIST_PHOTOS = {

  // ── KHALIFA CITY (KCA) ──────────────────────────────
  "Kate":      "KCA/kate syrik.jpg",
  "Katie":     "KCA/katie sanchez.png",
  "Kylie":     "KCA/kylie bazely.png",
  "Lizanie":   "KCA/lizanie jacobz.png",
  "Irlyn":     "KCA/irlyn padilla.png",
  "Hazel Mae": "KCA/hazel-mae marco.png",
  "Nikki":     "KCA/nikki asuncion.png",
  "Samantha":  "KCA/samantha amad.png",

  // ── SAADIYAT / MAMSHA (SAA) ─────────────────────────
  "April":     "SAA/april miraflor.jpg",
  "Bethany":   "SAA/bethany smith.png",
  "Danika":    "SAA/danika ogrady.jfif",
  "Eds":       "SAA/eds asuncion.png",
  "Emma":      "SAA/emma williamson.jpg",
  "Holly":     "SAA/holly branchett.jpg",
  "Jeida":     "SAA/jeida rachmanova.jpg",
  "Molly":     "SAA/molly robinson.png",
  "Tammy":     "SAA/tamryn peter.png",
  "Tamryn":    "SAA/tamryn peter.png",

  // ── MOTOR CITY (MC) ─────────────────────────────────
  "Alan":      "MC/alan joeph russell.png",
  "Ashleigh":  "MC/ashleigh fairgreave.jpg",
  "Elise":     "MC/elise ford.png",
  "Olena":     "MC/olena ostertag.jfif",
  "Robyn":     "MC/robyn hart.png",
  "Ruth":      "MC/ruth bocock.jpg",
  "Zandri":    "MC/zandri wilson.jpg",

  // ── AL QUOZ (AQ) ────────────────────────────────────
  "Shelley":   "AQ/shelley douglas.png",
  "Tegan":     "AQ/tegan skinner.jfif",

  "Ibrahim":   "MC/ibrahim al mofdi.jpg",

  "Lucy":      "AQ/lucy gonzales rodriguez.jpg",
  "Toni":      "KCA/toni brits.png",
  "Sophie":    "KCA/sophie harrison.jpg",
};

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
  "Hazel Mae":  "https://www.instagram.com/hairby_mhay",
  "Irlyn":      "https://www.instagram.com/hairby_lyn11",
  "Ruth":       "https://www.instagram.com/rainbowsby_ruth",
  "Zandri":     "https://www.instagram.com/hairby.zandri",
  "Samantha":   "https://www.instagram.com/samanthaahmadhair",
  "Ibrahim":    "https://www.instagram.com/almofdi.hairstylist",
  "Shelley":    "https://www.instagram.com/shelley_the_global_hairstylist",
  "Sophie":     "https://www.instagram.com/sophiepatriciahair/"
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
  'NET SALON TAKE','TOTAL CLIENTS',
  'SHELLY']); // duplicate Phorest account — real record is SHELLEY DOUGLAS

const AVATAR_COLORS = ['#C4B5FD','#99F6E4','#FFD4D9','#FF9B9B','#EEF3C7','#B5EAD7','#FFDAC1','#D4E4FF'];
const fmtAED = n  => 'AED ' + (n||0).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2});
const fmtPct = n  => (+(n||0)).toFixed(2) + '%';
const initials = n => n.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();

function parseWeekLabelToDate(label) {
  if (!label) return null;
  const MMAP = {jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
  const rangeMatch = label.match(/\((\d{1,2})[–\-—](\d{1,2})\)/);
  const monthMatch = label.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i);
  const yearMatch  = label.match(/20\d\d/);
  if (rangeMatch && monthMatch && yearMatch) {
    const mo  = MMAP[monthMatch[1].toLowerCase()];
    const yr  = parseInt(yearMatch[0]);
    const day = parseInt(rangeMatch[1]);
    return new Date(yr, mo, day);
  }
  return null;
}

let dateFrom = null;
let dateTo = null;

// ── STATE ──────────────────────────────────────────────────
let allRows = [];         // raw supabase records
let stylistMap = {};      // name -> { weeks:[], hair/beautyStaff data consolidated }
let typeFilter = 'all';
let sortKey    = 'hairSalesNet';
let branchFilter = 'all';
window.showFratelli = true;

function toggleFratelli() {
  window.showFratelli = !window.showFratelli;
  const btn = document.getElementById('fratelliToggleBtn');
  const dot = document.getElementById('fratelliToggleDot');
  if (btn) {
    btn.style.opacity        = window.showFratelli ? '1' : '0.4';
    btn.style.textDecoration = window.showFratelli ? 'none' : 'line-through';
  }
  if (dot) dot.style.opacity = window.showFratelli ? '1' : '0.3';
  renderGrid();
}
let selectedStylist = null;
let activeChart = null;
let viewMode = 'weekly';

//CHART VIEW MODES
function setChartView(mode, el){
  viewMode = mode;

  const lbl = document.getElementById('chartTitleLabel');
  const rawName = (selectedStylist || '');
const cleanName = rawName.replace(/\s?IG$/, '');

if(lbl) lbl.textContent = cleanName + ' · ' + mode.charAt(0).toUpperCase()+mode.slice(1) + ' Trend';

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

async function loadData(){
  // Fetch all weekly_data rows (same source as main dashboard)
  const PAGE = 1000;
  let from = 0;
  let fetched = [];
  while(true){
    const { data, error } = await sb
      .from('weekly_data')
      .select('*')
      .order('uploaded_at', { ascending: true })
      .range(from, from + PAGE - 1);
    if(error){
      document.getElementById('loadingEl').innerHTML='<div style="color:var(--bad)">Error loading data: '+error.message+'</div>';
      return;
    }
    if(!data || data.length === 0) break;
    fetched.push(...data);
    if(data.length < PAGE) break;
    from += PAGE;
  }

  // Flatten weekly_data JSON into one row per stylist per week
  allRows = [];
  for(const row of fetched){
    const { branch, week_label, uploaded_at } = row;
    const d = row.data || {};
    const hairStaff   = d.hairStaff   || [];
    const beautyStaff = d.beautyStaff || [];

    for(const s of hairStaff){
      allRows.push({
        branch,
        week_label:     week_label || '—',
        uploaded_at,
        date:           uploaded_at ? uploaded_at.split('T')[0] : '—',
        name:           (s.name || '').trim(),
        is_beauty:      false,
        total:          s.total        || 0,
        req:            s.req          || 0,
        salon:          s.salon        || 0,
        new_c:          s.newC         || 0,
        rebooked:       s.rebooked     || 0,
        rebook_pct:     s.rebookPct    || 0,
        hair_sales_net: s.hairSalesNet || 0,
        hair_sales:     s.hairSales    || 0,
        beauty_sales:   0,
        avg_bill:       s.avgBill      || 0,
        col:            s.col          || 0,
        col_pct:        s.colPct       || 0,
        retail:         s.retail       || 0,
        treatments:     s.treatments   || 0,
        ncr_pct:        s.ncrPct       || 0,
      });
    }

    for(const s of beautyStaff){
      allRows.push({
        branch,
        week_label:     week_label || '—',
        uploaded_at,
        date:           uploaded_at ? uploaded_at.split('T')[0] : '—',
        name:           (s.name || '').trim(),
        is_beauty:      true,
        total:          s.total        || 0,
        req:            s.req          || 0,
        salon:          s.salon        || 0,
        new_c:          s.newC         || 0,
        rebooked:       s.rebooked     || 0,
        rebook_pct:     s.rebookPct    || 0,
        hair_sales_net: 0,
        hair_sales:     0,
        beauty_sales:   s.beautySales  || s.beautyNet || 0,
        avg_bill:       s.avgBill      || 0,
        col:            0,
        col_pct:        0,
        retail:         0,
        treatments:     0,
        ncr_pct:        s.ncrPct       || 0,
      });
    }
  }

  // Default to all data — let user apply date filter (matches main dashboard behaviour)
  const now2 = new Date();
  calYear  = now2.getFullYear();
  calMonth = now2.getMonth();
  calFrom  = null;
  calTo    = null;
  dateFrom = null;
  dateTo   = null;

  const fmt = dt => dt.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
  const _set = (id, prop, val) => { const el = document.getElementById(id); if(el) el[prop] = val; };
  _set('dateFromInput',   'value',       '');
  _set('dateToInput',     'value',       '');
  _set('datePickerLabel', 'textContent', 'All dates');
  _set('calFromDisplay',  'textContent', 'Select start');
  _set('calToDisplay',    'textContent', 'Select end');

  buildStylistMap();
  document.getElementById('loadingEl').style.display = 'none';
  document.getElementById('mainContent').style.display = 'block';
  renderGrid();
}



function isSkip(name){
  const n = name.toUpperCase().trim();
  if(SKIP_NAMES.has(n)) return true;
  if(n.includes('RETAIL') || n.includes('TREATMENT') || n.includes('TAKE') || n.includes('TOTAL') || n.includes('SALES')) return true;
  return false;
}

// Merge duplicate/misspelled Phorest names into one canonical name
const NAME_ALIASES = {
  "Shelly":  "Shelley",
  "Lucia":   "Lucy",
  "Arni":    "Arnalyn",
  "MJ":      "Mary Joy",
  "Mae":     "Hazel Mae",
};

// Reverse of NAME_ALIASES: canonical → ledger nickname
const REVERSE_ALIASES = Object.fromEntries(
  Object.entries(NAME_ALIASES).map(([alias, canonical]) => [canonical, alias])
);

function normaliseName(raw) {
  if (NAME_ALIASES[raw]) return NAME_ALIASES[raw];
  const lower = raw.toLowerCase();
  for (const [alias, canonical] of Object.entries(NAME_ALIASES)) {
    if (alias.toLowerCase() === lower) return canonical;
  }
  return raw;
}

function buildStylistMap(){
  stylistMap = {};
  for(const row of allRows){
    const rawName = (row.name || '').trim();
    if(!rawName || isSkip(rawName)) continue;
    const name = normaliseName(rawName);
    const isBeauty = row.is_beauty || BEAUTY_NAMES.has(name.toUpperCase());
    if(!stylistMap[name]){
      stylistMap[name] = { name, isBeauty, weeks:[], color: AVATAR_COLORS[Object.keys(stylistMap).length % AVATAR_COLORS.length] };
    }
    stylistMap[name].weeks.push({
      week_label:   row.week_label || row.date || '—',
      date_key:     row.date       || '—',
      branch:       row.branch||'—',
      uploaded_at:  row.uploaded_at,
      total:        row.total||0,
      req:          row.req||0,
      salon:        row.salon||0,
      newC:         row.new_c||0,
      rebooked:     row.rebooked||0,
      rebookPct:    row.rebook_pct||0,
      hairSalesNet: row.hair_sales_net||0,
      hairSales:    row.hair_sales||0,
      beautySales:  row.beauty_sales||0,
      avgBill:      row.avg_bill||0,
      col:          row.col||0,
      colPct:       row.col_pct||0,
      retail:       row.retail||0,
      treatments:   row.treatments||0,
      ncrPct:       row.ncr_pct||0,
    });
  }
}


function getWeekDatesFromLabel(label) {
  if (!label) return null;
  const monthMap = { JAN:0,FEB:1,MAR:2,APR:3,MAY:4,JUN:5,JUL:6,AUG:7,SEP:8,OCT:9,NOV:10,DEC:11 };

  // Format: "Apr 2026 Week 4 (20–26)" — single month, day-range only in parens
  const single = label.match(/\((\d{1,2})[–\-—](\d{1,2})\)/);
  const singleMon = label.match(/(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)/i);
  const singleYear = label.match(/20\d\d/);
  if (single && singleMon && singleYear) {
    const mo  = monthMap[singleMon[1].toUpperCase()];
    const yr  = parseInt(singleYear[0]);
    const startDay = parseInt(single[1]);
    const endDay   = parseInt(single[2]);
    const start = new Date(yr, mo, startDay); start.setHours(0,0,0,0);
    // handle month wrap (e.g. 29–2 spans into next month)
    let endMo = mo, endYr = yr;
    if (endDay < startDay) { endMo++; if (endMo > 11) { endMo = 0; endYr++; } }
    const end = new Date(endYr, endMo, endDay); end.setHours(0,0,0,0);
    return { start, end };
  }

  // Format: "(APR 20 – MAY 2)" — cross-month range
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
    const weekDates = getWeekDatesFromLabel(w.week_label);
    let checkDate;
    if (weekDates) {
      // Include if the week overlaps the selected range at all (start ≤ dateTo AND end ≥ dateFrom)
      if (dateFrom && weekDates.end < dateFrom) return false;
      if (dateTo   && weekDates.start > dateTo) return false;
      return true;
    } else {
      // Fallback: try uploaded_at date only — but don't use it as the week date
      // since upload can happen days/weeks after the actual week period.
      // Instead, parse the year/month from the week_label text directly.
      const labelYear  = (w.week_label || '').match(/20\d\d/);
      const MMAP = {jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
      const labelMonth = (w.week_label || '').match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i);
      if (labelYear && labelMonth) {
        // Place the record at the 1st of that month — good enough for monthly filtering
        checkDate = new Date(parseInt(labelYear[0]), MMAP[labelMonth[1].toLowerCase()], 1);
      } else {
        // No date info at all — include the record rather than exclude it
        return true;
      }
    }
    if (dateFrom && checkDate < dateFrom) return false;
    if (dateTo   && checkDate > dateTo)   return false;
    return true;
  });
}


// Branch filter
if (branchFilter !== 'all') {
  weeks = weeks.filter(w => w.branch === branchFilter);
}
if (!window.showFratelli) {
  weeks = weeks.filter(w => w.branch !== 'FRT');
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
    retailPct:     netRevTotal > 0 ? (sum('retail') / netRevTotal) * 100 : 0,
    treatmentPct:  sum('hairSalesNet') > 0 ? (sum('treatments') / sum('hairSalesNet')) * 100 : 0,
    weeks,
  };
}

// ── RENDER GRID ────────────────────────────────────────────
function renderGrid(){
  const search = document.getElementById('searchInput').value.trim().toUpperCase();
  branchFilter = document.getElementById('branchFilter')?.value || 'all';

  let stylists = Object.values(stylistMap).filter(s=>{
    if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
    const stats = getStats(s);
    if(!stats) return false;
    s._stats = stats;
    return true;
  });

  if(!stylists.length){
    console.warn('No results after filtering. Check date range.');
  }


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
  const totalClients = list.reduce((sum, s) => sum + (s._stats ? s._stats.total : 0), 0);
  document.getElementById(titleId).textContent = `${title} · ${count} ${count===1?'person':'people'} · ${totalClients.toLocaleString()} clients`;
  const grid = document.getElementById(gridId);

  grid.innerHTML = list.map((s,idx)=>{
    const st   = s._stats;
    const rev  = s.isBeauty ? st.beautySales : st.hairSalesNet;
    const revLabel = s.isBeauty ? 'Beauty Sales' : 'Net Hair Rev';

    // Week pills: all weeks this stylist appears in (highlight ones matching filter)
    const allWeeks  = [...new Set(s.weeks.map(w=>w.week_label))].sort();
    const activeWks = new Set(st.weeks.map(w=>w.week_label));
    const pillsHTML = allWeeks.map(w=>`<span class="week-pill ${activeWks.has(w)?'active':''}">${w}</span>`).join('');

    const cleanName = s.name.toLowerCase().split(' ').map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' ');
    const igUrl     = STYLIST_IG[cleanName];
    const surname   = STYLIST_SURNAMES[cleanName] || '';
    const photoFile = STYLIST_PHOTOS[cleanName];
    const avatarHTML = photoFile
      ? `<img class="stylist-avatar stylist-avatar-photo" src="photos/${photoFile}" alt="${s.name}" onerror="if(!this.dataset.tried){this.dataset.tried=1;this.src=this.src.replace(/\\.\\w+$/,'.jfif')}else{this.style.display='none';this.nextElementSibling.style.display='flex'}"><div class="stylist-avatar" style="background:${s.color};display:none">${initials(s.name)}</div>`
      : `<div class="stylist-avatar" style="background:${s.color}">${initials(s.name)}</div>`;

    // Branch accent colour for card top bar + avatar ring
    const branches = [...new Set(st.weeks.map(w=>w.branch))];
    const branchAccents = {KCA:'#fcd4a0',SAA:'#c4b5fd',MC:'#99f6e4',AQ:'#fce99a',FRT:'#cdd98a'};
    const cardAccent = branchAccents[branches[0]] || 'var(--border)';

    // Rebook badge class
    const rebookClass = st.rebookPct >= 40 ? 'good' : st.rebookPct >= 20 ? 'warn' : 'bad';

    const rank = idx + 1;
    const rankLabel = rank <= 3 ? ['🥇','🥈','🥉'][rank-1] : `#${rank}`;

    return `<div class="stylist-card ${selectedStylist===s.name?'selected':''}" style="--card-accent:${cardAccent}" onclick="selectStylist('${s.name}')">
      <div class="card-inner">
        <div class="stylist-card-top">
          <div class="stylist-avatar-wrap">
            ${avatarHTML}
          </div>
          <div style="min-width:0;flex:1">
            <div style="display:flex;align-items:center;gap:6px">
              <span class="card-rank">${rankLabel}</span>
              <div class="stylist-card-name">${cleanName}${surname ? ' ' + surname : ''}</div>
            </div>
            ${REVERSE_ALIASES[cleanName] ? `<div class="stylist-card-nickname">${REVERSE_ALIASES[cleanName]}</div>` : ''}
            <div class="stylist-card-type" style="margin-top:4px">
              <span class="job-pill ${s.isBeauty?'beauty':'hair'}">${s.isBeauty?'💅 Beautician':'✂️ Hair Stylist'}</span>
            </div>
            <div class="stylist-card-type" style="margin-top:3px">
              ${branches.map(b=>{const slug={KCA:'kca',SAA:'saa',MC:'mc',AQ:'aq',FRT:'frt'}[b]||'kca';const label=BRANCH_INFO[b]?.name||b;return`<span class="branch-pill ${slug}">${label}</span>`;}).join('')}
              <span class="weeks-label">${st.weeksActive}w</span>
            </div>
            ${igUrl ? `<a href="${igUrl}" target="_blank" onclick="event.stopPropagation()" class="ig-link" title="View on Instagram"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg><span>View on Instagram</span></a>` : ''}
          </div>
        </div>

        <div class="card-revenue">
          <div class="card-revenue-label">${revLabel}</div>
          <div class="card-revenue-val">${fmtAED(rev)}</div>
          <div class="card-revenue-sub">Avg bill ${fmtAED(st.avgBill)}</div>
        </div>

        <div class="card-stats">
          <div class="card-stat">
            <span class="card-stat-label">Total Clients</span>
            <span class="card-stat-val">${st.salon + st.req + st.newC}</span>
            <div class="client-breakdown">
              <span class="cb-tag">Salon <strong>${st.salon}</strong></span>
              <span class="cb-tag">Req <strong>${st.req}</strong></span>
              <span class="cb-tag">New <strong>${st.newC}</strong></span>
            </div>
          </div>
          <div class="card-stat">
            <span class="card-stat-label">Rebook %</span>
            <span class="rebook-badge ${rebookClass}">${fmtPct(st.rebookPct)}</span>
            <span class="card-stat-label" style="margin-top:3px">${st.rebooked} rebooked</span>
          </div>
          <div class="card-stat">
            <span class="card-stat-label">Retail Sales</span>
            <span class="card-stat-val">${fmtAED(st.retail)}</span>
          </div>
          <div class="card-stat">
            <span class="card-stat-label">Retail %</span>
            <span class="card-stat-val">${fmtPct(st.retailPct)}</span>
          </div>
        </div>
      </div>
      <div class="stylist-weeks-pills" style="padding:0 16px 12px">${pillsHTML}</div>
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
  document.getElementById('detailPanel').innerHTML = '';
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
  const retailClass    = st.retailPct >= 12 ? 'good' : st.retailPct >= 8 ? 'warn' : 'bad';
  const treatmentClass = st.treatmentPct >= 20 ? 'good' : st.treatmentPct >= 10 ? 'warn' : 'bad';
  const colClass = st.colPct >= 60 ? 'good' : st.colPct >= 40 ? '' : 'bad';
  
  panel.innerHTML = `
    <div class="detail-header">
      ${(()=>{
        const cn = s.name.toLowerCase().split(' ').map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' ');
        const pf = STYLIST_PHOTOS[cn];
        return pf
          ? `<img class="detail-avatar detail-avatar-photo" src="photos/${pf}" alt="${s.name}" onerror="if(!this.dataset.tried){this.dataset.tried=1;this.src=this.src.replace(/\\.\\w+$/,'.jfif')}else{this.style.display='none';this.nextElementSibling.style.display='flex'}"><div class="detail-avatar" style="background:${s.color};display:none">${initials(s.name)}</div>`
          : `<div class="detail-avatar" style="background:${s.color}">${initials(s.name)}</div>`;
      })()}
      <div>
        <div class="detail-name">${(()=>{
  const cn  = s.name.toLowerCase().split(' ').map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' ');
  const sn  = STYLIST_SURNAMES[cn] || '';
  return `${s.name}${sn?' '+sn:''}`;
})()}</div>
        <div class="detail-sub" style="display:flex;flex-wrap:wrap;align-items:center;gap:5px;margin-top:3px">
          <span class="job-pill ${isBeauty?'beauty':'hair'}">${isBeauty?'💅 Beautician':'✂️ Hair Stylist'}</span>
          ${[...new Set(st.weeks.map(w=>w.branch))].map(b=>{const slug={KCA:'kca',SAA:'saa',MC:'mc',AQ:'aq',FRT:'frt'}[b]||'kca';const label=BRANCH_INFO[b]?.name||b;return`<span class="branch-pill ${slug}">${label}</span>`;}).join('')}
          <span style="color:var(--muted);font-size:10px">· Active ${st.weeksActive}w ·</span>
        </div>
        ${(()=>{
  const cn  = s.name.toLowerCase().split(' ').map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' ');
  const url = STYLIST_IG[cn];
  return url ? `<a href="${url}" target="_blank" class="ig-link" title="View on Instagram"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg><span>View on Instagram</span></a>` : '';
})()}
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
        <div class="metric-box-value">${(st.total||0).toLocaleString()}</div>
        <div class="metric-box-sub">${Math.round(st.total/Math.max(1,st.weeksActive)).toLocaleString()}/week avg</div>
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
      <div class="metric-box ${retailClass}">
        <div class="metric-box-label">Retail %</div>
        <div class="metric-box-value">${fmtPct(st.retailPct)}</div>
        <div class="metric-box-sub">${fmtAED(st.retail)} · Target: 12%</div>
      </div>
      <div class="metric-box ${treatmentClass}">
        <div class="metric-box-label">Treatment %</div>
        <div class="metric-box-value">${fmtPct(st.treatmentPct)}</div>
        <div class="metric-box-sub">${fmtAED(st.treatments)} · Target: 20%</div>
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
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;margin-top:4px;cursor:pointer;" onclick="toggleWeeklyTable(this)">
      <div class="chart-title" style="margin-bottom:0">WEEK-BY-WEEK BREAKDOWN</div>
      <span class="weekly-toggle-icon" style="font-size:11px;color:var(--muted);user-select:none;">▾ Hide</span>
    </div>
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
      <button class="tab-btn chart-toggle-btn" onclick="setChartView('daily', this)">Daily</button>
      <button class="tab-btn chart-toggle-btn" onclick="setChartView('weekly', this)">Weekly</button>
      <button class="tab-btn chart-toggle-btn" onclick="setChartView('monthly', this)">Monthly</button>
      <button class="tab-btn chart-toggle-btn" onclick="setChartView('yearly', this)">Yearly</button>
    </div>
  </div>

  <span id="chartTitleLabel">${s.name} · ${viewMode.charAt(0).toUpperCase()+viewMode.slice(1)} Trend</span>
  <canvas id="trendChart"></canvas>
</div>
  `;

  // Draw charts after DOM is ready
  setTimeout(()=>{
    drawChart(st, isBeauty);
    drawRadar(st, isBeauty);
    document.querySelectorAll('.chart-toggle-btn').forEach(b=>{
      b.classList.toggle('active', b.textContent.toLowerCase() === viewMode);
    });
  }, 50);
}

function renderWeekTable(st, isBeauty){
  const weeks = [...st.weeks].sort((a,b)=>{
    const da = parseWeekLabelToDate(a.week_label) || new Date(a.date_key||0);
    const db = parseWeekLabelToDate(b.week_label) || new Date(b.date_key||0);
    return da - db;
  });
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

function toggleWeeklyTable(headerEl){
  const tableWrap = headerEl.nextElementSibling;
  const icon = headerEl.querySelector('.weekly-toggle-icon');
  const isHidden = tableWrap.style.display === 'none';
  tableWrap.style.display = isHidden ? '' : 'none';
  icon.textContent = isHidden ? '▾ Hide' : '▸ Show Week-by-Week Breakdown';
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
  const retailScore      = Math.min(100, (st.retailPct / 12) * 100);

  window._activeRadar = new Chart(canvas, {
    type: 'radar',
    data: {
      labels: ['Rebook %', 'Avg Bill', 'NCR %', isBeauty ? 'Beauty' : 'Colour %', 'Clients', isBeauty ? 'Consistency' : 'Retail %'],
      datasets: [{
        label: st.name || 'Stylist',
        data: [rebookScore, avgBillScore, ncrScore, colScore, 100, isBeauty ? consistencyScore : retailScore],
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
    const d = weekDates
      ? weekDates.start
      : (w.date_key && w.date_key.match(/^\d{4}-\d{2}-\d{2}$/)
          ? new Date(w.date_key + 'T00:00:00')
          : new Date(w.uploaded_at));
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

  let labels = Object.keys(grouped).sort();

  if(viewMode === 'daily' && dateFrom && dateTo){
    const filled = [];
    const cur = new Date(dateFrom);
    while(cur <= dateTo){
      const key = cur.getFullYear() + '-' + String(cur.getMonth()+1).padStart(2,'0') + '-' + String(cur.getDate()).padStart(2,'0');
      filled.push(key);
      if(!grouped[key]) grouped[key] = { rev:0, clients:0 };
      cur.setDate(cur.getDate() + 1);
    }
    labels = filled;
  }

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
const calState = { year: new Date().getFullYear(), month: new Date().getMonth() };
let pickerFromDate = null;
let pickerToDate   = null;
let pickingStep    = 'from'; // 'from' | 'to'

function toggleDatePicker() {
  const pop = document.getElementById('datePickerPop');
  const btn = document.getElementById('btn-daterange');
  const isOpen = pop.classList.contains('open');
  document.querySelectorAll('.ms-drop').forEach(d => d.classList.remove('open'));
  document.querySelectorAll('.ms-btn').forEach(b => b.classList.remove('open'));
  if (isOpen) { pop.style.display = 'none'; pop.classList.remove('open'); btn.classList.remove('active'); return; }

  const now = new Date();
  if (dateFrom) { calState.year = dateFrom.getFullYear(); calState.month = dateFrom.getMonth(); }
  else { calState.year = now.getFullYear(); calState.month = now.getMonth(); }
  pickerFromDate = dateFrom ? new Date(dateFrom) : null;
  pickerToDate   = dateTo   ? new Date(dateTo)   : null;
  pickingStep    = pickerFromDate ? (pickerToDate ? 'from' : 'to') : 'from';

  pop.style.display = 'block';
  pop.classList.add('open');
  btn.classList.add('active');
  buildYearOptions();
  renderCalendar();
  updateStepUI();
}

function buildYearOptions() {
  const sel = document.getElementById('calYearSel');
  if (!sel) return;
  const cur = calState.year;
  sel.innerHTML = '';
  for (let y = cur - 3; y <= cur + 2; y++) {
    const o = document.createElement('option');
    o.value = y; o.textContent = y;
    if (y === cur) o.selected = true;
    sel.appendChild(o);
  }
}

function calMonthChange() {
  const sel = document.getElementById('calMonthSel');
  if (sel) calState.month = parseInt(sel.value);
  renderCalendar();
}

function calYearChange() {
  const sel = document.getElementById('calYearSel');
  if (sel) calState.year = parseInt(sel.value);
  buildYearOptions();
  renderCalendar();
}

function shiftCal(dir) {
  calState.month += dir;
  if (calState.month > 11) { calState.month = 0; calState.year++; }
  if (calState.month < 0)  { calState.month = 11; calState.year--; }
  const ms = document.getElementById('calMonthSel');
  const ys = document.getElementById('calYearSel');
  if (ms) ms.value = calState.month;
  buildYearOptions();
  renderCalendar();
}

function renderCalendar() {
  const { year, month } = calState;
  const ms = document.getElementById('calMonthSel');
  if (ms) ms.value = month;

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date(); today.setHours(0,0,0,0);
  const DAYS = ['Su','Mo','Tu','We','Th','Fr','Sa'];

  let html = DAYS.map(d => `<div class="cal-day-hdr">${d}</div>`).join('');
  for (let i = 0; i < firstDay; i++) html += `<div class="cal-day cal-day-empty"></div>`;

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d); date.setHours(0,0,0,0);
    const isToday = date.getTime() === today.getTime();
    const isFrom  = pickerFromDate && date.getTime() === pickerFromDate.getTime();
    const isTo    = pickerToDate   && date.getTime() === pickerToDate.getTime();
    const inRange = pickerFromDate && pickerToDate && date > pickerFromDate && date < pickerToDate;

    let cls = 'cal-day';
    if (isFrom && isTo)  cls += ' cal-day-selected';
    else if (isFrom)     cls += ' cal-day-range-start';
    else if (isTo)       cls += ' cal-day-range-end';
    else if (inRange)    cls += ' cal-day-in-range';
    if (isToday)         cls += ' cal-day-today';

    html += `<div class="${cls}" onclick="pickDay(${year},${month},${d})">${d}</div>`;
  }
  document.getElementById('calGrid').innerHTML = html;
}

function pickDay(year, month, day) {
  const date = new Date(year, month, day); date.setHours(0,0,0,0);

  if (pickingStep === 'from') {
    pickerFromDate = date;
    pickerToDate   = null;
    pickingStep    = 'to';
  } else {
    if (date < pickerFromDate) {
      pickerToDate   = pickerFromDate;
      pickerFromDate = date;
    } else {
      pickerToDate = date;
    }
    pickingStep = 'from';
  }
  renderCalendar();
  updateStepUI();
}

function updateStepUI() {
  const fmt = d => d ? d.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : null;
  const fromEl   = document.getElementById('calStepFrom');
  const toEl     = document.getElementById('calStepTo');
  const fromVal  = document.getElementById('calStepFromVal');
  const toVal    = document.getElementById('calStepToVal');
  const selEl    = document.getElementById('date-picker-selection');

  if (fromEl) fromEl.classList.toggle('active-step', pickingStep === 'from');
  if (toEl)   toEl.classList.toggle('active-step',   pickingStep === 'to');

  if (fromVal) {
    fromVal.textContent = pickerFromDate ? fmt(pickerFromDate) : 'Select start';
    fromVal.className   = 'cal-step-val' + (pickerFromDate ? ' set' : '');
  }
  if (toVal) {
    toVal.textContent = pickerToDate ? fmt(pickerToDate) : 'Select end';
    toVal.className   = 'cal-step-val' + (pickerToDate ? ' set' : '');
  }
  if (selEl) {
    if (!pickerFromDate) { selEl.textContent = 'Click a date to set FROM'; selEl.className = 'date-picker-selection'; }
    else if (!pickerToDate) { selEl.textContent = 'Now click a date to set TO'; selEl.className = 'date-picker-selection'; }
    else { selEl.textContent = `${fmt(pickerFromDate)} → ${fmt(pickerToDate)}`; selEl.className = 'date-picker-selection has-range'; }
  }
}

function applyDateRange() {
  if (!pickerFromDate) return;
  dateFrom = new Date(pickerFromDate); dateFrom.setHours(0,0,0,0);
  dateTo   = new Date(pickerToDate || pickerFromDate); dateTo.setHours(23,59,59,999);
  const lbl = document.getElementById('lbl-daterange');
  const fmt = d => d.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'2-digit' });
  lbl.textContent = dateTo && dateTo.getTime() !== dateFrom.getTime()
    ? `${fmt(dateFrom)} – ${fmt(dateTo)}`
    : fmt(dateFrom);
  const pop = document.getElementById('datePickerPop');
  const btn = document.getElementById('btn-daterange');
  pop.style.display = 'none'; pop.classList.remove('open'); btn.classList.remove('active');
  renderGrid();
}

function clearDateRange() {
  dateFrom = null; dateTo = null;
  pickerFromDate = null; pickerToDate = null;
  pickingStep = 'from';
  const lbl = document.getElementById('lbl-daterange');
  if (lbl) lbl.textContent = 'Select Date/s From and To';
  renderCalendar();
  updateStepUI();
  renderGrid();
}

document.addEventListener('click', e => {
  const wrap = document.getElementById('dateRangeWrap');
  if (wrap && !wrap.contains(e.target)) {
    const pop = document.getElementById('datePickerPop');
    const btn = document.getElementById('btn-daterange');
    if (pop) { pop.style.display = 'none'; pop.classList.remove('open'); }
    if (btn) btn.classList.remove('active');
  }
});

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('searchInput').addEventListener('input', renderGrid);
  document.body.classList.add('hide-week-pills');
  buildYearOptions();
  renderCalendar();
  updateStepUI();
  loadData();
});
