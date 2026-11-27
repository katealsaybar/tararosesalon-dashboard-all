// ============================================================
// TARA ROSE LADIES SALON: Out of Stock, "Download order forms"
// supabase/functions/oos-order-forms/index.ts   (Kate, 26 Nov 2026: the Email to DBD draft had no order forms attached; DBD wants its own Excel
// order forms, one per family and stock type, with the Order Qty. column filled. Kate said yes to a button that downloads them pre-filled.)
// ============================================================
//
// WHAT IT DOES
//   Given one salon and the products to order (barcode, name, brand, stock type, quantity), it finds DBD's own order forms in the Orders and Receipts store
//   (the xlsx files this mailbox sent to DBD, bucket order-files, listed in mail_documents, the last 120 days), puts each product's quantity into the
//   Order Qty. column of the form that holds it, clears every other quantity in that form, and returns the filled forms as xlsx files: one per form and
//   stock type ("SAADIYAT - ABC Order Form - RETAIL.xlsx"), because DBD wants a retail form and a professional form of each family.
//   A product is looked for by its DBD code when someone saved one by hand on the page (27 Nov 2026, dbd_code_links: the Code column of the form), else by EAN (the Stock List
//   barcode), else by its name (a name-only match must be a row of the product's own family: ABC, Alterna or Caviar, SKP), in the newest form this salon sent, then in the
//   newest forms of the other salons (same layout, different file). A product no form holds is returned in notFound, never dropped silently.
//   The form is edited in place (the sheet XML), so DBD's layout, formulas, logos and styles stay as they were. Forms differ a little: the Order column's
//   heading is blank in some (it is then the empty-headed column after Suggested RSP). The Total column's stored figures are recalculated and the workbook
//   is set to recalculate when opened.
//
// WHO CAN CALL IT
//   Anyone oos_access() lets in, checked with the caller's own token. Files are read with the service role, only the form files of DBD orders.
//   Nothing is written anywhere: the files come back in the answer and the browser saves them.
//
// Deploy: supabase functions deploy oos-order-forms --project-ref gvijxenafoowajqktqvd

import { createClient } from "npm:@supabase/supabase-js@2";
import JSZip from "npm:jszip@3.10.1";

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SALONS = ["KCA", "SAA", "MC", "AQ"];
const MAX_FILES = 40;
const BUDGET_MS = 100_000;

const ALLOWED_ORIGINS = ["https://trk-salon-os.com", "https://www.trk-salon-os.com", "https://katealsaybar.github.io"];
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;
function cors(origin: string | null): Record<string, string> {
  const ok = origin && (ALLOWED_ORIGINS.includes(origin) || LOCAL.test(origin));
  return {
    "access-control-allow-origin": ok ? origin! : ALLOWED_ORIGINS[0],
    "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
    "access-control-allow-methods": "POST, OPTIONS",
    "vary": "Origin",
  };
}
const json = (body: unknown, headers: Record<string, string>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, "content-type": "application/json" } });

