import { useAuthActions } from "@convex-dev/auth/react";
import { useTranslation } from "react-i18next";

export function SignOut() {
  const { signOut } = useAuthActions();
  const { t } = useTranslation();
  return (
    <button
      className="rounded-lg bg-red-50 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-100"
      onClick={() => void signOut()}
    >
      {t("auth.signOut")}
    </button>
  );
}
