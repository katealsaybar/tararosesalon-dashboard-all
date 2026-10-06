// Instagram posts that count toward Staff Benchmarks' Social posts (feed)
// (Kate, 28 Sep 2026), read with IG_ACCESS_TOKEN from Kate's TRS Staff
// Benchmarks Meta app:
//   tags    → ig_tagged_posts: anyone's posts that tag @tararosesalon (/tags edge)
//   collabs → ig_collab_posts: the salon's own posts, one row per collaborator
//             (/media edge, collaborators field). A stylist's own post with the
//             salon as collaborator is on neither edge unless she also tags it.
// Both walk back newest first until they pass ?days= (default 45), so the nightly
// run also re-catches anything late.
// Body/query: { days?, source?: 'both' | 'tags' | 'collabs', after?: cursor, max?: pages }.
// A long backfill runs one source at a time in slices: each call reads up to `max`
// pages (default 60) and returns `next`, the cursor to pass as `after` next time.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const IG_USER = '17841403590323716';   // @tararosesalon
const GRAPH = 'https://graph.facebook.com/v26.0';

Deno.serve(async (req) => {
  const token = (Deno.env.get('IG_ACCESS_TOKEN') || '').trim();   // a pasted secret can carry a stray space
  if (!token) return json({ error: 'IG_ACCESS_TOKEN not set' }, 500);
  const u = new URL(req.url);
  let body: any = {};
  if (req.method === 'POST') { try { body = await req.json(); } catch (_) {} }
  const days = Number(u.searchParams.get('days') || body.days || 0) || 45;
  const source = String(u.searchParams.get('source') || body.source || 'both');
  const after = String(u.searchParams.get('after') || body.after || '');
  const max = Math.min(60, Number(u.searchParams.get('max') || body.max || 60));
  const since = Date.now() - days * 864e5;
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const now = () => new Date().toISOString();

  const out: any = { days };
  if (source === 'both' || source === 'tags') {
    out.tags = await walk(sb, token, 'tags', 'username,timestamp,media_type,permalink', after, max, since,
      (m: any) => m.username && m.timestamp ? [{ media_id: m.id, username: String(m.username).toLowerCase(), posted_at: m.timestamp,
        media_type: m.media_type || null, permalink: m.permalink || null, synced_at: now() }] : [],
      'ig_tagged_posts', 'media_id');
  }
  if (source === 'both' || source === 'collabs') {
    out.collabs = await walk(sb, token, 'media', 'timestamp,permalink,collaborators{username}', source === 'collabs' ? after : '', max, since,
      (m: any) => (m.collaborators?.data || []).map((c: any) => String(c.username || '').toLowerCase())
        .filter((h: string) => h && h !== 'tararosesalon')
        .map((h: string) => ({ media_id: m.id, username: h, posted_at: m.timestamp, permalink: m.permalink || null, synced_at: now() })),
      'ig_collab_posts', 'media_id,username');
  }
  const failed = out.tags?.error || out.collabs?.error;
  // Every run leaves a mark in sync_health, so a dead token shows on the socials card
  // within a day (Kate, 5 Oct 2026: the token expired 28 Sep and nobody knew for a week).
  const mark: any = { name: 'ig-tags-sync', last_run_at: now(), last_error: failed ? String(failed) : null };
  if (!failed) mark.last_ok_at = mark.last_run_at;
  await sb.from('sync_health').upsert(mark, { onConflict: 'name' });
  return json(out, failed ? 502 : 200);
});

// One edge, newest first, upserting whatever rows(m) makes of each item.
async function walk(sb: any, token: string, edge: string, fields: string, after: string, max: number, since: number,
                    rows: (m: any) => any[], table: string, conflict: string) {
  let limit = 50;
  let next: string | null = `${GRAPH}/${IG_USER}/${edge}?fields=${fields}&limit=${limit}${after ? '&after=' + encodeURIComponent(after) : ''}&access_token=${encodeURIComponent(token)}`;
  let saved = 0, pages = 0, oldest: string | null = null, cursor: string | null = null, done = false;
  while (next && pages < max) {
    pages++;
    const r = await fetch(next);
    const d = await r.json();
    // Meta refuses some heavy /tags pages at 50 ("Please reduce the amount of data...",
    // Kate, 6 Oct 2026: page 9 every run). Retry the same page smaller, down to 5.
    if (d.error && /reduce the amount of data/i.test(d.error.message || '') && limit > 5) {
      limit = Math.max(5, Math.floor(limit / 2));
      next = next.replace(/([?&])limit=\d+/, `$1limit=${limit}`);
      pages--;
      continue;
    }
    if (!r.ok || d.error) return { error: d.error?.message || r.status, pages, saved };
    const items = d.data || [];
    const batch = items.flatMap(rows);
    if (batch.length) {
      const { error } = await sb.from(table).upsert(batch, { onConflict: conflict });
      if (error) return { error: error.message, pages, saved };
      saved += batch.length;
    }
    if (items.length) oldest = items[items.length - 1].timestamp || oldest;
    cursor = d.paging?.cursors?.after || null;
    // Newest first: once a whole page is older than the window, stop.
    if (!items.length || items.every((x: any) => Date.parse(x.timestamp) < since)) { done = true; break; }
    next = d.paging?.next || null;
    if (!next) done = true;
  }
  return { saved, pages, oldest, next: done ? null : cursor };
}

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
