// ============================================================
// TARA ROSE LADIES SALON: QR short link redirect
// supabase/functions/qr-go/index.ts   (Kate, 26 Nov 2026, from the meeting with David)
// ============================================================
//
// WHAT IT DOES
//   A short QR code holds https://go.trk-salon-os.com/<slug>. This function takes the slug, asks the database
//   (qr_go, migrations/qr_short_links.sql) where that code goes now, counts the scan, and sends the phone there
//   with a 302. The link behind a printed card can change any time; the card never has to be reprinted.
//
// WHAT IT KEEPS
//   One row per scan: time, kind of phone (ios / android / desktop / other), bot or not. No IP, no name.
//   A link preview made by WhatsApp, Slack, Google and the like is marked bot and is not counted.
//
// UNKNOWN OR REMOVED SLUG
//   The phone lands on https://tararosesalon.com instead of an error page.
//
// DEPLOY (public on purpose, a phone has no login)
//   supabase functions deploy qr-go --no-verify-jwt --project-ref gvijxenafoowajqktqvd
//
// THE SHORT ADDRESS (set up 26 Nov 2026, Cloudflare, zone trk-salon-os.com)
//   DNS: an A record  go  ->  192.0.2.1  (a placeholder), Proxied (orange cloud). Only this subdomain is proxied: the dashboard's own
//        records (@ and www, GitHub Pages) stay DNS only, because proxying them breaks GitHub's certificate renewal.
//   Rules > Redirect Rules > "QR short links":  Wildcard pattern  https://go.trk-salon-os.com/*
//        Target  https://gvijxenafoowajqktqvd.supabase.co/functions/v1/qr-go/${1}   status 302 (never 301, a browser would remember it)
//   Test: open go.trk-salon-os.com/<slug> on a phone. The picture of a short code is drawn by qr/index.html from the saved slug.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FALLBACK = "https://tararosesalon.com";
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|slack|discord|skype|headless|curl|wget|python|axios|node-fetch|go-http|monitor|uptime/i;

function device(ua: string): string {
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/android/i.test(ua)) return "android";
  if (/windows|macintosh|linux|cros/i.test(ua)) return "desktop";
  return "other";
}

function go(to: string): Response {
  // 302, never cached: a changed destination has to work on the next scan.
  return new Response(null, { status: 302, headers: { Location: to, "Cache-Control": "no-store, max-age=0", "Referrer-Policy": "no-referrer" } });
}

Deno.serve(async (req) => {
  if (req.method !== "GET" && req.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
  const slug = (new URL(req.url).pathname.split("/").filter(Boolean).pop() || "").toLowerCase();
  if (!/^[a-z0-9]{4,12}$/.test(slug) || slug === "qr-go") return go(FALLBACK);

  const ua = req.headers.get("user-agent") || "";
  // A HEAD request only checks the link; it is not a scan.
  const bot = req.method === "HEAD" || BOT.test(ua) || ua === "";
  try {
    const sb = createClient(SUPA_URL, SERVICE, { auth: { persistSession: false } });
    const { data, error } = await sb.rpc("qr_go", { p_slug: slug, p_device: device(ua), p_bot: bot });
    if (error) { console.error("qr_go", error.message); return go(FALLBACK); }
    return go(typeof data === "string" && /^https?:\/\//i.test(data) ? data : FALLBACK);
  } catch (e) {
    console.error("qr-go", e);
    return go(FALLBACK);
  }
});
