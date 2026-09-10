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

/**
 * Un point d'une série d'évolution.
 *
 * Une étude ne vaut pas grand-chose en photo : savoir qu'un concurrent détient
 * 22 % du marché ne dit pas s'il vient d'en gagner huit ou d'en perdre douze.
 * Chaque indicateur est donc livré sur TOUS les tours joués.
 *
 * Les valeurs sont déjà bruitées, tour par tour, avec la même graine
 * déterministe que la photo : relire l'étude au tour 5 doit redonner
 * exactement les chiffres du tour 2.
 */
export interface SubjectHistoryPoint {
  roundNumber: number;
  /** Indicateur → valeur divulguée. `null` quand le tour n'a rien produit. */
  values: Record<string, number | null>;
}

/**
 * Un fournisseur d'un concurrent, par rang de dépendance.
 *
 * Les QUANTITÉS restent cachées — c'est une décision, et le cabinet ne vend
 * que ce qui s'observe. Le rang, lui, se déduit du marché : on voit qui livre
 * qui, et un concurrent mono-source est visiblement vulnérable.
 */
export interface SupplierRank {
  rank: number;
  name: string;
  /** Vous vous approvisionnez chez lui aussi : vous pesez sur le même carnet. */
  sharedWithYou: boolean;
}
