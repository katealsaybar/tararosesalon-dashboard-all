// Staff WhatsApp sender (Kate, 29 Oct 2026): payroll messages and campaign announcements to the team, from the BACKUP WhatsApp number
// (respond.io channel 569496, config in staff_wa_config). migrations/staff_wa.sql has the queue, the kill switch and the rules; page: hub/staff-messages.html (Level 5).
// Takes the messages the page queued (staff_wa_jobs) and sends each one through respond.io's Developer API, as an approved WhatsApp template or,
// for a test, as plain text (only works in the 24 hours after that person last wrote to the channel). Reads and writes respond.io with secret RESPOND_TOKEN,
// the same token lost-send-worker uses. The staff numbers are in staff_phones (Level 5 only), reached here with the service role.
//
// staff_wa_claim() decides what may go: the kill switch (staff_wa_config.enabled), the Dubai send window, the daily cap and the run size are all checked THERE,
// so calling this function at the wrong time just returns "nothing to do". A test message ignores the switch, the window and the cap.
// If the number is not a respond.io contact yet it is created first, with the person's full name from staff_phones, so every staff chat is named.
// A send that respond.io refuses for good (4xx) is marked failed with respond.io's own words; a 429 or 5xx is retried (5 minutes later, three tries).
// A dropped connection DURING the send is marked failed, never re-sent on its own (no double messages).
// Cron: every minute from 05:00 to 16:59 UTC (09:00 to 20:59 Dubai). The page also calls it straight after queueing. Returns counts only, never a number or a name.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const TOK = Deno.env.get('RESPOND_TOKEN') || '';
const API = 'https://api.respond.io/v2';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const BUDGET_MS = 40_000;
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };

