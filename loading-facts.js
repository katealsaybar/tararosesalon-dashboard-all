// Loading screen lines (Kate, 16 Oct 2026: "a trivia, or something witty, aligned with the branding").
// One line shows under "Loading your dashboard" while the first page is drawn, and the next
// one takes over if the wait runs past six seconds. Picked at random, never the same one
// twice running on a device. Loaded from index.html right under the loader (tiny, and cached after the first visit): if it is missing,
// the loader simply shows without a line.
//
// Edit the list here, nothing else needs to change. House rules for every line (they are the
// brand doctrine, run /brand-review on any new one before it goes live): British English, no
// em dashes, no exclamation marks, no banned words (problem, physics, premium, luxury,
// transformation, guarantee, discount, pampering), beauty-world analogies only, and a fact
// has to be one we would say at the chair. Doctrine anchors are verbatim and stay that way.
(function () {
  var LINES = [
    // The hair, plainly
    'Hair is mostly keratin, the same protein as your nails.',
    'Hair grows roughly a centimetre a month. Patience is part of the plan.',
    'Most heads carry somewhere around 100,000 hairs. We have met a lot of them.',
    'Wet hair is at its most fragile, which is why we are gentle at the basin.',
    'A cooler final rinse helps each strand lie flat, and flat reads as shine.',
    'Grey hair is hair that has stopped making colour. It did not turn anything.',
    'Every follicle keeps its own timetable, so you never shed everything at once.',
    'Curls tend to run drier because scalp oils take the long way down a bend.',
    'The scalp is skin. SPF on the parting is not vanity.',
    'Hair is one of the fastest growing tissues in the body, and the most photographed.',
    // The beauty world
    'Fingernails grow faster than toenails, about three millimetres a month.',
    'The skin around your nails is there to protect. Please leave it its dignity.',
    'Lashes have their own growth cycle too, so a few are always on their way out.',
    'A good blow-dry is half technique and half the right brush. We will not say which half.',
    // Good hair, in practice
    'Detangle from the ends upward, in sections. Starting at the root only drags the knot down.',
    'Towel-dry by pressing, not rubbing. Rubbing roughs up the surface of the strand.',
    'Heat protection goes on before the tool, not after the damage.',
    'Shampoo the scalp and condition the lengths. The ends do not need the foam.',
    'Warm water is enough. Very hot water strips more oil than your hair can spare.',
    'A wide-tooth comb for wet hair, a brush for dry.',
    'A trim every six to eight weeks helps keep splits from travelling up the strand.',
    'Dry shampoo extends a day. It does not replace a wash, because your scalp still needs one.',
    'Chlorine and salt both dry hair out. Rinse with fresh water before and after a swim.',
    'UV softens colour over time. A hat or a UV leave-in is SPF for your colour.',
    'A silk or satin pillowcase gives your hair less to snag on overnight.',
    'A tight ponytail in the same place every day works the same strands. Move it a little.',
    'Colour-safe shampoo and a cooler rinse help colour keep its tone between visits.',
    'Home care is the other half of the appointment. Ask your stylist what yours is.',
    // Good skin, in practice
    'SPF is the one skin habit that earns its place every day, including in a cool office.',
    'Reapply SPF through the day in direct sun, and follow the pack.',
    'The neck, the ears and the backs of the hands show the sun too. Include them.',
    'Cleanse at night, every night. Make-up and sunscreen need to come off.',
    'Moisturiser holds on to more when it goes on to slightly damp skin.',
    'Pat your face dry. Rubbing is for towels, not skin.',
    'Hot showers feel lovely, but they dry skin out. Warm is kinder.',
    'Air conditioning dries skin too, so moisturising is a year-round habit here.',
    'Introduce one new product at a time, so you know which one is doing what.',
    'Exfoliate gently and not every day. Smooth is good, stripped is not.',
    'A pillowcase changed weekly is quiet skincare.',
    'Like hair, skin responds to a plan rather than a single visit.',
    // Brand anchors, verbatim
    'Treatments are skincare for your hair.',
    'Same architecture, different prescription.',
    'Great hair is not one visit. The plan is what makes it last.',
    'Between visits is where the result is kept.',
    'Your stylist prescribes, you do not choose blind.',
    'We see you.',
    // Did you know: ROSES Magazine (from the issue blurbs)
    'Did you know the ROSES Magazine archive holds 15 issues, from September 2021 to June 2023?',
    'Did you know the Creative Issue of ROSES, November to December 2022, featured our hero assistants?',
    'Did you know ROSES gave our front of house team a feature of its own, in May to June 2023?',
    'Did you know ROSES celebrated our award winners in March to April 2023?',
    'Did you know the March 2022 issue of ROSES told the story behind the brand?',
    'Did you know ROSES went behind the scenes at the ProBeauty Awards in April 2022?',
    'Did you know ROSES went behind the scenes at Arab Fashion Week in November 2021?',
    'Did you know ROSES has met our colourists, our cutting masters and our blow-dry specialists, one issue at a time?',
    'Did you know the Tara Rose Academy featured in the Summer Issue of ROSES in 2022?',
    'Did you know ROSES spotlighted our stylists and beauticians with #BloomingRoses in September 2021?',
    // Did you know: the years so far (a fixed snapshot of whole years, taken 18 Oct 2026). Public facts only: this file is
    // served to anyone, so no sales, no visit counts, no names.
    'Did you know Motor City opened in December 2022 and Al Quoz in September 2023?',
    'Did you know our two Abu Dhabi salons collected 111 Google reviews in 2021? In 2025 our four UAE branches collected 1,054.',
    'Did you know our Google reviews more than tripled between 2023 and 2024?',
    'Did you know our Google reviews nearly doubled between 2024 and 2025, from 557 to 1,054?',
    'Did you know all four UAE branches averaged 4.8 stars or higher in our Google reviews in 2025?',
    'Did you know this dashboard keeps every year since 2021, so any year can be set against any other?',
    // Shoutouts (no names; a named one needs the person's say-so first)
    'Shoutout to our assistants, who set up every colour and every blow-dry before anyone says thank you.',
    'Shoutout to our front of house team: the first hello and the last goodbye are theirs.',
    'Shoutout to every stylist who rebooks a client before she leaves the chair.',
    // The dashboard, with a straight face
    'Counting every blow-dry. Twice, to be sure.',
    'The numbers are warming up, the way a colour needs its time.',
    'Sorting by branch. No favourites, we promise.',
    'Fetching the figures. The coffee is on you.',
    'Checking the ledger against Phorest, because someone has to.',
    'Every figure here started as a client in a chair.',
    'A rebooking made before she leaves beats a reminder sent after.',
    'Behind every column is someone who showed up for her client today.',
    'Good data is like a good consultation: ask the right question first.',
    'Rearranging the Pulse. It looks better when it is in order.',
    'Loading, on rhythm.',
    'Almost there. Stylists know this feeling: the colour is nearly ready.'
  ];
  // Kate, 18 Oct 2026: "even this Loading data... part should have trivia in it". Every "Loading..." or "Reading..." line the pages
  // draw (class "loading", the ones that sit in the middle of a page while its figures come) gets a line under it too, taken
  // from this same list and changed every six seconds while it stays on screen. It watches the page for them, so no page has
  // to ask. Error and empty messages in the same class are left alone (only text that starts Loading or Reading is touched).
  (function () {
    var last = -1;
    function next() { var i; do { i = Math.floor(Math.random() * LINES.length); } while (i === last && LINES.length > 1); last = i; return LINES[i]; }
    function decorate(n) {
      if (n.__fact || !/^\s*(Loading|Reading)/i.test(n.textContent)) return;
      n.__fact = 1;
      var msg = document.createElement('span'), fact = document.createElement('span');
      msg.className = 'load-msg'; msg.textContent = n.textContent.trim();
      fact.className = 'load-fact'; fact.textContent = next();
      n.textContent = ''; n.appendChild(msg); n.appendChild(fact);
      var t = setInterval(function () { if (!n.isConnected) { clearInterval(t); return; } fact.textContent = next(); }, 6000);
    }
    function scan(n) {
      if (n.nodeType !== 1) return;
      if (n.classList.contains('loading')) decorate(n);
      var q = n.querySelectorAll ? n.querySelectorAll('.loading') : [];
      for (var i = 0; i < q.length; i++) decorate(q[i]);
    }
    try {
      new MutationObserver(function (ms) { ms.forEach(function (m) { m.addedNodes.forEach(scan); }); }).observe(document.body, { childList: true, subtree: true });
      scan(document.body);
    } catch (e) {}
  })();
  var KEY = 'trs-fact-last', el = document.getElementById('blFact');
  if (!el) return;
  var last = -1;
  try { last = parseInt(localStorage.getItem(KEY), 10); } catch (e) {}
  function pick(not) {
    var i;
    do { i = Math.floor(Math.random() * LINES.length); } while (i === not && LINES.length > 1);
    return i;
  }
  function show(i) {
    el.classList.remove('on');
    setTimeout(function () { el.textContent = LINES[i]; el.classList.add('on'); }, el.textContent ? 220 : 0);
  }
  var cur = pick(last);
  try { localStorage.setItem(KEY, String(cur)); } catch (e) {}
  show(cur);
  var t = setInterval(function () {
    if (!document.getElementById('bootLoader')) { clearInterval(t); return; }
    cur = pick(cur);
    show(cur);
  }, 6000);
})();
