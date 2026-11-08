import { generateText, Output } from "ai";
import { convexGateway } from "@convex-dev/ai-sdk-provider";
import { z } from "zod";
import { GENERATE_MODEL, GRADE_MODEL } from "./models";
import { captureAiGeneration, type AiContext } from "../lib/posthogAi";

// LLM side of the translation challenge. Pure functions (no ctx) so they can
// be exercised from a smoke test.

export function languageLabel(code: string) {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

type ItemRef = { key: string; kind: string; text: string; gloss?: string };

export type GenerationInput = {
  baseLang: string;
  targetLang: string;
  goal?: string;
  targets: ItemRef[];
  known: string[];
  recentPrompts: string[];
  allowNewItem: boolean;
};

const generatedSchema = z.object({
  prompt: z.string().describe("The sentence in the learner's base language that they will translate."),
  answers: z
    .array(z.string())
    .min(1)
    .max(4)
    .describe("Natural, correct translations into the target language, most natural first."),
  hint: z
    .string()
    .optional()
    .describe("Optional short hint in the base language, e.g. which tense to use. No giveaways."),
  itemKeys: z.array(z.string()).describe("Keys of the target items the sentence actually exercises."),
  newItem: z
    .object({
      kind: z.enum(["lemma", "chunk", "grammar"]),
      key: z.string().describe("Lemma (dictionary form, lowercase) or a short stable id for grammar."),
      text: z.string().describe("Display form in the target language."),
      gloss: z.string().describe("Meaning in the base language."),
    })
    .optional()
    .describe("The one new word, phrase or grammar point introduced by this sentence, if any."),
});

export type Generated = z.infer<typeof generatedSchema>;

export async function generateExercise(input: GenerationInput, context?: AiContext): Promise<Generated> {
  const base = languageLabel(input.baseLang);
  const target = languageLabel(input.targetLang);
  const targetsText = input.targets.length
    ? input.targets.map((t) => `- key "${t.key}" (${t.kind}): ${t.text}${t.gloss ? ` — ${t.gloss}` : ""}`).join("\n")
    : "(none)";
  const started = Date.now();
  const { output, usage } = await generateText({
    model: convexGateway(GENERATE_MODEL),
    output: Output.object({ schema: generatedSchema }),
    system: `You are a patient language tutor. The learner speaks ${base} and is learning ${target}.
You write ONE short sentence in ${base} for the learner to translate into ${target} (they will usually say it out loud).

Rules:
- The sentence must exercise every target item listed. Use the items in a natural context.
- Every other word must come from the learner's known vocabulary or be a very basic, high-frequency word. Keep it at the learner's level: few known items means short, simple sentences.
- ${input.allowNewItem ? `You MAY introduce exactly one new word, set phrase or grammar point that is a sensible next step for this learner${input.goal ? " and their goal" : ""}; report it in newItem. If there are no target items you MUST introduce one.` : "Do NOT introduce new vocabulary or grammar. Leave newItem empty."}
- The ${base} sentence must be natural and unambiguous enough that the accepted ${target} answers are clearly right. List the common correct variants (e.g. word order, tu/vous only if the ${base} makes it ambiguous).
- Vary topics and structures; don't repeat the recent sentences.
- hint (optional): written in ${base}, short, no giveaways.
- itemKeys: only keys from the target list.`,
    prompt: `Target items to practise:
${targetsText}

Learner's known vocabulary (sample): ${input.known.length ? input.known.join(", ") : "(nothing yet — complete beginner)"}
${input.goal ? `Learner's goal: ${input.goal}\n` : ""}Recent sentences (avoid repeating): ${input.recentPrompts.length ? input.recentPrompts.map((p) => `"${p}"`).join("; ") : "(none)"}`,
  });
  if (context) {
    captureAiGeneration({
      context,
      model: GENERATE_MODEL,
      input: [{ role: "user", content: JSON.stringify(input) }],
      output: [{ role: "assistant", content: JSON.stringify(output) }],
      latencyMs: Date.now() - started,
      usage,
    });
  }
  return output;
}

export type GradingInput = {
  baseLang: string;
  targetLang: string;
  prompt: string;
  answers: string[];
  items: ItemRef[];
  mode: "speech" | "text";
  answer: string;
};

const gradedSchema = z.object({
  verdict: z
    .enum(["correct", "almost", "incorrect"])
    .describe("correct = fully acceptable; almost = understandable with minor errors; incorrect = wrong meaning or major errors."),
  corrected: z
    .string()
    .describe("The learner's answer with the minimum changes needed to be correct (or the best accepted answer if it was unusable)."),
  feedback: z.string().describe("One or two short, specific, encouraging sentences in the learner's base language."),
  items: z.array(
    z.object({
      key: z.string(),
      outcome: z.enum(["correct", "incorrect", "inaudible"]),
      note: z.string().optional().describe("Short explanation in the base language, only if useful."),
    }),
  ),
  mistakes: z
    .array(
      z.object({
        pattern: z
          .string()
          .describe("Stable kebab-case tag for the error type, e.g. aux:avoir-for-etre, gender:article, agreement:adjective, word-order:adverb, vocab:false-friend."),
        description: z.string().describe("Short description in the base language."),
      }),
    )
    .describe("Real errors only; empty if the answer is correct."),
  needsTypedCheck: z
    .boolean()
    .describe("Speech only: true if an item's correctness depends on spelling that can't be heard."),
});

export type Graded = z.infer<typeof gradedSchema>;

export async function gradeAnswer(input: GradingInput, context?: AiContext): Promise<Graded> {
  const base = languageLabel(input.baseLang);
  const target = languageLabel(input.targetLang);
  const speechRules = `The answer was SPOKEN and then transcribed by a speech-to-text model. Therefore:
- Ignore punctuation, capitalisation, accents and spelling as such.
- Never penalise differences that sound identical in ${target} (homophones, silent endings such as gender/number agreement or verb endings that are pronounced the same). If an item's correctness depends only on such an inaudible difference, mark it "inaudible" and set needsTypedCheck to true.
- The transcriber may have guessed between homophones; judge only what is audible in the transcript.
- Contracted or informal spoken forms that are correct in speech are fine.`;
  const textRules = `The answer was TYPED. Spelling and accents count: a missing or wrong accent or a small typo makes the verdict at most "almost" (mention it), unless it changes the word. needsTypedCheck must be false.`;
  const started = Date.now();
  const { output, usage } = await generateText({
    model: convexGateway(GRADE_MODEL),
    output: Output.object({ schema: gradedSchema }),
    system: `You grade a language learner's translation from ${base} into ${target}. Be fair and precise, not pedantic: any natural, correct translation of the meaning is acceptable even if it isn't in the reference list.
${input.mode === "speech" ? speechRules : textRules}
Give an outcome for every listed item key: "correct" if the learner used it correctly, "incorrect" if they got it wrong or avoided it, "inaudible" (speech only) as described above.
Write feedback, notes and mistake descriptions in ${base}.`,
    prompt: `Sentence to translate (${base}): "${input.prompt}"
Reference answers (${target}): ${input.answers.map((a) => `"${a}"`).join(" | ")}
Items being practised:
${input.items.map((i) => `- key "${i.key}": ${i.text}${i.gloss ? ` (${i.gloss})` : ""}`).join("\n") || "(none)"}

Learner's answer (${input.mode}): "${input.answer}"`,
  });
  if (context) {
    captureAiGeneration({
      context,
      model: GRADE_MODEL,
      input: [{ role: "user", content: JSON.stringify(input) }],
      output: [{ role: "assistant", content: JSON.stringify(output) }],
      latencyMs: Date.now() - started,
      usage,
    });
  }
  return output;
}
