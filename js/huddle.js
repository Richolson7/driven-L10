/* Morning huddle screen. Numbers come from HuddleScore.
   CRM tables are read only after a team sign-in.
   Loads per day are one saved snapshot at 10:00 AM CT. This file sends no email or text. */
(function () {
  "use strict";
  var Score = window.HuddleScore;
  var Card = window.HuddleScorecard;
  var Tasks = window.HuddleTasks;
  var board = document.getElementById("board");
  var statusEl = document.getElementById("status");
  if (!Score || !Card || !Tasks || !window.CRMDB || !board) {
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

  var shell = document.getElementById("shell");
  var gate = document.getElementById("authGate");
  var signOutBtn = document.getElementById("signOut");
  var held = false;
  var captureTimer = null;

  function clearCapture() {
    if (captureTimer) { clearTimeout(captureTimer); captureTimer = null; }
  }
  function armCapture() {
    clearCapture();
    if (!me) return;
    var wait = Card.plan(new Date()).waitMs;
    if (wait == null || wait <= 0 || wait > 16 * 60 * 60 * 1000) return;
    captureTimer = setTimeout(function () {
      captureTimer = null;
      if (!me || !Card.plan(new Date()).capture) return;
      load();
    }, wait);
  }
  function snapshotProblem(error) {
    var msg = CRMDB.explain(error);
    var code = error && error.code || "";
    if (code === "PGRST205" || code === "42P01" || /huddle_snapshots/i.test(msg) || /schema cache/i.test(msg) || /does not exist/i.test(msg)) {
      return "The snapshot table is not in the database yet. Apply supabase/migrations/20261105160000_huddle_snapshots.sql on the Driven project. Until then loads per day stay blank. Live numbers were not used.";
    }
    return "The saved snapshot did not load. " + msg + " Live numbers were not used.";
  }
  function payloadOf(row) {
    if (!row) return null;
    var payload = row.payload;
    if (typeof payload === "string") {
      try { payload = JSON.parse(payload); } catch (e) { return null; }
    }
    if (!payload || typeof payload !== "object") return null;
    return payload;
  }
  async function readSnapshot(day) {
    var res = await CRMDB.db.from("huddle_snapshots").select("huddle_day,payload,captured_for").eq("huddle_day", day).maybeSingle();
    return { error: res.error || null, payload: payloadOf(res.data) };
  }
  async function resolveScorecard(result, deals, wonKeys) {
    var decision = Card.plan(new Date());
    var read = await readSnapshot(decision.displayDay);
    if (read.error) return { snapshot: null, huddleDay: decision.displayDay, note: snapshotProblem(read.error) };
    if (read.payload) return { snapshot: read.payload, huddleDay: decision.displayDay, note: "" };
    if (!decision.capture || result.today !== decision.displayDay) {
      return { snapshot: null, huddleDay: decision.displayDay, note: "No snapshot was saved at 10:00 AM CT for this huddle. Refresh loads the saved snapshot only. It does not recompute the tiles." };
    }
    var dash = await CRMDB.db.from("dashboard_data").select('week_data,"Week Of"').eq("id", "driven_cmd").maybeSingle();
    if (dash.error || !Card.plan(new Date()).capture) {
      var why = dash.error ? CRMDB.explain(dash.error) : "Huddle start passed before the snapshot could be saved.";
      return { snapshot: null, huddleDay: decision.displayDay, note: "No snapshot was saved. " + why + " The tiles were left blank." };
    }
    var row = dash.data || {};
    var payload = Card.build({
      today: result.today,
      yesterday: result.yesterday,
      weekStart: result.weekStart,
      weekEnd: result.weekEnd,
      weekDays: result.weekDays,
      lastWeek: result.lastWeek,
      deals: deals,
      wonStageKeys: wonKeys,
      team: result.team && result.team.cells,
      weekData: row.week_data || {},
      weekOf: row["Week Of"] || row.week_of || ""
    });
    var saved = await CRMDB.db.from("huddle_snapshots").insert({
      huddle_day: decision.displayDay,
      captured_for: Card.huddleStart(decision.displayDay).toISOString(),
      payload: payload
    }).select("huddle_day,payload,captured_for").single();
    if (saved.error) {
      if (saved.error.code === "23505") {
        var again = await readSnapshot(decision.displayDay);
        if (again.payload) return { snapshot: again.payload, huddleDay: decision.displayDay, note: "" };
      }
      return { snapshot: null, huddleDay: decision.displayDay, note: "The snapshot could not be saved, so the tiles were left blank. " + CRMDB.explain(saved.error) };
    }
    var stored = payloadOf(saved.data);
    if (!stored) return { snapshot: null, huddleDay: decision.displayDay, note: "The snapshot did not save a row, so the tiles were left blank." };
    return { snapshot: stored, huddleDay: decision.displayDay, note: "" };
  }

  function showGate() {
    me = null;
    clearCapture();
    if (shell) shell.hidden = true;
    if (gate) gate.hidden = false;
    if (signOutBtn) signOutBtn.hidden = true;
    if (board) board.innerHTML = "";
    setStatus("");
  }
  function showShell() {
    if (gate) gate.hidden = true;
    if (shell) shell.hidden = false;
    if (signOutBtn) signOutBtn.hidden = false;
  }

  function renderBoard(result, goals, notes, taskSummary, taskNote, scorecard) {
    var head = Score.METRICS.map(function (metric) {
      return "<th>" + esc(METRIC_LABEL[metric]) + "<small>Yesterday</small></th><th>" + esc(METRIC_LABEL[metric]) + "<small>Week</small></th>";
    }).join("");
    var weekLabel = result.lastWeek ? "Last week" : "Week to date";
    var html = "<section class='sales' id='huddleSales' aria-label='Sales'>";
    html += "<h2>Sales</h2>";
    html += Card.sectionHtml(scorecard);
    html += "<p class='range'>Yesterday " + esc(pretty(result.yesterday)) + " · " + esc(weekLabel) + " " + esc(pretty(result.weekStart)) + " – " + esc(pretty(result.weekEnd)) + " (" + result.weekDays + " weekday" + (result.weekDays === 1 ? "" : "s") + ")</p>";
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
    html += "<button type='submit'>Save goals</button></form></details></section>";
    html += Tasks.sectionHtml(taskSummary, taskNote);
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
    if (window.CRMAuth && CRMAuth.isRecovery()) { showGate(); return; }
    setStatus("Checking sign-in…");
    var sessionRes = await CRMDB.db.auth.getSession();
    var session = sessionRes.data && sessionRes.data.session;
    var email = session && session.user && session.user.email;
    if (!email) { showGate(); return; }
    var pattern = email.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
    var teamRes = await CRMDB.db.from("crm_team").select("id,name,email,team,active").ilike("email", pattern).eq("active", true).limit(2);
    var person = !teamRes.error && (teamRes.data || []).find(function (row) {
      return String(row.email || "").toLowerCase() === email.toLowerCase() && row.active !== false;
    });
    if (teamRes.error || !person) {
      var why = teamRes.error
        ? ("Could not confirm " + email + " on the team. " + CRMDB.explain(teamRes.error))
        : (email + " is not an active Driven team address. No CRM data was loaded.");
      held = true;
      if (window.CRMAuth) CRMAuth.hold(true);
      try { await CRMDB.db.auth.signOut(); } catch (e) { /* still hide the numbers */ }
      showGate();
      if (window.CRMAuth) CRMAuth.setMessage(why, "bad");
      held = false;
      if (window.CRMAuth) CRMAuth.hold(false);
      return;
    }
    me = person;
    showShell();
    setStatus("Loading yesterday…");
    var goalsRes = await CRMDB.db.from("huddle_goals").select("id,company,scope,rep,metric,period,target,active").eq("company", "driven").eq("active", true);
    if (goalsRes.error) {
      board.innerHTML = "<p class='lead'>The huddle goals are not in the database yet. Apply 20261027130000_huddle_goals.sql, then reload. Nothing was loaded from deals or activity.</p>";
      setStatus(CRMDB.explain(goalsRes.error), true);
      armCapture();
      return;
    }
    var since = new Date();
    since.setDate(since.getDate() - 21);
    var today = Score.chicagoToday(new Date());
    var results = await Promise.all([
      CRMDB.db.from("crm_activity").select("kind,by_user,at").gte("at", since.toISOString()).limit(2000),
      CRMDB.db.from("crm_quotes").select("id,deal_id,rep,sent_date").not("sent_date", "is", null).limit(2000),
      CRMDB.db.from("crm_deals").select("id,sales_rep,stage,stage_changed_at,price_per_unit,quantity,quote_sent_date,est_ship_date,est_delivery_date,custom").limit(2000),
      CRMDB.db.from("crm_stages").select("key,position,active").eq("active", true).order("position"),
      CRMDB.db.from("driven_outreach_tally").select("day,owner,dials,emails").gte("day", since.toISOString().slice(0, 10)).limit(500),
      CRMDB.db.from("driven_tasks").select("id,text,owner,due,done").limit(2000)
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
    var taskRows = [];
    var taskNote = "";
    if (results[5].error) taskNote = "Tasks did not load. " + CRMDB.explain(results[5].error);
    else {
      taskRows = results[5].data || [];
      if (taskRows.length >= 2000) taskNote = "The task list hit 2,000 rows, so some tasks may be missing from these counts.";
    }
    var taskSummary = results[5].error ? null : Tasks.summarize(taskRows, today);
    var result = Score.score({
      today: today,
      goals: goalsRes.data || [],
      activity: activity,
      quotes: quotes,
      deals: deals,
      wonStageKeys: wonKeys,
      tally: tally
    });
    if (result.unmatched) notes.push(result.unmatched + " touch" + (result.unmatched === 1 ? "" : "es") + " had a name that is not Rich or Landon, so they are not in the rep rows.");
    notes.push("Green is at or above the goal. Red is below. A dash means that column has no goal.");
    var scorecard = await resolveScorecard(result, deals, wonKeys);
    renderBoard(result, goalsRes.data || [], notes, taskSummary, taskNote, scorecard);
    armCapture();
    setStatus("Signed in as " + me.name + " · " + email);
  }

  document.getElementById("reload").addEventListener("click", function () { load(); });
  if (signOutBtn) signOutBtn.addEventListener("click", async function () {
    held = true;
    if (window.CRMAuth) CRMAuth.hold(true);
    try { await CRMDB.db.auth.signOut(); } catch (e) { /* still show the gate */ }
    showGate();
    if (window.CRMAuth) CRMAuth.setMessage("Signed out.");
    held = false;
    if (window.CRMAuth) CRMAuth.hold(false);
  });
  if (!window.CRMAuth) {
    showGate();
    board.innerHTML = "<p class='lead'>The sign-in script did not load. Reload the page.</p>";
    return;
  }
  var wait = document.getElementById("authWait");
  if (gate) gate.hidden = true;
  if (wait) wait.hidden = false;
  CRMAuth.ready().then(function (session) {
    if (wait) wait.hidden = true;
    CRMAuth.bind({
      place: "huddle",
      isHeld: function () { return held; },
      onSession: function () { load(); },
      onSignedOut: function () { if (!held) showGate(); },
      onRecovery: function () { showGate(); }
    });
    if (session) load();
    else showGate();
  }).catch(function () {
    if (wait) wait.hidden = true;
    showGate();
  });
})();
