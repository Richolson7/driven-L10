var assert = require("assert");
var fs = require("fs");
var path = require("path");

var root = path.join(__dirname, "..");
var html = fs.readFileSync(path.join(root, "call-playbook.html"), "utf8");
var index = fs.readFileSync(path.join(root, "index.html"), "utf8");

function extractJson(source) {
  var open = '<script type="application/json" id="rubric-json">';
  var i = source.indexOf(open);
  assert.ok(i > 0, "rubric json missing");
  var j = source.indexOf("</script>", i);
  return JSON.parse(source.slice(i + open.length, j));
}

var start = html.indexOf("/* @score-fn:start */");
var end = html.indexOf("/* @score-fn:end */");
assert.ok(start > 0 && end > start, "score function markers missing");
var summarizeSession = new Function(html.slice(start, end) + "\nreturn summarizeSession;")();

var scriptOpen = html.lastIndexOf("<script>");
var scriptClose = html.lastIndexOf("</script>");
new Function(html.slice(scriptOpen + "<script>".length, scriptClose));

var rubric = extractJson(html);
assert.strictEqual(rubric.pass_threshold.value, 4);
assert.strictEqual(rubric.pass_threshold.compare, ">=");
assert.strictEqual(rubric.pass_threshold.confirmed, false);
assert.strictEqual(rubric.criteria.length, 7);
assert.deepStrictEqual(rubric.criteria.map(function (c) { return c.id; }), [
  "opener", "discovery", "objections", "qualifying", "close", "product_accuracy", "crm_notes"
]);
rubric.criteria.forEach(function (c) {
  assert.strictEqual(c.weight, 1);
  assert.strictEqual(c.weight_source, "inferred_equal");
  assert.ok(c.anchors["1"] && c.anchors["3"] && c.anchors["5"]);
  assert.strictEqual(c.description_source, "inferred_from_anchors");
});
assert.strictEqual(rubric.criteria[0].anchors["5"], "Crisp, confident, on-script");
assert.strictEqual(rubric.criteria[5].anchors["1"], "Broker / wrong terms");

function entries(scores) {
  return scores.map(function (score, i) {
    return { weight: rubric.criteria[i].weight, score: score };
  });
}
var threshold = rubric.pass_threshold;

var blank = summarizeSession(entries([null, null, null, null, null, null, null]), threshold);
assert.strictEqual(blank.scored, 0);
assert.strictEqual(blank.total, 7);
assert.strictEqual(blank.runningAverage, null);
assert.strictEqual(blank.sessionAverage, null);
assert.strictEqual(blank.result, null);

var partial = summarizeSession(entries([5, 3, 1, null, null, null, null]), threshold);
assert.strictEqual(partial.scored, 3);
assert.strictEqual(partial.runningAverage, 3);
assert.strictEqual(partial.sessionAverage, null);
assert.strictEqual(partial.result, null);

var atMark = summarizeSession(entries([4, 4, 4, 4, 4, 4, 4]), threshold);
assert.strictEqual(atMark.sessionAverage, 4);
assert.strictEqual(atMark.result, "pass");

var under = summarizeSession(entries([4, 4, 4, 4, 4, 4, 3]), threshold);
assert.ok(under.sessionAverage < 4);
assert.strictEqual(Number(under.sessionAverage.toFixed(2)), 3.86);
assert.strictEqual(under.result, "fail");

var mixed = summarizeSession(entries([5, 5, 5, 5, 5, 5, 1]), threshold);
assert.strictEqual(Number(mixed.sessionAverage.toFixed(2)), 4.43);
assert.strictEqual(mixed.result, "pass");

var weighted = summarizeSession([
  { weight: 3, score: 5 },
  { weight: 1, score: 1 }
], threshold);
assert.strictEqual(weighted.sessionAverage, 4);
assert.strictEqual(weighted.result, "pass");

var unknownCompare = summarizeSession(entries([5, 5, 5, 5, 5, 5, 5]), { value: 4, compare: ">" });
assert.strictEqual(unknownCompare.sessionAverage, 5);
assert.strictEqual(unknownCompare.result, null);

var junk = summarizeSession([{ weight: 1, score: 0 }, { weight: 1, score: 2.5 }, { weight: 1, score: 4 }], threshold);
assert.strictEqual(junk.scored, 1);
assert.strictEqual(junk.sessionAverage, null);
assert.strictEqual(junk.result, null);

