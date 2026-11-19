import { generateText, Output } from "ai";
import { convexGateway } from "@convex-dev/ai-sdk-provider";
import { z } from "zod";
import { COACH_MODEL } from "./models";
import { languageLabel } from "./translationAi";
import { captureAiGeneration, type AiContext } from "../lib/posthogAi";

// Study material: details for items (forms, conjugation, examples) and
// readable notes for a lesson. Written in the learner's base language.

const tableSchema = z.object({
  title: z.string().optional().describe("E.g. the tense name, in the target language."),
  header: z.array(z.string()).optional(),
  rows: z.array(z.array(z.string())).describe("Rows of cells, e.g. [pronoun, form]."),
});

const exampleSchema = z.object({
  text: z.string().describe("Short natural sentence in the target language."),
  translation: z.string().describe("Its translation in the base language."),
});

const itemDetailsSchema = z.object({
  key: z.string().describe("The item's key, exactly as given."),
  explanation: z.string().optional().describe("1–3 sentences in the base language: meaning, usage, pitfalls."),
  facts: z
    .array(z.object({ label: z.string(), value: z.string() }))
    .optional()
    .describe("Short labelled facts, labels in the base language: part of speech, gender, plural, register, auxiliary…"),
  tables: z.array(tableSchema).optional(),
  examples: z.array(exampleSchema).max(3).optional(),
});

const guideSchema = z.object({
  sections: z
    .array(
      z.object({
        heading: z.string(),
        body: z.string().describe("Explanation in the base language; paragraphs separated by blank lines."),
        tables: z.array(tableSchema).optional(),
        examples: z.array(exampleSchema).max(4).optional(),
      }),
    )
    .min(1)
    .max(6),
});

export type ItemDetails = Omit<z.infer<typeof itemDetailsSchema>, "key">;
export type LessonGuide = z.infer<typeof guideSchema>;

type StudyItem = { kind: string; key: string; text: string; gloss?: string; notes?: string };

function itemLines(items: StudyItem[]) {
  return items
    .map((i) => `- [${i.kind}] key="${i.key}" text="${i.text}"${i.gloss ? ` gloss="${i.gloss}"` : ""}${i.notes ? ` notes="${i.notes}"` : ""}`)
    .join("\n");
}

async function generate<T>(
  schema: z.ZodType<T>,
  system: string,
  prompt: string,
  context?: AiContext,
): Promise<T> {
  const started = Date.now();
  const { output, usage } = await generateText({
    model: convexGateway(COACH_MODEL),
    output: Output.object({ schema }),
    system,
    prompt,
  });
  if (context) {
    await captureAiGeneration({
      context,
      model: COACH_MODEL,
      input: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      output: [{ role: "assistant", content: JSON.stringify(output) }],
      latencyMs: Date.now() - started,
      usage,
    });
  }
  return output;
}

export async function writeItemDetails(
  input: { baseLang: string; targetLang: string; lessonTitle?: string; items: StudyItem[] },
  context?: AiContext,
) {
  const base = languageLabel(input.baseLang);
  const target = languageLabel(input.targetLang);
  const system = `You write reference notes for items in a language-learning app. The learner speaks ${base} and learns ${target}. Write explanations, labels and translations in ${base}; forms and examples in ${target}.
For each item give what a learner needs to actually use it:
- Verbs (lemma): conjugation tables, one per tense, rows = [subject pronoun, form]. Cover the present plus the most useful past and future forms for ${target} (e.g. for French: présent, passé composé, imparfait, futur simple). Facts: auxiliary, irregularity, participle where relevant.
- Nouns/adjectives (lemma): facts for gender, plural, feminine/other forms, article; a small table only if there are many forms (e.g. case declension).
- Other words: what they combine with, word order, common collocations.
- Phrases (chunk): literal meaning, when to use it, register.
- Grammar: explanation of the rule, a table of the forms, typical mistakes.
- Characters (glyph): pronunciation and words that use them.
Add 1–3 short examples. Be accurate and concise; omit fields that don't apply. Return one entry per item, with its key copied exactly.`;
  const prompt = `${input.lessonTitle ? `Lesson: ${input.lessonTitle}\n` : ""}Items:\n${itemLines(input.items)}`;
  const output = await generate(z.object({ items: z.array(itemDetailsSchema) }), system, prompt, context);
  return output.items;
}

export async function writeLessonGuide(
  input: {
    baseLang: string;
    targetLang: string;
    unitTitle: string;
    title: string;
    description?: string;
    items: StudyItem[];
  },
  context?: AiContext,
) {
  const base = languageLabel(input.baseLang);
  const target = languageLabel(input.targetLang);
  const system = `You write the study notes for one lesson in a language-learning app: a short read-through that teaches the lesson before the learner practises. The learner speaks ${base} and learns ${target}. Write in ${base}; forms and examples in ${target}.
- 2–5 sections with clear headings. Explain the patterns and grammar the lesson's items share, how the words are used together, and common pitfalls.
- Use tables for paradigms (conjugations, articles, endings) and short examples with translations.
- Don't just list the vocabulary: the learner sees each item's own details separately.`;
  const prompt = `Unit: ${input.unitTitle}
Lesson: ${input.title}${input.description ? `\nDescription: ${input.description}` : ""}
Items:
${itemLines(input.items)}`;
  return await generate(guideSchema, system, prompt, context);
}
