// Splits a text into plain runs and glossary hits (longest match first), so
// any word in the glossary can be tapped. Works without spaces (Japanese) by
// skipping the word-boundary check.

export type Entry = { surface: string; gloss: string; itemKey?: string };
export type Token = { text: string; entry?: Entry };

const isLetter = (ch: string | undefined) => ch !== undefined && /[\p{L}\p{N}]/u.test(ch);

export function tokenize(text: string, glossary: Entry[], { spaced = true } = {}): Token[] {
  const entries = [...glossary].filter((e) => e.surface).sort((a, b) => b.surface.length - a.surface.length);
  const lower = text.toLowerCase();
  const tokens: Token[] = [];
  let plain = "";
  let i = 0;
  while (i < text.length) {
    const atBoundary = !spaced || !isLetter(lower[i - 1]);
    const entry = atBoundary
      ? entries.find((e) => lower.startsWith(e.surface, i) && (!spaced || !isLetter(lower[i + e.surface.length])))
      : undefined;
    if (entry) {
      if (plain) tokens.push({ text: plain });
      plain = "";
      tokens.push({ text: text.slice(i, i + entry.surface.length), entry });
      i += entry.surface.length;
    } else {
      plain += text[i];
      i++;
    }
  }
  if (plain) tokens.push({ text: plain });
  return tokens;
}
