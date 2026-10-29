// ============================================================
// TARA ROSE LADIES SALON, Complaint triage worker
// supabase/functions/complaint-triage/index.ts
// ============================================================
//
// Kate, 29 Oct 2026. A complaint logged on Log a Complaint goes to a first responder by type; if nobody takes it in 3 hours it moves to the
// next person, who is told it is now theirs. Called every minute by public.complaint_triage_tick() (pg_cron) with the vault secret
// 'complaint_hook_secret'. The tables, who is on each chain and the switches are all data: complaint_triage_routes, complaint_triage_config
// (migrations/complaint_triage.sql and the files after it). Messages go out by WhatsApp from the respond.io backup number (channel 569496).
//
// Each minute: (1) start triage for complaints logged more than 45 seconds ago (the form sets the tagged people first), (2) move on the ones
// whose time is up or that were passed, (3) tell the filer about a question asked on a complaint, (4) remind a person who took one and has not
// replied to the client by day 2, or closed it by day 7, (5) tell people who were tagged (one message, batched), (6) tell a person a complaint
// was assigned to them, (7) once a day after 9:30 am Dubai, the summary of the minor complaints.
//
// Batch 2 (29 Oct 2026):
//   - every message carries the complaint code (CMP-SAA-20261029-01);
//   - someone marked as "involved" on the form is skipped on the chain (the next person gets it); never for skin reactions and injuries, and Kate is
//     only skipped by her email, never by a first name (there is another Kate on the team);
//   - tagged events (migrations/complaint_people_assign.sql): copied people get ONE message, WhatsApp first, email only if WhatsApp fails or there is no
//     number. Tags to the same person within tag_batch_minutes (10) become one message; tags between 10 pm and 9 am wait until 9 am (not for urgent ones);
//   - assigned events: the person it was assigned to is told, the 3 hour clock has already stopped;
//   - the minor daily summary goes to Kate (all) and each coordinator (her branch);
//   - 31 Oct 2026: until the templates are approved the buttons are one tap links in the text (I've got this, Not mine, Open it): the page does the action
//     when it opens (?a=claim or ?a=pass).
//
// DRY RUN (complaint_triage_config.dry_run, on by default): every message goes only to dry_run_to (Kate) with "Dry run, would go to NAME" in front,
// every step lasts dry_minutes instead of the real time, tags batch over dry_minutes, and quiet hours are not applied, so a test can be seen at any hour.
//
// Not sent: client names or numbers (the message carries branch, kind, code and the link only). Phone numbers come from staff_phones (service role).
// A plain text only reaches someone who wrote to the backup number in the last 24 hours; once the WhatsApp templates are approved their names go
// in complaint_triage_config.template_* and this file is changed to send them (the wording is locked: docs/COMPLAINT-WHATSAPP-TEMPLATES.md).
//
// Deploy: supabase functions deploy complaint-triage --no-verify-jwt --project-ref gvijxenafoowajqktqvd

import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const RESPOND_TOKEN = Deno.env.get("RESPOND_TOKEN") || "";
const RESPOND_CHANNEL = Number(Deno.env.get("RESPOND_COMPLAINT_CHANNEL") || "569496");
const RESPOND_API = "https://api.respond.io/v2";
const NOTIFY_URL = (Deno.env.get("SUPABASE_URL") || "") + "/functions/v1/complaint-notify";
let HOOK_SECRET = "";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const BRANCH: Record<string, string> = { SAA: "Saadiyat", KCA: "Khalifa City A", MC: "Motor City", AQ: "Al Quoz", BAH: "Bahrain" };
const KIND: Record<string, string> = {
  colour_result: "colour", cut_result: "cut", nail_service: "nail", treatment_result: "treatment", staff_attitude: "staff attitude",
  skin_reaction_or_injury: "skin reaction or injury", price_or_billing: "price or billing", booking_or_admin: "booking or admin",
  wait_or_time: "wait or time", facility_or_parking: "facility or parking", product: "product", other: "other",
};

type Cfg = {
  enabled: boolean; dry_run: boolean; dry_run_to: number | null; dry_minutes: number; step_minutes: number; tag_batch_minutes: number;
  hours_from: number; hours_to: number; pilot_branches: string[] | null; enabled_from: string | null; link_base: string; last_digest_on: string | null;
};
type Rec = { id: number; name: string; short_name?: string | null; email: string | null };
type Cmp = { id: number; code: string | null; branch_code: string | null; complaint_type: string | null; submitted_by: string | null; submitted_email: string | null;
  complaint_date: string | null; submitted_at: string | null; first_response_at: string | null; status: string | null };
const CMP_SEL = "id, code, branch_code, complaint_type, submitted_by, submitted_email, complaint_date, submitted_at, first_response_at, status";
const REC_SEL = "id, name, short_name, email";

function group(t: string | null): string {
  if (t === "colour_result" || t === "cut_result") return "hair";
  if (t === "nail_service" || t === "treatment_result") return "nailskin";
  if (t === "staff_attitude") return "general";
  if (t === "skin_reaction_or_injury") return "urgent";
  return "minor";
}

