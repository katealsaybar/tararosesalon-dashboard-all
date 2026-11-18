// ============================================================
// TARA ROSE LADIES SALON — Orders and Receipts: keep the supplier's PDF and read it
// supabase/functions/orders-file-upload/index.ts
// ============================================================
//
// Kate, 18 Nov 2026: Carrefour's confirmation email lists item names only; the quantity and the price are in the attached Tax Invoice PDF. The mailbox script
// (docs/orders-receipts/sync-orders-mailbox.gs, installed in info@) sends each PDF of a supplier email here. The function keeps it in the private bucket order-files,
// sets mail_documents.file_path / file_name, reads the text out of the PDF into mail_documents.file_text, and where the supplier's layout is known (see parseDoc)
// fills the order lines, the amounts and the VAT from it. The page opens the file with a signed link (orders_can()).
//
// Auth: the same push pass the mailbox scripts already use (public.push_passes, active), sent as the header x-push-pass. No JWT (Apps Script has none).
//   POST  x-mode: check    body {"doc_keys": ["info:<gmail id>", ...]}  -> {"stored": [doc keys that already have their file]}
//   POST  x-mode: upload   x-doc-key, x-file-name (URL-encoded), body = the raw PDF bytes
//         -> {"ok": true, "path": "...", "read": true|false, "parsed": true|false} | {"ok": true, "exists": true} | an error with a status code
//   POST  x-mode: reparse  body {"doc_keys": [...]} or {"all": true}     -> reads the stored files again (after parseDoc has been improved)
// The row must exist first (the script pushes the rows through orders_import, then the files).
// Limits: 10 MB, pdf only (the type is taken from the file name).
//
// Deploy: supabase functions deploy orders-file-upload --no-verify-jwt --project-ref gvijxenafoowajqktqvd

import { createClient } from "npm:@supabase/supabase-js@2";
import { extractText, getDocumentProxy } from "npm:unpdf";
import { parseDoc } from "./parse.mjs";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const MAX = 10 * 1024 * 1024;
const KEY = /^[A-Za-z0-9:_.\-]{3,90}$/;
const UUID = /^[0-9a-f-]{36}$/i;
const BUCKET = "order-files";

function out(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
function safeName(n: string) {
  const base = n.normalize("NFKD").replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "-").replace(/^[.\-]+/, "").slice(0, 80);
  return base || "invoice.pdf";
}
function safeKey(k: string) { return k.replace(/[^A-Za-z0-9_.\-]+/g, "-").slice(0, 90); }

async function pdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  return String(text || "").replace(/\u0000/g, "").slice(0, 60000);
}

type Patch = { lines?: unknown[]; amount?: number | null; subtotal?: number | null; discount?: number | null; delivery?: number | null; vat?: number | null; _check?: unknown };

async function readAndStore(docKey: string, supplier: string, kind: string, bytes: Uint8Array) {
  let text: string | null = null, patch: Patch | null = null;
  try { text = await pdfText(bytes); } catch (e) { console.log("pdf text failed for " + docKey + ": " + (e as Error).message); }
  if (text) { try { patch = parseDoc(supplier, kind, text) as Patch | null; } catch (e) { console.log("parse failed for " + docKey + ": " + (e as Error).message); } }
  const upd: Record<string, unknown> = { file_text: text, updated_at: new Date().toISOString() };
  if (patch) {
    if (patch.lines && patch.lines.length) upd.lines = patch.lines;
    for (const k of ["amount", "subtotal", "discount", "delivery", "vat"] as const) if (patch[k] != null) upd[k] = patch[k];
  }
  return { upd, read: !!text, parsed: !!patch, check: patch ? patch._check : null };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return out(405, { error: "POST only" });
  const pass = req.headers.get("x-push-pass") || "";
  if (!UUID.test(pass)) return out(401, { error: "bad pass" });
  const ok = await sb.from("push_passes").select("token").eq("token", pass).eq("active", true).maybeSingle();
  if (ok.error || !ok.data) return out(401, { error: "bad pass" });

  const mode = req.headers.get("x-mode") || "upload";

  if (mode === "check") {
    let keys: string[] = [];
    try { keys = ((await req.json()).doc_keys || []).map(String).filter((x: string) => KEY.test(x)).slice(0, 500); } catch { return out(400, { error: "bad body" }); }
    if (!keys.length) return out(200, { stored: [] });
    const r = await sb.from("mail_documents").select("doc_key").in("doc_key", keys).not("file_path", "is", null);
    if (r.error) return out(500, { error: r.error.message });
    return out(200, { stored: (r.data || []).map((x: { doc_key: string }) => x.doc_key) });
  }

  if (mode === "reparse") {
    let body: { doc_keys?: string[]; all?: boolean } = {};
    try { body = await req.json(); } catch { return out(400, { error: "bad body" }); }
    let q = sb.from("mail_documents").select("doc_key, supplier, kind, file_path").not("file_path", "is", null).limit(60);
    if (!body.all) {
      const keys = (body.doc_keys || []).map(String).filter((x) => KEY.test(x)).slice(0, 60);
      if (!keys.length) return out(400, { error: "doc_keys or all" });
      q = q.in("doc_key", keys);
    }
    const rows = await q;
    if (rows.error) return out(500, { error: rows.error.message });
    const res: Record<string, unknown>[] = [];
    for (const r of rows.data || []) {
      const dl = await sb.storage.from(BUCKET).download(r.file_path);
      if (dl.error || !dl.data) { res.push({ doc_key: r.doc_key, error: dl.error?.message || "no file" }); continue; }
      const { upd, read, parsed, check } = await readAndStore(r.doc_key, r.supplier, r.kind, new Uint8Array(await dl.data.arrayBuffer()));
      const u = await sb.from("mail_documents").update(upd).eq("doc_key", r.doc_key);
      res.push({ doc_key: r.doc_key, supplier: r.supplier, read, parsed, check, error: u.error?.message });
    }
    return out(200, { ok: true, done: res.length, res });
  }

  if (mode !== "upload") return out(400, { error: "unknown mode" });
  const docKey = req.headers.get("x-doc-key") || "";
  if (!KEY.test(docKey)) return out(400, { error: "bad doc key" });
  let name = "";
  try { name = decodeURIComponent(req.headers.get("x-file-name") || ""); } catch { return out(400, { error: "bad file name" }); }
  if ((name.split(".").pop() || "").toLowerCase() !== "pdf") return out(415, { error: "only pdf files are kept" });
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (!bytes.length) return out(400, { error: "empty file" });
  if (bytes.length > MAX) return out(413, { error: "file is over 10 MB" });

  const p = await sb.from("mail_documents").select("doc_key, supplier, kind, file_path").eq("doc_key", docKey).maybeSingle();
  if (p.error) return out(500, { error: p.error.message });
  if (!p.data) return out(404, { error: "no row has that doc key yet: push the row first" });
  if (p.data.file_path) return out(200, { ok: true, exists: true });

  const path = `${safeKey(docKey)}/${Date.now()}-${safeName(name)}`;
  const up = await sb.storage.from(BUCKET).upload(path, bytes, { contentType: "application/pdf", upsert: false });
  if (up.error) return out(500, { error: up.error.message });
  const { upd, read, parsed } = await readAndStore(docKey, p.data.supplier, p.data.kind, bytes);
  const r = await sb.from("mail_documents").update({ ...upd, file_path: path, file_name: name.slice(0, 160), has_file: true }).eq("doc_key", docKey);
  if (r.error) { await sb.storage.from(BUCKET).remove([path]); return out(500, { error: r.error.message }); }
  return out(200, { ok: true, path, read, parsed });
});
