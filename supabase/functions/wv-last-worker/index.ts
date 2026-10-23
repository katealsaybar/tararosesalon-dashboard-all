// Wellness Voucher Blast 4, the last push: the WhatsApp sender (Kate, 23 Oct 2026). Takes the messages the Blast 4 send panel queued (wv_last_jobs,
// migrations/wv_last_send.sql) and sends each one through respond.io's Developer API as a WhatsApp template message from the channel Call Center 2 (id 569496),
// then tags the contact in respond.io (wv-last-push, wv-last-push-warm | clean). The two templates (wellness_voucher_last_push_warm and _new, English UK) are
// approved in Meta; each takes one variable, the first name. Same shape as lost-send-worker, with its own queue, switch and window.
// Reads and writes respond.io with secret RESPOND_TOKEN (workspace 250275).
//
// wv_last_claim() decides what may go: the kill switch (wv_last_config.enabled), the Dubai send window and each job's own time (run_at) are checked THERE,
// so calling this function at the wrong time just returns "nothing to do". A test message (wv_last_test) ignores the switch and window.
// Before each send it asks respond.io: is she a contact, is she blocked, has she written STOP. If so she is skipped, and a STOP goes on the opt-out list.
// A send that respond.io refuses for good (4xx) is marked failed with respond.io's own words; a 429 or 5xx is retried (5 minutes later, three tries).
// A message that was posted when the connection dropped is marked failed for a person to check, never re-sent on its own (no double messages).
//
// Cron: every minute from 06:00 to 15:59 UTC, which is 10:00 to 19:59 in Dubai (migrations/wv_last_send.sql). The page also calls it straight after queueing, so the
// page needs CORS. Returns counts only, never a number or a name.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const TOK = Deno.env.get('RESPOND_TOKEN') || '';
const API = 'https://api.respond.io/v2';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const BUDGET_MS = 40_000;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Job = { id: number; phone: string; channel_id: number; seg: string; params: string[]; body_text: string; is_test: boolean; attempts: number; template: string; language: string };

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

// The template message as respond.io's own "View payload" shows it: a body component with the filled text and the parameters. The two quick-reply buttons
// (Reserve mine / Tell me more, Not for me) belong to the approved template and are added by WhatsApp.
function buildPayload(j: Job) {
  return {
    channelId: j.channel_id,
    message: {
      type: 'whatsapp_template',
      template: {
        name: j.template,
        languageCode: j.language,
        components: [{ type: 'body', text: j.body_text, parameters: j.params.map((p) => ({ type: 'text', text: p })) }],
      },
    },
  };
}

async function tagContact(contactId: number, tags: string[]): Promise<string | null> {
  const r = await rio('POST', `/contact/id:${contactId}/tag`, tags);
  if (r.ok) return null;
  return `tag ${r.status} ${await errText(r)}`;
}

// Has this contact written STOP (or UNSUBSCRIBE, OPT OUT, DND, the whole message) in her last 20 incoming messages?
async function hasStop(contactId: number): Promise<boolean> {
  const m = await rio('GET', `/contact/id:${contactId}/message/list?limit=20`);
  if (!m.ok) return false;
  const mj = await m.json();
  for (const it of (mj.items || mj.data || [])) {
    if (it.traffic !== 'incoming') continue;
    const txt = String(it.message?.text ?? it.text ?? '').trim();
    if (/^(stop|unsubscribe|opt[ -]?out|dnd)\s*[.!]*$/i.test(txt)) return true;
  }
  return false;
}

async function sendOne(sb: ReturnType<typeof createClient>, j: Job): Promise<'sent' | 'retry' | 'failed' | 'skipped'> {
  const finish = (status: string, error: string | null, extra: Record<string, unknown> = {}) =>
    sb.rpc('wv_last_finish', { p_id: j.id, p_status: status, p_error: error, p_message_id: null, p_contact_id: null, p_retry_min: 5, ...extra });
  let posting = false;
  try {
    // 1. Is she a contact, and may we write to her?
    const c = await rio('GET', '/contact/phone:' + encodeURIComponent(j.phone));
    if (c.status === 404) { await finish('failed', 'Not a contact in respond.io yet, so no WhatsApp chat to start. Message her by hand.'); return 'failed'; }
    if (c.status === 429 || c.status >= 500) { await finish('queued', `contact ${c.status}`); return 'retry'; }
    if (!c.ok) { await finish('failed', `contact ${c.status} ${await errText(c)}`); return 'failed'; }
    const contact = await c.json();
    if (contact.isBlocked) { await finish('skipped', 'Blocked in respond.io', { p_contact_id: contact.id }); return 'skipped'; }

    // 2. Has she told us to stop? (her last few incoming messages)
    if (!j.is_test && await hasStop(contact.id)) {
      await sb.rpc('lost_send_add_optout', { p_phone: j.phone, p_reason: 'Wrote STOP in respond.io' });
      await finish('skipped', 'She wrote STOP, so she is on the opt-out list', { p_contact_id: contact.id });
      return 'skipped';
    }

    // 3. Send.
    posting = true;
    let cid = contact.id;
    let s = await rio('POST', `/contact/id:${cid}/message`, buildPayload(j));
    // Two contacts can hold one number: the phone lookup finds one, the channel has the other, and respond.io answers 400 "already connected to a contact"
    // with the id of the one it means. Send to that one instead (after the same STOP check on it).
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
    if (posting) { await finish('failed', 'The connection dropped while sending. Look in respond.io before you retry; it may have gone.'); return 'failed'; }
    await finish('queued', String(e).slice(0, 200));
    return 'retry';
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
  if (!TOK) return json({ error: 'no token' }, 500);
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const until = Date.now() + BUDGET_MS;
  const n = { claimed: 0, sent: 0, retry: 0, failed: 0, skipped: 0, tagged: 0, tag_failed: 0 };

  const { data: jobs, error } = await sb.rpc('wv_last_claim', {});
  if (error) return json({ error: error.message }, 500);
  for (const j of (jobs || []) as Job[]) {
    if (Date.now() > until) { await sb.rpc('wv_last_finish', { p_id: j.id, p_status: 'queued', p_error: 'run out of time', p_message_id: null, p_contact_id: null, p_retry_min: 1 }); continue; }
    n.claimed++;
    const r = await sendOne(sb, j);
    n[r === 'sent' ? 'sent' : r === 'retry' ? 'retry' : r === 'failed' ? 'failed' : 'skipped']++;
    await sleep(400);   // well inside respond.io's rate limit
  }

  // Tags for sent messages (this run's and any an earlier run could not tag).
  const { data: todo } = await sb.rpc('wv_last_tag_todo', { p_n: 30 });
  for (const t of (todo || []) as { id: number; contact_id: number; tags: string[] }[]) {
    if (Date.now() > until) break;
    const err = await tagContact(t.contact_id, t.tags);
    await sb.rpc('wv_last_tag_done', { p_id: t.id, p_err: err });
    if (err) n.tag_failed++; else n.tagged++;
    await sleep(250);
  }

  if (n.claimed || n.tagged || n.tag_failed) {
    const now = new Date().toISOString();
    await sb.from('sync_health').upsert({ name: 'wv-last-worker', last_run_at: now, last_ok_at: n.failed ? undefined : now, last_error: n.failed ? `${n.failed} failed` : null }, { onConflict: 'name' }).then(() => {}, () => {});
  }
  return json(n);
});
