import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { UI_LOCALES, type UiLocale } from "../../convex/lib/languages";
import en from "./locales/en.json";
import es from "./locales/es.json";
import pl from "./locales/pl.json";

const STORAGE_KEY = "tutor.uiLocale";

function isUiLocale(value: unknown): value is UiLocale {
  return typeof value === "string" && (UI_LOCALES as readonly string[]).includes(value);
}

function readStoredLocale(): UiLocale | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isUiLocale(stored) ? stored : null;
  } catch {
    return null;
  }
}

function detectLocale(): UiLocale {
  const stored = readStoredLocale();
  if (stored) return stored;
  for (const lang of navigator.languages ?? [navigator.language]) {
    const base = lang.split("-")[0];
    if (isUiLocale(base)) return base;
  }
  return "en";
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, es: { translation: es }, pl: { translation: pl } },
  lng: detectLocale(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export function currentLocale(): UiLocale {
  return isUiLocale(i18n.language) ? i18n.language : "en";
}

export function changeLocale(locale: UiLocale) {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Storage may be unavailable (private mode); the choice still applies now.
  }
  void i18n.changeLanguage(locale);
}

// Localized display name for a language code, e.g. "fr" -> "Francés" in Spanish.
export function languageName(code: string, locale: string = currentLocale()) {
  const name = new Intl.DisplayNames([locale], { type: "language" }).of(code) ?? code;
  return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
}

export default i18n;
