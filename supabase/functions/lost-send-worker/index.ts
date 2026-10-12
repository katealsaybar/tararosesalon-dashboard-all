// Lost Clients: the WhatsApp sender (Kate, 12 Oct 2026). Phase 1 of sending from the site instead of respond.io's own broadcast.
// Takes the messages the To message tab queued (lost_send_jobs, migrations/lost_send.sql) and sends each one through respond.io's Developer API
// as a WhatsApp template message from the client's own branch number, then tags the contact in respond.io.
// Reads and writes respond.io with secret RESPOND_TOKEN (Kate's workspace 250275), the same token respond-status-sync uses.
//
// lost_send_claim() decides what may go: the kill switch (lost_send_config.enabled), the Dubai send window, the daily cap and the run size are all
// checked THERE, so calling this function at the wrong time just returns "nothing to do". A test message (lost_send_test) ignores the switch and window.
// Before each send it asks respond.io: is she a contact, is she blocked, has she written STOP. If so she is skipped, and a STOP goes on the opt-out list.
// A send that respond.io refuses for good (4xx) is marked failed with respond.io's own words; a 429 or 5xx is retried (5 minutes later, three tries).
// Tags (lost_send_config.campaign_tag and lost-msg-<type>) go on after the send; a tag that fails is retried on later runs and never undoes the send.
//
// Cron: every minute from 06:00 to 15:59 UTC, which is 10:00 to 19:59 in Dubai (migrations/lost_send.sql, record at the bottom).
// The page also calls it straight after queueing so the first ones go out at once. Returns counts only, never a number or a name.
//
// WHAT TO CHECK ON THE FIRST TEST SEND: the WhatsApp template payload below (type whatsapp_template, a body component carrying the filled text and the
// parameters) and the tag call (POST /contact/{id}/tag with an array of names) are written from respond.io's docs as understood on 12 Oct 2026.
// If respond.io answers 400, the failed job's error holds its message; adjust buildPayload() / tagContact() and redeploy.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const TOK = Deno.env.get('RESPOND_TOKEN') || '';
const API = 'https://api.respond.io/v2';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const BUDGET_MS = 40_000;

type Job = {
  id: number; client_key: string; dup_keys: string[]; phone: string; channel_id: number; qtype: string; campaign: string;
  params: string[]; body_text: string; is_test: boolean; attempts: number; requested_by: string;
  template: string; language: string; footer: string | null;
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

// The WhatsApp template message. respond.io wants the full filled text with the parameters (without the text the message still goes,
// but the inbox shows nothing), so the body text is what lost_send_enqueue rendered from the approved template.
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

// One job. Returns what happened, for the counts.
async function sendOne(sb: ReturnType<typeof createClient>, j: Job): Promise<'sent' | 'retry' | 'failed' | 'skipped'> {
  const finish = (status: string, error: string | null, extra: Record<string, unknown> = {}) =>
    sb.rpc('lost_send_finish', { p_id: j.id, p_status: status, p_error: error, p_message_id: null, p_contact_id: null, p_retry_min: 5, ...extra });
  let posting = false;
  try {
    // 1. Is she a contact, and may we write to her?
    const c = await rio('GET', '/contact/phone:' + encodeURIComponent(j.phone));
    if (c.status === 404) { await finish('failed', 'Not a contact in respond.io yet, so no WhatsApp chat to start. Use Open in WhatsApp for this one.'); return 'failed'; }
    if (c.status === 429 || c.status >= 500) { await finish('queued', `contact ${c.status}`); return 'retry'; }
    if (!c.ok) { await finish('failed', `contact ${c.status} ${await errText(c)}`); return 'failed'; }
    const contact = await c.json();
    if (contact.isBlocked) { await finish('skipped', 'Blocked in respond.io', { p_contact_id: contact.id }); return 'skipped'; }

    // 2. Has she told us to stop? (her last few incoming messages)
    if (!j.is_test) {
      const m = await rio('GET', `/contact/id:${contact.id}/message/list?limit=20`);
      if (m.ok) {
        const mj = await m.json();
        for (const it of (mj.items || mj.data || [])) {
          if (it.traffic !== 'incoming') continue;
          const txt = String(it.message?.text ?? it.text ?? '').trim();
          if (/^(stop|unsubscribe|opt ?out|cancel)\b/i.test(txt)) {
            await sb.rpc('lost_send_add_optout', { p_phone: j.phone, p_reason: 'Wrote STOP in respond.io' });
            await finish('skipped', 'She wrote STOP, so she is on the opt-out list', { p_contact_id: contact.id });
            return 'skipped';
          }
        }
      }
    }

    // 3. Send.
    posting = true;
    const s = await rio('POST', `/contact/id:${contact.id}/message`, buildPayload(j));
    posting = false;
    if (s.status === 429 || s.status >= 500) { await finish('queued', `send ${s.status} ${await errText(s)}`); return 'retry'; }
    if (!s.ok) { await finish('failed', `respond.io ${s.status}: ${await errText(s)}`, { p_contact_id: contact.id }); return 'failed'; }
    let mid: string | null = null;
    try { const sj = await s.json(); mid = String(sj.messageId ?? sj.id ?? '') || null; } catch (_) { /* a body is not needed */ }
    await finish('sent', null, { p_message_id: mid, p_contact_id: contact.id });
    return 'sent';
  } catch (e) {
    // Network trouble. Before the send call it is safe to try again. During it we cannot know whether the message went, so it is marked failed
    // for a person to check in respond.io, never re-sent on its own (no double messages).
    if (posting) { await finish('failed', 'The connection dropped while sending. Look in respond.io before you retry; it may have gone.'); return 'failed'; }
    await finish('queued', String(e).slice(0, 200));
    return 'retry';
  }
}

Deno.serve(async () => {
  if (!TOK) return new Response(JSON.stringify({ error: 'no token' }), { status: 500 });
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const until = Date.now() + BUDGET_MS;
  const n = { claimed: 0, sent: 0, retry: 0, failed: 0, skipped: 0, tagged: 0, tag_failed: 0 };

  const { data: jobs, error } = await sb.rpc('lost_send_claim', {});
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  for (const j of (jobs || []) as Job[]) {
    if (Date.now() > until) { await sb.rpc('lost_send_finish', { p_id: j.id, p_status: 'queued', p_error: 'run out of time', p_message_id: null, p_contact_id: null, p_retry_min: 1 }); continue; }
    n.claimed++;
    const r = await sendOne(sb, j);
    n[r === 'sent' ? 'sent' : r === 'retry' ? 'retry' : r === 'failed' ? 'failed' : 'skipped']++;
    await sleep(400);   // well inside respond.io's rate limit
  }

  // Tags for sent messages (this run's and any an earlier run could not tag).
  const { data: todo } = await sb.rpc('lost_send_tag_todo', { p_n: 30 });
  for (const t of (todo || []) as { id: number; contact_id: number; tags: string[] }[]) {
    if (Date.now() > until) break;
    const err = await tagContact(t.contact_id, t.tags);
    await sb.rpc('lost_send_tag_done', { p_id: t.id, p_err: err });
    if (err) n.tag_failed++; else n.tagged++;
    await sleep(250);
  }

  if (n.claimed || n.tagged || n.tag_failed) {
    const now = new Date().toISOString();
    await sb.from('sync_health').upsert({ name: 'lost-send-worker', last_run_at: now, last_ok_at: n.failed ? undefined : now, last_error: n.failed ? `${n.failed} failed` : null }, { onConflict: 'name' }).then(() => {}, () => {});
  }
  return new Response(JSON.stringify(n), { headers: { 'Content-Type': 'application/json' } });
});
