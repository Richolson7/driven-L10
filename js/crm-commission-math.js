/* Commission rules shared by the page and the tests.
   The database view is the source of truth after the migration is applied. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CRMCommissionMath = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  function tierRate(invoice) {
    if (invoice == null || invoice === "" || !isFinite(+invoice)) return null;
    var n = +invoice;
    if (n < 10000) return 0.05;
    if (n <= 50000) return 0.075;
    return 0.1;
  }
  function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
  function commissionAmount(rate, grossMargin) {
    if (rate == null || grossMargin == null || !isFinite(+rate) || !isFinite(+grossMargin)) return null;
    return round2(+grossMargin * +rate);
  }
  function paymentState(payment) {
    if (payment && payment.paid_in_full_at) {
      return { label: "Paid in full", payable: true, partial: false };
    }
    var paid = payment && payment.amount_paid != null && payment.amount_paid !== "" ? +payment.amount_paid : 0;
    var balance = payment && payment.balance_due != null && payment.balance_due !== "" ? +payment.balance_due : null;
    if (paid > 0 && (balance == null || balance > 0)) {
      return { label: "Partially paid", payable: false, partial: true };
    }
    return { label: "Unpaid", payable: false, partial: false };
  }
  function payStatus(markStatus, payment) {
    if (markStatus === "paid") return "Paid";
    if (paymentState(payment).payable) return "Payable";
    return "Earned, awaiting full payment";
  }
  function canMarkPaid(status) { return status === "Payable"; }
  function nextPayroll(iso) {
    if (!iso) return null;
    var p = String(iso).slice(0, 10).split("-");
    if (p.length < 3) return null;
    var y = +p[0], m = +p[1], d = +p[2];
    var last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    function fmt(yy, mm, dd) {
      return yy + "-" + String(mm).padStart(2, "0") + "-" + String(dd).padStart(2, "0");
    }
    if (d < 15) return fmt(y, m, 15);
    if (d < last) return fmt(y, m, last);
    var ny = m === 12 ? y + 1 : y;
    var nm = m === 12 ? 1 : m + 1;
    return fmt(ny, nm, 15);
  }
  function inSetterWindow(closeDate, firstClose) {
    if (!closeDate || !firstClose) return false;
    if (String(closeDate).slice(0, 10) < String(firstClose).slice(0, 10)) return false;
    var end = addMonths(String(firstClose).slice(0, 10), 6);
    return String(closeDate).slice(0, 10) <= end;
  }
  function addMonths(iso, n) {
    var p = iso.split("-");
    var dt = new Date(Date.UTC(+p[0], +p[1] - 1 + n, +p[2]));
    if (dt.getUTCDate() !== +p[2]) dt = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), 0));
    return dt.toISOString().slice(0, 10);
  }
  function sheetGroup(category) {
    if (category === "Pallets") return "Pallets";
    if (category === "Ridgid") return "Rigid";
    if (["Flexibles", "Stretch Wrap / Film", "Poly Bags / Tubing", "Shrink Products", "Lidding / Laminate Film"].indexOf(category) >= 0) return "Flexible";
    return category || "Other";
  }
  return {
    tierRate: tierRate,
    commissionAmount: commissionAmount,
    paymentState: paymentState,
    payStatus: payStatus,
    canMarkPaid: canMarkPaid,
    nextPayroll: nextPayroll,
    inSetterWindow: inSetterWindow,
    sheetGroup: sheetGroup
  };
});
