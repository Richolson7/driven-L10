/* Driven CRM screens.
   Landon: the look is in crm.html. This file loads and saves one row at a time.
   Quote print/PDF and the quote → deal map live in crm-quote.js.
   Sections: state, load, prefs, automations, quotes, views, events, boot. */
(function () {
  "use strict";
  if (!window.CRMDB || !window.CRMQuote || !window.CRMOrders) return;

  var Q = window.CRMQuote;
  var Orders = window.CRMOrders;
  var T = new Date(); T.setHours(0, 0, 0, 0);
  function iso(x) { x = new Date(x); return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0"); }
  var TODAY = iso(T);
  function addDays(s, n) { var x = new Date(String(s).slice(0, 10) + "T00:00:00"); x.setDate(x.getDate() + n); return iso(x); }
  function between(a, b) { return Math.round((new Date(String(b).slice(0, 10) + "T00:00:00") - new Date(String(a).slice(0, 10) + "T00:00:00")) / 864e5); }
  function day(s) { if (!s) return null; var t = String(s); return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : null; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function $(s) { return document.querySelector(s); }
  function money(v) { var n = +v; if (!n) return "$0"; return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }); }
  function unit(v) { if (v == null || v === "") return ""; var n = +v; return "$" + (n < 10 ? n.toFixed(n < 1 ? 3 : 2) : n.toFixed(2)); }
  function shortDate(s) { return s ? new Date(String(s).slice(0, 10) + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function empty(v) { return v == null || v === ""; }

  var SETUP_ITEMS = [
    { key: "packet", label: "Setup packet sent" },
    { key: "customer_form", label: "New customer form signed and returned", doc: 1 },
    { key: "w9", label: "Customer W-9 received", doc: 1 },
    { key: "tax_exempt", label: "Tax exempt certificate, if they have one", doc: 1 },
    { key: "refs", label: "Bank and trade references checked" },
    { key: "credit_limit", label: "Credit limit set" },
    { key: "qb", label: "Set up in QuickBooks" },
    { key: "ship", label: "Ship-to address added", auto: "ship" },
    { key: "ap", label: "Accounting contact added", auto: "ap" }
  ];
  var VENDOR_ITEMS = [
    { key: "packet", label: "Vendor packet sent" },
    { key: "vendor_form", label: "New vendor form returned", doc: 1 },
    { key: "w9", label: "Vendor W-9 received", doc: 1 },
    { key: "nda", label: "NDA signed", doc: 1 },
    { key: "food_safety", label: "Food safety certificate, if they have one", doc: 1 },
    { key: "terms", label: "Invoice and freight terms agreed" },
    { key: "bank_verified", label: "Bank info verified by phone" },
    { key: "qb", label: "Set up in QuickBooks" },
    { key: "ap", label: "Accounting contact added", auto: "ap" }
  ];
  var PACKET = {
    template: ["NEW CUSTOMER FORM.pdf", "Driven Solutions W-9.pdf", "Driven INFO for Customers.pdf"],
    vtemplate: ["Driven New Vendor Form.pdf", "Driven Solutions W-9.pdf", "Driven S-211 WI exemption certificate.pdf", "Unilateral NDA.docx", "Driven INFO for Vendors.pdf"]
  };
  var PENDING_RULES = [
    { name: "New customer setup", trigger: "new_customer", notify: "operations", msg: "New customer: start setup for {company}. Send the setup packet and collect the signed new customer form and their W-9." },
    { name: "Setup still incomplete", trigger: "setup_stale", notify: "operations", days: [3, 7, 14], msg: "{company} setup is still missing: {missing}" },
    { name: "New vendor setup", trigger: "new_vendor", notify: "accounting", msg: "New vendor: {company}. Send the vendor packet and collect the new vendor form, W-9 and signed NDA." },
    { name: "Vendor ready for QuickBooks", trigger: "vendor_ready", notify: "accounting", msg: "{company} sent back their vendor form and W-9. Verify their bank info by phone, then set them up in QuickBooks." }
  ];
  var DEAL_FIELDS = [
    { k: "company_id", l: "Customer", t: "company", g: "Quote" },
    { k: "ship_to_id", l: "Ship-to", t: "shipto", g: "Quote" },
    { k: "description", l: "Brief description", t: "text", g: "Quote", wide: 1 },
    { k: "sales_rep", l: "Sales rep", t: "rep", g: "Quote" },
    { k: "quote_sent_date", l: "Quote sent date", t: "date", g: "Quote" },
    { k: "price_per_unit", l: "Quoted price per unit", t: "number", g: "Quote" },
    { k: "quantity", l: "Quantity", t: "number", g: "Quote" },
    { k: "vendor_id", l: "Vendor", t: "vendor", g: "Vendor" },
    { k: "vendor_price_per_unit", l: "Vendor price per unit", t: "number", g: "Vendor" },
    { k: "vendor_quantity", l: "Vendor quantity", t: "number", g: "Vendor" },
    { k: "freight", l: "Freight", t: "number", g: "Vendor" },
    { k: "customer_po_number", l: "Customer PO #", t: "text", g: "Order" },
    { k: "customer_po_url", l: "Customer PO link", t: "text", g: "Order" },
    { k: "driven_po_url", l: "Driven PO #", t: "text", g: "Order" },
    { k: "est_ship_date", l: "Estimated ship date", t: "date", g: "Order" },
    { k: "est_delivery_date", l: "Estimated delivery date", t: "date", g: "Order" },
    { k: "invoice_sent_date", l: "Invoice sent date", t: "date", g: "Billing" },
    { k: "paid_date", l: "Paid date", t: "date", g: "Billing" },
    { k: "notes", l: "Notes", t: "area", g: "Notes", wide: 1 }
  ];
  var DATE_KEYS = { quote_sent_date: 1, est_ship_date: 1, est_delivery_date: 1, invoice_sent_date: 1, paid_date: 1 };
  var NUM_KEYS = { price_per_unit: 1, quantity: 1, vendor_price_per_unit: 1, vendor_quantity: 1, freight: 1, ship_to_id: 1, vendor_id: 1, company_id: 1 };

  var S = { theme: "dark", view: "pipeline", meId: null, authEmail: "", authLocked: false, entered: false, stages: [], team: [], rules: [], fields: [], companies: [], contacts: [], shipTos: [], deals: [], tasks: [], activity: [], stepRows: [], targets: [], outreach: [], products: [], messages: [], sequenceNote: "", targetsNote: "", quotesNote: "", linesNote: "", productsNote: "", messagesNote: "", feedback: "" };
  var sessionGen = 0;
  var admitEmail = "";
  var gateHold = false;
  var F = emptyFilter();
  var board = { zones: {}, stages: {} };
  var presets = [];
  var defaultFilter = null;
  var prefsMode = "unknown";
  var prefsWarned = false;
  var quotesApi = false;
  var linesApi = false;
  var productsApi = false;
  var messagesApi = false;
  var orderF = { q: "", customer: "", rep: "", category: "", vendor: "", scope: "open", sort: "lineDate", dir: 1 };
  var coQ = "";
  var coFilter = "all";
  var taskWho = "";
  var calMonth = null;
  var openSeq = {};
  var busy = false;

  function emptyFilter() { return { q: "", rep: "", stage: "", shipFrom: "", shipTo: "", showLost: false }; }
  function toast(msg, kind) {
    var t = document.createElement("div");
    t.className = "toast" + (kind ? " " + kind : "");
    t.textContent = msg;
    $("#toasts").appendChild(t);
    setTimeout(function () { t.remove(); }, kind === "bad" ? 7000 : 3600);
  }
  function setSaveState(text, kind) {
    var el = $("#saveState");
    if (!el) return;
    el.textContent = text;
    el.className = "save-state" + (kind ? " " + kind : "");
  }
  CRMDB.onError(function (text) { setSaveState(text, "bad"); toast(text, "bad"); });
  CRMDB.onOk(function (what) { setSaveState("Saved " + what, "ok"); });

  function co(id) { return S.companies.find(function (c) { return c.id === +id; }); }
  function dealById(id) { return S.deals.find(function (d) { return d.id === +id; }); }
  function SI(k) { return S.stages.findIndex(function (s) { return s.key === k; }); }
  function WON() { var i = SI("customer_po"); return i < 0 ? 2 : i; }
  function stageName(k) { var s = S.stages.find(function (x) { return x.key === k; }); return s ? s.name : (k || ""); }
  function reps() { return S.team.filter(function (t) { return t.team === "sales" && t.active !== false; }).map(function (t) { return t.name; }); }
  function repOptions() {
    var names = reps().slice();
    ["House", "Brady"].forEach(function (n) { if (names.indexOf(n) < 0) names.push(n); });
    return names;
  }
  function isWon(d) { return d.status !== "lost" && SI(d.stage) >= WON(); }
  function qOf(d) { return d && d.quote ? d.quote : null; }
  function qSell(q) { return Q.total(q.lines); }
  function qCost(q) { return (q.lines || []).reduce(function (a, l) { return a + ((+l.qty || 0) * (+l.cost || 0)); }, 0); }
  function val(d) { var q = qOf(d); if (q && q.lines && q.lines.length) return qSell(q); return (+d.price_per_unit || 0) * (+d.quantity || 0); }
  function cost(d) { var q = qOf(d); if (q && q.lines && q.lines.length) return qCost(q) + (+d.freight || 0); return (+d.vendor_price_per_unit || 0) * (+(d.vendor_quantity != null && d.vendor_quantity !== "" ? d.vendor_quantity : d.quantity) || 0) + (+d.freight || 0); }
  function margin(d) { var v = val(d); return v ? (v - cost(d)) / v : null; }
  function mgClass(m) { return m == null ? "" : m >= 0.25 ? "mg-good" : m >= 0.15 ? "mg-mid" : "mg-bad"; }
  function pct(m) { return m == null ? "" : Math.round(m * 100) + "%"; }
  function FL(k) { var f = DEAL_FIELDS.find(function (x) { return x.k === k; }); return f ? f.l : k; }
  function me() { return S.team.find(function (t) { return t.id === +S.meId; }) || S.team[0] || { id: 0, name: "Rich" }; }
  function meName() { return me().name || "Rich"; }

  function userCustom(raw) {
    var user = {};
    var bag = raw && typeof raw === "object" ? raw : {};
    Object.keys(bag).forEach(function (k) { if (k.charAt(0) !== "_") user[k] = bag[k]; });
    return user;
  }
  function mapCompany(row) {
    var c = row.custom || {};
    return { id: row.id, name: row.name || "", kind: row.kind || "prospect", list: row.list || "potential", owner: row.owner || "", billing: row.billing_address || "", status: row.status_note || "", notes: row.notes || "", last: day(row.last_contact_at), custom: userCustom(c), setup: c._setup || {}, setup_started: c._setup_started || null, qb_id: c._qb_id || "", alert_amber: !!c._alert_amber, ready_for_qb: !!c._ready_qb, docs: c._docs || [], textOk: c._text_ok || {}, enrollments: c._enrollments || [], target_account_id: row.target_account_id || null };
  }
  function companyBag(c) {
    var bag = {};
    Object.keys(c.custom || {}).forEach(function (k) { if (k.charAt(0) !== "_") bag[k] = c.custom[k]; });
    bag._setup = c.setup || {};
    bag._setup_started = c.setup_started || null;
    bag._qb_id = c.qb_id || null;
    bag._alert_amber = !!c.alert_amber;
    bag._ready_qb = !!c.ready_for_qb;
    bag._docs = c.docs || [];
    bag._text_ok = c.textOk || {};
    bag._enrollments = c.enrollments || [];
    return bag;
  }
  function blankQuote(d) {
    var ct = S.contacts.find(function (x) { return x.company_id === d.company_id; });
    return {
      id: null, db: false, number: "Q-" + TODAY.slice(0, 4) + "-" + String(d.id).padStart(4, "0"),
      company_id: d.company_id, ship_to_id: d.ship_to_id || null, contact_id: ct ? ct.id : null,
      rep: d.sales_rep || (co(d.company_id) || {}).owner || "", date: TODAY, valid: 30, status: "draft",
      sent_date: d.quote_sent_date || null, po: d.customer_po_number || "", freight: d.freight, terms: Q.TERMS,
      lines: [{ desc: d.description && d.description !== "New quote" ? d.description : "", qty: d.quantity, unit: "each", vendor_id: d.vendor_id, cost: d.vendor_price_per_unit, price: d.price_per_unit, freight: d.freight, category: "", invoice_number: "", line_date: d.won_at || d.stage_changed_at || TODAY, product_id: null, sales_rep: d.sales_rep || "" }]
    };
  }
  function mapDeal(row) {
    var c = row.custom || {};
    var d = {
      id: row.id, company_id: row.company_id, ship_to_id: row.ship_to_id, description: row.description || "",
      stage: row.stage || "working_on_quote", stage_changed_at: day(row.stage_changed_at) || TODAY,
      sales_rep: row.sales_rep || "", price_per_unit: row.price_per_unit, quantity: row.quantity,
      vendor_id: row.vendor_id, vendor_price_per_unit: row.vendor_price_per_unit, vendor_quantity: row.vendor_quantity,
      quote_sent_date: day(row.quote_sent_date), customer_po_number: row.customer_po_number || "", customer_po_url: row.customer_po_url || "",
      driven_po_url: row.driven_po_url || "", est_ship_date: day(row.est_ship_date), est_delivery_date: day(row.est_delivery_date),
      freight: row.freight, invoice_sent_date: day(row.invoice_sent_date), paid_date: day(row.paid_date), notes: row.notes || "",
      custom: userCustom(c), status: c._status || "open", won_at: c._won_at || null, lost_reason: c._lost_reason || "",
      order_lines: c._order_lines || [], quote: c._quote || null
    };
    if (d.quote && d.quote.lines && d.quote.lines[0]) {
      var line = d.quote.lines[0];
      if (d.description && !/ \+ \d+ more$/.test(d.description)) line.desc = d.description;
      line.price = d.price_per_unit;
      line.qty = d.quantity;
      line.vendor_id = d.vendor_id;
      line.cost = d.vendor_price_per_unit;
      if (line.freight == null || line.freight === "") line.freight = d.freight;
      d.quote.freight = line.freight;
      d.quote.sent_date = d.quote_sent_date;
      d.quote.rep = d.sales_rep || d.quote.rep;
      d.quote.company_id = d.company_id;
      d.quote.ship_to_id = d.ship_to_id;
      d.quote.po = d.customer_po_number || d.quote.po || "";
    }
    return d;
  }
  function dealBag(d) {
    var bag = {};
    Object.keys(d.custom || {}).forEach(function (k) { if (k.charAt(0) !== "_") bag[k] = d.custom[k]; });
    bag._status = d.status || "open";
    bag._won_at = d.won_at || null;
    bag._lost_reason = d.lost_reason || "";
    bag._order_lines = d.order_lines || [];
    bag._quote = d.quote || null;
    return bag;
  }
  function mapTask(row) {
    return { id: row.id, deal_id: row.deal_id, company_id: row.company_id, rule_id: row.rule_id, assignee: row.assignee || "", title: row.title || "", due: day(row.due) || TODAY, done: !!row.done, dedupe_key: row.dedupe_key || "" };
  }
  function mapActivity(row) {
    return { id: row.id, deal_id: row.deal_id, company_id: row.company_id, kind: row.kind || "note", note: row.note || "", by: row.by_user || "", at: day(row.at) || TODAY };
  }

  async function loadAll() {
    var tables = ["crm_stages", "crm_team", "crm_automation_rules", "crm_companies", "crm_contacts", "crm_ship_tos", "crm_deals", "crm_tasks", "crm_activity", "crm_custom_fields", "crm_sequence_steps"];
    var results = await Promise.all(tables.map(function (t) { return CRMDB.selectAll(t).then(function (r) { return { t: t, data: r.data, error: r.error }; }); }));
    var bad = results.find(function (r) { return r.error && r.t !== "crm_sequence_steps"; });
    if (bad) {
      $("#view").innerHTML = "<p class='banner'>Could not load the CRM. " + esc(CRMDB.explain(bad.error)) + "</p>";
      setSaveState("Could not load " + bad.t, "bad");
      return false;
    }
    var by = {};
    results.forEach(function (r) { by[r.t] = r.error ? [] : (r.data || []); });
    var seqRes = results.find(function (r) { return r.t === "crm_sequence_steps"; });
    S.sequenceNote = "";
    if (seqRes && seqRes.error) S.sequenceNote = "Sequences did not load: " + CRMDB.explain(seqRes.error);
    else if (!by.crm_sequence_steps.length) S.sequenceNote = "No sequence steps came back. crm_sequence_steps is limited to signed-in @drivensol.com users, so the anon key cannot read the 7 seeded steps until you sign in.";
    S.stages = by.crm_stages.map(function (s) { return { id: s.id, key: s.key, name: s.name, position: s.position, team: s.team, req: s.required_fields || [], active: s.active !== false }; }).filter(function (s) { return s.active; }).sort(function (a, b) { return a.position - b.position; });
    S.team = by.crm_team.map(function (p) { return { id: p.id, name: p.name, email: p.email || "", team: p.team, via: p.alert_via || "both", active: p.active !== false }; }).sort(function (a, b) { return a.id - b.id; });
    S.rules = by.crm_automation_rules.map(function (r) { return { id: r.id, name: r.name, trigger: r.trigger, stage: r.stage, field: r.date_field, days: r.offset_days || [], list: r.company_list, notify: r.notify_team, via: r.via, msg: r.message, active: r.active !== false }; }).sort(function (a, b) { return a.id - b.id; });
    S.fields = by.crm_custom_fields.map(function (f) { return { id: f.id, entity: f.entity, key: f.key, label: f.label, type: f.type, options: f.options || [], position: f.position || 0, active: f.active !== false }; }).sort(function (a, b) { return a.position - b.position; });
    S.companies = by.crm_companies.map(mapCompany);
    S.contacts = by.crm_contacts.map(function (x) { return { id: x.id, company_id: x.company_id, role: x.role || "", name: x.name || "", email: x.email || "", phone: x.phone || "" }; });
    S.shipTos = by.crm_ship_tos.map(function (s) { return { id: s.id, company_id: s.company_id, label: s.label || "Ship-to", address: s.address || "", is_default: !!s.is_default }; });
    S.deals = by.crm_deals.map(mapDeal);
    S.tasks = by.crm_tasks.map(mapTask);
    S.activity = by.crm_activity.map(mapActivity).sort(function (a, b) { return a.id < b.id ? 1 : -1; });
    S.stepRows = by.crm_sequence_steps;
    var targets = await CRMDB.db.from("target_accounts").select("id,company,city,state,industry_tag,contact_name,contact_title,contact_email,contact_phone,owner").limit(200);
    S.targets = targets.error ? [] : (targets.data || []);
    S.targetsNote = targets.error ? ("Target accounts did not load: " + CRMDB.explain(targets.error)) : (!S.targets.length ? "Target accounts are hidden until you sign in." : "");
    var out = await CRMDB.db.from("driven_outreach").select("id,company,contact,email,status,notes,owner").limit(200);
    S.outreach = out.error ? [] : (out.data || []);
    var probe = await CRMDB.db.from("crm_quotes").select("id").limit(1);
    quotesApi = !probe.error;
    S.quotesNote = probe.error ? "The quote header is stored on the deal until the crm_quotes migration is applied. Price, quantity, vendor, freight, and description still save on the deal itself." : "";
    if (quotesApi) await loadQuoteTables();
    var lineProbe = await CRMDB.db.from("crm_deal_lines").select("id").limit(1);
    linesApi = !lineProbe.error;
    S.linesNote = lineProbe.error ? "Order lines are stored on each deal until the crm_deal_lines migration is applied. Revenue, cost, profit, and margin are calculated and are not stored." : "";
    if (linesApi) await loadDealLines();
    var prodProbe = await CRMDB.db.from("crm_products").select("id,qbo_item_id,sku,name,description,category,unit,default_price,active").order("name");
    productsApi = !prodProbe.error;
    S.products = prodProbe.error ? [] : (prodProbe.data || []);
    S.productsNote = prodProbe.error ? "The product catalog is not in the database yet. Descriptions stay free text until the crm_products migration is applied. Nothing was imported." : "";
    var msgProbe = await CRMDB.db.from("crm_messages").select("*").order("created_at", { ascending: false }).limit(300);
    messagesApi = !msgProbe.error;
    S.messages = msgProbe.error ? [] : (msgProbe.data || []);
    S.messagesNote = msgProbe.error ? "Email and text status is off. crm_messages is not in the database yet, and this page still sends nothing." : "";
    if (!S.stages.length) {
      $("#view").innerHTML = "<p class='banner'>No pipeline stages came back from crm_stages.</p>";
      return false;
    }
    return true;
  }

  function lineFromDb(l) {
    return {
      line_id: l.id, product_id: l.product_id || null, desc: l.description || "", qty: l.quantity, unit: l.unit || "",
      vendor_id: l.vendor_id, cost: l.vendor_price, price: l.sell_price, freight: l.freight, category: l.category || "",
      invoice_number: l.invoice_number || "", line_date: day(l.line_date), sales_rep: l.sales_rep || ""
    };
  }
  async function loadQuoteTables() {
    var headers = await CRMDB.db.from("crm_quotes").select("*");
    if (headers.error) { quotesApi = false; S.quotesNote = "Could not read crm_quotes. " + CRMDB.explain(headers.error); return; }
    (headers.data || []).forEach(function (h) {
      var d = dealById(h.deal_id);
      if (!d) return;
      var lines = d.quote && d.quote.lines && d.quote.lines.length ? d.quote.lines : [{ desc: d.description || "", qty: d.quantity, unit: "each", vendor_id: d.vendor_id, cost: d.vendor_price_per_unit, price: d.price_per_unit, freight: d.freight }];
      d.quote = {
        id: h.id, db: true, number: h.number, company_id: h.company_id, ship_to_id: h.ship_to_id, contact_id: h.contact_id,
        rep: h.rep || "", date: day(h.quote_date), valid: h.valid_days || 30, status: h.status || "draft", sent_date: day(h.sent_date),
        po: h.customer_po || "", freight: h.freight, terms: h.terms || Q.TERMS, lines: lines
      };
    });
  }
  async function loadDealLines() {
    var res = await CRMDB.db.from("crm_deal_lines").select("*").order("position");
    if (res.error) { linesApi = false; S.linesNote = "Could not read order lines. " + CRMDB.explain(res.error); return; }
    var byDeal = {};
    (res.data || []).forEach(function (l) { (byDeal[l.deal_id] = byDeal[l.deal_id] || []).push(lineFromDb(l)); });
    Object.keys(byDeal).forEach(function (id) {
      var d = dealById(id);
      if (!d) return;
      if (!d.quote) d.quote = blankQuote(d);
      d.quote.lines = byDeal[id];
    });
  }

  function prefsKey() { return "driven-crm-prefs:" + S.meId; }
  function readLocal() { try { return JSON.parse(localStorage.getItem(prefsKey()) || "null"); } catch (e) { return null; } }
  function writeLocal() {
    localStorage.setItem(prefsKey(), JSON.stringify({ defaultFilter: defaultFilter, presets: presets, board: board }));
  }
  function applyPrefs(src) {
    defaultFilter = src && src.defaultFilter ? src.defaultFilter : null;
    presets = src && src.presets ? src.presets : [];
    board = src && src.board ? src.board : { zones: {}, stages: {} };
    board.zones = board.zones || {};
    board.stages = board.stages || {};
    F = defaultFilter ? clone(defaultFilter) : emptyFilter();
  }
  function fromRows(rows) {
    var src = { defaultFilter: null, presets: [], board: { zones: {}, stages: {} } };
    rows.forEach(function (r) {
      if (r.name === "__board") src.board = r.filter || src.board;
      else if (r.name === "default" || r.is_default) src.defaultFilter = r.filter;
      else src.presets.push({ name: r.name, filter: r.filter });
    });
    return src;
  }
  function localHasPrefs(local) {
    if (!local) return false;
    if (local.defaultFilter) return true;
    if (local.presets && local.presets.length) return true;
    var b = local.board || {};
    var zones = b.zones || {};
    var stages = b.stages || {};
    return Object.keys(zones).some(function (k) { return zones[k]; }) || Object.keys(stages).some(function (k) { return stages[k]; });
  }
  async function loadPrefs() {
    var local = readLocal();
    applyPrefs(local);
    if (!S.meId || !S.authLocked) { prefsMode = "local"; updatePrefsNote(); return; }
    var res = await CRMDB.db.from("crm_user_prefs").select("*").eq("team_member_id", S.meId).eq("view", "pipeline");
    if (res.error) {
      prefsMode = "local";
      updatePrefsNote();
      return;
    }
    prefsMode = "remote";
    if (res.data && res.data.length) applyPrefs(fromRows(res.data));
    else if (localHasPrefs(local)) { await persistPrefs(); return; }
    updatePrefsNote();
  }
  function updatePrefsNote() {
    var el = $("#prefsNote");
    if (!el) return;
    var who = meName();
    el.textContent = prefsMode === "remote"
      ? "Filters and collapsed columns save to Supabase for " + who + "."
      : "Filters and collapsed columns for " + who + " stay in this browser until the crm_user_prefs migration is applied and you are signed in.";
  }
  async function persistPrefs() {
    writeLocal();
    if (prefsMode === "local" || !S.meId) { updatePrefsNote(); return; }
    var rows = [];
    if (defaultFilter) rows.push({ team_member_id: S.meId, view: "pipeline", name: "default", filter: defaultFilter, is_default: true });
    rows.push({ team_member_id: S.meId, view: "pipeline", name: "__board", filter: { zones: board.zones || {}, stages: board.stages || {} }, is_default: false });
    presets.forEach(function (p) { rows.push({ team_member_id: S.meId, view: "pipeline", name: p.name, filter: p.filter, is_default: false }); });
    for (var i = 0; i < rows.length; i++) {
      var res = await CRMDB.db.from("crm_user_prefs").upsert(rows[i], { onConflict: "team_member_id,view,name" }).select().single();
      if (res.error) {
        prefsMode = "local";
        if (!prefsWarned) {
          prefsWarned = true;
          toast("Could not save preferences to Supabase: " + CRMDB.explain(res.error) + " Saved in this browser for " + meName() + ".", "bad");
          setSaveState("Preferences saved in this browser only", "bad");
        }
        updatePrefsNote();
        return;
      }
    }
    prefsMode = "remote";
    setSaveState("Saved preferences for " + meName(), "ok");
    updatePrefsNote();
  }

  function colCollapsed(stage) { return !!(board.zones[stage.team] || board.stages[stage.key]); }
  function dealMatches(d) {
    var c = co(d.company_id) || {};
    var q = (F.q || "").toLowerCase();
    if (F.rep && d.sales_rep !== F.rep) return false;
    if (F.stage && d.stage !== F.stage) return false;
    if (q && (d.description + " " + (c.name || "")).toLowerCase().indexOf(q) < 0) return false;
    if (F.shipFrom || F.shipTo) {
      if (!d.est_ship_date) return false;
      if (F.shipFrom && d.est_ship_date < F.shipFrom) return false;
      if (F.shipTo && d.est_ship_date > F.shipTo) return false;
    }
    return true;
  }

  function quoteModel(q) {
    var c = co(q.company_id) || {};
    var ship = S.shipTos.find(function (s) { return s.id === +q.ship_to_id; });
    var ct = S.contacts.find(function (x) { return x.id === +q.contact_id; });
    var rep = S.team.find(function (t) { return t.name === q.rep; }) || {};
    return {
      number: q.number, date: q.date, valid: q.valid, terms: q.terms, companyName: c.name || "",
      billing: c.billing || "", contactName: ct ? ct.name : "", contactEmail: ct ? ct.email : "", contactPhone: ct ? ct.phone : "",
      ship: ship ? ((ship.label ? ship.label + ": " : "") + ship.address) : (c.billing || ""),
      repName: q.rep || "", repEmail: rep.email || "",
      lines: (q.lines || []).map(function (l) { return { desc: l.desc, qty: l.qty, unit: l.unit, price: l.price }; })
    };
  }
  function printQuote(q) {
    $("#printArea").innerHTML = Q.docHtml(quoteModel(q));
    var old = document.title;
    document.title = "Driven Solutions Quote " + (q.number || "");
    try { window.print(); } catch (e) { toast("Press Ctrl+P, or Cmd+P on a Mac, and choose Save as PDF."); }
    document.title = old;
  }
  function downloadQuote(q) {
    var res = Q.download(quoteModel(q));
    if (!res.ok) { toast(res.message, "bad"); setSaveState(res.message, "bad"); return; }
    toast("Downloaded " + (q.number || "quote") + ". Nothing was emailed.");
  }

  async function saveDealColumns(d, patch, what) {
    var saved = await CRMDB.update("crm_deals", d.id, patch, what || "deal");
    if (!saved) return false;
    Object.keys(patch).forEach(function (k) { if (k !== "custom") d[k] = patch[k]; });
    return true;
  }
  async function saveDealCustom(d) {
    return saveDealColumns(d, { custom: dealBag(d) }, "deal");
  }
  async function saveCompany(c, keys) {
    var row = {};
    keys.forEach(function (k) {
      if (k === "name") row.name = c.name;
      else if (k === "kind") row.kind = c.kind;
      else if (k === "list") row.list = c.list;
      else if (k === "owner") row.owner = c.owner || null;
      else if (k === "billing") row.billing_address = c.billing || null;
      else if (k === "status") row.status_note = c.status || null;
      else if (k === "notes") row.notes = c.notes || null;
      else if (k === "last") row.last_contact_at = c.last || null;
      else if (k === "target_account_id") row.target_account_id = c.target_account_id || null;
      else row.custom = companyBag(c);
    });
    var saved = await CRMDB.update("crm_companies", c.id, row, "company");
    return !!saved;
  }
  async function addActivity(row) {
    var saved = await CRMDB.insert("crm_activity", { deal_id: row.deal_id || null, company_id: row.company_id || null, kind: row.kind || "note", note: row.note || "", by_user: row.by || meName(), at: new Date().toISOString() }, row.kind === "draft" ? "draft" : "note");
    if (!saved) return null;
    var a = mapActivity(saved);
    S.activity.unshift(a);
    return a;
  }
  async function addTask(row) {
    if (row.dedupe_key && S.tasks.some(function (t) { return t.dedupe_key === row.dedupe_key; })) return { duplicate: true };
    var saved = await CRMDB.insert("crm_tasks", { title: row.title, assignee: row.assignee || null, deal_id: row.deal_id || null, company_id: row.company_id || null, rule_id: row.rule_id || null, due: row.due || TODAY, done: !!row.done, dedupe_key: row.dedupe_key || null }, "follow-up", { ignoreUnique: true });
    if (!saved) return null;
    if (saved.duplicate) return saved;
    var task = mapTask(saved);
    S.tasks.push(task);
    return task;
  }
  async function queueDraft(person, subject, body, due, key, deal, company, ruleId) {
    var made = [];
    var via = person.via || "both";
    if (via !== "email") {
      var task = await addTask({ title: subject, assignee: person.name, deal_id: deal ? deal.id : null, company_id: company ? company.id : null, rule_id: ruleId || null, due: due, dedupe_key: key + ":" + person.name });
      if (task === null) return null;
      if (!task.duplicate) made.push(person.name + " (follow-up)");
    }
    if (via !== "task") {
      var dk = "draft:" + key + ":" + person.name;
      if (!S.tasks.some(function (t) { return t.dedupe_key === dk; })) {
        var act = await addActivity({ deal_id: deal ? deal.id : null, company_id: company ? company.id : null, kind: "draft", note: "Draft only. Nothing was sent.\nTo: " + person.name + " <" + (person.email || "") + ">\n\n" + subject + (body ? "\n\n" + body : ""), by: person.name });
        if (!act) return null;
        var marker = await addTask({ title: "Email draft (not sent): " + subject, assignee: person.name, deal_id: deal ? deal.id : null, company_id: company ? company.id : null, rule_id: ruleId || null, due: due, dedupe_key: dk });
        if (marker === null) return null;
        made.push(person.name + " (draft)");
      }
    }
    return made;
  }

  function fill(t, d, c) {
    var v = d && d.vendor_id ? co(d.vendor_id) : null;
    return String(t || "").replace("{description}", d ? d.description : "").replace("{company}", c ? c.name : "").replace("{vendor}", v ? v.name : "the vendor").replace("{missing}", c ? setupStatus(c).missing.join(", ") : "");
  }
  function recipients(rule, d, c) {
    if (rule.notify === "rep") {
      var n = (d && d.sales_rep) || (c && c.owner) || "Rich";
      var p = S.team.find(function (t) { return t.name === n; });
      return p ? [p] : [];
    }
    return S.team.filter(function (t) { return t.team === rule.notify && t.active !== false; });
  }
  async function fire(rule, d, c, due, key) {
    var msg = fill(rule.msg, d, c);
    var people = recipients(rule, d, c);
    var out = [];
    for (var i = 0; i < people.length; i++) {
      var made = await queueDraft(people[i], msg, "", due, key, d, c, rule.id);
      if (made === null) return null;
      out = out.concat(made);
    }
    return out;
  }
  function itemDone(c, it) {
    if (!it) return false;
    if (it.auto === "ship") return S.shipTos.some(function (s) { return s.company_id === c.id; });
    if (it.auto === "ap") return S.contacts.some(function (x) { return x.company_id === c.id && /payable|\bap\b|billing|accounting/i.test(x.role || ""); });
    return !!((c.setup || {})[it.key] || (it.doc && (c.docs || []).some(function (x) { return x.item === it.key; })));
  }
  function setupList(c) { return c && c.kind === "vendor" ? VENDOR_ITEMS : SETUP_ITEMS; }
  function setupStatus(c) {
    var items = setupList(c);
    var miss = items.filter(function (it) { return !itemDone(c, it); });
    return { done: items.length - miss.length, total: items.length, missing: miss.map(function (it) { return it.label; }) };
  }
  function syncReadyFlags(c) {
    if (!c || c.kind !== "vendor") { if (c) { c.alert_amber = false; c.ready_for_qb = false; } return; }
    var ready = ["vendor_form", "w9"].every(function (k) { return itemDone(c, { key: k, doc: 1 }); });
    c.ready_for_qb = ready && !c.qb_id;
    c.alert_amber = c.ready_for_qb;
  }
  async function runAutomations() {
    var rules = S.rules.filter(function (r) { return r.active; });
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      if (r.trigger === "date_reached" || r.trigger === "stale_stage") {
        for (var j = 0; j < S.deals.length; j++) {
          var d = S.deals[j];
          if (d.status === "lost" || d.stage !== r.stage) continue;
          var base = d[r.field];
          if (!base) continue;
          if (r.trigger === "date_reached") {
            var due = addDays(base, (r.days || [0])[0] || 0);
            if (due <= TODAY) { if (await fire(r, d, co(d.company_id), due, "r" + r.id + ":d" + d.id + ":" + base) === null) return; }
          } else {
            var age = between(base, TODAY);
            var hit = (r.days || []).filter(function (x) { return x <= age; });
            if (!hit.length) continue;
            var o = Math.max.apply(null, hit);
            if (await fire(r, d, co(d.company_id), addDays(base, o), "r" + r.id + ":d" + d.id + ":" + o + ":" + base) === null) return;
          }
        }
      }
      if (r.trigger === "no_contact") {
        for (var k = 0; k < S.companies.length; k++) {
          var c = S.companies[k];
          if (c.kind === "vendor" || c.list !== r.list || !c.last) continue;
          var n = (r.days || [14])[0];
          if (between(c.last, TODAY) >= n) { if (await fire(r, null, c, addDays(c.last, n), "r" + r.id + ":c" + c.id + ":" + c.last) === null) return; }
        }
      }
      if (r.trigger === "vendor_ready") {
        for (var v = 0; v < S.companies.length; v++) {
          var vend = S.companies[v];
          syncReadyFlags(vend);
          if (vend.kind === "vendor" && vend.alert_amber) { if (await fire(r, null, vend, TODAY, "r" + r.id + ":c" + vend.id) === null) return; }
        }
      }
    }
  }

  function missingFor(d, toKey) {
    var to = SI(toKey), from = SI(d.stage);
    if (to <= from) return [];
    var q = qOf(d), hasQ = !!(q && q.lines && q.lines.length && q.lines[0].desc);
    var QK = ["price_per_unit", "quantity", "vendor_id", "vendor_price_per_unit", "vendor_quantity"];
    var need = [];
    S.stages.slice(0, to + 1).forEach(function (s) {
      (s.req || []).forEach(function (k) {
        if (empty(d[k]) && !(hasQ && QK.indexOf(k) >= 0) && need.indexOf(k) < 0) need.push(k);
      });
    });
    return need;
  }
  function inputFor(f, v, d, attr) {
    var a = attr + '="' + f.k + '"';
    if (f.t === "company" || f.t === "vendor") {
      var list = S.companies.filter(function (c) { return f.t === "vendor" ? c.kind === "vendor" : c.kind !== "vendor"; });
      return "<select " + a + "><option value=''>Choose…</option>" + list.map(function (c) { return "<option value='" + c.id + "'" + (+v === c.id ? " selected" : "") + ">" + esc(c.name) + "</option>"; }).join("") + "</select>";
    }
    if (f.t === "shipto") {
      var ships = S.shipTos.filter(function (s) { return s.company_id === +d.company_id; });
      return "<select " + a + "><option value=''>" + (ships.length ? "Choose…" : "Add a ship-to on the company first") + "</option>" + ships.map(function (s) { return "<option value='" + s.id + "'" + (+v === s.id ? " selected" : "") + ">" + esc(s.label + ": " + s.address) + "</option>"; }).join("") + "</select>";
    }
    if (f.t === "rep") return "<select " + a + "><option value=''>Choose…</option>" + repOptions().map(function (r) { return "<option" + (v === r ? " selected" : "") + ">" + esc(r) + "</option>"; }).join("") + "</select>";
    if (f.t === "area") return "<textarea " + a + ">" + esc(v) + "</textarea>";
    if (f.t === "number") return "<input type='number' step='any' " + a + " value='" + esc(v) + "'>";
    if (f.t === "date") return "<input type='date' " + a + " value='" + esc(v) + "'>";
    return "<input type='text' " + a + " value='" + esc(v) + "'" + (f.k === "description" ? " placeholder='Annual stretch wrap'" : "") + ">";
  }
  function readInput(el, type) {
    if (el.type === "checkbox") return el.checked;
    if (type === "company" || type === "vendor" || type === "shipto" || NUM_KEYS[el.dataset.k] || NUM_KEYS[el.dataset.g]) return el.value === "" ? null : +el.value;
    if (type === "number") return el.value === "" ? null : +el.value;
    return el.value === "" ? (type === "date" ? null : "") : el.value;
  }
  function snapshotOrder(d) {
    if (d.order_lines && d.order_lines.length) return;
    var q = qOf(d);
    var lines = q && q.lines && q.lines.length ? q.lines : [{ desc: d.description, qty: d.quantity, unit: "", vendor_id: d.vendor_id, cost: d.vendor_price_per_unit, price: d.price_per_unit }];
    d.order_lines = lines.map(function (l) {
      return { date: d.won_at || TODAY, quote: q ? q.number : "", desc: l.desc, qty: +l.qty || 0, unit: l.unit || "", vendor_id: l.vendor_id, cost: +l.cost || 0, price: +l.price || 0, po: d.customer_po_number || "" };
    });
  }

  async function commitMove(d, toKey) {
    var prev = { stage: d.stage, stage_changed_at: d.stage_changed_at, won_at: d.won_at, status: d.status, order_lines: clone(d.order_lines || []), quote: d.quote ? clone(d.quote) : null };
    var from = d.stage;
    d.stage = toKey;
    d.stage_changed_at = TODAY;
    var wonNow = false;
    if (SI(toKey) >= WON() && !d.won_at) { d.won_at = TODAY; wonNow = true; }
    if (SI(toKey) < WON()) d.won_at = null;
    var q = qOf(d);
    if (q && toKey === "quote_sent" && q.status === "draft") { q.status = "sent"; q.sent_date = q.sent_date || TODAY; d.quote_sent_date = d.quote_sent_date || TODAY; }
    if (wonNow) { snapshotOrder(d); if (q) { q.status = "accepted"; if (d.customer_po_number) q.po = d.customer_po_number; } }
    var patch = { stage: d.stage, stage_changed_at: d.stage_changed_at + "T18:00:00.000Z", quote_sent_date: d.quote_sent_date || null, custom: dealBag(d) };
    var ok = await saveDealColumns(d, patch, "deal");
    if (!ok) { d.stage = prev.stage; d.stage_changed_at = prev.stage_changed_at; d.won_at = prev.won_at; d.status = prev.status; d.order_lines = prev.order_lines; d.quote = prev.quote; return false; }
    await addActivity({ deal_id: d.id, company_id: d.company_id, kind: "move", note: "Moved " + stageName(from) + " to " + stageName(toKey) + "." + (wonNow ? " Closed won." : ""), by: meName() });
    var tasks = S.tasks.filter(function (t) { return t.deal_id === d.id && !t.done; });
    for (var i = 0; i < tasks.length; i++) {
      var rule = S.rules.find(function (r) { return r.id === tasks[i].rule_id; });
      if (rule && (rule.trigger === "stale_stage" || rule.trigger === "date_reached")) {
        var up = await CRMDB.update("crm_tasks", tasks[i].id, { done: true }, "follow-up");
        if (up) tasks[i].done = true;
      }
    }
    var sent = [];
    var stageRules = S.rules.filter(function (r) { return r.active && r.trigger === "stage_enter" && r.stage === toKey; });
    for (var s = 0; s < stageRules.length; s++) {
      var made = await fire(stageRules[s], d, co(d.company_id), TODAY, "r" + stageRules[s].id + ":d" + d.id + ":" + Date.now());
      if (made) sent = sent.concat(made);
    }
    var c = co(d.company_id);
    if (c && c.kind !== "vendor") {
      c.last = TODAY;
      var keys = ["last"];
      if (wonNow && c.kind === "prospect") { c.kind = "customer"; c.list = "active"; keys.push("kind", "list"); }
      if (wonNow && !c.setup_started) { c.setup = c.setup || {}; c.setup_started = TODAY; keys.push("custom"); }
      await saveCompany(c, keys);
    }
    if (wonNow) toast("Closed won: " + d.description + " · " + money(val(d)), "won");
    toast(sent.length ? "Moved to " + stageName(toKey) + ". Queued for " + Array.from(new Set(sent)).join(", ") + ". Nothing was emailed." : "Moved to " + stageName(toKey) + ".");
    return true;
  }

  async function saveQuoteDoc(d) {
    if (quotesApi && d.quote) {
      var q = d.quote;
      var header = { deal_id: d.id, company_id: q.company_id || null, ship_to_id: q.ship_to_id || null, contact_id: q.contact_id || null, number: q.number || null, quote_date: q.date || null, valid_days: +q.valid || 30, status: q.status || "draft", terms: q.terms || null, sent_date: q.sent_date || null, customer_po: q.po || null, rep: q.rep || null, freight: q.freight == null || q.freight === "" ? null : q.freight, updated_at: new Date().toISOString() };
      var saved;
      if (q.id && q.db) saved = await CRMDB.update("crm_quotes", q.id, header, "quote");
      else saved = await CRMDB.insert("crm_quotes", header, "quote");
      if (!saved) { quotesApi = false; S.quotesNote = "crm_quotes is not writable yet. Line items are stored on the deal."; }
      else { q.id = saved.id; q.db = true; }
    }
    if (linesApi && d.quote) {
      var kept = [];
      for (var i = 0; i < d.quote.lines.length; i++) {
        var l = d.quote.lines[i];
        var row = {
          deal_id: d.id, product_id: l.product_id || null, position: i, line_date: l.line_date || null,
          description: l.desc || "", invoice_number: l.invoice_number || null, sales_rep: l.sales_rep || d.quote.rep || null,
          category: l.category || null, vendor_id: l.vendor_id || null,
          quantity: l.qty == null || l.qty === "" ? null : l.qty, unit: l.unit || null,
          vendor_price: l.cost == null || l.cost === "" ? null : l.cost,
          freight: l.freight == null || l.freight === "" ? null : l.freight,
          sell_price: l.price == null || l.price === "" ? null : l.price,
          updated_at: new Date().toISOString()
        };
        var ls = l.line_id ? await CRMDB.update("crm_deal_lines", l.line_id, row, "order line") : await CRMDB.insert("crm_deal_lines", row, "order line");
        if (!ls) { linesApi = false; S.linesNote = "Order lines could not be saved to crm_deal_lines. They are stored on the deal instead."; break; }
        l.line_id = ls.id;
        kept.push(ls.id);
      }
      if (linesApi) {
        var existing = await CRMDB.db.from("crm_deal_lines").select("id").eq("deal_id", d.id);
        if (!existing.error) {
          for (var r = 0; r < (existing.data || []).length; r++) {
            if (kept.indexOf(existing.data[r].id) < 0) await CRMDB.remove("crm_deal_lines", existing.data[r].id, "order line");
          }
        }
      }
    }
    return saveDealCustom(d);
  }
  async function applyQuoteChange(d, prev, change) {
    var patch = Q.dealPatch(d.quote, change);
    var keys = Object.keys(patch);
    if (keys.length) {
      var ok = await saveDealColumns(d, patch, "deal");
      if (!ok) { d.quote = prev; return false; }
    }
    var stored = await saveQuoteDoc(d);
    if (!stored) return false;
    return true;
  }

  function sequences() {
    var rows = S.stepRows || [];
    var names = [];
    rows.forEach(function (r) { var n = r.sequence_name || "Cold outreach"; if (names.indexOf(n) < 0) names.push(n); });
    return names.map(function (name) {
      var mine = rows.filter(function (r) { return (r.sequence_name || "Cold outreach") === name; });
      var nums = [];
      mine.forEach(function (r) { if (nums.indexOf(r.step) < 0) nums.push(r.step); });
      nums.sort(function (a, b) { return a - b; });
      var steps = nums.map(function (num) {
        var vars = mine.filter(function (r) { return r.step === num; }).slice().sort(function (a, b) { return (a.variant ? 1 : 0) - (b.variant ? 1 : 0); });
        return { step: num, day: vars[0] ? vars[0].day_offset : 0, type: (vars[0] && vars[0].step_type) || "email", variants: vars };
      });
      var approve = mine.some(function (r) { return typeof r.requires_approval === "boolean"; }) ? mine.some(function (r) { return r.requires_approval; }) : localStorage.getItem("driven-crm-seq-approve:" + name) !== "0";
      return { name: name, active: mine.some(function (r) { return r.active; }), approve: approve, steps: steps };
    });
  }
  function allEnrollments() {
    var out = [];
    S.companies.forEach(function (c) { (c.enrollments || []).forEach(function (e) { out.push(Object.assign({ company_id: c.id }, e)); }); });
    return out;
  }
  function seqByName(name) { return sequences().find(function (s) { return s.name === name; }) || null; }
  function stepDue(en, sq) { var st = sq.steps[en.step]; return st ? addDays(en.start, +st.day || 0) : null; }
  function seqContact(en) { return S.contacts.find(function (x) { return x.id === +en.contact_id && x.email; }) || S.contacts.find(function (x) { return x.company_id === en.company_id && x.email; }) || null; }
  function fillSeq(t, en) {
    var c = co(en.company_id) || {};
    var ct = seqContact(en) || {};
    var d = en.deal_id ? dealById(en.deal_id) : null;
    var q = d ? qOf(d) : null;
    var rep = (d && d.sales_rep) || c.owner || "Rich";
    return String(t || "").split("{{first_name}}").join((ct.name || "there").split(" ")[0]).split("{{company}}").join(c.name || "").split("{{description}}").join(d ? d.description : "").split("{{quote_number}}").join(q ? q.number : "").split("{{rep}}").join(rep);
  }
  function pendingQueue() {
    return allEnrollments().filter(function (en) {
      if (en.status !== "active") return false;
      var sq = seqByName(en.sequence_name);
      if (!sq || !sq.active || en.step >= sq.steps.length) return false;
      return stepDue(en, sq) <= TODAY && sq.approve;
    });
  }

  function render() {
    document.documentElement.dataset.theme = S.theme;
    var themeBtn = $("#themeBtn");
    if (themeBtn) themeBtn.textContent = S.theme === "dark" ? "Light mode" : "Dark mode";
    document.querySelectorAll(".tab").forEach(function (b) { b.setAttribute("aria-current", b.dataset.view === S.view ? "page" : "false"); });
    var open = S.tasks.filter(function (t) { return !t.done && t.due <= TODAY; }).length;
    var n = $("#taskCount"); if (n) { n.hidden = !open; n.textContent = open; }
    var pq = pendingQueue().length;
    var sc = $("#seqCount"); if (sc) { sc.hidden = !pq; sc.textContent = pq; }
    var views = { pipeline: vPipeline, companies: vCompanies, docs: vDocs, tasks: vTasks, calendar: vCalendar, orders: vOrders, automations: vAutomations, sequences: vSequences, setup: vSetup };
    (views[S.view] || vPipeline)();
  }

  function vPipeline() {
    var match = dealMatches;
    var open = S.deals.filter(function (d) { return d.status !== "lost" && match(d); });
    var ym = TODAY.slice(0, 7);
    var pipe = open.filter(function (d) { return SI(d.stage) < WON(); }).reduce(function (a, d) { return a + val(d); }, 0);
    var wonM = S.deals.filter(function (d) { return d.won_at && String(d.won_at).slice(0, 7) === ym && d.status !== "lost" && match(d); });
    var wonCount = S.deals.filter(function (d) { return d.won_at && match(d); }).length;
    var lostCount = S.deals.filter(function (d) { return d.status === "lost" && match(d); }).length;
    var rate = wonCount + lostCount ? Math.round(wonCount / (wonCount + lostCount) * 100) + "%" : "—";
    var wonDeals = S.deals.filter(function (d) { return d.won_at && match(d); });
    var wv = wonDeals.reduce(function (a, d) { return a + val(d); }, 0), wc = wonDeals.reduce(function (a, d) { return a + cost(d); }, 0);
    var quotesOut = open.filter(function (d) { return d.stage === "quote_sent"; }).length;
    var h = "<div class='bar'><input type='search' id='q' placeholder='Company or deal' value='" + esc(F.q) + "'><select id='repf'><option value=''>All reps</option>" + reps().map(function (r) { return "<option" + (F.rep === r ? " selected" : "") + ">" + esc(r) + "</option>"; }).join("") + "</select>";
    h += "<select id='stagef'><option value=''>All stages</option>" + S.stages.map(function (s) { return "<option value='" + esc(s.key) + "'" + (F.stage === s.key ? " selected" : "") + ">" + esc(s.name) + "</option>"; }).join("") + "</select>";
    h += "<label class='date'>Ship from <input type='date' id='shipFrom' value='" + esc(F.shipFrom) + "'></label><label class='date'>Ship to <input type='date' id='shipTo' value='" + esc(F.shipTo) + "'></label>";
    h += "<label class='switch'><input type='checkbox' id='showLost'" + (F.showLost ? " checked" : "") + "> Show lost</label>";
    h += "<select id='presetPick'><option value=''>Presets</option>" + presets.map(function (p, i) { return "<option value='" + i + "'>" + esc(p.name) + "</option>"; }).join("") + "</select>";
    h += "<button class='ghost' data-act='filter-default'>Save as my default</button><button class='ghost' data-act='filter-preset'>Save preset</button><button class='ghost' data-act='filter-clear'>Clear</button>";
    h += "<div class='spacer'></div><button class='ghost' data-act='new-quote-pick'>New quote</button><button class='primary' data-act='new-deal'>New deal</button></div>";
    h += "<p class='log' id='prefsNote'></p>";
    if (F.shipFrom || F.shipTo) h += "<p class='log'>Ship dates hide deals with no estimated ship date.</p>";
    h += "<div class='stats'><div class='stat'><b>" + money(pipe) + "</b><span>Open pipeline, quoting and quoted</span></div><div class='stat won'><b>" + money(wonM.reduce(function (a, d) { return a + val(d); }, 0)) + "</b><span>Closed won this month (" + wonM.length + ")</span></div><div class='stat'><b>" + rate + "</b><span>Win rate (" + wonCount + " won, " + lostCount + " lost)</span></div><div class='stat'><b>" + (wv ? pct((wv - wc) / wv) : "—") + "</b><span>Margin on won deals</span></div><div class='stat'><b>" + quotesOut + "</b><span>Quotes waiting on the customer</span></div></div>";
    var cols = S.stages.map(function (s) { return colCollapsed(s) ? "92px" : "minmax(220px,1fr)"; }).join(" ");
    h += "<div class='boardwrap'><div class='zones' style='grid-template-columns:" + cols + "'>";
    var at = 1;
    var seen = [];
    S.stages.forEach(function (s) { if (seen.indexOf(s.team) < 0) seen.push(s.team); });
    seen.forEach(function (team) {
      var n = S.stages.filter(function (s) { return s.team === team; }).length;
      var start = at; at += n;
      var label = team === "sales" ? "Sales" : team === "operations" ? "Operations" : "Accounting";
      var sub = team === "sales" ? "Quote to customer PO" : team === "operations" ? "Driven PO to delivery" : "Invoice to paid";
      var collapsed = !!board.zones[team];
      h += "<button type='button' class='zone " + team + (collapsed ? " collapsed" : "") + "' style='grid-column:" + start + " / " + (start + n) + "' data-act='toggle-zone' data-zone='" + team + "' aria-expanded='" + (!collapsed) + "'>" + label + (collapsed ? " · show" : " · hide") + "<small>" + sub + "</small></button>";
    });
    S.stages.forEach(function (s, i) {
      var ds = open.filter(function (d) { return d.stage === s.key; });
      var tot = ds.reduce(function (a, d) { return a + val(d); }, 0);
      var collapsed = colCollapsed(s);
      h += "<section class='col" + (collapsed ? " collapsed" : "") + "' data-stage='" + s.key + "'><div class='colhead' data-act='toggle-col' data-stage='" + s.key + "' role='button' tabindex='0' aria-expanded='" + (!collapsed) + "'><h3>" + esc(s.name) + "<span class='ct'>" + ds.length + "</span></h3><div class='tot'>" + money(tot) + (i === WON() ? " · <span class='wonmark'>Closed won starts here</span>" : "") + "</div></div><div class='cards'>";
      h += ds.length ? ds.map(cardHtml).join("") : "<div class='empty'>Drag a deal here</div>";
      h += "</div></section>";
    });
    h += "</div></div>";
    if (F.showLost) {
      var lost = S.deals.filter(function (d) { return d.status === "lost" && match(d); });
      h += "<div class='sect' style='margin-top:18px'><h2>Lost deals</h2><div class='panel tablewrap'><table><thead><tr><th>Deal</th><th>Company</th><th>Value</th><th>Stage</th><th>Reason</th></tr></thead><tbody>" + (lost.length ? lost.map(function (d) { return "<tr class='click' data-open-deal='" + d.id + "'><td>" + esc(d.description) + "</td><td>" + esc((co(d.company_id) || {}).name || "") + "</td><td>" + money(val(d)) + "</td><td>" + esc(stageName(d.stage)) + "</td><td>" + esc(d.lost_reason) + "</td></tr>"; }).join("") : "<tr><td colspan='5' class='empty'>No lost deals.</td></tr>") + "</tbody></table></div></div>";
    }
    $("#view").innerHTML = h;
    updatePrefsNote();
    var qel = $("#q");
    qel.addEventListener("input", function (e) { F.q = e.target.value; var p = e.target.selectionStart; vPipeline(); var q2 = $("#q"); q2.focus(); if (p != null) q2.setSelectionRange(p, p); });
    $("#repf").addEventListener("change", function (e) { F.rep = e.target.value; vPipeline(); });
    $("#stagef").addEventListener("change", function (e) { F.stage = e.target.value; vPipeline(); });
    $("#shipFrom").addEventListener("change", function (e) { F.shipFrom = e.target.value; vPipeline(); });
    $("#shipTo").addEventListener("change", function (e) { F.shipTo = e.target.value; vPipeline(); });
    $("#showLost").addEventListener("change", function (e) { F.showLost = e.target.checked; vPipeline(); });
    $("#presetPick").addEventListener("change", function (e) {
      if (e.target.value === "") return;
      F = clone(presets[+e.target.value].filter);
      vPipeline();
    });
    wireDrag();
  }
  function cardHtml(d) {
    var c = co(d.company_id) || {};
    var m = margin(d);
    var age = between(d.stage_changed_at || TODAY, TODAY);
    var due = "";
    if (d.stage === "driven_po" && d.est_ship_date) due = d.est_ship_date <= TODAY ? "Ships today" : "Ships " + shortDate(d.est_ship_date);
    if (d.stage === "shipped" && d.est_delivery_date) due = d.est_delivery_date <= TODAY ? "Delivers today" : "Delivers " + shortDate(d.est_delivery_date);
    if (d.stage === "quote_sent" && d.quote_sent_date) due = "Quoted " + between(d.quote_sent_date, TODAY) + "d ago";
    return "<button class='card" + (isWon(d) ? " won" : "") + "' draggable='true' data-id='" + d.id + "' data-open-deal='" + d.id + "'><div class='co'>" + esc(c.name || "No company") + "</div><div class='desc'>" + esc(d.description || "Untitled deal") + "</div><div class='row'><span class='money'>" + (val(d) ? money(val(d)) : "Needs pricing") + "</span><span class='" + mgClass(m) + "'>" + (m == null ? "" : pct(m) + " margin") + "</span></div><div class='foot'><span>" + esc(d.sales_rep || "No rep") + "</span><span class='" + (due ? "due" : "") + "'>" + (due || (age + "d in stage")) + "</span></div></button>";
  }
  function wireDrag() {
    var dragId = null;
    document.querySelectorAll(".card").forEach(function (c) {
      c.addEventListener("dragstart", function (e) { dragId = c.dataset.id; c.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", dragId); } catch (x) {} });
      c.addEventListener("dragend", function () { c.classList.remove("dragging"); });
    });
    document.querySelectorAll(".col").forEach(function (col) {
      col.addEventListener("dragover", function (e) { e.preventDefault(); col.classList.add("over"); });
      col.addEventListener("dragleave", function () { col.classList.remove("over"); });
      col.addEventListener("drop", function (e) { e.preventDefault(); col.classList.remove("over"); var id = dragId || e.dataTransfer.getData("text/plain"); if (id) moveDeal(+id, col.dataset.stage); });
    });
  }

  function openDeal(id) {
    var d = dealById(id); if (!d) return;
    var c = co(d.company_id) || {};
    var m = margin(d);
    var si = SI(d.stage);
    var nextMiss = si < S.stages.length - 1 ? missingFor(d, S.stages[si + 1].key) : [];
    var h = "<div class='dhead'><div style='flex:1'><div class='sub'>" + esc(c.name || "No company") + "</div><h2>" + esc(d.description || "Untitled deal") + "</h2><div class='sub'>" + (d.status === "lost" ? "<span class='chip lost'>Lost</span> " : isWon(d) ? "<span class='chip active'>Closed won " + esc(shortDate(d.won_at)) + "</span> " : "") + "In " + esc(stageName(d.stage)) + " for " + between(d.stage_changed_at || TODAY, TODAY) + " days</div></div><button class='ghost' data-act='close'>Close</button></div><div class='dbody'>";
    h += "<div class='path'>" + S.stages.map(function (s, i) { return "<button data-act='move' data-id='" + d.id + "' data-to='" + s.key + "' class='" + (i < si ? "done" : i === si ? "cur" : "") + "'>" + esc(s.name) + "</button>"; }).join("") + "</div>";
    h += "<div class='kv'><div><b>" + (val(d) ? money(val(d)) : "—") + "</b><span>Sale</span></div><div><b>" + (cost(d) ? money(cost(d)) : "—") + "</b><span>Cost with freight</span></div><div><b class='" + mgClass(m) + "'>" + (m == null ? "—" : pct(m)) + "</b><span>Margin</span></div></div>";
    var dq = qOf(d);
    h += dq
      ? "<div class='qbox'><div><b>Quote " + esc(dq.number) + "</b> · " + esc(dq.status || "") + " · " + dq.lines.length + " line" + (dq.lines.length > 1 ? "s" : "") + " · " + money(qSell(dq)) + "</div><span style='display:flex;gap:8px'><button class='ghost' data-act='q-print' data-id='" + d.id + "'>Print</button><button class='ghost' data-act='q-download' data-id='" + d.id + "'>Download PDF</button><button class='ghost' data-act='open-quote' data-id='" + d.id + "'>Open quote</button></span></div>"
      : "<div class='qbox'><div>No quote yet. Quote fields copy onto this deal as you type them.</div><button class='primary' data-act='new-quote' data-deal='" + d.id + "'>Build quote</button></div>";
    ["Quote", "Vendor", "Order", "Billing", "Notes"].forEach(function (g) {
      h += "<fieldset><legend>" + g + "</legend><div class='fields'>" + DEAL_FIELDS.filter(function (f) { return f.g === g; }).map(function (f) {
        return "<div class='f" + (f.wide ? " wide" : "") + (nextMiss.indexOf(f.k) >= 0 ? " missing" : "") + "'><label>" + esc(f.l) + (nextMiss.indexOf(f.k) >= 0 ? " <span class='req'>needed next</span>" : "") + "</label>" + inputFor(f, d[f.k], d, "data-k") + "</div>";
      }).join("") + "</div></fieldset>";
    });
    var cf = S.fields.filter(function (f) { return f.entity === "deal" && f.active; });
    if (cf.length) h += "<fieldset><legend>Custom fields</legend><div class='fields'>" + cf.map(function (f) { return "<div class='f'><label>" + esc(f.label) + "</label>" + customInput(f, (d.custom || {})[f.key]) + "</div>"; }).join("") + "</div></fieldset>";
    var tasks = S.tasks.filter(function (t) { return t.deal_id === d.id; });
    h += "<fieldset><legend>Follow-ups and alerts</legend>" + (tasks.length ? "<ul class='mini'>" + tasks.map(function (t) { return "<li>" + (t.done ? "<s>" : "") + esc(t.title) + (t.done ? "</s>" : "") + " <span class='log'>· " + esc(t.assignee) + ", " + shortDate(t.due) + "</span></li>"; }).join("") + "</ul>" : "<p class='log'>No follow-ups yet.</p>") + "</fieldset>";
    h += notesHtml(d.company_id, d.id);
    var act = S.activity.filter(function (a) { return a.deal_id === d.id && a.kind !== "draft"; });
    h += "<fieldset><legend>History</legend><ul class='log'>" + (act.length ? act.map(function (a) { return "<li>" + shortDate(a.at) + " · " + esc(a.note) + "</li>"; }).join("") : "<li>Created.</li>") + "</ul>" + messageList(d.id, null) + "</fieldset></div>";
    h += "<div class='dfoot'>" + (si < S.stages.length - 1 && d.status !== "lost" ? "<button class='primary' data-act='move' data-id='" + d.id + "' data-to='" + S.stages[si + 1].key + "'>Move to " + esc(S.stages[si + 1].name) + "</button>" : "") + (d.status === "lost" ? "<button class='ghost' data-act='reopen' data-id='" + d.id + "'>Reopen deal</button>" : (!isWon(d) ? "<button class='danger' data-act='lose' data-id='" + d.id + "'>Mark lost</button>" : "")) + "<div class='spacer'></div><button class='ghost' data-act='open-company' data-id='" + (d.company_id || "") + "'>Open company</button></div>";
    openDrawer(h);
    $("#drawer").dataset.deal = d.id;
  }
  function customInput(f, v) {
    var a = "data-x='" + esc(f.key) + "'";
    if (f.type === "select") return "<select " + a + "><option value=''>Choose…</option>" + (f.options || []).map(function (o) { return "<option" + (v === o ? " selected" : "") + ">" + esc(o) + "</option>"; }).join("") + "</select>";
    if (f.type === "checkbox") return "<input type='checkbox' " + a + (v ? " checked" : "") + " style='width:auto'>";
    return "<input type='" + (f.type === "number" ? "number" : f.type === "date" ? "date" : "text") + "' " + a + " value='" + esc(v == null ? "" : v) + "'>";
  }
  function messageList(dealId, companyId) {
    if (S.messagesNote && !S.messages.length) return "<p class='log'>" + esc(S.messagesNote) + "</p>";
    var rows = S.messages.filter(function (m) { return (dealId && m.deal_id === dealId) || (companyId && m.company_id === companyId); });
    if (!rows.length) return "<p class='log'>No provider status yet. This page does not send email or texts.</p>";
    return "<ul class='mini'>" + rows.map(function (m) {
      var when = m.status_at || m.created_at;
      return "<li><span class='chip'>" + esc(m.status) + "</span> " + esc(m.channel) + (m.provider ? " · " + esc(m.provider) : "") + "<br><span class='log'>" + esc(m.subject || m.to_address || "") + " · " + esc(when ? String(when).slice(0, 16).replace("T", " ") : "") + (m.provider_message_id ? " · " + esc(m.provider_message_id) : "") + "</span></li>";
    }).join("") + "</ul>";
  }
  function notesHtml(cid, did) {
    var ns = S.activity.filter(function (a) { return a.company_id === cid && (a.kind === "note" || a.kind === "call" || a.kind === "email" || a.kind === "touch") && (did ? a.deal_id === did : true); });
    return "<fieldset><legend>Notes and activity</legend>" + (ns.length ? "<ul class='mini'>" + ns.map(function (n) { return "<li><b>" + esc(n.by || "") + "</b> · " + shortDate(n.at) + " · " + esc(n.kind) + "<br>" + esc(n.note) + "</li>"; }).join("") + "</ul>" : "<p class='log'>Nothing yet.</p>") +
      "<div class='f'><textarea id='noteText' data-note-co='" + cid + "' data-note-deal='" + (did || "") + "' placeholder='Quick note'></textarea></div><button class='primary' data-act='post-note'>Post note</button></fieldset>";
  }

  function vCompanies() {
    var q = coQ.toLowerCase();
    var list = S.companies.filter(function (c) {
      var kindOk = coFilter === "all" || (coFilter === "vendor" ? c.kind === "vendor" : c.list === coFilter && c.kind !== "vendor");
      var blob = (c.name + " " + c.billing + " " + S.contacts.filter(function (x) { return x.company_id === c.id; }).map(function (x) { return x.name + " " + x.email; }).join(" ")).toLowerCase();
      return kindOk && (!q || blob.indexOf(q) >= 0);
    });
    var h = "<div class='bar'><input type='search' id='q' placeholder='Search companies, contacts, addresses' value='" + esc(coQ) + "'><div class='filters'>" + [["all", "All"], ["active", "Active customers"], ["potential", "Potential customers"], ["vendor", "Vendors"]].map(function (x) { return "<button data-act='cof' data-v='" + x[0] + "' aria-pressed='" + (coFilter === x[0]) + "'>" + x[1] + "</button>"; }).join("") + "</div><div class='spacer'></div><button class='ghost' data-act='add-target'>Add from target list</button><button class='primary' data-act='new-company'>New company</button></div>";
    if (S.targetsNote) h += "<p class='banner'>" + esc(S.targetsNote) + "</p>";
    h += "<div class='panel tablewrap'><table><thead><tr><th>Company</th><th>Type</th><th>Owner</th><th>Last contact</th><th>Open deals</th><th>Status</th></tr></thead><tbody>";
    h += list.length ? list.map(function (c) {
      var open = S.deals.filter(function (d) { return d.company_id === c.id && d.status !== "lost" && d.stage !== "paid"; });
      var age = c.last ? between(c.last, TODAY) : null;
      var late = age != null && ((c.list === "active" && age >= 14) || (c.list === "potential" && age >= 30));
      return "<tr class='click' data-open-company='" + c.id + "'><td><b>" + esc(c.name) + "</b></td><td><span class='chip " + (c.kind === "vendor" ? "vendor" : c.list === "active" ? "active" : "") + "'>" + (c.kind === "vendor" ? "Vendor" : c.list === "active" ? "Active" : "Potential") + "</span></td><td>" + esc(c.owner) + "</td><td class='" + (late ? "late" : "") + "'>" + (age == null ? "—" : age === 0 ? "Today" : age + " days ago") + "</td><td>" + (open.length ? open.length + " · " + money(open.reduce(function (a, d) { return a + val(d); }, 0)) : "—") + "</td><td>" + esc(c.status) + (c.alert_amber ? " <span class='chip'>Alert Amber</span>" : "") + (c.ready_for_qb ? " <span class='chip active'>Ready for QuickBooks</span>" : "") + "</td></tr>";
    }).join("") : "<tr><td colspan='6' class='empty'>No companies yet.</td></tr>";
    h += "</tbody></table></div>";
    $("#view").innerHTML = h;
    $("#q").addEventListener("input", function (e) { coQ = e.target.value; var p = e.target.selectionStart; vCompanies(); var q2 = $("#q"); q2.focus(); if (p != null) q2.setSelectionRange(p, p); });
  }
  function openCompany(id) {
    var c = co(id); if (!c) return;
    syncReadyFlags(c);
    function f(k, l, t) {
      if (t === "kind") return "<div class='f'><label>" + l + "</label><select data-k='kind'>" + [["customer", "Customer"], ["prospect", "Prospect"], ["vendor", "Vendor"]].map(function (o) { return "<option value='" + o[0] + "'" + (c.kind === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></div>";
      if (t === "list") return "<div class='f'><label>" + l + "</label><select data-k='list'>" + [["active", "Active customers"], ["potential", "Potential customers"], ["none", "Not in a follow-up list"]].map(function (o) { return "<option value='" + o[0] + "'" + (c.list === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></div>";
      if (t === "rep") return "<div class='f'><label>" + l + "</label><select data-k='owner'><option value=''>None</option>" + reps().map(function (r) { return "<option" + (c.owner === r ? " selected" : "") + ">" + esc(r) + "</option>"; }).join("") + "</select></div>";
      if (t === "area") return "<div class='f wide'><label>" + l + "</label><textarea data-k='" + k + "'>" + esc(c[k]) + "</textarea></div>";
      if (t === "date") return "<div class='f'><label>" + l + "</label><input type='date' data-k='" + k + "' value='" + esc(c[k] || "") + "'></div>";
      return "<div class='f" + (k === "name" || k === "billing" || k === "status" ? " wide" : "") + "'><label>" + l + "</label><input data-k='" + k + "' value='" + esc(c[k] || "") + "'></div>";
    }
    var ships = S.shipTos.filter(function (s) { return s.company_id === c.id; });
    var cons = S.contacts.filter(function (x) { return x.company_id === c.id; });
    var deals = S.deals.filter(function (d) { return d.company_id === c.id || d.vendor_id === c.id; });
    var h = "<div class='dhead'><div style='flex:1'><div class='sub'>" + (c.kind === "vendor" ? "Vendor" : c.kind === "prospect" ? "Prospect" : "Customer") + "</div><h2>" + esc(c.name) + "</h2></div><button class='ghost' data-act='close'>Close</button></div><div class='dbody'>";
    h += "<fieldset><legend>Company</legend><div class='fields'>" + f("name", "Company name") + f("kind", "Type", "kind") + f("list", "Follow-up list", "list") + f("owner", "Owner", "rep") + f("last", "Last contact", "date") + f("billing", "Billing address") + f("status", "Live status") + f("notes", "Notes", "area") + "</div></fieldset>";
    var st = setupStatus(c);
    h += "<fieldset><legend>" + (c.kind === "vendor" ? "Vendor setup" : "Customer setup") + " <span class='log'>" + (c.setup_started ? st.done + " of " + st.total : "not started") + "</span></legend>";
    if (!c.setup_started) h += "<p class='log'><button class='linkbtn' data-act='start-setup' data-id='" + c.id + "'>Start setup</button></p>";
    h += "<div class='prog'><span style='width:" + (st.total ? Math.round(st.done / st.total * 100) : 0) + "%'></span></div><ul class='mini'>" + setupList(c).map(function (it) {
      var ok = itemDone(c, it);
      return "<li class='si'><label class='switch'><input type='checkbox'" + (it.auto ? " disabled" : " data-setup='" + it.key + "' data-id='" + c.id + "'") + (ok ? " checked" : "") + "> <span>" + esc(it.label) + "</span></label>" + (c.kind === "vendor" && it.key === "w9" && c.alert_amber ? " <span class='chip'>Alert Amber</span>" : "") + "</li>";
    }).join("") + "</ul>";
    h += (c.ready_for_qb ? "<span class='chip active'>Ready for QuickBooks</span> " : "") + (c.qb_id ? "<span class='chip active'>Marked in QuickBooks (" + esc(c.qb_id) + ")</span>" : "<button class='ghost' data-act='qb-mark' data-id='" + c.id + "'>Mark ready / set up in QuickBooks</button>");
    h += "<p class='log'>Checklist ticks save on this company. QuickBooks itself is not updated.</p></fieldset>";
    h += "<fieldset><legend>Ship-to addresses</legend><ul class='mini'>" + (ships.length ? ships.map(function (s) { return "<li><b>" + esc(s.label) + "</b> · " + esc(s.address) + " <button class='linkbtn' data-act='del-ship' data-id='" + s.id + "'>Remove</button></li>"; }).join("") : "<li class='log'>None yet.</li>") + "</ul><div class='addrow' style='grid-template-columns:1fr 2fr auto'><input id='nsLabel' placeholder='Label'><input id='nsAddr' placeholder='Full address'><button class='ghost' data-act='add-ship' data-id='" + c.id + "'>Add</button></div></fieldset>";
    h += "<fieldset><legend>Contacts</legend><ul class='mini'>" + (cons.length ? cons.map(function (x) { return "<li><b>" + esc(x.name) + "</b> · " + esc(x.role) + "<br><span class='log'>" + esc(x.email) + (x.phone ? " · " + esc(x.phone) : "") + "</span> <label class='switch' style='display:inline-flex'><input type='checkbox' data-textok='" + x.id + "'" + (c.textOk[x.id] ? " checked" : "") + "> OK to text</label> <button class='linkbtn' data-act='del-contact' data-id='" + x.id + "'>Remove</button></li>"; }).join("") : "<li class='log'>No contacts yet.</li>") + "</ul><div class='addrow'><input id='ncRole' placeholder='Role'><input id='ncName' placeholder='Name'><input id='ncEmail' placeholder='Email'><input id='ncPhone' placeholder='Phone'><button class='ghost' data-act='add-contact' data-id='" + c.id + "'>Add</button></div></fieldset>";
    if (c.kind !== "vendor") {
      var sqs = sequences();
      var ens = c.enrollments || [];
      h += "<fieldset><legend>Sequences</legend><ul class='mini'>" + (ens.length ? ens.map(function (e) { return "<li>" + esc(e.sequence_name) + " · " + esc(e.status) + "</li>"; }).join("") : "<li class='log'>Not in a sequence.</li>") + "</ul><div style='display:flex;gap:8px'><select id='enSeq'>" + sqs.map(function (s) { return "<option>" + esc(s.name) + "</option>"; }).join("") + "</select><button class='ghost' data-act='seq-enroll' data-id='" + c.id + "'>Start sequence</button></div></fieldset>";
    }
    h += "<fieldset><legend>Deals</legend><ul class='mini'>" + (deals.length ? deals.map(function (d) { return "<li><button class='linkbtn' data-open-deal='" + d.id + "'>" + esc(d.description) + "</button> · " + esc(d.status === "lost" ? "Lost" : stageName(d.stage)) + "</li>"; }).join("") : "<li class='log'>No deals yet.</li>") + "</ul></fieldset>";
    var touches = S.outreach.filter(function (o) { return (o.company || "").toLowerCase() === c.name.toLowerCase(); }).slice(0, 8);
    if (touches.length) h += "<fieldset><legend>Outreach log</legend><p class='log'>Read only. This page does not send outreach.</p><ul class='mini'>" + touches.map(function (o) { return "<li>" + esc(o.contact || "") + " · " + esc(o.status || "") + "<br><span class='log'>" + esc(o.notes || "") + "</span></li>"; }).join("") + "</ul></fieldset>";
    h += "<fieldset><legend>Email and text status</legend>" + messageList(null, c.id) + "</fieldset>";
    h += notesHtml(c.id, null);
    h += "</div><div class='dfoot'>" + (c.kind !== "vendor" ? "<button class='primary' data-act='quick-log' data-kind='call' data-id='" + c.id + "'>Log call</button><button class='ghost' data-act='quick-log' data-kind='email' data-id='" + c.id + "'>Log email</button><button class='ghost' data-act='quick-log' data-kind='touch' data-id='" + c.id + "'>Log touch</button><button class='ghost' data-act='new-quote' data-company='" + c.id + "'>New quote</button><button class='ghost' data-act='new-deal' data-company='" + c.id + "'>New deal</button>" : "") + "</div>";
    openDrawer(h);
    $("#drawer").dataset.company = c.id;
  }

  function vDocs() {
    var rows = S.companies.filter(function (c) { return c.kind !== "vendor" && (c.kind === "customer" || c.setup_started); }).map(function (c) { return { c: c, st: setupStatus(c) }; });
    var h = "<div class='grid2'><div class='sect'><h2>Customer setup</h2><p class='lead'>Checklist state saves on the company. Alerts become follow-ups or drafts. Nothing is emailed.</p><div class='panel tablewrap'><table><thead><tr><th>Customer</th><th>Progress</th><th>Still missing</th></tr></thead><tbody>" + (rows.length ? rows.map(function (r) { return "<tr class='click' data-open-company='" + r.c.id + "'><td><b>" + esc(r.c.name) + "</b></td><td>" + r.st.done + " of " + r.st.total + "</td><td>" + (r.st.missing.length ? esc(r.st.missing.join(", ")) : "<span class='mg-good'>Complete</span>") + "</td></tr>"; }).join("") : "<tr><td colspan='3' class='empty'>No customers in setup.</td></tr>") + "</tbody></table></div></div>";
    h += "<div class='sect'><h2>Setup packet</h2><p class='lead'>File names only. The files themselves are not uploaded.</p><div class='panel'>" + PACKET.template.map(function (name) { return "<div class='cf'><b>" + esc(name) + "</b></div>"; }).join("") + "</div></div></div>";
    var vrows = S.companies.filter(function (c) { return c.kind === "vendor"; }).map(function (c) { syncReadyFlags(c); return { c: c, st: setupStatus(c) }; });
    h += "<div class='grid2' style='margin-top:28px'><div class='sect'><h2>Vendor setup</h2><p class='lead'>When the vendor form and W-9 are both checked, the company is flagged Alert Amber and Ready for QuickBooks.</p><div class='panel tablewrap'><table><thead><tr><th>Vendor</th><th>Progress</th><th>Flags</th></tr></thead><tbody>" + (vrows.length ? vrows.map(function (r) { return "<tr class='click' data-open-company='" + r.c.id + "'><td><b>" + esc(r.c.name) + "</b></td><td>" + r.st.done + " of " + r.st.total + "</td><td>" + (r.c.alert_amber ? "<span class='chip'>Alert Amber</span> " : "") + (r.c.ready_for_qb ? "<span class='chip active'>Ready for QuickBooks</span>" : "") + (r.c.qb_id ? "<span class='chip active'>Marked</span>" : "") + "</td></tr>"; }).join("") : "<tr><td colspan='3' class='empty'>No vendors yet.</td></tr>") + "</tbody></table></div></div>";
    h += "<div class='sect'><h2>Vendor packet</h2><div class='panel'>" + PACKET.vtemplate.map(function (name) { return "<div class='cf'><b>" + esc(name) + "</b></div>"; }).join("") + "</div></div></div>";
    $("#view").innerHTML = h;
  }

  function vTasks() {
    var mine = S.tasks.filter(function (t) { return !taskWho || t.assignee === taskWho; });
    var groups = [["Overdue", function (t) { return !t.done && t.due < TODAY; }], ["Today", function (t) { return !t.done && t.due === TODAY; }], ["Coming up", function (t) { return !t.done && t.due > TODAY; }], ["Done", function (t) { return t.done; }]];
    var h = "<div class='bar'><select id='pf'><option value=''>Everyone</option>" + S.team.map(function (p) { return "<option" + (taskWho === p.name ? " selected" : "") + ">" + esc(p.name) + "</option>"; }).join("") + "</select><span class='log'>Auto items are follow-ups or drafts. Nothing is emailed or texted.</span></div><div class='grid2'><div>";
    groups.forEach(function (g) {
      var ts = mine.filter(g[1]).sort(function (a, b) { return a.due < b.due ? -1 : 1; });
      if (g[0] === "Done" && !ts.length) return;
      h += "<div class='tgroup'><h2>" + g[0] + " <span class='log'>" + ts.length + "</span></h2><div class='panel'>" + (ts.length ? ts.slice(0, g[0] === "Done" ? 12 : 99).map(function (t) {
        return "<div class='task" + (t.done ? " done" : "") + "'><input type='checkbox' data-act='toggle-task' data-id='" + t.id + "'" + (t.done ? " checked" : "") + "><div class='tt'><div>" + esc(t.title) + (t.rule_id || (t.dedupe_key || "").indexOf("draft:") === 0 ? "<span class='auto'>Auto</span>" : "") + "</div><div class='tm'>" + esc(t.assignee) + " · due " + (t.due === TODAY ? "today" : shortDate(t.due)) + (t.deal_id ? " · <button class='linkbtn' data-open-deal='" + t.deal_id + "'>Open deal</button>" : "") + "</div></div></div>";
      }).join("") : "<div class='empty'>Nothing here.</div>") + "</div></div>";
    });
    h += "</div><div class='sect'><h2>Add a follow-up</h2><div class='panel' style='padding:14px'><div class='fields'><div class='f wide'><label>Follow-up</label><input id='ntTitle'></div><div class='f'><label>Who</label><select id='ntWho'>" + S.team.map(function (p) { return "<option>" + esc(p.name) + "</option>"; }).join("") + "</select></div><div class='f'><label>Due</label><input type='date' id='ntDue' value='" + TODAY + "'></div></div><div class='mactions'><button class='primary' data-act='add-task'>Add follow-up</button></div></div></div></div>";
    $("#view").innerHTML = h;
    $("#pf").addEventListener("change", function (e) { taskWho = e.target.value; vTasks(); });
  }

  function vCalendar() {
    var base = calMonth ? new Date(calMonth + "-01T00:00:00") : new Date(T.getFullYear(), T.getMonth(), 1);
    var y = base.getFullYear(), m = base.getMonth();
    var first = new Date(y, m, 1);
    var start = new Date(first); start.setDate(1 - first.getDay());
    var evs = {};
    S.deals.filter(function (d) { return d.status !== "lost" && SI(d.stage) >= WON(); }).forEach(function (d) {
      if (d.est_ship_date) (evs[d.est_ship_date] = evs[d.est_ship_date] || []).push({ d: d, t: "Ships", c: "" });
      if (d.est_delivery_date) (evs[d.est_delivery_date] = evs[d.est_delivery_date] || []).push({ d: d, t: "Delivers", c: "del" });
    });
    var h = "<div class='bar'><button class='ghost' data-act='month' data-n='-1'>Previous</button><h2 class='cond' style='font-size:24px;min-width:190px;text-align:center'>" + first.toLocaleDateString("en-US", { month: "long", year: "numeric" }) + "</h2><button class='ghost' data-act='month' data-n='1'>Next</button><button class='ghost' data-act='month' data-n='0'>This month</button><div class='spacer'></div><span class='log'>Ship and delivery dates from deals. Nothing is sent to Google Calendar.</span></div>";
    h += "<div class='tablewrap'><div class='cal'>" + ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(function (x) { return "<div class='dow'>" + x + "</div>"; }).join("");
    for (var i = 0; i < 42; i++) {
      var x = new Date(start); x.setDate(start.getDate() + i); var k = iso(x);
      h += "<div class='day" + (x.getMonth() !== m ? " out" : "") + (k === TODAY ? " today" : "") + "'><div class='num'>" + x.getDate() + "</div>" + (evs[k] || []).map(function (e) { return "<button class='ev " + e.c + "' data-open-deal='" + e.d.id + "'>" + e.t + ": " + esc(e.d.description) + "</button>"; }).join("") + "</div>";
    }
    h += "</div></div>";
    $("#view").innerHTML = h;
  }

  function viewLines(d) {
    if (d.quote && d.quote.lines && d.quote.lines.length) return d.quote.lines;
    return [{ desc: d.description || "", qty: d.quantity, unit: "", vendor_id: d.vendor_id, cost: d.vendor_price_per_unit, price: d.price_per_unit, freight: d.freight, category: "", invoice_number: "", line_date: d.won_at || d.stage_changed_at || "", sales_rep: d.sales_rep || "", product_id: null }];
  }
  function orderRows() {
    var vendors = S.companies.filter(function (c) { return c.kind === "vendor"; });
    var customers = S.companies.filter(function (c) { return c.kind !== "vendor"; });
    var rows = [];
    S.deals.forEach(function (d) {
      if (d.status === "lost") return;
      var open = SI(d.stage) >= WON() && !d.paid_date;
      var paid = !!d.paid_date && SI(d.stage) >= WON();
      if (orderF.scope === "open" && !open) return;
      if (orderF.scope === "paid" && !paid) return;
      viewLines(d).forEach(function (l, i) {
        var customer = co(d.company_id);
        var vendor = co(l.vendor_id);
        var calc = Orders.calc(l);
        rows.push({
          dealId: d.id, index: i, line: l, calc: calc,
          lineDate: l.line_date || d.won_at || d.stage_changed_at || "",
          customerId: d.company_id, customer: customer ? customer.name : "",
          description: l.desc || "", invoice: l.invoice_number || "",
          rep: l.sales_rep || (d.quote && d.quote.rep) || d.sales_rep || "",
          category: l.category || "", vendorId: l.vendor_id || "", vendor: vendor ? vendor.name : "",
          qty: l.qty, unit: l.unit || "", vendorPrice: l.cost, freight: l.freight, sellPrice: l.price,
          stage: stageName(d.stage), po: d.customer_po_number || "",
          estShip: d.est_ship_date || "", estDelivery: d.est_delivery_date || "",
          invoiceSent: d.invoice_sent_date || "", paid: d.paid_date || ""
        });
      });
    });
    var q = (orderF.q || "").toLowerCase();
    rows = rows.filter(function (r) {
      if (orderF.customer && String(r.customerId) !== String(orderF.customer)) return false;
      if (orderF.rep && r.rep !== orderF.rep) return false;
      if (orderF.category && r.category !== orderF.category) return false;
      if (orderF.vendor && String(r.vendorId) !== String(orderF.vendor)) return false;
      if (q && (r.customer + " " + r.description + " " + r.invoice + " " + r.vendor).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var dir = orderF.dir;
    var key = orderF.sort;
    rows.sort(function (a, b) {
      var av = a[key], bv = b[key];
      if (av == null || av === "") return 1;
      if (bv == null || bv === "") return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
    return { rows: rows, customers: customers, vendors: vendors };
  }
  function vOrders() {
    var pack = orderRows();
    var rows = pack.rows;
    var tot = Orders.totals(rows);
    function th(label, key) {
      var mark = orderF.sort === key ? (orderF.dir > 0 ? " ↑" : " ↓") : "";
      return "<th data-sort='" + key + "'>" + esc(label) + mark + "</th>";
    }
    function sel(list, val, attr, label) {
      return "<select " + attr + "><option value=''>Choose…</option>" + list.map(function (o) {
        var id = o.id != null ? o.id : o;
        var name = o.name || o;
        return "<option value='" + esc(id) + "'" + (String(val) === String(id) ? " selected" : "") + ">" + esc(label ? label(o) : name) + "</option>";
      }).join("") + "</select>";
    }
    var h = "<div class='bar'><input type='search' id='oq' placeholder='Customer, product, invoice' value='" + esc(orderF.q) + "'>";
    h += "<select id='ocust'><option value=''>All customers</option>" + pack.customers.map(function (c) { return "<option value='" + c.id + "'" + (String(orderF.customer) === String(c.id) ? " selected" : "") + ">" + esc(c.name) + "</option>"; }).join("") + "</select>";
    h += "<select id='orep'><option value=''>All reps</option>" + repOptions().map(function (r) { return "<option" + (orderF.rep === r ? " selected" : "") + ">" + esc(r) + "</option>"; }).join("") + "</select>";
    h += "<select id='ocat'><option value=''>All categories</option>" + Orders.CATEGORIES.map(function (c) { return "<option" + (orderF.category === c ? " selected" : "") + ">" + esc(c) + "</option>"; }).join("") + "</select>";
    h += "<select id='ovend'><option value=''>All vendors</option>" + pack.vendors.map(function (c) { return "<option value='" + c.id + "'" + (String(orderF.vendor) === String(c.id) ? " selected" : "") + ">" + esc(c.name) + "</option>"; }).join("") + "</select>";
    h += "<select id='oscope'><option value='open'" + (orderF.scope === "open" ? " selected" : "") + ">Open (not paid)</option><option value='paid'" + (orderF.scope === "paid" ? " selected" : "") + ">Paid</option><option value='all'" + (orderF.scope === "all" ? " selected" : "") + ">All lines</option></select>";
    h += "<button class='ghost' data-act='orders-csv'>Export CSV</button></div>";
    if (S.linesNote) h += "<p class='banner'>" + esc(S.linesNote) + "</p>";
    h += "<p class='log'>Same columns as the KPI Order Log, one row per product line. The green columns are calculated. Vendor is a company picklist. Sales rep adds House and Brady from the sheet; they are not team rows. QuickBooks sync is off, so reaching Customer PO does not create an Estimate. The Google Sheet is not connected.</p>";
    h += "<div class='panel tablewrap'><table class='olog'><thead><tr>";
    h += th("Line Created Date", "lineDate") + th("Customer", "customer") + th("Product Description", "description") + th("Invoice #", "invoice") + th("Sales Rep", "rep") + th("Category", "category") + th("Vendor", "vendor") + th("Qty Ordered", "qty") + th("Unit", "unit") + th("Vendor Price (ea)", "vendorPrice") + th("Freight Cost ($)", "freight") + th("Sell Price (ea)", "sellPrice");
    h += "<th>Order Revenue ($)</th><th>Vendor Cost ($)</th><th>Overall Cost ($)</th><th>Gross Profit ($)</th><th>Margin %</th>";
    h += th("Stage", "stage") + th("Customer PO", "po") + th("Est. ship", "estShip") + th("Est. delivery", "estDelivery") + th("Invoice sent", "invoiceSent") + th("Paid", "paid") + "<th></th></tr></thead><tbody>";
    if (!rows.length) h += "<tr><td colspan='24' class='empty'>No lines in this view. An order line shows up when a deal reaches Customer PO, or choose All lines.</td></tr>";
    rows.forEach(function (r) {
      var id = "data-ol='" + r.dealId + ":" + r.index;
      h += "<tr>";
      h += "<td><input type='date' " + id + ":line_date' value='" + esc(r.lineDate || "") + "' aria-label='Line created date'></td>";
      h += "<td>" + sel(pack.customers, r.customerId, "data-od='" + r.dealId + ":company_id'", function (c) { return c.name; }) + "</td>";
      h += "<td><input " + id + ":desc' value='" + esc(r.description) + "' aria-label='Product description'></td>";
      h += "<td><input " + id + ":invoice_number' value='" + esc(r.invoice) + "' aria-label='Invoice number'></td>";
      h += "<td><select " + id + ":sales_rep'>" + repOptions().map(function (n) { return "<option" + (r.rep === n ? " selected" : "") + ">" + esc(n) + "</option>"; }).join("") + "</select></td>";
      h += "<td><select " + id + ":category'><option value=''>Choose…</option>" + Orders.CATEGORIES.map(function (c) { return "<option" + (r.category === c ? " selected" : "") + ">" + esc(c) + "</option>"; }).join("") + "</select></td>";
      h += "<td>" + sel(pack.vendors, r.vendorId, id + ":vendor_id'", function (c) { return c.name; }) + "</td>";
      h += "<td><input type='number' step='any' " + id + ":qty' value='" + esc(r.qty == null ? "" : r.qty) + "' aria-label='Qty ordered'></td>";
      h += "<td><input " + id + ":unit' value='" + esc(r.unit) + "' aria-label='Unit'></td>";
      h += "<td><input type='number' step='any' " + id + ":cost' value='" + esc(r.vendorPrice == null ? "" : r.vendorPrice) + "' aria-label='Vendor price'></td>";
      h += "<td><input type='number' step='any' " + id + ":freight' value='" + esc(r.freight == null ? "" : r.freight) + "' aria-label='Freight'></td>";
      h += "<td><input type='number' step='any' " + id + ":price' value='" + esc(r.sellPrice == null ? "" : r.sellPrice) + "' aria-label='Sell price'></td>";
      h += "<td class='calc'>" + Orders.money(r.calc.revenue) + "</td><td class='calc'>" + Orders.money(r.calc.vendorCost) + "</td><td class='calc'>" + Orders.money(r.calc.overall) + "</td><td class='calc'>" + Orders.money(r.calc.profit) + "</td><td class='calc'>" + Orders.pct(r.calc.margin) + "</td>";
      h += "<td>" + esc(r.stage) + "</td>";
      h += "<td><input data-od='" + r.dealId + ":customer_po_number' value='" + esc(r.po) + "' aria-label='Customer PO'></td>";
      h += "<td><input type='date' data-od='" + r.dealId + ":est_ship_date' value='" + esc(r.estShip) + "' aria-label='Est ship'></td>";
      h += "<td><input type='date' data-od='" + r.dealId + ":est_delivery_date' value='" + esc(r.estDelivery) + "' aria-label='Est delivery'></td>";
      h += "<td><input type='date' data-od='" + r.dealId + ":invoice_sent_date' value='" + esc(r.invoiceSent) + "' aria-label='Invoice sent'></td>";
      h += "<td><input type='date' data-od='" + r.dealId + ":paid_date' value='" + esc(r.paid) + "' aria-label='Paid'></td>";
      h += "<td><button class='linkbtn' data-open-deal='" + r.dealId + "'>Deal</button></td></tr>";
    });
    h += "</tbody><tfoot><tr><td colspan='12'>Totals</td><td class='calc'>" + Orders.money(tot.revenue) + "</td><td class='calc'>" + Orders.money(tot.vendorCost) + "</td><td class='calc'>" + Orders.money(tot.overall) + "</td><td class='calc'>" + Orders.money(tot.profit) + "</td><td class='calc'>" + Orders.pct(tot.margin) + "</td><td colspan='7'>" + rows.length + " lines</td></tr></tfoot></table></div>";
    $("#view").innerHTML = h;
    var oq = $("#oq");
    oq.addEventListener("input", function (e) { orderF.q = e.target.value; var p = e.target.selectionStart; vOrders(); var n = $("#oq"); n.focus(); if (p != null) n.setSelectionRange(p, p); });
    $("#ocust").addEventListener("change", function (e) { orderF.customer = e.target.value; vOrders(); });
    $("#orep").addEventListener("change", function (e) { orderF.rep = e.target.value; vOrders(); });
    $("#ocat").addEventListener("change", function (e) { orderF.category = e.target.value; vOrders(); });
    $("#ovend").addEventListener("change", function (e) { orderF.vendor = e.target.value; vOrders(); });
    $("#oscope").addEventListener("change", function (e) { orderF.scope = e.target.value; vOrders(); });
    document.querySelectorAll(".olog th[data-sort]").forEach(function (thEl) {
      thEl.addEventListener("click", function () {
        var key = thEl.dataset.sort;
        orderF.dir = orderF.sort === key ? -orderF.dir : 1;
        orderF.sort = key;
        vOrders();
      });
    });
  }

  function whenText(r) {
    var tm = { sales: "Sales", operations: "Operations", accounting: "Accounting", rep: "the deal’s sales rep" };
    if (r.trigger === "stage_enter") return "When a deal moves into " + stageName(r.stage) + ", queue a follow-up or draft for " + (tm[r.notify] || r.notify) + ".";
    if (r.trigger === "date_reached") return "On the " + FL(r.field).toLowerCase() + " while the deal sits in " + stageName(r.stage) + ", alert " + (tm[r.notify] || r.notify) + ".";
    if (r.trigger === "stale_stage") return "If a deal is still in " + stageName(r.stage) + ", remind " + (tm[r.notify] || r.notify) + ".";
    if (r.trigger === "new_customer") return "When a company becomes a customer, start setup and alert " + (tm[r.notify] || r.notify) + ".";
    if (r.trigger === "new_vendor") return "When a vendor is added, alert " + (tm[r.notify] || r.notify) + ".";
    if (r.trigger === "vendor_ready") return "When a vendor form and W-9 are back, alert " + (tm[r.notify] || r.notify) + ".";
    if (r.trigger === "setup_stale") return "If setup is still open, remind " + (tm[r.notify] || r.notify) + ".";
    return "If a company on the " + (r.list || "") + " list has no contact, remind " + (tm[r.notify] || r.notify) + ".";
  }
  function vAutomations() {
    var h = "<div class='grid2'><div class='sect'><h2>Automations</h2><p class='lead'>Moving a deal queues a follow-up, a draft, or both. Nothing is emailed or texted from this page.</p><div class='panel'>";
    h += S.rules.map(function (r) {
      return "<div class='rule'><div><h3>" + esc(r.name) + "</h3><div class='when'>" + esc(whenText(r)) + "</div></div><label class='switch'><input type='checkbox' data-act='rule-on' data-id='" + r.id + "'" + (r.active ? " checked" : "") + "> On</label><div class='full'><input type='text' data-rule-msg='" + r.id + "' value='" + esc(r.msg) + "'></div>" + ((r.trigger === "stale_stage" || r.trigger === "no_contact" || r.trigger === "setup_stale") ? "<div class='full'><label class='log'>Days: <input class='days' data-rule-days='" + r.id + "' value='" + esc((r.days || []).join(", ")) + "'></label></div>" : "") + "</div>";
    }).join("");
    var pending = PENDING_RULES.filter(function (p) { return !S.rules.some(function (r) { return r.name === p.name; }); });
    if (pending.length) h += pending.map(function (p) { return "<div class='rule'><div><h3>" + esc(p.name) + "</h3><div class='when'>" + esc(whenText(p)) + " In the migration, not in the database yet.</div></div></div>"; }).join("");
    h += "</div></div><div><div class='sect'><h2>Who gets alerts, and how</h2><div class='panel'>" + S.team.map(function (p) {
      return "<div class='cf'><div><b>" + esc(p.name) + "</b> <span class='log'>" + esc(p.team) + " · " + esc(p.email) + "</span></div><select data-act='via' data-id='" + p.id + "'><option value='task'" + (p.via === "task" ? " selected" : "") + ">Follow-up list</option><option value='email'" + (p.via === "email" ? " selected" : "") + ">Draft only</option><option value='both'" + (p.via === "both" ? " selected" : "") + ">Follow-up and draft</option></select></div>";
    }).join("") + "</div><p class='log'>Draft only means a draft row, not a sent email.</p></div>";
    var drafts = S.activity.filter(function (a) { return a.kind === "draft"; }).slice(0, 40);
    h += "<div class='sect' style='margin-top:16px'><h2>Drafts</h2><p class='lead'>Queued here instead of being sent.</p><div class='panel'><ul class='outbox'>" + (drafts.length ? drafts.map(function (o) { return "<li>" + esc(o.note) + "<div class='tm'>" + shortDate(o.at) + "</div></li>"; }).join("") : "<li class='log'>None yet.</li>") + "</ul></div></div></div></div>";
    $("#view").innerHTML = h;
  }

  function vSequences() {
    var sqs = sequences();
    var pend = pendingQueue();
    var h = "<div class='grid2'><div><div class='sect'><h2>Waiting for your OK <span class='log'>" + pend.length + "</span></h2><p class='lead'>Queue draft writes a follow-up and a draft. It does not email or text anyone.</p>";
    if (S.sequenceNote) h += "<p class='banner'>" + esc(S.sequenceNote) + "</p>";
    h += "<div class='panel'>" + (pend.length ? pend.map(function (en) {
      var sq = seqByName(en.sequence_name);
      var st = sq.steps[en.step];
      var variant = (st.variants || [])[0] || {};
      var ct = seqContact(en);
      var c = co(en.company_id) || {};
      return "<div class='emailcard'><div class='log'>" + esc(sq.name) + ", step " + (en.step + 1) + " of " + sq.steps.length + "</div><div><b>To:</b> " + (ct ? esc(ct.name) + " &lt;" + esc(ct.email) + "&gt;" : "<span class='late'>No contact email yet</span>") + " at " + esc(c.name) + "</div><div><b>Subject:</b> " + esc(fillSeq(variant.subject, en)) + "</div><pre>" + esc(fillSeq(variant.body, en)) + "</pre><button class='primary' data-act='seq-send' data-id='" + esc(en.id) + "'>Queue draft</button> <button class='ghost' data-act='seq-skip' data-id='" + esc(en.id) + "'>Skip</button> <button class='linkbtn' data-act='seq-stop' data-id='" + esc(en.id) + "'>Stop</button></div>";
    }).join("") : "<div class='empty'>Nothing waiting. Start a sequence from a company, or sign in if the steps did not load.</div>") + "</div></div></div>";
    h += "<div class='sect'><h2>Sequences</h2><p class='lead'>Seeded copy from crm_sequence_steps. Variants on the same step are alternate wording. Placeholders: {{first_name}}, {{company}}, {{description}}, {{quote_number}}, {{rep}}.</p><div class='panel'>" + (sqs.length ? sqs.map(function (sq) {
      return "<details class='seq'" + (openSeq[sq.name] ? " open" : "") + "><summary><b>" + esc(sq.name) + "</b> <span class='log'>" + sq.steps.length + " steps" + (sq.approve ? ", approve each" : "") + (sq.active ? "" : ", off") + "</span></summary>" + sq.steps.map(function (st) {
        return "<div class='step'><b>Step " + st.step + "</b> <span class='log'>Day</span> <input type='number' data-step-day='" + st.variants.map(function (v) { return v.id; }).join(",") + "' value='" + esc(st.day) + "' style='width:80px'>" + st.variants.map(function (v) {
          return "<div class='log'>" + esc(v.variant || "Default") + "</div><input data-step-subject='" + v.id + "' value='" + esc(v.subject || "") + "'><textarea data-step-body='" + v.id + "'>" + esc(v.body || "") + "</textarea>";
        }).join("") + "</div>";
      }).join("") + "</details>";
    }).join("") : "<div class='empty'>No steps loaded.</div>") + "</div></div></div>";
    $("#view").innerHTML = h;
  }

  function vSetup() {
    var tn = { sales: "Sales", operations: "Operations", accounting: "Accounting" };
    var h = "<div class='grid2'><div class='sect'><h2>Pipeline stages</h2><p class='lead'>Rename a stage or edit the required field keys. A deal cannot move forward until those fields are filled.</p><div class='panel'>" + S.stages.map(function (s, i) {
      return "<div class='setup-stage'><span class='log'>" + (i + 1) + "</span><input data-stage-name='" + s.key + "' value='" + esc(s.name) + "'><span class='chip'>" + (tn[s.team] || s.team) + "</span><div style='grid-column:2/-1'><input data-stage-req='" + s.key + "' value='" + esc((s.req || []).join(", ")) + "' placeholder='Required field keys, comma separated'></div></div>";
    }).join("") + "</div></div>";
    h += "<div><div class='sect'><h2>Custom fields</h2><div class='panel'>" + (S.fields.length ? S.fields.map(function (f) { return "<div class='cf'><div><b>" + esc(f.label) + "</b> <span class='log'>" + esc(f.entity) + " · " + esc(f.type) + "</span></div><button class='linkbtn' data-act='del-field' data-id='" + f.id + "'>Remove</button></div>"; }).join("") : "<div class='empty'>No custom fields.</div>") + "<div class='cfadd'><input id='cfLabel' placeholder='Field name'><select id='cfEntity'><option value='deal'>Deals</option><option value='company'>Companies</option></select><select id='cfType'><option value='text'>Text</option><option value='number'>Number</option><option value='date'>Date</option><option value='select'>Dropdown</option><option value='checkbox'>Checkbox</option></select><button class='ghost' data-act='add-field'>Add</button><input id='cfOpts' placeholder='Dropdown choices, comma separated' style='grid-column:1/-1'></div></div></div>";
    h += "<div class='sect' style='margin-top:16px'><h2>Product catalog</h2><p class='lead'>QuickBooks Item names and part numbers. Import is off until crm_products exists. The QuickBooks read is a separate function and is not connected.</p>";
    if (S.productsNote) h += "<p class='banner'>" + esc(S.productsNote) + "</p>";
    h += "<div class='panel'>" + (S.products.length ? S.products.map(function (p) { return "<div class='cf'><div><b>" + esc(p.name) + "</b> <span class='log'>" + esc(p.sku || "no SKU") + (p.default_price != null ? " · " + Orders.money(p.default_price) : "") + "</span></div></div>"; }).join("") : "<div class='empty'>No products yet.</div>") + "<div class='cfadd'><input type='file' id='prodCsv' accept='.csv,text/csv'><button class='ghost' data-act='import-products'>Import item CSV</button></div><p class='log'>Accepts a QuickBooks item export. Headers it understands: Product/Service Name, SKU, Sales Description, Sales Price, and an item id. This does not write to QuickBooks.</p></div></div>";
    h += "<div class='sect' style='margin-top:16px'><h2>Team</h2><div class='panel'>" + S.team.map(function (p) {
      return "<div class='cf'><div><b>" + esc(p.name) + "</b> <span class='log'>" + esc(p.email) + " · " + esc(p.team) + (p.active ? "" : " · inactive") + "</span></div></div>";
    }).join("") + "</div><p class='log'>Alert delivery is on the Automations tab. Data saves to Supabase per record. There is no reset-to-sample button.</p></div></div></div>";
    $("#view").innerHTML = h;
  }

  function findQuoteDeal(id) { return dealById(id); }
  function openQuote(dealId) {
    var d = dealById(dealId); if (!d) return;
    if (!d.quote) d.quote = blankQuote(d);
    var q = d.quote;
    var c = co(q.company_id) || {};
    var ships = S.shipTos.filter(function (s) { return s.company_id === +q.company_id; });
    var cons = S.contacts.filter(function (x) { return x.company_id === +q.company_id; });
    var vend = S.companies.filter(function (x) { return x.kind === "vendor"; });
    function sel(attr, list, v, lab) {
      return "<select " + attr + "><option value=''>Choose…</option>" + list.map(function (o) { return "<option value='" + o.id + "'" + (+v === o.id ? " selected" : "") + ">" + esc(lab(o)) + "</option>"; }).join("") + "</select>";
    }
    var h = "<div class='dhead'><div style='flex:1'><div class='sub'>" + esc(c.name || "No customer") + "</div><h2>Quote " + esc(q.number || "") + "</h2><div class='sub'><span class='chip'>" + esc(q.status || "draft") + "</span></div></div><button class='ghost' data-act='close'>Close</button></div><div class='dbody'>";
    if (S.quotesNote) h += "<p class='banner'>" + esc(S.quotesNote) + "</p>";
    h += "<p class='log'>Each field you change is copied onto the linked deal and saved on its own. Print and Download leave out vendor cost and margin. Nothing is emailed.</p>";
    h += "<fieldset><legend>Customer</legend><div class='fields'>" +
      "<div class='f'><label>Customer</label>" + sel("data-q='company_id'", S.companies.filter(function (x) { return x.kind !== "vendor"; }), q.company_id, function (o) { return o.name; }) + "</div>" +
      "<div class='f'><label>Attention</label>" + sel("data-q='contact_id'", cons, q.contact_id, function (o) { return o.name; }) + "</div>" +
      "<div class='f'><label>Ship-to</label>" + sel("data-q='ship_to_id'", ships, q.ship_to_id, function (o) { return o.label + ": " + o.address; }) + "</div>" +
      "<div class='f'><label>Sales rep</label><select data-q='rep'>" + repOptions().map(function (r) { return "<option" + (q.rep === r ? " selected" : "") + ">" + esc(r) + "</option>"; }).join("") + "</select></div>" +
      "<div class='f'><label>Quote date</label><input type='date' data-q='date' value='" + esc(q.date || "") + "'></div>" +
      "<div class='f'><label>Quote sent date</label><input type='date' data-q='sent_date' value='" + esc(q.sent_date || "") + "'></div>" +
      "<div class='f'><label>Valid for (days)</label><input type='number' data-q='valid' value='" + esc(q.valid || 30) + "'></div>" +
      "<div class='f'><label>Freight</label><input type='number' step='any' data-q='freight' value='" + esc(q.freight == null ? "" : q.freight) + "'></div>" +
      "<div class='f'><label>Customer PO #</label><input data-q='po' value='" + esc(q.po || "") + "'></div></div></fieldset>";
    h += "<fieldset><legend>Line items</legend>";
    if (S.productsNote) h += "<p class='log'>" + esc(S.productsNote) + "</p>";
    h += "<div class='tablewrap'><table class='qlines'><thead><tr><th>Catalog</th><th>Product</th><th>Category</th><th>Invoice #</th><th>Qty</th><th>Unit</th><th>Vendor</th><th>Vendor cost</th><th>Sell price</th><th>Line total</th><th></th></tr></thead><tbody>" +
      q.lines.map(function (l, i) {
        var catalog = "<select data-ql='" + i + ":product_id'><option value=''>Type a description</option>" + S.products.filter(function (p) { return p.active !== false; }).map(function (p) {
          return "<option value='" + p.id + "'" + (+l.product_id === p.id ? " selected" : "") + ">" + esc(p.sku ? p.sku + " · " + p.name : p.name) + "</option>";
        }).join("") + "</select>";
        return "<tr><td>" + catalog + "</td><td><input data-ql='" + i + ":desc' value='" + esc(l.desc || "") + "' aria-label='Product'></td><td><select data-ql='" + i + ":category'><option value=''>Choose…</option>" + Orders.CATEGORIES.map(function (c) { return "<option" + (l.category === c ? " selected" : "") + ">" + esc(c) + "</option>"; }).join("") + "</select></td><td><input data-ql='" + i + ":invoice_number' value='" + esc(l.invoice_number || "") + "' aria-label='Invoice number'></td><td class='n'><input type='number' step='any' data-ql='" + i + ":qty' value='" + esc(l.qty == null ? "" : l.qty) + "' aria-label='Quantity'></td><td class='s'><select data-ql='" + i + ":unit'>" + Q.UNITS.map(function (u) { return "<option" + (l.unit === u ? " selected" : "") + ">" + u + "</option>"; }).join("") + "</select></td><td>" + sel("data-ql='" + i + ":vendor_id'", vend, l.vendor_id, function (o) { return o.name; }) + "</td><td class='n'><input type='number' step='any' data-ql='" + i + ":cost' value='" + esc(l.cost == null ? "" : l.cost) + "' aria-label='Vendor cost'></td><td class='n'><input type='number' step='any' data-ql='" + i + ":price' value='" + esc(l.price == null ? "" : l.price) + "' aria-label='Sell price'></td><td class='n'>" + Orders.money(Orders.calc(l).revenue) + "</td><td>" + (q.lines.length > 1 ? "<button class='linkbtn' data-act='q-del-line' data-id='" + d.id + "' data-i='" + i + "'>Remove</button>" : "") + "</td></tr>";
      }).join("") + "</tbody></table></div><button class='ghost' data-act='q-add-line' data-id='" + d.id + "'>Add line</button> <button class='ghost' data-act='usual-order' data-id='" + d.id + "'>Use usual order</button><p class='log'>The first line fills the deal's description, price, quantity, vendor, vendor price, and freight. Vendor cost and margin stay off the PDF. Pick a catalog product when one exists so the name matches QuickBooks.</p></fieldset>";
    h += "<fieldset><legend>Terms on the quote</legend><div class='f'><textarea data-q='terms'>" + esc(q.terms || "") + "</textarea></div></fieldset></div>";
    h += "<div class='dfoot'><button class='primary' data-act='q-download' data-id='" + d.id + "'>Download PDF</button><button class='ghost' data-act='q-print' data-id='" + d.id + "'>Print</button><button class='ghost' data-open-deal='" + d.id + "'>Open deal</button></div>";
    openDrawer(h, true);
    $("#drawer").dataset.quote = d.id;
    $("#drawer").dataset.deal = "";
  }

  function openDrawer(html, wide) {
    var dr = $("#drawer");
    dr.classList.toggle("wide", !!wide);
    dr.innerHTML = html;
    dr.classList.add("open");
    dr.setAttribute("aria-hidden", "false");
    $("#scrim").classList.add("open");
  }
  function closeDrawer() {
    var dr = $("#drawer");
    dr.classList.remove("open");
    dr.setAttribute("aria-hidden", "true");
    dr.dataset.deal = "";
    dr.dataset.company = "";
    dr.dataset.quote = "";
    $("#scrim").classList.remove("open");
  }
  function openModal(html) { $("#mbox").innerHTML = html; $("#modal").classList.add("open"); }
  function closeModal() { $("#modal").classList.remove("open"); }

  async function moveDeal(id, toKey) {
    var d = dealById(id);
    if (!d || d.stage === toKey) return;
    if (d.status === "lost") { toast("Reopen this deal before moving it."); return; }
    var miss = missingFor(d, toKey);
    if (miss.length) { openGate(d, toKey, miss); return; }
    if (await commitMove(d, toKey)) { render(); if ($("#drawer").dataset.deal === String(d.id)) openDeal(d.id); }
  }
  function openGate(d, toKey, miss) {
    var pre = { quote_sent_date: TODAY, invoice_sent_date: TODAY, paid_date: TODAY };
    openModal("<h2>Before it moves to " + esc(stageName(toKey)) + "</h2><p>These fields have to be filled first.</p><div class='fields' id='gate'>" + miss.map(function (k) {
      var f = DEAL_FIELDS.find(function (x) { return x.k === k; }) || { k: k, l: k, t: "text" };
      var v = empty(d[k]) && pre[k] ? pre[k] : d[k];
      return "<div class='f'><label>" + esc(f.l || k) + "</label>" + inputFor(f, v, d, "data-g") + "</div>";
    }).join("") + "</div><div class='mactions'><button class='ghost' data-act='mclose'>Cancel</button><button class='primary' data-act='gate-save' data-id='" + d.id + "' data-to='" + toKey + "'>Save and move</button></div>");
  }

  async function onQuoteField(d, change) {
    var prev = clone(d.quote);
    if (change.part === "line") {
      var bits = change.raw.split(":");
      var idx = +bits[0];
      var key = bits[1];
      var line = d.quote.lines[idx];
      if (!line) return;
      if (key === "qty" || key === "cost" || key === "price" || key === "vendor_id" || key === "freight" || key === "product_id") line[key] = change.value === "" ? null : +change.value;
      else line[key] = change.value;
      if (key === "product_id" && line.product_id) {
        var prod = S.products.find(function (p) { return p.id === line.product_id; });
        if (prod) {
          line.desc = prod.description || prod.name;
          if (prod.unit) line.unit = prod.unit;
          if (prod.default_price != null) line.price = prod.default_price;
          if (prod.category) line.category = prod.category;
        }
      }
      if (key === "freight" && idx === 0) d.quote.freight = line.freight;
      if (key === "sales_rep" && idx === 0) d.quote.rep = line.sales_rep || "";
      change = { part: "line", index: idx, key: key, value: line[key] };
    } else {
      var k = change.key;
      var v = change.value;
      if (k === "company_id" || k === "ship_to_id" || k === "contact_id" || k === "valid") v = v === "" ? null : +v;
      if (k === "freight") v = v === "" ? null : +v;
      d.quote[k] = v;
      if (k === "freight" && d.quote.lines[0]) d.quote.lines[0].freight = v;
      if (k === "rep" && d.quote.lines[0]) d.quote.lines[0].sales_rep = v || "";
      if (k === "company_id") {
        var ship = S.shipTos.find(function (s) { return s.company_id === v; });
        var ct = S.contacts.find(function (x) { return x.company_id === v; });
        d.quote.ship_to_id = ship ? ship.id : null;
        d.quote.contact_id = ct ? ct.id : null;
      }
      change = { part: "head", key: k, value: d.quote[k] };
    }
    var ok = await applyQuoteChange(d, prev, change);
    if (change.part === "head" && change.key === "company_id" && ok) {
      var extra = await saveDealColumns(d, { ship_to_id: d.quote.ship_to_id || null }, "deal");
      if (extra) d.ship_to_id = d.quote.ship_to_id || null;
    }
    render();
    if ($("#drawer").classList.contains("open")) openQuote(d.id);
    if (!ok) return;
  }

  document.addEventListener("click", function (e) {
    var a = e.target.closest("[data-act]");
    var od = e.target.closest("[data-open-deal]");
    var oc = e.target.closest("[data-open-company]");
    if (a && a.tagName === "INPUT" && a.type === "checkbox" && a.dataset.act !== "toggle-task") return;
    if (a) { handle(a, e); return; }
    if (od) { openDeal(+od.dataset.openDeal); return; }
    if (oc) { openCompany(+oc.dataset.openCompany); return; }
    var tab = e.target.closest(".tab");
    if (tab) { S.view = tab.dataset.view; closeDrawer(); render(); window.scrollTo(0, 0); }
  });

  function handle(a, e) {
    var act = a.dataset.act;
    var id = a.dataset.id;
    if (act === "close") { closeDrawer(); return; }
    if (act === "mclose") { closeModal(); return; }
    if (act === "theme") { S.theme = S.theme === "dark" ? "light" : "dark"; localStorage.setItem("driven-crm-theme", S.theme); render(); return; }
    if (act === "toggle-col") { toggleCol(a.dataset.stage); return; }
    if (act === "toggle-zone") { toggleZone(a.dataset.zone); return; }
    if (act === "filter-default") { defaultFilter = clone(F); persistPrefs(); toast("Default filter saved for " + meName() + "."); return; }
    if (act === "filter-clear") { F = emptyFilter(); render(); return; }
    if (act === "filter-preset") {
      openModal("<h2>Save preset</h2><div class='f'><label>Name</label><input id='presetName' placeholder='Ship this week'></div><div class='mactions'><button class='ghost' data-act='mclose'>Cancel</button><button class='primary' data-act='preset-ok'>Save</button></div>");
      return;
    }
    if (act === "preset-ok") {
      var name = ($("#presetName").value || "").trim();
      if (!name || name === "default" || name === "__board") { toast("Give the preset a different name."); return; }
      presets = presets.filter(function (p) { return p.name !== name; });
      presets.push({ name: name, filter: clone(F) });
      if (presets.length > 12) presets = presets.slice(-12);
      closeModal();
      persistPrefs();
      render();
      return;
    }
    if (act === "move") { moveDeal(+id, a.dataset.to); return; }
    if (act === "gate-save") { gateSave(+id, a.dataset.to); return; }
    if (act === "new-deal") { newDealModal(a.dataset.company || ""); return; }
    if (act === "nd-ok") { createDealFromModal(); return; }
    if (act === "new-company") { openModal("<h2>New company</h2><div class='fields'><div class='f wide'><label>Company name</label><input id='ncoName'></div><div class='f'><label>Type</label><select id='ncoKind'><option value='prospect'>Prospect</option><option value='customer'>Customer</option><option value='vendor'>Vendor</option></select></div><div class='f'><label>Owner</label><select id='ncoOwner'>" + reps().map(function (r) { return "<option>" + esc(r) + "</option>"; }).join("") + "</select></div></div><div class='mactions'><button class='ghost' data-act='mclose'>Cancel</button><button class='primary' data-act='nco-ok'>Add company</button></div>"); return; }
    if (act === "nco-ok") { createCompanyFromModal(); return; }
    if (act === "new-quote") { ensureQuote(a.dataset.deal ? +a.dataset.deal : null, a.dataset.company ? +a.dataset.company : null); return; }
    if (act === "new-quote-pick") { openModal("<h2>New quote</h2><div class='f'><label>Customer</label><select id='nqCo'><option value=''>Choose…</option>" + S.companies.filter(function (c) { return c.kind !== "vendor"; }).map(function (c) { return "<option value='" + c.id + "'>" + esc(c.name) + "</option>"; }).join("") + "</select></div><div class='mactions'><button class='ghost' data-act='mclose'>Cancel</button><button class='primary' data-act='nq-ok'>Start quote</button></div>"); return; }
    if (act === "nq-ok") { var cid = +$("#nqCo").value; if (!cid) { toast("Pick a customer."); return; } closeModal(); ensureQuote(null, cid); return; }
    if (act === "open-quote") { openQuote(+id); return; }
    if (act === "q-print") { var pd = dealById(+id); if (pd && pd.quote) printQuote(pd.quote); return; }
    if (act === "q-download") { var dd = dealById(+id); if (dd && dd.quote) downloadQuote(dd.quote); return; }
    if (act === "orders-csv") { exportOrders(); return; }
    if (act === "usual-order") { useUsual(+id); return; }
    if (act === "import-products") { importProducts(); return; }
    if (act === "q-add-line") { addQuoteLine(+id); return; }
    if (act === "q-del-line") { delQuoteLine(+id, +a.dataset.i); return; }
    if (act === "lose") { openModal("<h2>Mark this deal lost?</h2><div class='f'><label>Why?</label><input id='lostWhy'></div><div class='mactions'><button class='ghost' data-act='mclose'>Cancel</button><button class='danger' data-act='lose-ok' data-id='" + id + "'>Mark lost</button></div>"); return; }
    if (act === "lose-ok") { markLost(+id); return; }
    if (act === "reopen") { reopenDeal(+id); return; }
    if (act === "toggle-task") { toggleTask(+id, a.checked); return; }
    if (act === "add-task") { addTaskFromForm(); return; }
    if (act === "add-ship") { addShip(+id); return; }
    if (act === "del-ship") { delShip(+id); return; }
    if (act === "add-contact") { addContact(+id); return; }
    if (act === "del-contact") { delContact(+id); return; }
    if (act === "log-contact") { quickLog("touch", +id); return; }
    if (act === "quick-log") { quickLog(a.dataset.kind || "touch", id ? +id : null); return; }
    if (act === "start-setup") { startSetup(+id); return; }
    if (act === "qb-mark") { markQb(+id); return; }
    if (act === "cof") { coFilter = a.dataset.v; vCompanies(); return; }
    if (act === "open-company") { if (id) openCompany(+id); return; }
    if (act === "month") { shiftMonth(+a.dataset.n); return; }
    if (act === "post-note") { postNote(); return; }
    if (act === "del-field") { deleteField(+id); return; }
    if (act === "add-field") { addField(); return; }
    if (act === "seq-enroll") { enrollCompany(+id); return; }
    if (act === "seq-send") { seqAction(id, "send"); return; }
    if (act === "seq-skip") { seqAction(id, "skip"); return; }
    if (act === "seq-stop") { seqAction(id, "stop"); return; }
    if (act === "signout") { signOut(); return; }
    if (act === "feedback") { openModal("<h2>Feedback for Rich</h2><div class='f'><textarea id='fbText' style='min-height:180px'>" + esc(S.feedback) + "</textarea></div><div class='mactions'><button class='ghost' data-act='fb-save'>Save notes</button><button class='ghost' data-act='fb-copy'>Copy</button></div>"); return; }
    if (act === "fb-save") { S.feedback = $("#fbText").value; localStorage.setItem("driven-crm-feedback", S.feedback); closeModal(); toast("Notes saved in this browser."); return; }
    if (act === "fb-copy") { S.feedback = $("#fbText").value; localStorage.setItem("driven-crm-feedback", S.feedback); navigator.clipboard && navigator.clipboard.writeText(S.feedback).then(function () { toast("Copied."); }, function () { toast("Select the text and copy it."); }); return; }
    if (act === "add-target") { openTargetPicker(); return; }
    if (act === "target-add") { addTarget(+id); return; }
    if (act === "voice") { openModal("<h2>Talk it in</h2><p>The test page's AI filler is not connected. Save the note onto the company instead.</p><div class='f'><label>Company</label><select id='vCo'><option value=''>Choose…</option>" + S.companies.filter(function (c) { return c.kind !== "vendor"; }).map(function (c) { return "<option value='" + c.id + "'>" + esc(c.name) + "</option>"; }).join("") + "</select></div><div class='f'><textarea id='vText' style='min-height:120px'></textarea></div><div class='mactions'><button class='ghost' data-act='mclose'>Cancel</button><button class='primary' data-act='voice-note'>Save as note</button></div>"); return; }
    if (act === "voice-note") { saveVoiceNote(); return; }
  }

  async function toggleCol(key) {
    var stage = S.stages.find(function (s) { return s.key === key; });
    if (!stage) return;
    if (board.zones[stage.team] || board.stages[key]) {
      if (board.zones[stage.team]) {
        S.stages.filter(function (s) { return s.team === stage.team; }).forEach(function (s) { board.stages[s.key] = s.key !== key; });
        board.zones[stage.team] = false;
      } else board.stages[key] = false;
    } else board.stages[key] = true;
    await persistPrefs();
    if (S.view === "pipeline") vPipeline();
  }
  async function toggleZone(team) {
    board.zones[team] = !board.zones[team];
    if (!board.zones[team]) S.stages.filter(function (s) { return s.team === team; }).forEach(function (s) { board.stages[s.key] = false; });
    await persistPrefs();
    if (S.view === "pipeline") vPipeline();
  }
  async function gateSave(id, toKey) {
    var d = dealById(id);
    var patch = {};
    document.querySelectorAll("#gate [data-g]").forEach(function (el) {
      var f = DEAL_FIELDS.find(function (x) { return x.k === el.dataset.g; });
      var v = readInput(el, f ? f.t : "text");
      d[f.k] = v;
      patch[f.k] = DATE_KEYS[f.k] ? (v || null) : v;
    });
    var miss = missingFor(d, toKey);
    if (miss.length) { toast("Still missing: " + miss.map(FL).join(", ")); openGate(d, toKey, miss); return; }
    var ok = await saveDealColumns(d, patch, "deal");
    if (!ok) return;
    closeModal();
    if (await commitMove(d, toKey)) { render(); openDeal(d.id); }
  }
  function newDealModal(pre) {
    openModal("<h2>New deal</h2><div class='fields'><div class='f wide'><label>Customer</label><select id='ndCo'><option value=''>Choose…</option>" + S.companies.filter(function (c) { return c.kind !== "vendor"; }).map(function (c) { return "<option value='" + c.id + "'" + (+pre === c.id ? " selected" : "") + ">" + esc(c.name) + "</option>"; }).join("") + "</select></div><div class='f wide'><label>Brief description</label><input id='ndDesc'></div><div class='f'><label>Sales rep</label><select id='ndRep'>" + reps().map(function (r) { return "<option>" + esc(r) + "</option>"; }).join("") + "</select></div></div><div class='mactions'><button class='ghost' data-act='mclose'>Cancel</button><button class='primary' data-act='nd-ok'>Create deal</button></div>");
  }
  async function createDealFromModal() {
    var cid = +$("#ndCo").value;
    var desc = $("#ndDesc").value.trim();
    if (!cid || !desc) { toast("Pick a customer and add a description."); return; }
    var ship = S.shipTos.find(function (s) { return s.company_id === cid; });
    var row = { company_id: cid, ship_to_id: ship ? ship.id : null, description: desc, stage: "working_on_quote", sales_rep: $("#ndRep").value, custom: { _status: "open", _won_at: null, _lost_reason: "", _order_lines: [], _quote: null } };
    var saved = await CRMDB.insert("crm_deals", row, "deal");
    if (!saved) return;
    var d = mapDeal(saved);
    S.deals.push(d);
    await addActivity({ deal_id: d.id, company_id: cid, kind: "move", note: "Created in " + stageName(d.stage) + ".", by: meName() });
    closeModal();
    S.view = "pipeline";
    render();
    openDeal(d.id);
    toast("Deal created.");
  }
  async function createCompanyFromModal() {
    var n = $("#ncoName").value.trim();
    if (!n) { toast("Add a company name."); return; }
    var k = $("#ncoKind").value;
    var saved = await CRMDB.insert("crm_companies", { name: n, kind: k, list: k === "vendor" ? "none" : k === "customer" ? "active" : "potential", owner: k === "vendor" ? null : $("#ncoOwner").value, custom: {} }, "company");
    if (!saved) return;
    var c = mapCompany(saved);
    S.companies.push(c);
    closeModal();
    if (k === "vendor") await startSetup(c.id);
    render();
    openCompany(c.id);
    toast("Company added.");
  }
  async function ensureQuote(dealId, companyId) {
    var d = dealId ? dealById(dealId) : null;
    if (!d) {
      var ship = S.shipTos.find(function (s) { return s.company_id === companyId; });
      var saved = await CRMDB.insert("crm_deals", { company_id: companyId, ship_to_id: ship ? ship.id : null, description: "New quote", stage: "working_on_quote", sales_rep: (co(companyId) || {}).owner || meName(), custom: { _status: "open", _order_lines: [], _quote: null } }, "deal");
      if (!saved) return;
      d = mapDeal(saved);
      S.deals.push(d);
    }
    if (!d.quote) {
      d.quote = blankQuote(d);
      var ok = await saveQuoteDoc(d);
      if (!ok) { d.quote = null; return; }
    }
    render();
    openQuote(d.id);
  }
  async function addQuoteLine(dealId) {
    var d = dealById(dealId); if (!d || !d.quote) return;
    var prev = clone(d.quote);
    d.quote.lines.push({ desc: "", qty: null, unit: "each", vendor_id: null, cost: null, price: null, freight: null, category: "", invoice_number: "", line_date: TODAY, product_id: null, sales_rep: d.quote.rep || "" });
    var ok = await applyQuoteChange(d, prev, { part: "line", index: 0, key: "add" });
    if (ok) openQuote(d.id);
  }
  async function delQuoteLine(dealId, index) {
    var d = dealById(dealId); if (!d || !d.quote) return;
    var prev = clone(d.quote);
    var line = d.quote.lines[index];
    d.quote.lines.splice(index, 1);
    if (linesApi && line && line.line_id) {
      var gone = await CRMDB.remove("crm_deal_lines", line.line_id, "order line");
      if (!gone) { d.quote = prev; return; }
    }
    var ok = await applyQuoteChange(d, prev, { part: "line", index: 0, key: "remove" });
    if (ok) openQuote(d.id);
  }
  async function markLost(id) {
    var d = dealById(id);
    d.status = "lost";
    d.lost_reason = $("#lostWhy") ? $("#lostWhy").value : "";
    var ok = await saveDealCustom(d);
    if (!ok) { d.status = "open"; return; }
    closeModal();
    await addActivity({ deal_id: id, company_id: d.company_id, kind: "move", note: "Marked lost" + (d.lost_reason ? ": " + d.lost_reason : "") + ".", by: meName() });
    render();
    openDeal(id);
    toast("Marked lost.");
  }
  async function reopenDeal(id) {
    var d = dealById(id);
    d.status = "open";
    d.lost_reason = "";
    var ok = await saveDealCustom(d);
    if (!ok) return;
    render();
    openDeal(id);
  }
  async function toggleTask(id, done) {
    var t = S.tasks.find(function (x) { return x.id === id; });
    var saved = await CRMDB.update("crm_tasks", id, { done: !!done }, "follow-up");
    if (!saved) { render(); return; }
    t.done = !!done;
    render();
  }
  async function addTaskFromForm() {
    var title = $("#ntTitle").value.trim();
    if (!title) { toast("Write the follow-up first."); return; }
    var task = await addTask({ title: title, assignee: $("#ntWho").value, due: $("#ntDue").value || TODAY });
    if (!task || task.duplicate) return;
    render();
    toast("Follow-up added.");
  }
  async function addShip(companyId) {
    var label = $("#nsLabel").value.trim();
    var address = $("#nsAddr").value.trim();
    if (!address) { toast("Add the address."); return; }
    var saved = await CRMDB.insert("crm_ship_tos", { company_id: companyId, label: label || "Ship-to", address: address, is_default: false }, "ship-to");
    if (!saved) return;
    S.shipTos.push({ id: saved.id, company_id: companyId, label: saved.label || label || "Ship-to", address: saved.address, is_default: false });
    openCompany(companyId);
  }
  async function delShip(id) {
    var s = S.shipTos.find(function (x) { return x.id === id; });
    var gone = await CRMDB.remove("crm_ship_tos", id, "ship-to");
    if (!gone) return;
    S.shipTos = S.shipTos.filter(function (x) { return x.id !== id; });
    if (s) openCompany(s.company_id);
  }
  async function addContact(companyId) {
    var name = $("#ncName").value.trim();
    if (!name) { toast("Add a name."); return; }
    var saved = await CRMDB.insert("crm_contacts", { company_id: companyId, role: $("#ncRole").value.trim() || null, name: name, email: $("#ncEmail").value.trim() || null, phone: $("#ncPhone").value.trim() || null }, "contact");
    if (!saved) return;
    S.contacts.push({ id: saved.id, company_id: companyId, role: saved.role || "", name: saved.name, email: saved.email || "", phone: saved.phone || "" });
    openCompany(companyId);
  }
  async function delContact(id) {
    var x = S.contacts.find(function (y) { return y.id === id; });
    var gone = await CRMDB.remove("crm_contacts", id, "contact");
    if (!gone) return;
    S.contacts = S.contacts.filter(function (y) { return y.id !== id; });
    if (x) openCompany(x.company_id);
  }
  async function quickLog(kind, companyId) {
    var labels = { call: "Call", email: "Email", touch: "Touch" };
    var label = labels[kind] || "Touch";
    var used = labels[kind] ? kind : "touch";
    if (companyId) {
      var c = co(companyId);
      if (!c) return;
      c.last = TODAY;
      var ok = await saveCompany(c, ["last"]);
      if (!ok) return;
    }
    var act = await addActivity({ company_id: companyId || null, kind: used, note: label + " logged for the morning huddle.", by: meName() });
    if (!act) return;
    toast(label + " logged for " + meName() + ". Nothing was emailed or texted.");
    if (companyId) { render(); openCompany(companyId); }
  }
  async function logContact(id) { return quickLog("touch", id); }
  async function startSetup(id) {
    var c = co(id);
    c.setup = c.setup || {};
    if (!c.setup_started) c.setup_started = TODAY;
    var ok = await saveCompany(c, ["custom"]);
    if (!ok) return;
    var trigger = c.kind === "vendor" ? "new_vendor" : "new_customer";
    var rules = S.rules.filter(function (r) { return r.active && r.trigger === trigger; });
    if (rules.length) { for (var i = 0; i < rules.length; i++) await fire(rules[i], null, c, TODAY, "r" + rules[i].id + ":c" + c.id); }
    else {
      var who = S.team.find(function (p) { return p.team === (c.kind === "vendor" ? "accounting" : "operations") && p.active !== false; }) || me();
      await addTask({ title: (c.kind === "vendor" ? "Start vendor setup for " : "Start customer setup for ") + c.name, assignee: who.name, company_id: c.id, due: TODAY, dedupe_key: trigger + ":" + c.id });
    }
    render();
    openCompany(id);
    toast("Setup started. Nothing was emailed.");
  }
  async function markQb(id) {
    var c = co(id);
    syncReadyFlags(c);
    if (c.kind === "vendor" && !itemDone(c, { key: "vendor_form", doc: 1 })) { toast("Check the vendor form and W-9 first."); return; }
    c.qb_id = (c.kind === "vendor" ? "QBV-" : "QB-") + c.id;
    c.setup = c.setup || {};
    c.setup.qb = true;
    syncReadyFlags(c);
    var ok = await saveCompany(c, ["custom"]);
    if (!ok) { c.qb_id = ""; return; }
    var amber = S.team.find(function (p) { return p.team === "accounting"; });
    if (amber) await queueDraft(amber, c.name + " marked ready for QuickBooks in the CRM. QuickBooks was not changed.", "", TODAY, "qb:" + c.id, null, c, null);
    render();
    openCompany(id);
    toast("Marked in the CRM. QuickBooks was not changed.");
  }
  function shiftMonth(n) {
    if (!n) calMonth = null;
    else {
      var b = calMonth ? new Date(calMonth + "-01T00:00:00") : new Date(T.getFullYear(), T.getMonth(), 1);
      b.setMonth(b.getMonth() + n);
      calMonth = b.getFullYear() + "-" + String(b.getMonth() + 1).padStart(2, "0");
    }
    vCalendar();
  }
  async function postNote() {
    var ta = $("#noteText");
    var text = ta.value.trim();
    if (!text) { toast("Write the note first."); return; }
    var cid = +ta.dataset.noteCo;
    var did = +ta.dataset.noteDeal || null;
    var act = await addActivity({ company_id: cid, deal_id: did, kind: "note", note: text, by: meName() });
    if (!act) return;
    if (did) openDeal(did); else openCompany(cid);
    toast("Note posted.");
  }
  async function deleteField(id) {
    var gone = await CRMDB.remove("crm_custom_fields", id, "custom field");
    if (!gone) return;
    S.fields = S.fields.filter(function (f) { return f.id !== id; });
    vSetup();
  }
  async function addField() {
    var label = $("#cfLabel").value.trim();
    if (!label) { toast("Name the field."); return; }
    var type = $("#cfType").value;
    var key = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || ("f_" + Date.now());
    var saved = await CRMDB.insert("crm_custom_fields", { entity: $("#cfEntity").value, key: key, label: label, type: type, options: type === "select" ? $("#cfOpts").value.split(",").map(function (s) { return s.trim(); }).filter(Boolean) : [], position: S.fields.length + 1, active: true }, "custom field");
    if (!saved) return;
    S.fields.push({ id: saved.id, entity: saved.entity, key: saved.key, label: saved.label, type: saved.type, options: saved.options || [], position: saved.position || 0, active: true });
    vSetup();
  }
  async function enrollCompany(companyId) {
    var c = co(companyId);
    var name = $("#enSeq").value;
    if (!name) { toast("No sequence is loaded. Sign in if the steps are hidden."); return; }
    if ((c.enrollments || []).some(function (e) { return e.sequence_name === name && e.status === "active"; })) { toast("Already in that sequence."); return; }
    var ct = S.contacts.find(function (x) { return x.company_id === companyId && x.email; });
    c.enrollments = c.enrollments || [];
    c.enrollments.push({ id: "en-" + Date.now(), sequence_name: name, contact_id: ct ? ct.id : null, start: TODAY, step: 0, status: "active", sent: [] });
    var ok = await saveCompany(c, ["custom"]);
    if (!ok) { c.enrollments.pop(); return; }
    render();
    openCompany(companyId);
    toast("Sequence started. Due steps wait for Queue draft. Nothing is sent.");
  }
  function findEnrollment(id) {
    var found = null;
    S.companies.forEach(function (c) { (c.enrollments || []).forEach(function (e) { if (String(e.id) === String(id)) found = { e: e, c: c }; }); });
    return found;
  }
  async function seqAction(id, how) {
    var found = findEnrollment(id);
    if (!found) return;
    var en = found.e, c = found.c;
    var sq = seqByName(en.sequence_name);
    if (how === "stop") { en.status = "stopped"; en.reason = "Stopped"; }
    else if (how === "skip") { en.step += 1; if (sq && en.step >= sq.steps.length) { en.status = "done"; en.reason = "Finished"; } }
    else if (how === "send") {
      if (!sq) return;
      var st = sq.steps[en.step];
      var variant = (st.variants || [])[0] || {};
      var ct = seqContact(en);
      var subject = fillSeq(variant.subject, en);
      var body = fillSeq(variant.body, en);
      var rep = S.team.find(function (p) { return p.name === ((co(c.id) || {}).owner || meName()); }) || me();
      var made = await queueDraft(rep, "Sequence draft (not sent): " + subject, (ct ? "To " + ct.email + "\n\n" : "") + body, TODAY, "seq:" + en.id + ":" + st.step, null, c, null);
      if (made === null) return;
      en.sent = en.sent || [];
      en.sent.push({ step: st.step, at: TODAY });
      en.step += 1;
      if (en.step >= sq.steps.length) { en.status = "done"; en.reason = "Finished"; }
      toast("Draft queued for " + rep.name + ". Nothing was sent.");
    }
    var ok = await saveCompany(c, ["custom"]);
    if (!ok) return;
    render();
  }
  function setGateMsg(text, kind) {
    var el = $("#gateMsg");
    if (!el) return;
    el.textContent = text || "";
    el.className = "gate-msg" + (kind === "bad" ? " bad" : "");
  }
  function showGate(message) {
    sessionGen += 1;
    admitEmail = "";
    S.entered = false;
    S.meId = null;
    S.authEmail = "";
    S.authLocked = false;
    ["stages", "team", "rules", "fields", "companies", "contacts", "shipTos", "deals", "tasks", "activity", "stepRows", "targets", "outreach", "products", "messages"].forEach(function (k) { S[k] = []; });
    var view = $("#view");
    if (view) view.innerHTML = "";
    var shell = $("#shell");
    var gate = $("#authGate");
    if (shell) shell.hidden = true;
    if (gate) gate.hidden = false;
    document.documentElement.dataset.crmGate = "signed-out";
    if ($("#drawer")) closeDrawer();
    if ($("#modal")) closeModal();
    if (message != null) setGateMsg(message);
    setSaveState("", "");
  }
  async function rejectSession(message) {
    gateHold = true;
    admitEmail = "";
    try { await CRMDB.db.auth.signOut(); } catch (e) { /* still hide the CRM */ }
    showGate(message);
    gateHold = false;
  }
  async function signOut() {
    gateHold = true;
    admitEmail = "";
    try { await CRMDB.db.auth.signOut(); } catch (e) { /* still hide the CRM */ }
    showGate("Signed out.");
    gateHold = false;
  }
  async function enterCrm(session) {
    if (window.CRMAuth && CRMAuth.isRecovery()) return;
    var email = String((session && session.user && session.user.email) || "").trim();
    if (!email) { await rejectSession("That sign-in had no email. Try again."); return; }
    var key = email.toLowerCase();
    if (S.entered && S.authEmail.toLowerCase() === key) return;
    if (admitEmail === key) return;
    admitEmail = key;
    var gen = ++sessionGen;
    setGateMsg("Checking " + email + "…");
    async function lookupTeam() {
      var pattern = email.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
      return CRMDB.db.from("crm_team").select("id,name,email,team,alert_via,active").ilike("email", pattern).eq("active", true).limit(2);
    }
    var res = await lookupTeam();
    if (res.error || !(res.data || []).length) res = await lookupTeam();
    if (gen !== sessionGen) return;
    var mine = !res.error && (res.data || []).find(function (t) { return String(t.email || "").toLowerCase() === key && t.active !== false; });
    if (res.error || !mine) {
      var why = res.error
        ? ("Could not confirm " + email + " on the team. " + CRMDB.explain(res.error))
        : (email + " is not an active Driven team address. No CRM data was loaded.");
      await rejectSession(why);
      return;
    }
    S.authEmail = email;
    S.authLocked = true;
    S.meId = mine.id;
    setSaveState("Loading…", "");
    var ok = await loadAll();
    if (gen !== sessionGen) return;
    if (ok) {
      var person = S.team.find(function (t) { return String(t.email || "").toLowerCase() === key && t.active !== false; });
      if (!person) {
        await rejectSession(email + " is not an active Driven team address. No CRM data was loaded.");
        return;
      }
      S.meId = person.id;
    } else {
      ["rules", "fields", "companies", "contacts", "shipTos", "deals", "tasks", "activity", "stepRows", "targets", "outreach", "products", "messages"].forEach(function (k) { S[k] = []; });
      S.team = [{ id: mine.id, name: mine.name, email: email, team: mine.team, via: mine.alert_via || "both", active: true }];
      S.meId = mine.id;
    }
    S.entered = true;
    S.authLocked = true;
    var gate = $("#authGate");
    var shell = $("#shell");
    if (gate) gate.hidden = true;
    if (shell) shell.hidden = false;
    document.documentElement.dataset.crmGate = "signed-in";
    paintWho();
    if (!ok) return;
    await loadPrefs();
    if (gen !== sessionGen) return;
    await runAutomations();
    if (gen !== sessionGen) return;
    var asked = new URLSearchParams(location.search).get("view");
    if (asked && ["pipeline", "companies", "docs", "tasks", "calendar", "orders", "automations", "sequences", "setup"].indexOf(asked) >= 0) S.view = asked;
    render();
    var signedIn = S.team.find(function (t) { return t.id === +S.meId; });
    setSaveState("Signed in as " + (signedIn ? signedIn.name : email) + " · " + email, "ok");
  }
  function openTargetPicker() {
    if (!S.targets.length) { toast(S.targetsNote || "No target accounts are visible."); return; }
    var linked = {};
    S.companies.forEach(function (c) { if (c.target_account_id) linked[c.target_account_id] = 1; });
    var rows = S.targets.filter(function (t) { return !linked[t.id]; }).slice(0, 40);
    openModal("<h2>Add a prospect</h2><p>Copies the target account into a CRM company. It does not send outreach.</p><div class='panel' style='max-height:360px;overflow:auto'>" + rows.map(function (t) {
      return "<div class='cf'><div><b>" + esc(t.company) + "</b> <span class='log'>" + esc([t.city, t.state].filter(Boolean).join(", ")) + "</span></div><button class='ghost' data-act='target-add' data-id='" + t.id + "'>Add</button></div>";
    }).join("") + "</div><div class='mactions'><button class='ghost' data-act='mclose'>Close</button></div>");
  }
  async function addTarget(id) {
    var t = S.targets.find(function (x) { return x.id === id; });
    if (!t) return;
    var saved = await CRMDB.insert("crm_companies", { name: t.company, kind: "prospect", list: "potential", owner: t.owner || null, billing_address: [t.city, t.state].filter(Boolean).join(", ") || null, target_account_id: t.id, custom: {} }, "company");
    if (!saved) return;
    var c = mapCompany(saved);
    S.companies.push(c);
    if (t.contact_name) {
      var ct = await CRMDB.insert("crm_contacts", { company_id: c.id, name: t.contact_name, role: t.contact_title || null, email: t.contact_email || null, phone: t.contact_phone || null }, "contact");
      if (ct) S.contacts.push({ id: ct.id, company_id: c.id, role: ct.role || "", name: ct.name, email: ct.email || "", phone: ct.phone || "" });
    }
    closeModal();
    render();
    openCompany(c.id);
  }
  async function saveVoiceNote() {
    var cid = +$("#vCo").value;
    var text = $("#vText").value.trim();
    if (!cid || !text) { toast("Pick the company and write a note."); return; }
    var c = co(cid);
    c.last = TODAY;
    var ok = await saveCompany(c, ["last"]);
    if (!ok) return;
    var act = await addActivity({ company_id: cid, kind: "call", note: text, by: meName() });
    if (!act) return;
    closeModal();
    render();
    openCompany(cid);
  }

  document.addEventListener("change", function (e) {
    var el = e.target;
    if (el.dataset.act === "rule-on") { saveRule(+el.dataset.id, { active: el.checked }); return; }
    if (el.dataset.act === "via") { saveVia(+el.dataset.id, el.value); return; }
    if (el.dataset.ruleMsg) { saveRule(+el.dataset.ruleMsg, { message: el.value }); return; }
    if (el.dataset.ruleDays) {
      var days = el.value.split(",").map(function (s) { return parseInt(s, 10); }).filter(function (n) { return n >= 0; });
      if (days.length) saveRule(+el.dataset.ruleDays, { offset_days: days });
      return;
    }
    if (el.dataset.stageName) { saveStage(el.dataset.stageName, { name: el.value || el.dataset.stageName }); return; }
    if (el.dataset.stageReq) {
      var req = el.value.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
      saveStage(el.dataset.stageReq, { required_fields: req });
      return;
    }
    if (el.dataset.stepSubject || el.dataset.stepBody || el.dataset.stepDay) { saveStepEl(el); return; }
    if (el.dataset.textok) { saveTextOk(+el.dataset.textok, el.checked); return; }
    if (el.dataset.setup) { saveSetup(+el.dataset.id, el.dataset.setup, el.checked); return; }
    if (el.dataset.ol) { saveOrderCell(el.dataset.ol, el.value); return; }
    if (el.dataset.od) { saveOrderDeal(el.dataset.od, el.value); return; }
    var dr = el.closest("#drawer");
    if (dr && dr.dataset.quote && (el.dataset.q || el.dataset.ql)) {
      var d = dealById(+dr.dataset.quote);
      if (!d || !d.quote) return;
      if (el.dataset.ql) onQuoteField(d, { part: "line", raw: el.dataset.ql, value: el.value });
      else onQuoteField(d, { part: "head", key: el.dataset.q, value: el.value });
      return;
    }
    if (dr && dr.dataset.deal && (el.dataset.k || el.dataset.x)) { saveDealField(dealById(+dr.dataset.deal), el); return; }
    if (dr && dr.dataset.company && (el.dataset.k || el.dataset.x)) { saveCompanyField(co(+dr.dataset.company), el); return; }
  });

  async function saveRule(id, patch) {
    var saved = await CRMDB.update("crm_automation_rules", id, patch, "automation");
    if (!saved) return;
    var r = S.rules.find(function (x) { return x.id === id; });
    if (!r) return;
    if ("active" in patch) r.active = patch.active;
    if ("message" in patch) r.msg = patch.message;
    if ("offset_days" in patch) r.days = patch.offset_days;
    toast("Automation saved.");
  }
  async function saveVia(id, via) {
    var saved = await CRMDB.update("crm_team", id, { alert_via: via }, "teammate");
    if (!saved) return;
    var p = S.team.find(function (t) { return t.id === id; });
    if (p) p.via = via;
  }
  async function saveStage(key, patch) {
    var s = S.stages.find(function (x) { return x.key === key; });
    if (!s) return;
    var saved = await CRMDB.update("crm_stages", s.id, patch, "stage");
    if (!saved) return;
    if (patch.name) s.name = patch.name;
    if (patch.required_fields) s.req = patch.required_fields;
    toast("Stage saved.");
  }
  async function saveStepEl(el) {
    if (el.dataset.stepDay) {
      var ids = el.dataset.stepDay.split(",").filter(Boolean);
      var dayN = +el.value || 0;
      for (var i = 0; i < ids.length; i++) {
        var saved = await CRMDB.update("crm_sequence_steps", +ids[i], { day_offset: dayN }, "sequence step");
        if (!saved) return;
        var row = S.stepRows.find(function (r) { return r.id === +ids[i]; });
        if (row) row.day_offset = dayN;
      }
      return;
    }
    var id = +(el.dataset.stepSubject || el.dataset.stepBody);
    var patch = el.dataset.stepSubject ? { subject: el.value } : { body: el.value };
    var saved2 = await CRMDB.update("crm_sequence_steps", id, patch, "sequence step");
    if (!saved2) return;
    var row2 = S.stepRows.find(function (r) { return r.id === id; });
    if (row2) Object.assign(row2, patch);
  }
  async function saveTextOk(contactId, on) {
    var x = S.contacts.find(function (c) { return c.id === contactId; });
    if (!x) return;
    var c = co(x.company_id);
    c.textOk = c.textOk || {};
    c.textOk[contactId] = !!on;
    var ok = await saveCompany(c, ["custom"]);
    if (!ok) delete c.textOk[contactId];
  }
  async function saveSetup(companyId, key, on) {
    var c = co(companyId);
    c.setup = c.setup || {};
    c.setup[key] = !!on;
    if (on && !c.setup_started) c.setup_started = TODAY;
    syncReadyFlags(c);
    var ok = await saveCompany(c, ["custom"]);
    if (!ok) return;
    if (c.alert_amber) {
      var rules = S.rules.filter(function (r) { return r.active && r.trigger === "vendor_ready"; });
      if (rules.length) await fire(rules[0], null, c, TODAY, "r" + rules[0].id + ":c" + c.id);
      else {
        var amber = S.team.find(function (p) { return p.name === "Amber"; }) || S.team.find(function (p) { return p.team === "accounting"; });
        if (amber) await queueDraft(amber, c.name + " is ready for QuickBooks. Verify bank info by phone. Nothing was emailed.", "", TODAY, "vendor-ready:" + c.id, null, c, null);
      }
    }
    render();
    openCompany(c.id);
    if (!setupStatus(c).missing.length) toast(c.name + " setup is complete.", "won");
  }
  async function saveDealField(d, el) {
    if (!d) return;
    if (el.dataset.x) {
      d.custom = d.custom || {};
      d.custom[el.dataset.x] = el.type === "checkbox" ? el.checked : el.value;
      await saveDealCustom(d);
      return;
    }
    var f = DEAL_FIELDS.find(function (x) { return x.k === el.dataset.k; });
    if (!f) return;
    var v = readInput(el, f.t);
    var prev = d[f.k];
    d[f.k] = v;
    var patch = {};
    patch[f.k] = DATE_KEYS[f.k] ? (v || null) : v;
    if (f.k === "company_id") {
      var ship = S.shipTos.find(function (s) { return s.company_id === v; });
      d.ship_to_id = ship ? ship.id : null;
      patch.ship_to_id = d.ship_to_id;
    }
    var ok = await saveDealColumns(d, patch, "deal");
    if (!ok) { d[f.k] = prev; }
    render();
    openDeal(d.id);
  }
  async function saveCompanyField(c, el) {
    if (!c) return;
    if (el.dataset.x) {
      c.custom = c.custom || {};
      c.custom[el.dataset.x] = el.type === "checkbox" ? el.checked : el.value;
      var okx = await saveCompany(c, ["custom"]);
      if (okx) openCompany(c.id);
      return;
    }
    var k = el.dataset.k;
    var prev = c[k];
    c[k] = el.value === "" && k === "last" ? null : el.value;
    if (k === "kind" && el.value === "vendor") c.list = "none";
    var keys = [k === "billing" ? "billing" : k === "status" ? "status" : k === "last" ? "last" : k];
    if (k === "kind") keys.push("list");
    var ok = await saveCompany(c, keys);
    if (!ok) c[k] = prev;
    else if (k === "kind" && el.value === "customer" && !c.setup_started) await startSetup(c.id);
    render();
    openCompany(c.id);
  }

  function paintWho() {
    var sel = $("#who");
    var label = $("#whoLabel");
    var person = S.team.find(function (t) { return t.id === +S.meId; });
    var name = person ? person.name : "teammate";
    if (label) label.textContent = "Signed in as " + name;
    if (sel) {
      sel.innerHTML = "<option value='" + (person ? person.id : "") + "' selected>" + esc(name + (S.authEmail ? " · " + S.authEmail : "")) + "</option>";
      sel.disabled = true;
    }
    var btn = $("#authBtn");
    if (btn) { btn.textContent = "Sign out"; btn.dataset.act = "signout"; }
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { if ($("#modal").classList.contains("open")) closeModal(); else closeDrawer(); }
  });
  $("#modal").addEventListener("click", function (e) { if (e.target.id === "modal") closeModal(); });
  $("#who").addEventListener("change", function () { paintWho(); });

  async function saveOrderCell(spec, value) {
    var parts = spec.split(":");
    var d = dealById(+parts[0]);
    if (!d) return;
    if (!d.quote) d.quote = blankQuote(d);
    var index = +parts[1];
    var field = parts.slice(2).join(":");
    if (!d.quote.lines[index]) return;
    await onQuoteField(d, { part: "line", raw: index + ":" + field, value: value });
  }
  async function saveOrderDeal(spec, value) {
    var parts = spec.split(":");
    var d = dealById(+parts[0]);
    if (!d) return;
    var field = parts.slice(1).join(":");
    var v = value === "" ? null : value;
    if (field === "company_id") v = value === "" ? null : +value;
    var prev = d[field];
    d[field] = field === "customer_po_number" ? (value || "") : v;
    var patch = {};
    patch[field] = field === "customer_po_number" ? (value || "") : v;
    var ok = await saveDealColumns(d, patch, "deal");
    if (!ok) { d[field] = prev; render(); return; }
    if (field === "company_id" && d.quote) d.quote.company_id = v;
    if (d.quote && field === "company_id") await saveQuoteDoc(d);
    render();
  }
  function exportOrders() {
    var rows = orderRows().rows;
    var blob = new Blob([Orders.csv(rows)], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "Driven-Open-Orders.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast("Exported " + rows.length + " lines. The Google Sheet was not changed.");
  }
  async function useUsual(dealId) {
    var d = dealById(dealId);
    if (!d || !d.quote) return;
    var others = S.deals.filter(function (x) {
      return x.id !== d.id && x.company_id === d.company_id && x.quote && x.quote.lines && x.quote.lines.length && SI(x.stage) >= WON();
    });
    others.sort(function (a, b) { return String(b.won_at || b.stage_changed_at || "").localeCompare(String(a.won_at || a.stage_changed_at || "")); });
    if (!others.length) { toast("No earlier order for this customer yet."); return; }
    var prev = clone(d.quote);
    d.quote.lines = others[0].quote.lines.map(function (l) {
      var copy = clone(l);
      delete copy.line_id;
      copy.invoice_number = "";
      copy.line_date = TODAY;
      return copy;
    });
    var ok = await applyQuoteChange(d, prev, { part: "line", index: 0, key: "product_id" });
    if (!ok) return;
    toast("Usual order copied. Nothing was emailed.");
    render();
    openQuote(d.id);
  }
  async function importProducts() {
    var input = $("#prodCsv");
    var file = input && input.files && input.files[0];
    if (!file) { toast("Choose a CSV first."); return; }
    var text = await file.text();
    var rows = Orders.parseProductCsv(text);
    if (!rows.length) { toast("No product rows found in that file."); return; }
    if (!productsApi) {
      toast("Could not import. The product catalog is not in the database yet. Nothing was written.", "bad");
      setSaveState("Product import did not run. crm_products is not there yet.", "bad");
      return;
    }
    for (var i = 0; i < rows.length; i++) {
      var cat = Orders.CATEGORIES.indexOf(rows[i].category) >= 0 ? rows[i].category : null;
      var saved = await CRMDB.insert("crm_products", {
        name: rows[i].name, sku: rows[i].sku || null, description: rows[i].description || null,
        default_price: rows[i].default_price, qbo_item_id: rows[i].qbo_item_id || null,
        category: cat, unit: rows[i].unit || null, active: true
      }, "product");
      if (!saved) return;
      S.products.push(saved);
    }
    vSetup();
    toast("Imported " + rows.length + " products. QuickBooks was not changed.");
  }

  function boot() {
    S.theme = localStorage.getItem("driven-crm-theme") || "dark";
    document.documentElement.dataset.theme = S.theme;
    document.documentElement.dataset.crmGate = "signed-out";
    S.feedback = localStorage.getItem("driven-crm-feedback") || "";
    if (!window.CRMAuth) {
      setGateMsg("The sign-in script did not load. Reload the page.", "bad");
      return;
    }
    CRMAuth.bind({
      place: "CRM",
      isHeld: function () { return gateHold; },
      onSession: function (session) { enterCrm(session); },
      onSignedOut: function () {
        if (S.entered) showGate("Signed out.");
      },
      onRecovery: function () {
        if ($("#shell")) $("#shell").hidden = true;
        if ($("#authGate")) $("#authGate").hidden = false;
        document.documentElement.dataset.crmGate = "signed-out";
      }
    });
  }
  boot();
})();
