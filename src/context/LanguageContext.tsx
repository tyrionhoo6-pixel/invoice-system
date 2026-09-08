'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { dictionaries, type Locale, type Translation } from '@/lib/i18n';

type LanguageContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
  t: Translation;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);
const STORAGE_KEY = 'invoice-system-locale';

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');

  useEffect(() => {
    const restoreLocale = window.setTimeout(() => {
      const storedLocale = window.localStorage.getItem(STORAGE_KEY);
      if (storedLocale === 'en' || storedLocale === 'zh') setLocaleState(storedLocale);
    }, 0);
    return () => window.clearTimeout(restoreLocale);
  }, []);

  const setLocale = (nextLocale: Locale) => {
    setLocaleState(nextLocale);
    window.localStorage.setItem(STORAGE_KEY, nextLocale);
  };

  const value = useMemo(() => ({
    locale,
    setLocale,
    toggleLocale: () => setLocale(locale === 'en' ? 'zh' : 'en'),
    t: dictionaries[locale],
  }), [locale]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used inside LanguageProvider.');
  return context;
}
