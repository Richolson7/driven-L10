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

var html = Card.sectionHtml({ snapshot: snap, note: "" });
assert.ok(html.indexOf("Loads per day") > -1);
assert.ok(html.indexOf("Order fulfillment") < 0);
assert.ok(html.indexOf("Vendor performance") < 0);
assert.ok(html.indexOf("On time delivery") < 0);
assert.ok(html.indexOf("Customer service") < 0);
assert.ok(html.indexOf("Command center") < 0);
assert.ok(html.indexOf("Cash on hand") < 0);
assert.ok(html.indexOf("Net profit") < 0);
assert.ok(html.indexOf("Gross margin") < 0);
assert.ok(html.indexOf("Labor % of sales") < 0);
assert.ok(html.indexOf(">Revenue<") < 0);
assert.ok(html.indexOf("$23,236") < 0);
assert.ok(html.indexOf("$82,169") < 0);
assert.ok(html.indexOf("-$19,354") < 0);
assert.ok(html.indexOf("45.4") < 0);
assert.ok(html.indexOf("25%") < 0);
assert.ok(html.indexOf("Stored Week Of") < 0);
assert.ok(html.indexOf("Annie") < 0);
assert.ok(html.indexOf("Amber") < 0);
assert.ok(html.indexOf("$2,000") < 0);
assert.ok(html.indexOf("&lt;Patrick&gt;") > -1);
assert.ok(html.indexOf("22592") < 0);
assert.ok(html.indexOf("does not recompute") > -1);
assert.ok(html.indexOf("freight brokerage") < 0);

var blank = Card.sectionHtml({ snapshot: null, huddleDay: "2026-11-05", note: "No snapshot was saved at 10:00 AM CT for this huddle." });
assert.ok(blank.indexOf("not captured") > -1);
assert.ok(blank.indexOf("Loads per day") > -1);
assert.ok(blank.indexOf("Order fulfillment") < 0);
assert.ok(blank.indexOf("Net profit") < 0);
assert.ok(blank.indexOf("Labor % of sales") < 0);
assert.ok(blank.indexOf("Cash on hand") < 0);
assert.ok(blank.indexOf("Command center") < 0);
assert.ok(blank.indexOf("$23,236") < 0);
assert.ok(blank.indexOf("23236") < 0);

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
assert.ok(noneHtml.indexOf("No week label is stored") < 0);
assert.ok(noneHtml.indexOf(">0%<") < 0);
assert.ok(noneHtml.indexOf(">$0<") < 0);
assert.ok(noneHtml.indexOf("Cash on hand") < 0);
assert.ok(noneHtml.indexOf("Command center") < 0);

assert.strictEqual(Card.weekStartMonday("2026-11-23"), "2026-11-23");
assert.deepStrictEqual(Card.weekdaysMondayThrough("2026-11-23"), ["2026-11-23"]);
assert.strictEqual(Card.weekStartMonday("2026-11-22"), "2026-11-16");
assert.deepStrictEqual(Card.weekdaysMondayThrough("2026-11-22"), [
  "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"
]);
assert.strictEqual(Card.weekStartMonday("2026-11-29"), "2026-11-23");
assert.deepStrictEqual(Card.weekdaysMondayThrough("2026-11-29"), [
  "2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27"
]);
assert.deepStrictEqual(Card.weekdaysMondayThrough("2026-11-24"), ["2026-11-23", "2026-11-24"]);
assert.strictEqual(Card.ymdInChicago("2026-11-24"), "2026-11-24");
assert.strictEqual(Card.ymdInChicago("2026-11-24T05:30:00Z"), "2026-11-23");
assert.strictEqual(Card.ymdInChicago("2026-11-24T06:00:00Z"), "2026-11-24");
assert.strictEqual(Card.ymdInChicago(""), "");

var patrickGoals = [
  { id: 14, scope: "rep", rep: "Patrick", metric: "calls", period: "day", target: 30, active: true },
  { scope: "rep", rep: "patrick", metric: "calls", period: "week", target: 99, active: true },
  { scope: "rep", rep: "Rich", metric: "calls", period: "day", target: 15, active: true }
];
assert.strictEqual(Card.goalNumber(patrickGoals, "rep", "patrick", "calls", "day"), 30);
assert.strictEqual(Card.goalNumber(patrickGoals, "rep", "Patrick", "calls", "week"), 99);
assert.strictEqual(Card.goalNumber([
  { scope: "rep", rep: "Patrick", metric: "calls", period: "day", target: 30, active: false }
], "rep", "Patrick", "calls", "day"), null);

var todayBoard = Card.patrickWeek({
  today: "2026-11-24",
  goals: patrickGoals,
  activity: [
    { kind: "move", by_user: "Patrick", at: "2026-11-24T15:12:07Z" },
    { kind: "draft", by_user: "Patrick", at: "2026-11-24T14:59:22Z" },
    { kind: "call_planned", by_user: "Patrick", at: "2026-11-23T14:00:00Z" }
  ],
  tally: [],
  truckChecks: [],
  shipments: []
});
assert.strictEqual(todayBoard.days.length, 2);
assert.strictEqual(todayBoard.days[0].ymd, "2026-11-23");
assert.deepStrictEqual(todayBoard.days[0].loads, { actual: 0, goal: 2 });
assert.deepStrictEqual(todayBoard.days[0].calls, { actual: 0, goal: 30 });
assert.deepStrictEqual(todayBoard.days[1].loads, { actual: 0, goal: 2 });
assert.deepStrictEqual(todayBoard.days[1].calls, { actual: 0, goal: 30 });
assert.deepStrictEqual(todayBoard.loadsWeek, { actual: 0, goal: 4 });
assert.deepStrictEqual(todayBoard.callsWeek, { actual: 0, goal: 60 });
assert.strictEqual(todayBoard.callGoalPlaceholder, false);

