import { createContext } from "react";
import type { Id } from "../../convex/_generated/dataModel";

// What an "Ask the coach" button opens the chat about. No topic opens a new
// general conversation.
export type CoachTopic = {
  focus: { kind: "item"; itemId: Id<"items"> } | { kind: "guide"; lessonId: Id<"lessons"> };
  label: string;
};

// Identifies the button that opened the panel, so clicking it again closes it.
export function topicKey(topic?: CoachTopic) {
  if (!topic) return "general";
  return topic.focus.kind === "item" ? `item:${topic.focus.itemId}` : `guide:${topic.focus.lessonId}`;
}

// Provided by App: `ask` opens the panel on a new conversation (or closes it
// if the same button opened it); `openedBy` is that button's topicKey while
// the panel shows the conversation it started.
export const AskCoachContext = createContext<{
  ask: (topic?: CoachTopic) => void;
  openedBy: string | null;
} | null>(null);
