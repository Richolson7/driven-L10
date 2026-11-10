/* Sign-in shell for the vendor portal. Same Supabase session as the CRM. */
(function () {
  "use strict";
  if (!window.CRMDB || !CRMDB.db) return;

  var email = "";
  var name = "";
  var companies = [];
  var theme = "dark";

  function $(id) { return document.getElementById(id); }
  function toast(msg, kind) {
    var box = $("toasts");
    if (!box) return;
    var t = document.createElement("div");
    t.className = "toast" + (kind ? " " + kind : "");
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(function () { t.remove(); }, kind === "bad" ? 7000 : 3600);
  }
  function applyTheme(next) {
    theme = next === "light" ? "light" : "dark";
    document.documentElement.dataset.theme = theme;
    var btn = $("themeBtn");
    if (btn) btn.textContent = theme === "dark" ? "Light mode" : "Dark mode";
    try { localStorage.setItem("driven-crm-theme", theme); } catch (e) {}
  }
  function closeDrawer() {
    var d = $("drawer");
    if (!d) return;
    d.classList.remove("open");
    d.setAttribute("aria-hidden", "true");
    var s = $("scrim");
    if (s) s.classList.remove("open");
  }
  function openDrawer(html, wide) {
    var d = $("drawer");
    d.innerHTML = html;
    d.classList.toggle("wide", !!wide);
    d.classList.add("open");
    d.setAttribute("aria-hidden", "false");
    $("scrim").classList.add("open");
  }
  function closeModal() { $("modal").classList.remove("open"); }
  function openModal(html) { $("mbox").innerHTML = html; $("modal").classList.add("open"); }

  window.CRMHooks = {
    toast: toast,
    openDrawer: openDrawer,
    closeDrawer: closeDrawer,
    openModal: openModal,
    closeModal: closeModal,
    meName: function () { return name || ""; },
    email: function () { return email || ""; },
    companies: function () { return companies; },
    render: function () { if (window.CRMVendors) CRMVendors.render(); },
    setView: function (view) {
      if (view === "calculator") {
        try { sessionStorage.setItem("driven-calc-return", "vendors.html"); } catch (e) {}
        location.href = "crm.html?view=calculator&from=vendors";
        return;
      }
      else location.href = "crm.html" + (view ? "?view=" + encodeURIComponent(view) : "");
    }
  };

  CRMDB.onError(function (text) { toast(text, "bad"); });

  async function loadCompanies() {
    var res = await CRMDB.db.from("crm_companies").select("id,name,kind,custom,owner,last_contact_at,notes").order("name");
    companies = res.error ? [] : (res.data || []);
  }
  async function loadMe(session) {
    email = (session.user && session.user.email) || "";
    name = "";
    var team = await CRMDB.db.from("crm_team").select("name,email,active").eq("active", true);
    var rows = team.error ? [] : (team.data || []);
    var mine = rows.filter(function (r) { return String(r.email || "").toLowerCase() === email.toLowerCase(); })[0];
    name = mine && mine.name ? mine.name : (email.split("@")[0] || "Teammate");
    var label = $("whoLabel");
    if (label) label.textContent = "Signed in as " + name;
  }
  async function enter(session) {
    if (!session) return;
    await loadMe(session);
    if (window.CRMCommissions) await CRMCommissions.load();
    await loadCompanies();
    if (window.CRMSupply) await CRMSupply.load();
    if (window.CRMVendors) await CRMVendors.load();
    $("authGate").hidden = true;
    $("shell").hidden = false;
    if (window.CRMVendors) CRMVendors.render();
    var seen = "";
    try { seen = localStorage.getItem("driven-vendors-tour-seen") || ""; } catch (e) {}
    if (!seen && window.CRMVendors && CRMVendors.tour) CRMVendors.tour();
  }

  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("[data-act]");
    if (a && a.dataset.act === "mclose") { closeModal(); return; }
    if (a && a.dataset.act === "close") { closeDrawer(); return; }
    if (e.target.id === "scrim") closeDrawer();
    if (e.target.id === "modal") closeModal();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if ($("modal").classList.contains("open")) closeModal();
    else closeDrawer();
  });

  function boot() {
    try { theme = localStorage.getItem("driven-crm-theme") || "dark"; } catch (e) { theme = "dark"; }
    applyTheme(theme);
    var themeBtn = $("themeBtn");
    if (themeBtn) themeBtn.addEventListener("click", function () { applyTheme(theme === "dark" ? "light" : "dark"); });
    var tourBtn = $("tourBtn");
    if (tourBtn) tourBtn.addEventListener("click", function () { if (window.CRMVendors && CRMVendors.tour) CRMVendors.tour(); });
    var out = $("signOutBtn");
    if (out) out.addEventListener("click", function () { CRMDB.db.auth.signOut(); });
    if (!window.CRMAuth) {
      var msg = $("gateMsg");
      if (msg) msg.textContent = "The sign-in script did not load. Reload the page.";
      return;
    }
    CRMAuth.bind({
      place: "vendor portal",
      onSession: function (session) { enter(session); },
      onSignedOut: function () {
        $("shell").hidden = true;
        $("authGate").hidden = false;
        closeDrawer();
        closeModal();
      },
      onRecovery: function () {
        $("shell").hidden = true;
        $("authGate").hidden = false;
      }
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
