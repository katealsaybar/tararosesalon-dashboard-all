// Posts that tag @tararosesalon → ig_tagged_posts (Kate, 28 Sep 2026).
// Reads Meta's /tags edge for the salon's own IG account with IG_ACCESS_TOKEN
// (a long-lived token from Kate's TRS Staff Benchmarks Meta app). Walks back
// newest first until it passes ?days= (default 45), so a nightly run also
// re-catches anything late. Body/query: { days?: number }.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const IG_USER = '17841403590323716';   // @tararosesalon
const GRAPH = 'https://graph.facebook.com/v26.0';

Deno.serve(async (req) => {
  const token = (Deno.env.get('IG_ACCESS_TOKEN') || '').trim();   // a pasted secret can carry a stray space
  if (!token) return json({ error: 'IG_ACCESS_TOKEN not set' }, 500);
  const u = new URL(req.url);
  let days = Number(u.searchParams.get('days') || 0);
  if (!days && req.method === 'POST') { try { days = Number((await req.json()).days || 0); } catch (_) {} }
  if (!days) days = 45;
  const since = Date.now() - days * 864e5;

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  let next: string | null = `${GRAPH}/${IG_USER}/tags?fields=username,timestamp,media_type,permalink&limit=50&access_token=${encodeURIComponent(token)}`;
  let saved = 0, pages = 0, oldest: string | null = null;
  while (next && pages < 60) {
    pages++;
    const r = await fetch(next);
    const d = await r.json();
    if (!r.ok || d.error) return json({ error: d.error?.message || r.status, pages, saved }, 502);
    const rows = (d.data || []).filter((m: any) => m.username && m.timestamp).map((m: any) => ({
      media_id: m.id, username: String(m.username).toLowerCase(), posted_at: m.timestamp,
      media_type: m.media_type || null, permalink: m.permalink || null, synced_at: new Date().toISOString(),
    }));
    if (rows.length) {
      const { error } = await sb.from('ig_tagged_posts').upsert(rows, { onConflict: 'media_id' });
      if (error) return json({ error: error.message, pages, saved }, 500);
      saved += rows.length;
      oldest = rows[rows.length - 1].posted_at;
    }
    // Newest first: once a whole page is older than the window, stop.
    if (!rows.length || rows.every((x: any) => Date.parse(x.posted_at) < since)) break;
    next = d.paging?.next || null;
  }
  return json({ saved, pages, oldest, days });
});

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
