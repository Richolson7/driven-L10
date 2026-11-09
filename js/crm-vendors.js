/* Vendors section. Same Supabase project as the rest of the CRM. */
(function () {
  "use strict";
  var V = {
    rows: [], products: [], customers: [], risks: [], quotes: [], scores: [],
    ready: false, note: "", sub: "list", q: "", category: "", status: "",
    active: "", verify: "", utilize: "", openId: null, detailTab: "record"
  };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function latest(id) {
    var rows = V.scores.filter(function (s) { return String(s.vendor_id) === String(id); });
    rows.sort(function (a, b) { return String(b.rated_at).localeCompare(String(a.rated_at)); });
    return rows[0] || null;
  }
  function utilize(s) {
    if (!s || s.values_fit == null || s.delivery_speed == null || s.communication == null) return "Needs rating";
    if (s.values_fit >= 4 && s.delivery_speed >= 4 && s.communication >= 4) return "Utilize";
    if (s.values_fit <= 2 || s.delivery_speed <= 2 || s.communication <= 2) return "Do not prioritize";
    return "Watch";
  }
  function badge(label) {
    var cls = label === "Utilize" ? "active" : label === "Do not prioritize" ? "lost" : label === "Watch" ? "warn" : "";
    return "<span class='chip " + cls + "'>" + esc(label) + "</span>";
  }
  function filtered() {
    var q = V.q.toLowerCase();
    return V.rows.filter(function (r) {
      if (V.sub === "verify" && !(r.verify_flag && !r.verified_at)) return false;
      if (V.category && r.category !== V.category) return false;
      if (V.status && r.status !== V.status) return false;
      if (V.active === "yes" && !r.active) return false;
      if (V.active === "no" && r.active) return false;
      if (V.verify === "yes" && !r.verify_flag) return false;
      var u = utilize(latest(r.id));
      if (V.utilize && u !== V.utilize) return false;
      if (!q) return true;
      var blob = [r.supplier, r.category, r.status, r.location, r.products_specs, r.contact].join(" ").toLowerCase();
      return blob.indexOf(q) >= 0;
    });
  }
  function opts(list) {
    var seen = {};
    list.forEach(function (x) { if (x) seen[x] = 1; });
    return Object.keys(seen).sort();
  }

  async function load() {
    if (!window.CRMDB) return;
    var v = await CRMDB.db.from("crm_vendors").select("*").order("supplier");
    if (v.error) {
      V.ready = false;
      V.note = "Vendor tables are not in the database yet. Apply supabase/migrations/20261109190000_crm_vendors.sql and the seed. Nothing was written.";
      V.rows = [];
      return;
    }
    V.rows = v.data || [];
    var packs = await Promise.all([
      CRMDB.db.from("crm_vendor_products").select("*"),
      CRMDB.db.from("crm_vendor_customers").select("*"),
      CRMDB.db.from("crm_vendor_category_risk").select("*"),
      CRMDB.db.from("crm_vendor_quotes").select("*"),
      CRMDB.db.from("crm_vendor_scores").select("*").order("rated_at", { ascending: false })
    ]);
    V.products = packs[0].error ? [] : (packs[0].data || []);
    V.customers = packs[1].error ? [] : (packs[1].data || []);
    V.risks = packs[2].error ? [] : (packs[2].data || []);
    V.quotes = packs[3].error ? [] : (packs[3].data || []);
    V.scores = packs[4].error ? [] : (packs[4].data || []);
    V.ready = true;
    V.note = "";
  }

  function bar() {
    var cats = opts(V.rows.map(function (r) { return r.category; }));
    var stats = opts(V.rows.map(function (r) { return r.status; }));
    var subs = [["list", "All suppliers"], ["verify", "Verify queue"], ["score", "Scorecard"], ["risk", "Category risk"], ["quotes", "Open quotes"], ["links", "Who buys from whom"]];
    var h = "<div class='bar'><input type='search' id='vq' placeholder='Search suppliers, products, places' value='" + esc(V.q) + "'>";
    h += "<select id='vcat'><option value=''>All categories</option>" + cats.map(function (c) { return "<option" + (V.category === c ? " selected" : "") + ">" + esc(c) + "</option>"; }).join("") + "</select>";
    h += "<select id='vstat'><option value=''>All statuses</option>" + stats.map(function (c) { return "<option" + (V.status === c ? " selected" : "") + ">" + esc(c) + "</option>"; }).join("") + "</select>";
    h += "<select id='vact'><option value=''>Active or not</option><option value='yes'" + (V.active === "yes" ? " selected" : "") + ">Active Driven</option><option value='no'" + (V.active === "no" ? " selected" : "") + ">Not active</option></select>";
    h += "<select id='vver'><option value=''>Verify flag</option><option value='yes'" + (V.verify === "yes" ? " selected" : "") + ">Verify-flagged</option></select>";
    h += "<select id='vuse'><option value=''>Utilize</option>" + ["Utilize", "Watch", "Do not prioritize", "Needs rating"].map(function (c) { return "<option" + (V.utilize === c ? " selected" : "") + ">" + esc(c) + "</option>"; }).join("") + "</select>";
    h += "<div class='spacer'></div><button class='primary' data-act='vnd-new'>Add vendor</button></div>";
    h += "<div class='filters' style='margin-bottom:12px'>" + subs.map(function (s) {
      return "<button data-act='vnd-sub' data-v='" + s[0] + "' aria-pressed='" + (V.sub === s[0]) + "'>" + s[1] + "</button>";
    }).join("") + "<button data-act='vnd-calc' data-cat=''>Calculators</button></div>";
    var tools = [["bags", "Poly bags"], ["film", "Sheeting"], ["stretch", "Stretch wrap"], ["paper", "Paper"], ["box", "Boxes"], ["blanket", "Blankets"], ["pallet", "Pallet builder"], ["boxfit", "Box fit"], ["bagfit", "Bag sizing"], ["costtrip", "Cost & trip"]];
    h += "<div class='filters' style='margin-bottom:12px'>" + tools.map(function (t) {
      return "<button data-act='vnd-calc' data-cat='" + t[0] + "'>" + t[1] + "</button>";
    }).join("") + "</div>";
    return h;
  }

  function listHtml() {
    var rows = filtered();
    var flagged = V.rows.filter(function (r) { return r.verify_flag && !r.verified_at; }).length;
    var h = "<div class='stats'><div class='stat'><b>" + V.rows.length + "</b><span>Supplier rows</span></div><div class='stat'><b>" + V.rows.filter(function (r) { return r.active; }).length + "</b><span>Active rows</span></div><div class='stat'><b>" + flagged + "</b><span>Still to verify</span></div><div class='stat'><b>" + V.rows.filter(function (r) { return utilize(latest(r.id)) === "Utilize"; }).length + "</b><span>Utilize</span></div></div>";
    if (V.sub === "verify") return h + verifyHtml(rows);
    h += "<div class='panel tablewrap'><table><thead><tr><th>Supplier</th><th>Category</th><th>Status</th><th>Location</th><th>Active</th><th>Use</th><th>Verify</th></tr></thead><tbody>";
    h += rows.length ? rows.map(function (r) {
      return "<tr class='click' data-act='vnd-open' data-id='" + r.id + "'><td><b>" + esc(r.supplier) + "</b></td><td>" + esc(r.category || "") + "</td><td>" + esc(r.status || "") + "</td><td>" + esc(r.location || "") + "</td><td>" + (r.active ? "<span class='chip active'>Active</span>" : "") + "</td><td>" + badge(utilize(latest(r.id))) + "</td><td>" + (r.verify_flag ? "<span class='chip warn'>Flag</span>" : "") + "</td></tr>";
    }).join("") : "<tr><td colspan='7' class='empty'>No suppliers match.</td></tr>";
    return h + "</tbody></table></div>";
  }

  function verifyHtml(rows) {
    var h = "<p class='lead'>These rows still have a verify flag and have not been marked verified. Edit the flagged text, then mark it verified with a note.</p><div class='panel'>";
    h += rows.map(function (r) {
      return "<div class='task'><div class='tt'><b>" + esc(r.supplier) + "</b> · " + esc(r.category || "") + "<div class='log'>" + esc(r.verify_flag) + "</div>" +
        "<div class='fields' style='margin-top:8px'><div class='f'><label>Contact</label><input data-vnd='contact' data-id='" + r.id + "' value='" + esc(r.contact || "") + "'></div>" +
        "<div class='f'><label>Location</label><input data-vnd='location' data-id='" + r.id + "' value='" + esc(r.location || "") + "'></div>" +
        "<div class='f wide'><label>Products / specs</label><textarea data-vnd='products_specs' data-id='" + r.id + "'>" + esc(r.products_specs || "") + "</textarea></div>" +
        "<div class='f wide'><label>Verify flag</label><textarea data-vnd='verify_flag' data-id='" + r.id + "'>" + esc(r.verify_flag || "") + "</textarea></div>" +
        "<div class='f wide'><label>Note</label><input id='vn-" + r.id + "' placeholder='What you checked'></div></div>" +
        "<button class='primary' data-act='vnd-verified' data-id='" + r.id + "'>Mark verified</button></div></div>";
    }).join("") || "<div class='empty'>Nothing left in the verify queue.</div>";
    return h + "</div>";
  }

  function riskHtml() {
    var h = "<div class='panel tablewrap'><table><thead><tr><th>Category</th><th>2026 sources</th><th>Risk</th><th>Why</th><th>Backups</th></tr></thead><tbody>";
    h += V.risks.map(function (r) {
      var tone = r.risk === "R" ? "lost" : r.risk === "Y" ? "warn" : "active";
      return "<tr><td>" + esc(r.category) + "</td><td>" + esc(r.sources_2026 == null ? "" : r.sources_2026) + "</td><td><span class='chip " + tone + "'>" + esc(r.risk || "") + "</span></td><td>" + esc(r.reason || "") + "</td><td>" + esc(r.backups || "") + "</td></tr>";
    }).join("") || "<tr><td colspan='5' class='empty'>No category risk rows.</td></tr>";
    return h + "</tbody></table></div>";
  }

  function scoreHtml() {
    var h = "<p class='lead'>Values fit, delivery speed, and communication are each 1 to 5. A vendor is Utilize only when all three are 4 or 5. Delivery speed uses the promised date on the PO: late means after that date, or the promised quantity is not complete. A partial is on time for what arrived; the rest is late unless Driven agreed in writing to a new date. Vendor-caused delays count. Delays Driven caused do not. Communication: 5 proactive, 4 reliable, 3 inconsistent, 2 hard to reach, 1 they do not communicate. No scores are seeded.</p>";
    h += "<div class='panel tablewrap'><table><thead><tr><th>Vendor</th><th>Values</th><th>Speed</th><th>Communication</th><th>Use</th></tr></thead><tbody>";
    h += V.rows.filter(function (r) { return r.active; }).map(function (r) {
      var s = latest(r.id);
      function n(v) { return v == null ? "—" : v; }
      return "<tr class='click' data-act='vnd-open' data-id='" + r.id + "'><td>" + esc(r.supplier) + "</td><td>" + n(s && s.values_fit) + "</td><td>" + n(s && s.delivery_speed) + "</td><td>" + n(s && s.communication) + "</td><td>" + badge(utilize(s)) + "</td></tr>";
    }).join("") + "</tbody></table></div>";
    return h;
  }

  function render() {
    var view = document.getElementById("view");
    if (!view) return;
    var h = "<div class='sect'><h2>Vendors</h2>";
    if (window.CRMSupply) h += CRMSupply.banner();
    if (V.note) h += "<p class='banner'>" + esc(V.note) + "</p>";
    h += bar();
    if (!V.ready) { view.innerHTML = h + "</div>"; wire(); return; }
    if (V.sub === "risk") h += riskHtml();
    else if (V.sub === "score") h += scoreHtml();
    else if (V.sub === "quotes") h += quoteHtml();
    else if (V.sub === "links") h += window.CRMSupply ? CRMSupply.whoHtml(V.q, V.category) : "";
    else h += listHtml();
    view.innerHTML = h + "</div>";
    wire();
  }

  function quoteHtml() {
    var h = "<div class='panel tablewrap'><table><thead><tr><th>Customer</th><th>Item</th><th>Vendor</th><th>Note</th></tr></thead><tbody>";
    h += V.quotes.map(function (q) {
      return "<tr><td>" + esc(q.customer_name) + "</td><td>" + esc(q.item) + "</td><td>" + esc(q.vendor_name || "") + "</td><td>" + esc(q.note || "") + "</td></tr>";
    }).join("") || "<tr><td colspan='4' class='empty'>No open quotes in the seed.</td></tr>";
    return h + "</tbody></table></div>";
  }

  function wire() {
    var q = document.getElementById("vq");
    if (q) q.addEventListener("input", function (e) {
      V.q = e.target.value;
      var p = e.target.selectionStart;
      render();
      var n = document.getElementById("vq");
      if (n) { n.focus(); if (p != null) n.setSelectionRange(p, p); }
    });
    [["vcat", "category"], ["vstat", "status"], ["vact", "active"], ["vver", "verify"], ["vuse", "utilize"]].forEach(function (pair) {
      var el = document.getElementById(pair[0]);
      if (el) el.addEventListener("change", function () { V[pair[1]] = el.value; render(); });
    });
  }

  function field(label, key, value, wide) {
    var wideCls = wide ? " wide" : "";
    if (key === "products_specs" || key === "notes" || key === "capability_flags" || key === "merge_notes") {
      return "<div class='f" + wideCls + "'><label>" + label + "</label><textarea data-vnd='" + key + "'>" + esc(value || "") + "</textarea></div>";
    }
    return "<div class='f" + wideCls + "'><label>" + label + "</label><input data-vnd='" + key + "' value='" + esc(value == null ? "" : value) + "'></div>";
  }

  function open(id) {
    var r = V.rows.filter(function (x) { return String(x.id) === String(id); })[0];
    if (!r || !window.CRMHooks) return;
    V.openId = r.id;
    var s = latest(r.id);
    var tabs = [["record", "Record"], ["products", "Products"], ["customers", "Customers"], ["pos", "Purchase orders"], ["served", "Customers served"], ["score", "Score"]];
    var h = "<div class='dhead'><div style='flex:1'><div class='sub'>" + esc(r.category || "Supplier") + "</div><h2>" + esc(r.supplier) + "</h2><div class='sub'>" + badge(utilize(s)) + (r.active ? " <span class='chip active'>Active</span>" : "") + "</div></div><button class='ghost' data-act='close'>Close</button></div><div class='dbody'>";
    h += "<div class='filters'>" + tabs.map(function (t) { return "<button data-act='vnd-tab' data-v='" + t[0] + "' aria-pressed='" + (V.detailTab === t[0]) + "'>" + t[1] + "</button>"; }).join("") + "</div>";
    if (V.detailTab === "products") h += productsBlock(r);
    else if (V.detailTab === "customers") h += customersBlock(r);
    else if (V.detailTab === "pos") h += poBlock(r);
    else if (V.detailTab === "served") h += servedBlock(r);
    else if (V.detailTab === "score") h += scoreBlock(r, s);
    else {
      h += "<div class='fields'>" + [
        ["Supplier", "supplier", r.supplier, 1], ["Category", "category", r.category], ["Status", "status", r.status],
        ["Contact", "contact", r.contact, 1], ["Location", "location", r.location], ["Miles", "miles_from_river_falls", r.miles_from_river_falls],
        ["Products / specs", "products_specs", r.products_specs, 1], ["MOQ", "moq", r.moq], ["Lead time", "lead_time", r.lead_time],
        ["Terms", "terms", r.terms], ["Credit limit", "credit_limit", r.credit_limit], ["Hold", "hold_status", r.hold_status],
        ["Last price", "last_price", r.last_price, 1], ["Last order", "last_order_date", r.last_order_date],
        ["Notes", "notes", r.notes, 1]
      ].map(function (f) { return field(f[0], f[1], f[2], f[3]); }).join("") + "</div>";
      h += "<label class='switch'><input type='checkbox' data-vnd='active' data-id='" + r.id + "'" + (r.active ? " checked" : "") + "> Active Driven vendor</label>";
    }
    h += "</div>";
    CRMHooks.openDrawer(h, true);
  }

  function productsBlock(r) {
    var rows = V.products.filter(function (p) { return String(p.vendor_id) === String(r.id); });
    var h = "<ul class='mini'>" + (rows.map(function (p) {
      return "<li><b>" + esc(p.product || p.category || "Product") + "</b><div class='log'>" + esc(p.specs || "") + "</div><button class='linkbtn' data-act='vnd-del-product' data-id='" + p.id + "'>Remove</button></li>";
    }).join("") || "<li class='log'>None yet.</li>") + "</ul>";
    h += "<div class='addrow'><input id='vpName' placeholder='Product'><input id='vpSpecs' placeholder='Specs'><button class='ghost' data-act='vnd-add-product' data-id='" + r.id + "'>Add</button></div>";
    return h;
  }
  function customersBlock(r) {
    var rows = V.customers.filter(function (p) { return String(p.vendor_id) === String(r.id); });
    var companies = CRMHooks.companies().filter(function (c) { return c.kind !== "vendor"; });
    var h = "<ul class='mini'>" + (rows.map(function (p) {
      return "<li><b>" + esc(p.customer_name) + "</b> · " + esc(p.feeds || "") + " <button class='linkbtn' data-act='vnd-del-customer' data-id='" + p.id + "'>Remove</button></li>";
    }).join("") || "<li class='log'>None yet.</li>") + "</ul>";
    h += "<div class='fields'><div class='f'><label>Customer</label><select id='vcCo'><option value=''>Type a name…</option>" + companies.map(function (c) { return "<option value='" + c.id + "'>" + esc(c.name) + "</option>"; }).join("") + "</select></div><div class='f'><label>Or name</label><input id='vcName'></div><div class='f wide'><label>What the buy feeds</label><input id='vcFeeds'></div></div><button class='ghost' data-act='vnd-add-customer' data-id='" + r.id + "'>Add customer</button>";
    return h;
  }
  function poBlock(r) {
    if (!window.CRMCommissions || CRMCommissions.role() !== "full") {
      return "<p class='log'>Purchase order cost is limited to Amber, Dan, and Rich. The database does not return those rows for anyone else.</p>";
    }
    var rows = CRMSupply.posForVendor(r.id);
    if (!rows.length) return "<p class='log'>No purchase orders linked to this supplier yet.</p>";
    return "<ul class='mini'>" + rows.map(function (p) {
      return "<li><b>" + esc(p.po_number || "PO") + "</b> · " + esc(p.status) + (p.total == null ? "" : " · $" + esc(p.total)) +
        "<div class='addrow'><input id='poDeal-" + p.id + "' placeholder='Order id' value='" + esc(p.deal_id || "") + "'><button class='ghost' data-act='vnd-link-po' data-id='" + p.id + "'>Link to order</button></div></li>";
    }).join("") + "</ul>";
  }
  function servedBlock(r) {
    var rows = CRMSupply.servedFor(r.id);
    if (!rows.length) return "<p class='log'>No customers linked from the order log yet.</p>";
    return "<ul class='mini'>" + rows.map(function (p) {
      return "<li><b>" + esc(p.customer_name) + "</b> · " + esc(p.category || "") + " · last " + esc(p.last_buy ? String(p.last_buy).slice(0, 10) : "") + "</li>";
    }).join("") + "</ul>";
  }
  function scoreBlock(r, s) {
    function sel(key, val) {
      var h = "<select id='sc-" + key + "'><option value=''>—</option>";
      for (var i = 1; i <= 5; i++) h += "<option" + (String(val) === String(i) ? " selected" : "") + ">" + i + "</option>";
      return h + "</select>";
    }
    return "<p class='log'>Saving adds a new score row. The latest one is what the list shows. Utilize means all three are 4 or 5.</p><div class='fields'><div class='f'><label>Values fit</label>" + sel("values", s && s.values_fit) + "</div><div class='f'><label>Delivery speed</label>" + sel("speed", s && s.delivery_speed) + "</div><div class='f'><label>Communication</label>" + sel("comm", s && s.communication) + "</div><div class='f wide'><label>Notes</label><input id='sc-notes' value='" + esc(s && s.notes || "") + "'></div></div><button class='primary' data-act='vnd-score' data-id='" + r.id + "'>Save scores</button>";
  }

  function blankVendor() {
    if (!window.CRMHooks) return;
    CRMHooks.openModal("<h2>Add vendor</h2><div class='fields'><div class='f wide'><label>Supplier</label><input id='nvName'></div><div class='f'><label>Category</label><input id='nvCat'></div><div class='f'><label>Status</label><input id='nvStatus' value='Prospect'></div><div class='f wide'><label>Location</label><input id='nvLoc'></div><div class='f wide'><label>Products / specs</label><textarea id='nvSpecs'></textarea></div></div><div class='mactions'><button class='ghost' data-act='mclose'>Cancel</button><button class='primary' data-act='vnd-save-new'>Save</button></div>");
  }

  async function saveNew() {
    var name = document.getElementById("nvName").value.trim();
    if (!name) { CRMHooks.toast("Add a supplier name."); return; }
    var saved = await CRMDB.insert("crm_vendors", {
      supplier: name,
      category: document.getElementById("nvCat").value.trim() || null,
      status: document.getElementById("nvStatus").value.trim() || null,
      location: document.getElementById("nvLoc").value.trim() || null,
      products_specs: document.getElementById("nvSpecs").value.trim() || null,
      active: false
    }, "vendor");
    if (!saved) return;
    CRMHooks.closeModal();
    await load();
    render();
    open(saved.id);
  }

  async function onChange(el) {
    var id = el.dataset.id || V.openId;
    var row = V.rows.filter(function (r) { return String(r.id) === String(id); })[0];
    if (!row) return;
    var key = el.dataset.vnd;
    var value = el.type === "checkbox" ? el.checked : el.value;
    var patch = {};
    patch[key] = value === "" ? null : value;
    patch.updated_at = new Date().toISOString();
    var saved = await CRMDB.update("crm_vendors", row.id, patch, "vendor");
    if (!saved) return;
    Object.keys(patch).forEach(function (k) { row[k] = patch[k]; });
    if (window.CRMHooks) CRMHooks.toast("Vendor saved.");
  }

  async function markVerified(id) {
    var noteEl = document.getElementById("vn-" + id);
    var row = V.rows.filter(function (r) { return String(r.id) === String(id); })[0];
    if (!row) return;
    var saved = await CRMDB.update("crm_vendors", row.id, {
      verified_at: new Date().toISOString(),
      verified_by: CRMHooks.meName(),
      verify_note: noteEl ? noteEl.value : ""
    }, "verification");
    if (!saved) return;
    await CRMDB.insert("crm_vendor_changes", {
      changed_on: new Date().toISOString().slice(0, 10),
      supplier: row.supplier,
      vendor_id: row.id,
      what_changed: "Marked verified. " + ((noteEl && noteEl.value) || ""),
      source: "CRM verify queue"
    }, "vendor change");
    await load();
    render();
  }

  async function addProduct(id) {
    var name = document.getElementById("vpName").value.trim();
    if (!name) return;
    var saved = await CRMDB.insert("crm_vendor_products", {
      vendor_id: +id, product: name, specs: document.getElementById("vpSpecs").value.trim() || null
    }, "vendor product");
    if (!saved) return;
    await load();
    open(id);
  }
  async function addCustomer(id) {
    var sel = document.getElementById("vcCo");
    var company = sel && sel.value ? CRMHooks.companies().filter(function (c) { return String(c.id) === sel.value; })[0] : null;
    var name = company ? company.name : document.getElementById("vcName").value.trim();
    if (!name) { CRMHooks.toast("Name the customer."); return; }
    var saved = await CRMDB.insert("crm_vendor_customers", {
      vendor_id: +id, company_id: company ? company.id : null, customer_name: name,
      feeds: document.getElementById("vcFeeds").value.trim() || null
    }, "vendor customer");
    if (!saved) return;
    await load();
    open(id);
  }
  async function saveScore(id) {
    function num(key) {
      var el = document.getElementById("sc-" + key);
      if (!el || el.value === "") return null;
      return +el.value;
    }
    var saved = await CRMDB.insert("crm_vendor_scores", {
      vendor_id: +id,
      values_fit: num("values"),
      delivery_speed: num("speed"),
      communication: num("comm"),
      notes: document.getElementById("sc-notes").value,
      rated_by: CRMHooks.meName(),
      rated_at: new Date().toISOString()
    }, "vendor score");
    if (!saved) return;
    await load();
    open(id);
  }

  window.CRMVendors = {
    load: load,
    render: render,
    rows: function () { return V.rows; },
    onChange: onChange,
    handle: async function (a) {
      var act = a.dataset.act;
      if (act === "vnd-sub") { V.sub = a.dataset.v; render(); return; }
      if (act === "vnd-open") { V.detailTab = "record"; open(a.dataset.id); return; }
      if (act === "vnd-tab") { V.detailTab = a.dataset.v; open(V.openId); return; }
      if (act === "vnd-new") { blankVendor(); return; }
      if (act === "vnd-save-new") { await saveNew(); return; }
      if (act === "vnd-verified") { await markVerified(a.dataset.id); return; }
      if (act === "vnd-add-product") { await addProduct(a.dataset.id); return; }
      if (act === "vnd-del-product") { await CRMDB.remove("crm_vendor_products", +a.dataset.id, "vendor product"); await load(); open(V.openId); return; }
      if (act === "vnd-add-customer") { await addCustomer(a.dataset.id); return; }
      if (act === "vnd-del-customer") { await CRMDB.remove("crm_vendor_customers", +a.dataset.id, "vendor customer"); await load(); open(V.openId); return; }
      if (act === "vnd-score") { await saveScore(a.dataset.id); return; }
      if (act === "vnd-link-po") {
        var box = document.getElementById("poDeal-" + a.dataset.id);
        var saved = await CRMDB.update("crm_vendor_pos", +a.dataset.id, { deal_id: box && box.value ? +box.value : null }, "purchase order");
        if (!saved) return;
        if (window.CRMSupply) await CRMSupply.load();
        open(V.openId);
        return;
      }
      if (act === "vnd-calc") {
        CRMHooks.setView("calculator", { calcCat: a.dataset.cat || "" });
      }
    }
  };
})();
