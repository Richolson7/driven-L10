/* Delete guards for test deals and quotes. */
var assert = require("assert");
var D = require("./crm-delete.js");
var fs = require("fs");
var path = require("path");

var stages = [
  { key: "working_on_quote", position: 1 },
  { key: "quote_sent", position: 2 },
  { key: "customer_po", position: 3 },
  { key: "driven_po", position: 4 },
  { key: "shipped", position: 5 },
  { key: "delivered", position: 6 },
  { key: "invoice_sent", position: 7 },
  { key: "paid", position: 8 }
];

function check(extra) {
  return D.reasons(Object.assign({ stages: stages, qbo: {}, invoiceCount: 0, paymentCount: 0, flagCount: 0, lineInvoiceCount: 0 }, extra));
}

assert.deepStrictEqual(check({ stage: "working_on_quote", stageName: "Working On Quote" }), []);
assert.deepStrictEqual(check({ stage: "quote_sent", stageName: "Quote Sent" }), []);
assert.deepStrictEqual(check({ stage: "customer_po", stageName: "Customer PO" }), []);
assert.deepStrictEqual(check({ stage: "driven_po", stageName: "Driven PO" }), []);
assert.ok(check({ stage: "shipped", stageName: "Shipped" })[0].indexOf("Shipped") >= 0);
assert.ok(check({ stage: "delivered", stageName: "Delivered" })[0].indexOf("Delivered") >= 0);
assert.ok(check({ stage: "invoice_sent", stageName: "Invoice Sent" })[0].indexOf("Invoice Sent") >= 0);
assert.ok(check({ stage: "paid", stageName: "Paid" })[0].indexOf("Paid") >= 0);
assert.strictEqual(D.isLateStage("quote_sent", stages), false);
assert.strictEqual(D.isLateStage("shipped", stages), true);
assert.strictEqual(D.isLateStage("future_after_paid", stages.concat([{ key: "future_after_paid", position: 9 }])), true);
assert.strictEqual(D.isLateStage("future_before_ship", stages.concat([{ key: "future_before_ship", position: 4 }])), false);

assert.strictEqual(D.qboLinked({ qbo_doc_id: "  " }), false);
assert.strictEqual(D.qboLinked({ qbo_doc_id: "123" }), true);
assert.strictEqual(D.qboLinked({ qbo_synced_at: "2026-01-01" }), true);
assert.strictEqual(D.qboLinked({ qbo_customer_id: "9" }), true);
assert.ok(check({ stage: "quote_sent", qbo: { qbo_doc_id: "EST-4" } })[0].indexOf("EST-4") >= 0);
assert.strictEqual(check({ stage: "working_on_quote", invoiceCount: 1 }).length, 1);
assert.strictEqual(check({ stage: "working_on_quote", paymentCount: 2 }).length, 1);
assert.strictEqual(check({ stage: "working_on_quote", flagCount: 1 }).length, 1);
assert.strictEqual(check({ stage: "working_on_quote", lineInvoiceCount: 1 }).length, 1);
var both = check({ stage: "paid", stageName: "Paid", qbo: { qbo_doc_id: "9" }, invoiceCount: 1, paymentCount: 1, flagCount: 1 });
assert.strictEqual(both.length, 5);

var app = fs.readFileSync(path.join(__dirname, "crm-app.js"), "utf8");
var html = fs.readFileSync(path.join(__dirname, "../crm.html"), "utf8");
var doc = fs.readFileSync(path.join(__dirname, "../docs/deleting-test-quotes-and-deals.md"), "utf8");
assert.ok(app.indexOf("Delete this deal and its quote permanently? This also removes its tasks, activity, quote and lines. This can't be undone.") >= 0);
assert.ok(app.indexOf("Delete deal") >= 0);
assert.ok(app.indexOf("Delete quote") >= 0);
assert.ok(app.indexOf("Deleting test quotes and deals") >= 0);
assert.ok(app.indexOf("Deleted deal: ") >= 0);
assert.ok(app.indexOf('data-act="delete-deal"') >= 0 || app.indexOf("data-act='delete-deal'") >= 0);
assert.ok(html.indexOf("js/crm-delete.js") >= 0);
assert.ok(doc.indexOf("Deleting test quotes and deals") >= 0);
assert.ok(doc.indexOf("Show lost") >= 0);

console.log("crm-delete tests ok");
