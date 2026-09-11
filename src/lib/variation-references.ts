/**
 * ATLAS — la référence de chaque champ piloté en écart.
 *
 * Un curseur de variation a besoin d'un point de départ. C'est la valeur du
 * TOUR PRÉCÉDENT, sauf au premier tour — et sauf quand l'équipe avait mis le
 * poste à zéro, car tout pourcentage de zéro vaut zéro et elle ne pourrait
 * plus jamais y revenir.
 *
 * D'où la dotation : une référence de repli, calculée sur les grandeurs que
 * l'écran affiche déjà (trésorerie, masse salariale, effectif), identique pour
 * toutes les équipes au premier tour. Les proportions ci-dessous ne sont pas
 * arbitraires : elles reproduisent l'ordre de grandeur de ces postes dans un
 * compte d'exploitation industriel.
 *
 * Les clés sont celles du catalogue de modules (`modules-catalog.ts`) : un seul
 * vocabulaire pour désigner un champ dans toute l'application.
 */

import type { VariationFamily } from './variation-scale';

/** Les grandeurs sur lesquelles se calculent les dotations. */
export interface VariationBasis {
  /** Trésorerie d'ouverture du groupe. */
  treasuryMad: number;
  /** Masse salariale du domaine, ou du groupe selon l'écran. */
  payrollMad: number;
  /** Effectif du domaine. */
  headcount: number;
  /** Salaire minimum légal, plancher de toute politique salariale. */
  smigMad: number;
  /** Marge brute répartissable entre les directions. */
  operatingBudgetMad: number;
  /** Nombre de directions à doter. */
  directionCount: number;
}

interface VariationFieldSpec {
  family: VariationFamily;
  /** Référence de repli, quand il n'y a pas de tour précédent exploitable. */
  endowment: (basis: VariationBasis) => number;
}

const SPECS: Readonly<Record<string, VariationFieldSpec>> = {
  // ── Stratégie du DAS ──────────────────────────────────────────────────────
  // L'outil de production est le premier poste d'un industriel ; le réseau de
  // vente propre, le dernier qu'on se paie.
  'das.capex_capacity': { family: 'investissement', endowment: (b) => b.treasuryMad * 0.08 },
  'das.capex_automation': { family: 'investissement', endowment: (b) => b.treasuryMad * 0.05 },
  'das.capex_own_network': { family: 'investissement', endowment: (b) => b.treasuryMad * 0.03 },
  'das.rd_budget': { family: 'innovation', endowment: (b) => b.treasuryMad * 0.03 },
  'das.marketing_budget': { family: 'marketing', endowment: (b) => b.treasuryMad * 0.04 },

  // ── Finance du Groupe ─────────────────────────────────────────────────────
  // Le siège se dimensionne sur la masse salariale du groupe, et non sur sa
  // trésorerie : un siège, ce sont des gens et leurs locaux, pas un placement.
  // La proportion est celle de `finance.hq_opex_share_of_payroll`, recopiée ici
  // parce que ce module est client — un écran ne peut pas lire les paramètres
  // de session. C'est un REPLI : la vraie valeur vient du provisionnement, puis
  // du tour précédent.
  'finance.opex': { family: 'siege', endowment: (b) => b.payrollMad * 0.1 },
  // Le crédit net ne se pilote PAS en écart : ses bornes sont posées par la
  // banque — tout rembourser d'un côté, la capacité d'endettement de l'autre —
  // et non par un pourcentage du tour précédent. Il n'a donc pas de référence
  // de dotation, et l'écran lui donne son propre curseur.
  'finance.capital_raise': { family: 'credit', endowment: (b) => b.treasuryMad * 0.15 },
  'finance.dividend': { family: 'credit', endowment: (b) => b.treasuryMad * 0.05 },

  // ── Organisation & RH ─────────────────────────────────────────────────────
  // Le droit de tirage OFPPT est de 1,6 % de la masse salariale : c'est le
  // repère que connaissent les entreprises marocaines, et donc la dotation.
  'org.training_budget': { family: 'formation', endowment: (b) => b.payrollMad * 0.016 },
  // Un salaire moyen part du SMIG majoré : un industriel qui paierait le
  // minimum strict n'aurait ni techniciens ni cadres.
  'org.avg_salary': { family: 'salaire', endowment: (b) => b.smigMad * 1.6 },
  'org.hire_operateurs': { family: 'recrutement', endowment: (b) => b.headcount * 0.04 },
  'org.hire_techniciens': { family: 'recrutement', endowment: (b) => b.headcount * 0.02 },
  'org.hire_experts': { family: 'recrutement', endowment: (b) => b.headcount * 0.008 },
  'org.hire_cadres': { family: 'recrutement', endowment: (b) => b.headcount * 0.008 },
  'org.layoffs': { family: 'depart', endowment: (b) => b.headcount * 0.03 },
  'org.internal_transfers': { family: 'recrutement', endowment: (b) => b.headcount * 0.01 },
  'org.budgets': {
    family: 'budget_direction',
    endowment: (b) =>
      b.directionCount > 0 ? b.operatingBudgetMad / b.directionCount : b.operatingBudgetMad,
  },
  'org.positions': { family: 'poste', endowment: (b) => Math.max(b.headcount * 0.02, 1) },

  // ── Achats ────────────────────────────────────────────────────────────────
  'marches.procurement': { family: 'achat_volume', endowment: () => 0 },

  // ── Curseurs de positionnement (indices de 0 à 100) ──────────────────────
  // La dotation est le milieu de l'échelle : un positionnement neutre.
  'das.price_position': { family: 'indice', endowment: () => 50 },
  'org.delegation': { family: 'indice', endowment: () => 50 },
  'org.shared_resources': { family: 'indice', endowment: () => 0 },
};

export function variationFamilyOf(fieldKey: string): VariationFamily | undefined {
  return SPECS[fieldKey]?.family;
}

/** Référence de dotation d'un champ, arrondie — on ne recrute pas 4,7 personnes. */
export function endowmentReference(fieldKey: string, basis: VariationBasis): number {
  const spec = SPECS[fieldKey];
  if (!spec) return 0;
  return Math.max(Math.round(spec.endowment(basis)), 0);
}

/** Les champs pilotés en écart, pour les tests et le panneau de réglage. */
export const VARIATION_FIELD_KEYS: readonly string[] = Object.keys(SPECS);
