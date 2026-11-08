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
| `items` | A unit of knowledge: `kind` = `lemma` (base word form; inflected forms are evidence on it), `chunk` (set phrase), `grammar` (point from a fixed per-language list — map onto existing keys, don't invent duplicates), `glyph` (letters/kana). Holds spaced-repetition state. Unique per profile on `(kind, key)`; keys are normalized (NFC, lowercase, trimmed). |
| `evidence` | Append-only log: item × outcome (`correct`, `incorrect`, `lookup`, `exposure`) × `source` (lesson type). **Every lesson type reports through `recordEvidence` in `convex/items.ts`.** |
| `roles` | Admin role per user. Granted only from the CLI to an existing account: `npx convex run admin:grant '{"email":"…"}'` (`admin:revoke` to undo). |
| `recordings` | Learner audio in file storage, owned by a user; upload via `convex/recordings.ts`, actions check ownership with `recordings.getOwned`. |
| `mistakes` | Recurring error patterns (`pattern` tag like `aux:avoir-for-etre`), counted, optionally linked to an item. Write via `recordMistake`. |

Lesson types are meant to be plugins: generator (AI action) + UI + grader that
writes evidence/mistakes. Progress views are derived from items + evidence.

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
