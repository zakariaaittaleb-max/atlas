import 'server-only';

import { notFound } from 'next/navigation';

import { joinTeamAsFacilitatorAction } from '@/app/actions/facilitator-play';
import { getFacilitatorContext } from '@/lib/dal';
import { dialsFor, type DifficultyDials } from '@/lib/engine/difficulty';
import { facilitatorCan } from '@/lib/facilitator-capabilities';
import { ALL_MODULE_FIELDS } from '@/lib/modules-catalog';
import {
  loadEnabledModules,
  loadFacilitatorCeiling,
  loadSavedPresets,
} from '@/lib/server/modules';
import { loadVariationScales } from '@/lib/server/variation-scales';
import { createAdminClient } from '@/lib/supabase/server';
import { assignTeamColors } from '@/lib/team-colors';

import { FacilitatorView, type TeamProgress } from './facilitator-view';
import {
  deleteModulePresetAction,
  saveModulePresetAction,
  setSessionModulesAction,
} from './modules-actions';
import { ModulesSection } from './modules-section';
import {
  resetVariationScalesAction,
  setVariationScalesAction,
} from './scales-actions';
import { ScalesSection } from './scales-section';
import { setShockImpactAction } from './warroom-actions';
import { WarRoomSection, type WarRoomShock } from './warroom-section';

export const metadata = { title: 'Atlas — Pilotage de session' };
export const dynamic = 'force-dynamic';

