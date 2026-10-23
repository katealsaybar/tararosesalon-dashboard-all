// Wellness Voucher blasts: the messages themselves (Kate, 23 Oct 2026: "bakit walang templates subsection tho for wellness voucher?"). Lost Client Blasts has a Templates tab; each blast page here now has
// "The messages": the exact wording that went out (or goes out), what the buttons were, who got which, and a preview with any first name. Read only: an approved WhatsApp template cannot be edited,
// a change is a new template in Meta. Level 3 and 5 (Level 4 has the money only). Loads after wv-blast.js in the same lazy group; wvBlockHtml (wv-blast.js) calls wvMsgHtml(key).
// Blasts 1 to 3 went out of GoHighLevel: their wording was read from the chats there on 23 Oct 2026, a sample of 20 clients of Blast 3 (names masked as {{1}}), so a version that none of
// them got is not here. Blast 4's two templates are the ones approved in Meta on Call Center 2 (checked 23 Oct); they are also in wv_last_templates.
const WV_MSG = {
  b1: {
    via: 'GoHighLevel workflow "WV - Blast Campaign", from the salon number connected to GoHighLevel',
    items: [
      { label: 'WhatsApp, version 1', when: 'Fri 21 Aug 2026', who: '3,168 contacts tagged for the voucher. Most of the clients sampled got this one.', vars: '{{1}} is her first name',
        footer: 'Not interested? Tap Stop promotions', buttons: [],
        body: `Hi {{1}},
This is Tara Rose Salon.

We've been thinking about you, so we built something for our regulars. Not money off. A plan.

Most of us don't lack the intention to look after ourselves. We lack a plan. A treatment here, a blowdry there, and six months on you're back where you started.

So we made three prepaid Wellness Vouchers. You place your credit, we add more on top, and we map your visits so each builds on the last.

- *Dip Your Toes:* place AED 1,000, receive AED 1,150. Any service, 6 months.
- *Season of You:* place AED 2,500, receive AED 3,000. Plus hair spa and glossing. 9 months.
- *All-In VIP Year:* place AED 4,500, receive AED 5,400. Your year mapped, major colour in. 12 months.

Tabby splits the upper two into four, and the credit stays the same.

Reserve one for yourself, or tick the gifting option on the form for the woman who'd never book it herself.

*Closes 30 September.*` },
      { label: 'WhatsApp, version 2', when: 'Fri 21 Aug 2026', who: 'A shorter opening, seen on one client in the sample.', vars: '{{1}} is her first name',
        footer: 'Not interested? Tap Stop promotions', buttons: [],
        body: `Hi {{1}},
This is Tara Rose Salon.

Something we built for our regulars, and it *closes 30 September*. Not money off. A plan.

Three prepaid Wellness Vouchers. You place your credit, we add more on top, and we map your visits so each builds on the last.

- *Dip Your Toes:* place AED 1,000, receive AED 1,150. Any service, 6 months.
- *Season of You:* place AED 2,500, receive AED 3,000. Plus hair spa and glossing. 9 months.
- *All-In VIP Year:* place AED 4,500, receive AED 5,400. Your year mapped, major colour in. 12 months.

Tabby splits the upper two into four, and the credit stays the same.

Reserve one for yourself, or tick the gifting option on the form for the woman who'd never book it herself.` },
      { label: 'Email', when: 'Sat 22 Aug 2026', who: 'The same list, 1,648 emails.', vars: 'No name in it: it opens "Hello,"', subject: 'You look after everyone else first. This one is for you.', buttons: ['Reserve Your Voucher', 'Or message us on WhatsApp and we will help you choose'],
        body: `YOU LOOK AFTER EVERYONE ELSE FIRST. THIS ONE IS FOR YOU.

Hello,

The Wellness Voucher is open until 30 September, and we wanted you to hear about it from us first.

It is not money off. You place your credit, we add more on top, and it becomes a plan for your year instead of a one-off appointment. Part of it is set aside as a Self-Care Bonus, pointed at the thing you keep moving to next month. The treatment. The gloss. The hour that is only yours.

Your credit spends on any service, up to its value, at the salons named on your voucher.

Three ways in
Dip Your Toes
Place AED 1,000, spend AED 1,150. Any service. Valid 6 months.

Most chosen: Season of You
Place AED 2,500, spend AED 3,000. AED 500 of that is your Self-Care Bonus for beauty, treatments, keratin and blow-dries. Valid 9 months.

All-In VIP Year
Place AED 4,500, spend AED 5,400. AED 900 of that is your Self-Care Bonus. Your whole year, held on rhythm. Valid 12 months.

Season of You and All-In VIP Year split into four with Tabby, interest-free. The credit stays exactly the same.

[Reserve Your Voucher]
[Or message us on WhatsApp and we will help you choose]

A gift card comes with every voucher. Keep yours, and tell us who the second one is for. We send it to her by email, in your name, ready to book.

And this holds throughout, our Confidence Promise. If something does not feel right within seven days of any colour or treatment service, we invite you back to refine it. No blame, just care.

Warm regards,
The Tara Rose team

tararosesalon.com` }
    ]
  },
  b2: {
    via: 'GoHighLevel workflow "WV - Blast Campaign Reminder", from the salon number connected to GoHighLevel',
    items: [
      { label: 'WhatsApp reminder', when: 'Fri 28 Aug 2026', who: 'The same list, minus anyone who had replied or bought.', vars: '{{1}} is her first name',
        footer: 'Not interested? Tap Stop promotions', buttons: [],
        body: `Hi {{1}},

A gentle reminder from us.

The Wellness Voucher closes on *30 September* and we did not want you to miss it if you have been thinking it over.

You can *reserve it for yourself*, and the *gift card* that comes with it is emailed to whoever you name, in your name. Or simply reply, and we will help you decide. No pressure at all.

Tara Rose Salons` }
    ]
  },
  b3: {
    via: 'GoHighLevel workflow "WV blast - Send (tag go)", started by the site\'s Send a wave panel. Waves 1a to 5a got the short message, 1b to 5b the long one.',
    items: [
      { label: 'A: the short message', when: 'Thu 15 and Fri 16 Oct 2026', who: '300 clients, the "a" half of each wave.', vars: 'No name in it', buttons: ['Tell me more', 'Reserve mine'], note: 'It goes with the voucher picture. The text below is the caption.',
        body: `Make time for yourself with Tara Rose Wellness Vouchers. Prepay and enjoy extra credit towards your visits:

* Pay AED 1,000, enjoy AED 1,150 (valid for 6 months)
* Pay AED 2,500, enjoy AED 3,000 (valid for 9 months)
* Pay AED 4,500, enjoy AED 5,400 (valid for 12 months)

Each includes a gift voucher for a friend and a self-care kit. Redeem at all four UAE salons.

Split the cost in 4 with Tabby available on the two higher options, subject to approval. Terms apply.

Available until 31 October.` },
      { label: 'B: the long message', when: 'Thu 15 and Fri 16 Oct 2026', who: '300 clients, the "b" half of each wave.', vars: '{{1}} is her first name', buttons: ['Tell me more', 'Reserve mine'],
        body: `Hi {{1}}, this is Tara Rose Salon.

We made something for the clients we see most. The Wellness Voucher is not money off. It is a plan. You prepay your credit, we add a Self-Care Bonus on top, and your credit is there for 6, 9 or 12 months.

Dip Your Toes: pay AED 1,000, get AED 1,150, for 6 months
Season of You: pay AED 2,500, get AED 3,000, for 9 months
All-In VIP Year: pay AED 4,500, get AED 5,400, for 12 months

Season of You and All-In VIP Year can be split into four with Tabby at no extra cost, subject to Tabby approval and terms. Your credit works at any of our four UAE salons, and every voucher comes with a gift voucher for a friend and a home kit. Terms are in the pricing PDF, which we are happy to send.

It closes on 31 October. Reply here and we will help you choose the one that fits you.` }
    ]
  },
  b4: {
    via: 'respond.io, from Call Center 2 (+971 56 277 3945), sent from the Blast 4 send panel. Both are Meta marketing templates, English (UK), approved (checked 23 Oct 2026).',
    items: [
      { label: 'Warm list: wellness_voucher_last_push_warm', when: 'Mon 26 Oct 2026', who: '20 clients who asked about the voucher on Blast 3 and have not bought.', vars: '{{1}} is her first name', buttons: ['Reserve mine', 'Not for me'],
        body: `Hi {{1}}, you asked about the Wellness Voucher, so a quick note before it closes on 31 October.

You can reserve yours here:
https://www.tararosesalon.com/en/ae/wellness-voucher-campaign/#reserve

If you would rather talk it through, just reply and we will help. No pressure at all.` },
      { label: 'Clean list: wellness_voucher_last_push_new', when: 'Mon 26 Oct 2026', who: '292 top spenders we have not messaged about the voucher before.', vars: '{{1}} is her first name', buttons: ['Tell me more', 'Not for me'],
        body: `Hi {{1}}, this is Tara Rose. Our Wellness Voucher closes on 31 October.

Choose one of three tiers, and the gift card that comes with it is emailed, in your name, to whoever you would like to give it to.

Everything is here:
https://www.tararosesalon.com/en/ae/wellness-voucher-campaign/#reserve

Or reply and we will help you choose.` }
    ]
  }
};
let wvMsgName = 'Sara';
try { wvMsgName = localStorage.getItem('wv-msg-name') || 'Sara'; } catch (e) {}
const wvMsgFill = t => String(t).replace(/\{\{1\}\}/g, wvMsgName.trim() || 'Sara');
function wvMsgCard(it, i) {
  const bubble = lcEsc(wvMsgFill(it.body)).replace(/\*([^*\n]+)\*/g, '<b>$1</b>');
  const len = wvMsgFill(it.body).length;
  return `<div class="wv-pbox wv-mcard"><h4>${lcEsc(it.label)}</h4>
    <dl class="wv-facts wv-mfacts"><div><dt>When</dt><dd>${lcEsc(it.when)}</dd></div><div><dt>Who got it</dt><dd>${lcEsc(it.who)}</dd></div><div><dt>Name in it</dt><dd>${lcEsc(it.vars)}</dd></div>${it.subject ? `<div><dt>Subject</dt><dd>${lcEsc(it.subject)}</dd></div>` : ''}</dl>
    ${it.note ? `<p class="slv-note">${lcEsc(it.note)}</p>` : ''}
    <div class="wv-bubble" data-i="${i}">${bubble}${it.footer ? `<div class="wv-bfoot">${lcEsc(it.footer)}</div>` : ''}</div>
    ${(it.buttons || []).length ? `<div class="wv-bbtns">${it.buttons.map(b => `<span class="wv-bbtn">${lcEsc(b)}</span>`).join('')}</div>` : ''}
    <p class="slv-note">${lcNum(len)} characters${it.buttons && it.buttons.length ? ', with these ' + (it.subject ? 'buttons in the email' : 'buttons') : ''}.</p></div>`;
}
function wvMsgHtml(key) {
  if (typeof wvPerfOnly === 'function' && wvPerfOnly()) return '';
  const m = WV_MSG[key];
  if (!m) return '';
  return `<section class="wv-msgs" id="wvMsg${key.slice(1)}"><h3 class="wv-h4">The messages</h3>
    <p class="slv-note wv-what"><b>What is this?</b> The exact wording of ${m.items.length === 1 ? 'the message' : 'the ' + m.items.length + ' messages'} in this blast. <b>Why it matters:</b> you can see what the client read, and what the numbers above are of. <b>Next:</b> nothing to do. It is read only: an approved WhatsApp message cannot be edited, a change is a new message in Meta.</p>
    <p class="slv-note">Sent through ${lcEsc(m.via.replace(/\.$/, ''))}.</p>
    <label class="wv-mname slv-note">Preview with the name <input type="text" class="ll-sel" value="${lcEsc(wvMsgName)}" maxlength="24" oninput="wvMsgSet(this.value)" aria-label="First name for the preview"></label>
    <div class="wv-pgrid wv-mgrid">${m.items.map(wvMsgCard).join('')}</div>
    ${key === 'b1' || key === 'b2' || key === 'b3' ? `<p class="slv-note">${key === 'b3' ? 'Blast 3' : 'Blasts 1 and 2'}: the wording was read from the chats in GoHighLevel on 23 Oct 2026, from a sample of 20 clients. A version that none of them got is not shown.</p>` : ''}</section>`;
}
function wvMsgSet(v) {
  wvMsgName = v;
  try { localStorage.setItem('wv-msg-name', v); } catch (e) {}
  const m = WV_MSG[wvMode];
  if (!m) return;
  document.querySelectorAll('#wvBlastContent .wv-bubble').forEach(b => {
    const it = m.items[+b.dataset.i]; if (!it) return;
    b.innerHTML = lcEsc(wvMsgFill(it.body)).replace(/\*([^*\n]+)\*/g, '<b>$1</b>') + (it.footer ? `<div class="wv-bfoot">${lcEsc(it.footer)}</div>` : '');
  });
}
