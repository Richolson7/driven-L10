/* Morning huddle scorecard. Dates are America/Chicago.
   This file does not talk to the database.
   The page saves one snapshot at 10:00 AM on a weekday and then only reloads it.
   Loads are in-house truck deliveries. The goal is 2 per day. */
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
  function formatByUnit(n, unit) {
    if (n == null || n === "" || isNaN(+n)) return "—";
    if (unit === "money") return formatMoney(n);
    if (unit === "percent") return formatNum(n) + "%";
    return formatNum(n);
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
  function goalText(goal, unit) {
    if (goal == null) return "";
    if (unit === "money") return "goal " + formatMoney(goal);
    return "goal " + formatNum(goal);
  }
  function tile(label, value, sub, tone) {
    var cls = tone === "hit" || tone === "miss" ? " " + tone : "";
    return "<article class='tile" + cls + "'><small>" + esc(label) + "</small><b>" + esc(value) + "</b><span>" + esc(sub) + "</span></article>";
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
  function sectionHtml(view) {
    var snapshot = view && view.snapshot;
    var note = view && view.note || "";
    var html = "<section class='scorecard' id='huddleScorecard' aria-label='Scorecard'>";
    html += "<div class='scorecard-head'><h2>Scorecard</h2>";
    if (snapshot) {
      var weekWord = snapshot.lastWeek ? "Last week" : "Week to date";
      html += "<p class='frozen'>Frozen at 10:00 AM CT · " + esc(pretty(snapshot.huddleDay)) + " · " + esc(weekWord) + " " + esc(pretty(snapshot.weekStart)) + " – " + esc(pretty(snapshot.weekEnd)) + "</p>";
    } else {
      html += "<p class='frozen'>Snapshot at 10:00 AM CT · " + esc(pretty(view && view.huddleDay)) + " · not captured</p>";
    }
    html += "</div>";
    if (note) html += "<p class='fine'>" + esc(note) + "</p>";
    html += "<div class='loads-hero'><p class='kicker'>Loads per day</p>";
    html += "<p class='fine'>In-house truck. Goal is 2 deliveries a day. Patrick owns this number.</p>";
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
    html += "</div>";
    html += "<h3>Customer service</h3><div class='tile-grid'>";
    if (!snapshot) {
      OPS_FIELDS.forEach(function (field) { html += tile(field.label, "—", "n/a", ""); });
      html += tile("Sales landed", "—", "Annie · yesterday", "");
      html += tile("Sales landed", "—", "Annie · week", "");
      html += tile("Wins", "—", "Week · goal 3", "");
      html += tile("Cash on hand", "—", "Amber", "");
    } else {
      OPS_FIELDS.forEach(function (field) {
        var value = snapshot.ops[field.key];
        html += tile(field.label, formatByUnit(value, field.unit === "percent" ? "percent" : "number"), value == null ? "n/a" : (field.unit === "days" ? "days" : "This week"), "");
      });
      var salesY = snapshot.ownership.sales_landed.yesterday;
      var salesW = snapshot.ownership.sales_landed.week;
      var winsW = snapshot.ownership.wins.week;
      html += tile("Sales landed", formatMoney(salesY.actual), "Annie · yesterday" + (salesY.goal == null ? "" : " · " + goalText(salesY.goal, "money")), salesY.tone);
      html += tile("Sales landed", formatMoney(salesW.actual), "Annie · " + (snapshot.lastWeek ? "last week" : "week") + (salesW.goal == null ? "" : " · " + goalText(salesW.goal, "money")), salesW.tone);
      html += tile("Wins", winsW.actual == null ? "—" : formatNum(winsW.actual), "Week" + (winsW.goal == null ? "" : " · " + goalText(winsW.goal, "number")), winsW.tone);
      html += tile("Cash on hand", formatMoney(snapshot.ownership.cash_on_hand), snapshot.ownership.cash_on_hand == null ? "Amber · n/a" : "Amber", "");
    }
    html += "</div><h3>Command center</h3>";
    if (!snapshot) html += "<p class='fine'>Week label shows here when a snapshot is saved.</p>";
    else if (snapshot.command.weekOf) html += "<p class='fine'>Stored Week Of label: " + esc(pretty(ymd(snapshot.command.weekOf)) || snapshot.command.weekOf) + ". Net profit is the weekly figure.</p>";
    else html += "<p class='fine'>No week label is stored. Net profit is the weekly figure.</p>";
    html += "<div class='tile-grid'>";
    COMMAND_FIELDS.forEach(function (field) {
      if (!snapshot) {
        html += tile(field.label, "—", "n/a", "");
        return;
      }
      var value = snapshot.command[field.key];
      var sub = value == null ? "n/a" : (field.sub || "This week");
      html += tile(field.label, formatByUnit(value, field.unit), sub, "");
    });
    html += "</div>";
    if (snapshot) html += "<p class='fine'>Loads come from CRM orders at Customer PO or later, using the delivery date, or the ship date when delivery is blank. Customer service and the command center are the weekly scorecard _w4 values. Sales landed and wins are the huddle team totals from this same 10:00 AM snapshot. Refresh reloads the snapshot. It does not recompute these tiles.</p>";
    html += "</section>";
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
    weekValue: weekValue,
    countLoads: countLoads,
    build: build,
    sectionHtml: sectionHtml,
    formatMoney: formatMoney
  };
});
