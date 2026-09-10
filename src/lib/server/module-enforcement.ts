import 'server-only';

/**
 * ATLAS — un champ fermé ne s'écrit pas.
 *
 * Les Server Functions et les Route Handlers sont joignables par POST direct :
 * masquer un bloc dans l'interface ne le protège pas. Ce module est le garde
 * côté serveur, et il ne se contente pas de refuser.
 *
 * ── POURQUOI ÉCRASER PLUTÔT QUE REFUSER ────────────────────────────────────
 * Les écrans envoient des objets ENTIERS (« voici toute la stratégie de ce
 * domaine »), jamais des champs isolés. Refuser tout envoi contenant un champ
 * fermé bloquerait donc les saisies légitimes des champs voisins. On remplace
 * plutôt la valeur reçue par celle du tour précédent : le champ fermé devient
 * inerte, et le reste de l'envoi passe.
 *
 * Faute de tour précédent — un champ jamais ouvert — c'est la valeur neutre du
 * catalogue qui s'applique, portée par les constantes de défaut existantes.
 */

import {
  CORPORATE_DEFAULTS,
  FINANCE_DEFAULTS,
  type CorporateValues,
  type FinanceValues,
} from '../decision-types';
import { isOn, type EnabledModules } from '../modules-state';
import { endowmentReference, variationFamilyOf, type VariationBasis } from '../variation-references';
import {
  clampVariation,
  referenceOr,
  valueFromVariation,
  variationFromValue,
  type VariationScale,
} from '../variation-scale';
import { createAdminClient } from '../supabase/server';

type Admin = ReturnType<typeof createAdminClient>;

/** Bloc entièrement fermé : l'envoi n'a aucune raison d'exister. */
export class ModuleClosedError extends Error {
  constructor(what: string) {
    super(`« ${what} » n’est pas ouvert sur cette session.`);
    this.name = 'ModuleClosedError';
  }
}

/**
 * Remplace, dans `incoming`, chaque champ fermé par la valeur de référence.
 * `mapping` associe la clé du module au nom du champ dans l'objet.
 */
function keepClosed<T extends object>(
  incoming: T,
  reference: object,
  modules: EnabledModules,
  mapping: Readonly<Record<string, string>>,
): T {
  const source = reference as Record<string, unknown>;
  const result = { ...incoming } as Record<string, unknown>;
  for (const [moduleKey, field] of Object.entries(mapping)) {
    if (!isOn(modules, moduleKey)) result[field] = source[field];
  }
  return result as T;
}

export const CORPORATE_FIELDS: Readonly<Record<string, string>> = {
  'strategie.corporate_strategy': 'corporateStrategy',
  'strategie.structure_type': 'structureType',
  'strategie.central_purchasing': 'centralPurchasing',
  'strategie.central_it': 'centralIt',
  'strategie.central_rd': 'centralRd',
  'strategie.central_hr': 'centralHr',
  'strategie.central_finance': 'centralFinance',
  'strategie.shared_production': 'sharedProduction',
  'strategie.shared_rd': 'sharedRd',
  'strategie.value1': 'value1',
  'strategie.value2': 'value2',
  'strategie.vision': 'vision',
  'strategie.mission': 'mission',
};

