// ============================================================
// TARA ROSE LADIES SALON — Branch Performance reads
// supabase/functions/branch-narrative/index.ts
// ============================================================
//
// The Working / Watch / Do this panel under each branch's growth card. Sibling of
// pulse-narrative: same division of labour, same number guard, same fail-safe.
//
// THE DIVISION OF LABOUR:
//   branch-ledger.js does every calculation — the like-for-like window, the growth
//   percentages, which benchmark is worst, which branch leads each one. All of it
//   deterministic, all of it readable in the file.
//   This function only writes English, and may not produce a figure it was not
//   handed. A reply carrying an invented number is rejected, retried once, and then
//   refused, at which point the page keeps the rules-written copy it rendered
//   before ever calling here. See bnFallback() in branch-narrative.js.
//
// ONE CALL FOR ALL FOUR BRANCHES, not one per branch. The sentences worth reading
// are comparative — "the lowest of the four on the largest bench" — and a per-branch
// call cannot say that without being handed its peers anyway. One call, one cache
// row, and the copy for Khalifa does not change because Motor City re-synced.
//
// Deploy:  supabase functions deploy branch-narrative --project-ref gvijxenafoowajqktqvd
// Secrets: shares pulse-narrative's — ANTHROPIC_API_KEY, PULSE_ADMIN_SECRET.
// Table:   migrations/create_branch_narrative.sql must be run first.

import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

const MODEL = "claude-opus-5";

// ── VOICE ───────────────────────────────────────────────────
// Canonical source is the trs-brand-voice skill. Compact restatement so the
// function is self-contained; if the skill changes, change this too and run
// /brand-review on whatever the page starts saying.
const SYSTEM = `You write the branch reads on Tara Rose Ladies Salon's internal Branch Performance dashboard. The readers are the founder, the operations manager and the branch Style Directors.

Voice: warm, real, expert, confident, personal. British English. Plain nouns, short sentences. No exclamation marks, no hype, no cheerleading, no corporate filler ("leverage", "utilise", "journey", "unlock", "double down"). Never congratulate and never scold — say what the figures mean and what to do next. This is an internal management page, not marketing.

The rule that overrides everything else: every figure you write must come from the FACTS block, either exactly as given or rounded from it. Do not calculate new figures, do not estimate, do not infer a number that is not there. If a sentence needs a number you were not given, write the sentence without it.

Three further rules, in order of importance:

1. NAME NO PEOPLE. You are given no staff names and must invent none. The page prints the owner beside your action itself. Write the action as an instruction to the branch, never to a person.

2. GROWTH NEEDS ITS CONTEXT. Where a branch's take is down, say what else moved with it before you call it a problem: a fall in clients on a rising average bill is a traffic story, not a pricing one, and both windows cover the same number of days on a near-identical roster. Where every branch moved the same way, say that — a group-wide movement is a season or a market, and coaching one branch for it is how a manager loses a floor's trust.

3. ONE ACTION, and it must be doable inside a fortnight by the people already on that floor. Not "review the pricing strategy". Something that happens at the chair, at the desk, or in the book.

Write about what the numbers mean, not what they are — the reader can see every figure in the cards beside your text.`;

// ── OUTPUT SHAPE ────────────────────────────────────────────
const BRANCH_SHAPE = {
  type: "object",
  properties: {
    working: {
      type: "object",
      properties: {
        heading: { type: "string", description: "Five words at most. What this branch is genuinely good at." },
        body:    { type: "string", description: "Two or three sentences. The strength, and why it matters." },
      },
      required: ["heading", "body"],
      additionalProperties: false,
    },
    watch: {
      type: "object",
      properties: {
        heading: { type: "string", description: "Five words at most. The one thing most worth fixing." },
        body:    { type: "string", description: "Two or three sentences. What is off, against what, and what it is costing. Carry the growth context from rule 2." },
      },
      required: ["heading", "body"],
      additionalProperties: false,
    },
    action: {
      type: "object",
      properties: {
        do:    { type: "string", description: "One instruction to the branch. Doable in a fortnight, at the chair, the desk or the book. Name nobody." },
        check: { type: "string", description: "How we would know next period whether it worked. One sentence, observable, no new figures." },
      },
      required: ["do", "check"],
      additionalProperties: false,
    },
  },
  required: ["working", "watch", "action"],
  additionalProperties: false,
};

// The branch keys are fixed rather than dynamic: additionalProperties:false plus a
// named property per branch is what stops the model returning a fifth salon.
const SCHEMA = {
  type: "object",
  properties: {
    group: {
      type: "object",
      properties: {
        heading: { type: "string", description: "Five words at most. What the four branches together say about this period." },
        body:    { type: "string", description: "Two or three sentences across the group. Say plainly if the movement is group-wide." },
      },
      required: ["heading", "body"],
      additionalProperties: false,
    },
    SAA: BRANCH_SHAPE,
    KCA: BRANCH_SHAPE,
    MC:  BRANCH_SHAPE,
    AQ:  BRANCH_SHAPE,
  },
  required: ["group", "SAA", "KCA", "MC", "AQ"],
  additionalProperties: false,
};

