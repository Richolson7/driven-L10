/* IDS → to-do drafts for the Level 10 meeting.
   Pure helpers only. The page inserts the row into driven_tasks. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.L10Ids = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function taskTextFromIssue(issue) {
    var title = String(issue && issue.text || "").trim();
    var notes = String(issue && issue.notes || "").trim();
    if (!title && !notes) return "";
    if (!notes || notes === title) return title;
    if (!title) return notes;
    return title + "\n\n" + notes;
  }

  function dueInDays(fromDate, days) {
    var dt = new Date(fromDate.getTime());
    dt.setDate(dt.getDate() + days);
    var month = String(dt.getMonth() + 1).padStart(2, "0");
    var day = String(dt.getDate()).padStart(2, "0");
    return dt.getFullYear() + "-" + month + "-" + day;
  }

  function ownerField(participants, issueOwner) {
    var options = [];
    var seen = {};
    (participants || []).forEach(function (name) {
      var value = String(name == null ? "" : name).trim();
      if (!value) return;
      var key = value.toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      options.push(value);
    });
    var owner = String(issueOwner == null ? "" : issueOwner).trim();
    var selected = "";
    if (owner) {
      var match = "";
      options.forEach(function (name) {
        if (name.toLowerCase() === owner.toLowerCase()) match = name;
      });
      if (match) selected = match;
      else {
        options.unshift(owner);
        selected = owner;
      }
    }
    return { options: options, selected: selected };
  }

  function taskDraftFromIssue(issue, participants, today) {
    var owners = ownerField(participants, issue && issue.owner);
    return {
      text: taskTextFromIssue(issue || {}),
      owner: owners.selected,
      owners: owners.options,
      due: dueInDays(today || new Date(), 7),
      category: "General",
      priority: "Medium"
    };
  }

  function taskRowFromDraft(draft) {
    var text = String(draft && draft.text || "").trim();
    if (!text) return { error: "text" };
    var due = String(draft && draft.due || "").trim();
    if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) return { error: "due" };
    return {
      row: {
        text: text,
        owner: String(draft.owner || "").trim(),
        category: "General",
        priority: "Medium",
        due: due || null,
        done: false,
        attachments: []
      }
    };
  }

  return {
    taskTextFromIssue: taskTextFromIssue,
    dueInDays: dueInDays,
    ownerField: ownerField,
    taskDraftFromIssue: taskDraftFromIssue,
    taskRowFromDraft: taskRowFromDraft
  };
});
