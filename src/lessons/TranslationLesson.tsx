import { useEffect, useRef, useState } from "react";
import { useAction, useMutation } from "convex/react";
import { useQuery } from "../lib/useQuery";
import type { FunctionReturnType } from "convex/server";
import { useTranslation } from "react-i18next";
import { Keyboard, Loader2, Mic, Square } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { languageName } from "../i18n";
import { ListenControls } from "../lib/ListenControls";
import { track } from "../lib/posthog";
import { uploadRecording } from "../voice/upload";
import { useRecorder } from "../voice/useRecorder";
import { diffWords } from "../voice/wordDiff";

type Exercise = NonNullable<FunctionReturnType<typeof api.translation.get>>;
type Attempt = Exercise["attempts"][number];

const buttonClass =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50";
const primary = `${buttonClass} bg-gray-900 text-white hover:bg-gray-800`;
const secondary = `${buttonClass} border border-gray-300 bg-white text-gray-700 hover:bg-gray-100`;
const quiet = `${buttonClass} text-gray-500 hover:bg-gray-100 hover:text-gray-900`;

export function TranslationLesson({ profile, lessonId }: { profile: Doc<"profiles">; lessonId?: Id<"lessons"> }) {
  const { t } = useTranslation();
  const next = useMutation(api.translation.next);
  const skip = useMutation(api.translation.skip);
  const [exerciseId, setExerciseId] = useState<Id<"exercises"> | null>(null);
  const exercise = useQuery(api.translation.get, exerciseId ? { exerciseId } : "skip");

  useEffect(() => {
    void next({ profileId: profile._id, lessonId }).then(setExerciseId);
  }, [next, profile._id, lessonId]);

  const goNext = () => void next({ profileId: profile._id, lessonId }).then(setExerciseId);
  const doSkip = () => exerciseId && void skip({ exerciseId }).then(setExerciseId);

  return (
    <div className="space-y-4">
      {!exercise || exercise.status === "generating" ? (
        <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-8 text-gray-500">
          <Loader2 size={18} className="animate-spin" /> {t("lesson.preparing")}
        </div>
      ) : exercise.status === "failed" || exercise.status === "skipped" ? (
        <div className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-6">
          <p className="text-sm text-red-700">{t("lesson.failed")}</p>
          {exercise.error && <p className="text-xs text-red-500">{exercise.error}</p>}
          <button onClick={doSkip} className={secondary}>
            {t("lesson.tryAnother")}
          </button>
        </div>
      ) : (
        <ExerciseCard
          key={exercise._id}
          exercise={exercise}
          targetLang={profile.targetLang}
          onNext={goNext}
          onSkip={doSkip}
        />
      )}
      <SentenceHistory profileId={profile._id} lessonId={lessonId} currentId={exerciseId} />
    </div>
  );
}

