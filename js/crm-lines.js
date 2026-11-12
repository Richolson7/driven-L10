/* Deal product lines. One deal can have several products.
   Line sell = quantity × unit sell. Line cost = quantity × unit cost.
   Line margin is those two amounts. Freight is added once on the deal:
   the deal's freight when that field is set, otherwise the sum of any
   freight typed on the lines. A blank unit cost counts as 0 so an older
   one-product deal displays the same total it did before.
   Customer quotes use customerLines() and never receive cost or margin.
   This file does not talk to the database. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.CRMLines = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  function num(v) {
    if (v == null || v === "") return null;
    var n = +v;
    return isNaN(n) ? null : n;
  }
  function round2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }
  function lineFigures(line) {
    var qty = num(line && line.qty);
    var sell = num(line && line.price);
    var cost = num(line && line.cost);
    if (qty == null) return { sell: null, cost: null, margin: null, marginPct: null };
    var costQty = line && line.cost_qty != null && line.cost_qty !== "" ? num(line.cost_qty) : qty;
    if (costQty == null) costQty = qty;
    var sellTotal = round2(qty * (sell == null ? 0 : sell));
    var costTotal = round2(costQty * (cost == null ? 0 : cost));
    var margin = round2(sellTotal - costTotal);
    return {
      sell: sellTotal,
      cost: costTotal,
      margin: margin,
      marginPct: sellTotal ? margin / sellTotal : null
    };
  }
  function freightAmount(lines, dealFreight) {
    var deal = num(dealFreight);
    if (deal != null) return deal;
    var sum = 0;
    var any = false;
    (lines || []).forEach(function (l) {
      var f = num(l && l.freight);
      if (f != null) { any = true; sum += f; }
    });
    return any ? sum : 0;
  }
  function dealTotals(lines, dealFreight) {
    var value = 0;
    var cost = 0;
    (lines || []).forEach(function (l) {
      var fig = lineFigures(l);
      if (fig.sell != null) value += fig.sell;
      if (fig.cost != null) cost += fig.cost;
    });
    var freight = freightAmount(lines, dealFreight);
    value = round2(value);
    cost = round2(cost + freight);
    var grossMargin = round2(value - cost);
    return {
      value: value,
      cost: cost,
      freight: freight,
      grossMargin: grossMargin,
      marginPct: value ? grossMargin / value : null
    };
  }
  function headerLine(deal) {
    var d = deal || {};
    var vendorQty = d.vendor_quantity != null && d.vendor_quantity !== "" ? d.vendor_quantity : d.quantity;
    return {
      desc: d.description && d.description !== "New quote" ? d.description : "",
      qty: d.quantity,
      cost_qty: vendorQty,
      unit: "each",
      price: d.price_per_unit,
      cost: d.vendor_price_per_unit,
      freight: null,
      vendor_id: d.vendor_id,
      product_id: null,
      qb_item_id: null,
      category: "",
      invoice_number: "",
      sales_rep: d.sales_rep || ""
    };
  }
  function linesOf(deal) {
    var q = deal && deal.quote;
    if (q && q.lines && q.lines.length) return q.lines;
    return [headerLine(deal || {})];
  }
  function customerLines(lines) {
    return (lines || []).map(function (l) {
      return {
        desc: l.desc || l.name || "",
        qty: l.qty,
        unit: l.unit || "",
        price: l.price
      };
    });
  }
  return {
    num: num,
    round2: round2,
    lineFigures: lineFigures,
    freightAmount: freightAmount,
    dealTotals: dealTotals,
    headerLine: headerLine,
    linesOf: linesOf,
    customerLines: customerLines
  };
});
