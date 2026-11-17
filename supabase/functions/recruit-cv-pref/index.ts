// recruit-cv-pref (Kate, 17 Nov 2026: "preferred loc: checking cv's if ano preferences nila").
// Reads the stored CV files (PDF and Word, the recruit-cvs bucket) and writes the emirate a person says they want to work in (Dubai, Abu Dhabi, Either) through recruit_apply_pref.
// Only what the CV SAYS about wanting or being willing to work somewhere counts: a "Preferred location: ..." line, or a sentence with words like looking for, seeking, willing to,
// relocate, open to, interested in. An address or "Location: Dubai" is where they live, not a wish, so it is ignored. A value set by hand is never replaced.
// Kate, 17 Nov 2026 ("keri mo bang mag parse ng ganito? kasi kita naman sa resume kung saan sila nakatira"): when the CV states no wish, the address at the top of the CV is used, but ONLY to fill a blank:
// an address in Dubai gives Dubai, in Abu Dhabi gives Abu Dhabi, in another emirate (Sharjah, Ajman, Ras Al Khaimah, Fujairah, Umm Al Quwain) or outside the UAE gives Either (Kate: "either").
// Source "CV address". Never replaces a value that is already there (a wish, Based in, or by hand). Nationality, visa, passport and birth lines are skipped.
// Same pass check as recruit-cv-upload (x-push-pass, table push_passes). POST { ids: [uuid, ...up to 4], dry?: true }. dry = read and report, write nothing.
// Kate, 17 Nov 2026 ("Yes, automate"): the cron (every 10 minutes, header x-cron-secret = internal_secrets recruit_cv_pref_cron) posts { auto: true } and the function picks the next up to 4 people
// whose stored CV has not been read yet (pref_cv_read is not the current cv_file; a new CV attached later is read again). Nobody set by hand is picked.
import { createClient } from "npm:@supabase/supabase-js@2";
import { extractText, getDocumentProxy } from "npm:unpdf@0.12.1";
import { strFromU8, unzipSync } from "npm:fflate@0.8.2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const UUID = /^[0-9a-f-]{36}$/i;

