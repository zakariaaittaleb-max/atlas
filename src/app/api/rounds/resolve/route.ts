/**
 * MOTEUR — résolution d'un tour.
 *
 * Exigence non négociable (doc 00 §11) : tout calcul de score, de part de
 * marché, de coût ou de trésorerie s'exécute ICI, côté serveur, avec la clé
 * `service_role`. Aucune équipe ne doit pouvoir déduire le résultat d'une
 * concurrente avant la révélation officielle — c'est la mécanique pédagogique
 * du choc de révélation qui en dépend, pas seulement la sécurité.
 *
 * Déroulé :
 *   1. vérifier que l'appelant anime bien cette session ;
 *   2. verrouiller TOUTES les équipes du pool dans une transaction unique ;
 *   3. assembler l'instantané, exécuter le moteur (fonction pure) ;
 *   4. si un invariant est violé → journaliser, ANNULER, ne rien écrire ;
 *   5. sinon, persister l'ensemble dans une transaction unique, dont la bascule
 *      d'état qui déclenche la révélation.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { resolveRound } from '@/lib/engine/resolve';
import { getUser } from '@/lib/dal';
import { loadResolutionSnapshot } from '@/lib/server/load-snapshot';
import { createAdminClient } from '@/lib/supabase/server';

// La résolution d'un pool de douze équipes doit rester bien en deçà.
export const maxDuration = 60;

const ResolveRequest = z.object({
  sessionId: z.string().uuid(),
});

export async function POST(request: Request) {
  const startedAt = Date.now();

  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
  }

  const parsed = ResolveRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }

  const { sessionId } = parsed.data;
  const admin = createAdminClient();

  // --- 1. Le facilitateur, et lui seul --------------------------------------
  const { data: session } = await admin
    .from('game_sessions')
    .select('id, facilitator_id, status, current_round')
    .eq('id', sessionId)
    .maybeSingle();

  if (!session || session.facilitator_id !== user.id) {
    return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
  }

  const roundNumber = session.current_round as number;

  // --- 2. Verrouillage synchronisé -----------------------------------------
  if (session.status === 'round_active') {
    const { error: lockError } = await admin.rpc('atlas_lock_round', {
      p_session_id: sessionId,
    });
    if (lockError) {
      return NextResponse.json(
        { error: `Verrouillage impossible : ${lockError.message}` },
        { status: 409 },
      );
    }
  } else if (session.status !== 'round_locked') {
    return NextResponse.json(
      { error: `Un tour au statut « ${session.status} » ne peut pas être résolu.` },
      { status: 409 },
    );
  }

  const { data: run } = await admin
    .from('resolution_runs')
    .insert({
      session_id: sessionId,
      round_number: roundNumber,
      status: 'running',
      triggered_by: user.id,
    })
    .select('id')
    .single();

  // Le niveau de difficulté se verrouille à la PREMIÈRE résolution. Le changer
  // ensuite rendrait les tours incomparables entre eux, ce qui est précisément
  // ce qu'une simulation multi-tours a pour objet de rendre lisible.
  await admin
    .from('game_sessions')
    .update({ status: 'round_resolving', difficulty_locked: true })
    .eq('id', sessionId);

  try {
    // --- 3. Instantané et calcul -------------------------------------------
    const { input, params, poolByTeam } = await loadResolutionSnapshot(
      admin,
      sessionId,
      roundNumber,
    );

    const result = resolveRound(input, params);

    // --- 4. Invariants : on préfère un tour à rejouer à un classement faux ---
    if (!result.ok) {
      await admin
        .from('resolution_runs')
        .update({
          status: 'failed',
          finished_at: new Date().toISOString(),
          duration_ms: Date.now() - startedAt,
          invariant_failures: result.invariantFailures,
        })
        .eq('id', run?.id);

      // On repasse en `round_locked` : le facilitateur peut corriger une saisie
      // puis relancer, sans que personne n'ait vu de résultat partiel.
      await admin.from('game_sessions').update({ status: 'round_locked' }).eq('id', sessionId);

      return NextResponse.json(
        {
          error: 'Résolution annulée : un invariant du moteur a été violé. Rien n’a été écrit.',
          invariantFailures: result.invariantFailures,
        },
        { status: 422 },
      );
    }

    // --- 5. Persistance atomique -------------------------------------------
    const payload = {
      session_id: sessionId,
      round_number: roundNumber,
      duration_ms: Date.now() - startedAt,
      triggered_by: user.id,
      das_metrics: result.dasMetrics,
      team_states: result.teams.map((t) => ({
        teamId: t.teamId,
        climatSocial: t.climatSocial,
        iaScore: t.alignment.iaFinal,
        headcount: t.headcount,
        centralisationIndex: t.centralisationIndex,
        sharedResourcesIndex: t.sharedResourcesIndex,
        portfolioRelatedness: t.portfolioRelatedness,
        verticalIntegration: t.verticalIntegration,
        talentMix: t.talentMix,
        synergySavingPct: t.synergySavingPct,
        coordinationCostPct: t.coordinationCostPct,
        marginPremiumPct: t.marginPremiumPct,
        consecutiveNegativeTreasuryRounds: t.consecutiveNegativeTreasuryRounds,
        treasuryStatus: t.treasuryStatus,
      })),
      pnls: result.teams.map((t) => ({ teamId: t.teamId, ...t.pnl })),
      alignments: result.teams.map((t) => ({
        teamId: t.teamId,
        sabGlobal: t.alignment.sabGlobal,
        sac: t.alignment.sac,
        sat: t.alignment.sat,
        iaRaw: t.alignment.iaRaw,
        iaFinal: t.alignment.iaFinal,
        stuckInTheMiddle: t.alignment.stuckInTheMiddle,
        strategicDrift: t.alignment.strategicDrift,
        driftDeclared: t.alignment.driftDeclared,
        driftActual: t.alignment.driftActual,
        penalties: t.alignment.penalties,
      })),
      // Détail axe par axe : c'est la matière première du rapport d'audit que
      // les équipes achètent au cabinet.
      alignment_axes: result.teams.flatMap((t) => [
        ...Object.entries(t.alignment.perDas).flatMap(([dasId, diagnosis]) =>
          diagnosis.details.map((d) => ({
            teamId: t.teamId,
            dasId,
            level: 'business',
            ...d,
          })),
        ),
        ...t.alignment.corporateDetails.map((d) => ({
          teamId: t.teamId,
          dasId: '',
          level: 'corporate',
          ...d,
        })),
      ]),
      treasury_alerts: result.teams
        .filter((t) => t.treasuryStatus !== 'sain')
        .map((t) => ({
          teamId: t.teamId,
          treasuryValueMad: t.pnl.treasuryEndMad,
          status: t.treasuryStatus,
        })),
      pool_summaries: result.poolSummaries.map((s) => ({
        poolId: s.poolId || poolByTeam.get(s.teamIds[0]) || null,
        dasId: s.dasId,
        marketSizeMad: s.marketSizeMad,
        unservedShare: s.unservedShare,
        installedShare: s.installedShare,
      })),
      transfers: result.transfers,
      acquisitions: result.acquisitions,
      // Conformité de chaque DAS aux directives du groupe. Par DAS, et non par
      // équipe : c'est tout l'objet de la distinction des deux étages.
      group_alignment: result.groupAlignment,
      // L'indice d'attractivité et ses composantes, écrits par
      // `atlas_persist_investors` sur les lignes que le cœur vient d'insérer.
      investors: result.teams.map((t) => ({
        teamId: t.teamId,
        score: t.investors.score,
        components: t.investors.components,
        payoutRatio: t.investors.payoutRatio,
        equityIssueCostPct:
          t.pnl.capitalRaisedMad > 0 ? t.pnl.equityIssueCostMad / t.pnl.capitalRaisedMad : null,
      })),
      // État RH par DAS : climat, charge, compétence, rotation, masse salariale.
      das_hr: result.dasHr,
    };

    const { error: persistError } = await admin.rpc('atlas_persist_resolution', {
      p_payload: payload,
    });

    if (persistError) {
      await admin
        .from('resolution_runs')
        .update({
          status: 'failed',
          finished_at: new Date().toISOString(),
          error_message: persistError.message,
        })
        .eq('id', run?.id);
      await admin.from('game_sessions').update({ status: 'round_locked' }).eq('id', sessionId);

      return NextResponse.json(
        { error: `Écriture refusée : ${persistError.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      roundNumber,
      durationMs: Date.now() - startedAt,
      teamsResolved: result.teams.length,
      // Aucun résultat détaillé n'est renvoyé ici : les équipes les liront via
      // la RLS, une fois le statut passé à `round_resolved`.
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue';

    await admin
      .from('resolution_runs')
      .update({
        status: 'failed',
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
        error_message: message,
      })
      .eq('id', run?.id);
    await admin.from('game_sessions').update({ status: 'round_locked' }).eq('id', sessionId);

    return NextResponse.json({ error: `Résolution interrompue : ${message}` }, { status: 500 });
  }
}
