import 'server-only';

/**
 * Assemblage de l'instantané de résolution depuis Postgres.
 *
 * Seul endroit du serveur qui lit largement avec la clé `service_role` : il
 * voit les décisions de TOUTES les équipes. Son résultat ne doit jamais
 * traverser la frontière réseau — il alimente `resolveRound()`, rien d'autre.
 *
 * La séparation est délibérée : le moteur reste une fonction pure et testable,
 * ce module concentre toute la traduction base → domaine, et les erreurs de
 * mapping se cherchent à un seul endroit.
 */

import { buildParams, type EngineParams } from '@/lib/engine/params';
import type {
  AcquisitionOfferSnapshot,
  BidSnapshot,
  DasSnapshot,
  ListingSnapshot,
  ResolutionInput,
  ShockEffects,
  TeamDasSnapshot,
  TeamSnapshot,
} from '@/lib/engine/snapshot';
import type { DasParameters, GenericStrategy } from '@/lib/engine/types';
import { makeRng, seedFrom, uniform } from '@/lib/engine/math';
import { impactFactor } from '@/lib/engine/shocks';
import {
  directionAffinityFromKpis,
  type Affinity,
  type OrgSnapshot,
} from '@/lib/engine/organisation';
import type { createAdminClient } from '@/lib/supabase/server';
import { latestAtMost, servedSegmentsOrDefault } from './reconduction';

/**
 * Le client est typé sur le schéma `atlas`, pas sur `public` : reprendre le
 * type exact de `createAdminClient` évite de le redéclarer ici, et garantit
 * qu'un changement de schéma se propage partout.
 */
type AdminClient = ReturnType<typeof createAdminClient>;

type Row = Record<string, unknown>;
const num = (v: unknown, fallback = 0): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : Number(v ?? fallback) || fallback;
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const bool = (v: unknown, fallback = false): boolean =>
  typeof v === 'boolean' ? v : fallback;
const clampScore = (v: number): number => Math.min(Math.max(v, 0), 100);

export interface LoadedSnapshot {
  input: ResolutionInput;
  params: EngineParams;
  /** Identifiant de pool par équipe, pour les écritures en aval. */
  poolByTeam: Map<string, string>;
}

