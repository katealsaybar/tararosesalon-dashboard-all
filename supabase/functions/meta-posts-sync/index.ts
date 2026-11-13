// meta-posts-sync (Kate, 13 Nov 2026): two labels on the posts already in metricool_posts, for the Content Calendar.
//   media_type + slides  from the Instagram Graph API (/{IG_USER}/media, secret IG_ACCESS_TOKEN, read only): 'carousel' (CAROUSEL_ALBUM, with its slide count), 'image', 'reel', 'video'.
//   source               'metricool' when the post's live url is in Metricool's scheduler list (/v2/scheduler/posts, providers[].publicUrl), else 'manual' (posted by hand, for example by Hanneh).
// Metricool already carries every Instagram and Facebook post (checked 13 Nov), so this adds no rows: it only labels rows that exist and says which Instagram posts are not in the table yet.
// Body/query: { days? (default 45, back from today, 7 to 400), dry? } dry only reports. Every run marks sync_health 'meta-posts-sync'. Needs metricool-sync to have run first (nightly, 03:20 Dubai; this one 03:40).
// Read only against Meta and Metricool. Never writes a token, never returns one.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const GRAPH = 'https://graph.facebook.com/v26.0';
const IG_USER = '17841403590323716';   // @tararosesalon
const BLOG = '6329614';                // Metricool brand "tararosesalon"
const USER_ID = '4877991';
const NAME = 'meta-posts-sync';

const dayMs = 864e5;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const igCode = (u: string) => { const m = String(u || '').match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/); return m ? m[1] : null; };
const ttId = (u: string) => { const m = String(u || '').match(/\/video\/(\d+)/); return m ? m[1] : null; };
const bigIds = (s: string) => (String(s || '').match(/\d{8,}/g) || []);

