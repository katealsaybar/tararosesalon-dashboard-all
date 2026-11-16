// Recruitment: a profile photo from the applicant's CV (Kate, 16 Nov 2026). Migration: migrations/recruit_cv_photos.sql.
// The face finding runs on Kate's PC (recruitment cv photos/recruit_cv_photos.py); this function is its door to the database.
//   { mode: 'queue', n }                      -> { items: [{ id, url }] }  the CVs to look at, people with NO photo only. A stored CV comes as a 10 minute signed link.
//   { mode: 'result', id, result, jpeg_b64 }  -> { attached }  the script's answer. With result 'ok' and a JPEG (max 300 KB) it is stored in the private
//                                                bucket recruit-photos as <id>/cv-<time>.jpg and attached, but only if the person STILL has no photo
//                                                (recruit_cv_photo_done decides; a photo added by hand or from Instagram meanwhile wins and the new file is deleted).
// AUTH: the gateway needs a valid JWT and the header x-cron-secret must equal internal_secrets 'recruit_cv_photos_cron' (service role only).
// Never logs or returns a name; the links it hands out hold the file names, so they go only to the caller that proved the secret.
// Deploy: supabase functions deploy recruit-cv-photo --project-ref gvijxenafoowajqktqvd   (JWT on)
import { createClient } from 'jsr:@supabase/supabase-js@2';

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
const RESULTS = ['ok', 'no_images', 'no_face', 'many_faces', 'unsupported', 'error'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  let body: any = {};
  try { body = await req.json(); } catch (_) { return json({ error: 'bad body' }, 400); }
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const sent = req.headers.get('x-cron-secret') || '';
  const { data: sec } = await sb.from('internal_secrets').select('value').eq('name', 'recruit_cv_photos_cron').maybeSingle();
  const want = String(sec?.value || '');
  let same = want.length > 0 && sent.length === want.length;
  if (same) { let d = 0; for (let k = 0; k < want.length; k++) d |= want.charCodeAt(k) ^ sent.charCodeAt(k); same = d === 0; }
  if (!same) return json({ error: 'unauthorised' }, 401);

  if (body.mode === 'queue') {
    const n = Math.max(1, Math.min(100, Number(body.n) || 20));
    const { data, error } = await sb.rpc('recruit_cv_photo_queue', { p_n: n });
    if (error) return json({ error: error.message }, 500);
    const items: { id: string; url: string }[] = [];
    for (const r of (data || []) as { id: string; cv_link: string | null; cv_file: string | null }[]) {
      if (r.cv_file) {
        const s = await sb.storage.from('recruit-cvs').createSignedUrl(r.cv_file, 600);
        if (s.data?.signedUrl) items.push({ id: r.id, url: s.data.signedUrl });
        else await sb.rpc('recruit_cv_photo_done', { p_id: r.id, p_result: 'error', p_path: null });
      } else if (r.cv_link) items.push({ id: r.id, url: r.cv_link });
    }
    return json({ items });
  }

  if (body.mode === 'result') {
    const id = String(body.id || '');
    const result = String(body.result || '');
    if (!UUID.test(id) || !RESULTS.includes(result)) return json({ error: 'bad id or result' }, 400);
    let path: string | null = null;
    if (result === 'ok') {
      const b64 = String(body.jpeg_b64 || '');
      let bytes: Uint8Array;
      try { bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); } catch (_) { return json({ error: 'bad image' }, 400); }
      if (bytes.length < 500 || bytes.length > 300 * 1024 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return json({ error: 'not a small JPEG' }, 400);
      path = `${id}/cv-${Date.now()}.jpg`;
      const up = await sb.storage.from('recruit-photos').upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
      if (up.error) return json({ error: 'upload failed' }, 500);
    }
    const { data: attached, error } = await sb.rpc('recruit_cv_photo_done', { p_id: id, p_result: result, p_path: path });
    if (error) { if (path) await sb.storage.from('recruit-photos').remove([path]); return json({ error: error.message }, 500); }
    if (path && attached !== true) await sb.storage.from('recruit-photos').remove([path]);
    return json({ attached: attached === true });
  }

  return json({ error: 'mode must be queue or result' }, 400);
});
