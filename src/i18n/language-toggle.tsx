"use client";

import { useRouter } from "next/navigation";
import { useI18n } from "./provider";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, LOCALES, type Locale } from "./config";
import { cn } from "@/lib/utils";

// Module scope on purpose: writing document.cookie inside a component body trips
// the React-compiler immutability lint. It's a browser API, only ever called
// from the click handler below (client-side).
function writeLocaleCookie(next: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
}

/**
 * TH/EN switch. Writes the locale cookie client-side and calls router.refresh()
 * so every server component re-renders in the new language on the same URL — no
 * locale-prefixed routes, no reload. Server components read the same cookie via
 * src/i18n/server.ts.
 */
export function LanguageToggle() {
  const { locale } = useI18n();
  const router = useRouter();

  function choose(next: Locale) {
    if (next === locale) return;
    writeLocaleCookie(next);
    router.refresh();
  }

  return (
    <div className="inline-flex overflow-hidden rounded-md border text-xs" role="group" aria-label="Language">
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => choose(l)}
          aria-pressed={locale === l}
          className={cn(
            "px-2 py-1 uppercase transition-colors",
            locale === l ? "bg-foreground text-background" : "hover:bg-accent",
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
