// story-saver (Kate, 13 Nov 2026): copies every live Instagram and Facebook story's file into the private Storage bucket 'story-media', every 6 hours (pg_cron 'story-saver').
// Instagram and Facebook keep a story for 24 hours, so this has to run often; older stories cannot be fetched again.
// Read only against Meta (secret IG_ACCESS_TOKEN, a Facebook page token is made from it). One file per story (de-duplicated by media id in story_media), skipped and logged if over 60 MB.
// Instagram: /{IG_USER}/stories gives media_url (the file). Facebook: /{PAGE}/stories lists the stories, the file comes from the video's source or the photo's images when the page token allows it.
// Body/query: { dry? } dry lists what it would save and downloads nothing. Marks sync_health 'story-saver'. Never writes or returns a token.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const GRAPH = 'https://graph.facebook.com/v26.0';
const IG_USER = '17841403590323716';   // @tararosesalon
const PAGE = '482018305295476';        // the Facebook page
const BUCKET = 'story-media';
const MAX_BYTES = 60 * 1024 * 1024;
const NAME = 'story-saver';

const ext = (type: string, isVideo: boolean) => /mp4|video/.test(type) ? 'mp4' : /png/.test(type) ? 'png' : /webp/.test(type) ? 'webp' : isVideo ? 'mp4' : 'jpg';

