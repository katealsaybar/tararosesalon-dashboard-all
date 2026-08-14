// ============================================================
// TARA ROSE LADIES SALON — Organisation Pulse narrative
// supabase/functions/pulse-narrative/index.ts
// ============================================================
//
// Turns the KPI figures the dashboard has already computed into the page's
// prose — hero headline, the Hair/Beauty read, the "fix first" framing.
//
// THE DIVISION OF LABOUR, WHICH IS THE WHOLE POINT:
//   The dashboard does the arithmetic. It ranks the gaps, works out the
//   attainment, decides what is worst. All of that is deterministic and stays
//   in dashboard.js where it can be read and checked.
//   This function only writes English. It is handed the numbers and is not
//   allowed to produce a figure that wasn't handed to it — see checkNumbers().
//   A response carrying an invented number is rejected, retried once, and then
//   the function returns null so the page falls back to its static copy.
//
// Deploy:  supabase functions deploy pulse-narrative --project-ref gvijxenafoowajqktqvd
// Secrets: supabase secrets set ANTHROPIC_API_KEY=sk-ant-... PULSE_ADMIN_SECRET=<anything long>

import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

const MODEL = "claude-opus-5";

// ── VOICE ───────────────────────────────────────────────────
// Canonical source is the trs-brand-voice skill. This is a compact restatement
// so the function is self-contained; if the skill changes, change this too, and
// run /brand-review on whatever the page starts saying.
const SYSTEM = `You write the narrative copy for Tara Rose Ladies Salon's internal Organisation Pulse dashboard. The readers are the founder and the branch managers.

Voice: warm, real, expert, confident, personal. British English. Plain nouns and short sentences. No exclamation marks, no hype, no cheerleading, no corporate filler ("leverage", "utilise", "journey", "excited to share"). Never congratulate and never scold — state what the numbers say and what it means for the week ahead. This is an internal management page, not marketing.

The rule that overrides everything else: every figure you write must come from the FACTS block, either exactly as given or rounded from it. Do not calculate new figures, do not estimate, do not infer a number that is not there. If a sentence needs a number you were not given, write the sentence without it.

Write about what the numbers mean, not what they are — the reader can see the numbers in the cards beside your text. Prefer the consequence ("beauty sits underneath almost every gap on the list") over the restatement ("beauty avg bill is 164").`;

// ── OUTPUT SHAPE ────────────────────────────────────────────
const SCHEMA = {
  type: "object",
  properties: {
    headline:          { type: "string", description: "Hero headline. Two short sentences at most. The single thing the reader should leave with." },
    headline_emphasis: { type: "string", description: "A short substring of `headline`, copied verbatim, that the page italicises in coral. Usually the metric name." },
    deck:              { type: "string", description: "One standing line, italic serif on the page. What this page is showing, in plain words. Max 20 words." },
    standfirst:        { type: "string", description: "The read under the headline. Three sentences, no more." },
    hair_read:   { type: "object", properties: { heading: { type: "string" }, body: { type: "string" } }, required: ["heading", "body"], additionalProperties: false },
    beauty_read: { type: "object", properties: { heading: { type: "string" }, body: { type: "string" } }, required: ["heading", "body"], additionalProperties: false },
    fix_first: {
      type: "object",
      properties: {
        headline: { type: "string", description: "Why this metric is first, as a statement." },
        why:      { type: "string", description: "The case for it. Two or three sentences." },
        check:    { type: "string", description: "How we would know it worked. Concrete and observable." },
        worth:    { type: "string", description: "What moving it is worth, using only supplied figures." },
      },
      required: ["headline", "why", "check", "worth"],
      additionalProperties: false,
    },
  },
  required: ["headline", "headline_emphasis", "deck", "standfirst", "hair_read", "beauty_read", "fix_first"],
  additionalProperties: false,
};

// ── THE NUMBER GUARD ────────────────────────────────────────
// Build the set of figures the model is permitted to write. For each supplied
// fact we allow the raw value, honest roundings of it (0/1/2 dp), and the same
// value expressed in thousands or millions — so "AED 1.95m" and "163k" pass
// while a number that isn't in the data does not.
function allowedNumbers(facts: Record<string, unknown>, labels: Record<string, unknown>): number[] {
  const out = new Set<number>();
  const push = (n: number) => { if (Number.isFinite(n)) out.add(Number(n.toFixed(4))); };

  for (const v of Object.values(facts)) {
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    for (const scale of [1, 1e-3, 1e-6]) {
      const x = v * scale;
      push(x);
      for (const dp of [0, 1, 2]) push(Number(x.toFixed(dp)));
    }
  }
  // Dates, years and branch counts live in the labels — "1 July – 12 August 2026".
  for (const l of Object.values(labels)) {
    for (const m of String(l ?? "").match(/\d+(?:\.\d+)?/g) ?? []) push(Number(m));
  }
  return [...out];
}

