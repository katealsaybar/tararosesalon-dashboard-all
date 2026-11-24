// respond.io chat complaints into the review list, on every Phorest sync (Kate, 24 Nov 2026).
// Replaces the by-hand crawls of 12 and 23 Nov. A client who writes to a salon, the brand number, Instagram or
// Facebook and sounds like she is complaining becomes a row in complaint_candidates with status 'todo', for Coach
// Emma and Kate to decide (Confirm, Not a complaint, Already in dashboard, Unsure). Nothing is sent to a client,
// nothing alerts a staff member and nothing goes to triage until a person confirms the row, the same as before.
//
// Each run: contacts with a message since the last good run (respond.io, read only) -> the keyword filter
// (the same word list as complaint-chat) -> Claude reads the chats that hit and says likely / maybe / no ->
// the client is identified -> new rows are added. Body/query: { dry?: true, since_hours?: n, backfill?: true }.
//   dry       reports what it would add (names as initials, numbers as last four digits), writes nothing.
//   backfill  fills email and respond_contact_id on the rows already in the table (the 12 and 23 Nov ones).
//
// IDENTITY (Kate: name, phone and email complete; a missing phone or email never stops a row):
//   name   the respond.io contact; else the Phorest client the contact matched; else "Unknown contact (chat, id)".
//   phone  the respond.io phone; else the Phorest mobile when the client was matched by email or name.
//   email  the respond.io email; else the Phorest email when it is a real one (not a shared placeholder).
//   Phorest client: by phone (one client holds the number), else by email, else by exact name at the same salon.
//   gaps   'no phone' / 'no email' / both, written on the row so the page can show it. The row is added anyway.
// Skipped: staff contacts (staff_phones.respond_contact_id), and a client who already has a candidate within
// 7 days of the message (same contact or same phone), so one long chat is one row.
// Secrets: RESPOND_TOKEN, ANTHROPIC_API_KEY (both already on this project). Marks sync_health 'respond-complaint-sync'.
import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

const API = "https://api.respond.io/v2";
const MODEL = "claude-sonnet-5-5";
const CHAT: Record<number, string> = {
  340071: "SAA", 346361: "MC", 354400: "KCA", 356339: "AQ", 572200: "Brand number", 569496: "Brand number",
  571908: "Instagram", 571909: "Facebook", 571743: "TikTok", 339373: "Website chat",
};
const SALON = new Set(["SAA", "MC", "KCA", "AQ"]);
const TYPES = ["colour_result", "cut_result", "nail_service", "treatment_result", "staff_attitude", "skin_reaction_or_injury",
  "price_or_billing", "wait_or_time", "booking_or_admin", "other", "unclear"];
