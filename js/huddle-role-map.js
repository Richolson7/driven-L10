/* Tasks by role for the morning huddle.
   Reads data/task_role_map.json. Does not read or write the huddle to-do list.
   Dates are America/Chicago calendar days, YYYY-MM-DD.
   Notes on each row stay in the file and are not shown. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.HuddleRoleMap = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var POSITIONS = [
    { person: "Rich", position: "Rich — Owner" },
    { person: "Amber", position: "Amber — Systems and office" },
    { person: "Dan", position: "Dan — Advisor" },
    { person: "Annie", position: "Annie — Customer service" },
    { person: "Patrick", position: "Patrick — In-house delivery" },
    { person: "Landon", position: "Landon — Sales" }
  ];
  var TYPES = ["Relationship", "Operational", "Judgment checkpoint"];
  /* After Jan 1 is stored as rollout_week on rows whose sheet milestone is Jan 1.
     The filter treats that as its own milestone so the three choices do not overlap. */
  var MILESTONES = ["Dec 1", "Jan 1", "After Jan 1"];

  function pad(n) { return String(n).padStart(2, "0"); }
  function addDays(ymd, n) {
    var date = new Date(ymd + "T00:00:00Z");
    date.setUTCDate(date.getUTCDate() + n);
    return date.getUTCFullYear() + "-" + pad(date.getUTCMonth() + 1) + "-" + pad(date.getUTCDate());
  }
  function chicagoToday(now) {
    var parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now || new Date());
    var get = function (type) { return parts.find(function (p) { return p.type === type; }).value; };
    return get("year") + "-" + get("month") + "-" + get("day");
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function dueYmd(value) {
    if (value == null || value === "") return "";
    var match = String(value).trim().match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : "";
  }
  function prettyDue(ymd) {
    var date = new Date(ymd + "T00:00:00Z");
    return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  }
  function prettyMonthDay(ymd) {
    var date = new Date(ymd + "T00:00:00Z");
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  }
  function prettyWeek(value) {
    var text = String(value == null ? "" : value).trim();
    if (!text) return "—";
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return "Week of " + prettyMonthDay(text);
    return text;
  }
  function isDoneStatus(status) {
    return String(status || "").trim().toLowerCase() === "done";
  }
  function isOverdue(task, today) {
    if (!task || isDoneStatus(task.status)) return false;
    if (String(task.status || "").trim().toLowerCase() === "overdue") return true;
    var due = dueYmd(task.due);
    return !!(due && today && due < today);
  }
  function statusLabel(task, today) {
    if (isOverdue(task, today)) return "Overdue";
    var status = String(task && task.status || "").trim();
    return status || "Open";
  }
  function statusClass(task, today) {
    if (isOverdue(task, today)) return "overdue";
    if (task && isDoneStatus(task.status)) return "done";
    return "open";
  }
  function typeClass(type) {
    if (type === "Judgment checkpoint") return "judgment";
    if (type === "Relationship") return "relationship";
    if (type === "Operational") return "operational";
    return "other";
  }
  function botText(value) {
    var text = String(value == null ? "" : value).trim();
    if (!text || text.toLowerCase() === "none") return "None";
    return text;
  }
  function milestoneOf(task) {
    if (!task) return "";
    var week = String(task.rollout_week || "").trim();
    var milestone = String(task.milestone || "").trim();
    if (week === "After Jan 1" || milestone === "After Jan 1") return "After Jan 1";
    return milestone;
  }
  function datedWeeks(map) {
    var list = (map && map.rollout_weeks) || [];
    return list.filter(function (week) {
      return /^\d{4}-\d{2}-\d{2}$/.test(String(week));
    }).slice().sort();
  }
  function currentRolloutWeek(map, today) {
    var weeks = datedWeeks(map);
    if (!weeks.length || !today) return "";
    if (today < weeks[0]) return weeks[0];
    var current = weeks[0];
    weeks.forEach(function (week) {
      if (week <= today) current = week;
    });
    var last = weeks[weeks.length - 1];
    if (today >= addDays(last, 7)) return "";
    return current;
  }
  function weekItems(map, today) {
    var week = currentRolloutWeek(map, today);
    if (!week) return { week: "", items: [] };
    var items = ((map && map.tasks) || []).filter(function (task) {
      return task && String(task.rollout_week) === week;
    });
    return { week: week, items: items };
  }
  function filtersOf(options) {
    options = options || {};
    return {
      person: options.person ? String(options.person) : "",
      type: options.type ? String(options.type) : "",
      milestone: options.milestone ? String(options.milestone) : ""
    };
  }
  function matches(task, filters) {
    if (filters.person && String(task.owner || "") !== filters.person) return false;
    if (filters.type && String(task.type || "") !== filters.type) return false;
    if (filters.milestone && milestoneOf(task) !== filters.milestone) return false;
    return true;
  }
  function sortTasks(tasks, today) {
    return tasks.slice().sort(function (a, b) {
      var ao = isOverdue(a, today) ? 0 : 1;
      var bo = isOverdue(b, today) ? 0 : 1;
      if (ao !== bo) return ao - bo;
      var ad = dueYmd(a.due);
      var bd = dueYmd(b.due);
      if (ad && bd && ad !== bd) return ad < bd ? -1 : 1;
      if (ad && !bd) return -1;
      if (!ad && bd) return 1;
      var at = String(a.task || "").toLowerCase();
      var bt = String(b.task || "").toLowerCase();
      if (at < bt) return -1;
      if (at > bt) return 1;
      return 0;
    });
  }
  function groups(map, today, options) {
    var filters = filtersOf(options);
    var byPosition = {};
    ((map && map.tasks) || []).forEach(function (task) {
      if (!task) return;
      var key = String(task.position || task.owner || "Other");
      if (!byPosition[key]) byPosition[key] = { position: key, person: String(task.owner || ""), all: [], rows: [] };
      byPosition[key].all.push(task);
      if (matches(task, filters)) byPosition[key].rows.push(task);
    });
    var order = POSITIONS.map(function (item) { return item.position; });
    return Object.keys(byPosition).sort(function (a, b) {
      var ai = order.indexOf(a);
      var bi = order.indexOf(b);
      if (ai < 0) ai = 100;
      if (bi < 0) bi = 100;
      if (ai !== bi) return ai - bi;
      return a < b ? -1 : a > b ? 1 : 0;
    }).map(function (key) {
      var group = byPosition[key];
      group.rows = sortTasks(group.rows, today);
      group.overdue = group.all.filter(function (task) { return isOverdue(task, today); }).length;
      return group;
    }).filter(function (group) {
      if (filters.person && group.person !== filters.person) return false;
      if (group.rows.length) return true;
      return group.overdue > 0 && !!(filters.type || filters.milestone);
    });
  }
  function sheetUrl(map) {
    var url = map && map.spreadsheet_url ? String(map.spreadsheet_url).trim() : "";
    if (!/^https:\/\/docs\.google\.com\/spreadsheets\//.test(url)) return "";
    return url;
  }
  function helpHtml() {
    return "<p class='howto' id='howToReadThis'><b>How to read this.</b> Relationship is work with a person. Operational is a system or a routine. Judgment checkpoint is marked in gold: someone has to approve it before it goes out. Two items roll out each week, and This week shows those two. Red means the date was missed, or the sheet already marks the item overdue. The number next to a name is how many of that person's items are overdue.</p>";
  }
  function trainingTopics() {
    return [{
      title: "Tasks by role",
      href: "huddle.html#tasksByRole",
      link: "Open the morning huddle",
      body: "On the morning huddle, sales comes first, then today's to-dos, then Tasks by role. Relationship is work with a person. Operational is a system or a routine. A gold Judgment checkpoint has to be approved before it goes out. Two items roll out each week. Red means the date was missed, or the sheet already marks the item overdue."
    }];
  }
  function typeBadge(type) {
    var label = String(type || "");
    var title = label === "Judgment checkpoint" ? " title='Someone has to approve this before it goes out'" : "";
    return "<span class='type-badge " + typeClass(label) + "'" + title + ">" + esc(label) + "</span>";
  }
  function countHtml(n) {
    if (!n) return "<span class='overdue-count'>0 overdue</span>";
    return "<span class='pill overdue'>" + n + " overdue</span>";
  }
  function selectHtml(name, label, current, values) {
    var html = "<label>" + esc(label) + "<select data-role-filter='" + esc(name) + "'>";
    html += "<option value=''" + (current ? "" : " selected") + ">All</option>";
    values.forEach(function (value) {
      html += "<option value='" + esc(value) + "'" + (current === value ? " selected" : "") + ">" + esc(value) + "</option>";
    });
    html += "</select></label>";
    return html;
  }
  function peopleOptions(map) {
    var names = POSITIONS.map(function (item) { return item.person; });
    ((map && map.tasks) || []).forEach(function (task) {
      var name = String(task && task.owner || "");
      if (name && names.indexOf(name) < 0) names.push(name);
    });
    return names;
  }
  function rowHtml(task, today) {
    var overdue = isOverdue(task, today);
    var due = dueYmd(task.due);
    var dueText = due ? esc(prettyDue(due)) : "—";
    var dueCell = overdue
      ? "<td data-label='Due' class='pair miss'><b>" + dueText + "</b></td>"
      : "<td data-label='Due'>" + dueText + "</td>";
    var pill = "<span class='pill " + statusClass(task, today) + "'>" + esc(statusLabel(task, today)) + "</span>";
    return "<tr" + (overdue ? " class='miss'" : "") + ">" +
      "<td data-label='Task'>" + esc(task.task || "(no text)") + "</td>" +
      "<td data-label='Owner'>" + esc(task.owner || "") + "</td>" +
      "<td data-label='Bot / automation'>" + esc(botText(task.bot_automation)) + "</td>" +
      "<td data-label='Type'>" + typeBadge(task.type) + "</td>" +
      dueCell +
      "<td data-label='Rollout week'>" + esc(prettyWeek(task.rollout_week)) + "</td>" +
      "<td data-label='Status'>" + pill + "</td></tr>";
  }
  function weekStrip(map, today) {
    var pack = weekItems(map, today);
    var html = "<div class='week-strip' aria-label='This week'><h3>This week</h3>";
    if (!pack.week) {
      html += "<p class='fine'>The two-per-week rollout is past its last dated week. What is left is under After Jan 1.</p></div>";
      return html;
    }
    var count = pack.items.length;
    var noun = count === 1 ? "item rolls" : "items roll";
    html += "<p class='fine'>Week of " + esc(prettyMonthDay(pack.week)) + ". " + count + " " + noun + " out this week.</p>";
    if (!count) {
      html += "</div>";
      return html;
    }
    html += "<ul>";
    pack.items.forEach(function (task) {
      var overdue = isOverdue(task, today);
      html += "<li" + (overdue ? " class='miss'" : "") + ">" + typeBadge(task.type);
      html += "<b>" + esc(task.owner || "") + "</b><span>" + esc(task.task || "") + "</span>";
      html += "<span class='pill " + statusClass(task, today) + "'>" + esc(statusLabel(task, today)) + "</span></li>";
    });
    html += "</ul></div>";
    return html;
  }
  function sectionHtml(map, options) {
    options = options || {};
    var today = options.today || chicagoToday(new Date());
    if (!map || !Array.isArray(map.tasks)) {
      var why = options.note || "The role map did not load.";
      return "<section class='role-map' id='tasksByRole' aria-label='Tasks by role'><h2>Tasks by role</h2><p class='fine'>" + esc(why) + "</p></section>";
    }
    var filters = filtersOf(options);
    var html = "<section class='role-map' id='tasksByRole' aria-label='Tasks by role'>";
    html += "<div class='role-head'><h2>Tasks by role</h2>";
    var url = sheetUrl(map);
    if (url) html += "<a href='" + esc(url) + "' target='_blank' rel='noopener noreferrer'>Source sheet</a>";
    html += "</div>";
    html += helpHtml();
    html += weekStrip(map, today);
    html += "<div class='role-filters'>";
    html += selectHtml("person", "Person", filters.person, peopleOptions(map));
    html += selectHtml("type", "Type", filters.type, TYPES);
    html += selectHtml("milestone", "Milestone", filters.milestone, MILESTONES);
    html += "</div>";
    var list = groups(map, today, filters);
    var shown = 0;
    list.forEach(function (group) {
      html += "<h3 class='role-person'>" + esc(group.position) + " " + countHtml(group.overdue) + "</h3>";
      if (!group.rows.length) {
        html += "<p class='fine'>Nothing in this filter. The overdue count is this person's full list.</p>";
        return;
      }
      shown += group.rows.length;
      html += "<div class='scroll'><table class='task-table role-table'><thead><tr>";
      html += "<th>Task</th><th>Owner</th><th>Bot / automation</th><th>Type</th><th>Due</th><th>Rollout week</th><th>Status</th>";
      html += "</tr></thead><tbody>";
      group.rows.forEach(function (task) { html += rowHtml(task, today); });
      html += "</tbody></table></div>";
    });
    if (!shown) html += "<p class='fine'>Nothing matches these filters.</p>";
    html += "</section>";
    return html;
  }
  function load(url) {
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error("The role map did not load.");
      return res.json();
    }).then(function (data) {
      if (!data || !Array.isArray(data.tasks)) throw new Error("The role map did not load.");
      return data;
    });
  }

  return {
    POSITIONS: POSITIONS,
    TYPES: TYPES,
    MILESTONES: MILESTONES,
    addDays: addDays,
    chicagoToday: chicagoToday,
    isOverdue: isOverdue,
    milestoneOf: milestoneOf,
    currentRolloutWeek: currentRolloutWeek,
    weekItems: weekItems,
    groups: groups,
    sectionHtml: sectionHtml,
    trainingTopics: trainingTopics,
    load: load
  };
});
