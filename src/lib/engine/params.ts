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
  // `capacity.commissioning_delay_rounds` retiré : le délai est STRUCTUREL.
  // L'instantané transporte le CAPEX du tour précédent (`commissionedCapexMad`),
  // ce qui fixe le délai à un tour par construction. Un réglage qui ne
  // pouvait rien changer valait moins que son absence.
  'capacity.underuse_threshold': 0.7,
  'capacity.underuse_penalty_factor': 0.5,
  'capacity.overuse_threshold': 0.95,
  'capacity.subcontracting_multiplier': 1.6,

  // --- Courbe d'expérience et automatisation (doc 02 §4) --------------------
  // Repli quand le référentiel du DAS ne fixe pas de taux d'apprentissage.
  // Lu par `load-snapshot` : la valeur était là depuis l'origine et personne
  // ne la consultait, un DAS sans taux héritait donc d'un zéro — soit un
  // exposant d'apprentissage infini.
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
  // ── La qualité PERÇUE porte déjà la sanction de la rupture ───────────────
  // `stockout.quality_penalty` a été retiré : il faisait double emploi avec
  // `quality.weight.availability`, qui prélève déjà la disponibilité dans la
  // qualité perçue — la seule qui entre dans la compétitivité. Une rupture ne
  // dégrade pas le PRODUIT, elle dégrade ce que le client en éprouve.
  'segment.quality_shortfall_divisor': 2,

  // --- Chocs PESTEL ---------------------------------------------------------
  //
  // Huit paramètres ont été RETIRÉS ici : deux de tirage aléatoire
  // (`shock_probability`, `shock_max_points`) et six de barème de réponse
  // (`response_*`). Aucun n'était lu, et aucun ne pouvait l'être : le
  // facilitateur tire les cartes lui-même depuis son écran, et il arbitre
  // l'ampleur au cas par cas avec le curseur de la salle de crise — lequel lit
  // la réponse ÉCRITE par l'équipe plutôt qu'un menu à trois options.
  //
  // Les laisser aurait entretenu une illusion coûteuse : un facilitateur qui
  // règle « probabilité de choc » avant une session croit doser l'aléa, et rien
  // ne se produit. Mieux vaut l'absence du réglage que son inertie.

  // --- Finance (doc 02 §9) --------------------------------------------------
  'finance.risk_margin_base': 0.015,
  'finance.risk_margin_per_leverage': 0.02,
  'finance.max_leverage_for_margin': 3,
  'finance.amortization_rounds': 5,
  'finance.bam_key_rate': 0.0225,

  // --- Capacité d'endettement -----------------------------------------------
  //
  // Deux critères de comité de crédit, le plus contraignant l'emportant : un
  // gearing au-delà de 2 ferme les portes, et l'encours total reste dans une
  // fraction du volume d'activité.
  'finance.debt_capacity_gearing_max': 2,
  // Part du chiffre d'affaires que l'encours total ne dépasse pas. Un multiple
  // d'EBITDA serait la convention du métier, mais l'EBITDA d'Atlas vaut environ
  // 1 % du chiffre d'affaires — la masse salariale absorbe les trois quarts de
  // la marge brute — et le plafond rendait alors zéro pour tout le monde.
  'finance.debt_capacity_revenue_share': 0.4,
  // Frais d'émission d'une augmentation de capital : la levée n'est pas
  // gratuite, et c'est ce qui interdit d'en faire un robinet sans coût.
  'finance.equity_issue_cost_pct': 0.02,

  // --- Investisseurs (voir `investors.ts`) ----------------------------------
  //
  // Ce que le marché des capitaux pense du Groupe, et le prix qu'il en fait
  // payer. Le coût des fonds propres est le rendement qu'un actionnaire marocain
  // exige d'une entreprise industrielle : il sert de ligne de flottaison.
  'investors.cost_of_equity': 0.12,
  'investors.weight.rentabilite': 0.3,
  'investors.weight.croissance': 0.2,
  'investors.weight.solidite': 0.2,
  'investors.weight.distribution': 0.15,
  'investors.weight.coherence': 0.15,
  // Part de l'opinion du tour précédent dans l'indice publié.
  'investors.memory': 0.4,
  // Croissance sous laquelle une entreprise est jugée « mûre », donc attendue
  // au guichet plutôt qu'au réinvestissement.
  'investors.mature_growth_threshold': 0.05,
  // Baisse du dividende tolérée avant que le marché n'y lise une inquiétude,
  // et les points retirés à la politique de dividende quand il la lit.
  'investors.dividend_cut_tolerance': 0.2,
  'investors.dividend_cut_signal': 30,
  // Décote d'émission au-dessus des frais de base : nulle au-dessus du seuil,
  // `issue_discount_max` quand plus personne ne veut du titre.
  'investors.issue_discount_max': 0.2,
  'investors.issue_discount_threshold': 60,
  // Plafond d'une levée, en part des fonds propres d'ouverture, de
  // l'attractivité nulle à l'attractivité maximale.
  'investors.raise_cap_min_equity_share': 0.1,
  'investors.raise_cap_max_equity_share': 1,
  // Écart de prime de risque bancaire, en points de taux, aux deux extrêmes.
  'investors.rate_span': 0.01,
  // ── Cash pooling ──────────────────────────────────────────────────────────
  // Ce qu'un domaine asséché perd en compétitivité, au maximum. Le malus est
  // proportionnel à la part de son besoin en fonds de roulement qu'on lui a
  // retirée : retirer l'équivalent d'un exercice de BFR coûte le plein.
  //
  // Un quart de la compétitivité est un coup dur sans être une exécution : le
  // levier doit rester jouable, sinon personne ne financera jamais son étoile
  // avec la trésorerie de sa vache à lait — et c'est pourtant l'arbitrage que
  // le référentiel financier demande de faire travailler.
  'finance.cash_drain_max_penalty': 0.25,

  // --- Frais de siège -------------------------------------------------------
  //
  // Un siège, c'est d'abord des gens : direction générale, finance, juridique,
  // systèmes, et les locaux qui vont avec. Il se dimensionne donc sur la MASSE
  // SALARIALE du groupe, la seule grandeur du jeu qui suive sa taille réelle.
  //
  // Le chiffre d'affaires serait la convention du métier — les management fees
  // d'un groupe marocain tournent autour de 2 % du CA — mais la dotation de
  // départ affiche un chiffre d'affaires deux fois et demie au-dessus du niveau
  // réellement joué. Assis dessus, le siège aurait absorbé l'essentiel de
  // l'EBITDA dès le premier tour. Un dixième de la masse salariale place la
  // charge là où ces 2 % la mettraient une fois la partie lancée.
  'finance.hq_opex_share_of_payroll': 0.1,
  // Un siège ne peut pas être gratuit : même réduit à sa plus simple
  // expression, il reste une direction, une paie et un bail. Le plancher vaut
  // 40 % de la référence, soit trois ou quatre tours de coupes maximales avant
  // de le toucher — l'arbitrage reste réel, la suppression n'existe pas.
  'finance.hq_opex_floor_share_of_payroll': 0.04,

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

  // --- Compétences : ce que le niveau de qualification fait à l'économie ----
  //
  // ── LE DÉFAUT CORRIGÉ ────────────────────────────────────────────────────
  // L'indice de compétence était calculé, persisté, affiché — et n'avait
  // AUCUNE conséquence économique. Former coûtait de la trésorerie et ne
  // rapportait qu'un chiffre sur un écran. La boucle que `hr.ts` annonce en
  // tête de fichier — « le climat pèse sur la compétence, donc sur la
  // productivité du tour suivant » — n'existait pas : elle se refermait sur
  // elle-même, du climat vers la compétence vers le climat.
  //
  // ── POURQUOI UN ÉCART, ET NON UN NIVEAU ──────────────────────────────────
  // Les deux coefficients ci-dessous s'appliquent à l'ÉCART entre l'indice de
  // compétence et celui dont l'équipe a HÉRITÉ (`endowment.expert_share`), et
  // non à l'indice lui-même. Une équipe qui n'a rien décidé n'est donc ni
  // récompensée ni punie : elle produit au coût et à la qualité de référence.
  // Un pivot arbitraire à 50 aurait taxé tout le monde dès le premier tour
  // pour une décision que personne n'avait prise.
  //
  // Ce que 100 points d'écart retirent au coût variable unitaire : moins de
  // rebut, moins de casse, moins de temps de réglage perdu.
  'skill.unit_cost_leverage': 0.15,
  // Ce que le même écart ajoute — ou retire — au rendement de la R&D. Un
  // budget de recherche confié à des gens qui ne savent pas l'exécuter produit
  // moins de qualité que le même budget entre des mains formées.
  'quality.skill_leverage': 0.5,

  // --- Compétences (axe B8 de l'alignement) ---------------------------------
  // Budget de formation par tête au-delà duquel l'effort est considéré maximal.
  'skill.training_reference_per_head_mad': 8_000,

  // --- Climat social --------------------------------------------------------
  //
  // Ces quatre valeurs étaient en base, modifiables par le facilitateur, et
  // AUCUNE n'était lue : `hr.ts` portait les mêmes grandeurs en dur. Un
  // facilitateur qui adoucissait le coût d'un plan social avant une session
  // n'adoucissait rien du tout.
  //
  // Points de climat perdus quand le recrutement du tour atteint le double du
  // seuil de choc — au-delà, le malus est plafonné. Il l'était auparavant à
  // une pente sans borne : recruter l'équivalent de son effectif coûtait
  // 48 points, soit plus qu'une fermeture de site.
  'climate.recruitment_shock_malus': 15,
  // Échelle du coût des restructurations. Les natures en prennent une part :
  // une réorganisation un quart, une externalisation sept dixièmes, une
  // fermeture de site un peu plus que le tout (voir `RESTRUCTURING_CLIMATE_SHARE`).
  'climate.restructuring_malus': 25,
  // Plafond du bonus de formation, en points de climat.
  'climate.training_bonus': 12,
  // ── LA SORTIE DE LA BOUCLE RH ────────────────────────────────────────────
  // Ce qu'un climat effondré retire à la capacité de production : absentéisme,
  // conflictualité, rebuts, gestes de mauvaise volonté. Le pivot est 60 — le
  // même que celui vers lequel le climat revient spontanément et celui à partir
  // duquel la rotation s'aggrave. Au-dessus, rien ne se perd ; à zéro, on perd
  // ce poids-là de la capacité installée.
  //
  // C'est par ce paramètre que la RH cesse d'être une pièce fermée : sans lui,
  // le climat social ne coûtait pas une unité produite.
  'climate.capacity_impact_weight': 0.3,
  // ── POURQUOI UN SECOND CANAL, ET NON LE SEUL PLAFOND DE CAPACITÉ ─────────
  //
  // Vérifié sur une session réelle : la capacité installée y valait deux fois
  // et demie la demande. Un climat effondré retirait bien 12 % de l'outil, et
  // cela ne changeait RIEN — il restait de la marge. La sanction n'existait
  // que pour une équipe déjà saturée, soit l'inverse de la pédagogie visée :
  // la mauvaise gestion sociale passait inaperçue tant qu'on avait des murs.
  //
  // Ce que la dégradation du climat ajoute au coût variable unitaire est, lui,
  // toujours payé : heures supplémentaires pour couvrir les absences, reprises,
  // rebuts, malfaçons. Les deux canaux sont vrais en atelier, et ensemble ils
  // font que le climat coûte quoi qu'il arrive — plus cher encore quand
  // l'équipe est tendue sur sa capacité.
  'climate.unit_cost_penalty': 0.12,

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
  // Lues par CLÉ DYNAMIQUE : `ansoffRisk` compose `ansoff.risk.${mouvement}`.
  // Un audit qui cherche la chaîne littérale ne les trouvera pas — elles sont
  // bien branchées, et supprimer l'une d'elles rendrait son mouvement gratuit.
  'ansoff.risk.penetration': 0.0,
  'ansoff.risk.developpement_marche': 0.12,
  'ansoff.risk.developpement_produit': 0.15,
  'ansoff.risk.diversification': 0.28,

  // --- Cabinet de conseil : le prix achète la précision (doc 00 §6) ---------
  // Le curseur pédagogique le plus sensible du jeu. Trop bon marché, les
  // équipes achètent tout et l'information cesse d'être un arbitrage ; trop
  // cher, elles jouent à l'aveugle et le débriefing n'a rien à raconter.
  // Ces marges DOIVENT rester alignées sur `TIER_PROFILES` : c'est la valeur
  // du paramètre qui gagne, la constante ne servant que de repli. Les
  // désaccorder ferait annoncer une précision au facilitateur et en appliquer
  // une autre aux équipes. Lues par clé dynamique, comme les risques d'Ansoff :
  // `tierProfile` compose `consulting.tier.${palier}.*`.
  'consulting.tier.express.price_multiplier': 0.35,
  'consulting.tier.express.error_margin': 0.1,
  'consulting.tier.standard.price_multiplier': 1.0,
  'consulting.tier.standard.error_margin': 0.05,
  'consulting.tier.approfondie.price_multiplier': 2.2,
  'consulting.tier.approfondie.error_margin': 0.02,

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
  // ── Pourquoi 7 % et non 25 % ──────────────────────────────────────────────
  //
  // La dotation adossait la dette aux capitaux propres, eux-mêmes adossés au
  // chiffre d'affaires ATTENDU — lequel est deux fois et demie supérieur à
  // celui que les équipes réalisent réellement. Résultat : un encours de
  // 10,15 Md pour un EBITDA de 1,38 Md, soit SEPT ANNÉES de remboursement.
  //
  // Aucune banque ne prête à un groupe dans cet état, et le constat s'est
  // imposé en branchant la capacité d'endettement : elle valait zéro dès le
  // premier tour, pour toutes les équipes, définitivement. Le curseur de crédit
  // n'aurait jamais pu bouger vers la droite.
  //
  // À 7 %, l'encours de départ vaut environ deux années d'EBITDA : le groupe
  // hérite d'une dette réelle, qui coûte des intérêts et pèse sur le levier,
  // mais il lui reste de la marge pour emprunter — et il peut la perdre en
  // laissant filer sa marge.
  'endowment.debt_ratio_of_equity': 0.07,
  // Effectif : nombre d'unités produites par personne et par tour.
  'endowment.units_per_head': 14_000,
  'endowment.avg_salary_mad': 5_800,
  'endowment.quality': 50,
  'endowment.notoriety': 50,
  'endowment.climat_social': 70,
  'endowment.expert_share': 20,

  // --- M&A ------------------------------------------------------------------
  //
  // Les quatre paramètres `ma.*` ont été retirés : les acquisitions sont
  // arrivées, et elles lisent les paramètres de CESSION (`divest.*`) — c'est
  // la même mécanique, vue de l'acheteur plutôt que du vendeur. Deux jeux de
  // réglages pour un seul calcul, c'était la garantie qu'un facilitateur
  // règle celui qui ne sert pas.
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
