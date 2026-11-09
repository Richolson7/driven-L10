/* Commissions. Full view vs own-rep view comes from crm_commission_lines, which the database filters. */
(function () {
  "use strict";
  var C = {
    role: null, rep: null, email: "", lines: [], rates: [], tiers: [], adjustments: [],
    companies: [], ready: false, note: "", repFilter: "", period: "", q: ""
  };
  var M = window.CRMCommissionMath;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function money(n) {
    if (n == null || n === "" || isNaN(+n)) return "—";
    return (+n).toLocaleString("en-US", { style: "currency", currency: "USD" });
  }
  function pct(rate) {
    if (rate == null || rate === "") return "";
    return (Math.round(+rate * 1000) / 10) + "% of gross margin";
  }

  async function load() {
    if (!window.CRMDB) return;
    var email = window.CRMHooks ? CRMHooks.email() : "";
    C.email = email;
    var acc = await CRMDB.db.from("crm_commission_access").select("email,role,rep_name,active").ilike("email", email.replace(/[%_]/g, ""));
    if (acc.error) {
      C.role = null;
      C.note = acc.error.code === "42P01" || /crm_commission_access/.test(acc.error.message || "")
        ? "Commissions are not in the database yet."
        : "";
      syncNav();
      return;
    }
    var mine = (acc.data || []).filter(function (a) { return String(a.email || "").toLowerCase() === String(email).toLowerCase() && a.active !== false; })[0];
    C.role = mine ? mine.role : null;
    C.rep = mine ? mine.rep_name : null;
    syncNav();
    if (!C.role) { C.lines = []; return; }
    var lines = await CRMDB.db.from("crm_commission_lines").select("*");
    C.lines = lines.error ? [] : (lines.data || []);
    C.note = lines.error ? "Commission lines did not load." : "";
    var rates = await CRMDB.db.from("crm_commission_rates").select("*");
    C.rates = rates.error ? [] : (rates.data || []);
    var tiers = await CRMDB.db.from("crm_commission_setter_tiers").select("*").order("sort");
    C.tiers = tiers.error ? [] : (tiers.data || []);
    var adj = await CRMDB.db.from("crm_commission_adjustments").select("*");
    C.adjustments = adj.error ? [] : (adj.data || []);
    if (C.role === "full") {
      var cos = await CRMDB.db.from("crm_companies").select("id,name,kind,booked_by").order("name");
      C.companies = cos.error ? [] : (cos.data || []);
    } else C.companies = [];
    C.ready = !lines.error;
  }

  function syncNav() {
    var tab = document.getElementById("commissionsTab");
    if (tab) tab.hidden = !C.role;
  }

  function shown() {
    return C.lines.filter(function (r) {
      if (C.repFilter && r.rep !== C.repFilter) return false;
      if (C.period && String(r.pay_period || r.close_date || "").slice(0, 7) !== C.period) return false;
      if (C.q) {
        var blob = (r.customer + " " + r.description + " " + r.rep + " " + (r.invoice_number || "")).toLowerCase();
        if (blob.indexOf(C.q.toLowerCase()) < 0) return false;
      }
      return true;
    });
  }

  function how() {
    var rule = "No commission is payable until the customer's invoice for that order is paid in full. A partial payment stays at Earned, awaiting full payment, and does not become Payable. When the invoice is paid in full, every commission on that order becomes Payable and the pay period is the next payroll after that date (the 15th or the last day of the month, whichever comes next). Only a Payable line can be marked Paid. Paid lines stay Paid if the invoice is later unmarked.";
    var h = "<div class='panel' style='padding:14px 16px;margin-bottom:14px'><h2>How this works</h2><p>" + rule + "</p>";
    if (C.role === "full") {
      h += "<p>Landon is a flat 30% of gross margin on orders he owns. Rich is a flat 20% of gross margin on orders he closes or owns. Annie and Patrick are setters: the tier is chosen by the order's invoice amount and the percent applies to that order's gross margin. Under $10,000 is 5%. $10,000 through $50,000 is 7.5%. Over $50,000 is 10%. A setter earns on a customer they booked, for the first order and every repeat within 6 months after that customer's first close. Worked example: a $20,000 order with $5,000 gross margin is 7.5% × $5,000 = $375. Commission is on top of base pay. There is no flat per-meeting fee.</p>";
      h += "<p>The call-volume bonus is turned off, pending Dan's approval. Nothing is calculated and no bonus is shown.</p>";
    } else if (C.rep === "Landon") {
      h += "<p>Your commission is 30% of gross margin on orders you own. It is on top of base pay. There is no per-meeting fee. The call-volume bonus is off and is not shown.</p>";
    } else if (C.rep === "Rich") {
      h += "<p>Your commission is 20% of gross margin on orders you close or own. It is on top of base pay.</p>";
    } else {
      h += "<p>Your setter plan uses the order's invoice amount and pays a percent of that order's gross margin. Under $10,000 is 5%. $10,000 through $50,000 is 7.5%. Over $50,000 is 10%. You earn on customers you booked, for the first close and repeats for 6 months after it. Worked example: a $20,000 order with $5,000 gross margin is 7.5% × $5,000 = $375. This is on top of base pay. There is no per-meeting fee. The call-volume bonus is off and is not shown.</p>";
    }
    return h + "</div>";
  }

  function render() {
    var view = document.getElementById("view");
    if (!view) return;
    syncNav();
    if (!C.role) {
      view.innerHTML = "<div class='sect'><h2>Commissions</h2><p class='banner'>You don't have access to commissions.</p></div>";
      return;
    }
    var rows = shown();
    var reps = [];
    C.lines.forEach(function (r) { if (r.rep && reps.indexOf(r.rep) < 0) reps.push(r.rep); });
    reps.sort();
    var periods = [];
    C.lines.forEach(function (r) {
      var p = String(r.pay_period || r.close_date || "").slice(0, 7);
      if (p && periods.indexOf(p) < 0) periods.push(p);
    });
    periods.sort();
    var h = "<div class='sect'><h2>Commissions</h2>";
    h += "<p class='banner'>No commission is payable until the customer's invoice for that order is paid in full. A partial payment stays at Earned, awaiting full payment. Payable lines are the ones whose invoice is paid in full. Only those can be marked Paid, and the pay period is the next payroll after that date.</p>";
    if (window.CRMSupply) h += CRMSupply.banner();
    if (C.note) h += "<p class='banner'>" + esc(C.note) + "</p>";
    h += how();
    h += "<div class='bar'><input type='search' id='cq' placeholder='Customer, invoice, rep' value='" + esc(C.q) + "'>";
    if (C.role === "full") {
      h += "<select id='crep'><option value=''>All reps</option>" + reps.map(function (r) { return "<option" + (C.repFilter === r ? " selected" : "") + ">" + esc(r) + "</option>"; }).join("") + "</select>";
    }
    h += "<select id='cper'><option value=''>All periods</option>" + periods.map(function (p) { return "<option" + (C.period === p ? " selected" : "") + ">" + esc(p) + "</option>"; }).join("") + "</select>";
    h += "<div class='spacer'></div><button class='ghost' data-act='com-csv'>Export CSV</button></div>";
    var totals = {};
    rows.forEach(function (r) {
      var key = r.rep || "—";
      if (!totals[key]) totals[key] = 0;
      if (r.commission != null) totals[key] += +r.commission;
    });
    h += "<div class='stats'>" + Object.keys(totals).sort().map(function (k) {
      return "<div class='stat'><b>" + money(totals[k]) + "</b><span>" + esc(k) + "</span></div>";
    }).join("") + "</div>";
    var costHead = C.role === "full" ? "<th>Vendor cost</th>" : "";
    h += "<div class='panel tablewrap'><table><thead><tr><th>Rep</th><th>Kind</th><th>Customer</th><th>Invoice</th><th>Sale</th>" + costHead + "<th>Gross margin</th><th>Rate</th><th>Commission</th><th>Status</th><th>Paid in full</th><th>Pay period</th><th></th></tr></thead><tbody>";
    h += rows.length ? rows.map(function (r) {
      var rate = r.plan === "setter_tier" && r.rate != null ? pct(r.rate) : (r.rate != null ? pct(r.rate) : (r.plan === "setter_tier" ? "Rate not set (basis: gross margin)" : ""));
      var btn = C.role === "full" && M.canMarkPaid(r.pay_status)
        ? "<button class='ghost' data-act='com-mark' data-kind='" + esc(r.kind) + "' data-id='" + r.deal_id + "' data-rep='" + esc(r.rep) + "'>Mark paid</button>"
        : "";
      var costCell = C.role === "full" ? "<td>" + money(r.vendor_cost) + "</td>" : "";
      return "<tr><td>" + esc(r.rep || "") + "</td><td>" + esc(r.kind) + "</td><td>" + esc(r.customer || "") + "</td><td>" + esc(r.invoice_number || "") + "</td><td>" + money(r.sale) + "</td>" + costCell + "<td>" + money(r.gross_margin) + "</td><td>" + esc(rate) + "</td><td>" + money(r.commission) + "</td><td>" + esc(r.pay_status) + "</td><td>" + esc(r.paid_in_full_at ? String(r.paid_in_full_at).slice(0, 10) : "") + "</td><td>" + esc(r.pay_period ? String(r.pay_period).slice(0, 10) : "") + "</td><td>" + btn + "</td></tr>";
    }).join("") : "<tr><td colspan='12' class='empty'>No commission rows yet. Won orders appear here after the migration is applied.</td></tr>";
    h += "</tbody></table></div>";
    if (C.role === "full") h += fullExtras();
    view.innerHTML = h + "</div>";
    var q = document.getElementById("cq");
    if (q) q.addEventListener("input", function (e) { C.q = e.target.value; var p = e.target.selectionStart; render(); var n = document.getElementById("cq"); if (n) { n.focus(); if (p != null) n.setSelectionRange(p, p); } });
    var crep = document.getElementById("crep");
    if (crep) crep.addEventListener("change", function () { C.repFilter = crep.value; render(); });
    var cper = document.getElementById("cper");
    if (cper) cper.addEventListener("change", function () { C.period = cper.value; render(); });
  }

  function fullExtras() {
    var h = "<div class='sect'><h2>Booked by</h2><p class='lead'>Setters earn only on customers booked in their name. Only full-view users can change this.</p><div class='panel'>";
    h += C.companies.filter(function (c) { return c.kind !== "vendor"; }).slice(0, 80).map(function (c) {
      return "<div class='cf'><div>" + esc(c.name) + "</div><select data-com='booked' data-id='" + c.id + "'><option value=''>No setter</option>" + ["Annie", "Patrick"].map(function (n) { return "<option" + (c.booked_by === n ? " selected" : "") + ">" + n + "</option>"; }).join("") + "</select></div>";
    }).join("") + "</div></div>";
    h += "<div class='sect'><h2>Rates</h2><div class='panel tablewrap'><table><thead><tr><th>Rep</th><th>Plan</th><th>Rate</th><th>From</th></tr></thead><tbody>";
    h += C.rates.map(function (r) {
      return "<tr><td>" + esc(r.rep) + "</td><td>" + esc(r.plan) + "</td><td>" + (r.rate == null ? "tiers" : pct(r.rate)) + "</td><td>" + esc(r.effective_from) + "</td></tr>";
    }).join("") + "</tbody></table></div>";
    h += "<div class='fields'><div class='f'><label>Rep</label><input id='rateRep'></div><div class='f'><label>Percent of gross margin</label><input id='ratePct' placeholder='20'></div></div><button class='ghost' data-act='com-rate'>Save flat rate</button></div>";
    h += "<div class='sect'><h2>Revenue by category</h2><div id='revCat' class='log'>Loading…</div></div>";
    h += "<div class='sect'><h2>Margin by customer</h2><div id='marCust' class='log'>Loading…</div></div>";
    h += "<div class='sect'><h2>Products by customer</h2><div id='marProd' class='log'>Loading…</div></div>";
    if (window.CRMSupply) h += CRMSupply.queueHtml();
    setTimeout(loadRollups, 0);
    return h;
  }

  async function loadRollups() {
    var cat = await CRMDB.db.from("crm_revenue_by_category").select("*");
    var cust = await CRMDB.db.from("crm_margin_by_customer").select("*");
    var prod = await CRMDB.db.from("crm_margin_by_product").select("*").limit(80);
    var a = document.getElementById("revCat");
    var b = document.getElementById("marCust");
    var c = document.getElementById("marProd");
    if (!a) return;
    function table(cols, rows) {
      if (!rows || !rows.length) return "<p class='log'>No rows.</p>";
      return "<div class='panel tablewrap'><table><thead><tr>" + cols.map(function (col) { return "<th>" + esc(col[0]) + "</th>"; }).join("") + "</tr></thead><tbody>" + rows.map(function (r) {
        return "<tr>" + cols.map(function (col) { return "<td>" + esc(col[1](r)) + "</td>"; }).join("") + "</tr>";
      }).join("") + "</tbody></table></div>";
    }
    a.innerHTML = table([["Group", function (r) { return r.sheet_group; }], ["Category", function (r) { return r.category; }], ["Revenue", function (r) { return money(r.revenue); }], ["Gross profit", function (r) { return money(r.gross_profit); }]], cat.data || []);
    b.innerHTML = table([["Customer", function (r) { return r.customer; }], ["Products", function (r) { return r.products; }], ["Revenue", function (r) { return money(r.revenue); }], ["Gross profit", function (r) { return money(r.gross_profit); }], ["Min margin", function (r) { return r.min_margin == null ? "" : Math.round(r.min_margin * 1000) / 10 + "%"; }], ["Max margin", function (r) { return r.max_margin == null ? "" : Math.round(r.max_margin * 1000) / 10 + "%"; }]], cust.data || []);
    c.innerHTML = table([["Product", function (r) { return r.product; }], ["Customer", function (r) { return r.customer; }], ["Vendor", function (r) { return r.vendor; }], ["Sell price", function (r) { return r.sell_price == null ? "" : r.sell_price; }], ["Margin", function (r) { return r.margin == null ? "" : Math.round(r.margin * 1000) / 10 + "%"; }], ["Sales rep", function (r) { return r.sales_rep; }]], prod.data || []);
  }

  function csv() {
    var rows = shown();
    var head = ["Rep", "Kind", "Customer", "Invoice", "Sale", "Gross margin", "Rate", "Commission", "Status", "Paid in full", "Pay period"];
    if (C.role === "full") head.splice(5, 0, "Vendor cost");
    var lines = [head.join(",")];
    rows.forEach(function (r) {
      var cells = [r.rep, r.kind, r.customer, r.invoice_number, r.sale, r.gross_margin, r.rate, r.commission, r.pay_status, r.paid_in_full_at, r.pay_period];
      if (C.role === "full") cells.splice(5, 0, r.vendor_cost);
      lines.push(cells.map(function (v) {
        var s = v == null ? "" : String(v);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(","));
    });
    var blob = new Blob([lines.join("\n")], { type: "text/csv" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "commissions.csv";
    a.click();
  }

  async function mark(kind, dealId, rep) {
    var saved = await CRMDB.insert("crm_commission_marks", {
      kind: kind, deal_id: +dealId, rep: rep, status: "paid", paid_on: new Date().toISOString().slice(0, 10), marked_by: CRMHooks.email()
    }, "commission");
    if (!saved) return;
    await load();
    render();
  }

  async function onChange(el) {
    if (el.dataset.com !== "booked" || C.role !== "full") return;
    var saved = await CRMDB.update("crm_companies", +el.dataset.id, { booked_by: el.value || null }, "booked by");
    if (!saved) return;
    var co = C.companies.filter(function (c) { return String(c.id) === el.dataset.id; })[0];
    if (co) co.booked_by = el.value || null;
    await load();
    render();
  }

  window.CRMCommissions = {
    load: load,
    render: render,
    syncNav: syncNav,
    role: function () { return C.role; },
    onChange: onChange,
    handle: async function (a) {
      if (a.dataset.act === "com-csv") { csv(); return; }
      if (a.dataset.act === "com-mark") { await mark(a.dataset.kind, a.dataset.id, a.dataset.rep); return; }
      if (a.dataset.act === "com-paid-toggle") {
        var dateEl = document.getElementById("pifDate");
        var amtEl = document.getElementById("pifAmt");
        await CRMSupply.markPaidInFull(a.dataset.id, a.checked, dateEl && dateEl.value, amtEl && amtEl.value);
        if (window.CRMHooks) CRMHooks.render();
        return;
      }
      if (a.dataset.act === "com-rate") {
        var rep = document.getElementById("rateRep").value.trim();
        var pct = +document.getElementById("ratePct").value;
        if (!rep || !isFinite(pct)) { CRMHooks.toast("Enter a rep and a percent."); return; }
        var saved = await CRMDB.insert("crm_commission_rates", {
          rep: rep, plan: "flat", basis: "gross_margin", rate: pct / 100, effective_from: "2000-01-01"
        }, "commission rate");
        if (!saved) return;
        await load();
        render();
      }
    }
  };
})();
