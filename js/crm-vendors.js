/* Driven Vendor Portal. Runs on vendors.html beside the CRM.
   Loaded with js/vendors-shell.js. The CRM files are not the vendor screen.

   The vendor record is the CRM company (crm_companies kind = 'vendor'), same as orders use.
   Contacts, activity and follow-ups live in crm_contacts, crm_activity and crm_tasks, same as customers,
   so vendor follow-ups also show on the Follow-ups tab.
   Supplier-map rows (crm_vendors) are the vendor's profile: category, specs, MOQ, lead time, terms, QB id,
   scorecard and products. They link through crm_vendors.company_id. Prospects not in the CRM yet are
   supplier rows with no company; moving one to Approved or Buying from adds it to the CRM.

   Needs 20261110120000_vendor_portal.sql (views, product lines, cost gate).
   Costs, prices, terms, and margins show only for commission role full (owner/admin).
   Setters are role own and must not see them. POs and bills show for full only.
   Scores are append-only: each rating is a new crm_vendor_scores row. */
(function () {
  "use strict";

  var STAGES = [
    ["prospect", "Prospect", "sourcing"], ["vetting", "Vetting / RFQ", "sourcing"],
    ["approved", "Approved", "buying"], ["active", "Buying from", "buying"],
    ["dormant", "Dormant", "off"], ["do_not_use", "Do not use", "off"]
  ];
  var RANK = { active: 6, approved: 5, vetting: 4, prospect: 3, dormant: 2, do_not_use: 1 };
  var CRM_CATS = ["Stretch Wrap / Film", "Pallets", "Poly Bags / Tubing", "Shrink Products", "Gaylords / Totes", "Tape", "Corner Boards", "Lidding / Laminate Film", "Flexibles", "Ridgid", "MRO", "Freight", "Other"];
  var UNITS = ["each", "roll", "case", "pallet", "skid", "bundle", "lb", "box", "bag", "truckload"];
  var ORDERED = ["customer_po", "driven_po", "shipped", "delivered", "invoice_sent", "paid"];
  function isOrder(h) { return h.source === "vendor_po" || ORDERED.indexOf(h.deal_stage) >= 0; }

  var V = {
    rows: [], summary: [], ents: [], byKey: {},
    history: [], lastBuy: [], catalog: [], vprod: [], vcust: [], risks: [], quotes: [], scores: [],
    contacts: [], activity: [], tasks: [], team: [], vcos: [], rfqs: [], rfqv: [],
    prodQ: "", prodType: "", prodShow: "products", types: [], rfqShow: "lines", openRfqId: null, openProductId: null,
    ready: false, note: "",
    sub: "board", source: "verify",
    q: "", category: "", findQ: "", ordQ: "", catQ: "", missingOnly: false, ordVendor: "",
    listShow: "crm", openKey: null, detailTab: "overview", dragKey: null,
    videoUrl: ""
  };
  var INTRO_VIDEO = "assets/video/Driven_Vendor_Portal_Intro_v2.mp4";

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function role() { return window.CRMCommissions ? CRMCommissions.role() : ""; }
  function canCost() { return role() === "full"; }
  function full() { return role() === "full"; }
  function money(n, dec) {
    if (n == null || n === "" || isNaN(+n)) return "";
    var v = +n, d = dec != null ? dec : (Math.abs(v) < 100 ? 2 : 0);
    return "$" + v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function short(n) {
    if (n == null || isNaN(+n)) return "";
    n = +n;
    if (Math.abs(n) >= 1000) return "$" + (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "K";
    return "$" + Math.round(n);
  }
  function num(n) { return n == null || n === "" ? "" : (+n).toLocaleString("en-US", { maximumFractionDigits: 2 }); }
  function day(d) {
    if (!d) return "";
    var s = String(d).slice(0, 10).split("-");
    if (s.length < 3) return esc(d);
    return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+s[1] - 1] + " " + (+s[2]) + ", " + s[0];
  }
  function daysAgo(d) {
    if (!d) return null;
    return Math.floor((Date.now() - new Date(String(d).slice(0, 10) + "T12:00:00").getTime()) / 864e5);
  }
  function ago(d) {
    var n = daysAgo(d);
    if (n == null) return "";
    if (n < 0) return "in " + (-n) + " days";
    if (n === 0) return "today";
    if (n === 1) return "yesterday";
    if (n < 60) return n + " days ago";
    return Math.round(n / 30) + " months ago";
  }
  function today() { return new Date().toISOString().slice(0, 10); }
  function words(s) { return String(s || "").toLowerCase(); }
  function matches(q, parts) {
    q = words(q).trim();
    if (!q) return true;
    var blob = words(parts.join(" "));
    return q.split(/\s+/).every(function (w) { return blob.indexOf(w) >= 0; });
  }
  function opts(list) {
    var seen = {};
    list.forEach(function (x) { if (x) seen[x] = 1; });
    return Object.keys(seen).sort();
  }
  function val(id) { var el = document.getElementById(id); return el ? el.value.trim() : ""; }
  function stageName(k) { for (var i = 0; i < STAGES.length; i++) if (STAGES[i][0] === k) return STAGES[i][1]; return k; }
  function me() { return window.CRMHooks ? CRMHooks.meName() : ""; }

  /* ---------- vendor entities: one per CRM vendor company, plus prospects not in the CRM ---------- */
  function build() {
    var byCo = {};
    V.rows.forEach(function (r) { if (r.company_id) (byCo[r.company_id] = byCo[r.company_id] || []).push(r); });
    var ents = [];
    V.summary.forEach(function (s) {
      var rows = byCo[s.company_id] || [];
      var e = entity("c" + s.company_id, s.company_id, s.vendor, rows, s);
      var co = V.vcos.filter(function (c) { return String(c.id) === String(s.company_id); })[0];
      e.overhead = !!(co && co.custom && co.custom.vendor_type === "overhead");
      ents.push(e);
    });
    /* Prospects not in the CRM: one card per supplier name, even when the map lists them under several categories. */
    var loose = {}, order = [];
    V.rows.forEach(function (r) {
      if (r.company_id) return;
      var k = words(r.supplier).replace(/[^a-z0-9]+/g, "");
      if (!loose[k]) { loose[k] = []; order.push(k); }
      loose[k].push(r);
    });
    order.forEach(function (k) {
      var rows = loose[k].sort(function (a, b) { return a.id - b.id; });
      ents.push(entity("s" + rows[0].id, null, rows[0].supplier, rows, null));
    });
    V.ents = ents;
    V.byKey = {};
    ents.forEach(function (e) { V.byKey[e.key] = e; });
  }
  function entity(key, companyId, name, rows, s) {
    rows = rows.slice().sort(function (a, b) { return (RANK[b.stage] || 0) - (RANK[a.stage] || 0) || a.id - b.id; });
    var stage = rows.length ? rows[0].stage : ((s && s.lines_bought) ? "active" : "approved");
    var cats = opts(rows.map(function (r) { return r.category; }));
    var e = {
      key: key, companyId: companyId, name: name || (rows[0] && rows[0].supplier) || "Vendor",
      rows: rows, primary: rows[0] || null, stage: stage, categories: cats, s: s || {},
      qb: (rows.filter(function (r) { return r.qb_vendor_id; })[0] || {}).qb_vendor_id || null,
      location: (rows[0] || {}).location || "", verify: rows.some(function (r) { return r.verify_flag && !r.verified_at; }),
      hold: (rows.filter(function (r) { return r.hold_status; })[0] || {}).hold_status || "",
      watch: rows.filter(function (r) { return r.watch_label; })[0] || null
    };
    e.score = latestScore(e);
    e.use = utilize(e.score);
    return e;
  }
  function ent(key) { return V.byKey[key] || null; }
  function entByCompany(id) { return id == null ? null : V.byKey["c" + id] || null; }
  function entByRow(rowId) {
    var r = V.rows.filter(function (x) { return String(x.id) === String(rowId); })[0];
    if (!r) return null;
    if (r.company_id) return entByCompany(r.company_id);
    return V.ents.filter(function (e) { return !e.companyId && rowIds(e).indexOf(String(r.id)) >= 0; })[0] || null;
  }
  function rowIds(e) { return e.rows.map(function (r) { return String(r.id); }); }
  function scoreRows(e) {
    var ids = rowIds(e);
    return V.scores.filter(function (s) { return ids.indexOf(String(s.vendor_id)) >= 0; })
      .sort(function (a, b) { return String(b.rated_at).localeCompare(String(a.rated_at)) || String(b.id).localeCompare(String(a.id)); });
  }
  function latestScore(e) { return scoreRows(e)[0] || null; }
  function previousScore(e) { return scoreRows(e)[1] || null; }
  function utilize(s) {
    if (window.CRMVendorScore) return CRMVendorScore.status(s);
    if (!s || s.values_fit == null || s.delivery_speed == null || s.communication == null) return "Not rated";
    if (+s.values_fit <= 2 || +s.delivery_speed <= 2 || +s.communication <= 2) return "Replace";
    if (+s.values_fit >= 4 && +s.delivery_speed >= 4 && +s.communication >= 4) return "Utilize";
    return "Watch";
  }
  /* Utilize: all three 4 or 5, keep using them. Watch: any 3, use only with a backup quote.
     Replace: any 1 or 2, stop new orders until reviewed. Not rated: no complete row.
     Rated by Rich, Amber and Annie after any order problem and every quarter at the L10. */
  var RATERS = ["Rich", "Amber", "Annie"];
  var BADGE = { Utilize: "Utilize: keep using", Watch: "Watch: backup quote", Replace: "Replace: stop new orders", "Not rated": "Not rated" };
  var SCORE_HELP = {
    values: ["", "Works against how we operate: cuts corners, hides problems", "Often a poor fit; we have to push for basic follow-through", "Fine, nothing special", "Straight shooter; fixes problems without being chased", "True partner; protects our customers like their own"],
    speed: ["", "Misses ship dates most of the time", "Late on 2 of the last 3 orders", "Late once in the last 3, or slips on lead time", "On time on the last 3 orders", "On time every time, and pulls in rush orders"],
    comm: ["", "Doesn’t answer; we find out about problems from the customer", "Slow to reply; we chase every update", "Replies within a day; updates only when asked", "Same-day replies; tells us about delays before we ask", "Proactive: confirmations, tracking and heads-ups without asking"]
  };
  function canRate() { return RATERS.indexOf(me()) >= 0; }
  function ratingDue(e) {
    if (e.overhead || (e.stage !== "active" && e.stage !== "approved")) return false;
    if (!e.score) return true;
    return daysAgo(e.score.rated_at) > 92;
  }
  function useChip(label) {
    var cls = label === "Utilize" ? "active" : label === "Replace" ? "lost" : label === "Watch" ? "warn" : "";
    label = BADGE[label] || label;
    return "<span class='chip " + cls + "'>" + esc(label) + "</span>";
  }
  function scoreAvg(s) {
    if (!s || s.values_fit == null || s.delivery_speed == null || s.communication == null) return null;
    return (+s.values_fit + +s.delivery_speed + +s.communication) / 3;
  }
  function trendGlyph(current, previous) {
    var dir = window.CRMVendorScore ? CRMVendorScore.trend(current, previous) : "";
    if (!dir) return "";
    if (dir === "up") return " <span class='vm-trend up' title='Up from the previous rating'>&#8593;</span>";
    if (dir === "down") return " <span class='vm-trend down' title='Down from the previous rating'>&#8595;</span>";
    return " <span class='vm-trend flat' title='Same as the previous rating'>&#8594;</span>";
  }
  function decisionText(label) {
    return window.CRMVendorScore ? CRMVendorScore.decision(label) : label;
  }
  function flags(e) {
    var out = [];
    if (e.hold) out.push("<span class='chip lost'>" + esc(e.hold) + "</span>");
    if (e.watch) out.push("<span class='chip " + (e.watch.watch_tone === "risk" ? "lost" : "warn") + "'>" + esc(e.watch.watch_label) + "</span>");
    if (e.verify) out.push("<span class='chip warn'>Verify</span>");
    return out.join(" ");
  }
  function vendorLink(companyId, name) {
    var e = entByCompany(companyId);
    if (!e) return name && String(name).trim() ? esc(name) : "<span class='chip warn'>Unnamed vendor</span>";
    return "<button class='linkbtn' data-vm='open' data-k='" + e.key + "'>" + esc(name || e.name) + "</button>";
  }

  /* ---------- styles: only what the CRM sheet doesn’t already have ---------- */
  function styles() {
    if (document.getElementById("vm-style")) return;
    var css = [
      ".vm-nav{display:flex;gap:2px;border-bottom:1px solid var(--line);margin:0 0 14px;overflow-x:auto}",
      ".vm-nav button{background:none;border:0;border-bottom:3px solid transparent;padding:8px 14px 9px;color:var(--muted);font-weight:600;white-space:nowrap}",
      ".vm-nav button[aria-current='true']{color:var(--text);border-bottom-color:var(--accent)}",
      ".vm-nav .n{margin-left:6px;font-size:12px;color:var(--warn)}",
      ".vm-zones{grid-template-columns:repeat(6,minmax(220px,1fr))}",
      ".zone.vm-off{grid-column:5/7;border-color:var(--muted);color:var(--muted);background:color-mix(in srgb,var(--muted) 10%,transparent);border-radius:4px 4px 0 0;padding-left:8px}",
      ".zone.vm-src{grid-column:1/3}.zone.vm-buy{grid-column:3/5}",
      ".card.vm-active{border-left-color:var(--accent)}.card.vm-approved{border-left-color:var(--ops)}",
      ".card.vm-vetting{border-left-color:var(--warn)}.card.vm-dnu{border-left-color:var(--bad)}",
      ".card .vm-tags{display:flex;gap:4px;flex-wrap:wrap;margin-top:6px}",
      ".card .vm-crm{font-size:11px;color:var(--muted)}",
      ".vm-more{background:none;border:1px dashed var(--line);border-radius:6px;padding:6px;color:var(--muted)}",
      ".vm-ask{background:var(--panel);border:1px solid var(--line);border-left:4px solid var(--accent);border-radius:8px;padding:16px;margin-bottom:14px}",
      ".vm-ask label{display:block;font-family:'Barlow Condensed','Arial Narrow',Barlow,sans-serif;font-size:22px;font-weight:600;margin-bottom:8px}",
      ".vm-ask input{width:100%;font-size:19px;padding:11px 13px;background:var(--bg);border:1px solid var(--line);border-radius:6px}",
      ".vm-num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}",
      ".vm-dim{color:var(--muted);font-size:13px}",
      ".vm-kv{display:grid;grid-template-columns:repeat(auto-fit,minmax(118px,1fr));gap:1px;background:var(--line);border:1px solid var(--line);border-radius:8px;overflow:hidden;margin:0 0 14px}",
      ".vm-kv div{background:var(--bg);padding:9px 12px}",
      ".vm-kv b{display:block;font-family:'Barlow Condensed',sans-serif;font-size:19px;font-weight:600;line-height:1.15}",
      ".vm-kv span{font-size:12px;color:var(--muted)}",
      ".vm-h3{font-family:'Barlow Condensed',sans-serif;font-size:18px;font-weight:600;margin:16px 0 6px}",
      ".vm-tl{list-style:none;margin:0;padding:0}",
      ".vm-tl li{padding:9px 0 9px 14px;border-left:2px solid var(--line);position:relative}",
      ".vm-tl li::before{content:'';position:absolute;left:-5px;top:14px;width:8px;height:8px;border-radius:50%;background:var(--line)}",
      ".vm-tl li.call::before,.vm-tl li.visit::before{background:var(--accent)}.vm-tl li.email::before{background:var(--ops)}",
      ".vm-tl .when{font-size:12px;color:var(--muted)}",
      ".vm-fix select,.vm-qb input{background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:4px 6px;max-width:220px}",
      ".vm-fix select{border-color:var(--warn)}",
      ".vm-stage{background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:4px 8px}",
      ".vm-task{display:flex;gap:8px;align-items:flex-start;padding:6px 0;border-bottom:1px solid var(--line)}",
      ".vm-task input{width:18px;height:18px;accent-color:var(--accent);margin-top:2px}",
      ".vm-task.vm-late .d{color:var(--warn);font-weight:600}",
      ".task .addrow input,.task .fields input{width:100%;height:auto;margin:0;accent-color:auto}",
      "td.vm-wrap{white-space:normal;min-width:200px}",
      ".vm-picks{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:8px}",
      ".vm-pick{display:flex;gap:10px;align-items:flex-start;border:1px solid var(--line);border-radius:8px;padding:10px 12px;background:var(--bg);cursor:pointer}",
      ".vm-pick.on{border-color:var(--accent);box-shadow:inset 3px 0 0 var(--accent)}",
      ".vm-pick input{width:18px;height:18px;margin-top:2px;accent-color:var(--accent)}",
      ".vm-pick .n{font-family:'Barlow Condensed',sans-serif;font-size:22px;font-weight:700;line-height:1;color:var(--muted)}",
      ".vm-pick.on .n{color:var(--accent)}",
      ".vm-pick b{font-size:15px}",
      ".vm-why{display:flex;flex-wrap:wrap;gap:4px;margin:6px 0}",
      ".vm-why span{font-size:12px;border:1px solid var(--line);border-radius:12px;padding:1px 8px;color:var(--muted)}",
      ".vm-why span.bad{border-color:var(--bad);color:var(--bad)}",
      ".vm-picks.small .vm-pick{padding:8px 10px}.vm-picks.small .vm-why span{font-size:11px}",
      ".vm-in{background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:4px 6px;width:84px;text-align:right}",
      ".vm-in.w{width:110px;text-align:left}",
      ".vm-rfq select{background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:4px 6px}",
      "tr.vm-best td{background:color-mix(in srgb,var(--accent) 10%,transparent)}",
      "tr.vm-won td{background:color-mix(in srgb,var(--accent) 16%,transparent)}",
      ".vm-rfq tr.vm-sub td{padding-top:0;border-top:0}",
      ".vm-rfq tbody tr:not(.vm-sub) td{border-bottom:0}",
      ".vm-mini{display:inline-flex;align-items:center;gap:6px;margin:0 14px 4px 0;font-size:12px;color:var(--muted)}",
      ".vm-checks{display:flex;flex-direction:column;gap:4px;max-height:180px;overflow:auto;border:1px solid var(--line);border-radius:6px;padding:8px;background:var(--bg)}",
      ".vm-checks label{display:flex;gap:8px;align-items:center;font-weight:400;font-size:14px;margin:0}",
      ".vm-checks input{width:16px;height:16px;margin:0;accent-color:var(--accent)}",
      "table.vm-types{table-layout:fixed;min-width:640px}table.vm-types td{white-space:normal}",
      ".vm-scores{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;margin:10px 0}",
      ".vm-score{border:1px solid var(--line);border-radius:8px;padding:8px;background:var(--bg)}",
      ".vm-score-h{font-family:'Barlow Condensed',sans-serif;font-size:17px;font-weight:600;margin:0 0 6px}",
      ".vm-score-o{display:flex;gap:8px;align-items:flex-start;padding:5px 6px;border-radius:6px;cursor:pointer;font-weight:400;font-size:13px;margin:0}",
      ".vm-score-o:hover{background:var(--raise)}.vm-score-o.on{background:color-mix(in srgb,var(--accent) 14%,transparent)}",
      ".vm-score-o input{width:16px;height:16px;margin-top:1px;accent-color:var(--accent)}",
      ".vm-score-o b{min-width:16px;font-family:'Barlow Condensed',sans-serif;font-size:17px;line-height:1}",
      ".vm-score-o b.sg{color:var(--accent)}.vm-score-o b.sy{color:var(--warn)}.vm-score-o b.sr{color:var(--bad)}",
      "a.vm-btn{display:inline-flex;align-items:center;text-decoration:none;padding:8px 14px;border-radius:6px}",
      ".vm-trend.up{color:var(--accent);font-weight:700}.vm-trend.down{color:var(--bad);font-weight:700}.vm-trend.flat{color:var(--muted)}",
      ".vm-decision{margin:0 0 12px;padding:10px 12px;border:1px solid var(--line);border-left:4px solid var(--accent);border-radius:8px;background:var(--bg)}",
      ".vm-decision.replace{border-left-color:var(--bad)}.vm-decision.watch{border-left-color:var(--warn)}",
      ".vm-video{margin:0 0 14px;padding:12px;border:1px solid var(--line);border-radius:8px;background:var(--panel)}",
      ".vm-video video{width:100%;max-width:860px;border-radius:8px;background:#000;display:block}",
      ".vm-steps{margin:0 0 12px;padding-left:18px}.vm-steps li{margin:6px 0}"
    ].join("\n");
    var el = document.createElement("style");
    el.id = "vm-style";
    el.textContent = css;
    document.head.appendChild(el);
  }

  /* ---------- data ---------- */
  async function q(table, build) {
    var b = CRMDB.db.from(table).select("*");
    if (build) b = build(b);
    var r = await b;
    return r.error ? null : (r.data || []);
  }
  async function qFirst(names, build) {
    for (var i = 0; i < names.length; i++) {
      var rows = await q(names[i], build);
      if (rows) return rows;
    }
    return null;
  }
  function hideMoney(row, keys) {
    if (canCost() || !row) return row;
    var copy = Object.assign({}, row);
    keys.forEach(function (k) { copy[k] = null; });
    return copy;
  }
  async function load() {
    if (!window.CRMDB) return;
    styles();
    var rows = await qFirst(["crm_vendors_visible", "crm_vendors"], function (b) { return b.order("supplier"); });
    if (!rows) {
      V.ready = false;
      V.note = "Vendor tables are not in the database yet. Apply the crm_vendors migration and seed. Nothing was written.";
      return;
    }
    V.rows = rows.map(function (r) { return hideMoney(r, ["terms", "last_price", "credit_limit", "volume_amount"]); });
    var p = await Promise.all([
      q("crm_v_vendor_summary", function (b) { return b.order("vendor"); }),
      q("crm_v_purchase_history", function (b) { return b.order("bought_on", { ascending: false }); }),
      q("crm_v_product_last_buy", function (b) { return b.order("last_bought_on", { ascending: false }); }),
      q("crm_products", function (b) { return b.order("name"); }),
      qFirst(["crm_vendor_products_visible", "crm_vendor_products"]),
      q("crm_vendor_customers"),
      q("crm_vendor_category_risk"),
      q("crm_vendor_quotes"),
      q("crm_vendor_scores", function (b) { return b.order("rated_at", { ascending: false }); }),
      q("crm_team", function (b) { return b.eq("active", true).order("name"); }),
      q("crm_companies", function (b) { return b.eq("kind", "vendor"); }),
      q("crm_rfqs", function (b) { return b.order("created_at", { ascending: false }); }),
      qFirst(["crm_rfq_vendors_visible", "crm_rfq_vendors"], function (b) { return b.order("rank"); }),
      q("crm_product_categories", function (b) { return b.order("sort").order("name"); }),
      q("crm_vendor_portal_settings")
    ]);
    V.summary = (p[0] || []).map(function (r) { return hideMoney(r, ["spend", "gross_profit", "bills_due"]); });
    V.history = (p[1] || []).map(function (r) { return hideMoney(r, ["unit_cost", "freight"]); });
    V.lastBuy = (p[2] || []).map(function (r) { return hideMoney(r, ["last_unit_cost"]); });
    V.catalog = p[3] || [];
    V.vprod = (p[4] || []).map(function (r) { return hideMoney(r, ["last_price"]); });
    V.vcust = p[5] || [];
    V.risks = p[6] || [];
    V.quotes = p[7] || [];
    V.scores = p[8] || [];
    V.team = p[9] || [];
    V.vcos = p[10] || [];
    V.rfqs = p[11] || [];
    V.rfqv = (p[12] || []).map(function (r) { return hideMoney(r, ["unit_cost", "freight"]); });
    V.types = p[13] || [];
    V.videoUrl = (p[14] && p[14][0] && p[14][0].intro_video_url) || "";
    var ids = V.summary.map(function (s) { return s.company_id; });
    if (ids.length) {
      var t = await Promise.all([
        q("crm_contacts", function (b) { return b.in("company_id", ids).order("name"); }),
        q("crm_activity", function (b) { return b.in("company_id", ids).order("at", { ascending: false }).limit(2000); }),
        q("crm_tasks", function (b) { return b.in("company_id", ids).order("due"); })
      ]);
      V.contacts = t[0] || [];
      V.activity = t[1] || [];
      V.tasks = t[2] || [];
    }
    V.note = p[0] ? "" : "Vendor views are missing. Apply supabase/migrations/20261110120000_vendor_portal.sql. Nothing was written.";
    build();
    V.ready = true;
  }
  async function reload(keepDrawer) {
    await load();
    render();
    if (keepDrawer && V.openKey) openEnt(V.openKey);
  }

  /* ---------- shell ---------- */
  function counts() {
    var miss = V.history.filter(function (h) { return h.source === "order_line" && h.line_vendor_missing; }).length;
    var due = V.tasks.filter(function (t) { return !t.done && t.due && t.due <= today(); }).length;
    var verify = V.rows.filter(function (r) { return r.verify_flag && !r.verified_at; }).length;
    var unlinked = V.ents.filter(function (e) { return e.stage === "active" && !e.qb; }).length;
    var fixes = health().filter(function (x) { return x.n > 0; }).length;
    return { miss: miss, due: due, verify: verify, unlinked: unlinked, fixes: fixes };
  }
  function nav() {
    var c = counts();
    var tabs = [
      ["board", "Board", ""], ["list", "Vendors", c.due ? c.due + " due" : ""], ["find", "Find a product", ""], ["rfq", "Vendor quotes", openRfqCount() ? openRfqCount() + " open" : ""],
      ["orders", "Purchase history", c.miss ? c.miss + " missing vendor" : ""], ["catalog", "Product lines", ""],
      ["qb", "QuickBooks", c.unlinked ? c.unlinked + " to link" : ""], ["sourcing", "Scorecard", c.verify ? c.verify + " to verify" : ""],
      ["cleanup", "Cleanup", c.fixes ? c.fixes + " to fix" : ""], ["training", "Training", ""]
    ];
    return "<nav class='vm-nav' aria-label='Vendor views'>" + tabs.map(function (t) {
      return "<button data-vm='sub' data-v='" + t[0] + "' aria-current='" + (V.sub === t[0]) + "'>" + t[1] + (t[2] ? "<span class='n'>" + esc(t[2]) + "</span>" : "") + "</button>";
    }).join("") + "</nav>";
  }
  function render() {
    var view = document.getElementById("view");
    if (!view) return;
    styles();
    var h = "<div class='sect'><div class='bar'><h2>Vendors</h2><div class='spacer'></div>" +
      "<button class='ghost' data-vm='calc'>Calculators</button><button class='primary' data-vm='new-vendor'>Add vendor</button></div>";
    if (window.CRMSupply) h += CRMSupply.banner();
    if (V.note) h += "<p class='banner'>" + esc(V.note) + "</p>";
    if (!V.ready) { view.innerHTML = h + "</div>"; return; }
    h += nav();
    h += whyLine(V.sub);
    if (V.sub === "list") h += listHtml();
    else if (V.sub === "find") h += findHtml();
    else if (V.sub === "rfq") h += rfqListHtml();
    else if (V.sub === "orders") h += ordersHtml();
    else if (V.sub === "catalog") h += catalogHtml();
    else if (V.sub === "qb") h += qbHtml();
    else if (V.sub === "sourcing") h += sourcingHtml();
    else if (V.sub === "cleanup") h += cleanupHtml();
    else if (V.sub === "training") h += trainingHtml();
    else h += boardHtml();
    view.innerHTML = h + "</div>";
    wire();
  }
  function filterBar(withCrm) {
    var cats = opts(V.rows.map(function (r) { return r.category; }));
    var h = "<div class='bar'><input type='search' id='vmQ' placeholder='Search vendors, products, places' value='" + esc(V.q) + "'>" +
      "<select id='vmCat'><option value=''>All categories</option>" + cats.map(function (c) { return "<option" + (V.category === c ? " selected" : "") + ">" + esc(c) + "</option>"; }).join("") + "</select>";
    if (withCrm) h += "<select id='vmShow'><option value='crm'" + (V.listShow === "crm" ? " selected" : "") + ">In the CRM</option><option value='buying'" + (V.listShow === "buying" ? " selected" : "") + ">Buying from</option><option value='all'" + (V.listShow === "all" ? " selected" : "") + ">Everyone, prospects too</option><option value='overhead'" + (V.listShow === "overhead" ? " selected" : "") + ">Overhead vendors</option></select>";
    return h + "</div>";
  }
  function entMatch(e) {
    if (V.category && e.categories.indexOf(V.category) < 0) return false;
    return matches(V.q, [e.name, e.categories.join(" "), e.location, e.rows.map(function (r) { return [r.products_specs, r.core_products, r.contact, r.status].join(" "); }).join(" ")]);
  }

  /* ---------- Board (like Pipeline) ---------- */
  function boardHtml() {
    var ents = V.ents.filter(function (e) { return !e.overhead && entMatch(e); });
    var h = homeIntro() + filterBar(false);
    h += "<div class='boardwrap' id='vmBoard'><div class='zones vm-zones'>" +
      "<div class='zone sales vm-src'>Sourcing<small>find and vet</small></div>" +
      "<div class='zone operations vm-buy'>Buying<small>approved and active</small></div>" +
      "<div class='zone vm-off'>Off<small>not buying</small></div>";
    STAGES.forEach(function (st) {
      var list = ents.filter(function (e) { return e.stage === st[0]; }).sort(cardSort);
      var limit = V["lim_" + st[0]] || 40;
      h += "<div class='col' data-vm-drop='" + st[0] + "'><div class='colhead'><h3>" + st[1] + " <span class='ct'>" + list.length + "</span></h3>" +
        "<div class='tot'>" + colTotal(list, st[0]) + "</div></div><div class='cards'>" +
        (list.slice(0, limit).map(card).join("") || "<div class='empty'>Nobody in this stage. Drag a vendor here, or use Add vendor.</div>") +
        (list.length > limit ? "<button class='vm-more' data-vm='more' data-v='" + st[0] + "'>Show " + (list.length - limit) + " more</button>" : "") +
        "</div></div>";
    });
    return h + "</div></div>";
  }
  function cardSort(a, b) {
    return String(b.s.last_order_date || "").localeCompare(String(a.s.last_order_date || "")) || a.name.localeCompare(b.name);
  }
  function colTotal(list, stage) {
    if (stage !== "active" && stage !== "approved") return list.filter(function (e) { return e.companyId; }).length + " in the CRM";
    if (!canCost()) return list.filter(function (e) { return e.s.last_order_date && daysAgo(e.s.last_order_date) <= 90; }).length + " bought from in 90 days";
    var spend = list.reduce(function (t, e) { return e.s.spend == null ? t : (t || 0) + (+e.s.spend); }, null);
    return spend == null ? "No vendor costs entered yet" : short(spend) + " spend on file";
  }
  function card(e) {
    var cls = e.stage === "active" ? "vm-active" : e.stage === "approved" ? "vm-approved" : e.stage === "vetting" ? "vm-vetting" : e.stage === "do_not_use" ? "vm-dnu" : "";
    var open = V.tasks.filter(function (t) { return !t.done && String(t.company_id) === String(e.companyId); });
    var next = open.filter(function (t) { return t.due; }).sort(function (a, b) { return a.due.localeCompare(b.due); })[0];
    var foot = e.s.last_order_date ? "Last order " + ago(e.s.last_order_date) : e.s.last_quote_date ? "Last quote " + ago(e.s.last_quote_date) : (e.companyId ? "No orders yet" : "Not in the CRM");
    return "<button class='card " + cls + "' draggable='true' data-vm='open' data-k='" + e.key + "' data-vm-drag='" + e.key + "'>" +
      "<div class='co'>" + esc(e.name) + "</div>" +
      "<div class='desc'>" + esc(e.categories.join(", ") || "No category") + "</div>" +
      (canCost() && e.s.spend ? "<div class='row'><span>Spend</span><span class='money'>" + short(e.s.spend) + "</span></div>" : "") +
      "<div class='foot'><span>" + esc(foot) + "</span>" + (next ? "<span class='" + (next.due <= today() ? "due" : "") + "'>" + day(next.due).replace(/, \d{4}$/, "") + "</span>" : "") + "</div>" +
      ((e.use !== "Not rated" || e.hold || e.watch || e.verify) ? "<div class='vm-tags'>" + (e.use !== "Not rated" ? useChip(e.use) : "") + trendGlyph(scoreAvg(e.score), scoreAvg(previousScore(e))) + flags(e) + "</div>" : "") +
      "</button>";
  }

  /* ---------- Vendors list (like Companies) ---------- */
  function listHtml() {
    var ents = V.ents.filter(function (e) {
      if (V.listShow === "overhead") { if (!e.overhead) return false; }
      else if (e.overhead) return false;
      if (V.listShow === "crm" && !e.companyId) return false;
      if (V.listShow === "buying" && e.stage !== "active") return false;
      return entMatch(e);
    }).sort(cardSort);
    var cost = canCost();
    var h = filterBar(true);
    h += "<div class='panel tablewrap'><table><thead><tr><th>Vendor</th><th>Stage</th><th>Category</th><th>Last order</th><th>Last touch</th><th>Next follow-up</th><th class='vm-num'>Contacts</th>" +
      (cost ? "<th class='vm-num'>Spend</th>" : "") + (full() ? "<th class='vm-num'>Bills due</th>" : "") + "<th>Use</th><th>QB</th><th>Flags</th></tr></thead><tbody>";
    h += ents.length ? ents.map(function (e) {
      var s = e.s;
      var touch = s.last_activity_at || s.last_contact_at;
      return "<tr class='click' data-vm='open' data-k='" + e.key + "'><td><b>" + esc(e.name) + "</b>" + (e.location ? "<div class='vm-dim'>" + esc(e.location) + "</div>" : "") + "</td>" +
        "<td>" + stageName(e.stage) + "</td><td>" + esc(e.categories.join(", ")) + "</td>" +
        "<td>" + (s.last_order_date ? day(s.last_order_date) : "<span class='vm-dim'>None</span>") + (s.last_quote_date ? "<div class='vm-dim'>Quoted " + ago(s.last_quote_date) + "</div>" : "") + "</td>" +
        "<td>" + (touch ? ago(touch) : "<span class='vm-dim'>Never</span>") + "</td>" +
        "<td>" + (s.next_due ? "<span class='" + (s.next_due <= today() ? "chip warn" : "") + "'>" + day(s.next_due) + "</span>" : "") + "</td>" +
        "<td class='vm-num'>" + num(s.contacts || 0) + "</td>" +
        (cost ? "<td class='vm-num'>" + money(s.spend, 0) + "</td>" : "") +
        (full() ? "<td class='vm-num'>" + (+s.bills_due ? money(s.bills_due, 0) : "") + "</td>" : "") +
        "<td>" + useChip(e.use) + "</td><td>" + (e.qb ? "<span class='chip active'>Linked</span>" : "<span class='chip'>No</span>") + "</td><td>" + flags(e) + "</td></tr>";
    }).join("") : "<tr><td colspan='12' class='empty'>No vendors match. Clear a filter or add the vendor.</td></tr>";
    return h + "</tbody></table></div>";
  }

  /* ---------- Vendor drawer (like a company) ---------- */
  function openEnt(key) {
    var e = ent(key);
    if (!e || !window.CRMHooks) return;
    V.openKey = key;
    var tabs = [["overview", "Overview"], ["activity", "Activity"], ["contacts", "Contacts"], ["bought", "Quotes and orders"], ["products", "Products they make"], ["customers", "Customers fed"]];
    if (full()) tabs.push(["money", "POs and bills"]);
    tabs.push(["score", "Scorecard"], ["record", "Profile"]);
    var h = "<div class='dhead'><div style='flex:1'><div class='sub'>" + esc(e.categories.join(", ") || "Vendor") + (e.location ? ", " + esc(e.location) : "") + "</div>" +
      "<h2>" + esc(e.name) + "</h2><div class='sub' style='display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:4px'>" +
      "<select class='vm-stage' data-vm-stage='" + e.key + "' aria-label='Stage'>" + STAGES.map(function (s) { return "<option value='" + s[0] + "'" + (e.stage === s[0] ? " selected" : "") + ">" + s[1] + "</option>"; }).join("") + "</select>" +
      useChip(e.use) + trendGlyph(scoreAvg(e.score), scoreAvg(previousScore(e))) + (e.qb ? " <span class='chip active'>QuickBooks linked</span>" : " <span class='chip warn'>Not linked to QuickBooks</span>") + " " + flags(e) +
      "</div></div><button class='ghost' data-act='close'>Close</button></div><div class='dbody'>";
    h += "<div class='vm-decision " + (e.use === "Replace" ? "replace" : e.use === "Watch" ? "watch" : "") + "'><b>" + esc(decisionText(e.use)) + "</b></div>";
    if (!e.companyId) h += "<p class='banner'>This vendor is on the supplier map but not in the CRM yet. <button class='linkbtn' data-vm='to-crm' data-k='" + e.key + "'>Add to the CRM</button> to track contacts, calls and follow-ups.</p>";
    h += "<div class='filters' style='flex-wrap:wrap;margin-bottom:12px'>" + tabs.map(function (t) { return "<button data-vm='tab' data-v='" + t[0] + "' aria-pressed='" + (V.detailTab === t[0]) + "'>" + t[1] + "</button>"; }).join("") + "</div>";
    var hist = e.companyId ? V.history.filter(function (x) { return String(x.vendor_company_id) === String(e.companyId); }) : [];
    var t = V.detailTab;
    if (t === "activity") h += activityBlock(e);
    else if (t === "contacts") h += contactsBlock(e);
    else if (t === "bought") h += historyTable(hist, { customer: true });
    else if (t === "products") h += productsBlock(e);
    else if (t === "customers") h += customersBlock(e, hist);
    else if (t === "money") h += moneyBlock(e);
    else if (t === "score") h += scoreBlock(e);
    else if (t === "record") h += profileBlock(e);
    else h += overviewBlock(e, hist);
    CRMHooks.openDrawer(h + "</div>", true);
  }
  function needCrm(e, what) {
    return "<p class='log'>Add " + esc(e.name) + " to the CRM to " + what + ".</p><button class='primary' data-vm='to-crm' data-k='" + e.key + "'>Add to the CRM</button>";
  }
  function needProfile(e, what) {
    return "<p class='log'>" + esc(e.name) + " has no supplier profile yet. Add one to " + what + ".</p><button class='primary' data-vm='add-profile' data-k='" + e.key + "'>Add supplier profile</button>";
  }

  function overviewBlock(e, hist) {
    var s = e.s, cost = canCost(), p = e.primary || {};
    var h = "<div class='vm-kv'><div><b>" + (s.last_order_date ? day(s.last_order_date) : "None") + "</b><span>Last order</span></div>" +
      "<div><b>" + (s.last_quote_date ? day(s.last_quote_date) : "None") + "</b><span>Last quote</span></div>" +
      "<div><b>" + num(s.lines_bought || 0) + "</b><span>Lines bought</span></div><div><b>" + num(s.customers_fed || 0) + "</b><span>Customers fed</span></div>" +
      (cost ? "<div><b>" + (money(s.spend, 0) || "—") + "</b><span>Spend</span></div><div><b>" + (money(s.gross_profit, 0) || "—") + "</b><span>Gross profit</span></div>" : "") +
      (full() ? "<div><b>" + num(s.open_pos || 0) + "</b><span>Open POs</span></div><div><b>" + (+s.bills_due ? money(s.bills_due, 0) : "$0") + "</b><span>Bills due</span></div>" : "") + "</div>";
    var tasks = V.tasks.filter(function (x) { return !x.done && e.companyId && String(x.company_id) === String(e.companyId); });
    h += "<div class='vm-h3'>Follow-ups</div>" + (e.companyId ? taskList(tasks) + quickTask(e) : needCrm(e, "set follow-ups"));
    h += "<div class='fields' style='margin-top:12px'>" + [
      ["Main contact", p.contact], ["Lead time", p.lead_time], ["MOQ", p.moq], ["Terms", canCost() ? p.terms : ""],
      ["Core products", p.core_products || p.products_specs], ["What we buy", p.buy_summary], ["What we can quote", p.quote_summary]
    ].filter(function (f) { return f[1]; }).map(function (f) {
      return "<div class='f" + (String(f[1]).length > 40 ? " wide" : "") + "'><label>" + f[0] + "</label><div>" + esc(f[1]) + "</div></div>";
    }).join("") + "</div>";
    var last = V.activity.filter(function (a) { return e.companyId && String(a.company_id) === String(e.companyId); }).slice(0, 3);
    if (last.length) h += "<div class='vm-h3'>Latest activity</div>" + timeline(last);
    h += "<div class='vm-h3'>Recent quotes and orders</div>" + historyTable(hist.slice(0, 5), { customer: true });
    var qs = V.quotes.filter(function (x) { return rowIds(e).indexOf(String(x.vendor_id)) >= 0; });
    if (qs.length) h += "<div class='vm-h3'>Open quotes using this vendor</div><ul class='mini'>" + qs.map(function (x) {
      return "<li><b>" + esc(x.customer_name) + "</b>: " + esc(x.item) + (x.note ? " <span class='chip warn'>" + esc(x.note) + "</span>" : "") + "</li>";
    }).join("") + "</ul>";
    return h;
  }

  function timeline(list) {
    if (!list.length) return "<p class='log'>Nothing logged yet.</p>";
    return "<ul class='vm-tl'>" + list.map(function (a) {
      var k = a.kind || "note";
      return "<li class='" + esc(k) + "'><div class='when'>" + esc(k.replace("_", " ")) + ", " + day(a.at) + " (" + ago(a.at) + ")" + (a.by_user ? ", " + esc(a.by_user) : "") + "</div><div>" + esc(a.note || "") + "</div></li>";
    }).join("") + "</ul>";
  }
  function activityBlock(e) {
    if (!e.companyId) return needCrm(e, "log calls and emails");
    var list = V.activity.filter(function (a) { return String(a.company_id) === String(e.companyId); });
    var h = "<div class='fields'><div class='f'><label>Type</label><select id='vaKind'><option value='call'>Call</option><option value='email'>Email</option><option value='visit'>Visit</option><option value='meeting'>Meeting</option><option value='note'>Note</option></select></div>" +
      "<div class='f'><label>Who</label><select id='vaWho'><option value=''>No contact</option>" + V.contacts.filter(function (c) { return String(c.company_id) === String(e.companyId); }).map(function (c) { return "<option>" + esc(c.name) + "</option>"; }).join("") + "</select></div>" +
      "<div class='f wide'><label>What happened</label><textarea id='vaNote' placeholder='Asked for 6 mil shrink pricing, quote by Friday'></textarea></div>" +
      "<div class='f'><label>Follow up</label><input id='vaDue' type='date'></div><div class='f'><label>Follow-up for</label>" + teamSelect("vaAssign") + "</div></div>" +
      "<div class='mactions' style='margin-top:8px'><button class='primary' data-vm='log' data-k='" + e.key + "'>Log it</button></div>";
    h += "<div class='vm-h3'>Timeline</div>" + timeline(list);
    return h;
  }
  function teamSelect(id) {
    var mine = me();
    return "<select id='" + id + "'>" + V.team.map(function (t) { return "<option" + (t.name === mine ? " selected" : "") + ">" + esc(t.name) + "</option>"; }).join("") + "</select>";
  }
  function taskList(tasks) {
    if (!tasks.length) return "<p class='log'>No open follow-ups.</p>";
    return tasks.map(function (t) {
      return "<label class='vm-task" + (t.due && t.due < today() ? " vm-late" : "") + "'><input type='checkbox' data-vm-task='" + t.id + "'><span style='flex:1'>" + esc(t.title) +
        "<div class='vm-dim'><span class='d'>" + (t.due ? day(t.due) : "No date") + "</span>" + (t.assignee ? ", " + esc(t.assignee) : "") + "</div></span></label>";
    }).join("");
  }
  function quickTask(e) {
    return "<div class='addrow' style='grid-template-columns:2fr 1fr 1fr auto;margin-top:8px'><input id='vtTitle' placeholder='Follow up on…'><input id='vtDue' type='date'>" + teamSelect("vtWho") +
      "<button class='ghost' data-vm='task' data-k='" + e.key + "'>Add</button></div>";
  }

  function contactsBlock(e) {
    if (!e.companyId) return needCrm(e, "save contacts") + ((e.primary && e.primary.contact) ? "<p class='log' style='margin-top:10px'>On the supplier map: " + esc(e.primary.contact) + "</p>" : "");
    var list = V.contacts.filter(function (c) { return String(c.company_id) === String(e.companyId); });
    var h = "<ul class='mini'>" + (list.map(function (c) {
      return "<li><b>" + esc(c.name) + "</b>" + (c.role ? ", " + esc(c.role) : "") + "<div class='vm-dim'>" +
        [c.email ? "<a href='mailto:" + esc(c.email) + "'>" + esc(c.email) + "</a>" : "", c.phone ? "<a href='tel:" + esc(c.phone) + "'>" + esc(c.phone) + "</a>" : ""].filter(Boolean).join(", ") + "</div></li>";
    }).join("") || "<li class='log'>No contacts yet.</li>") + "</ul>";
    if (e.primary && e.primary.contact && !list.length) h += "<p class='log'>On the supplier map: " + esc(e.primary.contact) + "</p>";
    h += "<div class='addrow'><input id='vcName' placeholder='Name'><input id='vcRole' placeholder='Role'><input id='vcEmail' placeholder='Email'><input id='vcPhone' placeholder='Phone'><button class='ghost' data-vm='contact' data-k='" + e.key + "'>Add</button></div>";
    return h;
  }

  function historyTable(rows, show) {
    var cost = canCost();
    if (!rows.length) return "<p class='log'>Nothing bought yet.</p>";
    return "<div class='panel tablewrap'><table><thead><tr><th>Date</th><th>Item</th>" + (show.vendor ? "<th>Vendor</th>" : "") + (show.customer ? "<th>Customer</th>" : "") +
      "<th class='vm-num'>Qty</th>" + (cost ? "<th class='vm-num'>Cost</th>" : "") + "<th class='vm-num'>Sell</th>" + (cost ? "<th class='vm-num'>Margin</th>" : "") + "<th>Status</th><th>PO / invoice</th></tr></thead><tbody>" +
      rows.map(function (r) {
        var mg = cost && r.unit_cost != null && +r.sell_price ? Math.round((1 - r.unit_cost / r.sell_price) * 100) + "%" : "";
        return "<tr><td>" + day(r.bought_on) + "</td><td class='vm-wrap'>" + esc(r.item || "") + "</td>" +
          (show.vendor ? "<td>" + (r.vendor_company_id ? vendorLink(r.vendor_company_id, r.vendor_name) : "<span class='chip warn'>No vendor</span>") + "</td>" : "") +
          (show.customer ? "<td>" + esc(r.customer_name || "") + "</td>" : "") +
          "<td class='vm-num'>" + num(r.qty) + (r.unit ? " " + esc(r.unit) : "") + "</td>" + (cost ? "<td class='vm-num'>" + money(r.unit_cost) + "</td>" : "") +
          "<td class='vm-num'>" + money(r.sell_price) + "</td>" + (cost ? "<td class='vm-num'>" + mg + "</td>" : "") +
          "<td>" + stageChip(r) + "</td><td>" + esc([r.po_number, r.invoice_number].filter(Boolean).join(" / ")) + "</td></tr>";
      }).join("") + "</tbody></table></div>";
  }

  function stageChip(r) {
    if (r.source === "vendor_po") return "<span class='chip active'>Vendor PO</span>";
    return isOrder(r) ? "<span class='chip active'>Ordered</span>" : "<span class='chip'>Quoted</span>";
  }
  function junkProduct(p) {
    var r = V.rows.filter(function (x) { return String(x.id) === String(p.vendor_id); })[0];
    return !p.specs && !p.moq && !p.lead_time && r && words(p.product).trim() === words(r.supplier).trim();
  }
  function productsBlock(e) {
    if (!e.primary) return needProfile(e, "list what they make");
    var ids = rowIds(e), cost = canCost();
    var rows = V.vprod.filter(function (p) { return ids.indexOf(String(p.vendor_id)) >= 0 && !junkProduct(p); });
    var h = "<div class='panel tablewrap'><table><thead><tr><th>Product</th><th>Specs</th><th>MOQ</th><th>Lead time</th>" + (cost ? "<th>Last price</th>" : "") + "<th></th></tr></thead><tbody>" +
      (rows.map(function (p) {
        return "<tr><td>" + esc(p.product || p.category || "") + "</td><td class='vm-wrap'>" + esc(p.specs || "") + "</td><td>" + esc(p.moq || "") + "</td><td>" + esc(p.lead_time || "") + "</td>" +
          (cost ? "<td>" + esc(p.last_price || "") + "</td>" : "") + "<td><button class='linkbtn' data-vm='del-vprod' data-id='" + p.id + "'>Remove</button></td></tr>";
      }).join("") || "<tr><td colspan='6' class='empty'>Nothing listed yet.</td></tr>") + "</tbody></table></div>";
    h += "<div class='addrow' style='grid-template-columns:2fr 2fr 1fr 1fr auto'><input id='vpName' placeholder='Product'><input id='vpSpecs' placeholder='Specs'><input id='vpMoq' placeholder='MOQ'><input id='vpLead' placeholder='Lead time'><button class='ghost' data-vm='add-vprod' data-k='" + e.key + "'>Add</button></div>";
    return h;
  }

  function customersBlock(e, hist) {
    var agg = {};
    hist.forEach(function (x) {
      if (!x.customer_name) return;
      var a = agg[x.customer_name] = agg[x.customer_name] || { name: x.customer_name, lines: 0, last: x.bought_on };
      a.lines++;
      if (String(x.bought_on) > String(a.last)) a.last = x.bought_on;
    });
    var list = Object.keys(agg).map(function (k) { return agg[k]; });
    var h = list.length ? "<ul class='mini'>" + list.map(function (c) { return "<li><b>" + esc(c.name) + "</b>, " + c.lines + " line" + (c.lines === 1 ? "" : "s") + ", last " + day(c.last) + "</li>"; }).join("") + "</ul>"
      : "<p class='log'>No orders tie this vendor to a customer yet.</p>";
    var ids = rowIds(e);
    var linked = V.vcust.filter(function (p) { return ids.indexOf(String(p.vendor_id)) >= 0; });
    if (linked.length) h += "<div class='vm-h3'>Linked by hand</div><ul class='mini'>" + linked.map(function (p) {
      return "<li><b>" + esc(p.customer_name) + "</b>" + (p.feeds ? ": " + esc(p.feeds) : "") + " <button class='linkbtn' data-vm='del-vcust' data-id='" + p.id + "'>Remove</button></li>";
    }).join("") + "</ul>";
    if (e.primary) {
      var cos = CRMHooks.companies().filter(function (c) { return c.kind !== "vendor"; });
      h += "<div class='addrow' style='grid-template-columns:2fr 2fr auto'><select id='vcCo'><option value=''>Customer…</option>" + cos.map(function (c) { return "<option value='" + c.id + "'>" + esc(c.name) + "</option>"; }).join("") +
        "</select><input id='vcFeeds' placeholder='What the buy feeds'><button class='ghost' data-vm='add-vcust' data-k='" + e.key + "'>Link</button></div>";
    }
    return h;
  }

  function moneyBlock(e) {
    if (!full()) return "<p class='log'>POs and bills are limited to Amber, Dan, and Rich.</p>";
    var pos = [];
    if (window.CRMSupply) e.rows.forEach(function (r) { pos = pos.concat(CRMSupply.posForVendor(r.id)); });
    var h = "<div class='vm-h3'>Purchase orders</div>";
    h += pos.length ? "<div class='panel tablewrap'><table><thead><tr><th>PO</th><th>Date</th><th>Status</th><th class='vm-num'>Total</th><th>Order</th></tr></thead><tbody>" + pos.map(function (p) {
      return "<tr><td>" + esc(p.po_number || "PO") + "</td><td>" + day(p.po_date) + "</td><td>" + esc(p.status || "") + "</td><td class='vm-num'>" + money(p.total, 0) + "</td>" +
        "<td class='vm-qb'><input id='poDeal-" + p.id + "' placeholder='Order id' value='" + esc(p.deal_id || "") + "'> <button class='linkbtn' data-vm='link-po' data-id='" + p.id + "'>Link</button></td></tr>";
    }).join("") + "</tbody></table></div>" : "<p class='log'>No POs yet. They fill in from QuickBooks once the sync runs.</p>";
    h += "<div class='vm-h3'>Bills</div><p class='log'>" + (+e.s.bills_due ? money(e.s.bills_due, 0) + " open." : "No open bills on file.") + " Bills fill in from QuickBooks once the sync runs.</p>";
    return h;
  }

  function scoreBlock(e) {
    if (!e.primary) return needProfile(e, "score them");
    var s = e.score;
    function pick(key, label, v) {
      var help = SCORE_HELP[key];
      var h = "<div class='vm-score'><div class='vm-score-h'>" + label + "</div>";
      for (var i = 5; i >= 1; i--) {
        h += "<label class='vm-score-o" + (String(v) === String(i) ? " on" : "") + "'><input type='radio' name='sc-" + key + "' value='" + i + "'" + (String(v) === String(i) ? " checked" : "") + (canRate() ? "" : " disabled") + ">" +
          "<b class='s" + (i >= 4 ? "g" : i === 3 ? "y" : "r") + "'>" + i + "</b><span>" + esc(help[i]) + "</span></label>";
      }
      return h + "</div>";
    }
    var ids = rowIds(e);
    var hist = V.scores.filter(function (x) { return ids.indexOf(String(x.vendor_id)) >= 0; });
    var last3 = e.companyId ? V.history.filter(function (x) { return String(x.vendor_company_id) === String(e.companyId); }).slice(0, 3) : [];
    var h = "<div class='vm-kv'><div><b>" + useChip(e.use) + "</b><span>Badge now</span></div><div><b>" + (s ? day(s.rated_at) : "Never") + "</b><span>Last rated" + (s && s.rated_by ? ", " + esc(s.rated_by) : "") + "</span></div>" +
      "<div><b>" + (ratingDue(e) ? "<span class='chip warn'>Due</span>" : "Current") + "</b><span>Quarterly rating</span></div></div>";
    var prev = previousScore(e);
    h += "<p class='log'><b>Utilize</b>: all three 4 or 5, keep using them. <b>Watch</b>: any 3, use only with a backup quote. <b>Replace</b>: any 1 or 2, stop new orders until reviewed. Not rated means there is no complete row yet. Arrows compare this rating with the previous one. Rate after any order problem and in the quarterly pass at the L10.</p>";
    if (s && prev) h += "<p class='log'>Since " + day(prev.rated_at) + ": values " + trendGlyph(s.values_fit, prev.values_fit) + " speed " + trendGlyph(s.delivery_speed, prev.delivery_speed) + " communication " + trendGlyph(s.communication, prev.communication) + "</p>";
    else if (!s) h += "<p class='log'>No rating yet. Save all three scores. That adds a new row and leaves older ratings in place.</p>";
    h += performanceBlock(e);
    h += "<div class='vm-h3'>Last three orders and quotes</div>" + (last3.length ? historyTable(last3, { customer: true }) : "<p class='log'>No lines on file with this vendor yet. Rate from what you know of the last three orders.</p>");
    if (!canRate()) h += "<p class='banner'>Ratings are done by Rich, Amber and Annie.</p>";
    h += "<div class='vm-scores'>" + pick("values", "Values fit", s && s.values_fit) + pick("speed", "Delivery speed", s && s.delivery_speed) + pick("comm", "Communication", s && s.communication) + "</div>";
    if (canRate()) h += "<div class='fields'><div class='f wide'><label>What drove this rating</label><input id='sc-notes' placeholder='Order and what happened, e.g. PO 4411 shipped 6 days late, no heads-up'></div></div>" +
      "<div class='mactions'><button class='primary' data-vm='score' data-k='" + e.key + "'>Save rating</button></div>";
    if (hist.length) h += "<div class='vm-h3'>Rating history</div><ul class='mini'>" + hist.map(function (x) {
      return "<li>" + useChip(utilize(x)) + " " + day(x.rated_at) + ": values " + (x.values_fit || "—") + ", speed " + (x.delivery_speed || "—") + ", communication " + (x.communication || "—") + (x.rated_by ? ", by " + esc(x.rated_by) : "") + (x.notes ? "<div class='vm-dim'>" + esc(x.notes) + "</div>" : "") + "</li>";
    }).join("") + "</ul>";
    return h;
  }

  function profileBlock(e) {
    if (!e.rows.length) return needProfile(e, "track category, specs, MOQ, lead time and terms");
    var cost = canCost();
    var h = e.rows.length > 1 ? "<p class='log'>" + esc(e.name) + " is on the supplier map for " + e.rows.length + " categories. Each has its own profile.</p>" : "";
    e.rows.forEach(function (r) {
      var fields = [["Supplier", "supplier", 1], ["Category", "category"], ["Status note", "status"], ["Contact", "contact", 1], ["Location", "location"], ["Miles from River Falls", "miles_from_river_falls"],
        ["QuickBooks vendor id", "qb_vendor_id"], ["Terms", "terms"], ["Credit limit", "credit_limit"], ["Hold", "hold_status"], ["MOQ", "moq"], ["Lead time", "lead_time"],
        ["Core products", "core_products", 1], ["Products / specs", "products_specs", 1]];
      if (cost) fields.push(["Last price", "last_price", 1]);
      if (!cost) fields = fields.filter(function (f) { return f[1] !== "terms" && f[1] !== "credit_limit" && f[1] !== "last_price"; });
      fields.push(["Notes", "notes", 1]);
      if (e.rows.length > 1) h += "<div class='vm-h3'>" + esc(r.category || "Profile") + "</div>";
      h += "<div class='fields'>" + fields.map(function (f) {
        var v = r[f[1]], long = f[1] === "products_specs" || f[1] === "notes" || f[1] === "core_products";
        if (f[1] === "category") {
          var known = V.types.some(function (t) { return t.name === v; });
          return "<div class='f'><label>Product type</label><select data-vm-field='category' data-id='" + r.id + "'>" + (known || !v ? "" : "<option selected>" + esc(v) + "</option>") +
            typeOptions("", false).replace(/<option value='(\d+)'>([^<]*)<\/option>/g, function (m, id, nm) { return "<option value='" + nm + "'" + (nm === esc(v || "") ? " selected" : "") + ">" + nm + "</option>"; }) + "</select></div>";
        }
        return "<div class='f" + (f[2] ? " wide" : "") + "'><label>" + f[0] + "</label>" + (long
          ? "<textarea data-vm-field='" + f[1] + "' data-id='" + r.id + "'>" + esc(v || "") + "</textarea>"
          : "<input data-vm-field='" + f[1] + "' data-id='" + r.id + "' value='" + esc(v == null ? "" : v) + "'>") + "</div>";
      }).join("") + "</div>";
    });
    return h + "<p class='log'>Changes save when you leave a field.</p>";
  }

  /* ---------- Find a product ---------- */
  function findHtml() {
    return "<div class='vm-ask'><label for='vmFind'>When did we last buy it, and from who?</label>" +
      "<input id='vmFind' type='search' autocomplete='off' placeholder='Try: stretch film, 48x40, corner, Quality Tape' value='" + esc(V.findQ) + "'></div>" +
      "<div id='vmResults'>" + findResults() + "</div>";
  }
  function itemIndex() {
    var map = {};
    V.history.forEach(function (h) {
      if (!h.item) return;
      var k = words(h.item).trim();
      var it = map[k] = map[k] || { key: k, item: h.item, category: h.category, n: 0, vendors: {}, order: null, quote: null };
      it.n++;
      if (h.vendor_company_id) it.vendors[h.vendor_company_id] = 1;
      var slot = isOrder(h) ? "order" : "quote";
      if (!it[slot] || String(h.bought_on) > String(it[slot].bought_on)) it[slot] = h;
      if (!it.category && h.category) it.category = h.category;
    });
    return Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) {
      var la = (a.order || a.quote || {}).bought_on || "", lb = (b.order || b.quote || {}).bought_on || "";
      return String(lb).localeCompare(String(la));
    });
  }
  function findResults() {
    var all = itemIndex();
    var rows = all.filter(function (r) {
      var o = r.order || {}, qt = r.quote || {};
      return matches(V.findQ, [r.item, r.category, o.vendor_name, qt.vendor_name, o.customer_name, qt.customer_name, o.po_number]);
    });
    if (!rows.length) return "<div class='panel'><p class='empty'>" + (all.length ? "Nothing matches. Try fewer words, or check Purchase history." : "No order or quote lines on file yet.") + "</p></div>";
    var cost = canCost();
    function cell(h) {
      if (!h) return "<td><span class='vm-dim'>Never</span></td><td></td>" + (cost ? "<td></td>" : "") + "<td></td>";
      return "<td>" + day(h.bought_on) + "<div class='vm-dim'>" + ago(h.bought_on) + (h.customer_name ? ", " + esc(h.customer_name) : "") + "</div></td>" +
        "<td>" + (h.vendor_company_id ? vendorLink(h.vendor_company_id, h.vendor_name) : "<span class='chip warn'>No vendor</span>") + "</td>" +
        (cost ? "<td class='vm-num'>" + (money(h.unit_cost) || "<span class='vm-dim'>none</span>") + "</td>" : "") +
        "<td class='vm-num'>" + money(h.sell_price) + "</td>";
    }
    var noOrders = !all.some(function (r) { return r.order; });
    return (noOrders ? "<p class='banner'>No ordered lines in the CRM yet. Everything here is a quote. Real buy history fills in once orders move past Customer PO, or once the Order Log is brought in.</p>" : "") +
      "<div class='panel tablewrap'><table><thead><tr><th rowspan='2'>Item</th><th colspan='" + (cost ? 4 : 3) + "' style='border-bottom:1px solid var(--line)'>Last ordered</th><th colspan='" + (cost ? 4 : 3) + "' style='border-bottom:1px solid var(--line)'>Last quoted</th><th rowspan='2' class='vm-num'>Lines</th></tr>" +
      "<tr><th>When</th><th>Vendor</th>" + (cost ? "<th class='vm-num'>Cost</th>" : "") + "<th class='vm-num'>Sell</th><th>When</th><th>Vendor</th>" + (cost ? "<th class='vm-num'>Cost</th>" : "") + "<th class='vm-num'>Sell</th></tr></thead><tbody>" +
      rows.slice(0, 200).map(function (r) {
        return "<tr class='click' data-vm='item' data-k='" + esc(r.key) + "'><td class='vm-wrap'><b>" + esc(r.item) + "</b>" + (r.category ? "<div class='vm-dim'>" + esc(r.category) + "</div>" : "") + "</td>" +
          cell(r.order) + cell(r.quote) + "<td class='vm-num'>" + r.n + (Object.keys(r.vendors).length > 1 ? "<div class='vm-dim'>" + Object.keys(r.vendors).length + " vendors</div>" : "") + "</td></tr>";
      }).join("") + "</tbody></table></div>";
  }
  function openItem(key) {
    var it = itemIndex().filter(function (r) { return r.key === key; })[0];
    if (!it) return;
    var rows = V.history.filter(function (h) { return words(h.item).trim() === key; });
    var cost = canCost(), o = it.order, qt = it.quote;
    var h = "<div class='dhead'><div style='flex:1'><div class='sub'>" + esc(it.category || "Product") + "</div><h2>" + esc(it.item) + "</h2></div><button class='ghost' data-act='close'>Close</button></div><div class='dbody'>";
    h += "<div class='vm-kv'><div><b>" + (o ? day(o.bought_on) : "Never") + "</b><span>Last ordered" + (o && o.vendor_name ? ", " + esc(o.vendor_name) : "") + "</span></div>" +
      "<div><b>" + (qt ? day(qt.bought_on) : "Never") + "</b><span>Last quoted" + (qt && qt.vendor_name ? ", " + esc(qt.vendor_name) : "") + "</span></div>" +
      (cost ? "<div><b>" + (money((o || qt || {}).unit_cost) || "None") + "</b><span>Last cost</span></div>" : "") +
      "<div><b>" + (money((o || qt || {}).sell_price) || "—") + "</b><span>Last sell</span></div><div><b>" + it.n + "</b><span>Lines</span></div></div>";
    var prodHit = V.catalog.filter(function (c) { return itemKey(c.name) === key; })[0];
    h += "<div class='bar'>" + (prodHit ? "<button class='ghost' data-vm='product' data-id='" + prodHit.id + "'>Open product</button><button class='primary' data-vm='rfq-product' data-id='" + prodHit.id + "'>Get vendor quotes</button>" : "") + "</div>";
    h += "<div class='vm-h3'>Every line with this item</div>" + historyTable(rows, { vendor: true, customer: true });
    var alts = V.vprod.filter(function (p) { return !junkProduct(p) && it.category && words(p.category) === words(it.category); });
    if (alts.length) h += "<div class='vm-h3'>Other vendors who list " + esc(it.category) + "</div><ul class='mini'>" + alts.slice(0, 15).map(function (p) {
      var e = entByRow(p.vendor_id);
      return "<li>" + (e ? "<button class='linkbtn' data-vm='open' data-k='" + e.key + "'>" + esc(e.name) + "</button>" : "") + " " + esc(p.product || "") + (p.lead_time ? ", lead " + esc(p.lead_time) : "") + (p.moq ? ", MOQ " + esc(p.moq) : "") + "</li>";
    }).join("") + "</ul>";
    CRMHooks.openDrawer(h + "</div>", true);
  }

  /* ---------- Purchase history ---------- */
  function ordersHtml() {
    var c = counts();
    var rows = V.history.filter(function (h) {
      if (V.missingOnly && !(h.source === "order_line" && h.line_vendor_missing)) return false;
      if (V.ordVendor && String(h.vendor_company_id) !== V.ordVendor) return false;
      return matches(V.ordQ, [h.item, h.vendor_name, h.customer_name, h.category, h.po_number, h.invoice_number]);
    });
    var vendCos = V.ents.filter(function (e) { return e.companyId; }).sort(function (a, b) { return a.name.localeCompare(b.name); });
    var cost = canCost();
    var h = c.miss ? "<p class='banner'>" + c.miss + " order line" + (c.miss === 1 ? " has" : "s have") + " no vendor of its own. Pick it in the table so the line shows up on that vendor.</p>" : "";
    h += "<div class='bar'><input type='search' id='vmOrdQ' placeholder='Search item, vendor, customer, PO' value='" + esc(V.ordQ) + "'>" +
      "<select id='vmOrdV'><option value=''>All vendors</option>" + vendCos.map(function (e) { return "<option value='" + e.companyId + "'" + (V.ordVendor === String(e.companyId) ? " selected" : "") + ">" + esc(e.name) + "</option>"; }).join("") + "</select>" +
      "<label class='switch'><input type='checkbox' id='vmMiss'" + (V.missingOnly ? " checked" : "") + "> Missing vendor only</label></div>";
    h += "<div class='panel tablewrap'><table><thead><tr><th>Date</th><th>Item</th><th>Vendor</th><th>Customer</th><th class='vm-num'>Qty</th>" + (cost ? "<th class='vm-num'>Cost</th>" : "") + "<th class='vm-num'>Sell</th><th>Order</th></tr></thead><tbody>";
    h += rows.length ? rows.map(function (r) {
      var cell;
      if (r.source === "order_line" && r.line_vendor_missing) {
        cell = "<span class='vm-fix'><select data-vm-line='" + r.source_id + "'><option value=''>" + (r.vendor_name ? "Order says " + esc(r.vendor_name) + ". Confirm…" : "Pick vendor…") + "</option>" +
          vendCos.map(function (e) { return "<option value='" + e.companyId + "'>" + esc(e.name) + "</option>"; }).join("") + "</select></span>";
      } else cell = r.vendor_company_id ? vendorLink(r.vendor_company_id, r.vendor_name) : "<span class='chip warn'>No vendor</span>";
      return "<tr><td>" + day(r.bought_on) + "</td><td class='vm-wrap'>" + esc(r.item || "") + "</td><td>" + cell + "</td><td>" + esc(r.customer_name || "") + "</td>" +
        "<td class='vm-num'>" + num(r.qty) + (r.unit ? " " + esc(r.unit) : "") + "</td>" +
        (cost ? "<td class='vm-num'>" + (r.source === "order_line" ? "<span class='vm-qb'><input data-vm-cost='" + r.source_id + "' inputmode='decimal' style='width:80px;text-align:right' value='" + esc(r.unit_cost == null ? "" : r.unit_cost) + "' placeholder='Cost'></span>" : money(r.unit_cost)) + "</td>" : "") +
        "<td class='vm-num'>" + money(r.sell_price) + "</td><td>" + (r.deal_id ? "#" + r.deal_id + " " : "") + stageChip(r) +
        (r.source === "order_line" && !isOrder(r) ? " <button class='linkbtn' data-vm='rfq-line' data-id='" + r.source_id + "'>Vendor quotes</button>" : "") + "</td></tr>";
    }).join("") : "<tr><td colspan='8' class='empty'>" + (V.missingOnly ? "Every order line has a vendor." : "No purchases match.") + "</td></tr>";
    return h + "</tbody></table></div>";
  }

  /* ---------- Products ---------- */
  function productMatch(p) {
    if (V.prodType && String(p.category_id) !== V.prodType) return false;
    var t = productType(p);
    return matches(V.prodQ, [p.name, p.sku, p.category, p.description, p.qbo_item_id, t ? t.name + " " + (t.aliases || []).join(" ") : "", vendorsForProduct(p.id).map(function (e) { return e.name; }).join(" ")]);
  }
  function catalogHtml() {
    var pills = "<div class='filters' style='margin-bottom:12px'><button data-vm='prod-show' data-v='products' aria-pressed='" + (V.prodShow !== "types") + "'>Products</button><button data-vm='prod-show' data-v='types' aria-pressed='" + (V.prodShow === "types") + "'>Product lines</button></div>";
    if (V.prodShow === "types") return pills + categoriesHtml();
    var rows = V.catalog.filter(productMatch);
    var unsaved = quoteLinesWithoutProduct();
    var cost = canCost();
    var h = pills + "<div class='vm-ask'><label for='vmProdQ'>Find a product</label><input id='vmProdQ' type='search' autocomplete='off' placeholder='Size, material, vendor or QuickBooks item: 48x60, corner, stretch, Versa-Pak' value='" + esc(V.prodQ) + "'></div>";
    h += "<div class='bar'><span class='vm-dim'>" + V.catalog.length + " products, " + V.catalog.filter(function (p) { return p.qbo_item_id; }).length + " linked to QuickBooks</span><div class='spacer'></div>" +
      (unsaved.length ? "<button class='ghost' data-vm='save-lines'>Save " + unsaved.length + " quote line" + (unsaved.length === 1 ? "" : "s") + " as products</button>" : "") +
      "<select id='vmProdType'>" + typeOptions(V.prodType, false).replace("<option value=''>Pick a type</option>", "<option value=''>All types</option>") + "</select>" +
      "<button class='ghost' data-vm='bulk-products'>Add many</button><button class='primary' data-vm='new-product'>Add product</button></div>";
    h += "<div id='vmProdResults'>" + productRows(rows, cost) + "</div>";
    return h;
  }
  function productRows(rows, cost) {
    if (!rows.length) return "<div class='panel'><p class='empty'>" + (V.catalog.length ? "No product matches. Try fewer words, or add it." : "No products yet. Add one, or save the lines on your quotes as products.") + "</p></div>";
    return "<div class='panel tablewrap'><table><thead><tr><th>Product</th><th>Vendors</th><th>Last ordered</th><th>Last quoted</th>" + (cost ? "<th class='vm-num'>Best vendor price</th>" : "") +
      "<th>Vendor quotes</th><th>QB item</th><th></th></tr></thead><tbody>" + rows.map(function (p) {
        var ents = vendorsForProduct(p.id), it = itemFor(p), best = cost ? bestPrice(p.id, p.name) : null, r = openRfqFor({ productId: p.id });
        return "<tr class='click' data-vm='product' data-id='" + p.id + "'><td class='vm-wrap'><b>" + esc(p.name) + "</b><div class='vm-dim'>" + esc([(productType(p) || {}).name || p.category, p.unit, p.sku].filter(Boolean).join(", ")) + "</div></td>" +
          "<td>" + (ents.length ? ents.slice(0, 3).map(function (e) { return esc(e.name); }).join(", ") + (ents.length > 3 ? " +" + (ents.length - 3) : "") : "<span class='chip warn'>None linked</span>") + "</td>" +
          "<td>" + (it && it.order ? day(it.order.bought_on) : "<span class='vm-dim'>Never</span>") + "</td>" +
          "<td>" + (it && it.quote ? day(it.quote.bought_on) : "<span class='vm-dim'>Never</span>") + "</td>" +
          (cost ? "<td class='vm-num'>" + (best ? money(best.cost) + "<div class='vm-dim'>" + esc(best.vendor) + "</div>" : "<span class='vm-dim'>None yet</span>") + "</td>" : "") +
          "<td>" + (r ? rfqChip(r) : "") + "</td>" +
          "<td>" + (p.qbo_item_id ? "<span class='chip active'>" + esc(p.qbo_item_id) + "</span>" : "<span class='chip'>Not linked</span>") + "</td>" +
          "<td><button class='ghost' data-vm='rfq-product' data-id='" + p.id + "'>Get vendor quotes</button></td></tr>";
      }).join("") + "</tbody></table></div>";
  }
  /* ---------- QuickBooks ---------- */
  function qbHtml() {
    var buying = V.ents.filter(function (e) { return e.stage === "active" || e.stage === "approved"; }).sort(function (a, b) { return (a.qb ? 1 : 0) - (b.qb ? 1 : 0) || a.name.localeCompare(b.name); });
    var h = "<div class='stats'><div class='stat'><b>" + buying.filter(function (e) { return e.qb; }).length + " of " + buying.length + "</b><span>Approved and active vendors linked</span></div>" +
      "<div class='stat'><b>" + V.catalog.filter(function (p) { return p.qbo_item_id; }).length + " of " + V.catalog.length + "</b><span>Products linked to items</span></div>" +
      "<div class='stat'><b>" + V.history.filter(function (x) { return x.qb_invoice_id; }).length + " of " + V.history.length + "</b><span>Order lines tied to an invoice</span></div></div>";
    h += "<p class='lead'>Each vendor needs its QuickBooks vendor id so POs, bills and payments land on the right vendor when the sync runs.</p>";
    h += "<div class='panel tablewrap'><table><thead><tr><th>Vendor</th><th>Stage</th>" + (canCost() ? "<th>Terms on file</th>" : "") + "<th>QuickBooks vendor id</th></tr></thead><tbody>" + buying.map(function (e) {
      return "<tr><td><button class='linkbtn' data-vm='open' data-k='" + e.key + "'>" + esc(e.name) + "</button></td><td>" + stageName(e.stage) + "</td>" + (canCost() ? "<td>" + esc((e.primary || {}).terms || "") + "</td>" : "") +
        "<td class='vm-qb'>" + (e.rows.length ? "<input data-vm-qb='" + e.key + "' value='" + esc(e.qb || "") + "' placeholder='Not linked'>" : "<button class='linkbtn' data-vm='add-profile' data-k='" + e.key + "'>Add supplier profile first</button>") + "</td></tr>";
    }).join("") + "</tbody></table></div>";
    if (window.CRMSupply && full()) h += CRMSupply.queueHtml();
    return h;
  }

  /* ---------- Sourcing ---------- */
  function sourcingHtml() {
    var subs = [["verify", "Verify queue"], ["score", "Scorecard"], ["risk", "Category risk"], ["quotes", "Open quotes"], ["links", "Who buys from whom"]];
    var h = "<div class='filters' style='margin-bottom:12px'>" + subs.map(function (s) { return "<button data-vm='src' data-v='" + s[0] + "' aria-pressed='" + (V.source === s[0]) + "'>" + s[1] + "</button>"; }).join("") + "</div>";
    if (V.source === "score") return h + scorecardHtml();
    if (V.source === "risk") return h + riskHtml();
    if (V.source === "quotes") return h + quotesHtml();
    if (V.source === "links") return h + (window.CRMSupply ? CRMSupply.whoHtml("", "") : "");
    return h + verifyHtml();
  }
  function verifyHtml() {
    var rows = V.rows.filter(function (r) { return r.verify_flag && !r.verified_at; });
    return "<p class='lead'>Vet each of these before it’s quoted or used. Fix what’s wrong, then mark it verified with what you checked.</p><div class='panel'>" + (rows.map(function (r) {
      return "<div class='task'><div class='tt'><b>" + esc(r.supplier) + "</b>, " + esc(r.category || "") + "<div class='log'>" + esc(r.verify_flag) + "</div>" +
        "<div class='fields' style='margin-top:8px'><div class='f'><label>Contact</label><input data-vm-field='contact' data-id='" + r.id + "' value='" + esc(r.contact || "") + "'></div>" +
        "<div class='f'><label>Location</label><input data-vm-field='location' data-id='" + r.id + "' value='" + esc(r.location || "") + "'></div>" +
        "<div class='f wide'><label>Products / specs</label><textarea data-vm-field='products_specs' data-id='" + r.id + "'>" + esc(r.products_specs || "") + "</textarea></div>" +
        "<div class='f wide'><label>What you checked</label><input id='vn-" + r.id + "'></div></div>" +
        "<button class='primary' data-vm='verified' data-id='" + r.id + "'>Mark verified</button></div></div>";
    }).join("") || "<div class='empty'>Verify queue is clear.</div>") + "</div>";
  }
  function l10Issues() {
    var buying = V.ents.filter(function (e) { return !e.overhead && (e.stage === "active" || e.stage === "approved"); });
    var reds = buying.filter(function (e) { return e.use === "Replace"; });
    var gaps = [];
    V.types.filter(function (t) { return t.active !== false; }).forEach(function (t) {
      var vs = vendorsForType(t).filter(function (e) { return e.stage === "active" || e.stage === "approved"; });
      if (vs.length && !vs.some(function (e) { return e.use === "Utilize"; })) gaps.push({ t: t, n: vs.length });
    });
    return { reds: reds, gaps: gaps, due: buying.filter(ratingDue) };
  }
  function l10Text() {
    var x = l10Issues(), out = [];
    x.reds.forEach(function (e) { out.push("Replace: " + e.name + " (" + e.categories.join(", ") + "). Stop new orders until reviewed."); });
    x.gaps.forEach(function (g) { out.push("No Utilize vendor for " + g.t.name + " (" + g.n + " vendor" + (g.n === 1 ? "" : "s") + ")."); });
    return out.join("\n");
  }
  function scorecardHtml() {
    var x = l10Issues();
    var h = "<div class='stats'><div class='stat'><b>" + V.ents.filter(function (e) { return !e.overhead && (e.stage === "active" || e.stage === "approved") && e.use === "Utilize"; }).length + "</b><span>Utilize</span></div>" +
      "<div class='stat'><b>" + V.ents.filter(function (e) { return !e.overhead && (e.stage === "active" || e.stage === "approved") && e.use === "Watch"; }).length + "</b><span>Watch</span></div>" +
      "<div class='stat'><b>" + x.reds.length + "</b><span>Replace</span></div><div class='stat'><b>" + x.due.length + "</b><span>Due a rating</span></div></div>";
    h += "<div class='vm-h3'>L10 issues</div>";
    if (!x.reds.length && !x.gaps.length) h += "<p class='log'>No Replace vendors, and every product line you buy has a Utilize vendor.</p>";
    else h += "<div class='panel'>" + x.reds.map(function (e) {
        return "<div class='task'><div class='tt'><span class='chip lost'>Replace</span> <button class='linkbtn' data-vm='open-score' data-k='" + e.key + "'>" + esc(e.name) + "</button>: stop new orders until reviewed</div></div>";
      }).join("") + x.gaps.map(function (g) {
        return "<div class='task'><div class='tt'><span class='chip warn'>No Utilize</span> " + esc(g.t.name) + ": " + g.n + " vendor" + (g.n === 1 ? "" : "s") + ". Rate them or find a backup.</div></div>";
      }).join("") + "</div><div class='mactions' style='justify-content:flex-start'><button class='ghost' data-vm='copy-l10'>Copy issues for the L10</button></div>";
    h += "<div class='vm-h3'>All approved and active vendors</div><p class='log'>Rated by Rich, Amber and Annie after any order problem, and a full pass every quarter at the L10. Setters see the badge only.</p>";
    return h + "<div class='panel tablewrap'><table><thead><tr><th>Vendor</th><th>Type</th><th class='vm-num'>Values</th><th class='vm-num'>Speed</th><th class='vm-num'>Comm</th><th>Badge</th><th>Last rated</th></tr></thead><tbody>" +
      V.ents.filter(function (e) { return !e.overhead && (e.stage === "active" || e.stage === "approved"); })
        .sort(function (a, b) { var o = { Replace: 0, "Not rated": 1, Watch: 2, Utilize: 3 }; return o[a.use] - o[b.use] || a.name.localeCompare(b.name); })
        .map(function (e) {
          var s = e.score;
          function n(v) { return v == null ? "—" : v; }
          return "<tr class='click' data-vm='open-score' data-k='" + e.key + "'><td><b>" + esc(e.name) + "</b></td><td>" + esc(e.categories.join(", ")) + "</td><td class='vm-num'>" + n(s && s.values_fit) + "</td><td class='vm-num'>" + n(s && s.delivery_speed) + "</td><td class='vm-num'>" + n(s && s.communication) + "</td>" +
            "<td>" + useChip(e.use) + trendGlyph(scoreAvg(e.score), scoreAvg(previousScore(e))) + "</td><td>" + (s ? day(s.rated_at) + (s.rated_by ? ", " + esc(s.rated_by) : "") : "Never") + (ratingDue(e) ? " <span class='chip warn'>Due</span>" : "") + "</td></tr>";
        }).join("") + "</tbody></table></div>";
  }
  function riskHtml() {
    return "<p class='lead'>R is a single source or none. Y is concentrated or thin. G is covered.</p><div class='panel tablewrap'><table><thead><tr><th>Category</th><th class='vm-num'>2026 sources</th><th>Risk</th><th>Why</th><th>Backups being worked</th></tr></thead><tbody>" +
      (V.risks.filter(function (r) { return r.risk || r.sources_2026 != null || r.reason; }).map(function (r) {
        var tone = r.risk === "R" ? "lost" : r.risk === "Y" ? "warn" : r.risk === "G" ? "active" : "";
        return "<tr><td>" + esc(r.category) + "</td><td class='vm-num'>" + esc(r.sources_2026 == null ? "" : r.sources_2026) + "</td><td>" + (r.risk ? "<span class='chip " + tone + "'>" + esc(r.risk) + "</span>" : "") + "</td><td class='vm-wrap'>" + esc(r.reason || "") + "</td><td class='vm-wrap'>" + esc(r.backups || "") + "</td></tr>";
      }).join("") || "<tr><td colspan='5' class='empty'>No category risk rows.</td></tr>") + "</tbody></table></div>";
  }
  function quotesHtml() {
    return "<div class='panel tablewrap'><table><thead><tr><th>Customer</th><th>Item</th><th>Vendor</th><th>Note</th></tr></thead><tbody>" + (V.quotes.map(function (x) {
      var e = x.vendor_id ? entByRow(x.vendor_id) : null;
      return "<tr><td>" + esc(x.customer_name) + "</td><td class='vm-wrap'>" + esc(x.item) + "</td><td>" + (e ? "<button class='linkbtn' data-vm='open' data-k='" + e.key + "'>" + esc(x.vendor_name || e.name) + "</button>" : esc(x.vendor_name || "")) + "</td><td>" + (x.note ? "<span class='chip " + (x.note_tone === "risk" ? "lost" : "warn") + "'>" + esc(x.note) + "</span>" : "") + "</td></tr>";
    }).join("") || "<tr><td colspan='4' class='empty'>No open quotes.</td></tr>") + "</tbody></table></div>";
  }

  /* ---------- Product types (your list) under the CRM's fixed categories ---------- */
  function typeById(id) { return V.types.filter(function (t) { return String(t.id) === String(id); })[0] || null; }
  function typeByName(name) {
    var n = words(name).trim();
    if (!n) return null;
    return V.types.filter(function (t) { return words(t.name).trim() === n; })[0] ||
      V.types.filter(function (t) { return (t.aliases || []).some(function (a) { return words(a).trim() === n; }); })[0] || null;
  }
  function typesUnder(crmCat) { return V.types.filter(function (t) { return t.crm_category === crmCat; }); }
  function typeGuess(text, crmCat) {
    var t = words(text), pool = crmCat ? typesUnder(crmCat) : V.types;
    var hit = pool.filter(function (ty) { return [ty.name].concat(ty.aliases || []).some(function (a) { return a && t.indexOf(words(a)) >= 0; }); })[0];
    if (hit) return hit;
    var keys = catKeys(text);
    hit = pool.filter(function (ty) { return catKeys(ty.name).some(function (k) { return keys.indexOf(k) >= 0; }); })[0];
    return hit || (pool.length === 1 ? pool[0] : null);
  }
  function typeOptions(selected, withNew) {
    var h = "<option value=''>Pick a type</option>";
    CRM_CATS.forEach(function (c) {
      var list = typesUnder(c).filter(function (t) { return t.active !== false || String(t.id) === String(selected); });
      if (!list.length) return;
      h += "<optgroup label='" + esc(c) + "'>" + list.map(function (t) { return "<option value='" + t.id + "'" + (String(t.id) === String(selected) ? " selected" : "") + ">" + esc(t.name) + "</option>"; }).join("") + "</optgroup>";
    });
    if (withNew) h += "<option value='new'>+ Add a new type</option>";
    return h;
  }
  function crmCatOptions(sel) { return CRM_CATS.map(function (c) { return "<option" + (c === sel ? " selected" : "") + ">" + esc(c) + "</option>"; }).join(""); }
  function vendorsForType(t) {
    if (!t) return [];
    var names = [t.name].concat(t.aliases || []).map(function (a) { return words(a).trim(); });
    return V.ents.filter(function (e) { return !e.overhead && e.stage !== "do_not_use" && e.rows.some(function (r) { return names.indexOf(words(r.category).trim()) >= 0; }); })
      .sort(function (a, b) { return (RANK[b.stage] || 0) - (RANK[a.stage] || 0) || a.name.localeCompare(b.name); });
  }
  function productType(p) { return p.category_id ? typeById(p.category_id) : null; }

  function categoriesHtml() {
    var h = "<div class='bar'><span class='vm-dim'>" + V.types.filter(function (t) { return t.active !== false; }).length + " product lines under the CRM’s " + CRM_CATS.length + " categories. Add a line, then link the products and vendors that belong on it.</span><div class='spacer'></div><button class='primary' data-vm='type-new'>Add a product line</button></div>";
    CRM_CATS.forEach(function (c) {
      var list = typesUnder(c);
      h += "<div class='vm-h3'>" + esc(c) + " <span class='vm-dim'>" + list.length + "</span></div>";
      h += list.length ? "<div class='panel tablewrap'><table class='vm-types'><colgroup><col style='width:28%'><col style='width:40%'><col style='width:10%'><col style='width:10%'><col style='width:12%'></colgroup><thead><tr><th>Product line</th><th>Also called</th><th class='vm-num'>Products</th><th class='vm-num'>Vendors</th><th></th></tr></thead><tbody>" + list.map(function (t) {
        var np = V.catalog.filter(function (p) { return String(p.category_id) === String(t.id); }).length;
        return "<tr" + (t.active === false ? " style='opacity:.55'" : "") + "><td><b>" + esc(t.name) + "</b>" + (t.active === false ? " <span class='chip'>Hidden</span>" : "") + (t.description ? "<div class='vm-dim'>" + esc(t.description) + "</div>" : "") + "</td>" +
          "<td class='vm-wrap'>" + esc((t.aliases || []).join(", ")) + "</td><td class='vm-num'>" + (np ? "<button class='linkbtn' data-vm='type-products' data-id='" + t.id + "'>" + np + "</button>" : "0") + "</td><td class='vm-num'>" + vendorsForType(t).length + "</td>" +
          "<td style='white-space:nowrap'><button class='ghost' data-vm='type-edit' data-id='" + t.id + "'>Edit</button> <button class='ghost' data-vm='type-merge' data-id='" + t.id + "'>Merge</button></td></tr>";
      }).join("") + "</tbody></table></div>" : "<p class='empty'>No product line in " + esc(c) + " yet. Add one, then link products and vendors to it.</p>";
    });
    return h;
  }
  function typeModal(t) {
    t = t || { name: "", crm_category: "Other", aliases: [], description: "", active: true };
    CRMHooks.openModal("<h2>" + (t.id ? "Edit product line" : "Add a product line") + "</h2>" +
      "<p>A product line groups products and the vendors who make them. The CRM category is where those products land on quotes and reports.</p>" +
      "<div class='fields'><div class='f wide'><label>Product line name</label><input id='tyName' value='" + esc(t.name) + "' placeholder='Steel strapping'></div>" +
      "<div class='f wide'><label>CRM category</label><select id='tyCrm'>" + crmCatOptions(t.crm_category) + "</select></div>" +
      "<div class='f wide'><label>Also called (comma between)</label><input id='tyAlias' value='" + esc((t.aliases || []).join(", ")) + "' placeholder='Steel banding, Metal strap'></div>" +
      "<div class='f wide'><label>Notes</label><input id='tyDesc' value='" + esc(t.description || "") + "'></div></div>" +
      (t.id ? "<label class='switch'><input type='checkbox' id='tyActive'" + (t.active !== false ? " checked" : "") + "> Show in pick lists</label>" : "") +
      "<div class='mactions'><button class='ghost' data-act='mclose'>Cancel</button><button class='primary' data-vm='type-save' data-id='" + (t.id || "") + "'>" + (t.id ? "Save" : "Add type") + "</button></div>");
  }
  async function saveType(id) {
    var name = val("tyName");
    if (!name) { CRMHooks.toast("Name the type."); return; }
    var dupe = V.types.filter(function (t) { return words(t.name).trim() === words(name).trim() && String(t.id) !== String(id); })[0];
    if (dupe) { CRMHooks.toast(dupe.name + " already exists."); return; }
    var row = { name: name, crm_category: val("tyCrm"), aliases: val("tyAlias").split(",").map(function (a) { return a.trim(); }).filter(Boolean), description: val("tyDesc") || null, updated_at: new Date().toISOString() };
    var act = document.getElementById("tyActive");
    if (act) row.active = act.checked;
    var saved;
    if (id) {
      var old = typeById(id);
      saved = await CRMDB.update("crm_product_categories", +id, row, "product type");
      if (!saved) return;
      if (old && old.name !== name) {
        /* Supplier-map rows use the type name; carry the rename over and keep the old name as an alias. */
        var rows = V.rows.filter(function (r) { return r.category === old.name; });
        for (var i = 0; i < rows.length; i++) await CRMDB.update("crm_vendors", rows[i].id, { category: name }, "vendor");
        if (row.aliases.indexOf(old.name) < 0) await CRMDB.update("crm_product_categories", +id, { aliases: row.aliases.concat([old.name]) }, "product type");
      }
      if (old && old.crm_category !== row.crm_category) {
        var prods = V.catalog.filter(function (p) { return String(p.category_id) === String(id); });
        for (var j = 0; j < prods.length; j++) await CRMDB.update("crm_products", prods[j].id, { category: row.crm_category }, "product");
      }
    } else {
      row.sort = (V.types.reduce(function (m, t) { return Math.max(m, t.sort || 0); }, 0) || 0) + 10;
      saved = await CRMDB.insert("crm_product_categories", row, "product type");
      if (!saved) return;
    }
    CRMHooks.closeModal();
    CRMHooks.toast(id ? "Type saved." : name + " added.");
    await load(); render();
    return saved;
  }
  function mergeModal(id) {
    var t = typeById(id);
    CRMHooks.openModal("<h2>Merge " + esc(t.name) + "</h2><p>Its products and supplier-map rows move to the type you pick, and " + esc(t.name) + " becomes another name for it.</p>" +
      "<div class='fields'><div class='f wide'><label>Merge into</label><select id='tyInto'>" + typeOptions("", false).replace("<option value='" + t.id + "'>" + esc(t.name) + "</option>", "") + "</select></div></div>" +
      "<div class='mactions'><button class='ghost' data-act='mclose'>Cancel</button><button class='primary' data-vm='type-merge-save' data-id='" + id + "'>Merge</button></div>");
  }
  async function mergeType(id) {
    var from = typeById(id), into = typeById(val("tyInto"));
    if (!into || String(into.id) === String(id)) { CRMHooks.toast("Pick a different type to merge into."); return; }
    var prods = V.catalog.filter(function (p) { return String(p.category_id) === String(id); });
    for (var i = 0; i < prods.length; i++) await CRMDB.update("crm_products", prods[i].id, { category_id: into.id, category: into.crm_category }, "product");
    var rows = V.rows.filter(function (r) { return r.category === from.name; });
    for (var j = 0; j < rows.length; j++) await CRMDB.update("crm_vendors", rows[j].id, { category: into.name }, "vendor");
    var al = (into.aliases || []).concat([from.name]).concat(from.aliases || []).filter(function (a, k, arr) { return arr.indexOf(a) === k; });
    await CRMDB.update("crm_product_categories", into.id, { aliases: al }, "product type");
    await CRMDB.remove("crm_product_categories", from.id, "product type");
    CRMHooks.closeModal();
    CRMHooks.toast(from.name + " merged into " + into.name + ".");
    await load(); render();
  }

  /* Add one product: type, unit, vendors who make it, QuickBooks item. */
  function productModal(presetType) {
    CRMHooks.openModal("<h2>Add product</h2><div class='fields'>" +
      "<div class='f wide'><label>Product name</label><input id='npName' placeholder='20 x 5000 x 63 ga cast stretch film'></div>" +
      "<div class='f wide'><label>Type</label><select id='npType'>" + typeOptions(presetType || "", true) + "</select></div>" +
      "<div class='f wide' id='npNewWrap' style='display:none'><label>New type name</label><input id='npNewName' placeholder='Steel strapping'><label style='margin-top:6px'>Under CRM category</label><select id='npNewCrm'>" + crmCatOptions("Other") + "</select></div>" +
      "<div class='f'><label>CRM category</label><input id='npCrm' readonly placeholder='Set by the type'></div>" +
      "<div class='f'><label>Unit</label><input id='npUnit' list='npUnits' placeholder='roll'><datalist id='npUnits'>" + UNITS.map(function (u) { return "<option value='" + u + "'>"; }).join("") + "</datalist></div>" +
      "<div class='f'><label>SKU</label><input id='npSku'></div><div class='f'><label>List price</label><input id='npPrice' inputmode='decimal'></div>" +
      "<div class='f wide'><label>Specs and notes</label><input id='npDesc' placeholder='Gauge, size, color, core, rolls per skid'></div>" +
      "<div class='f wide'><label>QuickBooks item id</label><input id='npQb' placeholder='Leave blank if it’s not in QuickBooks yet'></div>" +
      "<div class='f wide'><label>Vendors who make it</label><div id='npVendors' class='vm-checks'><span class='vm-dim'>Pick a type to see its vendors.</span></div></div></div>" +
      "<div class='mactions'><button class='ghost' data-act='mclose'>Cancel</button><button class='primary' data-vm='save-product'>Add product</button></div>");
    productModalType();
  }
  function productModalType() {
    var sel = document.getElementById("npType");
    if (!sel) return;
    var isNew = sel.value === "new";
    document.getElementById("npNewWrap").style.display = isNew ? "" : "none";
    var t = isNew ? null : typeById(sel.value);
    document.getElementById("npCrm").value = isNew ? val("npNewCrm") : t ? t.crm_category : "";
    var box = document.getElementById("npVendors");
    var list = vendorsForType(t);
    box.innerHTML = list.length ? list.slice(0, 30).map(function (e) {
      return "<label><input type='checkbox' data-np-vendor='" + e.key + "'> " + esc(e.name) + " <span class='vm-dim'>" + stageName(e.stage) + "</span></label>";
    }).join("") + "<span class='vm-dim'>Tick the ones that make this product. They become its quote vendors.</span>" : "<span class='vm-dim'>" + (t ? "No vendors on file for this type yet. Link them later from the product." : isNew ? "Link vendors after the type is created." : "Pick a type to see its vendors.") + "</span>";
  }
  async function saveProduct() {
    var name = val("npName");
    if (!name) { CRMHooks.toast("Name the product."); return; }
    if (V.catalog.some(function (c) { return itemKey(c.name) === itemKey(name); })) { CRMHooks.toast("That product is already in the catalog."); return; }
    var sel = val("npType"), t = null;
    if (sel === "new") {
      var nn = val("npNewName");
      if (!nn) { CRMHooks.toast("Name the new type."); return; }
      t = typeByName(nn);
      if (!t) {
        t = await CRMDB.insert("crm_product_categories", { name: nn, crm_category: val("npNewCrm"), aliases: [], sort: 999 }, "product type");
        if (!t) return;
        V.types.push(t);
      }
    } else t = typeById(sel);
    if (!t) { CRMHooks.toast("Pick a type."); return; }
    var price = val("npPrice");
    var p = await CRMDB.insert("crm_products", { name: name, category_id: t.id, category: t.crm_category, unit: val("npUnit") || null, sku: val("npSku") || null,
      default_price: price === "" ? null : +price.replace(/[$,]/g, ""), description: val("npDesc") || null, qbo_item_id: val("npQb") || null, active: true }, "product");
    if (!p) return;
    var picks = Array.prototype.slice.call(document.querySelectorAll("[data-np-vendor]:checked")).map(function (c) { return ent(c.dataset.npVendor); }).filter(Boolean);
    for (var i = 0; i < picks.length; i++) if (picks[i].primary) await CRMDB.insert("crm_vendor_products", { vendor_id: picks[i].primary.id, product_id: p.id, product: p.name, category: t.name }, "vendor product");
    CRMHooks.closeModal();
    CRMHooks.toast(name + " added" + (picks.length ? " with " + picks.length + " vendor" + (picks.length === 1 ? "" : "s") : "") + ".");
    await load(); render();
    openProduct(p.id);
  }

  /* Add many: paste from Excel or type one per line. */
  function bulkModal() {
    CRMHooks.openModal("<h2>Add many products</h2><p>One product per line. Paste straight from Excel, or separate with commas: <b>name, type, unit, SKU, price</b>. Only the name is required.</p>" +
      "<div class='fields'><div class='f wide'><textarea id='bkText' rows='9' placeholder='20 x 5000 x 63 ga cast stretch, Stretch wrap/film/hoods, roll&#10;48x40 4-way HT pallet, Pallets, each&#10;5/8 x 3000 woven cord strap, Strapping, roll, CS-58, 53.46'></textarea></div>" +
      "<div class='f wide'><label>Type for lines without one</label><select id='bkType'>" + typeOptions("", false) + "</select></div></div>" +
      "<p class='log' id='bkPreview'>Nothing pasted yet.</p>" +
      "<div class='mactions'><button class='ghost' data-act='mclose'>Cancel</button><button class='primary' data-vm='bulk-save'>Add products</button></div>");
  }
  function parseBulk() {
    var def = typeById(val("bkType"));
    var lines = (document.getElementById("bkText") || {}).value || "";
    var out = [], seen = {};
    lines.split(/\r?\n/).forEach(function (ln) {
      if (!ln.trim()) return;
      var parts = ln.indexOf("\t") >= 0 ? ln.split("\t") : ln.split(",");
      parts = parts.map(function (x) { return x.trim(); });
      var name = parts[0];
      if (!name || /^name$/i.test(name)) return;
      var t = parts[1] ? typeByName(parts[1]) : null;
      var why = parts[1] && !t ? "type “" + parts[1] + "” not found" : "";
      t = t || (parts[1] ? null : def) || typeGuess(name, null) || def;
      var k = itemKey(name);
      var dupe = seen[k] || V.catalog.some(function (c) { return itemKey(c.name) === k; });
      seen[k] = 1;
      var price = parts[4] ? +String(parts[4]).replace(/[$,]/g, "") : null;
      out.push({ name: name, type: t, unit: parts[2] || null, sku: parts[3] || null, price: isNaN(price) ? null : price, dupe: dupe, why: why });
    });
    return out;
  }
  function bulkPreview() {
    var rows = parseBulk(), el = document.getElementById("bkPreview");
    if (!el) return;
    if (!rows.length) { el.textContent = "Nothing pasted yet."; return; }
    var ok = rows.filter(function (r) { return !r.dupe && r.type; }).length;
    var dup = rows.filter(function (r) { return r.dupe; }).length;
    var noType = rows.filter(function (r) { return !r.dupe && !r.type; });
    el.innerHTML = "<b>" + ok + "</b> ready to add" + (dup ? ", " + dup + " already in the catalog (skipped)" : "") +
      (noType.length ? ", <span style='color:var(--warn)'>" + noType.length + " need a type</span>: " + esc(noType.slice(0, 3).map(function (r) { return r.name + (r.why ? " (" + r.why + ")" : ""); }).join("; ")) + ". Pick a type for lines without one." : ".");
  }
  async function bulkSave() {
    var rows = parseBulk().filter(function (r) { return !r.dupe && r.type; });
    if (!rows.length) { CRMHooks.toast("Nothing new to add."); return; }
    var n = 0;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (await CRMDB.insert("crm_products", { name: r.name, category_id: r.type.id, category: r.type.crm_category, unit: r.unit, sku: r.sku, default_price: r.price, active: true }, "product")) n++;
    }
    CRMHooks.closeModal();
    CRMHooks.toast(n + " product" + (n === 1 ? "" : "s") + " added.");
    await load(); render();
  }

  /* ---------- Products, top vendors and vendor quotes ---------- */
  var CATS = [
    [/corner|edge ?protect|angle ?board|kornerboard/, "corner"], [/shrink/, "shrink"],
    [/stretch|cast film|hand wrap|machine wrap|hooder|\bhood/, "stretch"], [/\bpoly\b|\bpoly[ -]|sheeting|tubing|pallet covers?|\bpor\b|top sheet/, "poly"], [/\bbags?\b|pouch/, "bag"],
    [/strap|banding|\bbands?\b|seals?\b/, "strap"], [/\btape/, "tape"], [/gaylord|\btotes?\b|\bibc/, "gaylord"], [/chip ?(board|pad)|slip ?sheet|tier ?sheet/, "chip"],
    [/pallet(?! cover)/, "pallet"], [/label/, "label"], [/corrugat|carton|\bbox/, "corrugated"], [/fibc|bulk bag/, "fibc"], [/lidding|laminat/, "lidding"]
  ];
  function catKeys(text) {
    var t = words(text), out = [];
    if (/shrink bag/.test(t)) return ["shrinkbag"];
    CATS.forEach(function (c) { if (c[0].test(t) && out.indexOf(c[1]) < 0) out.push(c[1]); });
    return out;
  }
  function sizeTokens(text) { return (words(text).match(/\d+(\.\d+)?\s*[x×]\s*\d+(\.\d+)?/g) || []).map(function (x) { return x.replace(/\s|×/g, "").replace("x", "x"); }); }
  function itemKey(text) { return words(text).trim(); }
  function itemFor(p) { return itemIndex().filter(function (r) { return r.key === itemKey(p.name); })[0] || null; }
  function vendorRowIdsForProduct(pid) { return V.vprod.filter(function (vp) { return String(vp.product_id) === String(pid); }).map(function (vp) { return String(vp.vendor_id); }); }
  function vendorsForProduct(pid) {
    var ids = vendorRowIdsForProduct(pid), out = [];
    V.ents.forEach(function (e) { if (rowIds(e).some(function (r) { return ids.indexOf(r) >= 0; })) out.push(e); });
    return out;
  }
  function openRfqCount() { return V.rfqs.filter(function (r) { return r.status === "open"; }).length; }
  function rfqVendors(rid) { return V.rfqv.filter(function (x) { return String(x.rfq_id) === String(rid); }); }
  function openRfqFor(o) {
    return V.rfqs.filter(function (r) {
      if (r.status === "closed") return false;
      if (o.lineId != null) return String(r.deal_line_id) === String(o.lineId);
      if (o.productId != null) return String(r.product_id) === String(o.productId) && r.status === "open";
      return false;
    })[0] || null;
  }
  function rfqChip(r) {
    if (r.status === "awarded") { var w = entByCompany(r.awarded_vendor_company_id); return "<span class='chip active'>Awarded" + (w ? ": " + esc(w.name) : "") + "</span>"; }
    if (r.status === "closed") return "<span class='chip'>Closed</span>";
    var vs = rfqVendors(r.id), back = vs.filter(function (x) { return x.status === "quoted"; }).length;
    if (!vs.length) return "<span class='chip warn'>Open</span>";
    return "<span class='chip warn'>" + back + " of " + vs.length + " quoted</span>";
  }
  function bestPrice(pid, name) {
    var key = itemKey(name), best = null;
    V.rfqs.forEach(function (r) {
      if (String(r.product_id) !== String(pid) && itemKey(r.item) !== key) return;
      rfqVendors(r.id).forEach(function (x) {
        if (x.unit_cost == null) return;
        if (!best || +x.unit_cost < best.cost) best = { cost: +x.unit_cost, vendor: x.vendor_name, date: (x.responded_at || "").slice(0, 10) };
      });
    });
    V.history.forEach(function (h) {
      if (h.unit_cost == null || (String(h.product_id) !== String(pid) && itemKey(h.item) !== key)) return;
      if (!best || +h.unit_cost < best.cost) best = { cost: +h.unit_cost, vendor: h.vendor_name || "", date: h.bought_on };
    });
    return best;
  }
  function lastCostFor(e, pid, key) {
    var hit = null;
    V.rfqs.forEach(function (r) {
      if (String(r.product_id) !== String(pid) && itemKey(r.item) !== key) return;
      rfqVendors(r.id).forEach(function (x) {
        if (x.unit_cost == null || String(x.vendor_company_id) !== String(e.companyId) || !e.companyId) return;
        if (!hit || String(x.responded_at) > String(hit.date)) hit = { cost: +x.unit_cost, date: String(x.responded_at || "").slice(0, 10) };
      });
    });
    return hit;
  }
  function vendorEmail(e) {
    var cs = e.companyId ? V.contacts.filter(function (c) { return String(c.company_id) === String(e.companyId) && c.email && /@/.test(c.email); }) : [];
    var pick = cs.filter(function (c) { return /sales|order|csr|customer/i.test((c.role || "") + " " + c.name); })[0] || cs[0];
    if (pick) return pick.email.trim();
    var m = String((e.primary || {}).contact || "").match(/[\w.+-]+@[\w-]+\.[\w.]+/);
    return m ? m[0] : "";
  }
  /* Rank every vendor for an item. Highest score first; each comes with the reasons. */
  function suggest(item, pid, category) {
    var prodRow = pid ? V.catalog.filter(function (c) { return String(c.id) === String(pid); })[0] : null;
    V.pickType = (prodRow && productType(prodRow)) || typeGuess(item, CRM_CATS.indexOf(category) >= 0 ? category : null) || typeByName(category);
    var key = itemKey(item), cats = catKeys(item + " " + (category || "")), sizes = sizeTokens(item);
    var linked = pid ? vendorRowIdsForProduct(pid) : [];
    var out = [];
    V.ents.forEach(function (e) {
      if (e.overhead || e.stage === "do_not_use") return;
      var score = 0, why = [], strong = false;
      var ids = rowIds(e);
      if (linked.some(function (x) { return ids.indexOf(x) >= 0; })) { score += 50; why.push("Makes this product"); strong = true; }
      var lines = e.companyId ? V.history.filter(function (h) { return String(h.vendor_company_id) === String(e.companyId) && (itemKey(h.item) === key || (pid && String(h.product_id) === String(pid))); }) : [];
      if (lines.some(isOrder)) { score += 40; why.push("Bought it from them before"); strong = true; }
      else if (lines.length) { score += 25; why.push("Quoted it with them before"); strong = true; }
      var lc = lastCostFor(e, pid, key);
      if (lc) { score += 20; why.push("Quoted us " + (canCost() ? money(lc.cost) : "a price") + (lc.date ? " on " + day(lc.date) : "")); strong = true; }
      var rowCats = [];
      e.rows.forEach(function (r) { catKeys(r.category || "").forEach(function (k) { if (rowCats.indexOf(k) < 0) rowCats.push(k); }); });
      var catHit = cats.filter(function (k) { return rowCats.indexOf(k) >= 0; });
      var ptype = V.pickType || null;
      var typeNames = ptype ? [ptype.name].concat(ptype.aliases || []).map(function (a) { return words(a).trim(); }) : [];
      var sameType = ptype && e.rows.some(function (r) { return typeNames.indexOf(words(r.category).trim()) >= 0; });
      var sameCrm = !sameType && category && e.rows.some(function (r) { var t = typeByName(r.category); return t && t.crm_category === category; });
      if (sameType) { score += 30; why.push("Supplies " + ptype.name); strong = true; }
      else if (sameCrm) { score += 15; why.push("Supplies " + category); strong = true; }
      else if (catHit.length) { score += 20; why.push("Supplies " + e.categories.join(", ")); strong = true; }
      if (!strong) return;
      var specs = words(e.rows.map(function (r) { return [r.products_specs, r.buy_summary, r.quote_summary].join(" "); }).join(" "));
      var sizeHit = sizes.filter(function (z) { return specs.replace(/\s/g, "").indexOf(z) >= 0; });
      if (sizeHit.length) { score += 10; why.push("Has run " + sizeHit[0]); }
      var st = { active: 15, approved: 10, vetting: 3, prospect: 0, dormant: -8 }[e.stage] || 0;
      score += st;
      if (e.stage === "active") why.push("Buying from now");
      if (e.use === "Utilize") { score += 12; why.push("Scorecard: Utilize"); }
      var warn = [];
      if (e.hold) { score -= 25; warn.push(e.hold); }
      if (e.use === "Replace") { score -= 40; warn.push("Replace: stop new orders"); }
      if (e.use === "Watch") warn.push("Watch: get a backup quote");
      if (e.watch && e.watch.watch_tone === "danger") warn.push(e.watch.watch_label);
      if (!e.companyId) warn.push("Not in the CRM yet");
      out.push({ e: e, score: score, why: why, warn: warn, email: vendorEmail(e), last: lc });
    });
    out.sort(function (a, b) { return b.score - a.score || a.e.name.localeCompare(b.e.name); });
    return out;
  }
  function lineById(id) { return V.history.filter(function (h) { return h.source === "order_line" && String(h.source_id) === String(id); })[0] || null; }
  function quoteLinesWithoutProduct() { return V.history.filter(function (h) { return h.source === "order_line" && !h.product_id && h.item; }); }

  /* Entry point for the rest of the CRM: a deal line, a product, or an existing request. */
  function openRfq(o) {
    var existing = o.rfqId ? V.rfqs.filter(function (r) { return String(r.id) === String(o.rfqId); })[0] : openRfqFor(o);
    if (existing) { rfqDrawer(existing); return; }
    var line = o.lineId != null ? lineById(o.lineId) : null;
    var prod = o.productId != null ? V.catalog.filter(function (p) { return String(p.id) === String(o.productId); })[0] : (line && line.product_id ? V.catalog.filter(function (p) { return String(p.id) === String(line.product_id); })[0] : null);
    var item = line ? line.item : prod ? prod.name : (o.item || "");
    var category = (line && line.category) || (prod && prod.category) || o.category || "";
    var list = suggest(item, prod ? prod.id : null, category);
    V.pick = { line: line, prod: prod, item: item, category: category, list: list, chosen: list.slice(0, 3).map(function (x) { return x.e.key; }) };
    pickDrawer();
  }
  function pickDrawer() {
    var P = V.pick, cost = canCost();
    var h = "<div class='dhead'><div style='flex:1'><div class='sub'>Get vendor quotes" + (P.line ? " for " + esc(P.line.customer_name || "") + ", deal #" + P.line.deal_id : "") + "</div><h2>" + esc(P.item) + "</h2>" +
      (P.line ? "<div class='sub'>" + num(P.line.qty) + " " + esc(P.line.unit || "") + (P.line.sell_price ? ", selling at " + money(P.line.sell_price) : "") + "</div>" : "") +
      "</div><button class='ghost' data-act='close'>Close</button></div><div class='dbody'>";
    if (!P.list.length) h += "<p class='banner'>No vendor on file matches this item yet. Link vendors to the product, or add a vendor with this category.</p>";
    h += "<div class='vm-h3'>Top picks</div><p class='log'>Ranked by: makes this product, bought or quoted it before, past prices, category, buying from them now, and scorecard. Holds and credit problems push a vendor down.</p>";
    h += "<div class='vm-picks'>" + P.list.slice(0, 3).map(function (x, i) { return pickCard(x, i + 1, true); }).join("") + "</div>";
    if (P.list.length > 3) h += "<div class='vm-h3'>Other vendors that fit</div><div class='vm-picks small'>" + P.list.slice(3, 12).map(function (x, i) { return pickCard(x, i + 4, false); }).join("") + "</div>";
    if (!cost) h += "<p class='banner'>Sending quote requests and seeing vendor prices is limited to reps and owners. Hand these picks to Landon or Rich.</p>";
    else h += "<div class='fields' style='margin-top:12px'><div class='f'><label>Quantity</label><input id='rfQty' value='" + esc(P.line ? (P.line.qty == null ? "" : P.line.qty) : "") + "'></div><div class='f'><label>Unit</label><input id='rfUnit' value='" + esc(P.line ? P.line.unit || "" : P.prod ? P.prod.unit || "" : "") + "'></div>" +
      "<div class='f'><label>Need quotes by</label><input id='rfBy' type='date'></div><div class='f wide'><label>Notes for vendors</label><textarea id='rfNotes' placeholder='Specs, ship-to, delivery date'></textarea></div></div>" +
      "<div class='mactions'><button class='primary' data-vm='rfq-create'>Request quotes from <span id='rfCount'>" + P.chosen.length + "</span> vendors</button></div>";
    CRMHooks.openDrawer(h + "</div>", true);
  }
  function pickCard(x, n, top) {
    var on = V.pick.chosen.indexOf(x.e.key) >= 0;
    return "<label class='vm-pick" + (on ? " on" : "") + "'><input type='checkbox' data-vm-pick='" + x.e.key + "'" + (on ? " checked" : "") + (canCost() ? "" : " disabled") + ">" +
      "<span class='n'>" + n + "</span><span style='flex:1;min-width:0'><b>" + esc(x.e.name) + "</b> <span class='vm-dim'>" + stageName(x.e.stage) + "</span>" +
      "<span class='vm-why'>" + x.why.map(function (w) { return "<span>" + esc(w) + "</span>"; }).join("") + x.warn.map(function (w) { return "<span class='bad'>" + esc(w) + "</span>"; }).join("") + "</span>" +
      "<span class='vm-dim'>" + (x.email ? esc(x.email) : "No email on file") + "</span></span></label>";
  }
  async function createRfq() {
    var P = V.pick;
    var picks = P.list.filter(function (x) { return P.chosen.indexOf(x.e.key) >= 0; });
    if (!picks.length) { CRMHooks.toast("Pick at least one vendor."); return; }
    var qty = val("rfQty");
    var r = await CRMDB.insert("crm_rfqs", {
      deal_id: P.line ? P.line.deal_id : null, deal_line_id: P.line ? P.line.source_id : null, product_id: P.prod ? P.prod.id : (P.line ? P.line.product_id : null),
      item: P.item, category: P.category || null, qty: qty === "" ? null : +qty, unit: val("rfUnit") || null, needed_by: val("rfBy") || null, notes: val("rfNotes") || null,
      status: "open", created_by: me()
    }, "quote request");
    if (!r) return;
    for (var i = 0; i < picks.length; i++) {
      var x = picks[i];
      await CRMDB.insert("crm_rfq_vendors", { rfq_id: r.id, vendor_company_id: x.e.companyId, vendor_row_id: x.e.primary ? x.e.primary.id : null, vendor_name: x.e.name, rank: i + 1, why: x.why.join("; "), status: "to_send", sent_to: x.email || null }, "quote request vendor");
    }
    if (P.line && P.line.deal_id) await CRMDB.insert("crm_activity", { deal_id: P.line.deal_id, kind: "note", note: "Vendor quotes requested for " + P.item + " from " + picks.map(function (x) { return x.e.name; }).join(", "), by_user: me(), at: new Date().toISOString(), source: "vendors" }, "activity");
    CRMHooks.toast("Quote request created. Email the vendors next.");
    await load();
    render();
    var fresh = V.rfqs.filter(function (z) { return String(z.id) === String(r.id); })[0] || r;
    rfqDrawer(fresh);
  }
  function rfqText(r) {
    var lines = ["Hi,", "", "Please quote the following for Driven Solutions:", "", "Item: " + r.item];
    if (r.qty) lines.push("Quantity: " + num(r.qty) + (r.unit ? " " + r.unit : ""));
    if (r.needed_by) lines.push("Quote needed by: " + day(r.needed_by));
    if (r.notes) lines.push("Notes: " + r.notes);
    lines.push("", "Please include unit price, freight to River Falls WI, MOQ, lead time, and how long the price holds.", "", "Thanks,", me(), "Driven Solutions");
    return lines.join("\n");
  }
  function mailto(to, bcc, r) {
    return "mailto:" + encodeURIComponent(to || "") + "?" + (bcc ? "bcc=" + encodeURIComponent(bcc) + "&" : "") + "subject=" + encodeURIComponent("Quote request: " + r.item.slice(0, 80)) + "&body=" + encodeURIComponent(rfqText(r));
  }
  function rfqDrawer(r) {
    V.openRfqId = r.id;
    var vs = rfqVendors(r.id), cost = canCost();
    var line = r.deal_line_id ? lineById(r.deal_line_id) : null;
    var sell = line ? line.sell_price : null, qty = +r.qty || (line ? +line.qty : 0) || 0;
    var landed = vs.map(function (x) { return x.unit_cost == null ? null : +x.unit_cost + (x.freight && qty ? +x.freight / qty : 0); });
    var best = null;
    landed.forEach(function (l, i) { if (l != null && vs[i].status === "quoted" && (best == null || l < landed[best])) best = i; });
    var h = "<div class='dhead'><div style='flex:1'><div class='sub'>Vendor quote request #" + r.id + (line ? ", " + esc(line.customer_name || "") + ", deal #" + line.deal_id : "") + "</div><h2>" + esc(r.item) + "</h2>" +
      "<div class='sub' style='display:flex;gap:6px;align-items:center;flex-wrap:wrap'>" + rfqChip(r) + (r.qty ? " " + num(r.qty) + " " + esc(r.unit || "") : "") + (r.needed_by ? ", quotes due " + day(r.needed_by) : "") + (sell ? ", selling at " + money(sell) : "") + "</div>" +
      "</div><button class='ghost' data-act='close'>Close</button></div><div class='dbody'>";
    if (!cost) return CRMHooks.openDrawer(h + "<p class='banner'>Vendor quotes and prices are limited to reps and owners.</p></div>", true);
    var unsent = vs.filter(function (x) { return x.status === "to_send"; });
    if (r.status === "open") {
      var emails = vs.map(function (x) { return x.sent_to; }).filter(Boolean);
      h += "<div class='bar' style='margin-bottom:10px'><a class='primary vm-btn' href='" + esc(mailto("", emails.join(","), r)) + "' data-vm-sendall='" + r.id + "'>Email all " + vs.length + " (BCC)</a>" +
        (unsent.length ? "<span class='vm-dim'>" + unsent.length + " not sent yet</span>" : "") + "<div class='spacer'></div><button class='ghost' data-vm='rfq-add' data-id='" + r.id + "'>Add a vendor</button><button class='ghost' data-vm='rfq-close' data-id='" + r.id + "'>Close request</button></div>";
    }
    h += "<div class='panel tablewrap'><table class='vm-rfq'><thead><tr><th>Vendor</th><th>Status</th><th class='vm-num'>Unit cost</th><th class='vm-num'>Freight (total)</th><th class='vm-num'>Landed / unit</th>" + (sell ? "<th class='vm-num'>Margin</th>" : "") + "<th></th></tr></thead><tbody>";
    h += vs.map(function (x, i) {
      var e = entByCompany(x.vendor_company_id) || entByRow(x.vendor_row_id);
      var dis = r.status !== "open" ? " disabled" : "";
      var mg = sell && landed[i] != null ? Math.round((1 - landed[i] / sell) * 100) : null;
      var won = r.awarded_response_id != null && String(r.awarded_response_id) === String(x.id);
      return "<tr class='" + (i === best && r.status === "open" ? "vm-best" : "") + (won ? " vm-won" : "") + "'><td><b>" + (e ? "<button class='linkbtn' data-vm='open' data-k='" + e.key + "'>" + esc(x.vendor_name) + "</button>" : esc(x.vendor_name)) + "</b>" +
        (won ? " <span class='chip active'>Awarded</span>" : i === best && r.status === "open" ? " <span class='chip active'>Best price</span>" : "") +
        "<div class='vm-dim'>" + (x.sent_to ? "<a href='" + esc(mailto(x.sent_to, "", r)) + "' data-vm-send='" + x.id + "'>" + esc(x.sent_to) + "</a>" : "No email on file") + "</div></td>" +
        "<td><select data-vm-rv='status' data-id='" + x.id + "'" + dis + ">" + [["to_send", "Not sent"], ["sent", "Sent"], ["quoted", "Quoted"], ["declined", "Declined"], ["no_response", "No answer"]].map(function (o) { return "<option value='" + o[0] + "'" + (x.status === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></td>" +
        "<td class='vm-num'><input class='vm-in' data-vm-rv='unit_cost' data-id='" + x.id + "' inputmode='decimal' value='" + esc(x.unit_cost == null ? "" : x.unit_cost) + "'" + dis + "></td>" +
        "<td class='vm-num'><input class='vm-in' data-vm-rv='freight' data-id='" + x.id + "' inputmode='decimal' placeholder='Total' value='" + esc(x.freight == null ? "" : x.freight) + "'" + dis + "></td>" +
        "<td class='vm-num'>" + (landed[i] != null ? money(landed[i]) : "") + "</td>" + (sell ? "<td class='vm-num'>" + (mg != null ? "<span class='" + (mg >= 25 ? "mg-good" : mg >= 15 ? "mg-mid" : "mg-bad") + "'>" + mg + "%</span>" : "") + "</td>" : "") +
        "<td>" + (r.status === "open" && x.unit_cost != null ? "<button class='primary' data-vm='rfq-award' data-id='" + x.id + "'>Award</button>" : "") + "</td></tr>" +
        "<tr class='vm-sub" + (i === best && r.status === "open" ? " vm-best" : "") + (won ? " vm-won" : "") + "'><td colspan='" + (sell ? 7 : 6) + "'><span class='vm-mini'>MOQ <input class='vm-in w' data-vm-rv='moq' data-id='" + x.id + "' value='" + esc(x.moq || "") + "'" + dis + "></span>" +
        "<span class='vm-mini'>Lead time <input class='vm-in w' data-vm-rv='lead_time' data-id='" + x.id + "' value='" + esc(x.lead_time || "") + "'" + dis + "></span>" +
        "<span class='vm-mini'>Price good until <input class='vm-in w' type='date' data-vm-rv='valid_until' data-id='" + x.id + "' value='" + esc(x.valid_until || "") + "'" + dis + "></span>" +
        "<span class='vm-mini'>Note <input class='vm-in w' style='width:200px' data-vm-rv='note' data-id='" + x.id + "' value='" + esc(x.note || "") + "'" + dis + "></span></td></tr>";
    }).join("") + "</tbody></table></div>";
    if (r.notes) h += "<p class='log'>Notes to vendors: " + esc(r.notes) + "</p>";
    if (r.status === "awarded") h += qbReady(r);
    else h += "<p class='log'>Type each vendor’s numbers in as they come back. Award writes the vendor and cost onto the deal line, links the vendor to the product, logs it on the vendor, and gets it ready for a QuickBooks PO.</p>";
    CRMHooks.openDrawer(h + "</div>", true);
  }
  function refreshRfq() {
    var d = document.getElementById("drawer");
    if (!V.openRfqId || !d || !d.querySelector(".vm-rfq")) return;
    var r = V.rfqs.filter(function (z) { return String(z.id) === String(V.openRfqId); })[0];
    if (r) rfqDrawer(r);
  }
  function qbReady(r) {
    var w = entByCompany(r.awarded_vendor_company_id);
    var prod = r.product_id ? V.catalog.filter(function (p) { return String(p.id) === String(r.product_id); })[0] : null;
    var line = r.deal_line_id ? lineById(r.deal_line_id) : null;
    var checks = [
      [!!line && line.vendor_company_id && w && String(line.vendor_company_id) === String(w.companyId), "Deal line has the vendor and cost", line ? "" : "No deal line on this request"],
      [!!(w && w.qb), "Vendor linked to QuickBooks", w && w.rows.length ? "<input class='vm-in w' data-vm-qb='" + w.key + "' placeholder='QB vendor id'>" : "Add a supplier profile first"],
      [!!(prod && prod.qbo_item_id), "Product linked to a QuickBooks item", prod ? "<input class='vm-in w' data-vm-prod='" + prod.id + "' placeholder='QB item id'>" : "<button class='linkbtn' data-vm='rfq-make-product' data-id='" + r.id + "'>Save as a product</button>"]
    ];
    var ready = checks.every(function (c) { return c[0]; });
    return "<div class='vm-h3'>QuickBooks</div><div class='panel'>" + checks.map(function (c) {
      return "<div class='task'><div class='tt'>" + (c[0] ? "<span class='chip active'>Done</span> " : "<span class='chip warn'>To do</span> ") + esc(c[1]) + (c[0] ? "" : "<div style='margin-top:6px'>" + c[2] + "</div>") + "</div></div>";
    }).join("") + "</div><p class='log'>" + (ready ? "Ready for a QuickBooks PO. The sync picks it up once it’s connected." : "Finish the to-dos so the PO lands on the right vendor and item when the sync runs.") + "</p>";
  }
  async function saveRv(el) {
    var id = +el.dataset.id, k = el.dataset.vmRv, v = el.value.trim();
    var patch = {};
    patch[k] = (k === "unit_cost" || k === "freight") ? (v === "" ? null : +v.replace(/[$,]/g, "")) : (v === "" ? null : v);
    if (k === "unit_cost" && v !== "") { patch.status = "quoted"; patch.responded_at = new Date().toISOString(); }
    if (k === "status" && v === "sent") patch.sent_at = new Date().toISOString();
    if (k === "status" && (v === "quoted" || v === "declined")) patch.responded_at = new Date().toISOString();
    var saved = await CRMDB.update("crm_rfq_vendors", id, patch, "vendor quote");
    if (!saved) return;
    var row = V.rfqv.filter(function (x) { return x.id === id; })[0];
    if (row) Object.assign(row, patch);
    var r = V.rfqs.filter(function (z) { return String(z.id) === String(row && row.rfq_id); })[0];
    if (r) rfqDrawer(r);
  }
  async function markSent(ids) {
    for (var i = 0; i < ids.length; i++) {
      var x = V.rfqv.filter(function (z) { return String(z.id) === String(ids[i]); })[0];
      if (!x || x.status !== "to_send") continue;
      var patch = { status: "sent", sent_at: new Date().toISOString() };
      if (await CRMDB.update("crm_rfq_vendors", x.id, patch, "vendor quote")) Object.assign(x, patch);
      var e = entByCompany(x.vendor_company_id);
      if (e && e.companyId) await CRMDB.insert("crm_activity", { company_id: e.companyId, kind: "email", note: "Quote request sent: " + (V.rfqs.filter(function (r) { return r.id === x.rfq_id; })[0] || {}).item, by_user: me(), at: new Date().toISOString(), source: "vendors" }, "activity");
    }
    setTimeout(async function () { await load(); render(); var r = V.rfqs.filter(function (z) { return String(z.id) === String(V.openRfqId); })[0]; if (r) rfqDrawer(r); }, 300);
  }
  async function award(rvId) {
    var x = V.rfqv.filter(function (z) { return String(z.id) === String(rvId); })[0];
    if (!x) return;
    var r = V.rfqs.filter(function (z) { return String(z.id) === String(x.rfq_id); })[0];
    var e = entByCompany(x.vendor_company_id) || entByRow(x.vendor_row_id);
    if (e && e.use === "Replace" && !window.confirm(e.name + " is Replace on the scorecard: stop new orders until reviewed. Award anyway?")) return;
    if (e && e.use === "Watch" && !rfqVendors(r.id).some(function (o) { return o.id !== x.id && o.unit_cost != null; }) && !window.confirm(e.name + " is Watch: use only with a backup quote, and no other vendor has quoted yet. Award anyway?")) return;
    if (e && !e.companyId) { var cid = await addToCrm(e); if (!cid) return; await load(); e = entByCompany(cid); x.vendor_company_id = cid; await CRMDB.update("crm_rfq_vendors", x.id, { vendor_company_id: cid }, "vendor quote"); }
    var ok = await CRMDB.update("crm_rfqs", r.id, { status: "awarded", awarded_vendor_company_id: e ? e.companyId : null, awarded_response_id: x.id, awarded_at: new Date().toISOString(), updated_at: new Date().toISOString() }, "quote request");
    if (!ok) return;
    if (r.deal_line_id && e) {
      await CRMDB.update("crm_deal_lines", r.deal_line_id, { vendor_id: e.companyId, vendor_price: x.unit_cost, freight: x.freight, product_id: r.product_id || undefined, updated_at: new Date().toISOString() }, "order line");
    }
    if (r.product_id && e && e.primary) {
      var link = V.vprod.filter(function (vp) { return String(vp.product_id) === String(r.product_id) && rowIds(e).indexOf(String(vp.vendor_id)) >= 0; })[0];
      if (!link) await CRMDB.insert("crm_vendor_products", { vendor_id: e.primary.id, product_id: r.product_id, product: r.item, category: r.category || e.primary.category, moq: x.moq, lead_time: x.lead_time, preferred: true }, "vendor product");
      else await CRMDB.update("crm_vendor_products", link.id, { preferred: true, moq: x.moq || link.moq, lead_time: x.lead_time || link.lead_time }, "vendor product");
    }
    if (e && e.companyId) await CRMDB.insert("crm_activity", { company_id: e.companyId, deal_id: r.deal_id, kind: "note", note: "Won the quote for " + r.item + " at " + money(x.unit_cost) + (r.qty ? " x " + num(r.qty) : ""), by_user: me(), at: new Date().toISOString(), source: "vendors" }, "activity");
    CRMHooks.toast((e ? e.name : x.vendor_name) + " awarded. Deal line updated.");
    await load(); render();
    rfqDrawer(V.rfqs.filter(function (z) { return z.id === r.id; })[0] || r);
  }
  async function closeRfq(id) {
    if (await CRMDB.update("crm_rfqs", +id, { status: "closed", updated_at: new Date().toISOString() }, "quote request")) { CRMHooks.toast("Request closed."); await load(); render(); CRMHooks.closeDrawer ? CRMHooks.closeDrawer() : null; }
  }
  function addVendorToRfq(id) {
    var r = V.rfqs.filter(function (z) { return String(z.id) === String(id); })[0];
    var have = rfqVendors(id).map(function (x) { return String(x.vendor_company_id || "r" + x.vendor_row_id); });
    var list = suggest(r.item, r.product_id, r.category).filter(function (x) { return have.indexOf(String(x.e.companyId || "r" + (x.e.primary || {}).id)) < 0; });
    var all = V.ents.filter(function (e) { return !e.overhead && e.stage !== "do_not_use"; }).sort(function (a, b) { return a.name.localeCompare(b.name); });
    CRMHooks.openModal("<h2>Add a vendor to this request</h2><div class='fields'><div class='f wide'><label>Vendor</label><select id='rfAdd'>" +
      (list.length ? "<optgroup label='Best fits'>" + list.slice(0, 8).map(function (x) { return "<option value='" + x.e.key + "'>" + esc(x.e.name) + "</option>"; }).join("") + "</optgroup>" : "") +
      "<optgroup label='Everyone'>" + all.map(function (e) { return "<option value='" + e.key + "'>" + esc(e.name) + "</option>"; }).join("") + "</optgroup></select></div></div>" +
      "<div class='mactions'><button class='ghost' data-act='mclose'>Cancel</button><button class='primary' data-vm='rfq-add-save' data-id='" + id + "'>Add</button></div>");
  }
  async function addVendorToRfqSave(id) {
    var e = ent(val("rfAdd"));
    if (!e) return;
    var n = rfqVendors(id).length + 1;
    await CRMDB.insert("crm_rfq_vendors", { rfq_id: +id, vendor_company_id: e.companyId, vendor_row_id: e.primary ? e.primary.id : null, vendor_name: e.name, rank: n, why: "Added by hand", status: "to_send", sent_to: vendorEmail(e) || null }, "quote request vendor");
    CRMHooks.closeModal();
    await load(); render();
    rfqDrawer(V.rfqs.filter(function (z) { return String(z.id) === String(id); })[0]);
  }
  async function saveLinesAsProducts(lines) {
    var made = 0;
    for (var i = 0; i < lines.length; i++) {
      var h = lines[i], key = itemKey(h.item);
      var p = V.catalog.filter(function (c) { return itemKey(c.name) === key; })[0];
      if (!p) {
        var gt = typeGuess(h.item, CRM_CATS.indexOf(h.category) >= 0 ? h.category : null);
        p = await CRMDB.insert("crm_products", { name: h.item.trim(), category: CRM_CATS.indexOf(h.category) >= 0 ? h.category : gt ? gt.crm_category : null, category_id: gt ? gt.id : null, unit: h.unit || null, active: true }, "product");
        if (!p) continue; V.catalog.push(p); made++;
      }
      await CRMDB.update("crm_deal_lines", h.source_id, { product_id: p.id }, "order line");
      var e = entByCompany(h.vendor_company_id);
      if (e && e.primary && !V.vprod.some(function (vp) { return String(vp.product_id) === String(p.id) && rowIds(e).indexOf(String(vp.vendor_id)) >= 0; })) {
        var vp = await CRMDB.insert("crm_vendor_products", { vendor_id: e.primary.id, product_id: p.id, product: p.name, category: p.category || e.primary.category }, "vendor product");
        if (vp) V.vprod.push(vp);
      }
    }
    return made;
  }

  /* Vendor quotes tab */
  function rfqListHtml() {
    var cost = canCost();
    var quoting = V.history.filter(function (h) { return h.source === "order_line" && !isOrder(h); });
    var h = "<div class='filters' style='margin-bottom:12px'><button data-vm='rfq-show' data-v='lines' aria-pressed='" + (V.rfqShow === "lines") + "'>Lines on quotes</button><button data-vm='rfq-show' data-v='open' aria-pressed='" + (V.rfqShow === "open") + "'>Open requests</button><button data-vm='rfq-show' data-v='done' aria-pressed='" + (V.rfqShow === "done") + "'>Awarded and closed</button></div>";
    if (V.rfqShow === "lines") {
      h += "<p class='lead'>Every line on a quote right now. Hit Get vendor quotes and the top 3 vendors for that item come up, ready to email.</p>";
      return h + "<div class='panel tablewrap'><table><thead><tr><th>Item</th><th>Customer</th><th>Deal</th><th class='vm-num'>Qty</th><th class='vm-num'>Sell</th><th>Vendor on the line</th>" + (cost ? "<th class='vm-num'>Cost</th>" : "") + "<th>Vendor quotes</th><th></th></tr></thead><tbody>" +
        (quoting.map(function (l) {
          var r = openRfqFor({ lineId: l.source_id });
          return "<tr><td class='vm-wrap'><b>" + esc(l.item || "") + "</b>" + (l.category ? "<div class='vm-dim'>" + esc(l.category) + "</div>" : "") + "</td><td>" + esc(l.customer_name || "") + "</td><td>#" + l.deal_id + "</td>" +
            "<td class='vm-num'>" + num(l.qty) + " " + esc(l.unit || "") + "</td><td class='vm-num'>" + money(l.sell_price) + "</td>" +
            "<td>" + (l.vendor_company_id ? vendorLink(l.vendor_company_id, l.vendor_name) : "<span class='chip warn'>None</span>") + "</td>" + (cost ? "<td class='vm-num'>" + (money(l.unit_cost) || "<span class='vm-dim'>none</span>") + "</td>" : "") +
            "<td>" + (r ? rfqChip(r) : "") + "</td><td>" + (r ? "<button class='ghost' data-vm='rfq-open' data-id='" + r.id + "'>Open request</button>" : "<button class='primary' data-vm='rfq-line' data-id='" + l.source_id + "'>Get vendor quotes</button>") + "</td></tr>";
        }).join("") || "<tr><td colspan='9' class='empty'>No lines on quotes right now.</td></tr>") + "</tbody></table></div>";
    }
    var list = V.rfqs.filter(function (r) { return V.rfqShow === "open" ? r.status === "open" : r.status !== "open"; });
    return h + "<div class='panel tablewrap'><table><thead><tr><th>#</th><th>Item</th><th>Customer</th><th>Asked</th><th>Status</th><th>Created</th></tr></thead><tbody>" +
      (list.map(function (r) {
        var line = r.deal_line_id ? lineById(r.deal_line_id) : null;
        return "<tr class='click' data-vm='rfq-open' data-id='" + r.id + "'><td>" + r.id + "</td><td class='vm-wrap'><b>" + esc(r.item) + "</b></td><td>" + esc(line ? line.customer_name : "") + "</td>" +
          "<td>" + rfqVendors(r.id).map(function (x) { return esc(x.vendor_name); }).join(", ") + "</td><td>" + rfqChip(r) + "</td><td>" + day(r.created_at) + (r.created_by ? ", " + esc(r.created_by) : "") + "</td></tr>";
      }).join("") || "<tr><td colspan='6' class='empty'>" + (V.rfqShow === "open" ? "No open requests. Start one from Lines on quotes or from a product." : "Nothing awarded or closed yet.") + "</td></tr>") + "</tbody></table></div>";
  }

  /* Product drawer */
  function openProduct(id) {
    var p = V.catalog.filter(function (c) { return String(c.id) === String(id); })[0];
    if (!p) return;
    V.openProductId = p.id;
    var cost = canCost(), it = itemFor(p), ents = vendorsForProduct(p.id);
    var h = "<div class='dhead'><div style='flex:1'><div class='sub'>Product</div><h2>" + esc(p.name) + "</h2></div><button class='ghost' data-act='close'>Close</button></div><div class='dbody'>";
    var best = cost ? bestPrice(p.id, p.name) : null;
    h += "<div class='vm-kv'><div><b>" + (it && it.order ? day(it.order.bought_on) : "Never") + "</b><span>Last ordered</span></div><div><b>" + (it && it.quote ? day(it.quote.bought_on) : "Never") + "</b><span>Last quoted</span></div>" +
      "<div><b>" + ents.length + "</b><span>Vendors linked</span></div>" + (cost ? "<div><b>" + (best ? money(best.cost) : "None") + "</b><span>Best vendor price" + (best ? ", " + esc(best.vendor) : "") + "</span></div>" : "") + "</div>";
    h += "<div class='bar'><button class='primary' data-vm='rfq-product' data-id='" + p.id + "'>Get vendor quotes</button></div>";
    var pt = productType(p);
    h += "<div class='fields'><div class='f'><label>Type</label><select data-vm-ptype='" + p.id + "'>" + typeOptions(p.category_id || "", false) + "</select></div>" +
      "<div class='f'><label>CRM category</label><input readonly value='" + esc(p.category || "") + "'></div></div>";
    h += "<div class='fields'>" + [["Name", "name", 1], ["SKU", "sku"], ["Unit", "unit"], ["List price", "default_price"], ["QuickBooks item id", "qbo_item_id"], ["Specs and notes", "description", 1]].map(function (f) {
      return "<div class='f" + (f[2] ? " wide" : "") + "'><label>" + f[0] + "</label><input data-vm-pf='" + f[1] + "' data-id='" + p.id + "' value='" + esc(p[f[1]] == null ? "" : p[f[1]]) + "'></div>";
    }).join("") + "</div>";
    h += "<div class='vm-h3'>Vendors who make it</div>" + (ents.length ? "<ul class='mini'>" + ents.map(function (e) {
      var link = V.vprod.filter(function (vp) { return String(vp.product_id) === String(p.id) && rowIds(e).indexOf(String(vp.vendor_id)) >= 0; })[0] || {};
      return "<li><button class='linkbtn' data-vm='open' data-k='" + e.key + "'>" + esc(e.name) + "</button>" + (link.preferred ? " <span class='chip active'>Preferred</span>" : "") +
        (link.moq ? ", MOQ " + esc(link.moq) : "") + (link.lead_time ? ", lead " + esc(link.lead_time) : "") + " <button class='linkbtn' data-vm='unlink-vp' data-id='" + link.id + "'>Unlink</button></li>";
    }).join("") + "</ul>" : "<p class='log'>No vendors linked yet.</p>");
    var others = V.ents.filter(function (e) { return e.primary && ents.indexOf(e) < 0 && !e.overhead; }).sort(function (a, b) { return a.name.localeCompare(b.name); });
    h += "<div class='addrow' style='grid-template-columns:1fr auto;margin-top:6px'><select id='lvSel'><option value=''>Link a vendor…</option>" + others.map(function (e) { return "<option value='" + e.key + "'>" + esc(e.name) + "</option>"; }).join("") + "</select><button class='ghost' data-vm='link-vp-any' data-id='" + p.id + "'>Link</button></div>";
    var sug = suggest(p.name, p.id, p.category).filter(function (x) { return ents.indexOf(x.e) < 0; }).slice(0, 5);
    if (sug.length) h += "<div class='vm-h3'>Could also make it</div><ul class='mini'>" + sug.map(function (x) {
      return "<li><button class='linkbtn' data-vm='open' data-k='" + x.e.key + "'>" + esc(x.e.name) + "</button> <span class='vm-dim'>" + esc(x.why.slice(0, 2).join(", ")) + "</span> " +
        (x.e.primary ? "<button class='ghost' data-vm='link-vp' data-k='" + x.e.key + "' data-id='" + p.id + "'>Link</button>" : "") + "</li>";
    }).join("") + "</ul>";
    var rq = V.rfqs.filter(function (r) { return String(r.product_id) === String(p.id); });
    if (rq.length && cost) h += "<div class='vm-h3'>Vendor quote history</div><div class='panel tablewrap'><table><thead><tr><th>Date</th><th>Vendor</th><th class='vm-num'>Unit cost</th><th>MOQ</th><th>Lead</th><th></th></tr></thead><tbody>" +
      rq.map(function (r) { return rfqVendors(r.id).filter(function (x) { return x.unit_cost != null; }).map(function (x) {
        return "<tr><td>" + day(x.responded_at || r.created_at) + "</td><td>" + esc(x.vendor_name) + "</td><td class='vm-num'>" + money(x.unit_cost) + "</td><td>" + esc(x.moq || "") + "</td><td>" + esc(x.lead_time || "") + "</td><td>" + (String(r.awarded_response_id) === String(x.id) ? "<span class='chip active'>Awarded</span>" : "") + "</td></tr>";
      }).join(""); }).join("") + "</tbody></table></div>";
    var lines = V.history.filter(function (h2) { return String(h2.product_id) === String(p.id) || itemKey(h2.item) === itemKey(p.name); });
    h += "<div class='vm-h3'>On quotes and orders</div>" + historyTable(lines, { vendor: true, customer: true });
    CRMHooks.openDrawer(h + "</div>", true);
  }
  async function setProductType(el) {
    var t = typeById(el.value), id = +el.dataset.vmPtype;
    var saved = await CRMDB.update("crm_products", id, { category_id: t ? t.id : null, category: t ? t.crm_category : null, updated_at: new Date().toISOString() }, "product");
    if (!saved) return;
    CRMHooks.toast(t ? "Type set. CRM category: " + t.crm_category + "." : "Type cleared.");
    await load(); openProduct(id);
  }
  async function saveProductField(el) {
    var id = +el.dataset.id, k = el.dataset.vmPf, v = el.value.trim();
    var patch = { updated_at: new Date().toISOString() };
    patch[k] = k === "default_price" ? (v === "" ? null : +v) : (v === "" ? null : v);
    if (k === "name" && !v) { CRMHooks.toast("A product needs a name."); return; }
    var saved = await CRMDB.update("crm_products", id, patch, "product");
    if (!saved) return;
    var p = V.catalog.filter(function (c) { return c.id === id; })[0];
    if (p) Object.assign(p, patch);
    CRMHooks.toast("Saved.");
  }

  /* ---------- Cleanup ---------- */
  function dupContacts() {
    var seen = {}, d = [];
    V.contacts.forEach(function (c) {
      var k = c.company_id + "|" + words(c.email || c.name).trim() + "|" + words(c.phone).replace(/\D/g, "");
      if (seen[k]) d.push(c); else seen[k] = 1;
    });
    return d;
  }
  function health() {
    var cost = canCost();
    var lines = V.history.filter(function (h) { return h.source === "order_line"; });
    var notInCrm = V.ents.filter(function (e) { return !e.companyId && (e.stage === "active" || e.stage === "approved"); });
    var blank = V.vcos.filter(function (c) { return !String(c.name || "").trim(); });
    var noProfile = V.ents.filter(function (e) { return e.companyId && !e.rows.length && !e.overhead && !(e.s.lines_bought > 0); });
    var junk = V.vprod.filter(junkProduct);
    var late = V.tasks.filter(function (t) { return !t.done && t.due && t.due < today(); });
    var noQb = V.ents.filter(function (e) { return e.stage === "active" && !e.qb && !e.overhead; });
    var list = [
      { id: "vendor", n: lines.filter(function (h) { return h.line_vendor_missing; }).length, title: "Order lines with no vendor", why: "They won’t show on any vendor’s history or in Find a product.", go: "orders" },
      { id: "nocrm", n: notInCrm.length, title: "Active vendors not in the CRM", why: "No contacts, calls or follow-ups can be tracked until they’re added.", ents: notInCrm },
      { id: "blank", n: blank.length, title: "Vendor company with no name", why: "It shows up blank on orders. The one on file holds Specialty Pallet + Crate’s contacts, so it’s likely a duplicate of SPC.", blank: blank },
      { id: "noprof", n: noProfile.length, title: "Vendor companies with no supplier profile", why: "Either a real supplier missing its specs, or an overhead vendor (marketing, utilities, rent) that belongs off the board.", ents: noProfile },
      { id: "dups", n: dupContacts().length, title: "Duplicate contacts", why: "Same person entered twice on the same vendor." },
      { id: "junk", n: junk.length, title: "Placeholder product rows", why: "The product is just the vendor’s name, with no specs, MOQ or lead time. They clutter backup searches." },
      { id: "late", n: late.length, title: "Overdue vendor follow-ups", why: "Past due and not checked off.", tasks: late },
      { id: "noqb", n: noQb.length, title: "Buying-from vendors with no QuickBooks id", why: "POs and bills can’t land on them when the sync runs.", go: "qb" },
      { id: "red", n: l10Issues().reds.length, title: "Replace vendors to review", why: "Stop new orders until Rich, Amber or Annie review them.", go: "sourcing" },
      { id: "due", n: l10Issues().due.length, title: "Vendors due a scorecard rating", why: "Never rated, or the last rating is over a quarter old.", go: "sourcing" },
      { id: "verify", n: V.rows.filter(function (r) { return r.verify_flag && !r.verified_at; }).length, title: "Supplier rows flagged to verify", why: "Vet before quoting or using.", go: "sourcing" }
    ];
    if (cost) list.splice(1, 0, { id: "cost", n: lines.filter(function (h) { return h.unit_cost == null; }).length, title: "Lines with no vendor cost", why: "Margin, spend and last cost stay blank until the vendor price is on the line. Enter it in Purchase history.", go: "orders" });
    return list;
  }
  function cleanupHtml() {
    var items = health();
    var open = items.filter(function (x) { return x.n > 0; });
    var h = "<div class='stats'><div class='stat'><b>" + open.length + "</b><span>Things to fix</span></div><div class='stat'><b>" + (items.length - open.length) + "</b><span>Clean</span></div></div>";
    h += "<div class='panel'>" + items.map(function (x) {
      var body = "";
      if (x.n && x.ents) body = "<ul class='mini' style='margin-top:6px'>" + x.ents.map(function (e) {
        return "<li><button class='linkbtn' data-vm='open' data-k='" + e.key + "'>" + esc(e.name) + "</button> " +
          (x.id === "nocrm" ? "<button class='ghost' data-vm='to-crm' data-k='" + e.key + "'>Add to the CRM</button>"
            : "<button class='ghost' data-vm='add-profile' data-k='" + e.key + "'>Add supplier profile</button> <button class='ghost' data-vm='overhead' data-k='" + e.key + "'>Overhead, take off the board</button>") + "</li>";
      }).join("") + "</ul>";
      if (x.n && x.blank) body = x.blank.map(function (c) {
        return "<div class='addrow' style='grid-template-columns:2fr auto;margin-top:6px'><input id='rn-" + c.id + "' placeholder='Name this company'><button class='ghost' data-vm='rename' data-id='" + c.id + "'>Save name</button></div>";
      }).join("");
      if (x.n && x.tasks) body = "<div style='margin-top:6px'>" + taskList(x.tasks.map(function (t) {
        var e = entByCompany(t.company_id);
        return Object.assign({}, t, { title: (e ? e.name + ": " : "") + t.title });
      })) + "</div>";
      var btn = "";
      if (x.n && x.go) btn = "<button class='ghost' data-vm='go' data-v='" + x.go + "'>Open</button>";
      if (x.n && x.id === "dups") btn = "<button class='ghost' data-vm='dedupe'>Remove " + x.n + " duplicates</button>";
      if (x.n && x.id === "junk") btn = "<button class='ghost' data-vm='clear-junk'>Clear " + x.n + " placeholder rows</button>";
      return "<div class='task'><div class='tt'><b>" + esc(x.title) + "</b> " + (x.n ? "<span class='chip warn'>" + x.n + "</span>" : "<span class='chip active'>Clean</span>") +
        "<div class='log'>" + esc(x.why) + "</div>" + body + "</div>" + btn + "</div>";
    }).join("") + "</div>";
    return h;
  }
  async function dedupe() {
    var d = dupContacts();
    for (var i = 0; i < d.length; i++) await CRMDB.remove("crm_contacts", d[i].id, "contact");
    CRMHooks.toast("Removed " + d.length + " duplicate contacts.");
    await reload(false);
  }
  async function clearJunk() {
    var j = V.vprod.filter(junkProduct);
    for (var i = 0; i < j.length; i++) await CRMDB.remove("crm_vendor_products", j[i].id, "vendor product");
    CRMHooks.toast("Cleared " + j.length + " placeholder rows.");
    await reload(false);
  }
  async function markOverhead(e) {
    var co = V.vcos.filter(function (c) { return String(c.id) === String(e.companyId); })[0] || {};
    var custom = Object.assign({}, co.custom || {}, { vendor_type: "overhead" });
    var saved = await CRMDB.update("crm_companies", e.companyId, { custom: custom }, "company");
    if (!saved) return;
    CRMHooks.toast(e.name + " marked overhead. Find it under Vendors, Overhead vendors.");
    await reload(false);
  }
  async function renameCompany(id) {
    var name = val("rn-" + id);
    if (!name) { CRMHooks.toast("Type a name."); return; }
    var saved = await CRMDB.update("crm_companies", +id, { name: name }, "company");
    if (!saved) return;
    CRMHooks.toast("Renamed.");
    await reload(false);
  }
  async function setLineCost(el) {
    var v = el.value.trim();
    var saved = await CRMDB.update("crm_deal_lines", +el.dataset.vmCost, { vendor_price: v === "" ? null : +v, updated_at: new Date().toISOString() }, "order line");
    if (!saved) return;
    CRMHooks.toast("Vendor cost saved.");
    await reload(false);
  }

  /* ---------- writes ---------- */
  async function addToCrm(e) {
    if (e.companyId) return e.companyId;
    var dupe = CRMHooks.companies().filter(function (c) { return words(c.name).trim() === words(e.name).trim(); })[0];
    var co = dupe;
    if (!co) {
      co = await CRMDB.insert("crm_companies", { name: e.name, kind: "vendor", owner: me() || null, notes: (e.primary && e.primary.products_specs) || null }, "vendor company");
      if (!co) return null;
    } else if (dupe.kind !== "vendor") {
      CRMHooks.toast(e.name + " is already in the CRM as a " + dupe.kind + ". Linked to it.");
    }
    for (var i = 0; i < e.rows.length; i++) await CRMDB.update("crm_vendors", e.rows[i].id, { company_id: co.id, updated_at: new Date().toISOString() }, "vendor");
    if (e.primary && e.primary.contact) {
      await CRMDB.insert("crm_contacts", { company_id: co.id, name: String(e.primary.contact).split(/[,;\n]/)[0].trim().slice(0, 120), role: "From supplier map" }, "contact");
    }
    await logChange(e, "Added to the CRM");
    return co.id;
  }

  async function setStage(key, stage) {
    var e = ent(key);
    if (!e || e.stage === stage) return;
    if (!e.rows.length) {
      var p = await CRMDB.insert("crm_vendors", { supplier: e.name, company_id: e.companyId, stage: stage, active: stage === "active" }, "vendor");
      if (!p) return;
    } else {
      for (var i = 0; i < e.rows.length; i++) {
        await CRMDB.update("crm_vendors", e.rows[i].id, { stage: stage, active: stage === "active", updated_at: new Date().toISOString() }, "vendor");
      }
    }
    if ((stage === "approved" || stage === "active") && !e.companyId) {
      await addToCrm(e);
      CRMHooks.toast(e.name + " moved to " + stageName(stage) + " and added to the CRM.");
    } else CRMHooks.toast(e.name + " moved to " + stageName(stage) + ".");
    if (e.companyId) {
      await CRMDB.insert("crm_activity", { company_id: e.companyId, kind: "stage", note: "Vendor stage: " + stageName(e.stage) + " to " + stageName(stage), by_user: me(), at: new Date().toISOString(), source: "vendors" }, "activity");
    }
    await logChange(e, "Stage " + e.stage + " to " + stage);
    var wasKey = key;
    await load();
    render();
    if (V.openKey === wasKey) {
      var moved = V.byKey[wasKey] || entByRow(e.rows[0] && e.rows[0].id);
      if (moved) openEnt(moved.key);
    }
  }

  async function logChange(e, what) {
    await CRMDB.insert("crm_vendor_changes", { changed_on: today(), supplier: e.name, vendor_id: e.primary ? e.primary.id : null, what_changed: what + " (" + me() + ")", source: "CRM vendors" }, "vendor change");
  }

  async function logActivity(e) {
    var note = val("vaNote");
    if (!note) { CRMHooks.toast("Say what happened."); return; }
    var kind = val("vaKind") || "note", who = val("vaWho");
    var saved = await CRMDB.insert("crm_activity", { company_id: e.companyId, kind: kind, note: (who ? who + ": " : "") + note, by_user: me(), at: new Date().toISOString(), source: "vendors" }, "activity");
    if (!saved) return;
    if (kind !== "note") await CRMDB.update("crm_companies", e.companyId, { last_contact_at: today() }, "company");
    var due = val("vaDue");
    if (due) await CRMDB.insert("crm_tasks", { company_id: e.companyId, title: "Follow up with " + e.name + ": " + note.slice(0, 80), due: due, assignee: val("vaAssign") || me(), done: false }, "follow-up");
    CRMHooks.toast(due ? "Logged. Follow-up set for " + day(due) + "." : "Logged.");
    await reload(true);
  }

  async function addTask(e) {
    var title = val("vtTitle");
    if (!title) { CRMHooks.toast("Say what to follow up on."); return; }
    var saved = await CRMDB.insert("crm_tasks", { company_id: e.companyId, title: title, due: val("vtDue") || null, assignee: val("vtWho") || me(), done: false }, "follow-up");
    if (!saved) return;
    CRMHooks.toast("Follow-up added.");
    await reload(true);
  }

  async function addContact(e) {
    var name = val("vcName");
    if (!name) { CRMHooks.toast("Add a name."); return; }
    var saved = await CRMDB.insert("crm_contacts", { company_id: e.companyId, name: name, role: val("vcRole") || null, email: val("vcEmail") || null, phone: val("vcPhone") || null }, "contact");
    if (!saved) return;
    CRMHooks.toast("Contact added.");
    await reload(true);
  }

  async function addProfile(e) {
    var saved = await CRMDB.insert("crm_vendors", { supplier: e.name, company_id: e.companyId, stage: e.stage, active: e.stage === "active" }, "supplier profile");
    if (!saved) return;
    V.detailTab = "record";
    await reload(true);
  }

  function newVendor() {
    CRMHooks.openModal("<h2>Add vendor</h2><div class='fields'><div class='f wide'><label>Vendor name</label><input id='nvName'></div>" +
      "<div class='f'><label>Category</label><input id='nvCat' list='nvCats'><datalist id='nvCats'>" + opts(V.rows.map(function (v) { return v.category; })).map(function (c) { return "<option value='" + esc(c) + "'>"; }).join("") + "</datalist></div>" +
      "<div class='f'><label>Stage</label><select id='nvStage'>" + STAGES.map(function (s) { return "<option value='" + s[0] + "'>" + s[1] + "</option>"; }).join("") + "</select></div>" +
      "<div class='f'><label>Location</label><input id='nvLoc'></div><div class='f'><label>Contact</label><input id='nvContact' placeholder='Name, email or phone'></div>" +
      "<div class='f wide'><label>What they make</label><textarea id='nvSpecs'></textarea></div></div>" +
      "<p class='log'>Approved and Buying from vendors go straight into the CRM. Prospects stay on the supplier map until you move them.</p>" +
      "<div class='mactions'><button class='ghost' data-act='mclose'>Cancel</button><button class='primary' data-vm='save-vendor'>Add vendor</button></div>");
  }
  async function saveVendor() {
    var name = val("nvName");
    if (!name) { CRMHooks.toast("Add a vendor name."); return; }
    var dupe = V.ents.filter(function (e) { return words(e.name).trim() === words(name); })[0];
    if (dupe) { CRMHooks.closeModal(); CRMHooks.toast(dupe.name + " is already here."); openEnt(dupe.key); return; }
    var stage = val("nvStage") || "prospect";
    var row = await CRMDB.insert("crm_vendors", { supplier: name, category: val("nvCat") || null, location: val("nvLoc") || null, contact: val("nvContact") || null, products_specs: val("nvSpecs") || null, stage: stage, active: stage === "active", status: stageName(stage) }, "vendor");
    if (!row) return;
    CRMHooks.closeModal();
    await load();
    var e = entByRow(row.id);
    if (e && (stage === "approved" || stage === "active")) { await addToCrm(e); await load(); e = entByRow(row.id); }
    render();
    CRMHooks.toast("Vendor added.");
    V.detailTab = "overview";
    if (e) openEnt(e.key);
  }

  async function saveField(el) {
    var id = el.dataset.id;
    var row = V.rows.filter(function (r) { return String(r.id) === String(id); })[0];
    if (!row) return;
    var key = el.dataset.vmField, v = el.value.trim();
    if (key === "miles_from_river_falls") v = v === "" ? null : +v;
    if (v === "") v = null;
    if (row[key] === v) return;
    var patch = { updated_at: new Date().toISOString() };
    patch[key] = v;
    var saved = await CRMDB.update("crm_vendors", row.id, patch, "vendor");
    if (!saved) return;
    row[key] = v;
    if (key === "qb_vendor_id" || key === "terms" || key === "hold_status") {
      await CRMDB.insert("crm_vendor_changes", { changed_on: today(), supplier: row.supplier, vendor_id: row.id, what_changed: key + " set to " + (v == null ? "blank" : v) + " (" + me() + ")", source: "CRM vendors" }, "vendor change");
    }
    build();
    CRMHooks.toast("Saved.");
  }
  async function saveQb(el) {
    var e = ent(el.dataset.vmQb);
    if (!e) return;
    var v = el.value.trim() || null;
    for (var i = 0; i < e.rows.length; i++) await CRMDB.update("crm_vendors", e.rows[i].id, { qb_vendor_id: v, updated_at: new Date().toISOString() }, "vendor");
    await logChange(e, "QuickBooks vendor id set to " + (v || "blank"));
    CRMHooks.toast("Saved.");
    await load();
    refreshRfq();
  }
  async function setLineVendor(el) {
    if (!el.value) return;
    var saved = await CRMDB.update("crm_deal_lines", +el.dataset.vmLine, { vendor_id: +el.value, updated_at: new Date().toISOString() }, "order line");
    if (!saved) return;
    CRMHooks.toast("Vendor set on the order line.");
    await reload(false);
  }
  async function setProductQb(el) {
    var saved = await CRMDB.update("crm_products", +el.dataset.vmProd, { qbo_item_id: el.value.trim() || null, updated_at: new Date().toISOString() }, "product");
    if (!saved) return;
    CRMHooks.toast("Saved.");
    await load();
    refreshRfq();
  }
  async function doneTask(el) {
    var saved = await CRMDB.update("crm_tasks", +el.dataset.vmTask, { done: true }, "follow-up");
    if (!saved) return;
    CRMHooks.toast("Follow-up done.");
    await reload(true);
  }
  async function markVerified(id) {
    var row = V.rows.filter(function (r) { return String(r.id) === String(id); })[0];
    if (!row) return;
    var note = val("vn-" + id);
    if (!note) { CRMHooks.toast("Say what you checked first."); return; }
    var saved = await CRMDB.update("crm_vendors", row.id, { verified_at: new Date().toISOString(), verified_by: me(), verify_note: note }, "verification");
    if (!saved) return;
    await CRMDB.insert("crm_vendor_changes", { changed_on: today(), supplier: row.supplier, vendor_id: row.id, what_changed: "Marked verified. " + note, source: "CRM verify queue" }, "vendor change");
    CRMHooks.toast(row.supplier + " verified.");
    await reload(false);
  }
  async function addVendorProduct(e) {
    var name = val("vpName");
    if (!name) { CRMHooks.toast("Name the product."); return; }
    var saved = await CRMDB.insert("crm_vendor_products", { vendor_id: e.primary.id, product: name, specs: val("vpSpecs") || null, moq: val("vpMoq") || null, lead_time: val("vpLead") || null, category: e.primary.category || null }, "vendor product");
    if (saved) await reload(true);
  }
  async function addVendorCustomer(e) {
    var sel = document.getElementById("vcCo");
    var co = sel && sel.value ? CRMHooks.companies().filter(function (c) { return String(c.id) === sel.value; })[0] : null;
    if (!co) { CRMHooks.toast("Choose the customer."); return; }
    var saved = await CRMDB.insert("crm_vendor_customers", { vendor_id: e.primary.id, company_id: co.id, customer_name: co.name, feeds: val("vcFeeds") || null }, "vendor customer");
    if (saved) await reload(true);
  }
  async function saveScore(e) {
    if (!canRate()) { CRMHooks.toast("Ratings are done by Rich, Amber and Annie."); return; }
    function n(k) { var el = document.querySelector("input[name='sc-" + k + "']:checked"); return el ? +el.value : null; }
    var row = { vendor_id: e.primary.id, values_fit: n("values"), delivery_speed: n("speed"), communication: n("comm"), notes: val("sc-notes") || null, rated_by: me(), rated_at: new Date().toISOString() };
    if (row.values_fit == null || row.delivery_speed == null || row.communication == null) { CRMHooks.toast("Give all three a score."); return; }
    var saved = await CRMDB.insert("crm_vendor_scores", row, "vendor score");
    if (!saved) return;
    var badge = utilize(row);
    if (e.companyId) await CRMDB.insert("crm_activity", { company_id: e.companyId, kind: "note", note: "Scorecard " + badge.toLowerCase() + ": values " + row.values_fit + ", speed " + row.delivery_speed + ", communication " + row.communication + (row.notes ? ". " + row.notes : ""), by_user: me(), at: row.rated_at, source: "vendors" }, "activity");
    CRMHooks.toast("Rated " + BADGE[badge] + ".");
    await reload(true);
  }
  async function linkPo(id) {
    var box = document.getElementById("poDeal-" + id);
    var saved = await CRMDB.update("crm_vendor_pos", +id, { deal_id: box && box.value ? +box.value : null }, "purchase order");
    if (!saved) return;
    if (window.CRMSupply) await CRMSupply.load();
    openEnt(V.openKey);
  }


  var WHY = {
    board: "Good vendors protect our margins, on-time delivery, and the promises we make to customers.",
    list: "This is the list the team buys from. If a vendor is not here, do not quote them.",
    find: "Search what we have bought before asking a vendor to quote something new.",
    rfq: "Backups mean no single vendor can stall an order.",
    orders: "Purchase history is who we really buy from, not just who is on a list.",
    catalog: "Product lines keep quotes and orders using the same names, so a backup is easy to find.",
    qb: "The vendor we pay in QuickBooks has to be the vendor on the order.",
    sourcing: "Scorecards keep us honest and catch problems before customers feel them.",
    cleanup: "A clean list is the only list the team will trust.",
    training: "Everyone adds a vendor, a product line, and a rating the same way."
  };
  function whyLine(key) { return WHY[key] ? "<p class='lead vm-whyline'>" + WHY[key] + "</p>" : ""; }
  function videoSrc() {
    return (V.videoUrl && /^https?:\/\//.test(V.videoUrl)) ? V.videoUrl : INTRO_VIDEO;
  }
  function videoBlock(where) {
    var src = videoSrc();
    var h = "<div class='vm-video' id='vmIntro'><div class='vm-h3'>Intro</div>";
    h += "<p class='log'>Why vendor management matters, and how to use this portal. About a minute.</p>";
    h += "<video controls preload='metadata' playsinline aria-label='Driven vendor portal intro'><source src='" + esc(src) + "' type='video/mp4'></video>";
    if (full() && where === "training") {
      h += "<div class='fields' style='margin-top:10px'><div class='f wide'><label>Different video link (owners). Leave blank to keep this intro.</label><input id='vmVideoUrl' placeholder='https://' value='" + esc(V.videoUrl || "") + "'></div></div>";
      h += "<button class='ghost' data-vm='save-video'>Save video link</button>";
    }
    return h + "</div>";
  }
  function homeIntro() {
    var h = videoBlock("home");
    h += "<div class='banner'><b>Why vendor management matters.</b> The vendor we pick decides whether the customer gets what we promised, on time, at a margin we can live with. Utilize means keep using them. Watch means get a backup quote. Replace means stop new orders until reviewed.</div>";
    if (!V.rows.length) h += "<div class='vm-ask'><label>No vendors yet</label><p class='log'>Add the first one. Prospects stay on this board until you move them to Approved or Buying from, which also adds them to the CRM.</p></div>";
    return h;
  }
  function performanceBlock(e) {
    var lines = [];
    var turns = V.rfqv.filter(function (x) {
      return e.companyId && String(x.vendor_company_id) === String(e.companyId) && x.sent_at && x.responded_at;
    });
    if (turns.length) {
      var days = turns.map(function (x) { return Math.max(0, (new Date(x.responded_at) - new Date(x.sent_at)) / 864e5); });
      var avg = days.reduce(function (a, b) { return a + b; }, 0) / days.length;
      var rounded = Math.round(avg);
      lines.push("Quote turnaround on file: about " + (avg < 1 ? "less than a day" : rounded + " day" + (rounded === 1 ? "" : "s")) + " from send to reply (" + turns.length + "). Use that when you score communication and speed.");
    } else lines.push("No quote turnaround yet. When a quote is sent and the reply is logged, the days show here.");
    var pos = [];
    if (window.CRMSupply && CRMSupply.posForVendor) e.rows.forEach(function (r) { pos = pos.concat(CRMSupply.posForVendor(r.id) || []); });
    var dated = pos.filter(function (p) { return p.promised_on && p.received_on; });
    var late = dated.filter(function (p) { return String(p.received_on) > String(p.promised_on); });
    if (late.length) lines.push(late.length + " of " + dated.length + " purchase orders with both dates arrived after the promised date. That should pull delivery speed down on the next rating.");
    else if (dated.length) lines.push(dated.length + " purchase orders with a promised date and a received date arrived on time.");
    else if (pos.length) lines.push(pos.length + " purchase orders on file. None have both a promised date and a received date, so lateness is not scored yet.");
    else lines.push("No purchase orders on file yet, so delivery lateness is not scored from POs.");
    var risky = V.quotes.filter(function (x) { return rowIds(e).indexOf(String(x.vendor_id)) >= 0 && x.note_tone === "risk"; });
    if (risky.length) lines.push(risky.length + " open sourcing note" + (risky.length === 1 ? " is" : "s are") + " flagged as a risk.");
    return "<div class='vm-h3'>Tracked performance</div><ul class='mini'>" + lines.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>";
  }
  async function saveVideo() {
    if (!full() || !window.CRMDB) return;
    var url = val("vmVideoUrl");
    var saved = await CRMDB.db.from("crm_vendor_portal_settings").upsert({ id: 1, intro_video_url: url || null, updated_at: new Date().toISOString() });
    if (saved.error) { CRMHooks.toast("Could not save the video link. Apply the vendor portal migration."); return; }
    V.videoUrl = url;
    CRMHooks.toast(url ? "Video link saved." : "Using the intro video that ships with the portal.");
    render();
  }
  function trainingHtml() {
    var h = videoBlock("training");
    h += "<div class='banner'><b>Why vendor management matters.</b> A weak vendor shows up as a late delivery, a bad margin, or a customer we have to call back. This portal is the list we buy from, the score that says keep or replace, and the backup when one vendor slips.</div>";
    h += "<div class='vm-h3'>How to add a vendor</div><ol class='vm-steps'><li>Choose Add vendor. Name them, pick a product line if you know it, and set the stage.</li><li>Prospect and Vetting stay on the supplier map.</li><li>Approved and Buying from also create the CRM company, so calls and follow-ups show on the Follow-ups tab.</li><li>Open the vendor and fill the profile. Owners enter terms and last price. Setters do not see those fields.</li></ol>";
    h += "<div class='vm-h3'>How to add a product line</div><ol class='vm-steps'><li>Open Product lines. Under the search box, choose Product lines, then Add a product line.</li><li>Name the line and pick the CRM category it belongs under. The category list itself stays fixed.</li><li>Add products on that line, and link the vendors who make them. The link is stored on the vendor product row.</li></ol>";
    h += "<div class='vm-h3'>How to rate a vendor</div><ol class='vm-steps'><li>Open the vendor and choose Scorecard. Rich, Amber, and Annie can save a rating.</li><li>Score values fit, delivery speed, and communication from 1 to 5. Saving adds a new row. Older ratings stay.</li><li>The latest row is the decision. Arrows show whether each score moved versus the previous rating.</li><li>Read Tracked performance beside the scores. Quote turnaround and late POs are there when the dates exist. They do not replace the three scores.</li></ol>";
    h += "<div class='vm-h3'>How to read the scorecard</div><ul class='vm-steps'><li><b>Utilize</b> means all three scores are 4 or 5. Keep using them.</li><li><b>Watch</b> means any score is a 3, and none are 1 or 2. Use them only with a backup quote.</li><li><b>Replace</b> means any score is 1 or 2. Stop new orders until reviewed.</li><li><b>Not rated</b> means there is no complete rating yet.</li></ul>";
    h += "<div class='vm-h3'>Where this fits quote to order</div><ol class='vm-steps'><li>A quote starts from a product line and the vendors linked to it.</li><li>Vendor quotes collect backup prices before we promise a customer a date.</li><li>Awarding a quote writes the vendor onto the order line. Owners can store the vendor cost there.</li><li>Approved vendors become CRM companies. Follow-ups, the order calendar, and QuickBooks stay on the vendor we actually buy from.</li></ol>";
    h += "<p class='log'><button class='ghost' type='button' id='vmTourAgain'>Take the tour again</button></p>";
    return h;
  }
  var TOUR = [
    { title: "Why this portal exists", body: "The vendor we pick decides whether the customer gets what we promised, on time, at a margin we can live with. Utilize means keep them. Watch means get a backup. Replace means stop new orders.", sel: "#vmIntro" },
    { title: "Move around", body: "Board is home. Vendors is the list. Product lines group what we buy. Scorecard is the keep-or-replace decision. Training is the how-to.", sel: ".vm-nav" },
    { title: "Add a vendor", body: "This is the main action. Approved and Buying from also land in the CRM so the rest of the team can follow up.", sel: "[data-vm='new-vendor']" },
    { title: "The board", body: "Drag a card to change stage. The decision chip on the card is the latest scorecard.", sel: "#vmBoard" },
    { title: "Scorecard", body: "Open Scorecard to see Utilize, Watch, and Replace. Arrows compare the latest rating with the one before it.", sel: "[data-vm='sub'][data-v='sourcing']" },
    { title: "Training", body: "Steps for adding a vendor, a product line, and a rating live here, with this intro video. You can replay this tour any time.", sel: "[data-vm='sub'][data-v='training']" }
  ];
  var tourAt = -1;
  function endTour() {
    tourAt = -1;
    var box = document.getElementById("tour");
    if (box) box.hidden = true;
    document.querySelectorAll(".tour-hl").forEach(function (el) { el.classList.remove("tour-hl"); });
    try { localStorage.setItem("driven-vendors-tour-seen", "1"); } catch (e) {}
  }
  function showTour() {
    document.querySelectorAll(".tour-hl").forEach(function (el) { el.classList.remove("tour-hl"); });
    var step = TOUR[tourAt];
    if (!step) { endTour(); return; }
    var target = document.querySelector(step.sel);
    if (target) { target.classList.add("tour-hl"); try { target.scrollIntoView({ block: "nearest" }); } catch (e) {} }
    var box = document.getElementById("tour");
    if (!box) { box = document.createElement("div"); box.id = "tour"; box.setAttribute("role", "dialog"); document.body.appendChild(box); }
    box.hidden = false;
    box.innerHTML = "<div class='vm-dim'>Step " + (tourAt + 1) + " of " + TOUR.length + "</div><h3>" + esc(step.title) + "</h3><p>" + esc(step.body) + "</p>" +
      "<div class='mactions'><button class='ghost' type='button' data-tour='close'>Close</button>" +
      (tourAt ? "<button class='ghost' type='button' data-tour='back'>Back</button>" : "") +
      "<button class='primary' type='button' data-tour='next'>" + (tourAt === TOUR.length - 1 ? "Done" : "Next") + "</button></div>";
  }
  function startTour() { tourAt = 0; if (V.sub !== "board") { V.sub = "board"; render(); } showTour(); }

  /* ---------- events ---------- */
  function wire() {
    function live(id, key, after) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("input", function () {
        V[key] = el.value;
        if (after) { after(); return; }
        var p = el.selectionStart;
        render();
        var n = document.getElementById(id);
        if (n) { n.focus(); if (p != null) n.setSelectionRange(p, p); }
      });
    }
    live("vmFind", "findQ", function () { var b = document.getElementById("vmResults"); if (b) b.innerHTML = findResults(); });
    live("vmQ", "q"); live("vmOrdQ", "ordQ"); live("vmCatQ", "catQ");
    live("vmProdQ", "prodQ", function () {
      var b = document.getElementById("vmProdResults");
      if (b) b.innerHTML = productRows(V.catalog.filter(productMatch), canCost());
    });
    [["vmCat", "category"], ["vmShow", "listShow"], ["vmOrdV", "ordVendor"], ["vmProdType", "prodType"]].forEach(function (p) {
      var el = document.getElementById(p[0]);
      if (el) el.addEventListener("change", function () { V[p[1]] = el.value; render(); });
    });
    var miss = document.getElementById("vmMiss");
    if (miss) miss.addEventListener("change", function () { V.missingOnly = miss.checked; render(); });
    if (V.sub === "find") { var f = document.getElementById("vmFind"); if (f && !V.findQ) f.focus(); }
    var again = document.getElementById("vmTourAgain");
    if (again) again.addEventListener("click", function () { startTour(); });
    if (!window.__vmBulkWired) {
      window.__vmBulkWired = true;
      document.addEventListener("input", function (ev) { if (ev.target && ev.target.id === "bkText") bulkPreview(); });
    }
    /* board drag and drop, same feel as Pipeline */
    Array.prototype.forEach.call(document.querySelectorAll("[data-vm-drag]"), function (c) {
      c.addEventListener("dragstart", function (ev) { V.dragKey = c.dataset.vmDrag; c.classList.add("dragging"); try { ev.dataTransfer.setData("text/plain", V.dragKey); ev.dataTransfer.effectAllowed = "move"; } catch (x) {} });
      c.addEventListener("dragend", function () { c.classList.remove("dragging"); });
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-vm-drop]"), function (col) {
      col.addEventListener("dragover", function (ev) { ev.preventDefault(); col.classList.add("over"); });
      col.addEventListener("dragleave", function () { col.classList.remove("over"); });
      col.addEventListener("drop", function (ev) {
        ev.preventDefault();
        col.classList.remove("over");
        var k = V.dragKey;
        V.dragKey = null;
        if (k) setStage(k, col.dataset.vmDrop);
      });
    });
  }

  async function act(el) {
    var a = el.dataset.vm, k = el.dataset.k, e = k ? ent(k) : null;
    if (a === "sub") { V.sub = el.dataset.v; render(); return; }
    if (a === "save-video") { await saveVideo(); return; }
    if (a === "src") { V.source = el.dataset.v; render(); return; }
    if (a === "more") { V["lim_" + el.dataset.v] = 1000; render(); return; }
    if (a === "open") { V.detailTab = "overview"; openEnt(k); return; }
    if (a === "open-score") { V.detailTab = "score"; openEnt(k); return; }
    if (a === "tab") { V.detailTab = el.dataset.v; openEnt(V.openKey); return; }
    if (a === "item") { openItem(k); return; }
    if (a === "new-vendor") { newVendor(); return; }
    if (a === "save-vendor") { await saveVendor(); return; }
    if (a === "new-product") { productModal(V.prodType); return; }
    if (a === "bulk-products") { bulkModal(); return; }
    if (a === "bulk-save") { await bulkSave(); return; }
    if (a === "prod-show") { V.prodShow = el.dataset.v; render(); return; }
    if (a === "type-new") { typeModal(null); return; }
    if (a === "type-edit") { typeModal(typeById(el.dataset.id)); return; }
    if (a === "type-save") { await saveType(el.dataset.id); return; }
    if (a === "type-merge") { mergeModal(el.dataset.id); return; }
    if (a === "type-merge-save") { await mergeType(el.dataset.id); return; }
    if (a === "type-products") { V.prodShow = "products"; V.prodType = el.dataset.id; render(); return; }
    if (a === "link-vp-any") {
      var lve = ent(val("lvSel")), lvp = V.catalog.filter(function (c) { return String(c.id) === el.dataset.id; })[0];
      if (!lve || !lvp) { CRMHooks.toast("Pick a vendor."); return; }
      await CRMDB.insert("crm_vendor_products", { vendor_id: lve.primary.id, product_id: lvp.id, product: lvp.name, category: (productType(lvp) || {}).name || lve.primary.category }, "vendor product");
      await load(); openProduct(lvp.id); return;
    }
    if (a === "save-product") { await saveProduct(); return; }
    if (a === "calc") { CRMHooks.setView("calculator", { calcCat: "" }); return; }
    if (a === "verified") { await markVerified(el.dataset.id); return; }
    if (a === "link-po") { await linkPo(el.dataset.id); return; }
    if (a === "product") { openProduct(el.dataset.id); return; }
    if (a === "rfq-product") { openRfq({ productId: +el.dataset.id }); return; }
    if (a === "rfq-line") { openRfq({ lineId: +el.dataset.id }); return; }
    if (a === "rfq-open") { openRfq({ rfqId: +el.dataset.id }); return; }
    if (a === "rfq-show") { V.rfqShow = el.dataset.v; render(); return; }
    if (a === "rfq-create") { await createRfq(); return; }
    if (a === "rfq-award") { await award(el.dataset.id); return; }
    if (a === "rfq-close") { await closeRfq(el.dataset.id); return; }
    if (a === "rfq-add") { addVendorToRfq(el.dataset.id); return; }
    if (a === "rfq-add-save") { await addVendorToRfqSave(el.dataset.id); return; }
    if (a === "rfq-make-product") {
      var rr = V.rfqs.filter(function (z) { return String(z.id) === el.dataset.id; })[0];
      var rgt = typeGuess(rr.item, CRM_CATS.indexOf(rr.category) >= 0 ? rr.category : null);
      var np = await CRMDB.insert("crm_products", { name: rr.item, category: CRM_CATS.indexOf(rr.category) >= 0 ? rr.category : rgt ? rgt.crm_category : null, category_id: rgt ? rgt.id : null, unit: rr.unit, active: true }, "product");
      if (np) { await CRMDB.update("crm_rfqs", rr.id, { product_id: np.id }, "quote request"); if (rr.deal_line_id) await CRMDB.update("crm_deal_lines", rr.deal_line_id, { product_id: np.id }, "order line"); }
      await load(); render(); rfqDrawer(V.rfqs.filter(function (z) { return z.id === rr.id; })[0]); return;
    }
    if (a === "save-lines") { var made = await saveLinesAsProducts(quoteLinesWithoutProduct()); CRMHooks.toast(made + " product" + (made === 1 ? "" : "s") + " added and linked."); await load(); render(); return; }
    if (a === "unlink-vp") { await CRMDB.remove("crm_vendor_products", +el.dataset.id, "vendor product"); await load(); openProduct(V.openProductId); return; }
    if (a === "link-vp") {
      var le = ent(el.dataset.k), lp = V.catalog.filter(function (c) { return String(c.id) === el.dataset.id; })[0];
      if (le && le.primary && lp) await CRMDB.insert("crm_vendor_products", { vendor_id: le.primary.id, product_id: lp.id, product: lp.name, category: lp.category || le.primary.category }, "vendor product");
      await load(); openProduct(el.dataset.id); return;
    }
    if (a === "copy-l10") {
      var txt = l10Text();
      try { await navigator.clipboard.writeText(txt); CRMHooks.toast("Copied. Paste into the L10 issues list."); }
      catch (err) { CRMHooks.openModal("<h2>L10 issues</h2><textarea rows='8' style='width:100%'>" + esc(txt) + "</textarea><div class='mactions'><button class='ghost' data-act='mclose'>Done</button></div>"); }
      return;
    }
    if (a === "go") { V.sub = el.dataset.v; if (el.dataset.v === "sourcing") V.source = "score"; if (el.dataset.v === "orders") V.missingOnly = false; render(); return; }
    if (a === "dedupe") { await dedupe(); return; }
    if (a === "clear-junk") { await clearJunk(); return; }
    if (a === "rename") { await renameCompany(el.dataset.id); return; }
    if (a === "del-vprod") { await CRMDB.remove("crm_vendor_products", +el.dataset.id, "vendor product"); await reload(true); return; }
    if (a === "del-vcust") { await CRMDB.remove("crm_vendor_customers", +el.dataset.id, "vendor customer"); await reload(true); return; }
    if (!e) return;
    if (a === "to-crm") {
      var id = await addToCrm(e);
      if (!id) return;
      if (e.stage === "prospect" || e.stage === "vetting") CRMHooks.toast(e.name + " added to the CRM.");
      await load(); render();
      var ne = entByCompany(id);
      if (ne) openEnt(ne.key);
      return;
    }
    if (a === "add-profile") { await addProfile(e); return; }
    if (a === "overhead") { await markOverhead(e); return; }
    if (a === "log") { await logActivity(e); return; }
    if (a === "task") { await addTask(e); return; }
    if (a === "contact") { await addContact(e); return; }
    if (a === "add-vprod") { await addVendorProduct(e); return; }
    if (a === "add-vcust") { await addVendorCustomer(e); return; }
    if (a === "score") { await saveScore(e); return; }
  }

  if (!window.__vmWired) {
    window.__vmWired = true;
    document.addEventListener("click", function (ev) {
      var stepBtn = ev.target.closest && ev.target.closest("[data-tour]");
      if (stepBtn) {
        ev.preventDefault();
        if (stepBtn.dataset.tour === "close") endTour();
        else if (stepBtn.dataset.tour === "back") { tourAt = Math.max(0, tourAt - 1); showTour(); }
        else if (stepBtn.dataset.tour === "next") { tourAt += 1; if (tourAt >= TOUR.length) endTour(); else showTour(); }
        return;
      }
      var mail = ev.target.closest && ev.target.closest("[data-vm-send],[data-vm-sendall]");
      if (mail) {
        if (mail.dataset.vmSend) markSent([mail.dataset.vmSend]);
        else markSent(rfqVendors(mail.dataset.vmSendall).map(function (x) { return x.id; }));
        return;
      }
      var el = ev.target.closest && ev.target.closest("[data-vm]");
      if (!el) return;
      ev.preventDefault();
      act(el);
    });
    document.addEventListener("change", function (ev) {
      var t = ev.target, d = t.dataset || {};
      if (d.vmField) saveField(t);
      else if (d.vmQb) saveQb(t);
      else if (d.vmLine) setLineVendor(t);
      else if (d.vmProd) setProductQb(t);
      else if (d.vmCost) setLineCost(t);
      else if (d.vmRv) saveRv(t);
      else if (d.vmPf) saveProductField(t);
      else if (d.vmPtype) setProductType(t);
      else if (t.name && /^sc-/.test(t.name)) {
        Array.prototype.forEach.call(document.querySelectorAll("input[name='" + t.name + "']"), function (r) { r.closest(".vm-score-o").classList.toggle("on", r.checked); });
      }
      else if (t.id === "npType" || t.id === "npNewCrm") productModalType();
      else if (t.id === "bkType") bulkPreview();
      else if (d.vmPick && V.pick) {
        var i = V.pick.chosen.indexOf(d.vmPick);
        if (t.checked && i < 0) V.pick.chosen.push(d.vmPick);
        if (!t.checked && i >= 0) V.pick.chosen.splice(i, 1);
        var lab = t.closest(".vm-pick"); if (lab) lab.classList.toggle("on", t.checked);
        var c = document.getElementById("rfCount"); if (c) c.textContent = V.pick.chosen.length;
      }
      else if (d.vmTask && t.checked) doneTask(t);
      else if (d.vmStage) setStage(d.vmStage, t.value);
    });
  }

  window.CRMVendors = {
    load: load,
    render: render,
    rows: function () { return V.rows; },
    onChange: function () {},
    /* For the quote screen: the last buy of an item, or null. */
    lastBuy: function (text) {
      var k = words(text).trim();
      return V.lastBuy.filter(function (r) { return r.item_key === k; })[0] || V.lastBuy.filter(function (r) { return r.item_key.indexOf(k) >= 0; })[0] || null;
    },
    /* Hooks for the rest of the CRM. Call from a deal line, a product, or anywhere an item is being quoted. */
    quoteLine: function (lineId) { openRfq({ lineId: lineId }); },
    openQuote: function (rfqId) { openRfq({ rfqId: rfqId }); },
    show: function (sub) { V.sub = sub; render(); },
    tour: function () { startTour(); },
    quoteProduct: function (productId) { openRfq({ productId: productId }); },
    quoteItem: function (text, category) { openRfq({ item: text, category: category }); },
    openProduct: function (id) { openProduct(id); },
    topVendors: function (text, category, n) { return suggest(text, null, category).slice(0, n || 3).map(function (x) { return { name: x.e.name, companyId: x.e.companyId, why: x.why, warn: x.warn, email: x.email }; }); },
    openCompany: function (companyId) { var e = entByCompany(companyId); if (e) { V.detailTab = "overview"; openEnt(e.key); } },
    handle: async function (a) {
      var m = { "vnd-new": "new-vendor", "vnd-save-new": "save-vendor", "vnd-calc": "calc" }[a.dataset.act];
      if (m) await act({ dataset: { vm: m } });
      if (a.dataset.act === "vnd-open") { var e = entByRow(a.dataset.id); if (e) openEnt(e.key); }
    }
  };
})();
