/* app — the Study page. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * (c) 2026 Dr Sohil Momin
 *
 * Wiring only: card building, the schedule, the gap finder and the Socratic state
 * machine all live in study-core.js, which the tests exercise directly.
 */
(function () {
  "use strict";

  var S = window.StudyCore;
  var $ = function (id) { return document.getElementById(id); };

  var K_DECK = "study:deck";

  var els = {
    status: $("status"), pageText: $("pageText"), build: $("build"), example: $("example"),
    exportJson: $("exportJson"), exportMd: $("exportMd"), deckNote: $("deckNote"),
    importFile: $("importFile"), gapOut: $("gapOut"),
    stats: $("stats"), sTotal: $("sTotal"), sDue: $("sDue"), sTopics: $("sTopics"), sKit: $("sKit"),
    reviewCard: $("reviewCard"), qText: $("qText"), reveal: $("reveal"), reviewNote: $("reviewNote"),
    answerBox: $("answerBox"), gradeBar: $("gradeBar"), gradeNote: $("gradeNote"),
    deckEmpty: $("deckEmpty"),
    subject: $("subject"), tutorStart: $("tutorStart"), tutorNote: $("tutorNote"),
    transcript: $("transcript"), sayLabel: $("sayLabel"), tutorSay: $("tutorSay"),
    tutorBar: $("tutorBar"), tutorSend: $("tutorSend"), attemptNote: $("attemptNote"),
    revealAfter: $("revealAfter")
  };

  var state = { deck: null, current: null, revealed: false, session: null, when: "" };

  /* ------------------------------------------------------------- helpers */

  function today() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return p(d.getDate()) + "/" + p(d.getMonth() + 1) + "/" + d.getFullYear();
  }
  function nowMs() { return Date.now(); }

  function setStatus(kind, msg) {
    els.status.className = "status show " + kind;
    els.status.textContent = msg;
  }
  function clearStatus() { els.status.className = "status"; els.status.textContent = ""; }

  function node(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function persist() {
    if (!state.deck) return false;
    try {
      window.localStorage.setItem(K_DECK, S.serializeDeck(state.deck));
      return true;
    } catch (e) {
      setStatus("warn", "The cards are on screen but the deck was NOT saved: " +
        (e && e.name === "QuotaExceededError" ? "storage is full" : "storage is unavailable") +
        ". They will vanish on reload, and the app will not pretend otherwise.");
      return false;
    }
  }

  /* -------------------------------------------------------------- cards */

  function buildCards() {
    clearStatus();
    var built = S.buildCards(els.pageText.value);
    if (!built.ok) {
      setStatus("bad", built.reason);
      return;
    }
    var made = S.makeDeck(built.cards, nowMs());
    if (!made.ok) { setStatus("bad", made.reason); return; }

    /* A new deck over an existing one is a decision, not a side effect. */
    if (state.deck && state.deck.cards.length) {
      var keep = window.confirm("There is already a deck with " + state.deck.cards.length +
        " card(s) and its review dates. Replace it with the new set?");
      if (!keep) {
        setStatus("warn", "The existing deck was kept. Nothing was overwritten.");
        return;
      }
    }
    state.deck = made.deck;
    state.when = today();
    var saved = persist();
    var gaps = S.gapFinder(els.pageText.value);
    renderGaps(gaps);
    renderDeck();
    /* a failed save keeps persist()'s own warning: 'warn' with a cheerful sentence is still a cheerful
     * sentence, and a person reads the words */
    if (saved) setStatus("ok", built.says + (gaps.gaps.length ? " " + gaps.says : ""));
  }

  function renderGaps(gaps) {
    els.gapOut.textContent = "";
    if (!gaps || !gaps.gaps.length) {
      els.gapOut.textContent = gaps ? gaps.says : "";
      return;
    }
    els.gapOut.appendChild(node("b", null, "Gap finder: "));
    els.gapOut.appendChild(document.createTextNode(gaps.says + " "));
    gaps.gaps.forEach(function (g, i) {
      if (i) els.gapOut.appendChild(document.createTextNode(", "));
      els.gapOut.appendChild(node("span", null, g.term + " (" + g.count + "\u00d7)"));
    });
  }

  function renderDeck() {
    if (!state.deck || !state.deck.cards.length) {
      els.stats.hidden = true;
      els.reviewCard.hidden = true;
      els.deckEmpty.hidden = false;
      return;
    }
    els.deckEmpty.hidden = true;
    var st = S.stats(state.deck, nowMs());
    els.stats.hidden = false;
    els.sTotal.textContent = st.total;
    els.sDue.textContent = st.due;
    els.sTopics.textContent = Object.keys(st.byTopic).length;
    els.sKit.textContent = st.kit;
    els.deckNote.textContent = st.total + " card(s), " + st.due + " due now.";

    var due = S.dueNow(state.deck, nowMs());
    state.current = due[0] || null;
    state.revealed = false;
    if (!state.current) {
      els.reviewCard.hidden = false;
      els.qText.textContent = "Nothing is due right now. The schedule will bring the next card back when it is due — that is the point of it.";
      els.reveal.hidden = true;
      els.answerBox.hidden = true;
      els.gradeBar.hidden = true;
      els.reviewNote.textContent = "";
      return;
    }
    els.reviewCard.hidden = false;
    els.reveal.hidden = false;
    els.qText.textContent = state.current.question;
    els.answerBox.hidden = true;
    els.gradeBar.hidden = true;
    els.reviewNote.textContent = "Topic: " + state.current.topic;
  }

  function revealAnswer() {
    if (!state.current) return;
    state.revealed = true;
    els.answerBox.hidden = false;
    els.answerBox.textContent = state.current.answer;
    if (state.current.source && state.current.source !== state.current.answer) {
      els.answerBox.appendChild(node("span", "src", "From your page: \u201c" + state.current.source + "\u201d"));
    }
    els.gradeBar.hidden = false;
    els.gradeNote.textContent = "How did that go? The answer decides when this card comes back.";
  }

  function gradeDeck(gradeName) {
    if (!state.current) return;
    var out = S.grade(state.current, gradeName, nowMs());
    if (!out.ok) { setStatus("bad", out.reason); return; }
    state.deck.cards = state.deck.cards.map(function (c) { return c.id === out.card.id ? out.card : c; });
    var saved = persist();
    var when = new Date(out.due);
    var mins = Math.round((out.due - nowMs()) / 60000);
    var human = mins < 90 ? mins + " minute(s)" : Math.round(mins / 1440) + " day(s)";
    if (saved) setStatus("ok", "\u201c" + gradeName + "\u201d — this card comes back in " + human +
      " (" + when.toLocaleDateString("en-IN") + "). " +
      (gradeName === "again" ? "Sooner than a card you called easy: that is the schedule working." : ""));
    renderDeck();
  }

  /* ------------------------------------------------------------- import */

  function importDeck(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onerror = function () { setStatus("bad", "That file could not be read, so the deck was not imported."); };
    reader.onload = function () {
      var parsed = S.parseDeck(String(reader.result));
      if (!parsed.ok) {
        setStatus("bad", parsed.reason);
        return;
      }
      if (state.deck && state.deck.cards.length &&
          !window.confirm("Replace the current deck with the imported one?")) {
        setStatus("warn", "The current deck was kept.");
        return;
      }
      state.deck = parsed.deck;
      var saved = persist();
      renderDeck();
      var st = S.stats(state.deck, nowMs());
      if (saved) setStatus("ok", "Imported " + st.total + " card(s) with their review dates: " + st.due + " due now.");
    };
    reader.readAsText(file);
  }

  /* -------------------------------------------------------------- tutor */

  function startTutor() {
    clearStatus();
    els.transcript.textContent = "";
    if (!state.deck || !state.deck.cards.length) {
      setStatus("bad", "There is no deck yet. The tutor only asks about what you wrote down — build the cards first.");
      return;
    }
    var open = S.tutorOpen(state.deck, els.subject.value);
    if (!open.ok) {
      setStatus("bad", open.reason || open.question);
      if (open.question) {
        els.transcript.appendChild(turn("app", open.question));
      }
      return;
    }
    var started = S.tutorStart(state.deck, open.cards[0].id);
    if (!started.ok) { setStatus("bad", started.reason); return; }
    state.session = started.session;
    els.transcript.appendChild(turn("app", started.question));
    els.sayLabel.hidden = false;
    els.tutorSay.hidden = false;
    els.tutorBar.hidden = false;
    els.attemptNote.textContent = "Attempt 0 of " + S.REVEAL_AFTER + ". It will not give you the answer; after " +
      S.REVEAL_AFTER + " attempts it will point at your notes.";
    setStatus("ok", "Asking about \u201c" + open.subject + "\u201d.");
  }

  function turn(who, text) {
    var box = node("div", "turn " + who);
    box.appendChild(node("span", "who", who === "you" ? "you" : "tutor"));
    box.appendChild(document.createTextNode(text));
    return box;
  }

  function sendTutor() {
    if (!state.session) return;
    var said = els.tutorSay.value;
    var out = S.tutorTurn(state.deck, state.session, said);
    if (!out.ok) {
      setStatus("bad", out.reason);
      return;
    }
    els.transcript.appendChild(turn("you", said.trim()));
    els.tutorSay.value = "";
    state.session = out.session;
    if (out.revealed) {
      els.transcript.appendChild(turn("app", out.says));
      els.sayLabel.hidden = true;
      els.tutorSay.hidden = true;
      els.tutorBar.hidden = true;
      setStatus("ok", "That is the sentence in your notes. Read it, close it, and try the card again.");
      return;
    }
    els.transcript.appendChild(turn("app", out.question));
    els.attemptNote.textContent = "Attempt " + out.attempt + " of " + S.REVEAL_AFTER + ".";
    setStatus("ok", "It will not give you the answer — that is the method.");
  }

  /* ------------------------------------------------------------- export */

  function writer(name, text, mime) {
    if (!window.Export || typeof window.Export.save !== "function") throw new Error("the export kit did not load");
    window.Export.save(name, text, mime);
    return true;
  }

  function doExport(what) {
    if (!state.deck) { setStatus("bad", "There is no deck to export yet."); return; }
    var out = S.exportFile(what, { deck: state.deck }, { when: state.when || today() }, writer);
    if (out.ok) {
      els.deckNote.textContent = "Wrote " + out.filename + " (" + out.bytes + " bytes).";
      setStatus("ok", "Wrote " + out.filename + ". Importing it back keeps every review date.");
    } else {
      setStatus("bad", out.reason + ".");
    }
  }

  /* ---------------------------------------------------------------- tabs */

  ["cards", "tutor"].forEach(function (name) {
    $("tab-" + name).addEventListener("click", function () {
      ["cards", "tutor"].forEach(function (other) {
        var on = other === name;
        $("tab-" + other).setAttribute("aria-selected", on ? "true" : "false");
        $("panel-" + other).hidden = !on;
      });
    });
  });

  /* ---------------------------------------------------------------- wire */

  els.build.addEventListener("click", buildCards);
  els.reveal.addEventListener("click", revealAnswer);
  Array.prototype.forEach.call(document.querySelectorAll("#gradeBar button"), function (b) {
    b.addEventListener("click", function () { gradeDeck(b.getAttribute("data-grade")); });
  });
  els.exportJson.addEventListener("click", function () { doExport("deck-json"); });
  els.exportMd.addEventListener("click", function () { doExport("deck-md"); });
  els.importFile.addEventListener("change", function () {
    importDeck(els.importFile.files && els.importFile.files[0]);
    els.importFile.value = "";
  });
  els.tutorStart.addEventListener("click", startTutor);
  els.tutorSend.addEventListener("click", sendTutor);
  els.revealAfter.textContent = S.REVEAL_AFTER;

  var EXAMPLE = [
    "Respiration",
    "Respiration is the process by which cells release energy from glucose.",
    "Mitochondria are the organelles where respiration happens.",
    "Glycolysis is the first stage of respiration and happens in the cytoplasm.",
    "The Krebs cycle is the second stage of respiration and happens inside the mitochondria.",
    "Oxygen is needed for the Krebs cycle to run.",
    "Lactic acid builds up in muscles when oxygen is short.",
    "ATP is the energy currency of the cell.",
    "ATP is produced in every stage of respiration.",
    "Carbon dioxide is released during the Krebs cycle.",
    "Water is produced at the end of the electron transport chain."
  ].join("\n");

  els.example.addEventListener("click", function () {
    els.pageText.value = EXAMPLE;
    setStatus("ok", "Example loaded: an invented page of notes about respiration. Press Build cards.");
  });

  /* ------------------------------------------------------------ start up */

  var raw = null;
  try { raw = window.localStorage.getItem(K_DECK); } catch (e) { raw = null; }
  if (raw) {
    var parsed = S.parseDeck(raw);
    if (parsed.ok) {
      state.deck = parsed.deck;
    } else {
      /* Reported, offered for export, never overwritten without asking. */
      setStatus("bad", parsed.reason);
      var keep = node("button", "small", "Export the unreadable deck");
      keep.addEventListener("click", function () {
        var out = S.exportFile("raw", parsed, { when: today() }, writer);
        setStatus(out.ok ? "ok" : "bad", out.ok ? "Wrote " + out.filename + "." : out.reason);
      });
      els.deckNote.parentNode.insertBefore(keep, els.deckNote);
      var startFresh = node("button", "small", "Start a new deck");
      startFresh.addEventListener("click", function () {
        try { window.localStorage.removeItem(K_DECK); } catch (e) { /* nothing to remove */ }
        state.deck = null;
        renderDeck();
        setStatus("ok", "Starting a new deck, deliberately. The unreadable file is gone.");
      });
      els.deckNote.parentNode.insertBefore(startFresh, els.deckNote);
    }
  }

  renderDeck();
  if (window.Loom && window.Loom.pwa) window.Loom.pwa.register("sw.js");
})();