export async function loadResolutionSnapshot(
  admin: AdminClient,
  sessionId: string,
  roundNumber: number,
): Promise<LoadedSnapshot> {
  const previousRound = roundNumber - 1;

  // --- Paramètres de calibrage de la session --------------------------------
  const { data: paramRows } = await admin
    .from('engine_parameters')
    .select('key, value')
    .eq('session_id', sessionId);

  const params = buildParams(
    Object.fromEntries((paramRows ?? []).map((r) => [str(r.key), num(r.value)])),
  );

  // --- Proximité sectorielle ------------------------------------------------
  const { data: proximityRows } = await admin
    .from('sector_proximity')
    .select('sector_a, sector_b, proximity')
    .eq('session_id', sessionId);

  const proximityMap = new Map<string, number>();
  for (const row of proximityRows ?? []) {
    proximityMap.set(`${str(row.sector_a)}|${str(row.sector_b)}`, num(row.proximity));
  }
  const proximity = (a: string, b: string): number => {
    if (a === b) return 100;
    return proximityMap.get(`${a}|${b}`) ?? proximityMap.get(`${b}|${a}`) ?? 20;
  };

  // --- DAS, segments, et taille de marché du tour précédent ------------------
  const { data: dasRows } = await admin
    .from('strategic_units')
    .select('*')
    .eq('session_id', sessionId);

  const { data: segmentRows } = await admin
    .from('market_segments')
    .select('das_id, segment_key, market_share_pct, quality_requirement, price_sensitivity');

  const { data: previousSummaries } = await admin
    .from('pool_round_summary')
    .select('das_id, market_size_mad')
    .eq('round_number', previousRound);

  const previousMarketSize = new Map<string, number>();
  for (const row of previousSummaries ?? []) {
    previousMarketSize.set(str(row.das_id), num(row.market_size_mad));
  }

  // ── Les concurrents non joueurs encore indépendants ──────────────────────
  //
  // `owner_team_id is null` : une cible rachetée n'est plus un concurrent, son
  // chiffre d'affaires a rejoint celui de l'équipe qui l'a acquise. La laisser
  // dans ce compte reviendrait à lui faire prélever deux fois la même part.
  const { data: npcRows } = await admin
    .from('ecosystem_actors')
    .select('das_id, ecosystem_actor_rounds(round_number, revenue_mad)')
    .eq('session_id', sessionId)
    .eq('actor_type', 'cible_acquisition')
    .is('owner_team_id', null);

  const npcRevenue = new Map<string, number>();
  for (const actor of npcRows ?? []) {
    const rounds = ((actor.ecosystem_actor_rounds ?? []) as Row[])
      .filter((r) => num(r.round_number) <= roundNumber)
      .sort((a, b) => num(b.round_number) - num(a.round_number));
    const revenue = num(rounds[0]?.revenue_mad);
    const dasId = str(actor.das_id);
    npcRevenue.set(dasId, (npcRevenue.get(dasId) ?? 0) + revenue);
  }

  const das: DasSnapshot[] = (dasRows ?? []).map((row: Row) => {
    const dasId = str(row.id);
    const parameters: DasParameters = {
      dasId,
      sectorKey: str(row.sector_key),
      referenceUnitPriceMad: num(row.reference_unit_price_mad, 1),
      referenceUnitCostMad: num(row.reference_unit_cost_mad, 1),
      fixedCostBaseMad: num(row.fixed_cost_base_mad),
      priceElasticity: num(row.price_elasticity, 1.5),
      // Repli sur le paramètre de session, et non sur une constante muette :
      // `learning.rate_default` existait depuis l'origine et personne ne le
      // lisait, si bien que le facilitateur pouvait le régler sans effet.
      learningRate: num(row.learning_rate, num(params['learning.rate_default'], 0.88)),
      valuationMultiple: num(row.valuation_multiple, 5),
      workingCapitalDays: num(row.working_capital_days, 60),
      vrioEntryBarrier: num(row.vrio_entry_barrier, 0.2),
      unitCapacityCostMad: num(row.unit_capacity_cost_mad, 220),
      capacityDepreciation: num(row.capacity_depreciation, 0.06),
      capacityFromHeadcount: bool(row.capacity_from_headcount),
      headcountProductivity: row.headcount_productivity === null
        ? null
        : num(row.headcount_productivity),
      referenceCumulativeVolumeUnits: num(row.reference_cumulative_volume_units, 1),
    };

    // Le taux de croissance est tiré de façon DÉTERMINISTE : rejouer un tour
    // doit redonner exactement le même marché.
    const rng = makeRng(seedFrom(sessionId, roundNumber, dasId, 'growth'));
    const growthRate = uniform(rng, num(row.growth_rate_min), num(row.growth_rate_max));

    return {
      dasId,
      sectorKey: parameters.sectorKey,
      parameters,
      previousMarketSizeMad:
        previousMarketSize.get(dasId) ?? num(row.base_market_size_mad),
      growthRate,
      npcRevenueMad: npcRevenue.get(dasId) ?? 0,
      segments: (segmentRows ?? [])
        .filter((s) => str(s.das_id) === dasId)
        .map((s) => ({
          segmentKey: str(s.segment_key),
          marketSharePct: num(s.market_share_pct),
          qualityRequirement: num(s.quality_requirement),
          priceSensitivity: num(s.price_sensitivity, 1),
        })),
    };
  });

  // --- Équipes --------------------------------------------------------------
  const { data: teamRows } = await admin
    .from('teams')
    .select('id, name, pool_id, is_liquidated')
    .eq('session_id', sessionId);

  const teamIds = (teamRows ?? []).map((t) => str(t.id));
  const poolByTeam = new Map<string, string>(
    (teamRows ?? []).map((t) => [str(t.id), str(t.pool_id)]),
  );

  const byTeam = <T extends Row>(rows: T[] | null, round?: number) => {
    const map = new Map<string, T>();
    for (const row of rows ?? []) {
      if (round !== undefined && num(row.round_number) !== round) continue;
      map.set(str(row.team_id), row);
    }
    return map;
  };

  const [
    { data: strategyRows },
    { data: hrRows },
    { data: budgetRows },
    { data: unitRows },
    { data: decisionHistoryRows },
    { data: procurementRows },
    { data: distributionRows },
    { data: previousMetricRows },
    { data: previousStateRows },
    { data: iaHistoryRows },
    { data: previousStrategyRows },
    { data: previousPnlRows },
    { data: previousAlignmentRows },
    { data: consultingRows },
    { data: capexHistoryRows },
    { data: actorRows },
    { data: shockRows },
    { data: shockResponseRows }, { data: cashRows },
    { data: listingRows },
    { data: bidRows },
    { data: kpiCatalogRows },
    { data: axisCatalogRows },
    { data: orgDesignRows },
    { data: orgAxisRows },
    { data: orgPositionRows },
    { data: orgKpiRows },
    { data: orgBudgetRows },
    { data: groupDirectiveRows },
    { data: sharedResourceRows },
    { data: dasHrRows },
    { data: dasHrStateRows },
    { data: platformRows },
    { data: acquisitionRows },
  ] = await Promise.all([
    admin.from('team_round_strategy').select('*').in('team_id', teamIds).eq('round_number', roundNumber),
    admin.from('hr_metrics').select('*').in('team_id', teamIds).eq('round_number', roundNumber),
    // `lte` : une dette ne s'évapore pas au 31 décembre.
    //
    // Avec `eq`, une équipe qui ne saisissait pas de décision financière n'avait
    // plus de ligne de budget, donc plus de dette au regard du moteur — et
    // payait ZÉRO intérêt sur un crédit hérité de plusieurs milliards. Le
    // capital restait dû dans la base et gratuit dans le calcul.
    admin.from('financial_budgets').select('*').in('team_id', teamIds).lte('round_number', roundNumber),
    admin.from('team_units').select('*').in('team_id', teamIds).eq('status', 'active'),
    // TOUT l'historique des décisions, et non le seul tour courant.
    //
    // Les décisions se RECONDUISENT : une équipe qui ne rouvre pas l'écran de
    // stratégie garde celle du tour précédent. L'interface le disait déjà et le
    // faisait — `decision-context.ts` retient la dernière décision au plus tard
    // au tour demandé — mais le moteur, lui, ne lisait que le tour courant et
    // retombait sur des valeurs neutres codées en dur : domination par les
    // coûts, prix au marché, AUCUN segment servi, tous les budgets à zéro.
    //
    // L'écran montrait donc à l'équipe ses choix reconduits, et le moteur en
    // résolvait d'autres. Une équipe qui relisait sa stratégie, la jugeait
    // bonne et n'y touchait pas était calculée sur une stratégie qu'elle
    // n'avait jamais déclarée.
    admin.from('das_decisions').select('*').in('team_id', teamIds).lte('round_number', roundNumber),
    // `lte` et non `eq` : les contrats PERSISTENT d'un exercice à l'autre.
    // Un contrat d'approvisionnement ne s'évapore pas au 31 décembre — ne rien
    // renégocier, c'est reconduire. Voir `contractsFor` plus bas.
    admin.from('procurement_contracts').select('*').in('team_id', teamIds).lte('round_number', roundNumber),
    admin.from('distribution_contracts').select('*').in('team_id', teamIds).lte('round_number', roundNumber),
    admin.from('team_das_round_metrics').select('*').in('team_id', teamIds).eq('round_number', previousRound),
    admin.from('team_round_state').select('*').in('team_id', teamIds).eq('round_number', previousRound),
    // L'HISTORIQUE des indices, et non le seul tour précédent : le score
    // temporel récompense une progression SOUTENUE, ce qui ne se lit pas sur
    // une valeur isolée.
    admin.from('team_round_state').select('team_id, round_number, ia_score')
      .in('team_id', teamIds).lt('round_number', roundNumber).order('round_number'),
    // La stratégie de groupe du tour PRÉCÉDENT, pour facturer les changements.
    admin.from('team_round_strategy').select('team_id, corporate_strategy, structure_type')
      .in('team_id', teamIds).eq('round_number', previousRound),
    admin.from('pnl_statements').select('*').in('team_id', teamIds).eq('round_number', previousRound),
    admin.from('alignment_scores').select('*').in('team_id', teamIds).eq('round_number', previousRound),
    admin.from('consulting_orders').select('team_id, price_paid_mad').in('team_id', teamIds).eq('round_number', roundNumber),
    admin.from('financial_budgets').select('team_id, round_number').in('team_id', teamIds).lt('round_number', roundNumber),
    admin.from('ecosystem_actors').select('id, actor_type, das_id, owner_team_id, integration_quality, ecosystem_actor_rounds(*)').eq('session_id', sessionId),
    admin.from('market_shocks').select('*').eq('session_id', sessionId).gte('rounds_remaining', 1),
    admin.from('shock_responses').select('shock_id, team_id, cost_mad, impact_pct')
      .in('team_id', teamIds).eq('round_number', roundNumber),
    // Cash pooling : un GESTE du tour, jamais reconduit. Le reconduire ferait
    // vider le même domaine chaque tour sans que personne ne l'ait redemandé.
    admin.from('das_cash_allocation').select('team_id, das_id, transfer_mad')
      .in('team_id', teamIds).eq('round_number', roundNumber),
    admin.from('das_listings').select('*').eq('session_id', sessionId).eq('round_number', roundNumber).eq('status', 'open'),
    admin.from('das_bids').select('*').eq('round_number', roundNumber).eq('status', 'sealed'),
    admin.from('kpi_catalog').select('key, direction_key, affinity_domination_couts, affinity_differenciation, affinity_focus_couts, affinity_focus_differenciation'),
    admin.from('strategic_axis_catalog').select('key, affinity_domination_couts, affinity_differenciation, affinity_focus_couts, affinity_focus_differenciation'),
    admin.from('das_org_design').select('*').in('team_id', teamIds).lte('round_number', roundNumber),
    admin.from('das_strategic_axes').select('*').in('team_id', teamIds).lte('round_number', roundNumber),
    admin.from('das_positions').select('*').in('team_id', teamIds).lte('round_number', roundNumber),
    admin.from('das_direction_kpis').select('*').in('team_id', teamIds).lte('round_number', roundNumber),
    admin.from('das_direction_budgets').select('*').in('team_id', teamIds).lte('round_number', roundNumber),
    // Directives du groupe : mêmes règles de report que l'organisation. Ne rien
    // rechanger, c'est reconduire la déclinaison de l'exercice précédent.
    admin.from('das_group_directives').select('*').in('team_id', teamIds).lte('round_number', roundNumber),
    admin.from('das_shared_resources').select('*').in('team_id', teamIds).lte('round_number', roundNumber),
    // Décisions RH du tour ; état RH du tour précédent.
    admin.from('das_hr_decisions').select('*').in('team_id', teamIds).eq('round_number', roundNumber),
    admin.from('das_hr_state').select('*').in('team_id', teamIds).lt('round_number', roundNumber),
    admin.from('shared_platforms').select('*').in('team_id', teamIds).lte('round_number', roundNumber),
    admin.from('acquisition_offers').select('*')
      .eq('session_id', sessionId).eq('round_number', roundNumber).eq('status', 'sealed'),
  ]);

  // Affinité de chaque élément de catalogue, lue en base plutôt que codée en
  // dur : le facilitateur peut la retoucher entre deux promotions.
  const toAffinity = (row: Row): Affinity => ({
    domination_couts: num(row.affinity_domination_couts, 50),
    differenciation: num(row.affinity_differenciation, 50),
    focus_couts: num(row.affinity_focus_couts, 50),
    focus_differenciation: num(row.affinity_focus_differenciation, 50),
  });

  const kpiAffinity = new Map(
    ((kpiCatalogRows ?? []) as Row[]).map((r) => [str(r.key), toAffinity(r)]),
  );
  const axisAffinity = new Map(
    ((axisCatalogRows ?? []) as Row[]).map((r) => [str(r.key), toAffinity(r)]),
  );

  // L'affinité d'une DIRECTION est agrégée depuis ses indicateurs : une
  // direction dont tous les KPI servent la domination par les coûts EST une
  // direction de domination par les coûts. Une seule source de vérité.
  const directionAffinity = directionAffinityFromKpis(
    ((kpiCatalogRows ?? []) as Row[]).map((r) => ({
      directionKey: str(r.direction_key),
      affinity: toAffinity(r),
    })),
  );

  /**
   * Conception organisationnelle d'un DAS, ou `null` si rien n'a jamais été conçu.
   *
   * L'organisation PERSISTE d'un exercice à l'autre : ne rien changer, c'est
   * conserver la structure de l'an dernier — comme dans une vraie entreprise.
   * On retient donc le tour le plus récent où l'équipe a effectivement conçu
   * quelque chose, et non le tour courant seul.
   *
   * C'est aussi un choix pédagogique : si ne rien faire donnait zéro, une
   * équipe passive serait aussi mal notée qu'une équipe qui s'organise à
   * contresens. Ne rien changer doit donner une structure moyenne — bien
   * concevoir récompense, mal concevoir sanctionne.
   */
  const organisationFor = (teamId: string, dasId: string): OrgSnapshot | null => {
    const designs = ((orgDesignRows ?? []) as Row[])
      .filter((d) => str(d.team_id) === teamId && str(d.das_id) === dasId)
      .sort((a, b) => num(b.round_number) - num(a.round_number));

    const design = designs[0];
    if (!design) return null;

    // Les composantes suivent le MÊME tour que la conception retenue : mélanger
    // les budgets de cette année avec l'organigramme de l'an dernier donnerait
    // une image qu'aucune équipe n'a jamais décidée.
    const effectiveRound = num(design.round_number);
    const mine = <T extends Row>(rows: T[] | null) =>
      (rows ?? []).filter(
        (r) => str(r.team_id) === teamId
          && str(r.das_id) === dasId
          && num(r.round_number) === effectiveRound,
      );

    return {
      structureType: str(design.structure_type, 'fonctionnelle') as OrgSnapshot['structureType'],
      delegationLevel: num(design.delegation_level, 50),
      strategicAxes: mine(orgAxisRows as Row[] | null).map((a) => ({
        key: str(a.axis_key),
        priority: num(a.priority, 3),
        affinity: axisAffinity.get(str(a.axis_key)) ?? {
          domination_couts: 50, differenciation: 50,
          focus_couts: 50, focus_differenciation: 50,
        },
      })),
      directionKpis: mine(orgKpiRows as Row[] | null).map((k) => ({
        directionKey: str(k.direction_key),
        kpiKey: str(k.kpi_key),
        affinity: kpiAffinity.get(str(k.kpi_key)) ?? {
          domination_couts: 50, differenciation: 50,
          focus_couts: 50, focus_differenciation: 50,
        },
      })),
      directionBudgets: mine(orgBudgetRows as Row[] | null).map((b) => ({
        directionKey: str(b.direction_key),
        budgetMad: num(b.budget_mad),
      })),
      positions: mine(orgPositionRows as Row[] | null).map((p) => ({
        directionKey: str(p.direction_key),
        hierarchyLevel: num(p.hierarchy_level, 2),
        headcount: num(p.headcount),
        isKeyPosition: bool(p.is_key_position),
      })),
    };
  };

  const strategyByTeam = byTeam(strategyRows as Row[] | null);
  const hrByTeam = byTeam(hrRows as Row[] | null);
  /**
   * Dernier budget CONNU de chaque équipe, tous tours confondus.
   *
   * `byTeam` écraserait avec la dernière ligne rencontrée, sans garantie
   * d'ordre. On trie explicitement : le tour le plus récent gagne, et lui seul
   * porte l'encours de dette et les capitaux propres.
   */
  const budgetByTeam = new Map<string, Row>();
  for (const row of [...((budgetRows ?? []) as Row[])].sort(
    (a, b) => num(a.round_number) - num(b.round_number),
  )) {
    budgetByTeam.set(str(row.team_id), row);
  }

  /**
   * Budget SAISI CE TOUR, s'il existe.
   *
   * `financial_budgets` mélange deux natures : un ÉTAT qui persiste (dette
   * restant due, capitaux propres) et des DÉCISIONS propres au tour (tirage,
   * remboursement, frais de siège, régime fiscal). Reporter l'état est
   * indispensable ; reporter les décisions ferait retirer le même crédit à
   * chaque tour, indéfiniment. D'où deux lectures distinctes.
   */
  const currentBudgetByTeam = byTeam(budgetRows as Row[] | null, roundNumber);
  const stateByTeam = byTeam(previousStateRows as Row[] | null);
  const pnlByTeam = byTeam(previousPnlRows as Row[] | null);
  const alignmentByTeam = byTeam(previousAlignmentRows as Row[] | null);

  // --- Offres de l'écosystème, à l'état du tour en cours ---------------------
  interface ActorState {
    actorId: string; dasId: string; type: string; round: Row;
    /** Équipe qui a racheté ce maillon. `null` = acteur indépendant. */
    ownerTeamId: string | null;
    /** Qualité d'intégration figée au rachat. `undefined` si indépendant. */
    integrationQuality: number | undefined;
  }
  const actorStates = new Map<string, ActorState>();
  for (const actor of (actorRows ?? []) as Row[]) {
    const rounds = (actor.ecosystem_actor_rounds ?? []) as Row[];
    // Le dernier état connu à ce tour : un acteur n'a pas forcément une ligne
    // par tour, et une donnée manquante ne doit pas le faire disparaître.
    const state = rounds
      .filter((r) => num(r.round_number) <= roundNumber)
      .sort((a, b) => num(b.round_number) - num(a.round_number))[0];
    if (!state) continue;
    actorStates.set(str(actor.id), {
      actorId: str(actor.id),
      dasId: str(actor.das_id),
      type: str(actor.actor_type),
      ownerTeamId: actor.owner_team_id ? str(actor.owner_team_id) : null,
      integrationQuality:
        actor.integration_quality === null || actor.integration_quality === undefined
          ? undefined
          : num(actor.integration_quality),
      round: state,
    });
  }

  const supplierCountByDas = new Map<string, number>();
  for (const state of actorStates.values()) {
    if (state.type !== 'fournisseur') continue;
    supplierCountByDas.set(state.dasId, (supplierCountByDas.get(state.dasId) ?? 0) + 1);
  }

  // --- Historique de CAPEX pour les amortissements --------------------------
  const capexRoundsByTeam = new Map<string, number[]>();
  for (const row of (capexHistoryRows ?? []) as Row[]) {
    const list = capexRoundsByTeam.get(str(row.team_id)) ?? [];
    capexRoundsByTeam.set(str(row.team_id), list);
  }

  const consultingByTeam = new Map<string, number>();
  for (const row of (consultingRows ?? []) as Row[]) {
    const id = str(row.team_id);
    consultingByTeam.set(id, (consultingByTeam.get(id) ?? 0) + num(row.price_paid_mad));
  }

  const sectorByDas = new Map(das.map((d) => [d.dasId, d.sectorKey]));



  /**
   * Déclinaison des directives du groupe par un DAS, ou `null` si l'équipe n'en
   * a jamais saisi.
   *
   * Report d'un tour à l'autre, comme l'organisation : ne rien rechanger, c'est
   * reconduire. Une équipe qui a réparti les rôles au tour 1 et n'y touche plus
   * garde cette répartition, elle ne revient pas à un état neutre.
   *
   * ── LA PROXIMITÉ, ET POURQUOI ELLE SE CALCULE ICI ────────────────────────
   * Une ressource mutualisée n'a de valeur que si les DAS qui la partagent sont
   * proches. La proximité pertinente est donc celle de CE DAS aux AUTRES
   * utilisateurs de la plateforme — pas une propriété de la plateforme. Elle ne
   * peut se calculer qu'ici, où l'on connaît à la fois la liste des utilisateurs
   * et la matrice sectorielle.
   */
  /**
   * Mouvement Ansoff retenu pour un DAS : la directive la plus récente, à
   * défaut ce que porte l'unité — une unité acquise en cours de partie reçoit
   * son mouvement à l'acquisition, avant que l'équipe n'ait rien déclaré.
   */
  const ansoffMovementFor = (
    teamId: string,
    dasId: string,
    unitRow: Row,
  ): TeamDasSnapshot['ansoffMovement'] => {
    const directive = ((groupDirectiveRows ?? []) as Row[])
      .filter((d) => str(d.team_id) === teamId && str(d.das_id) === dasId)
      .sort((a, b) => num(b.round_number) - num(a.round_number))[0];

    return ((directive?.ansoff_movement ?? unitRow.ansoff_movement) as
      TeamDasSnapshot['ansoffMovement']) ?? null;
  };

  const groupStanceFor = (teamId: string, dasId: string) => {
    const directives = ((groupDirectiveRows ?? []) as Row[])
      .filter((d) => str(d.team_id) === teamId && str(d.das_id) === dasId)
      .sort((a, b) => num(b.round_number) - num(a.round_number))[0];

    if (!directives) return null;

    // Plateformes que le groupe a ouvertes à ce DAS, au tour le plus récent.
    const platforms = ((platformRows ?? []) as Row[]).filter((p) => str(p.team_id) === teamId);
    const latestPlatformRound = platforms.reduce(
      (acc, p) => Math.max(acc, num(p.round_number)),
      -Infinity,
    );
    const openToMe = platforms.filter(
      (p) =>
        num(p.round_number) === latestPlatformRound &&
        ((p.das_ids as string[] | null) ?? []).includes(dasId),
    );

    const adoptions = ((sharedResourceRows ?? []) as Row[])
      .filter((r) => str(r.team_id) === teamId && str(r.das_id) === dasId)
      .sort((a, b) => num(b.round_number) - num(a.round_number));

    const mySector = sectorByDas.get(dasId) ?? '';

    return {
      portfolioRole: str(directives.portfolio_role, 'relais') as
        'moteur' | 'relais' | 'soutien' | 'reserve',
      hqPurchasing: bool(directives.hq_purchasing),
      hqIt: bool(directives.hq_it),
      hqRd: bool(directives.hq_rd),
      hqHr: bool(directives.hq_hr),
      hqFinance: bool(directives.hq_finance, true),
      sharedResources: openToMe.map((p) => {
        const others = (((p.das_ids as string[] | null) ?? []).filter((id) => id !== dasId));
        // Sans autre utilisateur, ce n'est pas une mutualisation : c'est un
        // actif dédié. La proximité à soi-même vaut 100 et l'adhésion est
        // légitime — la contrainte `at_least_two_das` rend le cas théorique.
        const prox = others.length === 0
          ? 100
          : others.reduce((acc, id) => acc + proximity(mySector, sectorByDas.get(id) ?? ''), 0) /
            others.length;

        const key = str(p.platform_type);
        const mine = adoptions.find((r) => str(r.resource_key) === key);
        return {
          resourceKey: key,
          proximity: prox,
          adoptionLevel: num(mine?.adoption_level),
          standardised: bool(mine?.standardised),
        };
      }),
    };
  };

  /**
   * Nombre de tours consécutifs, en remontant depuis le dernier, où l'indice
   * d'alignement a PROGRESSÉ.
   *
   * Le champ était câblé à zéro, si bien que le bonus de progression du score
   * temporel (`alignment.sat_improvement_bonus`) n'était jamais versé : une
   * équipe qui se redressait tour après tour n'en tirait rien, et le seul
   * levier du SAT restait le malus de changement. Le message du jeu s'en
   * trouvait inversé — tenir un cap ne payait pas, il évitait seulement d'être
   * puni.
   */
  const improvingRoundsByTeam = new Map<string, number>();
  for (const teamId of teamIds) {
    const history = ((iaHistoryRows ?? []) as Row[])
      .filter((r) => str(r.team_id) === teamId)
      .sort((a, b) => num(a.round_number) - num(b.round_number))
      .map((r) => num(r.ia_score));

    let streak = 0;
    for (let i = history.length - 1; i > 0; i -= 1) {
      if (history[i] > history[i - 1]) streak += 1;
      else break;
    }
    improvingRoundsByTeam.set(teamId, streak);
  }

  // --- Construction des équipes ---------------------------------------------
  const teams: TeamSnapshot[] = (teamRows ?? []).map((teamRow: Row) => {
    const teamId = str(teamRow.id);
    const strategy = strategyByTeam.get(teamId);
    const hr = hrByTeam.get(teamId);
    const budget = budgetByTeam.get(teamId);
    const current = currentBudgetByTeam.get(teamId);
    const state = stateByTeam.get(teamId);
    const pnl = pnlByTeam.get(teamId);
    const previousAlignment = alignmentByTeam.get(teamId);

    const teamUnits = ((unitRows ?? []) as Row[]).filter((u) => str(u.team_id) === teamId);

    const units: TeamDasSnapshot[] = teamUnits.map((unitRow) => {
      const dasId = str(unitRow.das_id);
      // La décision EN VIGUEUR : la plus récente au plus tard à ce tour.
      // Même règle que l'interface, au caractère près.
      const myDecisions = ((decisionHistoryRows ?? []) as Row[]).filter(
        (d) => str(d.team_id) === teamId && str(d.das_id) === dasId,
      );
      const decision = latestAtMost(myDecisions, roundNumber);
      const previousDecision = latestAtMost(myDecisions, previousRound);
      const previousMetric = ((previousMetricRows ?? []) as Row[]).find(
        (m) => str(m.team_id) === teamId && str(m.das_id) === dasId,
      );

      const procurement = contractsFor(procurementRows as Row[] | null, teamId, dasId)
        .flatMap((p) => {
          const actor = actorStates.get(str(p.supplier_id));
          if (!actor) return [];
          return [{
            supplier: {
              actorId: actor.actorId,
              priceIndex: num(actor.round.price_index, 1),
              reliability: num(actor.round.reliability, 70),
              qualityContribution: num(actor.round.quality_contribution, 60),
              capacityUnits: num(actor.round.capacity_units, 1),
              switchingCost: num(actor.round.switching_cost),
              minimumVolume: num(actor.round.minimum_volume),
              // Intégration amont : on ne négocie pas contre soi-même.
              ownedByTeam: actor.ownerTeamId === teamId,
              integrationQuality: actor.integrationQuality,
            },
            committedVolume: num(p.committed_volume),
          }];
        });

      const distribution = contractsFor(distributionRows as Row[] | null, teamId, dasId)
        .flatMap((d) => {
          const actor = actorStates.get(str(d.distributor_id));
          if (!actor) return [];
          return [{
            distributor: {
              actorId: actor.actorId,
              coveragePct: num(actor.round.coverage_pct, 0.3),
              requiredMarginPct: num(actor.round.required_margin_pct, 0.2),
              negotiatingStrength: num(actor.round.negotiating_strength, 50),
              serviceLevel: num(actor.round.service_level, 60),
              minimumVolume: num(actor.round.minimum_volume),
              // Intégration aval : sa couverture rejoint le réseau propre.
              ownedByTeam: actor.ownerTeamId === teamId,
              integrationQuality: actor.integrationQuality,
            },
            volumeShare: num(d.volume_share),
          }];
        });

      const declaredStrategy = previousDecision
        ? (str(previousDecision.generic_strategy) as GenericStrategy)
        : null;

      return {
        dasId,
        // Cash pooling : ce que le groupe injecte dans ce domaine, ou y
        // prélève, CE TOUR. Un geste, jamais reconduit.
        cashTransferMad: num(
          ((cashRows ?? []) as Row[])
            .find((c) => str(c.team_id) === teamId && str(c.das_id) === dasId)
            ?.transfer_mad,
        ),
        decision: {
          genericStrategy: (str(decision?.generic_strategy, 'domination_couts') as GenericStrategy),
          pricePosition: num(decision?.price_position, 50),
          // Sans segment servi il n'y a rien à calculer : un domaine acquis
          // peut avoir hérité de clés qui n'existent plus, et une équipe qui
          // n'a jamais ouvert l'écran n'a rien déclaré. On retombe sur le
          // premier segment du catalogue — le même défaut que l'interface
          // affiche, plutôt qu'un marché adressable vide.
          servedSegments: servedSegmentsOrDefault(
            decision?.served_segments as string[] | null,
            (das.find((d) => d.dasId === dasId)?.segments ?? []).map((seg) => seg.segmentKey),
          ),
          capexCapacityMad: num(decision?.capex_capacity_mad),
          capexAutomationMad: num(decision?.capex_automation_mad),
          capexOwnNetworkMad: num(decision?.capex_own_network_mad),
          rdBudgetMad: num(decision?.rd_budget_mad),
          marketingBudgetMad: num(decision?.marketing_budget_mad),
          declareBlueOcean: bool(decision?.declare_blue_ocean),
        },
        previous: {
          quality: num(previousMetric?.quality, num(params['endowment.quality'], 50)),
          notoriety: num(previousMetric?.notoriety, num(params['endowment.notoriety'], 50)),
          capacityUnits: num(previousMetric?.capacity_units),
          cumulativeVolume: num(previousMetric?.cumulative_volume),
          inputStockUnits: num(previousMetric?.input_stock_units),
          finishedStockUnits: num(previousMetric?.finished_stock_units),
          volumeSold: num(previousMetric?.volume_sold),
          stockoutRate: num(previousMetric?.stockout_rate),
          revenueMad: num(previousMetric?.revenue_mad),
          cumulativeAutomationCapexMad: num(previousMetric?.automation_level) > 0
            ? num(previousMetric?.automation_level) / 100 *
              num(previousMetric?.capacity_units) * 220
            : 0,
          cumulativeNetworkCapexMad: 0,
          declaredStrategy,
          hadStrategicDrift: bool(previousAlignment?.strategic_drift),
        },
        procurement,
        distribution,
        supplierAlternatives: supplierCountByDas.get(dasId) ?? 0,
        launchedRound: num(unitRow.launched_round),
        // Le mouvement DÉCLARÉ, et non l'état figé de l'unité.
        //
        // L'écran d'organisation écrit le mouvement Ansoff dans
        // `das_group_directives`, tandis que le moteur lisait
        // `team_units.ansoff_movement` — colonne que seule la persistance des
        // acquisitions alimente. Pour toute unité fondatrice, le mouvement
        // restait donc nul et `ansoff_risk_coefficient` à son défaut de 0 :
        // une équipe déclarait « diversification » et le moteur appliquait un
        // risque d'entrée nul. La matrice d'Ansoff ne coûtait rien.
        ansoffMovement: ansoffMovementFor(teamId, dasId, unitRow),

        blueOcean: bool(unitRow.blue_ocean),
        blueOceanRoundsLeft: num(unitRow.blue_ocean_rounds_left),
        commissionedCapexMad: num(previousDecision?.capex_capacity_mad),
        previousRdBudgetMad: num(previousDecision?.rd_budget_mad),
        technologyPartnerBonus: 0,
        organisation: organisationFor(teamId, dasId),
        groupStance: groupStanceFor(teamId, dasId),
        hr: (() => {
          const h = ((dasHrRows ?? []) as Row[]).find(
            (r) => str(r.team_id) === teamId && str(r.das_id) === dasId,
          );
          if (!h) return null;
          return {
            hireOperateurs: num(h.hire_operateurs),
            hireTechniciens: num(h.hire_techniciens),
            hireExperts: num(h.hire_experts),
            hireCadres: num(h.hire_cadres),
            layoffs: num(h.layoffs),
            internalTransfersIn: num(h.internal_transfers_in),
            avgSalaryBrutMad: num(h.avg_salary_brut_mad, 5800),
            trainingBudgetMad: num(h.training_budget_mad),
            trainingFocus: str(h.training_focus, 'technique') as
              'technique' | 'management' | 'qualite' | 'polyvalence',
            claimOfppt: bool(h.claim_ofppt),
            claimGiac: bool(h.claim_giac),
            orderSkillsAudit: bool(h.order_skills_audit),
            restructuring: str(h.restructuring, 'aucune') as
              'aucune' | 'reorganisation' | 'externalisation' | 'fermeture_site',
          };
        })(),
        previousHr: (() => {
          const prev = ((dasHrStateRows ?? []) as Row[])
            .filter((r) => str(r.team_id) === teamId && str(r.das_id) === dasId)
            .sort((a, b) => num(b.round_number) - num(a.round_number))[0];

          // Faute d'état RH par DAS — au premier tour, ou sur une session
          // provisionnée avant l'introduction du module — on retombe sur
          // l'effectif de l'organigramme, puis sur l'effectif du groupe. Ne
          // rien avoir ne doit jamais donner un effectif nul : le DAS
          // cesserait de produire pour une raison qui n'est pas une décision.
          const fromPositions = ((orgPositionRows ?? []) as Row[])
            .filter((r) => str(r.team_id) === teamId && str(r.das_id) === dasId)
            .reduce((acc, r) => acc + num(r.headcount), 0);

          return {
            headcount: num(prev?.headcount, fromPositions || num(state?.headcount, 1)),
            climatSocial: num(prev?.climat_social, num(state?.climat_social, 70)),
            // Repli sur le niveau de compétence de la DOTATION, et non sur 50.
            // Le moteur mesure désormais l'ÉCART à ce niveau hérité : un repli
            // arbitraire aurait offert trente points d'avance — donc du coût
            // variable en moins et de la qualité en plus — à toute équipe dont
            // l'état RH manque, pour une décision qu'elle n'a pas prise.
            skillIndex: num(prev?.skill_index, num(params['endowment.expert_share'], 20)),
            avgSalaryBrutMad: num(hr?.avg_salary_brut_mad, 5800),
            // Rotation et perte de qualité du dernier exercice clos : c'est ce
            // tour-ci qu'elles se paient, en départs subis et en qualité.
            turnoverRate: num(prev?.turnover_rate),
            qualityLossPts: num(prev?.quality_loss_pts),
            // Repli NEUTRE : une session résolue avant l'introduction du
            // champ ne doit ni gagner ni perdre de qualité pour une
            // orientation de formation qu'on ne lui a pas demandée.
            qualityFocusFactor: num(prev?.quality_focus_factor, 1),
            // Deux exercices sont clos avant le tour 1 : l'entreprise est
            // héritée, pas créée. Une ancienneté de huit ans est le cas
            // courant d'une PME industrielle marocaine, et c'est elle qui
            // rend les indemnités de rupture coûteuses.
            seniorityYears: 8,
          };
        })(),
      };
    });

    return {
      teamId,
      poolId: str(teamRow.pool_id),
      isLiquidated: bool(teamRow.is_liquidated),
      corporate: {
        corporateStrategy: (str(strategy?.corporate_strategy, 'specialisation') as TeamSnapshot['corporate']['corporateStrategy']),
        structureType: (str(strategy?.structure_type, 'fonctionnelle') as TeamSnapshot['corporate']['structureType']),
        centralPurchasing: bool(strategy?.central_purchasing),
        centralIt: bool(strategy?.central_it),
        centralRd: bool(strategy?.central_rd),
        centralHr: bool(strategy?.central_hr),
        centralFinance: bool(strategy?.central_finance, true),
        sharedProduction: bool(strategy?.shared_production),
        sharedRd: bool(strategy?.shared_rd),
        values: [
          str(strategy?.value_1, 'fiabilite_service'),
          str(strategy?.value_2, 'efficience_operationnelle'),
        ] as TeamSnapshot['corporate']['values'],
        sharedSupplierRatio: sharedActorRatio(procurementRows as Row[] | null, teamId, 'supplier_id'),
        sharedDistributorRatio: sharedActorRatio(distributionRows as Row[] | null, teamId, 'distributor_id'),
      },
      hr: {
        headcountStart: num(hr?.headcount_start, num(state?.headcount, 1)),
        hireOperateurs: num(hr?.hire_operateurs),
        hireTechniciens: num(hr?.hire_techniciens),
        hireExperts: num(hr?.hire_experts),
        hireCadres: num(hr?.hire_cadres),
        avgSalaryBrutMad: num(hr?.avg_salary_brut_mad, num(params['endowment.avg_salary_mad'], 5800)),
        trainingBudgetMad: num(hr?.training_budget_mad),
        restructuringCount: num(hr?.restructuring_count),
        previousExpertShare: num(state?.talent_mix, num(params['endowment.expert_share'], 20)),
      },
      finance: {
        // ── Deux natures, et non une ────────────────────────────────────
        //
        // Les quatre champs étaient lus au seul tour courant, au motif que
        // reporter une décision ferait retirer le même crédit indéfiniment.
        // C'est vrai du tirage et du remboursement, qui sont des GESTES.
        // Ce ne l'est pas des frais de siège ni du régime fiscal, qui sont des
        // ENGAGEMENTS : un bail, une direction générale et un statut fiscal ne
        // s'évaporent pas parce qu'une équipe n'a pas rouvert l'écran.
        //
        // L'écran, lui, reconduisait déjà les deux — c'est le défaut que
        // `reconduction.ts` existe pour empêcher : l'équipe lisait un siège de
        // 597 M et un régime CFC, le moteur résolvait un siège nul et le droit
        // commun. Une équipe pouvait changer de taux d'impôt sans l'avoir
        // décidé, et rien ne pouvait le lui révéler.
        opexMad: current ? num(current.opex_mad) : num(budget?.opex_mad),
        // Gestes du tour : jamais reportés.
        debtDrawnMad: num(current?.debt_drawn_mad),
        debtRepaidMad: num(current?.debt_repaid_mad),
        capitalRaisedMad: num(current?.capital_raised_mad),
        dividendMad: num(current?.dividend_mad),
        taxRegime: (str(
          current?.tax_regime ?? budget?.tax_regime,
          'droit_commun',
        ) as TeamSnapshot['finance']['taxRegime']),
        // État : reporté depuis le dernier budget connu.
        treasuryStartMad: num(pnl?.treasury_end_mad, num(budget?.treasury_start_mad)),
        equityMad: num(budget?.equity_mad),
        debtOutstandingMad: num(budget?.debt_outstanding_mad),
        capexHistoryMad: capexRoundsByTeam.get(teamId) ?? [],
        previousWorkingCapitalMad: num(pnl?.working_capital_mad),
        consultingSpendMad: consultingByTeam.get(teamId) ?? 0,
      },
      units,
      previousClimatSocial: num(state?.climat_social, 70),
      previousTreasuryStatus: (str(state?.treasury_status, 'sain') as TeamSnapshot['previousTreasuryStatus']),
      previousConsecutiveNegativeRounds: num(state?.consecutive_negative_treasury_rounds),
      consecutiveImprovingRounds: improvingRoundsByTeam.get(teamId) ?? 0,
      // Changer de stratégie de groupe se facture au score temporel — encore
      // faut-il savoir ce qu'elle était. Le champ valait `null` en dur, ce qui
      // rendait tout changement de cap corporate gratuit, alors qu'un
      // changement par DAS, lui, était bien compté.
      previousCorporateStrategy:
        (((previousStrategyRows ?? []) as Row[])
          .find((r) => str(r.team_id) === teamId)?.corporate_strategy as
            TeamSnapshot['previousCorporateStrategy']) ?? null,
      previousStructureType:
        (((previousStrategyRows ?? []) as Row[])
          .find((r) => str(r.team_id) === teamId)?.structure_type as
            TeamSnapshot['previousStructureType']) ?? null,
      shockResponses: ((shockResponseRows ?? []) as Row[])
        .filter((r) => str(r.team_id) === teamId)
        .map((r) => ({
          shockId: str(r.shock_id),
          // L'arbitrage du facilitateur, converti en facteur au seul endroit
          // qui fait la conversion. Une ligne sans arbitrage vaut 0 %, donc
          // un facteur de 1 : la carte s'applique telle qu'elle est écrite.
          impactFactor: impactFactor(num(r.impact_pct)),
          costMad: num(r.cost_mad),
        })),
    };
  });

  // --- Chocs actifs ---------------------------------------------------------
  const shocks: ShockEffects[] = ((shockRows ?? []) as Row[]).map((row) => {
    const effects = (row.effects ?? {}) as Record<string, unknown>;
    return {
      shockId: str(row.id),
      dasId: str(row.das_id),
      marketSizePct: num(effects.market_size_pct),
      inputCostPct: num(effects.input_cost_pct),
      capacityPct: num(effects.capacity_pct),
      qualityFloor: effects.quality_floor === undefined ? null : num(effects.quality_floor),
      rateDelta: num(effects.rate_delta),
      supplierPowerPct: num(effects.supplier_power_pct),
      distributorPowerPct: num(effects.distributor_power_pct),
      payrollPct: num(effects.payroll_pct),
      severancePct: num(effects.severance_pct),
      capexCostPct: num(effects.capex_cost_pct),
      workingCapitalDaysDelta: num(effects.working_capital_days_delta),
      priceElasticityDelta: num(effects.price_elasticity_delta),
      notorietyPct: num(effects.notoriety_pct),
      trainingSubsidyPct: num(effects.training_subsidy_pct),
      subsidyPctOfRevenue: num(effects.subsidy_pct_of_revenue),
      shareRedistributionPts: num(row.share_redistribution_pts),
      beneficiaryTeamIds: (effects.beneficiary_team_ids as string[]) ?? [],
    };
  });

  // --- Marché de cession ----------------------------------------------------
  const listings: ListingSnapshot[] = ((listingRows ?? []) as Row[]).map((row) => {
    const listingId = str(row.id);
    const bids: BidSnapshot[] = ((bidRows ?? []) as Row[])
      .filter((b) => str(b.listing_id) === listingId)
      .map((b) => ({
        bidderTeamId: str(b.bidder_team_id),
        offerMad: num(b.offer_mad),
        integrationBudgetMad: num(b.integration_budget_mad),
      }));

    return {
      listingId,
      sellerTeamId: str(row.seller_team_id),
      dasId: str(row.das_id),
      bids,
      withdrawn: str(row.status) === 'withdrawn',
      sellerChoice: (str(row.seller_choice, 'npc') as ListingSnapshot['sellerChoice']),
    };
  });

  // --- Offres d'acquisition -------------------------------------------------
  //
  // Le PRIX DE RÉSERVE et le poids réel de la cible sont calculés ici, côté
  // serveur, et n'apparaissent jamais dans le navigateur d'une équipe : les
  // connaître permettrait d'offrir un dirham de plus que le minimum, et
  // l'enchère perdrait tout son sens. Ils s'approchent par la due diligence.
  const acquisitionOffers: AcquisitionOfferSnapshot[] = ((acquisitionRows ?? []) as Row[]).map(
    (offer) => {
      const state = actorStates.get(str(offer.target_actor_id));
      const round = state?.round ?? {};
      const dasId = str(offer.das_id);
      const dasEntry = das.find((d) => d.dasId === dasId);

      const revenue = num(round.revenue_mad);
      const marketSize = dasEntry?.previousMarketSizeMad ?? 0;
      const health = num(round.financial_health, 60);
      const appetite = num(round.divest_appetite, 30);

      return {
        offerId: str(offer.id),
        bidderTeamId: str(offer.bidder_team_id),
        targetActorId: str(offer.target_actor_id),
        dasId,
        operation: (str(offer.operation, 'entree_das') as
          AcquisitionOfferSnapshot['operation']),
        offerMad: num(offer.offer_mad),
        integrationBudgetMad: num(offer.integration_budget_mad),
        targetMarketShare: marketSize > 0 ? revenue / marketSize : 0,
        targetCapacityUnits: num(round.capacity_units),
        targetRevenueMad: revenue,
        // Une entreprise saine a une meilleure image de marque qu'une entreprise
        // qui se cherche un repreneur.
        targetNotoriety: clampScore(health * 0.8 + 20),
        targetQuality: clampScore(num(round.quality_contribution, 55)),
        // Prix de réserve : la valorisation par les revenus, escomptée d'autant
        // plus que la cible est pressée de vendre. Une entreprise en bonne
        // santé et sans appétence à céder ne se brade pas.
        // Un maillon de filière ne se valorise pas comme l'industriel qu'il
        // sert : un distributeur est peu capitalistique et vit sur des marges
        // minces, un fournisseur se situe entre les deux. Appliquer le multiple
        // du secteur à tout le monde aurait fait payer un grossiste au prix
        // d'une usine.
        reservePriceMad:
          revenue
          * (dasEntry?.parameters.valuationMultiple ?? 5)
          * (state?.type === 'distributeur' ? 0.65 : state?.type === 'fournisseur' ? 0.80 : 1)
          * 0.35
          * (1 - (appetite / 100) * 0.35),
      };
    },
  );

  return {
    input: {
      sessionId, roundNumber, das, teams, shocks, listings, acquisitionOffers,
      directionAffinity, proximity,
    },
    params,
    poolByTeam,
  };
}