function phoneE164(raw: string): string {
  const d = raw.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) return d;
  if (d.startsWith("00")) return "+" + d.slice(2);
  if (d.startsWith("0")) return "+971" + d.slice(1);
  return "+" + d;
}

const ev = (complaint_id: number, kind: string, recipient_id: number | null, detail: string | null = null, by_email: string | null = null, to_email: string | null = null) =>
  sb.from("complaint_triage_events").insert({ complaint_id, kind, recipient_id, detail: detail ? detail.slice(0, 500) : null, by_email, to_email });

// ------------------------------------------------------------ the clock: Dubai is UTC+4 with no daylight saving
const DXB = 4 * 3600 * 1000;
const dubaiHour = (t: number) => new Date(t + DXB).getUTCHours();
const dubaiDate = (t: number) => new Date(t + DXB).toISOString().slice(0, 10);
/** When `minutes` of working time have passed since `start`. Working time is hours_from to hours_to Dubai (the clock sleeps overnight). */
function dueAt(start: number, minutes: number, cfg: Cfg, always: boolean): number {
  if (always) return start + minutes * 60000;
  let t = start, left = minutes;
  for (let guard = 0; left > 0 && guard < 400; guard++) {
    const h = dubaiHour(t);
    if (h >= cfg.hours_from && h < cfg.hours_to) {
      const dayStart = Math.floor((t + DXB) / 86400000) * 86400000 - DXB;
      const windowEnd = dayStart + cfg.hours_to * 3600000;
      const use = Math.min(left, Math.floor((windowEnd - t) / 60000));
      t += use * 60000; left -= use;
      if (left > 0) t = windowEnd;
    } else {
      const dayStart = Math.floor((t + DXB) / 86400000) * 86400000 - DXB;
      const opens = dayStart + cfg.hours_from * 3600000;
      t = t < opens ? opens : opens + 86400000;
    }
  }
  return t;
}
const inHours = (cfg: Cfg, t: number) => { const h = dubaiHour(t); return h >= cfg.hours_from && h < cfg.hours_to; };

// ------------------------------------------------------------ people and phones
async function phoneOf(email: string | null, name?: string): Promise<string | null> {
  if (email) {
    const { data } = await sb.from("staff_phones").select("phone").ilike("email", email).maybeSingle();
    if (data && data.phone) return data.phone;
  }
  if (name) {
    const { data } = await sb.from("staff_phones").select("phone").ilike("name", name).maybeSingle();
    if (data && data.phone) return data.phone;
  }
  return null;
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

/** respond.io accepts a message and may fail it afterwards (for example outside the 24 hour window), so look at it a few seconds later. */
async function checkDelivery(phone: string) {
  await new Promise((r) => setTimeout(r, 4000));
  const who = encodeURIComponent("phone:" + phoneE164(phone));
  const c = await fetch(`${RESPOND_API}/contact/${who}`, { headers: { Authorization: "Bearer " + RESPOND_TOKEN } });
  if (!c.ok) return;
  const id = (await c.json()).id;
  const m = await fetch(`${RESPOND_API}/contact/id:${id}/message/list?limit=1`, { headers: { Authorization: "Bearer " + RESPOND_TOKEN } });
  if (!m.ok) return;
  const last = ((await m.json()).items || [])[0];
  const failed = last && last.traffic === "outgoing" && (last.status || []).find((s: any) => s.value === "failed");
  if (failed) throw new Error("not delivered: " + String(failed.message || "failed"));
}

async function dryTo(cfg: Cfg): Promise<{ name: string; email: string | null } | null> {
  const { data: k } = await sb.from("complaint_notify_recipients").select("name, email").eq("id", cfg.dry_run_to).maybeSingle();
  return k || null;
}

/** Send one WhatsApp. Returns null when it went (or in dry run, went to Kate), or the reason it did not. */
async function send(cfg: Cfg, toName: string, toEmail: string | null, text: string): Promise<string | null> {
  if (!RESPOND_TOKEN) return "RESPOND_TOKEN not set";
  let name = toName, phone = await phoneOf(toEmail, toName);
  let body = text;
  if (cfg.dry_run) {
    const k = await dryTo(cfg);
    if (!k) return "dry run has no dry_run_to";
    body = `Dry run, would go to ${toName}.\n\n${text}`;
    name = k.name; phone = await phoneOf(k.email, k.name);
  }
  if (!phone) return "no phone number on file for " + name;
  try {
    const who = "phone:" + phoneE164(phone);
    const known = await fetch(`${RESPOND_API}/contact/${encodeURIComponent(who)}`, { headers: { Authorization: "Bearer " + RESPOND_TOKEN } });
    if (known.status === 404) await respond(`/contact/create_or_update/${encodeURIComponent(who)}`, "POST", { firstName: name.split(/\s+/)[0] });
    await respond(`/contact/${encodeURIComponent(who)}/message`, "POST", { channelId: RESPOND_CHANNEL, message: { type: "text", text: body } });
    await checkDelivery(phone);
    return null;
  } catch (e) {
    return String((e as Error).message || e);
  }
}

/** One plain email through complaint-notify (it holds the Gmail secrets). In dry run it goes to Kate. Returns null when it went, or the reason. */
async function mail(cfg: Cfg, toName: string, toEmail: string | null, subject: string, text: string): Promise<string | null> {
  let to = toEmail, body = text;
  if (cfg.dry_run) {
    const k = await dryTo(cfg);
    if (!k) return "dry run has no dry_run_to";
    to = k.email; body = `Dry run, would go to ${toName}.\n\n${text}`;
  }
  if (!to) return "no email on file for " + toName;
  try {
    const res = await fetch(NOTIFY_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secret: HOOK_SECRET, mail: { to, subject, text: body } }) });
    const j = await res.json().catch(() => ({}));
    return j.ok ? null : String(j.error || "the email did not go");
  } catch (e) {
    return String((e as Error).message || e);
  }
}

