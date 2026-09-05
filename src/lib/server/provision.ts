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
  /**
   * Secteurs ouverts à cette session : l'univers de marché. Tous existent, avec
   * leur écosystème et leurs segments, qu'une équipe les exploite ou non.
   */
  sectorKeys: string[];
  /**
   * Le PORTEFEUILLE DE DÉPART, commun à toutes les équipes.
   *
   * Distinct de `sectorKeys`, et c'est tout l'objet de la séparation : un
   * secteur peut être ouvert sans appartenir à personne — c'est ce qui laisse
   * une réserve à acquérir. Auparavant seul `sectorKeys[0]` était attribué, si
   * bien qu'un facilitateur qui ouvrait quatre domaines en voyait ses équipes
   * n'en piloter qu'un, sans que rien à l'écran ne l'explique.
   *
   * Vide ou absent : on retombe sur le premier secteur ouvert, c'est-à-dire le
   * comportement historique.
   */
  startingSectorKeys?: string[];
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
        substitution_pressure: das.substitutionPressure,
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
  //
  // Le portefeuille de départ peut compter PLUSIEURS domaines. Chacun reçoit sa
  // propre dotation ; ce qui est de niveau équipe — trésorerie, capitaux,
  // effectif, dette — en est la SOMME, parce qu'un groupe qui exploite trois
  // métiers a bien trois fois des usines, des salariés et du besoin en fonds de
  // roulement. Ce qui est un indice — climat social, indice d'alignement — en
  // est la moyenne pondérée par l'effectif : additionner des scores sur 100
  // n'aurait aucun sens.
  const requestedStart = request.startingSectorKeys?.length
    ? request.startingSectorKeys
    : [request.sectorKeys[0]];

  // On n'attribue que des secteurs réellement provisionnés : un identifiant
  // fantaisiste doit échouer ici, pas produire une équipe sans DAS.
  const startingSectors = requestedStart.filter((k) => dasIdBySector.has(k));
  if (startingSectors.length === 0) {
    throw new Error(
      'Le portefeuille de départ ne contient aucun domaine ouvert à cette session.',
    );
  }

  const teams: ProvisionResult['teams'] = [];

  /**
   * Interrompt le provisionnement sur la première écriture refusée.
   *
   * Les inserts de dotation étaient lancés sans regarder leur résultat. Une
   * contrainte violée — un indice hors de ses bornes, par exemple — laissait
   * donc une table VIDE sans que rien ne le signale, et le défaut ne se voyait
   * qu'en séance, sur un écran affichant zéro. Mieux vaut un provisionnement
   * qui échoue bruyamment qu'une session à moitié dotée.
   */
  const fail = (result: { error: { message: string } | null }, what: string) => {
    if (result.error) {
      throw new Error(`Écriture impossible (${what}) : ${result.error.message}`);
    }
  };

  for (const pool of request.pools) {
    const { data: insertedPool, error: poolError } = await admin
      .from('market_pools')
      .insert({ session_id: sessionId, name: pool.name })
      .select('id')
      .single();

    if (poolError || !insertedPool) {
      throw new Error(`Création du pool ${pool.name} impossible : ${poolError?.message}`);
    }

    // UNE dotation par domaine pour tout le pool : les mêmes valeurs sont
    // écrites pour chaque équipe, jamais recalculées par équipe. La fonction ne
    // prend aucun identifiant d'équipe — l'asymétrie reste impossible par
    // construction (doc 03 §7).
    const perDas = startingSectors.map((sectorKey) => {
      const dasId = dasIdBySector.get(sectorKey)!;
      const das = catalog.find((d) => d.sectorKey === sectorKey)!;

      const dasParams: DasParameters = {
        dasId, sectorKey,
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

      return {
        sectorKey,
        dasId,
        das,
        endowment: computeEndowment(
          dasParams, das.baseMarketSizeMad, pool.teamNames.length, params,
        ),
      };
    });

    const totalHeadcount = perDas.reduce((a, e) => a + e.endowment.headcount, 0);
    const weightOf = (headcount: number) =>
      totalHeadcount > 0 ? headcount / totalHeadcount : 1 / perDas.length;

    // Agrégats de niveau équipe.
    const group = {
      treasuryMad: perDas.reduce((a, e) => a + e.endowment.treasuryMad, 0),
      workingCapitalMad: perDas.reduce((a, e) => a + e.endowment.workingCapitalMad, 0),
      revenueMad: perDas.reduce((a, e) => a + e.endowment.expectedRevenueMad, 0),
      equityMad: perDas.reduce((a, e) => a + e.endowment.equityMad, 0),
      debtMad: perDas.reduce((a, e) => a + e.endowment.debtMad, 0),
      headcount: totalHeadcount,
      climatSocial: perDas.reduce(
        (a, e) => a + e.endowment.climatSocial * weightOf(e.endowment.headcount), 0),
      iaScore: perDas.reduce(
        (a, e) => a + e.endowment.iaScore * weightOf(e.endowment.headcount), 0),
      expertShare: perDas.reduce(
        (a, e) => a + e.endowment.expertShare * weightOf(e.endowment.headcount), 0),
      avgSalaryMad: perDas.reduce(
        (a, e) => a + e.endowment.avgSalaryMad * weightOf(e.endowment.headcount), 0),
    };

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

      fail(
        await admin.from('team_units').insert(
          perDas.map((e) => ({
            team_id: teamId,
            das_id: e.dasId,
            launched_round: 0,
            status: 'active',
          })),
        ),
        `portefeuille de ${teamName}`,
      );

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
        // ── Ce qui est propre à chaque domaine ────────────────────────────
        fail(await admin.from('team_das_round_metrics').insert(
          perDas.map((e) => ({
            team_id: teamId,
            das_id: e.dasId,
            round_number: round,
            quality: e.endowment.quality,
            perceived_quality: e.endowment.quality,
            notoriety: e.endowment.notoriety,
            capacity_units: e.endowment.capacityUnits * scale,
            cumulative_volume: e.endowment.cumulativeVolumeUnits * scale,
            volume_sold: e.endowment.capacityUnits * scale,
            stockout_rate: 0,
            revenue_mad: e.endowment.expectedRevenueMad * scale,
            market_share_pct: 1 / pool.teamNames.length,
            market_size_mad: e.das.baseMarketSizeMad * scale,
            automation_level: 0,
          })),
        ), `indicateurs de ${teamName}`);

        // L'état social de DÉPART, domaine par domaine. C'est lui que l'écran
        // de saisie affiche comme « effectif en place » : sans ces lignes, une
        // équipe ouvrirait son premier tour devant un effectif de zéro et
        // croirait devoir recruter toute son entreprise.
        fail(await admin.from('das_hr_state').insert(
          perDas.map((e) => ({
            team_id: teamId,
            das_id: e.dasId,
            round_number: round,
            headcount: Math.round(e.endowment.headcount * scale),
            climat_social: e.endowment.climatSocial,
            productivity: e.endowment.headcount > 0
              ? (e.endowment.capacityUnits * scale) / (e.endowment.headcount * scale)
              : 0,
            standardisation_level: 0,
            automation_level: 0,
            turnover_rate: 0.08,
            payroll_mad:
              e.endowment.headcount * scale * e.endowment.avgSalaryMad * 12 * 1.2109,
            workload_index: 100,
            overstaffing_pct: 0,
            // `expertShare` est DÉJÀ une valeur sur 100 — `endowment.expert_share`
            // vaut 20, pas 0,2. La multiplier par cent produisait 2 000 et
            // violait `skill_index between 0 and 100` : l'insert échouait, et
            // sans contrôle d'erreur toute la table restait vide en silence.
            // C'est ce qui aurait affiché un effectif de zéro à l'écran.
            skill_index: e.endowment.expertShare,
            severance_paid_mad: 0,
            subsidies_mad: 0,
          })),
        ), `état social de ${teamName}`);

        // Les contrats amont et aval de l'exercice. Une entreprise qui a vendu
        // pendant deux ans a des fournisseurs et un réseau : les omettre
        // faisait produire sans acheter et vendre sans distribuer.
        for (const e of perDas) {
          const inherited = buildInheritedContracts(
            actorsByArchetype.get(e.sectorKey) ?? {
              suppliers: new Map(),
              distributors: new Map(),
            },
            e.endowment.capacityUnits * scale,
          );

          if (inherited.procurement.length > 0) {
            fail(await admin.from('procurement_contracts').insert(
              inherited.procurement.map((c) => ({
                team_id: teamId,
                das_id: e.dasId,
                round_number: round,
                supplier_id: c.supplierId,
                committed_volume: c.committedVolume,
              })),
            ), 'contrats d’approvisionnement');
          }

          if (inherited.distribution.length > 0) {
            fail(await admin.from('distribution_contracts').insert(
              inherited.distribution.map((c) => ({
                team_id: teamId,
                das_id: e.dasId,
                round_number: round,
                distributor_id: c.distributorId,
                volume_share: c.volumeShare,
              })),
            ), 'contrats de distribution');
          }
        }

        // ── Ce qui est de niveau ÉQUIPE : la somme, pas une ligne par DAS ──
        fail(await admin.from('pnl_statements').insert({
          team_id: teamId,
          round_number: round,
          revenue_mad: group.revenueMad * scale,
          treasury_end_mad: group.treasuryMad * scale,
          working_capital_mad: group.workingCapitalMad * scale,
        }), 'compte de résultat');

        fail(await admin.from('team_round_state').insert({
          team_id: teamId,
          round_number: round,
          climat_social: group.climatSocial,
          ia_score: group.iaScore,
          headcount: Math.round(group.headcount * scale),
          talent_mix: group.expertShare,
          treasury_status: 'sain',
          consecutive_negative_treasury_rounds: 0,
        }), 'état de tour');
      }

      // L'organisation héritée du dernier exercice clos, domaine par domaine.
      // Elle PERSISTE tant que l'équipe ne la change pas : ne rien faire, c'est
      // conserver la structure de l'an dernier.
      for (const e of perDas) {
        await seedOrganisation(
          admin, teamId, e.dasId, 0,
          e.endowment.headcount,
          // Budget de fonctionnement de référence : la marge brute attendue,
          // c'est-à-dire ce qu'il y a effectivement à répartir entre directions.
          e.endowment.expectedRevenueMad * 0.30,
        );
      }

      fail(await admin.from('financial_budgets').insert({
        team_id: teamId,
        round_number: 0,
        treasury_start_mad: group.treasuryMad,
        equity_mad: group.equityMad,
        debt_outstanding_mad: group.debtMad,
      }), 'budget');

      fail(await admin.from('hr_metrics').insert({
        team_id: teamId,
        round_number: 0,
        headcount_start: Math.round(group.headcount),
        avg_salary_brut_mad: group.avgSalaryMad,
      }), 'consolidation RH');

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