type Job = {
  id: number; staff_id: number; phone: string; channel_id: number; msg_type: 'template' | 'text'; params: string[]; body_text: string;
  is_test: boolean; attempts: number; template: string | null; language: string; name: string;
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

// "Ma. Ercely Vacal" -> first "Ma. Ercely", last "Vacal"; one word -> first only.
function splitName(full: string) {
  const w = full.trim().split(/\s+/);
  return w.length === 1 ? { firstName: w[0], lastName: '' } : { firstName: w.slice(0, -1).join(' '), lastName: w[w.length - 1] };
}

// Template message. respond.io wants the full filled text with the parameters (the same payload lost-send-worker has used since 12 Oct 2026).
function buildPayload(j: Job) {
  if (j.msg_type === 'text') return { channelId: j.channel_id, message: { type: 'text', text: j.body_text } };
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

async function tagContact(contactId: number, tags: string[]): Promise<void> {
  await rio('POST', `/contact/id:${contactId}/tag`, tags).then(() => {}, () => {});
}

// Find the contact for this number, or create it with the person's full name.
async function contactFor(j: Job): Promise<{ id: number; blocked: boolean } | { error: string; retry: boolean }> {
  const c = await rio('GET', '/contact/phone:' + encodeURIComponent(j.phone));
  if (c.ok) { const cj = await c.json(); return { id: cj.id, blocked: !!cj.isBlocked }; }
  if (c.status === 429 || c.status >= 500) return { error: `contact ${c.status}`, retry: true };
  if (c.status !== 404) return { error: `contact ${c.status} ${await errText(c)}`, retry: false };
  const n = splitName(j.name);
  const cr = await rio('POST', '/contact/create_or_update/phone:' + encodeURIComponent(j.phone), { firstName: n.firstName, lastName: n.lastName || undefined, phone: j.phone });
  if (cr.status === 429 || cr.status >= 500) return { error: `create contact ${cr.status}`, retry: true };
  if (!cr.ok) return { error: `create contact ${cr.status} ${await errText(cr)}`, retry: false };
  let id: number | null = null;
  try { const cj = await cr.json(); id = Number(cj.contactId ?? cj.id ?? 0) || null; } catch (_) { /* look it up below */ }
  if (!id) {
    const again = await rio('GET', '/contact/phone:' + encodeURIComponent(j.phone));
    if (again.ok) id = Number((await again.json()).id) || null;
  }
  return id ? { id, blocked: false } : { error: 'contact created but its id could not be read', retry: false };
}

async function sendOne(sb: ReturnType<typeof createClient>, j: Job): Promise<'sent' | 'retry' | 'failed' | 'skipped'> {
  const finish = (status: string, error: string | null, extra: Record<string, unknown> = {}) =>
    sb.rpc('staff_wa_finish', { p_id: j.id, p_status: status, p_error: error, p_message_id: null, p_contact_id: null, p_retry_min: 5, ...extra });
  let posting = false;
  try {
    const c = await contactFor(j);
    if ('error' in c) { await finish(c.retry ? 'queued' : 'failed', c.error); return c.retry ? 'retry' : 'failed'; }
    if (c.blocked) { await finish('skipped', 'Blocked in respond.io', { p_contact_id: c.id }); return 'skipped'; }

    posting = true;
    let cid = c.id;
    let s = await rio('POST', `/contact/id:${cid}/message`, buildPayload(j));
    // Two contacts can hold one number (see lost-send-worker): respond.io answers 400 "already connected to a contact" with the id it means. Use that one.
    if (s.status === 400) {
      const txt = await errText(s);
      const m = /already connected to a contact.*?"contactId":\s*(\d+)/.exec(txt);
      if (m && Number(m[1]) !== cid) { cid = Number(m[1]); s = await rio('POST', `/contact/id:${cid}/message`, buildPayload(j)); }
      else { posting = false; await finish('failed', `respond.io 400: ${txt}`, { p_contact_id: cid }); return 'failed'; }
    }
    posting = false;
    if (s.status === 429 || s.status >= 500) { await finish('queued', `send ${s.status} ${await errText(s)}`); return 'retry'; }
    if (!s.ok) { await finish('failed', `respond.io ${s.status}: ${await errText(s)}`, { p_contact_id: cid }); return 'failed'; }
    let mid: string | null = null;
    try { const sj = await s.json(); mid = String(sj.messageId ?? sj.id ?? '') || null; } catch (_) { /* a body is not needed */ }
    await finish('sent', null, { p_message_id: mid, p_contact_id: cid });
    await tagContact(cid, j.is_test ? ['staff-wa-test'] : ['staff']);
    return 'sent';
  } catch (e) {
    if (posting) { await finish('failed', 'The connection dropped while sending. Look in respond.io before you retry; it may have gone.'); return 'failed'; }
    await finish('queued', String(e).slice(0, 200));
    return 'retry';
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
  if (!TOK) return json({ error: 'no token' }, 500);
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const until = Date.now() + BUDGET_MS;
  const n = { claimed: 0, sent: 0, retry: 0, failed: 0, skipped: 0 };

  const { data: jobs, error } = await sb.rpc('staff_wa_claim', {});
  if (error) return json({ error: error.message }, 500);
  for (const j of (jobs || []) as Job[]) {
    if (Date.now() > until) { await sb.rpc('staff_wa_finish', { p_id: j.id, p_status: 'queued', p_error: 'run out of time', p_message_id: null, p_contact_id: null, p_retry_min: 1 }); continue; }
    n.claimed++;
    const r = await sendOne(sb, j);
    n[r === 'sent' ? 'sent' : r === 'retry' ? 'retry' : r === 'failed' ? 'failed' : 'skipped']++;
    await sleep(400);   // well inside respond.io's rate limit
  }
  if (n.claimed) {
    const now = new Date().toISOString();
    await sb.from('sync_health').upsert({ name: 'staff-wa-worker', last_run_at: now, last_ok_at: n.failed ? undefined : now, last_error: n.failed ? `${n.failed} failed` : null }, { onConflict: 'name' }).then(() => {}, () => {});
  }
  return json(n);
});