// The complaint-chat word list (English and a few Arabic words). Crude on purpose: it only decides which chats Claude reads.
const WORDS = /(not happy|unhappy|disappoint|unacceptable|terrible|horrible|awful|worst|poor service|rude|refund|money back|redo|re-do|fix (it|this)|wrong|not what|reimburse|unprofessional|infection|infected|falling out|fell out|fall out|broken|broke|rough|didn't like|don't like|do not like|did not like|too much|not lasting|isn't lasting|didn't take|did not take|never replied|no reply|ignored|mistake|bad experience|corrected|colou?r correction|taken the colou?r|hadn't (fully )?taken|not (fully )?taken|(no|any) real change|haven't achieved|hasn't changed|didn't change|did not change|nothing changed|turned (blonde|brown|orange|yellow|green|grey|gray)|too (orange|yellow|warm|brassy|short|light|dark|long)|orange|yellow|brassy|patchy|uneven|burn|itch|rash|allerg|irritat|swollen|damaged|ruined|waited|waiting|overcharg|charged|complain|manager|speak to|never again|won't be back|chipped|lifted|came off|peeling|غير راض|سيء|سيئ|مشكلة|استرداد|فلوس|لن أعود)/i;

const letters = (s: any) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]/gu, "");
const dubai = (ms: number) => new Date(ms + 4 * 3600e3).toISOString().slice(0, 10);
const hhmm = (ms: number) => new Date(ms + 4 * 3600e3).toISOString().slice(11, 16);
const json = (o: any, status = 200) => new Response(JSON.stringify(o, null, 1), { status, headers: { "Content-Type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// A phone in any shape to +971..., or null when it is not a number.
function normPhone(raw: unknown): string | null {
  let d = String(raw ?? "").replace(/[^0-9]/g, "");
  if (!d) return null;
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 10 && d.startsWith("05")) d = "971" + d.slice(1);
  else if (d.length === 9 && d.startsWith("5")) d = "971" + d;
  return d.length >= 8 && d.length <= 15 ? "+" + d : null;
}
const initials = (s: string) => String(s || "").split(/\s+/).filter(Boolean).map((w) => w[0].toUpperCase() + ".").join(" ") || "?";
const last4 = (p: string | null) => (p ? "..." + p.slice(-4) : null);

async function rio(token: string, method: string, path: string, body?: unknown) {
  for (let i = 0; ; i++) {
    const r = await fetch(API + path, { method, headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text();
    if ((r.status === 429 || r.status >= 500) && i < 3) { await sleep(1500 * (i + 1)); continue; }
    let data: any = null; try { data = JSON.parse(text); } catch (_) { /* not JSON */ }
    return { status: r.status, data };
  }
}
const cursorOf = (next: any) => (next ? String(next).split("cursorId=")[1]?.split("&")[0] || "" : "");

async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>, until: number) {
  let i = 0, stopped = false;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) {
      if (Date.now() > until) { stopped = true; return; }
      await fn(items[i++]);
    }
  }));
  return { stopped, done: i };
}

function bodyText(m: any): string {
  const x = m.message || {};
  if (x.text) return String(x.text);
  const tpl = x.template && Array.isArray(x.template.components) ? x.template.components.find((c: any) => c.type === "body") : null;
  if (tpl && tpl.text) return String(tpl.text);
  if (x.attachment) return x.attachment.description ? String(x.attachment.description) : "[photo or file]";
  return "";
}

Deno.serve(async (req) => {
  const u = new URL(req.url);
  let body: any = {};
  if (req.method === "POST") { try { body = await req.json(); } catch (_) { /* no body */ } }
  const dry = body.dry === true || u.searchParams.get("dry") === "1";
  const backfill = body.backfill === true || u.searchParams.get("backfill") === "1";
  const token = Deno.env.get("RESPOND_TOKEN") || "";
  const akey = Deno.env.get("ANTHROPIC_API_KEY") || "";
  const missing = [["RESPOND_TOKEN", token], ["ANTHROPIC_API_KEY", akey]].filter((x) => !x[1]).map((x) => x[0]);
  if (missing.length) return json({ ok: false, missing_secrets: missing });

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const t0 = Date.now(), until = t0 + 110_000;     // stop reading chats before the platform's own limit
  const out: any = { ok: true, mode: backfill ? (dry ? "backfill dry run" : "BACKFILL") : (dry ? "dry run, nothing written" : "SYNC"), errors: [] };
  try {
    out.report = backfill ? await runBackfill(sb, token, dry, until) : await runSync(sb, token, akey, dry, until, Number(body.since_hours || u.searchParams.get("since_hours") || 0));
  } catch (e) {
    out.ok = false; out.errors.push((e as Error).message || String(e));
  }
  if (!dry) {
    await sb.from("sync_health").upsert({ name: "respond-complaint-sync", last_run_at: new Date(t0).toISOString(),
      last_ok_at: out.ok && !out.report?.incomplete ? new Date(t0).toISOString() : undefined,
      last_error: out.ok ? null : out.errors.join(" | ").slice(0, 500) }, { onConflict: "name" });
  }
  return json(out);
});

