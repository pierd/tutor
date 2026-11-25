import { generateText, Output } from "ai";
import { convexGateway } from "@convex-dev/ai-sdk-provider";
import { z } from "zod";
import { COACH_MODEL } from "./models";
import { languageLabel } from "./translationAi";
import type { SeedCard, SeedItem } from "../seeds/types";
import { captureAiGeneration, type AiContext } from "../lib/posthogAi";

// Schemas and rules for AI-written lesson content (items + cards), shared by
// the coach's proposeLesson tool and the background lesson builder.

export const itemSchema = z.object({
  kind: z.enum(["lemma", "chunk", "grammar", "glyph"]),
  key: z
    .string()
    .describe("Stable identity: dictionary form in lowercase for lemmas, the phrase for chunks, a short id like 'present:etre' for grammar."),
  text: z.string().describe("Display form in the target language."),
  gloss: z.string().describe("Meaning in the learner's base language."),
  notes: z.string().optional(),
});

export const cardSchema = z.object({
  itemKeys: z.array(z.string()).min(1).describe("Keys of this lesson's items the card exercises."),
  kind: z.enum(["meaning", "form"]),
  prompt: z
    .string()
    .describe("meaning: the base-language meaning. form: a short target-language phrase with ___ for the gap."),
  cue: z.string().optional().describe("form cards: shown next to the gap, e.g. the infinitive."),
  answer: z.string().describe("The exact target-language text that fills the gap / translates the meaning."),
  accepted: z.array(z.string()).describe("All acceptable answers, including `answer`."),
});

export const lessonContentSchema = z.object({
  items: z.array(itemSchema).min(1).max(40),
  cards: z.array(cardSchema).min(1).max(120),
});

export function contentRules(baseLang: string, targetLang: string) {
  const base = languageLabel(baseLang);
  const target = languageLabel(targetLang);
  return `Lesson content rules (learner speaks ${base}, learns ${target}):
- Items are the concepts to learn: words (lemma), set phrases (chunk), grammar points (grammar) or letters/characters (glyph). 6–20 items per lesson is ideal.
- Reuse the exact key of an existing item when the concept is already tracked.
- Cards are cheap, no-AI practice. Give every lemma/chunk a "meaning" card (prompt = ${base} meaning, answer = ${target} text).
- Add "form" cards wherever form matters: conjugation, gender/articles, plurals, numbers in context, word order. Prompt is a short natural ${target} phrase with exactly one ___ gap; cue gives the base form; answer fills the gap exactly. Each form card should credit both the word and the grammar item.
- Answers must be correct and unambiguous; list real alternatives in accepted.
- Keep prompts short. Never put the answer inside the prompt.`;
}

// Why a card can't be practised, or null if it's fine.
export function cardProblem(card: { kind: "meaning" | "form"; prompt: string; answer: string }) {
  if (card.prompt.trim() === "") return "the prompt is empty";
  if (card.answer.trim() === "") return "the answer is empty";
  if (card.kind === "form" && card.prompt.split("___").length !== 2) {
    return 'a form card needs exactly one "___" gap in its prompt';
  }
  return null;
}

// Validates AI content: drops cards that reference unknown items or break the
// gap rule, dedupes items by key.
export function cleanContent(content: { items: SeedItem[]; cards: SeedCard[] }) {
  const norm = (k: string) => k.normalize("NFC").trim().toLowerCase();
  const items = [...new Map(content.items.map((item) => [norm(item.key), item])).values()];
  const keys = new Set(items.map((item) => norm(item.key)));
  const cards = content.cards
    .map((card) => ({
      ...card,
      itemKeys: card.itemKeys.filter((k) => keys.has(norm(k))),
      accepted: [...new Set([card.answer, ...card.accepted])],
    }))
    .filter(
      (card) =>
        card.itemKeys.length > 0 && cardProblem(card) === null,
    );
  return { items, cards };
}

export async function buildLessonContent(input: {
  baseLang: string;
  targetLang: string;
  goal?: string;
  unitTitle: string;
  title: string;
  focus: string;
  existingKeys: string[];
}, context?: AiContext) {
  const started = Date.now();
  const { output, usage } = await generateText({
    model: convexGateway(COACH_MODEL),
    output: Output.object({ schema: lessonContentSchema }),
    system: `You write the content of one lesson in a language-learning app.\n${contentRules(input.baseLang, input.targetLang)}`,
    prompt: `Unit: ${input.unitTitle}
Lesson: ${input.title}
What it should cover: ${input.focus}
${input.goal ? `Learner's goal: ${input.goal}\n` : ""}Already tracked item keys: ${input.existingKeys.join(", ") || "(none)"}`,
  });
  if (context) {
    await captureAiGeneration({
      context,
      model: COACH_MODEL,
      input: [{ role: "user", content: JSON.stringify(input) }],
      output: [{ role: "assistant", content: JSON.stringify(output) }],
      latencyMs: Date.now() - started,
      usage,
    });
  }
  return cleanContent(output);
}
