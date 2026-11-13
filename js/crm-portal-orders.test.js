var assert = require("assert");
var Orders = require("./crm-portal-orders.js");
var Portal = require("./crm-portal.js");

var TODAY = "2026-11-13";
var data = Orders.sampleData();
var report = Orders.buildReport(data, { today: TODAY });

assert.deepStrictEqual(report.rows.map(function (row) { return row.orderNo; }), ["VMI-90", "VMI-80", "VMI-70"]);
assert.strictEqual(report.rows[0].placedBy, "Jim Pappas");
assert.strictEqual(report.rows[0].bucket, "pending");
assert.strictEqual(report.rows[0].partNo, "DRV-PAL-48");
assert.strictEqual(report.rows[1].customer, "Anchor Paper (River Valley Converting)");
assert.strictEqual(report.rows[1].placedBy, "Pat Rivera");
assert.strictEqual(report.rows[1].bucket, "shipped");
assert.ok(report.rows[1].detail.indexOf("XPO") >= 0);
assert.ok(report.rows[1].detail.indexOf("PRO 441288") >= 0);
assert.strictEqual(report.rows[2].bucket, "received");
assert.ok(report.rows[2].detail.indexOf("Invoice 1044") >= 0);
assert.strictEqual(report.tiles.open, 2);
assert.strictEqual(report.tiles.pending, 1);
assert.strictEqual(report.tiles.shipped, 1);
assert.strictEqual(report.tiles.quiet, 1);
assert.strictEqual(report.from, "2026-10-14");
assert.ok(report.stock.some(function (row) { return row.customer === "Kempf Paper" && row.out === 1; }));

var kempf = Orders.buildReport(data, { today: TODAY, customer: "169" });
assert.ok(kempf.rows.every(function (row) { return row.customer === "Kempf Paper"; }));
assert.strictEqual(kempf.tiles.quiet, 0);

var html = Orders.reportHtml(data, { today: TODAY });
assert.ok(html.indexOf("How this works") >= 0);
assert.ok(html.indexOf("Hide this") >= 0);
assert.ok(html.indexOf("Print") >= 0);
assert.ok(html.indexOf("Export CSV") >= 0);
assert.ok(html.indexOf("jim@example.com") < 0);
assert.ok(html.indexOf("pat@example.com") < 0);
assert.ok(html.indexOf("@") < 0);
assert.ok(html.indexOf("$") < 0);
var hidden = Orders.reportHtml(data, { today: TODAY, hideHelp: true });
assert.ok(hidden.indexOf("id='portalOrdersHelp'") < 0);
assert.ok(hidden.indexOf("data-po-help-show") >= 0);

var csv = Orders.toCsv(report.rows);
assert.ok(csv.indexOf("Jim Pappas") >= 0);
assert.ok(csv.indexOf("@") < 0);
assert.ok(csv.indexOf("1044") >= 0);

var topics = Orders.trainingTopics();
assert.strictEqual(topics.length, 3);
topics.forEach(function (topic) {
  var sentences = topic.body.split(".").filter(function (part) { return part.trim(); });
  assert.ok(sentences.length >= 2 && sentences.length <= 4, topic.title + " should be 2-4 sentences");
  assert.ok(topic.view);
  assert.ok(topic.link);
});
assert.strictEqual(topics[0].view, "pipeline");
assert.strictEqual(topics[1].view, "reorder");
assert.strictEqual(topics[2].view, "customer-portal");

var company = Portal.companyHtml(169, {
  accounts: data.accounts,
  companies: data.companies,
  sites: data.sites,
  stock: [],
  orders: [],
  lines: [],
  users: [],
  counts: [],
  contacts: data.contacts
}, { today: TODAY });
assert.ok(company.indexOf("data-act='open-portal-orders'") >= 0);
assert.ok(company.indexOf("data-company='169'") >= 0);

console.log("crm-portal-orders tests ok");
