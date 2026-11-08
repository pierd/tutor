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

## Next

2. **Translation challenge** (first AI lesson type, needs AI Gateway):
   pick due/weak items (+ at most one new item if recent accuracy is high) →
   LLM writes a sentence in the base language using exactly those items
   (structured output: sentence, accepted target answers, items used) →
   learner speaks (MediaRecorder → Convex storage → transcription with
   language set to target) or types → LLM grades per item, tags mistakes,
   flags inaudible items for a typed follow-up → `recordEvidence` /
   `recordMistake` → TTS plays the correct sentence (cache audio in storage).
   Pre-generate the next exercise while the learner answers. Learner can
   skip, contest a grade, ask "why?". Keep all voice calls in one module
   (alpha API). Then remove the Classic games tab.
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

## Open questions

- Profile merging (maybe, later).
- Whether base languages should extend beyond the UI locales.
