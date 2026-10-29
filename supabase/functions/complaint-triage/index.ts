// ============================================================
// TARA ROSE LADIES SALON, Complaint triage worker
// supabase/functions/complaint-triage/index.ts
// ============================================================
//
// Kate, 29 Oct 2026. A complaint logged on Log a Complaint goes to a first responder by type; if nobody takes it in 3 hours it moves to the
// next person, who is told it is now theirs. Called every minute by public.complaint_triage_tick() (pg_cron) with the vault secret
// 'complaint_hook_secret'. The tables, who is on each chain and the switches are all data: complaint_triage_routes, complaint_triage_config
// (migrations/complaint_triage.sql). Messages go out by WhatsApp from the respond.io backup number (channel 569496).
//
// Each minute: (1) start triage for complaints logged more than 45 seconds ago (the form sets the tagged people first), (2) move on the ones
// whose time is up or that were passed, (3) tell the filer about a question asked on a complaint, (4) remind a person who took one and has not
// replied to the client by day 2, or closed it by day 7.
//
// DRY RUN (complaint_triage_config.dry_run, on by default): every message goes only to dry_run_to (Kate) with "Dry run, would go to NAME" in front,
// and every step lasts dry_minutes instead of the real time.
//
// Not sent: client names or numbers (the message carries branch, kind and the link only). Phone numbers come from staff_phones (service role).
// A plain text only reaches someone who wrote to the backup number in the last 24 hours; once the WhatsApp templates are approved their names go
// in complaint_triage_config.template_* and this file is changed to send them (the wording is locked, see the mockup).
//
// Deploy: supabase functions deploy complaint-triage --no-verify-jwt --project-ref gvijxenafoowajqktqvd

import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const RESPOND_TOKEN = Deno.env.get("RESPOND_TOKEN") || "";
const RESPOND_CHANNEL = Number(Deno.env.get("RESPOND_COMPLAINT_CHANNEL") || "569496");
const RESPOND_API = "https://api.respond.io/v2";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const BRANCH: Record<string, string> = { SAA: "Saadiyat", KCA: "Khalifa City A", MC: "Motor City", AQ: "Al Quoz", BAH: "Bahrain" };
const KIND: Record<string, string> = {
  colour_result: "colour", cut_result: "cut", nail_service: "nail", treatment_result: "treatment", staff_attitude: "staff attitude",
  skin_reaction_or_injury: "skin reaction or injury", price_or_billing: "price or billing", booking_or_admin: "booking or admin",
  wait_or_time: "wait or time", facility_or_parking: "facility or parking", product: "product", other: "other",
};

type Cfg = {
  enabled: boolean; dry_run: boolean; dry_run_to: number | null; dry_minutes: number; step_minutes: number;
  hours_from: number; hours_to: number; pilot_branches: string[] | null; enabled_from: string | null; link_base: string;
};
type Rec = { id: number; name: string; email: string | null };
type Cmp = { id: number; branch_code: string | null; complaint_type: string | null; submitted_by: string | null; submitted_email: string | null;
  complaint_date: string | null; submitted_at: string | null; first_response_at: string | null; status: string | null };

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

const ev = (complaint_id: number, kind: string, recipient_id: number | null, detail: string | null = null, by_email: string | null = null) =>
  sb.from("complaint_triage_events").insert({ complaint_id, kind, recipient_id, detail: detail ? detail.slice(0, 500) : null, by_email });

// ------------------------------------------------------------ the clock: Dubai is UTC+4 with no daylight saving
const DXB = 4 * 3600 * 1000;
const dubaiHour = (t: number) => new Date(t + DXB).getUTCHours();
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

