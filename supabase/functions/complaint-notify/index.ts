// ============================================================
// TARA ROSE LADIES SALON — Complaint notify
// supabase/functions/complaint-notify/index.ts
// ============================================================
//
// Kate, 22 Oct 2026: when a complaint is logged on the Client Complaints page, Mette and Emma Coach get an email and a text.
// Called by public.complaint_notify(), which the client_complaints insert trigger runs (only for a complaint logged from the page),
// and which can be run by hand to send one again. complaint_notify_test(recipient id) sends a test to one recipient.
//
// The caller must send the vault secret 'complaint_hook_secret' (checked by complaint_hook_ok(), service role only).
// Recipients come from complaint_notify_recipients; every attempt is written to complaint_notify_log. A channel whose secrets are not
// set is logged as skipped, not failed.
//
// Secrets (Supabase, Edge Functions, Secrets): NOTIFY_SMTP_USER and NOTIFY_SMTP_PASS (Gmail App Password; Supabase blocks 587 so it is
// 465), TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM (number, alphanumeric sender id or a Messaging Service SID starting MG).
// The text carries no client name: branch, kind, status, who logged it and the link only.
//
// Deploy: supabase functions deploy complaint-notify --no-verify-jwt --project-ref gvijxenafoowajqktqvd

import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const SITE = "https://trk-salon-os.com/?view=complaints";
const SMTP_USER = Deno.env.get("NOTIFY_SMTP_USER") || "";
const SMTP_PASS = Deno.env.get("NOTIFY_SMTP_PASS") || "";
const TW_SID = Deno.env.get("TWILIO_ACCOUNT_SID") || "";
const TW_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") || "";
const TW_FROM = Deno.env.get("TWILIO_FROM") || "";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

const BRANCH: Record<string, string> = { SAA: "Saadiyat", KCA: "Khalifa City A", MC: "Motor City", AQ: "Al Quoz", BAH: "Bahrain" };
const TYPE: Record<string, string> = {
  colour_result: "Colour result", nail_service: "Nail service", treatment_result: "Treatment result", cut_result: "Cut result",
  price_or_billing: "Price or billing", booking_or_admin: "Booking or admin", wait_or_time: "Wait or time", staff_attitude: "Staff attitude",
  skin_reaction_or_injury: "Skin reaction or injury", facility_or_parking: "Facility or parking", product: "Product", other: "Other",
};
const RES: Record<string, string> = {
  free_redo: "Free redo", refund: "Refund", discount_or_credit: "Discount or credit", free_service_or_product: "Free service or product",
  adjusted_same_visit: "Fixed during the visit", apology_or_explanation: "Talked through", escalated_followup: "Escalated, follow-up",
  client_lost_or_cancelled: "Client cancelled or left", no_action_noted: "No outcome written",
};

type Rec = { id: number; name: string; email: string | null; phone: string | null; email_on: boolean; sms_on: boolean };

const log = (complaint_id: number | null, recipient: string, channel: string, status: string, error?: string) =>
  sb.from("complaint_notify_log").insert({ complaint_id, recipient, channel, status, error: error ? error.slice(0, 500) : null });

// +971..., 00971..., 05XXXXXXXX (UAE national format) all end up as +971...
function phoneE164(raw: string): string {
  const d = raw.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) return d;
  if (d.startsWith("00")) return "+" + d.slice(2);
  if (d.startsWith("0")) return "+971" + d.slice(1);
  return "+" + d;
}

let transport: ReturnType<typeof nodemailer.createTransport> | null = null;
async function sendEmail(to: string, subject: string, text: string, html: string) {
  transport ||= nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: SMTP_USER, pass: SMTP_PASS } });
  await transport.sendMail({ from: { name: "Tara Rose Salons", address: SMTP_USER }, to, subject, text, html });
}

