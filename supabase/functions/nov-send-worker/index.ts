// November blasts: the WhatsApp sender (Kate, 4 Nov 2026). The twin of lost-send-worker for the Database Blasts, November page (migrations/nov_send.sql).
// Takes the messages the page queued (nov_send_jobs) and sends each one through respond.io's Developer API as a WhatsApp template message from ONE number, the call centre
// WhatsApp Brand Account (channel 572200), with the 4:5 artwork as the image header when the blast has one. It then looks at what respond.io says about the messages it sent
// (delivered, read, failed with Meta's error code, a reply of STOP) so the page can show live counts and the gate can pause the queue.
// Reads and writes respond.io with secret RESPOND_TOKEN (Kate's workspace 250275), the same token lost-send-worker uses.
//
// GUARDS (all in the database, nov_send_claim): nothing live is handed out unless nov_send_config.enabled is true AND dry_run is false AND the queue is not paused AND it is inside the
// Dubai window, and never more than slot_cap per slot_minutes (200 per 30 minutes). A DRY RUN row never reaches respond.io: this function marks it sent and moves on, so calling this
// function at the wrong time, or with the switches off, just returns "nothing to do". No tags are written to respond.io from here (another session does that).
// Before each live send it asks respond.io: is she a contact, is she blocked, has she written STOP. If so she is skipped, and a STOP goes on the shared opt-out list.
// A send that respond.io refuses for good (4xx) is marked failed with its own words and is NOT retried; a 429 or 5xx is retried (5 minutes later, three tries). A connection that drops
// during the send call is marked failed, never re-sent (it may have gone): no double messages. Meta's per-user marketing cap (131049) arrives later as a failed delivery: no charge, never resent.
//
// Cron (not scheduled yet, see the bottom of migrations/nov_send.sql): every minute 05:00 to 17:59 UTC = 09:00 to 21:59 Dubai. The page's Run now button calls it too (Level 5).
//
// Header shape (4 Nov 2026): v1 sent a top-level link and v2 sent examples; Meta refused both with #132012 (header Format mismatch, nothing delivered). respond.io's API docs (Send a message, example
// 'WhatsApp Template') show the header as parameters [{type image, image {link}}], which is what v3 sends. The POST answer's messageId is the id in the message list, and a failure shows in the list as
// status [{value:'failed', message:'WhatsApp Business: Meta Error (#132012): ...'}] within a second, which deliveryOf() and errCode() read.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const TOK = Deno.env.get('RESPOND_TOKEN') || '';
const API = 'https://api.respond.io/v2';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const BUDGET_MS = 45_000;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Job = {
  id: number; phone: string; channel_id: number; tpl: string; language: string; params: string[]; body_text: string; image_url: string | null;
  dry: boolean; is_test: boolean; attempts: number;
};

async function rio(method: string, path: string, body?: unknown): Promise<Response> {
  const go = () => fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${TOK}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let r = await go();
  // Reads wait out a 429 here; a send does not (it goes back to the queue and tries again in 5 minutes).
  for (let i = 0; method === 'GET' && i < 3 && r.status === 429; i++) {
    await sleep(Math.min(Number(r.headers.get('retry-after') || 2), 10) * 1000 + 300);
    r = await go();
  }
  return r;
}
const errText = async (r: Response) => { try { return (await r.text()).replace(/\s+/g, ' ').slice(0, 240); } catch (_) { return ''; } };

// The WhatsApp template message: the image header (when the blast has one) and the body with the filled text and its parameters. Buttons are part of the approved template, none added here.
function buildPayload(j: Job) {
  return {
    channelId: j.channel_id,
    message: {
      type: 'whatsapp_template',
      template: {
        name: j.tpl,
        languageCode: j.language,
        components: [
          ...(j.image_url ? [{ type: 'header', format: 'image', parameters: [{ type: 'image', image: { link: j.image_url } }] }] : []),
          { type: 'body', text: j.body_text, parameters: j.params.map((p) => ({ type: 'text', text: p })) },
        ],
      },
    },
  };
}

