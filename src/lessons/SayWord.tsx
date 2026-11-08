import { useEffect, useRef, useState } from "react";
import { useAction, useMutation } from "convex/react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Loader2, Mic, Square, XCircle } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { uploadRecording } from "../voice/upload";
import { useRecorder } from "../voice/useRecorder";
import { CardPrompt, ListenButton, RoundSummary } from "./deck";
import { useDeck, type DeckCard } from "./useDeck";

// Say the word (or the filled-in phrase) out loud. One transcription per
// answer, checked locally; the learner can overrule a mis-hearing.
export function SayWord({ profileId, lessonId }: { profileId: Id<"profiles">; lessonId?: Id<"lessons"> }) {
  const { t } = useTranslation();
  const { cards, newRound } = useDeck(profileId, lessonId);
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const answerCard = useMutation(api.practice.answerCard);

  if (cards === null) return null;
  if (cards.length === 0) return <p className="text-sm text-gray-500">{t("cards.empty")}</p>;
  if (index >= cards.length) {
    return (
      <RoundSummary
        correct={score}
        total={cards.length}
        onAgain={() => {
          setIndex(0);
          setScore(0);
          newRound();
        }}
      />
    );
  }
  const card = cards[index];
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">
        {index + 1} / {cards.length}
      </p>
      <SayItem
        key={card._id}
        card={card}
        onDone={(correct, given) => {
          if (correct) setScore((s) => s + 1);
          void answerCard({ cardId: card._id, correct, mode: "spoken", given });
          setIndex((i) => i + 1);
        }}
      />
    </div>
  );
}

type Check = { transcript: string; expected: string; correct: boolean };

function SayItem({ card, onDone }: { card: DeckCard; onDone: (correct: boolean, given: string) => void }) {
  const { t } = useTranslation();
  const recorder = useRecorder();
  const [check, setCheck] = useState<Check | null>(null);
  const [overruled, setOverruled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitted = useRef<Blob | null>(null);
  const generateUploadUrl = useMutation(api.recordings.generateUploadUrl);
  const saveRecording = useMutation(api.recordings.save);
  const checkSpoken = useAction(api.practice.checkSpoken);

  useEffect(() => {
    const blob = recorder.recording?.blob;
    if (!blob || submitted.current === blob) return;
    submitted.current = blob;
    setBusy(true);
    setError(null);
    void uploadRecording(blob, generateUploadUrl, saveRecording)
      .then((recordingId) => checkSpoken({ cardId: card._id, recordingId }))
      .then((result) => {
        setCheck(result);
        setOverruled(false);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder.recording]);

  const correct = check !== null && (check.correct || overruled);

  return (
    <div className="space-y-5 rounded-xl border border-gray-200 bg-white p-6">
      <CardPrompt card={card} revealed={check !== null} />

      <div className="flex flex-wrap items-center gap-3">
        {busy ? (
          <p className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 size={16} className="animate-spin" /> {t("lesson.grading")}
          </p>
        ) : recorder.isRecording ? (
          <button onClick={recorder.stop} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-5 py-3 text-sm font-medium text-white">
            <Square size={18} /> {t("lesson.stop")}
          </button>
        ) : (
          <button
            onClick={() => void recorder.start()}
            className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-5 py-3 text-sm font-medium text-white hover:bg-gray-800"
          >
            <Mic size={18} /> {check ? t("cards.sayAgain") : t("lesson.speak")}
          </button>
        )}
        {!check && !busy && (
          <button onClick={() => onDone(false, "")} className="text-sm text-gray-500 hover:text-gray-900">
            {t("cards.dontKnow")}
          </button>
        )}
      </div>
      {(recorder.error || error) && <p className="text-sm text-red-600">{recorder.error ?? error}</p>}

      {check && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            {t("lesson.youSaid")}: <span className="font-medium text-gray-900">{check.transcript || "—"}</span>
          </p>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {correct ? <CheckCircle2 size={18} className="text-green-600" /> : <XCircle size={18} className="text-red-600" />}
            <span className={correct ? "text-green-800" : "text-red-800"}>
              {correct ? t("lesson.verdict.correct") : t("cards.expected", { expected: check.expected })}
            </span>
            <ListenButton cardId={card._id} />
          </div>
          <div className="flex flex-wrap justify-between gap-3">
            {!check.correct && !overruled ? (
              <button onClick={() => setOverruled(true)} className="text-sm text-gray-500 underline underline-offset-4">
                {t("cards.saidItRight")}
              </button>
            ) : (
              <span />
            )}
            <button
              autoFocus
              onClick={() => onDone(correct, check.transcript)}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white"
            >
              {t("lesson.next")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
