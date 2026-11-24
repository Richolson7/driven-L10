/* Whether a deal or its quote may be deleted.
   This file does not talk to the database. The screen checks the
   live rows, then asks here. Shipped and everything after it stays.
   A QuickBooks link, an invoice, a payment, or an uninvoiced flag stays. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.CRMDelete = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  var LATE_KEYS = { shipped: true, delivered: true, invoice_sent: true, paid: true };

  function filled(v) {
    return v != null && String(v).trim() !== "";
  }

  function isLateStage(stage, stages) {
    if (!stage) return false;
    if (LATE_KEYS[stage]) return true;
    if (!stages || !stages.length) return false;
    var shipPos = null;
    var mine = null;
    stages.forEach(function (s) {
      if (!s) return;
      if (s.key === "shipped") shipPos = s.position;
      if (s.key === stage) mine = s.position;
    });
    if (shipPos == null || mine == null) return false;
    return +mine >= +shipPos;
  }

  function qboLinked(row) {
    if (!row) return false;
    return filled(row.qbo_doc_id) || filled(row.qbo_doc_type) || filled(row.qbo_customer_id) || filled(row.qbo_synced_at);
  }

  function reasons(input) {
    input = input || {};
    var why = [];
    if (isLateStage(input.stage, input.stages)) {
      why.push("It is in " + (input.stageName || input.stage) + ". Shipped, delivered, invoiced, and paid deals stay.");
    }
    if (qboLinked(input.qbo)) {
      var doc = input.qbo && filled(input.qbo.qbo_doc_id) ? " (" + String(input.qbo.qbo_doc_id).trim() + ")" : "";
      why.push("It is linked to QuickBooks" + doc + ".");
    }
    if (input.invoiceCount) why.push("It has a QuickBooks invoice.");
    if (input.paymentCount) why.push("It has a payment recorded.");
    if (input.flagCount) why.push("It is on the uninvoiced list. That link would block the delete.");
    if (input.lineInvoiceCount) why.push("A product line is linked to a QuickBooks invoice.");
    return why;
  }

  return {
    filled: filled,
    isLateStage: isLateStage,
    qboLinked: qboLinked,
    reasons: reasons
  };
});
