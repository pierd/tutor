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

## In progress

- **Step 3c — Reading comprehension**: per-lesson text with true/false and
  multiple-choice questions, generated once and reused, graded locally.

## Known gaps in step 2

- "Why?" follow-up questions about a correction aren't built yet.
- Learner recordings and TTS audio of skipped exercises are never cleaned up.
- No session summary / daily goal yet; mistakes are recorded but not yet used
  to choose what to drill (only item due dates are).

## Next

3. **Reading lesson**: generated or pasted text (story/dialogue/article);
   glosses generated with the text so tap-to-lookup is instant; each lookup →
   `lookup` evidence. TTS read-aloud.
4. **Goals, units, coach**: unit = goal + learner-written definition of done
   (+ optional milestones). Coach generates lessons from due items + the
   goal's target items. For "read this book": extract its vocabulary and show
   % of running words known per chapter (≈95–98% = comfortable reading).
5. More lesson types: listening dictation, role-play audio chat (turn-based:
   record → transcribe → reply → TTS; gateway has no live duplex audio),
   flashcards, grammar quiz, alphabet game (uses `glyph` items + language
   `script`).
6. **Woven text** (diglot weave): text that gradually shifts from base to
   target language (or from one script to another), switching the learner's
   strong items first. Start from a base text, a target text, or a prompt
   targeting tracked vocabulary.
7. Pronunciation: minimal-pair drills, per-word confidence from STT if the
   gateway exposes it, shadowing with side-by-side playback.

## Known gaps in step 3

- No editing of lessons/units/cards after creation (rename, reorder, delete,
  fix a card) — the coach can only propose new ones.
- Units' learner-written definition of done and closing a unit have a schema
  but no UI yet.
- A proposeLesson call takes ~25 s (the model writes all cards in the tool
  call); the chat shows "Preparing a proposal…" meanwhile.

## Open questions

- Profile merging (maybe, later).
- Whether base languages should extend beyond the UI locales.
