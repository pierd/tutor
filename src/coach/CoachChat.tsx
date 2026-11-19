import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "../lib/useQuery";
import { useSmoothText, useUIMessages, type UIMessage } from "@convex-dev/agent/react";
import { useTranslation } from "react-i18next";
import { Loader2, RotateCcw, Send } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { track } from "../lib/posthog";
import { ProposalCard } from "./ProposalCard";

// Chat with the coach to shape lessons and units. Proposals appear as cards;
// nothing is created until the learner accepts one.
export function CoachChat({
  profile,
  onOpenLesson,
}: {
  profile: Doc<"profiles">;
  onOpenLesson: (lessonId: Id<"lessons">) => void;
}) {
  const { t } = useTranslation();
  const threadId = useQuery(api.coach.getThread, { profileId: profile._id });
  const send = useMutation(api.coach.send);
  const reset = useMutation(api.coach.reset);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const submit = (text: string) => {
    if (!text.trim() || sending) return;
    const messageSource = suggestions.includes(text) ? "suggestion" : "typed";
    track("coach_message_sent", { message_source: messageSource });
    setSending(true);
    void send({ profileId: profile._id, prompt: text })
      .then(() => setDraft(""))
      .finally(() => setSending(false));
  };

  const suggestions = [t("coach.suggestPlan"), t("coach.suggestNumbers"), t("coach.suggestCafe")];

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col gap-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("coach.title")}</h1>
          <p className="mt-1 text-sm text-gray-500">{t("coach.intro")}</p>
        </div>
        {threadId && (
          <button
            onClick={() => void reset({ profileId: profile._id })}
            className="flex shrink-0 items-center gap-1 rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-100"
          >
            <RotateCcw size={14} /> {t("coach.newChat")}
          </button>
        )}
      </header>

      {threadId ? (
        <Messages threadId={threadId} onOpenLesson={onOpenLesson} />
      ) : (
        threadId === null && (
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => submit(s)}
                className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:border-gray-900"
              >
                {s}
              </button>
            ))}
          </div>
        )
      )}

      <form
        className="sticky bottom-0 flex gap-2 bg-gray-50 py-2"
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
          placeholder={t("coach.placeholder")}
          className="flex-1 resize-none rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-gray-900"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="self-end rounded-xl bg-gray-900 p-3 text-white hover:bg-gray-800 disabled:opacity-50"
          aria-label={t("coach.send")}
        >
          <Send size={18} />
        </button>
      </form>
    </div>
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
      return <p className="text-center text-xs text-gray-400">{message.text.trim().slice(1, -1)}</p>;
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
