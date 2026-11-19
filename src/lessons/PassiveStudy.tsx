import { useMemo } from "react";
import { useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { Slideshow, type Speed } from "./Slideshow";
import { DetailsView } from "./study";

// Time per slide: a base plus time per word to read (ms).
const TIMINGS: Record<Speed, { base: number; perWord: number }> = {
  slow: { base: 10000, perWord: 500 },
  normal: { base: 6000, perWord: 300 },
  fast: { base: 4000, perWord: 180 },
};

const countWords = (text?: string) => (text ? text.split(/\s+/).filter(Boolean).length : 0);

// Roughly how much there is to read on an item's slide.
function words(item: Doc<"items">) {
  const d = item.details;
  return (
    countWords(item.text) +
    countWords(item.gloss) +
    countWords(d?.explanation) +
    (d?.facts ?? []).reduce((n, f) => n + countWords(f.label) + countWords(f.value), 0) +
    (d?.tables ?? []).reduce((n, table) => n + table.rows.flat().reduce((m, cell) => m + countWords(cell), 0), 0) +
    (d?.examples ?? []).reduce((n, e) => n + countWords(e.text) + countWords(e.translation), 0)
  );
}

// Passive learning: each item's study details in turn, shown long enough to
// read, in a loop. Nothing is graded or recorded.
export function PassiveStudy({ profileId, lessonId }: { profileId: Id<"profiles">; lessonId?: Id<"lessons"> }) {
  const { t } = useTranslation();
  const all = useQuery(api.items.list, { profileId, lessonId });
  const items = useMemo(() => all?.filter((item) => !item.suspended), [all]);

  return (
    <div className="space-y-3">
      {items && items.length > 0 && !items.some((item) => item.details) && (
        <p className="text-sm text-gray-500">{t("passive.noDetails")}</p>
      )}
      <Slideshow
        slides={items}
        duration={(item, _phase, speed) => TIMINGS[speed].base + words(item) * TIMINGS[speed].perWord}
        empty={<p className="text-sm text-gray-500">{t("progress.empty")}</p>}
        render={(item) => (
          <div className="space-y-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400">{t(`progress.kinds.${item.kind}`)}</p>
              <p className="mt-1 text-3xl font-bold text-gray-900">{item.text}</p>
              {item.gloss && <p className="mt-1 text-lg text-gray-600">{item.gloss}</p>}
            </div>
            {item.details && (
              <div className="space-y-3 text-sm text-gray-700">
                <DetailsView details={item.details} />
              </div>
            )}
            {item.notes && <p className="text-sm text-gray-500">{item.notes}</p>}
          </div>
        )}
      />
    </div>
  );
}
