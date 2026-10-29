// ============================================================
// TARA ROSE LADIES SALON — Complaint notify
// supabase/functions/complaint-notify/index.ts
// ============================================================
//
// Kate, 22 Oct 2026: when a complaint is logged on the Client Complaints page, the people who check it get an email.
// Kate, 28 Oct 2026: no Twilio. The text goes out as a WhatsApp message from respond.io only, from the call centre spare number
// (channel 569496, "WhatsApp Brand Account (Backup nr)"), through the respond.io Developer API.
// Called by public.complaint_notify(), which the client_complaints insert trigger runs (only for a complaint logged from the page),
// and which can be run by hand to send one again. complaint_notify_test(recipient id) sends a test to one recipient.
//
// The caller must send the vault secret 'complaint_hook_secret' (checked by complaint_hook_ok(), service role only).
// Recipients come from complaint_notify_recipients; every attempt is written to complaint_notify_log. A channel whose secrets are not
// set is logged as skipped, not failed.
//
// Secrets (Supabase, Edge Functions, Secrets): NOTIFY_SMTP_USER and NOTIFY_SMTP_PASS (Gmail App Password; Supabase blocks 587 so it is
// 465); RESPOND_TOKEN (already set, respond.io Developer API); optional RESPOND_COMPLAINT_CHANNEL (default 569496) and
// RESPOND_COMPLAINT_TEMPLATE (the approved WhatsApp template name, e.g. complaint_alert; language en).
// The WhatsApp message carries no client name: branch, kind, status, who logged it and the link only.
//
// The WhatsApp template (create it in respond.io, Settings > Channels > the spare number > Message Templates, category Utility, English):
//   Hi {{1}}, a client complaint was logged at {{2}} by {{3}}. Type: {{4}}. Status: {{5}}. Link: {{6}}. Please check it today.
// Alerts are business-initiated and staff are usually outside the 24 hour window, so a template is needed. Until RESPOND_COMPLAINT_TEMPLATE
// names an approved one, the function tries plain text instead (works only inside the 24 hour window) and logs a failure if it is refused.
//
// Deploy: supabase functions deploy complaint-notify --no-verify-jwt --project-ref gvijxenafoowajqktqvd

import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";
import { renderEmail } from "./email.ts";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
// The link opens the complaint's own record on Log a Complaint (cid = complaint id; no client details travel in the address).
const SITE = "https://trk-salon-os.com/?view=complaintlog";
const SMTP_USER = Deno.env.get("NOTIFY_SMTP_USER") || "";
const SMTP_PASS = Deno.env.get("NOTIFY_SMTP_PASS") || "";
const RESPOND_TOKEN = Deno.env.get("RESPOND_TOKEN") || "";
const RESPOND_CHANNEL = Number(Deno.env.get("RESPOND_COMPLAINT_CHANNEL") || "569496");
const RESPOND_TEMPLATE = Deno.env.get("RESPOND_COMPLAINT_TEMPLATE") || "";
const RESPOND_API = "https://api.respond.io/v2";
// Must match the approved template word for word: respond.io needs the full body text beside the parameters, or the message arrives as an empty bubble.
const TEMPLATE_BODY = "Hi {{1}}, a client complaint was logged at {{2}} by {{3}}. Type: {{4}}. Status: {{5}}. Link: {{6}}. Please check it today.";

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

type Rec = { id: number; name: string; email: string | null; phone: string | null; email_on: boolean; wa_on: boolean; branch_code: string | null; away: boolean; escalate_to: number | null };
type Alert = { branch: string; by: string; kind: string; status: string; link: string };

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

