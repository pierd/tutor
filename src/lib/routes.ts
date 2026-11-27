// The app's URLs. Paths:
//   /                                   → redirects to the active profile
//   /p/<profileId>[/<mode>]             → Everything (optionally a practice mode)
//   /p/<profileId>/lessons/<lessonId>[/<mode>]
//   /profiles/new, /agents, /lab (admin), /wishlist (admin)

export type Mode = "flashcards" | "say" | "reading" | "sentences" | "passiveCards" | "passiveStudy";

const MODE_SLUGS: Record<Mode, string> = {
  flashcards: "flashcards",
  say: "say",
  reading: "reading",
  sentences: "sentences",
  passiveCards: "passive-cards",
  passiveStudy: "passive-study",
};

const modeFromSlug = (slug: string | undefined): Mode | undefined =>
  (Object.keys(MODE_SLUGS) as Mode[]).find((mode) => MODE_SLUGS[mode] === slug);

export type Route =
  | { kind: "home" }
  | { kind: "profile"; profileId: string; lessonId?: string; mode?: Mode }
  | { kind: "newProfile" }
  | { kind: "agents" }
  | { kind: "lab" }
  | { kind: "wishlist" }
  | { kind: "notFound" };

export function parseRoute(path: string): Route {
  const parts = path.split("/").filter(Boolean).map(decodeURIComponent);
  if (parts.length === 0) return { kind: "home" };
  if (parts.length === 1) {
    if (parts[0] === "agents") return { kind: "agents" };
    if (parts[0] === "lab") return { kind: "lab" };
    if (parts[0] === "wishlist") return { kind: "wishlist" };
  }
  if (parts.length === 2 && parts[0] === "profiles" && parts[1] === "new") return { kind: "newProfile" };
  if (parts[0] === "p" && parts[1]) {
    const [, profileId, ...rest] = parts;
    if (rest.length === 0) return { kind: "profile", profileId };
    if (rest.length === 1 && modeFromSlug(rest[0])) return { kind: "profile", profileId, mode: modeFromSlug(rest[0]) };
    if (rest[0] === "lessons" && rest[1] && rest.length <= 3) {
      const mode = modeFromSlug(rest[2]);
      if (rest[2] === undefined || mode) return { kind: "profile", profileId, lessonId: rest[1], mode };
    }
  }
  return { kind: "notFound" };
}

export function profilePath(profileId: string, lessonId?: string, mode?: Mode): string {
  let path = `/p/${encodeURIComponent(profileId)}`;
  if (lessonId) path += `/lessons/${encodeURIComponent(lessonId)}`;
  if (mode) path += `/${MODE_SLUGS[mode]}`;
  return path;
}
