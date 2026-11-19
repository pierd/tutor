import { useEffect, useMemo, useState } from "react";
import { useAction, useMutation } from "convex/react";
import { useQuery } from "../lib/useQuery";
import type { FunctionReturnType } from "convex/server";
import { useTranslation } from "react-i18next";
import { Image as ImageIcon, Loader2, RefreshCw } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { TARGET_LANGUAGES } from "../../convex/lib/languages";
import { ListenControls } from "../lib/ListenControls";
import { track } from "../lib/posthog";
import { tokenize, type Entry } from "./glossaryTokens";

type ReadingDoc = NonNullable<FunctionReturnType<typeof api.reading.current>>;

// A short text with tap-to-look-up words and comprehension questions. Every
// text is kept: the learner can reopen earlier ones from the list below.
export function Reading({ profile, lessonId }: { profile: Doc<"profiles">; lessonId?: Id<"lessons"> }) {
  const { t, i18n } = useTranslation();
  const current = useQuery(api.reading.current, {
    profileId: profile._id,
    lessonId,
  });
  const history = useQuery(api.reading.history, {
    profileId: profile._id,
    lessonId,
  });
  const [viewingId, setViewingId] = useState<Id<"readings"> | null>(null);
  const viewed = useQuery(api.reading.get, viewingId ? { readingId: viewingId } : "skip");
  const [withImages, setWithImages] = useState(false);
  const generate = useMutation(api.reading.generate);

  const newText = () => {
    setViewingId(null);
    void generate({ profileId: profile._id, lessonId, withImages }).then(() => {
      track("reading_generated", { with_images: withImages });
    });
  };
  const generating = current?.status === "generating";
  const shown = viewingId ? viewed : current;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={newText}
          disabled={generating}
          className="flex items-center gap-1 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          <RefreshCw size={14} /> {current ? t("reading.newText") : t("reading.generate")}
        </button>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={withImages} onChange={(e) => setWithImages(e.target.checked)} />
          <ImageIcon size={14} /> {t("reading.withImages")}
        </label>
      </div>

      {current === undefined ? null : current === null ? (
        <p className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600">{t("reading.intro")}</p>
      ) : generating && !viewingId ? (
        <p className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white p-6 text-gray-500">
          <Loader2 size={18} className="animate-spin" /> {t("reading.writing")}
        </p>
      ) : shown?.status === "failed" ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t("reading.failed")}</p>
      ) : shown?.status === "ready" ? (
        <ReadingView key={shown._id} reading={shown} targetLang={profile.targetLang} />
      ) : null}

      {history && history.length > 0 && (
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">{t("reading.history")}</h3>
          <ul className="divide-y divide-gray-100">
            {history.map((entry) => {
              const active = entry._id === shown?._id;
              return (
                <li key={entry._id}>
                  <button
                    onClick={() => setViewingId(entry._id === current?._id ? null : entry._id)}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left text-sm ${
                      active ? "bg-gray-100 font-medium text-gray-900" : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <span className="flex items-center gap-2 truncate">
                      {entry.withImages && <ImageIcon size={14} className="shrink-0 text-gray-400" />}
                      {entry.title}
                    </span>
                    <span className="shrink-0 text-xs text-gray-500">
                      {entry.lastScore !== undefined && `${Math.round(entry.lastScore * 100)}% · `}
                      {new Date(entry._creationTime).toLocaleDateString(i18n.language)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

function ReadingView({ reading, targetLang }: { reading: ReadingDoc; targetLang: string }) {
  const { t } = useTranslation();
  // Tapped word as "paragraph:token", so repeated words open only where tapped.
  const [selected, setSelected] = useState<string | null>(null);
  const [lookedUp, setLookedUp] = useState<Set<string>>(new Set());
  // A finished text reopens with its saved answers.
  const [answers, setAnswers] = useState<(number | undefined)[]>(reading.lastAnswers ?? []);
  const [score, setScore] = useState<number | null>(reading.lastAnswers ? (reading.lastScore ?? null) : null);
  const submit = useMutation(api.reading.submit);
  const audio = useAction(api.reading.audio);

  const spaced = TARGET_LANGUAGES.find((l) => l.code === targetLang)?.script !== "japanese";
  const paragraphs = useMemo(
    () => (reading.text ?? "").split(/\n\s*\n/).map((p) => tokenize(p, reading.glossary, { spaced })),
    [reading.text, reading.glossary, spaced],
  );
  const done = score !== null;
  const allAnswered = reading.questions.every((_, i) => answers[i] !== undefined);

  // Close the meaning bubble on Escape or a tap outside any word.
  useEffect(() => {
    if (selected === null) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !(e.target as Element).closest("[data-gloss]")) {
        setSelected(null);
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [selected]);

  const pick = (key: string, entry: Entry) => {
    setSelected(selected === key ? null : key);
    // Lookups after finishing the questions don't count against the learner.
    if (entry.itemKey && !done) setLookedUp((s) => new Set(s).add(entry.itemKey!));
  };

  const optionLabel = (option: string) =>
    option === "true" ? t("reading.true") : option === "false" ? t("reading.false") : option;

  return (
    <div className="space-y-4">
      <article className="space-y-3 rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-bold text-gray-900">{reading.title}</h2>
          <ListenControls getUrl={() => audio({ readingId: reading._id })} />
        </div>
        <p className="-mt-2 text-sm text-gray-400">{t("reading.tapHint")}</p>
        {paragraphs.map((tokens, p) => (
          <div key={p} className="space-y-3">
            <p className="whitespace-pre-wrap text-lg leading-relaxed text-gray-900">
              {tokens.map((token, i) =>
                token.entry ? (
                  <span key={i} data-gloss className="relative">
                    <button
                      onClick={() => pick(`${p}:${i}`, token.entry!)}
                      className={`rounded decoration-gray-300 decoration-dotted underline-offset-4 hover:bg-amber-50 ${
                        selected === `${p}:${i}` ? "bg-amber-100" : "underline"
                      }`}
                    >
                      {token.text}
                    </button>
                    {selected === `${p}:${i}` && (
                      <span
                        role="tooltip"
                        className="absolute top-full left-1/2 z-20 mt-1 w-max max-w-[min(18rem,80vw)] -translate-x-1/2 rounded-lg bg-gray-900 px-3 py-2 text-sm leading-snug whitespace-normal text-white shadow-lg"
                      >
                        <span className="font-semibold">{token.entry.surface}</span> · {token.entry.gloss}
                      </span>
                    )}
                  </span>
                ) : (
                  <span key={i}>{token.text}</span>
                ),
              )}
            </p>
            {reading.illustrations
              .filter(
                (ill) => ill.paragraph === p || (p === paragraphs.length - 1 && ill.paragraph >= paragraphs.length),
              )
              .map((ill, i) => (
                <Illustration key={i} url={ill.url} failed={ill.failed} />
              ))}
          </div>
        ))}
      </article>

      <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-6">
        <h3 className="font-semibold text-gray-900">{t("reading.questions")}</h3>
        {reading.questions.map((question, qi) => (
          <div key={qi} className="space-y-2">
            <p className="text-gray-800">
              {qi + 1}. {question.question}
            </p>
            <div className="flex flex-wrap gap-2">
              {question.options.map((option, oi) => {
                const chosen = answers[qi] === oi;
                const right = oi === question.answerIndex;
                return (
                  <button
                    key={oi}
                    disabled={done}
                    onClick={() => setAnswers((a) => Object.assign([...a], { [qi]: oi }))}
                    className={`rounded-lg border-2 px-3 py-1.5 text-sm transition-colors ${
                      done && right
                        ? "border-green-600 bg-green-50 text-green-800"
                        : done && chosen
                          ? "border-red-600 bg-red-50 text-red-800"
                          : chosen
                            ? "border-gray-900 bg-gray-900 text-white"
                            : "border-gray-200 hover:border-gray-900"
                    }`}
                  >
                    {optionLabel(option)}
                  </button>
                );
              })}
            </div>
            {done && question.explanation && <p className="text-sm text-gray-500">{question.explanation}</p>}
          </div>
        ))}
        {done ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-semibold text-gray-900">
              {t("reading.score", {
                score: Math.round(score * reading.questions.length),
                total: reading.questions.length,
              })}
            </p>
            <button
              onClick={() => {
                setAnswers([]);
                setScore(null);
              }}
              className="text-sm text-gray-600 underline underline-offset-4 hover:text-gray-900"
            >
              {t("reading.tryAgain")}
            </button>
          </div>
        ) : (
          <div className="flex justify-end">
            <button
              disabled={!allAnswered}
              onClick={() =>
                void submit({
                  readingId: reading._id,
                  answers: answers.map((a) => a ?? -1),
                  lookedUp: [...lookedUp],
                }).then((result) => {
                  setScore(result);
                  track("reading_completed", {
                    question_count: reading.questions.length,
                    score: result,
                  });
                })
              }
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {t("lesson.check")}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function Illustration({ url, failed }: { url: string | null; failed: boolean }) {
  const { t } = useTranslation();
  if (failed) return null;
  if (!url) {
    return (
      <div className="flex h-48 animate-pulse items-center justify-center rounded-xl bg-gray-100 text-sm text-gray-400">
        {t("reading.drawing")}
      </div>
    );
  }
  return <img src={url} alt="" className="max-h-80 w-full rounded-xl object-cover" />;
}
