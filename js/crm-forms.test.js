var assert = require("assert");
var Forms = require("./crm-forms.js");

var CUSTOMER = ["NEW CUSTOMER FORM.pdf", "Driven Solutions W-9.pdf", "Driven INFO for Customers.pdf"];
var VENDOR = [
  "Driven New Vendor Form.pdf",
  "Driven Solutions W-9.pdf",
  "Driven S-211 WI exemption certificate.pdf",
  "Unilateral NDA.docx",
  "Driven INFO for Vendors.pdf"
];

assert.strictEqual(Forms.BUCKET, "crm-forms");
assert.strictEqual(Forms.SIGNED_SECONDS, 60);

var customerFiles = Forms.files("customer", CUSTOMER);
assert.deepStrictEqual(customerFiles.map(function (f) { return f.path; }), [
  "customer/NEW CUSTOMER FORM.pdf",
  "customer/Driven Solutions W-9.pdf",
  "customer/Driven INFO for Customers.pdf"
]);

var vendorFiles = Forms.files("vendor", VENDOR);
assert.strictEqual(vendorFiles[3].path, "vendor/Unilateral NDA.docx");
assert.strictEqual(vendorFiles[3].name, "Unilateral NDA.docx");
assert.strictEqual(vendorFiles[1].path, "vendor/Driven Solutions W-9.pdf");
assert.ok(vendorFiles[1].path !== customerFiles[1].path);

var customerHtml = Forms.section({ kind: "customer", title: "Setup packet", names: CUSTOMER });
var vendorHtml = Forms.section({ kind: "vendor", title: "Vendor packet", names: VENDOR });

assert.ok(customerHtml.indexOf("File names only") < 0);
assert.ok(vendorHtml.indexOf("File names only") < 0);
assert.ok(customerHtml.indexOf(Forms.lead()) >= 0);
assert.ok(vendorHtml.indexOf(Forms.lead()) >= 0);
assert.ok(customerHtml.indexOf(">Download all</button>") >= 0);
assert.ok(vendorHtml.indexOf(">Download all</button>") >= 0);
assert.ok(customerHtml.indexOf("data-path='customer/NEW CUSTOMER FORM.pdf'") >= 0);
assert.ok(customerHtml.indexOf("data-name='Driven INFO for Customers.pdf'") >= 0);
assert.ok(customerHtml.indexOf("Unilateral NDA.docx") < 0);
assert.ok(vendorHtml.indexOf("data-path='vendor/Unilateral NDA.docx'") >= 0);
assert.ok(vendorHtml.indexOf("data-act='packet-dl'") >= 0);
assert.ok(vendorHtml.indexOf("data-kind='vendor'") >= 0);
assert.ok(vendorHtml.indexOf("id='packet-status-vendor'") >= 0);
assert.ok(customerHtml.indexOf("id='packet-status-customer'") >= 0);

var nasty = Forms.section({ kind: "customer", title: "Setup <packet>", names: ['a"><b>.pdf'] });
assert.ok(nasty.indexOf("Setup &lt;packet&gt;") >= 0);
assert.ok(nasty.indexOf("data-name='a&quot;&gt;&lt;b&gt;.pdf'") >= 0);
assert.ok(nasty.indexOf("<b>") < 0);

function storage(handler) {
  var calls = [];
  return {
    calls: calls,
    from: function (bucket) {
      return {
        createSignedUrl: function (path, expires, opts) {
          calls.push({ bucket: bucket, path: path, expires: expires, opts: opts });
          return Promise.resolve(handler(path, expires, opts));
        }
      };
    }
  };
}

function run(list, store, session, openUrl) {
  var opened = [];
  return Forms.download(list, {
    getSession: function () { return Promise.resolve(session); },
    storage: store,
    openUrl: openUrl || function (url, name) { opened.push({ url: url, name: name }); },
    pause: function () { return Promise.resolve(); }
  }).then(function (result) {
    result.openedFiles = opened;
    return result;
  });
}

var signedIn = { data: { session: { user: { email: "orders@drivensol.com" } } } };
var signedOut = { data: { session: null } };

Promise.resolve()
  .then(function () {
    var store = storage(function () { throw new Error("should not sign a URL"); });
    return run([customerFiles[0]], store, signedOut).then(function (result) {
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.message, "Sign in to download NEW CUSTOMER FORM.pdf.");
      assert.strictEqual(store.calls.length, 0);
      return run(vendorFiles, store, { data: {} });
    }).then(function (result) {
      assert.strictEqual(result.message, "Sign in to download setup packet files.");
      assert.strictEqual(store.calls.length, 0);
    });
  })
  .then(function () {
    var store = storage(function (path) {
      return { data: { signedUrl: "https://example.test/signed/" + encodeURIComponent(path) }, error: null };
    });
    return run([vendorFiles[3]], store, signedIn).then(function (result) {
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.opened, 1);
      assert.strictEqual(result.message, "Downloading Unilateral NDA.docx.");
      assert.strictEqual(store.calls.length, 1);
      assert.deepStrictEqual(store.calls[0], {
        bucket: "crm-forms",
        path: "vendor/Unilateral NDA.docx",
        expires: 60,
        opts: { download: "Unilateral NDA.docx" }
      });
      assert.strictEqual(result.openedFiles[0].name, "Unilateral NDA.docx");
      assert.ok(result.openedFiles[0].url.indexOf("vendor%2FUnilateral%20NDA.docx") >= 0);
    });
  })
  .then(function () {
    var store = storage(function (path) {
      if (path.indexOf("NDA") >= 0) return { data: null, error: { message: "Object not found", statusCode: "404" } };
      return { data: { signedUrl: "https://example.test/" + path }, error: null };
    });
    return run(vendorFiles, store, signedIn).then(function (result) {
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.opened, 4);
      assert.ok(result.message.indexOf("Downloading 4 files.") === 0);
      assert.ok(result.message.indexOf("Unilateral NDA.docx is not in storage.") >= 0);
      assert.strictEqual(store.calls.length, 5);
      assert.ok(store.calls.every(function (call) { return call.opts.download === call.path.split("/").pop(); }));
      assert.ok(store.calls.some(function (call) { return call.opts.download === "Unilateral NDA.docx"; }));
    });
  })
  .then(function () {
    var store = storage(function () {
      return { data: null, error: { message: "Object not found", statusCode: "404" } };
    });
    return run([customerFiles[0]], store, signedIn).then(function (result) {
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.opened, 0);
      assert.strictEqual(result.message, "NEW CUSTOMER FORM.pdf is not in storage.");
    });
  })
  .then(function () {
    var store = storage(function () {
      return { data: null, error: { message: "Unauthorized", statusCode: "401" } };
    });
    return run([customerFiles[2]], store, signedIn).then(function (result) {
      assert.strictEqual(result.message, "Sign in with a Driven team account to download Driven INFO for Customers.pdf.");
    });
  })
  .then(function () {
    var store = storage(function () { return Promise.reject(new Error("network down")); });
    return run([customerFiles[1]], store, signedIn).then(function (result) {
      assert.strictEqual(result.message, "Could not download Driven Solutions W-9.pdf. network down");
    });
  })
  .then(function () {
    console.log("crm-forms tests passed");
  })
  .catch(function (err) {
    console.error(err);
    process.exit(1);
  });
