import { getRoundState, requireTeam } from '@/lib/dal';
import { createServerClient } from '@/lib/supabase/server';

import { RevelationView, type DasSummaryRow, type RevealRow } from './revelation-view';

export const metadata = { title: 'Atlas — Révélation' };

// L'écran doit refléter l'état du tour à la seconde près : aucune mise en cache.
export const dynamic = 'force-dynamic';

export default async function RevelationPage() {
  const team = await requireTeam();
  const round = await getRoundState(team.sessionId);
  const currentRound = (round?.current_round as number) ?? 0;
  const status = (round?.status as string) ?? 'draft';

  // Lecture par le client ANONYME : la vue `pool_reveal` ne rend que les
  // colonnes qu'un concurrent a le droit de voir, et seulement pour son pool,
  // et seulement une fois le tour résolu. Le coût unitaire, l'automatisation et
  // le diagnostic d'alignement des autres équipes restent hors de portée.
  const supabase = await createServerClient();

  // Les deux tours sont chargés ensemble : le tour précédent sert de point de
  // départ à l'animation et de base aux écarts.
  const rounds = [currentRound - 1, currentRound];

  const [{ data: rows }, { data: summaries }, { data: das }, { data: ownAlignment }] =
    await Promise.all([
      supabase.from('pool_reveal').select('*').in('round_number', rounds),
      // `pool_round_summary` est filtrée par la RLS sur le pool de l'équipe :
      // on n'y lit donc que les domaines de son propre marché.
      supabase
        .from('pool_round_summary')
        .select('das_id, round_number, market_size_mad, unserved_share, installed_share')
        .in('round_number', rounds),
      supabase.from('strategic_units').select('id, name'),
      supabase
        .from('alignment_scores')
        .select('ia_final, stuck_in_the_middle, strategic_drift, drift_declared, drift_actual')
        .eq('team_id', team.teamId)
        .eq('round_number', currentRound)
        .maybeSingle(),
    ]);

  const dasName = new Map((das ?? []).map((d) => [String(d.id), String(d.name)]));

  return (
    <RevelationView
      sessionId={team.sessionId}
      teamId={team.teamId}
      teamName={team.teamName}
      roundNumber={currentRound}
      status={status}
      rows={(rows ?? []).map((r) => ({
        ...r,
        das_name: dasName.get(String(r.das_id)) ?? 'Domaine',
      })) as RevealRow[]}
      summaries={(summaries ?? []).map((s): DasSummaryRow => ({
        dasId: String(s.das_id),
        roundNumber: Number(s.round_number),
        marketSizeMad: Number(s.market_size_mad ?? 0),
        unservedShare: Number(s.unserved_share ?? 0),
        installedShare: Number(s.installed_share ?? 0),
      }))}
      ownDiagnosis={
        ownAlignment
          ? {
              ia: Number(ownAlignment.ia_final ?? 0),
              stuck: Boolean(ownAlignment.stuck_in_the_middle),
              drift: Boolean(ownAlignment.strategic_drift),
              declared: (ownAlignment.drift_declared as string) ?? null,
              actual: (ownAlignment.drift_actual as string) ?? null,
            }
          : null
      }
    />
  );
}
