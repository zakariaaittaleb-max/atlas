import { getRoundState, requireTeam } from '@/lib/dal';
import { createServerClient } from '@/lib/supabase/server';

import { RevelationView, type RevealRow } from './revelation-view';

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

  const { data: rows } = await supabase
    .from('pool_reveal')
    .select('*')
    .in('round_number', [currentRound - 1, currentRound])
    .order('market_share_pct', { ascending: false });

  const { data: summary } = await supabase
    .from('pool_round_summary')
    .select('das_id, unserved_share, market_size_mad')
    .eq('round_number', currentRound);

  const { data: ownAlignment } = await supabase
    .from('alignment_scores')
    .select('ia_final, stuck_in_the_middle, strategic_drift, drift_declared, drift_actual')
    .eq('team_id', team.teamId)
    .eq('round_number', currentRound)
    .maybeSingle();

  return (
    <RevelationView
      sessionId={team.sessionId}
      teamId={team.teamId}
      teamName={team.teamName}
      roundNumber={currentRound}
      status={status}
      rows={(rows ?? []) as RevealRow[]}
      unservedShare={Number(summary?.[0]?.unserved_share ?? 0)}
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
