// Google Ads, one row per campaign per day, into google_ads_daily (Kate, 6 Oct 2026).
// Reads the Tara Rose Salon ad account (527-185-0552) with Kate's one-time sign-in
// to the TRS Marketing Reports Cloud project ("Ads and Analytics Sync" Desktop
// client): secrets GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN.
// Access level comes from that project (Explorer, 2,880 operations a day); there
// is no developer token since Google dropped it on 9 Sep 2026.
// Also, for the page's campaign detail (Kate, 6 Oct 2026), per day and campaign:
// the keywords we bid on (google_ads_keyword_daily) and the searches that got a
// click (google_ads_search_term_daily). See migrations/create_google_ads_keywords.sql.
// Body/query: { days? (default 30, back from today), from?, to?,
//               source?: 'all' | 'campaigns' | 'keywords' | 'terms' } for a backfill.
// Every run marks sync_health 'google-ads-sync', like ig-tags-sync.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CUSTOMER = '5271850552';
const API = 'https://googleads.googleapis.com/v25';

Deno.serve(async (req) => {
  const u = new URL(req.url);
  let body: any = {};
  if (req.method === 'POST') { try { body = await req.json(); } catch (_) {} }
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const now = () => new Date().toISOString();
  // Dates in Dubai, the account's time zone.
  const dubai = (ms: number) => new Date(ms + 4 * 3600e3).toISOString().slice(0, 10);
  const days = Number(u.searchParams.get('days') || body.days || 0) || 30;
  const to = String(u.searchParams.get('to') || body.to || dubai(Date.now()));
  const from = String(u.searchParams.get('from') || body.from || dubai(Date.now() - days * 864e5));
  const source = String(u.searchParams.get('source') || body.source || 'all');
  const want = (s: string) => source === 'all' || source === s;
  const when = `segments.date BETWEEN '${from}' AND '${to}'`;
  const m = (x: any) => ({
    cost: Number(x.metrics?.costMicros || 0) / 1e6,
    impressions: Number(x.metrics?.impressions || 0),
    clicks: Number(x.metrics?.clicks || 0),
    conversions: Number(x.metrics?.conversions || 0),
  });
  const save = async (table: string, rows: any[], conflict: string) => {
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await sb.from(table).upsert(rows.slice(i, i + 500), { onConflict: conflict });
      if (error) throw new Error(`${table}: ${error.message}`);
    }
    return rows.length;
  };
  // The same keyword or search can come from two ad groups of one campaign: one row.
  const sumBy = (rows: any[], key: (r: any) => string) => {
    const out: Record<string, any> = {};
    for (const r of rows) {
      const k = key(r), o = out[k];
      if (!o) { out[k] = { ...r }; continue; }
      o.cost += r.cost; o.impressions += r.impressions; o.clicks += r.clicks; o.conversions += r.conversions;
    }
    return Object.values(out);
  };

  const out: any = { from, to };
  try {
    const token = await accessToken();
    if (want('campaigns')) {
      out.saved = await save('google_ads_daily', (await gaql(token, `SELECT segments.date, campaign.id, campaign.name, campaign.status,
          campaign.advertising_channel_type, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions,
          metrics.conversions_value FROM campaign WHERE ${when}`)).map((x: any) => ({
        date: x.segments.date, campaign_id: String(x.campaign.id), campaign_name: x.campaign.name,
        status: x.campaign.status || null, channel: x.campaign.advertisingChannelType || null,
        ...m(x), conv_value: Number(x.metrics?.conversionsValue || 0), synced_at: now(),
      })), 'date,campaign_id');
    }
    if (want('keywords')) {
      const rows = (await gaql(token, `SELECT segments.date, campaign.id, ad_group_criterion.keyword.text,
          ad_group_criterion.keyword.match_type, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions
          FROM keyword_view WHERE ${when} AND metrics.impressions > 0`)).map((x: any) => ({
        date: x.segments.date, campaign_id: String(x.campaign.id),
        keyword: x.adGroupCriterion?.keyword?.text || '', match_type: x.adGroupCriterion?.keyword?.matchType || '',
        ...m(x), synced_at: now(),
      }));
      out.keywords = await save('google_ads_keyword_daily',
        sumBy(rows, r => [r.date, r.campaign_id, r.keyword, r.match_type].join('|')), 'date,campaign_id,keyword,match_type');
    }
    if (want('terms')) {
      const rows = (await gaql(token, `SELECT segments.date, campaign.id, search_term_view.search_term,
          metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions
          FROM search_term_view WHERE ${when} AND metrics.clicks > 0`)).map((x: any) => ({
        date: x.segments.date, campaign_id: String(x.campaign.id), term: x.searchTermView?.searchTerm || '',
        ...m(x), synced_at: now(),
      }));
      out.terms = await save('google_ads_search_term_daily',
        sumBy(rows, r => [r.date, r.campaign_id, r.term].join('|')), 'date,campaign_id,term');
    }
  } catch (e) {
    out.error = String((e as Error).message || e);
  }
  const mark: any = { name: 'google-ads-sync', last_run_at: now(), last_error: out.error || null };
  if (!out.error) mark.last_ok_at = mark.last_run_at;
  await sb.from('sync_health').upsert(mark, { onConflict: 'name' });
  return new Response(JSON.stringify(out), { status: out.error ? 502 : 200, headers: { 'Content-Type': 'application/json' } });
});

// Every row of one Google Ads query, following the pages.
async function gaql(token: string, query: string) {
  const all: any[] = [];
  let pageToken = '';
  do {
    const r = await fetch(`${API}/customers/${CUSTOMER}/googleAds:search`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(pageToken ? { query, pageToken } : { query }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error?.message || `Google Ads ${r.status}`);
    all.push(...(d.results || []));
    pageToken = d.nextPageToken || '';
  } while (pageToken);
  return all;
}

// The refresh token from Kate's sign-in, swapped for an hour's access token.
async function accessToken(): Promise<string> {
  const env = (k: string) => (Deno.env.get(k) || '').trim();   // a pasted secret can carry a stray space
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
