/* Morning huddle loads. Dates are America/Chicago.
   This file does not talk to the database.
   Team loads per day can be frozen into a snapshot. The page no longer draws that block.
   Patrick's current week is separate: truck-log loads and calls, Monday through today.
   The huddle does not draw the command center. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.HuddleScorecard = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var LOADS_PER_DAY = 2;
  var HUDDLE_HOUR = 10;
  var CAPTURE_MINUTES = 3;
  var WON_STAGES = ["customer_po", "driven_po", "shipped", "delivered", "invoice_sent", "paid"];
  var ROSTER = ["Patrick", "Annie", "Rich", "Landon", "Amber"];
  var DRIVER_KEYS = ["_driver", "driver", "delivered_by", "load_owner", "truck_driver"];
  var OPS_FIELDS = [
    { key: "fulfillment_time", label: "Order fulfillment", unit: "days" },
    { key: "vendor_performance", label: "Vendor performance", unit: "percent" },
    { key: "on_time_delivery", label: "On time delivery", unit: "percent" }
  ];
  var COMMAND_FIELDS = [
    { key: "revenue_weekly", label: "Revenue", unit: "money" },
    { key: "gross_margin", label: "Gross margin", unit: "percent" },
    { key: "net_profit", label: "Net profit", unit: "money", sub: "This week" },
    { key: "cash_on_hand", label: "Cash on hand", unit: "money", sub: "Amber" },
    { key: "ar_days", label: "A/R days outstanding", unit: "number" },
    { key: "labor_pct_sales", label: "Labor % of sales", unit: "percent" }
  ];

  function pad(n) { return String(n).padStart(2, "0"); }
  function ymdUTC(date) { return date.getUTCFullYear() + "-" + pad(date.getUTCMonth() + 1) + "-" + pad(date.getUTCDate()); }
  function parseYmd(ymd) { return new Date(ymd + "T00:00:00Z"); }
  function addDays(ymd, n) { var d = parseYmd(ymd); d.setUTCDate(d.getUTCDate() + n); return ymdUTC(d); }
  function weekday(ymd) { return parseYmd(ymd).getUTCDay(); }
  function isWeekdayYmd(ymd) { var wd = weekday(ymd); return wd !== 0 && wd !== 6; }
  function priorWorkday(today) {
    var day = today;
    do { day = addDays(day, -1); } while (!isWeekdayYmd(day));
    return day;
  }
  function ymd(value) {
    if (value == null || value === "") return "";
    var match = String(value).trim().match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : "";
  }
  function chicagoParts(now) {
    var parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    }).formatToParts(now || new Date());
    var get = function (type) { return parts.find(function (p) { return p.type === type; }).value; };
    var hour = get("hour");
    if (hour === "24") hour = "00";
    return {
      ymd: get("year") + "-" + get("month") + "-" + get("day"),
      hour: +hour,
      minute: +get("minute"),
      second: +get("second")
    };
  }
  function chicagoOffsetMs(date) {
    var p = chicagoParts(date);
    var wall = Date.UTC(+p.ymd.slice(0, 4), +p.ymd.slice(5, 7) - 1, +p.ymd.slice(8, 10), p.hour, p.minute, p.second);
    return wall - date.getTime();
  }
  function huddleStart(ymd) {
    var desired = Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10), HUDDLE_HOUR, 0, 0);
    var guess = new Date(desired);
    var date = new Date(desired - chicagoOffsetMs(guess));
    return new Date(desired - chicagoOffsetMs(date));
  }
  function minutes(parts) { return parts.hour * 60 + parts.minute; }
  function plan(now) {
    var parts = chicagoParts(now || new Date());
    var mins = minutes(parts);
    var open = mins >= HUDDLE_HOUR * 60;
    var capture = isWeekdayYmd(parts.ymd) && open && mins < HUDDLE_HOUR * 60 + CAPTURE_MINUTES;
    var displayDay = isWeekdayYmd(parts.ymd) && open ? parts.ymd : priorWorkday(parts.ymd);
    var waitMs = null;
    if (!capture && isWeekdayYmd(parts.ymd) && !open) {
      waitMs = huddleStart(parts.ymd).getTime() - (now || new Date()).getTime();
      if (waitMs < 0) waitMs = 0;
    }
    return { displayDay: displayDay, capture: capture, waitMs: waitMs, today: parts.ymd };
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function pretty(ymd) {
    if (!ymd) return "";
    var date = parseYmd(ymd);
    if (isNaN(date.getTime())) return String(ymd);
    return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  }
  function formatNum(n) {
    return (Math.round((+n) * 100) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
  function formatMoney(n) {
    if (n == null || n === "" || isNaN(+n)) return "—";
    var sign = +n < 0 ? "-" : "";
    return sign + "$" + Math.abs(Math.round(+n)).toLocaleString("en-US");
  }
  function weekValue(weekData, key) {
    if (!weekData || !Object.prototype.hasOwnProperty.call(weekData, key + "_w4")) return null;
    var value = weekData[key + "_w4"];
    if (value == null || value === "" || isNaN(+value)) return null;
    return +value;
  }
  function isLost(deal) {
    var custom = deal && deal.custom || {};
    return custom._status === "lost" || (deal && deal.status === "lost");
  }
  function driverName(deal) {
    var custom = deal && deal.custom || {};
    var i;
    for (i = 0; i < DRIVER_KEYS.length; i++) {
      var value = custom[DRIVER_KEYS[i]];
      if (value != null && String(value).trim()) return String(value).trim();
    }
    return "";
  }
  function canonical(name) {
    var trimmed = String(name || "").trim();
    var found = ROSTER.find(function (person) { return person.toLowerCase() === trimmed.toLowerCase(); });
    return found || trimmed;
  }
  function loadDay(deal, wonKeys) {
    if (!deal || isLost(deal)) return "";
    if (wonKeys.indexOf(deal.stage) < 0) return "";
    return ymd(deal.est_delivery_date) || ymd(deal.est_ship_date);
  }
  function inWindow(day, start, end) { return !!day && day >= start && day <= end; }
  function cell(actual, goal) {
    return { actual: actual, goal: goal, tone: goal == null ? "" : (actual >= goal ? "hit" : "miss") };
  }
  function countLoads(input) {
    var wonKeys = input.wonStageKeys && input.wonStageKeys.length ? input.wonStageKeys : WON_STAGES;
    var yesterday = input.yesterday;
    var weekStart = input.weekStart;
    var weekEnd = input.weekEnd;
    var yCount = 0;
    var wCount = 0;
    var any = false;
    var byName = {};
    var named = false;
    var seen = {};
    (input.deals || []).forEach(function (deal) {
      var id = deal && deal.id != null ? "id:" + deal.id : "";
      if (id && seen[id]) return;
      if (id) seen[id] = true;
      var day = loadDay(deal, wonKeys);
      if (!day) return;
      any = true;
      var yHit = day === yesterday;
      var wHit = inWindow(day, weekStart, weekEnd);
      if (yHit) yCount += 1;
      if (wHit) wCount += 1;
      var who = driverName(deal);
      if (!who) return;
      named = true;
      var name = canonical(who);
      if (!byName[name]) byName[name] = { name: name, yesterday: 0, week: 0 };
      if (yHit) byName[name].yesterday += 1;
      if (wHit) byName[name].week += 1;
    });
    var people = [];
    if (named) {
      if (!byName.Patrick) byName.Patrick = { name: "Patrick", yesterday: 0, week: 0 };
      people = Object.keys(byName).map(function (name) { return byName[name]; });
      people.sort(function (a, b) {
        if (a.name === "Patrick") return -1;
        if (b.name === "Patrick") return 1;
        return a.name.localeCompare(b.name);
      });
    }
    var weekGoal = LOADS_PER_DAY * (input.weekDays || 0);
    return {
      goalPerDay: LOADS_PER_DAY,
      noneLogged: !any,
      capped: (input.deals || []).length >= 2000,
      yesterday: cell(yCount, LOADS_PER_DAY),
      week: cell(wCount, weekGoal),
      people: people
    };
  }
  function copyCell(cellIn) {
    if (!cellIn || cellIn.actual == null || cellIn.actual === "" || isNaN(+cellIn.actual)) {
      return { actual: null, goal: null, tone: "" };
    }
    var goal = cellIn.goal == null || cellIn.goal === "" || isNaN(+cellIn.goal) ? null : +cellIn.goal;
    var tone = cellIn.tone === "hit" || cellIn.tone === "miss" ? cellIn.tone : "";
    return { actual: +cellIn.actual, goal: goal, tone: tone };
  }
  function build(input) {
    var team = input.team || {};
    var weekData = input.weekData || {};
    var ops = {};
    OPS_FIELDS.forEach(function (field) { ops[field.key] = weekValue(weekData, field.key); });
    var command = { weekOf: ymd(input.weekOf) || (input.weekOf ? String(input.weekOf).trim() : "") || null };
    COMMAND_FIELDS.forEach(function (field) { command[field.key] = weekValue(weekData, field.key); });
    var sales = team.sales_landed || {};
    var wins = team.wins || {};
    return {
      version: 1,
      huddleDay: input.today,
      yesterday: input.yesterday,
      weekStart: input.weekStart,
      weekEnd: input.weekEnd,
      weekDays: input.weekDays,
      lastWeek: !!input.lastWeek,
      loads: countLoads(input),
      ops: ops,
      ownership: {
        sales_landed: { yesterday: copyCell(sales.yesterday), week: copyCell(sales.week) },
        wins: { yesterday: copyCell(wins.yesterday), week: copyCell(wins.week) },
        cash_on_hand: command.cash_on_hand
      },
      command: command
    };
  }
  function loadFig(title, count, noneLogged) {
    var tone = count.tone === "hit" || count.tone === "miss" ? count.tone : "";
    var extra = noneLogged ? "none logged" : "";
    var goal = "goal " + formatNum(count.goal == null ? 0 : count.goal);
    var sub = extra ? extra + " · " + goal : goal;
    return "<div><b class='" + tone + "'>" + esc(String(count.actual)) + "</b><span>" + esc(title) + "</span><small>" + esc(sub) + "</small></div>";
  }
  function blankLoads() {
    return "<div><b>—</b><span>Yesterday</span><small>Not captured</small></div><div><b>—</b><span>Week</span><small>Not captured</small></div>";
  }
  function weekStartMonday(day) {
    var wd = weekday(day);
    return addDays(day, wd === 0 ? -6 : 1 - wd);
  }
  function weekdaysMondayThrough(today) {
    var days = [];
    if (!today) return days;
    var day = weekStartMonday(today);
    while (day <= today) {
      if (isWeekdayYmd(day)) days.push(day);
      day = addDays(day, 1);
    }
    return days;
  }
  function ymdInChicago(value) {
    if (value == null || value === "") return "";
    var text = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    var date = new Date(text);
    if (isNaN(date.getTime())) {
      var lead = text.match(/^(\d{4}-\d{2}-\d{2})/);
      return lead ? lead[1] : "";
    }
    return chicagoParts(date).ymd;
  }
  function sameName(a, b) {
    return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
  }
  function goalNumber(goals, scope, rep, metric, period) {
    var row = (goals || []).find(function (g) {
      if (!g || g.active === false) return false;
      if (g.scope !== scope || g.metric !== metric || g.period !== period) return false;
      if (scope === "team") return !g.rep;
      return sameName(g.rep, rep);
    });
    if (!row || row.target == null || row.target === "" || isNaN(+row.target)) return null;
    return +row.target;
  }
  var PLAN_WORDS = {
    planned: 1, plan: 1, calendar: 1, delivery_calendar: 1,
    estimate: 1, estimated: 1, est: 1, draft: 1, crm: 1,
    est_ship: 1, est_delivery: 1
  };
  function planWord(value) {
    return String(value == null ? "" : value).trim().toLowerCase().replace(/[\s-]+/g, "_");
  }
  function isPlannedEntry(entry) {
    if (!entry || typeof entry !== "object") return false;
    if (entry.planned === true || entry.calendar === true) return true;
    var planned = planWord(entry.planned);
    if (planned === "true" || planned === "yes" || planned === "planned") return true;
    var keys = ["status", "kind", "type", "source"];
    var i;
    for (i = 0; i < keys.length; i++) {
      if (PLAN_WORDS[planWord(entry[keys[i]])]) return true;
    }
    return false;
  }
  var LOAD_DATE_KEYS = ["date", "day", "ymd", "at", "logged_at", "checked_at", "delivered_at", "when"];
  function loadEntries(value) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object" && Array.isArray(value.truck_checks)) return value.truck_checks;
    if (value && typeof value === "object") {
      var keys = Object.keys(value);
      if (keys.length && keys.every(function (key) { return /^\d{4}-\d{2}-\d{2}/.test(key); })) {
        return keys.map(function (key) {
          var item = value[key];
          var ymdKey = key.slice(0, 10);
          if (item && typeof item === "object" && !Array.isArray(item)) {
            if (!item.date && !item.day && !item.at && !item.ymd) return Object.assign({ date: ymdKey }, item);
            return item;
          }
          return { date: ymdKey, loads: item };
        });
      }
    }
    return [];
  }
  function loggedDay(entry) {
    if (entry == null || entry === "") return "";
    if (typeof entry !== "object") return ymdInChicago(entry);
    var i;
    for (i = 0; i < LOAD_DATE_KEYS.length; i++) {
      var day = ymdInChicago(entry[LOAD_DATE_KEYS[i]]);
      if (day) return day;
    }
    return "";
  }
  function loadsOn(entry) {
    var hits = [];
    function push(day, n) {
      if (!day || !(n > 0)) return;
      hits.push({ day: day, n: n });
    }
    if (entry == null || entry === "") return hits;
    if (typeof entry !== "object") {
      push(ymdInChicago(entry), 1);
      return hits;
    }
    if (isPlannedEntry(entry)) return hits;
    var nested = Array.isArray(entry.stops) ? entry.stops : (Array.isArray(entry.deliveries) ? entry.deliveries : (Array.isArray(entry.loads) ? entry.loads : null));
    if (nested) {
      nested.forEach(function (item) {
        if (isPlannedEntry(item)) return;
        var day = item && typeof item === "object" ? loggedDay(item) : ymdInChicago(item);
        if (!day) day = loggedDay(entry);
        push(day, 1);
      });
      return hits;
    }
    var day = loggedDay(entry);
    if (!day) return hits;
    var n = 1;
    if (entry.loads != null && entry.loads !== "" && isFinite(+entry.loads)) n = +entry.loads;
    push(day, n);
    return hits;
  }
  function isPatrick(value) {
    return sameName(value, "Patrick");
  }
  function activityOwner(row) {
    return row.by_user || row.rep || row.owner || "";
  }
  function patrickWeek(input) {
    input = input || {};
    var days = weekdaysMondayThrough(input.today);
    var callGoal = goalNumber(input.goals, "rep", "Patrick", "calls", "day");
    var placeholder = callGoal == null;
    var loadMap = {};
    var callMap = {};
    days.forEach(function (day) { loadMap[day] = 0; callMap[day] = 0; });
    function add(map, day, n) {
      if (!Object.prototype.hasOwnProperty.call(map, day) || !(n > 0)) return;
      map[day] += n;
    }
    loadEntries(input.truckChecks).forEach(function (entry) {
      loadsOn(entry).forEach(function (hit) { add(loadMap, hit.day, hit.n); });
    });
    (input.shipments || []).forEach(function (row) {
      if (!row || typeof row !== "object" || isPlannedEntry(row)) return;
      add(loadMap, ymdInChicago(row.ship_date), 1);
    });
    (input.activity || []).forEach(function (row) {
      if (!row || row.kind !== "call" || !isPatrick(activityOwner(row))) return;
      add(callMap, ymdInChicago(row.at || row.day || row.date), 1);
    });
    (input.tally || []).forEach(function (row) {
      if (!row || !isPatrick(row.owner || row.rep || row.by_user || "")) return;
      var dials = +row.dials;
      if (!isFinite(dials) || dials <= 0) return;
      add(callMap, ymdInChicago(row.day || row.date), dials);
    });
    var loadsActual = 0;
    var callsActual = 0;
    var outDays = days.map(function (day) {
      loadsActual += loadMap[day];
      callsActual += callMap[day];
      return {
        ymd: day,
        loads: { actual: loadMap[day], goal: LOADS_PER_DAY },
        calls: { actual: callMap[day], goal: callGoal }
      };
    });
    return {
      days: outDays,
      loadsWeek: { actual: loadsActual, goal: LOADS_PER_DAY * outDays.length },
      callsWeek: { actual: callsActual, goal: placeholder ? null : callGoal * outDays.length },
      callGoalPlaceholder: placeholder
    };
  }
  function weekDayLabel(ymd) {
    var date = parseYmd(ymd);
    var wd = date.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
    return { wd: wd, md: (date.getUTCMonth() + 1) + "/" + date.getUTCDate() };
  }
  function fig(actual, goal) {
    return formatNum(actual) + "/" + (goal == null ? "—" : formatNum(goal));
  }
  function patrickSectionHtml(model, colspan) {
    var view = model || { days: [], loadsWeek: { actual: 0, goal: 0 }, callsWeek: { actual: 0, goal: null }, callGoalPlaceholder: true };
    var span = colspan > 0 ? colspan : 1;
    var loads = (view.days || []).map(function (day) {
      var label = weekDayLabel(day.ymd);
      return label.wd + " " + label.md + " " + fig(day.loads.actual, day.loads.goal);
    });
    loads.push("Week " + fig(view.loadsWeek ? view.loadsWeek.actual : 0, view.loadsWeek ? view.loadsWeek.goal : 0));
    var calls = (view.days || []).map(function (day) {
      return weekDayLabel(day.ymd).wd + " " + fig(day.calls.actual, day.calls.goal);
    });
    calls.push("Week " + fig(view.callsWeek ? view.callsWeek.actual : 0, view.callsWeek ? view.callsWeek.goal : null));
    var callBit = view.callGoalPlaceholder
      ? "calls goal not set (placeholder)"
      : ("goal " + formatNum(view.days && view.days[0] ? view.days[0].calls.goal : 0) + " a day");
    var hint = "How this works: Loads and Calls for this week, Monday through today, plus a week running total; each figure is actual / goal; loads come from the truck log (goal " + LOADS_PER_DAY + " a day); calls are logged calls and outreach dials (" + callBit + "); planned calls and CRM ship or delivery dates are not counted as loads; the other columns in this table are unchanged.";
    var text = "Loads: " + loads.join(" · ") + "  |  Calls: " + calls.join(" · ");
    return "<tr class='patrick-week'><td colspan='" + span + "' title='" + esc(hint) + "'><span class='tally'>" + esc(text) + "</span><small class='hint'>" + esc(hint) + "</small></td></tr>";
  }
  function sectionHtml(view) {
    var snapshot = view && view.snapshot;
    var note = view && view.note || "";
    var html = "<section class='scorecard' id='huddleLoads' aria-label='Loads per day'>";
    html += "<div class='loads-hero'><p class='kicker'>Loads per day</p>";
    html += "<p class='fine'>In-house truck. Goal is 2 deliveries a day. Patrick owns this number.</p>";
    if (snapshot) {
      var weekWord = snapshot.lastWeek ? "Last week" : "Week to date";
      html += "<p class='frozen'>Frozen at 10:00 AM CT · " + esc(pretty(snapshot.huddleDay)) + " · " + esc(weekWord) + " " + esc(pretty(snapshot.weekStart)) + " – " + esc(pretty(snapshot.weekEnd)) + "</p>";
    } else {
      html += "<p class='frozen'>Snapshot at 10:00 AM CT · " + esc(pretty(view && view.huddleDay)) + " · not captured</p>";
    }
    if (note) html += "<p class='fine'>" + esc(note) + "</p>";
    html += "<div class='loads-figs'>";
    if (!snapshot) html += blankLoads();
    else {
      var loads = snapshot.loads;
      html += loadFig("Team · yesterday", loads.yesterday, loads.noneLogged && loads.yesterday.actual === 0);
      html += loadFig(snapshot.lastWeek ? "Team · last week" : "Team · week to date", loads.week, loads.noneLogged && loads.week.actual === 0);
    }
    html += "</div>";
    if (snapshot && snapshot.loads.people.length) {
      html += "<div class='load-people'>";
      snapshot.loads.people.forEach(function (person) {
        html += "<span><b>" + esc(String(person.yesterday)) + " / " + esc(String(person.week)) + "</b><small>" + esc(person.name) + " · yesterday / week</small></span>";
      });
      html += "</div>";
      html += "<p class='fine'>Split only when a delivery names a driver. The team total above still counts a delivery with no driver.</p>";
    } else if (snapshot && !snapshot.loads.noneLogged) {
      html += "<p class='fine'>Team total. No driver is stored on the deliveries, so there is no per-person split.</p>";
    }
    if (snapshot && snapshot.loads.capped) html += "<p class='fine'>The deal list hit 2,000 rows, so some deliveries may be missing from this snapshot.</p>";
    if (snapshot) html += "<p class='fine'>Loads come from CRM orders at Customer PO or later, using the delivery date, or the ship date when delivery is blank. Refresh reloads the snapshot. It does not recompute these numbers.</p>";
    html += "</div></section>";
    return html;
  }

  return {
    LOADS_PER_DAY: LOADS_PER_DAY,
    CAPTURE_MINUTES: CAPTURE_MINUTES,
    OPS_FIELDS: OPS_FIELDS,
    COMMAND_FIELDS: COMMAND_FIELDS,
    chicagoParts: chicagoParts,
    huddleStart: huddleStart,
    plan: plan,
    priorWorkday: priorWorkday,
    weekStartMonday: weekStartMonday,
    weekdaysMondayThrough: weekdaysMondayThrough,
    ymdInChicago: ymdInChicago,
    goalNumber: goalNumber,
    weekValue: weekValue,
    countLoads: countLoads,
    build: build,
    sectionHtml: sectionHtml,
    patrickWeek: patrickWeek,
    patrickSectionHtml: patrickSectionHtml,
    formatMoney: formatMoney
  };
});
