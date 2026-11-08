import { useTranslation } from "react-i18next";
import type { UiLocale } from "../../convex/lib/languages";
import { LocalePicker } from "../i18n/LocalePicker";
import { SignOut } from "../SignOut";

// Shown to signed-in users an admin hasn't approved yet.
export function WishlistPending({
  email,
  onLocaleChange,
}: {
  email: string | null;
  onLocaleChange: (locale: UiLocale) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">{t("app.title")}</h1>
        <h2 className="mb-2 text-lg font-semibold text-gray-900">{t("wishlist.pendingTitle")}</h2>
        <p className="text-sm text-gray-600">{t("wishlist.pendingBody")}</p>
        {email && <p className="mt-2 text-sm text-gray-600">{t("wishlist.pendingEmail", { email })}</p>}
      </div>
      <div className="flex gap-3">
        <LocalePicker onChange={onLocaleChange} />
        <SignOut />
      </div>
    </div>
  );
}
