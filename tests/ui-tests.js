#!/usr/bin/env node
/* ui-tests — the Study page in a real DOM (jsdom).
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * (c) 2026 Dr Sohil Momin
 *
 * The engine has its own suite, including the spec's countable done-means. This one
 * proves the page is wired to it: a page of notes becomes cards on screen, the answer
 * is a piece of the page, grading "again" schedules the card before "easy" does, the
 * deck survives a reload with its dates, a corrupt deck is reported rather than
 * overwritten, and the tutor asks without ever stating the answer.
 *
 *   npm install --no-save jsdom && node tests/ui-tests.js
 */
"use strict";

var fs = require("fs");
var path = require("path");
var { JSDOM } = require("jsdom");

var ROOT = path.join(__dirname, "..");
var PLAY = path.join(ROOT, "docs", "play");
var PAGE = path.join(PLAY, "index.html");

var passed = 0;
var failed = [];
function ok(name, cond, detail) { if (cond) { passed++; return; } failed.push(name + (detail ? " — " + detail : "")); }
function eq(name, a, b) { ok(name, a === b, "expected " + JSON.stringify(b) + ", got " + JSON.stringify(a)); }

var NOTES = [
  "Respiration",
  "Respiration is the process by which cells release energy from glucose.",
  "Mitochondria are the organelles where respiration happens.",
  "Glycolysis is the first stage of respiration and happens in the cytoplasm.",
  "The Krebs cycle is the second stage of respiration.",
  "Oxygen is needed for the Krebs cycle to run.",
  "Lactic acid builds up in muscles when oxygen is short.",
  "Carbon dioxide is released during the Krebs cycle.",
  "Water is produced at the end of the chain.",
  "ATP is the energy currency of the cell.",
  "ATP is produced in every stage of respiration."
].join("\n");

function build(seed) {
  var html = fs.readFileSync(PAGE, "utf8");
  var dom = new JSDOM(html, { url: "https://example.test/play/index.html", runScripts: "outside-only", pretendToBeVisual: true });
  var w = dom.window;
  if (seed) Object.keys(seed).forEach(function (k) { w.localStorage.setItem(k, seed[k]); });
  w.URL.createObjectURL = function () { return "blob:x"; };
  w.URL.revokeObjectURL = function () {};
  w.HTMLAnchorElement.prototype.click = function () {};
  w.confirm = function () { return true; };
  ["web-kit.js", "export-kit.js", "srs-kit.js", "study-core.js", "app.js"].forEach(function (f) {
    w.eval(fs.readFileSync(path.join(PLAY, f), "utf8"));
  });
  return dom;
}

var dom = build(null);
var w = dom.window;
var d = w.document;
var $ = function (id) { return d.getElementById(id); };

ok("the engine loaded into the page", !!w.StudyCore);
ok("the scheduler loaded into the page", !!w.Srs);
eq("the deck starts empty", $("deckEmpty").hidden, false);

/* -------------------------------------------------------- build the deck */

$("pageText").value = NOTES;
$("build").click();
ok("the deck is built", $("deckEmpty").hidden, true);
ok("the cards are counted on screen", Number($("sTotal").textContent) >= 10, $("sTotal").textContent);
ok("the scheduler is named on screen", $("sKit").textContent === "0.2.0", $("sKit").textContent);
ok("the gap finder speaks", /term\(s\)|Nothing obvious/.test($("gapOut").textContent), $("gapOut").textContent);

var q = $("qText").textContent;
ok("a question is shown", q.length > 8, q);
eq("the answer is hidden until asked for", $("answerBox").hidden, true);

$("reveal").click();
eq("the answer appears", $("answerBox").hidden, false);
var shownAnswer = $("answerBox").textContent;
ok("the answer is a piece of the page", NOTES.indexOf(shownAnswer.split("From your page:")[0].trim()) >= 0, shownAnswer);
eq("the grading buttons appear", $("gradeBar").hidden, false);

/* --------------------------------------------------- again vs easy on screen */

var before = w.StudyCore.parseDeck(w.localStorage.getItem("study:deck")).deck;
var dueBefore = {};
before.cards.forEach(function (c) { dueBefore[c.id] = c.srs.due; });

var againBtn = d.querySelector('#gradeBar button[data-grade="again"]');
againBtn.click();
ok("grading says when the card comes back", /comes back in/.test($("status").textContent), $("status").textContent);
ok("and says again is sooner than easy", /Sooner than a card you called easy/.test($("status").textContent), $("status").textContent);

var afterAgain = w.StudyCore.parseDeck(w.localStorage.getItem("study:deck")).deck;
var gradedCard = afterAgain.cards.filter(function (c) { return c.lastGrade === "again"; })[0];
ok("the grade was written to the deck", !!gradedCard);
ok("the 'again' card is due within the hour",
  gradedCard.srs.due - Date.now() <= 60 * 60 * 1000, (gradedCard.srs.due - Date.now()) / 60000 + " min");

