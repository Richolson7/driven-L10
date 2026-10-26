/* QuickBooks payload builder. No network calls.
   Estimate is the default. QuickBooks Online has no Sales Order object.
   Live writes stay behind decide(): the flag defaults off, and dry-run defaults on. */

export function decide(env) {
  const enabled = String(env.QBO_SYNC_ENABLED || "").toLowerCase() === "true";
  const dry = String(env.QBO_DRY_RUN || "true").toLowerCase() !== "false";
  if (!enabled) return { action: "skip", reason: "QuickBooks sync is off." };
  if (dry) return { action: "dry-run", reason: "Dry-run only. Nothing is sent to QuickBooks." };
  if (!env.QBO_REALM_ID || !env.QBO_ACCESS_TOKEN) {
    return { action: "skip", reason: "QuickBooks is not connected. No request was sent." };
  }
  return { action: "live", reason: "Would call QuickBooks." };
}

export function buildDocument(input) {
  const docType = input.docType === "Invoice" ? "Invoice" : "Estimate";
  const lines = (input.lines || []).map((line) => {
    const qty = line.qty == null || line.qty === "" ? 1 : Number(line.qty);
    const price = line.price == null || line.price === "" ? 0 : Number(line.price);
    const amount = Math.round(qty * price * 100) / 100;
    const detail = { Qty: qty, UnitPrice: price };
    if (line.qboItemId) detail.ItemRef = { value: String(line.qboItemId), name: line.name || line.description || "" };
    return {
      DetailType: "SalesItemLineDetail",
      Amount: amount,
      Description: line.description || line.name || "",
      SalesItemLineDetail: detail,
    };
  });
  const doc = {
    docType,
    Line: lines,
    PrivateNote: "Driven CRM deal " + (input.dealId || ""),
  };
  if (input.qboCustomerId) doc.CustomerRef = { value: String(input.qboCustomerId), name: input.customerName || "" };
  else doc.CustomerRef = { name: input.customerName || "" };
  if (input.invoiceNumber && docType === "Invoice") doc.DocNumber = String(input.invoiceNumber);
  return doc;
}

export function customerQuery(name) {
  const safe = String(name || "").replace(/'/g, "\\'");
  return "select * from Customer where DisplayName = '" + safe + "'";
}

export function itemsQuery() {
  return "select Id, Name, Sku, Description, UnitPrice, Active from Item where Active = true";
}