// ── the sync ────────────────────────────────────────────────────────────────────────
async function runSync(sb: any, token: string, akey: string, dry: boolean, until: number, sinceHours: number) {
  const rep: any = {};
  // Where the last good run got to. First ever run: the last 2 days (the by-hand crawl of 23 Nov ended that day).
  const { data: h } = await sb.from("sync_health").select("last_ok_at").eq("name", "respond-complaint-sync").maybeSingle();
  const since = sinceHours > 0 ? Date.now() - sinceHours * 3600e3
    : h?.last_ok_at ? Date.parse(h.last_ok_at) - 30 * 60e3 : Date.now() - 2 * 86400e3;
  rep.since = new Date(since).toISOString();

  // Staff contacts are never read.
  const { data: staff } = await sb.from("staff_phones").select("respond_contact_id,phone");
  const staffIds = new Set((staff || []).map((s: any) => Number(s.respond_contact_id)).filter(Boolean));
  const staffPhones = new Set((staff || []).map((s: any) => s.phone).filter(Boolean));

  // 1. Contacts active since then (the filter is by day, so today's contacts come back on every run).
  const from = dubai(since), to = dubai(Date.now());
  const contacts: any[] = [];
  let cursor = "";
  for (let page = 0; page < 60; page++) {
    const r = await rio(token, "POST", "/contact/list?limit=100" + (cursor ? "&cursorId=" + cursor : ""), {
      search: "", timezone: "Asia/Dubai",
      filter: { $and: [{ category: "contactField", field: "lastInteractionTime", operator: "isTimestampBetween", value: { from, to } }] } });
    if (r.status !== 200 || !r.data) throw new Error("respond.io contact list " + r.status);
    contacts.push(...(r.data.items || []));
    cursor = cursorOf(r.data.pagination?.next);
    if (!cursor || !(r.data.items || []).length) break;
  }
  rep.contacts_active = contacts.length;

  // 2. Their messages since then, and the keyword filter.
  const hits: any[] = [];
  let read = 0;
  const todo = contacts.filter((c) => !staffIds.has(Number(c.id)) && !staffPhones.has(normPhone(c.phone) || "x"));
  rep.staff_skipped = contacts.length - todo.length;
  const res = await pool(todo, 4, async (c) => {
    const list: any[] = [];
    let cur = "";
    for (let page = 0; page < 3; page++) {
      const r = await rio(token, "GET", "/contact/id:" + c.id + "/message/list?limit=50" + (cur ? "&cursorId=" + cur : ""));
      if (r.status !== 200 || !r.data) break;
      const items: any[] = r.data.items || [];
      let oldest = Infinity;
      for (const m of items) {
        const ts = Math.floor(Number(m.messageId) / 1000);
        oldest = Math.min(oldest, ts);
        const text = bodyText(m);
        if (text) list.push({ ts, w: m.traffic === "incoming" ? "CLIENT" : "SALON", ch: m.channelId, text });
      }
      cur = cursorOf(r.data.pagination?.next);
      if (!cur || !items.length || oldest < Date.now() - 3 * 86400e3) break;
    }
    read++;
    list.sort((a, b) => a.ts - b.ts);
    const fresh = list.filter((m) => m.w === "CLIENT" && m.ts >= since && WORDS.test(m.text.replace(/[‘’]/g, "'")));
    if (fresh.length) hits.push({ c, list, fresh });
  }, until);
  rep.contacts_read = read;
  rep.keyword_hits = hits.length;
  if (res.stopped) rep.incomplete = `time budget reached after ${read} of ${todo.length} contacts; next run continues from the same point`;

  // 3. Already reviewed: same contact or same phone, within 7 days of the message.
  const ids = hits.map((x) => Number(x.c.id));
  const phones = hits.map((x) => normPhone(x.c.phone)).filter(Boolean);
  const existing: any[] = [];
  if (ids.length || phones.length) {
    const orParts = [ids.length ? `respond_contact_id.in.(${ids.join(",")})` : "", phones.length ? `phone.in.(${phones.map((p) => `"${p}"`).join(",")})` : ""].filter(Boolean);
    const { data: ex } = await sb.from("complaint_candidates").select("respond_contact_id,phone,msg_date").or(orParts.join(","));
    existing.push(...(ex || []));
  }
  const reviewed = (cid: number, ph: string | null, day: string) => existing.some((e) =>
    (Number(e.respond_contact_id) === cid || (ph && e.phone === ph)) && Math.abs(Date.parse(e.msg_date) - Date.parse(day)) <= 7 * 86400e3);

  // 4. Claude reads the chats that hit.
  const anthropic = new Anthropic({ apiKey: akey });
  const found: any[] = [];
  rep.skipped_already_reviewed = 0; rep.read_by_claude = 0; rep.no_complaint = 0; rep.judge_failed = 0;
  await pool(hits, 3, async (x) => {
    const firstDay = dubai(x.fresh[0].ts);
    if (reviewed(Number(x.c.id), normPhone(x.c.phone), firstDay)) { rep.skipped_already_reviewed++; return; }
    const verdict = await judge(anthropic, x);
    // A chat Claude could not read is NOT "no complaint": it is counted apart and the run is left unfinished,
    // so the watermark does not move and the next run reads the same chats again.
    if (!verdict) { rep.judge_failed++; return; }
    rep.read_by_claude++;
    if (verdict.verdict === "no") { rep.no_complaint++; return; }
    found.push({ ...x, v: verdict });
  }, until);
  if (rep.judge_failed) rep.incomplete = `Claude could not read ${rep.judge_failed} of ${hits.length} chats (${lastJudgeError}); nothing was lost, the next run reads them again`;
  rep.last_judge_error = lastJudgeError || undefined;

  // 5. Identify each client and build the rows.
  const rows: any[] = [];
  for (const f of found) rows.push(await identify(sb, f));
  rep.new_complaints = rows.length;
  rep.preview = rows.map((r) => ({ who: initials(r.client_name), phone: last4(r.phone), email: r.email ? "yes" : "no", phorest: r.match_how || "not matched",
    chat: r.chat, branch: r.branch_code, day: r.msg_date, verdict: r.confidence, type: r.suggested_type, health: r.health, gaps: r.gaps, words: String(r.words || "").slice(0, 90) }));
  if (!dry && rows.length) {
    const { error } = await sb.from("complaint_candidates").insert(rows);
    if (error) throw new Error("complaint_candidates insert: " + error.message);
    rep.written = rows.length;
  }
  return rep;
}

