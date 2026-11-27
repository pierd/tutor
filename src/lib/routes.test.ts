import { describe, expect, test } from "vitest";
import { parseRoute, profilePath } from "./routes";

describe("routes", () => {
  test("parses every page", () => {
    expect(parseRoute("/")).toEqual({ kind: "home" });
    expect(parseRoute("/agents")).toEqual({ kind: "agents" });
    expect(parseRoute("/lab")).toEqual({ kind: "lab" });
    expect(parseRoute("/wishlist")).toEqual({ kind: "wishlist" });
    expect(parseRoute("/profiles/new")).toEqual({ kind: "newProfile" });
    expect(parseRoute("/p/abc")).toEqual({ kind: "profile", profileId: "abc" });
    expect(parseRoute("/p/abc/passive-cards")).toEqual({ kind: "profile", profileId: "abc", mode: "passiveCards" });
    expect(parseRoute("/p/abc/lessons/xyz")).toEqual({ kind: "profile", profileId: "abc", lessonId: "xyz", mode: undefined });
    expect(parseRoute("/p/abc/lessons/xyz/reading")).toEqual({
      kind: "profile",
      profileId: "abc",
      lessonId: "xyz",
      mode: "reading",
    });
  });

  test("unknown paths are notFound", () => {
    for (const path of ["/nope", "/p", "/p/abc/nope", "/p/abc/lessons", "/p/abc/lessons/xyz/nope", "/p/abc/lessons/xyz/say/x"]) {
      expect(parseRoute(path)).toEqual({ kind: "notFound" });
    }
  });

  test("profilePath round-trips", () => {
    for (const path of ["/p/abc", "/p/abc/flashcards", "/p/abc/lessons/xyz", "/p/abc/lessons/xyz/passive-study"]) {
      const route = parseRoute(path);
      if (route.kind !== "profile") throw new Error(path);
      expect(profilePath(route.profileId, route.lessonId, route.mode)).toBe(path);
    }
  });
});
