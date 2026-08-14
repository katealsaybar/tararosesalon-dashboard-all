/* ============================================================
   TARA ROSE LADIES SALON — Organisation Pulse narrative (client)
   pulse-narrative.js
   ============================================================

   Asks the pulse-narrative Edge Function for this period's prose. Returns null
   on anything going wrong — no key, function down, figures rejected — and the
   caller keeps its static copy. The page must never be blank because the
   narrative was unavailable, and it must never show a figure this file didn't
   send, which is why validation lives on the function side rather than here.

   Wiring in is two lines. In index.html, after dashboard.js:
     <script src="pulse-narrative.js"></script>
   and at the point the stats object `s` is ready:
     const copy = await fetchPulseNarrative(s, periodLabel, branchLabel);
     if (copy) applyPulseNarrative(copy);
   ============================================================ */

// Only these keys are sent, and only when they are real numbers. A field the
// current aggregation path didn't populate is left out rather than sent as 0 —
// a zero reads as a fact and the model would write about it.
const PULSE_FACT_KEYS = [
  'netTake', 'totalClients', 'avgBill',
  'hairServicesIncl', 'hairSalesNet', 'hairTotalClients', 'hairAvgBill', 'hairRebookPct', 'hairNCR', 'hairNewClients',
  'beautySales', 'beautyServicesTotal', 'beautyTotalClients', 'beautyAvgBill', 'beautyRebookPct', 'beautyNCR', 'beautyNewClients',
  'treatmentSales', 'treatmentPct', 'hairRetail', 'retailTotal', 'hairRetailPct',
  'rebookPct', 'totalRebooked', 'newClientsTotal', 'ncrPct', 'utilisationPct',
];

function pulseFacts(s, targets) {
  const facts = {};
  PULSE_FACT_KEYS.forEach(k => {
    const v = s?.[k];
    if (typeof v === 'number' && Number.isFinite(v)) facts[k] = Math.round(v * 100) / 100;
  });
  // Targets are facts too — without them the model can't say how far off we are.
  Object.entries(targets || {}).forEach(([k, v]) => {
    if (typeof v === 'number' && Number.isFinite(v)) facts['target_' + k] = v;
  });
  return Object.assign(facts, pulseDerived(facts));
}

/**
 * The figures prose naturally reaches for that aren't raw fields: shares of the
 * whole, distance from target, attainment. Computed here on purpose — the model
 * is not allowed to write a figure it wasn't given, so anything it might
 * legitimately say has to be handed to it. Tested 12 Aug 2026: without this the
 * function rejects true sentences like "hair is 92% of everything that came in".
 */
function pulseDerived(facts) {
  const d = {};
  const put = (k, v) => { if (typeof v === 'number' && Number.isFinite(v)) d[k] = v; };
  const share = (a, b) => (typeof facts[a] === 'number' && facts[b])
    ? Math.round((facts[a] / facts[b]) * 10000) / 100
    : undefined;

  put('hairShareOfNetTake',   share('hairSalesNet', 'netTake'));
  put('beautyShareOfNetTake', share('beautySales', 'netTake'));
  put('hairShareOfClients',   share('hairTotalClients', 'totalClients'));
  put('beautyShareOfClients', share('beautyTotalClients', 'totalClients'));

  Object.keys(facts).filter(k => k.indexOf('target_') === 0).forEach(tk => {
    const metric = tk.slice(7);
    const actual = facts[metric], target = facts[tk];
    if (typeof actual !== 'number' || typeof target !== 'number' || !target) return;
    put('gapTo_' + metric, Math.round((target - actual) * 100) / 100);
    put('attainment_' + metric, Math.round((actual / target) * 10000) / 100);
  });
  return d;
}

/**
 * @param {object} s            the computed stats object (whichever path built it)
 * @param {string} periodLabel  e.g. '1 July – 12 August 2026'
 * @param {string} branchLabel  e.g. 'All Branches'
 * @returns {Promise<object|null>} the narrative, or null — always check before using
 */
async function fetchPulseNarrative(s, periodLabel, branchLabel) {
  try {
    const facts = pulseFacts(s, typeof TARGETS !== 'undefined' ? TARGETS : {});
    if (!Object.keys(facts).length) return null;

    const { data, error } = await sb.functions.invoke('pulse-narrative', {
      body: {
        period_key: `${periodLabel}|${branchLabel}`,
        labels: { period: periodLabel, branches: branchLabel },
        facts,
      },
    });
    if (error) throw error;
    if (!data || !data.copy) {
      // 422 means the model wrote a figure that isn't in the data and the
      // function refused it. Worth seeing in the console rather than swallowing.
      if (data?.unsupported_figures) {
        console.warn('[pulse] narrative rejected — unsupported figures:', data.unsupported_figures);
      }
      return null;
    }
    return data.copy;
  } catch (e) {
    console.warn('[pulse] narrative unavailable, keeping static copy —', e?.message || e);
    return null;
  }
}

/**
 * Writes the narrative into the page. Every target is optional: a missing
 * element is skipped, so this works on a page that only uses some of the copy.
 */
function applyPulseNarrative(copy) {
  const set = (sel, text) => {
    const el = document.querySelector(sel);
    if (el && typeof text === 'string' && text.trim()) el.textContent = text;
  };

  // Headline carries an <em> span the page colours. Rebuild it rather than
  // setting textContent, or the emphasis is lost.
  const h1 = document.querySelector('.hero h1');
  if (h1 && copy.headline) {
    const em = copy.headline_emphasis;
    if (em && copy.headline.includes(em)) {
      const [before, ...rest] = copy.headline.split(em);
      h1.textContent = '';
      h1.append(document.createTextNode(before));
      const emEl = document.createElement('em');
      emEl.textContent = em;
      h1.append(emEl, document.createTextNode(rest.join(em)));
    } else {
      h1.textContent = copy.headline;
    }
  }

  // Swaps the trailing text of an element while leaving its label element alone,
  // for the shapes that read "<span>Hair</span> — text" or "<b>LABEL</b>text".
  const replaceTail = (el, text, prefix = '') => {
    if (!el || typeof text !== 'string' || !text.trim()) return;
    while (el.lastChild && el.lastChild.nodeType !== Node.ELEMENT_NODE) el.removeChild(el.lastChild);
    el.append(document.createTextNode(prefix + text));
  };

  // ── The harmonised Organisation Pulse layout ──────────────
  set('.deck', copy.deck);
  set('.standfirst', copy.standfirst);
  set('.read-col:not(.b) .read-h', copy.hair_read?.heading);
  set('.read-col:not(.b) .read-p', copy.hair_read?.body);
  set('.read-col.b .read-h', copy.beauty_read?.heading);
  set('.read-col.b .read-p', copy.beauty_read?.body);
  set('.action h2', copy.fix_first?.headline);
  set('.action .why', copy.fix_first?.why);

  const chks = document.querySelectorAll('.action .checks .chk');
  replaceTail(chks[0], copy.fix_first?.check);
  replaceTail(chks[1], copy.fix_first?.worth);

  // ── The live dashboard (index.html) ───────────────────────
  // Only the at-a-glance pair exists there today: two columns whose prose is
  // otherwise assembled from templated clauses in computeAtAGlanceExplanation.
  // The bold "Hair" / "Beauty" label is an element child, so keep it and swap
  // only the sentence after the em dash.
  replaceTail(document.querySelector('.glance-hair'), copy.hair_read?.body, ' — ');
  replaceTail(document.querySelector('.glance-beauty'), copy.beauty_read?.body, ' — ');
}
