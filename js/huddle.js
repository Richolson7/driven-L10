/* Morning huddle screen. Numbers come from HuddleScore.
   CRM tables are read only after a team sign-in. This file sends nothing. */
(function () {
  "use strict";
  var Score = window.HuddleScore;
  var board = document.getElementById("board");
  var statusEl = document.getElementById("status");
  if (!Score || !window.CRMDB || !board) {
    if (board) board.textContent = "The huddle scripts did not load. Reload the page.";
    return;
  }

  var METRIC_LABEL = {
    touches: "Touches",
    calls: "Calls",
    emails: "Emails",
    quotes_sent: "Quotes sent",
    sales_landed: "Sales landed",
    wins: "Wins"
  };
  var me = null;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function setStatus(text, bad) {
    if (!statusEl) return;
    statusEl.textContent = text || "";
    statusEl.className = bad ? "bad" : "";
  }
  function money(n) {
    return "$" + Math.round(+n || 0).toLocaleString("en-US");
  }
  function pretty(ymd) {
    var date = new Date(ymd + "T00:00:00Z");
    return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  }
  function showPair(metric, cell) {
    var actual = metric === "sales_landed" ? money(cell.actual) : String(cell.actual);
    var goal = cell.goal == null ? "—" : (metric === "sales_landed" ? money(cell.goal) : String(cell.goal));
    var cls = cell.tone ? " " + cell.tone : "";
    return "<td class='pair" + cls + "'><b>" + esc(actual) + "</b><span> / " + esc(goal) + "</span></td>";
  }
  function rowHtml(row) {
    var cells = "";
    Score.METRICS.forEach(function (metric) {
      cells += showPair(metric, row.cells[metric].yesterday);
      cells += showPair(metric, row.cells[metric].week);
    });
    return "<tr><th>" + esc(row.name) + "</th>" + cells + "</tr>";
  }

  function renderSignedOut() {
    board.innerHTML = "<p class='lead'>Sign in on the CRM to see yesterday’s numbers. This page does not load customer, deal, or activity data until you are signed in.</p><p><a class='btn' href='crm.html'>Sign in on the CRM</a></p>";
    setStatus("");
  }

  function renderBoard(result, goals, notes) {
    var head = Score.METRICS.map(function (metric) {
      return "<th>" + esc(METRIC_LABEL[metric]) + "<small>Yesterday</small></th><th>" + esc(METRIC_LABEL[metric]) + "<small>Week</small></th>";
    }).join("");
    var weekLabel = result.lastWeek ? "Last week" : "Week to date";
    var html = "<p class='range'>Yesterday " + esc(pretty(result.yesterday)) + " · " + esc(weekLabel) + " " + esc(pretty(result.weekStart)) + " – " + esc(pretty(result.weekEnd)) + " (" + result.weekDays + " weekday" + (result.weekDays === 1 ? "" : "s") + ")</p>";
    html += "<div class='scroll'><table><thead><tr><th>Rep</th>" + head + "</tr></thead><tbody>";
    html += result.reps.map(rowHtml).join("");
    html += rowHtml(result.team);
    html += "</tbody></table></div>";
    html += "<div class='logbar'><span>Log for " + esc(me.name) + "</span>";
    html += "<button type='button' data-kind='call'>Log call</button>";
    html += "<button type='button' data-kind='email'>Log email</button>";
    html += "<button type='button' data-kind='touch'>Log touch</button></div>";
    html += "<p class='fine'>" + esc(notes.join(" ")) + "</p>";
    html += "<details><summary>Edit goals</summary><form id='goalForm'>";
    (goals || []).filter(function (g) { return g.active !== false; }).forEach(function (g) {
      var who = g.scope === "team" ? "Team" : g.rep;
      html += "<label>" + esc(who + " · " + (METRIC_LABEL[g.metric] || g.metric) + " / " + g.period) + "<input data-goal-id='" + g.id + "' type='number' min='0' step='1' value='" + esc(g.target) + "'></label>";
    });
    html += "<button type='submit'>Save goals</button></form></details>";
    board.innerHTML = html;
    board.querySelectorAll(".logbar button").forEach(function (btn) {
      btn.addEventListener("click", function () { logKind(btn.getAttribute("data-kind")); });
    });
    var form = document.getElementById("goalForm");
    if (form) form.addEventListener("submit", function (e) { e.preventDefault(); saveGoals(); });
  }

  async function logKind(kind) {
    var label = kind === "call" ? "Call" : kind === "email" ? "Email" : "Touch";
    setStatus("Saving " + label.toLowerCase() + "…");
    var res = await CRMDB.db.from("crm_activity").insert({
      kind: kind,
      note: label + " logged from the morning huddle.",
      by_user: me.name,
      at: new Date().toISOString()
    }).select("id").single();
    if (res.error || !res.data) {
      setStatus("Could not log that " + label.toLowerCase() + ". " + CRMDB.explain(res.error), true);
      return;
    }
    setStatus(label + " logged for " + me.name + " today. It counts on the next huddle, because this board is yesterday. Nothing was emailed or texted.");
    await load();
  }

  async function saveGoals() {
    var inputs = board.querySelectorAll("[data-goal-id]");
    for (var i = 0; i < inputs.length; i++) {
      var target = +inputs[i].value;
      if (isNaN(target) || target < 0) { setStatus("Goals have to be zero or more.", true); return; }
      var res = await CRMDB.db.from("huddle_goals").update({ target: target, updated_at: new Date().toISOString() }).eq("id", +inputs[i].getAttribute("data-goal-id")).select("id").single();
      if (res.error || !res.data) { setStatus("Could not save a goal. " + CRMDB.explain(res.error), true); return; }
    }
    setStatus("Goals saved.");
    await load();
  }

  async function load() {
    setStatus("Checking sign-in…");
    var sessionRes = await CRMDB.db.auth.getSession();
    var session = sessionRes.data && sessionRes.data.session;
    var email = session && session.user && session.user.email;
    if (!email) { me = null; renderSignedOut(); return; }
    var teamRes = await CRMDB.db.from("crm_team").select("id,name,email,team,active").ilike("email", email).eq("active", true).limit(2);
    var person = !teamRes.error && (teamRes.data || []).find(function (row) {
      return String(row.email || "").toLowerCase() === email.toLowerCase() && row.active !== false;
    });
    if (teamRes.error || !person) {
      me = null;
      board.innerHTML = "<p class='lead'>" + esc(email) + " is not an active Driven team address. No CRM data was loaded.</p>";
      setStatus("");
      return;
    }
    me = person;
    setStatus("Loading yesterday…");
    var goalsRes = await CRMDB.db.from("huddle_goals").select("id,company,scope,rep,metric,period,target,active").eq("company", "driven").eq("active", true);
    if (goalsRes.error) {
      board.innerHTML = "<p class='lead'>The huddle goals are not in the database yet. Apply 20261027130000_huddle_goals.sql, then reload. Nothing was loaded from deals or activity.</p>";
      setStatus(CRMDB.explain(goalsRes.error), true);
      return;
    }
    var since = new Date();
    since.setDate(since.getDate() - 21);
    var results = await Promise.all([
      CRMDB.db.from("crm_activity").select("kind,by_user,at").gte("at", since.toISOString()).limit(2000),
      CRMDB.db.from("crm_quotes").select("id,deal_id,rep,sent_date").not("sent_date", "is", null).limit(2000),
      CRMDB.db.from("crm_deals").select("id,sales_rep,stage,stage_changed_at,price_per_unit,quantity,quote_sent_date,custom").limit(2000),
      CRMDB.db.from("crm_stages").select("key,position,active").eq("active", true).order("position"),
      CRMDB.db.from("driven_outreach_tally").select("day,owner,dials,emails").gte("day", since.toISOString().slice(0, 10)).limit(500)
    ]);
    var activity = results[0].error ? [] : (results[0].data || []);
    var quotes = results[1].error ? [] : (results[1].data || []);
    var deals = results[2].error ? [] : (results[2].data || []);
    var stages = results[3].error ? [] : (results[3].data || []);
    var tally = results[4].error ? [] : (results[4].data || []);
    var notes = [];
    if (results[0].error) notes.push("Activity did not load: " + CRMDB.explain(results[0].error));
    if (activity.length >= 2000 || quotes.length >= 2000 || deals.length >= 2000) notes.push("A list hit 2,000 rows, so older activity may be missing from this board.");
    if (results[1].error) notes.push("Quote headers did not load, so quote sent dates on deals are used. " + CRMDB.explain(results[1].error));
    if (results[2].error) notes.push("Deals did not load: " + CRMDB.explain(results[2].error));
    if (results[4].error) notes.push("The outreach tally did not load.");
    else if (!tally.length) notes.push("driven_outreach_tally has no rows in this window, so dials and emails there are not added.");
    else notes.push("Outreach tally dials are added to calls, and its emails are added to emails and touches.");
    var wonKeys = stages.filter(function (s) {
      var cut = stages.find(function (x) { return x.key === "customer_po"; });
      return cut && s.position >= cut.position;
    }).map(function (s) { return s.key; });
    if (!wonKeys.length) wonKeys = ["customer_po", "driven_po", "shipped", "delivered", "invoice_sent", "paid"];
    var result = Score.score({
      today: Score.chicagoToday(new Date()),
      goals: goalsRes.data || [],
      activity: activity,
      quotes: quotes,
      deals: deals,
      wonStageKeys: wonKeys,
      tally: tally
    });
    if (result.unmatched) notes.push(result.unmatched + " touch" + (result.unmatched === 1 ? "" : "es") + " had a name that is not Rich or Landon, so they are not in the rep rows.");
    notes.push("Green is at or above the goal. Red is below. A dash means that column has no goal.");
    notes.push("Company week targets already in kpi_defs stay there: Revenue $115,000, Wins 3, New opportunities 5, Close rate 30%.");
    renderBoard(result, goalsRes.data || [], notes);
    setStatus("Signed in as " + me.name + " · " + email);
  }

  document.getElementById("reload").addEventListener("click", function () { load(); });
  load();
})();
