// Social > Instagram > Competitors (Kate, 25 Nov 2026). Built from docs/mockups/social-competitors.html.
// The salons Kate adds in Metricool (Analytics > Instagram > Competitors) are read every night by metricool-sync (source 'competitors') into
// metricool_competitors, metricool_competitor_followers and metricool_competitor_posts; social_competitors(from, to) hands the page the list and
// the posts in the masthead's dates, and everything else is worked out here, the same way for them and for us: likes plus comments on a post as a
// share of followers. Public data only (Instagram keeps views, reach and stories private for other accounts). Instagram only for now.
// Loaded with social.js (the 'mk' group). social.js calls socCompLoad(w) when it loads a Period and socCompSection(net) where the section is drawn;
// a section with no salons in Metricool keeps its old "None set up yet" line.
// Hover answers on the bars come from js/bar-hover.js (each row carries its own sentence in data-tip); figures open their lists through TRSD (drill.js)
// with sgSpec (social-glance.js), down to one post.
let socCompData = null;
async function socCompLoad(w) {
  socCompData = null;
  if (socBranch === 'BAH') return;                      // Bahrain has no competitors added in Metricool
  try {
    const { data, error } = await sb.rpc('social_competitors', { p_from: w.from, p_to: w.to, p_network: 'instagram' });
    if (error) throw error;
    socCompData = data;
  } catch (e) { console.error(e); socCompData = null; }   // the section keeps its old line; the rest of the page does not wait on this
}

const sccN1 = v => (Math.round(v * 10) / 10).toLocaleString('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const sccP2 = v => (v === null || v === undefined || !isFinite(v)) ? '–' : v.toFixed(2) + '%';
const sccKind = k => (k === 'reel' ? 'Reel' : 'Feed post');
// Metricool gives each salon's Instagram display name, which can carry emoji or a tagline. A short name here wins; otherwise the display name with the emoji taken off.
const SCC_NAMES = { lunaticfringebytheboys: 'Lunatic Fringe by The Boys', thefolddxb: 'The Fold Hair & Soul', thebritishsalondubai: 'The British Salon JLT' };
const sccName = (h, n) => SCC_NAMES[h] || String(n || h || '').replace(/[\u{1F000}-\u{1FFFF}☀-➿️‍]/gu, '').replace(/\s+/g, ' ').trim() || h;
const sccFig = (txt, spec) => (spec && window.TRSD) ? TRSD.num(txt, spec) : txt;

// Us and the salons we watch, one shape: { id, us, n, h, f, p, r, l, c, e, rows } where p and r count feed posts and reels, l and c are the average
// likes and comments a post, e the reaction rate (%), rows the posts in the dates.
function sccAccounts() {
  const d = socCompData;
  if (!d || !(d.competitors || []).length || !socData) return null;
  const mk = (id, us, n, h, f, rows) => {
    const cnt = rows.length, l = cnt ? socSum(rows, 'l') / cnt : 0, c = cnt ? socSum(rows, 'c') / cnt : 0;
    rows.forEach(x => { x.e = f ? 100 * (x.l + x.c) / f : null; });
    return { id, us, n, h, f, p: rows.filter(x => x.kind === 'post').length, r: rows.filter(x => x.kind === 'reel').length, l, c, e: cnt && f ? 100 * (l + c) / f : null, rows };
  };
  const day = p => String(p.post_date || '').slice(0, 10);
  const ours = (socData.posts || []).filter(p => p.network === 'instagram' && p.kind !== 'story').map(p => ({ sal: 'Tara Rose Salons', d: day(p), kind: p.kind === 'reel' ? 'reel' : 'post', l: Number(p.likes) || 0, c: Number(p.comments) || 0, url: p.url || '', text: socCap1(p) }));
  const f0 = socFollowers('instagram').end;
  const us = mk('us', true, 'Tara Rose Salons', 'tararosesalon', f0 || 0, ours);
  const them = d.competitors.map(c => {
    const rows = (d.posts || []).filter(p => String(p.cid) === String(c.id)).map(p => ({ sal: sccName(c.handle, c.name), d: String(p.d).slice(0, 10), kind: p.kind, l: Number(p.likes) || 0, c: Number(p.comments) || 0, url: p.url || '', text: p.text || '' }));
    return mk('c' + c.id, false, sccName(c.handle, c.name), c.handle, Number(c.followers) || 0, rows);
  });
  return [us, ...them];
}

// ── the windows a figure opens ──
const SCC_POSTCOLS = (all, live) => [...(all ? [{ k: 'sal', l: 'Salon' }] : []), { k: 'd', l: 'Date', t: 'date' }, { k: 'kd', l: 'Kind' }, { k: 'l', l: 'Likes', t: 'num' }, { k: 'c', l: 'Comments', t: 'num' },
  { k: 'e', l: 'Reaction rate', t: 'html' }, ...(live ? [{ k: 'u', l: 'On Instagram', t: 'html' }] : [])];
function sccPostsSpec(sk, title, sub, rows, all) {
  const lines = rows.slice().sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0)).map(x => ({ sal: x.sal, d: x.d, kd: sccKind(x.kind), l: x.l, c: x.c, e: sccP2(x.e), u: sgLink(x.url, 'post') }));
  return sgSpec(sk, title, sub, SCC_POSTCOLS(all, rows.some(x => x.url)), lines, { [all ? 'sal' : 'd']: 'Total', l: socSum(rows, 'l'), c: socSum(rows, 'c') },
    'This is the last step: a single post has nothing behind it.');
}
function sccSub(w, n) { return `${socDayY(w.from)} to ${socDayY(w.to)}, ${n} post${n === 1 ? '' : 's'} and reels`; }
function sccAccPosts(a, kind) {
  const rows = kind ? a.rows.filter(x => x.kind === kind) : a.rows, w = socData.win;
  return rows.length ? sccPostsSpec('comp.' + a.h + (kind ? '-' + kind : ''), a.n + (kind === 'reel' ? ', reels' : kind === 'post' ? ', feed posts' : ', posts and reels'), sccSub(w, rows.length), rows, false) : null;
}
function sccAccountsSpec(sk, title, acc) {
  const w = socData.win;
  const lines = acc.map(a => ({ n: a.n + (a.us ? ' (us)' : '') + ' @' + a.h, f: a.f, p: a.p, r: a.r, l: sccN1(a.l), c: sccN1(a.c), e: sccP2(a.e),
    _dn: { p: sccAccPosts(a, 'post'), r: sccAccPosts(a, 'reel'), l: sccAccPosts(a), c: sccAccPosts(a), e: sccAccPosts(a) } }));
  return sgSpec(sk, title, `${socDayY(w.from)} to ${socDayY(w.to)}, Instagram`, [{ k: 'n', l: 'Salon' }, { k: 'f', l: 'Followers', t: 'num' }, { k: 'p', l: 'Feed posts', t: 'num' }, { k: 'r', l: 'Reels', t: 'num' },
    { k: 'l', l: 'Likes a post', t: 'html' }, { k: 'c', l: 'Comments a post', t: 'html' }, { k: 'e', l: 'Reaction rate', t: 'html' }], lines);
}

