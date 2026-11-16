// Recruitment: Instagram profile photos, automatic (Kate, 16 Nov 2026). Migration: migrations/recruit_ig_photos.sql.
// For each applicant who gave an Instagram handle and has no photo yet, asks Meta's Business Discovery (through the salon's IG_ACCESS_TOKEN, the TRS Staff
// Benchmarks app, which Meta approved for it on 16 Nov 2026) for the profile picture, copies the image into the private bucket recruit-photos and attaches it
// with recruit_ig_photo_done(). Public Business or Creator accounts only; personal and private accounts answer with an error and keep their initials.
//
// SAFE BY DEFAULT: without { live: true } it only reports how many people are waiting and writes nothing. Body: { live?, n? } (n = people per run, max 40).
// Gentle on Meta (the shared Facebook login was locked on 5 Oct 2026): at most 40 calls a run, 1.5 s apart, and the run STOPS on a rate limit, a token or
// permission error, never retrying in a loop. Returns counts only, never a handle, a name or an image link.
// AUTH: the gateway needs a valid JWT and the header x-cron-secret must equal internal_secrets 'recruit_ig_photos_cron' (service role only).
// A photo somebody added by hand is never replaced: if one appears while the file is on its way, the new file is deleted again.
// Deploy: supabase functions deploy recruit-ig-photos --project-ref gvijxenafoowajqktqvd   (JWT on)
import { createClient } from 'jsr:@supabase/supabase-js@2';

const IG_USER = '17841403590323716';   // @tararosesalon, the account the token acts as
const GRAPH = 'https://graph.facebook.com/v26.0';
const BUCKET = 'recruit-photos';
const MAX_BYTES = 500 * 1024;          // the bucket allows 512 KB
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });

type Q = { id: string; handle: string };
type Result = 'ok' | 'not_business' | 'no_photo' | 'error';

Deno.serve(async (req) => {
  let body: any = {};
  if (req.method === 'POST') { try { body = await req.json(); } catch (_) {} }
  const token = (Deno.env.get('IG_ACCESS_TOKEN') || '').trim();   // a pasted secret can carry a stray space
  if (!token) return json({ error: 'IG_ACCESS_TOKEN not set' }, 500);
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const sent = req.headers.get('x-cron-secret') || '';
  const { data: sec } = await sb.from('internal_secrets').select('value').eq('name', 'recruit_ig_photos_cron').maybeSingle();
  const want = String(sec?.value || '');
  let same = want.length > 0 && sent.length === want.length;
  if (same) { let d = 0; for (let k = 0; k < want.length; k++) d |= want.charCodeAt(k) ^ sent.charCodeAt(k); same = d === 0; }
  if (!same) return json({ error: 'unauthorised' }, 401);

  const n = Math.max(1, Math.min(40, Number(body.n) || 10));
  const { data: queue, error: qe } = await sb.rpc('recruit_ig_photo_queue', { p_n: n });
  if (qe) return json({ error: qe.message }, 500);
  const list = (queue || []) as Q[];
  if (body.live !== true) return json({ live: false, waiting_in_this_batch: list.length });

  const out = { asked: 0, attached: 0, not_business: 0, no_photo: 0, error: 0, kept_manual: 0, stopped: '' as string };
  for (const p of list) {
    if (!/^[a-z0-9._]{1,30}$/.test(p.handle)) { await sb.rpc('recruit_ig_photo_done', { p_id: p.id, p_result: 'error', p_path: null }); out.error++; continue; }
    out.asked++;
    const r = await ask(token, p.handle);
    if (r.kind === 'stop') { out.stopped = r.why; break; }   // not recorded: the person is asked again on the next run
    let result: Result = r.kind;
    let path: string | null = null;
    if (r.kind === 'ok') {
      const img = await fetchImage(r.url);
      if (!img) result = 'error';
      else {
        const stamp = Date.now();
        path = `${p.id}/ig-${stamp}.jpg`;
        const up = await sb.storage.from(BUCKET).upload(path, img.bytes, { contentType: img.type, upsert: false });
        if (up.error) { result = 'error'; path = null; }
      }
    }
    const { data: attached, error: de } = await sb.rpc('recruit_ig_photo_done', { p_id: p.id, p_result: result, p_path: path });
    if (de) { out.error++; if (path) await sb.storage.from(BUCKET).remove([path]); continue; }
    if (path && attached !== true) { await sb.storage.from(BUCKET).remove([path]); out.kept_manual++; continue; }
    if (attached === true) out.attached++; else out[result === 'ok' ? 'attached' : result]++;
    await sleep(1500);
  }
  const now = new Date().toISOString();
  await sb.from('sync_health').upsert({ name: 'recruit-ig-photos', last_run_at: now, last_ok_at: out.stopped ? undefined : now, last_error: out.stopped || null }, { onConflict: 'name' }).then(() => {}, () => {});
  return json(out);
});

// One Business Discovery call. 'stop' = do not carry on this run (rate limit, token, permission).
async function ask(token: string, handle: string): Promise<{ kind: 'ok'; url: string } | { kind: 'not_business' | 'no_photo' | 'error' } | { kind: 'stop'; why: string }> {
  try {
    const url = `${GRAPH}/${IG_USER}?fields=${encodeURIComponent(`business_discovery.username(${handle}){profile_picture_url}`)}&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url);
    const d = await res.json();
    if (d.error) {
      const c = Number(d.error.code);
      if ([4, 17, 32, 613, 80002].includes(c)) return { kind: 'stop', why: `meta rate limit (code ${c})` };
      if ([10, 102, 190, 200].includes(c)) return { kind: 'stop', why: `meta permission or token (code ${c})` };
      if (c === 110 || /invalid user id/i.test(String(d.error.message || ''))) return { kind: 'not_business' };   // personal or private account, or no such handle
      return { kind: 'error' };
    }
    const pic = d.business_discovery?.profile_picture_url;
    return pic ? { kind: 'ok', url: String(pic) } : { kind: 'no_photo' };
  } catch (_) { return { kind: 'error' }; }
}

// Instagram's picture link expires, so the file is copied once. Must be a small image from an Instagram or Facebook CDN.
async function fetchImage(url: string): Promise<{ bytes: Uint8Array; type: string } | null> {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || !/(^|\.)(cdninstagram\.com|fbcdn\.net)$/.test(u.hostname)) return null;
    const r = await fetch(u.toString());
    if (!r.ok) return null;
    const type = (r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) return null;
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_BYTES) return null;
    return { bytes, type };
  } catch (_) { return null; }
}
