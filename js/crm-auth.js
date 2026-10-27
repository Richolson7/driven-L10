/* Password sign-in shared by the CRM and the morning huddle.
   Day-to-day sign-in does not send email. Forgot password is the only email. */
(function () {
  "use strict";
  if (!window.CRMDB || !CRMDB.db) return;

  var gateMode = "signin";
  var recoveryPending = /(?:^|[?#&])type=recovery(?:&|$)/.test(location.hash + location.search);
  var held = false;
  var place = "CRM";
  var hooks = {
    isHeld: function () { return false; },
    onSession: function () {},
    onSignedOut: function () {},
    onRecovery: function () {}
  };

  function $(id) { return document.getElementById(id); }
  function authRedirect() { return location.origin + location.pathname; }
  function readGateEmail() { return ($("gateEmail") && $("gateEmail").value || "").trim(); }
  function emailOk(email) { return email.indexOf("@") > 0 && email.indexOf(" ") < 0; }
  function passwordProblem(password, again) {
    if (!password || password.length < 8) return "Use a password of at least 8 characters.";
    if (again != null && password !== again) return "Those passwords do not match.";
    return "";
  }
  function setMessage(text, kind) {
    var el = $("gateMsg");
    if (!el) return;
    el.textContent = text || "";
    el.className = "gate-msg" + (kind === "bad" ? " bad" : "");
  }
  function plainAuthError(error) {
    var msg = (error && (error.message || error.msg)) || "";
    var code = String((error && error.code) || "");
    var low = msg.toLowerCase();
    if (code === "email_not_confirmed" || low.indexOf("email not confirmed") >= 0) {
      return "This email is not confirmed, so a password sign-in cannot finish. The magic-link account has to be deleted in Supabase Authentication, then you create a password here after Confirm email is turned off.";
    }
    if (code === "invalid_credentials" || low.indexOf("invalid login") >= 0) {
      return "That email or password is wrong.";
    }
    if (code === "user_already_exists" || low.indexOf("already registered") >= 0 || low.indexOf("already been registered") >= 0) {
      return "An account already exists for this email. Sign in with that password. If you never chose one, delete the user in Supabase Authentication and create the password here.";
    }
    if (low.indexOf("not an active driven team") >= 0 || code === "hook_rejected" || (error && error.status === 403)) {
      return "That email is not on the Driven team. Only an active team address can create a password.";
    }
    if (low.indexOf("password") >= 0 && (low.indexOf("at least") >= 0 || low.indexOf("weak") >= 0 || low.indexOf("short") >= 0 || low.indexOf("pwned") >= 0 || low.indexOf("known") >= 0)) {
      return "Choose a different password. " + msg;
    }
    if (low.indexOf("rate limit") >= 0 || low.indexOf("too many") >= 0) {
      return "Too many tries. Wait a minute and try again.";
    }
    if (low.indexOf("signups not allowed") >= 0 || (low.indexOf("signup") >= 0 && low.indexOf("disabled") >= 0)) {
      return "New passwords are turned off in Supabase. Leave Allow new users to sign up on. The team hook still blocks every other email.";
    }
    return msg || "Sign-in did not work.";
  }
  function setGateMode(mode) {
    gateMode = mode;
    var lead = $("gateLead");
    var submit = $("gateSubmit");
    var toggle = $("gateMode");
    var forgot = $("gateForgot");
    var wrap2 = $("gatePassword2Wrap");
    var pass = $("gatePassword");
    var email = $("gateEmail");
    if (toggle) toggle.hidden = mode === "recovery";
    if (forgot) forgot.hidden = mode === "recovery";
    if (wrap2) wrap2.hidden = mode === "signin";
    if (pass) pass.setAttribute("autocomplete", mode === "signin" ? "current-password" : "new-password");
    if (email) email.disabled = mode === "recovery";
    if (lead) {
      lead.textContent = mode === "create"
        ? "Create a password for your work email. This does not send email. Confirm email has to be off in Supabase, or this cannot finish."
        : mode === "recovery"
          ? "Choose a new password. Saving it does not send another email."
          : "Sign in with your work email and password. Day-to-day sign-in does not send email.";
    }
    if (submit) {
      submit.textContent = mode === "create" ? "Create password and sign in" : mode === "recovery" ? "Save new password" : "Sign in";
    }
    if (toggle && mode !== "recovery") toggle.textContent = mode === "create" ? "Already have a password? Sign in" : "First time? Create your password";
  }
  function blocked() { return held || hooks.isHeld(); }

  async function signIn() {
    var email = readGateEmail();
    var password = $("gatePassword") ? $("gatePassword").value : "";
    if (!emailOk(email)) { setMessage("Enter the work email on your team row.", "bad"); return; }
    var problem = passwordProblem(password, null);
    if (problem) { setMessage(problem, "bad"); return; }
    var btn = $("gateSubmit");
    if (btn) btn.disabled = true;
    setMessage("Checking the password…");
    var res = await CRMDB.db.auth.signInWithPassword({ email: email, password: password });
    if (btn) btn.disabled = false;
    if (res.error) { setMessage(plainAuthError(res.error), "bad"); return; }
    setMessage("Opening the " + place + "…");
  }
  async function createPassword() {
    var email = readGateEmail();
    var password = $("gatePassword") ? $("gatePassword").value : "";
    var again = $("gatePassword2") ? $("gatePassword2").value : "";
    if (!emailOk(email)) { setMessage("Enter the work email on your team row.", "bad"); return; }
    var problem = passwordProblem(password, again);
    if (problem) { setMessage(problem, "bad"); return; }
    var btn = $("gateSubmit");
    if (btn) btn.disabled = true;
    setMessage("Creating the password…");
    var res = await CRMDB.db.auth.signUp({ email: email, password: password });
    if (btn) btn.disabled = false;
    if (res.error) { setMessage(plainAuthError(res.error), "bad"); return; }
    var user = res.data && res.data.user;
    var identities = user && user.identities;
    if (user && identities && identities.length === 0) {
      setMessage("An account already exists for " + email + ". Sign in with that password. If you never chose one, delete that user in Supabase Authentication and create the password here.", "bad");
      return;
    }
    if (!(res.data && res.data.session)) {
      setMessage("Supabase did not sign you in. Turn off Confirm email under Authentication, Sign In / Providers, Email, then create the password again. No customer was emailed.", "bad");
      return;
    }
    setMessage("Password saved. Opening the " + place + "…");
  }
  async function forgotPassword() {
    var email = readGateEmail();
    if (!emailOk(email)) { setMessage("Enter your work email first.", "bad"); return; }
    var btn = $("gateForgot");
    if (btn) btn.disabled = true;
    setMessage("Asking Supabase to email a reset link…");
    var res = await CRMDB.db.auth.resetPasswordForEmail(email, { redirectTo: authRedirect() });
    if (btn) btn.disabled = false;
    if (res.error) { setMessage(plainAuthError(res.error), "bad"); return; }
    setMessage("If that account exists, Supabase tried to email a reset link to " + email + ". This is the only step that sends email, and the built-in sender often does not reach a Driven address. If nothing arrives, delete the Auth user and use Create your password. No customer was emailed.");
  }
  async function saveNewPassword() {
    var password = $("gatePassword") ? $("gatePassword").value : "";
    var again = $("gatePassword2") ? $("gatePassword2").value : "";
    var problem = passwordProblem(password, again);
    if (problem) { setMessage(problem, "bad"); return; }
    var btn = $("gateSubmit");
    if (btn) btn.disabled = true;
    setMessage("Saving the new password…");
    var res = await CRMDB.db.auth.updateUser({ password: password });
    if (btn) btn.disabled = false;
    if (res.error) { setMessage(plainAuthError(res.error), "bad"); return; }
    recoveryPending = false;
    if (window.history && history.replaceState) history.replaceState(null, "", location.pathname + location.search);
    var sessionRes = await CRMDB.db.auth.getSession();
    var session = sessionRes.data && sessionRes.data.session;
    setGateMode("signin");
    if (!session) { setMessage("Password saved. Sign in with it."); return; }
    await hooks.onSession(session);
  }

  var bound = false;
  function bind(options) {
    options = options || {};
    place = options.place || "CRM";
    hooks.isHeld = options.isHeld || hooks.isHeld;
    hooks.onSession = options.onSession || hooks.onSession;
    hooks.onSignedOut = options.onSignedOut || hooks.onSignedOut;
    hooks.onRecovery = options.onRecovery || hooks.onRecovery;
    setGateMode(recoveryPending ? "recovery" : "signin");
    if (bound) return;
    bound = true;
    var form = $("gateForm");
    if (form) form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (gateMode === "create") createPassword();
      else if (gateMode === "recovery") saveNewPassword();
      else signIn();
    });
    var toggle = $("gateMode");
    if (toggle) toggle.addEventListener("click", function () {
      setGateMode(gateMode === "create" ? "signin" : "create");
      setMessage("");
    });
    var forgot = $("gateForgot");
    if (forgot) forgot.addEventListener("click", function () { forgotPassword(); });
    CRMDB.db.auth.onAuthStateChange(function (event, session) {
      if (event === "TOKEN_REFRESHED" || event === "USER_UPDATED") return;
      if (event === "PASSWORD_RECOVERY") {
        recoveryPending = true;
        hooks.onRecovery();
        setGateMode("recovery");
        setMessage("Choose a new password. Saving it does not send another email.");
        return;
      }
      if (blocked()) return;
      if (!session) {
        hooks.onSignedOut();
        return;
      }
      if (recoveryPending) {
        setGateMode("recovery");
        return;
      }
      if (event === "INITIAL_SESSION" || event === "SIGNED_IN") hooks.onSession(session);
    });
  }

  window.CRMAuth = {
    bind: bind,
    isRecovery: function () { return recoveryPending; },
    hold: function (value) { held = !!value; },
    setMessage: setMessage,
    plainAuthError: plainAuthError
  };
})();
