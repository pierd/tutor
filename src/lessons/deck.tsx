import { useState } from "react";
import { useAction } from "convex/react";
import { useTranslation } from "react-i18next";
import { Volume2 } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { DeckCard } from "./useDeck";

export function CardPrompt({ card, revealed }: { card: DeckCard; revealed?: boolean }) {
  const { t } = useTranslation();
  if (card.kind === "meaning") {
    return (
      <div>
        <p className="text-xs uppercase tracking-wide text-gray-400">{t("cards.meaningPrompt")}</p>
        <p className="mt-2 text-2xl font-semibold text-gray-900">{card.prompt}</p>
      </div>
    );
  }
  const [before, after] = card.prompt.split("___");
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-gray-400">{t("cards.formPrompt")}</p>
      <p className="mt-2 text-2xl font-semibold text-gray-900">
        {before}
        <span className="mx-1 inline-block min-w-16 border-b-2 border-gray-900 px-1 text-center">
          {revealed ? card.answer : " "}
        </span>
        {after}
      </p>
      {card.cue && <span className="mt-2 inline-block rounded bg-gray-900 px-2 py-0.5 text-sm text-white">{card.cue}</span>}
    </div>
  );
}

// Plays the card's correct pronunciation (rendered once, then cached).
export function ListenButton({ cardId }: { cardId: Id<"cards"> }) {
  const { t } = useTranslation();
  const pronounce = useAction(api.practice.pronounce);
  const [loading, setLoading] = useState(false);
  return (
    <button
      onClick={() => {
        setLoading(true);
        void pronounce({ cardId })
          .then((url) => {
            if (url) void new Audio(url).play();
          })
          .finally(() => setLoading(false));
      }}
      disabled={loading}
      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-50"
    >
      <Volume2 size={16} /> {t("cards.listen")}
    </button>
  );
}

export function RoundSummary({ correct, total, onAgain }: { correct: number; total: number; onAgain: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-8 text-center">
      <p className="text-3xl font-bold text-gray-900">
        {correct} / {total}
      </p>
      <p className="text-gray-600">{t("cards.roundDone")}</p>
      <button onClick={onAgain} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">
        {t("cards.again")}
      </button>
    </div>
  );
}
