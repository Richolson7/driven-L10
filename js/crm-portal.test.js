/* Reorder report math, grouping, and the read-only company section. */
var assert = require("assert");
var P = require("./crm-portal.js");

var TODAY = "2026-11-11";

function base() {
  return {
    accounts: [
      { company_id: 169, billed_company_id: 169, status: "pilot", who_counts: "customer", review_weeks: 1, created_at: "2026-11-11T16:53:43Z" },
      { company_id: 220, billed_company_id: 183, status: "pilot", who_counts: "customer", review_weeks: 1, created_at: "2026-11-04T15:04:18Z" }
    ],
    sites: [
      { ship_to_id: 6, company_id: 169, display_name: "3145 NE Columbia Ave, Minneapolis, MN 55418", count_day: null, grace_days: 2 },
      { ship_to_id: 24, company_id: 220, display_name: "2552 Prairie Drive, River Falls, WI 54022", count_day: "Monday", grace_days: 2 }
    ],
    stock: [
      { part_id: 1, company_id: 169, ship_to_id: 6, customer_sku: "PAL2248", description: "2 x 2 x 48 boards", unit: "each", min_qty: 800, max_qty: 1600, pack_qty: 800, ship_multiple: 800, on_hand: 0, active: true, customer_erp_item_id: "421" },
      { part_id: 2, company_id: 169, ship_to_id: 6, customer_sku: "SW203000150-O", description: "White opaque stretch wrap", unit: "roll", min_qty: 40, max_qty: 80, pack_qty: 40, ship_multiple: 40, on_hand: 0, active: true, customer_erp_item_id: "425" },
      { part_id: 3, company_id: 169, ship_to_id: 6, customer_sku: "RVCPAL48404NH", description: "Used grade B pallets", unit: "each", min_qty: null, max_qty: null, pack_qty: 1, ship_multiple: 1, on_hand: 0, active: true },
      { part_id: 4, company_id: 220, ship_to_id: 24, customer_sku: "PAL25539SDW", description: "BLUE", unit: "each", min_qty: 100, max_qty: 300, pack_qty: 1, ship_multiple: 1, on_hand: 0, active: true },
      { part_id: 5, company_id: 220, ship_to_id: 24, customer_sku: "PAL235355SDW", description: "GREEN", unit: "each", min_qty: 100, max_qty: 300, pack_qty: 1, ship_multiple: 1, on_hand: 30, active: true },
      { part_id: 6, company_id: 220, ship_to_id: 24, customer_sku: "NEAR1", description: "Near min film", unit: "each", min_qty: 40, max_qty: 80, pack_qty: 1, ship_multiple: 1, on_hand: 45, active: true },
      { part_id: 7, company_id: 220, ship_to_id: 24, customer_sku: "OK1", description: "Healthy film", unit: "each", min_qty: 40, max_qty: 80, pack_qty: 1, ship_multiple: 1, on_hand: 70, active: true },
      { part_id: 8, company_id: 169, ship_to_id: 6, customer_sku: "PACK1", description: "Pack round up", unit: "roll", min_qty: 10, max_qty: 80, pack_qty: 40, ship_multiple: 1, on_hand: 10, active: true }
    ],
    orders: [
      { id: 9, order_no: "VMI-9", company_id: 169, status: "awaiting_approval", created_at: "2026-11-10T12:00:00Z" },
      { id: 10, order_no: "VMI-10", company_id: 169, status: "cancelled", created_at: "2026-11-01T12:00:00Z" }
    ],
    lines: [
      { id: 1, order_id: 9, part_id: 2, qty: 40, unit: "roll" },
      { id: 2, order_id: 10, part_id: 2, qty: 80, unit: "roll" }
    ],
    users: [
      { contact_id: 261, company_id: 169, role: "customer_user", access: true, invited_at: "2026-11-11T16:53:43Z", last_login_at: null },
      { contact_id: 308, company_id: 220, role: "customer_user", access: true, invited_at: "2026-11-11T17:42:09Z", last_login_at: null }
    ],
    counts: [
      { part_id: 7, qty: 90, counted_at: "2026-11-01T12:00:00Z" },
      { part_id: 7, qty: 70, counted_at: "2026-11-11T12:00:00Z" }
    ],
    companies: [
      { id: 169, name: "Kempf Paper" },
      { id: 220, name: "DELETE" },
      { id: 183, name: "Anchor Paper (River Valley Converting)" }
    ],
    contacts: [
      { id: 261, name: "Jim Pappas", company_id: 169, email: "jim@example.com" },
      { id: 308, name: "Jennifer Burt", company_id: 220, email: "jennifer@example.com" }
    ]
  };
}

