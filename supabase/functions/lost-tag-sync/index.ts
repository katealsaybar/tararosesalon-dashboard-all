// Lost Clients tags in respond.io (Kate, 15 Oct 2026): writes lost-replied, lost-booked and lost-optout onto the
// contacts we messaged, so reception can see them in the respond.io inbox without tagging by hand.
//   lost-replied : the client wrote to us after our message (any incoming message newer than the send).
//   lost-booked  : the client has a booking from today on in Phorest (client_bookings).
//   lost-optout  : after our message she sent STOP / not interested / remove me / do not message etc., or the
//                  contact already carries a dnd / do not contact / unsubscribed / opt out tag.
// Who is looked at: rpc lost_tag_candidates (service role only). source 'jobs' = clients the site sent to (default),
// 'recent' = clients respond.io shows an outgoing message to since campaign_from (for dry runs).
// A tag the contact already has is skipped. Nothing else on the contact is touched and no tag is ever removed.
// SAFE BY DEFAULT: without { live: true } it only reports (counts and last 4 digits), it never writes a tag.
// Body (all optional): { live, source, since, budget_s }. Cron (when approved): 06:00, 10:00 and 14:00 UTC
// = 10:00, 14:00 and 18:00 Dubai, inside the send worker's hours. Reads/writes respond.io with secret RESPOND_TOKEN.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const TOK = Deno.env.get('RESPOND_TOKEN') || '';
const API = 'https://api.respond.io/v2';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function rio(method: string, path: string, body?: unknown): Promise<Response> {
  const init = () => ({ method, headers: { Authorization: `Bearer ${TOK}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  let r = await fetch(API + path, init());
  for (let i = 0; i < 3 && r.status === 429; i++) {
    await sleep(Math.min(Number(r.headers.get('retry-after') || 2), 10) * 1000 + 300);
    r = await fetch(API + path, init());
  }
  return r;
}

// Same wording the nightly opt-out sync uses (respond-status-sync).
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
const OPT_TAG = /(\bdnd\b|do[\s_-]*not[\s_-]*(contact|disturb|message)|unsubscri|opt[\s_-]*out)/i;
function isOptText(text: string): boolean { return OPT_WHOLE.test(text) || OPT_PHRASES.some((re) => re.test(text)); }
function msgText(it: any): string {
  const m = it?.message;
  const t = (m && (typeof m === 'string' ? m : m.text ?? m.caption)) ?? it?.text ?? '';
  return typeof t === 'string' ? t : '';
}

type Cand = { contact_id: number; phone: string; client_key: string; sent_at: string; booked: boolean };

async function look(c: Cand) {
  const out = { contact_id: c.contact_id, last4: String(c.phone).slice(-4), have: [] as string[], add: [] as string[], replied: false, optout: false, booked: !!c.booked, err: null as string | null };
  try {
    const r = await rio('GET', `/contact/id:${c.contact_id}`);
    if (!r.ok) { out.err = `contact ${r.status}`; return out; }
    const j = await r.json();
    const tags: string[] = Array.isArray(j.tags) ? j.tags.map((x: any) => String(x?.name ?? x)) : [];
    out.have = tags.filter((t) => t.startsWith('lost-'));
    const sentSec = new Date(c.sent_at).getTime() / 1000;
    const m = await rio('GET', `/contact/id:${c.contact_id}/message/list?limit=50`);
    if (!m.ok) { out.err = `msgs ${m.status}`; return out; }
    const mj = await m.json();
    for (const it of (mj.items || mj.data || [])) {
      if (it.traffic !== 'incoming') continue;
      const t = Number(it.messageId) / 1e6;
      if (!(t > sentSec)) continue;
      out.replied = true;
      if (isOptText(msgText(it))) out.optout = true;
    }
    if (tags.some((t) => OPT_TAG.test(t))) out.optout = true;
    if (out.replied && !tags.includes('lost-replied')) out.add.push('lost-replied');
    if (out.booked && !tags.includes('lost-booked')) out.add.push('lost-booked');
    if (out.optout && !tags.includes('lost-optout')) out.add.push('lost-optout');
  } catch (e) { out.err = String(e).slice(0, 200); }
  return out;
}

Deno.serve(async (req) => {
  let body: any = {};
  if (req.method === 'POST') { try { body = await req.json(); } catch (_) {} }
  if (!TOK) return new Response(JSON.stringify({ error: 'no token' }), { status: 500 });
  const live = body.live === true;
  const source = body.source === 'recent' ? 'recent' : 'jobs';
  const until = Date.now() + (Number(body.budget_s) || 50) * 1000;
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: cands, error } = await sb.rpc('lost_tag_candidates', { p_source: source, p_since: body.since || null });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  const list = (cands || []) as Cand[];
  const rows: Awaited<ReturnType<typeof look>>[] = [];
  let i = 0;
  const worker = async () => { while (i < list.length && Date.now() < until) rows.push(await look(list[i++])); };
  await Promise.all(Array.from({ length: 6 }, worker));

  let written = 0, failed = 0;
  if (live) {
    for (const r of rows) {
      if (!r.add.length || Date.now() > until + 8000) continue;
      const t = await rio('POST', `/contact/id:${r.contact_id}/tag`, r.add);
      if (t.ok) written++; else failed++;
    }
    const now = new Date().toISOString();
    await sb.from('sync_health').upsert({ name: 'lost-tag-sync', last_run_at: now, last_ok_at: failed ? null : now, last_error: failed ? `${failed} tag writes failed` : null }, { onConflict: 'name' }).then(() => {}, () => {});
  }
  const would: Record<string, number> = {};
  for (const r of rows) for (const t of r.add) would[t] = (would[t] || 0) + 1;
  return new Response(JSON.stringify({
    live, source, candidates: list.length, checked: rows.length, errors: rows.filter((r) => r.err).length,
    replied: rows.filter((r) => r.replied).length, booked: rows.filter((r) => r.booked).length, optout: rows.filter((r) => r.optout).length,
    already_tagged: rows.filter((r) => r.have.length).length,
    [live ? 'tags_added' : 'would_add']: would, contacts_written: written, write_failures: failed,
    examples: rows.filter((r) => r.add.length || r.err).slice(0, 15).map((r) => ({ last4: r.last4, add: r.add, replied: r.replied, booked: r.booked, optout: r.optout, err: r.err })),
  }), { headers: { 'Content-Type': 'application/json' } });
});
