// Meta Ads per day (Kate, 23 Oct 2026; views, clicks and campaigns added 2 Nov 2026 for the Meta Ads page).
// Reads the ad account Metricool has connected to the main brand (act_2213880582241991, AED) with
// secret METRICOOL_USER_TOKEN (Kate's account, userId 4877991, the same one metricool-sync uses). Read only;
// nothing is written to Meta or Metricool.
//   1. /v2/analytics/timelines, network facebookads, metric spend, subject account -> meta_ads_daily, source 'metricool'.
//      Metricool has this account from 22 Apr 2026 only; Oct 2025 to Jul 2026 also comes from the Drive invoices
//      (source 'invoice', see migrations/marketing_spend.sql), and the report takes the invoice on a day that has both.
//   2. The same timelines for impressions, clicks and reach -> meta_ads_metrics_daily (migrations/meta_ads_page.sql).
//   3. /stats/facebookads/campaigns read one day at a time -> meta_ads_campaign_daily. A day is written only when the
//      campaigns add up to that day's account spend (within 3 percent or AED 1), so if Metricool ever answers with a
//      window total instead of the day, nothing wrong is stored; the days it refused come back in out.campaigns.skipped.
//      Steps 2 and 3 never stop step 1: a failure there is reported in out.extra_error and the run still counts as good.
// Body/query: { days? (default 10, back from today), from?, to? (Dubai dates) } for a backfill.
// Every run marks sync_health 'meta-ads-sync'.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const USER_ID = '4877991';
const API = 'https://app.metricool.com/api';
const TZ = 'Asia/Dubai';

