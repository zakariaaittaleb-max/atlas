/**
 * ATLAS — formes de données du tableau de bord.
 *
 * Module client-safe : la vue `"use client"` et le chargeur serveur s'y
 * réfèrent tous les deux. `boundaries.test.ts` refuse qu'un composant client
 * dépende d'un module serveur, fût-ce pour un type.
 */

import type { FieldDisclosure, SubjectHistoryPoint } from './consulting-types';

/** Un point de l'histoire du Groupe. Une ligne par tour résolu. */
export interface GroupPoint {
  roundNumber: number;
  treasuryMad: number;
  revenueMad: number;
  netIncomeMad: number;
  grossMarginMad: number;
  marginPct: number;
  climatSocial: number;
  iaScore: number;
  /** Balanced Scorecard, tel que le moteur le calcule déjà. */
  bsc: { financial: number; client: number; process: number; learning: number; global: number } | null;
}

/** Un domaine, tour par tour. */
export interface DasPoint {
  roundNumber: number;
  marketSharePct: number;
  revenueMad: number;
  grossMarginMad: number;
  volumeSold: number;
  volumeLost: number;
  productionUnits: number;
  competitivenessScore: number;
  perceivedQuality: number;
  notoriety: number;
  pricePosition: number;
  distributionCoverage: number;
  utilisationRate: number;
  inputStockUnits: number;
  finishedStockUnits: number;
}

export interface DasSeries {
  dasId: string;
  name: string;
  /** Poids dans le portefeuille, au dernier exercice clos. */
  revenueShareOfGroup: number;
  grossMarginMad: number;
  history: DasPoint[];
  /** Forces de Porter, propriétés de la filière. */
  forces: {
    entryBarrier: number;
    substitution: number;
    supplierPower: number;
    distributorPower: number;
    rivalry: number;
  };
  /** Croissance du marché — l'ordonnée de la BCG. Connue par l'étude PESTEL. */
  marketGrowth: number | null;
  /** Part relative au leader — l'abscisse de la BCG. Connue par l'étude concurrentielle. */
  relativeShare: number | null;
}

/**
 * Ce que le cabinet a révélé, prêt à superposer.
 *
 * Les séries concurrentes se tracent en pointillés sur les mêmes graphiques que
 * les vôtres : c'est la comparaison qui décide, pas la juxtaposition. Le badge
 * porte la marge du palier payé — une estimation qui ne dit pas qu'elle en est
 * une devient une vérité.
 */
export interface CabinetOverlay {
  studyKey: string;
  tier: string;
  errorMargin: number;
  roundNumber: number;
  dasId: string | null;
  subjects: {
    subjectId: string;
    subjectName: string;
    isSelf?: boolean;
    history?: SubjectHistoryPoint[];
    fields: FieldDisclosure[];
  }[];
}

/** Le diagnostic d'alignement, mis en mots. */
export interface AlignmentVerdict {
  score: number | null;
  /** Écart au tour précédent, en points. `null` au premier tour résolu. */
  trend: number | null;
  sentence: string;
  stuckInTheMiddle: boolean;
  drift: boolean;
  /** Les axes où l'écart au modèle est le plus coûteux. */
  worstAxes: { axisKey: string; gap: number; penalty: number }[];
}

export interface DashboardContext {
  teamName: string;
  roundNumber: number;
  hasResults: boolean;
  /**
   * Tours effectivement résolus. Le tour 0 est la dotation : trésorerie et
   * chiffre d'affaires y ont un sens, pas le résultat ni la marge, qui ne sont
   * calculés qu'à la première résolution.
   */
  resolvedRounds: number;
  treasuryStatus: string;
  group: GroupPoint[];
  das: DasSeries[];
  alignment: AlignmentVerdict;
  cabinet: CabinetOverlay[];
}
