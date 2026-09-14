/**
 * ATLAS — le parcours de prise en main du premier tour.
 *
 * Module client-safe : la page serveur lit le cookie, le bouton client l'écrit.
 * Un choix par appareil — un membre peut le masquer sur son ordinateur sans
 * le retirer à ceux qui découvrent encore le jeu.
 */

export const ONBOARDING_COOKIE = 'atlas.parcours';

/** Trente jours : le temps d'une formation, pas celui d'une année. */
export const ONBOARDING_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