/* the next due card, graded easy, must be due later than the again card */
$("reveal").click();
var easyBtn = d.querySelector('#gradeBar button[data-grade="easy"]');
easyBtn.click();
var afterEasy = w.StudyCore.parseDeck(w.localStorage.getItem("study:deck")).deck;
var easyCard = afterEasy.cards.filter(function (c) { return c.lastGrade === "easy"; })[0];
ok("the 'easy' card is due later than the 'again' card", easyCard.srs.due > gradedCard.srs.due,
  easyCard.srs.due + " vs " + gradedCard.srs.due);

/* ---------------------------------------------------------------- reload */

var saved = w.localStorage.getItem("study:deck");
ok("the deck was written to the device", !!saved);
var dom2 = build({ "study:deck": saved });
var d2 = dom2.window.document;
ok("the reload keeps the cards", Number(d2.getElementById("sTotal").textContent) >= 10,
  d2.getElementById("sTotal").textContent);
var reloaded = dom2.window.StudyCore.parseDeck(dom2.window.localStorage.getItem("study:deck")).deck;
eq("the reload keeps the review dates", reloaded.cards[0].srs.due, afterEasy.cards[0].srs.due);

/* ---------------------------------------------------------------- export */

$("exportJson").click();
ok("the export names the file it wrote", /Wrote study-deck-\d{4}-\d\d-\d\d\.json/.test($("deckNote").textContent),
  $("deckNote").textContent);
w.URL.createObjectURL = function () { throw new Error("storage is full"); };
$("exportJson").click();
ok("a failed export says the file was not written", /not written/.test($("status").textContent), $("status").textContent);
eq("the deck survives a failed export", Number($("sTotal").textContent) >= 10, true);
w.URL.createObjectURL = function () { return "blob:x"; };

/* ----------------------------------------------------------------- tutor */

$("tab-tutor").click();
eq("the tutor panel shows", $("panel-tutor").hidden, false);

$("subject").value = "quantum mechanics";
$("tutorStart").click();
ok("a subject that is not in the deck is refused", /not in your notes/.test($("status").textContent), $("status").textContent);
eq("no question is asked about it", d.querySelectorAll("#transcript .turn.app").length, 0);

$("subject").value = "respiration";
$("tutorStart").click();
ok("a subject in the deck starts a session", /Asking about/.test($("status").textContent), $("status").textContent);
var first = d.querySelector("#transcript .turn.app");
ok("a question is asked", !!first && /\?/.test(first.textContent), first && first.textContent);
ok("the question does not contain an answer", !/energy currency of the cell/.test($("transcript").textContent),
  $("transcript").textContent);

$("tutorSay").value = "";
$("tutorSend").click();
ok("an empty turn is refused", /empty turn is refused/.test($("status").textContent), $("status").textContent);

$("tutorSay").value = "it is how cells get energy";
$("tutorSend").click();
ok("a real turn gets another question", d.querySelectorAll("#transcript .turn.app").length >= 2);
ok("still no answer stated", !/energy currency of the cell/.test($("transcript").textContent), $("transcript").textContent);

$("tutorSay").value = "not sure";
$("tutorSend").click();
$("tutorSay").value = "still not sure";
$("tutorSend").click();
ok("after the fixed attempts it points at the notes", /In your notes/.test($("transcript").textContent),
  $("transcript").textContent);
eq("the input is closed after the reveal", $("tutorSay").hidden, true);

/* ------------------------------------------- a corrupt deck on reload */

var dom3 = build({ "study:deck": "{ broken deck" });
var d3 = dom3.window.document;
ok("a corrupt deck is reported", /not readable JSON/.test(d3.getElementById("status").textContent),
  d3.getElementById("status").textContent);
ok("it offers an export of the unreadable deck",
  Array.prototype.some.call(d3.querySelectorAll("button"), function (b) { return /Export the unreadable deck/.test(b.textContent); }));
ok("and a deliberate new deck, not a silent one",
  Array.prototype.some.call(d3.querySelectorAll("button"), function (b) { return /Start a new deck/.test(b.textContent); }));
ok("the corrupt deck is not overwritten", /broken deck/.test(dom3.window.localStorage.getItem("study:deck")),
  dom3.window.localStorage.getItem("study:deck"));

var total = passed + failed.length;
if (!total) { console.error("ui-tests: 0 assertions ran. That is a failure, not a pass."); process.exit(1); }
if (failed.length) {
  console.error("ui-tests: " + passed + "/" + total + " passed, " + failed.length + " FAILED");
  failed.forEach(function (f) { console.error("  FAIL " + f); });
  process.exit(1);
}
console.log("ui-tests: " + passed + "/" + total + " assertions passed");
dom.window.close(); dom2.window.close(); dom3.window.close();
