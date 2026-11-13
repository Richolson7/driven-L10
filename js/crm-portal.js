/* Customer portal, read only.
   The reorder report and the company section read vmi_* rows.
   They do not write, they do not email, and they do not show price,
   cost, or a customer email address. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.CRMPortal = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  var WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var RANK = { out: 0, below: 1, near: 2, ok: 3 };
  var STATUS_LABEL = { out: "Out", below: "Below min", near: "Near min", ok: "OK" };
  var OPEN_STATUS = { suggested: 1, awaiting_approval: 1, approved: 1, released: 1, ordered: 1, shipped: 1, held: 1 };
  var ROLE_LABEL = { counter: "Counter", buyer: "Buyer", viewer: "Viewer", customer_user: "User", customer_admin: "Admin" };
  var COLS = {
    accounts: "company_id,status,billed_company_id,approval_required,who_counts,review_weeks,created_at",
    sites: "ship_to_id,company_id,display_name,count_day,grace_days,sort_order",
    stock: "part_id,company_id,ship_to_id,site_name,site_address,count_day,grace_days,bin,driven_part_no,customer_sku,description,unit,pack_qty,min_qty,max_qty,ship_multiple,active,on_hand,counted_at,counted_by,customer_erp_item_id",
    orders: "id,order_no,company_id,ship_to_id,status,created_at",
    lines: "id,order_id,part_id,qty,unit",
    users: "contact_id,company_id,role,access,invited_at,last_login_at",
    counts: "part_id,company_id,qty,counted_at"
  };
  var TABLE = {
    accounts: "vmi_accounts",
    sites: "vmi_sites",
    stock: "vmi_stock_v",
    orders: "vmi_orders",
    lines: "vmi_order_lines",
    users: "vmi_portal_users",
    counts: "vmi_counts"
  };
  var cache = emptyCache();
  var viewState = { status: "all", customer: "all" };

  function emptyCache() {
    return { accounts: [], sites: [], stock: [], orders: [], lines: [], users: [], counts: [], note: "", loaded: false };
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
  function daysBetween(a, b) { return Math.round((parseDate(b) - parseDate(a)) / 864e5); }
  function todayIso() { return fmt(new Date()); }
  function pretty(iso) {
    if (!iso) return "—";
    var x = parseDate(iso);
    if (isNaN(x.getTime())) return "—";
    var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return months[x.getMonth()] + " " + x.getDate() + ", " + x.getFullYear();
  }
  function qtyText(v) {
    var n = num(v);
    if (n == null) return "—";
    var r = Math.round(n * 100) / 100;
    if (Math.abs(r - Math.round(r)) < 1e-9) return String(Math.round(r));
    return String(r);
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function personName(s) {
    var t = String(s == null ? "" : s).trim();
    if (!t) return "";
    if (t.indexOf("@") >= 0) return "Portal user";
    return t;
  }
  function csvCell(v) {
    var t = v == null ? "" : String(v);
    if (/^[=+\-@]/.test(t)) t = "'" + t;
    if (/[",\r\n]/.test(t)) return '"' + t.replace(/"/g, '""') + '"';
    return t;
  }
  function isActive(part) { return part.active !== false && part.active !== "false"; }
  function nameOf(companies, id) {
    var c = (companies || []).find(function (x) { return String(x.id) === String(id); });
    return c && c.name ? c.name : "";
  }
  function contactName(contacts, id) {
    var c = (contacts || []).find(function (x) { return String(x.id) === String(id); });
    var name = c ? personName(c.name) : "";
    return name || ("Contact " + id);
  }
  function accountMeta(account, companies) {
    var own = nameOf(companies, account.company_id) || ("Company " + account.company_id);
    var billedId = account.billed_company_id;
    var billed = billedId ? nameOf(companies, billedId) : "";
    var different = billedId && String(billedId) !== String(account.company_id) && billed;
    return {
      accountId: String(account.company_id),
      openId: different ? String(billedId) : String(account.company_id),
      label: different ? billed : own,
      note: different ? ("Portal account is on " + own + ".") : "",
      billedNote: different ? ("Billed to " + billed + ".") : ""
    };
  }
  function siteOf(part, sites) {
    var found = (sites || []).find(function (s) { return String(s.ship_to_id) === String(part.ship_to_id); });
    if (found) return found;
    return {
      ship_to_id: part.ship_to_id,
      company_id: part.company_id,
      display_name: part.site_name || part.site_address || "",
      count_day: part.count_day || null,
      grace_days: part.grace_days
    };
  }
  function locationText(part, site) {
    var name = (site && (site.display_name || site.site_name)) || part.site_name || part.site_address || "";
    if (part.bin) name = name ? (name + " · bin " + part.bin) : ("Bin " + part.bin);
    return name || "—";
  }
  function partNo(part) {
    return part.customer_sku || part.driven_part_no || part.customer_erp_item_id || ("Part " + part.part_id);
  }
  function stockStatus(part) {
    var on = num(part.on_hand);
    if (on == null) on = 0;
    var min = num(part.min_qty);
    if (min == null) return "ok";
    if (on <= 0 && min > 0) return "out";
    if (on < min) return "below";
    if (min > 0 && on <= min * 1.25) return "near";
    return "ok";
  }
  function suggestedOrderQty(part) {
    var max = num(part.max_qty);
    var on = num(part.on_hand);
    if (on == null) on = 0;
    if (max == null) return null;
    var raw = max - on;
    if (raw <= 0) return 0;
    var multiple = num(part.ship_multiple);
    if (!(multiple > 1)) {
      var pack = num(part.pack_qty);
      if (pack > 1) multiple = pack;
    }
    if (multiple > 1) return Math.ceil(raw / multiple) * multiple;
    return raw;
  }
  function nextWeekdayOnOrAfter(iso, name) {
    var want = WEEKDAYS.indexOf(name);
    if (want < 0 || !iso) return null;
    var x = parseDate(iso);
    var delta = (want - x.getDay() + 7) % 7;
    x.setDate(x.getDate() + delta);
    return fmt(x);
  }
  function nextCount(account, site, lastCount, today) {
    var weeks = num(account && account.review_weeks);
    if (!(weeks > 0)) weeks = 1;
    var interval = Math.round(weeks * 7);
    var grace = num(site && site.grace_days);
    if (grace == null || grace < 0) grace = 0;
    var countDay = site && site.count_day;
    var anchor = lastCount || day(account && account.created_at);
    var due = null;
    if (countDay && WEEKDAYS.indexOf(countDay) >= 0) {
      var start = lastCount ? addDays(lastCount, 1) : (anchor || today);
      if (interval > 7 && lastCount) start = addDays(lastCount, interval);
      due = nextWeekdayOnOrAfter(start, countDay);
    } else if (anchor) due = addDays(anchor, interval);
    return { due: due, overdue: !!(due && daysBetween(due, today) > grace), interval: interval, grace: grace };
  }
  function usagePerDay(partId, counts) {
    var rows = (counts || []).filter(function (c) {
      return String(c.part_id) === String(partId) && num(c.qty) != null && day(c.counted_at);
    });
    rows.sort(function (a, b) { return String(a.counted_at) < String(b.counted_at) ? -1 : 1; });
    if (rows.length < 2) return null;
    var older = rows[rows.length - 2];
    var newer = rows[rows.length - 1];
    var span = daysBetween(day(older.counted_at), day(newer.counted_at));
    if (span <= 0) return null;
    var used = num(older.qty) - num(newer.qty);
    if (!(used > 0)) return null;
    return used / span;
  }
  function projectedReorder(part, counts, today) {
    var on = num(part.on_hand);
    if (on == null) on = 0;
    var min = num(part.min_qty);
    if (min != null && on <= min) return { kind: "date", date: today };
    var rate = usagePerDay(part.part_id, counts);
    if (rate > 0 && min != null && on > min) {
      return { kind: "date", date: addDays(today, Math.ceil((on - min) / rate)) };
    }
    return { kind: "next", date: null };
  }
  function lastCountFor(part, counts) {
    var best = day(part.counted_at);
    (counts || []).forEach(function (c) {
      if (String(c.part_id) !== String(part.part_id)) return;
      var d = day(c.counted_at);
      if (d && (!best || d > best)) best = d;
    });
    var who = personName(part.counted_by);
    if (best && day(part.counted_at) && best !== day(part.counted_at)) who = "";
    return { date: best, by: who };
  }
  function ordersCell(partId, lines, ordersById) {
    var pending = 0, suggested = 0, open = 0, hold = 0;
    (lines || []).forEach(function (l) {
      if (String(l.part_id) !== String(partId)) return;
      var o = ordersById[String(l.order_id)];
      if (!o || !OPEN_STATUS[o.status]) return;
      var q = num(l.qty) || 0;
      if (o.status === "awaiting_approval") pending += q;
      else if (o.status === "suggested") suggested += q;
      else if (o.status === "held") hold += q;
      else open += q;
    });
    var bits = [];
    if (pending) bits.push("Pending approval " + qtyText(pending));
    if (suggested) bits.push("Suggested " + qtyText(suggested));
    if (hold) bits.push("On hold " + qtyText(hold));
    if (open) bits.push("Open " + qtyText(open));
    return { text: bits.length ? bits.join(" · ") : "—", pending: pending > 0 };
  }
  function rowFrom(part, meta, data, ordersById, today) {
    var site = siteOf(part, data.sites);
    var last = lastCountFor(part, data.counts);
    var due = nextCount(part.company_id ? findAccount(data, part.company_id) : null, site, last.date, today);
    var projected = projectedReorder(part, data.counts, today);
    var orders = ordersCell(part.part_id, data.lines, ordersById);
    var on = num(part.on_hand);
    if (on == null) on = 0;
    var min = num(part.min_qty);
    var status = stockStatus(part);
    var suggested = suggestedOrderQty(part);
    return {
      accountId: meta.accountId,
      customer: meta.label,
      location: locationText(part, site),
      partNo: partNo(part),
      erp: part.customer_erp_item_id || "",
      description: part.description || "",
      unit: part.unit || "",
      onHand: on,
      min: min,
      max: num(part.max_qty),
      suggested: suggested,
      status: status,
      statusLabel: STATUS_LABEL[status] || status,
      belowMin: min != null && on < min,
      lastCount: last.date,
      countedBy: last.by,
      nextDue: due.due,
      countOverdue: due.overdue,
      projected: projected.kind === "date" ? projected.date : "at next count",
      ordersText: orders.text,
      pending: orders.pending
    };
  }
  function findAccount(data, companyId) {
    return (data.accounts || []).find(function (a) { return String(a.company_id) === String(companyId); }) || null;
  }
  function rankOf(status) {
    return Object.prototype.hasOwnProperty.call(RANK, status) ? RANK[status] : 9;
  }
  function compareRows(a, b) {
    var d = rankOf(a.status) - rankOf(b.status);
    if (d) return d;
    d = String(a.location).localeCompare(String(b.location));
    if (d) return d;
    return String(a.partNo).localeCompare(String(b.partNo));
  }
  function worst(rows) {
    var rank = 9;
    rows.forEach(function (r) { if (rankOf(r.status) < rank) rank = rankOf(r.status); });
    return rank;
  }
  function signedIn(account, users) {
    return (users || []).some(function (u) {
      return String(u.company_id) === String(account.company_id) && u.last_login_at;
    });
  }
  function toCsv(rows) {
    var headers = ["Customer", "Location", "Part #", "Description", "On hand", "Min", "Max", "Suggested order qty", "Status", "Last count", "Next count due", "Projected reorder", "Open orders"];
    var out = [headers.join(",")];
    rows.forEach(function (r) {
      out.push([
        r.customer, r.location, r.partNo, r.description,
        r.onHand, r.min == null ? "" : r.min, r.max == null ? "" : r.max,
        r.suggested == null ? "" : r.suggested, r.statusLabel,
        r.lastCount || "", r.nextDue || "", r.projected,
        r.ordersText === "—" ? "" : r.ordersText
      ].map(csvCell).join(","));
    });
    return out.join("\r\n");
  }
  function buildReport(data, opts) {
    data = data || {};
    opts = opts || {};
    var today = opts.today || todayIso();
    var statusFilter = opts.status || "all";
    var customerFilter = opts.customer == null || opts.customer === "" ? "all" : String(opts.customer);
    var accounts = data.accounts || [];
    var companies = data.companies || [];
    var ordersById = {};
    (data.orders || []).forEach(function (o) { ordersById[String(o.id)] = o; });
    var choices = accounts.map(function (a) {
      var meta = accountMeta(a, companies);
      return { id: meta.accountId, label: meta.label };
    }).sort(function (a, b) { return a.label.localeCompare(b.label); });
    var scoped = accounts.filter(function (a) {
      return customerFilter === "all" || String(a.company_id) === customerFilter;
    });
    var allRows = [];
    var groups = [];
    scoped.forEach(function (account) {
      var meta = accountMeta(account, companies);
      var parts = (data.stock || []).filter(function (p) {
        return isActive(p) && String(p.company_id) === String(account.company_id);
      });
      var rows = parts.map(function (part) { return rowFrom(part, meta, data, ordersById, today); });
      rows.sort(compareRows);
      rows.forEach(function (r) { allRows.push(r); });
      var visible = rows.filter(function (r) { return statusFilter === "all" || r.status === statusFilter; });
      if (!visible.length) return;
      var flags = [];
      if (visible.some(function (r) { return r.belowMin; })) flags.push("Below min");
      if (visible.some(function (r) { return r.countOverdue; })) flags.push("Count overdue");
      if (visible.some(function (r) { return r.pending; })) flags.push("Pending approval");
      if (!signedIn(account, data.users)) flags.push("No sign-in yet");
      groups.push({ meta: meta, rows: visible, flags: flags });
    });
    groups.sort(function (a, b) {
      var d = worst(a.rows) - worst(b.rows);
      if (d) return d;
      return a.meta.label.localeCompare(b.meta.label);
    });
    var flat = [];
    groups.forEach(function (g) { g.rows.forEach(function (r) { flat.push(r); }); });
    var scopeIds = {};
    scoped.forEach(function (a) { scopeIds[String(a.company_id)] = 1; });
    return {
      today: today,
      note: data.note || "",
      choices: choices,
      groups: groups,
      rows: flat,
      status: statusFilter,
      customer: customerFilter,
      tiles: {
        belowMin: allRows.filter(function (r) { return r.belowMin; }).length,
        countsOverdue: allRows.filter(function (r) { return r.countOverdue; }).length,
        pendingOrders: (data.orders || []).filter(function (o) {
          return o.status === "awaiting_approval" && scopeIds[String(o.company_id)];
        }).length,
        noSignIn: scoped.filter(function (a) { return !signedIn(a, data.users); }).length
      },
      csv: toCsv(flat)
    };
  }
  function statusChip(status) {
    var cls = status === "out" ? "lost" : status === "ok" ? "active" : "warn";
    return "<span class='chip " + cls + "'>" + esc(STATUS_LABEL[status] || status) + "</span>";
  }
  function qtyCell(n) { return n == null ? "—" : esc(qtyText(n)); }
  function reportHtml(data, opts) {
    var report = buildReport(data, opts);
    var h = "<div class='sect' id='reorderReport'><h2>Reorder report</h2>";
    h += "<p class='lead'>What needs to be ordered, and when. Every portal account is on this page. Read only. This does not email a customer, and it does not show price or cost.</p>";
    if (report.note) h += "<p class='banner'>" + esc(report.note) + "</p>";
    h += "<div class='stats'>";
    h += "<div class='stat'><b>" + report.tiles.belowMin + "</b><span>Parts below min</span></div>";
    h += "<div class='stat'><b>" + report.tiles.countsOverdue + "</b><span>Counts overdue</span></div>";
    h += "<div class='stat'><b>" + report.tiles.pendingOrders + "</b><span>Orders pending approval</span></div>";
    h += "<div class='stat'><b>" + report.tiles.noSignIn + "</b><span>Accounts nobody has signed into</span></div>";
    h += "</div>";
    h += "<div class='bar'><div class='filters' aria-label='Status'>";
    [["all", "All statuses"], ["out", "Out"], ["below", "Below min"], ["near", "Near min"], ["ok", "OK"]].forEach(function (x) {
      h += "<button type='button' data-portal-status='" + x[0] + "' aria-pressed='" + (report.status === x[0]) + "'>" + x[1] + "</button>";
    });
    h += "</div><div class='filters' aria-label='Customer'><button type='button' data-portal-customer='all' aria-pressed='" + (report.customer === "all") + "'>All customers</button>";
    report.choices.forEach(function (c) {
      h += "<button type='button' data-portal-customer='" + esc(c.id) + "' aria-pressed='" + (report.customer === String(c.id)) + "'>" + esc(c.label) + "</button>";
    });
    h += "</div><div class='spacer'></div><button type='button' class='ghost' data-portal-print>Print</button><button type='button' class='ghost' data-portal-csv>Export CSV</button></div>";
    h += "<p class='log'>Tiles follow the customer filter. Status narrows the rows. Suggested qty is max minus on hand, rounded up to the skid or pack size when that size is more than one.</p>";
    h += "<div class='panel tablewrap'><table class='rlog'><thead><tr>";
    ["Customer", "Location", "Part #", "Description", "On hand", "Min", "Max", "Suggested order qty", "Status", "Last count", "Next count due", "Projected reorder", "Open orders"].forEach(function (label) {
      h += "<th>" + label + "</th>";
    });
    h += "</tr></thead><tbody>";
    if (!report.groups.length) {
      h += "<tr><td colspan='13' class='empty'>No portal parts match.</td></tr>";
    }
    report.groups.forEach(function (g) {
      h += "<tr class='rgroup'><td colspan='13'><button type='button' class='linkbtn' data-open-company='" + esc(g.meta.openId) + "'>" + esc(g.meta.label) + "</button>";
      if (g.meta.note) h += " <span class='log'>" + esc(g.meta.note) + "</span>";
      g.flags.forEach(function (flag) { h += " <span class='chip warn'>" + esc(flag) + "</span>"; });
      h += "</td></tr>";
      g.rows.forEach(function (r) {
        h += "<tr>";
        h += "<td>" + esc(r.customer) + "</td>";
        h += "<td>" + esc(r.location) + "</td>";
        h += "<td>" + esc(r.partNo) + "</td>";
        h += "<td class='wrap'>" + esc(r.description) + (r.erp ? "<div class='log'>ERP item " + esc(r.erp) + "</div>" : "") + "</td>";
        h += "<td>" + esc(qtyText(r.onHand)) + (r.unit ? " <span class='log'>" + esc(r.unit) + "</span>" : "") + "</td>";
        h += "<td>" + qtyCell(r.min) + "</td><td>" + qtyCell(r.max) + "</td><td>" + qtyCell(r.suggested) + "</td>";
        h += "<td>" + statusChip(r.status) + "</td>";
        h += "<td>" + (r.lastCount ? esc(pretty(r.lastCount)) : "No count yet") + "</td>";
        h += "<td>" + (r.nextDue ? esc(pretty(r.nextDue)) : "—") + (r.countOverdue ? " <span class='chip lost'>Overdue</span>" : "") + "</td>";
        h += "<td>" + esc(r.projected === "at next count" ? "at next count" : pretty(r.projected)) + "</td>";
        h += "<td>" + esc(r.ordersText) + "</td></tr>";
      });
    });
    h += "</tbody></table></div></div>";
    return h;
  }
  function printHtml(report) {
    var h = "<div class='rprint'><h1>Reorder report</h1><p>" + esc(pretty(report.today)) + " · What needs to be ordered, and when. Read only. No prices. No customer email.</p>";
    h += "<p>Parts below min: " + report.tiles.belowMin + ". Counts overdue: " + report.tiles.countsOverdue + ". Orders pending approval: " + report.tiles.pendingOrders + ". Accounts nobody has signed into: " + report.tiles.noSignIn + ".</p>";
    h += "<table><thead><tr>";
    ["Customer", "Location", "Part #", "Description", "On hand", "Min", "Max", "Suggested order qty", "Status", "Last count", "Next count due", "Projected reorder", "Open orders"].forEach(function (label) {
      h += "<th>" + label + "</th>";
    });
    h += "</tr></thead><tbody>";
    report.rows.forEach(function (r) {
      h += "<tr><td>" + esc(r.customer) + "</td><td>" + esc(r.location) + "</td><td>" + esc(r.partNo) + "</td><td>" + esc(r.description) + "</td>";
      h += "<td>" + esc(qtyText(r.onHand)) + "</td><td>" + qtyCell(r.min) + "</td><td>" + qtyCell(r.max) + "</td><td>" + qtyCell(r.suggested) + "</td>";
      h += "<td>" + esc(r.statusLabel) + "</td><td>" + (r.lastCount ? esc(pretty(r.lastCount)) : "No count yet") + "</td>";
      h += "<td>" + (r.nextDue ? esc(pretty(r.nextDue)) : "—") + (r.countOverdue ? " overdue" : "") + "</td>";
      h += "<td>" + esc(r.projected === "at next count" ? "at next count" : pretty(r.projected)) + "</td><td>" + esc(r.ordersText) + "</td></tr>";
    });
    h += "</tbody></table></div>";
    return h;
  }
  function intervalLabel(account, site) {
    var weeks = num(account.review_weeks);
    if (!(weeks > 0)) weeks = 1;
    var bits = ["Every " + (weeks === 1 ? "week" : weeks + " weeks")];
    if (site && site.count_day) bits.push("on " + site.count_day);
    else bits.push("count day not set");
    var grace = num(site && site.grace_days);
    if (grace) bits.push(grace + "-day grace");
    return bits.join(", ");
  }
  function companyHtml(companyId, data, opts) {
    data = data || {};
    opts = opts || {};
    var accounts = (data.accounts || []).filter(function (a) {
      return String(a.company_id) === String(companyId) || String(a.billed_company_id) === String(companyId);
    });
    if (!accounts.length) return "";
    var today = opts.today || todayIso();
    var h = "<fieldset id='portalSection'><legend>Customer portal</legend>";
    h += "<p class='log'>Read only. This does not email the customer or change stock, orders, or access.</p>";
    accounts.forEach(function (account) {
      var meta = accountMeta(account, data.companies || []);
      var report = buildReport(data, { today: today, status: "all", customer: String(account.company_id) });
      var sites = (data.sites || []).filter(function (s) { return String(s.company_id) === String(account.company_id); });
      var cadence = sites.length ? sites.map(function (s) { return intervalLabel(account, s); }).join(" · ") : intervalLabel(account, null);
      h += "<p><b>" + esc(meta.label) + "</b> <span class='chip'>" + esc(account.status || "pilot") + "</span>";
      if (String(companyId) === String(account.company_id) && meta.billedNote) h += " <span class='log'>" + esc(meta.billedNote) + "</span>";
      if (String(companyId) !== String(account.company_id) && meta.note) h += " <span class='log'>" + esc(meta.note) + "</span>";
      h += "</p><p class='log'>" + esc(account.who_counts === "driven" ? "Driven counts" : "Customer counts") + ". " + esc(cadence) + ".</p>";
      h += "<div class='tablewrap'><table class='rlog'><thead><tr><th>Part</th><th>On hand</th><th>Min</th><th>Max</th><th>Status</th><th>Last count</th></tr></thead><tbody>";
      if (!report.rows.length) h += "<tr><td colspan='6' class='empty'>No active parts.</td></tr>";
      report.rows.forEach(function (r) {
        h += "<tr><td class='wrap'><b>" + esc(r.partNo) + "</b><br>" + esc(r.description) + (r.erp ? "<div class='log'>ERP item " + esc(r.erp) + "</div>" : "") + "<div class='log'>" + esc(r.location) + "</div></td>";
        h += "<td>" + esc(qtyText(r.onHand)) + (r.unit ? " <span class='log'>" + esc(r.unit) + "</span>" : "") + "</td>";
        h += "<td>" + qtyCell(r.min) + "</td><td>" + qtyCell(r.max) + "</td><td>" + statusChip(r.status) + "</td>";
        h += "<td>" + (r.lastCount ? esc(pretty(r.lastCount)) : "No count yet") + "<div class='log'>" + esc(r.countedBy || "—") + "</div></td></tr>";
      });
      h += "</tbody></table></div>";
      var ordersById = {};
      (data.orders || []).forEach(function (o) { ordersById[String(o.id)] = o; });
      var openOrders = (data.orders || []).filter(function (o) {
        return String(o.company_id) === String(account.company_id) && OPEN_STATUS[o.status];
      });
      h += "<h3 class='cond' style='font-size:18px;margin:14px 0 6px'>Open reorders and orders</h3>";
      if (!openOrders.length) h += "<p class='log'>No open reorders or orders.</p>";
      else {
        h += "<ul class='mini'>";
        openOrders.forEach(function (o) {
          var bits = (data.lines || []).filter(function (l) { return String(l.order_id) === String(o.id); }).map(function (l) {
            var part = (data.stock || []).find(function (p) { return String(p.part_id) === String(l.part_id); });
            var name = part ? partNo(part) : ("Part " + l.part_id);
            return name + " · " + qtyText(l.qty) + (l.unit ? " " + l.unit : "");
          });
          var label = o.status === "awaiting_approval" ? "Pending approval" : (o.status || "");
          h += "<li><b>" + esc(o.order_no || ("Order " + o.id)) + "</b> · " + esc(label) + " · " + esc(pretty(day(o.created_at)));
          if (bits.length) h += "<br><span class='log'>" + esc(bits.join("; ")) + "</span>";
          h += "</li>";
        });
        h += "</ul>";
      }
      var users = (data.users || []).filter(function (u) { return String(u.company_id) === String(account.company_id); });
      users.sort(function (a, b) {
        return contactName(data.contacts, a.contact_id).localeCompare(contactName(data.contacts, b.contact_id));
      });
      h += "<h3 class='cond' style='font-size:18px;margin:14px 0 6px'>Portal access</h3>";
      h += "<div class='tablewrap'><table><thead><tr><th>Name</th><th>Role</th><th>Access</th><th>Invited</th><th>Last sign-in</th></tr></thead><tbody>";
      if (!users.length) h += "<tr><td colspan='5' class='empty'>Nobody has portal access.</td></tr>";
      users.forEach(function (u) {
        h += "<tr><td>" + esc(contactName(data.contacts, u.contact_id)) + "</td>";
        h += "<td>" + esc(ROLE_LABEL[u.role] || u.role || "") + "</td>";
        h += "<td>" + (u.access === false || u.access === "false" ? "No" : "Yes") + "</td>";
        h += "<td>" + (u.invited_at ? esc(pretty(day(u.invited_at))) : "—") + "</td>";
        h += "<td>" + (u.last_login_at ? esc(pretty(day(u.last_login_at))) : "Not yet") + "</td></tr>";
      });
      h += "</tbody></table></div>";
    });
    h += "<p style='margin-top:10px'><button type='button' class='ghost' data-act='open-reorder'>Open reorder report</button></p></fieldset>";
    return h;
  }
  function merge(ctx, src) {
    src = src || cache || {};
    ctx = ctx || {};
    return {
      accounts: src.accounts || [],
      sites: src.sites || [],
      stock: src.stock || [],
      orders: src.orders || [],
      lines: src.lines || [],
      users: src.users || [],
      counts: src.counts || [],
      companies: ctx.companies || [],
      contacts: (ctx.contacts || []).map(function (c) {
        return { id: c.id, name: c.name || "", company_id: c.company_id };
      }),
      note: src.note || ""
    };
  }
  function linked(companyId) {
    return !!(cache && cache.loaded && (cache.accounts || []).some(function (a) {
      return String(a.company_id) === String(companyId) || String(a.billed_company_id) === String(companyId);
    }));
  }
  function forCompany(companyId, ctx) {
    if (!cache || !cache.loaded) return "";
    return companyHtml(companyId, merge(ctx, cache), { today: todayIso() });
  }
  function belowMinCount() {
    if (!cache || !cache.loaded) return 0;
    return buildReport(cache, { today: todayIso(), status: "all", customer: "all" }).tiles.belowMin;
  }
  function downloadCsv(text) {
    if (typeof document === "undefined" || !document.createElement) return;
    var blob = new Blob([text], { type: "text/csv;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "driven-reorder-report.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function onPortalClick(e) {
    var root = e.currentTarget;
    var ctx = root._portalCtx || {};
    var st = e.target.closest("[data-portal-status]");
    if (st) { viewState.status = st.getAttribute("data-portal-status") || "all"; render(root, ctx); return; }
    var cu = e.target.closest("[data-portal-customer]");
    if (cu) { viewState.customer = cu.getAttribute("data-portal-customer") || "all"; render(root, ctx); return; }
    if (e.target.closest("[data-portal-csv]")) {
      downloadCsv(buildReport(merge(ctx), { today: todayIso(), status: viewState.status, customer: viewState.customer }).csv);
      return;
    }
    if (e.target.closest("[data-portal-print]")) {
      var report = buildReport(merge(ctx), { today: todayIso(), status: viewState.status, customer: viewState.customer });
      if (ctx.print) ctx.print(printHtml(report));
    }
  }
  function render(root, ctx) {
    if (!root) return;
    root._portalCtx = ctx || root._portalCtx || {};
    if (!cache || !cache.loaded) {
      root.innerHTML = "<p class='banner'>Loading the reorder report…</p>";
      return;
    }
    root.innerHTML = reportHtml(merge(root._portalCtx), { today: todayIso(), status: viewState.status, customer: viewState.customer });
    if (!root.dataset.portalBound) {
      root.dataset.portalBound = "1";
      root.addEventListener("click", onPortalClick);
    }
  }
  async function load(db) {
    db = db || (typeof window !== "undefined" && window.CRMDB && window.CRMDB.db);
    cache = emptyCache();
    if (!db || !db.from) {
      cache.note = "Customer portal is not connected.";
      cache.loaded = true;
      return cache;
    }
    var names = Object.keys(COLS);
    var results;
    try {
      results = await Promise.all(names.map(function (name) {
        return db.from(TABLE[name]).select(COLS[name]).then(function (res) {
          return { name: name, data: res && res.data, error: res && res.error };
        }, function (err) {
          return { name: name, data: [], error: { message: (err && err.message) || "Could not read the portal." } };
        });
      }));
    } catch (err) {
      cache.note = "Could not read the customer portal.";
      cache.loaded = true;
      return cache;
    }
    var note = "";
    results.forEach(function (res) {
      if (res.error) {
        cache[res.name] = [];
        if (!note) note = "Could not read the customer portal. " + (res.error.message || "Try again.");
      } else cache[res.name] = res.data || [];
    });
    cache.note = note;
    cache.loaded = true;
    return cache;
  }

  return {
    buildReport: buildReport,
    reportHtml: reportHtml,
    printHtml: printHtml,
    companyHtml: companyHtml,
    stockStatus: stockStatus,
    suggestedOrderQty: suggestedOrderQty,
    load: load,
    render: render,
    forCompany: forCompany,
    linked: linked,
    belowMinCount: belowMinCount
  };
});
