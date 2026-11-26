// ============================================================
// TARA ROSE LADIES SALON: Out of Stock, the DBD order email as a Gmail DRAFT with DBD's own order forms attached
// supabase/functions/oos-dbd-draft/index.ts   (Kate, 26 Nov 2026: "autofill dapat haha. gamitin mo order form pa rin nila tho" and "no need downloading
// not unless needed": the forms are filled and attached by the system, nobody downloads and attaches anything by hand.)
// ============================================================
//
// WHAT IT DOES
//   1. asks the function oos-order-forms (same caller, same sign-in) to fill DBD's own order forms with the order's lines
//   2. builds the email (To, Cc, subject, body as the page worked them out) with those xlsx files attached
//   3. saves it as a DRAFT in the info@ mailbox through the Gmail API (users.drafts.create) and returns the link that opens that draft
//   It never sends: a person reads the draft and presses Send. If something cannot be done it says so and the page falls back to the old way.
//
// WHO CAN CALL IT
//   Anyone oos_access() lets in AND who may edit the Weekly Product Plan (oos_order_edits_get can_edit), checked with the caller's own token.
//   Recipients are limited to dbdholding.com, tararosesalon.com and ate Tine's work Gmail (a test goes to the person signed in): a draft cannot be addressed anywhere else.
//
// ONE-TIME SET UP (needs Kate): scripts/get-info-gmail-token.py signs in AS info@tararosesalon.com once with the scope gmail.compose (create drafts; the
//   function never sends) and saves a refresh token on that computer. Its value goes in Supabase, project gvijxenafoowajqktqvd, Edge Functions, Secrets,
//   as INFO_GMAIL_REFRESH_TOKEN. GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are the ones recruit-mail-sync already uses. Until the secret exists the answer is
//   { ok: false, notSetUp: true } and nothing else happens.
//
// Deploy: supabase functions deploy oos-dbd-draft --project-ref gvijxenafoowajqktqvd

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SALONS = ["KCA", "SAA", "MC", "AQ"];
const FROM = "info@tararosesalon.com";
const OK_ADDR = /@(dbdholding\.com|tararosesalon\.com)$|^cristine\.tararose@gmail\.com$/i;

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

const env = (...names: string[]) => { for (const n of names) { const v = Deno.env.get(n); if (v) return v; } return ""; };
const b64url = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const utf8b64 = (s: string) => { const b = new TextEncoder().encode(s); let bin = ""; for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(bin); };
const wrap76 = (s: string) => s.replace(/(.{76})/g, "$1\r\n");
const hdrWord = (s: string) => /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${utf8b64(s)}?=`;

Deno.serve(async (req: Request) => {
  const CORS = cors(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, CORS, 405);
  let body: { salon?: string; items?: unknown[]; to?: string[]; cc?: string[]; subject?: string; body?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid JSON body" }, CORS, 400); }
  const salon = String(body.salon ?? "").toUpperCase();
  if (!SALONS.includes(salon)) return json({ error: "salon must be KCA, SAA, MC or AQ" }, CORS, 400);
  const to = (body.to || []).map((x) => String(x).trim()).filter(Boolean), cc = (body.cc || []).map((x) => String(x).trim()).filter(Boolean);
  if (!to.length || [...to, ...cc].some((a) => !OK_ADDR.test(a))) return json({ error: "Those addresses are not allowed for a draft." }, CORS, 400);
  const subject = String(body.subject ?? "").slice(0, 300), text = String(body.body ?? "").slice(0, 20000);
  if (!subject || !text) return json({ error: "subject and body are needed" }, CORS, 400);

  const auth = req.headers.get("authorization") || "";
  if (!/^Bearer\s+\S+/i.test(auth)) return json({ error: "Sign in first." }, CORS, 401);
  const user = createClient(SUPA_URL, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const acc = await user.rpc("oos_access");
  if (acc.error || !acc.data || acc.data.view !== true) return json({ error: "This is for coordinators and above." }, CORS, 403);
  const ed = await user.rpc("oos_order_edits_get");
  if (ed.error || !ed.data || ed.data.can_edit !== true) return json({ error: "Only people who may edit the Weekly Product Plan can make this draft." }, CORS, 403);

  // is the one-time set up done?
  const refresh = env("INFO_GMAIL_REFRESH_TOKEN");
  if (!refresh || !env("GOOGLE_CLIENT_ID") || !env("GOOGLE_CLIENT_SECRET")) return json({ ok: false, notSetUp: true }, CORS);

  // 1. DBD's own forms, filled
  const fr = await fetch(`${SUPA_URL}/functions/v1/oos-order-forms`, { method: "POST", headers: { Authorization: auth, apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ salon, items: body.items || [] }) });
  const fj = await fr.json().catch(() => null);
  if (!fr.ok || !fj || !Array.isArray(fj.files)) return json({ ok: false, error: (fj && fj.error) || "The DBD forms could not be filled." }, CORS);
  if (!fj.files.length) return json({ ok: false, error: "No DBD order form holds these products, so there is nothing to attach.", notFound: fj.notFound || [] }, CORS);

  // 2. the email
  const bnd = "=_trs_" + crypto.randomUUID().replace(/-/g, "");
  const parts: string[] = [
    `From: Tara Rose Salon <${FROM}>`, `To: ${to.join(", ")}`, ...(cc.length ? [`Cc: ${cc.join(", ")}`] : []), `Subject: ${hdrWord(subject)}`,
    "MIME-Version: 1.0", `Content-Type: multipart/mixed; boundary="${bnd}"`, "",
    `--${bnd}`, 'Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", wrap76(utf8b64(text)),
  ];
  for (const f of fj.files) {
    const nm = String(f.name).replace(/[^\x20-\x7e]/g, "-").replace(/"/g, "'");
    parts.push(`--${bnd}`, `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet; name="${nm}"`, `Content-Disposition: attachment; filename="${nm}"`, "Content-Transfer-Encoding: base64", "", wrap76(String(f.b64)));
  }
  parts.push(`--${bnd}--`, "");
  const raw = b64url(parts.join("\r\n").replace(/[Ā-￿]/g, "?"));   // the body and the names are already base64 or ASCII; this only guards stray characters in the headers

  // 3. a draft in info@
  const tk = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env("GOOGLE_CLIENT_ID"), client_secret: env("GOOGLE_CLIENT_SECRET"), refresh_token: refresh, grant_type: "refresh_token" }) });
  const tj = await tk.json().catch(() => null);
  if (!tk.ok || !tj?.access_token) { console.error("[oos-dbd-draft] token refused", tk.status, tj?.error); return json({ ok: false, error: "Google did not accept the info@ permission. It may need to be set up again." }, CORS); }
  const dr = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", { method: "POST", headers: { Authorization: "Bearer " + tj.access_token, "content-type": "application/json" }, body: JSON.stringify({ message: { raw } }) });
  const dj = await dr.json().catch(() => null);
  if (!dr.ok || !dj?.message?.id) { console.error("[oos-dbd-draft] draft refused", dr.status, JSON.stringify(dj?.error || {}).slice(0, 300)); return json({ ok: false, error: "Gmail did not accept the draft." }, CORS); }
  console.log("[oos-dbd-draft]", salon, "forms", fj.files.length, "not found", (fj.notFound || []).length);
  return json({ ok: true, draftId: dj.id, messageId: dj.message.id, url: `https://mail.google.com/mail/?authuser=${encodeURIComponent(FROM)}#drafts?compose=${dj.message.id}`, forms: fj.files.map((f: any) => ({ name: f.name, products: f.products })), notFound: fj.notFound || [] }, CORS);
});
