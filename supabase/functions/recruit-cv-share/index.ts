// ============================================================
// TARA ROSE SALONS — Recruitment: a CV for someone with no dashboard access
// supabase/functions/recruit-cv-share/index.ts
// ============================================================
//
// Kate, 19 Nov 2026: https://trk-salon-os.com/cv/?t=<token> posts the token here and gets the CV file back. The token comes from recruit_cv_share_make() (valid 7 days, counted on every
// open); recruit_cv_share_get() is service role only, so this function is the only way from a token to the private file. No JWT (the person opening the link has none).
//
// POST {"token": "<uuid>"}  ->  the file (content-type of the file, header x-cv-name = the download name, URL encoded)
//                           |   JSON {"ok": false, "reason": "unknown" | "expired"} with status 404 / 410
//
// Deploy: supabase functions deploy recruit-cv-share --no-verify-jwt --project-ref gvijxenafoowajqktqvd

import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOW = new Set(["https://trk-salon-os.com", "https://www.trk-salon-os.com"]);
const TYPE: Record<string, string> = {
  pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

function cors(req: Request) {
  const o = req.headers.get("origin") || "";
  return {
    "access-control-allow-origin": ALLOW.has(o) ? o : "https://trk-salon-os.com",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-expose-headers": "x-cv-name, content-type",
    "vary": "origin",
    "cache-control": "no-store",
    "x-robots-tag": "noindex",
  };
}
function out(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...cors(req) } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== "POST") return out(req, 405, { ok: false, reason: "POST only" });
  let token = "";
  try { token = String((await req.json()).token || ""); } catch { return out(req, 400, { ok: false, reason: "bad body" }); }
  if (!UUID.test(token)) return out(req, 404, { ok: false, reason: "unknown" });
  const r = await sb.rpc("recruit_cv_share_get", { p_token: token });
  if (r.error) return out(req, 500, { ok: false, reason: "error" });
  const d = r.data as { ok: boolean; reason?: string; cv_file?: string; cv_file_name?: string; name?: string };
  if (!d.ok) return out(req, d.reason === "expired" ? 410 : 404, { ok: false, reason: d.reason || "unknown" });
  const f = await sb.storage.from("recruit-cvs").download(String(d.cv_file));
  if (f.error || !f.data) return out(req, 404, { ok: false, reason: "unknown" });
  let ext = String(d.cv_file_name || d.cv_file).split(".").pop()!.toLowerCase();
  if (!TYPE[ext]) ext = "pdf";
  const nm = "CV - " + (String(d.name || "applicant").replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim().slice(0, 60) || "applicant") + "." + ext;
  return new Response(f.data, { status: 200, headers: { "content-type": TYPE[ext], "x-cv-name": encodeURIComponent(nm), ...cors(req) } });
});
