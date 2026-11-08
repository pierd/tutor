// LLMs used by lessons, called through the Convex AI Gateway (provider/model).
// See https://docs.convex.dev/ai-gateway/models.md for what's available.

// Writes exercise sentences: needs to be fast and follow constraints.
export const GENERATE_MODEL = "anthropic/claude-haiku-5.5";

// Grades answers: linguistic judgement matters more than speed.
export const GRADE_MODEL = "anthropic/claude-sonnet-5.5";
