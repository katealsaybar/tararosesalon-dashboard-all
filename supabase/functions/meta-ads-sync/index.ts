// Meta Ads spend per day into meta_ads_daily, source 'metricool' (Kate, 23 Oct 2026).
// Reads the ad account Metricool has connected to the main brand (act_2213880582241991, AED) with
// secret METRICOOL_USER_TOKEN (Kate's account, userId 4877991, the same one metricool-sync uses):
// /v2/analytics/timelines, network facebookads, metric spend, subject account. Read only; nothing is
// written to Meta or Metricool. Metricool has this account from 22 Apr 2026 only; Oct 2025 to Jul 2026
// also comes from the Drive invoices (source 'invoice', see migrations/marketing_spend.sql), and the
// report takes the invoice on a day that has both.
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

  const out: any = { from, to };
  try {
    if (!token) throw new Error('no METRICOOL_USER_TOKEN secret');
    // The brand that has a Facebook Ads account connected, read each run.
    const brands = (await get('/admin/simpleProfiles', {})).filter((b: any) => b.facebookAds);
    if (!brands.length) throw new Error('no Metricool brand has a Facebook Ads account');
    out.accounts = brands.map((b: any) => b.facebookAds);
    const rows: any[] = [];
    for (const b of brands) for (const [a, z] of chunks(from, to)) {
      const d = await get('/v2/analytics/timelines', { blogId: String(b.id), network: 'facebookads', metric: 'spend', subject: 'account',
        from: `${a}T00:00:00+04:00`, to: `${z}T23:59:59+04:00`, timezone: TZ });
      for (const v of d.data?.[0]?.values || []) {
        const date = String(v.dateTime).slice(0, 10);
        if (date < a || date > z || v.value === null) continue;
        rows.push({ date, source: 'metricool', spend: Number(v.value) || 0, synced_at: now() });
      }
    }
    // One row per day even if two brands share an account.
    const byDay = Object.values(Object.fromEntries(rows.map(r => [r.date, r])));
    for (let i = 0; i < byDay.length; i += 500) {
      const { error } = await sb.from('meta_ads_daily').upsert(byDay.slice(i, i + 500), { onConflict: 'date,source' });
      if (error) throw new Error('meta_ads_daily: ' + error.message);
    }
    out.days = byDay.length;
    out.total = Math.round(byDay.reduce((s: number, r: any) => s + r.spend, 0) * 100) / 100;
  } catch (e) {
    out.error = String((e as Error).message || e);
  }
  const mark: any = { name: 'meta-ads-sync', last_run_at: now(), last_error: out.error || null };
  if (!out.error) mark.last_ok_at = mark.last_run_at;
  await sb.from('sync_health').upsert(mark, { onConflict: 'name' });
  return new Response(JSON.stringify(out), { status: out.error ? 502 : 200, headers: { 'Content-Type': 'application/json' } });
});
