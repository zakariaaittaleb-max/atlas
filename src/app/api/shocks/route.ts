/**
 * Réponse d'une équipe à une carte de crise (War Room).
 *
 * L'équipe RÉDIGE ce qu'elle fait et engage un budget. Les quatre postures
 * tabulées — ignorer, atténuer, absorber, retourner — ont disparu : une crise
 * se jouait au clic, et la meilleure réponse se devinait sans jamais l'écrire.
 *
 * Cette route n'interprète RIEN du texte. Elle l'enregistre, et le facilitateur
 * arbitrera après l'avoir lu. Ne rien écrire reste une réponse : l'événement
 * s'applique alors tel qu'il est annoncé.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { decisionsAreOpen, getRoundState, getTeamContext } from '@/lib/dal';
import { isOn } from '@/lib/modules-state';
import { loadEnabledModules } from '@/lib/server/modules';
import { createAdminClient } from '@/lib/supabase/server';

const Request = z.object({
  shockId: z.string().uuid(),
  // Assez long pour un plan d'action argumenté, assez court pour rester lisible
  // par un facilitateur qui en parcourt un par équipe, en salle.
  plan: z.string().trim().max(2000),
  budgetMad: z.number().finite().min(0),
});

export async function POST(request: Request) {
  const team = await getTeamContext();
  if (!team) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });

  const parsed = Request.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }

  const round = await getRoundState(team.sessionId);
  if (!decisionsAreOpen(round?.status as string)) {
    return NextResponse.json(
      { error: 'Le tour est verrouillé : la War Room est close.' },
      { status: 409 },
    );
  }

  const roundNumber = (round?.current_round as number) ?? 0;
  const admin = createAdminClient();

  const modules = await loadEnabledModules(team.sessionId);
  if (!isOn(modules, 'warroom.events')) {
    return NextResponse.json(
      { error: 'La War Room n’est pas ouverte sur cette session.' },
      { status: 403 },
    );
  }

  // Le choc doit appartenir à la session de l'équipe et être déjà survenu.
  const { data: shock } = await admin
    .from('market_shocks')
    .select('id, session_id, round_number')
    .eq('id', parsed.data.shockId)
    .maybeSingle();

  if (!shock || shock.session_id !== team.sessionId || Number(shock.round_number) > roundNumber) {
    return NextResponse.json({ error: 'Carte introuvable.' }, { status: 404 });
  }

  const { error } = await admin.from('shock_responses').upsert(
    {
      shock_id: parsed.data.shockId,
      team_id: team.teamId,
      round_number: roundNumber,
      plan: parsed.data.plan,
      // Le budget engagé est débité que la carte s'avère bénigne ou non :
      // c'est le prix de l'assurance, et c'est l'arbitrage de l'équipe.
      cost_mad: parsed.data.budgetMad,
    },
    { onConflict: 'shock_id,team_id' },
  );

  if (error) {
    return NextResponse.json({ error: `Réponse refusée : ${error.message}` }, { status: 500 });
  }

  await admin.from('decisions_log').insert({
    team_id: team.teamId, round_number: roundNumber, decision_type: 'reponse_crise',
    payload: { shockId: parsed.data.shockId, budgetMad: parsed.data.budgetMad },
    decided_by: team.userId,
  });

  return NextResponse.json({ ok: true });
}
