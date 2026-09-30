// ============================================================
// TARA ROSE LADIES SALON — the stylist page's AI coach
// supabase/functions/perf-coach/index.ts   (Kate, 30 Sep 2026)
// ============================================================
//
// Two jobs, both from Tara on the 30 Sep call ("always start with the win, then
// a top tip on how to close the gap next month") and Kate's small chat box:
//
//   action "ask"   A stylist or beautician asks a question on her own page.
//                  Body: { token, question, history? }   (her page link token)
//                  or   { admin, staff_id, question }     (a leader on her page)
//                  The numbers are fetched HERE from perf_dashboard with her
//                  token, never taken from the browser, so she can only ever be
//                  answered from her own month and nobody else's.
//
//   action "tips"  Once a month, a leader writes everyone's win + top tip.
//                  Body: { admin, month: "YYYY-MM", only_missing? }
//                  Saved to perf_tips; the page and the monthly email show them
//                  over the formula in performance/win-gap.js. Never runs on page
//                  load, so the cost is one call per person per month.
//
// Same ANTHROPIC_API_KEY secret as dashboard-ask. The model is fixed here, never
// taken from the caller: this endpoint is public.
//
// Deploy:  supabase functions deploy perf-coach --project-ref gvijxenafoowajqktqvd
// Tables:  perf_tips (migrations/create_perf_tips.sql). Questions are not stored.
// No em-dashes in anything the model writes.

import Anthropic from "npm:@anthropic-ai/sdk";

const ASK_MODEL = "claude-haiku-4-5";
const TIPS_MODEL = "claude-sonnet-5-5";
const MAX_QUESTION_CHARS = 500;
const MAX_HISTORY = 6;

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const VOICE = `Voice: Tara Rose Salons. Warm, real, expert, confident, personal. Talk to her like a senior stylist who is on her side: plain words, short sentences, no jargon, no hype. British English spelling. Never use an em-dash. No exclamation marks. Never open with "Great question".`;

const MONEY_FIVE = `How the salon measures a stylist (the Money Five and friends): average bill (service sales divided by clients), treatment % (treatments as a share of hair services), retail % (retail as a share of service sales), rebooking % (clients who booked their next visit before leaving), column fill % (booked hours as a share of available hours). Also client numbers, request rate (clients who asked for her by name), conversion (new clients who came back within 12 weeks) and retention (regulars seen again). Each level has a minimum and an aim (benchmarks); next_benchmarks are the aims for the level above. Money figures are AED and ex VAT. If the month is not finished, sums are partial: numbers.last_date is the last day counted.`;

const ASK_SYSTEM = `You are the coach on one Tara Rose Salons team member's private performance page. She is a stylist or beautician looking at her own month. Answer her question using the DATA block and nothing else.

${MONEY_FIVE}

Rules.
1. Your only source is DATA: her own numbers, her aims, her last three months, and the notes Tara and Emma wrote her. You know nothing about any other team member. If she asks about someone else, say you can only see her own numbers.
2. Lead with the answer in one to four short sentences. Use her real figures. When you work something out ("if you rebooked 3 more clients a week"), show the working in plain words so she can check it.
3. For "how do I" questions, give one or two concrete things to do in the chair or at the desk this week, tied to her weakest number that matters for her question.
4. Never invent a number, a policy, a price, a commission rate or a promise about pay or promotion. Pay, contracts and payslips: tell her to talk to her salon manager.
5. If DATA does not answer it, say so in one sentence.

Reply in the language she writes in. ${VOICE}`;

const TIPS_SYSTEM = `You write the "Your win" and "Top tip for next month" lines at the top of one Tara Rose Salons team member's monthly performance page. It goes out with her payslip.

${MONEY_FIVE}

Tara's rule: always start with the win. Then one top tip on how to close the gap next month.
- win: one or two sentences. The number she should be proudest of, with the figure and her aim, said warmly and specifically. If nothing reached its aim, her biggest rise on last month. If a leader's note praises something, you may use it.
- tip: one or two sentences. The single change worth the most to her, as something to do each week, with the figure it gets her to and roughly what it is worth in AED a month. Show the maths in words. Tara's own example: "Your rebooking is great, but you are only 56% booked. Two more new clients a week over the next three months and you would be 100% booked." If the gap is big, spread it over three months. If a leader's note names a focus, the tip follows the note.
- how: one sentence, the practical way to do it in the chair or at the desk.
Use only figures from DATA. Never mention anyone else. Never promise pay or promotion. Address her as "you".

${VOICE}`;

