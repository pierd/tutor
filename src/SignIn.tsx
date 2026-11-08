import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LocalePicker } from "./i18n/LocalePicker";

export function SignIn() {
  const { signIn } = useAuthActions();
  const { t } = useTranslation();
  const [step, setStep] = useState<"signUp" | "signIn">("signIn");
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50 px-4">
      <form
        className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-8 shadow-sm"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          void signIn("password", formData);
        }}
      >
        <h1 className="mb-6 text-center text-2xl font-bold text-gray-900">
          {t("app.title")}
        </h1>
        {step === "signUp" && (
          <p className="-mt-3 mb-6 text-center text-sm text-gray-500">{t("auth.wishlistIntro")}</p>
        )}
        <div className="space-y-4">
          <input
            name="email"
            placeholder={t("auth.email")}
            type="text"
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none transition-colors focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
          />
          <input
            name="password"
            placeholder={t("auth.password")}
            type="password"
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none transition-colors focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
          />
          <input name="flow" type="hidden" value={step} />
          <button
            type="submit"
            className="w-full rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-gray-800"
          >
            {step === "signIn" ? t("auth.signIn") : t("auth.signUp")}
          </button>
        </div>
        <div className="mt-6 text-center">
          <button
            type="button"
            className="text-sm text-gray-500 underline decoration-gray-300 underline-offset-4 transition-colors hover:text-gray-900 hover:decoration-gray-900"
            onClick={() => {
              setStep(step === "signIn" ? "signUp" : "signIn");
            }}
          >
            {step === "signIn" ? t("auth.signUpInstead") : t("auth.signInInstead")}
          </button>
        </div>
      </form>
      <LocalePicker />
    </div>
  );
}
