/**
 * ATLAS — formes de données des livrables de cabinet.
 *
 * Module SANS dépendance moteur : il est importé aussi bien par
 * `engine/consulting.ts` que par les composants client qui AFFICHENT un
 * livrable. Faire importer `engine/consulting` à un composant `"use client"`
 * fonctionnerait — les bundlers effacent les imports de type — mais ferait
 * entrer tout le moteur dans son graphe de dépendances, et `boundaries.test.ts`
 * refuse cette dépendance, type ou pas.
 */

/** Paliers de mission, du moins cher au plus complet. */
export type StudyTier = 'express' | 'standard' | 'approfondie';

/**
 * Un champ divulgué par une étude, avec ce qu'il vaut.
 *
 * Le régime n'est pas décoratif : c'est lui qui dit à l'équipe si elle lit une
 * vérité, une estimation bruitée, une simple fourchette, ou rien du tout. Le
 * cabinet vend des estimations — l'afficher sans sa marge d'erreur les
 * transformerait en certitudes.
 */
export type FieldDisclosure =
  | { mode: 'exact'; key: string; label: string; value: number; unit?: string }
  | {
      mode: 'estimate';
      key: string;
      label: string;
      value: number;
      errorMargin: number;
      lower: number;
      upper: number;
      unit?: string;
    }
  | {
      mode: 'band';
      key: string;
      label: string;
      band: string;
      bandIndex: number;
      lower: number;
      upper: number;
      unit?: string;
    }
  | { mode: 'withheld'; key: string; label: string; reason: string };
