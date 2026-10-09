// respond.io status for the Lost Clients campaign lists (Kate, 9 Oct 2026).
// For every phone number on lost_lists_base it asks respond.io whether the number is a contact,
// whether it is blocked, and when the client last wrote to us (newest of their last 50 messages),
// and keeps the answer in lost_wa_status. The page turns that into "WhatsApp active" (wrote in the
// last 12 months), "Replied 12-18 months ago", "No reply seen", "Text only" or "No number".
// Reads respond.io's Developer API with secret RESPOND_TOKEN (Kate's workspace 250275).
//
// Cron: every minute from 22:00 to 22:59 UTC (migrations/lost_lists_cron.sql), after
// lost_lists_refresh() rebuilt the client table at 21:50. One run takes numbers in batches
// of 200, ten at a time, for up to about 25 seconds, oldest check first, and skips any number
// checked in the last 20 hours, so the later runs only finish what the first left, and a run
// at any other time is harmless. It returns counts only, never a number or a name.
// Body (all optional): { stale_hours, batch, budget_s }.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const TOK = Deno.env.get('RESPOND_TOKEN') || '';
const API = 'https://api.respond.io/v2';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function rio(path: string): Promise<Response> {
  let r = await fetch(API + path, { headers: { Authorization: `Bearer ${TOK}` } });
  for (let i = 0; i < 3 && r.status === 429; i++) {
    await sleep(Math.min(Number(r.headers.get('retry-after') || 2), 10) * 1000 + 300);
    r = await fetch(API + path, { headers: { Authorization: `Bearer ${TOK}` } });
  }
  return r;
}

// messageId / 1e6 is the message time in seconds.
async function check(phone: string) {
  const row: Record<string, unknown> = { phone, found: false, is_blocked: false, err: null };
  try {
    const r = await rio('/contact/phone:' + encodeURIComponent(phone));
    if (r.status === 404) return row;
    if (!r.ok) { row.err = `contact ${r.status}`; return row; }
    const c = await r.json();
    row.found = true;
    row.contact_id = c.id;
    row.is_blocked = !!c.isBlocked;
    const m = await rio(`/contact/id:${c.id}/message/list?limit=50`);
    if (m.ok) {
      const mj = await m.json();
      let li = 0, lo = 0;
      for (const it of (mj.items || mj.data || [])) {
        const t = Number(it.messageId);
        if (it.traffic === 'incoming' && t > li) li = t;
        if (it.traffic === 'outgoing' && t > lo) lo = t;
      }
      row.last_in = li ? li / 1e6 : null;
      row.last_out = lo ? lo / 1e6 : null;
    } else row.err = `msgs ${m.status}`;
  } catch (e) { row.err = String(e).slice(0, 200); }
  return row;
}

Deno.serve(async (req) => {
  let body: any = {};
  if (req.method === 'POST') { try { body = await req.json(); } catch (_) {} }
  if (!TOK) return new Response(JSON.stringify({ error: 'no token' }), { status: 500 });
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const stale = `${Number(body.stale_hours) || 20} hours`;
  const batch = Math.min(Number(body.batch) || 200, 400);
  const until = Date.now() + (Number(body.budget_s) || 25) * 1000;
  let done = 0, found = 0, errs = 0;
  while (Date.now() < until) {
    const { data: phones, error } = await sb.rpc('lost_wa_queue', { p_limit: batch, p_stale: stale });
    if (error) return new Response(JSON.stringify({ error: error.message, done }), { status: 500 });
    if (!phones || !phones.length) break;
    const rows: Record<string, unknown>[] = [];
    let i = 0;
    const worker = async () => { while (i < phones.length) rows.push(await check(phones[i++])); };
    await Promise.all(Array.from({ length: 10 }, worker));
    const { error: e2 } = await sb.rpc('lost_wa_save', { p_rows: rows });
    if (e2) return new Response(JSON.stringify({ error: e2.message, done }), { status: 500 });
    done += rows.length;
    found += rows.filter((r) => r.found).length;
    errs += rows.filter((r) => r.err).length;
  }
  const { data: left } = await sb.rpc('lost_wa_queue', { p_limit: 5000, p_stale: stale });
  const now = new Date().toISOString();
  await sb.from('sync_health').upsert({ name: 'respond-status-sync', last_run_at: now, last_ok_at: now, last_error: null }, { onConflict: 'name' }).then(() => {}, () => {});
  return new Response(JSON.stringify({ checked: done, found, errors: errs, left: (left || []).length }), { headers: { 'Content-Type': 'application/json' } });
});
