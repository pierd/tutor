import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";

export function SignIn() {
  const { signIn } = useAuthActions();
  const [step, setStep] = useState<"signUp" | "signIn">("signIn");
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <form
        className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-8 shadow-sm"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          void signIn("password", formData);
        }}
      >
        <h1 className="mb-6 text-center text-2xl font-bold text-gray-900">
          Tutor
        </h1>
        <div className="space-y-4">
          <input
            name="email"
            placeholder="Email"
            type="text"
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none transition-colors focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
          />
          <input
            name="password"
            placeholder="Password"
            type="password"
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none transition-colors focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
          />
          <input name="flow" type="hidden" value={step} />
          <button
            type="submit"
            className="w-full rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-gray-800"
          >
            {step === "signIn" ? "Sign in" : "Sign up"}
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
            {step === "signIn" ? "Sign up instead" : "Sign in instead"}
          </button>
        </div>
      </form>
    </div>
  );
}