/** WhatsApp first; the email only if WhatsApp did not go or there is no number. Returns null if either went. */
async function sendOrMail(cfg: Cfg, toName: string, toEmail: string | null, subject: string, text: string): Promise<string | null> {
  const wa = await send(cfg, toName, toEmail, text);
  if (!wa) return null;
  const em = await mail(cfg, toName, toEmail, subject, text);
  return em ? `${wa}; email: ${em}` : null;
}

const first = (n: string) => String(n || "").replace(/\(.*\)/, "").trim().split(/\s+/)[0] || "team";
const nm = (r: Rec) => r.short_name || first(r.name);
const linkOf = (cfg: Cfg, id: number) => `${cfg.link_base}/hub/complaint?cid=${id}`;
const branchName = (c: Cmp) => BRANCH[c.branch_code || ""] || c.branch_code || "the salon";
const kindName = (c: Cmp) => KIND[c.complaint_type || ""] || "client";
const codeOf = (c: Cmp) => (c.code ? ` (${c.code})` : "");
// WhatsApp buttons only come with an approved template (docs/COMPLAINT-WHATSAPP-TEMPLATES.md). Until then each button is a one tap link: the page does the
// action when it opens (a=claim, a=pass), once the person is signed in. Not for a skin reaction or injury: everyone has it at once, so no "Not mine".
const taps = (cfg: Cfg, c: Cmp, pass: boolean) =>
  `I've got this: ${linkOf(cfg, c.id)}&a=claim\n` + (pass ? `Not mine, pass it on: ${linkOf(cfg, c.id)}&a=pass\n` : "") + `Open it: ${linkOf(cfg, c.id)}`;

// ------------------------------------------------------------ the messages (wording from the approved mockup; templates: docs/COMPLAINT-WHATSAPP-TEMPLATES.md)
const hoursWord = (mins: number) => (mins >= 60 ? Math.round(mins / 60) + " hours" : mins + " minutes");
const msg = {
  alert: (cfg: Cfg, c: Cmp, r: Rec, next: string | null, mins: number) =>
    `Hi ${nm(r)}, a client complaint came in at ${branchName(c)}${codeOf(c)}. It is about ${kindName(c)}, so it is yours to look at first.\n\n` +
    `${taps(cfg, c, true)}\n\n` +
    (next ? `If nobody takes it in ${hoursWord(mins)} it moves to ${next}.` : "If nobody takes it, it comes back to Kate."),
  urgent: (cfg: Cfg, c: Cmp, r: Rec) =>
    `Hi ${nm(r)}, a skin reaction or injury was logged at ${branchName(c)}${codeOf(c)}. This one needs a person, not just a message.\n\n` +
    `${taps(cfg, c, false)}\n\nEveryone on the list got this at the same time. The first to take it stops the rest.`,
  escalated: (cfg: Cfg, c: Cmp, r: Rec, why: string) =>
    `Hi ${nm(r)}, a ${kindName(c)} complaint at ${branchName(c)}${codeOf(c)} is now with you. ${why}\n\n` +
    `${taps(cfg, c, true)}`,
  fyi: (cfg: Cfg, c: Cmp, r: Rec, line: string) =>
    `Hi ${nm(r)}, a client complaint at ${branchName(c)}${codeOf(c)} has something for you to see. ${line}\n\nThere is nothing you need to do now. See how it is going: ${linkOf(cfg, c.id)}`,
  fyiMany: (cfg: Cfg, r: Rec, codes: string[]) =>
    `Hi ${nm(r)}, you were tagged on ${codes.length} complaints (${codes.slice(0, 5).join(", ")}${codes.length > 5 ? " and more" : ""}).\n\nThere is nothing you need to do now. See them here: ${cfg.link_base}/hub/complaint`,
  stuck: (cfg: Cfg, c: Cmp) =>
    `Nobody has taken the ${kindName(c)} complaint at ${branchName(c)}${codeOf(c)}. It has been through everyone on its list.\n\nOpen it: ${linkOf(cfg, c.id)}`,
  question: (cfg: Cfg, c: Cmp, r: Rec, asker: string, q: string) =>
    `Hi ${nm(r)}, ${first(asker)} has a question about the complaint you logged at ${branchName(c)}${codeOf(c)}:\n"${q.slice(0, 300)}"\n\nAnswer here: ${linkOf(cfg, c.id)}`,
  remindReply: (cfg: Cfg, c: Cmp, r: Rec) =>
    `Hi ${nm(r)}, the ${kindName(c)} complaint at ${branchName(c)}${codeOf(c)} that you took is at day 2 and the client has not been replied to yet.\n\nOpen it: ${linkOf(cfg, c.id)}`,
  remindClose: (cfg: Cfg, c: Cmp, r: Rec) =>
    `Hi ${nm(r)}, the ${kindName(c)} complaint at ${branchName(c)}${codeOf(c)} that you took is at day 7 and is still open.\n\nOpen it: ${linkOf(cfg, c.id)}`,
  digest: (cfg: Cfg, r: Rec, items: string[]) =>
    `Hi ${nm(r)}, ${items.length} minor complaint${items.length === 1 ? " was" : "s were"} logged since yesterday: ${items.slice(0, 6).join("; ")}${items.length > 6 ? ` and ${items.length - 6} more` : ""}.\n\nNothing needs to be done today. See them here: ${cfg.link_base}/hub/complaint?view=board`,
};

