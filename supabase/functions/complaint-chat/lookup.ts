// The respond.io side of a complaint record (Kate, 12 Nov 2026): find the client's chat and return the messages around the complaint.
// Read only: it only GETs contacts and messages, and POSTs the contact search (a search, not a write). The token never leaves this function.
// A phone finds her exactly. A name finds possible people, and the page asks a person to confirm which one (Instagram and Facebook have no phone).
const API = "https://api.respond.io/v2";
const CHANNELS: Record<number, string> = {
  340071: "WhatsApp SAA", 346361: "WhatsApp MC", 354400: "WhatsApp KCA", 356339: "WhatsApp AQ",
  572200: "WhatsApp Brand number", 569496: "WhatsApp Brand number", 571908: "Instagram", 571909: "Facebook",
  571743: "TikTok", 339373: "Website chat",
};

async function rio(token: string, method: string, path: string, body?: unknown) {
  const r = await fetch(API + path, {
    method,
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let data: any = null;
  try { data = JSON.parse(text); } catch (_) { data = null; }
  return { status: r.status, data };
}

// A Phorest or typed number to the +971... form respond.io holds. Anything that does not look like a number gives null.
export function normPhone(raw: unknown): string | null {
  let d = String(raw ?? "").replace(/[^0-9]/g, "");
  if (!d) return null;
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 10 && d.startsWith("05")) d = "971" + d.slice(1);
  else if (d.length === 9 && d.startsWith("5")) d = "971" + d;
  return d.length >= 8 && d.length <= 15 ? "+" + d : null;
}

const contactCard = (c: any) => ({
  id: c.id,
  name: [c.firstName, c.lastName].filter(Boolean).join(" "),
  phone: c.phone || null,
  email: c.email || null,
  status: c.status || null,
  lifecycle: c.lifecycle || null,
  tags: c.tags || [],
  assignee: c.assignee ? [c.assignee.firstName, c.assignee.lastName].filter(Boolean).join(" ") : null,
});

function bodyText(m: any): string {
  const x = m.message || {};
  if (x.text) return String(x.text);
  const tpl = x.template && Array.isArray(x.template.components) ? x.template.components.find((c: any) => c.type === "body") : null;
  if (tpl && tpl.text) return String(tpl.text);
  if (x.attachment) return x.attachment.description ? String(x.attachment.description) : "";   // a photo has no words of its own: the page shows the photo
  return x.type ? "[" + x.type + "]" : "[message]";
}

// A photo, video, voice note or file she sent. The link opens without a login (checked 12 Nov 2026), so the page shows it from there; nothing is copied or stored.
function attInfo(m: any) {
  const a = m.message && m.message.attachment;
  if (!a || !a.url) return null;
  return { type: a.type || "file", url: String(a.url), mime: a.mimeType || a.mime || null, name: a.fileName || null };
}

async function messages(token: string, id: number, dateIso: string | null) {
  const from = dateIso ? Date.parse(dateIso + "T00:00:00+04:00") - 4 * 86400000 : 0;
  const to = dateIso ? Date.parse(dateIso + "T00:00:00+04:00") + 14 * 86400000 : Infinity;
  const out: any[] = [];
  let cursor = "";
  for (let page = 0; page < 10; page++) {
    const r = await rio(token, "GET", "/contact/id:" + id + "/message/list?limit=50" + (cursor ? "&cursorId=" + cursor : ""));
    if (r.status !== 200 || !r.data) break;
    const items: any[] = r.data.items || [];
    let oldest = Infinity;
    for (const m of items) {
      const ts = Math.floor(Number(m.messageId) / 1000);
      oldest = Math.min(oldest, ts);
      if (ts < from || ts > to) continue;
      out.push({ w: m.traffic === "incoming" ? "c" : "s", ts, ch: CHANNELS[m.channelId] || "Chat", text: bodyText(m), att: attInfo(m) });
    }
    const next = r.data.pagination && r.data.pagination.next;
    if (!next || !items.length || oldest < from) break;
    cursor = String(next).split("cursorId=")[1]?.split("&")[0] || "";
    if (!cursor) break;
  }
  out.sort((a, b) => a.ts - b.ts);
  return dateIso ? out.slice(0, 80) : out.slice(-40);
}

// body: { contact_id?, phone?, name?, date? (the complaint's day, YYYY-MM-DD) }
export async function lookup(token: string, body: any) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.date || "")) ? String(body.date) : null;
  let card: any = null;
  const cid = Number(body?.contact_id) || 0;
  if (cid) {
    const r = await rio(token, "GET", "/contact/id:" + cid);
    if (r.status === 200 && r.data) card = contactCard(r.data);
  }
  const phone = normPhone(body?.phone);
  if (!card && phone) {
    const r = await rio(token, "GET", "/contact/phone:" + phone);
    if (r.status === 200 && r.data) card = contactCard(r.data);
  }
  if (card) {
    return { status: "found", how: cid ? "confirmed" : "phone", contact: card, messages: await messages(token, card.id, date) };
  }
  const name = String(body?.name || "").trim();
  if (name.length >= 3 && !cid) {
    const r = await rio(token, "POST", "/contact/list?limit=6", { search: name, timezone: "Asia/Dubai", filter: { $and: [] } });
    const items: any[] = r.status === 200 && r.data && Array.isArray(r.data.items) ? r.data.items : [];
    if (items.length) return { status: "possible", how: "name", candidates: items.map(contactCard) };
  }
  return { status: "none" };
}
