// ============================================================
// TARA ROSE LADIES SALON — Invite user
// supabase/functions/invite-user/index.ts
// ============================================================
//
// Kate, 3 Oct 2026: someone added to dashboard_users gets Supabase's invite email
// (the branded "You're invited" template, sent through the noreply@ SMTP). Called by
// public.dashboard_invite(), which the dashboard_users insert trigger runs, and which
// Kate can run by hand in the SQL editor to send one again.
//
// The caller must send the vault secret 'invite_hook_secret' (checked by
// invite_hook_ok(), service role only). The email must be on dashboard_users and
// must not have an account yet.
//
// Deploy: supabase functions deploy invite-user --no-verify-jwt --project-ref gvijxenafoowajqktqvd

import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const SITE = "https://trk-salon-os.com/";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    const body = await req.json();
    const email = String(body.email || "").trim().toLowerCase();
    const ok = await sb.rpc("invite_hook_ok", { p_secret: String(body.secret || "") });
    if (ok.error || ok.data !== true) return json({ error: "not allowed" }, 401);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "bad email" }, 400);

    const listed = await sb.from("dashboard_users").select("email").ilike("email", email).maybeSingle();
    if (!listed.data) return json({ error: "not on dashboard_users" }, 400);

    const { error } = await sb.auth.admin.inviteUserByEmail(email, { redirectTo: SITE });
    // Already has an account (Google or password): nothing to send.
    if (error && /already|registered|exists/i.test(error.message)) return json({ skipped: "has an account", email });
    if (error) return json({ error: error.message }, 500);
    return json({ invited: email });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