// ------------------------------------------------------------ chains
async function routeStep(grp: string, step: number, branch: string | null): Promise<Rec[]> {
  const { data } = await sb.from("complaint_triage_routes").select("recipient_id, branch_code").eq("grp", grp).eq("step", step);
  const ids = (data || []).filter((r: any) => !r.branch_code || r.branch_code === branch).map((r: any) => r.recipient_id);
  if (!ids.length) return [];
  const { data: recs } = await sb.from("complaint_notify_recipients").select(REC_SEL).in("id", ids).eq("active", true);
  return (recs || []) as Rec[];
}
const stepMinutes = (cfg: Cfg, grp: string) => cfg.dry_run ? cfg.dry_minutes : grp === "urgent" ? 60 : cfg.step_minutes;

// Someone marked "involved" on the form does not get the complaint about their own work: the chain skips them. By email when there is one, otherwise by the
// first name on the chain appearing in what was written ("Stylist: Emma W"). Kate only by email: another Kate works at a salon.
type Skip = { emails: Set<string>; names: string[] };
async function involvedOf(id: number): Promise<Skip> {
  const { data } = await sb.from("complaint_people").select("name, email").eq("complaint_id", id).eq("kind", "involved");
  return {
    emails: new Set((data || []).map((p: any) => String(p.email || "").toLowerCase()).filter(Boolean)),
    names: (data || []).map((p: any) => String(p.name || "").toLowerCase()),
  };
}
const isSkipped = (r: Rec, s: Skip) =>
  (!!r.email && s.emails.has(r.email.toLowerCase())) ||
  (!!r.short_name && r.short_name.toLowerCase() !== "kate" && s.names.some((n) => n.includes(r.short_name!.toLowerCase())));

/** The first step at or after `from` that still has someone to tell once the involved people are left out. */
async function stepFrom(grp: string, from: number, branch: string | null, skip: Skip | null): Promise<{ step: number; recs: Rec[] } | null> {
  const { data } = await sb.from("complaint_triage_routes").select("step").eq("grp", grp);
  const max = Math.max(0, ...(data || []).map((r: any) => r.step));
  for (let s = from; s <= max; s++) {
    let recs = await routeStep(grp, s, branch);
    if (skip) recs = recs.filter((r) => !isSkipped(r, skip));
    if (recs.length) return { step: s, recs };
  }
  return null;
}

async function kateAndCoordinator(cmp: Cmp): Promise<Rec[]> {
  const out: Rec[] = [];
  const { data: kate } = await sb.from("complaint_notify_recipients").select(REC_SEL).ilike("name", "kate%").maybeSingle();
  if (kate) out.push(kate as Rec);
  const { data: rt } = await sb.from("complaint_triage_routes").select("recipient_id").eq("grp", "urgent").eq("branch_code", cmp.branch_code || "#none");
  const ids = (rt || []).map((x: any) => x.recipient_id);
  if (ids.length) {
    const { data: co } = await sb.from("complaint_notify_recipients").select(REC_SEL).in("id", ids);
    for (const r of (co || []) as Rec[]) out.push(r);
  }
  return out;
}

