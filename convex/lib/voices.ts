// Speech model candidates, shared by backend and frontend. Verified against
// the AI Gateway on 2026-11-08 (see docs/voice.md). Voice names are
// model-specific; a wrong one fails with "Unknown voice".

// Used by lessons. Chosen 2026-11-08 after Voice lab tests on the owner's French.
export const DEFAULT_STT_MODEL = "openai/gpt-4o-mini-transcribe";

export const STT_MODELS = [
  "openai/whisper-large-v3-turbo",
  "openai/gpt-4o-transcribe",
  "openai/gpt-4o-mini-transcribe",
  "deepgram/nova-3",
  "elevenlabs/scribe-v2",
  "mistralai/voxtral-mini-transcribe",
];

export type TtsVoice = { model: string; voice: string; label: string };

const ELEVEN_MULTI = "elevenlabs/eleven-multilingual-v2";
const GEMINI = "google/gemini-3.8-flash-tts";

// Per target language, best first. ElevenLabs and Gemini voices are multilingual.
export const TTS_VOICES: Record<string, TtsVoice[]> = {
  en: [
    { model: "deepgram/aura-2", voice: "aura-2-thalia-en", label: "Deepgram · Thalia" },
    { model: "hexgrad/kokoro-82m", voice: "af_heart", label: "Kokoro · Heart" },
  ],
  es: [
    { model: "deepgram/aura-2", voice: "aura-2-celeste-es", label: "Deepgram · Celeste" },
    { model: "deepgram/aura-2", voice: "aura-2-javier-es", label: "Deepgram · Javier" },
    { model: "hexgrad/kokoro-82m", voice: "ef_dora", label: "Kokoro · Dora" },
  ],
  fr: [
    { model: "deepgram/aura-2", voice: "aura-2-agathe-fr", label: "Deepgram · Agathe" },
    { model: "deepgram/aura-2", voice: "aura-2-hector-fr", label: "Deepgram · Hector" },
    { model: "hexgrad/kokoro-82m", voice: "ff_siwis", label: "Kokoro · Siwis" },
  ],
  it: [
    { model: "deepgram/aura-2", voice: "aura-2-livia-it", label: "Deepgram · Livia" },
    { model: "deepgram/aura-2", voice: "aura-2-cesare-it", label: "Deepgram · Cesare" },
    { model: "hexgrad/kokoro-82m", voice: "if_sara", label: "Kokoro · Sara" },
  ],
  de: [
    { model: "deepgram/aura-2", voice: "aura-2-viktoria-de", label: "Deepgram · Viktoria" },
    { model: "deepgram/aura-2", voice: "aura-2-julius-de", label: "Deepgram · Julius" },
  ],
  pt: [{ model: "hexgrad/kokoro-82m", voice: "pf_dora", label: "Kokoro · Dora" }],
  pl: [],
  ja: [
    { model: "deepgram/aura-2", voice: "aura-2-izanami-ja", label: "Deepgram · Izanami" },
    { model: "hexgrad/kokoro-82m", voice: "jf_alpha", label: "Kokoro · Alpha" },
  ],
};

const MULTILINGUAL: TtsVoice[] = [
  { model: GEMINI, voice: "Kore", label: "Gemini · Kore" },
  { model: GEMINI, voice: "Puck", label: "Gemini · Puck" },
  { model: ELEVEN_MULTI, voice: "21m00Tcm4TlvDq8ikWAM", label: "ElevenLabs · Rachel" },
];

export function ttsVoicesFor(lang: string): TtsVoice[] {
  return [...(TTS_VOICES[lang] ?? []), ...MULTILINGUAL];
}
