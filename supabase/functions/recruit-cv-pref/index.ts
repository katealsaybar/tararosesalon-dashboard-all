// recruit-cv-pref (Kate, 17 Nov 2026: "preferred loc: checking cv's if ano preferences nila").
// Reads the stored CV files (PDF and Word, the recruit-cvs bucket) and writes the emirate a person says they want to work in (Dubai, Abu Dhabi, Either) through recruit_apply_pref.
// Only what the CV SAYS about wanting or being willing to work somewhere counts: a "Preferred location: ..." line, or a sentence with words like looking for, seeking, willing to,
// relocate, open to, interested in. An address or "Location: Dubai" is where they live, not a wish, so it is ignored. A value set by hand is never replaced.
// Same pass check as recruit-cv-upload (x-push-pass, table push_passes). POST { ids: [uuid, ...up to 4], dry?: true }. dry = read and report, write nothing.
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

async function readOne(id: string, dry: boolean) {
  const p = await sb.from("recruit_applicants").select("id, cv_file, cv_file_name, pref_src").eq("id", id).maybeSingle();
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
  if (!f.loc) return { id, status: "read, nothing stated" };
  if (dry) return { id, status: "found (dry)", loc: f.loc, via: f.via, snip: f.snip };
  const r = await sb.rpc("recruit_apply_pref", { p_id: id, p_loc: f.loc, p_src: "CV" });
  return { id, status: r.error ? "apply failed: " + r.error.message.slice(0, 60) : r.data ? "written" : "left alone", loc: f.loc, via: f.via, snip: f.snip };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return out(405, { error: "POST only" });
  const pass = req.headers.get("x-push-pass") || "";
  if (!UUID.test(pass)) return out(401, { error: "bad pass" });
  const ok = await sb.from("push_passes").select("token").eq("token", pass).eq("active", true).maybeSingle();
  if (ok.error || !ok.data) return out(401, { error: "bad pass" });
  let ids: string[] = []; let dry = false;
  try { const b = await req.json(); ids = (b.ids || []).map(String).filter((x: string) => UUID.test(x)).slice(0, 4); dry = b.dry === true; } catch { return out(400, { error: "bad body" }); }
  const results = [];
  for (const id of ids) results.push(await readOne(id, dry));
  return out(200, { dry, results });
});
