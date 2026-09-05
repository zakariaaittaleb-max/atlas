import 'server-only';

/**
 * Contexte de saisie : tout ce dont les écrans de décision ont besoin.
 *
 * Assemblé une fois, côté serveur, avec le client ANONYME — donc soumis à la
 * RLS. Si une politique était mal écrite, ces écrans ne verraient rien plutôt
 * que de voir trop.
 *
 * ── LES DÉCISIONS SE RECONDUISENT ──────────────────────────────────────────
 * Un écran de tour N ne s'ouvre pas vide : il affiche ce que l'équipe avait
 * arrêté à l'exercice précédent. C'est le comportement d'une entreprise réelle
 * — ne rien changer, c'est conserver l'an dernier — et cela évite qu'une
 * équipe qui a bien travaillé au tour 2 se retrouve, au tour 3, devant des
 * réglages d'usine qu'elle doit ressaisir à l'identique.
 *
 * Deux jeux de valeurs sont donc renvoyés :
 *   • `decision` / `corporate` / `finance` — ce qu'on affiche, tour courant si
 *     l'équipe a déjà écrit, exercice précédent sinon ;
 *   • `…Baseline` — l'état À L'OUVERTURE DU TOUR, cible du bouton
 *     « Réinitialiser ». Il ne bouge pas quand l'équipe saisit.
 */

import { decisionsAreOpen, getRoundState, requireTeam } from '@/lib/dal';
import {
  CORPORATE_DEFAULTS, FINANCE_DEFAULTS, dasDecisionDefaults,
  type ActorEntry, type CorporateValues, type DasDecisionValues, type DasEntry,
  type DecisionContext, type DistributionLine, type FinanceValues, type HrRollup,
  type ProcurementLine,
} from '@/lib/decision-types';
import { createServerClient } from '@/lib/supabase/server';
import { latestAtMost, servedSegmentsOrDefault } from './reconduction';

export type {
  ActorEntry, DasEntry, DecisionContext,
} from '@/lib/decision-types';

type Row = Record<string, unknown>;
const num = (v: unknown, d = 0) => (typeof v === 'number' ? v : Number(v ?? d) || d);
const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);
const bool = (v: unknown, d = false) => (typeof v === 'boolean' ? v : d);

/** Plancher légal et charges — revalidés côté serveur, ils changent par décret. */
const SMIG_MAD = 3422.72;
const CHARGES_PATRONALES_PCT = 0.2109;