var scripts = [
  "We engineer the cases, film and skids, keep safety stock on hand, and deliver on our own truck — so customers have one number to call.",
  '"Hi, this is [name] with Driven Solutions in River Falls. I\'ll be quick. We supply the cases, stretch wrap, skids and film plants ship on. We keep backup stock for you and deliver on our own truck. Who handles packaging buying there?"',
  '"I\'m not calling to sell you anything today. I just want to see if it\'s worth 15 minutes with Rich, our owner."',
  '"What do you ship your product in? Cases, pallets, stretch wrap?"',
  '"Who supplies that now, and how\'s it going?"',
  '"Have you ever run short or had a late delivery hold up a line?"',
  '"Anything changing soon, like new lines, more volume or a new building?"',
  '"Totally fair. Is that because you\'re set on packaging, or just bad timing?"',
  "Then ask discovery question 4.",
  '"Most people we talk to do. We\'re usually the backup that turns into the main supplier when somebody runs short. Would it hurt to have a second option?"',
  "none stated",
  '"Happy to. So I send the right thing, what do you buy the most of?" Then: "Rich can walk you through it in 15 minutes. Is Tuesday or Thursday better?"',
  "Choice close for a 15-minute meeting with Rich.",
  '"Sure. What day and time works best?"',
  "Calendar it on the call; call back exactly then.",
  '"Sounds like it\'s worth a quick sit-down. Rich, our owner, handles these himself. Does Tuesday at 10 or Thursday at 2 work for 15 minutes?"',
  "They ship physical product",
  "They buy cases, wrap, skids or film regularly",
  "You're talking to the buyer, or someone who will get Rich in front of the buyer",
  "They're within reach of our truck",
  "They've mentioned at least one problem or upcoming change",
  "NEXT_STEP: follow_up YYYY-MM-DD",
  "Do not invent contacts, emails, or results",
  "Use plain language on calls. Don't oversell engineering — Rich handles that.",
  "Driven's own truck to the customer, not a brokered carrier move.",
  "backup inventory held so the line doesn't stop.",
  '"we keep backup stock and manage the program," not brokerage.',
  "Inbound freight (carriers bringing material",
  "is <strong>not</strong> a service Driven sells.",
  "Morning: write opener + 4 questions from memory (no peeking)",
  "Midday: drill each objection once",
  "Afternoon: full playbook run-through to the close",
  "Record yourself once; listen for filler words and speed",
  '5-minute product + "own truck / no brokerage" recitation',
  "Read opener + discovery questions once",
  "Log CRM same day; note objection heard",
  "One full playbook run; one glossary term flashcard",
  "Rubric role-play + recording review",
  "Score each role-play 1–5.",
  "Passing average: ______ (Rich to confirm; suggested start 4.0)",
  "Provisional: 4.0, not yet confirmed.",
  "Average this session: ______",
  "Trainer initials: ______",
  "(sum of the 7 scores) ÷ 7",
  "Morning role-play with Rich (or assigned trainer)",
  "full playbook × 3",
  "what worked · one fix for next call · one product term to study.",
  "No voicemail script.",
  "No gatekeeper script",
  "No meeting-confirmation step.",
  "Who handles packaging buying there?",
  "Nothing on what happens below the pass mark",
  'Follow-up after "Call me back later"',
  "call back exactly then",
  "Notes for Rich",
  "driven-call-playbook-session"
];
scripts.forEach(function (s) {
  assert.ok(html.indexOf(s) !== -1, "missing wording: " + s);
});

var allowedBroker = [
  "Never call Driven a broker or freight broker.",
  "Broker / wrong terms",
  "never a broker.",
  "not a brokered carrier move.",
  "not brokerage.",
  "own truck / no brokerage"
];
var rest = html;
allowedBroker.forEach(function (phrase) {
  assert.ok(html.indexOf(phrase) !== -1, "missing source phrase: " + phrase);
  rest = rest.split(phrase).join("");
});
assert.ok(!/broker/i.test(rest), "unexpected broker wording");

assert.ok(!/\bDISC\b|\bpersonality\b/i.test(html));
assert.ok(!/commission/i.test(html));
var withoutScope = html.replace("Pay and bonus items in the source are left out on purpose.", "");
assert.ok(!/bonus/i.test(withoutScope));
assert.ok(!/\$\d/.test(html));
["supabase", "fetch(", "xmlhttprequest", "password", "sign-off", "certif", "login"].forEach(function (word) {
  assert.ok(html.toLowerCase().indexOf(word) === -1, "unexpected " + word);
});
assert.ok(html.indexOf("localStorage") !== -1);
assert.ok(!/type="checkbox"/.test(html));
assert.strictEqual((html.match(/class="box"/g) || []).length, 5);
["nav-home", "nav-back", "setter-name", "scorer", "session-date", "print-sheet", "copy-summary", "reset-sheet", "rich-notes"].forEach(function (id) {
  assert.ok(html.indexOf('id="' + id + '"') !== -1, id);
});
assert.ok(html.indexOf(">Print<") !== -1);
assert.ok(html.indexOf(">Copy summary<") !== -1);
assert.ok(html.indexOf(">Reset<") !== -1);
assert.ok(html.indexOf('href="index.html"') !== -1);

