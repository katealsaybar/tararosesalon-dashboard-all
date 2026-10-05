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
// Actions (POST JSON):
//   status | test | schedule | unschedule | send   key = payroll or leader key
//                          (perf_admins), the same check as the payslips function
//   due                    secret = vault 'payslip_cron_secret'
//                          (pg_cron, migrations/payslip_mailer.sql)
//
// Secrets (Supabase → Edge Functions → Secrets): SMTP_USER = payroll@tararosesalon.com,
// SMTP_PASS = that account's Google App Password. Supabase blocks port 587, so it's 465.
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
const PAGE = "https://trk-salon-os.com/performance/";
const LOGO = "https://trk-salon-os.com/assets/email-logo.png";
const PORTAL = "trk-salon-os.com/upload/";
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
async function note(subj: string, html: string) {
  await mail({ to: SMTP_USER, cc: CC_NOTES, subject: subj, html: `<div style="font-family:Arial,sans-serif">${html}</div>` });
}
async function log(who: string, what: string) { await sb.from("payslip_mailer_log").insert({ who, what }); }

// ── who gets what ──
type Person = { id: string; name: string; branch: string; email: string | null; send_email: boolean; token: string;
  slip: { path: string; file_name: string } | null; sent: { status: string; sent_at: string } | null };

async function people(month: string): Promise<Person[]> {
  const m = `${month}-01`;
  const [{ data: staff, error: e1 }, { data: slips, error: e2 }, { data: sends, error: e3 }] = await Promise.all([
    sb.from("perf_staff").select("id, display_name, branch, email, send_email, token").eq("active", true).order("branch").order("display_name"),
    sb.from("payslips").select("staff_id, path, file_name").eq("month", m),
    sb.from("payslip_sends").select("staff_id, status, sent_at").eq("month", m),
  ]);
  if (e1 || e2 || e3) throw e1 || e2 || e3;
  const slip = Object.fromEntries((slips || []).map((p) => [p.staff_id, p]));
  const sent = Object.fromEntries((sends || []).map((p) => [p.staff_id, p]));
  return (staff || []).map((s) => ({
    id: s.id, name: s.display_name, branch: s.branch, email: (s.email || "").trim() || null, send_email: !!s.send_email,
    token: s.token, slip: slip[s.id] || null, sent: sent[s.id] || null,
  }));
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
async function emailFor(p: Person, month: string) {
  const { data: d } = await sb.rpc("perf_dashboard", { p_token: p.token, p_month: `${month}-01` });
  const hasNumbers = d && d.numbers && (d.numbers.total_revenue || d.numbers.clients);
  const wt = hasNumbers ? await winTip(d, p.token, month) : null;
  const first = p.name.split(" ")[0];
  const link = `${PAGE}?t=${p.token}&m=${month}`;
  const html = `<div style="font-family:Arial,sans-serif;color:#5C5557;max-width:560px;line-height:1.5">
    <p>Hi ${esc(first)},</p>
    <p>${p.slip ? `Your ${label(month, { month: "long" })} payslip is attached.` : `Here is your ${label(month, { month: "long" })} in short. Your payslip will follow.`}</p>
    ${winTipHtml(wt)}
    <p>Your full month is on your own page: your six numbers, your reviews${d && d.next_level ? `, and how close you are to ${esc(d.next_level)}` : ""}.</p>
    <p><a href="${link}" style="display:inline-block;background:#5C5557;color:#F9E8DF;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:700">See my month</a></p>
    <p>Questions about your payslip? Just reply to this email. Questions about your numbers? Your salon manager can walk you through them.</p>
    <p style="font-size:12px;color:#9a8a87">This link is yours only, so please keep it to yourself.</p>
    <p style="margin-top:22px"><img src="${LOGO}" alt="Tara Rose Salons" width="100" style="display:block;width:100px;height:auto;border:0"></p>
  </div>`;
  let pdf = null;
  if (p.slip) {
    const { data: blob, error } = await sb.storage.from("payslips").download(p.slip.path);
    if (error || !blob) throw new Error(`Couldn't read ${p.name}'s payslip file.`);
    pdf = { name: p.slip.file_name || `${p.name} payslip ${month}.pdf`, bytes: new Uint8Array(await blob.arrayBuffer()) };
  }
  return { html, pdf, text: `Your ${label(month, { month: "long" })} payslip: ${link}` };
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
  return {
    month, sender: SMTP_USER, ready_to_send: !!SMTP_PASS, schedule: sched, last_sent: lastSent,
    people: list.map((p) => ({ id: p.id, name: p.name, state: stateOf(p) })),
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

    return json({ error: "Unknown action." }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Oops ? e.message : "Something went wrong with the payslip email. Try again in a minute." }, e instanceof Oops ? 400 : 500);
  }
});
