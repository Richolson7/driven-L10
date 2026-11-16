/* Morning huddle task counts and the signed-in check-off list.
   Dates are America/Chicago calendar days, YYYY-MM-DD.
   This file does not talk to the database. */
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
  function taskId(task) {
    if (!task || task.id == null || task.id === "") return "";
    var text = String(task.id).trim();
    return /^[0-9]+$/.test(text) ? text : "";
  }
  function rosterName(name, people) {
    var roster = people || PEOPLE;
    var raw = String(name == null ? "" : name).trim();
    if (!raw) return "";
    var exact = "";
    roster.forEach(function (person) {
      if (person.toLowerCase() === raw.toLowerCase()) exact = person;
    });
    if (exact) return exact;
    var matched = peopleInOwner(raw, roster);
    return matched.length === 1 ? matched[0] : "";
  }
  function newTaskRow(ownerName, text, due) {
    var owner = rosterName(ownerName);
    var body = String(text == null ? "" : text).trim();
    var dueText = String(due == null ? "" : due).trim();
    if (!owner) return { error: "owner" };
    if (!body) return { error: "text" };
    if (dueText && !/^\d{4}-\d{2}-\d{2}$/.test(dueText)) return { error: "due" };
    return {
      row: {
        text: body,
        owner: owner,
        category: "General",
        priority: "Medium",
        due: dueText || null,
        done: false,
        attachments: []
      }
    };
  }
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
      byName[name] = { name: name, counts: emptyCounts(), callouts: [], open: [] };
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
        var kind = "";
        if (due && due < today) kind = "overdue";
        else if (due === today) kind = "today";
        else if (due) kind = "later";
        row.open.push({ id: taskId(task), text: text, due: due, kind: kind });
        if (kind === "overdue") {
          row.counts.overdue += 1;
          row.callouts.push({ id: taskId(task), text: text, due: due, kind: "overdue" });
        } else if (kind === "today") {
          row.counts.dueToday += 1;
          row.callouts.push({ id: taskId(task), text: text, due: due, kind: "today" });
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
      row.open.sort(function (a, b) {
        function rank(item) {
          if (item.kind === "overdue") return 0;
          if (item.kind === "today") return 1;
          if (item.due) return 2;
          return 3;
        }
        var diff = rank(a) - rank(b);
        if (diff) return diff;
        if (a.due && b.due && a.due !== b.due) return a.due < b.due ? -1 : 1;
        return 0;
      });
      return row;
    });
  }

  function countCell(label, value, tone) {
    var cls = tone ? " class='" + tone + "'" : "";
    return "<span" + cls + "><b>" + value + "</b><small>" + esc(label) + "</small></span>";
  }

  function calloutInner(item) {
    var overdue = item.kind === "overdue";
    var html = "<span class='flag " + (overdue ? "overdue" : "today") + "'>" + (overdue ? "Overdue" : "Due today") + "</span>";
    html += esc(item.text || "(no text)") + " <span class='when'>" + esc(prettyDue(item.due)) + "</span>";
    return html;
  }
  function checkboxHtml(id) {
    if (!/^[0-9]+$/.test(String(id == null ? "" : id))) return "";
    return "<input type='checkbox' data-task-id='" + esc(id) + "'>";
  }
  function listItem(inner, id, withCheckbox) {
    var box = withCheckbox ? checkboxHtml(id) : "";
    if (!box) return "<li>" + inner + "</li>";
    return "<li><label>" + box + "<span class='task-body'>" + inner + "</span></label></li>";
  }
  function addFormHtml(ownerName) {
    var who = ownerName ? esc(ownerName) : "";
    var label = who ? "Add a task for " + who : "Add a task";
    var html = "<form class='task-add' id='huddleTaskForm'>";
    html += "<label>" + label + "<input name='text' type='text' required placeholder='What needs doing' autocomplete='off'></label>";
    html += "<label>Due (optional)<input name='due' type='date'></label>";
    html += "<button type='submit' class='primary'>Add task</button></form>";
    return html;
  }
  function otherOpen(person) {
    return (person.open || []).filter(function (item) {
      return item.kind !== "overdue" && item.kind !== "today";
    });
  }

  function sectionHtml(summary, note, options) {
    var interactive = !!(options && options.interactive);
    var ownerName = options && options.owner ? String(options.owner) : "";
    var html = "<section class='tasks' id='taskAccountability' aria-label='What we need to do'>";
    html += "<h2>What we need to do</h2>";
    html += "<p class='fine'>Call these out before the close. Next 7 days is after today, through seven days out. A shared task counts for every person named.</p>";
    if (note) html += "<p class='fine'>" + esc(note) + "</p>";
    if (interactive) {
      html += "<p class='fine'>Check a task to mark it done. A new task is added for the person who is signed in.</p>";
      html += addFormHtml(ownerName);
    }
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
          html += listItem(calloutInner(item), item.id, interactive);
        });
        html += "</ul>";
      }
      if (interactive) {
        var rest = otherOpen(person);
        if (rest.length) {
          html += "<p class='fine'>Other open</p><ul class='task-list'>";
          rest.forEach(function (item) {
            var body = esc(item.text || "(no text)");
            if (item.due) body += " <span class='when'>" + esc(prettyDue(item.due)) + "</span>";
            html += listItem(body, item.id, true);
          });
          html += "</ul>";
        }
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
    rosterName: rosterName,
    newTaskRow: newTaskRow,
    summarize: summarize,
    sectionHtml: sectionHtml
  };
});
