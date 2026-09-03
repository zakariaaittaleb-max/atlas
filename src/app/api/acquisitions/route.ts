/**
 * Marché des acquisitions — entrer dans un DAS en rachetant une entreprise.
 *
 * Le marché de cession permettait de VENDRE un domaine qu'on exploitait déjà.
 * Il devient aussi un marché d'ACHAT : une équipe peut racheter une entreprise
 * opérant dans un domaine où elle n'est pas présente, et y entrer d'un coup
 * avec une part de marché constituée.
 *
 * ── L'ARBITRAGE QUE CELA CRÉE ──────────────────────────────────────────────
 * La barrière VRIO d'un DAS pénalise l'entrée tardive : arriver au tour 4 sur
 * un marché déjà structuré coûte cher en organique. L'acquisition est
 * précisément le moyen de la contourner — mais on hérite d'une entreprise qu'on
 * n'a pas construite, et sans budget d'intégration jusqu'à 45 % de ce qu'on
 * vient de payer part en fumée.
 *
 * Croître vite et cher, ou lentement et bien : c'est la question, et elle n'a
 * pas de bonne réponse universelle.
 * ───────────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { decisionsAreOpen, getRoundState, getTeamContext } from '@/lib/dal';
import { createAdminClient } from '@/lib/supabase/server';

const Payload = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('bid'),
    targetActorId: z.string().uuid(),
    offerMad: z.number().positive().finite(),
    integrationBudgetMad: z.number().min(0).finite(),
  }),
  z.object({ action: z.literal('withdraw'), targetActorId: z.string().uuid() }),
]);

export async function POST(request: Request) {
  const team = await getTeamContext();
  if (!team) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
  if (team.isLiquidated) {
    return NextResponse.json({ error: 'Votre équipe est en liquidation.' }, { status: 409 });
  }

  const parsed = Payload.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }

  const round = await getRoundState(team.sessionId);
  if (!decisionsAreOpen(round?.status as string)) {
    return NextResponse.json(
      { error: 'Le tour est verrouillé : le marché des acquisitions est clos.' },
      { status: 409 },
    );
  }

  const roundNumber = (round?.current_round as number) ?? 0;
  const admin = createAdminClient();
  const body = parsed.data;

  if (body.action === 'withdraw') {
    await admin.from('acquisition_offers')
      .update({ status: 'withdrawn' })
      .eq('bidder_team_id', team.teamId)
      .eq('target_actor_id', body.targetActorId)
      .eq('round_number', roundNumber);
    return NextResponse.json({ ok: true, withdrawn: true });
  }

  // La cible doit exister, appartenir à la session, et être acquérable.
  const { data: target } = await admin
    .from('ecosystem_actors')
    .select('id, session_id, das_id, actor_type, name')
    .eq('id', body.targetActorId)
    .maybeSingle();

  if (!target || target.session_id !== team.sessionId || target.actor_type !== 'cible_acquisition') {
    return NextResponse.json({ error: 'Cible introuvable.' }, { status: 404 });
  }

  // On ne rachète pas une entreprise d'un domaine qu'on exploite déjà : ce
  // serait une consolidation, pas une entrée. Le mécanisme prévu pour cela est
  // le rachat d'un DAS mis en vente par une équipe concurrente.
  const { data: existing } = await admin
    .from('team_units')
    .select('id')
    .eq('team_id', team.teamId).eq('das_id', target.das_id)
    .in('status', ['active', 'listed_for_sale'])
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      {
        error: 'Vous exploitez déjà ce domaine. Pour vous renforcer, visez un DAS mis en vente '
          + 'par une équipe concurrente.',
      },
      { status: 409 },
    );
  }

  const { error } = await admin.from('acquisition_offers').upsert(
    {
      session_id: team.sessionId,
      bidder_team_id: team.teamId,
      target_actor_id: body.targetActorId,
      das_id: target.das_id,
      round_number: roundNumber,
      offer_mad: body.offerMad,
      integration_budget_mad: body.integrationBudgetMad,
      status: 'sealed',
    },
    { onConflict: 'bidder_team_id,target_actor_id,round_number' },
  );

  if (error) {
    return NextResponse.json({ error: `Offre refusée : ${error.message}` }, { status: 500 });
  }

  await admin.from('decisions_log').insert({
    team_id: team.teamId, round_number: roundNumber, decision_type: 'offre_acquisition',
    payload: {
      targetActorId: body.targetActorId, dasId: target.das_id,
      offerMad: body.offerMad, integrationBudgetMad: body.integrationBudgetMad,
    },
    decided_by: team.userId,
  });

  return NextResponse.json({ ok: true });
}
