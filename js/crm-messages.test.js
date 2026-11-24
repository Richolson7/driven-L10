var assert = require("assert");
var Messages = require("./crm-messages.js");

var team = [
  { id: 3, name: "Patrick", email: "logistics@drivensol.com", active: true },
  { id: 1, name: "rich", email: "rich@drivensol.com", active: true },
  { id: 2, name: "Annie", email: "orders@drivensol.com", active: true },
  { id: 4, name: "Amber", email: "amber@drivensol.com", active: true },
  { id: 5, name: "Former", email: "old@drivensol.com", active: false },
  { id: 11, name: "A10", email: "a10@drivensol.com", active: true },
  { id: 10, name: "A2", email: "a2@drivensol.com", active: true }
];
var annie = team[2];

assert.deepStrictEqual(Messages.recipients(team).map(function (person) { return person.name; }), [
  "A2", "A10", "Amber", "Annie", "Patrick", "rich"
]);

var selectHtml = Messages.recipientSelectHtml(team);
assert.ok(selectHtml.indexOf("<option value=''>Everyone</option>") === 0);
assert.ok(selectHtml.indexOf("Former") < 0);
assert.ok(selectHtml.indexOf(">A2</option>") < selectHtml.indexOf(">A10</option>"));
assert.ok(selectHtml.indexOf(">Amber</option>") < selectHtml.indexOf(">Annie</option>"));

var rows = [
  { id: 1, from_user: "rich@drivensol.com", to_team_id: 2, body: "direct", read_at: null, created_at: "2026-11-24T18:05:00Z" },
  { id: 2, from_user: "rich@drivensol.com", to_team_id: null, body: "all hands", read_at: null, created_at: "2026-11-24T17:00:00Z" },
  { id: 3, from_user: "rich@drivensol.com", to_team_id: 4, body: "for amber", read_at: null, created_at: "2026-11-24T19:00:00Z" },
  { id: 4, from_user: "orders@drivensol.com", to_team_id: 1, body: "mine", read_at: null, created_at: "2026-11-24T20:00:00Z" },
  { id: 5, from_user: "amber@drivensol.com", to_team_id: 2, body: "already read", read_at: "2026-11-24T16:00:00Z", created_at: "2026-11-24T15:00:00Z" },
  { id: 6, from_user: "Rich@DrivenSol.com", to_team_id: 2, body: "case", read_at: null, created_at: "2026-11-24T18:06:00Z" }
];

var unread = Messages.unreadFor(rows, annie);
assert.deepStrictEqual(unread.map(function (row) { return row.id; }), [6, 1, 2]);
var selfNote = { id: 7, from_user: "orders@drivensol.com", to_team_id: 2, body: "note to self", read_at: null, created_at: "2026-11-24T21:00:00Z" };
assert.strictEqual(Messages.unreadFor(rows.concat([selfNote]), annie)[0].id, 7);
assert.strictEqual(Messages.senderName(rows[0], team), "rich");
assert.strictEqual(Messages.senderName(rows[5], team), "rich");

var winter = Messages.formatWhen("2026-11-24T18:05:00Z");
var summer = Messages.formatWhen("2026-07-15T17:30:00Z");
assert.ok(winter.indexOf("12:05") >= 0, winter);
assert.ok(winter.indexOf("CST") >= 0, winter);
assert.ok(summer.indexOf("12:30") >= 0, summer);
assert.ok(summer.indexOf("CDT") >= 0, summer);

var list = Messages.listHtml(rows, annie, team);
assert.ok(list.indexOf("all hands") >= 0);
assert.ok(list.indexOf("for amber") < 0);
assert.ok(list.indexOf("mine") < 0);
assert.ok(list.indexOf("already read") < 0);
assert.ok(list.indexOf("12:05") >= 0);
assert.ok(list.indexOf("data-act='tm-read'") >= 0);
assert.ok(list.indexOf("<textarea") < 0);

var training = Messages.trainingHtml();
assert.ok(training.indexOf("<h2>Team messages</h2>") >= 0);
assert.ok(training.indexOf("data-view='pipeline'") >= 0);
assert.ok(training.indexOf("Central time") >= 0);

var body = {};
Object.defineProperty(body, "value", {
  get: function () { throw new Error("compose was read during paint"); },
  set: function () { throw new Error("compose was written during paint"); }
});
var listEl = { innerHTML: "" };
var noteEl = { textContent: "" };
var badge = { hidden: true, textContent: "" };
var model = Messages.viewModel(rows, annie, team, "", {});
Messages.paint({ list: listEl, note: noteEl, badge: badge, body: body }, model);
assert.strictEqual(badge.hidden, false);
assert.strictEqual(badge.textContent, "3");
assert.ok(listEl.innerHTML.indexOf("direct") >= 0);
assert.strictEqual(noteEl.textContent, "");

