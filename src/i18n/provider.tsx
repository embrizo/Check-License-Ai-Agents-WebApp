"use client";

import { createContext, useContext } from "react";
import type { Dict } from "./dictionaries";
import type { Locale } from "./config";

type I18nValue = { locale: Locale; dict: Dict };

const I18nContext = createContext<I18nValue | null>(null);

/**
 * Carries the server-resolved locale + dictionary to client components. The
 * (app) layout reads the cookie server-side and renders this once; client
 * components (nav, forms) read it with useI18n(). The dict is a plain object,
 * so passing it across the server→client boundary is just serialization.
 */
export function I18nProvider({ locale, dict, children }: I18nValue & { children: React.ReactNode }) {
  return <I18nContext.Provider value={{ locale, dict }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
