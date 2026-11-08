import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, BookOpen, Layers, Loader2, Mic, Sparkles } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { useMinuteClock } from "../lib/useMinuteClock";
import { Flashcards } from "./Flashcards";
import { ItemList } from "./ItemList";
import { ProgressBar } from "./LessonNav";
import { Reading } from "./Reading";
import { SayWord } from "./SayWord";
import { TranslationLesson } from "./TranslationLesson";

type Mode = "flashcards" | "say" | "reading" | "sentences";

const MODES: { mode: Mode; icon: typeof Layers; ai: boolean }[] = [
  { mode: "flashcards", icon: Layers, ai: false },
  { mode: "say", icon: Mic, ai: false },
  { mode: "reading", icon: BookOpen, ai: true },
  { mode: "sentences", icon: Sparkles, ai: true },
];

// One lesson (or "Everything"): progress, practice modes, and its items.
export function LessonView({ profile, lessonId }: { profile: Doc<"profiles">; lessonId?: Id<"lessons"> }) {
  const { t } = useTranslation();
  const now = useMinuteClock();
  const [mode, setMode] = useState<Mode | null>(null);
  const lesson = useQuery(api.units.getLesson, lessonId ? { lessonId } : "skip");
  const tree = useQuery(api.units.tree, { profileId: profile._id, now });
  const readings = useQuery(api.reading.history, { profileId: profile._id, lessonId });
  const rebuild = useMutation(api.coach.rebuildLesson);

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

      {lesson?.status === "building" ? (
        <p className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white p-6 text-gray-500">
          <Loader2 size={18} className="animate-spin" /> {t("lessonStatus.building")}
        </p>
      ) : lesson?.status === "failed" ? (
        <div className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-6">
          <p className="text-sm text-red-700">{t("lessonStatus.buildFailed")}</p>
          {lesson.error && <p className="text-xs text-red-500">{lesson.error}</p>}
          <button
            onClick={() => void rebuild({ lessonId: lesson._id })}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm"
          >
            {t("lessonStatus.retry")}
          </button>
        </div>
      ) : mode === null ? (
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
                  {m === "reading" && readings && readings.length > 0 && (
                    <span className="ml-auto text-xs font-normal text-gray-500">
                      {t("modes.reading.count", { count: readings.length })}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-gray-500">{t(`modes.${m}.description`)}</p>
              </button>
            ))}
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
          ) : mode === "reading" ? (
            <Reading profile={profile} lessonId={lessonId} />
          ) : (
            <TranslationLesson profile={profile} lessonId={lessonId} />
          )}
        </div>
      )}
    </div>
  );
}