// STOP and the other ways of asking not to be written to (the same words respond-status-sync reads).
const OPT_WHOLE = /^\W*(stop|unsubscribe|opt[\s-]?out|dnd)\W*$/i;
const OPT_PHRASES: RegExp[] = [
  /\bdo\s*not\s+(contact|message|text|call|disturb|send)\b/i, /\bdon'?t\s+(contact|message|text|call|disturb|send)\b/i, /\bnot\s+interested\b/i, /\bremove\s+me\b/i,
  /\btake\s+me\s+off\b/i, /\bopt[\s-]?out\b/i, /\bunsubscribe\b/i, /\bleave\s+me\s+alone\b/i, /\bstop\s+(messaging|texting|contacting|sending|calling|these|this)\b/i, /\bdnd\b/i,
];
function msgText(it: any): string {
  const m = it?.message;
  const t = (m && (typeof m === 'string' ? m : m.text ?? m.caption)) ?? it?.text ?? '';
  return typeof t === 'string' ? t.trim() : '';
}
const isOptOut = (t: string) => OPT_WHOLE.test(t) || OPT_PHRASES.some((re) => re.test(t));

// Has this contact written STOP (the whole message) in her last 20 incoming messages? Checked just before a live send. "CANCEL" is the reminder's quick-reply button, not an opt-out.
async function hasStop(contactId: number): Promise<boolean> {
  const m = await rio('GET', `/contact/id:${contactId}/message/list?limit=20`);
  if (!m.ok) return false;
  const mj = await m.json();
  for (const it of (mj.items || mj.data || [])) {
    if (it.traffic !== 'incoming') continue;
    if (/^(stop|unsubscribe|opt[ -]?out|dnd)\s*[.!]*$/i.test(msgText(it))) return true;
  }
  return false;
}

// One job. Returns what happened, for the counts.
async function sendOne(sb: ReturnType<typeof createClient>, j: Job): Promise<'sent' | 'retry' | 'failed' | 'skipped'> {
  const finish = (status: string, error: string | null, extra: Record<string, unknown> = {}) =>
    sb.rpc('nov_send_finish', { p_id: j.id, p_status: status, p_error: error, p_message_id: null, p_contact_id: null, p_retry_min: 5, ...extra });
  // A dry run goes through the queue and the pace, but nothing is posted.
  if (j.dry) { await finish('sent', null, { p_message_id: 'dry-run' }); return 'sent'; }
  let posting = false;
  try {
    const c = await rio('GET', '/contact/phone:' + encodeURIComponent(j.phone));
    if (c.status === 404) { await finish('failed', 'Not a contact in respond.io yet, so no WhatsApp chat to start.'); return 'failed'; }
    if (c.status === 429 || c.status >= 500) { await finish('queued', `contact ${c.status}`); return 'retry'; }
    if (!c.ok) { await finish('failed', `contact ${c.status} ${await errText(c)}`); return 'failed'; }
    const contact = await c.json();
    if (contact.isBlocked) { await finish('skipped', 'Blocked in respond.io', { p_contact_id: contact.id }); return 'skipped'; }

    if (!j.is_test && await hasStop(contact.id)) {
      await sb.rpc('lost_send_add_optout', { p_phone: j.phone, p_reason: 'Wrote STOP in respond.io' });
      await finish('skipped', 'She wrote STOP, so she is on the opt-out list', { p_contact_id: contact.id });
      return 'skipped';
    }

    posting = true;
    let cid = contact.id;
    let s = await rio('POST', `/contact/id:${cid}/message`, buildPayload(j));
    // Two contacts can hold one number: respond.io answers 400 "already connected to a contact" with the id it means. Send to that one (after the same STOP check).
    if (s.status === 400) {
      const txt = await errText(s);
      const m = /already connected to a contact.*?"contactId":\s*(\d+)/.exec(txt);
      if (m && Number(m[1]) !== cid) {
        cid = Number(m[1]);
        if (!j.is_test && await hasStop(cid)) {
          posting = false;
          await sb.rpc('lost_send_add_optout', { p_phone: j.phone, p_reason: 'Wrote STOP in respond.io' });
          await finish('skipped', 'She wrote STOP, so she is on the opt-out list', { p_contact_id: cid });
          return 'skipped';
        }
        s = await rio('POST', `/contact/id:${cid}/message`, buildPayload(j));
      } else { posting = false; await finish('failed', `respond.io 400: ${txt}`, { p_contact_id: contact.id }); return 'failed'; }
    }
    posting = false;
    if (s.status === 429 || s.status >= 500) { await finish('queued', `send ${s.status} ${await errText(s)}`); return 'retry'; }
    if (!s.ok) { await finish('failed', `respond.io ${s.status}: ${await errText(s)}`, { p_contact_id: cid }); return 'failed'; }
    let mid: string | null = null;
    try { const sj = await s.json(); mid = String(sj.messageId ?? sj.id ?? '') || null; } catch (_) { /* a body is not needed */ }
    await finish('sent', null, { p_message_id: mid, p_contact_id: cid });
    return 'sent';
  } catch (e) {
    // During the send call we cannot know whether the message went: failed for a person to check in respond.io, never re-sent on its own.
    if (posting) { await finish('failed', 'The connection dropped while sending. Look in respond.io before you retry; it may have gone.'); return 'failed'; }
    await finish('queued', String(e).slice(0, 200));
    return 'retry';
  }
}

