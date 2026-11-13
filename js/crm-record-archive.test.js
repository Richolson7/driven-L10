var assert = require("assert");
var Archive = require("./crm-record-archive.js");

var dialog = Archive.companyDialog(
  { id: 12, name: "River Valley Test", kind: "customer" },
  { deals: 2, quotes: 1, contacts: 3, orders: 1 }
);
assert.ok(dialog.indexOf("Archive River Valley Test?") >= 0);
assert.ok(dialog.indexOf("Archive River Valley Test</button>") >= 0);
assert.ok(dialog.indexOf("2 deals") >= 0);
assert.ok(dialog.indexOf("1 quote") >= 0);
assert.ok(dialog.indexOf("3 contacts") >= 0);
assert.ok(dialog.indexOf("1 order") >= 0);
assert.ok(dialog.indexOf("Delete") < 0);
assert.ok(dialog.indexOf("data-act='archive-company-go'") >= 0);

var empty = Archive.companyDialog({ id: 4, name: "Empty Vendor", kind: "vendor" }, {});
assert.ok(empty.indexOf("Archive Empty Vendor?") >= 0);
assert.ok(empty.indexOf("has ") < 0);

var quote = Archive.quoteDialog({ dealId: 8, number: "Q-104", company: "River Valley Test" });
assert.ok(quote.indexOf("Archive quote Q-104?") >= 0);
assert.ok(quote.indexOf("for River Valley Test") >= 0);
assert.ok(quote.indexOf("does not delete") >= 0);

var restore = Archive.restoreDialog({ id: 12, name: "River Valley Test" });
assert.ok(restore.indexOf("Restore River Valley Test?") >= 0);

console.log("crm-record-archive tests ok");
