/**
 * ATLAS — catalogue des niveaux de difficulté.
 *
 * Séparé de `lib/engine/difficulty.ts` pour une raison de FRONTIÈRE : l'écran
 * du facilitateur a besoin de ces libellés et de ces préréglages, et un
 * composant client ne peut pas importer un module du moteur — `boundaries.test.ts`
 * le refuse, type ou pas, parce qu'une chaîne d'imports « inoffensifs » est
 * exactement ce qu'une relecture manque.
 *
 * Ce module ne contient donc QUE des données pures. Les fonctions qui les
 * consomment restent dans le moteur, et le moteur réexporte d'ici : une seule
 * source, deux points d'accès.
 */

export const DIFFICULTY_LEVELS = ['decouverte', 'standard', 'exigeant', 'sur_mesure'] as const;
export type DifficultyLevel = (typeof DIFFICULTY_LEVELS)[number];

/**
 * Les cinq molettes, et ce que chacune enseigne.
 *
 * Elles sont exprimées en MULTIPLICATEURS ou en DELTAS appliqués aux paramètres
 * existants, jamais en valeurs absolues : le calibrage de fond reste dans
 * `params.ts`, et la difficulté ne fait que le tendre ou le détendre.
 */
export interface DifficultyDials {
  /** Multiplicateur de la croissance du marché. À somme nulle, il faut PRENDRE des parts. */
  marketGrowth: number;
  /** Multiplicateur du point de saturation d'alignement. Bas = l'incohérence mord vite. */
  alignmentTolerance: number;
  /** Multiplicateur de la trésorerie de dotation et de la souplesse bancaire. */
  financialSlack: number;
  /** Multiplicateur du pouvoir de négociation des fournisseurs et distributeurs. */
  ecosystemPower: number;
  /** Exposant de compétitivité. Haut = le vainqueur rafle davantage. */
  competitivenessExponent: number;
}

export const DIFFICULTY_PRESETS: Record<
  Exclude<DifficultyLevel, 'sur_mesure'>,
  DifficultyDials
> = {
  decouverte: {
    marketGrowth: 1.8,
    alignmentTolerance: 1.35,
    financialSlack: 1.4,
    ecosystemPower: 0.75,
    competitivenessExponent: 1.3,
  },
  standard: {
    marketGrowth: 1.0,
    alignmentTolerance: 1.0,
    financialSlack: 1.0,
    ecosystemPower: 1.0,
    competitivenessExponent: 1.8,
  },
  exigeant: {
    marketGrowth: 0.35,
    alignmentTolerance: 0.7,
    financialSlack: 0.8,
    ecosystemPower: 1.3,
    competitivenessExponent: 2.5,
  },
};

/** Ce que chaque molette change, en une phrase, pour l'écran du facilitateur. */
export const DIAL_EXPLANATIONS: Record<keyof DifficultyDials, string> = {
  marketGrowth:
    "Un marché qui croît pardonne : chacun peut progresser sans rien prendre à personne. Un marché atone force à prendre des parts, et le jeu redevient un affrontement.",
  alignmentTolerance:
    "La largeur de la zone où une incohérence ne coûte encore rien. Large, « à peu près cohérent » suffit ; étroite, chaque écart au profil se paie immédiatement.",
  financialSlack:
    "La trésorerie de départ et la patience de la banque. Serrée, une erreur d'investissement se transforme en problème de solvabilité en un tour.",
  ecosystemPower:
    "Le rapport de force avec les fournisseurs et les distributeurs. Élevé, la marge se négocie en amont et en aval avant de se gagner sur le marché.",
  competitivenessExponent:
    "La brutalité du partage des parts. Bas, un petit avantage donne un petit gain ; haut, dix points d'avance en compétitivité en donnent vingt-cinq en parts.",
};
