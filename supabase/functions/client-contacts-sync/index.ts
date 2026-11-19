// Client Book auto-sync (Kate, 19 Nov 2026). Keeps the Client Book current with no laptop: client contacts (mobile, email), card notes and each
// client's salon, for the UAE business and for Bahrain, straight from Phorest's official API (/client). Then runs client_contacts_reconcile(),
// the same reconcile daily-reports Step 13 runs by hand (name-keyed contacts <-> Phorest ids).
// UAE: only clients Phorest changed in the last `days` (default 1; the nightly run asks for 3). Bahrain is tiny, so every run pulls the whole list.
// Secrets: UAE login PHOREST_UAE_* and Bahrain login PHOREST_BAH_* (the same ones appointments-sync uses). The answer and the log hold counts only, never a name, number or note.
// AUTH: gateway JWT (anon key) plus header x-cron-secret equal to internal_secrets 'client_contacts_cron'.
// Body (all optional): { days, only: 'UAE'|'BAH', dry: true (count and compare, write nothing), source }.
// Visit (appointment) notes are NOT in the Phorest API; they stay on the browser pull (daily_notes_scan.py).
import { createClient } from 'jsr:@supabase/supabase-js@2';

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

// the salons a UAE client can belong to: Phorest branchId -> the labels phorest_client_branches already uses
const SALONS: Record<string, { branch: string; code: string; name: string }> = {
  'oesxmNtsJYVoUCjv1Arp7g': { branch: 'BRANCH2', code: 'SAA', name: 'Tara Rose Hair and Beauty Salon - Branch 2' },
  'iH0_oL3aKdXSnwOn19V0_w': { branch: 'SPC', code: 'KCA', name: 'Tara Rose Hair & Beauty Salon-LLC-SPC' },
  'jK2EFWbtnJ_D2Fkg4Grd_w': { branch: 'MC', code: 'MC', name: 'Motor City Tara Rose Salon LLC' },
  '3lBkqsMGyr2ipZCvxCuZfg': { branch: 'AQ', code: 'AQ', name: 'Tara Rose Ladies Salon - Al Quoz' },
  'gRWZ5rqYq9CAOKMgGM1cwQ': { branch: 'BRANCH1', code: 'MRY', name: 'Tara Rose Hair and Beauty Salon - Branch 1 (Al Bateen Street)' },
  't-uBeI_cAM4FeVdOtZPKvg': { branch: 'FRA', code: 'FRA', name: 'Tara Rose Gents Salon - Fratelli' },
};

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

// same rule as parse_new_clients.phone(): UAE numbers to +9715XXXXXXXX, anything else keeps its digits with a +; Bahrain's 8 digit mobiles get 973
function phone(s: unknown, code: string): string | null {
  const raw = String(s ?? '');
  let d = raw.replace(/\D/g, '');
  if (!d || /^\d(\.\d+)?E\+\d+$/i.test(raw)) return null;
  if (d.startsWith('00')) d = d.slice(2);
  if (code === 'BAH') { if (d.length === 8 && /^[36]/.test(d)) d = '973' + d; }
  else if (d.startsWith('0') && d.length === 10) d = '971' + d.slice(1);
  else if (d.length === 9 && d.startsWith('5')) d = '971' + d;
  return '+' + d;
}
const chunks = <T>(a: T[], n: number): T[][] => { const o: T[][] = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };

