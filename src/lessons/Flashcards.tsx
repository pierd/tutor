import { useState } from "react";
import { useMutation } from "convex/react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, XCircle } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { checkTyped, normalize } from "../../convex/lib/text";
import { CardPrompt, ListenButton, RoundSummary } from "./deck";
import { useDeck, type DeckCard } from "./useDeck";

type Result = { correct: boolean; given: string; accentSlip: boolean };

// Multiple choice or typed answers on ready-made cards. No AI involved.
export function Flashcards({ profileId, lessonId }: { profileId: Id<"profiles">; lessonId?: Id<"lessons"> }) {
  const { t } = useTranslation();
  const { cards, newRound } = useDeck(profileId, lessonId);
  const [typed, setTyped] = useState(false);
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
  const record = (result: Result) => {
    if (result.correct) setScore((s) => s + 1);
    void answerCard({ cardId: card._id, correct: result.correct, mode: typed ? "typed" : "choice", given: result.given });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>
          {index + 1} / {cards.length}
        </span>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={typed} onChange={(e) => setTyped(e.target.checked)} />
          {t("cards.typeAnswers")}
        </label>
      </div>
      <FlashcardItem key={card._id} card={card} typed={typed} onAnswer={record} onNext={() => setIndex((i) => i + 1)} />
    </div>
  );
}

function FlashcardItem({
  card,
  typed,
  onAnswer,
  onNext,
}: {
  card: DeckCard;
  typed: boolean;
  onAnswer: (result: Result) => void;
  onNext: () => void;
}) {
  const { t } = useTranslation();
  const [result, setResult] = useState<Result | null>(null);
  const [text, setText] = useState("");

  const answer = (given: string) => {
    if (result) return;
    const checked = checkTyped(card.accepted, given);
    const r = { correct: checked.correct, given, accentSlip: checked.accentSlip };
    setResult(r);
    onAnswer(r);
  };

  return (
    <div
      className="space-y-5 rounded-xl border border-gray-200 bg-white p-6"
      onKeyDown={(e) => {
        if (e.key === "Enter" && result) {
          e.preventDefault();
          onNext();
        }
      }}
    >
      <CardPrompt card={card} revealed={result !== null} />

      {typed ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!result && text.trim()) answer(text);
          }}
        >
          <input
            autoFocus
            value={text}
            disabled={result !== null}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("lesson.typePlaceholder")}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-lg outline-none focus:border-gray-900"
          />
          {!result && (
            <button type="submit" className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white">
              {t("lesson.check")}
            </button>
          )}
        </form>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {card.options.map((option) => {
            const isAnswer = card.accepted.some((a) => normalize(a) === normalize(option));
            const picked = result?.given === option;
            return (
              <button
                key={option}
                disabled={result !== null}
                onClick={() => answer(option)}
                className={`rounded-lg border-2 px-4 py-3 text-lg transition-colors ${
                  result && isAnswer
                    ? "border-green-600 bg-green-50 text-green-800"
                    : picked
                      ? "border-red-600 bg-red-50 text-red-800"
                      : "border-gray-200 hover:border-gray-900"
                }`}
              >
                {option}
              </button>
            );
          })}
        </div>
      )}

      {result && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm">
            {result.correct ? (
              <CheckCircle2 size={18} className="text-green-600" />
            ) : (
              <XCircle size={18} className="text-red-600" />
            )}
            <span className={result.correct ? "text-green-800" : "text-red-800"}>
              {result.correct
                ? result.accentSlip
                  ? t("cards.accentSlip", { answer: card.answer })
                  : t("lesson.verdict.correct")
                : t("cards.wasAnswer", { answer: card.answer })}
            </span>
            <ListenButton cardId={card._id} />
          </div>
          <button autoFocus onClick={onNext} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white">
            {t("lesson.next")}
          </button>
        </div>
      )}
    </div>
  );
}
