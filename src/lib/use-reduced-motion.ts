/**
 * Préférence système de mouvement réduit, lue par abonnement.
 *
 * `useSyncExternalStore` plutôt qu'un état mis à jour dans un effet : la valeur
 * vient d'un système extérieur à React. Côté serveur, aucune préférence n'est
 * supposée — l'animation se décide au montage client, jamais au rendu initial.
 */

import { useSyncExternalStore } from 'react';

const reducedMotionQuery = () => window.matchMedia('(prefers-reduced-motion: reduce)');

function subscribe(callback: () => void) {
  const query = reducedMotionQuery();
  query.addEventListener('change', callback);
  return () => query.removeEventListener('change', callback);
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, () => reducedMotionQuery().matches, () => false);
}
