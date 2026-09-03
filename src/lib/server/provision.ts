import 'server-only';

/**
 * ATLAS — provisionnement d'une session.
 *
 * Crée en une fois : la session, ses pools, les 8 DAS et leurs segments, la
 * matrice de proximité, l'écosystème fictif, les équipes, et l'état initial
 * (tour 0) de chacune.
 *
 * La dotation est calculée par `computeEndowment` et STRICTEMENT IDENTIQUE pour
 * toutes les équipes d'un pool : la fonction ne prend aucun identifiant
 * d'équipe, l'asymétrie est donc impossible par construction (doc 03 §7).
 */

import { computeEndowment } from '@/lib/engine/endowment';
import { makeRng, seedFrom } from '@/lib/engine/math';
import { DEFAULT_PARAMS, buildParams } from '@/lib/engine/params';
import type { DasParameters } from '@/lib/engine/types';

import { DAS_CATALOG, SECTOR_PROXIMITY } from './das-catalog';
import { generateEcosystem } from './ecosystem-seed';
import { buildInheritedContracts } from './inherited-contracts';
import { seedOrganisation } from './org-seed';
import type { createAdminClient } from '@/lib/supabase/server';

type AdminClient = ReturnType<typeof createAdminClient>;

export interface ProvisionRequest {
  sessionName: string;
  facilitatorId: string;
  /** Un pool = une ligue. Plusieurs pools simulent des marchés parallèles. */
  pools: { name: string; teamNames: string[] }[];
  /** Secteurs ouverts à cette session. Le premier est imposé à toutes les équipes en T0. */
  sectorKeys: string[];
  plannedRounds: number;
  maxRounds: number;
}

export interface ProvisionResult {
  sessionId: string;
  sessionJoinCode: string;
  teams: { teamId: string; name: string; poolName: string; joinCode: string }[];
  dasCount: number;
  actorCount: number;
}

