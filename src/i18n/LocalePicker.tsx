import { useTranslation } from "react-i18next";
import { UI_LOCALES, type UiLocale } from "../../convex/lib/languages";
import { changeLocale, currentLocale, languageName } from ".";

// Each locale is labelled in its own language so it's findable from any UI language.
export function LocalePicker({ onChange }: { onChange?: (locale: UiLocale) => void }) {
  const { t, i18n } = useTranslation();
  return (
    <select
      aria-label={t("locale.label")}
      value={currentLocale()}
      key={i18n.language}
      onChange={(event) => {
        const locale = event.target.value as UiLocale;
        changeLocale(locale);
        onChange?.(locale);
      }}
      className="rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm text-gray-700 outline-none focus:border-gray-900"
    >
      {UI_LOCALES.map((locale) => (
        <option key={locale} value={locale}>
          {languageName(locale, locale)}
        </option>
      ))}
    </select>
  );
}