async function sendText(to: string, body: string) {
  const form = new URLSearchParams({ To: phoneE164(to), Body: body });
  if (TW_FROM.startsWith("MG")) form.set("MessagingServiceSid", TW_FROM); else form.set("From", TW_FROM);
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TW_SID}/Messages.json`, {
    method: "POST",
    headers: { Authorization: "Basic " + btoa(`${TW_SID}:${TW_TOKEN}`), "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

async function deliver(r: Rec, complaintId: number | null, subject: string, text: string, html: string, sms: string) {
  const out: string[] = [];
  if (r.email_on && r.email) {
    if (!SMTP_USER || !SMTP_PASS) { await log(complaintId, r.name, "email", "skipped", "NOTIFY_SMTP_USER / NOTIFY_SMTP_PASS not set"); out.push("email skipped"); }
    else {
      try { await sendEmail(r.email, subject, text, html); await log(complaintId, r.name, "email", "sent"); out.push("email sent"); }
      catch (e) { await log(complaintId, r.name, "email", "failed", String((e as Error).message || e)); out.push("email failed"); }
    }
  }
  if (r.sms_on && r.phone) {
    if (!TW_SID || !TW_TOKEN || !TW_FROM) { await log(complaintId, r.name, "sms", "skipped", "Twilio secrets not set"); out.push("sms skipped"); }
    else {
      try { await sendText(r.phone, sms); await log(complaintId, r.name, "sms", "sent"); out.push("sms sent"); }
      catch (e) { await log(complaintId, r.name, "sms", "failed", String((e as Error).message || e)); out.push("sms failed"); }
    }
  }
  return { recipient: r.name, result: out };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    const body = await req.json();
    const ok = await sb.rpc("complaint_hook_ok", { p_secret: String(body.secret || "") });
    if (ok.error || ok.data !== true) return json({ error: "not allowed" }, 401);

    // a test to one recipient
    if (body.test) {
      const { data: r } = await sb.from("complaint_notify_recipients").select("*").eq("id", Number(body.recipient_id)).maybeSingle();
      if (!r) return json({ error: "no such recipient" }, 400);
      const msg = "This is a test of the Tara Rose complaint alerts. If you can read it, you will get a message like this when a complaint is logged.";
      const res = await deliver(r as Rec, null, "Test: Tara Rose complaint alerts", msg, `<p>${esc(msg)}</p>`, msg);
      return json({ test: true, ...res });
    }

    const id = Number(body.complaint_id);
    const { data: c } = await sb.from("client_complaints")
      .select("id, client_name, branch_code, event_date, stylists, services, complaint_type, detail, resolution, resolution_detail, status, submitted_by, google_url")
      .eq("id", id).maybeSingle();
    if (!c) return json({ error: "no such complaint" }, 404);
    const { data: recs } = await sb.from("complaint_notify_recipients").select("*").eq("active", true).order("id");
    if (!recs || !recs.length) { await log(id, "(nobody)", "none", "skipped", "no recipients set up"); return json({ sent: 0, note: "no recipients" }); }

    const branch = BRANCH[c.branch_code] || c.branch_code || "";
    const kind = TYPE[c.complaint_type] || c.complaint_type || "";
    const open = c.status === "open";
    const outcome = open ? "Still open" : (RES[c.resolution] || c.resolution || "") + (c.resolution_detail ? `: ${c.resolution_detail}` : "");
    const by = c.submitted_by || "A team member";
    const subject = `Complaint logged at ${branch}: ${c.client_name}${open ? " (open)" : ""}`;
    const rows: [string, string][] = [
      ["Client", c.client_name], ["Branch", branch], ["Visit date", String(c.event_date || "")], ["Stylist", c.stylists || ""],
      ["Service", c.services || ""], ["About", kind], ["What happened", c.detail || ""], ["Outcome", outcome], ["Logged by", by],
      ["Google review", c.google_url || ""],
    ];
    const text = rows.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\n") + `\n\nOpen it: ${SITE}`;
    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222"><p><b>${esc(by)}</b> logged a complaint${open ? " that is still open" : ""}.</p>
      <table style="border-collapse:collapse">${rows.filter(([, v]) => v).map(([k, v]) =>
        `<tr><td style="padding:3px 14px 3px 0;color:#777;vertical-align:top">${esc(k)}</td><td style="padding:3px 0">${esc(v)}</td></tr>`).join("")}</table>
      <p><a href="${SITE}">Open it on the dashboard</a> to follow it up and mark it resolved.</p></div>`;
    const sms = `Tara Rose: a complaint was logged at ${branch} by ${by} (${kind}${open ? ", still open" : ", resolved"}). ${SITE}`;

    const results = [];
    for (const r of recs as Rec[]) results.push(await deliver(r, id, subject, text, html, sms));
    return json({ complaint: id, results });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
