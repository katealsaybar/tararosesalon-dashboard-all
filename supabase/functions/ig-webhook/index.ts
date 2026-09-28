// Meta's Instagram messages webhook → ig_story_mentions (Kate, 28 Sep 2026).
// Only story mentions of @tararosesalon are kept (who and when); every other DM
// event is ignored and nothing of its content is stored.
//   GET  = Meta's one-time handshake (hub.verify_token must match IG_WEBHOOK_VERIFY_TOKEN)
//   POST = events, accepted only with a valid X-Hub-Signature-256 from META_APP_SECRET
// verify_jwt is off because Meta can't send a Supabase JWT; the signature is the check.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const GRAPH = 'https://graph.facebook.com/v26.0';
const PAGE = '482018305295476';   // Tara Rose Salon, the Page behind @tararosesalon

Deno.serve(async (req) => {
  const u = new URL(req.url);
  if (req.method === 'GET') {
    const ok = u.searchParams.get('hub.mode') === 'subscribe'
      && u.searchParams.get('hub.verify_token') === (Deno.env.get('IG_WEBHOOK_VERIFY_TOKEN') || '').trim();
    return ok ? new Response(u.searchParams.get('hub.challenge') || '') : new Response('forbidden', { status: 403 });
  }
  if (req.method !== 'POST') return new Response('method', { status: 405 });

  const raw = await req.text();
  if (!(await signed(raw, req.headers.get('x-hub-signature-256') || ''))) return new Response('bad signature', { status: 401 });

  let body: any;
  try { body = JSON.parse(raw); } catch (_) { return new Response('ok'); }
  let token = (Deno.env.get('IG_ACCESS_TOKEN') || '').trim();
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const rows: any[] = [];
  for (const e of body.entry || []) for (const m of e.messaging || []) {
    const atts = m.message?.attachments || [];
    if (!m.message?.mid || m.message?.is_echo || !atts.some((a: any) => a.type === 'story_mention')) continue;
    rows.push({ mid: m.message.mid, igsid: String(m.sender?.id || ''), mentioned_at: new Date(Number(m.timestamp) || Date.now()).toISOString() });
  }
  // The secret may be Kate's user token; the handle lookup needs the Page's own token.
  if (rows.length) {
    try {
      const p = await (await fetch(`${GRAPH}/${PAGE}?fields=access_token&access_token=${encodeURIComponent(token)}`)).json();
      if (p.access_token) token = p.access_token;
    } catch (_) {}
  }
  for (const r of rows) {
    // Sender comes as an Instagram-scoped id; ask Meta for the handle to match on.
    try {
      const q = await fetch(`${GRAPH}/${r.igsid}?fields=username&access_token=${encodeURIComponent(token)}`);
      const d = await q.json();
      if (d.username) r.username = String(d.username).toLowerCase();
    } catch (_) {}
  }
  if (rows.length) await sb.from('ig_story_mentions').upsert(rows, { onConflict: 'mid' });
  // Always 200, or Meta retries and eventually turns the subscription off.
  return new Response('ok');
});

async function signed(raw: string, header: string) {
  const secret = (Deno.env.get('META_APP_SECRET') || '').trim();
  if (!secret || !header.startsWith('sha256=')) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)));
  const hex = [...sig].map(b => b.toString(16).padStart(2, '0')).join('');
  const want = header.slice(7);
  if (hex.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}