// ── what respond.io says about a message we sent ──────────────────────────────────────────────
// The status of a message comes as a list of {value, timestamp}, a single value or a plain string (respond-status-sync reads it the same way). Best word reached wins.
function statusWords(it: any): string[] {
  const raw = it?.status ?? it?.message?.status ?? it?.deliveryStatus;
  const out: string[] = [];
  const add = (v: any) => {
    if (typeof v === 'string') out.push(v.trim().toLowerCase());
    else if (v && typeof v === 'object') { const x = v.value ?? v.status ?? v.name; if (typeof x === 'string') out.push(x.trim().toLowerCase()); }
  };
  if (Array.isArray(raw)) raw.forEach(add); else add(raw);
  return out;
}
function deliveryOf(it: any): string | null {
  const w = statusWords(it);
  if (!w.length) return null;
  if (w.some((x) => x === 'read' || x === 'seen')) return 'read';
  if (w.some((x) => x === 'delivered')) return 'delivered';
  if (w.some((x) => x === 'failed' || x === 'undelivered' || x === 'error')) return 'failed';
  if (w.some((x) => x === 'sent' || x === 'pending' || x === 'queued' || x === 'accepted')) return 'sent';
  return null;
}
// Meta's code (131049 and the like) is somewhere in the failed status or the message error; read the first six-digit 13xxxx number out of the raw JSON.
function errCode(it: any): string | null {
  const raw = JSON.stringify([it?.status, it?.message?.status, it?.error, it?.message?.error, it?.failedReason, it?.message?.failedReason]);
  const m = /\b(13\d{4})\b/.exec(raw) || /"code"\s*:\s*"?(\d{3,6})"?/.exec(raw);
  return m ? m[1] : null;
}

// v4 (4 Nov 2026, evening): why a delivery failed, in Meta's code and plain words, so the page can list it under 'Why some did not go'.
// Every string inside the status and error parts of one message item (never the message text), minus the bare status words.
function strsIn(o: any, out: string[], depth = 0) {
  if (o == null || depth > 6) return;
  if (typeof o === 'string') { out.push(o.replace(/\s+/g, ' ').trim()); return; }
  if (Array.isArray(o)) { o.forEach((x) => strsIn(x, out, depth + 1)); return; }
  if (typeof o === 'object') for (const k of Object.keys(o)) strsIn(o[k], out, depth + 1);
}
const STATUS_WORDS = new Set(['failed', 'sent', 'delivered', 'read', 'pending', 'queued', 'accepted', 'undelivered', 'error', 'seen']);
function failReason(it: any): string {
  const parts: string[] = [];
  for (const p of [it?.status, it?.message?.status, it?.error, it?.message?.error, it?.failedReason, it?.message?.failedReason, it?.failure, it?.message?.failure]) strsIn(p, parts);
  const words = [...new Set(parts.filter((s) => s && !STATUS_WORDS.has(s.toLowerCase())))];
  const text = words.join(' | ');
  const raw = JSON.stringify([it?.status, it?.message?.status, it?.error, it?.message?.error, it?.failedReason, it?.message?.failedReason, it?.failure, it?.message?.failure]);
  const code = (/\b(13\d{4})\b/.exec(raw) || /"code"\s*:\s*"?(\d{3,6})"?/.exec(raw) || [])[1] || '';
  if (/ecosystem engagement/i.test(text) || code === '131049') return '131049: Meta limit on marketing messages to this client (not delivered, not charged)';
  if (/part of an experiment/i.test(text) || code === '130472') return "130472: Meta held it back, this client's number is part of an experiment (not charged)";
  if (text) return ((code ? code + ': ' : '') + text).slice(0, 160);
  if (code) return code + ': failed after respond.io accepted it';
  return ('Failed after respond.io accepted it, no reason in the message data: ' + JSON.stringify(it?.status ?? it?.message?.status ?? null)).slice(0, 160);
}

