// Google Business Profile reviews into the dashboard (Kate, 24 Nov 2026).
// Replaces the Apps Script sync (apps-script/sync-google-reviews.gs), which was never installed.
// Cloud project trs-reviews-sync (number 956570668641), Business Profile API approved 6 Oct 2026,
// consent screen Internal, so the refresh token does not expire after 7 days.
// Secrets: GBP_CLIENT_ID, GBP_REVIEWS_SYNC (the OAuth client secret), GBP_REFRESH_TOKEN
// (issued to kate@tararosesalon.com with scope https://www.googleapis.com/auth/business.manage).
//
// Body/query: { apply?: true, only?: 'KCA' | 'SAA' | 'AQ' | 'MC' | 'BAH' }.
// Without apply it is a dry run: nothing is written, the report says what apply would do.
// With apply it UPDATES stored rows in place and ADDS reviews Google has and the table does not.
// It NEVER deletes (the Apps Script version deleted every 'seed' row, which would have wiped the
// hand labels staff_manual / staff_not / photos). Those columns are not in the write at all, so an
// update leaves them alone. A stored row Google does not have is left as it is and only counted.
//
// Matching, in three passes so exact matches claim their row before loose ones can:
//   0. same review id, or the row's url already ends in that review id (set by an earlier run);
//   1. same reviewer and stars, and the same opening words or a date within 3 days (60 if the
//      stored date is approximate);
//   2. same reviewer and stars on a row whose date is approximate (the 24 Sep 2026 snapshot only
//      knew "a year ago", so those dates can be months out); nearest date wins.
// What a matched row gets from Google: the exact date, the reply and reply date, the exact link,
// and the full comment when the stored one is empty or cut off with "...". A comment that is
// already complete is kept as it is (it may have been fixed by hand).
import { createClient } from 'jsr:@supabase/supabase-js@2';

const BRANCH_BY_LOC: Record<string, string> = {
  '5307528376474579201': 'KCA', '1607584651014081566': 'SAA', '15851980431586936756': 'AQ',
  '1197765864514331563': 'MC', '9531547727804411119': 'BAH',
};
const BRANCH_NAME: Record<string, string> = {
  KCA: 'Khalifa City A, Abu Dhabi', SAA: 'Saadiyat, Abu Dhabi', AQ: 'Al Quoz, Dubai',
  MC: 'Motor City, Dubai', BAH: 'District 2, Bahrain',
};
const STARS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
const letters = (s: any) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]/gu, '');
const opening = (s: any) => letters(s).slice(0, 40);
const dubai = (ms: number) => new Date(ms + 4 * 3600e3).toISOString().slice(0, 10);
const json = (o: any, status = 200) => new Response(JSON.stringify(o, null, 1), { status, headers: { 'Content-Type': 'application/json' } });

async function accessToken(id: string, secret: string, refresh: string): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: refresh, grant_type: 'refresh_token' }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw new Error(`token ${res.status}: ${j.error || ''} ${j.error_description || ''}`.trim());
  return j.access_token;
}

async function gget(url: string, token: string): Promise<any> {
  for (let i = 0; ; i++) {
    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    if (res.ok) return await res.json();
    if (i < 3 && (res.status === 429 || res.status >= 500)) { await new Promise(r => setTimeout(r, 1500 * (i + 1))); continue; }
    throw new Error(`Google ${res.status} on ${url.split('?')[0]}: ${(await res.text()).slice(0, 300)}`);
  }
}

