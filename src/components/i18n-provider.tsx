'use client';

/**
 * La langue du participant, transmise aux composants clients.
 *
 * Le serveur la lit dans le cookie et la pose ici : un composant client n'a
 * donc jamais à deviner la langue ni à la relire après hydratation.
 */

import { createContext, useCallback, useContext } from 'react';

import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n/locales';
import { translate, type MessageKey } from '@/lib/i18n/messages';

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

export function useT() {
  const locale = useLocale();
  return useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) => translate(locale, key, vars),
    [locale],
  );
}
