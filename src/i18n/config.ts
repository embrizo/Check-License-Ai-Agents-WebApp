// Lightweight i18n: a cookie-selected locale, no routing library. Server
// components read the cookie (src/i18n/server.ts); a client provider carries the
// dictionary to client components (src/i18n/provider.tsx). Deliberately not
// next-intl — this Next build is non-standard (see AGENTS.md) and the app values
// few dependencies.

export const LOCALES = ["en", "th"] as const;
export type Locale = (typeof LOCALES)[number];

/** English is the app's default; users switch to Thai with the nav toggle. */
export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_COOKIE = "locale";
/** 1 year — the choice should stick across sessions. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function normalizeLocale(value: string | null | undefined): Locale {
  return value === "th" || value === "en" ? value : DEFAULT_LOCALE;
}
