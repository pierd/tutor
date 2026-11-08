# Architecture

Tutor is a language-learning app where **the learner drives and AI tools
teach**. Stack: Vite + React 19 + Tailwind 4 frontend (`src/`), Convex backend
(`convex/`), Convex Auth (password provider), Convex AI Gateway for LLM,
speech-to-text and text-to-speech (gateway needs a paid Convex plan; voice is
alpha — see https://docs.convex.dev/ai-gateway/voice.md).

See [roadmap.md](roadmap.md) for what's built and what's next, and
[voice.md](voice.md) for speech models and gateway quirks.

## Core model: items + evidence

Everything is **profile-scoped**. A user owns several profiles; each is one
language pair (`baseLang` → `targetLang`) plus an optional goal, with fully
separate progress.

| Table | Role |
|---|---|
| `profiles` | Language pair + goal. `baseLang` is also the language AI explanations/feedback should use. |
| `userSettings` | Per user: `activeProfileId`, `uiLocale`. |
| `units` / `lessons` | Curriculum per profile: ordered units containing ordered lessons. A unit has the learner's own `definitionOfDone` and is only closed by them. |
| `lessonItems` | Many-to-many lesson ↔ item. Progress lives on items, so an item practised anywhere counts in every lesson containing it. Lesson progress = mean item strength + due count; unit = over the distinct items of its lessons (`units.tree`). The virtual **Everything** lesson covers all items. |
| `cards` | Ready-made practice material for cheap modes: `meaning` (base-language gloss → target word) or `form` (prompt with `___` gap + `cue`, e.g. conjugation). Answering credits every item in `itemIds`. Created once (seed or AI lesson builder), then free to practise. |
| `ttsCache` | Rendered pronunciations keyed by `model|voice|text`. |
| `items` | A unit of knowledge: `kind` = `lemma` (base word form; inflected forms are evidence on it), `chunk` (set phrase), `grammar` (point from a fixed per-language list — map onto existing keys, don't invent duplicates), `glyph` (letters/kana). Holds spaced-repetition state. Unique per profile on `(kind, key)`; keys are normalized (NFC, lowercase, trimmed). |
| `evidence` | Append-only log: item × outcome (`correct`, `incorrect`, `lookup`, `exposure`) × `source` (lesson type). **Every lesson type reports through `recordEvidence` in `convex/items.ts`.** |
| `roles` | Admin role per user. Granted only from the CLI to an existing account: `npx convex run admin:grant '{"email":"…"}'` (`admin:revoke` to undo). |
| `recordings` | Learner audio in file storage, owned by a user; upload via `convex/recordings.ts`, actions check ownership with `recordings.getOwned`. |
| `exercises` | Translation challenge queue: one generated sentence (`prompt` in base language, accepted `answers`, `itemIds`, pre-rendered TTS of the model answer). Status `generating → ready → answered` (or `skipped`/`failed`). One pending exercise per profile. |
| `attempts` | An answer to an exercise (`speech` transcript or `text`), with verdict, minimal correction, feedback, per-item outcome (`correct`/`incorrect`/`inaudible`), mistakes, `contested`. |
| `mistakes` | Recurring error patterns (`pattern` tag like `aux:avoir-for-etre`), counted, optionally linked to an item. Write via `recordMistake`. |

Lesson types are meant to be plugins: generator (AI action) + UI + grader that
writes evidence/mistakes. Progress views are derived from items + evidence.

### Practice modes (per lesson, cheapest first)

| Mode | Cost | Where |
|---|---|---|
| Flashcards (multiple choice / typed) | free | `practice.drawCards` + `practice.answerCard`, `src/lessons/Flashcards.tsx` |
| Say the word | 1 STT call (~$0.0001) | `practice.checkSpoken` (local match via `convex/lib/text.ts`), learner can overrule, `src/lessons/SayWord.tsx` |
| Sentences | LLM generate + grade | translation challenge below, scoped by `lessonId` |
| Reading | planned (Phase C) | |

`drawCards` ranks cards by due items then weak items, max two per item, with
seeded shuffling (the client passes `seed`) and distractors from sibling
cards (other forms of the same verb) or the same lesson. Cards are drawn once
per round with a one-shot query so the deck doesn't reshuffle.

Spaced repetition: a `correct` answer only reschedules an item when it's due
(drilling flashcards doesn't push items months out); `incorrect` always counts.

Starter content: `convex/seeds/` (`StarterUnit` shape in `seeds/types.ts`),
inserted with `units.insertUnit` / `insertLesson`, which reuse existing items
and cards. Spanish→French: unit "Lo básico" (5 lessons, ~92 items, ~808 cards).

### Translation challenge (`convex/translation.ts`, `src/lessons/TranslationLesson.tsx`)

1. `translation.next({ profileId, lessonId? })` returns the pending exercise for
   that lesson or creates one. In a lesson it picks due items then the least
   recently reviewed lesson items (never new items). In Everything it picks up to
   2 due items (previously reviewed first, then new ones shuffled) and decides
   whether the AI may introduce one new item (no targets, or few targets and
   ≥80% recent accuracy). Empty profiles bootstrap this way for any language
   pair.
2. `generate` (internal action) asks `GENERATE_MODEL` for the sentence
   (`convex/ai/translationAi.ts`), pre-renders TTS of the model answer, then
   `saveGenerated` keeps only target items the sentence really uses and upserts
   the new item.
3. Learner speaks (upload → `submitSpeech` → STT with `DEFAULT_STT_MODEL`) or
   types (`submitText`). `GRADE_MODEL` grades; speech rules say inaudible
   differences are never penalised (outcome `inaudible`, `needsTypedCheck`).
4. `saveAttempt` records evidence (inaudible → `exposure`), mistakes, marks the
   exercise answered and immediately creates the next pending exercise. A typed
   follow-up only settles items that were inaudible.
5. `contest` restores the failed items' schedules from `attempts.srsBefore`,
   logs `correct` evidence and decrements mistake counts.

LLM choices live in `convex/ai/models.ts`. Prompt checks without the UI:
`npx convex run translation:smokeTest '{"baseLang":"es","targetLang":"fr"}'`
(add `"answer"`, `"mode"`, `"prompt"`/`"answers"` or `"empty":true`).

Spaced repetition lives in `convex/lib/srs.ts` (small SM-2 variant, pure
functions, swappable for FSRS). `lookup` is a soft fail, `exposure` doesn't
reschedule.

## Backend conventions

- Read `convex/_generated/ai/guidelines.md` before writing Convex code.
- Auth: `requireUserId` / `requireProfile` / `requireItem` in
  `convex/lib/auth.ts`. Never accept a user id as an argument; every public
  function that takes a `profileId` or `itemId` must go through these.
- Admin-only features: hide in the UI via `api.admin.me` **and** enforce on the
  server (`requireAdmin` in queries/mutations; actions check
  `internal.admin.checkAdmin`, see `convex/voiceLab.ts`).
- Time-dependent queries take `now` from the client (rounded to the minute)
  instead of calling `Date.now()` — see `items.due`.
- Lists are bounded (`.take(n)`), no `.collect()`.
- Starter content per language pair: `convex/seeds/` (`STARTER_SETS`, keyed
  like `fr-es` = target-base), added via `items.addStarterSet`; idempotent.

## Languages and localization

- `convex/lib/languages.ts` is the single list, imported by both backend and
  frontend: UI locales (`en`, `es`, `pl`), base languages (= UI locales),
  learned languages (starting set: en, es, fr, it, de, pt, pl, ja — add entries
  to extend; each has a `script`).
- UI strings: i18next (`src/i18n/`), catalogs in `src/i18n/locales/{en,es,pl}.json`.
  **Every UI string goes through `t()` and must exist in all three catalogs.**
  Polish needs `_one/_few/_many/_other` plural keys, Spanish `_one/_many/_other`.
- UI locale is a user setting (`userSettings.uiLocale`, mirrored in
  `localStorage` for the signed-out screen), independent of a profile's
  `baseLang`. Language names come from `Intl.DisplayNames`, not catalogs.

## Product decisions to respect

- The learner is in control: they choose focus, can skip, contest grades,
  mark things known, edit their item list.
- Units/goals (not built yet) are **never auto-finished**. The learner writes
  their own definition of done; the coach may suggest one and show evidence;
  only the learner closes or reopens a unit.
- Pronunciation: transcription models "fix" learner speech toward the likely
  correct sentence, so a clean transcript is not proof of good pronunciation.
  Prefer context-free checks (minimal pairs), per-word confidence when
  available, and learner-judged shadowing.
- In French many grammar errors are inaudible (parle/parles/parlent); spoken
  grading should flag inaudible items and follow up with typed input.

## Legacy

The original hardcoded games were removed from the app; their full content is
archived in `docs/suggested-lessons/` (source in git history at `f7a14bf`) so
they can be recreated as suggested lessons.
