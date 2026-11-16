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

var html = Tasks.sectionHtml(summary, "Tasks did not load. <script>");
assert.ok(html.indexOf("<h2>What we need to do</h2>") > 0);
assert.ok(html.indexOf("<h2>Tasks</h2>") < 0);
assert.ok(html.indexOf("<h3>Patrick</h3>") < html.indexOf("<h3>Annie</h3>"));
assert.ok(html.indexOf("<h3>Annie</h3>") < html.indexOf("<h3>Rich</h3>"));
assert.ok(html.indexOf("<h3>Rich</h3>") < html.indexOf("<h3>Landon</h3>"));
assert.ok(html.indexOf("<h3>Landon</h3>") < html.indexOf("<h3>Amber</h3>"));
assert.ok(html.indexOf("Shared quote follow-up") > 0);
assert.ok(html.indexOf("Review the price sheet") > 0);
assert.ok(html.indexOf("Nothing overdue or due today.") > 0);
assert.ok(html.indexOf("&lt;script&gt;") > 0);
assert.strictEqual(html.indexOf("<button"), -1);
assert.strictEqual(html.indexOf("<input"), -1);
assert.strictEqual(html.indexOf("checkbox"), -1);
assert.ok(html.indexOf("Not on this huddle") < 0);
assert.ok(html.indexOf("Service desk") < 0);

var blank = Tasks.summarize([], TODAY);
blank.forEach(function (row) {
  assert.deepStrictEqual(row.counts, { open: 0, overdue: 0, dueToday: 0, comingDue: 0, done: 0 });
  assert.strictEqual(row.callouts.length, 0);
  assert.strictEqual(row.open.length, 0);
});

assert.strictEqual(Tasks.addDays("2026-10-29", 7), "2026-11-05");
assert.strictEqual(Tasks.sectionHtml(null, "").indexOf("task-grid"), -1);
assert.strictEqual(Tasks.sectionHtml(null, "").indexOf("<input"), -1);

assert.strictEqual(Tasks.rosterName("Amber"), "Amber");
assert.strictEqual(Tasks.rosterName(" amber "), "Amber");
assert.strictEqual(Tasks.rosterName("Rich Olson"), "Rich");
assert.strictEqual(Tasks.rosterName("Patrick, Annie"), "");
assert.strictEqual(Tasks.rosterName("Dan"), "");
assert.strictEqual(Tasks.rosterName(""), "");
assert.strictEqual(Tasks.rosterName(null), "");

var added = Tasks.newTaskRow("amber", "  Call the yard  ", "");
assert.deepStrictEqual(added.row, {
  text: "Call the yard",
  owner: "Amber",
  category: "General",
  priority: "Medium",
  due: null,
  done: false,
  attachments: []
});
assert.strictEqual(Tasks.newTaskRow("Amber", "Send it", "2026-11-16").row.due, "2026-11-16");
assert.strictEqual(Tasks.newTaskRow("Rich Olson", "File it", null).row.owner, "Rich");
assert.strictEqual(Tasks.newTaskRow("Dan", "Nope", "").error, "owner");
assert.strictEqual(Tasks.newTaskRow("Amber", "  ", "2026-11-16").error, "text");
assert.strictEqual(Tasks.newTaskRow("Amber", "X", "11/16/2026").error, "due");
assert.strictEqual(Object.prototype.hasOwnProperty.call(added.row, "updated_at"), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(added.row, "id"), false);

var tagged = rows.map(function (row, i) {
  var copy = {};
  Object.keys(row).forEach(function (key) { copy[key] = row[key]; });
  copy.id = i + 1;
  return copy;
});
var taggedSummary = Tasks.summarize(tagged, TODAY);
var readonlyTagged = Tasks.sectionHtml(taggedSummary, "");
assert.strictEqual(readonlyTagged.indexOf("data-task-id"), -1);
assert.strictEqual(readonlyTagged.indexOf("Other open"), -1);
assert.strictEqual(readonlyTagged.indexOf("<input"), -1);
assert.ok(readonlyTagged.indexOf("Send the packing list") < 0);
assert.ok(readonlyTagged.indexOf("No date yet") < 0);

var live = Tasks.sectionHtml(taggedSummary, "Tasks did not load. <script>", { interactive: true, owner: "Amber" });
assert.ok(live.indexOf("id='huddleTaskForm'") > 0);
assert.ok(live.indexOf("Add a task for Amber<input") > 0);
assert.ok(live.indexOf("name='text'") > 0);
assert.ok(live.indexOf("type='date'") > 0);
assert.ok(live.indexOf("required") > 0);
assert.strictEqual(live.indexOf("type='date' required"), -1);
assert.strictEqual(live.indexOf("name='owner'"), -1);
assert.strictEqual(live.indexOf("<select"), -1);
assert.ok(live.indexOf(">Add task</button>") > 0);
assert.ok(live.indexOf("checked") < 0);
assert.ok(live.indexOf("&lt;script&gt;") > 0);
assert.ok(live.indexOf("Already filed") < 0);
assert.ok(live.indexOf("Finished today") < 0);
assert.ok(live.indexOf("Not on this huddle") < 0);

function card(html, name) {
  var start = html.indexOf("<h3>" + name + "</h3>");
  var end = html.indexOf("</article>", start);
  return html.slice(start, end);
}
var amberCard = card(live, "Amber");
assert.ok(amberCard.indexOf("Nothing overdue or due today.") > 0);
assert.ok(amberCard.indexOf("Other open") > 0);
assert.ok(amberCard.indexOf("data-task-id='9'") < amberCard.indexOf("data-task-id='4'"));
assert.ok(amberCard.indexOf("Send the packing list") > 0);
var patrickCard = card(live, "Patrick");
assert.ok(patrickCard.indexOf("data-task-id='12'") < patrickCard.indexOf("data-task-id='1'>"));
assert.ok(patrickCard.indexOf("data-task-id='1'>") < patrickCard.indexOf("data-task-id='3'>"));
assert.ok(patrickCard.indexOf("type='checkbox'") > 0);
var richCard = card(live, "Rich");
assert.ok(richCard.indexOf("data-task-id='2'") > 0);
assert.ok(richCard.indexOf("data-task-id='2'") < richCard.indexOf("Other open"));
assert.ok(richCard.indexOf("Other open") < richCard.indexOf("data-task-id='6'"));

var noOwner = Tasks.sectionHtml(summary, "", { interactive: true, owner: "" });
assert.ok(noOwner.indexOf(">Add a task<input") > 0);
assert.strictEqual(noOwner.indexOf("Add a task for"), -1);

var nasty = Tasks.summarize([{ id: 5, text: "<script>", owner: "Amber", due: null, done: false }], TODAY);
var nastyHtml = Tasks.sectionHtml(nasty, "", { interactive: true, owner: "Amber <img>" });
assert.ok(nastyHtml.indexOf("&lt;script&gt;") > 0);
assert.ok(nastyHtml.indexOf("Amber &lt;img&gt;") > 0);
assert.strictEqual(nastyHtml.indexOf("<script>"), -1);
assert.strictEqual(nastyHtml.indexOf("<img"), -1);
assert.ok(nastyHtml.indexOf("data-task-id='5'") > 0);
assert.strictEqual(Tasks.sectionHtml(null, "", { interactive: true, owner: "Amber" }).indexOf("task-grid"), -1);
assert.ok(Tasks.sectionHtml(null, "", { interactive: true, owner: "Amber" }).indexOf("id='huddleTaskForm'") > 0);

console.log("huddle-tasks tests passed");
