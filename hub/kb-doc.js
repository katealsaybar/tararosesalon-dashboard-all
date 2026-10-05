/* ============================================================
   TARA ROSE SALONS: Team Home, one SOP as one document (Kate, 5 Oct 2026)
   kb-doc.js: KBDoc.clean() tidies a page's stored HTML into the house document
   (TRS Standard v1: Playfair Display + Inter, paper, ink and turquoise), and
   KBDoc.pdf() turns one page, or a whole section, into a real PDF file with
   selectable text in the same type and colours.

   No more Workbook | Text: the workbook pictures in old page bodies are dropped
   here, so a page reads the same on screen and on paper. Holds no page text
   (this repository is public); everything comes from kb_pages once signed in.
   ============================================================ */
(function () {
  var KBDoc = window.KBDoc = {};

  // ── Words that keep their capitals when shouty text becomes sentence case ──
  var KEEP = ['Tara Rose', 'Tara', 'TRS', 'UAE', 'VIP', 'LVL', 'SOP', 'SOPs', 'HR', 'ID', 'PPE', 'SPF', 'UV', 'LED', 'OPI', 'CND',
    'MOHRE', 'ILOE', 'WhatsApp', 'Instagram', 'Google', 'Facebook', 'Phorest', 'Olaplex', 'K18', 'Abu Dhabi', 'Dubai', 'Saadiyat',
    'Khalifa City A', 'Motor City', 'Al Quoz', 'Hydrafacial', 'Hydrafacials', 'I'];
  function sentence(t) {
    t = t.toLowerCase().replace(/(^|[.!?]\s+|\(\s*)([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); });
    KEEP.forEach(function (w) {
      t = t.replace(new RegExp('(^|[^A-Za-z])' + w.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=$|[^A-Za-z])', 'gi'),
        function (m, a) { return a + w; });
    });
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  function shouty(t) {
    var letters = t.replace(/[^A-Za-z]/g, '');
    return letters.length >= 4 && letters === letters.toUpperCase();
  }
  KBDoc.sentence = sentence;

  // Lower-case "i" and a quote that opens in lower case, left by the workbook's
  // all-capitals styling once it was taken off.
  function fixText(root) {
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), n;
    while ((n = w.nextNode())) {
      n.nodeValue = n.nodeValue
        .replace(/(^|[\s"“‘(])i(?=[\s’',!?]|$)/g, '$1I')
        .replace(/^(\s*["“‘])([a-z])/, function (m, a, b) { return a + b.toUpperCase(); });
    }
  }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function txt(e) { return (e.textContent || '').replace(/\s+/g, ' ').trim(); }
  function only(e, sel) {   // e holds nothing but elements matching sel (and whitespace)
    var kids = [].slice.call(e.childNodes).filter(function (c) { return !(c.nodeType === 3 && !c.nodeValue.trim()); });
    return kids.length > 0 && kids.every(function (c) { return c.nodeType === 1 && c.matches(sel); });
  }

  // ── Stored page HTML → the house document ──────────────────────────────
  KBDoc.clean = function (html) {
    var t = document.createElement('template');
    t.innerHTML = html || '';
    var root = t.content;
    root.querySelectorAll('.kb-sheets').forEach(function (x) { x.remove(); });
    root.querySelectorAll('.kb-text').forEach(function (x) { x.replaceWith.apply(x, [].slice.call(x.childNodes)); });

    var kids = [].slice.call(root.children);
    kids.forEach(function (e) {
      var s = txt(e), tag = e.tagName;
      if (!e.parentNode) return;
      // Workbook furniture: "N O T E S" boxes, page markers, the step numbers of a drawn diagram.
      if (/^([A-Z]\s){2,}[A-Z]$/.test(s)) {
        var word = s.replace(/\s/g, '');
        if (word === 'NOTES') e.remove(); else e.replaceWith(el('h4', null, sentence(word)));
        return;
      }
      if (tag === 'P' && (/^more info \d+$/i.test(s) || /^\d{1,2}$/.test(s) || !s && !e.querySelector('img'))) { e.remove(); return; }
      if (tag === 'H4') { e.textContent = s.replace(/^[-–•]\s*/, '').replace(/:$/, ''); s = txt(e); }
      if (shouty(s) && /^(P|H3|H4)$/.test(tag)) e.textContent = sentence(s);
    });
    // "<p><strong>Procedure:</strong></p>" is a subheading.
    root.querySelectorAll('p').forEach(function (p) {
      if (only(p, 'strong,b') && txt(p).length < 90) {
        var h = el('h4'); h.textContent = txt(p).replace(/:$/, ''); p.replaceWith(h);
      }
    });
    root.querySelectorAll('h4:empty').forEach(function (h) { h.remove(); });
    root.querySelectorAll('li').forEach(function (li) { var s = txt(li); if (shouty(s)) { li.textContent = sentence(s); li.setAttribute('data-caps', ''); } });

    // A one-item list holding a short capitals label ("IMPORTANCE OF TRUST") is a subheading.
    [].slice.call(root.querySelectorAll('ul')).forEach(function (ul) {
      var li = ul.children.length === 1 && ul.firstElementChild;
      if (!li || !li.hasAttribute('data-caps') || li.children.length) return;
      var s = txt(li);
      if (s.split(' ').length > 5 || /\?$/.test(s)) return;
      var h = el('h4'); h.textContent = s.replace(/:$/, ''); ul.replaceWith(h);
    });
    // A capitals question the workbook wrapped onto a second line: the second line came
    // through as its own paragraph. Join it back on.
    [].slice.call(root.querySelectorAll('ul')).forEach(function (ul) {
      var li = ul.lastElementChild, nx = ul.nextElementSibling;
      if (!li || !li.hasAttribute('data-caps') || !nx || nx.tagName !== 'P') return;
      var a = txt(li), b = txt(nx);
      if (/[?.!:)]$/.test(a) || b.length > 120 || /^["“]/.test(b)) return;
      li.textContent = sentence(a + ' ' + b);
      nx.remove();
    });
    // One-item lists one after another are one list.
    [].slice.call(root.querySelectorAll('ul + ul, ol + ol')).forEach(function (u) {
      var prev = u.previousElementSibling;
      if (prev && prev.tagName === u.tagName && u.parentNode) { while (u.firstChild) prev.appendChild(u.firstChild); u.remove(); }
    });
    // A heading straight after a heading: the first is the label over the second.
    [].slice.call(root.querySelectorAll('h3 + h3')).forEach(function (h) {
      var a = h.previousElementSibling;
      if (a && a.tagName === 'H3') { var k = el('p', 'kd-kicker'); k.textContent = txt(a); a.replaceWith(k); }
    });
    // Numbered paragraphs ("1. Wash the tools…") become a numbered list.
    var ps = [].slice.call(root.querySelectorAll('p'));
    for (var i = 0; i < ps.length; i++) {
      var m = /^(\d{1,2})\.\s+/.exec(txt(ps[i]));
      if (!m || !ps[i].parentNode) continue;
      var ol = el('ol'), start = +m[1], cur = ps[i], n = start;
      if (start !== 1) { ol.setAttribute('start', start); ol.style.counterReset = 'kd ' + (start - 1); }
      cur.before(ol);
      while (cur && cur.tagName === 'P' && new RegExp('^' + n + '\\.\\s+').test(txt(cur))) {
        var li = el('li', null, cur.innerHTML.replace(/^\s*\d{1,2}\.\s+/, ''));
        var next = cur.nextElementSibling;
        ol.appendChild(li); cur.remove(); cur = next; n++;
      }
    }
    // Lines the team says out loud: a quoted paragraph is a script card.
    root.querySelectorAll('p').forEach(function (p) {
      var s = txt(p);
      if (/^["“]/.test(s) && /["”]$/.test(s) && s.length > 30) {
        var q = el('blockquote', 'kd-say'); q.innerHTML = p.innerHTML; p.replaceWith(q);
      }
    });
    // Photos: a paragraph of pictures is a photo grid, one picture a figure.
    root.querySelectorAll('p').forEach(function (p) {
      if (!only(p, 'img')) return;
      var imgs = p.querySelectorAll('img');
      var box = el('div', imgs.length > 1 ? 'kd-photos' : 'kd-fig');
      imgs.forEach(function (im) { im.removeAttribute('style'); box.appendChild(im); });
      p.replaceWith(box);
    });
    root.querySelectorAll('table').forEach(function (tb) {
      if (tb.parentNode && tb.parentNode.classList && tb.parentNode.classList.contains('kd-table')) return;
      var w = el('div', 'kd-table'); tb.before(w); w.appendChild(tb);
    });
    root.querySelectorAll('ol[start]').forEach(function (o) { var n = +o.getAttribute('start'); if (n > 1) o.style.counterReset = 'kd ' + (n - 1); });
    root.querySelectorAll('[data-caps]').forEach(function (x) { x.removeAttribute('data-caps'); });
    fixText(root);
    var out = document.createElement('div');
    out.appendChild(root.cloneNode(true));
    return out.innerHTML;
  };

  // ── PDF ────────────────────────────────────────────────────────────────
  // pdfmake, loaded only when someone asks for a PDF, with the brand's own two
  // typefaces (static cuts in /assets/fonts/pdf, Latin only, about 240 KB).
  var C = { paper: '#FAF8F4', cream: '#F1ECE3', stone: '#E7E2D8', ink: '#2D2E37', soft: '#74747B',
    accent: '#99F6E4', accentDeep: '#7DE6D2', accentText: '#3aa892', lime: '#EEF3C7', hair: '#E2DDD3' };
  var FONTS = { 'Inter-Regular.ttf': 1, 'Inter-SemiBold.ttf': 1, 'Inter-Italic.ttf': 1, 'Inter-SemiBoldItalic.ttf': 1,
    'PlayfairDisplay-Medium.ttf': 1, 'PlayfairDisplay-MediumItalic.ttf': 1 };
  var libReady = null;
  function b64(buf) {
    var s = '', a = new Uint8Array(buf), k = 0x8000;
    for (var i = 0; i < a.length; i += k) s += String.fromCharCode.apply(null, a.subarray(i, i + k));
    return btoa(s);
  }
  function loadLib() {
    if (libReady) return libReady;
    libReady = new Promise(function (res, rej) {
      if (window.pdfMake) return res();
      var s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.12/pdfmake.min.js';
      s.onload = res; s.onerror = function () { libReady = null; rej(new Error('The PDF maker did not load. Check the connection and try again.')); };
      document.head.appendChild(s);
    }).then(function () {
      return Promise.all(Object.keys(FONTS).map(function (f) {
        return fetch('/assets/fonts/pdf/' + f).then(function (r) { if (!r.ok) throw new Error(f); return r.arrayBuffer(); })
          .then(function (buf) { return [f, b64(buf)]; });
      }).concat([fetch('/assets/mast-ink.png').then(function (r) { return r.arrayBuffer(); })
        .then(function (buf) { return ['__logo', 'data:image/png;base64,' + b64(buf)]; })]));
    }).then(function (files) {
      pdfMake.vfs = pdfMake.vfs || {};
      files.forEach(function (f) { if (f[0] === '__logo') KBDoc._logo = f[1]; else pdfMake.vfs[f[0]] = f[1]; });
      pdfMake.fonts = {
        Inter: { normal: 'Inter-Regular.ttf', bold: 'Inter-SemiBold.ttf', italics: 'Inter-Italic.ttf', bolditalics: 'Inter-SemiBoldItalic.ttf' },
        Playfair: { normal: 'PlayfairDisplay-Medium.ttf', bold: 'PlayfairDisplay-Medium.ttf',
          italics: 'PlayfairDisplay-MediumItalic.ttf', bolditalics: 'PlayfairDisplay-MediumItalic.ttf' }
      };
    }, function (e) { libReady = null; throw e; });
    return libReady;
  }

  // Inline runs: text with bold / italic kept.
  function runs(node, st) {
    st = st || {};
    var out = [];
    node.childNodes.forEach(function (c) {
      if (c.nodeType === 3) {
        var v = c.nodeValue.replace(/\s+/g, ' ');
        if (v) out.push(Object.assign({ text: v }, st));
      } else if (c.nodeType === 1) {
        var t = c.tagName, s2 = Object.assign({}, st);
        if (t === 'STRONG' || t === 'B') s2.bold = true;
        if (t === 'EM' || t === 'I') s2.italics = true;
        if (t === 'BR') { out.push({ text: '\n' }); return; }
        if (t === 'IMG' || t === 'UL' || t === 'OL') return;
        out = out.concat(runs(c, s2));
      }
    });
    if (out.length) { out[0].text = out[0].text.replace(/^\s+/, ''); out[out.length - 1].text = out[out.length - 1].text.replace(/\s+$/, ''); }
    return out;
  }
  function imgOK(src) { return /^data:image\/(jpe?g|png);base64,/i.test(src || ''); }

  function numbered(n, content) {
    return {
      columns: [
        { width: 18, stack: [
          { canvas: [{ type: 'ellipse', x: 8.5, y: 8.5, r1: 8.5, r2: 8.5, color: C.accent }] },
          { text: String(n), fontSize: 8, bold: true, color: C.ink, alignment: 'center', width: 17, margin: [0, -13.2, 0, 0] }
        ] },
        { width: '*', stack: content }
      ],
      columnGap: 9, margin: [0, 1, 0, 7]
    };
  }

  function blocks(container) {
    var out = [], kicker = null;
    [].slice.call(container.children).forEach(function (e) {
      var t = e.tagName, s = txt(e);
      if (kicker && t !== 'H3') { out.push(kicker); kicker = null; }
      if (t === 'H3') {
        // a label over a heading sits where the turquoise bar would be
        out.push({ stack: [
          kicker ? { text: kicker.text, fontSize: 7.5, characterSpacing: 1.6, color: C.soft, margin: [0, 0, 0, 4] }
            : { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 26, y2: 0, lineWidth: 2.4, lineColor: C.accentDeep }], margin: [0, 0, 0, 7] },
          { text: s, font: 'Playfair', fontSize: 16, color: C.ink, lineHeight: 1.15 }
        ], margin: [0, 16, 0, 6], headlineLevel: 1 });
        kicker = null;
      } else if (t === 'H4') {
        out.push({ text: s, bold: true, fontSize: 10.5, color: C.ink, margin: [0, 9, 0, 3], headlineLevel: 1 });
      } else if (e.classList.contains('kd-kicker')) {
        kicker = { text: s.toUpperCase(), fontSize: 7.5, characterSpacing: 1.6, color: C.soft, margin: [0, 16, 0, 4], headlineLevel: 1 };
      } else if (t === 'P') {
        out.push({ text: runs(e), margin: [0, 0, 0, 7] });
      } else if (t === 'BLOCKQUOTE') {
        out.push({
          table: { widths: ['*'], body: [[{ stack: [
            { text: 'SAY IT LIKE THIS', fontSize: 7, characterSpacing: 1.6, color: C.accentText, bold: true, margin: [0, 0, 0, 4] },
            { text: runs(e), font: 'Playfair', italics: true, fontSize: 11.5, lineHeight: 1.3, color: C.ink }
          ] }]] },
          layout: { fillColor: function () { return C.cream; }, hLineWidth: function () { return 0; },
            vLineWidth: function (i) { return i === 0 ? 3 : 0; }, vLineColor: function () { return C.accentDeep; },
            paddingLeft: function () { return 14; }, paddingRight: function () { return 14; },
            paddingTop: function () { return 10; }, paddingBottom: function () { return 11; } },
          margin: [0, 3, 0, 10], unbreakable: s.length < 600
        });
      } else if (t === 'UL') {
        out.push({ ul: [].slice.call(e.children).map(function (li) {
          var nest = li.querySelector('ul,ol'), r = { text: runs(li), margin: [0, 0, 0, 3] };
          return nest ? { stack: [r].concat(blocks({ children: [nest] })) } : r;
        }), markerColor: C.accentText, margin: [4, 0, 0, 8] });
      } else if (t === 'OL') {
        var n = +(e.getAttribute('start') || 1);
        [].slice.call(e.children).forEach(function (li) {
          var nest = li.querySelector('ul,ol'), body = [{ text: runs(li) }];
          if (nest) body = body.concat(blocks({ children: [nest] }));
          out.push(numbered(n++, body));
        });
        out.push({ text: '', margin: [0, 0, 0, 4] });
      } else if (e.classList.contains('kd-table') || t === 'TABLE') {
        var tb = t === 'TABLE' ? e : e.querySelector('table');
        var rows = [].slice.call(tb.querySelectorAll('tr')).map(function (tr) {
          return [].slice.call(tr.children).map(function (c) {
            var th = c.tagName === 'TH';
            return { text: runs(c), bold: th, fillColor: th ? C.cream : null, fontSize: 9.5, colSpan: +(c.getAttribute('colspan') || 1) };
          });
        }).filter(function (r) { return r.length; });
        if (!rows.length) return;
        var cols = Math.max.apply(null, rows.map(function (r) { return r.reduce(function (a, c) { return a + c.colSpan; }, 0); }));
        rows = rows.map(function (r) {
          var full = [];
          r.forEach(function (c) { full.push(c); for (var k = 1; k < c.colSpan; k++) full.push({}); });
          while (full.length < cols) full.push({ text: '' });
          return full;
        });
        var rowHead = rows.every(function (r) { return r[0].bold; }) && cols === 2;
        out.push({
          table: { headerRows: !rowHead && rows[0].every(function (c) { return c.bold || !c.text; }) ? 1 : 0,
            widths: rowHead ? [130, '*'] : rows[0].map(function () { return '*'; }), body: rows, dontBreakRows: true },
          layout: { hLineWidth: function () { return 0.6; }, vLineWidth: function () { return 0.6; },
            hLineColor: function () { return C.hair; }, vLineColor: function () { return C.hair; },
            paddingLeft: function () { return 7; }, paddingRight: function () { return 7; },
            paddingTop: function () { return 5; }, paddingBottom: function () { return 5; } },
          margin: [0, 2, 0, 12]
        });
      } else if (e.classList.contains('kd-photos') || e.classList.contains('kd-fig')) {
        var srcs = [].slice.call(e.querySelectorAll('img')).map(function (im) { return im.getAttribute('src'); }).filter(imgOK);
        if (!srcs.length) return;
        if (srcs.length === 1) { out.push({ image: srcs[0], fit: [300, 300], margin: [0, 4, 0, 12] }); return; }
        for (var k = 0; k < srcs.length; k += 2) {
          out.push({ columns: [srcs[k], srcs[k + 1]].map(function (sr) {
            return sr ? { image: sr, fit: [235, 235] } : { text: '' };
          }), columnGap: 12, margin: [0, 4, 0, 8], unbreakable: true });
        }
      } else if (t === 'DIV' || t === 'SECTION') {
        out = out.concat(blocks(e));
      } else if (s) {
        out.push({ text: s, margin: [0, 0, 0, 7] });
      }
    });
    if (kicker) out.push(kicker);
    return out;
  }

  function noteBox(note) {
    return {
      table: { widths: ['*'], body: [[{ stack: [
        { text: 'BEING CONFIRMED', fontSize: 7, characterSpacing: 1.6, bold: true, color: C.ink, margin: [0, 0, 0, 3] },
        { text: note, fontSize: 9.5, color: C.ink }
      ] }]] },
      layout: { fillColor: function () { return C.lime; }, hLineWidth: function () { return 0; }, vLineWidth: function () { return 0; },
        paddingLeft: function () { return 12; }, paddingRight: function () { return 12; },
        paddingTop: function () { return 9; }, paddingBottom: function () { return 10; } },
      margin: [0, 0, 0, 14]
    };
  }

  function chapterHead(pg, first) {
    var head = [];
    if (first) head.push({ image: KBDoc._logo, width: 118, margin: [0, 0, 0, 26] });
    head.push({ text: (pg.eyebrow || '').toUpperCase(), fontSize: 7.5, characterSpacing: 1.8, color: C.soft, margin: [0, 0, 0, 6] });
    head.push({ text: pg.title, font: 'Playfair', fontSize: 25, lineHeight: 1.08, color: C.ink, margin: [0, 0, 0, 6],
      tocItem: !!pg.toc, tocStyle: { fontSize: 10.5 }, tocMargin: [0, 3, 0, 3] });
    if (pg.meta) head.push({ text: pg.meta, fontSize: 8.5, color: C.soft, margin: [0, 0, 0, 10] });
    head.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 483, y2: 0, lineWidth: 0.6, lineColor: C.hair },
      { type: 'line', x1: 0, y1: 0, x2: 54, y2: 0, lineWidth: 2.4, lineColor: C.accentDeep }], margin: [0, 2, 0, 16] });
    if (pg.note) pg.note.split('\n').forEach(function (n) { if (n.trim()) head.push(noteBox(n.trim())); });
    return head;
  }

  // pages: [{ title, eyebrow, meta, note, html }]; opts: { filename, book: { title, sub } }
  KBDoc.pdf = function (pages, opts) {
    opts = opts || {};
    return loadLib().then(function () {
      var content = [];
      if (opts.book) {
        content.push(
          { image: KBDoc._logo, width: 150, margin: [0, 150, 0, 54] },
          { text: 'TEAM HOME, FOR THE TEAM ONLY', fontSize: 8, characterSpacing: 2, color: C.soft, margin: [0, 0, 0, 12] },
          { text: opts.book.title, font: 'Playfair', fontSize: 38, lineHeight: 1.05, color: C.ink, margin: [0, 0, 0, 14] },
          { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 72, y2: 0, lineWidth: 3, lineColor: C.accentDeep }], margin: [0, 0, 0, 14] },
          { text: opts.book.sub || '', fontSize: 10.5, color: C.soft },
          { toc: { title: { text: 'Contents', font: 'Playfair', fontSize: 20, color: C.ink, margin: [0, 0, 0, 14] },
            numberStyle: { color: C.soft } }, pageBreak: 'before' }
        );
      }
      pages.forEach(function (pg, i) {
        var box = document.createElement('div');
        box.innerHTML = KBDoc.clean(pg.html);
        var head = chapterHead(Object.assign({ toc: !!opts.book }, pg), !opts.book && i === 0);
        content.push({ stack: head.concat(blocks(box)), pageBreak: opts.book || i ? 'before' : undefined });
      });
      var footLeft = opts.footer || 'For the Tara Rose Salons team only';
      var dd = {
        pageSize: 'A4',
        pageMargins: [56, 58, 56, 60],
        info: { title: opts.book ? opts.book.title : (pages[0] && pages[0].title) || 'Team Home', author: 'Tara Rose Salons', creator: 'Team Home' },
        background: function () { return { canvas: [{ type: 'rect', x: 0, y: 0, w: 595.28, h: 841.89, color: C.paper }] }; },
        header: function (cur) {
          if (cur === 1) return null;
          return { columns: [
            { text: 'TARA ROSE SALONS', fontSize: 7, characterSpacing: 2, color: C.soft },
            { text: (opts.running || '').toUpperCase(), fontSize: 7, characterSpacing: 1.4, color: C.soft, alignment: 'right' }
          ], margin: [56, 28, 56, 0] };
        },
        footer: function (cur, total) {
          return { columns: [
            { text: footLeft, fontSize: 7.5, color: C.soft },
            { text: cur + ' / ' + total, fontSize: 7.5, color: C.soft, alignment: 'right' }
          ], margin: [56, 24, 56, 0] };
        },
        content: content,
        defaultStyle: { font: 'Inter', fontSize: 10, lineHeight: 1.38, color: C.ink },
        pageBreakBefore: function (node, after) {
          return node.headlineLevel === 1 && after.length === 0;
        }
      };
      return new Promise(function (res) {
        pdfMake.createPdf(dd).getBlob(function (blob) {
          var a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = opts.filename || 'Tara Rose SOP.pdf';
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function () { URL.revokeObjectURL(a.href); }, 30000);
          res(blob);
        });
      });
    });
  };

  KBDoc.filename = function (s) {
    return ('Tara Rose · ' + s).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() + '.pdf';
  };
})();
