/**
 * STANDALONE script. Do NOT paste this into any branch spreadsheet's Apps Script.
 * Pulls every Google review for every Business Profile location Kate owns (the four
 * UAE branches + Bahrain) into google_reviews on the dashboard's Supabase, which the
 * Google Reviews add-on (add ons/google-reviews/) reads. Built 24 Sep 2026 to replace
 * the one-off data.js snapshot the add-on shipped with.
 *
 * ONE-TIME SETUP (run everything signed in as the Google account that OWNS the
 * Business Profiles, the same account for the Cloud project and the script):
 *
 *   1. console.cloud.google.com → New project, e.g. "TRS Reviews Sync". Note its
 *      Project NUMBER (Dashboard → Project info).
 *   2. Ask Google for API access: the "Business Profile APIs" access request form
 *      (developers.google.com/my-business/content/prereqs → Request access). Give it
 *      that project number. Wait for the approval email (usually a few days). Until
 *      it lands, every API call below returns 403 / quota 0, which is expected.
 *   3. After approval, in that project → APIs & Services → Library, enable all three:
 *        - My Business Account Management API
 *        - My Business Business Information API
 *        - Google My Business API            (the v4 one, it holds reviews)
 *   4. APIs & Services → OAuth consent screen: Internal if the account is Workspace,
 *      otherwise External + add the owner account as a Test user.
 *   5. script.google.com/create → paste this whole file.
 *      Project Settings (gear) → tick "Show appsscript.json" → paste the manifest from
 *      apps-script/sync-google-reviews.appsscript.json over it.
 *      Same page → Google Cloud Platform project → Change project → the project NUMBER.
 *   6. Project Settings → Script Properties → add GR_SERVICE_KEY = the dashboard
 *      Supabase's service_role (secret) key, from
 *      supabase.com/dashboard/project/gvijxenafoowajqktqvd → Settings → API Keys.
 *      NEVER put that key in this file, it bypasses RLS and this file lives in git.
 *   7. Run listMyLocations() once: approve the permissions, check the log shows all
 *      five locations each mapped to a branch.
 *   8. Run syncGoogleReviews() once, check the log.
 *   9. Run setupReviewsTrigger() once: installs 07:00 and 19:00 Asia/Dubai daily runs.
 *
 * WHAT A RUN DOES
 *   Full pull every time, not incremental: ~2,500 reviews is ~50 API pages, well
 *   inside quota, and a full pull is the only way to catch a reply posted on an old
 *   review or a review the client deleted. Per location:
 *     - upserts every review (replied / reply text refresh every run);
 *     - deletes that location's API rows the run didn't see (deleted on Google);
 *     - deletes that branch's source='seed' rows from the 24 Sep snapshot, since the
 *       API rows now cover them with exact dates.
 *   Deletes only happen after the location's pages all came back, and are skipped
 *   (logged) if the pull returned under 80% of what the table already holds for that
 *   branch, so a half-failed API response can never empty a branch.
 */

const GR_SUPA_URL = 'https://gvijxenafoowajqktqvd.supabase.co';
function grKey_() {
  const key = PropertiesService.getScriptProperties().getProperty('GR_SERVICE_KEY');
  if (!key) throw new Error('Script Properties is missing GR_SERVICE_KEY, see the header comment.');
  return key;
}

// Location title + address → the add-on's branch label. First match wins.
const GR_BRANCHES = [
  [/khalifa/i,                 'Khalifa City A, Abu Dhabi'],
  [/saadiyat|mamsha/i,         'Saadiyat, Abu Dhabi'],
  [/quoz/i,                    'Al Quoz, Dubai'],
  [/motor\s*city/i,            'Motor City, Dubai'],
  [/bahrain|district\s*2/i,    'District 2, Bahrain'],
];
const GR_STARS = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
const GR_SAFETY_RATIO = 0.8;

function gbpGet_(url) {
  const res = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) {
    throw new Error('Google API ' + res.getResponseCode() + ' on ' + url + '\n' + res.getContentText().slice(0, 500));
  }
  return JSON.parse(res.getContentText());
}

function supa_(method, path, body, prefer) {
  const key = grKey_();
  const opt = {
    method: method,
    headers: { apikey: key, Authorization: 'Bearer ' + key, Prefer: prefer || 'return=minimal' },
    contentType: 'application/json',
    muteHttpExceptions: true,
  };
  if (body) opt.payload = JSON.stringify(body);
  const res = UrlFetchApp.fetch(GR_SUPA_URL + '/rest/v1/' + path, opt);
  if (res.getResponseCode() >= 300) {
    throw new Error('Supabase ' + res.getResponseCode() + ' on ' + method + ' ' + path + '\n' + res.getContentText().slice(0, 500));
  }
  return res;
}

