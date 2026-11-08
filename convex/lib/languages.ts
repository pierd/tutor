import { v } from "convex/values";

// Shared by the backend and the frontend (src/ imports this file directly).

export const UI_LOCALES = ["en", "es", "pl"] as const;
export type UiLocale = (typeof UI_LOCALES)[number];
export const uiLocaleValidator = v.union(
  v.literal("en"),
  v.literal("es"),
  v.literal("pl"),
);

// Languages a learner can learn *from*. Kept equal to the UI locales so the
// app chrome and AI-generated explanations can share a language.
export const BASE_LANGUAGES: readonly string[] = UI_LOCALES;

export type Script = "latin" | "japanese";

// Starting set of learned languages; add entries here to support more.
export const TARGET_LANGUAGES: readonly { code: string; script: Script }[] = [
  { code: "en", script: "latin" },
  { code: "es", script: "latin" },
  { code: "fr", script: "latin" },
  { code: "it", script: "latin" },
  { code: "de", script: "latin" },
  { code: "pt", script: "latin" },
  { code: "pl", script: "latin" },
  { code: "ja", script: "japanese" },
];

export function isBaseLanguage(code: string) {
  return BASE_LANGUAGES.includes(code);
}

export function isTargetLanguage(code: string) {
  return TARGET_LANGUAGES.some((l) => l.code === code);
}
