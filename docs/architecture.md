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
| `readings` | Reading comprehension text per lesson (absent `lessonId` = Everything): title, text, `glossary` (every word form → gloss, optional `itemKey`), questions (true/false or choice, `itemKeys`), cached read-aloud audio, `lastScore` + `lastAnswers`, optional `illustrations` (scene prompt per paragraph + image). All texts are kept as history (`reading.history`, `reading.get`). |
| `coachThreads` | One `@convex-dev/agent` thread per profile for the coach chat (`coach.reset` starts a new one). |
| `proposals` | Lessons (full items + cards) or unit outlines the coach proposed in chat; `pending → accepted/dismissed`. Content is created only on accept. |
| `ttsCache` | Rendered pronunciations keyed by `model|voice|text`. |
| `items` | A unit of knowledge: `kind` = `lemma` (base word form; inflected forms are evidence on it), `chunk` (set phrase), `grammar` (point from a fixed per-language list — map onto existing keys, don't invent duplicates), `glyph` (letters/kana). Holds spaced-repetition state. Unique per profile on `(kind, key)`; keys are normalized (NFC, lowercase, trimmed). |
| `evidence` | Append-only log: item × outcome (`correct`, `incorrect`, `lookup`, `exposure`) × `source` (lesson type). **Every lesson type reports through `recordEvidence` in `convex/items.ts`.** |
| `users` | Convex Auth's table plus `approvedAt`. Sign-up only puts a user on the **wishlist**; until an admin approves them (`convex/wishlist.ts`, "Wishlist" in the admin nav) they only see a waiting page. Admins always have access. New sign-ups email the owner (`convex/notifications.ts`, scheduled from the auth callback in `convex/auth.ts`). |
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
| Reading | 1 LLM call per text (reused), TTS on request | `convex/reading.ts`, `convex/ai/readingAi.ts`, `src/lessons/Reading.tsx` |
| Passive | free (TTS once per card if "Read aloud") | `practice.allCards`, `src/lessons/Passive.tsx` |

Passive is a slideshow of every card in the lesson (shuffled, prompt then
answer, looping with a reshuffle) to leave running and glance at. It records
**no evidence**: the learner isn't actively engaged, so it never changes
progress. Speed slow/normal/fast; with "Read aloud" it waits for the answer's
audio before moving on. Holds a screen wake lock while playing.

Generated content is kept for revisiting: earlier reading texts (with saved
answers, retakeable) and answered sentences (`translation.history`: prompt,
model answer + audio, learner's answer and correction).

Illustrations (opt-in checkbox): the text writer adds up to 3 English scene
prompts tied to paragraphs; `reading.draw` renders each with `IMAGE_MODEL`
(alpha image API, ~30 s and a few cents per image) in the background, so the
text is readable immediately and pictures fill in.

Audio playback goes through `src/lib/ListenControls.tsx`: "Listen" and
"Slower" (same audio at 0.7× with pitch preserved, no extra TTS).

Reading: tapping a word shows its gloss instantly (glossary generated with the
text; `src/lessons/glossaryTokens.ts` does longest-match tokenizing, without
word boundaries for Japanese). On submit, looked-up items get `lookup`
evidence, items of correctly answered questions get `correct`, wrong answers
only `exposure` (a comprehension slip doesn't pin down a word). Check prompts
with `npx convex run reading:smokeTest '{"baseLang":"es","targetLang":"fr"}'`.

`drawCards` ranks cards by due items then weak items, max two per item, with
seeded shuffling (the client passes `seed`) and distractors from sibling
cards (other forms of the same verb) or the same lesson. Cards are drawn once
per round with a one-shot query so the deck doesn't reshuffle.

Spaced repetition: a `correct` answer only reschedules an item when it's due
(drilling flashcards doesn't push items months out); `incorrect` always counts.

Starter content: `convex/seeds/` (`StarterUnit` shape in `seeds/types.ts`),
inserted with `units.insertUnit` / `insertLesson`, which reuse existing items
and cards. Spanish→French: unit "Lo básico" (5 lessons, ~92 items, ~808 cards).

### Coach chat (`convex/coach.ts`, `src/coach/`)

Iterative chat built on the `@convex-dev/agent` component (mounted in
`convex/convex.config.ts`; needs convex ≥ 1.46). The learner describes a lesson
or asks for a plan; the coach (`COACH_MODEL`) replies in the base language and
calls one of two tools, which only write a `proposals` row:

- `proposeLesson` — complete lesson: items + cards (cleaned by
  `cleanContent`), into an existing unit or a new one.
- `proposeUnit` — outline of lessons with a `focus` each.

The chat renders tool results as proposal cards (Accept/Dismiss). `coach.accept`
creates the lesson (via `addLessonContent`) or the unit; unit lessons are
created with `status: "building"` and filled by `coach.buildLesson`
(`buildLessonContent` in `convex/ai/lessonContent.ts`), retryable via
`rebuildLesson`. Accept/dismiss leave a `[note]` user message in the thread so
the coach knows what happened. The coach's system prompt includes the profile,
the current curriculum (with unit ids) and existing item keys so it extends
rather than duplicates. Content rules (meaning cards for every word, form cards
with one `___` gap crediting word + grammar item) live in `contentRules`.

Messages stream via `saveStreamDeltas` + `syncStreams`; the client uses
`useUIMessages(..., { stream: true })`. Prompt checks without UI:
`npx convex run coach:smokeTest '{"baseLang":"es","targetLang":"fr","prompt":"…"}'`
and `coach:smokeBuild`.

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
- Wishlist gate: `requireUserId` (and so `requireProfile`/`requireItem`)
  rejects users who aren't approved yet. Public actions must start with
  `requireUserIdInAction` instead of a bare `getAuthUserId`, or wishlisted
  users could run paid AI calls. `requireSignedInUserId` skips the gate; use it
  only for what the waiting page needs (UI locale).
- Admin-only features: hide in the UI via `api.admin.me` **and** enforce on the
  server (`requireAdmin` in queries/mutations; actions check
  `internal.admin.checkAdmin`, see `convex/voiceLab.ts`).
- Time-dependent queries take `now` from the client (rounded to the minute)
  instead of calling `Date.now()` — see `items.due`.
- Lists are bounded (`.take(n)`), no `.collect()`.
- Starter content per language pair: `convex/seeds/` (`STARTER_SETS`, keyed
  like `fr-es` = target-base), added via `items.addStarterSet`; idempotent.

## Analytics (PostHog)

- Frontend: `src/lib/posthog.ts` inits `posthog-js` (autocapture, pageviews,
  unhandled errors) when `VITE_POSTHOG_KEY` + `VITE_POSTHOG_HOST` are set.
  The project is on PostHog EU; `VITE_POSTHOG_HOST` is the shared lessismore
  reverse proxy `https://wieprz.lessismore.studio/eu` (gets past ad blockers),
  and `ui_host` is pinned to `https://eu.posthog.com`.
  Custom events go through `track(event, props)`; `App.tsx` identifies the
  user by Convex user id (+ email), `SignOut` resets. Event names are
  snake_case (`flashcard_answered`, `coach_proposal_accepted`, ...).
- Backend LLM analytics: `convex/lib/posthogAi.ts` builds `$ai_generation` /
  `$ai_span` events (model, tokens, latency, full prompt and output:
  `privacyMode` is deliberately off). AI functions in `convex/ai/` take an
  optional `AiContext`
  (`createAiContext({ scheduler: ctx.scheduler, distinctId: userId })`); pass
  one from any new AI call. Capturing only schedules `analytics.capture`,
  which sends the event in its own action: a fire-and-forget fetch is dropped
  when the calling function returns, and awaiting PostHog there would delay
  the learner. Uses `posthog-node/edge` because the Node build doesn't run in
  Convex's default runtime.
- Server keys `POSTHOG_PROJECT_TOKEN` / `POSTHOG_HOST` live in the Convex
  deployment env (`npx convex env set`), not `.env.local`.

## Deployments

- Convex dev: `tangible-armadillo-223` (used by `npx convex dev` and
  `.env.local`). Convex prod: `optimistic-flamingo-906`.
- Frontend: Vercel (configured in the Vercel dashboard, not in the repo),
  serving tutor.lessismore.studio. Its Production build command is
  `npx convex deploy --cmd 'npm run build'` with a prod `CONVEX_DEPLOY_KEY`,
  so each deploy pushes functions to prod and injects the prod
  `VITE_CONVEX_URL`. Never set `VITE_CONVEX_URL` by hand in Vercel.
- Prod Convex env: `JWT_PRIVATE_KEY`, `JWKS` (own keys, not dev's) and
  `SITE_URL=https://tutor.lessismore.studio`, plus `POSTHOG_PROJECT_TOKEN` /
  `POSTHOG_HOST`, and `FORWARD_EMAIL_PASSWORD` (generated password of the
  forwardemail.net alias tutor@lessismore.studio) / `NOTIFY_EMAIL` (where
  wishlist sign-up emails go; unset = no email). Vercel needs
  `VITE_POSTHOG_KEY` / `VITE_POSTHOG_HOST`.

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
