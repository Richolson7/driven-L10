var assert = require("assert");
var Pick = require("./crm-customer-pick.js");

var rows = [
  { id: 2, name: "zeta Pallets", kind: "customer" },
  { id: 3, name: "Acme", kind: "vendor", archived_at: "2026-11-01" },
  { id: 4, name: "amber Co", kind: "prospect" },
  { id: 5, name: "Beta", kind: "customer" }
];

var customers = Pick.customers(rows);
assert.deepStrictEqual(customers.map(function (c) { return c.name; }), ["amber Co", "Beta", "zeta Pallets"]);
assert.deepStrictEqual(Pick.vendors(rows).map(function (c) { return c.id; }), []);
assert.strictEqual(Pick.vendors([{ id: 9, name: "mills", kind: "vendor" }])[0].id, 9);
assert.strictEqual(Pick.matches("River Valley", "valley"), true);
assert.strictEqual(Pick.matches("River Valley", "acme"), false);

var html = Pick.field({ id: "ndCo", list: customers, selected: 5, placeholder: "Search customers", attr: "data-k='company_id'" });
assert.ok(html.indexOf("id='ndCo'") > html.indexOf("pick-q"));
assert.ok(html.indexOf("value='5'") >= 0);
assert.ok(html.indexOf("Beta") >= 0);
assert.ok(html.indexOf("zeta") >= 0);
assert.ok(html.indexOf("data-k='company_id'") >= 0);

console.log("crm-customer-pick tests ok");