export async function enforceCorporate<T extends object>(
  admin: Admin,
  teamId: string,
  roundNumber: number,
  incoming: T,
  modules: EnabledModules,
): Promise<T> {
  const { data } = await admin
    .from('team_round_strategy')
    .select(
      'corporate_strategy, structure_type, central_purchasing, central_it, central_rd, central_hr, central_finance, shared_production, shared_rd, value_1, value_2, vision, mission',
    )
    .eq('team_id', teamId)
    .lt('round_number', roundNumber)
    .order('round_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  const reference: CorporateValues = data
    ? {
        corporateStrategy: String(data.corporate_strategy),
        structureType: String(data.structure_type),
        centralPurchasing: Boolean(data.central_purchasing),
        centralIt: Boolean(data.central_it),
        centralRd: Boolean(data.central_rd),
        centralHr: Boolean(data.central_hr),
        centralFinance: Boolean(data.central_finance),
        sharedProduction: Boolean(data.shared_production),
        sharedRd: Boolean(data.shared_rd),
        value1: String(data.value_1),
        value2: String(data.value_2),
        vision: data.vision === null ? null : String(data.vision),
        mission: data.mission === null ? null : String(data.mission),
      }
    : CORPORATE_DEFAULTS;

  return keepClosed(incoming, reference, modules, CORPORATE_FIELDS);
}

export const DAS_FIELDS: Readonly<Record<string, string>> = {
  'das.capex_capacity': 'capexCapacityMad',
  'das.capex_automation': 'capexAutomationMad',
  'das.capex_own_network': 'capexOwnNetworkMad',
  'das.rd_budget': 'rdBudgetMad',
  'das.marketing_budget': 'marketingBudgetMad',
  'das.declare_blue_ocean': 'declareBlueOcean',
};

export async function enforceDas<T extends object>(
  admin: Admin,
  teamId: string,
  dasId: string,
  roundNumber: number,
  incoming: T,
  modules: EnabledModules,
  /** Fourni sur les chemins d'écriture : borne aussi les montants. */
  limits?: { scales: Readonly<Record<string, VariationScale>>; basis: VariationBasis },
): Promise<T> {
  const { data } = await admin
    .from('das_decisions')
    .select(
      'capex_capacity_mad, capex_automation_mad, capex_own_network_mad, rd_budget_mad, marketing_budget_mad, declare_blue_ocean',
    )
    .eq('team_id', teamId)
    .eq('das_id', dasId)
    .lt('round_number', roundNumber)
    .order('round_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  const reference = {
    capexCapacityMad: Number(data?.capex_capacity_mad ?? 0),
    capexAutomationMad: Number(data?.capex_automation_mad ?? 0),
    capexOwnNetworkMad: Number(data?.capex_own_network_mad ?? 0),
    rdBudgetMad: Number(data?.rd_budget_mad ?? 0),
    marketingBudgetMad: Number(data?.marketing_budget_mad ?? 0),
    declareBlueOcean: Boolean(data?.declare_blue_ocean ?? false),
  };

  const kept = keepClosed(incoming, reference, modules, DAS_FIELDS);
  return limits
    ? clampToScales(kept, reference, limits.scales, DAS_FIELDS, limits.basis)
    : kept;
}

export const FINANCE_FIELDS: Readonly<Record<string, string>> = {
  'finance.opex': 'opexMad',
  'finance.debt_drawn': 'debtDrawnMad',
  'finance.debt_repaid': 'debtRepaidMad',
  'finance.tax_regime': 'taxRegime',
};

export async function enforceFinance<T extends object>(
  admin: Admin,
  teamId: string,
  roundNumber: number,
  incoming: T,
  modules: EnabledModules,
  limits?: { scales: Readonly<Record<string, VariationScale>>; basis: VariationBasis },
): Promise<T> {
  const { data } = await admin
    .from('financial_budgets')
    .select('opex_mad, debt_drawn_mad, debt_repaid_mad, tax_regime')
    .eq('team_id', teamId)
    .lt('round_number', roundNumber)
    .order('round_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  const reference: FinanceValues = data
    ? {
        // Un crédit ne se reconduit PAS : reprendre le tirage du tour précédent
        // ferait réemprunter l'équipe chaque tour sans qu'elle l'ait demandé.
        // Seuls les postes récurrents se reconduisent.
        opexMad: Number(data.opex_mad ?? 0),
        debtDrawnMad: 0,
        debtRepaidMad: 0,
        taxRegime: String(data.tax_regime ?? FINANCE_DEFAULTS.taxRegime),
      }
    : FINANCE_DEFAULTS;

  const kept = keepClosed(incoming, reference, modules, FINANCE_FIELDS);
  return limits
    ? clampToScales(kept, reference, limits.scales, FINANCE_FIELDS, limits.basis)
    : kept;
}

export const HR_FIELDS: Readonly<Record<string, string>> = {
  'org.hire_operateurs': 'hireOperateurs',
  'org.hire_techniciens': 'hireTechniciens',
  'org.hire_experts': 'hireExperts',
  'org.hire_cadres': 'hireCadres',
  'org.layoffs': 'layoffs',
  'org.avg_salary': 'avgSalaryBrutMad',
  'org.internal_transfers': 'internalTransfersIn',
  'org.training_budget': 'trainingBudgetMad',
  'org.training_focus': 'trainingFocus',
  'org.claim_ofppt': 'claimOfppt',
  'org.claim_giac': 'claimGiac',
  'org.skills_audit': 'orderSkillsAudit',
  'org.restructuring': 'restructuring',
};

export async function enforceHr<T extends object>(
  admin: Admin,
  teamId: string,
  dasId: string,
  roundNumber: number,
  incoming: T,
  modules: EnabledModules,
  /** Fourni sur les chemins d'écriture : borne aussi les montants. */
  limits?: { scales: Readonly<Record<string, VariationScale>>; basis: VariationBasis },
): Promise<T> {
  const { data } = await admin
    .from('das_hr_decisions')
    .select(
      'avg_salary_brut_mad, training_budget_mad, training_focus, claim_ofppt, claim_giac, order_skills_audit, restructuring',
    )
    .eq('team_id', teamId)
    .eq('das_id', dasId)
    .lt('round_number', roundNumber)
    .order('round_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Les FLUX (recrutements, départs, transferts) ne se reconduisent pas : ils
  // décrivent un mouvement du tour, pas un état. Reconduire un départ, ce
  // serait licencier deux fois. Les niveaux, eux, persistent.
  const reference = {
    hireOperateurs: 0,
    hireTechniciens: 0,
    hireExperts: 0,
    hireCadres: 0,
    layoffs: 0,
    internalTransfersIn: 0,
    avgSalaryBrutMad: Number(data?.avg_salary_brut_mad ?? 5800),
    trainingBudgetMad: Number(data?.training_budget_mad ?? 0),
    trainingFocus: String(data?.training_focus ?? 'technique'),
    claimOfppt: Boolean(data?.claim_ofppt ?? false),
    claimGiac: Boolean(data?.claim_giac ?? false),
    orderSkillsAudit: Boolean(data?.order_skills_audit ?? false),
    restructuring: String(data?.restructuring ?? 'aucune'),
  };

  const kept = keepClosed(incoming, reference, modules, HR_FIELDS);
  return limits
    ? clampToScales(kept, reference, limits.scales, HR_FIELDS, limits.basis)
    : kept;
}

export const DIRECTIVES_FIELDS: Readonly<Record<string, string>> = {
  'org.portfolio_role': 'portfolioRole',
  'org.hq_purchasing': 'hqPurchasing',
  'org.hq_it': 'hqIt',
  'org.hq_rd': 'hqRd',
  'org.hq_hr': 'hqHr',
  'org.hq_finance': 'hqFinance',
};

export async function enforceDirectives<T extends object>(
  admin: Admin,
  teamId: string,
  dasId: string,
  roundNumber: number,
  incoming: T,
  modules: EnabledModules,
): Promise<T> {
  const { data } = await admin
    .from('das_group_directives')
    .select('portfolio_role, hq_purchasing, hq_it, hq_rd, hq_hr, hq_finance')
    .eq('team_id', teamId)
    .eq('das_id', dasId)
    .lt('round_number', roundNumber)
    .order('round_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  const reference = {
    portfolioRole: String(data?.portfolio_role ?? 'relais'),
    hqPurchasing: Boolean(data?.hq_purchasing ?? false),
    hqIt: Boolean(data?.hq_it ?? false),
    hqRd: Boolean(data?.hq_rd ?? false),
    hqHr: Boolean(data?.hq_hr ?? false),
    // La finance est déléguée par défaut en base (migration 0011) : la valeur
    // neutre du champ doit être celle du schéma, pas `false`.
    hqFinance: Boolean(data?.hq_finance ?? true),
  };

  return keepClosed(incoming, reference, modules, DIRECTIVES_FIELDS);
}

/**
 * Ramène les montants dans les fourchettes du facilitateur.
 *
 * Les curseurs bornent déjà la saisie, mais un POST direct les contourne. Sans
 * ce clamp, une équipe pourrait engager dix fois ce que la fourchette autorise
 * et le calibrage de l'atelier ne vaudrait plus rien.
 *
 * `mapping` est celui déjà utilisé pour la neutralisation : un seul endroit
 * décrit la correspondance clé de module → nom de champ.
 */
export function clampToScales<T extends object>(
  incoming: T,
  reference: object,
  scales: Readonly<Record<string, VariationScale>>,
  mapping: Readonly<Record<string, string>>,
  basis: VariationBasis,
): T {
  const result = { ...incoming } as Record<string, unknown>;
  const previous = reference as Record<string, unknown>;

  for (const [moduleKey, field] of Object.entries(mapping)) {
    const family = variationFamilyOf(moduleKey);
    const scale = family ? scales[family] : undefined;
    if (!scale) continue;

    const asked = result[field];
    if (typeof asked !== 'number' || !Number.isFinite(asked)) continue;

    const before = previous[field];
    const base = referenceOr(
      typeof before === 'number' ? before : 0,
      endowmentReference(moduleKey, basis),
    );
    if (base <= 0) continue;

    const bounded = clampVariation(variationFromValue(base, asked), scale.bounds);
    result[field] = valueFromVariation(base, bounded);
  }

  return result as T;
}

/** Blocs qui n'existent qu'en entier : fermés, l'envoi est refusé. */
export function requireOpen(modules: EnabledModules, moduleKey: string, what: string): void {
  if (!isOn(modules, moduleKey)) throw new ModuleClosedError(what);
}
