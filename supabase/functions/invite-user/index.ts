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
// invite_hook_ok(), service role only). The email must be on the roster (dashboard_users, or an active
// stylist or beautician in perf_staff, or active reception, assistant or call centre in kb_staff) and
// must not have an account yet.
//
// Kate, 4 Nov 2026: mass invite from /hub/roster. `emails` (a list) plus `batch` (a uuid made by kb_send_invite_bulk)
// answers 202 at once and sends the invites in the background, one a second, writing each result to kb_invite_log
// so the page can show progress. A single `email` works as before.
//
// Deploy: supabase functions deploy invite-user --no-verify-jwt --project-ref gvijxenafoowajqktqvd

import { createClient } from "npm:@supabase/supabase-js@2";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const SITE = "https://trk-salon-os.com/";
const MAX_BATCH = 80;
const GAP_MS = 1000;   // one email a second, so Supabase's email rate limit is not hit in one burst
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const like = (s: string) => s.replace(/[\\%_]/g, "\\$&");

async function onRoster(email: string): Promise<boolean> {
  const e = like(email);
  const d = await sb.from("dashboard_users").select("email").ilike("email", e).limit(1);
  if (d.data && d.data.length) return true;
  const p = await sb.from("perf_staff").select("email").eq("active", true).in("dept", ["Hair", "Beauty"]).ilike("email", e).limit(1);
  if (p.data && p.data.length) return true;
  const k = await sb.from("kb_staff").select("email").eq("active", true).in("category", ["Receptionist", "Assistant", "Call Centre"]).ilike("email", e).limit(1);
  return !!(k.data && k.data.length);
}

async function inviteOne(email: string): Promise<{ status: "invited" | "skipped" | "failed"; error?: string }> {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { status: "failed", error: "bad email" };
  if (!(await onRoster(email))) return { status: "failed", error: "not on the roster" };
  const { error } = await sb.auth.admin.inviteUserByEmail(email, { redirectTo: SITE });
  // Already has an account (Google or password): nothing to send.
  if (error && /already|registered|exists/i.test(error.message)) return { status: "skipped", error: "has an account" };
  if (error) return { status: "failed", error: error.message.slice(0, 200) };
  return { status: "invited" };
}

async function runBatch(batch: string, emails: string[]) {
  for (const email of emails) {
    let r: { status: string; error?: string };
    try { r = await inviteOne(email); } catch (e) { r = { status: "failed", error: String((e as Error).message || e).slice(0, 200) }; }
    await sb.from("kb_invite_log").update({ status: r.status, error: r.error ?? null, done_at: new Date().toISOString() })
      .eq("batch", batch).eq("email", email);
    await sleep(GAP_MS);
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    const body = await req.json();
    const ok = await sb.rpc("invite_hook_ok", { p_secret: String(body.secret || "") });
    if (ok.error || ok.data !== true) return json({ error: "not allowed" }, 401);

    if (Array.isArray(body.emails)) {
      const batch = String(body.batch || "");
      if (!/^[0-9a-f-]{36}$/i.test(batch)) return json({ error: "bad batch" }, 400);
      const emails = [...new Set((body.emails as unknown[]).map((e) => String(e || "").trim().toLowerCase()).filter(Boolean))].slice(0, MAX_BATCH);
      if (!emails.length) return json({ error: "no emails" }, 400);
      EdgeRuntime.waitUntil(runBatch(batch, emails));
      return json({ queued: emails.length }, 202);
    }

    const email = String(body.email || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "bad email" }, 400);
    if (!(await onRoster(email))) return json({ error: "not on the roster" }, 400);
    const r = await inviteOne(email);
    if (r.status === "skipped") return json({ skipped: "has an account", email });
    if (r.status === "failed") return json({ error: r.error }, 500);
    return json({ invited: email });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