export default async function FacilitatorPage({
  params,
}: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;

  // Contrôle d'accès EXPLICITE : la suite lit avec la clé service_role, qui
  // contourne la RLS. C'est ici, et nulle part ailleurs, que se joue
  // l'autorisation.
  const context = await getFacilitatorContext(sessionId);
  if (!context) notFound();

  const admin = createAdminClient();

  const [{ data: session }, { data: teams }, { data: das }, { data: targets }, { data: cards }, { data: shocks }, { data: shockResponses }, { data: runs }] =
    await Promise.all([
      admin.from('game_sessions').select('*').eq('id', sessionId).maybeSingle(),
      admin.from('teams').select('id, name, pool_id, join_code, is_liquidated').eq('session_id', sessionId).order('name'),
      admin.from('strategic_units').select('id, name, sector_key').eq('session_id', sessionId).order('name'),
      // Quels domaines sont OUVERTS à l'acquisition. On lit les cibles plutôt
      // qu'un drapeau sur le DAS : c'est la cible qu'on ouvre, et un domaine
      // sans cible n'est pas acquérable même si on le déclarait ouvert.
      admin.from('ecosystem_actors').select('das_id, market_open')
        .eq('session_id', sessionId).eq('actor_type', 'cible_acquisition'),
      // Le catalogue commun, plus les cartes composées pour CETTE session. Sans
      // filtre, un facilitateur voyait — et pouvait déclencher — les cartes
      // composées par un collègue dans une autre partie.
      admin.from('shock_cards')
        .select('key, name, description, nature, pestel_dimension, target_sectors, duration_rounds, source_reference, effects, session_id')
        .or(`session_id.is.null,session_id.eq.${sessionId}`)
        .order('pestel_dimension'),
      admin.from('market_shocks').select('id, card_key, das_id, round_number, rounds_remaining').eq('session_id', sessionId).order('round_number', { ascending: false }),
      // Les plans des équipes : lecture par la clé de service, `shock_responses`
      // n'étant lisible que par l'équipe qui la possède. L'autorisation a été
      // vérifiée plus haut par `getFacilitatorContext`.
      admin.from('shock_responses').select('shock_id, team_id, plan, cost_mad, impact_pct, reviewed_at'),
      admin.from('resolution_runs').select('round_number, status, duration_ms, error_message, invariant_failures').eq('session_id', sessionId).order('started_at', { ascending: false }).limit(5),
    ]);

  const roundNumber = Number(session?.current_round ?? 0);
  const teamIds = (teams ?? []).map((t) => String(t.id));
  const ids = teamIds.length ? teamIds : ['00000000-0000-0000-0000-000000000000'];

  // Avancement : quelles décisions chaque équipe a-t-elle déjà saisies ?
  const [{ data: strategies }, { data: decisions }, { data: budgets }, { data: distribution }, { data: members }, { data: pnls }, { data: states }] =
    await Promise.all([
      admin.from('team_round_strategy').select('team_id').in('team_id', ids).eq('round_number', roundNumber),
      admin.from('das_decisions').select('team_id, das_id').in('team_id', ids).eq('round_number', roundNumber),
      admin.from('financial_budgets').select('team_id').in('team_id', ids).eq('round_number', roundNumber),
      admin.from('distribution_contracts').select('team_id, das_id').in('team_id', ids).eq('round_number', roundNumber),
      admin.from('team_members').select('team_id, user_id, is_facilitator').in('team_id', ids),
      admin.from('pnl_statements').select('team_id, treasury_end_mad').in('team_id', ids).eq('round_number', roundNumber - 1),
      admin.from('team_round_state').select('team_id, treasury_status, ia_score').in('team_id', ids).eq('round_number', roundNumber - 1),
    ]);

  const unitsByTeam = new Map<string, number>();
  const { data: units } = await admin
    .from('team_units').select('team_id, das_id').in('team_id', ids).in('status', ['active', 'listed_for_sale']);
  for (const u of units ?? []) {
    unitsByTeam.set(String(u.team_id), (unitsByTeam.get(String(u.team_id)) ?? 0) + 1);
  }

  const count = <T extends { team_id: unknown }>(rows: T[] | null, teamId: string) =>
    (rows ?? []).filter((r) => String(r.team_id) === teamId).length;

  // Le code couleurs des groupes est le même partout : ici, sur le projecteur,
  // et dans la barre de présence d'un participant.
  const colours = new Map(
    assignTeamColors(
      (teams ?? []).map((t) => ({ id: String(t.id), name: String(t.name) })),
    ).map((t) => [t.id, t.color]),
  );

  // Modules : l'état résolu (ce que les équipes voient), le plafond posé par le
  // super-admin (ce que le facilitateur a le droit d'ouvrir), et ses préréglages.
  const [modules, ceiling, presets, scales] = await Promise.all([
    loadEnabledModules(sessionId),
    loadFacilitatorCeiling(context.userId),
    loadSavedPresets(context.userId),
    loadVariationScales(sessionId),
  ]);
  const ceilingState: Record<string, boolean> = {};
  for (const field of ALL_MODULE_FIELDS) {
    ceilingState[field.key] = ceiling.get(field.key) ?? true;
  }

  // Où le facilitateur joue-t-il en ce moment, si tant est qu'il joue ?
  const playingTeamId =
    (members ?? []).find(
      (m) => m.is_facilitator && String(m.user_id) === context.userId,
    )?.team_id ?? null;

  // Les soumissions du tour : une équipe complète n'est pas pour autant une
  // équipe qui a fini de débattre.
  const { data: submissions } = await admin
    .from('team_round_submissions')
    .select('team_id, submitted_at')
    .in('team_id', ids)
    .eq('round_number', roundNumber);

  const progress: TeamProgress[] = (teams ?? []).map((t) => {
    const teamId = String(t.id);
    const expectedDas = unitsByTeam.get(teamId) ?? 0;
    const state = (states ?? []).find((s) => String(s.team_id) === teamId);
    const colour = colours.get(teamId);

    return {
      teamId,
      name: String(t.name),
      joinCode: String(t.join_code),
      isLiquidated: Boolean(t.is_liquidated),
      colorHex: colour?.hex ?? 'var(--accent)',
      colorLabel: colour?.label ?? '',
      // Les étudiants rattachés, sans compter l'animateur lui-même : le
      // formateur veut savoir si la table est complète, pas se compter.
      memberCount: (members ?? []).filter(
        (m) => String(m.team_id) === teamId && !m.is_facilitator,
      ).length,
      hasCorporate: count(strategies, teamId) > 0,
      dasDone: count(decisions, teamId),
      dasExpected: expectedDas,
      distributionDone: count(distribution, teamId),
      hasBudget: count(budgets, teamId) > 0,
      treasuryMad: Number(
        (pnls ?? []).find((p) => String(p.team_id) === teamId)?.treasury_end_mad ?? 0,
      ),
      treasuryStatus: String(state?.treasury_status ?? 'sain'),
      iaScore: state?.ia_score === undefined ? null : Number(state.ia_score),
      submittedAt: (() => {
        const row = (submissions ?? []).find((s) => String(s.team_id) === teamId);
        return row?.submitted_at ? String(row.submitted_at) : null;
      })(),
    };
  });

  // ── War Room : une carte, puis une équipe par ligne ──────────────────────
  //
  // Deux leviers du catalogue sont PARTAGÉS par le pool et lus sans arbitrage :
  // la taille du marché et la redistribution de parts. Une carte qui n'agit que
  // sur eux frappe toutes les équipes pareil, quoi que le facilitateur règle.
  const POOL_LEVERS = new Set(['market_size_pct', 'share_redistribution_pts']);
  const hasTeamLevelLever = (effects: unknown): boolean =>
    Object.entries((effects ?? {}) as Record<string, unknown>)
      .some(([key, value]) => !POOL_LEVERS.has(key) && Number(value) !== 0);

  const cardByKey = new Map((cards ?? []).map((c) => [String(c.key), c]));
  const dasNameById = new Map((das ?? []).map((d) => [String(d.id), String(d.name)]));
  const responseRows = (shockResponses ?? []) as Record<string, unknown>[];

  const warRoomShocks: WarRoomShock[] = (shocks ?? [])
    .filter((s) => Number(s.rounds_remaining) > 0)
    .map((s) => {
      const card = cardByKey.get(String(s.card_key));
      const mine = responseRows.filter((r) => String(r.shock_id) === String(s.id));
      return {
        shockId: String(s.id),
        cardName: String(card?.name ?? s.card_key),
        nature: String(card?.nature ?? 'menace'),
        dasName: dasNameById.get(String(s.das_id)) ?? '—',
        roundNumber: Number(s.round_number),
        arbitrable: hasTeamLevelLever(card?.effects),
        // Toutes les équipes vivantes figurent, y compris celles qui n'ont rien
        // écrit : leur silence est une donnée pour le facilitateur.
        responses: progress
          .filter((t) => !t.isLiquidated)
          .map((t) => {
            const row = mine.find((r) => String(r.team_id) === t.teamId);
            return {
              teamId: t.teamId,
              teamName: t.name,
              plan: row?.plan ? String(row.plan) : null,
              budgetMad: Number(row?.cost_mad ?? 0),
              impactPct: Number(row?.impact_pct ?? 0),
              reviewed: Boolean(row?.reviewed_at),
            };
          }),
      };
    });

  return (
    <FacilitatorView
      sessionId={sessionId}
      sessionName={context.sessionName}
      joinCode={String(session?.join_code ?? '')}
      status={String(session?.status ?? 'draft')}
      roundNumber={roundNumber}
      plannedRounds={Number(session?.planned_rounds ?? 3)}
      maxRounds={Number(session?.max_rounds ?? 10)}
      teams={progress}
      canPlayInTeam={await facilitatorCan(context.userId, 'join_team_as_player')}
      playingTeamId={playingTeamId === null ? null : String(playingTeamId)}
      joinTeamAction={joinTeamAsFacilitatorAction}
      modulesSection={
        <ModulesSection
          sessionId={sessionId}
          modules={modules}
          ceiling={ceilingState}
          savedPresets={presets}
          setModulesAction={setSessionModulesAction}
          savePresetAction={saveModulePresetAction}
          deletePresetAction={deleteModulePresetAction}
        />
      }
      warRoomPending={warRoomShocks.reduce(
        (acc, s) => acc + s.responses.filter((r) => r.plan !== null && !r.reviewed).length,
        0,
      )}
      warRoomSection={
        <WarRoomSection
          sessionId={sessionId}
          shocks={warRoomShocks}
          setImpactAction={setShockImpactAction}
        />
      }
      scalesSection={
        <ScalesSection
          sessionId={sessionId}
          scales={scales}
          setScalesAction={setVariationScalesAction}
          resetScalesAction={resetVariationScalesAction}
        />
      }
      das={(das ?? []).map((d) => {
        const mine = (targets ?? []).filter((t) => String(t.das_id) === String(d.id));
        return {
          id: String(d.id),
          name: String(d.name),
          // « Ouvert » dès qu'une cible l'est : le geste du facilitateur porte
          // sur le domaine, et ouvre ses deux cibles ensemble.
          marketOpen: mine.some((t) => t.market_open === true),
          hasTargets: mine.length > 0,
        };
      })}
      difficulty={String(session?.difficulty ?? 'standard')}
      dials={dialsFor(
        (session?.difficulty ?? 'standard') as Parameters<typeof dialsFor>[0],
        (session?.difficulty_dials ?? {}) as Partial<DifficultyDials>,
      )}
      difficultyLocked={Boolean(session?.difficulty_locked)}
      sectors={[...new Set((das ?? []).map((d) => String(d.sector_key)))].filter(Boolean)}
      cards={(cards ?? []).map((c) => ({
        key: String(c.key), name: String(c.name), description: String(c.description),
        nature: String(c.nature), dimension: String(c.pestel_dimension),
        targetSectors: (c.target_sectors as string[]) ?? [],
        durationRounds: Number(c.duration_rounds),
        source: c.source_reference ? String(c.source_reference) : null,
        custom: Boolean(c.session_id),
      }))}
      activeShocks={(shocks ?? []).map((s) => ({
        id: String(s.id), cardKey: String(s.card_key), dasId: String(s.das_id),
        roundNumber: Number(s.round_number), roundsRemaining: Number(s.rounds_remaining),
      }))}
      runs={(runs ?? []).map((r) => ({
        roundNumber: Number(r.round_number), status: String(r.status),
        durationMs: r.duration_ms === null ? null : Number(r.duration_ms),
        errorMessage: r.error_message ? String(r.error_message) : null,
        invariantFailures: r.invariant_failures ?? null,
      }))}
    />
  );
}
