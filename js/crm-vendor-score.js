/* Vendor scorecard rules. Latest crm_vendor_scores row is current.
   Utilize: all three 4-5. Watch: any 3 (and none 1-2). Replace: any 1-2. Not rated: no complete row. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.CRMVendorScore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function status(s) {
    if (!s || s.values_fit == null || s.values_fit === "" || s.delivery_speed == null || s.delivery_speed === "" || s.communication == null || s.communication === "") {
      return "Not rated";
    }
    var values = +s.values_fit;
    var speed = +s.delivery_speed;
    var communication = +s.communication;
    if (values <= 2 || speed <= 2 || communication <= 2) return "Replace";
    if (values >= 4 && speed >= 4 && communication >= 4) return "Utilize";
    return "Watch";
  }

  function trend(current, previous) {
    if (current == null || previous == null || current === "" || previous === "") return "";
    if (+current > +previous) return "up";
    if (+current < +previous) return "down";
    return "flat";
  }

  function decision(label) {
    if (label === "Utilize") return "Keep using them. All three scores are 4 or 5.";
    if (label === "Watch") return "Use them only with a backup quote. At least one score is a 3.";
    if (label === "Replace") return "Stop new orders until reviewed. At least one score is 1 or 2.";
    return "Not rated yet. Rate them before the next new order.";
  }

  return { status: status, trend: trend, decision: decision };
});
