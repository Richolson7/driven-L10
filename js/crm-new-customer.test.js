/* Headless check: + Add new customer on the New deal form.
   Loads the real crm-app.js against a stub database. Nothing is written to Supabase.
   Run: node js/crm-new-customer.test.js */
var assert = require("assert");
var http = require("http");
var fs = require("fs");
var path = require("path");
var child = require("child_process");

var ROOT = path.join(__dirname);
var HARNESS = path.join(ROOT, "crm-new-customer.harness.html");
var PORT = 8765;
var chrome = process.env.CHROME || "google-chrome";

function serve() {
  return new Promise(function (resolve) {
    var server = http.createServer(function (req, res) {
      var file = path.join(ROOT, decodeURIComponent((req.url || "/").split("?")[0].replace(/^\//, "")));
      if (!file.startsWith(ROOT)) { res.writeHead(403); res.end("no"); return; }
      fs.readFile(file, function (err, buf) {
        if (err) { res.writeHead(404); res.end("missing"); return; }
        res.writeHead(200, { "Content-Type": file.endsWith(".js") ? "text/javascript" : "text/html" });
        res.end(buf);
      });
    });
    server.listen(PORT, "127.0.0.1", function () { resolve(server); });
  });
}

function getJson(url) {
  return new Promise(function (resolve, reject) {
    http.get(url, function (res) {
      var body = "";
      res.on("data", function (c) { body += c; });
      res.on("end", function () { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    }).on("error", reject);
  });
}

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function messageText(data) {
  if (typeof data === "string") return Promise.resolve(data);
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(data)) return Promise.resolve(data.toString());
  if (data && typeof data.text === "function") return data.text();
  return Promise.resolve(String(data));
}
function cdpSend(ws, id, method, params) {
  return new Promise(function (resolve, reject) {
    function onMessage(ev) {
      messageText(ev.data).then(function (text) {
        var msg = JSON.parse(text);
        if (msg.id !== id) return;
        ws.removeEventListener("message", onMessage);
        if (msg.error) reject(new Error(method + ": " + JSON.stringify(msg.error)));
        else resolve(msg.result || {});
      }).catch(reject);
    }
    ws.addEventListener("message", onMessage);
    ws.send(JSON.stringify({ id: id, method: method, params: params || {} }));
  });
}

async function waitFor(evalFn, tries) {
  for (var i = 0; i < tries; i++) {
    var out = await evalFn();
    if (out) return out;
    await sleep(100);
  }
  return null;
}

(async function () {
  var server = await serve();
  var userDir = fs.mkdtempSync("/tmp/crm-new-customer-");
  var proc = child.spawn(chrome, [
    "--headless=new", "--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage",
    "--remote-debugging-port=9334", "--remote-allow-origins=*", "--user-data-dir=" + userDir,
    "about:blank"
  ], { stdio: "ignore" });
  var version;
  for (var i = 0; i < 40; i++) {
    try { version = await getJson("http://127.0.0.1:9334/json/version"); break; } catch (e) { await sleep(100); }
  }
  if (!version) throw new Error("Chrome did not open a debugging port");
  var browser = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise(function (resolve) { browser.addEventListener("open", resolve); });
  var target = await cdpSend(browser, 1, "Target.createTarget", { url: "http://127.0.0.1:" + PORT + "/crm-new-customer.harness.html" });
  var list = await getJson("http://127.0.0.1:9334/json/list");
  var page = list.find(function (t) { return t.id === target.targetId; });
  var ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(function (resolve) { ws.addEventListener("open", resolve); });
  var seq = 1;
  function send(method, params) { return cdpSend(ws, ++seq, method, params); }
  await send("Runtime.enable");
  await send("Page.enable");

  async function evaluate(expression) {
    var res = await send("Runtime.evaluate", { expression: expression, awaitPromise: true, returnByValue: true });
    if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails));
    return res.result && res.result.value;
  }

  var ready = await waitFor(function () {
    return evaluate("!!document.querySelector(\"[data-act='new-deal']\")");
  }, 50);
  assert.ok(ready, "New deal button did not appear. " + JSON.stringify(await evaluate("({errors: window.__errors, gate: document.documentElement.dataset.crmGate, view: (document.getElementById('view')||{}).textContent || ''})")));

  await evaluate("document.querySelector(\"[data-act='new-deal']\").dataset.pipelineMark = 'stay'; document.querySelector(\"[data-act='new-deal']\").click();");
  var opened = await waitFor(function () {
    return evaluate("!!document.getElementById('ndCo') && !!document.querySelector('#ndCo option[value=__new__]')");
  }, 20);
  assert.ok(opened, "New deal form did not open");

  var typed = await evaluate("(function () {\n" +
    "  var desc = document.getElementById('ndDesc');\n" +
    "  var rep = document.getElementById('ndRep');\n" +
    "  desc.value = 'Stretch wrap for the new plant';\n" +
    "  desc.dataset.keep = 'yes';\n" +
    "  window.__desc = desc;\n" +
    "  rep.value = 'Annie';\n" +
    "  var co = document.getElementById('ndCo');\n" +
    "  co.value = '__new__';\n" +
    "  co.dispatchEvent(new Event('change', { bubbles: true }));\n" +
    "  var name = document.getElementById('nnName');\n" +
    "  name.focus();\n" +
    "  var text = 'Northwind Trading';\n" +
    "  var focusOk = true;\n" +
    "  for (var i = 0; i < text.length; i++) {\n" +
    "    name.value += text.charAt(i);\n" +
    "    name.dispatchEvent(new Event('input', { bubbles: true }));\n" +
    "    if (document.activeElement !== name || name.value !== text.slice(0, i + 1)) focusOk = false;\n" +
    "  }\n" +
    "  document.getElementById('nnCity').value = 'Eau Claire';\n" +
    "  document.getElementById('nnState').value = 'WI';\n" +
    "  document.getElementById('nnPhone').value = '715-555-0199';\n" +
    "  document.getElementById('nnCName').value = 'Jordan Lee';\n" +
    "  document.getElementById('nnCEmail').value = 'jordan@northwind.test';\n" +
    "  document.getElementById('nnCPhone').value = '715-555-0101';\n" +
    "  return { focusOk: focusOk, name: name.value, formHidden: document.getElementById('ndNew').hidden, descSame: document.getElementById('ndDesc') === window.__desc };\n" +
    "})()");
  assert.strictEqual(typed.focusOk, true, "company name input lost focus or value while typing");
  assert.strictEqual(typed.formHidden, false);
  assert.strictEqual(typed.descSame, true);
  assert.strictEqual(typed.name, "Northwind Trading");

  await evaluate("document.querySelector(\"[data-act='nd-new-ok']\").click();");
  var saved = await waitFor(function () {
    return evaluate("(function () {\n" +
      "  var co = document.getElementById('ndCo');\n" +
      "  if (!co || co.value === '__new__' || !co.value) return null;\n" +
      "  return {\n" +
      "    companyId: co.value,\n" +
      "    contactId: document.getElementById('ndCt').value,\n" +
      "    desc: document.getElementById('ndDesc').value,\n" +
      "    descKept: document.getElementById('ndDesc') === window.__desc && document.getElementById('ndDesc').dataset.keep === 'yes',\n" +
      "    rep: document.getElementById('ndRep').value,\n" +
      "    formHidden: document.getElementById('ndNew').hidden,\n" +
      "    pipelineKept: document.querySelector(\"[data-act='new-deal']\").dataset.pipelineMark === 'stay',\n" +
      "    inserts: window.__inserts\n" +
      "  };\n" +
      "})()");
  }, 30);
  assert.ok(saved, "customer was not selected after save. inserts=" + JSON.stringify(await evaluate("window.__inserts")));
  assert.strictEqual(saved.desc, "Stretch wrap for the new plant");
  assert.strictEqual(saved.descKept, true, "deal description input was replaced");
  assert.strictEqual(saved.rep, "Annie");
  assert.strictEqual(saved.formHidden, true);
  assert.strictEqual(saved.pipelineKept, true, "the page re-rendered while the mini-form was in use");
  var companyInsert = saved.inserts.filter(function (x) { return x.table === "crm_companies"; });
  var contactInsert = saved.inserts.filter(function (x) { return x.table === "crm_contacts"; });
  assert.strictEqual(companyInsert.length, 1);
  assert.strictEqual(contactInsert.length, 1);
  assert.strictEqual(companyInsert[0].row.name, "Northwind Trading");
  assert.strictEqual(companyInsert[0].row.kind, "customer");
  assert.strictEqual(companyInsert[0].row.list, "active");
  assert.strictEqual(companyInsert[0].row.owner, "Annie");
  assert.strictEqual(companyInsert[0].row.billing_address, "Eau Claire, WI");
  assert.deepStrictEqual(companyInsert[0].row.custom, { phone: "715-555-0199" });
  assert.strictEqual(contactInsert[0].row.name, "Jordan Lee");
  assert.strictEqual(contactInsert[0].row.email, "jordan@northwind.test");
  assert.strictEqual(contactInsert[0].row.phone, "715-555-0101");
  assert.strictEqual(contactInsert[0].row.company_id, companyInsert[0].id);
  assert.strictEqual(saved.companyId, String(companyInsert[0].id));
  assert.strictEqual(saved.contactId, String(contactInsert[0].id));
  var selectedName = await evaluate("document.getElementById('ndCo').selectedOptions[0].textContent");
  var selectedContact = await evaluate("document.getElementById('ndCt').selectedOptions[0].textContent");
  assert.strictEqual(selectedName, "Northwind Trading");
  assert.strictEqual(selectedContact, "Jordan Lee");

  var beforeDup = saved.inserts.length;
  await evaluate("(function () {\n" +
    "  var co = document.getElementById('ndCo');\n" +
    "  co.value = '__new__';\n" +
    "  co.dispatchEvent(new Event('change', { bubbles: true }));\n" +
    "  document.getElementById('nnName').value = '  acme packaging ';\n" +
    "  document.querySelector(\"[data-act='nd-new-ok']\").click();\n" +
    "})()");
  var dup = await waitFor(function () {
    return evaluate("!!document.querySelector(\"[data-act='nd-use']\")");
  }, 20);
  assert.ok(dup, "duplicate company was not offered");
  var dupState = await evaluate("(function () {\n" +
    "  return {\n" +
    "    text: document.getElementById('ndDup').textContent,\n" +
    "    inserts: window.__inserts.length,\n" +
    "    desc: document.getElementById('ndDesc').value,\n" +
    "    descKept: document.getElementById('ndDesc') === window.__desc\n" +
    "  };\n" +
    "})()");
  assert.strictEqual(dupState.inserts, beforeDup, "a duplicate company was inserted");
  assert.ok(dupState.text.indexOf("Acme Packaging") >= 0);
  assert.ok(dupState.text.indexOf("already in the CRM") >= 0);
  assert.strictEqual(dupState.desc, "Stretch wrap for the new plant");
  assert.strictEqual(dupState.descKept, true);
  await evaluate("document.querySelector(\"[data-act='nd-use']\").click();");
  var used = await evaluate("(function () {\n" +
    "  var co = document.getElementById('ndCo');\n" +
    "  return { id: co.value, name: co.selectedOptions[0].textContent, hidden: document.getElementById('ndNew').hidden, desc: document.getElementById('ndDesc').value, rep: document.getElementById('ndRep').value };\n" +
    "})()");
  assert.strictEqual(used.id, "10");
  assert.strictEqual(used.name, "Acme Packaging");
  assert.strictEqual(used.hidden, true);
  assert.strictEqual(used.desc, "Stretch wrap for the new plant");
  assert.strictEqual(used.rep, "Annie");

  await evaluate("(function () {\n" +
    "  var co = document.getElementById('ndCo');\n" +
    "  co.value = '__new__';\n" +
    "  co.dispatchEvent(new Event('change', { bubbles: true }));\n" +
    "  document.getElementById('nnName').value = 'wrap co';\n" +
    "  document.getElementById('nnCName').value = '';\n" +
    "  document.getElementById('nnCEmail').value = '';\n" +
    "  document.getElementById('nnCPhone').value = '';\n" +
    "  document.querySelector(\"[data-act='nd-new-ok']\").click();\n" +
    "})()");
  await sleep(200);
  var vendor = await evaluate("(function () {\n" +
    "  return { inserts: window.__inserts.length, toast: document.getElementById('toasts').textContent, stillNew: document.getElementById('ndCo').value };\n" +
    "})()");
  assert.strictEqual(vendor.inserts, beforeDup);
  assert.ok(vendor.toast.indexOf("already a vendor") >= 0, vendor.toast);
  assert.strictEqual(vendor.stillNew, "__new__");

  await evaluate("document.querySelector(\".tab[data-view='training']\").click();");
  var training = await waitFor(function () {
    return evaluate("(function () { var el = document.getElementById('training-add-customer-from-deal'); return el ? el.textContent : ''; })()");
  }, 20);
  assert.ok(training && training.indexOf("Adding a new customer from a new deal") >= 0, training);
  assert.ok(training.indexOf("+ Add new customer") >= 0);

  await evaluate("document.querySelector(\".tab[data-view='pipeline']\").click();");
  var back = await waitFor(function () {
    return evaluate("!!document.querySelector(\"[data-act='new-deal']\")");
  }, 20);
  assert.ok(back, "Pipeline did not show New deal");
  await evaluate("document.querySelector(\"[data-act='new-deal']\").click();");
  var reopened = await waitFor(function () {
    return evaluate("!!document.getElementById('ndDesc')");
  }, 20);
  assert.ok(reopened, "New deal did not reopen");
  await evaluate("(function () {\n" +
    "  var co = document.getElementById('ndCo');\n" +
    "  co.value = " + JSON.stringify(String(companyInsert[0].id)) + ";\n" +
    "  co.dispatchEvent(new Event('change', { bubbles: true }));\n" +
    "  document.getElementById('ndCt').value = " + JSON.stringify(String(contactInsert[0].id)) + ";\n" +
    "  document.getElementById('ndDesc').value = 'Stretch wrap for the new plant';\n" +
    "  document.getElementById('ndRep').value = 'Annie';\n" +
    "  document.querySelector(\"[data-act='nd-ok']\").click();\n" +
    "})()");
  var created = await waitFor(function () {
    return evaluate("(function () {\n" +
      "  var deal = window.__inserts.filter(function (x) { return x.table === 'crm_deals'; })[0];\n" +
      "  if (!deal) return null;\n" +
      "  return { row: deal.row, drawer: (document.getElementById('drawer') || {}).textContent || '' };\n" +
      "})()");
  }, 30);
  assert.ok(created, "deal was not created");
  assert.strictEqual(created.row.company_id, companyInsert[0].id);
  assert.strictEqual(created.row.description, "Stretch wrap for the new plant");
  assert.strictEqual(created.row.sales_rep, "Annie");
  assert.strictEqual(created.row.custom._contact_id, contactInsert[0].id);
  assert.ok(created.drawer.indexOf("Stretch wrap for the new plant") >= 0);
  assert.ok(created.drawer.indexOf("Northwind Trading") >= 0);

  ws.close();
  browser.close();
  proc.kill();
  server.close();
  fs.rmSync(userDir, { recursive: true, force: true });
  console.log("crm-new-customer.test.js: form state kept, company and contact created and selected, duplicate offered");
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
