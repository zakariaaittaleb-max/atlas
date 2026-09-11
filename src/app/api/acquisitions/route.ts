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
import { isOn } from '@/lib/modules-state';
import { loadEnabledModules } from '@/lib/server/modules';
import { createAdminClient } from '@/lib/supabase/server';

const Payload = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('bid'),
    targetActorId: z.string().uuid(),
    offerMad: z.number().positive().finite().transform(Math.round),
    integrationBudgetMad: z.number().min(0).finite().transform(Math.round),
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
    .select('id, session_id, das_id, actor_type, name, market_open, owner_team_id')
    .eq('id', body.targetActorId)
    .maybeSingle();

  const ACQUERABLE = ['cible_acquisition', 'fournisseur', 'distributeur'];

  if (!target || target.session_id !== team.sessionId
      || !ACQUERABLE.includes(String(target.actor_type))) {
    return NextResponse.json({ error: 'Cible introuvable.' }, { status: 404 });
  }

  // ── Deux opérations, deux conditions d'accès ───────────────────────────────
  //
  // ENTRER dans un domaine qu'on n'exploite pas se fait sur la réserve de
  // cibles, que le facilitateur ouvre quand il le décide.
  //
  // INTÉGRER un maillon de sa propre filière se fait sur les fournisseurs et
  // distributeurs du domaine — et suppose précisément qu'on l'exploite. C'est
  // aussi ce qui garantit que l'équipe peut acheter les données de la cible :
  // benchmark et due diligence sont des études de DAS.
  const operation =
    target.actor_type === 'fournisseur' ? 'integration_amont'
      : target.actor_type === 'distributeur' ? 'integration_aval'
        : 'entree_das';

  // Les deux opérations sont deux modules distincts : un formateur peut vouloir
  // faire jouer l'intégration verticale sans ouvrir la diversification.
  const modules = await loadEnabledModules(team.sessionId);
  const moduleKey = operation === 'entree_das' ? 'cession.acquire' : 'cession.integration';
  if (!isOn(modules, moduleKey)) {
    return NextResponse.json(
      {
        error:
          operation === 'entree_das'
            ? '« Entrer dans un nouveau domaine » n’est pas ouvert sur cette session.'
            : '« Intégrer sa filière » n’est pas ouvert sur cette session.',
      },
      { status: 403 },
    );
  }

  const { data: existing } = await admin
    .from('team_units')
    .select('id')
    .eq('team_id', team.teamId).eq('das_id', target.das_id)
    .in('status', ['active', 'listed_for_sale'])
    .maybeSingle();

  if (operation === 'entree_das') {
    // La vue publique filtre déjà les cibles fermées, mais ce Route Handler
    // écrit avec le client `service_role` — il CONTOURNE la RLS, et un POST
    // direct atteindrait sinon une cible que personne n'a mise sur le marché.
    if (!target.market_open) {
      return NextResponse.json(
        { error: 'Cette cible n’est pas ouverte à l’acquisition.' },
        { status: 409 },
      );
    }

    // Racheter dans un domaine qu'on exploite déjà est une CONSOLIDATION, et
    // c'est désormais permis : le référentiel financier le demande — « acquérir
    // un concurrent pour consolider un DAS existant », pour le pouvoir de
    // fixation des prix que procure une position renforcée.
    //
    // Le refus qui se trouvait ici renvoyait vers l'intégration de filière ou
    // le rachat d'un DAS mis en vente, qui sont deux autres opérations. Les
    // positions s'additionnent en persistance (migration 0037) au lieu de se
    // remplacer — sans quoi une équipe à 30 % qui rachetait un concurrent à
    // 8 % se serait retrouvée avec 8 %.
  } else {
    if (!existing) {
      return NextResponse.json(
        {
          error: 'On n’intègre pas une filière dans laquelle on n’est pas. Rachetez d’abord une '
            + 'entreprise du domaine, ou lancez-vous-y.',
        },
        { status: 409 },
      );
    }

    // Un maillon déjà détenu — par vous ou par une concurrente — n'est plus à
    // vendre : il appartient à un groupe, il n'est plus sur le marché.
    if (target.owner_team_id) {
      return NextResponse.json(
        {
          error: String(target.owner_team_id) === team.teamId
            ? 'Vous détenez déjà ce maillon.'
            : 'Ce maillon a été racheté par une autre équipe : il n’est plus indépendant.',
        },
        { status: 409 },
      );
    }
  }

  const { error } = await admin.from('acquisition_offers').upsert(
    {
      session_id: team.sessionId,
      bidder_team_id: team.teamId,
      target_actor_id: body.targetActorId,
      das_id: target.das_id,
      operation,
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
      targetActorId: body.targetActorId, dasId: target.das_id, operation,
      offerMad: body.offerMad, integrationBudgetMad: body.integrationBudgetMad,
    },
    decided_by: team.userId,
  });

  return NextResponse.json({ ok: true });
}
