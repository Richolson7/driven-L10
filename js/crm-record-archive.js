/* Confirm copy for archiving a company or a quote.
   Nothing here deletes a row. Links to deals, contacts, and orders stay. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.CRMRecordArchive = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function bits(counts) {
    counts = counts || {};
    var out = [];
    function add(n, one, many) { if (n) out.push(n + " " + (n === 1 ? one : many)); }
    add(counts.deals, "deal", "deals");
    add(counts.quotes, "quote", "quotes");
    add(counts.contacts, "contact", "contacts");
    add(counts.orders, "order", "orders");
    add(counts.vendorDeals, "vendor line", "vendor lines");
    return out;
  }
  function companyDialog(company, counts) {
    var name = company && company.name ? company.name : "this record";
    var kind = company && company.kind === "vendor" ? "vendor" : "customer";
    var h = "<h2>Archive " + esc(name) + "?</h2>";
    h += "<p>Archive " + esc(name) + ". This " + kind + " leaves the lists, pickers, and reports. Nothing is deleted, and the links stay.</p>";
    var related = bits(counts);
    if (related.length) h += "<p>" + esc(name) + " has " + esc(related.join(", ")) + ". Those records stay attached and come back if you restore " + esc(name) + ".</p>";
    h += "<div class='mactions'><button class='ghost' data-act='mclose'>Cancel</button>";
    h += "<button class='danger' data-act='archive-company-go' data-id='" + company.id + "'>Archive " + esc(name) + "</button></div>";
    return h;
  }
  function quoteDialog(quote) {
    var label = quote && (quote.number || quote.label) ? (quote.number || quote.label) : "this quote";
    var who = quote && quote.company ? " for " + quote.company : "";
    var h = "<h2>Archive quote " + esc(label) + "?</h2>";
    h += "<p>Archive quote " + esc(label) + esc(who) + ". The deal, its product lines, and any orders stay. This does not delete the quote.</p>";
    h += "<div class='mactions'><button class='ghost' data-act='mclose'>Cancel</button>";
    h += "<button class='danger' data-act='archive-quote-go' data-id='" + (quote && quote.dealId || "") + "'>Archive quote " + esc(label) + "</button></div>";
    return h;
  }
  function restoreDialog(company) {
    var name = company && company.name ? company.name : "this record";
    var h = "<h2>Restore " + esc(name) + "?</h2>";
    h += "<p>Restore " + esc(name) + " to the lists, pickers, and reports.</p>";
    h += "<div class='mactions'><button class='ghost' data-act='mclose'>Cancel</button>";
    h += "<button class='primary' data-act='restore-company-go' data-id='" + company.id + "'>Restore " + esc(name) + "</button></div>";
    return h;
  }
  return { bits: bits, companyDialog: companyDialog, quoteDialog: quoteDialog, restoreDialog: restoreDialog };
});
