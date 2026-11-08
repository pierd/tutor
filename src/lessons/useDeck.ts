import { useCallback, useEffect, useState } from "react";
import { useConvex } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export type DeckCard = FunctionReturnType<typeof api.practice.drawCards>[number];

// Draws one batch of cards per round. Fetched once (not subscribed) so the
// deck doesn't reshuffle while the learner answers.
export function useDeck(profileId: Id<"profiles">, lessonId?: Id<"lessons">) {
  const convex = useConvex();
  const [cards, setCards] = useState<DeckCard[] | null>(null);
  const [round, setRound] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void convex
      .query(api.practice.drawCards, {
        profileId,
        lessonId,
        now: Date.now(),
        seed: Math.floor(Math.random() * 2 ** 31),
      })
      .then((drawn) => !cancelled && setCards(drawn));
    return () => {
      cancelled = true;
    };
  }, [convex, profileId, lessonId, round]);

  const newRound = useCallback(() => {
    setCards(null);
    setRound((r) => r + 1);
  }, []);

  return { cards, newRound };
}
