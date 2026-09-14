import 'server-only';

import { notFound } from 'next/navigation';

import { getFacilitatorContext } from '@/lib/dal';
import { createAdminClient } from '@/lib/supabase/server';

import { ProjectorView, type PoolStanding } from './projector-view';

export const metadata = { title: 'Atlas — Projecteur' };
export const dynamic = 'force-dynamic';

export default async function ProjectorPage({
  params,
}: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;

  // Réservé au facilitateur : cet écran est projeté au mur, il ne doit jamais
  // être atteignable par une équipe qui devinerait l'URL.
  const context = await getFacilitatorContext(sessionId);
  if (!context) notFound();

  const admin = createAdminClient();

  const { data: session } = await admin
    .from('game_sessions').select('status, current_round, planned_rounds, visual_style, projector_scene, projector_shock_id, round_soft_deadline').eq('id', sessionId).maybeSingle();
  const roundNumber = Number(session?.current_round ?? 0);

  const [{ data: teams }, { data: das }, { data: metrics }, { data: previous }, { data: summaries }, { data: units }] =
    await Promise.all([
      admin.from('teams').select('id, name, pool_id, is_liquidated').eq('session_id', sessionId),
      admin.from('strategic_units').select('id, name').eq('session_id', sessionId),
      admin.from('team_das_round_metrics').select('team_id, das_id, market_share_pct, revenue_mad, competitiveness_score').eq('round_number', roundNumber),
      admin.from('team_das_round_metrics').select('team_id, das_id, market_share_pct').eq('round_number', roundNumber - 1),
      admin.from('pool_round_summary').select('das_id, unserved_share, installed_share').eq('round_number', roundNumber),
      // La marque que chaque équipe a donnée à SON domaine : c'est elle qu'on
      // compare entre concurrents, pas le nom de l'équipe (migration 0033).
      admin.from('team_units').select('team_id, das_id, brand_name'),
    ]);

  const teamById = new Map((teams ?? []).map((t) => [String(t.id), t]));
  const dasName = new Map((das ?? []).map((d) => [String(d.id), String(d.name)]));
  const previousShare = new Map(
    (previous ?? []).map((p) => [`${String(p.team_id)}:${String(p.das_id)}`, Number(p.market_share_pct ?? 0)]),
  );
  const brandByTeamDas = new Map(
    (units ?? [])
      .filter((u) => u.brand_name)
      .map((u) => [`${String(u.team_id)}:${String(u.das_id)}`, String(u.brand_name)]),
  );

  // Regroupement par DAS : c'est le marché, donc l'unité de classement.
  const byDas = new Map<string, PoolStanding>();
  for (const m of metrics ?? []) {
    const dasId = String(m.das_id);
    const team = teamById.get(String(m.team_id));
    if (!team) continue;

    const summary = (summaries ?? []).find((s) => String(s.das_id) === dasId);
    const entry = byDas.get(dasId) ?? {
      dasId,
      dasName: dasName.get(dasId) ?? '—',
      unservedShare: Number(summary?.unserved_share ?? 0),
      // Les entreprises installées tiennent une part du marché sans figurer au
      // classement : sans cette ligne, la colonne des parts ne somme pas à
      // 100 % et l'écran projeté au mur a l'air faux.
      installedShare: Number(summary?.installed_share ?? 0),
      rows: [],
    };

    const key = `${String(m.team_id)}:${dasId}`;
    entry.rows.push({
      teamId: String(m.team_id),
      teamName: String(team.name),
      brandName: brandByTeamDas.get(key) ?? null,
      isLiquidated: Boolean(team.is_liquidated),
      marketSharePct: Number(m.market_share_pct ?? 0),
      revenueMad: Number(m.revenue_mad ?? 0),
      competitivenessScore: Number(m.competitiveness_score ?? 0),
      deltaPts: previousShare.has(key)
        ? Number(m.market_share_pct ?? 0) - (previousShare.get(key) ?? 0)
        : null,
    });
    byDas.set(dasId, entry);
  }

  for (const entry of byDas.values()) {
    entry.rows.sort((a, b) => b.marketSharePct - a.marketSharePct);
  }

  // ── Ce que le facilitateur a choisi de projeter ───────────────────────────
  const teamIds = (teams ?? []).map((t) => String(t.id));
  const shockColumns = 'id, card_key, das_id, rounds_remaining';
  const [{ count: submitted }, { data: shockRow }] = await Promise.all([
    admin
      .from('team_round_submissions')
      .select('team_id', { count: 'exact', head: true })
      .in('team_id', teamIds.length ? teamIds : ['00000000-0000-0000-0000-000000000000'])
      .eq('round_number', roundNumber),
    session?.projector_shock_id
      ? admin.from('market_shocks').select(shockColumns).eq('id', String(session.projector_shock_id)).maybeSingle()
      : admin.from('market_shocks').select(shockColumns).eq('session_id', sessionId)
          .order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const { data: card } = shockRow
    ? await admin.from('shock_cards').select('name, description, nature').eq('key', String(shockRow.card_key)).maybeSingle()
    : { data: null };

  return (
    <ProjectorView
      scene={String(session?.projector_scene ?? 'auto')}
      progress={{ submitted: submitted ?? 0, teams: (teams ?? []).filter((t) => !t.is_liquidated).length }}
      deadline={session?.round_soft_deadline ? String(session.round_soft_deadline) : null}
      shock={
        shockRow && card
          ? {
              name: String(card.name),
              description: String(card.description ?? ''),
              nature: String(card.nature),
              dasName: dasName.get(String(shockRow.das_id)) ?? '—',
              roundsRemaining: Number(shockRow.rounds_remaining),
            }
          : null
      }
      visualStyle={session?.visual_style === 'ludique' ? 'ludique' : 'corporate'}
      sessionId={sessionId}
      sessionName={context.sessionName}
      status={String(session?.status ?? 'draft')}
      roundNumber={roundNumber}
      plannedRounds={Number(session?.planned_rounds ?? 3)}
      standings={[...byDas.values()]}
    />
  );
}
