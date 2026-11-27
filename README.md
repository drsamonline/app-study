# Study

A page of notes into **active recall**. Every card's answer is a piece of the page, the schedule
brings back what you forgot, and the tutor asks about your notes without ever telling you the answer.

- **Demo (the app itself):** https://drsamonline.github.io/app-study/play/index.html
- **Landing page:** https://drsamonline.github.io/app-study/
- **Release:** https://github.com/drsamonline/app-study/releases/tag/app-latest
- **Plan row:** #6 of 37 in `drsamonline/forge` → `QUEUE/PLAN.json`
- **Specs absorbed:** `app-codex` (lead), `app-socratic`
- **Licence:** PolyForm Noncommercial 1.0.0
- **Sponsor:** [github.com/sponsors/drsamonline](https://github.com/sponsors/drsamonline) — free, offline, no account

## Status

| | |
|---|---|
| **Built** | Cards from a pasted page with every answer verbatim from it; SM-2 scheduling via the estate's `srs-kit` (learning steps, then the algorithm); "again" before "easy" by construction; the gap finder; deck export/import with review dates intact; a Socratic tutor with a bundled question bank and a code-level no-answer rule; corruption reported, never overwritten. |
| **Release** | Windows EXE, Android APK and Linux binary, built from this source by `app-builder` in CI. |
| **Not built** | **Reading a photograph of notes.** The Codex prompt asks for on-device OCR; there is no OCR model in this estate, so Study ships none, claims none, and says so on the page. **Any LLM or key** — the tutor's questions come from a bundled bank of eight moves. |
| **Untested** | The service worker and install prompt (jsdom implements neither), and the card quality on a real student's handwriting-transcribed notes — the extraction is asserted on printed-fact pages, not measured against readers. |

## The Codex spec's "done means", counted

> "A photographed page carrying ten clearly printed facts yields at least ten question/answer
> cards, and each card's answer appears in the OCR text. A card answered 'again' is scheduled
> sooner than one answered 'easy'. The gap finder names a term the page uses without defining,
> and the deck exports to a file and re-imports with its review dates intact."

The photograph is replaced by a pasted page — there is no OCR here — and **everything the
sentence actually tests** is asserted, in `tests/self-tests.js`:

| The spec says | The test |
|---|---|
| ten facts yield ≥10 cards | a ten-fact page yields ≥10 cards |
| each card's answer appears in the text | every card's answer is a substring of the page (zero exceptions) |
| "again" is scheduled sooner than "easy" | `again.due < good.due < easy.due`; "again" returns within the hour |
| the gap finder names an undefined term | a term used twice and never defined is named; a defined term is not reported |
| export and re-import keep review dates | round trip preserves `due`, `interval` and `phase` per card |

## Two specs, one job

Codex is *paper → structured memory*; Socratic is *a tutor that refuses to give the answer*. They
merge because they are the same job seen twice: **recall from your own notes**. So the tutor only
asks about cards in your deck — ask it about something you never wrote down and it refuses,
because that would be a second job. Both specs' must-not is asserted in both directions.

## What it will not do

- **Read a photograph.** No OCR, no camera, no vision model.
- **Invent a card.** If no fact can become a card whose answer comes from the text, it makes none and says so.
- **Give you the answer.** Every move is checked against the card's answer before it is shown; a leaking question is replaced by a safe one.
- **Be a general tutor.** Out-of-deck subject → refused, with the reason.
- **Use a model, a key or a network.** No `fetch`, no endpoint, no API key; CSP `connect-src 'none'`.

## When things go wrong

| Case | Behaviour |
|---|---|
| **Bad input** | Nothing readable → "nothing readable", and no set is generated from an empty read. Empty tutor turn → refused. No subject → a question back, never a guess. |
| **No network** | Nothing changes; cards, schedule and tutor are on the device. |
| **Storage full or unavailable** | Cards are generated and shown; the deck is not saved and the app says they will vanish on reload. |
| **Corrupt saved state** | Reported, offered for export, never overwritten by a new set without asking; a session is never resumed from a partial transcript as if it were whole. |

## Scheduling, in detail

`srs-kit` is SM-2, and SM-2 on a brand-new card puts "again" and "easy" both at one day — which is
exactly the thing the spec forbids. So a new card runs on **learning steps** first:

| Answer | Comes back in |
|---|---|
| Again | 10 minutes |
| Hard | 1 day |
| Good | 1 day |
| Easy | 4 days |

The first non-lapse answer graduates the card into SM-2, which owns every review after that. One
consequence is SM-2's own: after graduation, "good" and "easy" both land on six days, because
SM-2's second interval is fixed. That is the algorithm, not a bug hidden in this app.

## Tests

```bash
npm test                      # all three suites
node tests/self-tests.js      # engine — 163 assertions, including the done-means
node tests/ui-tests.js        # the page in jsdom — 38 assertions (needs the dev-only jsdom)
node tests/page-smoke.js      # every local src/href resolves, nothing off-origin
```

Mutation-tested five ways on 25/11/2026: a card whose answer is not from the page (1 failure),
"again" scheduled like "easy" (3), review dates dropped on the round trip (2), a tutor that states
the answer (2), and a tutor that accepts any subject (2) each turned the suite red; restored,
163/163.

## Layout

```
docs/index.html            landing page
docs/play/index.html       the app (Cards and Tutor tabs)
docs/play/app.js           DOM wiring: build, review, grade, tutor, import/export
docs/play/study-core.js    the engine — cards, gaps, schedule, tutor, deck
docs/play/srs-kit.js       vendored kit (unmodified) — SM-2, the scheduler
docs/play/web-kit.js       vendored kit (unmodified)
docs/play/export-kit.js    vendored kit (unmodified)
tests/self-tests.js        engine suite (163)
tests/ui-tests.js          page suite (38, jsdom)
tests/page-smoke.js        shape on disk
PAGES.json                 landing = docs/index.html, app = docs/play/index.html
```

## Where the spec was silent, and what was chosen

- **Cloze over question generation.** A cloze card's answer is a slice of the page by construction,
  which is how the "answer appears in the text" guarantee is kept rather than promised.
- **The reveal is the source sentence**, not a model's explanation — the notes are the authority,
  and the app is not.
- **Eight Socratic moves**, cycled: clarify, recall, example, counter-case, connect, narrow, locate,
  apply. A fixed bank is why the no-answer rule can be enforced in code rather than hoped for.
- **A new set over an old deck asks first.** Losing a schedule silently would be worse than an
  extra click.

## What is not built, and why

**OCR.** The prompt's first step is "on-device OCR extracts the text". No OCR component exists in
this estate (`optical-kit` is optical *transfer* — an LT fountain code — not a reader), so the app
starts where the text starts: paste or type it. Everything downstream is as specified.

**The LLM.** The prompt says BYO free key for card generation and for the tutor. The house rules
forbid a runtime network call, and a bundled bank plus verbatim extraction is the offline path the
prompt itself describes — so it is the only path here.
