/* Customer Portal tab for Driven team members.
   Reads vmi_accounts, vmi_portal_users, vmi_parts, and vmi_sites.
   Access and passwords go through the existing team-only functions.
   The temporary password is shown once and is not stored in this browser. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.CRMCustomerPortal = api;
  if (typeof document !== "undefined") api.boot();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var PORTAL_URL = "https://driven-vmi-portal.vercel.app";
  var ROLES = [
    ["customer_user", "User"],
    ["customer_admin", "Admin"],
    ["counter", "Counter"],
    ["buyer", "Buyer"],
    ["viewer", "Viewer"]
  ];
  var ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  var state = {
    team: null,
    ready: false,
    note: "",
    emailSending: false,
    directory: [],
    preview: false
  };
  var sample = null;
  var searchTimer = null;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function allowPreview(hostname, search) {
    var host = String(hostname || "");
    if (host !== "localhost" && host !== "127.0.0.1" && host !== "::1") return false;
    return /(?:^|[?&])portalPreview=1(?:&|$)/.test(String(search || ""));
  }
  function roleLabel(role) {
    var found = ROLES.filter(function (r) { return r[0] === role; })[0];
    return found ? found[1] : (role || "");
  }
  function roleOptions(selected) {
    return ROLES.map(function (r) {
      return "<option value='" + esc(r[0]) + "'" + (r[0] === selected ? " selected" : "") + ">" + esc(r[1]) + "</option>";
    }).join("");
  }
  function day(value) {
    if (!value) return "";
    var match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : String(value).slice(0, 10);
  }
  function accountTitle(row) {
    var name = String(row.company_name || "").trim();
    var billed = String(row.billed_name || "").trim();
    if (!name || name.toUpperCase() === "DELETE") return billed || ("Company " + row.company_id);
    return name;
  }
  function accountMeta(row) {
    var bits = ["Company " + row.company_id];
    if (String(row.company_name || "").trim().toUpperCase() === "DELETE") bits.push("record name DELETE");
    if (row.billed_name && row.billed_company_id && String(row.billed_company_id) !== String(row.company_id) && row.billed_name !== accountTitle(row)) {
      bits.push("Billed to " + row.billed_name);
    }
    if (row.status) bits.push(row.status);
    bits.push((row.parts || 0) + ((row.parts || 0) === 1 ? " part" : " parts"));
    if (row.sites && row.sites.length) bits.push("Site: " + row.sites.join("; "));
    else bits.push("No site yet");
    return bits.join(" · ");
  }
  function tellThem(email, password) {
    return [
      "Open " + PORTAL_URL,
      "Email: " + (email || ""),
      "Temporary password: " + (password || ""),
      "Change the password after the first sign-in.",
      "No email was sent."
    ].join("\n");
  }
  function randomBytes(count) {
    var out = new Uint8Array(count);
    if (typeof globalThis !== "undefined" && globalThis.crypto && globalThis.crypto.getRandomValues) {
      globalThis.crypto.getRandomValues(out);
      return out;
    }
    for (var i = 0; i < count; i++) out[i] = Math.floor(Math.random() * 256);
    return out;
  }
  function temporaryPassword(bytes) {
    var raw = bytes && bytes.length ? bytes : randomBytes(15);
    var chars = [];
    for (var i = 0; i < raw.length; i++) chars.push(ALPHABET[raw[i] % ALPHABET.length]);
    var body = chars.join("");
    var parts = [];
    for (var j = 0; j < body.length; j += 5) parts.push(body.slice(j, j + 5));
    return parts.join("-");
  }
  function byId(rows) {
    var map = {};
    (rows || []).forEach(function (row) { map[row.id] = row; });
    return map;
  }
  function buildDirectory(raw) {
    raw = raw || {};
    var companies = byId(raw.companies);
    var contacts = byId(raw.contacts);
    var ships = byId(raw.shipTos);
    var partCount = {};
    (raw.parts || []).forEach(function (part) {
      partCount[part.company_id] = (partCount[part.company_id] || 0) + 1;
    });
    var sitesBy = {};
    (raw.sites || []).slice().sort(function (a, b) {
      return (a.sort_order || 0) - (b.sort_order || 0) || (a.ship_to_id || 0) - (b.ship_to_id || 0);
    }).forEach(function (site) {
      var ship = ships[site.ship_to_id] || {};
      var label = String(site.display_name || ship.address || ship.label || ("Site " + site.ship_to_id)).trim();
      if (!sitesBy[site.company_id]) sitesBy[site.company_id] = [];
      if (label && sitesBy[site.company_id].indexOf(label) < 0) sitesBy[site.company_id].push(label);
    });
    var usersBy = {};
    (raw.users || []).forEach(function (user) {
      var contact = contacts[user.contact_id] || {};
      if (!usersBy[user.company_id]) usersBy[user.company_id] = [];
      usersBy[user.company_id].push({
        contact_id: user.contact_id,
        company_id: user.company_id,
        role: user.role || "customer_user",
        access: user.access === true,
        invited_at: user.invited_at || null,
        last_login_at: user.last_login_at || null,
        name: contact.name || user.name || "",
        email: contact.email || user.email || ""
      });
    });
    return (raw.accounts || []).map(function (account) {
      var company = companies[account.company_id] || {};
      var billed = companies[account.billed_company_id] || {};
      var users = (usersBy[account.company_id] || []).slice().sort(function (a, b) {
        return String(a.name).localeCompare(String(b.name)) || String(a.email).localeCompare(String(b.email));
      });
      var row = {
        company_id: account.company_id,
        billed_company_id: account.billed_company_id || null,
        status: account.status || "",
        company_name: company.name || account.company_name || "",
        billed_name: billed.name || account.billed_name || "",
        parts: partCount[account.company_id] || 0,
        sites: sitesBy[account.company_id] || [],
        users: users
      };
      row.title = accountTitle(row);
      row.meta = accountMeta(row);
      return row;
    }).sort(function (a, b) { return String(a.title).localeCompare(String(b.title)); });
  }
  function staffLoginNote(error) {
    var message = (error && (error.message || error.details || "")) || "";
    var code = String((error && error.code) || "");
    if (code === "PGRST202" || /schema cache/i.test(message) || /could not find the function/i.test(message)) {
      return "Ask Rich or Frank to create the login. The staff invite function is not available from this page, and this page will not create an Auth user another way.";
    }
    return "";
  }
  function passwordCard(name, email, password) {
    var who = name || email || "them";
    return "<div data-cpu-secret='1'><h2>What to tell them</h2><p>Shown once for " + esc(who) + ". Closing this box clears it from the page.</p><pre id='cpuTell' style='white-space:pre-wrap;background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:12px;margin:0'>" + esc(tellThem(email, password)) + "</pre><div class='mactions'><button type='button' class='primary' data-act='cpu-copy'>Copy</button><button type='button' class='ghost' data-act='cpu-dismiss'>Done</button></div></div>";
  }
  function userRow(user, emailSending) {
    var on = user.access ? "1" : "0";
    var accessBtn = user.access
      ? "<button type='button' class='ghost' data-act='cpu-access' data-id='" + esc(user.contact_id) + "' data-on='1' data-name='" + esc(user.name) + "'>Turn access off</button>"
      : "<button type='button' class='primary' data-act='cpu-access' data-id='" + esc(user.contact_id) + "' data-on='0' data-name='" + esc(user.name) + "'>Turn access on</button>";
    var canPassword = user.access && user.email && !emailSending;
    var passwordBtn = "<button type='button' class='ghost' data-act='cpu-password' data-id='" + esc(user.contact_id) + "' data-on='" + on + "' data-email='" + esc(user.email) + "' data-name='" + esc(user.name) + "'" + (canPassword ? "" : " disabled") + ">Set temporary password</button>";
    return "<tr><td><b>" + esc(user.name || "—") + "</b></td><td>" + esc(user.email || "—") + "</td><td>" + esc(roleLabel(user.role)) + "</td><td><span class='chip" + (user.access ? " active" : "") + "'>" + (user.access ? "On" : "Off") + "</span></td><td>" + esc(day(user.invited_at) || "—") + "</td><td>" + esc(day(user.last_login_at) || "—") + "</td><td>" + accessBtn + " " + passwordBtn + "</td></tr>";
  }
  function addForm(account) {
    var id = account.company_id;
    var h = "<div style='margin-top:14px'><h3 class='cond' style='font-size:18px;margin-bottom:6px'>Add a portal user</h3>";
    h += "<p class='log'>Pick an existing contact, or enter a new name and email. The staff invite functions create the login on the server. Customer email sending stays off. If that login cannot be created, ask Rich or Frank.</p>";
    h += "<div class='fields'><div class='f'><label for='cpuRole-" + id + "'>Role</label><select id='cpuRole-" + id + "'>" + roleOptions("customer_user") + "</select></div>";
    h += "<div class='f wide'><label for='cpuFind-" + id + "'>Existing contact</label><input id='cpuFind-" + id + "' data-cpu='search' data-company='" + id + "' placeholder='Name or email' autocomplete='off'></div></div>";
    h += "<div id='cpuHits-" + id + "'></div>";
    h += "<div class='fields'><div class='f'><label for='cpuName-" + id + "'>New name</label><input id='cpuName-" + id + "' autocomplete='off'></div><div class='f'><label for='cpuEmail-" + id + "'>New email</label><input id='cpuEmail-" + id + "' type='email' autocomplete='off'></div></div>";
    h += "<button type='button' class='primary' data-act='cpu-invite' data-company='" + id + "'>Add portal user</button></div>";
    return h;
  }
  function directoryHtml(model) {
    model = model || {};
    if (model.team === false) {
      return "<div class='sect' id='customerPortal'><h2>Customer Portal</h2><p class='banner'>The customer portal is for Driven team members.</p></div>";
    }
    if (!model.ready) {
      return "<div class='sect' id='customerPortal'><h2>Customer Portal</h2><p class='log'>Loading VMI accounts…</p></div>";
    }
    var h = "<div class='sect' id='customerPortal'><h2>Customer Portal</h2>";
    h += "<p class='lead'>VMI accounts on the customer portal, with each account's users, part count, and site.</p>";
    if (model.preview) h += "<p class='banner'>Staff preview with sample accounts. These are not customer logins.</p>";
    h += "<div class='panel' style='padding:18px 20px;margin:0 0 16px;display:flex;gap:16px;align-items:center;justify-content:space-between;flex-wrap:wrap;border-left:4px solid var(--cs)'>";
    h += "<div><h2 style='font-size:26px;color:var(--cs)'>Open customer portal</h2><p class='log' style='margin:4px 0 0'>" + esc(PORTAL_URL) + "</p></div>";
    h += "<a class='primary' id='openCustomerPortal' href='" + esc(PORTAL_URL) + "' target='_blank' rel='noopener noreferrer' style='text-decoration:none;display:inline-block'>Open customer portal</a></div>";
    if (model.emailSending) {
      h += "<p class='banner'>Customer email sending is on. Temporary passwords stay blocked until that flag is off. This page leaves the flag as it is.</p>";
    } else {
      h += "<p class='banner'>Customer email sending stays off. Set a temporary password and tell the person the portal address, their email, and that password. They change it after the first sign-in.</p>";
    }
    if (model.note) h += "<p class='banner'>" + esc(model.note) + "</p>";
    var rows = model.directory || [];
    if (!rows.length) h += "<p class='log'>No VMI accounts yet.</p>";
    rows.forEach(function (account) {
      h += "<div class='panel' style='padding:14px 16px;margin-bottom:16px'>";
      h += "<div class='bar' style='margin-bottom:4px'><h2 style='font-size:22px'>" + esc(account.title) + "</h2>";
      if (account.status) h += "<span class='chip active'>" + esc(account.status) + "</span>";
      h += "</div><p class='log'>" + esc(account.meta) + "</p>";
      h += "<div class='panel tablewrap'><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Access</th><th>Invited</th><th>Last sign-in</th><th></th></tr></thead><tbody>";
      h += account.users.length ? account.users.map(function (user) { return userRow(user, !!model.emailSending); }).join("") : "<tr><td colspan='7' class='empty'>No portal users yet.</td></tr>";
      h += "</tbody></table></div>";
      h += addForm(account);
      h += "</div>";
    });
    return h + "</div>";
  }
  function previewSample() {
    var parts = [];
    var i;
    for (i = 0; i < 4; i++) parts.push({ company_id: 169 });
    for (i = 0; i < 24; i++) parts.push({ company_id: 220 });
    return {
      companies: [
        { id: 169, name: "Kempf Paper" },
        { id: 183, name: "Anchor Paper (River Valley Converting)" },
        { id: 220, name: "DELETE" }
      ],
      accounts: [
        { company_id: 169, status: "pilot", billed_company_id: 169 },
        { company_id: 220, status: "pilot", billed_company_id: 183 }
      ],
      contacts: [
        { id: 1, name: "Casey Buyer", email: "casey.buyer@example.com" },
        { id: 2, name: "Avery Count", email: "avery.count@example.com" },
        { id: 3, name: "Riley Admin", email: "riley.admin@example.com" }
      ],
      users: [
        { contact_id: 1, company_id: 169, role: "buyer", access: true, invited_at: "2026-11-11T15:00:00Z", last_login_at: null },
        { contact_id: 2, company_id: 169, role: "customer_user", access: false, invited_at: "2026-11-01T15:00:00Z", last_login_at: "2026-11-02T18:00:00Z" },
        { contact_id: 3, company_id: 220, role: "customer_admin", access: true, invited_at: "2026-11-11T12:00:00Z", last_login_at: "2026-11-11T18:04:00Z" }
      ],
      parts: parts,
      sites: [
        { company_id: 169, ship_to_id: 6, display_name: "3145 NE Columbia Ave, Minneapolis, MN 55418", sort_order: 1 },
        { company_id: 220, ship_to_id: 24, display_name: "2552 Prairie Drive, River Falls, WI 54022", sort_order: 1 }
      ],
      shipTos: [
        { id: 6, label: "Ship-to", address: "3145 NE Columbia Ave, Minneapolis, MN 55418, USA" },
        { id: 24, label: "Ship-to", address: "River Valley Converting Anchor Paper 2552 Prairie Drive River Falls, WI 54022" }
      ]
    };
  }
  function knownUser(contactId) {
    var found = null;
    (state.directory || []).forEach(function (account) {
      account.users.forEach(function (user) {
        if (String(user.contact_id) === String(contactId)) found = user;
      });
    });
    return found;
  }
  function toast(message, kind) {
    if (window.CRMHooks && CRMHooks.toast) CRMHooks.toast(message, kind);
  }
  function explain(error) {
    if (window.CRMDB && CRMDB.explain) return CRMDB.explain(error);
    if (!error) return "That did not work.";
    return error.message || error.details || error.code || "That did not work.";
  }
  function asList(data) {
    if (!data) return [];
    if (typeof data === "string") {
      try { data = JSON.parse(data); } catch (e) { return []; }
    }
    return Array.isArray(data) ? data : [];
  }
  function ensureTab() {
    if (typeof document === "undefined") return;
    var nav = document.querySelector("nav.tabs");
    if (!nav || document.getElementById("customerPortalTab")) return;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tab";
    btn.id = "customerPortalTab";
    btn.setAttribute("data-view", "customer-portal");
    btn.setAttribute("data-cat", "cs");
    btn.textContent = "Customer Portal";
    btn.hidden = true;
    var calc = nav.querySelector(".tab[data-view='calculator']");
    if (calc && calc.parentNode === nav) nav.insertBefore(btn, calc.nextSibling);
    else {
      var commissions = document.getElementById("commissionsTab");
      if (commissions && commissions.parentNode === nav) nav.insertBefore(btn, commissions);
      else nav.appendChild(btn);
    }
  }
  function syncNav() {
    ensureTab();
    var tab = typeof document === "undefined" ? null : document.getElementById("customerPortalTab");
    if (tab) tab.hidden = state.team !== true;
  }
  function isOpen() {
    if (typeof document === "undefined") return false;
    var tab = document.getElementById("customerPortalTab");
    if (tab && tab.getAttribute("aria-current") === "page") return true;
    return !!document.getElementById("customerPortal");
  }
  function render() {
    syncNav();
    if (typeof document === "undefined") return;
    var view = document.getElementById("view");
    if (!view) return;
    view.dataset.cat = "cs";
    view.innerHTML = directoryHtml(state);
    var tab = document.getElementById("customerPortalTab");
    if (tab && tab.scrollIntoView) {
      try { tab.scrollIntoView({ block: "nearest", inline: "nearest" }); } catch (err) { /* keep the tab in the nav */ }
    }
  }
  function refresh() {
    if (!isOpen()) return;
    if (window.CRMHooks && CRMHooks.render) CRMHooks.render();
    else render();
  }
  function markSecret() {
    var modal = document.getElementById("modal");
    if (modal) modal.classList.add("cpu-secret");
  }
  function wipeSecret() {
    if (typeof document === "undefined") return;
    var box = document.getElementById("mbox");
    var modal = document.getElementById("modal");
    if (modal) modal.classList.remove("cpu-secret");
    if (!box || !box.querySelector("[data-cpu-secret]")) return;
    box.textContent = "";
    if (modal) modal.classList.remove("open");
  }
  function openSecret(html) {
    if (window.CRMHooks && CRMHooks.openModal) CRMHooks.openModal(html);
    else if (typeof document !== "undefined") {
      var box = document.getElementById("mbox");
      var modal = document.getElementById("modal");
      if (box) box.innerHTML = html;
      if (modal) modal.classList.add("open");
    }
    markSecret();
  }
  function copyBlurb() {
    var el = document.getElementById("cpuTell");
    var text = el ? el.textContent : "";
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast("Copied."); }, function () { toast("Select the text and copy it."); });
      return;
    }
    toast("Select the text and copy it.");
  }
  function valueOf(id) {
    var el = document.getElementById(id);
    return el ? String(el.value || "").trim() : "";
  }
  function readRole(companyId) {
    var role = valueOf("cpuRole-" + companyId);
    var known = ROLES.some(function (r) { return r[0] === role; });
    return known ? role : "customer_user";
  }
  function previewUser(contactId) {
    return (sample.users || []).filter(function (user) { return String(user.contact_id) === String(contactId); })[0] || null;
  }
  function rebuildPreview() {
    state.directory = buildDirectory(sample);
    refresh();
  }
  function previewRpc(name, args) {
    args = args || {};
    if (name === "vmi_set_temporary_password") {
      if (!args.p_password || String(args.p_password).trim().length < 8) {
        return Promise.resolve({ data: null, error: { message: "Use at least 8 characters" } });
      }
      return Promise.resolve({ data: { emailed: false, customer_email_sending: false }, error: null });
    }
    if (name === "vmi_set_portal_access") {
      var user = previewUser(args.p_contact_id);
      if (!user) return Promise.resolve({ data: null, error: { message: "That person is not a portal user" } });
      user.access = args.p_access === true;
      rebuildPreview();
      return Promise.resolve({ data: { access: user.access, emailed: false, customer_email_sending: false }, error: null });
    }
    if (name === "vmi_search_contacts") {
      var query = String(args.p_query || "").toLowerCase();
      var hits = [
        { contact_id: 910, name: "Jordan Mills", email: "jordan.mills@example.com", company_name: "Kempf Paper", job: "Buyer", access: false }
      ].filter(function (hit) {
        if (!query) return true;
        return hit.name.toLowerCase().indexOf(query) >= 0 || hit.email.indexOf(query) >= 0;
      });
      return Promise.resolve({ data: hits, error: null });
    }
    if (name === "vmi_invite_portal_user") {
      if (!String(args.p_name || "").trim() || String(args.p_email || "").indexOf("@") < 1) {
        return Promise.resolve({ data: null, error: { message: "Name and email are required" } });
      }
      var id = 900 + sample.contacts.length;
      sample.contacts.push({ id: id, name: String(args.p_name).trim(), email: String(args.p_email).trim() });
      sample.users.push({
        contact_id: id,
        company_id: args.p_company_id,
        role: args.p_role || "customer_user",
        access: true,
        invited_at: "2026-11-11T20:00:00Z",
        last_login_at: null
      });
      rebuildPreview();
      return Promise.resolve({ data: { emailed: false, auth_user_created: true, auth_available: true, customer_email_sending: false }, error: null });
    }
    if (name === "vmi_grant_portal_contact") {
      var existing = previewUser(args.p_contact_id);
      if (existing) {
        existing.access = true;
        existing.company_id = args.p_account_company_id;
        existing.role = args.p_role || existing.role;
      } else {
        if (!sample.contacts.some(function (contact) { return String(contact.id) === String(args.p_contact_id); })) {
          sample.contacts.push({ id: args.p_contact_id, name: "Jordan Mills", email: "jordan.mills@example.com" });
        }
        sample.users.push({
          contact_id: args.p_contact_id,
          company_id: args.p_account_company_id,
          role: args.p_role || "customer_user",
          access: true,
          invited_at: "2026-11-11T20:00:00Z",
          last_login_at: null
        });
      }
      rebuildPreview();
      return Promise.resolve({ data: { emailed: false, auth_available: true, auth_user_exists: true, customer_email_sending: false }, error: null });
    }
    return Promise.resolve({ data: null, error: { message: "That action is not available in the staff preview." } });
  }
  function callRpc(name, args) {
    if (state.preview) return previewRpc(name, args);
    if (!window.CRMDB || !CRMDB.db || !CRMDB.db.rpc) {
      return Promise.resolve({ data: null, error: { message: "The database client did not load." } });
    }
    return CRMDB.db.rpc(name, args);
  }
  function finishAdd(res) {
    if (!res || res.error) {
      toast(staffLoginNote(res && res.error) || explain(res && res.error), "bad");
      return;
    }
    var data = res.data || {};
    if (data.auth_available === false) {
      toast("Ask Rich or Frank to create the login. No Auth user was created, and no email was sent.", "bad");
      return;
    }
    toast("Portal user saved. No email was sent. Set a temporary password and tell them the portal address yourself.");
    if (!state.preview) load();
  }
  async function toggleAccess(btn) {
    var turningOn = btn.dataset.on !== "1";
    var name = btn.dataset.name || "this person";
    if (!turningOn && typeof window.confirm === "function" && !window.confirm("Turn off portal access for " + name + "?")) return;
    var res = await callRpc("vmi_set_portal_access", {
      p_contact_id: +btn.dataset.id,
      p_access: turningOn,
      p_role: ""
    });
    if (!res || res.error) {
      toast(explain(res && res.error), "bad");
      return;
    }
    toast(turningOn ? "Access is on. No email was sent." : "Access is off. No email was sent.");
    if (!state.preview) load();
  }
  async function applyPassword(contactId, email, name) {
    var password = temporaryPassword();
    var res;
    try {
      res = await callRpc("vmi_set_temporary_password", { p_contact_id: contactId, p_password: password });
    } catch (err) {
      password = "";
      toast("The temporary password was not saved.", "bad");
      return;
    }
    if (!res || res.error) {
      var message = explain(res && res.error);
      password = "";
      toast(message, "bad");
      return;
    }
    var html = passwordCard(name, email, password);
    password = "";
    openSecret(html);
  }
  function beginPassword(btn) {
    if (state.emailSending) {
      toast("Customer email sending is on. Leave that flag off before setting a password.", "bad");
      return;
    }
    if (btn.dataset.on !== "1") {
      toast("Turn portal access on before setting a password.");
      return;
    }
    var email = btn.dataset.email || "";
    if (email.indexOf("@") < 1) {
      toast("That contact needs an email before they can sign in.");
      return;
    }
    applyPassword(+btn.dataset.id, email, btn.dataset.name || "");
  }
  async function inviteNew(btn) {
    var companyId = +btn.dataset.company;
    var name = valueOf("cpuName-" + companyId);
    var email = valueOf("cpuEmail-" + companyId);
    if (!name || email.indexOf("@") < 1) {
      toast("Enter a name and an email.");
      return;
    }
    var res = await callRpc("vmi_invite_portal_user", {
      p_company_id: companyId,
      p_name: name,
      p_email: email,
      p_role: readRole(companyId)
    });
    finishAdd(res);
  }
  async function grantContact(btn) {
    var companyId = +btn.dataset.company;
    var res = await callRpc("vmi_grant_portal_contact", {
      p_account_company_id: companyId,
      p_contact_id: +btn.dataset.id,
      p_role: readRole(companyId)
    });
    finishAdd(res);
  }
  function searchHits(companyId, hits) {
    var box = document.getElementById("cpuHits-" + companyId);
    if (!box) return;
    if (!hits.length) {
      box.innerHTML = "<p class='log'>No matching contacts.</p>";
      return;
    }
    box.innerHTML = "<div class='panel' style='margin:8px 0'>" + hits.map(function (hit) {
      var known = knownUser(hit.contact_id);
      var action;
      if (known && known.access && String(known.company_id) === String(companyId)) {
        action = "<span class='log'>Already on this account</span>";
      } else if (known && known.access) {
        action = "<span class='log'>Turn off their other account first</span>";
      } else if (!hit.email) {
        action = "<span class='log'>Needs an email</span>";
      } else {
        action = "<button type='button' class='ghost' data-act='cpu-grant' data-company='" + esc(companyId) + "' data-id='" + esc(hit.contact_id) + "'>Add</button>";
      }
      return "<div class='cf'><div><b>" + esc(hit.name || "") + "</b> <span class='log'>" + esc(hit.email || "No email") + (hit.company_name ? " · " + esc(hit.company_name) : "") + "</span></div>" + action + "</div>";
    }).join("") + "</div>";
  }
  async function runSearch(companyId, query) {
    var box = document.getElementById("cpuHits-" + companyId);
    if (!box) return;
    var res = await callRpc("vmi_search_contacts", { p_account_company_id: +companyId, p_query: query || "" });
    if (!document.getElementById("cpuHits-" + companyId)) return;
    if (!res || res.error) {
      document.getElementById("cpuHits-" + companyId).innerHTML = "<p class='log'>" + esc(staffLoginNote(res && res.error) || explain(res && res.error)) + "</p>";
      return;
    }
    searchHits(companyId, asList(res.data));
  }
  function onClick(event) {
    var btn = event.target && event.target.closest ? event.target.closest("[data-act]") : null;
    if (!btn) return;
    var act = btn.dataset.act || "";
    if (act === "mclose" || act === "close") {
      wipeSecret();
      return;
    }
    if (act.indexOf("cpu-") !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    if (act === "cpu-copy") { copyBlurb(); return; }
    if (act === "cpu-dismiss") { wipeSecret(); return; }
    if (act === "cpu-access") { toggleAccess(btn); return; }
    if (act === "cpu-password") { beginPassword(btn); return; }
    if (act === "cpu-invite") { inviteNew(btn); return; }
    if (act === "cpu-grant") { grantContact(btn); return; }
  }
  function onInput(event) {
    var el = event.target;
    if (!el || !el.dataset || el.dataset.cpu !== "search") return;
    var companyId = el.dataset.company;
    var query = el.value;
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(function () { runSearch(companyId, query); }, 200);
  }
  function onFocus(event) {
    var el = event.target;
    if (!el || !el.dataset || el.dataset.cpu !== "search") return;
    if (!el.value) runSearch(el.dataset.company, "");
  }
  function onKey(event) {
    if (event.key === "Escape") wipeSecret();
  }
  function uniq(list) {
    var out = [];
    (list || []).forEach(function (id) {
      if (id == null || id === "") return;
      if (out.indexOf(id) < 0 && out.indexOf(+id) < 0) out.push(id);
    });
    return out;
  }
  async function selectIds(table, columns, ids) {
    if (!ids.length || !window.CRMDB) return [];
    var res = await CRMDB.db.from(table).select(columns).in("id", ids);
    if (res.error) return [];
    return res.data || [];
  }
  async function load() {
    if (state.preview || !window.CRMDB || !CRMDB.db) return;
    var who = await CRMDB.db.rpc("vmi_whoami");
    var me = who && !who.error ? (who.data || {}) : null;
    if (!me || who.error) {
      state.team = false;
      state.ready = true;
      state.note = explain(who && who.error);
      state.directory = [];
      syncNav();
      refresh();
      return;
    }
    if (typeof me === "string") {
      try { me = JSON.parse(me); } catch (e) { me = {}; }
    }
    state.team = me.is_crm_team === true || me.role === "driven_staff";
    state.ready = true;
    syncNav();
    if (!state.team) {
      state.directory = [];
      refresh();
      return;
    }
    var accounts = await CRMDB.db.from("vmi_accounts").select("company_id,status,billed_company_id");
    if (accounts.error) {
      state.note = explain(accounts.error);
      state.directory = [];
      refresh();
      return;
    }
    var users = await CRMDB.db.from("vmi_portal_users").select("contact_id,company_id,role,access,invited_at,last_login_at");
    var parts = await CRMDB.db.from("vmi_parts").select("company_id");
    var sites = await CRMDB.db.from("vmi_sites").select("company_id,ship_to_id,display_name,kind,sort_order");
    var flags = await CRMDB.db.from("vmi_portal_flags").select("customer_email_sending").eq("id", 1).maybeSingle();
    var accountRows = accounts.data || [];
    var userRows = users.error ? [] : (users.data || []);
    var siteRows = sites.error ? [] : (sites.data || []);
    state.note = users.error ? explain(users.error) : (parts.error ? explain(parts.error) : "");
    state.emailSending = !!(flags.data && flags.data.customer_email_sending === true);
    var companyIds = [];
    accountRows.forEach(function (account) {
      companyIds.push(account.company_id);
      if (account.billed_company_id) companyIds.push(account.billed_company_id);
    });
    var companies = await selectIds("crm_companies", "id,name", uniq(companyIds));
    var contacts = await selectIds("crm_contacts", "id,name,email", uniq(userRows.map(function (user) { return user.contact_id; })));
    var shipTos = await selectIds("crm_ship_tos", "id,label,address", uniq(siteRows.map(function (site) { return site.ship_to_id; })));
    state.directory = buildDirectory({
      accounts: accountRows,
      companies: companies,
      users: userRows,
      contacts: contacts,
      parts: parts.error ? [] : (parts.data || []),
      sites: siteRows,
      shipTos: shipTos
    });
    refresh();
  }
  function startPreview() {
    state.preview = true;
    state.team = true;
    state.ready = true;
    state.emailSending = false;
    state.note = "";
    sample = previewSample();
    state.directory = buildDirectory(sample);
    syncNav();
    var gate = document.getElementById("authGate");
    var shell = document.getElementById("shell");
    if (gate) gate.hidden = true;
    if (shell) shell.hidden = false;
    document.documentElement.dataset.theme = "dark";
    document.documentElement.dataset.crmGate = "signed-in";
    var who = document.getElementById("who");
    if (who) {
      who.innerHTML = "<option>Staff preview</option>";
      who.disabled = true;
    }
    var save = document.getElementById("saveState");
    if (save) {
      save.textContent = "Staff preview · sample portal accounts";
      save.className = "save-state";
    }
    if (window.CRMHooks && CRMHooks.setView) CRMHooks.setView("customer-portal");
    else render();
  }
  function watchAuth() {
    if (!window.CRMDB || !CRMDB.db || !CRMDB.db.auth || !CRMDB.db.auth.onAuthStateChange) return;
    CRMDB.db.auth.onAuthStateChange(function (event, session) {
      if (state.preview) return;
      if ((event === "INITIAL_SESSION" || event === "SIGNED_IN") && session) load();
      if (!session) {
        state.team = false;
        state.ready = false;
        state.directory = [];
        syncNav();
      }
    });
  }
  function ensureStyle() {
    if (typeof document === "undefined" || document.getElementById("cpuStyle")) return;
    var style = document.createElement("style");
    style.id = "cpuStyle";
    style.textContent = "#modal.cpu-secret{background:rgba(10,10,12,.55)}";
    document.head.appendChild(style);
  }
  function boot() {
    if (typeof document === "undefined") return;
    ensureStyle();
    ensureTab();
    document.addEventListener("click", onClick, true);
    document.addEventListener("input", onInput);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("keydown", onKey);
    if (allowPreview(location.hostname, location.search)) startPreview();
    else watchAuth();
  }

  return {
    PORTAL_URL: PORTAL_URL,
    ROLES: ROLES,
    allowPreview: allowPreview,
    accountTitle: accountTitle,
    accountMeta: accountMeta,
    tellThem: tellThem,
    temporaryPassword: temporaryPassword,
    buildDirectory: buildDirectory,
    directoryHtml: directoryHtml,
    passwordCard: passwordCard,
    staffLoginNote: staffLoginNote,
    previewSample: previewSample,
    boot: boot,
    load: load,
    render: render,
    syncNav: syncNav
  };
});
