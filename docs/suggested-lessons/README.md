# Suggested lessons

Specs of the original hardcoded practice games (removed from the app; they
lived in `src/dummy/`). Each file holds the full content and the
mechanics, so the lesson can be recreated in the app as a suggested lesson for
its language pair. The original source is in git history (`f7a14bf`).

| File | Pair | What it drills |
|---|---|---|
| [fr-es/etre-avoir.md](fr-es/etre-avoir.md) | es → fr | subject pronouns, présent of être and avoir |
| [fr-es/verbes-er.md](fr-es/verbes-er.md) | es → fr | 50 -er verbs: meaning both ways, présent incl. -ger/-cer spelling |
| [fr-es/verbes-essentiels.md](fr-es/verbes-essentiels.md) | es → fr | 30 high-frequency verbs: meaning both ways, présent (irregulars) |

## Shared mechanics

All three games work the same way:

- **Menu:** pick a lesson (numbered card, shows how many errors you've logged
  on it) and a mode, then start.
- **Modes:** *easy* = multiple choice (correct answer + 3 distractors from the
  same lesson's answer pool); *hard* = type the answer. In hard mode Enter
  submits, Enter again goes to the next task.
- **Checking:** answers are compared after normalising (strip accents,
  lowercase, trim). Some tasks accept several answers.
- **Task picking:** random from the lesson's pool, weighted
  `1 + 4 × errors_on_this_task`, never the same task twice in a row. Mistakes
  therefore come back more often until mastered.
- **Session stats:** streak, correct/total, accuracy %. Error counts can be
  reset.
- **UI language:** Spanish (instructions, feedback: "¡Bien!" / "Falta",
  "Era: …"). Look: French school notebook (lined paper, red margin, Caveat
  handwriting font, stamp animation on feedback).

## Mapping to the tracked-item model

- Each infinitive → a lemma item; each conjugated form → evidence on that
  lemma plus the grammar point (e.g. `présent: être`, `présent: -ger verbs`).
- Pronoun pairs → lemma items for the French pronouns.
- The error-weighted picking is what spaced repetition replaces.
