/**
 * ATLAS — l'état résolu des modules, tel que le lisent les écrans.
 *
 * Module pur : les vues `"use client"` en dépendent autant que le résolveur
 * serveur. La forme est un objet sérialisable — c'est ce qui traverse la
 * frontière serveur / client dans les props d'une page.
 *
 * Toujours passer par `isOn` plutôt que d'indexer l'objet directement : c'est
 * là qu'est appliquée la règle du noyau. Un écran qui lirait `modules[key]` à
 * la main pourrait masquer le positionnement prix, et le moteur n'aurait plus
 * d'assiette de calcul.
 */

import { CORE_MODULE_KEYS, MODULE_SCREENS, SCREEN_BY_FIELD } from './modules-catalog';

export type EnabledModules = Readonly<Record<string, boolean>>;

export function isOn(modules: EnabledModules, key: string): boolean {
  if (CORE_MODULE_KEYS.has(key)) return true;
  return modules[key] === true;
}

/** Vrai dès qu'un seul des champs est ouvert — pour masquer un bloc entier. */
export function anyOn(modules: EnabledModules, keys: readonly string[]): boolean {
  return keys.some((key) => isOn(modules, key));
}

/**
 * Un écran garde-t-il quelque chose à saisir ?
 *
 * Sert à masquer l'onglet correspondant : la barre de navigation doit rétrécir
 * avec le jeu, sinon un participant ouvre un écran vide et croit à une panne.
 */
export function screenIsOpen(modules: EnabledModules, screenKey: string): boolean {
  const screen = MODULE_SCREENS.find((s) => s.key === screenKey);
  if (!screen) return true;
  return screen.categories.some((category) =>
    category.fields.some((field) => isOn(modules, field.key)),
  );
}

/** Écrans ouverts, par `href` — la forme dont la barre de navigation a besoin. */
export function openScreenHrefs(modules: EnabledModules): ReadonlySet<string> {
  return new Set(
    MODULE_SCREENS.filter((screen) => screenIsOpen(modules, screen.key)).map((s) => s.href),
  );
}

/** L'écran d'un champ, pour les messages d'erreur côté serveur. */
export function screenOf(fieldKey: string): string | undefined {
  return SCREEN_BY_FIELD.get(fieldKey);
}
