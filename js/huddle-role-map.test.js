var assert = require("assert");
var fs = require("fs");
var path = require("path");
var Role = require("./huddle-role-map.js");

var map = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/task_role_map.json"), "utf8"));
var TODAY = "2026-11-16";

assert.strictEqual(map.tasks.length, 67);
assert.deepStrictEqual(Role.POSITIONS.map(function (item) { return item.person; }), [
  "Rich", "Amber", "Dan", "Annie", "Patrick", "Landon"
]);
assert.deepStrictEqual(Role.MILESTONES, ["Dec 1", "Jan 1", "After Jan 1"]);

assert.strictEqual(map.tasks.filter(function (task) { return Role.milestoneOf(task) === "Dec 1"; }).length, 43);
assert.strictEqual(map.tasks.filter(function (task) { return Role.milestoneOf(task) === "Jan 1"; }).length, 10);
assert.strictEqual(map.tasks.filter(function (task) { return Role.milestoneOf(task) === "After Jan 1"; }).length, 14);

assert.strictEqual(Role.currentRolloutWeek(map, "2026-11-16"), "2026-11-17");
assert.strictEqual(Role.currentRolloutWeek(map, "2026-11-20"), "2026-11-17");
assert.strictEqual(Role.currentRolloutWeek(map, "2026-11-23"), "2026-11-23");
assert.strictEqual(Role.currentRolloutWeek(map, "2026-12-28"), "2026-12-28");
assert.strictEqual(Role.currentRolloutWeek(map, "2027-01-03"), "2026-12-28");
assert.strictEqual(Role.currentRolloutWeek(map, "2027-01-04"), "");

var week = Role.weekItems(map, TODAY);
assert.strictEqual(week.week, "2026-11-17");
assert.strictEqual(week.items.length, 2);
assert.strictEqual(week.items[0].owner, "Rich");
assert.ok(week.items[0].task.indexOf("VMI portal") > 0);
assert.strictEqual(week.items[1].owner, "Amber");
assert.ok(week.items[1].task.indexOf("vendor-payments-by-PO") > 0);

function countOverdue(person) {
  return map.tasks.filter(function (task) {
    return task.owner === person && Role.isOverdue(task, TODAY);
  }).length;
}
assert.strictEqual(countOverdue("Rich"), 1);
assert.strictEqual(countOverdue("Amber"), 5);
assert.strictEqual(countOverdue("Dan"), 1);
assert.strictEqual(countOverdue("Annie"), 1);
assert.strictEqual(countOverdue("Patrick"), 2);
assert.strictEqual(countOverdue("Landon"), 1);

var html = Role.sectionHtml(map, { today: TODAY });
assert.ok(html.indexOf("id='tasksByRole'") > 0);
assert.ok(html.indexOf("<h2>Tasks by role</h2>") > 0);
assert.ok(html.indexOf("id='howToReadThis'") > 0);
assert.ok(html.indexOf("Relationship is work with a person") > 0);
assert.ok(html.indexOf("Operational is a system or a routine") > 0);
assert.ok(html.indexOf("Judgment checkpoint is marked in gold") > 0);
assert.ok(html.indexOf("Two items roll out each week") > 0);
assert.ok(html.indexOf("Red means the date was missed") > 0);
assert.ok(html.indexOf("This week") > 0);
assert.ok(html.indexOf("Week of Nov 17") > 0);
assert.ok(html.indexOf("2 items roll out this week") > 0);
assert.ok(html.indexOf("Source sheet") > 0);
assert.ok(html.indexOf("https://docs.google.com/spreadsheets/d/15Aa01czXaohnSCbFRmeeCjwArTLbPy0BqKtEO5DppDE/edit") > 0);
assert.ok(html.indexOf("target='_blank'") > 0);
assert.strictEqual((html.match(/data-label='Task'/g) || []).length, 67);
assert.ok(html.indexOf("Matt confirmed today") < 0);
assert.ok(html.indexOf("Year-end systems check") < 0);
assert.ok(html.indexOf("Confirm whether Nov 16 already happened") < 0);
assert.ok(html.indexOf("<th>Notes</th>") < 0);
assert.ok(html.indexOf("class='type-badge relationship'") > 0);
assert.ok(html.indexOf("class='type-badge operational'") > 0);
assert.ok(html.indexOf("class='type-badge judgment'") > 0);
assert.ok(html.indexOf("Someone has to approve this before it goes out") > 0);
assert.ok(html.indexOf("class='pill overdue'") > 0);
assert.ok(html.indexOf("class='pair miss'") > 0);
assert.ok(html.indexOf(">5 overdue<") > 0);
assert.ok(html.indexOf(">2 overdue<") > 0);
assert.ok(html.indexOf("data-role-filter='person'") > 0);
assert.ok(html.indexOf("data-role-filter='type'") > 0);
assert.ok(html.indexOf("data-role-filter='milestone'") > 0);
assert.ok(html.indexOf("value='Dan'") > 0);
assert.ok(html.indexOf("value='Judgment checkpoint'") > 0);
assert.ok(html.indexOf("value='After Jan 1'") > 0);

