/* If a Supabase session is already in this browser, skip the login card
   on the first paint. crm-auth.js still checks the team before any CRM read. */
(function () {
  try {
    var raw = localStorage.getItem("sb-igaylyhkssahczubiztb-auth-token");
    if (!raw) return;
    var data = JSON.parse(raw);
    var session = data && (data.currentSession || data);
    if (!session || !session.access_token) return;
    if (session.expires_at && session.expires_at * 1000 < Date.now()) return;
    document.documentElement.classList.add("crm-has-session");
  } catch (e) {}
})();
