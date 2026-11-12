var assert = require("assert");
var Card = require("./huddle-scorecard.js");
var Score = require("./huddle-score.js");

assert.strictEqual(Card.huddleStart("2026-11-05").toISOString(), "2026-11-05T16:00:00.000Z");
assert.strictEqual(Card.huddleStart("2026-07-08").toISOString(), "2026-07-08T15:00:00.000Z");

var before = Card.plan(new Date("2026-11-05T15:59:00.000Z"));
assert.strictEqual(before.today, "2026-11-05");
assert.strictEqual(before.displayDay, "2026-11-04");
assert.strictEqual(before.capture, false);
assert.ok(before.waitMs > 0 && before.waitMs <= 60000);

var atStart = Card.plan(new Date("2026-11-05T16:00:00.000Z"));
assert.strictEqual(atStart.displayDay, "2026-11-05");
assert.strictEqual(atStart.capture, true);
assert.strictEqual(atStart.waitMs, null);

var stillOpen = Card.plan(new Date("2026-11-05T16:02:59.000Z"));
assert.strictEqual(stillOpen.capture, true);

var closed = Card.plan(new Date("2026-11-05T16:03:00.000Z"));
assert.strictEqual(closed.displayDay, "2026-11-05");
assert.strictEqual(closed.capture, false);
assert.strictEqual(closed.waitMs, null);

var afternoon = Card.plan(new Date("2026-11-05T20:00:00.000Z"));
assert.strictEqual(afternoon.capture, false);
assert.strictEqual(afternoon.displayDay, "2026-11-05");

var saturday = Card.plan(new Date("2026-11-07T16:00:00.000Z"));
assert.strictEqual(saturday.today, "2026-11-07");
assert.strictEqual(saturday.displayDay, "2026-11-06");
assert.strictEqual(saturday.capture, false);
assert.strictEqual(saturday.waitMs, null);

var mondayMorning = Card.plan(new Date("2026-11-09T15:00:00.000Z"));
assert.strictEqual(mondayMorning.displayDay, "2026-11-06");
assert.strictEqual(mondayMorning.capture, false);
assert.strictEqual(mondayMorning.waitMs, 60 * 60 * 1000);

var summer = Card.plan(new Date("2026-07-08T14:59:30.000Z"));
assert.strictEqual(summer.capture, false);
assert.strictEqual(summer.displayDay, "2026-07-07");
assert.strictEqual(Card.plan(new Date("2026-07-08T15:00:00.000Z")).capture, true);

var won = ["customer_po", "driven_po", "shipped", "delivered", "invoice_sent", "paid"];
var loads = Card.countLoads({
  yesterday: "2026-11-04",
  weekStart: "2026-11-02",
  weekEnd: "2026-11-04",
  weekDays: 3,
  wonStageKeys: won,
  deals: [
    { id: 1, stage: "delivered", est_delivery_date: "2026-11-04", est_ship_date: "2026-11-03", sales_rep: "Rich", custom: { driver: "patrick" } },
    { id: 1, stage: "delivered", est_delivery_date: "2026-11-04", custom: { driver: "Patrick" } },
    { id: 2, stage: "shipped", est_delivery_date: "", est_ship_date: "2026-11-03", sales_rep: "Landon", custom: {} },
    { id: 3, stage: "delivered", est_delivery_date: "2026-11-02", custom: { delivered_by: "Sam" } },
    { id: 4, stage: "delivered", est_delivery_date: "2026-11-05", custom: { driver: "Patrick" } },
    { id: 5, stage: "quote_sent", est_delivery_date: "2026-11-04", custom: { driver: "Patrick" } },
    { id: 6, stage: "delivered", est_delivery_date: "2026-11-04", custom: { _status: "lost", driver: "Patrick" } },
    { id: 7, stage: "paid", est_delivery_date: "2026-10-30", custom: { truck_driver: "Amber" } }
  ]
});
assert.strictEqual(loads.noneLogged, false);
assert.strictEqual(loads.yesterday.actual, 1);
assert.strictEqual(loads.yesterday.goal, 2);
assert.strictEqual(loads.yesterday.tone, "miss");
assert.strictEqual(loads.week.actual, 3);
assert.strictEqual(loads.week.goal, 6);
assert.strictEqual(loads.week.tone, "miss");
assert.deepStrictEqual(loads.people.map(function (p) { return p.name + ":" + p.yesterday + ":" + p.week; }), [
  "Patrick:1:1",
  "Amber:0:0",
  "Sam:0:1"
]);

