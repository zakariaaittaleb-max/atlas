/**
 * ATLAS — paramètres de calibrage du moteur.
 *
 * Toutes les valeurs vivent en base (`engine_parameters`) et sont modifiables
 * par le facilitateur entre deux sessions, sans redéploiement. Ce fichier ne
 * fournit que les VALEURS PAR DÉFAUT, utilisées au provisioning d'une session
 * et comme filet de sécurité si une clé manque.
 *
 * ⚠️ Les paramètres fiscaux et sociaux (IS, CNSS, SMIG, taux directeur) sont
 * datés du premier semestre 2026 et doivent être REVÉRIFIÉS avant chaque
 * session : ils changent par loi de finances ou par décret.
 */

export const DEFAULT_PARAMS = {
  // --- Compétitivité --------------------------------------------------------
  'competitiveness.weight.quality': 0.3,
  'competitiveness.weight.notoriety': 0.25,
  'competitiveness.weight.price': 0.2,
  'competitiveness.weight.ia': 0.15,
  'competitiveness.weight.pressure': -0.1,

  // --- Ressources humaines, par DAS -----------------------------------------
  // Taux de la taxe de formation professionnelle : c'est lui qui plafonne le
  // droit de tirage OFPPT. Dépenser au-delà ne rembourse pas davantage.
  'hr.ofppt_payroll_rate': 0.016,
  'hr.ofppt_reimbursement_rate': 0.70,
  // Le GIAC finance l'ingénierie de formation, pas la formation : d'où un
  // montant adossé à la masse salariale et conditionné au bilan de compétences.
  'hr.giac_rate': 0.004,
  'hr.climate_inertia': 0.55,
  'hr.turnover_floor': 0.04,
  'hr.skill_decay': 0.08,
  // Part de l'effectif qu'une standardisation complète permet de retirer sans
  // perte de qualité. Au-delà, chaque poste supprimé se paie en qualité.
  'hr.safe_reduction_rate': 0.18,
  // Repli seulement : la productivité de référence se dérive normalement du
  // rapport capacité/effectif du DAS lui-même. Une constante globale saturait
  // la charge sur les métiers capitalistiques.
  'hr.base_productivity': 900,

  // --- Alignement stratégique (doc 01) --------------------------------------
  //
  // Quatre étages, et non trois. Le SAG — conformité de chaque DAS aux
  // directives du groupe — a été prélevé sur le SAB et le SAC, qui le
  // masquaient : un DAS parfaitement cohérent AVEC LUI-MÊME mais qui ignorait
  // toutes les directives du siège obtenait le score maximal, ce qui vidait
  // la stratégie de groupe de toute conséquence.
  //
  //   SAB — chaque DAS est-il cohérent avec sa propre stratégie ?
  //   SAG — décline-t-il les directives du groupe, ou s'en écarte-t-il ?
  //   SAC — la configuration du groupe sert-elle sa stratégie corporate ?
  //   SAT — l'ensemble tient-il dans la durée ?
  'alignment.weight.sab': 0.44,
  'alignment.weight.sag': 0.20,
  'alignment.weight.sac': 0.28,
  'alignment.weight.sat': 0.08,
  'alignment.tolerance_band': 0.1,
  // Au-delà de 45 points d'écart, un axe est aussi faux qu'il peut l'être.
  // Sans ce plafond, une équipe incohérente sur tous les axes gardait un score
  // supérieur à 90 et le diagnostic de « milieu de gué » ne se déclenchait jamais.
  'alignment.saturation_gap': 0.45,
  'alignment.penalty_exponent': 1.5,
  'alignment.stuck_threshold': 55,
  'alignment.stuck_malus': 12,
  'alignment.drift_gap_threshold': 15,
  'alignment.drift_malus': 6,
  'alignment.margin_premium_max': 0.08,
  'alignment.margin_premium_pivot': 70,
  'alignment.synergy_saving_max': 0.12,
  'alignment.coordination_cost_max': 0.15,
  'alignment.hq_overhead_per_das': 0.004,
  'alignment.sat_change_malus': 20,
  'alignment.sat_improvement_bonus': 10,
  'alignment.initial_ia': 70,
  // Réorganiser coûte : cabinets, doublons transitoires, mois de flottement.
  // Exprimé en part de la masse salariale, seule assiette qui suive la taille
  // de l'entreprise sans dépendre d'un chiffre d'affaires encore inconnu.
  'structure.transition_cost_pct_of_payroll': 0.18,
  // Contracter n'est pas intégrer : un contrat sécurise l'amont tant qu'il
  // court, détenir le maillon le sécurise tout court. Un contrat vaut donc
  // la moitié d'une détention dans l'indice d'intégration verticale.
  'integration.contract_equivalence': 0.5,
  'integration.downstream_weight': 0.55,
  'integration.upstream_weight': 0.45,

  // --- Marché et prix (doc 02 §2) -------------------------------------------
  // Molettes de difficulté. Neutres par défaut : une session qui ne règle rien
  // se comporte exactement comme avant leur introduction.
  'market.growth_multiplier': 1,
  // Exposant appliqué à la compétitivité au moment du partage des parts.
  // 1 = strictement proportionnel : dix points d'avance donnent dix points de
  // part. C'est le comportement NEUTRE, et c'est le défaut : seule une molette
  // de difficulté explicitement posée le durcit. Un défaut à 1,8 aurait modifié
  // la répartition de toutes les sessions déjà en cours sans que personne
  // n'ait rien décidé.
  'market.competitiveness_exponent': 1,
  // Multiplicateur du rapport de force de l'ÉCOSYSTÈME : au-dessus de 1, les
  // fournisseurs et distributeurs sont plus durs, donc l'équipe est plus faible.
  'ecosystem.power_multiplier': 1,
  'market.price_position_floor_factor': 0.6,
  'market.price_position_span': 0.008,

  // --- Capacité (doc 02 §3) -------------------------------------------------
  'capacity.depreciation_per_round': 0.06,
  'capacity.commissioning_delay_rounds': 1,
  'capacity.underuse_threshold': 0.7,
  'capacity.underuse_penalty_factor': 0.5,
  'capacity.overuse_threshold': 0.95,
  'capacity.subcontracting_multiplier': 1.6,

  // --- Courbe d'expérience et automatisation (doc 02 §4) --------------------
  'learning.rate_default': 0.85,
  'learning.cost_floor_ratio': 0.55,
  'automation.variable_cost_reduction': 0.3,
  'automation.fixed_cost_increase': 0.5,

  // --- Amont (doc 02 §5) ----------------------------------------------------
  'procurement.power_base': 40,
  'procurement.power_volume_weight': 45,
  'procurement.power_volume_pivot': 0.3,
  'procurement.power_alternatives_weight': 15,
  'procurement.power_alternatives_pivot': 5,
  'procurement.power_switching_weight': 25,
  'procurement.max_discount': 0.18,
  // ── Coût de possession des stocks ────────────────────────────────────────
  // Ce que coûte, par tour, de laisser dormir de la matière ou des produits
  // finis : immobilisation de trésorerie, entreposage, obsolescence. Assis sur
  // le coût variable unitaire, l'ordre de grandeur retenu en industrie pour un
  // exercice. Sans lui, sur-acheter serait gratuit et le stock n'aurait aucun
  // coût d'opportunité — l'inverse exact de ce que l'écran enseigne.
  'inventory.holding_rate': 0.08,
  // ── Intégration verticale par rachat de maillon ──────────────────────────
  // Ce qu'on capte en rachetant son fournisseur : sa MARGE, qui cesse de
  // sortir de la maison. C'est structurellement plus qu'une remise de volume
  // (18 % au mieux), et c'est ce qui rend l'opération attractive — au prix de
  // l'immobilisation d'un maillon qu'il faut désormais faire tourner.
  'procurement.owned_margin_captured': 0.26,
  // Un fournisseur intégré ne rompt plus pour cause de désaccord commercial :
  // il reste le risque industriel, qu'on ne supprime jamais.
  'procurement.owned_reliability_floor': 92,
  // Amplitude des ruptures d'approvisionnement. Sans ce facteur, un fournisseur
  // à 45 % de fiabilité amputait jusqu'à 83 % de la capacité en un seul tour :
  // le signal était juste, son amplitude caricaturale.
  'procurement.disruption_scale': 0.35,

  // --- Aval (doc 02 §6) -----------------------------------------------------
  'distribution.power_base': 35,
  'distribution.power_notoriety_weight': 30,
  'distribution.power_volume_weight': 20,
  'distribution.power_volume_pivot': 0.25,
  'distribution.power_channel_weight': 15,
  'distribution.power_strength_weight': 30,
  'distribution.max_margin_reduction': 0.35,
  'distribution.coverage_headroom': 1.15,
  'distribution.own_network_coverage_per_mad': 6e-8,
  // Un distributeur racheté ne prend plus de marge, mais il coûte à faire
  // tourner : entrepôts, camions, vendeurs. On ne descend pas à zéro, sinon
  // l'intégration serait un gain sans contrepartie.
  'distribution.owned_operating_margin_pct': 0.06,

  // --- Qualité et notoriété (doc 02 §7) -------------------------------------
  'quality.obsolescence_per_round': 0.04,
  'quality.rd_coefficient': 45,
  // Intensité de R&D considérée comme un effort de référence (8 % du CA du DAS).
  // Exprimée en INTENSITÉ et non en montant : une référence absolue faisait
  // saturer la qualité à 100 sur les grands DAS, où tout budget réaliste la
  // dépassait d'un facteur dix.
  'quality.rd_reference_intensity': 0.08,
  'quality.weight.product': 0.55,
  'quality.weight.inputs': 0.2,
  'quality.weight.availability': 0.15,
  'quality.weight.service': 0.1,
  'notoriety.decay_per_round': 0.08,
  'notoriety.mkt_coefficient': 50,
  'notoriety.mkt_reference_intensity': 0.08,
  'stockout.notoriety_penalty': 12,
  'stockout.quality_penalty': 10,
  'segment.quality_shortfall_divisor': 2,

  // --- Chocs PESTEL ---------------------------------------------------------
  'pestel.shock_probability': 0.25,
  'pestel.shock_max_points': 15,
  'pestel.response_attenuate_cost_pct': 0.02,
  'pestel.response_absorb_cost_pct': 0.05,
  'pestel.response_reverse_cost_pct': 0.1,
  'pestel.response_attenuate_effect': 0.4,
  'pestel.response_absorb_effect': 0.75,
  'pestel.response_reverse_effect': 1.0,

  // --- Finance (doc 02 §9) --------------------------------------------------
  'finance.risk_margin_base': 0.015,
  'finance.risk_margin_per_leverage': 0.02,
  'finance.max_leverage_for_margin': 3,
  'finance.amortization_rounds': 5,
  'finance.bam_key_rate': 0.0225,

  // --- Fiscalité et social marocains ---------------------------------------
  // ⚠️ à revérifier avant chaque session
  'fiscal.is_rate_standard': 0.2,
  'fiscal.is_rate_high': 0.35,
  'fiscal.is_rate_bank_insurance': 0.4,
  'fiscal.is_high_threshold_mad': 100_000_000,
  'fiscal.is_minimum_contribution_pct': 0.0025,
  'fiscal.is_minimum_floor_mad': 3_000,
  'social.charges_patronales_pct': 0.2109,
  'social.smig_monthly_mad': 3_422.72,
  'social.recruitment_shock_threshold_pct': 0.2,

  // --- Compétences (axe B8 de l'alignement) ---------------------------------
  // Budget de formation par tête au-delà duquel l'effort est considéré maximal.
  'skill.training_reference_per_head_mad': 8_000,

  // --- Climat social --------------------------------------------------------
  'climate.recruitment_shock_malus': 15,
  'climate.restructuring_malus': 25,
  'climate.training_bonus': 10,
  'climate.capacity_impact_weight': 0.3,

  // --- Trésorerie -----------------------------------------------------------
  'treasury.surveillance_malus': 0.1,
  'treasury.restructuring_malus': 0.2,

  // --- Cession de DAS (doc 02 §11) -----------------------------------------
  'divest.integration_reference_pct': 0.2,
  'divest.value_loss_floor': 0.05,
  'divest.value_loss_ceiling': 0.45,
  'divest.value_loss_base': 0.45,
  'divest.value_loss_slope': 0.4,
  'divest.npc_discount_surveillance': 0.15,
  'divest.npc_discount_distress': 0.3,
  'divest.npc_base_factor': 0.85,
  'divest.npc_random_span': 0.15,

  // --- Océan bleu -----------------------------------------------------------
  'blue_ocean.margin_multiplier': 2.5,
  'blue_ocean.rounds': 2,
  'blue_ocean.entry_cost_pct': 0.15,
  'blue_ocean.failure_probability': 0.35,

  // --- Ansoff ---------------------------------------------------------------
  'ansoff.risk.penetration': 0.0,
  'ansoff.risk.developpement_marche': 0.12,
  'ansoff.risk.developpement_produit': 0.15,
  'ansoff.risk.diversification': 0.28,

  // --- Cabinet de conseil : le prix achète la précision (doc 00 §6) ---------
  // Le curseur pédagogique le plus sensible du jeu. Trop bon marché, les
  // équipes achètent tout et l'information cesse d'être un arbitrage ; trop
  // cher, elles jouent à l'aveugle et le débriefing n'a rien à raconter.
  'consulting.tier.express.price_multiplier': 0.35,
  'consulting.tier.express.error_margin': 0.25,
  'consulting.tier.standard.price_multiplier': 1.0,
  'consulting.tier.standard.error_margin': 0.1,
  'consulting.tier.approfondie.price_multiplier': 2.2,
  'consulting.tier.approfondie.error_margin': 0.03,

  // --- Dotation initiale (doc 03 §7) ---------------------------------------
  //
  // Appliquée uniformément à toutes les équipes. Il n'existe volontairement
  // aucun champ de dotation par équipe : l'asymétrie de départ est impossible
  // par construction, pas seulement par discipline.
  //
  // Les montants sont DÉRIVÉS du marché du DAS et de la taille du pool, jamais
  // absolus. Une version antérieure fixait 45 M DH de trésorerie et 12 % de
  // part de marché en dur : sur un pool de trois équipes, chacune subissait
  // 70 % de rupture dès le premier tour, et les DAS de tailles très
  // différentes (22 Md pour l'énergie, 190 Md pour l'agro) étaient dotés
  // identiquement. Ce sont désormais des ratios.

  // Capacité initiale = volume du marché ÷ nombre d'équipes du pool × ce
  // facteur. Légèrement sous 1 pour que la capacité soit rare dès le tour 1 et
  // que l'investissement compte, sans provoquer de rupture massive.
  'endowment.capacity_share_of_fair_split': 0.95,
  // Les postes de bilan sont exprimés en mois ou en multiples du CA de départ,
  // lui-même égal à capacité × prix de référence.
  'endowment.treasury_months_of_revenue': 2.5,
  'endowment.equity_ratio_of_revenue': 0.45,
  'endowment.debt_ratio_of_equity': 0.25,
  // Effectif : nombre d'unités produites par personne et par tour.
  'endowment.units_per_head': 14_000,
  'endowment.avg_salary_mad': 5_800,
  'endowment.quality': 50,
  'endowment.notoriety': 50,
  'endowment.climat_social': 70,
  'endowment.expert_share': 20,

  // --- M&A (réservé phase 5) ------------------------------------------------
  'ma.failure_prob_floor': 0.1,
  'ma.failure_prob_ceiling': 0.9,
  'ma.integration_budget_reference_pct': 0.2,
  'ma.notification_threshold_global_mad': 750_000_000,
} as const;

export type ParamKey = keyof typeof DEFAULT_PARAMS;

/**
 * Table de paramètres résolue pour une session : les valeurs de base écrasées
 * par celles stockées en base. Les clés inconnues sont conservées (les profils
 * d'alignement sont stockés sous des clés dynamiques `alignment.target.*`).
 */
export type EngineParams = Record<string, number>;

export function buildParams(overrides: Record<string, number> = {}): EngineParams {
  return { ...DEFAULT_PARAMS, ...overrides };
}

/**
 * Lit un paramètre. Lève si la clé est absente ET n'a pas de valeur par défaut :
 * un moteur qui calcule avec un paramètre implicite est un moteur qu'on ne peut
 * pas auditer.
 */
export function param(params: EngineParams, key: string): number {
  const value = params[key];
  if (value === undefined || Number.isNaN(value)) {
    throw new Error(`Paramètre moteur manquant ou invalide : « ${key} »`);
  }
  return value;
}

/** Variante tolérante, pour les clés dynamiques dont l'absence est légitime. */
export function paramOr(params: EngineParams, key: string, fallback: number): number {
  const value = params[key];
  return value === undefined || Number.isNaN(value) ? fallback : value;
}
