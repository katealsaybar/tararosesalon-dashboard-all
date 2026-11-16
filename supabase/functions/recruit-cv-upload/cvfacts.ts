// Recruitment: what a CV says about years of experience and where the person lives (Kate, 16 Nov 2026). Pure functions, no network, no database.
// Used by index.ts (on upload and for the backfill). Migration: migrations/recruit_cv_facts.sql.
//
// Experience: a number plus a year word (years, ans, años, anni, Jahre, anos, jaar, yıl, سنوات, лет ...) on a line that also says "experience" in that language.
// The biggest labelled number wins (the total is the largest). No date-range sums, no "since" guesses: only what the CV states.
// Based in: a country, UAE emirate or well-known city in the header block (first lines) or on an Address / Adresse / Location line. Birth place, nationality,
// passport and visa lines are ignored. Names that are also first names (Jordan, Mali ...) only count after a comma or on an address line.
// If there is no place but the header has a +971 number the country is the UAE (no emirate).

export type Facts = { experience: string; country: string; emirate: string };

const UAE = "United Arab Emirates";
const NB = "(?<![\\p{L}\\p{N}])";
const NA = "(?![\\p{L}\\p{N}])";

function fold(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f\u064b-\u065f\u0670]/g, "").toLowerCase();
}

function prep(raw: string): string[] {
  const t = raw
    .replace(/[\u0660-\u0669]/g, (c) => String(c.charCodeAt(0) - 0x660))
    .replace(/[\u06f0-\u06f9]/g, (c) => String(c.charCodeAt(0) - 0x6f0))
    .replace(/[\u2018\u2019`\u00b4]/g, "'")
    .replace(/[\u00a0\u2000-\u200f\u202a-\u202e]/g, " ");
  return t.split(/\r?\n/).map((l) => fold(l).replace(/\s+/g, " ").trim()).filter((l) => l.length > 0);
}

// ---------------------------------------------------------------- experience
const EXP_WORD = "(?:experiences?|experiencia|esperienza|erfahrung|berufserfahrung|arbeitserfahrung|ervaring|deneyim|exp|опыт|стаж|خبره|خبرة)";
const YEAR_UNIT = "(?:years?|yrs?|ans?|annees?|anos?|anni|anno|jahre[n]?|jahr|jaar|jaren|yil|سنه|سنة|سنوات|سنين|عام|اعوام|лет|год|года)";
const WORDNUM: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, sept: 7, huit: 8, neuf: 9, dix: 10,
  onze: 11, douze: 12, quinze: 15, vingt: 20,
};
const WORDS_RE = new RegExp(NB + "(" + Object.keys(WORDNUM).join("|") + ")(?=\\s*\\+?\\s*" + YEAR_UNIT + NA + ")", "giu");
const EXP_RE = new RegExp(EXP_WORD.replace("(?:", NB + "(?:") + NA, "iu");
const EXP_START = new RegExp("^(?:de |d'|of |en |in |на |de la )?" + EXP_WORD + NA, "iu");
const NUM_UNIT = new RegExp(
  NB + "(?:(\\d{1,2})\\s*(?:-|–|—|to|a|à|bis|до)\\s*)?(\\d{1,2}(?:[.,]\\d)?)\\s*(\\+)?\\s*" + YEAR_UNIT + NA +
  "(?!\\s*(?:old|ago|of age|d'age|de edad|alt|de vie))(?:\\s*(?:and|et|y|e|und|,)?\\s*(\\d{1,2})\\s*(?:months?|mois|meses|mesi|monate?)" + NA + ")?",
  "giu",
);
const NUM_UNIT_AT_END = new RegExp(NB + "\\d{1,2}(?:[.,]\\d)?\\s*\\+?\\s*" + YEAR_UNIT + "[\\s.,:;)]*$", "iu");

type Exp = { hi: number; lo: number | null; plus: boolean; months: number | null };

function experienceOf(lines: string[]): string {
  let best: Exp | null = null;
  const take = (line: string) => {
    const s = line.replace(WORDS_RE, (w) => String(WORDNUM[w.toLowerCase()]));
    NUM_UNIT.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = NUM_UNIT.exec(s)) !== null) {
      const hi = parseFloat(m[2].replace(",", "."));
      const lo = m[1] ? parseInt(m[1], 10) : null;
      if (!(hi >= 1 && hi <= 50)) continue;
      if (lo !== null && !(lo >= 1 && lo < hi)) continue;
      const before = s.slice(Math.max(0, m.index - 12), m.index);
      if (/(?:age|alter|edad|eta)[\s:]*$/.test(before)) continue;
      const cand: Exp = { hi, lo, plus: m[3] === "+", months: m[4] ? parseInt(m[4], 10) : null };
      if (!best || cand.hi > best.hi) best = cand;
    }
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (EXP_RE.test(l)) take(l);
    // "10 ans" at the end of a line and "d'experience" at the start of the next one
    else if (NUM_UNIT_AT_END.test(l) && i + 1 < lines.length && EXP_START.test(lines[i + 1])) take(l);
  }
  if (!best) return "";
  const b: Exp = best;
  const n = String(b.hi);
  if (b.lo !== null) return `${b.lo} to ${n} years`;
  if (b.plus) return `${n} plus years`;
  if (b.months && b.hi === Math.floor(b.hi) && b.months < 12) return `${n} year${b.hi === 1 ? "" : "s"} and ${b.months} months`;
  return `${n} year${b.hi === 1 ? "" : "s"}`;
}

// ---------------------------------------------------------------- places
type Kind = "country" | "emirate" | "city";
type Place = { kind: Kind; country: string; emirate?: string; weak?: boolean };

const COUNTRIES = `
United Arab Emirates|uae,u.a.e,emirats arabes unis,emiratos arabes unidos,emirati arabi uniti,vereinigte arabische emirate,emirados arabes unidos,الامارات العربيه المتحده,الامارات
Saudi Arabia|ksa,saudi,arabie saoudite,arabia saudita,arabia saudi,saudi-arabien,saudi arabien,السعوديه,المملكه العربيه السعوديه,саудовская аравия
Qatar|katar,قطر
Kuwait|koweit,kuwait,الكويت
Bahrain|bahrein,bahrein,البحرين
Oman|sultanate of oman,سلطنه عمان
Jordan|jordanie,jordania,jordanien,الاردن,jordan!
Lebanon|liban,libano,libanon,لبنان
Syria Arab Republic|syria,syrie,siria,syrien,سوريا,сирия
Iraq|irak,العراق
Iran|ایران,иран
Egypt|egypte,egipto,egitto,agypten,aegypten,misir,مصر,египет
Tunisia|tunisie,tunez,tunesien,تونس,тунис
Algeria|algerie,argelia,algerien,الجزائر,алжир
Morocco|maroc,marruecos,marocco,marokko,المغرب,марокко
Libya|libye,libia,ليبيا
Sudan|soudan,sudan,السودان
Yemen|yemen,اليمن
Palestine|palestine,فلسطين
Türkiye|turkey,turkiye,tuerkiye,turquie,turquia,turchia,turkei,تركيا,турция,турцию
Russian Federation|russia,russie,rusia,russland,россия,россии,россию
Ukraine|ukraine,ucrania,украина,украине
Kazakhstan|kazakhstan,kazajistan,казахстан
Uzbekistan|uzbekistan,узбекистан
Armenia|armenie,armenia,армения
United Kingdom|uk,u.k,great britain,england,scotland,wales,northern ireland,royaume-uni,royaume uni,reino unido,regno unito,grossbritannien,vereinigtes konigreich,великобритания
Ireland|irlande,irlanda,irland,republic of ireland
France|francia,frankreich,франция,франции
Germany|allemagne,alemania,germania,deutschland,германия
Italy|italie,italia,italien,италия
Spain|espagne,espana,spagna,spanien,испания
Portugal|portugal,португалия
Netherlands|pays-bas,pays bas,holland,paises bajos,olanda,niederlande,нидерланды
Belgium|belgique,belgica,belgio,belgien
Switzerland|suisse,suiza,svizzera,schweiz
Austria|autriche,osterreich,oesterreich
Poland|pologne,polonia,polen,польша
Romania|roumanie,rumania,romania,rumanien
Bulgaria|bulgarie,bulgaria,bulgarien
Greece|grece,grecia,griechenland
Cyprus|chypre,chipre,cipro,zypern
Malta|malte
Sweden|suede,suecia,svezia,schweden
Norway|norvege,noruega,norvegia,norwegen
Denmark|danemark,dinamarca,danimarca,danemark
Finland|finlande,finlandia,finnland
Czech Republic|czechia,tchequie,republica checa,tschechien
Hungary|hongrie,hungria,ungheria,ungarn
Serbia|serbie,serbia,serbien
Bosnia and Herzegovina|bosnia,bosnie
United States|usa,u.s.a,u.s,united states of america,etats-unis,etats unis,estados unidos,stati uniti,vereinigte staaten,сша
Canada|kanada,канада
Brazil|brasil,bresil,brasile,brasilien,бразилия
Mexico|mexique,mexiko,messico,mejico
Colombia|colombie,kolumbien
Argentina|argentine,argentinien
Peru|perou,perù
Chile|chili
Venezuela|venezuela
Trinidad and Tobago|trinidad
Barbados|barbade
Jamaica|jamaique,jamaika
Nigeria|nigeria,nigéria
Ghana|ghana
Kenya|kenya
Uganda|ouganda,uganda
Tanzania|tanzanie,tanzania
Ethiopia|ethiopie,etiopia,athiopien
Rwanda|ruanda
Cameroon|cameroun,camerun,kamerun
South Africa|afrique du sud,sudafrica,sudafrika,suedafrika
Botswana|botswana
Zimbabwe|zimbabwe
Zambia|zambie,zambia
Malawi|malawi
Namibia|namibie,namibia
Senegal|senegal
Ivory Coast|cote d'ivoire,cote d ivoire,costa de marfil,elfenbeinkuste
Mali|mali!
Gabon|gabon
Congo|rdc,drc,congo-kinshasa,congo-brazzaville
Sierra Leone|sierra leone
Liberia|liberia
Madagascar|madagascar
Mauritius|maurice,ile maurice,mauricio
Comoros|comores
Philippines|filipinas,filippine,philippinen,pilipinas,philippine
Indonesia|indonesie,indonesien,индонезия
India|inde,indien,индия,भारत
Pakistan|pakistán,pakistan,paquistao,paquistan
Bangladesh|bengladesh
Sri Lanka|srilanka
Nepal|nepal
Maldives|maldives,maldivas
Malaysia|malaisie,malasia,malaysien
Thailand|thailande,tailandia,thailand
Vietnam|viet nam
Myanmar|birmanie,burma
China|chine,cina,китай
Japan|japon,giappone,japon
Korea, Republic of|south korea,korea,coree du sud,corea del sur
Singapore|singapour,singapur
Australia|australie,australien
New Zealand|nouvelle-zelande,nueva zelanda
`;

const EMIRATES = `
Dubai|dubai,dubayy,دبي,дубай
Abu Dhabi|abu dhabi,abudhabi,abu-dhabi,abou dabi,abu dabi,abudabi,ابوظبي,ابو ظبي,абу-даби
Sharjah|sharjah,sharjha,الشارقه,шарджа
Ajman|ajman,عجمان
Ras Al Khaimah|ras al khaimah,ras al-khaimah,ras alkhaimah,راس الخيمه
Umm Al Quwain|umm al quwain,umm al-quwain,ام القيوين
Fujairah|fujairah,fujeirah,الفجيره
Al Ain|al ain,al-ain,العين
`;

const AREAS = `
Dubai|dubai marina,deira,bur dubai,jumeirah,jlt,jumeirah lake towers,business bay,al barsha,barsha,al karama,karama,mirdif,international city,silicon oasis,sports city,al quoz,motor city,jvc,jumeirah village,satwa,al qusais,discovery gardens,damac hills,arabian ranches,jebel ali,dubai hills,tecom,al furjan,al warqa,muhaisnah,oud metha,downtown dubai,al rigga,al twar
Abu Dhabi|mussafah,musaffah,khalifa city,saadiyat,yas island,al reem,reem island,al raha,mohammed bin zayed city,mbz city,al mushrif,hamdan street,electra street,shakhbout city,al wahda,al zahiyah,al bateen
Sharjah|al majaz,al khan,muwaileh,al taawun,university city
`;

const CITIES: Record<string, string> = {
  "Morocco": "casablanca,rabat,marrakech,marrakesh,tangier,tanger,agadir,fes,meknes,kenitra,tetouan,oujda",
  "Algeria": "alger,algiers,oran,constantine,annaba,setif,batna,blida,tlemcen,sidi bel abbes,sidi bel abbès,tizi ouzou,bejaia,mostaganem,biskra,skikda,mascara",
  "Tunisia": "tunis,sfax,sousse,bizerte,nabeul,monastir,kairouan,gabes",
  "Egypt": "cairo,le caire,alexandria,alexandrie,giza,hurghada,sharm el sheikh,mansoura,tanta,port said,القاهره,الاسكندريه",
  "Jordan": "amman",
  "Lebanon": "beirut,beyrouth,بيروت",
  "Syria Arab Republic": "damascus,damas,aleppo,homs,latakia,دمشق,حلب",
  "Iraq": "baghdad,erbil,basra,mosul,بغداد",
  "Iran": "tehran,shiraz,isfahan,mashhad,tabriz",
  "Türkiye": "istanbul,ankara,izmir,antalya,bursa",
  "India": "mumbai,delhi,new delhi,bangalore,bengaluru,hyderabad,chennai,kolkata,pune,kerala,kochi,cochin,ahmedabad,jaipur,chandigarh,lucknow,thiruvananthapuram,kozhikode,calicut,mangalore",
  "Pakistan": "karachi,lahore,islamabad,rawalpindi,peshawar,faisalabad,multan,quetta",
  "Bangladesh": "dhaka,chittagong",
  "Sri Lanka": "colombo,kandy",
  "Nepal": "kathmandu,pokhara",
  "Philippines": "manila,quezon city,cebu,davao,makati,pasig,cavite,laguna,caloocan,taguig,mandaluyong,pampanga,bulacan,iloilo",
  "Indonesia": "jakarta,surabaya,bandung",
  "Nigeria": "lagos,abuja,port harcourt,ibadan,kano,benin city,enugu,kaduna",
  "Ghana": "accra,kumasi",
  "Kenya": "nairobi,mombasa,kisumu,nakuru",
  "Uganda": "kampala,entebbe",
  "Ethiopia": "addis ababa,addis abeba",
  "Rwanda": "kigali",
  "Cameroon": "douala,yaounde",
  "South Africa": "johannesburg,cape town,durban,pretoria",
  "Russian Federation": "moscow,moscou,saint petersburg,st petersburg,saint-petersbourg,москва,санкт-петербург",
  "France": "paris,lyon,marseille,toulouse,bordeaux,lille,strasbourg",
  "United Kingdom": "london,manchester,birmingham,liverpool,leeds,glasgow,edinburgh,bristol",
  "Italy": "roma,milan,milano,napoli,torino",
  "Spain": "madrid,barcelona,valencia,sevilla",
  "Germany": "berlin,munich,munchen,hamburg,frankfurt",
  "United States": "new york,los angeles,miami,chicago,houston",
  "Saudi Arabia": "riyadh,jeddah,dammam,mecca,medina,al khobar,الرياض,جدة",
  "Qatar": "doha,الدوحه",
  "Kuwait": "kuwait city",
  "Bahrain": "manama",
  "Oman": "muscat,salalah",
  "Ukraine": "kyiv,kiev,kharkiv,odesa",
  "Kazakhstan": "almaty,astana,nur-sultan",
  "Uzbekistan": "tashkent",
};

type Entry = { alias: string; place: Place };
const ENTRIES: Entry[] = [];
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function add(alias: string, place: Place) {
  let a = fold(alias.trim());
  if (!a) return;
  if (a.endsWith("!")) { a = a.slice(0, -1); place = { ...place, weak: true }; }
  ENTRIES.push({ alias: a, place });
}
for (const line of COUNTRIES.split("\n")) {
  const t = line.trim(); if (!t) continue;
  const [name, rest] = t.split("|");
  const aliases = (rest || "").split(",");
  // a canonical name that is also a first name (Jordan, Mali) is listed with "!" among the aliases and stays weak. Georgia is left out: in a CV it is almost always the US state
  if (!aliases.includes(fold(name) + "!")) add(name, { kind: "country", country: name });
  for (const a of aliases) add(a, { kind: "country", country: name });
}
for (const line of EMIRATES.split("\n")) {
  const t = line.trim(); if (!t) continue;
  const [name, rest] = t.split("|");
  for (const a of (rest || "").split(",")) add(a, { kind: "emirate", country: UAE, emirate: name });
}
for (const line of AREAS.split("\n")) {
  const t = line.trim(); if (!t) continue;
  const [name, rest] = t.split("|");
  for (const a of (rest || "").split(",")) add(a, { kind: "city", country: UAE, emirate: name });
}
for (const country of Object.keys(CITIES)) for (const a of CITIES[country].split(",")) add(a, { kind: "city", country });

const BY_ALIAS = new Map<string, Place>();
for (const e of ENTRIES) if (!BY_ALIAS.has(e.alias)) BY_ALIAS.set(e.alias, e.place);
const ALT = [...BY_ALIAS.keys()].sort((a, b) => b.length - a.length).map((a) => esc(a).replace(/ /g, "[\\s-]+")).join("|");
const PLACE_RE = new RegExp(NB + "(" + ALT + ")" + NA, "giu");

const LABEL = "(?:address|adresse|adresa|domicile|location|lieu de residence|residence|resident|based in|based at|current location|currently in|living in|city|ville|pays|country|direccion|domicilio|ciudad|pais|indirizzo|residenza|citta|paese|anschrift|wohnort|wohnhaft|stadt|land|endereco|morada|cidade|адрес|проживание|город|страна|العنوان|عنوان|مكان الاقامه|الاقامه|المدينه|الدوله|بلد)";
const LABEL_INLINE = new RegExp(NB + LABEL + "\\s*[:\\-–|]", "iu");
const LABEL_ONLY = new RegExp("^" + LABEL + "$", "iu");
const SKIP_LINE = /place of birth|birth ?place|born|lieu de naissance|date de naissance|naissance|\bnee? le\b|\bnee? a\b|nationalit|nacionalidad|nacimiento|nascita|nazionalita|geburt|staatsangeh|passport|passeport|pasaporte|\bvisa\b|جنسي|ميلاد|рожден|гражданств|паспорт/iu;

function placeIn(text: string, trusted: boolean): Place | null {
  PLACE_RE.lastIndex = 0;
  const hits: { at: number; p: Place }[] = [];
  let m: RegExpExecArray | null;
  while ((m = PLACE_RE.exec(text)) !== null) {
    const p = BY_ALIAS.get(fold(m[1]).replace(/[\s-]+/g, " ")) || BY_ALIAS.get(fold(m[1]));
    if (!p) continue;
    if (p.weak && !trusted && !/,\s*$/.test(text.slice(Math.max(0, m.index - 3), m.index))) continue;
    hits.push({ at: m.index, p });
  }
  if (!hits.length) return null;
  const top = hits.find((h) => h.p.kind !== "city") || hits[0];
  if (top.p.kind === "city" && top.p.country === UAE) return top.p;
  if (top.p.country === UAE && top.p.kind !== "emirate") {
    // "Dubai, UAE" -> keep the emirate; plain "UAE" -> no emirate
    const em = hits.find((h) => h.p.emirate);
    return em ? { kind: "emirate", country: UAE, emirate: em.p.emirate } : top.p;
  }
  return top.p;
}

function locationOf(rawLines: string[]): { country: string; emirate: string } {
  const lines = rawLines.filter((l) => !SKIP_LINE.test(l));
  // 1) address lines (the line with the label and the two after it)
  const labelled: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (LABEL_INLINE.test(lines[i]) || LABEL_ONLY.test(lines[i])) labelled.push(lines.slice(i, i + 3).join(" , "));
  }
  let p: Place | null = labelled.length ? placeIn(labelled.join(" , "), true) : null;
  // 2) the header block
  const head = lines.slice(0, 10).join(" , ").slice(0, 450);
  if (!p) p = placeIn(head, false);
  if (p) return { country: p.country, emirate: p.emirate || "" };
  // 3) a UAE phone number in the header
  if (/(?:^|[^\d])(?:\+|00)\s*971[\s\d()-]{7,}/.test(rawLines.slice(0, 20).join(" "))) return { country: UAE, emirate: "" };
  return { country: "", emirate: "" };
}

export function factsFromText(raw: string): Facts {
  const lines = prep(raw);
  if (!lines.length) return { experience: "", country: "", emirate: "" };
  const loc = locationOf(lines);
  return { experience: experienceOf(lines), country: loc.country, emirate: loc.emirate };
}
