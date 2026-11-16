/* Deal product lines. One deal can have several products.
   Line sell = quantity × unit sell. Line cost = quantity × unit cost.
   Line margin is those two amounts. Freight is added once on the deal:
   the deal's freight when that field is set, otherwise the sum of any
   freight typed on the lines. A blank unit cost stays blank. It is not
   treated as $0, and it is not written over a cost already stored.
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
  function hasValue(v) {
    return v != null && v !== "";
  }
  function lineFigures(line) {
    var qty = num(line && line.qty);
    var sell = num(line && line.price);
    var cost = num(line && line.cost);
    if (qty == null) return { sell: null, cost: null, margin: null, marginPct: null };
    var costQty = line && line.cost_qty != null && line.cost_qty !== "" ? num(line.cost_qty) : qty;
    if (costQty == null) costQty = qty;
    var sellTotal = round2(qty * (sell == null ? 0 : sell));
    var costTotal = cost == null ? null : round2(costQty * cost);
    var margin = costTotal == null ? null : round2(sellTotal - costTotal);
    return {
      sell: sellTotal,
      cost: costTotal,
      margin: margin,
      marginPct: sellTotal && margin != null ? margin / sellTotal : null
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
    var anyCost = false;
    (lines || []).forEach(function (l) {
      var fig = lineFigures(l);
      if (fig.sell != null) value += fig.sell;
      if (fig.cost != null) { anyCost = true; cost += fig.cost; }
    });
    var freight = freightAmount(lines, dealFreight);
    var freightKnown = num(dealFreight) != null || (lines || []).some(function (l) { return num(l && l.freight) != null; });
    value = round2(value);
    if (!anyCost && !freightKnown) {
      return { value: value, cost: null, freight: freight, grossMargin: null, marginPct: null };
    }
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
  /* Copy a deal header onto line 0 only when the header actually has a
     value. A blank header must not erase a cost or vendor on the line. */
  function copyHeaderWhenSet(line, deal) {
    if (!line || !deal) return line;
    if (hasValue(deal.price_per_unit)) line.price = deal.price_per_unit;
    if (hasValue(deal.quantity)) line.qty = deal.quantity;
    if (hasValue(deal.vendor_id)) line.vendor_id = deal.vendor_id;
    if (hasValue(deal.vendor_price_per_unit)) line.cost = deal.vendor_price_per_unit;
    return line;
  }
  /* A line loaded from the table can have a blank cost or vendor because
     that column was cleared. Keep the quote backup when it still has one. */
  function mergeStored(line, backup) {
    var out = {};
    var src = line || {};
    Object.keys(src).forEach(function (k) { out[k] = src[k]; });
    if (!backup) return out;
    if (!hasValue(out.cost) && hasValue(backup.cost)) out.cost = backup.cost;
    if (!hasValue(out.vendor_id) && hasValue(backup.vendor_id)) out.vendor_id = backup.vendor_id;
    if (!hasValue(out.source_deal_id) && hasValue(backup.source_deal_id)) out.source_deal_id = backup.source_deal_id;
    return out;
  }
  /* Columns to write on a line. A blank is omitted so an update does not
     store null or 0 over a cost or vendor already in the database. */
  function lineMoneyColumns(line, dealVendorId) {
    var row = {};
    if (line && hasValue(line.cost)) row.vendor_price = line.cost;
    var vendor = line && hasValue(line.vendor_id) ? line.vendor_id : (hasValue(dealVendorId) ? dealVendorId : null);
    if (hasValue(vendor)) row.vendor_id = vendor;
    return row;
  }
  /* A blank edit keeps the value already on the line. A typed number replaces it. */
  function keepIfSet(next, current) {
    if (!hasValue(next) && hasValue(current)) return current;
    return next === "" ? null : next;
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
    customerLines: customerLines,
    hasValue: hasValue,
    copyHeaderWhenSet: copyHeaderWhenSet,
    mergeStored: mergeStored,
    lineMoneyColumns: lineMoneyColumns,
    keepIfSet: keepIfSet
  };
});
