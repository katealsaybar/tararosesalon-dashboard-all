// The complaint alert email (Kate, 22 Oct 2026: "gawa ka na ng format ng email"). Table layout and inline styles so it holds up in Gmail,
// Outlook and on a phone; the wordmark is the dashboard's own image. No client phone numbers and no marketing, only what the team needs to follow
// the complaint up. British English, no dashes in the copy. Used by index.ts; also loaded by hand to preview the layout.

const SITE = "https://trk-salon-os.com/?view=complaintlog";
const LOGO = "https://trk-salon-os.com/assets/mast-ink.png";

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

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const day = (iso: unknown) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "";
};
const when = (iso: unknown) => {
  const d = new Date(String(iso || ""));
  return isNaN(d.getTime()) ? "" : d.toLocaleString("en-GB", { timeZone: "Asia/Dubai", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
};

export function renderEmail(c: any, first: string) {
  const branch = BRANCH[c.branch_code] || c.branch_code || "";
  const kind = TYPE[c.complaint_type] || c.complaint_type || "";
  const open = c.status === "open";
  const by = c.submitted_by || "A team member";
  const outcome = open ? "Still open, waiting on a follow-up" : (RES[c.resolution] || c.resolution || "") + (c.resolution_detail ? ": " + c.resolution_detail : "");
  const logged = when(c.submitted_at);
  const subject = `Complaint logged at ${branch}: ${c.client_name}${open ? " (still open)" : ""}`;
  const rows: [string, string][] = [
    ["Client", c.client_name], ["Branch", branch], ["Visit", day(c.event_date)], ["Stylist", c.stylists || ""], ["Service", c.services || ""],
    ["About", kind], ["Outcome", outcome],
  ].filter(([, v]) => v) as [string, string][];
  const hi = first ? `Hi ${first},` : "Hi,";

  const text = [
    `${hi}`, "", `${by} logged a complaint at ${branch}${logged ? " (" + logged + ")" : ""}.${open ? " It is still open." : ""}`, "",
    ...rows.map(([k, v]) => `${k}: ${v}`), "", "What happened:", c.detail || "",
    ...(c.google_url ? ["", `Google review: ${c.google_url}`] : []),
    "", `Follow it up here: ${SITE}`, "",
    "This is an automatic alert, so there is no need to reply. Add your follow-up on the dashboard.",
  ].join("\n");

  const pill = open
    ? `<span style="display:inline-block;padding:4px 12px;border-radius:999px;background:#fdecd2;color:#8a5a00;font-size:12px;font-weight:700;letter-spacing:.04em">STILL OPEN</span>`
    : `<span style="display:inline-block;padding:4px 12px;border-radius:999px;background:#dff3e6;color:#1f6b3a;font-size:12px;font-weight:700;letter-spacing:.04em">RESOLVED</span>`;

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f4f1ec">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f4f1ec">${esc(by)} logged a complaint at ${esc(branch)}. Open it to follow it up.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ec"><tr><td align="center" style="padding:24px 12px">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;font-family:Arial,Helvetica,sans-serif;color:#23252f">
  <tr><td style="padding:0 4px 14px"><img src="${LOGO}" alt="Tara Rose Salons" height="34" style="display:block;height:34px;width:auto;border:0"></td></tr>
  <tr><td style="background:#ffffff;border-radius:14px;padding:26px 26px 22px">
    <p style="margin:0 0 6px;font-size:13px;color:#7a7d89;letter-spacing:.08em;text-transform:uppercase">New complaint</p>
    <h1 style="margin:0 0 10px;font-size:22px;line-height:1.3;font-weight:700;color:#23252f">${esc(branch)}: ${esc(c.client_name)}</h1>
    <p style="margin:0 0 18px">${pill}</p>
    <p style="margin:0 0 18px;font-size:15px;line-height:1.55">${esc(hi)}<br>${esc(by)} logged this${logged ? " at " + esc(logged) : ""}. Here is what was written down.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;line-height:1.5">
      ${rows.map(([k, v]) => `<tr><td style="padding:7px 14px 7px 0;color:#7a7d89;vertical-align:top;white-space:nowrap;border-top:1px solid #eee9e1">${esc(k)}</td><td style="padding:7px 0;vertical-align:top;border-top:1px solid #eee9e1;color:#23252f">${esc(v)}</td></tr>`).join("")}
    </table>
    <p style="margin:18px 0 6px;font-size:13px;color:#7a7d89;letter-spacing:.08em;text-transform:uppercase">What happened</p>
    <div style="margin:0 0 18px;padding:12px 14px;background:#f8f6f2;border-left:3px solid #7fe3cf;border-radius:6px;font-size:15px;line-height:1.55;white-space:pre-wrap">${esc(c.detail || "")}</div>
    ${c.google_url ? `<p style="margin:0 0 18px;font-size:14px"><a href="${esc(c.google_url)}" style="color:#1a6b5c">The Google review the client posted</a></p>` : ""}
    <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#23252f;border-radius:999px"><a href="${SITE}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none">Open it on the dashboard</a></td></tr></table>
    <p style="margin:14px 0 0;font-size:13px;line-height:1.5;color:#7a7d89">Add your follow-up there, and mark it resolved with how it ended.</p>
  </td></tr>
  <tr><td style="padding:14px 6px 0;font-size:12px;line-height:1.5;color:#8a8d98">This is an automatic alert from the Tara Rose dashboard, so there is no need to reply. You are getting it because you help check client complaints.</td></tr>
 </table>
</td></tr></table></body></html>`;

  return { subject, text, html };
}