// Claude's read of one chat: is this a complaint about the salon's work, people, prices or waiting?
const SCHEMA = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["likely", "maybe", "no"] },
    type: { type: "string", enum: TYPES },
    health: { type: "boolean", description: "Skin, scalp, allergy, burn, infection or injury wording." },
    key: { type: "integer", description: "Index of the CLIENT message that is the complaint (the numbers at the start of each line)." },
    note: { type: "string", description: "One or two plain sentences: what she says went wrong and whether the salon had answered. No names." },
  },
  required: ["verdict", "type", "health", "key", "note"],
  additionalProperties: false,
};
const SYSTEM = `You read WhatsApp, Instagram and Facebook chats between a client and Tara Rose Ladies Salon (hair, nails and beauty, UAE and Bahrain) and decide whether the client is making a complaint about the salon.

A complaint (likely): she says the service, the result, a staff member, a price or charge, or a wait went wrong, or she asks for a redo, correction, refund or to speak to a manager because of work already done at the salon.
Maybe: it reads like dissatisfaction but is ambiguous, or the cause is unclear.
No: a booking or rescheduling request, a question about price, deposit, availability or a service, thanks or praise, a problem caused by another salon, a request to "fix my colour" or "make it lighter" while asking for an appointment unless she blames the salon's earlier work, an ordinary delay she accepts, a mention of a word like "waiting" or "charged" that is not a grievance. Keyword hits are often NOT complaints, so be strict: a chat that is clearly a booking or an enquiry is "no"; one that really sounds like a grievance but is unclear is "maybe".

Choose the type that fits best. skin_reaction_or_injury and health=true are for skin, scalp, allergy, burn, infection or injury. Arabic and Tagalog may appear. Never invent details that are not in the chat.`;

