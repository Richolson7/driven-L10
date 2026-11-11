/* Delete, merge, and archive for duplicate companies and bad quotes.
   A company with deals, contacts, orders, invoices, or a portal account
   is merged or archived. Orders and invoices are re-pointed, never deleted.
   The archived flag lives in company custom until archived_at is applied. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.CRMArchive = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  var BLOCKS = ["deals", "vendorDeals", "contacts", "invoices", "portalOrders", "portalAccount"];
  var COUNTS = [
    { key: "deals", table: "crm_deals", column: "company_id" },
    { key: "vendorDeals", table: "crm_deals", column: "vendor_id" },
    { key: "contacts", table: "crm_contacts", column: "company_id" },
    { key: "quotes", table: "crm_quotes", column: "company_id" },
    { key: "invoices", table: "crm_qb_invoices", column: "company_id" },
    { key: "portalOrders", table: "vmi_orders", column: "company_id" },
    { key: "portalAccount", table: "vmi_accounts", column: "company_id" },
    { key: "shipTos", table: "crm_ship_tos", column: "company_id" }
  ];
  var REPOINT = [
    ["crm_deals", "company_id"],
    ["crm_deals", "vendor_id"],
    ["crm_contacts", "company_id"],
    ["crm_ship_tos", "company_id"],
    ["crm_tasks", "company_id"],
    ["crm_activity", "company_id"],
    ["crm_messages", "company_id"],
    ["crm_quotes", "company_id"],
    ["crm_deal_lines", "vendor_id"],
    ["crm_qb_invoices", "company_id"],
    ["vmi_orders", "company_id"],
    ["vmi_shipments", "company_id"]
  ];

  function emptyCounts() {
    var out = {};
    COUNTS.forEach(function (row) { out[row.key] = 0; });
    return out;
  }
  function blocked(counts) {
    counts = counts || {};
    return BLOCKS.some(function (key) { return (counts[key] || 0) > 0; });
  }
  function summary(counts) {
    var bits = [];
    if (counts.deals) bits.push(counts.deals + (counts.deals === 1 ? " deal" : " deals"));
    if (counts.vendorDeals) bits.push(counts.vendorDeals + " vendor line" + (counts.vendorDeals === 1 ? "" : "s"));
    if (counts.contacts) bits.push(counts.contacts + (counts.contacts === 1 ? " contact" : " contacts"));
    if (counts.quotes) bits.push(counts.quotes + (counts.quotes === 1 ? " quote" : " quotes"));
    if (counts.invoices) bits.push(counts.invoices + (counts.invoices === 1 ? " invoice" : " invoices"));
    if (counts.portalOrders) bits.push(counts.portalOrders + " portal order" + (counts.portalOrders === 1 ? "" : "s"));
    if (counts.portalAccount) bits.push("a customer portal account");
    if (counts.shipTos) bits.push(counts.shipTos + " ship-to" + (counts.shipTos === 1 ? "" : "s"));
    return bits;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function companyDialog(company, counts, choices) {
    var name = company && company.name ? company.name : "this record";
    var kind = company && company.kind === "vendor" ? "vendor" : "customer";
    var h = "<h2>Delete " + esc(name) + "?</h2>";
    if (!blocked(counts)) {
      h += "<p>Delete " + esc(name) + ". This " + kind + " has no deals, contacts, orders, or invoices.</p>";
      h += "<div class='mactions'><button class='ghost' data-act='mclose'>Cancel</button>";
      h += "<button class='danger' data-act='delete-company-go' data-id='" + company.id + "'>Delete " + esc(name) + "</button></div>";
      return h;
    }
    var bits = summary(counts);
    h += "<p>" + esc(name) + " has " + esc(bits.join(", ")) + ". Orders and invoices stay. Merge moves them onto the record you keep, or archive hides this duplicate from the lists.</p>";
    h += "<div class='f'><label>Merge into</label>";
    h += "<select id='mergeInto'><option value=''>Choose the record to keep…</option>";
    (choices || []).forEach(function (c) {
      h += "<option value='" + c.id + "'>" + esc(c.name) + "</option>";
    });
    h += "</select></div>";
    h += "<div class='mactions'><button class='ghost' data-act='mclose'>Cancel</button>";
    h += "<button class='ghost' data-act='archive-company' data-id='" + company.id + "'>Archive " + esc(name) + "</button>";
    h += "<button class='primary' data-act='merge-company' data-id='" + company.id + "'>Merge into the record I keep</button></div>";
    return h;
  }
  function quoteDialog(quote) {
    var label = quote && quote.number ? quote.number : "this quote";
    var who = quote && quote.company ? " for " + quote.company : "";
    var h = "<h2>Delete quote " + esc(label) + "?</h2>";
    h += "<p>Delete quote " + esc(label) + esc(who) + ". The deal, orders, and invoices stay.</p>";
    h += "<div class='mactions'><button class='ghost' data-act='mclose'>Cancel</button>";
    h += "<button class='danger' data-act='delete-quote-go' data-id='" + (quote && quote.dealId || "") + "'>Delete quote " + esc(label) + "</button></div>";
    return h;
  }
  async function loadCounts(db, id) {
    var counts = emptyCounts();
    if (!db || !db.from) return counts;
    await Promise.all(COUNTS.map(async function (row) {
      var res = await db.from(row.table).select("*", { count: "exact", head: true }).eq(row.column, id);
      counts[row.key] = res && !res.error ? (res.count || 0) : 0;
    }));
    return counts;
  }
  async function repoint(db, fromId, intoId) {
    var errors = [];
    for (var i = 0; i < REPOINT.length; i++) {
      var table = REPOINT[i][0];
      var column = REPOINT[i][1];
      var patch = {};
      patch[column] = intoId;
      var res = await db.from(table).update(patch).eq(column, fromId);
      if (res && res.error && res.error.code !== "42P01" && res.error.code !== "PGRST205") {
        errors.push(table + "." + column + ": " + (res.error.message || "could not move"));
      }
    }
    return errors;
  }

  return {
    BLOCKS: BLOCKS,
    blocked: blocked,
    summary: summary,
    companyDialog: companyDialog,
    quoteDialog: quoteDialog,
    loadCounts: loadCounts,
    repoint: repoint
  };
});
