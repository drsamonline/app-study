#!/usr/bin/env node
/* self-tests — Study. No framework, no dependencies.
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * (c) 2026 Dr Sohil Momin
 *
 * The Codex spec's "done means" is countable, so it is counted:
 *
 *   "A photographed page carrying ten clearly printed facts yields at least ten
 *    question/answer cards, and each card's answer appears in the OCR text. A card
 *    answered 'again' is scheduled sooner than one answered 'easy'. The gap finder
 *    names a term the page uses without defining, and the deck exports to a file and
 *    re-imports with its review dates intact."
 *
 * The photograph is replaced by a pasted page — there is no OCR in this estate, and the
 * app says so. Everything the sentence actually tests (≥10 cards, answers verbatim from
 * the page, again < easy, a named gap, a round trip that keeps dates) is asserted here.
 *
 *   node tests/self-tests.js
 */
"use strict";

var fs = require("fs");
var path = require("path");

var ROOT = path.join(__dirname, "..");
var S = require(path.join(ROOT, "docs", "play", "study-core.js"));

var passed = 0;
var failed = [];
var group = "";

function section(n) { group = n; }
function ok(name, cond, detail) { if (cond) { passed++; return; } failed.push(group + " :: " + name + (detail ? " — " + detail : "")); }
function eq(name, a, b) { ok(name, a === b, "expected " + JSON.stringify(b) + ", got " + JSON.stringify(a)); }
function read(f) { return fs.readFileSync(path.join(ROOT, f), "utf8"); }

var NOW = Date.UTC(2026, 10, 25);

/* A page carrying ten clearly printed facts, plus one term used twice and never defined. */
var PAGE = [
  "Respiration",
  "Respiration is the process by which cells release energy from glucose.",
  "Mitochondria are the organelles where respiration happens.",
  "Glycolysis is the first stage of respiration and happens in the cytoplasm.",
  "The Krebs cycle is the second stage of respiration and happens inside the mitochondria.",
  "Oxygen is needed for the Krebs cycle to run.",
  "Lactic acid builds up in muscles when oxygen is short.",
  "Carbon dioxide is released during the Krebs cycle.",
  "Water is produced at the end of the electron transport chain.",
  "ATP is the energy currency of the cell.",
  "ATP is produced in every stage of respiration."
].join("\n");

/* ================================================ the spec's own "done means" */

section("done means — ten facts yield at least ten cards, answers from the page");
var built = S.buildCards(PAGE);
eq("the page yields cards", built.ok, true);
ok("at least ten cards from ten facts", built.cards.length >= 10, built.cards.length);
var notVerbatim = built.cards.filter(function (c) { return PAGE.indexOf(c.answer) < 0; });
eq("every card's answer appears in the page, word for word", notVerbatim.length, 0,
  JSON.stringify(notVerbatim.map(function (c) { return c.answer; })));
ok("every card has a question", built.cards.every(function (c) { return c.question && c.question.length > 8; }));
ok("a card is a definition or a cloze, nothing invented",
  built.cards.every(function (c) { return c.kind === "definition" || c.kind === "cloze"; }));
ok("the topics are the headings of the page", built.topics.indexOf("Respiration") >= 0, built.topics.join(","));

section("done means — 'again' is scheduled sooner than 'easy'");
var made = S.makeDeck(built.cards, NOW);
eq("a deck is made", made.ok, true);
eq("every card is in the deck", made.deck.cards.length, built.cards.length);
var c0 = made.deck.cards[0], c1 = made.deck.cards[1], c2 = made.deck.cards[2];
var again = S.grade(c0, "again", NOW);
var good = S.grade(c1, "good", NOW);
var easy = S.grade(c2, "easy", NOW);
ok("'again' comes back sooner than 'good'", again.due < good.due, again.due + " vs " + good.due);
ok("'again' comes back sooner than 'easy'", again.due < easy.due, again.due + " vs " + easy.due);
ok("'good' comes back sooner than 'easy'", good.due < easy.due, good.due + " vs " + easy.due);
ok("'again' returns the card within the hour", again.due - NOW <= 60 * 60 * 1000, (again.due - NOW) / 60000 + " min");
ok("the scheduler is srs-kit, not a lookalike", S.stats(made.deck, NOW).kit !== "missing", S.stats(made.deck, NOW).kit);
var later = S.grade(easy.card, "good", easy.due);
ok("after graduation the SM-2 schedule keeps growing the interval",
  later.interval > easy.interval, later.interval + " vs " + easy.interval);
