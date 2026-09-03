import 'server-only';

/**
 * Contexte de saisie : tout ce dont les écrans de décision ont besoin.
 *
 * Assemblé une fois, côté serveur, avec le client ANONYME — donc soumis à la
 * RLS. Si une politique était mal écrite, ces écrans ne verraient rien plutôt
 * que de voir trop.
 */

import { decisionsAreOpen, getRoundState, requireTeam } from '@/lib/dal';
import type {
  ActorEntry,
  DasEntry,
  DecisionContext,
} from '@/lib/decision-types';
import { createServerClient } from '@/lib/supabase/server';

export type { ActorEntry, DasEntry, DecisionContext } from '@/lib/decision-types';

type Row = Record<string, unknown>;
const num = (v: unknown, d = 0) => (typeof v === 'number' ? v : Number(v ?? d) || d);
const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);
const bool = (v: unknown, d = false) => (typeof v === 'boolean' ? v : d);

export async function loadDecisionContext(): Promise<DecisionContext> {
  const team = await requireTeam();
  const round = await getRoundState(team.sessionId);
  const roundNumber = (round?.current_round as number) ?? 0;
  const previous = roundNumber - 1;

  const supabase = await createServerClient();

  const [
    { data: units }, { data: segments }, { data: decisions },
    { data: strategy }, { data: hr }, { data: budget },
    { data: previousBudget }, { data: pnl }, { data: state },
    { data: procurement }, { data: distribution }, { data: actors },
  ] = await Promise.all([
    // `listed_for_sale` est inclus : un DAS mis en vente doit continuer à être
    // piloté jusqu'à la résolution. La cession ne se dénoue qu'à ce moment-là,
    // et une annonce peut être retirée — le laisser sans décisions le ferait
    // tourner à vide pendant tout le tour.
    supabase.from('team_units')
      .select('das_id, strategic_units(id, name, sector_key)')
      .eq('team_id', team.teamId).in('status', ['active', 'listed_for_sale']),
    supabase.from('market_segments').select('id, das_id, segment_key, name'),
    supabase.from('das_decisions').select('*').eq('team_id', team.teamId).eq('round_number', roundNumber),
    supabase.from('team_round_strategy').select('*').eq('team_id', team.teamId).eq('round_number', roundNumber).maybeSingle(),
    supabase.from('hr_metrics').select('*').eq('team_id', team.teamId).eq('round_number', roundNumber).maybeSingle(),
    supabase.from('financial_budgets').select('*').eq('team_id', team.teamId).eq('round_number', roundNumber).maybeSingle(),
    supabase.from('financial_budgets').select('*').eq('team_id', team.teamId).eq('round_number', previous).maybeSingle(),
    supabase.from('pnl_statements').select('treasury_end_mad').eq('team_id', team.teamId).eq('round_number', previous).maybeSingle(),
    supabase.from('team_round_state').select('headcount').eq('team_id', team.teamId).eq('round_number', previous).maybeSingle(),
    // `lte` : les contrats sont RECONDUITS tant qu'on ne les renégocie pas.
    // L'équipe hérite d'un portefeuille amont et aval de l'exercice précédent ;
    // l'écran doit le lui montrer, pas lui présenter une page blanche.
    supabase.from('procurement_contracts').select('*').eq('team_id', team.teamId).lte('round_number', roundNumber),
    supabase.from('distribution_contracts').select('*').eq('team_id', team.teamId).lte('round_number', roundNumber),
    // L'annuaire de l'écosystème : identité seulement. Capacités, fiabilités et
    // santé financière sont vendues par le cabinet.
    supabase.from('ecosystem_actors').select('id, name, region_key, das_id, actor_type')
      .in('actor_type', ['fournisseur', 'distributeur']),
  ]);

  const das: DasEntry[] = (units ?? []).map((u) => {
    const unit = u.strategic_units as unknown as { id: string; name: string; sector_key: string } | null;
    const dasId = str(u.das_id);
    const decision = (decisions ?? []).find((d) => str(d.das_id) === dasId) as Row | undefined;

    return {
      dasId,
      name: unit?.name ?? 'DAS',
      sectorKey: unit?.sector_key ?? '',
      segments: (segments ?? [])
        .filter((s) => str(s.das_id) === dasId)
        .map((s) => ({ key: str(s.segment_key), name: str(s.name) })),
      decision: decision
        ? {
            genericStrategy: str(decision.generic_strategy, 'domination_couts'),
            pricePosition: num(decision.price_position, 50),
            servedSegments: (decision.served_segments as string[]) ?? [],
            capexCapacityMad: num(decision.capex_capacity_mad),
            capexAutomationMad: num(decision.capex_automation_mad),
            capexOwnNetworkMad: num(decision.capex_own_network_mad),
            rdBudgetMad: num(decision.rd_budget_mad),
            marketingBudgetMad: num(decision.marketing_budget_mad),
            declareBlueOcean: bool(decision.declare_blue_ocean),
          }
        : null,
      procurement: inForce(procurement as Row[] | null, dasId)
        .map((p) => ({ supplierId: str(p.supplier_id), committedVolume: num(p.committed_volume) })),
      distribution: inForce(distribution as Row[] | null, dasId)
        .map((d) => ({ distributorId: str(d.distributor_id), volumeShare: num(d.volume_share) })),
      suppliers: (actors ?? [])
        .filter((a) => str(a.das_id) === dasId && str(a.actor_type) === 'fournisseur')
        .map(toActor),
      distributors: (actors ?? [])
        .filter((a) => str(a.das_id) === dasId && str(a.actor_type) === 'distributeur')
        .map(toActor),
    };
  });

  return {
    team,
    roundNumber,
    status: str(round?.status, 'draft'),
    decisionsOpen: decisionsAreOpen(round?.status as string),
    treasuryMad: num(pnl?.treasury_end_mad),
    headcount: num(state?.headcount),
    avgSalaryMad: num(hr?.avg_salary_brut_mad, 5800),
    debtOutstandingMad: num(previousBudget?.debt_outstanding_mad),
    corporate: strategy
      ? {
          corporateStrategy: str(strategy.corporate_strategy, 'specialisation'),
          structureType: str(strategy.structure_type, 'fonctionnelle'),
          centralPurchasing: bool(strategy.central_purchasing),
          centralIt: bool(strategy.central_it),
          centralRd: bool(strategy.central_rd),
          centralHr: bool(strategy.central_hr),
          centralFinance: bool(strategy.central_finance, true),
          sharedProduction: bool(strategy.shared_production),
          sharedRd: bool(strategy.shared_rd),
          value1: str(strategy.value_1, 'fiabilite_service'),
          value2: str(strategy.value_2, 'efficience_operationnelle'),
          vision: strategy.vision ? str(strategy.vision) : null,
          mission: strategy.mission ? str(strategy.mission) : null,
        }
      : null,
    hr: hr
      ? {
          hireOperateurs: num(hr.hire_operateurs),
          hireTechniciens: num(hr.hire_techniciens),
          hireExperts: num(hr.hire_experts),
          hireCadres: num(hr.hire_cadres),
          avgSalaryBrutMad: num(hr.avg_salary_brut_mad, 5800),
          trainingBudgetMad: num(hr.training_budget_mad),
          restructuringCount: num(hr.restructuring_count),
        }
      : null,
    finance: budget
      ? {
          opexMad: num(budget.opex_mad),
          debtDrawnMad: num(budget.debt_drawn_mad),
          debtRepaidMad: num(budget.debt_repaid_mad),
          taxRegime: str(budget.tax_regime, 'droit_commun'),
        }
      : null,
    das,
    // Plancher légal et charges : affichés côté client pour le retour immédiat,
    // TOUJOURS revalidés côté serveur — ils changent par décret.
    smigMad: 3422.72,
    chargesPatronalesPct: 0.2109,
  };
}