Deno.serve(async (req) => {
  const u = new URL(req.url);
  let body: any = {};
  if (req.method === 'POST') { try { body = await req.json(); } catch (_) {} }
  const only = String(u.searchParams.get('only') || body.only || '').toUpperCase();
  const apply = body.apply === true || u.searchParams.get('apply') === '1';

  const id = Deno.env.get('GBP_CLIENT_ID') || '';
  const secret = Deno.env.get('GBP_REVIEWS_SYNC') || '';
  const refresh = Deno.env.get('GBP_REFRESH_TOKEN') || '';
  const missing = [['GBP_CLIENT_ID', id], ['GBP_REVIEWS_SYNC', secret], ['GBP_REFRESH_TOKEN', refresh]].filter(x => !x[1]).map(x => x[0]);
  if (missing.length) return json({ ok: false, missing_secrets: missing });

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const runAt = new Date().toISOString();
  const out: any = { ok: true, mode: apply ? 'APPLY: updates matched rows in place, adds new ones, never deletes' : 'dry run, nothing written',
    unknown_locations: [], report: {}, errors: [] };
  try {
    const token = await accessToken(id, secret, refresh);
    const accounts = (await gget('https://mybusinessaccountmanagement.googleapis.com/v1/accounts?pageSize=20', token)).accounts || [];
    for (const acc of accounts) {
      let page = '';
      do {
        const l = await gget(`https://mybusinessbusinessinformation.googleapis.com/v1/${acc.name}/locations?pageSize=100&readMask=name,title&${page ? 'pageToken=' + encodeURIComponent(page) : ''}`, token);
        for (const loc of l.locations || []) {
          const code = BRANCH_BY_LOC[String(loc.name).split('/').pop()!] || null;
          if (!code) { out.unknown_locations.push(`${loc.title} (${loc.name})`); continue; }
          if (only && code !== only) continue;
          try { out.report[code] = await syncBranch(sb, token, acc.name, loc.name, code, apply); }
          catch (e) { out.errors.push(`${code}: ${(e as Error).message || e}`); }
        }
        page = l.nextPageToken || '';
      } while (page);
    }
  } catch (e) {
    out.ok = false; out.errors.push((e as Error).message || String(e));
  }
  if (apply) {
    out.ok = out.ok && !out.errors.length;
    await sb.from('sync_health').upsert({ name: 'gbp-reviews-sync', last_run_at: runAt,
      last_ok_at: out.ok ? new Date().toISOString() : undefined, last_error: out.errors.length ? out.errors.join(' | ').slice(0, 500) : null },
      { onConflict: 'name' });
  }
  return json(out);
});

