// ============================================================
// TARA ROSE LADIES SALON: Out of Stock, which colour products the booked colour services will possibly use
// supabase/functions/oos-products/index.ts   (Kate, 26 Nov 2026: "gamitan nga natin to ng API anthropic
// para makapag decide sya which possible products shall be used")
// ============================================================
//
// WHAT IT DECIDES
//   For one salon, for each KIND of colour service (Roots, Foils, Toner and gloss, Balayage and ombre,
//   All over and other colour, Bleach), which of that salon's colour products in the Weekly Product Plan
//   are likely to be used, with a rough share and a one-line reason.
//
// WHAT IT IS NOT
//   Not a measured recipe. Phorest does not record which client a tube was used on, and the usage report
//   is a storeroom list. This is Claude's estimate from product names, and the page says so.
//
// WHAT IT SEES
//   Only the six service kinds and this salon's colour product names (brand, category, product). The list is
//   read HERE from oos_plan() with the caller's own sign-in, never taken from the browser. No client names,
//   no contact data, no figures.
//
// WHO CAN CALL IT
//   Anyone oos_access() lets in (old Level 2 and up, or a spend viewer), checked with the caller's own token.
//   Everyone else gets 403. The model is fixed here, never taken from the caller.
//
// COST
//   One call per salon when the product list changes, then it is read from the table oos_product_ai
//   (salon + hash of the product list). A click on the page is not a call unless the list is new.
//
// Same ANTHROPIC_API_KEY secret as dashboard-ask, perf-coach and pulse-narrative.
// Deploy:  supabase functions deploy oos-products --project-ref gvijxenafoowajqktqvd
// Table:   migrations/out_of_stock_product_ai.sql
// No em-dashes in anything the model writes.

import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

const MODEL = "claude-sonnet-5-5";
const SALONS = ["KCA", "SAA", "MC", "AQ"];
const KINDS = ["Roots", "Foils", "Toner and gloss", "Balayage and ombre", "All over and other colour", "Bleach"];
// the plan categories the page scales by the colour factor (js/out-of-stock.js COLC)
const COLC = ["igora vibrance", "igora royal", "igora zero amm", "igora color 10", "blondme", "vario", "color expert"];
const MAX_PER_KIND = 14;

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SYSTEM = `You help the stock buyer of Tara Rose Salons, a hair and beauty salon group in the UAE. Colour services are booked for next week. You decide which colour products from the salon's own product list will possibly be used for each kind of colour service.

The six kinds of colour service:
- Roots: root colour, hairline, root stretch, face frame. Regrowth colour on the roots.
- Foils: full, half, partial and three quarter foils, with lightener, often followed by a toner.
- Toner and gloss: classic toner, creative toning, gloss. Semi or demi permanent colour, usually after lightening.
- Balayage and ombre: hand painted lightening, balayage, transformation, refresh.
- All over and other colour: all over colour, colour with a gloss, colour remover and mixed colour jobs.
- Bleach: full head bleach and bleached roots.

Use what you know about the brands in the list (for example Schwarzkopf Igora Royal permanent colour, Igora Vibrance demi permanent, BlondMe lightener and bond products, Vario Blond, Igora Zero Amm ammonia free, Igora Color 10 fast colour, developers and activators by percentage). Shades are written as number codes such as 7-0 or 9,5-5. Developers and activators are used with the tubes; the strength depends on the job.

Rules.
1. Use ONLY the ids in the LIST. Never invent a product, an id or a brand.
2. For each kind, give up to ${MAX_PER_KIND} products, the most likely first. Leave a kind with fewer products, or none, if the list does not have a good fit. Do not pad.
3. share is a whole number, your rough share of that kind's colour product use. The shares of one kind add up to about 100.
4. why is one short line, under 12 words, plain British English. No em dashes.
5. This is an estimate from product names only. You do not know which client or which shade was used.`;

const SCHEMA = {
  type: "object",
  properties: {
    kinds: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: KINDS },
          products: {
            type: "array",
            items: {
              type: "object",
              properties: { id: { type: "string" }, share: { type: "integer" }, why: { type: "string" } },
              required: ["id", "share", "why"], additionalProperties: false,
            },
          },
        },
        required: ["kind", "products"], additionalProperties: false,
      },
    },
  },
  required: ["kinds"], additionalProperties: false,
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
function friendly(error: unknown) {
  const status = statusOf(error), msg = String((error as { message?: string })?.message ?? "");
  if (/credit balance/i.test(msg)) return { error: "Claude is resting: the salon's AI account has run out of credit. Tell Kate.", status: 503 };
  if (status === 429 || status === 529) return { error: "Claude is busy. Try again in a moment.", status: 503 };
  if (status === 401 || status === 403) return { error: "Claude cannot sign in. Tell Kate the API key needs checking.", status: 500 };
  return { error: "Something went wrong. The plan's colour products are still listed.", status: 500 };
}
const norm = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const noDash = (s: string) => s.replace(/\s*[—–]\s*/g, ", ");

