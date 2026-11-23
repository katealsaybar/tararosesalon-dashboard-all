// fb-story-stats (Kate, 23 Nov 2026): the numbers Meta gives for Facebook Page stories, copied into fb_story_stats while each story is live.
// Metricool has no views or reach for Facebook stories, and Meta lists a story (and its numbers) for 24 hours only, so this runs every 2 hours (pg_cron 'fb-story-stats').
// Read only against Meta (secret IG_ACCESS_TOKEN, a Facebook page token is made from it, as story-saver does). Per story, from /{PAGE}/stories then /{post_id}/insights:
//   STORY_MEDIA_VIEW views, STORY_TOTAL_MEDIA_VIEW_UNIQUE reach, PAGES_FB_STORY_REPLIES replies, PAGES_FB_STORY_THREAD_LIGHTWEIGHT_REACTIONS reactions,
//   PAGES_FB_STORY_SHARES shares, STORY_INTERACTION interactions. Facebook has no taps forward, taps back or exits.
// Numbers only grow: a later read never writes a lower number than the one kept. Only stories from the last 72 hours are read.
// Body/query: { dry? } dry reads and returns what it would write, writes nothing. Marks sync_health 'fb-story-stats'. Never writes or returns a token.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const GRAPH = 'https://graph.facebook.com/v26.0';
const PAGE = '482018305295476';        // the Facebook page
const NAME = 'fb-story-stats';
const METRICS: Record<string, string> = {
  STORY_MEDIA_VIEW: 'views', STORY_TOTAL_MEDIA_VIEW_UNIQUE: 'reach', PAGES_FB_STORY_REPLIES: 'replies',
  PAGES_FB_STORY_THREAD_LIGHTWEIGHT_REACTIONS: 'reactions', PAGES_FB_STORY_SHARES: 'shares', STORY_INTERACTION: 'interactions',
};
const COLS = ['views', 'reach', 'replies', 'reactions', 'shares', 'interactions'];

Deno.serve(async (req) => {
  const u = new URL(req.url);
  let body: any = {};
  if (req.method === 'POST') { try { body = await req.json(); } catch (_) {} }
  const dry = !!(u.searchParams.get('dry') || body.dry);
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const token = (Deno.env.get('IG_ACCESS_TOKEN') || '').trim();
  const started = new Date().toISOString();
  const out: any = { dry, listed: 0, read: 0, written: 0, stories: [] as any[] };
  const errors: string[] = [];
  const gj = async (path: string, q: Record<string, string>, tk: string) => {
    const qs = new URLSearchParams({ ...q, access_token: tk });
    try { return await (await fetch(`${GRAPH}${path}?${qs}`)).json(); } catch (e) { return { error: { message: String((e as Error).message).slice(0, 120) } }; }
  };

  try {
    if (!token) throw new Error('no IG_ACCESS_TOKEN secret');
    const pr = await gj(`/${PAGE}`, { fields: 'access_token' }, token);
    if (!pr.access_token) throw new Error('facebook page token: ' + String(pr.error?.message || 'none').slice(0, 120));
    const pt = String(pr.access_token);
    const st = await gj(`/${PAGE}/stories`, { fields: 'post_id,media_type,creation_time,status', limit: '50' }, pt);
    if (st.error) throw new Error('facebook stories: ' + String(st.error.message).slice(0, 160));
    const since = Date.now() / 1000 - 72 * 3600;
    const list = (st.data || []).filter((s: any) => s.post_id && Number(s.creation_time) >= since);
    out.listed = list.length;

    const ids = list.map((s: any) => String(s.post_id));
    const { data: have } = ids.length ? await sb.from('fb_story_stats').select('post_id,' + COLS.join(',')).in('post_id', ids) : { data: [] };
    const kept: Record<string, any> = {};
    (have || []).forEach((r: any) => { kept[r.post_id] = r; });

    for (const s of list) {
      const id = String(s.post_id), row: any = { post_id: id, posted_at: new Date(Number(s.creation_time) * 1000).toISOString(), status: s.status || null, updated_at: new Date().toISOString() };
      let got = 0;
      for (const [metric, col] of Object.entries(METRICS)) {
        const r = await gj(`/${id}/insights`, { metric }, pt);
        if (r.error) { errors.push(`${metric}: ${String(r.error.message).slice(0, 80)}`); continue; }
        const v = r.data && r.data[0] && r.data[0].values && r.data[0].values[0] ? Number(r.data[0].values[0].value) : null;
        if (v === null || !isFinite(v)) continue;
        got++;
        row[col] = v;
      }
      out.read++;
      // numbers only grow
      COLS.forEach(c => { const old = kept[id] ? kept[id][c] : null; if (old !== null && old !== undefined && (row[c] === undefined || row[c] < old)) row[c] = old; });
      out.stories.push({ age_h: Math.round((Date.now() / 1000 - Number(s.creation_time)) / 360) / 10, status: s.status, got, views: row.views ?? null, reach: row.reach ?? null });
      if (!dry && got) {
        const { error } = await sb.from('fb_story_stats').upsert(row, { onConflict: 'post_id' });
        if (error) errors.push(`write ${id}: ${error.message}`); else out.written++;
      }
    }
  } catch (e) { errors.push(String((e as Error).message).slice(0, 200)); }

  out.errors = [...new Set(errors)].slice(0, 6);
  try {
    await sb.from('sync_health').upsert({ name: NAME, last_run_at: started, ...(errors.length ? {} : { last_ok_at: new Date().toISOString() }), last_error: errors.length ? errors.join(' | ').slice(0, 500) : null }, { onConflict: 'name' });
  } catch (_) {}
  return Response.json(out, { status: errors.length && !out.listed ? 502 : 200 });
});
