import { useState } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "../lib/useQuery";
import { useTranslation } from "react-i18next";
import { BookText, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { track } from "../lib/posthog";
import { AskCoachButton, CoachButton } from "../coach/AskCoach";

// Study material written by the coach: item details and lesson notes.

type Table = { title?: string; header?: string[]; rows: string[][] };
type Example = { text: string; translation: string };

function Paragraphs({ text, className = "" }: { text: string; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {text
        .split(/\n\s*\n/)
        .filter((p) => p.trim())
        .map((p, i) => (
          <p key={i} className="whitespace-pre-line">
            {p}
          </p>
        ))}
    </div>
  );
}

function Tables({ tables }: { tables: Table[] }) {
  return (
    <div className="flex flex-wrap gap-3">
      {tables.map((table, i) => (
        <div key={i} className="overflow-x-auto rounded-lg border border-gray-200">
          {table.title && <p className="bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-700">{table.title}</p>}
          <table className="text-sm">
            {table.header && (
              <thead>
                <tr>
                  {table.header.map((cell, j) => (
                    <th key={j} className="px-3 py-1 text-left text-xs font-medium text-gray-500">
                      {cell}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {table.rows.map((row, j) => (
                <tr key={j} className="border-t border-gray-100">
                  {row.map((cell, k) => (
                    <td key={k} className={`px-3 py-1 ${k === 0 ? "text-gray-500" : "font-medium text-gray-900"}`}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function Examples({ examples }: { examples: Example[] }) {
  return (
    <ul className="space-y-1">
      {examples.map((example, i) => (
        <li key={i} className="text-sm">
          <span className="font-medium text-gray-900">{example.text}</span>
          <span className="text-gray-500"> — {example.translation}</span>
        </li>
      ))}
    </ul>
  );
}

export function DetailsView({ details }: { details: NonNullable<Doc<"items">["details"]> }) {
  return (
    <>
      {details.facts && details.facts.length > 0 && (
        <dl className="flex flex-wrap gap-x-4 gap-y-1">
          {details.facts.map((fact, i) => (
            <div key={i} className="flex gap-1">
              <dt className="text-gray-500">{fact.label}:</dt>
              <dd className="font-medium text-gray-900">{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {details.explanation && <Paragraphs text={details.explanation} />}
      {details.tables && details.tables.length > 0 && <Tables tables={details.tables} />}
      {details.examples && details.examples.length > 0 && <Examples examples={details.examples} />}
    </>
  );
}

export function GuideSections({ guide }: { guide: NonNullable<Doc<"lessons">["guide"]> }) {
  return (
    <>
      {guide.sections.map((section, i) => (
        <div key={i} className="space-y-3">
          <h3 className="font-semibold text-gray-900">{section.heading}</h3>
          <Paragraphs text={section.body} className="text-sm text-gray-700" />
          {section.tables && section.tables.length > 0 && <Tables tables={section.tables} />}
          {section.examples && section.examples.length > 0 && <Examples examples={section.examples} />}
        </div>
      ))}
    </>
  );
}

// Expanded view of one item: facts, forms, examples, or a button to have the
// coach write them; and a button to ask the coach about the item.
export function ItemDetails({ item }: { item: Doc<"items"> }) {
  const { t } = useTranslation();
  const fill = useMutation(api.study.fillItem);
  const details = item.details;

  return (
    <div className="space-y-3 text-sm text-gray-700">
      {details ? (
        <DetailsView details={details} />
      ) : item.detailsStatus === "writing" ? (
        <p className="flex items-center gap-2 text-gray-500">
          <Loader2 size={14} className="animate-spin" /> {t("study.itemWriting")}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-gray-500">{item.detailsStatus === "failed" ? t("study.itemFailed") : t("study.itemMissing")}</span>
          <FillButton
            onClick={() => {
              track("study_fill_requested", { scope: "item" });
              void fill({ itemId: item._id });
            }}
          />
        </div>
      )}
      {item.notes && <p className="text-gray-500">{item.notes}</p>}
      <AskCoachButton topic={{ focus: { kind: "item", itemId: item._id }, label: item.text }} />
    </div>
  );
}

function FillButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return <CoachButton onClick={onClick}>{t("study.fill")}</CoachButton>;
}

// The lesson's read-through notes, plus a prompt to fill in whatever study
// material is missing (notes or item details).
export function LessonGuide({ lesson, profileId }: { lesson: Doc<"lessons">; profileId: Id<"profiles"> }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const items = useQuery(api.items.list, { profileId, lessonId: lesson._id });
  const fill = useMutation(api.study.fillLesson);

  if (items === undefined) return null;
  const missingDetails = items.filter((item) => !item.details).length;
  const guide = lesson.guide;

  return (
    <div className="space-y-3">
      {lesson.guideStatus === "writing" ? (
        <p className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-500">
          <Loader2 size={16} className="animate-spin" /> {t("study.writing")}
        </p>
      ) : (
        (!guide || missingDetails > 0) && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-violet-300 bg-white p-4">
            <div className="text-sm text-gray-600">
              {lesson.guideStatus === "failed" && <p className="text-red-700">{t("study.failed")}</p>}
              {!guide && <p>{t("study.missingGuide")}</p>}
              {missingDetails > 0 && <p>{t("study.missingDetails", { count: missingDetails })}</p>}
            </div>
            <FillButton
              onClick={() => {
                track("study_fill_requested", { scope: "lesson", missing_details: missingDetails, missing_guide: !guide });
                void fill({ lessonId: lesson._id });
              }}
            />
          </div>
        )
      )}

      {guide && (
        <section className="rounded-xl border border-gray-200 bg-white">
          <button
            onClick={() => setOpen((o) => !o)}
            className="flex w-full items-center gap-2 px-4 py-3 text-left font-semibold text-gray-900"
          >
            <BookText size={18} /> {t("study.notesTitle")}
            {!open && (
              <span className="min-w-0 flex-1 truncate text-sm font-normal text-gray-500">
                {guide.sections.map((s) => s.heading).join(" · ")}
              </span>
            )}
            <ChevronDown size={18} className={`ml-auto shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
          {open && (
            <div className="space-y-6 border-t border-gray-100 px-4 py-4">
              <GuideSections guide={guide} />
              <AskCoachButton
                topic={{ focus: { kind: "guide", lessonId: lesson._id }, label: `${t("study.notesTitle")} · ${lesson.title}` }}
              />
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export function ExpandIcon({ open }: { open: boolean }) {
  return open ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />;
}
