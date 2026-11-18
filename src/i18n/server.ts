import "server-only";
import { cookies } from "next/headers";
import { dictionaries } from "./dictionaries";
import { normalizeLocale, LOCALE_COOKIE, type Locale } from "./config";

/** Current locale from the cookie (defaults to English). Next 16: cookies() is async. */
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  return normalizeLocale(store.get(LOCALE_COOKIE)?.value);
}

/** Locale + its dictionary, for server components. */
export async function getI18n() {
  const locale = await getLocale();
  return { locale, dict: dictionaries[locale] };
}
