/* Order payment chip, vendor PO links, who-buys, and the QuickBooks unmatched queue.
   Cost columns are not read from the PO tables unless the signed-in person is full-view. */
(function () {
  "use strict";
  var S = { payments: [], pos: [], bills: [], unmatched: [], sync: null, served: [], posOpen: [], note: "" };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function full() {
    return window.CRMCommissions && CRMCommissions.role() === "full";
  }
  function payFor(dealId) {
    return S.payments.filter(function (p) { return String(p.deal_id) === String(dealId); })[0] || null;
  }
  function chip(dealId) {
    var st = CRMCommissionMath.paymentState(payFor(dealId));
    var p = payFor(dealId);
    var cls = st.label === "Paid in full" ? "active" : st.partial ? "warn" : "";
    var src = p && p.payment_source ? " · " + p.payment_source : "";
    var when = p && p.paid_in_full_at ? " " + String(p.paid_in_full_at).slice(0, 10) : "";
    return "<span class='chip " + cls + "'>" + esc(st.label + when + src) + "</span>";
  }
  function posFor(dealId) {
    return S.posOpen.filter(function (p) { return String(p.deal_id) === String(dealId); });
  }

  async function load() {
    if (!window.CRMDB) return;
    var pay = await CRMDB.db.from("crm_order_payments").select("*");
    S.payments = pay.error ? [] : (pay.data || []);
    var sync = await CRMDB.db.from("crm_qb_sync_state").select("*").eq("id", 1).maybeSingle();
    S.sync = sync.error ? null : sync.data;
    var open = await CRMDB.db.from("crm_vendor_pos_open").select("*");
    S.posOpen = open.error ? [] : (open.data || []);
    var served = await CRMDB.db.from("crm_customers_served").select("*");
    S.served = served.error ? [] : (served.data || []);
    S.note = pay.error ? "Invoice payment is not in the database yet. Apply the commissions migration." : "";
    if (full()) {
      var po = await CRMDB.db.from("crm_vendor_pos").select("id,po_number,vendor_id,po_date,status,total,deal_id,ship_to,source,last_synced_at,promised_on,received_on");
      if (po.error) po = await CRMDB.db.from("crm_vendor_pos").select("id,po_number,vendor_id,po_date,status,total,deal_id,ship_to,source,last_synced_at");
      S.pos = po.error ? [] : (po.data || []);
      var bills = await CRMDB.db.from("crm_vendor_bills").select("*");
      S.bills = bills.error ? [] : (bills.data || []);
      var un = await CRMDB.db.from("crm_qb_unmatched").select("*").is("resolved_at", null).order("created_at");
      S.unmatched = un.error ? [] : (un.data || []);
    } else {
      S.pos = [];
      S.bills = [];
      S.unmatched = [];
    }
  }

  function banner() {
    var when = S.sync && S.sync.last_synced_at ? " Last synced " + String(S.sync.last_synced_at).replace("T", " ").slice(0, 16) + "." : " No sync has run.";
    return "<p class='banner'>QuickBooks sync: not connected." + esc(when) + "</p>";
  }

  function dealBlock(deal) {
    var id = deal.id;
    var pos = posFor(id);
    var h = "<fieldset><legend>Invoice payment</legend>";
    h += "<p>" + chip(id) + "</p>";
    if (full()) {
      var p = payFor(id) || {};
      h += "<div class='fields'><div class='f'><label>Paid in full date</label><input type='date' id='pifDate' value='" + esc(p.paid_in_full_at ? String(p.paid_in_full_at).slice(0, 10) : "") + "'></div>";
      h += "<div class='f'><label>Amount paid</label><input id='pifAmt' inputmode='decimal' value='" + esc(p.amount_paid == null ? "" : p.amount_paid) + "'></div></div>";
      h += "<label class='switch'><input type='checkbox' data-act='com-paid-toggle' data-id='" + id + "'" + (p.paid_in_full_at ? " checked" : "") + "> Mark invoice paid in full</label>";
      h += "<p class='log'>Checking this sets the order to Payable for every rep on it. Clearing it sends those lines back to Earned unless that commission was already marked Paid.</p>";
    }
    h += "</fieldset>";
    h += "<fieldset><legend>Vendor POs</legend>";
    if (!pos.length) h += "<p class='log'>No vendor PO linked yet.</p>";
    else h += "<ul class='mini'>" + pos.map(function (p) {
      return "<li><b>" + esc(p.po_number || "PO") + "</b> · " + esc(p.vendor_name || "") + " · " + esc(p.status || "") + (p.po_date ? " · " + esc(String(p.po_date).slice(0, 10)) : "") + "</li>";
    }).join("") + "</ul>";
    if (full()) h += "<p class='log'>PO cost is on the Vendors purchase-order tab. This list is the PO number only.</p>";
    h += "</fieldset>";
    return h;
  }

  function whoHtml(q, category) {
    q = (q || "").toLowerCase();
    var rows = S.served.filter(function (r) {
      if (category && r.category !== category) return false;
      var blob = (r.vendor_name + " " + r.customer_name + " " + (r.category || "") + " " + (r.location || "")).toLowerCase();
      return !q || blob.indexOf(q) >= 0;
    });
    var h = "<div class='panel tablewrap'><table><thead><tr><th>Vendor</th><th>Customer</th><th>Category</th><th>Location</th><th>Last buy</th><th>From</th></tr></thead><tbody>";
    h += rows.length ? rows.map(function (r) {
      return "<tr><td>" + esc(r.vendor_name) + "</td><td>" + esc(r.customer_name) + "</td><td>" + esc(r.category || "") + "</td><td>" + esc(r.location || "") + "</td><td>" + esc(r.last_buy ? String(r.last_buy).slice(0, 10) : "") + "</td><td>" + esc(r.link_source) + "</td></tr>";
    }).join("") : "<tr><td colspan='6' class='empty'>No customer links yet.</td></tr>";
    return h + "</tbody></table></div>";
  }

  function queueHtml() {
    if (!full()) return "";
    var h = "<div class='sect'><h2>QuickBooks review</h2><p class='lead'>Records the sync could not match. Nothing here calls QuickBooks.</p>";
    if (!S.unmatched.length) h += "<p class='log'>No unmatched records.</p></div>";
    else {
      h += "<div class='panel'>" + S.unmatched.map(function (u) {
        return "<div class='cf'><div><b>" + esc(u.entity) + "</b> " + esc(u.name || u.external_number || u.qb_id || "") + "<div class='log'>" + esc(u.reason) + "</div></div><button class='ghost' data-act='sup-resolve' data-id='" + u.id + "'>Resolve</button></div>";
      }).join("") + "</div></div>";
    }
    return h;
  }

  async function markPaidInFull(dealId, on, date, amount) {
    if (!full()) return;
    var existing = payFor(dealId);
    var row;
    if (on) {
      row = {
        deal_id: +dealId,
        paid_in_full_at: date || new Date().toISOString().slice(0, 10),
        payment_source: "manual",
        amount_paid: amount === "" || amount == null ? null : +amount,
        balance_due: 0,
        updated_at: new Date().toISOString()
      };
    } else {
      row = {
        deal_id: +dealId,
        paid_in_full_at: null,
        payment_source: "manual",
        amount_paid: 0,
        balance_due: null,
        updated_at: new Date().toISOString()
      };
    }
    var saved = existing
      ? await CRMDB.update("crm_order_payments", existing.id, row, "invoice payment")
      : await CRMDB.insert("crm_order_payments", row, "invoice payment");
    if (!saved) return;
    await load();
  }

  async function resolve(id) {
    var u = S.unmatched.filter(function (x) { return String(x.id) === String(id); })[0];
    if (!u || !window.CRMHooks) return;
    var vendors = window.CRMVendors && CRMVendors.rows ? CRMVendors.rows() : [];
    if (!vendors.length) {
      var listed = await CRMDB.db.from("crm_vendors_visible").select("id,supplier").order("supplier");
      if (listed.error) listed = await CRMDB.db.from("crm_vendors").select("id,supplier").order("supplier");
      vendors = listed.error ? [] : (listed.data || []);
    }
    var companies = CRMHooks.companies();
    CRMHooks.openModal("<h2>Resolve " + esc(u.entity) + "</h2><p>" + esc(u.reason) + "</p><div class='f'><label>Link vendor</label><select id='unVen'><option value=''>Choose…</option>" + vendors.map(function (v) { return "<option value='" + v.id + "'>" + esc(v.supplier) + "</option>"; }).join("") + "</select></div><div class='f'><label>Link customer</label><select id='unCo'><option value=''>Choose…</option>" + companies.filter(function (c) { return c.kind !== "vendor"; }).map(function (c) { return "<option value='" + c.id + "'>" + esc(c.name) + "</option>"; }).join("") + "</select></div><div class='f'><label>Link order id</label><input id='unDeal' inputmode='numeric'></div><div class='mactions'><button class='ghost' data-act='mclose'>Cancel</button><button class='primary' data-act='sup-resolve-ok' data-id='" + u.id + "'>Save link</button></div>");
  }

  async function resolveOk(id) {
    var patch = {
      linked_vendor_id: $("#unVen") && $("#unVen").value ? +$("#unVen").value : null,
      linked_company_id: $("#unCo") && $("#unCo").value ? +$("#unCo").value : null,
      linked_deal_id: $("#unDeal") && $("#unDeal").value ? +$("#unDeal").value : null,
      resolved_at: new Date().toISOString(),
      resolved_by: window.CRMHooks ? CRMHooks.email() : ""
    };
    var saved = await CRMDB.update("crm_qb_unmatched", +id, patch, "unmatched record");
    if (!saved) return;
    if (window.CRMHooks) CRMHooks.closeModal();
    await load();
    if (window.CRMHooks) CRMHooks.render();
  }

  function $(s) { return document.querySelector(s); }

  window.CRMSupply = {
    load: load,
    chip: chip,
    banner: banner,
    dealBlock: dealBlock,
    whoHtml: whoHtml,
    queueHtml: queueHtml,
    note: function () { return S.note; },
    posForVendor: function (vendorId) {
      return S.pos.filter(function (p) { return String(p.vendor_id) === String(vendorId); });
    },
    servedFor: function (vendorId) {
      return S.served.filter(function (r) { return String(r.vendor_id) === String(vendorId); });
    },
    markPaidInFull: markPaidInFull,
    payFor: payFor,
    handle: async function (a) {
      if (a.dataset.act === "sup-resolve") { resolve(a.dataset.id); return; }
      if (a.dataset.act === "sup-resolve-ok") { await resolveOk(a.dataset.id); return; }
    }
  };
})();
