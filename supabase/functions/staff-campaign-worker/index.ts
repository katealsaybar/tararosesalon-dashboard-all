// Staff campaign announcements: the WhatsApp sender (Kate, 29 Oct 2026). The staff-side twin of lost-send-worker.
// Takes the messages the Staff campaign page queued (staff_cmp_jobs, migrations/staff_campaign_send.sql) and sends each one through respond.io's
// Developer API as a WhatsApp template message from the BACKUP number (channel 569496, "WhatsApp Brand Account (Backup nr)"), then tags the contact.
// Reads and writes respond.io with secret RESPOND_TOKEN (Kate's workspace 250275), the same token lost-send-worker uses.
//
// staff_cmp_claim() decides what may go: the kill switch (staff_cmp_config.enabled) and the Dubai send window are checked THERE, so calling this
// function at the wrong time just returns "nothing to do". A test message (staff_cmp_test) ignores the switch and window.
// The numbers come with the claimed job (read from staff_phones inside the database function, service role only). This function returns counts only,
// never a number or a name.
//
// Staff messages are mandatory (Kate, 29 Oct 2026): there is no opt-out, so no STOP check here. Only a contact blocked in respond.io is skipped.
//
// A person who is not a contact in respond.io yet is marked failed, never created here: contacts are added with their full names by the payroll
// session, so a name that fails here means she is missing there.
// A test job may be mode 'text' (plain text, no template): it only arrives if the contact has written to the backup number in the last 24 hours.
//
// Cron: every minute from 05:00 to 16:59 UTC (staff_campaign_send.sql, record at the bottom). The page also calls it straight after queueing.
// WHAT TO CHECK ON THE FIRST TEST SEND: the template payload (type whatsapp_template, a body component with the filled text and the parameters)
// is the one lost-send-worker uses. If respond.io answers 400, the failed job's error holds its message.
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
  id: number; phone: string; channel_id: number; campaign: string; params: string[]; body_text: string; is_test: boolean;
  mode: 'template' | 'text'; image_url: string | null; attempts: number; phone_id: number; template: string; language: string; footer: string | null;
};

async function rio(method: string, path: string, body?: unknown): Promise<Response> {
  const go = () => fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${TOK}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let r = await go();
  for (let i = 0; method === 'GET' && i < 3 && r.status === 429; i++) {
    await sleep(Math.min(Number(r.headers.get('retry-after') || 2), 10) * 1000 + 300);
    r = await go();
  }
  return r;
}
const errText = async (r: Response) => { try { return (await r.text()).replace(/\s+/g, ' ').slice(0, 240); } catch (_) { return ''; } };

function buildPayload(j: Job) {
  if (j.mode === 'text') return { channelId: j.channel_id, message: { type: 'text', text: j.body_text } };
  return {
    channelId: j.channel_id,
    message: {
      type: 'whatsapp_template',
      template: {
        name: j.template,
        languageCode: j.language,
        // The memo is the image header; its link is the one the page uploaded. Format as respond.io documents it (check on the first approved template send).
        components: [
          ...(j.image_url ? [{ type: 'header', format: 'image', link: j.image_url }] : []),
          { type: 'body', text: j.body_text, parameters: j.params.map((p) => ({ type: 'text', text: p })) },
        ],
      },
    },
  };
}

async function tagContact(contactId: number, tags: string[]): Promise<string | null> {
  const r = await rio('POST', `/contact/id:${contactId}/tag`, tags);
  if (r.ok) return null;
  return `tag ${r.status} ${await errText(r)}`;
}

async function sendOne(sb: ReturnType<typeof createClient>, j: Job): Promise<'sent' | 'retry' | 'failed' | 'skipped'> {
  const finish = (status: string, error: string | null, extra: Record<string, unknown> = {}) =>
    sb.rpc('staff_cmp_finish', { p_id: j.id, p_status: status, p_error: error, p_message_id: null, p_contact_id: null, p_retry_min: 5, ...extra });
  let posting = false;
  try {
    // 1. Is she a contact, and may we write to her?
    const c = await rio('GET', '/contact/phone:' + encodeURIComponent(j.phone));
    if (c.status === 404) { await finish('failed', 'Not a contact in respond.io yet, so no WhatsApp chat to start. Add her to respond.io with her full name first.'); return 'failed'; }
    if (c.status === 429 || c.status >= 500) { await finish('queued', `contact ${c.status}`); return 'retry'; }
    if (!c.ok) { await finish('failed', `contact ${c.status} ${await errText(c)}`); return 'failed'; }
    const contact = await c.json();
    if (contact.isBlocked) { await finish('skipped', 'Blocked in respond.io', { p_contact_id: contact.id }); return 'skipped'; }

    // 2. Send.
    posting = true;
    let cid = contact.id;
    let s = await rio('POST', `/contact/id:${cid}/message`, buildPayload(j));
    // Two contacts can hold one number: respond.io answers 400 "already connected to a contact" with the id of the one it means. Send to that one.
    if (s.status === 400) {
      const txt = await errText(s);
      const m = /already connected to a contact.*?"contactId":\s*(\d+)/.exec(txt);
      if (m && Number(m[1]) !== cid) {
        cid = Number(m[1]);
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
    // Before the send call a network error is safe to retry. During it we cannot know whether the message went, so it is marked failed for a person to
    // check in respond.io, never re-sent on its own (no double messages).
    if (posting) { await finish('failed', 'The connection dropped while sending. Look in respond.io before you retry; it may have gone.'); return 'failed'; }
    await finish('queued', String(e).slice(0, 200));
    return 'retry';
  }
}

Deno.serve(async (req) => {
  // A bare 204 for the preflight: JSON.stringify into a 204 throws in Deno and silently breaks CORS on the real POST.
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
  if (!TOK) return json({ error: 'no token' }, 500);
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const until = Date.now() + BUDGET_MS;
  const n = { claimed: 0, sent: 0, retry: 0, failed: 0, skipped: 0, tagged: 0, tag_failed: 0 };

  const { data: jobs, error } = await sb.rpc('staff_cmp_claim', {});
  if (error) return json({ error: error.message }, 500);
  for (const j of (jobs || []) as Job[]) {
    if (Date.now() > until) { await sb.rpc('staff_cmp_finish', { p_id: j.id, p_status: 'queued', p_error: 'run out of time', p_message_id: null, p_contact_id: null, p_retry_min: 1 }); continue; }
    n.claimed++;
    const r = await sendOne(sb, j);
    n[r === 'sent' ? 'sent' : r === 'retry' ? 'retry' : r === 'failed' ? 'failed' : 'skipped']++;
    await sleep(500);   // well inside respond.io's rate limit
  }

  const { data: todo } = await sb.rpc('staff_cmp_tag_todo', { p_n: 30 });
  for (const t of (todo || []) as { id: number; contact_id: number; tags: string[] }[]) {
    if (Date.now() > until) break;
    const err = await tagContact(t.contact_id, t.tags);
    await sb.rpc('staff_cmp_tag_done', { p_id: t.id, p_err: err });
    if (err) n.tag_failed++; else n.tagged++;
    await sleep(250);
  }

  if (n.claimed || n.tagged || n.tag_failed) {
    const now = new Date().toISOString();
    await sb.from('sync_health').upsert({ name: 'staff-campaign-worker', last_run_at: now, last_ok_at: n.failed ? undefined : now, last_error: n.failed ? `${n.failed} failed` : null }, { onConflict: 'name' }).then(() => {}, () => {});
  }
  return json(n);
});