Deno.serve(async (req: Request) => {
  const CORS = cors(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, CORS, 405);
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "Claude is not set up yet. Tell Kate the ANTHROPIC_API_KEY secret is missing." }, CORS, 500);

  let body: { salon?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid JSON body" }, CORS, 400); }
  const salon = String(body.salon ?? "").toUpperCase();
  if (!SALONS.includes(salon)) return json({ error: "salon must be KCA, SAA, MC or AQ" }, CORS, 400);

  // the caller's own token: the same gate as the page (oos_access), and the product list comes from the plan, not from the browser
  const auth = req.headers.get("authorization") || "";
  if (!/^Bearer\s+\S+/i.test(auth)) return json({ error: "Sign in first." }, CORS, 401);
  const user = createClient(SUPA_URL, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const acc = await user.rpc("oos_access");
  if (acc.error || !acc.data || acc.data.view !== true) return json({ error: "This is for coordinators and above." }, CORS, 403);
  const plan = await user.rpc("oos_plan");
  if (plan.error || !plan.data || plan.data.denied) return json({ error: "This is for coordinators and above." }, CORS, 403);

  // [row_key, branch, category, product, type, null, null, priority, min, max, cost, null, null, in stock, null, null, brand, supplier]
  const rows: any[] = (plan.data.rows || []).filter((r: any[]) => r[1] === salon && COLC.includes(norm(r[2])) && Number(r[8]) > 0);
  rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  if (!rows.length) return json({ salon, kinds: [], model: MODEL, cached: false, note: "No colour product in the plan for this salon." }, CORS);
  const list = rows.map((r, i) => ({ id: "p" + (i + 1), key: String(r[0]), brand: String(r[16] ?? ""), category: String(r[2] ?? ""), product: String(r[3] ?? "").replace(/\s+/g, " ").trim() }));
  const byId = new Map(list.map((p) => [p.id, p]));
  const hash = await sha256(salon + "|" + MODEL + "|" + list.map((p) => p.key).join("\n"));

  const sb = createClient(SUPA_URL, SERVICE, { auth: { persistSession: false } });
  const hit = await sb.from("oos_product_ai").select("result, model, created_at").eq("salon", salon).eq("list_hash", hash).maybeSingle();
  if (hit.data) return json({ salon, kinds: hit.data.result?.kinds ?? [], model: hit.data.model, cached: true, generated_at: hit.data.created_at }, CORS);

  const anthropic = new Anthropic({ apiKey });
  let out: any;
  let usage: any = null;
  try {
    const res = await anthropic.messages.create({
      model: MODEL, max_tokens: 6000,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: "user", content: "LIST (id | brand | category | product)\n" + list.map((p) => `${p.id} | ${p.brand} | ${p.category} | ${p.product}`).join("\n") + "\n\nDecide the products for each of the six kinds of colour service." }],
    } as any);
    const text = (res.content as any[]).find((b) => b.type === "text")?.text;
    out = JSON.parse(text);
    usage = res.usage;
  } catch (e) {
    console.error("[oos-products]", e);
    const f = friendly(e); return json({ error: f.error }, CORS, f.status);
  }

  // validate: only ids we sent, no repeats, no invented kinds, clean text
  const kinds = KINDS.map((kind) => {
    const k = (out?.kinds || []).find((x: any) => x?.kind === kind);
    const seen = new Set<string>();
    const products = ((k?.products || []) as any[]).filter((p) => p && byId.has(String(p.id)) && !seen.has(String(p.id)) && seen.add(String(p.id)))
      .slice(0, MAX_PER_KIND)
      .map((p) => ({ key: byId.get(String(p.id))!.key, share: Math.max(0, Math.min(100, Math.round(Number(p.share) || 0))), why: noDash(String(p.why ?? "").slice(0, 140)) }));
    return { kind, products };
  });

  const result = { kinds };
  await sb.from("oos_product_ai").upsert({ salon, list_hash: hash, model: MODEL, result, input_tokens: usage?.input_tokens ?? null, output_tokens: usage?.output_tokens ?? null }, { onConflict: "salon,list_hash" });
  return json({ salon, kinds, model: MODEL, cached: false, generated_at: new Date().toISOString() }, CORS);
});
