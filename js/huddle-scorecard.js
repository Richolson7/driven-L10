/* Morning huddle scorecard. Dates are America/Chicago.
   This file does not talk to the database.
   The page saves one snapshot at 10:00 AM on a weekday and then only reloads it.
   Loads are in-house truck deliveries. Driven delivers its own loads. The goal is 2 per day.
   Financial snapshot tiles use the weekly scorecard when a _w4 value exists.
   A/P days and labor percent have no field yet, so they stay n/a.
   The page hides the financial snapshot from setter logins. */
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
    { key: "ap_days", label: "A/P days outstanding", unit: "number" },
    { key: "labor_pct_sales", label: "Labor % of sales", unit: "percent" }
  ];
  var FINANCE_FIELDS = [
    { key: "revenue_weekly", label: "Revenue", unit: "money", sub: "This week" },
    { key: "gross_margin", label: "Gross margin", unit: "percent", sub: "This week" },
    { key: "net_profit", label: "Net profit", unit: "money", sub: "This week" },
    { key: "cash_on_hand", label: "Cash on hand", unit: "money", sub: "This week" },
    { key: "ap_days", label: "A/P days outstanding", unit: "number", sub: "n/a" },
    { key: "labor_pct_sales", label: "Labor % of sales", unit: "percent", sub: "n/a" }
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
  var SERVICE_OPS = [
    { key: "fulfillment_time", label: "Order fulfillment", unit: "number", sub: "days" },
    { key: "on_time_delivery", label: "On time delivery", unit: "percent", sub: "This week" },
    { key: "vendor_performance", label: "Vendor performance", unit: "percent", sub: "This week" }
  ];

  function tile(label, value, sub, tone) {
    var cls = tone === "hit" || tone === "miss" ? " " + tone : "";
    return "<article class='tile" + cls + "'><small>" + esc(label) + "</small><b>" + esc(value) + "</b><span>" + esc(sub) + "</span></article>";
  }
  function sourcedTile(label, value, unit, sub) {
    if (value == null || value === "" || isNaN(+value)) return tile(label, "—", "n/a", "");
    return tile(label, formatByUnit(value, unit), sub, "");
  }
  function countTile(label, cell, sub, asMoney) {
    if (!cell || cell.actual == null || cell.actual === "" || isNaN(+cell.actual)) return tile(label, "—", "n/a", "");
    var shown = asMoney ? formatMoney(cell.actual) : formatNum(cell.actual);
    return tile(label, shown, sub, cell.tone);
  }
  function letter(ch) {
    return "<span class='letter'>" + esc(ch) + "</span>";
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
  function serviceTiles(snapshot) {
    var html = "";
    if (!snapshot) {
      html += tile("Quotes won", "—", "n/a", "");
      html += tile("Sales landed", "—", "n/a", "");
    } else {
      var winsW = snapshot.ownership && snapshot.ownership.wins && snapshot.ownership.wins.week;
      var salesY = snapshot.ownership && snapshot.ownership.sales_landed && snapshot.ownership.sales_landed.yesterday;
      var winSub = "Week";
      if (winsW && winsW.goal != null) winSub += " · goal " + formatNum(winsW.goal);
      var salesSub = "Yesterday";
      if (salesY && salesY.goal != null) salesSub += " · goal " + formatMoney(salesY.goal);
      html += countTile("Quotes won", winsW, winSub, false);
      html += countTile("Sales landed", salesY, salesSub, true);
    }
    SERVICE_OPS.forEach(function (field) {
      if (!snapshot) html += tile(field.label, "—", "n/a", "");
      else html += sourcedTile(field.label, snapshot.ops[field.key], field.unit, field.sub);
    });
    var ar = snapshot && snapshot.command ? snapshot.command.ar_days : null;
    html += sourcedTile("A/R days outstanding", ar, "number", ar == null ? "n/a" : "This week");
    return html;
  }
  function financeTiles(snapshot) {
    var html = "";
    FINANCE_FIELDS.forEach(function (field) {
      var value = snapshot && snapshot.command ? snapshot.command[field.key] : null;
      html += sourcedTile(field.label, value, field.unit, value == null ? "n/a" : field.sub);
    });
    return html;
  }
  function sectionHtml(view) {
    var snapshot = view && view.snapshot;
    var note = view && view.note || "";
    var html = "<section class='scoreboard' id='huddleScorecard' aria-label='Scoreboard'>";
    html += "<h2>Scoreboard</h2>";
    if (snapshot) {
      html += "<p class='frozen'>Snapshot at 10:00 AM CT · " + esc(pretty(snapshot.huddleDay)) + "</p>";
    } else {
      html += "<p class='frozen'>Snapshot at 10:00 AM CT · " + esc(pretty(view && view.huddleDay)) + " · not captured</p>";
    }
    if (note) html += "<p class='fine'>" + esc(note) + "</p>";
    html += "<h3 id='customer-service'>" + letter("A") + "Customer service</h3><div class='tile-grid'>";
    html += serviceTiles(snapshot);
    html += "</div>";
    if (!view || view.showFinancial !== false) {
      html += "<h3 id='financial-snapshot'>" + letter("B") + "Financial snapshot</h3><div class='tile-grid'>";
      html += financeTiles(snapshot);
      html += "</div>";
    }
    html += "<h3 id='logistics'>" + letter("C") + "Logistics</h3>";
    html += "<div class='loads-hero'><div class='band-copy'><p class='kicker'>Logistics: in-house loads delivered</p>";
    html += "<p class='fine'>In-house truck · Goal 2/day</p></div>";
    html += "<div class='loads-figs'>";
    if (!snapshot) html += blankLoads();
    else {
      var loads = snapshot.loads;
      html += loadFig("Yesterday", loads.yesterday, loads.noneLogged && loads.yesterday.actual === 0);
      html += loadFig("Week", loads.week, loads.noneLogged && loads.week.actual === 0);
    }
    html += "</div></div>";
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
    if (snapshot) {
      html += "<details class='sources'><summary>Where these numbers come from</summary>";
      html += "<p class='fine'>Loads are in-house truck deliveries from CRM orders at Customer PO or later, using the delivery date, or the ship date when delivery is blank. Quotes won and sales landed are the huddle team totals from this same 10:00 AM snapshot. A/R days uses the weekly scorecard when that value is saved. Order fulfillment, on time delivery, and vendor performance have no scorecard field yet, so they stay n/a.";
      if (!view || view.showFinancial !== false) html += " The financial snapshot uses the weekly scorecard for revenue, gross margin, net profit, and cash on hand. A/P days and labor percent of sales have no field yet.";
      html += " Refresh reloads the snapshot. It does not recompute these tiles.</p>";
      html += "</details>";
    }
    html += "<div id='huddleSalesSlot'></div></section>";
    return html;
  }

  return {
    LOADS_PER_DAY: LOADS_PER_DAY,
    CAPTURE_MINUTES: CAPTURE_MINUTES,
    OPS_FIELDS: OPS_FIELDS,
    COMMAND_FIELDS: COMMAND_FIELDS,
    FINANCE_FIELDS: FINANCE_FIELDS,
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
