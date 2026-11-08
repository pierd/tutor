import { useState } from "react";
import { useAction, useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useTranslation } from "react-i18next";
import { Mic, Square, Volume2 } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { DEFAULT_STT_MODEL, STT_MODELS, ttsVoicesFor } from "../../convex/lib/voices";
import { uploadRecording } from "./upload";
import { useRecorder } from "./useRecorder";
import { diffWords } from "./wordDiff";

const SAMPLES: Record<string, string> = {
  fr: "Hier, je suis allé au marché et j'ai acheté des pommes.",
  es: "Ayer fui al mercado y compré unas manzanas.",
  it: "Ieri sono andato al mercato e ho comprato delle mele.",
  de: "Gestern bin ich auf den Markt gegangen und habe Äpfel gekauft.",
  pt: "Ontem fui ao mercado e comprei maçãs.",
  pl: "Wczoraj poszedłem na targ i kupiłem jabłka.",
  en: "Yesterday I went to the market and bought some apples.",
  ja: "昨日、市場に行ってりんごを買いました。",
};

type Result = FunctionReturnType<typeof api.voiceLab.transcribe>[number];

const buttonClass =
  "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50";

// Admin tool: compare speech models on a real voice.
export function VoiceLab({ profile }: { profile: Doc<"profiles"> }) {
  const { t } = useTranslation();
  const lang = profile.targetLang;
  const voices = ttsVoicesFor(lang);
  const [reference, setReference] = useState(SAMPLES[lang] ?? "");
  const [voiceIndex, setVoiceIndex] = useState(0);
  const [models, setModels] = useState<string[]>([DEFAULT_STT_MODEL]);
  const [languageHint, setLanguageHint] = useState(true);
  const [results, setResults] = useState<Result[] | null>(null);
  const [busy, setBusy] = useState<"tts" | "stt" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ttsInfo, setTtsInfo] = useState<string | null>(null);

  const recorder = useRecorder();
  const generateUploadUrl = useMutation(api.recordings.generateUploadUrl);
  const saveRecording = useMutation(api.recordings.save);
  const deleteRecording = useMutation(api.recordings.remove);
  const transcribe = useAction(api.voiceLab.transcribe);
  const speak = useAction(api.voiceLab.speak);

  async function run<T>(kind: "tts" | "stt", fn: () => Promise<T>) {
    setBusy(kind);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const hear = () =>
    run("tts", async () => {
      const voice = voices[voiceIndex];
      const { url, ms } = await speak({ text: reference, model: voice.model, voice: voice.voice });
      setTtsInfo(`${voice.label} · ${ms} ms`);
      await new Audio(url).play();
    });

  const compare = () =>
    run("stt", async () => {
      if (!recorder.recording) return;
      const recordingId = await uploadRecording(recorder.recording.blob, generateUploadUrl, saveRecording);
      try {
        setResults(await transcribe({ recordingId, models, language: languageHint ? lang : undefined }));
      } finally {
        await deleteRecording({ recordingId });
      }
    });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t("lab.title")}</h1>
        <p className="mt-1 text-sm text-gray-500">{t("lab.intro")}</p>
      </div>

      <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-5">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">{t("lab.reference")}</span>
          <textarea
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base text-gray-900 outline-none focus:border-gray-900"
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={voiceIndex}
            onChange={(e) => setVoiceIndex(Number(e.target.value))}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700"
          >
            {voices.map((voice, i) => (
              <option key={`${voice.model}:${voice.voice}`} value={i}>
                {voice.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => void hear()}
            disabled={busy !== null || reference.trim() === ""}
            className={`${buttonClass} border border-gray-300 bg-white text-gray-700 hover:bg-gray-100`}
          >
            <Volume2 size={16} /> {t("lab.hear")}
          </button>
          {ttsInfo && <span className="text-xs text-gray-500">{ttsInfo}</span>}
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
        <p className="text-sm text-gray-600">{t("lab.recordHint")}</p>
        <div className="flex flex-wrap items-center gap-3">
          {recorder.isRecording ? (
            <button onClick={recorder.stop} className={`${buttonClass} bg-red-600 text-white hover:bg-red-700`}>
              <Square size={16} /> {t("lab.stop")}
            </button>
          ) : (
            <button
              onClick={() => void recorder.start()}
              disabled={busy !== null}
              className={`${buttonClass} bg-gray-900 text-white hover:bg-gray-800`}
            >
              <Mic size={16} /> {recorder.recording ? t("lab.recordAgain") : t("lab.record")}
            </button>
          )}
          {recorder.recording && <audio controls src={recorder.recording.url} className="h-10" />}
        </div>
        {recorder.error && <p className="text-sm text-red-600">{recorder.error}</p>}

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-gray-700">{t("lab.models")}</legend>
          <div className="grid gap-1 sm:grid-cols-2">
            {STT_MODELS.map((model) => (
              <label key={model} className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={models.includes(model)}
                  onChange={(e) =>
                    setModels(e.target.checked ? [...models, model] : models.filter((m) => m !== model))
                  }
                />
                <code className="text-xs">{model}</code>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={languageHint} onChange={(e) => setLanguageHint(e.target.checked)} />
          {t("lab.languageHint", { lang })}
        </label>
        <button
          onClick={() => void compare()}
          disabled={!recorder.recording || models.length === 0 || busy !== null}
          className={`${buttonClass} bg-gray-900 text-white hover:bg-gray-800`}
        >
          {busy === "stt" ? t("lab.transcribing") : t("lab.compare")}
        </button>
      </section>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {results && (
        <section className="rounded-xl border border-gray-200 bg-white">
          <ul className="divide-y divide-gray-100">
            {results.map((result) => (
              <li key={result.model} className="space-y-1 px-5 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <code className="text-xs text-gray-500">{result.model}</code>
                  <span className="text-xs text-gray-400">
                    {result.ms} ms
                    {result.ok && result.costUsd !== null && <> · ${result.costUsd.toFixed(5)}</>}
                  </span>
                </div>
                {result.ok ? (
                  <p className="text-base">
                    {reference.trim()
                      ? diffWords(reference, result.text).map((token, i) => (
                          <span
                            key={i}
                            className={token.match ? "text-gray-900" : "rounded bg-amber-100 px-0.5 text-amber-900"}
                          >
                            {token.word}{" "}
                          </span>
                        ))
                      : result.text}
                  </p>
                ) : (
                  <p className="text-sm text-red-600">{result.error}</p>
                )}
              </li>
            ))}
          </ul>
          <p className="border-t border-gray-100 px-5 py-3 text-xs text-gray-500">{t("lab.diffLegend")}</p>
        </section>
      )}
    </div>
  );
}