/** Every location across every account, each tagged with its branch (or null). */
function allLocations_() {
  const out = [];
  let accToken = '';
  do {
    const a = gbpGet_('https://mybusinessaccountmanagement.googleapis.com/v1/accounts?pageSize=20' + (accToken ? '&pageToken=' + accToken : ''));
    (a.accounts || []).forEach(acc => {
      let locToken = '';
      do {
        const l = gbpGet_('https://mybusinessbusinessinformation.googleapis.com/v1/' + acc.name +
          '/locations?pageSize=100&readMask=name,title,storefrontAddress' + (locToken ? '&pageToken=' + locToken : ''));
        (l.locations || []).forEach(loc => {
          const addr = loc.storefrontAddress || {};
          const hay = [loc.title, addr.locality, addr.administrativeArea, (addr.addressLines || []).join(' '), addr.regionCode].join(' ');
          const hit = GR_BRANCHES.find(([re]) => re.test(hay));
          out.push({ account: acc.name, name: loc.name, title: loc.title, hay: hay, branch: hit ? hit[1] : null });
        });
        locToken = l.nextPageToken || '';
      } while (locToken);
    });
    accToken = a.nextPageToken || '';
  } while (accToken);
  return out;
}

/** Step 7 of setup: check the mapping before the first real sync. */
function listMyLocations() {
  allLocations_().forEach(l => Logger.log((l.branch || '!! NO BRANCH MATCH') + '  ←  ' + l.title + '  |  ' + l.name + '  |  ' + l.hay));
}

function fetchReviews_(loc) {
  const locId = loc.name.split('/').pop();
  const base = 'https://mybusiness.googleapis.com/v4/' + loc.account + '/' + loc.name + '/reviews?pageSize=50';
  const rows = [];
  let token = '', total = null;
  do {
    const r = gbpGet_(base + (token ? '&pageToken=' + encodeURIComponent(token) : ''));
    if (total === null) total = r.totalReviewCount || 0;
    (r.reviews || []).forEach(v => {
      const reply = v.reviewReply || null;
      rows.push({
        review_id: v.reviewId,
        branch: loc.branch,
        location: loc.name,
        stars: GR_STARS[v.starRating] || null,
        reviewer: (v.reviewer && !v.reviewer.isAnonymous) ? v.reviewer.displayName : 'Anonymous',
        comment: v.comment || '',
        review_date: Utilities.formatDate(new Date(v.createTime), 'Asia/Dubai', 'yyyy-MM-dd'),
        date_approx: false,
        when_text: null,
        replied: !!(reply && reply.comment),
        reply: reply ? (reply.comment || '') : '',
        reply_at: reply ? (reply.updateTime || null) : null,
        url: 'https://business.google.com/n/' + locId + '/reviews',
        source: 'api',
        created_at: v.createTime,
        updated_at: v.updateTime || v.createTime,
      });
    });
    token = r.nextPageToken || '';
  } while (token);
  return { rows: rows.filter(x => x.stars), total: total };
}

/** Entry point for the trigger. */
function syncGoogleReviews() {
  const runStart = new Date().toISOString();
  const locs = allLocations_();
  const summary = [];
  locs.forEach(loc => {
    if (!loc.branch) { summary.push('SKIPPED, no branch match: ' + loc.title); return; }
    const got = fetchReviews_(loc);
    // How many rows the table holds for this branch BEFORE the upsert, since afterwards
    // every review still on Google carries this run's synced_at.
    const cnt = supa_('get', 'google_reviews?select=review_id&limit=1&branch=eq.' + encodeURIComponent(loc.branch), null, 'count=exact');
    const h = cnt.getHeaders();
    const before = Number(String(h['Content-Range'] || h['content-range'] || '*/0').split('/')[1]) || 0;
    got.rows.forEach(r => r.synced_at = runStart);
    for (let i = 0; i < got.rows.length; i += 500) {
      supa_('post', 'google_reviews?on_conflict=review_id', got.rows.slice(i, i + 500), 'resolution=merge-duplicates,return=minimal');
    }
    const unreplied = got.rows.filter(r => !r.replied).length;
    let line = loc.branch + ': ' + got.rows.length + ' pulled (Google says ' + got.total + '), ' + unreplied + ' unreplied';
    if (before && got.rows.length < before * GR_SAFETY_RATIO) {
      line += '. !! Deletes SKIPPED: pulled far fewer than the ' + before + ' rows already stored, check before trusting this run.';
    } else {
      supa_('delete', 'google_reviews?location=eq.' + encodeURIComponent(loc.name) + '&source=eq.api&synced_at=lt.' + encodeURIComponent(runStart));
      supa_('delete', 'google_reviews?branch=eq.' + encodeURIComponent(loc.branch) + '&source=eq.seed');
    }
    summary.push(line);
  });
  Logger.log(summary.join('\n'));
}

function setupReviewsTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'syncGoogleReviews')
    .forEach(t => ScriptApp.deleteTrigger(t));
  [7, 19].forEach(h => ScriptApp.newTrigger('syncGoogleReviews').timeBased().atHour(h).everyDays(1).inTimezone('Asia/Dubai').create());
  Logger.log('Installed syncGoogleReviews at 07:00 and 19:00 Asia/Dubai.');
}
