// Recruitment Replies, read through the Gmail API instead of Apps Script (Kate, 25 Nov 2026: "i dont wanna do aps script bc of limited api calls, we have api naman na for google").
// Every 5 minutes (pg_cron job recruit-mail-sync, migrations/recruit_mail_sync_cron.sql) this reads the recruitment@ mailbox through the Gmail API (read only) and tells the Replies lane
// two things, through public.recruit_tickets_import (migrations/recruit_tickets_25nov.sql):
//   reply        a message from someone else that answers something we sent (we had already written in that thread), or answers the automatic "We've received your application" email.
//                Only the first lines of what they wrote are kept (400 characters, quoted text and signatures cut), never an attachment.
//   human_reply  a message WE sent from this mailbox by hand: whatever was waiting before it is answered.
// It never sends, labels, moves or deletes mail (scope gmail.readonly), never creates a person (the database ignores an address that is not an applicant), and never touches the stage.
// The Apps Script reader (apps-script/sync-recruitment-mailbox.gs) is unchanged and keeps doing applications, replies for the "Replied" pill, bounces and CV files; this function does only tickets.
//
// Secrets: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (the same Internal "Ads and Analytics Sync" client that website-sync and google-ads-sync use, so the token does not expire after 7 days)
// and RECRUIT_GMAIL_REFRESH_TOKEN (a one-time sign-in AS recruitment@ with scope gmail.readonly: scripts/get-recruitment-gmail-token.py). Until that secret exists the function answers
// { ok: false, error: 'not set up' } and does nothing. The Gmail API must be switched on in that Cloud project (APIs and services, Gmail API, Enable).
//
// Body/query: { hours? (how far back to look; default is the time since the last good run plus an hour, between 6 and 96), dry? (true: read and count, write nothing), box? (a different mailbox address, tests only) }.
// Every run marks sync_health 'recruit-mail-sync'. A message already seen is never turned into a second ticket (one ticket per Gmail message id), so overlapping runs are safe.
//
// Deploy: supabase functions deploy recruit-mail-sync --project-ref gvijxenafoowajqktqvd   (verify JWT stays on: the cron sends the same bearer as the other syncs)
import { createClient } from 'jsr:@supabase/supabase-js@2';

const OWN_DOMAIN = '@tararosesalon.com';
const SYSTEM = /mailer-daemon|postmaster|noreply|no-reply|donotreply|mohre\.gov|canva\.com|google\.com|brevosend|notification/i;
const MAX_THREADS = 200;
const J = { 'Content-Type': 'application/json' };

Deno.serve(async (req) => {
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  let body: any = {};
  try { body = await req.json(); } catch { /* a plain call */ }
  const url = new URL(req.url);
  const dry = body.dry === true || url.searchParams.get('dry') === '1';
  const env = (k: string) => (Deno.env.get(k) || '').trim();
  if (!env('RECRUIT_GMAIL_REFRESH_TOKEN')) return new Response(JSON.stringify({ ok: false, error: 'not set up: the secret RECRUIT_GMAIL_REFRESH_TOKEN is missing' }), { status: 200, headers: J });

  const out: any = { ok: true, dry };
  try {
    const box = String(body.box || 'recruitment@tararosesalon.com').toLowerCase();
    const token = await accessToken();
    // who is signed in must be the recruitment mailbox, never a personal inbox
    const prof = await gget('https://gmail.googleapis.com/gmail/v1/users/me/profile', token);
    if (String(prof.emailAddress || '').toLowerCase() !== box) throw new Error('The stored sign-in is not ' + box + ' (it is ' + String(prof.emailAddress || 'unknown') + '). Nothing was read.');

    const { data: hl } = await sb.from('sync_health').select('last_ok_at').eq('name', 'recruit-mail-sync').maybeSingle();
    const since = hl?.last_ok_at ? (Date.now() - new Date(hl.last_ok_at).getTime()) / 3600000 + 1 : 24;
    const hours = Math.max(6, Math.min(96, Number(body.hours) || since));
    const after = Math.floor((Date.now() - hours * 3600000) / 1000);
    out.hours = Math.round(hours * 10) / 10;

    const ids: string[] = [];
    let page = '';
    do {
      const l = await gget('https://gmail.googleapis.com/gmail/v1/users/me/threads?maxResults=100&q=' + encodeURIComponent('(in:inbox OR in:sent) after:' + after) + (page ? '&pageToken=' + encodeURIComponent(page) : ''), token);
      (l.threads || []).forEach((t: any) => ids.push(t.id));
      page = l.nextPageToken || '';
    } while (page && ids.length < MAX_THREADS);
    out.threads = ids.length;

    const rows: any[] = [], cutoff = after * 1000;
    for (const id of ids) {
      const t = await gget('https://gmail.googleapis.com/gmail/v1/users/me/threads/' + id + '?format=full', token);
      const msgs: any[] = (t.messages || []).slice().sort((a: any, b: any) => Number(a.internalDate) - Number(b.internalDate));
      const ours = (m: any) => { const f = addr(hdr(m, 'From')); return f === box || (f.indexOf(OWN_DOMAIN) > 0 && hdr(m, 'To').toLowerCase().indexOf(OWN_DOMAIN) < 0); };
      const firstOurs = msgs.filter(ours).map((m) => Number(m.internalDate))[0] || 0;
      for (const m of msgs) {
        const at = Number(m.internalDate);
        if (at < cutoff) continue;
        const subject = hdr(m, 'Subject');
        if (ours(m)) {
          if (/^(we.ve received your application|new application:)/i.test(subject)) continue;      // the automatic email and the form copy to ourselves are not a person writing
          const to = addr(hdr(m, 'To'));
          if (!to || to.indexOf(OWN_DOMAIN) > 0) continue;
          rows.push({ kind: 'human_reply', email: to, at: new Date(at).toISOString(), msg_id: m.id });
          continue;
        }
        const from = addr(hdr(m, 'From'));
        if (!from || SYSTEM.test(from) || from.indexOf(OWN_DOMAIN) > 0) continue;
        const answersAuto = /^(re|fw|fwd):\s*we.ve received your application/i.test(subject);
        if (!(answersAuto || (firstOurs && at > firstOurs))) continue;
        rows.push({ kind: 'reply', email: from, at: new Date(at).toISOString(), msg_id: m.id, subject: subject.slice(0, 150), snippet: snippet(bodyText(m.payload)) });
      }
    }
    out.rows = rows.length;
    out.replies = rows.filter((r) => r.kind === 'reply').length;
    out.hand_sent = rows.length - out.replies;

    if (rows.length) {
      const { data: pass } = await sb.from('push_passes').select('token').eq('active', true).ilike('label', 'Recruitment mailbox%').limit(1).maybeSingle();
      if (!pass?.token) throw new Error('No active push pass labelled Recruitment mailbox');
      out.opened = 0; out.closed_by_mail = 0; out.unmatched = 0;
      for (let i = 0; i < rows.length; i += 200) {
        const { data, error } = await sb.rpc('recruit_tickets_import', { p_pass: pass.token, p_rows: rows.slice(i, i + 200), p_dry: dry });
        if (error) throw new Error('recruit_tickets_import: ' + error.message);
        out.opened += data?.opened || 0; out.closed_by_mail += data?.closed_by_mail || 0; out.unmatched += data?.unmatched || 0;
      }
    }
  } catch (e) {
    out.ok = false; out.error = String((e as Error).message || e);
  }
  const mark: any = { name: 'recruit-mail-sync', last_run_at: new Date().toISOString(), last_error: out.error || null };
  if (out.ok && !dry) mark.last_ok_at = mark.last_run_at;
  if (!dry || out.error) await sb.from('sync_health').upsert(mark, { onConflict: 'name' });
  return new Response(JSON.stringify(out), { status: out.ok ? 200 : 502, headers: J });
});

