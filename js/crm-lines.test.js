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

var blankCost = L.lineFigures({ qty: 10, price: 5, cost: null });
assert.strictEqual(blankCost.sell, 50);
assert.strictEqual(blankCost.cost, null);
assert.strictEqual(blankCost.margin, null);
var blankDeal = L.dealTotals([{ qty: 10, price: 5, cost: "" }], null);
assert.strictEqual(blankDeal.value, 50);
assert.strictEqual(blankDeal.cost, null);
assert.strictEqual(blankDeal.marginPct, null);
var zeroCost = L.lineFigures({ qty: 4, price: 10, cost: 0 });
assert.strictEqual(zeroCost.cost, 0);

var kept = { desc: "Machine wrap", cost: 34.5, vendor_id: 151, price: 47 };
var header = { vendor_price_per_unit: null, vendor_id: null, price_per_unit: 47, quantity: null };
L.copyHeaderWhenSet(kept, header);
assert.strictEqual(kept.cost, 34.5);
assert.strictEqual(kept.vendor_id, 151);
assert.strictEqual(kept.price, 47);
L.copyHeaderWhenSet(kept, { vendor_price_per_unit: 30, vendor_id: 9 });
assert.strictEqual(kept.cost, 30);
assert.strictEqual(kept.vendor_id, 9);

var merged = L.mergeStored({ line_id: 11, cost: null, vendor_id: null, price: 11.5 }, { line_id: 11, cost: 6.5, vendor_id: 164 });
assert.strictEqual(merged.cost, 6.5);
assert.strictEqual(merged.vendor_id, 164);
assert.strictEqual(merged.price, 11.5);
var keptColumn = L.mergeStored({ cost: 2.87, vendor_id: 337 }, { cost: 1, vendor_id: 1 });
assert.strictEqual(keptColumn.cost, 2.87);
assert.strictEqual(keptColumn.vendor_id, 337);

var cols = L.lineMoneyColumns({ cost: "", vendor_id: null }, null);
assert.deepStrictEqual(cols, {});
var filled = L.lineMoneyColumns({ cost: 85, vendor_id: "" }, 159);
assert.strictEqual(filled.vendor_price, 85);
assert.strictEqual(filled.vendor_id, 159);
assert.strictEqual(L.keepIfSet(null, 66.48), 66.48);
assert.strictEqual(L.keepIfSet(70, 66.48), 70);
assert.strictEqual(L.keepIfSet(0, 66.48), 0);

var cleared = Q.dealPatch({ lines: [{ cost: null, vendor_id: null, price: 11.5 }] }, { part: "line", index: 0, key: "cost", value: null });
assert.strictEqual(cleared.vendor_price_per_unit, undefined);
var clearedVendor = Q.dealPatch({ lines: [{ vendor_id: "" }] }, { part: "line", index: 0, key: "vendor_id", value: "" });
assert.strictEqual(clearedVendor.vendor_id, undefined);
var setCost = Q.dealPatch({ lines: river }, { part: "line", index: 0, key: "cost", value: 9.25 });
assert.strictEqual(setCost.vendor_price_per_unit, 9.25);
var backfill = Q.headerBackfill({ lines: [{ cost: 85, vendor_id: 159 }] }, { vendor_price_per_unit: null, vendor_id: null });
assert.strictEqual(backfill.vendor_price_per_unit, 85);
assert.strictEqual(backfill.vendor_id, 159);
var noBackfill = Q.headerBackfill({ lines: [{ cost: null, vendor_id: null }] }, { vendor_price_per_unit: 12, vendor_id: 4 });
assert.deepStrictEqual(noBackfill, {});

var mixed = [
  { desc: "Machine wrap", qty: 10, price: 20, cost: 12, freight: 15 },
  { desc: "Stretch film", qty: 5, price: 30, cost: 18, freight: 10 },
  { desc: "Corner boards", qty: 2, price: 40, cost: 22, freight: 8, optional: true, included: true },
  { desc: "Pallet covers", qty: 4, price: 25, cost: 11, freight: 100, optional: true, included: false }
];
var mixedTotals = L.dealTotals(mixed, null);
assert.strictEqual(mixedTotals.value, 430);
assert.strictEqual(mixedTotals.freight, 33);
assert.strictEqual(mixedTotals.cost, 287);
assert.strictEqual(mixedTotals.optionalExcluded, 100);
assert.strictEqual(mixedTotals.optionalExcludedCount, 1);
assert.strictEqual(L.orderLines(mixed).length, 3);
assert.strictEqual(L.orderLines(mixed)[2].desc, "Corner boards");
var headerFreight = L.dealTotals(mixed, 50);
assert.strictEqual(headerFreight.freight, 50);
assert.strictEqual(headerFreight.value, 430);
assert.strictEqual(headerFreight.cost, 304);
assert.strictEqual(L.isIncluded({ optional: true }), false);
assert.strictEqual(L.isIncluded({ optional: true, included: true }), true);
assert.strictEqual(L.countsInTotal({ qty: 1, price: 5 }), true);

var keptFlags = L.mergeStored(
  { line_id: 4, desc: "Pallet covers", cost: 11, price: 25 },
  { line_id: 4, desc: "Pallet covers", cost: 11, optional: true, included: false }
);
assert.strictEqual(keptFlags.optional, true);
assert.strictEqual(keptFlags.included, false);
assert.strictEqual(keptFlags.cost, 11);

var mixedCustomer = L.customerLines(mixed);
assert.strictEqual(mixedCustomer[0].optional, undefined);
assert.strictEqual(mixedCustomer[0].cost, undefined);
assert.strictEqual(mixedCustomer[2].optional, true);
assert.strictEqual(mixedCustomer[2].included, true);
assert.strictEqual(mixedCustomer[3].included, false);
assert.strictEqual(Q.total(mixedCustomer), 430);
var mixedHtml = Q.docHtml({
  number: "Q-2026-0099",
  date: "2026-11-24",
  valid: 30,
  companyName: "River Valley Converting",
  lines: mixedCustomer
});
assert.ok(mixedHtml.indexOf("Machine wrap") >= 0);
assert.ok(mixedHtml.indexOf("Corner boards (Optional, included)") >= 0);
assert.ok(mixedHtml.indexOf("Pallet covers (Optional)") >= 0);
assert.ok(mixedHtml.indexOf("Optional add-ons: $100.00 not included") >= 0);
assert.ok(mixedHtml.indexOf("$430.00") >= 0);
assert.strictEqual(mixedHtml.indexOf("$530.00"), -1);
assert.strictEqual(mixedHtml.toLowerCase().indexOf("margin"), -1);
assert.strictEqual(mixedHtml.toLowerCase().indexOf("vendor"), -1);

console.log("crm-lines tests ok");