// Earlier sentences with the learner's answer, the correction and audio.
function SentenceHistory({
  profileId,
  lessonId,
  currentId,
}: {
  profileId: Id<"profiles">;
  lessonId?: Id<"lessons">;
  currentId: Id<"exercises"> | null;
}) {
  const { t } = useTranslation();
  const history = useQuery(api.translation.history, { profileId, lessonId });
  const rows = (history ?? []).filter((row) => row._id !== currentId);
  if (rows.length === 0) return null;
  return (
    <details className="rounded-xl border border-gray-200 bg-white p-4">
      <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wide text-gray-500">
        {t("lesson.history", { count: rows.length })}
      </summary>
      <ul className="mt-3 divide-y divide-gray-100">
        {rows.map((row) => (
          <li key={row._id} className="space-y-1 py-3 text-sm">
            <p className="text-gray-500">{row.prompt}</p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-gray-900">{row.answer}</span>
              {row.audioUrl && <ListenControls getUrl={async () => row.audioUrl} size={14} />}
            </div>
            {row.attempt && (
              <p className="flex flex-wrap items-center gap-2 text-gray-600">
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${VERDICT_STYLE[row.attempt.verdict]}`}>
                  {t(`lesson.verdict.${row.attempt.verdict}`)}
                </span>
                {row.attempt.answer}
                {row.attempt.corrected !== row.attempt.answer && (
                  <span className="text-gray-400">→ {row.attempt.corrected}</span>
                )}
              </p>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

function ExerciseCard({
  exercise,
  targetLang,
  onNext,
  onSkip,
}: {
  exercise: Exercise;
  targetLang: string;
  onNext: () => void;
  onSkip: () => void;
}) {
  const { t } = useTranslation();
  const [showHint, setShowHint] = useState(false);
  const [typing, setTyping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRecorder();
  const submittedBlob = useRef<Blob | null>(null);

  const generateUploadUrl = useMutation(api.recordings.generateUploadUrl);
  const saveRecording = useMutation(api.recordings.save);
  const submitSpeech = useAction(api.translation.submitSpeech);
  const submitText = useAction(api.translation.submitText);

  const answered = exercise.status === "answered";
  const first = exercise.attempts[0];

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // Submit as soon as a recording finishes.
  useEffect(() => {
    const blob = recorder.recording?.blob;
    if (!blob || submittedBlob.current === blob) return;
    submittedBlob.current = blob;
    void run(async () => {
      const recordingId = await uploadRecording(blob, generateUploadUrl, saveRecording);
      await submitSpeech({ exerciseId: exercise._id, recordingId });
      track("translation_answer_submitted", { answer_method: "speech" });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder.recording]);

  const sendText = (text: string) =>
    run(async () => {
      await submitText({ exerciseId: exercise._id, text });
      track("translation_answer_submitted", { answer_method: "typed" });
    });

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <p className="text-xs uppercase tracking-wide text-gray-400">
          {t("lesson.instruction", { lang: languageName(targetLang) })}
        </p>
        <p className="mt-2 text-2xl font-semibold leading-snug text-gray-900">{exercise.prompt}</p>
        {exercise.hint &&
          (showHint ? (
            <p className="mt-3 text-sm text-gray-600">💡 {exercise.hint}</p>
          ) : (
            <button onClick={() => setShowHint(true)} className="mt-3 text-sm text-gray-500 underline underline-offset-4">
              {t("lesson.showHint")}
            </button>
          ))}

        {!answered && (
          <div className="mt-6 space-y-3">
            {busy ? (
              <p className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 size={16} className="animate-spin" /> {t("lesson.grading")}
              </p>
            ) : typing ? (
              <TextAnswer placeholder={t("lesson.typePlaceholder")} submitLabel={t("lesson.check")} onSubmit={sendText} />
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                {recorder.isRecording ? (
                  <button onClick={recorder.stop} className={`${buttonClass} bg-red-600 px-6 py-3 text-white hover:bg-red-700`}>
                    <Square size={18} /> {t("lesson.stop")}
                  </button>
                ) : (
                  <button onClick={() => void recorder.start()} className={`${primary} px-6 py-3`}>
                    <Mic size={18} /> {t("lesson.speak")}
                  </button>
                )}
                <button onClick={() => setTyping(true)} className={quiet}>
                  <Keyboard size={16} /> {t("lesson.typeInstead")}
                </button>
              </div>
            )}
            {recorder.error && <p className="text-sm text-red-600">{recorder.error}</p>}
          </div>
        )}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </section>

      {answered && first && (
        <Feedback exercise={exercise} attempt={first} busy={busy} onTypedCheck={sendText} />
      )}

      <div className="flex justify-between">
        {answered ? (
          <span />
        ) : (
          <button onClick={onSkip} disabled={busy} className={quiet}>
            {t("lesson.skip")}
          </button>
        )}
        {answered && (
          <button onClick={onNext} className={primary}>
            {t("lesson.next")}
          </button>
        )}
      </div>
    </div>
  );
}

function TextAnswer({
  placeholder,
  submitLabel,
  onSubmit,
}: {
  placeholder: string;
  submitLabel: string;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState("");
  return (
    <form
      className="flex gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (text.trim()) onSubmit(text);
      }}
    >
      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-base text-gray-900 outline-none focus:border-gray-900"
      />
      <button type="submit" className={primary}>
        {submitLabel}
      </button>
    </form>
  );
}

const VERDICT_STYLE = {
  correct: "bg-green-100 text-green-800",
  almost: "bg-amber-100 text-amber-800",
  incorrect: "bg-red-100 text-red-800",
} as const;

const OUTCOME_STYLE = {
  correct: "border-green-200 bg-green-50 text-green-800",
  incorrect: "border-red-200 bg-red-50 text-red-800",
  inaudible: "border-gray-200 bg-gray-50 text-gray-600",
} as const;

function Feedback({
  exercise,
  attempt,
  busy,
  onTypedCheck,
}: {
  exercise: Exercise;
  attempt: Attempt;
  busy: boolean;
  onTypedCheck: (text: string) => void;
}) {
  const { t } = useTranslation();
  const contest = useMutation(api.translation.contest);
  const followUp = exercise.attempts[1];
  const modelAnswer = exercise.answers[0];

  return (
    <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ${VERDICT_STYLE[attempt.verdict]}`}>
          {t(`lesson.verdict.${attempt.verdict}`)}
        </span>
        {attempt.contested && <span className="text-sm text-gray-500">{t("lesson.contested")}</span>}
      </div>

      <div>
        <p className="text-xs uppercase tracking-wide text-gray-400">
          {attempt.mode === "speech" ? t("lesson.youSaid") : t("lesson.youWrote")}
        </p>
        <p className="mt-1 text-lg">
          {diffWords(attempt.corrected, attempt.answer).map((token, i) => (
            <span key={i} className={token.match ? "text-gray-900" : "rounded bg-amber-100 px-0.5 text-amber-900"}>
              {token.word}{" "}
            </span>
          ))}
        </p>
      </div>

      <div>
        <p className="text-xs uppercase tracking-wide text-gray-400">{t("lesson.correctVersion")}</p>
        <p className="mt-1 text-lg font-medium text-gray-900">{attempt.corrected}</p>
        {modelAnswer && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-600">
            <span>{modelAnswer}</span>
            {/* Plays the model answer as soon as the grade appears. */}
            {exercise.audioUrl && <ListenControls getUrl={async () => exercise.audioUrl} autoPlay />}
          </div>
        )}
        {exercise.answers.length > 1 && (
          <p className="mt-1 text-xs text-gray-500">
            {t("lesson.alsoAccepted")}: {exercise.answers.slice(1).join(" · ")}
          </p>
        )}
      </div>

      <p className="text-gray-700">{attempt.feedback}</p>

      {attempt.itemResults.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {attempt.itemResults.map((result) => (
            <li
              key={result.itemId}
              title={result.note}
              className={`rounded-lg border px-3 py-1 text-sm ${OUTCOME_STYLE[result.outcome]}`}
            >
              {result.text}
              {result.outcome === "inaudible" && <span className="ml-1 text-xs">· {t("lesson.inaudible")}</span>}
            </li>
          ))}
        </ul>
      )}

      {attempt.needsTypedCheck && !followUp && (
        <div className="space-y-2 rounded-lg bg-gray-50 p-4">
          <p className="text-sm text-gray-600">{t("lesson.typedCheckIntro")}</p>
          {busy ? (
            <p className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 size={16} className="animate-spin" /> {t("lesson.grading")}
            </p>
          ) : (
            <TextAnswer placeholder={t("lesson.typePlaceholder")} submitLabel={t("lesson.check")} onSubmit={onTypedCheck} />
          )}
        </div>
      )}
      {followUp && (
        <div className="space-y-1 rounded-lg bg-gray-50 p-4">
          <p className="text-xs uppercase tracking-wide text-gray-400">{t("lesson.typedCheck")}</p>
          <p className="text-sm">
            <span className={`mr-2 rounded-full px-2 py-0.5 text-xs font-semibold ${VERDICT_STYLE[followUp.verdict]}`}>
              {t(`lesson.verdict.${followUp.verdict}`)}
            </span>
            {followUp.answer}
          </p>
          <p className="text-sm text-gray-600">{followUp.feedback}</p>
        </div>
      )}

      {attempt.verdict !== "correct" && !attempt.contested && (
        <button
          onClick={() => void contest({ attemptId: attempt._id })}
          className="text-sm text-gray-500 underline underline-offset-4 hover:text-gray-900"
        >
          {t("lesson.contest")}
        </button>
      )}
    </section>
  );
}
