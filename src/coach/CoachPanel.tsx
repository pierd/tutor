import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "../lib/useQuery";
import { useSmoothText, useUIMessages, type UIMessage } from "@convex-dev/agent/react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { BookText, History, Loader2, MessageCircle, Plus, Send, Tag, X } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { track } from "../lib/posthog";
import type { CoachTopic } from "./askCoachContext";
import { ProposalCard } from "./ProposalCard";

// The coach as a side panel floating over the right of the page, so opening
// it doesn't move the page (full screen on phones): one
// conversation at a time, a list of earlier ones, and new conversations,
// either general (shape lessons and units) or about a topic from an "Ask the
// coach" button. Proposals appear as cards; nothing is created or changed
// until the learner accepts one.
export function CoachPanel({
  profile,
  threadId,
  topic,
  onSelectThread,
  onStarted,
  onClose,
  onOpenLesson,
}: {
  profile: Doc<"profiles">;
  // null = a new conversation, started by the first message.
  threadId: string | null;
  topic?: CoachTopic;
  onSelectThread: (threadId: string | null) => void;
  // The new conversation got its first message.
  onStarted: (threadId: string) => void;
  onClose: () => void;
  onOpenLesson: (lessonId: Id<"lessons">) => void;
}) {
  const { t } = useTranslation();
  const threads = useQuery(api.coach.threads, { profileId: profile._id });
  const [showList, setShowList] = useState(false);
  const current = threads?.find((thread) => thread.threadId === threadId);
  const subtitle = threadId
    ? (current?.title ?? t("coach.untitled"))
    : topic
      ? t("coach.askingAbout", { label: topic.label })
      : t("coach.newConversation");

  const iconButton = "rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900";

  return (
    <aside className="flex flex-col bg-gray-50 max-md:fixed max-md:inset-0 max-md:z-40 md:absolute md:inset-y-0 md:right-0 md:z-30 md:w-[26rem] md:border-l md:border-gray-200 md:shadow-xl">
      <header className="flex items-center gap-2 border-b border-gray-200 bg-white px-4 py-3">
        <MessageCircle size={18} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900">{t("coach.title")}</p>
          <p className="truncate text-xs text-gray-500">{subtitle}</p>
        </div>
        <button
          onClick={() => setShowList((s) => !s)}
          className={`${iconButton} ${showList ? "bg-gray-100 text-gray-900" : ""}`}
          aria-label={t("coach.conversations")}
          title={t("coach.conversations")}
        >
          <History size={18} />
        </button>
        <button
          onClick={() => {
            setShowList(false);
            onSelectThread(null);
          }}
          className={iconButton}
          aria-label={t("coach.newConversation")}
          title={t("coach.newConversation")}
        >
          <Plus size={18} />
        </button>
        <button onClick={onClose} className={iconButton} aria-label={t("coach.close")} title={t("coach.close")}>
          <X size={18} />
        </button>
      </header>

      {showList ? (
        <ThreadList
          threads={threads}
          activeThreadId={threadId}
          onSelect={(id) => {
            setShowList(false);
            onSelectThread(id);
          }}
        />
      ) : (
        <Conversation
          key={threadId ?? `new:${topic?.label ?? ""}`}
          profile={profile}
          threadId={threadId}
          topic={topic}
          onStarted={onStarted}
          onOpenLesson={onOpenLesson}
        />
      )}
    </aside>
  );
}

