import { useState } from "react";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { SignIn } from "./SignIn";
import { SignOut } from "./SignOut";
import FrenchVerbGame from "./dummy/practica-etre-avoir.jsx";
import FrenchErVerbsGame from "./dummy/practica-verbos-er.jsx";

export function App() {
  return (
    <>
      <AuthLoading>
        <div className="flex h-screen items-center justify-center">
          <div className="text-lg font-medium text-gray-600">Authenticating...</div>
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

function Content() {
  const [game, setGame] = useState<"etre-avoir" | "verbs-er">("etre-avoir");
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
        <div className="text-xl font-bold text-gray-900">Tutor</div>
        <div className="inline-flex rounded-lg bg-gray-100 p-1">
          <button
            type="button"
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              game === "etre-avoir"
                ? "bg-gray-900 text-white shadow-sm"
                : "text-gray-700 hover:bg-gray-200"
            }`}
            onClick={() => setGame("etre-avoir")}
          >
            etre / avoir
          </button>
          <button
            type="button"
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              game === "verbs-er"
                ? "bg-gray-900 text-white shadow-sm"
                : "text-gray-700 hover:bg-gray-200"
            }`}
            onClick={() => setGame("verbs-er")}
          >
            -er verbs
          </button>
        </div>
        <SignOut />
      </header>
      <main className="flex-1 bg-gray-50 p-6">
        {game === "etre-avoir" ? <FrenchVerbGame /> : <FrenchErVerbsGame />}
      </main>
    </div>
  );
}
