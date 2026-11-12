// Google Reviews downloads (Kate, 10 Nov 2026: every report gets an XLSX and a CSV button). The page is an iframe (add ons/google-reviews), so its two buttons sit
// by the list heading inside the frame and tell the dashboard (a trs-reviews-export message, dashboard.js); this file, loaded on that first click with
// report-export.js (group rv), asks the frame for what is on screen through app.js's reviewsSnapshot() (the reviews the page's filters leave, in the page's order)
// and hands report-export.js a model.
//   Reviews       one row a review: date, branch, stars, reviewer, what she wrote, whether we replied and what we said, who she named, photos, the link (this tab is the CSV)
//   By branch     count, average stars, complaints and replies per branch, from those reviews
//   Staff named   who clients name, with count, average and complaints
// The Branch and Period chips at the top, and the Refine filters (rating, staff, comments, no reply, photos, search), are the page's own, so the file is the list as it stands.
function reviewsExportModel() {
  const fr = document.getElementById('reviewsFrame'), w = fr && fr.contentWindow;
  let snap = null;
  try { snap = w && typeof w.reviewsSnapshot === 'function' ? w.reviewsSnapshot() : null; } catch (e) { snap = null; }
  if (!snap || !snap.rows || !snap.rows.length) return null;
  const rows = snap.rows, avg = a => a.length ? Math.round(100 * a.reduce((s, r) => s + r.stars, 0) / a.length) / 100 : null;
  const cols = [{ key: 'date', label: 'Date', fmt: 'text' }, { key: 'branch', label: 'Branch', fmt: 'text' }, { key: 'stars', label: 'Stars', fmt: 'num' }, { key: 'who', label: 'Reviewer', fmt: 'text' },
    { key: 'text', label: 'What she wrote', fmt: 'text' }, { key: 'replied', label: 'Replied', fmt: 'text' }, { key: 'reply', label: 'Our reply', fmt: 'text' }, { key: 'staff', label: 'Staff named', fmt: 'text' },
    { key: 'photos', label: 'Photos', fmt: 'num' }, { key: 'link', label: 'Link to the review', fmt: 'text' }];
  const sheets = [{ name: 'Reviews', title: 'Google Reviews', subtitle: `${snap.rangeLabel} · ${snap.branchLabel} · ${rows.length} review${rows.length === 1 ? '' : 's'} · ${snap.filterText}`,
    blocks: [{ cols, rows: rows.map(r => ({ cells: [r.date + (r.approx ? ' (approximate)' : ''), r.branch, r.stars, r.reviewer, r.comment, r.replied, r.reply, r.staff.join(', '), r.photos, r.link] })) }],
    legend: [['Date', 'The day Google shows; an approximate date comes from Google Maps when the exact one was not read.'], ['Replied', 'Marasy’s reviews come from Google’s email notices, which do not show replies, so its reply status is Unknown and it stays out of every reply figure.'],
      ['Staff named', 'Decided by the staff name variants table (every spelling we accept for each person), the client credit and hand tags, the same as the page.']] }];
  // By branch.
  const brs = [...new Set(rows.map(r => r.branch))];
  sheets.push({ name: 'By branch', title: 'By branch', subtitle: sheets[0].subtitle,
    blocks: [{ cols: [{ key: 'b', label: 'Branch', fmt: 'text' }, { key: 'n', label: 'Reviews', fmt: 'num' }, { key: 'avg', label: 'Average stars', fmt: 'aed2' }, { key: 'low', label: 'Complaints (1 to 3 stars)', fmt: 'num' },
      { key: 'five', label: 'Five stars', fmt: 'num' }, { key: 'rep', label: 'Replied', fmt: 'num' }, { key: 'repp', label: 'Replied %', fmt: 'pct' }],
      rows: brs.map(b => { const rs = rows.filter(r => r.branch === b), known = rs.filter(r => r.replied !== 'Unknown'), rep = known.filter(r => r.replied === 'Yes').length;
        return { cells: [b, rs.length, avg(rs), rs.filter(r => r.stars <= 3).length, rs.filter(r => r.stars === 5).length, known.length ? rep : null,
          { v: known.length ? Math.round(1000 * rep / known.length) / 10 : null, fmt: 'pct', f: A => `IF(N(${A('n')})>0,IF(ISNUMBER(${A('rep')}),${A('rep')}/${A('n')}*100,""),"")` }] }; }) }] });
  // Staff named.
  const by = {}; rows.forEach(r => r.staff.forEach(s => (by[s] = by[s] || []).push(r)));
  const names = Object.keys(by).sort((a, b) => by[b].length - by[a].length || a.localeCompare(b));
  if (names.length) sheets.push({ name: 'Staff named', title: 'Who clients name', subtitle: sheets[0].subtitle,
    blocks: [{ cols: [{ label: 'Staff', fmt: 'text' }, { label: 'Reviews naming her', fmt: 'num' }, { label: 'Average stars', fmt: 'aed2' }, { label: 'Complaints (1 to 3 stars)', fmt: 'num' }],
      rows: names.map(n => ({ cells: [n, by[n].length, avg(by[n]), by[n].filter(r => r.stars <= 3).length] })) }] });
  const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return { name: ['google-reviews', slug(snap.branchLabel), snap.from || 'all-time', snap.from ? 'to' : '', snap.to].filter(Boolean).join('-'), csv: 0, sheets };
}
