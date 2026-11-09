/* Kate, 9 Nov 2026: Rearrange Menu. Your own dashboard menu, in the order you chose (Team Home > Tools > Rearrange Menu, Level 5, saved per person in public.nav_layout).
   index.html's sidebar stays the original: this script only re-orders the rows it already has, before nav-collapse.js builds the folds from them, so the folds,
   the stars, the Under construction tags and every level rule keep working on the moved rows. A page keeps the same rules wherever it sits.

   How a layout reaches the page:
     1. A copy of your layout is kept in this browser (localStorage trsNavLayout), applied at load, before the first paint of the menu. No wait, no flash.
     2. After sign-in, enterDashboard() calls trsNavLayoutSync(): for Level 5 it asks the database for the saved layout; if that differs from the copy it updates the copy and
        reloads once (a new device gets your layout, and someone else signing in on this browser loses it). Anyone below Level 5 only ever has the copy removed.
     3. "View as" never touches it, so previewing another level cannot undo it.
   A layout is { v: 1, groups: [ { n: 'Numbers', loose: [key], subs: [ { n: 'Business', p: [key] } ] } ] }. A key is the page id from showView('id'), the data-status-id of a
   link out, or the row's own words. A page the layout does not mention stays where index.html put it, so a page added later still shows up. A page that has gone is skipped. */
