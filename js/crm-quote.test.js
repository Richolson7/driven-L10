/* Quote and deal stay on the same customer, product, quantity, and price.
   A quote in Quote sent ages out after 60 days. Tab wraps inside the form. */
var assert = require("assert");
global.window = global;
require("./crm-quote.js");
var Q = global.CRMQuote;

function addDays(s, n) {
  var x = new Date(String(s).slice(0, 10) + "T00:00:00");
  x.setDate(x.getDate() + n);
  var m = String(x.getMonth() + 1).padStart(2, "0");
  var d = String(x.getDate()).padStart(2, "0");
  return x.getFullYear() + "-" + m + "-" + d;
}

var deal = {
  company_id: 5,
  ship_to_id: 9,
  sales_rep: "Landon",
  quote_sent_date: "2026-11-01",
  customer_po_number: "PO1",
  freight: 40,
  description: "Blue pallets",
  quantity: 10,
  price_per_unit: 12,
  vendor_id: 3,
  vendor_price_per_unit: 8,
  quote: {
    company_id: 1,
    rep: "",
    lines: [{ desc: "Old", qty: 1, price: 2, cost: 1, vendor_id: 1, sales_rep: "" }]
  }
};
assert.strictEqual(Q.applyDealOntoQuote(deal), true);
assert.strictEqual(deal.quote.company_id, 5);
assert.strictEqual(deal.quote.ship_to_id, 9);
assert.strictEqual(deal.quote.rep, "Landon");
assert.strictEqual(deal.quote.sent_date, "2026-11-01");
assert.strictEqual(deal.quote.po, "PO1");
assert.strictEqual(deal.quote.freight, 40);
assert.strictEqual(deal.quote.lines[0].desc, "Blue pallets");
assert.strictEqual(deal.quote.lines[0].qty, 10);
assert.strictEqual(deal.quote.lines[0].price, 12);
assert.strictEqual(deal.quote.lines[0].cost, 8);
assert.strictEqual(deal.quote.lines[0].vendor_id, 3);
assert.strictEqual(Q.applyDealOntoQuote(deal), false);

deal.description = "Blue pallets + 2 more";
assert.strictEqual(Q.applyDealOntoQuote(deal), false);
assert.strictEqual(deal.quote.lines[0].desc, "Blue pallets");

deal.quantity = null;
deal.quote.lines[0].qty = 10;
assert.strictEqual(Q.applyDealOntoQuote(deal), false);
assert.strictEqual(deal.quote.lines[0].qty, 10);

var fromHeader = Q.lineFromOpportunity({
  id: 7,
  description: "Red film",
  quantity: 4,
  price_per_unit: 20,
  vendor_price_per_unit: 11,
  vendor_id: 8,
  sales_rep: "Landon",
  quote_sent_date: "2026-11-01"
});
assert.strictEqual(fromHeader.desc, "Red film");
assert.strictEqual(fromHeader.qty, 4);
assert.strictEqual(fromHeader.price, 20);
assert.strictEqual(fromHeader.cost, 11);
assert.strictEqual(fromHeader.vendor_id, 8);
assert.strictEqual(fromHeader.source_deal_id, 7);

var fromLine = Q.lineFromOpportunity({
  id: 8,
  description: "Header name",
  quantity: 1,
  price_per_unit: 1,
  quote: { lines: [{ desc: "Line item", qty: 3, price: 9, unit: "case" }] }
});
assert.strictEqual(fromLine.desc, "Line item");
assert.strictEqual(fromLine.qty, 3);
assert.strictEqual(fromLine.price, 9);
assert.strictEqual(fromLine.unit, "case");
assert.strictEqual(fromLine.source_deal_id, 8);

var lines = [fromHeader, fromLine];
assert.strictEqual(Q.describe({ lines: lines }), "Red film + 1 more");
assert.strictEqual(lines.length, 2);

var sent = { stage: "quote_sent", status: "open", stage_changed_at: "2026-01-01" };
assert.strictEqual(Q.quoteExpired(sent, addDays("2026-01-01", 60)), false);
assert.strictEqual(Q.quoteExpired(sent, addDays("2026-01-01", 61)), true);
assert.strictEqual(Q.quoteExpired({ stage: "quote_sent", status: "lost", stage_changed_at: "2026-01-01" }, addDays("2026-01-01", 90)), false);
assert.strictEqual(Q.quoteExpired({ stage: "working_on_quote", status: "open", stage_changed_at: "2026-01-01" }, addDays("2026-01-01", 90)), false);
assert.strictEqual(Q.quoteExpired({ stage: "quote_sent", status: "open", quote_sent_date: "2026-01-01" }, addDays("2026-01-01", 61)), true);
assert.strictEqual(Q.quoteExpired({ stage: "quote_sent", status: "open" }, "2026-04-01"), false);
assert.strictEqual(Q.QUOTE_SENT_LIMIT, 60);

assert.strictEqual(Q.focusStep(3, 2, false), 0);
assert.strictEqual(Q.focusStep(3, 0, true), 2);
assert.strictEqual(Q.focusStep(3, 1, false), 2);
assert.strictEqual(Q.focusStep(3, 0, false), 1);
assert.strictEqual(Q.focusStep(3, -1, false), 0);
assert.strictEqual(Q.focusStep(3, -1, true), 2);

console.log("crm-quote tests ok");
