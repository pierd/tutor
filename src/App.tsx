import { useEffect, useRef, useState } from "react";
import { Authenticated, Unauthenticated, AuthLoading, useMutation } from "convex/react";
import { useQuery } from "./lib/useQuery";
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
import { CoachPanel } from "./coach/CoachPanel";
import { CoachButton } from "./coach/AskCoach";
import { AskCoachContext, topicKey, type CoachTopic } from "./coach/askCoachContext";
import { WishlistPending } from "./wishlist/WishlistPending";
import { WishlistAdmin } from "./wishlist/WishlistAdmin";
import { identify, resetAnalytics, track } from "./lib/posthog";

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
        <Gate />
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

// Users still on the wishlist only get the waiting page; the server enforces
// the same rule (requireUserId), this just avoids calling gated functions.
function Gate() {
  const setUiLocale = useSyncedLocale();
  const status = useQuery(api.wishlist.status);
  const statusUserId = status?.userId;
  const statusEmail = status?.email;
  const identifiedUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!statusUserId || identifiedUserId.current === statusUserId) return;

    if (identifiedUserId.current) resetAnalytics();
    identify(statusUserId, statusEmail ?? null);
    identifiedUserId.current = statusUserId;
  }, [statusUserId, statusEmail]);

  if (status === undefined) return null;
  if (status === null || !status.hasAccess) {
    return (
      <WishlistPending
        email={status?.email ?? null}
        onLocaleChange={(uiLocale) => void setUiLocale({ uiLocale })}
      />
    );
  }
  return <Content setUiLocale={setUiLocale} />;
}

function Content({ setUiLocale }: { setUiLocale: ReturnType<typeof useSyncedLocale> }) {
  const { t } = useTranslation();
  const profile = useQuery(api.profiles.getActive);
  const isAdmin = useQuery(api.admin.me)?.isAdmin ?? false;
  // Remembered per profile so switching profiles doesn't keep a foreign lesson.
  const [picked, setPicked] = useState<{ profileId: string; selection: Selection } | null>(null);
  const [creatingProfile, setCreatingProfile] = useState(false);
  // The coach side panel, also remembered per profile. `threadId` null with
  // the panel open is a new conversation (about `topic`, if set).
  const [coach, setCoach] = useState<{
    profileId: string;
    open: boolean;
    threadId: string | null;
    topic?: CoachTopic;
    // topicKey of the button that started the shown conversation, if any.
    openedBy?: string;
  } | null>(null);

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

  const select = (s: Selection) => setPicked({ profileId: profile._id, selection: s });
  const coachState = coach?.profileId === profile._id ? coach : null;
  const openCoach = (threadId: string | null, topic?: CoachTopic) =>
    setCoach({ profileId: profile._id, open: true, threadId, topic });
  const closeCoach = () => coachState && setCoach({ ...coachState, open: false });
  const openedBy = coachState?.open ? (coachState.openedBy ?? null) : null;
  const ask = (topic?: CoachTopic) => {
    const key = topicKey(topic);
    if (openedBy === key) return closeCoach();
    setCoach({ profileId: profile._id, open: true, threadId: null, topic, openedBy: key });
  };

  return (
    <AskCoachContext value={{ ask, openedBy }}>
      <div className="flex min-h-screen flex-col md:h-screen">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-6 py-4">
          <div className="flex items-center gap-4">
            <div className="text-xl font-bold text-gray-900">{t("app.title")}</div>
            <ProfileSwitcher active={profile} onNewProfile={() => setCreatingProfile(true)} />
          </div>
          <div className="flex items-center gap-3">
            <CoachButton
              active={coachState?.open}
              className="py-2"
              onClick={() => {
                if (coachState?.open) return closeCoach();
                track("coach_opened", { source: "header" });
                openCoach(coachState?.threadId ?? null, coachState?.topic);
              }}
            >
              {t("coach.title")}
            </CoachButton>
            <LocalePicker onChange={(uiLocale) => void setUiLocale({ uiLocale })} />
            <SignOut />
          </div>
        </header>
        <div className="relative flex flex-1 flex-col bg-gray-50 md:min-h-0 md:flex-row">
          <aside className="border-b border-gray-200 p-4 md:w-72 md:shrink-0 md:overflow-y-auto md:border-r md:border-b-0">
            <LessonNav
              key={profile._id}
              profile={profile}
              selection={selection}
              onSelect={(s) => {
                setCreatingProfile(false);
                select(s);
              }}
              isAdmin={isAdmin}
            />
          </aside>
          <main className="min-w-0 flex-1 p-6 md:overflow-y-auto">
            {creatingProfile ? (
              <ProfileSetup onDone={() => setCreatingProfile(false)} />
            ) : selection.kind === "lab" && isAdmin ? (
              <VoiceLab key={profile._id} profile={profile} />
            ) : selection.kind === "wishlist" && isAdmin ? (
              <WishlistAdmin />
            ) : (
              <LessonView
                key={`${profile._id}:${selection.kind === "lesson" ? selection.lessonId : "all"}`}
                profile={profile}
                lessonId={selection.kind === "lesson" ? selection.lessonId : undefined}
              />
            )}
          </main>
          {coachState?.open && (
            <CoachPanel
              profile={profile}
              threadId={coachState.threadId}
              topic={coachState.topic}
              onSelectThread={(threadId) => openCoach(threadId)}
              onStarted={(threadId) => setCoach({ ...coachState, threadId, topic: undefined })}
              onClose={closeCoach}
              onOpenLesson={(lessonId) => {
                setCreatingProfile(false);
                select({ kind: "lesson", lessonId });
                // On phones the panel covers the page.
                if (!window.matchMedia("(min-width: 768px)").matches) closeCoach();
              }}
            />
          )}
        </div>
      </div>
    </AskCoachContext>
  );
}