async function checkOne(sb: ReturnType<typeof createClient>, t: { id: number; contact_id: number; message_id: string | null; sent_at: string }): Promise<void> {
  const m = await rio('GET', `/contact/id:${t.contact_id}/message/list?limit=30`);
  if (!m.ok) return;   // not counted as a look: it is tried again on the next run
  const mj = await m.json();
  const items: any[] = mj.items || mj.data || [];
  const sentUs = new Date(t.sent_at).getTime() * 1000;   // messageId is microseconds since the epoch
  let out = t.message_id && t.message_id !== 'dry-run' ? items.find((it) => it.traffic === 'outgoing' && String(it.messageId) === t.message_id) : null;
  if (!out) {   // no exact id (respond.io may answer with another id): the first outgoing message at or after the moment we sent it
    out = items.filter((it) => it.traffic === 'outgoing' && Number(it.messageId) >= sentUs - 60_000_000).sort((a, b) => Number(a.messageId) - Number(b.messageId))[0] || null;
  }
  const delivery = out ? deliveryOf(out) : null;
  const code = out && delivery === 'failed' ? (failReason(out) || errCode(out)) : null;
  const after = out ? Number(out.messageId) : sentUs;
  const stop = items.some((it) => it.traffic === 'incoming' && Number(it.messageId) > after && isOptOut(msgText(it)));
  await sb.rpc('nov_send_status_save', { p_id: t.id, p_delivery: delivery, p_err_code: code, p_stop: stop });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
  if (!TOK) return json({ error: 'no token' }, 500);
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const until = Date.now() + BUDGET_MS;
  const n = { claimed: 0, sent: 0, retry: 0, failed: 0, skipped: 0, looked: 0, reasons: 0 };

  const { data: jobs, error } = await sb.rpc('nov_send_claim', {});
  if (error) return json({ error: error.message }, 500);
  for (const j of (jobs || []) as Job[]) {
    if (Date.now() > until) { await sb.rpc('nov_send_finish', { p_id: j.id, p_status: 'queued', p_error: 'run out of time', p_message_id: null, p_contact_id: null, p_retry_min: 1 }); continue; }
    n.claimed++;
    const r = await sendOne(sb, j);
    n[r === 'sent' ? 'sent' : r === 'retry' ? 'retry' : r === 'failed' ? 'failed' : 'skipped']++;
    if (!j.dry) await sleep(400);   // well inside respond.io's rate limit
  }

  // Delivery and STOP replies for what went out earlier (5 minutes, 30 minutes, 2 hours, 8 hours and 24 hours after each send).
  const { data: todo } = await sb.rpc('nov_send_status_todo', { p_n: 25 });
  for (const t of (todo || []) as { id: number; contact_id: number; message_id: string | null; sent_at: string }[]) {
    if (Date.now() > until) break;
    try { await checkOne(sb, t); n.looked++; } catch (_) { /* tried again next run */ }
    await sleep(300);
  }

  // v4: failed deliveries that have no reason saved yet, 25 a run (read only on respond.io, then one database save each)
  const { data: redo } = await sb.from('nov_send_jobs').select('id, contact_id, message_id, sent_at')
    .eq('delivery', 'failed').is('err_code', null).not('contact_id', 'is', null).eq('is_test', false).order('id').limit(25);
  for (const t of (redo || []) as { id: number; contact_id: number; message_id: string | null; sent_at: string }[]) {
    if (Date.now() > until) break;
    try { await checkOne(sb, t); n.reasons++; } catch (_) { /* tried again next run */ }
    await sleep(300);
  }

  if (n.claimed || n.looked || n.reasons) {
    const now = new Date().toISOString();
    await sb.from('sync_health').upsert({ name: 'nov-send-worker', last_run_at: now, last_ok_at: n.failed ? undefined : now, last_error: n.failed ? `${n.failed} failed` : null }, { onConflict: 'name' }).then(() => {}, () => {});
  }
  return json(n);
});
