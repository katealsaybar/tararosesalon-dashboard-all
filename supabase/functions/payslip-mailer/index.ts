// ============================================================
// TARA ROSE LADIES SALON — Payslip mailer
// supabase/functions/payslip-mailer/index.ts
// ============================================================
//
// The monthly payslip email, sent from the site (Kate, 5 Oct 2026). Replaces the
// Staff Payslips Apps Script: same email (payslip PDF, win, top tip, "See my
// month" link), sent from payroll@tararosesalon.com over Gmail SMTP, so copies
// sit in payroll@'s Sent folder and replies come back there.
//
// THE MONTH (Kate + Jumera, 5 Oct 2026: usually the 4th or 5th, the 3rd or 6th
// around a weekend, "depende sa pera", so never a fixed day)
//   Accounts upload the payslips (Upload Portal → Payslips tab) and pick the date
//   and time they go out. payroll@ gets a note, Kate copied. Every 10 minutes the
//   schedule checks; when the time comes, everyone with a payslip and an email who
//   hasn't had theirs gets it, and a note follows.
//   Any time: test, cancel the time, or send the ready ones now.
//
// Who is on the roster: every active perf_staff (hair and beauty team) plus the assistants and reception team in payslip_staff
// (assistants 19 Oct 2026, reception 21 Oct 2026). They get the payslip only: no win, no tip, no "See my month" link.
//
// Welcome email (Kate, 19 Oct 2026): `welcome` emails the hair and beauty team who have not signed in yet and have not had it, asking them to
// sign in once to their own page; `welcome` + test + staff sends one to payroll@ only. Recorded in staff_welcome_sends. The payslip email
// now sends people through the sign-in too, and carries their Podium Race place (perf_podium_me).
//
// Actions (POST JSON):
//   status | test | schedule | unschedule | send | revised | welcome   key = payroll or leader key
//                          (perf_admins), the same check as the payslips function
//   due                    secret = vault 'payslip_cron_secret'
//                          (pg_cron, migrations/payslip_mailer.sql)
//
// Revised payslip (Kate, 19 Oct 2026): `revised` + staff + what ("what changed", one line) emails the person the payslip now
// stored for the month with the standard "we've updated your payslip" note, from payroll@, and records it in payslip_revisions.
// Only for someone who already had the original email. `test: true` sends it to payroll@ only, marked [TEST], nothing recorded.
// Accounts replace the PDF first (the portal does both in one press).
//
// Secrets (Supabase → Edge Functions → Secrets): SMTP_USER = payroll@tararosesalon.com,
// SMTP_PASS = that account's Google App Password. Supabase blocks port 587, so it's 465.
//
// Six kinds of email (Kate, 30 Oct 2026): stylists, beauticians, salon coordinators, the call centre team, reception and assistants. The hair and beauty
// team (perf_staff) get the payslip, their month target from the Target Calculator (perf_dashboard.month_target), the win and tip, the Podium place and the
// sign-in. The others (payslip_staff) get the payslip only. The `preview` action returns any of the six exactly as it would be sent, with example numbers,
// for the Upload Portal's Email preview tab; it sends nothing.
// The October 2026 send also carries a welcome (WELCOME_MONTHS): the hair and beauty team are asked to sign in to see everything on their own page, and the
// others to sign in to Team Home.
//
// Deploy: supabase functions deploy payslip-mailer --no-verify-jwt --project-ref gvijxenafoowajqktqvd

import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";
import { Buffer } from "node:buffer";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const SMTP_USER = Deno.env.get("SMTP_USER") || "payroll@tararosesalon.com";
const SMTP_PASS = Deno.env.get("SMTP_PASS") || "";
const FROM_NAME = "Tara Rose Salons Accounts";
const REPLY_TO = "payroll@tararosesalon.com, hr.tararose@gmail.com";
const CC_NOTES = "kate@tararosesalon.com";   // copied on the notes to payroll@, never on staff emails
const SITE = "https://trk-salon-os.com/";
const PAGE = "https://trk-salon-os.com/performance/";
// Transparent PNG in a mid warm grey (Kate, 19 Oct 2026: the old logo was a flat white box on dark-mode emails). 4.3:1 on white and on near-black.
const LOGO = "https://trk-salon-os.com/assets/email-logo-tp.png";
const PORTAL = "trk-salon-os.com/upload/";
// The months whose payslip email also welcomes people and asks them to sign in (Kate, 30 Oct 2026: "for October 2026 send tho").
const WELCOME_MONTHS = new Set(["2026-10"]);
// Team Home, for the people who have no My Numbers page: assistants, reception, the call centre team and the salon coordinators.
const HUB_LINK = `${SITE}?next=${encodeURIComponent("/hub/")}`;
const BUDGET_MS = 100_000;   // stop starting new emails here; the rest go on the next run or press
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONTH = /^\d{4}-\d{2}$/;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
class Oops extends Error {}

// ── months ──
const label = (m: string, opts: Intl.DateTimeFormatOptions) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" });
const subject = (m: string) => `Your ${label(m, { month: "long", year: "numeric" })} payslip · Tara Rose`;
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

