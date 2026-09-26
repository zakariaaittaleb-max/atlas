import 'server-only';

import { cache } from 'react';

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
import { isOn, screenIsOpen, type EnabledModules } from '@/lib/modules-state';
import {
  CORPORATE_DEFAULTS, FINANCE_DEFAULTS, dasDecisionDefaults,
  type ActorEntry, type CorporateValues, type DasDecisionValues, type DasEntry,
  type DecisionContext, type DistributionLine, type FinanceLimits, type FinanceValues,
  type ProcurementLine,
} from '@/lib/decision-types';
import { createServerClient } from '@/lib/supabase/server';
import { debtCapacity } from '@/lib/engine/finance';
import { equityIssueTerms, type InvestorComponent } from '@/lib/engine/investors';
import { buildParams } from '@/lib/engine/params';
import type { TreasuryStatus } from '@/lib/engine/types';
import { CHARGES_PATRONALES_PCT, averageSalary, rollupHr } from './hr-consolidation';
import { latestAtMost, reconductHrDecision, servedSegmentsOrDefault } from './reconduction';

export type {
  ActorEntry, DasEntry, DecisionContext,
} from '@/lib/decision-types';

type Row = Record<string, unknown>;
const num = (v: unknown, d = 0) => (typeof v === 'number' ? v : Number(v ?? d) || d);
const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);
const bool = (v: unknown, d = false) => (typeof v === 'boolean' ? v : d);

/** Plancher légal et charges — revalidés côté serveur, ils changent par décret. */
const SMIG_MAD = 3422.72;

/**
 * Mémoïsé le temps d'une requête : la navigation (écrans restant à remplir) et
 * la page lisent le même contexte. Ils ne doivent ni le charger deux fois, ni
 * pouvoir en afficher deux versions.
 */
export const loadDecisionContext = cache(loadDecisionContextOnce);

