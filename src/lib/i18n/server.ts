import 'server-only';

import { cookies } from 'next/headers';
import { cache } from 'react';

import { DEFAULT_LOCALE, LOCALE_COOKIE, parseLocale, type Locale } from './locales';
import { translate, type MessageKey } from './messages';

/** La langue du participant, lue une fois par requête. */
export const getLocale = cache(async (): Promise<Locale> => {
  const jar = await cookies();
  return parseLocale(jar.get(LOCALE_COOKIE)?.value) ?? DEFAULT_LOCALE;
});

/** Une fonction de traduction liée à la langue de la requête, pour les composants serveur. */
export async function getT() {
  const locale = await getLocale();
  return (key: MessageKey, vars?: Record<string, string | number>) => translate(locale, key, vars);
}
