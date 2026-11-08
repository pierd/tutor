import { useState } from "react";
import { useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, BookOpen, Layers, Mic, Sparkles } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { useMinuteClock } from "../lib/useMinuteClock";
import { Flashcards } from "./Flashcards";
import { ItemList } from "./ItemList";
import { ProgressBar } from "./LessonNav";
import { SayWord } from "./SayWord";
import { TranslationLesson } from "./TranslationLesson";

type Mode = "flashcards" | "say" | "sentences";

const MODES: { mode: Mode; icon: typeof Layers; ai: boolean }[] = [
  { mode: "flashcards", icon: Layers, ai: false },
  { mode: "say", icon: Mic, ai: false },
  { mode: "sentences", icon: Sparkles, ai: true },
];

// One lesson (or "Everything"): progress, practice modes, and its items.
export function LessonView({ profile, lessonId }: { profile: Doc<"profiles">; lessonId?: Id<"lessons"> }) {
  const { t } = useTranslation();
  const now = useMinuteClock();
  const [mode, setMode] = useState<Mode | null>(null);
  const lesson = useQuery(api.units.getLesson, lessonId ? { lessonId } : "skip");
  const tree = useQuery(api.units.tree, { profileId: profile._id, now });

  const progress = lessonId
    ? tree?.units.flatMap((u) => u.lessons).find((l) => l._id === lessonId)?.progress
    : tree?.everything;
  const title = lessonId ? lesson?.title : t("nav.everything");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        {lesson && <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{lesson.unitTitle}</p>}
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        {!lessonId && profile.goal && <p className="mt-1 text-sm text-gray-500">{profile.goal}</p>}
        {lesson?.description && <p className="mt-1 text-sm text-gray-500">{lesson.description}</p>}
        {progress && (
          <div className="mt-3 flex items-center gap-3">
            <ProgressBar progress={progress} className="max-w-xs flex-1" />
            <span className="text-sm text-gray-600">
              {Math.round(progress.strength * 100)}% · {t("progress.itemCount", { count: progress.items })}
              {progress.due > 0 && <> · {t("progress.dueCount", { count: progress.due })}</>}
            </span>
          </div>
        )}
      </header>

      {mode === null ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {MODES.map(({ mode: m, icon: Icon, ai }) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className="rounded-xl border border-gray-200 bg-white p-4 text-left transition-colors hover:border-gray-900"
              >
                <div className="flex items-center gap-2 font-semibold text-gray-900">
                  <Icon size={18} /> {t(`modes.${m}.title`)}
                  {ai && <span className="rounded bg-violet-100 px-1.5 py-0.5 text-xs font-medium text-violet-700">AI</span>}
                </div>
                <p className="mt-1 text-sm text-gray-500">{t(`modes.${m}.description`)}</p>
              </button>
            ))}
            <div className="rounded-xl border border-dashed border-gray-200 p-4 text-left text-gray-400">
              <div className="flex items-center gap-2 font-semibold">
                <BookOpen size={18} /> {t("modes.reading.title")}
              </div>
              <p className="mt-1 text-sm">{t("modes.reading.soon")}</p>
            </div>
          </div>
          <ItemList profileId={profile._id} lessonId={lessonId} />
        </>
      ) : (
        <div className="space-y-4">
          <button onClick={() => setMode(null)} className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900">
            <ArrowLeft size={16} /> {t("modes.back")}
          </button>
          {mode === "flashcards" ? (
            <Flashcards profileId={profile._id} lessonId={lessonId} />
          ) : mode === "say" ? (
            <SayWord profileId={profile._id} lessonId={lessonId} />
          ) : (
            <TranslationLesson profile={profile} lessonId={lessonId} />
          )}
        </div>
      )}
    </div>
  );
}
