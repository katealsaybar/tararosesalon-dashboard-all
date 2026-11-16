// ============================================================
// TARA ROSE LADIES SALON — Recruitment CV upload
// supabase/functions/recruit-cv-upload/index.ts
// ============================================================
//
// Kate, 11 Nov 2026: a direct email to info@ or recruitment@ carries its CV as an attached file, and Coach Emma has no access to those mailboxes, so the
// mailbox script (apps-script/sync-recruitment-mailbox.gs) sends the attachment here. The function keeps it in the private bucket recruit-cvs and sets
// recruit_applicants.cv_file / cv_file_name / cv_file_msg, so Kate and Coach Emma can open it from the Recruitment page (signed link, recruit_can()).
//
// Auth: the same push pass the mailbox scripts already use (public.push_passes, active), sent as the header x-push-pass. No JWT (Apps Script has none).
// Two calls:
//   POST  x-mode: check   body {"msg_ids": ["..."]}                       -> {"stored": [msg ids that already have their file]}
//   POST  x-mode: upload  x-msg-id, x-file-name (URL-encoded), body = the raw file bytes
//         -> {"ok": true, "path": "..."} | {"ok": true, "exists": true} | an error with a status code
// The person is found by the Gmail message id (recruit_applicants.msg_ids), so the script must have pushed the application first (recruit_import).
// Limits: 10 MB (raised from 5 on 11 Nov 2026), pdf / doc / docx / jpeg / png / webp only (the type is taken from the file name, not from what the sender claimed).
//
// Kate, 16 Nov 2026: the CV text is read too. After a file is stored (upload) the function pulls the text out of the PDF / DOCX (images and scanned PDFs have none),
// finds the years of experience and the country / emirate in any common language (cvfacts.ts) and writes them with recruit_cv_apply(), which fills ONLY blank
// experience / country / emirate (a form answer or a typed value is never touched). Migration: migrations/recruit_cv_facts.sql. A failure here never fails the upload.
//   POST  x-mode: read   body {"ids": ["<applicant uuid>", ...up to 4], "dry": true?}  -> {"results": [{id, note, filled, found}]}   (the backfill; dry = report only, writes nothing)
//   POST  x-mode: text   body {"text": "..."}  -> {"found": {...}}   (tries the reader on pasted text, touches nothing)
//
// Deploy: supabase functions deploy recruit-cv-upload --no-verify-jwt --project-ref gvijxenafoowajqktqvd

import { createClient } from "npm:@supabase/supabase-js@2";
import { extractText, getDocumentProxy } from "npm:unpdf@0.12.1";
import { strFromU8, unzipSync } from "npm:fflate@0.8.2";
import { factsFromText, type Facts } from "./cvfacts.ts";

// deno-lint-ignore no-explicit-any
declare const EdgeRuntime: any;

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const MAX = 10 * 1024 * 1024;
const TYPES: Record<string, string> = {
  pdf: "application/pdf", doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
};
const HEX = /^[0-9a-f]{10,32}$/i;
const UUID = /^[0-9a-f-]{36}$/i;

function out(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
function safeName(n: string) {
  const base = n.normalize("NFKD").replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "-").replace(/^[.\-]+/, "").slice(0, 80);
  return base || "cv";
}


// ---------- reading the CV text ----------
async function pdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  if (pdf.numPages > 12) return "";
  const r = await extractText(pdf, { mergePages: true });
  return String(r.text || "");
}
function docxText(bytes: Uint8Array): string {
  const files = unzipSync(bytes, { filter: (f) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(f.name) });
  const parts: string[] = [];
  const names = Object.keys(files).sort((a, b) => (/header/.test(b) ? 1 : 0) - (/header/.test(a) ? 1 : 0));   // headers first: the address is often there
  for (const n of names) {
    const xml = strFromU8(files[n]);
    parts.push(xml.replace(/<\/w:p>/g, "\n").replace(/<w:br[^>]*\/>/g, "\n").replace(/<w:tab[^>]*\/>/g, " ").replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(Number(d))));
  }
  return parts.join("\n");
}
async function cvText(bytes: Uint8Array, name: string): Promise<{ text: string; why: string }> {
  const ext = (name.split(".").pop() || "").toLowerCase();
  try {
    if (ext === "pdf") { const t = await pdfText(bytes); return { text: t, why: t.trim().length < 40 ? "no text in the pdf (scanned?)" : "" }; }
    if (ext === "docx") { const t = docxText(bytes); return { text: t, why: t.trim().length < 40 ? "no text in the docx" : "" }; }
    if (ext === "doc") return { text: "", why: "old .doc not read" };
    return { text: "", why: "image, not read" };
  } catch (e) {
    return { text: "", why: "could not open: " + String((e as Error).message || e).slice(0, 50) };
  }
}