let lastJudgeError = "";
async function judge(anthropic: any, x: any) {
  const tail = x.list.slice(-30);
  const lines = tail.map((m: any, i: number) => `${i} [${dubai(m.ts)} ${hhmm(m.ts)}] ${m.w}: ${m.text.replace(/\s+/g, " ").slice(0, 400)}`).join("\n");
  try {
    const res = await anthropic.beta.messages.create({
      model: MODEL, max_tokens: 600,
      betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
      system: SYSTEM,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: `Chat (oldest first, the last ${tail.length} messages):\n${lines}\n\nIs the client complaining about the salon?` }],
    });
    if (res.stop_reason === "refusal") return null;
    const t = res.content.find((b: any) => b.type === "text");
    const v = t && "text" in t ? JSON.parse(t.text) : null;
    if (!v) return null;
    // The key message must be one of hers; otherwise take her newest message that hit the word list.
    let k = tail[v.key] && tail[v.key].w === "CLIENT" ? tail[v.key] : null;
    if (!k) k = [...x.fresh].pop();
    return { ...v, keyMsg: k };
  } catch (e) {
    lastJudgeError = String((e as Error).message || e).replace(/\s+/g, " ").slice(0, 160);
    console.error("[respond-complaint-sync] judge failed", lastJudgeError);
    return null;
  }
}

// ── identifying the client ─────────────────────────────────────────────────────────
async function identify(sb: any, f: any) {
  const c = f.c, v = f.v;
  const chat = CHAT[v.keyMsg.ch] || CHAT[f.list[f.list.length - 1]?.ch] || "Chat";
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  let phone = normPhone(c.phone);
  let email = String(c.email || "").trim().toLowerCase() || null;
  let phorestId: string | null = null, how: string | null = null, pname = "";
  let branch: string | null = SALON.has(chat) ? chat : null;

  // Phorest client: by phone, else email, else exact name at the same salon.
  if (phone) {
    const { data } = await sb.from("phorest_client_emails").select("phorest_id,first_name,last_name,email,email_status,archived").eq("mobile_norm", phone);
    const ids = [...new Set((data || []).map((r: any) => r.phorest_id))];
    if (ids.length === 1) { phorestId = ids[0] as string; how = "phone"; }
    else if (ids.length > 1) {
      const live = [...new Set((data || []).filter((r: any) => !r.archived).map((r: any) => r.phorest_id))];
      if (live.length === 1) { phorestId = live[0] as string; how = "phone"; }
    }
  }
  if (!phorestId && email) {
    const { data } = await sb.from("phorest_client_emails").select("phorest_id").ilike("email", email).eq("email_status", "real");
    const ids = [...new Set((data || []).map((r: any) => r.phorest_id))];
    if (ids.length === 1) { phorestId = ids[0] as string; how = "email"; }
  }
  if (!phorestId && name.split(/\s+/).length >= 2) {
    const key = name.toLowerCase().replace(/\s+/g, " ");
    const { data } = await sb.from("phorest_client_emails").select("phorest_id").eq("name_key", key).eq("archived", false);
    const ids = [...new Set((data || []).map((r: any) => r.phorest_id))];
    if (ids.length === 1) {
      let ok = true;
      if (branch) { const { data: b } = await sb.from("phorest_client_branches").select("branch_code").eq("phorest_id", ids[0]).eq("branch_code", branch).limit(1); ok = !!(b && b.length); }
      if (ok) { phorestId = ids[0] as string; how = "name + branch"; }
    }
  }
  // Fill what respond.io did not have from the matched Phorest client.
  if (phorestId) {
    const { data } = await sb.from("phorest_client_emails").select("first_name,last_name,mobile_norm,email,email_status,archived,pulled_at").eq("phorest_id", phorestId).order("pulled_at", { ascending: false }).limit(5);
    const p = (data || []).find((r: any) => !r.archived) || (data || [])[0];
    if (p) {
      pname = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
      if (!phone && p.mobile_norm && how !== "phone") phone = normPhone(p.mobile_norm);
      if (!email) { const real = (data || []).find((r: any) => r.email_status === "real" && r.email); if (real) email = String(real.email).trim().toLowerCase(); }
    }
    if (!branch) {
      const { data: b } = await sb.from("phorest_client_branches").select("branch_code").eq("phorest_id", phorestId).in("branch_code", ["SAA", "KCA", "MC", "AQ"]);
      const codes = [...new Set((b || []).map((r: any) => r.branch_code))];
      if (codes.length === 1) branch = codes[0] as string;
    }
  }
  const finalName = name || pname || `Unknown contact (${chat}, ${c.id})`;
  const gaps = [!phone ? "no phone" : "", !email ? "no email" : ""].filter(Boolean).join(", ") || null;
  const key = v.keyMsg;
  return {
    client_name: finalName, phone, email, chat, branch_code: branch, msg_date: dubai(key.ts),
    confidence: v.verdict, health: !!v.health, words: String(key.text).replace(/\s+/g, " ").slice(0, 200),
    note: String(v.note || "").slice(0, 300), suggested_type: v.type, phorest_id: phorestId, match_how: how, gaps,
    status: "todo", respond_contact_id: Number(c.id), source: "auto-sync", synced_at: new Date().toISOString(),
  };
}

