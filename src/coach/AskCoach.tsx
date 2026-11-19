import { useContext, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { MessageCircle } from "lucide-react";
import { track } from "../lib/posthog";
import { AskCoachContext, topicKey, type CoachTopic } from "./askCoachContext";

// The one look for everything that involves the coach.
export function CoachButton({
  onClick,
  active = false,
  className = "",
  children,
}: {
  onClick: () => void;
  active?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium ${
        active
          ? "border-violet-700 bg-violet-700 text-white"
          : "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100"
      } ${className}`}
    >
      <MessageCircle size={14} className="shrink-0" /> {children}
    </button>
  );
}

// "Ask the coach" from study material: opens the coach on a new conversation
// about one item or a lesson's study notes. The coach can answer and propose
// fixes. Without a topic, a new general conversation.
export function AskCoachButton({ topic, className, children }: { topic?: CoachTopic; className?: string; children?: ReactNode }) {
  const { t } = useTranslation();
  const coach = useContext(AskCoachContext);
  if (!coach) return null;
  const active = coach.openedBy === topicKey(topic);
  return (
    <CoachButton
      className={className}
      active={active}
      onClick={() => {
        if (!active) {
          if (topic) track("coach_asked_about", { focus_kind: topic.focus.kind });
          else track("coach_opened", { source: "nav" });
        }
        coach.ask(topic);
      }}
    >
      {children ?? t("coach.ask")}
    </CoachButton>
  );
}
