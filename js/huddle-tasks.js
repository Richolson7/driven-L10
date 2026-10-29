/* Morning huddle task counts. Dates are America/Chicago calendar days, YYYY-MM-DD.
   This file does not talk to the database and does not change tasks. */
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

  function countCell(label, value, tone) {
    var cls = tone ? " class='" + tone + "'" : "";
    return "<span" + cls + "><b>" + value + "</b><small>" + esc(label) + "</small></span>";
  }

  function sectionHtml(summary, note) {
    var html = "<section class='tasks' id='taskAccountability' aria-label='Team tasks'>";
    html += "<h2>Tasks</h2>";
    html += "<p class='fine'>Call these out before the close. Next 7 days is after today, through seven days out. A shared task counts for every person named.</p>";
    if (note) html += "<p class='fine'>" + esc(note) + "</p>";
    if (!summary) {
      html += "</section>";
      return html;
    }
    html += "<div class='task-grid'>";
    summary.forEach(function (person) {
      var counts = person.counts;
      html += "<article class='task-card'><h3>" + esc(person.name) + "</h3><div class='task-counts'>";
      html += countCell("Open", counts.open, "");
      html += countCell("Overdue", counts.overdue, counts.overdue ? "bad" : "");
      html += countCell("Due today", counts.dueToday, counts.dueToday ? "today" : "");
      html += countCell("Next 7 days", counts.comingDue, "");
      html += countCell("Done", counts.done, "");
      html += "</div>";
      if (!person.callouts.length) {
        html += "<p class='fine'>Nothing overdue or due today.</p>";
      } else {
        html += "<ul class='task-list'>";
        person.callouts.forEach(function (item) {
          var overdue = item.kind === "overdue";
          html += "<li><span class='flag " + (overdue ? "overdue" : "today") + "'>" + (overdue ? "Overdue" : "Due today") + "</span>";
          html += esc(item.text || "(no text)") + " <span class='when'>" + esc(prettyDue(item.due)) + "</span></li>";
        });
        html += "</ul>";
      }
      html += "</article>";
    });
    html += "</div></section>";
    return html;
  }

  return {
    PEOPLE: PEOPLE,
    addDays: addDays,
    splitOwners: splitOwners,
    peopleInOwner: peopleInOwner,
    summarize: summarize,
    sectionHtml: sectionHtml
  };
});
