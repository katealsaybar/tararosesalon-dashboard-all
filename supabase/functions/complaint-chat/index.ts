// complaint-chat (Kate, 12 Nov 2026): the Conversation tab of a complaint record. Levels 3 and up (dashboard_me), the same rule as Client Complaints.
// verify_jwt is on, and the level is checked again here because the public key also passes verify_jwt. Read only; see lookup.ts.
import { createClient } from "npm:@supabase/supabase-js@2";
import { lookup } from "./lookup.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });   // a bare 204: JSON.stringify into a 204 throws in Deno
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const token = Deno.env.get("RESPOND_TOKEN");
  if (!token) return json({ error: "Not set up" }, 500);
  const auth = req.headers.get("Authorization") || "";
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const me = await sb.rpc("dashboard_me");
  const level = Array.isArray(me.data) && me.data[0] ? Number(me.data[0].level) : 0;
  if (level < 3) return json({ error: "Conversations are for Levels 3 and up" }, 403);
  let body: any = {};
  try { body = await req.json(); } catch (_) { return json({ error: "Bad request" }, 400); }
  try {
    return json(await lookup(token, body));
  } catch (_e) {
    return json({ error: "respond.io did not answer. Try again." }, 502);
  }
});
