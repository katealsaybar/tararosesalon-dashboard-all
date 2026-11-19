// Appointments sync (Kate, 17 Nov 2026). Keeps phorest_appointments (the rows behind the Service Calendar page, hub/servicecal.html) in step with Phorest
// through the day, with no laptop: Phorest's official API (/branch/{id}/appointment, /staff, /client-batch), the same calls as "phorest data export/appointments/
// sync_appointments.py" in the cowork repo, which stays as the manual and backfill route.
// The four UAE salons use the UAE Phorest login; Bahrain (code BAH, opened 9 Aug 2026) is a separate Phorest business with its own login, added 19 Nov 2026
// (secrets PHOREST_BAH_USERNAME, PHOREST_BAH_PASSWORD, PHOREST_BAH_BUSINESS_ID; the shorter _USER / _PASS are also read). Its one salon is found from /branch.
// A day is a Dubai day for the window; Phorest's start and end times are each salon's own clock. Body { only: "BAH" } runs one business (backfill).
// Body (all optional): { from, to, days_back, days_fwd }. Default window = today - 1 day to today + 3 days (the frequent run). The nightly run asks for
// days_back 3, days_fwd 115: far enough ahead to see a rebooking made on the day of a visit (booked_at, the appointment's createdAt; Rebooked in the KPI doc). Dates are Dubai days.
// For each branch: pull the window, upsert every appointment stamped with this run's time, then delete the rows in the window that this run did not touch
// (moved, cancelled or deleted in Phorest). A branch that failed part-way is NOT swept, so a Phorest hiccup never empties the calendar.
// The client is kept as first name + last initial only. The price Phorest holds on the booking is stored from 19 Nov 2026 (price column). The answer holds counts only, never a name.
// Cron: every 15 minutes between 08:00 and 23:59 Dubai (jobname appointments-sync), and a nightly wide pass (appointments-sync-nightly).
// Secrets (already on the project): PHOREST_UAE_USERNAME, PHOREST_UAE_PASSWORD, PHOREST_UAE_BUSINESS_ID (the shorter _USER / _PASS and the older PHOREST_API_* names are also read).
// AUTH: the gateway needs a valid JWT, and the header x-cron-secret must equal the value in table internal_secrets (name appointments_sync_cron, service
// role only), the same pattern as complaint-tag-sync. The public anon key alone is refused (401).
import { createClient } from 'jsr:@supabase/supabase-js@2';

const UAE_BRANCHES: Record<string, string> = {
  AQ: '3lBkqsMGyr2ipZCvxCuZfg',
  KCA: 'iH0_oL3aKdXSnwOn19V0_w',
  MC: 'jK2EFWbtnJ_D2Fkg4Grd_w',
  SAA: 'oesxmNtsJYVoUCjv1Arp7g',
};
const MAKEUP = /\bowed\b|make[\s-]*up/i;   // the label the team types on a blocked-off make up block (Owed Hrs, Owed Hours); whole word, so "borrowed" does not count
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const env = (...names: string[]) => { for (const n of names) { const v = Deno.env.get(n); if (v) return v; } return ''; };
type Biz = { key: string; base: string; auth: string; ok: boolean };
const mk = (key: string, user: string, pass: string, bid: string): Biz => ({
  key, ok: !!(user && pass && bid),
  base: `https://platform.phorest.com/third-party-api-server/api/business/${bid}`,
  auth: 'Basic ' + btoa(`${user}:${pass}`),
});
const UAE = mk('UAE', env('PHOREST_UAE_USERNAME', 'PHOREST_UAE_USER', 'PHOREST_API_USER'), env('PHOREST_UAE_PASSWORD', 'PHOREST_UAE_PASS', 'PHOREST_API_PASS'), env('PHOREST_UAE_BUSINESS_ID', 'PHOREST_BUSINESS_ID'));
const BAH = mk('BAH', env('PHOREST_BAH_USERNAME', 'PHOREST_BAH_USER'), env('PHOREST_BAH_PASSWORD', 'PHOREST_BAH_PASS'), env('PHOREST_BAH_BUSINESS_ID'));

const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

