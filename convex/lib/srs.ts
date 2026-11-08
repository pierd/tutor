// Small SM-2-style scheduler. Pure functions so it can be swapped (e.g. for
// FSRS) without touching callers.

export type Outcome = "correct" | "incorrect" | "lookup" | "exposure";

export type SrsState = {
  due: number;
  intervalDays: number;
  ease: number;
  reps: number;
  lapses: number;
  lastReviewedAt?: number;
};

const DAY = 24 * 60 * 60 * 1000;
const MIN_EASE = 1.3;

export function initialState(now: number): SrsState {
  return { due: now, intervalDays: 0, ease: 2.5, reps: 0, lapses: 0 };
}

export function applyOutcome(state: SrsState, outcome: Outcome, now: number): SrsState {
  switch (outcome) {
    case "correct": {
      // Extra correct answers before the item is due (e.g. drilling flashcards)
      // don't push it further out; only a review at the due time does.
      if (state.lastReviewedAt !== undefined && now < state.due) return state;
      const intervalDays =
        state.reps === 0 ? 1 : state.reps === 1 ? 3 : Math.round(state.intervalDays * state.ease);
      return {
        ...state,
        intervalDays,
        reps: state.reps + 1,
        due: now + intervalDays * DAY,
        lastReviewedAt: now,
      };
    }
    case "incorrect":
      return {
        ...state,
        intervalDays: 1,
        ease: Math.max(MIN_EASE, state.ease - 0.2),
        reps: 0,
        lapses: state.lapses + 1,
        due: now + DAY,
        lastReviewedAt: now,
      };
    case "lookup": {
      // Soft fail: the learner needed help, but it isn't a wrong answer.
      const intervalDays = Math.max(1, Math.round(state.intervalDays / 2));
      return {
        ...state,
        intervalDays,
        ease: Math.max(MIN_EASE, state.ease - 0.05),
        due: Math.min(state.due, now + intervalDays * DAY),
        lastReviewedAt: now,
      };
    }
    case "exposure":
      return state;
  }
}

// 0..1 estimate for display: grows with the review interval, ~1 at 30+ days.
export function strength(state: Pick<SrsState, "intervalDays" | "reps">) {
  if (state.reps === 0 && state.intervalDays === 0) return 0;
  return Math.min(1, Math.log1p(state.intervalDays) / Math.log1p(30));
}
