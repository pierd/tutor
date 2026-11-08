import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { Check, Layers, X } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { track } from "../lib/posthog";
import { useMinuteClock } from "../lib/useMinuteClock";

const MAX_ITEMS_SHOWN = 24;

export function ProposalCard({
  proposal,
  onOpenLesson,
}: {
  proposal: Doc<"proposals">;
  onOpenLesson: (lessonId: Id<"lessons">) => void;
}) {
  const { t } = useTranslation();
  const accept = useMutation(api.coach.accept);
  const dismiss = useMutation(api.coach.dismiss);
  const now = useMinuteClock();
  const tree = useQuery(api.units.tree, { profileId: proposal.profileId, now });
  const [busy, setBusy] = useState(false);
  const p = proposal.proposal;

  const unitLabel =
    p.kind === "lesson"
      ? p.unitId
        ? (tree?.units.find((u) => u._id === p.unitId)?.title ?? "")
        : t("coach.newUnit", { title: p.unitTitle ?? p.title })
      : null;

  return (
    <div className="space-y-3 rounded-xl border-2 border-gray-900 bg-white p-5">
      <div>
        <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
          <Layers size={12} /> {p.kind === "lesson" ? t("coach.lessonProposal") : t("coach.unitProposal")}
          {unitLabel && <span className="font-normal normal-case"> · {unitLabel}</span>}
        </p>
        <h3 className="mt-1 text-lg font-bold text-gray-900">{p.title}</h3>
        {p.description && <p className="text-sm text-gray-600">{p.description}</p>}
      </div>

      {p.kind === "lesson" ? (
        <>
          <ul className="flex flex-wrap gap-1.5">
            {p.items.slice(0, MAX_ITEMS_SHOWN).map((item) => (
              <li key={item.key} className="rounded-md bg-gray-100 px-2 py-1 text-sm">
                <span className="font-medium text-gray-900">{item.text}</span>
                {item.gloss && <span className="text-gray-500"> · {item.gloss}</span>}
              </li>
            ))}
            {p.items.length > MAX_ITEMS_SHOWN && (
              <li className="px-2 py-1 text-sm text-gray-500">+{p.items.length - MAX_ITEMS_SHOWN}</li>
            )}
          </ul>
          <p className="text-xs text-gray-500">
            {t("coach.cardCount", { count: p.cards.length })}
            {p.cards
              .filter((c) => c.kind === "form")
              .slice(0, 2)
              .map((c) => ` · ${c.prompt.replace("___", `[${c.answer}]`)}`)
              .join("")}
          </p>
        </>
      ) : (
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          {p.lessons.map((lesson) => (
            <li key={lesson.title}>
              <span className="font-medium text-gray-900">{lesson.title}</span>
              <span className="text-gray-500"> — {lesson.focus}</span>
            </li>
          ))}
        </ol>
      )}

      {proposal.status === "pending" ? (
        <div className="flex gap-2">
          <button
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void accept({ proposalId: proposal._id })
                .then((lessonId) => {
                  track("coach_proposal_accepted", { proposal_kind: p.kind });
                  if (lessonId) onOpenLesson(lessonId);
                })
                .finally(() => setBusy(false));
            }}
            className="inline-flex items-center gap-1 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            <Check size={16} /> {p.kind === "lesson" ? t("coach.acceptLesson") : t("coach.acceptUnit")}
          </button>
          <button
            disabled={busy}
            onClick={() => void dismiss({ proposalId: proposal._id })}
            className="inline-flex items-center gap-1 rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
          >
            <X size={16} /> {t("coach.dismiss")}
          </button>
        </div>
      ) : proposal.status === "accepted" ? (
        <div className="flex items-center gap-3 text-sm">
          <span className="text-green-700">✓ {t("coach.accepted")}</span>
          {proposal.createdLessonId && (
            <button onClick={() => onOpenLesson(proposal.createdLessonId!)} className="text-gray-700 underline underline-offset-4">
              {t("coach.open")}
            </button>
          )}
        </div>
      ) : (
        <p className="text-sm text-gray-400">{t("coach.dismissed")}</p>
      )}
    </div>
  );
}
