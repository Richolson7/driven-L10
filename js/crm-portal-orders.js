/* Portal orders report.
   One table of what every portal customer ordered, newest first.
   Read only. No customer email, no price, and no cost. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.CRMPortalOrders = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  var host = typeof window !== "undefined" ? window : {};
  var STATUS_LABEL = {
    pending: "Pending approval",
    approved: "Approved",
    shipped: "Shipped",
    received: "Received"
  };
  var OPEN_BUCKET = { pending: 1, approved: 1, shipped: 1 };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function num(v) {
    if (v == null || v === "") return null;
    var n = +v;
    return isNaN(n) ? null : n;
  }
  function day(s) {
    if (!s) return null;
    var m = String(s).match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : null;
  }
  function fmt(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function parseDate(iso) { return new Date(String(iso).slice(0, 10) + "T00:00:00"); }
  function addDays(iso, n) {
    var x = parseDate(iso);
    x.setDate(x.getDate() + n);
    return fmt(x);
  }
  function todayIso() { return fmt(new Date()); }
  function pretty(iso) {
    if (!iso) return "";
    var x = parseDate(iso);
    if (isNaN(x.getTime())) return "";
    var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return months[x.getMonth()] + " " + x.getDate() + ", " + x.getFullYear();
  }
  function qtyText(v) {
    var n = num(v);
    if (n == null) return "";
    var r = Math.round(n * 100) / 100;
    if (Math.abs(r - Math.round(r)) < 1e-9) return String(Math.round(r));
    return String(r);
  }
  function personName(s) {
    var t = String(s == null ? "" : s).trim();
    if (!t || t.indexOf("@") >= 0) return "";
    return t;
  }
  function csvCell(v) {
    var t = v == null ? "" : String(v);
    if (/^[=+\-@]/.test(t)) t = "'" + t;
    if (/[",\r\n]/.test(t)) return '"' + t.replace(/"/g, '""') + '"';
    return t;
  }
  function byId(list, id) {
    return (list || []).find(function (row) { return String(row.id) === String(id); }) || null;
  }
  function nameOf(companies, id) {
    var row = (companies || []).find(function (c) { return String(c.id) === String(id); });
    return row && row.name ? personName(row.name) || row.name : "";
  }
  function accountMeta(account, companies) {
    var own = nameOf(companies, account.company_id) || ("Company " + account.company_id);
    var billedId = account.billed_company_id;
    var billed = billedId ? nameOf(companies, billedId) : "";
    var different = billedId && String(billedId) !== String(account.company_id) && billed;
    return {
      accountId: String(account.company_id),
      openId: different ? String(billedId) : String(account.company_id),
      label: different ? billed : own
    };
  }
  function bucketOf(order, shipment) {
    var status = String((order && order.status) || "").toLowerCase();
    var received = (order && order.received_at) || (shipment && shipment.received_at) || status === "received";
    if (received) return "received";
    if (status === "shipped" || (order && order.shipped_at) || (shipment && (shipment.ship_date || shipment.status === "shipped"))) return "shipped";
    if (status === "approved" || status === "released" || status === "ordered") return "approved";
    return "pending";
  }
  function locationOf(order, data) {
    var site = (data.sites || []).find(function (s) { return String(s.ship_to_id) === String(order.ship_to_id); });
    if (site && (site.display_name || site.site_name)) return site.display_name || site.site_name;
    var ship = (data.shipTos || []).find(function (s) { return String(s.id) === String(order.ship_to_id); });
    if (ship) return ship.label && ship.address ? (ship.label + ": " + ship.address) : (ship.address || ship.label || "");
    return "";
  }
  function placedBy(order, data) {
    var session = (data.sessions || []).find(function (s) { return String(s.id) === String(order.from_session_id); });
    if (session && session.counted_by_contact_id != null) {
      var contact = (data.contacts || []).find(function (c) { return String(c.id) === String(session.counted_by_contact_id); });
      var named = contact ? personName(contact.name) : "";
      if (named) return named;
    }
    if (session) {
      var who = personName(session.counted_by);
      if (who) return who;
    }
    return "";
  }
  function shipmentFor(order, data) {
    return (data.shipments || []).find(function (s) { return String(s.order_id) === String(order.id); }) || null;
  }
  function detailOf(order, shipment) {
    var shipDate = day(order.ship_date) || day(order.shipped_at) || (shipment && day(shipment.ship_date)) || "";
    var carrier = order.carrier || (shipment && shipment.carrier) || "";
    var pro = order.pro_number || (shipment && shipment.pro_number) || "";
    var invoice = order.qbo_invoice_no || (shipment && (shipment.qbo_invoice_number || shipment.qbo_invoice_no)) || "";
    var bits = [];
    if (shipDate) bits.push("Ship " + pretty(shipDate));
    if (carrier) bits.push(carrier);
    if (pro) bits.push("PRO " + pro);
    if (invoice) bits.push("Invoice " + invoice);
    return { shipDate: shipDate, carrier: personName(carrier) || carrier, pro: pro, invoice: invoice, text: bits.join(" · ") };
  }
  function partOf(line, data) {
    var part = (data.parts || []).find(function (p) { return String(p.id) === String(line.part_id) || String(p.part_id) === String(line.part_id); });
    var number = part ? (part.driven_part_no || part.customer_sku || "") : "";
    return { number: number, description: part ? (part.description || "") : "", unit: (line && line.unit) || (part && part.unit) || "" };
  }
  function buildRows(data) {
    data = data || {};
    var accounts = {};
    (data.accounts || []).forEach(function (account) {
      accounts[String(account.company_id)] = accountMeta(account, data.companies || []);
    });
    var rows = [];
    (data.orders || []).forEach(function (order) {
      var meta = accounts[String(order.company_id)] || {
        accountId: String(order.company_id),
        openId: String(order.company_id),
        label: nameOf(data.companies, order.company_id) || ("Company " + order.company_id)
      };
      var shipment = shipmentFor(order, data);
      var bucket = bucketOf(order, shipment);
      var detail = detailOf(order, shipment);
      var lines = (data.lines || []).filter(function (line) { return String(line.order_id) === String(order.id); });
      if (!lines.length) lines = [{ id: "", order_id: order.id, part_id: null, qty: null, unit: "" }];
      lines.forEach(function (line) {
        var part = partOf(line, data);
        rows.push({
          orderId: order.id,
          lineId: line.id,
          accountId: meta.accountId,
          openId: meta.openId,
          customer: meta.label,
          location: locationOf(order, data),
          placedBy: placedBy(order, data),
          partNo: part.number,
          description: part.description,
          qty: line.qty,
          unit: part.unit,
          placed: day(order.created_at) || "",
          bucket: bucket,
          statusLabel: STATUS_LABEL[bucket] || bucket,
          shipDate: detail.shipDate,
          carrier: detail.carrier,
          pro: detail.pro,
          invoice: detail.invoice,
          detail: detail.text,
          orderNo: order.order_no || ""
        });
      });
    });
    rows.sort(function (a, b) {
      if (a.placed !== b.placed) return a.placed < b.placed ? 1 : -1;
      if (String(a.orderId) !== String(b.orderId)) return String(a.orderId) < String(b.orderId) ? 1 : -1;
      return String(a.lineId) < String(b.lineId) ? 1 : -1;
    });
    return rows;
  }
  function choices(rows) {
    var seen = {};
    var list = [];
    rows.forEach(function (row) {
      if (seen[row.openId]) return;
      seen[row.openId] = 1;
      list.push({ id: row.openId, label: row.customer });
    });
    (arguments[1] || []).forEach(function (extra) {
      if (!extra || seen[String(extra.id)]) return;
      seen[String(extra.id)] = 1;
      list.push({ id: String(extra.id), label: extra.label });
    });
    list.sort(function (a, b) { return a.label.localeCompare(b.label, undefined, { sensitivity: "base" }); });
    return list;
  }
  function inRange(row, from, to) {
    if (!row.placed) return false;
    if (from && row.placed < from) return false;
    if (to && row.placed > to) return false;
    return true;
  }
  function matchesCustomer(row, customer) {
    if (!customer || customer === "all") return true;
    return String(row.openId) === String(customer) || String(row.accountId) === String(customer);
  }
  function distinctOrders(rows, pred) {
    var ids = {};
    rows.forEach(function (row) {
      if (pred && !pred(row)) return;
      ids[String(row.orderId)] = 1;
    });
    return Object.keys(ids).length;
  }
  function stockRows(data, customer) {
    var accounts = {};
    (data.accounts || []).forEach(function (account) {
      var meta = accountMeta(account, data.companies || []);
      if (!matchesCustomer({ openId: meta.openId, accountId: meta.accountId }, customer)) return;
      accounts[meta.accountId] = { customer: meta.label, out: 0, below: 0, ok: 0 };
    });
    var source = (data.stock && data.stock.length) ? data.stock : (data.parts || []).filter(function (part) { return part.on_hand != null; });
    source.forEach(function (part) {
      if (part.active === false || part.active === "false") return;
      if (part.min_qty == null && part.on_hand == null) return;
      var meta = accountMeta({ company_id: part.company_id, billed_company_id: null }, data.companies || []);
      var account = (data.accounts || []).find(function (a) { return String(a.company_id) === String(part.company_id); });
      if (account) meta = accountMeta(account, data.companies || []);
      if (!matchesCustomer({ openId: meta.openId, accountId: meta.accountId }, customer)) return;
      if (!accounts[meta.accountId]) accounts[meta.accountId] = { customer: meta.label, out: 0, below: 0, ok: 0 };
      var on = num(part.on_hand);
      var min = num(part.min_qty);
      if (on == null) on = 0;
      if (on <= 0) accounts[meta.accountId].out += 1;
      else if (min != null && on < min) accounts[meta.accountId].below += 1;
      else accounts[meta.accountId].ok += 1;
    });
    return Object.keys(accounts).map(function (id) { return accounts[id]; }).filter(function (row) {
      return row.out || row.below || row.ok;
    }).sort(function (a, b) { return a.customer.localeCompare(b.customer, undefined, { sensitivity: "base" }); });
  }
  function customersQuiet(data, today, customer) {
    var from = addDays(today, -30);
    var rows = buildRows(data);
    var ordered = {};
    rows.forEach(function (row) {
      if (row.placed >= from && row.placed <= today) ordered[row.accountId] = 1;
    });
    var quiet = [];
    (data.accounts || []).forEach(function (account) {
      var meta = accountMeta(account, data.companies || []);
      if (!matchesCustomer({ openId: meta.openId, accountId: meta.accountId }, customer)) return;
      if (ordered[meta.accountId]) return;
      quiet.push(meta.label);
    });
    return quiet;
  }
  function defaultRange(today) {
    return { from: addDays(today, -30), to: today };
  }
  function buildReport(data, opts) {
    opts = opts || {};
    var today = opts.today || todayIso();
    var range = defaultRange(today);
    var from = opts.from || range.from;
    var to = opts.to || range.to;
    var status = opts.status || "all";
    var customer = opts.customer || "all";
    var all = buildRows(data);
    var dated = all.filter(function (row) { return inRange(row, from, to) && matchesCustomer(row, customer); });
    var visible = dated.filter(function (row) { return status === "all" || row.bucket === status; });
    var quiet = customersQuiet(data, today, customer);
    return {
      today: today,
      from: from,
      to: to,
      status: status,
      customer: String(customer),
      rows: visible,
      choices: choices(all, (data.accounts || []).map(function (account) {
        var meta = accountMeta(account, data.companies || []);
        return { id: meta.openId, label: meta.label };
      })),
      tiles: {
        open: distinctOrders(visible, function (row) { return OPEN_BUCKET[row.bucket]; }),
        pending: distinctOrders(visible, function (row) { return row.bucket === "pending"; }),
        shipped: distinctOrders(visible, function (row) { return row.bucket === "shipped"; }),
        quiet: quiet.length
      },
      stock: stockRows(data, customer),
      note: (data && data.note) || ""
    };
  }
  function toCsv(rows) {
    var head = ["Customer", "Location", "Placed by", "Part", "Description", "Qty", "Unit", "Date placed", "Status", "Ship date", "Carrier", "PRO", "Invoice"];
    var lines = [head.join(",")];
    rows.forEach(function (row) {
      lines.push([
        row.customer, row.location, row.placedBy, row.partNo, row.description,
        qtyText(row.qty), row.unit, row.placed, row.statusLabel, row.shipDate, row.carrier, row.pro, row.invoice
      ].map(csvCell).join(","));
    });
    return lines.join("\r\n");
  }
  function statusChip(bucket) {
    var cls = bucket === "received" ? "active" : bucket === "pending" ? "lost" : "warn";
    return "<span class='chip " + cls + "'>" + esc(STATUS_LABEL[bucket] || bucket) + "</span>";
  }
  var HELP_KEY = "driven-portal-orders-help";
  function helpClosed() {
    try { return localStorage.getItem(HELP_KEY) === "1"; } catch (e) { return false; }
  }
  function setHelpClosed(closed) {
    try {
      if (closed) localStorage.setItem(HELP_KEY, "1");
      else localStorage.removeItem(HELP_KEY);
    } catch (e) { /* the strip can still be hidden for this paint */ }
  }
  function trainingTopics() {
    return [
      {
        title: "Sticky tab bar",
        view: "pipeline",
        link: "Show the tab bar",
        body: "The section tabs stay on screen while you scroll, on a computer and on a phone. On a phone, the Log call row scrolls away so the tabs do not cover the page. Reorder report sits directly to the right of Open orders."
      },
      {
        title: "Reorder report",
        view: "reorder",
        link: "Open the reorder report",
        body: "Reorder report lists every portal part across all customers, with the most urgent first. Filter by status or customer, then use Print or Export CSV. It does not email a customer and it does not show price or cost."
      },
      {
        title: "Portal orders",
        view: "customer-portal",
        link: "Open portal orders",
        body: "Portal orders is one table of what every portal customer ordered, newest first. The tiles count open orders, orders pending approval, shipments not received, and customers with no order in 30 days. Filter by date, status, and customer, then Print or Export CSV. From a company page, Portal orders opens this report for that customer."
      }
    ];
  }
  function helpHtml() {
    return "<div class='banner' id='portalOrdersHelp' style='border-left:4px solid var(--cs)'><b>How this works.</b> Open orders are not received yet, pending approval is waiting for a yes, and shipped means it left but is not checked in. Customers with no orders in 30 days always uses the last 30 days, even if you change From and To. Status, customer, and the dates narrow the table. Print and Export CSV use only the rows on screen, with no email, price, or cost. <button type='button' class='linkbtn' data-po-help-hide>Hide this</button></div>";
  }
  function reportHtml(data, opts) {
    opts = opts || {};
    var report = buildReport(data, opts);
    var h = "<div class='sect' id='portalOrders'><h2>Portal orders</h2>";
    h += "<p class='lead'>Who is ordering what, and when, across every portal customer. Read only. No customer email, price, or cost.</p>";
    if (opts.hideHelp) h += "<p class='log'><button type='button' class='linkbtn' data-po-help-show>How this works</button></p>";
    else h += helpHtml();
    if (report.note) h += "<p class='banner'>" + esc(report.note) + "</p>";
    h += "<div class='stats'>";
    h += "<div class='stat'><b>" + report.tiles.open + "</b><span>Open orders</span></div>";
    h += "<div class='stat'><b>" + report.tiles.pending + "</b><span>Pending approval</span></div>";
    h += "<div class='stat'><b>" + report.tiles.shipped + "</b><span>Shipped, not received</span></div>";
    h += "<div class='stat'><b>" + report.tiles.quiet + "</b><span>Customers with no orders in 30 days</span></div>";
    h += "</div>";
    h += "<div class='bar'>";
    h += "<label class='date'>From <input type='date' data-po-from value='" + esc(report.from) + "'></label>";
    h += "<label class='date'>To <input type='date' data-po-to value='" + esc(report.to) + "'></label>";
    h += "<div class='filters' aria-label='Status'>";
    [["all", "All statuses"], ["pending", "Pending approval"], ["approved", "Approved"], ["shipped", "Shipped"], ["received", "Received"]].forEach(function (item) {
      h += "<button type='button' data-po-status='" + item[0] + "' aria-pressed='" + (report.status === item[0]) + "'>" + item[1] + "</button>";
    });
    h += "</div><label>Customer <select data-po-customer>";
    h += "<option value='all'" + (report.customer === "all" ? " selected" : "") + ">All customers</option>";
    report.choices.forEach(function (choice) {
      h += "<option value='" + esc(choice.id) + "'" + (report.customer === String(choice.id) ? " selected" : "") + ">" + esc(choice.label) + "</option>";
    });
    h += "</select></label><div class='spacer'></div>";
    h += "<button type='button' class='ghost' data-po-print>Print</button><button type='button' class='ghost' data-po-csv>Export CSV</button></div>";
    h += "<p class='log'>Newest first. The first three tiles follow these filters. The 30-day tile always looks at the last 30 days" + (report.customer === "all" ? "" : " for this customer") + ".</p>";
    h += "<div class='panel tablewrap'><table class='rlog'><thead><tr>";
    ["Customer", "Location", "Placed by", "Part", "Qty", "Date placed", "Status"].forEach(function (label) {
      h += "<th>" + label + "</th>";
    });
    h += "</tr></thead><tbody>";
    if (!report.rows.length) h += "<tr><td colspan='7' class='empty'>No portal orders in this range.</td></tr>";
    report.rows.forEach(function (row) {
      h += "<tr><td>" + esc(row.customer) + "</td><td>" + esc(row.location || "—") + "</td><td>" + esc(row.placedBy || "—") + "</td>";
      h += "<td class='wrap'><b>" + esc(row.partNo || "—") + "</b>" + (row.description ? "<br>" + esc(row.description) : "") + (row.orderNo ? "<div class='log'>" + esc(row.orderNo) + "</div>" : "") + "</td>";
      h += "<td>" + esc(qtyText(row.qty) || "—") + (row.unit ? " <span class='log'>" + esc(row.unit) + "</span>" : "") + "</td>";
      h += "<td>" + esc(pretty(row.placed) || "—") + "</td><td>" + statusChip(row.bucket);
      if (row.detail) h += "<div class='log'>" + esc(row.detail) + "</div>";
      h += "</td></tr>";
    });
    h += "</tbody></table></div>";
    if (report.stock.length) {
      h += "<h3 class='cond' style='font-size:18px;margin:18px 0 8px'>Stock vs min</h3>";
      h += "<p class='log'>A short count by customer. The reorder report has the part-by-part list.</p>";
      h += "<div class='panel tablewrap'><table class='rlog'><thead><tr><th>Customer</th><th>Out</th><th>Below min</th><th>OK</th></tr></thead><tbody>";
      report.stock.forEach(function (row) {
        h += "<tr><td>" + esc(row.customer) + "</td><td>" + row.out + "</td><td>" + row.below + "</td><td>" + row.ok + "</td></tr>";
      });
      h += "</tbody></table></div>";
    }
    h += "</div>";
    return h;
  }
  function printHtml(report) {
    var h = "<div class='rprint'><h1>Portal orders</h1><p>" + esc(pretty(report.from)) + " – " + esc(pretty(report.to)) + ". Who ordered what, and when. No prices. No customer email.</p>";
    h += "<p>Open orders: " + report.tiles.open + ". Pending approval: " + report.tiles.pending + ". Shipped, not received: " + report.tiles.shipped + ". Customers with no orders in 30 days: " + report.tiles.quiet + ".</p>";
    h += "<table><thead><tr><th>Customer</th><th>Location</th><th>Placed by</th><th>Part</th><th>Description</th><th>Qty</th><th>Date placed</th><th>Status</th><th>Ship / carrier / invoice</th></tr></thead><tbody>";
    report.rows.forEach(function (row) {
      h += "<tr><td>" + esc(row.customer) + "</td><td>" + esc(row.location) + "</td><td>" + esc(row.placedBy) + "</td>";
      h += "<td>" + esc(row.partNo) + "</td><td>" + esc(row.description) + "</td><td>" + esc(qtyText(row.qty)) + "</td>";
      h += "<td>" + esc(pretty(row.placed)) + "</td><td>" + esc(row.statusLabel) + "</td><td>" + esc(row.detail) + "</td></tr>";
    });
    h += "</tbody></table></div>";
    return h;
  }

  var cache = { loaded: false, note: "" };
  var viewState = { status: "all", customer: "all", from: "", to: "" };

  function sampleData() {
    return {
      companies: [
        { id: 169, name: "Kempf Paper" },
        { id: 183, name: "Anchor Paper (River Valley Converting)" },
        { id: 220, name: "DELETE" },
        { id: 301, name: "North Mill" }
      ],
      accounts: [
        { company_id: 169, billed_company_id: 169, status: "active" },
        { company_id: 220, billed_company_id: 183, status: "pilot" },
        { company_id: 301, billed_company_id: 301, status: "active" }
      ],
      sites: [
        { ship_to_id: 9, company_id: 169, display_name: "Kempf mill" },
        { ship_to_id: 24, company_id: 220, display_name: "River Falls" }
      ],
      contacts: [
        { id: 3, name: "Jim Pappas", email: "jim@example.com" },
        { id: 8, name: "Pat Rivera", email: "pat@example.com" }
      ],
      sessions: [
        { id: 41, counted_by_contact_id: 3, counted_by: "jim@example.com" },
        { id: 42, counted_by: "Pat Rivera" }
      ],
      parts: [
        { id: 1, company_id: 169, driven_part_no: "DRV-PAL-48", description: "White pallet", unit: "skid", min_qty: 10, max_qty: 40, on_hand: 0, active: true },
        { id: 2, company_id: 220, driven_part_no: "DRV-BAG-18", description: "Blue bag", unit: "case", min_qty: 20, max_qty: 80, on_hand: 12, active: true },
        { id: 3, company_id: 301, driven_part_no: "DRV-BOX-12", description: "Mailer", unit: "bundle", min_qty: 5, max_qty: 20, on_hand: 9, active: true }
      ],
      orders: [
        { id: 90, order_no: "VMI-90", company_id: 169, ship_to_id: 9, status: "awaiting_approval", created_at: "2026-11-12T15:00:00Z", from_session_id: 41 },
        { id: 80, order_no: "VMI-80", company_id: 220, ship_to_id: 24, status: "shipped", created_at: "2026-11-08T15:00:00Z", from_session_id: 42, ship_date: "2026-11-09" },
        { id: 70, order_no: "VMI-70", company_id: 169, ship_to_id: 9, status: "received", created_at: "2026-11-01T15:00:00Z", received_at: "2026-11-03T15:00:00Z", qbo_invoice_no: "1044" },
        { id: 10, order_no: "VMI-10", company_id: 169, ship_to_id: 9, status: "approved", created_at: "2026-10-01T15:00:00Z" }
      ],
      lines: [
        { id: 1, order_id: 90, part_id: 1, qty: 20, unit: "skid" },
        { id: 2, order_id: 80, part_id: 2, qty: 15, unit: "case" },
        { id: 3, order_id: 70, part_id: 1, qty: 8, unit: "skid" },
        { id: 4, order_id: 10, part_id: 1, qty: 4, unit: "skid" }
      ],
      shipments: [
        { id: 5, order_id: 80, ship_date: "2026-11-09", carrier: "XPO", pro_number: "441288", status: "shipped" }
      ]
    };
  }
  function useSample() {
    cache = sampleData();
    cache.loaded = true;
    cache.note = "";
    viewState = { status: "all", customer: "all", from: "", to: "" };
  }
  function show(companyId) {
    viewState.customer = companyId == null || companyId === "" ? "all" : String(companyId);
    viewState.status = "all";
    if (host.CRMHooks && host.CRMHooks.setView) host.CRMHooks.setView("customer-portal");
    else if (typeof document !== "undefined") {
      var view = document.getElementById("view");
      if (view) paint(view);
    }
  }
  function currentOpts() {
    return { status: viewState.status, customer: viewState.customer, from: viewState.from || undefined, to: viewState.to || undefined };
  }
  function paint(view) {
    if (!view) return;
    if (!cache.loaded) {
      view.innerHTML = "<div class='sect' id='portalOrders'><h2>Portal orders</h2><p class='log'>Loading portal orders…</p></div>";
      return;
    }
    var report = buildReport(cache, currentOpts());
    view.innerHTML = reportHtml(cache, Object.assign({ hideHelp: helpClosed() }, currentOpts()));
    view._portalOrders = report;
    if (!view.dataset.poBound) {
      view.dataset.poBound = "1";
      view.addEventListener("click", onClick);
      view.addEventListener("change", onChange);
    }
  }
  function onClick(event) {
    if (event.target.closest && event.target.closest("[data-po-help-hide]")) {
      setHelpClosed(true);
      paint(event.currentTarget);
      return;
    }
    if (event.target.closest && event.target.closest("[data-po-help-show]")) {
      setHelpClosed(false);
      paint(event.currentTarget);
      return;
    }
    var status = event.target.closest && event.target.closest("[data-po-status]");
    if (status) {
      viewState.status = status.getAttribute("data-po-status") || "all";
      paint(event.currentTarget);
      return;
    }
    if (event.target.closest && event.target.closest("[data-po-csv]")) {
      var report = event.currentTarget._portalOrders || buildReport(cache, currentOpts());
      downloadCsv(toCsv(report.rows));
      return;
    }
    if (event.target.closest && event.target.closest("[data-po-print]")) {
      var printed = event.currentTarget._portalOrders || buildReport(cache, currentOpts());
      if (host.CRMHooks && host.CRMHooks.printHtml) host.CRMHooks.printHtml(printHtml(printed));
      else if (typeof document !== "undefined") {
        var area = document.getElementById("printArea");
        if (area) {
          area.innerHTML = printHtml(printed);
          window.print();
        }
      }
    }
  }
  function onChange(event) {
    var el = event.target;
    if (!el) return;
    if (el.hasAttribute("data-po-customer")) viewState.customer = el.value || "all";
    if (el.hasAttribute("data-po-from")) viewState.from = el.value || "";
    if (el.hasAttribute("data-po-to")) viewState.to = el.value || "";
    paint(event.currentTarget);
  }
  function downloadCsv(text) {
    if (typeof document === "undefined") return;
    var blob = new Blob([text], { type: "text/csv;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "driven-portal-orders.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  async function load() {
    if (!host.CRMDB || !host.CRMDB.db) {
      cache.note = "Portal orders are not connected.";
      cache.loaded = true;
      return cache;
    }
    var db = host.CRMDB.db;
    var names = {
      accounts: "vmi_accounts",
      orders: "vmi_orders",
      lines: "vmi_order_lines",
      parts: "vmi_parts",
      stock: "vmi_stock_v",
      sites: "vmi_sites",
      shipments: "vmi_shipments",
      sessions: "vmi_count_sessions"
    };
    var cols = {
      accounts: "company_id,status,billed_company_id",
      orders: "id,order_no,company_id,ship_to_id,status,created_at,from_session_id,ship_date,shipped_at,received_at,carrier,pro_number,qbo_invoice_no",
      lines: "id,order_id,part_id,qty,unit",
      parts: "id,company_id,driven_part_no,customer_sku,description,unit,active",
      stock: "part_id,company_id,driven_part_no,description,unit,min_qty,on_hand,active",
      sites: "ship_to_id,company_id,display_name",
      shipments: "id,order_id,ship_date,carrier,pro_number,qbo_invoice_number,status,received_at",
      sessions: "id,counted_by,counted_by_contact_id"
    };
    var note = "";
    var next = { loaded: true, note: "" };
    var keys = Object.keys(names);
    for (var i = 0; i < keys.length; i++) {
      var res = await db.from(names[keys[i]]).select(cols[keys[i]]);
      if (res.error) {
        next[keys[i]] = [];
        if (!note) note = "Could not read portal orders. " + (res.error.message || "Try again.");
      } else next[keys[i]] = res.data || [];
    }
    var companyIds = [];
    (next.accounts || []).forEach(function (account) {
      companyIds.push(account.company_id);
      if (account.billed_company_id) companyIds.push(account.billed_company_id);
    });
    var contactIds = (next.sessions || []).map(function (session) { return session.counted_by_contact_id; }).filter(function (id) { return id != null; });
    next.companies = await idsOf("crm_companies", "id,name", companyIds);
    next.contacts = await idsOf("crm_contacts", "id,name", contactIds);
    next.note = note;
    cache = next;
    return cache;
  }
  async function idsOf(table, columns, ids) {
    var uniq = [];
    (ids || []).forEach(function (id) {
      if (id == null || id === "") return;
      if (uniq.indexOf(id) < 0 && uniq.indexOf(+id) < 0) uniq.push(id);
    });
    if (!uniq.length || !host.CRMDB || !host.CRMDB.db) return [];
    var res = await host.CRMDB.db.from(table).select(columns).in("id", uniq);
    return res.error ? [] : (res.data || []);
  }

  return {
    buildReport: buildReport,
    trainingTopics: trainingTopics,
    helpHtml: helpHtml,
    buildRows: buildRows,
    reportHtml: reportHtml,
    printHtml: printHtml,
    toCsv: toCsv,
    sampleData: sampleData,
    useSample: useSample,
    show: show,
    paint: paint,
    load: load,
    bucketOf: bucketOf
  };
});