// Reads the stored file of one person and, unless dry, fills the blanks. Returns what it found.
async function readOne(id: string, dry: boolean) {
  const p = await sb.from("recruit_applicants").select("id, cv_file, cv_file_name").eq("id", id).maybeSingle();
  if (p.error || !p.data || !p.data.cv_file) return { id, note: "no file", filled: [] as string[], found: null as Facts | null };
  const dl = await sb.storage.from("recruit-cvs").download(p.data.cv_file);
  if (dl.error || !dl.data) return { id, note: "file missing", filled: [] as string[], found: null as Facts | null };
  const bytes = new Uint8Array(await dl.data.arrayBuffer());
  const { text, why } = await cvText(bytes, p.data.cv_file_name || p.data.cv_file);
  const found = text ? factsFromText(text) : ({ experience: "", country: "", emirate: "" } as Facts);
  const note = why || (found.experience || found.country ? "" : "nothing found in the text");
  if (dry) return { id, note, filled: [] as string[], found, chars: text.length };
  const r = await sb.rpc("recruit_cv_apply", {
    p_id: id, p_file: p.data.cv_file, p_experience: found.experience || null, p_country: found.country || null, p_emirate: found.emirate || null, p_note: note || null,
  });
  const filled = (r.data && (r.data as { filled?: string[] }).filled) || [];
  return { id, note: r.error ? "apply failed: " + r.error.message.slice(0, 60) : note, filled, found };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return out(405, { error: "POST only" });
  const pass = req.headers.get("x-push-pass") || "";
  if (!UUID.test(pass)) return out(401, { error: "bad pass" });
  const ok = await sb.from("push_passes").select("token").eq("token", pass).eq("active", true).maybeSingle();
  if (ok.error || !ok.data) return out(401, { error: "bad pass" });

  const mode = req.headers.get("x-mode") || "upload";

  if (mode === "check") {
    let ids: string[] = [];
    try { ids = ((await req.json()).msg_ids || []).map(String).filter((x: string) => HEX.test(x)).slice(0, 500); } catch { return out(400, { error: "bad body" }); }
    if (!ids.length) return out(200, { stored: [] });
    const r = await sb.from("recruit_applicants").select("cv_file_msg").in("cv_file_msg", ids);
    if (r.error) return out(500, { error: r.error.message });
    return out(200, { stored: (r.data || []).map((x: { cv_file_msg: string }) => x.cv_file_msg) });
  }

  if (mode === "text") {
    let t = "";
    try { t = String((await req.json()).text || ""); } catch { return out(400, { error: "bad body" }); }
    return out(200, { found: factsFromText(t.slice(0, 60000)) });
  }

  if (mode === "read") {
    let ids: string[] = []; let dry = false;
    try { const b = await req.json(); ids = (b.ids || []).map(String).filter((x: string) => UUID.test(x)).slice(0, 4); dry = b.dry === true; } catch { return out(400, { error: "bad body" }); }
    const results = [];
    for (const id of ids) results.push(await readOne(id, dry));
    return out(200, { dry, results });
  }

  if (mode !== "upload") return out(400, { error: "unknown mode" });
  const msgId = req.headers.get("x-msg-id") || "";
  if (!HEX.test(msgId)) return out(400, { error: "bad message id" });
  let name = "";
  try { name = decodeURIComponent(req.headers.get("x-file-name") || ""); } catch { return out(400, { error: "bad file name" }); }
  const ext = (name.split(".").pop() || "").toLowerCase();
  const type = TYPES[ext];
  if (!type) return out(415, { error: "that file type is not accepted: " + ext });
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (!bytes.length) return out(400, { error: "empty file" });
  if (bytes.length > MAX) return out(413, { error: "file is over 10 MB" });

  const p = await sb.from("recruit_applicants").select("id, cv_file, cv_file_msg").contains("msg_ids", [msgId]).limit(1).maybeSingle();
  if (p.error) return out(500, { error: p.error.message });
  if (!p.data) return out(404, { error: "no applicant has that message yet: push the application first" });
  if (p.data.cv_file_msg === msgId && p.data.cv_file) return out(200, { ok: true, exists: true });

  const path = `${p.data.id}/${Date.now()}-${safeName(name)}`;
  const up = await sb.storage.from("recruit-cvs").upload(path, bytes, { contentType: type, upsert: false });
  if (up.error) return out(500, { error: up.error.message });
  const upd = await sb.from("recruit_applicants").update({ cv_file: path, cv_file_name: name.slice(0, 160), cv_file_msg: msgId, updated_at: new Date().toISOString() }).eq("id", p.data.id);
  if (upd.error) { await sb.storage.from("recruit-cvs").remove([path]); return out(500, { error: upd.error.message }); }
  if (p.data.cv_file && p.data.cv_file !== path) await sb.storage.from("recruit-cvs").remove([p.data.cv_file]);
  // read the text for experience and country; after the reply goes out, and never a reason to fail the upload
  const job = readOne(p.data.id, false).catch(() => null);
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) EdgeRuntime.waitUntil(job); else await job;
  return out(200, { ok: true, path });
});