var again = { innerHTML: listEl.innerHTML, replaced: 0 };
Object.defineProperty(again, "innerHTML", {
  get: function () { return listEl.innerHTML; },
  set: function () { again.replaced += 1; }
});
Messages.paint({ list: again, badge: badge }, model);
assert.strictEqual(again.replaced, 0);

var sel = { value: "4", innerHTML: "", dataset: {}, options: [] };
Messages.paintRecipients(sel, team, { focused: true });
assert.strictEqual(sel.innerHTML, "");
Messages.paintRecipients(sel, team, { focused: false });
assert.ok(sel.innerHTML.indexOf("Everyone") >= 0);
assert.strictEqual(sel.value, "");
sel.value = "4";
sel.options = [{ value: "" }, { value: "4" }, { value: "2" }];
Messages.paintRecipients(sel, team.concat([{ id: 12, name: "Zoe", email: "zoe@drivensol.com", active: true }]), { focused: false });
assert.strictEqual(sel.value, "4");
assert.ok(sel.innerHTML.indexOf("Zoe") >= 0);

assert.strictEqual(Messages.applyPending([{ id: 2, read_at: null, body: "all hands" }], { 2: "2026-11-24T18:10:00Z" })[0].read_at, "2026-11-24T18:10:00Z");
assert.strictEqual(Messages.unreadFor(Messages.applyPending(rows, { 2: "2026-11-24T18:10:00Z" }), annie).some(function (row) { return row.id === 2; }), false);

function mockMessages(session, seed) {
  var stored = (seed || []).map(function (row) { return Object.assign({}, row); });
  var seq = stored.reduce(function (max, row) { return Math.max(max, +row.id || 0); }, 0);
  var calls = [];
  function email(value) { return String(value || "").trim().toLowerCase(); }
  function visible(row) {
    return row.to_team_id == null || String(row.to_team_id) === String(session.teamId) || email(row.from_user) === email(session.email);
  }
  function canUpdate(row) {
    if (String(row.to_team_id) === String(session.teamId)) return true;
    return row.to_team_id == null && email(row.from_user) !== email(session.email);
  }
  function api(op) {
    var q = { op: op, eq: {}, payload: null, single: false };
    var b = {
      select: function () { return b; },
      insert: function (row) { q.op = "insert"; q.payload = Object.assign({}, row); return b; },
      update: function (row) { q.op = "update"; q.payload = Object.assign({}, row); return b; },
      eq: function (key, value) { q.eq[key] = value; return b; },
      order: function () { return b; },
      limit: function () { return b; },
      single: function () { q.single = true; return run(); },
      then: function (ok, bad) { return run().then(ok, bad); }
    };
    function run() {
      calls.push(JSON.parse(JSON.stringify(q)));
      if (q.op === "select") {
        var data = stored.filter(visible).filter(function (row) {
          return Object.keys(q.eq).every(function (key) { return String(row[key]) === String(q.eq[key]); });
        });
        data.sort(function (a, b) { return String(b.created_at || "").localeCompare(String(a.created_at || "")); });
        return Promise.resolve({ data: data, error: null });
      }
      if (q.op === "insert") {
        if (email(q.payload.from_user) !== email(session.email)) {
          return Promise.resolve({ data: null, error: { message: "from_user must be you" } });
        }
        if (!String(q.payload.body || "").trim()) {
          return Promise.resolve({ data: null, error: { message: "body required" } });
        }
        var extra = Object.keys(q.payload).filter(function (key) {
          return ["from_user", "to_team_id", "body", "deal_id", "company_id"].indexOf(key) < 0;
        });
        if (extra.length) return Promise.resolve({ data: null, error: { message: "unexpected " + extra.join(",") } });
        seq += 1;
        var saved = {
          id: seq,
          created_at: "2026-11-24T18:05:00Z",
          from_user: q.payload.from_user,
          to_team_id: q.payload.to_team_id == null ? null : q.payload.to_team_id,
          body: q.payload.body,
          read_at: null,
          deal_id: q.payload.deal_id || null,
          company_id: q.payload.company_id || null
        };
        stored.push(saved);
        return Promise.resolve({ data: q.single ? saved : [saved], error: null });
      }
      if (q.op === "update") {
        var keys = Object.keys(q.payload);
        if (keys.length !== 1 || keys[0] !== "read_at") {
          return Promise.resolve({ data: null, error: { message: "read_at only" } });
        }
        var hit = stored.filter(function (row) { return String(row.id) === String(q.eq.id); });
        if (!hit.length || !canUpdate(hit[0])) {
          return Promise.resolve({ data: null, error: { message: "not allowed" } });
        }
        hit[0].read_at = q.payload.read_at;
        return Promise.resolve({ data: q.single ? hit[0] : hit, error: null });
      }
      return Promise.resolve({ data: null, error: { message: "bad op" } });
    }
    return b;
  }
  return {
    calls: calls,
    rows: stored,
    from: function (table) {
      assert.strictEqual(table, "crm_team_messages");
      return api("select");
    }
  };
}

