// Off by default. Dry-run by default. Not deployed.
// Creates a QuickBooks Online Estimate (or Invoice if QBO_DOC_TYPE=Invoice).
// QBO has no Sales Orders. This function does not run during pull-request checks.
import { decide, buildDocument, customerQuery } from "../_shared/qbo.mjs";

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
    QBO_SYNC_ENABLED: Deno.env.get("QBO_SYNC_ENABLED") ?? "false",
    QBO_DRY_RUN: Deno.env.get("QBO_DRY_RUN") ?? "true",
    QBO_REALM_ID: Deno.env.get("QBO_REALM_ID") ?? "",
    QBO_ACCESS_TOKEN: Deno.env.get("QBO_ACCESS_TOKEN") ?? "",
    QBO_DOC_TYPE: Deno.env.get("QBO_DOC_TYPE") ?? "Estimate",
  };
  const decision = decide(env);
  if (decision.action === "skip") {
    console.log(decision.reason);
    return json({ ok: true, skipped: true, reason: decision.reason });
  }
  let body = {};
  try { body = await req.json(); } catch (_e) { body = {}; }
  const doc = buildDocument({
    dealId: body.dealId,
    customerName: body.customerName,
    qboCustomerId: body.qboCustomerId,
    invoiceNumber: body.invoiceNumber,
    docType: body.docType || env.QBO_DOC_TYPE,
    lines: body.lines || [],
  });
  const plan = {
    customerQuery: customerQuery(body.customerName || ""),
    endpoint: doc.docType === "Invoice" ? "invoice" : "estimate",
    document: doc,
  };
  if (decision.action !== "live") {
    console.log("QBO dry-run " + JSON.stringify(plan));
    return json({ ok: true, dryRun: true, reason: decision.reason, wouldCreate: plan });
  }
  // Live path. Reached only when QBO_SYNC_ENABLED=true, QBO_DRY_RUN=false, and tokens exist.
  // Not used in this pull request's checks. No QuickBooks company is contacted here unless
  // Rich sets those secrets after approval.
  const realm = env.QBO_REALM_ID;
  const url = "https://quickbooks.api.intuit.com/v3/company/" + encodeURIComponent(realm) + "/" + plan.endpoint;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + env.QBO_ACCESS_TOKEN,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(doc),
  });
  const text = await res.text();
  if (!res.ok) return json({ ok: false, error: text.slice(0, 500) }, 502);
  return json({ ok: true, quickbooks: text.slice(0, 2000) });
});
