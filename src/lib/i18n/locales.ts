/**
 * ATLAS — les langues du jeu.
 *
 * Français par défaut ; anglais et arabe au choix de chaque participant. Le
 * choix vit dans un cookie, lu au rendu serveur : la première image d'une page
 * est déjà dans la bonne langue et le bon sens de lecture.
 *
 * Module client-safe.
 */

export const LOCALES = ['fr', 'en', 'ar'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'fr';
export const LOCALE_COOKIE = 'atlas.lang';
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Chaque langue se nomme dans sa propre écriture : c'est ainsi qu'on la reconnaît. */
export const LOCALE_LABELS: Record<Locale, string> = {
  fr: 'Français',
  en: 'English',
  ar: 'العربية',
};

export function parseLocale(value: unknown): Locale | null {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
    ? (value as Locale)
    : null;
}

/** L'arabe se lit de droite à gauche : toute la mise en page s'inverse. */
export function dirOf(locale: Locale): 'ltr' | 'rtl' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}
