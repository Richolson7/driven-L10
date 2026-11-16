var assert = require("assert");
var Tasks = require("./huddle-tasks.js");

var TODAY = "2026-10-29";

assert.deepStrictEqual(Tasks.splitOwners("Patrick, Annie, Landon"), ["Patrick", "Annie", "Landon"]);
assert.deepStrictEqual(Tasks.splitOwners("Rich + Annie"), ["Rich", "Annie"]);
assert.deepStrictEqual(Tasks.splitOwners("  rich   +   annie "), ["rich", "annie"]);
assert.deepStrictEqual(Tasks.splitOwners("Rich and Annie"), ["Rich", "Annie"]);
assert.deepStrictEqual(Tasks.splitOwners("Brady/Rich/Jessica"), ["Brady", "Rich", "Jessica"]);
assert.deepStrictEqual(Tasks.peopleInOwner("Patrick, Annie, Landon"), ["Patrick", "Annie", "Landon"]);
assert.deepStrictEqual(Tasks.peopleInOwner("Rich + Annie"), ["Annie", "Rich"]);
assert.deepStrictEqual(Tasks.peopleInOwner("RICH, ANNIE, LANDON, PATRICK, AMBER"), ["Patrick", "Annie", "Rich", "Landon", "Amber"]);
assert.deepStrictEqual(Tasks.peopleInOwner("Annie, Annie"), ["Annie"]);
assert.deepStrictEqual(Tasks.peopleInOwner("Rich Olson"), ["Rich"]);
assert.deepStrictEqual(Tasks.peopleInOwner("Customer Service"), []);
assert.deepStrictEqual(Tasks.peopleInOwner("Dan"), []);
assert.deepStrictEqual(Tasks.peopleInOwner(""), []);
assert.deepStrictEqual(Tasks.peopleInOwner(null), []);

var rows = [
  { text: "Shared quote follow-up", owner: "Patrick, Annie, Landon", due: "2026-10-20", done: false },
  { text: "Review the price sheet", owner: "Rich + Annie", due: "2026-10-29", done: false },
  { text: "Call the yard", owner: "Patrick", due: "2026-10-28", done: false },
  { text: "Send the packing list", owner: "Amber", due: "2026-11-05", done: false },
  { text: "Later rock", owner: "Landon", due: "2026-11-06", done: false },
  { text: "No date yet", owner: "Rich", due: null, done: false },
  { text: "Already filed", owner: "Patrick", due: "2026-10-01", done: true },
  { text: "Finished today", owner: "Amber", due: "2026-10-29", done: true },
  { text: "Whole team check", owner: "Rich, Annie, Landon, Patrick, Amber", due: "2026-10-31", done: false },
  { text: "Not on this huddle", owner: "Dan", due: "2026-10-01", done: false },
  { text: "Service desk", owner: "Customer Service", due: "2026-10-29", done: false },
  { text: "Older Patrick item", owner: "patrick", due: "2026-10-15", done: false }
];

var summary = Tasks.summarize(rows, TODAY);
assert.deepStrictEqual(summary.map(function (row) { return row.name; }), Tasks.PEOPLE);

function person(name) {
  return summary.find(function (row) { return row.name === name; });
}

var patrick = person("Patrick");
assert.strictEqual(patrick.counts.open, 4);
assert.strictEqual(patrick.counts.overdue, 3);
assert.strictEqual(patrick.counts.dueToday, 0);
assert.strictEqual(patrick.counts.comingDue, 1);
assert.strictEqual(patrick.counts.done, 1);
assert.deepStrictEqual(patrick.callouts.map(function (item) { return item.text; }), [
  "Older Patrick item",
  "Shared quote follow-up",
  "Call the yard"
]);
assert.ok(patrick.callouts.every(function (item) { return item.kind === "overdue"; }));

var annie = person("Annie");
assert.strictEqual(annie.counts.open, 3);
assert.strictEqual(annie.counts.overdue, 1);
assert.strictEqual(annie.counts.dueToday, 1);
assert.strictEqual(annie.counts.comingDue, 1);
assert.strictEqual(annie.counts.done, 0);
assert.deepStrictEqual(annie.callouts.map(function (item) { return item.kind + ":" + item.text; }), [
  "overdue:Shared quote follow-up",
  "today:Review the price sheet"
]);

