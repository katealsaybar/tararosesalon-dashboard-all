// Wellness Voucher Blast: the sender (Kate, 16 Oct 2026). The page queues a sub-wave (wv_send_enqueue, migrations/wv_send.sql); this function
// takes the queued clients and adds the GHL "go" tag to each: wv-send-short for sub-waves 1a..5a, wv-send-long for 1b..5b. The tag is what
// fires GHL's workflow "WV blast - Send (tag go)", which sends the WhatsApp template and creates the Wellness Voucher pipeline opportunity.
// So this function never sends a WhatsApp itself and the reply workflows (Tell me more, Reserve mine) behave exactly as for a hand send.
// Reads and writes GHL with secret GHL_TOKEN (the Tara Rose Salon - Contact Centre sub-account, location below).
//
// wv_send_claim() decides what may go: the kill switch (wv_send_config.enabled) and the Dubai send window are checked THERE, so calling this
// function at the wrong time just returns "nothing to do". Before tagging, each client is looked up in GHL by phone and must:
//   - exist, and carry the wave tag wv-blast-wave-<sub-wave> (so a wrong list can never message the wrong people),
//   - not be on DND,
//   - not already carry wv-send-short or wv-send-long (so nobody is messaged twice).
// Otherwise she is skipped with the reason. A 429 or 5xx is retried (three tries); a 4xx is failed with GHL's own words.
//
// {check: ["+971..."]} (max 10) only looks the phones up and reports what would happen. It claims and writes nothing.
// Returns counts only, never a name or a number.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const TOK = Deno.env.get('GHL_TOKEN') || '';
const LOC = '9JRcCbWbkIr9ie8lvA3D';
const API = 'https://services.leadconnectorhq.com';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const BUDGET_MS = 40_000;
const GO_TAGS = ['wv-send-short', 'wv-send-long'];

type Job = { id: number; phone: string; sub_wave: string; tag: string; client: string; attempts: number };

async function ghl(method: string, path: string, body?: unknown): Promise<Response> {
  return await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${TOK}`, Version: '2021-07-28', Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}
const errText = async (r: Response) => { try { return (await r.text()).replace(/\s+/g, ' ').slice(0, 240); } catch (_) { return ''; } };

type Look = { kind: 'ok'; id: string; tags: string[]; dnd: boolean } | { kind: 'none' } | { kind: 'retry'; why: string } | { kind: 'fail'; why: string };
async function lookup(phone: string): Promise<Look> {
  const r = await ghl('GET', `/contacts/search/duplicate?locationId=${LOC}&number=${encodeURIComponent(phone)}`);
  if (r.status === 429 || r.status >= 500) return { kind: 'retry', why: `lookup ${r.status}` };
  if (r.status === 404) return { kind: 'none' };
  if (!r.ok) return { kind: 'fail', why: `GHL lookup ${r.status} ${await errText(r)}` };
  const j = await r.json();
  const c = j?.contact;
  if (!c?.id) return { kind: 'none' };
  return { kind: 'ok', id: String(c.id), tags: (c.tags || []).map((t: string) => String(t).toLowerCase()), dnd: c.dnd === true };
}

// What the guards say about one contact, shared by the real run and the check.
function verdict(l: Look & { kind: 'ok' }, sub: string, tag: string): { go: boolean; why: string } {
  if (!l.tags.includes('wv-blast-wave-' + sub)) return { go: false, why: `Not tagged wv-blast-wave-${sub} in GHL, so she is not in this wave there` };
  if (l.dnd) return { go: false, why: 'On do-not-disturb in GHL' };
  if (l.tags.includes(tag)) return { go: false, why: `Already has ${tag}, so the message has gone before` };
  if (GO_TAGS.some((t) => l.tags.includes(t))) return { go: false, why: 'Already has a go tag for the other message, so she has been messaged' };
  return { go: true, why: '' };
}

async function sendOne(sb: ReturnType<typeof createClient>, j: Job): Promise<'sent' | 'retry' | 'failed' | 'skipped'> {
  const finish = (status: string, error: string | null, contact: string | null = null) =>
    sb.rpc('wv_send_finish', { p_id: j.id, p_status: status, p_error: error, p_contact: contact });
  let tagging = false;
  try {
    const l = await lookup(j.phone);
    if (l.kind === 'retry') { await finish('queued', l.why); return 'retry'; }
    if (l.kind === 'fail') { await finish('failed', l.why); return 'failed'; }
    if (l.kind === 'none') { await finish('failed', 'No contact with this number in GHL'); return 'failed'; }
    const v = verdict(l, j.sub_wave, j.tag);
    if (!v.go) { await finish('skipped', v.why, l.id); return 'skipped'; }

    tagging = true;
    const t = await ghl('POST', `/contacts/${l.id}/tags`, { tags: [j.tag] });
    tagging = false;
    if (t.status === 429 || t.status >= 500) { await finish('queued', `tag ${t.status} ${await errText(t)}`, l.id); return 'retry'; }
    if (!t.ok) { await finish('failed', `GHL tag ${t.status}: ${await errText(t)}`, l.id); return 'failed'; }
    await finish('sent', null, l.id);
    return 'sent';
  } catch (e) {
    // Before the tag call it is safe to try again. During it we cannot know whether the tag went on, so it is marked failed for a person to
    // check in GHL, never retried on its own (no double messages).
    if (tagging) { await finish('failed', 'The connection dropped while tagging. Look in GHL before you queue her again; the message may have gone.'); return 'failed'; }
    await finish('queued', String(e).slice(0, 200));
    return 'retry';
  }
}

// The page calls this from the browser (sb.functions.invoke), so the answer needs CORS headers and the preflight needs an answer.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
  if (!TOK) return json({ error: 'no token' }, 500);
  let body: { check?: string[]; sub_wave?: string } = {};
  try { body = await req.json(); } catch (_) { /* no body is fine */ }

  // A look-up only. Nothing is claimed and nothing is written.
  if (Array.isArray(body.check)) {
    const sub = String(body.sub_wave || '');
    const tag = sub.endsWith('a') ? 'wv-send-short' : 'wv-send-long';
    const out: Record<string, number> = { checked: 0, would_tag: 0, would_skip: 0, not_in_ghl: 0, error: 0 };
    for (const p of body.check.slice(0, 10)) {
      out.checked++;
      const l = await lookup(String(p));
      if (l.kind === 'ok') { if (verdict(l, sub, tag).go) out.would_tag++; else out.would_skip++; }
      else if (l.kind === 'none') out.not_in_ghl++;
      else out.error++;
      await sleep(250);
    }
    return json(out);
  }

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const until = Date.now() + BUDGET_MS;
  const n = { claimed: 0, sent: 0, retry: 0, failed: 0, skipped: 0 };
  const { data: jobs, error } = await sb.rpc('wv_send_claim', {});
  if (error) return json({ error: error.message }, 500);
  for (const j of (jobs || []) as Job[]) {
    if (Date.now() > until) { await sb.rpc('wv_send_finish', { p_id: j.id, p_status: 'queued', p_error: 'run out of time', p_contact: null }); continue; }
    n.claimed++;
    const r = await sendOne(sb, j);
    n[r]++;
    await sleep(400);   // well inside GHL's rate limit
  }
  if (n.claimed) {
    const now = new Date().toISOString();
    await sb.from('sync_health').upsert({ name: 'wv-send-worker', last_run_at: now, last_ok_at: n.failed ? undefined : now, last_error: n.failed ? `${n.failed} failed` : null }, { onConflict: 'name' }).then(() => {}, () => {});
  }
  return json(n);
});
