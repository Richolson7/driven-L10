/* Driven CRM — Supabase access.
   Landon: this file only talks to the database. Screens live in crm-app.js.
   Each write is one row. The {error} from Supabase is always reported.
   A write that comes back with no row is treated as a failure too
   (row level security can hide a failed update). */
(function () {
  "use strict";

  var URL = "https://igaylyhkssahczubiztb.supabase.co";
  var ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlnYXlseWhrc3NhaGN6dWJpenRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyOTk3MzQsImV4cCI6MjA5Mjg3NTczNH0.iiRC320be1-kLa8tQoTupqWTu_8yTaEaJGVpdI4dnAo";

  // Read OAuth errors before the client starts. A rejected Google sign-in
  // comes back as error and error_description in the query or hash, and the
  // client may clear that URL while it looks for a session.
  (function stashAuthCallback() {
    var found = {};
    function take(text) {
      if (!text) return;
      text.split("&").forEach(function (pair) {
        if (!pair) return;
        var cut = pair.indexOf("=");
        var rawKey = cut < 0 ? pair : pair.slice(0, cut);
        var rawVal = cut < 0 ? "" : pair.slice(cut + 1);
        var key;
        try { key = decodeURIComponent(rawKey.replace(/\+/g, " ")); } catch (e) { return; }
        if (key !== "error" && key !== "error_description" && key !== "error_code") return;
        try { found[key] = decodeURIComponent(rawVal.replace(/\+/g, " ")); } catch (e2) { found[key] = rawVal; }
      });
    }
    var search = location.search.charAt(0) === "?" ? location.search.slice(1) : location.search;
    var hash = location.hash.charAt(0) === "#" ? location.hash.slice(1) : location.hash;
    take(search);
    take(hash);
    if (found.error || found.error_description) window.CRMAuthCallback = found;
  })();

  if (!window.supabase || !window.supabase.createClient) {
    document.addEventListener("DOMContentLoaded", function () {
      var text = "The Supabase library did not load. Check the network and reload.";
      var view = document.getElementById("view");
      var gate = document.getElementById("gateMsg");
      if (view) view.innerHTML = "<p class='banner'>" + text + "</p>";
      if (gate) gate.textContent = text;
    });
    return;
  }

  var db = window.supabase.createClient(URL, ANON, {
    auth: { detectSessionInUrl: true }
  });
  var hooks = { error: [], ok: [] };

  function explain(error) {
    if (!error) return "Unknown error";
    if (error.code === "PGRST116") {
      return "No row was saved. Sign-in may be required, or row level security blocked it.";
    }
    return error.message || error.details || error.hint || error.code || "Unknown error";
  }

  function reportError(what, error) {
    var text = "Could not save " + what + ": " + explain(error);
    hooks.error.forEach(function (fn) { fn(text, error, what); });
    return null;
  }

  function reportOk(what) {
    hooks.ok.forEach(function (fn) { fn(what); });
  }

  async function insert(table, row, what, opts) {
    var res = await db.from(table).insert(row).select().single();
    if (res.error && opts && opts.ignoreUnique && res.error.code === "23505") return { duplicate: true };
    if (res.error) return reportError(what, res.error);
    if (!res.data) return reportError(what, { message: "Supabase returned no row." });
    reportOk(what);
    return res.data;
  }

  async function update(table, id, row, what) {
    var res = await db.from(table).update(row).eq("id", id).select().single();
    if (res.error) return reportError(what, res.error);
    if (!res.data) return reportError(what, { message: "No row was updated." });
    reportOk(what);
    return res.data;
  }

  async function remove(table, id, what) {
    var res = await db.from(table).delete().eq("id", id).select();
    if (res.error) return reportError(what, res.error);
    if (!res.data || !res.data.length) return reportError(what, { message: "No row was deleted." });
    reportOk(what);
    return res.data[0];
  }

  async function selectAll(table) {
    return db.from(table).select("*");
  }

  window.CRMDB = {
    db: db,
    insert: insert,
    update: update,
    remove: remove,
    selectAll: selectAll,
    explain: explain,
    onError: function (fn) { hooks.error.push(fn); },
    onOk: function (fn) { hooks.ok.push(fn); }
  };
})();