const unesc = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const norm = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
const compact = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const digits = (s: unknown) => String(s ?? "").replace(/\D/g, "").replace(/^0+/, "");
const famOfBrand = (b: string) => /abc|authentic/i.test(b) ? "abc" : /caviar|alterna/i.test(b) ? "alt" : /schwarzkopf|skp|igora|blond/i.test(b) ? "skp" : "";
const famOfDesc = (d: string) => /^abc\b/i.test(d.trim()) ? "abc" : /^(caviar|alterna)/i.test(d.trim()) ? "alt" : "skp";
const colLetter = (n: number) => { let s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const colNum = (letters: string) => { let n = 0; for (const ch of letters) n = n * 26 + ch.charCodeAt(0) - 64; return n; };
const salonOf = (subject: string) => /saadiyat/i.test(subject) ? "SAA" : /khalifa/i.test(subject) ? "KCA" : /motor/i.test(subject) ? "MC" : /quoz/i.test(subject) ? "AQ" : "";
const num = (s: string) => { const m = /-?\d+(\.\d+)?/.exec(String(s).replace(/,/g, "")); return m ? parseFloat(m[0]) : 0; };

type Cell = { ref: string; col: string; colN: number; t: string; s: string; v: string };
type Row = { r: number; xml: string; cells: Cell[] };
type Form = { bytes: ArrayBuffer; zip: any; sheetPath: string; sheetXml: string; rows: Row[]; cols: { ean: string; desc: string; qty: string; total: string; wsp: string; size: string; code: string }; byEan: Map<string, Row>; byName: Map<string, Row>; byCode: Map<string, Row>; keys: { k: string; row: Row; fam: string }[]; hdrRow: number };

function parseSheet(xml: string, sst: string[]): Row[] {
  const rows: Row[] = [];
  for (const m of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const rn = /\br="(\d+)"/.exec(m[1]); if (!rn) continue;
    const cells: Cell[] = [];
    for (const c of (m[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /\br="([A-Z]+)(\d+)"/.exec(c[1]); if (!ref) continue;
      const t = (/\bt="([^"]*)"/.exec(c[1]) || [, ""])[1] as string, s = (/\bs="([^"]*)"/.exec(c[1]) || [, ""])[1] as string;
      let v = "";
      const inner = c[2] ?? "";
      if (t === "inlineStr") v = unesc([...inner.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(""));
      else { const vv = /<v>([\s\S]*?)<\/v>/.exec(inner); if (vv) v = t === "s" ? (sst[parseInt(vv[1])] ?? "") : unesc(vv[1]); }
      cells.push({ ref: ref[1] + ref[2], col: ref[1], colN: colNum(ref[1]), t, s, v });
    }
    rows.push({ r: parseInt(rn[1]), xml: m[0], cells });
  }
  return rows;
}

async function openForm(bytes: ArrayBuffer): Promise<Form | null> {
  const zip = await JSZip.loadAsync(bytes);
  const sstXml = await zip.file("xl/sharedStrings.xml")?.async("string");
  const sst: string[] = [];
  if (sstXml) for (const m of sstXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) sst.push(unesc([...m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join("")));
  const sheetPaths = Object.keys(zip.files).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort();
  for (const sheetPath of sheetPaths) {
    const sheetXml = await zip.file(sheetPath)!.async("string");
    const rows = parseSheet(sheetXml, sst);
    const hdr = rows.find((r) => r.cells.some((c) => /^ean$/i.test(c.v.trim())) && r.cells.some((c) => /^description/i.test(c.v.trim())));
    if (!hdr) continue;
    const find = (re: RegExp) => (hdr.cells.find((c) => re.test(c.v.trim())) || { col: "" }).col;
    const cols: any = { ean: find(/^ean$/i), desc: find(/^description/i), qty: find(/^order/i), total: find(/^total/i), wsp: find(/^wsp/i), size: find(/^size/i), code: find(/^code$/i) };
    if (!cols.qty && cols.ean) {
      const anchor = hdr.cells.find((c) => /^suggested/i.test(c.v.trim())) || hdr.cells.find((c) => /^wsp/i.test(c.v.trim()));
      if (anchor && anchor.colN + 1 < colNum(cols.ean)) { const nx = colLetter(anchor.colN + 1), nc = hdr.cells.find((c) => c.col === nx); if (!nc || !nc.v.trim()) cols.qty = nx; }
    }
    if (!cols.ean || !cols.qty) continue;
    const byEan = new Map<string, Row>(), byName = new Map<string, Row>(), byCode = new Map<string, Row>(), keys: { k: string; row: Row; fam: string }[] = [];
    for (const r of rows) {
      if (r.r <= hdr.r) continue;
      const ean = digits(r.cells.find((c) => c.col === cols.ean)?.v), nm = norm(r.cells.find((c) => c.col === cols.desc)?.v);
      const code = cols.code ? digits(r.cells.find((c) => c.col === cols.code)?.v) : "";
      if (ean && !byEan.has(ean)) byEan.set(ean, r);
      if (nm && !byName.has(nm)) byName.set(nm, r);
      if (code && !byCode.has(code)) byCode.set(code, r);
      const d = r.cells.find((c) => c.col === cols.desc)?.v, sz = cols.size ? r.cells.find((c) => c.col === cols.size)?.v : "";
      if (d) { const fam = famOfDesc(d); keys.push({ k: compact(d), row: r, fam }); if (sz) keys.push({ k: compact(d) + compact(sz), row: r, fam }); }
    }
    return { bytes, zip, sheetPath, sheetXml, rows, cols, byEan, byName, byCode, keys, hdrRow: hdr.r };
  }
  return null;
}

// put (or clear) a value in one cell of a row's XML, keeping the cell's style; a missing cell is added in column order
function setCell(rowXml: string, rowNo: number, col: string, value: number | null, keepFormula: boolean): string {
  const ref = col + rowNo;
  const re = new RegExp(`<c\\b[^>]*\\br="${ref}"[^>]*?(?:/>|>[\\s\\S]*?</c>)`);
  const m = re.exec(rowXml);
  const body = value == null ? "" : `<v>${value}</v>`;
  if (m) {
    const attrs = /<c\b([^>]*?)\/?>/.exec(m[0])![1].replace(/\s*\bt="[^"]*"/, "");
    const f = keepFormula ? (/<f\b[\s\S]*?(?:\/>|<\/f>)/.exec(m[0]) || [""])[0] : "";
    const inner = f + body;
    return rowXml.replace(m[0], inner ? `<c${attrs}>${inner}</c>` : `<c${attrs}/>`);
  }
  if (value == null) return rowXml;
  const cell = `<c r="${ref}">${body}</c>`;
  const n = colNum(col);
  for (const c of rowXml.matchAll(/<c\b[^>]*\br="([A-Z]+)\d+"/g)) { if (colNum(c[1]) > n) { const at = rowXml.indexOf(c[0]); return rowXml.slice(0, at) + cell + rowXml.slice(at); } }
  return rowXml.replace(/<\/row>$/, cell + "</row>");
}

// put a text in one cell of a row's XML (an inline string), keeping the cell's style, or the style given when the cell is missing; a missing cell is added in column order
function setText(rowXml: string, rowNo: number, col: string, text: string, style: string): string {
  const ref = col + rowNo;
  const re = new RegExp(`<c\\b[^>]*\\br="${ref}"[^>]*?(?:/>|>[\\s\\S]*?</c>)`);
  const m = re.exec(rowXml);
  if (m) {
    const attrs = /<c\b([^>]*?)\/?>/.exec(m[0])![1].replace(/\s*\bt="[^"]*"/, "");
    return rowXml.replace(m[0], () => `<c${attrs} t="inlineStr"><is><t>${text}</t></is></c>`);
  }
  const cell = `<c r="${ref}"${style ? ` s="${style}"` : ""} t="inlineStr"><is><t>${text}</t></is></c>`;
  const n = colNum(col);
  for (const c of rowXml.matchAll(/<c\b[^>]*\br="([A-Z]+)\d+"/g)) { if (colNum(c[1]) > n) { const at = rowXml.indexOf(c[0]); return rowXml.slice(0, at) + cell + rowXml.slice(at); } }
  return rowXml.replace(/<\/row>$/, () => cell + "</row>");
}

// a whole row (a label in one column, a number in another), put in the sheet at row n: it replaces a blank row that is already there, or is added in row order
function putRow(xml: string, n: number, cells: { col: string; text?: string; value?: number; style: string }[]): string {
  const body = cells.slice().sort((x, y) => colNum(x.col) - colNum(y.col)).map((c) => {
    const st = c.style ? ` s="${c.style}"` : "";
    return c.text !== undefined ? `<c r="${c.col}${n}"${st} t="inlineStr"><is><t>${c.text}</t></is></c>` : `<c r="${c.col}${n}"${st}><v>${c.value}</v></c>`;
  }).join("");
  const rowXml = `<row r="${n}">${body}</row>`;
  const m = new RegExp(`<row\\b[^>]*\\br="${n}"[^>]*?(?:/>|>[\\s\\S]*?</row>)`).exec(xml);
  if (m) return xml.replace(m[0], () => rowXml);
  for (const x of xml.matchAll(/<row\b[^>]*\br="(\d+)"/g)) { if (parseInt(x[1]) > n) { const at = xml.indexOf(x[0]); return xml.slice(0, at) + rowXml + xml.slice(at); } }
  return xml.replace("</sheetData>", () => rowXml + "</sheetData>");
}

// Our own look inside DBD's form (Kate, 27 Nov 2026: "qty and cost should be in our brand format if it is not in the xlsx originally"): what DBD's form already has keeps DBD's look;
// what we add (the Order Qty. heading and figures, a Total (AED) column when the form has none, the two total lines) is mint, like the dashboard. The styles are added to the workbook's own styles.xml.
async function brandStyles(zip: any): Promise<{ head: string; qty: string; tot: string; totAed: string }> {
  const path = "xl/styles.xml";
  let x: string | undefined = await zip.file(path)?.async("string");
  const none = { head: "", qty: "", tot: "", totAed: "" };
  if (!x) return none;
  const add = (tag: string, items: string[]): number => {   // adds items to the end of the list <tag count="n">, returns the index of the first one added
    const re = new RegExp(`<${tag}\\b([^>]*?)count="(\\d+)"([^>]*)>`);
    const m = re.exec(x!); if (!m || !x!.includes(`</${tag}>`)) return -1;
    const first = parseInt(m[2]);
    x = x!.replace(re, `<${tag}$1count="${first + items.length}"$3>`).replace(`</${tag}>`, () => items.join("") + `</${tag}>`);
    return first;
  };
  const fo = add("fonts", ['<font><b/><sz val="11"/><color rgb="FF1A1A1A"/><name val="Georgia"/><family val="1"/></font>', '<font><b/><sz val="11"/><color rgb="FF0B3D36"/><name val="Calibri"/><family val="2"/></font>']);
  const fi = add("fills", ["99F6E4", "E6FCF8", "F3FEFB"].map((c) => `<fill><patternFill patternType="solid"><fgColor rgb="FF${c}"/><bgColor indexed="64"/></patternFill></fill>`));
  const bo = add("borders", ['<border><left style="thin"><color rgb="FF555555"/></left><right style="thin"><color rgb="FF555555"/></right><top style="thin"><color rgb="FF555555"/></top><bottom style="thin"><color rgb="FF555555"/></bottom><diagonal/></border>']);
  const xf = (nf: number, f: number, fl: number) => `<xf numFmtId="${nf}" fontId="${f}" fillId="${fl}" borderId="${bo}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>`;
  const xs = add("cellXfs", [xf(0, fo, fi), xf(0, fo + 1, fi + 1), xf(4, fo + 1, fi + 2), xf(4, fo, fi)]);
  if (fo < 0 || fi < 0 || bo < 0 || xs < 0) return none;
  zip.file(path, x);
  return { head: String(xs), qty: String(xs + 1), tot: String(xs + 2), totAed: String(xs + 3) };
}

// a cell put in a row's XML in column order (the row may have no cells at all)
function insertCell(rowXml: string, col: string, cell: string): string {
  const n = colNum(col);
  let out = "";
  const at = (() => { for (const c of rowXml.matchAll(/<c\b[^>]*\br="([A-Z]+)\d+"/g)) { if (colNum(c[1]) > n) return rowXml.indexOf(c[0]); } return -1; })();
  if (at >= 0) out = rowXml.slice(0, at) + cell + rowXml.slice(at);
  else if (/<\/row>$/.test(rowXml)) out = rowXml.replace(/<\/row>$/, () => cell + "</row>");
  else out = rowXml.replace(/\s*\/>$/, () => `>${cell}</row>`);
  return out.replace(/(<row\b[^>]*?)\sspans="[^"]*"/, "$1");   // the spans hint no longer fits once a cell is added
}

// a cell with a number or a text and a style, replacing the cell that is there
function putCell(rowXml: string, rowNo: number, col: string, value: number | undefined, text: string | undefined, style: string): string {
  const ref = col + rowNo, st = style ? ` s="${style}"` : "";
  const cell = text !== undefined ? `<c r="${ref}"${st} t="inlineStr"><is><t>${text}</t></is></c>` : `<c r="${ref}"${st}><v>${value}</v></c>`;
  const m = new RegExp(`<c\\b[^>]*\\br="${ref}"[^>]*?(?:/>|>[\\s\\S]*?</c>)`).exec(rowXml);
  return m ? rowXml.replace(m[0], () => cell) : insertCell(rowXml, col, cell);
}

// only the style of a cell changed, its content kept (an empty styled cell is made when there is none)
function styleCell(rowXml: string, rowNo: number, col: string, style: string): string {
  if (!style) return rowXml;
  const ref = col + rowNo;
  const m = new RegExp(`<c\\b[^>]*\\br="${ref}"[^>]*?(?:/>|>[\\s\\S]*?</c>)`).exec(rowXml);
  if (!m) return insertCell(rowXml, col, `<c r="${ref}" s="${style}"/>`);
  const open = /<c\b([^>]*?)(\/?)>/.exec(m[0])!;
  const attrs = /\bs="[^"]*"/.test(open[1]) ? open[1].replace(/\bs="[^"]*"/, `s="${style}"`) : `${open[1]} s="${style}"`;
  return rowXml.replace(m[0], () => m[0].replace(open[0], `<c${attrs}${open[2]}>`));
}

Deno.serve(async (req: Request) => {
  const CORS = cors(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, CORS, 405);
  let body: { salon?: string; items?: { bc?: string; nm?: string; q?: number; brand?: string; type?: string; code?: string }[] };
  try { body = await req.json(); } catch { return json({ error: "invalid JSON body" }, CORS, 400); }
  const salon = String(body.salon ?? "").toUpperCase();
  if (!SALONS.includes(salon)) return json({ error: "salon must be KCA, SAA, MC or AQ" }, CORS, 400);
  const items = (Array.isArray(body.items) ? body.items : []).map((x) => ({ bc: digits(x.bc), code: digits(x.code), nm: norm(x.nm), name: String(x.nm ?? ""), fam: famOfBrand(String(x.brand ?? "")), type: /prof/i.test(String(x.type ?? "")) ? "PROFESSIONAL" : "RETAIL", q: Math.round(Number(x.q) || 0) })).filter((x) => x.q > 0).slice(0, 600);
  if (!items.length) return json({ error: "Nothing to order for this salon." }, CORS, 400);

  const auth = req.headers.get("authorization") || "";
  if (!/^Bearer\s+\S+/i.test(auth)) return json({ error: "Sign in first." }, CORS, 401);
  const user = createClient(SUPA_URL, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const acc = await user.rpc("oos_access");
  if (acc.error || !acc.data || acc.data.view !== true) return json({ error: "This is for coordinators and above." }, CORS, 403);

  const t0 = Date.now();
  const sb = createClient(SUPA_URL, SERVICE, { auth: { persistSession: false } });
  const since = new Date(Date.now() - 120 * 864e5).toISOString().slice(0, 10);
  const docs = await sb.from("mail_documents").select("doc_date, subject, file_name, file_path").ilike("supplier", "dbd%").eq("kind", "order").eq("has_file", true).gte("doc_date", since).order("doc_date", { ascending: false }).limit(400);
  if (docs.error) return json({ error: "The order forms could not be listed." }, CORS, 500);
  const seen = new Set<string>();
  const cand = (docs.data || []).filter((d: any) => d.file_path && /\.xlsx$/i.test(d.file_path) && !seen.has(d.file_path) && seen.add(d.file_path))
    .map((d: any) => ({ ...d, salon: salonOf(String(d.subject || "")) }));
  // Speed (27 Nov 2026): when every product has its DBD code, only the forms whose text holds one of these codes are worth opening (the page keeps the text of every form it
  // read, mail_documents.file_text). Reading all of them took 6 to 19 seconds and once ran out of resources. Any problem with this look-up and every form is read, as before.
  let cands = cand;
  const wanted = [...new Set(items.map((x) => x.code).filter(Boolean))];
  if (wanted.length && items.every((x) => x.code)) {
    const hit = await sb.from("mail_documents").select("file_path").ilike("supplier", "dbd%").eq("kind", "order").eq("has_file", true).gte("doc_date", since)
      .or(wanted.map((c) => `file_text.ilike.%${c}%`).join(",")).limit(400);
    if (!hit.error && hit.data) { const keep = new Set(hit.data.map((r: any) => r.file_path)); cands = cand.filter((d: any) => keep.has(d.file_path)); }
  }
  const order = cands.filter((d: any) => d.salon === salon).concat(cands.filter((d: any) => d.salon !== salon));

  // go through the forms, newest first (this salon's first), until every product has a home
  const todo = new Set(items.map((_, i) => i));
  const used: { cand: any; form: Form; hits: { i: number; row: Row }[] }[] = [];
  let opened = 0;
  for (const d of order) {
    if (!todo.size || opened >= MAX_FILES || Date.now() - t0 > BUDGET_MS) break;
    try {
      const dl = await sb.storage.from("order-files").download(d.file_path);
      if (dl.error || !dl.data) continue;
      opened++;
      const form = await openForm(await dl.data.arrayBuffer());
      if (!form) continue;
      const hits: { i: number; row: Row }[] = [];
      for (const i of [...todo]) {
        const it = items[i];
        const ik = compact(it.name);
        const pool = it.fam ? form.keys.filter((x) => x.fam === it.fam) : [];
        const fuzzy = ik.length >= 8 && pool.length ? (pool.find((x) => x.k === ik) || pool.find((x) => x.k.length > ik.length && x.k.endsWith(ik)) || pool.find((x) => ik.length > x.k.length + 2 && x.k.length >= 5 && ik.startsWith(x.k)))?.row : undefined;
        const row = (it.code && form.byCode.get(it.code)) || (it.bc && form.byEan.get(it.bc)) || (it.nm && form.byName.get(it.nm)) || fuzzy || null;
        if (row) { hits.push({ i, row }); todo.delete(i); }
      }
      if (hits.length) used.push({ cand: d, form, hits });
    } catch (e) { console.error("[oos-order-forms] form skipped", String((e as Error)?.message || e)); }
  }

  // fill each form that holds products: one file per form and stock type, every Order Qty. cleared, then the quantities put in
  const SALON_NAME: Record<string, string> = { KCA: "KHALIFA CITY A", SAA: "SAADIYAT", MC: "MOTOR CITY", AQ: "AL QUOZ" };
  const files: any[] = [];
  const names = new Set<string>();
  const leftover: { name: string; q: number }[] = [];
  for (const u of used) {
    for (const type of ["RETAIL", "PROFESSIONAL"]) {
      const hits = u.hits.filter((h) => items[h.i].type === type);
      if (!hits.length) continue;
      const f = u.form;
      // the family of the form, from what its rows are: the stored file name is not always the form's own (a Motor City "BM" file can hold ABC rows)
      const cnt: Record<string, number> = {}; for (const k of f.keys) cnt[k.fam] = (cnt[k.fam] || 0) + 1;
      const fam = Object.keys(cnt).sort((x, y) => cnt[y] - cnt[x])[0] || "skp";
      const label = fam === "abc" ? "ABC" : fam === "alt" ? "ALTERNA" : /\bBM\b|blond/i.test(String(u.cand.file_name)) ? "BM" : "SKP";
      // ONE form per family and stock type, the newest (27 Nov 2026, Kate: "bakit may duplicates?"): a product only an older price list holds (often one DBD no longer lists) used to make a second
      // file, "(2)". It now stays out of the form and comes back in notFound; the email body lists every line anyway.
      const name = `${SALON_NAME[salon]} - ${label} Order Form - ${type}.xlsx`;
      if (names.has(name)) { for (const h of hits) leftover.push({ name: items[h.i].name, q: items[h.i].q }); continue; }
      names.add(name);
      const zip = await JSZip.loadAsync(u.form.bytes), want = new Map<number, number>();
      const st = await brandStyles(zip);
      const hdrR = f.rows.find((r) => r.r === f.hdrRow);
      const statusCol = hdrR?.cells.find((c) => /^status/i.test(c.v.trim()))?.col || f.cols.ean;
      const addTotal = !f.cols.total, totCol = f.cols.total || colLetter(colNum(statusCol) + 1);   // a form with no Total column gets one after Status
      for (const h of hits) want.set(h.row.r, (want.get(h.row.r) || 0) + items[h.i].q);
      let xml = f.sheetXml;
      for (const r of f.rows) {
        if (r.r <= f.hdrRow) continue;
        const q = want.get(r.r) ?? null;
        const had = r.cells.find((c) => c.col === f.cols.qty)?.v;
        if (q == null && (had === undefined || had === "")) continue;
        let rowXml = setCell(r.xml, r.r, f.cols.qty, q, false);
        if (q != null) rowXml = styleCell(rowXml, r.r, f.cols.qty, st.qty);
        if (addTotal && q != null) rowXml = putCell(rowXml, r.r, totCol, Math.round(q * num(r.cells.find((c) => c.col === f.cols.wsp)?.v ?? "") * 100) / 100, undefined, st.tot);
        if (f.cols.total) {
          const wsp = num(r.cells.find((c) => c.col === f.cols.wsp)?.v ?? "");
          const tc = r.cells.find((c) => c.col === f.cols.total);
          if (tc) rowXml = setCell(rowXml, r.r, f.cols.total, q == null ? 0 : Math.round(q * wsp * 100) / 100, true);
        }
        xml = xml.replace(r.xml, () => rowXml);
      }
      // heading: the Order column is named and branded (some of DBD's forms leave it blank); a form with no Total column gets "Total (AED)"
      if (hdrR) {
        const hq = hdrR.cells.find((c) => c.col === f.cols.qty);
        let hx = hdrR.xml;
        if (!hq || !hq.v.trim()) hx = setText(hx, hdrR.r, f.cols.qty, "Order Qty.", st.head);
        hx = styleCell(hx, hdrR.r, f.cols.qty, st.head);
        if (addTotal) hx = putCell(hx, hdrR.r, totCol, undefined, "Total (AED)", st.head);
        xml = xml.replace(hdrR.xml, () => hx);
      }
      // the two total lines under the last product, in our colours: the quantity under Order Qty., the AED (at the price list price) under Total
      let totQ = 0, totA = 0, lastR = f.hdrRow;
      for (const h of hits) { totQ += items[h.i].q; totA += items[h.i].q * num(h.row.cells.find((c) => c.col === f.cols.wsp)?.v ?? ""); }
      for (const r of f.rows) { if (r.r > f.hdrRow && (r.cells.find((c) => c.col === f.cols.desc)?.v || "").trim()) lastR = Math.max(lastR, r.r); }
      xml = putRow(xml, lastR + 2, [{ col: f.cols.desc, text: "TOTAL QTY", style: st.head }, { col: f.cols.qty, value: totQ, style: st.head }]);
      xml = putRow(xml, lastR + 3, [{ col: f.cols.desc, text: "TOTAL (AED, at WSP)", style: st.head }, { col: totCol, value: Math.round(totA * 100) / 100, style: st.totAed }]);
      xml = xml.replace(/<dimension ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"\/>/, (_m: string, c1: string, r1: string, c2: string, r2: string) => `<dimension ref="${c1}${r1}:${colLetter(Math.max(colNum(c2), colNum(totCol)))}${Math.max(parseInt(r2), lastR + 3)}"/>`);
      zip.file(f.sheetPath, xml);
      const wbPath = "xl/workbook.xml";
      let wb = await zip.file(wbPath)?.async("string");
      if (wb) {
        wb = /<calcPr\b[^>]*\/>/.test(wb) ? wb.replace(/<calcPr\b([^>]*?)\/>/, (_m: string, a: string) => `<calcPr${a.replace(/\sfullCalcOnLoad="[^"]*"/, "")} fullCalcOnLoad="1"/>`) : wb;
        zip.file(wbPath, wb);
      }
      const out = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
      let bin = ""; for (let i = 0; i < out.length; i += 0x8000) bin += String.fromCharCode(...out.subarray(i, i + 0x8000));
      files.push({ name, b64: btoa(bin), products: hits.length, template: { file: u.cand.file_name, date: u.cand.doc_date, subject: u.cand.subject } });
    }
  }
  const notFound = [...todo].map((i) => ({ name: items[i].name, q: items[i].q })).concat(leftover);
  console.log("[oos-order-forms]", salon, "items", items.length, "forms read", opened, "forms filled", files.length, "not found", notFound.length, "ms", Date.now() - t0);
  return json({ files, notFound, formsRead: opened, took_ms: Date.now() - t0 }, CORS);
});
