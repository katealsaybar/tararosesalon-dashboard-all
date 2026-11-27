// ============================================================
// TARA ROSE LADIES SALON: Out of Stock, the DBD order email as a Gmail DRAFT with DBD's own order forms attached
// supabase/functions/oos-dbd-draft/index.ts   (Kate, 26 Nov 2026: "autofill dapat haha. gamitin mo order form pa rin nila tho" and "no need downloading
// not unless needed": the forms are filled and attached by the system, nobody downloads and attaches anything by hand.)
// ============================================================
//
// WHAT IT DOES
//   1. asks the function oos-order-forms (same caller, same sign-in) to fill DBD's own order forms with the order's lines
//   2. builds the email (To, Cc, subject, body as the page worked them out, then the exact info@ signature as HTML and text) with those xlsx files attached
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
// The info@ signature, copied exactly from a real order that went out of info@ (info@ Sent, 26 Nov 2026, read with the Gmail API: the block Gmail puts in after the name).
// A draft made through the API does not get the Gmail signature by itself, so it is added here. If the signature is ever changed in Gmail, copy it again from a sent message.
const SIG_HTML = "<div><div dir=\"ltr\" class=\"gmail_signature\" data-smartmail=\"gmail_signature\"><div dir=\"ltr\"><div><p dir=\"ltr\" style=\"line-height:1.656;margin-top:0pt;margin-bottom:0pt\"><br></p></div><div><p dir=\"ltr\" style=\"line-height:1.38;margin-top:0pt;margin-bottom:0pt\"><span style=\"font-size:8.5pt;font-family:Arial;color:rgb(28,27,22);vertical-align:baseline\">\u00a0 \u00a0 \u00a0 \u00a0 \u00a0\u00a0<img width=\"96\" height=\"29\" src=\"https://ci3.googleusercontent.com/mail-sig/AIorK4zhEXVm7PLalJEhVf4JDo46bG3tFjok7Lu6O64jyuldvDv4UmhWpe9Yw1Hslvi-0SYOjO9V-hmRjlNx\" style=\"color:rgb(3,3,3);font-family:arial,sans-serif;font-size:12.96px\"></span></p><table cellpadding=\"0\" cellspacing=\"0\" style=\"font-stretch:normal;line-height:normal;font-size:initial;color:rgb(3,3,3)\"><tbody><tr><td style=\"vertical-align:top\"><table cellpadding=\"0\" cellspacing=\"0\" style=\"font-stretch:normal;font-size:14.4px;line-height:normal\"><tbody><tr><td><table cellpadding=\"0\" cellspacing=\"0\" style=\"font-stretch:normal;font-size:12.96px;line-height:normal\"><tbody><tr><td style=\"padding:0px 5px 0px 0px\"><font face=\"arial, sans-serif\"><img src=\"https://img.newoldstamp.com/t/8/w.png\" style=\"display:inline-block;vertical-align:middle\">\u00a0<a href=\"http://tararosesalon.com/en/ae/\" style=\"font-size:1em;color:rgb(3,3,3)\" target=\"_blank\">tararosesalon.com/en/ae/</a><span style=\"font-size:14.4px;white-space:nowrap\"><b><br></b></span></font></td><td><font face=\"arial, sans-serif\">\u00a0</font></td></tr></tbody></table></td></tr><tr><td style=\"font-stretch:normal;font-size:12.96px;line-height:normal;border-bottom:2px solid rgb(3,3,3);padding:0px 0px 3px\"></td></tr><tr><td style=\"font-stretch:normal;line-height:normal;padding:3px 0px 0px\"><font face=\"arial, sans-serif\" style=\"font-size:12.96px\"><span style=\"color:rgb(28,27,22);font-size:11.3333px\">Tara Rose Ladies Salon</span></font></td></tr></tbody></table></td></tr></tbody></table><p dir=\"ltr\" style=\"line-height:1.38;margin-top:0pt;margin-bottom:0pt\"><span style=\"color:rgb(28,27,22);font-family:Arial;font-size:8.5pt\">Khalifa City A | Saadiyat | Motor City | Al Quoz</span></p><p dir=\"ltr\" style=\"line-height:1.38;margin-top:0pt;margin-bottom:0pt\"><span style=\"font-size:11.3333px;color:rgb(28,27,22);font-family:Arial\">\ud83d\udcbb\u00a0\u00a0<i>Click</i></span><i><b style=\"font-size:11.3333px;color:rgb(28,27,22);font-family:Arial\">\u00a0<a href=\"https://wa.me/971524960903\" target=\"_blank\">here</a></b><span style=\"font-size:11.3333px;color:rgb(28,27,22);font-family:Arial\">\u00a0to book your appointment</span></i></p><p dir=\"ltr\" style=\"line-height:1.38;margin-top:0pt;margin-bottom:0pt\"><font size=\"1\" style=\"color:rgb(3,3,3)\">We&#39;re hiring across Dubai &amp; Abu Dhabi \u2192\u00a0<a href=\"http://tararosesalon.com/careers\" target=\"_blank\">tararosesalon.com/careers</a></font></p></div></div></div></div>";
const SIG_TEXT = "\r\n\r\n\r\n tararosesalon.com/en/ae/\r\n\r\nTara Rose Ladies Salon\r\n\r\nKhalifa City A | Saadiyat | Motor City | Al Quoz\r\n\r\n\ud83d\udcbb  *Click** here <https://wa.me/971524960903> to book your appointment*\r\n\r\nWe're hiring across Dubai & Abu Dhabi \u2192 tararosesalon.com/careers";
const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// the body the way Gmail writes one: a div per line, an empty line is <div><br></div>, the signature after the last line
const htmlOf = (text: string) => '<div dir="ltr">' + text.split(/\r?\n/).map((l) => l === "" ? "<div><br></div>" : `<div>${escHtml(l)}</div>`).join("") + SIG_HTML + "</div>";
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
  const alt = "=_trs_alt_" + crypto.randomUUID().replace(/-/g, "");
  const parts: string[] = [
    `From: Tara Rose Salon <${FROM}>`, `To: ${to.join(", ")}`, ...(cc.length ? [`Cc: ${cc.join(", ")}`] : []), `Subject: ${hdrWord(subject)}`,
    "MIME-Version: 1.0", `Content-Type: multipart/mixed; boundary="${bnd}"`, "",
    `--${bnd}`, `Content-Type: multipart/alternative; boundary="${alt}"`, "",
    `--${alt}`, 'Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", wrap76(utf8b64(text + SIG_TEXT)),
    `--${alt}`, 'Content-Type: text/html; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", wrap76(utf8b64(htmlOf(text))),
    `--${alt}--`,
  ];
  for (const f of fj.files) {
    const nm = String(f.name).replace(/[^\x20-\x7e]/g, "-").replace(/"/g, "'");
    parts.push(`--${bnd}`, `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet; name="${nm}"`, `Content-Disposition: attachment; filename="${nm}"`, "Content-Transfer-Encoding: base64", "", wrap76(String(f.b64)));
  }
  parts.push(`--${bnd}--`, "");
  const raw = b64url(parts.join("\r\n").replace(/[\u0100-\uffff]/g, "?"));   // the body and the names are already base64 or ASCII; this only guards stray characters in the headers

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