var emptyLoads = Card.countLoads({
  yesterday: "2026-11-04",
  weekStart: "2026-11-02",
  weekEnd: "2026-11-04",
  weekDays: 3,
  wonStageKeys: won,
  deals: [{ id: 9, stage: "quote_sent", est_ship_date: "2026-11-04", sales_rep: "Patrick", custom: {} }]
});
assert.strictEqual(emptyLoads.noneLogged, true);
assert.strictEqual(emptyLoads.yesterday.actual, 0);
assert.deepStrictEqual(emptyLoads.people, []);

var outside = Card.countLoads({
  yesterday: "2026-11-04",
  weekStart: "2026-11-02",
  weekEnd: "2026-11-04",
  weekDays: 3,
  wonStageKeys: won,
  deals: [{ id: 8, stage: "delivered", est_delivery_date: "2026-10-28", custom: {} }]
});
assert.strictEqual(outside.noneLogged, false);
assert.strictEqual(outside.yesterday.actual, 0);
assert.strictEqual(outside.week.actual, 0);

assert.strictEqual(Card.weekValue({ net_profit: 1, net_operating_income_90d: 999 }, "net_profit"), null);
assert.strictEqual(Card.weekValue({ net_profit_w4: 0 }, "net_profit"), 0);
assert.strictEqual(Card.weekValue({ cash_on_hand_w4: -19354.24 }, "cash_on_hand"), -19354.24);
assert.strictEqual(Card.weekValue({ labor_pct_sales_w4: "" }, "labor_pct_sales"), null);
assert.strictEqual(Card.weekValue({}, "fulfillment_time"), null);

var goals = [
  { scope: "team", rep: null, metric: "sales_landed", period: "day", target: 23000, active: true },
  { scope: "team", rep: null, metric: "wins", period: "week", target: 3, active: true }
];
var scored = Score.score({
  today: "2026-11-05",
  goals: goals,
  activity: [],
  quotes: [],
  deals: [
    { id: 10, sales_rep: "Rich", stage: "customer_po", stage_changed_at: "2026-11-04T15:00:00Z", custom: { _won_at: "2026-11-04" }, quantity: 2, price_per_unit: 1000 }
  ],
  tally: []
});
var snap = Card.build({
  today: scored.today,
  yesterday: scored.yesterday,
  weekStart: scored.weekStart,
  weekEnd: scored.weekEnd,
  weekDays: scored.weekDays,
  lastWeek: scored.lastWeek,
  deals: [
    { id: 10, stage: "delivered", est_delivery_date: "2026-11-04", custom: { driver: "<Patrick>" } }
  ],
  wonStageKeys: won,
  team: scored.team.cells,
  weekData: {
    revenue_weekly_w4: 23236.38,
    gross_margin_w4: 25,
    net_profit_w4: 82169.13,
    cash_on_hand_w4: -19354.24,
    ar_days_w4: 45.4,
    net_profit: 1,
    net_operating_income_90d: 22592.51
  },
  weekOf: "2026-09-21"
});
assert.strictEqual(snap.ownership.sales_landed.yesterday.actual, scored.team.cells.sales_landed.yesterday.actual);
assert.strictEqual(snap.ownership.sales_landed.yesterday.goal, 23000);
assert.strictEqual(snap.ownership.sales_landed.yesterday.tone, "miss");
assert.strictEqual(snap.ownership.sales_landed.week.goal, 23000 * scored.weekDays);
assert.strictEqual(snap.ownership.wins.week.goal, 3);
assert.strictEqual(snap.ownership.wins.week.actual, scored.team.cells.wins.week.actual);
assert.strictEqual(snap.command.net_profit, 82169.13);
assert.strictEqual(snap.command.revenue_weekly, 23236.38);
assert.strictEqual(snap.command.cash_on_hand, -19354.24);
assert.strictEqual(snap.ownership.cash_on_hand, -19354.24);
assert.strictEqual(snap.command.labor_pct_sales, null);
assert.strictEqual(snap.ops.fulfillment_time, null);
assert.strictEqual(snap.ops.vendor_performance, null);
assert.strictEqual(snap.ops.on_time_delivery, null);
assert.strictEqual(snap.loads.yesterday.actual, 1);
assert.strictEqual(snap.loads.people[0].name, "Patrick");

