// Webhook receiver for email or SMS status. Not connected to a provider.
// MESSAGE_STATUS_ENABLED defaults off. The CRM still sends nothing.
// A provider Rich chooses later posts status here. This records it on crm_messages
// with the service role. The secret is an edge secret, never a value in the page.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

const STATUSES = ["queued", "sent", "delivered", "opened", "read", "failed"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if ((Deno.env.get("MESSAGE_STATUS_ENABLED") ?? "false") !== "true") {
    console.log("Message status webhook is off. Nothing stored.");
    return json({ ok: true, skipped: true, reason: "Message status is off. No provider is connected." });
  }
  const secret = Deno.env.get("MESSAGE_WEBHOOK_SECRET") ?? "";
  if (!secret || req.headers.get("x-webhook-secret") !== secret) {
    return json({ ok: false, error: "Webhook secret does not match." }, 401);
  }
  let body = {};
  try { body = await req.json(); } catch (_e) { return json({ ok: false, error: "Expected JSON." }, 400); }
  const status = STATUSES.indexOf(body.status) >= 0 ? body.status : "";
  if (!body.provider || !body.providerMessageId || !status) {
    return json({ ok: false, error: "provider, providerMessageId, and status are required." }, 400);
  }
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !key) return json({ ok: false, error: "Supabase service role is not set. Nothing stored." }, 500);
  const db = createClient(url, key);
  const row = {
    channel: body.channel === "sms" ? "sms" : "email",
    direction: "outbound",
    to_address: body.to || null,
    subject: body.subject || null,
    status,
    status_at: body.statusAt || new Date().toISOString(),
    provider: body.provider,
    provider_message_id: body.providerMessageId,
    detail: body.detail || null,
    deal_id: body.dealId || null,
    company_id: body.companyId || null,
  };
  const existing = await db.from("crm_messages").select("id").eq("provider", row.provider).eq("provider_message_id", row.provider_message_id).maybeSingle();
  if (existing.error) return json({ ok: false, error: existing.error.message }, 500);
  const saved = existing.data
    ? await db.from("crm_messages").update(row).eq("id", existing.data.id).select().single()
    : await db.from("crm_messages").insert(row).select().single();
  if (saved.error) return json({ ok: false, error: saved.error.message }, 500);
  return json({ ok: true, id: saved.data.id, status });
});
