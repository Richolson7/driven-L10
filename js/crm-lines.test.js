/* Multi-product deal totals, legacy one-line deals, and the customer quote. */
var assert = require("assert");
var L = require("./crm-lines.js");

global.window = global;
require("./crm-quote.js");
var Q = global.CRMQuote;

var river = [
  { desc: "Colored pallet, blue", qty: 20, unit: "each", cost: 9.25, price: 14.5, product_id: null, qb_item_id: "QB-BLUE" },
  { desc: "Colored pallet, red", qty: 12, unit: "each", cost: 9.4, price: 15, product_id: null, qb_item_id: "" },
  { desc: "Colored pallet, green", qty: 8, unit: "each", cost: 8.75, price: 13.25, product_id: 42, qb_item_id: null }
];

var blue = L.lineFigures(river[0]);
assert.strictEqual(blue.sell, 290);
assert.strictEqual(blue.cost, 185);
assert.strictEqual(blue.margin, 105);

var red = L.lineFigures(river[1]);
assert.strictEqual(red.sell, 180);
assert.strictEqual(red.cost, 112.8);
assert.strictEqual(red.margin, 67.2);

var green = L.lineFigures(river[2]);
assert.strictEqual(green.sell, 106);
assert.strictEqual(green.cost, 70);
assert.strictEqual(green.margin, 36);

var totals = L.dealTotals(river, 75);
assert.strictEqual(totals.value, 576);
assert.strictEqual(totals.cost, 442.8);
assert.strictEqual(totals.freight, 75);
assert.strictEqual(totals.grossMargin, 133.2);
assert.ok(Math.abs(totals.marginPct - (133.2 / 576)) < 1e-12);

var legacy = {
  description: "PAL Poly Strapping",
  price_per_unit: 108,
  quantity: 56,
  vendor_price_per_unit: 68.1,
  vendor_quantity: 56,
  freight: 300,
  vendor_id: 9
};
var one = L.linesOf(legacy);
assert.strictEqual(one.length, 1);
assert.strictEqual(one[0].desc, "PAL Poly Strapping");
assert.strictEqual(one[0].price, 108);
assert.strictEqual(one[0].cost, 68.1);
var legacyTotals = L.dealTotals(one, legacy.freight);
assert.strictEqual(legacyTotals.value, 6048);
assert.strictEqual(legacyTotals.cost, 4113.6);
assert.strictEqual(legacyTotals.grossMargin, 1934.4);

var splitQty = L.dealTotals([L.headerLine({
  description: "Split qty",
  price_per_unit: 10,
  quantity: 4,
  vendor_price_per_unit: 3,
  vendor_quantity: 5,
  freight: null
})], null);
assert.strictEqual(splitQty.value, 40);
assert.strictEqual(splitQty.cost, 15);

var quoted = {
  description: "Colored pallets + 2 more",
  price_per_unit: 14.5,
  quantity: 20,
  vendor_price_per_unit: 9.25,
  freight: 75,
  quote: { lines: river }
};
assert.strictEqual(L.linesOf(quoted).length, 3);
assert.strictEqual(L.dealTotals(L.linesOf(quoted), quoted.freight).value, 576);
assert.notStrictEqual(L.dealTotals(L.linesOf(quoted), quoted.freight).value, 14.5 * 20);

var customer = L.customerLines(river);
assert.strictEqual(customer.length, 3);
customer.forEach(function (line) {
  assert.strictEqual(line.cost, undefined);
  assert.strictEqual(line.margin, undefined);
  assert.strictEqual(line.qb_item_id, undefined);
});

var html = Q.docHtml({
  number: "Q-2026-0042",
  date: "2026-11-11",
  valid: 30,
  companyName: "River Valley Converting",
  contactName: "Pat Morgan",
  contactEmail: "pat@rivervalley.example",
  contactPhone: "715-555-0142",
  ship: "120 Mill Rd, River Falls, WI",
  repName: "Landon",
  repEmail: "landon@drivensol.com",
  lines: customer
});
assert.ok(html.indexOf("River Valley Converting") >= 0);
assert.ok(html.indexOf("Pat Morgan") >= 0);
assert.ok(html.indexOf("Q-2026-0042") >= 0);
assert.ok(html.indexOf("Colored pallet, blue") >= 0);
assert.ok(html.indexOf("Colored pallet, red") >= 0);
assert.ok(html.indexOf("Colored pallet, green") >= 0);
assert.ok(html.indexOf("Driven Solutions") >= 0);
assert.ok(html.indexOf("$576.00") >= 0);
assert.ok(html.indexOf("$290.00") >= 0);
assert.strictEqual(html.indexOf("9.25"), -1);
assert.strictEqual(html.indexOf("8.75"), -1);
assert.strictEqual(html.toLowerCase().indexOf("margin"), -1);
assert.strictEqual(html.toLowerCase().indexOf("vendor"), -1);
assert.strictEqual(html.indexOf("QB-BLUE"), -1);
assert.strictEqual(Q.total(customer), 576);

var described = Q.describe({ lines: river.map(function (l) { return { desc: l.desc }; }) });
assert.strictEqual(described, "Colored pallet, blue + 2 more");

var patch = Q.dealPatch({ lines: river }, { part: "line", index: 2, key: "price", value: 13.25 });
assert.strictEqual(patch.price_per_unit, undefined);
var first = Q.dealPatch({ lines: river }, { part: "line", index: 0, key: "price", value: 14.5 });
assert.strictEqual(first.price_per_unit, 14.5);

console.log("crm-lines tests ok");
