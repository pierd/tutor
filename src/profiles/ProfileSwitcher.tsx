import { useTranslation } from "react-i18next";
import type { Doc } from "../../convex/_generated/dataModel";
import { languageName } from "../i18n";
import { navigate } from "../lib/router";
import { profilePath } from "../lib/routes";

const NEW_PROFILE = "__new__";

// Switching opens the profile's URL; the app then makes it the active one.
export function ProfileSwitcher({ profiles, active }: { profiles: Doc<"profiles">[]; active: Doc<"profiles"> }) {
  const { t } = useTranslation();

  return (
    <select
      aria-label={t("profile.switchLabel")}
      value={active._id}
      onChange={(event) => {
        navigate(event.target.value === NEW_PROFILE ? "/profiles/new" : profilePath(event.target.value));
      }}
      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 outline-none focus:border-gray-900"
    >
      {profiles.map((profile) => (
        <option key={profile._id} value={profile._id}>
          {profile.name} · {languageName(profile.targetLang)}
        </option>
      ))}
      <option value={NEW_PROFILE}>{t("profile.newProfile")}</option>
    </select>
  );
}