var rich = person("Rich");
assert.strictEqual(rich.counts.open, 3);
assert.strictEqual(rich.counts.overdue, 0);
assert.strictEqual(rich.counts.dueToday, 1);
assert.strictEqual(rich.counts.comingDue, 1);
assert.strictEqual(rich.counts.done, 0);
assert.deepStrictEqual(rich.callouts.map(function (item) { return item.text; }), ["Review the price sheet"]);

var landon = person("Landon");
assert.strictEqual(landon.counts.open, 3);
assert.strictEqual(landon.counts.overdue, 1);
assert.strictEqual(landon.counts.dueToday, 0);
assert.strictEqual(landon.counts.comingDue, 1);
assert.strictEqual(landon.counts.done, 0);

var amber = person("Amber");
assert.strictEqual(amber.counts.open, 2);
assert.strictEqual(amber.counts.overdue, 0);
assert.strictEqual(amber.counts.dueToday, 0);
assert.strictEqual(amber.counts.comingDue, 2);
assert.strictEqual(amber.counts.done, 1);
assert.strictEqual(amber.callouts.length, 0);

summary.forEach(function (row) {
  var counts = row.counts;
  assert.ok(counts.open >= counts.overdue + counts.dueToday + counts.comingDue);
});

var listed = Tasks.list(rows.map(function (row, i) { return Object.assign({ id: i + 1 }, row); }), TODAY);
assert.deepStrictEqual(listed.map(function (row) { return row.status + ":" + row.text; }), [
  "Overdue:Not on this huddle",
  "Overdue:Older Patrick item",
  "Overdue:Shared quote follow-up",
  "Overdue:Call the yard",
  "Open:Review the price sheet",
  "Open:Service desk",
  "Open:Whole team check",
  "Open:Send the packing list",
  "Open:Later rock",
  "Open:No date yet",
  "Done:Already filed",
  "Done:Finished today"
]);
assert.strictEqual(listed[0].owner, "Dan");
assert.ok(listed.some(function (row) { return row.owner === "Amber" && row.text === "Send the packing list"; }));

var html = Tasks.sectionHtml(listed, "Tasks did not load. <script>");
assert.ok(html.indexOf("<h2>Tasks</h2>") > 0);
assert.ok(html.indexOf("What we need to do") < 0);
assert.ok(html.indexOf("How this works") > 0);
assert.ok(html.indexOf("Add task") > 0);
assert.ok(html.indexOf("Click the Status pill") > 0);
assert.ok(html.indexOf("<th>Task</th><th>Owner</th><th>Due</th><th>Status</th>") > 0);
assert.ok(html.indexOf("Shared quote follow-up") > 0);
assert.ok(html.indexOf("Not on this huddle") > 0);
assert.ok(html.indexOf("Service desk") > 0);
assert.ok(html.indexOf("value='Amber'") > 0);
assert.ok(html.indexOf("&lt;script&gt;") > 0);
assert.strictEqual((html.match(/class='top'/g) || []).length, 3);
assert.ok(html.indexOf("class='top'") < html.indexOf("Not on this huddle"));
assert.ok(html.indexOf("data-task-id='1'") > 0);
assert.ok(html.indexOf("class='pill overdue'") > 0);
assert.ok(html.indexOf("class='pill open'") > 0);
assert.ok(html.indexOf("class='pill done'") > 0);
assert.ok(html.indexOf("aria-label='Mark done'") > 0);
assert.ok(html.indexOf("aria-label='Reopen'") > 0);
assert.ok(html.indexOf("Cash on hand") < 0);
assert.ok(html.indexOf("Command center") < 0);
assert.ok(html.slice(html.indexOf("Already filed") - 120, html.indexOf("Already filed")).indexOf("class='top'") < 0);

var blank = Tasks.summarize([], TODAY);
blank.forEach(function (row) {
  assert.deepStrictEqual(row.counts, { open: 0, overdue: 0, dueToday: 0, comingDue: 0, done: 0 });
  assert.strictEqual(row.callouts.length, 0);
});

assert.strictEqual(Tasks.addDays("2026-10-29", 7), "2026-11-05");
var empty = Tasks.sectionHtml(null, "");
assert.strictEqual(empty.indexOf("task-grid"), -1);
assert.ok(empty.indexOf("Add task") > 0);
assert.ok(empty.indexOf("How this works") > 0);
assert.strictEqual(Tasks.sectionHtml([], "").indexOf("No tasks yet.") > 0, true);

console.log("huddle-tasks tests passed");
