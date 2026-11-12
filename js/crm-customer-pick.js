/* Searchable customer and vendor picker.
   Native selects inside the deal dialog do not open reliably, so this
   list is drawn above the dialog. Names are A to Z, ignoring case. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.CRMCustomerPick = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function sorted(list) {
    return (list || []).slice().sort(function (a, b) {
      return String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base", numeric: true });
    });
  }
  function live(list) {
    return (list || []).filter(function (c) { return !c.archived_at && !c.archived; });
  }
  function customers(companies) {
    return sorted(live(companies).filter(function (c) { return c.kind !== "vendor"; }));
  }
  function vendors(companies) {
    return sorted(live(companies).filter(function (c) { return c.kind === "vendor"; }));
  }
  function matches(name, q) {
    var query = String(q || "").trim().toLowerCase();
    if (!query) return true;
    return String(name || "").toLowerCase().indexOf(query) >= 0;
  }
  function field(opts) {
    opts = opts || {};
    var list = opts.list || [];
    var selected = null;
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].id) === String(opts.selected)) selected = list[i];
    }
    var json = JSON.stringify(list.map(function (c) { return { id: c.id, name: c.name || "" }; })).replace(/</g, "\\u003c");
    var idAttr = opts.id ? " id='" + esc(opts.id) + "'" : "";
    var h = "<div class='pick' data-pick>";
    h += "<input class='pick-q' type='search' autocomplete='off' role='combobox' aria-expanded='false' aria-autocomplete='list' placeholder='" + esc(opts.placeholder || "Search") + "' value='" + esc(selected ? selected.name : "") + "'>";
    h += "<input type='hidden'" + idAttr + (opts.attr ? " " + opts.attr : "") + " value='" + (selected ? esc(selected.id) : "") + "'>";
    h += "<div class='pick-list' hidden role='listbox'></div>";
    h += "<textarea class='pick-data' hidden readonly>" + esc(json) + "</textarea>";
    h += "</div>";
    return h;
  }
  function listOf(pick) {
    var node = pick.querySelector(".pick-data");
    if (!node) return [];
    try { return JSON.parse(node.textContent || "[]"); } catch (e) { return []; }
  }
  function paint(pick, query) {
    var box = pick.querySelector(".pick-list");
    var rows = listOf(pick).filter(function (c) { return matches(c.name, query); });
    box.innerHTML = rows.length
      ? rows.map(function (c) { return "<button type='button' class='pick-opt' role='option' data-pick-id='" + esc(c.id) + "'>" + esc(c.name) + "</button>"; }).join("")
      : "<p class='empty'>No matches.</p>";
    var q = pick.querySelector(".pick-q");
    var rect = q.getBoundingClientRect();
    box.style.position = "fixed";
    box.style.left = Math.max(8, rect.left) + "px";
    box.style.top = (rect.bottom + 4) + "px";
    box.style.width = Math.max(rect.width, 240) + "px";
    box.hidden = false;
    q.setAttribute("aria-expanded", "true");
  }
  function choose(pick, id, name) {
    var hidden = pick.querySelector("input[type='hidden']");
    var q = pick.querySelector(".pick-q");
    var box = pick.querySelector(".pick-list");
    hidden.value = id == null ? "" : String(id);
    q.value = name || "";
    box.hidden = true;
    q.setAttribute("aria-expanded", "false");
    hidden.dispatchEvent(new Event("change", { bubbles: true }));
  }
  function bind(root) {
    if (!root || root.__customerPickBound) return;
    root.__customerPickBound = 1;
    root.addEventListener("input", function (e) {
      var q = e.target.closest && e.target.closest(".pick-q");
      if (!q) return;
      var pick = q.closest("[data-pick]");
      var hidden = pick.querySelector("input[type='hidden']");
      var selected = listOf(pick).filter(function (c) { return String(c.id) === String(hidden.value); })[0];
      if (!selected || selected.name !== q.value) hidden.value = "";
      paint(pick, q.value);
    });
    root.addEventListener("focusin", function (e) {
      var q = e.target.closest && e.target.closest(".pick-q");
      if (!q) return;
      paint(q.closest("[data-pick]"), "");
      if (q.select) q.select();
    });
    root.addEventListener("mousedown", function (e) {
      if (e.target.closest && e.target.closest(".pick-opt")) e.preventDefault();
    });
    root.addEventListener("click", function (e) {
      var opt = e.target.closest && e.target.closest(".pick-opt");
      if (!opt) return;
      e.preventDefault();
      choose(opt.closest("[data-pick]"), opt.getAttribute("data-pick-id"), opt.textContent);
    });
    root.addEventListener("keydown", function (e) {
      var q = e.target.closest && e.target.closest(".pick-q");
      if (!q) return;
      var pick = q.closest("[data-pick]");
      var box = pick.querySelector(".pick-list");
      var opts = box.querySelectorAll(".pick-opt");
      var cur = box.querySelector(".pick-opt[aria-selected='true']");
      var idx = Array.prototype.indexOf.call(opts, cur);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (box.hidden) paint(pick, q.value);
        var next = e.key === "ArrowDown" ? opts[Math.min(opts.length - 1, Math.max(0, idx + 1))] : opts[Math.max(0, idx < 0 ? 0 : idx - 1)];
        Array.prototype.forEach.call(opts, function (el) { el.removeAttribute("aria-selected"); });
        if (next) next.setAttribute("aria-selected", "true");
      } else if (e.key === "Enter" && cur) {
        e.preventDefault();
        choose(pick, cur.getAttribute("data-pick-id"), cur.textContent);
      } else if (e.key === "Escape") {
        box.hidden = true;
        q.setAttribute("aria-expanded", "false");
      }
    });
  }
  return { sorted: sorted, customers: customers, vendors: vendors, matches: matches, field: field, bind: bind };
});
