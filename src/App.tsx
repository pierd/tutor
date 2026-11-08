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
import { ProgressView } from "./progress/ProgressView";
import { VoiceLab } from "./voice/VoiceLab";

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

type Tab = "progress" | "lab";

function Content() {
  const { t } = useTranslation();
  const setUiLocale = useSyncedLocale();
  const profile = useQuery(api.profiles.getActive);
  const isAdmin = useQuery(api.admin.me)?.isAdmin ?? false;
  const [tab, setTab] = useState<Tab>("progress");
  const [creatingProfile, setCreatingProfile] = useState(false);

  if (profile === undefined) return null;
  // Admin-only tabs are also enforced server-side.
  const tabs: Tab[] = isAdmin ? ["progress", "lab"] : ["progress"];
  const activeTab = tabs.includes(tab) ? tab : "progress";

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
        {tabs.length > 1 && (
          <div className="inline-flex rounded-lg bg-gray-100 p-1">
            {tabs.map((key) => (
              <button
                key={key}
                type="button"
                className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === key ? "bg-gray-900 text-white shadow-sm" : "text-gray-700 hover:bg-gray-200"
                }`}
                onClick={() => setTab(key)}
              >
                {t(`nav.${key}`)}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-3">
          <LocalePicker onChange={(uiLocale) => void setUiLocale({ uiLocale })} />
          <SignOut />
        </div>
      </header>
      <main className="flex-1 bg-gray-50 p-6">
        {creatingProfile ? (
          <ProfileSetup onDone={() => setCreatingProfile(false)} />
        ) : activeTab === "lab" ? (
          <VoiceLab key={profile._id} profile={profile} />
        ) : (
          <ProgressView profile={profile} />
        )}
      </main>
    </div>
  );
}
