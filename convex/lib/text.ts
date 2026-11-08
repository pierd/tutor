// Answer comparison helpers, shared by backend and frontend.

// Lowercase, unify apostrophes, drop punctuation; optionally drop accents.
export function normalize(text: string, { accents = true }: { accents?: boolean } = {}) {
  let s = text.normalize("NFC").toLowerCase().replace(/[’`´]/g, "'");
  if (!accents) s = s.normalize("NFD").replace(/[̀-ͯ]/g, "");
  return s
    .replace(/[^\p{L}\p{N}'\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(text: string) {
  // "j'ai" and "j ai" should match: split on apostrophes too.
  return normalize(text, { accents: false }).split(/[\s']+/).filter(Boolean);
}

// What the learner should say for a card: the gap filled in, or the answer.
export function spokenText(card: { prompt: string; answer: string }) {
  return card.prompt.includes("___") ? card.prompt.replace("___", card.answer).replace("' ", "'") : card.answer;
}

// Spoken answers are judged loosely: every expected word must appear in
// order (accents, punctuation and extra filler words don't matter).
export function matchesSpoken(expected: string, transcript: string) {
  const want = tokens(expected);
  const got = tokens(transcript);
  let i = 0;
  for (const token of got) if (token === want[i]) i++;
  return i === want.length;
}

// Typed answers: exact after normalisation; `accentSlip` when only accents differ.
export function checkTyped(accepted: string[], given: string) {
  const exact = accepted.some((a) => normalize(a) === normalize(given));
  const loose = accepted.some((a) => normalize(a, { accents: false }) === normalize(given, { accents: false }));
  return { correct: exact || loose, accentSlip: !exact && loose };
}
