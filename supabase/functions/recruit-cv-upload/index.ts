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
// Limits: 5 MB, pdf / doc / docx / jpeg / png / webp only (the type is taken from the file name, not from what the sender claimed).
//
// Deploy: supabase functions deploy recruit-cv-upload --no-verify-jwt --project-ref gvijxenafoowajqktqvd

import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const MAX = 5 * 1024 * 1024;
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
  if (bytes.length > MAX) return out(413, { error: "file is over 5 MB" });

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
  return out(200, { ok: true, path });
});