function toActor(a: Row): ActorEntry {
  return { id: str(a.id), name: str(a.name), regionKey: a.region_key ? str(a.region_key) : null };
}

/**
 * Décisions obligatoires encore manquantes.
 *
 * Alimente le compteur de la barre de validation : une équipe doit savoir ce
 * qui lui manque sans parcourir les trois écrans.
 */
export function missingDecisions(context: DecisionContext) {
  const missing: { label: string; href: string }[] = [];

  if (!context.corporate) {
    missing.push({ label: 'stratégie corporate', href: '/strategie' });
  }
  for (const das of context.das) {
    if (!das.decision) {
      missing.push({ label: `stratégie ${das.name}`, href: '/strategie' });
    }
    if (das.distribution.length === 0) {
      // Sans distributeur, la couverture est nulle et l'équipe ne vend RIEN.
      missing.push({ label: `distribution ${das.name}`, href: '/marches' });
    }
    if (das.procurement.length === 0) {
      missing.push({ label: `achats ${das.name}`, href: '/marches' });
    }
  }
  if (!context.finance) {
    missing.push({ label: 'budget', href: '/finance' });
  }

  return missing;
}

/**
 * Contrats EN VIGUEUR sur un DAS, parmi les lignes de tous les tours écoulés.
 *
 * Même règle que côté moteur (`load-snapshot.ts`) : on retient le tour le plus
 * récent où l'équipe a contracté, et lui seul. Renégocier remplace le
 * portefeuille, ne s'y ajoute pas — les deux chargeurs doivent lire la même
 * chose, sinon l'écran promet des fournisseurs que la résolution ignore.
 */
function inForce(rows: Row[] | null, dasId: string): Row[] {
  const mine = (rows ?? []).filter((r) => str(r.das_id) === dasId);
  if (mine.length === 0) return [];

  const latest = mine.reduce((acc, r) => Math.max(acc, num(r.round_number)), -Infinity);
  return mine.filter((r) => num(r.round_number) === latest);
}
