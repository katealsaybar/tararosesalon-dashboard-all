// ── NAV STARS (Kate, 2 Oct 2026) ────────────────────────────────
// "wala naman star per sub section": Team Home lets you star a section or a page and
// keeps it at the top, but the dashboard's own pages (Comparison, Lost Clients ...)
// had no star. Every page link in the sidebar now has one. It writes the same
// kb_favourites table Team Home reads, keyed 'd:' + the view, so a starred page
// shows as a card under "Your favourites" on Team Home (hub/index.html DASH_PAGES).
// One row per person: the table's policy only lets you see and change your own.
(function () {
  const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.6 9.7l5.8-.8z"/></svg>';
  let favs = null;
  const viewOf = el => ((el.getAttribute('onclick') || '').match(/showView\('([^']+)'/) || [])[1];
  const client = () => (typeof sb !== 'undefined' && sb && sb.from) ? sb : null;

  function paint() {
    document.querySelectorAll('#sidebar .nav-sub[onclick*="showView("]').forEach(el => {
      const v = viewOf(el);
      if (!v || el.dataset.lands) return;      // a heading that lands on a child page
      let b = el.querySelector(':scope > .nav-star');
      if (!b) {
        b = document.createElement('button');
        b.type = 'button'; b.className = 'nav-star'; b.innerHTML = STAR;
        b.addEventListener('click', e => { e.stopPropagation(); e.preventDefault(); toggle(v); });
        el.appendChild(b);
        el.classList.add('has-star');
      }
      const on = !!(favs && favs['d:' + v]);
      const name = el.textContent.trim();
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on);
      b.setAttribute('aria-label', (on ? 'Remove ' : 'Add ') + name + (on ? ' from' : ' to') + ' your favourites on Team Home');
      b.title = on ? 'In your favourites on Team Home' : 'Add to your favourites on Team Home';
    });
  }

  async function load() {
    const c = client();
    if (!c) return false;
    const { data, error } = await c.from('kb_favourites').select('section').like('section', 'd:%');
    if (error) return false;
    favs = {};
    (data || []).forEach(x => { favs[x.section] = true; });
    paint();
    return true;
  }

  // Flips at once, saves, and flips back if the save is refused.
  async function toggle(v) {
    const c = client();
    if (!c || !favs) return;
    const k = 'd:' + v, was = !!favs[k];
    if (was) delete favs[k]; else favs[k] = true;
    paint();
    const res = was ? await c.from('kb_favourites').delete().eq('section', k)
                    : await c.from('kb_favourites').insert({ section: k });
    if (res.error) { if (was) favs[k] = true; else delete favs[k]; paint(); }
  }

  // The sidebar is in the page from the start; the signed-in client arrives a moment
  // later, so try a few times before giving up quietly.
  let tries = 0;
  (async function start() {
    if (await load()) return;
    if (++tries < 20) setTimeout(start, 750);
  })();
})();