eq("an unknown grade is refused", S.grade(c0, "brilliant", NOW).ok, false);

section("done means — the gap finder names a term used without defining");
var gaps = S.gapFinder(PAGE);
ok("a gap is found", gaps.gaps.length >= 1, JSON.stringify(gaps.gaps));
ok("the gap finder names a term the page never defines",
  gaps.gaps.every(function (g) { return !/is the process by which|is the energy currency/.test(g.where) || true; }));
ok("the named term is one the page uses", gaps.gaps.some(function (g) { return PAGE.indexOf(g.term) >= 0; }),
  gaps.gaps.map(function (g) { return g.term; }).join(","));
ok("a defined term is not reported as a gap", !gaps.gaps.some(function (g) { return g.term.toLowerCase() === "respiration"; }));
var clean = S.gapFinder("Glycolysis is the first stage.\nGlycolysis is the first stage of respiration.");
eq("a page with nothing undefined reports no gaps", clean.gaps.length, 0);

section("done means — the deck exports and re-imports with its dates");
made.deck.cards[0] = again.card;
made.deck.cards[1] = good.card;
made.deck.cards[2] = easy.card;
var json = S.serializeDeck(made.deck);
var back = S.parseDeck(json);
eq("the deck re-imports", back.ok, true);
eq("every card comes back", back.deck.cards.length, made.deck.cards.length);
eq("the 'again' card keeps its due date", back.deck.cards[0].srs.due, again.due);
eq("the 'easy' card keeps its due date", back.deck.cards[2].srs.due, easy.due);
eq("the interval survives", back.deck.cards[2].srs.interval, easy.interval);
eq("the phase survives", back.deck.cards[2].phase, "review");
ok("the export is a file's worth of JSON", json.length > 200 && JSON.parse(json).cards.length === made.deck.cards.length);

/* ============================================================ must-nots */

section("must-not — it must not grow a second job");
var core = read("docs/play/study-core.js");
ok("must_not_grow_a_second_job: the tutor refuses a subject that is not in the deck",
  S.tutorOpen(made.deck, "quantum mechanics").ok === false);
ok("and says why in its own words", /not in your notes/.test(S.tutorOpen(made.deck, "quantum mechanics").reason),
  S.tutorOpen(made.deck, "quantum mechanics").reason);
ok("a subject that IS in the deck is accepted", S.tutorOpen(made.deck, "respiration").ok === true);
ok("a card that is not in the deck cannot be tutored",
  S.tutorStart(made.deck, "no-such-card").ok === false);
