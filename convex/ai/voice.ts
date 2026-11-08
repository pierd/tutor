import { getServiceToken } from "convex/server";

// All speech-to-text and text-to-speech calls go through this module. The
// gateway's voice API is alpha, so keep its request/response shapes here.
// Docs: https://docs.convex.dev/ai-gateway/api.md

const GATEWAY = "https://ai-gateway.convex.dev/v1";

// The gateway names audio formats by extension.
const AUDIO_FORMATS: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/aac": "aac",
  "audio/flac": "flac",
};

export function audioFormat(mediaType: string) {
  const format = AUDIO_FORMATS[mediaType.split(";")[0].trim().toLowerCase()];
  if (!format) throw new Error(`Unsupported audio type: ${mediaType}`);
  return format;
}

function base64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export type TranscriptWord = { word: string; start?: number; end?: number; confidence?: number };

export type Transcript = {
  text: string;
  words: TranscriptWord[] | null;
  costUsd: number | null;
  // Truncated raw gateway response, for debugging provider-specific fields.
  rawJson: string;
};

async function gatewayError(response: Response) {
  const body = await response.text();
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    return new Error(parsed.error?.message ?? `Gateway error ${response.status}`);
  } catch {
    return new Error(`Gateway error ${response.status}: ${body.slice(0, 200)}`);
  }
}

function parseWords(raw: unknown): TranscriptWord[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.flatMap((w: Record<string, unknown>) => {
    const word = w.word ?? w.text ?? w.punctuated_word;
    if (typeof word !== "string") return [];
    return [
      {
        word,
        start: typeof w.start === "number" ? w.start : undefined,
        end: typeof w.end === "number" ? w.end : undefined,
        confidence: typeof w.confidence === "number" ? w.confidence : undefined,
      },
    ];
  });
}

// `language` is a hint (ISO 639-1). Never pass the expected sentence: models
// bias toward it and would hide the learner's actual mistakes.
export async function transcribe(
  audio: ArrayBuffer,
  mediaType: string,
  options: { model: string; language?: string },
): Promise<Transcript> {
  const base = {
    model: options.model,
    input_audio: { data: base64(new Uint8Array(audio)), format: audioFormat(mediaType) },
    ...(options.language && { language: options.language }),
  };
  // Ask for word-level detail first; models without verbose_json answer 400.
  const attempts = [
    { ...base, response_format: "verbose_json", timestamp_granularities: ["word"] },
    base,
  ];
  let lastError: Error | null = null;
  for (const body of attempts) {
    const response = await fetch(`${GATEWAY}/audio/transcriptions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await getServiceToken("ai-gateway")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      lastError = await gatewayError(response);
      if (response.status === 400) continue;
      throw lastError;
    }
    const json = (await response.json()) as {
      text?: unknown;
      words?: unknown;
      usage?: { cost?: unknown };
    };
    if (typeof json.text !== "string") throw new Error("Transcription returned no text");
    return {
      text: json.text.trim(),
      words: parseWords(json.words),
      costUsd: typeof json.usage?.cost === "number" ? json.usage.cost : null,
      rawJson: JSON.stringify(json).slice(0, 4000),
    };
  }
  throw lastError ?? new Error("Transcription failed");
}

// Models that only return raw PCM (16-bit little-endian mono), by sample rate.
const PCM_ONLY_MODELS: Record<string, number> = {
  "google/gemini-3.8-flash-tts": 24000,
  "google/gemini-3.8-flash-lite-tts": 24000,
  "google/gemini-3.1-flash-tts-preview": 24000,
};

function pcmToWav(pcm: ArrayBuffer, sampleRate: number) {
  const header = new DataView(new ArrayBuffer(44));
  const ascii = (offset: number, s: string) =>
    [...s].forEach((c, i) => header.setUint8(offset + i, c.charCodeAt(0)));
  ascii(0, "RIFF");
  header.setUint32(4, 36 + pcm.byteLength, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  header.setUint32(16, 16, true); // fmt chunk size
  header.setUint16(20, 1, true); // PCM
  header.setUint16(22, 1, true); // mono
  header.setUint32(24, sampleRate, true);
  header.setUint32(28, sampleRate * 2, true); // byte rate
  header.setUint16(32, 2, true); // block align
  header.setUint16(34, 16, true); // bits per sample
  ascii(36, "data");
  header.setUint32(40, pcm.byteLength, true);
  return new Blob([header.buffer, pcm], { type: "audio/wav" });
}

// Returns playable audio: MP3, or WAV for PCM-only models.
export async function speak(text: string, options: { model: string; voice: string; speed?: number }) {
  const pcmRate = PCM_ONLY_MODELS[options.model];
  const response = await fetch(`${GATEWAY}/audio/speech`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await getServiceToken("ai-gateway")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: options.model,
      input: text,
      voice: options.voice,
      response_format: pcmRate ? "pcm" : "mp3",
      ...(options.speed !== undefined && { speed: options.speed }),
    }),
  });
  if (!response.ok) throw await gatewayError(response);
  const audio = await response.arrayBuffer();
  return pcmRate ? pcmToWav(audio, pcmRate) : new Blob([audio], { type: "audio/mpeg" });
}