async function syncBranch(sb: any, token: string, account: string, location: string, code: string, apply: boolean) {
  const now = new Date().toISOString();
  const locId = location.split('/').pop()!;

  // Every review Google holds for this salon.
  const g: any[] = [];
  let total = 0, page = '';
  do {
    const r = await gget(`https://mybusiness.googleapis.com/v4/${account}/${location}/reviews?pageSize=50${page ? '&pageToken=' + encodeURIComponent(page) : ''}`, token);
    if (!total) total = r.totalReviewCount || 0;
    for (const v of r.reviews || []) {
      if (!STARS[v.starRating]) continue;
      g.push({ review_id: v.reviewId, stars: STARS[v.starRating], reviewer: v.reviewer?.isAnonymous ? 'Anonymous' : (v.reviewer?.displayName || 'Anonymous'),
        comment: v.comment || '', date: dubai(Date.parse(v.createTime)), created: v.createTime, updated: v.updateTime || v.createTime,
        replied: !!(v.reviewReply && v.reviewReply.comment), reply: v.reviewReply?.comment || '', reply_at: v.reviewReply?.updateTime || null });
    }
    page = r.nextPageToken || '';
  } while (page);
  // A half-failed pull must never be written.
  if (!g.length || g.length < total * 0.9) return { skipped: `Google gave ${g.length} of ${total}, not written` };

  // Every row stored for the salon.
  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('google_reviews')
      .select('review_id,reviewer,stars,comment,review_date,date_approx,replied,reply,reply_at,source,url,staff_manual,staff_not')
      .eq('branch', BRANCH_NAME[code]).range(from, from + 999);
    if (error) throw new Error('google_reviews: ' + error.message);
    rows.push(...data); if (data.length < 1000) break;
  }
  const hand = (x: any) => (x.staff_manual && x.staff_manual.length) || (x.staff_not && x.staff_not.length);

  // Matching, three passes.
  const sorted = [...g].sort((a, z) => a.date.localeCompare(z.date));
  const pair = new Map<string, any>();          // google review id -> stored row
  const taken = new Set<string>();
  const passes = { by_review_id_or_link: 0, by_reviewer_text_or_date: 0, by_reviewer_any_date: 0, by_same_words_other_name: 0 };
  const days = (x: any, v: any) => Math.abs(Date.parse(x.review_date) - Date.parse(v.date)) / 864e5;
  const claim = (v: any, row: any, k: keyof typeof passes) => { pair.set(v.review_id, row); taken.add(row.review_id); passes[k]++; };
  const byId = new Map(rows.map(x => [x.review_id, x]));
  const byLink = new Map<string, any>();
  for (const x of rows) { const m = /\/reviews\/([^/?#]+)$/.exec(x.url || ''); if (m) byLink.set(m[1], x); }
  for (const v of sorted) {
    const row = byId.get(v.review_id) || byLink.get(v.review_id);
    if (row && !taken.has(row.review_id)) claim(v, row, 'by_review_id_or_link');
  }
  for (const v of sorted) {
    if (pair.has(v.review_id)) continue;
    const who = letters(v.reviewer); if (!who) continue;
    const row = rows.filter(x => !taken.has(x.review_id) && x.stars === v.stars && letters(x.reviewer) === who &&
      ((opening(v.comment) && opening(x.comment) === opening(v.comment)) || days(x, v) <= 3 || (x.date_approx && days(x, v) <= 60)))
      .sort((a, z) => days(a, v) - days(z, v))[0];
    if (row) claim(v, row, 'by_reviewer_text_or_date');
  }
  for (const v of sorted) {
    if (pair.has(v.review_id)) continue;
    const who = letters(v.reviewer); if (!who) continue;
    const row = rows.filter(x => !taken.has(x.review_id) && x.date_approx && x.stars === v.stars && letters(x.reviewer) === who)
      .sort((a, z) => days(a, v) - days(z, v))[0];
    if (row) claim(v, row, 'by_reviewer_any_date');
  }
  // A reviewer who changed their display name since the snapshot ("Turkiya Almehairbi" is now "T M"):
  // same stars and the same first words of a real comment (20+ letters), whatever the date.
  for (const v of sorted) {
    if (pair.has(v.review_id)) continue;
    const o = opening(v.comment); if (o.length < 20) continue;
    const row = rows.filter(x => !taken.has(x.review_id) && x.stars === v.stars && opening(x.comment) === o)
      .sort((a, z) => days(a, v) - days(z, v))[0];
    if (row) claim(v, row, 'by_same_words_other_name');
  }

  // What gets written.
  const payload: any[] = [];
  const changed = { dates_made_exact: 0, comments_completed: 0, reply_text_differs: 0, replied_flag_yes_to_no: 0, replied_flag_no_to_yes: 0, links_set: 0 };
  for (const v of sorted) {
    const row = pair.get(v.review_id);
    const url = `https://business.google.com/n/${locId}/reviews/${v.review_id}`;
    if (!row) {
      payload.push({ review_id: v.review_id, branch: BRANCH_NAME[code], location, stars: v.stars, reviewer: v.reviewer, comment: v.comment,
        review_date: v.date, date_approx: false, replied: v.replied, reply: v.reply, reply_at: v.reply_at, url, source: 'api',
        created_at: v.created, updated_at: v.updated, synced_at: now });
      continue;
    }
    let comment = row.comment || '';
    const cut = /(…|\.\.\.)\s*$/.test(comment);
    if ((!comment && v.comment) || (cut && v.comment.length > comment.length && letters(v.comment).startsWith(letters(comment).slice(0, 30)))) {
      comment = v.comment; changed.comments_completed++;
    }
    if (row.review_date !== v.date || row.date_approx) changed.dates_made_exact++;
    if (row.replied && !v.replied) changed.replied_flag_yes_to_no++;
    if (!row.replied && v.replied) changed.replied_flag_no_to_yes++;
    if (letters(row.reply) !== letters(v.reply)) changed.reply_text_differs++;
    if (row.url !== url) changed.links_set++;
    payload.push({ review_id: row.review_id, branch: BRANCH_NAME[code], location, stars: row.stars, reviewer: row.reviewer, comment,
      review_date: v.date, date_approx: false, replied: v.replied, reply: v.reply, reply_at: v.reply_at, url, source: row.source,
      created_at: v.created, updated_at: v.updated, synced_at: now });
  }
  const added = payload.filter(p => !pair.has(p.review_id) && !byId.has(p.review_id));

  if (apply) {
    // Upsert on review_id: an existing row only gets the columns above, so staff_manual, staff_not,
    // photos and gbp_name are never touched.
    for (let i = 0; i < payload.length; i += 200) {
      const { error } = await sb.from('google_reviews').upsert(payload.slice(i, i + 200), { onConflict: 'review_id' });
      if (error) throw new Error('google_reviews write: ' + error.message);
    }
  }

  const left = rows.filter(x => !taken.has(x.review_id));
  const short = (x: any) => `${x.date || x.review_date} ${x.stars}* ${x.reviewer}`;
  return {
    google_pulled: g.length, google_says_total: total, stored_before: rows.length,
    matched: pair.size, ...passes, ...changed,
    rows_written: apply ? payload.length : 0, rows_that_would_be_written: payload.length,
    added_new: added.length, added_sample: added.slice(-6).map(short),
    google_unreplied: g.filter(x => !x.replied).length,
    stored_google_does_not_have: left.length, of_which_hand_labelled: left.filter(hand).length, not_found_sample: left.slice(0, 6).map(short),
  };
}