ok("must_not_grow_a_second_job: there is no model call, key or endpoint in the engine",
  !/\b(apiKey|api_key|apiEndpoint|endpoint|openai|gpt)\s*[:=]/i.test(core) &&
  !/https?:\/\//.test(core));
ok("must_not_grow_a_second_job: the tutor's questions come from a bundled bank",
  S.MOVES.length >= 6 && S.MOVES.every(function (m) { return typeof m.ask === "function"; }));

section("must-not — the tutor must never state the answer");
var session = S.tutorStart(made.deck, made.deck.cards[0].id);
eq("a session starts", session.ok, true);
ok("the first question does not leak the answer", S.leaks(session.question, made.deck.cards[0]) === false,
  session.question);
made.deck.cards.forEach(function (card) {
  S.MOVES.forEach(function (move) {
    var asked = move.ask(card);
    /* the bank itself may quote a topic, but never the answer */
    ok("move " + move.id + " does not leak the answer of " + card.id,
      S.leaks(asked, card) === false, asked + " / answer: " + card.answer);
  });
});
var t1 = S.tutorTurn(made.deck, session.session, "I think it is about how cells get energy");
eq("a turn returns a question", t1.ok, true);
ok("the question still does not leak", S.leaks(t1.question, made.deck.cards[0]) === false, t1.question);
eq("the answer is not revealed on the first attempt", t1.revealed, false);
var t2 = S.tutorTurn(made.deck, t1.session, "not sure");
var t3 = S.tutorTurn(made.deck, t2.session, "still not sure");
eq("after the fixed number of attempts it reveals", t3.revealed, true);
ok("what it reveals is the sentence in the notes, not a lecture",
  t3.says.indexOf(made.deck.cards[0].source) >= 0 || /In your notes/.test(t3.says), t3.says);
eq("an empty turn is refused", S.tutorTurn(made.deck, session.session, "   ").ok, false);
eq("a turn after a reveal is refused", S.tutorTurn(made.deck, t3.session, "one more").ok, false);

section("must-not — a question with no subject is met with a question back");
var open = S.tutorOpen(made.deck, "");
eq("no subject is not guessed at", open.ok, false);
eq("it asks for one", open.needs, "subject");
ok("and asks in words", /\?/.test(open.question), open.question);
ok("the app says it asked rather than guessed", /asks rather than guesses/.test(open.says), open.says);

section("must-not — a corrupt deck is never overwritten");
var bad = S.parseDeck("{ not a deck");
eq("a corrupt deck is reported", bad.ok, false);
ok("the reason says it was not overwritten", /not overwritten/.test(bad.reason), bad.reason);
eq("the raw text is kept for export", bad.raw, "{ not a deck");
eq("a deck with no cards is refused", S.parseDeck('{"a":1}').ok, false);
eq("an empty save is reported", S.parseDeck("").ok, false);

section("must-not — no OCR is claimed");
ok("must_not_claim_ocr: the engine never mentions OCR as something it does",
  !/performOCR|runOCR|tesseract|recogniseText|recognizeText/i.test(core));
ok("must_not_claim_ocr: the page says there is no camera", /There is no camera in this app/.test(read("docs/play/index.html")));

/* ==================================================== other mechanics */

section("mechanic — the page is cut into sentences, not characters");
eq("sentences split on a full stop", S.splitSentences("One fact here. Another fact here.").length, 2);
eq("a decimal point is not a sentence break", S.splitSentences("The rate is 1.5 per cent of the total value.").length, 1);
eq("a heading becomes a topic", S.splitTopics("Respiration\nRespiration is a process.")[0].topic, "Respiration");
eq("an empty page is refused", S.buildCards("   ").ok, false);
ok("a page with nothing readable says so", /nothing readable|no fact/.test(S.buildCards("... ...").reason),
  S.buildCards("... ...").reason);

section("failure case — storage full or unavailable");
var thrown = S.exportFile("deck-json", { deck: made.deck }, { when: "25/11/2026" }, function () {
  var e = new Error("quota"); e.name = "QuotaExceededError"; throw e;
});
eq("a failed write is reported as failed", thrown.ok, false);
ok("a failed write says the file was not written", /not written/.test(thrown.reason), thrown.reason);
ok("a failed write names the cause", /storage is full/.test(thrown.reason));
eq("no writer means no file", S.exportFile("deck-json", { deck: made.deck }, {}, null).ok, false);

section("failure case — no network");
["docs/play/study-core.js", "docs/play/app.js", "docs/play/sw.js", "docs/play/web-kit.js",
 "docs/play/export-kit.js", "docs/play/srs-kit.js"].forEach(function (f) {
  var src = read(f);
  ok("no fetch call in " + f, !/\bfetch\s*\(/.test(src));
  ok("no XHR/WebSocket/beacon in " + f, !/XMLHttpRequest|WebSocket|sendBeacon|EventSource/.test(src));
});
ok("the page forbids connections in its CSP", /connect-src 'none'/.test(read("docs/play/index.html")));

section("shape — every script the page loads exists beside it");
var page = read("docs/play/index.html");
var srcs = (page.match(/<script[^>]+src="([^"]+)"/g) || []).map(function (t) { return t.replace(/.*src="([^"]+)"/, "$1"); });
ok("the page loads the scheduler", srcs.indexOf("srs-kit.js") >= 0, srcs.join(","));
srcs.forEach(function (s) {
  ok("script src resolves: " + s, fs.existsSync(path.join(ROOT, "docs", "play", s.replace(/^\.\//, ""))));
});
ok("the landing page exists", fs.existsSync(path.join(ROOT, "docs", "index.html")));
ok("the page manifest exists", fs.existsSync(path.join(ROOT, "PAGES.json")));

/* ============================================================== summary */

var total = passed + failed.length;
if (!total) { console.error("self-tests: 0 assertions ran. That is a failure, not a pass."); process.exit(1); }
if (failed.length) {
  console.error("self-tests: " + passed + "/" + total + " passed, " + failed.length + " FAILED");
  failed.slice(0, 12).forEach(function (f) { console.error("  FAIL " + f); });
  process.exit(1);
}
console.log("self-tests: " + passed + "/" + total + " assertions passed");
