// sync-cron: Supabase timer for the Phorest cloud sync (Kate, 17 Nov 2026). Asks GitHub to run the sync workflow with a tier. Protected by x-cron-secret = internal_secrets 'sync_cron'.
// 18 Nov 2026: the 9 pm call on 17 Nov got a 503 and nothing was retried or logged, so that run was lost without a trace. Now: up to 3 tries
// (2 s, then 6 s apart) on any answer that is not 204 or any network error, and a failed row in sync_runs if all three fail. A second job,
// sync_watchdog() in the database, re-calls this function 12 minutes after each slot if no run has started.
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GH_TOKEN = Deno.env.get("GH_DISPATCH_TOKEN") || "";
const REPO = "katealsaybar/trs-phorest-sync";
const WORKFLOW = "sync.yml";
const TIERS = ["morning", "day", "night"];
const WAITS_MS = [2000, 6000];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function logFailure(why: string, tier: string) {
  try {
    const sb = createClient(SB_URL, SERVICE);
    await sb.from("sync_runs").insert({ trigger: "schedule", status: "failed", summary: why, scope: { tier }, finished_at: new Date().toISOString() });
  } catch (_) { /* the response below still carries the reason */ }
}

// One dispatch try. Returns the HTTP status, or 0 when the request itself did not get through.
async function dispatchOnce(tier: string): Promise<number> {
  try {
    const gh = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GH_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        "User-Agent": "trs-sync-cron",
      },
      body: JSON.stringify({ ref: "main", inputs: { tier, practice: "false" } }),
    });
    return gh.status;
  } catch (_) { return 0; }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  let tier = "";
  try {
    const sb = createClient(SB_URL, SERVICE);
    const given = req.headers.get("x-cron-secret") || "";
    const { data: sec } = await sb.from("internal_secrets").select("value").eq("name", "sync_cron").maybeSingle();
    if (!given || !sec || given !== sec.value) return json({ error: "not allowed" }, 403);

    const body = await req.json().catch(() => ({}));
    tier = String(body?.tier || "");
    if (!TIERS.includes(tier)) return json({ error: "tier must be morning, day or night" }, 400);

    if (!GH_TOKEN) {
      await logFailure("The timer could not start the run: the GH_DISPATCH_TOKEN secret is not set.", tier);
      return json({ error: "GH_DISPATCH_TOKEN is not set" }, 503);
    }
    let status = 0, tries = 0;
    for (let i = 0; i <= WAITS_MS.length; i++) {
      tries++;
      status = await dispatchOnce(tier);
      if (status === 204) return json({ ok: true, tier, tries });
      // 401/403/404/422 will not get better by asking again (bad or expired token, wrong repo or workflow): stop at once.
      if ([401, 403, 404, 422].includes(status)) break;
      if (i < WAITS_MS.length) await sleep(WAITS_MS[i]);
    }
    await logFailure(`The timer asked GitHub to run the ${tier} sync and it did not start after ${tries} ${tries === 1 ? "try" : "tries"} (last answer ${status || "no answer"}). ${status === 401 || status === 403 ? "The token may have expired." : "The watchdog will ask once more."}`, tier);
    return json({ error: `GitHub said ${status || "nothing"}`, tries }, 502);
  } catch (e) {
    await logFailure(`The timer failed before it could ask GitHub: ${String((e as Error).message || e).slice(0, 160)}`, tier || "unknown");
    return json({ error: String((e as Error).message || e).slice(0, 300) }, 500);
  }
});
