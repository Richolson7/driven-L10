var assert = require("assert");
var Ids = require("./l10-ids.js");

assert.strictEqual(Ids.taskTextFromIssue({ text: "Vendor is late", notes: "" }), "Vendor is late");
assert.strictEqual(Ids.taskTextFromIssue({ text: "Vendor is late", notes: "Vendor is late" }), "Vendor is late");
assert.strictEqual(
  Ids.taskTextFromIssue({ text: "Vendor is late", notes: "Call and confirm the ship date" }),
  "Vendor is late\n\nCall and confirm the ship date"
);
assert.strictEqual(Ids.taskTextFromIssue({ text: "", notes: "Confirm the ship date" }), "Confirm the ship date");
assert.strictEqual(Ids.taskTextFromIssue({ text: "  ", notes: "  " }), "");
assert.strictEqual(Ids.taskTextFromIssue(null), "");

assert.strictEqual(Ids.dueInDays(new Date(2026, 10, 16), 7), "2026-11-23");
assert.strictEqual(Ids.dueInDays(new Date(2026, 11, 28), 7), "2027-01-04");
assert.strictEqual(Ids.dueInDays(new Date(2024, 1, 26), 7), "2024-03-04");

var matched = Ids.ownerField(["President", "Ops Manager", "Sales Lead"], "ops manager");
assert.deepStrictEqual(matched.options, ["President", "Ops Manager", "Sales Lead"]);
assert.strictEqual(matched.selected, "Ops Manager");

var custom = Ids.ownerField(["President", "Ops Manager"], "Brady");
assert.deepStrictEqual(custom.options, ["Brady", "President", "Ops Manager"]);
assert.strictEqual(custom.selected, "Brady");

var blank = Ids.ownerField(["President", "Ops Manager"], "");
assert.strictEqual(blank.selected, "");
assert.deepStrictEqual(blank.options, ["President", "Ops Manager"]);

var dupes = Ids.ownerField(["Rich", " rich ", ""], "RICH");
assert.deepStrictEqual(dupes.options, ["Rich"]);
assert.strictEqual(dupes.selected, "Rich");

var draft = Ids.taskDraftFromIssue(
  { text: "Late rigid order", owner: "Sales Lead", notes: "Email the customer today" },
  ["President", "Sales Lead"],
  new Date(2026, 10, 16)
);
assert.strictEqual(draft.text, "Late rigid order\n\nEmail the customer today");
assert.strictEqual(draft.owner, "Sales Lead");
assert.strictEqual(draft.due, "2026-11-23");
assert.strictEqual(draft.category, "General");
assert.strictEqual(draft.priority, "Medium");

var row = Ids.taskRowFromDraft({ text: " Call them ", owner: "Ops Manager", due: "2026-11-23" });
assert.deepStrictEqual(row.row, {
  text: "Call them",
  owner: "Ops Manager",
  category: "General",
  priority: "Medium",
  due: "2026-11-23",
  done: false,
  attachments: []
});
assert.deepStrictEqual(Ids.taskRowFromDraft({ text: "No date", owner: "", due: "" }).row.due, null);
assert.strictEqual(Ids.taskRowFromDraft({ text: "   ", owner: "Rich", due: "2026-11-23" }).error, "text");
assert.strictEqual(Ids.taskRowFromDraft({ text: "Bad date", owner: "Rich", due: "next week" }).error, "due");

console.log("l10-ids.test.js ok");