// ── the section ──
function socCompSection(net) {
  if (net !== 'instagram') return null;
  const acc = sccAccounts();
  if (!acc) return null;
  const w = socData.win, us = acc[0], them = acc.slice(1);
  const rated = them.filter(a => a.e !== null), lo = rated.length ? Math.min(...rated.map(a => a.e)) : null, hi = rated.length ? Math.max(...rated.map(a => a.e)) : null;
  const best = rated.slice().sort((a, b) => b.e - a.e)[0], big = them.slice().sort((a, b) => b.f - a.f)[0];
  const allRows = acc.flatMap(a => a.rows), themRows = them.flatMap(a => a.rows);
  const summary = us.e !== null && rated.length ? `${them.length} salons · our reaction rate ${sccP2(us.e)}, theirs ${sccP2(lo)} to ${sccP2(hi)}` : `${them.length} salons we watch`;

  // The answer in one line, and one sentence about who to learn from.
  let ans = '', ans2 = '', note = '';
  if (us.e !== null && rated.length && us.f) {
    const bigger = us.f >= big.f;
    ans = `${bigger ? `We are the biggest account (${socNum(us.f)} followers${big.f ? `, ${Math.round(us.f / big.f)} times the next` : ''})` : `We have ${socNum(us.f)} followers`}, ${us.e < lo ? 'and our followers react the least' : us.e > hi ? 'and our followers react the most' : 'and our followers react in the middle of the pack'}: ${sccP2(us.e)} against ${sccP2(lo)} to ${sccP2(hi)} for the salons we watch.`;
    ans2 = `${best.n} posted ${best.p + best.r} times in these dates and gets ${us.e ? Math.round(best.e / us.e) : '–'} times our reaction rate. ${best.r > best.p ? 'Its reels are the place to look first.' : 'Its posts are the place to look first.'}`;
    note = bigger ? 'A bigger account always scores lower on this measure, so read it as the gap to close, not as a ranking of blame.' : '';
  } else ans = 'Not enough posts in these dates to compare. Pick a longer Period.';

  // Tiles, each one opens the list behind it.
  const tileDn = (sp) => (sp && window.TRSD) ? ` dn-cell" role="button" tabindex="0" data-dn="${TRSD.reg(sp)}` : '';
  const tile = (l, v, c, sp) => `<div class="scc-tile${tileDn(sp)}"><span class="scc-l">${l}</span><span class="scc-v">${v}</span><span class="scc-c">${c}</span></div>`;
  const allSpec = sccPostsSpec('comp.all', 'Every post and reel, ours and theirs', sccSub(w, allRows.length) + ` (ours ${us.rows.length}, the salons we watch ${themRows.length})`, allRows, true);
  const tiles = [
    tile('Our followers', socNum(us.f), big && big.f ? `${Math.round(us.f / big.f)} times the biggest we watch (${socNum(big.f)})` : 'Instagram, as of the last read', sccAccountsSpec('comp.followers', 'Followers, ours and the salons we watch', acc)),
    tile('Posts and reels', socNum(us.p + us.r), `The salons we watch posted ${themRows.length}, so ${them.length ? Math.round(themRows.length / them.length) : 0} each`, allRows.length ? allSpec : null),
    tile('Reaction rate', sccP2(us.e), rated.length ? `The salons we watch: ${sccP2(lo)} to ${sccP2(hi)}` : '', sccAccountsSpec('comp.rate', 'Reaction rate, ours and the salons we watch', acc)),
    tile('Best reaction', best ? sccP2(best.e) : '–', best ? `${best.n}, ${best.p + best.r} posts and reels` : '', best ? sccAccPosts(best) : null)].join('');

  // Bars: how much followers react, and how often each posts. Hover answers come from bar-hover.js through data-tip.
  const avgThem = rated.length ? socSum(rated, 'e') / rated.length : null;
  const row = (a, val, mx, fig, sub, tip) => `<div class="scc-row${a.us ? ' us' : ''}" data-tip="${mkEsc(tip)}"><span class="scc-nm"><b>${mkEsc(a.n)}${a.us ? ' <span class="scc-us">us</span>' : ''}</b><small>${sub}</small></span><span class="scc-trk"><i style="width:${mx ? Math.max(2, Math.round(100 * val / mx)) : 0}%"></i></span><span class="scc-fig">${fig}</span><span class="scc-n">${a.p + a.r} posts</span></div>`;
  const byRate = acc.filter(a => a.e !== null).sort((a, b) => b.e - a.e), mxR = byRate.length ? byRate[0].e : 0;
  const rateTip = a => {
    const base = `Out of every 100 followers, ${a.e.toFixed(2)} liked or commented on a post.`;
    if (a.us) return `${base} The salons we watch average ${avgThem === null ? '–' : avgThem.toFixed(2)}.`;
    if (!us.e) return base;
    const x = a.e / us.e;
    return `${base} Ours is ${us.e.toFixed(2)}${x >= 1.5 ? `, ${Math.round(x)} times lower` : ''}.`;
  };
  const barsR = byRate.map(a => row(a, a.e, mxR, sccFig(sccP2(a.e), sccAccPosts(a)), socNum(a.f) + ' followers', rateTip(a))).join('');
  const byPost = acc.slice().sort((a, b) => (b.p + b.r) - (a.p + a.r)), mxP = byPost.length ? byPost[0].p + byPost[0].r : 0, days = Math.max(1, (mkD(w.to) - mkD(w.from)) / 864e5 + 1);
  const barsP = byPost.map(a => { const n = a.p + a.r; return row(a, n, mxP, sccFig(String(n), sccAccPosts(a)), `${a.p} feed posts, ${a.r} reels`,
    `${n} posts and reels in ${Math.round(days)} days: ${a.p} feed posts and ${a.r} reels${n ? `, about one every ${(days / n).toFixed(1).replace('.0', '')} days` : ''}.`); }).join('');

  // The side by side table: the shared Sheets table, every heading has its menu.
  const num = (k, l, get, sp) => ({ k, l, t: 'num', raw: a => get(a), disp: a => String(Math.round(get(a) * 100) / 100), cell: a => sccFig(k === 'l' || k === 'c' ? sccN1(get(a)) : socNum(get(a)), sp ? sp(a) : null) });
  const tbl = socTblHtml('instagram-comp', { rows: acc, unit: 'salons', cols: [
    { k: 'n', l: 'Salon', t: 'txt', raw: a => a.n, disp: a => a.n, cell: a => `<b>${mkEsc(a.n)}</b>${a.us ? ' <span class="scc-us">us</span>' : ''}<small class="scc-h">@${mkEsc(a.h)}</small>` },
    num('f', 'Followers', a => a.f, null),
    num('p', 'Feed posts', a => a.p, a => a.p ? sccAccPosts(a, 'post') : null),
    num('r', 'Reels', a => a.r, a => a.r ? sccAccPosts(a, 'reel') : null),
    num('l', 'Likes a post', a => a.l, a => sccAccPosts(a)),
    num('c', 'Comments a post', a => a.c, a => sccAccPosts(a)),
    { k: 'e', l: 'Reaction rate', t: 'num', raw: a => a.e === null ? -1 : a.e, disp: a => sccP2(a.e), cell: a => sccFig(sccP2(a.e), a.e === null ? null : sccAccPosts(a)) }] });

  // The five that did best, from the salons we watch.
  const tops = themRows.slice().sort((a, b) => (b.l + b.c) - (a.l + a.c)).slice(0, 5);
  const topHt = tops.map(s => { const a = them.find(x => x.n === s.sal), mean = a && a.rows.length ? socSum(a.rows, 'l') / a.rows.length + socSum(a.rows, 'c') / a.rows.length : 0;
    return `<div class="scc-item" data-tip="${mkEsc(`${sccKind(s.kind)}, ${s.sal}: ${socNum(s.l + s.c)} likes and comments${mean ? `, ${((s.l + s.c) / mean).toFixed(1)} times their usual ${socNum(mean)} a post` : ''}. Open it to see what they did.`)}"><span class="scc-bd">IG</span><div><div class="scc-it">${sccKind(s.kind)}, ${mkEsc(s.sal)}, ${socDayY(s.d)}</div><div class="scc-is">${socNum(s.l)} likes · ${socNum(s.c)} comments · reaction rate ${sccP2(s.e)}</div>${s.text ? `<div class="scc-is">“${mkEsc(s.text)}${s.text.length >= 140 ? '…' : ''}”</div>` : ''}</div><div class="scc-go"><span class="scc-big">${socNum(s.l + s.c)}</span>${s.url ? `<a class="cm-pill" href="${mkEsc(s.url)}" target="_blank" rel="noopener">Open on Instagram</a>` : ''}</div></div>`; }).join('');

  const first = socCompData.first_day ? socDayY(String(socCompData.first_day).slice(0, 10)) : null;
  const history = first && String(socCompData.first_day).slice(0, 10) > w.from ? ` Followers are as of the last read; our own record of them starts on ${first}.` : '';
  const html = `<div class="scc">
    <p class="slv-muted scc-learn"><b>What is this?</b> The salons we watch on Instagram, counted over the same dates as us. <b>Why it matters.</b> It shows who posts more, who gets more from it, and what works for them.</p>
    <div class="scc-ans"><div class="slv-eyebrow">The answer in one line</div><div class="scc-big2">${ans}</div>${ans2 ? `<div class="scc-sub">${ans2}</div>` : ''}${note ? `<div class="scc-note">${note}</div>` : ''}</div>
    <div class="scc-tiles">${tiles}</div>
    <div class="scc-grid">
      <div class="scc-card"><h3>How much followers react</h3><p class="scc-hint">Likes plus comments on a post, as a share of followers. Hover a row for the answer.</p>${barsR || '<p class="slv-muted">No posts in these dates.</p>'}</div>
      <div class="scc-card"><h3>How often they post</h3><p class="scc-hint">Feed posts and reels together, over the same dates. Hover a row for the answer.</p>${barsP}</div>
    </div>
    <div class="scc-card"><h3>Side by side</h3><p class="scc-hint">Tap a figure to see the posts behind it. Every heading has a menu to sort or filter.</p>${tbl}</div>
    <h3 class="scc-h3">Posts that did best</h3>
    <p class="scc-hint">The five posts and reels of the salons we watch with the most likes and comments. Open one to see what they did.</p>
    <div class="scc-card scc-top">${topHt || '<p class="slv-muted">No posts in these dates.</p>'}</div>
    <p class="slv-muted scc-foot"><b>Not here:</b> views, reach and stories. Instagram keeps those private for other accounts, so they cannot be compared. Metricool reads the salons nightly.${history}</p>
  </div>`;
  return { summary, html };
}