async function api(biz: Biz, path: string): Promise<any> {
  let last = 0;
  for (let i = 0; i < 4; i++) {
    const r = await fetch(biz.base + path, { headers: { Authorization: biz.auth, Accept: 'application/json' } });
    if (r.ok) return await r.json();
    last = r.status;
    if ([429, 500, 502, 503, 504].includes(r.status) && i < 3) { await sleep(1500 * (i + 1)); continue; }
    break;
  }
  throw new Error(`phorest ${last} ${path.split('?')[0]}`);
}
async function paged(biz: Biz, path: string, key: string, size: number): Promise<any[]> {
  const out: any[] = [];
  const sep = path.includes('?') ? '&' : '?';
  for (let p = 0; ; p++) {
    const d = await api(biz, `${path}${sep}size=${size}&page=${p}`);
    out.push(...(d._embedded?.[key] || []));
    if (p + 1 >= (d.page?.totalPages || 0)) break;
  }
  return out;
}
const dubaiToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai' }).format(new Date());
const addDays = (d: string, n: number) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const shortName = (c: any) => {
  const fn = String(c.firstName || '').trim().toLowerCase().replace(/(^|\s|-)\S/g, (m: string) => m.toUpperCase());
  const ln = String(c.lastName || '').trim();
  return (fn + (ln ? ' ' + ln[0].toUpperCase() + '.' : '')).trim();
};

async function branch(biz: Biz, code: string, bid: string, f: string, t: string, runIso: string) {
  const staff: Record<string, string> = {};
  for (const s of await paged(biz, `/branch/${bid}/staff`, 'staffs', 200)) staff[s.staffId] = `${s.firstName || ''} ${s.lastName || ''}`.trim();
  const rows: any[] = [];
  for (let c0 = f; c0 <= t;) {
    const c1 = addDays(c0, 13) < t ? addDays(c0, 13) : t;
    for (const x of await paged(biz, `/branch/${bid}/appointment?from_date=${c0}&to_date=${c1}`, 'appointments', 100)) {
      if (x.deleted || !x.startTime || !x.endTime) continue;
      rows.push({
        branch: code, appt_id: x.appointmentId, date: x.appointmentDate, start_time: String(x.startTime).slice(0, 8), end_time: String(x.endTime).slice(0, 8),
        staff_id: x.staffId || null, staff_name: staff[x.staffId] || 'Former staff', service: String(x.serviceName || '').trim(), state: x.state || '',
        staff_request: !!x.staffRequest, client_id: x.clientId || null, client_name: '', booked_at: x.createdAt || null, synced_at: runIso,
        price: x.price == null || x.price === '' ? null : Number(x.price),   // 19 Nov 2026: the price Phorest holds on the booking (AED); needs migrations/service_calendar_price.sql applied first
      });
    }
    c0 = addDays(c1, 1);
  }
  // client names: reuse what the table already has, ask Phorest only for new client ids
  const ids = [...new Set(rows.map((r) => r.client_id).filter(Boolean))] as string[];
  const names: Record<string, string> = {};
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supa.from('phorest_appointments').select('client_id, client_name').in('client_id', ids.slice(i, i + 200)).neq('client_name', '');
    for (const d of data || []) names[d.client_id] = d.client_name;
  }
  const need = ids.filter((i) => !names[i]);
  for (let i = 0; i < need.length; i += 100) {
    const grp = need.slice(i, i + 100);
    const d = await api(biz, '/client-batch?' + grp.map((x) => `client_id=${encodeURIComponent(x)}`).join('&'));
    for (const c of d._embedded?.clients || []) names[c.clientId] = shortName(c);
  }
  for (const r of rows) r.client_name = (r.client_id && names[r.client_id]) || '';
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supa.from('phorest_appointments').upsert(rows.slice(i, i + 500), { onConflict: 'branch,appt_id' });
    if (error) throw new Error('upsert ' + error.message.slice(0, 120));
  }
  // Make up hours (19 Nov 2026): the team blocks the time off in the Phorest calendar as "Owed Hrs". Those blocks come from /break and are kept in phorest_makeup_blocks.
  // Its own try, so a problem here never stops the appointments from syncing.
  let mkRes: any = {};
  try {
    const blocks: any[] = [];
    for (let c0 = f; c0 <= t;) {
      const c1 = addDays(c0, 13) < t ? addDays(c0, 13) : t;
      for (const x of await paged(biz, `/branch/${bid}/break?from_date=${c0}&to_date=${c1}`, 'breaks', 200)) {
        if (!x.breakDate || !x.startTime || !x.endTime || !MAKEUP.test(String(x.label || ''))) continue;
        blocks.push({ branch: code, break_id: x.breakId, staff_id: x.staffId || null, date: x.breakDate, start_time: String(x.startTime).slice(0, 8), end_time: String(x.endTime).slice(0, 8), label: String(x.label).trim(), synced_at: runIso });
      }
      c0 = addDays(c1, 1);
    }
    for (let i = 0; i < blocks.length; i += 500) {
      const { error } = await supa.from('phorest_makeup_blocks').upsert(blocks.slice(i, i + 500), { onConflict: 'branch,break_id' });
      if (error) throw new Error('upsert blocks ' + error.message.slice(0, 100));
    }
    const { error: be } = await supa.from('phorest_makeup_blocks').delete().eq('branch', code).gte('date', f).lte('date', t).lt('synced_at', runIso);
    if (be) throw new Error('sweep blocks ' + be.message.slice(0, 100));
    mkRes = { found: blocks.length };
  } catch (e) { mkRes = { error: String(e).slice(0, 140) }; }
  // sweep: only after every page of this branch was read and written
  const { error: de, count } = await supa.from('phorest_appointments').delete({ count: 'exact' })
    .eq('branch', code).gte('date', f).lte('date', t).lt('synced_at', runIso);
  if (de) throw new Error('sweep ' + de.message.slice(0, 120));
  return { appointments: rows.length, clients_asked: need.length, removed: count || 0, makeup: mkRes };
}

