import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { strength } from "../../convex/lib/srs";

const KINDS = ["lemma", "chunk", "grammar", "glyph"] as const;
const MINUTE = 60 * 1000;

// Current time rounded to the minute, so time-based queries stay cacheable.
function useMinuteClock() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / MINUTE) * MINUTE);
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / MINUTE) * MINUTE), MINUTE);
    return () => clearInterval(id);
  }, []);
  return now;
}

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

export function ProgressView({ profile }: { profile: Doc<"profiles"> }) {
  const { t } = useTranslation();
  const now = useMinuteClock();
  const items = useQuery(api.items.list, { profileId: profile._id });
  const due = useQuery(api.items.due, { profileId: profile._id, now });
  const starter = useQuery(api.items.starterSetFor, { profileId: profile._id });
  const addStarterSet = useMutation(api.items.addStarterSet);
  const review = useMutation(api.items.review);
  const relativeDue = useRelativeDue(now);

  if (items === undefined) return null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{profile.name}</h1>
          {profile.goal && <p className="mt-1 text-sm text-gray-500">{profile.goal}</p>}
          <p className="mt-1 text-sm text-gray-600">
            {t("progress.itemCount", { count: items.length })}
            {due !== undefined && due.length > 0 && <> · {t("progress.dueCount", { count: due.length })}</>}
          </p>
        </div>
        {starter && (
          <button
            onClick={() => void addStarterSet({ profileId: profile._id, set: starter.set })}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
          >
            {t("progress.addStarter", { count: starter.count })}
          </button>
        )}
      </div>

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
                return (
                  <li key={item._id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900">{item.text}</p>
                      {item.gloss && <p className="truncate text-sm text-gray-500">{item.gloss}</p>}
                    </div>
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
