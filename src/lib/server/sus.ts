import 'server-only';

import { createAdminClient } from '@/lib/supabase/server';
import type { SusAggregate } from '@/lib/sus-types';

// Les formes vivent dans un module client-safe ; elles restent réexportées ici
// pour les appelants serveur.
export type { SusAggregate, SusResponseRow } from '@/lib/sus-types';

/**
 * Score SUS individuel : sans valeur isolée en méthodologie SUS (Brooke,
 * 1996) — seule la moyenne d'un panel l'est. On la recalcule à chaque lecture
 * plutôt que de la stocker : dix réponses ne justifient pas une table dérivée.
 */
export async function loadSusAggregate(sessionId: string): Promise<SusAggregate> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('sus_responses')
    .select('participant_label, score, comment, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false });

  const rows = data ?? [];
  const scores = rows.map((r) => Number(r.score));
  const average = scores.length
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : null;

  return {
    count: rows.length,
    average,
    responses: rows.map((r) => ({
      label: String(r.participant_label),
      score: Number(r.score),
      comment: String(r.comment ?? ''),
      createdAt: String(r.created_at),
    })),
  };
}