// ------------------------------------------------------------ 1. start
async function start(cfg: Cfg, cmp: Cmp) {
  const grp = group(cmp.complaint_type);
  const now = Date.now();
  if (grp === "minor") {
    await sb.from("complaint_triage").insert({ complaint_id: cmp.id, grp, state: "minor", dry_run: cfg.dry_run });
    return { id: cmp.id, grp };
  }
  const skip = grp === "urgent" ? null : await involvedOf(cmp.id);
  const firstStep = await stepFrom(grp, 1, cmp.branch_code, skip);
  if (!firstStep) {
    // everyone on the list is the person involved: a person has to look at it
    const { error } = await sb.from("complaint_triage").insert({ complaint_id: cmp.id, grp, state: "stuck", step: 1, dry_run: cfg.dry_run });
    if (error) return { id: cmp.id, skipped: error.message };
    await ev(cmp.id, "stuck", null, "everyone on the list was involved");
    const k = (await kateAndCoordinator(cmp))[0];
    if (k) { const why = await send(cfg, k.name, k.email, msg.stuck(cfg, cmp)); if (why) await ev(cmp.id, "failed", k.id, why); }
    return { id: cmp.id, grp, stuck: true };
  }
  const mins = stepMinutes(cfg, grp);
  const due = new Date(dueAt(now, mins, cfg, cfg.dry_run || grp === "urgent")).toISOString();
  const { error } = await sb.from("complaint_triage").insert({ complaint_id: cmp.id, grp, state: "active", step: firstStep.step, step_started_at: new Date(now).toISOString(), due_at: due, dry_run: cfg.dry_run });
  if (error) return { id: cmp.id, skipped: error.message };   // another tick got there first
  const recs = firstStep.recs;
  const nextStep = grp === "urgent" ? null : await stepFrom(grp, firstStep.step + 1, cmp.branch_code, skip);
  const nextName = nextStep && nextStep.recs[0] ? nm(nextStep.recs[0]) : null;
  const notified = new Set<number>();
  let failures = 0;
  for (const r of recs) {
    notified.add(r.id);
    await ev(cmp.id, "notified", r.id);
    const text = grp === "urgent" ? msg.urgent(cfg, cmp, r) : msg.alert(cfg, cmp, r, nextName, mins);
    const why = await send(cfg, r.name, r.email, text);
    if (why) { failures++; await ev(cmp.id, "failed", r.id, why); }
  }
  // nobody on the first step could be reached: do not wait out the time, move on at the next tick
  if (recs.length && failures === recs.length && !cfg.dry_run) await sb.from("complaint_triage").update({ due_at: new Date().toISOString() }).eq("complaint_id", cmp.id);
  // the people who need to know, once: Kate, the branch coordinator, whoever was tagged under "who else should know"
  const looking = recs.map(nm).join(" and ") + " " + (recs.length > 1 ? "are" : "is") + " looking after it.";
  const fyi = await kateAndCoordinator(cmp);
  for (const r of fyi) {
    if (notified.has(r.id)) continue;
    notified.add(r.id);
    await ev(cmp.id, "cc", r.id);
    const why = await send(cfg, r.name, r.email, msg.fyi(cfg, cmp, r, looking));
    if (why) await ev(cmp.id, "failed", r.id, why);
  }
  const { data: tagged } = await sb.from("complaint_people").select("name, email").eq("complaint_id", cmp.id).eq("kind", "cc");
  for (const p of tagged || []) {
    const rec = { id: 0, name: p.name, short_name: p.name, email: p.email } as Rec;
    if (p.email && fyi.some((f) => (f.email || "").toLowerCase() === String(p.email).toLowerCase())) continue;   // already told as Kate or the coordinator
    await ev(cmp.id, "cc", null, p.name);
    const why = await send(cfg, p.name, p.email, msg.fyi(cfg, cmp, rec, looking));
    if (why) await ev(cmp.id, "failed", null, p.name + ": " + why);
    // a tag that came in before this started is covered by this message
    if (p.email) await sb.from("complaint_triage_events").update({ handled: true }).eq("complaint_id", cmp.id).eq("kind", "tagged").eq("to_email", String(p.email).toLowerCase());
  }
  return { id: cmp.id, grp, notified: recs.length };
}

async function startNew(cfg: Cfg, onlyId?: number) {
  let q = sb.from("client_complaints").select(CMP_SEL)
    .not("submitted_at", "is", null).is("duplicate_of", null).order("id", { ascending: true }).limit(10);
  if (onlyId) q = q.eq("id", onlyId);
  else {
    q = q.lt("submitted_at", new Date(Date.now() - 45000).toISOString());
    if (cfg.enabled_from) q = q.gte("submitted_at", cfg.enabled_from);
    if (cfg.pilot_branches && cfg.pilot_branches.length) q = q.in("branch_code", cfg.pilot_branches);
  }
  const { data } = await q;
  const rows = (data || []) as Cmp[];
  if (!rows.length) return [];
  const { data: have } = await sb.from("complaint_triage").select("complaint_id").in("complaint_id", rows.map((r) => r.id));
  const seen = new Set((have || []).map((h: any) => h.complaint_id));
  const out = [];
  for (const c of rows) if (!seen.has(c.id)) out.push(await start(cfg, c));
  return out;
}

