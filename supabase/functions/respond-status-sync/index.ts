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
// Opt-outs (Kate, 12 Oct 2026, Cristine's question): it also looks for a client who asked not to be messaged:
// an incoming message that is only STOP / UNSUBSCRIBE / DND, or says do not contact / do not disturb /
// not interested / remove me / opt out / leave me alone, or a contact tag or lifecycle that says so.
// It keeps the matched words (opt_phrase, never the message), when (opt_at) and the tags, never the text.
// Body (all optional): { stale_hours, batch, budget_s, dry_run, offset }. dry_run checks one batch
// (from offset) without saving and returns counts and the matched words only.
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


const OPT_WHOLE = /^\W*(stop|unsubscribe|opt[\s-]?out|dnd)\W*$/i;
const OPT_PHRASES: RegExp[] = [
  /\bdo\s*not\s+(contact|message|text|call|disturb|send)\b/i,
  /\bdon'?t\s+(contact|message|text|call|disturb|send)\b/i,
  /\bnot\s+interested\b/i,
  /\bremove\s+me\b/i,
  /\btake\s+me\s+off\b/i,
  /\bopt[\s-]?out\b/i,
  /\bunsubscribe\b/i,
  /\bleave\s+me\s+alone\b/i,
  /\bstop\s+(messaging|texting|contacting|sending|calling|these|this)\b/i,
  /\bdnd\b/i,
];
// Tags like 'stop josh course' or 'not interested_elevate' only decline one campaign, so only the general ones count.
const OPT_TAG = /(\bdnd\b|do[\s_-]*not[\s_-]*(contact|disturb|message)|unsubscri|opt[\s_-]*out)/i;

// The matched words only, never the message.
function optPhrase(text: string): string | null {
  if (OPT_WHOLE.test(text)) return text.replace(/\W+/g, ' ').trim().toLowerCase().slice(0, 30);
  for (const re of OPT_PHRASES) { const m = text.match(re); if (m) return m[0].replace(/\s+/g, ' ').toLowerCase().slice(0, 30); }
  return null;
}
function msgText(it: any): string {
  const m = it?.message;
  const t = (m && (typeof m === 'string' ? m : m.text ?? m.caption)) ?? it?.text ?? '';
  return typeof t === 'string' ? t : '';
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
    const tags: string[] = Array.isArray(c.tags) ? c.tags.map((x: any) => String(x?.name ?? x)).slice(0, 60) : [];
    row.tags = tags;
    row.opted_out = false;
    const tagHit = tags.find((x) => OPT_TAG.test(x));
    const lc = c.lifecycle == null ? '' : String(c.lifecycle?.name ?? c.lifecycle);
    const m = await rio(`/contact/id:${c.id}/message/list?limit=50`);
    if (m.ok) {
      const mj = await m.json();
      let li = 0, lo = 0, oi = 0, op: string | null = null;
      for (const it of (mj.items || mj.data || [])) {
        const t = Number(it.messageId);
        if (it.traffic === 'incoming' && t > li) li = t;
        if (it.traffic === 'outgoing' && t > lo) lo = t;
        if (it.traffic === 'incoming' && t > oi) { const ph = optPhrase(msgText(it)); if (ph) { oi = t; op = ph; } }
      }
      if (oi) { row.opted_out = true; row.opt_phrase = op; row.opt_at = oi / 1e6; row.opt_source = 'message'; }
      row.last_in = li ? li / 1e6 : null;
      row.last_out = lo ? lo / 1e6 : null;
    } else row.err = `msgs ${m.status}`;
    if (!row.opted_out && tagHit) { row.opted_out = true; row.opt_phrase = tagHit.slice(0, 30).toLowerCase(); row.opt_at = null; row.opt_source = 'tag'; }
    if (!row.opted_out && lc && OPT_TAG.test(lc)) { row.opted_out = true; row.opt_phrase = lc.slice(0, 30).toLowerCase(); row.opt_at = null; row.opt_source = 'lifecycle'; }
  } catch (e) { row.err = String(e).slice(0, 200); }
  return row;
}

Deno.serve(async (req) => {
  let body: any = {};
  if (req.method === 'POST') { try { body = await req.json(); } catch (_) {} }
  if (!TOK) return new Response(JSON.stringify({ error: 'no token' }), { status: 500 });
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const stale = `${body.stale_hours != null && Number.isFinite(Number(body.stale_hours)) ? Number(body.stale_hours) : 20} hours`;
  const batch = Math.min(Number(body.batch) || 200, 400);
  const until = Date.now() + (Number(body.budget_s) || 25) * 1000;
  if (body.dry_run) {
    const off = Math.max(0, Number(body.offset) || 0);
    const { data: all, error } = await sb.rpc('lost_wa_queue', { p_limit: Math.min(off + batch, 5000), p_stale: stale });
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    const phones: string[] = (all || []).slice(off);
    const rows: Record<string, unknown>[] = [];
    let i = 0;
    const worker = async () => { while (i < phones.length && Date.now() < until) rows.push(await check(phones[i++])); };
    await Promise.all(Array.from({ length: 10 }, worker));
    const hits = rows.filter((r) => r.opted_out);
    const tally: Record<string, number> = {};
    for (const r of hits) { const k = `${r.opt_source}: ${r.opt_phrase}`; tally[k] = (tally[k] || 0) + 1; }
    const tagCount: Record<string, number> = {};
    for (const r of rows) for (const t of (r.tags as string[]) || []) tagCount[t] = (tagCount[t] || 0) + 1;
    return new Response(JSON.stringify({ dry_run: true, checked: rows.length, found: rows.filter((r) => r.found).length,
      opted_out: hits.length, tally, top_tags: Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 40),
      examples: hits.slice(0, 12).map((r) => ({ last4: String(r.phone).slice(-4), src: r.opt_source, phrase: r.opt_phrase, days_ago: r.opt_at ? Math.round((Date.now() / 1000 - Number(r.opt_at)) / 86400) : null })) }),
      { headers: { 'Content-Type': 'application/json' } });
  }
  let done = 0, found = 0, errs = 0, opted = 0;
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
    opted += rows.filter((r) => r.opted_out).length;
  }
  const { data: left } = await sb.rpc('lost_wa_queue', { p_limit: 5000, p_stale: stale });
  const now = new Date().toISOString();
  await sb.from('sync_health').upsert({ name: 'respond-status-sync', last_run_at: now, last_ok_at: now, last_error: null }, { onConflict: 'name' }).then(() => {}, () => {});
  return new Response(JSON.stringify({ checked: done, found, opted_out: opted, errors: errs, left: (left || []).length }), { headers: { 'Content-Type': 'application/json' } });
});
