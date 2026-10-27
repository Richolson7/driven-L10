var assert = require("assert");
var Score = require("./huddle-score.js");

var goals = [
  { scope: "rep", rep: "Rich", metric: "touches", period: "day", target: 25, active: true },
  { scope: "rep", rep: "Rich", metric: "calls", period: "day", target: 15, active: true },
  { scope: "rep", rep: "Rich", metric: "emails", period: "day", target: 10, active: true },
  { scope: "rep", rep: "Rich", metric: "quotes_sent", period: "day", target: 1, active: true },
  { scope: "rep", rep: "Landon", metric: "touches", period: "day", target: 25, active: true },
  { scope: "rep", rep: "Landon", metric: "calls", period: "day", target: 15, active: true },
  { scope: "rep", rep: "Landon", metric: "emails", period: "day", target: 10, active: true },
  { scope: "rep", rep: "Landon", metric: "quotes_sent", period: "day", target: 1, active: true },
  { scope: "team", rep: null, metric: "sales_landed", period: "day", target: 23000, active: true },
  { scope: "team", rep: null, metric: "wins", period: "week", target: 3, active: true }
];

assert.strictEqual(Score.priorWorkday("2026-10-27"), "2026-10-26");
assert.strictEqual(Score.weekStartMonday("2026-10-26"), "2026-10-26");
assert.strictEqual(Score.weekdaysBetween("2026-10-26", "2026-10-26"), 1);

assert.strictEqual(Score.priorWorkday("2026-10-26"), "2026-10-23");
assert.strictEqual(Score.weekStartMonday("2026-10-23"), "2026-10-19");
assert.strictEqual(Score.weekdaysBetween("2026-10-19", "2026-10-23"), 5);

assert.strictEqual(Score.priorWorkday("2026-10-24"), "2026-10-23");
assert.strictEqual(Score.chicagoToday(new Date("2026-10-27T04:30:00Z")), "2026-10-26");
assert.strictEqual(Score.chicagoToday(new Date("2026-10-26T05:00:00Z")), "2026-10-26");

function run(today, extra) {
  return Score.score(Object.assign({
    today: today,
    goals: goals,
    activity: [],
    quotes: [],
    deals: [],
    tally: []
  }, extra));
}

var tue = run("2026-10-27", {
  activity: [
    { kind: "call", by_user: "Rich", at: "2026-10-26T15:00:00Z" },
    { kind: "email", by_user: "rich", at: "2026-10-26T16:00:00Z" },
    { kind: "touch", by_user: "Landon", at: "2026-10-26T17:00:00Z" },
    { kind: "note", by_user: "Rich", at: "2026-10-26T18:00:00Z" },
    { kind: "move", by_user: "Rich", at: "2026-10-26T18:05:00Z" },
    { kind: "other", by_user: "Annie", at: "2026-10-26T18:10:00Z" },
    { kind: "call", by_user: "Rich", at: "2026-10-27T04:30:00Z" }
  ],
  tally: [{ day: "2026-10-26", owner: "Landon", dials: 2, emails: 1 }],
  quotes: [
    { id: 1, deal_id: 10, rep: "Rich", sent_date: "2026-10-26" },
    { id: 2, deal_id: null, rep: "Landon", sent_date: "2026-10-26" }
  ],
  deals: [
    { id: 10, sales_rep: "Rich", stage: "customer_po", quote_sent_date: "2026-10-26", stage_changed_at: "2026-10-26T12:00:00Z", custom: { _won_at: "2026-10-26", _quote: { lines: [{ qty: 2, price: 1000 }, { qty: 1, price: 500 }] } }, quantity: 1, price_per_unit: 1 },
    { id: 11, sales_rep: "House", stage: "paid", stage_changed_at: "2026-10-26T12:00:00Z", custom: { _won_at: "2026-10-26" }, quantity: 4, price_per_unit: 250 },
    { id: 12, sales_rep: "Landon", stage: "shipped", stage_changed_at: "2026-10-26T12:00:00Z", custom: { _status: "lost", _won_at: "2026-10-26" }, quantity: 9, price_per_unit: 100 },
    { id: 13, sales_rep: "Landon", stage: "quote_sent", quote_sent_date: "2026-10-26", stage_changed_at: "2026-10-20T12:00:00Z", custom: {}, quantity: 1, price_per_unit: 50 }
  ]
});

