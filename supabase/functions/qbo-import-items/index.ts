// Read-only QuickBooks Item import. Off and not deployed.
// Dry-run logs the query it would send. It does not write to QuickBooks.
// CSV import of an Item export is done in the CRM page, not here.
import { decide, itemsQuery } from "../_shared/qbo.mjs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const env = {
    QBO_SYNC_ENABLED: Deno.env.get("QBO_IMPORT_ENABLED") ?? "false",
    QBO_DRY_RUN: Deno.env.get("QBO_DRY_RUN") ?? "true",
    QBO_REALM_ID: Deno.env.get("QBO_REALM_ID") ?? "",
    QBO_ACCESS_TOKEN: Deno.env.get("QBO_ACCESS_TOKEN") ?? "",
  };
  const decision = decide(env);
  const query = itemsQuery();
  if (decision.action !== "live") {
    console.log("QBO item import skipped: " + decision.reason + " query=" + query);
    return json({ ok: true, skipped: decision.action === "skip", dryRun: decision.action === "dry-run", reason: decision.reason, wouldQuery: query });
  }
  const realm = env.QBO_REALM_ID;
  const url = "https://quickbooks.api.intuit.com/v3/company/" + encodeURIComponent(realm) + "/query?query=" + encodeURIComponent(query);
  const res = await fetch(url, { headers: { Authorization: "Bearer " + env.QBO_ACCESS_TOKEN, Accept: "application/json" } });
  const text = await res.text();
  if (!res.ok) return json({ ok: false, error: text.slice(0, 500) }, 502);
  return json({ ok: true, readOnly: true, items: text.slice(0, 4000) });
});
