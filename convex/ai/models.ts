// LLMs used by lessons, called through the Convex AI Gateway (provider/model).
// See https://docs.convex.dev/ai-gateway/models.md for what's available.

// Writes exercise sentences: needs to be fast and follow constraints.
export const GENERATE_MODEL = "anthropic/claude-haiku-5.5";

// Grades answers: linguistic judgement matters more than speed.
export const GRADE_MODEL = "anthropic/claude-sonnet-5.5";

// Reading illustrations (alpha image API; see docs/voice.md for the gateway).
export const IMAGE_MODEL = "openai/gpt-image-1-mini";

// Coach chat and lesson building: proposes curriculum and writes cards.
export const COACH_MODEL = "anthropic/claude-sonnet-5.5";
