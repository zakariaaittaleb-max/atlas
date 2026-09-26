/**
 * Marché de cession de DAS — quatre gestes.
 *
 *   `list`     mettre un DAS en vente. Le serveur calcule l'offre de l'acheteur
 *              non joueur (privée au vendeur) et la fiche publique.
 *   `bid`      déposer une offre SCELLÉE sur l'annonce d'un concurrent.
 *   `accept`   conclure sur-le-champ : une offre reçue, ou celle du non-joueur.
 *   `withdraw` retirer son annonce.
 *
 * Tout passe par le serveur : une valorisation calculable dans le navigateur
 * serait une valorisation négociable, et une offre lisible avant le dénouement
 * ne serait plus scellée.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { decisionsAreOpen, getRoundState, getTeamContext } from '@/lib/dal';
import { isOn } from '@/lib/modules-state';
import { loadEnabledModules } from '@/lib/server/modules';
import { resolveTransfer } from '@/lib/engine/finance';
import { dealErrorMessage } from '@/lib/server/deals';
import { computeListing, engineParamsFrom } from '@/lib/server/divest';
import { createAdminClient } from '@/lib/supabase/server';

const Request = z.discriminatedUnion('action', [
  z.object({ action: z.literal('list'), dasId: z.string().uuid() }),
  z.object({
    action: z.literal('bid'),
    listingId: z.string().uuid(),
    offerMad: z.number().positive().finite().transform(Math.round),
    integrationBudgetMad: z.number().min(0).finite().transform(Math.round),
  }),
  // Conclure : céder à une concurrente (son offre) ou au non-joueur (`bidId` nul).
  z.object({
    action: z.literal('accept'),
    listingId: z.string().uuid(),
    bidId: z.string().uuid().nullable(),
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

  const modules = await loadEnabledModules(team.sessionId);
  const CESSION_MODULE: Record<typeof body.action, [string, string]> = {
    list: ['cession.sell', 'Mettre un domaine en vente'],
    withdraw: ['cession.sell', 'Mettre un domaine en vente'],
    accept: ['cession.sell', 'Mettre un domaine en vente'],
    bid: ['cession.bid', 'Enchérir sur un domaine mis en vente'],
  };
  const [moduleKey, what] = CESSION_MODULE[body.action];
  if (!isOn(modules, moduleKey)) {
    return NextResponse.json(
      { error: `« ${what} » n’est pas ouvert sur cette session.` },
      { status: 403 },
    );
  }

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
      .select('id, das_id, seller_team_id, status, teams!das_listings_seller_team_id_fkey(pool_id)')
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

    // Le vendeur peut accepter l'offre à tout moment, et le domaine change
    // alors de mains aussitôt : on ne rachète pas un métier qu'on exerce déjà.
    const { data: alreadyHeld } = await admin
      .from('team_units').select('id')
      .eq('team_id', team.teamId).eq('das_id', listing.das_id)
      .in('status', ['active', 'listed_for_sale']).maybeSingle();
    if (alreadyHeld) {
      return NextResponse.json(
        { error: 'Vous exploitez déjà ce domaine : rachetez plutôt une entreprise pour le consolider.' },
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

  // `accept` et `withdraw` ne concernent que le vendeur.
  const { data: owned } = await admin
    .from('das_listings').select('id, das_id, seller_team_id')
    .eq('id', body.listingId).maybeSingle();

  if (!owned || owned.seller_team_id !== team.teamId) {
    return NextResponse.json({ error: 'Annonce introuvable.' }, { status: 404 });
  }

  // Retirer, c'est retirer TOUT DE SUITE : l'annonce disparaît du marché, le
  // DAS redevient actif et les offres reçues tombent. Longtemps, « retirer »
  // n'était qu'un choix de vendeur appliqué à la résolution — le DAS restait
  // affiché « en vente » partout jusque-là, alors que l'équipe l'avait retiré.
  // Conclure : le domaine change de mains SUR-LE-CHAMP. L'acheteur le pilote
  // pour tout le tour, et le prix passe aussitôt d'une trésorerie à l'autre.
  // La perte d'intégration se calcule avec la règle du moteur, sur le dernier
  // exercice clos du domaine ; la transaction revérifie l'annonce et l'offre
  // sous verrou (migration 0050).
  if (body.action === 'accept') {
    const [{ data: listing }, { data: paramRows }, { data: metric }, bidResult] = await Promise.all([
      admin.from('das_listings').select('npc_offer_mad').eq('id', body.listingId).single(),
      admin.from('engine_parameters').select('key, value').eq('session_id', team.sessionId),
      admin.from('team_das_round_metrics').select('market_share_pct, notoriety')
        .eq('team_id', team.teamId).eq('das_id', owned.das_id).lt('round_number', roundNumber)
        .order('round_number', { ascending: false }).limit(1).maybeSingle(),
      body.bidId
        ? admin.from('das_bids').select('offer_mad, integration_budget_mad, status')
          .eq('id', body.bidId).eq('listing_id', body.listingId).maybeSingle()
        : null,
    ]);

    const bid = bidResult?.data ?? null;
    if (body.bidId && (!bid || bid.status !== 'sealed')) {
      return NextResponse.json({ error: dealErrorMessage('offre_introuvable') }, { status: 409 });
    }

    const priceMad = Number(bid ? bid.offer_mad : listing?.npc_offer_mad ?? 0);
    const transfer = resolveTransfer(
      priceMad,
      Number(bid?.integration_budget_mad ?? 0),
      Number(metric?.market_share_pct ?? 0),
      Number(metric?.notoriety ?? 50),
      engineParamsFrom(paramRows as { key: string; value: number }[] | null),
    );

    const { data: settled, error: settleError } = await admin.rpc('atlas_settle_listing', {
      p_listing_id: body.listingId,
      p_seller_team_id: team.teamId,
      p_bid_id: body.bidId,
      p_expected_price_mad: priceMad,
      p_value_loss_pct: transfer.valueLossPct,
      p_integration_ratio: transfer.integrationRatio,
      p_share_transferred: transfer.marketShareTransferred,
    });
    if (settleError) {
      return NextResponse.json({ error: dealErrorMessage(settleError.message) }, { status: 409 });
    }

    await admin.from('decisions_log').insert({
      team_id: team.teamId, round_number: roundNumber, decision_type: 'cession_das_conclue',
      payload: { listingId: body.listingId, dasId: owned.das_id, bidId: body.bidId, priceMad },
      decided_by: team.userId,
    });

    return NextResponse.json({ ok: true, settled });
  }

  const [{ error: listingError }, { error: unitError }] = await Promise.all([
    admin.from('das_listings')
      .update({ status: 'withdrawn', seller_choice: 'withdraw' }).eq('id', body.listingId),
    admin.from('team_units').update({ status: 'active' })
      .eq('team_id', team.teamId).eq('das_id', owned.das_id).eq('status', 'listed_for_sale'),
    admin.from('das_bids').update({ status: 'withdrawn' })
      .eq('listing_id', body.listingId).eq('status', 'sealed'),
  ]);

  if (listingError || unitError) {
    return NextResponse.json(
      { error: `Retrait refusé : ${(listingError ?? unitError)!.message}` },
      { status: 500 },
    );
  }

  await admin.from('decisions_log').insert({
    team_id: team.teamId, round_number: roundNumber, decision_type: 'retrait_vente_das',
    payload: { dasId: owned.das_id, listingId: body.listingId },
    decided_by: team.userId,
  });

  return NextResponse.json({ ok: true, withdrawn: true });
}
