import { useState } from "react";
import {
  Authenticated,
  Unauthenticated,
  AuthLoading,
  useQuery,
} from "convex/react";
import { api } from "../convex/_generated/api";
import { SignIn } from "./SignIn";
import { SignOut } from "./SignOut";
import { WishlistPending } from "./Wishlist";
import { Admin } from "./Admin";
import FrenchVerbGame from "./dummy/practica-etre-avoir.jsx";
import FrenchErVerbsGame from "./dummy/practica-verbos-er.jsx";
import FrenchEssentialVerbsGame from "./dummy/practica-30-verbos.jsx";

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
        <Gate />
      </Authenticated>
    </>
  );
}

function Loading() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-lg font-medium text-gray-600">Loading...</div>
    </div>
  );
}

function Gate() {
  const me = useQuery(api.users.me);
  if (me === undefined) return <Loading />;
  if (me === null || !me.hasAccess) {
    return <WishlistPending email={me?.email ?? null} />;
  }
  return <Content isAdmin={me.isAdmin} />;
}

function Content({ isAdmin }: { isAdmin: boolean }) {
  const [game, setGame] = useState<
    "etre-avoir" | "verbs-er" | "verbs-essential" | "admin"
  >("etre-avoir");
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-6 py-4">
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
          <button
            type="button"
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              game === "verbs-essential"
                ? "bg-gray-900 text-white shadow-sm"
                : "text-gray-700 hover:bg-gray-200"
            }`}
            onClick={() => setGame("verbs-essential")}
          >
            30 verbos
          </button>
          {isAdmin && (
            <button
              type="button"
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                game === "admin"
                  ? "bg-gray-900 text-white shadow-sm"
                  : "text-gray-700 hover:bg-gray-200"
              }`}
              onClick={() => setGame("admin")}
            >
              Admin
            </button>
          )}
        </div>
        <SignOut />
      </header>
      <main className="flex-1 bg-gray-50 p-6">
        {game === "admin" && isAdmin ? (
          <Admin />
        ) : game === "etre-avoir" ? (
          <FrenchVerbGame />
        ) : game === "verbs-er" ? (
          <FrenchErVerbsGame />
        ) : (
          <FrenchEssentialVerbsGame />
        )}
      </main>
    </div>
  );
}
