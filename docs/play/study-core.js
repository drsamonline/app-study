/* study-core — the engine behind Study.
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * (c) 2026 Dr Sohil Momin
 *
 * One job: turn a page of notes into active recall. Two mechanics, because recall
 * happens twice — on a schedule, and under questioning:
 *
 *   cards    the page is cut into facts, each fact becomes a card whose ANSWER IS A
 *            VERBATIM PIECE OF THE PAGE, and srs-kit (SM-2) decides when to show it
 *            again. A card you answered "again" comes back sooner than one you
 *            answered "easy" — that is the mechanic, and it is asserted.
 *   tutor    the Socratic half: it asks about a card in YOUR deck and never states
 *            the answer. After a fixed number of attempts it will point at the
 *            sentence in your notes, because that is where the answer lives.
 *
 * What it does NOT do: read a photograph. There is no OCR in this estate, so the
 * page is pasted or typed and the app says so. There is no model, no key and no
 * network: the questions come from a bundled bank of Socratic moves, not from an LLM.
 *
 * Pure functions: no DOM, no network, no storage. The page does the wiring.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.StudyCore = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var VERSION = "1.0.0";
  var REVEAL_AFTER = 3;         /* attempts before the app will point at the source */
  var QUALITY = { again: 2, hard: 3, good: 4, easy: 5 };

  /* srs-kit, when the page has loaded it. The engine still works without it (the
   * tests load the real kit), but it refuses to pretend it scheduled anything. */
  function srs() {
    if (typeof Srs !== "undefined" && Srs && Srs.newCard) return Srs;
    if (typeof globalThis !== "undefined" && globalThis.Srs) return globalThis.Srs;
    if (typeof module !== "undefined" && module.exports) {
      try { return require("./srs-kit.js"); } catch (e) { return null; }
    }
    return null;
  }

  /* ------------------------------------------------------------- the page */

  function splitSentences(text) {
    var raw = String(text || "").replace(/\r\n?/g, "\n");
    var out = [];
    raw.split(/\n[ \t]*\n/).forEach(function (para) {
      var buf = "";
      var flat = para.replace(/\s+/g, " ").trim();
      for (var i = 0; i < flat.length; i++) {
        var ch = flat.charAt(i);
        buf += ch;
        if (ch === "." || ch === "!" || ch === "?") {
          var prev = flat.charAt(i - 1);
          var next = flat.slice(i + 1).replace(/^\s+/, "").charAt(0);
          if (/[0-9]/.test(prev) && /[0-9]/.test(next)) continue;
          if (!next || /[A-Z0-9"'\u2018\u201c]/.test(next)) { out.push(buf.trim()); buf = ""; }
        }
      }
      if (buf.trim()) out.push(buf.trim());
    });
    return out.filter(function (s) { return s.length > 12; });
  }

  /* A heading is a short line with no full stop, on its own line. It becomes the
   * topic of the facts under it. */
  function splitTopics(text) {
    var raw = String(text || "").replace(/\r\n?/g, "\n");
    var topics = [];
    var current = { topic: "Unsorted", body: [] };
    raw.split("\n").forEach(function (line) {
      var t = line.trim();
      if (!t) { current.body.push(""); return; }
      var looksHeading = t.length <= 60 && !/[.!?]$/.test(t) && /^[A-Z0-9]/.test(t) && t.split(" ").length <= 8;
      if (looksHeading) {
        if (current.body.join(" ").trim()) topics.push(current);
        current = { topic: t.replace(/[:.]$/, ""), body: [] };
        return;
      }
      current.body.push(t);
    });
    if (current.body.join(" ").trim()) topics.push(current);
    return topics.length ? topics : [{ topic: "Unsorted", body: [raw] }];
  }

  var STOP = ["the", "a", "an", "and", "or", "of", "to", "in", "on", "is", "are", "was", "were", "be",
    "been", "it", "its", "this", "that", "these", "those", "as", "at", "by", "for", "from", "with",
    "which", "who", "whom", "whose", "when", "where", "why", "how", "not", "no", "but", "if", "then",
    "than", "so", "such", "can", "could", "may", "might", "must", "shall", "should", "will", "would",
    "has", "have", "had", "do", "does", "did", "there", "their", "they", "them", "he", "she", "his",
    "her", "you", "your", "we", "our", "i", "one", "also", "more", "most", "very", "into", "about"];

  function terms(sentence) {
    return String(sentence || "").toLowerCase()
      .replace(/[^\p{L}\p{N}\u20b9]+/gu, " ")
      .split(" ")
      .filter(function (w) { return w.length > 3 && STOP.indexOf(w) < 0; });
  }

  function titleCase(s) {
    return String(s || "").replace(/\b\p{L}/gu, function (c) { return c.toUpperCase(); });
  }

  /* The key term of a sentence: the rarest-looking content word, with a preference
   * for a capitalised phrase at the start of a definition. */
  function keyTerm(sentence) {
    var m = /^([A-Z][\p{L}\d-]*(?:\s+[A-Z][\p{L}\d-]*)*)\s+(is|are|means|refers to|was|were)\b/u.exec(sentence);
    if (m) return m[1];
    var ts = terms(sentence);
    if (!ts.length) return "";
    ts.sort(function (a, b) { return b.length - a.length; });
    return ts[0];
  }

  /* -------------------------------------------------------------- cards */

  /* Every card is built so its ANSWER IS A SUBSTRING OF THE PAGE. A card whose
   * answer is not in the text would be a card the app invented, and that is the
   * one thing a study app must never do. */
  function buildCards(text, opts) {
    var options = opts || {};
    var page = String(text || "");
    if (!page.trim()) {
      return { ok: false, reason: "there is no text yet \u2014 paste or type the page, and the cards are built from it", cards: [] };
    }
    var sentences = splitSentences(page);
    if (!sentences.length) {
      return { ok: false, reason: "nothing readable was found in that text, so no study set was generated from an empty read", cards: [] };
    }

    var topics = splitTopics(page);
    var cards = [];
    var seen = {};

    topics.forEach(function (group) {
      splitSentences(group.body.join(" ")).forEach(function (sentence) {
        if (cards.length >= (options.max || 60)) return;
        var term = keyTerm(sentence);
        if (!term) return;
        var key = term.toLowerCase() + "|" + sentence.toLowerCase().slice(0, 40);
        if (seen[key]) return;
        seen[key] = true;

        /* the term as the page wrote it, so a cloze answer is a verbatim slice */
        var esc = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        var shown = (new RegExp("\\b" + esc + "\\b", "iu").exec(sentence) || [term])[0];
        var def = new RegExp("^(" + esc + ")\\s+(is|are|means|refers to|was|were)\\b", "u").test(sentence);
        var question;
        var answer;
        if (def) {
          question = "What " + (/\b(are|were)\b/.test(sentence.split(" ").slice(0, 4).join(" ")) ? "are" : "is") + " " + shown + "?";
          answer = sentence;                       /* the whole sentence, verbatim */
        } else {
          var re = new RegExp("\\b" + esc + "\\b", "iu");
          if (!re.test(sentence)) return;
          question = sentence.replace(re, "____");
          answer = shown;
        }
        cards.push({
          id: "c" + (cards.length + 1),
          topic: group.topic,
          question: question,
          answer: answer,
          source: sentence,
          kind: def ? "definition" : "cloze"
        });
      });
    });

    if (!cards.length) {
      return { ok: false, reason: "no fact in that text could be turned into a card with an answer taken from the text itself, so no set was made", cards: [] };
    }
    return {
      ok: true,
      cards: cards,
      topics: topics.map(function (t) { return t.topic; }),
      says: cards.length + " card(s) from " + sentences.length + " sentence(s). Every answer is a piece of the page, word for word."
    };
  }

  /* The gap finder: a term the page uses more than once and never defines. */
  function gapFinder(text) {
    var page = String(text || "");
    var sentences = splitSentences(page);
    var defined = {};
    sentences.forEach(function (s) {
      var m = /^([A-Z][\p{L}\d-]*(?:\s+[A-Z][\p{L}\d-]*)*)\s+(is|are|means|refers to)\b/u.exec(s);
      if (m) defined[m[1].toLowerCase()] = true;
    });
    var used = {};
    sentences.forEach(function (s) {
      var words = String(s).match(/\b[A-Z][\p{L}\d-]{2,}(?:\s+[A-Z][\p{L}\d-]{2,})*\b/gu) || [];
      words.forEach(function (w) {
        var key = w.replace(/^(The|A|An)\s+/i, "").toLowerCase();
        if (defined[key]) return;
        if (STOP.indexOf(key) >= 0) return;
        if (!used[key]) used[key] = { term: w.replace(/^(The|A|An)\s+/i, ""), count: 0, where: s };
        used[key].count++;
      });
    });
    var gaps = Object.keys(used).map(function (k) { return used[k]; })
      .filter(function (g) { return g.count >= 2; })
      .sort(function (a, b) { return b.count - a.count; });
    return {
      gaps: gaps,
      says: gaps.length
        ? gaps.length + " term(s) are used more than once and never defined: " + gaps.map(function (g) { return g.term; }).join(", ") + "."
        : "Nothing obvious: every term used more than once is also defined somewhere in the page."
    };
  }

  /* ------------------------------------------------------------ the deck */

  function makeDeck(cards, now) {
    var S = srs();
    if (!S) return { ok: false, reason: "the scheduler (srs-kit) did not load, so no deck was made \u2014 a deck without a schedule would be a list" };
    return {
      ok: true,
      deck: {
        version: VERSION,
        madeOn: now || 0,
        cards: (cards || []).map(function (c) {
          var base = S.newCard({ due: now || 0 });
          return {
            id: c.id, topic: c.topic, question: c.question, answer: c.answer,
            source: c.source, kind: c.kind,
            phase: "learning",
            srs: { ease: base.ease, interval: base.interval, reps: base.reps, lapses: base.lapses, due: base.due, last: base.last }
          };
        })
      }
    };
  }

  /* Learning steps, then SM-2. A brand-new card has no history for SM-2 to work
   * from: on the very first answer SM-2 would put "again" and "easy" both at one
   * day, which is exactly the thing the spec says must not happen. So a new card
   * runs on learning steps first (again: 10 minutes, hard: 1 day, good: 1 day,
   * easy: 4 days — the cadence Anki uses), and the first non-lapse answer graduates
   * it into srs-kit's SM-2, which owns every review after that. */
  var LEARNING_MINUTES = { again: 10, hard: 24 * 60, good: 24 * 60, easy: 4 * 24 * 60 };

  function grade(card, gradeName, now) {
    var S = srs();
    if (!S) return { ok: false, reason: "the scheduler (srs-kit) did not load" };
    var q = QUALITY[gradeName];
    if (q == null) return { ok: false, reason: "\u201c" + gradeName + "\u201d is not a grade this app understands (again, hard, good, easy)" };
    var next = {};
    Object.keys(card).forEach(function (k) { next[k] = card[k]; });
    var phase = card.phase || "learning";

    if (phase === "learning" && gradeName !== "again") {
      /* graduate: seed the SM-2 state from the learning step, then let it run */
      var days = LEARNING_MINUTES[gradeName] / (24 * 60);
      next.srs = {
        ease: card.srs.ease || 2.5, interval: days, reps: 1,
        lapses: card.srs.lapses || 0, due: now + LEARNING_MINUTES[gradeName] * 60000, last: now
      };
      next.phase = "review";
      next.lastGrade = gradeName;
      return { ok: true, card: next, due: next.srs.due, interval: days, ease: next.srs.ease, phase: "review" };
    }

    if (phase === "learning") {
      next.srs = {
        ease: card.srs.ease, interval: 0, reps: 0, lapses: (card.srs.lapses || 0) + 1,
        due: now + LEARNING_MINUTES.again * 60000, last: now
      };
      next.phase = "learning";
      next.lastGrade = gradeName;
      return { ok: true, card: next, due: next.srs.due, interval: 0, ease: next.srs.ease, phase: "learning" };
    }

    var reviewed = S.review(card.srs, q, now);
    next.srs = reviewed;
    next.phase = "review";
    next.lastGrade = gradeName;
    return { ok: true, card: next, due: reviewed.due, interval: reviewed.interval, ease: reviewed.ease, phase: "review" };
  }

  function dueNow(deck, now) {
    var S = srs();
    if (!S) return [];
    return (deck.cards || []).filter(function (c) { return S.isDue(c.srs, now); });
  }

  function stats(deck, now) {
    var S = srs();
    var cards = (deck && deck.cards) || [];
    var due = dueNow(deck, now);
    var byTopic = {};
    cards.forEach(function (c) {
      byTopic[c.topic] = byTopic[c.topic] || { total: 0, due: 0 };
      byTopic[c.topic].total++;
    });
    due.forEach(function (c) { byTopic[c.topic].due++; });
    return {
      total: cards.length,
      due: due.length,
      byTopic: byTopic,
      kit: S ? (S.version || "unknown") : "missing"
    };
  }

  /* --------------------------------------------------------- deck on disk */

  function serializeDeck(deck) {
    return JSON.stringify({
      version: VERSION,
      madeOn: deck.madeOn || 0,
      cards: (deck.cards || []).map(function (c) {
        return {
          id: c.id, topic: c.topic, question: c.question, answer: c.answer, source: c.source, kind: c.kind,
          phase: c.phase || "learning", lastGrade: c.lastGrade || "",
          srs: { ease: c.srs.ease, interval: c.srs.interval, reps: c.srs.reps, lapses: c.srs.lapses, due: c.srs.due, last: c.srs.last }
        };
      })
    }, null, 2);
  }

  /* Review dates survive the round trip — the spec asks for it, and a deck that
   * loses its schedule is a deck you have to start again. */
  function parseDeck(text) {
    var raw = String(text == null ? "" : text);
    if (!raw.trim()) return { ok: false, reason: "there is no saved deck", raw: raw };
    var data;
    try { data = JSON.parse(raw); }
    catch (e) {
      return { ok: false, reason: "the saved deck is not readable JSON. It was not overwritten: export it to keep it, or start a new deck deliberately.", raw: raw };
    }
    if (!data || !Array.isArray(data.cards)) {
      return { ok: false, reason: "the saved deck has no cards in it, so it was not used \u2014 and it was not replaced with a new set.", raw: raw };
    }
    var cards = [];
    data.cards.forEach(function (c, i) {
      if (!c || !c.question || c.answer == null) return;
      var s = c.srs || {};
      cards.push({
        id: String(c.id || "c" + (i + 1)),
        topic: String(c.topic || "Unsorted"),
        question: String(c.question),
        answer: String(c.answer),
        source: String(c.source || ""),
        kind: String(c.kind || "cloze"),
        phase: c.phase === "review" ? "review" : "learning",
        lastGrade: String(c.lastGrade || ""),
        srs: {
          ease: Number(s.ease) || 2.5,
          interval: Number(s.interval) || 0,
          reps: Number(s.reps) || 0,
          lapses: Number(s.lapses) || 0,
          due: Number(s.due) || 0,
          last: Number(s.last) || 0
        }
      });
    });
    if (!cards.length) return { ok: false, reason: "the saved deck had no usable card in it, so it was not used.", raw: raw };
    return { ok: true, deck: { version: data.version || VERSION, madeOn: Number(data.madeOn) || 0, cards: cards }, raw: raw };
  }

  /* --------------------------------------------------------------- tutor */

  /* Socratic moves. None of them states an answer: they ask. The last one points
   * at the page rather than telling you the answer, which is the whole method. */
  var MOVES = [
    { id: "clarify", ask: function (c) { return "Before we go further: in your own words, what is the question actually asking? Say it back to me."; } },
    { id: "recall", ask: function (c) { return "Without looking at your notes, what do you already remember about \u201c" + c.topic + "\u201d?"; } },
    { id: "example", ask: function (c) { return "Can you give me one concrete example of what this question is about?"; } },
    { id: "counter", ask: function (c) { return "What would happen if the opposite were true \u2014 what would break?"; } },
    { id: "connect", ask: function (c) { return "Which other thing in these notes does this connect to, and how?"; } },
    { id: "narrow", ask: function (c) { return "What is the one word in the question you would have to understand to answer it?"; } },
    { id: "locate", ask: function (c) { return "Where in your notes would this be written down? Point at the section, not the sentence."; } },
    { id: "apply", ask: function (c) { return "If you had to explain this to someone who had not read the page, what is the first sentence you would say?"; } }
  ];

  function tutorStart(deck, cardId) {
    var card = (deck.cards || []).filter(function (c) { return c.id === cardId; })[0];
    if (!card) {
      return { ok: false, reason: "that card is not in this deck. This app only asks about what you wrote down \u2014 it is not a general tutor.", needs: "card" };
    }
    return {
      ok: true,
      session: { cardId: card.id, topic: card.topic, step: 0, attempts: [], revealed: false, transcript: [] },
      question: safeAsk(MOVES[0], card)
    };
  }

  /* The no-answer rule, enforced in code: if a move's text contains the card's
   * answer, the move is replaced by a safe one. This is what stops a template that
   * happens to quote the answer. */
  function safeAsk(move, card) {
    var text = move.ask(card);
    if (leaks(text, card)) {
      return "What is it you are trying to work out here? Put the question in your own words first.";
    }
    return text;
  }

  function leaks(text, card) {
    var a = String(card.answer || "").trim().toLowerCase();
    if (!a) return false;
    var t = String(text || "").toLowerCase();
    if (a.length > 3 && t.indexOf(a) >= 0) return true;
    /* a cloze answer is one word: check it as a whole word */
    if (a.length <= 3) return new RegExp("\\b" + a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b").test(t);
    return false;
  }

  function tutorTurn(deck, session, userText) {
    var card = (deck.cards || []).filter(function (c) { return c.id === session.cardId; })[0];
    if (!card) return { ok: false, reason: "the card this session was about is no longer in the deck" };
    var said = String(userText == null ? "" : userText).trim();
    if (!said) {
      return { ok: false, reason: "an empty turn is refused \u2014 say something, even \u201cI do not know\u201d, and the next question follows from it", refused: true };
    }
    if (session.revealed) {
      return { ok: false, reason: "this card was already revealed; start it again to keep practising", refused: true };
    }

    var next = {
      cardId: session.cardId, topic: session.topic, step: session.step + 1,
      attempts: session.attempts.concat([said]), revealed: false,
      transcript: session.transcript.concat([{ who: "you", text: said }])
    };

    /* The user may now see the source sentence — but only after the fixed number
       of attempts, and even then it is the page, not the app, that answers. */
    if (next.attempts.length >= REVEAL_AFTER) {
      next.revealed = true;
      var where = card.source ? "In your notes: \u201c" + card.source + "\u201d" : "Your notes hold the answer for this card.";
      next.transcript.push({ who: "app", text: where });
      return { ok: true, session: next, revealed: true, says: where, question: null };
    }

    var move = MOVES[next.step % MOVES.length];
    var question = safeAsk(move, card);
    next.transcript.push({ who: "app", text: question });
    return { ok: true, session: next, question: question, revealed: false, attempt: next.attempts.length, left: REVEAL_AFTER - next.attempts.length };
  }

  /* A question with no subject is met with a question back — never a guess. */
  function tutorOpen(deck, topicAsked) {
    var t = String(topicAsked || "").trim();
    if (!t) {
      return { ok: false, needs: "subject", question: "What would you like to be asked about? Name the topic in your notes, and I will ask you about it.", says: "no subject was stated, so the app asks rather than guesses" };
    }
    var cards = (deck && deck.cards) || [];
    var low = t.toLowerCase();
    var hit = cards.filter(function (c) {
      return c.topic.toLowerCase() === low || c.topic.toLowerCase().indexOf(low) >= 0 ||
        c.question.toLowerCase().indexOf(low) >= 0 || c.answer.toLowerCase() === low;
    });
    if (!hit.length) {
      return {
        ok: false, needs: "in-deck", subject: t,
        reason: "\u201c" + t + "\u201d is not in your notes, and this app only asks about what you wrote down. It is not a general tutor: paste the page first, or ask about a topic that is in the deck."
      };
    }
    return { ok: true, subject: hit[0].topic, cards: hit };
  }

  /* --------------------------------------------------------------- export */

  function stamp(when) {
    var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(when || ""));
    return m ? m[3] + "-" + m[2] + "-" + m[1] : "undated";
  }

  function deckMarkdown(deck, when) {
    var lines = ["# Study deck", ""];
    if (when) lines.push("Exported " + when + ".");
    lines.push("");
    lines.push("| Topic | Question | Answer | Due |");
    lines.push("|---|---|---|---|");
    (deck.cards || []).forEach(function (c) {
      lines.push("| " + c.topic + " | " + c.question.replace(/\|/g, "\\|") + " | " + String(c.answer).replace(/\|/g, "\\|") +
        " | " + (c.srs.due ? new Date(c.srs.due).toISOString().slice(0, 10) : "\u2014") + " |");
    });
    lines.push("");
    lines.push("Every answer above is a piece of the page it came from.");
    return lines.join("\n");
  }

  function exportFile(what, payload, meta, writer) {
    meta = meta || {};
    if (typeof writer !== "function") return { ok: false, reason: "the file was not written: no writer is available in this browser" };
    var name, body, mime = "text/plain;charset=utf-8";
    if (what === "deck-json") { name = "study-deck-" + stamp(meta.when) + ".json"; body = serializeDeck(payload.deck); mime = "application/json"; }
    else if (what === "deck-md") { name = "study-deck-" + stamp(meta.when) + ".md"; body = deckMarkdown(payload.deck, meta.when); mime = "text/markdown;charset=utf-8"; }
    else if (what === "raw") { name = "study-unreadable-deck-" + stamp(meta.when) + ".txt"; body = String(payload.raw || ""); }
    else return { ok: false, reason: "nothing was written: unknown export \u201c" + what + "\u201d" };
    try {
      var wrote = writer(name, body, mime);
      if (wrote === false) return { ok: false, filename: name, reason: "the file was not written: the browser refused the save" };
      return { ok: true, filename: name, bytes: body.length };
    } catch (e) {
      var why = e && e.name === "QuotaExceededError" ? "storage is full" : (e && e.message ? e.message : "storage is unavailable");
      return { ok: false, filename: name, reason: "the file was not written: " + why };
    }
  }

  return {
    version: VERSION,
    REVEAL_AFTER: REVEAL_AFTER,
    QUALITY: QUALITY,
    MOVES: MOVES,
    splitSentences: splitSentences,
    splitTopics: splitTopics,
    terms: terms,
    keyTerm: keyTerm,
    buildCards: buildCards,
    gapFinder: gapFinder,
    makeDeck: makeDeck,
    grade: grade,
    dueNow: dueNow,
    stats: stats,
    serializeDeck: serializeDeck,
    parseDeck: parseDeck,
    tutorStart: tutorStart,
    tutorTurn: tutorTurn,
    tutorOpen: tutorOpen,
    leaks: leaks,
    deckMarkdown: deckMarkdown,
    exportFile: exportFile
  };
});
