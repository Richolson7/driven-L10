/* Morning huddle tasks. Dates are America/Chicago calendar days, YYYY-MM-DD.
   This file builds the task table. It does not talk to the database.
   Adding a task and marking one done happen in huddle.js, on driven_tasks. */
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
    if (due && today && due < today) return "Overdue";
    return "Open";
  }
  function compareRows(a, b) {
    if (a.due && b.due && a.due !== b.due) return a.due < b.due ? -1 : 1;
    if (a.due && !b.due) return -1;
    if (!a.due && b.due) return 1;
    var at = a.text.toLowerCase();
    var bt = b.text.toLowerCase();
    if (at < bt) return -1;
    if (at > bt) return 1;
    var ai = a.id == null || a.id === "" || isNaN(+a.id) ? 0 : +a.id;
    var bi = b.id == null || b.id === "" || isNaN(+b.id) ? 0 : +b.id;
    return ai - bi;
  }
  function list(tasks, today) {
    var rank = { Overdue: 0, Open: 1, Done: 2 };
    var out = [];
    (tasks || []).forEach(function (task) {
      if (!task) return;
      var due = dueYmd(task);
      var done = isDone(task);
      out.push({
        id: task.id,
        text: task.text == null ? "" : String(task.text),
        owner: task.owner == null ? "" : String(task.owner),
        due: due,
        done: done,
        status: statusOf(task, today)
      });
    });
    out.sort(function (a, b) {
      if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
      return compareRows(a, b);
    });
    return out;
  }

  function statusControl(row) {
    var cls = row.status === "Done" ? "done" : (row.status === "Overdue" ? "overdue" : "open");
    if (row.id == null || row.id === "") return "<span class='pill " + cls + "'>" + esc(row.status) + "</span>";
    var verb = row.done ? "Reopen" : "Mark done";
    return "<button type='button' class='pill " + cls + "' data-task-id='" + esc(row.id) + "' data-done='" + (row.done ? "1" : "0") + "' aria-label='" + esc(verb) + "'>" + esc(row.status) + "</button>";
  }
  function formHtml() {
    var opts = PEOPLE.map(function (name) {
      return "<option value='" + esc(name) + "'></option>";
    }).join("");
    return "<form id='taskForm' class='task-add'>" +
      "<input id='taskText' name='text' type='text' required placeholder='Task' autocomplete='off'>" +
      "<input id='taskOwner' name='owner' type='text' list='taskOwners' placeholder='Owner' required autocomplete='off'>" +
      "<datalist id='taskOwners'>" + opts + "</datalist>" +
      "<input id='taskDue' name='due' type='date' aria-label='Due date'>" +
      "<button type='submit'>Add task</button></form>";
  }
  function howToHtml() {
    return "<p class='howto' id='howThisWorks'><b>How this works.</b> This is the weekday sales huddle: one win, the sales scoreboard, then today's work. Add a task with Add task; it is the same list as the L10 hub. Click the Status pill to mark a task done or reopen it. Loads and sales numbers are a 10:00 AM CT snapshot; Refresh reloads that snapshot.</p>";
  }

  function sectionHtml(rows, note) {
    var html = "<section class='tasks' id='taskAccountability' aria-label='Tasks'>";
    html += "<h2>Tasks</h2>";
    html += howToHtml();
    html += "<p class='fine'>The first three open rows are the meeting's Top 3. A shared task is one row. This is the same to-do list as the L10 hub.</p>";
    if (note) html += "<p class='fine'>" + esc(note) + "</p>";
    if (!rows) {
      html += formHtml();
      html += "</section>";
      return html;
    }
    html += "<div class='scroll'><table class='task-table'><thead><tr><th>Task</th><th>Owner</th><th>Due</th><th>Status</th></tr></thead><tbody>";
    if (!rows.length) {
      html += "<tr><td colspan='4'>No tasks yet.</td></tr>";
    } else {
      var topped = 0;
      rows.forEach(function (row) {
        var mark = "";
        if (row.status !== "Done" && topped < 3) { mark = " class='top'"; topped += 1; }
        var due = row.due ? prettyDue(row.due) : "—";
        html += "<tr" + mark + "><td data-label='Task'>" + esc(row.text || "(no text)") + "</td><td data-label='Owner'>" + esc(row.owner) + "</td><td data-label='Due'>" + esc(due) + "</td><td data-label='Status'>" + statusControl(row) + "</td></tr>";
      });
    }
    html += "</tbody></table></div>";
    html += formHtml();
    html += "</section>";
    return html;
  }

  return {
    PEOPLE: PEOPLE,
    addDays: addDays,
    splitOwners: splitOwners,
    peopleInOwner: peopleInOwner,
    summarize: summarize,
    list: list,
    formHtml: formHtml,
    sectionHtml: sectionHtml
  };
});
