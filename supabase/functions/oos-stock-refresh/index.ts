// ============================================================
// TARA ROSE LADIES SALON: Out of Stock, "Refresh stock now"
// supabase/functions/oos-stock-refresh/index.ts   (Kate, 26 Nov 2026: the shelf figure is read once a day, so it can be hours old when
// the order is placed; "bantayan lang tlga na tama". Go to a button that reads a salon straight from Phorest.)
// ============================================================
//
// WHAT IT DOES
//   For each salon asked for (KCA, SAA, MC, AQ), reads that salon's products from Phorest's third-party API
//   (GET /branch/{id}/product, 200 a page, about 5 calls and 15 seconds for a salon) and hands the stock, min and max to the database function
//   oos_stock_apply(), which puts them into today's stock_levels snapshot IN PLACE. Only in_stock, min_stock, max_stock and loaded_at change; the
//   brand, category, cost and price the daily PDF sync wrote stay. See migrations/out_of_stock_stock_apply.sql for how a row is matched.
//
// WHO CAN CALL IT
//   Anyone oos_access() lets in (old Level 2 and up, or a spend viewer), checked with the caller's own token. Everyone else gets 403.
//   Writing happens with the service role, only through oos_stock_apply (revoked from every other role).
//
// LIMITS (so a click cannot hammer Phorest)
//   A salon read less than 30 seconds ago (any source) is not read again: the answer says so.
//   A read that returns fewer than 70% of the products the Stock List holds for that salon is refused and writes nothing.
//   Archived products are skipped. Nothing is ever deleted.
//
// Secrets (already on the project, same as appointments-sync): PHOREST_UAE_USERNAME, PHOREST_UAE_PASSWORD, PHOREST_UAE_BUSINESS_ID
// (the shorter _USER / _PASS and the older PHOREST_API_* names are also read). Never returned or logged.
// Deploy: supabase functions deploy oos-stock-refresh --project-ref gvijxenafoowajqktqvd

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BRANCHES: Record<string, string> = { AQ: "3lBkqsMGyr2ipZCvxCuZfg", KCA: "iH0_oL3aKdXSnwOn19V0_w", MC: "jK2EFWbtnJ_D2Fkg4Grd_w", SAA: "oesxmNtsJYVoUCjv1Arp7g" };
const COOLDOWN_S = 30;
const MIN_SHARE = 0.7;

const env = (...names: string[]) => { for (const n of names) { const v = Deno.env.get(n); if (v) return v; } return ""; };
const USER = env("PHOREST_UAE_USERNAME", "PHOREST_UAE_USER", "PHOREST_API_USER");
const PASS = env("PHOREST_UAE_PASSWORD", "PHOREST_UAE_PASS", "PHOREST_API_PASS");
const BID = env("PHOREST_UAE_BUSINESS_ID", "PHOREST_BUSINESS_ID");
const BASE = `https://platform.phorest.com/third-party-api-server/api/business/${BID}`;
const AUTH = "Basic " + btoa(`${USER}:${PASS}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

async function phorest(path: string): Promise<any> {
  let last = 0;
  for (let i = 0; i < 4; i++) {
    const r = await fetch(BASE + path, { headers: { Authorization: AUTH, Accept: "application/json" } });
    if (r.ok) return await r.json();
    last = r.status;
    if ([429, 500, 502, 503, 504].includes(r.status) && i < 3) { await sleep(1500 * (i + 1)); continue; }
    break;
  }
  throw new Error(`Phorest answered ${last}`);
}

async function readSalon(code: string): Promise<any[]> {
  const items: any[] = [];
  for (let p = 0; p < 40; p++) {
    const d = await phorest(`/branch/${BRANCHES[code]}/product?size=200&page=${p}`);
    for (const x of d?._embedded?.products || []) {
      if (x.archived) continue;
      items.push({ bc: x.barcode ?? "", nm: x.name ?? "", cat: x.categoryName ?? "", q: x.quantityInStock, mn: x.minQuantity, mx: x.maxQuantity });
    }
    if (p + 1 >= (d?.page?.totalPages || 0)) break;
  }
  return items;
}

Deno.serve(async (req: Request) => {
  const CORS = cors(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, CORS, 405);
  if (!USER || !PASS || !BID) return json({ error: "Phorest is not set up on this project. Tell Kate." }, CORS, 500);

  let body: { salons?: unknown };
  try { body = await req.json(); } catch { return json({ error: "invalid JSON body" }, CORS, 400); }
  const want = Array.isArray(body.salons) ? body.salons.map((s) => String(s).toUpperCase()) : [];
  const salons = [...new Set(want)].filter((s) => s in BRANCHES);
  if (!salons.length) return json({ error: "salons must be KCA, SAA, MC or AQ" }, CORS, 400);

  const auth = req.headers.get("authorization") || "";
  if (!/^Bearer\s+\S+/i.test(auth)) return json({ error: "Sign in first." }, CORS, 401);
  const user = createClient(SUPA_URL, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const acc = await user.rpc("oos_access");
  if (acc.error || !acc.data || acc.data.view !== true) return json({ error: "This is for coordinators and above." }, CORS, 403);

  const sb = createClient(SUPA_URL, SERVICE, { auth: { persistSession: false } });
  const t0 = Date.now();

  const one = async (code: string) => {
    try {
      // the newest snapshot of the salon: how many rows it holds, and when it was last written
      const last = await sb.from("stock_levels").select("as_of, loaded_at").eq("branch", code).order("as_of", { ascending: false }).order("loaded_at", { ascending: false }).limit(1);
      if (last.error || !last.data?.length) return { salon: code, ok: false, error: "No Stock List snapshot for this salon yet." };
      const ageS = (Date.now() - new Date(last.data[0].loaded_at).getTime()) / 1000;
      if (ageS < COOLDOWN_S) return { salon: code, ok: true, skipped: true, note: "Read less than 30 seconds ago.", at: last.data[0].loaded_at };
      const cnt = await sb.from("stock_levels").select("id", { count: "exact", head: true }).eq("branch", code).eq("as_of", last.data[0].as_of);
      const rows = cnt.count ?? 0;
      const items = await readSalon(code);
      if (rows > 0 && items.length < rows * MIN_SHARE) return { salon: code, ok: false, error: `Phorest returned only ${items.length} products (the Stock List holds ${rows}). Nothing was changed.` };
      const res = await sb.rpc("oos_stock_apply", { p_branch: code, p_items: items, p_dry: false });
      if (res.error) { console.error("[oos-stock-refresh] apply failed", code, res.error.message); return { salon: code, ok: false, error: "The figures could not be saved. Nothing was changed." }; }
      const r = res.data || {};
      console.log("[oos-stock-refresh]", code, "phorest", r.phorest_products, "matched", r.matched, "changed", r.changed, "not matched", r.not_matched);
      return { salon: code, ok: true, phorest_products: r.phorest_products, matched: r.matched, changed: r.changed, not_matched: r.not_matched, at: new Date().toISOString() };
    } catch (e) {
      console.error("[oos-stock-refresh]", code, String((e as Error)?.message || e));
      return { salon: code, ok: false, error: "Phorest did not answer. Try again in a moment." };
    }
  };

  const results = await Promise.all(salons.map(one));
  return json({ results, took_ms: Date.now() - t0 }, CORS);
});
