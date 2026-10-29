/* ============================================================
   Client to Staff Matching (Kate, 28 Oct 2026)
   One script for two Team Home pages, chosen by <body data-mx="find|grid">:
     find  = Find a stylist for her (three questions, then names)
     grid  = Who does what (the checklist: filters, edit mode, version history)
   Needs supabase-js, /auth.js and /hub/hub.js (KB) loaded first. Holds no stylist data: it comes from the
   matching_* functions in Supabase (migrations/client_matching.sql), which also decide who may read or change it.
   Photos and card links are the public Meet the Team page on tararosesalon.com.
   ============================================================ */
(function () {
  'use strict';
  var PAGE = document.body.getAttribute('data-mx');
  var main = document.getElementById('mxMain');
  var UP = 'https://www.tararosesalon.com/wp-content/uploads/2026/10/';
  var CARD = 'https://www.tararosesalon.com/en/ae/stylist-cards/?staff=';
  var L = ['Highlights','Balayage','Copper','Colour correction','Transformation Blonde','Brunette Correction','Scalp bleach','Full head bleach','All over','Root colour','Creative colour',
    'Layers','Pixie','Short bob','Long bob','Restyle','Curly hair','Trim or straight cut','Hairstyle','Plait','Blow-dry',
    'Tapes','Nanos','Weaves','Bonds','Extension removal',
    'Frizz free protein','Supreme straight','Brazilian blow-out','Vegan and Caviar',
    'Friendly and fun','Calm and chilled','Honest and to the point','Detailed and technical','Creative and bold','Confident and assertive','Supportive and collaborative',
    'Relax and unwind quietly','Talk and connect','Focus on the transformation','Mix of everything'];
  var BR = [['SAA','Saadiyat'],['KCA','Khalifa City A'],['MC','Motor City'],['AQ','Al Quoz']];
  var LVL = {SD: 'Style Director', SS: 'Senior Stylist', S: 'Stylist', JS: 'Junior Stylist'};
  var ORD = {SD: 0, SS: 1, S: 2, JS: 3};
  var GR = [['Hair colour', 0, 11, '--accent-lavender'], ['Cut and style', 11, 21, '--accent-mint'], ['Extensions', 21, 26, '--accent-butter'],
    ['Treatments', 26, 30, '--accent-coral'], ['Style', 30, 37, '--accent-lavender'], ['Vibe', 37, 41, '--accent-mint']];
  var STARTS = {0: 1, 11: 1, 21: 1, 26: 1, 30: 1, 37: 1};
  var WHOC = {Belle: '#C4B5FD', Kate: '#5fd6bf'};

  var S = [], EDITOR = false, LAST = null;

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  function brLabel(code) { for (var i = 0; i < BR.length; i++) if (BR[i][0] === code) return BR[i][1]; return code; }
  function brIdx(code) { for (var i = 0; i < BR.length; i++) if (BR[i][0] === code) return i; return 9; }
  function grpOf(i) { for (var k = 0; k < GR.length; k++) if (i >= GR[k][1] && i < GR[k][2]) return GR[k]; }
  function fmt(ts) {
    var d = new Date(ts);
    return d.toLocaleDateString('en-GB', {day: 'numeric', month: 'short'}) + ', ' + d.toLocaleTimeString('en-GB', {hour: 'numeric', minute: '2-digit', hour12: true});
  }
  function norm(r) {
    return {n: r.name, b: r.branch, l: r.level, t: r.ticks, gone: !!r.gone, added: !!r.added, sort: r.sort || 0,
      card_slug: r.card_slug || '', photo_file: r.photo_file || '',
      photo: r.photo_file ? UP + r.photo_file : '', url: r.card_slug ? CARD + r.card_slug + '&view=card' : ''};
  }
  function toSnap(x) { return {name: x.n, branch: x.b, level: x.l, ticks: x.t, gone: x.gone, added: x.added, card_slug: x.card_slug, photo_file: x.photo_file, sort: x.sort}; }
  function sortRows(a) { return a.sort(function (x, y) { return brIdx(x.b) - brIdx(y.b) || ORD[x.l] - ORD[y.l] || x.sort - y.sort; }); }
  function setBit(x, ci, on) { x.t = x.t.substr(0, ci) + (on ? '1' : '0') + x.t.substr(ci + 1); }
  function notFound() {
    main.innerHTML = '<p class="kb-msg">This page isn’t open to your account. <a href="/hub/">Back to Team Home</a></p>';
  }
  // Kate, 29 Oct 2026: the mini sidebar on both pages, so the two ways in are always one tap apart.
  function rail(cur) {
    function a(k, href, label) { return '<a href="' + href + '"' + (cur === k ? ' class="on" aria-current="page"' : '') + '>' + label + '</a>'; }
    return '<aside class="kb-side"><nav class="kb-side-nav" aria-label="Client matching"><div class="kb-side-k">Client matching</div>' +
      a('find', '/hub/find-stylist', 'Find a stylist for her') + a('grid', '/hub/matching', 'Full checklist') + '</nav></aside>';
  }
  async function rpc(name, args) { var r = await KB.client.rpc(name, args || {}); if (r.error) throw r.error; return r.data; }
  async function load() {
    var d = await rpc('matching_get');
    EDITOR = !!d.editor; LAST = d.last;
    S = sortRows((d.stylists || []).map(norm));
  }
  function lastLine() {
    var el = document.getElementById('mxLast'); if (!el) return;
    el.textContent = LAST ? 'Last updated ' + fmt(LAST.ts) + ' by ' + LAST.who + '.' : '';
  }
  function headerHeight() {
    var h = document.getElementById('kbHead'); if (h) document.body.style.setProperty('--mx-top', h.offsetHeight + 'px');
  }

  /* ============================================================
     FIND A STYLIST
     ============================================================ */
  function findPage() {
    var VIBES = [{i: 37, t: 'Quiet', s: 'She wants to switch off.'}, {i: 38, t: 'Chatty', s: 'She loves a good talk.'},
      {i: 39, t: 'All about the result', s: 'She wants the big change.'}, {i: 40, t: 'A bit of everything', s: ''}];
    var CATS = [{t: 'Colour', s: 'Highlights, balayage, blondes, root colour', lo: 0, hi: 11}, {t: 'Cut and style', s: 'Cuts, bobs, restyles, blow-dry', lo: 11, hi: 21},
      {t: 'Hair extensions', s: 'Tapes, nanos, weaves, bonds, removal', lo: 21, hi: 26}, {t: 'Treatments', s: 'Frizz free, supreme straight, Brazilian blow-out, Vegan and Caviar', lo: 26, hi: 30}];
    var st = {br: null, brAny: false, cat: null, svc: null, vibe: null, vibeAny: false, style: null};
    var app, trailEl;
    function R() { return S.filter(function (s) { return !s.gone && s.t.indexOf('1') >= 0; }); }
    function pool(skipStyle) {
      return R().filter(function (s) { return (!st.br || s.b === st.br) && (st.svc === null || s.t[st.svc] === '1') && (st.vibe === null || s.t[st.vibe] === '1') && (skipStyle || st.style === null || s.t[st.style] === '1'); });
    }
    function count(extra) { return R().filter(function (s) { return (!st.br || s.b === st.br) && (st.svc === null || s.t[st.svc] === '1') && extra(s); }).length; }
    function n(k) { return k + (k === 1 ? ' stylist' : ' stylists'); }
    function vibeName(i) { for (var k = 0; k < VIBES.length; k++) if (VIBES[k].i === i) return VIBES[k].t; return ''; }
    function step() {
      if (!st.br && !st.brAny) return 'salon';
      if (st.cat === null) return 'cat';
      if (st.svc === null) return 'svc';
      if (st.vibe === null && !st.vibeAny) return 'vibe';
      return 'result';
    }
    function opt(attrs, title, sub, badge, off) {
      return '<button class="mx-opt" ' + attrs + (off ? ' disabled' : '') + '><span>' + title + (sub ? '<small>' + sub + '</small>' : '') + '</span>' + (badge ? '<span class="n">' + badge + '</span>' : '') + '</button>';
    }
    function trail() {
      var t = [];
      if (st.br || st.brAny) t.push(['salon', st.br ? brLabel(st.br) : 'Any salon']);
      if (st.svc !== null) t.push(['svc', L[st.svc]]);
      if (st.vibe !== null || st.vibeAny) t.push(['vibe', st.vibe !== null ? vibeName(st.vibe) : 'Any appointment']);
      trailEl.innerHTML = t.map(function (x) { return '<button data-edit="' + x[0] + '" title="Change this">' + esc(x[1]) + ' ✎</button>'; }).join('');
    }
    function render() {
      trail();
      var s = step(), h = '';
      if (s === 'salon') {
        h = '<p class="mx-step">Question 1 of 3</p><h2 class="mx-q">Which salon is she booking?</h2><div class="mx-opts two">' +
          BR.map(function (b) { return opt('data-br="' + b[0] + '"', b[1]); }).join('') + '</div><button class="mx-skip" data-anysalon>Any salon works for her</button>';
      } else if (s === 'cat') {
        h = '<button class="mx-back" data-back>← Back</button><p class="mx-step">Question 2 of 3</p><h2 class="mx-q">What is she booking?</h2><div class="mx-opts">' +
          CATS.map(function (c, i) {
            var k = R().filter(function (x) { return (!st.br || x.b === st.br) && x.t.slice(c.lo, c.hi).indexOf('1') >= 0; }).length;
            return opt('data-cat="' + i + '"', c.t, c.s, n(k), k === 0);
          }).join('') + '</div>';
      } else if (s === 'svc') {
        var c = CATS[st.cat];
        h = '<button class="mx-back" data-back>← Back</button><p class="mx-step">Question 2 of 3</p><h2 class="mx-q">Which ' + c.t.toLowerCase() + ' service?</h2><div class="mx-opts">';
        for (var i = c.lo; i < c.hi; i++) {
          var k = R().filter(function (x) { return (!st.br || x.b === st.br) && x.t[i] === '1'; }).length;
          h += opt('data-svc="' + i + '"', esc(L[i]), '', n(k), k === 0);
        }
        h += '</div>';
      } else if (s === 'vibe') {
        h = '<button class="mx-back" data-back>← Back</button><p class="mx-step">Question 3 of 3</p><h2 class="mx-q">What kind of appointment does she want?</h2><div class="mx-opts">' +
          VIBES.map(function (v) { var k = count(function (x) { return x.t[v.i] === '1'; }); return opt('data-vibe="' + v.i + '"', v.t, v.s, n(k), k === 0); }).join('') +
          '</div><button class="mx-skip" data-anyvibe>She did not say</button>';
      } else {
        var r = pool(false);
        h = '<button class="mx-back" data-back>← Back</button><p class="mx-step">Your answer</p><h2 class="mx-q">' + (r.length === 1 ? 'Offer her this stylist' : 'Offer her these ' + r.length + ' stylists') + '</h2>' +
          r.map(function (x) {
            var tags = [], i;
            for (i = 30; i < 37; i++) if (x.t[i] === '1') tags.push(L[i]);
            var ini = esc(x.n.charAt(0));
            return '<div class="mx-card"><div class="ph">' + (x.photo ? '<img src="' + esc(x.photo) + '" alt="" onerror="this.parentNode.innerHTML=\'<div class=noph>' + ini + '</div>\'">' : '<div class="noph">' + ini + '</div>') + '</div>' +
              '<div class="info"><b>' + esc(x.n) + '</b> <span class="meta">· ' + LVL[x.l] + ' · ' + brLabel(x.b) + '</span>' +
              '<div class="mx-tags">' + (tags.length === 7 ? '<span>Suits any kind of client</span>' : tags.map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('')) + '</div>' +
              '<div class="mx-acts">' + (x.url ? '<a class="mx-pill" target="_blank" rel="noopener" href="' + esc(x.url) + '">See her card</a><button class="mx-pill ghost" data-copy="' + esc(x.url) + '">Copy link</button>' : '<span class="meta">Her card is not on the website yet.</span>') + '</div></div></div>';
          }).join('') +
          '<details><summary>Narrow it down by the kind of stylist she wants</summary><div class="mx-chips">' +
          [30, 31, 32, 33, 34, 35, 36].map(function (i) {
            var k = pool(true).filter(function (x) { return x.t[i] === '1'; }).length;
            return '<button data-style="' + i + '" aria-pressed="' + (st.style === i) + '"' + (k === 0 ? ' disabled' : '') + '>' + esc(L[i]) + ' (' + k + ')</button>';
          }).join('') + '</div></details><button class="mx-skip" data-reset>Start again</button>';
      }
      app.innerHTML = h;
    }
    function reset() { st = {br: null, brAny: false, cat: null, svc: null, vibe: null, vibeAny: false, style: null}; }
    main.innerHTML = '<div class="kb-shell">' + rail('find') + '<div class="mx mx-find"><div class="mx-doc">' +
      '<p class="mx-eyebrow">Team Home · Clients</p><h1>Find a stylist for her</h1>' +
      '<p class="mx-lead">Three quick questions, and it gives you the names to offer her. Want to check who does what? Open the <a href="/hub/matching">full checklist</a>.</p>' +
      '<div class="mx-trail" id="mxTrail"></div><div id="mxApp"></div><p class="mx-foot" id="mxLast"></p></div></div></div>';
    app = document.getElementById('mxApp'); trailEl = document.getElementById('mxTrail');
    main.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b || b.disabled) return;
      var d = b.dataset;
      if (d.copy) {
        var ta = document.createElement('textarea'); ta.value = d.copy; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); } catch (err) {}
        ta.remove(); if (navigator.clipboard) navigator.clipboard.writeText(d.copy).catch(function () {});
        var was = b.textContent; b.textContent = 'Copied'; setTimeout(function () { b.textContent = was; }, 1400); return;
      }
      if (d.br) st.br = d.br;
      else if ('anysalon' in d) st.brAny = true;
      else if (d.cat) st.cat = +d.cat;
      else if (d.svc) st.svc = +d.svc;
      else if (d.vibe) st.vibe = +d.vibe;
      else if ('anyvibe' in d) st.vibeAny = true;
      else if (d.style) st.style = st.style === +d.style ? null : +d.style;
      else if ('reset' in d) reset();
      else if ('back' in d) {
        var s = step();
        if (s === 'result') { st.vibe = null; st.vibeAny = false; st.style = null; } else if (s === 'vibe') st.svc = null; else if (s === 'svc') st.cat = null; else if (s === 'cat') { st.br = null; st.brAny = false; }
      } else if (d.edit) {
        if (d.edit === 'salon') reset();
        if (d.edit === 'svc') { st.svc = null; st.cat = null; st.vibe = null; st.vibeAny = false; st.style = null; }
        if (d.edit === 'vibe') { st.vibe = null; st.vibeAny = false; st.style = null; }
      } else return;
      render(); window.scrollTo({top: 0, behavior: 'smooth'});
    });
    render(); lastLine();
  }

  /* ============================================================
     WHO DOES WHAT (the checklist)
     ============================================================ */
  function gridPage() {
    var PICK = {}, editing = false, undoFn = null, toastT = null, HIST = [], BASE0 = null, LIVE = null, VIEW = null;
    var F = {names: null, levels: null, cols: {}}, SORT = null, popKey = null, lastCell = null;
    var tbl, wrapEl, pop, cpop, drawer;

    function showB(code) { var k = Object.keys(PICK); return !k.length || !!PICK[code]; }
    function live() { return S.filter(function (s) { return !s.gone; }); }
    function $(id) { return document.getElementById(id); }

    /* ----- history: every change in order; the checklist is the seed plus these ----- */
    function applyEv(rows, h) {
      var t = h.type, r = rows.filter(function (x) { return x.n === h.name; })[0];
      if (t === 'tick' && r) setBit(r, h.col, h.on);
      else if (t === 'add') rows.push({n: h.name, b: h.branch, l: h.level, t: h.ticks, gone: false, added: true, card_slug: '', photo_file: '', photo: '', url: '', sort: rows.reduce(function (m, x) { return Math.max(m, x.sort); }, 0) + 1});
      else if (t === 'remove' && r) r.gone = true;
      else if (t === 'restore' && r) r.gone = false;
      else if (t === 'revert') { rows.length = 0; (h.snap || []).forEach(function (x) { rows.push(norm(x)); }); }
    }
    function replay(upto) {
      var rows = BASE0.map(function (x) { return Object.assign({}, x); });
      for (var i = 0; i < HIST.length && i <= upto; i++) if (HIST[i].type !== 'seed') applyEv(rows, HIST[i]);
      return sortRows(rows);
    }
    async function loadHist() {
      if (!EDITOR) return;
      HIST = await rpc('matching_history');
      var seed = HIST.filter(function (h) { return h.type === 'seed'; })[0];
      BASE0 = seed ? (seed.snap || []).map(norm) : [];
    }
    function userEvents() { return HIST.map(function (h, i) { return i; }).filter(function (i) { return HIST[i].type !== 'seed'; }); }
    function versions() {
      var v = [];
      HIST.forEach(function (h, i) {
        if (h.type === 'seed') return;
        var last = v[v.length - 1];
        if (last && last.who === h.who && h.type !== 'revert' && HIST[last.to].type !== 'revert' && h.ts - HIST[last.to].ts <= 300000) { last.to = i; last.at = fmt(h.ts); }
        else v.push({from: i, to: i, who: h.who, at: fmt(h.ts)});
      });
      return v;
    }
    function lastEdit(name, ci) {
      for (var i = (VIEW ? VIEW.to : HIST.length - 1); i >= 0; i--) { var h = HIST[i]; if (h.type === 'tick' && h.name === name && h.col === ci) return h; }
      return null;
    }
    function chgOf(name, ci) {
      if (!VIEW || !VIEW.show) return null;
      for (var i = VIEW.from; i <= VIEW.to; i++) { var h = HIST[i]; if (h.type === 'tick' && h.name === name && h.col === ci) return WHOC[h.who] || '#999'; }
      return null;
    }
    function evText(h) {
      var t = h.type;
      if (t === 'add') return '<span class="on">added</span> ' + esc(h.name) + ' (' + LVL[h.level] + ', ' + brLabel(h.branch) + ')';
      if (t === 'remove') return '<span class="off">removed</span> ' + esc(h.name) + ' from the checklist';
      if (t === 'restore') return '<span class="on">put back</span> ' + esc(h.name);
      if (t === 'revert') return '<span class="on">restored</span> ' + esc(h.label || 'an earlier version');
      return '<span class="' + (h.on ? 'on' : 'off') + '">' + (h.on ? 'ticked' : 'unticked') + '</span> ' + esc(L[h.col]) + ' for ' + esc(h.name);
    }

    /* ----- filters and sorting ----- */
    function passes(s) {
      if (F.names && F.names[s.n] === false) return false;
      if (F.levels && !F.levels[s.l]) return false;
      for (var ci in F.cols) { var on = s.t[ci] === '1', f = F.cols[ci]; if (on ? !f.t : !f.b) return false; }
      return true;
    }
    function rowsFor(code) {
      var rows = S.filter(function (s) { return !s.gone && s.b === code && passes(s); });
      if (SORT) {
        var d = SORT.dir;
        rows = rows.map(function (s, i) { return [s, i]; }).sort(function (a, b) {
          var c = SORT.key === 'name' ? a[0].n.localeCompare(b[0].n) * d : ((b[0].t[SORT.key] === '1') - (a[0].t[SORT.key] === '1')) * d;
          return c || a[1] - b[1];
        }).map(function (x) { return x[0]; });
      }
      return rows;
    }

    /* ----- drawing ----- */
    function branchChips() {
      var none = !Object.keys(PICK).length;
      $('mxBranch').innerHTML = '<button class="mx-chip" data-b="ALL" aria-pressed="' + none + '">All branches</button><span class="mx-sep">|</span>' +
        BR.map(function (b) { return '<button class="mx-chip" data-b="' + b[0] + '" aria-pressed="' + (!none && !!PICK[b[0]]) + '">' + b[1] + '</button>'; }).join('');
    }
    function fbar() {
      var chips = [];
      function chip(txt, kind, key) { chips.push('<span class="chip">' + esc(txt) + '<button data-rm="' + kind + '" data-k="' + key + '" aria-label="Remove">✕</button></span>'); }
      if (F.names) chip('Stylist: ' + Object.keys(F.names).filter(function (k) { return F.names[k]; }).length + ' picked', 'names', '');
      if (F.levels) chip('Level: ' + Object.keys(F.levels).filter(function (k) { return F.levels[k]; }).map(function (k) { return LVL[k]; }).join(', '), 'levels', '');
      Object.keys(F.cols).forEach(function (ci) { var f = F.cols[ci]; chip(L[ci] + ': ' + (f.t && !f.b ? 'ticked' : !f.t && f.b ? 'blank' : 'none'), 'col', ci); });
      if (SORT) chip('Sorted by ' + (SORT.key === 'name' ? 'Stylist' : L[SORT.key]) + (SORT.key === 'name' ? (SORT.dir > 0 ? ' A to Z' : ' Z to A') : (SORT.dir > 0 ? ', ticked first' : ', blank first')), 'sort', '');
      var vis = 0; BR.forEach(function (b) { if (showB(b[0])) vis += rowsFor(b[0]).length; });
      var tot = live().filter(function (s) { return showB(s.b); }).length;
      $('mxFbar').innerHTML = chips.length ? chips.join('') + '<span>Showing ' + vis + ' of ' + tot + '</span><button class="clear" data-rm="all">Clear all</button>' : '<span>Tip: click a heading to filter or sort, like Google Sheets.</span>';
    }
    var BIN = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/></svg>';
    function table() {
      var nameOn = !!(F.names || F.levels || (SORT && SORT.key === 'name'));
      var h = '<thead><tr class="grp"><th class="name"></th>' + GR.map(function (g) {
        return '<th colspan="' + (g[2] - g[1]) + '" class="s" style="background:color-mix(in srgb,var(' + g[3] + ') 80%,var(--surface))">' + g[0] + '</th>'; }).join('') + '<th class="pad"></th></tr>' +
        '<tr class="lab"><th class="name"><button class="lbl2' + (nameOn ? ' f' : '') + '" data-c="name">Stylist <i class="fi">' + (nameOn ? '●' : '▾') + '</i></button></th>' +
        L.map(function (l, i) {
          var f = F.cols[i] || (SORT && SORT.key === i);
          return '<th class="v' + (STARTS[i] ? ' s' : '') + '" style="z-index:' + (100 - i) + '"><button class="lbl' + (f ? ' f' : '') + '" data-c="' + i + '">' + esc(l) + '<i class="fi">' + (f ? '●' : '▾') + '</i></button></th>'; }).join('') +
        '<th class="pad"></th></tr></thead><tbody>';
      var shown = 0;
      BR.forEach(function (b) {
        if (!showB(b[0])) return;
        var rows = rowsFor(b[0]), all = live().filter(function (s) { return s.b === b[0]; }).length;
        if (!rows.length) return;
        h += '<tr class="br" style="--bc:var(--accent-' + ({SAA: 'lavender', KCA: 'mint', MC: 'butter', AQ: 'coral'}[b[0]]) + ')"><td class="brn">' + b[1] + '<span>' + (rows.length === all ? all + ' stylists' : rows.length + ' of ' + all) + '</span></td><td colspan="' + (L.length + 1) + '"><button class="mx-addhere" data-add="' + b[0] + '">+ Add a stylist to ' + b[1] + '</button></td></tr>';
        rows.forEach(function (s) {
          shown++;
          var none = s.t.indexOf('1') < 0, ini = esc(s.n.charAt(0));
          var nm = s.url ? '<a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.n) + '</a>' : esc(s.n);
          var ph = s.photo ? '<img src="' + esc(s.photo) + '" alt="" loading="lazy" onerror="this.parentNode.innerHTML=\'<div class=noph>' + ini + '</div>\'">' : '<div class="noph">' + ini + '</div>';
          h += '<tr data-s="' + S.indexOf(s) + '"' + (none ? ' class="blank"' : '') + '><td class="name"><div class="who"><div class="ph">' + ph + '</div><div><b>' + nm + '</b><small>' + LVL[s.l] + (none ? ' · no ticks yet' : '') + '</small></div>' +
            '<button class="mx-rm" data-rmv="' + S.indexOf(s) + '" title="Remove ' + esc(s.n) + '" aria-label="Remove ' + esc(s.n) + '">' + BIN + '</button></div></td>' +
            L.map(function (l, i) {
              var on = s.t[i] === '1', ed = lastEdit(s.n, i), ch = chgOf(s.n, i);
              return '<td class="t' + (on ? ' on' : '') + (STARTS[i] ? ' s' : '') + (ed ? ' ed' : '') + (ch ? ' chg' : '') + '" style="--c:var(' + grpOf(i)[3] + ')' + (ch ? ';--ec:' + ch : '') + '"' +
                (ed ? ' title="' + (ed.on ? 'Ticked' : 'Unticked') + ' by ' + esc(ed.who) + ', ' + esc(fmt(ed.ts)) + '"' : '') + '>' + (on ? '✓' : '') + '</td>'; }).join('') + '<td class="pad"></td></tr>';
        });
      });
      if (!shown) h += '<tr><td colspan="' + (L.length + 2) + '" style="padding:30px;text-align:center;color:var(--muted)">No stylist matches these filters. <button class="clear" data-rm="all" style="border:0;background:none;text-decoration:underline;cursor:pointer;font:inherit;color:var(--text)">Clear all</button></td></tr>';
      tbl.innerHTML = h + '</tbody>';
      fbar();
    }

    /* ----- the filter menu ----- */
    function closePop() { pop.classList.remove('show'); popKey = null; }
    function inPick() { return live().filter(function (s) { return showB(s.b); }); }
    function openPop(key, anchor) {
      popKey = key; var h = '', base = inPick();
      if (key === 'name') {
        var cN = F.names, cL = F.levels;
        h += '<h5>Stylist</h5><div class="row"><button class="sb" data-sort="1" aria-pressed="' + !!(SORT && SORT.key === 'name' && SORT.dir > 0) + '">Sort A to Z</button><button class="sb" data-sort="-1" aria-pressed="' + !!(SORT && SORT.key === 'name' && SORT.dir < 0) + '">Sort Z to A</button></div>';
        h += '<h5>Filter by level</h5>' + Object.keys(LVL).map(function (k) { var n = base.filter(function (s) { return s.l === k; }).length;
          return '<label><input type="checkbox" data-lv="' + k + '"' + (!cL || cL[k] ? ' checked' : '') + '>' + LVL[k] + '<span class="n">' + n + '</span></label>'; }).join('');
        h += '<h5>Filter by name</h5><input type="search" placeholder="Search" id="mxPopSearch"><div class="links"><button data-all="1">Select all</button><button data-all="0">Clear</button></div><div class="list" id="mxPopList">' +
          base.map(function (s) { return '<label data-n="' + esc(s.n.toLowerCase()) + '"><input type="checkbox" data-nm="' + esc(s.n) + '"' + (!cN || cN[s.n] !== false ? ' checked' : '') + '>' + esc(s.n) + '</label>'; }).join('') + '</div>';
      } else {
        var f = F.cols[key] || {t: true, b: true}, nt = base.filter(function (s) { return s.t[key] === '1'; }).length;
        h += '<h5>' + esc(L[key]) + '</h5><div class="row"><button class="sb" data-sort="1" aria-pressed="' + !!(SORT && SORT.key === +key && SORT.dir > 0) + '">Ticked first</button><button class="sb" data-sort="-1" aria-pressed="' + !!(SORT && SORT.key === +key && SORT.dir < 0) + '">Blank first</button></div>' +
          '<h5>Filter by value</h5><label><input type="checkbox" data-v="t"' + (f.t ? ' checked' : '') + '>✓ Ticked<span class="n">' + nt + '</span></label>' +
          '<label><input type="checkbox" data-v="b"' + (f.b ? ' checked' : '') + '>(Blanks)<span class="n">' + (base.length - nt) + '</span></label>';
      }
      h += '<div class="foot2"><button class="gh" data-clear="1">Clear</button><span><button class="gh" data-cancel="1">Cancel</button> <button class="ok" data-ok="1">OK</button></span></div>';
      pop.innerHTML = h; pop.classList.add('show');
      var r = anchor.getBoundingClientRect(), ph = pop.offsetHeight;
      var left = Math.min(Math.max(8, r.left), innerWidth - 284), top = r.bottom + 6;
      if (top + ph > innerHeight - 8) top = Math.max(8, r.top - ph - 6);
      pop.style.left = left + 'px'; pop.style.top = top + 'px';
    }
    function onPopClick(e) {
      var b = e.target.closest('button'); if (!b) return;
      var key = popKey === 'name' ? 'name' : +popKey;
      if (b.dataset.sort) { var d = +b.dataset.sort; SORT = (SORT && SORT.key === key && SORT.dir === d) ? null : {key: key, dir: d}; closePop(); table(); return; }
      if (b.dataset.all !== undefined) { pop.querySelectorAll('input[data-nm]').forEach(function (c) { if (c.closest('label').style.display !== 'none') c.checked = b.dataset.all === '1'; }); return; }
      if (b.dataset.cancel) { closePop(); return; }
      if (b.dataset.clear) {
        if (key === 'name') { F.names = null; F.levels = null; if (SORT && SORT.key === 'name') SORT = null; } else { delete F.cols[key]; if (SORT && SORT.key === key) SORT = null; }
        closePop(); table(); return;
      }
      if (b.dataset.ok) {
        if (key === 'name') {
          var lv = {}, lvAll = true; pop.querySelectorAll('input[data-lv]').forEach(function (c) { lv[c.dataset.lv] = c.checked; if (!c.checked) lvAll = false; });
          F.levels = lvAll ? null : lv;
          var nm = F.names ? Object.assign({}, F.names) : {}, any = false;
          pop.querySelectorAll('input[data-nm]').forEach(function (c) { nm[c.dataset.nm] = c.checked; });
          Object.keys(nm).forEach(function (k) { if (nm[k] === false) any = true; });
          F.names = any ? nm : null;
        } else {
          var t = pop.querySelector('input[data-v="t"]').checked, bl = pop.querySelector('input[data-v="b"]').checked;
          if (t && bl) delete F.cols[key]; else F.cols[key] = {t: t, b: bl};
        }
        closePop(); table();
      }
    }
    function removeFilter(el) {
      var k = el.dataset.rm;
      if (k === 'all') { F = {names: null, levels: null, cols: {}}; SORT = null; }
      else if (k === 'names') F.names = null; else if (k === 'levels') F.levels = null;
      else if (k === 'col') delete F.cols[el.dataset.k]; else if (k === 'sort') SORT = null;
      table();
    }

    /* ----- hover crosshair ----- */
    function clearHover() {
      document.querySelectorAll('#mxTbl .hr,#mxTbl .hc,#mxTbl .here').forEach(function (x) { x.classList.remove('hr', 'hc', 'here'); });
      lastCell = null;
    }
    function onHover(e) {
      var c = e.target.closest('td.t, td.name, th.v');
      if (!c) { clearHover(); return; }
      if (c === lastCell) return;
      clearHover(); lastCell = c;
      var idx = c.cellIndex, isHead = c.tagName === 'TH', isName = c.classList.contains('name');
      if (!isHead) c.parentNode.classList.add('hr');
      if (!isName) {
        var head = tbl.tHead.rows[1].cells[idx]; if (head) head.classList.add('hc');
        Array.prototype.forEach.call(tbl.tBodies[0].rows, function (r) { if (r.hasAttribute('data-s') && r.cells[idx]) r.cells[idx].classList.add('hc'); });
      }
      if (!isHead && !isName) c.classList.add('here');
    }

    /* ----- messages ----- */
    function toast(msg, canUndo) {
      $('mxToastTx').textContent = msg; $('mxUndo').style.display = canUndo ? '' : 'none';
      var t = $('mxToast'); t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 5000);
    }
    function oops(e) { toast((e && e.message ? e.message : 'Could not save') + '. Nothing was changed.', false); }

    /* ----- saving ----- */
    async function refresh() {
      await load(); await loadHist();
      if (VIEW) { LIVE = S; S = replay(VIEW.to); }
      branchChips(); table(); drawHist(); lastLine();
    }
    function setEditing(on) {
      editing = !!on && EDITOR && !VIEW;
      document.body.classList.toggle('mx-editing', editing);
      $('mxEditBtn').textContent = editing ? 'Editing…' : 'Edit ticks'; clearHover();
    }
    async function doTick(si, ci) {
      var x = S[si], was = x.t[ci] === '1', on = !was;
      setBit(x, ci, on);
      var tr = tbl.querySelector('tr[data-s="' + si + '"]');
      if (tr) { var td = tr.cells[ci + 1]; td.classList.toggle('on', on); td.textContent = on ? '✓' : ''; td.classList.remove('flash'); void td.offsetWidth; td.classList.add('flash'); tr.classList.toggle('blank', x.t.indexOf('1') < 0); }
      try {
        await rpc('matching_tick', {p_name: x.n, p_col: ci, p_on: on});
        undoFn = async function () { try { await rpc('matching_tick', {p_name: x.n, p_col: ci, p_on: was}); await refresh(); toast('Undone', false); } catch (e) { oops(e); } };
        toast('Saved: ' + x.n + ', ' + L[ci] + (on ? ' ticked' : ' unticked'), true);
        await loadHist(); markEdited(si, ci); drawHist(); LAST = HIST.length ? {who: HIST[HIST.length - 1].who, ts: HIST[HIST.length - 1].ts} : LAST; lastLine();
      } catch (e) { setBit(x, ci, was); if (tr) { var td2 = tr.cells[ci + 1]; td2.classList.toggle('on', was); td2.textContent = was ? '✓' : ''; tr.classList.toggle('blank', x.t.indexOf('1') < 0); } oops(e); }
    }
    function markEdited(si, ci) {
      var tr = tbl.querySelector('tr[data-s="' + si + '"]'); if (!tr) return;
      var h = lastEdit(S[si].n, ci), td = tr.cells[ci + 1];
      if (h) { td.classList.add('ed'); td.title = (h.on ? 'Ticked' : 'Unticked') + ' by ' + h.who + ', ' + fmt(h.ts); }
    }
    /* add, remove, put back */
    function fillDlg(code) {
      $('mxABr').innerHTML = BR.map(function (b) { return '<option value="' + b[0] + '">' + b[1] + '</option>'; }).join('');
      var one = Object.keys(PICK).filter(function (k) { return PICK[k]; });
      $('mxABr').value = code || (one.length === 1 ? one[0] : 'SAA');
      $('mxALv').innerHTML = Object.keys(LVL).map(function (k) { return '<option value="' + k + '">' + LVL[k] + '</option>'; }).join('');
      $('mxALv').value = 'S';
      $('mxACopy').innerHTML = '<option value="">Nobody, start blank</option>' + live().map(function (s) { return '<option value="' + esc(s.n) + '">' + esc(s.n) + ' (' + brLabel(s.b) + ')</option>'; }).join('');
      $('mxAName').value = ''; $('mxAErr').textContent = '';
    }
    function openAdd(code) { if (!editing) return; fillDlg(code); $('mxDlg').classList.add('show'); setTimeout(function () { $('mxAName').focus(); }, 30); }
    function closeDlg() { $('mxDlg').classList.remove('show'); $('mxCfm').classList.remove('show'); $('mxRvm').classList.remove('show'); }
    async function addStylist() {
      var n = $('mxAName').value.trim(), err = $('mxAErr');
      if (!n) { err.textContent = 'Type her name first.'; return; }
      var b = $('mxABr').value, lv = $('mxALv').value, cp = $('mxACopy').value;
      var t = cp ? S.filter(function (s) { return s.n === cp; })[0].t : new Array(L.length + 1).join('0');
      try { await rpc('matching_add', {p_name: n, p_branch: b, p_level: lv, p_ticks: t}); } catch (e) { err.textContent = e.message || 'Could not add her.'; return; }
      closeDlg();
      undoFn = async function () { try { await rpc('matching_remove', {p_name: n}); await refresh(); toast('Undone', false); } catch (e2) { oops(e2); } };
      await refresh(); toast('Added ' + n + ' to ' + brLabel(b) + '. Now tick what she does.', true);
      var i = S.findIndex(function (s) { return s.n === n; }), tr = tbl.querySelector('tr[data-s="' + i + '"]'); if (tr) tr.scrollIntoView({block: 'center'});
    }
    function askRemove(si) {
      var s = S[si]; $('mxCfm').dataset.n = s.n;
      $('mxCTitle').textContent = 'Remove ' + s.n + ' from the checklist?';
      $('mxCBody').textContent = 'She is not deleted anywhere else: Phorest and her staff card stay as they are. You can put her back from the history.';
      $('mxCfm').classList.add('show');
    }
    async function doRemove() {
      var n = $('mxCfm').dataset.n; closeDlg();
      try { await rpc('matching_remove', {p_name: n}); } catch (e) { oops(e); return; }
      undoFn = async function () { try { await rpc('matching_restore', {p_name: n}); await refresh(); toast('Put back', false); } catch (e2) { oops(e2); } };
      await refresh(); toast('Removed ' + n + '.', true);
    }
    async function putBack(name) {
      try { await rpc('matching_restore', {p_name: name}); } catch (e) { oops(e); return; }
      if (VIEW) { closeVersion(); }
      await refresh(); toast('Put back ' + name + '.', false);
    }

    /* ----- version history drawer ----- */
    function drawHist() {
      if (!EDITOR) return;
      var vs = versions(), cur = LIVE || S, h = '';
      h += '<button class="ver' + (!VIEW ? ' on' : '') + '" data-vi="cur"><span class="vt">Current version</span><span class="vw">What everyone sees now</span></button>';
      for (var i = vs.length - 1; i >= 0; i--) {
        var v = vs[i], n = v.to - v.from + 1, sel = VIEW && VIEW.vi === i;
        h += '<button class="ver' + (sel ? ' on' : '') + '" data-vi="' + i + '"><span class="dot" style="background:' + (WHOC[v.who] || '#999') + '"></span><span class="vt">' + esc(v.at) + '</span><span class="vw">' + esc(v.who) + ' · ' + n + (n === 1 ? ' change' : ' changes') + '</span></button>';
        if (sel) {
          h += '<div class="vd">' + HIST.slice(v.from, v.to + 1).map(function (e) {
            var gone = e.type === 'remove' && cur.filter(function (s) { return s.n === e.name && s.gone; }).length;
            return '<div>' + evText(e) + (gone ? '<button class="back" data-back="' + esc(e.name) + '">Put back</button>' : '') + '</div>'; }).join('') +
            '<button class="rest" data-restore="1">Restore this version</button></div>';
        }
      }
      $('mxVlist').innerHTML = h + (userEvents().length ? '' : '<p class="vempty">No changes yet. Every tick, added stylist and removed stylist will show up here.</p>');
    }
    function banner() {
      var b = $('mxVb');
      if (!VIEW) { b.className = 'mx-vbanner'; b.innerHTML = ''; return; }
      b.className = 'mx-vbanner show';
      b.innerHTML = '<span>Looking at the version from <b>' + esc(VIEW.at) + '</b>, by ' + esc(VIEW.who) + '. You cannot edit here.</span><span><button class="vb" data-vb="back">Back to current version</button><button class="vb go" data-vb="restore">Restore this version</button></span>';
    }
    function openVersion(vi) {
      var v = versions()[vi]; if (!v) return;
      if (!LIVE) LIVE = S;
      S = replay(v.to); VIEW = {vi: vi, from: v.from, to: v.to, who: v.who, at: v.at, show: $('mxShowChg').checked};
      setEditing(false); document.body.classList.add('mx-previewing'); banner(); drawHist(); branchChips(); table();
    }
    function closeVersion() {
      if (LIVE) { S = LIVE; LIVE = null; }
      VIEW = null; document.body.classList.remove('mx-previewing'); banner(); drawHist(); branchChips(); table();
    }
    function openDrawer(on) {
      drawer.classList.toggle('open', on); document.body.classList.toggle('mx-drawing', on);
      if (on) drawHist(); else if (VIEW) closeVersion();
    }
    function askRestore() {
      if (!VIEW) return;
      $('mxRBody').textContent = 'The checklist goes back to how it was on ' + VIEW.at + '. Everything since then stays in the version history, so you can go forward again.';
      $('mxRvm').classList.add('show');
    }
    async function doRestore() {
      if (!VIEW) return;
      var at = VIEW.at, snap = S.map(toSnap), before = LIVE.map(toSnap);
      closeVersion(); $('mxRvm').classList.remove('show');
      try { await rpc('matching_revert', {p_label: 'the version from ' + at, p_snap: snap}); } catch (e) { oops(e); return; }
      undoFn = async function () { try { await rpc('matching_revert', {p_label: 'the version before that restore', p_snap: before}); await refresh(); toast('Undone', false); } catch (e2) { oops(e2); } };
      await refresh(); toast('Restored the version from ' + at + '. Nothing was lost.', true);
    }
    function onCellMenu(e) {
      var c = e.target.closest('td.t'); if (!c || !EDITOR) return;
      e.preventDefault();
      var s = S[+c.parentNode.dataset.s], ci = c.cellIndex - 1, items = [];
      for (var i = (VIEW ? VIEW.to : HIST.length - 1); i >= 0; i--) { var h = HIST[i]; if (h.type === 'tick' && h.name === s.n && h.col === ci) items.push(h); }
      cpop.innerHTML = '<h5>Edit history</h5><p class="ct">' + esc(s.n) + ', ' + esc(L[ci]) + '</p>' + (items.length
        ? items.map(function (h) { return '<div class="ci"><span class="dot" style="background:' + (WHOC[h.who] || '#999') + '"></span><span><b>' + esc(h.who) + '</b> ' + (h.on ? 'ticked' : 'unticked') + ' it<br><small>' + esc(fmt(h.ts)) + '</small></span></div>'; }).join('')
        : '<p class="vempty" style="margin:4px 0">No changes to this box yet. It started from Belle’s matching sheet.</p>');
      cpop.classList.add('show');
      cpop.style.left = Math.min(e.clientX, innerWidth - 276) + 'px'; cpop.style.top = Math.max(8, Math.min(e.clientY, innerHeight - cpop.offsetHeight - 10)) + 'px';
    }

    /* ----- build the page ----- */
    main.innerHTML = '<div class="kb-shell kb-shell-wide">' + rail('grid') + '<div class="mx">' +
      '<div class="mx-mast"><div class="mx-frow"><span class="mx-flbl" id="mxBl">Branch</span><div class="mx-chipset" role="group" aria-labelledby="mxBl" id="mxBranch"></div></div></div>' +
      '<div class="mx-head"><div><p class="mx-eyebrow">Team Home · Clients</p><h1>Who does what</h1>' +
      '<p class="mx-lead">A tick means she does it, or it is her style. Click a heading to filter or sort. Click a name to open her card. Just need a name? <a href="/hub/find-stylist">Find a stylist for her</a>.</p></div>' +
      '<div class="mx-tools"><button class="mx-btn" id="mxHistBtn" hidden>History</button><button class="mx-btn edit" id="mxEditBtn" hidden>Edit ticks</button></div></div>' +
      '<div class="mx-vbanner" id="mxVb"></div>' +
      '<div class="mx-note" id="mxNote"><span><b>Editing.</b> Click a box to tick or untick it. It saves as you go, and everyone sees it straight away. Right-click a box to see who changed it.</span><span><button id="mxAddBtn">+ Add a stylist</button><button id="mxDone">Done</button></span></div>' +
      '<div class="mx-fbar" id="mxFbar"></div>' +
      '<div class="mx-wrap" id="mxWrap"><table id="mxTbl"></table></div>' +
      '<p class="mx-foot" id="mxLast"></p></div></div>';
    var layer = document.createElement('div');
    layer.innerHTML =
      '<aside class="mx-drawer" id="mxDrawer" aria-label="Version history"><div class="dh"><b>Version history</b><button id="mxHistClose" aria-label="Close">✕</button></div>' +
      '<p class="dsub">Click a version to look at it. Only Belle and Kate see this. Nothing is lost when you restore.</p>' +
      '<label class="chk"><input type="checkbox" id="mxShowChg" checked> Show changes <span class="lg"><i style="background:#C4B5FD"></i>Belle <i style="background:#5fd6bf"></i>Kate</span></label><div id="mxVlist"></div></aside>' +
      '<div class="mx-pop" id="mxPop" role="dialog" aria-label="Filter"></div><div class="mx-cpop" id="mxCpop" role="dialog" aria-label="Edit history of this box"></div>' +
      '<div class="mx-modal" id="mxDlg"><div class="box" role="dialog" aria-label="Add a stylist"><h3>Add a stylist</h3>' +
      '<label class="f">Name<input id="mxAName" type="text" placeholder="First name, as on her card" autocomplete="off"></label><label class="f">Salon<select id="mxABr"></select></label>' +
      '<label class="f">Level<select id="mxALv"></select></label><label class="f">Start with the same ticks as<select id="mxACopy"></select></label>' +
      '<p class="hint">Her photo and card link join by themselves once she is on the Meet the Team page.</p><p class="err" id="mxAErr"></p>' +
      '<div class="acts"><button id="mxACancel">Cancel</button><button class="go" id="mxAOk">Add stylist</button></div></div></div>' +
      '<div class="mx-modal" id="mxCfm"><div class="box" role="dialog" aria-label="Remove a stylist"><h3 id="mxCTitle">Remove from the checklist?</h3><p id="mxCBody" style="margin:0"></p>' +
      '<div class="acts"><button id="mxCCancel">Cancel</button><button class="danger" id="mxCOk">Remove</button></div></div></div>' +
      '<div class="mx-modal" id="mxRvm"><div class="box" role="dialog" aria-label="Restore this version"><h3>Restore this version?</h3><p id="mxRBody" style="margin:0"></p>' +
      '<div class="acts"><button id="mxRCancel">Cancel</button><button class="go" id="mxROk">Restore</button></div></div></div>' +
      '<div class="mx-toast" id="mxToast"><span id="mxToastTx"></span><button id="mxUndo">Undo</button></div>';
    while (layer.firstChild) document.body.appendChild(layer.firstChild);
    tbl = $('mxTbl'); wrapEl = $('mxWrap'); pop = $('mxPop'); cpop = $('mxCpop'); drawer = $('mxDrawer');

    $('mxBranch').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.b === 'ALL') PICK = {}; else { if (PICK[b.dataset.b]) delete PICK[b.dataset.b]; else PICK[b.dataset.b] = true; if (Object.keys(PICK).length === BR.length) PICK = {}; }
      clearHover(); closePop(); branchChips(); table();
    });
    tbl.addEventListener('click', function (e) {
      var ad = e.target.closest('[data-add]'); if (ad) { openAdd(ad.dataset.add); return; }
      var rv = e.target.closest('[data-rmv]'); if (rv) { askRemove(+rv.dataset.rmv); return; }
      var lb = e.target.closest('[data-c]');
      if (lb) { e.stopPropagation(); if (popKey === lb.dataset.c && pop.classList.contains('show')) { closePop(); return; } openPop(lb.dataset.c, lb); return; }
      var rm = e.target.closest('[data-rm]'); if (rm) { removeFilter(rm); return; }
      if (!editing) return;
      var c = e.target.closest('td.t'); if (!c) return;
      doTick(+c.parentNode.dataset.s, c.cellIndex - 1);
    });
    tbl.addEventListener('mouseover', onHover); tbl.addEventListener('contextmenu', onCellMenu);
    wrapEl.addEventListener('mouseleave', clearHover); wrapEl.addEventListener('scroll', closePop);
    pop.addEventListener('click', onPopClick);
    pop.addEventListener('input', function (e) {
      if (e.target.id !== 'mxPopSearch') return; var q = e.target.value.toLowerCase();
      pop.querySelectorAll('#mxPopList label').forEach(function (l) { l.style.display = l.dataset.n.indexOf(q) >= 0 ? '' : 'none'; });
    });
    $('mxFbar').addEventListener('click', function (e) { var rm = e.target.closest('[data-rm]'); if (rm) removeFilter(rm); });
    document.addEventListener('mousedown', function (e) {
      if (pop.classList.contains('show') && !pop.contains(e.target) && !e.target.closest('[data-c]')) closePop();
      if (!cpop.contains(e.target)) cpop.classList.remove('show');
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closePop(); cpop.classList.remove('show'); closeDlg(); } });
    $('mxEditBtn').addEventListener('click', function () { setEditing(!editing); });
    $('mxDone').addEventListener('click', function () { setEditing(false); });
    $('mxAddBtn').addEventListener('click', function () { openAdd(null); });
    $('mxAOk').addEventListener('click', addStylist); $('mxAName').addEventListener('keydown', function (e) { if (e.key === 'Enter') addStylist(); });
    $('mxACancel').addEventListener('click', closeDlg); $('mxCCancel').addEventListener('click', closeDlg); $('mxCOk').addEventListener('click', doRemove);
    $('mxRCancel').addEventListener('click', closeDlg); $('mxROk').addEventListener('click', doRestore);
    $('mxUndo').addEventListener('click', function () { if (!undoFn) return; var f = undoFn; undoFn = null; f(); });
    $('mxHistBtn').addEventListener('click', function () { openDrawer(!drawer.classList.contains('open')); });
    $('mxHistClose').addEventListener('click', function () { openDrawer(false); });
    $('mxShowChg').addEventListener('change', function () { if (VIEW) { VIEW.show = this.checked; table(); } });
    $('mxVlist').addEventListener('click', function (e) {
      var back = e.target.closest('[data-back]'); if (back) { putBack(back.dataset.back); return; }
      if (e.target.closest('[data-restore]')) { askRestore(); return; }
      var v = e.target.closest('[data-vi]'); if (!v) return;
      if (v.dataset.vi === 'cur') closeVersion(); else openVersion(+v.dataset.vi);
    });
    $('mxVb').addEventListener('click', function (e) { var b = e.target.closest('[data-vb]'); if (!b) return; if (b.dataset.vb === 'back') closeVersion(); else askRestore(); });

    // the editor-only buttons, once we know who this is
    $('mxEditBtn').hidden = !EDITOR; $('mxHistBtn').hidden = !EDITOR;
    branchChips(); table(); lastLine(); headerHeight();
    if (EDITOR) loadHist().then(function () { table(); drawHist(); }).catch(function () {});
    window.addEventListener('resize', headerHeight);
  }

  /* ============================================================ */
  KB.ready.then(async function () {
    if (KB.allowed.indexOf('client-matching') < 0) { notFound(); return; }
    try { await load(); } catch (e) { notFound(); return; }
    if (PAGE === 'find') findPage(); else gridPage();
    document.body.classList.remove('kb-wait');
  });
})();