export async function loadDecisionContext(): Promise<DecisionContext> {
  const team = await requireTeam();
  const round = await getRoundState(team.sessionId);
  const roundNumber = (round?.current_round as number) ?? 0;
  const previous = roundNumber - 1;

  const supabase = await createServerClient();

  const [
    { data: units }, { data: segments }, { data: decisions },
    { data: strategies }, { data: budget },
    { data: previousBudget }, { data: pnl }, { data: state },
    { data: procurement }, { data: distribution }, { data: actors },
    { data: orgDesigns }, { data: dasHrDecisions }, { data: dasHrStates },
  ] = await Promise.all([
    // `listed_for_sale` est inclus : un DAS mis en vente doit continuer à être
    // piloté jusqu'à la résolution. La cession ne se dénoue qu'à ce moment-là,
    // et une annonce peut être retirée — le laisser sans décisions le ferait
    // tourner à vide pendant tout le tour.
    supabase.from('team_units')
      .select('das_id, status, launched_round, strategic_units(id, name, sector_key)')
      .eq('team_id', team.teamId).in('status', ['active', 'listed_for_sale']),
    supabase.from('market_segments').select('id, das_id, segment_key, name'),
    // `lte` et non `eq` : la décision du tour précédent est le point de départ
    // affiché tant que l'équipe n'a rien écrit pour celui-ci.
    supabase.from('das_decisions').select('*')
      .eq('team_id', team.teamId).lte('round_number', roundNumber),
    supabase.from('team_round_strategy').select('*')
      .eq('team_id', team.teamId).lte('round_number', roundNumber),
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
    // Les deux volets pilotés depuis l'écran d'organisation. Ils ne sont pas
    // lus pour être affichés ici, mais pour dire à l'équipe ce qui lui reste à
    // faire SUR LE DOMAINE qu'elle pilote — sans l'obliger à ouvrir l'écran
    // pour le découvrir.
    supabase.from('das_org_design').select('das_id, round_number')
      .eq('team_id', team.teamId).lte('round_number', roundNumber),
    supabase.from('das_hr_decisions').select('*')
      .eq('team_id', team.teamId).eq('round_number', roundNumber),
    supabase.from('das_hr_state').select('das_id, round_number, headcount, payroll_mad')
      .eq('team_id', team.teamId).lte('round_number', roundNumber),
  ]);

  const strategyRow = latestAtMost(strategies as Row[] | null, roundNumber);
  const previousStrategyRow = latestAtMost(strategies as Row[] | null, previous);

  const das: DasEntry[] = (units ?? []).map((u) => {
    const unit = u.strategic_units as unknown as { id: string; name: string; sector_key: string } | null;
    const dasId = str(u.das_id);
    const launchedRound = num(u.launched_round);
    const mySegments = (segments ?? [])
      .filter((s) => str(s.das_id) === dasId)
      .map((s) => ({ key: str(s.segment_key), name: str(s.name) }));

    const myDecisions = ((decisions ?? []) as Row[]).filter((d) => str(d.das_id) === dasId);
    const currentRow = myDecisions.find((d) => num(d.round_number) === roundNumber);
    const baselineRow = latestAtMost(myDecisions, previous);

    const defaults = dasDecisionDefaults(mySegments);
    const catalogueKeys = mySegments.map((seg) => seg.key);
    const baselineDecision = toDasDecision(baselineRow, defaults, catalogueKeys);

    return {
      dasId,
      name: unit?.name ?? 'DAS',
      sectorKey: unit?.sector_key ?? '',
      status: (str(u.status) === 'listed_for_sale' ? 'listed_for_sale' : 'active') as DasEntry['status'],
      launchedRound,
      acquired: launchedRound > 0,
      segments: mySegments,
      decision: currentRow
        ? toDasDecision(currentRow, defaults, catalogueKeys)
        : baselineDecision,
      decisionRecorded: Boolean(currentRow),
      procurement: linesOf(procurement as Row[] | null, dasId, roundNumber, toProcurement),
      distribution: linesOf(distribution as Row[] | null, dasId, roundNumber, toDistribution),
      baseline: {
        decision: baselineDecision,
        procurement: linesOf(procurement as Row[] | null, dasId, previous, toProcurement),
        distribution: linesOf(distribution as Row[] | null, dasId, previous, toDistribution),
      },
      progress: {
        strategy: Boolean(currentRow),
        procurement: linesOf(procurement as Row[] | null, dasId, roundNumber, toProcurement).length > 0,
        distribution: linesOf(distribution as Row[] | null, dasId, roundNumber, toDistribution).length > 0,
        // L'organisation PERSISTE : une conception héritée est en vigueur, donc
        // le volet est fait. Le redemander chaque tour transformerait une
        // structure stable — le cas le plus courant — en alerte permanente.
        organisation: ((orgDesigns ?? []) as Row[]).some((d) => str(d.das_id) === dasId),
        // Les RH, à l'inverse, sont des GESTES du tour : recruter, licencier,
        // former. Ne rien décider est un choix, mais il doit être posé.
        hr: ((dasHrDecisions ?? []) as Row[]).some((d) => str(d.das_id) === dasId),
      },
      suppliers: (actors ?? [])
        .filter((a) => str(a.das_id) === dasId && str(a.actor_type) === 'fournisseur')
        .map(toActor),
      distributors: (actors ?? [])
        .filter((a) => str(a.das_id) === dasId && str(a.actor_type) === 'distributeur')
        .map(toActor),
    };
  })
    // Ordre stable : la dotation d'abord, les acquisitions ensuite — le même
    // ordre que le sélecteur de la barre de navigation.
    .sort((a, b) => a.launchedRound - b.launchedRound || a.name.localeCompare(b.name, 'fr'));

  const corporateBaseline = toCorporate(previousStrategyRow);
  const financeBaseline = toFinance(previousBudget as Row | null);

  return {
    team,
    roundNumber,
    status: str(round?.status, 'draft'),
    decisionsOpen: decisionsAreOpen(round?.status as string),
    treasuryMad: num(pnl?.treasury_end_mad),
    headcount: num(state?.headcount),
    avgSalaryMad: averageSalary(dasHrDecisions as Row[] | null, dasHrStates as Row[] | null, roundNumber),
    debtOutstandingMad: num(previousBudget?.debt_outstanding_mad),
    corporate: toCorporate(strategyRow),
    corporateRecorded: Boolean(strategyRow) && num(strategyRow?.round_number) === roundNumber,
    corporateBaseline,
    finance: budget ? toFinance(budget as Row) : financeBaseline,
    financeRecorded: Boolean(budget),
    financeBaseline,
    hr: rollupHr(
      das, dasHrDecisions as Row[] | null, dasHrStates as Row[] | null,
      roundNumber, num(state?.headcount),
    ),
    das,
    smigMad: SMIG_MAD,
    chargesPatronalesPct: CHARGES_PATRONALES_PCT,
  };
}

