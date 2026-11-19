import { useEffect, useId, useState } from "react";
import { useAction, useConvex } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useTranslation } from "react-i18next";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { currentAudioOwner, playAudio, stopAudio } from "../lib/audioPlayer";
import { CardPrompt } from "./deck";

type PassiveCard = FunctionReturnType<typeof api.practice.allCards>[number];
type Speed = "slow" | "normal" | "fast";

// How long the prompt shows alone, then with the answer (ms).
const SPEEDS: Record<Speed, { prompt: number; answer: number }> = {
  slow: { prompt: 6000, answer: 8000 },
  normal: { prompt: 4000, answer: 5000 },
  fast: { prompt: 2000, answer: 3000 },
};

function shuffled<T>(items: T[]) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Slow slideshow of every card in the lesson, meant to run in the background
// and be glanced at. Nothing is graded and no evidence is recorded.
export function Passive({ profileId, lessonId }: { profileId: Id<"profiles">; lessonId?: Id<"lessons"> }) {
  const { t } = useTranslation();
  const convex = useConvex();
  const pronounce = useAction(api.practice.pronounce);
  const owner = useId();
  const [cards, setCards] = useState<PassiveCard[] | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState<Speed>("normal");
  const [readAloud, setReadAloud] = useState(false);

  // Fetched once (not subscribed) so the order stays put while it plays.
  useEffect(() => {
    let cancelled = false;
    void convex
      .query(api.practice.allCards, { profileId, lessonId })
      .then((all) => !cancelled && setCards(shuffled(all)));
    return () => {
      cancelled = true;
    };
  }, [convex, profileId, lessonId]);

  const next = () => {
    if (cards && index + 1 >= cards.length) {
      setCards(shuffled(cards));
      setIndex(0);
    } else {
      setIndex((i) => i + 1);
    }
    setRevealed(false);
  };
  const previous = () => {
    setIndex((i) => Math.max(0, i - 1));
    setRevealed(true);
  };

  const card = cards?.[index];

  // Prompt → answer (read aloud if on) → next card. Moves on only once both
  // the answer's time is up and its audio has finished.
  useEffect(() => {
    if (!card || paused) return;
    let cancelled = false;
    if (!revealed) {
      const timer = setTimeout(() => setRevealed(true), SPEEDS[speed].prompt);
      return () => clearTimeout(timer);
    }
    let timeUp = false;
    let audioDone = !readAloud;
    const advance = () => !cancelled && timeUp && audioDone && next();
    const timer = setTimeout(() => {
      timeUp = true;
      advance();
    }, SPEEDS[speed].answer);
    if (readAloud) {
      const finish = () => {
        audioDone = true;
        advance();
      };
      pronounce({ cardId: card._id })
        .then((url) => {
          if (cancelled) return;
          if (url) playAudio(url, { owner, onEnd: finish });
          else finish();
        })
        .catch(finish);
    }
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (currentAudioOwner() === owner) stopAudio();
    };
    // `next` only depends on state listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card, revealed, paused, speed, readAloud]);

  // Keep the screen on while playing.
  useEffect(() => {
    if (paused || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = () => {
      if (document.visibilityState !== "visible") return;
      navigator.wakeLock
        .request("screen")
        .then((l) => (cancelled ? void l.release() : (lock = l)))
        .catch(() => {});
    };
    acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", acquire);
      void lock?.release();
    };
  }, [paused]);

  if (cards === null) return null;
  if (!card) return <p className="text-sm text-gray-500">{t("cards.empty")}</p>;

  const button = "rounded-lg p-2 text-gray-600 hover:bg-gray-100";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-gray-500">
        <span>
          {index + 1} / {cards.length}
        </span>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2">
            {t("passive.speed")}
            <select
              value={speed}
              onChange={(e) => setSpeed(e.target.value as Speed)}
              className="rounded border border-gray-300 bg-white px-2 py-1"
            >
              {(Object.keys(SPEEDS) as Speed[]).map((s) => (
                <option key={s} value={s}>
                  {t(`passive.speeds.${s}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={readAloud} onChange={(e) => setReadAloud(e.target.checked)} />
            {t("passive.readAloud")}
          </label>
        </div>
      </div>

      <div className="flex min-h-64 flex-col justify-center gap-6 rounded-xl border border-gray-200 bg-white p-8">
        <CardPrompt card={card} revealed={revealed} />
        {card.kind === "meaning" && (
          <p
            className={`text-3xl font-bold text-gray-900 transition-opacity duration-500 ${revealed ? "opacity-100" : "opacity-0"}`}
          >
            {card.answer}
          </p>
        )}
      </div>

      <div className="flex items-center justify-center gap-2">
        <button
          onClick={previous}
          disabled={index === 0}
          className={`${button} disabled:opacity-40`}
          aria-label={t("passive.previous")}
          title={t("passive.previous")}
        >
          <SkipBack size={20} />
        </button>
        <button
          onClick={() => setPaused((p) => !p)}
          className="rounded-full bg-gray-900 p-3 text-white hover:bg-gray-800"
          aria-label={paused ? t("passive.play") : t("passive.pause")}
          title={paused ? t("passive.play") : t("passive.pause")}
        >
          {paused ? <Play size={20} /> : <Pause size={20} />}
        </button>
        <button onClick={next} className={button} aria-label={t("passive.next")} title={t("passive.next")}>
          <SkipForward size={20} />
        </button>
      </div>
      <p className="text-center text-xs text-gray-400">{t("passive.noProgress")}</p>
    </div>
  );
}