Deno.serve(async (req) => {
  const u = new URL(req.url);
  let body: any = {};
  if (req.method === 'POST') { try { body = await req.json(); } catch (_) {} }
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const token = Deno.env.get('METRICOOL_USER_TOKEN') || '';
  const t0 = Date.now();
  const now = () => new Date().toISOString();
  const dubai = (ms: number) => new Date(ms + 4 * 3600e3).toISOString().slice(0, 10);
  const days = Number(u.searchParams.get('days') || body.days || 0) || 10;
  const to = String(u.searchParams.get('to') || body.to || dubai(Date.now()));
  const from = String(u.searchParams.get('from') || body.from || dubai(Date.now() - days * 864e5));

  const get = async (path: string, q: Record<string, string>) => {
    const qs = new URLSearchParams({ ...q, userId: USER_ID });
    const r = await fetch(`${API}${path}?${qs}`, { headers: { 'X-Mc-Auth': token } });
    const t = await r.text();
    if (!r.ok) throw new Error(`${path} ${q.network || ''} ${q.metric || ''}: ${r.status} ${t.slice(0, 160)}`);
    return JSON.parse(t);
  };
  // 90-day pieces for a long backfill.
  const chunks = (a: string, b: string) => {
    const out: [string, string][] = [];
    for (let s = new Date(a + 'T00:00:00Z'); s.toISOString().slice(0, 10) <= b;) {
      const e = new Date(s.getTime() + 89 * 864e5), es = e.toISOString().slice(0, 10);
      out.push([s.toISOString().slice(0, 10), es < b ? es : b]);
      s = new Date(e.getTime() + 864e5);
    }
    return out;
  };
  const upsert = async (table: string, rows: any[], onConflict: string) => {
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await sb.from(table).upsert(rows.slice(i, i + 500), { onConflict });
      if (error) throw new Error(table + ': ' + error.message);
    }
  };

  const out: any = { from, to };
  try {
    if (!token) throw new Error('no METRICOOL_USER_TOKEN secret');
    // The brand that has a Facebook Ads account connected, read each run.
    const brands = (await get('/admin/simpleProfiles', {})).filter((b: any) => b.facebookAds);
    if (!brands.length) throw new Error('no Metricool brand has a Facebook Ads account');
    out.accounts = brands.map((b: any) => b.facebookAds);
    const timeline = async (b: any, metric: string, a: string, z: string) => {
      const d = await get('/v2/analytics/timelines', { blogId: String(b.id), network: 'facebookads', metric, subject: 'account',
        from: `${a}T00:00:00+04:00`, to: `${z}T23:59:59+04:00`, timezone: TZ });
      const rows: { date: string; value: number }[] = [];
      for (const v of d.data?.[0]?.values || []) {
        const date = String(v.dateTime).slice(0, 10);
        if (date < a || date > z || v.value === null) continue;
        rows.push({ date, value: Number(v.value) || 0 });
      }
      return rows;
    };

    // 1. Spend per day.
    const rows: any[] = [];
    for (const b of brands) for (const [a, z] of chunks(from, to)) {
      for (const r of await timeline(b, 'spend', a, z)) rows.push({ date: r.date, source: 'metricool', spend: r.value, synced_at: now() });
    }
    // One row per day even if two brands share an account.
    const byDay = Object.values(Object.fromEntries(rows.map(r => [r.date, r]))) as any[];
    await upsert('meta_ads_daily', byDay, 'date,source');
    out.days = byDay.length;
    out.total = Math.round(byDay.reduce((s: number, r: any) => s + r.spend, 0) * 100) / 100;

    // 2 and 3. Views, clicks, reach and the campaigns. Never allowed to fail the spend above.
    try {
      const b = brands[0];
      const mrows: any[] = [];
      for (const metric of ['impressions', 'clicks', 'reach']) for (const [a, z] of chunks(from, to)) {
        for (const r of await timeline(b, metric, a, z)) mrows.push({ date: r.date, metric, value: r.value, synced_at: now() });
      }
      await upsert('meta_ads_metrics_daily', mrows, 'date,metric');
      out.metrics = mrows.length;

      // One day at a time, a few at once, stopping before the function's own time limit (call again with from/to to carry on).
      const spendOf: Record<string, number> = Object.fromEntries(byDay.map((r: any) => [r.date, r.spend]));
      const dayList: string[] = [];
      for (let t = new Date(from + 'T00:00:00Z'); t.toISOString().slice(0, 10) <= to; t = new Date(t.getTime() + 864e5)) dayList.push(t.toISOString().slice(0, 10));
      const camp: any = { written: 0, empty: 0, skipped: [] as any[], done_to: null };
      for (let i = 0; i < dayList.length; i += 4) {
        if (Date.now() - t0 > 110000) { camp.stopped_before = dayList[i]; break; }
        await Promise.all(dayList.slice(i, i + 4).map(async (day) => {
          const c = day.replace(/-/g, '');
          const d = await get('/stats/facebookads/campaigns', { blogId: String(b.id), start: c, end: c,
            from: `${day}T00:00:00+04:00`, to: `${day}T23:59:59+04:00`, timezone: TZ });
          const list = (Array.isArray(d) ? d : (d.data || [])).filter((x: any) => Number(x.spent) > 0 || Number(x.impressions) > 0);
          const sum = list.reduce((s: number, x: any) => s + (Number(x.spent) || 0), 0);
          const acct = spendOf[day];
          if (!list.length) { camp.empty++; return; }
          if (acct === undefined || Math.abs(sum - acct) > Math.max(1, 0.03 * acct)) { camp.skipped.push({ day, campaigns: Math.round(sum * 100) / 100, account: acct ?? null }); return; }
          await upsert('meta_ads_campaign_daily', list.map((x: any) => ({
            date: day, campaign_id: String(x.providerCampaignId || x.providerId), campaign_name: String(x.name || x.providerCampaignId),
            status: x.status || null, objective: x.objective || null, spend: Number(x.spent) || 0, impressions: Math.round(Number(x.impressions) || 0),
            clicks: Math.round(Number(x.clicks) || 0), results: Number(x.results) || 0, results_label: x.resultsLabel || null, synced_at: now() })), 'date,campaign_id');
          camp.written += list.length;
        }));
        camp.done_to = dayList[Math.min(i + 3, dayList.length - 1)];
      }
      camp.skipped = camp.skipped.slice(0, 20);
      out.campaigns = camp;
    } catch (e) {
      out.extra_error = String((e as Error).message || e);
    }
  } catch (e) {
    out.error = String((e as Error).message || e);
  }
  const mark: any = { name: 'meta-ads-sync', last_run_at: now(), last_error: out.error || null };
  if (!out.error) mark.last_ok_at = mark.last_run_at;
  await sb.from('sync_health').upsert(mark, { onConflict: 'name' });
  return new Response(JSON.stringify(out), { status: out.error ? 502 : 200, headers: { 'Content-Type': 'application/json' } });
});