/** Send one WhatsApp. Returns null when it went (or in dry run, went to Kate), or the reason it did not. */
async function send(cfg: Cfg, toName: string, toEmail: string | null, text: string): Promise<string | null> {
  if (!RESPOND_TOKEN) return "RESPOND_TOKEN not set";
  let name = toName, phone = await phoneOf(toEmail, toName);
  let body = text;
  if (cfg.dry_run) {
    const { data: k } = await sb.from("complaint_notify_recipients").select("name, email").eq("id", cfg.dry_run_to).maybeSingle();
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

const first = (n: string) => String(n || "").replace(/\(.*\)/, "").trim().split(/\s+/)[0] || "team";
const linkOf = (cfg: Cfg, id: number) => `${cfg.link_base}/hub/complaint?cid=${id}`;
const branchName = (c: Cmp) => BRANCH[c.branch_code || ""] || c.branch_code || "the salon";
const kindName = (c: Cmp) => KIND[c.complaint_type || ""] || "client";

// ------------------------------------------------------------ the messages (wording from the approved mockup)
const msg = {
  alert: (cfg: Cfg, c: Cmp, r: Rec, next: string | null, mins: number) =>
    `Hi ${first(r.name)}, a client complaint came in at ${branchName(c)}. It is about ${kindName(c)}, so it is yours to look at first.\n\n` +
    `Take it, or pass it on if it is not yours: ${linkOf(cfg, c.id)}\n` +
    (next ? `If nobody takes it in ${mins >= 60 ? Math.round(mins / 60) + " hours" : mins + " minutes"} it moves to ${first(next)}.` : "If nobody takes it, it comes back to Kate."),
  urgent: (cfg: Cfg, c: Cmp, r: Rec) =>
    `Hi ${first(r.name)}, a skin reaction or injury was logged at ${branchName(c)}. This one needs a person, not just a message.\n\n` +
    `Please take it now: ${linkOf(cfg, c.id)}\nEveryone on the list got this at the same time. The first to take it stops the rest.`,
  escalated: (cfg: Cfg, c: Cmp, r: Rec, why: string) =>
    `Hi ${first(r.name)}, a ${kindName(c)} complaint at ${branchName(c)} has not been taken yet. ${why} It is now with you.\n\n` +
    `Take it, or pass it on if it is not yours: ${linkOf(cfg, c.id)}`,
  fyi: (cfg: Cfg, c: Cmp, r: Rec) =>
    `Hi ${first(r.name)}, a client complaint was logged at ${branchName(c)}. There is nothing you need to do now.\n\nSee how it is going: ${linkOf(cfg, c.id)}`,
  stuck: (cfg: Cfg, c: Cmp) =>
    `Nobody has taken the ${kindName(c)} complaint at ${branchName(c)}. It has been through everyone on its list.\n\nOpen it: ${linkOf(cfg, c.id)}`,
  question: (cfg: Cfg, c: Cmp, r: Rec, asker: string, q: string) =>
    `Hi ${first(r.name)}, ${first(asker)} has a question about the complaint you logged at ${branchName(c)}:\n"${q.slice(0, 300)}"\n\nAnswer here: ${linkOf(cfg, c.id)}`,
  remindReply: (cfg: Cfg, c: Cmp, r: Rec) =>
    `Hi ${first(r.name)}, the ${kindName(c)} complaint at ${branchName(c)} that you took is at day 2 and the client has not been replied to yet.\n\nOpen it: ${linkOf(cfg, c.id)}`,
  remindClose: (cfg: Cfg, c: Cmp, r: Rec) =>
    `Hi ${first(r.name)}, the ${kindName(c)} complaint at ${branchName(c)} that you took is at day 7 and is still open.\n\nOpen it: ${linkOf(cfg, c.id)}`,
};

// ------------------------------------------------------------ chains
async function routeStep(grp: string, step: number, branch: string | null): Promise<Rec[]> {
  const { data } = await sb.from("complaint_triage_routes").select("recipient_id, branch_code").eq("grp", grp).eq("step", step);
  const ids = (data || []).filter((r: any) => !r.branch_code || r.branch_code === branch).map((r: any) => r.recipient_id);
  if (!ids.length) return [];
  const { data: recs } = await sb.from("complaint_notify_recipients").select("id, name, email").in("id", ids).eq("active", true);
  return (recs || []) as Rec[];
}
const stepMinutes = (cfg: Cfg, grp: string) => cfg.dry_run ? cfg.dry_minutes : grp === "urgent" ? 60 : cfg.step_minutes;

async function kateAndCoordinator(cmp: Cmp): Promise<Rec[]> {
  const out: Rec[] = [];
  const { data: kate } = await sb.from("complaint_notify_recipients").select("id, name, email").ilike("name", "kate%").maybeSingle();
  if (kate) out.push(kate as Rec);
  const { data: rt } = await sb.from("complaint_triage_routes").select("recipient_id").eq("grp", "urgent").eq("branch_code", cmp.branch_code || "#none");
  const ids = (rt || []).map((x: any) => x.recipient_id);
  if (ids.length) {
    const { data: co } = await sb.from("complaint_notify_recipients").select("id, name, email").in("id", ids);
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
  const mins = stepMinutes(cfg, grp);
  const due = new Date(dueAt(now, mins, cfg, cfg.dry_run || grp === "urgent")).toISOString();
  const { error } = await sb.from("complaint_triage").insert({ complaint_id: cmp.id, grp, state: "active", step: 1, step_started_at: new Date(now).toISOString(), due_at: due, dry_run: cfg.dry_run });
  if (error) return { id: cmp.id, skipped: error.message };   // another tick got there first
  const recs = await routeStep(grp, 1, cmp.branch_code);
  const nextRecs = grp === "urgent" ? [] : await routeStep(grp, 2, cmp.branch_code);
  const notified = new Set<number>();
  let failures = 0;
  for (const r of recs) {
    notified.add(r.id);
    await ev(cmp.id, "notified", r.id);
    const text = grp === "urgent" ? msg.urgent(cfg, cmp, r) : msg.alert(cfg, cmp, r, nextRecs[0] ? nextRecs[0].name : null, mins);
    const why = await send(cfg, r.name, r.email, text);
    if (why) { failures++; await ev(cmp.id, "failed", r.id, why); }
  }
  // nobody on the first step could be reached: do not wait out the time, move on at the next tick
  if (recs.length && failures === recs.length && !cfg.dry_run) await sb.from("complaint_triage").update({ due_at: new Date().toISOString() }).eq("complaint_id", cmp.id);
  // the people who need to know, once: Kate, the branch coordinator, whoever was tagged under "who else should know"
  const fyi = await kateAndCoordinator(cmp);
  for (const r of fyi) {
    if (notified.has(r.id)) continue;
    notified.add(r.id);
    await ev(cmp.id, "cc", r.id);
    const why = await send(cfg, r.name, r.email, msg.fyi(cfg, cmp, r));
    if (why) await ev(cmp.id, "failed", r.id, why);
  }
  const { data: tagged } = await sb.from("complaint_people").select("name, email").eq("complaint_id", cmp.id).eq("kind", "cc");
  for (const p of tagged || []) {
    const rec = { id: 0, name: p.name, email: p.email } as Rec;
    await ev(cmp.id, "cc", null, p.name);
    const why = await send(cfg, p.name, p.email, msg.fyi(cfg, cmp, rec));
    if (why) await ev(cmp.id, "failed", null, p.name + ": " + why);
  }
  return { id: cmp.id, grp, notified: recs.length };
}

async function startNew(cfg: Cfg, onlyId?: number) {
  let q = sb.from("client_complaints")
    .select("id, branch_code, complaint_type, submitted_by, submitted_email, complaint_date, submitted_at, first_response_at, status")
    .not("submitted_at", "is", null).order("id", { ascending: true }).limit(10);
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
    const { data: c } = await sb.from("client_complaints")
      .select("id, branch_code, complaint_type, submitted_by, submitted_email, complaint_date, submitted_at, first_response_at, status").eq("id", t.complaint_id).maybeSingle();
    if (!c) continue;
    const cmp = c as Cmp;
    const prev = await routeStep(t.grp, t.step, cmp.branch_code);
    const nextRecs = await routeStep(t.grp, t.step + 1, cmp.branch_code);
    if (!nextRecs.length) {
      await sb.from("complaint_triage").update({ state: "stuck", due_at: null }).eq("complaint_id", t.complaint_id);
      await ev(cmp.id, "stuck", null, "everyone on the list has had it");
      const kate = await kateAndCoordinator(cmp);
      const k = kate[0];
      if (k) { const why = await send(cfg, k.name, k.email, msg.stuck(cfg, cmp)); if (why) await ev(cmp.id, "failed", k.id, why); }
      out.push({ id: cmp.id, stuck: true });
      continue;
    }
    // what happened to the people before: passed it on, could not be reached, or just did not take it in time
    const { data: last } = await sb.from("complaint_triage_events").select("kind, recipient_id").eq("complaint_id", cmp.id).in("kind", ["passed", "failed"]).order("id", { ascending: false }).limit(3);
    const prevNames = prev.map((p) => first(p.name)).join(" and ") || "the person before";
    const passed = (last || []).some((l: any) => l.kind === "passed" && prev.some((p) => p.id === l.recipient_id));
    const failedAll = prev.length > 0 && prev.every((p) => (last || []).some((l: any) => l.kind === "failed" && l.recipient_id === p.id));
    const why = passed ? `${prevNames} passed it on.` : failedAll ? `${prevNames} could not be reached.` : `${prevNames} could not get to it in time.`;
    const mins = stepMinutes(cfg, t.grp);
    const nextDue = new Date(dueAt(Date.now(), mins, cfg, cfg.dry_run)).toISOString();
    await sb.from("complaint_triage").update({ step: t.step + 1, step_started_at: new Date().toISOString(), due_at: nextDue }).eq("complaint_id", t.complaint_id);
    let failures = 0;
    for (const r of nextRecs) {
      await ev(cmp.id, "escalated", r.id, `step ${t.step + 1}`);
      await ev(cmp.id, "notified", r.id);
      const f = await send(cfg, r.name, r.email, msg.escalated(cfg, cmp, r, why));
      if (f) { failures++; await ev(cmp.id, "failed", r.id, f); }
    }
    if (failures === nextRecs.length && !cfg.dry_run) await sb.from("complaint_triage").update({ due_at: new Date().toISOString() }).eq("complaint_id", t.complaint_id);
    out.push({ id: cmp.id, step: t.step + 1 });
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
    const { data: c } = await sb.from("client_complaints")
      .select("id, branch_code, complaint_type, submitted_by, submitted_email, complaint_date, submitted_at, first_response_at, status").eq("id", e.complaint_id).maybeSingle();
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
  const today = new Date(Date.now() + DXB).toISOString().slice(0, 10);
  const { data } = await sb.from("complaint_triage").select("complaint_id, claimed_by, dry_run").eq("state", "claimed").limit(40);
  const out = [];
  for (const t of data || []) {
    const { data: c } = await sb.from("client_complaints")
      .select("id, branch_code, complaint_type, submitted_by, submitted_email, complaint_date, submitted_at, first_response_at, status").eq("id", t.complaint_id).maybeSingle();
    if (!c || (c as Cmp).status !== "open") continue;
    const cmp = c as Cmp;
    const base = cmp.complaint_date || (cmp.submitted_at || "").slice(0, 10);
    if (!base) continue;
    const days = Math.floor((Date.parse(today) - Date.parse(base)) / 86400000);
    const kind = days >= 7 ? "remind_close" : days >= 2 && !cmp.first_response_at ? "remind_reply" : null;
    if (!kind) continue;
    const { data: done } = await sb.from("complaint_triage_events").select("id").eq("complaint_id", cmp.id).eq("kind", kind).limit(1);
    if (done && done.length) continue;
    const { data: r } = await sb.from("complaint_notify_recipients").select("id, name, email").eq("id", t.claimed_by).maybeSingle();
    if (!r) continue;
    await ev(cmp.id, kind, r.id);
    const why = await send(cfg, r.name, r.email, kind === "remind_close" ? msg.remindClose(cfg, cmp, r as Rec) : msg.remindReply(cfg, cmp, r as Rec));
    if (why) await ev(cmp.id, "failed", r.id, why);
    out.push({ id: cmp.id, kind });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    const body = await req.json();
    const ok = await sb.rpc("complaint_hook_ok", { p_secret: String(body.secret || "") });
    if (ok.error || ok.data !== true) return json({ error: "not allowed" }, 401);
    const { data: cfgRow } = await sb.from("complaint_triage_config").select("*").eq("id", 1).maybeSingle();
    if (!cfgRow) return json({ error: "no config" }, 500);
    const cfg = cfgRow as Cfg;

    // start one complaint now, whatever the switch (still dry run when the config says so)
    if (body.start) return json({ started: await startNew(cfg, Number(body.start)) });
    if (!cfg.enabled) return json({ enabled: false });
    const started = await startNew(cfg);
    const moved = await moveDue(cfg);
    const asked = await questions(cfg);
    const reminded = await reminders(cfg);
    return json({ started, moved, asked, reminded });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
