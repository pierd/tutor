import { generateImage, generateText, Output } from "ai";
import { convexGateway } from "@convex-dev/ai-sdk-provider";
import { z } from "zod";
import { COACH_MODEL, IMAGE_MODEL } from "./models";
import { languageLabel } from "./translationAi";
import { captureAiGeneration, type AiContext } from "../lib/posthogAi";

// Writes a short reading text with glossary and comprehension questions.

const readingSchema = z.object({
  title: z.string().describe("Short title in the target language."),
  text: z.string().describe("The reading text in the target language, plain paragraphs separated by blank lines."),
  glossary: z
    .array(
      z.object({
        surface: z.string().describe("A word or fixed expression exactly as it appears in the text (lowercase)."),
        gloss: z.string().describe("Meaning in context, in the base language; mention the dictionary form if different."),
        itemKey: z.string().optional().describe("Key of the tracked item this form belongs to, if any."),
      }),
    )
    .describe("Cover every content word and expression in the text; skip only trivial function words."),
  questions: z
    .array(
      z.object({
        kind: z.enum(["truefalse", "choice"]),
        question: z.string().describe("In the base language."),
        options: z
          .array(z.string())
          .describe('truefalse: exactly ["true","false"]. choice: 3–4 options in the base language.'),
        answerIndex: z.number().int().describe("Index of the correct option."),
        explanation: z.string().describe("One short sentence in the base language pointing to the text."),
        itemKeys: z.array(z.string()).describe("Tracked item keys this question depends on (may be empty)."),
      }),
    )
    .min(3)
    .max(6),
  illustrations: z
    .array(
      z.object({
        paragraph: z.number().int().describe("0-based index of the paragraph the picture belongs to."),
        prompt: z
          .string()
          .describe("English description of a scene for an illustrator: characters, setting, mood. No text or letters in the image."),
      }),
    )
    .max(3)
    .optional(),
});

export type Reading = z.infer<typeof readingSchema>;

export async function generateReading(input: {
  baseLang: string;
  targetLang: string;
  goal?: string;
  lessonTitle?: string;
  targets: { key: string; text: string; gloss?: string }[];
  known: string[];
  avoidTitles: string[];
  withImages?: boolean;
}, context?: AiContext): Promise<Reading> {
  const base = languageLabel(input.baseLang);
  const target = languageLabel(input.targetLang);
  const started = Date.now();
  const { output, usage } = await generateText({
    model: convexGateway(COACH_MODEL),
    output: Output.object({ schema: readingSchema }),
    system: `You write graded reading practice for a learner who speaks ${base} and learns ${target}.
- Write a short, natural, coherent text in ${target} (a mini story, dialogue, note or article) that uses as many of the target items as fit naturally.
- Other vocabulary: the learner's known words or very common basic words. Match their level: with few known words write 40–80 very simple words; otherwise 80–160 words.
- Glossary: list each content word/expression as it appears in the text (lowercase), with its meaning in ${base}. Use itemKey when the form belongs to a target item.
- 3–6 questions in ${base}, mixing true/false and multiple choice, answerable only from the text, testing understanding of the target items where possible.
${input.withImages ? "- illustrations: 1–3 scenes that help understand the story (one per paragraph at most). Pictures must not reveal answers to the questions and must contain no text." : "- illustrations: leave empty."}`,
    prompt: `${input.lessonTitle ? `Lesson: ${input.lessonTitle}\n` : ""}Target items:
${input.targets.map((t) => `- key "${t.key}": ${t.text}${t.gloss ? ` (${t.gloss})` : ""}`).join("\n") || "(none — use simple everyday topics)"}
Known words (sample): ${input.known.join(", ") || "(beginner)"}
${input.goal ? `Learner's goal: ${input.goal}\n` : ""}Avoid repeating these earlier texts: ${input.avoidTitles.join("; ") || "(none)"}`,
  });
  if (context) {
    captureAiGeneration({
      context,
      model: COACH_MODEL,
      input: [{ role: "user", content: JSON.stringify(input) }],
      output: [{ role: "assistant", content: JSON.stringify(output) }],
      latencyMs: Date.now() - started,
      usage,
    });
  }
  return {
    ...output,
    glossary: output.glossary.map((g) => ({ ...g, surface: g.surface.trim().toLowerCase() })),
    illustrations: input.withImages ? (output.illustrations ?? []).slice(0, 3) : [],
    questions: output.questions
      .map((q) => (q.kind === "truefalse" ? { ...q, options: ["true", "false"] } : q))
      .filter((q) => q.answerIndex >= 0 && q.answerIndex < q.options.length),
  };
}

// One illustration in a consistent, friendly style. Returns a PNG/JPEG blob.
export async function drawIllustration(prompt: string, context?: AiContext) {
  const started = Date.now();
  const { image } = await generateImage({
    model: convexGateway.imageModel(IMAGE_MODEL),
    prompt: `Warm, simple storybook illustration, soft colours, no text, no letters, no captions. ${prompt}`,
    size: "1024x1024",
  });
  if (context) {
    captureAiGeneration({
      context,
      model: IMAGE_MODEL,
      input: [{ role: "user", content: prompt }],
      output: [{ role: "assistant", content: "Image generated" }],
      latencyMs: Date.now() - started,
    });
  }
  return new Blob([image.uint8Array as Uint8Array<ArrayBuffer>], { type: image.mediaType });
}
