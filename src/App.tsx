import { useEffect, useState } from "react";
import { Authenticated, Unauthenticated, AuthLoading, useMutation, useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../convex/_generated/api";
import { SignIn } from "./SignIn";
import { SignOut } from "./SignOut";
import { changeLocale, currentLocale } from "./i18n";
import { LocalePicker } from "./i18n/LocalePicker";
import { ProfileSetup } from "./profiles/ProfileSetup";
import { ProfileSwitcher } from "./profiles/ProfileSwitcher";
import { VoiceLab } from "./voice/VoiceLab";
import { LessonNav, type Selection } from "./lessons/LessonNav";
import { LessonView } from "./lessons/LessonView";
import { CoachChat } from "./coach/CoachChat";

export function App() {
  const { t } = useTranslation();
  return (
    <>
      <AuthLoading>
        <div className="flex h-screen items-center justify-center">
          <div className="text-lg font-medium text-gray-600">{t("app.authenticating")}</div>
        </div>
      </AuthLoading>
      <Unauthenticated>
        <SignIn />
      </Unauthenticated>
      <Authenticated>
        <Content />
      </Authenticated>
    </>
  );
}

// Applies the UI language saved on the server (e.g. chosen on another device).
function useSyncedLocale() {
  const settings = useQuery(api.settings.get);
  const saved = settings?.uiLocale;
  useEffect(() => {
    if (saved && saved !== currentLocale()) changeLocale(saved);
  }, [saved]);
  return useMutation(api.settings.setUiLocale);
}

function Content() {
  const { t } = useTranslation();
  const setUiLocale = useSyncedLocale();
  const profile = useQuery(api.profiles.getActive);
  const isAdmin = useQuery(api.admin.me)?.isAdmin ?? false;
  // Remembered per profile so switching profiles doesn't keep a foreign lesson.
  const [picked, setPicked] = useState<{ profileId: string; selection: Selection } | null>(null);
  const [creatingProfile, setCreatingProfile] = useState(false);

  if (profile === undefined) return null;
  const selection: Selection =
    profile && picked?.profileId === profile._id ? picked.selection : { kind: "everything" };

  if (profile === null) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50 px-4">
        <ProfileSetup />
        <div className="flex gap-3">
          <LocalePicker onChange={(uiLocale) => void setUiLocale({ uiLocale })} />
          <SignOut />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center gap-4">
          <div className="text-xl font-bold text-gray-900">{t("app.title")}</div>
          <ProfileSwitcher active={profile} onNewProfile={() => setCreatingProfile(true)} />
        </div>
        <div className="flex items-center gap-3">
          <LocalePicker onChange={(uiLocale) => void setUiLocale({ uiLocale })} />
          <SignOut />
        </div>
      </header>
      <div className="flex flex-1 flex-col bg-gray-50 md:flex-row">
        <aside className="border-b border-gray-200 p-4 md:w-72 md:shrink-0 md:border-r md:border-b-0">
          <LessonNav
            key={profile._id}
            profile={profile}
            selection={selection}
            onSelect={(s) => {
              setCreatingProfile(false);
              setPicked({ profileId: profile._id, selection: s });
            }}
            isAdmin={isAdmin}
          />
        </aside>
        <main className="flex-1 p-6">
          {creatingProfile ? (
            <ProfileSetup onDone={() => setCreatingProfile(false)} />
          ) : selection.kind === "coach" ? (
            <CoachChat
              key={profile._id}
              profile={profile}
              onOpenLesson={(lessonId) => setPicked({ profileId: profile._id, selection: { kind: "lesson", lessonId } })}
            />
          ) : selection.kind === "lab" && isAdmin ? (
            <VoiceLab key={profile._id} profile={profile} />
          ) : (
            <LessonView
              key={`${profile._id}:${selection.kind === "lesson" ? selection.lessonId : "all"}`}
              profile={profile}
              lessonId={selection.kind === "lesson" ? selection.lessonId : undefined}
            />
          )}
        </main>
      </div>
    </div>
  );
}