// ------------------------------------------------------------ 2. move on
async function moveDue(cfg: Cfg) {
  const { data: due } = await sb.from("complaint_triage").select("*").eq("state", "active").lte("due_at", new Date().toISOString()).limit(10);
  const out = [];
  for (const t of due || []) {
    // take the row: only the tick that clears due_at moves it
    const { data: got } = await sb.from("complaint_triage").update({ due_at: null }).eq("complaint_id", t.complaint_id).eq("state", "active").eq("due_at", t.due_at).select("complaint_id");
    if (!got || !got.length) continue;
    const { data: c } = await sb.from("client_complaints").select(CMP_SEL).eq("id", t.complaint_id).maybeSingle();
    if (!c) continue;
    const cmp = c as Cmp;
    const prev = await routeStep(t.grp, t.step, cmp.branch_code);
    const skip = t.grp === "urgent" ? null : await involvedOf(cmp.id);
    const nxt = await stepFrom(t.grp, t.step + 1, cmp.branch_code, skip);
    if (!nxt) {
      await sb.from("complaint_triage").update({ state: "stuck", due_at: null }).eq("complaint_id", t.complaint_id);
      await ev(cmp.id, "stuck", null, "everyone on the list has had it");
      const kate = await kateAndCoordinator(cmp);
      const k = kate[0];
      if (k) { const why = await send(cfg, k.name, k.email, msg.stuck(cfg, cmp)); if (why) await ev(cmp.id, "failed", k.id, why); }
      out.push({ id: cmp.id, stuck: true });
      continue;
    }
    const nextRecs = nxt.recs;
    // what happened to the people before: passed it on, could not be reached, or just did not take it in time
    const { data: last } = await sb.from("complaint_triage_events").select("kind, recipient_id").eq("complaint_id", cmp.id).in("kind", ["passed", "failed"]).order("id", { ascending: false }).limit(3);
    const prevNames = prev.map(nm).join(" and ") || "the person before";
    const passed = (last || []).some((l: any) => l.kind === "passed" && prev.some((p) => p.id === l.recipient_id));
    const failedAll = prev.length > 0 && prev.every((p) => (last || []).some((l: any) => l.kind === "failed" && l.recipient_id === p.id));
    const why = passed ? `${prevNames} passed it on.` : failedAll ? `${prevNames} could not be reached.` : `${prevNames} could not get to it in time.`;
    const mins = stepMinutes(cfg, t.grp);
    const nextDue = new Date(dueAt(Date.now(), mins, cfg, cfg.dry_run)).toISOString();
    await sb.from("complaint_triage").update({ step: nxt.step, step_started_at: new Date().toISOString(), due_at: nextDue }).eq("complaint_id", t.complaint_id);
    let failures = 0;
    for (const r of nextRecs) {
      await ev(cmp.id, "escalated", r.id, `step ${nxt.step}`);
      await ev(cmp.id, "notified", r.id);
      const f = await send(cfg, r.name, r.email, msg.escalated(cfg, cmp, r, why));
      if (f) { failures++; await ev(cmp.id, "failed", r.id, f); }
    }
    if (failures === nextRecs.length && !cfg.dry_run) await sb.from("complaint_triage").update({ due_at: new Date().toISOString() }).eq("complaint_id", t.complaint_id);
    out.push({ id: cmp.id, step: nxt.step });
  }
  return out;
}

// ------------------------------------------------------------ 3. questions to the filer
async function questions(cfg: Cfg) {
  const { data } = await sb.from("complaint_triage_events").select("id, complaint_id, by_email, detail").eq("kind", "question").eq("handled", false).limit(10);
  const out = [];
  for (const e of data || []) {
    const { data: got } = await sb.from("complaint_triage_events").update({ handled: true }).eq("id", e.id).eq("handled", false).select("id");
    if (!got || !got.length) continue;
    const { data: c } = await sb.from("client_complaints").select(CMP_SEL).eq("id", e.complaint_id).maybeSingle();
    if (!c || !(c as Cmp).submitted_email) continue;
    const cmp = c as Cmp;
    const { data: asker } = await sb.from("complaint_notify_recipients").select("name").ilike("email", e.by_email || "#none").maybeSingle();
    const rec = { id: 0, name: cmp.submitted_by || "there", email: cmp.submitted_email } as Rec;
    const why = await send(cfg, rec.name, rec.email, msg.question(cfg, cmp, rec, (asker && asker.name) || "Someone", e.detail || ""));
    await ev(cmp.id, why ? "failed" : "question_sent", null, why || rec.name);
    out.push({ id: cmp.id, to: rec.name, sent: !why });
  }
  return out;
}

