// Fathom "new meeting content ready" webhook → perf_o2o_fathom (Kate, 16 Oct 2026).
// Coach Emma records her 1-to-1s on Fathom; each finished meeting arrives here and is filed against the
// stylist whose email is on the invite, so the 1-to-1 tab can show the summary and action items.
//   POST only. Deployed with verify_jwt off because Fathom can't send a Supabase JWT; the signature is the check
//   (Standard Webhooks: headers webhook-id, webhook-timestamp, webhook-signature; HMAC-SHA256 over
//   `${id}.${timestamp}.${rawBody}`, key = base64 of FATHOM_WEBHOOK_SECRET after its whsec_ prefix).
//   Until FATHOM_WEBHOOK_SECRET is set the function answers 503 and stores nothing.
// What is kept: summary, action items, links, invitees, times. The transcript is dropped here, never written.
// What is filed:
//   exactly one active stylist on the invite  → filed against her (match_how 'email')
//   more than one stylist (a team meeting)    → dropped
//   no stylist, but it looks like a 1-to-1    → kept unmatched, for the editor to claim
//   anything else (supplier calls, etc.)      → dropped, nothing stored
// A 2xx is returned for everything we choose not to keep, so Fathom does not retry; a database failure is a 500
// so it does.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const ONE2ONE = /(^|\W)(1[\s-]*(to|on)[\s-]*1|1:1|one[\s-]*(to|on)[\s-]*one)(\W|$)/i;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method', { status: 405 });
  const secret = (Deno.env.get('FATHOM_WEBHOOK_SECRET') || '').trim();
  if (!secret) return new Response('not configured', { status: 503 });

  const raw = await req.text();
  if (!(await verified(raw, req.headers, secret))) return new Response('bad signature', { status: 401 });

  let body: any;
  try { body = JSON.parse(raw); } catch (_) { return new Response('ignored'); }
  const m = body?.data ?? body?.meeting ?? body;
  const rid = Number(m?.recording_id ?? m?.id);
  if (!rid) return new Response('ignored');

  const invitees = (Array.isArray(m.calendar_invitees) ? m.calendar_invitees : [])
    .map((i: any) => ({ name: i?.name ? String(i.name) : null, email: String(i?.email || '').trim().toLowerCase() }))
    .filter((i: any) => i.email);
  const emails = new Set(invitees.map((i: any) => i.email));
  const title = String(m.meeting_title || m.title || '');

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: staff, error: se } = await sb.from('perf_staff').select('id, email').eq('active', true);
  if (se) return new Response('db', { status: 500 });
  const hits = (staff || []).filter((s: any) => s.email && emails.has(String(s.email).trim().toLowerCase()));

  let staffId: string | null = null;
  if (hits.length === 1) staffId = hits[0].id;
  else if (hits.length > 1) return new Response('team meeting, not kept');
  else if (!(ONE2ONE.test(title) && invitees.length <= 3)) return new Response('not a 1-to-1, not kept');

  const ds = m.default_summary;
  const summary = typeof ds === 'string' ? ds : (ds?.markdown_formatted || ds?.text || ds?.summary || null);
  const items = (Array.isArray(m.action_items) ? m.action_items : []).map((a: any) => ({
    text: typeof a === 'string' ? a : String(a?.description || a?.text || a?.title || '').trim(),
    assignee: a?.assignee?.name || a?.assignee?.email || null,
    done: !!(a?.completed ?? a?.done),
  })).filter((a: any) => a.text);

  const { transcript: _drop, ...rest } = m;     // the transcript is never stored
  const row = {
    recording_id: rid,
    staff_id: staffId,
    match_how: staffId ? 'email' : null,
    title: m.title ?? null,
    meeting_title: m.meeting_title ?? null,
    started_at: m.recording_start_time || m.scheduled_start_time || m.created_at || null,
    ended_at: m.recording_end_time || m.scheduled_end_time || null,
    recorded_by: m.recorded_by?.email ? String(m.recorded_by.email).toLowerCase() : null,
    invitees,
    summary,
    action_items: items,
    share_url: m.share_url ?? null,
    url: m.url ?? null,
    raw: rest,
  };
  // A resend of the same recording keeps what is there (and whatever the editor did with it).
  const { error } = await sb.from('perf_o2o_fathom').upsert(row, { onConflict: 'recording_id', ignoreDuplicates: true });
  if (error) return new Response('db', { status: 500 });
  return new Response('ok');
});

async function verified(raw: string, h: Headers, secret: string) {
  const id = h.get('webhook-id'), ts = h.get('webhook-timestamp'), sigs = h.get('webhook-signature');
  if (!id || !ts || !sigs) return false;
  if (!(Math.abs(Date.now() / 1000 - Number(ts)) <= 300)) return false;     // also false for a non-number
  let keyBytes: Uint8Array;
  try { keyBytes = Uint8Array.from(atob(secret.startsWith('whsec_') ? secret.slice(6) : secret), (c) => c.charCodeAt(0)); }
  catch (_) { return false; }
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${raw}`)));
  const want = btoa(String.fromCharCode(...mac));
  for (const part of sigs.split(' ')) {
    const [ver, sig] = part.split(',');
    if (ver === 'v1' && sig && same(sig, want)) return true;
  }
  return false;
}

function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