var positions = Role.POSITIONS.map(function (item) { return item.position; });
var last = -1;
positions.forEach(function (name) {
  var at = html.indexOf(name);
  assert.ok(at > last, name);
  last = at;
});

function rowAround(source, text) {
  var from = 0;
  while (from < source.length) {
    var at = source.indexOf(text, from);
    assert.ok(at >= 0, text);
    var start = source.lastIndexOf("<tr", at);
    var end = source.indexOf("</tr>", at);
    if (start >= 0 && end > at) return source.slice(start, end);
    from = at + text.length;
  }
  assert.fail("no table row for " + text);
}
var scheduled = rowAround(html, "Walk through the VMI portal");
assert.ok(scheduled.indexOf("miss") < 0);
assert.ok(scheduled.indexOf("pill overdue") < 0);
assert.ok(scheduled.indexOf("Scheduled") > 0);
assert.ok(scheduled.indexOf("class='type-badge relationship'") > 0);

var missed = rowAround(html, "Get a first meeting on the books");
assert.ok(missed.indexOf("class='miss'") > 0);
assert.ok(missed.indexOf("class='pair miss'") > 0);
assert.ok(missed.indexOf("class='pill overdue'") > 0);
assert.ok(missed.indexOf(">Overdue<") > 0);

var futureOverdue = rowAround(html, "vendor-payments-by-PO");
assert.ok(futureOverdue.indexOf("class='miss'") > 0);
assert.ok(futureOverdue.indexOf("class='pill overdue'") > 0);

var checkpoints = Role.sectionHtml(map, { today: TODAY, type: "Judgment checkpoint" });
assert.strictEqual((checkpoints.match(/data-label='Task'/g) || []).length, 10);
assert.ok(checkpoints.indexOf("Review and approve the December blog post") > 0);
assert.ok(checkpoints.indexOf("data-label='Task'>Turn on the automated vendor-payments-by-PO") < 0);
assert.ok(checkpoints.indexOf(">5 overdue<") > 0);
assert.ok(checkpoints.indexOf("Nothing in this filter") > 0);

var danOnly = Role.sectionHtml(map, { today: TODAY, person: "Dan" });
assert.ok(danOnly.indexOf("Dan — Advisor") > 0);
assert.ok(danOnly.indexOf("Propose pay dates") > 0);
assert.ok(danOnly.indexOf("Rich — Owner") < 0);
assert.strictEqual((danOnly.match(/data-label='Task'/g) || []).length, 4);

var after = Role.sectionHtml(map, { today: TODAY, milestone: "After Jan 1" });
assert.ok(after.indexOf("Close out superseded Apex") > 0);
assert.ok(after.indexOf("data-label='Task'>Walk through the VMI portal") < 0);
assert.strictEqual((after.match(/data-label='Task'/g) || []).length, 14);