// ------------------------------------------------------------ 4. reminders after someone took it
async function reminders(cfg: Cfg) {
  const today = dubaiDate(Date.now());
  const { data } = await sb.from("complaint_triage").select("complaint_id, claimed_by, dry_run").eq("state", "claimed").limit(40);
  const out = [];
  for (const t of data || []) {
    const { data: c } = await sb.from("client_complaints").select(CMP_SEL).eq("id", t.complaint_id).maybeSingle();
    if (!c || (c as Cmp).status !== "open") continue;
    const cmp = c as Cmp;
    const base = cmp.complaint_date || (cmp.submitted_at || "").slice(0, 10);
    if (!base) continue;
    const days = Math.floor((Date.parse(today) - Date.parse(base)) / 86400000);
    const kind = days >= 7 ? "remind_close" : days >= 2 && !cmp.first_response_at ? "remind_reply" : null;
    if (!kind) continue;
    const { data: done } = await sb.from("complaint_triage_events").select("id").eq("complaint_id", cmp.id).eq("kind", kind).limit(1);
    if (done && done.length) continue;
    const { data: r } = await sb.from("complaint_notify_recipients").select(REC_SEL).eq("id", t.claimed_by).maybeSingle();
    if (!r) continue;
    await ev(cmp.id, kind, r.id);
    const why = await send(cfg, r.name, r.email, kind === "remind_close" ? msg.remindClose(cfg, cmp, r as Rec) : msg.remindReply(cfg, cmp, r as Rec));
    if (why) await ev(cmp.id, "failed", r.id, why);
    out.push({ id: cmp.id, kind });
  }
  return out;
}

// ------------------------------------------------------------ 5. tags: ONE message to a copied person, WhatsApp first, email only as the fallback
async function tags(cfg: Cfg) {
  const { data } = await sb.from("complaint_triage_events").select("id, complaint_id, to_email, by_email, detail, at").eq("kind", "tagged").eq("handled", false).order("id").limit(80);
  const byPerson = new Map<string, any[]>();
  for (const e of data || []) {
    const k = String(e.to_email || "").toLowerCase();
    if (!k) { await sb.from("complaint_triage_events").update({ handled: true }).eq("id", e.id); continue; }
    byPerson.set(k, [...(byPerson.get(k) || []), e]);
  }
  const batch = cfg.dry_run ? Math.min(cfg.tag_batch_minutes, cfg.dry_minutes) : cfg.tag_batch_minutes;
  const out = [];
  let sentCount = 0;
  for (const [email, evs] of byPerson) {
    if (sentCount >= 5) break;   // a tick must finish inside its time; the rest go next minute
    // a message about a tag went to this person a moment ago: these wait and go together once the window has passed
    const { data: recent } = await sb.from("complaint_triage_events").select("id").eq("kind", "tag_sent").eq("to_email", email)
      .gte("at", new Date(Date.now() - batch * 60000).toISOString()).limit(1);
    if (recent && recent.length) continue;
    // quiet hours: 10 pm to 9 am it waits until 9 am, except for a skin reaction or injury
    if (!cfg.dry_run && !inHours(cfg, Date.now())) {
      const { data: cs } = await sb.from("client_complaints").select("id, complaint_type").in("id", evs.map((e: any) => e.complaint_id));
      if (!(cs || []).some((c: any) => c.complaint_type === "skin_reaction_or_injury")) continue;
    }
    // take them: only the tick that flips handled sends
    const { data: got } = await sb.from("complaint_triage_events").update({ handled: true }).in("id", evs.map((e: any) => e.id)).eq("handled", false).select("id, complaint_id");
    if (!got || !got.length) continue;
    const ids = Array.from(new Set(got.map((g: any) => g.complaint_id)));
    const { data: cs } = await sb.from("client_complaints").select(CMP_SEL).in("id", ids);
    const cmps = (cs || []) as Cmp[];
    if (!cmps.length) continue;
    const { data: tg } = await sb.from("complaint_taggers").select("name, short_name").eq("email", email).maybeSingle();
    const { data: rr } = await sb.from("complaint_notify_recipients").select("id").ilike("email", email).maybeSingle();
    const rec = { id: 0, name: (tg && tg.name) || email, short_name: (tg && tg.short_name) || null, email } as Rec;
    let text: string, subject: string;
    if (cmps.length === 1) {
      const by = evs.find((e: any) => e.complaint_id === cmps[0].id);
      text = msg.fyi(cfg, cmps[0], rec, `${(by && by.detail) || "Someone"} tagged you.`);
      subject = `You were tagged on a complaint${cmps[0].code ? " " + cmps[0].code : ""}`;
    } else {
      text = msg.fyiMany(cfg, rec, cmps.map((c) => c.code || String(c.id)));
      subject = `You were tagged on ${cmps.length} complaints`;
    }
    const why = await sendOrMail(cfg, rec.name, email, subject, text);
    for (const c of cmps) await ev(c.id, why ? "failed" : "tag_sent", rr ? rr.id : null, why, null, email);
    sentCount++;
    out.push({ to: email, complaints: cmps.length, sent: !why });
  }
  return out;
}