// ---------------------------------------------------------------------------
// Conversions base → domaine
// ---------------------------------------------------------------------------

function toActor(a: Row): ActorEntry {
  return { id: str(a.id), name: str(a.name), regionKey: a.region_key ? str(a.region_key) : null };
}

function toDasDecision(
  row: Row | null,
  defaults: DasDecisionValues,
  catalogueKeys: string[],
): DasDecisionValues {
  if (!row) return defaults;
  const served = (row.served_segments as string[] | null) ?? [];
  return {
    genericStrategy: str(row.generic_strategy, defaults.genericStrategy),
    pricePosition: num(row.price_position, defaults.pricePosition),
    // Un domaine acquis peut avoir hérité de segments qui n'existent plus :
    // retomber sur le défaut vaut mieux qu'un marché adressable vide. La règle
    // est celle du module partagé — le moteur applique EXACTEMENT la même.
    servedSegments: servedSegmentsOrDefault(served, catalogueKeys),
    capexCapacityMad: num(row.capex_capacity_mad),
    capexAutomationMad: num(row.capex_automation_mad),
    capexOwnNetworkMad: num(row.capex_own_network_mad),
    rdBudgetMad: num(row.rd_budget_mad),
    marketingBudgetMad: num(row.marketing_budget_mad),
    declareBlueOcean: bool(row.declare_blue_ocean),
  };
}

function toCorporate(row: Row | null): CorporateValues {
  if (!row) return CORPORATE_DEFAULTS;
  return {
    corporateStrategy: str(row.corporate_strategy, CORPORATE_DEFAULTS.corporateStrategy),
    structureType: str(row.structure_type, CORPORATE_DEFAULTS.structureType),
    centralPurchasing: bool(row.central_purchasing),
    centralIt: bool(row.central_it),
    centralRd: bool(row.central_rd),
    centralHr: bool(row.central_hr),
    centralFinance: bool(row.central_finance, true),
    sharedProduction: bool(row.shared_production),
    sharedRd: bool(row.shared_rd),
    value1: str(row.value_1, CORPORATE_DEFAULTS.value1),
    value2: str(row.value_2, CORPORATE_DEFAULTS.value2),
    vision: row.vision ? str(row.vision) : null,
    mission: row.mission ? str(row.mission) : null,
  };
}

function toFinance(row: Row | null): FinanceValues {
  if (!row) return FINANCE_DEFAULTS;
  return {
    // L'emprunt et le remboursement sont des GESTES du tour : les reconduire
    // ferait tirer deux fois le même crédit sans que personne le décide.
    opexMad: num(row.opex_mad),
    debtDrawnMad: 0,
    debtRepaidMad: 0,
    taxRegime: str(row.tax_regime, FINANCE_DEFAULTS.taxRegime),
  };
}

function toProcurement(r: Row): ProcurementLine {
  return { supplierId: str(r.supplier_id), committedVolume: num(r.committed_volume) };
}

function toDistribution(r: Row): DistributionLine {
  return { distributorId: str(r.distributor_id), volumeShare: num(r.volume_share) };
}

// ---------------------------------------------------------------------------
// Consolidation RH
// ---------------------------------------------------------------------------

/**
 * Effectif d'un domaine au dernier exercice clos.
 *
 * `lte` et non `lt` : une ligne n'existe pour le tour courant qu'APRÈS sa
 * résolution. Pendant la saisie, `lte` rend donc le tour précédent ; une fois
 * le tour résolu, il rend le tour lui-même — le dernier exercice clos dans les
 * deux cas.
 */
function dasHeadcount(states: Row[] | null, dasId: string, round: number): number | null {
  const row = latestAtMost((states ?? []).filter((s) => str(s.das_id) === dasId), round);
  return row ? num(row.headcount) : null;
}

function averageSalary(
  decisions: Row[] | null, states: Row[] | null, round: number,
): number {
  const rows = decisions ?? [];
  if (rows.length === 0) return 5800;

  let weighted = 0;
  let weight = 0;
  for (const r of rows) {
    // Pondéré par l'effectif : la moyenne arithmétique de deux domaines de
    // tailles très différentes ne veut rien dire.
    const w = Math.max(dasHeadcount(states, str(r.das_id), round) ?? 1, 1);
    weighted += num(r.avg_salary_brut_mad, 5800) * w;
    weight += w;
  }
  return weight > 0 ? weighted / weight : 5800;
}

