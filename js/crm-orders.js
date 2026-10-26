/* Open Orders math. Matches the KPI sheet formulas.
   Revenue, vendor cost, overall cost, gross profit, and margin are not stored.
   Sheet: Order Revenue = sell * qty, Vendor Cost = vendor price * qty (qty ordered,
   not a separate vendor quantity), Overall = vendor cost + freight (blank freight is 0),
   Gross Profit = revenue - overall, Margin = profit / revenue.
   A blank sell or qty makes revenue blank. A blank vendor price or qty makes cost blank.
   If revenue exists and profit is blank, margin is 0, same as a blank cell in that formula. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CRMOrders = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  var CATEGORIES = [
    "Stretch Wrap / Film",
    "Pallets",
    "Poly Bags / Tubing",
    "Shrink Products",
    "Gaylords / Totes",
    "Tape",
    "Corner Boards",
    "Lidding / Laminate Film",
    "Flexibles",
    "Ridgid",
    "MRO",
    "Freight",
    "Other"
  ];
  var SHEET_HEADERS = [
    "Line Created Date",
    "Customer",
    "Product Description",
    "Invoice #",
    "Sales Rep",
    "Category",
    "Vendor",
    "Qty Ordered",
    "Unit (rolls/pallets/cases/lbs)",
    "Vendor Price (ea)",
    "Freight Cost ($)",
    "Sell Price (ea)",
    "Order Revenue ($)",
    "Vendor Cost ($)",
    "Overall Cost ($)",
    "Gross Profit ($)",
    "Margin %"
  ];
  var STATUS_HEADERS = ["Stage", "Customer PO", "Est. ship", "Est. delivery", "Invoice sent", "Paid"];

  function num(v) {
    if (v == null || v === "") return null;
    var n = +v;
    return isNaN(n) ? null : n;
  }
  function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
  function calc(line) {
    var qty = num(line && line.qty);
    var sell = num(line && line.price);
    var vendor = num(line && line.cost);
    var freight = num(line && line.freight);
    var revenue = sell == null || qty == null ? null : round2(sell * qty);
    var vendorCost = vendor == null || qty == null ? null : round2(vendor * qty);
    var overall = vendorCost == null ? null : round2(vendorCost + (freight == null ? 0 : freight));
    var profit = revenue == null || overall == null ? null : round2(revenue - overall);
    var margin = revenue == null || revenue === 0 ? null : (profit == null ? 0 : profit / revenue);
    return { revenue: revenue, vendorCost: vendorCost, overall: overall, profit: profit, margin: margin };
  }
  function totals(rows) {
    var rev = 0, cost = 0, overall = 0;
    (rows || []).forEach(function (r) {
      var c = r.calc || calc(r);
      if (c.revenue != null) rev += c.revenue;
      if (c.vendorCost != null) cost += c.vendorCost;
      if (c.overall != null) overall += c.overall;
    });
    rev = round2(rev);
    cost = round2(cost);
    overall = round2(overall);
    var profit = round2(rev - overall);
    return { revenue: rev, vendorCost: cost, overall: overall, profit: profit, margin: rev ? profit / rev : null };
  }
  function money(n) {
    if (n == null || n === "" || isNaN(+n)) return "";
    return (+n).toLocaleString("en-US", { style: "currency", currency: "USD" });
  }
  function pct(n) {
    if (n == null || n === "" || isNaN(+n)) return "";
    return (+n * 100).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
  }
  function mdy(s) {
    if (!s) return "";
    var p = String(s).slice(0, 10).split("-");
    if (p.length < 3 || p[0].length !== 4) return String(s);
    return p[1] + "/" + p[2] + "/" + p[0];
  }
  function cell(v) {
    if (v == null) return "";
    var s = String(v);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  function marginExport(n) {
    if (n == null || n === "") return "";
    return String(Math.round(n * 10000) / 10000);
  }
  function csv(rows) {
    var headers = SHEET_HEADERS.concat(STATUS_HEADERS);
    var lines = [headers.join(",")];
    (rows || []).forEach(function (r) {
      var c = r.calc || calc(r);
      lines.push([
        mdy(r.lineDate), r.customer, r.description, r.invoice, r.rep, r.category, r.vendor,
        r.qty == null ? "" : r.qty, r.unit || "", r.vendorPrice == null ? "" : r.vendorPrice,
        r.freight == null ? "" : r.freight, r.sellPrice == null ? "" : r.sellPrice,
        c.revenue == null ? "" : c.revenue, c.vendorCost == null ? "" : c.vendorCost,
        c.overall == null ? "" : c.overall, c.profit == null ? "" : c.profit, marginExport(c.margin),
        r.stage, r.po, mdy(r.estShip), mdy(r.estDelivery), mdy(r.invoiceSent), mdy(r.paid)
      ].map(cell).join(","));
    });
    return lines.join("\n");
  }

  function parseCsv(text) {
    var rows = [];
    var row = [];
    var cur = "";
    var q = false;
    var s = String(text || "").replace(/^\uFEFF/, "");
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      if (q) {
        if (c === '"') {
          if (s.charAt(i + 1) === '"') { cur += '"'; i++; }
          else q = false;
        } else cur += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(cur); cur = ""; }
      else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
      else if (c !== "\r") cur += c;
    }
    if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (cell) { return String(cell).trim() !== ""; }); });
  }
  function headerKey(h) {
    var t = String(h || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (t === "item" || t === "name" || t === "product" || t.indexOf("product service") === 0 || t === "product service name") return "name";
    if (t === "sku" || t.indexOf("part") === 0) return "sku";
    if (t.indexOf("sales description") === 0 || t === "description") return "description";
    if (t.indexOf("price") >= 0 || t.indexOf("rate") >= 0) return "default_price";
    if (t === "id" || t.indexOf("qbo") >= 0 || t === "item id") return "qbo_item_id";
    if (t === "category" || t === "type") return "category";
    if (t === "unit" || t === "uom") return "unit";
    return "";
  }
  function parseProductCsv(text) {
    var rows = parseCsv(text);
    if (!rows.length) return [];
    var keys = rows[0].map(headerKey);
    return rows.slice(1).map(function (r) {
      var o = { name: "", sku: "", description: "", default_price: null, qbo_item_id: "", category: "", unit: "" };
      keys.forEach(function (k, i) { if (k) o[k] = r[i] == null ? "" : String(r[i]).trim(); });
      if (o.default_price === "") o.default_price = null;
      else if (o.default_price != null && o.default_price !== "") o.default_price = +String(o.default_price).replace(/[$,]/g, "");
      if (!o.name) return null;
      return o;
    }).filter(Boolean);
  }

  return {
    CATEGORIES: CATEGORIES,
    SHEET_HEADERS: SHEET_HEADERS,
    STATUS_HEADERS: STATUS_HEADERS,
    calc: calc,
    totals: totals,
    money: money,
    pct: pct,
    mdy: mdy,
    csv: csv,
    parseProductCsv: parseProductCsv
  };
});