// ------------------------------------------------------------ 6. assigned: the person it was assigned to is told (the clock stopped when it was assigned)
async function assigned(cfg: Cfg) {
  const { data } = await sb.from("complaint_triage_events").select("id, complaint_id, recipient_id, to_email, detail").eq("kind", "assigned").eq("handled", false).order("id").limit(5);
  const out = [];
  for (const e of data || []) {
    const { data: got } = await sb.from("complaint_triage_events").update({ handled: true }).eq("id", e.id).eq("handled", false).select("id");
    if (!got || !got.length) continue;
    const { data: c } = await sb.from("client_complaints").select(CMP_SEL).eq("id", e.complaint_id).maybeSingle();
    const { data: r } = await sb.from("complaint_notify_recipients").select(REC_SEL).eq("id", e.recipient_id).maybeSingle();
    if (!c || !r) continue;
    const text = msg.escalated(cfg, c as Cmp, r as Rec, `${first(e.detail || "Someone")} assigned it to you.`);
    const why = await send(cfg, (r as Rec).name, (r as Rec).email, text);
    await ev((c as Cmp).id, why ? "failed" : "assigned_sent", (r as Rec).id, why, null, e.to_email || (r as Rec).email);
    out.push({ id: (c as Cmp).id, to: (r as Rec).name, sent: !why });
  }
  return out;
}

// ------------------------------------------------------------ 7. the minor complaints, once a day after 9:30 am Dubai: Kate gets all of them, each coordinator her branch
async function digest(cfg: Cfg, force: boolean) {
  const now = Date.now(), today = dubaiDate(now);
  const mins = ((now + DXB) / 60000) % 1440;
  if (!force && (cfg.last_digest_on === today || mins < cfg.hours_from * 60 + 30 || !inHours(cfg, now))) return null;
  await sb.from("complaint_triage_config").update({ last_digest_on: today }).eq("id", 1);
  const { data: ts } = await sb.from("complaint_triage").select("complaint_id").eq("state", "minor").is("digested_at", null).limit(100);
  const ids = (ts || []).map((t: any) => t.complaint_id);
  if (!ids.length) return { items: 0 };
  const { data: cs } = await sb.from("client_complaints").select(CMP_SEL).in("id", ids).is("duplicate_of", null);
  const cmps = (cs || []) as Cmp[];
  const line = (c: Cmp) => `${c.code || c.id} ${kindName(c)}${c.branch_code ? ", " + branchName(c) : ""}`;
  const { data: kate } = await sb.from("complaint_notify_recipients").select(REC_SEL).ilike("name", "kate%").maybeSingle();
  const sent: string[] = [];
  if (kate && cmps.length) {
    const why = await sendOrMail(cfg, (kate as Rec).name, (kate as Rec).email, "Minor complaints since yesterday", msg.digest(cfg, kate as Rec, cmps.map(line)));
    sent.push(`Kate ${why ? "failed: " + why : "sent"}`);
  }
  const { data: coords } = await sb.from("complaint_triage_routes").select("recipient_id, branch_code").eq("grp", "urgent").not("branch_code", "is", null);
  for (const co of coords || []) {
    const mine = cmps.filter((c) => c.branch_code === co.branch_code);
    if (!mine.length) continue;
    const { data: r } = await sb.from("complaint_notify_recipients").select(REC_SEL).eq("id", co.recipient_id).maybeSingle();
    if (!r) continue;
    const why = await sendOrMail(cfg, (r as Rec).name, (r as Rec).email, "Minor complaints since yesterday", msg.digest(cfg, r as Rec, mine.map(line)));
    sent.push(`${nm(r as Rec)} ${why ? "failed: " + why : "sent"}`);
  }
  await sb.from("complaint_triage").update({ digested_at: new Date().toISOString() }).in("complaint_id", ids);
  return { items: cmps.length, sent };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    const body = await req.json();
    const ok = await sb.rpc("complaint_hook_ok", { p_secret: String(body.secret || "") });
    if (ok.error || ok.data !== true) return json({ error: "not allowed" }, 401);
    HOOK_SECRET = String(body.secret);
    const { data: cfgRow } = await sb.from("complaint_triage_config").select("*").eq("id", 1).maybeSingle();
    if (!cfgRow) return json({ error: "no config" }, 500);
    const cfg = cfgRow as Cfg;

    // start one complaint now, whatever the switch (still dry run when the config says so)
    if (body.start) return json({ started: await startNew(cfg, Number(body.start)) });
    // the minor summary now, whatever the time of day
    if (body.digest) return json({ digest: await digest(cfg, true) });
    if (!cfg.enabled) return json({ enabled: false });
    const started = await startNew(cfg);
    const moved = await moveDue(cfg);
    const asked = await questions(cfg);
    const reminded = await reminders(cfg);
    const tagged = await tags(cfg);
    const assignedTo = await assigned(cfg);
    const summary = await digest(cfg, false);
    return json({ started, moved, asked, reminded, tagged, assignedTo, summary });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
