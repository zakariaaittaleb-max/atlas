/**
 * ATLAS — l'apparence choisie : thème de chaque participant, style de la session.
 *
 * Module client-safe : le layout lit le cookie de thème, le sélecteur l'écrit.
 *
 * ── DEUX RÉGLAGES QUI NE SE CONFONDENT PAS ─────────────────────────────────
 *   • Le THÈME (clair, sombre, système) est une affaire de confort et
 *     d'appareil : chaque participant le choisit, et son choix l'emporte sur le
 *     défaut fixé en administration.
 *   • Le STYLE (sobre ou ludique) est une affaire de public : le facilitateur
 *     le fixe pour toute la session, écrans d'équipe et projecteur compris.
 */

import type { ThemeChoice } from '@/lib/display-config-types';

export const THEME_COOKIE = 'atlas.theme';
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export type VisualStyle = 'corporate' | 'ludique';

export function parseThemeChoice(value: unknown): ThemeChoice | null {
  return value === 'system' || value === 'light' || value === 'dark' ? value : null;
}

export function parseVisualStyle(value: unknown): VisualStyle {
  return value === 'ludique' ? 'ludique' : 'corporate';
}
