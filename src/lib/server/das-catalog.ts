import 'server-only';

/**
 * ATLAS — catalogue des huit DAS et de leurs segments.
 *
 * Implémente `docs/03-referentiel-das.md`.
 *
 * ⚠️ Les tailles de marché sont des ORDRES DE GRANDEUR destinés à rendre le jeu
 * vraisemblable, pas des statistiques officielles. Elles doivent être
 * revalidées avant chaque session contre HCP, Office des Changes, Bank
 * Al-Maghrib, Ministère de l'Industrie et AMDIE. C'est pourquoi elles vivent en
 * base, modifiables par le facilitateur, et jamais en dur dans le moteur.
 */

export interface SegmentSeed {
  key: string;
  name: string;
  marketSharePct: number;
  priceSensitivity: number;
  /** Qualité perçue en deçà de laquelle la part sur ce segment est divisée par deux. */
  qualityRequirement: number;
  relativeGrowth: number;
}

export interface DasSeed {
  sectorKey: string;
  name: string;
  /** Stocké pour le débriefing formateur, JAMAIS exposé aux équipes. */
  bcgStage: 'vache_a_lait' | 'star' | 'dilemme' | 'poids_mort';
  baseMarketSizeMad: number;
  referenceUnitPriceMad: number;
  referenceUnitCostMad: number;
  fixedCostBaseMad: number;
  growthRateMin: number;
  growthRateMax: number;
  priceElasticity: number;
  learningRate: number;
  valuationMultiple: number;
  workingCapitalDays: number;
  vrioEntryBarrier: number;
  unitCapacityCostMad: number;
  /** Le numérique produit avec des personnes : le recrutement y remplace le CAPEX. */
  capacityFromHeadcount: boolean;
  headcountProductivity: number | null;
  segments: SegmentSeed[];
}