// The refresh token from the one-time sign-in as recruitment@, swapped for an hour's access token.
async function accessToken(): Promise<string> {
  const env = (k: string) => (Deno.env.get(k) || '').trim();
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env('GOOGLE_CLIENT_ID'), client_secret: env('GOOGLE_CLIENT_SECRET'), refresh_token: env('RECRUIT_GMAIL_REFRESH_TOKEN'), grant_type: 'refresh_token' }),
  });
  const d = await r.json();
  if (!r.ok || !d.access_token) throw new Error('Google sign-in: ' + (d.error_description || d.error || r.status));
  return d.access_token;
}

async function gget(u: string, token: string): Promise<any> {
  const r = await fetch(u, { headers: { Authorization: 'Bearer ' + token } });
  const t = await r.text();
  if (!r.ok) throw new Error('Gmail ' + r.status + ': ' + t.slice(0, 200));
  return t ? JSON.parse(t) : {};
}

function hdr(m: any, name: string): string {
  const h = (m.payload?.headers || []).find((x: any) => String(x.name).toLowerCase() === name.toLowerCase());
  return h ? String(h.value || '') : '';
}
function addr(s: string): string { const m = /[A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(String(s || '')); return m ? m[0].toLowerCase() : ''; }

// the readable text of a message: the plain part, else the html part with tags removed
function bodyText(p: any): string {
  const found: { plain: string; html: string } = { plain: '', html: '' };
  const walk = (x: any) => {
    if (!x) return;
    if (x.mimeType === 'text/plain' && x.body?.data && !found.plain) found.plain = b64(x.body.data);
    else if (x.mimeType === 'text/html' && x.body?.data && !found.html) found.html = b64(x.body.data);
    (x.parts || []).forEach(walk);
  };
  walk(p);
  if (found.plain) return found.plain;
  return found.html.replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>|<\/p>|<\/div>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}
function b64(s: string): string {
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  } catch { return ''; }
}
// the first lines of what they wrote: quoted text, the "On ... wrote:" line and everything after it, and signatures are cut
function snippet(body: string): string {
  const keep: string[] = [];
  for (const raw of String(body || '').replace(/\r/g, '').split('\n')) {
    const l = raw.trim();
    if (/^(on .{6,120}wrote:?|le .{6,120}a écrit|-{2,}\s*(original message|forwarded message)|from:\s.+@|sent from my |get outlook for)/i.test(l)) break;
    if (l.charAt(0) === '>') continue;
    if (l) keep.push(l);
  }
  return keep.join(' ').replace(/\s+/g, ' ').trim().slice(0, 400);
}
