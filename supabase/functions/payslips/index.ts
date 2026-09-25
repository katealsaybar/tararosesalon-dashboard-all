// ============================================================
// TARA ROSE LADIES SALON — Payslips
// supabase/functions/payslips/index.ts
// ============================================================
//
// The only way into the private `payslips` bucket (Kate, 25 Sep 2026). The
// anon key can't read the bucket or the payslips table; this function checks a
// token on every call and hands out short-lived signed links, never the file
// path itself.
//
//   list    admin token (payroll or leader) + month → who has a payslip
//   upload  admin token + month + staff_id + PDF (multipart) → stored, replaces
//   url     admin token + month + staff_id → 10-minute signed link
//   delete  admin token + month + staff_id → removed
//   mine    staff token (their performance-page token) + month → their own
//           link, or { exists: false }. Used by the stylist page and by
//           apps-script/monthly-performance-email.gs to attach the PDF.
//
// Payroll tokens (perf_admins.role = 'payroll', the accounts / admin team) can
// only do payslips; they never see performance numbers.
//
// Deploy: supabase functions deploy payslips --no-verify-jwt --project-ref gvijxenafoowajqktqvd
// Uses the built-in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY secrets.

import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const BUCKET = "payslips";
const MAX_BYTES = 10 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONTH = /^\d{4}-\d{2}$/;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

async function adminFor(token: unknown) {
  if (typeof token !== "string" || !UUID.test(token)) return null;
  // The dashboard's built-in viewer key never gets payslips.
  const { data } = await sb.from("perf_admins").select("name, role").eq("token", token).in("role", ["leader", "payroll"]).maybeSingle();
  return data;
}
const monthDate = (m: string) => `${m}-01`;
const pathFor = (m: string, staffId: string) => `${m}/${staffId}.pdf`;

async function signed(path: string) {
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, 600);
  if (error) throw error;
  return data.signedUrl;
}

Deno.serve(async (req) => {
  // A bare 204 with a null body: JSON.stringify into a 204 throws in Deno and
  // silently breaks CORS on the real POST.
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  try {
    const isForm = (req.headers.get("content-type") || "").includes("multipart/form-data");
    const form = isForm ? await req.formData() : null;
    const body: Record<string, unknown> = form ? Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")) : await req.json();
    const action = String(body.action || "");
    const month = String(body.month || "");
    if (!MONTH.test(month)) return json({ error: "month must be YYYY-MM" }, 400);

    // ── the staff member's own payslip ──
    if (action === "mine") {
      const token = String(body.token || "");
      if (!UUID.test(token)) return json({ error: "bad token" }, 401);
      const { data: s } = await sb.from("perf_staff").select("id").eq("token", token).eq("active", true).maybeSingle();
      if (!s) return json({ error: "bad token" }, 401);
      const { data: p } = await sb.from("payslips").select("path, file_name, uploaded_at").eq("staff_id", s.id).eq("month", monthDate(month)).maybeSingle();
      if (!p) return json({ exists: false });
      return json({ exists: true, url: await signed(p.path), file_name: p.file_name, uploaded_at: p.uploaded_at });
    }

    // ── everything else needs a payroll or leader token ──
    const admin = await adminFor(body.admin);
    if (!admin) return json({ error: "bad admin token" }, 401);

    if (action === "list") {
      const [{ data: staff }, { data: slips }] = await Promise.all([
        sb.from("perf_staff").select("id, display_name, branch, dept, level").eq("active", true).order("branch").order("display_name"),
        sb.from("payslips").select("staff_id, file_name, size_bytes, uploaded_by, uploaded_at").eq("month", monthDate(month)),
      ]);
      const by = Object.fromEntries((slips || []).map((p) => [p.staff_id, p]));
      return json({
        admin: admin.name, role: admin.role, month,
        staff: (staff || []).map((s) => ({ id: s.id, name: s.display_name, branch: s.branch, dept: s.dept, level: s.level, payslip: by[s.id] || null })),
      });
    }

    const staffId = String(body.staff_id || "");
    if (!UUID.test(staffId)) return json({ error: "bad staff_id" }, 400);
    const { data: person } = await sb.from("perf_staff").select("id, display_name").eq("id", staffId).maybeSingle();
    if (!person) return json({ error: "unknown staff" }, 404);
    const path = pathFor(month, staffId);

    if (action === "upload") {
      const file = form?.get("file");
      if (!(file instanceof File)) return json({ error: "no file" }, 400);
      if (file.size > MAX_BYTES) return json({ error: "PDF is over 10 MB" }, 413);
      const bytes = new Uint8Array(await file.arrayBuffer());
      // A real PDF starts with %PDF, whatever the file name or browser says.
      if (String.fromCharCode(...bytes.slice(0, 4)) !== "%PDF") return json({ error: "That file isn't a PDF" }, 415);
      const { error: upErr } = await sb.storage.from(BUCKET).upload(path, bytes, { contentType: "application/pdf", upsert: true });
      if (upErr) throw upErr;
      const { error: dbErr } = await sb.from("payslips").upsert({
        staff_id: staffId, month: monthDate(month), path, file_name: file.name.slice(0, 200),
        size_bytes: file.size, uploaded_by: admin.name, uploaded_at: new Date().toISOString(),
      });
      if (dbErr) throw dbErr;
      return json({ ok: true, name: person.display_name });
    }

    if (action === "url") {
      const { data: p } = await sb.from("payslips").select("path").eq("staff_id", staffId).eq("month", monthDate(month)).maybeSingle();
      if (!p) return json({ exists: false });
      return json({ exists: true, url: await signed(p.path) });
    }

    if (action === "delete") {
      await sb.storage.from(BUCKET).remove([path]);
      await sb.from("payslips").delete().eq("staff_id", staffId).eq("month", monthDate(month));
      return json({ ok: true });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: "Something went wrong saving or reading the payslip." }, 500);
  }
});
