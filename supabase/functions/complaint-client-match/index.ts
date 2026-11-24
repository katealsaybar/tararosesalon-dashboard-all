// Complete, checked identity for every client with a complaint (Kate, 24 Nov 2026: "match all clients to complaints accurately").
// complaint_clients holds one row per client (filled from Phorest by SQL); this function adds the respond.io side:
// the contact the phone belongs to, its name and its email, then decides which email is safe to use and what is still missing.
// Read only on respond.io (GET contact by phone or id). Writes only complaint_clients. client_complaints and complaint_candidates are not touched.
// Body: { limit?: 300 (rows per call), force?: true (re-check rows already checked) }. Returns counts only, never names or numbers.
//
// RULES (accuracy first, a doubtful match is flagged and not used):
//   email   the real Phorest email wins. A respond.io email is used only when the phone found the contact exactly, the phone is not
//           held by another live Phorest client, and the two names agree (same or sharing a first or last name). Otherwise it is
//           kept in email_respond and flagged "respond.io email not confirmed".
//   gaps    no phone, no email, not in Phorest list, archived in Phorest, phone shared with another client, name differs in respond.io,
//           no respond.io contact, respond.io email not confirmed, email differs (Phorest vs respond.io).
import { createClient } from "npm:@supabase/supabase-js@2";

const API = "https://api.respond.io/v2";
const json = (o: any, status = 200) => new Response(JSON.stringify(o, null, 1), { status, headers: { "Content-Type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const tok = (s: any) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^\p{L}\s]/gu, " ").split(/\s+/).filter((t) => t.length > 1);

function nameCheck(phorest: string | null, respond: string | null): string {
  const a = tok(phorest), b = tok(respond);
  if (!b.length) return "no name";
  if (!a.length) return "no name";
  if (a.join(" ") === b.join(" ")) return "same";
  if (a.some((t) => b.includes(t))) return "similar";
  return "different";
}

async function rio(token: string, path: string) {
  for (let i = 0; ; i++) {
    const r = await fetch(API + path, { headers: { Authorization: "Bearer " + token } });
    if ((r.status === 429 || r.status >= 500) && i < 3) { await sleep(1500 * (i + 1)); continue; }
    let data: any = null; try { data = JSON.parse(await r.text()); } catch (_) { /* not JSON */ }
    return { status: r.status, data };
  }
}

Deno.serve(async (req) => {
  let body: any = {};
  if (req.method === "POST") { try { body = await req.json(); } catch (_) { /* no body */ } }
  const token = Deno.env.get("RESPOND_TOKEN") || "";
  if (!token) return json({ ok: false, missing_secrets: ["RESPOND_TOKEN"] });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const until = Date.now() + 100_000;
  const limit = Math.min(Number(body.limit) || 300, 600);

  let q = sb.from("complaint_clients").select("*").order("complaints", { ascending: false }).limit(limit);
  if (body.force !== true) q = q.is("checked_at", null);
  const { data: rows, error } = await q;
  if (error) return json({ ok: false, error: error.message });

  const out = { rows_this_call: (rows || []).length, checked: 0, contact_found: 0, no_contact: 0, no_phone_skipped: 0, email_used_from_respond: 0,
    email_not_confirmed: 0, name_same: 0, name_similar: 0, name_different: 0, name_none: 0, written: 0, stopped_early: false };
  const updates: any[] = [];
  let i = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (i < (rows || []).length) {
      if (Date.now() > until) { out.stopped_early = true; return; }
      const row = (rows || [])[i++];
      let contact: any = null;
      if (row.phone) { const r = await rio(token, "/contact/phone:" + row.phone); if (r.status === 200 && r.data && r.data.id) contact = r.data; }
      else if (row.respond_contact_id) { const r = await rio(token, "/contact/id:" + row.respond_contact_id); if (r.status === 200 && r.data && r.data.id) contact = r.data; }
      else out.no_phone_skipped++;
      out.checked++;
      if (contact) out.contact_found++; else if (row.phone) out.no_contact++;

      const respondName = contact ? [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() || null : null;
      const emailRespond = contact && contact.email ? String(contact.email).trim().toLowerCase() : (row.email_respond || null);
      const nc = contact ? nameCheck(row.name, respondName) : "no respond.io contact";
      if (nc === "same") out.name_same++; else if (nc === "similar") out.name_similar++; else if (nc === "different") out.name_different++; else out.name_none++;

      const ep: string | null = row.email_phorest || null;
      let email = ep, source: string | null = ep ? "phorest" : null;
      const trusted = !!contact && !!row.phone && !row.phone_shared && (nc === "same" || nc === "similar");
      if (!ep && emailRespond && trusted) { email = emailRespond; source = "respond.io"; out.email_used_from_respond++; }
      const gaps: string[] = [];
      if (!row.phone) gaps.push("no phone");
      if (!email) gaps.push("no email");
      if (row.phorest_id && !row.in_phorest) gaps.push("not in Phorest list");
      if (row.archived) gaps.push("archived in Phorest");
      if (row.phone_shared) gaps.push("phone shared with another client");
      if (nc === "different") gaps.push("name differs in respond.io");
      if (row.phone && !contact) gaps.push("no respond.io contact");
      if (emailRespond && !email) { gaps.push("respond.io email not confirmed"); out.email_not_confirmed++; }
      if (ep && emailRespond && ep !== emailRespond) gaps.push("email differs (Phorest vs respond.io)");
      updates.push({ client_key: row.client_key, respond_contact_id: contact ? Number(contact.id) : (row.respond_contact_id || null),
        respond_name: respondName, email_respond: emailRespond, name_check: nc, email, email_source: source,
        gaps: gaps.join(", ") || null, checked_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    }
  }));
  for (let k = 0; k < updates.length; k += 100) {
    const { error: e } = await sb.from("complaint_clients").upsert(updates.slice(k, k + 100), { onConflict: "client_key" });
    if (e) return json({ ok: false, error: "write: " + e.message, ...out });
    out.written += Math.min(100, updates.length - k);
  }
  const { count } = await sb.from("complaint_clients").select("client_key", { count: "exact", head: true }).is("checked_at", null);
  return json({ ok: true, ...out, still_to_check: count });
});