/**
 * Part des acteurs communs à au moins deux DAS de l'équipe.
 *
 * Alimente l'indice de mutualisation EFFECTIVE (doc 01 §5.3) : centraliser les
 * achats ne compte que si les DAS achètent réellement aux mêmes fournisseurs.
 */
/**
 * Contrats EN VIGUEUR pour un couple équipe/DAS.
 *
 * Les lignes viennent de tous les tours jusqu'au tour courant inclus. On retient
 * le tour le plus récent où l'équipe a effectivement contracté sur ce DAS, et
 * l'intégralité de ce tour-là : renégocier, c'est remplacer son portefeuille
 * amont, pas y ajouter une ligne. Prendre l'union de tous les tours ferait
 * cumuler indéfiniment des fournisseurs qu'on a cessé de référencer.
 */
function contractsFor(rows: Row[] | null, teamId: string, dasId: string): Row[] {
  const mine = (rows ?? []).filter(
    (r) => str(r.team_id) === teamId && str(r.das_id) === dasId,
  );
  if (mine.length === 0) return [];

  const latest = mine.reduce((acc, r) => Math.max(acc, num(r.round_number)), -Infinity);
  return mine.filter((r) => num(r.round_number) === latest);
}

/**
 * Part des acteurs communs à au moins deux DAS — alimente `shared_resources_index`.
 *
 * Ne compare que les contrats EN VIGUEUR : sans cela, un fournisseur référencé
 * sur le DAS A au tour 1 puis sur le DAS B au tour 3 apparaîtrait comme mutualisé
 * alors qu'il n'a jamais servi les deux en même temps.
 */
function sharedActorRatio(rows: Row[] | null, teamId: string, actorColumn: string): number {
  const dasIds = new Set(
    (rows ?? []).filter((r) => str(r.team_id) === teamId).map((r) => str(r.das_id)),
  );
  const teamRows = [...dasIds].flatMap((dasId) => contractsFor(rows, teamId, dasId));
  if (teamRows.length === 0) return 0;

  const dasByActor = new Map<string, Set<string>>();
  for (const row of teamRows) {
    const actorId = str(row[actorColumn]);
    const set = dasByActor.get(actorId) ?? new Set<string>();
    set.add(str(row.das_id));
    dasByActor.set(actorId, set);
  }

  const shared = [...dasByActor.values()].filter((set) => set.size >= 2).length;
  return dasByActor.size > 0 ? shared / dasByActor.size : 0;
}
