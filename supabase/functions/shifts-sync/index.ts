// Shifts sync (Kate, 18 Nov 2026). Keeps phorest_shifts (the rota behind the Service Calendar's shift hours and overtime) in step with Phorest's official API,
// GET /branch/{id}/staff/worktimetable. UAE only (Bahrain is a separate Phorest business). Same secrets and AUTH pattern as appointments-sync:
// header x-cron-secret must equal internal_secrets.appointments_sync_cron; the answer holds counts only.
// Body (all optional): { from, to, days_back, days_fwd }. Default = today - 3 days to today + 30 days. Max window 120 days. Dates are Dubai days.
// One row per staff and day: WORKING (the WORKING slot's start and end) or OFF (a slot with a typed label: RDO, HOLIDAY, SICK_DAY...). Days with nothing on the rota get no row.
// Per branch: pull, upsert stamped with this run, then delete the window's rows this run did not touch (rota changed in Phorest). A failed branch is not swept.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const BRANCHES: Record<string, string> = { AQ: '3lBkqsMGyr2ipZCvxCuZfg', KCA: 'iH0_oL3aKdXSnwOn19V0_w', MC: 'jK2EFWbtnJ_D2Fkg4Grd_w', SAA: 'oesxmNtsJYVoUCjv1Arp7g' };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const env = (...names: string[]) => { for (const n of names) { const v = Deno.env.get(n); if (v) return v; } return ''; };
const USER = env('PHOREST_UAE_USERNAME', 'PHOREST_UAE_USER', 'PHOREST_API_USER');
const PASS = env('PHOREST_UAE_PASSWORD', 'PHOREST_UAE_PASS', 'PHOREST_API_PASS');
const BID = env('PHOREST_UAE_BUSINESS_ID', 'PHOREST_BUSINESS_ID');
const BASE = `https://platform.phorest.com/third-party-api-server/api/business/${BID}`;
const AUTH = 'Basic ' + btoa(`${USER}:${PASS}`);
const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

async function api(path: string): Promise<any> {
  let last = 0;
  for (let i = 0; i < 4; i++) {
    const r = await fetch(BASE + path, { headers: { Authorization: AUTH, Accept: 'application/json' } });
    if (r.ok) return await r.json();
    last = r.status;
    if ([429, 500, 502, 503, 504].includes(r.status) && i < 3) { await sleep(1500 * (i + 1)); continue; }
    break;
  }
  throw new Error(`phorest ${last} ${path.split('?')[0]}`);
}
async function paged(path: string, key: string, size: number): Promise<any[]> {
  const out: any[] = [];
  const sep = path.includes('?') ? '&' : '?';
  for (let p = 0; ; p++) {
    const d = await api(`${path}${sep}size=${size}&page=${p}`);
    out.push(...(d._embedded?.[key] || []));
    if (p + 1 >= (d.page?.totalPages || 0)) break;
  }
  return out;
}
const dubaiToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai' }).format(new Date());
const addDays = (d: string, n: number) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

async function branch(code: string, bid: string, f: string, t: string, runIso: string) {
  const days = new Map<string, any>();   // staff|date -> row
  for (let c0 = f; c0 <= t;) {
    const c1 = addDays(c0, 13) < t ? addDays(c0, 13) : t;
    for (const w of await paged(`/branch/${bid}/staff/worktimetable?from_date=${c0}&to_date=${c1}`, 'workTimeTables', 100)) {
      for (const s of w.timeSlots || []) {
        const k = `${w.staffId}|${s.date}`;
        const working = s.type === 'WORKING' && s.startTime !== s.endTime;
        const note = String(s.custom || '').trim();
        if (working) {
          days.set(k, { branch: code, staff_id: w.staffId, date: s.date, kind: 'WORKING', start_time: String(s.startTime).slice(0, 8), end_time: String(s.endTime).slice(0, 8), note, synced_at: runIso });
        } else if (note && !days.has(k)) {
          days.set(k, { branch: code, staff_id: w.staffId, date: s.date, kind: 'OFF', start_time: null, end_time: null, note, synced_at: runIso });
        }
      }
    }
    c0 = addDays(c1, 1);
  }
  const rows = [...days.values()];
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supa.from('phorest_shifts').upsert(rows.slice(i, i + 500), { onConflict: 'branch,staff_id,date' });
    if (error) throw new Error('upsert ' + error.message.slice(0, 120));
  }
  const { error: de, count } = await supa.from('phorest_shifts').delete({ count: 'exact' }).eq('branch', code).gte('date', f).lte('date', t).lt('synced_at', runIso);
  if (de) throw new Error('sweep ' + de.message.slice(0, 120));
  return { shifts: rows.filter((r) => r.kind === 'WORKING').length, off: rows.filter((r) => r.kind === 'OFF').length, removed: count || 0 };
}

Deno.serve(async (req) => {
  const J = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 });
  const { data: sec } = await supa.from('internal_secrets').select('value').eq('name', 'appointments_sync_cron').maybeSingle();
  if (!sec?.value || req.headers.get('x-cron-secret') !== sec.value) return J({ error: 'unauthorised' }, 401);
  if (!USER || !PASS || !BID) return J({ error: 'Phorest secrets are not set on this project' }, 500);
  let b: any = {};
  try { b = await req.json(); } catch { /* no body */ }
  const today = dubaiToday();
  const f = b.from || addDays(today, -Math.max(0, Number(b.days_back ?? 3)));
  const t = b.to || addDays(today, Math.max(0, Number(b.days_fwd ?? 30)));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || !/^\d{4}-\d{2}-\d{2}$/.test(t) || t < f) return J({ error: 'bad dates' }, 400);
  if ((new Date(t).getTime() - new Date(f).getTime()) / 864e5 > 120) return J({ error: 'window too long (max 120 days)' }, 400);
  const runIso = new Date(Date.now() - 1000).toISOString();
  const out: Record<string, unknown> = {};
  await Promise.all(Object.entries(BRANCHES).map(async ([code, bid]) => {
    try { out[code] = await branch(code, bid, f, t, runIso); } catch (e) { out[code] = { error: String(e).slice(0, 160) }; }
  }));
  const failed = Object.values(out).some((v: any) => v?.error);
  return J({ window: [f, t], branches: out, ok: !failed }, failed ? 207 : 200);
});
