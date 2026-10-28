// Glow Club Performance (Kate, 22 Oct 2026): how the Glow Club membership has done, in the Campaigns group beside the Wellness Voucher.
// Numbers from glow_club_performance() (migrations/glow_club_performance.sql), Level 3 and above, no client names. It is counted from the
// till: a purchase is a Glow Club sales line with a price, a perk used is the AED 0 line after it. Nothing is priced twice, and a perk used
// is a count, not a value. Self-contained: it needs only sb (the Supabase client) and TRS_LEVEL.
const GC_BR = { SAA: 'Saadiyat', KCA: 'Khalifa City A', MC: 'Motor City', AQ: 'Al Quoz' };
const GC_TIER = { SILVER: ['Silver', 1250], GOLD: ['Gold', 1750], PLATINUM: ['Platinum', 2800] };
let gcData = null, gcErr = '', gcBusy = false;

const gcEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const gcNum = n => Number(n || 0).toLocaleString('en-GB', { maximumFractionDigits: 0 });
const gcPct = (a, b) => b ? Math.round(100 * a / b) + '%' : '–';
const gcMonth = k => { try { return new Date(k + '-01T12:00:00').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }); } catch (e) { return k; } };
const gcDay = d => { try { return new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return d || '–'; } };
const gcWhen = iso => { try { return new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }); } catch (e) { return ''; } };
const gcOk = () => typeof TRS_LEVEL !== 'undefined' && TRS_LEVEL >= 2;   // Kate, 28 Oct 2026: Level 2 opens the campaign performance reports (migrations/level2_campaign_performance.sql)

async function renderGlowClub(force) {
  const el = document.getElementById('glowClubContent');
  if (!el || !gcOk()) return;
  if (gcData && !force) { gcPaint(); return; }
  if (gcBusy) return;
  gcBusy = true; gcErr = '';
  el.innerHTML = `<section class="gc-intro"><h2>Glow Club Performance</h2></section><p class="slv-muted">Reading the till…</p>`;
  try {
    const { data, error } = await sb.rpc('glow_club_performance');
    if (error || !data || !data.totals) throw error || new Error('no report');
    gcData = data;
  } catch (e) { console.error(e); gcErr = 'The report did not load. Refresh to try again.'; }
  gcBusy = false;
  gcPaint();
}

function gcCard(title, n, note, cls) {
  return `<div class="ll-card gc-card${cls ? ' ' + cls : ''}"><div class="ll-t">${title}</div><div class="ll-n">${n}</div><div class="ll-d">${note}</div></div>`;
}
// A table whose last column is a bar sized against the biggest row.
function gcBars(head, rows, key, fmt) {
  const max = Math.max(1, ...rows.map(r => Math.abs(r[key] || 0)));
  return `<div class="gc-scroll"><table class="gc-tbl"><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r =>
    `<tr>${r.cells.map(c => `<td>${c}</td>`).join('')}<td class="gc-barcell"><div class="gc-bar" title="${gcEsc(fmt(r[key]))}"><i style="width:${Math.max(0, 100 * (r[key] || 0) / max)}%"></i></div></td></tr>`).join('')}</tbody></table></div>`;
}