var counted = Card.patrickWeek({
  today: "2026-11-24",
  goals: patrickGoals,
  activity: [
    { kind: "call", by_user: "patrick", at: "2026-11-23T18:00:00Z" },
    { kind: "call", by_user: "Patrick", at: "2026-11-24T15:00:00Z" },
    { kind: "call", by_user: "Patrick", at: "2026-11-24T05:30:00Z" },
    { kind: "call_planned", by_user: "Patrick", at: "2026-11-23T14:00:00Z" },
    { kind: "draft", by_user: "Patrick", at: "2026-11-24T14:00:00Z" },
    { kind: "move", by_user: "Patrick", at: "2026-11-24T15:12:00Z" },
    { kind: "email", by_user: "Patrick", at: "2026-11-24T16:00:00Z" },
    { kind: "call", by_user: "Rich", at: "2026-11-24T16:00:00Z" }
  ],
  tally: [
    { day: "2026-11-24", owner: "Patrick", dials: 4, emails: 9 },
    { day: "2026-11-23", owner: "patrick", dials: 1, emails: 3 },
    { day: "2026-11-24", owner: "Landon", dials: 8, emails: 1 }
  ],
  truckChecks: [
    { date: "2026-11-23" },
    { at: "2026-11-24T18:00:00Z" },
    { date: "2026-11-24", planned: true },
    { date: "2026-11-24", status: "planned", source: "delivery-calendar" },
    { est_ship_date: "2026-11-23", est_delivery_date: "2026-11-24", stage: "shipped", sales_rep: "Patrick", source: "crm" },
    { date: "2026-11-22" },
    { date: "2026-11-20" }
  ],
  shipments: [
    { ship_date: "2026-11-24" },
    { ship_date: "2026-11-23" },
    { est_ship_date: "2026-11-24", est_delivery_date: "2026-11-23" },
    { ship_date: "2026-11-21" },
    { ship_date: "2026-11-24", status: "planned" }
  ]
});
assert.strictEqual(counted.days[0].loads.actual, 2);
assert.strictEqual(counted.days[0].calls.actual, 3);
assert.strictEqual(counted.days[1].loads.actual, 2);
assert.strictEqual(counted.days[1].calls.actual, 5);
assert.deepStrictEqual(counted.loadsWeek, { actual: 4, goal: 4 });
assert.deepStrictEqual(counted.callsWeek, { actual: 8, goal: 60 });

var mondayOnly = Card.patrickWeek({
  today: "2026-11-23",
  goals: patrickGoals,
  activity: [],
  tally: [],
  truckChecks: [{ date: "2026-11-20" }],
  shipments: []
});
assert.strictEqual(mondayOnly.days.length, 1);
assert.deepStrictEqual(mondayOnly.loadsWeek, { actual: 0, goal: 2 });
assert.deepStrictEqual(mondayOnly.callsWeek, { actual: 0, goal: 30 });

var placeholder = Card.patrickWeek({
  today: "2026-11-23",
  goals: [
    { scope: "rep", rep: "Patrick", metric: "calls", period: "week", target: 30, active: true },
    { scope: "rep", rep: "Patrick", metric: "calls", period: "day", target: 30, active: false }
  ],
  activity: [],
  tally: [],
  truckChecks: [],
  shipments: []
});
assert.strictEqual(placeholder.callGoalPlaceholder, true);
assert.strictEqual(placeholder.days[0].calls.goal, null);
assert.strictEqual(placeholder.callsWeek.goal, null);
assert.strictEqual(placeholder.days[0].loads.goal, 2);

var row = Card.patrickSectionHtml(todayBoard, 13);
assert.strictEqual((row.match(/<tr/g) || []).length, 1);
assert.strictEqual((row.match(/<td/g) || []).length, 1);
assert.ok(row.indexOf("colspan='13'") > -1);
assert.ok(row.indexOf("patrickWeek") < 0);
assert.ok(row.indexOf("loads-hero") < 0);
assert.ok(row.indexOf("Loads per day") < 0);
assert.ok(row.indexOf("Loads: Mon 11/23 0/2 · Tue 11/24 0/2 · Week 0/4  |  Calls: Mon 0/30 · Tue 0/30 · Week 0/60") > -1);
assert.ok(row.indexOf("How this works:") > -1);
assert.ok(row.indexOf("truck log") > -1);
assert.ok(row.indexOf("other columns in this table are unchanged") > -1);

var missing = Card.patrickSectionHtml(placeholder, 13);
assert.ok(missing.indexOf("0/—") > -1);
assert.ok(missing.indexOf("calls goal not set (placeholder)") > -1);
assert.strictEqual((missing.match(/<tr/g) || []).length, 1);

console.log("huddle-scorecard tests passed");
