var assert = require("assert");
var fs = require("fs");
var path = require("path");
var Portal = require("./crm-customer-portal.js");

var src = fs.readFileSync(path.join(__dirname, "crm-customer-portal.js"), "utf8");
assert.ok(src.indexOf("localStorage") < 0, "password must not be written to localStorage");
assert.ok(src.indexOf("sessionStorage") < 0, "password must not be written to sessionStorage");
assert.ok(src.indexOf("console.") < 0, "password must not be logged");
assert.ok(src.indexOf("customer_email_sending: true") < 0);
assert.ok(src.indexOf("signInWithPassword") < 0);
assert.ok(src.indexOf("resetPasswordForEmail") < 0);
assert.ok(src.indexOf("vmi_set_temporary_password") >= 0);
assert.ok(src.indexOf("vmi_set_portal_access") >= 0);
assert.ok(src.indexOf("vmi_invite_portal_user") >= 0);
assert.ok(src.indexOf("vmi_grant_portal_contact") >= 0);

assert.strictEqual(Portal.allowPreview("localhost", "?portalPreview=1"), true);
assert.strictEqual(Portal.allowPreview("127.0.0.1", "?view=pipeline&portalPreview=1"), true);
assert.strictEqual(Portal.allowPreview("localhost", ""), false);
assert.strictEqual(Portal.allowPreview("richolson7.github.io", "?portalPreview=1"), false);
assert.strictEqual(Portal.allowPreview("driven-vmi-portal.vercel.app", "?portalPreview=1"), false);

var bytes = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
var password = Portal.temporaryPassword(bytes);
assert.strictEqual(password, Portal.temporaryPassword(bytes));
assert.ok(password.length >= 8);
assert.ok(/^[A-HJ-NP-Za-kmn-z2-9-]+$/.test(password));
assert.strictEqual((password.match(/-/g) || []).length, 2);

var blurb = Portal.tellThem("casey.buyer@example.com", password);
assert.ok(blurb.indexOf("https://driven-vmi-portal.vercel.app") >= 0);
assert.ok(blurb.indexOf("casey.buyer@example.com") >= 0);
assert.ok(blurb.indexOf(password) >= 0);
assert.ok(blurb.indexOf("Change the password after the first sign-in.") >= 0);
assert.ok(blurb.indexOf("No email was sent.") >= 0);

var card = Portal.passwordCard("Casey Buyer", "casey.buyer@example.com", password);
assert.ok(card.indexOf("What to tell them") >= 0);
assert.ok(card.indexOf("data-cpu-secret") >= 0);
assert.ok(card.indexOf("cpu-copy") >= 0);
assert.ok(card.indexOf(password) >= 0);
assert.ok(card.indexOf("<input") < 0);

var sample = Portal.previewSample();
var directory = Portal.buildDirectory(sample);
assert.strictEqual(directory.length, 2);
assert.strictEqual(directory[0].title, "Anchor Paper (River Valley Converting)");
assert.strictEqual(directory[0].company_id, 220);
assert.strictEqual(directory[0].parts, 24);
assert.ok(directory[0].meta.indexOf("Company 220") >= 0);
assert.ok(directory[0].meta.indexOf("record name DELETE") >= 0);
assert.ok(directory[0].meta.indexOf("2552 Prairie Drive") >= 0);
assert.strictEqual(directory[0].users[0].name, "Riley Admin");
assert.strictEqual(directory[0].users[0].role, "customer_admin");
assert.strictEqual(directory[1].title, "Kempf Paper");
assert.strictEqual(directory[1].parts, 4);
assert.strictEqual(directory[1].users.length, 2);
assert.strictEqual(directory[1].users[0].name, "Avery Count");
assert.strictEqual(directory[1].users[0].access, false);
assert.strictEqual(directory[1].users[1].email, "casey.buyer@example.com");
assert.ok(directory[1].meta.indexOf("4 parts") >= 0);
assert.ok(directory[1].meta.indexOf("3145 NE Columbia Ave") >= 0);

var html = Portal.directoryHtml({
  team: true,
  ready: true,
  preview: true,
  emailSending: false,
  note: "",
  directory: directory
});
assert.ok(html.indexOf("Open customer portal") >= 0);
assert.ok(html.indexOf("https://driven-vmi-portal.vercel.app") >= 0);
assert.ok(html.indexOf("Kempf Paper") >= 0);
assert.ok(html.indexOf("Anchor Paper (River Valley Converting)") >= 0);
assert.ok(html.indexOf("24 parts") >= 0);
assert.ok(html.indexOf("casey.buyer@example.com") >= 0);
assert.ok(html.indexOf("Set temporary password") >= 0);
assert.ok(html.indexOf("Turn access off") >= 0);
assert.ok(html.indexOf("Turn access on") >= 0);
assert.ok(html.indexOf("Customer email sending stays off") >= 0);
assert.ok(html.indexOf(password) < 0);
assert.ok(html.indexOf("ask Rich or Frank") >= 0);

var blocked = Portal.directoryHtml({ team: true, ready: true, emailSending: true, directory: directory });
assert.ok(blocked.indexOf("Temporary passwords stay blocked") >= 0);
var riley = blocked.slice(blocked.indexOf("Riley Admin"), blocked.indexOf("Avery Count"));
assert.ok(riley.indexOf("disabled") >= 0);
var open = Portal.directoryHtml({ team: true, ready: true, emailSending: false, directory: directory });
var casey = open.slice(open.indexOf("Casey Buyer"), open.indexOf("</table>"));
assert.ok(casey.indexOf("disabled") < 0);

assert.ok(Portal.directoryHtml({ team: false, ready: true }).indexOf("Driven team members") >= 0);
assert.strictEqual(Portal.accountTitle({ company_id: 169, company_name: "Kempf Paper", billed_name: "Kempf Paper" }), "Kempf Paper");
assert.strictEqual(
  Portal.accountTitle({ company_id: 220, company_name: "DELETE", billed_name: "Anchor Paper (River Valley Converting)" }),
  "Anchor Paper (River Valley Converting)"
);
assert.ok(Portal.staffLoginNote({ code: "PGRST202", message: "Could not find the function" }).indexOf("Ask Rich or Frank") >= 0);
assert.strictEqual(Portal.staffLoginNote({ message: "Name and email are required" }), "");

console.log("crm-customer-portal tests ok");