function gcPaint() {
  const el = document.getElementById('glowClubContent');
  if (!el) return;
  if (gcErr || !gcData) { el.innerHTML = `<section class="gc-intro"><h2>Glow Club Performance</h2></section><p class="slv-muted">${gcEsc(gcErr || 'No report yet.')}</p>`; return; }
  const d = gcData, t = d.totals;
  // Every month from the first sale to the latest one with anything in it, so a month with nothing sold still shows as a row of zeros.
  const have = {}; (d.by_month || []).forEach(m => { have[m.k] = m; });
  const months = [];
  if (d.by_month && d.by_month.length) {
    const ks = d.by_month.map(m => m.k), last = ks[ks.length - 1];
    let [y, mo] = ks[0].split('-').map(Number);
    for (let guard = 0; guard < 120; guard++) {
      const k = y + '-' + String(mo).padStart(2, '0');
      months.push(have[k] || { k, new: 0, renewals: 0, sold: 0, aed: 0, uses: 0 });
      if (k >= last) break;
      if (++mo > 12) { mo = 1; y++; }
    }
  }
  const sold = t.sold || 0, members = t.members || 0;
  const firstTwo = months.slice(0, 2).reduce((a, m) => a + (m.new || 0), 0);
  const stands = [];
  if (members) stands.push(`<b>${gcNum(firstTwo)} of the ${gcNum(members)}</b> members joined in the first two months (${gcEsc(gcMonth(months[0].k))} and ${gcEsc(gcMonth(months[1] ? months[1].k : months[0].k))}).`);
  if (d.last_sale) stands.push(`The last membership was sold on <b>${gcEsc(gcDay(d.last_sale))}</b>${t.bought_in_60 ? '' : ', so nobody has bought or renewed in the last 60 days'}.`);
  if (d.last_use) stands.push(`The last perk was used on <b>${gcEsc(gcDay(d.last_use))}</b>; ${gcNum(t.active_60)} of ${gcNum(members)} members bought or used one in the last 60 days.`);

  const tiers = (d.by_tier || []).map(x => {
    const [nm, price] = GC_TIER[x.k] || [x.k, 0];
    return { aed: x.aed, cells: [`<b>${gcEsc(nm)}</b>`, price ? 'AED ' + gcNum(price) : '', gcNum(x.sold), gcNum(x.members), 'AED ' + gcNum(x.aed), gcNum(x.uses), x.sold ? (x.uses / x.sold).toFixed(1) : '–'] };
  });
  const brs = (d.by_branch || []).map(x => ({ aed: x.aed, cells: [`<b>${gcEsc(GC_BR[x.k] || x.k)}</b>`, gcNum(x.sold), gcNum(x.members), 'AED ' + gcNum(x.aed), gcNum(x.uses)] }));
  const mrows = months.map(m => ({ aed: m.aed, cells: [`<b>${gcEsc(gcMonth(m.k))}</b>`, gcNum(m.new), gcNum(m.renewals), gcNum(m.sold), 'AED ' + gcNum(m.aed), gcNum(m.uses)] }));
  const svc = (d.services || []).map(x => ({ uses: x.uses, cells: [gcEsc(x.k), gcNum(x.uses), gcPct(x.uses, t.uses)] }));
  const times = (d.times || []).map(x => ({ members: x.members, cells: [x.k === '1' ? 'Bought once' : x.k === '4+' ? 'Bought 4 times or more' : `Bought ${x.k} times`, gcNum(x.members), gcPct(x.members, members)] }));

  el.innerHTML = `
    <section class="gc-intro"><h2>Glow Club Performance</h2>
      <p>The monthly membership, counted from the till: Silver AED 1,250, Gold AED 1,750 and Platinum AED 2,800 a month, with the perks each member used.</p></section>
    <div class="gc-fresh">
      <span class="gc-chip">From the till, VAT included, no client names</span>
      <span class="gc-chip">Sales from <b>${gcEsc(gcDay(d.first))}</b></span>
      <span class="gc-chip">Report made <b>${gcEsc(gcWhen(d.at))}</b></span>
      <button type="button" class="gc-chip gc-refresh" onclick="renderGlowClub(true)" title="Ask again">Refresh</button>
    </div>
    <div class="ll-cards gc-cards">
      ${gcCard('Memberships sold', gcNum(sold), `${gcNum(members)} different members`)}
      ${gcCard('AED collected', gcNum(t.aed), t.refunds ? `after ${gcNum(t.refunds)} refund of AED ${gcNum(t.refund_aed)}` : 'no refunds')}
      ${gcCard('Renewals', gcNum(t.renewals), `${gcNum(t.repeat)} of ${gcNum(members)} members (${gcPct(t.repeat, members)}) bought again`)}
      ${gcCard('Perks used', gcNum(t.uses), `${sold ? (t.uses / sold).toFixed(1) : '–'} per membership sold`)}
      ${gcCard('Active, last 60 days', gcNum(t.active_60), `of ${gcNum(members)} members bought or used a perk`, t.active_60 <= 1 ? 'gc-warn' : '')}
    </div>
    ${stands.length ? `<section class="gc-sec"><h3>What stands out</h3><ul class="gc-list">${stands.map(s => `<li>${s}</li>`).join('')}</ul></section>` : ''}
    <section class="gc-sec"><h3>Month by month</h3>
      ${gcBars(['Month', 'New members', 'Renewals', 'Sold', 'AED collected', 'Perks used', ''], mrows, 'aed', v => 'AED ' + gcNum(v))}
      <p class="gc-note">A new member is a client's first Glow Club purchase; every later purchase is a renewal, even after a gap. A refund comes off the month it was given.</p></section>
    <section class="gc-sec"><h3>By tier</h3>
      ${gcBars(['Tier', 'Price', 'Sold', 'Members', 'AED collected', 'Perks used', 'Perks per sale', ''], tiers, 'aed', v => 'AED ' + gcNum(v))}
      <p class="gc-note">One Silver was refunded and swapped for a Platinum the same day (5 Sep 2025). Both sales are counted; the refund comes off the Silver's AED.</p></section>
    <section class="gc-sec"><h3>By branch</h3>
      ${gcBars(['Branch', 'Sold', 'Members', 'AED collected', 'Perks used', ''], brs, 'aed', v => 'AED ' + gcNum(v))}
      <p class="gc-note">The branch is where the till line was rung up, for the purchase and for each perk.</p></section>
    <section class="gc-sec"><h3>How often members came back</h3>
      ${gcBars(['', 'Members', 'Share', ''], times, 'members', v => gcNum(v) + ' members')}</section>
    <section class="gc-sec"><h3>Most used perks</h3>
      ${gcBars(['Perk', 'Used', 'Share of all perks', ''], svc, 'uses', v => gcNum(v) + ' times')}
      <p class="gc-note">The top 12. A perk is rung up at AED 0, so the page counts them and does not put a price on them.</p></section>
    <section class="gc-sec"><h3>What this page does not show</h3>
      <ul class="gc-list"><li>The Glow Club's own ads, messages and launch dates, which are not recorded anywhere yet. Only the sales are.</li>
      <li>What the perks were worth: they are AED 0 in the till.</li>
      <li>Anything before 24 Jul 2025: there is no Glow Club line in the till before that day.</li></ul></section>`;
}