function out(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function pdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  if (pdf.numPages > 12) return "";
  const r = await extractText(pdf, { mergePages: true });
  return String(r.text || "");
}
function docxText(bytes: Uint8Array): string {
  const files = unzipSync(bytes, { filter: (f) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(f.name) });
  const parts: string[] = [];
  for (const n of Object.keys(files)) {
    parts.push(strFromU8(files[n]).replace(/<\/w:p>/g, "\n").replace(/<w:br[^>]*\/>/g, "\n").replace(/<w:tab[^>]*\/>/g, " ").replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'"));
  }
  return parts.join("\n");
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const AD = "(?:abu[\\s-]*dhabi|abudhabi|abu[\\s-]*dabi|ابوظبي|ابو ظبي)";
const DX = "(?:dubai|dubayy|دبي)";
const ANY = "(?:any|anywhere|all emirates|uae|u\\.a\\.e|united arab emirates|flexible|open)";
const hasAD = (s: string) => new RegExp(AD, "i").test(s);
const hasDX = (s: string) => new RegExp(DX, "i").test(s);
const verdict = (s: string): "Dubai" | "Abu Dhabi" | "Either" | null => {
  const a = hasAD(s), d = hasDX(s);
  if (a && d) return "Either";
  if (a) return "Abu Dhabi";
  if (d) return "Dubai";
  return null;
};

// "Preferred location: Dubai", "Location preference - Abu Dhabi / Dubai", "Willing to relocate: Yes (Dubai)"
const LABEL = new RegExp(
  "(?:preferred|preferable|desired|desirable|expected|choice of|job|work|relocation)\\s*(?:work\\s*)?(?:location|city|emirate|place|area|branch)s?\\s*[:\\-–=]\\s*(.{0,90})" +
    "|location\\s*preferences?\\s*[:\\-–=]\\s*(.{0,90})" +
    "|(?:willing|ready|open)\\s*to\\s*relocate\\s*(?:to)?\\s*[:\\-–=]\\s*(.{0,90})", "i");
// a sentence that states a wish; only the part from the wish onwards is looked at (so "based in Abu Dhabi and looking for work in Dubai" reads Dubai)
const WISH = new RegExp(
  "(?:prefer(?:red|s)?|looking (?:for|to)|seeking|interested in|keen to|eager to|willing to|open to|ready to|available to|would like to|wish to|hope to|relocat\\w*|move to|opportunit\\w+ in|position in|job in|role in|work in)[^.!?\\n]{0,90}", "i");

export function preferenceOf(raw: string): { loc: "Dubai" | "Abu Dhabi" | "Either" | null; via: string; snip: string } {
  const text = fold(raw.replace(/[‘’`´]/g, "'")).replace(/[ \t ]+/g, " ");
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  // 1. a labelled line wins
  for (let i = 0; i < lines.length; i++) {
    const m = LABEL.exec(lines[i] + " " + (lines[i + 1] || "").slice(0, 40));
    if (!m) continue;
    const val = (m[1] || m[2] || m[3] || "").trim();
    const v = verdict(val);
    if (v) return { loc: v, via: "label", snip: val.slice(0, 80) };
    if (new RegExp("^" + ANY, "i").test(val) && /preferred|desired|expected|preference/.test(lines[i])) return { loc: "Either", via: "label", snip: val.slice(0, 80) };
  }
  // 2. sentences that state a wish
  let ad = false, dx = false, snip = "";
  for (const sentence of text.split(/(?<=[.!?])\s+|\n+/)) {
    const m = WISH.exec(sentence);
    if (!m) continue;
    const part = m[0];
    // past work is not a wish
    if (/\b(worked|working|experience|employed|served)\b/.test(sentence.slice(0, m.index + 6)) && !/prefer|looking|seeking|willing|relocat|interested/.test(part)) continue;
    const a = hasAD(part), d = hasDX(part);
    if (!a && !d) continue;
    if (a) ad = true;
    if (d) dx = true;
    if (!snip) snip = part.slice(0, 90);
  }
  if (ad && dx) return { loc: "Either", via: "sentence", snip };
  if (ad) return { loc: "Abu Dhabi", via: "sentence", snip };
  if (dx) return { loc: "Dubai", via: "sentence", snip };
  return { loc: null, via: "", snip: "" };
}

// ---- address fallback (Kate, 17 Nov 2026) ----
const AD_PLACE = /(?:abu[\s-]*dhabi|abudhabi|abu[\s-]*dabi|mus+afah|khalifa\s*city|\bal\s*ain\b|mohammed\s*bin\s*zayed|mbz\s*city|baniyas|shakhbout|al\s*reem|yas\s*island|saadiyat|ابوظبي|ابو ظبي)/i;
const DX_PLACE = /(?:dubai|dubayy|\bdeira\b|bur\s*dubai|\bkarama\b|\bsatwa\b|jumeirah|\bjlt\b|al\s*barsha|al\s*quoz|mirdif|silicon\s*oasis|discovery\s*gardens|international\s*city|jebel\s*ali|business\s*bay|hor\s*al\s*anz|al\s*qusais|al\s*rashidiya|دبي)/i;
const OTHER_PLACE = /\b(?:sharjah|ajman|ras\s*al\s*khaimah|rak|fujairah|fujeirah|umm\s*al\s*quwain|uaq|philippines|india|pakistan|nepal|bangladesh|sri\s*lanka|indonesia|egypt|kenya|uganda|nigeria|ghana|ethiopia|morocco|tunisia|algeria|lebanon|jordan|syria|iraq|iran|yemen|sudan|russia|ukraine|uzbekistan|kazakhstan|kyrgyz\w*|turkey|south\s*africa|zimbabwe|zambia|malawi|tanzania|rwanda|cameroon|ivory\s*coast|mauritius|madagascar|saudi|ksa|kuwait|oman|bahrain|qatar|united\s*kingdom|uk|usa|united\s*states|canada|brazil|colombia|mexico|thailand|vietnam|malaysia|singapore|china|armenia|belarus|moldova)\b/i;
const SKIP_LINE = /nationalit|citizen|passport|\bvisa\b|\bborn\b|birth|\bdob\b|licen[cs]e|religion|marital|languag|father|mother|\bage\b/;
const WORK_LINE = /\b(?:worked|working|employed|experience|company|llc|ltd|hotel|restaurant|cafe|salon|spa|clinic|school|present|till date|to date)\b/;
const ADDR_LABEL = /^(?:current\s*|permanent\s*|home\s*|mailing\s*)?(?:address|location|residence|residing|resident|city|country|based in|place of residence|p\.?o\.? ?box)\b/;

export function addressOf(raw: string): { loc: "Dubai" | "Abu Dhabi" | "Either" | null; snip: string } {
  const text = fold(raw.replace(/[‘’`´]/g, "'")).replace(/[ \t\u00a0]+/g, " ");
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const take: string[] = [];
  lines.forEach((l, i) => { if (((i < 9 && !WORK_LINE.test(l)) || ADDR_LABEL.test(l)) && !SKIP_LINE.test(l) && l.length < 160) take.push(l); });
  // a CV that came out as one long line: only its first 500 characters
  const win = lines.length < 4 ? text.slice(0, 500) : take.join("\n");
  const a = AD_PLACE.exec(win), d = DX_PLACE.exec(win);
  if (a && d) return { loc: "Either", snip: a[0] + " + " + d[0] };
  if (a) return { loc: "Abu Dhabi", snip: a[0] };
  if (d) return { loc: "Dubai", snip: d[0] };
  const o = OTHER_PLACE.exec(win);
  if (o) return { loc: "Either", snip: o[0] };
  return { loc: null, snip: "" };
}

async function readOne(id: string, dry: boolean) {
  const p = await sb.from("recruit_applicants").select("id, cv_file, cv_file_name, pref_src, pref_loc").eq("id", id).maybeSingle();
  if (p.error || !p.data || !p.data.cv_file) return { id, status: "no file" };
  if (p.data.pref_src === "By hand") return { id, status: "set by hand, left alone" };
  const name = (p.data.cv_file_name || p.data.cv_file || "").toLowerCase();
  const ext = name.split(".").pop() || "";
  if (!["pdf", "docx"].includes(ext)) return { id, status: ext === "doc" ? "old .doc not read" : "image, not read" };
  const dl = await sb.storage.from("recruit-cvs").download(p.data.cv_file);
  if (dl.error || !dl.data) return { id, status: "file missing" };
  const bytes = new Uint8Array(await dl.data.arrayBuffer());
  let text = "";
  try { text = ext === "pdf" ? await pdfText(bytes) : docxText(bytes); } catch (e) { return { id, status: "could not open: " + String((e as Error).message || e).slice(0, 50) }; }
  if (text.trim().length < 40) return { id, status: "no text in the file (scanned?)" };
  const f = preferenceOf(text);
  if (!f.loc) {
    // no wish in the CV: the address at the top fills a blank, nothing else
    if (p.data.pref_loc) return { id, status: "read, nothing stated (already has a value)" };
    const ad = addressOf(text);
    if (!ad.loc) return { id, status: "read, nothing stated, no address found" };
    if (dry) return { id, status: "found address (dry)", loc: ad.loc, via: "address", snip: ad.snip };
    const r2 = await sb.rpc("recruit_apply_pref", { p_id: id, p_loc: ad.loc, p_src: "CV address" });
    return { id, status: r2.error ? "apply failed: " + r2.error.message.slice(0, 60) : r2.data ? "written" : "left alone", loc: ad.loc, via: "address", snip: ad.snip };
  }
  if (dry) return { id, status: "found (dry)", loc: f.loc, via: f.via, snip: f.snip };
  const r = await sb.rpc("recruit_apply_pref", { p_id: id, p_loc: f.loc, p_src: "CV" });
  return { id, status: r.error ? "apply failed: " + r.error.message.slice(0, 60) : r.data ? "written" : "left alone", loc: f.loc, via: f.via, snip: f.snip };
}

async function authed(req: Request): Promise<boolean> {
  const cron = req.headers.get("x-cron-secret") || "";
  if (cron) {
    const c = await sb.from("internal_secrets").select("value").eq("name", "recruit_cv_pref_cron").maybeSingle();
    return !c.error && !!c.data && c.data.value === cron;
  }
  const pass = req.headers.get("x-push-pass") || "";
  if (!UUID.test(pass)) return false;
  const ok = await sb.from("push_passes").select("token").eq("token", pass).eq("active", true).maybeSingle();
  return !ok.error && !!ok.data;
}

// the next people to read: a stored PDF or Word CV not read yet, with a blank or a guessed (Based in, CV address) preferred location, never one set by hand
async function nextUnread(n: number): Promise<string[]> {
  const r = await sb.from("recruit_applicants").select("id, cv_file, cv_file_name, pref_cv_read, pref_loc, pref_src")
    .not("cv_file", "is", null).order("applied_at", { ascending: false }).limit(400);
  if (r.error || !r.data) return [];
  return r.data.filter((p) => {
    const nm = String(p.cv_file_name || p.cv_file || "").toLowerCase();
    return /\.(pdf|docx)$/.test(nm) && p.pref_cv_read !== p.cv_file && p.pref_src !== "By hand" && (!p.pref_loc || p.pref_src === "Based in" || p.pref_src === "CV address");
  }).slice(0, n).map((p) => p.id);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return out(405, { error: "POST only" });
  if (!(await authed(req))) return out(401, { error: "bad pass" });
  let ids: string[] = []; let dry = false; let auto = false;
  try { const b = await req.json(); ids = (b.ids || []).map(String).filter((x: string) => UUID.test(x)).slice(0, 4); dry = b.dry === true; auto = b.auto === true; } catch { return out(400, { error: "bad body" }); }
  if (auto) ids = await nextUnread(4);
  const results = [];
  for (const id of ids) {
    const res = await readOne(id, dry);
    results.push(res);
    // remember which CV was read, so the next run moves on (a transient failure is tried again)
    if (auto && !dry && !/^(apply failed|file missing|could not open)/.test(res.status)) {
      const cf = await sb.from("recruit_applicants").select("cv_file").eq("id", id).maybeSingle();
      if (cf.data) await sb.from("recruit_applicants").update({ pref_cv_read: cf.data.cv_file }).eq("id", id);
    }
  }
  return out(200, { dry, auto, results });
});
