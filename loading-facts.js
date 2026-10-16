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
    'A cooler final rinse helps the cuticle lie flat, and flat reads as shine.',
    'Grey hair is hair that has stopped making pigment. It did not turn anything.',
    'Every follicle keeps its own timetable, so you never shed everything at once.',
    'Curls tend to run drier because scalp oils take the long way down a bend.',
    'The scalp is skin. SPF on the parting is not vanity.',
    'Hair is one of the fastest growing tissues in the body, and the most photographed.',
    // The beauty world
    'Fingernails grow faster than toenails, about three millimetres a month.',
    'Cuticles are there to protect. Please leave them their dignity.',
    'Lashes have their own growth cycle too, so a few are always on their way out.',
    'A good blow-dry is half technique and half the right brush. We will not say which half.',
    // Brand anchors, verbatim
    'Treatments are skincare for your hair.',
    'Same architecture, different prescription.',
    'Great hair is not one visit. The plan is what makes it last.',
    'Between visits is where the result is kept.',
    'Your stylist prescribes, you do not choose blind.',
    'We see you.',
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
