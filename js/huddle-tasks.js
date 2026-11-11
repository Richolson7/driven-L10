/* Morning huddle tasks. Dates are America/Chicago calendar days, YYYY-MM-DD.
   This file does not talk to the database and does not change tasks.
   The page renders the table. Adding a task happens in huddle.js. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.HuddleTasks = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var PEOPLE = ["Patrick", "Annie", "Rich", "Landon", "Amber"];

  function pad(n) { return String(n).padStart(2, "0"); }
  function addDays(ymd, n) {
    var date = new Date(ymd + "T00:00:00Z");
    date.setUTCDate(date.getUTCDate() + n);
    return date.getUTCFullYear() + "-" + pad(date.getUTCMonth() + 1) + "-" + pad(date.getUTCDate());
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function dueYmd(task) {
    if (!task || task.due == null || task.due === "") return "";
    var text = String(task.due).trim();
    var match = text.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : "";
  }
  function isDone(task) { return !!(task && task.done); }
  function splitOwners(owner) {
    return String(owner == null ? "" : owner)
      .split(/\s*(?:,|\+|\/|&|;|\band\b)\s*/i)
      .map(function (part) { return part.trim(); })
      .filter(Boolean);
  }
  function peopleInOwner(owner, people) {
    var roster = people || PEOPLE;
    var words = [];
    splitOwners(owner).forEach(function (token) {
      token.toLowerCase().split(/[^a-z0-9]+/).forEach(function (word) {
        if (word && words.indexOf(word) < 0) words.push(word);
      });
    });
    return roster.filter(function (person) {
      return words.indexOf(person.toLowerCase()) >= 0;
    });
  }
  function emptyCounts() {
    return { open: 0, overdue: 0, dueToday: 0, comingDue: 0, done: 0 };
  }
  function prettyDue(ymd) {
    var date = new Date(ymd + "T00:00:00Z");
    return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  }

  function summarize(tasks, today, people) {
    var roster = people || PEOPLE;
    var horizon = addDays(today, 7);
    var byName = {};
    roster.forEach(function (name) {
      byName[name] = { name: name, counts: emptyCounts(), callouts: [] };
    });
    (tasks || []).forEach(function (task) {
      if (!task) return;
      var owners = peopleInOwner(task.owner, roster);
      if (!owners.length) return;
      var due = dueYmd(task);
      var done = isDone(task);
      var text = task.text == null ? "" : String(task.text);
      owners.forEach(function (name) {
        var row = byName[name];
        if (done) {
          row.counts.done += 1;
          return;
        }
        row.counts.open += 1;
        if (due && due < today) {
          row.counts.overdue += 1;
          row.callouts.push({ text: text, due: due, kind: "overdue" });
        } else if (due === today) {
          row.counts.dueToday += 1;
          row.callouts.push({ text: text, due: due, kind: "today" });
        } else if (due && due > today && due <= horizon) {
          row.counts.comingDue += 1;
        }
      });
    });
    return roster.map(function (name) {
      var row = byName[name];
      row.callouts.sort(function (a, b) {
        if (a.kind !== b.kind) return a.kind === "overdue" ? -1 : 1;
        if (a.due < b.due) return -1;
        if (a.due > b.due) return 1;
        return 0;
      });
      return row;
    });
  }

  function statusOf(task, today) {
    if (isDone(task)) return "Done";
    var due = dueYmd(task);
    if (due && due < today) return "Overdue";
    return "Open";
  }
  function list(tasks, today, people) {
    var roster = people || PEOPLE;
    var rank = { Overdue: 0, Open: 1, Done: 2 };
    var out = [];
    (tasks || []).forEach(function (task) {
      if (!task) return;
      if (!peopleInOwner(task.owner, roster).length) return;
      var due = dueYmd(task);
      out.push({
        id: task.id,
        text: task.text == null ? "" : String(task.text),
        owner: task.owner == null ? "" : String(task.owner),
        due: due,
        status: statusOf(task, today)
      });
    });
    out.sort(function (a, b) {
      if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
      if (a.due && b.due && a.due !== b.due) return a.due < b.due ? -1 : 1;
      if (a.due && !b.due) return -1;
      if (!a.due && b.due) return 1;
      return 0;
    });
    return out;
  }

  function sectionHtml(rows, note) {
    var html = "<section class='tasks' id='taskAccountability' aria-label='Team tasks'>";
    html += "<h2>Tasks</h2>";
    html += "<p class='fine'>Top 3 tasks are the first three open rows. A shared task is one row. Overdue means open and due before today.</p>";
    if (note) html += "<p class='fine'>" + esc(note) + "</p>";
    if (!rows) {
      html += "</section>";
      return html;
    }
    html += "<div class='scroll'><table class='task-table'><thead><tr><th>Task</th><th>Owner</th><th>Due</th><th>Status</th></tr></thead><tbody>";
    if (!rows.length) {
      html += "<tr><td colspan='4'>No team tasks.</td></tr>";
    } else {
      var topped = 0;
      rows.forEach(function (row) {
        var mark = "";
        if (row.status !== "Done" && topped < 3) { mark = " class='top'"; topped += 1; }
        var due = row.due ? prettyDue(row.due) : "—";
        var cls = row.status === "Done" ? "done" : (row.status === "Overdue" ? "overdue" : "open");
        html += "<tr" + mark + "><td>" + esc(row.text || "(no text)") + "</td><td>" + esc(row.owner) + "</td><td>" + esc(due) + "</td>";
        html += "<td><span class='pill " + cls + "'>" + esc(row.status) + "</span></td></tr>";
      });
    }
    html += "</tbody></table></div></section>";
    return html;
  }

  return {
    PEOPLE: PEOPLE,
    addDays: addDays,
    splitOwners: splitOwners,
    peopleInOwner: peopleInOwner,
    summarize: summarize,
    list: list,
    sectionHtml: sectionHtml
  };
});