export const DAS_CATALOG: DasSeed[] = [
  {
    sectorKey: 'agro',
    name: 'Agro-industrie',
    bcgStage: 'vache_a_lait',
    baseMarketSizeMad: 190_000_000_000,
    referenceUnitPriceMad: 100,
    referenceUnitCostMad: 55,
    fixedCostBaseMad: 900_000_000,
    growthRateMin: 0,
    growthRateMax: 0.04,
    priceElasticity: 2.0,
    learningRate: 0.88,
    valuationMultiple: 5.5,
    workingCapitalDays: 75,
    vrioEntryBarrier: 0.3,
    unitCapacityCostMad: 220,
    capacityFromHeadcount: false,
    headcountProductivity: null,
    segments: [
      { key: 'grand_public_national', name: 'Grand public national', marketSharePct: 0.38, priceSensitivity: 1.7, qualityRequirement: 40, relativeGrowth: 1.0 },
      { key: 'export_europe', name: 'Export Europe', marketSharePct: 0.24, priceSensitivity: 1.2, qualityRequirement: 70, relativeGrowth: 1.2 },
      { key: 'restauration_collective', name: 'Restauration collective', marketSharePct: 0.14, priceSensitivity: 1.9, qualityRequirement: 35, relativeGrowth: 0.9 },
      { key: 'premium_bio', name: 'Premium bio', marketSharePct: 0.10, priceSensitivity: 0.7, qualityRequirement: 82, relativeGrowth: 1.6 },
      { key: 'industrie_b2b', name: 'Industrie agroalimentaire B2B', marketSharePct: 0.14, priceSensitivity: 1.5, qualityRequirement: 55, relativeGrowth: 1.0 },
    ],
  },
  {
    sectorKey: 'btp',
    name: 'Construction & infrastructures',
    bcgStage: 'star',
    baseMarketSizeMad: 180_000_000_000,
    referenceUnitPriceMad: 8_000,
    referenceUnitCostMad: 4_600,
    fixedCostBaseMad: 1_100_000_000,
    growthRateMin: -0.02,
    growthRateMax: 0.09,
    priceElasticity: 1.6,
    learningRate: 0.90,
    valuationMultiple: 4.5,
    // 110 jours : c'est ce DAS qui enseigne « bénéficiaire mais à court de cash ».
    workingCapitalDays: 110,
    vrioEntryBarrier: 0.35,
    unitCapacityCostMad: 15_000,
    capacityFromHeadcount: false,
    headcountProductivity: null,
    segments: [
      { key: 'logement_social', name: 'Logement social', marketSharePct: 0.26, priceSensitivity: 2.1, qualityRequirement: 30, relativeGrowth: 1.0 },
      { key: 'moyen_standing', name: 'Moyen standing', marketSharePct: 0.24, priceSensitivity: 1.5, qualityRequirement: 55, relativeGrowth: 1.1 },
      { key: 'haut_standing', name: 'Haut standing', marketSharePct: 0.12, priceSensitivity: 0.8, qualityRequirement: 80, relativeGrowth: 1.0 },
      { key: 'tertiaire_bureaux', name: 'Tertiaire et bureaux', marketSharePct: 0.16, priceSensitivity: 1.2, qualityRequirement: 65, relativeGrowth: 1.2 },
      { key: 'infrastructures_publiques', name: 'Infrastructures publiques', marketSharePct: 0.22, priceSensitivity: 1.8, qualityRequirement: 60, relativeGrowth: 1.4 },
    ],
  },
  {
    sectorKey: 'tourisme',
    name: 'Tourisme & hôtellerie',
    bcgStage: 'star',
    baseMarketSizeMad: 138_000_000_000,
    referenceUnitPriceMad: 1_200,
    referenceUnitCostMad: 520,
    // Coûts fixes très élevés : un hôtel vide coûte presque autant qu'un plein.
    fixedCostBaseMad: 1_800_000_000,
    growthRateMin: 0.03,
    growthRateMax: 0.18,
    priceElasticity: 0.9,
    learningRate: 0.92,
    valuationMultiple: 8.0,
    workingCapitalDays: 30,
    vrioEntryBarrier: 0.25,
    unitCapacityCostMad: 3_500,
    capacityFromHeadcount: false,
    headcountProductivity: null,
    segments: [
      { key: 'balneaire_international', name: 'Balnéaire international', marketSharePct: 0.28, priceSensitivity: 1.3, qualityRequirement: 60, relativeGrowth: 1.2 },
      { key: 'culturel_medina', name: 'Culturel et médinas', marketSharePct: 0.22, priceSensitivity: 1.0, qualityRequirement: 65, relativeGrowth: 1.1 },
      { key: 'affaires_mice', name: 'Affaires et congrès', marketSharePct: 0.18, priceSensitivity: 0.8, qualityRequirement: 75, relativeGrowth: 1.3 },
      { key: 'tourisme_interne', name: 'Tourisme interne', marketSharePct: 0.20, priceSensitivity: 2.0, qualityRequirement: 35, relativeGrowth: 1.0 },
      { key: 'luxe_resort', name: 'Luxe et resorts', marketSharePct: 0.12, priceSensitivity: 0.5, qualityRequirement: 88, relativeGrowth: 1.4 },
    ],
  },
  {
    sectorKey: 'equipement',
    name: 'Distribution de matériel industriel',
    bcgStage: 'vache_a_lait',
    baseMarketSizeMad: 36_000_000_000,
    referenceUnitPriceMad: 45_000,
    referenceUnitCostMad: 31_000,
    fixedCostBaseMad: 320_000_000,
    growthRateMin: 0.01,
    growthRateMax: 0.07,
    priceElasticity: 1.4,
    learningRate: 0.91,
    valuationMultiple: 5.0,
    workingCapitalDays: 95,
    // La plus haute barrière du jeu : les exclusivités constructeurs sont
    // difficiles à déloger. Entrer tard sur ce DAS se paie cher.
    vrioEntryBarrier: 0.45,
    unitCapacityCostMad: 60_000,
    capacityFromHeadcount: false,
    headcountProductivity: null,
    segments: [
      { key: 'btp_engins', name: 'Engins de chantier', marketSharePct: 0.30, priceSensitivity: 1.4, qualityRequirement: 60, relativeGrowth: 1.2 },
      { key: 'agro_equipement', name: 'Équipement agricole', marketSharePct: 0.22, priceSensitivity: 1.6, qualityRequirement: 50, relativeGrowth: 1.0 },
      { key: 'industrie_manufacturiere', name: 'Industrie manufacturière', marketSharePct: 0.24, priceSensitivity: 1.2, qualityRequirement: 70, relativeGrowth: 1.1 },
      { key: 'energie_maintenance', name: 'Énergie et maintenance', marketSharePct: 0.12, priceSensitivity: 0.9, qualityRequirement: 78, relativeGrowth: 1.5 },
      { key: 'pieces_detachees', name: 'Pièces détachées', marketSharePct: 0.12, priceSensitivity: 1.8, qualityRequirement: 45, relativeGrowth: 1.0 },
    ],
  },
  {
    sectorKey: 'retail',
    name: 'Distribution alimentaire moderne',
    bcgStage: 'star',
    baseMarketSizeMad: 58_000_000_000,
    referenceUnitPriceMad: 60,
    referenceUnitCostMad: 46,
    fixedCostBaseMad: 700_000_000,
    growthRateMin: 0.02,
    growthRateMax: 0.08,
    // Le plus élastique : marge très fine, le volume est vital.
    priceElasticity: 2.2,
    learningRate: 0.89,
    valuationMultiple: 6.0,
    workingCapitalDays: 25,
    vrioEntryBarrier: 0.2,
    unitCapacityCostMad: 130,
    capacityFromHeadcount: false,
    headcountProductivity: null,
    segments: [
      { key: 'hypermarche', name: 'Hypermarché', marketSharePct: 0.26, priceSensitivity: 2.0, qualityRequirement: 45, relativeGrowth: 0.9 },
      { key: 'supermarche_urbain', name: 'Supermarché urbain', marketSharePct: 0.28, priceSensitivity: 1.8, qualityRequirement: 55, relativeGrowth: 1.2 },
      { key: 'proximite_quartier', name: 'Proximité de quartier', marketSharePct: 0.22, priceSensitivity: 1.5, qualityRequirement: 50, relativeGrowth: 1.3 },
      { key: 'cash_and_carry_b2b', name: 'Cash & carry B2B', marketSharePct: 0.14, priceSensitivity: 2.3, qualityRequirement: 40, relativeGrowth: 1.1 },
      { key: 'e_commerce', name: 'E-commerce alimentaire', marketSharePct: 0.10, priceSensitivity: 1.6, qualityRequirement: 65, relativeGrowth: 1.8 },
    ],
  },
  {
    sectorKey: 'textile',
    name: 'Textile & habillement',
    bcgStage: 'poids_mort',
    baseMarketSizeMad: 48_000_000_000,
    referenceUnitPriceMad: 180,
    referenceUnitCostMad: 118,
    fixedCostBaseMad: 380_000_000,
    growthRateMin: -0.03,
    growthRateMax: 0.07,
    priceElasticity: 1.9,
    // Apprentissage le plus rapide avec le numérique : la confection s'optimise vite.
    learningRate: 0.86,
    valuationMultiple: 4.0,
    workingCapitalDays: 85,
    // La plus basse barrière : marché très ouvert, guerre de prix permanente.
    vrioEntryBarrier: 0.15,
    unitCapacityCostMad: 260,
    capacityFromHeadcount: false,
    headcountProductivity: null,
    segments: [
      { key: 'sous_traitance_export', name: 'Sous-traitance export', marketSharePct: 0.36, priceSensitivity: 2.2, qualityRequirement: 55, relativeGrowth: 0.9 },
      { key: 'marque_nationale', name: 'Marque nationale', marketSharePct: 0.20, priceSensitivity: 1.4, qualityRequirement: 65, relativeGrowth: 1.2 },
      { key: 'uniformes_b2b', name: 'Uniformes et vêtements B2B', marketSharePct: 0.16, priceSensitivity: 1.8, qualityRequirement: 45, relativeGrowth: 1.0 },
      { key: 'textile_technique', name: 'Textile technique', marketSharePct: 0.14, priceSensitivity: 0.9, qualityRequirement: 80, relativeGrowth: 1.5 },
      { key: 'e_commerce_mode', name: 'E-commerce mode', marketSharePct: 0.14, priceSensitivity: 1.7, qualityRequirement: 60, relativeGrowth: 1.7 },
    ],
  },
  {
    sectorKey: 'energie',
    name: 'Énergies renouvelables & efficacité',
    // Le « dilemme » par excellence : forte croissance, forte consommation de cash.
    bcgStage: 'dilemme',
    baseMarketSizeMad: 22_000_000_000,
    referenceUnitPriceMad: 120_000,
    referenceUnitCostMad: 78_000,
    fixedCostBaseMad: 480_000_000,
    growthRateMin: 0.06,
    growthRateMax: 0.22,
    priceElasticity: 1.1,
    learningRate: 0.87,
    valuationMultiple: 9.0,
    workingCapitalDays: 120,
    vrioEntryBarrier: 0.40,
    unitCapacityCostMad: 190_000,
    capacityFromHeadcount: false,
    headcountProductivity: null,
    segments: [
      { key: 'solaire_utilitaire', name: 'Solaire à grande échelle', marketSharePct: 0.32, priceSensitivity: 1.3, qualityRequirement: 70, relativeGrowth: 1.5 },
      { key: 'solaire_decentralise', name: 'Solaire décentralisé', marketSharePct: 0.20, priceSensitivity: 1.6, qualityRequirement: 55, relativeGrowth: 1.8 },
      { key: 'eolien', name: 'Éolien', marketSharePct: 0.22, priceSensitivity: 1.1, qualityRequirement: 75, relativeGrowth: 1.4 },
      { key: 'efficacite_industrielle', name: 'Efficacité énergétique industrielle', marketSharePct: 0.16, priceSensitivity: 0.9, qualityRequirement: 72, relativeGrowth: 1.6 },
      { key: 'services_energetiques', name: 'Services énergétiques', marketSharePct: 0.10, priceSensitivity: 1.0, qualityRequirement: 68, relativeGrowth: 1.7 },
    ],
  },
  {
    sectorKey: 'numerique',
    name: 'Services numériques & offshoring',
    bcgStage: 'dilemme',
    baseMarketSizeMad: 26_000_000_000,
    referenceUnitPriceMad: 4_500,
    referenceUnitCostMad: 2_900,
    fixedCostBaseMad: 210_000_000,
    growthRateMin: 0.05,
    growthRateMax: 0.20,
    priceElasticity: 1.2,
    learningRate: 0.84,
    valuationMultiple: 8.5,
    workingCapitalDays: 55,
    vrioEntryBarrier: 0.2,
    unitCapacityCostMad: 1_000,
    // SEUL DAS où la capacité vient de l'effectif : le recrutement y remplace
    // l'investissement industriel. Les équipes doivent découvrir que
    // « capacité » n'a pas la même nature selon le métier.
    capacityFromHeadcount: true,
    headcountProductivity: 620,
    segments: [
      { key: 'bpo_relation_client', name: 'BPO et relation client', marketSharePct: 0.34, priceSensitivity: 2.0, qualityRequirement: 50, relativeGrowth: 1.1 },
      { key: 'ingenierie_logicielle', name: 'Ingénierie logicielle', marketSharePct: 0.24, priceSensitivity: 1.1, qualityRequirement: 72, relativeGrowth: 1.5 },
      { key: 'integration_si', name: 'Intégration de systèmes', marketSharePct: 0.18, priceSensitivity: 1.2, qualityRequirement: 68, relativeGrowth: 1.3 },
      { key: 'cloud_infrastructure', name: 'Cloud et infrastructure', marketSharePct: 0.14, priceSensitivity: 1.0, qualityRequirement: 78, relativeGrowth: 1.8 },
      { key: 'cybersecurite', name: 'Cybersécurité', marketSharePct: 0.10, priceSensitivity: 0.7, qualityRequirement: 85, relativeGrowth: 2.0 },
    ],
  },
];

