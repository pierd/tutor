// Shapes for ready-made content (starter units, AI-built lessons).

export type SeedItem = {
  kind: "lemma" | "chunk" | "grammar" | "glyph";
  key: string;
  text: string;
  gloss?: string;
  notes?: string;
};

export type SeedCard = {
  // Keys of the lesson's items this card exercises.
  itemKeys: string[];
  kind: "meaning" | "form";
  prompt: string;
  cue?: string;
  answer: string;
  accepted: string[];
};

export type SeedLesson = {
  title: string;
  description?: string;
  items: SeedItem[];
  cards: SeedCard[];
};

export type StarterUnit = {
  baseLang: string;
  targetLang: string;
  title: string;
  description?: string;
  lessons: SeedLesson[];
};
