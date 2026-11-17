// ============================================================
// TARA ROSE LADIES SALON — the Daily reports button
// supabase/functions/sync-now/index.ts
// ============================================================
//
// Kate, 17 Nov 2026: the Daily reports page (Tools, owner only) has Run buttons. A press lands here.
//   1. The caller's own sign-in is passed to public.sync_request(scope). THE DATABASE decides: only the dashboard owner gets through, the
//      dates, salons and reports are checked, and one press every 20 seconds is the limit. It writes a 'queued' row in sync_runs and returns its id.
//   2. This function then asks GitHub to run the "sync" workflow of katealsaybar/trs-phorest-sync for that run (workflow_dispatch).
//      The runner there marks the row running and fills in the squares; the page watches sync_runs and sync_squares.
// If GitHub cannot be reached or the token is missing, the queued row is marked failed with the reason, so the page never waits for nothing.
//
// Secret to set (Supabase, Edge Functions, Secrets): GH_DISPATCH_TOKEN, a fine-grained GitHub token for ONLY the repo
// katealsaybar/trs-phorest-sync with the one permission "Actions: read and write". Nothing else is stored here.
//
// Deploy: this file is also the live function (deployed with the Supabase connector, JWT check on).
//
// scope: { dates: ["2026-11-16"], branches?: ["SAA", ...], reports?: ["fin", "daily", "sales", "util", "track"], ledger?: "2026-11-16", practice?: boolean }

import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GH_TOKEN = Deno.env.get("GH_DISPATCH_TOKEN") || "";
const REPO = "katealsaybar/trs-phorest-sync";
const WORKFLOW = "sync.yml";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const strs = (v: unknown, max: number): string[] =>
  Array.isArray(v) ? v.map((x) => String(x ?? "").trim()).filter(Boolean).slice(0, max) : [];

async function markFailed(id: number, why: string) {
  const sb = createClient(SB_URL, SERVICE);
  await sb.from("sync_runs").update({ status: "failed", summary: why, finished_at: new Date().toISOString() }).eq("id", id);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth) return json({ error: "Sign in first." }, 401);
    const body = await req.json().catch(() => ({}));
    const s = (body && typeof body.scope === "object" && body.scope) || {};
    const scope: Record<string, unknown> = { dates: strs(s.dates, 14), practice: s.practice === true };
    const branches = strs(s.branches, 5), reports = strs(s.reports, 5);
    if (branches.length) scope.branches = branches;
    if (reports.length) scope.reports = reports;
    if (s.ledger) scope.ledger = String(s.ledger);

    // 1. the database checks who is asking and what is asked
    const user = createClient(SB_URL, ANON, { global: { headers: { Authorization: auth } } });
    const r = await user.rpc("sync_request", { p_scope: scope });
    if (r.error) {
      const m = r.error.message || "refused";
      return json({ error: m }, /owner|permission denied/i.test(m) ? 403 : 400);
    }
    const runId = r.data as number;

    // 2. ask GitHub to run it
    if (!GH_TOKEN) {
      await markFailed(runId, "The button is not connected to GitHub yet: the GH_DISPATCH_TOKEN secret is not set.");
      return json({ error: "The button is not connected to GitHub yet.", run_id: runId }, 503);
    }
    const inputs = {
      tier: "custom",
      practice: String(scope.practice === true),
      dates: (scope.dates as string[]).join(","),
      branches: branches.join(","),
      reports: reports.join(","),
      ledger_date: String(scope.ledger || ""),
      run_id: String(runId),
    };
    const gh = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GH_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        "User-Agent": "trs-sync-now",
      },
      body: JSON.stringify({ ref: "main", inputs }),
    });
    if (gh.status !== 204) {
      await markFailed(runId, `GitHub would not start the run (${gh.status}). The token may have expired.`);
      return json({ error: `GitHub would not start the run (${gh.status}).`, run_id: runId }, 502);
    }
    return json({ ok: true, run_id: runId });
  } catch (e) {
    return json({ error: String((e as Error).message || e).slice(0, 300) }, 500);
  }
});
