/**
 * ATLAS — vocabulaire des effets de choc, côté données.
 *
 * Séparé de `lib/engine/shocks.ts` pour une raison de FRONTIÈRE : l'éditeur de
 * cartes du facilitateur a besoin de ces libellés et de ces bornes, et un
 * composant client ne peut pas importer un module du moteur.
 *
 * Ce module ne contient QUE des données. Les fonctions qui les consomment —
 * cumul, validation, mise en phrase — restent dans le moteur, qui réexporte
 * d'ici : une seule source, deux points d'accès.
 */

/** Sens dans lequel une valeur positive joue pour l'équipe. */
export type EffectDirection = 'favorable' | 'defavorable';

export interface EffectSpec {
  key: string;
  label: string;
  /** Ce que mesure le nombre saisi. */
  unit: 'pct' | 'points' | 'taux' | 'jours';
  /** Ce qu'une valeur POSITIVE fait. */
  positiveMeans: string;
  /** Ce qu'une valeur NÉGATIVE fait — l'inverse, mais dit en français. */
  negativeMeans: string;
  positiveIs: EffectDirection;
  /** Bornes de saisie, pour que l'éditeur refuse l'absurde. */
  min: number;
  max: number;
}

/**
 * Le vocabulaire complet. Chaque entrée est appliquée quelque part dans le
 * moteur — le test `shocks.test.ts` l'exige.
 */
export const EFFECT_SPECS: EffectSpec[] = [
  { key: 'market_size_pct', label: 'Taille du marché', unit: 'pct',
    positiveMeans: 'le marché du DAS grossit', negativeMeans: 'le marché du DAS se contracte',
    positiveIs: 'favorable',
    min: -0.6, max: 0.6 },

  { key: 'input_cost_pct', label: 'Coût des intrants', unit: 'pct',
    positiveMeans: 'les achats renchérissent', negativeMeans: 'les achats coûtent moins cher',
    positiveIs: 'defavorable',
    min: -0.4, max: 0.6 },

  { key: 'capacity_pct', label: 'Capacité de production', unit: 'pct',
    positiveMeans: "l'outil produit davantage", negativeMeans: "l'outil produit moins",
    positiveIs: 'favorable',
    min: -0.5, max: 0.4 },

  { key: 'quality_floor', label: 'Qualité minimale exigée', unit: 'points',
    positiveMeans: "en deçà de ce seuil, l'accès au marché se ferme",
    negativeMeans: 'aucun seuil imposé',
    positiveIs: 'defavorable', min: 0, max: 90 },

  { key: 'rate_delta', label: 'Taux de crédit', unit: 'taux',
    positiveMeans: "emprunter coûte plus cher", negativeMeans: 'emprunter coûte moins cher',
    positiveIs: 'defavorable',
    min: -0.03, max: 0.05 },

  { key: 'supplier_power_pct', label: 'Pouvoir des fournisseurs', unit: 'pct',
    positiveMeans: "les fournisseurs négocient plus durement",
    negativeMeans: 'les fournisseurs se font plus accommodants',
    positiveIs: 'defavorable', min: -0.5, max: 0.8 },

  { key: 'distributor_power_pct', label: 'Pouvoir des distributeurs', unit: 'pct',
    positiveMeans: "les distributeurs exigent davantage",
    negativeMeans: 'les distributeurs se font plus accommodants',
    positiveIs: 'defavorable', min: -0.5, max: 0.8 },

  { key: 'payroll_pct', label: 'Masse salariale', unit: 'pct',
    positiveMeans: 'les salaires sont tirés vers le haut',
    negativeMeans: 'la pression salariale retombe',
    positiveIs: 'defavorable', min: -0.15, max: 0.5 },

  { key: 'severance_pct', label: 'Coût des licenciements', unit: 'pct',
    positiveMeans: 'les indemnités de rupture sont alourdies',
    negativeMeans: 'les indemnités de rupture sont allégées',
    positiveIs: 'defavorable', min: -0.3, max: 1 },

  { key: 'capex_cost_pct', label: "Coût de l'investissement", unit: 'pct',
    positiveMeans: 'un dirham investi achète moins de capacité',
    negativeMeans: 'un dirham investi achète plus de capacité',
    positiveIs: 'defavorable', min: -0.4, max: 0.6 },

  { key: 'working_capital_days_delta', label: 'Délais de paiement', unit: 'jours',
    positiveMeans: 'les clients paient plus tard, la trésorerie se tend',
    negativeMeans: 'les clients paient plus tôt, la trésorerie se détend',
    positiveIs: 'defavorable', min: -45, max: 90 },

  { key: 'price_elasticity_delta', label: 'Sensibilité au prix', unit: 'points',
    positiveMeans: 'les clients arbitrent davantage sur le prix',
    negativeMeans: 'les clients arbitrent moins sur le prix',
    positiveIs: 'defavorable', min: -1, max: 1.5 },

  { key: 'notoriety_pct', label: 'Notoriété', unit: 'pct',
    positiveMeans: 'la marque gagne en visibilité', negativeMeans: 'la marque perd en visibilité',
    positiveIs: 'favorable',
    min: -0.5, max: 0.5 },

  { key: 'training_subsidy_pct', label: 'Aide à la formation', unit: 'pct',
    positiveMeans: 'une part supplémentaire de la formation est financée',
    negativeMeans: 'la formation est moins bien financée',
    positiveIs: 'favorable', min: -0.3, max: 0.6 },

  { key: 'subsidy_pct_of_revenue', label: 'Subvention directe', unit: 'pct',
    positiveMeans: "un versement proportionnel au chiffre d'affaires",
    negativeMeans: "un prélèvement proportionnel au chiffre d'affaires",
    positiveIs: 'favorable', min: -0.1, max: 0.2 },
];

export const EFFECT_KEYS = EFFECT_SPECS.map((e) => e.key);
