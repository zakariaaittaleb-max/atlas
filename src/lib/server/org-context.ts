import 'server-only';

/**
 * Chargement du contexte d'organisation.
 *
 * L'organisation PERSISTE d'un exercice à l'autre : on lit donc tous les tours
 * jusqu'au tour courant et l'on retient le plus récent où l'équipe a
 * effectivement conçu quelque chose. Ne rien changer, c'est conserver la
 * structure de l'an dernier — pas repartir d'une page blanche.
 */

import { decisionsAreOpen, getRoundState, requireTeam } from '@/lib/dal';
import type {
  AxisRef, DasOrganisation, DirectionRef, KpiRef, OrgContext, PositionDraft,
} from '@/lib/org-types';
import { createServerClient } from '@/lib/supabase/server';

type Row = Record<string, unknown>;
const num = (v: unknown, d = 0) => (typeof v === 'number' ? v : Number(v ?? d) || d);
const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);
const bool = (v: unknown, d = false) => (typeof v === 'boolean' ? v : d);

export async function loadOrgContext(): Promise<OrgContext> {
  const team = await requireTeam();
  const round = await getRoundState(team.sessionId);
  const roundNumber = (round?.current_round as number) ?? 0;

  const supabase = await createServerClient();

  const [
    { data: directions }, { data: kpiCatalog }, { data: axisCatalog },
    { data: units }, { data: designs }, { data: axes },
    { data: budgets }, { data: kpis }, { data: positions }, { data: pnl },
    { data: state }, { data: strategy }, { data: directiveRows },
    { data: sharedRows }, { data: platformRows }, { data: dasSectors },
    { data: proximityRows }, { data: hrRows }, { data: hrStateRows },
  ] = await Promise.all([
    supabase.from('direction_catalog').select('*').order('display_order'),
    supabase.from('kpi_catalog').select('key, direction_key, name, description, unit, higher_is_better'),
    supabase.from('strategic_axis_catalog').select('key, name, description').order('name'),
    supabase.from('team_units')
      .select('das_id, strategic_units(id, name)')
      .eq('team_id', team.teamId).in('status', ['active', 'listed_for_sale']),
    supabase.from('das_org_design').select('*').eq('team_id', team.teamId).lte('round_number', roundNumber),
    supabase.from('das_strategic_axes').select('*').eq('team_id', team.teamId).lte('round_number', roundNumber),
    supabase.from('das_direction_budgets').select('*').eq('team_id', team.teamId).lte('round_number', roundNumber),
    supabase.from('das_direction_kpis').select('*').eq('team_id', team.teamId).lte('round_number', roundNumber),
    supabase.from('das_positions').select('*').eq('team_id', team.teamId).lte('round_number', roundNumber),
    supabase.from('pnl_statements').select('revenue_mad')
      .eq('team_id', team.teamId).eq('round_number', roundNumber - 1).maybeSingle(),
    supabase.from('team_round_state').select('headcount')
      .eq('team_id', team.teamId).eq('round_number', roundNumber - 1).maybeSingle(),
    // Les directives ARRÊTÉES AU GROUPE, affichées en lecture seule : sans
    // elles, déléguer ou non ses achats au siège se déciderait à l'aveugle.
    supabase.from('team_round_strategy').select('*')
      .eq('team_id', team.teamId).lte('round_number', roundNumber)
      .order('round_number', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('das_group_directives').select('*')
      .eq('team_id', team.teamId).lte('round_number', roundNumber),
    supabase.from('das_shared_resources').select('*')
      .eq('team_id', team.teamId).lte('round_number', roundNumber),
    supabase.from('shared_platforms').select('*')
      .eq('team_id', team.teamId).lte('round_number', roundNumber),
    supabase.from('strategic_units').select('id, sector_key').eq('session_id', team.sessionId),
    supabase.from('sector_proximity').select('sector_a, sector_b, proximity')
      .eq('session_id', team.sessionId),
    supabase.from('das_hr_decisions').select('*')
      .eq('team_id', team.teamId).eq('round_number', roundNumber),
    // L'état du dernier exercice CLOS : on décide en regardant d'où l'on part.
    //
    // `lte` et non `lt` : une ligne n'existe pour le tour courant qu'APRÈS sa
    // résolution. Pendant la saisie, `lte` rend donc le tour précédent ; une
    // fois le tour résolu, il rend le tour lui-même — ce qui est bien le
    // dernier exercice clos dans les deux cas. Avec `lt`, l'équipe relisait
    // l'avant-dernier exercice au moment précis où elle débriefait le dernier.
    supabase.from('das_hr_state').select('*')
      .eq('team_id', team.teamId).lte('round_number', roundNumber),
  ]);

  const sectorByDas = new Map(
    (dasSectors ?? []).map((d) => [str(d.id), str(d.sector_key)]),
  );
  const proximityMap = new Map(
    (proximityRows ?? []).map((r) => [`${str(r.sector_a)}|${str(r.sector_b)}`, num(r.proximity)]),
  );
  const proximity = (a: string, b: string) =>
    a === b ? 100 : proximityMap.get(`${a}|${b}`) ?? proximityMap.get(`${b}|${a}`) ?? 20;

  // Plateformes du tour le plus récent où le groupe en a déclaré.
  const platforms = (platformRows ?? []) as Row[];
  const latestPlatformRound = platforms.reduce(
    (acc, p) => Math.max(acc, num(p.round_number)), -Infinity,
  );

  const das: DasOrganisation[] = (units ?? []).map((u) => {
    const unit = u.strategic_units as unknown as { id: string; name: string } | null;
    const dasId = str(u.das_id);

    // Le tour effectif : le plus récent où une conception existe.
    const design = ((designs ?? []) as Row[])
      .filter((d) => str(d.das_id) === dasId)
      .sort((a, b) => num(b.round_number) - num(a.round_number))[0];

    const effectiveRound = design ? num(design.round_number) : null;
    const sameRound = <T extends Row>(rows: T[] | null) =>
      (rows ?? []).filter(
        (r) => str(r.das_id) === dasId && num(r.round_number) === effectiveRound,
      );

    return {
      dasId,
      dasName: unit?.name ?? 'DAS',
      inheritedFromRound: effectiveRound,
      structureType: str(design?.structure_type, 'fonctionnelle') as DasOrganisation['structureType'],
      delegationLevel: num(design?.delegation_level, 50),
      vision: design?.vision ? str(design.vision) : null,
      mission: design?.mission ? str(design.mission) : null,
      axisKeys: sameRound(axes as Row[] | null)
        .sort((a, b) => num(a.priority) - num(b.priority))
        .map((a) => str(a.axis_key)),
      budgets: sameRound(budgets as Row[] | null).map((b) => ({
        directionKey: str(b.direction_key), budgetMad: num(b.budget_mad),
      })),
      kpis: sameRound(kpis as Row[] | null).map((k) => ({
        directionKey: str(k.direction_key), kpiKey: str(k.kpi_key),
      })),
      positions: sameRound(positions as Row[] | null).map((p): PositionDraft => ({
        directionKey: str(p.direction_key),
        title: str(p.title),
        hierarchyLevel: num(p.hierarchy_level, 2),
        headcount: num(p.headcount),
        budgetMad: num(p.budget_mad),
        isKeyPosition: bool(p.is_key_position),
      })),
      directives: (() => {
        const d = ((directiveRows ?? []) as Row[])
          .filter((r) => str(r.das_id) === dasId)
          .sort((a, b) => num(b.round_number) - num(a.round_number))[0];
        return {
          portfolioRole: str(d?.portfolio_role, 'relais') as
            DasOrganisation['directives']['portfolioRole'],
          ansoffMovement: str(d?.ansoff_movement, 'penetration') as
            DasOrganisation['directives']['ansoffMovement'],
          hqPurchasing: bool(d?.hq_purchasing),
          hqIt: bool(d?.hq_it),
          hqRd: bool(d?.hq_rd),
          hqHr: bool(d?.hq_hr),
          hqFinance: bool(d?.hq_finance, true),
        };
      })(),
      hr: (() => {
        const h = ((hrRows ?? []) as Row[]).find((r) => str(r.das_id) === dasId);
        return {
          hireOperateurs: num(h?.hire_operateurs),
          hireTechniciens: num(h?.hire_techniciens),
          hireExperts: num(h?.hire_experts),
          hireCadres: num(h?.hire_cadres),
          layoffs: num(h?.layoffs),
          internalTransfersIn: num(h?.internal_transfers_in),
          avgSalaryBrutMad: num(h?.avg_salary_brut_mad, 5800),
          trainingBudgetMad: num(h?.training_budget_mad),
          trainingFocus: str(h?.training_focus, 'technique') as
            DasOrganisation['hr']['trainingFocus'],
          claimOfppt: bool(h?.claim_ofppt),
          claimGiac: bool(h?.claim_giac),
          orderSkillsAudit: bool(h?.order_skills_audit),
          restructuring: str(h?.restructuring, 'aucune') as
            DasOrganisation['hr']['restructuring'],
        };
      })(),
      hrState: (() => {
        const st = ((hrStateRows ?? []) as Row[])
          .filter((r) => str(r.das_id) === dasId)
          .sort((a, b) => num(b.round_number) - num(a.round_number))[0];
        if (!st) return null;
        return {
          headcount: num(st.headcount),
          climatSocial: num(st.climat_social),
          productivity: num(st.productivity),
          standardisationLevel: num(st.standardisation_level),
          automationLevel: num(st.automation_level),
          turnoverRate: num(st.turnover_rate),
          payrollMad: num(st.payroll_mad),
          workloadIndex: num(st.workload_index),
          skillIndex: num(st.skill_index),
          // Recalculé côté écran plutôt que persisté : c'est une conséquence
          // directe de la standardisation atteinte, pas un état à mémoriser.
          safeReduction: Math.floor(
            num(st.headcount) * 0.18 *
            ((num(st.standardisation_level) + num(st.automation_level)) / 200),
          ),
        };
      })(),
      sharedOffers: platforms
        .filter(
          (p) =>
            num(p.round_number) === latestPlatformRound &&
            ((p.das_ids as string[] | null) ?? []).includes(dasId),
        )
        .map((p) => {
          const others = ((p.das_ids as string[] | null) ?? []).filter((id) => id !== dasId);
          const mySector = sectorByDas.get(dasId) ?? '';
          const prox = others.length === 0
            ? 100
            : others.reduce(
                (acc, id) => acc + proximity(mySector, sectorByDas.get(id) ?? ''), 0,
              ) / others.length;

          const key = str(p.platform_type);
          const mine = ((sharedRows ?? []) as Row[])
            .filter((r) => str(r.das_id) === dasId && str(r.resource_key) === key)
            .sort((a, b) => num(b.round_number) - num(a.round_number))[0];

          return {
            resourceKey: key,
            label: str(p.name, key),
            proximity: prox,
            adoptionLevel: num(mine?.adoption_level),
            standardised: bool(mine?.standardised),
          };
        }),
    };
  });

  return {
    roundNumber,
    decisionsOpen: decisionsAreOpen(round?.status as string),
    teamName: team.teamName,
    group: strategy
      ? {
          corporateStrategy: str(strategy.corporate_strategy) || null,
          centralPurchasing: bool(strategy.central_purchasing),
          centralIt: bool(strategy.central_it),
          centralRd: bool(strategy.central_rd),
          centralHr: bool(strategy.central_hr),
          centralFinance: bool(strategy.central_finance, true),
          value1: strategy.value_1 ? str(strategy.value_1) : null,
          value2: strategy.value_2 ? str(strategy.value_2) : null,
          vision: strategy.vision ? str(strategy.vision) : null,
          mission: strategy.mission ? str(strategy.mission) : null,
        }
      : null,
    directions: (directions ?? []).map((d): DirectionRef => ({
      key: str(d.key), name: str(d.name),
      description: str(d.description), displayOrder: num(d.display_order),
    })),
    kpis: (kpiCatalog ?? []).map((k): KpiRef => ({
      key: str(k.key), directionKey: str(k.direction_key), name: str(k.name),
      description: str(k.description), unit: str(k.unit),
      higherIsBetter: bool(k.higher_is_better, true),
    })),
    axes: (axisCatalog ?? []).map((a): AxisRef => ({
      key: str(a.key), name: str(a.name), description: str(a.description),
    })),
    das,
    // Assiette répartissable : la marge brute attendue, soit environ 30 % du CA
    // du dernier exercice. C'est ce qu'il y a réellement à distribuer entre
    // directions, pas le chiffre d'affaires lui-même.
    operatingBudgetMad: num(pnl?.revenue_mad) * 0.30,
    headcount: num(state?.headcount),
  };
}