function checkNumbers(copy: unknown, allowed: number[]): string[] {
  const bad = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === "string") {
      for (const tok of v.match(/\d[\d,]*(?:\.\d+)?/g) ?? []) {
        const n = Number(tok.replace(/,/g, ""));
        if (!Number.isFinite(n)) continue;
        if (!allowed.some((a) => Math.abs(a - n) < 1e-4)) bad.add(tok);
      }
    } else if (v && typeof v === "object") {
      Object.values(v as Record<string, unknown>).forEach(walk);
    }
  };
  walk(copy);
  return [...bad];
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Stable stringify — key order must not change the hash, or every page load
// looks like a new set of numbers and regenerates.
function canonical(o: Record<string, unknown>): string {
  return JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]]));
}

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-pulse-admin",
  "access-control-allow-methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });

Deno.serve(async (req) => {
  // A 204 must carry no body: `new Response(JSON.stringify(...), {status: 204})`
  // throws in Deno, the preflight then fails, and CORS blocks the dashboard's
  // real POST. Verified against the live page 12 Aug 2026 — build this one by
  // hand rather than through json().
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let payload: { period_key?: string; facts?: Record<string, unknown>; labels?: Record<string, unknown>; force?: boolean };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }

  const periodKey = String(payload.period_key ?? "").trim();
  const facts = payload.facts ?? {};
  const labels = payload.labels ?? {};
  if (!periodKey) return json({ error: "period_key is required" }, 400);
  if (!Object.keys(facts).length) return json({ error: "facts is required" }, 400);

  // `force` regenerates on demand and therefore spends money, so it needs the
  // admin secret. Everything else is read-through-cache: the only way a normal
  // caller triggers a generation is by presenting figures we have not seen.
  const isAdmin = req.headers.get("x-pulse-admin") === Deno.env.get("PULSE_ADMIN_SECRET");
  const force = payload.force === true && isAdmin;

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const factsHash = await sha256(canonical({ ...facts, ...labels }));

  if (!force) {
    const { data: hit } = await sb
      .from("pulse_narrative")
      .select("copy, model, created_at")
      .eq("period_key", periodKey)
      .eq("facts_hash", factsHash)
      .maybeSingle();
    if (hit) return json({ copy: hit.copy, cached: true, model: hit.model, generated_at: hit.created_at });
  }

  const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! });
  const allowed = allowedNumbers(facts, labels);

  const factsBlock = Object.entries({ ...labels, ...facts })
    .map(([k, v]) => `${k}: ${typeof v === "number" ? v.toLocaleString("en-GB", { maximumFractionDigits: 2 }) : v}`)
    .join("\n");

  const userTurn =
    `FACTS — every figure you write must come from this block.\n\n${factsBlock}\n\n` +
    `Write the narrative copy for this period. Currency is AED throughout. ` +
    `"Net take" means everything the salon billed before staff cost — use that phrase, never "money in" or "revenue".`;

  let lastBad: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    let res;
    try {
      res = await anthropic.beta.messages.create({
        model: MODEL,
        max_tokens: 8000,
        // Server-side fallback is on by default: if a safety classifier ever
        // declines the request, the API re-serves it on the recommended model
        // inside the same call rather than handing us a refusal.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: SYSTEM,
        output_config: { format: { type: "json_schema", schema: SCHEMA }, effort: "high" },
        messages: [
          { role: "user", content: userTurn },
          ...(lastBad.length
            ? [
                { role: "assistant" as const, content: "(previous attempt)" },
                {
                  role: "user" as const,
                  content:
                    `That draft contained figures that are not in the FACTS block: ${lastBad.join(", ")}. ` +
                    `Rewrite it using only supplied figures, or drop those sentences.`,
                },
              ]
            : []),
        ],
      });
    } catch (e) {
      console.error("[pulse] API call failed", e);
      return json({ copy: null, error: "generation failed" }, 502);
    }

    // Opus 5 can decline a request outright — check before reading content.
    if (res.stop_reason === "refusal") {
      console.error("[pulse] refused", res.stop_details);
      return json({ copy: null, error: "refused" }, 502);
    }

    const text = res.content.find((b: { type: string }) => b.type === "text");
    if (!text || !("text" in text)) return json({ copy: null, error: "no text block" }, 502);

    let copy: unknown;
    try {
      copy = JSON.parse((text as { text: string }).text);
    } catch {
      console.error("[pulse] unparseable output");
      continue;
    }

    // The emphasis span has to actually appear in the headline or the page
    // renders a stray <em>.
    const c = copy as Record<string, string>;
    if (typeof c.headline === "string" && typeof c.headline_emphasis === "string" &&
        !c.headline.includes(c.headline_emphasis)) {
      c.headline_emphasis = "";
    }

    const bad = checkNumbers(copy, allowed);
    if (bad.length) {
      console.warn(`[pulse] attempt ${attempt + 1} rejected — unsupported figures: ${bad.join(", ")}`);
      lastBad = bad;
      continue;
    }

    await sb.from("pulse_narrative").upsert(
      {
        period_key: periodKey,
        facts_hash: factsHash,
        model: res.model,
        copy,
        input_tokens: res.usage?.input_tokens ?? null,
        output_tokens: res.usage?.output_tokens ?? null,
      },
      { onConflict: "period_key,facts_hash" },
    );

    return json({ copy, cached: false, model: res.model });
  }

  // Both attempts invented a figure. Say so plainly and let the page keep its
  // static copy — a wrong number on a leadership page is worse than no prose.
  console.error("[pulse] giving up after 2 attempts", lastBad);
  return json({ copy: null, error: "validation failed", unsupported_figures: lastBad }, 422);
});