Deno.serve(async (req) => {
  const J = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 });
  const { data: sec } = await supa.from('internal_secrets').select('value').eq('name', 'appointments_sync_cron').maybeSingle();
  if (!sec?.value || req.headers.get('x-cron-secret') !== sec.value) return J({ error: 'unauthorised' }, 401);
  if (!UAE.ok && !BAH.ok) return J({ error: 'Phorest secrets are not set on this project', have: Object.keys(Deno.env.toObject()).filter((k) => /phorest/i.test(k)) }, 500);   // names only, never values

  let b: any = {};
  try { b = await req.json(); } catch { /* no body */ }
  const today = dubaiToday();
  const f = b.from || addDays(today, -Math.max(0, Number(b.days_back ?? 1)));
  const t = b.to || addDays(today, Math.max(0, Number(b.days_fwd ?? 3)));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || !/^\d{4}-\d{2}-\d{2}$/.test(t) || t < f) return J({ error: 'bad dates' }, 400);
  if ((new Date(t).getTime() - new Date(f).getTime()) / 864e5 > 120) return J({ error: 'window too long (max 120 days)' }, 400);

  const runIso = new Date(Date.now() - 1000).toISOString();   // one second back so this run's rows are never swept by their own stamp
  const out: Record<string, unknown> = {};
  const only = String(b.only || '').toUpperCase();
  const jobs: Promise<void>[] = [];
  if (UAE.ok && (!only || only === 'UAE')) {
    for (const [code, bid] of Object.entries(UAE_BRANCHES)) {
      jobs.push((async () => { try { out[code] = await branch(UAE, code, bid, f, t, runIso); } catch (e) { out[code] = { error: String(e).slice(0, 160) }; } })());
    }
  }
  if (!only || only === 'BAH') {
    if (!BAH.ok) out.BAH = { skipped: 'the Bahrain Phorest secrets are not set' };
    else jobs.push((async () => {
      try {
        const brs = await paged(BAH, '/branch', 'branches', 50);
        const one = brs.find((x: any) => /bahrain/i.test(String(x.name || ''))) || (brs.length === 1 ? brs[0] : null);
        if (!one) throw new Error('no single Bahrain branch in /branch (' + brs.length + ' branches)');
        out.BAH = await branch(BAH, 'BAH', one.branchId, f, t, runIso);
      } catch (e) { out.BAH = { error: String(e).slice(0, 160) }; }
    })());
  }
  await Promise.all(jobs);
  const failed = Object.values(out).some((v: any) => v?.error);
  return J({ window: [f, t], branches: out, ok: !failed }, failed ? 207 : 200);
});
