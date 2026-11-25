BUILD PROMPT — Study   (plan row #6 of 37)

## Inputs

```
APP:        Study
SPEC:       QUEUE/app-codex.md
REPO:       https://github.com/drsamonline/app-study   (empty)
            the plan also matches: study, app-codex, codex
PLAN_ROW:   #6
MERGED:     codex, socratic
```

This build absorbs 2 specs into one app. Their must-nots still bind, and all of them are quoted below.

Needs before it can ship: on-device model/OCR

---

## What you are building

One app, from its spec, into that repo. Nothing else. Not a second app, not a kit unless the
spec needs one, not a refactor of a neighbour.

### The house rules (they are not preferences)

- **Offline-first, always.** No server, no account, no telemetry, no network call at runtime.
  If the app needs a model, it ships in the app or the app says what it cannot do.
- **Single-file where possible.** One `docs/play/index.html` with its kits beside it. The
  build kit (`app-builder`) turns that into a Windows EXE and an Android APK — so the same
  bytes must work as a file:// page, an installed PWA and an APK.
- **The spec's "what it must NOT do" are test assertions, not prose.** Each one becomes a
  named test that fails if the app ever does it.
- **The spec's "what it does when things go wrong" is four cases**, and all four ship:
  bad input, no network, storage full or unavailable, corrupt saved state. An app that
  silently treats "no data" as "no matches" is not done.
- **Nothing is fabricated.** No invented data, no placeholder screenshot presented as a live
  capture, no badge nobody measures, no sample corpus passed off as the real thing. If an
  asset must be supplied by the owner, say so and leave the slot visibly empty.
- **India is the default audience**: ₹, lakh/crore, metric, dd/mm/yyyy, IST, and the local
  examples before the international ones.
- **Licence:** PolyForm Noncommercial 1.0.0 unless the spec says otherwise; SPDX headers on
  every source file; `data/SOURCE.md` recording the source, the licence of the **data**, and
  the fetch date for anything not written by us.

### Step 0 — Preflight (before you claim anything is missing)

1. Read the spec. Read its master-list row. Read its `PLAN.json` row, including `members` —
   a merged build's other specs are in `QUEUE/archive/` and their must-nots still apply.
2. **Rule 0: check the estate first.** Search the org for an app that already does this job.
   If one does, stop and report the collision with the repo name. Building the second version
   of a shipped app is the most expensive mistake available here.
3. Ask which credential you are holding. A `gh` 404 is a wrong credential, never proof of
   absence. Any finding of "impossible" must name the credential it was attempted with.
4. **You cannot create repositories.** If the repo does not exist, that is the owner's step —
   say so and stop. An empty repo that exists is yours to fill.

### Step 1 — Scope it in writing, before code

Produce a short block and keep it for the final report:

- the job, in one sentence;
- the mechanic that makes it not-generic, in one sentence;
- every **must-not**, as a test name;
- the four failure cases, as behaviour;
- the kits it needs (from the spec) and whether each already exists;
- what the app will **not** do in v1, explicitly.

If the app needs a capability no kit has: create the kit first, with its own test, and say so.

### Step 2 — Scaffold, do not hand-roll

`python3 scripts/new-app.py <app-id>` writes the shape:

```
docs/index.html          landing page (what it is, honest status, how to run it)
docs/play/index.html     the app itself
docs/play/*.js           the kits it vendors, next to the page that loads them
tests/self-tests.js      assertions, no framework
PAGES.json               the page manifest
README.md                what it does, how to run, what is not built
```

**Then prove the shape before you fill it:** every `<script src>` in the page must resolve to
a file that exists beside it. A scaffold has shipped here before with the kits in the wrong
folder, and the page 404'd its own runtime while the build stayed green.

If the repo is empty and `scripts/` is not available to you, build the same shape by hand —
the file list above is the contract, not the script.

### Step 3 — Build to the spec

Work the spec top to bottom. Where the spec is silent, choose the smaller behaviour and say
so in the report. Where the spec and the master-list one-liner disagree, **the spec body
wins** and the disagreement goes in the report (five such contradictions are already known).

### Step 4 — Tests that could fail

- `node tests/self-tests.js` — every must-not is an assertion; every failure case is a case.
- Print the count. A suite of 0 assertions is a failure, not a pass.
- **Mutation-test it**: break three things on purpose (remove a guard, make a refused input
  succeed, report a failed save as saved) and confirm the suite goes red each time. Restore.
- If the suite cannot go red, it is documentation, not a test.

### Step 5 — Deliver

- Pages on, demo live at `https://drsamonline.github.io/<repo>/`, and the demo **is** the app
  (no separate build of the page).
- A release with the EXE and APK from `app-builder`, built from the same source.
- Topics set (they are the discovery surface), licence headers, `CHANGELOG.md`, `NOTICE`.
- README states the real status: what works, what does not, what is untested.

### Step 6 — Record it

- Append one line to `PROGRESS.log`: what was built, the test counts, the demo URL, what was
  **not** built and why.
- **Do not edit `QUEUE/PLAN.json`.** `tools/queue-sync.py` flips the row to `built` when the
  repo and its Pages answer. Writing `built` by hand is how a plan starts lying.
- Do not edit `ACTIONS.md` — its build order is generated.

### Step 7 — Report in this shape

```
APP      <name>  (plan row #<order>, <n> specs merged)
REPO     <url>   commit <sha>
DEMO     <url>
TESTS    <n>/<n> assertions, mutation-tested <n> ways
BUILT    <the features that exist>
NOT BUILT <the features the spec asks for that do not, and why>
MUST-NOT <each one, and the test that holds it>
NEEDS    <what only the owner can supply: assets, keys, data, a decision>
NEXT     <the smallest honest next step for this app, or "done">
```

Never write "done" for a feature you did not prove. `unverified` with the reason is a better
line than a green claim.

---

## Definition of done (the owner's, not yours)

> A working app, with a working release, a landing page, and a live demo where the app is a
> web app — and the tests that prove the must-nots, run in CI.

Anything less is `partial`, and the report says which of the three is missing.

---

## When you are blocked

Say which of these it is, in one line, and stop:

- **no spec** → the spec is the next step, not the code;
- **the app already exists** → name the repo and the overlapping features;
- **the repo does not exist** → the owner creates it; you cannot;
- **a capability no kit has** → the kit is the next step;
- **an asset only the owner has** (a photo, a UPI ID, a licensed corpus, a key) → build the
  slot, leave it visibly empty, name what is needed;
- **a credential that cannot see the thing** → name the credential, not a verdict.

---

## The five ways this has gone wrong before

1. **Built the second version of a shipped app** — Rule 0 exists because of it.
2. **Shipped a scaffold whose page could not load its own kits** — prove every `src` resolves.
3. **Claimed a badge or a status nobody measures** — a green shield that lies is worse than none.
4. **Logged "done" from an exit code** — the verdict is the artifact on the branch, not git's
   exit status.
5. **Reported the system blocked on the strength of the wrong credential** — a 404 is a
   credential, not a fact.

---

# THE SPEC — Study (`app-codex`)

# Codex

- **id:** app-codex
- **category:** AI-backed (BYO key)
- **tier:** —
- **source:** the app master list, #2
- **status:** READY - spec written from the idea's own build prompt

## Pitch

turn a photo of notes into a study system

## The spec

**Prompt:**
Build an AI app called **Codex** that photographs a student's handwritten notes or
a textbook page and turns it into **structured flashcards with a spaced-repetition
schedule**. BYO free key; on-device OCR.

Implement:
- Capture a page; on-device OCR extracts the text (handwriting where feasible);
  the LLM converts it into question/answer cards grouped by topic.
- Cards feed a built-in **spaced-repetition (SM-2 style)** scheduler with daily
  review.
- A "gap finder" that flags concepts the notes mention but never define, and
  offers to fill them.
- Everything stored locally; decks exportable as files.

Offline/degradation: OCR + existing decks + the scheduler work with no key; the
LLM is only for card generation.

Novelty: the pipeline is **paper → structured memory**, and the payoff is the
scheduler, not the summary — it turns passive notes into active recall.

---

## What it must NOT do

- grow a second job. If a request needs "and", it is two apps.

## What it does when things go wrong

- **Bad input** — a photo with no legible text returns "nothing read" with the image shown, and the
  study set is not generated from an empty read.
- **No network** — nothing changes. OCR and card generation are on the device.
- **Storage full or unavailable** — the cards are generated in memory; the set is not saved and the app
  says so, rather than showing a set that will vanish on reload.
- **Corrupt saved state** — an unreadable set is reported and offered for export; the app does not
  overwrite it with a new set from a later photo without asking.

## The data

- everything on the device; nothing leaves it unless the user exports it.

## Done means

- A photographed page carrying ten clearly printed facts yields **at least ten** question/answer cards, and each card's answer appears in the OCR text. A card answered 'again' is scheduled **sooner** than one answered 'easy'. The gap finder names a term the page uses without defining, and the deck exports to a file and re-imports with its review dates intact.

---

# SPECS THIS BUILD ABSORBS (1)

## `app-socratic` — Socratic

**Pitch**

a tutor that refuses to give you the answer

**What it must NOT do**

- grow a second job. If a request needs "and", it is two apps.

**What it does when things go wrong**

- **Bad input** — a question with no stated subject is met with a question back rather than a guess at
  the subject, which is the app's whole method. An empty turn is refused.
- **No network** — nothing changes. The tutor runs on the device.
- **Storage full or unavailable** — the session continues in memory and the app says the transcript
  will not be kept.
- **Corrupt saved state** — an unreadable session is reported and offered for export; the app does not
  resume from a partial transcript and present it as the whole conversation.

**The spec (the prompt it was written from)**

**Prompt:**
Build an AI app called **Socratic** that teaches by the Socratic method: it
**never gives the answer**, only questions that lead the learner to find it. The
user supplies their own free LLM key.

Implement:
- The user states a topic or pastes a problem; the app responds only with probing
  questions, escalating hints framed as questions, and "what would happen if…"
  prompts.
- A **state machine** around the LLM enforces the no-answer rule (the model is
  instructed to never state the solution; the app rejects responses that leak it).
- A "give up / reveal" action that unlocks the answer only after the user has
  attempted a fixed number of steps.
- Progress notes stored locally so it can revisit weak areas.

Offline/degradation: without a key, falls back to a bundled question bank for
common topics.

Novelty: an AI tutor whose product is **restraint** — the hard part of tutoring
is not answering, and this app makes that the mechanic.

---

---

## After the build

- Append one line to `PROGRESS.log`. Do **not** edit `QUEUE/PLAN.json` — `tools/queue-sync.py` moves row #6 to `built` when the repo and its Pages answer.
- Report in the shape the brief asks for. Anything you did not prove is `unverified`, not done.
