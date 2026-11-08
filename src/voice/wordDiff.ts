// Word-level comparison of a transcript against a reference sentence.
// Case and punctuation are ignored; accents are not (they can change meaning).

export type DiffToken = { word: string; match: boolean };

function tokens(text: string) {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/[^\p{L}\p{N}'\s-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

// Marks each transcript word as matching the reference or not (LCS alignment).
export function diffWords(reference: string, transcript: string): DiffToken[] {
  const a = tokens(reference);
  const b = tokens(transcript);
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const result: DiffToken[] = [];
  let i = 0;
  let j = 0;
  while (j < b.length) {
    if (i < a.length && a[i] === b[j]) {
      result.push({ word: b[j], match: true });
      i++;
      j++;
    } else if (i < a.length && lcs[i + 1][j] >= lcs[i][j + 1]) {
      i++;
    } else {
      result.push({ word: b[j], match: false });
      j++;
    }
  }
  return result;
}
