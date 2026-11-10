var assert = require("assert");
var S = require("./crm-vendor-score.js");

assert.strictEqual(S.status(null), "Not rated");
assert.strictEqual(S.status({ values_fit: 4, delivery_speed: 4, communication: null }), "Not rated");
assert.strictEqual(S.status({ values_fit: 4, delivery_speed: 5, communication: 4 }), "Utilize");
assert.strictEqual(S.status({ values_fit: 5, delivery_speed: 5, communication: 5 }), "Utilize");
assert.strictEqual(S.status({ values_fit: 4, delivery_speed: 4, communication: 3 }), "Watch");
assert.strictEqual(S.status({ values_fit: 3, delivery_speed: 3, communication: 3 }), "Watch");
assert.strictEqual(S.status({ values_fit: 5, delivery_speed: 3, communication: 2 }), "Replace");
assert.strictEqual(S.status({ values_fit: 1, delivery_speed: 5, communication: 5 }), "Replace");
assert.strictEqual(S.status({ values_fit: 2, delivery_speed: 2, communication: 2 }), "Replace");

assert.strictEqual(S.trend(5, 3), "up");
assert.strictEqual(S.trend(2, 4), "down");
assert.strictEqual(S.trend(4, 4), "flat");
assert.strictEqual(S.trend(4, null), "");
assert.strictEqual(S.decision("Utilize").indexOf("Keep using") >= 0, true);
assert.strictEqual(S.decision("Watch").indexOf("backup") >= 0, true);
assert.strictEqual(S.decision("Replace").indexOf("Stop new orders") >= 0, true);

console.log("crm-vendor-score tests ok");