function ThreadList({
  threads,
  activeThreadId,
  onSelect,
}: {
  threads: { threadId: string; title?: string; focusKind?: "item" | "guide"; createdAt: number }[] | undefined;
  activeThreadId: string | null;
  onSelect: (threadId: string) => void;
}) {
  const { t, i18n } = useTranslation();
  if (threads === undefined) return null;
  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" });
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-2">
      {threads.length === 0 && <p className="p-4 text-sm text-gray-500">{t("coach.noConversations")}</p>}
      {threads.map((thread) => {
        const Icon = thread.focusKind === "item" ? Tag : thread.focusKind === "guide" ? BookText : MessageCircle;
        return (
          <button
            key={thread.threadId}
            onClick={() => onSelect(thread.threadId)}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-gray-100 ${
              thread.threadId === activeThreadId ? "bg-gray-100" : ""
            }`}
          >
            <Icon size={16} className="shrink-0 text-gray-400" />
            <span className="min-w-0 flex-1 truncate text-sm text-gray-900">{thread.title ?? t("coach.untitled")}</span>
            <span className="shrink-0 text-xs text-gray-400">{date.format(thread.createdAt)}</span>
          </button>
        );
      })}
    </div>
  );
}

function Conversation({
  profile,
  threadId,
  topic,
  onStarted,
  onOpenLesson,
}: {
  profile: Doc<"profiles">;
  threadId: string | null;
  topic?: CoachTopic;
  onStarted: (threadId: string) => void;
  onOpenLesson: (lessonId: Id<"lessons">) => void;
}) {
  const { t } = useTranslation();
  const send = useMutation(api.coach.send);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const suggestions = topic
    ? [t("coach.suggestExplain"), t("coach.suggestExamples"), t("coach.suggestFix")]
    : [t("coach.suggestPlan"), t("coach.suggestNumbers"), t("coach.suggestCafe")];

  const submit = (text: string) => {
    if (!text.trim() || sending) return;
    const messageSource = suggestions.includes(text) ? "suggestion" : "typed";
    track("coach_message_sent", { message_source: messageSource, focus_kind: topic?.focus.kind, new_conversation: !threadId });
    setSending(true);
    void send({ profileId: profile._id, threadId: threadId ?? undefined, prompt: text, focus: threadId ? undefined : topic?.focus })
      .then((id) => {
        setDraft("");
        if (!threadId) onStarted(id);
      })
      .finally(() => setSending(false));
  };

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {threadId ? (
          <Messages threadId={threadId} onOpenLesson={onOpenLesson} />
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">{topic ? t("coach.topicIntro", { label: topic.label }) : t("coach.intro")}</p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => submit(s)}
                  className="rounded-full border border-gray-300 bg-white px-4 py-2 text-left text-sm text-gray-700 hover:border-gray-900"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <form
        className="flex gap-2 border-t border-gray-200 bg-gray-50 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit(draft);
        }}
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit(draft);
            }
          }}
          rows={2}
          placeholder={topic && !threadId ? t("coach.placeholderTopic") : t("coach.placeholder")}
          className="flex-1 resize-none rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-gray-900"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="self-end rounded-xl bg-gray-900 p-3 text-white hover:bg-gray-800 disabled:opacity-50"
          aria-label={t("coach.send")}
        >
          {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        </button>
      </form>
    </>
  );
}

function Messages({ threadId, onOpenLesson }: { threadId: string; onOpenLesson: (lessonId: Id<"lessons">) => void }) {
  const { results } = useUIMessages(api.coach.messages, { threadId }, { initialNumItems: 50, stream: true });
  const proposals = useQuery(api.coach.proposals, { threadId });
  const byId = new Map((proposals ?? []).map((p) => [p._id as string, p]));
  const bottom = useRef<HTMLDivElement>(null);
  const lastText = results.at(-1)?.text;

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [results.length, lastText]);

  return (
    <div className="flex-1 space-y-4">
      {results.map((message) => (
        <Message key={message.key} message={message} proposals={byId} onOpenLesson={onOpenLesson} />
      ))}
      <div ref={bottom} />
    </div>
  );
}

// Notes are stored in English for the coach (see `note` in convex/coach.ts);
// the known ones are shown in the UI language.
const NOTES: [RegExp, string][] = [
  [/^Learner applied the fix to "(.*)"$/s, "coach.notes.fixApplied"],
  [/^Learner accepted the lesson "(.*)"$/s, "coach.notes.lessonAccepted"],
  [/^Learner accepted the unit "(.*)"; its lessons are being built$/s, "coach.notes.unitAccepted"],
  [/^Learner dismissed the proposal "(.*)"$/s, "coach.notes.dismissed"],
];

function noteText(text: string, t: TFunction) {
  for (const [pattern, key] of NOTES) {
    const match = pattern.exec(text);
    if (match) return t(key, { title: match[1] });
  }
  return text;
}

type ToolPart = { type: string; toolName?: string; state?: string; output?: unknown; errorText?: string };

function Message({
  message,
  proposals,
  onOpenLesson,
}: {
  message: UIMessage;
  proposals: Map<string, Doc<"proposals">>;
  onOpenLesson: (lessonId: Id<"lessons">) => void;
}) {
  const { t } = useTranslation();
  if (message.role === "user") {
    // Notes the app adds after accept/dismiss are shown quietly.
    if (/^\[.*\]$/s.test(message.text.trim())) {
      return <p className="text-center text-xs text-gray-400">{noteText(message.text.trim().slice(1, -1), t)}</p>;
    }
    return (
      <div className="flex justify-end">
        <p className="max-w-[80%] whitespace-pre-wrap rounded-2xl bg-gray-900 px-4 py-2 text-sm text-white">{message.text}</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {message.parts.map((part, i) => {
        if (part.type === "text") {
          return <AssistantText key={i} text={part.text} streaming={message.status === "streaming"} />;
        }
        if (part.type.startsWith("tool-") || part.type === "dynamic-tool") {
          const tool = part as ToolPart;
          if (tool.state === "output-available") {
            const proposalId = (tool.output as { proposalId?: string } | undefined)?.proposalId;
            const proposal = proposalId ? proposals.get(proposalId) : undefined;
            return proposal ? <ProposalCard key={i} proposal={proposal} onOpenLesson={onOpenLesson} /> : null;
          }
          if (tool.state === "output-error") {
            return (
              <p key={i} className="text-sm text-red-600">
                {tool.errorText}
              </p>
            );
          }
          return (
            <p key={i} className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 size={14} className="animate-spin" /> {t("coach.preparing")}
            </p>
          );
        }
        return null;
      })}
      {message.status === "streaming" && message.parts.length === 0 && (
        <Loader2 size={16} className="animate-spin text-gray-400" />
      )}
    </div>
  );
}

function AssistantText({ text, streaming }: { text: string; streaming: boolean }) {
  const [visible] = useSmoothText(text, { startStreaming: streaming });
  if (!visible.trim()) return null;
  return (
    <p className="max-w-[90%] whitespace-pre-wrap rounded-2xl bg-white px-4 py-2 text-sm text-gray-800 shadow-sm">{visible}</p>
  );
}
