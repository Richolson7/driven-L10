var assert = require("assert");
var Edit = require("./crm-contact-edit.js");

var current = { id: 7, name: "Ada", role: "Buyer", email: "ada@example.com", phone: "555-0100" };

assert.deepStrictEqual(Edit.patch(current, current), {});
assert.deepStrictEqual(Edit.patch(current, { name: "Ada Lovelace", role: "Buyer", email: "ada@example.com", phone: "555-0100" }), { name: "Ada Lovelace" });
assert.deepStrictEqual(Edit.patch(current, { name: "Ada", role: "Accounts", email: "ada@example.com", phone: "555-0100" }), { role: "Accounts" });
assert.deepStrictEqual(Edit.patch(current, { name: "Ada", role: "Buyer", email: "ada@driven.example", phone: "555-0199" }), { email: "ada@driven.example", phone: "555-0199" });
assert.deepStrictEqual(Edit.patch(current, { name: "Ada", role: "", email: " ", phone: "555-0199" }), { phone: "555-0199" });
assert.deepStrictEqual(Edit.patch(current, { name: "  ", role: "", email: "", phone: "" }), {});
assert.deepStrictEqual(Edit.patch(current, { name: "Ada", role: " Buyer ", email: "ada@example.com", phone: "555-0100" }), {});
assert.deepStrictEqual(Edit.patch({ name: "", role: null, email: null, phone: "" }, { name: "Bea", role: "AP", email: "", phone: "1" }), { name: "Bea", role: "AP", phone: "1" });
assert.strictEqual(Edit.omittedBlank(current, { name: "", role: "Buyer", email: "ada@example.com", phone: "555-0100" }), true);
assert.strictEqual(Edit.omittedBlank(current, { name: "Ada", role: "Buyer", email: "ada@example.com", phone: "555-0100" }), false);
assert.ok(!("company_id" in Edit.patch(current, { name: "Ada", role: "Buyer", email: "ada@example.com", phone: "555-0100", company_id: 99 })));

var shown = Edit.row(current, { textOk: true });
assert.ok(shown.indexOf("data-act='edit-contact' data-id='7'>Edit</button> <button class='linkbtn' data-act='del-contact' data-id='7'>Remove</button>") > 0);
assert.ok(shown.indexOf(">Save</button>") < 0);
assert.ok(shown.indexOf("data-textok='7' checked") > 0);
assert.ok(shown.indexOf(">Ada</b> · Buyer") > 0);

var form = Edit.row(current, { editing: true, textOk: false });
assert.ok(form.indexOf("value='Ada'") > 0);
assert.ok(form.indexOf(">Role</label><input id='ecRole' value='Buyer'") > 0);
assert.ok(form.indexOf("value='ada@example.com'") > 0);
assert.ok(form.indexOf("value='555-0100'") > 0);
assert.ok(form.indexOf("data-act='save-contact' data-id='7'>Save</button>") > 0);
assert.ok(form.indexOf("data-act='cancel-contact' data-id='7'>Cancel</button>") > 0);
assert.ok(form.indexOf("data-act='del-contact' data-id='7'>Remove</button>") > 0);
assert.ok(form.indexOf("data-textok='7' checked") < 0);
assert.ok(Edit.row({ id: 3, name: "A&B", role: "\"Boss\"", email: "a@b.c", phone: "" }, {}).indexOf(">A&amp;B</b>") > 0);

console.log("crm-contact-edit tests ok");
