// Website & Search (Kate, 6 Oct 2026): Google Analytics 4 and Search Console into
// ga4_daily, ga4_channel_daily, ga4_page_daily, gsc_daily and gsc_query_daily
// (migrations/create_website_daily.sql). Same sign-in as google-ads-sync: secrets
// GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN (Kate's account, read-only
// Analytics and Search Console scopes).
// Body/query: { days? (default 10, back from today), from?, to?, source?: 'both' | 'ga4' | 'gsc' }.
// A long backfill goes a few months a call. Every run marks sync_health 'website-sync'.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const GA4 = 'https://analyticsdata.googleapis.com/v1beta/properties/424039157:runReport';
const GSC = 'https://www.googleapis.com/webmasters/v3/sites/' + encodeURIComponent('sc-domain:tararosesalon.com') + '/searchAnalytics/query';

Deno.serve(async (req) => {
  const u = new URL(req.url);
  let body: any = {};
  if (req.method === 'POST') { try { body = await req.json(); } catch (_) {} }
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const now = () => new Date().toISOString();
  const dubai = (ms: number) => new Date(ms + 4 * 3600e3).toISOString().slice(0, 10);
  const days = Number(u.searchParams.get('days') || body.days || 0) || 10;
  const to = String(u.searchParams.get('to') || body.to || dubai(Date.now()));
  const from = String(u.searchParams.get('from') || body.from || dubai(Date.now() - days * 864e5));
  const source = String(u.searchParams.get('source') || body.source || 'both');

  const out: any = { from, to };
  try {
    const h = { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' };
    const save = async (table: string, rows: any[], conflict: string) => {
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await sb.from(table).upsert(rows.slice(i, i + 500), { onConflict: conflict });
        if (error) throw new Error(`${table}: ${error.message}`);
      }
      return rows.length;
    };
    if (source === 'both' || source === 'ga4') {
      const day = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
      const n = (r: any, i: number) => Number(r.metricValues[i].value || 0);
      out.ga4_daily = await save('ga4_daily', (await ga4(h, from, to, ['date'], ['sessions', 'totalUsers', 'newUsers', 'engagedSessions']))
        .map(r => ({ date: day(r.dimensionValues[0].value), sessions: n(r, 0), users: n(r, 1), new_users: n(r, 2), engaged_sessions: n(r, 3), synced_at: now() })), 'date');
      out.ga4_channels = await save('ga4_channel_daily', (await ga4(h, from, to, ['date', 'sessionDefaultChannelGroup'], ['sessions', 'engagedSessions']))
        .map(r => ({ date: day(r.dimensionValues[0].value), channel: r.dimensionValues[1].value, sessions: n(r, 0), engaged_sessions: n(r, 1), synced_at: now() })), 'date,channel');
      out.ga4_pages = await save('ga4_page_daily', (await ga4(h, from, to, ['date', 'pagePath'], ['screenPageViews']))
        .map(r => ({ date: day(r.dimensionValues[0].value), page: r.dimensionValues[1].value, views: n(r, 0), synced_at: now() })), 'date,page');
    }
    if (source === 'both' || source === 'gsc') {
      out.gsc_daily = await save('gsc_daily', (await gsc(h, from, to, ['date']))
        .map(r => ({ date: r.keys[0], clicks: r.clicks, impressions: r.impressions, position: r.position, synced_at: now() })), 'date');
      out.gsc_queries = await save('gsc_query_daily', (await gsc(h, from, to, ['date', 'query']))
        .filter(r => r.clicks > 0 || r.impressions >= 5)
        .map(r => ({ date: r.keys[0], query: r.keys[1], clicks: r.clicks, impressions: r.impressions, position: r.position, synced_at: now() })), 'date,query');
    }
  } catch (e) {
    out.error = String((e as Error).message || e);
  }
  const mark: any = { name: 'website-sync', last_run_at: now(), last_error: out.error || null };
  if (!out.error) mark.last_ok_at = mark.last_run_at;
  await sb.from('sync_health').upsert(mark, { onConflict: 'name' });
  return new Response(JSON.stringify(out), { status: out.error ? 502 : 200, headers: { 'Content-Type': 'application/json' } });
});

// Every row of a GA4 report, 25,000 a page.
async function ga4(h: any, from: string, to: string, dims: string[], mets: string[]) {
  const all: any[] = [];
  for (let offset = 0; ; offset += 25000) {
    const r = await fetch(GA4, { method: 'POST', headers: h, body: JSON.stringify({
      dateRanges: [{ startDate: from, endDate: to }], dimensions: dims.map(name => ({ name })),
      metrics: mets.map(name => ({ name })), limit: 25000, offset }) });
    const d = await r.json();
    if (!r.ok) throw new Error('Analytics: ' + (d.error?.message || r.status));
    all.push(...(d.rows || []));
    if (!d.rows || all.length >= Number(d.rowCount || 0)) return all;
  }
}

// Every row of a Search Console query, 25,000 a page.
async function gsc(h: any, from: string, to: string, dims: string[]) {
  const all: any[] = [];
  for (let startRow = 0; ; startRow += 25000) {
    const r = await fetch(GSC, { method: 'POST', headers: h, body: JSON.stringify({
      startDate: from, endDate: to, dimensions: dims, rowLimit: 25000, startRow }) });
    const d = await r.json();
    if (!r.ok) throw new Error('Search Console: ' + (d.error?.message || r.status));
    all.push(...(d.rows || []));
    if (!d.rows || d.rows.length < 25000) return all;
  }
}

// The refresh token from Kate's sign-in, swapped for an hour's access token.
async function accessToken(): Promise<string> {
  const env = (k: string) => (Deno.env.get(k) || '').trim();
  if (!env('GOOGLE_REFRESH_TOKEN')) throw new Error('GOOGLE_REFRESH_TOKEN not set');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env('GOOGLE_CLIENT_ID'), client_secret: env('GOOGLE_CLIENT_SECRET'),
      refresh_token: env('GOOGLE_REFRESH_TOKEN'), grant_type: 'refresh_token',
    }),
  });
  const d = await r.json();
  if (!r.ok || !d.access_token) throw new Error('Google sign-in: ' + (d.error_description || d.error || r.status));
  return d.access_token;
}