async function loadDecisionContextOnce(): Promise<DecisionContext> {
  const team = await requireTeam();
  const round = await getRoundState(team.sessionId);
  const roundNumber = (round?.current_round as number) ?? 0;
  const previous = roundNumber - 1;

  const supabase = await createServerClient();

  const [
    { data: units }, { data: segments }, { data: decisions },
    { data: strategies }, { data: budgets },
    { data: pnls }, { data: state },
    { data: procurement }, { data: distribution }, { data: actors },
    { data: orgDesigns }, { data: dasHrDecisions }, { data: dasHrStates },
    { data: supplyMetrics }, { data: cashAllocations },
  ] = await Promise.all([
    // `listed_for_sale` est inclus : un DAS mis en vente doit continuer à être
    // piloté jusqu'à la résolution. La cession ne se dénoue qu'à ce moment-là,
    // et une annonce peut être retirée — le laisser sans décisions le ferait
    // tourner à vide pendant tout le tour.
    supabase.from('team_units')
      .select('das_id, status, launched_round, brand_name, strategic_units(id, name, sector_key)')
      .eq('team_id', team.teamId).in('status', ['active', 'listed_for_sale']),
    supabase.from('market_segments').select('id, das_id, segment_key, name'),
    // `lte` et non `eq` : la décision du tour précédent est le point de départ
    // affiché tant que l'équipe n'a rien écrit pour celui-ci.
    supabase.from('das_decisions').select('*')
      .eq('team_id', team.teamId).lte('round_number', roundNumber),
    supabase.from('team_round_strategy').select('*')
      .eq('team_id', team.teamId).lte('round_number', roundNumber),
    // `lte` et non `eq` : une ligne de budget n'existe que pour les tours où
    // l'équipe a écrit quelque chose, plus celui de la dotation. Lire le seul
    // tour précédent faisait donc disparaître les frais de siège et le régime
    // fiscal dès qu'une équipe sautait un exercice — alors que le moteur, lui,
    // les reconduit. Une seule règle, celle de `reconduction.ts`.
    supabase.from('financial_budgets').select('*')
      .eq('team_id', team.teamId).lte('round_number', roundNumber),
    // Tous les exercices clos, celui du tour courant compris : la capacité
    // d'endettement et le plafond du dividende se lisent sur le DERNIER
    // résultat connu. S'arrêter au tour précédent affichait, côte à côte, une
    // capacité calculée sur un exercice et des résultats tirés du suivant —
    // deux EBITDA différents sur le même écran, ce qui se lit comme une erreur.
    supabase.from('pnl_statements')
      .select('round_number, treasury_end_mad, revenue_mad, net_income_mad')
      .eq('team_id', team.teamId).lte('round_number', roundNumber).order('round_number'),
    supabase.from('team_round_state')
      .select('headcount, investor_attractiveness, investor_components, treasury_status')
      .eq('team_id', team.teamId).eq('round_number', previous).maybeSingle(),
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
    // `lte` : les NIVEAUX RH se reconduisent (voir `reconductHrDecision`). Les
    // lecteurs qui ne veulent que les saisies du tour filtrent eux-mêmes.
    supabase.from('das_hr_decisions').select('*')
      .eq('team_id', team.teamId).lte('round_number', roundNumber),
    supabase.from('das_hr_state').select('das_id, round_number, headcount, payroll_mad')
      .eq('team_id', team.teamId).lte('round_number', roundNumber),
    // L'état d'approvisionnement du dernier exercice clos : ce qu'on a vendu,
    // et ce qui dort en magasin. Sans ces chiffres, engager un volume d'achat
    // se fait à l'aveugle — on ne sait ni ce qu'on écoule, ni ce qu'on a déjà.
    supabase
      .from('team_das_round_metrics')
      .select('das_id, volume_sold, volume_lost, input_stock_units, finished_stock_units, effective_capacity_units')
      .eq('team_id', team.teamId).eq('round_number', previous),
    // Les transferts entre domaines saisis CE tour : sans eux, l'écran les
    // montrait vides alors que le moteur allait les appliquer.
    supabase.from('das_cash_allocation').select('das_id, transfer_mad')
      .eq('team_id', team.teamId).eq('round_number', roundNumber),
  ]);

  // Le budget ÉCRIT ce tour, s'il existe : c'est lui qui dit « saisi » plutôt
  // que « reconduit ». La base, elle, remonte au dernier exercice connu.
  const budget =
    ((budgets ?? []) as Row[]).find((b) => num(b.round_number) === roundNumber) ?? null;
  const previousBudget = latestAtMost(budgets as Row[] | null, previous);

  // ── Ce que la banque autorise, et ce que l'exercice clos permet ──────────
  //
  // Le bilan d'ouverture vient du moteur (clôture du tour précédent) ; la
  // capacité d'endettement s'en déduit par la même fonction que celle qui borne
  // l'écriture, pour que l'écran et la route ne puissent pas diverger.
  const openingBudget = latestAtMost(budgets as Row[] | null, roundNumber);
  const closedPnls = (pnls ?? []) as Row[];
  /** Le dernier exercice connu : il sert de base à la banque et au dividende. */
  const lastPnl = closedPnls.at(-1) ?? null;
  /**
   * La trésorerie d'OUVERTURE du tour, elle, est la clôture du tour d'avant —
   * et non celle du tour courant, qui n'est pas encore arrêtée quand l'équipe
   * décide. Les deux lectures sont distinctes et le restent.
   */
  const previousPnl = closedPnls.find((p) => num(p.round_number) === previous) ?? null;

  // Plancher à zéro : une dette négative n'existe pas comptablement. Lue
  // brute, elle inversait les bornes du curseur — « tout rembourser » valait
  // +3,41 Md, au-dessus de la capacité — et le curseur ne bougeait plus.
  const openingDebtMad = Math.max(num(openingBudget?.debt_outstanding_mad), 0);

  const capacity = debtCapacity(
    num(openingBudget?.equity_mad),
    num(lastPnl?.revenue_mad),
    openingDebtMad,
    buildParams(),
  );

  // Une levée se négocie sur la réputation qu'on a, pas sur celle qu'on
  // espère : le score qui fixe les conditions de CE tour est celui publié à
  // la résolution PRÉCÉDENTE (voir `resolve.ts`, même règle côté moteur).
  const investorScore =
    state && (state as Row).investor_attractiveness !== null
      ? num((state as Row).investor_attractiveness)
      : null;
  const issueTerms = equityIssueTerms(investorScore, num(openingBudget?.equity_mad), buildParams());

  const financeLimits: FinanceLimits = {
    equityMad: num(openingBudget?.equity_mad),
    debtOutstandingMad: openingDebtMad,
    capacityTotalMad: capacity.totalMad,
    capacityAvailableMad: capacity.availableMad,
    capacityBinding: capacity.binding,
    capacityByEquityMad: capacity.byEquityMad,
    capacityByRevenueMad: capacity.byRevenueMad,
    dividendCeilingMad: Math.max(num(lastPnl?.net_income_mad), 0),
    lastRevenueMad: num(lastPnl?.revenue_mad),
    investorScore,
    investorComponents:
      ((state as Row | undefined)?.investor_components as InvestorComponent[] | undefined) ?? null,
    equityIssueCostPct: issueTerms.costPct,
    equityRaiseCapMad: issueTerms.capMad,
  };

  const strategyRow = latestAtMost(strategies as Row[] | null, roundNumber);
  const previousStrategyRow = latestAtMost(strategies as Row[] | null, previous);

  // Les décisions RH EN VIGUEUR des domaines détenus : saisies du tour, sinon
  // niveaux reconduits. C'est elles qui disent le salaire moyen du groupe — un
  // domaine non rouvert ne sort plus de la moyenne.
  const hrInForce = (units ?? [])
    .map((u) =>
      reconductHrDecision(
        ((dasHrDecisions ?? []) as Row[]).filter((d) => str(d.das_id) === str(u.das_id)),
        roundNumber,
      ),
    )
    .filter((r): r is Row => r !== null);

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

    const brandName = u.brand_name ? str(u.brand_name) : null;
    return {
      dasId,
      name: brandName ?? unit?.name ?? 'DAS',
      activityName: unit?.name ?? 'DAS',
      brandName,
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
      supply: (() => {
        const m = ((supplyMetrics ?? []) as Row[]).find((r) => str(r.das_id) === dasId);
        const previousLines = linesOf(
          procurement as Row[] | null, dasId, previous, toProcurement,
        );
        return {
          purchasedLastRound: previousLines.reduce((acc, l) => acc + l.committedVolume, 0),
          soldLastRound: num(m?.volume_sold),
          lostLastRound: num(m?.volume_lost),
          inputStockUnits: num(m?.input_stock_units),
          finishedStockUnits: num(m?.finished_stock_units),
          effectiveCapacityUnits: num(m?.effective_capacity_units),
        };
      })(),
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
        // La SAISIE du tour, et non la décision reconduite : c'est ce que
        // « fait / à faire » veut dire ici.
        hr: ((dasHrDecisions ?? []) as Row[]).some(
          (d) => str(d.das_id) === dasId && num(d.round_number) === roundNumber,
        ),
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
  // Au tour d'onboarding, aucun exercice ne précède : le bilan PROVISIONNÉ est
  // la valeur en vigueur. Sans ce repli, le siège héritait de zéro et le curseur
  // s'ouvrait « hors fourchette » sur une dotation que l'équipe n'avait pas
  // touchée.
  const financeBaseline = toFinance((previousBudget ?? openingBudget) as Row | null);

  // Cessions et rachats conclus ce tour : la trésorerie dont on dispose les
  // compte déjà, sans quoi vendre un domaine ne rendrait rien avant le tour
  // suivant.
  const { data: dealRows } = await supabase.from('deal_cash_movements').select('amount_mad')
    .eq('team_id', team.teamId).eq('round_number', roundNumber);
  const dealCashMad = ((dealRows ?? []) as Row[]).reduce((acc, d) => acc + num(d.amount_mad), 0);

  return {
    team,
    roundNumber,
    status: str(round?.status, 'draft'),
    decisionsOpen: decisionsAreOpen(round?.status as string),
    treasuryMad: num(previousPnl?.treasury_end_mad) + dealCashMad,
    dealCashMad,
    treasuryStatus: ((state as Row | undefined)?.treasury_status as TreasuryStatus | undefined) ?? 'sain',
    headcount: num(state?.headcount),
    avgSalaryMad: averageSalary(hrInForce, dasHrStates as Row[] | null, roundNumber),
    debtOutstandingMad: num(previousBudget?.debt_outstanding_mad),
    corporate: toCorporate(strategyRow),
    corporateRecorded: Boolean(strategyRow) && num(strategyRow?.round_number) === roundNumber,
    corporateBaseline,
    // Le budget écrit CE tour porte aussi ses gestes (crédit, levée, dividende,
    // transferts) : les remettre à zéro affichait « aucun mouvement de dette »
    // sur un remboursement enregistré — et la prochaine sauvegarde l'effaçait.
    finance: budget
      ? toFinance(budget as Row, {
          cashTransfers: ((cashAllocations ?? []) as Row[])
            .map((a) => ({ dasId: str(a.das_id), transferMad: num(a.transfer_mad) }))
            .filter((t) => t.transferMad !== 0),
        })
      : financeBaseline,
    financeRecorded: Boolean(budget),
    financeBaseline,
    hr: rollupHr(
      das, dasHrDecisions as Row[] | null, dasHrStates as Row[] | null,
      roundNumber, num(state?.headcount),
    ),
    das,
    smigMad: SMIG_MAD,
    financeLimits,
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

/**
 * Les valeurs de finance d'un budget.
 *
 * `current` est passé pour le budget écrit CE tour : ses gestes sont relus
 * tels qu'enregistrés. Sans lui (budget d'un exercice antérieur), seuls les
 * engagements se reconduisent.
 */
function toFinance(
  row: Row | null,
  current?: { cashTransfers: FinanceValues['cashTransfers'] },
): FinanceValues {
  if (!row) return FINANCE_DEFAULTS;
  if (current) {
    return {
      opexMad: num(row.opex_mad),
      netCreditMad: num(row.debt_drawn_mad) - num(row.debt_repaid_mad),
      capitalRaisedMad: num(row.capital_raised_mad),
      dividendMad: num(row.dividend_mad),
      cashTransfers: current.cashTransfers,
    };
  }
  return {
    // Les frais de siège sont un ENGAGEMENT : ils se reconduisent.
    opexMad: num(row.opex_mad),
    // Le crédit, la levée et le dividende sont des GESTES du tour : les
    // reconduire ferait tirer deux fois le même crédit, ou verser deux fois le
    // même dividende, sans que personne ne l'ait décidé.
    netCreditMad: 0,
    capitalRaisedMad: 0,
    dividendMad: 0,
    cashTransfers: [],
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
/**
 * Ce qu'il reste à saisir.
 *
 * `modules` n'est pas optionnel par confort : une décision fermée par le
 * facilitateur ne doit JAMAIS figurer ici. La barre de validation resterait
 * grisée en réclamant un écran que l'équipe ne peut plus ouvrir, et le tour ne
 * pourrait pas être déclaré prêt.
 */
export function missingDecisions(context: DecisionContext, modules: EnabledModules) {
  const missing: { label: string; href: string; dasId: string | null }[] = [];

  if (!context.corporateRecorded && screenIsOpen(modules, 'strategie')) {
    missing.push({ label: 'stratégie du Groupe', href: '/strategie', dasId: null });
  }
  for (const das of context.das) {
    if (!das.progress.strategy) {
      missing.push({ label: `stratégie ${das.name}`, href: '/strategie/das', dasId: das.dasId });
    }
    if (!das.progress.distribution && isOn(modules, 'marches.distribution')) {
      // Sans distributeur, la couverture est nulle et l'équipe ne vend RIEN.
      missing.push({ label: `distribution ${das.name}`, href: '/marches', dasId: das.dasId });
    }
    if (!das.progress.procurement && isOn(modules, 'marches.procurement')) {
      missing.push({ label: `achats ${das.name}`, href: '/marches', dasId: das.dasId });
    }
    if (!das.progress.hr) {
      missing.push({ label: `RH ${das.name}`, href: '/organisation', dasId: das.dasId });
    }
  }
  if (!context.financeRecorded && screenIsOpen(modules, 'finance')) {
    missing.push({ label: 'budget du Groupe', href: '/finance', dasId: null });
  }

  return missing;
}