var january = Role.sectionHtml(map, { today: TODAY, milestone: "Jan 1" });
assert.ok(january.indexOf("Work open quotes and deals") > 0);
assert.ok(january.indexOf("Close out superseded Apex") < 0);
assert.strictEqual((january.match(/data-label='Task'/g) || []).length, 10);

var donePast = Role.sectionHtml({
  tasks: [{
    position: "Rich — Owner",
    task: "Already finished",
    owner: "Rich",
    bot_automation: "none",
    type: "Operational",
    due: "2026-11-01",
    rollout_week: "Current",
    milestone: "Dec 1",
    status: "Done",
    notes: "secret note xyz"
  }],
  spreadsheet_url: "javascript:alert(1)",
  rollout_weeks: ["2026-11-17"]
}, { today: TODAY });
var doneRow = rowAround(donePast, "Already finished");
assert.ok(doneRow.indexOf("class='miss'") < 0);
assert.ok(doneRow.indexOf("class='pill done'") > 0);
assert.ok(donePast.indexOf("secret note xyz") < 0);
assert.ok(donePast.indexOf("javascript:") < 0);
assert.ok(donePast.indexOf("None") > 0);

var nasty = Role.sectionHtml({
  tasks: [{
    position: "Amber — Systems and office",
    task: "<script>alert(1)</script>",
    owner: "Amber",
    bot_automation: "<img>",
    type: "Operational",
    due: "2026-11-01",
    rollout_week: "Current",
    milestone: "Dec 1",
    status: "Open",
    notes: "do not show this note"
  }],
  spreadsheet_url: map.spreadsheet_url,
  rollout_weeks: map.rollout_weeks
}, { today: TODAY });
assert.ok(nasty.indexOf("<script>") < 0);
assert.ok(nasty.indexOf("&lt;script&gt;") > 0);
assert.ok(nasty.indexOf("&lt;img&gt;") > 0);
assert.ok(nasty.indexOf("do not show this note") < 0);
assert.ok(nasty.indexOf("class='miss'") > 0);
assert.ok(nasty.indexOf("class='pill overdue'") > 0);

var sheetMarked = Role.sectionHtml({
  tasks: [{
    position: "Dan — Advisor",
    task: "Still marked overdue",
    owner: "Dan",
    bot_automation: "driven-fin",
    type: "Judgment checkpoint",
    due: "2026-12-01",
    rollout_week: "2026-11-30",
    milestone: "Dec 1",
    status: "Overdue"
  }],
  rollout_weeks: ["2026-11-30"]
}, { today: TODAY });
var marked = rowAround(sheetMarked, "Still marked overdue");
assert.ok(marked.indexOf("class='miss'") > 0);
assert.ok(marked.indexOf("class='type-badge judgment'") > 0);
assert.ok(marked.indexOf("class='pill overdue'") > 0);

var later = Role.sectionHtml(map, { today: "2027-01-04" });
assert.ok(later.indexOf("past its last dated week") > 0);
assert.strictEqual((later.match(/<li/g) || []).length, 0);

var missing = Role.sectionHtml(null, { note: "The role map did not load. <script>" });
assert.ok(missing.indexOf("The role map did not load. &lt;script&gt;") > 0);
assert.ok(missing.indexOf("howToReadThis") < 0);

var topics = Role.trainingTopics();
assert.strictEqual(topics.length, 1);
assert.strictEqual(topics[0].title, "Tasks by role");
assert.strictEqual(topics[0].href, "huddle.html#tasksByRole");
assert.ok(topics[0].body.indexOf("Two items roll out each week") > 0);
assert.ok(topics[0].body.indexOf("Red means the date was missed") > 0);
assert.ok(topics[0].body.indexOf("Judgment checkpoint") > 0);

var source = fs.readFileSync(path.join(__dirname, "huddle-role-map.js"), "utf8");
assert.ok(source.indexOf("driven_tasks") < 0);
assert.ok(source.indexOf("task.notes") < 0);
assert.ok(source.indexOf(".notes") < 0);

console.log("huddle-role-map tests passed");