(function () {
  var CACHE = 'trsNavLayout', GUARD = 'trsNavLayoutSeen';

  function txt(el) { return (el.textContent || '').replace(/\s+/g, ' ').trim(); }
  function isKid(el) { return el.classList.contains('lvl2') || el.classList.contains('lvl3') || el.classList.contains('lvl4'); }
  function keyOf(el) {
    var s = el.getAttribute('data-status-id');
    if (s) return s;
    // Kate, 9 Nov 2026: a link out is now a real <a href>, with no onclick. data-nav-key holds the key its row had when it was a div (the onclick text), so a layout saved before still finds it.
    var nk = el.getAttribute('data-nav-key');
    if (nk) return nk;
    var oc = el.getAttribute('onclick') || '', m = oc.match(/showView\('([^']+)'/);
    if (m) return m[1];
    if (oc) return 'l:' + oc.replace(/\s+/g, ' ').trim();
    return 't:' + txt(el);
  }

  // The menu as drawn in `root` (the live sidebar, or index.html parsed by the Rearrange Menu page): a tree of keys plus where each key's elements are.
  // A row with .lvl2 rows straight after it (Wellness Voucher Performance and its blasts) is one unit and moves as one.
  function extract(root) {
    var tree = [], units = {}, heads = {}, groupEls = {};
    Array.prototype.forEach.call(root.querySelectorAll('.nav-group'), function (g) {
      var t = g.querySelector(':scope > .nav-title');
      if (!t) return;
      var gn = txt(t), grp = { n: gn, loose: [], subs: [] }, cur = null, kids = Array.prototype.slice.call(g.children);
      groupEls[gn] = g;
      for (var i = 0; i < kids.length; i++) {
        var el = kids[i];
        if (el === t) continue;
        if (el.classList.contains('nav-subhead')) { cur = { n: txt(el), p: [] }; grp.subs.push(cur); heads[gn + '|' + cur.n] = el; continue; }
        if (!el.classList.contains('nav-sub') || isKid(el)) continue;
        var els = [el], j = i + 1;
        while (j < kids.length && isKid(kids[j])) { els.push(kids[j]); j++; }
        i = j - 1;
        var k = keyOf(el);
        units[k] = { els: els, label: txt(el) };
        (cur ? cur.p : grp.loose).push(k);
      }
      tree.push(grp);
    });
    return { tree: tree, units: units, heads: heads, groupEls: groupEls };
  }

  // The original tree with a saved layout laid over it.
  function merge(def, layout) {
    if (!layout || !layout.groups) return def;
    var known = {}, used = {}, out = [], gi = {}, defNames = {};
    def.forEach(function (g) {
      defNames[g.n] = 1;
      g.loose.forEach(function (k) { known[k] = 1; });
      g.subs.forEach(function (s) { s.p.forEach(function (k) { known[k] = 1; }); });
    });
    function grp(n) { if (!gi[n]) { gi[n] = { n: n, loose: [], subs: [] }; out.push(gi[n]); } return gi[n]; }
    function sub(g, n) {
      for (var i = 0; i < g.subs.length; i++) if (g.subs[i].n === n) return g.subs[i];
      var s = { n: n, p: [] }; g.subs.push(s); return s;
    }
    layout.groups.forEach(function (lg) {
      if (!defNames[lg.n]) return;
      var g = grp(lg.n);
      (lg.loose || []).forEach(function (k) { if (known[k] && !used[k]) { used[k] = 1; g.loose.push(k); } });
      (lg.subs || []).forEach(function (ls) {
        var s = sub(g, ls.n);
        (ls.p || []).forEach(function (k) { if (known[k] && !used[k]) { used[k] = 1; s.p.push(k); } });
      });
    });
    def.forEach(function (dg) {
      var g = grp(dg.n);
      dg.loose.forEach(function (k) { if (!used[k]) { used[k] = 1; g.loose.push(k); } });
      dg.subs.forEach(function (ds) {
        var left = ds.p.filter(function (k) { return !used[k]; });
        if (!ds.p.length) { sub(g, ds.n); return; }
        if (left.length) { var s = sub(g, ds.n); left.forEach(function (k) { used[k] = 1; s.p.push(k); }); }
      });
    });
    return out;
  }

  // Put the live sidebar's rows in the order of `tree`. Everything is worked out first; the page is touched only once that has not thrown.
  function apply(aside, ext, tree) {
    var plan = [];
    tree.forEach(function (g) {
      var ge = ext.groupEls[g.n];
      if (!ge) return;
      var seq = [];
      g.loose.forEach(function (k) { if (ext.units[k]) seq.push.apply(seq, ext.units[k].els); });
      g.subs.forEach(function (s) {
        var h = ext.heads[g.n + '|' + s.n];
        if (!h) { h = document.createElement('div'); h.className = 'nav-subhead'; h.textContent = s.n; }
        seq.push(h);
        s.p.forEach(function (k) { if (ext.units[k]) seq.push.apply(seq, ext.units[k].els); });
      });
      plan.push({ ge: ge, seq: seq });
    });
    var out = aside.querySelector('.nav-out');
    plan.forEach(function (p) { p.seq.forEach(function (el) { p.ge.appendChild(el); }); });
    plan.forEach(function (p) { if (out && out.parentNode) out.parentNode.insertBefore(p.ge, out); else aside.appendChild(p.ge); });
  }

  // One fixed key order, so a layout saved here and the same layout read back from the database compare equal as text.
  function canon(layout) {
    if (!layout || !layout.groups) return null;
    return JSON.stringify({ v: 1, groups: layout.groups.map(function (g) {
      return { n: g.n, loose: (g.loose || []).slice(), subs: (g.subs || []).map(function (s) { return { n: s.n, p: (s.p || []).slice() }; }) };
    }) });
  }
  function treeToLayout(tree) { return { v: 1, groups: tree.map(function (g) { return { n: g.n, loose: g.loose.slice(), subs: g.subs.map(function (s) { return { n: s.n, p: s.p.slice() }; }) }; }) }; }

  window.trsNav = { extract: extract, merge: merge, apply: apply, canon: canon, treeToLayout: treeToLayout, CACHE: CACHE };

  // 1. At load, from this browser's copy.
  var aside = document.querySelector('aside.sidebar');
  if (aside) {
    try {
      var raw = localStorage.getItem(CACHE);
      if (raw) { var ext = extract(aside); apply(aside, ext, merge(ext.tree, JSON.parse(raw))); }
    } catch (e) { /* a bad copy leaves the original menu */ }
  }

  // 2. After sign-in. opts: { level: the person's real level, viewAs: true while previewing another level }. Returns true when it is reloading the page.
  window.trsNavLayoutSync = async function (client, opts) {
    try {
      opts = opts || {};
      if (opts.viewAs) return false;
      var copy = null, db = null;
      try { copy = localStorage.getItem(CACHE); } catch (e) {}
      if (opts.level >= 5) {
        var r = await client.rpc('nav_layout_get');
        if (r.error) return false;
        db = canon(r.data);
      }
      if (db === copy) return false;
      try { if (db) localStorage.setItem(CACHE, db); else localStorage.removeItem(CACHE); } catch (e) { return false; }
      var sig = db || 'none', seen = null;
      try { seen = sessionStorage.getItem(GUARD); } catch (e) {}
      if (seen === sig) return false;
      try { sessionStorage.setItem(GUARD, sig); } catch (e) { return false; }
      location.reload();
      return true;
    } catch (e) { return false; }
  };
  window.trsNavLayoutForget = function () { try { localStorage.removeItem(CACHE); sessionStorage.removeItem(GUARD); } catch (e) {} };
})();