function failTable() {
  var error = { code: "PGRST205", message: "Could not find the table public.crm_team_messages in the schema cache" };
  var p = Promise.resolve({ data: null, error: error });
  ["select", "insert", "update", "eq", "order", "limit"].forEach(function (key) {
    p[key] = function () { return p; };
  });
  p.single = function () { return p; };
  return { from: function () { return p; } };
}

Promise.resolve()
  .then(function () {
    var db = mockMessages({ email: "orders@drivensol.com", teamId: 2 }, rows.map(function (row) { return Object.assign({}, row); }));
    return Messages.load(db).then(function (res) {
      assert.strictEqual(res.error, null);
      assert.deepStrictEqual(res.data.map(function (row) { return row.id; }), [4, 6, 1, 2, 5]);
      assert.ok(res.data.every(function (row) { return row.id !== 3; }));
      return Messages.send(db, { from_user: "orders@drivensol.com", to_team_id: null, body: "Hello team" });
    }).then(function (sent) {
      assert.strictEqual(sent.error, null);
      assert.strictEqual(sent.data.to_team_id, null);
      assert.strictEqual(sent.data.body, "Hello team");
      assert.strictEqual(sent.data.from_user, "orders@drivensol.com");
      assert.strictEqual(sent.data.read_at, null);
      return Messages.send(db, { from_user: "rich@drivensol.com", to_team_id: 2, body: "spoof" });
    }).then(function (spoof) {
      assert.ok(spoof.error);
      assert.strictEqual(spoof.error.message, "from_user must be you");
      return Messages.send(db, { from_user: "orders@drivensol.com", to_team_id: 1, body: "For Rich", deal_id: 9, company_id: 4 });
    }).then(function (direct) {
      assert.strictEqual(direct.data.to_team_id, 1);
      assert.strictEqual(direct.data.deal_id, 9);
      assert.strictEqual(direct.data.company_id, 4);
      return Messages.markRead(db, 6, "2026-11-24T18:10:00.000Z");
    }).then(function (marked) {
      assert.strictEqual(marked.error, null);
      assert.strictEqual(marked.data.read_at, "2026-11-24T18:10:00.000Z");
      assert.strictEqual(marked.data.body, "case");
      var update = db.calls.filter(function (call) { return call.op === "update"; }).pop();
      assert.deepStrictEqual(update.payload, { read_at: "2026-11-24T18:10:00.000Z" });
      return Messages.markRead(db, 3, "2026-11-24T18:11:00.000Z");
    }).then(function (blocked) {
      assert.ok(blocked.error);
      assert.strictEqual(blocked.error.message, "not allowed");
      var amberNote = db.rows.find(function (row) { return row.id === 3; });
      assert.strictEqual(amberNote.read_at, null);
      return Messages.markRead(db, 2, "2026-11-24T18:12:00.000Z");
    }).then(function (everyone) {
      assert.strictEqual(everyone.error, null);
      assert.strictEqual(everyone.data.read_at, "2026-11-24T18:12:00.000Z");
      return Messages.load(db);
    }).then(function (after) {
      var left = Messages.unreadFor(after.data, annie);
      assert.deepStrictEqual(left.map(function (row) { return row.body; }), ["direct"]);
    });
  })
  .then(function () {
    assert.strictEqual(Messages.missingTable({ code: "PGRST205", message: "Could not find the table public.crm_team_messages in the schema cache" }), true);
    return Messages.load(failTable());
  })
  .then(function (res) {
    assert.strictEqual(Messages.missingTable(res.error), true);
    assert.ok(Messages.MISSING.indexOf("crm_team_messages") >= 0);
    console.log("crm-messages tests passed");
  })
  .catch(function (err) {
    console.error(err);
    process.exit(1);
  });
