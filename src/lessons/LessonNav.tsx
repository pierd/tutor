import { useMutation, useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { FlaskConical, Layers } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { useMinuteClock } from "../lib/useMinuteClock";

export type Selection = { kind: "everything" } | { kind: "lesson"; lessonId: Id<"lessons"> } | { kind: "lab" };

type Progress = { items: number; strength: number; due: number };

export function ProgressBar({ progress, className = "" }: { progress: Progress; className?: string }) {
  return (
    <div className={`h-1.5 rounded-full bg-gray-200 ${className}`}>
      <div
        className="h-1.5 rounded-full bg-gray-900 transition-all"
        style={{ width: `${Math.round(progress.strength * 100)}%` }}
      />
    </div>
  );
}

function Row({
  title,
  progress,
  active,
  onClick,
  indent = false,
}: {
  title: string;
  progress: Progress;
  active: boolean;
  onClick: () => void;
  indent?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-lg px-3 py-2 text-left transition-colors ${indent ? "pl-5" : ""} ${
        active ? "bg-gray-900 text-white" : "text-gray-800 hover:bg-gray-100"
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm font-medium">{title}</span>
        {progress.due > 0 && (
          <span className={`shrink-0 text-xs ${active ? "text-gray-300" : "text-amber-700"}`}>
            {t("nav.due", { count: progress.due })}
          </span>
        )}
      </div>
      <ProgressBar progress={progress} className={`mt-1.5 ${active ? "bg-gray-700 [&>div]:bg-white" : ""}`} />
    </button>
  );
}

export function LessonNav({
  profile,
  selection,
  onSelect,
  isAdmin,
}: {
  profile: Doc<"profiles">;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  isAdmin: boolean;
}) {
  const { t } = useTranslation();
  const now = useMinuteClock();
  const tree = useQuery(api.units.tree, { profileId: profile._id, now });
  const starter = useQuery(api.units.starterUnitFor, { profileId: profile._id });
  const addStarter = useMutation(api.units.addStarterUnit);

  if (tree === undefined) return null;

  return (
    <nav className="space-y-4">
      <Row
        title={t("nav.everything")}
        progress={tree.everything}
        active={selection.kind === "everything"}
        onClick={() => onSelect({ kind: "everything" })}
      />
      {tree.units.map((unit) => (
        <div key={unit._id} className="space-y-1">
          <div className="px-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <Layers size={12} /> <span className="truncate">{unit.title}</span>
              <span className="ml-auto font-normal normal-case">{Math.round(unit.progress.strength * 100)}%</span>
            </div>
            <ProgressBar progress={unit.progress} className="mt-1" />
          </div>
          {unit.lessons.map((lesson) => (
            <Row
              key={lesson._id}
              indent
              title={lesson.title}
              progress={lesson.progress}
              active={selection.kind === "lesson" && selection.lessonId === lesson._id}
              onClick={() => onSelect({ kind: "lesson", lessonId: lesson._id })}
            />
          ))}
        </div>
      ))}
      {starter && (
        <button
          onClick={() => void addStarter({ profileId: profile._id })}
          className="w-full rounded-lg border border-dashed border-gray-300 px-3 py-2 text-left text-sm text-gray-600 hover:bg-white"
        >
          {t("nav.addStarter", { title: starter.title })}
        </button>
      )}
      {isAdmin && (
        <button
          onClick={() => onSelect({ kind: "lab" })}
          className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm ${
            selection.kind === "lab" ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100"
          }`}
        >
          <FlaskConical size={14} /> {t("nav.lab")}
        </button>
      )}
    </nav>
  );
}