/**
 * Matrice de proximité sectorielle (doc 01 §5.1 et doc 03 §4).
 *
 * Pilote les synergies et les coûts de coordination : mutualiser des métiers
 * proches produit des économies, mutualiser des métiers étrangers produit de la
 * bureaucratie. Seule la moitié supérieure est déclarée ; le moteur la lit dans
 * les deux sens.
 */
export const SECTOR_PROXIMITY: Record<string, number> = {
  'agro|btp': 12,        'agro|tourisme': 28,   'agro|equipement': 35,
  'agro|retail': 80,     'agro|textile': 22,    'agro|energie': 25,
  'agro|numerique': 20,
  'btp|tourisme': 38,    'btp|equipement': 62,  'btp|retail': 10,
  'btp|textile': 8,      'btp|energie': 55,     'btp|numerique': 18,
  'tourisme|equipement': 12, 'tourisme|retail': 42, 'tourisme|textile': 20,
  'tourisme|energie': 22,    'tourisme|numerique': 35,
  'equipement|retail': 25,   'equipement|textile': 40, 'equipement|energie': 48,
  'equipement|numerique': 22,
  'retail|textile': 52,      'retail|energie': 12,  'retail|numerique': 30,
  'textile|energie': 10,     'textile|numerique': 18,
  'energie|numerique': 32,
};

export function sectorProximity(a: string, b: string): number {
  if (a === b) return 100;
  return SECTOR_PROXIMITY[`${a}|${b}`] ?? SECTOR_PROXIMITY[`${b}|${a}`] ?? 20;
}