// ── backfill: email and respond.io contact id for the rows already in the table ─────────
async function runBackfill(sb: any, token: string, dry: boolean, until: number) {
  const { data: rows } = await sb.from("complaint_candidates").select("id,phone,phorest_id,email,respond_contact_id,gaps").or("email.is.null,respond_contact_id.is.null");
  const rep: any = { rows_to_check: (rows || []).length, contact_found: 0, email_from_respond: 0, email_from_phorest: 0, still_no_email: 0, still_no_phone: 0, written: 0 };
  const updates: any[] = [];
  await pool(rows || [], 4, async (r: any) => {
    const set: any = {};
    let email = r.email as string | null;
    if (r.phone && !r.respond_contact_id) {
      const x = await rio(token, "GET", "/contact/phone:" + r.phone);
      if (x.status === 200 && x.data) {
        set.respond_contact_id = Number(x.data.id); rep.contact_found++;
        if (!email && x.data.email) { email = String(x.data.email).trim().toLowerCase(); rep.email_from_respond++; }
      }
    }
    if (!email && r.phorest_id) {
      const { data } = await sb.from("phorest_client_emails").select("email").eq("phorest_id", r.phorest_id).eq("email_status", "real").limit(1);
      if (data && data[0]?.email) { email = String(data[0].email).trim().toLowerCase(); rep.email_from_phorest++; }
    }
    if (email && email !== r.email) set.email = email;
    const gaps = [!r.phone ? "no phone" : "", !email ? "no email" : ""].filter(Boolean).join(", ") || null;
    if (gaps !== (r.gaps || null)) set.gaps = gaps;
    if (!email) rep.still_no_email++;
    if (!r.phone) rep.still_no_phone++;
    if (Object.keys(set).length) updates.push({ id: r.id, set });
  }, until);
  rep.rows_changed = updates.length;
  if (!dry) for (const u of updates) {
    const { error } = await sb.from("complaint_candidates").update(u.set).eq("id", u.id);
    if (error) throw new Error("backfill update: " + error.message);
    rep.written++;
  }
  return rep;
}
