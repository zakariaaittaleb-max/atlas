'use server';

import 'server-only';

import { z } from 'zod';

import { requireTeam } from '@/lib/dal';
import { loadSusAggregate, type SusAggregate } from '@/lib/server/sus';
import { createAdminClient } from '@/lib/supabase/server';

export type SubmitSusResult =
  | { ok: true; score: number; aggregate: SusAggregate }
  | { ok: false; error: string };

const Submission = z.object({
  label: z.string().trim().max(100).default(''),
  answers: z.array(z.number().int().min(1).max(5)).length(10),
  comment: z.string().trim().max(2000).default(''),
});

// Items pairs (index impair, 0-based) formulés négativement — inversion
// standard de l'échelle SUS (Brooke, 1996) avant sommation.
const NEGATIVE = [false, true, false, true, false, true, false, true, false, true];

function scoreOf(answers: number[]): number {
  let total = 0;
  answers.forEach((v, i) => { total += NEGATIVE[i] ? 5 - v : v - 1; });
  return Math.round(total * 2.5);
}

export async function submitSusResponseAction(input: unknown): Promise<SubmitSusResult> {
  const team = await requireTeam();

  const parsed = Submission.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Réponse incomplète : les 10 questions sont requises.' };

  const score = scoreOf(parsed.data.answers);
  const admin = createAdminClient();

  const { error } = await admin.from('sus_responses').insert({
    session_id: team.sessionId,
    team_id: team.teamId,
    user_id: team.userId,
    participant_label: parsed.data.label || 'Anonyme',
    score,
    answers: parsed.data.answers,
    comment: parsed.data.comment,
  });

  if (error) {
    if (error.code === '23505') {
      // Déjà répondu : pas une erreur pour l'utilisateur, on lui montre
      // simplement l'agrégat courant du panel.
      const aggregate = await loadSusAggregate(team.sessionId);
      return { ok: true, score, aggregate };
    }
    return { ok: false, error: 'Envoi impossible : ' + error.message };
  }

  const aggregate = await loadSusAggregate(team.sessionId);
  return { ok: true, score, aggregate };
}
