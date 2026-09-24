// ============================================================
// TARA ROSE LADIES SALON — the dashboard's question widget
// supabase/functions/dashboard-ask/index.ts
// ============================================================
//
// Ported from the Wellness Voucher pack's cheat-sheet-ask (24 Sep 2026). Same
// project, same ANTHROPIC_API_KEY secret as pulse-narrative and
// branch-narrative, same house rule: it may not produce a fact it was not given.
//
// WHY IT EXISTS: the dashboard is static HTML on a public Pages host, so it
// cannot hold an API key. This function holds it and is the only thing that
// talks to Anthropic.
//
// THE ONE DESIGN RULE: a number on this dashboard gets repeated in a team chat
// or a one to one. A confidently wrong figure is worse than no answer. So the
// model is given the page she is looking at as its only source, is told to say
// "not on this page" rather than estimate, and every answer carries the line or
// figure it came from so a human can check it against the screen in seconds.
//
// THE GROUNDING IS SENT BY THE CALLER. ask-widget.js reads the open view out of
// the live DOM at ask time (text, tables, chart data, the Branch and Period
// filters), plus the other pages' names only. So the answer can never drift from
// the screen: there is no second copy of the numbers to go stale.
//
// THE MODEL IS CHOSEN BY THE READER, from a fixed list, never from whatever the
// client sends: this endpoint is public, and an open model parameter is somebody
// else's bill.
//
// Deploy:  supabase functions deploy dashboard-ask --project-ref gvijxenafoowajqktqvd
// Secrets: shares pulse-narrative's ANTHROPIC_API_KEY. Nothing new to set.
// Tables:  none. Nothing is stored; a question is not a record.
//
// No em-dashes in copy the model writes, per the 4 July purge.

import Anthropic from "npm:@anthropic-ai/sdk";

const MAX_QUESTION_CHARS = 600;
const MAX_CONTEXT_CHARS = 160000;

// The allowlist. `key` is what the widget sends; everything else is decided here.
//   effort    errors outright on Haiku 4.5, so it is omitted there.
//   fallback  is the server-side refusal fallback, kept where it applies.
type ModelSpec = { id: string; effort?: "low" | "medium" | "high"; fallback?: boolean };

const MODELS: Record<string, ModelSpec> = {
  quick:    { id: "claude-haiku-4-5" },
  balanced: { id: "claude-sonnet-5", effort: "low" },
  careful:  { id: "claude-opus-5", effort: "low", fallback: true },
};
const DEFAULT_MODEL = "careful";

const SYSTEM = `You answer questions from the Tara Rose Ladies Salon team about their internal performance dashboard, using the PAGE block you are given and nothing else.

Who is asking. The founder, the operations manager, branch managers and coaches, reading a page of sales, clients, targets and staff figures. They want a straight answer they can repeat in a meeting.

THE RULE THAT OVERRIDES EVERYTHING ELSE: your only source is the PAGE block. It is the page in front of her, read off the screen a moment ago, with the Branch and Period she has selected. You have no other knowledge of this salon's numbers. If the page does not show it, you do not know it.

How to answer.
1. Answer plainly in one to three sentences, leading with the figure or the name she asked for. Say which branch and period it is for when that matters.
2. You may read, compare and rank figures that are on the page. If you add, subtract or divide, keep it to figures shown on the page and write the working in the answer (for example "AED 154,897 less AED 126,963 is AED 27,934"), so it can be checked. Never estimate, project, or fill a gap.
3. In source, quote the row, line or figure from the page that carries the answer, as close to word for word as you can. One line, not a table.
4. If the page does not answer it, set found to false and say so in one sentence. If it plainly belongs to one of the other pages listed as "not loaded", name that page ("That is on Team Performance, open it and ask again"). If a section looks collapsed or missing, say to open it and ask again.
5. Never explain why a number is what it is unless the page itself says why. Describe, do not speculate about causes or people.

Figures: copy them exactly as the page shows them, AED and all. Do not convert currency, do not round unless she asks.

Voice: warm, real, expert, plain. Reply in the language of the question: English, or casual Taglish if she writes in Taglish. British English spelling. Short sentences, no preamble, never open with "Great question". No exclamation marks. Never use an em-dash.`;

const SCHEMA = {
  type: "object",
  properties: {
    found: {
      type: "boolean",
      description: "True only if the page actually answers the question. False if you are declining or saying it is not on the page.",
    },
    answer: {
      type: "string",
      description: "One to three sentences, leading with the figure or name asked for, with any working shown. If found is false, one sentence saying so and naming the page it belongs on if you can tell.",
    },
    source: {
      type: "string",
      description: "The row, line or figure from the page that carries the answer, quoted as closely as you can. If found is false, the exact string: not on this page",
    },
    section: {
      type: "string",
      description: "The heading on the page the answer sits under, for example Staff performance, Khalifa City, Hair. Empty string if found is false.",
    },
  },
  required: ["found", "answer", "source", "section"],
  additionalProperties: false,
};