function rollupHr(
  das: DasEntry[], decisions: Row[] | null, states: Row[] | null,
  round: number, groupHeadcount: number,
): HrRollup {
  const rows = decisions ?? [];

  // Faute d'état par domaine — première session, ou partie provisionnée avant
  // le module RH — on retombe sur l'effectif du groupe plutôt que sur zéro : un
  // effectif nul ferait cesser la production pour une raison qui n'est pas une
  // décision.
  const perDas = das.map((d) => dasHeadcount(states, d.dasId, round));
  const known = perDas.filter((v): v is number => v !== null);
  const headcountStart = known.length > 0
    ? known.reduce((a, v) => a + v, 0)
    : groupHeadcount;

  let hires = 0;
  let layoffs = 0;
  let trainingBudgetMad = 0;
  for (const r of rows) {
    hires += num(r.hire_operateurs) + num(r.hire_techniciens)
      + num(r.hire_experts) + num(r.hire_cadres) + num(r.internal_transfers_in);
    layoffs += num(r.layoffs);
    trainingBudgetMad += num(r.training_budget_mad);
  }

  const headcountEnd = Math.max(headcountStart + hires - layoffs, 0);
  const avgSalaryBrutMad = averageSalary(decisions, states, round);

  return {
    headcountStart,
    hires,
    layoffs,
    headcountEnd,
    avgSalaryBrutMad,
    trainingBudgetMad,
    payrollMad: headcountEnd * avgSalaryBrutMad * 12 * (1 + CHARGES_PATRONALES_PCT),
    pendingDas: das
      .filter((d) => !rows.some((r) => str(r.das_id) === d.dasId))
      .map((d) => ({ dasId: d.dasId, name: d.name })),
  };
}

// ---------------------------------------------------------------------------
// Sélection de lignes
// ---------------------------------------------------------------------------

/** La ligne la plus récente dont le tour ne dépasse pas `round`. */

/**
 * Contrats EN VIGUEUR sur un DAS au tour donné.
 *
 * Même règle que côté moteur (`load-snapshot.ts`) : on retient le tour le plus
 * récent où l'équipe a contracté, et lui seul. Renégocier remplace le
 * portefeuille, ne s'y ajoute pas — les deux chargeurs doivent lire la même
 * chose, sinon l'écran promet des fournisseurs que la résolution ignore.
 */
function linesOf<T>(
  rows: Row[] | null, dasId: string, round: number, map: (r: Row) => T,
): T[] {
  const mine = (rows ?? []).filter(
    (r) => str(r.das_id) === dasId && num(r.round_number) <= round,
  );
  if (mine.length === 0) return [];

  const latest = mine.reduce((acc, r) => Math.max(acc, num(r.round_number)), -Infinity);
  return mine.filter((r) => num(r.round_number) === latest).map(map);
}

/**
 * Décisions obligatoires encore manquantes.
 *
 * Alimente le compteur de la barre de validation : une équipe doit savoir ce
 * qui lui manque sans parcourir les écrans. Chaque entrée porte le DAS
 * concerné, faute de quoi « distribution manquante » sur un portefeuille de
 * trois domaines ne dit pas lequel ouvrir.
 */
export function missingDecisions(context: DecisionContext) {
  const missing: { label: string; href: string; dasId: string | null }[] = [];

  if (!context.corporateRecorded) {
    missing.push({ label: 'stratégie du Groupe', href: '/strategie', dasId: null });
  }
  for (const das of context.das) {
    if (!das.progress.strategy) {
      missing.push({ label: `stratégie ${das.name}`, href: '/strategie/das', dasId: das.dasId });
    }
    if (!das.progress.distribution) {
      // Sans distributeur, la couverture est nulle et l'équipe ne vend RIEN.
      missing.push({ label: `distribution ${das.name}`, href: '/marches', dasId: das.dasId });
    }
    if (!das.progress.procurement) {
      missing.push({ label: `achats ${das.name}`, href: '/marches', dasId: das.dasId });
    }
    if (!das.progress.hr) {
      missing.push({ label: `RH ${das.name}`, href: '/organisation', dasId: das.dasId });
    }
  }
  if (!context.financeRecorded) {
    missing.push({ label: 'budget du Groupe', href: '/finance', dasId: null });
  }

  return missing;
}