async function one(biz: Biz, code: string, sinceIso: string | null, today: string, dry: boolean) {
  const path = '/client' + (sinceIso ? `?updatedAfter=${encodeURIComponent(sinceIso)}` : '');
  const list = (await paged(biz, path, 'clients', 200)).filter((c: any) => !c.deleted && c.clientId);
  const contacts = list.map((c: any) => {
    const email = String(c.email || '').trim().toLowerCase() || null;
    const mobile = String(c.mobile || '').trim() || null;
    return {
      branch: code, phorest_id: c.clientId,
      first_name: String(c.firstName || '').trim() || null, last_name: String(c.lastName || '').trim() || null,
      mobile, mobile_norm: phone(mobile, code), email, archived: !!c.archived, pulled_at: today,
      email_status: email ? 'real' : 'no email',   // settled for real by client_contacts_reconcile() straight after
    };
  });
  const noted = list.filter((c: any) => String(c.notes || '').trim());
  const clear = list.filter((c: any) => !String(c.notes || '').trim()).map((c: any) => c.clientId as string);
  const stat: Record<string, number> = { pulled: list.length, with_card_note: noted.length };

  if (dry) {
    // compare, write nothing: how many card notes already match what the database holds
    let same = 0, differ = 0, missing = 0;
    const stored: Record<string, string> = {};
    for (const grp of chunks(noted.map((c: any) => c.clientId as string), 100)) {
      const { data } = await supa.from('phorest_client_notes').select('phorest_id, notes').eq('branch', code).in('phorest_id', grp);
      for (const d of data || []) stored[d.phorest_id] = d.notes || '';
    }
    for (const c of noted) {
      const s = stored[c.clientId];
      if (s === undefined) missing++;
      else if (s.trim() === String(c.notes).trim()) same++;
      else differ++;
    }
    let storedButEmptyNow = 0;
    for (const grp of chunks(clear, 100)) {
      const { count } = await supa.from('phorest_client_notes').select('phorest_id', { count: 'exact', head: true }).eq('branch', code).in('phorest_id', grp);
      storedButEmptyNow += count || 0;
    }
    return { ...stat, notes_same: same, notes_differ: differ, notes_not_stored: missing, stored_but_empty_in_phorest: storedButEmptyNow };
  }

  for (const grp of chunks(contacts, 500)) {
    const { error } = await supa.from('phorest_client_emails').upsert(grp, { onConflict: 'branch,phorest_id' });
    if (error) throw new Error('contacts ' + error.message.slice(0, 120));
  }
  // card notes: non-empty are kept, a note cleared in Phorest is removed (only non-empty notes are stored)
  const nrows = noted.map((c: any) => ({ branch: code, phorest_id: c.clientId, notes: String(c.notes).trim(), archived: !!c.archived, pulled_at: today }));
  for (const grp of chunks(nrows, 500)) {
    const { error } = await supa.from('phorest_client_notes').upsert(grp, { onConflict: 'branch,phorest_id' });
    if (error) throw new Error('notes ' + error.message.slice(0, 120));
  }
  let cleared = 0;
  for (const grp of chunks(clear, 100)) {
    const { error, count } = await supa.from('phorest_client_notes').delete({ count: 'exact' }).eq('branch', code).in('phorest_id', grp);
    if (error) throw new Error('clear ' + error.message.slice(0, 120));
    cleared += count || 0;
  }
  // salon of each UAE client (creating + last visited), added only when missing; Bahrain's Client Book rows use branch BAH, no salon row needed
  let added = 0;
  if (code === 'UAE') {
    const brows: any[] = [];
    for (const c of list) {
      for (const bid of new Set([c.creatingBranchId, c.lastVisitedBranchId].filter(Boolean))) {
        const s = SALONS[bid as string];
        if (s) brows.push({ phorest_id: c.clientId, phorest_branch_id: bid, phorest_branch_name: s.name, branch_code: s.code, branch: s.branch, archived: !!c.archived, pulled_at: today });
      }
    }
    for (const grp of chunks(brows, 500)) {
      const { data, error } = await supa.from('phorest_client_branches').upsert(grp, { onConflict: 'phorest_id,phorest_branch_id', ignoreDuplicates: true }).select('phorest_id');
      if (error) throw new Error('branches ' + error.message.slice(0, 120));
      added += data?.length || 0;
    }
  }
  return { ...stat, notes_written: nrows.length, notes_cleared: cleared, salon_rows_added: added };
}

Deno.serve(async (req) => {
  const J = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 });
  const { data: sec } = await supa.from('internal_secrets').select('value').eq('name', 'client_contacts_cron').maybeSingle();
  if (!sec?.value || req.headers.get('x-cron-secret') !== sec.value) return J({ error: 'unauthorised' }, 401);
  if (!UAE.ok && !BAH.ok) return J({ error: 'Phorest secrets are not set on this project', have: Object.keys(Deno.env.toObject()).filter((k) => /phorest/i.test(k)) }, 500);

  let b: any = {};
  try { b = await req.json(); } catch { /* no body */ }
  const days = Math.min(30, Math.max(1, Number(b.days ?? 1)));
  const only = String(b.only || '').toUpperCase();
  const dry = !!b.dry;
  const today = dubaiToday();
  const sinceIso = new Date(Date.now() - days * 864e5 - 15 * 60e3).toISOString().replace(/\.\d+Z$/, 'Z');   // 15 minutes of overlap
  const out: Record<string, unknown> = {};

  const jobs: Promise<void>[] = [];
  if (UAE.ok && (!only || only === 'UAE')) jobs.push((async () => { try { out.UAE = await one(UAE, 'UAE', sinceIso, today, dry); } catch (e) { out.UAE = { error: String(e).slice(0, 160) }; } })());
  if (!only || only === 'BAH') {
    if (!BAH.ok) out.BAH = { skipped: 'the Bahrain Phorest secrets are not set' };
    else jobs.push((async () => { try { out.BAH = await one(BAH, 'BAH', null, today, dry); } catch (e) { out.BAH = { error: String(e).slice(0, 160) }; } })());
  }
  await Promise.all(jobs);

  let reconcile: unknown = null, rerr = '';
  if (!dry) {
    const { data, error } = await supa.rpc('client_contacts_reconcile', { p_days: 14 });
    if (error) rerr = error.message.slice(0, 160); else reconcile = data;
  }
  const failed = Object.values(out).some((v: any) => v?.error) || !!rerr;
  if (!dry) {
    const u: any = out.UAE || {}, h: any = out.BAH || {};
    await supa.from('client_contacts_pull_log').insert({
      source: String(b.source || 'manual').slice(0, 30), days, uae_pulled: u.pulled ?? null, bah_pulled: h.pulled ?? null,
      notes_written: (u.notes_written || 0) + (h.notes_written || 0), notes_cleared: (u.notes_cleared || 0) + (h.notes_cleared || 0),
      branches_added: u.salon_rows_added ?? 0, result: { out, reconcile }, error: failed ? JSON.stringify({ out, rerr }).slice(0, 400) : null,
    });
  }
  return J({ dry, days, branches: out, reconcile, reconcile_error: rerr || undefined, ok: !failed }, failed ? 207 : 200);
});
