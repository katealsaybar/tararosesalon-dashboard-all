// Metricool into the dashboard (Kate, 6 Oct 2026): Instagram, TikTok and the Facebook
// page for the Social page, and each salon's Google Business Profile for the strip on
// the Google Reviews page. See migrations/create_metricool.sql for the tables.
// Reads the Metricool API with secret METRICOOL_USER_TOKEN (Kate's account, userId
// 4877991, plan Advanced 15). Every brand on the account is read from simpleProfiles
// each run, so a salon added later (Khalifa City is not connected yet) comes in by
// itself; its salon is read off the brand's name.
// Body/query: { days? (default 10, back from today), from?, to? (Dubai dates),
//               source?: 'all' | 'daily' | 'posts' | 'reviews', dry? } for a backfill.
// Reviews (Kate, 6 Oct 2026): each salon's Google reviews into google_reviews, until the
// Business Profile API is approved. See syncReviews below; dry: true only reports.
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
    if (want('reviews')) out.reviews = await syncReviews(sb, brands, get, !!(body.dry || u.searchParams.get('dry')), errors);
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

// ── Google reviews (Kate, 6 Oct 2026) ──────────────────────────────────────────────
// google_reviews holds every review from the 24 Sep 2026 pull (source 'seed', with their
// Maps links and client photos). Metricool only has reviews from when each salon was
// connected (Oct 2025 on; Bahrain Jul 2026), so it can't replace those rows. Instead each
// Metricool review is matched to its row and the row is kept up to date (replied, the
// reply, an exact date where the pull only had "a year ago"); a review with no row is
// new and is added (source 'api', review_id = Google's review id, as the Business
// Profile API sync would). gbp_name remembers the match, so it is made once.
// Match: same salon, same stars, same reviewer name (letters only), and the same opening
// words, a date within 3 days, or for a row dated "a year ago" within 60 days; the
// closest date wins. A reply is never taken away: Metricool's flag can lag behind Google.
// Only reviews from 20 Sep 2026 on are added: an older one with no row wasn't on Google's
// public list at the 24 Sep pull (the dry run on 6 Oct found 7, among them a 5★ from "Tara
// Rose Management" and two unreplied low-star ones), so Google had most likely taken it
// down; Metricool keeps them. They are counted as skipped, never shown.
// Khalifa City A isn't in Metricool, so its new reviews wait until it is connected.
const REVIEW_BRANCH: Record<string, string> = { KCA: 'Khalifa City A, Abu Dhabi', SAA: 'Saadiyat, Abu Dhabi',
  AQ: 'Al Quoz, Dubai', MC: 'Motor City, Dubai', BAH: 'District 2, Bahrain' };
const letters = (s: any) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]/gu, '');
const opening = (s: any) => letters(s).slice(0, 40);
const NEW_FROM = '2026-09-20';

async function syncReviews(sb: any, brands: any[], get: any, dry: boolean, errors: string[]) {
  const now = new Date().toISOString();
  const dubaiDate = (ms: number) => new Date(ms + 4 * 3600e3).toISOString().slice(0, 10);
  const report: any = {};
  for (const b of brands.filter((x: any) => x.branch && x.networks.gmb && REVIEW_BRANCH[x.branch])) {
    const branch = REVIEW_BRANCH[b.branch];
    const r: any = report[b.branch] = { metricool: 0, matched: 0, updated: 0, added: 0, skipped: 0, replies_read: 0 };
    try {
      const reviews = (await get('/v2/analytics/reviews/gbp', { blogId: String(b.brand_id),
        from: '2015-01-01T00:00:00+04:00', to: dubaiDate(Date.now()) + 'T23:59:59+04:00', timezone: 'Asia/Dubai' })).data || [];
      r.metricool = reviews.length;
      const rows: any[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await sb.from('google_reviews')
          .select('review_id,reviewer,stars,comment,review_date,date_approx,replied,reply,gbp_name')
          .eq('branch', branch).range(from, from + 999);
        if (error) throw new Error('google_reviews: ' + error.message);
        rows.push(...data); if (data.length < 1000) break;
      }
      const byName = new Map(rows.filter(x => x.gbp_name).map(x => [x.gbp_name, x]));
      const taken = new Set(rows.filter(x => x.gbp_name).map(x => x.review_id));
      const updates: any[] = [], inserts: any[] = [];
      // Oldest first, so two reviews from one person match their rows in order.
      for (const m of [...reviews].sort((a: any, z: any) => a.created - z.created)) {
        const date = dubaiDate(m.created), stars = Number(m.starRating), who = letters(m.reviewerName);
        let row = byName.get(m.name);
        if (!row) {
          const days = (x: any) => Math.abs(Date.parse(x.review_date) - Date.parse(date)) / 864e5;
          const c = rows.filter(x => !taken.has(x.review_id) && x.stars === stars && letters(x.reviewer) === who && who &&
            ((opening(m.text) && opening(x.comment) === opening(m.text)) || days(x) <= 3 || (x.date_approx && days(x) <= 60)))
            .sort((a, z) => days(a) - days(z));
          row = c[0];
        }
        if (!row && date < NEW_FROM) { r.skipped++; continue; }
        let reply = row && row.reply ? row.reply : '';
        const replied = !!(m.replied || (row && row.replied));
        if (m.replied && !reply) {
          try {
            const rr = await get('/v2/analytics/reviews/gbp/replies', { blogId: String(b.brand_id), reviewId: m.name });
            reply = String(rr.data?.comment || '').trim(); r.replies_read++;
          } catch (_) { /* a few replies come back "not found"; the row still says replied */ }
        }
        if (row) {
          r.matched++; taken.add(row.review_id);
          const ch: any = { review_id: row.review_id, gbp_name: m.name, replied, reply: reply || row.reply || '', synced_at: now };
          if (row.date_approx) { ch.review_date = date; ch.date_approx = false; ch.created_at = new Date(m.created).toISOString(); }
          if (!row.comment && m.text) ch.comment = m.text;
          const same = row.gbp_name === m.name && row.replied === ch.replied && (row.reply || '') === ch.reply && !ch.review_date && !ch.comment;
          if (!same) updates.push(ch);
        } else {
          inserts.push({ review_id: m.name, gbp_name: m.name, branch, location: 'locations/' + m.locationId, stars, reviewer: m.reviewerName || null,
            comment: m.text || '', review_date: date, date_approx: false, replied, reply, source: 'api',
            created_at: new Date(m.created).toISOString(), updated_at: m.updated ? new Date(m.updated).toISOString() : null, synced_at: now });
        }
      }
      r.updated = updates.length; r.added = inserts.length;
      if (dry) { r.sample_added = inserts.slice(-5).map(x => `${x.review_date} ${x.stars}★ ${x.reviewer}`); continue; }
      for (const u of updates) {
        const { review_id, ...set } = u;
        const { error } = await sb.from('google_reviews').update(set).eq('review_id', review_id);
        if (error) throw new Error('google_reviews update: ' + error.message);
      }
      if (inserts.length) {
        const { error } = await sb.from('google_reviews').upsert(inserts, { onConflict: 'review_id' });
        if (error) throw new Error('google_reviews insert: ' + error.message);
      }
      // A row Metricool vouches for shows as synced tonight; the page's "Last sync" reads it.
      if (!updates.length && reviews.length) await sb.from('google_reviews').update({ synced_at: now }).eq('gbp_name', reviews[0].name);
    } catch (e) {
      errors.push(`reviews ${b.branch}: ${(e as Error).message || e}`);
    }
  }
  return report;
}