var salesAt = index.indexOf('id="panel-sales"');
var serviceAt = index.indexOf('id="panel-service"');
assert.ok(salesAt > 0 && serviceAt > salesAt);
var sales = index.slice(salesAt, serviceAt);
assert.ok(sales.indexOf('href="call-playbook.html"') !== -1);
assert.ok(sales.indexOf("Call Playbook") !== -1);
var betweenTools = index.slice(index.indexOf('href="crm.html"'), index.indexOf('href="huddle.html"'));
assert.ok(betweenTools.indexOf('href="call-playbook.html"') !== -1, "link should sit next to CRM");

console.log("unit ok");

async function browserCheck() {
  var puppeteer = require("puppeteer-core");
  var browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
    headless: "new",
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
  });
  var page = await browser.newPage();
  var errors = [];
  var blocked = [];
  page.on("pageerror", function (err) { errors.push(String(err)); });
  page.on("request", function (req) {
    var url = req.url();
    if (/supabase|googleapis\.com\/(?!css)/i.test(url) && !/fonts\.(googleapis|gstatic)\.com/.test(url)) blocked.push(url);
  });
  await page.goto(process.env.PLAYBOOK_URL, { waitUntil: "networkidle0" });
  assert.deepStrictEqual(blocked, []);
  assert.strictEqual(await page.$$eval(".criterion", function (els) { return els.length; }), 7);
  var opener = await page.$eval(".criterion[data-id='opener']", function (el) { return el.innerText; });
  assert.ok(opener.indexOf("Opener clarity & pace") !== -1);
  assert.ok(opener.indexOf("Unclear / rushed") !== -1);
  assert.ok(opener.indexOf("Crisp, confident, on-script") !== -1);
  assert.ok(opener.indexOf("(inferred)") !== -1);
  assert.strictEqual(await page.$$eval(".qualify input", function (els) { return els.length; }), 0);
  assert.strictEqual(await page.$eval("#rich-notes", function (el) { return el.open; }), false);
  await page.click("#rich-notes summary");
  assert.strictEqual(await page.$eval("#rich-notes", function (el) { return el.open; }), true);
  assert.ok((await page.$eval("#pass-note", function (el) { return el.textContent; })).indexOf("Provisional pass mark: 4.0, pending Rich's confirmation") !== -1);

  await page.evaluate(function () {
    localStorage.setItem("driven-call-playbook-session", "{");
  });
  await page.reload({ waitUntil: "networkidle0" });
  assert.strictEqual(await page.$$eval(".criterion", function (els) { return els.length; }), 7);

  await page.evaluate(function () {
    localStorage.setItem("driven-call-playbook-session", JSON.stringify({
      setter: "Stored Setter",
      scorer: "RS",
      date: "2026-11-09",
      scores: { opener: 9, discovery: 2 },
      notes: { opener: "kept note" }
    }));
  });
  await page.reload({ waitUntil: "networkidle0" });
  assert.strictEqual(await page.$eval("#setter-name", function (el) { return el.value; }), "Stored Setter");
  assert.strictEqual(await page.$eval("#scorer", function (el) { return el.value; }), "RS");
  assert.strictEqual(await page.$eval("#session-date", function (el) { return el.value; }), "2026-11-09");
  assert.strictEqual(await page.$eval(".criterion[data-id='opener']", function (el) {
    var picked = el.querySelector("input:checked");
    return picked ? picked.value : "";
  }), "");
  assert.strictEqual(await page.$eval(".criterion[data-id='discovery'] input:checked", function (el) { return el.value; }), "2");
  assert.strictEqual(await page.$eval("#notes-opener", function (el) { return el.value; }), "kept note");
  assert.strictEqual(await page.$eval("#average-value", function (el) { return el.textContent; }), "2.00");
  assert.strictEqual(await page.$eval("#pass-result", function (el) { return el.textContent; }), "1 of 7 scored");
  assert.strictEqual(await page.$$eval(".criterion[data-id='discovery'] .anchors li.on", function (els) { return els.length; }), 0);

  async function pick(id, score) {
    await page.$eval(".criterion[data-id='" + id + "'] input[value='" + score + "']", function (el) { el.click(); });
  }
  var ids = ["opener", "discovery", "objections", "qualifying", "close", "product_accuracy", "crm_notes"];
  for (var i = 0; i < ids.length; i++) await pick(ids[i], 3);
  assert.strictEqual(await page.$eval("#average-value", function (el) { return el.textContent; }), "3.00");
  assert.strictEqual(await page.$eval("#pass-result", function (el) { return el.textContent; }), "Fail");
  assert.ok((await page.$eval("#result", function (el) { return el.className; })).indexOf("is-fail") !== -1);

  for (var j = 0; j < ids.length; j++) await pick(ids[j], 4);
  await page.type("#notes-close", "Choice close was clear");
  assert.strictEqual(await page.$eval("#average-value", function (el) { return el.textContent; }), "4.00");
  assert.strictEqual(await page.$eval("#pass-result", function (el) { return el.textContent; }), "Pass");
  assert.strictEqual(await page.$eval("#average-label", function (el) { return el.textContent; }), "Average this session");

  await page.$eval("#setter-name", function (el) { el.value = ""; });
  await page.type("#setter-name", "Ada Setter");
  await page.$eval("#scorer", function (el) { el.value = ""; });
  await page.type("#scorer", "RO");
  await page.$eval("#session-date", function (el) {
    el.value = "2026-11-09";
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });

  await page.reload({ waitUntil: "networkidle0" });
  assert.strictEqual(await page.$eval("#setter-name", function (el) { return el.value; }), "Ada Setter");
  assert.strictEqual(await page.$eval("#scorer", function (el) { return el.value; }), "RO");
  assert.strictEqual(await page.$eval("#session-date", function (el) { return el.value; }), "2026-11-09");
  assert.strictEqual(await page.$eval("#notes-close", function (el) { return el.value; }), "Choice close was clear");
  assert.strictEqual(await page.$eval("#pass-result", function (el) { return el.textContent; }), "Pass");
  assert.strictEqual(await page.$eval(".criterion[data-id='opener'] input:checked", function (el) { return el.value; }), "4");

  await page.evaluate(function () {
    window.__copied = "";
    var write = function (text) { window.__copied = text; return Promise.resolve(); };
    if (!navigator.clipboard) navigator.clipboard = { writeText: write };
    else navigator.clipboard.writeText = write;
  });
  await page.click("#copy-summary");
  var copied = await page.evaluate(function () { return window.__copied; });
  assert.ok(copied.indexOf("Setter: Ada Setter") !== -1, copied);
  assert.ok(copied.indexOf("Scorer: RO") !== -1, copied);
  assert.ok(copied.indexOf("Date: 2026-11-09") !== -1, copied);
  assert.ok(copied.indexOf("1. Opener clarity & pace: 4") !== -1, copied);
  assert.ok(copied.indexOf("5. Close / hand-off: 4") !== -1, copied);
  assert.ok(copied.indexOf("Notes: Choice close was clear") !== -1, copied);
  assert.ok(copied.indexOf("Average this session: 4.00") !== -1, copied);
  assert.ok(copied.indexOf("Provisional pass mark: 4.0 (pending Rich's confirmation)") !== -1, copied);
  assert.ok(copied.indexOf("Result: Pass") !== -1, copied);

  if (process.env.ARTIFACTS) {
    await page.setViewport({ width: 1280, height: 900 });
    await page.evaluate(function () {
      document.getElementById("result").scrollIntoView({ block: "center" });
    });
    await page.screenshot({ path: path.join(process.env.ARTIFACTS, "call_playbook_score_pass.png") });
    await page.evaluate(function () { window.scrollTo(0, 0); });
    await page.screenshot({ path: path.join(process.env.ARTIFACTS, "call_playbook_top.png") });
  }

  page.once("dialog", function (dialog) {
    assert.ok(/Clear this scoring session on this browser/.test(dialog.message()));
    return dialog.accept();
  });
  await page.click("#reset-sheet");
  assert.strictEqual(await page.$eval("#setter-name", function (el) { return el.value; }), "");
  assert.strictEqual(await page.$eval("#scorer", function (el) { return el.value; }), "");
  assert.strictEqual(await page.$eval("#notes-close", function (el) { return el.value; }), "");
  assert.strictEqual(await page.$eval("#pass-result", function (el) { return el.textContent; }), "Enter all 7 scores");
  assert.strictEqual(await page.evaluate(function () { return localStorage.getItem("driven-call-playbook-session"); }), null);
  assert.strictEqual(await page.$eval("#nav-home", function (el) { return el.getAttribute("href"); }), "index.html");
  assert.deepStrictEqual(errors, []);
  await browser.close();
  console.log("browser ok");
}

if (process.env.RUN_BROWSER === "1") {
  browserCheck().catch(function (err) {
    console.error(err);
    process.exit(1);
  });
}