/** Codes courts, sans caractères ambigus : ils sont lus au tableau et recopiés. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function code(rng: () => number, length: number): string {
  return Array.from({ length }, () => ALPHABET[Math.floor(rng() * ALPHABET.length)]).join('');
}

export async function provisionSession(
  admin: AdminClient,
  request: ProvisionRequest,
): Promise<ProvisionResult> {
  const rng = makeRng(seedFrom(request.sessionName, request.facilitatorId, Date.now()));
  const params = buildParams();

  const catalog = DAS_CATALOG.filter((d) => request.sectorKeys.includes(d.sectorKey));
  if (catalog.length === 0) {
    throw new Error('Aucun secteur valide retenu pour cette session.');
  }

  // --- Session --------------------------------------------------------------
  const { data: session, error: sessionError } = await admin
    .from('game_sessions')
    .insert({
      name: request.sessionName,
      facilitator_id: request.facilitatorId,
      join_code: code(rng, 6),
      status: 'onboarding',
      current_round: 0,
      planned_rounds: request.plannedRounds,
      max_rounds: request.maxRounds,
    })
    .select('id, join_code')
    .single();

  if (sessionError || !session) {
    throw new Error(`Création de la session impossible : ${sessionError?.message}`);
  }
  const sessionId = session.id as string;

  // --- Paramètres de calibrage ---------------------------------------------
  // Copiés en base pour que le facilitateur puisse les ajuster entre deux
  // promotions sans redéploiement, et pour qu'une session reste rejouable même
  // si les valeurs par défaut du code évoluent.
  await admin.from('engine_parameters').insert(
    Object.entries(DEFAULT_PARAMS).map(([key, value]) => ({
      session_id: sessionId,
      key,
      value,
    })),
  );

  // --- DAS et segments ------------------------------------------------------
  const dasIdBySector = new Map<string, string>();
  const actorsByArchetype = new Map<
    string,
    { suppliers: Map<string, string>; distributors: Map<string, string> }
  >();

  for (const das of catalog) {
    const marketVolume = das.baseMarketSizeMad / das.referenceUnitPriceMad;
    const teamsPerPool = Math.max(
      ...request.pools.map((p) => p.teamNames.length),
      1,
    );

    const dasParams: DasParameters = {
      dasId: '', sectorKey: das.sectorKey,
      referenceUnitPriceMad: das.referenceUnitPriceMad,
      referenceUnitCostMad: das.referenceUnitCostMad,
      fixedCostBaseMad: das.fixedCostBaseMad,
      priceElasticity: das.priceElasticity,
      learningRate: das.learningRate,
      valuationMultiple: das.valuationMultiple,
      workingCapitalDays: das.workingCapitalDays,
      vrioEntryBarrier: das.vrioEntryBarrier,
      unitCapacityCostMad: das.unitCapacityCostMad,
      capacityDepreciation: 0.06,
      capacityFromHeadcount: das.capacityFromHeadcount,
      headcountProductivity: das.headcountProductivity,
      referenceCumulativeVolumeUnits: 1,
    };

    // L'origine de la courbe d'expérience est la dotation elle-même : toutes
    // les équipes démarrent exactement au coût de référence du DAS.
    const endowment = computeEndowment(dasParams, das.baseMarketSizeMad, teamsPerPool, params);

    const { data: inserted, error } = await admin
      .from('strategic_units')
      .insert({
        session_id: sessionId,
        name: das.name,
        sector_key: das.sectorKey,
        bcg_stage: das.bcgStage,
        base_market_size_mad: das.baseMarketSizeMad,
        reference_unit_price_mad: das.referenceUnitPriceMad,
        reference_unit_cost_mad: das.referenceUnitCostMad,
        fixed_cost_base_mad: das.fixedCostBaseMad,
        growth_rate_min: das.growthRateMin,
        growth_rate_max: das.growthRateMax,
        price_elasticity: das.priceElasticity,
        learning_rate: das.learningRate,
        valuation_multiple: das.valuationMultiple,
        working_capital_days: das.workingCapitalDays,
        vrio_entry_barrier: das.vrioEntryBarrier,
        unit_capacity_cost_mad: das.unitCapacityCostMad,
        capacity_depreciation: 0.06,
        capacity_from_headcount: das.capacityFromHeadcount,
        headcount_productivity: das.headcountProductivity,
        reference_cumulative_volume_units: Math.round(endowment.cumulativeVolumeUnits),
      })
      .select('id')
      .single();

    if (error || !inserted) {
      throw new Error(`Création du DAS ${das.name} impossible : ${error?.message}`);
    }
    const dasId = inserted.id as string;
    dasIdBySector.set(das.sectorKey, dasId);
    const suppliersHere = new Map<string, string>();
    const distributorsHere = new Map<string, string>();
    actorsByArchetype.set(das.sectorKey, {
      suppliers: suppliersHere,
      distributors: distributorsHere,
    });

    await admin.from('market_segments').insert(
      das.segments.map((s) => ({
        das_id: dasId,
        segment_key: s.key,
        name: s.name,
        market_share_pct: s.marketSharePct,
        price_sensitivity: s.priceSensitivity,
        quality_requirement: s.qualityRequirement,
        relative_growth: s.relativeGrowth,
      })),
    );

    // --- Écosystème fictif de ce DAS ---------------------------------------
    const actors = generateEcosystem(sessionId, das.sectorKey, marketVolume, request.maxRounds);
    const { data: insertedActors } = await admin
      .from('ecosystem_actors')
      .insert(
        actors.map((a) => ({
          session_id: sessionId,
          das_id: dasId,
          actor_type: a.actorType,
          name: a.name,
          region_key: a.regionKey,
          archetype: a.archetype,
          scenario: a.scenario,
          scenario_trigger_round: a.scenarioTriggerRound,
        })),
      )
      .select('id');

    if (insertedActors) {
      // Index par archétype : les contrats hérités du tour 0 doivent viser des
      // acteurs nommés, pas un tirage. Voir `inherited-contracts.ts`.
      insertedActors.forEach((row, i) => {
        const seed = actors[i];
        const target =
          seed.actorType === 'fournisseur'
            ? suppliersHere
            : seed.actorType === 'distributeur'
              ? distributorsHere
              : null;
        if (target && seed.archetype) target.set(seed.archetype, row.id as string);
      });

      await admin.from('ecosystem_actor_rounds').insert(
        insertedActors.flatMap((row, i) =>
          actors[i].rounds.map((r) => ({
            actor_id: row.id,
            round_number: r.roundNumber,
            revenue_mad: r.revenueMad,
            capacity_units: r.capacityUnits,
            price_index: r.priceIndex,
            reliability: r.reliability,
            quality_contribution: r.qualityContribution,
            coverage_pct: r.coveragePct,
            required_margin_pct: r.requiredMarginPct,
            service_level: r.serviceLevel,
            negotiating_strength: r.negotiatingStrength,
            minimum_volume: r.minimumVolume,
            switching_cost: r.switchingCost,
            financial_health: r.financialHealth,
            divest_appetite: r.divestAppetite,
          })),
        ),
      );
    }
  }

  // --- Matrice de proximité sectorielle ------------------------------------
  const proximityRows = Object.entries(SECTOR_PROXIMITY)
    .map(([pair, value]) => {
      const [a, b] = pair.split('|');
      return { session_id: sessionId, sector_a: a, sector_b: b, proximity: value };
    })
    .filter((r) => request.sectorKeys.includes(r.sector_a) && request.sectorKeys.includes(r.sector_b));

  if (proximityRows.length > 0) {
    await admin.from('sector_proximity').insert(proximityRows);
  }

  // --- Pools, équipes, dotation --------------------------------------------
  const startingSector = request.sectorKeys[0];
  const startingDasId = dasIdBySector.get(startingSector)!;
  const startingDas = catalog.find((d) => d.sectorKey === startingSector)!;

  const teams: ProvisionResult['teams'] = [];

  for (const pool of request.pools) {
    const { data: insertedPool, error: poolError } = await admin
      .from('market_pools')
      .insert({ session_id: sessionId, name: pool.name })
      .select('id')
      .single();

    if (poolError || !insertedPool) {
      throw new Error(`Création du pool ${pool.name} impossible : ${poolError?.message}`);
    }

    const dasParams: DasParameters = {
      dasId: startingDasId, sectorKey: startingSector,
      referenceUnitPriceMad: startingDas.referenceUnitPriceMad,
      referenceUnitCostMad: startingDas.referenceUnitCostMad,
      fixedCostBaseMad: startingDas.fixedCostBaseMad,
      priceElasticity: startingDas.priceElasticity,
      learningRate: startingDas.learningRate,
      valuationMultiple: startingDas.valuationMultiple,
      workingCapitalDays: startingDas.workingCapitalDays,
      vrioEntryBarrier: startingDas.vrioEntryBarrier,
      unitCapacityCostMad: startingDas.unitCapacityCostMad,
      capacityDepreciation: 0.06,
      capacityFromHeadcount: startingDas.capacityFromHeadcount,
      headcountProductivity: startingDas.headcountProductivity,
      referenceCumulativeVolumeUnits: 1,
    };

    // UNE dotation pour tout le pool : la même valeur est écrite pour chaque
    // équipe, jamais recalculée par équipe.
    const endowment = computeEndowment(
      dasParams,
      startingDas.baseMarketSizeMad,
      pool.teamNames.length,
      params,
    );

    for (const teamName of pool.teamNames) {
      const joinCode = code(rng, 5);
      const { data: team, error: teamError } = await admin
        .from('teams')
        .insert({
          session_id: sessionId,
          name: teamName,
          pool_id: insertedPool.id,
          join_code: joinCode,
        })
        .select('id')
        .single();

      if (teamError || !team) {
        throw new Error(`Création de l'équipe ${teamName} impossible : ${teamError?.message}`);
      }
      const teamId = team.id as string;

      await admin.from('team_units').insert({
        team_id: teamId,
        das_id: startingDasId,
        launched_round: 0,
        status: 'active',
      });

      // ── DEUX exercices clos, pas un seul ────────────────────────────────
      //
      // Un tour vaut une ANNÉE, et une équipe dispose toujours du référentiel
      // des deux exercices écoulés (doc 00). Sans N−2, il n'y a pas de
      // TENDANCE : impossible de dire si l'entreprise progressait ou
      // s'essoufflait avant d'en prendre les commandes, et le premier
      // diagnostic stratégique perd son point d'appui.
      //
      //   round −1 → exercice N−2
      //   round  0 → exercice N−1, dernier clos ; c'est aussi la dotation à
      //              partir de laquelle le tour 1 se calcule
      //
      // L'entreprise a crû de N−2 à N−1 : l'exercice antérieur est plus petit,
      // d'un facteur identique pour toutes les équipes.
      const HISTORY_GROWTH = 1.06;

      for (const [round, scale] of [[-1, 1 / HISTORY_GROWTH], [0, 1]] as const) {
        await admin.from('team_das_round_metrics').insert({
          team_id: teamId,
          das_id: startingDasId,
          round_number: round,
          quality: endowment.quality,
          perceived_quality: endowment.quality,
          notoriety: endowment.notoriety,
          capacity_units: endowment.capacityUnits * scale,
          cumulative_volume: endowment.cumulativeVolumeUnits * scale,
          volume_sold: endowment.capacityUnits * scale,
          stockout_rate: 0,
          revenue_mad: endowment.expectedRevenueMad * scale,
          market_share_pct: 1 / pool.teamNames.length,
          market_size_mad: startingDas.baseMarketSizeMad * scale,
          automation_level: 0,
        });

        await admin.from('pnl_statements').insert({
          team_id: teamId,
          round_number: round,
          revenue_mad: endowment.expectedRevenueMad * scale,
          treasury_end_mad: endowment.treasuryMad * scale,
          working_capital_mad: endowment.workingCapitalMad * scale,
        });

        await admin.from('team_round_state').insert({
          team_id: teamId,
          round_number: round,
          climat_social: endowment.climatSocial,
          ia_score: endowment.iaScore,
          headcount: Math.round(endowment.headcount * scale),
          talent_mix: endowment.expertShare,
          treasury_status: 'sain',
          consecutive_negative_treasury_rounds: 0,
        });

        // Les contrats amont et aval de l'exercice. Une entreprise qui a vendu
        // pendant deux ans a des fournisseurs et un réseau : les omettre
        // faisait produire sans acheter et vendre sans distribuer.
        const inherited = buildInheritedContracts(
          actorsByArchetype.get(startingSector) ?? {
            suppliers: new Map(),
            distributors: new Map(),
          },
          endowment.capacityUnits * scale,
        );

        if (inherited.procurement.length > 0) {
          await admin.from('procurement_contracts').insert(
            inherited.procurement.map((c) => ({
              team_id: teamId,
              das_id: startingDasId,
              round_number: round,
              supplier_id: c.supplierId,
              committed_volume: c.committedVolume,
            })),
          );
        }

        if (inherited.distribution.length > 0) {
          await admin.from('distribution_contracts').insert(
            inherited.distribution.map((c) => ({
              team_id: teamId,
              das_id: startingDasId,
              round_number: round,
              distributor_id: c.distributorId,
              volume_share: c.volumeShare,
            })),
          );
        }
      }

      // L'organisation héritée du dernier exercice clos. Elle PERSISTE tant que
      // l'équipe ne la change pas : ne rien faire, c'est conserver la structure
      // de l'an dernier.
      await seedOrganisation(
        admin, teamId, startingDasId, 0,
        endowment.headcount,
        // Budget de fonctionnement de référence : la marge brute attendue,
        // c'est-à-dire ce qu'il y a effectivement à répartir entre directions.
        endowment.expectedRevenueMad * 0.30,
      );

      await admin.from('financial_budgets').insert({
        team_id: teamId,
        round_number: 0,
        treasury_start_mad: endowment.treasuryMad,
        equity_mad: endowment.equityMad,
        debt_outstanding_mad: endowment.debtMad,
      });

      await admin.from('hr_metrics').insert({
        team_id: teamId,
        round_number: 0,
        headcount_start: endowment.headcount,
        avg_salary_brut_mad: endowment.avgSalaryMad,
      });

      teams.push({ teamId, name: teamName, poolName: pool.name, joinCode });
    }
  }

  const { count: actorCount } = await admin
    .from('ecosystem_actors')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId);

  return {
    sessionId,
    sessionJoinCode: session.join_code as string,
    teams,
    dasCount: catalog.length,
    actorCount: actorCount ?? 0,
  };
}