// Only the Pages host plus local preview may call this. Not a security boundary
// on its own, but it stops the endpoint being casually reused from anywhere else.
const ALLOWED_ORIGINS = ["https://katealsaybar.github.io", "https://tararose83.github.io"];
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

const statusOf = (e: unknown): number | undefined => {
  const n = (e as { status?: unknown })?.status;
  return typeof n === "number" ? n : undefined;
};

const json = (body: unknown, headers: Record<string, string>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, "content-type": "application/json" } });

Deno.serve(async (req: Request) => {
  const CORS = cors(req.headers.get("origin"));

  // A 204 must carry no body, or the preflight fails and CORS blocks the POST.
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, CORS, 405);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "The answer service is not configured. Tell Kate the ANTHROPIC_API_KEY secret is missing." }, CORS, 500);

  let question = "";
  let page = "";
  let picked = DEFAULT_MODEL;
  try {
    const body = await req.json();
    question = String(body.question ?? "").trim();
    page = String(body.page ?? "").trim();
    const asked = String(body.model ?? "").trim();
    // An unknown key falls back to the default: a stale page gets a slower answer, never no answer.
    if (asked && MODELS[asked]) picked = asked;
  } catch {
    return json({ error: "Could not read that request." }, CORS, 400);
  }

  if (!question) return json({ error: "Ask a question first." }, CORS, 400);
  if (question.length > MAX_QUESTION_CHARS) return json({ error: `Keep the question under ${MAX_QUESTION_CHARS} characters.` }, CORS, 400);
  if (!page) return json({ error: "The page had not loaded, so there is nothing to answer from. Wait for the numbers, then ask again." }, CORS, 400);
  if (page.length > MAX_CONTEXT_CHARS) return json({ error: "That page is bigger than expected. Narrow the Branch or Period and ask again." }, CORS, 400);

  const spec = MODELS[picked];
  const anthropic = new Anthropic({ apiKey });

  async function ask() {
    const outputConfig: Record<string, unknown> = { format: { type: "json_schema", schema: SCHEMA } };
    if (spec.effort) outputConfig.effort = spec.effort;

    return await anthropic.beta.messages.create({
      model: spec.id,
      max_tokens: 1500,
      output_config: outputConfig,
      ...(spec.fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      system: [
        // Stable prefix first so it caches. A follow-up question on the same page
        // and filters reuses the cached page block.
        { type: "text", text: SYSTEM },
        { type: "text", text: `PAGE\n${page}`, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: question }],
    });
  }

  // 529 overloaded is the API saying "try again", so it is retried, not reported.
  async function askWithRetry() {
    let last: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await ask();
      } catch (e) {
        last = e;
        const overloaded = statusOf(e) === 529;
        if (!overloaded || attempt === 2) throw e;
        console.warn(`[dashboard-ask] ${spec.id} overloaded, retry ${attempt + 1}`);
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }
    throw last;
  }

  try {
    const res = await askWithRetry();

    if (res.stop_reason === "refusal") {
      console.error("[dashboard-ask] refused", res.stop_details);
      return json({ found: false, answer: "I cannot answer that one. Ask Kate.", source: "not on this page", section: "", model: picked }, CORS);
    }

    const text = res.content.find((b: { type: string }) => b.type === "text");
    if (!text || !("text" in text)) return json({ error: "No answer came back. Try again." }, CORS, 502);

    let out: Record<string, unknown>;
    try {
      out = JSON.parse((text as { text: string }).text);
    } catch {
      console.error("[dashboard-ask] unparseable output from", spec.id);
      return json({ error: "The answer came back malformed. Try asking it a different way, or pick a different model." }, CORS, 502);
    }

    // Echo which model answered, so a wrong answer can be traced to the model that gave it.
    out.model = picked;
    return json(out, CORS);
  } catch (error) {
    // Checked by status code, not instanceof: this SDK build does not hang its
    // error classes off the default export, so instanceof threw inside the catch
    // and the browser saw a bare 500 with no CORS header (found 24 Sep 2026).
    const status = statusOf(error);
    const msg = String((error as { message?: string })?.message ?? "");
    if (/credit balance/i.test(msg)) return json({ error: "The answer service has run out of Anthropic credit. Tell Kate to top up the API account." }, CORS, 503);
    if (status === 429) return json({ error: "Too many questions at once. Wait a moment and ask again." }, CORS, 429);
    if (status === 401 || status === 403) return json({ error: "The answer service cannot sign in. Tell Kate the API key needs checking." }, CORS, 500);
    if (status === 529) return json({ error: "The answer service is busy right now. Ask again in a few seconds." }, CORS, 503);
    if (status === undefined) {
      console.error("[dashboard-ask] no response from", spec.id, error);
      return json({ error: "Could not reach the answer service. Try again in a moment." }, CORS, 503);
    }
    console.error("[dashboard-ask] failed on", spec.id, error);
    return json({ error: "Something went wrong answering that. Try a different model, or read the page: it is still correct." }, CORS, 500);
  }
});
