# Changelog

All notable changes to Study are recorded here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Dates: dd/mm/yyyy.

## [Unreleased]

## [1.0.0] — 25/11/2026

### Added
- Card building from a pasted page: the page is cut into sentences, each fact becomes a
  definition card or a cloze, and **every answer is a verbatim piece of the page** — asserted
  for every card.
- Scheduling by the estate's own `srs-kit` (SM-2), vendored unmodified: learning steps first
  (again 10 minutes, hard 1 day, good 1 day, easy 4 days), then SM-2 owns every review. A card
  answered "again" therefore returns before one answered "easy" — asserted.
- Gap finder: terms used more than once and never defined, with their counts.
- Deck export as JSON and Markdown, and import that keeps every review date, interval, ease and
  phase — asserted by round trip.
- Socratic tutor: a bundled bank of eight moves, a state machine that enforces the no-answer
  rule (a question that would leak the card's answer is replaced before it is shown), a reveal
  only after three attempts — and the reveal is the sentence in your notes, not a lecture.
- The tutor refuses a subject that is not in the deck: one job, not two.
- Corruption handling: an unreadable deck is reported, offered for export, and never overwritten
  by a new set without asking.
- PWA shell, CI (163 engine assertions + 38 in jsdom + page smoke), and the app-builder
  pipeline pinned to the canonical SHA for the EXE/APK/Linux release.

### Not built
- Reading a photograph of notes: no OCR model exists in this estate, and none is pretended.
- Any LLM or key: the tutor's questions come from the bundled bank.
