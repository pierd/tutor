# Roadmap

Product vision (from the owner's notes): two pillars —
1. **Progress tracking**: vocabulary, grammar, common problems.
2. **Content toward a goal**: e.g. read a specific book / watch a show in the
   original, order a meal at a restaurant. A coach creates **units** (with
   optional milestones) and generates lessons inside them; solving lessons
   updates progress.

## Done

- **Step 1 — Foundation**: profiles (multi-profile, switcher), items /
  evidence / mistakes tables, SM-2 scheduler, progress view with manual
  review, es→fr starter set from the old games, UI localized in en/es/pl.
- **Step 2a — Voice plumbing**: `convex/ai/voice.ts` (STT + TTS via the AI
  Gateway), Voice lab tab for comparing models on your own voice, findings in
  [voice.md](voice.md). Default STT model: `openai/gpt-4o-mini-transcribe`.
- Admin role (CLI-granted) gating the Voice lab; classic games removed
  (content kept in `docs/suggested-lessons/`).
- **Step 2 — Translation challenge** ("Practice" tab): DB picks due items, AI
  writes a sentence, learner speaks or types, AI grades per item (inaudible
  differences never penalised, typed follow-up), evidence + mistakes recorded,
  model answer played via TTS, next exercise pre-generated, skip and contest.
  See architecture.md.

- **Step 3a — Curriculum structure**: units → lessons → items in a left
  panel with aggregated progress; Everything lesson; cards; Flashcards and Say
  the word (no AI); Sentences scoped per lesson; French starter unit with real
  conjugation cards.

- **Step 3b — Coach chat**: iterative lesson/unit builder on the agent
  component; proposals as Accept/Dismiss cards; unit lessons built in the
  background. Convex upgraded to 1.49.

- **Step 3c — Reading comprehension**: per-lesson AI text, reused until
  "New text"; tap-to-look-up glossary (lookup evidence), true/false and
  multiple-choice questions graded locally, read-aloud TTS.
- History of generated content (reading texts, answered sentences), slower
  playback for all audio, optional AI illustrations for reading texts.
- Passive modes (no evidence): passive flashcards (slideshow of a lesson's
  cards) and passive learning (slideshow of items with their study details).
- Study material: item details (conjugation tables, gender/plural, examples)
  and lesson study notes, written by the coach; automatic for new lessons, a
  button fills in older ones.
- "Ask the coach" on study notes and items: questions about a word, grammar
  point or the notes, and fixes proposed as cards the learner applies.
- AI agents: MCP server with the coach's abilities plus card/item/lesson
  editing, personal tokens and a setup page. See architecture.md.
- PostHog analytics: product events in the web app, LLM traces (generation,
  grading, reading, coach) from Convex. See architecture.md.

## Known gaps in step 2

- "Why?" follow-up questions about a correction aren't built yet.
- Learner recordings and TTS audio of skipped exercises are never cleaned up.
- No session summary / daily goal yet; mistakes are recorded but not yet used
  to choose what to drill (only item due dates are).

## Next

3. **Reading from your own text**: paste a text (or a chapter of the book in
   the goal) instead of generating one; glossary + questions generated for it.
4. **Curriculum editing + definition of done**: rename/reorder/delete lessons
   and units, fix or add cards; unit "definition of done" written by the
   learner (coach may suggest) and learner-controlled closing. For "read this
   book": extract its vocabulary and show % of running words known per chapter
   (≈95–98% = comfortable reading).
5. More lesson types: listening dictation, role-play audio chat (turn-based:
   record → transcribe → reply → TTS; gateway has no live duplex audio),
   grammar quiz, alphabet game (uses `glyph` items + language
   `script`).
6. **Woven text** (diglot weave): text that gradually shifts from base to
   target language (or from one script to another), switching the learner's
   strong items first. Start from a base text, a target text, or a prompt
   targeting tracked vocabulary.
7. Pronunciation: minimal-pair drills, per-word confidence from STT if the
   gateway exposes it, shadowing with side-by-side playback.

## Known gaps in step 3

- Storage isn't cleaned up (recordings, TTS of skipped sentences, images).

- Mistake patterns are recorded but not yet used to pick what to drill.

- No editing of lessons/units/cards in the app after creation (rename,
  reorder, delete, fix a card). Through MCP agents can do all but reorder
  and delete lessons/units; the in-app coach can only propose new ones, or fix an item's
  gloss/notes/details and a lesson's study notes.
- Units' learner-written definition of done and closing a unit have a schema
  but no UI yet.
- A proposeLesson call takes ~25 s (the model writes all cards in the tool
  call); the chat shows "Preparing a proposal…" meanwhile.

## Open questions

- Profile merging (maybe, later).
- Whether base languages should extend beyond the UI locales.
