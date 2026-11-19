import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { strength } from "../../convex/lib/srs";
import { useMinuteClock } from "../lib/useMinuteClock";
import { ExpandIcon, ItemDetails } from "./study";

const KINDS = ["lemma", "chunk", "grammar", "glyph"] as const;
const MINUTE = 60 * 1000;

function useRelativeDue(now: number) {
  const { t, i18n } = useTranslation();
  return (item: Doc<"items">) => {
    if (item.reps === 0 && item.lapses === 0 && item.lastReviewedAt === undefined) return t("progress.new");
    const diff = item.due - now;
    if (diff <= 0) return t("progress.dueNow");
    const rtf = new Intl.RelativeTimeFormat(i18n.language, { numeric: "auto" });
    const hours = diff / (60 * MINUTE);
    const when = hours < 24 ? rtf.format(Math.round(hours), "hour") : rtf.format(Math.round(hours / 24), "day");
    return t("progress.dueIn", { when });
  };
}

// Items of a lesson (or all items), grouped by kind, with manual review.
// Tapping an item shows its details (forms, examples).
export function ItemList({ profileId, lessonId }: { profileId: Id<"profiles">; lessonId?: Id<"lessons"> }) {
  const { t } = useTranslation();
  const now = useMinuteClock();
  const items = useQuery(api.items.list, { profileId, lessonId });
  const review = useMutation(api.items.review);
  const relativeDue = useRelativeDue(now);
  const [expanded, setExpanded] = useState<Set<Id<"items">>>(new Set());
  const toggle = (itemId: Id<"items">) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(itemId)) next.add(itemId);
      return next;
    });

  if (items === undefined) return null;

  return (
    <div className="space-y-6">
      {items.length === 0 && (
        <p className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
          {t("progress.empty")}
        </p>
      )}

      {KINDS.map((kind) => {
        const group = items.filter((item) => item.kind === kind);
        if (group.length === 0) return null;
        return (
          <section key={kind}>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
              {t(`progress.kinds.${kind}`)} · {group.length}
            </h2>
            <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
              {group.map((item) => {
                const s = strength(item);
                const open = expanded.has(item._id);
                return (
                  <li key={item._id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <button
                      onClick={() => toggle(item._id)}
                      aria-expanded={open}
                      className="flex min-w-0 flex-1 items-start gap-1.5 text-left"
                    >
                      <span className="mt-1">
                        <ExpandIcon open={open} />
                      </span>
                      <span className="min-w-0">
                        <span className="block font-medium text-gray-900">{item.text}</span>
                        {item.gloss && <span className="block truncate text-sm text-gray-500">{item.gloss}</span>}
                      </span>
                    </button>
                    <div className="w-28" title={`${t("progress.strength")}: ${Math.round(s * 100)}%`}>
                      <div className="h-1.5 rounded-full bg-gray-100">
                        <div className="h-1.5 rounded-full bg-gray-900" style={{ width: `${Math.round(s * 100)}%` }} />
                      </div>
                      <p className="mt-1 text-xs text-gray-500">{relativeDue(item)}</p>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => void review({ itemId: item._id, outcome: "correct", source: "manual" })}
                        className="rounded-md px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-50"
                      >
                        {t("progress.knewIt")}
                      </button>
                      <button
                        onClick={() => void review({ itemId: item._id, outcome: "incorrect", source: "manual" })}
                        className="rounded-md px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                      >
                        {t("progress.didNot")}
                      </button>
                    </div>
                    {open && (
                      <div className="basis-full pl-6">
                        <ItemDetails item={item} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
