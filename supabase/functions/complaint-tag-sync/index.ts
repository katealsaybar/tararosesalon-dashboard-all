// Complaint tag mirror (Kate, 13 Nov 2026). The dashboard is the source of truth, respond.io is a one-way mirror.
// Manages ONLY these four tags and never touches any other tag or field on a contact:
//   possible-complaint, complaint-confirmed, complaint-repeat, complaint-3plus
// What each contact should carry comes from rpc complaint_tag_queue (service role only, see
// migrations/complaint_tag_mirror_13nov.sql). For every queued phone the contact is read, the four tags are
// compared with what it carries, missing ones are added and surplus ones removed, then it is read back to verify.
// SAFE BY DEFAULT: without { live: true } it only reports counts (never a name or number), it writes nothing.
// Body (all optional): { live, full, budget_s }. full = re-check every phone, not only the ones that changed.
// Cron: every 10 minutes. Reads/writes respond.io with secret RESPOND_TOKEN.
// AUTH (13 Nov 2026): the gateway needs a valid JWT, and on top of that the header x-cron-secret must equal the value
// in table internal_secrets (name complaint_tag_sync_cron, service role only). The public anon key alone is refused (401).
// A phone respond.io rejects with HTTP 400 is marked bad_phone (a data problem, not a failure) and is not retried.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const TOK = Deno.env.get('RESPOND_TOKEN') || '';
const API = 'https://api.respond.io/v2';
const MANAGED = ['possible-complaint', 'complaint-confirmed', 'complaint-repeat', 'complaint-3plus'];
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

type Q = { phone: string; contact_id: number | null; desired: string[]; synced: string[] | null };
type Res = { phone: string; status: 'ok' | 'no_contact' | 'bad_phone' | 'error'; contact_id: number | null; add: string[]; remove: string[]; written: boolean; err: string | null };

async function readTags(contactPath: string): Promise<{ id: number; tags: string[] } | { status: number }> {
  const r = await rio('GET', contactPath);
  if (!r.ok) return { status: r.status };
  const j = await r.json();
  const tags: string[] = Array.isArray(j.tags) ? j.tags.map((x: any) => String(x?.name ?? x)) : [];
  return { id: Number(j.id), tags };
}

async function one(q: Q, live: boolean): Promise<Res> {
  const res: Res = { phone: q.phone, status: 'ok', contact_id: q.contact_id, add: [], remove: [], written: false, err: null };
  try {
    const got = await readTags(`/contact/phone:${q.phone}`);
    if ('status' in got) {
      if (got.status === 404) { res.status = 'no_contact'; return res; }
      if (got.status === 400) { res.status = 'bad_phone'; res.err = 'phone not valid for respond.io'; return res; }
      res.status = 'error'; res.err = `contact ${got.status}`; return res;
    }
    res.contact_id = got.id;
    const have = got.tags.filter((t) => MANAGED.includes(t));
    res.add = q.desired.filter((t) => !have.includes(t));
    res.remove = have.filter((t) => !q.desired.includes(t));
    if (!live || (!res.add.length && !res.remove.length)) return res;
    if (res.add.length) {
      const a = await rio('POST', `/contact/id:${got.id}/tag`, res.add);
      if (!a.ok) { res.status = 'error'; res.err = `add ${a.status}`; return res; }
    }
    if (res.remove.length) {
      const d = await rio('DELETE', `/contact/id:${got.id}/tag`, res.remove);
      if (!d.ok) { res.status = 'error'; res.err = `remove ${d.status}`; return res; }
    }
    // respond.io shows a new tag a moment late, so an immediate read-back is wrong. A written contact stays queued
    // and the next run (cron, 10 minutes) reads it again: nothing to change means it is verified and marked synced.
    res.written = true;
  } catch (e) { res.status = 'error'; res.err = String(e).slice(0, 200); }
  return res;
}

Deno.serve(async (req) => {
  let body: any = {};
  if (req.method === 'POST') { try { body = await req.json(); } catch (_) {} }
  if (!TOK) return new Response(JSON.stringify({ error: 'no token' }), { status: 500 });
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const sent = req.headers.get('x-cron-secret') || '';
  const { data: sec } = await sb.from('internal_secrets').select('value').eq('name', 'complaint_tag_sync_cron').maybeSingle();
  const want = String(sec?.value || '');
  let same = want.length > 0 && sent.length === want.length;
  if (same) { let d = 0; for (let k = 0; k < want.length; k++) d |= want.charCodeAt(k) ^ sent.charCodeAt(k); same = d === 0; }
  if (!same) return new Response(JSON.stringify({ error: 'unauthorised' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  const live = body.live === true;
  const until = Date.now() + (Number(body.budget_s) || 50) * 1000;
  // The API returns at most 1000 rows per request, so read the queue in pages (the rpc is stable inside one run).
  const list: Q[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await sb.rpc('complaint_tag_queue', { p_full: body.full === true }).range(from, from + 999);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    list.push(...((data || []) as Q[]));
    if (!data || data.length < 1000) break;
  }
  const rows: Res[] = [];
  let i = 0;
  const worker = async () => { while (i < list.length && Date.now() < until) rows.push(await one(list[i++], live)); };
  await Promise.all(Array.from({ length: 6 }, worker));

  if (live) {
    const now = new Date().toISOString();
    const byPhone = new Map(list.map((q) => [q.phone, q]));
    for (const r of rows) {
      const q = byPhone.get(r.phone)!;
      // ok = confirmed on the contact now (also when nothing needed to change); no_contact = not in respond.io, rechecked on a full run; bad_phone = respond.io says the number is not valid (HTTP 400), fix it in Phorest
      const done = (r.status === 'ok' || r.status === 'no_contact' || r.status === 'bad_phone') && !r.written;
      await sb.from('complaint_tag_mirror').update({
        contact_id: r.contact_id, status: r.status, last_error: r.err,
        ...(done ? { synced: q.desired, synced_at: now } : {}),
      }).eq('phone', r.phone).then(() => {}, () => {});
    }
    const failed = rows.filter((r) => r.status === 'error').length;
    await sb.from('sync_health').upsert({ name: 'complaint-tag-sync', last_run_at: now, last_ok_at: failed ? null : now, last_error: failed ? `${failed} contacts failed` : null }, { onConflict: 'name' }).then(() => {}, () => {});
  }

  const tally = (k: 'add' | 'remove') => { const o: Record<string, number> = {}; for (const r of rows) for (const t of r[k]) o[t] = (o[t] || 0) + 1; return o; };
  return new Response(JSON.stringify({
    live, queued: list.length, checked: rows.length, left_for_next_run: list.length - rows.length,
    no_contact: rows.filter((r) => r.status === 'no_contact').length,
    bad_phone: rows.filter((r) => r.status === 'bad_phone').length,
    errors: rows.filter((r) => r.status === 'error').length,
    contacts_to_change: rows.filter((r) => r.add.length || r.remove.length).length,
    [live ? 'added' : 'would_add']: tally('add'), [live ? 'removed' : 'would_remove']: tally('remove'),
    contacts_written: rows.filter((r) => r.written).length,
    error_samples: rows.filter((r) => r.err).slice(0, 5).map((r) => ({ last4: r.phone.slice(-4), err: r.err })),
  }), { headers: { 'Content-Type': 'application/json' } });
});
