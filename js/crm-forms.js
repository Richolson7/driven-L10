/* Setup packet downloads from the private crm-forms bucket.
   Customer files are stored under customer/. Vendor files are under vendor/.
   Names keep the real extension. The vendor NDA is a .docx, not a PDF.
   This file does not talk to the network by itself. crm-app.js passes the
   signed-in Supabase client in. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.CRMForms = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var BUCKET = "crm-forms";
  var SIGNED_SECONDS = 60;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function files(kind, names) {
    var folder = kind === "vendor" ? "vendor" : "customer";
    return (names || []).map(function (name) {
      return { kind: folder, name: name, path: folder + "/" + name };
    });
  }

  function lead() {
    return "Click a file to download it. Signed-in team members get a short-lived link. The files stay in private storage.";
  }

  function section(opts) {
    var kind = opts.kind === "vendor" ? "vendor" : "customer";
    var title = opts.title || (kind === "vendor" ? "Vendor packet" : "Setup packet");
    var list = files(kind, opts.names || []);
    var rows = list.map(function (file) {
      return "<div class='cf'><button type='button' class='packet-file' data-act='packet-dl' data-kind='" + kind + "' data-path='" + esc(file.path) + "' data-name='" + esc(file.name) + "'>" + esc(file.name) + "</button></div>";
    }).join("");
    rows += "<div class='cf'><button type='button' class='ghost' data-act='packet-all' data-kind='" + kind + "'>Download all</button></div>";
    return "<div class='sect' data-packet='" + kind + "'><h2>" + esc(title) + "</h2><p class='lead'>" + lead() + "</p><div class='panel'>" + rows + "</div><p class='packet-status' id='packet-status-" + kind + "' role='status'></p></div>";
  }

  function signedOut(name) {
    return name ? "Sign in to download " + name + "." : "Sign in to download setup packet files.";
  }

  function failureText(file, error) {
    var msg = String((error && (error.message || error.error)) || "");
    var code = String((error && (error.statusCode || error.status)) || "");
    var low = (msg + " " + code).toLowerCase();
    if (code === "404" || low.indexOf("not found") >= 0 || low.indexOf("not_found") >= 0 || low.indexOf("does not exist") >= 0) {
      return file.name + " is not in storage.";
    }
    if (code === "401" || code === "403" || low.indexOf("unauthorized") >= 0 || low.indexOf("permission") >= 0 || low.indexOf("jwt") >= 0 || low.indexOf("not authorized") >= 0) {
      return "Sign in with a Driven team account to download " + file.name + ".";
    }
    return "Could not download " + file.name + "." + (msg ? " " + msg : "");
  }

  function hasSession(res) {
    return !!(res && res.data && res.data.session);
  }

  function wait(deps, more) {
    if (!more) return Promise.resolve();
    if (deps.pause) return Promise.resolve(deps.pause());
    return new Promise(function (resolve) { setTimeout(resolve, 350); });
  }

  async function download(list, deps) {
    var sessionRes = null;
    try {
      sessionRes = await deps.getSession();
    } catch (e) {
      sessionRes = null;
    }
    if (!hasSession(sessionRes)) {
      var label = list.length === 1 ? list[0].name : "";
      return { ok: false, opened: 0, failures: [], message: signedOut(label) };
    }
    var opened = 0;
    var failures = [];
    var ready = [];
    for (var i = 0; i < list.length; i++) {
      var file = list[i];
      var res = null;
      try {
        res = await deps.storage.from(BUCKET).createSignedUrl(file.path, SIGNED_SECONDS, { download: file.name });
      } catch (err) {
        failures.push(failureText(file, err));
        continue;
      }
      if (!res || res.error || !res.data || !res.data.signedUrl) {
        failures.push(failureText(file, (res && res.error) || { message: "No download link came back." }));
        continue;
      }
      ready.push({ url: res.data.signedUrl, name: file.name });
    }
    for (var j = 0; j < ready.length; j++) {
      try {
        await deps.openUrl(ready[j].url, ready[j].name);
        opened += 1;
      } catch (err2) {
        failures.push("Could not download " + ready[j].name + ". " + ((err2 && err2.message) || "The browser blocked the download."));
      }
      await wait(deps, j < ready.length - 1);
    }
    if (!opened && failures.length) {
      return { ok: false, opened: 0, failures: failures, message: failures.join(" ") };
    }
    var message = opened === 1 && list.length === 1
      ? "Downloading " + list[0].name + "."
      : "Downloading " + opened + (opened === 1 ? " file." : " files.");
    if (failures.length) message += " " + failures.join(" ");
    return { ok: failures.length === 0, opened: opened, failures: failures, message: message };
  }

  return {
    BUCKET: BUCKET,
    SIGNED_SECONDS: SIGNED_SECONDS,
    files: files,
    section: section,
    lead: lead,
    download: download,
    failureText: failureText,
    signedOut: signedOut
  };
});