Deno.serve(async (req) => {
  const u = new URL(req.url);
  let body: any = {};
  if (req.method === 'POST') { try { body = await req.json(); } catch (_) {} }
  const dry = !!(u.searchParams.get('dry') || body.dry);
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const token = (Deno.env.get('IG_ACCESS_TOKEN') || '').trim();
  const started = new Date().toISOString();
  const out: any = { dry, instagram: { live: 0, saved: 0, already: 0, skipped: [] as string[] }, facebook: { live: 0, saved: 0, already: 0, noFile: 0, skipped: [] as string[] }, bytes: 0 };
  const errors: string[] = [];
  const gj = async (path: string, q: Record<string, string>, tk = token) => {
    const qs = new URLSearchParams({ ...q, access_token: tk });
    try { return await (await fetch(`${GRAPH}${path}?${qs}`)).json(); } catch (e) { return { error: { message: String((e as Error).message).slice(0, 120) } }; }
  };

  // Download one file, check the size, store it, record it.
  const save = async (r: { id: string; network: 'instagram' | 'facebook'; ts: string | null; key: string | null; permalink: string | null; fileUrl: string; isVideo: boolean }, bucketStat: any) => {
    const { data: have } = await sb.from('story_media').select('media_id').eq('media_id', r.id).maybeSingle();
    if (have) { bucketStat.already++; return; }
    if (dry) { bucketStat.saved++; return; }
    const res = await fetch(r.fileUrl);
    if (!res.ok) { bucketStat.skipped.push(`${r.id}: download ${res.status}`); return; }
    const len = Number(res.headers.get('content-length') || 0);
    if (len > MAX_BYTES) { bucketStat.skipped.push(`${r.id}: ${Math.round(len / 1048576)} MB, over 60 MB`); return; }
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > MAX_BYTES) { bucketStat.skipped.push(`${r.id}: ${Math.round(bytes.byteLength / 1048576)} MB, over 60 MB`); return; }
    const type = res.headers.get('content-type') || '';
    const d = new Date(r.ts || Date.now());
    const path = `${r.network}/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${r.id.replace(/[^A-Za-z0-9_-]/g, '_')}.${ext(type, r.isVideo)}`;
    const up = await sb.storage.from(BUCKET).upload(path, bytes, { contentType: type || (r.isVideo ? 'video/mp4' : 'image/jpeg'), upsert: false });
    if (up.error && !/exists/i.test(up.error.message)) { errors.push(`upload ${r.id}: ${up.error.message}`); return; }
    const { error } = await sb.from('story_media').insert({ media_id: r.id, network: r.network, posted_at: r.ts, story_key: r.key, permalink: r.permalink, storage_path: path, is_video: r.isVideo, bytes: bytes.byteLength });
    if (error) { errors.push(`record ${r.id}: ${error.message}`); return; }
    bucketStat.saved++; out.bytes += bytes.byteLength;
  };

  // A story Instagram gives no file for (it carries licensed music or shared content): record that once, so the calendar can say so instead of looking broken.
  const noFile = async (r: { id: string; network: 'instagram' | 'facebook'; ts: string | null; key: string | null; permalink: string | null; isVideo: boolean }, bucketStat: any) => {
    bucketStat.noFile = (bucketStat.noFile || 0) + 1;
    if (dry) return;
    const { data: have } = await sb.from('story_media').select('media_id').eq('network', r.network).or(`media_id.eq.${r.id},media_id.eq.${r.id.replace(/^(ig|fb):/, '$1:nofile:')}`).maybeSingle();
    if (have) return;
    const { error } = await sb.from('story_media').insert({ media_id: r.id.replace(/^(ig|fb):/, '$1:nofile:'), network: r.network, posted_at: r.ts, story_key: r.key, permalink: r.permalink, storage_path: null, is_video: r.isVideo, no_file: true, reason: 'Instagram or Facebook gave no file (copyrighted music or shared content)' });
    if (error) errors.push(`record no file ${r.id}: ${error.message}`);
  };

  try {
    if (!token) throw new Error('no IG_ACCESS_TOKEN secret');

    // Instagram
    const ig = await gj(`/${IG_USER}/stories`, { fields: 'id,media_type,media_url,permalink,timestamp', limit: '50' });
    if (ig.error) errors.push('instagram stories: ' + String(ig.error.message).slice(0, 160));
    for (const s of (ig.data || [])) {
      out.instagram.live++;
      const key = (String(s.permalink || '').match(/\/stories\/[^/]+\/(\d+)/) || [])[1] || null;
      if (!s.media_url) { await noFile({ id: 'ig:' + s.id, network: 'instagram', ts: s.timestamp || null, key, permalink: s.permalink || null, isVideo: s.media_type === 'VIDEO' }, out.instagram); continue; }
      try { await save({ id: 'ig:' + s.id, network: 'instagram', ts: s.timestamp || null, key, permalink: s.permalink || null, fileUrl: s.media_url, isVideo: s.media_type === 'VIDEO' }, out.instagram); }
      catch (e) { errors.push(`instagram ${s.id}: ${String((e as Error).message).slice(0, 100)}`); }
    }

    // Facebook
    const pr = await gj(`/${PAGE}`, { fields: 'access_token' });
    if (!pr.access_token) errors.push('facebook page token: ' + String(pr.error?.message || 'none').slice(0, 120));
    else {
      const pt = String(pr.access_token);
      const st = await gj(`/${PAGE}/stories`, { fields: 'post_id,media_id,media_type,creation_time,status,url', limit: '50' }, pt);
      if (st.error) errors.push('facebook stories: ' + String(st.error.message).slice(0, 160));
      for (const s of (st.data || [])) {
        if (s.status && s.status !== 'published') continue;
        out.facebook.live++;
        const isVideo = String(s.media_type || '').toLowerCase() === 'video';
        let fileUrl = '';
        if (s.media_id) {
          const m = await gj(`/${s.media_id}`, { fields: isVideo ? 'source' : 'images' }, pt);
          fileUrl = isVideo ? String(m.source || '') : String(m.images?.[0]?.source || '');
        }
        const ts = s.creation_time ? new Date(Number(s.creation_time) * 1000).toISOString() : null;
        if (!fileUrl) { out.facebook.noFile++; await noFile({ id: 'fb:' + s.post_id, network: 'facebook', ts, key: null, permalink: null, isVideo }, { noFile: 0 }); continue; }
        try { await save({ id: 'fb:' + s.post_id, network: 'facebook', ts, key: null, permalink: null, fileUrl, isVideo }, out.facebook); }
        catch (e) { errors.push(`facebook ${s.post_id}: ${String((e as Error).message).slice(0, 100)}`); }
      }
    }
  } catch (e) {
    errors.push(String((e as Error).message || e).slice(0, 300));
  }

  out.errors = errors;
  if (!dry) {
    await sb.from('sync_health').upsert({ name: NAME, last_run_at: started, ...(errors.length ? {} : { last_ok_at: new Date().toISOString() }), last_error: errors.length ? errors.join(' | ').slice(0, 500) : null }, { onConflict: 'name' });
  }
  return new Response(JSON.stringify(out), { status: errors.length ? 207 : 200, headers: { 'Content-Type': 'application/json' } });
});
