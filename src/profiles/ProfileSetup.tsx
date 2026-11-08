import { useState } from "react";
import { useMutation } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../convex/_generated/api";
import { BASE_LANGUAGES, TARGET_LANGUAGES } from "../../convex/lib/languages";
import { currentLocale, languageName } from "../i18n";
import { track } from "../lib/posthog";

const inputClass =
  "w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none transition-colors focus:border-gray-900 focus:ring-1 focus:ring-gray-900";

export function ProfileSetup({ onDone }: { onDone?: () => void }) {
  const { t } = useTranslation();
  const createProfile = useMutation(api.profiles.create);
  const [baseLang, setBaseLang] = useState<string>(currentLocale());
  const [targetLang, setTargetLang] = useState<string>(
    TARGET_LANGUAGES.find((l) => l.code !== currentLocale())!.code,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isFirst = onDone === undefined;

  return (
    <form
      className="mx-auto w-full max-w-md rounded-xl border border-gray-200 bg-white p-8 shadow-sm"
      onSubmit={(event) => {
        event.preventDefault();
        if (baseLang === targetLang) {
          setError(t("profile.sameLanguage"));
          return;
        }
        const formData = new FormData(event.currentTarget);
        setBusy(true);
        createProfile({
          name: String(formData.get("name") ?? ""),
          goal: String(formData.get("goal") ?? ""),
          baseLang,
          targetLang,
        })
          .then(() => {
            track("profile_created", { base_language: baseLang, target_language: targetLang, is_first_profile: isFirst });
            onDone?.();
          })
          .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
          .finally(() => setBusy(false));
      }}
    >
      <h1 className="text-xl font-bold text-gray-900">
        {isFirst ? t("profile.setupTitle") : t("profile.newTitle")}
      </h1>
      {isFirst && <p className="mt-2 text-sm text-gray-500">{t("profile.setupIntro")}</p>}
      <div className="mt-6 space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">{t("profile.targetLang")}</span>
          <select className={inputClass} value={targetLang} onChange={(e) => setTargetLang(e.target.value)}>
            {TARGET_LANGUAGES.map(({ code }) => (
              <option key={code} value={code}>
                {languageName(code)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">{t("profile.baseLang")}</span>
          <select className={inputClass} value={baseLang} onChange={(e) => setBaseLang(e.target.value)}>
            {BASE_LANGUAGES.map((code) => (
              <option key={code} value={code}>
                {languageName(code)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">{t("profile.name")}</span>
          <input name="name" required placeholder={t("profile.namePlaceholder")} className={inputClass} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">{t("profile.goal")}</span>
          <textarea name="goal" rows={2} placeholder={t("profile.goalPlaceholder")} className={inputClass} />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={busy}
            className="flex-1 rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-50"
          >
            {t("profile.create")}
          </button>
          {!isFirst && (
            <button
              type="button"
              onClick={onDone}
              className="rounded-lg px-4 py-3 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100"
            >
              {t("profile.cancel")}
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
