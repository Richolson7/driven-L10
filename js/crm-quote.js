/* Customer-facing quote layout, PDF download, and quote → deal field map.
   Landon: edit the printed quote here. Do not add vendor cost or margin
   to docHtml or download. Those stay on the deal and in the editor only.
   Nothing in this file sends email. */
(function () {
  "use strict";

  var TERMS = "Pricing valid for 30 days from the quote date. Lead time and ship date are confirmed when we receive your PO. Terms: Net 30. A 1.5% late fee applies to invoices more than 14 days past the Net 30 due date. ACH preferred; please include our invoice number on every payment.";
  var UNITS = ["each", "case", "roll", "pallet", "box", "bundle", "lb"];

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function money(v) {
    var n = +v;
    if (v == null || v === "" || isNaN(n)) return "";
    return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
  }
  function qtyText(v) {
    var n = +v;
    if (v == null || v === "" || isNaN(n)) return "";
    return n.toLocaleString("en-US");
  }
  function lineTotal(l) {
    if (l.price == null || l.price === "" || l.qty == null || l.qty === "") return 0;
    return (+l.qty || 0) * (+l.price || 0);
  }
  function total(lines) {
    return (lines || []).reduce(function (a, l) { return a + lineTotal(l); }, 0);
  }
  function describe(quote) {
    var lines = (quote && quote.lines) || [];
    var desc = (lines[0] && lines[0].desc) || "";
    if (lines.length > 1 && desc) return desc + " + " + (lines.length - 1) + " more";
    return desc;
  }
  function addDays(s, n) {
    var x = new Date(String(s).slice(0, 10) + "T00:00:00");
    x.setDate(x.getDate() + n);
    return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0");
  }
  function longDate(s) {
    if (!s) return "";
    return new Date(String(s).slice(0, 10) + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  }

  /* Which crm_deals columns this one quote edit should write.
     Line 0 is the opportunity's price, quantity, and vendor.
     Extra lines only change the description summary. */
  function dealPatch(quote, change) {
    var patch = {};
    if (!change) return patch;
    if (change.part === "head") {
      if (change.key === "company_id") patch.company_id = change.value;
      else if (change.key === "ship_to_id") patch.ship_to_id = change.value;
      else if (change.key === "rep") patch.sales_rep = change.value || "";
      else if (change.key === "sent_date") patch.quote_sent_date = change.value || null;
      else if (change.key === "freight") patch.freight = change.value;
      else if (change.key === "po") patch.customer_po_number = change.value || "";
      return patch;
    }
    if (change.key === "desc" || change.key === "add" || change.key === "remove") patch.description = describe(quote) || "";
    if (change.index === 0 && change.key === "price") patch.price_per_unit = change.value;
    if (change.index === 0 && change.key === "qty") {
      patch.quantity = change.value;
      patch.vendor_quantity = change.value;
    }
    if (change.index === 0 && change.key === "vendor_id") patch.vendor_id = change.value;
    if (change.index === 0 && change.key === "cost") patch.vendor_price_per_unit = change.value;
    if (change.index === 0 && change.key === "freight") patch.freight = change.value;
    if (change.index === 0 && (change.key === "rep" || change.key === "sales_rep")) patch.sales_rep = change.value || "";
    if (change.index === 0 && change.key === "product_id") {
      patch.description = describe(quote) || "";
      patch.price_per_unit = quote.lines[0].price;
    }
    return patch;
  }

  function docHtml(m) {
    var lines = m.lines || [];
    var rows = lines.map(function (l) {
      return "<tr><td>" + esc(l.desc || "") + "</td><td class='r'>" + esc(qtyText(l.qty)) + "</td><td>" + esc(l.unit || "") + "</td><td class='r'>" + esc(money(l.price)) + "</td><td class='r'>" + esc(money(lineTotal(l))) + "</td></tr>";
    }).join("");
    var valid = m.date ? longDate(addDays(m.date, +m.valid || 30)) : "";
    return '<div class="qdoc"><div class="qd-head"><div class="qd-brand"><div><div class="qd-name">Driven Solutions</div><div class="qd-web">265 Mound View Rd, Ste 2, River Falls, WI 54022<br>612-394-2973 · www.drivensol.com</div></div></div><div><div class="qd-title">Quote</div><table class="qd-meta"><tr><td>Quote #</td><td>' + esc(m.number || "") + "</td></tr><tr><td>Date</td><td>" + esc(longDate(m.date)) + "</td></tr><tr><td>Valid until</td><td>" + esc(valid) + "</td></tr></table></div></div>" +
      '<div class="qd-body"><div class="qd-parties"><div><h4>Prepared for</h4><b>' + esc(m.companyName || "") + "</b>" + (m.contactName ? "<br>Attn: " + esc(m.contactName) : "") + (m.contactEmail ? "<br>" + esc(m.contactEmail) : "") + (m.contactPhone ? "<br>" + esc(m.contactPhone) : "") + "</div><div><h4>Ship to</h4>" + esc(m.ship || m.billing || "") + "</div><div><h4>Your Driven contact</h4><b>" + esc(m.repName || "") + "</b>" + (m.repEmail ? "<br>" + esc(m.repEmail) : "") + "</div></div>" +
      '<table class="qd-items"><thead><tr><th>Item</th><th class="r">Qty</th><th>Unit</th><th class="r">Unit price</th><th class="r">Total</th></tr></thead><tbody>' + rows +
      '<tr class="qd-total"><td colspan="3"></td><td class="r">Total</td><td class="r">' + esc(money(total(lines))) + "</td></tr></tbody></table>" +
      '<div class="qd-terms">' + esc(m.terms || TERMS).replace(/\n/g, "<br>") + "</div><p class=\"qd-terms\">To order, email your PO to orders@drivensol.com and include quote number " + esc(m.number || "") + ".</p>" +
      '<div class="qd-accept"><div>Accepted by</div><div>PO #</div><div>Date</div></div></div></div>';
  }

  function download(m) {
    var lib = window.jspdf;
    if (!lib || !lib.jsPDF) return { ok: false, message: "Could not build the PDF. The PDF library did not load. Use Print and choose Save as PDF." };
    var doc = new lib.jsPDF({ unit: "pt", format: "letter" });
    var pageW = doc.internal.pageSize.getWidth();
    var pageH = doc.internal.pageSize.getHeight();
    var y = 0;
    function need(h) {
      if (y + h <= pageH - 48) return;
      doc.addPage();
      y = 48;
    }
    doc.setFillColor(58, 58, 60);
    doc.rect(0, 0, pageW, 96, "F");
    doc.setTextColor(135, 252, 96);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text("Driven Solutions", 40, 42);
    doc.setFontSize(26);
    doc.text("Quote", pageW - 40, 42, { align: "right" });
    doc.setTextColor(220, 220, 220);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("265 Mound View Rd, Ste 2, River Falls, WI 54022", 40, 62);
    doc.text("612-394-2973  ·  www.drivensol.com", 40, 76);
    doc.text("Quote # " + (m.number || ""), pageW - 40, 64, { align: "right" });
    doc.text(m.date ? longDate(m.date) : "", pageW - 40, 78, { align: "right" });
    y = 122;
    doc.setTextColor(43, 43, 45);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Prepared for", 40, y);
    doc.text("Ship to", 230, y);
    doc.text("Your Driven contact", 420, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    var left = doc.splitTextToSize([m.companyName || "", m.contactName ? "Attn: " + m.contactName : "", m.contactEmail || "", m.contactPhone || ""].filter(Boolean).join("\n"), 170);
    var mid = doc.splitTextToSize(m.ship || m.billing || "", 170);
    var right = doc.splitTextToSize([m.repName || "", m.repEmail || ""].filter(Boolean).join("\n"), 150);
    doc.text(left, 40, y + 16);
    doc.text(mid, 230, y + 16);
    doc.text(right, 420, y + 16);
    y += 16 + Math.max(left.length, mid.length, right.length, 1) * 13 + 18;
    if (m.date) {
      doc.setFontSize(10);
      doc.text("Valid until " + longDate(addDays(m.date, +m.valid || 30)), 40, y);
      y += 18;
    }
    need(28);
    doc.setFillColor(58, 58, 60);
    doc.rect(40, y, pageW - 80, 20, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Item", 48, y + 13);
    doc.text("Qty", 330, y + 13, { align: "right" });
    doc.text("Unit", 380, y + 13);
    doc.text("Unit price", 470, y + 13, { align: "right" });
    doc.text("Total", pageW - 48, y + 13, { align: "right" });
    y += 32;
    doc.setTextColor(43, 43, 45);
    doc.setFont("helvetica", "normal");
    (m.lines || []).forEach(function (l) {
      var wrapped = doc.splitTextToSize(l.desc || "Item", 250);
      need(wrapped.length * 13 + 8);
      doc.text(wrapped, 48, y);
      doc.text(qtyText(l.qty), 330, y, { align: "right" });
      doc.text(l.unit || "", 380, y);
      doc.text(money(l.price), 470, y, { align: "right" });
      doc.text(money(lineTotal(l)), pageW - 48, y, { align: "right" });
      y += wrapped.length * 13 + 8;
    });
    need(28);
    doc.setFont("helvetica", "bold");
    doc.text("Total", 470, y, { align: "right" });
    doc.text(money(total(m.lines)), pageW - 48, y, { align: "right" });
    y += 28;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    var terms = doc.splitTextToSize(m.terms || TERMS, pageW - 80);
    need(terms.length * 12 + 24);
    doc.text(terms, 40, y);
    y += terms.length * 12 + 14;
    var order = doc.splitTextToSize("To order, email your PO to orders@drivensol.com and include quote number " + (m.number || "") + ".", pageW - 80);
    need(order.length * 12);
    doc.text(order, 40, y);
    var safe = String(m.number || "quote").replace(/[^\w.-]+/g, "-");
    doc.save("Driven-Solutions-Quote-" + safe + ".pdf");
    return { ok: true };
  }

  window.CRMQuote = {
    TERMS: TERMS,
    UNITS: UNITS,
    total: total,
    describe: describe,
    dealPatch: dealPatch,
    docHtml: docHtml,
    download: download
  };
})();