assert.strictEqual(P.stockStatus({ on_hand: 0, min_qty: 40 }), "out");
assert.strictEqual(P.stockStatus({ on_hand: 10, min_qty: 40 }), "below");
assert.strictEqual(P.stockStatus({ on_hand: 45, min_qty: 40 }), "near");
assert.strictEqual(P.stockStatus({ on_hand: 70, min_qty: 40 }), "ok");
assert.strictEqual(P.stockStatus({ on_hand: 0, min_qty: null }), "ok");
assert.strictEqual(P.suggestedOrderQty({ on_hand: 0, max_qty: 1600, ship_multiple: 800, pack_qty: 800 }), 1600);
assert.strictEqual(P.suggestedOrderQty({ on_hand: 0, max_qty: 80, ship_multiple: 40, pack_qty: 40 }), 80);
assert.strictEqual(P.suggestedOrderQty({ on_hand: 10, max_qty: 80, ship_multiple: 1, pack_qty: 40 }), 80);
assert.strictEqual(P.suggestedOrderQty({ on_hand: 50, max_qty: 80, ship_multiple: 40, pack_qty: 1 }), 40);
assert.strictEqual(P.suggestedOrderQty({ on_hand: 0, max_qty: null }), null);

var report = P.buildReport(base(), { today: TODAY, status: "all", customer: "all" });
assert.strictEqual(report.tiles.belowMin, 4);
assert.strictEqual(report.tiles.pendingOrders, 1);
assert.strictEqual(report.tiles.noSignIn, 2);
assert.strictEqual(report.tiles.countsOverdue, 0);
assert.strictEqual(report.groups[0].meta.label, "Anchor Paper (River Valley Converting)");
assert.ok(report.groups[0].meta.note.indexOf("DELETE") >= 0);
assert.strictEqual(report.groups[1].meta.label, "Kempf Paper");
assert.deepStrictEqual(report.groups[0].rows.map(function (r) { return r.partNo; }), ["PAL25539SDW", "PAL235355SDW", "NEAR1", "OK1"]);
assert.deepStrictEqual(report.groups[0].rows.map(function (r) { return r.status; }), ["out", "below", "near", "ok"]);

var wrap = report.rows.find(function (r) { return r.partNo === "SW203000150-O"; });
assert.strictEqual(wrap.suggested, 80);
assert.strictEqual(wrap.ordersText, "Pending approval 40");
assert.strictEqual(wrap.projected, TODAY);
assert.ok(wrap.ordersText.indexOf("80") < 0);

var healthy = report.rows.find(function (r) { return r.partNo === "OK1"; });
assert.strictEqual(healthy.projected, "2026-11-26");
assert.strictEqual(healthy.lastCount, "2026-11-11");

var noUsage = report.rows.find(function (r) { return r.partNo === "NEAR1"; });
assert.strictEqual(noUsage.projected, "at next count");
assert.strictEqual(noUsage.nextDue, "2026-11-09");

var kempfOnly = P.buildReport(base(), { today: TODAY, status: "out", customer: "169" });
assert.ok(kempfOnly.rows.every(function (r) { return r.customer === "Kempf Paper" && r.status === "out"; }));
assert.strictEqual(kempfOnly.tiles.noSignIn, 1);
assert.strictEqual(kempfOnly.tiles.belowMin, 2);