const ASK_SCHEMA = {
  type: "object",
  properties: { answer: { type: "string", description: "One to four short sentences." } },
  required: ["answer"], additionalProperties: false,
};
const TIPS_SCHEMA = {
  type: "object",
  properties: {
    win: { type: "string" }, tip: { type: "string" }, how: { type: "string" },
  },
  required: ["win", "tip", "how"], additionalProperties: false,
};

const ALLOWED_ORIGINS = ["https://trk-salon-os.com", "https://www.trk-salon-os.com", "https://katealsaybar.github.io"];
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;
function cors(origin: string | null): Record<string, string> {
  const ok = origin && (ALLOWED_ORIGINS.includes(origin) || LOCAL.test(origin));
  return {
    "access-control-allow-origin": ok ? origin! : ALLOWED_ORIGINS[0],
    "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
    "access-control-allow-methods": "POST, OPTIONS",
    "vary": "Origin",
  };
}
const json = (body: unknown, headers: Record<string, string>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, "content-type": "application/json" } });
const statusOf = (e: unknown) => { const n = (e as { status?: unknown })?.status; return typeof n === "number" ? n : undefined; };

async function rpc(fn: string, args: unknown, key = ANON) {
  const r = await fetch(`${SUPA_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify(args),
  });
  return r.ok ? r.json() : null;
}

// What the model sees: her month without the day-by-day rows, review text or links.
function dataOf(d: Record<string, any>) {
  const n = { ...(d.numbers || {}) };
  delete n.review_list; delete n.social_list; delete n.ig_handles;
  return JSON.stringify({
    month: d.month, staff: { name: d.staff?.name, level: d.staff?.level, dept: d.staff?.dept, branch: d.staff?.branch },
    numbers: n, benchmarks: d.benchmarks, next_level: d.next_level, next_benchmarks: d.next_benchmarks,
    weeks: (d.weeks || []).map((w: any) => ({ week_start: w.week_start, sales: w.numbers?.total_revenue, clients: w.numbers?.clients })),
    last_three_months: (d.history || []).map((h: any) => ({ month: h.month, ...h.numbers })),
    notes_from_leaders: (d.notes || []).map((x: any) => ({ by: x.author, note: x.note })),
  });
}

function friendly(error: unknown) {
  const status = statusOf(error), msg = String((error as { message?: string })?.message ?? "");
  if (/credit balance/i.test(msg)) return { error: "The coach is resting: the salon's AI account has run out of credit. Tell Kate.", status: 503 };
  if (status === 429 || status === 529) return { error: "The coach is busy. Ask again in a moment.", status: 503 };
  if (status === 401 || status === 403) return { error: "The coach cannot sign in. Tell Kate the API key needs checking.", status: 500 };
  return { error: "Something went wrong. Your numbers on the page are still correct.", status: 500 };
}

Deno.serve(async (req: Request) => {
  const CORS = cors(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, CORS, 405);
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "The coach is not set up yet. Tell Kate the ANTHROPIC_API_KEY secret is missing." }, CORS, 500);
  const anthropic = new Anthropic({ apiKey });

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return json({ error: "Could not read that request." }, CORS, 400); }
  const action = String(body.action || "ask");

  // ── ask ────────────────────────────────────────────────────────────────
  if (action === "ask") {
    const question = String(body.question ?? "").trim();
    if (!question) return json({ error: "Ask a question first." }, CORS, 400);
    if (question.length > MAX_QUESTION_CHARS) return json({ error: `Keep it under ${MAX_QUESTION_CHARS} characters.` }, CORS, 400);
    const month = /^\d{4}-\d{2}$/.test(body.month || "") ? body.month + "-01" : null;
    const d = body.token
      ? await rpc("perf_dashboard", { p_token: body.token, p_month: month })
      : await rpc("perf_dashboard_by_id", { p_admin: body.admin, p_staff_id: body.staff_id, p_month: month });
    if (!d) return json({ error: "This link isn't active." }, CORS, 403);

    const history = (Array.isArray(body.history) ? body.history : []).slice(-MAX_HISTORY)
      .filter((m: any) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map((m: any) => ({ role: m.role, content: m.content.slice(0, 1200) }));
    try {
      const res = await anthropic.messages.create({
        model: ASK_MODEL, max_tokens: 600,
        output_config: { format: { type: "json_schema", schema: ASK_SCHEMA } },
        system: [{ type: "text", text: ASK_SYSTEM }, { type: "text", text: `DATA\n${dataOf(d)}`, cache_control: { type: "ephemeral" } }],
        messages: [...history, { role: "user", content: question }],
      } as any);
      const text = (res.content as any[]).find((b) => b.type === "text")?.text;
      return json(JSON.parse(text), CORS);
    } catch (e) {
      console.error("[perf-coach ask]", e);
      const f = friendly(e); return json({ error: f.error }, CORS, f.status);
    }
  }

  // ── tips ───────────────────────────────────────────────────────────────
  if (action === "tips") {
    const month = /^\d{4}-\d{2}$/.test(body.month || "") ? body.month : null;
    if (!month) return json({ error: "Send month as YYYY-MM." }, CORS, 400);
    const team = await rpc("perf_team", { p_admin: body.admin, p_month: month + "-01" });
    if (!team || team.role !== "leader") return json({ error: "Leaders only." }, CORS, 403);

    let staff: any[] = team.staff || [];
    if (body.only_missing) {
      const have = await fetch(`${SUPA_URL}/rest/v1/perf_tips?select=staff_id&month=eq.${month}-01`,
        { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } }).then((r) => r.json());
      const got = new Set((have || []).map((x: any) => x.staff_id));
      staff = staff.filter((s) => !got.has(s.id));
    }

    const done: string[] = [], failed: string[] = [];
    let stop: { error: string; status: number } | null = null;
    const one = async (s: any) => {
      if (stop) return;
      const d = await rpc("perf_dashboard_by_id", { p_admin: body.admin, p_staff_id: s.id, p_month: month + "-01" });
      if (!d || !(d.numbers?.clients > 0)) return;
      try {
        const res = await anthropic.messages.create({
          model: TIPS_MODEL, max_tokens: 700,
          output_config: { format: { type: "json_schema", schema: TIPS_SCHEMA } },
          system: TIPS_SYSTEM,
          messages: [{ role: "user", content: `DATA\n${dataOf(d)}` }],
        } as any);
        const out = JSON.parse((res.content as any[]).find((b) => b.type === "text")?.text);
        const w = await fetch(`${SUPA_URL}/rest/v1/perf_tips?on_conflict=staff_id,month`, {
          method: "POST",
          headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "content-type": "application/json", Prefer: "resolution=merge-duplicates" },
          body: JSON.stringify({ staff_id: s.id, month: month + "-01", win: out.win, tip: out.tip, how: out.how, model: TIPS_MODEL, created_at: new Date().toISOString() }),
        });
        (w.ok ? done : failed).push(s.name);
      } catch (e) {
        console.error("[perf-coach tips]", s.name, e);
        const f = friendly(e);
        if (f.status === 503 && /credit/.test(f.error)) stop = f;
        failed.push(s.name);
      }
    };
    // Six at a time: about a minute for the whole team.
    for (let i = 0; i < staff.length; i += 6) await Promise.all(staff.slice(i, i + 6).map(one));
    if (stop && !done.length) return json({ error: stop.error }, CORS, stop.status);
    return json({ month, written: done.length, failed, model: TIPS_MODEL }, CORS);
  }

  return json({ error: "Unknown action." }, CORS, 400);
});
