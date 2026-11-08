# Voice (speech-to-text and text-to-speech)

All voice calls go through `convex/ai/voice.ts`, which calls the Convex AI
Gateway HTTP API directly (`/v1/audio/transcriptions`, `/v1/audio/speech`)
with `getServiceToken("ai-gateway")`. The gateway's voice API is **alpha**, so
keep request/response handling in that one file. Model and voice candidates
live in `convex/lib/voices.ts` (plain data, imported by the frontend too).

The admin-only **Voice lab** tab (`src/voice/VoiceLab.tsx`, backend `convex/voiceLab.ts`)
lets you record yourself and compare transcription models side by side, and
try TTS voices. `voiceLab:smokeTest` (internal) checks the gateway without a
microphone:

```sh
npx convex run voiceLab:smokeTest '{"text":"Je voudrais un café.","language":"fr"}'
```

## Findings (2026-11-08)

Speech-to-text, all working via the gateway (≈0.5–1.5 s per short sentence,
≈$0.00001–0.0003 each): `openai/whisper-large-v3-turbo`,
`openai/gpt-4o-transcribe`, `openai/gpt-4o-mini-transcribe`, `deepgram/nova-3`
(fastest), `elevenlabs/scribe-v2`, `mistralai/voxtral-mini-transcribe`.

- Request body is JSON with base64 audio; `webm`, `m4a`, `mp3`, `ogg`, `wav`
  are accepted, so browser `MediaRecorder` output works as-is.
- `language` hint is supported. There is **no `prompt` field** — good: we must
  never pass the expected sentence, models would bias toward it.
- `response_format: "verbose_json"` + `timestamp_granularities: ["word"]`
  gives word timestamps for whisper, deepgram, scribe and voxtral.
- **No per-word confidence**: the gateway normalizes every provider to the
  OpenAI shape and drops Deepgram's confidences. Pronunciation feedback can't
  rely on it; use minimal pairs and learner-judged shadowing instead.
- Homophones are resolved by guessing: TTS "je suis allé" (female voice) came
  back as "allée" from 3 of 6 models. Graders must treat inaudible
  differences (gender/number agreement, -er/-é/-ez, parle/parles/parlent) as
  unknowable from audio.
- Models don't fully "normalize" speech: a Portuguese voice reading
  "Je voudrais" was transcribed as "J'voudrais".

Text-to-speech:

| Model | Notes |
|---|---|
| `deepgram/aura-2` | Fast (<1 s). Voice names `aura-2-<name>-<lang>`; has en, es, fr, it, de, nl, ja — **no pl, no pt**. An unknown voice error lists all voices. |
| `hexgrad/kokoro-82m` | Voices like `ff_siwis` (fr), `ef_dora` (es), `if_sara` (it), `pf_dora` (pt), `jf_alpha` (ja), `af_heart` (en). No pl/de. |
| `google/gemini-3.8-flash-tts` | Multilingual (good Polish), voices like `Kore`, `Puck`. **Returns only PCM** (24 kHz, 16-bit mono) — `speak()` wraps it into WAV. ~2 s. |
| `elevenlabs/eleven-multilingual-v2` | Multilingual; `voice` must be a voice **ID** (e.g. `21m00Tcm4TlvDq8ikWAM`), names fail. |
| `mistralai/voxtral-mini-tts-3-0` | Returned provider 404 — not usable yet. |

TTS output has no cost field; spend shows on the Convex team usage page.

Default STT model for lessons: `DEFAULT_STT_MODEL` =
`openai/gpt-4o-mini-transcribe` (owner's choice after Voice lab tests on their
French, 2026-11-08).

## Open

- Re-check the default per target language as more languages get used.
- Cache lesson TTS audio in storage keyed by (text, model, voice).