var late = P.buildReport({
  accounts: [{ company_id: 220, billed_company_id: 183, status: "pilot", review_weeks: 1, created_at: "2026-11-01T00:00:00Z" }],
  sites: [{ ship_to_id: 24, company_id: 220, display_name: "River Falls", count_day: null, grace_days: 2 }],
  stock: [{ part_id: 4, company_id: 220, ship_to_id: 24, customer_sku: "PAL25539SDW", description: "BLUE", min_qty: 100, max_qty: 300, on_hand: 10, active: true }],
  orders: [], lines: [], users: [], counts: [],
  companies: [{ id: 220, name: "DELETE" }, { id: 183, name: "Anchor Paper (River Valley Converting)" }]
}, { today: TODAY });
assert.strictEqual(late.rows[0].countOverdue, true);
assert.strictEqual(late.rows[0].nextDue, "2026-11-08");
assert.strictEqual(late.tiles.countsOverdue, 1);
assert.strictEqual(late.rows[0].status, "below");
assert.strictEqual(late.rows[0].projected, TODAY);

var html = P.reportHtml(base(), { today: TODAY, status: "all", customer: "all" });
assert.ok(html.indexOf("Reorder report") >= 0);
assert.ok(html.indexOf("jim@example.com") < 0);
assert.ok(html.indexOf("jennifer@example.com") < 0);
assert.ok(html.indexOf("@") < 0);
assert.ok(html.indexOf("$") < 0);
assert.ok(html.indexOf("data-portal-customer='all'") >= 0);
assert.ok(html.indexOf("<select") < 0);
assert.ok(html.indexOf("Pending approval 40") >= 0);
assert.strictEqual(report.csv.indexOf("jim@example.com"), -1);
assert.strictEqual(report.csv.indexOf("$"), -1);
assert.ok(report.csv.indexOf("Suggested order qty") >= 0);
assert.ok(report.csv.indexOf("Anchor Paper (River Valley Converting)") >= 0);

var kempf = P.companyHtml(169, base(), { today: TODAY });
assert.ok(kempf.indexOf("Customer portal") >= 0);
assert.ok(kempf.indexOf("Jim Pappas") >= 0);
assert.ok(kempf.indexOf("Not yet") >= 0);
assert.ok(kempf.indexOf("No open reorders or orders") < 0);
assert.ok(kempf.indexOf("VMI-9") >= 0);
assert.ok(kempf.indexOf("VMI-10") < 0);
assert.ok(kempf.indexOf("jim@example.com") < 0);
assert.ok(kempf.indexOf("Out") >= 0);
assert.ok(kempf.indexOf("No count yet") >= 0);
assert.ok(kempf.indexOf("ERP item 421") >= 0);
assert.ok(kempf.indexOf("3145 NE Columbia Ave") >= 0);
assert.strictEqual(P.companyHtml(1, base(), { today: TODAY }), "");

var anchor = P.companyHtml(183, base(), { today: TODAY });
assert.ok(anchor.indexOf("Portal account is on DELETE") >= 0);
assert.ok(anchor.indexOf("BLUE") >= 0);
assert.ok(anchor.indexOf("Kempf Paper") < 0);
assert.ok(anchor.indexOf("jennifer@example.com") < 0);

var masked = P.companyHtml(169, Object.assign(base(), {
  stock: base().stock.map(function (p) {
    return p.part_id === 1 ? Object.assign({}, p, { counted_by: "counter@example.com", counted_at: "2026-11-10T00:00:00Z" }) : p;
  })
}), { today: TODAY });
assert.ok(masked.indexOf("Portal user") >= 0);
assert.ok(masked.indexOf("counter@example.com") < 0);

var printed = P.printHtml(report);
assert.ok(printed.indexOf("Reorder report") >= 0);
assert.ok(printed.indexOf("@") < 0);
assert.ok(printed.indexOf("$") < 0);

console.log("crm-portal tests ok");