function hiddenFromSetters(label, html) {
  ["Financial snapshot", "Revenue", "Gross margin", "Net profit", "Cash on hand", "A/P days", "Labor"].forEach(function (needle) {
    assert.ok(html.indexOf(needle) < 0, label + " still shows " + needle);
  });
}

var html = Card.sectionHtml({ snapshot: snap, note: "", showFinancial: true });
assert.ok(html.indexOf("Customer service") < html.indexOf("Financial snapshot"));
assert.ok(html.indexOf("Financial snapshot") < html.indexOf("in-house loads delivered"));
assert.ok(html.indexOf(">B</span>Financial snapshot") > -1);
assert.ok(html.indexOf(">C</span>Logistics") > -1);
assert.ok(html.indexOf("In-house truck") > -1);
assert.ok(html.indexOf("Order fulfillment") > -1);
assert.ok(html.indexOf("Vendor performance") > -1);
assert.ok(html.indexOf("On time delivery") > -1);
assert.ok(html.indexOf("A/R days outstanding") > -1);
assert.ok(html.indexOf("45.4") > -1);
assert.ok(html.indexOf("Revenue") > -1);
assert.ok(html.indexOf("$23,236") > -1);
assert.ok(html.indexOf("25%") > -1);
assert.ok(html.indexOf("A/P days outstanding") > -1);
assert.ok(html.indexOf("Labor % of sales") > -1);
assert.ok(html.indexOf("Quotes won") > -1);
assert.ok(html.indexOf("Week · goal 3") > -1);
assert.ok(html.indexOf("Sales landed") > -1);
assert.ok(html.indexOf("$2,000") > -1);
assert.ok(html.indexOf("n/a") > -1);
assert.ok(html.indexOf("&lt;Patrick&gt;") > -1);
assert.ok(html.indexOf("22592") < 0);
assert.ok(html.indexOf("does not recompute") > -1);
assert.ok(html.toLowerCase().indexOf("brokerage") < 0);
assert.ok(html.toLowerCase().indexOf("commission") < 0);
assert.ok(html.indexOf("huddleSalesSlot") > -1);

var setterHtml = Card.sectionHtml({ snapshot: snap, note: "", showFinancial: false });
hiddenFromSetters("setter", setterHtml);
assert.ok(setterHtml.indexOf("A/R days outstanding") > -1);
assert.ok(setterHtml.indexOf(">C</span>Logistics") > -1);

var blank = Card.sectionHtml({ snapshot: null, huddleDay: "2026-11-05", note: "No snapshot was saved at 10:00 AM CT for this huddle.", showFinancial: true });
assert.ok(blank.indexOf("not captured") > -1);
assert.ok(blank.indexOf("In-house truck") > -1);
assert.ok(blank.indexOf("Order fulfillment") > -1);
assert.ok(blank.indexOf("Financial snapshot") > -1);
assert.ok(blank.indexOf("$2,000") < 0);
assert.ok(blank.indexOf("$23,236") < 0);

var noneHtml = Card.sectionHtml({
  snapshot: Card.build({
    today: "2026-11-05",
    yesterday: "2026-11-04",
    weekStart: "2026-11-02",
    weekEnd: "2026-11-04",
    weekDays: 3,
    lastWeek: false,
    deals: [],
    wonStageKeys: won,
    team: scored.team.cells,
    weekData: { cash_on_hand_w4: 0, labor_pct_sales_w4: 0 },
    weekOf: ""
  }),
  note: ""
});
assert.ok(noneHtml.indexOf("none logged") > -1);
assert.ok(noneHtml.indexOf(">0<") > -1);
assert.ok(noneHtml.indexOf("Labor % of sales") > -1);
var loadsOnly = Card.sectionHtml({ snapshot: Card.build({
  today: "2026-11-05",
  yesterday: "2026-11-04",
  weekStart: "2026-11-02",
  weekEnd: "2026-11-04",
  weekDays: 3,
  lastWeek: false,
  deals: [],
  wonStageKeys: won,
  team: scored.team.cells,
  weekData: {},
  weekOf: ""
}), showFinancial: false });
assert.ok(loadsOnly.indexOf(">$0<") < 0);
hiddenFromSetters("empty loads", loadsOnly);

console.log("huddle-scorecard tests passed");