Deno.serve(async (req) => {
  const u = new URL(req.url);
  let body: any = {};
  if (req.method === 'POST') { try { body = await req.json(); } catch (_) {} }
  const days = Math.min(400, Math.max(7, Number(u.searchParams.get('days') || body.days || 0) || 45));
  const dry = !!(u.searchParams.get('dry') || body.dry);
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const igToken = (Deno.env.get('IG_ACCESS_TOKEN') || '').trim();
  const mcToken = Deno.env.get('METRICOOL_USER_TOKEN') || '';
  const started = new Date().toISOString();
  const out: any = { days, dry };
  const errors: string[] = [];
  const todayMs = Date.now() + 4 * 3600e3;                 // Dubai
  const fromDate = iso(todayMs - days * dayMs);

  try {
    if (!igToken) throw new Error('no IG_ACCESS_TOKEN secret');
    if (!mcToken) throw new Error('no METRICOOL_USER_TOKEN secret');

    // 1. Metricool's scheduler list: what was scheduled in Metricool, with the live url once it is out.
    const sched = { ig: new Set<string>(), tt: new Set<string>(), ids: new Set<string>() };
    let earliest = '', items = 0;
    for (let s = Date.parse(fromDate + 'T00:00:00Z'); s <= todayMs + 60 * dayMs; s += 30 * dayMs) {
      const e = Math.min(s + 30 * dayMs - 1000, todayMs + 60 * dayMs);
      const qs = new URLSearchParams({ blogId: BLOG, userId: USER_ID, start: iso(s) + 'T00:00:00', end: iso(e) + 'T23:59:59', timezone: 'Asia/Dubai' });
      const r = await fetch(`https://app.metricool.com/api/v2/scheduler/posts?${qs}`, { headers: { 'X-Mc-Auth': mcToken } });
      if (!r.ok) { errors.push(`scheduler ${iso(s)}: ${r.status}`); continue; }
      const j = await r.json();
      for (const p of (j.data || [])) {
        items++;
        const d = String(p.publicationDate?.dateTime || '').slice(0, 10);
        if (d && (!earliest || d < earliest)) earliest = d;
        for (const pr of (p.providers || [])) {
          const url = String(pr.publicUrl || ''), id = String(pr.id || '');
          const c = igCode(url) || igCode(id); if (c) sched.ig.add(c);
          const t = ttId(url) || ttId(id); if (t) sched.tt.add(t);
          bigIds(url).concat(bigIds(id)).forEach(x => sched.ids.add(x));
        }
      }
    }
    out.scheduler = { items, earliest, igCodes: sched.ig.size, tiktok: sched.tt.size };

    // 2. Instagram media from Meta: type and slide count. Small pages (Meta refuses big ones), newest first, stop at the cut-off.
    const media: { code: string; type: string; slides: number | null; ts: string }[] = [];
    {
      const fields = 'id,media_type,media_product_type,timestamp,permalink,children{media_type}';
      let size = 12, pages = 0;
      let url = `${GRAPH}/${IG_USER}/media?fields=${encodeURIComponent(fields)}&limit=${size}&access_token=${encodeURIComponent(igToken)}`;
      const cutoff = Date.parse(fromDate + 'T00:00:00Z') - 3 * dayMs;
      while (url && pages < 60) {
        const r = await fetch(url); const j = await r.json();
        if (j.error) {
          if (size > 4) { size = Math.max(4, Math.floor(size / 2)); url = `${GRAPH}/${IG_USER}/media?fields=${encodeURIComponent(fields)}&limit=${size}&access_token=${encodeURIComponent(igToken)}`; if (pages === 0) continue; }
          errors.push('instagram media: ' + String(j.error.message || '').slice(0, 160)); break;
        }
        for (const m of (j.data || [])) {
          const code = igCode(m.permalink); if (!code) continue;
          const type = m.media_type === 'CAROUSEL_ALBUM' ? 'carousel' : m.media_type === 'IMAGE' ? 'image' : (m.media_product_type === 'REELS' ? 'reel' : 'video');
          media.push({ code, type, slides: m.children?.data ? m.children.data.length : null, ts: m.timestamp });
        }
        pages++;
        const last = j.data && j.data.length ? Date.parse(j.data[j.data.length - 1].timestamp) : 0;
        url = j.paging?.next && last > cutoff ? j.paging.next : '';
      }
    }
    out.instagramMedia = media.length;

    // 3. The rows we already hold, since the cut-off.
    const rows: any[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from('metricool_posts').select('post_key,network,kind,url,post_date,source,media_type,slides')
        .in('network', ['instagram', 'facebook', 'tiktok']).neq('kind', 'story').gte('post_date', fromDate).range(from, from + 999);
      if (error) throw new Error('metricool_posts: ' + error.message);
      rows.push(...(data || [])); if (!data || data.length < 1000) break;
    }
    out.rows = rows.length;

    // Rows older than the first scheduled item are left alone (the scheduler list may not reach back that far), so they are never called Manual by mistake.
    const labelFrom = earliest && earliest > fromDate ? earliest : fromDate;
    out.labelFrom = labelFrom;
    const stamp = new Date().toISOString();
    const byCode = new Map(media.map(m => [m.code, m]));
    const counts: any = { instagram: { metricool: 0, manual: 0 }, facebook: { metricool: 0, manual: 0 }, tiktok: { metricool: 0, manual: 0 } };
    let changed = 0, carousels = 0;
    const seenCodes = new Set<string>();
    for (const r of rows) {
      const patch: any = {};
      if (r.network === 'instagram') {
        const c = igCode(r.url); if (c) seenCodes.add(c);
        const m = c ? byCode.get(c) : null;
        if (m) { if (r.media_type !== m.type) patch.media_type = m.type; if ((r.slides ?? null) !== m.slides && m.type === 'carousel') patch.slides = m.slides; if (m.type === 'carousel') carousels++; }
      }
      if (String(r.post_date) >= labelFrom) {
        let isSched = false;
        if (r.network === 'instagram') { const c = igCode(r.url); isSched = !!c && sched.ig.has(c); }
        else if (r.network === 'tiktok') { const t = ttId(r.url) || (String(r.post_key).match(/(\d{8,})/) || [])[1]; isSched = !!t && sched.tt.has(t); }
        else { isSched = bigIds(r.url + ' ' + r.post_key).some(x => sched.ids.has(x)); }
        const src = isSched ? 'metricool' : 'manual';
        counts[r.network][src]++;
        if (r.source !== src) patch.source = src;
      }
      if (Object.keys(patch).length) {
        changed++;
        if (!dry) {
          const { error } = await sb.from('metricool_posts').update({ ...patch, source_checked_at: stamp }).eq('post_key', r.post_key);
          if (error) errors.push(`update ${r.post_key}: ${error.message}`);
        }
      }
    }
    out.sourceCounts = counts; out.carouselsLabelled = carousels; out.rowsChanged = changed;
    out.instagramNotInTable = media.filter(m => !seenCodes.has(m.code) && m.ts >= fromDate).map(m => m.code + ' ' + m.ts.slice(0, 10)).slice(0, 30);
  } catch (e) {
    errors.push(String((e as Error).message || e).slice(0, 300));
  }

  out.errors = errors;
  if (!dry) {
    await sb.from('sync_health').upsert({ name: NAME, last_run_at: started, ...(errors.length ? {} : { last_ok_at: new Date().toISOString() }), last_error: errors.length ? errors.join(' | ').slice(0, 500) : null }, { onConflict: 'name' });
  }
  return new Response(JSON.stringify(out), { status: errors.length ? 207 : 200, headers: { 'Content-Type': 'application/json' } });
});
