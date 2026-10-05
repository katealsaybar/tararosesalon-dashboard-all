/* ============================================================
   Service Playbooks: team sync for the Menu Builder and the Handover Tracker
   (Kate, 5 Oct 2026)

   Tara's app keeps its state (grades, menu lines, 12-week plans, tracker tasks) in
   memory inside app.js. full-loop.html hands this file a small door into it
   (window.TR_STATE: get the state, redraw, mark it saved) and has her markDirty()
   call TR_SYNC.changed(). Every edit then goes to kb_playbook_state
   (migrations/kb_playbook_state.sql), one row per piece, so two people on different
   lines never overwrite each other, and everyone else's open page takes it live over
   Supabase Realtime. A removed line keeps its row, marked deleted.

   Remote changes are written into the objects her page already holds (never new
   ones), because her inputs keep a reference to their line; the page redraws only
   when nobody is typing in it.
   ============================================================ */
(function () {
  var DB = TRSAuth.client(), TABLE = 'kb_playbook_state', GONE = '\u0000deleted';
  var ST = null;              // window.TR_STATE, set at boot (her app runs first)
  var synced = {};             // key -> JSON the table last had (GONE for a removed line)
  var timer = null, needDraw = false;
  // Compared by content, keys sorted: Postgres hands jsonb back in its own key order,
  // so a plain JSON.stringify read every line as changed (5 Oct 2026).
  var J = function (v) {
    return JSON.stringify(v, function (k, x) {
      if (!x || typeof x !== 'object' || Array.isArray(x)) return x;
      return Object.keys(x).sort().reduce(function (o, key) { o[key] = x[key]; return o; }, {});
    });
  };
  var okId = function (v) { return /^[A-Za-z0-9_-]{1,40}$/.test(String(v)); };

  // Her state as rows.
  function docs() {
    var S = ST.get(), d = {};
    d.grades = S.grades;
    d.plans = S.plans;
    d['menu:order'] = S.menu.map(function (r) { return r.id; });
    d['task:order'] = S.tasks.map(function (t) { return t.id; });
    S.menu.forEach(function (r) { d['menu:' + r.id] = r; });
    S.tasks.forEach(function (t) { d['task:' + t.id] = t; });
    return d;
  }
  function fill(target, src) {
    Object.keys(target).forEach(function (k) { if (!(k in src)) delete target[k]; });
    Object.keys(src).forEach(function (k) {
      if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k]) && target[k] && typeof target[k] === 'object') fill(target[k], src[k]);
      else target[k] = src[k];
    });
  }
  // One row from the table into her state, in place.
  function apply(row) {
    var S = ST.get(), k = row.key, v = row.value;
    if (k === 'grades' && Array.isArray(v)) { S.grades.splice.apply(S.grades, [0, S.grades.length].concat(v.slice(0, 8).map(String))); return; }
    if (k === 'plans' && v && typeof v === 'object') { fill(S.plans, v); return; }
    var m = /^(menu|task):(.+)$/.exec(k);
    if (!m) return;
    var list = m[1] === 'menu' ? S.menu : S.tasks;
    if (m[2] === 'order') {
      if (!Array.isArray(v)) return;
      var pos = {};
      v.forEach(function (id, i) { pos[id] = i; });
      list.sort(function (a, b) { return (a.id in pos ? pos[a.id] : 1e6) - (b.id in pos ? pos[b.id] : 1e6); });
      return;
    }
    if (!okId(m[2])) return;
    var i = list.findIndex(function (x) { return x.id === m[2]; });
    if (row.deleted) { if (i >= 0) list.splice(i, 1); return; }
    if (!v || typeof v !== 'object') return;
    v.id = m[2];
    if (m[1] === 'menu' && (!v.prices || typeof v.prices !== 'object')) v.prices = {};
    if (i >= 0) fill(list[i], v); else list.push(v);
  }
  function mark(row) { synced[row.key] = row.deleted ? GONE : J(row.value); }
  function pending(key, d) {
    if (!(key in synced)) return false;
    var now = key in d ? J(d[key]) : GONE;
    return now !== synced[key];
  }

  async function fetchRows() {
    var r = await DB.from(TABLE).select('key,value,deleted,updated_at,updated_by').range(0, 9999);
    if (r.error) throw r.error;
    return r.data || [];
  }
  function sortRows(rows) {
    // Lines first, orders last, so an order can place a line that just arrived.
    return rows.slice().sort(function (a, b) { return /:order$/.test(a.key) - /:order$/.test(b.key); });
  }

  // Changes from this browser go up 0.4s after the last keystroke.
  function changed() { clearTimeout(timer); timer = setTimeout(push, 400); }
  async function push() {
    var d = docs(), out = [];
    Object.keys(d).forEach(function (k) { if (synced[k] !== J(d[k])) out.push({ key: k, value: d[k], deleted: false }); });
    Object.keys(synced).forEach(function (k) {
      if (/^(menu|task):/.test(k) && !/:order$/.test(k) && !(k in d) && synced[k] !== GONE) out.push({ key: k, value: {}, deleted: true });
    });
    if (!out.length) { ST.saved('for the team'); return; }
    var sent = out.map(function (x) { return x.deleted ? GONE : J(x.value); });
    var res = await DB.from(TABLE).upsert(out, { onConflict: 'key' });
    if (res.error) { ST.unsaved('Not saved yet, trying again'); timer = setTimeout(push, 5000); return; }
    out.forEach(function (x, i) { synced[x.key] = sent[i]; });
    ST.saved('for the team');
  }

  // Someone else's change, unless this browser has its own on the way up.
  function take(row) {
    if (!row || !row.key) return;
    var j = row.deleted ? GONE : J(row.value);
    if (synced[row.key] === j) return;
    if (pending(row.key, docs())) return;
    apply(row);
    mark(row);
    needDraw = true;
    drawSoon();
  }
  function typing() {
    var a = document.activeElement;
    return a && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName) && document.getElementById('main').contains(a);
  }
  function drawSoon() {
    if (!needDraw) return;
    if (typing()) { setTimeout(drawSoon, 700); return; }
    needDraw = false;
    var y = window.scrollY;
    ST.redraw();
    window.scrollTo(0, y);
  }

  async function boot() {
    ST = window.TR_STATE;
    var rows = await fetchRows();
    sortRows(rows).forEach(function (r) { apply(r); mark(r); });
    if (rows.length) ST.redraw();
    // First visit ever: the table gets Tara's starting state. Later visits push
    // nothing here unless a line is missing from the table.
    var d = docs(), add = [];
    Object.keys(d).forEach(function (k) { if (!(k in synced)) add.push({ key: k, value: d[k], deleted: false }); });
    if (add.length) {
      var a = await DB.from(TABLE).upsert(add, { onConflict: 'key', ignoreDuplicates: true });
      if (!a.error) add.forEach(function (x) { synced[x.key] = J(x.value); });
    }
    ST.saved('for the team');
    DB.channel('kb-playbook-state')
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, function (p) { take(p.new); })
      .subscribe();
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) fetchRows().then(function (rs) { sortRows(rs).forEach(take); }).catch(function () {});
    });
  }

  window.TR_SYNC = { changed: changed, boot: boot };
})();
