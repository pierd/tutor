import { useMutation, useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { languageName } from "../i18n";

const NEW_PROFILE = "__new__";

export function ProfileSwitcher({
  active,
  onNewProfile,
}: {
  active: Doc<"profiles">;
  onNewProfile: () => void;
}) {
  const { t } = useTranslation();
  const profiles = useQuery(api.profiles.list) ?? [active];
  const setActive = useMutation(api.profiles.setActive);

  return (
    <select
      aria-label={t("profile.switchLabel")}
      value={active._id}
      onChange={(event) => {
        if (event.target.value === NEW_PROFILE) onNewProfile();
        else void setActive({ profileId: event.target.value as Id<"profiles"> });
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