async function respond(path: string, method: string, body: unknown) {
  const res = await fetch(RESPOND_API + path, {
    method,
    headers: { Authorization: "Bearer " + RESPOND_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`respond.io ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res;
}

// The number: the one on the recipient row, otherwise the one in staff_phones for the same email (read with the service role; the table is Level 5 only).
async function phoneFor(r: Rec): Promise<string | null> {
  if (r.phone) return r.phone;
  if (!r.email) return null;
  const { data } = await sb.from("staff_phones").select("phone").ilike("email", r.email).maybeSingle();
  return (data && data.phone) || null;
}

// WhatsApp through respond.io, from the spare call centre number. The contact is created only if the phone is not in respond.io yet
// (an existing contact is never renamed).
async function sendWhatsApp(r: Rec, phone: string, a: Alert) {
  const who = "phone:" + phoneE164(phone);
  const first = String(r.name || "").split(/\s+/)[0] || "team";
  const known = await fetch(RESPOND_API + "/contact/" + encodeURIComponent(who), { headers: { Authorization: "Bearer " + RESPOND_TOKEN } });
  if (known.status === 404) await respond("/contact/create_or_update/" + encodeURIComponent(who), "POST", { firstName: first });
  else if (!known.ok) throw new Error(`respond.io ${known.status}: ${(await known.text()).slice(0, 300)}`);
  const params = [first, a.branch, a.by, a.kind, a.status, a.link].map((text) => ({ type: "text", text }));
  const template = {
    type: "whatsapp_template",
    template: { name: RESPOND_TEMPLATE, languageCode: "en", components: [{ type: "body", text: TEMPLATE_BODY, parameters: params }] },
  };
  const plain = { type: "text", text: `Tara Rose: a complaint was logged at ${a.branch} by ${a.by} (${a.kind}, ${a.status}). ${a.link}` };
  await respond("/contact/" + encodeURIComponent(who) + "/message", "POST", {
    channelId: RESPOND_CHANNEL,
    message: RESPOND_TEMPLATE ? template : plain,
  });
}

// respond.io accepts a message and fails it afterwards (for example "Messaging window has been closed" when plain text goes outside the 24 hour
// window), so a 200 is not delivery. Look at the newest message to this phone a few seconds later and treat a failed status as a failure.
async function checkDelivery(phone: string) {
  await new Promise((res) => setTimeout(res, 4000));
  const who = encodeURIComponent("phone:" + phoneE164(phone));
  const c = await fetch(RESPOND_API + "/contact/" + who, { headers: { Authorization: "Bearer " + RESPOND_TOKEN } });
  if (!c.ok) return;
  const id = (await c.json()).id;
  const m = await fetch(RESPOND_API + "/contact/id:" + id + "/message/list?limit=1", { headers: { Authorization: "Bearer " + RESPOND_TOKEN } });
  if (!m.ok) return;
  const list = await m.json();
  const last = (list.items || list.data || [])[0];
  const failed = last && last.traffic === "outgoing" && (last.status || []).find((s: any) => s.value === "failed");
  if (failed) throw new Error("not delivered: " + String(failed.message || "failed"));
}

async function deliver(r: Rec, complaintId: number | null, subject: string, text: string, html: string, a: Alert) {
  const out: string[] = [];
  if (r.email_on && r.email) {
    if (!SMTP_USER || !SMTP_PASS) { await log(complaintId, r.name, "email", "skipped", "NOTIFY_SMTP_USER / NOTIFY_SMTP_PASS not set"); out.push("email skipped"); }
    else {
      try { await sendEmail(r.email, subject, text, html); await log(complaintId, r.name, "email", "sent"); out.push("email sent"); }
      catch (e) { await log(complaintId, r.name, "email", "failed", String((e as Error).message || e)); out.push("email failed"); }
    }
  }
  const phone = r.wa_on ? await phoneFor(r) : null;
  if (r.wa_on && !phone) { await log(complaintId, r.name, "whatsapp", "skipped", "no phone number on file"); out.push("whatsapp skipped"); }
  if (r.wa_on && phone) {
    if (!RESPOND_TOKEN) { await log(complaintId, r.name, "whatsapp", "skipped", "RESPOND_TOKEN not set"); out.push("whatsapp skipped"); }
    else {
      try { await sendWhatsApp(r, phone, a); await checkDelivery(phone); await log(complaintId, r.name, "whatsapp", "sent"); out.push("whatsapp sent"); }
      catch (e) { await log(complaintId, r.name, "whatsapp", "failed", String((e as Error).message || e)); out.push("whatsapp failed"); }
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
      const res = await deliver(r as Rec, null, "Test: Tara Rose complaint alerts", msg, `<p>${esc(msg)}</p>`,
        { branch: "Test branch", by: "Test", kind: "Test", status: "test only", link: SITE });
      return json({ test: true, ...res });
    }

    const id = Number(body.complaint_id);
    const { data: c } = await sb.from("client_complaints")
      .select("id, client_name, branch_code, event_date, stylists, services, complaint_type, detail, resolution, resolution_detail, status, submitted_by, submitted_at, google_url")
      .eq("id", id).maybeSingle();
    if (!c) return json({ error: "no such complaint" }, 404);
    // everyone with no branch set, plus the people set to this complaint's branch
    const { data: all } = await sb.from("complaint_notify_recipients").select("*").eq("active", true).order("id");
    const matched = (all || []).filter((r: Rec) => !r.branch_code || r.branch_code === c.branch_code);
    // Escalation (Kate's note, 29 Oct 2026): someone marked away (away = true) is skipped and the alert goes to their named next person
    // (escalate_to, e.g. Coach Emma to Mette) instead, once, even if that person is already on the list.
    const recs: Rec[] = [];
    const seen = new Set<number>();
    for (const r of matched as Rec[]) {
      let t: Rec | undefined = r;
      if (r.away) {
        t = r.escalate_to ? (all as Rec[]).find((x) => x.id === r.escalate_to) : undefined;
        await log(id, r.name, "escalation", t ? "sent" : "skipped", t ? `away, passed to ${t.name}` : "away and nobody to pass it to");
      }
      if (t && !seen.has(t.id)) { seen.add(t.id); recs.push(t); }
    }
    if (!recs.length) { await log(id, "(nobody)", "none", "skipped", "no recipients set up"); return json({ sent: 0, note: "no recipients" }); }

    const branch = BRANCH[c.branch_code] || c.branch_code || "";
    const kind = TYPE[c.complaint_type] || c.complaint_type || "";
    const open = c.status === "open";
    const by = c.submitted_by || "A team member";
    const alert: Alert = { branch, by, kind, status: open ? "still open" : "resolved", link: `${SITE}&cid=${id}` };

    const results = [];
    for (const r of recs) {
      const em = renderEmail(c, String(r.name || "").split(/\s+/)[0]);
      results.push(await deliver(r, id, em.subject, em.text, em.html, alert));
    }
    return json({ complaint: id, results });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