var rich = tue.reps[0];
var landon = tue.reps[1];
assert.strictEqual(rich.name, "Rich");
assert.strictEqual(rich.cells.calls.yesterday.actual, 2);
assert.strictEqual(rich.cells.emails.yesterday.actual, 1);
assert.strictEqual(rich.cells.touches.yesterday.actual, 3);
assert.strictEqual(rich.cells.quotes_sent.yesterday.actual, 1);
assert.strictEqual(rich.cells.sales_landed.yesterday.actual, 2500);
assert.strictEqual(rich.cells.wins.yesterday.actual, 1);
assert.strictEqual(rich.cells.touches.yesterday.tone, "miss");
assert.strictEqual(rich.cells.quotes_sent.yesterday.tone, "hit");
assert.strictEqual(rich.cells.wins.yesterday.goal, null);
assert.strictEqual(rich.cells.sales_landed.yesterday.goal, null);

assert.strictEqual(landon.cells.calls.yesterday.actual, 2);
assert.strictEqual(landon.cells.emails.yesterday.actual, 1);
assert.strictEqual(landon.cells.touches.yesterday.actual, 4);
assert.strictEqual(landon.cells.quotes_sent.yesterday.actual, 2);
assert.strictEqual(landon.cells.wins.yesterday.actual, 0);
assert.strictEqual(landon.cells.sales_landed.yesterday.actual, 0);

assert.strictEqual(tue.team.cells.touches.yesterday.actual, 7);
assert.strictEqual(tue.team.cells.touches.yesterday.goal, 50);
assert.strictEqual(tue.team.cells.calls.yesterday.goal, 30);
assert.strictEqual(tue.team.cells.sales_landed.yesterday.actual, 3500);
assert.strictEqual(tue.team.cells.sales_landed.yesterday.goal, 23000);
assert.strictEqual(tue.team.cells.sales_landed.yesterday.tone, "miss");
assert.strictEqual(tue.team.cells.wins.yesterday.actual, 2);
assert.strictEqual(tue.team.cells.wins.yesterday.goal, null);
assert.strictEqual(tue.team.cells.wins.week.goal, 3);
assert.strictEqual(tue.team.cells.quotes_sent.yesterday.actual, 3);
assert.strictEqual(tue.unmatched, 1);
assert.strictEqual(tue.lastWeek, false);
assert.strictEqual(tue.weekDays, 1);

var mon = run("2026-10-26", {
  deals: [
    { id: 20, sales_rep: "Rich", stage: "delivered", custom: { _won_at: "2026-10-23" }, quantity: 1, price_per_unit: 115000 }
  ]
});
assert.strictEqual(mon.lastWeek, true);
assert.strictEqual(mon.weekStart, "2026-10-19");
assert.strictEqual(mon.weekDays, 5);
assert.strictEqual(mon.reps[0].cells.touches.week.goal, 125);
assert.strictEqual(mon.team.cells.sales_landed.week.goal, 115000);
assert.strictEqual(mon.team.cells.sales_landed.week.actual, 115000);
assert.strictEqual(mon.team.cells.sales_landed.week.tone, "hit");
assert.strictEqual(mon.team.cells.wins.week.actual, 1);
assert.strictEqual(mon.team.cells.wins.week.tone, "miss");
assert.strictEqual(mon.reps[0].cells.sales_landed.yesterday.actual, 115000);

console.log("huddle-score tests passed");
