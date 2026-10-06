// Metricool into the dashboard (Kate, 6 Oct 2026): Instagram, TikTok and the Facebook
// page for the Social page, and each salon's Google Business Profile for the strip on
// the Google Reviews page. See migrations/create_metricool.sql for the tables.
// Reads the Metricool API with secret METRICOOL_USER_TOKEN (Kate's account, userId
// 4877991, plan Advanced 15). Every brand on the account is read from simpleProfiles
// each run, so a salon added later (Khalifa City is not connected yet) comes in by
// itself; its salon is read off the brand's name.
// Body/query: { days? (default 10, back from today), from?, to? (Dubai dates),
//               source?: 'all' | 'daily' | 'posts' } for a backfill.
// Posts are re-read for at least the last 45 days, because their numbers keep growing.
// Every run marks sync_health 'metricool-sync'.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const USER_ID = '4877991';
const API = 'https://app.metricool.com/api';
const TZ = 'Asia/Dubai';

// Daily series per network: [subject, metric]. Follower counts are levels, the rest counts.
const SERIES: Record<string, [string, string][]> = {
  instagram: [['account', 'followers'], ['account', 'delta_followers'], ['account', 'followers_gained'], ['account', 'followers_lost'],
    ['account', 'views'], ['account', 'reach'], ['account', 'profile_views'], ['account', 'website_clicks']],
  tiktok: [['account', 'followers_count'], ['account', 'video_views'], ['account', 'profile_views'],
    ['account', 'likes'], ['account', 'comments'], ['account', 'shares']],
  facebook: [['account', 'pageFollows'], ['account', 'page_daily_follows_unique'], ['account', 'page_daily_unfollows_unique']],
  gmb: [['', 'business_impressions_total'], ['', 'business_impressions_search'], ['', 'business_impressions_maps'],
    ['', 'call_clicks'], ['', 'business_direction_requests'], ['', 'website_clicks']],
};
const BRANCH: [RegExp, string][] = [[/bahrain/i, 'BAH'], [/al ?quoz/i, 'AQ'], [/motor ?city/i, 'MC'],
  [/khalifa/i, 'KCA'], [/saadiyat|mamsha/i, 'SAA']];

