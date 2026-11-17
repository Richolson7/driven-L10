/* Contact edit on a company page.
   The save sends only fields that changed. A blank is left out so a
   stored name, role, email, or phone is not replaced with nothing.
   role is the title shown beside the contact name.
   This file does not talk to the database. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.CRMContactEdit = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  var FIELDS = ["name", "role", "email", "phone"];

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function trim(v) {
    return String(v == null ? "" : v).trim();
  }
  /* Columns to write. Unchanged fields are omitted. A blank is omitted
     even when it differs, so the stored value stays. */
  function patch(current, next) {
    var row = {};
    var cur = current || {};
    var nxt = next || {};
    FIELDS.forEach(function (key) {
      var value = trim(nxt[key]);
      if (!value || value === trim(cur[key])) return;
      row[key] = value;
    });
    return row;
  }
  function omittedBlank(current, next) {
    var cur = current || {};
    var nxt = next || {};
    return FIELDS.some(function (key) {
      return trim(cur[key]) && !trim(nxt[key]);
    });
  }
  function field(id, label, value) {
    return "<div class='f'><label for='" + id + "'>" + label + "</label><input id='" + id + "' value='" + esc(value || "") + "'></div>";
  }
  function textOk(id, on) {
    return "<label class='switch' style='display:inline-flex'><input type='checkbox' data-textok='" + id + "'" + (on ? " checked" : "") + "> OK to text</label>";
  }
  function row(contact, opts) {
    var x = contact || {};
    var on = !!(opts && opts.textOk);
    if (opts && opts.editing) {
      return "<li><div class='fields'>" +
        field("ecName", "Name", x.name) +
        field("ecRole", "Role", x.role) +
        field("ecEmail", "Email", x.email) +
        field("ecPhone", "Phone", x.phone) +
        "</div><div style='display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px'>" +
        "<button class='primary' data-act='save-contact' data-id='" + x.id + "'>Save</button>" +
        "<button class='ghost' data-act='cancel-contact' data-id='" + x.id + "'>Cancel</button>" +
        textOk(x.id, on) +
        " <button class='linkbtn' data-act='del-contact' data-id='" + x.id + "'>Remove</button></div></li>";
    }
    return "<li><b>" + esc(x.name) + "</b> · " + esc(x.role) + "<br><span class='log'>" + esc(x.email) + (x.phone ? " · " + esc(x.phone) : "") + "</span> " + textOk(x.id, on) + " <button class='linkbtn' data-act='edit-contact' data-id='" + x.id + "'>Edit</button> <button class='linkbtn' data-act='del-contact' data-id='" + x.id + "'>Remove</button></li>";
  }

  return {
    patch: patch,
    omittedBlank: omittedBlank,
    row: row
  };
});