// ── THE NUMBER GUARD ────────────────────────────────────────
// Identical to pulse-narrative's, and deliberately so: one guard, one behaviour,
// one place to fix. For each supplied fact we allow the raw value, honest roundings
// (0/1/2 dp) and the same value in thousands or millions, so "AED 1.95m" and "763k"
// pass while a figure that is not in the data does not.
//
// Negative growth arrives as a negative number and the model writes it as "down
// 18.1%", so the absolute value has to be allowed too — otherwise every true
// sentence about a fall is rejected.
function allowedNumbers(facts: Record<string, unknown>, labels: Record<string, unknown>): number[] {
  const out = new Set<number>();
  const push = (n: number) => { if (Number.isFinite(n)) out.add(Number(n.toFixed(4))); };

  for (const v of Object.values(facts)) {
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    for (const base of [v, Math.abs(v)]) {
      for (const scale of [1, 1e-3, 1e-6]) {
        const x = base * scale;
        push(x);
        for (const dp of [0, 1, 2]) push(Number(x.toFixed(dp)));
      }
    }
  }
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

// A staff name in the copy is a harder failure than a wrong number: the action is
// read as an instruction to a named person who never agreed to it. The page sends
// the roster it is about to print so this can check the model did not reach for one.
function checkNames(copy: unknown, names: string[]): string[] {
  if (!names.length) return [];
  const found = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === "string") {
      for (const n of names) {
        if (n.length < 3) continue;
        if (new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(v)) found.add(n);
      }
    } else if (v && typeof v === "object") {
      Object.values(v as Record<string, unknown>).forEach(walk);
    }
  };
  walk(copy);
  return [...found];
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Stable stringify — key order must not change the hash, or every page load looks
// like a new set of numbers and regenerates.
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
  // A 204 must carry no body — JSON.stringify into a 204 throws in Deno, the
  // preflight fails, and CORS then blocks the dashboard's real POST. Same trap
  // pulse-narrative documents; built by hand rather than through json().
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let payload: {
    period_key?: string;
    facts?: Record<string, unknown>;
    labels?: Record<string, unknown>;
    staff_names?: string[];
    force?: boolean;
  };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }

  const periodKey = String(payload.period_key ?? "").trim();
  const facts  = payload.facts ?? {};
  const labels = payload.labels ?? {};
  const names  = Array.isArray(payload.staff_names) ? payload.staff_names.map(String) : [];
  if (!periodKey) return json({ error: "period_key is required" }, 400);
  if (!Object.keys(facts).length) return json({ error: "facts is required" }, 400);

  // `force` spends money, so it needs the admin secret. Everything else is
  // read-through-cache: a normal caller only triggers a generation by presenting
  // figures we have not seen before.
  const isAdmin = req.headers.get("x-pulse-admin") === Deno.env.get("PULSE_ADMIN_SECRET");
  const force = payload.force === true && isAdmin;

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const factsHash = await sha256(canonical({ ...facts, ...labels }));

  if (!force) {
    const { data: hit } = await sb
      .from("branch_narrative")
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
    `Write the read for each of the four branches, and the group line above them. ` +
    `Currency is AED throughout. "Net take" means everything the salon billed before staff cost — ` +
    `use that phrase, never "money in" or "revenue". Percentages suffixed _pct are percentages; ` +
    `a movement in a percentage is stated in points, never as a percentage of a percentage. ` +
    `Keys are the four branches: SAA Saadiyat, KCA Khalifa City, MC Motor City (hair only, no beauty ` +
    `figures exist for it), AQ AQ Ladies.`;

  let lastBad: string[] = [];
  let lastNames: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const corrections: string[] = [];
    if (lastBad.length) {
      corrections.push(
        `That draft contained figures that are not in the FACTS block: ${lastBad.join(", ")}. ` +
        `Rewrite using only supplied figures, or drop those sentences.`,
      );
    }
    if (lastNames.length) {
      corrections.push(
        `That draft named staff: ${lastNames.join(", ")}. Name nobody — write the action as an ` +
        `instruction to the branch. The page prints the owner itself.`,
      );
    }

    let res;
    try {
      res = await anthropic.beta.messages.create({
        model: MODEL,
        max_tokens: 8000,
        // Server-side fallback on by default: if a safety classifier declines the
        // request, the API re-serves it on the recommended model inside this call
        // rather than handing back a refusal.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: SYSTEM,
        output_config: { format: { type: "json_schema", schema: SCHEMA }, effort: "high" },
        messages: [
          { role: "user", content: userTurn },
          ...(corrections.length
            ? [
                { role: "assistant" as const, content: "(previous attempt)" },
                { role: "user" as const, content: corrections.join("\n\n") },
              ]
            : []),
        ],
      });
    } catch (e) {
      console.error("[branch] API call failed", e);
      return json({ copy: null, error: "generation failed" }, 502);
    }

    // Opus 5 can decline outright — check before reading content.
    if (res.stop_reason === "refusal") {
      console.error("[branch] refused", res.stop_details);
      return json({ copy: null, error: "refused" }, 502);
    }

    const text = res.content.find((b: { type: string }) => b.type === "text");
    if (!text || !("text" in text)) return json({ copy: null, error: "no text block" }, 502);

    let copy: unknown;
    try {
      copy = JSON.parse((text as { text: string }).text);
    } catch {
      console.error("[branch] unparseable output");
      continue;
    }

    const bad = checkNumbers(copy, allowed);
    const named = checkNames(copy, names);
    if (bad.length || named.length) {
      console.warn(`[branch] attempt ${attempt + 1} rejected —`,
        bad.length ? `unsupported figures: ${bad.join(", ")}` : "",
        named.length ? `named staff: ${named.join(", ")}` : "");
      lastBad = bad;
      lastNames = named;
      continue;
    }

    await sb.from("branch_narrative").upsert(
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

  // Both attempts failed validation. Say so plainly and let the page keep the
  // rules-written copy — a wrong figure, or a named stylist, on a page the founder
  // reads is worse than plainer prose.
  console.error("[branch] giving up after 2 attempts", { lastBad, lastNames });
  return json(
    { copy: null, error: "validation failed", unsupported_figures: lastBad, named_staff: lastNames },
    422,
  );
});
