/* Team notes on the CRM home screen.
   The compose box is not inside the pipeline markup, and a refresh writes
   only the unread list and the nav count. Typing does not rebuild the page.
   This file does not open a network connection by itself. crm-app.js passes
   the signed-in Supabase client in. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.CRMMessages = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var TABLE = "crm_team_messages";
  var POLL_MS = 20000;
  var MISSING = "Team messages are off until the crm_team_messages table is applied. Nothing was sent.";

  var state = {
    db: null,
    me: null,
    team: [],
    rows: [],
    note: "",
    home: false,
    toast: function () {},
    timer: null,
    pendingRead: {},
    bound: false
  };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function emailOf(person) {
    return String(person && person.email || "").trim().toLowerCase();
  }

  function cmpName(a, b) {
    return String(a == null ? "" : a).localeCompare(String(b == null ? "" : b), undefined, { numeric: true, sensitivity: "base" });
  }

  function missingTable(error) {
    if (!error) return false;
    var code = String(error.code || "");
    var msg = String(error.message || error.details || "");
    if (code === "42P01" || code === "PGRST205") return true;
    return /crm_team_messages/i.test(msg) && /schema cache|does not exist|could not find/i.test(msg);
  }

  function explain(error) {
    if (!error) return "Unknown error";
    if (missingTable(error)) return MISSING;
    return error.message || error.details || error.hint || error.code || "Unknown error";
  }

  function recipients(team) {
    return (team || []).filter(function (person) {
      return person && person.active !== false && person.name && person.id != null;
    }).slice().sort(function (a, b) { return cmpName(a.name, b.name); });
  }

  function senderName(row, team) {
    var email = String(row && row.from_user || "").trim().toLowerCase();
    var person = (team || []).find(function (member) {
      return email && emailOf(member) === email;
    });
    if (person && person.name) return person.name;
    return row && row.from_user ? row.from_user : "Teammate";
  }

  function formatWhen(value) {
    if (!value) return "";
    var when = new Date(value);
    if (isNaN(when.getTime())) return "";
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short"
    }).format(when);
  }

  function sentBy(row, me) {
    var mine = emailOf(me);
    if (!mine) return false;
    return String(row && row.from_user || "").trim().toLowerCase() === mine;
  }

  function applyPending(rows, pending) {
    var marks = pending || {};
    return (rows || []).map(function (row) {
      var mark = marks[row.id];
      if (!mark || row.read_at) return row;
      var copy = {};
      Object.keys(row).forEach(function (key) { copy[key] = row[key]; });
      copy.read_at = mark;
      return copy;
    });
  }

  function unreadFor(rows, me) {
    return applyPending(rows, {}).filter(function (row) {
      if (!row || row.read_at || !me) return false;
      var direct = row.to_team_id != null && row.to_team_id !== "" && String(row.to_team_id) === String(me.id);
      if (direct) return true;
      var everyone = row.to_team_id == null || row.to_team_id === "";
      return everyone && !sentBy(row, me);
    }).slice().sort(function (a, b) {
      return String(b.created_at || "").localeCompare(String(a.created_at || ""));
    });
  }

  function listHtml(rows, me, team) {
    var unread = unreadFor(rows, me);
    if (!me) return "<p class='empty'>Sign in to see messages.</p>";
    if (!unread.length) return "<p class='empty'>No unread messages.</p>";
    return unread.map(function (row) {
      return "<button type='button' class='tm-row' data-act='tm-read' data-id='" + esc(row.id) + "'>" +
        "<span class='tm-top'><span class='tm-who'>" + esc(senderName(row, team)) + "</span>" +
        "<span class='log'>" + esc(formatWhen(row.created_at)) + "</span></span>" +
        "<span class='tm-body'>" + esc(row.body) + "</span></button>";
    }).join("");
  }

  function recipientSelectHtml(team) {
    var options = "<option value=''>Everyone</option>";
    recipients(team).forEach(function (person) {
      options += "<option value='" + esc(person.id) + "'>" + esc(person.name) + "</option>";
    });
    return options;
  }

function viewModel(rows, me, team, note, pending) {
  var visible = applyPending(rows, pending);
  var unread = unreadFor(visible, me);
  var blocked = !!(note && !(rows && rows.length));
  var list = blocked ? "<p class='log'>" + esc(note) + "</p>" : listHtml(visible, me, team);
  return { listHtml: list, unread: blocked ? 0 : unread.length, note: blocked ? "" : (note || "") };
}

  function trainingHtml() {
    return "<div class='sect' id='training-team-messages' style='margin-top:28px'><h2>Team messages</h2>" +
      "<p class='lead'>Short notes to one teammate, or to everyone, on the Pipeline home screen. They stay in the CRM.</p>" +
      "<div class='panel' style='padding:14px'><ol class='crm-steps'>" +
      "<li><b>Unread sits at the top of Pipeline.</b> A message to you, or to Everyone, shows the sender and the time in Central time. The Pipeline tab shows how many are unread.</li>" +
      "<li><b>Click a message to mark it read.</b> That records the time you opened it. It does not delete the note.</li>" +
      "<li><b>Send from the same panel.</b> Pick a teammate (names A to Z) or Everyone, write the note, and send. Nothing is emailed or texted.</li>" +
      "<li><b>You see notes to you, notes to Everyone, and notes you sent.</b> A note addressed only to someone else is not in your list.</li>" +
      "</ol><p style='margin:8px 0 0'><button class='ghost' type='button' data-act='go-view' data-view='pipeline'>Open Pipeline</button></p></div></div>";
  }

  function paint(parts, model) {
    if (!parts || !model) return;
    if (parts.list && parts.list.innerHTML !== model.listHtml) parts.list.innerHTML = model.listHtml;
    if (parts.note && parts.note.textContent !== model.note) parts.note.textContent = model.note;
    if (parts.badge) {
      parts.badge.hidden = !model.unread;
      parts.badge.textContent = model.unread ? String(model.unread) : "";
    }
  }

  function paintRecipients(sel, team, opts) {
    if (!sel || (opts && opts.focused)) return;
    var html = recipientSelectHtml(team);
    var sig = recipients(team).map(function (person) { return person.id + ":" + person.name; }).join("|");
    if (sel.dataset && sel.dataset.sig === sig) return;
    var current = sel.value;
    sel.innerHTML = html;
    if (sel.dataset) sel.dataset.sig = sig;
    var kept = false;
    if (sel.options) {
      for (var i = 0; i < sel.options.length; i++) {
        if (sel.options[i].value === current) kept = true;
      }
    }
    sel.value = kept ? current : "";
  }

  function els() {
    if (typeof document === "undefined") return {};
    return {
      root: document.getElementById("teamMessages"),
      list: document.getElementById("tmList"),
      note: document.getElementById("tmNote"),
      to: document.getElementById("tmTo"),
      body: document.getElementById("tmBody"),
      badge: document.getElementById("msgCount"),
      form: document.getElementById("tmForm")
    };
  }

  function paintNow() {
    var parts = els();
    var model = viewModel(state.rows, state.me, state.team, state.note, state.pendingRead);
    paint(parts, model);
    if (parts.to) {
      paintRecipients(parts.to, state.team, {
        focused: typeof document !== "undefined" && document.activeElement === parts.to
      });
    }
    if (parts.root) parts.root.hidden = !state.home || !state.me;
  }

  function load(db) {
    return db.from(TABLE)
      .select("id,created_at,from_user,to_team_id,body,read_at,deal_id,company_id")
      .order("created_at", { ascending: false })
      .limit(200);
  }

  function send(db, row) {
    return db.from(TABLE)
      .insert({
        from_user: row.from_user,
        to_team_id: row.to_team_id == null || row.to_team_id === "" ? null : row.to_team_id,
        body: row.body,
        deal_id: row.deal_id || null,
        company_id: row.company_id || null
      })
      .select("id,created_at,from_user,to_team_id,body,read_at,deal_id,company_id")
      .single();
  }

  function markRead(db, id, at) {
    return db.from(TABLE).update({ read_at: at }).eq("id", id).select("id,read_at").single();
  }

  var refreshGen = 0;
  async function refresh() {
    if (!state.db || !state.me) return;
    if (typeof document !== "undefined" && document.hidden) return;
    var gen = ++refreshGen;
    var res;
    try { res = await load(state.db); } catch (err) { res = { data: null, error: { message: err && err.message || "Could not load messages" } }; }
    if (gen !== refreshGen) return;
    if (res.error) {
      if (missingTable(res.error)) {
        state.rows = [];
        state.note = MISSING;
      } else if (!state.rows.length) {
        state.note = "Could not load team messages.";
      }
    } else {
      state.rows = res.data || [];
      state.note = "";
      Object.keys(state.pendingRead).forEach(function (id) {
        var row = state.rows.find(function (item) { return String(item.id) === String(id); });
        if (row && row.read_at) delete state.pendingRead[id];
      });
    }
    paintNow();
  }

  async function submit() {
    var parts = els();
    var text = String(parts.body && parts.body.value || "").trim();
    if (!text) {
      state.note = "Write a message first.";
      paintNow();
      return;
    }
    if (!state.db || !emailOf(state.me)) {
      state.toast("Sign in again before sending.", "bad");
      return;
    }
    var toValue = parts.to ? parts.to.value : "";
    var res;
    try {
      res = await send(state.db, {
        from_user: state.me.email,
        to_team_id: toValue ? +toValue : null,
        body: text
      });
    } catch (err) {
      res = { error: { message: err && err.message || "Could not send" } };
    }
    if (res.error) {
      state.toast(explain(res.error), "bad");
      return;
    }
    if (parts.body) parts.body.value = "";
    state.note = "";
    if (res.data) state.rows = [res.data].concat(state.rows.filter(function (row) { return String(row.id) !== String(res.data.id); }));
    paintNow();
    state.toast("Message sent.");
    refresh();
  }

  async function mark(id) {
    if (!state.db || id == null || id === "") return;
    var at = new Date().toISOString();
    state.pendingRead[id] = at;
    paintNow();
    var res;
    try { res = await markRead(state.db, id, at); } catch (err) { res = { error: { message: err && err.message || "Could not update" } }; }
    if (res.error) {
      delete state.pendingRead[id];
      paintNow();
      state.toast(explain(res.error), "bad");
      return;
    }
    state.rows.forEach(function (row) {
      if (String(row.id) === String(id)) row.read_at = at;
    });
    delete state.pendingRead[id];
    paintNow();
  }

  function bind() {
    if (state.bound || typeof document === "undefined") return;
    var form = document.getElementById("tmForm");
    if (!form) return;
    state.bound = true;
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      submit();
    });
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) refresh();
    });
  }

  function sync(ctx) {
    ctx = ctx || {};
    if (ctx.me !== undefined) state.me = ctx.me;
    if (ctx.team) state.team = ctx.team;
    if (ctx.home != null) state.home = !!ctx.home;
    paintNow();
  }

  function start(db, toast) {
    state.db = db;
    if (toast) state.toast = toast;
    bind();
    if (state.timer) clearInterval(state.timer);
    state.timer = setInterval(refresh, POLL_MS);
    return refresh();
  }

  function stop() {
    if (state.timer) clearInterval(state.timer);
    state.timer = null;
    state.db = null;
    state.me = null;
    state.rows = [];
    state.note = "";
    state.home = false;
    state.pendingRead = {};
    refreshGen += 1;
    if (typeof document !== "undefined") {
      var body = document.getElementById("tmBody");
      var sel = document.getElementById("tmTo");
      if (body) body.value = "";
      if (sel) {
        sel.innerHTML = "";
        sel.value = "";
        if (sel.dataset) sel.dataset.sig = "";
      }
    }
    paintNow();
  }

  return {
    TABLE: TABLE,
    POLL_MS: POLL_MS,
    MISSING: MISSING,
    esc: esc,
    missingTable: missingTable,
    recipients: recipients,
    senderName: senderName,
    formatWhen: formatWhen,
    unreadFor: unreadFor,
    applyPending: applyPending,
    listHtml: listHtml,
    recipientSelectHtml: recipientSelectHtml,
    viewModel: viewModel,
    trainingHtml: trainingHtml,
    paint: paint,
    paintRecipients: paintRecipients,
    load: load,
    send: send,
    markRead: markRead,
    mark: mark,
    refresh: refresh,
    sync: sync,
    start: start,
    stop: stop,
    submit: submit
  };
});
