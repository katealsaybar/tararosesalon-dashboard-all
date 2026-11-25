// Site Traffic tracker (Kate, 25 Nov 2026). Counts page opens and the seconds a page is open and on screen, on trk-salon-os.com only, into our own Supabase.
// The page that reads it is js/site-traffic.js; the table and the two write functions are in migrations/site_traffic.sql (site_page_views, site_track_open, site_track_time).
//
//   trsTrack(path, name)   a page was opened. The dashboard calls it from showView() with '/?view=<id>' and the page's label; every other page on the site
//                          (the campaign pages) is counted by this file by itself when it loads, with its address and its title.
//
// WHAT IT SENDS: the page address (no query except ?view=), the page name, phone or computer, where the visitor came from (Instagram, WhatsApp, Google,
// Facebook, Direct, Other), a visit id, and an id: for a signed-in team member the server uses the login itself (this file sends nothing about her), for a
// client a random id the browser makes for itself. No cookie, no IP address, no name, no phone, no email.
// A visit is one stretch of use: a new one starts after 30 minutes without a page opening. Seconds count only while the tab is on screen and the person
// has scrolled, tapped, clicked or typed in the last 30 seconds. It does nothing on any other address (a staging copy, localhost) unless
// localStorage 'trs-track-test' is '1', so a test never reaches the real numbers by accident.
(function () {
  'use strict';
  if (window.trsTrack) return;
  const SUPA = 'https://gvijxenafoowajqktqvd.supabase.co', KEY = 'sb_publishable_e5o0vPayb-6552oARTeu7Q_KoqfT7xO';
  let on = /(^|\.)trk-salon-os\.com$/i.test(location.hostname);
  try { if (localStorage.getItem('trs-track-test') === '1') on = true; } catch (e) {}
  if (!on) { window.trsTrack = function () {}; return; }
  const QUIET = 30 * 60e3, IDLE = 30e3;
  const rid = n => { const a = new Uint8Array(n); (window.crypto || window.msCrypto).getRandomValues(a); return Array.from(a, b => (b % 36).toString(36)).join(''); };
  const uuid = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
  const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const put = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

  let bid = get('trs-bid'); if (!bid || bid.length < 8) { bid = rid(16); put('trs-bid', bid); }
  let visit = null; try { visit = JSON.parse(get('trs-sv') || 'null'); } catch (e) {}
  const device = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || '') || (window.matchMedia && matchMedia('(pointer:coarse)').matches && innerWidth < 900) ? 'Phone' : 'Computer';

  // Where the visitor came from: the link's ?src= or ?utm_source=, else the page they came from. Kept for the whole visit.
  function source() {
    let s = ''; try { const q = new URLSearchParams(location.search); s = (q.get('utm_source') || q.get('src') || '').toLowerCase(); } catch (e) {}
    const ref = (document.referrer || '').toLowerCase();
    const h = s + ' ' + (function () { try { return new URL(ref).hostname; } catch (e) { return ''; } })();
    if (/instagram|ig\b/.test(h)) return 'Instagram';
    if (/whatsapp|wa\.me|respond/.test(h)) return 'WhatsApp';
    if (/google/.test(h)) return 'Google';
    if (/facebook|fb\.|meta/.test(h)) return 'Facebook';
    if (!ref && !s) return 'Direct';
    try { if (new URL(ref).hostname.replace(/^www\./, '') === location.hostname.replace(/^www\./, '')) return null; } catch (e) {}
    return 'Other';
  }

  let cur = null, lastActive = Date.now(), tick = null;
  const token = () => (typeof sb !== 'undefined' && sb && sb.auth) ? Promise.resolve(sb.auth.getSession()).then(r => (r && r.data && r.data.session && r.data.session.access_token) || null, () => null) : Promise.resolve(null);
  function call(fn, body, tok, keep) {
    return fetch(SUPA + '/rest/v1/rpc/' + fn, { method: 'POST', keepalive: !!keep, headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: 'Bearer ' + (tok || KEY) }, body: JSON.stringify(body) })
      .then(r => r.ok ? r.json() : null, () => null);
  }
  function flush(keep) {
    const c = cur; if (!c || !c.id || c.sec === c.sent) return;
    c.sent = c.sec; call('site_track_time', { p_id: c.id, p_seconds: c.sec }, c.tok, keep);
  }
  function startTick() {
    if (tick) return;
    tick = setInterval(() => {
      if (!cur) return;
      if (document.visibilityState === 'visible' && Date.now() - lastActive < IDLE) { cur.sec++; if (cur.sec % 10 === 0) flush(false); }
    }, 1000);
  }
  ['scroll', 'click', 'keydown', 'touchstart', 'mousemove', 'pointerdown'].forEach(ev => addEventListener(ev, () => { lastActive = Date.now(); }, { passive: true, capture: true }));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(true); else lastActive = Date.now(); });
  addEventListener('pagehide', () => flush(true));

  window.trsTrack = function (path, name) {
    try {
      path = String(path || '/'); name = String(name || document.title || path).replace(/\s*[|–—-]\s*(Tara Rose.*)$/i, '').trim().slice(0, 80) || path;
      if (cur && cur.path === path) return;           // the same page again (a redraw): not a new open
      flush(false);
      const now = Date.now();
      if (!visit || !visit.id || now - (visit.last || 0) > QUIET) { visit = { id: uuid(), seq: 0, src: null }; }
      if (!visit.src) visit.src = source();
      visit.seq++; visit.last = now; put('trs-sv', JSON.stringify(visit));
      const c = cur = { path: path, id: null, sec: 0, sent: 0, tok: null };
      lastActive = now; startTick();
      token().then(tok => {
        if (!tok && navigator.doNotTrack === '1') { if (cur === c) cur = null; return; }   // a client who asked not to be tracked
        c.tok = tok;
        return call('site_track_open', { p_visit: visit.id, p_seq: visit.seq, p_vid: bid, p_path: path, p_name: name, p_dev: device, p_src: visit.src || 'Direct' }, tok, false).then(id => { if (typeof id === 'string') { c.id = id; } });
      });
    } catch (e) {}
  };
  // Every page that is not the dashboard counts itself.
  function auto() { if (!document.getElementById('sidebar')) window.trsTrack(location.pathname, document.title); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto); else auto();
})();
