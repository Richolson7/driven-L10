var assert = require("assert");
var Pick = require("./crm-pick.js");
var Archive = require("./crm-archive.js");

var companies = [
  { id: 3, name: "Zebra Pack", kind: "customer" },
  { id: 1, name: "anchor paper", kind: "customer" },
  { id: 2, name: "Kempf Paper", kind: "customer" },
  { id: 9, name: "Old Co", kind: "customer", archived: true },
  { id: 4, name: "Uline", kind: "vendor" },
  { id: 5, name: "Badger Paperboard", kind: "vendor" }
];

assert.deepStrictEqual(Pick.customers(companies).map(function (c) { return c.name; }), ["anchor paper", "Kempf Paper", "Zebra Pack"]);
assert.deepStrictEqual(Pick.vendors(companies).map(function (c) { return c.name; }), ["Badger Paperboard", "Uline"]);
assert.strictEqual(Pick.matches("Kempf Paper", "kem"), true);
assert.strictEqual(Pick.matches("Kempf Paper", "uline"), false);

var html = Pick.field({ id: "ndCo", list: Pick.customers(companies), selected: 2, placeholder: "Search customers", attr: "data-k='company_id'" });
assert.ok(html.indexOf("id='ndCo'") >= 0);
assert.ok(html.indexOf("value='2'") >= 0);
assert.ok(html.indexOf("Kempf Paper") >= 0);
assert.ok(html.indexOf("Zebra Pack") > html.indexOf("anchor paper"));
assert.ok(html.indexOf("Old Co") < 0);
assert.ok(html.indexOf("Uline") < 0);

assert.strictEqual(Archive.blocked({ deals: 0, contacts: 0, invoices: 0, portalOrders: 0, portalAccount: 0, vendorDeals: 0 }), false);
assert.strictEqual(Archive.blocked({ deals: 2, contacts: 0, invoices: 0, portalOrders: 0, portalAccount: 0, vendorDeals: 0 }), true);
assert.strictEqual(Archive.blocked({ deals: 0, contacts: 0, invoices: 1, portalOrders: 0, portalAccount: 0, vendorDeals: 0 }), true);

var plain = Archive.companyDialog({ id: 8, name: "Duplicate Co", kind: "customer" }, { deals: 0, contacts: 0, invoices: 0, portalOrders: 0, portalAccount: 0, vendorDeals: 0, quotes: 0, shipTos: 0 }, []);
assert.ok(plain.indexOf("Delete Duplicate Co?") >= 0);
assert.ok(plain.indexOf("Merge into") < 0);

var linked = Archive.companyDialog({ id: 8, name: "Duplicate Co", kind: "customer" }, { deals: 2, contacts: 1, invoices: 1, portalOrders: 0, portalAccount: 0, vendorDeals: 0, quotes: 0, shipTos: 0 }, [{ id: 2, name: "Kempf Paper" }]);
assert.ok(linked.indexOf("Delete Duplicate Co?") >= 0);
assert.ok(linked.indexOf("Merge into") >= 0);
assert.ok(linked.indexOf("Archive Duplicate Co") >= 0);
assert.ok(linked.indexOf("Kempf Paper") >= 0);
assert.ok(linked.indexOf("2 deals") >= 0);

var quote = Archive.quoteDialog({ number: "Q-2026-0012", company: "Kempf Paper", dealId: 44 });
assert.ok(quote.indexOf("Delete quote Q-2026-0012?") >= 0);
assert.ok(quote.indexOf("Kempf Paper") >= 0);
assert.ok(quote.indexOf("orders, and invoices stay") >= 0);

console.log("crm-pick and archive tests ok");
