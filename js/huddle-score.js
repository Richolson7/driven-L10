/* Morning huddle math. Dates are America/Chicago calendar days, YYYY-MM-DD.
   This file does not talk to the database. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.HuddleScore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var METRICS = ["touches", "calls", "emails", "quotes_sent", "sales_landed", "wins"];
  var CALL_KINDS = { call: 1 };
  var EMAIL_KINDS = { email: 1 };
  var TOUCH_KINDS = { call: 1, email: 1, touch: 1, text: 1, meeting: 1, visit: 1, other: 1 };

  function pad(n) { return String(n).padStart(2, "0"); }
  function ymdUTC(date) { return date.getUTCFullYear() + "-" + pad(date.getUTCMonth() + 1) + "-" + pad(date.getUTCDate()); }
  function parseYmd(ymd) { return new Date(ymd + "T00:00:00Z"); }
  function addDays(ymd, n) { var d = parseYmd(ymd); d.setUTCDate(d.getUTCDate() + n); return ymdUTC(d); }
  function weekday(ymd) { return parseYmd(ymd).getUTCDay(); }
  function chicagoToday(now) {
    var parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now || new Date());
    var get = function (type) { return parts.find(function (p) { return p.type === type; }).value; };
    return get("year") + "-" + get("month") + "-" + get("day");
  }
  function ymdInChicago(value) {
    if (!value) return "";
    var text = String(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    var date = new Date(text);
    if (isNaN(date.getTime())) return text.slice(0, 10);
    return chicagoToday(date);
  }
  function priorWorkday(today) {
    var day = today;
    do { day = addDays(day, -1); } while (weekday(day) === 0 || weekday(day) === 6);
    return day;
  }
  function weekStartMonday(ymd) {
    var wd = weekday(ymd);
    return addDays(ymd, wd === 0 ? -6 : 1 - wd);
  }
  function weekdaysBetween(start, end) {
    if (!start || !end || start > end) return 0;
    var n = 0;
    var day = start;
    while (day <= end) {
      var wd = weekday(day);
      if (wd !== 0 && wd !== 6) n += 1;
      day = addDays(day, 1);
    }
    return n;
  }
  function sameName(a, b) { return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase(); }
  function goalRow(goals, scope, rep, metric, period) {
    return (goals || []).find(function (g) {
      if (g.active === false) return false;
      if (g.scope !== scope || g.metric !== metric || g.period !== period) return false;
      if (scope === "team") return !g.rep;
      return sameName(g.rep, rep);
    }) || null;
  }
  function goalNumber(goals, scope, rep, metric, period) {
    var row = goalRow(goals, scope, rep, metric, period);
    return row ? +row.target : null;
  }
  function moneyOf(deal) {
    var custom = deal.custom || {};
    var quote = custom._quote;
    if (quote && quote.lines && quote.lines.length) {
      return quote.lines.reduce(function (sum, line) {
        return sum + ((+line.qty || 0) * (+line.price || 0));
      }, 0);
    }
    return (+deal.quantity || 0) * (+deal.price_per_unit || 0);
  }
  function isWin(deal, wonKeys) {
    var custom = deal.custom || {};
    if (custom._status === "lost") return false;
    return wonKeys.indexOf(deal.stage) >= 0;
  }
  function winDay(deal) {
    var custom = deal.custom || {};
    if (custom._won_at) return String(custom._won_at).slice(0, 10);
    return ymdInChicago(deal.stage_changed_at);
  }
  function emptyCounts() {
    return { touches: 0, calls: 0, emails: 0, quotes_sent: 0, sales_landed: 0, wins: 0 };
  }
  function addActivity(bucket, kind) {
    if (CALL_KINDS[kind]) bucket.calls += 1;
    if (EMAIL_KINDS[kind]) bucket.emails += 1;
    if (TOUCH_KINDS[kind]) bucket.touches += 1;
  }
  function inWindow(day, start, end) { return !!day && day >= start && day <= end; }
  function repNames(goals) {
    var names = [];
    (goals || []).forEach(function (g) {
      if (g.active === false || g.scope !== "rep" || !g.rep) return;
      if (!names.some(function (n) { return sameName(n, g.rep); })) names.push(String(g.rep).trim());
    });
    var preferred = ["Rich", "Landon"];
    names.sort(function (a, b) {
      var ia = preferred.findIndex(function (n) { return sameName(n, a); });
      var ib = preferred.findIndex(function (n) { return sameName(n, b); });
      if (ia < 0 && ib < 0) return a.localeCompare(b);
      if (ia < 0) return 1;
      if (ib < 0) return -1;
      return ia - ib;
    });
    return names;
  }
  function findRep(names, value) {
    return names.find(function (n) { return sameName(n, value); }) || "";
  }
  function cell(actual, goal) {
    return { actual: actual, goal: goal, tone: goal == null ? "" : (actual >= goal ? "hit" : "miss") };
  }
  function buildRow(name, yActual, wActual, yGoals, wGoals) {
    var cells = {};
    METRICS.forEach(function (metric) {
      cells[metric] = {
        yesterday: cell(yActual[metric] || 0, yGoals[metric]),
        week: cell(wActual[metric] || 0, wGoals[metric])
      };
    });
    return { name: name, cells: cells };
  }

  function score(input) {
    var today = input.today;
    var yesterday = priorWorkday(today);
    var weekStart = weekStartMonday(yesterday);
    var weekDays = weekdaysBetween(weekStart, yesterday);
    var todayWeek = weekStartMonday(today);
    var names = repNames(input.goals);
    var wonKeys = input.wonStageKeys || ["customer_po", "driven_po", "shipped", "delivered", "invoice_sent", "paid"];
    var byRep = {};
    names.forEach(function (name) { byRep[name] = { y: emptyCounts(), w: emptyCounts() }; });
    var teamY = emptyCounts();
    var teamW = emptyCounts();
    var unmatched = 0;
    var quoteDeals = {};

    (input.activity || []).forEach(function (row) {
      var day = ymdInChicago(row.at);
      var rep = findRep(names, row.by_user);
      var kind = row.kind || "";
      if (!TOUCH_KINDS[kind]) return;
      if (!rep) { unmatched += 1; return; }
      if (day === yesterday) addActivity(byRep[rep].y, kind);
      if (inWindow(day, weekStart, yesterday)) addActivity(byRep[rep].w, kind);
    });
    (input.tally || []).forEach(function (row) {
      var day = ymdInChicago(row.day);
      var rep = findRep(names, row.owner);
      if (!rep) return;
      var dials = +row.dials || 0;
      var emails = +row.emails || 0;
      function add(bucket) {
        bucket.calls += dials;
        bucket.emails += emails;
        bucket.touches += dials + emails;
      }
      if (day === yesterday) add(byRep[rep].y);
      if (inWindow(day, weekStart, yesterday)) add(byRep[rep].w);
    });
    (input.quotes || []).forEach(function (row) {
      if (!row.sent_date) return;
      if (row.deal_id) quoteDeals[row.deal_id] = true;
      var day = ymdInChicago(row.sent_date);
      var rep = findRep(names, row.rep);
      function add(bucket) { bucket.quotes_sent += 1; }
      if (rep) {
        if (day === yesterday) add(byRep[rep].y);
        if (inWindow(day, weekStart, yesterday)) add(byRep[rep].w);
      }
      if (day === yesterday) add(teamY);
      if (inWindow(day, weekStart, yesterday)) add(teamW);
    });
    (input.deals || []).forEach(function (deal) {
      if (deal.quote_sent_date && !quoteDeals[deal.id]) {
        var sent = ymdInChicago(deal.quote_sent_date);
        var sentRep = findRep(names, deal.sales_rep);
        if (sentRep) {
          if (sent === yesterday) byRep[sentRep].y.quotes_sent += 1;
          if (inWindow(sent, weekStart, yesterday)) byRep[sentRep].w.quotes_sent += 1;
        }
        if (sent === yesterday) teamY.quotes_sent += 1;
        if (inWindow(sent, weekStart, yesterday)) teamW.quotes_sent += 1;
      }
      if (!isWin(deal, wonKeys)) return;
      var day = winDay(deal);
      var amount = moneyOf(deal);
      var rep = findRep(names, deal.sales_rep);
      function addWin(bucket) { bucket.wins += 1; bucket.sales_landed += amount; }
      if (rep) {
        if (day === yesterday) addWin(byRep[rep].y);
        if (inWindow(day, weekStart, yesterday)) addWin(byRep[rep].w);
      }
      if (day === yesterday) addWin(teamY);
      if (inWindow(day, weekStart, yesterday)) addWin(teamW);
    });

    names.forEach(function (name) {
      METRICS.forEach(function (metric) {
        if (metric === "sales_landed" || metric === "wins" || metric === "quotes_sent") return;
        teamY[metric] += byRep[name].y[metric];
        teamW[metric] += byRep[name].w[metric];
      });
    });

    function scaled(scope, rep, metric, mode) {
      var daily = goalNumber(input.goals, scope, rep, metric, "day");
      if (mode === "yesterday") return daily;
      if (daily != null) return daily * weekDays;
      return goalNumber(input.goals, scope, rep, metric, "week");
    }
    function goalsFor(scope, rep, mode) {
      var out = {};
      METRICS.forEach(function (metric) {
        if (scope === "team" && metric !== "sales_landed" && metric !== "wins") {
          var sum = 0;
          var any = false;
          names.forEach(function (name) {
            var one = scaled("rep", name, metric, mode);
            if (one != null) { any = true; sum += one; }
          });
          out[metric] = any ? sum : null;
          return;
        }
        out[metric] = scaled(scope, rep, metric, mode);
      });
      return out;
    }

    return {
      today: today,
      yesterday: yesterday,
      weekStart: weekStart,
      weekEnd: yesterday,
      weekDays: weekDays,
      lastWeek: weekStart !== todayWeek,
      unmatched: unmatched,
      reps: names.map(function (name) {
        return buildRow(name, byRep[name].y, byRep[name].w, goalsFor("rep", name, "yesterday"), goalsFor("rep", name, "week"));
      }),
      team: buildRow("Team", teamY, teamW, goalsFor("team", null, "yesterday"), goalsFor("team", null, "week"))
    };
  }

  return {
    METRICS: METRICS,
    chicagoToday: chicagoToday,
    priorWorkday: priorWorkday,
    weekStartMonday: weekStartMonday,
    weekdaysBetween: weekdaysBetween,
    score: score
  };
});