// ── mail ──
let transport: ReturnType<typeof nodemailer.createTransport> | null = null;
function mailer() {
  if (!SMTP_PASS) throw new Oops("The payroll@ email password isn't saved in Supabase yet. Ask Kate.");
  transport ||= nodemailer.createTransport({
    host: "smtp.gmail.com", port: 465, secure: true, pool: true, maxConnections: 1,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transport;
}
async function mail(o: { to: string; subject: string; html: string; text?: string; cc?: string; pdf?: { name: string; bytes: Uint8Array } | null }) {
  await mailer().sendMail({
    from: { name: FROM_NAME, address: SMTP_USER }, replyTo: REPLY_TO,
    to: o.to, cc: o.cc, subject: o.subject, html: o.html, text: o.text || "See the HTML version.",
    attachments: o.pdf ? [{ filename: o.pdf.name, content: Buffer.from(o.pdf.bytes), contentType: "application/pdf" }] : [],
  });
}
// The "what changed" line reads on from "What changed:", so it starts lower case and ends with a full stop.
function whatLine(raw: unknown) {
  let w = String(raw ?? "").replace(/\s+/g, " ").trim().replace(/[.\s]+$/, "");
  if (w.length < 5) throw new Oops("Write one line on what changed (at least a few words).");
  if (w.length > 400) throw new Oops("Keep what changed to one or two sentences (400 characters).");
  if (/^[A-Z][a-z]/.test(w)) w = w[0].toLowerCase() + w.slice(1);
  return w + ".";
}
const revisedSubject = (m: string) => `Revised: your ${label(m, { month: "long", year: "numeric" })} payslip · Tara Rose`;
async function revisedEmail(p: Person, month: string, what: string) {
  const first = p.name.split(" ")[0], mon = label(month, { month: "long" });
  const text = `Hi ${first},

We've updated your ${mon} payslip. The new one is attached and replaces the one we sent earlier, so please use this one.

`
    + `What changed: ${what}

If anything still looks off, just reply to this email and we'll sort it with you.

Tara Rose Salons Accounts`;
  const html = `<div style="font-family:Arial,sans-serif;color:#5C5557;max-width:560px;line-height:1.5">
    <p>Hi ${esc(first)},</p>
    <p>We've updated your ${esc(mon)} payslip. The new one is attached and replaces the one we sent earlier, so please use this one.</p>
    <p style="margin:14px 0;padding:10px 14px;background:#FAEEDA;border-radius:8px"><b style="color:#BA7517">What changed</b><br>${esc(what)}</p>
    <p>If anything still looks off, just reply to this email and we'll sort it with you.</p>
    <p>Tara Rose Salons Accounts</p>
    <p style="margin-top:22px"><img src="${LOGO}" alt="Tara Rose Salons" width="100" style="display:block;width:100px;height:auto;border:0"></p>
  </div>`;
  if (!p.slip) throw new Oops(`${p.name} has no payslip uploaded for ${mon}.`);
  const { data: blob, error } = await sb.storage.from("payslips").download(p.slip.path);
  if (error || !blob) throw new Oops(`Couldn't read ${p.name}'s payslip file.`);
  const pdf = { name: p.slip.file_name || `${p.name} payslip ${month}.pdf`, bytes: new Uint8Array(await blob.arrayBuffer()) };
  return { html, text, pdf };
}
async function note(subj: string, html: string) {
  await mail({ to: SMTP_USER, cc: CC_NOTES, subject: subj, html: `<div style="font-family:Arial,sans-serif">${html}</div>` });
}
async function log(who: string, what: string) { await sb.from("payslip_mailer_log").insert({ who, what }); }

// ── who gets what ──
// kind 'other' = an assistant or reception team member from payslip_staff (Kate, 19 and 21 Oct 2026): payslip only, no performance page, so no
// token and no numbers.
type Role = "stylist" | "beautician" | "coordinator" | "call_centre" | "reception" | "assistant";
const ROLE_LABEL: Record<Role, string> = {
  stylist: "Stylists", beautician: "Beauticians", coordinator: "Salon coordinators", call_centre: "Call centre team", reception: "Reception", assistant: "Assistants",
};
type Person = { id: string; name: string; branch: string; kind: "stylist" | "other"; role: Role; email: string | null; send_email: boolean; token: string;
  slip: { path: string; file_name: string } | null; sent: { status: string; sent_at: string } | null };

async function people(month: string): Promise<Person[]> {
  const m = `${month}-01`;
  const [{ data: staff, error: e1 }, { data: slips, error: e2 }, { data: sends, error: e3 }, { data: asst, error: e4 }, { data: positions }] = await Promise.all([
    sb.from("perf_staff").select("id, display_name, branch, dept, email, send_email, token").eq("active", true).order("branch").order("display_name"),
    sb.from("payslips").select("staff_id, path, file_name").eq("month", m),
    sb.from("payslip_sends").select("staff_id, status, sent_at").eq("month", m),
    sb.from("payslip_staff").select("id, name, grp, email").eq("active", true).order("grp").order("name"),
    sb.from("kb_positions").select("email, position"),
  ]);
  if (e1 || e2 || e3 || e4) throw e1 || e2 || e3 || e4;
  const slip = Object.fromEntries((slips || []).map((p) => [p.staff_id, p]));
  const sent = Object.fromEntries((sends || []).map((p) => [p.staff_id, p]));
  const positionOf = Object.fromEntries((positions || []).map((x: { email: string | null; position: string | null }) => [String(x.email || "").toLowerCase(), String(x.position || "")]));
  const roleOf = (grp: string, email: string | null): Role => {
    if (grp === "ASST") return "assistant";
    const pos = positionOf[String(email || "").toLowerCase()] || "";
    return /salon coordinator/i.test(pos) ? "coordinator" : /call centre/i.test(pos) ? "call_centre" : "reception";
  };
  const stylists: Person[] = (staff || []).map((s) => ({
    id: s.id, name: s.display_name, branch: s.branch, kind: "stylist" as const, role: (s.dept === "Beauty" ? "beautician" : "stylist") as Role, email: (s.email || "").trim() || null, send_email: !!s.send_email,
    token: s.token, slip: slip[s.id] || null, sent: sent[s.id] || null,
  }));
  const others: Person[] = (asst || []).map((a) => ({
    id: a.id, name: a.name, branch: a.grp, kind: "other" as const, role: roleOf(a.grp, a.email), email: (a.email || "").trim() || null, send_email: true,
    token: "", slip: slip[a.id] || null, sent: sent[a.id] || null,
  }));
  return [...stylists, ...others];
}
function stateOf(p: Person) {
  if (p.sent) return p.sent.status === "sent" ? "sent" : "check";
  if (!p.send_email) return "paused";
  if (!p.email) return "no_email";
  return p.slip ? "ready" : "waiting";
}

// ── the email body (same as the Apps Script's, 30 Sep 2026) ──
// Win + top tip: the AI pair saved for the month (perf_tips) wins; otherwise the
// formula in performance/win-gap.js, fetched from the live site, so the email and
// the page always say the same thing.
let winGapFn: ((d: unknown) => { win?: string; tip?: string; how?: string }) | null = null;
async function winGap(d: unknown) {
  if (!winGapFn) {
    const src = await (await fetch(`${PAGE}win-gap.js?${Date.now()}`)).text();
    const root: Record<string, unknown> = {};
    new Function("window", src)(root);
    winGapFn = root.winGap as typeof winGapFn;
  }
  return winGapFn!(d);
}
async function winTip(d: unknown, token: string, month: string) {
  const { data: ai } = await sb.rpc("perf_tip", { p_token: token, p_month: `${month}-01` });
  if (ai && ai.win && ai.tip) return ai;
  try { return d ? await winGap(d) : null; } catch (_) { return null; }
}
function winTipHtml(wt: { win?: string; tip?: string; how?: string } | null) {
  if (!wt) return "";
  return (wt.win ? `<p style="margin:14px 0 8px;padding:10px 14px;background:#E1F5EE;border-radius:8px"><b style="color:#0F6E56">Your win</b><br>${esc(wt.win)}</p>` : "")
    + (wt.tip ? `<p style="margin:8px 0 14px;padding:10px 14px;background:#FAEEDA;border-radius:8px"><b style="color:#BA7517">Top tip for next month</b><br>${esc(wt.tip)}${wt.how ? `<br><span style="color:#77706A">${esc(wt.how)}</span>` : ""}</p>` : "");
}
type EmailParts = { html: string; text: string };
const aed = (v: number) => "AED " + Math.round(v).toLocaleString("en-GB");
const SIGN_OFF_LOGO = `<p style="margin-top:22px"><img src="${LOGO}" alt="Tara Rose Salons" width="100" style="display:block;width:100px;height:auto;border:0"></p>`;
const CTA = (href: string, text: string) => `<p><a href="${href}" style="display:inline-block;background:#5C5557;color:#F9E8DF;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:700">${esc(text)}</a></p>`;
const WELCOME_BOX = (title: string, body: string) => `<p style="margin:14px 0;padding:10px 14px;background:#E1F5EE;border-radius:8px"><b style="color:#0F6E56">${esc(title)}</b><br>${esc(body)}</p>`;

// What Team Home holds for each role, in plain words, for the welcome. Everyone who is not on the hair and beauty team signs in to Team Home.
const HUB_HAS: Record<string, string> = {
  coordinator: "the guides and SOPs for your role, the price list, the HR forms, and your salon's daily target sheet",
  call_centre: "the call and WhatsApp scripts, booking follow-ups and lead handling, the price list and the HR forms",
  reception: "the front desk guides and scripts, the price list, the client to stylist matching sheet and the HR forms",
  assistant: "your induction and onboarding, the Hair SOPs and the HR forms",
};

// An assistant, reception, call centre or salon coordinator email has no performance page, so it is the payslip, and in a welcome month the sign-in to Team Home.
function plainParts(o: { first: string; mon: string; hasSlip: boolean; role: Role; welcome: boolean }): EmailParts {
  const has = HUB_HAS[o.role] || HUB_HAS.reception;
  const slipLine = o.hasSlip ? `Your ${o.mon} payslip is attached.` : `Your ${o.mon} payslip will follow.`;
  const welcomeBody = `Everything you need for your role is now in one place: ${has}. Please sign in once with this email address: Google, or an email link. This phone or computer remembers you after that.`;
  const html = `<div style="font-family:Arial,sans-serif;color:#5C5557;max-width:560px;line-height:1.5">
    <p>Hi ${esc(o.first)},</p>
    <p>${esc(slipLine)}</p>
    ${o.welcome ? WELCOME_BOX("Welcome to Team Home", welcomeBody) + CTA(HUB_LINK, "Sign in to Team Home") : ""}
    <p>${o.welcome ? "Questions about your payslip, or the sign-in doesn't take?" : "Questions about your payslip?"} Just reply to this email and we'll sort it with you.</p>
    <p>Tara Rose Salons Accounts</p>
    ${SIGN_OFF_LOGO}
  </div>`;
  const text = `Hi ${o.first},

${slipLine}

${o.welcome ? `Welcome to Team Home. ${welcomeBody}
Sign in to Team Home: ${HUB_LINK}

` : ""}${o.welcome ? "Questions about your payslip, or the sign-in doesn't take?" : "Questions about your payslip?"} Just reply to this email and we'll sort it with you.

Tara Rose Salons Accounts`;
  return { html, text };
}
async function loadPdf(p: Person, month: string) {
  if (!p.slip) return null;
  const { data: blob, error } = await sb.storage.from("payslips").download(p.slip.path);
  if (error || !blob) throw new Error(`Couldn't read ${p.name}'s payslip file.`);
  return { name: p.slip.file_name || `${p.name} payslip ${month}.pdf`, bytes: new Uint8Array(await blob.arrayBuffer()) };
}
// "3rd", "21st". Same helper as the staff page's Podium tab.
const ord = (n: number) => { const v = n % 100, t = ["th", "st", "nd", "rd"]; return n + (t[(v - 20) % 10] || t[v] || t[0]); };
// Where she stands on the Podium Race for the month, from the same function her own page uses (perf_podium_me: her own team only, services plus
// retail before VAT). The mailer runs as the service role, which the sign-in lock lets through. Null when she has nothing in the month.
async function podiumLine(token: string, month: string): Promise<{ text: string; first: boolean } | null> {
  try {
    const { data: r } = await sb.rpc("perf_podium_me", { p_token: token, p_month: `${month}-01` });
    if (!r || !r.me || !r.me.rank) return null;
    const team = r.dept === "Beauty" ? "Beauty team" : "Hair team";
    const mn = label(String(r.month).slice(0, 7), { month: "long" });
    const tied = (r.board || []).filter((b: { rank: number }) => b.rank === r.me.rank).length > 1;
    return { text: `${tied ? "Joint " + ord(r.me.rank) : ord(r.me.rank)} of ${r.ranked} on the ${team} for ${mn}.`, first: r.me.rank === 1 };
  } catch (_) { return null; }
}
// The sign-in on the site, which brings her back to her own page (index.html ?next=). Google, or an email link, once.
const signInLink = (token: string, month?: string) => `${SITE}?next=${encodeURIComponent(`/performance/?t=${token}${month ? `&m=${month}` : ""}`)}`;

type StylistOpts = {
  first: string; mon: string; hasSlip: boolean; welcome: boolean; link: string; nextLevel: string | null;
  wt: { win?: string; tip?: string; how?: string } | null; pod: { text: string; first: boolean } | null; target: { target: number; took: number | null } | null;
};
// The hair and beauty team's email: the payslip, her month target (the Target Calculator's, from perf_dashboard.month_target), her win and tip, her Podium place
// and the sign-in to her own page. In a welcome month it opens with the welcome that asks her to sign in to see everything.
function stylistParts(o: StylistOpts): EmailParts {
  const slipLine = o.hasSlip ? `Your ${o.mon} payslip is attached.` : `Here is your ${o.mon} in short. Your payslip will follow.`;
  const podHtml = o.pod ? `<p style="margin:14px 0;padding:10px 14px;background:#FBEAF0;border-radius:8px"><b style="color:#993556">Your Podium Race place</b><br>${esc(o.pod.text)}${o.pod.first ? " Lovely work." : ""}<br><span style="color:#77706A">${o.pod.first ? "The race starts fresh every month." : "A race is a moment, not a verdict, and a new month starts fresh for everyone."}</span></p>` : "";
  let targetLine = "";
  if (o.target) {
    const t = o.target;
    targetLine = t.took !== null
      ? `${aed(t.target)}. You took ${aed(t.took)} in services, ${Math.round((t.took / t.target) * 100)}% of it.${t.took >= t.target ? " You reached it." : ""}`
      : `${aed(t.target)}.`;
  }
  const targetHtml = o.target ? `<p style="margin:14px 0;padding:10px 14px;background:#EAF1FB;border-radius:8px"><b style="color:#185FA5">Your ${esc(o.mon)} target</b><br>${esc(targetLine)}<br><span style="color:#77706A">It is built from your own last three months and the season.</span></p>` : "";
  const next = o.nextLevel ? `, how close you are to ${o.nextLevel}` : "";
  const welcomeBody = `It is private to you and it holds your numbers for the month against your target, your reviews${next}, where you stand on the Podium Race, and your payslip. Please sign in once to see everything: Google, or an email link, with this email address. This phone remembers you after that.`;
  const more = `There is more waiting on your own page: your numbers against your aims, your reviews${next}, and the whole Podium Race for your team.`;
  const moreAsk = `It is private to you, so please sign in once with this email address: Google, or an email link. This phone remembers you after that.`;
  const html = `<div style="font-family:Arial,sans-serif;color:#5C5557;max-width:560px;line-height:1.5">
    <p>Hi ${esc(o.first)},</p>
    <p>${esc(slipLine)}</p>
    ${o.welcome ? WELCOME_BOX("Welcome to your Tara Rose page", welcomeBody) : ""}
    ${targetHtml}
    ${winTipHtml(o.wt)}
    ${podHtml}
    ${o.welcome ? "" : `<p>${esc(more)} ${esc(moreAsk)}</p>`}
    ${CTA(o.link, o.welcome ? "Sign in to my page" : "Sign in to see my month")}
    <p>${o.welcome ? "Questions about your payslip, or the sign-in doesn't take?" : "Questions about your payslip?"} Just reply to this email. Questions about your numbers? Your salon manager can walk you through them.</p>
    <p style="font-size:12px;color:#9a8a87">This link is yours only, so please keep it to yourself.</p>
    ${SIGN_OFF_LOGO}
  </div>`;
  const text = `Hi ${o.first},

${slipLine}

${o.welcome ? `Welcome to your Tara Rose page. ${welcomeBody}

` : ""}${o.target ? `Your ${o.mon} target: ${targetLine} It is built from your own last three months and the season.

` : ""}${o.wt && o.wt.win ? `Your win: ${o.wt.win}

` : ""}${o.wt && o.wt.tip ? `Top tip for next month: ${o.wt.tip}${o.wt.how ? " " + o.wt.how : ""}

` : ""}${o.pod ? `Your Podium Race place: ${o.pod.text}

` : ""}${o.welcome ? "" : `${more} ${moreAsk}
`}${o.welcome ? "Sign in to my page" : "Sign in to see my month"}: ${o.link}

${o.welcome ? "Questions about your payslip, or the sign-in doesn't take?" : "Questions about your payslip?"} Just reply to this email.

Tara Rose Salons Accounts`;
  return { html, text };
}

// The email as it reads, without the payslip PDF: used for the real send (emailFor adds the PDF) and for the preview of a real person.
async function emailParts(p: Person, month: string): Promise<EmailParts> {
  const first = p.name.split(" ")[0], mon = label(month, { month: "long" }), welcome = WELCOME_MONTHS.has(month);
  if (p.kind === "other") return plainParts({ first, mon, hasSlip: !!p.slip, role: p.role, welcome });
  const { data: d } = await sb.rpc("perf_dashboard", { p_token: p.token, p_month: `${month}-01` });
  const hasNumbers = d && d.numbers && (d.numbers.total_revenue || d.numbers.clients);
  const wt = hasNumbers ? await winTip(d, p.token, month) : null;
  const pod = await podiumLine(p.token, month);
  const took = d && d.numbers && Number(d.numbers.total_revenue) > 0 ? Number(d.numbers.total_revenue) : null;
  const target = d && Number(d.month_target) > 0 ? { target: Number(d.month_target), took } : null;
  return stylistParts({ first, mon, hasSlip: !!p.slip, welcome, link: signInLink(p.token, month), nextLevel: d && d.next_level ? String(d.next_level) : null, wt, pod, target });
}
async function emailFor(p: Person, month: string) {
  const e = await emailParts(p, month);
  return { html: e.html, text: e.text, pdf: await loadPdf(p, month) };
}

// The preview for the Upload Portal: one of the six kinds, exactly as it would be sent, with example numbers (or a real person's, when `staff` is given).
function samplePreview(role: Role, month: string): EmailParts {
  const mon = label(month, { month: "long" }), welcome = WELCOME_MONTHS.has(month);
  if (role === "stylist" || role === "beautician") {
    const hair = role === "stylist";
    return stylistParts({
      first: "Sample", mon, hasSlip: true, welcome, link: signInLink("00000000-0000-0000-0000-000000000000", month), nextLevel: hair ? "Senior Stylist" : null,
      wt: {
        win: `You took ${aed(44600)} in services this month, above your target of ${aed(40000)}.`,
        tip: hair
          ? "Rebook 2 more clients a week before they leave. That takes your rebooking from 52% to 60%, worth about AED 1,900 a month."
          : "Rebook 2 more clients a week before they leave. That takes your rebooking from 48% to 55%, worth about AED 1,100 a month.",
        how: hair ? "Before they get up from the chair, suggest the date their hair will need you next and book it with them." : "Before they leave, suggest when their next treatment is due and book it with them.",
      },
      pod: { text: `3rd of 12 on the ${hair ? "Hair" : "Beauty"} team for ${mon}.`, first: false },
      target: { target: 40000, took: 44600 },
    });
  }
  return plainParts({ first: "Sample", mon, hasSlip: true, role, welcome });
}

// ── the welcome email ──
// Sent once to each stylist and beautician who has not signed in yet (Kate, 19 Oct 2026), so the My Numbers sign-in is already in place
// before the lock is switched on. The same private link as the payslip email, through the sign-in.
function welcomeEmail(p: Person) {
  const first = p.name.split(" ")[0], link = signInLink(p.token);
  const line = "It is private to you and it holds your numbers for the month, your reviews, how close you are to your next level, where you stand on the Podium Race, and your payslip.";
  const html = `<div style="font-family:Arial,sans-serif;color:#5C5557;max-width:560px;line-height:1.5">
    <p>Hi ${esc(first)},</p>
    <p>You have your own Tara Rose page. ${esc(line)}</p>
    <p>To keep it yours, please sign in once with this email address: Google, or an email link. This phone (or computer) remembers you after that, so it takes a minute.</p>
    <p><a href="${link}" style="display:inline-block;background:#5C5557;color:#F9E8DF;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:700">Sign in to my page</a></p>
    <p>Stuck, or the sign-in doesn't take? Just reply to this email and we'll sort it with you.</p>
    <p>Tara Rose Salons Accounts</p>
    <p style="margin-top:22px"><img src="${LOGO}" alt="Tara Rose Salons" width="100" style="display:block;width:100px;height:auto;border:0"></p>
  </div>`;
  const text = `Hi ${first},

You have your own Tara Rose page. ${line}

To keep it yours, please sign in once with this email address: Google, or an email link. This phone (or computer) remembers you after that, so it takes a minute.
Sign in to my page: ${link}

Stuck, or the sign-in doesn't take? Just reply to this email and we'll sort it with you.

Tara Rose Salons Accounts`;
  return { html, text };
}
const welcomeSubject = "Welcome to your Tara Rose page";

type WelcomeState = "to_send" | "welcomed" | "signed_in" | "check";
// The hair and beauty team who can be welcomed: active, with an email, and not paused. Anyone who has signed in already is skipped.
async function welcomeRoster(list: Person[]): Promise<{ p: Person; state: WelcomeState }[]> {
  const [{ data: rows }, { data: si }] = await Promise.all([
    sb.from("staff_welcome_sends").select("staff_id, status"),
    sb.rpc("perf_signed_in_emails"),
  ]);
  const signed = new Set(((si || []) as string[]).map((e) => String(e).toLowerCase()));
  const by = Object.fromEntries((rows || []).map((r: { staff_id: string; status: string }) => [r.staff_id, r.status]));
  return list.filter((p) => p.kind === "stylist" && p.send_email && p.email).map((p) => ({
    p,
    state: (signed.has(p.email!.toLowerCase()) ? "signed_in" : by[p.id] ? (by[p.id] === "sent" ? "welcomed" : "check") : "to_send") as WelcomeState,
  }));
}
async function sendWelcome(who: string, t0: number) {
  const sent: string[] = [], failed: string[] = [];
  let left = 0;
  for (const { p, state } of await welcomeRoster(await people(new Date().toISOString().slice(0, 7)))) {
    if (state !== "to_send") continue;
    if (Date.now() - t0 > BUDGET_MS) { left++; continue; }
    const { error: claim } = await sb.from("staff_welcome_sends").insert({ staff_id: p.id, email: p.email, status: "sending", sent_by: who });
    if (claim) continue;   // someone else's press has them
    try {
      const e = welcomeEmail(p);
      await mail({ to: p.email!, subject: welcomeSubject, html: e.html, text: e.text });
      await sb.from("staff_welcome_sends").update({ status: "sent", sent_at: new Date().toISOString() }).eq("staff_id", p.id);
      sent.push(p.name);
    } catch (err) {
      console.error(p.name, err);
      await sb.from("staff_welcome_sends").delete().eq("staff_id", p.id).eq("status", "sending");   // not sent: free them for the next try
      failed.push(p.name);
    }
  }
  return { sent, failed, left };
}
async function welcomeSummary(list: Person[]) {
  try {
    const r = await welcomeRoster(list);
    const n = (st: WelcomeState) => r.filter((x) => x.state === st).length;
    return { eligible: r.length, signed_in: n("signed_in"), welcomed: n("welcomed"), to_send: n("to_send"), check: n("check") };
  } catch (e) { console.error("welcome summary", e); return null; }
}

// ── sending ──
// Everyone ready for the month, until the time budget runs out. Each person is
// claimed ('sending') before their email and marked 'sent' after it, so a second
// run or a second press never emails them twice.
async function sendReady(month: string, who: string, t0: number) {
  const sent: string[] = [], failed: string[] = [];
  let left = 0;
  for (const p of await people(month)) {
    if (stateOf(p) !== "ready") continue;
    if (Date.now() - t0 > BUDGET_MS) { left++; continue; }
    const { error: claim } = await sb.from("payslip_sends").insert({ month: `${month}-01`, staff_id: p.id, email: p.email, status: "sending", sent_by: who });
    if (claim) continue;   // someone else's run has them
    try {
      const e = await emailFor(p, month);
      await mail({ to: p.email!, subject: subject(month), html: e.html, text: e.text, pdf: e.pdf });
      await sb.from("payslip_sends").update({ status: "sent", sent_at: new Date().toISOString() }).eq("month", `${month}-01`).eq("staff_id", p.id);
      sent.push(p.name);
    } catch (err) {
      console.error(p.name, err);
      // Not sent: free them for the next try.
      await sb.from("payslip_sends").delete().eq("month", `${month}-01`).eq("staff_id", p.id).eq("status", "sending");
      failed.push(p.name);
    }
  }
  const waiting = (await people(month)).filter((p) => stateOf(p) === "waiting").map((p) => p.name);
  return { sent, failed, left, waiting };
}
function sentNoteHtml(month: string, r: Awaited<ReturnType<typeof sendReady>>, how: string) {
  const list = (k: string, v: string[]) => v.length ? `<p><b>${k} (${v.length})</b><br>${v.map(esc).join(", ")}</p>` : "";
  return `<p>${esc(how)}: sent <b>${r.sent.length}</b> payslip email${r.sent.length === 1 ? "" : "s"} for ${label(month, { month: "long", year: "numeric" })}.</p>
    ${list("Sent", r.sent)}${list("Couldn't send, will try again", r.failed)}
    ${r.left ? `<p><b>${r.left} more</b> are still to go; the next run, ten minutes on, picks them up.</p>` : ""}
    ${list("No payslip uploaded yet", r.waiting)}
    ${r.waiting.length ? `<p>Upload them in the Upload Portal → Payslips tab (${PORTAL}), then press <b>Send ready now</b>.</p>` : ""}`;
}

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Dubai", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
async function scheduleOf(month: string) {
  const { data } = await sb.from("payslip_schedule").select("send_at, set_by, set_at, done_at").eq("month", `${month}-01`).maybeSingle();
  return data;
}

async function status(month: string) {
  const [list, sched, { data: logRows }] = await Promise.all([
    people(month), scheduleOf(month),
    sb.from("payslip_mailer_log").select("at, who, what").order("at", { ascending: false }).limit(8),
  ]);
  const lastSent = list.map((p) => p.sent?.sent_at).filter(Boolean).sort().pop() || null;
  const { data: revs } = await sb.from("payslip_revisions").select("staff_id, sent_at").eq("month", `${month}-01`).order("sent_at");
  const rev: Record<string, { n: number; at: string }> = {};
  for (const r of revs || []) { const x = rev[r.staff_id] || { n: 0, at: "" }; x.n++; x.at = r.sent_at; rev[r.staff_id] = x; }
  return {
    month, sender: SMTP_USER, ready_to_send: !!SMTP_PASS, schedule: sched, last_sent: lastSent,
    people: list.map((p) => ({ id: p.id, name: p.name, state: stateOf(p), revised: rev[p.id]?.n || 0, revised_at: rev[p.id]?.at || null })),
    welcome: await welcomeSummary(list),
    log: logRows || [],
  };
}

async function adminFor(token: unknown) {
  if (typeof token !== "string" || !UUID.test(token)) return null;
  const { data } = await sb.from("perf_admins").select("name, role").eq("token", token).in("role", ["leader", "payroll"]).maybeSingle();
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const t0 = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");

    // ── the schedule: any month whose time has come and isn't finished ──
    if (action === "due") {
      const { data: ok } = await sb.rpc("payslip_cron_ok", { p_secret: String(body.secret || "") });
      if (ok !== true) return json({ error: "bad secret" }, 401);
      const { data: due } = await sb.from("payslip_schedule").select("month, set_by").is("done_at", null).lte("send_at", new Date().toISOString());
      const out: Record<string, unknown> = {};
      for (const row of due || []) {
        const month = String(row.month).slice(0, 7);
        const r = await sendReady(month, "Scheduled send", t0);
        if (r.sent.length || r.failed.length) {
          await note(`Payslip emails sent · ${month}`, sentNoteHtml(month, r, `Scheduled send (set by ${row.set_by})`));
          await log("schedule", `Scheduled send: ${r.sent.length} sent${r.failed.length ? `, ${r.failed.length} failed` : ""}${r.left ? `, ${r.left} still to go` : ""}`);
        }
        // Finished once a run had nobody left to try; failures get the next run.
        if (!r.left && !r.failed.length) await sb.from("payslip_schedule").update({ done_at: new Date().toISOString() }).eq("month", row.month);
        out[month] = { sent: r.sent.length, failed: r.failed.length, left: r.left };
      }
      return json({ ok: true, ...out });
    }

    // ── the Upload Portal's buttons ──
    const admin = await adminFor(body.key);
    if (!admin) return json({ error: "That payslip key is not allowed to send." }, 401);
    const month = String(body.month || "");
    if (!MONTH.test(month)) return json({ error: "month must be YYYY-MM" }, 400);
    const nice = label(month, { month: "long", year: "numeric" });

    if (action === "status") return json(await status(month));

    // The email exactly as it would be sent, for the Upload Portal's Email preview tab. Sends nothing, needs no email password.
    // `role` picks one of the six with example numbers; `staff` (a person's id) shows that person's real email instead.
    if (action === "preview") {
      const welcome = WELCOME_MONTHS.has(month);
      if (body.staff) {
        const id = String(body.staff);
        if (!UUID.test(id)) throw new Oops("Pick a person.");
        const p = (await people(month)).find((x) => x.id === id);
        if (!p) throw new Oops("Couldn't find that person.");
        const e = await emailParts(p, month);
        return json({ role: p.role, label: ROLE_LABEL[p.role], subject: subject(month), welcome, example: false, name: p.name, html: e.html, text: e.text, has_payslip: !!p.slip });
      }
      const role = String(body.role || "stylist") as Role;
      if (!(role in ROLE_LABEL)) throw new Oops("Pick one of the six kinds of email.");
      const e = samplePreview(role, month);
      return json({ role, label: ROLE_LABEL[role], subject: subject(month), welcome, example: true, html: e.html, text: e.text });
    }

    if (action === "schedule") {
      const at = new Date(String(body.send_at || ""));
      if (isNaN(at.getTime())) throw new Oops("Pick a date and time.");
      if (at.getTime() < Date.now() - 60_000) throw new Oops("That time has already passed. Pick a later one, or press Send ready now.");
      if (at.getTime() > Date.now() + 60 * 86400_000) throw new Oops("Pick a time in the next two months.");
      mailer();
      const { error } = await sb.from("payslip_schedule").upsert({ month: `${month}-01`, send_at: at.toISOString(), set_by: admin.name, set_at: new Date().toISOString(), done_at: null });
      if (error) throw error;
      const at2 = when(at.toISOString());
      await log(admin.name, `Set the ${nice} send for ${at2}`);
      const list = await people(month);
      const ready = list.filter((p) => stateOf(p) === "ready").map((p) => p.name);
      const waiting = list.filter((p) => stateOf(p) === "waiting").map((p) => p.name);
      await note(`Payslips go out ${at2} · ${nice}`,
        `<p>${esc(admin.name)} set the ${nice} payslip emails to go out on <b>${esc(at2)}</b> (Dubai time). Nothing has been sent yet.</p>
         <p><b>Ready now (${ready.length})</b><br>${ready.map(esc).join(", ") || "Nobody yet"}</p>
         ${waiting.length ? `<p><b>No payslip yet (${waiting.length})</b><br>${waiting.map(esc).join(", ")}. Anyone uploaded before then goes too.</p>` : ""}
         <p>To check one, press <b>Send a test</b> in the Upload Portal → Payslips tab (${PORTAL}). To stop it, press <b>Cancel</b> there.</p>`);
      return json({ done: `Set. The ${nice} emails go out ${at2}.`, ...(await status(month)) });
    }
    if (action === "unschedule") {
      await sb.from("payslip_schedule").delete().eq("month", `${month}-01`).is("done_at", null);
      await log(admin.name, `Cancelled the ${nice} send`);
      return json({ done: "Cancelled. Nothing goes out by itself until a new time is set.", ...(await status(month)) });
    }

    if (action === "test") {
      // The real email for one or two people, to payroll@ only. "[TEST]" subject; nothing recorded.
      const ids = (Array.isArray(body.staff) ? body.staff : []).map(String).filter((x: string) => UUID.test(x)).slice(0, 5);
      if (!ids.length) throw new Oops("Pick at least one person for the test.");
      const list = (await people(month)).filter((p) => ids.includes(p.id));
      for (const p of list) {
        const e = await emailFor(p, month);
        const top = `<p style="font-family:Arial,sans-serif;padding:8px 12px;background:#eee;border-radius:6px">Test. The real one goes to <b>${esc(p.name)}</b> &lt;${esc(p.email || "no email on file")}&gt;${p.slip ? "" : ", and has no payslip uploaded yet"}.</p>`;
        await mail({ to: SMTP_USER, subject: "[TEST] " + subject(month), html: top + e.html, text: e.text, pdf: e.pdf });
      }
      await log(admin.name, `Test sent for ${list.map((p) => p.name).join(", ")}`);
      return json({ done: `Sent ${list.length} test email${list.length === 1 ? "" : "s"} to ${SMTP_USER}.`, ...(await status(month)) });
    }

    if (action === "send") {
      mailer();
      const r = await sendReady(month, admin.name, t0);
      if (r.sent.length || r.failed.length) await note(`Payslip emails sent · ${month}`, sentNoteHtml(month, r, `Sent from the Upload Portal by ${admin.name}`));
      await log(admin.name, `Sent now: ${r.sent.length} sent${r.failed.length ? `, ${r.failed.length} failed` : ""}${r.left ? `, ${r.left} still to go` : ""}`);
      return json({
        done: `Sent ${r.sent.length} email${r.sent.length === 1 ? "" : "s"}.` + (r.left ? ` ${r.left} more to go, press Send again.` : "") + (r.failed.length ? ` Couldn't send ${r.failed.join(", ")}; press Send again.` : ""),
        left: r.left, ...(await status(month)),
      });
    }

    if (action === "welcome") {
      mailer();
      const list = await people(month);
      if (body.test === true) {
        // One welcome to payroll@ only, marked [TEST]; nothing recorded.
        const ids = (Array.isArray(body.staff) ? body.staff : []).map(String).filter((x: string) => UUID.test(x)).slice(0, 5);
        if (!ids.length) throw new Oops("Pick at least one person for the test.");
        const picked = list.filter((p) => ids.includes(p.id));
        if (!picked.length) throw new Oops("Couldn't find that person.");
        if (picked.some((p) => p.kind !== "stylist")) throw new Oops("The welcome email is for the hair and beauty team, who have a page to sign in to. Pick one of them.");
        for (const p of picked) {
          const e = welcomeEmail(p);
          const top = `<p style="font-family:Arial,sans-serif;padding:8px 12px;background:#eee;border-radius:6px">Test. The real one goes to <b>${esc(p.name)}</b> &lt;${esc(p.email || "no email on file")}&gt;.</p>`;
          await mail({ to: SMTP_USER, subject: "[TEST] " + welcomeSubject, html: top + e.html, text: e.text });
        }
        await log(admin.name, `Welcome test sent for ${picked.map((p) => p.name).join(", ")}`);
        return json({ done: `Sent ${picked.length} welcome test${picked.length === 1 ? "" : "s"} to ${SMTP_USER}.`, ...(await status(month)) });
      }
      const r = await sendWelcome(admin.name, t0);
      if (r.sent.length || r.failed.length) {
        const names = (k: string, v: string[]) => v.length ? `<p><b>${k} (${v.length})</b><br>${v.map(esc).join(", ")}</p>` : "";
        await note("Welcome emails sent", `<p>${esc(admin.name)} sent the sign-in welcome email from the Upload Portal.</p>${names("Sent", r.sent)}${names("Couldn't send, press Send again", r.failed)}${r.left ? `<p><b>${r.left} more</b> still to go.</p>` : ""}`).catch(() => {});
      }
      await log(admin.name, `Welcome email: ${r.sent.length} sent${r.failed.length ? `, ${r.failed.length} failed` : ""}${r.left ? `, ${r.left} still to go` : ""}`);
      return json({
        done: `Sent ${r.sent.length} welcome email${r.sent.length === 1 ? "" : "s"}.` + (r.left ? ` ${r.left} more to go, press Send again.` : "") + (r.failed.length ? ` Couldn't send ${r.failed.join(", ")}; press Send again.` : ""),
        left: r.left, ...(await status(month)),
      });
    }

    if (action === "revised") {
      mailer();
      const id = String(body.staff || "");
      if (!UUID.test(id)) throw new Oops("Pick who the revised payslip is for.");
      const what = whatLine(body.what);
      const p = (await people(month)).find((x) => x.id === id);
      if (!p) throw new Oops("Couldn't find that person.");
      if (stateOf(p) !== "sent") throw new Oops(`${p.name} hasn't been emailed her ${nice} payslip yet, so there is nothing to revise. Use Send ready now instead.`);
      if (!p.email) throw new Oops(`${p.name} has no email on file.`);
      const e = await revisedEmail(p, month, what);
      if (body.test === true) {
        const top = `<p style="font-family:Arial,sans-serif;padding:8px 12px;background:#eee;border-radius:6px">Test. The real one goes to <b>${esc(p.name)}</b> &lt;${esc(p.email)}&gt;.</p>`;
        await mail({ to: SMTP_USER, subject: "[TEST] " + revisedSubject(month), html: top + e.html, text: e.text, pdf: e.pdf });
        await log(admin.name, `Test of ${p.name}'s revised payslip`);
        return json({ done: `Sent a test of ${p.name}'s revised payslip to ${SMTP_USER}.`, ...(await status(month)) });
      }
      await mail({ to: p.email, subject: revisedSubject(month), html: e.html, text: e.text, pdf: e.pdf });
      await sb.from("payslip_revisions").insert({ month: `${month}-01`, staff_id: p.id, email: p.email, what, sent_by: admin.name });
      await log(admin.name, `Revised ${nice} payslip sent to ${p.name}`);
      await note(`Revised payslip sent · ${p.name} · ${month}`, `<p>${esc(admin.name)} sent ${esc(p.name)} her revised ${esc(nice)} payslip from the Upload Portal.</p><p><b>What changed:</b> ${esc(what)}</p>`).catch(() => {});
      return json({ done: `Sent ${p.name} her revised ${label(month, { month: "long" })} payslip.`, ...(await status(month)) });
    }

    return json({ error: "Unknown action." }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Oops ? e.message : "Something went wrong with the payslip email. Try again in a minute." }, e instanceof Oops ? 400 : 500);
  }
});
