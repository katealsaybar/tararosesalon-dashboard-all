// ============================================================
// TARA ROSE SALONS — Recruitment: the applicant confirms their start date
// supabase/functions/recruit-accept/index.ts
// ============================================================
//
// Kate, 16 Nov 2026: the "Finalise start date" email carries a link to https://trk-salon-os.com/accept/?t=<token>. That page asks the applicant to press a button (so an
// email scanner that only opens the link changes nothing) and posts the token here. The function moves the person from "Finalise start date (pending)" to "(accepted)"
// through recruit_accept(), which only the service role can run. The token is the person's own unguessable accept_token; it names nobody and grants nothing else.
//
// POST  {"token": "<uuid>"}  ->  {"ok": true, "already": bool, "name": "First", "start_date": "2026-11-30"} | {"ok": false, "reason": "unknown" | "not_waiting"}
// Only the first name is returned. No JWT (the applicant has none).
//
// Deploy: supabase functions deploy recruit-accept --no-verify-jwt --project-ref gvijxenafoowajqktqvd

import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOW = new Set(["https://trk-salon-os.com", "https://www.trk-salon-os.com"]);

function cors(req: Request) {
  const o = req.headers.get("origin") || "";
  return {
    "access-control-allow-origin": ALLOW.has(o) ? o : "https://trk-salon-os.com",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "vary": "origin",
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
  if (!UUID.test(token)) return out(req, 400, { ok: false, reason: "unknown" });
  const r = await sb.rpc("recruit_accept", { p_token: token });
  if (r.error) return out(req, 500, { ok: false, reason: "error" });
  const d = r.data as { ok: boolean; already?: boolean; name?: string; start_date?: string; reason?: string };
  if (!d.ok) return out(req, 200, { ok: false, reason: d.reason || "unknown" });
  const first = String(d.name || "").trim().split(/\s+/)[0] || "";
  return out(req, 200, { ok: true, already: !!d.already, name: first, start_date: d.start_date || null });
});
