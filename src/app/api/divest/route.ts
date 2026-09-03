/**
 * Marché de cession de DAS — quatre gestes.
 *
 *   `list`     mettre un DAS en vente. Le serveur calcule l'offre de l'acheteur
 *              non joueur (privée au vendeur) et la fiche publique.
 *   `bid`      déposer une offre SCELLÉE sur l'annonce d'un concurrent.
 *   `choice`   arrêter son choix de vendeur — en aveugle, avant le verrouillage.
 *   `withdraw` retirer son annonce.
 *
 * Tout passe par le serveur : une valorisation calculable dans le navigateur
 * serait une valorisation négociable, et une offre lisible avant le dénouement
 * ne serait plus scellée.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { decisionsAreOpen, getRoundState, getTeamContext } from '@/lib/dal';
import { computeListing, engineParamsFrom } from '@/lib/server/divest';
import { createAdminClient } from '@/lib/supabase/server';

const Request = z.discriminatedUnion('action', [
  z.object({ action: z.literal('list'), dasId: z.string().uuid() }),
  z.object({
    action: z.literal('bid'),
    listingId: z.string().uuid(),
    offerMad: z.number().positive().finite(),
    integrationBudgetMad: z.number().min(0).finite(),
  }),
  z.object({
    action: z.literal('choice'),
    listingId: z.string().uuid(),
    choice: z.enum(['npc', 'best_bid', 'withdraw']),
  }),
  z.object({ action: z.literal('withdraw'), listingId: z.string().uuid() }),
]);

export async function POST(request: Request) {
  const team = await getTeamContext();
  if (!team) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
  if (team.isLiquidated) {
    return NextResponse.json({ error: 'Votre équipe est en liquidation.' }, { status: 409 });
  }

  const parsed = Request.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }

  const round = await getRoundState(team.sessionId);
  if (!decisionsAreOpen(round?.status as string)) {
    return NextResponse.json(
      { error: 'Le tour est verrouillé : le marché de cession est clos.' },
      { status: 409 },
    );
  }

  const roundNumber = (round?.current_round as number) ?? 0;
  const admin = createAdminClient();
  const body = parsed.data;

  if (body.action === 'list') {
    const { data: paramRows } = await admin
      .from('engine_parameters').select('key, value').eq('session_id', team.sessionId);

    let computed;
    try {
      computed = await computeListing(
        admin, engineParamsFrom(paramRows as { key: string; value: number }[] | null),
        team.sessionId, team.teamId, body.dasId, roundNumber,
      );
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Mise en vente impossible.' },
        { status: 409 },
      );
    }

    const { data, error } = await admin
      .from('das_listings')
      .upsert(
        {
          session_id: team.sessionId,
          seller_team_id: team.teamId,
          das_id: body.dasId,
          round_number: roundNumber,
          npc_offer_mad: computed.npcOfferMad,
          public_snapshot: computed.publicSnapshot,
          status: 'open',
          seller_choice: 'npc',
        },
        { onConflict: 'seller_team_id,das_id,round_number' },
      )
      .select('id, npc_offer_mad')
      .single();

    if (error) {
      return NextResponse.json({ error: `Mise en vente refusée : ${error.message}` }, { status: 500 });
    }

    await admin.from('team_units').update({ status: 'listed_for_sale' })
      .eq('team_id', team.teamId).eq('das_id', body.dasId);

    await admin.from('decisions_log').insert({
      team_id: team.teamId, round_number: roundNumber, decision_type: 'mise_en_vente_das',
      payload: { dasId: body.dasId, npcOfferMad: computed.npcOfferMad },
      decided_by: team.userId,
    });

    // L'offre NPC ne repart qu'au VENDEUR, et seulement à lui.
    return NextResponse.json({ listingId: data.id, npcOfferMad: data.npc_offer_mad });
  }

  if (body.action === 'bid') {
    // On vérifie que l'annonce est bien ouverte, dans le pool, et pas la sienne.
    const { data: listing } = await admin
      .from('das_listings')
      .select('id, seller_team_id, status, teams!das_listings_seller_team_id_fkey(pool_id)')
      .eq('id', body.listingId)
      .maybeSingle();

    const sellerPool = (listing?.teams as unknown as { pool_id: string } | null)?.pool_id;

    if (!listing || listing.status !== 'open' || sellerPool !== team.poolId) {
      return NextResponse.json({ error: 'Annonce introuvable.' }, { status: 404 });
    }
    if (listing.seller_team_id === team.teamId) {
      return NextResponse.json(
        { error: 'Vous ne pouvez pas enchérir sur votre propre annonce.' },
        { status: 409 },
      );
    }

    const { error } = await admin.from('das_bids').upsert(
      {
        listing_id: body.listingId,
        bidder_team_id: team.teamId,
        round_number: roundNumber,
        offer_mad: body.offerMad,
        integration_budget_mad: body.integrationBudgetMad,
        status: 'sealed',
      },
      { onConflict: 'listing_id,bidder_team_id' },
    );

    if (error) {
      return NextResponse.json({ error: `Offre refusée : ${error.message}` }, { status: 500 });
    }

    await admin.from('decisions_log').insert({
      team_id: team.teamId, round_number: roundNumber, decision_type: 'offre_rachat_das',
      payload: { listingId: body.listingId, offerMad: body.offerMad,
                 integrationBudgetMad: body.integrationBudgetMad },
      decided_by: team.userId,
    });

    return NextResponse.json({ ok: true });
  }

  // `choice` et `withdraw` ne concernent que le vendeur.
  const { data: owned } = await admin
    .from('das_listings').select('id, das_id, seller_team_id')
    .eq('id', body.listingId).maybeSingle();

  if (!owned || owned.seller_team_id !== team.teamId) {
    return NextResponse.json({ error: 'Annonce introuvable.' }, { status: 404 });
  }

  if (body.action === 'choice') {
    await admin.from('das_listings')
      .update({ seller_choice: body.choice }).eq('id', body.listingId);
    return NextResponse.json({ ok: true, choice: body.choice });
  }

  await admin.from('das_listings')
    .update({ status: 'withdrawn', seller_choice: 'withdraw' }).eq('id', body.listingId);
  await admin.from('team_units').update({ status: 'active' })
    .eq('team_id', team.teamId).eq('das_id', owned.das_id);

  return NextResponse.json({ ok: true, withdrawn: true });
}
