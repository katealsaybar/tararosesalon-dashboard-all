/* ============================================================
   Win + top tip (Kate, 30 Sep 2026, from Tara on the 30 Sep call)

   "Always start with the win. Top tip on how to close the gap for next month."
   Her example: rebooking's great, but you're only 56% booked; two more new
   clients a week over the next three months and you'd be full.

   The formula version. winGap(d) takes the perf_dashboard payload and returns
   { win, tip, how } as plain sentences. When an AI-written tip is saved for the
   month (perf_tips, see perf-tips edge function), the page and the email show
   that instead, and this is the fallback.

   No DOM and no page globals: the monthly email (apps-script/
   monthly-performance-email.gs) fetches this same file and runs it, so the
   email and the page can never say different things.
   ============================================================ */
(function (root) {
  var nf = function (v) { return Math.round(v).toLocaleString('en-GB'); };
  var aed = function (v) { return 'AED ' + nf(v); };
  var pct = function (v) { return (Math.round(v * 10) / 10) + '%'; };
  var num = function (v) { return v === null || v === undefined || isNaN(v) ? null : Number(v); };

  // Share of the month the numbers cover, and the working weeks in it, so a
  // mid-month page talks in full-month terms. Same idea as paceFactor() on the page.
  function span(d) {
    var n = d.numbers || {};
    var m1 = new Date(d.month + 'T00:00:00');
    var days = new Date(m1.getFullYear(), m1.getMonth() + 1, 0).getDate();
    var sd = n.start_date ? new Date(n.start_date + 'T00:00:00') : null;
    var from = sd && sd.getFullYear() === m1.getFullYear() && sd.getMonth() === m1.getMonth() ? sd.getDate() : 1;
    var last = n.last_date ? new Date(n.last_date + 'T00:00:00') : null;
    var pace = !last || last.getMonth() !== m1.getMonth() ? 1
      : Math.min(1, (last.getDate() - from + 1) / (days - from + 1));
    return { pace: pace || 1, weeks: (days - from + 1) / 7 };
  }

  // ── the win ─────────────────────────────────────────────────────────────
  // The number furthest above its aim, Money Five first. If nothing is at its
  // aim yet, the biggest rise on last month. There is always something.
  // Request rate is second tier: its aims are low, so it would win for almost every senior.
  var WIN_FIRST = ['rebooking_pct', 'avg_bill', 'treatments_pct', 'retail_pct', 'column_fill_pct', 'clients', 'total_revenue'];
  var WIN_THEN = ['request_pct', 'retention_pct', 'conversion_pct', 'colour_pct', 'reputation', 'google_reviews', 'ncr'];
  var SUMS = { clients: 1, total_revenue: 1, google_reviews: 1, ncr: 1 };

  function winLine(k, n, v, t, mid) {
    switch (k) {
      case 'rebooking_pct': return n.rebooked + ' of your ' + n.clients + ' clients booked their next visit before they left. That is ' + pct(v) + ' against an aim of ' + pct(t) + ', and it is how a column fills itself.';
      case 'avg_bill': return 'Your average bill is ' + aed(v) + ', above your aim of ' + aed(t) + '. Your clients trust you with the full service.';
      case 'treatments_pct': return 'Treatments are ' + pct(v) + ' of your hair services, above your aim of ' + pct(t) + '. You are looking after the hair, not only the look.';
      case 'retail_pct': return 'Retail is ' + pct(v) + ' of your services, at or above your aim of ' + pct(t) + '. Your clients are going home with what they need.';
      case 'column_fill_pct': return v >= 100 ? 'Your column was full this month. Every hour you had, a client had it.' : 'You were ' + pct(v) + ' booked, above your aim of ' + pct(t) + '.';
      case 'clients': return (mid ? 'You are on pace for ' + nf(v) : 'You saw ' + nf(v)) + ' clients this month, above your aim of ' + nf(t) + '.';
      case 'request_pct': return pct(v) + ' of your clients asked for you by name, above your aim of ' + pct(t) + '. People come back for you.';
      case 'total_revenue': return (mid ? 'You are on pace for ' : 'You took ') + aed(v) + ' in services this month, above your aim of ' + aed(t) + '.';
      case 'retention_pct': return pct(v) + ' of your regulars keep coming back to you, above your aim of ' + pct(t) + '.';
      case 'conversion_pct': return pct(v) + ' of your new clients came back for a second visit, above your aim of ' + pct(t) + '.';
      case 'colour_pct': return pct(v) + ' of your clients had colour with you, above your aim of ' + pct(t) + '.';
      case 'reputation': return 'Your Google reviews average ' + (Math.round(v * 10) / 10).toFixed(1) + ' stars, above your aim of ' + t + '.';
      case 'google_reviews': return nf(v) + ' Google reviews named you this month, above your aim of ' + nf(t) + '.';
      case 'ncr': return nf(v) + ' new clients asked for you by name, above your aim of ' + nf(t) + '.';
    }
  }
  // [key, how to say it, format, adds up over the month]
  var RISE = [
    ['total_revenue', function (now, was, mid) { return (mid ? 'You are on pace for ' : 'You took ') + aed(now) + ' in services, up from ' + aed(was) + ' last month.'; }, true],
    ['clients', function (now, was, mid) { return (mid ? 'You are on pace for ' : 'You saw ') + nf(now) + ' clients, up from ' + nf(was) + ' last month.'; }, true],
    ['rebooking_pct', function (now, was) { return 'Your rebooking is ' + pct(now) + ', up from ' + pct(was) + ' last month.'; }],
    ['avg_bill', function (now, was) { return 'Your average bill is ' + aed(now) + ', up from ' + aed(was) + ' last month.'; }],
    ['request_pct', function (now, was) { return pct(now) + ' of your clients asked for you by name, up from ' + pct(was) + ' last month.'; }],
    ['treatments_pct', function (now, was) { return 'Treatments are ' + pct(now) + ' of your hair services, up from ' + pct(was) + ' last month.'; }],
  ];

  function win(d, sp) {
    var n = d.numbers || {}, b = d.benchmarks || {}, mid = sp.pace < 1;
    var pick = function (keys) {
      var best = null;
      keys.forEach(function (k) {
        var v = num(n[k]), t = b[k] && num(b[k].target);
        if (v === null || !t) return;
        if (k === 'rebooking_pct' && !(n.clients > 0)) return;
        if (k === 'reputation' && !(n.reputation_n >= 3)) return;
        var jv = SUMS[k] && mid ? v / sp.pace : v;
        if (jv < t) return;
        var r = jv / t;
        if (!best || r > best.r) best = { k: k, r: r, v: jv, t: t };
      });
      return best;
    };
    var best = pick(WIN_FIRST) || pick(WIN_THEN);
    if (best) return winLine(best.k, n, best.v, best.t, mid);

    // Nothing at its aim yet: the biggest rise on last month.
    var prev = (d.history || []).slice(-1)[0];
    var p = prev && prev.numbers;
    if (p) {
      var rise = null;
      RISE.forEach(function (x) {
        var v = num(n[x[0]]), was = num(p[x[0]]);
        if (v === null || !was) return;
        var now = x[2] && mid ? v / sp.pace : v;
        var r = now / was;
        if (r > 1.03 && (!rise || r > rise.r)) rise = { r: r, now: now, was: was, x: x };
      });
      if (rise) return rise.x[1](rise.now, rise.was, mid) + ' Keep that going.';
    }
    if (n.clients > 0) return (mid ? 'You have looked after ' : 'You looked after ') + nf(n.clients) + ' clients this month' + (n.req > 0 ? ', and ' + nf(n.req) + ' of them asked for you by name' : '') + '.';
    return null;
  }

  // ── the top tip ─────────────────────────────────────────────────────────
  // Every gap is turned into what it is worth a month, and the biggest one is
  // the tip, said as something to do each week.
  function tip(d, sp) {
    var n = d.numbers || {}, b = d.benchmarks || {}, s = d.staff || {};
    var P = sp.pace, W = sp.weeks;
    var full = function (v) { return (num(v) || 0) / P; };   // the whole month, even mid-month
    var clients = full(n.clients), bill = num(n.avg_bill) || 0, opts = [];
    var aim = function (k, dflt) { return b[k] && num(b[k].target) !== null ? num(b[k].target) : dflt; };

    // Column fill: the hours still open, filled at her own hours per client.
    var fillAim = aim('column_fill_pct', 80), fill = num(n.column_fill_pct);
    var avail = full(n.available_hours), booked = full(n.booked_hours);
    if (fill !== null && fill < fillAim && booked > 0 && clients > 0 && bill > 0) {
      var perClient = booked / clients;
      var more = (fillAim / 100 * avail - booked) / perClient;   // clients a month
      var perWeek = more / W;
      if (more >= 1) {
        var step = perWeek > 3 ? Math.max(2, Math.ceil(perWeek / 3)) : Math.max(1, Math.round(perWeek));
        opts.push({ aed: more * bill,
          tip: perWeek > 3
            ? 'You are ' + pct(fill) + ' booked. Add ' + step + ' more clients a week this month, and keep building each month: in about three months that takes you to ' + pct(fillAim) + ', worth about ' + aed(more * bill) + ' more a month.'
            : 'You are ' + pct(fill) + ' booked. ' + step + ' more ' + (step === 1 ? 'client' : 'clients') + ' a week takes you to ' + pct(fillAim) + ', worth about ' + aed(more * bill) + ' more a month.',
          how: 'Ask your happy clients to send a friend, post your work tagging @tararosesalon, and tell reception you have space.' });
      }
    }
    // Rebooking: clients who leave without their next visit booked.
    var rbAim = aim('rebooking_pct', 50), rb = num(n.rebooking_pct);
    if (rb !== null && rb < rbAim && clients > 0 && bill > 0) {
      var extra = (rbAim - rb) / 100 * clients;
      var rw = extra / W, rstep = rw > 4 ? Math.ceil(rw / 3) : Math.max(1, Math.round(rw));
      if (extra >= 1) opts.push({ aed: extra * bill,
        tip: rw > 4
          ? 'Your rebooking is ' + pct(rb) + '. Rebook ' + rstep + ' more clients a week before they leave, and add to it each month: in about three months that takes you to ' + pct(rbAim) + ', worth about ' + aed(extra * bill) + ' a month in visits already in the book.'
          : 'Rebook ' + rstep + ' more ' + (rstep > 1 ? 'clients' : 'client') + ' a week before they leave. That takes your rebooking from ' + pct(rb) + ' to ' + pct(rbAim) + ', worth about ' + aed(extra * bill) + ' a month in visits already in the book.',
        how: s.dept === 'Hair' ? 'Before they get up from the chair, suggest the date their hair will need you next and book it with them.' : 'Before they leave, suggest when their next treatment is due and book it with them.' });
    }
    // Retail: a share of her services.
    var rtAim = aim('retail_pct', 12), sales = full(n.total_revenue), retail = full(n.retail);
    if (sales > 0) {
      var rgap = rtAim / 100 * sales - retail;
      if (rgap > 200) opts.push({ aed: rgap,
        tip: 'Retail is ' + pct(num(n.retail_pct) || 0) + ' of your services. About ' + aed(rgap / W) + ' more a week takes you to ' + pct(rtAim) + ', worth ' + aed(rgap) + ' a month.',
        how: 'Recommend the one product you used on them today, and put it in their hand before they pay.' });
    }
    // Treatments: hair team only, a share of hair services.
    var trAim = aim('treatments_pct', 20), hair = full(n.hair_services), treat = full(n.treatments);
    if (s.dept === 'Hair' && hair > 0) {
      var tgap = trAim / 100 * hair - treat;
      if (tgap > 200) opts.push({ aed: tgap,
        tip: 'Treatments are ' + pct(num(n.treatments_pct) || 0) + ' of your hair services. About ' + aed(tgap / W) + ' more a week takes you to ' + pct(trAim) + ', worth ' + aed(tgap) + ' a month.',
        how: 'Offer a treatment with every colour and every blow-dry, and tell them what it will do for their hair.' });
    }
    // Average bill: what each visit is worth.
    var abAim = b.avg_bill && num(b.avg_bill.target);
    if (abAim && bill > 0 && bill < abAim && clients > 0) opts.push({ aed: (abAim - bill) * clients,
      tip: 'Your average bill is ' + aed(bill) + '. Lifting it to ' + aed(abAim) + ' is worth about ' + aed((abAim - bill) * clients) + ' a month.',
      how: 'In the consultation, talk through the full service their hair needs, not only what they asked for.' });

    opts.sort(function (a, c) { return c.aed - a.aed; });
    return opts[0] && opts[0].aed >= 300 ? opts[0] : null;
  }

  function winGap(d) {
    if (!d || !d.numbers) return null;
    var sp = span(d);
    var t = tip(d, sp);
    return {
      win: win(d, sp),
      tip: t ? t.tip : 'Nothing standing out right now. You are hitting the aims set for your level, so keep doing exactly what you are doing.',
      how: t ? t.how : null,
      source: 'formula',
    };
  }

  root.winGap = winGap;
})(typeof window !== 'undefined' ? window : this);