Deno.serve(async (req) => {
  const u = new URL(req.url);
  let body: any = {};
  if (req.method === 'POST') { try { body = await req.json(); } catch (_) {} }
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const token = Deno.env.get('METRICOOL_USER_TOKEN') || '';
  const now = () => new Date().toISOString();
  const dubai = (ms: number) => new Date(ms + 4 * 3600e3).toISOString().slice(0, 10);
  const days = Number(u.searchParams.get('days') || body.days || 0) || 10;
  const to = String(u.searchParams.get('to') || body.to || dubai(Date.now()));
  const from = String(u.searchParams.get('from') || body.from || dubai(Date.now() - days * 864e5));
  const postsFrom = String(u.searchParams.get('from') || body.from || dubai(Date.now() - Math.max(days, 45) * 864e5));
  const source = String(u.searchParams.get('source') || body.source || 'all');
  const want = (s: string) => source === 'all' || source === s;

  const get = async (path: string, q: Record<string, string>) => {
    const qs = new URLSearchParams({ ...q, userId: USER_ID });
    const r = await fetch(`${API}${path}?${qs}`, { headers: { 'X-Mc-Auth': token } });
    const t = await r.text();
    if (!r.ok) throw new Error(`${path} ${q.network || ''} ${q.metric || ''}: ${r.status} ${t.slice(0, 160)}`);
    return JSON.parse(t);
  };
  const save = async (table: string, rows: any[], conflict: string) => {
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await sb.from(table).upsert(rows.slice(i, i + 500), { onConflict: conflict });
      if (error) throw new Error(`${table}: ${error.message}`);
    }
    return rows.length;
  };
  // A few calls at a time; one failure is recorded, the rest carry on.
  const errors: string[] = [];
  const pool = async (jobs: (() => Promise<void>)[], n = 4) => {
    let i = 0;
    await Promise.all(Array.from({ length: n }, async () => {
      while (i < jobs.length) { const j = jobs[i++]; try { await j(); } catch (e) { errors.push(String((e as Error).message || e)); } }
    }));
  };
  // Long backfills in 90-day pieces.
  const chunks = (a: string, b: string) => {
    const out: [string, string][] = [];
    for (let s = new Date(a + 'T00:00:00Z'); s.toISOString().slice(0, 10) <= b;) {
      const e = new Date(s.getTime() + 89 * 864e5), es = e.toISOString().slice(0, 10);
      out.push([s.toISOString().slice(0, 10), es < b ? es : b]);
      s = new Date(e.getTime() + 864e5);
    }
    return out;
  };
  const win = (a: string, b: string) => ({ from: `${a}T00:00:00+04:00`, to: `${b}T23:59:59+04:00`, timezone: TZ });

  const out: any = { from, to };
  try {
    if (!token) throw new Error('no METRICOOL_USER_TOKEN secret');
    const brands = (await get('/admin/simpleProfiles', {})).map((b: any) => ({
      brand_id: b.id, label: b.label || b.title || String(b.id),
      branch: (BRANCH.find(([re]) => re.test(b.label || '')) || [])[1] || null,
      networks: Object.fromEntries(['instagram', 'tiktok', 'facebook', 'gmb'].filter(n => b[n]).map(n => [n, String(b[n])])),
      synced_at: now(),
    }));
    // Branch brands are a salon's Google profile only; Bahrain's also carries LinkedIn
    // and YouTube, which the dashboard doesn't use.
    await save('metricool_brands', brands, 'brand_id');
    out.brands = brands.length;

    if (want('daily')) {
      const rows: any[] = [];
      const jobs: (() => Promise<void>)[] = [];
      for (const b of brands) for (const net of Object.keys(b.networks)) {
        if (b.branch && net !== 'gmb') continue;
        for (const [subject, metric] of SERIES[net] || []) for (const [a, z] of chunks(from, to)) jobs.push(async () => {
          const q: Record<string, string> = { blogId: String(b.brand_id), network: net, metric, ...win(a, z) };
          if (subject) q.subject = subject;
          const vals = (await get('/v2/analytics/timelines', q)).data?.[0]?.values || [];
          for (const v of vals) {
            const date = String(v.dateTime).slice(0, 10);
            if (date < a || date > z || v.value === null) continue;
            rows.push({ date, brand_id: b.brand_id, network: net, subject, metric, value: Number(v.value) || 0, synced_at: now() });
          }
        });
      }
      await pool(jobs);
      out.daily = await save('metricool_daily', rows, 'date,brand_id,network,subject,metric');
    }

    if (want('posts')) {
      const rows: any[] = [];
      const jobs: (() => Promise<void>)[] = [];
      for (const b of brands.filter((x: any) => !x.branch)) for (const [a, z] of chunks(postsFrom, to)) {
        const w = win(a, z), id = String(b.brand_id);
        const add = (path: string, net: string, map: (p: any) => any) => {
          if (!b.networks[net]) return;
          jobs.push(async () => {
            for (const p of (await get(path, { blogId: id, ...w })).data || []) {
              const r = map(p);
              rows.push({ brand_id: b.brand_id, network: net, ...r, post_date: r.posted_at ? dubai(Date.parse(r.posted_at)) : null, synced_at: now() });
            }
          });
        };
        add('/v2/analytics/posts/instagram', 'instagram', p => ({
          post_key: `instagram:post:${p.postId}`, kind: 'post', posted_at: zoned(p.publishedAt), caption: p.content, url: p.url, image_url: p.imageUrl,
          views: n(p.views ?? p.impressionsTotal), reach: n(p.reach), likes: n(p.likes), comments: n(p.comments), shares: n(p.shares), saves: n(p.saved), interactions: n(p.interactions) }));
        add('/v2/analytics/reels/instagram', 'instagram', p => ({
          post_key: `instagram:reel:${p.reelId}`, kind: 'reel', posted_at: zoned(p.publishedAt), caption: p.content, url: p.url, image_url: p.imageUrl,
          views: n(p.views), reach: n(p.reach), likes: n(p.likes), comments: n(p.comments), shares: n(p.shares), saves: n(p.saved), interactions: n(p.interactions) }));
        add('/v2/analytics/posts/facebook', 'facebook', p => ({
          post_key: `facebook:post:${p.postId}`, kind: 'post', posted_at: p.timestamp ? new Date(p.timestamp).toISOString() : zoned(p.created), caption: p.text, url: p.link, image_url: p.picture,
          views: n(p.impressions), reach: n(p.impressionsUnique), likes: n(p.reactions), comments: n(p.comments), shares: n(p.shares), saves: null,
          interactions: (n(p.reactions) || 0) + (n(p.comments) || 0) + (n(p.shares) || 0) }));
        add('/v2/analytics/reels/facebook', 'facebook', p => ({
          post_key: `facebook:reel:${p.reelId}`, kind: 'reel', posted_at: zoned(p.created), caption: p.description, url: p.reelUrl, image_url: p.thumbnailUrl,
          views: n(p.blueReelsPlayCount), reach: n(p.postImpressionsUnique) || null, likes: n(p.postVideoReactions), comments: null, shares: null, saves: null,
          interactions: n(p.postVideoSocialActions) }));
        add('/v2/analytics/posts/tiktok', 'tiktok', p => ({
          post_key: `tiktok:video:${p.videoId}`, kind: p.type === 'PHOTO' ? 'photo' : 'video',
          posted_at: p.createTime ? new Date(String(p.createTime).replace(/([+-]\d\d)(\d\d)$/, '$1:$2')).toISOString() : null,
          caption: p.videoDescription || p.title, url: String(p.shareUrl || '').split('?')[0], image_url: p.coverImageUrl,
          views: n(p.viewCount), reach: n(p.reach), likes: n(p.likeCount), comments: n(p.commentCount), shares: n(p.shareCount), saves: null,
          interactions: (n(p.likeCount) || 0) + (n(p.commentCount) || 0) + (n(p.shareCount) || 0) }));
      }
      await pool(jobs);
      // The same post can come back in two overlapping pieces: keep one.
      out.posts = await save('metricool_posts', Object.values(Object.fromEntries(rows.map(r => [r.post_key, r]))), 'post_key');
    }
    if (errors.length) { out.errors = errors; out.error = `${errors.length} call(s) failed: ${errors[0]}`; }
  } catch (e) {
    out.error = String((e as Error).message || e);
  }
  const mark: any = { name: 'metricool-sync', last_run_at: now(), last_error: out.error || null };
  if (!out.error) mark.last_ok_at = mark.last_run_at;
  await sb.from('sync_health').upsert(mark, { onConflict: 'name' });
  return new Response(JSON.stringify(out), { status: out.error ? 502 : 200, headers: { 'Content-Type': 'application/json' } });
});

const n = (v: any) => (v === null || v === undefined || v === '' || isNaN(Number(v))) ? null : Number(v);

// Metricool gives Instagram and Facebook times as { dateTime, timezone } in the account's
// own zone (Europe/Madrid), with no offset: turn that into a real instant.
function zoned(x: any): string | null {
  if (!x || !x.dateTime) return null;
  const guess = Date.parse(x.dateTime + 'Z');
  if (isNaN(guess)) return null;
  const tz = x.timezone || 'UTC';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date(guess)).map(p => [p.type, p.value]));
  const asTz = Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`);
  return new Date(guess - (asTz - guess)).toISOString();
}
