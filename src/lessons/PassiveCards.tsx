import { useEffect, useId, useState } from "react";
import { useAction, useConvex } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useTranslation } from "react-i18next";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { currentAudioOwner, playAudio, stopAudio } from "../lib/audioPlayer";
import { CardPrompt } from "./deck";
import { Slideshow, type Speed } from "./Slideshow";

type PassiveCard = FunctionReturnType<typeof api.practice.allCards>[number];

// How long the prompt shows alone, then with the answer (ms).
const TIMINGS: Record<Speed, [prompt: number, answer: number]> = {
  slow: [6000, 8000],
  normal: [4000, 5000],
  fast: [2000, 3000],
};

// Passive flashcards: every card of the lesson, prompt then answer
// (optionally read aloud), in a loop. Nothing is graded or recorded.
export function PassiveCards({ profileId, lessonId }: { profileId: Id<"profiles">; lessonId?: Id<"lessons"> }) {
  const { t } = useTranslation();
  const convex = useConvex();
  const pronounce = useAction(api.practice.pronounce);
  const owner = useId();
  const [cards, setCards] = useState<PassiveCard[] | null>(null);
  const [readAloud, setReadAloud] = useState(false);

  // Fetched once: cards don't change while watching.
  useEffect(() => {
    let cancelled = false;
    void convex.query(api.practice.allCards, { profileId, lessonId }).then((all) => !cancelled && setCards(all));
    return () => {
      cancelled = true;
    };
  }, [convex, profileId, lessonId]);

  return (
    <Slideshow
      slides={cards}
      phases={2}
      duration={(_card, phase, speed) => TIMINGS[speed][phase]}
      // With "Read aloud", the answer stays until its audio has finished.
      waitFor={(card, phase) =>
        readAloud && phase === 1
          ? (done) => {
              let cancelled = false;
              pronounce({ cardId: card._id })
                .then((url) => {
                  if (cancelled) return;
                  if (url) playAudio(url, { owner, onEnd: done });
                  else done();
                })
                .catch(done);
              return () => {
                cancelled = true;
                if (currentAudioOwner() === owner) stopAudio();
              };
            }
          : null
      }
      restartKey={readAloud}
      settings={
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={readAloud} onChange={(e) => setReadAloud(e.target.checked)} />
          {t("passive.readAloud")}
        </label>
      }
      empty={<p className="text-sm text-gray-500">{t("cards.empty")}</p>}
      render={(card, phase) => (
        <>
          <CardPrompt card={card} revealed={phase === 1} />
          {card.kind === "meaning" && (
            <p
              className={`text-3xl font-bold text-gray-900 transition-opacity duration-500 ${phase === 1 ? "opacity-100" : "opacity-0"}`}
            >
              {card.answer}
            </p>
          )}
        </>
      )}
    />
  );
}
